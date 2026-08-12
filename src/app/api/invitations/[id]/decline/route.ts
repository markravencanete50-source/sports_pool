import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/request-guards";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const { id: invitationId } = await params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: invitation, error: invError } = await supabase
      .from("pool_invitations")
      .select("id, invited_user_id, status")
      .eq("id", invitationId)
      .single();

    if (invError || !invitation) {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 }
      );
    }

    if (invitation.invited_user_id !== user.id) {
      return NextResponse.json(
        { error: "You can only decline your own invitations" },
        { status: 403 }
      );
    }

    if (invitation.status !== "pending") {
      return NextResponse.json(
        { error: "Invitation is no longer pending" },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabase
      .from("pool_invitations")
      .update({ status: "declined" })
      .eq("id", invitationId);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Decline invitation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
