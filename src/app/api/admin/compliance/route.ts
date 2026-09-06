import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { paged, parsePagination } from "@/lib/admin/helpers";
import { ageInYears } from "@/lib/compliance/age";

/**
 * The age-verification queue — both populations in one list:
 *   - blocked_signups: addresses refused at signup (no account exists)
 *   - user_compliance: accounts under review / rejected / approved
 * view=pending|blocked|approved|rejected|underage|all
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase, { permission: "compliance.view" });
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") ?? "pending";
    const { page, limit, from, to } = parsePagination(searchParams);
    const admin = createAdminClient();

    // Signup refusals.
    let signupQuery = admin
      .from("blocked_signups")
      .select("id, email, date_of_birth, computed_age, minimum_age, country_code, region_code, reason, status, attempts, last_attempt_at, reviewed_by, reviewed_at, review_note, created_at", { count: "exact" })
      .order("last_attempt_at", { ascending: false });
    if (view === "pending" || view === "underage") signupQuery = signupQuery.eq("status", "pending");
    else if (view === "approved") signupQuery = signupQuery.eq("status", "approved");
    else if (view === "rejected" || view === "blocked") signupQuery = signupQuery.eq("status", "rejected");

    // Account reviews.
    let accountQuery = admin
      .from("user_compliance")
      .select("user_id, date_of_birth, age_verified_at, age_review_status, age_review_reason, age_review_note, age_reviewed_by, age_reviewed_at, registration_country, registration_region, users!inner(id, email, name, account_status, status_reason, created_at)", { count: "exact" })
      .order("age_reviewed_at", { ascending: false, nullsFirst: true });
    if (view === "pending") accountQuery = accountQuery.eq("age_review_status", "pending");
    else if (view === "approved") accountQuery = accountQuery.eq("age_review_status", "approved");
    else if (view === "rejected") accountQuery = accountQuery.eq("age_review_status", "rejected");
    else if (view === "blocked") accountQuery = accountQuery.eq("users.account_status", "blocked");
    else if (view === "underage") accountQuery = accountQuery.in("age_review_status", ["pending", "rejected"]);
    else accountQuery = accountQuery.neq("age_review_status", "none");

    const [signups, accounts] = await Promise.all([signupQuery.range(from, to), accountQuery.range(from, to)]);

    const rows = [
      ...(signups.data ?? []).map((s: Record<string, unknown>) => ({
        kind: "signup" as const,
        id: s.id,
        email: s.email,
        name: null,
        userId: null,
        dateOfBirth: s.date_of_birth,
        age: s.computed_age ?? (s.date_of_birth ? ageInYears(String(s.date_of_birth)) : null),
        minimumAge: s.minimum_age,
        location: [s.country_code, s.region_code].filter(Boolean).join("/") || null,
        verificationStatus: "unverified",
        blockReason: s.reason,
        reviewStatus: s.status,
        reviewedAt: s.reviewed_at,
        reviewedBy: s.reviewed_by,
        note: s.review_note,
        attempts: s.attempts,
        date: s.last_attempt_at,
      })),
      ...(accounts.data ?? []).map((c: Record<string, unknown>) => {
        const u = c.users as Record<string, unknown>;
        return {
          kind: "account" as const,
          id: c.user_id,
          email: u?.email,
          name: u?.name,
          userId: c.user_id,
          dateOfBirth: c.date_of_birth,
          age: c.date_of_birth ? ageInYears(String(c.date_of_birth)) : null,
          minimumAge: null,
          location: [c.registration_country, c.registration_region].filter(Boolean).join("/") || null,
          verificationStatus: c.age_verified_at ? "verified" : "unverified",
          blockReason: u?.status_reason ?? c.age_review_reason ?? null,
          accountStatus: u?.account_status,
          reviewStatus: c.age_review_status,
          reviewedAt: c.age_reviewed_at,
          reviewedBy: c.age_reviewed_by,
          note: c.age_review_note,
          attempts: null,
          date: c.age_reviewed_at ?? u?.created_at,
        };
      }),
    ].sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));

    const total = (signups.count ?? 0) + (accounts.count ?? 0);
    const result = paged(rows, total, page, limit);
    return NextResponse.json({ items: result.rows, ...result }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
