'use client';

// Relatório PDF da aba CAMADAS do talhão (A4 paisagem) — "Mapa de camadas".
//
// É o retrato do que o usuário montou na aba (components/talhao/CamadasSection):
// as camadas VISÍVEIS, na ordem da lista (topo → fundo) e com a transparência de
// cada uma, sobre o satélite. Nada é reprocessado: os desenhos chegam prontos
// (o mesmo `carregar` que alimenta o mapa) e a composição é feita em canvas por
// capturarMapaCamadas (lib/capturaMapa).
//
// Dois modos, escolhidos na hora de gerar:
//   - 'composto': UMA página — o mapa composto + coluna de legendas.
//   - 'completo': a página composta + UMA PÁGINA POR CAMADA, sozinha, com a
//     legenda dela. Nessas páginas o RASTER sai a 100% (a transparência servia
//     para enxergar o que estava embaixo; sozinho, transparente só desbota a cor
//     e a legenda deixa de bater com o mapa). VETOR mantém a opacidade escolhida
//     (zonas a 60% deixam ver o satélite por baixo, que é a referência delas).
//     O contorno do talhão NÃO ganha página própria (seria uma página só com a
//     divisa); nas páginas isoladas ele entra como traço fino de referência.
//
// Layout no padrão dos demais relatórios (relatorioZonas): cabeçalho oficial
// (lib/pdfCabecalho), norte + escala gráfica no mapa, marca INVICTA no pé da
// área branca e rodapé navy. Mapa em JPEG, barra de rampa em PNG (pdfImagem).

import type { jsPDF as JsPDF } from 'jspdf';
import { capturarMapaCamadas, enquadramento, bboxGeo } from './capturaMapa';
import { imagemParaPdf, reduzirLogo } from './pdfImagem';
import { DATUM, desenharCabecalhoOficial, clipTexto, marcaInvicta, nomeTalhaoPadrao } from './pdfCabecalho';
import { interpRgb } from './legendas';
import { extrairPoligono } from './fertilidade';
import { rotuloAno } from './periodo';
import { getClientes, getFazendas, getTalhoes, type Cliente, type Fazenda, type Talhao } from './store';
import { listarFontesCamadas, type DesenhoCamada, type LegendaCamada } from './camadasTalhao';
import { abrirPdfNaAba, limparNomeArquivo } from './abrirPdf';
import type { RegistroRelatorio } from './relatoriosArquivo';

type RGB = [number, number, number];
const NAVY: RGB = [13, 33, 64];
const GRAY: RGB = [100, 116, 139];
const LINE: RGB = [210, 219, 232];
const W = 297, H = 210, M = 6;
// Geometria da página: mapa à esquerda, coluna de legendas à direita. O mapa
// fecha em 181 mm, antes da marca INVICTA (184–196), que vai à esquerda.
const MAPA = { x: M, y: 31, w: 196, h: 150 };
const LEG = { x: MAPA.x + MAPA.w + 6, y: MAPA.y, w: W - M - (MAPA.x + MAPA.w + 6), h: MAPA.h };
const PXMM = 8;   // px de canvas por mm impresso (mesmo do relatório de Zonas)

