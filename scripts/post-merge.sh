#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push
pnpm --filter @workspace/scripts exec tsx ./src/apply-supabase-schema.ts
