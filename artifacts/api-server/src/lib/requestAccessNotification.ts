const NOTIFY_EMAIL = "meta@metamktgagency.com";
const RESEND_ENDPOINT = "https://api.resend.com/emails";

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

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const row = (label: string, value: string | undefined): string =>
  `<tr><td style="padding:4px 12px 4px 0;color:#555;white-space:nowrap;">${label}</td><td style="padding:4px 0;">${value ? escapeHtml(value) : "—"}</td></tr>`;

/**
 * Notify the internal team about a new access request.
 *
 * Uses the Resend REST API when RESEND_API_KEY is configured. When it is not,
 * the notification is skipped with an explicit log line — the submission
 * itself is always stored in Supabase regardless.
 *
 * Returns "sent", "skipped" (no API key), or "failed" (provider error).
 * Never throws: a notification failure must not fail the submission.
 */
export async function notifyRequestAccess(
  submission: RequestAccessSubmission,
  log: {
    info: (obj: object, msg: string) => void;
    warn: (obj: object, msg: string) => void;
    error: (obj: object, msg: string) => void;
  },
): Promise<"sent" | "skipped" | "failed"> {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) {
    log.warn(
      { email: submission.email },
      "RESEND_API_KEY not set — request-access notification skipped (submission stored)",
    );
    return "skipped";
  }

  const from =
    process.env["REQUEST_ACCESS_FROM_EMAIL"] ?? "Metrix <onboarding@resend.dev>";

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

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [NOTIFY_EMAIL],
        subject: `Metrix access request: ${submission.full_name} (${submission.business_type})`,
        html,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      log.error(
        { status: response.status, body, email: submission.email },
        "Resend rejected request-access notification",
      );
      return "failed";
    }

    log.info({ email: submission.email }, "request-access notification sent");
    return "sent";
  } catch (err) {
    log.error(
      { err, email: submission.email },
      "Failed to send request-access notification",
    );
    return "failed";
  }
}
