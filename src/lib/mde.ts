// MDE + Análise Topográfica Agronômica — F1 (Essencial).
//
// Cliente do endpoint /mde (busca Copernicus GLO-30 → SRTM, deriva altitude/
// declividade/hillshade com buffer, recorta no talhão) + persistência da base
// APROVADA na nuvem (mesma coleção de mapas, prefixo mde__<talhaoId>__<id>__).
// Os grids seguem o contrato do interp (Float32 b64) — o /grid-geotiff exporta
// e o colorirGridComLegenda colore sem código novo.

import { postBackend } from './interpUrl';
import { comprimirGrid, descomprimirGrid, decodeGrid, type Grid } from './fertilidade';
import { cloudSalvarMapa, cloudCarregarMapasPorPrefixo, cloudExcluirMapasPorPrefixo } from './cloud';
import { setMdeCamadasTopo, limparMdeCamadasTopo } from './store';

export type FonteMde = 'auto' | 'cop30' | 'srtm';

export const FONTES_MDE: { id: FonteMde; rotulo: string }[] = [
  { id: 'auto', rotulo: 'Automática (melhor disponível)' },
  { id: 'cop30', rotulo: 'Copernicus DEM GLO-30 (30 m)' },
  { id: 'srtm', rotulo: 'NASADEM/SRTM (30 m)' },
];
// Fontes da spec ainda indisponíveis (mostradas desabilitadas com o motivo).
export const FONTES_MDE_INDISPONIVEIS: { rotulo: string; motivo: string }[] = [
  { rotulo: 'FABDEM (30 m, terreno corrigido)', motivo: 'licença só para uso não-comercial — aguardando alternativa' },
  { rotulo: 'ALOS AW3D30 (30 m)', motivo: 'exige chave de acesso (fase futura)' },
  { rotulo: 'MDE próprio (drone/RTK)', motivo: 'upload entra numa próxima fase' },
];

export interface StatsMde {
  alt_min: number; alt_med: number; alt_max: number; amplitude: number;
  decl_media: number | null; decl_max: number | null;
  pct_sem_dados: number; n_px: number;
}

export interface RespMde {
  fonte: string;
  rotulo: string;
  resolucao_m: number;
  bounds: [number, number, number, number];
  shape: [number, number];
  elevacao: Grid;
  declividade: Grid;
  hillshade_png: string;            // data URL (transparente fora do polígono)
  stats: StatsMde;
  histograma: { ini: number; fim: number; counts: number[] };
  avisos: string[];
}

export async function buscarMde(params: {
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  fonte?: FonteMde;
  bufferM?: number;
}): Promise<RespMde> {
  const r = await postBackend('/mde', {
    poligono: params.poligono,
    fonte: params.fonte ?? 'auto',
    buffer_m: params.bufferM ?? 300,
  });
  if (r.status === 404) throw new Error('O servidor de processamento ainda não tem o módulo MDE — ele deve estar sendo atualizado. Tente de novo em alguns minutos.');
  if (!r.ok) {
    let msg = `Backend respondeu ${r.status}`;
    try { const j = await r.json(); if (j?.detail) msg = String(j.detail); } catch {}
    throw new Error(msg);
  }
  return r.json();
}

// ── F2+F3: Análise topográfica (derivados + agronômicos) ────────────────────
export type SensibilidadeDrenagem = 'baixa' | 'media' | 'alta';

export interface RespMdeAnalise {
  fonte: string;
  rotulo: string;
  bounds: [number, number, number, number];
  shape: [number, number];
  grids: Record<'aspecto' | 'curv_perfil' | 'curv_plano' | 'curv_geral' | 'tpi' | 'tri' | 'fluxo_log' | 'twi' | 'ls', Grid>;
  classes_cod: Grid;               // F4.b — códigos das classes por pixel (NaN fora)
  pngs: { curvas: string; drenagem: string; classes: string };
  meta: {
    intervalo_curvas_m: number;
    limiar_drenagem_ha: number;
    cell_ha: number;
    k_tpi_px: number;
    classes: { codigo: number; nome: string; cor: string; ha: number; pct: number }[];
    ranges: Record<string, [number, number]>;
  };
}

export async function buscarAnaliseMde(params: {
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  fonte?: string;                 // fonte da base OFICIAL (consistência com o aprovado)
  bufferM?: number;
  sensibilidade?: SensibilidadeDrenagem;
}): Promise<RespMdeAnalise> {
  const r = await postBackend('/mde-analise', {
    poligono: params.poligono,
    fonte: params.fonte ?? 'auto',
    buffer_m: params.bufferM ?? 300,
    sensibilidade: params.sensibilidade ?? 'media',
  });
  if (r.status === 404) throw new Error('O servidor ainda não tem a análise topográfica — deve estar sendo atualizado. Tente em alguns minutos.');
  if (!r.ok) {
    let msg = `Backend respondeu ${r.status}`;
    try { const j = await r.json(); if (j?.detail) msg = String(j.detail); } catch {}
    throw new Error(msg);
  }
  return r.json();
}

