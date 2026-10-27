-- =====================================================================
-- Integração Invicta → PrecisionFarm (ponte 0.2.0) — fase 1.
--
-- Chave Bearer da PrecisionFarm + vínculos por talhão + recursos publicados +
-- revisões imutáveis. Usado por /integration/v1/* (leitura da PrecisionFarm) e
-- por /api/precisionfarm/* (vínculo e publicação, só owner/admin).
-- Contrato e decisões: docs/integracao-precisionfarm.md.
--
-- COMO APLICAR (nada disto é aplicado automaticamente)
--   Supabase da AP → SQL Editor → cole este arquivo → Run. É IDEMPOTENTE:
--   rodar de novo não apaga nem duplica nada.
--   Pré-requisito: docs/integracao-lavra.sql já aplicado (cria integracao_chaves).
--   As conferências no fim devem dar rls_ativa = true e politicas = 0 nas quatro
--   tabelas, e exatamente os dois checks de integracao_chaves listados lá.
--   Emitir a chave: node scripts/gerar-chave-precisionfarm.mjs (grava a chave
--   SÓ em ~/Downloads/precisionfarm-chave-invicta.txt e imprime o INSERT com o
--   hash e a parceria — padrão "producao" — para colar aqui no SQL Editor).
--
-- POR QUE TABELAS PRÓPRIAS
--   O app é local-first: o navegador é dono do que está em app_kv/talhoes e
--   empurra a cópia dele para a nuvem. Se o servidor reescrevesse um registro
--   desses, o próximo envio do navegador desfaria a escrita (ou o contrário).
--   Tudo da integração vive aqui; app_kv/talhoes são só LIDOS.
--
-- POR QUE SEM NENHUMA POLÍTICA
--   RLS ligada + zero políticas = nenhum usuário autenticado (nem o papel
--   somente-leitura `fito_ro` da Lavra) lê ou escreve. Só as rotas do servidor
--   alcançam estas tabelas, com a SERVICE ROLE, e fazem o recorte de escopo
--   (chave → vínculos confirmados DA PARCERIA DELA; usuário → owner/admin) no código.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) integracao_chaves: sistema 'precisionfarm' + coluna `parceria`.
--    Em produção o check atual chama integracao_chaves_sistema_check e diz
--    sistema = 'lavra' — mas o NOME não é garantido (tabela criada antes/à mão
--    pode ter outro). Por isso derruba QUALQUER check desta tabela que cite
--    `sistema` (pg_constraint) e recria os dois abaixo. Idempotente.
--    Chave da Lavra continua só da Lavra: cada rota filtra pelo seu sistema.
-- ---------------------------------------------------------------------
alter table public.integracao_chaves add column if not exists parceria text;

comment on column public.integracao_chaves.parceria is
  'PrecisionFarm: parceria/ambiente da chave (ex.: producao). A chave só enxerga vínculos desta parceria. NULL = chave da Lavra.';

do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.integracao_chaves'::regclass
             and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%sistema%'
  loop
    execute format('alter table public.integracao_chaves drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.integracao_chaves
  add constraint integracao_chaves_sistema_check check (sistema in ('lavra', 'precisionfarm'));
-- Chave da PF sem parceria não teria escopo nenhum: o banco recusa.
alter table public.integracao_chaves
  add constraint integracao_chaves_parceria_check check (sistema <> 'precisionfarm' or parceria is not null);

comment on table public.integracao_chaves is
  'Chaves de API de sistemas integrados (Lavra, PrecisionFarm). Só o SHA-256. Acesso exclusivo da service role.';

-- ---------------------------------------------------------------------
-- 2) Vínculo por talhão, DENTRO de uma parceria. Os três UUIDs são gerados
--    pela Invicta (Q6); produtor e fazenda são reaproveitados dos vínculos
--    da mesma parceria e cliente/fazenda (ou derivados de forma
--    determinística). A chave alcança SÓ os 'confirmado' da sua parceria.
--    A tela cria tudo na parceria 'producao'.
-- ---------------------------------------------------------------------
create table if not exists public.pf_vinculos (
  id                  uuid primary key default gen_random_uuid(),
  parceria            text not null default 'producao',
  -- Empresa do talhão (talhoes.empresa_id). NULL = instalação de empresa única.
  empresa_id          text,
  talhao_id           text not null,
  fazenda_id          text,
  cliente_id          text,
  shared_producer_id  uuid not null,
  shared_farm_id      uuid not null,
  shared_field_id     uuid not null unique,
  -- ID do talhão do lado da PrecisionFarm (opaco, informado à mão).
  pf_local_id         text,
  status              text not null default 'pendente'
                        check (status in ('pendente', 'confirmado', 'suspenso')),
  criado_por          text,
  criado_em           timestamptz not null default now(),
  confirmado_por      text,
  confirmado_em       timestamptz,
  suspenso_por        text,
  suspenso_em         timestamptz,
  atualizado_em       timestamptz not null default now(),
  unique (parceria, talhao_id)
);

comment on table public.pf_vinculos is
  'Integração PrecisionFarm: vínculo talhão ↔ UUIDs compartilhados, por parceria. Acesso exclusivo da service role.';

create index if not exists pf_vinculos_escopo_idx on public.pf_vinculos (parceria, status);
create index if not exists pf_vinculos_cliente_idx on public.pf_vinculos (parceria, cliente_id);
create index if not exists pf_vinculos_fazenda_idx on public.pf_vinculos (parceria, fazenda_id);

-- ---------------------------------------------------------------------
-- 3) Recurso = camada estável publicada, por VÍNCULO. resource_id ↔ chave local:
--      management_zones                    → um por talhão (Q12)
--      harvest|<season>|<season_period>    → um por talhão+safra+época (Q13)
-- ---------------------------------------------------------------------
create table if not exists public.pf_recursos (
  resource_id    uuid primary key default gen_random_uuid(),
  vinculo_id     uuid not null references public.pf_vinculos (id),
  talhao_id      text not null,
  resource_type  text not null check (resource_type in ('management_zones', 'harvest')),
  chave_local    text not null,
  criado_em      timestamptz not null default now(),
  unique (vinculo_id, chave_local)
);

comment on table public.pf_recursos is
  'Integração PrecisionFarm: camada publicada (resource_id estável). Acesso exclusivo da service role.';

create index if not exists pf_recursos_talhao_idx on public.pf_recursos (talhao_id);

-- ---------------------------------------------------------------------
-- 4) Revisões IMUTÁVEIS. Snapshot completo (envelope do contrato) + o evento
--    (envelope sem payload) para o inventário não precisar ler a geometria.
--    conteudo_hash = impressão sem event_id/occurred_at/numeração: publicação
--    idêntica não cria revisão nova (src/lib/precisionfarm/contrato.ts).
-- ---------------------------------------------------------------------
create table if not exists public.pf_revisoes (
  id               bigint generated always as identity primary key,
  resource_id      uuid not null references public.pf_recursos (resource_id),
  revision         integer not null check (revision >= 1),
  event_id         uuid not null unique,
  checksum         text not null,
  conteudo_hash    text not null,
  boundary_revision integer not null check (boundary_revision >= 1),
  name             text,
  season           text,
  season_period    text,
  evento           jsonb not null,
  envelope         jsonb not null,
  tamanho_bytes    integer,
  -- De onde veio (zoneamentoId / mapaId + versão) — rastreabilidade no suporte.
  origem           jsonb,
  publicado_por    text,
  publicado_em     timestamptz not null default now(),
  unique (resource_id, revision)
);

comment on table public.pf_revisoes is
  'Integração PrecisionFarm: revisões imutáveis (envelope 0.2.0). Acesso exclusivo da service role.';

-- Imutável de verdade: nem a service role altera ou apaga uma revisão. Corrigir
-- = publicar a revisão seguinte.
create or replace function public.pf_revisoes_imutaveis()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'pf_revisoes é imutável: publique uma nova revisão em vez de alterar/apagar a % do recurso %',
    old.revision, old.resource_id;
end;
$$;

drop trigger if exists pf_revisoes_imutaveis on public.pf_revisoes;
create trigger pf_revisoes_imutaveis
  before update or delete on public.pf_revisoes
  for each row execute function public.pf_revisoes_imutaveis();

-- ---------------------------------------------------------------------
-- 5) RLS ligada, nenhuma política, ninguém além da service role.
-- ---------------------------------------------------------------------
alter table public.pf_vinculos enable row level security;
alter table public.pf_recursos enable row level security;
alter table public.pf_revisoes enable row level security;

revoke all on public.pf_vinculos, public.pf_recursos, public.pf_revisoes from anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'fito_ro') then
    execute 'revoke all on public.pf_vinculos, public.pf_recursos, public.pf_revisoes from fito_ro';
  end if;
end $$;

-- Idempotente: remove políticas que porventura tenham sido criadas à mão.
do $$
declare p record;
begin
  for p in select tablename, policyname from pg_policies
           where schemaname = 'public' and tablename in ('pf_vinculos', 'pf_recursos', 'pf_revisoes')
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- =====================================================================
-- CONFERÊNCIA (todas as linhas: rls_ativa = true e politicas = 0)
-- =====================================================================
select t.tabela,
       (select relrowsecurity from pg_class where oid = ('public.' || t.tabela)::regclass) as rls_ativa,
       (select count(*) from pg_policies where schemaname = 'public' and tablename = t.tabela) as politicas
  from (values ('integracao_chaves'), ('pf_vinculos'), ('pf_recursos'), ('pf_revisoes')) as t(tabela);

-- CONFERÊNCIA dos checks de integracao_chaves: deve haver EXATAMENTE
--   integracao_chaves_sistema_check   CHECK (sistema = ANY (ARRAY['lavra', 'precisionfarm']))
--   integracao_chaves_parceria_check  CHECK (sistema <> 'precisionfarm' OR parceria IS NOT NULL)
-- Um terceiro check citando `sistema` (ex.: o antigo sistema = 'lavra') faria o
-- INSERT da chave da PF falhar — rode o arquivo de novo.
select conname, pg_get_constraintdef(oid) as definicao
  from pg_constraint
 where conrelid = 'public.integracao_chaves'::regclass and contype = 'c'
 order by conname;
