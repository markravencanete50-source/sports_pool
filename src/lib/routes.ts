/** Main app hub. App routes live under `src/app/(app)/`; landing is `(marketing)/page`. */
export const DASHBOARD_PATH = "/dashboard" as const;

/**
 * Clamp a caller-supplied redirect target to a same-origin path.
 * `new URL(value, base)` DISCARDS the base for absolute ("https://…") and
 * protocol-relative ("//…", and "/\…" — browsers treat backslash as slash)
 * values, so anything that is not a plain in-app path falls back to the
 * dashboard. Tab/CR/LF are stripped first because URL parsers strip them
 * before parsing ("/\t/evil" would otherwise slip through as "//evil").
 */
export function safeInternalPath(value: string | null | undefined): string {
  if (!value) return DASHBOARD_PATH;
  const path = value.replace(/[\t\n\r]/g, "");
  if (!path.startsWith("/")) return DASHBOARD_PATH;
  if (path[1] === "/" || path[1] === "\\") return DASHBOARD_PATH;
  return path;
}
