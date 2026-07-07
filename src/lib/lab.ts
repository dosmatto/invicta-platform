'use client';

// Importação de resultados de laboratório (CSV/XLSX/XLS) e casamento com os
// pontos da grade. Cada lab tem um "perfil" (config) que diz onde estão o nº do
// ponto, talhão, profundidade, campanha e cada elemento. Elementos = ids da Base
// Agronômica. Validado contra arquivos reais (Fundação ABC, Interpartner).

import type { GradeAmostragem } from './store';
import { converterParaCanonico } from './unidades';

export const ELEMENTOS_LAB: { id: string; simbolo: string; sinonimos: string[] }[] = [
  { id: 'ph',  simbolo: 'pH',  sinonimos: ['ph', 'phcacl2', 'phcacl', 'phh2o', 'phagua', 'phsmp'] },
  { id: 'p',   simbolo: 'P',   sinonimos: ['p', 'pmehlich', 'pmeh', 'fosforo', 'presina', 'pmel'] },
  { id: 'k',   simbolo: 'K',   sinonimos: ['k', 'potassio'] },
  { id: 'ca',  simbolo: 'Ca',  sinonimos: ['ca', 'calcio'] },
  { id: 'mg',  simbolo: 'Mg',  sinonimos: ['mg', 'magnesio'] },
  { id: 'al',  simbolo: 'Al',  sinonimos: ['al', 'aluminio'] },
  { id: 'ctc', simbolo: 'CTC', sinonimos: ['ctc', 'ctcph7', 'captrocacations', 'capacidadetrocacationica'] },
  { id: 'v',   simbolo: 'V%',  sinonimos: ['v', 'v%', 'vperc', 'saturacaobases', 'satbases'] },
  { id: 'm',   simbolo: 'm%',  sinonimos: ['m%', 'mperc', 'saturacaoaluminio', 'satal', 'aluminioctcefetiva'] },
  { id: 'mo',  simbolo: 'MO',  sinonimos: ['mo', 'materiaorganica', 'morg'] },
  { id: 's',   simbolo: 'S',   sinonimos: ['s', 'enxofre', 'sso4'] },
  { id: 'b',   simbolo: 'B',   sinonimos: ['b', 'boro'] },
  { id: 'zn',  simbolo: 'Zn',  sinonimos: ['zn', 'zinco'] },
  { id: 'cu',  simbolo: 'Cu',  sinonimos: ['cu', 'cobre'] },
  { id: 'mn',  simbolo: 'Mn',  sinonimos: ['mn', 'manganes'] },
  { id: 'textura', simbolo: 'Textura', sinonimos: ['textura', 'argila', 'granulometria'] },
];

export const simboloElemento = (id: string) => ELEMENTOS_LAB.find(e => e.id === id)?.simbolo ?? id;

export const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9%]/g, '');

// Número PT/US, rejeitando datas e tokens não-numéricos (N.D, <x, -, 4/30/00…).
export function parseNum(s: string | number | null | undefined): number | null {
  if (s == null) return null;
  const t = String(s).trim();
  if (t === '' || /^n\.?d\.?$/i.test(t) || t === '-' || t.startsWith('<') || t.startsWith('>') || t.includes('/')) return null;
  let x = t.replace(/[^\d.,-]/g, '');
  if (x.includes(',') && x.includes('.')) x = x.replace(/\./g, '').replace(',', '.');
  else if (x.includes(',')) x = x.replace(',', '.');
  const v = parseFloat(x);
  return isFinite(v) ? v : null;
}

// ── Leitura do arquivo → matriz de strings (aoa) ─────────────────────────────
function splitLinhaCSV(l: string, delim: string): string[] {
  const out: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (q) { if (ch === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else { if (ch === '"') q = true; else if (ch === delim) { out.push(cur); cur = ''; } else cur += ch; }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function parseCSV(text: string): string[][] {
  const linhas = text.split(/\r\n|\n|\r/).filter(l => l.length > 0);
  if (linhas.length === 0) return [];
  const conta = (ch: string) => linhas[0].split(ch).length - 1;
  const delim = [[';', conta(';')], [',', conta(',')], ['\t', conta('\t')]].sort((a, b) => (b[1] as number) - (a[1] as number))[0];
  const d = (delim[1] as number) > 0 ? (delim[0] as string) : ';';
  return linhas.map(l => splitLinhaCSV(l, d));
}

// Lê o arquivo (browser File) e devolve a matriz de células (string[][]).
// CSV é parseado manualmente (evita coerção de data/número do SheetJS); XLS/XLSX via SheetJS.
export async function lerArquivo(file: File): Promise<string[][]> {
  const nome = file.name.toLowerCase();
  const buf = await file.arrayBuffer();
  if (nome.endsWith('.csv') || nome.endsWith('.txt')) {
    let txt = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    if (txt.includes('�')) txt = new TextDecoder('windows-1252').decode(buf);
    return parseCSV(txt);
  }
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buf, { type: 'array', codepage: 1252 });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, raw: false, defval: '' }).map(r => r.map(c => String(c ?? '')));
}

