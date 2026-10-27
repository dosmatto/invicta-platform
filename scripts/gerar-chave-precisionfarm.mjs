#!/usr/bin/env node
// Emite a chave Bearer que a PRECISIONFARM usa para ler /integration/v1/* (Q10).
//
// Diferente de gerar-chave-integracao.mjs (Lavra), este script NÃO fala com o
// banco e NÃO mostra a chave na tela:
//   • a chave vai SÓ para ~/Downloads/precisionfarm-chave-invicta.txt (fora do
//     repositório, permissão 600) — de lá segue para a PF pelo canal acordado;
//   • na tela sai apenas o INSERT com o SHA-256, para colar no SQL Editor do
//     Supabase da AP (o banco nunca vê a chave em claro).
// Perdeu a chave: revogue a linha (update … set revogada_em = now()) e emita outra.
//
// Uso (na raiz do repo):
//   node scripts/gerar-chave-precisionfarm.mjs [--nome "PrecisionFarm piloto"] [--parceria producao] [--empresa <empresaId>] [--sobrescrever]
//
// --parceria: a chave só enxerga os vínculos desta parceria (a tela cria tudo em
// "producao"). Uma chave de homologação da PF deve ter OUTRA parceria.
//
// Pré-requisito: docs/integracao-lavra.sql e docs/integracao-precisionfarm.sql aplicados.

import { randomBytes, createHash } from 'node:crypto';
import { existsSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const arg = nome => { const i = argv.indexOf(nome); return i >= 0 ? argv[i + 1] : null; };
const tem = nome => argv.includes(nome);

const nome = arg('--nome') ?? 'PrecisionFarm piloto';
const empresa = arg('--empresa');
const parceria = arg('--parceria') ?? 'producao';
const destino = join(homedir(), 'Downloads', 'precisionfarm-chave-invicta.txt');

if (existsSync(destino) && !tem('--sobrescrever')) {
  console.error(`Já existe ${destino}.\nEntregue/apague o arquivo antigo antes, ou rode de novo com --sobrescrever.`);
  process.exit(1);
}

// Prefixo reconhecível em log/ticket e em varredura de segredo vazado.
const chave = 'invpf_' + randomBytes(32).toString('base64url');
const hash = createHash('sha256').update(chave, 'utf8').digest('hex');
const emitidaEm = new Date().toISOString();

writeFileSync(destino, [
  'Chave de API — Invicta (Plataforma de AP) para a PrecisionFarm',
  `Emitida em: ${emitidaEm}`,
  `Rótulo: ${nome}`,
  `Parceria: ${parceria}`,
  '',
  'Uso: Authorization: Bearer <chave>',
  'Base: https://invicta-platform.vercel.app/integration/v1',
  '',
  chave,
  '',
  'Guarde como segredo. Não versione, não cole em chat. A Invicta guarda só o hash.',
  '',
].join('\n'), { mode: 0o600 });
chmodSync(destino, 0o600);

const lit = v => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
console.log(`
Chave gravada SÓ em: ${destino} (permissão 600)

Cole no SQL Editor do Supabase da AP:

insert into public.integracao_chaves (sistema, nome, parceria, empresa_id, hash)
values ('precisionfarm', ${lit(nome)}, ${lit(parceria)}, ${lit(empresa)}, '${hash}');
`);
