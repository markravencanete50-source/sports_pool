import { createClient } from "@/lib/supabase/server";
import { assertSameOrigin } from "@/lib/request-guards";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    // Stops a cross-site page from forcibly signing the user out.
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { message: "Signed out successfully" },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
