/** Retrying confirmation is safe: the server fulfils each Stripe session once. */
export async function confirmCheckout(
  sessionId: string,
  signal: AbortSignal,
  send: typeof fetch = fetch,
  pause: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<void> {
  let failure = "Payment confirmation is delayed. Refresh this page to retry; do not pay again.";
  for (let attempt = 0; attempt < 3; attempt++) {
    signal.throwIfAborted();
    try {
      const res = await send("/api/stripe/confirm-payment", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }), credentials: "include", signal,
      });
      const data = await res.json();
      if (res.ok && data.card?.id) return;
      failure = data.error ?? failure;
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        // Ownership, expired login and manual-review failures need action, not retries.
        throw new ConfirmationRejected(failure);
      }
    } catch (error) {
      if (signal.aborted || error instanceof ConfirmationRejected) throw error;
    }
    if (attempt < 2) await pause(1000 * (attempt + 1));
  }
  throw new Error(failure);
}

class ConfirmationRejected extends Error {}
