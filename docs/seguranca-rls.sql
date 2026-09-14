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
--
-- ⚠ ORDEM OBRIGATÓRIA A PARTIR DA v2.155.0 (seção 3b): PUBLIQUE a plataforma
-- 2.155.0 (ou mais nova) ANTES de rodar este arquivo. A seção 3b exige o
-- cabeçalho `x-invicta-versao` para escrever nos catálogos da Biblioteca, e a
-- plataforma só passou a enviá-lo na 2.155.0 — rodar antes deixaria TODO MUNDO
-- sem conseguir salvar na Biblioteca até a publicação. Abas abertas na versão
-- anterior voltam a gravar depois de recarregar (a fila de sync guarda a
-- pendência local e reenvia).
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

-- 3b) CLIENTE DESATUALIZADO NÃO ESCREVE NOS CATÁLOGOS DA BIBLIOTECA
--     (pendência 43, v2.155.0)
--
-- O QUE ACONTECEU (13/09/2026 17:41Z, visto nos logs de borda): um aparelho
-- Android com um build ANTIGO do app de campo (anterior à v2.80.0, de 27/08)
-- bootou em modo campo, semeou do zero o catálogo de variáveis
-- (inv_bib_preferencias-analise, 64 linhas) e, no primeiro push, PODOU na
-- nuvem tudo que não estava no seed:
--   DELETE app_kv?colecao=eq.inv_bib_preferencias-analise&item_id=not.in.(…) → 204
-- As casas decimais dos micronutrientes e a ordem dos elementos configuradas
-- pelo usuário sumiram para toda a empresa. A v2.80.0 corrigiu o app — mas um
-- aparelho que nunca atualizou continua com o defeito, e nada no cliente novo
-- pode impedir o cliente velho. Só o banco pode.
--
-- A REGRA: toda requisição da plataforma/app traz `x-invicta-versao` (ver
-- src/lib/supabase.ts). Escrever (insert/update/delete) nas coleções de
-- CATÁLOGO abaixo exige que o cabeçalho exista e seja >= a versão mínima.
-- Build velho não manda cabeçalho: o INSERT do seed dele é recusado (42501,
-- o `with check`), o push falha e a poda nem chega a ser enviada (syncLista
-- só apaga depois do upsert dar certo). E mesmo um DELETE/UPDATE avulso não
-- apaga nada: na RLS as linhas ficam INVISÍVEIS para quem não se identifica
-- (afeta 0 linhas, sem erro). O que o aparelho velho perde é só a própria
-- fila de sync, que fica em erro nele.
--
-- QUAIS COLEÇÕES: exatamente as que o app de campo NUNCA escreve (a lista
-- KEYS_PULAR_CAMPO em src/lib/cloud.ts + os padrões de amostragem/elementos).
-- inv_legendas, inv_bib_grades, inv_bib_safras e inv_bib_analises-foliares
-- ficam FORA de propósito: o app de campo publicado hoje (sem o cabeçalho)
-- grava nelas nas migrações/seeds do boot, e bloqueá-las deixaria o campo com
-- o selo de sync em erro.
--
-- QUAL VERSÃO VAI NO CABEÇALHO: sempre a APP_VERSION da PLATAFORMA (2.x),
-- também no app de campo — ele é cortado do mesmo commit e carrega o mesmo
-- valor. A APP_CAMPO_VERSION (3.x, das lojas) NÃO entra aqui: gravar '3.0.0'
-- como mínima travaria a plataforma inteira.
--
-- PARA SUBIR A RÉGUA depois (ex.: outra correção que um build velho não tem):
--   create or replace function public.inv_versao_minima_biblioteca()
--     returns text language sql stable as $$ select '2.170.0' $$;
-- (só depois de publicar essa versão — mesma ordem do aviso no cabeçalho).
create or replace function public.inv_versao_minima_biblioteca()
returns text
language sql
stable
as $$
  select '2.155.0'
$$;

create or replace function public.inv_colecao_catalogo(p_colecao text)
returns boolean
language sql
immutable
as $$
  select p_colecao in (
    'inv_bib_preferencias-analise',   -- variáveis de análise (o caso de 13/09)
    'inv_bib_laboratorios', 'inv_bib_labs', 'inv_bib_perfis',
    'inv_bib_equacoes', 'inv_bib_recomendacoes',
    'inv_bib_insumos', 'inv_bib_exportacao',
    'inv_bib_propositos', 'inv_bib_cultivares',
    'inv_padroes_elem', 'inv_padroes_amos'
  )
