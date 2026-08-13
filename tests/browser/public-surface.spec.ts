import { test, expect } from "@playwright/test";

/**
 * The public surface, rendered.
 *
 * The HTTP smoke suite (tests/e2e/smoke.test.ts) already asserts these pages
 * return 200 and carry the right headers. This is the part it structurally
 * cannot check: that the page actually renders, that nothing throws in the
 * browser, and that the compliance pages a regulator would look for are
 * readable rather than merely present.
 *
 * A 200 that renders a blank screen is the failure mode that matters here —
 * the audit records that no error boundary existed at all until recently, and
 * on a balance page a user cannot tell a crash from missing money.
 */

const PUBLIC_PAGES = [
  { path: "/", mustContain: /pool|nfl|gridiron/i },
  { path: "/login", mustContain: /sign in|log in|password/i },
  { path: "/signup", mustContain: /create account/i },
  { path: "/terms", mustContain: /terms/i },
  { path: "/contest-rules", mustContain: /rules|scoring|tie/i },
  { path: "/privacy", mustContain: /privacy|data/i },
  { path: "/responsible-gaming", mustContain: /limit|exclusion|responsible/i },
  { path: "/unavailable", mustContain: /available|region|territory/i },
];

for (const { path, mustContain } of PUBLIC_PAGES) {
  test(`${path} renders real content with no console errors`, async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      // Third-party noise we neither cause nor can fix; a failed favicon or a
      // blocked analytics beacon is not an application defect.
      if (/favicon|net::ERR_|third-party cookie/i.test(text)) return;
      // The browser emits a URL-less "Failed to load resource" for every non-2xx
      // response. It carries no detail worth asserting on and duplicates the
      // response handler below, which knows the route and can tell an expected
      // 401 from a real failure. One source of truth for HTTP errors.
      if (/^Failed to load resource/i.test(text)) return;
      consoleErrors.push(text);
    });

    // The browser logs EVERY non-2xx response as a console error, including
    // ones that are the correct answer.
    //
    // 401 and 403 to an anonymous visitor are the auth guards WORKING. Several
    // public pages fetch user state on load — /responsible-gaming asks for the
    // caller's compliance settings — and are designed to render fine without
    // it. An earlier version of this filter named /api/auth/me explicitly,
    // which was the right instinct applied too narrowly: it left the assertion
    // racing whichever other 401 happened to land before the test finished,
    // and that raced differently in CI than locally.
    //
    // Everything else still fails: a 400 means we sent something malformed, a
    // 404 means we asked for something that does not exist, a 5xx is a bug. And
    // a page that genuinely NEEDS the data it was refused is caught by the
    // "renders real content" assertion below, not by this one.
    page.on("response", (r) => {
      const status = r.status();
      if (status < 400) return;
      if (status === 401 || status === 403) return;
      consoleErrors.push(`${status} ${r.url()}`);
    });
    page.on("pageerror", (err) => pageErrors.push(err.message));

    // NOT networkidle. This app holds a Supabase realtime connection open, so
    // the network never goes idle and every navigation would time out. Waiting
    // for the DOM and then for actual text is both faster and a better proxy
    // for "a human can read this".
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `${path} status`).toBeLessThan(400);

    // Rendered, not blank: a 200 serving an empty shell is the real risk.
    await expect
      .poll(async () => (await page.locator("body").innerText()).trim().length, {
        timeout: 15_000,
      })
      .toBeGreaterThan(120);

    const body = (await page.locator("body").innerText()).trim();
    expect(body.length, `${path} rendered an essentially empty body`).toBeGreaterThan(120);
    expect(body).toMatch(mustContain);

    expect(pageErrors, `${path} threw in the browser: ${pageErrors.join(" | ")}`).toEqual([]);
    expect(consoleErrors, `${path} logged console errors: ${consoleErrors.join(" | ")}`).toEqual([]);
  });
}

test("the contest rules are substantive, not a placeholder", async ({ page }) => {
  // These are published as binding terms and accepted explicitly at signup. A
  // stub here is a legal problem, not a content one.
  await page.goto("/contest-rules", { waitUntil: "domcontentloaded" });
  // Wait for the content to actually paint before measuring it; reading
  // innerText the instant the DOM is ready measures an empty shell.
  await expect
    .poll(async () => (await page.locator("body").innerText()).trim().length, { timeout: 15_000 })
    .toBeGreaterThan(1200);
  const text = await page.locator("body").innerText();
  expect(text.length, "contest rules page is too short to be binding terms").toBeGreaterThan(1200);
  for (const term of [/tie/i, /fee/i, /winner/i]) {
    expect(text, `contest rules do not mention ${term}`).toMatch(term);
  }
});

test("signup links to the documents it asks the player to accept", async ({ page }) => {
  await page.goto("/signup", { waitUntil: "domcontentloaded" });
  for (const name of [/terms/i, /contest rules/i, /privacy/i]) {
    await expect(page.getByRole("link", { name }), `signup is missing a ${name} link`).toBeVisible();
  }
});

test("a protected page sends an anonymous visitor to login, not to a crash", async ({ page }) => {
  const res = await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  expect(res?.status()).toBeLessThan(400);
  await expect(page).toHaveURL(/\/login/);
  // The login form must be usable after the redirect, not just present in the
  // URL bar — landing on a blank page is the failure worth catching.
  await expect(page.getByRole("button", { name: /sign in|log in/i })).toBeVisible();
  await expect
    .poll(async () => (await page.locator("body").innerText()).trim().length, { timeout: 15_000 })
    .toBeGreaterThan(80);
});
