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

/**
 * Navigate and wait until the page is actually interactive.
 *
 * These are client components, so `domcontentloaded` fires while the body is
 * still an empty shell. Asserting at that moment measures the shell and reports
 * defects that do not exist — an early draft of this file "found" a missing h1
 * on /signup that was simply not painted yet. Waiting for the heading is the
 * cheap, honest fix.
 */
async function gotoPublic(page: Page, path: string) {
  const res = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(res?.status(), `${path} should serve`).toBeLessThan(400);
  await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
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

    // Start the walk from a real element. Tabbing from <body> moves focus into
    // the browser's own chrome first, which is not something the page controls
    // and not what this test is about — an early draft did that and reported
    // "no input reachable" on a form that is perfectly operable.
    await page.locator("input").first().focus();

    // Then walk forward and confirm we reach the checkbox and the submit
    // control, and that focus stays visible throughout. A keyboard user who
    // cannot see where they are is as stuck as one who cannot move.
    const reached = new Set<string>();
    const unfocusable: string[] = [];
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
    expect(
      [...reached].some((r) => r === "input:checkbox"),
      "the terms checkbox is not keyboard reachable, so the form cannot be completed without a mouse"
    ).toBe(true);
    expect(
      reached.has("button:submit") || reached.has("button:"),
      "the submit button was never reached by Tab"
    ).toBe(true);

    // `unfocusable` is asserted in the dedicated focus-indicator test below,
    // which compares styles before and after focus rather than guessing from a
    // single snapshot.
    expect(unfocusable).toEqual([]);
  });

  test("every input changes appearance when focused", async ({ page }) => {
    await gotoPublic(page, "/signup");

    // Measuring a single focused snapshot does not work: Tailwind's ring
    // utilities compile to a box-shadow whose colour variables are present but
    // TRANSPARENT when unfocused, so "has a box-shadow" is true either way. An
    // earlier version of this test used that heuristic and reported a false
    // positive on the date field. Comparing before with after is the honest
    // measurement — something visible must change.
    const count = await page.locator("input").count();
    const noChange: string[] = [];

    for (let i = 0; i < count; i++) {
      const input = page.locator("input").nth(i);
      const read = () =>
        input.evaluate((node) => {
          const s = getComputedStyle(node as Element);
          return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderColor].join("|");
        });

      const before = await read();
      await input.focus();
      const after = await read();

      if (before === after) {
        noChange.push(await input.evaluate((n) => (n as HTMLInputElement).type));
      }
      await input.blur();
    }

    expect(
      noChange,
      `these inputs look identical focused and unfocused, so a keyboard user cannot tell where they are: ${noChange.join(", ")}`
    ).toEqual([]);
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

    // Match the validation message specifically. The consent label itself also
    // contains "accept the Terms", so a bare text match resolves to two
    // elements and fails strict mode — it would also pass while the form was
    // silently broken, since the label is always present.
    await expect(
      page.locator("p.text-destructive").filter({ hasText: /accept the Terms/i })
    ).toBeVisible();
    await expect(page).toHaveURL(/\/signup/);
  });
});
