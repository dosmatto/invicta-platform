'use client';

// Geração de zonas de manejo por SIMILARIDADE (MEAP M2, Fatia 1) — front.
// NÃO interpola: consome os mapas JÁ interpolados (grids salvos na nuvem) das
// camadas escolhidas, empilha e manda o backend clusterizar (k-means/FCM) com
// índices FPI/NCE para escolher o nº de zonas. Preview apenas (persistir = M3).

import { getImportacoesLab, getGrades, getCondutividade, getComposicoes, getMdes, getMdeCamadasTopo } from '@/lib/store';
import { carregarGridsTalhao } from '@/lib/recomendacao/aplicar';
import { analisarZonas, gerarZonas, decodeGrid, descomprimirGrid, type RespAnalisarZonas, type RespGerarZonas, type Grid } from '@/lib/fertilidade';
import { cloudCarregarMapasPorPrefixo } from '@/lib/cloud';
import { simboloElemento, type ResultadoAmostra } from '@/lib/lab';

export interface CamadaGrid {
  chave: string;   // `nut__prof`
  nut: string;
  prof: string;
  simbolo: string;
  b64: string;
  shape: [number, number];
}

export interface CamadasCarregadas {
  importacaoId: string;
  bounds: [number, number, number, number];
  shape: [number, number];
  camadas: CamadaGrid[];
}

// ── NDVI mantido como camada do MEAP ────────────────────────────────────────
// Reamostragem bilinear NaN-aware (mesma extensão, malhas diferentes).
export function encodeF32(a: Float32Array): string {
  const u8 = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let s = ''; const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode(...u8.subarray(i, i + CH));
  return btoa(s);
}
function reamostrarB64(b64: string, src: [number, number], dst: [number, number]): string {
  const { valores } = decodeGrid({ b64, shape: src });
  const [sr, sc] = src, [dr, dc] = dst;
  const out = new Float32Array(dr * dc);
  for (let j = 0; j < dr; j++) {
    const fy = dr === 1 ? 0 : (j * (sr - 1)) / (dr - 1);
    const y0 = Math.floor(fy), y1 = Math.min(y0 + 1, sr - 1), wy = fy - y0;
    for (let i = 0; i < dc; i++) {
      const fx = dc === 1 ? 0 : (i * (sc - 1)) / (dc - 1);
      const x0 = Math.floor(fx), x1 = Math.min(x0 + 1, sc - 1), wx = fx - x0;
      const w00 = (1 - wx) * (1 - wy), w01 = wx * (1 - wy), w10 = (1 - wx) * wy, w11 = wx * wy;
      const v00 = valores[y0 * sc + x0], v01 = valores[y0 * sc + x1], v10 = valores[y1 * sc + x0], v11 = valores[y1 * sc + x1];
      let num = 0, den = 0;
      if (isFinite(v00)) { num += v00 * w00; den += w00; }
      if (isFinite(v01)) { num += v01 * w01; den += w01; }
      if (isFinite(v10)) { num += v10 * w10; den += w10; }
      if (isFinite(v11)) { num += v11 * w11; den += w11; }
      out[j * dc + i] = den > 0 ? num / den : NaN;
    }
  }
  return encodeF32(out);
}
function capShape(s: [number, number], maxSide: number): [number, number] {
  const m = Math.max(s[0], s[1]);
  if (m <= maxSide) return s;
  const k = maxSide / m;
  return [Math.max(2, Math.round(s[0] * k)), Math.max(2, Math.round(s[1] * k))];
}

export interface NdviCamada { chave: string; nut: string; prof: string; data: string; indice: string; bounds: [number, number, number, number]; b64: string; shape: [number, number]; }

// Carrega os ÍNDICES MANTIDOS (NDVI, SAVI… — Sentinel + CBERS) do talhão.
// IV2: o mesmo prefixo guarda vários índices (id …__INDICE__data) — a chave e o
// rótulo agora incluem o índice (dois índices da mesma data não colidem).
export async function carregarNdviSalvos(talhaoId: string): Promise<NdviCamada[]> {
  const fontes: Array<['s2' | 'cbers', string]> = [['s2', `${talhaoId}__ndvi__`], ['cbers', `${talhaoId}__ndvicbers__`]];
  const out: NdviCamada[] = [];
  for (const [fonte, pref] of fontes) {
    const docs = await cloudCarregarMapasPorPrefixo<{ indice?: string; resp: { bounds: [number, number, number, number]; grid?: Grid; cena?: { data?: string } } }>(pref);
    for (const d of docs) {
      const resp = d.dados?.resp;
      let grid = resp?.grid;
      const data = resp?.cena?.data;
      if (!resp || !data || !grid) continue;
      if (grid.comp === 'gz') { try { grid = await descomprimirGrid(grid); } catch { continue; } }
      const indice = d.dados?.indice ?? d.id.slice(pref.length).split('__')[0] ?? 'NDVI';
      out.push({
        chave: `ndvi_${fonte}__${indice}__${data}`, nut: `ndvi_${fonte}_${indice.toLowerCase()}`,
        prof: data, data, indice, bounds: resp.bounds, b64: grid.b64, shape: grid.shape,
      });
    }
  }
  out.sort((a, b) => b.data.localeCompare(a.data)); // mais recentes primeiro
  return out;
}

