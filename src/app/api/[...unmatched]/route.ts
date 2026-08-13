import { NextResponse } from "next/server";

/**
 * Catch-all 404 for the API surface.
 *
 * WHY. Next's App Router answers an unmatched route with the not-found page.
 * For GET that carries a 404, which is correct. For every other method it
 * renders the same HTML with **HTTP 200** — verified in production:
 *
 *     GET  /api/does-not-exist  ->  404
 *     POST /api/does-not-exist  ->  200   x-matched-path: /_not-found
 *
 * A client that POSTs to a mistyped or renamed endpoint therefore gets `res.ok
 * === true` and an HTML body where JSON was expected. On an API that moves
 * money, "the endpoint you called does not exist" must never look like success.
 *
 * This is the same reasoning that made the retired card endpoints explicit 410s
 * rather than deletions — a straggler caller has to fail loudly. Those
 * tombstones are concrete routes and still win: a catch-all is the lowest
 * priority match in the App Router, so it only ever handles paths that nothing
 * else claims.
 *
 * Deliberately says nothing about what does exist. No route listing, no "did
 * you mean", no echo of the requested path — an unmatched-path handler is a
 * cheap enumeration oracle if it is chatty.
 */

export const dynamic = "force-dynamic";

function notFound(): NextResponse {
  return NextResponse.json(
    { error: "Not found" },
    { status: 404, headers: { "Cache-Control": "no-store" } }
  );
}

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
export const OPTIONS = notFound;
export const HEAD = notFound;
