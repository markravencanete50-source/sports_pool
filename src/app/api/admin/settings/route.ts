import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { recordAdminAction } from "@/lib/compliance/audit";
import { assertSameOrigin } from "@/lib/request-guards";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { describePayoutProviders } from "@/lib/payouts";
import { badRequest } from "@/lib/admin/helpers";
import { z } from "zod";

/**
 * Platform settings. Reading needs settings.view; writing needs
 * settings.manage (super admin) AND a second factor, because the platform
 * fee and the minimum entry fee are money settings. Secrets are never here:
 * the payments section reports configuration by presence only.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase, { permission: "settings.view" });
    if (auth instanceof NextResponse) return auth;

    const admin = createAdminClient();
    const [{ data: platform }, { data: compliance }] = await Promise.all([
      admin.from("platform_settings").select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("compliance_settings").select("*").eq("id", true).maybeSingle(),
    ]);

    const env = (name: string) => Boolean(process.env[name]?.trim());
    return NextResponse.json(
      {
        platform,
        compliance,
        payments: {
          stripe: {
            secretKey: env("STRIPE_SECRET_KEY"),
            webhookSecret: env("STRIPE_WEBHOOK_SECRET"),
            publishableKey: env("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"),
            mode: process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ? "live" : process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") ? "test" : "unset",
          },
          payouts: describePayoutProviders(),
          paypalMode: process.env.PAYPAL_MODE ?? "unset",
        },
        sports: { source: process.env.NFL_SCOREBOARD_BASE_URL ?? "https://site.api.espn.com/apis/site/v2/sports/football/nfl" },
        canManage: auth.permissions.includes("settings.manage"),
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Use a #RRGGBB colour");

const platformSchema = z
  .object({
    platform_name: z.string().trim().min(2).max(60).optional(),
    contact_email: z.string().trim().email().max(320).nullable().optional(),
    support_email: z.string().trim().email().max(320).nullable().optional(),
    logo_url: z.string().trim().url().max(500).nullable().optional(),
    minimum_entry_fee: z.number().min(20).max(10000).optional(),
    platform_fee_percentage: z.number().min(0).max(100).optional(),
    max_pool_duration_days: z.number().int().min(1).max(7).optional(),
    supported_sports: z.array(z.string().regex(/^[a-z0-9_]{2,20}$/)).min(1).max(10).optional(),
    maintenance_mode: z.boolean().optional(),
    feature_flags: z.record(z.string(), z.boolean()).optional(),
    brand_primary_color: hex.optional(),
    brand_accent_color: hex.optional(),
    chat_rules_version: z.string().trim().min(1).max(40).optional(),
    chat_slow_mode_seconds: z.number().int().min(0).max(3600).optional(),
  })
  .strict();

const complianceSchema = z
  .object({
    geo_enforcement_enabled: z.boolean().optional(),
    default_jurisdiction_status: z.enum(["allowed", "blocked", "review"]).optional(),
    default_minimum_age: z.number().int().min(18).max(25).optional(),
    kyc_payout_threshold: z.number().min(0).max(1000000).optional(),
    tax_reporting_threshold: z.number().min(0).max(1000000).optional(),
    limit_increase_delay_hours: z.number().int().min(0).max(720).optional(),
    current_tos_version: z.string().trim().min(1).max(40).optional(),
  })
  .strict();

const bodySchema = z.object({
  platform: platformSchema.optional(),
  compliance: complianceSchema.optional(),
  reason: z.string().trim().min(3).max(1000),
});

export async function PATCH(request: Request) {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const limited = await enforceRateLimit(request, "admin:settings", RATE_LIMITS.adminAction);
    if (limited) return limited;

    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid settings");
    const { platform, compliance, reason } = parsed.data;
    if (!platform && !compliance) return badRequest("Nothing to change");

    const supabase = await createClient();
    const auth = await requireAdmin(supabase, { permission: "settings.manage", requireMfa: true });
    if (auth instanceof NextResponse) return auth;

    const admin = createAdminClient();
    const now = new Date().toISOString();
    const result: Record<string, unknown> = {};

    if (platform && Object.keys(platform).length > 0) {
      const { data: current } = await admin.from("platform_settings").select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (!current) return badRequest("platform_settings row is missing; run the seed");
      const { error } = await admin
        .from("platform_settings")
        .update({ ...platform, updated_at: now, updated_by: auth.user.id })
        .eq("id", current.id);
      if (error) return NextResponse.json({ error: `Could not save platform settings: ${error.message}` }, { status: 500 });
      await recordAdminAction({
        actorId: auth.user.id,
        action: "settings.platform_updated",
        targetType: "platform_settings",
        targetId: current.id,
        before: Object.fromEntries(Object.keys(platform).map((k) => [k, (current as Record<string, unknown>)[k]])),
        after: platform,
        reason,
      });
      result.platform = platform;
    }

    if (compliance && Object.keys(compliance).length > 0) {
      const { data: current } = await admin.from("compliance_settings").select("*").eq("id", true).maybeSingle();
      const { error } = await admin
        .from("compliance_settings")
        .update({ ...compliance, updated_at: now, updated_by: auth.user.id })
        .eq("id", true);
      if (error) return NextResponse.json({ error: `Could not save compliance settings: ${error.message}` }, { status: 500 });
      await recordAdminAction({
        actorId: auth.user.id,
        action: "settings.compliance_updated",
        targetType: "compliance_settings",
        targetId: null,
        before: current ? Object.fromEntries(Object.keys(compliance).map((k) => [k, (current as Record<string, unknown>)[k]])) : null,
        after: compliance,
        reason,
      });
      result.compliance = compliance;
    }

    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
