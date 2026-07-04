'use client';

// Store local com localStorage — temporário até integração com banco real

import type { ResultadoAmostra, PerfilLabConfig } from './lab';
import type { Legenda } from './legendas';
import type { AmbienteProdutivo } from './meap/tipos';
import { cloudPushLista } from './cloud';
import { empresaAtivaId, uidUsuario, escopoClienteIds } from './empresa';
import {
  listar as bibListar,
  obter as bibObter,
  criar as bibCriar,
  atualizar as bibAtualizar,
  excluir as bibExcluir,
  type ItemBiblioteca,
  type ConteudoLaboratorio,
  type ConteudoSafra,
  type ConteudoGrade,
  type ConteudoEtiqueta,
  type ConteudoVariavel,
} from './biblioteca';
import { ELEMENTOS_LAB, simboloElemento, norm as normLab } from './lab';

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
export interface ImportacaoCompactacao {
  id: string;
  talhaoId: string;
  safra: string;
  nome: string;
  profundidades: string[];   // rótulos derivados das colunas escolhidas
  pontos: PontoCompactacao[];
  criadoEm: string;
}

export function getImportacoesCompactacao(talhaoId?: string, safra?: string): ImportacaoCompactacao[] {
  let lista = loadFiltrado<ImportacaoCompactacao>('inv_compactacao');
  if (talhaoId) lista = lista.filter(i => i.talhaoId === talhaoId);
  if (safra) lista = lista.filter(i => i.safra === safra);
  return lista.sort((a, b) => (b.criadoEm ?? '').localeCompare(a.criadoEm ?? ''));
}

export function saveImportacaoCompactacao(data: Omit<ImportacaoCompactacao, 'id' | 'criadoEm'>): ImportacaoCompactacao {
  const lista = load<ImportacaoCompactacao>('inv_compactacao');
  const nova: ImportacaoCompactacao = comEmpresa({ ...data, id: uid(), criadoEm: new Date().toISOString() });
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
  criadoEm: string;
}

export function getGradesCompactacao(talhaoId?: string, safra?: string): GradeCompactacao[] {
  let lista = loadFiltrado<GradeCompactacao>('inv_grades_compact');
  if (talhaoId) lista = lista.filter(g => g.talhaoId === talhaoId);
  if (safra) lista = lista.filter(g => g.safra === safra);
  return lista.sort((a, b) => (b.criadoEm ?? '').localeCompare(a.criadoEm ?? ''));
}

export function saveGradeCompactacao(data: Omit<GradeCompactacao, 'id' | 'criadoEm'>): GradeCompactacao {
  const lista = load<GradeCompactacao>('inv_grades_compact');
  const nova: GradeCompactacao = comEmpresa({ ...data, id: uid(), criadoEm: new Date().toISOString() });
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
  const nova: LevantamentoCondutividade = comEmpresa({ ...data, id: uid(), criadoEm: new Date().toISOString() });
  // A 1ª versão do talhão (ou uma marcada explicitamente) vira a oficial.
  if (nova.oficial || !lista.some(l => l.talhaoId === nova.talhaoId && l.oficial)) {
    nova.oficial = true;
    lista.forEach(l => { if (l.talhaoId === nova.talhaoId) l.oficial = false; });
  }
  lista.push(nova);
  save('inv_condutividade', lista);
  return nova;
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
  epoca: string;          // 'verao' | 'safrinha' | 'inverno' | ''
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
  if (safra) lista = lista.filter(m => m.safra === safra);
  return lista.sort((a, b) => (b.criadoEm ?? '').localeCompare(a.criadoEm ?? ''));
}

