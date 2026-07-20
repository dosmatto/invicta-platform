'use client';

// Módulo de Coleta de Solo em campo (PWA /coleta).
//
// Modelo offline-first:
//  • Registros de coleta: localStorage `inv_coletas` (fonte de leitura síncrona,
//    como todo o app) + espelho na nuvem como DOCS individuais no app_kv
//    (colecao 'inv_coletas', item_id = gradeId__ordem), consultados por gradeId
//    — fora do boot, com merge por `atualizadoEm` (nunca sobrescreve coleta de
//    campo mais nova).
//  • Fotos: IndexedDB (blobs) até sincronizar → Supabase Storage bucket 'coletas'.
//  • Tiles offline: Cache Storage 'coleta-tiles' (o mesmo que o service worker usa).

import { getSupabase } from './supabase';
import { usarDadosSupabase, salvarDocSupabase, carregarDocsPorCampoSupabase, carregarColecaoSupabase, excluirDocSupabase } from './supabaseData';

// ── Registros de coleta ───────────────────────────────────────────────────────

export type StatusPonto = 'pendente' | 'coletado' | 'pulado' | 'cancelado';

export const COR_STATUS: Record<StatusPonto, string> = {
  pendente: '#fbbf24',
  coletado: '#22c55e',
  pulado: '#94a3b8',
  cancelado: '#ef4444',
};

export const ROTULO_STATUS: Record<StatusPonto, string> = {
  pendente: 'Pendente',
  coletado: 'Coletado',
  pulado: 'Pulado',
  cancelado: 'Cancelado',
};

// ── Status agregado da GRADE (derivado das coletas dos seus pontos) ───────────
export type StatusGrade = 'nova' | 'iniciada' | 'finalizada';

export const ROTULO_GRADE: Record<StatusGrade, string> = {
  nova: 'Nova', iniciada: 'Iniciada', finalizada: 'Finalizada',
};
export const COR_GRADE: Record<StatusGrade, string> = {
  nova: '#93c5fd', iniciada: '#fbbf24', finalizada: '#22c55e',
};

// Um ponto "resolvido" = tem coleta com status diferente de pendente (coletado,
// pulado ou cancelado). Nova = nada resolvido; Finalizada = todos os pontos.
export function statusGrade(coletas: RegistroColeta[], nPontos: number): StatusGrade {
  const resolvidos = coletas.filter(c => c.status !== 'pendente').length;
  if (resolvidos === 0) return 'nova';
  if (nPontos > 0 && resolvidos >= nPontos) return 'finalizada';
  return 'iniciada';
}

// Tem alguma coleta ainda não enviada pra nuvem?
export function gradeTemPendencia(coletas: RegistroColeta[]): boolean {
  return coletas.some(c => c.syncPendente);
}

export interface RegistroColeta {
  id: string;              // `${gradeId}__${ordem}`
  gradeId: string;
  talhaoId: string;
  safra: string;
  ordem: number;           // índice do ponto na grade
  codigo: string;          // "P-014"
  status: StatusPonto;
  profundidades?: string[];
  lngReal?: number;
  latReal?: number;
  precisaoM?: number;
  distanciaAlvoM?: number;
  horario?: string;        // ISO da confirmação
  operador?: string;       // e-mail
  umidade?: string;
  compactacao?: string;
  problemas?: string;
  obs?: string;
  fotos?: number;          // nº de fotos locais (informativo)
  syncPendente: boolean;
  atualizadoEm: string;
}

const KEY = 'inv_coletas';
const COLECAO = 'inv_coletas';

function loadColetas(): RegistroColeta[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}

function saveColetas(lista: RegistroColeta[]) {
  localStorage.setItem(KEY, JSON.stringify(lista));
}

export function idColeta(gradeId: string, ordem: number) {
  return `${gradeId}__${ordem}`;
}

export function getColetas(gradeId?: string): RegistroColeta[] {
  const all = loadColetas();
  return gradeId ? all.filter(c => c.gradeId === gradeId) : all;
}

export function getColeta(gradeId: string, ordem: number): RegistroColeta | null {
  return loadColetas().find(c => c.id === idColeta(gradeId, ordem)) ?? null;
}

