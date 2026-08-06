// Relatório RÁPIDO de mapas de satélite (aba NDVI do talhão) — 1 mapa por
// página, para envio ao produtor. Reaproveita a infraestrutura dos relatórios:
// captura com fundo de satélite + contorno (capturaMapa), logos reduzidos e
// imagens comprimidas no tamanho de impressão (pdfImagem).
import { jsPDF as JsPDF } from 'jspdf';
import { capturarMapaFertilidade } from './capturaMapa';
import { imagemParaPdf, reduzirLogo } from './pdfImagem';
import { rampaVisualStops, type Legenda } from './legendas';
import { rotuloAno } from './periodo';

export interface MapaRelNdvi {
  titulo: string;                                      // "NDVI · Sentinel-2 · 12/07/2026"
  png: string;                                         // raster colorido OU imagem RGB (dataUrl)
  bounds: [number, number, number, number];
  legenda?: Legenda | null;                            // barra de cores (índices); ausente = RGB
  dominio?: [number, number];                          // rótulos min/max da barra
  satelite?: boolean;                                  // fundo de satélite sob o raster
  // Linha do tempo (última página, quando há 2+ mapas): média do índice na
  // data — RGB e mapas sem média ficam de fora; duplicatas (contraste) contam 1x.
  serie?: string;                                      // "NDVI · Sentinel-2"
  data?: string;                                       // ISO yyyy-mm-dd
  media?: number | null;
}

export interface DadosRelatorioNdvi {
  produtor: string; fazenda: string; talhao: string; safra: string; areaHa: number;
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  logoClienteUrl?: string | null;
  mapas: MapaRelNdvi[];
}

const NAVY: [number, number, number] = [13, 33, 64];
const GRAY: [number, number, number] = [100, 116, 139];
const LINE: [number, number, number] = [210, 219, 232];
// Cores das séries da linha do tempo — versões escuras (papel branco) da
// paleta usada na aba NDVI (TimelineIndices).
const CORES_SERIE: [number, number, number][] = [
  [22, 163, 74], [37, 99, 235], [219, 39, 119], [217, 119, 6],
  [124, 58, 237], [220, 38, 38], [5, 150, 105], [234, 88, 12],
];
// Área: SEMPRE duas casas, inclusive o zero final (ver fmtHa em lib/formato).
const fmtHa = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtData = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });

function carregarImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

// ── Peças reutilizáveis (usadas aqui e pelo relatório da FAZENDA inteira) ────
// O relatório da fazenda desenha as MESMAS páginas de mapa num único PDF, um
// bloco por talhão — por isso cabeçalho/página são funções de módulo, sem
// closure sobre um talhão específico.

export interface CtxNdvi {
  produtor: string; fazenda: string; talhao: string; safra: string; areaHa: number;
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon;
}
export interface LogosNdvi { inv: HTMLImageElement | null; cli: HTMLImageElement | null; }

export async function carregarLogosNdvi(logoClienteUrl?: string | null): Promise<LogosNdvi> {
  const inv = await carregarImg('/images/logo-colorida.png').then(reduzirLogo).catch(() => null);
  const cli = logoClienteUrl ? await carregarImg(logoClienteUrl).then(reduzirLogo).catch(() => null) : null;
  return { inv, cli };
}

const W_PAG = 210, M_PAG = 14, CW_PAG = W_PAG - 2 * M_PAG;

// Cabeçalho com logos + identificação. `titulo` permite reaproveitar no
// relatório da fazenda ("MAPAS DE SATÉLITE — <talhão>"). Devolve o y do conteúdo.
async function desenharCabecalhoNdvi(doc: JsPDF, ctx: CtxNdvi, logos: LogosNdvi, titulo = 'MAPAS DE SATÉLITE'): Promise<number> {
  let y = 12;
  if (logos.inv) {
    const h = 11, w = (logos.inv.width / logos.inv.height) * h;
    const img = await imagemParaPdf(logos.inv, w, { forcarPng: true });
    doc.addImage(img.data, img.formato, M_PAG, y, w, h);
  }
  if (logos.cli) {
    const h = 11, w = Math.min(40, (logos.cli.width / logos.cli.height) * h);
    const img = await imagemParaPdf(logos.cli, w, { forcarPng: true });
    doc.addImage(img.data, img.formato, W_PAG - M_PAG - w, y, w, h);
  }
  y += 16;
  doc.setTextColor(...NAVY).setFont('helvetica', 'bold').setFontSize(13);
  doc.text(titulo, M_PAG, y);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...GRAY);
  doc.text(`${ctx.produtor}  ·  ${ctx.fazenda}  ·  Talhão ${ctx.talhao}  ·  Ano ${rotuloAno(ctx.safra)}  ·  ${fmtHa(ctx.areaHa)} ha`, M_PAG, y + 5);
  doc.setDrawColor(...LINE).setLineWidth(0.4).line(M_PAG, y + 8, W_PAG - M_PAG, y + 8);
  return y + 14;
}

