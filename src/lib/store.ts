'use client';

// Store local com localStorage — temporário até integração com banco real

import type { ResultadoAmostra, PerfilLabConfig } from './lab';
import type { Legenda } from './legendas';
import { classesFertilidade5, ordenarLegendasDoAtributo, deveSemearLegendas, promocoesDeHomonimas } from './legendas';
export { ordenarLegendasDoAtributo } from './legendas';
import type { AmbienteProdutivo } from './meap/tipos';
import { cloudPushLista, cloudAindaNaoHidratou, cloudMarcarPendente } from './cloud';
import { lerListaLocal, gravarListaLocal, removerLocal } from './localComprimido';
import { moverNaOrdem, renumerar } from './ordemCatalogo';
import { areaHaGeo, areaHaGeoBruta } from './areaGeo';
import { empresaAtivaId, uidUsuario, escopoClienteIds, escopoTalhaoIds, escopoFazendaIds } from './empresa';
import {
  listar as bibListar,
  obter as bibObter,
  criar as bibCriar,
  atualizar as bibAtualizar,
  excluir as bibExcluir,
  compartilhar as bibCompartilhar,
  type ItemBiblioteca,
  type ConteudoLaboratorio,
  type ConteudoLabAnalise,
  type ConteudoSafra,
  type ConteudoGrade,
  type ConteudoEtiqueta,
  type ConteudoVariavel,
  type EstiloRecomendacao,
  type PresetEstiloRec,
} from './biblioteca';
import { ELEMENTOS_LAB, simboloElemento, norm as normLab, calcularDerivados, DERIVADOS_IDS } from './lab';
import { anoDeData, epocaDeData, periodoDeData, anoDaSafra, hojeSaoPauloISO, partesData, dataValida, type Epoca } from './periodo';
import { VARIAVEIS_COMPLEMENTARES } from '../constants/variaveisSeedComplementar';
import { LAYOUT_PADRAO } from './etiquetas';
import { gerarCodigoRemessa } from './remessa';   // só o id do padrão (etiquetas.ts não importa store em runtime)

export interface Cliente {
  id: string;
  nome: string;
  sigla?: string;       // abreviação livre (ex: "JDS")
  documento: string;    // CPF ou CNPJ
  tipoPessoa: 'PF' | 'PJ';
  telefone: string;
  email: string;
  cidade: string;
  estado: string;
  observacoes?: string;
  criadoEm: string;
}

export interface Fazenda {
  id: string;
  clienteId: string;
  nome: string;
  sigla?: string;       // abreviação livre (ex: "FSJ")
  municipio: string;
  estado: string;
  car?: string;
  nirf?: string;
  /** E-mail do agrônomo responsável (usuário da categoria "Interno" no IAM).
   *  Guarda o e-mail (chave estável) — o nome é resolvido na exibição. */
  agronomoResponsavel?: string;
  criadoEm: string;
}

export interface Talhao {
  id: string;
  fazendaId: string;
  nome: string;
  areaHa: number;           // calculado do shapefile/kml
  areaHaSemHoles?: number;  // sem descontar holes
  status: 'ativo' | 'incompleto';
  geojson?: string;         // JSON string do GeoJSON (limite do talhão)
  zonasGeojson?: string;    // JSON string do GeoJSON das zonas de manejo (cada feature: {id, classe, areaHa})
  bbox?: [number, number, number, number];
  criadoEm: string;
  geoVersao?: number;             // versão do limite atual (ausente = 1)
  geoVersoes?: VersaoPoligono[];  // versões anteriores arquivadas (histórico)
}

// Versão anterior do limite, arquivada quando o polígono é substituído. Os
// dados dos ciclos anteriores continuam vinculados à geometria da época —
// nunca são recalculados/recortados com o limite novo. A versão arquivada só
// sai da base junto com o próprio talhão.
export interface VersaoPoligono {
  versao: number;
  geojson: string;
  bbox?: [number, number, number, number];
  areaHa: number;
  areaHaSemHoles?: number;
  arquivadoEm: string;   // ISO
  safras: string[];      // safras que tinham dados do talhão quando esta versão vigorava
}

// Plantio: cultura de um talhão numa safra (um por talhão+safra). Talhões
// diferentes podem ter culturas diferentes na mesma safra, por isso é entidade
// própria (não um campo da Safra global).
export interface Plantio {
  id: string;
  talhaoId: string;
  safra: string;
  cultura: string;
  criadoEm: string;
}

export const CULTURAS = ['Soja', 'Milho', 'Trigo', 'Feijão', 'Algodão', 'Aveia', 'Sorgo', 'Cevada', 'Pastagem', 'Outra'];

export function getPlantio(talhaoId: string, safra: string): string {
  if (!talhaoId || !safra) return '';
  const p = loadFiltrado<Plantio>('inv_plantios').find(x => x.talhaoId === talhaoId && x.safra === safra);
  return p?.cultura ?? '';
}

// Upsert da cultura por talhão+safra. Cultura vazia remove o registro.
export function setPlantio(talhaoId: string, safra: string, cultura: string) {
  if (!talhaoId || !safra) return;
  const lista = load<Plantio>('inv_plantios');
  const i = lista.findIndex(x => x.talhaoId === talhaoId && x.safra === safra);
  if (i >= 0) {
    if (cultura) lista[i] = { ...lista[i], cultura };
    else lista.splice(i, 1);
  } else if (cultura) {
    lista.push(comEmpresa({ id: uid(), talhaoId, safra, cultura, criadoEm: new Date().toISOString() }));
  }
  save('inv_plantios', lista);
}

// ── Compactação (penetrometria) ───────────────────────────────────────────
// Cada ponto do penetrômetro já vem georreferenciado com a resistência (MPa)
// por profundidade — não precisa juntar com grade como na fertilidade.
export interface PontoCompactacao { lng: number; lat: number; valores: Record<string, number>; }
// ── Helpers de PERÍODO p/ registros classificados por Ano (compactação,
// produtividade, condutividade). Store é a autoridade do Ano; a Época sai da
// data quando preciso (não é persistida). Ver src/lib/periodo.ts.
function comAnoRef<T extends { dataReferencia?: string; ano?: number }>(reg: T): T {
  const dataRef = reg.dataReferencia && dataValida(reg.dataReferencia) ? reg.dataReferencia : hojeSaoPauloISO();
  return { ...reg, dataReferencia: dataRef, ano: anoDeData(dataRef) ?? undefined };
}
// Filtra por ANO (campo `ano`; fallback anoDaSafra da safra gravada). Safra que
// não parseia p/ ano cai na igualdade de string (retrocompat).
function filtraPorAno<T extends { ano?: number; safra?: string }>(lista: T[], safra: string): T[] {
  const anoSel = anoDaSafra(safra);
  if (anoSel == null) return lista.filter(x => x.safra === safra);
  return lista.filter(x => (x.ano ?? (x.safra ? anoDaSafra(x.safra) : null)) === anoSel);
}

export interface ImportacaoCompactacao {
  id: string;
  talhaoId: string;
  safra: string;
  nome: string;
  profundidades: string[];   // rótulos derivados das colunas escolhidas
  pontos: PontoCompactacao[];
  dataReferencia?: string;   // 'YYYY-MM-DD' — data operacional; deriva Ano/Época
  ano?: number;
  criadoEm: string;
}

export function getImportacoesCompactacao(talhaoId?: string, safra?: string): ImportacaoCompactacao[] {
  let lista = loadFiltrado<ImportacaoCompactacao>('inv_compactacao');
  if (talhaoId) lista = lista.filter(i => i.talhaoId === talhaoId);
  if (safra) lista = filtraPorAno(lista, safra);
  return lista.sort((a, b) => (b.criadoEm ?? '').localeCompare(a.criadoEm ?? ''));
}

export function saveImportacaoCompactacao(data: Omit<ImportacaoCompactacao, 'id' | 'criadoEm'>): ImportacaoCompactacao {
  const lista = load<ImportacaoCompactacao>('inv_compactacao');
  const nova: ImportacaoCompactacao = comEmpresa(comAnoRef({ ...data, id: uid(), criadoEm: new Date().toISOString() }));
  lista.push(nova);
  save('inv_compactacao', lista);
  return nova;
}

export function deleteImportacaoCompactacao(id: string) {
  save('inv_compactacao', load<ImportacaoCompactacao>('inv_compactacao').filter(i => i.id !== id));
}

// ── Grade de amostragem de COMPACTAÇÃO (#36) ────────────────────────────────
// Criada NA PLATAFORMA (gerarGrid do lib/grid.ts sobre o polígono); o app de
// campo navega até cada ponto e registra as leituras do penetrômetro POR
// PROFUNDIDADE (lib/coleta.ts LeituraCompactacao). De volta, as leituras viram
// uma ImportacaoCompactacao e o processamento é o fluxo normal da aba.
export interface PontoGradeCompact { ordem: number; lng: number; lat: number; }
export interface GradeCompactacao {
  id: string;
  talhaoId: string;
  safra: string;
  nome: string;                   // "Grade compactação 1"
  profundidades: string[];        // rótulos das leituras (ex.: '0-10', '10-20' cm)
  unidade: string;                // 'MPa' | 'kgf/cm²' (rótulo dos inputs no campo)
  densidade: number;              // ha por ponto
  distanciaBorda: number;         // m
  pontos: PontoGradeCompact[];
  dataReferencia?: string;
  ano?: number;
  criadoEm: string;
}

export function getGradesCompactacao(talhaoId?: string, safra?: string): GradeCompactacao[] {
  let lista = loadFiltrado<GradeCompactacao>('inv_grades_compact');
  if (talhaoId) lista = lista.filter(g => g.talhaoId === talhaoId);
  if (safra) lista = filtraPorAno(lista, safra);
  return lista.sort((a, b) => (b.criadoEm ?? '').localeCompare(a.criadoEm ?? ''));
}

export function saveGradeCompactacao(data: Omit<GradeCompactacao, 'id' | 'criadoEm'>): GradeCompactacao {
  const lista = load<GradeCompactacao>('inv_grades_compact');
  const nova: GradeCompactacao = comEmpresa(comAnoRef({ ...data, id: uid(), criadoEm: new Date().toISOString() }));
  lista.push(nova);
  save('inv_grades_compact', lista);
  return nova;
}

export function deleteGradeCompactacao(id: string) {
  save('inv_grades_compact', load<GradeCompactacao>('inv_grades_compact').filter(g => g.id !== id));
}

// ── Composição Temporal de Índices (IV5) ────────────────────────────────────
// Metadados da camada composta (mediana/média/máx/mín de 2+ cenas do mesmo
// índice). Produtor/fazenda derivam do talhaoId (não duplicamos ids). O raster
// fica na nuvem (inv_mapas_fert, id composicao__<talhaoId>__<id>) e SÓ existe
// se o usuário APROVOU o resultado (nada é salvo automaticamente).
export interface ComposicaoTemporal {
  id: string;
  talhaoId: string;
  safra?: string;
  cultura?: string;
  indice: string;                 // índice base (NDVI, SAVI…)
  metodo: string;                 // mediana | media | maximo | minimo
  sensores: string[];             // ['Sentinel-2', 'CBERS-4A']
  datas: string[];                // datas das cenas usadas (ISO)
  resolucaoPx: [number, number];  // [rows, cols] da grade final
  pctValidos: number;             // % de pixels válidos do composto
  mascaraNuvem: boolean;          // origem já veio com máscara de nuvem/sombra
  nome: string;                   // amigável ("NDVI Mediana — Vegetativo Soja 2026")
  nomeTecnico: string;            // automático (comp_ndvi_mediana_...)
  aprovada: boolean;              // sempre true ao salvar (só salva aprovada)
  aptoZonas: boolean;             // validação p/ Zonas de Manejo (≥2 cenas + % válidos)
  usuario?: string;
  criadoEm: string;
}

export function getComposicoes(talhaoId?: string): ComposicaoTemporal[] {
  let lista = loadFiltrado<ComposicaoTemporal>('inv_composicoes');
  if (talhaoId) lista = lista.filter(c => c.talhaoId === talhaoId);
  return lista.sort((a, b) => (b.criadoEm ?? '').localeCompare(a.criadoEm ?? ''));
}

export function saveComposicao(data: Omit<ComposicaoTemporal, 'id' | 'criadoEm'>): ComposicaoTemporal {
  const lista = load<ComposicaoTemporal>('inv_composicoes');
  const nova: ComposicaoTemporal = comEmpresa({ ...data, id: uid(), criadoEm: new Date().toISOString() });
  lista.push(nova);
  save('inv_composicoes', lista);
  return nova;
}

export function deleteComposicao(id: string) {
  save('inv_composicoes', load<ComposicaoTemporal>('inv_composicoes').filter(c => c.id !== id));
}

// ── MDE / Altimetria (Variável Fixa do Talhão) — F1 ─────────────────────────
// Metadados das bases de MDE aprovadas (spec 20.3/21): a base APROVADA vira a
// oficial; versões antigas ficam no histórico (nunca apagar automaticamente).
// Os rasters (elevação/declividade/hillshade) ficam na nuvem (inv_mapas_fert,
// prefixo mde__<talhaoId>__<id>__), como os demais mapas.
export interface MdeTalhao {
  id: string;
  talhaoId: string;
  fonte: string;                  // 'cop30' | 'srtm' | (futuras)
  rotuloFonte: string;            // "Copernicus DEM GLO-30 (30 m)"
  resolucaoM: number;
  stats: { alt_min: number; alt_med: number; alt_max: number; amplitude: number; decl_media: number | null; decl_max: number | null };
  usuario?: string;               // quem aprovou
  oficial: boolean;               // 1 por talhão
  criadoEm: string;
}

export function getMdes(talhaoId?: string): MdeTalhao[] {
  let lista = loadFiltrado<MdeTalhao>('inv_mde');
  if (talhaoId) lista = lista.filter(m => m.talhaoId === talhaoId);
  return lista.sort((a, b) => (b.criadoEm ?? '').localeCompare(a.criadoEm ?? ''));
}

export function saveMde(data: Omit<MdeTalhao, 'id' | 'criadoEm'>): MdeTalhao {
  const lista = load<MdeTalhao>('inv_mde');
  const novo: MdeTalhao = comEmpresa({ ...data, id: uid(), criadoEm: new Date().toISOString() });
  if (novo.oficial) lista.forEach(m => { if (m.talhaoId === novo.talhaoId) m.oficial = false; });
  lista.push(novo);
  save('inv_mde', lista);
  return novo;
}

export function setMdeOficial(id: string) {
  const lista = load<MdeTalhao>('inv_mde');
  const alvo = lista.find(m => m.id === id);
  if (!alvo) return;
  lista.forEach(m => { if (m.talhaoId === alvo.talhaoId) m.oficial = m.id === id; });
  save('inv_mde', lista);
}

export function deleteMde(id: string) {
  save('inv_mde', load<MdeTalhao>('inv_mde').filter(m => m.id !== id));
}

// ── Camadas topográficas salvas p/ Zonas de Manejo (MDE F4) ─────────────────
// Metadados das camadas derivadas (TPI/TWI/LS…) que o usuário mandou para o
// MEAP. O raster fica na nuvem (mdecam__<talhaoId>__<key>); Altitude e
// Declividade da base oficial NÃO entram aqui (já vêm da própria base).
export interface MdeCamadaTopo {
  id: string;
  talhaoId: string;
  key: string;                    // tpi | twi | ls | tri | fluxo_log | aspecto | curv_*
  rotulo: string;                 // "TPI", "TWI", "LS Factor"…
  criadoEm: string;
}

export function getMdeCamadasTopo(talhaoId: string): MdeCamadaTopo[] {
  return loadFiltrado<MdeCamadaTopo>('inv_mde_camadas').filter(c => c.talhaoId === talhaoId);
}

// Substitui o conjunto salvo do talhão (upsert por key).
export function setMdeCamadasTopo(talhaoId: string, itens: { key: string; rotulo: string }[]): void {
  const outros = load<MdeCamadaTopo>('inv_mde_camadas').filter(c => c.talhaoId !== talhaoId);
  const novos: MdeCamadaTopo[] = itens.map(i => comEmpresa({ id: uid(), talhaoId, key: i.key, rotulo: i.rotulo, criadoEm: new Date().toISOString() }));
  save('inv_mde_camadas', [...outros, ...novos]);
}

export function limparMdeCamadasTopo(talhaoId: string): void {
  save('inv_mde_camadas', load<MdeCamadaTopo>('inv_mde_camadas').filter(c => c.talhaoId !== talhaoId));
}

// ── Condutividade Elétrica (Variável Fixa do Talhão) ─────────────────────────
// Diferente da compactação (por safra), a EC é uma característica ESTRUTURAL do
// talhão: fica vinculada permanentemente ao talhão e pode ter várias VERSÕES ao
// longo do tempo; uma é a OFICIAL. Cada levantamento traz ~2 profundidades
// (rasa/profunda) e o usuário define qual é a profundidade oficial.
export interface PontoCondutividade { lng: number; lat: number; valores: Record<string, number>; }
// Variável extra do MESMO arquivo (ex.: Altitude, Velocidade) importada junto da
// CEa. `fixa` = marcada para virar uma Variável Fixa do Talhão (uso futuro).
export interface ExtraCondutividade { coluna: string; fixa: boolean; }
// C4.1 — HISTÓRICO de processamento: cada interpolação de uma profundidade vira
// uma "rodada" com os parâmetros usados + estatísticas + qualidade, para o usuário
// ver como cada mapa foi gerado (auto × manual) e reproduzir. A rodada mais recente
// da profundidade é a ATIVA (o raster salvo na nuvem é sempre o dela). Só metadados
// (leve, sincroniza no próprio levantamento); o raster não é duplicado por rodada.
export interface RodadaCondutividade {
  id: string;
  criadoEm: string;
  metodo: 'auto' | 'manual';
  krig: {
    metodo: 'krige' | 'idw';
    modelo?: string;
    pixel?: number;
    variograma?: { modelo?: string; alcance?: number; patamar?: number; pepita?: number; vizinhos?: number; aniso_ratio?: number; aniso_angle?: number } | null;
  };
  usouLimpeza: boolean;
  limpeza: Record<string, number> | null;   // params do MapFilter usados (null se pontos brutos)
  stats: { modelo: string; rmse: number | null; n: number; min: number | null; max: number | null };
  qualidade: { classe: string; percRemovido: number | null };
}
export interface LevantamentoCondutividade {
  id: string;
  talhaoId: string;
  nome: string;
  data?: string;                  // data do levantamento (opcional)
  profundidades: string[];        // colunas de CEa (≥1)
  profundidadeOficial?: string;   // qual profundidade é a camada oficial
  extras?: ExtraCondutividade[];  // outras variáveis importadas junto (altitude…)
  oficial: boolean;               // versão oficial (1 por talhão)
  ano?: number;                   // = ano(data) — classificação por período (EC é estrutural, sem safra)
  pontos: PontoCondutividade[];   // valores incluem profundidades + extras
  rodadas?: Record<string, RodadaCondutividade[]>;  // histórico de processamento por profundidade (C4.1)
  criadoEm: string;
}

