import assert from "node:assert/strict";
import test from "node:test";
import { buildSignupConfirmationEmail } from "../src/lib/auth/confirmation-email";

test("signup confirmation email escapes user-controlled HTML", () => {
  const email = buildSignupConfirmationEmail(
    '<img src=x onerror="alert(1)">',
    "https://example.com/auth/callback?token_hash=a&next=b"
  );

  assert.doesNotMatch(email.html, /<img/);
  assert.match(email.html, /&lt;img/);
  assert.match(email.html, /&amp;next=b/);
  assert.match(email.text, /https:\/\/example\.com\/auth\/callback/);
});
