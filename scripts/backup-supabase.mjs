#!/usr/bin/env node
// Backup dos DADOS do Supabase (tabelas app_kv + talhoes) num arquivo JSON datado.
//
// Roda LOCAL. Lê a URL e a chave SECRETA (service_role, formato sb_secret_...) do
// seu .env.local — NENHUMA chave fica neste arquivo. Restaurável (re-inserindo o
// JSON). O Supabase Pro faz o backup completo/automático; este é a CÓPIA EXTERNA
// (defesa em profundidade), guardada fora do fornecedor.
//
// Uso:  node scripts/backup-supabase.mjs
//   -> gera  backups/invicta_backup_AAAA-MM-DD.json   (pasta ignorada pelo git)

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

// Lê pares CHAVE=VALOR do .env.local (sem depender de libs).
function lerEnvLocal() {
  const p = join(raiz, '.env.local');
  const env = {};
  if (existsSync(p)) {
    for (const linha of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = linha.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

const env = lerEnvLocal();
const url = process.env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
// chave secreta: da env, ou o valor do .env.local que começa com sb_secret_
const secret = process.env.SUPABASE_SERVICE_ROLE
  || Object.values(env).find(v => /^sb_secret_/.test(v));

if (!url || !secret) {
  console.error('❌ Faltou a URL ou a chave SECRETA (sb_secret_...) no .env.local.');
  console.error('   Confira que o .env.local tem NEXT_PUBLIC_SUPABASE_URL e a service_role (sb_secret_...).');
  process.exit(1);
}

const sb = createClient(url, secret, { auth: { persistSession: false } });
const TABELAS = ['app_kv', 'talhoes'];
const dump = { _gerado_em: new Date().toISOString(), tabelas: {} };

console.log('Backup do Supabase — lendo tabelas…');
for (const t of TABELAS) {
  let todos = [], de = 0;
  for (;;) {
    const { data, error } = await sb.from(t).select('*').range(de, de + 999);
    if (error) { console.error(`❌ Erro em ${t}:`, error.message); process.exit(1); }
    todos = todos.concat(data);
    if (!data || data.length < 1000) break;
    de += 1000;
  }
  dump.tabelas[t] = todos;
  console.log(`  ${t}: ${todos.length} linhas`);
}

const dir = join(raiz, 'backups');
mkdirSync(dir, { recursive: true });
const arq = join(dir, `invicta_backup_${new Date().toISOString().slice(0, 10)}.json`);
writeFileSync(arq, JSON.stringify(dump));
console.log('✅ Backup salvo em:', arq);
