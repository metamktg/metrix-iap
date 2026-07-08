/** Public base URL of the Metrix IAP app (trailing slash included). */
export function getAppBaseUrl(): string {
  const domains = process.env["REPLIT_DOMAINS"];
  const domain = domains?.split(",")[0]?.trim();
  return domain ? `https://${domain}/` : "https://app.metrix.ad/";
}