export function desenharRodapeNdvi(doc: JsPDF, direita: string): void {
  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GRAY);
  doc.text(`INVICTA · gerado em ${new Date().toLocaleString('pt-BR')}`, M_PAG, 290);
  doc.text(direita, W_PAG - M_PAG, 290, { align: 'right' });
}

// Desenha UMA página de mapa na página ATUAL do doc (quem chama controla o
// addPage). Reaproveitada pelo relatório da fazenda.
export async function desenharPaginaMapaNdvi(
  doc: JsPDF, m: MapaRelNdvi, ctx: CtxNdvi, logos: LogosNdvi,
  opts: { titulo?: string; rodape?: string } = {},
): Promise<void> {
  let y = await desenharCabecalhoNdvi(doc, ctx, logos, opts.titulo);

  doc.setTextColor(...NAVY).setFont('helvetica', 'bold').setFontSize(11);
  doc.text(m.titulo, M_PAG, y);
  y += 4;

  // Mapa (captura com contorno; satélite sob o raster quando índice).
  // 8 px/mm ≈ 200 dpi — mesmo padrão do relatório de fertilidade.
  const maxH = 205;
  const composto = await capturarMapaFertilidade({
    rasterPng: m.png, bounds: m.bounds, poligono: ctx.poligono,
    valores: { type: 'FeatureCollection', features: [] },
    satelite: m.satelite ?? false, corLimite: '#ffffff',
    larguraPx: Math.round(CW_PAG * 8), alturaPx: Math.round(maxH * 8),
  });
  const propria = await carregarImg(composto);
  let mw = CW_PAG, mh = (propria.height / propria.width) * mw;
  if (mh > maxH) { mh = maxH; mw = (propria.width / propria.height) * mh; }
  const mx = M_PAG + (CW_PAG - mw) / 2;
  const img = await imagemParaPdf(composto, mw);
  doc.addImage(img.data, img.formato, mx, y, mw, mh);
  doc.setDrawColor(...LINE).setLineWidth(0.3).rect(mx, y, mw, mh);
  y += mh + 6;

  if (m.legenda) {
    const bw = Math.min(120, CW_PAG), bh = 5, bx = M_PAG + (CW_PAG - bw) / 2;
    const barra = await imagemParaPdf(barraLegenda(m.legenda), bw, { forcarPng: true });
    doc.addImage(barra.data, barra.formato, bx, y, bw, bh);
    doc.setDrawColor(...LINE).setLineWidth(0.3).rect(bx, y, bw, bh);
    const [lo, hi] = m.dominio ?? [0, 1];
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GRAY);
    doc.text(fmt2(lo), bx, y + bh + 3.5);
    doc.text(fmt2(hi), bx + bw, y + bh + 3.5, { align: 'right' });
    doc.setFontSize(8).setTextColor(...NAVY);
    doc.text(m.legenda.nome, W_PAG / 2, y + bh + 3.5, { align: 'center' });
  }
  if (opts.rodape) desenharRodapeNdvi(doc, opts.rodape);
}

// Barra de cores da legenda (gradiente contínuo) como PNG.
function barraLegenda(leg: Legenda, wPx = 600, hPx = 26): string {
  const canvas = document.createElement('canvas');
  canvas.width = wPx; canvas.height = hPx;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, wPx, 0);
  for (const [p, [r, g, b]] of rampaVisualStops({ ...leg, estilo: 'continuo' })) {
    grad.addColorStop(Math.max(0, Math.min(1, p)), `rgb(${r},${g},${b})`);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, wPx, hPx);
  return canvas.toDataURL('image/png');
}

