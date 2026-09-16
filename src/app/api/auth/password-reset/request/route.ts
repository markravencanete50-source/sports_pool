import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertSameOrigin } from "@/lib/request-guards";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { passwordResetRequestSchema } from "@/lib/validations";
import { sendPasswordResetEmail } from "@/lib/auth/password-reset-email";

const GENERIC_MESSAGE =
  "If an account exists for that email, a password reset link is on its way.";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const limited = await enforceRateLimit(
    request,
    "auth:password-reset:request",
    RATE_LIMITS.authPasswordResetRequest
  );
  if (limited) return limited;

  const parsed = passwordResetRequestSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Enter a valid email address." },
      { status: 400 }
    );
  }

  const origin = (
    process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin
  ).replace(/\/$/, "");
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(
    "/reset-password"
  )}&mode=recovery`;

  const supabase = await createClient();
  let errorMessage: string | null = null;

  if (
    process.env.RESEND_API_KEY?.trim() &&
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  ) {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const generated = await createAdminClient().auth.admin.generateLink({
      type: "recovery",
      email: parsed.data.email,
      options: { redirectTo },
    });
    errorMessage = generated.error?.message ?? null;

    if (!generated.error && generated.data.user) {
      const resetUrl = new URL("/auth/callback", origin);
      resetUrl.searchParams.set(
        "token_hash",
        generated.data.properties.hashed_token
      );
      resetUrl.searchParams.set("type", "recovery");
      resetUrl.searchParams.set("next", "/reset-password");
      resetUrl.searchParams.set("mode", "recovery");
      const delivery = await sendPasswordResetEmail({
        to: parsed.data.email,
        resetUrl: resetUrl.toString(),
      });
      if (!delivery.ok) {
        errorMessage = `Resend delivery failed with HTTP ${delivery.status}`;
      }
    }
  } else {
    const { error } = await supabase.auth.resetPasswordForEmail(
      parsed.data.email,
      { redirectTo }
    );
    errorMessage = error?.message ?? null;
  }

  // Never disclose whether the address exists. A missing account is expected
  // here and stays out of error monitoring; other provider failures are logged
  // without the submitted email, so logs do not become an account list.
  if (errorMessage && !/user.*not found/i.test(errorMessage)) {
    console.error("[password-reset/request]", errorMessage);
  }

  return NextResponse.json({ message: GENERIC_MESSAGE }, { status: 200 });
}
