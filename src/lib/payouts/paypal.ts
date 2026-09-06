import {
  assertPayoutModeSafe,
  createPayPalPayout,
  isPayPalConfigured,
} from "@/lib/paypal";
import type { PayoutProvider, PayoutRequestInput, PayoutSendResult } from "./provider";

/**
 * PayPal Payouts, wrapped. All the behaviour lives in src/lib/paypal.ts —
 * this adapter only gives it the shape the registry expects.
 */
export const paypalProvider: PayoutProvider = {
  method: "paypal",
  label: "PayPal",

  isConfigured() {
    return isPayPalConfigured() && assertPayoutModeSafe() === null;
  },

  configurationProblem() {
    if (!isPayPalConfigured()) {
      return "PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not set";
    }
    return assertPayoutModeSafe();
  },

  validateIdentifier(identifier: string) {
    const email = identifier.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
      return "Enter a valid PayPal email address";
    }
    return null;
  },

  async send(input: PayoutRequestInput): Promise<PayoutSendResult> {
    if (input.currency !== "USD") {
      throw new Error(`PayPal payouts are sent in USD; got ${input.currency}`);
    }
    const { batchId } = await createPayPalPayout({
      receiverEmail: input.identifier,
      amountUsd: input.amount,
      note: input.note,
      senderBatchId: `gridiron-${input.payoutRequestId}`,
    });
    return { kind: "sent", providerReference: batchId };
  },
};