export function getCondutividade(talhaoId?: string): LevantamentoCondutividade[] {
  let lista = loadFiltrado<LevantamentoCondutividade>('inv_condutividade');
  if (talhaoId) lista = lista.filter(l => l.talhaoId === talhaoId);
  return lista.sort((a, b) => (b.criadoEm ?? '').localeCompare(a.criadoEm ?? ''));
}

export function saveCondutividade(data: Omit<LevantamentoCondutividade, 'id' | 'criadoEm'>): LevantamentoCondutividade {
  const lista = load<LevantamentoCondutividade>('inv_condutividade');
  // Ano vem da `data` do levantamento (default hoje-SP); EC é estrutural, sem safra.
  const dref = data.data && dataValida(data.data) ? data.data : hojeSaoPauloISO();
  const nova: LevantamentoCondutividade = comEmpresa({ ...data, data: dref, ano: anoDeData(dref) ?? undefined, id: uid(), criadoEm: new Date().toISOString() });
  // A 1ª versão do talhão (ou uma marcada explicitamente) vira a oficial.
  if (nova.oficial || !lista.some(l => l.talhaoId === nova.talhaoId && l.oficial)) {
    nova.oficial = true;
    lista.forEach(l => { if (l.talhaoId === nova.talhaoId) l.oficial = false; });
  }
  lista.push(nova);
  save('inv_condutividade', lista);
  return nova;
}

// Migração idempotente: dataReferencia/ano nos registros de compactação,
// produtividade e condutividade antigos. Ano vem da SAFRA legada (1º número)
// preservando mês/dia da data operacional; condutividade usa a `data` do
// levantamento (ou criadoEm), pois é estrutural (sem safra).
export function migrarPeriodoDemaisV1(): void {
  const backfill = <T extends { safra?: string; ano?: number; dataReferencia?: string; data?: string; criadoEm?: string }>(arr: T[], usaData = false): boolean => {
    let m = false;
    for (const x of arr) {
      if (x.ano != null && (usaData ? !!x.data : !!x.dataReferencia)) continue;
      const anoSafra = x.safra ? anoDaSafra(x.safra) : null;
      const baseRaw = (usaData && x.data && dataValida(x.data)) ? x.data
        : (x.dataReferencia && dataValida(x.dataReferencia)) ? x.dataReferencia
        : (x.criadoEm || hojeSaoPauloISO()).slice(0, 10);
      const p = partesData(baseRaw);
      const dref = (anoSafra != null && p) ? `${anoSafra}${baseRaw.slice(4)}` : baseRaw;
      const dfinal = dataValida(dref) ? dref : hojeSaoPauloISO();
      if (usaData) x.data = dfinal; else x.dataReferencia = dfinal;
      x.ano = anoDeData(dfinal) ?? undefined;
      m = true;
    }
    return m;
  };
  const lc = load<ImportacaoCompactacao>('inv_compactacao'); if (backfill(lc)) save('inv_compactacao', lc);
  const gc = load<GradeCompactacao>('inv_grades_compact'); if (backfill(gc)) save('inv_grades_compact', gc);
  const mp = load<MapaProdutividade>('inv_produtividade'); if (backfill(mp)) save('inv_produtividade', mp);
  const cond = load<LevantamentoCondutividade>('inv_condutividade'); if (backfill(cond, true)) save('inv_condutividade', cond);
}

export function deleteCondutividade(id: string) {
  save('inv_condutividade', load<LevantamentoCondutividade>('inv_condutividade').filter(l => l.id !== id));
}

export function setCondutividadeOficial(id: string) {
  const lista = load<LevantamentoCondutividade>('inv_condutividade');
  const alvo = lista.find(l => l.id === id);
  if (!alvo) return;
  lista.forEach(l => { if (l.talhaoId === alvo.talhaoId) l.oficial = l.id === id; });
  save('inv_condutividade', lista);
}

export function setProfundidadeOficialCondutividade(id: string, prof: string) {
  const lista = load<LevantamentoCondutividade>('inv_condutividade');
  const alvo = lista.find(l => l.id === id);
  if (!alvo) return;
  alvo.profundidadeOficial = prof;
  save('inv_condutividade', lista);
}

// C4.1 — registra uma rodada de processamento no histórico da profundidade (a mais
// recente vira a ativa). Mantém as últimas 20 por profundidade. Devolve a rodada criada.
export function addRodadaCondutividade(levId: string, prof: string, dados: Omit<RodadaCondutividade, 'id' | 'criadoEm'>): RodadaCondutividade | null {
  const lista = load<LevantamentoCondutividade>('inv_condutividade');
  const alvo = lista.find(l => l.id === levId);
  if (!alvo) return null;
  const rodada: RodadaCondutividade = { ...dados, id: uid(), criadoEm: new Date().toISOString() };
  const rodadas = { ...(alvo.rodadas ?? {}) };
  rodadas[prof] = [...(rodadas[prof] ?? []), rodada].slice(-20);
  alvo.rodadas = rodadas;
  save('inv_condutividade', lista);
  return rodada;
}

// ── Mapas de Colheita / Produtividade (Módulo 12, P1) ───────────────────────
// Metadados/versões de cada processamento. O raster fica na nuvem sob demanda
// (cloudSalvarMapa, prefixo `${talhaoId}__prod__`), como fertilidade/NDVI.
// Unidade interna sempre kg/ha. Um mapa por contexto (talhão+safra+época+cultura)
// pode ser marcado OFICIAL (= Camada Oficial de Produtividade).
export interface MapaProdutividade {
  id: string;
  empresaId?: string;
  talhaoId: string;
  safra: string;
  epoca: string;          // ÉPOCA DE CULTIVO: 'verao' | 'safrinha' | 'inverno' | '' (≠ 1ª/2ª época do período)
  dataReferencia?: string; // 'YYYY-MM-DD' — data operacional; deriva Ano/Época (1ª/2ª) do período
  ano?: number;
  cultura: string;
  versao: number;
  oficial: boolean;
  unidade: 'kg/ha' | 'sc/ha' | 't/ha';   // unidade de EXIBIÇÃO escolhida (interno = kg/ha)
  nMaquinas?: number;                    // nº de máquinas unificadas
  normalizado?: boolean;                 // máquinas normalizadas na unificação
  mediaRealKgha?: number | null;         // média real (balança) usada p/ calibrar o mapa
  cleaning?: Record<string, number | boolean>;  // params do pipeline oficial (filtro bruto + colhedora + MapFilter)
  params: { removerZeros: boolean; pLo: number; pHi: number; min: number | null; max: number | null; pixelM: number };
  stats: { nPontos: number; nUsados: number; areaHa: number; producaoTotalKg: number; mediaKgha: number; minKgha: number; maxKgha: number; cv: number };
  bounds: [number, number, number, number];
  arquivo: string;
  criadoEm: string;
}

export function getMapasProdutividade(talhaoId?: string, safra?: string): MapaProdutividade[] {
  let lista = loadFiltrado<MapaProdutividade>('inv_produtividade');
  if (talhaoId) lista = lista.filter(m => m.talhaoId === talhaoId);
  if (safra) lista = filtraPorAno(lista, safra);
  return lista.sort((a, b) => (b.criadoEm ?? '').localeCompare(a.criadoEm ?? ''));
}

export function saveMapaProdutividade(data: Omit<MapaProdutividade, 'id' | 'versao' | 'criadoEm'>): MapaProdutividade {
  const lista = load<MapaProdutividade>('inv_produtividade');
  const irmaos = lista.filter(m => m.talhaoId === data.talhaoId && m.safra === data.safra && m.epoca === data.epoca && m.cultura === data.cultura);
  const versao = irmaos.reduce((mx, m) => Math.max(mx, m.versao), 0) + 1;
  if (data.oficial) irmaos.forEach(m => { m.oficial = false; });
  const nova: MapaProdutividade = comEmpresa(comAnoRef({ ...data, id: uid(), versao, criadoEm: new Date().toISOString() }));
  lista.push(nova);
  save('inv_produtividade', lista);
  return nova;
}

export function setMapaProdutividadeOficial(id: string) {
  const lista = load<MapaProdutividade>('inv_produtividade');
  const alvo = lista.find(m => m.id === id);
  if (!alvo) return;
  lista.forEach(m => {
    if (m.talhaoId === alvo.talhaoId && m.safra === alvo.safra && m.epoca === alvo.epoca && m.cultura === alvo.cultura) m.oficial = m.id === id;
  });
  save('inv_produtividade', lista);
}

export function deleteMapaProdutividade(id: string) {
  save('inv_produtividade', load<MapaProdutividade>('inv_produtividade').filter(m => m.id !== id));
}

export interface Safra {
  id: string;
  nome: string;         // ex: "24/25"
  anoInicio: number;
  anoFim: number;
  ativa: boolean;
  criadoEm: string;
}

export interface PadraoElementos {
  id: string;
  nome: string;          // ex: "Rotina", "Rotina + Micros", "Padrão 1 Invicta"
  elementos: string[];   // ids da Base Agronômica: ['ph','p','k','ca',...]
  criadoEm: string;
}

export interface ProfundidadeConfig {
  rotulo: string;            // ex: "00-10", "10-20", "20-40"
  percentual: number;        // % dos pontos que recebem esta profundidade (100, 20...)
  padraoElementosId: string; // FK -> PadraoElementos
}

export interface PadraoAmostragem {
  id: string;
  nome: string;                       // ex: "Padrão 1 Invicta — 2 ha"
  densidadeHaPonto: number;           // ha por ponto (ex: 2 ou 1.5)
  profundidades: ProfundidadeConfig[];
  criadoEm: string;
}

export interface PontoAmostragem {
  ordem: number;          // índice serpentina (0-based). CHAVE das coletas de campo
                          // (inv_coletas usa `${gradeId}__${ordem}`) — não renumerar.
  numero?: number;        // nº da AMOSTRA (grade importada de fora); join com lab usa numero ?? ordem+1
  // Grade de ZONAS (lib/gradeZonas.ts): o ponto sabe de que zona é, e o operador
  // o enxerga como `zona-sequencial` ("2-3"). O rótulo é TEXTO e nunca entra no
  // campo numérico — o parser do laudo tira os não-dígitos e "1-1" viraria 11.
  zona?: string;          // id da zona no zoneamento ("01", "02"…)
  seqZona?: number;       // sequencial DENTRO da zona (1..n)
  rotulo?: string;        // o que o campo vê: "2-3"
  lng: number;
  lat: number;
  profs: number;          // nº de profundidades (define a cor)
  profundidades?: string[]; // rótulos das profundidades deste ponto (ex: ['00-20','20-40'])
  manual?: boolean;       // movido/adicionado manualmente
}

export interface GradeAmostragem {
  id: string;
  talhaoId: string;
  safra: string;                      // nome da safra (ex "25/26")
  epoca: '1' | '2';                   // DERIVADA da dataReferencia (jan–jun=1 / jul–dez=2)
  dataReferencia?: string;            // 'YYYY-MM-DD' — data operacional da amostragem
  ano?: number;                       // = ano(dataReferencia)
  nome: string;                       // "Grade 1"
  padraoAmostragemId: string;
  padraoNome: string;                 // snapshot
  customizado: boolean;               // divergiu do padrão original
  densidade: number;
  distanciaBorda: number;
  rotacao: number;
  aleatoriedade: number;
  modoSel: 'regular' | 'aleatorio' | 'equilibrado'; // 'aleatorio' = legado (grades antigas)
  variacaoSel?: number;                             // 0-100: variação da seleção equilibrada
  metodo?: 'grid' | 'zonas';                  // default 'grid'
  modelo?: 'A' | 'B';                         // zonas: composta (A) / individual (B)
  modoDist?: 'grade' | 'inteligente';         // zonas: distribuição
  densidadePorZona?: Record<string, number>;  // zonas: override por zona
  /** Código do lote enviado ao laboratório (INV-XXXX-XXXX). Ver lib/remessa.ts.
   *  Nasce na 1ª exportação (etiquetas/conferência) e é o que o laboratório
   *  devolve na API para dizer de qual talhão é o laudo. */
  codigoRemessa?: string;
  profundidades: ProfundidadeConfig[];
  pontos: PontoAmostragem[];
  paraProcessar: boolean;
  criadoEm: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function load<T>(key: string): T[] {
  return lerListaLocal<T>(key);
}

// Aviso de quota estourada: só 1x por sessão pra não martelar o usuário com
// alert() a cada save() subsequente enquanto o armazenamento seguir cheio.
let avisouQuotaCheia = false;

function save<T>(key: string, data: T[]) {
  if (typeof window === 'undefined') return;
  try {
    gravarListaLocal(key, data);       // comprime as chaves pesadas (localComprimido)
  } catch (e) {
    console.error(`[store] falha ao gravar "${key}" no localStorage:`, e);
    if (!avisouQuotaCheia) {
      avisouQuotaCheia = true;
      alert('Armazenamento local cheio — os últimos dados NÃO foram salvos no cache deste navegador. Eles ainda serão enviados à nuvem, mas libere espaço (ex.: limpe dados de outros sites) para o cache local voltar a funcionar.');
    }
  }
  cloudPushLista(key, data); // espelha na nuvem quando configurada (no-op sem Supabase) - mesmo se o save local falhou acima
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ── Filtro por Empresa (Fase 1.A) ─────────────────────────────────────────
// Cada item ganha `empresaId` opcional. `loadFiltrado` retorna só os da
// empresa ativa; itens antigos sem `empresaId` são auto-marcados com a
// empresa ativa na primeira leitura (migração silenciosa, idempotente).
// `comEmpresa` injeta `empresaId` ao gravar.

type ComEmpresa<T> = T & { empresaId?: string };

function loadFiltrado<T>(key: string): T[] {
  // SINGLE-TENANT (decisão do usuário): uma única empresa "Invicta" para todos.
  // O filtro por empresa foi DESLIGADO — ele escondia dados/importações de quem
  // caísse numa empresa ativa diferente (causava "mapas/importações somem ao
  // atualizar"). Todos veem os mesmos dados. `comEmpresa` ainda carimba o
  // empresaId ao gravar (inócuo), caso se reative a segregação no futuro.
  return load<ComEmpresa<T>>(key);
}

function comEmpresa<T extends object>(item: T): T {
  const ativa = empresaAtivaId();
  if (!ativa) return item;
  return { ...item, empresaId: ativa } as T;
}

// ── Clientes ──────────────────────────────────────────────────────────────

// Escopo de fazendas derivado do vínculo de clientes (consultoria) E do vínculo
// DIRETO por fazenda (IAM): quando o usuário tem fazendas vinculadas, só elas
// entram — mesmo que o produtor inteiro esteja liberado.
function fazendasNoEscopo(esc: Set<string>): Set<string> {
  const escF = escopoFazendaIds();
  return new Set(loadFiltrado<Fazenda>('inv_fazendas')
    .filter(f => esc.has(f.clienteId) && (!escF || escF.has(f.id)))
    .map(f => f.id));
}

export function getClientes(): Cliente[] {
  const esc = escopoClienteIds();
  let all = loadFiltrado<Cliente>('inv_clientes');
  if (esc) all = all.filter(c => esc.has(c.id));
  return all.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

// Nome de cliente/fazenda/talhao fica SEMPRE em caixa alta (decisao do usuario).
function comNome<T extends { nome?: string }>(o: T): T {
  return typeof o.nome === 'string' ? { ...o, nome: o.nome.toUpperCase() } : o;
}

export function saveCliente(c: Omit<Cliente, 'id' | 'criadoEm'>): Cliente {
  const clientes = load<Cliente>('inv_clientes');
  const novo: Cliente = comEmpresa(comNome({ ...c, id: uid(), criadoEm: new Date().toISOString() }));
  clientes.push(novo);
  save('inv_clientes', clientes);
  return novo;
}

export function updateCliente(id: string, data: Partial<Cliente>) {
  const clientes = load<Cliente>('inv_clientes');
  const idx = clientes.findIndex(c => c.id === id);
  if (idx >= 0) { clientes[idx] = comNome({ ...clientes[idx], ...data }); save('inv_clientes', clientes); }
}

export function deleteCliente(id: string) {
  save('inv_clientes', load<Cliente>('inv_clientes').filter(c => c.id !== id));
}

// Remove das listas locais tudo que pertence aos talhões dados (análises,
// grades, plantios, compactação, MDE, composições, condutividade, MEAP) e os
// próprios talhões — local + nuvem (save propaga a remoção via cloudPushLista).
// Docs fora das listas (mapas `${tid}__*`, cenários `cen_${tid}_*`) são do
// chamador. NÃO toca na Biblioteca nem em legendas/safras/padrões.
function removerTalhoesCascata(talhaoIds: string[]) {
  const tal = new Set(talhaoIds);
  save('inv_lab', load<ImportacaoLab>('inv_lab').filter(i => !tal.has(i.talhaoId)));
  save('inv_grades', load<GradeAmostragem>('inv_grades').filter(g => !tal.has(g.talhaoId)));
  save('inv_plantios', load<Plantio>('inv_plantios').filter(p => !tal.has(p.talhaoId)));
  save('inv_compactacao', load<ImportacaoCompactacao>('inv_compactacao').filter(c => !tal.has(c.talhaoId)));
  save('inv_grades_compact', load<GradeCompactacao>('inv_grades_compact').filter(g => !tal.has(g.talhaoId)));
  save('inv_mde', load<MdeTalhao>('inv_mde').filter(m => !tal.has(m.talhaoId)));
  save('inv_mde_camadas', load<MdeCamadaTopo>('inv_mde_camadas').filter(c => !tal.has(c.talhaoId)));
  save('inv_composicoes', load<ComposicaoTemporal>('inv_composicoes').filter(c => !tal.has(c.talhaoId)));
  save('inv_condutividade', load<LevantamentoCondutividade>('inv_condutividade').filter(c => !tal.has(c.talhaoId)));
  save('inv_meap_ambientes', load<AmbienteProdutivo>('inv_meap_ambientes').filter(a => !tal.has(a.talhaoId)));
  save('inv_meap_zoneamentos', load<ZoneamentoMeap>('inv_meap_zoneamentos').filter(z => !tal.has(z.talhaoId)));
  save('inv_talhoes', load<Talhao>('inv_talhoes').filter(t => !tal.has(t.id)));
}

// Exclui um produtor e TUDO ligado a ele (fazendas, talhões e as coleções por
// talhão acima). Devolve os ids de talhão para o chamador limpar também os
// mapas/cenários na nuvem (coleções de docs, fora das listas).
export function excluirProdutorCascata(clienteId: string): { talhaoIds: string[] } {
  const fazIds = new Set(load<Fazenda>('inv_fazendas').filter(f => f.clienteId === clienteId).map(f => f.id));
  const talhaoIds = load<Talhao>('inv_talhoes').filter(t => fazIds.has(t.fazendaId)).map(t => t.id);
  removerTalhoesCascata(talhaoIds);
  save('inv_fazendas', load<Fazenda>('inv_fazendas').filter(f => !fazIds.has(f.id)));
  save('inv_clientes', load<Cliente>('inv_clientes').filter(c => c.id !== clienteId));
  return { talhaoIds };
}

// ── Fazendas ──────────────────────────────────────────────────────────────

export function getFazendas(clienteId?: string): Fazenda[] {
  const esc = escopoClienteIds();
  const escF = escopoFazendaIds();          // IAM: vínculo direto por fazenda
  let all = loadFiltrado<Fazenda>('inv_fazendas');
  if (esc) all = all.filter(f => esc.has(f.clienteId));
  if (escF) all = all.filter(f => escF.has(f.id));
  all.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));   // sempre em ordem alfabética
  return clienteId ? all.filter(f => f.clienteId === clienteId) : all;
}

export function saveFazenda(f: Omit<Fazenda, 'id' | 'criadoEm'>): Fazenda {
  const fazendas = load<Fazenda>('inv_fazendas');
  const nova: Fazenda = comEmpresa(comNome({ ...f, id: uid(), criadoEm: new Date().toISOString() }));
  fazendas.push(nova);
  save('inv_fazendas', fazendas);
  return nova;
}

export function updateFazenda(id: string, data: Partial<Fazenda>) {
  const fazendas = load<Fazenda>('inv_fazendas');
  const idx = fazendas.findIndex(f => f.id === id);
  if (idx >= 0) { fazendas[idx] = comNome({ ...fazendas[idx], ...data }); save('inv_fazendas', fazendas); }
}

// Exclui uma fazenda e TUDO ligado a ela (talhões e as coleções por talhão) —
// mesmo contrato do excluirProdutorCascata: devolve os ids de talhão para o
// chamador limpar os mapas/cenários na nuvem. NÃO toca no cliente.
export function excluirFazendaCascata(fazendaId: string): { talhaoIds: string[] } {
  const talhaoIds = load<Talhao>('inv_talhoes').filter(t => t.fazendaId === fazendaId).map(t => t.id);
  removerTalhoesCascata(talhaoIds);
  save('inv_fazendas', load<Fazenda>('inv_fazendas').filter(f => f.id !== fazendaId));
  return { talhaoIds };
}

// ── Talhões ───────────────────────────────────────────────────────────────

export function getTalhoes(fazendaId?: string): Talhao[] {
  const esc = escopoClienteIds();
  let all = loadFiltrado<Talhao>('inv_talhoes');
  if (esc) { const fz = fazendasNoEscopo(esc); all = all.filter(t => fz.has(t.fazendaId)); }
  const escT = escopoTalhaoIds();   // granularidade fina: restringe aos talhões vinculados
  if (escT) all = all.filter(t => escT.has(t.id));
  all.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));   // sempre em ordem alfabética
  return fazendaId ? all.filter(t => t.fazendaId === fazendaId) : all;
}

