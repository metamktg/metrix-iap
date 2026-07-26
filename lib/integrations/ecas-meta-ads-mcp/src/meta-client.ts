import type { EcasConfig } from "./config.js";

interface MetaErrorBody {
  message?: string;
  code?: number;
  error_subcode?: number;
  type?: string;
  fbtrace_id?: string;
}

/**
 * Wraps a Meta Graph API error. Preserves Meta's own error code/message/
 * fbtrace_id (useful for support tickets) but the token is never part of
 * the message — it only ever lives in the outgoing request URL, which this
 * error type does not echo back.
 */
export class MetaApiError extends Error {
  readonly code?: number;
  readonly subcode?: number;
  readonly type?: string;
  readonly fbtraceId?: string;

  constructor(message: string, meta: MetaErrorBody = {}) {
    super(message);
    this.name = "MetaApiError";
    this.code = meta.code;
    this.subcode = meta.error_subcode;
    this.type = meta.type;
    this.fbtraceId = meta.fbtrace_id;
  }
}

/**
 * Minimal read-only Graph API client. Deliberately GET-only for now — this
 * is Stage 3 (read-only validation tools) of the build. Mutation methods
 * (POST to /adimages, /campaigns, /adsets, /adcreatives, /ads) are a
 * separate, explicitly-approved stage and are not implemented here.
 */
export class MetaGraphClient {
  private readonly graphBase: string;

  constructor(private readonly config: EcasConfig) {
    this.graphBase = `https://graph.facebook.com/${config.graphVersion}`;
  }

  async get(nodeId: string, fields: string[]): Promise<Record<string, unknown>> {
    const url = new URL(`${this.graphBase}/${nodeId}`);
    url.searchParams.set("fields", fields.join(","));
    url.searchParams.set("access_token", this.config.accessToken);

    let response: Response;
    try {
      response = await fetch(url);
    } catch (error) {
      throw new MetaApiError(`Network error calling Meta Graph API: ${(error as Error).message}`);
    }

    let body: { error?: MetaErrorBody; [key: string]: unknown };
    try {
      body = (await response.json()) as typeof body;
    } catch {
      throw new MetaApiError(`Meta Graph API returned a non-JSON response (status ${response.status}).`);
    }

    if (!response.ok || body.error) {
      const err = body.error ?? {};
      throw new MetaApiError(err.message ?? `Meta API request failed with status ${response.status}`, err);
    }

    return body;
  }
}
