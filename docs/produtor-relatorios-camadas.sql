-- v2.216.0 — o PRODUTOR grava o relatório da aba Camadas na lista de Relatórios.
--
-- ⚠ NÃO APLICADO (28/10/2026). Ao ir aplicar, o banco de produção NÃO tinha o
-- bloco do produtor de docs/seguranca-rls.sql: nenhuma das funções inv_eh_produtor /
-- inv_produtor_pode_talhao / inv_produtor_pode_gravar / inv_talhao_do_registro
-- nem as políticas app_kv_produtor_*. Sem elas esta função não tem efeito. A
-- v2.216.0 saiu só no app (o banco já aceita a gravação; quem barrava era o
-- filtro do cliente). Este ramo já está em docs/seguranca-rls.sql — vale quando
-- o bloco inteiro do produtor for aplicado.
--
-- Projeto Supabase da plataforma de AP: hxmfjdwoltrnbovgbmoz ("invicta-prod").
-- Rodar no SQL Editor. Idempotente (create or replace) — pode rodar de novo.
--
-- O QUE MUDA: só a função inv_talhao_do_registro ganha um ramo. As políticas
-- app_kv_produtor_insert / _update / _delete (docs/seguranca-rls.sql) já
-- chamam inv_produtor_pode_gravar → inv_talhao_do_registro, então passam a
-- aceitar, PARA O PRODUTOR, exatamente isto:
--   coleção inv_relatorios, documento com tipo = 'Camadas' e talhaoId de um
--   talhão do escopo dele.
-- Qualquer outro relatório (Fertilidade, Recomendação, Compactação…) continua
-- só de leitura para ele. No UPDATE as duas pontas são conferidas, então ele
-- não transforma um relatório da equipe em "Camadas" para tomá-lo, nem muda o
-- talhão de um registro. Equipe (não produtor): nada muda.
--
-- Efeito colateral aceito: o DELETE usa a mesma regra, então o banco deixaria o
-- produtor apagar um registro "Camadas" dos talhões dele (inclusive um gerado
-- pela equipe). A tela não oferece isso a ele (relatorios.excluir = não).
--
-- Espelho no cliente: src/lib/iam/escritaProdutor.ts (npm run teste:escritaprodutor).
--
-- REVERTER: rodar de novo a versão anterior da função (docs/seguranca-rls.sql
-- na v2.215.0), que é este mesmo texto sem o ramo de inv_relatorios.

create or replace function public.inv_talhao_do_registro(p_colecao text, p_item text, p_dados jsonb)
returns text
language sql
immutable
as $$
  select case
    when p_colecao = 'inv_mapas_fert' then
      case
        when split_part(p_item, '__', 1) in ('compactacao', 'composicao')
          then nullif(split_part(p_item, '__', 2), '')
        when split_part(p_item, '__', 2) in ('ndvi', 'ndvicbers')
          then nullif(split_part(p_item, '__', 1), '')
      end
    -- Cenas: o item_id É o talhão; o talhaoId do doc, se houver, tem que bater.
    when p_colecao = 'inv_cenas_estado' then
      case when coalesce(p_dados->>'talhaoId', p_item) = p_item then nullif(p_item, '') end
    when p_colecao in ('inv_compactacao', 'inv_grades_compact', 'inv_composicoes', 'inv_prescricoes') then
      nullif(p_dados->>'talhaoId', '')
    -- Grades: só a amostragem composta (UPDATE confere as duas pontas, então
    -- o produtor não transforma uma grade dele em grid nem o contrário).
    when p_colecao = 'inv_grades' and p_dados->>'metodo' = 'composta' then
      nullif(p_dados->>'talhaoId', '')
    -- Relatórios: só o "Mapa de camadas" (v2.216.0). Mesma regra das duas
    -- pontas no UPDATE: não vira Camadas o que não era.
    when p_colecao = 'inv_relatorios' and p_dados->>'tipo' = 'Camadas' then
      nullif(p_dados->>'talhaoId', '')
  end
$$;

-- Conferência rápida depois de rodar (deve devolver 't1', null, null):
-- select public.inv_talhao_do_registro('inv_relatorios', 'r1', '{"tipo":"Camadas","talhaoId":"t1"}'),
--        public.inv_talhao_do_registro('inv_relatorios', 'r2', '{"tipo":"Fertilidade","talhaoId":"t1"}'),
--        public.inv_talhao_do_registro('inv_relatorios', 'r3', '{"tipo":"Camadas"}');
