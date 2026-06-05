'use client';

// Store local com localStorage — temporário até integração com banco real

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
  geojson?: string;         // JSON string do GeoJSON
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
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ── Clientes ──────────────────────────────────────────────────────────────

export function getClientes(): Cliente[] {
  return load<Cliente>('inv_clientes').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function saveCliente(c: Omit<Cliente, 'id' | 'criadoEm'>): Cliente {
  const clientes = load<Cliente>('inv_clientes');
  const novo: Cliente = { ...c, id: uid(), criadoEm: new Date().toISOString() };
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
  const all = load<Fazenda>('inv_fazendas');
  return clienteId ? all.filter(f => f.clienteId === clienteId) : all;
}

export function saveFazenda(f: Omit<Fazenda, 'id' | 'criadoEm'>): Fazenda {
  const fazendas = load<Fazenda>('inv_fazendas');
  const nova: Fazenda = { ...f, id: uid(), criadoEm: new Date().toISOString() };
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
  const all = load<Talhao>('inv_talhoes');
  return fazendaId ? all.filter(t => t.fazendaId === fazendaId) : all;
}

export function saveTalhao(t: Omit<Talhao, 'id' | 'criadoEm'>): Talhao {
  const talhoes = load<Talhao>('inv_talhoes');
  const novo: Talhao = { ...t, id: uid(), criadoEm: new Date().toISOString() };
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
  return load<Safra>('inv_safras').sort((a, b) => b.anoInicio - a.anoInicio);
}

export function saveSafra(s: Omit<Safra, 'id' | 'criadoEm'>): Safra {
  const safras = load<Safra>('inv_safras');
  const nova: Safra = { ...s, id: uid(), criadoEm: new Date().toISOString() };
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
  return load<PadraoElementos>('inv_padroes_elem').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function savePadraoElementos(p: Omit<PadraoElementos, 'id' | 'criadoEm'>): PadraoElementos {
  const lista = load<PadraoElementos>('inv_padroes_elem');
  const novo: PadraoElementos = { ...p, id: uid(), criadoEm: new Date().toISOString() };
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
  return load<PadraoAmostragem>('inv_padroes_amos').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function savePadraoAmostragem(p: Omit<PadraoAmostragem, 'id' | 'criadoEm'>): PadraoAmostragem {
  const lista = load<PadraoAmostragem>('inv_padroes_amos');
  const novo: PadraoAmostragem = { ...p, id: uid(), criadoEm: new Date().toISOString() };
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

export function getGrades(talhaoId?: string, safra?: string): GradeAmostragem[] {
  let all = load<GradeAmostragem>('inv_grades');
  if (talhaoId) all = all.filter(g => g.talhaoId === talhaoId);
  if (safra) all = all.filter(g => g.safra === safra);
  return all.sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
}

export function saveGrade(g: Omit<GradeAmostragem, 'id' | 'criadoEm'>): GradeAmostragem {
  const lista = load<GradeAmostragem>('inv_grades');
  const nova: GradeAmostragem = { ...g, id: uid(), criadoEm: new Date().toISOString() };
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
  lista.forEach(g => {
    if (g.talhaoId === alvo.talhaoId && g.safra === alvo.safra) {
      g.paraProcessar = g.id === id;
    }
  });
  save('inv_grades', lista);
}

export function clearAll() {
  ['inv_clientes','inv_fazendas','inv_talhoes','inv_safras','inv_padroes_elem','inv_padroes_amos','inv_grades']
    .forEach(k => localStorage.removeItem(k));
}
