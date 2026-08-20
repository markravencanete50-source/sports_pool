import { test, expect } from "@playwright/test";

/**
 * Mobile layout regression tests.
 *
 * WHY THESE EXIST. The product is played on a phone during games, and the
 * existing browser suite covers accessibility and content but nothing about
 * layout — so a responsive regression shipped silently. These pin the three
 * defects that are invisible in code review and obvious to a player:
 *
 *   1. HORIZONTAL OVERFLOW. One element wider than the viewport makes the whole
 *      page scroll sideways, and every centred layout on it looks broken. It is
 *      the single most common mobile defect and the cheapest to detect.
 *
 *   2. TAP TARGETS below the WCAG 2.5.8 (AA) floor of 24x24 CSS pixels. The
 *      standard's own exceptions are honoured: inline targets inside a sentence
 *      are constrained by line-height and are exempt, as are elements hidden
 *      until focused (the skip link).
 *
 *   3. INPUTS UNDER 16px. iOS Safari zooms the page in when a smaller input is
 *      focused, and does not zoom back out. The user is left on a page they now
 *      have to pan around. The shared Input component already guards this with
 *      `text-base md:text-sm`; a hand-rolled input is how it comes back.
 *
 * These run in the mobile-chromium project (Pixel 7). The desktop project skips
 * them: `md:` styles legitimately drop below these floors on a pointer device,
 * where a mouse is precise and there is no auto-zoom behaviour.
 */

/** Public pages only. Authenticated surfaces need a seeded session — see the note in §5.3 of the audit. */
const PAGES = [
  "/",
  "/login",
  "/signup",
  "/terms",
  "/contest-rules",
  "/privacy",
  "/responsible-gaming",
  "/cookies",
  "/contact",
  "/unavailable",
  "/public-pools",
];

/** WCAG 2.5.8 Target Size (Minimum), AA. 2.5.5 asks 44 and is AAA. */
const MIN_TAP = 24;
/** Below this, iOS Safari auto-zooms on focus. */
const MIN_INPUT_FONT = 16;

test.describe("mobile layout", () => {
  test.skip(
    ({ isMobile }) => !isMobile,
    "Mobile-only: md: styles may legitimately go below these floors on a pointer device."
  );

  for (const path of PAGES) {
    test(`${path} does not scroll sideways`, async ({ page }) => {
      await page.goto(path, { waitUntil: "networkidle" });
      // Entrance animations transform elements off-canvas mid-flight; measuring
      // during one reports overflow that no user ever sees.
      await page.waitForTimeout(1000);

      const result = await page.evaluate(() => {
        const vw = window.innerWidth;
        const offenders: string[] = [];
        for (const el of Array.from(document.querySelectorAll("*"))) {
          const s = getComputedStyle(el);
          if (s.display === "none" || s.visibility === "hidden") continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.right <= vw + 1 && r.left >= -1) continue;
          // Report the outermost offender only: children of an overflowing
          // parent are symptoms, and listing them buries the actual cause.
          if (el.parentElement) {
            const p = el.parentElement.getBoundingClientRect();
            if (p.right > vw + 1 || p.left < -1) continue;
          }
          const cls =
            typeof el.className === "string" && el.className
              ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".")
              : "";
          offenders.push(`${el.tagName.toLowerCase()}${cls} (right=${Math.round(r.right)})`);
        }
        return {
          overflow: document.documentElement.scrollWidth - vw,
          viewport: vw,
          offenders: offenders.slice(0, 5),
        };
      });

      expect(
        result.overflow,
        `Page scrolls sideways by ${result.overflow}px at ${result.viewport}px wide. ` +
          `Widest offenders: ${result.offenders.join("; ") || "(none isolated)"}`
      ).toBeLessThanOrEqual(0);
    });
  }

  test("every tap target meets the WCAG 2.5.8 minimum", async ({ page }) => {
    const failures: string[] = [];

    for (const path of PAGES) {
      await page.goto(path, { waitUntil: "networkidle" });
      await page.waitForTimeout(600);

      const small = await page.evaluate((min) => {
        const out: { sel: string; text: string; w: number; h: number }[] = [];
        const selector =
          "a[href], button, input:not([type=hidden]), select, textarea, " +
          "[role=button], [role=link], [role=checkbox], [role=switch], [role=tab]";

        for (const el of Array.from(document.querySelectorAll(selector))) {
          const s = getComputedStyle(el);
          if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0") continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          // Sub-pixel tolerance: an element styled to exactly the minimum can
          // measure 23.99 after layout rounding, and failing that is noise.
          if (r.width >= min - 0.5 && r.height >= min - 0.5) continue;

          // WCAG 2.5.8 exception, "Inline": a target inside a sentence is
          // constrained by the line-height of the text around it.
          if (el.tagName === "A" && el.closest("p, li, td, figcaption, label")) continue;
          // Visually-hidden-until-focused controls (the skip link) measure 1x1
          // at rest and are full size when they matter.
          if (el.className && String(el.className).includes("sr-only")) continue;

          const cls =
            typeof el.className === "string" && el.className
              ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".")
              : "";
          out.push({
            sel: `${el.tagName.toLowerCase()}${cls}`,
            text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30),
            w: Math.round(r.width),
            h: Math.round(r.height),
          });
        }
        return out;
      }, MIN_TAP);

      for (const t of small) {
        failures.push(`${path}: ${t.w}x${t.h} "${t.text}" ${t.sel}`);
      }
    }

    expect(
      failures,
      `Tap targets below ${MIN_TAP}x${MIN_TAP} (WCAG 2.5.8 AA):\n  ${failures.join("\n  ")}`
    ).toEqual([]);
  });

  test("no input is small enough to trigger iOS auto-zoom", async ({ page }) => {
    const failures: string[] = [];

    for (const path of PAGES) {
      await page.goto(path, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);

      const small = await page.evaluate((min) => {
        const out: { sel: string; size: number }[] = [];
        for (const el of Array.from(
          document.querySelectorAll("input:not([type=hidden]), select, textarea")
        )) {
          const s = getComputedStyle(el);
          if (s.display === "none" || s.visibility === "hidden") continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const size = parseFloat(s.fontSize);
          if (size >= min) continue;
          const cls =
            typeof el.className === "string" && el.className
              ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".")
              : "";
          out.push({ sel: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${cls}`, size });
        }
        return out;
      }, MIN_INPUT_FONT);

      for (const i of small) {
        failures.push(`${path}: ${i.size}px ${i.sel}`);
      }
    }

    expect(
      failures,
      `Inputs under ${MIN_INPUT_FONT}px will make iOS Safari zoom in on focus and stay there. ` +
        `Use "text-base md:text-sm" as the shared Input component does:\n  ${failures.join("\n  ")}`
    ).toEqual([]);
  });
});