// Grava (upsert) e tenta empurrar pra nuvem em seguida (fire-and-forget).
export function upsertColeta(reg: Omit<RegistroColeta, 'syncPendente' | 'atualizadoEm'>): RegistroColeta {
  const lista = loadColetas();
  const novo: RegistroColeta = { ...reg, syncPendente: true, atualizadoEm: new Date().toISOString() };
  const idx = lista.findIndex(c => c.id === novo.id);
  if (idx >= 0) lista[idx] = novo; else lista.push(novo);
  saveColetas(lista);
  void pushColetasPendentes().catch(() => {});
  return novo;
}

export function contarPendentesSync(): number {
  return loadColetas().filter(c => c.syncPendente).length;
}

// ENVIAR: empurra cada coleta pendente como doc individual (upsert idempotente).
export async function pushColetasPendentes(): Promise<number> {
  if (!usarDadosSupabase() || (typeof navigator !== 'undefined' && !navigator.onLine)) return 0;
  const lista = loadColetas();
  const pendentes = lista.filter(c => c.syncPendente);
  let enviados = 0;
  for (const c of pendentes) {
    try {
      const ok = await salvarDocSupabase(COLECAO, c.id, { ...c, syncPendente: false });
      if (!ok) continue;  // servidor recusou (sem sessão/RLS) → segue pendente
      c.syncPendente = false;
      enviados++;
    } catch { /* offline/erro: continua pendente */ }
  }
  if (enviados) saveColetas(lista);
  return enviados;
}

// RECEBER: puxa as coletas da grade e faz merge por atualizadoEm (não
// sobrescreve registro local mais novo nem pendente de envio).
export async function pullColetas(gradeId: string): Promise<number> {
  if (!usarDadosSupabase() || !navigator.onLine) return 0;
  const remotas = await carregarDocsPorCampoSupabase<RegistroColeta>(COLECAO, 'gradeId', gradeId);
  if (!remotas.length) return 0;
  const lista = loadColetas();
  let novas = 0;
  for (const r of remotas) {
    const idx = lista.findIndex(c => c.id === r.id);
    if (idx < 0) { lista.push({ ...r, syncPendente: false }); novas++; }
    else if (!lista[idx].syncPendente && r.atualizadoEm > lista[idx].atualizadoEm) {
      lista[idx] = { ...r, syncPendente: false }; novas++;
    }
  }
  if (novas) saveColetas(lista);
  return novas;
}

// ── Leituras de COMPACTAÇÃO (penetrômetro) — #36 ─────────────────────────────
// Mesmo modelo offline-first das coletas: localStorage `inv_leituras_compact`
// (leitura síncrona) + espelho na nuvem como docs individuais no app_kv
// (item_id = gradeId__ordem), merge por atualizadoEm. A grade vem da PLATAFORMA
// (store.ts GradeCompactacao); o processamento também é lá (vira ImportacaoCompactacao).

export interface LeituraCompactacao {
  id: string;                        // `${gradeId}__${ordem}`
  gradeId: string;
  talhaoId: string;
  safra: string;
  ordem: number;                     // índice do ponto na grade
  codigo: string;                    // "C-014"
  status: StatusPonto;               // coletado | pulado | cancelado
  valores: Record<string, number>;   // profundidade → resistência (na unidade da grade)
  lngReal?: number;
  latReal?: number;
  precisaoM?: number;
  distanciaAlvoM?: number;
  horario?: string;                  // ISO da confirmação
  operador?: string;                 // e-mail
  obs?: string;
  syncPendente: boolean;
  atualizadoEm: string;
}

const KEY_LEIT = 'inv_leituras_compact';
const COLECAO_LEIT = 'inv_leituras_compact';

function loadLeituras(): LeituraCompactacao[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(KEY_LEIT) ?? '[]'); } catch { return []; }
}
function saveLeituras(lista: LeituraCompactacao[]) {
  localStorage.setItem(KEY_LEIT, JSON.stringify(lista));
}

export function getLeiturasCompact(gradeId?: string): LeituraCompactacao[] {
  const all = loadLeituras();
  return gradeId ? all.filter(l => l.gradeId === gradeId) : all;
}

export function upsertLeituraCompact(reg: Omit<LeituraCompactacao, 'syncPendente' | 'atualizadoEm'>): LeituraCompactacao {
  const lista = loadLeituras();
  const novo: LeituraCompactacao = { ...reg, syncPendente: true, atualizadoEm: new Date().toISOString() };
  const idx = lista.findIndex(l => l.id === novo.id);
  if (idx >= 0) lista[idx] = novo; else lista.push(novo);
  saveLeituras(lista);
  void pushLeiturasCompactPendentes().catch(() => {});
  return novo;
}

