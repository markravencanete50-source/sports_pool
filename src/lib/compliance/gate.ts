import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/log";
import { resolveGeo, hasTrustedEdge, type GeoLocation } from "./geo";
import {
  resolveJurisdiction,
  permitsPlay,
  type JurisdictionRule,
  type ResolvedJurisdiction,
} from "./jurisdiction";
import { meetsMinimumAge } from "./age";

/**
 * The compliance gate — one evaluator, called at every boundary where money or
 * eligibility is at stake.
 *
 * WHY ONE FUNCTION. Compliance controls fail when they are sprinkled across
 * call sites, because the next money path someone adds forgets one of them.
 * Routes call assertCompliance() and get a single verdict; adding a control
 * here covers every existing boundary at once.
 *
 * FAIL CLOSED. Every uncertainty resolves to "no". An unreadable compliance
 * row, an unknown location in production, a missing date of birth — all block.
 * The asymmetry is deliberate and is the whole point: wrongly refusing a
 * legitimate entry costs one annoyed customer, wrongly accepting an underage
 * or excluded player, or a player in a prohibited state, costs the licence.
 *
 * Order matters. Self-exclusion is checked before anything else, because a
 * user who has excluded themselves must be turned away even if every other
 * check would have passed and even if their account is otherwise perfect.
 */

export type MoneyAction = "deposit" | "payout" | "play";

export type ComplianceBlockCode =
  | "self_excluded"
  | "cooling_off"
  | "terms_not_accepted"
  | "age_unverified"
  | "under_age"
  | "jurisdiction_blocked"
  | "location_unknown"
  | "deposit_limit_reached"
  | "kyc_required"
  | "evaluation_failed";

export type ComplianceVerdict =
  | { allowed: true; jurisdiction: ResolvedJurisdiction; geo: GeoLocation }
  | {
      allowed: false;
      code: ComplianceBlockCode;
      message: string;
      status: number;
      detail?: Record<string, unknown>;
    };

interface ComplianceRow {
  date_of_birth: string | null;
  tos_accepted_at: string | null;
  tos_version: string | null;
  kyc_status: string;
  self_excluded_until: string | null;
  cooling_off_until: string | null;
  deposit_limit_daily: number | null;
  deposit_limit_weekly: number | null;
  deposit_limit_monthly: number | null;
}

interface SettingsRow {
  geo_enforcement_enabled: boolean;
  default_jurisdiction_status: "allowed" | "blocked" | "review";
  default_minimum_age: number;
  kyc_payout_threshold: number;
  current_tos_version: string;
}

/**
 * Evaluate every applicable control for this user and action.
 *
 * `amount` is required for deposits (it is what the limits are measured
 * against) and for payouts (it decides whether the KYC threshold is crossed).
 */
