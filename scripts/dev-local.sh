#!/bin/bash
# Dev server em modo 100% LOCAL (sem Supabase/auth) — para depuração isolada.
# Env vars vazias têm prioridade sobre o .env.local no Next (a var "existe").
export PATH="/opt/homebrew/bin:$PATH"
export NEXT_PUBLIC_SUPABASE_URL=""
export NEXT_PUBLIC_SUPABASE_ANON_KEY=""
export NEXT_PUBLIC_USE_SUPABASE_DATA=""
cd "$(dirname "$0")/.."
exec npm run dev
