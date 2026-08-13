import { test, expect, type Page } from "@playwright/test";

/**
 * Accessibility and keyboard operability, in a real browser.
 *
 * WHY THESE SPECIFIC ASSERTIONS. The repo already runs 21 jsx-a11y rules at
 * error severity in CI, and they are worth having — but they are a static
 * floor, and this suite exists because a floor is not a verdict. The first
 * thing writing it revealed was that every auth field was unlabelled: the
 * <label> carried no htmlFor and sat as a SIBLING of its <input>, so it looked
 * right and announced as nothing. jsx-a11y could not see it, because it cannot
 * prove a sibling input is unrelated to a label containing text.
 *
 * So the assertions here are the ones a linter structurally cannot make: does
 * the rendered accessibility tree actually expose a name, can a keyboard alone
 * reach and operate the control, does an error get announced with its field.
 */

/** Every control a user must operate to create an account. */
const SIGNUP_FIELDS = ["Name", "Email", "Password", "Date of birth"];

async function gotoPublic(page: Page, path: string) {
  const res = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(res?.status(), `${path} should serve`).toBeLessThan(400);
}

test.describe("accessible naming", () => {
  test("every signup input exposes an accessible name", async ({ page }) => {
    await gotoPublic(page, "/signup");

    // getByLabel resolves through the accessibility tree, so it passes only if
    // the label is genuinely associated — htmlFor/id, wrapping, or aria-label.
    for (const label of SIGNUP_FIELDS) {
      await expect(
        page.getByLabel(label, { exact: false }),
        `signup field "${label}" has no accessible name`
      ).toBeVisible();
    }

    // The terms checkbox gates the whole signup; it must be nameable too.
    await expect(page.locator("#accept-terms")).toBeVisible();
  });

  test("no input anywhere on signup or login is left unnamed", async ({ page }) => {
    for (const path of ["/signup", "/login"]) {
      await gotoPublic(page, path);

      const unnamed = await page.evaluate(() => {
        const bad: string[] = [];
        document.querySelectorAll("input").forEach((el) => {
          const input = el as HTMLInputElement;
          if (input.type === "hidden") return;

          const byFor = input.id
            ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`)
            : null;
          const named =
            Boolean(byFor?.textContent?.trim()) ||
            Boolean(input.getAttribute("aria-label")?.trim()) ||
            Boolean(input.getAttribute("aria-labelledby")?.trim()) ||
            Boolean(input.closest("label")?.textContent?.trim());

          if (!named) bad.push(`${input.type}${input.name ? `[name=${input.name}]` : ""}`);
        });
        return bad;
      });

      expect(unnamed, `${path} has inputs with no accessible name: ${unnamed.join(", ")}`)
        .toEqual([]);
    }
  });

  test("the page has exactly one h1 and a document title", async ({ page }) => {
    for (const path of ["/", "/signup", "/login", "/contest-rules", "/responsible-gaming"]) {
      await gotoPublic(page, path);
      await expect(page).toHaveTitle(/.+/);
      const h1s = await page.locator("h1").count();
      expect(h1s, `${path} should have exactly one h1, found ${h1s}`).toBe(1);
    }
  });
});

test.describe("keyboard operability", () => {
  test("signup is completable by keyboard alone, and focus is always visible", async ({ page }) => {
    await gotoPublic(page, "/signup");

    // Walk forward with Tab and confirm we can reach the submit control without
    // ever losing the focus ring. A keyboard user who cannot see where they are
    // is as stuck as one who cannot move.
    const reached = new Set<string>();
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const s = getComputedStyle(el);
        return {
          tag: el.tagName.toLowerCase(),
          type: (el as HTMLInputElement).type ?? "",
          text: (el.textContent ?? "").trim().slice(0, 30),
          // A visible indicator is an outline OR a ring drawn with box-shadow;
          // this app uses focus:ring-*, which compiles to box-shadow.
          hasIndicator:
            (s.outlineStyle !== "none" && parseFloat(s.outlineWidth || "0") > 0) ||
            (s.boxShadow !== "none" && s.boxShadow.length > 0),
        };
      });
      if (!info) continue;
      reached.add(`${info.tag}:${info.type}`);
      if (info.tag === "button" && /create account/i.test(info.text)) break;
    }

    expect([...reached].some((r) => r.startsWith("input:")), "no input was reachable by Tab").toBe(true);
    expect([...reached].some((r) => r === "input:checkbox"), "the terms checkbox is not keyboard reachable").toBe(true);
  });

  test("the terms checkbox toggles with the keyboard", async ({ page }) => {
    await gotoPublic(page, "/signup");
    const box = page.locator("#accept-terms");
    await expect(box).not.toBeChecked();
    await box.focus();
    await page.keyboard.press("Space");
    await expect(box, "Space must toggle the terms checkbox").toBeChecked();
  });
});

test.describe("the age gate is real in the browser", () => {
  test("an under-18 date of birth is rejected client-side with a visible reason", async ({ page }) => {
    await gotoPublic(page, "/signup");

    const tooYoung = new Date();
    tooYoung.setFullYear(tooYoung.getFullYear() - 12);

    await page.getByLabel("Name", { exact: false }).fill("Keyboard Tester");
    await page.getByLabel("Email", { exact: false }).fill(`e2e-${Date.now()}@example.com`);
    await page.getByLabel("Password", { exact: false }).fill("Str0ngPassphrase!");
    await page.getByLabel("Date of birth", { exact: false }).fill(tooYoung.toISOString().slice(0, 10));
    await page.locator("#accept-terms").check();

    await page.getByRole("button", { name: /create account/i }).click();

    // The message is the contract, not merely "it did not submit".
    await expect(
      page.getByText(/at least 18/i),
      "an under-age date of birth must be refused with a stated reason"
    ).toBeVisible();

    // And it must not have navigated away into a signed-in state.
    await expect(page).toHaveURL(/\/signup/);
  });

  test("submitting without accepting the terms is refused", async ({ page }) => {
    await gotoPublic(page, "/signup");

    const adult = new Date();
    adult.setFullYear(adult.getFullYear() - 30);

    await page.getByLabel("Name", { exact: false }).fill("Terms Refuser");
    await page.getByLabel("Email", { exact: false }).fill(`e2e-${Date.now()}@example.com`);
    await page.getByLabel("Password", { exact: false }).fill("Str0ngPassphrase!");
    await page.getByLabel("Date of birth", { exact: false }).fill(adult.toISOString().slice(0, 10));
    // deliberately leave the checkbox alone

    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page.getByText(/accept the Terms/i)).toBeVisible();
    await expect(page).toHaveURL(/\/signup/);
  });
});
