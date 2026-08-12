import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { assertSameOrigin } from "@/lib/request-guards";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Responsible-gambling controls: self-imposed deposit limits and
 * self-exclusion.
 *
 * Every write goes through a SECURITY DEFINER RPC rather than a table update,
 * because the rules about these values are not expressible as a grant:
 *
 *   - a self-exclusion may only ever be EXTENDED, never shortened, so a user in
 *     crisis cannot undo it by replaying the call with a smaller number;
 *   - a limit DECREASE applies immediately (it protects the user) while an
 *     INCREASE waits out a cooling-off period (it removes a protection). Without
 *     that asymmetry the control is decorative — hit the limit, raise it, carry
 *     on in the same session.
 *
 * The RPCs derive identity from auth.uid(), so this route never passes a user
 * id and cannot be tricked into acting on someone else's account.
 */

const limitsSchema = z
  .object({
    daily: z.coerce.number().finite().nonnegative().max(1_000_000).nullable().optional(),
    weekly: z.coerce.number().finite().nonnegative().max(1_000_000).nullable().optional(),
    monthly: z.coerce.number().finite().nonnegative().max(1_000_000).nullable().optional(),
  })
  .refine(
    (v) =>
      v.daily !== undefined || v.weekly !== undefined || v.monthly !== undefined,
    "Provide at least one limit"
  );

const exclusionSchema = z.object({
  days: z.coerce.number().int().min(1).max(3650),
  confirm: z.literal(true, {
    errorMap: () => ({ message: "Self-exclusion must be explicitly confirmed" }),
  }),
});

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set_limits"), limits: limitsSchema }),
  z.object({ action: z.literal("self_exclude"), exclusion: exclusionSchema }),
]);

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // RLS restricts this to the caller's own row.
    const { data, error } = await supabase
      .from("user_compliance")
      .select("deposit_limit_daily, deposit_limit_weekly, deposit_limit_monthly, pending_limit_daily, pending_limit_weekly, pending_limit_monthly, pending_limits_effective_at, self_excluded_until, cooling_off_until, kyc_status, tos_version")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: "Could not load your settings" }, { status: 500 });
    }

    return NextResponse.json({ settings: data ?? null }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const limited = await enforceRateLimit(
      request,
      "me:responsible-gaming",
      RATE_LIMITS.responsibleGaming
    );
    if (limited) return limited;

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 }
      );
    }

    if (parsed.data.action === "set_limits") {
      const { daily = null, weekly = null, monthly = null } = parsed.data.limits;
      const { data, error } = await supabase.rpc("set_deposit_limits", {
        p_daily: daily,
        p_weekly: weekly,
        p_monthly: monthly,
      });
      if (error) {
        return NextResponse.json({ error: "Could not update your limits" }, { status: 500 });
      }
      const result = data as { immediate?: boolean; effective_at?: string } | null;
      return NextResponse.json(
        {
          message: result?.immediate
            ? "Your limits have been updated and apply immediately."
            : "Your limits have been scheduled. Increases take effect after a cooling-off period.",
          immediate: result?.immediate ?? false,
          effectiveAt: result?.effective_at ?? null,
        },
        { status: 200 }
      );
    }

    const { data, error } = await supabase.rpc("set_self_exclusion", {
      p_days: parsed.data.exclusion.days,
    });
    if (error) {
      return NextResponse.json({ error: "Could not apply self-exclusion" }, { status: 500 });
    }
    return NextResponse.json(
      {
        message:
          "Your self-exclusion is active. It cannot be lifted early, and you will not be " +
          "able to enter paid contests until it expires.",
        until: data,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
