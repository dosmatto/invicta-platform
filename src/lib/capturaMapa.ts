'use client';

// Compõe a imagem do mapa para o relatório PDF, em canvas (determinístico, sem
// MapLibre — evita timeout/tainting de WebGL). Ordem das camadas (spec):
//   1. Satélite (tiles ESRI via fetch→blob→bitmap; canvas fica "clean" p/ export)
//   2. Raster interpolado (já colorido)
//   3. Valores da amostra (só o número, halo)
//   4. Limite do talhão (contorno, por cima)
// Sem satélite (ou se os tiles falharem por CORS/rede) → fundo branco.

import { posicionarRotulos } from './rotulosMapa.ts';
import type { DesenhoCamada } from './camadasTalhao';

export interface CapturaMapa {
  rasterPng: string;                                   // raster colorido (dataUrl)
  bounds: [number, number, number, number];            // [w,s,e,n]
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon;    // limite do talhão
  valores: GeoJSON.FeatureCollection;                  // pontos com { txt }
  satelite: boolean;
  corLimite: string;
  larguraPx: number;
  alturaPx: number;
  clipTalhao?: boolean;   // recorta os pixels do raster no limite do talhão (default: true)
}

const SAT_URL = (z: number, x: number, y: number) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

const lon2tile = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z;
const lat2tile = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
};
const tile2lon = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const tile2lat = (y: number, z: number) => {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

function carregarImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('falha ao carregar imagem'));
    img.src = src;
  });
}

async function buscarTile(z: number, x: number, y: number): Promise<ImageBitmap | null> {
  try {
    const r = await fetch(SAT_URL(z, x, y));
    if (!r.ok) return null;
    return await createImageBitmap(await r.blob()); // blob = clean (não taint do canvas)
  } catch { return null; }
}

// Corpo da fonte dos NÚMEROS sobre o mapa (valor da amostra / nº do ponto).
// Regra: o rótulo pode crescer até onde a GRADE deixa. Mede a distância de cada
// ponto ao vizinho mais próximo e usa o 1º QUARTIL dessas distâncias (a média
// esconderia a região mais apertada; o mínimo puro deixaria um par quase
// coincidente encolher o mapa inteiro). Dentro dessa folga cabem:
//   - largura: o rótulo mais LARGO ≤ 62% da folga (os dois vizinhos são
//     centrados no ponto, então metade de cada um soma menos que a folga);
//   - altura:  o corpo da fonte ≤ 75% da folga (números de 1 dígito são mais
//     altos que largos — sem esta trava, empilhavam na vertical).
// Nunca abaixo do `piso` (tamanho histórico: não encolhe relatório nenhum) nem
// acima do `teto` (mapa com número graúdo demais vira tabela).
// `larguraMaxNoPiso` = largura em px do rótulo mais largo medida NO piso.
export function tamanhoRotuloPontos(
  pts: { x: number; y: number }[], larguraMaxNoPiso: number, piso: number, teto: number,
): number {
  if (pts.length < 2) return teto;                    // 1 rótulo: nada p/ colidir
  if (!(larguraMaxNoPiso > 0)) return piso;
  const MAX = 600;                                    // O(n²) contido (grades reais ≤ ~400 pontos)
  const p = pts.length > MAX ? pts.slice(0, MAX) : pts;
  const viz: number[] = [];
  for (let i = 0; i < p.length; i++) {
    let melhor = Infinity;
    for (let j = 0; j < p.length; j++) {
      if (i === j) continue;
      const dx = p[i].x - p[j].x, dy = p[i].y - p[j].y;
      const d = dx * dx + dy * dy;
      if (d < melhor) melhor = d;
    }
    if (isFinite(melhor)) viz.push(Math.sqrt(melhor));
  }
  if (!viz.length) return piso;
  viz.sort((a, b) => a - b);
  const folga = viz[Math.floor((viz.length - 1) * 0.25)];
  const porLargura = piso * ((folga * 0.62) / larguraMaxNoPiso);
  const porAltura = folga * 0.75;
  return Math.round(Math.max(piso, Math.min(teto, porLargura, porAltura)));
}

