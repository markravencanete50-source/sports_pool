import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertSameOrigin } from "@/lib/request-guards";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  displayNameSchema,
  describeDisplayNameProblem,
  normalizeDisplayName,
} from "@/lib/display-name";

/**
 * Display name: availability check (GET) and rename (PATCH).
 *
 * WHY THE CHECK IS AUTHENTICATED AND THROTTLED. It answers "is this name
 * taken" for arbitrary input, which is an enumeration oracle by construction.
 * The names themselves are not secret — public.profiles is world-readable so
 * that chat authorship and the winners list work — but there is a difference
 * between a public list and a purpose-built endpoint that will answer
 * thousands of times a minute, so it requires a session and is rate limited.
 * The underlying RPC is granted to `authenticated` only, never `anon`.
 *
 * WHY THE RENAME GOES THROUGH THE USER'S OWN CLIENT rather than the service
 * role: `authenticated` holds UPDATE(name, avatar) on public.users and RLS
 * scopes the row to the caller, so the database enforces both ownership and
 * the name rules. Using the service role here would bypass exactly the
 * controls that make this safe and would mean a bug in this file could rename
 * somebody else's account.
 *
 * A rename cannot be "checked then applied" safely — the gap between the two
 * is a race — so the unique index is the real decision and 23505 is translated
 * into the same sentence the checker would have produced.
 */

export const dynamic = "force-dynamic";

/** Postgres unique-violation. The index, or the reserved-name trigger. */
const UNIQUE_VIOLATION = "23505";
/** Postgres check-constraint violation: users_name_format. */
const CHECK_VIOLATION = "23514";

const TAKEN_MESSAGE =
  "That display name is not available. Please choose another.";

export async function GET(request: Request) {
  const limited = await enforceRateLimit(
    request,
    "profile:name-check",
    RATE_LIMITS.displayNameCheck
  );
  if (limited) return limited;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = new URL(request.url).searchParams.get("name") ?? "";
  const candidate = normalizeDisplayName(raw);

  // Answer shape problems locally: they need no database round trip and the
  // wording is more useful than "unavailable".
  const problem = describeDisplayNameProblem(candidate);
  if (problem) {
    return NextResponse.json(
      { available: false, reason: problem },
      { status: 200 }
    );
  }

  // is_display_name_available() excludes the caller's own row, so re-saving an
  // unchanged name reads as available rather than as self-collision.
  const { data, error } = await supabase.rpc("is_display_name_available", {
    candidate,
  });

  if (error) {
    console.error("[display-name] availability check failed:", error.message);
    return NextResponse.json(
      { error: "Could not check that name just now." },
      { status: 503 }
    );
  }

  return NextResponse.json(
    {
      available: data === true,
      reason: data === true ? null : TAKEN_MESSAGE,
    },
    { status: 200 }
  );
}

export async function PATCH(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const limited = await enforceRateLimit(
    request,
    "profile:name",
    RATE_LIMITS.profileUpdate
  );
  if (limited) return limited;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = displayNameSchema.safeParse(
    (body as { name?: unknown })?.name ?? ""
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid display name" },
      { status: 400 }
    );
  }
  const name = parsed.data;

  // No pre-check: between a check and an update another account can take the
  // name. The unique index decides, and its error is translated below.
  const { error } = await supabase
    .from("users")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      // Covers both a genuine collision and the reserved-name trigger, which
      // raises 23505 deliberately so the two are indistinguishable from
      // outside. "That one is reserved" is a hint worth not giving.
      return NextResponse.json({ error: TAKEN_MESSAGE }, { status: 409 });
    }
    if (error.code === CHECK_VIOLATION) {
      return NextResponse.json(
        { error: "That display name is not allowed." },
        { status: 400 }
      );
    }
    console.error("[display-name] rename failed:", error.code, error.message);
    return NextResponse.json(
      { error: "Could not update your display name." },
      { status: 500 }
    );
  }

  return NextResponse.json({ name }, { status: 200 });
}
