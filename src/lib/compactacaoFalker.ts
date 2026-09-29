// Leitor do arquivo exportado pelo penetrômetro FALKER (PenetroLOG) — CSV/XLSX.
// PURO (sem DOM, sem I/O): recebe a planilha já lida como matriz de strings
// (lerArquivo de lab.ts) e devolve os pontos no formato da ImportacaoCompactacao.
// Testado em Node: npm run teste:compactacaofalker.
//
// Layout (1ª aba):
//   linha 0   "Pasta:" | "BV-5   "            → nome da importação
//   linha 1   "Medição de Referência:" | 0
//   linha 2   cabeçalho: … Medição | Hora | Data | Profundidade Máxima (cm) |
//             … | Medição completa | … | Latitude | Longitude | … |
//             Aquisições (kPa) | 1 | 2 | … | 60      (uma coluna por cm)
//   linhas    uma medição por linha; a última é "Média" (ignorada)
//
// Regras (decididas com o usuário, iguais às do DataFarm):
//   • camada de 10 cm = MÁXIMO das leituras > 0 da faixa (lower+1 … lower+10);
//   • leitura 0/vazia = cone sem contato → ignorada; camada sem leitura válida
//     fica AUSENTE no ponto (não vira zero);
//   • kPa ÷ 1000 → MPa (a legenda oficial sys_compactacao é em MPa);
//   • medições a menos de 3 m entre si viram UM ponto, com MÉDIA por camada.

import type { PontoCompactacao } from './store.ts';

export type AgregacaoCamada = 'max' | 'media';
export type UnidadeFalker = 'kPa' | 'MPa' | 'kgf/cm²';

export interface OpcoesFalker {
  passoCm?: number;              // espessura da camada (padrão 10 cm)
  agregacao?: AgregacaoCamada;   // padrão 'max'
  unidadeOrigem?: UnidadeFalker; // padrão 'kPa'
  raioAgrupamentoM?: number;     // padrão 3 m
}

export interface LayoutFalker {
  linhaCabecalho: number;
  idxLat: number;
  idxLng: number;
  idxMedicao: number;            // -1 quando ausente
  idxData: number;
  idxCompleta: number;
  colunasCm: { cm: number; idx: number }[]; // 1..N em ordem crescente
}

export interface ResumoFalker {
  nPontos: number;     // pontos finais (depois do agrupamento)
  nLidos: number;      // medições com coordenada e ao menos uma leitura válida
  agrupados: number;   // medições absorvidas por outra a < raio
  incompletos: number; // medições marcadas "Medição completa = Não"
  descartados: number; // linhas com coordenada mas sem nenhuma leitura > 0
  camadas: number;
}

export interface ResultadoFalker {
  pontos: PontoCompactacao[];
  profundidades: string[];       // '0-10', '10-20', …
  nome: string;                  // célula depois de "Pasta:" (trim)
  dataReferencia?: string;       // 'YYYY-MM-DD' (coluna Data)
  resumo: ResumoFalker;
}

// ── utilitários ─────────────────────────────────────────────────────────────
const norm = (s: unknown) =>
  String(s ?? '').replace(/^﻿/, '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');

