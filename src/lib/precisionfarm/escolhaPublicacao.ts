'use client';

// O QUE se publica de um talhão para a PrecisionFarm — regra ÚNICA da seção do
// talhão (IntegracaoPrecisionFarm) e da tela de lote (Biblioteca →
// PrecisionFarm). Lê o store LOCAL: na plataforma, inv_meap_zoneamentos e
// inv_produtividade (metadados) descem inteiros no boot, então vale também para
// talhão que o usuário nunca abriu. O CONTEÚDO publicado é lido na nuvem pela
// rota (/api/precisionfarm/publicar); o que vai daqui (zoneamentoId, mapaId,
// geoVersao) é a conferência de sincronização — diferente da nuvem = 409.

import { getMapasProdutividade, getZoneamentosMeap, type MapaProdutividade, type Talhao, type ZoneamentoMeap } from '@/lib/store';
import type { VinculoPF } from './cliente';

export const ROTULO_EPOCA: Record<string, string> = { verao: 'Verão', safrinha: 'Safrinha', inverno: 'Inverno' };
export const ROTULO_PERIODO: Record<string, string> = { main: 'Verão (main)', second: 'Safrinha (second)', winter: 'Inverno (winter)' };
export const ROTULO_STATUS: Record<VinculoPF['status'], { txt: string; cor: string }> = {
  pendente: { txt: 'Pendente', cor: '#fbbf24' },
  confirmado: { txt: 'Confirmado', cor: '#4ade80' },
  suspenso: { txt: 'Suspenso', cor: '#f87171' },
};

/** Zoneamento PADRÃO do talhão (o botão "Publicar zoneamento"). Pode reparar
 *  "dois padrões" e gravar (getZoneamentosMeap) — chamar em ação/aberto, não
 *  a cada render. */
export function zoneamentoParaPublicar(talhaoId: string): ZoneamentoMeap | null {
  return getZoneamentosMeap(talhaoId).find(z => z.padrao) ?? null;
}

/** Mapas de colheita OFICIAIS do talhão (um botão "Publicar colheita" cada). */
export function colheitasParaPublicar(talhaoId: string): MapaProdutividade[] {
  return getMapasProdutividade(talhaoId).filter(m => m.oficial);
}

/** Sem época (Verão/Safrinha/Inverno) a PF não sabe onde pôr a colheita. */
export const colheitaSemEpoca = (m: Pick<MapaProdutividade, 'epoca'>) => !ROTULO_EPOCA[m.epoca];

/** Versão do limite que a tela conhece (ausente = 1) — vai na publicação. */
export const geoVersaoDoTalhao = (t: Pick<Talhao, 'geoVersao'>) => t.geoVersao ?? 1;
