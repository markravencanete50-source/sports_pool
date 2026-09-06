/**
 * Payout providers behind one interface.
 *
 * The brief asks for the payout layer to be provider-agnostic so a second
 * rail (Revolut, bank transfer) can be added without rewriting the approval
 * flow. This is that seam. The admin completion route asks the registry for
 * the provider matching the user's saved payout method and calls `send`; it
 * neither knows nor cares whether money moved over an API or an operator is
 * about to do it by hand.
 *
 * Two kinds of provider exist:
 *   - API providers actually move money and return a provider reference.
 *   - MANUAL providers do not: `send` returns instructions and a `manual`
 *     flag, and the route records the request as awaiting an operator, who
 *     completes it after sending the funds outside the platform. Revolut and
 *     bank transfer are manual until the client provisions API credentials.
 */

export type PayoutMethod = "paypal" | "revolut" | "bank_transfer";

export interface PayoutRequestInput {
  payoutRequestId: string;
  userId: string;
  amount: number;
  currency: string;
  /** The user's saved identifier for this method (PayPal email, IBAN, …). */
  identifier: string;
  note?: string;
}

export type PayoutSendResult =
  | {
      kind: "sent";
      providerReference: string;
      detail?: Record<string, unknown>;
    }
  | {
      kind: "manual";
      /** What the operator must do outside the platform. */
      instructions: string;
    };

export interface PayoutProvider {
  readonly method: PayoutMethod;
  readonly label: string;
  /** False until credentials exist; the route answers 503 rather than trying. */
  isConfigured(): boolean;
  /** Human-readable reason it is not configured, for the admin screen. */
  configurationProblem(): string | null;
  /** Validate the user's identifier for this rail (shape only, no network). */
  validateIdentifier(identifier: string): string | null;
  send(input: PayoutRequestInput): Promise<PayoutSendResult>;
}

const registry = new Map<PayoutMethod, PayoutProvider>();

export function registerPayoutProvider(provider: PayoutProvider): void {
  registry.set(provider.method, provider);
}

export function getPayoutProvider(method: string): PayoutProvider | null {
  return registry.get(method as PayoutMethod) ?? null;
}

export function listPayoutProviders(): PayoutProvider[] {
  return [...registry.values()];
}