export async function capturarMapaFertilidade(c: CapturaMapa): Promise<string> {
  const W = c.larguraPx, H = c.alturaPx;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);

  const [w, s, e, n] = c.bounds;
  const latC = (s + n) / 2;
  const aspect = ((e - w) * Math.cos((latC * Math.PI) / 180)) / (n - s || 1);
  const pad = 0.06;
  const availW = W * (1 - 2 * pad), availH = H * (1 - 2 * pad);
  let drawW: number, drawH: number;
  if (availW / availH > aspect) { drawH = availH; drawW = availH * aspect; }
  else { drawW = availW; drawH = availW / aspect; }
  const ox = (W - drawW) / 2, oy = (H - drawH) / 2;
  const px = (lng: number) => ox + ((lng - w) / (e - w || 1)) * drawW;
  const py = (lat: number) => oy + ((n - lat) / (n - s || 1)) * drawH;

  // 1) Satélite — preenche todo o canvas (tiles cobrindo a extensão do frame)
  if (c.satelite) {
    try { await desenharSatelite(ctx, c.bounds, ox, oy, drawW, drawH, W, H); } catch { /* segue sem satélite */ }
  }

  // Traça o polígono do talhão (todos os anéis) como UM path — p/ clip do raster.
  const tracarPoligono = () => {
    const aneis0: GeoJSON.Position[][] = c.poligono.type === 'Polygon'
      ? c.poligono.coordinates : c.poligono.coordinates.flat();
    ctx.beginPath();
    for (const anel of aneis0) {
      anel.forEach((pt, i) => { const x = px(pt[0]), y = py(pt[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.closePath();
    }
  };

  // 2) Raster interpolado (cobre exatamente o bbox). SEM suavização (nearest):
  // a grade é de baixa resolução (~20 m) e ampliada; com smoothing os pixels
  // saíam borrados/"não sólidos" no PDF. Restaura depois (satélite/rótulos suaves).
  // clipTalhao (default true): RECORTA os pixels de borda no limite do talhão —
  // com nearest os blocos de ~20 m ultrapassavam a divisa; o clip corta na linha.
  try {
    const img = await carregarImg(c.rasterPng);
    const smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    const clipar = c.clipTalhao !== false;
    if (clipar) { ctx.save(); tracarPoligono(); ctx.clip(); }
    ctx.drawImage(img, ox, oy, drawW, drawH);
    if (clipar) ctx.restore();
    ctx.imageSmoothingEnabled = smooth;
  } catch { /* segue sem raster */ }

  // 2b) DIVISAS do mapa por zona: LineString/MultiLineString que vêm junto com
  // os valores (mesma fonte do mapa vivo) — desenhadas por cima do raster para
  // cada zona sair separada no PDF. MESMO ESTILO do mapa de prescrição
  // (capturarMapaZonas): divisa interna ESCURA, limite do talhão branco por
  // cima. Mapa interpolado não traz linhas e nada muda.
  const linhasDivisa = c.valores.features.filter(f =>
    f.geometry?.type === 'LineString' || f.geometry?.type === 'MultiLineString');
  if (linhasDivisa.length) {
    ctx.lineWidth = Math.max(1.6, W / 450); ctx.strokeStyle = '#111827';
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const f of linhasDivisa) {
      const g = f.geometry as GeoJSON.LineString | GeoJSON.MultiLineString;
      const linhas = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
      for (const ln of linhas) {
        ctx.beginPath();
        ln.forEach((pt, i) => { const x = px(pt[0]), y = py(pt[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.stroke();
      }
    }
  }

  // 3) Valores (só o número, halo). O CORPO DA FONTE SE ADAPTA À GRADE: em
  // amostragem folgada o número cresce até o teto (era pequeno demais no PDF
  // impresso); em grade apertada ele para no piso — o tamanho histórico —, de
  // modo que nenhum rótulo encoste no vizinho. Ver tamanhoRotuloPontos.
  const rotulos: { x: number; y: number; txt: string }[] = [];
  for (const f of c.valores.features) {
    if (f.geometry?.type !== 'Point') continue;
    const txt = String((f.properties as { txt?: string } | null)?.txt ?? '');
    if (!txt) continue;
    const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
    rotulos.push({ x: px(lng), y: py(lat), txt });
  }
  if (rotulos.length) {
    const piso = Math.round(W / 90), teto = Math.round(W / 60);
    ctx.font = `bold ${piso}px sans-serif`;
    const largMax = Math.max(...rotulos.map(r => ctx.measureText(r.txt).width));
    const tam = tamanhoRotuloPontos(rotulos, largMax, piso, teto);
    ctx.font = `bold ${tam}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // Halo acompanha o corpo da fonte (contorno fino em número grande fica ralo
    // sobre o satélite); nunca mais fino que o histórico.
    ctx.lineWidth = Math.max(2, W / 350, tam / 6); ctx.strokeStyle = '#1f2937'; ctx.fillStyle = '#ffffff';
    ctx.lineJoin = 'round';   // sem "farpas" nos cantos das letras quando o traço engrossa
    for (const r of rotulos) { ctx.strokeText(r.txt, r.x, r.y); ctx.fillText(r.txt, r.x, r.y); }
  }

  // 4) Limite do talhão (contorno, por cima de tudo)
  const aneis: GeoJSON.Position[][] = c.poligono.type === 'Polygon'
    ? c.poligono.coordinates
    : c.poligono.coordinates.flat();
  ctx.lineWidth = Math.max(1.5, W / 500); ctx.strokeStyle = c.corLimite; ctx.lineJoin = 'round';
  for (const anel of aneis) {
    ctx.beginPath();
    anel.forEach((pt, i) => { const x = px(pt[0]), y = py(pt[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.closePath(); ctx.stroke();
  }

  return cv.toDataURL('image/png');
}

// ── Captura para o relatório de ZONAS DE MANEJO ─────────────────────────────
// Diferente da fertilidade (raster PNG): aqui desenha VETORES — polígonos das
// zonas preenchidos com a cor de cada zona, as linhas internas (divisas) e o
// limite externo do talhão. Mesma projeção/satélite da captura de fertilidade.
export interface CapturaZonas {
  bounds: [number, number, number, number];
  externo: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  zonas: Array<{ geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon; cor: string; rotulo?: string }>;
  linhas: Array<{ geometry: GeoJSON.LineString | GeoJSON.MultiLineString }>;
  satelite: boolean;
  larguraPx: number;
  alturaPx: number;
  preencherAlpha?: number;   // 0..1 (default 0.6)
}

function hexRgba(hex: string, a: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || '');
  if (!m) return `rgba(148,163,184,${a})`;
  const r = parseInt(m[1].slice(0, 2), 16), g = parseInt(m[1].slice(2, 4), 16), b = parseInt(m[1].slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// Anéis da MAIOR parte da geometria — é onde o rótulo deve ir quando a zona é
// multipolígono. `aneisDe` achata tudo numa lista só e perde a hierarquia
// externo/furo, que o posicionador precisa para não escrever dentro de um furo.
function aneisDoRotulo(g: GeoJSON.Polygon | GeoJSON.MultiPolygon): GeoJSON.Position[][] {
  const partes = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  let melhor: GeoJSON.Position[][] = partes[0] ?? [];
  let maior = -1;
  for (const rings of partes) {
    const anel = rings[0] ?? [];
    let s = 0;
    for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
      s += anel[j][0] * anel[i][1] - anel[i][0] * anel[j][1];
    }
    const a = Math.abs(s) / 2;
    if (a > maior) { maior = a; melhor = rings; }
  }
  return melhor;
}

export async function capturarMapaZonas(c: CapturaZonas): Promise<string> {
  const W = c.larguraPx, H = c.alturaPx;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);

  const [w, s, e, n] = c.bounds;
  const latC = (s + n) / 2;
  const aspect = ((e - w) * Math.cos((latC * Math.PI) / 180)) / (n - s || 1);
  const pad = 0.06;
  const availW = W * (1 - 2 * pad), availH = H * (1 - 2 * pad);
  let drawW: number, drawH: number;
  if (availW / availH > aspect) { drawH = availH; drawW = availH * aspect; }
  else { drawW = availW; drawH = availW / aspect; }
  const ox = (W - drawW) / 2, oy = (H - drawH) / 2;
  const px = (lng: number) => ox + ((lng - w) / (e - w || 1)) * drawW;
  const py = (lat: number) => oy + ((n - lat) / (n - s || 1)) * drawH;

  if (c.satelite) {
    try { await desenharSatelite(ctx, c.bounds, ox, oy, drawW, drawH, W, H); } catch { /* segue sem satélite */ }
  }

  const aneisDe = (g: GeoJSON.Polygon | GeoJSON.MultiPolygon): GeoJSON.Position[][] =>
    g.type === 'Polygon' ? g.coordinates : g.coordinates.flat();
  const tracar = (aneis: GeoJSON.Position[][]) => {
    ctx.beginPath();
    for (const anel of aneis) {
      anel.forEach((pt, i) => { const x = px(pt[0]), y = py(pt[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.closePath();
    }
  };

  // 1) Zonas preenchidas com a cor de cada uma
  const alpha = c.preencherAlpha ?? 0.6;
  ctx.lineJoin = 'round';
  for (const z of c.zonas) {
    tracar(aneisDe(z.geometry));
    ctx.fillStyle = hexRgba(z.cor, alpha); ctx.fill('evenodd');
    ctx.lineWidth = Math.max(1, W / 700); ctx.strokeStyle = 'rgba(30,30,30,0.65)'; ctx.stroke();
  }

  // 2) Linhas internas (divisas) — realçadas
  ctx.lineWidth = Math.max(1.6, W / 450); ctx.strokeStyle = '#111827'; ctx.lineCap = 'round';
  for (const l of c.linhas) {
    const partes = l.geometry.type === 'LineString' ? [l.geometry.coordinates] : l.geometry.coordinates;
    for (const linha of partes) {
      ctx.beginPath();
      linha.forEach((pt, i) => { const x = px(pt[0]), y = py(pt[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
    }
  }

  // 3) Limite externo (branco, por cima)
  if (c.externo) {
    ctx.lineWidth = Math.max(2, W / 380); ctx.strokeStyle = '#ffffff';
    for (const anel of aneisDe(c.externo)) {
      ctx.beginPath();
      anel.forEach((pt, i) => { const x = px(pt[0]), y = py(pt[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.closePath(); ctx.stroke();
    }
  }

  // 4) Rótulo (nº/dose da zona). A posição é decidida de UMA VEZ para todos
  // (lib/rotulosMapa.ts): quem cabe fica dentro da mancha, quem não cabe sai
  // para o lado com um TRAÇO ligando ao polígono. Antes cada rótulo ia na média
  // dos vértices, sem olhar para os vizinhos — em zona estreita os números
  // saíam empilhados uns sobre os outros e, em zona em C, fora da própria zona.
  const corpo = Math.round(W / 45);
  ctx.font = `bold ${corpo}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const comRotulo = c.zonas.filter(z => z.rotulo);
  const postos = posicionarRotulos(
    comRotulo.map(z => ({
      texto: z.rotulo!,
      aneis: aneisDoRotulo(z.geometry).map(anel => anel.map(pt => [px(pt[0]), py(pt[1])] as [number, number])),
      largura: ctx.measureText(z.rotulo!).width,
      altura: corpo,
    })),
    { largura: W, altura: H },
    { folga: corpo * 0.35, margem: corpo * 0.6 },
  );

  // Traços primeiro (escuro por baixo, claro por cima: some tanto no verde
  // quanto no vermelho da rampa), com um pingo na ponta que fica no polígono.
  for (const p of postos) {
    if (!p.traco) continue;
    for (const [cor, esp] of [['rgba(31,41,55,0.9)', Math.max(2.4, W / 420)], ['#ffffff', Math.max(1.1, W / 900)]] as const) {
      ctx.strokeStyle = cor; ctx.lineWidth = esp;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.traco.x, p.traco.y); ctx.stroke();
    }
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = 'rgba(31,41,55,0.9)'; ctx.lineWidth = Math.max(1, W / 900);
    ctx.beginPath(); ctx.arc(p.traco.x, p.traco.y, Math.max(1.8, W / 450), 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  }

  ctx.lineWidth = Math.max(2, W / 300);
  for (const p of postos) {
    ctx.strokeStyle = '#1f2937'; ctx.fillStyle = '#ffffff'; ctx.lineJoin = 'round';
    ctx.strokeText(p.texto, p.x, p.y); ctx.fillText(p.texto, p.x, p.y);
  }

  return cv.toDataURL('image/png');
}

// ── Captura para o relatório da aba CAMADAS ─────────────────────────────────
// Recompõe em canvas a PILHA que o usuário montou na aba (components/talhao/
// CamadasSection → MapView, efeito 6e): satélite no fundo e as camadas de
// baixo para cima, cada uma com a SUA transparência (ctx.globalAlpha). Os
// estilos dos vetores são os do MapView, com as larguras multiplicadas por `k`
// (o canvas do PDF tem ~2× a largura em px que o talhão ocupa na tela; sem a
// escala, a linha de 1,4 px da guia sumia no papel).
//
// Enquadramento: o bbox do TALHÃO (não o das camadas) — um NDVI com a cena
// inteira ou uma linha de bordadura que passa da divisa não podem afastar o
// mapa do talhão. Quem chama manda `poligono` (o limite) e/ou `bounds`.
export interface CapturaCamadas {
  bounds: [number, number, number, number];            // [w,s,e,n] — usado quando não há `poligono`
  /** Índice 0 = TOPO (mesma ordem da lista da aba). */
  camadas: Array<{ desenho: DesenhoCamada; opacidade: number }>;
  satelite: boolean;
  larguraPx: number;
  alturaPx: number;
  /** Limite do talhão: quando vem, o enquadramento é o bbox dele. */
  poligono?: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  /** Traça o limite (fino, branco) por cima de tudo — referência nas páginas
   *  de camada isolada, onde o contorno não está na pilha. */
  limiteReferencia?: boolean;
}

/** Caixa onde o bbox cabe no canvas (6% de respiro, aspecto real no chão) —
 *  a MESMA conta de capturarMapaFertilidade/Zonas. Exportada para o PDF
 *  calcular a escala gráfica com o tamanho real desenhado, não o do quadro. */
export function enquadramento(bounds: [number, number, number, number], W: number, H: number) {
  const [w, s, e, n] = bounds;
  const latC = (s + n) / 2;
  const aspect = ((e - w) * Math.cos((latC * Math.PI) / 180)) / (n - s || 1);
  const pad = 0.06;
  const availW = W * (1 - 2 * pad), availH = H * (1 - 2 * pad);
  let drawW: number, drawH: number;
  if (availW / availH > aspect) { drawH = availH; drawW = availH * aspect; }
  else { drawW = availW; drawH = availW / aspect; }
  return { ox: (W - drawW) / 2, oy: (H - drawH) / 2, drawW, drawH };
}

/** bbox [w,s,e,n] de qualquer geometria GeoJSON (null se vazia). */
export function bboxGeo(g: GeoJSON.Geometry | GeoJSON.Feature | GeoJSON.FeatureCollection | null | undefined): [number, number, number, number] | null {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const pt = (p: GeoJSON.Position) => {
    if (p[0] < w) w = p[0]; if (p[0] > e) e = p[0];
    if (p[1] < s) s = p[1]; if (p[1] > n) n = p[1];
  };
  const visitar = (x: GeoJSON.Geometry | GeoJSON.Feature | GeoJSON.FeatureCollection | null | undefined): void => {
    if (!x) return;
    if (x.type === 'FeatureCollection') { x.features.forEach(visitar); return; }
    if (x.type === 'Feature') { visitar(x.geometry); return; }
    if (x.type === 'GeometryCollection') { x.geometries.forEach(visitar); return; }
    if (x.type === 'Point') pt(x.coordinates);
    else if (x.type === 'MultiPoint' || x.type === 'LineString') x.coordinates.forEach(pt);
    else if (x.type === 'MultiLineString' || x.type === 'Polygon') x.coordinates.forEach(l => l.forEach(pt));
    else if (x.type === 'MultiPolygon') x.coordinates.forEach(p => p.forEach(l => l.forEach(pt)));
  };
  visitar(g);
  return isFinite(w) ? [w, s, e, n] : null;
}

// Traços (linhas e anéis) de uma geometria qualquer — é o que uma camada
// `line` do MapLibre desenha: LineString/MultiLineString e as bordas dos polígonos.
function tracosDe(g: GeoJSON.Geometry | null | undefined): GeoJSON.Position[][] {
  if (!g) return [];
  switch (g.type) {
    case 'LineString': return [g.coordinates];
    case 'MultiLineString': return g.coordinates;
    case 'Polygon': return g.coordinates;
    case 'MultiPolygon': return g.coordinates.flat();
    case 'GeometryCollection': return g.geometries.flatMap(tracosDe);
    default: return [];
  }
}

function geometriasDe(x: GeoJSON.GeoJSON | null | undefined): GeoJSON.Geometry[] {
  if (!x) return [];
  if (x.type === 'FeatureCollection') return x.features.flatMap(f => (f.geometry ? [f.geometry] : []));
  if (x.type === 'Feature') return x.geometry ? [x.geometry] : [];
  return [x];
}

// Fundo de satélite por enquadramento. O modo "completo" desenha o MESMO
// enquadramento N+1 vezes (composto + uma página por camada): sem este cache,
// eram N+1 rodadas de download dos mesmos tiles. Guarda só o último.
let fundoCache: { chave: string; cv: HTMLCanvasElement } | null = null;

async function fundoSatelite(bounds: [number, number, number, number], W: number, H: number): Promise<HTMLCanvasElement> {
  const chave = `${bounds.join(',')}|${W}x${H}`;
  if (fundoCache?.chave === chave) return fundoCache.cv;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  const { ox, oy, drawW, drawH } = enquadramento(bounds, W, H);
  // Só guarda o fundo COMPLETO: tile que falha é pulado em silêncio (buscarTile
  // devolve null), e um fundo branco ou pela metade preso no cache deixava as
  // próximas gerações do mesmo talhão sem satélite até mudar o enquadramento.
  try {
    if (await desenharSatelite(ctx, bounds, ox, oy, drawW, drawH, W, H)) fundoCache = { chave, cv };
  } catch { /* segue sem satélite nesta geração */ }
  return cv;
}

export async function capturarMapaCamadas(c: CapturaCamadas): Promise<string> {
  const W = c.larguraPx, H = c.alturaPx;
  const bounds = (c.poligono && bboxGeo(c.poligono)) || c.bounds;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  if (c.satelite) ctx.drawImage(await fundoSatelite(bounds, W, H), 0, 0);

  const [w, s, e, n] = bounds;
  const { ox, oy, drawW, drawH } = enquadramento(bounds, W, H);
  const px = (lng: number) => ox + ((lng - w) / (e - w || 1)) * drawW;
  const py = (lat: number) => oy + ((n - lat) / (n - s || 1)) * drawH;
  // Fator px-de-tela → px-do-canvas. Na tela o talhão ocupa ~700–900 px; aqui,
  // ~88% de W. W/800 deixa a espessura relativa ao talhão parecida com a da tela.
  const k = Math.max(1, W / 800);

  const tracarLinha = (ln: GeoJSON.Position[], fechar = false) => {
    ln.forEach((pt, i) => { const x = px(pt[0]), y = py(pt[1]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    if (fechar) ctx.closePath();
  };
  const riscar = (geoms: Array<GeoJSON.Geometry | null>, cor: string, larg: number) => {
    ctx.strokeStyle = cor; ctx.lineWidth = larg; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const g of geoms) for (const ln of tracosDe(g)) { ctx.beginPath(); tracarLinha(ln); ctx.stroke(); }
  };

  // De baixo para cima: o último da lista é o fundo da pilha.
  for (const { desenho: d, opacidade } of [...c.camadas].reverse()) {
    const alpha = Math.max(0, Math.min(1, opacidade));
    if (alpha <= 0) continue;
    ctx.save();
    ctx.globalAlpha = alpha;
    try {
      if (d.tipo === 'raster') {
        // A imagem cobre exatamente a caixa das 4 quinas (coordsFromBounds).
        const xs = d.coordinates.map(q => q[0]), ys = d.coordinates.map(q => q[1]);
        const rw = Math.min(...xs), re = Math.max(...xs), rs = Math.min(...ys), rn = Math.max(...ys);
        const img = await carregarImg(d.url);
        // Sem suavização, como no relatório de Fertilidade: a grade é grossa e
        // ampliada; suavizada, os blocos saíam borrados no papel.
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, px(rw), py(rn), px(re) - px(rw), py(rs) - py(rn));
      } else if (d.estilo === 'linhas-pf') {
        const ehBordadura = (f: GeoJSON.Feature) => (f.properties as { kind?: string } | null)?.kind === 'headland';
        // Mesma ordem do MapView: bordadura primeiro, guia por cima.
        riscar(d.geojson.features.filter(ehBordadura).map(f => f.geometry), '#fb923c', 2.6 * k);
        riscar(d.geojson.features.filter(f => !ehBordadura(f)).map(f => f.geometry), '#22d3ee', 1.4 * k);
      } else if (d.estilo === 'zonas') {
        const polis = d.geojson.features.filter(f => f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon');
        for (const f of polis) {
          ctx.beginPath();
          for (const anel of tracosDe(f.geometry)) tracarLinha(anel, true);
          ctx.fillStyle = (f.properties as { cor?: string } | null)?.cor ?? '#64748b';
          ctx.fill('evenodd');
        }
        riscar(d.geojson.features.map(f => f.geometry), '#ffffff', 1.5 * k);
        // Rótulos: posicionador único dos mapas (lib/rotulosMapa) — fora da
        // mancha com traço quando não cabe, como no relatório de Zonas.
        const corpo = Math.round(11 * k * 1.15);
        ctx.font = `bold ${corpo}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const comRotulo = polis.filter(f => (f.properties as { rotulo?: unknown } | null)?.rotulo != null && String((f.properties as { rotulo?: unknown }).rotulo) !== '');
        const postos = posicionarRotulos(
          comRotulo.map(f => {
            const texto = String((f.properties as { rotulo: unknown }).rotulo);
            return {
              texto,
              aneis: aneisDoRotulo(f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon).map(anel => anel.map(pt => [px(pt[0]), py(pt[1])] as [number, number])),
              largura: ctx.measureText(texto).width,
              altura: corpo,
            };
          }),
          { largura: W, altura: H },
          { folga: corpo * 0.35, margem: corpo * 0.6 },
        );
        for (const p of postos) {
          if (!p.traco) continue;
          ctx.strokeStyle = '#000000'; ctx.lineWidth = 1.4 * k;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.traco.x, p.traco.y); ctx.stroke();
        }
        ctx.lineWidth = 1.4 * k * 2; ctx.strokeStyle = '#000000'; ctx.fillStyle = '#ffffff'; ctx.lineJoin = 'round';
        for (const p of postos) { ctx.strokeText(p.texto, p.x, p.y); ctx.fillText(p.texto, p.x, p.y); }
      } else if (d.estilo === 'pontos') {
        const r = 5 * k;
        ctx.lineWidth = 1.5 * k; ctx.strokeStyle = '#0f172a';
        for (const f of d.geojson.features) {
          if (f.geometry?.type !== 'Point') continue;
          const [lng, lat] = f.geometry.coordinates;
          ctx.beginPath(); ctx.arc(px(lng), py(lat), r, 0, Math.PI * 2);
          ctx.fillStyle = (f.properties as { cor?: string } | null)?.cor ?? '#facc15';
          ctx.fill(); ctx.stroke();
        }
      } else {
        // 'contorno'. O cadastro guarda o limite como FeatureCollection, Feature
        // ou geometria solta (depende de quando o talhão foi importado) — o
        // tipo diz FeatureCollection, o dado nem sempre.
        riscar(geometriasDe(d.geojson as GeoJSON.GeoJSON), '#fde68a', 2.5 * k);
      }
    } catch (err) {
      // Uma camada que falhou não derruba o mapa inteiro.
      console.warn('[camadas/pdf] falha ao desenhar', d.id, err);
    } finally {
      ctx.restore();
    }
  }

  if (c.limiteReferencia && c.poligono) {
    ctx.globalAlpha = 1;
    riscar([c.poligono], '#ffffff', 1.2 * k);
  }

  return cv.toDataURL('image/png');
}

// Baixa e desenha os tiles de satélite que cobrem TODO o canvas (frame).
async function desenharSatelite(
  ctx: CanvasRenderingContext2D, bounds: [number, number, number, number],
  ox: number, oy: number, drawW: number, drawH: number, W: number, H: number,
): Promise<boolean> {   // true = TODOS os tiles desenhados (os outros chamadores ignoram)
  const [w, s, e, n] = bounds;
  const px = (lng: number) => ox + ((lng - w) / (e - w || 1)) * drawW;
  const py = (lat: number) => oy + ((n - lat) / (n - s || 1)) * drawH;
  // extensão lat/lng de todo o canvas (inverso da projeção)
  const lonL = w + ((0 - ox) / drawW) * (e - w);
  const lonR = w + ((W - ox) / drawW) * (e - w);
  const latT = n - ((0 - oy) / drawH) * (n - s);
  const latB = n - ((H - oy) / drawH) * (n - s);
  const lonSpan = Math.max(1e-6, lonR - lonL);
  let z = Math.round(Math.log2((5 * 360) / lonSpan));
  z = Math.max(10, Math.min(19, z));
  const xMin = Math.floor(lon2tile(lonL, z)), xMax = Math.floor(lon2tile(lonR, z));
  const yMin = Math.floor(lat2tile(latT, z)), yMax = Math.floor(lat2tile(latB, z));
  if ((xMax - xMin + 1) * (yMax - yMin + 1) > 90) return false; // segurança
  const jobs: Promise<boolean>[] = [];
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      jobs.push(buscarTile(z, x, y).then(img => {
        if (!img) return false;
        const x0 = px(tile2lon(x, z)), x1 = px(tile2lon(x + 1, z));
        const y0 = py(tile2lat(y, z)), y1 = py(tile2lat(y + 1, z));
        // Bordas ARREDONDADAS PARA FORA. Em coordenadas fracionárias, dois
        // tiles vizinhos não encostam: sobra uma fresta de sub-pixel e, como o
        // canvas tem fundo branco, ela aparece no PDF como uma GRADE de linhas
        // brancas riscando o mapa inteiro. Com floor/ceil os tiles se
        // sobrepõem em menos de 1 px — invisível — e a grade some.
        const dx0 = Math.floor(x0), dy0 = Math.floor(y0);
        const dx1 = Math.ceil(x1), dy1 = Math.ceil(y1);
        ctx.drawImage(img, dx0, dy0, Math.max(1, dx1 - dx0), Math.max(1, dy1 - dy0));
        return true;
      }));
    }
  }
  return (await Promise.all(jobs)).every(Boolean);
}
