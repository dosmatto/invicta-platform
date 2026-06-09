'use client';

// Importação de resultados de laboratório (CSV/XLSX) e casamento com os pontos
// da grade de amostragem. Elementos alinhados aos ids da Base Agronômica.

import type { GradeAmostragem } from './store';

// Elementos canônicos (= ids da Base Agronômica) + sinônimos para auto-detecção.
export const ELEMENTOS_LAB: { id: string; simbolo: string; sinonimos: string[] }[] = [
  { id: 'ph',  simbolo: 'pH',  sinonimos: ['ph', 'phcacl2', 'phcacl', 'phh2o', 'phagua', 'phsmp'] },
  { id: 'p',   simbolo: 'P',   sinonimos: ['p', 'pmehlich', 'pmeh', 'fosforo', 'presina', 'pmel'] },
  { id: 'k',   simbolo: 'K',   sinonimos: ['k', 'potassio'] },
  { id: 'ca',  simbolo: 'Ca',  sinonimos: ['ca', 'calcio'] },
  { id: 'mg',  simbolo: 'Mg',  sinonimos: ['mg', 'magnesio'] },
  { id: 'al',  simbolo: 'Al',  sinonimos: ['al', 'aluminio'] },
  { id: 'ctc', simbolo: 'CTC', sinonimos: ['ctc', 'ctcph7', 'capacidadetrocacationica'] },
  { id: 'v',   simbolo: 'V%',  sinonimos: ['v', 'v%', 'vperc', 'saturacaobases', 'satbases'] },
  { id: 'm',   simbolo: 'm%',  sinonimos: ['m%', 'mperc', 'saturacaoaluminio', 'satal'] },
  { id: 'mo',  simbolo: 'MO',  sinonimos: ['mo', 'materiaorganica', 'morg'] },
  { id: 's',   simbolo: 'S',   sinonimos: ['s', 'enxofre', 'sso4'] },
  { id: 'b',   simbolo: 'B',   sinonimos: ['b', 'boro'] },
  { id: 'zn',  simbolo: 'Zn',  sinonimos: ['zn', 'zinco'] },
  { id: 'cu',  simbolo: 'Cu',  sinonimos: ['cu', 'cobre'] },
  { id: 'mn',  simbolo: 'Mn',  sinonimos: ['mn', 'manganes'] },
  { id: 'textura', simbolo: 'Textura', sinonimos: ['textura', 'argila', 'granulometria'] },
];

export const simboloElemento = (id: string) => ELEMENTOS_LAB.find(e => e.id === id)?.simbolo ?? id;

const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9%]/g, '');

// Número PT/US: "1.234,5" → 1234.5 · "5,2" → 5.2 · "12.5" → 12.5
export function parseNum(s: string | number | null | undefined): number | null {
  if (s == null || String(s).trim() === '') return null;
  let x = String(s).trim().replace(/[^\d.,-]/g, '');
  if (x.includes(',') && x.includes('.')) x = x.replace(/\./g, '').replace(',', '.');
  else if (x.includes(',')) x = x.replace(',', '.');
  const v = parseFloat(x);
  return isFinite(v) ? v : null;
}

export interface PlanilhaParsed { headers: string[]; linhas: Record<string, string>[]; }

// Lê CSV ou XLSX (SheetJS), detecta a linha de cabeçalho e devolve linhas por header.
export async function parsePlanilha(file: File): Promise<PlanilhaParsed> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { headers: [], linhas: [] };
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, raw: false, defval: '' });
  if (aoa.length === 0) return { headers: [], linhas: [] };
  // cabeçalho = primeira linha (nas 15 iniciais) com ≥3 células preenchidas
  let hi = 0;
  for (let i = 0; i < Math.min(aoa.length, 15); i++) {
    if (aoa[i].filter(c => String(c).trim()).length >= 3) { hi = i; break; }
  }
  const headers = aoa[hi].map((h, i) => String(h ?? '').trim() || `col${i + 1}`);
  const linhas = aoa.slice(hi + 1)
    .filter(r => r.some(c => String(c).trim()))
    .map(r => {
      const o: Record<string, string> = {};
      headers.forEach((h, i) => { o[h] = String(r[i] ?? '').trim(); });
      return o;
    });
  return { headers, linhas };
}

// Atribuição por coluna: cada header vira 'ignorar' | 'numero' | 'profundidade' | <elementId>
export type AtribuicaoColuna = Record<string, string>;

export function autoAtribuir(headers: string[]): AtribuicaoColuna {
  const at: AtribuicaoColuna = {};
  const usados = new Set<string>();
  const temPalavra = (h: string, ps: string[]) => { const n = norm(h); return ps.some(p => n.includes(p)); };

  // nº da amostra e profundidade (primeira coluna que casar)
  for (const h of headers) {
    if (!at[h] && temPalavra(h, ['amostra', 'ponto', 'numero', 'idamostra']) && !usados.has('numero')) { at[h] = 'numero'; usados.add('numero'); }
    else if (!at[h] && temPalavra(h, ['profundidade', 'prof', 'camada']) && !usados.has('profundidade')) { at[h] = 'profundidade'; usados.add('profundidade'); }
  }
  // elementos
  for (const h of headers) {
    if (at[h]) continue;
    const n = norm(h);
    for (const el of ELEMENTOS_LAB) {
      if (usados.has(el.id)) continue;
      const exato = el.sinonimos.includes(n);
      const forte = el.sinonimos.some(s => s.length >= 3 && n.includes(s));
      if (exato || forte) { at[h] = el.id; usados.add(el.id); break; }
    }
  }
  // resto = ignorar
  headers.forEach(h => { if (!at[h]) at[h] = 'ignorar'; });
  return at;
}

export interface ResultadoAmostra { numero: number; profundidade: string; valores: Record<string, number>; }
export interface CasamentoResult { resultados: ResultadoAmostra[]; totalLinhas: number; naoCasados: number; elementos: string[]; }

// Casa as linhas com os pontos da grade (por número). Mantém todos os resultados
// com número + ≥1 valor; conta os que não existem na grade (naoCasados).
export function casarComGrade(linhas: Record<string, string>[], at: AtribuicaoColuna, grade: GradeAmostragem | null): CasamentoResult {
  const colNumero = Object.keys(at).find(h => at[h] === 'numero') ?? '';
  const colProf = Object.keys(at).find(h => at[h] === 'profundidade') ?? '';
  const colsElem = Object.entries(at).filter(([, v]) => v !== 'ignorar' && v !== 'numero' && v !== 'profundidade') as [string, string][];

  const numerosGrade = grade ? new Set(grade.pontos.map(p => p.ordem + 1)) : null;
  const resultados: ResultadoAmostra[] = [];
  const elementosUsados = new Set<string>();
  let naoCasados = 0;

  for (const linha of linhas) {
    const numero = parseInt(String(linha[colNumero] ?? '').replace(/\D/g, ''), 10);
    if (!numero) continue;
    const valores: Record<string, number> = {};
    for (const [header, elId] of colsElem) {
      const v = parseNum(linha[header]);
      if (v != null) { valores[elId] = v; elementosUsados.add(elId); }
    }
    if (Object.keys(valores).length === 0) continue;
    if (numerosGrade && !numerosGrade.has(numero)) naoCasados++;
    resultados.push({ numero, profundidade: colProf ? String(linha[colProf] ?? '') : '', valores });
  }
  return { resultados, totalLinhas: linhas.length, naoCasados, elementos: [...elementosUsados] };
}