export async function gerarRelatorioNdvi(d: DadosRelatorioNdvi): Promise<void> {
  const doc = new JsPDF({ unit: 'mm', format: 'a4', compress: true });
  const W = 210, M = 14, cw = W - 2 * M;

  const logos = await carregarLogosNdvi(d.logoClienteUrl);
  const ctx: CtxNdvi = {
    produtor: d.produtor, fazenda: d.fazenda, talhao: d.talhao,
    safra: d.safra, areaHa: d.areaHa, poligono: d.poligono,
  };

  // Pontos da linha do tempo: 1 por série+data (normal e contrastado do mesmo
  // NDVI compartilham a média — contam uma vez só).
  const porSerieData = new Map<string, { serie: string; data: string; media: number }>();
  for (const m of d.mapas) {
    if (m.serie && m.data && m.media != null && isFinite(m.media)) {
      porSerieData.set(`${m.serie}:${m.data}`, { serie: m.serie, data: m.data, media: m.media });
    }
  }
  const pontos = [...porSerieData.values()].sort((a, b) => a.data.localeCompare(b.data));
  const datas = [...new Set(pontos.map(p => p.data))].sort();
  const temTimeline = d.mapas.length > 1 && pontos.length >= 2 && datas.length >= 2;
  const totalPag = d.mapas.length + (temTimeline ? 1 : 0);

  for (let i = 0; i < d.mapas.length; i++) {
    if (i > 0) doc.addPage();
    await desenharPaginaMapaNdvi(doc, d.mapas[i], ctx, logos, { rodape: `${i + 1}/${totalPag}` });
  }

  // ── Última página: linha do tempo — média dos índices (como na aba NDVI) ──
  if (temTimeline) {
    doc.addPage();
    let y = await desenharCabecalhoNdvi(doc, ctx, logos);
    doc.setTextColor(...NAVY).setFont('helvetica', 'bold').setFontSize(11);
    doc.text('Linha do tempo — média dos índices', M, y);
    y += 6;

    const series = [...new Set(pontos.map(p => p.serie))];
    const cor = (s: string): [number, number, number] => CORES_SERIE[series.indexOf(s) % CORES_SERIE.length];

    let lo = Math.min(...pontos.map(p => p.media)), hi = Math.max(...pontos.map(p => p.media));
    if (hi - lo < 0.05) { lo -= 0.05; hi += 0.05; }
    else { const pad = (hi - lo) * 0.08; lo -= pad; hi += pad; }

    // Área do gráfico: x proporcional ao TEMPO (datas irregulares aparecem como são).
    const gx = M + 12, gw = cw - 14, gy = y + 2, gh = 85;
    const t0 = Date.parse(datas[0]), t1 = Date.parse(datas[datas.length - 1]);
    const X = (dt: string) => gx + ((Date.parse(dt) - t0) / (t1 - t0)) * gw;
    const Y = (v: number) => gy + (1 - (v - lo) / (hi - lo)) * gh;

    // Grade horizontal + rótulos do eixo Y
    doc.setDrawColor(...LINE).setLineWidth(0.25);
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GRAY);
    for (const v of [lo, (lo + hi) / 2, hi]) {
      doc.line(gx, Y(v), gx + gw, Y(v));
      doc.text(fmt2(v), gx - 1.5, Y(v) + 1, { align: 'right' });
    }

    // Eixo X: tick em toda data; rótulos escalonados em 2 linhas p/ não colidir
    doc.setDrawColor(...LINE).setLineWidth(0.3).line(gx, gy + gh, gx + gw, gy + gh);
    const passo = Math.ceil(datas.length / 12);
    let nRot = 0;
    datas.forEach((dt, i) => {
      const x = X(dt);
      doc.line(x, gy + gh, x, gy + gh + 1.5);
      if (i % passo !== 0 && i !== datas.length - 1) return;
      doc.setFontSize(7).setTextColor(...GRAY);
      doc.text(fmtData(dt), x, gy + gh + (nRot % 2 === 0 ? 4.5 : 8), { align: 'center' });
      nRot++;
    });

    // Séries: linha + pontos + valor (valores só quando o gráfico está limpo)
    for (const s of series) {
      const ps = pontos.filter(p => p.serie === s);
      const [r, g, b] = cor(s);
      doc.setDrawColor(r, g, b).setLineWidth(0.5);
      for (let i = 1; i < ps.length; i++) doc.line(X(ps[i - 1].data), Y(ps[i - 1].media), X(ps[i].data), Y(ps[i].media));
      doc.setFillColor(r, g, b);
      for (const p of ps) doc.circle(X(p.data), Y(p.media), 1.1, 'F');
      if (pontos.length <= 12) {
        doc.setFontSize(6.5).setTextColor(r, g, b);
        for (const p of ps) doc.text(fmt2(p.media), X(p.data), Y(p.media) - 2.2, { align: 'center' });
      }
    }

    // Legenda das séries + nota de leitura
    let lx = gx, ly = gy + gh + 13;
    doc.setFont('helvetica', 'bold').setFontSize(8);
    for (const s of series) {
      const [r, g, b] = cor(s);
      const wTxt = doc.getTextWidth(s) + 8;
      if (lx + wTxt > M + cw) { lx = gx; ly += 5; }
      doc.setFillColor(r, g, b).circle(lx + 1.2, ly - 1, 1.2, 'F');
      doc.setTextColor(r, g, b).text(s, lx + 3.5, ly);
      lx += wTxt;
    }
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GRAY);
    doc.text('Média do índice no talhão em cada data dos mapas deste relatório.', M, ly + 6);

    desenharRodapeNdvi(doc, `${totalPag}/${totalPag}`);
  }

  const nome = `Satelite_${d.talhao.replace(/\s+/g, '')}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(nome);
}