export function contarLeiturasPendentesSync(): number {
  return loadLeituras().filter(l => l.syncPendente).length;
}

export async function pushLeiturasCompactPendentes(): Promise<number> {
  if (!usarDadosSupabase() || (typeof navigator !== 'undefined' && !navigator.onLine)) return 0;
  const lista = loadLeituras();
  const pendentes = lista.filter(l => l.syncPendente);
  let enviados = 0;
  for (const l of pendentes) {
    try {
      const ok = await salvarDocSupabase(COLECAO_LEIT, l.id, { ...l, syncPendente: false });
      if (!ok) continue;
      l.syncPendente = false;
      enviados++;
    } catch { /* offline/erro: continua pendente */ }
  }
  if (enviados) saveLeituras(lista);
  return enviados;
}

export async function pullLeiturasCompact(gradeId: string): Promise<number> {
  if (!usarDadosSupabase() || !navigator.onLine) return 0;
  const remotas = await carregarDocsPorCampoSupabase<LeituraCompactacao>(COLECAO_LEIT, 'gradeId', gradeId);
  if (!remotas.length) return 0;
  const lista = loadLeituras();
  let novas = 0;
  for (const r of remotas) {
    const idx = lista.findIndex(l => l.id === r.id);
    if (idx < 0) { lista.push({ ...r, syncPendente: false }); novas++; }
    else if (!lista[idx].syncPendente && r.atualizadoEm > lista[idx].atualizadoEm) {
      lista[idx] = { ...r, syncPendente: false }; novas++;
    }
  }
  if (novas) saveLeituras(lista);
  return novas;
}

// ── Fotos (IndexedDB) ─────────────────────────────────────────────────────────

export type TipoFoto = 'antes' | 'durante' | 'depois';

export interface FotoColeta {
  id: string;
  coletaId: string;
  tipo: TipoFoto;
  blob: Blob;
  criadoEm: string;
  sync: boolean;
  pend?: number;   // 1 = pendente de envio, 0 = sincronizada. Índice numérico
                   // (IndexedDB não indexa boolean) para CONTAR/listar as
                   // pendentes SEM carregar os blobs na memória.
}

const DB_NOME = 'inv_coleta';
const STORE_FOTOS = 'fotos';

function abrirDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      const txUp = req.transaction!;   // transação de versionchange
      let st: IDBObjectStore;
      if (!db.objectStoreNames.contains(STORE_FOTOS)) {
        st = db.createObjectStore(STORE_FOTOS, { keyPath: 'id' });
        st.createIndex('coletaId', 'coletaId');
      } else {
        st = txUp.objectStore(STORE_FOTOS);
      }
      // v2: índice numérico `pend` para contar/listar pendentes SEM ler os blobs
      // (antes contarFotosPendentes fazia getAll() de TODAS as fotos a cada
      // coleta → memória estourava e o app travava). Preenche as fotos antigas.
      if (!st.indexNames.contains('pend')) {
        st.createIndex('pend', 'pend');
        st.openCursor().onsuccess = (e) => {
          const cur = (e.target as IDBRequest<IDBCursorWithValue>).result;
          if (!cur) return;
          const v = cur.value as FotoColeta;
          if (v.pend === undefined) { v.pend = v.sync ? 0 : 1; cur.update(v); }
          cur.continue();
        };
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(modo: IDBTransactionMode, fn: (st: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return abrirDB().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE_FOTOS, modo);
    const req = fn(t.objectStore(STORE_FOTOS));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

export async function salvarFoto(coletaId: string, tipo: TipoFoto, blob: Blob): Promise<FotoColeta> {
  const foto: FotoColeta = {
    id: `${coletaId}__${tipo}_${Date.now().toString(36)}`,
    coletaId, tipo, blob, criadoEm: new Date().toISOString(), sync: false, pend: 1,
  };
  await tx('readwrite', st => st.put(foto));
  return foto;
}

// Fotos AINDA NÃO sincronizadas (via índice `pend`) — não carrega as já enviadas.
export function fotosPendentes(): Promise<FotoColeta[]> {
  return abrirDB().then(db => new Promise((resolve, reject) => {
    const req = db.transaction(STORE_FOTOS).objectStore(STORE_FOTOS).index('pend').getAll(IDBKeyRange.only(1));
    req.onsuccess = () => resolve(req.result as FotoColeta[]);
    req.onerror = () => reject(req.error);
  }));
}

export function fotosDaColeta(coletaId: string): Promise<FotoColeta[]> {
  return abrirDB().then(db => new Promise((resolve, reject) => {
    const req = db.transaction(STORE_FOTOS).objectStore(STORE_FOTOS).index('coletaId').getAll(coletaId);
    req.onsuccess = () => resolve(req.result as FotoColeta[]);
    req.onerror = () => reject(req.error);
  }));
}

export function todasFotos(): Promise<FotoColeta[]> {
  return tx('readonly', st => st.getAll()) as Promise<FotoColeta[]>;
}

export function excluirFoto(id: string): Promise<unknown> {
  return tx('readwrite', st => st.delete(id));
}

// Reduz a foto pra no máx. 1280 px (JPEG ~0.72) — cabe no campo e no Storage.
export function comprimirFoto(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1280;
      const esc = Math.min(1, MAX / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * esc);
      cv.height = Math.round(img.height * esc);
      cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height);
      cv.toBlob(b => (b ? resolve(b) : reject(new Error('Falha ao comprimir foto.'))), 'image/jpeg', 0.72);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Foto inválida.')); };
    img.src = url;
  });
}

