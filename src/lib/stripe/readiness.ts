import type Stripe from "stripe";

/** Authenticate without creating a payment. Fail closed if Stripe cannot verify readiness. */
export async function stripeAccountReady(stripe: Stripe): Promise<boolean> {
  const account = await stripe.accounts.retrieve(null);
  return account.charges_enabled === true && account.capabilities?.card_payments === "active";
}
