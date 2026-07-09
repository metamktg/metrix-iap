import {
  sendEmail,
  escapeHtml,
  type EmailDeliveryResult,
  type EmailLogger,
} from "./email";

/**
 * Send the password reset email containing the single-use reset link.
 *
 * Never throws: the request-reset endpoint always responds neutrally
 * regardless of delivery outcome.
 */
export async function sendPasswordResetEmail(
  email: string,
  resetUrl: string,
  appBaseUrl: string,
  log: EmailLogger,
): Promise<EmailDeliveryResult> {
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

  return sendEmail({
    to: email,
    subject: "Reset your Metrix password",
    html,
    kind: "password reset email",
    log,
  });
}
