'use client';

// Store local com localStorage — temporário até integração com banco real

import type { ResultadoAmostra, PerfilLabConfig } from './lab';
import type { Legenda } from './legendas';
import { cloudPushLista, cloudPushObj } from './cloud';
import { empresaAtivaId } from './empresa';

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
  const todos = load<ComEmpresa<T>>(key);
  const ativa = empresaAtivaId();
  if (!ativa) return todos;
  // auto-marca quem ainda não tem empresa
  let mudou = false;
  for (const x of todos) {
    if (!x.empresaId) { x.empresaId = ativa; mudou = true; }
  }
  if (mudou) save(key, todos);
  return todos.filter(x => x.empresaId === ativa);
}

function comEmpresa<T extends object>(item: T): T {
  const ativa = empresaAtivaId();
  if (!ativa) return item;
  return { ...item, empresaId: ativa } as T;
}

// ── Clientes ──────────────────────────────────────────────────────────────

export function getClientes(): Cliente[] {
  return loadFiltrado<Cliente>('inv_clientes').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
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

// ── Fazendas ──────────────────────────────────────────────────────────────

export function getFazendas(clienteId?: string): Fazenda[] {
  const all = loadFiltrado<Fazenda>('inv_fazendas');
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
  const all = loadFiltrado<Talhao>('inv_talhoes');
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

// ── Safras ────────────────────────────────────────────────────────────────

export function getSafras(): Safra[] {
  return loadFiltrado<Safra>('inv_safras').sort((a, b) => b.anoInicio - a.anoInicio);
}

export function saveSafra(s: Omit<Safra, 'id' | 'criadoEm'>): Safra {
  const safras = load<Safra>('inv_safras');
  const nova: Safra = comEmpresa({ ...s, id: uid(), criadoEm: new Date().toISOString() });
  safras.push(nova);
  save('inv_safras', safras);
  return nova;
}

export function updateSafra(id: string, data: Partial<Safra>) {
  const safras = load<Safra>('inv_safras');
  const idx = safras.findIndex(s => s.id === id);
  if (idx >= 0) { safras[idx] = { ...safras[idx], ...data }; save('inv_safras', safras); }
}

export function deleteSafra(id: string) {
  save('inv_safras', load<Safra>('inv_safras').filter(s => s.id !== id));
}

// ── Padrões de Elementos ────────────────────────────────────────────────────
// Conjunto nomeado de elementos a analisar (ex: "Rotina", "Rotina + Micros").
// Os elementos referenciam os ids da Base Agronômica (ph, p, k, ca...).

export function getPadroesElementos(): PadraoElementos[] {
  return loadFiltrado<PadraoElementos>('inv_padroes_elem').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function savePadraoElementos(p: Omit<PadraoElementos, 'id' | 'criadoEm'>): PadraoElementos {
  const lista = load<PadraoElementos>('inv_padroes_elem');
  const novo: PadraoElementos = comEmpresa({ ...p, id: uid(), criadoEm: new Date().toISOString() });
  lista.push(novo);
  save('inv_padroes_elem', lista);
  return novo;
}

export function updatePadraoElementos(id: string, data: Partial<PadraoElementos>) {
  const lista = load<PadraoElementos>('inv_padroes_elem');
  const idx = lista.findIndex(p => p.id === id);
  if (idx >= 0) { lista[idx] = { ...lista[idx], ...data }; save('inv_padroes_elem', lista); }
}

export function deletePadraoElementos(id: string) {
  save('inv_padroes_elem', load<PadraoElementos>('inv_padroes_elem').filter(p => p.id !== id));
}

// ── Padrões de Amostragem ───────────────────────────────────────────────────
// Template reutilizável: densidade + profundidades (cada uma com % de pontos
// e qual padrão de elementos). Distância da borda/rotação ficam no simulador.

export function getPadroesAmostragem(): PadraoAmostragem[] {
  return loadFiltrado<PadraoAmostragem>('inv_padroes_amos').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function savePadraoAmostragem(p: Omit<PadraoAmostragem, 'id' | 'criadoEm'>): PadraoAmostragem {
  const lista = load<PadraoAmostragem>('inv_padroes_amos');
  const novo: PadraoAmostragem = comEmpresa({ ...p, id: uid(), criadoEm: new Date().toISOString() });
  lista.push(novo);
  save('inv_padroes_amos', lista);
  return novo;
}

export function updatePadraoAmostragem(id: string, data: Partial<PadraoAmostragem>) {
  const lista = load<PadraoAmostragem>('inv_padroes_amos');
  const idx = lista.findIndex(p => p.id === id);
  if (idx >= 0) { lista[idx] = { ...lista[idx], ...data }; save('inv_padroes_amos', lista); }
}

export function deletePadraoAmostragem(id: string) {
  save('inv_padroes_amos', load<PadraoAmostragem>('inv_padroes_amos').filter(p => p.id !== id));
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
export interface ConfigEtiqueta { layoutId: string; dx: number; dy: number; }
const ETQ_KEY = 'inv_etiqueta_cfg';

export function getConfigEtiqueta(): ConfigEtiqueta {
  const padrao: ConfigEtiqueta = { layoutId: 'A4361', dx: 0, dy: 0 };
  if (typeof window === 'undefined') return padrao;
  try { const raw = localStorage.getItem(ETQ_KEY); if (raw) return { ...padrao, ...JSON.parse(raw) }; } catch {}
  return padrao;
}

export function saveConfigEtiqueta(c: ConfigEtiqueta) {
  if (typeof window === 'undefined') return;
  const json = JSON.stringify(c);
  localStorage.setItem(ETQ_KEY, json);
  cloudPushObj(ETQ_KEY, json);
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

export function getPerfisLab(): PerfilLab[] {
  return loadFiltrado<PerfilLab>('inv_lab_perfis').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

// Cria ou atualiza o perfil pelo nome do laboratório (upsert).
export function salvarPerfilLab(nome: string, config: PerfilLabConfig): PerfilLab {
  const lista = load<PerfilLab>('inv_lab_perfis');
  const ativa = empresaAtivaId();
  const idx = lista.findIndex(p =>
    p.nome.toLowerCase() === nome.trim().toLowerCase()
    && (!ativa || (p as PerfilLab & { empresaId?: string }).empresaId === ativa)
  );
  if (idx >= 0) {
    lista[idx] = comEmpresa({ ...lista[idx], config });
    save('inv_lab_perfis', lista);
    return lista[idx];
  }
  const novo: PerfilLab = comEmpresa({ id: uid(), nome: nome.trim(), config, criadoEm: new Date().toISOString() });
  lista.push(novo);
  save('inv_lab_perfis', lista);
  return novo;
}

export function deletePerfilLab(id: string) {
  save('inv_lab_perfis', load<PerfilLab>('inv_lab_perfis').filter(p => p.id !== id));
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

// ── Legendas Agronômicas (motor de legendas) ──────────────────────────────
// Repositório reutilizável de legendas para mapas de fertilidade, micros e
// textura. Cada legenda é independente do mapa; o usuário escolhe qual aplicar.

function notificarLegendas() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('inv:legendas'));
  }
}

export function getLegendas(): Legenda[] {
  return loadFiltrado<Legenda>('inv_legendas');
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

// Garante o seed ABC ao abrir o app. Atualiza legendas ABC que ainda estão na
// versão antiga (sem `corInicio`/`corFim`, antes do sistema de Estilos), sem
// tocar em legendas criadas pelo usuário.
export function seedLegendasABCIfEmpty(seed: Legenda[]) {
  const atuais = getLegendas();
  const porId = new Map(atuais.map(l => [l.id, l] as const));
  for (const l of seed) {
    const existente = porId.get(l.id);
    if (!existente) { upsertLegenda(l); continue; }
    const semCoresNovas = existente.classes.some(c => !c.corInicio || !c.corFim);
    if (semCoresNovas) upsertLegenda(l);
  }
}

export function clearAll() {
  ['inv_clientes','inv_fazendas','inv_talhoes','inv_safras','inv_padroes_elem','inv_padroes_amos','inv_grades']
    .forEach(k => localStorage.removeItem(k));
}
