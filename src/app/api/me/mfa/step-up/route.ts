import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { assertSameOrigin } from "@/lib/request-guards";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { logEvent } from "@/lib/log";

/**
 * Step-up: prove possession of an already-verified authenticator so the
 * CURRENT session becomes aal2.
 *
 * The admin console is gated on aal2 in src/proxy.ts, so a lingering cookie
 * on a shared machine is not enough to open it — the person in front of the
 * browser has to produce a fresh code. This route is the server half of that
 * prompt: it challenges the user's verified TOTP factor and verifies the code,
 * which is what elevates the session (the server client writes the refreshed
 * cookies). Nothing is enrolled here; enrolment is /api/me/mfa.
 *
 * GET reports whether a step-up is needed and possible, so the challenge page
 * can send someone with no factor to enrolment instead of an empty prompt.
 */
const verifySchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app"),
});

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
    const [{ data: factors }, { data: aal }] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    const verified = (factors?.totp ?? []).filter((f) => f.status === "verified");
    return NextResponse.json(
      {
        hasFactor: verified.length > 0,
        currentLevel: aal?.currentLevel ?? "aal1",
        satisfied: aal?.currentLevel === "aal2",
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;
    const limited = await enforceRateLimit(request, "me:mfa-stepup", RATE_LIMITS.mfaVerify);
    if (limited) return limited;

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = verifySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 }
      );
    }

    const { data: factors } = await supabase.auth.mfa.listFactors();
    const factor = (factors?.totp ?? []).find((f) => f.status === "verified");
    if (!factor) {
      return NextResponse.json(
        { error: "No authenticator is set up on this account.", code: "mfa_enrollment_required" },
        { status: 403 }
      );
    }

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: factor.id,
    });
    if (challengeError) {
      return NextResponse.json({ error: "Could not start verification. Try again." }, { status: 400 });
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: factor.id,
      challengeId: challenge.id,
      code: parsed.data.code,
    });
    if (verifyError) {
      logEvent("warn", "mfa.step_up_failed", { userId: user.id });
      // Generic on purpose: "wrong code" vs "expired" helps a guesser tune.
      return NextResponse.json({ error: "That code was not accepted. Try again." }, { status: 400 });
    }

    logEvent("info", "mfa.step_up", { userId: user.id });
    return NextResponse.json({ ok: true, currentLevel: "aal2" }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
