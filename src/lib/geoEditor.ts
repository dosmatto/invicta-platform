// Motor do EDITOR DE GEOMETRIA (medições e limites de talhão) — funções puras.
//
// Convenção: um "anel" é ABERTO (sem repetir o 1º vértice no fim); o fechamento
// acontece só na exportação pra GeoJSON. O editor trabalha com UM polígono
// (anel externo + furos) ou UMA linha.
//
// Cálculos em graus (interseções são invariantes à escala por eixo) e distâncias
// em metros via projeção equiretangular local — suficiente pra talhões.

export type Anel = [number, number][];  // [lng, lat], aberto

export interface GeoEditavel {
  tipo: 'poligono' | 'linha';
  anel: Anel;        // contorno externo (ou a linha, se tipo 'linha')
  furos: Anel[];     // só p/ polígono
}

const KY = 110540;                                        // m por grau de latitude
const kx = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180);

export function distM(a: [number, number], b: [number, number]): number {
  const k = kx((a[1] + b[1]) / 2);
  const dx = (b[0] - a[0]) * k, dy = (b[1] - a[1]) * KY;
  return Math.hypot(dx, dy);
}

// ── Extração / exportação ─────────────────────────────────────────────────────

const tiraFecho = (r: Anel): Anel =>
  r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r.slice(0, -1) : r;

// Monta os editáveis de um FeatureCollection: UM por polígono (com furos) — assim
// um talhão MultiPolygon (2+ pedaços) carrega TODOS os pedaços no editor, não só o
// maior. Sem polígono, emenda as LineStrings num contorno ("salvo como linhas").
export function extrairEditaveis(fc: GeoJSON.FeatureCollection): GeoEditavel[] {
  const polys: { anel: Anel; furos: Anel[] }[] = [];
  const linhas: Anel[] = [];
  const walk = (g: GeoJSON.Geometry | null | undefined) => {
    if (!g) return;
    if (g.type === 'Polygon') {
      const [ext, ...furos] = g.coordinates;
      if (ext?.length >= 3) polys.push({ anel: tiraFecho(ext as Anel), furos: furos.map(f => tiraFecho(f as Anel)).filter(f => f.length >= 3) });
    } else if (g.type === 'MultiPolygon') {
      for (const p of g.coordinates) {
        const [ext, ...furos] = p;
        if (ext?.length >= 3) polys.push({ anel: tiraFecho(ext as Anel), furos: furos.map(f => tiraFecho(f as Anel)).filter(f => f.length >= 3) });
      }
    } else if (g.type === 'LineString') {
      if (g.coordinates.length >= 2) linhas.push(g.coordinates as Anel);
    } else if (g.type === 'MultiLineString') {
      for (const l of g.coordinates) if (l.length >= 2) linhas.push(l as Anel);
    } else if (g.type === 'GeometryCollection') {
      g.geometries.forEach(walk);
    }
  };
  for (const f of fc.features) walk(f.geometry);

  if (polys.length) {
    polys.sort((a, b) => areaM2(b.anel) - areaM2(a.anel));
    return polys.map(p => ({ tipo: 'poligono' as const, anel: p.anel, furos: p.furos }));
  }
  if (linhas.length === 1) return [{ tipo: 'linha', anel: tiraFecho(linhas[0]), furos: [] }];
  if (linhas.length > 1) {
    // emenda na ordem, tirando pontos repetidos na junção
    const anel: Anel = [];
    for (const l of linhas) for (const p of l) {
      const u = anel[anel.length - 1];
      if (!u || distM(u, p) > 0.05) anel.push(p);
    }
    const fechado = tiraFecho(anel);
    if (fechado.length >= 3) return [{ tipo: 'poligono', anel: fechado, furos: [] }];
  }
  return [];
}

// Compat: 1 editável (o maior polígono / o contorno). Onde só faz sentido um.
export function extrairEditavel(fc: GeoJSON.FeatureCollection): GeoEditavel | null {
  return extrairEditaveis(fc)[0] ?? null;
}

