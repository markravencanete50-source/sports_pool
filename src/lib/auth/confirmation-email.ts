type SignupConfirmationEmail = {
  to: string;
  name: string;
  confirmationUrl: string;
  userId: string;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character];
  });
}

export function buildSignupConfirmationEmail(
  name: string,
  confirmationUrl: string
): { html: string; text: string } {
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(confirmationUrl);

  return {
    html: `
      <div style="background:#07101f;padding:32px 16px;font-family:Arial,sans-serif;color:#eef4ff">
        <div style="max-width:560px;margin:0 auto;background:#0d1930;border:1px solid #22365d;border-radius:14px;padding:32px">
          <h1 style="margin:0 0 16px;color:#ffffff;font-size:28px">Confirm your SportsPool account</h1>
          <p style="font-size:16px;line-height:1.6">Hi ${safeName},</p>
          <p style="font-size:16px;line-height:1.6">Confirm your email address to finish creating your SportsPool account.</p>
          <p style="margin:28px 0">
            <a href="${safeUrl}" style="display:inline-block;background:#477df4;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:8px">Confirm email address</a>
          </p>
          <p style="font-size:13px;line-height:1.6;color:#9caccc">If you did not request this account, you can safely ignore this email.</p>
        </div>
      </div>`,
    text: `Hi ${name},\n\nConfirm your email address to finish creating your SportsPool account:\n${confirmationUrl}\n\nIf you did not request this account, you can safely ignore this email.`,
  };
}

export async function sendSignupConfirmationEmail({
  to,
  name,
  confirmationUrl,
  userId,
}: SignupConfirmationEmail): Promise<{ ok: boolean; status: number }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, status: 503 };
  }

  const from =
    process.env.AUTH_EMAIL_FROM?.trim() ||
    "SportsPool <support@playsportspool.com>";
  const content = buildSignupConfirmationEmail(name, confirmationUrl);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `signup-confirmation-${userId}`,
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Confirm your SportsPool account",
      html: content.html,
      text: content.text,
    }),
    cache: "no-store",
  });

  return { ok: response.ok, status: response.status };
}
