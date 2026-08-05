'use client';

// Compõe a imagem do mapa para o relatório PDF, em canvas (determinístico, sem
// MapLibre — evita timeout/tainting de WebGL). Ordem das camadas (spec):
//   1. Satélite (tiles ESRI via fetch→blob→bitmap; canvas fica "clean" p/ export)
//   2. Raster interpolado (já colorido)
//   3. Valores da amostra (só o número, halo)
//   4. Limite do talhão (contorno, por cima)
// Sem satélite (ou se os tiles falharem por CORS/rede) → fundo branco.

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

  // 3) Valores (só o número, halo branco)
  ctx.font = `bold ${Math.round(W / 90)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(2, W / 350); ctx.strokeStyle = '#1f2937'; ctx.fillStyle = '#ffffff';
  for (const f of c.valores.features) {
    if (f.geometry?.type !== 'Point') continue;
    const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
    const txt = String((f.properties as { txt?: string } | null)?.txt ?? '');
    if (!txt) continue;
    const x = px(lng), y = py(lat);
    ctx.strokeText(txt, x, y); ctx.fillText(txt, x, y);
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

  // 4) Rótulo (nº da zona) no centroide aproximado
  ctx.font = `bold ${Math.round(W / 45)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(2, W / 300);
  for (const z of c.zonas) {
    if (!z.rotulo) continue;
    const aneis = aneisDe(z.geometry);
    let sx = 0, sy = 0, np = 0;
    for (const pt of aneis[0] ?? []) { sx += px(pt[0]); sy += py(pt[1]); np++; }
    if (!np) continue;
    const x = sx / np, y = sy / np;
    ctx.strokeStyle = '#1f2937'; ctx.fillStyle = '#ffffff';
    ctx.strokeText(z.rotulo, x, y); ctx.fillText(z.rotulo, x, y);
  }

  return cv.toDataURL('image/png');
}

// Baixa e desenha os tiles de satélite que cobrem TODO o canvas (frame).
async function desenharSatelite(
  ctx: CanvasRenderingContext2D, bounds: [number, number, number, number],
  ox: number, oy: number, drawW: number, drawH: number, W: number, H: number,
): Promise<void> {
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
  if ((xMax - xMin + 1) * (yMax - yMin + 1) > 90) return; // segurança
  const jobs: Promise<void>[] = [];
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      jobs.push(buscarTile(z, x, y).then(img => {
        if (!img) return;
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
      }));
    }
  }
  await Promise.all(jobs);
}
