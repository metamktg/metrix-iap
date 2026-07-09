const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Resend's shared sandbox sender. Emails from this address are ONLY
 * delivered to the Resend account owner's inbox — every other recipient is
 * rejected with a 403. Real delivery requires a verified domain at
 * resend.com/domains plus REQUEST_ACCESS_FROM_EMAIL set to a sender on it.
 */
export const SANDBOX_SENDER = "onboarding@resend.dev";

export type EmailMode = "missing_key" | "sandbox" | "configured";

export interface EmailDeliveryResult {
  status: "sent" | "skipped" | "failed";
  /** Human-readable explanation when status is not "sent". */
  reason?: string;
}

export interface EmailLogger {
  info: (obj: object, msg: string) => void;
  warn: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
}

export const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export function resolveFromAddress(): string {
  return (
    process.env["REQUEST_ACCESS_FROM_EMAIL"] ?? `Metrix <${SANDBOX_SENDER}>`
  );
}

export function isSandboxSender(from: string = resolveFromAddress()): boolean {
  return from.toLowerCase().includes(SANDBOX_SENDER);
}

/** Current delivery configuration, for the admin status endpoint/banner. */
export function getEmailConfig(): { mode: EmailMode; from: string } {
  const from = resolveFromAddress();
  if (!process.env["RESEND_API_KEY"]) return { mode: "missing_key", from };
  return { mode: isSandboxSender(from) ? "sandbox" : "configured", from };
}

const SANDBOX_HINT =
  "Email delivery is in sandbox mode: the sandbox sender (onboarding@resend.dev) only delivers to the Resend account owner's inbox. Verify a domain at resend.com/domains and set REQUEST_ACCESS_FROM_EMAIL to a sender on that domain.";

/**
 * Send an email through the Resend REST API.
 *
 * Returns a structured result and never throws — callers decide how to
 * surface a non-delivery (fallback credentials in the admin UI, neutral
 * responses on auth routes, etc.).
 */
export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  /** Short label for log lines, e.g. "approval email". */
  kind: string;
  log: EmailLogger;
}): Promise<EmailDeliveryResult> {
  const { to, subject, html, kind, log } = params;
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) {
    const reason = `RESEND_API_KEY is not set — ${kind} skipped (delivery disabled).`;
    log.warn({ to, kind }, reason);
    return { status: "skipped", reason };
  }

  const from = resolveFromAddress();

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });

    if (!response.ok) {
      const body = await response.text();
      let providerMessage = body;
      try {
        const parsed = JSON.parse(body) as { message?: string };
        if (typeof parsed.message === "string") providerMessage = parsed.message;
      } catch {
        // keep raw body
      }
      const sandboxRejection =
        isSandboxSender(from) && response.status === 403;
      const reason = sandboxRejection
        ? `${SANDBOX_HINT} (provider said: ${providerMessage})`
        : `Email provider rejected the ${kind} (${response.status}): ${providerMessage}`;
      log.error(
        { status: response.status, body, to, kind, sandbox: sandboxRejection },
        `Resend rejected ${kind}`,
      );
      return { status: "failed", reason };
    }

    log.info({ to, kind }, `${kind} sent`);
    return { status: "sent" };
  } catch (err) {
    const reason = `Network error while sending the ${kind} — the email provider could not be reached.`;
    log.error({ err, to, kind }, `Failed to send ${kind}`);
    return { status: "failed", reason };
  }
}