const BUCKET_FOTOS = 'coletas';

// Sobe as fotos pendentes pro Supabase Storage (bucket 'coletas').
export async function subirFotosPendentes(): Promise<{ enviadas: number; erro?: string }> {
  if (!usarDadosSupabase() || !navigator.onLine) return { enviadas: 0 };
  const sb = getSupabase();
  if (!sb) return { enviadas: 0 };
  const fotos = await fotosPendentes();   // só as não enviadas (não a base inteira)
  let enviadas = 0;
  for (const f of fotos) {
    const path = `${f.coletaId}/${f.id}.jpg`;
    const r = await sb.storage.from(BUCKET_FOTOS).upload(path, f.blob, { contentType: 'image/jpeg', upsert: true });
    if (r.error) {
      const msg = /bucket/i.test(r.error.message)
        ? 'Bucket "coletas" não existe no Supabase Storage — crie-o para sincronizar fotos.'
        : r.error.message;
      return { enviadas, erro: msg };
    }
    await tx('readwrite', st => st.put({ ...f, sync: true, pend: 0 }));
    enviadas++;
  }
  return { enviadas };
}

// Conta as pendentes pelo ÍNDICE (count) — NÃO carrega os blobs. Roda a cada
// coleta (atualizarPendentes); antes fazia getAll() de todas as fotos → travava.
export function contarFotosPendentes(): Promise<number> {
  return abrirDB().then(db => new Promise((resolve, reject) => {
    const req = db.transaction(STORE_FOTOS).objectStore(STORE_FOTOS).index('pend').count(IDBKeyRange.only(1));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

// ── Medições de campo (polígonos/linhas) ─────────────────────────────────────
// Ficam no aparelho E sobem pra nuvem (docs no app_kv, colecao 'inv_medicoes')
// pra não se perder — na plataforma vira o repositório de medições (SHP,
// virar talhão, substituir limite…).

export type TipoMedicao = 'poligono' | 'linha' | 'ponto';

// Categorias do spec (Sistema de Medições GPS, seção 10)
export const CATEGORIAS_MEDICAO = [
  'Área de coleta', 'Falha', 'Mancha', 'Carreador', 'Divisa', 'Estrada', 'Erosão', 'Talhão', 'Outro',
] as const;

// Ponto registrado com metadados (spec seções 4.2 e 14.2)
export interface PontoMedicao {
  lng: number;
  lat: number;
  precisaoM?: number;
  velKmH?: number;
  em: string;        // data/hora do registro
}

export interface MedicaoCampo {
  id: string;
  nome: string;
  tipo: TipoMedicao;
  coords: [number, number][];
  furos?: [number, number][][]; // recortes internos (editor da plataforma)
  pontos?: PontoMedicao[];   // metadados na mesma ordem de coords
  categoria?: string;
  obs?: string;
  talhaoId?: string;
  talhaoNome?: string;
  safra?: string;            // ciclo
  criadoEm: string;
  operador?: string;
  syncPendente: boolean;
}

const KEY_MED = 'inv_medicoes';
const COLECAO_MED = 'inv_medicoes';

export function getMedicoes(): MedicaoCampo[] {
  if (typeof window === 'undefined') return [];
  try {
    const lista = JSON.parse(localStorage.getItem(KEY_MED) ?? '[]') as MedicaoCampo[];
    // medições antigas (antes da sync) não têm a flag — considera pendente
    return lista.map(m => ({ ...m, syncPendente: m.syncPendente !== false }));
  } catch { return []; }
}

function saveMedicoesLocal(lista: MedicaoCampo[]) {
  localStorage.setItem(KEY_MED, JSON.stringify(lista));
}

export function salvarMedicao(m: Omit<MedicaoCampo, 'syncPendente'>): MedicaoCampo {
  const nova: MedicaoCampo = { ...m, syncPendente: true };
  const lista = getMedicoes().filter(x => x.id !== m.id);
  lista.push(nova);
  saveMedicoesLocal(lista);
  void pushMedicoesPendentes().catch(() => {});
  return nova;
}

export function excluirMedicao(id: string) {
  saveMedicoesLocal(getMedicoes().filter(m => m.id !== id));
  if (usarDadosSupabase() && navigator.onLine) void excluirDocSupabase(COLECAO_MED, id).catch(() => {});
}

// Repositório (painel web): TODAS as medições — nuvem + locais, unidas por id
// (a versão da nuvem prevalece por já estar sincronizada entre aparelhos).
export async function carregarMedicoes(): Promise<MedicaoCampo[]> {
  const locais = getMedicoes();
  const porId = new Map<string, MedicaoCampo>();
  for (const m of locais) porId.set(m.id, m);
  if (usarDadosSupabase() && typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const nuvem = await carregarColecaoSupabase<MedicaoCampo>(COLECAO_MED);
      for (const m of nuvem) porId.set(m.id, { ...m, syncPendente: false });
    } catch { /* offline/erro: fica só com as locais */ }
  }
  return [...porId.values()].sort((a, b) => (b.criadoEm ?? '').localeCompare(a.criadoEm ?? ''));
}

export async function pushMedicoesPendentes(): Promise<number> {
  if (!usarDadosSupabase() || (typeof navigator !== 'undefined' && !navigator.onLine)) return 0;
  const lista = getMedicoes();
  let enviadas = 0;
  for (const m of lista.filter(x => x.syncPendente)) {
    try {
      const ok = await salvarDocSupabase(COLECAO_MED, m.id, { ...m, syncPendente: false });
      if (!ok) continue;
      m.syncPendente = false;
      enviadas++;
    } catch { /* segue pendente */ }
  }
  if (enviadas) saveMedicoesLocal(lista);
  return enviadas;
}

// ── GPS / geometria ───────────────────────────────────────────────────────────

export function distanciaM(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function formatarDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

// Polígono circular geodésico (pro raio permitido e círculo de precisão).
export function circuloGeo(lng: number, lat: number, raioM: number, n = 48): GeoJSON.Feature {
  const rad = Math.PI / 180;
  const dLat = raioM / 111320;
  const dLng = raioM / (111320 * Math.cos(lat * rad));
  const coords: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * 2 * Math.PI;
    coords.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } };
}

// ── Aviso ao entrar no raio (vibração + som) ─────────────────────────────────

export function avisoDentroRaio() {
  try { navigator.vibrate?.([250, 120, 250]); } catch {}
  try {
    type JanelaAudio = Window & { webkitAudioContext?: typeof AudioContext };
    const AC = window.AudioContext ?? (window as JanelaAudio).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = 880;
    osc.connect(gain); gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    osc.onended = () => { void ctx.close().catch(() => {}); };
  } catch {}
}

// ── Mapa offline (download de tiles pro Cache Storage) ───────────────────────

const CACHE_TILES = 'coleta-tiles';
const URL_SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile';

function tileXY(lng: number, lat: number, z: number): [number, number] {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const rad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  return [x, y];
}

// URLs dos tiles de satélite que cobrem o bbox (z 12–17).
function urlsTiles(bbox: [number, number, number, number]): string[] {
  const urls: string[] = [];
  for (let z = 12; z <= 17; z++) {
    const [x0, y1] = tileXY(bbox[0], bbox[1], z);
    const [x1, y0] = tileXY(bbox[2], bbox[3], z);
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
        urls.push(`${URL_SAT}/${z}/${y}/${x}`);
      }
    }
  }
  return urls;
}

