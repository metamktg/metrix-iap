// ─── Baseline security headers ────────────────────────────────────────
//
// This server had none. For an API that serves competitor-sensitive ad
// performance data across tenants, a few headers are table stakes, and one
// of them is load-bearing rather than cosmetic.
//
// `X-Content-Type-Options: nosniff` is the load-bearing one. Two endpoints
// serve user-uploaded bytes from this origin, and lib/assetContentType now
// refuses to serve anything but known-safe image and video types inline,
// downgrading everything else to `application/octet-stream` + attachment.
// Without nosniff, a browser is free to sniff that octet-stream back into
// HTML and execute it — which would undo the downgrade completely. The two
// go together; neither is sufficient alone.
//
// The rest are cheap and uncontroversial for an API-only server (this
// process serves no HTML of its own — the SPA is served separately):
//
//   Content-Security-Policy: default-src 'none'; sandbox
//     Nothing this API returns should ever load a subresource or run
//     script. `sandbox` additionally neutralises any document that does get
//     served — the belt to nosniff's braces.
//   X-Frame-Options: DENY
//     No API response has any reason to be framed. Does not affect <img>
//     or <video> loads of the asset endpoints, only framing.
//   Referrer-Policy: no-referrer
//     Asset and file URLs carry account and import ids in the path. Those
//     ids are access-control-adjacent (see lib/creativeFileCache) and have
//     no business being sent to third-party origins in a Referer header.
//   Strict-Transport-Security
//     Set only when the request arrived over HTTPS, so local http
//     development is unaffected. `trust proxy` is enabled in app.ts, so
//     req.secure reflects the deployment's X-Forwarded-Proto.
//
// Deliberately NOT set here: a permissive CSP with allowances for scripts
// or styles. If this process ever starts serving HTML, that needs its own
// policy written against the real page, not an inherited one loosened
// until the app renders.

import type { Request, Response, NextFunction } from "express";

const ONE_YEAR_SECONDS = 31_536_000;

export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (req.secure) {
    res.setHeader("Strict-Transport-Security", `max-age=${ONE_YEAR_SECONDS}; includeSubDomains`);
  }
  next();
}