// Centroide de cada talhão cadastrado (para o mapa de visão geral do Início).
// Usa o bbox se houver; senão calcula do geojson. Talhão sem geometria é
// ignorado (não tem onde plotar). Traz município/estado da fazenda.
export interface TalhaoCentroide {
  id: string; nome: string; fazendaId: string; fazenda: string;
  municipio: string; estado: string;
  lng: number; lat: number;
}

// bbox [minX,minY,maxX,maxY] calculado do geojson (string). null se inválido.
export function bboxDoGeojson(geojson: string): [number, number, number, number] | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const walk = (g: GeoJSON.Geometry) => {
    if (g.type === 'Polygon') g.coordinates.forEach(r => r.forEach(([a, b]) => { if (a < minX) minX = a; if (b < minY) minY = b; if (a > maxX) maxX = a; if (b > maxY) maxY = b; }));
    else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => p.forEach(r => r.forEach(([a, b]) => { if (a < minX) minX = a; if (b < minY) minY = b; if (a > maxX) maxX = a; if (b > maxY) maxY = b; })));
  };
  try {
    const gj = JSON.parse(geojson) as GeoJSON.GeoJSON;
    if (gj.type === 'FeatureCollection') gj.features.forEach(f => f.geometry && walk(f.geometry));
    else if (gj.type === 'Feature') gj.geometry && walk(gj.geometry);
    else walk(gj as GeoJSON.Geometry);
  } catch { return null; }
  return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
}

// BACKFILL de bbox (1x por navegador): talhões antigos sem bbox obrigavam a
// re-analisar o polígono inteiro a CADA abertura da página para plotar o
// centroide. Grava o bbox de vez (1 save; sincroniza) e o parse some p/ sempre.
export function migrarBboxTalhoesV1() {
  try {
    if (localStorage.getItem('inv_migrado_bbox_v1') === '1') return;
    const talhoes = load<Talhao>('inv_talhoes');
    if (!talhoes.length) return;   // dados ainda não hidratados — tenta no próximo boot
    let mudou = 0;
    for (const t of talhoes) {
      const temBbox = !!(t.bbox && t.bbox.length === 4 && t.bbox.every(Number.isFinite));
      if (temBbox || !t.geojson) continue;
      const bb = bboxDoGeojson(t.geojson);
      if (bb) { t.bbox = bb; mudou++; }
    }
    if (mudou) { save('inv_talhoes', talhoes); console.info(`[migração] bbox preenchido em ${mudou} talhão(ões).`); }
    localStorage.setItem('inv_migrado_bbox_v1', '1');
  } catch { /* tenta no próximo boot */ }
}

// Memo do centroide POR TALHÃO: o JSON.parse do geojson (grande) de talhão sem
// bbox custava caro a cada chamada — com 916 talhões, megabytes de parsing.
// A assinatura invalida quando a geometria muda (bbox novo / geojson trocado).
const memoCentroide = new Map<string, { sig: string; lng: number; lat: number }>();

function centroideDoTalhao(t: Talhao): { lng: number; lat: number } | null {
  const temBbox = !!(t.bbox && t.bbox.length === 4 && t.bbox.every(Number.isFinite));
  const sig = temBbox ? `b:${t.bbox!.join(',')}` : `g:${t.geojson?.length ?? 0}`;
  const hit = memoCentroide.get(t.id);
  if (hit && hit.sig === sig) return { lng: hit.lng, lat: hit.lat };

  let cx: number | null = null, cy: number | null = null;
  if (temBbox) {
    cx = (t.bbox![0] + t.bbox![2]) / 2; cy = (t.bbox![1] + t.bbox![3]) / 2;
  } else if (t.geojson) {
    const bb = bboxDoGeojson(t.geojson);
    if (bb) { cx = (bb[0] + bb[2]) / 2; cy = (bb[1] + bb[3]) / 2; }
  }
  if (cx == null || cy == null) return null;
  memoCentroide.set(t.id, { sig, lng: cx, lat: cy });
  return { lng: cx, lat: cy };
}

export function getTalhoesCentroides(): TalhaoCentroide[] {
  const fazendas = new Map(getFazendas().map(f => [f.id, f]));
  const out: TalhaoCentroide[] = [];
  for (const t of getTalhoes()) {
    const c = centroideDoTalhao(t);
    if (!c) continue;
    const fz = fazendas.get(t.fazendaId);
    out.push({
      id: t.id, nome: t.nome, fazendaId: t.fazendaId, fazenda: fz?.nome ?? '',
      municipio: fz?.municipio || '—', estado: (fz?.estado || '').toUpperCase(),
      lng: c.lng, lat: c.lat,
    });
  }
  return out;
}

// Atualização de fazendas em LOTE: 1 load + 1 save (+1 push coalescido), em vez
// de N gravações da lista inteira — usado pela correção de município do Início.
export function updateFazendasLote(atualizacoes: { id: string; data: Partial<Fazenda> }[]): number {
  if (!atualizacoes.length) return 0;
  const fazendas = load<Fazenda>('inv_fazendas');
  let mudou = 0;
  for (const a of atualizacoes) {
    const idx = fazendas.findIndex(f => f.id === a.id);
    if (idx >= 0) { fazendas[idx] = comNome({ ...fazendas[idx], ...a.data }); mudou++; }
  }
  if (mudou) save('inv_fazendas', fazendas);
  return mudou;
}

export function saveTalhao(t: Omit<Talhao, 'id' | 'criadoEm'>): Talhao {
  const talhoes = load<Talhao>('inv_talhoes');
  const novo: Talhao = comEmpresa(comNome({ ...t, id: uid(), criadoEm: new Date().toISOString() }));
  talhoes.push(novo);
  save('inv_talhoes', talhoes);
  return novo;
}

// Safras (nomes) que têm ALGUM dado deste talhão nas coleções por ciclo —
// usado para anotar a versão arquivada do polígono ("estes ciclos usaram esta
// geometria"). Informativo: não recalcula nem altera nada do histórico.
function safrasComDadosDoTalhao(talhaoId: string): string[] {
  const s = new Set<string>();
  for (const p of load<Plantio>('inv_plantios')) if (p.talhaoId === talhaoId && p.cultura) s.add(p.safra);
  for (const g of load<GradeAmostragem>('inv_grades')) if (g.talhaoId === talhaoId) s.add(g.safra);
  for (const i of load<ImportacaoLab>('inv_lab')) if (i.talhaoId === talhaoId) s.add(i.safra);
  for (const c of load<ImportacaoCompactacao>('inv_compactacao')) if (c.talhaoId === talhaoId) s.add(c.safra);
  for (const g of load<GradeCompactacao>('inv_grades_compact')) if (g.talhaoId === talhaoId) s.add(g.safra);
  for (const m of load<MapaProdutividade>('inv_produtividade')) if (m.talhaoId === talhaoId) s.add(m.safra);
  for (const c of load<ComposicaoTemporal>('inv_composicoes')) if (c.talhaoId === talhaoId && c.safra) s.add(c.safra);
  return Array.from(s).sort();
}

// Substituição de limite: sempre que uma gravação troca o geojson de um talhão
// que JÁ tinha limite, a versão vigente é arquivada em geoVersoes e geoVersao
// avança — em QUALQUER caminho (upload, editor, importação em massa, medição de
// campo). A regra de BLOQUEIO (só substituir com o ciclo atual sem dados) é do
// chamador — ver lib/trocaPoligono.ts.
function comVersaoDeLimite(atual: Talhao, data: Partial<Talhao>): Partial<Talhao> {
  if (data.geojson === undefined || !atual.geojson || data.geojson === atual.geojson) return data;
  const versao = atual.geoVersao ?? 1;
  const arquivada: VersaoPoligono = {
    versao, geojson: atual.geojson, bbox: atual.bbox,
    areaHa: atual.areaHa, areaHaSemHoles: atual.areaHaSemHoles,
    arquivadoEm: new Date().toISOString(),
    safras: safrasComDadosDoTalhao(atual.id),
  };
  return { ...data, geoVersao: versao + 1, geoVersoes: [...(atual.geoVersoes ?? []), arquivada] };
}

export function updateTalhao(id: string, data: Partial<Talhao>) {
  const talhoes = load<Talhao>('inv_talhoes');
  const idx = talhoes.findIndex(t => t.id === id);
  if (idx >= 0) { talhoes[idx] = comNome({ ...talhoes[idx], ...comVersaoDeLimite(talhoes[idx], data) }); save('inv_talhoes', talhoes); }
}

// Importação em massa: aplica TODAS as criações/atualizações numa gravação só
// (1 write no localStorage + 1 push da lista pra nuvem). Item a item, N talhões
// geravam N pushes da lista inteira — lento e sem resposta visível na UI.
export function importarTalhoesLote(
  novos: Omit<Talhao, 'id' | 'criadoEm'>[],
  atualizacoes: { id: string; data: Partial<Talhao> }[],
): { criados: number; atualizados: number } {
  const talhoes = load<Talhao>('inv_talhoes');
  let atualizados = 0;
  for (const a of atualizacoes) {
    const idx = talhoes.findIndex(t => t.id === a.id);
    if (idx >= 0) { talhoes[idx] = comNome({ ...talhoes[idx], ...comVersaoDeLimite(talhoes[idx], a.data) }); atualizados++; }
  }
  for (const n of novos) {
    talhoes.push(comEmpresa(comNome({ ...n, id: uid(), criadoEm: new Date().toISOString() })));
  }
  save('inv_talhoes', talhoes);
  return { criados: novos.length, atualizados };
}

export function deleteTalhao(id: string) {
  save('inv_talhoes', load<Talhao>('inv_talhoes').filter(t => t.id !== id));
}

// Recalcula as areas dos talhoes para a base GEODESICA (elipsoide WGS84, igual
// QGIS). O calculo antigo (turf) usa uma esfera e superestima ~0,2%. Idempotente:
// recalcula A PARTIR DA GEOMETRIA, entao rodar de novo da o mesmo valor (nao
// acumula) — seguro mesmo com varios aparelhos. So toca talhoes com geojson
// valido; area 0 / sem geometria fica intacta. Roda 1x por navegador (flag).
export function migrarAreasGeodesicasV1() {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem('inv_migrado_area_geo_v1') === '1') return;
  const talhoes = load<Talhao>('inv_talhoes');
  if (talhoes.length === 0) return;   // dados ainda nao hidratados — tenta no proximo boot (nao queima a flag)
  let mudou = false;
  for (const t of talhoes) {
    if (!t.geojson) continue;
    let fc: GeoJSON.GeoJSON;
    try { fc = JSON.parse(t.geojson) as GeoJSON.GeoJSON; } catch { continue; }
    const net = areaHaGeo(fc);
    if (!(net > 0)) continue;
    const bruta = areaHaGeoBruta(fc);
    if (t.areaHa !== net) { t.areaHa = net; mudou = true; }
    const g = bruta > 0 ? bruta : net;
    if (t.areaHaSemHoles !== g) { t.areaHaSemHoles = g; mudou = true; }
  }
  if (mudou) save('inv_talhoes', talhoes);
  localStorage.setItem('inv_migrado_area_geo_v1', '1');
}

// Nome de cliente/fazenda/talhao SEMPRE em caixa alta (decisao do usuario).
// Idempotente (toUpperCase de algo ja maiusculo nao muda). So marca a flag quando
// ja havia dados hidratados, pra nao pular a migracao num boot vazio.
export function migrarNomesMaiusculosV1() {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem('inv_migrado_nomes_ca_v1') === '1') return;
  let temDados = false;
  for (const key of ['inv_clientes', 'inv_fazendas', 'inv_talhoes'] as const) {
    const lista = load<{ nome?: string }>(key);
    if (lista.length === 0) continue;
    temDados = true;
    let mudou = false;
    for (const it of lista) {
      if (typeof it.nome === 'string' && it.nome !== it.nome.toUpperCase()) { it.nome = it.nome.toUpperCase(); mudou = true; }
    }
    if (mudou) save(key, lista);
  }
  if (temDados) localStorage.setItem('inv_migrado_nomes_ca_v1', '1');
}

// ── Safras ────────────────────────────────────────────────────────────────

// Wrappers de retrocompat (Fase 5): Safras vivem na Biblioteca > Safras.
// Forma `Safra` e API públicas inalteradas — SafrasPanel não muda.

function _itemParaSafra(it: ItemBiblioteca<ConteudoSafra>): Safra {
  return { id: it.id, nome: it.nome, anoInicio: it.conteudo.anoInicio, anoFim: it.conteudo.anoFim, ativa: it.conteudo.ativa, criadoEm: it.criadoEm };
}

export function getSafras(): Safra[] {
  return bibListar<ConteudoSafra>('safras').map(_itemParaSafra).sort((a, b) => b.anoInicio - a.anoInicio);
}

export function saveSafra(s: Omit<Safra, 'id' | 'criadoEm'>): Safra {
  const it = bibCriar<ConteudoSafra>('safras', {
    nome: s.nome,
    conteudo: { anoInicio: s.anoInicio, anoFim: s.anoFim, ativa: s.ativa },
    escopo: empresaAtivaId() ? 'empresa' : 'meu',
  });
  return _itemParaSafra(it);
}

