import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/request-guards";

/**
 * Mark one notification as read.
 *
 * This route used to authenticate the caller and then return
 * `200 {"message": "Notification marked as read"}` without touching the
 * database at all. read_at was never set, so notifications stayed unread
 * forever while the endpoint reported success.
 *
 * Nothing was blocking the write: `authenticated` holds UPDATE on
 * notifications.read_at, and the "Users can update own notifications" policy
 * allows it for auth.uid() = user_id. The write simply was not there.
 *
 * Ownership is enforced twice over — by that RLS policy, and by the explicit
 * user_id filter below, so a valid id belonging to someone else is a 404 rather
 * than a silent success.
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const { id } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Postgres raises 22P02 on a malformed uuid, which would surface as a 500.
    if (!UUID.test(id)) {
      return NextResponse.json(
        { error: "Invalid notification id" },
        { status: 400 }
      );
    }

    // `read_at is null` keeps the first-read timestamp: re-reading a
    // notification should not move when it was first seen.
    const { data: updated, error: updateError } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id)
      .is("read_at", null)
      .select("id, read_at");

    if (updateError) {
      console.error("[notifications/read] update failed:", updateError.message);
      return NextResponse.json(
        { error: "Could not mark the notification as read" },
        { status: 500 }
      );
    }

    if (updated && updated.length > 0) {
      return NextResponse.json(
        { message: "Notification marked as read", readAt: updated[0].read_at },
        { status: 200 }
      );
    }

    // Nothing matched: either it was already read, or it is not this user's
    // notification. Only the second is an error, so disambiguate.
    const { data: existing } = await supabase
      .from("notifications")
      .select("id, read_at")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json(
        { error: "Notification not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { message: "Notification was already read", readAt: existing.read_at },
      { status: 200 }
    );
  } catch (error) {
    console.error(
      "[notifications/read] unexpected error:",
      error instanceof Error ? error.message : String(error)
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