// ── Composições Temporais de Índices (IV5) como camadas do MEAP ─────────────
// Só as APROVADAS e APTAS p/ zonas entram (spec: "disponibilidade para zonas de
// manejo"). Categoria Sensoriamento Remoto — o 1º token do símbolo segue o
// índice ("NDVI Mediana") p/ o backend reconhecer o potencial.
export interface ComposicaoCamada { chave: string; nut: string; nome: string; simbolo: string; bounds: [number, number, number, number]; b64: string; shape: [number, number]; }

export async function carregarComposicoes(talhaoId: string): Promise<ComposicaoCamada[]> {
  const metas = getComposicoes(talhaoId).filter(c => c.aprovada && c.aptoZonas);
  const out: ComposicaoCamada[] = [];
  for (const m of metas) {
    const docs = await cloudCarregarMapasPorPrefixo<{ resp: { bounds: [number, number, number, number]; grid?: Grid } }>(`composicao__${talhaoId}__${m.id}`);
    for (const d of docs) {
      const resp = d.dados?.resp;
      let grid = resp?.grid;
      if (!resp || !grid) continue;
      if (grid.comp === 'gz') { try { grid = await descomprimirGrid(grid); } catch { continue; } }
      const rotMetodo = m.metodo.charAt(0).toUpperCase() + m.metodo.slice(1);
      out.push({
        chave: `comp__${m.id}`, nut: `comp_${m.indice.toLowerCase()}`,
        nome: m.nome, simbolo: `${m.indice} ${rotMetodo}`,
        bounds: resp.bounds, b64: grid.b64, shape: grid.shape,
      });
    }
  }
  return out;
}

// ── Camadas topográficas (MDE) como fonte do MEAP (F4) ──────────────────────
// Altitude + Declividade vêm da BASE OFICIAL (sempre); TPI/TWI/LS… entram só se
// o usuário salvou "para Zonas de Manejo" (mdecam__). Categoria Relevo.
export interface TopoCamada { chave: string; nut: string; simbolo: string; bounds: [number, number, number, number]; b64: string; shape: [number, number]; }

export async function carregarMdeCamadas(talhaoId: string): Promise<TopoCamada[]> {
  const out: TopoCamada[] = [];
  // 1) base oficial → Altitude + Declividade
  const oficial = getMdes(talhaoId).find(m => m.oficial);
  if (oficial) {
    const docs = await cloudCarregarMapasPorPrefixo<{ bounds: [number, number, number, number]; elevacao?: Grid; declividade?: Grid }>(`mde__${talhaoId}__${oficial.id}__`);
    for (const d of docs) {
      for (const [campo, simbolo, nut] of [['elevacao', 'Altitude', 'mde_alt'], ['declividade', 'Declividade', 'mde_decl']] as const) {
        let g = d.dados?.[campo];
        if (!g) continue;
        if (g.comp === 'gz') { try { g = await descomprimirGrid(g); } catch { continue; } }
        out.push({ chave: `topo__${nut}`, nut, simbolo, bounds: d.dados.bounds, b64: g.b64, shape: g.shape });
      }
    }
  }
  // 2) camadas topográficas salvas (TPI/TWI/LS…)
  for (const meta of getMdeCamadasTopo(talhaoId)) {
    const docs = await cloudCarregarMapasPorPrefixo<{ resp: { bounds: [number, number, number, number]; grid?: Grid } }>(`mdecam__${talhaoId}__${meta.key}`);
    for (const d of docs) {
      let g = d.dados?.resp?.grid;
      if (!g) continue;
      if (g.comp === 'gz') { try { g = await descomprimirGrid(g); } catch { continue; } }
      out.push({ chave: `topo__${meta.key}`, nut: `mde_${meta.key}`, simbolo: meta.rotulo, bounds: d.dados.resp.bounds, b64: g.b64, shape: g.shape });
    }
  }
  return out;
}

// ── Condutividade elétrica OFICIAL como camada do MEAP (C3) ──────────────────
export interface EcCamada { chave: string; prof: string; bounds: [number, number, number, number]; b64: string; shape: [number, number] }

