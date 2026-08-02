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
      apiVersion: "2026-01-28.clover",
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
