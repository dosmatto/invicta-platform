// AJUSTAR ZONAS AO LIMITE ATUAL DO TALHÃO — a "tesoura" das versões de zoneamento.
//
// O zoneamento é antigo e o contorno do talhão mudou depois: partes das zonas
// ultrapassam o limite novo e outras não alcançam. Aqui, tudo no navegador:
//   1. corta o que ficou FORA do limite novo;
//   2. preenche os vãos do limite novo que ficaram sem zona, dando cada ponto à
//      ZONA MAIS PRÓXIMA (Voronoi das bordas densificadas a ~1 m);
//   3. elimina sobreposições (a ordem de entrada tem prioridade) e lascas;
//   4. recalcula a área de cada polígono (projeção local sobre o elipsoide WGS84);
//   5. regera as divisas internas (linhas entre zonas).
//
// Substitui o "Incorporar divisas" do backend (/zonear-incorporar-divisas), que
// esticava as divisas seguindo a trajetória da linha. Todo o cálculo é feito em
// METROS numa projeção equiretangular centrada no talhão — erro desprezível na
// escala de um talhão, e as operações do Turf ficam bem condicionadas.

import { union } from '@turf/union';
import intersect from '@turf/intersect';
import { difference } from '@turf/difference';
import { bbox } from '@turf/bbox';
import { voronoi } from '@turf/voronoi';
import { featureCollection, feature, point } from '@turf/helpers';

type Geom = GeoJSON.Polygon | GeoJSON.MultiPolygon;
type Pt = number[];
type Anel = Pt[];
type Poli = Anel[];

export interface OpcoesAjusteLimite {
  espacamentoM: number;      // densificação das bordas para o Voronoi (m)
  areaMinimaM2: number;      // partes menores que isso são descartadas (m²)
  toleranciaBordaM: number;  // distância para considerar um segmento "no limite" (m)
  campoArea: string | null;  // atributo de área a recalcular (null = não recalcula)
  casasDecimais: number;
  margemVoronoiM: number;    // raio mínimo de busca de bordas ao redor dos vãos (m)
}

const PADROES: OpcoesAjusteLimite = {
  espacamentoM: 1.0,
  areaMinimaM2: 1.0,
  toleranciaBordaM: 0.05,
  campoArea: 'areaHa',
  casasDecimais: 4,
  margemVoronoiM: 50,
};

export interface ResumoAjusteLimite {
  areaTalhaoHa: number;
  areaZonasHa: number;
  nZonas: number;            // classes distintas que sobraram
  nPoligonos: number;
  areaPerdidaHa: number;     // cortado fora do limite novo
  areaGanhaHa: number;       // vãos preenchidos pela zona mais próxima
  coberturaPct: number;
  poligonosVazios: number;   // polígonos que ficaram inteiros fora do limite
}

export interface RespAjusteLimite {
  fc: GeoJSON.FeatureCollection;
  /** O que o talhão GANHOU (tipo 'ganho') e PERDEU (tipo 'perdido') — a prévia pinta. */
  diff: GeoJSON.FeatureCollection;
  /** Divisas internas regeradas (uma MultiLineString). */
  linhas: GeoJSON.FeatureCollection;
  resumo: ResumoAjusteLimite;
  avisos: string[];
}

/* ---------- projeção local em metros (equiretangular) ---------- */
function criarProjecao(bb: number[]) {
  const lon0 = (bb[0] + bb[2]) / 2;
  const lat0 = (bb[1] + bb[3]) / 2;
  // raios de curvatura do elipsoide WGS84 na latitude central
  const a = 6378137, e2 = 0.00669437999014, f = Math.PI / 180;
  const s = Math.sin(lat0 * f), w = Math.sqrt(1 - e2 * s * s);
  const kx = (a / w) * Math.cos(lat0 * f) * f;      // m por grau de longitude
  const ky = ((a * (1 - e2)) / (w * w * w)) * f;    // m por grau de latitude
  return {
    fwd: ([lon, lat]: Pt): Pt => [(lon - lon0) * kx, (lat - lat0) * ky],
    inv: ([x, y]: Pt): Pt => [x / kx + lon0, y / ky + lat0],
  };
}
function mapCoords(geom: Geom, fn: (p: Pt) => Pt): Geom {
  const rec = (c: unknown): unknown =>
    typeof (c as number[])[0] === 'number' ? fn(c as Pt) : (c as unknown[]).map(rec);
  return { type: geom.type, coordinates: rec(geom.coordinates) } as Geom;
}