const fmt = (v: number, d = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
// A fonte padrão do jsPDF é Latin-1: fora dela (emoji, travessão…) sai lixo.
const san = (s: string | null | undefined): string => (s ?? '').replace(/[–—]/g, '-').replace(/[^\x00-\xFF]/g, '');

export interface CamadaRelatorio {
  nome: string;
  grupo: string;
  desenho: DesenhoCamada;
  opacidade: number;          // 0..1, a da pilha
  legenda?: LegendaCamada;    // ausente → usa a do desenho
}

export interface OpcoesPdfCamadas {
  talhao: Talhao;
  fazenda: Fazenda | null;
  cliente: Cliente | null;
  safra: string;
  /** Índice 0 = topo do mapa (ordem da lista da aba). */
  camadas: CamadaRelatorio[];
  modo: 'composto' | 'completo';
  satelite?: boolean;         // default true
}

/** "JMGBV 04 2026 mapa de camadas" — nome legível, como o do book de recomendações. */
export function nomeArquivoCamadas(talhao: Pick<Talhao, 'nome'>, safra: string): string {
  const ano = rotuloAno(safra);
  return `${nomeTalhaoPadrao(talhao.nome) || 'TALHAO'}${ano && ano !== '—' ? ' ' + ano : ''} mapa de camadas`;
}

function carregarImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => res(img); img.onerror = () => rej(new Error(`falha ao carregar ${src}`)); img.src = src;
  });
}
async function carregarLogos(cliUrl?: string | null) {
  const inv = await carregarImg('/images/logo-colorida.png').catch(() => null);
  const cli = cliUrl ? await carregarImg(cliUrl).catch(() => null) : null;
  return {
    inv: inv ? await reduzirLogo(inv) : null,
    branca: await carregarImg('/images/logo-branca.png').then(reduzirLogo).catch(() => null),
    cli: cli ? await reduzirLogo(cli) : null,
  };
}
function nice(x: number): number {
  if (x <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const f = x / p; const nf = f >= 5 ? 5 : f >= 2.5 ? 2.5 : f >= 2 ? 2 : 1;
  return nf * p;
}
const hexRgb = (hex: string): RGB => {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || '');
  return m ? [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)] : [148, 163, 184];
};

/** Limite do talhão (para enquadrar e para o traço de referência). */
function poligonoDoTalhao(t: Talhao): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  if (!t.geojson) return null;
  try { return extrairPoligono(JSON.parse(t.geojson)); } catch { return null; }
}

/** Enquadramento: o contorno; sem ele, o bbox cadastrado; sem os dois, a
 *  união das camadas (talhão sem limite ainda pode ter pontos ou zonas). */
function enquadrarTalhao(t: Talhao, camadas: CamadaRelatorio[], poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon | null): [number, number, number, number] {
  const doPoligono = poligono ? bboxGeo(poligono) : null;
  if (doPoligono) return doPoligono;
  if (t.bbox && t.bbox.every(Number.isFinite) && t.bbox[2] > t.bbox[0] && t.bbox[3] > t.bbox[1]) return t.bbox;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const c of camadas) {
    const b = c.desenho.tipo === 'raster'
      ? bboxGeo({ type: 'MultiPoint', coordinates: c.desenho.coordinates })
      : bboxGeo(c.desenho.geojson);
    if (!b) continue;
    w = Math.min(w, b[0]); s = Math.min(s, b[1]); e = Math.max(e, b[2]); n = Math.max(n, b[3]);
  }
  return isFinite(w) ? [w, s, e, n] : [-0.001, -0.001, 0.001, 0.001];
}

