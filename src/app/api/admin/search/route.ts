import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/require-admin";
import { isUuid, likeTerm } from "@/lib/admin/helpers";
import { NextResponse } from "next/server";

/**
 * Global admin search: users, pools, transactions, withdrawals, games,
 * winners. Each hit carries the admin page it links to. Results are capped
 * per type so a broad term stays a quick lookup rather than a report.
 */
type Hit = { type: string; id: string; title: string; subtitle?: string; href: string };

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase, { permission: "search.use" });
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const raw = (searchParams.get("q") ?? "").trim();
    if (raw.length < 2) {
      return NextResponse.json({ hits: [] }, { status: 200 });
    }
    const term = likeTerm(raw);
    const admin = createAdminClient();
    const hits: Hit[] = [];
    const can = (p: (typeof auth.permissions)[number]) => auth.permissions.includes(p);

    const lookups: Array<Promise<void>> = [];

    if (can("users.view")) {
      lookups.push(
        (async () => {
          let q = admin.from("users").select("id, email, name, account_status").limit(6);
          q = isUuid(raw) ? q.eq("id", raw) : q.or(`email.ilike.%${term}%,name.ilike.%${term}%`);
          const { data } = await q;
          for (const u of data ?? []) {
            hits.push({
              type: "user",
              id: u.id,
              title: (u.name as string) || (u.email as string),
              subtitle: `${u.email} · ${u.account_status}`,
              href: `/admin/users/${u.id}`,
            });
          }
        })()
      );
    }

    if (can("pools.view")) {
      lookups.push(
        (async () => {
          let q = admin.from("pools").select("id, name, type, status, share_slug").limit(6);
          q = isUuid(raw) ? q.eq("id", raw) : q.or(`name.ilike.%${term}%,share_slug.eq.${term}`);
          const { data } = await q;
          for (const p of data ?? []) {
            hits.push({
              type: "pool",
              id: p.id,
              title: p.name as string,
              subtitle: `${p.type} · ${p.status}`,
              href: `/admin/pools/${p.id}`,
            });
          }
        })()
      );
    }

    if (can("transactions.view")) {
      lookups.push(
        (async () => {
          let q = admin
            .from("pool_transactions")
            .select("id, amount, status, stripe_session_id, payment_id, created_at")
            .limit(6);
          q = isUuid(raw)
            ? q.eq("id", raw)
            : q.or(`stripe_session_id.ilike.%${term}%,payment_id.ilike.%${term}%`);
          const { data } = await q;
          for (const t of data ?? []) {
            hits.push({
              type: "transaction",
              id: t.id,
              title: `Entry fee $${Number(t.amount).toFixed(2)}`,
              subtitle: `${t.status} · ${(t.stripe_session_id as string | null)?.slice(0, 24) ?? ""}`,
              href: `/admin/finance/transactions/${t.id}`,
            });
          }
        })()
      );
    }

    if (can("withdrawals.view") && isUuid(raw)) {
      lookups.push(
        (async () => {
          const { data } = await admin
            .from("payout_requests")
            .select("id, amount, status")
            .eq("id", raw)
            .limit(1);
          for (const w of data ?? []) {
            hits.push({
              type: "withdrawal",
              id: w.id,
              title: `Withdrawal $${Number(w.amount).toFixed(2)}`,
              subtitle: w.status as string,
              href: `/admin/finance/withdrawals?id=${w.id}`,
            });
          }
        })()
      );
    }

    if (can("games.view")) {
      lookups.push(
        (async () => {
          const upper = term.toUpperCase();
          const { data } = await admin
            .from("games")
            .select("id, home_team_id, away_team_id, date, status, week")
            .or(`id.eq.${term},home_team_id.eq.${upper},away_team_id.eq.${upper}`)
            .order("date", { ascending: false })
            .limit(6);
          for (const g of data ?? []) {
            hits.push({
              type: "game",
              id: g.id,
              title: `${g.away_team_id} @ ${g.home_team_id}`,
              subtitle: `wk ${g.week} · ${g.status} · ${String(g.date).slice(0, 10)}`,
              href: `/admin/games?game=${g.id}`,
            });
          }
        })()
      );
    }

    await Promise.all(lookups);
    return NextResponse.json({ hits }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
