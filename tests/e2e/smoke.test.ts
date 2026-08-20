import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

/**
 * End-to-end smoke harness (9.C).
 *
 * WHAT THIS IS. A black-box check against a RUNNING deployment — preview,
 * staging or production — exercising the surface an anonymous visitor and an
 * unauthenticated attacker can reach. It asserts the guards that must hold on
 * every deploy: security headers, the health contract, authentication on the
 * money routes, and that the compliance surfaces exist.
 *
 * WHAT THIS IS NOT. It is not the money-path run (BE-10). Purchase → webhook →
 * card → picks → settlement → payout needs Stripe test-mode credentials, a real
 * session and a seeded pool; that run is specified in the runbook and is still
 * outstanding. Nor is it a browser test: there is no DOM here, so keyboard and
 * screen-reader behaviour are out of scope and remain a manual pass (9.D).
 *
 * Stating both boundaries matters. A smoke suite that is mistaken for full
 * end-to-end coverage is worse than none, because it retires a risk that is
 * still live.
 *
 * HOW TO RUN
 *   E2E_BASE_URL=https://your-deployment.vercel.app npm run test:e2e
 *
 * Optionally set E2E_CRON_SECRET to also verify the authenticated health
 * detail. Without E2E_BASE_URL every test SKIPS rather than fails, so the
 * suite is safe to leave in CI before a URL exists.
 */

const BASE = process.env.E2E_BASE_URL?.trim().replace(/\/$/, "");
const CRON_SECRET = process.env.E2E_CRON_SECRET?.trim();

const skip = BASE ? false : "E2E_BASE_URL not set — skipping end-to-end smoke suite";

function url(path: string): string {
  return `${BASE}${path}`;
}

async function get(path: string, init?: RequestInit): Promise<Response> {
  return fetch(url(path), {
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
    ...init,
  });
}

