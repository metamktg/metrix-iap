const RESEND_ENDPOINT = "https://api.resend.com/emails";

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

/**
 * Send the password reset email containing the single-use reset link.
 *
 * Returns "sent", "skipped" (RESEND_API_KEY not configured), or "failed"
 * (provider error). Never throws: the request-reset endpoint always responds
 * neutrally regardless of delivery outcome.
 */
export async function sendPasswordResetEmail(
  email: string,
  resetUrl: string,
  appBaseUrl: string,
  log: {
    info: (obj: object, msg: string) => void;
    warn: (obj: object, msg: string) => void;
    error: (obj: object, msg: string) => void;
  },
): Promise<"sent" | "skipped" | "failed"> {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) {
    log.warn(
      { email },
      "RESEND_API_KEY not set — password reset email skipped (reset link not delivered)",
    );
    return "skipped";
  }

  const from =
    process.env["REQUEST_ACCESS_FROM_EMAIL"] ?? "Metrix <onboarding@resend.dev>";
  const logoUrl = `${appBaseUrl}metrix-logo.png`;

  const html = `
    <div style="font-family:sans-serif;font-size:14px;color:#222;max-width:520px;">
      <div style="margin-bottom:16px;">
        <img src="${escapeHtml(logoUrl)}" alt="Metrix" width="28" height="28" style="vertical-align:middle;border:0;" />
        <span style="font-size:16px;font-weight:700;letter-spacing:-0.02em;vertical-align:middle;margin-left:8px;">Metrix</span>
      </div>
      <h2 style="margin:0 0 8px;">Reset your Metrix password</h2>
      <p>We received a request to reset the password for
        <strong>${escapeHtml(email)}</strong>.</p>
      <p style="margin:20px 0;">
        <a href="${escapeHtml(resetUrl)}" style="background:#4f46e5;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;display:inline-block;">Choose a new password</a>
      </p>
      <p>This link works once and expires in 1 hour.</p>
      <p style="color:#777;font-size:12px;margin-top:24px;">If you didn't request a password reset, you can safely ignore this email — your password will not change.</p>
    </div>`;

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "Reset your Metrix password",
        html,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      log.error(
        { status: response.status, body, email },
        "Resend rejected password reset email",
      );
      return "failed";
    }

    log.info({ email }, "password reset email sent");
    return "sent";
  } catch (err) {
    log.error({ err, email }, "Failed to send password reset email");
    return "failed";
  }
}
