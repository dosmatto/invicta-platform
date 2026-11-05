-- =====================================================================
-- Integração PrecisionFarm — EXTENSÃO 0.3.0 (ledger pf-contrato-03).
--
-- Publicar `prescription` (Invicta → PF, estrela "Enviar à PrecisionFarm" na
-- aba Prescrições) e receber `topography` (PF → Invicta, curvas de nível na
-- aba Altimetria). Contrato: FORMATO_0_3.md / EXEMPLOS_0_3.json da PF;
-- lado da Invicta: docs/integracao-precisionfarm.md §9.
--
-- COMO APLICAR (nada disto é aplicado automaticamente)
--   Supabase da AP → SQL Editor → cole este arquivo → Run. É IDEMPOTENTE:
--   rodar de novo não apaga nem duplica nada.
--   Pré-requisitos: docs/integracao-precisionfarm.sql (fase 1) e
--   docs/integracao-precisionfarm-fase2.sql (fase 2) já aplicados.
--
-- ENQUANTO NÃO FOR APLICADO o código funciona como antes (0.2): zonas,
-- colheita e linhas seguem iguais; a estrela das prescrições responde
-- "aplique docs/integracao-precisionfarm-0.3.sql", a topografia recebida é
-- recusada com 503 (a PF tenta de novo) e a coluna "Prescr." da tela de lote
-- fica "—".
--
-- As mesmas regras das fases 1 e 2: RLS ligada, NENHUMA política, só a
-- SERVICE ROLE (rotas do servidor) alcança; app_kv/talhoes nunca são escritos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) pf_recursos aceita 'prescription' (um recurso por LINHAGEM da prescrição:
--    chave_local = 'prescription|<id da V1>'). O check da fase 1 só aceitava
--    management_zones/harvest. Derruba QUALQUER check desta tabela que cite
--    resource_type (o nome não é garantido) e recria.
-- ---------------------------------------------------------------------
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.pf_recursos'::regclass
             and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%resource_type%'
  loop
    execute format('alter table public.pf_recursos drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.pf_recursos
  add constraint pf_recursos_resource_type_check check (resource_type in ('management_zones', 'harvest', 'prescription'));

-- ---------------------------------------------------------------------
-- 2) Estrela "Enviar à PrecisionFarm" — por LINHAGEM (talhão + id da V1).
--    Fica no servidor (não no registro da prescrição): só owner/admin marca
--    (a rota confere), vale para a versão mais recente da linhagem e sobrevive
--    a versões novas (inclusive as que a Lavra grava). A última situação
--    (publicada / pendente / arquivada + motivo) fica aqui para a tela de lote.
-- ---------------------------------------------------------------------
create table if not exists public.pf_prescricoes_estrela (
  talhao_id      text not null,
  linhagem_id    text not null,
  marcada        boolean not null default false,
  marcada_por    text,
  marcada_em     timestamptz,
  situacao       text check (situacao in ('publicada', 'pendente', 'arquivada', 'nao_publicada')),
  motivo         text,
  revisao        integer,
  resource_id    uuid,
  verificado_em  timestamptz,
  atualizado_em  timestamptz not null default now(),
  primary key (talhao_id, linhagem_id)
);

comment on table public.pf_prescricoes_estrela is
  'Integração PrecisionFarm (0.3): estrela "Enviar à PrecisionFarm" por linhagem de prescrição + última situação. Acesso exclusivo da service role.';

-- ---------------------------------------------------------------------
-- 3) Topografia recebida usa o MESMO pipeline das linhas (fila, snapshots
--    imutáveis, recibo): a camada e as revisões ganham o tipo e os metadados
--    próprios (intervalo, destaque, cotas mín/máx). Linhas existentes viram
--    'guidance' pelo default.
-- ---------------------------------------------------------------------
alter table public.pf_linhas_camadas  add column if not exists resource_type text not null default 'guidance';
alter table public.pf_linhas_camadas  add column if not exists meta jsonb;
alter table public.pf_linhas_revisoes add column if not exists resource_type text not null default 'guidance';
alter table public.pf_linhas_revisoes add column if not exists meta jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pf_linhas_camadas_resource_type_check') then
    alter table public.pf_linhas_camadas
      add constraint pf_linhas_camadas_resource_type_check check (resource_type in ('guidance', 'topography'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pf_linhas_revisoes_resource_type_check') then
    alter table public.pf_linhas_revisoes
      add constraint pf_linhas_revisoes_resource_type_check check (resource_type in ('guidance', 'topography'));
  end if;
end $$;

create index if not exists pf_linhas_camadas_talhao_tipo_idx on public.pf_linhas_camadas (talhao_id, resource_type);

-- ---------------------------------------------------------------------
-- 4) RLS ligada, nenhuma política, ninguém além da service role.
-- ---------------------------------------------------------------------
alter table public.pf_prescricoes_estrela enable row level security;
revoke all on public.pf_prescricoes_estrela from anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'fito_ro') then
    execute 'revoke all on public.pf_prescricoes_estrela from fito_ro';
  end if;
end $$;

do $$
declare p record;
begin
  for p in select tablename, policyname from pg_policies
           where schemaname = 'public' and tablename = 'pf_prescricoes_estrela'
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- =====================================================================
-- CONFERÊNCIA
-- =====================================================================
-- a) rls_ativa = true e politicas = 0.
select t.tabela,
       (select relrowsecurity from pg_class where oid = ('public.' || t.tabela)::regclass) as rls_ativa,
       (select count(*) from pg_policies where schemaname = 'public' and tablename = t.tabela) as politicas
  from (values ('pf_prescricoes_estrela'), ('pf_recursos'), ('pf_linhas_camadas'), ('pf_linhas_revisoes')) as t(tabela);

-- b) Exatamente UM check de resource_type em pf_recursos, com 'prescription'.
select conname, pg_get_constraintdef(oid) as definicao
  from pg_constraint
 where conrelid = 'public.pf_recursos'::regclass and contype = 'c'
 order by conname;

-- c) As colunas novas (4 linhas).
select table_name, column_name, data_type, column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('pf_linhas_camadas', 'pf_linhas_revisoes')
   and column_name in ('resource_type', 'meta')
 order by table_name, column_name;
