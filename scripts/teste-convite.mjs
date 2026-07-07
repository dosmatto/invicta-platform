#!/usr/bin/env node
// Teste E2E REAL do fluxo de convite por senha provisória (Supabase Auth).
//
// Replica, com @supabase/supabase-js puro (sem importar código TS do app), o
// que o app faz em src/lib/auth.ts (criarUsuarioConvite/trocarSenha) e
// src/components/panels/UsuariosPanel.tsx (gerarSenhaProvisoria):
//   1) admin convida -> signUp({ email, password: senhaProvisoria }) num
//      cliente Supabase EFÊMERO (persistSession: false) — não mexe na sessão
//      de quem está logado;
//   2) convidado loga com a senha provisória;
//   3) convidado troca a senha (updateUser({ password })) — troca obrigatória
//      no 1º acesso;
//   4) login com a senha nova funciona e o login com a senha provisória velha
//      passa a falhar.
//
// Este teste SÓ funciona com "Confirm email" DESLIGADO no projeto Supabase
// (Authentication → Sign In / Providers → Email). Se estiver LIGADO, o
// signUp devolve user sem session (confirmação pendente) e o script para
// no PASSO 1 com diagnóstico claro.
//
// Uso:  node scripts/teste-convite.mjs   (ou "npm run teste:convite")
//
// Lê a URL e a chave PÚBLICA (anon) do seu .env.local — NENHUMA chave é
// impressa no output. Cria um usuário de teste descartável no Supabase Auth
// (ver aviso no final); ele é inofensivo, não tem papel no app e fica preso
// na tela de acesso.

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const TIMEOUT_MS = 12000; // 10-15s por chamada, como pedido

// ── util: lê pares CHAVE=VALOR do .env.local (sem depender de libs) ──
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