export function paraFeature(g: GeoEditavel, props: GeoJSON.GeoJsonProperties = {}): GeoJSON.Feature {
  if (g.tipo === 'linha') {
    return { type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: g.anel } };
  }
  const fecha = (r: Anel) => [...r, r[0]];
  return {
    type: 'Feature', properties: props,
    geometry: { type: 'Polygon', coordinates: [fecha(g.anel), ...g.furos.map(fecha)] },
  };
}

export function paraFC(g: GeoEditavel, props: GeoJSON.GeoJsonProperties = {}): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [paraFeature(g, props)] };
}

export function bboxDe(g: GeoEditavel): [number, number, number, number] {
  let [a, b, c, d] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lng, lat] of g.anel) {
    if (lng < a) a = lng; if (lat < b) b = lat; if (lng > c) c = lng; if (lat > d) d = lat;
  }
  return [a, b, c, d];
}

// ── Área / perímetro ──────────────────────────────────────────────────────────

function areaM2(anel: Anel): number {
  if (anel.length < 3) return 0;
  let lat0 = 0;
  for (const p of anel) lat0 += p[1];
  lat0 /= anel.length;
  const k = kx(lat0);
  let s = 0;
  for (let i = 0; i < anel.length; i++) {
    const [x1, y1] = anel[i], [x2, y2] = anel[(i + 1) % anel.length];
    s += (x1 * k) * (y2 * KY) - (x2 * k) * (y1 * KY);
  }
  return Math.abs(s) / 2;
}

export function areaHaDe(g: GeoEditavel): number | null {
  if (g.tipo !== 'poligono') return null;
  const ha = (areaM2(g.anel) - g.furos.reduce((s, f) => s + areaM2(f), 0)) / 10000;
  return Math.round(ha * 100) / 100;
}

export function areaHaSemFuros(g: GeoEditavel): number | null {
  if (g.tipo !== 'poligono') return null;
  return Math.round((areaM2(g.anel) / 10000) * 100) / 100;
}

export function perimetroMDe(g: GeoEditavel): number {
  const pts = g.anel;
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += distM(pts[i - 1], pts[i]);
  if (g.tipo === 'poligono' && pts.length >= 3) s += distM(pts[pts.length - 1], pts[0]);
  return s;
}

// ── Simplificar (Douglas-Peucker, tolerância em metros) ──────────────────────

function distPontoSegM(p: [number, number], a: [number, number], b: [number, number]): number {
  const k = kx(p[1]);
  const px = p[0] * k, py = p[1] * KY;
  const ax = a[0] * k, ay = a[1] * KY, bx = b[0] * k, by = b[1] * KY;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function dpAberto(pts: Anel, tolM: number): Anel {
  if (pts.length <= 2) return pts;
  const manter = new Array<boolean>(pts.length).fill(false);
  manter[0] = manter[pts.length - 1] = true;
  const pilha: [number, number][] = [[0, pts.length - 1]];
  while (pilha.length) {
    const [i0, i1] = pilha.pop()!;
    let dMax = 0, iMax = -1;
    for (let i = i0 + 1; i < i1; i++) {
      const d = distPontoSegM(pts[i], pts[i0], pts[i1]);
      if (d > dMax) { dMax = d; iMax = i; }
    }
    if (iMax >= 0 && dMax > tolM) { manter[iMax] = true; pilha.push([i0, iMax], [iMax, i1]); }
  }
  return pts.filter((_, i) => manter[i]);
}

export function simplificarAnel(pts: Anel, tolM: number, fechado: boolean): Anel {
  if (pts.length <= 4) return pts;
  if (!fechado) return dpAberto(pts, tolM);
  // fechado: ancora no vértice 0 e no mais distante dele, roda DP nas 2 metades
  let iLonge = 1, dLonge = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = distM(pts[0], pts[i]);
    if (d > dLonge) { dLonge = d; iLonge = i; }
  }
  const m1 = dpAberto(pts.slice(0, iLonge + 1), tolM);
  const m2 = dpAberto([...pts.slice(iLonge), pts[0]], tolM);
  const out = [...m1.slice(0, -1), ...m2.slice(0, -1)];
  return out.length >= 3 ? out : pts;
}

