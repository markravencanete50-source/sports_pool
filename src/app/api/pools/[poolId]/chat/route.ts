import { createClient } from "@/lib/supabase/server";
import { createCommentSchema } from "@/lib/validations";
import { moderateChatMessage } from "@/lib/chat-moderation";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/request-guards";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ poolId: string }> }
) {
  try {
    const { poolId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    // SECURITY: this gate used to live inside `if (!authError && user)`, so an
    // anonymous request skipped it entirely and fell through to the query —
    // meaning a signed-in player without a card got 403 while a complete
    // stranger read the whole chat. Authenticate first, then authorize.
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [{ data: userCards }, { data: isParticipant }] = await Promise.all([
      supabase
        .from("parlay_cards")
        .select("id")
        .eq("pool_id", poolId)
        .eq("user_id", user.id)
        .in("status", ["pending", "active", "completed"])
        .limit(1),
      supabase
        .from("pool_participants")
        .select("id")
        .eq("pool_id", poolId)
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle(),
    ]);

    const hasAccess = (userCards?.length ?? 0) > 0 || !!isParticipant;
    if (!hasAccess) {
      return NextResponse.json(
        {
          error: "You must purchase a card to access chat",
          requiresCard: true,
        },
        { status: 403 }
      );
    }

    // Read author names from public.profiles, NOT public.users.
    //
    // users is locked to own-row SELECT (it carries email, role and balance), so
    // an embedded users(...) resolved to NULL for every author except the
    // caller and the whole chat rendered as "Unknown". profiles is the
    // world-readable (id, name, avatar) projection built for exactly this.
    const { data, error } = await supabase
      .from("comments")
      .select("*, users:profiles!comments_user_id_profiles_fkey(id, name, avatar)")
      .eq("pool_id", poolId)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ comments: data || [] }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ poolId: string }> }
) {
  try {
    const { poolId } = await params;

    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    // Throttle BEFORE the moderation call: each post costs a paid third-party
    // request, and moderation fails closed, so an unthrottled loop can knock out
    // chat for every pool at once.
    const limited = await enforceRateLimit(request, "chat:post", RATE_LIMITS.chatPost);
    if (limited) return limited;

    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [{ data: userCards }, { data: isParticipant }] = await Promise.all([
      supabase
        .from("parlay_cards")
        .select("id")
        .eq("pool_id", poolId)
        .eq("user_id", user.id)
        .in("status", ["pending", "active", "completed"])
        .limit(1),
      supabase
        .from("pool_participants")
        .select("id")
        .eq("pool_id", poolId)
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle(),
    ]);

    const hasAccess = (userCards?.length ?? 0) > 0 || !!isParticipant;
    if (!hasAccess) {
      return NextResponse.json(
        {
          error: "You must purchase a card to access chat",
          requiresCard: true,
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = createCommentSchema.parse({
      ...body,
      poolId,
    });

    const text = validatedData.text.toLowerCase();
    const cardSharingPatterns = [
      /card\s*[123]/i,
      /my\s*(pick|prediction|card)/i,
      /card\s*\d/,
    ];

    const containsCardSharing = cardSharingPatterns.some((pattern) =>
      pattern.test(text)
    );
    if (containsCardSharing) {
      console.warn(
        `Card sharing rejected from user ${user.id} in pool ${poolId}`
      );
      return NextResponse.json(
        {
          error:
            "Sharing your picks or card details is not allowed. Repeat violations may result in disqualification from the pool.",
          code: "CARD_SHARING_FORBIDDEN",
        },
        { status: 403 }
      );
    }

    const moderation = await moderateChatMessage(validatedData.text);
    if (!moderation.allowed) {
      return NextResponse.json(
        {
          error: moderation.reason,
          code: moderation.code,
        },
        { status: 403 }
      );
    }

    const { data, error } = await supabase
      .from("comments")
      .insert({
        pool_id: validatedData.poolId,
        user_id: user.id,
        text: validatedData.text,
      })
      .select("*, users:profiles!comments_user_id_profiles_fkey(id, name, avatar)")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ comment: data }, { status: 201 });
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
