const PAYPAL_BASE =
  process.env.PAYPAL_MODE === "live"
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
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
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

  const res = await fetch(`${PAYPAL_BASE}/v1/payments/payouts`, {
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