$$;

-- Lê o cabeçalho da requisição (o PostgREST expõe todos em request.headers,
-- em minúsculas). Sem cabeçalho, ou fora do formato X.Y.Z, é cliente velho.
-- A comparação é numérica por parte (int[]): em texto "2.155.0" < "2.9.0";
-- aqui 2.155.0 >= 2.9.0, como deve ser.
create or replace function public.inv_cliente_atualizado()
returns boolean
language plpgsql
stable
as $$
declare
  v_versao text;
begin
  v_versao := coalesce(current_setting('request.headers', true), '{}')::json ->> 'x-invicta-versao';
  if v_versao is null or v_versao !~ '^\d+\.\d+\.\d+$' then
    return false;
  end if;
  return string_to_array(v_versao, '.')::int[]
      >= string_to_array(public.inv_versao_minima_biblioteca(), '.')::int[];
end;
$$;

-- 4) Coleções de ACESSO: só owner/admin escrevem; qualquer autenticado lê
--    (o app precisa ler o próprio papel no boot).
--    OBS: a leitura ampla é aceitável porque estes registros não têm segredo;
--    o que não pode é ESCRITA por quem não é admin.
--    E, desde a 3b, as coleções de CATÁLOGO só aceitam cliente atualizado.
create policy app_kv_select_autenticado on public.app_kv
  for select to authenticated
  using (true);

create policy app_kv_insert_autenticado on public.app_kv
  for insert to authenticated
  with check (
    (colecao not in ('inv_papeis', 'inv_permissoes', 'inv_planos', 'inv_convites', 'inv_auditoria')
      or public.inv_eh_admin())
    and (not public.inv_colecao_catalogo(colecao) or public.inv_cliente_atualizado())
  );

create policy app_kv_update_autenticado on public.app_kv
  for update to authenticated
  using (
    (colecao not in ('inv_papeis', 'inv_permissoes', 'inv_planos', 'inv_convites', 'inv_auditoria')
      or public.inv_eh_admin())
    and (not public.inv_colecao_catalogo(colecao) or public.inv_cliente_atualizado())
  )
  with check (
    (colecao not in ('inv_papeis', 'inv_permissoes', 'inv_planos', 'inv_convites', 'inv_auditoria')
      or public.inv_eh_admin())
    and (not public.inv_colecao_catalogo(colecao) or public.inv_cliente_atualizado())
  );

create policy app_kv_delete_autenticado on public.app_kv
  for delete to authenticated
  using (
    (colecao not in ('inv_papeis', 'inv_permissoes', 'inv_planos', 'inv_convites', 'inv_auditoria')
      or public.inv_eh_admin())
    and (not public.inv_colecao_catalogo(colecao) or public.inv_cliente_atualizado())
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
-- a) Políticas ativas (com a expressão: uma política criada pelo painel do
--    Supabase, fora deste arquivo, somaria por OU e contornaria a régua da 3b):
--    select policyname, cmd, qual, with_check from pg_policies where tablename = 'app_kv';
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
-- c) Régua de versão (seção 3b) — no SQL Editor (sem cabeçalho, deve dar false):
--    select public.inv_cliente_atualizado(), public.inv_versao_minima_biblioteca();
--    → false | 2.155.0
--    E no app publicado (>= 2.155.0), editar uma variável em Biblioteca →
--    Preferências de Análise tem que salvar normalmente e o selo de sync ficar
--    verde. Se ficar em erro, a plataforma no ar ainda não manda o cabeçalho:
--    publique primeiro (aviso no topo deste arquivo). Numa aba ainda na
--    versão antiga, EXCLUIR um item de catálogo parece dar certo (a RLS só
--    esconde a linha: 0 afetadas, sem erro) e o item volta no próximo boot —
--    recarregar a aba resolve.
--
-- LIMITE CONHECIDO: a leitura continua ampla (qualquer autenticado lê todas as
-- coleções). Restringir a LEITURA por vínculo (produtor/fazenda/talhão) exige
-- reescrever o boot, que hoje baixa a base inteira antes de saber quem é o
-- usuário. Fica registrado como próximo passo de segurança.