export async function carregarEcOficial(talhaoId: string): Promise<EcCamada[]> {
  const lev = getCondutividade(talhaoId).find(l => l.oficial);
  if (!lev) return [];
  const pref = `condutividade__${talhaoId}__${lev.id}__`;
  const docs = await cloudCarregarMapasPorPrefixo<{ resp: { bounds: [number, number, number, number]; grid?: Grid } }>(pref);
  const out: EcCamada[] = [];
  for (const d of docs) {
    const prof = d.id.slice(pref.length);
    const resp = d.dados?.resp;
    let grid = resp?.grid;
    if (!resp || !grid) continue;
    if (grid.comp === 'gz') { try { grid = await descomprimirGrid(grid); } catch { continue; } }
    out.push({ chave: `ec__${prof}`, prof, bounds: resp.bounds, b64: grid.b64, shape: grid.shape });
  }
  out.sort((a, b) => a.prof.localeCompare(b.prof));
  return out;
}

// Rótulo amigável da camada de EC (profundidades '00_20' etc.; extras = nome).
export function rotuloEc(prof: string): string {
  return prof === 'altitude' ? 'Altimetria' : `EC ${prof.replace('_', '–')}`;
}

// Carrega as camadas já interpoladas do talhão (fertilidade) + os NDVI mantidos,
// como camadas selecionáveis co-registradas na MESMA malha de referência.
export async function carregarCamadas(talhaoId: string): Promise<CamadasCarregadas | null> {
  const imp = getImportacoesLab(talhaoId)[0] ?? null;

  let bounds: [number, number, number, number] | null = null;
  let shape: [number, number] | null = null;
  const camadas: CamadaGrid[] = [];

  // 1) Fertilidade — quando existe, define a malha de referência.
  if (imp) {
    const grids = await carregarGridsTalhao(talhaoId, imp.id);
    for (const [chave, resp] of Object.entries(grids)) {
      if (!resp.grid?.b64) continue;
      if (!bounds) { bounds = resp.bounds; shape = resp.grid.shape; }
      if (resp.grid.shape[0] !== shape![0] || resp.grid.shape[1] !== shape![1]) continue;
      const [nut, prof] = chave.split('__');
      camadas.push({ chave, nut, prof, simbolo: simboloElemento(nut), b64: resp.grid.b64, shape: resp.grid.shape });
    }
  }

  // 2) NDVI mantidos — entram reamostrados para a malha de referência (a da
  //    fertilidade; ou a do NDVI mais fino com teto de 160 px/lado se não houver
  //    fertilidade, para a clusterização ficar rápida).
  const ndvi = await carregarNdviSalvos(talhaoId);
  if (!bounds && ndvi.length) {
    const ref = ndvi.reduce((a, b) => (b.shape[0] * b.shape[1] > a.shape[0] * a.shape[1] ? b : a));
    bounds = ref.bounds;
    shape = capShape(ref.shape, 160);
  }
  if (bounds && shape) {
    for (const n of ndvi) {
      const b64 = (n.shape[0] === shape[0] && n.shape[1] === shape[1]) ? n.b64 : reamostrarB64(n.b64, n.shape, shape);
      // Diferencia a origem no rótulo (Sentinel vs CBERS); o 1º token segue "NDVI"
      // para o backend reconhecer o potencial (RANK_SIMBOLOS).
      const fonteLabel = n.nut.startsWith('ndvi_cbers') ? 'CBERS' : 'S2';
      camadas.push({ chave: n.chave, nut: n.nut, prof: n.prof, simbolo: `${n.indice} ${fonteLabel}`, b64, shape });
    }
  }

  // 2.5) Composições temporais aprovadas/aptas (IV5) — Sensoriamento Remoto.
  const comps = await carregarComposicoes(talhaoId);
  if (!bounds && comps.length) {
    const ref = comps.reduce((a, b) => (b.shape[0] * b.shape[1] > a.shape[0] * a.shape[1] ? b : a));
    bounds = ref.bounds;
    shape = capShape(ref.shape, 160);
  }
  if (bounds && shape) {
    for (const cp of comps) {
      const b64 = (cp.shape[0] === shape[0] && cp.shape[1] === shape[1]) ? cp.b64 : reamostrarB64(cp.b64, cp.shape, shape);
      camadas.push({ chave: cp.chave, nut: cp.nut, prof: 'comp', simbolo: cp.simbolo, b64, shape });
    }
  }

  // 3) Condutividade elétrica OFICIAL (variável fixa do talhão) — C3: a EC
  //    entra como fonte do zoneamento, reamostrada pra malha de referência.
  const ec = await carregarEcOficial(talhaoId);
  if (!bounds && ec.length) {
    const ref = ec.reduce((a, b) => (b.shape[0] * b.shape[1] > a.shape[0] * a.shape[1] ? b : a));
    bounds = ref.bounds;
    shape = capShape(ref.shape, 160);
  }
  if (bounds && shape) {
    for (const e of ec) {
      const b64 = (e.shape[0] === shape[0] && e.shape[1] === shape[1]) ? e.b64 : reamostrarB64(e.b64, e.shape, shape);
      camadas.push({ chave: e.chave, nut: `ec_${e.prof}`, prof: e.prof, simbolo: rotuloEc(e.prof), b64, shape });
    }
  }

  // 4) Relevo (MDE F4): Altitude/Declividade da base oficial + TPI/TWI/LS… salvas.
  const topo = await carregarMdeCamadas(talhaoId);
  if (!bounds && topo.length) {
    const ref = topo.reduce((a, b) => (b.shape[0] * b.shape[1] > a.shape[0] * a.shape[1] ? b : a));
    bounds = ref.bounds;
    shape = capShape(ref.shape, 160);
  }
  if (bounds && shape) {
    for (const t of topo) {
      const b64 = (t.shape[0] === shape[0] && t.shape[1] === shape[1]) ? t.b64 : reamostrarB64(t.b64, t.shape, shape);
      camadas.push({ chave: t.chave, nut: t.nut, prof: 'relevo', simbolo: t.simbolo, b64, shape });
    }
  }

  if (!bounds || !shape || camadas.length === 0) return null;
  camadas.sort((a, b) => a.simbolo.localeCompare(b.simbolo) || a.prof.localeCompare(b.prof));
  return { importacaoId: imp?.id ?? 'ndvi', bounds, shape, camadas };
}

