-- =====================================================================
-- Integração AP ← Lavra — tabela de chaves de API de INTEGRAÇÃO.
--
-- Usada por POST /api/v1/programacao (a Lavra devolve as doses programadas
-- por zona). Contrato: docs/integracao-lavra.md.
--
-- COMO APLICAR (o usuário roda; nada disto é aplicado automaticamente)
--   Supabase → SQL Editor → cole este arquivo → Run.
--   Depois confira em Table Editor → integracao_chaves → RLS: "Enabled" e a
--   lista de políticas VAZIA. A conferência no fim deste arquivo deve dar
--   rls_ativa = true e politicas = 0.
--   Emitir a chave: node scripts/gerar-chave-integracao.mjs --nome "Lavra produção" [--empresa <empresaId>]
--
-- POR QUE UMA TABELA NOVA E NÃO lab_chaves
--   lab_chaves não tem coluna de escopo: toda chave ali escreve laudo. Reusá-la
--   exigiria acrescentar escopo e conferir em cada rota — e um erro nessa
--   conferência daria a um laboratório o poder de mandar DOSE para a máquina.
--   Tabelas separadas tornam isso impossível por construção.
--
-- POR QUE SEM NENHUMA POLÍTICA
--   RLS ligada + zero políticas = nenhum usuário autenticado (nem o papel
--   somente-leitura `fito_ro` da Lavra) lê ou escreve. Só a rota da API alcança
--   esta tabela, com a SERVICE ROLE. A chave em si NUNCA é gravada — só o
--   SHA-256. Perdeu: revoga e emite outra.
-- =====================================================================

create table if not exists public.integracao_chaves (
  id                uuid primary key default gen_random_uuid(),
  -- Sistema que usa a chave. Hoje só 'lavra'; o check impede chave "genérica".
  sistema           text not null check (sistema in ('lavra')),
  -- Rótulo para o owner reconhecer a chave (ex.: "Lavra produção").
  nome              text not null,
  -- Empresa dona da chave. NULL = instalação de empresa única. Preenchida, a
  -- rota só aceita talhões desta empresa (os demais respondem 404).
  empresa_id        text,
  hash              text not null unique,
  criada_em         timestamptz not null default now(),
  revogada_em       timestamptz,
  ultimo_uso_em     timestamptz
);

comment on table public.integracao_chaves is
  'Chaves de API de sistemas integrados (Lavra). Só o SHA-256. Acesso exclusivo da service role.';

create index if not exists integracao_chaves_ativas_idx
  on public.integracao_chaves (hash) where revogada_em is null;

alter table public.integracao_chaves enable row level security;

-- Garante que o papel somente-leitura da Lavra NÃO enxergue esta tabela, mesmo
-- que alguém tenha dado SELECT em todas as tabelas do schema.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'fito_ro') then
    execute 'revoke all on public.integracao_chaves from fito_ro';
  end if;
end $$;

-- Idempotente: remove políticas que porventura tenham sido criadas à mão.
do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'integracao_chaves'
  loop
    execute format('drop policy if exists %I on public.integracao_chaves', p.policyname);
  end loop;
end $$;

-- =====================================================================
-- CONFERÊNCIA (deve devolver rls_ativa = true e politicas = 0)
-- =====================================================================
select
  (select relrowsecurity from pg_class where oid = 'public.integracao_chaves'::regclass) as rls_ativa,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'integracao_chaves') as politicas;
