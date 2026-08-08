import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { newsletterSignupSchema } from "@/lib/validations";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const limited = enforceRateLimit(request, "newsletter", RATE_LIMITS.newsletter);
    if (limited) return limited;

    const body = await request.json();
    const validated = newsletterSignupSchema.parse(body);
    const supabase = await createClient();

    const { error } = await supabase.from("newsletter_subscribers").insert({
      email: validated.email,
    });

    if (error?.code === "23505") {
      return NextResponse.json(
        { message: "You're already on the newsletter list." },
        { status: 200 }
      );
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { message: "Subscribed. We'll send the good stuff only." },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { error: "Enter a valid email address." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Unable to subscribe right now." },
      { status: 500 }
    );
  }
}
