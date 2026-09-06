import { createClient } from "@/lib/supabase/server";
import { signinSchema } from "@/lib/validations";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/request-guards";
import { after, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { readAccountStanding } from "@/lib/account-standing";

export async function POST(request: Request) {
  try {
    // Refuse cross-site login attempts (login CSRF) before doing any work.
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    // Throttle password guessing / credential stuffing before touching Auth.
    const limited = await enforceRateLimit(request, "auth:signin", RATE_LIMITS.authSignin);
    if (limited) return limited;

    const body = await request.json();
    const validatedData = signinSchema.parse(body);

    const supabase = await createClient();

    // Normalize email (lowercase and trim)
    const normalizedEmail = validatedData.email.toLowerCase().trim();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: validatedData.password,
    });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

    /*
     * ACCOUNT STANDING. A blocked or suspended account authenticates (the
     * password is right) but must not get a session: the sign-in is undone
     * before the cookie is useful. Read with the service role — users is
     * own-row-only under RLS, but this check must not depend on the row being
     * readable through the session that is being refused.
     */
    if (data.user) {
      let standing: Awaited<ReturnType<typeof readAccountStanding>>;
      try {
        standing = await readAccountStanding(createAdminClient(), data.user.id);
      } catch {
        await supabase.auth.signOut({ scope: "local" });
        return NextResponse.json(
          { error: "Could not verify your account status. Please try again.", code: "account_status_unavailable" },
          { status: 503 }
        );
      }
      const { status, suspendedUntil } = standing;
      const stillSuspended =
        status === "suspended" && (!suspendedUntil || suspendedUntil > new Date());

      if (status === "blocked" || stillSuspended) {
        await supabase.auth.signOut({ scope: "local" });
        const { logEvent } = await import("@/lib/log");
        logEvent("warn", "auth.signin_refused_standing", {
          userId: data.user.id,
          status,
        });
        return NextResponse.json(
          {
            error:
              status === "blocked"
                ? "This account has been blocked. Contact support if you believe this is a mistake."
                : `This account is suspended${
                    suspendedUntil ? ` until ${suspendedUntil.toISOString().slice(0, 10)}` : ""
                  }. Contact support for details.`,
            code: status === "blocked" ? "account_blocked" : "account_suspended",
          },
          { status: 403 }
        );
      }

      // Execute the lazy PostgREST query after responding, without delaying login.
      after(async () => {
        const { error: activityError } = await createAdminClient()
          .from("users")
          .update({ last_active_at: new Date().toISOString() })
          .eq("id", data.user!.id);
        if (activityError) console.error("[signin] Failed to record activity");
      });
    }

    // Do NOT return `data.session`. It carries the refresh token, which is a
    // long-lived credential; echoing it into a JSON body puts it somewhere any
    // XSS or logging sink can reach, when the session is already delivered
    // safely as an HTTP-only cookie by createClient(). Return only what the UI
    // needs to render the signed-in state.
    return NextResponse.json(
      {
        user: {
          id: data.user?.id,
          email: data.user?.email,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Enter a valid email and password." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
