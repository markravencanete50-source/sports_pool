import Stripe from "stripe";

let stripeInstance: Stripe | null = null;

function getSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.startsWith("sk_")) {
    throw new Error("STRIPE_SECRET_KEY must be set and start with sk_");
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
