#!/usr/bin/env node
// Emite uma chave de API para um laboratório.
//
// A chave é mostrada UMA vez e some: o banco guarda só o SHA-256 dela. Perdeu,
// revoga e emite outra — não há recuperação, e é assim que tem de ser, porque
// esta chave escreve laudo em produção.
//
// Roda fora do app (Node), lendo SUPABASE_SERVICE_ROLE do .env.local. Não há
// tela para isto de propósito: emissão é rara, é do owner, e uma tela seria
// mais uma superfície por onde a credencial poderia vazar.
//
// Uso (na raiz do repo):
//   node scripts/gerar-chave-lab.mjs --lab-id <idDaBiblioteca> --nome "Laboratório X" [--empresa <empresaId>]
//   node scripts/gerar-chave-lab.mjs --listar
//   node scripts/gerar-chave-lab.mjs --revogar <idDaChave>
//
// Pré-requisito: docs/api-laudos.sql aplicado no Supabase.

import { randomBytes, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// ── env ──────────────────────────────────────────────────────────────────────
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

const URL = env('NEXT_PUBLIC_SUPABASE_URL');
const SERVICE = env('SUPABASE_SERVICE_ROLE');
if (!URL || !SERVICE) {
  console.error('Faltou NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE (env ou .env.local).');
  process.exit(1);
}
const sb = createClient(URL, SERVICE, { auth: { persistSession: false } });

// ── args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = nome => { const i = argv.indexOf(nome); return i >= 0 ? argv[i + 1] : null; };
const tem = nome => argv.includes(nome);

const hashDe = chave => createHash('sha256').update(chave, 'utf8').digest('hex');

// Prefixo `invlab_` para a chave ser reconhecível num log ou num ticket — e para
// varredura de segredo vazado ter o que procurar.
function novaChave() {
  return 'invlab_' + randomBytes(32).toString('base64url');
}

async function listar() {
  const { data, error } = await sb.from('lab_chaves')
    .select('id, laboratorio_nome, empresa_id, criada_em, revogada_em, ultimo_uso_em')
    .order('criada_em', { ascending: false });
  if (error) { console.error('Erro:', error.message); process.exit(1); }
  if (!data.length) return console.log('Nenhuma chave emitida.');
  console.log('');
  for (const c of data) {
    const estado = c.revogada_em ? `REVOGADA em ${c.revogada_em.slice(0, 10)}` : 'ativa';
    const uso = c.ultimo_uso_em ? `último uso ${c.ultimo_uso_em.slice(0, 10)}` : 'nunca usada';
    console.log(`  ${c.id}  ${String(c.laboratorio_nome).padEnd(28)} ${estado.padEnd(26)} ${uso}`);
  }
  console.log('');
}

async function revogar(id) {
  const { error } = await sb.from('lab_chaves').update({ revogada_em: new Date().toISOString() }).eq('id', id);
  if (error) { console.error('Erro:', error.message); process.exit(1); }
  console.log(`Chave ${id} revogada. O laboratório passa a receber 401 na próxima chamada.`);
}

async function emitir(labId, nome, empresaId) {
  const chave = novaChave();
  const { data, error } = await sb.from('lab_chaves').insert({
    laboratorio_id: labId, laboratorio_nome: nome, empresa_id: empresaId, hash: hashDe(chave),
  }).select('id').single();
  if (error) { console.error('Erro:', error.message); process.exit(1); }

  console.log(`
  Chave emitida para: ${nome}
  Id da chave:        ${data.id}
  Empresa:            ${empresaId ?? '(nenhuma — instalação de empresa única)'}

  ┌─────────────────────────────────────────────────────────────────────────┐
  │  ANOTE AGORA — esta chave NÃO será mostrada de novo.                    │
  └─────────────────────────────────────────────────────────────────────────┘

  ${chave}

  Envie ao laboratório por canal seguro (nunca por e-mail em texto puro).
  Uso: Authorization: Bearer ${chave.slice(0, 14)}…
`);
}

const acao = tem('--listar') ? listar()
  : tem('--revogar') ? revogar(arg('--revogar'))
    : (arg('--lab-id') && arg('--nome')) ? emitir(arg('--lab-id'), arg('--nome'), arg('--empresa'))
      : Promise.resolve(console.log(readFileSync(new URL(import.meta.url)).toString().split('\n').slice(12, 18).join('\n')));

await acao;
