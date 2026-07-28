-- =====================================================================
-- INVICTA — Políticas de segurança (RLS) do Supabase
-- =====================================================================
-- POR QUE ISTO EXISTE
-- Hoje TODA a autorização do app é client-side: `pode()` só esconde botões e
-- os filtros de escopo só recortam arrays já baixados. A tabela `app_kv`
-- guarda TUDO no mesmo lugar — inclusive `inv_papeis`, que é a fonte da
-- verdade do acesso. Sem as políticas abaixo, um usuário autenticado pode
-- abrir o console do navegador e escrever o próprio papel como 'owner',
-- contornando o sistema inteiro.
--
-- COMO APLICAR
--   Supabase → SQL Editor → cole este arquivo → Run.
--   Depois confira em Table Editor → app_kv → RLS: deve estar "Enabled".
--
-- IMPORTANTE: rode ANTES em um horário de baixo uso e confira o app logo em
-- seguida (o app segue funcionando: as políticas liberam leitura/escrita para
-- usuários autenticados, exceto nas coleções de ACESSO, que passam a exigir
-- que o autor seja owner/admin).
-- =====================================================================

-- 1) Liga a RLS (se ainda não estiver ligada)
alter table public.app_kv enable row level security;
alter table public.talhoes enable row level security;

-- 2) Remove políticas antigas com estes nomes (idempotente)
drop policy if exists app_kv_select_autenticado on public.app_kv;
drop policy if exists app_kv_insert_autenticado on public.app_kv;
drop policy if exists app_kv_update_autenticado on public.app_kv;
drop policy if exists app_kv_delete_autenticado on public.app_kv;
drop policy if exists app_kv_escrita_acesso_admin on public.app_kv;

-- 3) Função auxiliar: o e-mail logado é owner/admin em inv_papeis?
--    SECURITY DEFINER para poder ler inv_papeis sem cair na própria RLS.
create or replace function public.inv_eh_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_kv k
    where k.colecao = 'inv_papeis'
      and lower(k.dados->>'email') = lower(coalesce(auth.jwt()->>'email', ''))
      and k.dados->>'papel' in ('owner', 'admin')
  );
$$;

-- 4) Coleções de ACESSO: só owner/admin escrevem; qualquer autenticado lê
--    (o app precisa ler o próprio papel no boot).
--    OBS: a leitura ampla é aceitável porque estes registros não têm segredo;
--    o que não pode é ESCRITA por quem não é admin.
create policy app_kv_select_autenticado on public.app_kv
  for select to authenticated
  using (true);

create policy app_kv_insert_autenticado on public.app_kv
  for insert to authenticated
  with check (
    colecao not in ('inv_papeis', 'inv_permissoes', 'inv_planos', 'inv_convites', 'inv_auditoria')
    or public.inv_eh_admin()
  );

create policy app_kv_update_autenticado on public.app_kv
  for update to authenticated
  using (
    colecao not in ('inv_papeis', 'inv_permissoes', 'inv_planos', 'inv_convites', 'inv_auditoria')
    or public.inv_eh_admin()
  )
  with check (
    colecao not in ('inv_papeis', 'inv_permissoes', 'inv_planos', 'inv_convites', 'inv_auditoria')
    or public.inv_eh_admin()
  );

create policy app_kv_delete_autenticado on public.app_kv
  for delete to authenticated
  using (
    colecao not in ('inv_papeis', 'inv_permissoes', 'inv_planos', 'inv_convites', 'inv_auditoria')
    or public.inv_eh_admin()
  );

-- 5) Tabela relacional de talhões: mesma regra geral (autenticado opera).
drop policy if exists talhoes_autenticado on public.talhoes;
create policy talhoes_autenticado on public.talhoes
  for all to authenticated
  using (true) with check (true);

-- =====================================================================
-- EXCEÇÃO NECESSÁRIA — AUTO-CADASTRO POR CONVITE
-- =====================================================================
-- Quem se cadastra pelo link ainda NÃO é admin, mas precisa gravar o próprio
-- pedido em inv_papeis (status 'aguardando_aprovacao'). A política abaixo
-- permite EXATAMENTE isso: inserir/atualizar o registro do PRÓPRIO e-mail,
-- desde que o papel não seja privilegiado e o status seja o de espera.
drop policy if exists app_kv_insert_autocadastro on public.app_kv;
create policy app_kv_insert_autocadastro on public.app_kv
  for insert to authenticated
  with check (
    colecao = 'inv_papeis'
    and lower(dados->>'email') = lower(coalesce(auth.jwt()->>'email', ''))
    and coalesce(dados->>'papel', '') not in ('owner', 'admin')
    and coalesce(dados->>'status', '') = 'aguardando_aprovacao'
  );

drop policy if exists app_kv_update_autocadastro on public.app_kv;
create policy app_kv_update_autocadastro on public.app_kv
  for update to authenticated
  using (
    colecao = 'inv_papeis'
    and lower(dados->>'email') = lower(coalesce(auth.jwt()->>'email', ''))
  )
  with check (
    colecao = 'inv_papeis'
    and lower(dados->>'email') = lower(coalesce(auth.jwt()->>'email', ''))
    and coalesce(dados->>'papel', '') not in ('owner', 'admin')
    and coalesce(dados->>'status', '') = 'aguardando_aprovacao'
  );

-- =====================================================================
-- CONFERÊNCIA (rode depois de aplicar)
-- =====================================================================
-- a) Políticas ativas:
--    select policyname, cmd from pg_policies where tablename = 'app_kv';
--
-- b) Teste do bloqueio (logado como usuário COMUM no app, no console):
--    await window.__sb.from('app_kv').update({dados:{papel:'owner'}})
--      .eq('colecao','inv_papeis').eq('item_id','<seu-email>')
--    → deve falhar/afetar 0 linhas. Se promover, a RLS não está valendo.
--
-- LIMITE CONHECIDO: a leitura continua ampla (qualquer autenticado lê todas as
-- coleções). Restringir a LEITURA por vínculo (produtor/fazenda/talhão) exige
-- reescrever o boot, que hoje baixa a base inteira antes de saber quem é o
-- usuário. Fica registrado como próximo passo de segurança.
