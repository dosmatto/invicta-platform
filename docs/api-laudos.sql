-- =====================================================================
-- API de ingestão de laudos — tabela de chaves por laboratório.
--
-- COMO APLICAR
--   Supabase → SQL Editor → cole este arquivo → Run.
--   Depois confira em Table Editor → lab_chaves → RLS: deve estar "Enabled"
--   e a lista de políticas deve estar VAZIA.
--
-- POR QUE SEM NENHUMA POLÍTICA
--   RLS ligada + zero políticas = ninguém autenticado lê nem escreve. É o que
--   se quer: aqui vive o hash da credencial de um terceiro. Guardar isso no
--   `app_kv` seria o erro — lá qualquer usuário autenticado lê tudo (ver
--   docs/seguranca-rls.sql). Só a rota /api/v1/laudos alcança esta tabela, e
--   ela usa a SERVICE ROLE, que passa por cima da RLS.
--
-- A CHAVE EM SI NUNCA É GRAVADA — só o SHA-256 dela. Se o laboratório perder a
-- chave, não há como recuperá-la: revoga-se e emite-se outra.
-- =====================================================================

create table if not exists public.lab_chaves (
  id                uuid primary key default gen_random_uuid(),
  -- FK "solta" para o item da Biblioteca → Laboratórios (id de string do app).
  laboratorio_id    text not null,
  -- Snapshot do nome: é o que sai gravado no laudo e no relatório. Renomear na
  -- Biblioteca não pode mudar retroativamente a autoria do que já entrou.
  laboratorio_nome  text not null,
  -- Empresa dona da chave. NULL = instalação de empresa única. Preenchida, ela
  -- recorta o que a chave alcança: sem isso uma chave válida chegaria à remessa
  -- de qualquer cliente da plataforma.
  empresa_id        text,
  hash              text not null unique,
  criada_em         timestamptz not null default now(),
  revogada_em       timestamptz,
  ultimo_uso_em     timestamptz
);

comment on table public.lab_chaves is
  'Chaves de API dos laboratórios (só o SHA-256). Acesso exclusivo da service role.';

-- Busca por hash a cada requisição: o unique já indexa, mas o parcial deixa a
-- consulta do caminho quente (chave ativa) menor.
create index if not exists lab_chaves_ativas_idx
  on public.lab_chaves (hash) where revogada_em is null;

alter table public.lab_chaves enable row level security;

-- Idempotente: remove políticas que porventura tenham sido criadas à mão.
-- Uma política permissiva sobrando aqui abriria a tabela inteira.
do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'lab_chaves'
  loop
    execute format('drop policy if exists %I on public.lab_chaves', p.policyname);
  end loop;
end $$;

-- =====================================================================
-- CONFERÊNCIA (deve devolver rls_ativa = true e politicas = 0)
-- =====================================================================
select
  (select relrowsecurity from pg_class where oid = 'public.lab_chaves'::regclass) as rls_ativa,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'lab_chaves') as politicas;