export async function evaluateCompliance(input: {
  userId: string;
  headers: Headers;
  action: MoneyAction;
  amount?: number;
}): Promise<ComplianceVerdict> {
  const { userId, headers, action, amount } = input;
  const geo = resolveGeo(headers);

  try {
    const admin = createAdminClient();

    // Promote any limit increase whose cooling-off has elapsed, so the read
    // below sees current values without needing a scheduled job.
    await admin.rpc("apply_due_limit_increases", { p_user_id: userId });

    const [complianceRes, settingsRes, rulesRes] = await Promise.all([
      admin
        .from("user_compliance")
        .select("date_of_birth, tos_accepted_at, tos_version, kyc_status, self_excluded_until, cooling_off_until, deposit_limit_daily, deposit_limit_weekly, deposit_limit_monthly")
        .eq("user_id", userId)
        .maybeSingle(),
      admin
        .from("compliance_settings")
        .select("geo_enforcement_enabled, default_jurisdiction_status, default_minimum_age, kyc_payout_threshold, current_tos_version")
        .eq("id", true)
        .maybeSingle(),
      admin
        .from("jurisdiction_rules")
        .select("country_code, region_code, status, minimum_age, requires_license, notes"),
    ]);

    if (settingsRes.error || !settingsRes.data) {
      return failClosed(userId, "evaluation_failed", geo,
        `settings unreadable: ${settingsRes.error?.message ?? "missing"}`);
    }

    const settings = settingsRes.data as unknown as SettingsRow;
    const compliance = (complianceRes.data ?? null) as unknown as ComplianceRow | null;
    const rules = (rulesRes.data ?? []) as unknown as JurisdictionRule[];
    const now = new Date();

    // ── 1. Self-exclusion. Checked first, always, for every action. ─────────
    if (compliance?.self_excluded_until) {
      const until = new Date(compliance.self_excluded_until);
      if (until > now) {
        return await block(userId, geo, "self_excluded", 403,
          `Your account is self-excluded until ${until.toISOString().slice(0, 10)}. ` +
            `Self-exclusion cannot be lifted early.`,
          { until: compliance.self_excluded_until });
      }
    }

    // ── 2. Cooling-off ──────────────────────────────────────────────────────
    if (compliance?.cooling_off_until) {
      const until = new Date(compliance.cooling_off_until);
      if (until > now) {
        return await block(userId, geo, "cooling_off", 403,
          `Your account is in a cooling-off period until ${until.toISOString().slice(0, 10)}.`,
          { until: compliance.cooling_off_until });
      }
    }

    // ── 3. Terms acceptance, at the current version ─────────────────────────
    if (
      !compliance?.tos_accepted_at ||
      compliance.tos_version !== settings.current_tos_version
    ) {
      return await block(userId, geo, "terms_not_accepted", 403,
        "Please review and accept the current Terms and Contest Rules before continuing.",
        { required: settings.current_tos_version, accepted: compliance?.tos_version ?? null });
    }

    // ── 4. Jurisdiction ─────────────────────────────────────────────────────
    const jurisdiction = resolveJurisdiction(rules, geo.country, geo.region, {
      status: settings.default_jurisdiction_status,
      minimumAge: settings.default_minimum_age,
    });

    if (settings.geo_enforcement_enabled) {
      // An unknown location cannot be proven compliant. In production that is
      // a refusal; in local development, where no edge supplies geo at all,
      // enforcing it would make the app impossible to run.
      if (!geo.trusted) {
        if (hasTrustedEdge() || process.env.NODE_ENV === "production") {
          return await block(userId, geo, "location_unknown", 403,
            "We could not verify your location, so this action is unavailable. " +
              "Disable any VPN or proxy and try again.");
        }
        logEvent("warn", "compliance.geo_unavailable_dev", { userId, action });
      } else if (!permitsPlay(jurisdiction.status)) {
        return await block(userId, geo, "jurisdiction_blocked", 403,
          "Paid contests are not available in your location.",
          {
            status: jurisdiction.status,
            matchLevel: jurisdiction.matchLevel,
            country: geo.country,
            region: geo.region,
          });
      }
    }

    // ── 5. Age, against this jurisdiction's minimum ─────────────────────────
    if (!compliance?.date_of_birth) {
      return await block(userId, geo, "age_unverified", 403,
        "Please confirm your date of birth before taking part in a paid contest.");
    }
    if (!meetsMinimumAge(compliance.date_of_birth, jurisdiction.minimumAge, now)) {
      return await block(userId, geo, "under_age", 403,
        `You must be at least ${jurisdiction.minimumAge} to take part in a paid contest ` +
          `in your location.`,
        { minimumAge: jurisdiction.minimumAge });
    }

    // ── 6. Deposit limits — only meaningful when money is going in ──────────
    if (action === "deposit" && typeof amount === "number" && amount > 0) {
      const limitVerdict = await checkDepositLimits(admin, userId, amount, compliance);
      if (limitVerdict) {
        return await block(userId, geo, "deposit_limit_reached", 403,
          limitVerdict.message, limitVerdict.detail);
      }
    }

    // ── 7. KYC — only when money is going out, above the threshold ──────────
    if (action === "payout") {
      const needsKyc = await payoutCrossesKycThreshold(
        admin, userId, amount ?? 0, settings.kyc_payout_threshold
      );
      if (needsKyc && compliance.kyc_status !== "verified") {
        return await block(userId, geo, "kyc_required", 403,
          "Identity verification is required before we can release this payout. " +
            "Please contact support to complete verification.",
          { threshold: settings.kyc_payout_threshold, kycStatus: compliance.kyc_status });
      }
    }

    return { allowed: true, jurisdiction, geo };
  } catch (err) {
    return failClosed(userId, "evaluation_failed", geo,
      err instanceof Error ? err.message : String(err));
  }
}

/**
 * Route-friendly wrapper: returns a NextResponse to return directly, or null
 * when the action may proceed. Mirrors assertSameOrigin / enforceRateLimit so
 * the guard block at the top of a route reads consistently.
 */
