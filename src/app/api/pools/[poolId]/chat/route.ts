import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createCommentSchema } from "@/lib/validations";
import { moderateChatMessage } from "@/lib/chat-moderation";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/request-guards";
import { NextResponse } from "next/server";

/**
 * Pool chat.
 *
 * Reading requires a card or a participant row in the pool; the RLS policy
 * on comments enforces the same and additionally hides anything a moderator
 * has hidden or deleted, so a direct PostgREST read cannot see more than this
 * route returns.
 *
 * Posting additionally requires, in this order:
 *   1. an account in good standing (blocked / suspended accounts are refused),
 *   2. acceptance of the current chat rules (the click-to-message agreement),
 *   3. the slow-mode interval since the caller's last message in this pool,
 *   4. the card-sharing filter, then the moderation model.
 *
 * Every one of those is a server-side check. The UI mirrors them for a good
 * experience, but nothing here trusts it.
 */

const COMMENT_SELECT =
  "id, pool_id, user_id, text, game_id, moderation_status, created_at, users:profiles!comments_user_id_profiles_fkey(id, name, avatar)";

async function hasPoolAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  poolId: string,
  userId: string
): Promise<boolean> {
  const [{ data: userCards }, { data: isParticipant }] = await Promise.all([
    supabase
      .from("parlay_cards")
      .select("id")
      .eq("pool_id", poolId)
      .eq("user_id", userId)
      .in("status", ["pending", "active", "completed"])
      .limit(1),
    supabase
      .from("pool_participants")
      .select("id")
      .eq("pool_id", poolId)
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle(),
  ]);
  return (userCards?.length ?? 0) > 0 || !!isParticipant;
}

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

    if (!(await hasPoolAccess(supabase, poolId, user.id))) {
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
    const { searchParams } = new URL(request.url);
    const gameId = searchParams.get("gameId");

    let query = supabase
      .from("comments")
      .select(COMMENT_SELECT)
      .eq("pool_id", poolId)
      .eq("moderation_status", "visible")
      .order("created_at", { ascending: true });
    if (gameId) query = query.eq("game_id", gameId);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ comments: data || [] }, { status: 200 });
  } catch {
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

    if (!(await hasPoolAccess(supabase, poolId, user.id))) {
      return NextResponse.json(
        {
          error: "You must purchase a card to access chat",
          requiresCard: true,
        },
        { status: 403 }
      );
    }

    const admin = createAdminClient();

    // ── 1. Standing, 2. agreement, 3. slow mode — one round of reads. ──────
    const [{ data: standing }, { data: compliance }, { data: settings }, { data: lastOwn }] =
      await Promise.all([
        admin
          .from("users")
          .select("account_status, suspended_until")
          .eq("id", user.id)
          .maybeSingle(),
        admin
          .from("user_compliance")
          .select("chat_rules_accepted_at, chat_rules_version")
          .eq("user_id", user.id)
          .maybeSingle(),
        admin
          .from("platform_settings")
          .select("chat_rules_version, chat_slow_mode_seconds")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        admin
          .from("comments")
          .select("created_at")
          .eq("pool_id", poolId)
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    const status = (standing?.account_status as string | undefined) ?? "active";
    const suspendedUntil = standing?.suspended_until
      ? new Date(standing.suspended_until as string)
      : null;
    if (status === "blocked" || (status === "suspended" && (!suspendedUntil || suspendedUntil > new Date()))) {
      return NextResponse.json(
        { error: "Your account cannot post in chat.", code: status === "blocked" ? "account_blocked" : "account_suspended" },
        { status: 403 }
      );
    }

    const rulesVersion = (settings?.chat_rules_version as string | undefined) ?? "2026-09-06";
    const rulesAccepted =
      !!compliance?.chat_rules_accepted_at && compliance?.chat_rules_version === rulesVersion;
    if (!rulesAccepted) {
      return NextResponse.json(
        {
          error: "Please accept the chat rules before posting.",
          code: "chat_rules_required",
          version: rulesVersion,
        },
        { status: 403 }
      );
    }

    const slowSeconds = Number(settings?.chat_slow_mode_seconds ?? 10);
    if (slowSeconds > 0 && lastOwn?.created_at) {
      const elapsed = (Date.now() - new Date(lastOwn.created_at as string).getTime()) / 1000;
      if (elapsed < slowSeconds) {
        const retryAfter = Math.ceil(slowSeconds - elapsed);
        return NextResponse.json(
          {
            error: `Slow mode is on. You can post again in ${retryAfter}s.`,
            code: "slow_mode",
            retryAfter,
          },
          { status: 429, headers: { "Retry-After": String(retryAfter) } }
        );
      }
    }

    const body = await request.json();
    const validatedData = createCommentSchema.parse({
      ...body,
      poolId,
    });

    // A game thread must be one of this pool's games; anything else is a
    // typo or a probe, and either way it is not stored.
    if (validatedData.gameId) {
      const { data: inPool } = await admin
        .from("pool_games")
        .select("game_id")
        .eq("pool_id", poolId)
        .eq("game_id", validatedData.gameId)
        .maybeSingle();
      if (!inPool) {
        return NextResponse.json({ error: "That game is not part of this pool" }, { status: 400 });
      }
    }

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
        game_id: validatedData.gameId ?? null,
      })
      .select(COMMENT_SELECT)
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