export function saveMapaProdutividade(data: Omit<MapaProdutividade, 'id' | 'versao' | 'criadoEm'>): MapaProdutividade {
  const lista = load<MapaProdutividade>('inv_produtividade');
  const irmaos = lista.filter(m => m.talhaoId === data.talhaoId && m.safra === data.safra && m.epoca === data.epoca && m.cultura === data.cultura);
  const versao = irmaos.reduce((mx, m) => Math.max(mx, m.versao), 0) + 1;
  if (data.oficial) irmaos.forEach(m => { m.oficial = false; });
  const nova: MapaProdutividade = comEmpresa({ ...data, id: uid(), versao, criadoEm: new Date().toISOString() });
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
  ordem: number;          // índice serpentina (0-based)
  numero?: number;        // nº da amostra (grade importada de fora); join com lab usa numero ?? ordem+1
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
  epoca: '1' | '2';
  nome: string;                       // "Grade 1"
  padraoAmostragemId: string;
  padraoNome: string;                 // snapshot
  customizado: boolean;               // divergiu do padrão original
  densidade: number;
  distanciaBorda: number;
  rotacao: number;
  aleatoriedade: number;
  modoSel: 'regular' | 'aleatorio';
  metodo?: 'grid' | 'zonas';                  // default 'grid'
  modelo?: 'A' | 'B';                         // zonas: composta (A) / individual (B)
  modoDist?: 'grade' | 'inteligente';         // zonas: distribuição
  densidadePorZona?: Record<string, number>;  // zonas: override por zona
  profundidades: ProfundidadeConfig[];
  pontos: PontoAmostragem[];
  paraProcessar: boolean;
  criadoEm: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function load<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(key) ?? '[]'); } catch { return []; }
}

