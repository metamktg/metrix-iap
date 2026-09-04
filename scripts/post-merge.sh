#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push
# The applier records a fingerprint and skips an unchanged schema, so this is
# instant on most merges. A changed schema applies one statement per
# transaction with a 3 s lock_timeout and retries; 150 s leaves room for a
# few lock retries under the hook's 180 s ceiling. A kill mid-way is safe:
# every statement is idempotent and the fingerprint is only written at the end.
timeout 150s pnpm --filter @workspace/scripts exec tsx ./src/apply-supabase-schema.ts || {
  status=$?
  if [ "$status" -eq 124 ]; then
    echo "WARNING: Supabase schema apply timed out after 150s. It is idempotent and resumes on the next merge; to apply now: pnpm --filter @workspace/scripts exec tsx ./src/apply-supabase-schema.ts" >&2
  else
    exit "$status"
  fi
}
