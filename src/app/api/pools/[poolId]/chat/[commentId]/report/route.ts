import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { contentReportSchema } from "@/lib/validations";
import { assertSameOrigin } from "@/lib/request-guards";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { uuidParamSchema } from "@/lib/validations";
import { NextResponse } from "next/server";

/**
 * A player reports a chat message. The report lands in content_reports for
 * the moderation console; the comment itself is untouched until a moderator
 * acts. One report per (reporter, comment) — the unique index makes a second
 * one a no-op rather than a second queue entry.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ poolId: string; commentId: string }> }
) {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const limited = await enforceRateLimit(request, "chat:report", RATE_LIMITS.contentReport);
    if (limited) return limited;

    const { poolId, commentId } = await params;
    if (!uuidParamSchema.safeParse(commentId).success || !uuidParamSchema.safeParse(poolId).success) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = contentReportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid report" },
        { status: 400 }
      );
    }

    // The reporter must be able to see the comment (RLS: card holder or
    // participant, and the comment visible). Reading it through the session
    // client proves both in one query and yields the reported user.
    const { data: comment } = await supabase
      .from("comments")
      .select("id, user_id, pool_id")
      .eq("id", commentId)
      .eq("pool_id", poolId)
      .maybeSingle();
    if (!comment) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }
    if (comment.user_id === user.id) {
      return NextResponse.json({ error: "You cannot report your own message" }, { status: 400 });
    }

    const { error } = await createAdminClient().from("content_reports").upsert(
      {
        reporter_id: user.id,
        reported_user_id: comment.user_id,
        comment_id: comment.id,
        pool_id: comment.pool_id,
        reason: parsed.data.reason,
      },
      { onConflict: "reporter_id,comment_id", ignoreDuplicates: true }
    );
    if (error) {
      return NextResponse.json({ error: "Could not file the report" }, { status: 500 });
    }

    return NextResponse.json({ reported: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
