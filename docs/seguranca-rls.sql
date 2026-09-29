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
--
-- ⚠ v2.186.0 — DUAS AMARRAS NOVAS, sem elas a seção 6 não vale nada:
--   · item_id = e-mail (a linha CANÔNICA; o app grava id = e-mail normalizado).
--     Antes dava para inserir uma 2ª linha do próprio e-mail, com outro item_id,
--     papel/vínculos à escolha — e quem lesse "a linha do e-mail" com limit 1
--     podia ler justamente a forjada.
--   · o UPDATE só vale para quem AINDA está em espera (a linha atual, `using`).
--     Antes, um usuário ATIVO (ex.: produtor) reescrevia o próprio registro
--     como papel 'agronomo' + status 'aguardando_aprovacao' e, na requisição
--     seguinte, deixava de ser produtor para o banco.
drop policy if exists app_kv_insert_autocadastro on public.app_kv;
create policy app_kv_insert_autocadastro on public.app_kv
  for insert to authenticated
  with check (
    colecao = 'inv_papeis'
    and item_id = lower(coalesce(auth.jwt()->>'email', ''))
    and lower(dados->>'email') = lower(coalesce(auth.jwt()->>'email', ''))
    and coalesce(dados->>'papel', '') not in ('owner', 'admin')
    and coalesce(dados->>'status', '') = 'aguardando_aprovacao'
  );

