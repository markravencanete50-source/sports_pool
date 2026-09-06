import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/require-admin";
import { describePayoutProviders } from "@/lib/payouts";
import { NextResponse } from "next/server";

/**
 * Dashboard tiles. One RPC does the counting in the database so the page is
 * a single round trip; the money-path configuration is read from the
 * environment by NAME only (present / absent), never by value.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase, { permission: "dashboard.view" });
    if (auth instanceof NextResponse) return auth;

    const admin = createAdminClient();
    const { data: stats, error } = await admin.rpc("admin_overview_stats");
    if (error) {
      return NextResponse.json({ error: "Could not compute overview" }, { status: 500 });
    }

    const env = (name: string) => Boolean(process.env[name]?.trim());
    const config = {
      stripe: {
        secretKey: env("STRIPE_SECRET_KEY"),
        webhookSecret: env("STRIPE_WEBHOOK_SECRET"),
        mode: process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_")
          ? "live"
          : process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")
            ? "test"
            : "unset",
      },
      payouts: describePayoutProviders(),
      cronSecret: env("CRON_SECRET"),
      rateLimitBackend: env("KV_REST_API_URL") || env("UPSTASH_REDIS_REST_URL"),
      chatModeration: env("OPENAI_API_KEY"),
      alertWebhook: env("ALERT_WEBHOOK_URL"),
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    };

    return NextResponse.json(
      { stats, config, viewer: { role: auth.adminRole, permissions: auth.permissions } },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