// Aceita 1, "1", "1,5", "1.5", "1.234,5" (milhar BR).
export function numeroFalker(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// 'dd/mm/aaaa' | 'dd/mm/aa' | 'aaaa-mm-dd' → 'aaaa-mm-dd'
export function dataFalkerISO(v: unknown): string | undefined {
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (!m) return undefined;
  const d = Number(m[1]), mes = Number(m[2]);
  let a = Number(m[3]);
  if (a < 100) a += 2000;
  if (d < 1 || d > 31 || mes < 1 || mes > 12) return undefined;
  return `${a}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function fatorUnidade(u: UnidadeFalker): number {
  if (u === 'kPa') return 1 / 1000;
  if (u === 'kgf/cm²') return 0.0980665;
  return 1;
}

// Distância em metros (haversine).
export function distanciaM(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
  const R = 6371008.8, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ── detecção ────────────────────────────────────────────────────────────────
// Procura, nas primeiras linhas, um cabeçalho com Latitude e Longitude e uma
// sequência de colunas inteiras 1, 2, 3, … (≥ 10) — uma por centímetro.
export function detectarFalker(aoa: unknown[][]): LayoutFalker | null {
  const limite = Math.min(aoa.length, 20);
  for (let r = 0; r < limite; r++) {
    const row = aoa[r] ?? [];
    const cab = row.map(norm);
    const idxLat = cab.indexOf('latitude');
    const idxLng = cab.indexOf('longitude');
    if (idxLat < 0 || idxLng < 0) continue;
    const colunasCm: { cm: number; idx: number }[] = [];
    for (let i = 0; i < row.length; i++) {
      const s = String(row[i] ?? '').trim();
      if (!/^\d+$/.test(s)) continue;
      const cm = Number(s);
      if (cm === colunasCm.length + 1) colunasCm.push({ cm, idx: i });
    }
    if (colunasCm.length < 10) continue;
    return {
      linhaCabecalho: r, idxLat, idxLng,
      idxMedicao: cab.indexOf('medicao'),
      idxData: cab.indexOf('data'),
      idxCompleta: cab.indexOf('medicaocompleta'),
      colunasCm,
    };
  }
  return null;
}

function nomeDaPasta(aoa: unknown[][], ate: number): string {
  for (let r = 0; r < ate; r++) {
    const row = aoa[r] ?? [];
    const i = row.findIndex(c => norm(c).startsWith('pasta'));
    if (i < 0) continue;
    for (let j = i + 1; j < row.length; j++) {
      const s = String(row[j] ?? '').trim();
      if (s) return s;
    }
  }
  return '';
}

// ── leitura ─────────────────────────────────────────────────────────────────
interface Medicao {
  lng: number; lat: number;
  valores: Record<string, number>;
  medicao?: string; data?: string; completa?: boolean;
}

export function lerFalker(aoa: unknown[][], opcoes: OpcoesFalker = {}): ResultadoFalker {
  const lay = detectarFalker(aoa);
  if (!lay) throw new Error('Arquivo não está no layout da Falker (cabeçalho com Latitude/Longitude e colunas 1…N cm).');
  const passo = opcoes.passoCm && opcoes.passoCm > 0 ? opcoes.passoCm : 10;
  const agregacao = opcoes.agregacao ?? 'max';
  const fator = fatorUnidade(opcoes.unidadeOrigem ?? 'kPa');
  const raio = opcoes.raioAgrupamentoM ?? 3;

  const maxCm = lay.colunasCm[lay.colunasCm.length - 1].cm;
  const nCamadas = Math.ceil(maxCm / passo);
  const rotulo = (k: number) => `${k * passo}-${(k + 1) * passo}`;

  const lidas: Medicao[] = [];
  let incompletos = 0, descartados = 0;
  for (let r = lay.linhaCabecalho + 1; r < aoa.length; r++) {
    const row = aoa[r] ?? [];
    // A linha "Média" (em qualquer coluna de identificação) não é medição.
    if (row.slice(0, Math.max(lay.idxLat, 2)).some(c => norm(c) === 'media')) continue;
    const lat = numeroFalker(row[lay.idxLat]);
    const lng = numeroFalker(row[lay.idxLng]);
    if (lat == null || lng == null || (lat === 0 && lng === 0)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;

    const valores: Record<string, number> = {};
    for (let k = 0; k < nCamadas; k++) {
      const ini = k * passo + 1, fim = (k + 1) * passo;
      const leit: number[] = [];
      for (const c of lay.colunasCm) {
        if (c.cm < ini || c.cm > fim) continue;
        const v = numeroFalker(row[c.idx]);
        if (v != null && v > 0) leit.push(v);
      }
      if (leit.length === 0) continue;
      const agg = agregacao === 'max' ? Math.max(...leit) : leit.reduce((s, x) => s + x, 0) / leit.length;
      valores[rotulo(k)] = arred(agg * fator);
    }
    if (Object.keys(valores).length === 0) { descartados++; continue; }

    const med: Medicao = { lng, lat, valores };
    if (lay.idxMedicao >= 0) { const s = String(row[lay.idxMedicao] ?? '').trim(); if (s) med.medicao = s; }
    if (lay.idxData >= 0) { const d = dataFalkerISO(row[lay.idxData]); if (d) med.data = d; }
    if (lay.idxCompleta >= 0) {
      const s = norm(row[lay.idxCompleta]);
      if (s === 'sim' || s === 's' || s === 'yes') med.completa = true;
      else if (s === 'nao' || s === 'n' || s === 'no') { med.completa = false; incompletos++; }
    }
    lidas.push(med);
  }

  // Agrupamento: cada medição entra no primeiro grupo cujo centro está a < raio.
  type Grupo = { membros: Medicao[]; lng: number; lat: number };
  const grupos: Grupo[] = [];
  for (const m of lidas) {
    const g = grupos.find(x => distanciaM(x, m) < raio);
    if (!g) { grupos.push({ membros: [m], lng: m.lng, lat: m.lat }); continue; }
    g.membros.push(m);
    g.lng = g.membros.reduce((s, x) => s + x.lng, 0) / g.membros.length;
    g.lat = g.membros.reduce((s, x) => s + x.lat, 0) / g.membros.length;
  }

  const pontos: PontoCompactacao[] = grupos.map(g => {
    if (g.membros.length === 1) {
      const m = g.membros[0];
      const p: PontoCompactacao = { lng: m.lng, lat: m.lat, valores: m.valores };
      if (m.medicao) p.medicao = m.medicao;
      if (m.data) p.data = m.data;
      if (m.completa != null) p.completa = m.completa;
      return p;
    }
    const valores: Record<string, number> = {};
    for (let k = 0; k < nCamadas; k++) {
      const vs = g.membros.map(m => m.valores[rotulo(k)]).filter((v): v is number => v != null);
      if (vs.length) valores[rotulo(k)] = arred(vs.reduce((s, x) => s + x, 0) / vs.length);
    }
    const p: PontoCompactacao = { lng: g.lng, lat: g.lat, valores, agrupados: g.membros.length };
    const meds = g.membros.map(m => m.medicao).filter(Boolean);
    if (meds.length) p.medicao = meds.join('+');
    const d = g.membros.find(m => m.data)?.data;
    if (d) p.data = d;
    if (g.membros.some(m => m.completa != null)) p.completa = g.membros.every(m => m.completa !== false);
    return p;
  });

  // Camadas: de 0-10 até a mais funda com ao menos uma leitura válida.
  let ultima = -1;
  for (let k = 0; k < nCamadas; k++) if (pontos.some(p => p.valores[rotulo(k)] != null)) ultima = k;
  const profundidades = Array.from({ length: ultima + 1 }, (_, k) => rotulo(k));

  // Data de referência = a mais frequente entre as medições.
  const freq = new Map<string, number>();
  for (const m of lidas) if (m.data) freq.set(m.data, (freq.get(m.data) ?? 0) + 1);
  const dataReferencia = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];

  return {
    pontos, profundidades,
    nome: nomeDaPasta(aoa, lay.linhaCabecalho),
    dataReferencia,
    resumo: {
      nPontos: pontos.length, nLidos: lidas.length,
      agrupados: lidas.length - pontos.length,
      incompletos, descartados, camadas: profundidades.length,
    },
  };
}

// 4 casas bastam para MPa (0,0001 MPa = 0,1 kPa).
function arred(v: number): number { return Math.round(v * 10000) / 10000; }

// ── estatística de camada (UI) ──────────────────────────────────────────────
export function estatisticaCamada(pontos: PontoCompactacao[], prof: string):
  { n: number; media: number; min: number; max: number } | null {
  const vs = pontos.map(p => p.valores[prof]).filter((v): v is number => v != null && Number.isFinite(v));
  if (vs.length === 0) return null;
  return {
    n: vs.length,
    media: vs.reduce((s, x) => s + x, 0) / vs.length,
    min: Math.min(...vs),
    max: Math.max(...vs),
  };
}
