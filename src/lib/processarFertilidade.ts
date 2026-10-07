'use client';

// PROCESSAMENTO DO MAPA DE FERTILIDADE FORA DA TELA — a fila de interpolação
// do Importador de migração (Configurações › Importar migração).
//
// É o MESMO caminho da aba Fertilidade, com a configuração padrão dela
// (krigagem automática, pixel de 5 m, legenda padrão de cada variável):
//   • GRID  → `interpolar` (backend) e o raster auxiliar de 20 m da Recomendação;
//   • ZONA  → `rasterizarZonas` (constante por zona, sem backend) e o de 20 m.
// As peças que a aba e a fila dividem moram AQUI e a aba importa daqui: a chave
// da nuvem (`idMapaFert`), o rótulo do ponto (`fmtPontoMapa`), a legenda padrão
// (`legendaPadraoDe`) e a salvaguarda de tamanho (`dadosMapaParaNuvem`). Uma
// cópia em cada lado já divergiu antes neste projeto (ver fertilidadePorZona).

import {
  getLegendas, ordenarLegendasDoAtributo, casasDecimaisVariavel, variavelDeAnalise,
  type ImportacaoLab, type GradeAmostragem,
} from './store';
import { interpolar, rampaDaLegenda, comprimirGrid, interpoladorEfetivo, MIN_PTS_MAPA, type RespInterp } from './fertilidade';
import { casarAmostrasComPontos } from './eloGrade';
import { rasterizarZonas, rasterizarZonasDose } from './recomendacao/zonasGrid';
import { zonasComValor, rotulosPorZona, type ZonaGeom } from './meap/fertilidadePorZona';
import { legendaEmprestada, FAIXAS_CTCE, type Legenda } from './legendas';
import { casasDoRotulo } from './estatisticaMapa';
import { cloudSalvarMapaConfirmado } from './cloud';
import { PIXEL_RECOMENDACAO_M, idDose20 } from './recomendacao/escolhaMapa';
import { ehBackendFora } from './interpUrl';

// ── Peças compartilhadas com a aba Fertilidade ──────────────────────────────

/** Prefixo dos mapas de fertilidade de um talhão+importação+configuração.
 *  CONTRATO: os dois últimos campos do id são sempre `nut__prof`. */
export const prefixoMapaFert = (talhaoId: string, importacaoId: string, metodo: string, pixelM: number, modeloFixo: string) =>
  `${talhaoId}__${importacaoId}__${metodo}__${pixelM}__${modeloFixo || 'auto'}__`;
export const idMapaFert = (talhaoId: string, importacaoId: string, metodo: string, pixelM: number, modeloFixo: string, nut: string, prof: string) =>
  `${prefixoMapaFert(talhaoId, importacaoId, metodo, pixelM, modeloFixo)}${nut}__${prof}`;

/** Casas do rótulo do ponto: preferência da variável; senão pH/K = 1, demais = 0. */
const casasPonto = (nut: string) => casasDoRotulo(nut, casasDecimaisVariavel(nut));
export const fmtPontoMapa = (v: number, nut: string) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: casasPonto(nut), maximumFractionDigits: casasPonto(nut) });

/** Legenda PADRÃO da variável (sem escolha do usuário). CTCe sem legenda
 *  própria empresta as CORES da CTC com as faixas de FAIXAS_CTCE. */
export function legendaPadraoDe(legendas: Legenda[], atributoId: string): Legenda | undefined {
  const lst = ordenarLegendasDoAtributo(legendas.filter(l => l.atributoId === atributoId));
  if (lst.length) return lst[0];
  if (atributoId !== 't') return undefined;
  const base = ordenarLegendasDoAtributo(legendas.filter(l => l.atributoId === 'ctc'))[0];
  return base ? legendaEmprestada(base, 't', variavelDeAnalise('t'), FAIXAS_CTCE) : undefined;
}

export const temLegendaPara = (legendas: Legenda[], id: string) =>
  legendas.some(l => l.atributoId === id) || (id === 't' && legendas.some(l => l.atributoId === 'ctc'));

type DadosMapa = { resp: RespInterp; labels: GeoJSON.FeatureCollection; interpoladoEm: string };

/** O que vai para a nuvem: grid gzipado sem PNG; se nem assim couber no limite
 *  por registro, só o PNG; em último caso, só metadados. */
