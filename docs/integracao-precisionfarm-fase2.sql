-- =====================================================================
-- Integração PrecisionFarm (ponte 0.2.0) — FASE 2: RECEBER as linhas.
--
-- Fila de avisos recebidos + camadas de linhas + snapshots imutáveis + cursor
-- de /changes, e o agendamento (pg_cron + pg_net) da rotina periódica.
-- Usado por POST /integration/v1/notifications, /api/precisionfarm/cron,
-- /api/precisionfarm/linhas/* e /api/precisionfarm/carga-linhas.
-- Contrato e fluxo: docs/integracao-precisionfarm.md §6.
--
-- COMO APLICAR (nada disto é aplicado automaticamente)
--   Supabase da AP → SQL Editor → cole este arquivo → Run. É IDEMPOTENTE:
--   rodar de novo não apaga nem duplica nada.
--   Pré-requisito: docs/integracao-precisionfarm.sql (fase 1) já aplicado
--   (cria pf_vinculos).
--   ANTES do bloco 6 (agendamento), grave o segredo do cron no Vault — ver o
--   bloco 6. As conferências no fim devem dar rls_ativa = true e politicas = 0
--   nas cinco tabelas, e o job 'pf-recebimento-linhas' ativo.
--
-- POR QUE TABELAS PRÓPRIAS / SEM POLÍTICA: as mesmas razões da fase 1 — o app
-- é local-first (app_kv/talhoes nunca são escritos pelo servidor) e só as
-- rotas do servidor, com a SERVICE ROLE, alcançam estas tabelas. A leitura da
-- aba Linhas passa pela rota, que confere o acesso do usuário ao talhão.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Camada de linhas recebida = um resource_id da PrecisionFarm, sempre de
--    UM vínculo (talhão). Guarda a revisão VIGENTE (a maior aplicada, sem
--    regressão) e os metadados dela; a geometria fica no snapshot (bloco 2).
-- ---------------------------------------------------------------------
create table if not exists public.pf_linhas_camadas (
  resource_id              uuid primary key,
  vinculo_id               uuid not null references public.pf_vinculos (id),
  talhao_id                text not null,
  -- Maior revisão aplicada (upsert OU archive). NULL = ainda nenhuma.
  revisao_vigente          integer check (revisao_vigente >= 1),
  -- Maior revisão UPSERT aplicada até a vigente: é a que a tela desenha.
  revisao_geometria        integer check (revisao_geometria >= 1),
  arquivada                boolean not null default false,
  arquivada_em             timestamptz,
  nome                     text,
  integration_name         text,
  cropping_cycle           text,
  operation_category       text,
  spacing_m                double precision,
  -- Revisão do limite NO SISTEMA DE ORIGEM (PF) — sem equivalência com a nossa.
  boundary_revision        integer,
  n_feicoes                integer,
  n_vertices               integer,
  -- Última recusa (permanente). Limpa quando uma revisão maior é aplicada.
  ultimo_erro              text,
  ultimo_erro_em           timestamptz,
  ultima_sincronizacao_em  timestamptz,
  criado_em                timestamptz not null default now(),
  atualizado_em            timestamptz not null default now()
);

comment on table public.pf_linhas_camadas is
  'Integração PrecisionFarm (fase 2): camada de linhas recebida (resource_id da PF) e sua revisão vigente. Acesso exclusivo da service role.';

create index if not exists pf_linhas_camadas_talhao_idx on public.pf_linhas_camadas (talhao_id);

-- ---------------------------------------------------------------------
-- 2) Snapshots IMUTÁVEIS recebidos (envelope 0.2.0 completo, validado:
--    contrato, checksum canônico, vínculo e geometria). Revisão antiga que
--    chega atrasada também entra aqui (histórico), sem virar a vigente.
-- ---------------------------------------------------------------------
create table if not exists public.pf_linhas_revisoes (
  id                 bigint generated always as identity primary key,
  resource_id        uuid not null references public.pf_linhas_camadas (resource_id),
  revision           integer not null check (revision >= 1),
  event_id           uuid not null,
  checksum           text not null,
  operation          text not null check (operation in ('upsert', 'archive')),
  boundary_revision  integer not null check (boundary_revision >= 1),
  nome               text,
  integration_name   text,
  cropping_cycle     text,
  operation_category text,
  spacing_m          double precision,
  n_feicoes          integer,
  n_vertices         integer,
  tamanho_bytes      integer,
  -- Feições sem properties.kind de guia/bordadura (desenhadas como linha guia)
  -- e a nota correspondente, mostrada no histórico.
  n_sem_kind         integer,
  observacao         text,
  envelope           jsonb not null,
  recebido_em        timestamptz not null default now(),
  unique (resource_id, revision)
);
-- Para quem rodou uma versão anterior deste arquivo.
alter table public.pf_linhas_revisoes add column if not exists n_sem_kind integer;
alter table public.pf_linhas_revisoes add column if not exists observacao text;

comment on table public.pf_linhas_revisoes is
  'Integração PrecisionFarm (fase 2): revisões de linhas recebidas, imutáveis (envelope 0.2.0). Acesso exclusivo da service role.';

create or replace function public.pf_linhas_revisoes_imutaveis()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'pf_linhas_revisoes é imutável: a revisão % do recurso % não pode ser alterada nem apagada',
    old.revision, old.resource_id;
end;
$$;

drop trigger if exists pf_linhas_revisoes_imutaveis on public.pf_linhas_revisoes;
create trigger pf_linhas_revisoes_imutaveis
  before update or delete on public.pf_linhas_revisoes
  for each row execute function public.pf_linhas_revisoes_imutaveis();

-- ---------------------------------------------------------------------
-- 3) Fila de avisos recebidos (POST /notifications, /changes, inventário).
--    Persistida ANTES do 202. event_id único: repetido com o mesmo conteúdo
--    (conteudo_hash) = 202 sem duplicar; conteúdo diferente = 409.
--    O recibo (applied/rejected) e o reenvio dele moram na mesma linha.
-- ---------------------------------------------------------------------
create table if not exists public.pf_entrada_eventos (
  id                    bigint generated always as identity primary key,
  event_id              uuid not null unique,
  conteudo_hash         text not null,
  evento                jsonb not null,
  vinculo_id            uuid not null references public.pf_vinculos (id),
  talhao_id             text not null,
  resource_id           uuid not null references public.pf_linhas_camadas (resource_id),
  resource_revision     integer not null check (resource_revision >= 1),
  origem                text not null check (origem in ('notificacao', 'changes', 'inventario')),
  status                text not null default 'pendente' check (status in ('pendente', 'aplicado', 'rejeitado')),
  tentativas            integer not null default 0,
  proxima_tentativa_em  timestamptz not null default now(),
  -- Trava do processador (after() e cron podem rodar ao mesmo tempo).
  travado_ate           timestamptz,
  ultimo_erro           text,
  recebido_em           timestamptz not null default now(),
  processado_em         timestamptz,
  recibo_status         text check (recibo_status in ('received', 'applied', 'rejected')),
  recibo_motivo         text,
  recibo_enviado_em     timestamptz,
  recibo_tentativas     integer not null default 0,
  recibo_proxima_em     timestamptz,
  recibo_erro           text
);

comment on table public.pf_entrada_eventos is
  'Integração PrecisionFarm (fase 2): fila de avisos recebidos e estado do recibo. Acesso exclusivo da service role.';

create index if not exists pf_entrada_eventos_fila_idx
  on public.pf_entrada_eventos (proxima_tentativa_em, id) where status = 'pendente';
create index if not exists pf_entrada_eventos_recibo_idx
  on public.pf_entrada_eventos (recibo_proxima_em) where recibo_enviado_em is null and recibo_proxima_em is not null;
create index if not exists pf_entrada_eventos_recurso_idx
  on public.pf_entrada_eventos (resource_id, status);

-- ---------------------------------------------------------------------
-- 4) Cursor de GET {PF}/changes (opaco). Gravado só DEPOIS de a página
--    inteira estar na fila.
-- ---------------------------------------------------------------------
create table if not exists public.pf_entrada_cursor (
  chave          text primary key,
  cursor         text not null default '0',
  atualizado_em  timestamptz not null default now()
);

comment on table public.pf_entrada_cursor is
  'Integração PrecisionFarm (fase 2): cursor da recuperação por /changes. Acesso exclusivo da service role.';

-- ---------------------------------------------------------------------
-- 4b) Eventos DESCARTADOS pela recuperação (/changes) ou pela carga inicial
--     (fora do contrato, ou event_id reutilizado com outro conteúdo). Gravado
--     ANTES de o cursor andar: nada some em silêncio. Para o suporte:
--       select * from public.pf_entrada_descartes order by id desc limit 50;
-- ---------------------------------------------------------------------
create table if not exists public.pf_entrada_descartes (
  id             bigint generated always as identity primary key,
  origem         text not null check (origem in ('notificacao', 'changes', 'inventario')),
  event_id       text,
  motivo         text not null,
  -- O item como veio (só se tiver até 64 KB).
  item           jsonb,
  registrado_em  timestamptz not null default now()
);

comment on table public.pf_entrada_descartes is
  'Integração PrecisionFarm (fase 2): eventos descartados na recuperação/carga, com o motivo. Acesso exclusivo da service role.';

create index if not exists pf_entrada_descartes_data_idx on public.pf_entrada_descartes (registrado_em desc);

-- ---------------------------------------------------------------------
-- 5) RLS ligada, nenhuma política, ninguém além da service role.
-- ---------------------------------------------------------------------
alter table public.pf_linhas_camadas  enable row level security;
alter table public.pf_linhas_revisoes enable row level security;
alter table public.pf_entrada_eventos enable row level security;
alter table public.pf_entrada_cursor  enable row level security;
alter table public.pf_entrada_descartes enable row level security;

revoke all on public.pf_linhas_camadas, public.pf_linhas_revisoes, public.pf_entrada_eventos, public.pf_entrada_cursor, public.pf_entrada_descartes
  from anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'fito_ro') then
    execute 'revoke all on public.pf_linhas_camadas, public.pf_linhas_revisoes, public.pf_entrada_eventos, public.pf_entrada_cursor, public.pf_entrada_descartes from fito_ro';
  end if;
end $$;

do $$
declare p record;
begin
  for p in select tablename, policyname from pg_policies
           where schemaname = 'public'
             and tablename in ('pf_linhas_camadas', 'pf_linhas_revisoes', 'pf_entrada_eventos', 'pf_entrada_cursor', 'pf_entrada_descartes')
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 6) Agendamento: pg_cron + pg_net chamam a rota a cada 5 minutos.
--
--    O SEGREDO DO CRON (o mesmo valor de PF_CRON_SEGREDO na Vercel) fica no
--    VAULT do Supabase — nunca neste arquivo nem no repositório. Rode UMA vez,
--    à mão, no SQL Editor, trocando o texto entre aspas:
--
--      select vault.create_secret('<cole aqui o PF_CRON_SEGREDO>', 'pf_cron_segredo',
--                                 'Segredo do cron do recebimento PrecisionFarm');
--
--    Para TROCAR depois:
--      select vault.update_secret((select id from vault.secrets where name = 'pf_cron_segredo'),
--                                 '<novo segredo>');
--
--    Sem o segredo no Vault, o job roda mas a rota responde 401 (nada quebra).
--    Endereço: troque a URL abaixo se a plataforma mudar de domínio.
-- ---------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'pf-recebimento-linhas';
end $$;

select cron.schedule(
  'pf-recebimento-linhas',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url := 'https://invicta-platform.vercel.app/api/precisionfarm/cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(
          (select decrypted_secret from vault.decrypted_secrets where name = 'pf_cron_segredo' limit 1), '')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $job$
);

-- =====================================================================
-- CONFERÊNCIA
-- =====================================================================
-- a) Todas as linhas: rls_ativa = true e politicas = 0.
select t.tabela,
       (select relrowsecurity from pg_class where oid = ('public.' || t.tabela)::regclass) as rls_ativa,
       (select count(*) from pg_policies where schemaname = 'public' and tablename = t.tabela) as politicas
  from (values ('pf_linhas_camadas'), ('pf_linhas_revisoes'), ('pf_entrada_eventos'), ('pf_entrada_cursor'), ('pf_entrada_descartes')) as t(tabela);

-- b) O job existe e está ativo (schedule '*/5 * * * *').
select jobid, jobname, schedule, active from cron.job where jobname = 'pf-recebimento-linhas';

-- c) O segredo está no Vault (deve dar 1; o valor NÃO é mostrado).
select count(*) as segredo_no_vault from vault.secrets where name = 'pf_cron_segredo';

-- d) Depois de uns 5 minutos: as últimas chamadas e o status HTTP da rota
--    (200 = ok; 503 = variáveis PF_* ainda não configuradas na Vercel; 401 =
--    segredo do Vault diferente de PF_CRON_SEGREDO).
-- select id, status_code, left(content::text, 200) as resposta, created
--   from net._http_response order by id desc limit 5;
