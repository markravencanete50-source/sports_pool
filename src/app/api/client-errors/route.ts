import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { recordAppError } from "@/lib/log";

/**
 * Client-side error intake, reported by the error boundaries
 * (src/app/error.tsx, src/app/global-error.tsx).
 *
 * Before this route existed, a frontend crash was invisible to operators: the
 * boundary caught it, the user saw the fallback, and nobody else ever knew.
 * Reports land in public.app_errors, which is service-role-only.
 *
 * THREAT MODEL — this endpoint is deliberately writable without auth, because
 * the errors most worth hearing about happen to users whose session just broke.
 * The blast radius is bounded instead of gated:
 *   - tight rate limit per IP (an error loop on one client cannot flood),
 *   - zod caps every field, and the table's CHECK constraints back that up,
 *   - the payload is stored inert (never rendered as HTML, never executed),
 *   - a signed-in caller's id is attached server-side from the session —
 *     the client cannot claim to be someone else.
 */

const clientErrorSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  digest: z.string().trim().max(100).optional(),
  // Path only — a full URL is rejected so nothing can launder an external
  // link (or credentials embedded in one) into operator tooling.
  url: z
    .string()
    .trim()
    .max(500)
    .regex(/^\/(?!\/)/, "url must be an in-app path")
    .optional(),
});

export async function POST(request: Request) {
  try {
    const limited = await enforceRateLimit(
      request,
      "client:errors",
      RATE_LIMITS.clientError
    );
    if (limited) return limited;

    const body = await request.json().catch(() => null);
    const parsed = clientErrorSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid report" }, { status: 400 });
    }

    // Attach the user when a session exists; never trust a client-sent id.
    let userId: string | null = null;
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    } catch {
      // Session lookup failing is exactly when reports matter most — proceed.
    }

    await recordAppError({
      source: "client",
      message: parsed.data.message,
      digest: parsed.data.digest ?? null,
      url: parsed.data.url ?? null,
      userAgent: request.headers.get("user-agent"),
      userId,
    });

    // 204: the boundary fires this and forgets it; there is nothing to read.
    return new NextResponse(null, { status: 204 });
  } catch {
    // Never let the error reporter become an error source for the client.
    return new NextResponse(null, { status: 204 });
  }
}
