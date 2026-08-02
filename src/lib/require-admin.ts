import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export type RequireAdminResult =
  | { user: { id: string; app_metadata?: Record<string, unknown> } }
  | NextResponse;

export async function requireAdmin(
  supabase: SupabaseClient
): Promise<RequireAdminResult> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  const isAdmin =
    (user.app_metadata?.role as string) === "admin" ||
    (profile?.role as string) === "admin";
  if (!isAdmin) {
    return NextResponse.json(
      { error: "Forbidden. Admin only." },
      { status: 403 }
    );
  }
  return { user };
}