export function updateSafra(id: string, data: Partial<Safra>) {
  const it = bibObter<ConteudoSafra>('safras', id);
  if (!it) return;
  const conteudo = { ...it.conteudo };
  if (data.anoInicio !== undefined) conteudo.anoInicio = data.anoInicio;
  if (data.anoFim !== undefined) conteudo.anoFim = data.anoFim;
  if (data.ativa !== undefined) conteudo.ativa = data.ativa;
  bibAtualizar<ConteudoSafra>('safras', id, { ...(data.nome !== undefined ? { nome: data.nome } : {}), conteudo });
}

export function deleteSafra(id: string) {
  bibExcluir('safras', id);
}

// ── Padrões de Elementos ────────────────────────────────────────────────────
// Conjunto nomeado de elementos a analisar (ex: "Rotina", "Rotina + Micros").
// Os elementos referenciam os ids da Base Agronômica (ph, p, k, ca...).

// Wrappers de retrocompat (Fase 5): Padrões de Elementos vivem na Biblioteca >
// Grades (kind 'elementos'). API pública inalterada — SimuladorAmostragem não muda.

function _itemParaPadrEl(it: ItemBiblioteca<ConteudoGrade>): PadraoElementos | null {
  if (it.conteudo.kind !== 'elementos') return null;
  return { id: it.id, nome: it.nome, elementos: it.conteudo.elementos, criadoEm: it.criadoEm };
}

export function getPadroesElementos(): PadraoElementos[] {
  return bibListar<ConteudoGrade>('grades')
    .map(_itemParaPadrEl)
    .filter((x): x is PadraoElementos => x !== null)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function savePadraoElementos(p: Omit<PadraoElementos, 'id' | 'criadoEm'>): PadraoElementos {
  const it = bibCriar<ConteudoGrade>('grades', {
    nome: p.nome,
    conteudo: { kind: 'elementos', elementos: p.elementos },
    escopo: empresaAtivaId() ? 'empresa' : 'meu',
  });
  return { id: it.id, nome: it.nome, elementos: p.elementos, criadoEm: it.criadoEm };
}

export function updatePadraoElementos(id: string, data: Partial<PadraoElementos>) {
  const it = bibObter<ConteudoGrade>('grades', id);
  if (!it || it.conteudo.kind !== 'elementos') return;
  const elementos = data.elementos ?? it.conteudo.elementos;
  bibAtualizar<ConteudoGrade>('grades', id, {
    ...(data.nome !== undefined ? { nome: data.nome } : {}),
    conteudo: { kind: 'elementos', elementos },
  });
}

export function deletePadraoElementos(id: string) {
  bibExcluir('grades', id);
}

// ── Padrões de Amostragem ───────────────────────────────────────────────────
// Template reutilizável: densidade + profundidades (cada uma com % de pontos
// e qual padrão de elementos). Distância da borda/rotação ficam no simulador.

// Wrappers de retrocompat (Fase 5): Padrões de Amostragem vivem na Biblioteca >
// Grades (kind 'amostragem'). API pública inalterada.

function _itemParaPadrAmos(it: ItemBiblioteca<ConteudoGrade>): PadraoAmostragem | null {
  if (it.conteudo.kind !== 'amostragem') return null;
  return { id: it.id, nome: it.nome, densidadeHaPonto: it.conteudo.densidadeHaPonto, profundidades: it.conteudo.profundidades, criadoEm: it.criadoEm };
}

export function getPadroesAmostragem(): PadraoAmostragem[] {
  return bibListar<ConteudoGrade>('grades')
    .map(_itemParaPadrAmos)
    .filter((x): x is PadraoAmostragem => x !== null)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function savePadraoAmostragem(p: Omit<PadraoAmostragem, 'id' | 'criadoEm'>): PadraoAmostragem {
  const it = bibCriar<ConteudoGrade>('grades', {
    nome: p.nome,
    conteudo: { kind: 'amostragem', densidadeHaPonto: p.densidadeHaPonto, profundidades: p.profundidades },
    escopo: empresaAtivaId() ? 'empresa' : 'meu',
  });
  return { id: it.id, nome: it.nome, densidadeHaPonto: p.densidadeHaPonto, profundidades: p.profundidades, criadoEm: it.criadoEm };
}

export function updatePadraoAmostragem(id: string, data: Partial<PadraoAmostragem>) {
  const it = bibObter<ConteudoGrade>('grades', id);
  if (!it || it.conteudo.kind !== 'amostragem') return;
  bibAtualizar<ConteudoGrade>('grades', id, {
    ...(data.nome !== undefined ? { nome: data.nome } : {}),
    conteudo: {
      kind: 'amostragem',
      densidadeHaPonto: data.densidadeHaPonto ?? it.conteudo.densidadeHaPonto,
      profundidades: data.profundidades ?? it.conteudo.profundidades,
    },
  });
}

export function deletePadraoAmostragem(id: string) {
  bibExcluir('grades', id);
}

// ── Grades de Amostragem ────────────────────────────────────────────────────
// Várias grades por talhão+safra; uma marcada como "para processar".

export function getGrades(talhaoId?: string, safra?: string, metodo?: 'grid' | 'zonas'): GradeAmostragem[] {
  let all = loadFiltrado<GradeAmostragem>('inv_grades');
  if (talhaoId) all = all.filter(g => g.talhaoId === talhaoId);
  if (safra) {
    // Filtra por ANO (do campo `ano`, derivado da Data de referência), não pela
    // string da safra — assim uma grade com data de 2024 cai no Ano 2024 mesmo
    // que a safra ativa na hora fosse outra. Fallback: deriva da safra gravada.
    const anoSel = anoDaSafra(safra);
    all = anoSel == null
      ? all.filter(g => g.safra === safra)
      : all.filter(g => (g.ano ?? anoDaSafra(g.safra)) === anoSel);
  }
  if (metodo) all = all.filter(g => (g.metodo ?? 'grid') === metodo);
  return all.sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
}

// Assinatura de conteúdo de uma grade: se duas grades têm a mesma assinatura,
// são a MESMA grade (salvamento repetido). Usada pela trava do saveGrade e pela
// migração de duplicadas.
function assinaturaGrade(g: Pick<GradeAmostragem, 'talhaoId' | 'safra' | 'epoca' | 'metodo' | 'pontos'>): string {
  const pts = (g.pontos ?? []).map(p => [p.ordem, p.lng, p.lat, p.numero ?? null]);
  return `${g.talhaoId}|${g.safra}|${g.epoca}|${g.metodo ?? 'grid'}|${JSON.stringify(pts)}`;
}

/**
 * Código de remessa da grade, criando na primeira vez que é pedido.
 *
 * Nasce aqui, e não no `saveGrade`, porque só faz sentido quando o lote sai
 * para o laboratório (etiquetas ou conferência) — grade rascunhada e descartada
 * não precisa queimar código. Depois de criado nunca muda: ele já está impresso
 * no papel que foi junto com as amostras.
 */
export function garantirCodigoRemessa(gradeId: string): string | null {
  if (typeof window === 'undefined') return null;
  const lista = load<GradeAmostragem>('inv_grades');
  const g = lista.find(x => x.id === gradeId);
  if (!g) return null;
  if (!g.codigoRemessa) {
    const usados = new Set(lista.map(x => x.codigoRemessa).filter(Boolean));
    let c = gerarCodigoRemessa();
    // Colisão é improvável, mas duas grades com o mesmo código fariam a API não
    // saber em qual talhão gravar — e o certo ali é recusar, não escolher.
    for (let i = 0; i < 10 && usados.has(c); i++) c = gerarCodigoRemessa();
    g.codigoRemessa = c;
    save('inv_grades', lista);
  }
  return g.codigoRemessa;
}

export function saveGrade(g: Omit<GradeAmostragem, 'id' | 'criadoEm'>): GradeAmostragem {
  const lista = load<GradeAmostragem>('inv_grades');
  // Ano/Época DERIVADOS da Data de referência (default hoje-SP) — store é a
  // autoridade (ignora epoca que a UI porventura mande).
  const dataRef = g.dataReferencia && dataValida(g.dataReferencia) ? g.dataReferencia : hojeSaoPauloISO();
  const per = periodoDeData(dataRef);
  const gp: Omit<GradeAmostragem, 'id' | 'criadoEm'> = { ...g, dataReferencia: dataRef, ano: per?.ano, epoca: per?.epoca ?? g.epoca };
  // Trava de idempotência: salvar de novo uma grade EXATAMENTE igual (mesmo
  // talhão/safra/época/método/pontos) devolve a existente em vez de duplicar
  // (protege contra duplo clique/re-execução — caso real: 5x "JCASA 01").
  const k = assinaturaGrade(gp);
  const igual = lista.find(x => assinaturaGrade(x) === k);
  if (igual) return igual;
  const nova: GradeAmostragem = comEmpresa({ ...gp, id: uid(), criadoEm: new Date().toISOString() });
  lista.push(nova);
  save('inv_grades', lista);
  return nova;
}

// Migração idempotente: preenche dataReferencia/ano nas grades antigas. Preserva
// a ÉPOCA já escolhida (1ª/2ª) sintetizando uma data coerente no ano da safra
// (1ª→15/03, 2ª→15/09); sem safra parseável, usa a data de criação.
export function migrarGradesPeriodoV1(): void {
  const lista = load<GradeAmostragem>('inv_grades');
  let mudou = false;
  for (const g of lista) {
    if (g.dataReferencia && g.ano != null) continue;
    const anoSafra = anoDaSafra(g.safra);
    const base = anoSafra != null ? `${anoSafra}-${g.epoca === '2' ? '09' : '03'}-15` : (g.criadoEm || hojeSaoPauloISO()).slice(0, 10);
    g.dataReferencia = dataValida(base) ? base : hojeSaoPauloISO();
    g.ano = anoDeData(g.dataReferencia) ?? undefined;
    mudou = true;
  }
  if (mudou) save('inv_grades', lista);
}

// Remove grades DUPLICADAS exatas (mesma assinatura), mantendo por grupo: todas
// as REFERENCIADAS por laudos (inv_lab.gradeId) ou coletas de campo
// (inv_coletas/inv_leituras_compact.gradeId) e, se nenhuma for referenciada, a
// mais ANTIGA. Corrige salvamentos repetidos históricos (5x "JCASA 01", 06/2026).
// Idempotente: roda no boot; a flag só é gravada quando já há dados hidratados.
export function migrarGradesDuplicadasV1() {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem('inv_migrado_grades_dup_v1') === '1') return;
  const lista = load<GradeAmostragem>('inv_grades');
  if (lista.length === 0) return;   // sem dados ainda (nuvem não hidratou) — tenta no próximo boot
  const referenciadas = new Set<string>();
  for (const key of ['inv_lab', 'inv_coletas', 'inv_leituras_compact']) {
    for (const r of load<{ gradeId?: string }>(key)) if (r.gradeId) referenciadas.add(r.gradeId);
  }
  const grupos = new Map<string, GradeAmostragem[]>();
  for (const g of lista) {
    const k = assinaturaGrade(g);
    (grupos.get(k) ?? grupos.set(k, []).get(k)!).push(g);
  }
  const manter = new Set<string>();
  for (const grupo of grupos.values()) {
    const usadas = grupo.filter(g => referenciadas.has(g.id));
    if (usadas.length > 0) usadas.forEach(g => manter.add(g.id));
    else {
      const antiga = [...grupo].sort((a, b) => (a.criadoEm ?? '').localeCompare(b.criadoEm ?? ''))[0];
      manter.add(antiga.id);
    }
  }
  if (manter.size < lista.length) save('inv_grades', lista.filter(g => manter.has(g.id)));
  localStorage.setItem('inv_migrado_grades_dup_v1', '1');
}

export function updateGrade(id: string, data: Partial<GradeAmostragem>) {
  const lista = load<GradeAmostragem>('inv_grades');
  const idx = lista.findIndex(g => g.id === id);
  if (idx >= 0) { lista[idx] = { ...lista[idx], ...data }; save('inv_grades', lista); }
}

export function deleteGrade(id: string) {
  save('inv_grades', load<GradeAmostragem>('inv_grades').filter(g => g.id !== id));
}

// ── #33 Tabela de preços única — DEPRECADA na v2.42 ────────────────────────
//
// A fonte única de preço passou a ser Biblioteca → Insumos, com a equação
// apontando para o insumo (ConteudoEquacao.insumoId). Esta tabela era a
// tentativa anterior do mesmo objetivo: um repositório sem tela própria,
// alimentado por um botão dentro do editor de equações e casado por NOME em
// minúsculas — o suficiente para o mesmo produto virar duas linhas com preços
// diferentes assim que alguém digitasse "Calcario".
//
// Zero callers desde a v2.42. Nada foi apagado: 'inv_precos' segue em
// KEYS_LISTA (cloud.ts) e o array segue no disco e na nuvem, intacto. Desligar
// o uso é reversível; apagar não é, e o histórico de preço de quem usou está
// aqui dentro. Não escreva código novo contra isto.
// ────────────────────────────────────────────────────────────────────────────
export interface PrecoProduto {
  id: string;
  produto: string;
  custoTonelada: number | null;   // R$/t do produto
  freteHa: number;                // R$/ha
  aplicacaoHa: number;            // R$/ha
  atualizadoEm: string;
}

export function getPrecosProdutos(): PrecoProduto[] {
  return loadFiltrado<PrecoProduto>('inv_precos').sort((a, b) => (a.produto || '').localeCompare(b.produto || ''));
}

// Upsert por NOME do produto (case-insensitive) — a "tabela única": salvar o mesmo
// produto atualiza o preço em vez de duplicar.
export function savePrecoProduto(p: Omit<PrecoProduto, 'id' | 'atualizadoEm'>): PrecoProduto {
  const lista = load<PrecoProduto>('inv_precos');
  const nome = (p.produto || '').trim();
  const idx = lista.findIndex(x => (x.produto || '').trim().toLowerCase() === nome.toLowerCase());
  const reg: PrecoProduto = comEmpresa({
    ...(idx >= 0 ? lista[idx] : { id: uid() }),
    ...p, produto: nome, atualizadoEm: new Date().toISOString(),
  });
  if (idx >= 0) lista[idx] = reg; else lista.push(reg);
  save('inv_precos', lista);
  return reg;
}

export function deletePrecoProduto(id: string) {
  save('inv_precos', load<PrecoProduto>('inv_precos').filter(p => p.id !== id));
}

// Marca uma grade para processar, desmarcando as outras do mesmo talhão+safra.
export function marcarParaProcessar(id: string) {
  const lista = load<GradeAmostragem>('inv_grades');
  const alvo = lista.find(g => g.id === id);
  if (!alvo) return;
  const metodoAlvo = alvo.metodo ?? 'grid';
  lista.forEach(g => {
    if (g.talhaoId === alvo.talhaoId && g.safra === alvo.safra && (g.metodo ?? 'grid') === metodoAlvo) {
      g.paraProcessar = g.id === id;
    }
  });
  save('inv_grades', lista);
}

// ── Config de etiquetas (modelo de folha + ajuste fino) ─────────────────────
// Fase 5: vive na Biblioteca > Preferências de Análise como item único
// (conteudo.tipo === 'etiqueta'). API pública inalterada — Configurações e os
// simuladores continuam usando get/saveConfigEtiqueta.
export interface ConfigEtiqueta { layoutId: string; dx: number; dy: number; }
const ETQ_PADRAO: ConfigEtiqueta = { layoutId: LAYOUT_PADRAO, dx: 0, dy: 0 };

function _itemEtiqueta(): ItemBiblioteca<ConteudoEtiqueta> | undefined {
  return bibListar<ConteudoEtiqueta>('preferencias-analise').find(i => i.conteudo?.tipo === 'etiqueta');
}

export function getConfigEtiqueta(): ConfigEtiqueta {
  const it = _itemEtiqueta();
  if (!it) return ETQ_PADRAO;
  return { layoutId: it.conteudo.layoutId, dx: it.conteudo.dx, dy: it.conteudo.dy };
}

export function saveConfigEtiqueta(c: ConfigEtiqueta) {
  if (typeof window === 'undefined') return;
  const conteudo: ConteudoEtiqueta = { tipo: 'etiqueta', layoutId: c.layoutId, dx: c.dx, dy: c.dy };
  const existente = _itemEtiqueta();
  if (existente) {
    bibAtualizar<ConteudoEtiqueta>('preferencias-analise', existente.id, { conteudo });
  } else {
    bibCriar<ConteudoEtiqueta>('preferencias-analise', {
      nome: 'Etiquetas (Pimaco)', conteudo, escopo: empresaAtivaId() ? 'empresa' : 'meu',
    });
  }
}

/**
 * A A4350 (55,8×99,0, 10/folha) virou a folha padrão da casa. Trocar só o
 * ETQ_PADRAO não chegaria em ninguém: quem já usou a tela tem o item de etiqueta
 * gravado na Biblioteca, e get/saveConfigEtiqueta leem de lá — o padrão novo só
 * valeria para instalação nova (mesma armadilha do seed idempotente por id).
 * Daí a migração one-shot. Zera o ajuste fino junto: dx/dy calibrados para OUTRA
 * folha não têm sentido nesta. Roda 1× — quem preferir outra folha troca em
 * Configurações › Etiquetas e a flag impede a migração de desfazer a escolha.
 */
export function migrarEtiquetaPadraoA4350() {
  if (typeof window === 'undefined') return;
  const FLAG = 'inv_migrado_etq_a4350_v1';
  if (localStorage.getItem(FLAG) === '1') return;
  const it = _itemEtiqueta();
  if (it && it.conteudo.layoutId !== LAYOUT_PADRAO) {
    bibAtualizar<ConteudoEtiqueta>('preferencias-analise', it.id, {
      conteudo: { tipo: 'etiqueta', layoutId: LAYOUT_PADRAO, dx: 0, dy: 0 },
    });
  }
  localStorage.setItem(FLAG, '1');
}

// ── Variáveis de Análise (catálogo, tipo "Preferências de Análise") ─────────
// Cadastro editável das variáveis dos laudos (sigla/nome/unidade/sinônimos/usar).
// Semeado a partir do ELEMENTOS_LAB fixo; itens vivem na Biblioteca (categoria
// preferencias-analise, conteudo.tipo === 'variavel'). Os ids do seed são as
// CHAVES usadas em laudos/legendas/padrões — por isso não podem ser excluídos
// (só desativados); variáveis criadas pelo usuário podem.
export interface VariavelAnalise {
  id: string;
  sigla: string;
  nome: string;
  unidade: string;
  sinonimos: string[];
  usar: boolean;
  ordem: number;
  casasDecimais?: number;   // nº de casas na EXIBIÇÃO (undefined = padrão automático)
}

// Casas decimais configuradas para uma variável (undefined = padrão automático).
export function casasDecimaisVariavel(id: string): number | undefined {
  return getVariaveisAnalise().find(v => v.id === id)?.casasDecimais;
}

// Formata o valor de uma variável respeitando as casas decimais configuradas.
// Sem configuração, usa `padrao(v)` (comportamento atual) — "manter como está".
export function formatarValorVariavel(id: string, v: number, padrao: (v: number) => string): string {
  const cd = casasDecimaisVariavel(id);
  if (cd == null || !isFinite(v)) return padrao(v);
  return v.toLocaleString('pt-BR', { minimumFractionDigits: cd, maximumFractionDigits: cd });
}

const VAR_SEED_INFO: Record<string, { nome: string; unidade: string }> = {
  ph: { nome: 'Acidez (pH)', unidade: '' },
  p: { nome: 'Fósforo', unidade: 'mg/dm³' },
  k: { nome: 'Potássio', unidade: 'cmolc/dm³' },
  ca: { nome: 'Cálcio', unidade: 'cmolc/dm³' },
  mg: { nome: 'Magnésio', unidade: 'cmolc/dm³' },
  al: { nome: 'Alumínio', unidade: 'cmolc/dm³' },
  ctc: { nome: 'CTC (pH 7)', unidade: 'cmolc/dm³' },
  v: { nome: 'Saturação por Bases', unidade: '%' },
  m: { nome: 'Saturação por Alumínio', unidade: '%' },
  mo: { nome: 'Matéria Orgânica', unidade: 'g/dm³' },
  s: { nome: 'Enxofre', unidade: 'mg/dm³' },
  b: { nome: 'Boro', unidade: 'mg/dm³' },
  zn: { nome: 'Zinco', unidade: 'mg/dm³' },
  cu: { nome: 'Cobre', unidade: 'mg/dm³' },
  mn: { nome: 'Manganês', unidade: 'mg/dm³' },
  textura: { nome: 'Textura (Argila)', unidade: '%' },
};
export const VARIAVEIS_SEED: VariavelAnalise[] = ELEMENTOS_LAB.map((el, i) => ({
  id: el.id, sigla: el.simbolo,
  nome: VAR_SEED_INFO[el.id]?.nome ?? el.simbolo,
  unidade: VAR_SEED_INFO[el.id]?.unidade ?? '',
  sinonimos: [...el.sinonimos], usar: true, ordem: i,
}));
const VAR_SEED_IDS = new Set(VARIAVEIS_SEED.map(v => v.id));

function _itensVariaveis(): ItemBiblioteca<ConteudoVariavel>[] {
  return bibListar<ConteudoVariavel>('preferencias-analise').filter(i => i.conteudo?.tipo === 'variavel');
}
function _deConteudo(c: ConteudoVariavel): VariavelAnalise {
  return { id: c.varId, sigla: c.sigla, nome: c.nome, unidade: c.unidade, sinonimos: c.sinonimos ?? [], usar: c.usar !== false, ordem: c.ordem ?? 999, casasDecimais: c.casasDecimais };
}

// Semeia o catálogo na 1ª abertura (idempotente; só quando não há nenhuma variável).
export function garantirVariaveisAnalise() {
  if (typeof window === 'undefined' || _itensVariaveis().length > 0) return;
  for (const v of VARIAVEIS_SEED) {
    bibCriar<ConteudoVariavel>('preferencias-analise', {
      nome: `Variável: ${v.sigla}`,
      conteudo: { tipo: 'variavel', varId: v.id, sigla: v.sigla, nome: v.nome, unidade: v.unidade, sinonimos: v.sinonimos, usar: true, ordem: v.ordem },
      escopo: empresaAtivaId() ? 'empresa' : 'meu',
    });
  }
}

// Semeia as variáveis COMPLEMENTARES (lista InCeres — src/constants/
// variaveisSeedComplementar.ts) que ainda não existem no catálogo. Idempotente
// POR ID (não pela flag): roda em qualquer navegador sem duplicar — inclusive
// contra o que veio da nuvem. Só adiciona com o catálogo já materializado; se
// vazio, materializa o seed básico antes. Novas entram como CADASTRADAS; o
// "usar" de cada uma (ativa/inativa) vem do próprio seed complementar.
export function garantirVariaveisComplementares() {
  if (typeof window === 'undefined') return;
  garantirVariaveisAnalise();
  const itens = _itensVariaveis();
  if (itens.length === 0) return;   // catálogo ainda não hidratado — tenta no próximo boot
  const existentes = new Set(itens.map(i => i.conteudo.varId));
  const ordemDe = (id: string) => itens.find(i => i.conteudo.varId === id)?.conteudo.ordem;
  let prox = Math.max(99, ...itens.map(i => i.conteudo.ordem ?? 0)) + 1;
  for (const v of VARIAVEIS_COMPLEMENTARES) {
    if (existentes.has(v.id)) continue;
    const base = v.aposId != null ? ordemDe(v.aposId) : undefined;
    const ordem = base != null ? base + 0.5 : prox++;
    bibCriar<ConteudoVariavel>('preferencias-analise', {
      nome: `Variável: ${v.sigla}`,
      conteudo: { tipo: 'variavel', varId: v.id, sigla: v.sigla, nome: v.nome, unidade: v.unidade, sinonimos: v.sinonimos, usar: v.usar, ordem, casasDecimais: v.casasDecimais },
      escopo: empresaAtivaId() ? 'empresa' : 'meu',
    });
  }
}

// Sinônimos do SEED entram no catálogo JÁ MATERIALIZADO (união; nunca remove os
// que o usuário criou). Sem isto, sinônimo novo só valia para instalação nova:
// garantirVariaveisAnalise/Complementares são idempotentes POR ID e nunca tocam
// no que já existe. Caso real (05/08/2026): 'mos' e 'pres' — os nomes que o laudo
// InCeres usa para MO e P — continuariam sem mapear em todo mundo que já usa o app.
export function migrarSinonimosSeedV1() {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem('inv_migrado_sinonimos_seed_v1') === '1') return;
  const itens = _itensVariaveis();
  if (itens.length === 0) return;   // catálogo ainda não hidratado — tenta no próximo boot
  const doSeed = new Map<string, string[]>();
  for (const v of VARIAVEIS_SEED) doSeed.set(v.id, v.sinonimos);
  for (const v of VARIAVEIS_COMPLEMENTARES) doSeed.set(v.id, v.sinonimos);
  for (const it of itens) {
    const base = doSeed.get(it.conteudo.varId);
    if (!base?.length) continue;
    const atuais = it.conteudo.sinonimos ?? [];
    const faltando = base.filter(s => !atuais.includes(s));
    if (faltando.length === 0) continue;
    bibAtualizar<ConteudoVariavel>('preferencias-analise', it.id, {
      conteudo: { ...it.conteudo, sinonimos: [...atuais, ...faltando] },
    });
  }
  localStorage.setItem('inv_migrado_sinonimos_seed_v1', '1');
}

