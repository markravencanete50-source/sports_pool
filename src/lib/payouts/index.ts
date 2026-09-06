import {
  registerPayoutProvider,
  getPayoutProvider,
  listPayoutProviders,
  type PayoutProvider,
  type PayoutMethod,
} from "./provider";
import { paypalProvider } from "./paypal";
import { manualProvider } from "./manual";

// Registration order is display order on the admin payments screen.
registerPayoutProvider(paypalProvider);
registerPayoutProvider(manualProvider("revolut", "Revolut"));
registerPayoutProvider(manualProvider("bank_transfer", "Bank transfer"));

export { getPayoutProvider, listPayoutProviders };
export type { PayoutProvider, PayoutMethod };
export type { PayoutRequestInput, PayoutSendResult } from "./provider";

/** Configuration summary for the admin settings screen — names, never secrets. */
export function describePayoutProviders(): Array<{
  method: PayoutMethod;
  label: string;
  configured: boolean;
  problem: string | null;
  manual: boolean;
}> {
  return listPayoutProviders().map((p) => ({
    method: p.method,
    label: p.label,
    configured: p.isConfigured(),
    problem: p.configurationProblem(),
    manual: p.method !== "paypal",
  }));
}
