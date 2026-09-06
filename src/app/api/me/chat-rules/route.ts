import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { acceptChatRulesSchema } from "@/lib/validations";
import { assertSameOrigin } from "@/lib/request-guards";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

/**
 * The click-to-message agreement.
 *
 * Before a player may post in any pool chat they must accept, once per rules
 * version, that they will not discuss the specifics of their picks. The
 * acceptance is stored on user_compliance — a table with NO client write
 * grant — so it is written here with the service role after the caller has
 * been identified, and the chat route refuses a post until it exists.
 *
 * Bumping platform_settings.chat_rules_version re-prompts everyone.
 */

async function chatSettings(): Promise<{ version: string; slowModeSeconds: number }> {
  const { data } = await createAdminClient()
    .from("platform_settings")
    .select("chat_rules_version, chat_slow_mode_seconds")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    version: (data?.chat_rules_version as string | undefined) ?? "2026-09-06",
    slowModeSeconds: Number(data?.chat_slow_mode_seconds ?? 10),
  };
}

async function currentVersion(): Promise<string> {
  return (await chatSettings()).version;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [{ version, slowModeSeconds }, { data: row }] = await Promise.all([
      chatSettings(),
      createAdminClient()
        .from("user_compliance")
        .select("chat_rules_accepted_at, chat_rules_version")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    const accepted =
      !!row?.chat_rules_accepted_at && row?.chat_rules_version === version;

    return NextResponse.json(
      {
        version,
        accepted,
        acceptedAt: accepted ? row?.chat_rules_accepted_at : null,
        slowModeSeconds,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const csrf = assertSameOrigin(request);
    if (csrf) return csrf;

    const limited = await enforceRateLimit(request, "chat:rules", RATE_LIMITS.chatRulesAccept);
    if (limited) return limited;

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = acceptChatRulesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const version = await currentVersion();
    if (parsed.data.version !== version) {
      // The client accepted an older text than the one now in force. Make it
      // re-read; the UI shows the version it fetched, so this is only a race.
      return NextResponse.json(
        { error: "The chat rules have been updated. Please review them again.", version },
        { status: 409 }
      );
    }

    const { error } = await createAdminClient().from("user_compliance").upsert(
      {
        user_id: user.id,
        chat_rules_accepted_at: new Date().toISOString(),
        chat_rules_version: version,
      },
      { onConflict: "user_id" }
    );
    if (error) {
      return NextResponse.json({ error: "Could not record your acceptance" }, { status: 500 });
    }

    return NextResponse.json({ accepted: true, version }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