// Catálogo completo (fallback = seed em memória, p/ quem nunca abriu o painel).
export function getVariaveisAnalise(): VariavelAnalise[] {
  const itens = _itensVariaveis();
  let base = itens.length === 0
    ? [...VARIAVEIS_SEED]
    : itens.map(i => _deConteudo(i.conteudo)).sort((a, b) => a.ordem - b.ordem || a.sigla.localeCompare(b.sigla));
  // Endurecimento: se alguma corrida de seed/sync tiver criado a MESMA variável
  // 2×, deduplica por id na leitura (fica a primeira = menor ordem).
  const vistos = new Set<string>();
  base = base.filter(v => (vistos.has(v.id) ? false : (vistos.add(v.id), true)));
  // Garante a CTC EFETIVA (derivada, sigla CTCe) no catálogo — sem depender de
  // seed/migração — para ela aparecer nos Perfis (Legendas por elemento) e demais
  // listas de variáveis. sinônimos vazios: NUNCA é auto-mapeada de coluna de arquivo
  // (é sempre calculada, ver lab.ts). Ordenada logo após a CTC (T).
  if (!base.some(v => v.id === 't')) {
    const ordemCtc = base.find(v => v.id === 'ctc')?.ordem ?? 6;
    base.push({ id: 't', sigla: 'CTCe', nome: 'CTC efetiva', unidade: 'cmolc/dm³', sinonimos: [], usar: true, ordem: ordemCtc + 0.5 });
    base.sort((a, b) => a.ordem - b.ordem || a.sigla.localeCompare(b.sigla));
  }
  return base;
}
export function getVariaveisAtivas(): VariavelAnalise[] {
  return getVariaveisAnalise().filter(v => v.usar);
}

export function saveVariavelAnalise(v: VariavelAnalise) {
  garantirVariaveisAnalise();  // edição implica materializar o seed
  // TODAS as ocorrências do varId, não a primeira: se o catálogo tiver a mesma
  // variável duplicada (corrida de seed em duas máquinas), gravar só numa deixa a
  // gêmea com o valor velho — e quem lê ordena e fica com a de menor `ordem`, que
  // pode ser justamente a que não foi atualizada. A edição "não pegava".
  const itens = _itensVariaveis().filter(i => i.conteudo.varId === v.id);
  const conteudo: ConteudoVariavel = { tipo: 'variavel', varId: v.id, sigla: v.sigla, nome: v.nome, unidade: v.unidade, sinonimos: v.sinonimos, usar: v.usar, ordem: v.ordem, casasDecimais: v.casasDecimais };
  if (itens.length === 0) bibCriar<ConteudoVariavel>('preferencias-analise', { nome: `Variável: ${v.sigla}`, conteudo, escopo: empresaAtivaId() ? 'empresa' : 'meu' });
  else for (const i of itens) bibAtualizar<ConteudoVariavel>('preferencias-analise', i.id, { nome: `Variável: ${v.sigla}`, conteudo });
}

// Ordem PADRÃO dos elementos de fertilidade (pedido do usuário 23/07/2026) — vira
// a ordem do catálogo, que comanda o Perfil e o relatório. As demais variáveis
// (micros extras, variantes, relações…) entram depois, preservando a ordem relativa.
const ORDEM_PADRAO_FERT: string[] = [
  'mo', 'ph', 'm', 'v', 'ctc', 'p', 'k', 'satk', 'ca', 'mg', 'satca', 'satmg', 't',
  's', 'b', 'zn', 'cu', 'mn', 'fe', 'al', 'textura',
];

// Aplica a ORDEM_PADRAO_FERT ao catálogo UMA VEZ (flag). Depois disso o usuário
// reordena com as setas (Perfil) e essas mudanças NÃO são sobrescritas.
export function migrarOrdemPadraoFertV1() {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem('inv_migrado_ordem_fert_v1') === '1') return;
  const vars = getVariaveisAnalise();
  if (vars.length === 0) return;   // catálogo ainda não hidratado — tenta no próximo boot
  const idx = new Map(ORDEM_PADRAO_FERT.map((id, i) => [id, i]));
  const rest = vars.filter(v => !idx.has(v.id)).sort((a, b) => a.ordem - b.ordem);
  for (const v of vars) {
    const nova = idx.has(v.id) ? idx.get(v.id)! : ORDEM_PADRAO_FERT.length + rest.findIndex(r => r.id === v.id);
    if (v.ordem !== nova) saveVariavelAnalise({ ...v, ordem: nova });
  }
  localStorage.setItem('inv_migrado_ordem_fert_v1', '1');
}

// Move uma variável ATIVA uma posição para cima (-1) ou baixo (+1) na ordem do
// catálogo, trocando a `ordem` com a vizinha ativa. Essa ordem é o padrão da
// ordem dos elementos no relatório (ver relatorioDados). Idempotente nas pontas.
export function reordenarVariavelAtiva(id: string, dir: -1 | 1) {
  // Reordena a LISTA e renumera 0..n-1 — NÃO permuta os dois valores de `ordem`.
  // A permuta antiga jogava o item para o topo sempre que havia empate de `ordem`
  // (ou varId duplicado): com empate quem manda na posição é o desempate por
  // sigla, então o valor recebido na troca levava o item para qualquer lugar.
  // Ver lib/ordemCatalogo.ts — npm run teste:ordem.
  const todas = getVariaveisAnalise();   // catálogo inteiro, na ordem exibida
  const nova = moverNaOrdem(todas, id, dir);
  if (!nova) return;                     // ponta da lista: nada a fazer
  const mudou = renumerar(nova);
  if (mudou.length === 0) return;
  // UMA gravação por item mudado, pelo caminho normal (saveVariavelAnalise), que
  // já sabe achar/criar/atualizar as duplicatas. Houve aqui uma versão em LOTE
  // (bibAtualizarVarios) que travou a reordenação inteira — nada se movia e nada
  // dava erro. Se voltar a incomodar a performance, medir antes: correção primeiro.
  for (const { item, ordem } of mudou) saveVariavelAnalise({ ...item, ordem });
}

// Cria uma variável NOVA (id derivado da sigla, único). Devolve a variável criada.
export function novaVariavelAnalise(dados: Omit<VariavelAnalise, 'id' | 'ordem'>): VariavelAnalise {
  garantirVariaveisAnalise();
  const existentes = getVariaveisAnalise();
  let id = normLab(dados.sigla) || 'var';
  while (existentes.some(v => v.id === id)) id += 'x';
  const v: VariavelAnalise = { ...dados, id, ordem: Math.max(0, ...existentes.map(x => x.ordem)) + 1 };
  saveVariavelAnalise(v);
  return v;
}

// Exclui variável criada pelo usuário. As do seed não podem (são chave de dados
// existentes) — devolve false; desative com usar=false.
export function deleteVariavelAnalise(id: string): boolean {
  if (VAR_SEED_IDS.has(id)) return false;
  const it = _itensVariaveis().find(i => i.conteudo.varId === id);
  if (it) bibExcluir('preferencias-analise', it.id);
  return true;
}

// A variável do catálogo (Preferências de Análise) por id — sigla/nome/unidade
// para exibição. É a FONTE DA VERDADE do título dos relatórios: quem edita a
// variável na Biblioteca muda o que sai no PDF. null = id fora do catálogo.
export function variavelDeAnalise(id: string): VariavelAnalise | null {
  return getVariaveisAnalise().find(x => x.id === id) ?? null;
}

// Sigla p/ exibição — catálogo primeiro, fallback na lista fixa (ids antigos).
export function siglaVariavel(id: string): string {
  const v = getVariaveisAnalise().find(x => x.id === id);
  return v?.sigla ?? simboloElemento(id);
}

// ── Laboratório: perfis de mapeamento + importações de resultados ───────────
export interface PerfilLab {
  id: string;
  nome: string;              // ex: "Fundação ABC"
  config: PerfilLabConfig;   // de-para de colunas + extração (ver lib/lab.ts)
  criadoEm: string;
}

export interface ImportacaoLab {
  id: string;
  talhaoId: string;
  safra: string;
  gradeId: string;
  laboratorio: string;        // nome gravado no import (retrocompat / reserva)
  laboratorioId?: string;     // FK p/ Biblioteca → Laboratórios: a fonte da verdade
  campanha?: string;
  resultados: ResultadoAmostra[];
  elementos: string[];
  criadoEm: string;
  // Período (Ano/Época) — DERIVADOS da Data de referência (não da criação). O
  // store é a autoridade: recalcula ano/epoca a partir de dataReferencia.
  dataReferencia?: string;   // 'YYYY-MM-DD' — data operacional da amostragem/laudo
  ano?: number;              // = ano(dataReferencia)
  epoca?: Epoca;             // '1' (jan–jun) | '2' (jul–dez)
  atualizadoEm?: string;     // auditoria (distinto de criadoEm)
}

// Wrappers de retrocompat (Fase 3): perfis de laboratório agora vivem dentro
// da Biblioteca de Padrões (categoria 'laboratorios'). A forma de PerfilLab e
// a API pública continuam iguais — LabImportSection não precisa mudar.

function _itemParaPerfilLab(it: ItemBiblioteca<ConteudoLaboratorio>): PerfilLab {
  return { id: it.id, nome: it.nome, config: it.conteudo.config, criadoEm: it.criadoEm };
}

// ── Laboratórios de análise (categoria 'labs') ──────────────────────────────
// QUEM assina o laudo — separado do perfil de planilha, que diz COMO ler o
// arquivo. O nome daqui é o que sai na coluna FONTE do relatório.

// `nome` IDENTIFICA a entrada (é o que aparece nas listas e no seletor da
// Fertilidade); `nomeFonte` é o que sai IMPRESSO na coluna FONTE do relatório.
// Existem separados porque o mesmo laboratório costuma ter mais de um padrão de
// planilha: duas entradas distinguíveis na tela, um nome só no papel.
export interface LaboratorioAnalise { id: string; nome: string; nomeFonte?: string; cidade?: string; contato?: string }

/** O que vai IMPRESSO — o nome de fonte quando houver, senão a identificação. */
export const fonteDoLaboratorio = (l: Pick<LaboratorioAnalise, 'nome' | 'nomeFonte'>): string =>
  (l.nomeFonte ?? '').trim() || l.nome;