// ── Reduzir vértices SEM alterar a geometria (remove colineares/redundantes) ──
// Diferente do simplificar (Douglas-Peucker, que pode "cortar" curvas): aqui um
// vértice só sai se ficar a menos de `tolM` da reta entre o vértice ANTERIOR
// mantido e o PRÓXIMO — ou seja, é redundante. O contorno fica visualmente igual.
export function reduzirColineares(pts: Anel, tolM: number, fechado: boolean): Anel {
  const piso = fechado ? 3 : 2;   // triângulo / segmento — nunca degenera
  if (pts.length <= piso) return pts;
  let cur = pts.slice();
  for (let iter = 0; iter < 6; iter++) {
    const out: Anel = [];
    const n = cur.length;
    let removeu = false;
    for (let i = 0; i < n; i++) {
      if (!fechado && (i === 0 || i === n - 1)) { out.push(cur[i]); continue; }
      const prev = out.length ? out[out.length - 1] : cur[(i - 1 + n) % n];
      const next = cur[(i + 1) % n];
      if (distPontoSegM(cur[i], prev, next) < tolM) { removeu = true; continue; }
      out.push(cur[i]);
    }
    if (out.length < piso) break;   // não desce do mínimo — mantém a versão anterior
    cur = out;
    if (!removeu) break;
  }
  return cur;
}

// ── Suavizar (Chaikin, 1 iteração) ────────────────────────────────────────────

export function suavizarAnel(pts: Anel, fechado: boolean): Anel {
  if (pts.length < 3) return pts;
  const out: Anel = [];
  const n = pts.length;
  const fim = fechado ? n : n - 1;
  if (!fechado) out.push(pts[0]);
  for (let i = 0; i < fim; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    out.push([0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]]);
    out.push([0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]]);
  }
  if (!fechado) out.push(pts[n - 1]);
  return out;
}

// ── Ponto no polígono (ray casting) ──────────────────────────────────────────