drop policy if exists app_kv_update_autocadastro on public.app_kv;
create policy app_kv_update_autocadastro on public.app_kv
  for update to authenticated
  using (
    colecao = 'inv_papeis'
    and item_id = lower(coalesce(auth.jwt()->>'email', ''))
    and lower(dados->>'email') = lower(coalesce(auth.jwt()->>'email', ''))
    and coalesce(dados->>'status', '') = 'aguardando_aprovacao'
  )
  with check (
    colecao = 'inv_papeis'
    and item_id = lower(coalesce(auth.jwt()->>'email', ''))
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

-- ⚠ v2.186.0 — A POLÍTICA ACIMA NÃO BASTAVA. O `with check` só olha a linha
-- NOVA: um autenticado reescrevia um convite qualquer com papel 'editor',
-- email '', multiuso, sem validade, status 'pendente' e usadoPor = ele — e
-- depois chamava inv_aceitar_convite(token) e virava editor. Política não
-- enxerga a linha antiga; trigger enxerga. Para quem chega pela API (papel
-- `authenticated`) e não é admin, o UPDATE de convite só pode mexer no que o
-- CONSUMO mexe (usadoEm, usadoPor, status → 'usado', usos + 1). O resto do
-- documento tem que continuar idêntico. inv_aceitar_convite roda como dono da
-- função (SECURITY DEFINER), não como `authenticated`, e só consome — passa.
create or replace function public.inv_convite_so_consumo()
returns trigger
language plpgsql
as $$
declare
  v_campos text[] := array['usadoEm', 'usadoPor', 'status', 'usos'];
begin
  if new.colecao <> 'inv_convites' and old.colecao <> 'inv_convites' then return new; end if;
  if current_user <> 'authenticated' or public.inv_eh_admin() then return new; end if;
  -- Convite INDIVIDUAL já consumido é imutável: trocar o usadoPor dele pelo
  -- próprio e-mail o tornava reutilizável (inv_aceitar_convite aceita "usado"
  -- quando o usadoPor é quem chama).
  if not coalesce((old.dados->>'multiuso')::boolean, false)
     and (coalesce(old.dados->>'status', '') = 'usado' or coalesce(old.dados->>'usadoPor', '') <> '')
     and new.dados is distinct from old.dados then
    raise exception 'convite: convite individual já usado não muda' using errcode = '42501';
  end if;
  if new.colecao <> old.colecao or new.item_id <> old.item_id
     or (new.dados - v_campos) is distinct from (old.dados - v_campos)
     or coalesce(new.dados->>'status', '') not in (coalesce(old.dados->>'status', ''), 'usado')
     or coalesce((new.dados->>'usos')::int, 0) not in
        (coalesce((old.dados->>'usos')::int, 0), coalesce((old.dados->>'usos')::int, 0) + 1)
  then
    raise exception 'convite: só o consumo (usado/usos) pode ser gravado por quem não é admin'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists app_kv_convite_so_consumo on public.app_kv;
create trigger app_kv_convite_so_consumo
  before update on public.app_kv
  for each row execute function public.inv_convite_so_consumo();

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

  -- ⚠ v2.186.0 — QUEM JÁ TEM ACESSO NÃO É REESCRITO POR LINK. Os tokens ficam
  -- legíveis a qualquer autenticado (a leitura de app_kv é ampla), então um
  -- usuário ATIVO (ex.: produtor) abria um link aberto/de grupo e o merge
  -- abaixo trocava o papel e os vínculos dele pelos do convite — saía da trava
  -- do produtor ou ampliava o próprio escopo. Agora: existe QUALQUER registro
  -- do e-mail fora da fila → devolve o que ele já tem, sem mexer em nada e sem
  -- consumir o convite. Mudar papel/vínculos de quem já entrou é na Central de
  -- Acessos, com admin.
  select k.dados into v_reg from public.app_kv k
   where k.colecao = 'inv_papeis'
     and lower(k.dados->>'email') = v_email
     and coalesce(k.dados->>'status', '') <> 'aguardando_aprovacao'
   order by (k.item_id = v_email) desc
   limit 1;
  if v_reg is not null then
    return jsonb_build_object('ok', true, 'usuario', v_reg, 'motivo', 'ja-cadastrado');
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
-- 6) PRODUTOR: SÓ GRAVA COMPACTAÇÃO E SATÉLITE, E SÓ NOS TALHÕES DELE (v2.186.0)
-- =====================================================================
-- O BURACO QUE ISTO FECHA
-- O papel produtor é "somente leitura" desde a v2.1xx — mas só no CLIENTE
-- (src/lib/somenteLeitura.ts). As políticas acima não conhecem o produtor: para
-- o banco ele é um autenticado como qualquer outro. E o boot baixa a base
-- INTEIRA para todo mundo, então a cópia local dele tem talhões de todos os
-- clientes. Pelo console do navegador, um produtor gravava/apagava na nuvem
-- qualquer coisa: fertilidade, cadastro, talhões, compactação de outro cliente.
--
-- A REGRA (decisão de 29/09/2026)
--   · compactação — inv_compactacao, inv_grades_compact e mapas
--     `compactacao__<talhão>__…` em inv_mapas_fert;
--   · satélite — inv_composicoes, inv_cenas_estado e mapas
--     `composicao__<talhão>__…`, `<talhão>__ndvi__…`, `<talhão>__ndvicbers__…`;
--   → criar, alterar e APAGAR, desde que o talhão seja do escopo dele;
--   · inv_papeis, inv_convites, inv_auditoria → seguem as políticas das seções
--     4 e das exceções (este bloco não as afrouxa nem as aperta);
--   · todo o resto (e a tabela `talhoes`) → nada. Só leitura.
--
-- POR QUE `AS RESTRICTIVE`
-- Políticas permissivas se somam por OU; restritivas entram por E em cima delas.
-- Assim este bloco só TIRA poder do produtor — não toca no que owner/admin/
-- agrônomo/operador fazem hoje, e não depende de reescrever as políticas acima.
-- Para quem não é produtor a condição é `not false or …` = verdadeira.
--
-- "ESCOPO DELE" é a mesma conta do app (store.ts getTalhoes):
--   produtores = clienteId + clientesVinculados (iam/vinculoProdutor.ts);
--   fazendas   = regra de iam/escopoFazendas.ts — fazenda marcada entra sempre;
--                produtor com alguma fazenda marcada fica só com as marcadas;
--                sem marcação, todas as dele;
--   talhões    = se talhoesVinculados tiver algo, só esses.
-- O talhão de cada linha sai de inv_talhao_do_registro — espelho de
-- src/lib/iam/escritaProdutor.ts (npm run teste:escritaprodutor). Mudou lá?
-- Mude aqui, e vice-versa.
--
-- UPDATE confere as DUAS pontas: a linha como está (`using`) e como vai ficar
-- (`with check`). Sem o `using`, bastava um upsert com o id de um registro
-- alheio e `talhaoId` do próprio talhão para "sequestrar" o registro.
--
-- ORDEM: publique a plataforma 2.186.0 (ou mais nova) ANTES de rodar este
-- bloco. É ela que filtra o push do produtor por talhão; um cliente antigo que
-- mandar um lote misto (um registro alheio no meio) tem o lote inteiro recusado
-- e o selo de sync fica em erro até recarregar.