// ── Perfil (config por lab) ──────────────────────────────────────────────────
export interface PerfilLabConfig {
  linhaCabecalho?: number;          // 0-based; undefined = auto
  colProtocolo?: number;            // coluna do id único da amostra (merge de linhas)
  colId: number;                    // coluna do identificador do ponto
  regexNumero?: string;             // extrai nº (grupo 1) da colId; vazio = colId já é o número
  colTalhao?: number;
  regexTalhao?: string;             // extrai talhão (grupo 1) da colId
  colProfundidade?: number;
  regexProfundidade?: string;
  colCampanha?: number;             // ex: Ordem de Serviço / data
  elementos: Record<string, number>; // elementId -> índice de coluna
  // Unidade/extrator REAIS deste laboratório por variável (ex.: k -> mmolc/dm³ ·
  // Mehlich). Opcional/retrocompatível; a unidade de referência fica no catálogo.
  detalhes?: Record<string, { unidade?: string; extrator?: string }>;
}

export interface ResultadoAmostra {
  numero: number;
  profundidade: string;
  talhao: string;
  campanha: string;
  valores: Record<string, number>;
}

export interface AplicacaoResult {
  resultados: ResultadoAmostra[];
  talhoes: string[];
  campanhas: string[];
  total: number;
  ignoradas: number;
}

// Aplica o perfil sobre a matriz, opcionalmente filtrando por talhão (contém).
export function aplicarPerfil(aoa: string[][], cfg: PerfilLabConfig, filtroTalhao?: string): AplicacaoResult {
  const dados = aoa.slice((cfg.linhaCabecalho ?? 0) + 1);
  const reNum = cfg.regexNumero ? new RegExp(cfg.regexNumero, 'i') : null;
  const reTal = cfg.regexTalhao ? new RegExp(cfg.regexTalhao, 'i') : null;
  const reProf = cfg.regexProfundidade ? new RegExp(cfg.regexProfundidade, 'i') : null;
  const f = filtroTalhao ? norm(filtroTalhao) : '';
  const mapa = new Map<string, ResultadoAmostra>();
  const talhoes = new Set<string>();
  const campanhas = new Set<string>();
  let ignoradas = 0;

  for (const row of dados) {
    const idText = String(row[cfg.colId] ?? '');
    let numero = NaN;
    if (reNum) { const m = idText.match(reNum); if (m) numero = parseInt(m[1], 10); }
    else numero = parseInt(idText.replace(/\D/g, ''), 10);
    if (!numero) { ignoradas++; continue; }

    let talhao = '';
    if (cfg.colTalhao != null) talhao = String(row[cfg.colTalhao] ?? '').trim();
    else if (reTal) { const m = idText.match(reTal); if (m) talhao = m[1].trim(); }
    if (talhao) talhoes.add(talhao);
    if (f && talhao && !(norm(talhao).includes(f) || f.includes(norm(talhao)))) { ignoradas++; continue; }

    let prof = '';
    if (cfg.colProfundidade != null) prof = String(row[cfg.colProfundidade] ?? '').trim();
    else if (reProf) { const m = idText.match(reProf); if (m) prof = m[1].trim(); }

    const campanha = cfg.colCampanha != null ? String(row[cfg.colCampanha] ?? '').trim() : '';

    const valores: Record<string, number> = {};
    for (const [elId, idx] of Object.entries(cfg.elementos)) {
      const v = parseNum(row[idx]);
      // Converte a unidade DAQUELE lab (cfg.detalhes) → unidade canônica da
      // plataforma (mmolc/dm³, mg/dm³, g/dm³…) p/ os dados serem comparáveis.
      if (v != null) valores[elId] = converterParaCanonico(elId, v, cfg.detalhes?.[elId]?.unidade);
    }
    if (Object.keys(valores).length === 0) { ignoradas++; continue; }
    if (campanha) campanhas.add(campanha);

    // Protocolo é único por amostra; no fallback, inclui o talhão pois em arquivos
    // multi-talhão cada talhão renumera pontos 1..N (sem talhão, amostras de
    // talhões diferentes com mesmo nº/prof/campanha se fundiriam e uma sumiria).
    const key = (cfg.colProtocolo != null && row[cfg.colProtocolo]) ? String(row[cfg.colProtocolo]) : `${norm(talhao)}|${campanha}|${numero}|${norm(prof)}`;
    const ex = mapa.get(key);
    if (ex) Object.assign(ex.valores, valores);
    else mapa.set(key, { numero, profundidade: prof, talhao, campanha, valores });
  }

  const resultados = [...mapa.values()].sort((a, b) => a.numero - b.numero || a.profundidade.localeCompare(b.profundidade));
  return { resultados, talhoes: [...talhoes], campanhas: [...campanhas], total: dados.length, ignoradas };
}

