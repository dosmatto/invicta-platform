#!/usr/bin/env node
// Emite uma chave de API de INTEGRAÇÃO (hoje: a Lavra, para POST /api/v1/programacao).
//
// Mesmo desenho de scripts/gerar-chave-lab.mjs: a chave aparece UMA vez e o
// banco guarda só o SHA-256. Sem tela de propósito — emissão é rara, é do owner.
//
// Uso (na raiz do repo):
//   node scripts/gerar-chave-integracao.mjs --nome "Lavra produção" [--empresa <empresaId>]
//   node scripts/gerar-chave-integracao.mjs --listar
//   node scripts/gerar-chave-integracao.mjs --revogar <idDaChave>
//
// Pré-requisito: docs/integracao-lavra.sql aplicado no Supabase.

import { randomBytes, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function env(nome) {
  if (process.env[nome]) return process.env[nome];
  try {
    for (const linha of readFileSync('.env.local', 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linha);
      if (m && m[1] === nome) return m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* sem .env.local */ }
  return null;
}

const URL_SB = env('NEXT_PUBLIC_SUPABASE_URL');
const SERVICE = env('SUPABASE_SERVICE_ROLE');
if (!URL_SB || !SERVICE) {
  console.error('Faltou NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE (env ou .env.local).');
  process.exit(1);
}
const sb = createClient(URL_SB, SERVICE, { auth: { persistSession: false } });

const argv = process.argv.slice(2);
const arg = nome => { const i = argv.indexOf(nome); return i >= 0 ? argv[i + 1] : null; };
const tem = nome => argv.includes(nome);
const hashDe = chave => createHash('sha256').update(chave, 'utf8').digest('hex');

// Prefixo reconhecível em log/ticket e em varredura de segredo vazado.
const novaChave = () => 'invlavra_' + randomBytes(32).toString('base64url');

async function listar() {
  const { data, error } = await sb.from('integracao_chaves')
    .select('id, sistema, nome, empresa_id, criada_em, revogada_em, ultimo_uso_em')
    .order('criada_em', { ascending: false });
  if (error) { console.error('Erro:', error.message); process.exit(1); }
  if (!data.length) return console.log('Nenhuma chave emitida.');
  for (const c of data) {
    const estado = c.revogada_em ? `REVOGADA em ${c.revogada_em.slice(0, 10)}` : 'ativa';
    const uso = c.ultimo_uso_em ? `último uso ${c.ultimo_uso_em.slice(0, 10)}` : 'nunca usada';
    console.log(`  ${c.id}  ${c.sistema}  ${String(c.nome).padEnd(24)} ${estado.padEnd(26)} ${uso}`);
  }
}

async function revogar(id) {
  const { error } = await sb.from('integracao_chaves').update({ revogada_em: new Date().toISOString() }).eq('id', id);
  if (error) { console.error('Erro:', error.message); process.exit(1); }
  console.log(`Chave ${id} revogada. A Lavra passa a receber 401 na próxima chamada.`);
}

async function emitir(nome, empresaId) {
  const chave = novaChave();
  const { data, error } = await sb.from('integracao_chaves').insert({
    sistema: 'lavra', nome, empresa_id: empresaId, hash: hashDe(chave),
  }).select('id').single();
  if (error) { console.error('Erro:', error.message); process.exit(1); }
  console.log(`
  Chave emitida: ${nome} (sistema lavra)
  Id da chave:   ${data.id}
  Empresa:       ${empresaId ?? '(nenhuma — instalação de empresa única)'}

  ANOTE AGORA — esta chave NÃO será mostrada de novo.

  ${chave}

  Configure na Lavra como segredo (variável de ambiente), nunca no código.
  Uso: Authorization: Bearer ${chave.slice(0, 16)}…
`);
}

if (tem('--listar')) await listar();
else if (tem('--revogar')) await revogar(arg('--revogar'));
else if (arg('--nome')) await emitir(arg('--nome'), arg('--empresa'));
else console.log('Uso: --nome "Lavra produção" [--empresa <id>] | --listar | --revogar <id>');
