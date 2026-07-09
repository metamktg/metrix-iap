import {
  sendEmail,
  escapeHtml,
  type EmailDeliveryResult,
  type EmailLogger,
} from "./email";

const NOTIFY_EMAIL = "meta@metamktgagency.com";

export interface RequestAccessSubmission {
  full_name: string;
  email: string;
  phone: string;
  business_type: string;
  industry: string;
  avg_monthly_ad_spend: string;
  website?: string;
  linkedin?: string;
}

const row = (label: string, value: string | undefined): string =>
  `<tr><td style="padding:4px 12px 4px 0;color:#555;white-space:nowrap;">${label}</td><td style="padding:4px 0;">${value ? escapeHtml(value) : "—"}</td></tr>`;

/**
 * Notify the internal team about a new access request.
 *
 * The submission itself is always stored in Supabase regardless of the
 * delivery outcome. Never throws.
 */
export async function notifyRequestAccess(
  submission: RequestAccessSubmission,
  log: EmailLogger,
): Promise<EmailDeliveryResult> {
  const html = `
    <h2 style="font-family:sans-serif;">New Metrix access request</h2>
    <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse;">
      ${row("Full name", submission.full_name)}
      ${row("Email", submission.email)}
      ${row("Phone", submission.phone)}
      ${row("Business type", submission.business_type)}
      ${row("Industry", submission.industry)}
      ${row("Avg monthly ad spend", submission.avg_monthly_ad_spend)}
      ${row("Website", submission.website)}
      ${row("LinkedIn", submission.linkedin)}
    </table>`;

  return sendEmail({
    to: NOTIFY_EMAIL,
    subject: `Metrix access request: ${submission.full_name} (${submission.business_type})`,
    html,
    kind: "request-access notification",
    log,
  });
}