// Detecta um perfil simples (colunas limpas) a partir dos cabeçalhos — para labs
// novos com layout direto (uma coluna por elemento + nº/profundidade).
// `vars` = catálogo de variáveis a mapear (padrão: a lista fixa; o caller passa
// as Variáveis de Análise ativas da Biblioteca p/ incluir as criadas pelo usuário).
export function autoConfig(
  aoa: string[][],
  vars: { id: string; sinonimos: string[] }[] = ELEMENTOS_LAB,
): { config: PerfilLabConfig; headers: string[] } {
  let hi = 0;
  for (let i = 0; i < Math.min(aoa.length, 15); i++) {
    if ((aoa[i] ?? []).filter(c => String(c).trim()).length >= 3) { hi = i; break; }
  }
  const headers = (aoa[hi] ?? []).map((h, i) => String(h ?? '').trim() || `col${i + 1}`);
  const usados = new Set<number>();
  const achar = (ps: string[]) => headers.findIndex((h, i) => !usados.has(i) && ps.some(p => norm(h).includes(p)));

  const colId = achar(['amostra', 'ponto', 'numero', 'idamostra']);
  if (colId >= 0) usados.add(colId);
  const colProf = achar(['profundidade', 'prof', 'camada']);
  if (colProf >= 0) usados.add(colProf);

  const elementos: Record<string, number> = {};
  for (const el of vars) {
    const idx = headers.findIndex((h, i) => {
      if (usados.has(i)) return false;
      const n = norm(h);
      return el.sinonimos.includes(n) || el.sinonimos.some(s => s.length >= 3 && n.includes(s));
    });
    if (idx >= 0) { elementos[el.id] = idx; usados.add(idx); }
  }
  return {
    config: { linhaCabecalho: hi, colId: colId >= 0 ? colId : 0, colProfundidade: colProf >= 0 ? colProf : undefined, elementos },
    headers,
  };
}

// ── Perfis embutidos (validados contra arquivos reais) ───────────────────────
export interface PerfilLabBuiltin { id: string; nome: string; config: PerfilLabConfig; }

export const PERFIS_BUILTIN: PerfilLabBuiltin[] = [
  {
    id: 'fundacao-abc',
    nome: 'Fundação ABC',
    config: {
      linhaCabecalho: 0, colProtocolo: 4, colId: 10,
      regexNumero: '(?:ponto|id)\\s*:?\\s*(\\d+)',
      regexTalhao: 'TH:\\s*([^-]+?)\\s*-',
      colProfundidade: 9, colCampanha: 3,
      elementos: { p: 11, mo: 12, ph: 13, al: 15, k: 16, ca: 17, mg: 18, ctc: 20, v: 21, m: 22, b: 23, cu: 24, mn: 26, zn: 27, s: 28, textura: 29 },
    },
  },
  {
    id: 'fundacao-abc-planilha',
    nome: 'Fundação ABC (planilha)',
    config: {
      linhaCabecalho: 1, colId: 0, regexNumero: '(\\d+)', colProfundidade: 1,
      elementos: { p: 2, mo: 3, ph: 4, al: 5, k: 6, ca: 7, mg: 8, ctc: 9, v: 10, m: 11, textura: 13, s: 14, b: 15, cu: 16, mn: 18, zn: 19 },
    },
  },
  {
    id: 'interpartner-antigo',
    nome: 'Interpartner (antigo)',
    config: {
      linhaCabecalho: 10, colProtocolo: 0, colId: 1,
      regexNumero: '^\\s*(\\d+)\\s*-',
      regexTalhao: 'Talh[ãa]o\\s*(\\S+)\\s*:',
      regexProfundidade: ':\\s*([\\d-]+\\s*cm)',
      elementos: { ph: 2, al: 4, ca: 5, mg: 6, k: 7, ctc: 9, p: 10, mo: 11 },
    },
  },
];

// nº de pontos da grade (para informar casamento na UI)
export function numerosDaGrade(grade: GradeAmostragem | null): Set<number> {
  return new Set((grade?.pontos ?? []).map(p => p.numero ?? p.ordem + 1));
}