// ── F4.b: cruzamento de uma variável por CLASSE de relevo (§12.1) ────────────
// Geo-aware: amostra o grid da variável (produtividade, NDVI, fertilidade…) na
// coordenada de cada pixel de classe — funciona entre resoluções/recortes.
function amostraBilinear(vals: Float32Array, rows: number, cols: number, bounds: [number, number, number, number], lng: number, lat: number): number {
  const [w, s, e, n] = bounds;
  const fx = ((lng - w) / (e - w)) * cols - 0.5;
  const fy = ((n - lat) / (n - s)) * rows - 0.5;
  if (fx < -0.5 || fy < -0.5 || fx > cols - 0.5 || fy > rows - 0.5) return NaN;
  const x0 = Math.max(0, Math.min(cols - 1, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(rows - 1, Math.floor(fy)));
  const x1 = Math.min(cols - 1, x0 + 1), y1 = Math.min(rows - 1, y0 + 1);
  const wx = Math.max(0, Math.min(1, fx - x0)), wy = Math.max(0, Math.min(1, fy - y0));
  const v00 = vals[y0 * cols + x0], v01 = vals[y0 * cols + x1], v10 = vals[y1 * cols + x0], v11 = vals[y1 * cols + x1];
  let num = 0, den = 0;
  const w00 = (1 - wx) * (1 - wy), w01 = wx * (1 - wy), w10 = (1 - wx) * wy, w11 = wx * wy;
  if (isFinite(v00)) { num += v00 * w00; den += w00; }
  if (isFinite(v01)) { num += v01 * w01; den += w01; }
  if (isFinite(v10)) { num += v10 * w10; den += w10; }
  if (isFinite(v11)) { num += v11 * w11; den += w11; }
  return den > 0.25 ? num / den : NaN;
}

export interface LinhaCruzamento { codigo: number; nome: string; cor: string; areaHa: number; media: number | null; n: number; diffPct: number | null; }

export function mediaPorClasse(
  classes: { grid: Grid; bounds: [number, number, number, number] },
  variavel: { grid: Grid; bounds: [number, number, number, number] },
  classesMeta: { codigo: number; nome: string; cor: string; ha: number }[],
): { linhas: LinhaCruzamento[]; mediaGeral: number | null } {
  const cg = decodeGrid(classes.grid);
  const vg = decodeGrid(variavel.grid);
  const acc = new Map<number, { sum: number; n: number }>();
  const [w, s, e, n] = classes.bounds;
  for (let j = 0; j < cg.rows; j++) {
    const lat = n - ((j + 0.5) / cg.rows) * (n - s);
    for (let i = 0; i < cg.cols; i++) {
      const code = cg.valores[j * cg.cols + i];
      if (!isFinite(code) || code <= 0) continue;
      const lng = w + ((i + 0.5) / cg.cols) * (e - w);
      const v = amostraBilinear(vg.valores, vg.rows, vg.cols, variavel.bounds, lng, lat);
      if (!isFinite(v)) continue;
      const k = Math.round(code);
      const a = acc.get(k) ?? { sum: 0, n: 0 }; a.sum += v; a.n++; acc.set(k, a);
    }
  }
  let gs = 0, gn = 0; acc.forEach(a => { gs += a.sum; gn += a.n; });
  const mediaGeral = gn > 0 ? gs / gn : null;
  const linhas = classesMeta.map(c => {
    const a = acc.get(c.codigo);
    const media = a && a.n > 0 ? a.sum / a.n : null;
    const diffPct = (media != null && mediaGeral != null && mediaGeral !== 0) ? ((media - mediaGeral) / mediaGeral) * 100 : null;
    return { codigo: c.codigo, nome: c.nome, cor: c.cor, areaHa: c.ha, media, n: a?.n ?? 0, diffPct };
  }).filter(l => l.n > 0);
  return { linhas, mediaGeral };
}

// ── Persistência da base aprovada (nuvem) ────────────────────────────────────
export const prefixoMde = (talhaoId: string, mdeId: string) => `mde__${talhaoId}__${mdeId}__`;

export interface MdeSalvo {
  bounds: [number, number, number, number];
  elevacao?: Grid;        // gz na nuvem
  declividade?: Grid;     // gz na nuvem
  hillshade_png?: string;
}

export async function salvarMdeNaNuvem(talhaoId: string, mdeId: string, r: RespMde): Promise<void> {
  const pre = prefixoMde(talhaoId, mdeId);
  const [elevGz, declGz] = await Promise.all([comprimirGrid(r.elevacao), comprimirGrid(r.declividade)]);
  cloudSalvarMapa(`${pre}elev`, { bounds: r.bounds, elevacao: elevGz } satisfies MdeSalvo);
  cloudSalvarMapa(`${pre}decl`, { bounds: r.bounds, declividade: declGz } satisfies MdeSalvo);
  cloudSalvarMapa(`${pre}hs`, { bounds: r.bounds, hillshade_png: r.hillshade_png } satisfies MdeSalvo);
}

export interface MdeCarregado {
  bounds: [number, number, number, number];
  elevacao: Grid | null;
  declividade: Grid | null;
  hillshadePng: string | null;
}

export async function carregarMdeDaNuvem(talhaoId: string, mdeId: string): Promise<MdeCarregado | null> {
  const docs = await cloudCarregarMapasPorPrefixo<MdeSalvo>(prefixoMde(talhaoId, mdeId));
  if (docs.length === 0) return null;
  const out: MdeCarregado = { bounds: [0, 0, 0, 0], elevacao: null, declividade: null, hillshadePng: null };
  for (const d of docs) {
    if (d.dados.bounds) out.bounds = d.dados.bounds;
    if (d.dados.elevacao) out.elevacao = await descomprimirGrid(d.dados.elevacao);
    if (d.dados.declividade) out.declividade = await descomprimirGrid(d.dados.declividade);
    if (d.dados.hillshade_png) out.hillshadePng = d.dados.hillshade_png;
  }
  return out;
}

export function excluirMdeDaNuvem(talhaoId: string, mdeId: string): void {
  cloudExcluirMapasPorPrefixo(prefixoMde(talhaoId, mdeId));
}

// ── F4: camadas topográficas → Zonas de Manejo ──────────────────────────────
// Camadas da ANÁLISE (F2/F3) que o usuário pode salvar como fonte do MEAP.
// Altitude e Declividade NÃO entram aqui (vêm direto da base oficial).
export const CAMADAS_TOPO_ZONA: { key: keyof RespMdeAnalise['grids']; rotulo: string }[] = [
  { key: 'tpi', rotulo: 'TPI' },
  { key: 'twi', rotulo: 'TWI' },
  { key: 'ls', rotulo: 'LS Factor' },
  { key: 'tri', rotulo: 'TRI' },
  { key: 'fluxo_log', rotulo: 'Fluxo acumulado' },
  { key: 'aspecto', rotulo: 'Aspecto' },
  { key: 'curv_geral', rotulo: 'Curvatura geral' },
];

const prefixoCam = (talhaoId: string, key: string) => `mdecam__${talhaoId}__${key}`;

// Persiste (gzip) as camadas escolhidas + registra o conjunto no store.
export async function salvarCamadasTopoMde(
  talhaoId: string,
  analise: RespMdeAnalise,
  keys: (keyof RespMdeAnalise['grids'])[],
): Promise<void> {
  // limpa as antigas na nuvem (as que não forem re-salvas somem)
  cloudExcluirMapasPorPrefixo(`mdecam__${talhaoId}__`);
  const registros: { key: string; rotulo: string }[] = [];
  for (const key of keys) {
    const g = analise.grids[key];
    if (!g) continue;
    const gz = await comprimirGrid(g);
    cloudSalvarMapa(prefixoCam(talhaoId, key), { resp: { bounds: analise.bounds, grid: gz } });
    registros.push({ key, rotulo: CAMADAS_TOPO_ZONA.find(c => c.key === key)?.rotulo ?? key });
  }
  setMdeCamadasTopo(talhaoId, registros);
}

export function excluirCamadasTopoMde(talhaoId: string): void {
  cloudExcluirMapasPorPrefixo(`mdecam__${talhaoId}__`);
  limparMdeCamadasTopo(talhaoId);
}

// ── Apoio de visualização ────────────────────────────────────────────────────
// A legenda oficial de Altimetria trabalha em PERCENTUAL do range (0–100,
// classes 25/50/75/90). Normaliza a elevação real p/ 0–100 SÓ para colorir.
export function normalizarGrid0a100(g: Grid): Grid {
  const bin = atob(g.b64);
  const buf = new ArrayBuffer(bin.length);
  const u8 = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const v = new Float32Array(buf);
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < v.length; i++) { const x = v[i]; if (isFinite(x)) { if (x < mn) mn = x; if (x > mx) mx = x; } }
  const amp = mx - mn;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = isFinite(v[i]) ? (amp > 0 ? ((v[i] - mn) / amp) * 100 : 50) : NaN;
  const ob = new Uint8Array(out.buffer);
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < ob.length; i += CHUNK) s += String.fromCharCode(...ob.subarray(i, i + CHUNK));
  return { b64: btoa(s), shape: g.shape };
}
