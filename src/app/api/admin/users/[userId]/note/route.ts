import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { recordAdminAction } from "@/lib/compliance/audit";
import { assertSameOrigin } from "@/lib/request-guards";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isUuid, badRequest, notFound } from "@/lib/admin/helpers";
import { z } from "zod";

/** Free-text administrative note on a user. Visible only in the console. */
const bodySchema = z.object({ note: z.string().trim().max(2000) });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const limited = await enforceRateLimit(request, "admin:user-note", RATE_LIMITS.adminAction);
    if (limited) return limited;

    const { userId } = await params;
    if (!isUuid(userId)) return notFound("User not found");

    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return badRequest("Note is too long (max 2000 characters)");

    const supabase = await createClient();
    const auth = await requireAdmin(supabase, { permission: "users.note" });
    if (auth instanceof NextResponse) return auth;

    const admin = createAdminClient();
    const { data: before } = await admin.from("users").select("admin_note").eq("id", userId).maybeSingle();
    if (!before) return notFound("User not found");

    const note = parsed.data.note || null;
    const { error } = await admin.from("users").update({ admin_note: note }).eq("id", userId);
    if (error) return NextResponse.json({ error: "Could not save the note" }, { status: 500 });

    await recordAdminAction({
      actorId: auth.user.id,
      action: "user.note",
      targetType: "user",
      targetId: userId,
      before: { admin_note: before.admin_note },
      after: { admin_note: note },
    });

    return NextResponse.json({ ok: true, admin_note: note }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