export async function dadosMapaParaNuvem(resp: RespInterp, labels: GeoJSON.FeatureCollection, interpoladoEm: string, nomeLog: string): Promise<DadosMapa> {
  const gridGz = resp.grid ? await comprimirGrid(resp.grid) : undefined;
  let dados: DadosMapa = { resp: { ...resp, png: gridGz ? '' : (resp.png ?? ''), grid: gridGz }, labels, interpoladoEm };
  if (JSON.stringify(dados).length > 950_000) {
    const soPng = { resp: { ...resp, grid: undefined }, labels, interpoladoEm };
    dados = JSON.stringify(soPng).length <= 950_000
      ? soPng
      : { resp: { ...resp, png: '', grid: undefined }, labels, interpoladoEm };
    console.warn(`[fertilidade] mapa grande p/ a nuvem — salvando ${dados.resp.png ? 'só PNG' : 'só metadados'} de ${nomeLog}.`);
  }
  return dados;
}

const fcVazio = (): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features: [] });

// ── Processamento de UMA importação (todos os mapas) ─────────────────────────

export const PIXEL_PADRAO_M = 5;

export interface EntradaProcessamento {
  talhaoId: string;
  importacao: ImportacaoLab;
  grade: GradeAmostragem | null;
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  /** Zona: as zonas e o vínculo zona → nº da amostra. Ausente = interpolar. */
  zona?: { zonas: ZonaGeom[]; vinculo: Record<string, number> };
  signal?: AbortSignal;
  onProgresso?: (i: number, total: number, nome: string) => void;
  /** Só estes mapas (`nut__prof`) — a retomada refaz apenas os que faltam na nuvem. */
  apenas?: Set<string>;
}

/** Um mapa que não saiu. `envio` = o mapa foi calculado mas a nuvem não
 *  confirmou a gravação (transitório: a fila tenta de novo). Sem `envio`, é
 *  falta de dado (sem valor naquela profundidade etc.) — refazer não muda. */
export interface FalhaMapa { chave: string; msg: string; envio?: boolean }
export interface ResultadoProcessamento { gerados: number; total: number; falhas: FalhaMapa[] }

/** Chave `nut__prof` de um mapa — os DOIS ÚLTIMOS campos do id (contrato da chave). */
export const chaveDoIdMapa = (id: string) => id.split('__').slice(-2).join('__');

/** Os mapas que a importação DEVE ter: variável com legenda × profundidade do
 *  laudo — o mesmo critério do processamento abaixo e da aba Fertilidade. */
export function chavesEsperadas(imp: ImportacaoLab, legendas: Legenda[] = getLegendas()): string[] {
  const nutrientes = imp.elementos.filter(id => temLegendaPara(legendas, id));
  const profs = [...new Set(imp.resultados.map(r => r.profundidade).filter(Boolean))];
  return profs.flatMap(prof => nutrientes.map(nut => `${nut}__${prof}`));
}

/**
 * Gera e grava na nuvem os mapas (variável × profundidade) de uma importação,
 * AGUARDANDO a confirmação de cada gravação. Erro de backend fora do ar /
 * cancelamento PROPAGA (a fila para e a importação continua pendente); falha
 * de um mapa só entra em `falhas`.
 */
