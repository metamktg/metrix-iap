#!/bin/sh
# ─── Is the running app actually the build you think it is? ──────────────
#
# Publishing does NOT rebuild the client (see replit.md Gotchas): `dist` is
# gitignored, so a publish can ship a stale build while reporting success.
# This checks the RUNNING artifact from outside rather than trusting a status.
#
#   sh scripts/src/verify-deployed-build.sh [url] [new-route-path]
#
# Exit 0 = the live entry bundle matches a local production build.
set -eu
URL="${1:-https://app.metrix.ad}"
NEW_ROUTE="${2:-}"
DIST="artifacts/metrix-iap/dist/public/assets"

echo "== live entry bundle =="
LIVE=$(curl -sS -m 45 "$URL/" | grep -oE 'src="/assets/index-[A-Za-z0-9_-]+\.js"' \
       | head -1 | sed 's|src="/assets/||;s|"||')
echo "  live:  ${LIVE:-<none found>}"

if [ ! -d "$DIST" ]; then
  echo "  local: no local build at $DIST — run: pnpm --filter @workspace/scripts run smoke:metrix-iap-build"
  exit 2
fi
LOCAL=$(ls "$DIST" | grep -E '^index-[A-Za-z0-9_-]+\.js$' \
        | while read -r f; do [ "$(wc -c <"$DIST/$f")" -gt 100000 ] && echo "$f"; done | head -1)
echo "  local: ${LOCAL:-<none found>}"

if [ "$LIVE" = "$LOCAL" ]; then echo "  MATCH — the deployed client is this build"
else echo "  MISMATCH — the deployed client is NOT this build"; fi

# A 200 proves nothing: the SPA fallback returns 200 + text/html for ANY path.
echo "== asset reality check (content-type, not status) =="
CT=$(curl -sS -m 30 -o /dev/null -w '%{content_type}' "$URL/assets/$LOCAL")
echo "  $LOCAL -> $CT"
case "$CT" in *javascript*) echo "  present" ;; *) echo "  ABSENT (served the SPA fallback)" ;; esac

if [ -n "$NEW_ROUTE" ]; then
  echo "== new-route probe (401 = present, 404 = absent) =="
  printf '  %s -> ' "$NEW_ROUTE"
  curl -sS -m 25 -o /dev/null -w '%{http_code}\n' -X PATCH "$URL$NEW_ROUTE" \
    -H 'Content-Type: application/json' -d '{}'
fi
[ "$LIVE" = "$LOCAL" ]
