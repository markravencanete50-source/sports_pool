import { NextResponse } from "next/server";

/**
 * Small shared pieces for /api/admin routes. Guards (CSRF, identity, rate
 * limit, permission) are NOT wrapped here on purpose: tests/routes.test.ts
 * verifies each route calls them by name, so every handler spells them out.
 */

export const ADMIN_PAGE_DEFAULT = 1;
export const ADMIN_LIMIT_DEFAULT = 25;
export const ADMIN_LIMIT_MAX = 100;

export function parsePagination(searchParams: URLSearchParams): {
  page: number;
  limit: number;
  from: number;
  to: number;
} {
  const page = Math.max(
    1,
    parseInt(searchParams.get("page") || String(ADMIN_PAGE_DEFAULT), 10) || ADMIN_PAGE_DEFAULT
  );
  const limit = Math.min(
    ADMIN_LIMIT_MAX,
    Math.max(1, parseInt(searchParams.get("limit") || String(ADMIN_LIMIT_DEFAULT), 10) || ADMIN_LIMIT_DEFAULT)
  );
  const from = (page - 1) * limit;
  return { page, limit, from, to: from + limit - 1 };
}

export function paged<T>(rows: T[], total: number | null, page: number, limit: number) {
  const count = total ?? rows.length;
  return { rows, total: count, page, limit, totalPages: Math.max(1, Math.ceil(count / limit)) };
}

/**
 * Make a search term safe inside a PostgREST `.or()` filter expression.
 * Strips the structural characters of that mini-language (comma, parens,
 * quotes, backslash) and escapes the LIKE wildcards.
 */
export function likeTerm(raw: string): string {
  return raw
    .trim()
    .replace(/[,()"\\]/g, " ")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .trim();
}

export function isUuid(value: string | null | undefined): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

export function badRequest(message: string, code?: string): NextResponse {
  return NextResponse.json({ error: message, ...(code ? { code } : {}) }, { status: 400 });
}

export function notFound(what = "Not found"): NextResponse {
  return NextResponse.json({ error: what }, { status: 404 });
}

export function serverError(message = "Internal server error"): NextResponse {
  return NextResponse.json({ error: message }, { status: 500 });
}

/** One place to derive a date-range filter from ?from=&to= (ISO or yyyy-mm-dd). */
export function parseDateRange(searchParams: URLSearchParams): { from: string | null; to: string | null } {
  const parse = (v: string | null) => {
    if (!v) return null;
    const ms = Date.parse(v);
    return Number.isNaN(ms) ? null : new Date(ms).toISOString();
  };
  return { from: parse(searchParams.get("from")), to: parse(searchParams.get("to")) };
}