export function pontoNoAnel(p: [number, number], anel: Anel): boolean {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i], [xj, yj] = anel[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

// ── Interseção de segmentos ───────────────────────────────────────────────────

function segInt(
  a: [number, number], b: [number, number], c: [number, number], d: [number, number],
): { p: [number, number]; t: number; s: number } | null {
  const rx = b[0] - a[0], ry = b[1] - a[1];
  const sx = d[0] - c[0], sy = d[1] - c[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-14) return null;                    // paralelos
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den; // ao longo de ab
  const s = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den; // ao longo de cd
  const EPS = 1e-9;
  if (t < -EPS || t > 1 + EPS || s < -EPS || s > 1 + EPS) return null;
  return { p: [a[0] + t * rx, a[1] + t * ry], t: Math.max(0, Math.min(1, t)), s: Math.max(0, Math.min(1, s)) };
}

// Algum segmento da polilinha `pts` (fechada ou não) cruza alguma aresta do anel?
function cruzaAnel(pts: Anel, fechadoPts: boolean, anel: Anel): boolean {
  const nP = fechadoPts ? pts.length : pts.length - 1;
  for (let i = 0; i < nP; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    for (let j = 0; j < anel.length; j++) {
      if (segInt(a, b, anel[j], anel[(j + 1) % anel.length])) return true;
    }
  }
  return false;
}

// ── CORTAR o polígono em dois por uma linha desenhada ────────────────────────

export function cortarAnel(anel: Anel, corte: Anel): { a: Anel; b: Anel } | { erro: string } {
  if (anel.length < 3) return { erro: 'Polígono inválido.' };
  if (corte.length < 2) return { erro: 'Desenhe a linha de corte com pelo menos 2 pontos.' };

  interface Cruz { i: number; t: number; j: number; s: number; p: [number, number] }
  const cruzes: Cruz[] = [];
  for (let j = 0; j < corte.length - 1; j++) {
    for (let i = 0; i < anel.length; i++) {
      const hit = segInt(corte[j], corte[j + 1], anel[i], anel[(i + 1) % anel.length]);
      if (hit) cruzes.push({ i, t: hit.s, j, s: hit.t, p: hit.p });
    }
  }
  // ordena ao longo da linha de corte
  cruzes.sort((x, y) => x.j - y.j || x.s - y.s);
  // colapsa cruzamentos praticamente coincidentes (linha tocando um vértice)
  const unicas: Cruz[] = [];
  for (const c of cruzes) {
    const u = unicas[unicas.length - 1];
    if (!u || distM(u.p, c.p) > 0.5) unicas.push(c);
  }
  if (unicas.length !== 2) {
    return { erro: `A linha de corte precisa ENTRAR e SAIR do polígono uma única vez (cruzou ${unicas.length}×). Trace de fora a fora.` };
  }
  const [X1, X2] = unicas;

  // vértices da linha de corte que ficam entre os 2 cruzamentos (dentro da área)
  const meio: Anel = [];
  for (let j = X1.j + 1; j <= X2.j; j++) meio.push(corte[j]);

  // caminho do anel de X1 até X2 andando pra frente
  const caminho = (deI: number, ateI: number): Anel => {
    const out: Anel = [];
    let i = (deI + 1) % anel.length;
    // anda até PASSAR a aresta de destino
    while (true) {
      out.push(anel[i]);
      if (i === ateI) break;
      i = (i + 1) % anel.length;
      if (out.length > anel.length + 1) break; // segurança
    }
    return out;
  };

  // lado A: X1 → (anel pra frente) → X2 → (corte de volta) → X1
  const mesmaAresta = X1.i === X2.i;
  const ringVertsA = mesmaAresta && X2.t >= X1.t ? [] : caminho(X1.i, X2.i);
  const ringVertsB = mesmaAresta && X2.t < X1.t ? [] : caminho(X2.i, X1.i);
  const limpa = (r: Anel): Anel => {
    const out: Anel = [];
    for (const p of r) {
      const u = out[out.length - 1];
      if (!u || distM(u, p) > 0.05) out.push(p);
    }
    while (out.length > 1 && distM(out[0], out[out.length - 1]) <= 0.05) out.pop();
    return out;
  };
  const a = limpa([X1.p, ...ringVertsA, X2.p, ...[...meio].reverse()]);
  const b = limpa([X2.p, ...ringVertsB, X1.p, ...meio]);

  if (a.length < 3 || b.length < 3) return { erro: 'O corte gerou uma parte degenerada — trace a linha atravessando a área.' };
  const haA = areaM2(a) / 10000, haB = areaM2(b) / 10000;
  if (haA < 0.001 || haB < 0.001) return { erro: 'Uma das partes ficou pequena demais — ajuste a linha de corte.' };
  return { a, b };
}

// ── RECORTAR buraco/ilha dentro do polígono ───────────────────────────────────

export function validarFuro(anel: Anel, furos: Anel[], novo: Anel): string | null {
  if (novo.length < 3) return 'Desenhe o recorte com pelo menos 3 pontos.';
  for (const p of novo) {
    if (!pontoNoAnel(p, anel)) return 'O recorte precisa ficar TOTALMENTE dentro da área.';
    for (const f of furos) if (pontoNoAnel(p, f)) return 'O recorte não pode ficar dentro de outro recorte.';
  }
  if (cruzaAnel(novo, true, anel)) return 'O recorte não pode cruzar o contorno da área.';
  for (const f of furos) if (cruzaAnel(novo, true, f)) return 'O recorte não pode cruzar outro recorte existente.';
  return null;
}
