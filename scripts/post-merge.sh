#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push
timeout 60s pnpm --filter @workspace/scripts exec tsx ./src/apply-supabase-schema.ts || {
  status=$?
  if [ "$status" -eq 124 ]; then
    echo "WARNING: Supabase schema apply timed out after 60s; schema is idempotent and will retry after the next merge." >&2
  else
    exit "$status"
  fi
}