/* ---------- utilitários geométricos (coordenadas em metros) ---------- */
function poligonos(geom: Geom | null | undefined): Poli[] {
  if (!geom) return [];
  if (geom.type === 'Polygon') return [geom.coordinates];
  if (geom.type === 'MultiPolygon') return geom.coordinates;
  return [];
}
function areaAnel(r: Anel): number {
  let a = 0;
  for (let i = 0, n = r.length - 1; i < n; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
  return Math.abs(a) / 2;
}
const areaPoligono = (p: Poli) => areaAnel(p[0]) - p.slice(1).reduce((s, r) => s + areaAnel(r), 0);
const areaM2 = (g: Geom | null) => poligonos(g).reduce((a, p) => a + areaPoligono(p), 0);
function geomDe(polys: Poli[]): Geom | null {
  if (polys.length === 0) return null;
  return polys.length === 1
    ? { type: 'Polygon', coordinates: polys[0] }
    : { type: 'MultiPolygon', coordinates: polys };
}
const feat = (g: Geom) => feature(g);

function uniao(geoms: (Geom | null)[]): Geom | null {
  const fs = geoms.filter((g): g is Geom => !!g).map(feat);
  if (fs.length === 0) return null;
  if (fs.length === 1) return fs[0].geometry;
  const u = union(featureCollection(fs));
  return u ? u.geometry : null;
}
function intersecao(a: Geom | null, b: Geom | null): Geom | null {
  if (!a || !b) return null;
  const r = intersect(featureCollection([feat(a), feat(b)]));
  return r ? r.geometry : null;
}
function diferenca(a: Geom | null, b: Geom | null): Geom | null {
  if (!a) return null;
  if (!b) return a;
  const r = difference(featureCollection([feat(a), feat(b)]));
  return r ? r.geometry : null;
}
// remove vértices repetidos e "agulhas" (ida e volta de área zero)
function limparAnel(anel: Anel, eps = 1e-6): Anel | null {
  const r = anel.slice(0, -1);
  for (let mudou = true; mudou && r.length > 3; ) {
    mudou = false;
    for (let i = 0; i < r.length && r.length > 3; i++) {
      const a = r[(i - 1 + r.length) % r.length], b = r[i], c = r[(i + 1) % r.length];
      const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
      const nu = Math.hypot(ux, uy), nv = Math.hypot(vx, vy);
      const repetido = nu < eps;
      const agulha = nv >= eps && Math.abs(ux * vy - uy * vx) < 1e-9 * nu * nv && ux * vx + uy * vy < 0;
      if (repetido || agulha) { r.splice(i, 1); i = Math.max(-1, i - 2); mudou = true; }
    }
  }
  return r.length >= 3 ? [...r, r[0]] : null;
}
function limparLascas(geom: Geom | null, areaMin: number): Geom | null {
  const polys: Poli[] = [];
  for (const p of poligonos(geom)) {
    const aneis = p.map(r => limparAnel(r));
    if (!aneis[0]) continue;
    const q = [aneis[0], ...aneis.slice(1).filter((r): r is Anel => !!r && areaAnel(r) > 1e-6)];
    if (areaPoligono(q) > areaMin) polys.push(q);
  }
  return geomDe(polys);
}
function densificarAnel(anel: Anel, passo: number, out: Pt[]) {
  for (let i = 0; i < anel.length - 1; i++) {
    const [x1, y1] = anel[i], [x2, y2] = anel[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / passo));
    for (let k = 0; k < n; k++) out.push([x1 + ((x2 - x1) * k) / n, y1 + ((y2 - y1) * k) / n]);
  }
}
function distPontoSegmento([px, py]: Pt, [x1, y1]: Pt, [x2, y2]: Pt): number {
  const dx = x2 - x1, dy = y2 - y1;
  const L = dx * dx + dy * dy;
  let t = L ? ((px - x1) * dx + (py - y1) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/* índice em grade dos segmentos de uma geometria: perto(pt) -> distância <= dMax (ou ponto dentro) */
function criarIndiceDistancia(geom: Geom, dMax: number) {
  const tam = Math.max(dMax, 1);
  const grade = new Map<string, [Pt, Pt][]>();
  const polys = poligonos(geom);
  for (const p of polys)
    for (const r of p)
      for (let i = 0; i < r.length - 1; i++) {
        const a = r[i], b = r[i + 1];
        const x0 = Math.floor(Math.min(a[0], b[0]) / tam), x1 = Math.floor(Math.max(a[0], b[0]) / tam);
        const y0 = Math.floor(Math.min(a[1], b[1]) / tam), y1 = Math.floor(Math.max(a[1], b[1]) / tam);
        for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
          const k = x + ',' + y;
          let l = grade.get(k);
          if (!l) grade.set(k, (l = []));
          l.push([a, b]);
        }
      }
  const dentroAnel = ([x, y]: Pt, r: Anel) => {
    let d = false;
    for (let i = 0, j = r.length - 2; i < r.length - 1; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) d = !d;
    }
    return d;
  };
  const dentro = (pt: Pt) => polys.some(p => dentroAnel(pt, p[0]) && !p.slice(1).some(h => dentroAnel(pt, h)));
  return (pt: Pt, d = dMax) => {
    const cx = Math.floor(pt[0] / tam), cy = Math.floor(pt[1] / tam);
    for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++)
      for (const [a, b] of grade.get(x + ',' + y) || []) if (distPontoSegmento(pt, a, b) <= d) return true;
    return d < tam && dentro(pt);
  };
}

