'use client';

// Importação de resultados de laboratório (CSV/XLSX/XLS) e casamento com os
// pontos da grade. Cada lab tem um "perfil" (config) que diz onde estão o nº do
// ponto, talhão, profundidade, campanha e cada elemento. Elementos = ids da Base
// Agronômica. Validado contra arquivos reais (Fundação ABC, Interpartner).

import type { GradeAmostragem } from './store';
// Extensão .ts explícita: o teste roda em node puro (type-stripping), que não
// resolve import sem extensão — mesmo padrão de periodo/faixas/prescricao.
import { converterParaCanonico, casarUnidade, ehRotuloSemUnidade } from './unidades.ts';

// O núcleo puro vive em ./laudo/nucleo.ts para servir TAMBÉM ao servidor (rota
// de ingestão da API). Re-exportado aqui: quem importa de './lab' segue igual.
import {
  ELEMENTOS_LAB, DERIVADOS_LAB, DERIVADOS_IDS, simboloElemento,
  calcularDerivados, norm, normCab, parseNum, valorLab,
  type ResultadoAmostra,
} from './laudo/nucleo.ts';
export {
  ELEMENTOS_LAB, DERIVADOS_LAB, DERIVADOS_IDS, simboloElemento,
  calcularDerivados, norm, normCab, parseNum, valorLab,
};
export type { ResultadoAmostra };

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
  linhaUnidades?: number;           // 2ª linha de cabeçalho só com a unidade de cada coluna
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


export interface AplicacaoResult {
  resultados: ResultadoAmostra[];
  talhoes: string[];
  campanhas: string[];
  total: number;
  ignoradas: number;
}

