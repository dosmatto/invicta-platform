// Condutividade Elétrica — helpers próprios do módulo. O import de pontos e o
// mapeamento de colunas REUSAM a Compactação (parseArquivoPontos); aqui ficam só
// as partes específicas da EC: o índice de qualidade do levantamento.

export {
  parseArquivoPontos,
  pontosCompactacao as pontosCondutividade,
  type ArquivoPontos,
  type PontoBruto,
} from './compactacao';
import { INTERP_URL } from './interpUrl';

const semAcento = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Sugere quais colunas numéricas são profundidades de CEa (rasa/profunda) — para
// NÃO marcar tudo (velocidade, altitude, corrente… não são CEa). Se nada casar,
// devolve [] e o usuário escolhe manualmente (≥1 obrigatório).
export function sugerirProfundidadesCEa(colsNumericas: string[]): string[] {
  const re = /(condut|cea|\bec\b|shallow|deep|rasa|profund|0\s*-?\s*\d)/;
  return colsNumericas.filter(c => re.test(semAcento(c)));
}

// Reconhece a coluna de altitude/elevação (candidata a Variável Fixa = Altimetria).
export function ehColunaAltitude(coluna: string): boolean {
  return /(altitude|altimetr|eleva|elevation|\bcota\b|\baltura\b)/.test(semAcento(coluna));
}

// ── Preparo p/ KRIGAGEM (dado denso) ────────────────────────────────────────
// EC vem com milhares de pontos (coletado em movimento). Krigagem ordinária
// "pura" montaria uma matriz N×N inviável. Agregamos os pontos numa grade fina
// (média por célula) até caber num teto — reduz N e já limpa ruído de aquisição.
// Depois krigamos as médias (variograma automático + validação cruzada → RMSE).
type PontoXYV = { lng: number; lat: number; valor: number };

function binar(pts: PontoXYV[], binM: number, mLat: number, mLng: number): PontoXYV[] {
  const dLat = binM / mLat, dLng = binM / mLng;
  const cel = new Map<string, { sx: number; sy: number; sv: number; n: number }>();
  for (const p of pts) {
    const k = `${Math.floor(p.lng / dLng)}_${Math.floor(p.lat / dLat)}`;
    const c = cel.get(k);
    if (c) { c.sx += p.lng; c.sy += p.lat; c.sv += p.valor; c.n++; }
    else cel.set(k, { sx: p.lng, sy: p.lat, sv: p.valor, n: 1 });
  }
  return [...cel.values()].map(c => ({ lng: c.sx / c.n, lat: c.sy / c.n, valor: c.sv / c.n }));
}

// Devolve os pontos prontos p/ krigar (binados se necessário) + a grade usada.
export function prepararPontosKrigagem(pts: PontoXYV[], alvoMax = 600, binInicial = 10): { pontos: PontoXYV[]; binM: number; original: number } {
  const original = pts.length;
  if (original <= alvoMax) return { pontos: pts, binM: 0, original };
  const latMed = pts.reduce((s, p) => s + p.lat, 0) / original;
  const mLat = 111320, mLng = 111320 * Math.cos((latMed * Math.PI) / 180);
  let binM = binInicial, out = pts;
  for (let i = 0; i < 8; i++) {
    out = binar(pts, binM, mLat, mLng);
    if (out.length <= alvoMax) break;
    binM *= 1.5;
  }
  return { pontos: out, binM, original };
}

export type ClasseQualidade = 'Excelente' | 'Boa' | 'Regular' | 'Baixa';

export interface QualidadeEC {
  n: number;                 // nº de pontos válidos
  rmse: number | null;       // erro da validação cruzada (na unidade)
  rmseRel: number | null;    // rmse / amplitude (0..1) — menor é melhor
  classe: ClasseQualidade;
  apto: boolean;             // apto p/ gerar Zonas de Manejo (MEAP)
  motivo: string;
}

// Classifica a qualidade do levantamento a partir do erro da validação cruzada
// (krigagem) normalizado pela amplitude dos valores. Sem limpeza ainda (C1), o
// "percentual removido" entra na C2; aqui a qualidade é honesta sobre o que há.
export function avaliarQualidade(opts: { n: number; rmse: number | null; min: number | null; max: number | null }): QualidadeEC {
  const { n, rmse, min, max } = opts;
  const ampl = (min != null && max != null && max > min) ? max - min : null;
  const rmseRel = (rmse != null && ampl) ? rmse / ampl : null;

  let classe: ClasseQualidade;
  if (n < 10) classe = 'Baixa';
  else if (rmseRel == null) classe = 'Regular';
  else if (rmseRel < 0.08) classe = 'Excelente';
  else if (rmseRel < 0.15) classe = 'Boa';
  else if (rmseRel < 0.25) classe = 'Regular';
  else classe = 'Baixa';

  const apto = classe !== 'Baixa' && n >= 10;
  const motivo = n < 10
    ? 'Poucos pontos válidos (mín. ~10) para um mapa confiável.'
    : rmseRel == null
      ? 'Sem erro de validação cruzada disponível (avaliação parcial).'
      : `Erro relativo da validação cruzada de ${(rmseRel * 100).toFixed(0)}% da amplitude.`;
  return { n, rmse, rmseRel, classe, apto, motivo };
}