function save<T>(key: string, data: T[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(data));
  cloudPushLista(key, data); // espelha na nuvem quando configurada (no-op sem Firebase)
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

// Escopo de fazendas derivado do vínculo de clientes (consultoria).
function fazendasNoEscopo(esc: Set<string>): Set<string> {
  return new Set(loadFiltrado<Fazenda>('inv_fazendas').filter(f => esc.has(f.clienteId)).map(f => f.id));
}

export function getClientes(): Cliente[] {
  const esc = escopoClienteIds();
  let all = loadFiltrado<Cliente>('inv_clientes');
  if (esc) all = all.filter(c => esc.has(c.id));
  return all.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function saveCliente(c: Omit<Cliente, 'id' | 'criadoEm'>): Cliente {
  const clientes = load<Cliente>('inv_clientes');
  const novo: Cliente = comEmpresa({ ...c, id: uid(), criadoEm: new Date().toISOString() });
  clientes.push(novo);
  save('inv_clientes', clientes);
  return novo;
}

export function updateCliente(id: string, data: Partial<Cliente>) {
  const clientes = load<Cliente>('inv_clientes');
  const idx = clientes.findIndex(c => c.id === id);
  if (idx >= 0) { clientes[idx] = { ...clientes[idx], ...data }; save('inv_clientes', clientes); }
}

export function deleteCliente(id: string) {
  save('inv_clientes', load<Cliente>('inv_clientes').filter(c => c.id !== id));
}

// Exclui um produtor e TUDO ligado a ele (fazendas, talhões, importações de
// lab, grades, plantios, compactação) — local + nuvem (save propaga a remoção
// via cloudPushLista). Devolve os ids de talhão para o chamador limpar também
// os mapas/cenários na nuvem (coleções de docs, fora das listas). NÃO toca na
// Biblioteca nem em legendas/safras/padrões.
export function excluirProdutorCascata(clienteId: string): { talhaoIds: string[] } {
  const fazIds = new Set(load<Fazenda>('inv_fazendas').filter(f => f.clienteId === clienteId).map(f => f.id));
  const talhaoIds = load<Talhao>('inv_talhoes').filter(t => fazIds.has(t.fazendaId)).map(t => t.id);
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
  save('inv_talhoes', load<Talhao>('inv_talhoes').filter(t => !tal.has(t.id)));
  save('inv_fazendas', load<Fazenda>('inv_fazendas').filter(f => !fazIds.has(f.id)));
  save('inv_clientes', load<Cliente>('inv_clientes').filter(c => c.id !== clienteId));
  return { talhaoIds };
}

// ── Fazendas ──────────────────────────────────────────────────────────────

export function getFazendas(clienteId?: string): Fazenda[] {
  const esc = escopoClienteIds();
  let all = loadFiltrado<Fazenda>('inv_fazendas');
  if (esc) all = all.filter(f => esc.has(f.clienteId));
  return clienteId ? all.filter(f => f.clienteId === clienteId) : all;
}

export function saveFazenda(f: Omit<Fazenda, 'id' | 'criadoEm'>): Fazenda {
  const fazendas = load<Fazenda>('inv_fazendas');
  const nova: Fazenda = comEmpresa({ ...f, id: uid(), criadoEm: new Date().toISOString() });
  fazendas.push(nova);
  save('inv_fazendas', fazendas);
  return nova;
}

export function updateFazenda(id: string, data: Partial<Fazenda>) {
  const fazendas = load<Fazenda>('inv_fazendas');
  const idx = fazendas.findIndex(f => f.id === id);
  if (idx >= 0) { fazendas[idx] = { ...fazendas[idx], ...data }; save('inv_fazendas', fazendas); }
}

// ── Talhões ───────────────────────────────────────────────────────────────

export function getTalhoes(fazendaId?: string): Talhao[] {
  const esc = escopoClienteIds();
  let all = loadFiltrado<Talhao>('inv_talhoes');
  if (esc) { const fz = fazendasNoEscopo(esc); all = all.filter(t => fz.has(t.fazendaId)); }
  return fazendaId ? all.filter(t => t.fazendaId === fazendaId) : all;
}

export function saveTalhao(t: Omit<Talhao, 'id' | 'criadoEm'>): Talhao {
  const talhoes = load<Talhao>('inv_talhoes');
  const novo: Talhao = comEmpresa({ ...t, id: uid(), criadoEm: new Date().toISOString() });
  talhoes.push(novo);
  save('inv_talhoes', talhoes);
  return novo;
}

export function updateTalhao(id: string, data: Partial<Talhao>) {
  const talhoes = load<Talhao>('inv_talhoes');
  const idx = talhoes.findIndex(t => t.id === id);
  if (idx >= 0) { talhoes[idx] = { ...talhoes[idx], ...data }; save('inv_talhoes', talhoes); }
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
    if (idx >= 0) { talhoes[idx] = { ...talhoes[idx], ...a.data }; atualizados++; }
  }
  for (const n of novos) {
    talhoes.push(comEmpresa({ ...n, id: uid(), criadoEm: new Date().toISOString() }));
  }
  save('inv_talhoes', talhoes);
  return { criados: novos.length, atualizados };
}

export function deleteTalhao(id: string) {
  save('inv_talhoes', load<Talhao>('inv_talhoes').filter(t => t.id !== id));
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
  if (safra) all = all.filter(g => g.safra === safra);
  if (metodo) all = all.filter(g => (g.metodo ?? 'grid') === metodo);
  return all.sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
}

export function saveGrade(g: Omit<GradeAmostragem, 'id' | 'criadoEm'>): GradeAmostragem {
  const lista = load<GradeAmostragem>('inv_grades');
  const nova: GradeAmostragem = comEmpresa({ ...g, id: uid(), criadoEm: new Date().toISOString() });
  lista.push(nova);
  save('inv_grades', lista);
  return nova;
}

export function updateGrade(id: string, data: Partial<GradeAmostragem>) {
  const lista = load<GradeAmostragem>('inv_grades');
  const idx = lista.findIndex(g => g.id === id);
  if (idx >= 0) { lista[idx] = { ...lista[idx], ...data }; save('inv_grades', lista); }
}

export function deleteGrade(id: string) {
  save('inv_grades', load<GradeAmostragem>('inv_grades').filter(g => g.id !== id));
}

// ── #33 Tabela de preços única (produtos/frete/aplicação) reusada nas Equações ──
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
const ETQ_PADRAO: ConfigEtiqueta = { layoutId: 'A4361', dx: 0, dy: 0 };

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
  return { id: c.varId, sigla: c.sigla, nome: c.nome, unidade: c.unidade, sinonimos: c.sinonimos ?? [], usar: c.usar !== false, ordem: c.ordem ?? 999 };
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

// Catálogo completo (fallback = seed em memória, p/ quem nunca abriu o painel).
export function getVariaveisAnalise(): VariavelAnalise[] {
  const itens = _itensVariaveis();
  if (itens.length === 0) return VARIAVEIS_SEED;
  return itens.map(i => _deConteudo(i.conteudo)).sort((a, b) => a.ordem - b.ordem || a.sigla.localeCompare(b.sigla));
}
export function getVariaveisAtivas(): VariavelAnalise[] {
  return getVariaveisAnalise().filter(v => v.usar);
}

export function saveVariavelAnalise(v: VariavelAnalise) {
  garantirVariaveisAnalise();  // edição implica materializar o seed
  const it = _itensVariaveis().find(i => i.conteudo.varId === v.id);
  const conteudo: ConteudoVariavel = { tipo: 'variavel', varId: v.id, sigla: v.sigla, nome: v.nome, unidade: v.unidade, sinonimos: v.sinonimos, usar: v.usar, ordem: v.ordem };
  if (it) bibAtualizar<ConteudoVariavel>('preferencias-analise', it.id, { nome: `Variável: ${v.sigla}`, conteudo });
  else bibCriar<ConteudoVariavel>('preferencias-analise', { nome: `Variável: ${v.sigla}`, conteudo, escopo: empresaAtivaId() ? 'empresa' : 'meu' });
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
  laboratorio: string;
  campanha?: string;
  resultados: ResultadoAmostra[];
  elementos: string[];
  criadoEm: string;
}

// Wrappers de retrocompat (Fase 3): perfis de laboratório agora vivem dentro
// da Biblioteca de Padrões (categoria 'laboratorios'). A forma de PerfilLab e
// a API pública continuam iguais — LabImportSection não precisa mudar.

function _itemParaPerfilLab(it: ItemBiblioteca<ConteudoLaboratorio>): PerfilLab {
  return { id: it.id, nome: it.nome, config: it.conteudo.config, criadoEm: it.criadoEm };
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

export function getImportacoesLab(talhaoId?: string, safra?: string): ImportacaoLab[] {
  let all = loadFiltrado<ImportacaoLab>('inv_lab');
  if (talhaoId) all = all.filter(i => i.talhaoId === talhaoId);
  if (safra) all = all.filter(i => i.safra === safra);
  return all.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
}

export function saveImportacaoLab(i: Omit<ImportacaoLab, 'id' | 'criadoEm'>): ImportacaoLab {
  const lista = load<ImportacaoLab>('inv_lab');
  const nova: ImportacaoLab = comEmpresa({ ...i, id: uid(), criadoEm: new Date().toISOString() });
  lista.push(nova);
  save('inv_lab', lista);
  return nova;
}

export function deleteImportacaoLab(id: string) {
  save('inv_lab', load<ImportacaoLab>('inv_lab').filter(i => i.id !== id));
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
  meta: { camadas: string[]; algoritmo: string; nPotenciais: number; areaMinHa: number; nZonas: number; nPoligonos?: number; cvMedio?: number | null; pesos?: Record<string, number>; chaves?: string[] };
  criadoEm: string;
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
  return getLegendas().filter(l => l.atributoId === atributoId);
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
export function seedLegendasSistema(seed: Legenda[]) {
  const lista = load<Legenda>('inv_legendas');
  if (lista.length > 0) return;   // já existem legendas no banco → não mexe
  const novas = seed.map(oficial => {
    const item: Legenda = { ...oficial, escopo: 'sistema' };
    delete (item as Legenda & { empresaId?: string }).empresaId;
    return item;
  });
  save('inv_legendas', novas);
  notificarLegendas();
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

export function clearAll() {
  ['inv_clientes','inv_fazendas','inv_talhoes','inv_safras','inv_padroes_elem','inv_padroes_amos','inv_grades']
    .forEach(k => localStorage.removeItem(k));
}