// Baixa uma lista de tiles pro Cache Storage (o mesmo que o mapa lê).
async function baixarUrls(
  urls: string[],
  onProgresso?: (feitos: number, total: number) => void,
): Promise<{ total: number; ok: number }> {
  const cache = await caches.open(CACHE_TILES);
  let ok = 0, feitos = 0;
  const LOTE = 8;
  for (let i = 0; i < urls.length; i += LOTE) {
    await Promise.all(urls.slice(i, i + LOTE).map(async (u) => {
      try {
        if (!(await cache.match(u))) {
          const r = await fetch(u);
          if (r.ok) await cache.put(u, r);
        }
        ok++;
      } catch { /* tile falhou — segue */ }
      feitos++;
      onProgresso?.(feitos, urls.length);
    }));
  }
  return { total: urls.length, ok };
}

// Baixa os tiles de satélite do bbox (z 12–17) pro cache usado pelo mapa.
export async function baixarTilesOffline(
  bbox: [number, number, number, number],
  onProgresso?: (feitos: number, total: number) => void,
): Promise<{ total: number; ok: number }> {
  return baixarUrls(urlsTiles(bbox), onProgresso);
}

// Baixa vários bboxes de uma vez, com DEDUP dos tiles sobrepostos entre talhões
// vizinhos (o "baixar todos da safra" não rebaixa a mesma imagem).
export async function baixarTilesVarios(
  bboxes: [number, number, number, number][],
  onProgresso?: (feitos: number, total: number) => void,
): Promise<{ total: number; ok: number }> {
  const set = new Set<string>();
  for (const b of bboxes) for (const u of urlsTiles(b)) set.add(u);
  return baixarUrls([...set], onProgresso);
}

