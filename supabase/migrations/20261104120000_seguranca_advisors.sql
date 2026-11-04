-- =====================================================================
-- Segurança — achados do Security Advisor do Supabase (invicta-prod,
-- ref hxmfjdwoltrnbovgbmoz), diagnóstico de 2026-11-04.
--
-- Escopo aprovado: itens 1 a 3. NÃO mexe na policy `talhoes_autenticado`
-- (ALL, using=true) — isso fica para uma conversa à parte.
--
-- Aplicação: SQL Editor do painel, colando ESTE arquivo inteiro (conferir
-- o SHA-1 antes de rodar). Tudo roda numa transação só.
-- Reversão: ver o bloco "REVERSÃO" no fim do arquivo.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. public.spatial_ref_sys  (alerta CRÍTICO rls_disabled_in_public)
--
-- Tabela de sistema do PostGIS, dona `supabase_admin`. O ACL atual é
--   anon=arwdDxtm/supabase_admin, authenticated=arwdDxtm/supabase_admin
-- ou seja: quem concedeu foi o supabase_admin e o `postgres` NÃO tem
-- grant option. Este REVOKE, rodado como postgres, deve terminar com
-- "WARNING: no privileges could be revoked" e NÃO tem efeito — fica aqui
-- como registro da tentativa. NÃO tentar mover o PostGIS de schema
-- (a extensão não é realocável e isso quebraria as geometrias).
-- Correção definitiva: pedir ao suporte do Supabase que rode este mesmo
-- revoke como supabase_admin. Até lá, o alerta é falso positivo
-- documentado em HANDOFF.md.
-- ---------------------------------------------------------------------
revoke all on table public.spatial_ref_sys from anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. public.integracao_chaves  (Info: RLS ligado sem policy)
--
-- Tabela só de servidor (src/lib/programacao/servidor.ts, via service
-- role). O RLS sem policy já nega tudo para anon/authenticated; tirar o
-- grant é reforço, no mesmo padrão das tabelas pf_* (integracao-
-- precisionfarm.sql). O service_role não é afetado.
-- ---------------------------------------------------------------------
revoke all on table public.integracao_chaves from anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Function Search Path Mutable (3 avisos)
--
-- As três são LANGUAGE sql, SECURITY INVOKER, e só referenciam funções
-- de public.* e embutidas do pg_catalog (conferido em
-- docs/seguranca-rls.sql). Fixar o search_path não muda o resultado.
-- ---------------------------------------------------------------------
alter function public.inv_textos(jsonb)
  set search_path = public, pg_temp;
alter function public.inv_talhao_do_registro(text, text, jsonb)
  set search_path = public, pg_temp;
alter function public.inv_produtor_pode_gravar(text, text, jsonb)
  set search_path = public, pg_temp;

commit;

-- =====================================================================
-- REVERSÃO (não roda junto; colar à parte se precisar desfazer)
--
-- grant all on table public.integracao_chaves to anon, authenticated;
-- alter function public.inv_textos(jsonb) reset search_path;
-- alter function public.inv_talhao_do_registro(text, text, jsonb) reset search_path;
-- alter function public.inv_produtor_pode_gravar(text, text, jsonb) reset search_path;
-- =====================================================================