// ── Norte e escala gráfica ──────────────────────────────────────────────────
// A escala usa o tamanho REAL desenhado (enquadramento), não o do quadro: o
// mapa ocupa só a parte do quadro que o aspecto do talhão deixa.
function desenharNorteEscala(doc: JsPDF, bounds: [number, number, number, number]) {
  const { x, y, w, h } = MAPA;
  const nx = x + 7, ny = y + h - 7;
  doc.setFillColor(...NAVY); doc.roundedRect(nx - 4.5, ny - 5.5, 9, 11, 1, 1, 'F');
  doc.setFillColor(255, 255, 255); doc.triangle(nx, ny - 4, nx - 2.2, ny + 0.5, nx + 2.2, ny + 0.5, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(6); doc.text('N', nx, ny + 4, { align: 'center' });

  const [w0, s0, e0, n0] = bounds;
  const latC = (s0 + n0) / 2;
  const { drawW } = enquadramento(bounds, w, h);        // em mm (mesma conta, unidade do quadro)
  const groundW = Math.max(1, (e0 - w0) * 111320 * Math.cos(latC * Math.PI / 180));
  const mPorMm = groundW / Math.max(1e-6, drawW);
  const niceMax = nice(mPorMm * 40);
  const barLen = Math.min(60, niceMax / mPorMm);
  const ex = x + w - barLen - 6, ey = y + h - 6;
  for (let k = 0; k < 4; k++) {
    const sx = ex + (barLen / 4) * k;
    doc.setFillColor(...(k % 2 === 0 ? NAVY : [255, 255, 255] as RGB)); doc.setDrawColor(...NAVY); doc.setLineWidth(0.2);
    doc.rect(sx, ey, barLen / 4, 2, k % 2 === 0 ? 'FD' : 'D');
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(255, 255, 255);
  doc.text(`${niceMax >= 1000 ? fmt(niceMax / 1000, niceMax % 1000 ? 1 : 0) + ' km' : Math.round(niceMax) + ' m'}`, ex + barLen, ey - 1.5, { align: 'right' });
}

// ── Barra da rampa (NDVI) em PNG ────────────────────────────────────────────
async function barraRampa(stops: Array<[number, RGB]>, mmLarg: number) {
  const cw = 600, ch = 24;
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const ctx = cv.getContext('2d')!;
  for (let i = 0; i < cw; i++) {
    const [r, g, b] = interpRgb(stops, i / (cw - 1));
    ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fillRect(i, 0, 1, ch);
  }
  return imagemParaPdf(cv, mmLarg, { forcarPng: true });
}

// ── Coluna de legendas ──────────────────────────────────────────────────────
// Altura de cada bloco calculada ANTES de desenhar: com muitas camadas a coluna
// inteira encolhe (até 62%) para caber; passou disso, as que sobram viram uma
// nota "+N camada(s)" — no modo completo cada uma tem a própria página.
const ALT = { titulo: 4.4, sub: 3.6, item: 3.6, unidade: 3.4, rampa: 9.5, gap: 3.2 };

function alturaBloco(c: CamadaRelatorio): number {
  const leg = c.legenda ?? c.desenho.legenda;
  let h = ALT.titulo + ALT.sub;
  if (leg?.tipo === 'classes') h += leg.itens.length * ALT.item + (leg.unidade ? ALT.unidade : 0);
  else if (leg?.tipo === 'rampa') h += ALT.rampa;
  return h + ALT.gap;
}

async function desenharLegendas(doc: JsPDF, camadas: CamadaRelatorio[], opts: { maxEscala?: number; mostrarOpacidade?: Array<number | null> } = {}) {
  const { x, y, w, h } = LEG;
  doc.setFillColor(...NAVY); doc.rect(x, y, w, 7, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
  doc.text('LEGENDA', x + 3, y + 4.8);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
  doc.text(camadas.length > 1 ? 'topo -> fundo' : '', x + w - 3, y + 4.8, { align: 'right' });

  const topo = y + 10, fundo = y + h;
  const disponivel = fundo - topo;
  const total = camadas.reduce((s, c) => s + alturaBloco(c), 0);
  const esc = Math.max(0.62, Math.min(opts.maxEscala ?? 1, disponivel / Math.max(1, total)));
  let cy = topo;

  for (let i = 0; i < camadas.length; i++) {
    const c = camadas[i];
    const hb = alturaBloco(c) * esc;
    if (cy + hb > fundo + 0.5) {
      const resto = camadas.length - i;
      doc.setFont('helvetica', 'italic'); doc.setFontSize(6.5 * esc); doc.setTextColor(...GRAY);
      doc.text(clipTexto(doc, `+${resto} camada${resto === 1 ? '' : 's'} sem espaço nesta coluna`, w - 4), x + 2, Math.min(cy + 3, fundo));
      break;
    }
    const leg = c.legenda ?? c.desenho.legenda;
    // Título: nome da camada (com amostra da 1ª cor da legenda).
    const corTit = leg?.tipo === 'classes' && leg.itens[0] ? hexRgb(leg.itens[0].cor)
      : leg?.tipo === 'rampa' && leg.stops.length ? leg.stops[leg.stops.length - 1][1] : NAVY;
    doc.setFillColor(...corTit); doc.rect(x + 1, cy + 0.6 * esc, 2.6 * esc, 2.6 * esc, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8 * esc); doc.setTextColor(...NAVY);
    doc.text(clipTexto(doc, san(c.nome), w - 6), x + 1 + 3.6 * esc, cy + 2.9 * esc);
    cy += ALT.titulo * esc;
    // Grupo + opacidade (na página isolada de raster a opacidade não se aplica).
    const op = opts.mostrarOpacidade ? opts.mostrarOpacidade[i] : c.opacidade;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5 * esc); doc.setTextColor(...GRAY);
    doc.text(clipTexto(doc, `${san(c.grupo)}${op != null ? `  |  opacidade ${Math.round(op * 100)}%` : ''}`, w - 4), x + 1, cy + 2.4 * esc);
    cy += ALT.sub * esc;

    if (leg?.tipo === 'classes') {
      for (const it of leg.itens) {
        const [r, g, b] = hexRgb(it.cor);
        const sx = x + 2.5, sy = cy + 0.5 * esc, sw = 4 * esc, sh = 2.4 * esc;
        if (it.forma === 'linha') {
          doc.setDrawColor(r, g, b); doc.setLineWidth(0.9 * esc); doc.line(sx, sy + sh / 2, sx + sw, sy + sh / 2);
        } else if (it.forma === 'ponto') {
          doc.setFillColor(r, g, b); doc.setDrawColor(15, 23, 42); doc.setLineWidth(0.25);
          doc.circle(sx + sw / 2, sy + sh / 2, 1.2 * esc, 'FD');
        } else {
          doc.setFillColor(r, g, b); doc.setDrawColor(...LINE); doc.setLineWidth(0.1); doc.rect(sx, sy, sw, sh, 'FD');
        }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8 * esc); doc.setTextColor(...NAVY);
        doc.text(clipTexto(doc, san(it.rotulo), w - 10), sx + sw + 1.8, cy + 2.4 * esc);
        cy += ALT.item * esc;
      }
      if (leg.unidade) {
        doc.setFont('helvetica', 'italic'); doc.setFontSize(6.2 * esc); doc.setTextColor(...GRAY);
        doc.text(clipTexto(doc, san(leg.unidade), w - 6), x + 2.5, cy + 2.3 * esc);
        cy += ALT.unidade * esc;
      }
    } else if (leg?.tipo === 'rampa') {
      const bw = w - 7, bx = x + 2.5;
      try {
        const img = await barraRampa(leg.stops, bw);
        doc.addImage(img.data, img.formato, bx, cy + 0.5 * esc, bw, 3 * esc);
      } catch { /* sem barra: ficam só os números */ }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.3 * esc); doc.setTextColor(...NAVY);
      const casas = Math.abs(leg.max - leg.min) < 10 ? 2 : 0;
      const ty = cy + 0.5 * esc + 3 * esc + 2.8 * esc;
      doc.text(fmt(leg.min, casas), bx, ty);
      doc.text(fmt((leg.min + leg.max) / 2, casas), bx + bw / 2, ty, { align: 'center' });
      doc.text(fmt(leg.max, casas), bx + bw, ty, { align: 'right' });
      if (leg.unidade) { doc.setTextColor(...GRAY); doc.text(san(leg.unidade), bx + bw / 2, ty + 2.8 * esc, { align: 'center' }); }
      cy += ALT.rampa * esc;
    }
    cy += ALT.gap * esc;
    if (i < camadas.length - 1) { doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(x, cy - ALT.gap * esc / 2, x + w, cy - ALT.gap * esc / 2); }
  }
}

