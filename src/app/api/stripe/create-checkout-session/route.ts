import { createClient } from "@/lib/supabase/server";
import { getPoolForUser } from "@/lib/pool-access";
import { getPoolFinancials } from "@/lib/pool-financials";
import { checkoutConfigurationError, getStripe } from "@/lib/stripe/config";
import { logEvent } from "@/lib/log";
import { createCheckoutSessionSchema } from "@/lib/validations";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/request-guards";
import { assertCompliance } from "@/lib/compliance";
import { NextResponse } from "next/server";
import { z } from "zod";
import { encodeCheckoutPicks } from "@/lib/checkout-picks";

const getBaseUrl = (): string => {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (!url) throw new Error("NEXT_PUBLIC_APP_URL is not set");
  return url.replace(/\/$/, "");
};

export async function POST(request: Request) {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const limited = await enforceRateLimit(request, "stripe:checkout", RATE_LIMITS.checkout);
    if (limited) return limited;

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createCheckoutSessionSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Validation error";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    const { poolId, entryFee, picks } = parsed.data;

    const configurationError = checkoutConfigurationError();
    if (configurationError) {
      logEvent("error", "stripe.checkout_configuration_invalid");
      return NextResponse.json(
        { error: configurationError, code: "payment_configuration_error" },
        { status: 503 },
      );
    }

    const { data: pool } = await getPoolForUser(
      supabase,
      poolId,
      user.id,
      "id, status, max_participants, entry_fee, starts_at, ends_at"
    );

    if (!pool) {
      return NextResponse.json({ error: "Pool not found" }, { status: 404 });
    }

    if (pool.status !== "open" && pool.status !== "active") {
      return NextResponse.json(
        {
          error:
            pool.status === "paused"
              ? "This pool is paused by an administrator. Purchases will reopen when it resumes."
              : "Pool is not accepting new cards",
        },
        { status: 400 }
      );
    }

    // Entry window (custom pool duration). Checked here, at the money
    // boundary, not only in the UI: a stale tab must not buy into a closed pool.
    const windowPool = pool as typeof pool & { starts_at?: string | null; ends_at?: string | null };
    const nowMs = Date.now();
    if (windowPool.starts_at && Date.parse(windowPool.starts_at) > nowMs) {
      return NextResponse.json(
        { error: `Entry opens on ${new Date(windowPool.starts_at).toLocaleString("en-US", { timeZone: "UTC" })} UTC` },
        { status: 400 }
      );
    }
    if (windowPool.ends_at && Date.parse(windowPool.ends_at) < nowMs) {
      return NextResponse.json(
        { error: "The entry window for this pool has closed" },
        { status: 400 }
      );
    }

    const { data: existingCards, error: existingCardsError } = await supabase
      .from("parlay_cards")
      .select("card_number")
      .eq("pool_id", poolId)
      .eq("user_id", user.id)
      .in("status", ["pending", "active", "completed"]);

    if (existingCardsError) {
      return NextResponse.json({ error: "Could not verify your existing cards. Please try again." }, { status: 503 });
    }

    if (existingCards && existingCards.length >= 3) {
      return NextResponse.json(
        { error: "Maximum 3 cards per user per pool" },
        { status: 400 }
      );
    }

    const { data: poolGames, error: poolGamesError } = await supabase
      .from("pool_games")
      .select("game_id")
      .eq("pool_id", poolId);
    if (poolGamesError) {
      return NextResponse.json(
        { error: "Could not verify the pool schedule" },
        { status: 500 },
      );
    }
    const poolGameIds = (poolGames ?? []).map(
      (poolGame: { game_id: string }) => poolGame.game_id,
    );
    const pickedGameIds = new Set(picks.map((pick) => pick.gameId));
    if (
      poolGameIds.length === 0 ||
      pickedGameIds.size !== poolGameIds.length ||
      poolGameIds.some((gameId) => !pickedGameIds.has(gameId))
    ) {
      return NextResponse.json(
        { error: "Make one pick for every game before paying" },
        { status: 400 },
      );
    }

    const { data: games, error: gamesError } = await supabase
      .from("games")
      .select("id, date, status")
      .in("id", poolGameIds);
    if (gamesError || !games || games.length !== poolGameIds.length) {
      return NextResponse.json(
        { error: "Could not verify every game on this card" },
        { status: 409 },
      );
    }
    const lockedGame = games.find(
      (game) =>
        game.status !== "scheduled" ||
        !Number.isFinite(Date.parse(game.date)) ||
        Date.parse(game.date) <= Date.now(),
    );
    if (lockedGame) {
      return NextResponse.json(
        { error: "This card includes a game that has already started" },
        { status: 409 },
      );
    }

    if (pool.max_participants != null) {
      const financials = await getPoolFinancials(supabase, poolId);
      const isNewPayer = !existingCards?.length;
      const paidCountAfter =
        financials.paid_participant_count + (isNewPayer ? 1 : 0);
      if (paidCountAfter > pool.max_participants) {
        return NextResponse.json(
          { error: "Pool has reached maximum participants" },
          { status: 400 }
        );
      }
    }

    const { data: platformSettings } = await supabase
      .from("platform_settings")
      .select("minimum_entry_fee")
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    // SECURITY: the price is the POOL's entry fee, never the client's.
    // This route used to charge the `entryFee` from the request body and only
    // check it against the platform minimum — so a user could enter a $500 pool
    // for the $20 floor, competing for the full pot at a fraction of the stake.
    // pool.entry_fee was already being selected and simply never compared.
    const authoritativeFee = Number(pool.entry_fee);
    if (!Number.isFinite(authoritativeFee) || authoritativeFee <= 0) {
      return NextResponse.json(
        { error: "Pool has no valid entry fee" },
        { status: 409 }
      );
    }

    /*
     * Eligibility gate. Placed here, after the authoritative fee is known, so
     * the deposit-limit check measures the amount actually about to be charged
     * rather than whatever the client proposed. Everything upstream of this
     * point is read-only; nothing has been charged yet when it refuses.
     */
    const complianceBlock = await assertCompliance({
      userId: user.id,
      headers: request.headers,
      action: "deposit",
      amount: authoritativeFee,
    });
    if (complianceBlock) return complianceBlock;

    const minimumEntryFee = platformSettings?.minimum_entry_fee ?? 20;
    if (authoritativeFee < minimumEntryFee) {
      return NextResponse.json(
        { error: `Pool entry fee is below the platform minimum of $${minimumEntryFee}` },
        { status: 409 }
      );
    }

    // Reject rather than silently overriding, so a mismatched client sees the
    // real price instead of being charged an amount it did not display.
    if (Number.isFinite(entryFee) && Math.round(entryFee * 100) !== Math.round(authoritativeFee * 100)) {
      return NextResponse.json(
        {
          error: "Entry fee does not match this pool",
          expected: authoritativeFee,
        },
        { status: 409 }
      );
    }

    const baseUrl = getBaseUrl();
    const amountCents = Math.round(authoritativeFee * 100);

    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: "Parlay Card",
              description: `Entry for pool`,
              images: [],
            },
          },
        },
      ],
      metadata: {
        poolId,
        userId: user.id,
        // Must be the authoritative fee: fulfillCardPurchase() cross-checks this
        // against session.amount_total and rejects a mismatch.
        entryFee: String(authoritativeFee),
        ...encodeCheckoutPicks(picks),
      },
      success_url: `${baseUrl}/pool/${poolId}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pool/${poolId}?new_card=1`,
      customer_email: user.email ?? undefined,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Failed to create checkout session" },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Create checkout session error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
