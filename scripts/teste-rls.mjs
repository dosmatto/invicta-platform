#!/usr/bin/env node
// Teste ADVERSARIAL da RLS (docs/seguranca-rls.sql) contra o Supabase REAL.
// Roda: `npm run teste:rls`. Cria um usuário descartável (não-admin) e tenta:
//   1. gravar o próprio pedido de acesso (aguardando_aprovacao)  → deve PASSAR
//   2. SE PROMOVER a owner                                        → deve FALHAR
//   3. escrever papel de OUTRA pessoa                             → deve FALHAR
//   4. gravar entrada de auditoria                                → deve PASSAR
//   5. escrever numa coleção comum (inv_clientes de teste)        → deve PASSAR
// Lê URL + anon key do .env.local; nada de segredo é impresso.

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const pega = k => env.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1]?.trim();
const URL_SB = pega('NEXT_PUBLIC_SUPABASE_URL');
const ANON = pega('NEXT_PUBLIC_SUPABASE_ANON_KEY');
if (!URL_SB || !ANON) { console.error('Sem NEXT_PUBLIC_SUPABASE_* no .env.local'); process.exit(1); }

const sb = createClient(URL_SB, ANON, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const email = `teste-rls-${Date.now()}@invicta.agr.br`;
const senha = `Rls!${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

let ok = 0, fail = 0;
const t = (nome, cond, extra = '') => {
  if (cond) { ok++; console.log('  ✓', nome); }
  else { fail++; console.error('  ✗', nome, extra); }
};

console.log('\nRLS — usuário comum (não-admin) contra as coleções de acesso\n');

const su = await sb.auth.signUp({ email, password: senha });
if (su.error || !su.data.session) { console.error('signUp falhou:', su.error?.message); process.exit(1); }

// 1. auto-cadastro (o que a página /convite faz) — permitido
const r1 = await sb.from('app_kv').upsert(
  { colecao: 'inv_papeis', item_id: email, dados: { email, papel: 'leitor', status: 'aguardando_aprovacao' } },
  { onConflict: 'colecao,item_id' });
t('auto-cadastro (leitor · aguardando_aprovacao) É permitido', !r1.error, r1.error?.message ?? '');

// 2. AUTO-PROMOÇÃO a owner — o ataque. Update e insert.
const r2 = await sb.from('app_kv').update({ dados: { email, papel: 'owner', status: 'ativo' } })
  .eq('colecao', 'inv_papeis').eq('item_id', email).select();
t('auto-promoção a OWNER é BLOQUEADA', !!r2.error || (r2.data ?? []).length === 0,
  `update passou: ${JSON.stringify(r2.data)?.slice(0, 80)}`);

// 3. escrever papel de OUTRO e-mail — bloqueado
const r3 = await sb.from('app_kv').upsert(
  { colecao: 'inv_papeis', item_id: 'vitima@x.com', dados: { email: 'vitima@x.com', papel: 'leitor', status: 'aguardando_aprovacao' } },
  { onConflict: 'colecao,item_id' });
t('escrever o papel de OUTRA pessoa é BLOQUEADO', !!r3.error, 'upsert passou');

// 4. auditoria append-only — permitido
const r4 = await sb.from('app_kv').upsert(
  { colecao: 'inv_auditoria', item_id: `aud-teste-${Date.now()}`, dados: { acao: 'login', alvo: email } },
  { onConflict: 'colecao,item_id' });
t('acrescentar entrada de AUDITORIA é permitido', !r4.error, r4.error?.message ?? '');

// 5. coleção comum segue funcionando (o app não pode quebrar)
const idCli = `teste-rls-cli-${Date.now()}`;
const r5 = await sb.from('app_kv').upsert(
  { colecao: 'inv_clientes', item_id: idCli, dados: { id: idCli, nome: 'TESTE RLS (pode apagar)' } },
  { onConflict: 'colecao,item_id' });
t('escrita em coleção comum (inv_clientes) segue permitida', !r5.error, r5.error?.message ?? '');
// limpa o cliente de teste (delete em coleção comum é permitido)
await sb.from('app_kv').delete().eq('colecao', 'inv_clientes').eq('item_id', idCli);

// 6. o registro do passo 2 continua aguardando (não virou owner de verdade)?
const r6 = await sb.from('app_kv').select('dados').eq('colecao', 'inv_papeis').eq('item_id', email).single();
t('registro segue leitor·aguardando (a promoção NÃO colou)',
  r6.data?.dados?.papel !== 'owner', `papel=${r6.data?.dados?.papel}`);

console.log(`\n${ok} ok, ${fail} falha(s)`);
console.log(`\nUsuário de teste: ${email} (sem papel ativo — pode apagar em Auth → Users; o registro em inv_papeis aparece como "aguardando aprovação" na Central de Acessos → rejeite/exclua).`);
process.exit(fail ? 1 : 0);
