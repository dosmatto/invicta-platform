-- =====================================================================
-- Trava de versão do LIMITE do talhão (projeto AP, ref hxmfjdwoltrnbovgbmoz).
--
-- Por quê: em 31/10/2026 13:26:34 um navegador com cópia local velha regravou
-- 1102 dos 1131 talhões num envio só (o app sobe o registro INTEIRO, com o
-- geojson dentro de `dados`). Todo limite trocado depois daquela cópia voltou
-- ao antigo — o caso relatado foi o MCABV 08 (BOA VISTA). O app foi corrigido
-- (envio por registro, lib/edicoesSync.ts), mas abas antigas com o código
-- velho continuam abertas por aí; esta trava protege o banco delas.
--
-- Regra: `dados.geoVersao` só cresce no app (cada troca de limite arquiva a
-- versão vigente e soma 1 — store.ts comVersaoDeLimite). Um UPDATE que chega
-- com geoVersao MENOR que a gravada é cópia velha: o resto do registro é
-- aceito (nome, zonas, vínculos…), mas o limite e o histórico de versões
-- continuam os da linha atual. Não recusa o UPDATE: recusar travaria o lote
-- inteiro do envio (e a pendência ficaria presa para sempre no aparelho).
--
-- Aplicação: SQL Editor do painel, colando ESTE arquivo inteiro (conferir o
-- SHA-1 antes de rodar). Tudo numa transação só.
-- Reversão: bloco "REVERSÃO" no fim do arquivo.
-- =====================================================================

begin;

create or replace function public.inv_talhoes_trava_versao_limite()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_antiga int;
  v_nova   int;
  k        text;
begin
  -- geoVersao ausente = 1 (mesma leitura do app: `t.geoVersao ?? 1`).
  -- Valor não numérico: não arrisca, deixa passar.
  begin
    v_antiga := coalesce((old.dados->>'geoVersao')::int, 1);
    v_nova   := coalesce((new.dados->>'geoVersao')::int, 1);
  exception when others then
    return new;
  end;

  if old.dados ? 'geojson' and v_nova < v_antiga then
    -- Limite + tudo que anda junto com ele volta para o da linha atual.
    foreach k in array array['geojson', 'bbox', 'areaHa', 'areaHaSemHoles',
                             'geoVersao', 'geoVersoes', 'limiteOrigem'] loop
      if old.dados ? k then
        new.dados := jsonb_set(new.dados, array[k], old.dados->k, true);
      else
        new.dados := new.dados - k;
      end if;
    end loop;
    new.area_ha := old.area_ha;
    new.geom    := old.geom;
    raise warning 'talhoes %: limite versão % recusado (gravada: %) — cópia velha; mantido o limite atual',
      new.id, v_nova, v_antiga;
  end if;
  return new;
end;
$$;

-- Nome com prefixo "a_": gatilhos BEFORE disparam em ordem alfabética, e um
-- eventual gatilho que derive `geom` de `dados` precisa ver o limite já
-- restaurado.
drop trigger if exists a_inv_talhoes_trava_versao_limite on public.talhoes;
create trigger a_inv_talhoes_trava_versao_limite
  before update on public.talhoes
  for each row execute function public.inv_talhoes_trava_versao_limite();

commit;

-- ---------------------------------------------------------------------
-- Conferência (depois de aplicar):
--   select tgname from pg_trigger
--    where tgrelid = 'public.talhoes'::regclass and not tgisinternal;
-- Teste que se desfaz sozinho (troque <ID> por um talhão com geoVersao >= 2):
--   begin;
--   update public.talhoes
--      set dados = jsonb_set(dados, '{geoVersao}', '1'::jsonb)
--    where id = '<ID>';
--   select dados->>'geoVersao' from public.talhoes where id = '<ID>';  -- continua a original
--   rollback;
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- REVERSÃO
--   begin;
--   drop trigger if exists a_inv_talhoes_trava_versao_limite on public.talhoes;
--   drop function if exists public.inv_talhoes_trava_versao_limite();
--   commit;
-- ---------------------------------------------------------------------