// ── Service worker / instalação ───────────────────────────────────────────────

export function registrarSWColeta() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  // Em dev (localhost) o SW serviria chunks VELHOS (sem hash) — não registra.
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
  navigator.serviceWorker.register('/sw-coleta.js').catch(() => {});
}

// ── Configuração local do app de campo ───────────────────────────────────────

export interface ConfigColeta {
  raioM: number; // raio permitido pra habilitar a coleta
}

const KEY_CFG = 'inv_coleta_cfg';

export function getConfigColeta(): ConfigColeta {
  try {
    const c = JSON.parse(localStorage.getItem(KEY_CFG) ?? '{}');
    return { raioM: Number(c.raioM) || 15 };
  } catch { return { raioM: 15 }; }
}

export function saveConfigColeta(cfg: ConfigColeta) {
  localStorage.setItem(KEY_CFG, JSON.stringify(cfg));
}

// ── Manchas de NDVI baixadas p/ o campo (offline) — #37 ──────────────────────
// Ao preparar no Wi-Fi, o índice escolhido é COLORIDO num PNG e guardado no
// aparelho (com o bbox), pra navegar até a mancha no campo SEM sinal.
export interface ManchaOffline {
  id: string;                 // talhaoId__indice__data
  talhaoId: string;
  talhaoNome: string;
  indice: string;             // 'NDVI', 'SAVI'…
  data: string;               // 'AAAA-MM-DD'
  fonte: string;              // 'S2' | 'CBERS'
  dataUrl: string;            // PNG já colorido (offline)
  bounds: [number, number, number, number];   // [w,s,e,n] da imagem
  criadoEm: string;
}

const KEY_MANCHAS = 'inv_manchas';

export function getManchasOffline(): ManchaOffline[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(KEY_MANCHAS) ?? '[]'); } catch { return []; }
}
export function getManchasDoTalhao(talhaoId: string): ManchaOffline[] {
  return getManchasOffline().filter(m => m.talhaoId === talhaoId).sort((a, b) => b.data.localeCompare(a.data));
}
export function salvarManchaOffline(m: ManchaOffline) {
  const lista = getManchasOffline().filter(x => x.id !== m.id);
  lista.push(m);
  try { localStorage.setItem(KEY_MANCHAS, JSON.stringify(lista)); } catch { /* sem espaço */ }
}
export function excluirMancha(id: string) {
  try { localStorage.setItem(KEY_MANCHAS, JSON.stringify(getManchasOffline().filter(m => m.id !== id))); } catch { /* sem storage */ }
}

// ── Carimbo da última sincronização (mostrado no topo da lista) ───────────────
const KEY_ULT_SYNC = 'inv_coleta_ultimo_sync';

export function marcarUltimoSync() {
  try { localStorage.setItem(KEY_ULT_SYNC, new Date().toISOString()); } catch { /* sem storage */ }
}
export function ultimoSync(): string | null {
  try { return localStorage.getItem(KEY_ULT_SYNC); } catch { return null; }
}
