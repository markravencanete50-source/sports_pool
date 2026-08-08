import { createClient } from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/routes";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  // `next` arrives via Supabase's redirect_to, i.e. attacker-influenceable.
  const nextUrl = safeInternalPath(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=missing_code", request.url)
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url)
    );
  }

  const url = new URL(nextUrl, request.url);
  url.searchParams.set("verified", "1");
  return NextResponse.redirect(url);
}