describe("e2e smoke", () => {
  describe("public surface", () => {
    test("home page serves", { skip }, async () => {
      const res = await get("/");
      assert.equal(res.status, 200, `expected 200 from /, got ${res.status}`);
      const html = await res.text();
      assert.ok(html.includes("<html"), "response did not look like an HTML document");
    });

    test("terms and contest rules are published", { skip }, async () => {
      for (const path of ["/terms", "/contest-rules"]) {
        const res = await get(path);
        assert.ok(
          res.status === 200,
          `${path} must be reachable — it is referenced as binding at signup (got ${res.status})`
        );
      }
    });

    test("the geo-block landing page exists", { skip }, async () => {
      // The proxy redirects blocked territories here; if it 404s, a blocked
      // user gets a broken page instead of an explanation.
      const res = await get("/unavailable");
      assert.equal(res.status, 200, `/unavailable must render, got ${res.status}`);
    });

    test("robots and sitemap are served", { skip }, async () => {
      const robots = await get("/robots.txt");
      assert.equal(robots.status, 200);
      const sitemap = await get("/sitemap.xml");
      assert.equal(sitemap.status, 200);
    });
  });

  describe("security headers", () => {
    test("CSP is present, framing is denied, and script-src has no unsafe-inline", { skip }, async () => {
      const res = await get("/");
      const csp =
        res.headers.get("content-security-policy") ??
        res.headers.get("content-security-policy-report-only");

      assert.ok(csp, "no Content-Security-Policy header on the document response");
      assert.ok(
        /frame-ancestors\s+'none'/.test(csp),
        `frame-ancestors 'none' missing — the app is embeddable. CSP: ${csp}`
      );

      const scriptSrc = /script-src([^;]*)/.exec(csp)?.[1] ?? "";
      assert.ok(
        !scriptSrc.includes("'unsafe-inline'"),
        `script-src contains 'unsafe-inline', which defeats the nonce: ${scriptSrc}`
      );
      assert.ok(
        /'nonce-/.test(scriptSrc),
        `script-src carries no nonce: ${scriptSrc}`
      );
    });

    test("clickjacking and sniffing protections are set", { skip }, async () => {
      const res = await get("/");
      assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    });
  });

  describe("health contract", () => {
    test("unauthenticated health reveals status only, never components", { skip }, async () => {
      const res = await get("/api/health");
      assert.ok([200, 503].includes(res.status), `unexpected health status ${res.status}`);

      const body = await res.json();
      assert.ok(["ok", "degraded", "down"].includes(body.status), "missing status field");

      // The whole point of the two-shape design: no recon value when anonymous.
      assert.equal(body.components, undefined, "health leaked component detail to an anonymous caller");
      assert.equal(body.commit, undefined, "health leaked the deployed commit to an anonymous caller");

      assert.match(
        res.headers.get("cache-control") ?? "",
        /no-store/,
        "health must not be cached — a cached probe reports the past"
      );
    });

    test("a wrong secret does not unlock the detail", { skip }, async () => {
      const res = await get("/api/health", {
        headers: { authorization: "Bearer definitely-not-the-secret" },
      });
      const body = await res.json();
      assert.equal(body.components, undefined, "health leaked detail to a bad secret");
    });

    test("the correct secret returns the component breakdown", {
      skip: skip || (CRON_SECRET ? false : "E2E_CRON_SECRET not set"),
    }, async () => {
      const res = await get("/api/health", {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      });
      const body = await res.json();
      assert.ok(body.components, "authenticated health returned no components");
      assert.ok(body.components.database, "no database component reported");
      assert.ok(body.components.rateLimiting, "no rateLimiting component reported");
    });
  });

  describe("authentication boundaries", () => {
    test("money routes reject an anonymous caller", { skip }, async () => {
      const routes: Array<[string, string]> = [
        ["POST", "/api/stripe/create-checkout-session"],
        ["POST", "/api/me/payout-request"],
        ["GET", "/api/admin/users"],
        ["GET", "/api/admin/payout-requests"],
      ];

      for (const [method, path] of routes) {
        const res = await get(path, {
          method,
          headers: { "content-type": "application/json", origin: BASE! },
          body: method === "POST" ? JSON.stringify({}) : undefined,
        });
        assert.ok(
          [401, 403].includes(res.status),
          `${method} ${path} must refuse an anonymous caller, got ${res.status}`
        );
      }
    });

    test("every admin route refuses an anonymous caller", { skip }, async () => {
      // tests/routes.test.ts proves each of these CALLS requireAdmin. This
      // proves the deployed build actually refuses — the static check cannot
      // see a misconfigured middleware matcher or a bad build, and a sampled
      // handful cannot see the one route that was missed.
      const uuid = "00000000-0000-4000-8000-000000000000";
      // Methods match what each handler actually exports. Using the wrong verb
      // would return 405, which looks like a refusal but never reaches the auth
      // guard — the test would pass while proving nothing.
      const adminRoutes: Array<[string, string]> = [
        ["GET", "/api/admin/users"],
        ["GET", "/api/admin/payout-requests"],
        ["PATCH", `/api/admin/users/${uuid}/role`],
        ["PATCH", `/api/admin/payout-requests/${uuid}/complete`],
        ["PUT", `/api/admin/pools/${uuid}/settings`],
        ["POST", "/api/admin/sync/teams"],
      ];

      for (const [method, path] of adminRoutes) {
        const res = await get(path, {
          method,
          headers: { "content-type": "application/json", origin: BASE! },
          body: method === "GET" ? undefined : JSON.stringify({}),
        });
        assert.ok(
          [401, 403, 404].includes(res.status),
          `${method} ${path} must refuse an anonymous caller, got ${res.status}`
        );
        assert.notEqual(
          res.status,
          405,
          `${method} ${path} answered 405, so this assertion never reached the auth guard — fix the method`
        );
      }
    });

    test("secret-gated crons refuse an unauthenticated caller", { skip }, async () => {
      for (const path of ["/api/cron/settle", "/api/cron/reconcile", "/api/cron/alert"]) {
        const res = await get(path);
        assert.ok(
          [401, 503].includes(res.status),
          `${path} must fail closed without the secret, got ${res.status}`
        );
      }
    });

    /*
     * The Stripe webhook's authentication IS its signature — it carries no
     * session and sits outside every auth guard, so a forged delivery that got
     * through would issue cards nobody paid for.
     *
     * These assertions are deployment-independent ON PURPOSE: each one is a
     * REJECTION, so they hold without knowing the deployment's real
     * STRIPE_WEBHOOK_SECRET and can therefore run against production. The
     * positive case (a correctly-signed delivery is fulfilled exactly once)
     * needs the real secret and belongs to the money-path run, not here.
     *
     * 503 is an acceptable answer to all of them: it means the secret is unset,
     * so the endpoint is disabled and fulfilment is impossible either way.
     */
    test("the Stripe webhook refuses an unsigned delivery", { skip }, async () => {
      const res = await get("/api/stripe/webhook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "checkout.session.completed" }),
      });
      assert.ok(
        [400, 503].includes(res.status),
        `an unsigned webhook must be refused, got ${res.status}`
      );
    });

    test("the Stripe webhook refuses a forged signature", { skip }, async () => {
      // Correctly FORMED but computed with a secret we invented: exactly what
      // an attacker who has read Stripe's documentation would send.
      const body = JSON.stringify({
        id: "evt_forged",
        type: "checkout.session.completed",
        data: { object: { id: "cs_forged" } },
      });
      const ts = Math.floor(Date.now() / 1000);
      const forged = createHmac("sha256", "whsec_not_the_real_secret")
        .update(`${ts}.${body}`)
        .digest("hex");

      const res = await get("/api/stripe/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "stripe-signature": `t=${ts},v1=${forged}`,
        },
        body,
      });
      assert.ok(
        [400, 503].includes(res.status),
        `a forged webhook signature must be refused, got ${res.status}`
      );
      assert.notEqual(res.status, 200, "a forged webhook was ACCEPTED");
    });

    test("CSRF: a cross-origin state change is refused", { skip }, async () => {
      const res = await get("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.example",
        },
        body: JSON.stringify({ poolId: "00000000-0000-4000-8000-000000000000", entryFee: 20 }),
      });
      assert.ok(
        [401, 403].includes(res.status),
        `cross-origin POST must be refused, got ${res.status}`
      );
    });

    test("the retired endpoints still answer 410 rather than 404", { skip }, async () => {
      // These issued free paid cards / wrote picks the scoring engine ignored.
      // A 404 would let a straggler client fail quietly; 410 is deliberate.
      const pool = "00000000-0000-4000-8000-000000000000";
      const card = "00000000-0000-4000-8000-000000000001";

      for (const path of [
        `/api/pools/${pool}/cards/purchase`,
        `/api/pools/${pool}/cards/${card}/submit`,
      ]) {
        const res = await get(path, {
          method: "POST",
          headers: { "content-type": "application/json", origin: BASE! },
          body: JSON.stringify({}),
        });
        assert.ok(
          [410, 401, 403].includes(res.status),
          `${path} should be gone/guarded, got ${res.status}`
        );
      }
    });

    test("an unknown API path 404s on every method, not just GET", { skip }, async () => {
      // Next's App Router renders the not-found page for an unmatched route.
      // On GET that carries a 404; on every other method it returned the same
      // HTML with HTTP 200, so a client POSTing to a renamed money endpoint saw
      // res.ok === true. src/app/api/[...unmatched]/route.ts closes that.
      for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
        const res = await get("/api/definitely-does-not-exist-xyz", {
          method,
          headers: { "content-type": "application/json", origin: BASE! },
          ...(method === "GET" ? {} : { body: JSON.stringify({}) }),
        });
        assert.equal(
          res.status,
          404,
          `${method} on an unknown API path must be 404, got ${res.status}`
        );
      }
    });
  });
});
