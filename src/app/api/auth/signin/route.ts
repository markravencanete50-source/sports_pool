import { createClient } from "@/lib/supabase/server";
import { signinSchema } from "@/lib/validations";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
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
