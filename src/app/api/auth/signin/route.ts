import { createClient } from "@/lib/supabase/server";
import { signinSchema } from "@/lib/validations";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
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

    // The session stays in the cookie the Supabase client just set. Returning it
    // here would put a 400-day refresh token into every CDN and proxy log.
    return NextResponse.json({ user: data.user }, { status: 200 });
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
