import {
  sendEmail,
  escapeHtml,
  type EmailDeliveryResult,
  type EmailLogger,
} from "./email";

/**
 * Send the approval email containing a temporary password.
 *
 * Never throws: the caller decides how to surface the temporary password
 * when the email cannot be delivered (admin copy-button fallback).
 */
export async function sendApprovalEmail(
  email: string,
  tempPassword: string,
  appUrl: string,
  log: EmailLogger,
): Promise<EmailDeliveryResult> {
  const logoUrl = `${appUrl}metrix-logo.png`;

  const html = `
    <div style="font-family:sans-serif;font-size:14px;color:#222;max-width:520px;">
      <div style="margin-bottom:16px;">
        <img src="${escapeHtml(logoUrl)}" alt="Metrix" width="28" height="28" style="vertical-align:middle;border:0;" />
        <span style="font-size:16px;font-weight:700;letter-spacing:-0.02em;vertical-align:middle;margin-left:8px;">Metrix</span>
      </div>
      <h2 style="margin:0 0 8px;">Your Metrix access is approved</h2>
      <p>Welcome to Metrix. Your account has been created for
        <strong>${escapeHtml(email)}</strong>.</p>
      <p>Sign in with this temporary password:</p>
      <p style="font-family:monospace;font-size:18px;letter-spacing:1px;background:#f4f4f5;border:1px solid #e4e4e7;border-radius:6px;padding:10px 14px;display:inline-block;">${escapeHtml(tempPassword)}</p>
      <p>You will be asked to choose a new password the first time you log in.</p>
      <p><a href="${escapeHtml(appUrl)}" style="color:#4f46e5;">Log in to Metrix</a></p>
      <p style="color:#777;font-size:12px;margin-top:24px;">If you did not request access to Metrix, you can ignore this email.</p>
    </div>`;

  return sendEmail({
    to: email,
    subject: "Your Metrix access is approved",
    html,
    kind: "approval email",
    log,
  });
}