// Aplica o perfil sobre a matriz, opcionalmente filtrando por talhão (contém).
export function aplicarPerfil(aoa: string[][], cfg: PerfilLabConfig, filtroTalhao?: string): AplicacaoResult {
  // Os dados começam depois da linha de unidades quando ela existe (senão ela
  // entra como linha de amostra e só não estraga porque o id não é numérico).
  const dados = aoa.slice((cfg.linhaUnidades ?? cfg.linhaCabecalho ?? 0) + 1);
  const reNum = cfg.regexNumero ? new RegExp(cfg.regexNumero, 'i') : null;
  const reTal = cfg.regexTalhao ? new RegExp(cfg.regexTalhao, 'i') : null;
  const reProf = cfg.regexProfundidade ? new RegExp(cfg.regexProfundidade, 'i') : null;
  const f = filtroTalhao ? norm(filtroTalhao) : '';
  const mapa = new Map<string, ResultadoAmostra>();
  const talhoes = new Set<string>();
  const campanhas = new Set<string>();
  let ignoradas = 0;
  let talhaoAnterior = '';   // p/ herdar em planilha de célula mesclada (talhão só na 1ª linha)

  for (const row of dados) {
    const idText = String(row[cfg.colId] ?? '');
    let numero = NaN;
    if (reNum) { const m = idText.match(reNum); if (m) numero = parseInt(m[1], 10); }
    else numero = parseInt(idText.replace(/\D/g, ''), 10);
    if (!numero) { ignoradas++; continue; }

    let talhao = '';
    if (cfg.colTalhao != null) talhao = String(row[cfg.colTalhao] ?? '').trim();
    else if (reTal) { const m = idText.match(reTal); if (m) talhao = m[1].trim(); }
    // Célula mesclada: linha sem talhão herda o da linha anterior (senão as linhas
    // macro+micro do mesmo ponto ganham chaves diferentes e não fundem, e a linha
    // ficaria de fora do filtro por talhão).
    if (talhao) talhaoAnterior = talhao; else talhao = talhaoAnterior;
    if (talhao) talhoes.add(talhao);
    if (f && talhao && !(norm(talhao).includes(f) || f.includes(norm(talhao)))) { ignoradas++; continue; }

    let prof = '';
    if (cfg.colProfundidade != null) prof = String(row[cfg.colProfundidade] ?? '').trim();
    else if (reProf) { const m = idText.match(reProf); if (m) prof = m[1].trim(); }

    const campanha = cfg.colCampanha != null ? String(row[cfg.colCampanha] ?? '').trim() : '';

    const valores: Record<string, number> = {};
    for (const [elId, idx] of Object.entries(cfg.elementos)) {
      const v = valorLab(row[idx]);   // N.D./N/D e "<x" viram 0; vazio segue sem valor
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

  // Colunas calculadas (t/CTCef, K%, Ca%, Mg%): só AQUI, com os valores já
  // fundidos (linhas macro+micro do mesmo ponto já unidas), senão a soma/razão
  // sairia de uma linha parcial.
  const resultados = [...mapa.values()].sort((a, b) => a.numero - b.numero || a.profundidade.localeCompare(b.profundidade));
  for (const r of resultados) calcularDerivados(r.valores);
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
  const achar = (ps: string[]) => headers.findIndex((h, i) => !usados.has(i) && ps.some(p => normCab(h).includes(p)));

  const colId = achar(['amostra', 'ponto', 'numero', 'idamostra']);
  if (colId >= 0) usados.add(colId);
  const colProf = achar(['profundidade', 'prof', 'camada']);
  if (colProf >= 0) usados.add(colProf);

  const elementos: Record<string, number> = {};
  for (const el of vars) {
    const idx = headers.findIndex((h, i) => !usados.has(i) && casaCabecalho(h, el.sinonimos));
    if (idx >= 0) { elementos[el.id] = idx; usados.add(idx); }
  }

  const config: PerfilLabConfig = {
    linhaCabecalho: hi, colId: colId >= 0 ? colId : 0,
    colProfundidade: colProf >= 0 ? colProf : undefined, elementos,
  };
  const detalhes = lerLinhaUnidades(aoa[hi + 1], elementos);
  if (detalhes) { config.linhaUnidades = hi + 1; if (Object.keys(detalhes).length) config.detalhes = detalhes; }
  return { config, headers };
}

// Um cabeçalho casa com a variável? Sinônimo com < 3 letras exige igualdade
// (senão "P" pegaria qualquer coluna com "p" no nome); a partir de 3, basta estar
// contido ("Argila (%)" casa 'argila').
function casaCabecalho(header: string, sinonimos: string[]): boolean {
  const n = normCab(header);
  return sinonimos.includes(n) || sinonimos.some(s => s.length >= 3 && n.includes(s));
}

// A linha logo abaixo do cabeçalho é a linha de UNIDADES? (export InCeres e afins
// trazem "mmolc/dm³", "g/dm³", "Sem Unidade"…). Só aceita se NENHUMA coluna
// mapeada tiver número — uma linha de amostra jamais passa por aqui — e se a
// maioria das células for unidade reconhecida. Devolve as unidades por elemento
// (p/ cfg.detalhes → conversão correta) ou null se não é linha de unidades.
function lerLinhaUnidades(linha: string[] | undefined, elementos: Record<string, number>): Record<string, { unidade?: string }> | null {
  const cols = Object.entries(elementos);
  if (!linha || cols.length === 0) return null;
  const detalhes: Record<string, { unidade?: string }> = {};
  let reconhecidas = 0;
  for (const [elId, idx] of cols) {
    const cel = String(linha[idx] ?? '');
    if (parseNum(cel) != null) return null;                 // tem número → é linha de dado
    const u = casarUnidade(elId, cel);
    if (u) { detalhes[elId] = { unidade: u }; reconhecidas++; }
    else if (ehRotuloSemUnidade(cel)) reconhecidas++;
  }
  return reconhecidas >= Math.max(2, Math.ceil(cols.length * 0.6)) ? detalhes : null;
}

// ── Perfis embutidos (validados contra arquivos reais) ───────────────────────
export interface PerfilLabBuiltin {
  id: string; nome: string; config: PerfilLabConfig;
  /** Layout em COLUNAS com nº de colunas variável: em vez da config estática,
   *  roda `autoConfig` sobre o arquivo (mesmo caminho do "Detectar
   *  automaticamente", só que com nome fixo e reconhecível na lista). */
  auto?: boolean;
  /** Assinatura do layout: valores `normCab` esperados no INÍCIO da linha de
   *  cabeçalho. Batendo, o perfil é pré-selecionado ao carregar o arquivo. */
  assinatura?: string[];
}

/** Perfil marcado na tela antes de qualquer arquivo (o de layout mais antigo e
 *  específico; assim que um arquivo entra, `escolherPerfil` decide). */
export const PERFIL_PADRAO = 'fundacao-abc';

export const PERFIS_BUILTIN: PerfilLabBuiltin[] = [
  {
    // Export "em colunas" da InCeres, usado também por laudos da Interpartner:
    // linha 1 = nomes, linha 2 = UNIDADES, `id` e `prof` nas duas primeiras
    // colunas. Mesma assinatura que scripts/migracao-acervo/importar.mjs já usa.
    id: 'inceres',
    nome: 'InCeres / Interpartner (colunas id · prof)',
    auto: true,
    assinatura: ['id', 'prof'],
    config: { colId: 0, elementos: {} },
  },
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

// ── O perfil é DESTE arquivo? ────────────────────────────────────────────────
// Perfis posicionais (colunas fixas) casam por ACASO quando o arquivo tem o
// mesmo nº de colunas — e aí a importação entra inteira com os valores TROCADOS,
// sem erro nenhum (o pH do laudo virando P, o P virando pH…). A pontuação
// compara o que o perfil espera em cada coluna com o cabeçalho que está lá.
export interface PontuacaoPerfil {
  acertos: number;
  esperados: number;
  /** confiança 0..1 (1 quando não há como julgar) */
  confianca: number;
  /** 1º desencontro, p/ o aviso ficar concreto */
  exemplo?: { elId: string; coluna: number; cabecalho: string };
}

export function pontuarPerfil(
  aoa: string[][], cfg: PerfilLabConfig,
  vars: { id: string; sinonimos: string[] }[] = ELEMENTOS_LAB,
): PontuacaoPerfil {
  const headers = aoa[cfg.linhaCabecalho ?? 0] ?? [];
  let acertos = 0, esperados = 0;
  let exemplo: PontuacaoPerfil['exemplo'];
  for (const [elId, idx] of Object.entries(cfg.elementos)) {
    const sin = vars.find(v => v.id === elId)?.sinonimos ?? [];
    if (sin.length === 0) continue;                 // variável derivada/sem sinônimo: não dá p/ julgar
    esperados++;
    const cab = String(headers[idx] ?? '');
    if (casaCabecalho(cab, sin)) acertos++;
    else exemplo ??= { elId, coluna: idx, cabecalho: cab };
  }
  return { acertos, esperados, confianca: esperados === 0 ? 1 : acertos / esperados, exemplo };
}

/** Abaixo disto o perfil é tratado como "não é deste arquivo". */
export const CONFIANCA_MINIMA = 0.6;

// Perfil a pré-selecionar quando um arquivo é carregado. Sem isto a tela abria
// SEMPRE no primeiro perfil da lista — que, para um laudo de outro layout, dá
// "Nenhuma amostra" e parece que o app não reconheceu a planilha.
export function escolherPerfil(
  aoa: string[][],
  salvos: { id: string; config: PerfilLabConfig }[] = [],
  vars: { id: string; sinonimos: string[] }[] = ELEMENTOS_LAB,
): string {
  const { config: autoCfg, headers } = autoConfig(aoa, vars);

  // 1) assinatura do layout (o cabeçalho diz de que export é o arquivo)
  const porAssinatura = PERFIS_BUILTIN.find(b =>
    b.assinatura?.length && b.assinatura.every((s, i) => normCab(headers[i] ?? '') === s));
  if (porAssinatura) return porAssinatura.id;

  // 2) perfil posicional cujas colunas realmente batem com o cabeçalho
  let melhor = { id: '', confianca: 0 };
  for (const p of [...PERFIS_BUILTIN.filter(b => !b.auto), ...salvos]) {
    const { esperados, confianca } = pontuarPerfil(aoa, p.config, vars);
    if (esperados === 0 || confianca <= melhor.confianca) continue;
    if (aplicarPerfil(aoa, p.config).resultados.length > 0) melhor = { id: p.id, confianca };
  }
  if (melhor.confianca >= CONFIANCA_MINIMA) return melhor.id;

  // 3) auto, se conseguiu mapear alguma coisa; senão deixa como estava
  return Object.keys(autoCfg.elementos).length >= 3 ? 'auto' : PERFIL_PADRAO;
}

// nº de pontos da grade (para informar casamento na UI)
export function numerosDaGrade(grade: GradeAmostragem | null): Set<number> {
  return new Set((grade?.pontos ?? []).map(p => p.numero ?? p.ordem + 1));
}