export function getLaboratorios(): LaboratorioAnalise[] {
  return bibListar<ConteudoLabAnalise>('labs')
    .filter(i => i.ativo)
    .map(i => ({ id: i.id, nome: i.nome, nomeFonte: i.conteudo?.nomeFonte, cidade: i.conteudo?.cidade, contato: i.conteudo?.contato }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Cria (ou devolve o existente) pelo nome — upsert, para não duplicar. */
export function salvarLaboratorio(nome: string, extra?: ConteudoLabAnalise): LaboratorioAnalise | null {
  const n = nome.trim();
  if (!n) return null;
  const existente = bibListar<ConteudoLabAnalise>('labs').find(i => i.nome.toLowerCase() === n.toLowerCase());
  if (existente) {
    if (extra) bibAtualizar<ConteudoLabAnalise>('labs', existente.id, { conteudo: { ...existente.conteudo, ...extra } });
    return { id: existente.id, nome: existente.nome };
  }
  const it = bibCriar<ConteudoLabAnalise>('labs', {
    nome: n, conteudo: extra ?? {}, escopo: empresaAtivaId() ? 'empresa' : 'meu',
  });
  return { id: it.id, nome: it.nome };
}

/**
 * Semeia o cadastro com os laboratórios que JÁ aparecem nos laudos importados,
 * para o usuário não começar com a lista vazia e o histórico não se perder.
 *
 * Ignora a etiqueta "Novo laboratório": ela não é um laboratório, é o texto que
 * a importação em modo automático gravava quando ninguém digitava o nome — foi
 * ela que apareceu como FONTE num relatório e originou este cadastro.
 */
export function migrarLaboratoriosDosLaudosV1() {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem('inv_migrado_labs_v1') === '1') return;
  if (cloudAindaNaoHidratou()) return;   // sem a nuvem, semearia duplicata
  const nomes = new Set(
    load<ImportacaoLab>('inv_lab')
      .map(i => (i.laboratorio ?? '').trim())
      .filter(n => n && n.toLowerCase() !== 'novo laboratório'),
  );
  for (const n of nomes) salvarLaboratorio(n);
  localStorage.setItem('inv_migrado_labs_v1', '1');
}

/** Quantos laudos apontam para este laboratório — o custo de excluí-lo. */
export function contarLaudosDoLaboratorio(labId: string): number {
  return load<ImportacaoLab>('inv_lab').filter(i => i.laboratorioId === labId).length;
}

/**
 * FUNDE dois laboratórios: os laudos do `deId` passam a apontar para o `paraId`
 * e o `deId` é excluído. Devolve quantos laudos foram remanejados.
 *
 * Existe porque o cadastro nasceu semeado dos laudos antigos, que guardavam o
 * nome do PERFIL de planilha — a mesma Fundação ABC entrou três vezes ("via
 * InCeres", "(planilha)", limpa). Só renomear não resolve: geraria três itens
 * homônimos. Aqui as três viram uma sem nenhum laudo perder a referência.
 */
export function fundirLaboratorios(deId: string, paraId: string): number {
  if (deId === paraId) return 0;
  if (!getLaboratorios().some(l => l.id === paraId)) return 0;
  const lista = load<ImportacaoLab>('inv_lab');
  const destino = getLaboratorios().find(l => l.id === paraId)!;
  let n = 0;
  const agora = new Date().toISOString();
  for (const i of lista) {
    if (i.laboratorioId !== deId) continue;
    i.laboratorioId = destino.id;
    i.laboratorio = fonteDoLaboratorio(destino);
    i.atualizadoEm = agora;
    n++;
  }
  if (n) { save('inv_lab', lista); notificarLab(); }
  bibExcluir('labs', deId);
  return n;
}

/** Renomeia / edita um laboratório do cadastro. */
export function atualizarLaboratorio(id: string, dados: { nome?: string; nomeFonte?: string; cidade?: string; contato?: string; observacoes?: string }) {
  const it = bibListar<ConteudoLabAnalise>('labs').find(i => i.id === id);
  if (!it) return;
  const { nome, ...conteudo } = dados;
  const novoNome = nome?.trim() || it.nome;
  bibAtualizar<ConteudoLabAnalise>('labs', id, {
    ...(nome?.trim() ? { nome: nome.trim() } : {}),
    conteudo: { ...it.conteudo, ...conteudo },
  });
  // O snapshot gravado no laudo é reserva (PDF gerado offline), e o que ele
  // guarda é o nome IMPRESSO — não a identificação interna.
  const impresso = fonteDoLaboratorio({ nome: novoNome, nomeFonte: conteudo.nomeFonte ?? it.conteudo?.nomeFonte });
  const lista = load<ImportacaoLab>('inv_lab');
  let mudou = false;
  for (const i of lista) if (i.laboratorioId === id && i.laboratorio !== impresso) { i.laboratorio = impresso; mudou = true; }
  if (mudou) { save('inv_lab', lista); notificarLab(); }
}

/**
 * Nome do laboratório de um laudo, para exibição — é o que sai como FONTE.
 *
 * O CADASTRO manda: se o laudo aponta para um item da Biblioteca, o nome vem de
 * lá, então renomear o laboratório corrige todos os laudos de uma vez. O nome
 * gravado no import é só reserva (laudo antigo, anterior ao cadastro).
 */
export function nomeLaboratorioDoLaudo(imp: Pick<ImportacaoLab, 'laboratorio' | 'laboratorioId'> | null | undefined): string {
  if (!imp) return '';
  const cad = imp.laboratorioId ? getLaboratorios().find(l => l.id === imp.laboratorioId) : null;
  return (cad ? fonteDoLaboratorio(cad) : '') || imp.laboratorio || '';
}

export function getPerfisLab(): PerfilLab[] {
  const itens = bibListar<ConteudoLaboratorio>('laboratorios');
  return itens
    .filter(i => i.ativo)
    .map(_itemParaPerfilLab)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

// Cria ou atualiza o perfil pelo nome do laboratório (upsert).
export function salvarPerfilLab(nome: string, config: PerfilLabConfig): PerfilLab {
  const nomeTrim = nome.trim();
  const ativa = empresaAtivaId();
  const u = uidUsuario();
  const escopo: 'meu' | 'empresa' = ativa ? 'empresa' : 'meu';

  const meus = bibListar<ConteudoLaboratorio>('laboratorios');
  const existente = meus.find(i => i.nome.toLowerCase() === nomeTrim.toLowerCase()
    && (escopo === 'empresa' ? i.escopo === 'empresa' && i.empresaId === ativa
                              : i.escopo === 'meu' && i.donoUsuarioId === u));
  if (existente) {
    bibAtualizar<ConteudoLaboratorio>('laboratorios', existente.id, { conteudo: { config } });
    return { id: existente.id, nome: existente.nome, config, criadoEm: existente.criadoEm };
  }
  const novo = bibCriar<ConteudoLaboratorio>('laboratorios', {
    nome: nomeTrim,
    conteudo: { config },
    escopo,
  });
  return _itemParaPerfilLab(novo);
}

export function deletePerfilLab(id: string) {
  bibExcluir('laboratorios', id);
}

// Injeta as colunas CALCULADAS (CTCe/K%/Ca%/Mg%) na LEITURA da importação, para
// que importações antigas (feitas antes das colunas calculadas) também as exponham
// — na interpolação (Fertilidade), relatórios etc. Não persiste (recomputa do
// estado atual, idempotente); só toca o objeto quando há algo novo a acrescentar.
function importacaoComDerivados(imp: ImportacaoLab): ImportacaoLab {
  const resultados = imp.resultados.map(r => {
    const valores = { ...r.valores };
    calcularDerivados(valores);
    return { ...r, valores };
  });
  const derivPresentes = [...DERIVADOS_IDS].filter(id => resultados.some(r => r.valores[id] != null));
  if (derivPresentes.every(id => imp.elementos.includes(id)) && derivPresentes.length === 0) return imp;
  const elementos = [...new Set([...imp.elementos, ...derivPresentes])];
  return { ...imp, resultados, elementos };
}

export function getImportacoesLab(talhaoId?: string, safra?: string): ImportacaoLab[] {
  let all = loadFiltrado<ImportacaoLab>('inv_lab');
  if (talhaoId) all = all.filter(i => i.talhaoId === talhaoId);
  if (safra) {
    // Filtra por ANO (não pela string exata da safra): um laudo lançado com Data
    // de referência de 2024 aparece sob o Ano 2024, mesmo que a "safra" ativa na
    // hora fosse outra. Fallback p/ registros sem `ano`: deriva da safra gravada.
    // Se a safra não parseia p/ ano, cai na igualdade de string (retrocompat).
    const anoSel = anoDaSafra(safra);
    all = anoSel == null
      ? all.filter(i => i.safra === safra)
      : all.filter(i => (i.ano ?? anoDaSafra(i.safra)) === anoSel);
  }
  return all.map(importacaoComDerivados).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
}

// Avisa as telas (Fertilidade etc.) que a lista de importações de laudo mudou —
// senão a aba Fertilidade só via a nova importação ao sair e voltar.
function notificarLab() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('inv:lab'));
}

// Ano/Época SEMPRE recalculados da Data de referência (autoridade no store —
// ignora ano/epoca que a UI porventura mande). Data ausente/ inválida → hoje-SP.
function comPeriodo<T extends { dataReferencia?: string; ano?: number; epoca?: Epoca }>(reg: T): T {
  const dataRef = reg.dataReferencia && dataValida(reg.dataReferencia) ? reg.dataReferencia : hojeSaoPauloISO();
  return { ...reg, dataReferencia: dataRef, ano: anoDeData(dataRef) ?? undefined, epoca: epocaDeData(dataRef) ?? undefined };
}

export function saveImportacaoLab(i: Omit<ImportacaoLab, 'id' | 'criadoEm'>): ImportacaoLab {
  const lista = load<ImportacaoLab>('inv_lab');
  const agora = new Date().toISOString();
  const nova: ImportacaoLab = comEmpresa(comPeriodo({ ...i, id: uid(), criadoEm: agora, atualizadoEm: agora }));
  lista.push(nova);
  save('inv_lab', lista);
  notificarLab();
  return nova;
}

/**
 * Troca o LABORATÓRIO de um laudo já importado (aba Fertilidade).
 *
 * Corrigir sem reimportar a planilha é o ponto: laudo gravado com a etiqueta
 * "Novo laboratório" ia parar na FONTE do relatório, e reimportar só para
 * arrumar o nome é caro. Grava o id (autoridade) e o nome (o que se lê offline).
 */
export function definirLaboratorioLab(id: string, laboratorioId: string): ImportacaoLab | null {
  const lab = getLaboratorios().find(l => l.id === laboratorioId);
  if (!lab) return null;
  const lista = load<ImportacaoLab>('inv_lab');
  const i = lista.find(x => x.id === id);
  if (!i) return null;
  i.laboratorioId = lab.id;
  i.laboratorio = fonteDoLaboratorio(lab);   // snapshot = o que sai impresso
  i.atualizadoEm = new Date().toISOString();
  save('inv_lab', lista);
  notificarLab();
  return i;
}

// Altera a Data de referência de um laudo já salvo e RECALCULA Ano/Época.
export function atualizarDataReferenciaLab(id: string, dataReferencia: string): ImportacaoLab | null {
  const lista = load<ImportacaoLab>('inv_lab');
  const i = lista.find(x => x.id === id);
  if (!i) return null;
  Object.assign(i, comPeriodo({ ...i, dataReferencia }), { atualizadoEm: new Date().toISOString() });
  save('inv_lab', lista);
  notificarLab();
  return i;
}

export function deleteImportacaoLab(id: string) {
  save('inv_lab', load<ImportacaoLab>('inv_lab').filter(i => i.id !== id));
  notificarLab();
}

// Migração idempotente: preenche dataReferencia/ano/epoca nos laudos antigos.
// Fallback documentado (não há data de amostragem própria em ImportacaoLab): usa
// a data de CRIAÇÃO (criadoEm) — mas força o ANO para o da SAFRA legada ("26/27"
// → 2026, primeiro número) preservando o mês/dia, para não re-anoar registros e
// manter Ano coerente com a Data de referência. A época sai do mês da criação.
export function migrarImportacoesLabPeriodoV1(): void {
  const lista = load<ImportacaoLab>('inv_lab');
  let mudou = false;
  for (const i of lista) {
    if (i.dataReferencia && i.ano != null && i.epoca) continue;
    const criado = (i.criadoEm || hojeSaoPauloISO()).slice(0, 10);
    const anoSafra = anoDaSafra(i.safra);
    const base = anoSafra != null && partesData(criado) ? `${anoSafra}${criado.slice(4)}` : criado;
    i.dataReferencia = dataValida(base) ? base : hojeSaoPauloISO();
    const p = periodoDeData(i.dataReferencia);
    if (p) { i.ano = p.ano; i.epoca = p.epoca; }
    if (!i.atualizadoEm) i.atualizadoEm = i.criadoEm;
    mudou = true;
  }
  if (mudou) save('inv_lab', lista);
}

// ── MEAP: Ambientes Produtivos / Zonas de Manejo ────────────────────────────
// 1 AmbienteProdutivo por talhão (id = talhaoId). Fase M1: adoção das zonas já
// importadas + CV por zona (ver lib/meap/). Persistência no padrão da casa.

export function getAmbienteMeap(talhaoId: string): AmbienteProdutivo | null {
  return loadFiltrado<AmbienteProdutivo>('inv_meap_ambientes').find(a => a.talhaoId === talhaoId) ?? null;
}

export function saveAmbienteMeap(amb: AmbienteProdutivo): void {
  const lista = load<AmbienteProdutivo>('inv_meap_ambientes');
  const rec = comEmpresa({ ...amb });
  const idx = lista.findIndex(a => a.id === amb.id);
  if (idx >= 0) lista[idx] = rec; else lista.push(rec);
  save('inv_meap_ambientes', lista);
}

// Zoneamentos gerados (vários por talhão; um marcado como "padrão" = oficial).
// O padrão é gravado em talhao.zonasGeojson → a Amostragem gera o grid por zona.
export interface ZoneamentoMeap {
  id: string;
  talhaoId: string;
  nome: string;
  padrao: boolean;
  fc: GeoJSON.FeatureCollection;   // polígonos {id, zona, classe, areaHa, potencialRank}
  meta: { camadas: string[]; algoritmo: string; nPotenciais: number; areaMinHa: number; nZonas: number; nPoligonos?: number; cvMedio?: number | null; pesos?: Record<string, number>; chaves?: string[]; suavizacao?: SuavizacaoMeta; edicaoManual?: EdicaoManualMeta; importacao?: ImportacaoMeta; restauracao?: RestauracaoMeta };
  criadoEm: string;
}

// Restauração de uma versão anterior (spec §5: a original é SEMPRE preservada).
// Restaurar não apaga nem sobrescreve nada: copia a versão escolhida para o
// topo da linhagem como uma versão nova, apontando de onde veio.
export interface RestauracaoMeta {
  origemId: string;
  origemNome?: string;
  origemVersao?: number;   // nº da versão restaurada, como aparecia na tela
  data: string;            // ISO
  usuario?: string;
}

// Origem de um zoneamento IMPORTADO que virou Zoneamento Nativo. Guarda a
// LEITURA feita do arquivo (campo, direção, valor→classe) — é o que permite
// conferir depois por que uma zona ficou "Alta" sem ter o arquivo em mãos.
export interface ImportacaoMeta {
  arquivo?: string;              // nome do arquivo de origem
  formato?: string;              // kml | shp | geojson
  campoClasse: string;           // atributo lido como classe
  menorEhPior: boolean;          // 1 = pior zona (QGIS) ou 1 = melhor
  mapa: Record<string, string>;  // valor do arquivo → classe final
  nDescartados?: number;         // feições sem polígono/sem área
  data: string;                  // ISO
  usuario?: string;
}

// Uma operação do Editor Manual de Zonas (registro/auditoria — spec §3, §5).
export interface OperacaoEdicaoZona {
  tipo: 'unificar' | 'reclassificar' | 'dividir' | 'renumerar';
  data: string;                  // ISO (data + hora)
  usuario?: string;
  motivo?: string;               // opcional
  // detalhes por tipo
  zonas?: string[];              // ids envolvidos (unificar/dividir origem)
  classeFinal?: string;          // unificar/reclassificar → classe resultante
  classeOriginal?: string;       // reclassificar → classe antes
  partes?: number;               // dividir → nº de partes geradas
}

// Registro do Editor Manual aplicado (versão derivada — o original é preservado;
// a nova versão aponta a origem e carrega o log completo das operações).
export interface EdicaoManualMeta {
  operacoes: OperacaoEdicaoZona[];
  nUnificacoes: number;
  nReclassificacoes: number;
  nDivisoes: number;
  /** Renumerações de zona. Opcional: versões gravadas antes deste campo
   *  existirem não o têm, e a tela de versões trata ausente como 0. */
  nRenumeracoes?: number;
  origemId?: string;             // zoneamento de origem (versão restaurável)
  origemNome?: string;
  data: string;                  // ISO
  usuario?: string;
}

// Registro de uma suavização de limites aplicada (versão derivada — o original
// NUNCA é sobrescrito; a nova versão aponta a origem por id/nome).
export interface SuavizacaoMeta {
  nivel: string;                 // leve | moderado | intenso | personalizado
  toleranciaM: number;
  iteracoes: number;
  manterLimiteExterno: boolean;
  fragMinHa: number;
  larguraMinM: number;
  diffTotalHa: number;
  maiorDiffPct: number;
  vertAntes: number;
  vertDepois: number;
  origemId?: string;             // zoneamento de origem (versão original)
  origemNome?: string;
  data: string;                  // ISO
  usuario?: string;
  observacoes?: string;
}

export function getZoneamentosMeap(talhaoId: string): ZoneamentoMeap[] {
  return loadFiltrado<ZoneamentoMeap>('inv_meap_zoneamentos')
    .filter(z => z.talhaoId === talhaoId)
    .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
}

export function saveZoneamentoMeap(z: Omit<ZoneamentoMeap, 'id' | 'criadoEm'>): ZoneamentoMeap {
  const lista = load<ZoneamentoMeap>('inv_meap_zoneamentos');
  const novo: ZoneamentoMeap = comEmpresa({ ...z, id: uid(), criadoEm: new Date().toISOString() });
  lista.push(novo);
  save('inv_meap_zoneamentos', lista);
  return novo;
}

// Renomear uma versão (só o rótulo — geometria, meta e histórico ficam).
export function renameZoneamentoMeap(id: string, nome: string): void {
  const lista = load<ZoneamentoMeap>('inv_meap_zoneamentos');
  const z = lista.find(x => x.id === id);
  if (!z) return;
  z.nome = nome;
  save('inv_meap_zoneamentos', lista);
}

export function deleteZoneamentoMeap(id: string): void {
  save('inv_meap_zoneamentos', load<ZoneamentoMeap>('inv_meap_zoneamentos').filter(z => z.id !== id));
}

// Marca um zoneamento como padrão (desmarca os outros do talhão) e grava as
// zonas dele em talhao.zonasGeojson — é o que a Amostragem (modo Zonas) usa.
export function setZoneamentoPadraoMeap(talhaoId: string, id: string): void {
  const lista = load<ZoneamentoMeap>('inv_meap_zoneamentos');
  lista.forEach(z => { if (z.talhaoId === talhaoId) z.padrao = z.id === id; });
  save('inv_meap_zoneamentos', lista);
  const padrao = lista.find(z => z.id === id && z.talhaoId === talhaoId);
  if (padrao) updateTalhao(talhaoId, { zonasGeojson: JSON.stringify(padrao.fc) });
}

// Remove a ADOÇÃO de zonas do talhão (o bloco "Zonas adotadas"): tira o padrão de
// qualquer zoneamento, apaga o Ambiente Produtivo e limpa talhao.zonasGeojson.
// NÃO apaga os zoneamentos salvos nem mapas — só "desadota" (a Amostragem por
// zona fica sem grade até adotar outro).
export function removerAdocaoMeap(talhaoId: string): void {
  const lista = load<ZoneamentoMeap>('inv_meap_zoneamentos');
  let mudou = false;
  lista.forEach(z => { if (z.talhaoId === talhaoId && z.padrao) { z.padrao = false; mudou = true; } });
  if (mudou) save('inv_meap_zoneamentos', lista);
  save('inv_meap_ambientes', load<AmbienteProdutivo>('inv_meap_ambientes').filter(a => a.talhaoId !== talhaoId));
  updateTalhao(talhaoId, { zonasGeojson: '' });
}

// ── Legendas Agronômicas (motor de legendas) ──────────────────────────────
// Repositório reutilizável de legendas para mapas de fertilidade, micros e
// textura. Cada legenda é independente do mapa; o usuário escolhe qual aplicar.

function notificarLegendas() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('inv:legendas'));
  }
}