// ── util: aplica timeout em qualquer Promise, pra nunca pendurar o script ──
function comTimeout(promise, ms, rotulo) {
  let timer;
  const estourou = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout (${ms}ms) em: ${rotulo}`)), ms);
  });
  return Promise.race([promise, estourou]).finally(() => clearTimeout(timer));
}

function linha() {
  console.log('─'.repeat(60));
}

async function main() {
  console.log('Teste E2E — convite por senha provisória (Supabase Auth)');
  linha();

  // ── envs ──
  const env = lerEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    console.error('❌ Faltou configuração: NEXT_PUBLIC_SUPABASE_URL e/ou NEXT_PUBLIC_SUPABASE_ANON_KEY.');
    console.error('   Confira se existe .env.local na raiz do projeto com essas duas variáveis.');
    process.exit(1);
  }

  // ── dados de teste (mesmo formato do app: UsuariosPanel.tsx) ──
  const timestamp = Date.now();
  const email = `teste-convite-${timestamp}@invicta.agr.br`;
  const senhaProvisoria = 'Inv' + Math.floor(10000 + Math.random() * 90000);
  const senhaNova = 'Nova' + Math.floor(10000 + Math.random() * 90000);

  console.log(`E-mail de teste: ${email}`);
  console.log('Senha provisória e senha nova geradas (não impressas por padrão).');
  linha();

  let falhaEm = null;

  try {
    // ── PASSO 1: signUp com cliente efêmero (persistSession:false) ──
    console.log('PASSO 1 — Criando conta do convidado (signUp, cliente efêmero)…');
    const sbConvite = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data: signUpData, error: signUpError } = await comTimeout(
      sbConvite.auth.signUp({ email, password: senhaProvisoria }),
      TIMEOUT_MS,
      'signUp (PASSO 1)'
    );

    if (signUpError) {
      console.log(`❌ PASSO 1 falhou: erro no signUp — ${signUpError.message}`);
      falhaEm = 'PASSO 1 (signUp)';
      throw new Error('parar');
    }

    const user = signUpData?.user;
    const session = signUpData?.session;

    if (user && Array.isArray(user.identities) && user.identities.length === 0) {
      console.log('❌ PASSO 1 falhou: Supabase indicou que o e-mail já existe (identities vazio).');
      console.log('   Isso não deveria acontecer com um e-mail único de teste — rode de novo.');
      falhaEm = 'PASSO 1 (e-mail já existente)';
      throw new Error('parar');
    }

    if (!session) {
      console.log('❌ PASSO 1 falhou: signUp retornou usuário SEM sessão (confirmação de e-mail pendente).');
      linha();
      console.log('❌ CAUSA RAIZ: Confirm email está LIGADO no Supabase. Desligue em: Dashboard → Authentication → Sign In / Providers → Email → "Confirm email" OFF → Save. Depois rode este teste de novo.');
      linha();
      process.exit(2);
    }

    console.log('✅ PASSO 1 OK — conta criada e sessão retornada (Confirm email está DESLIGADO, como esperado).');
    linha();

    // ── PASSO 2: login do convidado com a senha provisória ──
    console.log('PASSO 2 — Login do convidado com a senha provisória…');
    const sbLogin1 = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data: login1Data, error: login1Error } = await comTimeout(
      sbLogin1.auth.signInWithPassword({ email, password: senhaProvisoria }),
      TIMEOUT_MS,
      'signInWithPassword (PASSO 2)'
    );

    if (login1Error || !login1Data?.session) {
      console.log(`❌ PASSO 2 falhou: login com a senha provisória não funcionou — ${login1Error?.message || 'sem sessão retornada'}`);
      falhaEm = 'PASSO 2 (login com senha provisória)';
      throw new Error('parar');
    }

    console.log('✅ PASSO 2 OK — login com a senha provisória funcionou.');
    linha();

    // ── PASSO 3: troca obrigatória de senha (updateUser) ──
    console.log('PASSO 3 — Trocando a senha provisória pela senha nova (updateUser)…');
    const { error: updateError } = await comTimeout(
      sbLogin1.auth.updateUser({ password: senhaNova }),
      TIMEOUT_MS,
      'updateUser (PASSO 3)'
    );

    if (updateError) {
      console.log(`❌ PASSO 3 falhou: updateUser deu erro — ${updateError.message}`);
      falhaEm = 'PASSO 3 (updateUser)';
      throw new Error('parar');
    }

    console.log('✅ PASSO 3 OK — senha trocada com sucesso.');
    linha();

    // ── PASSO 4: deslogar, logar com a senha nova, e confirmar que a antiga falha ──
    console.log('PASSO 4 — Deslogando e validando as duas senhas…');
    await comTimeout(sbLogin1.auth.signOut(), TIMEOUT_MS, 'signOut (PASSO 4)').catch(() => {});

    const sbLogin2 = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: login2Data, error: login2Error } = await comTimeout(
      sbLogin2.auth.signInWithPassword({ email, password: senhaNova }),
      TIMEOUT_MS,
      'signInWithPassword com senha nova (PASSO 4)'
    );

    if (login2Error || !login2Data?.session) {
      console.log(`❌ PASSO 4 falhou: login com a senha NOVA não funcionou — ${login2Error?.message || 'sem sessão retornada'}`);
      falhaEm = 'PASSO 4 (login com senha nova)';
      throw new Error('parar');
    }
    console.log('✅ PASSO 4a OK — login com a senha NOVA funciona.');

    const sbLogin3 = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: login3Data, error: login3Error } = await comTimeout(
      sbLogin3.auth.signInWithPassword({ email, password: senhaProvisoria }),
      TIMEOUT_MS,
      'signInWithPassword com senha provisória antiga (PASSO 4)'
    );

    if (!login3Error || login3Data?.session) {
      console.log('❌ PASSO 4 falhou: login com a senha PROVISÓRIA ANTIGA deveria ter falhado, mas funcionou.');
      falhaEm = 'PASSO 4 (senha antiga ainda válida)';
      throw new Error('parar');
    }
    console.log(`✅ PASSO 4b OK — login com a senha provisória antiga falhou como esperado (${login3Error.message}).`);
    linha();

    // ── resumo final ──
    console.log('RESUMO FINAL: ✅ FLUXO OK — convite, login provisório, troca de senha e revogação da senha antiga funcionaram de ponta a ponta.');
    linha();
    console.log(`E-mail de teste criado: ${email}`);
    console.log('usuário de teste criado no Supabase Auth — pode apagar em Authentication → Users quando quiser (inofensivo: não tem papel no app, fica bloqueado na tela de acesso).');
    process.exit(0);
  } catch (e) {
    if (e && e.message === 'parar') {
      linha();
      console.log(`RESUMO FINAL: ❌ FALHOU em ${falhaEm}.`);
      linha();
      console.log(`E-mail de teste criado (mesmo com falha): ${email}`);
      console.log('usuário de teste criado no Supabase Auth — pode apagar em Authentication → Users quando quiser (inofensivo: não tem papel no app, fica bloqueado na tela de acesso).');
      process.exit(1);
    }
    // erro inesperado (rede, timeout, env, etc.)
    linha();
    console.error(`❌ Erro inesperado: ${e?.message || e}`);
    console.error('   Verifique sua conexão de rede e se NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY estão corretos no .env.local.');
    process.exit(1);
  }
}

main();