/* ---------- divisas internas: segmentos das zonas fora do limite ---------- */
function linhasInternas(zonasGeom: Geom[], limiteGeom: Geom, tol: number): Pt[][] {
  const segsLimite: [Pt, Pt][] = [];
  for (const p of poligonos(limiteGeom))
    for (const r of p) for (let i = 0; i < r.length - 1; i++) segsLimite.push([r[i], r[i + 1]]);
  const naBorda = (pt: Pt) => segsLimite.some(([a, b]) => distPontoSegmento(pt, a, b) <= tol);

  const chave = (p: Pt) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
  const vistos = new Set<string>();
  const segs: [Pt, Pt][] = [];
  for (const g of zonasGeom)
    for (const p of poligonos(g))
      for (const r of p)
        for (let i = 0; i < r.length - 1; i++) {
          const a = r[i], b = r[i + 1];
          const ka = chave(a), kb = chave(b);
          const k = ka < kb ? ka + '|' + kb : kb + '|' + ka;
          if (ka === kb || vistos.has(k)) continue;
          vistos.add(k);
          const meio = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          if (!naBorda(meio)) segs.push([a, b]);
        }

  // encadeia segmentos em polilinhas
  const adj = new Map<string, number[]>();
  const add = (k: string, i: number) => { let l = adj.get(k); if (!l) adj.set(k, (l = [])); l.push(i); };
  segs.forEach(([a, b], i) => { add(chave(a), i); add(chave(b), i); });
  const usado = new Array<boolean>(segs.length).fill(false);
  const linhas: Pt[][] = [];
  const estender = (linha: Pt[]) => {
    for (;;) {
      const fim = linha[linha.length - 1];
      const todos = adj.get(chave(fim)) || [];
      const cand = todos.filter(i => !usado[i]);
      if (cand.length !== 1 || todos.length > 2) break;
      const i = cand[0]; usado[i] = true;
      const [a, b] = segs[i];
      linha.push(chave(a) === chave(fim) ? b : a);
    }
  };
  for (let i = 0; i < segs.length; i++) {
    if (usado[i]) continue;
    usado[i] = true;
    const linha = [segs[i][0], segs[i][1]];
    estender(linha);
    linha.reverse();
    estender(linha);
    linhas.push(linha);
  }
  return linhas;
}

const ehPoligonal = (f: GeoJSON.Feature): f is GeoJSON.Feature<Geom> =>
  !!f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon');
const classeDe = (f: GeoJSON.Feature) => {
  const p = (f.properties ?? {}) as { zona?: unknown; classe?: unknown };
  return String(p.zona ?? p.classe ?? '');
};

/**
 * Reajusta um zoneamento ao contorno ATUAL do talhão. Os polígonos saem na
 * mesma ordem e com as mesmas propriedades da entrada (só `areaHa` é
 * recalculada); os que ficaram inteiros fora do limite saem da coleção.
 */
