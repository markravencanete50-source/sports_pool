import type { PayoutMethod, PayoutProvider, PayoutRequestInput, PayoutSendResult } from "./provider";

/**
 * A rail the platform records but does not drive.
 *
 * Revolut and bank transfer are handled by an operator until the client
 * provisions API access for them. `send` never moves money: it hands the
 * operator the exact instruction, and the request is marked completed only
 * after they confirm the transfer, with the reference they were given.
 *
 * The identifier validation is deliberately loose (an IBAN, a Revolut tag or
 * an account number all pass); the operator sees the raw value and decides.
 */
export function manualProvider(method: PayoutMethod, label: string): PayoutProvider {
  return {
    method,
    label,

    // "Configured" means an operator can act on it, which is always true.
    isConfigured() {
      return true;
    },
    configurationProblem() {
      return `${label} payouts are sent manually by an operator; no API credentials are configured.`;
    },

    validateIdentifier(identifier: string) {
      const v = identifier.trim();
      if (v.length < 4 || v.length > 120) return `Enter a valid ${label} account identifier`;
      if (!/^[A-Za-z0-9@._+\- ]+$/.test(v)) return `${label} identifier contains unsupported characters`;
      return null;
    },

    async send(input: PayoutRequestInput): Promise<PayoutSendResult> {
      return {
        kind: "manual",
        instructions:
          `Send ${input.currency} ${input.amount.toFixed(2)} via ${label} to "${input.identifier}" ` +
          `(request ${input.payoutRequestId}), then mark the withdrawal complete with the transfer reference.`,
      };
    },
  };
}
