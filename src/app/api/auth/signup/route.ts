import { createClient } from "@/lib/supabase/server";
import { signupSchema } from "@/lib/validations";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    // Throttle automated account-creation floods.
    const limited = await enforceRateLimit(request, "auth:signup", RATE_LIMITS.authSignup);
    if (limited) return limited;

    const body = await request.json();
    const validatedData = signupSchema.parse(body);

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
      return NextResponse.json({ error: authError.message }, { status: 400 });
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
      return NextResponse.json(
        {
          error: "Failed to create user profile",
          details: profileError.message,
          code: profileError.code,
        },
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

    return NextResponse.json(
      { user: authData.user, message: "Account created successfully" },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Validation error", details: error },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