export function ajustarZonasAoLimite(
  fc: GeoJSON.FeatureCollection,
  poligono: Geom,
  opcoes: Partial<OpcoesAjusteLimite> = {},
): RespAjusteLimite {
  try {
    return ajustar(fc, poligono, opcoes);
  } catch (e) {
    // O polyclip (motor do turf) às vezes não fecha um anel em geometria com
    // vértices quase coincidentes — a mensagem dele, em inglês, não diz nada.
    if (e instanceof Error && /output ring|polyclip|sweep/i.test(e.message)) {
      throw new Error('A geometria das zonas tem um defeito que o cálculo não conseguiu resolver. Tente antes "Suavizar limites" nesta versão ou corrija-a no editor, e use a tesoura no resultado.');
    }
    throw e;
  }
}

function ajustar(
  fc: GeoJSON.FeatureCollection,
  poligono: Geom,
  opcoes: Partial<OpcoesAjusteLimite>,
): RespAjusteLimite {
  const o = { ...PADROES, ...opcoes };
  const zonas = fc.features.filter(ehPoligonal);
  if (!zonas.length) throw new Error('O zoneamento não tem nenhum polígono de zona.');

  const proj = criarProjecao(bbox(featureCollection([...zonas, feature(poligono)])));
  const P = (g: Geom) => mapCoords(g, proj.fwd);
  const Pinv = (g: Geom) => mapCoords(g, proj.inv);

  const limite = uniao([P(poligono)]);
  if (!limite) throw new Error('O contorno do talhão é inválido.');
  const zonasM = zonas.map(f => P(f.geometry));
  const uniaoOriginal = uniao(zonasM);

  // 1. corta pelo limite
  const cortadas = zonasM.map(g => intersecao(g, limite));
  const fora = limparLascas(diferenca(uniaoOriginal, limite), 0.01);

  // 2. vãos dentro do novo limite
  const buracos = limparLascas(diferenca(limite, uniao(cortadas)), 0.01);

  let novas = cortadas;
  if (buracos) {
    // margem: maior que a "largura" de qualquer vão (2·área/perímetro), mín. margemVoronoiM
    let largura = 0;
    for (const p of poligonos(buracos)) {
      const per = p.reduce((s, r) => s + r.slice(1).reduce((t, c, i) => t + Math.hypot(c[0] - r[i][0], c[1] - r[i][1]), 0), 0);
      largura = Math.max(largura, (2 * areaPoligono(p)) / per);
    }
    const m = Math.max(o.margemVoronoiM, 3 * largura);
    const perto = criarIndiceDistancia(buracos, m);

    // pontos de borda das zonas a até "m" metros de um vão, rotulados pela zona
    const vistos = new Map<string, { pt: Pt; iz: number }>();
    cortadas.forEach((g, iz) => {
      for (const p of poligonos(g)) {
        const pts: Pt[] = [];
        densificarAnel(p[0], o.espacamentoM, pts);
        for (const pt of pts) {
          if (!perto(pt)) continue;
          const k = `${pt[0].toFixed(3)},${pt[1].toFixed(3)}`;
          if (!vistos.has(k)) vistos.set(k, { pt, iz });
        }
      }
    });
    const lista = [...vistos.values()];
    const celulas: Geom[][] = zonasM.map(() => []);
    if (lista.length) {
      const bb = bbox(feat(buracos));
      const vor = voronoi(
        featureCollection(lista.map(v => point(v.pt))),
        { bbox: [bb[0] - 2 * m, bb[1] - 2 * m, bb[2] + 2 * m, bb[3] + 2 * m] },
      );
      // Só entra na união a célula que pode tocar um vão. A célula é convexa:
      // se ela alcança o vão, QUALQUER vértice dela está a no máximo um
      // diâmetro dele. Célula grande demais para o índice entra sempre.
      // Corta a maior parte das células (as do miolo das zonas) — a união é
      // o que pesa.
      const tam = Math.max(m, 1);
      vor.features.forEach((c, i) => {
        if (!c || !c.geometry) return;
        const anel = c.geometry.coordinates[0];
        let diam = 0;
        for (let a = 0; a < anel.length - 1; a++)
          for (let b = a + 1; b < anel.length - 1; b++)
            diam = Math.max(diam, Math.hypot(anel[a][0] - anel[b][0], anel[a][1] - anel[b][1]));
        if (diam >= tam || perto(anel[0], diam)) celulas[lista[i].iz].push(c.geometry);
      });
    }

    novas = cortadas.map((g, iz) => {
      const extra = celulas[iz].length ? intersecao(uniao(celulas[iz]), buracos) : null;
      return limparLascas(intersecao(uniao([g, extra]), limite), o.areaMinimaM2);
    });
  }

  // 3. remove sobreposições (ordem de entrada tem prioridade)
  let acumulado: Geom | null = null;
  novas = novas.map(g => {
    const r = acumulado ? limparLascas(diferenca(g, acumulado), o.areaMinimaM2) : g;
    acumulado = uniao([acumulado, r]);
    return r;
  });

  // 4. saída em WGS84 + área
  const fator = 10 ** o.casasDecimais;
  const saida: GeoJSON.Feature[] = [];
  zonas.forEach((f, i) => {
    const g = novas[i];
    if (!g) return;
    const props = { ...(f.properties ?? {}) };
    if (o.campoArea) props[o.campoArea] = Math.round((areaM2(g) / 1e4) * fator) / fator;
    saida.push({ ...f, geometry: Pinv(g), properties: props });
  });

  if (!saida.length) throw new Error('Nenhuma zona deste zoneamento alcança o contorno atual do talhão — não há o que ajustar.');

  // 5. divisas internas
  const linhas = linhasInternas(novas.filter((g): g is Geom => !!g), limite, o.toleranciaBordaM)
    .map(l => l.map(proj.inv));

  // Vão que nenhuma zona alcançou (parte do talhão isolada, longe de toda zona):
  // continua sem zona — e o ganho é só o que foi de fato preenchido.
  const semZona = buracos ? limparLascas(diferenca(buracos, uniao(novas)), 0.01) : null;
  const preenchido = semZona ? limparLascas(diferenca(buracos, semZona), 0.01) : buracos;

  const diff: GeoJSON.Feature[] = [];
  if (preenchido) diff.push({ type: 'Feature', properties: { tipo: 'ganho' }, geometry: Pinv(preenchido) });
  if (fora) diff.push({ type: 'Feature', properties: { tipo: 'perdido' }, geometry: Pinv(fora) });

  const areaTalhao = areaM2(limite);
  const areaZonas = novas.reduce((s, g) => s + areaM2(g), 0);
  const r2 = (v: number) => Math.round(v * 100) / 100;

  // Avisos: classe que sumiu pede decisão; polígono que sumiu é só relato.
  const avisos: string[] = [];
  const antes = new Set(zonas.map(classeDe));
  const depois = new Set(saida.map(classeDe));
  for (const c of antes) if (c && !depois.has(c)) avisos.push(`A zona ${c} DESAPARECEU — ficou inteira fora do contorno atual.`);
  const vazios = zonas.length - saida.length;
  if (vazios > 0) avisos.push(`${vazios} polígono(s) ficaram inteiros fora do contorno atual e saíram.`);
  const ha = (g: Geom) => (areaM2(g) / 1e4).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (semZona) avisos.push(`${ha(semZona)} ha do contorno atual FICARAM SEM ZONA — nenhuma zona perto o bastante para preencher.`);
  if (preenchido) avisos.push(`${ha(preenchido)} ha sem zona foram dados à zona mais próxima.`);
  if (fora) avisos.push(`${ha(fora)} ha fora do contorno atual foram cortados.`);

  return {
    fc: { type: 'FeatureCollection', features: saida },
    diff: { type: 'FeatureCollection', features: diff },
    linhas: {
      type: 'FeatureCollection',
      features: linhas.length
        ? [{ type: 'Feature', properties: { tipo: 'divisa' }, geometry: { type: 'MultiLineString', coordinates: linhas } }]
        : [],
    },
    resumo: {
      areaTalhaoHa: r2(areaTalhao / 1e4),
      areaZonasHa: r2(areaZonas / 1e4),
      nZonas: depois.size,
      nPoligonos: saida.length,
      areaPerdidaHa: r2(areaM2(fora) / 1e4),
      areaGanhaHa: r2(areaM2(preenchido) / 1e4),
      coberturaPct: areaTalhao ? Math.min(100, (areaZonas / areaTalhao) * 100) : 0,
      poligonosVazios: vazios,
    },
    avisos,
  };
}
