import { createClient } from "@/lib/supabase/server";
import { signupSchema } from "@/lib/validations";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { checkPasswordBreached } from "@/lib/password-breach";
import { assertSameOrigin } from "@/lib/request-guards";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    // Throttle automated account-creation floods.
    const limited = await enforceRateLimit(request, "auth:signup", RATE_LIMITS.authSignup);
    if (limited) return limited;

    const body = await request.json();
    const validatedData = signupSchema.parse(body);

    /*
     * Screen against known-breached passwords (HIBP k-anonymity — the password
     * never leaves this server; see src/lib/password-breach.ts). Supabase's
     * native version of this check is plan-gated, so it runs here instead.
     * Fails open if HIBP is unreachable; the zod strength policy above still
     * applies unconditionally.
     */
    const breach = await checkPasswordBreached(validatedData.password);
    if (breach.breached) {
      return NextResponse.json(
        {
          error:
            "That password has appeared in a known data breach and cannot be used here. Please choose a different one.",
        },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const normalizedEmail = validatedData.email.toLowerCase().trim();
    const origin =
      process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
    const redirectTo = `${origin.replace(/\/$/, "")}/auth/callback`;

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: validatedData.password,
      options: {
        data: {
          name: validatedData.name,
        },
        emailRedirectTo: redirectTo,
      },
    });

    if (authError) {
      /*
       * Do NOT return Supabase's message verbatim. With email confirmation
       * disabled it says "User already registered", which turns this endpoint
       * into a user-enumeration oracle: anyone can test an address and learn
       * whether it holds an account on a real-money gambling site. Log the real
       * reason for operators; answer the caller generically.
       */
      console.error("[signup] auth error:", authError.message);
      return NextResponse.json(
        { error: "Could not create the account. Check your details and try again." },
        { status: 400 }
      );
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: "Failed to create user" },
        { status: 500 }
      );
    }

    let profileError = null;

    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { createClient: createServiceClient } = await import(
        "@supabase/supabase-js"
      );
      const serviceClient = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        }
      );

      const { error } = await serviceClient
        .from("users")
        .insert({
          id: authData.user.id,
          email: normalizedEmail,
          name: validatedData.name,
          avatar: null,
        })
        .select()
        .single();

      profileError = error;
    } else {
      const { error } = await supabase.from("users").insert({
        id: authData.user.id,
        email: normalizedEmail,
        name: validatedData.name,
        avatar: null,
      });

      profileError = error;
    }

    // If profile creation fails, check if it's because it already exists (trigger might have created it)
    if (
      profileError &&
      !profileError.message.includes("duplicate") &&
      !profileError.code?.includes("23505")
    ) {
      console.error("Profile creation error:", profileError);
      // The Postgres message and code name tables, columns and RLS policies —
      // a free schema map from an unauthenticated endpoint. Log, do not return.
      return NextResponse.json(
        { error: "Failed to create user profile" },
        { status: 500 }
      );
    }

    /*
     * Verify the profile row exists — but NOT with the caller's session client.
     *
     * When email confirmation is enabled, signUp() returns a user with NO
     * session. The session client is then anonymous, and `users` is restricted
     * to own-row SELECT, so this read returned nothing and the route answered
     * HTTP 500 "User profile was not created" on a signup that had in fact
     * completely succeeded — the account existed and the confirmation email was
     * already sent.
     *
     * Read it back with the privileged client that wrote it. If the service-role
     * key is not configured we cannot verify, and must not invent a failure.
     */
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const { data: userProfile } = await createAdminClient()
        .from("users")
        .select("id")
        .eq("id", authData.user.id)
        .maybeSingle();

      if (!userProfile) {
        console.error(
          `[signup] auth user ${authData.user.id} created but no users row exists`
        );
        return NextResponse.json(
          { error: "User profile was not created. Please try again." },
          { status: 500 }
        );
      }
    }

    /*
     * Compliance state is written with the privileged client, never by the
     * caller: user_compliance carries no client write grant at all, precisely
     * so a user cannot back-date their own age or pre-accept terms they were
     * never shown. Registration geo is captured here because it is evidence of
     * where the account was opened, which a regulator will ask for later.
     */
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const { resolveGeo } = await import("@/lib/compliance/geo");
      const geo = resolveGeo(request.headers);
      const admin = createAdminClient();

      const { data: settings } = await admin
        .from("compliance_settings")
        .select("current_tos_version")
        .eq("id", true)
        .maybeSingle();

      const { error: complianceError } = await admin.from("user_compliance").upsert(
        {
          user_id: authData.user.id,
          date_of_birth: validatedData.dateOfBirth,
          age_verified_at: new Date().toISOString(),
          registration_country: geo.country,
          registration_region: geo.region,
          tos_accepted_at: new Date().toISOString(),
          tos_version:
            (settings as { current_tos_version?: string } | null)?.current_tos_version ?? null,
        },
        { onConflict: "user_id" }
      );

      if (complianceError) {
        /*
         * The auth user and profile already exist at this point. Failing the
         * whole signup would strand them; instead the account exists without
         * compliance state, and the gate FAILS CLOSED on a missing date of
         * birth, so no money can move until this is repaired. Loud log, and it
         * lands in app_errors for an operator.
         */
        const { recordAppError } = await import("@/lib/log");
        await recordAppError({
          source: "server",
          message: `Signup completed but compliance row failed for ${authData.user.id}: ${complianceError.message}`,
          url: "/api/auth/signup",
          userId: authData.user.id,
        });
      }
    }

    // Return only what the UI needs. The full authData.user carries
    // app_metadata (including role), user_metadata and identity records — none
    // of which the client needs, and all of which is needless exposure.
    return NextResponse.json(
      {
        user: { id: authData.user.id, email: authData.user.email },
        message: "Account created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Check your name, email and password and try again." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
