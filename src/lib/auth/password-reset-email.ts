type PasswordResetEmail = {
  to: string;
  resetUrl: string;
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

export function buildPasswordResetEmail(resetUrl: string): {
  html: string;
  text: string;
} {
  const safeUrl = escapeHtml(resetUrl);
  return {
    html: `
      <div style="background:#07101f;padding:32px 16px;font-family:Arial,sans-serif;color:#eef4ff">
        <div style="max-width:560px;margin:0 auto;background:#0d1930;border:1px solid #22365d;border-radius:14px;padding:32px">
          <h1 style="margin:0 0 16px;color:#ffffff;font-size:28px">Reset your SportsPool password</h1>
          <p style="font-size:16px;line-height:1.6">Use the secure link below to choose a new password. The link expires and can only be used for account recovery.</p>
          <p style="margin:28px 0">
            <a href="${safeUrl}" style="display:inline-block;background:#477df4;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:8px">Reset password</a>
          </p>
          <p style="font-size:13px;line-height:1.6;color:#9caccc">If you did not request this, you can safely ignore this email. Your password has not changed.</p>
        </div>
      </div>`,
    text: `Reset your SportsPool password:\n${resetUrl}\n\nIf you did not request this, you can safely ignore this email. Your password has not changed.`,
  };
}

export async function sendPasswordResetEmail({
  to,
  resetUrl,
}: PasswordResetEmail): Promise<{ ok: boolean; status: number }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { ok: false, status: 503 };

  const from =
    process.env.AUTH_EMAIL_FROM?.trim() ||
    "SportsPool <support@playsportspool.com>";
  const content = buildPasswordResetEmail(resetUrl);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Reset your SportsPool password",
      html: content.html,
      text: content.text,
    }),
    cache: "no-store",
  });

  return { ok: response.ok, status: response.status };
}