export function getLegendas(): Legenda[] {
  // Legendas 'sistema' (oficiais) são visíveis a todas as empresas e não
  // recebem empresaId. As demais seguem o filtro por empresa (auto-marca legados).
  const todas = load<Legenda>('inv_legendas');
  const sistema = todas.filter(l => l.escopo === 'sistema');
  const naoSistema = todas.filter(l => l.escopo !== 'sistema');
  const ativa = empresaAtivaId();
  if (!ativa) return [...sistema, ...naoSistema];
  let mudou = false;
  for (const l of naoSistema) {
    const le = l as Legenda & { empresaId?: string };
    if (!le.empresaId) { le.empresaId = ativa; mudou = true; }
  }
  if (mudou) save('inv_legendas', todas);
  const daEmpresa = naoSistema.filter(l => (l as Legenda & { empresaId?: string }).empresaId === ativa);
  return [...sistema, ...daEmpresa];
}

export function getLegendasPorAtributo(atributoId: string): Legenda[] {
  return ordenarLegendasDoAtributo(getLegendas().filter(l => l.atributoId === atributoId));
}

// Marca UMA legenda como padrão do atributo dela (e desmarca as irmãs). Sem o
// segundo argumento ALTERNA — passar uma já marcada desmarca (volta ao critério
// automático). Com `valor` explícito, não alterna: usado ao salvar uma legenda
// oficial editada, que precisa PASSAR a valer, nunca deixar de valer.
export function definirLegendaPadrao(id: string, valor?: boolean): void {
  const lista = load<Legenda>('inv_legendas');
  const alvo = lista.find(l => l.id === id);
  if (!alvo) return;
  const virar = valor ?? !alvo.padrao;
  const agora = new Date().toISOString();
  for (const l of lista) {
    if (l.atributoId !== alvo.atributoId) continue;
    const novo = virar && l.id === id;
    if (!!l.padrao === novo) continue;
    l.padrao = novo || undefined;
    l.atualizadoEm = agora;
  }
  save('inv_legendas', lista);
  notificarLegendas();
}

// ── Presets de estilo (divisão de classes) da recomendação ────────────────
// Presets do usuário (os do sistema são constantes em estiloPresets.ts).
export function getPresetsEstilo(): PresetEstiloRec[] {
  return loadFiltrado<PresetEstiloRec>('inv_estilo_presets')
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}
export function savePresetEstilo(nome: string, estilo: EstiloRecomendacao): PresetEstiloRec {
  const lista = load<PresetEstiloRec>('inv_estilo_presets');
  const novo: PresetEstiloRec = comEmpresa({ id: uid(), nome, escopo: 'meu', estilo, criadoEm: new Date().toISOString() });
  lista.push(novo);
  save('inv_estilo_presets', lista);
  return novo;
}
export function deletePresetEstilo(id: string) {
  save('inv_estilo_presets', load<PresetEstiloRec>('inv_estilo_presets').filter(p => p.id !== id));
}

export function saveLegenda(l: Omit<Legenda, 'id' | 'criadoEm' | 'atualizadoEm'>): Legenda {
  const lista = load<Legenda>('inv_legendas');
  const agora = new Date().toISOString();
  const nova: Legenda = comEmpresa({ ...l, id: uid(), criadoEm: agora, atualizadoEm: agora });
  lista.push(nova);
  save('inv_legendas', lista);
  notificarLegendas();
  return nova;
}

// Upsert por id (usado pelo seed ABC: idempotente)
export function upsertLegenda(l: Legenda): Legenda {
  const lista = load<Legenda>('inv_legendas');
  const idx = lista.findIndex(x => x.id === l.id);
  if (idx >= 0) lista[idx] = comEmpresa({ ...l, atualizadoEm: new Date().toISOString() });
  else lista.push(comEmpresa(l));
  save('inv_legendas', lista);
  notificarLegendas();
  return l;
}

export function updateLegenda(id: string, patch: Partial<Omit<Legenda, 'id' | 'criadoEm'>>) {
  const lista = load<Legenda>('inv_legendas');
  const idx = lista.findIndex(l => l.id === id);
  if (idx >= 0) {
    lista[idx] = { ...lista[idx], ...patch, atualizadoEm: new Date().toISOString() };
    save('inv_legendas', lista);
    notificarLegendas();
  }
}

export function deleteLegenda(id: string) {
  save('inv_legendas', load<Legenda>('inv_legendas').filter(l => l.id !== id));
  notificarLegendas();
}

// ── Paletas de cor salvas (barras de cor reutilizáveis) ──────────────────────
// Guarda a sequência de pares (corInicio→corFim) das classes de uma legenda sob
// um NOME, para reaplicar rápido em outra legenda (importação de cores).
export interface Paleta {
  id: string;
  nome: string;
  cores: Array<[string, string]>;   // [corInicio, corFim] por classe
  criadoEm: string;
}

export function getPaletas(): Paleta[] {
  return loadFiltrado<Paleta>('inv_paletas').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function savePaleta(nome: string, cores: Array<[string, string]>): Paleta {
  const lista = load<Paleta>('inv_paletas');
  const nova: Paleta = comEmpresa({ id: uid(), nome: nome.trim() || 'Paleta', cores, criadoEm: new Date().toISOString() });
  lista.push(nova);
  save('inv_paletas', lista);
  return nova;
}

export function deletePaleta(id: string) {
  save('inv_paletas', load<Paleta>('inv_paletas').filter(p => p.id !== id));
}

// Seed das legendas oficiais APENAS num banco vazio (1º boot). Depois disso as
// legendas vivem no BANCO e são gerenciadas pelo usuário — o código não sobrescreve
// nem readiciona, para que editar/excluir uma legenda passe a valer (antes o seed
// rodava todo boot e revertia as alterações).
//
// ⚠ As legendas do seed têm id FIXO (sys_…, fabc_…). Semear grava por esses ids
// e o save() espelha na nuvem — ou seja, um seed indevido SOBRESCREVE a versão
// editada pelo usuário, em todas as máquinas. Por isso a lista vazia só autoriza
// semear quando dá para afirmar que ela está vazia DE VERDADE: sem nuvem
// configurada, ou com o boot da nuvem já concluído. Enquanto o boot não confirma
// (falhou, estourou os 12s do AppContext, ou ainda roda em 2º plano), "vazio"
// quer dizer "ainda não sei" — e semear aí é destrutivo.
export function seedLegendasSistema(seed: Legenda[]) {
  const lista = load<Legenda>('inv_legendas');
  if (!deveSemearLegendas(lista.length, cloudAindaNaoHidratou())) return;
  const novas = seed.map(oficial => {
    const item: Legenda = { ...oficial, escopo: 'sistema' };
    delete (item as Legenda & { empresaId?: string }).empresaId;
    return item;
  });
  save('inv_legendas', novas);
  notificarLegendas();
}

// Cria a legenda de CTC EFETIVA (atributoId 't', sigla CTCe) CLONANDO a de CTC
// (mesma unidade/escala), para a CTCe aparecer na interpolação da Fertilidade e
// poder ser usada nas equações. A cópia é 'empresa' (editável) — o usuário ajusta
// as faixas depois. Idempotente: se já houver uma legenda 't' (inclusive uma que
// o usuário apagou e não quer de volta → flag), não recria; se ainda não houver
// nenhuma de CTC (base não hidratada / usuário não usa CTC), tenta no próximo boot.
export function migrarLegendaCtceV1() {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem('inv_migrado_leg_ctce_v1') === '1') return;
  // A flag é POR NAVEGADOR. Numa máquina nova, rodar antes da nuvem hidratar
  // enxerga a lista parcial, não acha a CTCe que já existe lá e cria uma SEGUNDA
  // (id novo) — o merge da nuvem une as duas e nasce a legenda gêmea. Espera.
  if (cloudAindaNaoHidratou()) return;
  const todas = load<Legenda>('inv_legendas');
  if (todas.some(l => l.atributoId === 't')) { localStorage.setItem('inv_migrado_leg_ctce_v1', '1'); return; }
  const base = todas.find(l => l.atributoId === 'ctc');
  if (!base) return;   // sem CTC ainda — não queima a flag, tenta de novo depois
  const agora = new Date().toISOString();
  const nova: Legenda = comEmpresa({
    ...base,
    id: uid(),
    nome: 'CTC efetiva (CTCe)',
    atributo: 'CTC efetiva',
    atributoId: 't',
    simbolo: 'CTCe',
    escopo: 'empresa',                       // editável (a de CTC pode ser 'sistema')
    classes: base.classes.map(c => ({ ...c })),
    criadoEm: agora,
    atualizadoEm: agora,
  });
  save('inv_legendas', [...todas, nova]);
  notificarLegendas();
  localStorage.setItem('inv_migrado_leg_ctce_v1', '1');
}

// Faixas AGRONÔMICAS padrão de cada saturação na CTC (bordas de 5 classes +
// domínio das pontas). K% é ~1–5%, Ca% ~40–70%, Mg% ~8–25% — MUITO diferentes
// da V% (30–80%); por isso clonar a V% deixava tudo na 1ª classe (mapa uniforme).
// Editáveis pelo agrônomo em Legendas.
// nome SEM o símbolo entre parênteses — o relatório já acrescenta "(K%)", senão
// saía dobrado ("SATURAÇÃO POR POTÁSSIO (K%) (K%)").
const SAT_CFG: Record<string, { sigla: string; nome: string; bordas: [number, number, number, number]; dmin: number; dmax: number }> = {
  satk:  { sigla: 'K%',  nome: 'Saturação por Potássio',  bordas: [1.5, 3, 5, 8],   dmin: 0,  dmax: 10 },
  satca: { sigla: 'Ca%', nome: 'Saturação por Cálcio',    bordas: [40, 50, 60, 70], dmin: 20, dmax: 90 },
  satmg: { sigla: 'Mg%', nome: 'Saturação por Magnésio',  bordas: [8, 12, 18, 25],  dmin: 0,  dmax: 40 },
};

// Cria as legendas das SATURAÇÕES calculadas (K%/Ca%/Mg%) com FAIXAS PRÓPRIAS
// (SAT_CFG), clonando só a ESTRUTURA (estilo/categoria) da legenda de V%.
// 'empresa' (editáveis). Idempotente por atributo; sem V% ainda, tenta depois.
export function migrarLegendasSaturacoesV1() {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem('inv_migrado_leg_sat_v1') === '1') return;
  // Mesma trava da CTCe acima: flag por navegador + lista parcial (nuvem ainda
  // não hidratou, ex.: boot estourou os 12s) = recriar K%/Ca%/Mg% com ids novos
  // → legendas gêmeas em todas as máquinas. Espera a hidratação confirmar.
  if (cloudAindaNaoHidratou()) return;
  const todas = load<Legenda>('inv_legendas');
  const faltantes = Object.keys(SAT_CFG).filter(id => !todas.some(l => l.atributoId === id));
  if (faltantes.length === 0) { localStorage.setItem('inv_migrado_leg_sat_v1', '1'); return; }
  const base = todas.find(l => l.atributoId === 'v');
  if (!base) return;   // sem legenda de V% ainda — tenta de novo depois
  const agora = new Date().toISOString();
  const novas = faltantes.map(id => {
    const c = SAT_CFG[id];
    return comEmpresa<Legenda>({
      ...base, id: uid(), nome: c.nome, atributo: c.nome, atributoId: id, simbolo: c.sigla,
      escopo: 'empresa', classes: classesFertilidade5(c.bordas), dominioMin: c.dmin, dominioMax: c.dmax,
      criadoEm: agora, atualizadoEm: agora,
    });
  });
  save('inv_legendas', [...todas, ...novas]);
  notificarLegendas();
  localStorage.setItem('inv_migrado_leg_sat_v1', '1');
}

// CORREÇÃO das legendas de saturação que a v1 antiga criou clonando a V%
// (faixas 30–80% → mapa todo na 1ª cor). Flagless e idempotente pelo marcador
// "ajustar faixas" no nome: aplica as faixas do SAT_CFG e RENOMEIA (removendo o
// marcador) — depois disso não toca mais, preservando ajustes do usuário.
export function migrarLegendasSaturacoesV2() {
  if (typeof window === 'undefined') return;
  const todas = load<Legenda>('inv_legendas');
  let mudou = false;
  for (const l of todas) {
    const c = SAT_CFG[l.atributoId];
    if (!c || !/ajustar faixas/i.test(l.nome)) continue;   // só as auto-criadas ainda não corrigidas
    l.nome = c.nome; l.atributo = c.nome; l.simbolo = c.sigla;
    l.classes = classesFertilidade5(c.bordas);
    l.dominioMin = c.dmin; l.dominioMax = c.dmax;
    l.atualizadoEm = new Date().toISOString();
    mudou = true;
  }
  if (mudou) { save('inv_legendas', todas); notificarLegendas(); }
}

// Legendas HOMÔNIMAS (mesmo atributo + mesmo nome, típicas de migração que rodou
// em duas máquinas antes da nuvem hidratar): quando NENHUMA do grupo é padrão, o
// mapa escolhe por desempate de id — e o usuário edita uma cópia na Biblioteca
// enquanto o mapa segue usando a outra, sem ter como distinguir as duas nos
// dropdowns. Promove a editada por último a PADRÃO do atributo. Flagless e
// idempotente: depois da promoção o grupo tem padrão e o laço não acha mais nada.
export function migrarLegendasHomonimasPadraoV1() {
  if (typeof window === 'undefined') return;
  if (cloudAindaNaoHidratou()) return;   // com lista parcial a homônima pode nem estar aqui
  for (const id of promocoesDeHomonimas(load<Legenda>('inv_legendas'))) {
    definirLegendaPadrao(id, true);
  }
}

// v3: normaliza as legendas de saturação AUTO-geradas (qualquer variante de nome
// que a gente já criou — "… (K%)", "… — ajustar faixas" ou o nome-base) para o
// nome LIMPO + faixas/domínio corretos. Uma vez só (flag): não re-toca (preserva
// ajustes do usuário). Sem legendas ainda, tenta no próximo boot sem queimar a flag.
export function migrarLegendasSaturacoesV3() {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem('inv_migrado_leg_sat_v3') === '1') return;
  if (cloudAindaNaoHidratou()) return;   // lista parcial → normalizaria só metade e queimaria a flag
  const todas = load<Legenda>('inv_legendas');
  const sats = todas.filter(l => SAT_CFG[l.atributoId]);
  if (sats.length === 0) return;
  let mudou = false;
  for (const l of sats) {
    const c = SAT_CFG[l.atributoId];
    if (!l.nome.startsWith(c.nome)) continue;   // renomeada pelo usuário → não mexe
    l.nome = c.nome; l.atributo = c.nome; l.simbolo = c.sigla;
    l.classes = classesFertilidade5(c.bordas);
    l.dominioMin = c.dmin; l.dominioMax = c.dmax;
    l.atualizadoEm = new Date().toISOString();
    mudou = true;
  }
  if (mudou) { save('inv_legendas', todas); notificarLegendas(); }
  localStorage.setItem('inv_migrado_leg_sat_v3', '1');
}

// ── Prescrições Agronômicas (doses por zona → arquivo de aplicação) ─────────
// Documento operacional: guarda fonte+modo+parâmetros (reproduzível), versão e
// histórico. CRUD fino aqui; o motor de cálculo vive em lib/prescricao (puro).
import type { Prescricao } from './prescricao/tipos';

const K_PRESC = 'inv_prescricoes';

function notificarPrescricoes() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('inv:prescricoes'));
}

