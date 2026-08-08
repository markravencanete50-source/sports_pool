import { createClient } from "@/lib/supabase/server";
import { signinSchema } from "@/lib/validations";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    // Throttle password guessing / credential stuffing before touching Auth.
    const limited = enforceRateLimit(request, "auth:signin", RATE_LIMITS.authSignin);
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

    return NextResponse.json(
      { user: data.user, session: data.session },
      { status: 200 }
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
