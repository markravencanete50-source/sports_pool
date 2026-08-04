import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import { updatePoolSchema } from "@/lib/validations";
import { NextResponse } from "next/server";

/**
 * SECURITY: this route lives under /api/admin/ but authorized on pool
 * OWNERSHIP, not on the admin role — `pool.created_by !== user.id`.
 *
 * Since the payload can set a pool's status, any user who created a pool could
 * drive its lifecycle themselves: flip it to completed to trigger winner
 * materialisation and credit a balance, with no admin ever in the loop before
 * real money moved — and potentially reopen and re-complete it to pay the pot
 * out more than once.
 *
 * Admin role is now required. Ownership is not authority over settlement.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ poolId: string }> }
) {
  try {
    const { poolId } = await params;
    const supabase = await createClient();

    const auth = await requireAdmin(supabase);
    if (auth instanceof NextResponse) return auth;

    const { data: pool } = await supabase
      .from("pools")
      .select("id")
      .eq("id", poolId)
      .maybeSingle();

    if (!pool) {
      return NextResponse.json({ error: "Pool not found" }, { status: 404 });
    }

    const body = await request.json();
    const validatedData = updatePoolSchema.parse(body);

    const { data, error } = await supabase
      .from("pools")
      .update(validatedData)
      .eq("id", poolId)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ pool: data }, { status: 200 });
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