function desenharRodape(doc: JsPDF, branca: HTMLImageElement | null) {
  doc.setFillColor(...NAVY); doc.rect(0, H - 10, W, 10, 'F');
  if (branca) { const h = 5, w = h * (branca.naturalWidth / branca.naturalHeight); doc.addImage(branca, 'PNG', M, H - 7.5, w, h); }
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
  doc.text('INVICTA AP   |   Tecnologia que transforma dados em produtividade.', M + 26, H - 3.8);
  doc.setFont('helvetica', 'bold'); doc.text('www.invicta.agr.br', W - M, H - 3.8, { align: 'right' });
}

/** Monta o PDF (não salva nem abre: quem chama decide — a aba baixa com
 *  doc.save; o histórico de Relatórios abre na aba de leitura). */
export async function gerarPdfCamadas(o: OpcoesPdfCamadas): Promise<JsPDF> {
  if (!o.camadas.length) throw new Error('Nenhuma camada pronta para o relatório.');
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true }) as JsPDF;
  const logos = await carregarLogos((o.cliente as { logoUrl?: string } | null)?.logoUrl ?? null);
  const poligono = poligonoDoTalhao(o.talhao);
  const bounds = enquadrarTalhao(o.talhao, o.camadas, poligono);
  const satelite = o.satelite !== false;
  const emissao = new Date().toLocaleDateString('pt-BR');
  const nCam = o.camadas.length;

  const cabecalho = (subtitulo: string) => desenharCabecalhoOficial(doc, {
    logoCliente: logos.cli,
    fazenda: san(o.fazenda?.nome), siglaFazenda: o.fazenda?.sigla ?? null, talhao: o.talhao.nome,
    esquerda: [
      `Produtor: ${san(o.cliente?.nome) || '—'}`,
      `Fazenda: ${san(o.fazenda?.nome) || '—'}   |   Ano: ${san(rotuloAno(o.safra))}`,
    ],
    titulo: 'MAPA DE CAMADAS',
    subtitulo: san(subtitulo),
    info: [
      `Área: ${o.talhao.areaHa ? fmt(o.talhao.areaHa, 2) + ' ha' : '—'}`,
      `Camadas: ${nCam}`,
      `Datum: ${DATUM}`,
      `Emissão: ${emissao}`,
    ],
  });

  const mapaNaPagina = async (camadas: Array<{ desenho: DesenhoCamada; opacidade: number }>, referencia: boolean) => {
    const png = await capturarMapaCamadas({
      bounds, poligono, camadas, satelite, limiteReferencia: referencia,
      larguraPx: Math.round(MAPA.w * PXMM), alturaPx: Math.round(MAPA.h * PXMM),
    });
    const jpg = await imagemParaPdf(png, MAPA.w);
    doc.addImage(jpg.data, jpg.formato, MAPA.x, MAPA.y, MAPA.w, MAPA.h);
    doc.setDrawColor(...LINE); doc.setLineWidth(0.4); doc.rect(MAPA.x, MAPA.y, MAPA.w, MAPA.h, 'S');
    desenharNorteEscala(doc, bounds);
  };

  // ── Página 1: o composto, como está na tela ──
  cabecalho(`Composição de ${nCam} camada${nCam === 1 ? '' : 's'} sobre ${satelite ? 'satélite' : 'fundo branco'}`);
  await mapaNaPagina(o.camadas.map(c => ({ desenho: c.desenho, opacidade: c.opacidade })), false);
  await desenharLegendas(doc, o.camadas);
  marcaInvicta(doc, logos.inv, 'esquerda');
  desenharRodape(doc, logos.branca);

  // ── Modo completo: uma página por camada ──
  if (o.modo === 'completo') {
    for (const c of o.camadas) {
      if (c.desenho.tipo === 'vetor' && c.desenho.estilo === 'contorno') continue;
      const raster = c.desenho.tipo === 'raster';
      const opacidade = raster ? 1 : c.opacidade;
      doc.addPage();
      cabecalho(`${c.nome} · ${c.grupo}`);
      await mapaNaPagina([{ desenho: c.desenho, opacidade }], true);
      await desenharLegendas(doc, [c], { maxEscala: 1.25, mostrarOpacidade: [raster ? null : opacidade] });
      marcaInvicta(doc, logos.inv, 'esquerda');
      desenharRodape(doc, logos.branca);
    }
  }
  return doc;
}

