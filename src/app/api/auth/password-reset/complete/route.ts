import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { checkPasswordBreached } from "@/lib/password-breach";
import { assertSameOrigin } from "@/lib/request-guards";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { passwordResetCompleteSchema } from "@/lib/validations";

export async function GET() {
  const cookieStore = await cookies();
  if (cookieStore.get("sportspool-recovery")?.value !== "1") {
    return NextResponse.json({ valid: false }, { status: 401 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return NextResponse.json({ valid: Boolean(user) }, { status: user ? 200 : 401 });
}

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const limited = await enforceRateLimit(
    request,
    "auth:password-reset:complete",
    RATE_LIMITS.authPasswordResetComplete
  );
  if (limited) return limited;

  const cookieStore = await cookies();
  if (cookieStore.get("sportspool-recovery")?.value !== "1") {
    return NextResponse.json(
      { error: "This password reset link is invalid or has expired." },
      { status: 403 }
    );
  }

  const parsed = passwordResetCompleteSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid password." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    cookieStore.delete("sportspool-recovery");
    return NextResponse.json(
      { error: "This password reset link is invalid or has expired." },
      { status: 401 }
    );
  }

  const breach = await checkPasswordBreached(parsed.data.password);
  if (breach.breached) {
    return NextResponse.json(
      {
        error:
          "That password has appeared in a known data breach. Please choose a different one.",
      },
      { status: 400 }
    );
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  cookieStore.delete("sportspool-recovery");
  const { error: signOutError } = await supabase.auth.signOut({ scope: "global" });
  if (signOutError) {
    console.error("[password-reset/complete] sign out failed", signOutError.message);
  }

  return NextResponse.json(
    { message: "Password updated. Sign in with your new password." },
    { status: 200 }
  );
}
