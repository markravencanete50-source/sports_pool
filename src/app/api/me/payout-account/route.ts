import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/request-guards";

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "•••@•••";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const maskedLocal =
    local.length <= 2 ? "•••" : local[0] + "•••" + local[local.length - 1];
  const maskedDomain =
    domain.length <= 2 ? "•••" : domain[0] + "•••" + domain[domain.length - 1];
  return `${maskedLocal}@${maskedDomain}`;
}

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

    const { data, error } = await supabase
      .from("user_payout_accounts")
      .select("method, identifier")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!data) {
      return NextResponse.json({ payoutAccount: null }, { status: 200 });
    }

    const masked =
      data.method === "paypal" && data.identifier?.includes("@")
        ? maskEmail(data.identifier)
        : "••••••";

    return NextResponse.json(
      {
        payoutAccount: {
          method: data.method,
          identifierMasked: masked,
          hasAccount: true,
        },
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const limited = await enforceRateLimit(request, "payout:account", RATE_LIMITS.payoutAccount);
    if (limited) return limited;

    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const method = body.method;
    const identifier =
      typeof body.identifier === "string" ? body.identifier.trim() : "";

    if (method !== "paypal") {
      return NextResponse.json(
        { error: "Only PayPal is supported for now" },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(identifier)) {
      return NextResponse.json(
        { error: "Enter a valid PayPal email address" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const { error: upsertError } = await supabase
      .from("user_payout_accounts")
      .upsert(
        {
          user_id: user.id,
          method: "paypal",
          identifier: identifier.toLowerCase(),
          updated_at: now,
        },
        { onConflict: "user_id" }
      );

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        payoutAccount: {
          method: "paypal",
          identifierMasked: maskEmail(identifier),
          hasAccount: true,
        },
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