/** Fazenda e produtor do talhão (cabeçalho do PDF), pelo cadastro local. */
export function contextoCadastro(talhao: Pick<Talhao, 'fazendaId'>): { fazenda: Fazenda | null; cliente: Cliente | null } {
  const fazenda = getFazendas().find(f => f.id === talhao.fazendaId) ?? null;
  const cliente = fazenda ? getClientes().find(c => c.id === fazenda.clienteId) ?? null : null;
  return { fazenda, cliente };
}

/**
 * REABRE um "Mapa de camadas" do histórico (lib/relatoriosArquivo guarda só a
 * configuração): relista as fontes do talhão/safra, recarrega os ids guardados
 * — na ordem e com a opacidade de então — e regera o PDF, aberto na aba de
 * leitura como os outros relatórios. Camada que não existe mais (mapa apagado,
 * zoneamento excluído) fica de fora e volta no `aviso`; sem nenhuma, é erro.
 * A aba é aberta ANTES do primeiro await (senão o navegador bloqueia o popup).
 */
// `liberada`: a mesma regra da aba Camadas (plano + matriz de quem ABRE). Quem
// gerou pode ter incluído uma camada que o leitor não pode ver: ela sai do PDF e
// entra no aviso como indisponível (só o nome, sem o mapa).
export async function regenerarRelatorioCamadas(reg: RegistroRelatorio, liberada?: (aba: string) => boolean): Promise<{ aviso?: string }> {
  const cfg = reg.camadas;
  if (!cfg?.ids?.length) throw new Error('Este relatório de camadas não guardou a configuração.');
  const talhao = getTalhoes().find(t => t.id === reg.talhaoId);
  if (!talhao) throw new Error('O talhão deste relatório não está mais no cadastro.');
  const aba = typeof window !== 'undefined' ? window.open('', '_blank') : null;
  if (aba) try { aba.document.write('<!doctype html><meta charset="utf-8"><title>Relatório</title><body style="font-family:system-ui,sans-serif;padding:28px;color:#334155"><p>⏳ Gerando o mapa de camadas… aguarde alguns segundos.</p></body>'); } catch {}
  try {
    const grupos = await listarFontesCamadas(talhao, liberada);
    const itens = new Map(grupos.flatMap(g => g.itens.map(i => [i.id, i] as const)));
    const camadas: CamadaRelatorio[] = [];
    const faltando: string[] = [];
    for (let i = 0; i < cfg.ids.length; i++) {
      const id = cfg.ids[i];
      const nomeAntigo = reg.elementos?.[i] ?? id;
      const item = itens.get(id);
      const desenho = item ? await item.carregar().catch(() => null) : null;
      if (!item || !desenho) { faltando.push(nomeAntigo); continue; }
      camadas.push({ nome: item.detalhe ? `${item.nome} (${item.detalhe})` : item.nome, grupo: item.grupo, desenho, opacidade: cfg.opacidades?.[i] ?? 1 });
    }
    if (!camadas.length) throw new Error('Nenhuma das camadas deste relatório está disponível (foram removidas ou seu acesso não as inclui).');
    const doc = await gerarPdfCamadas({ talhao, ...contextoCadastro(talhao), safra: reg.safra, camadas, modo: cfg.modo });
    abrirPdfNaAba(aba, doc.output('blob'), limparNomeArquivo(nomeArquivoCamadas(talhao, reg.safra)));
    return faltando.length
      ? { aviso: `Regerado sem ${faltando.length} ${faltando.length === 1 ? 'camada indisponível' : 'camadas indisponíveis'} (removida do talhão ou fora do seu acesso).` }
      : {};
  } catch (e) {
    try { aba?.close(); } catch { /* aba já fechada */ }
    throw e;
  }
}