export function getPrescricoes(talhaoId?: string): Prescricao[] {
  let lista = loadFiltrado<Prescricao>(K_PRESC);
  if (talhaoId) lista = lista.filter(p => p.talhaoId === talhaoId);
  return lista.sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));
}

export function savePrescricao(
  p: Omit<Prescricao, 'id' | 'versao' | 'criadoEm' | 'atualizadoEm' | 'historico' | 'exportes'>,
): Prescricao {
  const agora = new Date().toISOString();
  const nova: Prescricao = comEmpresa({
    ...p, id: uid(), versao: 1, criadoEm: agora, atualizadoEm: agora,
    historico: [{ em: agora, por: p.criadoPor, resumo: 'criada' }],
    exportes: [],
  });
  const lista = load<Prescricao>(K_PRESC);
  lista.push(nova);
  save(K_PRESC, lista);
  notificarPrescricoes();
  return nova;
}

// Toda alteração vira VERSÃO nova + linha no histórico — prescrição que foi
// para a máquina precisa dizer o que mudou, quando e por quem.
// Salvar alterações cria uma VERSÃO NOVA, preservando a anterior.
//
// updatePrescricao sobrescrevia o registro e só subia o contador: a v1 sumia e
// sobrava uma linha de texto no histórico. Prescrição é documento operacional —
// o que foi para a máquina na semana passada precisa continuar existindo,
// inclusive com os arquivos que gerou. Agora cada versão é um registro próprio,
// ligado à primeira por `origemId`, como acontece com os zoneamentos.
export function salvarVersaoPrescricao(
  idAnterior: string, patch: Partial<Prescricao>, resumo: string, por: string,
): Prescricao | null {
  const lista = load<Prescricao>(K_PRESC);
  const anterior = lista.find(p => p.id === idAnterior);
  if (!anterior) return null;
  const agora = new Date().toISOString();
  const nova: Prescricao = comEmpresa({
    ...anterior, ...patch,
    id: uid(),
    origemId: anterior.origemId ?? anterior.id,
    versao: anterior.versao + 1,
    criadoEm: agora, atualizadoEm: agora,
    historico: [...anterior.historico, { em: agora, por, resumo }],
    exportes: [],                     // cada versão responde pelos SEUS arquivos
  });
  lista.push(nova);
  save(K_PRESC, lista);
  notificarPrescricoes();
  return nova;
}

export function updatePrescricao(id: string, patch: Partial<Prescricao>, resumo: string, por: string): Prescricao | null {
  const lista = load<Prescricao>(K_PRESC);
  const i = lista.findIndex(p => p.id === id);
  if (i < 0) return null;
  const agora = new Date().toISOString();
  lista[i] = {
    ...lista[i], ...patch, id, versao: lista[i].versao + 1, atualizadoEm: agora,
    historico: [...lista[i].historico, { em: agora, por, resumo }],
  };
  save(K_PRESC, lista);
  notificarPrescricoes();
  return lista[i];
}

// Registra uma exportação (alimenta "Arquivos de Aplicação") SEM subir versão —
// exportar não muda o conteúdo da prescrição.
export function registrarExportePrescricao(id: string, formato: Prescricao['exportes'][number]['formato'], arquivo: string, por: string): void {
  const lista = load<Prescricao>(K_PRESC);
  const p = lista.find(x => x.id === id);
  if (!p) return;
  p.exportes = [...p.exportes, { em: new Date().toISOString(), por, formato, arquivo }];
  save(K_PRESC, lista);
  notificarPrescricoes();
}

export function deletePrescricao(id: string): void {
  save(K_PRESC, load<Prescricao>(K_PRESC).filter(p => p.id !== id));
  notificarPrescricoes();
}

// Auditoria do cadastro (owner, via console: invAuditoria()). NÃO altera nada —
// só CONTA e aponta inconsistências que inflam/desencontram os KPIs do Início:
// ids repetidos, órfãos (fazenda sem produtor / talhão sem fazenda), possíveis
// duplicatas por NOME (mesmo cadastro 2×) e recomputa as áreas (todos × ativos).
export interface AuditoriaCadastro {
  clientes: number; fazendas: number; talhoes: number;
  talhoesAtivos: number; incompletos: number;
  areaTotalHa: number; areaAtivosHa: number;
  idsDuplicados: { clientes: string[]; fazendas: string[]; talhoes: string[] };
  orfaos: { fazendasSemCliente: number; talhoesSemFazenda: number };
  duplicatasPorNome: { clientes: number; fazendas: number; talhoes: number };
}

export function auditoriaCadastro(): AuditoriaCadastro {
  const clientes = load<Cliente>('inv_clientes');
  const fazendas = load<Fazenda>('inv_fazendas');
  const talhoes = load<Talhao>('inv_talhoes');

  const idsRepetidos = (arr: { id: string }[]): string[] => {
    const vistos = new Set<string>(), dup = new Set<string>();
    for (const x of arr) { if (vistos.has(x.id)) dup.add(x.id); else vistos.add(x.id); }
    return [...dup];
  };
  const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  const dupPorChave = <T,>(arr: T[], chave: (x: T) => string): number => {
    const cont = new Map<string, number>();
    for (const x of arr) { const k = chave(x); if (!k) continue; cont.set(k, (cont.get(k) ?? 0) + 1); }
    let n = 0; for (const v of cont.values()) if (v > 1) n += v - 1;
    return n;   // nº de registros EXCEDENTES (além do 1º de cada chave)
  };

  const cliIds = new Set(clientes.map(c => c.id));
  const fazIds = new Set(fazendas.map(f => f.id));
  const incompletos = talhoes.filter(t => t.status === 'incompleto').length;

  const r: AuditoriaCadastro = {
    clientes: clientes.length,
    fazendas: fazendas.length,
    talhoes: talhoes.length,
    talhoesAtivos: talhoes.length - incompletos,
    incompletos,
    areaTotalHa: Math.round(talhoes.reduce((s, t) => s + (t.areaHa || 0), 0) * 10) / 10,
    areaAtivosHa: Math.round(talhoes.filter(t => t.status !== 'incompleto').reduce((s, t) => s + (t.areaHa || 0), 0) * 10) / 10,
    idsDuplicados: {
      clientes: idsRepetidos(clientes),
      fazendas: idsRepetidos(fazendas),
      talhoes: idsRepetidos(talhoes),
    },
    orfaos: {
      fazendasSemCliente: fazendas.filter(f => !cliIds.has(f.clienteId)).length,
      talhoesSemFazenda: talhoes.filter(t => !fazIds.has(t.fazendaId)).length,
    },
    duplicatasPorNome: {
      clientes: dupPorChave(clientes, c => norm(c.documento) || norm(c.nome)),
      fazendas: dupPorChave(fazendas, f => `${f.clienteId}|${norm(f.nome)}`),
      talhoes: dupPorChave(talhoes, t => `${t.fazendaId}|${norm(t.nome)}`),
    },
  };

  if (typeof console !== 'undefined') {
    console.log('%c[Auditoria do cadastro] — comparar com os KPIs do Início', 'font-weight:bold;color:#93c5fd');
    console.table({
      Produtores: r.clientes, Fazendas: r.fazendas, 'Talhões (total)': r.talhoes,
      'Talhões ativos (KPI)': r.talhoesAtivos, Incompletos: r.incompletos,
      'Área total — todos (ha)': r.areaTotalHa, 'Área — só ativos (ha)': r.areaAtivosHa,
    });
    console.table({
      'IDs repetidos — produtores': r.idsDuplicados.clientes.length,
      'IDs repetidos — fazendas': r.idsDuplicados.fazendas.length,
      'IDs repetidos — talhões': r.idsDuplicados.talhoes.length,
      'Fazendas órfãs (sem produtor)': r.orfaos.fazendasSemCliente,
      'Talhões órfãos (sem fazenda)': r.orfaos.talhoesSemFazenda,
      'Produtores repetidos (doc/nome)': r.duplicatasPorNome.clientes,
      'Fazendas repetidas (mesmo nome no produtor)': r.duplicatasPorNome.fazendas,
      'Talhões repetidos (mesmo nome na fazenda)': r.duplicatasPorNome.talhoes,
    });
  }
  return r;
}

// ── Dedup de talhões duplicados (owner) ──────────────────────────────────────
// Duplicado = MESMO nome no MESMO produtor+fazenda. Só trata CÓPIA EXATA (mesma
// área, 2 casas); nome igual com ÁREA DIFERENTE vai p/ "revisar" (pode ser talhão
// distinto/redesenho — nunca apaga). Escolha de qual manter é SEGURA: se só uma
// cópia tem dados vinculados, mantém ela e remove as vazias; se nenhuma tem
// dados, mantém a mais antiga; se DUAS+ têm dados, não mexe (vai p/ revisar).
export interface GrupoDupTalhao { fazendaId: string; fazenda: string; produtor: string; nome: string; areas: number[]; manter: Talhao; remover: Talhao[]; }

function talhoesComDados(): Set<string> {
  const s = new Set<string>();
  const add = (arr: { talhaoId?: string }[]) => { for (const r of arr) if (r.talhaoId) s.add(r.talhaoId); };
  add(load<GradeAmostragem>('inv_grades')); add(load<ImportacaoLab>('inv_lab'));
  add(load<ImportacaoCompactacao>('inv_compactacao')); add(load<GradeCompactacao>('inv_grades_compact'));
  add(load<MdeTalhao>('inv_mde')); add(load<ComposicaoTemporal>('inv_composicoes'));
  add(load<LevantamentoCondutividade>('inv_condutividade')); add(load<Plantio>('inv_plantios'));
  add(load<AmbienteProdutivo>('inv_meap_ambientes'));
  return s;
}

export function analisarTalhoesDuplicados(): { exatos: GrupoDupTalhao[]; revisar: GrupoDupTalhao[] } {
  const talhoes = load<Talhao>('inv_talhoes');
  const fazById = new Map(load<Fazenda>('inv_fazendas').map(f => [f.id, f]));
  const cliById = new Map(load<Cliente>('inv_clientes').map(c => [c.id, c]));
  const comDados = talhoesComDados();
  const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase().replace(/\s+/g, ' ');
  const r2 = (n: number) => Math.round((n || 0) * 100) / 100;
  const grp = new Map<string, Talhao[]>();
  for (const t of talhoes) { const k = `${t.fazendaId}|${norm(t.nome)}`; (grp.get(k) ?? grp.set(k, []).get(k)!).push(t); }

  const exatos: GrupoDupTalhao[] = [], revisar: GrupoDupTalhao[] = [];
  for (const arr of grp.values()) {
    if (arr.length < 2) continue;
    const faz = fazById.get(arr[0].fazendaId);
    const info = { fazendaId: arr[0].fazendaId, fazenda: faz?.nome ?? '', produtor: faz ? cliById.get(faz.clienteId)?.nome ?? '' : '', nome: arr[0].nome, areas: arr.map(t => r2(t.areaHa)) };
    if (new Set(info.areas).size > 1) { revisar.push({ ...info, manter: arr[0], remover: [] }); continue; }  // área diferente
    const comD = arr.filter(t => comDados.has(t.id)), semD = arr.filter(t => !comDados.has(t.id));
    if (comD.length >= 2) { revisar.push({ ...info, manter: comD[0], remover: [] }); continue; }              // 2+ com dados: não mexe
    if (comD.length === 1) { exatos.push({ ...info, manter: comD[0], remover: semD }); continue; }            // mantém a com dados
    const s = [...arr].sort((a, b) => (a.criadoEm || '').localeCompare(b.criadoEm || ''));                    // nenhuma com dados: mantém a + antiga
    exatos.push({ ...info, manter: s[0], remover: s.slice(1) });
  }
  return { exatos, revisar };
}

// Remove as cópias exatas (mantendo uma por grupo, conforme analisarTalhoesDuplicados).
// LOCAL only — o caller limpa mapas/cenários na nuvem pelos ids devolvidos.
export function aplicarDedupTalhoesExatos(): string[] {
  const { exatos } = analisarTalhoesDuplicados();
  const ids = exatos.flatMap(g => g.remover.map(t => t.id));
  if (ids.length) removerTalhoesCascata(ids);
  return ids;
}

// Fazendas ÓRFÃS: clienteId aponta p/ um produtor que não existe mais.
export function analisarFazendasOrfas(): Array<{ fazenda: Fazenda; talhoes: number }> {
  const cliIds = new Set(load<Cliente>('inv_clientes').map(c => c.id));
  const talhoes = load<Talhao>('inv_talhoes');
  return load<Fazenda>('inv_fazendas')
    .filter(f => !cliIds.has(f.clienteId))
    .map(f => ({ fazenda: f, talhoes: talhoes.filter(t => t.fazendaId === f.id).length }));
}

// Remove as fazendas órfãs e seus talhões (cascata local). Devolve os ids de
// talhão removidos p/ o caller limpar mapas/cenários na nuvem.
export function aplicarRemocaoFazendasOrfas(): { fazendas: number; talhaoIds: string[] } {
  const fazIds = new Set(analisarFazendasOrfas().map(o => o.fazenda.id));
  const talhaoIds = load<Talhao>('inv_talhoes').filter(t => fazIds.has(t.fazendaId)).map(t => t.id);
  removerTalhoesCascata(talhaoIds);
  save('inv_fazendas', load<Fazenda>('inv_fazendas').filter(f => !fazIds.has(f.id)));
  return { fazendas: fazIds.size, talhaoIds };
}

// "Destrava" as legendas oficiais (escopo 'sistema', read-only) tornando-as do
// usuário (escopo 'empresa') — passam a ser editáveis/excluíveis. Como o seed só
// roda em banco vazio, a conversão é permanente.
export function destravarLegendasSistema(): number {
  const lista = load<Legenda>('inv_legendas');
  const ativa = empresaAtivaId();
  let n = 0;
  for (const l of lista) {
    if (l.escopo === 'sistema') {
      l.escopo = 'empresa';
      (l as Legenda & { empresaId?: string }).empresaId = ativa ?? undefined;
      n++;
    }
  }
  if (n) { save('inv_legendas', lista); notificarLegendas(); }
  return n;
}

// ── Insumos: as duas migrações da v2.42 ───────────────────────────────────
// Ambas existem porque a Biblioteca de Insumos nasceu (Parte XIV) como cadastro
// LOCAL e PESSOAL, e na v2.42 as equações passaram a apontar para ela. Uma FK
// só vale se o alvo existir para quem abre o registro — em qualquer máquina e
// para qualquer usuário da empresa. É isso que cada uma resolve.

/**
 * `inv_bib_insumos` entrou em KEYS_LISTA (cloud.ts) na v2.42.
 *
 * Na PRIMEIRA abertura depois disso a nuvem não tem uma linha sequer da
 * coleção, e o boot completo grava esse vazio por cima do local — o cadastro
 * de insumos deste navegador sumiria, levando junto o preço de tudo que as
 * equações apontam. Marcar a chave como pendente ANTES do boot inverte a rota:
 * o boot mescla por id (local vence) e o re-push do fim do boot sobe os
 * insumos para a nuvem.
 *
 * Tem que rodar antes de `bootCloud()`, e por isso NÃO mora em
 * `migracoesLocais()` do AppContext (essa roda depois do boot — tarde demais).
 *
 * Idempotente pela flag; e mesmo se a flag se perder (backup.ts descarta as
 * `inv_migrado_*`), rodar de novo é inofensivo: marcar pendente só força a
 * mescla, que preserva os dois lados.
 */
/**
 * O cadastro de LABORATÓRIOS (v2.44) nasceu fora de KEYS_LISTA: `cloudPushLista`
 * era no-op para ele, então o cadastro e os nomes editados nunca subiam — ficavam
 * presos no navegador onde foram digitados. Mesma dívida que os insumos tiveram,
 * e mesma quitação: marcar pendente ANTES do boot, senão a primeira hidratação
 * grava o vazio da nuvem por cima do que já existe aqui.
 */
export function migrarLabsParaSyncV1() {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem('inv_migrado_labs_sync_v1') === '1') return;
  if (load<unknown>('inv_bib_labs').length === 0) return;   // nada a proteger
  cloudMarcarPendente('inv_bib_labs');
  localStorage.setItem('inv_migrado_labs_sync_v1', '1');
}

export function migrarInsumosParaSyncV1() {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem('inv_migrado_insumos_sync_v1') === '1') return;
  // Navegador sem insumos não tem o que proteger — e marcar pendente aqui
  // criaria uma subida de lista vazia.
  if (load<unknown>('inv_bib_insumos').length === 0) return;
  cloudMarcarPendente('inv_bib_insumos');
  localStorage.setItem('inv_migrado_insumos_sync_v1', '1');
}

/**
 * Insumo nascia com escopo 'meu' (o padrão de `criar`), enquanto a equação
 * nasce 'empresa'. Equação compartilhada apontando para insumo privado é FK
 * que só funciona para quem cadastrou: o segundo agrônomo abre a mesma equação
 * e o preço não existe para ele.
 *
 * Promove os insumos já cadastrados uma única vez. `compartilhar` já grava o
 * `empresaId` e limpa o `donoUsuarioId`.
 */
export function migrarInsumosEscopoEmpresaV1() {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem('inv_migrado_insumos_escopo_v1') === '1') return;
  // Promover com o local ainda parcial reescreveria itens que a nuvem ainda
  // vai trazer — e a promoção sobe por push, atingindo todas as máquinas.
  if (cloudAindaNaoHidratou()) return;
  if (!empresaAtivaId()) return;
  const meus = load<ItemBiblioteca<unknown>>('inv_bib_insumos').filter(i => i.escopo === 'meu');
  for (const i of meus) bibCompartilhar('insumos', i.id, 'empresa');
  localStorage.setItem('inv_migrado_insumos_escopo_v1', '1');
}

export function clearAll() {
  // removerLocal (e não localStorage.removeItem): inv_talhoes é chave PESADA —
  // vive no cache em memória + IndexedDB e ressuscitaria de lá.
  ['inv_clientes','inv_fazendas','inv_talhoes','inv_safras','inv_padroes_elem','inv_padroes_amos','inv_grades']
    .forEach(k => removerLocal(k));
}
