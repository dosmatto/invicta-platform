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

export function clearAll() {
  ['inv_clientes','inv_fazendas','inv_talhoes'].forEach(k => localStorage.removeItem(k));
}
