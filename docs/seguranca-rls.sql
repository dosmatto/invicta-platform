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
-- ⚠ kv_auth_all/talhoes_auth_all: políticas do setup INICIAL que liberavam
-- TUDO a qualquer autenticado. Políticas permissivas se somam por OU — se elas
-- ficarem, o resto deste arquivo não protege nada. Removê-las é o ponto.
drop policy if exists kv_auth_all on public.app_kv;
drop policy if exists talhoes_auth_all on public.talhoes;
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
-- EXCEÇÃO 2 — CONSUMO DO CONVITE PELO PRÓPRIO CONVIDADO (v2.10.x)
-- =====================================================================
-- Ao se cadastrar pelo link, o convidado (não-admin) marca o convite como
-- usado / incrementa o contador do link multiuso. Sem isto, o link individual
-- nunca se consumiria (ficaria reutilizável). A escrita exige que o registro
-- novo carregue o PRÓPRIO e-mail em usadoPor e um status não-privilegiante —
-- o pior que um autenticado malicioso consegue é DESATIVAR um convite (marcar
-- usado com o e-mail dele carimbado), nunca criar/renovar/reabrir um.
drop policy if exists app_kv_update_convite_uso on public.app_kv;
create policy app_kv_update_convite_uso on public.app_kv
  for update to authenticated
  using (colecao = 'inv_convites')
  with check (
    colecao = 'inv_convites'
    and lower(dados->>'usadoPor') = lower(coalesce(auth.jwt()->>'email', ''))
    and coalesce(dados->>'status', '') in ('pendente', 'usado')
  );

-- =====================================================================
-- EXCEÇÃO 3 — AUDITORIA É APPEND-ONLY PARA TODOS
-- =====================================================================
-- Qualquer autenticado pode ACRESCENTAR entrada de auditoria (login,
-- cadastro_solicitado, convite_usado…) — é o propósito de uma trilha.
-- Alterar/apagar continua exclusivo de admin (políticas da seção 4).
drop policy if exists app_kv_insert_auditoria on public.app_kv;
create policy app_kv_insert_auditoria on public.app_kv
  for insert to authenticated
  with check (colecao = 'inv_auditoria');

-- LIMITE ACEITO: o "último acesso" de usuários NÃO-admin deixa de sincronizar
-- (a atualização do próprio registro em inv_papeis exige status
-- 'aguardando_aprovacao'; afrouxar isso deixaria o usuário editar as próprias
-- permissões/vínculos). Cosmético — preferível ao risco.