-- Lista de texto de um campo jsonb; qualquer coisa que não seja array vira {}.
-- (jsonb_array_elements_text em null/objeto levanta erro e derrubaria a gravação.)
create or replace function public.inv_textos(p jsonb)
returns text[]
language sql
immutable
as $$
  select case when jsonb_typeof(p) = 'array'
              then array(select jsonb_array_elements_text(p))
              else '{}'::text[] end
$$;

-- O e-mail logado tem papel produtor em inv_papeis? (SECURITY DEFINER pelo
-- mesmo motivo de inv_eh_admin: ler inv_papeis sem cair na própria RLS.)
-- Falha FECHADA: QUALQUER linha do e-mail com papel produtor basta — um
-- registro antigo com outro item_id não pode servir de saída. Quem não é
-- produtor e cair aqui por uma linha duplicada velha: o admin apaga a duplicata.
create or replace function public.inv_eh_produtor()
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
      and k.dados->>'papel' = 'produtor'
  );
$$;

-- O talhão está no escopo do produtor logado? (regras no cabeçalho da seção)
create or replace function public.inv_produtor_pode_talhao(p_talhao text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_reg   jsonb;
  v_clis  text[];
  v_fazs  text[];
  v_tals  text[];
  v_faz   text;
  v_cli   text;
begin
  if coalesce(p_talhao, '') = '' then return false; end if;

  -- Os vínculos vêm SÓ de uma linha com papel produtor (a mesma que fez
  -- inv_eh_produtor dizer sim) — uma linha de autocadastro "em espera" com
  -- vínculos à escolha não pode ampliar o escopo. Entre elas, a CANÔNICA
  -- (item_id = e-mail) primeiro, depois a mais recente.
  select k.dados into v_reg from public.app_kv k
   where k.colecao = 'inv_papeis'
     and lower(k.dados->>'email') = lower(coalesce(auth.jwt()->>'email', ''))
     and k.dados->>'papel' = 'produtor'
   order by (k.item_id = lower(coalesce(auth.jwt()->>'email', ''))) desc, k.atualizado_em desc nulls last
   limit 1;
  if v_reg is null then return false; end if;

  v_clis := array_remove(
    array_append(public.inv_textos(v_reg->'clientesVinculados'), nullif(v_reg->>'clienteId', '')), null);
  v_fazs := public.inv_textos(v_reg->'fazendasVinculadas');
  v_tals := public.inv_textos(v_reg->'talhoesVinculados');

  -- Vínculo por talhão é o mais fino: com ele, só os talhões marcados.
  if cardinality(v_tals) > 0 and not (p_talhao = any(v_tals)) then return false; end if;

  select coalesce(t.fazenda_id::text, t.dados->>'fazendaId') into v_faz
    from public.talhoes t where t.id::text = p_talhao;
  if coalesce(v_faz, '') = '' then return false; end if;

  -- 1. Fazenda marcada entra sempre (mesmo de outro produtor — condomínio).
  if v_faz = any(v_fazs) then return true; end if;

  select k.dados->>'clienteId' into v_cli from public.app_kv k
   where k.colecao = 'inv_fazendas' and k.item_id = v_faz;
  if coalesce(v_cli, '') = '' then return false; end if;

  -- 2. Produtor com alguma fazenda marcada: só as marcadas (esta não é).
  if cardinality(v_fazs) > 0 and exists (
    select 1 from public.app_kv k
     where k.colecao = 'inv_fazendas' and k.item_id = any(v_fazs)
       and k.dados->>'clienteId' = v_cli
  ) then return false; end if;

  -- 3. Sem fazenda marcada daquele produtor: todas as dele.
  return v_cli = any(v_clis);
end;
$$;

-- De qual talhão é a linha — só para as coleções que o produtor pode gravar;
-- null = coleção de consulta (o produtor não grava).
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
    when p_colecao in ('inv_compactacao', 'inv_grades_compact', 'inv_composicoes') then
      nullif(p_dados->>'talhaoId', '')
  end
$$;

-- A linha pode ser gravada/apagada pelo produtor logado?
create or replace function public.inv_produtor_pode_gravar(p_colecao text, p_item text, p_dados jsonb)
returns boolean
language sql
stable
as $$
  select p_colecao in ('inv_papeis', 'inv_convites', 'inv_auditoria')
      or coalesce(public.inv_produtor_pode_talhao(
           public.inv_talhao_do_registro(p_colecao, p_item, p_dados)), false)
$$;

-- As funções que leem inv_papeis como dono não precisam ficar abertas no /rpc
-- para anônimo (não vazam nada — a leitura de app_kv já é ampla —, mas é
-- higiene). `authenticated` precisa de EXECUTE: as políticas rodam como ele.
revoke all on function public.inv_eh_produtor() from public, anon;
revoke all on function public.inv_produtor_pode_talhao(text) from public, anon;
revoke all on function public.inv_produtor_pode_gravar(text, text, jsonb) from public, anon;
grant execute on function public.inv_eh_produtor() to authenticated;
grant execute on function public.inv_produtor_pode_talhao(text) to authenticated;
grant execute on function public.inv_produtor_pode_gravar(text, text, jsonb) to authenticated;

drop policy if exists app_kv_produtor_insert on public.app_kv;
create policy app_kv_produtor_insert on public.app_kv
  as restrictive for insert to authenticated
  with check (not (select public.inv_eh_produtor())
              or public.inv_produtor_pode_gravar(colecao, item_id, dados));

drop policy if exists app_kv_produtor_update on public.app_kv;
create policy app_kv_produtor_update on public.app_kv
  as restrictive for update to authenticated
  using      (not (select public.inv_eh_produtor())
              or public.inv_produtor_pode_gravar(colecao, item_id, dados))
  with check (not (select public.inv_eh_produtor())
              or public.inv_produtor_pode_gravar(colecao, item_id, dados));

drop policy if exists app_kv_produtor_delete on public.app_kv;
create policy app_kv_produtor_delete on public.app_kv
  as restrictive for delete to authenticated
  using (not (select public.inv_eh_produtor())
         or public.inv_produtor_pode_gravar(colecao, item_id, dados));

-- Tabela `talhoes`: o produtor não grava nunca. Três políticas (e não `for all`)
-- porque uma restritiva `for all` também cortaria a LEITURA dele.
drop policy if exists talhoes_produtor_insert on public.talhoes;
create policy talhoes_produtor_insert on public.talhoes
  as restrictive for insert to authenticated
  with check (not (select public.inv_eh_produtor()));

drop policy if exists talhoes_produtor_update on public.talhoes;
create policy talhoes_produtor_update on public.talhoes
  as restrictive for update to authenticated
  using (not (select public.inv_eh_produtor()))
  with check (not (select public.inv_eh_produtor()));

drop policy if exists talhoes_produtor_delete on public.talhoes;
create policy talhoes_produtor_delete on public.talhoes
  as restrictive for delete to authenticated
  using (not (select public.inv_eh_produtor()));

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
-- d) Produtor (seção 6) — as 6 políticas restritivas existem:
--    select policyname, permissive, cmd from pg_policies
--     where policyname like '%produtor%' order by 1;
--    → 6 linhas, todas com permissive = 'RESTRICTIVE'.
--    E, logado como PRODUTOR no app publicado (>= 2.186.0), no console:
--    await window.__sb.from('app_kv').update({dados:{x:1}}).eq('colecao','inv_clientes')
--      .select()   → [] (0 linhas: cadastro é só consulta)
--    Importar um arquivo da Falker num talhão DELE tem que salvar normalmente
--    (selo de sync verde); num talhão de outro cliente, o banco recusa (42501).
--
-- LIMITE CONHECIDO (v2.186.0): a trava da seção 6 é POR PAPEL, não por conta.
-- O banco não exige registro em inv_papeis (nem status 'ativo') para gravar:
-- uma conta sem registro ou ainda na fila grava como qualquer autenticado. Um
-- produtor que criar OUTRA conta (o signUp é aberto — a página de convite usa)
-- ou trocar o e-mail no Supabase Auth deixa de ser produtor para o banco.
-- Fechar isso = inverter a lógica (só grava quem tem registro 'ativo' com papel
-- de escrita), o que mexe em todos os papéis — próximo passo de segurança.
--
-- LIMITE CONHECIDO: a leitura continua ampla (qualquer autenticado lê todas as
-- coleções). Restringir a LEITURA por vínculo (produtor/fazenda/talhão) exige
-- reescrever o boot, que hoje baixa a base inteira antes de saber quem é o
-- usuário. Fica registrado como próximo passo de segurança.
