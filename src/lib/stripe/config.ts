import Stripe from "stripe";

let stripeInstance: Stripe | null = null;

export function stripeKeyMode(key: string | undefined): "live" | "test" | "unset" {
  const match = key?.trim().match(/^(?:sk|rk)_(live|test)_.+$/);
  return (match?.[1] as "live" | "test" | undefined) ?? "unset";
}

export function checkoutConfigurationError(
  key = process.env.STRIPE_SECRET_KEY,
  environment = process.env.VERCEL_ENV,
): string | null {
  const mode = stripeKeyMode(key);
  if (mode === "unset") return "Card payments are temporarily unavailable. Please contact support.";
  if (environment === "production" && mode !== "live") {
    return "Card payments are temporarily unavailable because the payment service is in test mode. No payment has been taken. Please contact support.";
  }
  return null;
}

function getSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key || stripeKeyMode(key) === "unset") {
    throw new Error("STRIPE_SECRET_KEY must be a valid secret or restricted Stripe key");
  }
  return key;
}

export function getStripe(): Stripe {
  if (!stripeInstance) {
    stripeInstance = new Stripe(getSecretKey(), {
      // Must match the version the installed SDK major is built against —
      // stripe v22 types this as a literal, so a stale pin fails typecheck
      // rather than drifting silently. Moving the SDK major moves this line.
      apiVersion: "2026-08-26.dahlia",
      typescript: true,
    });
  }
  return stripeInstance;
}

export function getStripePublishableKey(): string {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key?.startsWith("pk_")) {
    throw new Error("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY must be set and start with pk_");
  }
  return key;
}