-- =====================================================================
-- ACEITE DO CONVITE — QUEM VEM POR LINK ENTRA SEM APROVAÇÃO (v2.135)
-- =====================================================================
-- O PROBLEMA QUE ISTO RESOLVE
-- O link de convite já sai do administrador com categoria, papel, perfil de
-- permissões e vínculos escolhidos. Pedir aprovação depois é pedir a MESMA
-- decisão duas vezes — e, na prática, deixava gente parada na fila. Só que a
-- política `app_kv_insert_autocadastro` acima exige status
-- 'aguardando_aprovacao': o app tentava gravar 'ativo', levava 42501 e caía na
-- fila. Era esse o motivo de a "liberação automática" das v2.116/2.117 quase
-- nunca acontecer.
--
-- POR QUE NÃO BASTA AFROUXAR A POLÍTICA
-- Se o `with check` passasse a aceitar 'ativo', o convidado escreveria o próprio
-- registro com o papel, as permissões e os vínculos que quisesse — o navegador é
-- quem monta esse documento. A função abaixo é SECURITY DEFINER e MONTA o
-- registro a partir da linha do CONVITE; do cliente vêm só o token, o nome e o
-- telefone, e o e-mail sai do JWT. Não há campo que o convidado escolha.
--
-- O QUE ELA FAZ, EM ORDEM
--   1. exige sessão (auth.uid()) e lê o e-mail do JWT;
--   2. acha o convite pelo token e recusa cancelado / vencido / já usado
--      (individual) / e-mail que não bate;
--   3. copia as permissões do perfil do convite, se houver;
--   4. grava/atualiza o registro em inv_papeis com status 'ativo';
--   5. consome o convite (individual vira 'usado'; link de grupo conta o uso);
--   6. registra a auditoria e devolve o registro em jsonb.
-- Recusa devolve { ok: false, motivo: … } — nunca exceção: o app cai na fila.
create or replace function public.inv_aceitar_convite(
  p_token text, p_nome text default '', p_telefone text default ''
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email    text := lower(coalesce(auth.jwt()->>'email', ''));
  v_conv     jsonb;
  v_papel    text;
  v_perm     jsonb;
  v_reg      jsonb;
  v_ev       text := gen_random_uuid()::text;
  v_agora    text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if auth.uid() is null or v_email = '' then
    return jsonb_build_object('ok', false, 'motivo', 'sem-sessao');
  end if;

  select k.dados into v_conv
    from public.app_kv k
   where k.colecao = 'inv_convites' and k.dados->>'id' = p_token
   limit 1;

  if v_conv is null then
    return jsonb_build_object('ok', false, 'motivo', 'inexistente');
  end if;
  if coalesce(v_conv->>'status', 'pendente') = 'cancelado' then
    return jsonb_build_object('ok', false, 'motivo', 'cancelado');
  end if;
  -- Convite individual é de uso único; link de grupo (multiuso) não se esgota.
  if coalesce((v_conv->>'multiuso')::boolean, false) is false
     and coalesce(v_conv->>'status', 'pendente') = 'usado'
     and lower(coalesce(v_conv->>'usadoPor', '')) <> v_email then
    return jsonb_build_object('ok', false, 'motivo', 'usado');
  end if;
  -- Convite sem data (registro antigo) não expira: o `nullif` evita que um
  -- campo vazio derrube a função inteira com erro de cast.
  if nullif(v_conv->>'expiraEm', '') is not null
     and (v_conv->>'expiraEm')::timestamptz < now() then
    return jsonb_build_object('ok', false, 'motivo', 'expirado');
  end if;
  -- Convite com e-mail previsto só serve para aquela pessoa. Sem e-mail
  -- (link aberto ou de grupo), vale para quem abrir — é o desenho dele.
  if coalesce(v_conv->>'email', '') <> '' and lower(v_conv->>'email') <> v_email then
    return jsonb_build_object('ok', false, 'motivo', 'email-diferente');
  end if;

  v_papel := coalesce(v_conv->>'papel', 'leitor');
  -- Papel privilegiado NUNCA sai de um link: promoção dessas é na mão.
  if v_papel in ('owner', 'admin') then
    return jsonb_build_object('ok', false, 'motivo', 'papel-privilegiado');
  end if;

  if coalesce(v_conv->>'perfilId', '') <> '' then
    select k.dados->'permissoes' into v_perm
      from public.app_kv k
     where k.colecao = 'inv_perfis_permissao' and k.dados->>'id' = v_conv->>'perfilId'
     limit 1;
  end if;

  -- Registro montado AQUI, a partir do convite. Campos de vínculo só entram
  -- quando o convite os define: lista vazia significaria "sem acesso a nada".
  v_reg := jsonb_strip_nulls(jsonb_build_object(
    'id', v_email, 'email', v_email,
    'nome', nullif(trim(coalesce(p_nome, '')), ''),
    'telefone', nullif(trim(coalesce(p_telefone, '')), ''),
    'papel', v_papel,
    'categoria', v_conv->>'categoria',
    'status', 'ativo',
    'criadoEm', v_agora, 'criadoPor', v_email,
    'aprovadoEm', v_agora,
    'aprovadoPor', 'convite ' ||
      case when coalesce((v_conv->>'multiuso')::boolean, false)
           then 'de grupo' else 'individual' end || ' (liberação automática)',
    'aceiteLgpdEm', v_agora, 'aceiteTermosEm', v_agora,
    'conviteId', p_token,
    'permissoes', v_perm,
    'clientesVinculados', case when jsonb_array_length(coalesce(v_conv->'clientesVinculados', '[]'::jsonb)) > 0
                               then v_conv->'clientesVinculados' end,
    'fazendasVinculadas', case when jsonb_array_length(coalesce(v_conv->'fazendasVinculadas', '[]'::jsonb)) > 0
                               then v_conv->'fazendasVinculadas' end
  ));

  -- Já existe registro? Só completa o que falta e ativa — nunca rebaixa alguém
  -- que já tem acesso maior (reabrir o link não pode virar downgrade).
  insert into public.app_kv (colecao, item_id, dados, atualizado_em)
  values ('inv_papeis', v_email, v_reg, now())
  on conflict (colecao, item_id) do update
    set dados = case
          when app_kv.dados->>'papel' in ('owner', 'admin')
            then app_kv.dados || (excluded.dados - 'papel')
          else app_kv.dados || excluded.dados
        end,
        atualizado_em = now();

  select k.dados into v_reg from public.app_kv k
   where k.colecao = 'inv_papeis' and k.item_id = v_email;

  -- Consome o convite: individual vira 'usado'; link de grupo conta o uso.
  update public.app_kv
     set dados = dados
       || jsonb_build_object('usadoEm', v_agora, 'usadoPor', v_email)
       || case when coalesce((dados->>'multiuso')::boolean, false)
               then jsonb_build_object('usos', coalesce((dados->>'usos')::int, 0) + 1)
               else jsonb_build_object('status', 'usado') end,
         atualizado_em = now()
   where colecao = 'inv_convites' and dados->>'id' = p_token;

  -- Auditoria (mesma forma de EventoAuditoria: id/em/quem/acao/alvo/para/detalhe).
  insert into public.app_kv (colecao, item_id, dados, atualizado_em)
  values ('inv_auditoria', v_ev, jsonb_build_object(
    'id', v_ev, 'em', v_agora, 'quem', v_email, 'acao', 'usuario_aprovado',
    'alvo', v_email, 'para', 'ativo',
    'detalhe', 'liberado automaticamente pelo link de convite'), now());

  return jsonb_build_object('ok', true, 'usuario', v_reg);
end;
$$;

revoke all on function public.inv_aceitar_convite(text, text, text) from public;
grant execute on function public.inv_aceitar_convite(text, text, text) to authenticated;

-- =====================================================================
-- CONFERÊNCIA (rode depois de aplicar)
-- =====================================================================
-- a) Políticas ativas:
--    select policyname, cmd from pg_policies where tablename = 'app_kv';
--
-- a2) A função de aceite existe e está visível para o app:
--    select proname from pg_proc where proname = 'inv_aceitar_convite';
--    → 1 linha. Sem ela, quem se cadastra pelo link continua caindo na fila
--      (o app trata isso e a Central de Acessos libera sozinha depois).
--
-- a3) Teste seco, sem gastar um convite de verdade (no SQL Editor):
--    select public.inv_aceitar_convite('token-que-nao-existe');
--    → {"ok": false, "motivo": "sem-sessao"}  (o SQL Editor não tem JWT)
--      ou {"ok": false, "motivo": "inexistente"}. Qualquer um dos dois prova
--      que a função compilou e responde — o que NÃO pode é dar erro.
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
