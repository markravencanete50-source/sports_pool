/*
 * SECURITY — PAYPAL_MODE must never fail open to sandbox.
 *
 * This was `process.env.PAYPAL_MODE === "live" ? prod : sandbox`, so ANY other
 * value — unset, "Live", "production", a trailing space, a typo — silently
 * selected the sandbox host. The payout route debits the user's REAL balance
 * and then sends fake money, so the user is out real funds and receives
 * nothing, with no error anywhere.
 *
 * The value is now strict: exactly "live" or "sandbox", anything else throws.
 * Callers can additionally refuse to run sandbox in production via isSandbox().
 */
function resolveMode(): "live" | "sandbox" {
  const raw = process.env.PAYPAL_MODE?.trim().toLowerCase();
  if (raw === "live" || raw === "sandbox") return raw;
  throw new Error(
    `PAYPAL_MODE must be exactly "live" or "sandbox" (got ${JSON.stringify(
      process.env.PAYPAL_MODE ?? null
    )}). Refusing to guess — an incorrect value sends fake money against real balances.`
  );
}

export function isSandbox(): boolean {
  return resolveMode() === "sandbox";
}

/**
 * Guard for money-moving code paths: refuse to send sandbox payouts from a
 * production deployment. Returns an error string, or null when safe.
 *
 * "Production" is VERCEL_ENV when the platform provides it — previews keep
 * NODE_ENV=production, so on Vercel only VERCEL_ENV can tell them apart. Off
 * Vercel (the self-hosted Docker stack) VERCEL_ENV never exists, and keying on
 * it alone meant this guard silently never fired on a VPS — the exact
 * deployment where nothing else would catch it. There NODE_ENV is the signal.
 *
 * A self-hosted TEST deployment has no preview tier — a production build is
 * NODE_ENV=production even while the stack is running sandbox end-to-end
 * tests. ALLOW_SANDBOX_PAYOUTS=true is the explicit, greppable opt-out for
 * that window. It must be removed at go-live; /api/health reports sandbox
 * mode in production as degraded either way, so the state stays visible.
 */
export function assertPayoutModeSafe(): string | null {
  const env = process.env.VERCEL_ENV ?? process.env.NODE_ENV;
  if (env !== "production" || !isSandbox()) return null;

  if (process.env.ALLOW_SANDBOX_PAYOUTS?.trim().toLowerCase() === "true") {
    console.warn(
      "[paypal] ALLOW_SANDBOX_PAYOUTS is set: sandbox payouts permitted on a " +
        "production build. Remove this variable before taking real money."
    );
    return null;
  }

  return "PAYPAL_MODE is 'sandbox' on a production deployment. Refusing to debit a real balance against sandbox money. (Testing on a self-host? Set ALLOW_SANDBOX_PAYOUTS=true for the test window only.)";
}

const PAYPAL_BASE = () =>
  resolveMode() === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

function getCredentials(): { clientId: string; secret: string } {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) {
    throw new Error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set");
  }
  return { clientId, secret };
}

export async function getPayPalAccessToken(): Promise<string> {
  const { clientId, secret } = getCredentials();
  const auth = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const res = await fetch(`${PAYPAL_BASE()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${auth}`,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal token failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token)
    throw new Error("PayPal token response missing access_token");
  return data.access_token;
}

export interface CreatePayoutParams {
  receiverEmail: string;
  amountUsd: number;
  note?: string;
  senderBatchId?: string;
}

export async function createPayPalPayout(
  params: CreatePayoutParams
): Promise<{ batchId: string }> {
  const { receiverEmail, amountUsd, note, senderBatchId } = params;
  const value = amountUsd.toFixed(2);
  const batchId =
    senderBatchId ??
    `payout-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const token = await getPayPalAccessToken();

  const body = {
    sender_batch_header: {
      sender_batch_id: batchId,
      email_subject: "You have a payout from Gridiron",
      email_message: note ?? "Your payout has been sent.",
    },
    items: [
      {
        recipient_type: "EMAIL",
        amount: { value, currency: "USD" },
        receiver: receiverEmail.trim().toLowerCase(),
        note: note ?? "Payout from Gridiron",
      },
    ],
  };

  const res = await fetch(`${PAYPAL_BASE()}/v1/payments/payouts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as {
      message?: string;
      details?: Array<{ issue?: string; description?: string }>;
    };
    const msg =
      err.message ?? err.details?.[0]?.description ?? (await res.text());
    throw new Error(`PayPal payout failed: ${msg}`);
  }

  const data = (await res.json()) as {
    batch_header?: { payout_batch_id?: string };
  };
  return { batchId: data.batch_header?.payout_batch_id ?? batchId };
}

export function isPayPalConfigured(): boolean {
  try {
    getCredentials();
    return true;
  } catch {
    return false;
  }
}