export const CORES_QUALIDADE: Record<ClasseQualidade, { cor: string; bg: string }> = {
  Excelente: { cor: '#86efac', bg: '#0f2a1a' },
  Boa: { cor: '#93c5fd', bg: '#0b1f3a' },
  Regular: { cor: '#fbbf24', bg: '#2d1a00' },
  Baixa: { cor: '#f87171', bg: '#2a0f12' },
};

// ── Limpeza dos pontos brutos (MapFilter) ────────────────────────────────────

export interface RelatorioLimpeza {
  n_bruto: number;
  n_apos_filtro_bruto: number;
  mapfilter_global_removidos: number;
  mapfilter_local_removidos: number;
  n_limpo: number;
  perc_removido: number;
}

// Filtra os pontos ANTES de interpolar (mesma metodologia do MapFilter da colheita):
// filtro bruto (percentil) + MapFilter global + local anisotrópico. Não interpola.
export async function limparPontosEC(pontos: PontoXYV[], params: Record<string, number> = {}): Promise<{ pontos: PontoXYV[]; relatorio: RelatorioLimpeza }> {
  let r: Response;
  try {
    r = await fetch(`${INTERP_URL}/limpar-pontos`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pontos, params }),
    });
  } catch {
    throw new Error('Interpolador desligado nesta máquina. Abra o backend (atalho INVICTA Backend) e tente de novo.');
  }
  if (!r.ok) {
    let msg = `Backend respondeu ${r.status}`;
    try { const j = await r.json(); if (j?.detail) msg = String(j.detail); } catch {}
    throw new Error(msg);
  }
  return r.json();
}

// Rasteriza os pontos (lng/lat/valor) numa IMAGEM colorida pela legenda, para
// mostrá-los no mapa como overlay (mesmo canal do raster de fertilidade, que
// renderiza de forma confiável). Devolve dataURL + bounds [w,s,e,n] p/ posicionar.
export function rasterizarPontos(
  pts: PontoXYV[], dominio: [number, number], stops: Array<[number, [number, number, number]]>,
): { dataUrl: string; bounds: [number, number, number, number]; min: number; max: number } | null {
  if (typeof document === 'undefined' || pts.length === 0) return null;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity, mn = Infinity, mx = -Infinity;
  for (const p of pts) {
    if (p.lng < w) w = p.lng; if (p.lng > e) e = p.lng;
    if (p.lat < s) s = p.lat; if (p.lat > n) n = p.lat;
    if (p.valor < mn) mn = p.valor; if (p.valor > mx) mx = p.valor;
  }
  const spanX = (e - w) || 1e-4, spanY = (n - s) || 1e-4;
  w -= spanX * 0.02; e += spanX * 0.02; s -= spanY * 0.02; n += spanY * 0.02;
  const sx = e - w, sy = n - s;
  const W = 900, H = Math.max(2, Math.min(1400, Math.round(W * sy / sx)));
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d'); if (!ctx) return null;
  for (const p of pts) {
    const x = ((p.lng - w) / sx) * W;
    const y = (1 - (p.lat - s) / sy) * H;   // norte no topo
    ctx.fillStyle = corDoValor(p.valor, dominio, stops);
    ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 6.2832); ctx.fill();
  }
  return { dataUrl: canvas.toDataURL('image/png'), bounds: [w, s, e, n], min: mn, max: mx };
}

// Cor (rgb) de um valor segundo a rampa da legenda — p/ desenhar os pontos como mapa.
export function corDoValor(v: number, dominio: [number, number], stops: Array<[number, [number, number, number]]>): string {
  const [dmin, dmax] = dominio;
  const t = dmax > dmin ? Math.min(1, Math.max(0, (v - dmin) / (dmax - dmin))) : 0;
  let a = stops[0], b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) { if (t >= stops[i][0] && t <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; break; } }
  const span = (b[0] - a[0]) || 1;
  const f = (t - a[0]) / span;
  const ch = (j: number) => Math.max(0, Math.min(255, Math.round(a[1][j] + (b[1][j] - a[1][j]) * f))).toString(16).padStart(2, '0');
  return `#${ch(0)}${ch(1)}${ch(2)}`;
}