// Pontos do lab (numero→coord da grade) + resultados crus — entrada do cálculo
// de CV (lib/meap/cv.ts) para medir a homogeneidade das zonas geradas.
export function dadosLabCV(talhaoId: string): { pontos: { numero: number; lng: number; lat: number }[]; resultados: ResultadoAmostra[] } {
  const imp = getImportacoesLab(talhaoId)[0] ?? null;
  const grade = imp ? getGrades(talhaoId).find(g => g.id === imp.gradeId) ?? null : null;
  const pontos = (grade?.pontos ?? []).map(p => ({ numero: p.numero ?? p.ordem + 1, lng: p.lng, lat: p.lat }));
  return { pontos, resultados: imp?.resultados ?? [] };
}

// Monta o payload (camadas selecionadas na ordem fixa + pesos correspondentes).
function montar(carregadas: CamadasCarregadas, chaves: string[], pesos?: Record<string, number>) {
  const sel = carregadas.camadas.filter(c => chaves.includes(c.chave));
  if (sel.length === 0) throw new Error('Selecione ao menos uma camada.');
  return {
    camadas: sel.map(c => ({ nome: `${c.simbolo} ${c.prof}`, b64: c.b64 })),
    pesos: pesos ? sel.map(c => (pesos[c.chave] ?? 1)) : null,
    bounds: carregadas.bounds,
    shape: carregadas.shape,
  };
}

// ETAPA 1 — Analisar (FPI/NCE 2..12 + sugestão). Não gera.
export async function analisarMulti(opts: {
  carregadas: CamadasCarregadas;
  chaves: string[];
  poligono?: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  algoritmo?: 'fcm' | 'kmeans';
  pesos?: Record<string, number>;
  cMax?: number;
}): Promise<RespAnalisarZonas> {
  const m = montar(opts.carregadas, opts.chaves, opts.pesos);
  return analisarZonas({
    camadas: m.camadas,
    bounds: m.bounds,
    shape: m.shape,
    poligono: opts.poligono ?? null,
    algoritmo: opts.algoritmo ?? 'fcm',
    cMin: 2,
    cMax: opts.cMax ?? 12,
    pesos: m.pesos,
  });
}

// ETAPA 2 — Gerar (nº de zonas já escolhido + área mínima).
export async function gerarMulti(opts: {
  carregadas: CamadasCarregadas;
  chaves: string[];
  nClasses: number;
  poligono?: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  algoritmo?: 'fcm' | 'kmeans';
  areaMinHa?: number;
  pesos?: Record<string, number>;
}): Promise<RespGerarZonas> {
  const m = montar(opts.carregadas, opts.chaves, opts.pesos);
  return gerarZonas({
    camadas: m.camadas,
    bounds: m.bounds,
    shape: m.shape,
    nClasses: opts.nClasses,
    poligono: opts.poligono ?? null,
    algoritmo: opts.algoritmo ?? 'fcm',
    areaMinHa: opts.areaMinHa ?? 0,
    pesos: m.pesos,
  });
}
