import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() || "";
    const page = Math.max(
      1,
      parseInt(searchParams.get("page") || String(DEFAULT_PAGE), 10) || DEFAULT_PAGE
    );
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(
        1,
        parseInt(searchParams.get("limit") || String(DEFAULT_LIMIT), 10) ||
          DEFAULT_LIMIT
      )
    );

    let query = supabase
      .from("users")
      .select("id, email, name, avatar, role, created_at, updated_at", { count: "exact" })
      .order("created_at", { ascending: false });

    if (search.length > 0) {
      // , ( ) " are PostgREST or() grammar — strip them so input can't append
      // its own conditions; then escape LIKE wildcards.
      const term = search
        .replace(/[,()"]/g, "")
        .replace(/%/g, "\\%")
        .replace(/_/g, "\\_");
      if (term.length > 0) {
        query = query.or(
          `email.ilike.%${term}%,name.ilike.%${term}%`
        );
      }
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const { data: users, count: total, error } = await query.range(from, to);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        users: users ?? [],
        total: total ?? 0,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil((total ?? 0) / limit)),
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