export async function assertCompliance(input: {
  userId: string;
  headers: Headers;
  action: MoneyAction;
  amount?: number;
}): Promise<NextResponse | null> {
  const verdict = await evaluateCompliance(input);
  if (verdict.allowed) return null;
  return NextResponse.json(
    { error: verdict.message, code: verdict.code },
    { status: verdict.status }
  );
}

// ── internals ───────────────────────────────────────────────────────────────

type AdminClient = ReturnType<typeof createAdminClient>;

async function checkDepositLimits(
  admin: AdminClient,
  userId: string,
  amount: number,
  compliance: ComplianceRow
): Promise<{ message: string; detail: Record<string, unknown> } | null> {
  const windows: Array<{ key: "daily" | "weekly" | "monthly"; hours: number; limit: number | null }> = [
    { key: "daily", hours: 24, limit: compliance.deposit_limit_daily },
    { key: "weekly", hours: 24 * 7, limit: compliance.deposit_limit_weekly },
    { key: "monthly", hours: 24 * 30, limit: compliance.deposit_limit_monthly },
  ];

  const active = windows.filter((w) => w.limit !== null && w.limit !== undefined);
  if (active.length === 0) return null;

  // One query for the longest window, then filter in memory — three round
  // trips for what is one index scan would be wasteful on a hot path.
  const longestHours = Math.max(...active.map((w) => w.hours));
  const since = new Date(Date.now() - longestHours * 3600_000).toISOString();

  const { data, error } = await admin
    .from("pool_transactions")
    .select("amount, created_at")
    .eq("user_id", userId)
    .eq("status", "completed")
    .gte("created_at", since);

  // Fail closed: if we cannot measure spend, we cannot honour the limit.
  if (error) {
    return {
      message: "We could not verify your deposit limits just now. Please try again shortly.",
      detail: { reason: "spend_query_failed" },
    };
  }

  const rows = data ?? [];
  for (const w of active) {
    const cutoff = Date.now() - w.hours * 3600_000;
    const spent = rows
      .filter((r) => new Date(r.created_at as string).getTime() >= cutoff)
      .reduce((sum, r) => sum + Number(r.amount ?? 0), 0);

    if (spent + amount > (w.limit as number)) {
      return {
        message:
          `This purchase would exceed the ${w.key} spending limit you set ` +
          `($${(w.limit as number).toFixed(2)}). You have spent $${spent.toFixed(2)} in that period. ` +
          `Lowering a limit takes effect immediately; raising one takes 24 hours.`,
        detail: { window: w.key, limit: w.limit, spent, attempted: amount },
      };
    }
  }
  return null;
}

async function payoutCrossesKycThreshold(
  admin: AdminClient,
  userId: string,
  amount: number,
  threshold: number
): Promise<boolean> {
  const since = new Date(Date.now() - 365 * 24 * 3600_000).toISOString();
  const { data, error } = await admin
    .from("payout_requests")
    .select("amount")
    .eq("user_id", userId)
    .eq("status", "completed")
    .gte("processed_at", since);

  // Fail closed — if we cannot total prior payouts, assume the threshold is met
  // and require verification rather than releasing funds unverified.
  if (error) return true;

  const priorTotal = (data ?? []).reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
  return priorTotal + amount >= threshold;
}

async function block(
  userId: string,
  geo: GeoLocation,
  code: ComplianceBlockCode,
  status: number,
  message: string,
  detail?: Record<string, unknown>
): Promise<ComplianceVerdict> {
  logEvent("warn", "compliance.blocked", { userId, code, country: geo.country, region: geo.region });
  try {
    await createAdminClient()
      .from("compliance_events")
      .insert({
        user_id: userId,
        event_type: code,
        decision: "blocked",
        reason: message,
        country_code: geo.country,
        region_code: geo.region,
        detail: detail ?? null,
      });
  } catch {
    // The refusal stands whether or not it could be recorded.
  }
  return { allowed: false, code, message, status, detail };
}

function failClosed(
  userId: string,
  code: ComplianceBlockCode,
  geo: GeoLocation,
  reason: string
): ComplianceVerdict {
  logEvent("error", "compliance.evaluation_failed", { userId, reason, country: geo.country });
  return {
    allowed: false,
    code,
    status: 503,
    message:
      "We could not complete the required eligibility checks just now. " +
      "No money has moved. Please try again shortly.",
  };
}
