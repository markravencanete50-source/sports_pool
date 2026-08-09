import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const inviteEmailsSchema = z.object({
  emails: z.array(z.string().email()).min(1, "At least one email is required"),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ poolId: string }> }
) {
  try {
    const { poolId } = await params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { emails } = inviteEmailsSchema.parse(body);

    const { data: pool, error: poolError } = await supabase
      .from("pools")
      .select("id, type, created_by")
      .eq("id", poolId)
      .single();

    if (poolError || !pool) {
      return NextResponse.json({ error: "Pool not found" }, { status: 404 });
    }

    if (pool.created_by !== user.id) {
      return NextResponse.json(
        { error: "Only the pool creator can invite people" },
        { status: 403 }
      );
    }

    if (pool.type !== "private") {
      return NextResponse.json(
        { error: "Only private pools support email invites" },
        { status: 400 }
      );
    }

    const normalizedEmails = [...new Set(emails.map((e) => e.trim().toLowerCase()))];
    /*
     * Resolve invitee emails with the SERVICE-ROLE client.
     *
     * public.users is restricted to own-row SELECT (it carries email, role and
     * balance), so this lookup run under the caller's session matched zero rows
     * and invite-by-email always failed with "No users found with those
     * emails" — for addresses that do exist.
     *
     * Only the ids are read, and they are never returned to the caller: the
     * response reports a count, so this does not become an account-existence
     * oracle. Authorization (pool owner, private pool) is established above.
     */
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { data: usersByEmail } = await createAdminClient()
      .from("users")
      .select("id")
      .in("email", normalizedEmails);

    const resolvedIds = (usersByEmail ?? [])
      .map((u: { id: string }) => u.id)
      .filter((id: string) => id !== user.id);

    if (resolvedIds.length === 0) {
      return NextResponse.json(
        { error: "No users found with those emails, or only yourself was listed" },
        { status: 400 }
      );
    }

    const { data: existing } = await supabase
      .from("pool_invitations")
      .select("invited_user_id")
      .eq("pool_id", poolId)
      .in("invited_user_id", resolvedIds);

    const existingIds = new Set(
      (existing ?? []).map((r: { invited_user_id: string }) => r.invited_user_id)
    );
    const { data: existingParticipants } = await supabase
      .from("pool_participants")
      .select("user_id")
      .eq("pool_id", poolId)
      .in("user_id", resolvedIds);

    const participantIds = new Set(
      (existingParticipants ?? []).map((r: { user_id: string }) => r.user_id)
    );
    const toInvite = resolvedIds.filter(
      (id) => !existingIds.has(id) && !participantIds.has(id)
    );

    if (toInvite.length === 0) {
      return NextResponse.json(
        { error: "Those users are already invited or already in the pool" },
        { status: 400 }
      );
    }

    const invitations = toInvite.map((invited_user_id) => ({
      pool_id: poolId,
      invited_user_id,
      invited_by: user.id,
      status: "pending",
    }));

    const { error: insertError } = await supabase
      .from("pool_invitations")
      .insert(invitations);

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      invited: toInvite.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.errors },
        { status: 400 }
      );
    }
    console.error("Pool invitations error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