export async function processarMapasDaImportacao(e: EntradaProcessamento): Promise<ResultadoProcessamento> {
  const legendas = getLegendas();
  const imp = e.importacao;
  const chaves = chavesEsperadas(imp, legendas).filter(k => !e.apenas || e.apenas.has(k));
  const total = chaves.length;
  const falhas: FalhaMapa[] = [];
  let gerados = 0, i = 0;
  for (const chaveMapa of chaves) {
    const [nut, prof] = chaveMapa.split('__');
    i++;
    const leg = legendaPadraoDe(legendas, nut);
    const nome = `${leg?.simbolo ?? nut} ${prof}`;
    const falha = (msg: string, envio = false) => falhas.push({ chave: chaveMapa, msg: `${nome}: ${msg}`, envio });
    e.onProgresso?.(i, total, nome);
    if (!leg) { falha('sem legenda'); continue; }
    if (e.zona) {
      const zv = zonasComValor(e.zona.zonas, imp, e.zona.vinculo, nut, prof);
      if (zv.length === 0) { falha('nenhuma zona com valor'); continue; }
      const resp = rasterizarZonas(zv, PIXEL_PADRAO_M);
      const labels: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: rotulosPorZona(e.zona.zonas, imp, e.zona.vinculo, nut, prof, v => fmtPontoMapa(v, nut)),
      };
      const interpoladoEm = new Date().toISOString();
      const gridGz = resp.grid ? await comprimirGrid(resp.grid) : undefined;
      // O de 20 m primeiro: o mapa fino é o que conta como "feito" na retomada,
      // então ele só vai depois que o auxiliar já foi gravado.
      const resp20 = rasterizarZonasDose(zv, e.poligono, PIXEL_RECOMENDACAO_M);
      const grid20 = resp20.grid ? await comprimirGrid(resp20.grid) : undefined;
      if (!await cloudSalvarMapaConfirmado(idDose20(e.talhaoId, imp.id, 'zona', '', nut, prof),
        { resp: { ...resp20, png: '', grid: grid20 }, labels: fcVazio(), interpoladoEm })) {
        console.warn('[fila-migracao] mapa de 20 m não foi gravado:', nome);
      }
      if (!await cloudSalvarMapaConfirmado(idMapaFert(e.talhaoId, imp.id, 'zona', PIXEL_PADRAO_M, '', nut, prof),
        { resp: { ...resp, png: '', grid: gridGz }, labels, interpoladoEm, vinculoZona: { ...e.zona.vinculo } })) {
        falha('a nuvem não confirmou a gravação', true); continue;
      }
      gerados++;
      continue;
    }
    // GRID — casamento amostra ↔ ponto pelo número (eloGrade), como na aba.
    const amostras = imp.resultados
      .filter(r => r.profundidade === prof && r.valores[nut] != null && isFinite(r.valores[nut]))
      .map(r => ({ numero: r.numero, valor: r.valores[nut] }));
    const pts = casarAmostrasComPontos(amostras, e.grade);
    if (pts.length < MIN_PTS_MAPA) { falha(`só ${pts.length} amostra(s) com valor`); continue; }
    const { metodo, caiuParaIdw } = interpoladorEfetivo('krige', pts.length);
    const chave = caiuParaIdw ? 'idw' : 'krige';
    const { dominio, stops } = rampaDaLegenda(leg);
    let resp: RespInterp;
    try {
      resp = await interpolar({ pontos: pts, poligono: e.poligono, dominio, stops, metodo, pixelM: PIXEL_PADRAO_M, modeloFixo: null, variogramaManual: null, signal: e.signal });
    } catch (err) {
      if (ehErroDeParada(err)) throw err;
      falha(err instanceof Error ? err.message : String(err));
      continue;
    }
    const labels: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: pts.map(p => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { txt: fmtPontoMapa(p.valor, nut), v: p.valor } })),
    };
    const interpoladoEm = new Date().toISOString();
    // Mapa de 20 m da Recomendação (gaveta dose20__) ANTES do fino: o fino é o
    // que a retomada conta como "feito". Falhar aqui não impede o fino — a
    // Recomendação cai na reamostragem, como na aba.
    try {
      const r20 = await interpolar({ pontos: pts, poligono: e.poligono, dominio, stops, metodo, pixelM: PIXEL_RECOMENDACAO_M, modeloFixo: null, variogramaManual: null, cobrirPoligono: true, signal: e.signal });
      const g20 = r20.grid ? await comprimirGrid(r20.grid) : undefined;
      if (!await cloudSalvarMapaConfirmado(idDose20(e.talhaoId, imp.id, chave, '', nut, prof),
        { resp: { ...r20, png: '', grid: g20 }, labels: fcVazio(), interpoladoEm: new Date().toISOString() })) {
        console.warn('[fila-migracao] mapa de 20 m não foi gravado:', nome);
      }
    } catch (err) {
      if (ehErroDeParada(err)) throw err;
      console.warn('[fila-migracao] mapa de 20 m falhou:', nome, err);
    }
    if (!await cloudSalvarMapaConfirmado(idMapaFert(e.talhaoId, imp.id, chave, PIXEL_PADRAO_M, '', nut, prof), await dadosMapaParaNuvem(resp, labels, interpoladoEm, nome))) {
      falha('a nuvem não confirmou a gravação', true); continue;
    }
    gerados++;
  }
  return { gerados, total, falhas };
}

/** Backend fora do ar ou cancelamento: param a fila inteira (não é falha do mapa). */
export function ehErroDeParada(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (err instanceof Error && err.name === 'AbortError') return true;
  return ehBackendFora(err);
}
