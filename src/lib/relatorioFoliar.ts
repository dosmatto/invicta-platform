'use client';

// RELATÓRIO DA DIAGNOSE FOLIAR (ledger 36 e 37) — A4 paisagem, molde do
// `relatorioFertilidade.ts`: cabeçalho oficial compartilhado (`pdfCabecalho`),
// gráficos desenhados em <canvas> e injetados via `pdfImagem`, PDF aberto em
// nova aba por `abrirPdfNaAba` — NUNCA `doc.save`, para o usuário receber a aba
// com o nome do arquivo já preenchido.
//
// TRÊS REGRAS QUE ESTE ARQUIVO HERDA DO NÚCLEO E NÃO PODE AFROUXAR:
//
//  1. MÉTODO QUE NÃO RODOU SAI NO PAPEL COM O MOTIVO POR EXTENSO (ledger 17).
//     Página em branco, célula vazia ou zero seriam mentiras diferentes: zero é
//     um diagnóstico ("equilibrado"), ausência de norma não é. Por isso cada
//     `*Motivo` da diagnose tem lugar reservado no layout.
//  2. AS LIMITAÇÕES DO MÉTODO VÃO IMPRESSAS (ledger 37). O que aparece na tela
//     e some no PDF é exatamente o que o cliente nunca lê. A página 4 carrega o
//     texto fixo + os `avisos` daquela execução + os `avisos` DA NORMA — e é
//     nesse último balde que vive a ressalva de procedência da tabela clássica
//     da Embrapa ("não conferida na fonte primária"): ela tem de sair no papel,
//     senão a norma mais frouxa do catálogo chega ao produtor com cara de
//     número conferido.
//  3. OS GRÁFICOS SÃO OS MESMOS DA TELA. `foliarGraficos.ts` é reusado com
//     `TEMA_CLARO` (papel branco) em vez de redesenhado aqui. Duas
//     implementações da mesma barra é a garantia de que um dia a barra da tela
//     e a do papel vão discordar na frente do cliente.
//
// Páginas de uma amostra: (1) identificação + teores classificados,
// (2) índices DRIS + IBN/IBNm + classes de Wadt, (3) matriz de concordância +
// radar, (4) confiança + limitações, (5) histórico entre safras (só com ≥2
// diagnoses gravadas). O relatório de LOTE reusa as MESMAS rotinas: uma capa
// comparativa e depois as mesmas páginas, amostra por amostra.

import type { jsPDF as JsPDF } from 'jspdf';
import { abrirPdfNaAba } from './abrirPdf.ts';
import { imagemParaPdf, reduzirLogo } from './pdfImagem';
import { desenharCabecalhoOficial, marcaInvicta } from './pdfCabecalho';
import { nomeExport, periodoParaNome } from './nomeExport';
import { rotuloAno, type Epoca } from './periodo';
import {
  desenharBarrasIndices, desenharLinhaIbn, desenharMatrizConcordancia, desenharRadar,
  TEMA_CLARO, type CelulaMatriz, type DimsGrafico,
} from './foliarGraficos';
import {
  COR_CLASSE_PRA, COR_ESTADO, NUTRIENTES, ROTULO_CLASSE_PRA, ROTULO_ESTADO,
  ROTULO_FUNCAO, ROTULO_METODO, ROTULO_ORGAO, nutrientePorId, unidadeDe,
  type ClassePRA, type DiagnoseFoliar, type EstadoNutricional, type FuncaoDris,
  type MetodoDiagnose, type NormaDris, type NutrienteId, type Orgao,
} from './foliar';

// ── Entrada ─────────────────────────────────────────────────────────────────

/** Quem é o dono do laudo — o bloco que se repete igual em todas as páginas. */
export interface IdentificacaoFoliar {
  produtor: string;
  fazenda: string;
  talhao: string;
  safra: string;
  cultura: string;
  areaHa?: number | null;
  municipio?: string | null;
  estado?: string | null;
  /** Laboratório que assinou o laudo. Sem ele sai "—", nunca um nome chutado. */
  laboratorio?: string | null;
  siglaFazenda?: string | null;
  logoClienteUrl?: string | null;
  // Só para o NOME DO ARQUIVO (lib/nomeExport).
  ano?: number | null;
  epoca?: Epoca | null;
}

/** Os metadados da amostra que o agrônomo confere antes de ler o diagnóstico. */
export interface AmostraRelFoliar {
  /** 'YYYY-MM-DD' — a data da COLETA da folha, não a do laudo. */
  dataColeta?: string | null;
  estadio?: string | null;
  orgao: Orgao;
  numeroAmostra?: number | null;
  /** Texto pronto da área ("célula 7", "zona Alta"); vazio = talhão inteiro. */
  areaRotulo?: string | null;
  produtividadeKgha?: number | null;
  origemProdutividade?: 'mapa' | 'manual' | null;
  observacao?: string | null;
}

/** Uma safra na linha do IBN — `ibn: null` QUEBRA a linha (não interpola). */
export interface PontoHistoricoFoliar {
  safra: string;
  ibn: number | null;
  /** Por que aquela safra não tem IBN (ex.: norma sem pares duais). */
  motivo?: string | null;
  limitante?: NutrienteId | null;
  classe?: ClassePRA | null;
  funcao?: FuncaoDris | null;
  fonteNorma?: string | null;
}

export interface EntradaRelatorioFoliar {
  identificacao: IdentificacaoFoliar;
  amostra: AmostraRelFoliar;
  /** O resultado COMPLETO de `diagnosticar` — com os motivos e os avisos. */
  diagnose: DiagnoseFoliar;
  /**
   * A norma INTEIRA (não o `NormaResumo` de dentro da diagnose): é ela que
   * carrega `avisos`, e sem eles a ressalva de procedência não chega ao papel.
   */
  norma?: NormaDris | null;
  /** Histórico do talhão. Com menos de 2 pontos a página não sai. */
  historico?: PontoHistoricoFoliar[];
}

// ── Paleta e formatação ─────────────────────────────────────────────────────

type RGB = [number, number, number];
const NAVY: RGB = [13, 33, 64];
const GRAY: RGB = [100, 116, 139];
const LINE: RGB = [210, 219, 232];
const FUNDO: RGB = [247, 249, 252];
const AMBAR: RGB = [180, 83, 9];

const W = 297, H = 210, M = 6;
const TOPO = 31;                 // primeira linha útil abaixo da régua do cabeçalho
const FIM = 181;                 // última linha útil acima da marca INVICTA

const fmt = (v: number, d = 1) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Casas do teor: macro (g/kg) pede decimal; micro (mg/kg) é inteiro no laudo. */
const casasTeor = (id: NutrienteId) => (unidadeDe(id) === 'g/kg' ? 1 : 0);

/**
 * jsPDF usa as fontes padrão em WinAnsi: o que estiver fora do Latin-1 sai como
 * lixo. Os textos do núcleo são cheios de travessão ("Alvarez V. & Leite (1999)
 * — padrão brasileiro") e de subscrito químico, então a conversão vem ANTES do
 * descarte: travessão vira hífen, aspa curva vira reta, ₂ vira 2. Descartar
 * direto engoliria o travessão e grudaria as palavras.
 */
const SUB = '₀₁₂₃₄₅₆₇₈₉';
const san = (s: string | null | undefined): string => (s ?? '')
  .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, c => '0123456789'[SUB.indexOf(c)])
  .replace(/[‐-―]/g, '-')
  .replace(/[‘’‛]/g, "'")
  .replace(/[“”‟]/g, '"')
  .replace(/…/g, '...')
  .replace(/[•●]/g, '-')
  .replace(/≈/g, '~')
  .replace(/≥/g, '>=')
  .replace(/≤/g, '<=')
  .replace(/≠/g, '!=')
  .replace(/[^\x00-\xFF]/g, '');

/** "#dc2626" → [220, 38, 38], para as cores do núcleo entrarem no jsPDF. */
function rgb(hex: string): RGB {
  const h = (hex || '').replace('#', '');
  const c = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
  const n = parseInt(c, 16);
  if (!Number.isFinite(n) || c.length !== 6) return GRAY;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** '2026-01-31' → '31/01/2026'. Sem data devolve "—", nunca "Invalid Date". */
function dataBr(iso?: string | null): string {
  const t = (iso ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return '—';
  return t.split('-').reverse().join('/');
}

/** "Ponta Grossa - PR"; sem município, só a UF (nunca "— - PR"). */
function municipioUf(d: { municipio?: string | null; estado?: string | null }): string {
  const m = san(d.municipio), uf = san(d.estado);
  return m ? (uf ? `${m} - ${uf}` : m) : (uf || '—');
}

/** Só a primeira metade do rótulo longo ("Deficiente — alta chance…"). */
const curto = (t: string) => san(t).split('-')[0].trim();

/** Abreviação do estado dentro da célula da matriz (a célula tem ~10 mm). */
const CURTO_ESTADO: Record<EstadoNutricional, string> = {
  deficiente: 'Def.', adequado: 'Adeq.', excessivo: 'Exc.',
};

const METODOS: MetodoDiagnose[] = ['dris', 'cnd', 'faixa', 'chance'];

/** Cabeçalho de coluna da matriz — o nome longo não cabe na célula. */
const CURTO_METODO: Record<MetodoDiagnose, string> = {
  dris: 'DRIS', cnd: 'CND', faixa: 'Faixa', chance: 'Chance',
};
const CLASSES_PRA: ClassePRA[] = ['p', 'pz', 'z', 'zp', 'e'];

/** Rótulo da classe de Wadt em 2 palavras — a legenda tem 28 mm de coluna. */
const CURTO_CLASSE: Record<ClassePRA, string> = {
  p: 'Deficiente', pz: 'Tend. deficiência', z: 'Equilibrado', zp: 'Tend. excesso', e: 'Excessivo',
};
const COR_NEUTRA = '#e2e8f0';

const COR_CONFIANCA: Record<string, string> = {
  otimo: '#16a34a', bom: '#65a30d', regular: '#ca8a04', ruim: '#dc2626',
};

/**
 * As quatro limitações que viajam com TODO resultado impresso (ledger 37).
 *
 * ESPELHO do bloco "Limitações do método" de `components/talhao/FoliarSection.tsx`
 * — tela e papel têm de dizer a MESMA coisa. Não vieram de `AVISOS_METODO` do
 * núcleo porque lá o texto é longo (e sai logo abaixo, na íntegra): estas são a
 * versão de cinco segundos, que é o que o produtor lê.
 */
export const LIMITACOES_FIXAS: string[] = [
  'Os índices DRIS somam zero por construção — a soma é uma identidade matemática, não uma medida da planta.',
  'Um nutriente "em excesso" pode ser artefato da deficiência de outro, e não excesso real no tecido.',
  'Norma REGIONAL e norma UNIVERSAL dão diagnósticos diferentes para o mesmo laudo. Prefira a norma da sua região ou gerada com os seus dados.',
  'Trifólio COM e SEM pecíolo não são intercambiáveis: N, P, B, Fe, Mn e Zn são maiores sem pecíolo e o K é menor.',
];

// ── Logos e molduras ────────────────────────────────────────────────────────

function carregarImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = () => rej(new Error(`falha ao carregar ${src}`));
    img.src = src;
  });
}

interface Logos { inv: HTMLImageElement | null; branca: HTMLImageElement | null; cli: HTMLImageElement | null; }

async function carregarLogos(cliUrl?: string | null): Promise<Logos> {
  const inv = await carregarImg('/images/logo-colorida.png').catch(() => null);
  const cli = cliUrl ? await carregarImg(cliUrl).catch(() => null) : null;
  return {
    inv: inv ? await reduzirLogo(inv) : null,
    branca: await carregarImg('/images/logo-branca.png').catch(() => null),
    cli: cli ? await reduzirLogo(cli) : null,
  };
}

function rodape(doc: JsPDF, logos: Logos): void {
  marcaInvicta(doc, logos.inv, 'direita');
  doc.setFillColor(...NAVY); doc.rect(0, H - 10, W, 10, 'F');
  if (logos.branca) {
    const h = 5, w = h * (logos.branca.naturalWidth / logos.branca.naturalHeight);
    doc.addImage(logos.branca, 'PNG', M, H - 7.5, w, h);
  }
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
  doc.text('INVICTA AP   |   Tecnologia que transforma dados em produtividade.', M + 26, H - 3.8);
  doc.setFont('helvetica', 'bold'); doc.text('www.invicta.agr.br', W - M, H - 3.8, { align: 'right' });
}

/**
 * Cabeçalho oficial + rodapé de uma página do relatório foliar. `terceiraLinha`
 * troca a data de coleta no bloco INFORMAÇÕES DA ÁREA — a capa do lote fala de
 * várias amostras e imprimir ali a data de UMA delas seria informação errada.
 */
function moldura(
  doc: JsPDF, e: EntradaRelatorioFoliar, logos: Logos,
  titulo: string, subtitulo: string, terceiraLinha?: string,
): void {
  const id = e.identificacao;
  const info = [
    `Área Total: ${id.areaHa != null && Number.isFinite(id.areaHa) ? `${fmt(id.areaHa, 2)} ha` : '—'}`,
    `Município: ${municipioUf(id)}`,
    terceiraLinha ?? `Coleta: ${dataBr(e.amostra.dataColeta)}`,
  ];
  desenharCabecalhoOficial(doc, {
    logoCliente: logos.cli,
    fazenda: id.fazenda || 'Fazenda',
    esquerda: [
      `Produtor: ${san(id.produtor) || '—'}`,
      `Talhão: ${san(id.talhao) || '—'}   |   Ano: ${rotuloAno(id.safra) || san(id.safra) || '—'}`,
    ],
    titulo: san(titulo),
    subtitulo: san(subtitulo),
    info,
  });
  rodape(doc, logos);
}

// ── Peças reutilizadas de desenho ───────────────────────────────────────────

/** Caixa com borda fina e título em navy. Devolve o y do primeiro conteúdo. */
function caixa(doc: JsPDF, x: number, y: number, w: number, h: number, titulo?: string, preenchida = false): number {
  doc.setDrawColor(...LINE); doc.setLineWidth(0.4);
  if (preenchida) { doc.setFillColor(...FUNDO); doc.roundedRect(x, y, w, h, 2, 2, 'FD'); }
  else doc.roundedRect(x, y, w, h, 2, 2, 'S');
  if (!titulo) return y + 5;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...NAVY);
  doc.text(san(titulo).toUpperCase(), x + 4, y + 5.5);
  return y + 10;
}

/**
 * Par rótulo/valor empilhado, como o painel da capa da Fertilidade.
 *
 * O nº de linhas é limitado DUAS vezes: pelo `maxLinhas` pedido e pelo espaço
 * que sobra até o pé da área útil. A citação bibliográfica de uma norma passa
 * fácil de 250 caracteres — sem o segundo limite ela escreveria por cima da
 * marca INVICTA e da barra do rodapé.
 */
function linhaRotulo(doc: JsPDF, x: number, y: number, maxW: number, rot: string, val: string, maxLinhas = 3): number {
  if (y > FIM - 8) return y;      // sem espaço: melhor faltar campo que escrever sobre o rodapé
  const cabem = Math.max(1, Math.floor((FIM - 3 - (y + 4.2)) / 3.6));
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...GRAY);
  doc.text(san(rot).toUpperCase(), x, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...NAVY);
  const todas = doc.splitTextToSize(san(val) || '—', maxW) as string[];
  const n = Math.min(todas.length, maxLinhas, cabem);
  const linhas = todas.slice(0, n);
  // Texto cortado avisa que foi cortado — reticências, nunca um fim silencioso.
  if (n < todas.length && linhas.length) linhas[n - 1] = linhas[n - 1].replace(/\s+\S*$/, '') + '...';
  linhas.forEach((t, i) => doc.text(t, x, y + 4.2 + i * 3.6));
  return y + 4.2 + n * 3.6 + 1.8;
}

/** Número grande com legenda pequena — IBN, IBNm, CND-r², confiança. */
function numeroGrande(doc: JsPDF, x: number, y: number, w: number, rot: string, val: string, cor: RGB = NAVY): void {
  doc.setDrawColor(...LINE); doc.setLineWidth(0.4); doc.setFillColor(...FUNDO);
  doc.roundedRect(x, y, w, 16, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...GRAY);
  doc.text(san(rot).toUpperCase(), x + w / 2, y + 5, { align: 'center' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...cor);
  doc.text(san(val), x + w / 2, y + 12.5, { align: 'center' });
}

/**
 * Bloco de aviso em âmbar — é o que imprime o `motivo` de um método que não
 * rodou. Devolve o y após o bloco; `null` não é aceito calado (ledger 17).
 */
function blocoAviso(doc: JsPDF, x: number, y: number, w: number, titulo: string, texto: string): number {
  const todas = doc.splitTextToSize(san(texto), w - 8) as string[];
  // Cortar o aviso é ruim; escrever por cima do rodapé é pior — e um motivo que
  // não cabe inteiro na caixa continua legível na tela da diagnose.
  const cabem = Math.max(1, Math.floor((FIM - 2 - (y + 9)) / 3.6));
  const linhas = todas.slice(0, cabem);
  if (linhas.length < todas.length) linhas[linhas.length - 1] = linhas[linhas.length - 1].replace(/\s+\S*$/, '') + '...';
  const h = 7 + linhas.length * 3.6 + 2;
  doc.setDrawColor(...AMBAR); doc.setLineWidth(0.4); doc.setFillColor(254, 249, 231);
  doc.roundedRect(x, y, w, h, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...AMBAR);
  doc.text(san(titulo), x + 4, y + 5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...NAVY);
  linhas.forEach((t, i) => doc.text(t, x + 4, y + 9 + i * 3.6));
  return y + h + 3;
}

/** Etiqueta colorida com texto branco (classe de Wadt, estado nutricional). */
function etiqueta(doc: JsPDF, x: number, y: number, w: number, h: number, texto: string, corHex: string): void {
  doc.setFillColor(...rgb(corHex));
  doc.roundedRect(x, y, w, h, 1, 1, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(255, 255, 255);
  doc.text(san(texto), x + w / 2, y + h / 2 + 2, { align: 'center' });
}

// ── Canvas → PDF ────────────────────────────────────────────────────────────

// 1 mm em pixels CSS a 96 dpi. As funções de `foliarGraficos` recebem dimensões
// em pixels CSS e usam corpos de fonte fixos (8–10 px): converter os milímetros
// nesta régua é o que faz o texto do gráfico sair no papel com o mesmo tamanho
// relativo que tem na tela.
const PX_MM = 96 / 25.4;
// Fator de supersampling do canvas antes de virar imagem (≈290 dpi). O
// `imagemParaPdf` reduz para o dpi de impressão — o que sobra é nitidez.
const ESCALA = 3;

/**
 * `pxMm` é a régua px→mm daquele gráfico. Vale mexer nela: as funções de
 * desenho têm alturas de elemento em TETO (a linha da matriz não passa de 20 px)
 * — numa área grande em milímetros, a 96 dpi, o desenho encolhe para um canto e
 * deixa metade da caixa vazia. Baixar a régua aumenta o desenho no papel na
 * mesma proporção, porque a imagem é sempre impressa nos mm pedidos.
 */
async function graficoNoPdf(
  doc: JsPDF, x: number, y: number, mmW: number, mmH: number,
  pintar: (ctx: CanvasRenderingContext2D, dims: DimsGrafico) => void,
  pxMm = PX_MM,
): Promise<void> {
  const dims: DimsGrafico = { largura: Math.round(mmW * pxMm), altura: Math.round(mmH * pxMm) };
  const cv = document.createElement('canvas');
  cv.width = Math.round(dims.largura * ESCALA);
  cv.height = Math.round(dims.altura * ESCALA);
  const ctx = cv.getContext('2d');
  if (!ctx) return;                       // canvas indisponível: a página sai sem o gráfico
  ctx.scale(ESCALA, ESCALA);
  pintar(ctx, dims);
  // PNG de propósito: os gráficos são linha fina e texto pequeno, que o JPEG
  // borra. `imagemParaPdf` cuida da redução ao tamanho realmente impresso.
  const img = await imagemParaPdf(cv, mmW, { forcarPng: true, dpi: 220 });
  doc.addImage(img.data, img.formato, x, y, mmW, mmH);
}

// ── Página 1 — identificação e teores ───────────────────────────────────────

function paginaIdentificacao(doc: JsPDF, e: EntradaRelatorioFoliar, logos: Logos): void {
  const id = e.identificacao, am = e.amostra, d = e.diagnose;
  moldura(doc, e, logos, 'DIAGNOSE FOLIAR', `${san(id.cultura) || 'cultura não informada'} - ${ROTULO_ORGAO[am.orgao]}`);

  // ── Coluna esquerda: quem, onde, quando, com que norma ──
  const colW = 118;
  const hCol = FIM - TOPO;
  caixa(doc, M, TOPO, colW, hCol, 'Identificação da amostra');
  let y = TOPO + 12;
  const xa = M + 5, wa = colW - 10;
  y = linhaRotulo(doc, xa, y, wa, 'Produtor', id.produtor);
  y = linhaRotulo(doc, xa, y, wa, 'Fazenda / Talhão', `${san(id.fazenda) || '—'} / ${san(id.talhao) || '—'}`);
  y = linhaRotulo(doc, xa, y, wa, 'Safra / Cultura', `${rotuloAno(id.safra) || san(id.safra) || '—'} · ${san(id.cultura) || '—'}`);
  y = linhaRotulo(doc, xa, y, wa, 'Data da coleta', dataBr(am.dataColeta)
    + (am.numeroAmostra != null ? `   ·   amostra nº ${am.numeroAmostra}` : '')
    + (am.areaRotulo ? `   ·   ${san(am.areaRotulo)}` : ''));
  y = linhaRotulo(doc, xa, y, wa, 'Órgão / Estádio', `${ROTULO_ORGAO[am.orgao]} · ${san(am.estadio) || 'estádio não informado'}`);
  y = linhaRotulo(doc, xa, y, wa, 'Laboratório', san(id.laboratorio) || '—');
  y = linhaRotulo(doc, xa, y, wa, 'Produtividade', am.produtividadeKgha != null
    ? `${fmt(am.produtividadeKgha, 0)} kg/ha (${am.origemProdutividade === 'mapa' ? 'do mapa de colheita' : 'informada'})`
    : 'não informada');

  doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(xa, y, xa + wa, y); y += 5;

  // NORMA: fonte, origem e n saem SEMPRE — é a procedência do diagnóstico.
  const n = e.norma ?? null;
  const resumo = d.norma;
  if (n || resumo) {
    const cultura = san(n?.cultura ?? resumo?.cultura ?? '—');
    const orgao = (n?.orgao ?? resumo?.orgao) as Orgao | undefined;
    const estadio = san(n?.estadio ?? resumo?.estadio ?? '');
    const origem = san(n?.origem ?? resumo?.origem ?? '—');
    const nAmostras = n?.n ?? resumo?.n ?? null;
    y = linhaRotulo(doc, xa, y, wa, 'Norma utilizada',
      `${cultura}${orgao ? ` · ${ROTULO_ORGAO[orgao]}` : ''}${estadio ? ` · ${estadio}` : ''}`);
    y = linhaRotulo(doc, xa, y, wa, 'Origem da norma',
      `${origem}${nAmostras != null ? ` · n = ${fmt(nAmostras, 0)} amostras` : ' · n não informado'}`);
    y = linhaRotulo(doc, xa, y, wa, 'Função f(A/B) do DRIS', ROTULO_FUNCAO[d.funcao]);
    // A citação fica por ÚLTIMO por ser o campo elástico: é ela que absorve o
    // espaço que sobra (e é ela que apanha o corte, se faltar).
    y = linhaRotulo(doc, xa, y, wa, 'Fonte', n?.fonte ?? resumo?.fonte ?? '—', 6);
  } else {
    y = linhaRotulo(doc, xa, y, wa, 'Norma utilizada', 'nenhuma — a diagnose declara "sem norma" em vez de calcular');
    y = linhaRotulo(doc, xa, y, wa, 'Função f(A/B) do DRIS', ROTULO_FUNCAO[d.funcao]);
  }

  // ── Coluna direita: os 11 teores, classificados pela faixa da norma ──
  const tx = M + colW + 5;
  const tw = W - M - tx;
  caixa(doc, tx, TOPO, tw, hCol, 'Teores do laudo e classificação por faixa de suficiência');

  const cols: Array<{ rot: string; w: number; al: 'left' | 'right' | 'center' }> = [
    { rot: 'Nutriente', w: 40, al: 'left' },
    { rot: 'Teor', w: 24, al: 'right' },
    { rot: 'Unid.', w: 14, al: 'center' },
    { rot: 'Faixa da norma', w: 36, al: 'center' },
    { rot: 'Classificação', w: tw - 10 - 40 - 24 - 14 - 36, al: 'center' },
  ];
  const x0 = tx + 5;
  let cx = x0;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...GRAY);
  for (const c of cols) {
    const px = c.al === 'right' ? cx + c.w : c.al === 'center' ? cx + c.w / 2 : cx;
    doc.text(san(c.rot).toUpperCase(), px, TOPO + 15, { align: c.al });
    cx += c.w;
  }
  doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(x0, TOPO + 17, x0 + tw - 10, TOPO + 17);

  const porFaixa = new Map((d.faixa?.itens ?? []).map(i => [i.nutriente, i]));
  // 11 linhas + o pé (fonte das faixas, ou o motivo de a faixa não ter rodado)
  // têm de caber entre TOPO e FIM — daí a altura da linha ser calculada, e não
  // um número redondo escolhido no olho.
  const hLinha = 9.5;
  NUTRIENTES.forEach((nut, i) => {
    const yy = TOPO + 20 + i * hLinha;
    if (i % 2 === 1) { doc.setFillColor(...FUNDO); doc.rect(x0 - 2, yy - 4.5, tw - 6, hLinha, 'F'); }
    const teor = d.teores?.[nut];
    const temTeor = typeof teor === 'number' && Number.isFinite(teor);
    const item = porFaixa.get(nut);

    cx = x0;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...NAVY);
    doc.text(`${nut}  ${san(nutrientePorId(nut).nome)}`, cx, yy + 1.5);
    cx += cols[0].w;

    // Teor ausente é "não analisado" POR EXTENSO — nunca zero (ledger: vazio ≠ 0).
    doc.setFont('helvetica', temTeor ? 'bold' : 'normal'); doc.setFontSize(8.5);
    doc.setTextColor(...(temTeor ? NAVY : GRAY));
    doc.text(temTeor ? fmt(teor as number, casasTeor(nut)) : 'não analisado', cx + cols[1].w, yy + 1.5, { align: 'right' });
    cx += cols[1].w;

    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...GRAY);
    doc.text(unidadeDe(nut), cx + cols[2].w / 2, yy + 1.5, { align: 'center' });
    cx += cols[2].w;

    doc.setFontSize(7.5);
    doc.text(item ? `${fmt(item.min, casasTeor(nut))} - ${fmt(item.max, casasTeor(nut))}` : '—',
      cx + cols[3].w / 2, yy + 1.5, { align: 'center' });
    cx += cols[3].w;

    if (item) {
      etiqueta(doc, cx + cols[4].w / 2 - 17, yy - 3, 34, 6, ROTULO_ESTADO[item.estado], COR_ESTADO[item.estado]);
    } else {
      doc.setFontSize(7); doc.setTextColor(...GRAY);
      doc.text(temTeor ? 'sem faixa publicada' : '—', cx + cols[4].w / 2, yy + 1.5, { align: 'center' });
    }
  });

  // Faixa não rodou: o motivo vai no pé da tabela, por extenso.
  const yPe = TOPO + 20 + NUTRIENTES.length * hLinha + 3;
  if (!d.faixa) {
    blocoAviso(doc, tx + 5, yPe, tw - 10, 'Faixa de suficiência não rodou',
      d.faixaMotivo ?? 'motivo não informado pelo núcleo.');
  } else {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...GRAY);
    const t = doc.splitTextToSize(`Faixas de: ${san(d.faixa.fonte)}`, tw - 10) as string[];
    t.slice(0, 3).forEach((s, i) => doc.text(s, tx + 5, yPe + 2 + i * 3.4));
  }
}

// ── Página 2 — índices DRIS ─────────────────────────────────────────────────

async function paginaIndices(doc: JsPDF, e: EntradaRelatorioFoliar, logos: Logos): Promise<void> {
  const d = e.diagnose;
  moldura(doc, e, logos, 'ÍNDICES DRIS', `Ordem de limitação - ${curto(ROTULO_FUNCAO[d.funcao])}`);

  if (!d.dris) {
    // Sem DRIS a página NÃO some: ela explica por quê, e mostra o CND se houver.
    let y = blocoAviso(doc, M, TOPO + 4, W - 2 * M, 'DRIS não rodou',
      `${d.drisMotivo ?? 'motivo não informado pelo núcleo.'}  Sem índices DRIS não há IBN, IBNm nem ordem de limitação por este método.`);
    if (d.cnd) {
      y = caixa(doc, M, y + 2, W - 2 * M, 60, 'Ordem de limitação pelo CND (IZ)');
      const ordem = d.cnd.ordemLimitacao;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...NAVY);
      doc.text(ordem.length ? ordem.join('  <  ') : 'sem ordem de limitação', M + 5, y + 2);
      doc.setFontSize(8); doc.setTextColor(...GRAY);
      doc.text(`CND-r² = ${fmt(d.cnd.r2, 1)}   ·   IZ médio = ${fmt(d.cnd.izm, 2)}   ·   resíduo R = ${fmt(d.cnd.residuoGkg, 1)} g/kg`
        + (d.cnd.mahalanobis != null ? `   ·   D² de Mahalanobis = ${fmt(d.cnd.mahalanobis, 2)}` : '   ·   D² indisponível (norma sem covariância inversa)'),
      M + 5, y + 8);
    }
    return;
  }

  const dris = d.dris;
  // Números globais.
  const wNum = (W - 2 * M - 3 * 4) / 4;
  numeroGrande(doc, M, TOPO, wNum, 'IBN (soma dos módulos)', fmt(dris.ibn, 1));
  numeroGrande(doc, M + wNum + 4, TOPO, wNum, 'IBNm (régua de Wadt)', fmt(dris.ibnm, 2));
  numeroGrande(doc, M + 2 * (wNum + 4), TOPO, wNum, 'Nutrientes com índice', fmt(dris.nNutrientes, 0));
  numeroGrande(doc, M + 3 * (wNum + 4), TOPO, wNum, 'CND-r² (comparação)', d.cnd ? fmt(d.cnd.r2, 1) : '—',
    d.cnd ? NAVY : GRAY);

  // Barras — na ORDEM DE LIMITAÇÃO, a leitura agronômica (a de cima limita).
  const yG = TOPO + 21;
  const gW = 150;
  const hCaixa = FIM - yG;
  const hLegenda = 20;                        // faixa reservada às classes de Wadt
  const hGraf = hCaixa - 10 - hLegenda;
  caixa(doc, M, yG, gW, hCaixa, 'Índices por nutriente - zero no centro');
  const barras = [...dris.indices]
    .sort((a, b) => a.ordem - b.ordem)
    .map(i => ({ rotulo: i.nutriente, valor: i.indice, cor: COR_CLASSE_PRA[i.classe] }));
  await graficoNoPdf(doc, M + 3, yG + 10, gW - 6, hGraf,
    (ctx, dims) => desenharBarrasIndices(ctx, barras, dims, { tema: TEMA_CLARO, casas: 2, alturaBarra: 26 }));

  // Legenda das classes de Wadt — p / pz / z / zp / e. Os rótulos saem ABREVIADOS
  // porque o texto completo ("Tendência à deficiência — resposta positiva pouco
  // provável") não cabe em 28 mm de coluna; a versão longa está na tabela ao lado.
  const yL = yG + hCaixa - hLegenda + 2;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...GRAY);
  doc.text('CLASSES DE WADT (1996) - POTENCIAL DE RESPOSTA À ADUBAÇÃO', M + 4, yL);
  const wCl = (gW - 8) / CLASSES_PRA.length;
  CLASSES_PRA.forEach((c, i) => {
    const x = M + 4 + i * wCl;
    doc.setFillColor(...rgb(COR_CLASSE_PRA[c]));
    doc.roundedRect(x, yL + 3, 5, 5, 1, 1, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...NAVY);
    doc.text(c, x + 6.5, yL + 7);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...GRAY);
    doc.text(doc.splitTextToSize(CURTO_CLASSE[c], wCl - 12) as string[], x + 11, yL + 7);
  });

  // Tabela da ordem de limitação, à direita.
  const tx = M + gW + 5, tw = W - M - tx;
  const gH = hGraf;                            // régua das linhas da tabela
  caixa(doc, tx, yG, tw, hCaixa, 'Ordem de limitação');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...GRAY);
  doc.text('#', tx + 5, yG + 14);
  doc.text('NUTRIENTE', tx + 12, yG + 14);
  doc.text('ÍNDICE', tx + 52, yG + 14, { align: 'right' });
  doc.text('CLASSE', tx + 58, yG + 14);
  doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(tx + 5, yG + 16, tx + tw - 5, yG + 16);

  const ordenados = [...dris.indices].sort((a, b) => a.ordem - b.ordem);
  const hl = Math.min(9, (gH + 4) / Math.max(1, ordenados.length));
  ordenados.forEach((it, i) => {
    const yy = yG + 20 + i * hl;
    if (i % 2 === 1) { doc.setFillColor(...FUNDO); doc.rect(tx + 3, yy - 4, tw - 6, hl, 'F'); }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
    doc.text(String(it.ordem), tx + 5, yy + 1);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...NAVY);
    doc.text(it.nutriente, tx + 12, yy + 1);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text(fmt(it.indice, 2), tx + 52, yy + 1, { align: 'right' });
    etiqueta(doc, tx + 58, yy - 3.2, 10, 5.6, it.classe, COR_CLASSE_PRA[it.classe]);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...GRAY);
    doc.text(curto(ROTULO_CLASSE_PRA[it.classe]), tx + 70, yy + 1, { maxWidth: tw - 74 });
  });

  // Ressalvas do próprio DRIS (par ignorado, nutriente sem par…).
  if (dris.avisos.length) {
    const yA = yG + 20 + ordenados.length * hl + 2;
    const txt = doc.splitTextToSize(dris.avisos.map(san).join('  '), tw - 10) as string[];
    const cabem = Math.max(0, Math.floor((FIM - 3 - yA) / 3.2));
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...AMBAR);
    txt.slice(0, Math.min(4, cabem)).forEach((t, i) => doc.text(t, tx + 5, yA + i * 3.2));
  }
}

// ── Página 3 — concordância entre métodos e radar ───────────────────────────

async function paginaConcordancia(doc: JsPDF, e: EntradaRelatorioFoliar, logos: Logos): Promise<void> {
  const d = e.diagnose;
  moldura(doc, e, logos, 'CONCORDÂNCIA', 'DRIS × CND × Faixa × Chance matemática, nutriente a nutriente');

  const mW = 165;
  const hBloco = 118;
  caixa(doc, M, TOPO, mW, hBloco, 'Matriz de concordância entre métodos');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...GRAY);
  doc.text(doc.splitTextToSize(
    `Colunas: Faixa = ${ROTULO_METODO.faixa}; Chance = ${ROTULO_METODO.chance}. `
    + 'Onde os quatro métodos concordam, a evidência é forte; onde discordam, a coluna Consenso declara o empate em vez de eleger um vencedor. Traço = o método não opinou sobre aquele nutriente.',
    mW - 10) as string[], M + 5, TOPO + 12);

  // Cabeçalho CURTO: "Chance matemática" por extenso transborda a coluna e
  // invade a vizinha — a legenda dos nomes completos está no texto acima.
  const colunas = [...METODOS.map(m => CURTO_METODO[m]), 'Consenso', 'Concord.'];
  const linhas = (d.consenso ?? []).map(c => {
    const celulas: CelulaMatriz[] = METODOS.map(m => {
      const est = c.porMetodo[m];
      return est
        ? { texto: CURTO_ESTADO[est], cor: COR_ESTADO[est] }
        : { texto: '—', cor: COR_NEUTRA, corTexto: '#64748b' };
    });
    celulas.push(c.consenso
      ? { texto: CURTO_ESTADO[c.consenso], cor: COR_ESTADO[c.consenso] }
      : { texto: c.nMetodos ? 'empate' : '—', cor: COR_NEUTRA, corTexto: '#b45309' });
    celulas.push({
      texto: c.nMetodos ? `${Math.round(c.concordancia * 100)}%` : '—',
      cor: COR_NEUTRA,
      corTexto: c.concordancia >= 0.99 ? '#16a34a' : c.concordancia >= 0.7 ? '#ca8a04' : '#ea580c',
    });
    return { rotulo: c.nutriente, celulas };
  });

  if (linhas.length) {
    // A linha da matriz não passa de 20 px por regra do desenho: a régua px→mm
    // é calculada para que as 11 linhas ocupem a altura toda da caixa, em vez de
    // encolherem no canto superior.
    const mmMatriz = hBloco - 34;      // 22 de texto acima + 12 da legenda abaixo
    const alturaUtil = 16 + linhas.length * 20;
    await graficoNoPdf(doc, M + 4, TOPO + 22, mW - 8, mmMatriz,
      (ctx, dims) => desenharMatrizConcordancia(ctx, { colunas, linhas }, dims, { tema: TEMA_CLARO, largRotulo: 40 }),
      Math.min(PX_MM, alturaUtil / mmMatriz));
  } else {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GRAY);
    doc.text('Nenhum método opinou sobre nutriente algum — ver os motivos abaixo.', M + 5, TOPO + 40);
  }

  // Legenda dos estados.
  let xl = M + 5;
  (['deficiente', 'adequado', 'excessivo'] as EstadoNutricional[]).forEach(est => {
    doc.setFillColor(...rgb(COR_ESTADO[est]));
    doc.roundedRect(xl, TOPO + hBloco - 7, 5, 5, 1, 1, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...NAVY);
    doc.text(ROTULO_ESTADO[est], xl + 6.5, TOPO + hBloco - 3);
    xl += 34;
  });

  // Radar — DRIS quando existe, IZ do CND como segunda opção.
  const rx = M + mW + 5, rw = W - M - rx;
  const pontos = d.dris
    ? d.dris.indices.map(i => ({ rotulo: i.nutriente, valor: i.indice }))
    : d.cnd ? d.cnd.indices.map(i => ({ rotulo: i.nutriente, valor: i.iz })) : [];
  const ehCnd = !d.dris && !!d.cnd;
  caixa(doc, rx, TOPO, rw, hBloco, `Radar de balanço (${ehCnd ? 'IZ do CND' : 'índices DRIS'})`);
  if (pontos.length >= 3) {
    await graficoNoPdf(doc, rx + 3, TOPO + 11, rw - 6, hBloco - 16,
      (ctx, dims) => desenharRadar(ctx, pontos, dims, { tema: TEMA_CLARO, cor: ehCnd ? '#7c3aed' : '#0369a1' }));
  } else {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAY);
    doc.text(doc.splitTextToSize(
      'Radar não desenhado: com menos de três nutrientes indexados não existe polígono a comparar.', rw - 10) as string[],
    rx + 5, TOPO + 20);
  }

  // Os motivos dos métodos que não rodaram — um a um, por extenso (ledger 17).
  let y = TOPO + hBloco + 4;
  const ausentes: Array<[MetodoDiagnose, string | null]> = [
    ...(d.dris ? [] : [['dris', d.drisMotivo] as [MetodoDiagnose, string | null]]),
    ...(d.cnd ? [] : [['cnd', d.cndMotivo] as [MetodoDiagnose, string | null]]),
    ...(d.faixa ? [] : [['faixa', d.faixaMotivo] as [MetodoDiagnose, string | null]]),
    ...(d.chance ? [] : [['chance', d.chanceMotivo] as [MetodoDiagnose, string | null]]),
  ];
  if (ausentes.length) {
    for (const [m, motivo] of ausentes) {
      if (y > FIM - 10) break;
      y = blocoAviso(doc, M, y, W - 2 * M, `${ROTULO_METODO[m]} não rodou`,
        motivo ?? 'motivo não informado pelo núcleo.');
    }
  } else {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAY);
    doc.text('Os quatro métodos rodaram nesta amostra.', M + 2, y + 4);
  }
}

// ── Página 4 — confiança e limitações ───────────────────────────────────────

function paginaConfianca(doc: JsPDF, e: EntradaRelatorioFoliar, logos: Logos): void {
  const d = e.diagnose;
  moldura(doc, e, logos, 'CONFIANÇA', 'O quanto esta diagnose se sustenta - e o que ela não sabe');

  // ── Confiança ──
  const cW = 118;
  const conf = d.confianca;
  const hConf = 52;
  caixa(doc, M, TOPO, cW, hConf, 'Confiança da diagnose');
  if (conf) {
    const cor = rgb(COR_CONFIANCA[conf.faixa] ?? '#64748b');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(26); doc.setTextColor(...cor);
    doc.text(String(Math.round(conf.valor)), M + 6, TOPO + 26);
    doc.setFontSize(9);
    doc.text(san(conf.rotulo), M + 32, TOPO + 20);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...GRAY);
    doc.text('0 a 100', M + 32, TOPO + 25);
    doc.setFontSize(7.5); doc.setTextColor(...NAVY);
    doc.text(doc.splitTextToSize(san(conf.justificativa), cW - 12) as string[], M + 6, TOPO + 33);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...GRAY);
    doc.text(`GARGALO: ${san(conf.gargalo.nome).toUpperCase()} (${Math.round(conf.gargalo.escore)}/100)`,
      M + 6, TOPO + hConf - 4);
  } else {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAY);
    doc.text(doc.splitTextToSize(
      'Índice de confiança não calculado para esta diagnose — sem ele, trate o resultado como indicativo e confirme a campo.',
      cW - 12) as string[], M + 6, TOPO + 18);
  }

  // ── Avisos da diagnose ──
  // São os `avisos` que o núcleo devolveu NESTA execução: as limitações gerais
  // do método (`AVISOS_METODO`, versão longa) mais o que for específico deste
  // laudo (norma de outra cultura, par ignorado, estádio divergente…).
  const yR = TOPO + hConf + 4;
  const avisos = (d.avisos ?? []).map(san).filter(Boolean);
  const hRes = FIM - yR;
  caixa(doc, M, yR, cW, hRes, `Avisos desta diagnose (${avisos.length})`);
  if (avisos.length) {
    let y = yR + 12;
    for (const a of avisos) {
      const linhas = doc.splitTextToSize(a, cW - 16) as string[];
      if (y + linhas.length * 3.4 > yR + hRes - 4) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...GRAY);
        doc.text('(demais ressalvas na tela da diagnose)', M + 6, y);
        break;
      }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...AMBAR);
      doc.text('-', M + 6, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...NAVY);
      linhas.forEach((t, i) => doc.text(t, M + 9, y + i * 3.4));
      y += linhas.length * 3.4 + 2.4;
    }
  } else {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAY);
    doc.text('Nenhuma ressalva específica desta execução.', M + 6, yR + 14);
  }

  // ── Limitações do método (ledger 37) + avisos da norma ──
  const lx = M + cW + 5, lw = W - M - lx;
  caixa(doc, lx, TOPO, lw, FIM - TOPO, 'Limitações do método - leia antes de decidir adubação');
  let y = TOPO + 13;
  const escrever = (texto: string, negrito: boolean, cor: RGB, marcador = '-') => {
    const linhas = doc.splitTextToSize(san(texto), lw - 18) as string[];
    if (y + linhas.length * 3.4 > FIM - 4) return false;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...cor);
    doc.text(marcador, lx + 6, y);
    doc.setFont('helvetica', negrito ? 'bold' : 'normal'); doc.setFontSize(7.5); doc.setTextColor(...NAVY);
    linhas.forEach((t, i) => doc.text(t, lx + 10, y + i * 3.4));
    y += linhas.length * 3.4 + 2.2;
    return true;
  };

  for (const t of LIMITACOES_FIXAS) if (!escrever(t, false, AMBAR)) break;

  // Avisos DA NORMA: procedência, faixas largas, "só traz faixas"… É aqui que a
  // ressalva "não conferida na fonte primária" da tabela clássica da Embrapa
  // chega ao papel.
  const avisosNorma = (e.norma?.avisos ?? []).map(san).filter(Boolean);
  if (avisosNorma.length && y < FIM - 14) {
    y += 2;
    doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(lx + 6, y - 2, lx + lw - 6, y - 2);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...GRAY);
    doc.text('RESSALVAS DA NORMA UTILIZADA', lx + 6, y + 2);
    y += 6;
    for (const t of avisosNorma) if (!escrever(t, true, AMBAR, '!')) break;
  }

  if (y < FIM - 10) {
    doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(lx + 6, y - 2, lx + lw - 6, y - 2);
    y += 3;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...GRAY);
    doc.text(doc.splitTextToSize(
      'A ordem de limitação indica DESEQUILÍBRIO, não garante resposta agronômica à adubação. Confirme a campo antes de mudar o programa nutricional.',
      lw - 12) as string[], lx + 6, y);
  }
}

// ── Página 5 — histórico entre safras (opcional) ────────────────────────────

async function paginaHistorico(doc: JsPDF, e: EntradaRelatorioFoliar, logos: Logos): Promise<void> {
  const hist = e.historico ?? [];
  moldura(doc, e, logos, 'HISTÓRICO', 'IBN por safra - o que foi GRAVADO em cada ano, com a norma daquele ano');

  const gW = 175, gH = 110;
  caixa(doc, M, TOPO, gW, gH, 'IBN por safra (quanto menor, mais equilibrada a lavoura)');
  const pontos = hist.map(h => ({ rotulo: rotuloAno(h.safra) || san(h.safra), valor: h.ibn }));
  await graficoNoPdf(doc, M + 3, TOPO + 11, gW - 6, gH - 16,
    (ctx, dims) => desenharLinhaIbn(ctx, pontos, dims, { tema: TEMA_CLARO, cor: '#0369a1', casas: 1 }));

  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...GRAY);
  doc.text(doc.splitTextToSize(
    'Safra sem diagnose QUEBRA a linha em vez de ser ligada por um segmento reto: o segmento diria "o desequilíbrio caiu suavemente naquele ano" - uma afirmação que nenhum laudo fez.',
    gW - 10) as string[], M + 5, TOPO + gH + 4);

  const tx = M + gW + 5, tw = W - M - tx;
  caixa(doc, tx, TOPO, tw, FIM - TOPO, 'Diagnoses gravadas');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...GRAY);
  doc.text('SAFRA', tx + 5, TOPO + 14);
  doc.text('IBN', tx + 34, TOPO + 14, { align: 'right' });
  doc.text('LIMITANTE', tx + 40, TOPO + 14);
  doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(tx + 5, TOPO + 16, tx + tw - 5, TOPO + 16);

  hist.forEach((h, i) => {
    const yy = TOPO + 21 + i * 11;
    if (yy > FIM - 8) return;
    if (i % 2 === 1) { doc.setFillColor(...FUNDO); doc.rect(tx + 3, yy - 4.5, tw - 6, 11, 'F'); }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...NAVY);
    doc.text(rotuloAno(h.safra) || san(h.safra), tx + 5, yy + 1);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text(h.ibn != null ? fmt(h.ibn, 1) : '—', tx + 34, yy + 1, { align: 'right' });
    if (h.limitante) {
      etiqueta(doc, tx + 40, yy - 3.2, 12, 5.8, h.limitante, h.classe ? COR_CLASSE_PRA[h.classe] : '#94a3b8');
    }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...GRAY);
    const nota = h.classe ? curto(ROTULO_CLASSE_PRA[h.classe]) : (h.motivo ? san(h.motivo) : '');
    if (nota) doc.text(nota, tx + 54, yy + 1, { maxWidth: tw - 58 });
    if (h.fonteNorma) {
      doc.setFontSize(5.8);
      doc.text(san(h.fonteNorma), tx + 5, yy + 4.6, { maxWidth: tw - 10 });
    }
  });
}

// ── Capa do relatório de LOTE ───────────────────────────────────────────────

/**
 * Resumo comparativo das amostras do mesmo talhão/safra: uma linha por amostra,
 * com IBN, nutriente mais limitante e confiança lado a lado. É a página que
 * responde "qual parte do talhão está pior" antes de abrir amostra por amostra.
 */
function capaLote(doc: JsPDF, entradas: EntradaRelatorioFoliar[], logos: Logos): void {
  const e0 = entradas[0];
  moldura(doc, e0, logos, 'DIAGNOSE FOLIAR', `Resumo comparativo - ${entradas.length} amostras`,
    `Amostras: ${entradas.length}`);

  const tw = W - 2 * M;
  caixa(doc, M, TOPO, tw, FIM - TOPO, `Amostras de ${san(e0.identificacao.talhao) || 'talhão'} · ${rotuloAno(e0.identificacao.safra) || san(e0.identificacao.safra)}`);

  const cols: Array<{ rot: string; w: number; al: 'left' | 'right' | 'center' }> = [
    { rot: 'Coleta', w: 24, al: 'left' },
    { rot: 'Nº', w: 12, al: 'right' },
    { rot: 'Área', w: 32, al: 'left' },
    { rot: 'Órgão / estádio', w: 56, al: 'left' },
    { rot: 'IBN', w: 18, al: 'right' },
    { rot: 'IBNm', w: 18, al: 'right' },
    { rot: 'Mais limitante', w: 30, al: 'center' },
    { rot: 'Ordem de limitação', w: 60, al: 'left' },
    { rot: 'Confiança', w: tw - 10 - 24 - 12 - 32 - 56 - 18 - 18 - 30 - 60, al: 'right' },
  ];
  const x0 = M + 5;
  let cx = x0;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...GRAY);
  for (const c of cols) {
    const px = c.al === 'right' ? cx + c.w : c.al === 'center' ? cx + c.w / 2 : cx;
    doc.text(san(c.rot).toUpperCase(), px, TOPO + 14, { align: c.al });
    cx += c.w;
  }
  doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(x0, TOPO + 16, x0 + tw - 10, TOPO + 16);

  const hl = Math.min(10, (FIM - TOPO - 26) / Math.max(1, entradas.length));
  entradas.forEach((e, i) => {
    const yy = TOPO + 20 + i * hl;
    if (yy > FIM - 6) return;
    if (i % 2 === 1) { doc.setFillColor(...FUNDO); doc.rect(x0 - 2, yy - 4.2, tw - 6, hl, 'F'); }
    const d = e.diagnose, am = e.amostra;
    const limitante = d.dris?.ordemLimitacao[0] ?? d.cnd?.ordemLimitacao[0] ?? null;
    const classe = limitante
      ? (d.dris?.indices.find(x => x.nutriente === limitante)?.classe
        ?? d.cnd?.indices.find(x => x.nutriente === limitante)?.classe ?? null)
      : null;
    const ordem = (d.dris?.ordemLimitacao ?? d.cnd?.ordemLimitacao ?? []).slice(0, 6);

    cx = x0;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...NAVY);
    doc.text(dataBr(am.dataColeta), cx, yy + 1); cx += cols[0].w;
    doc.text(am.numeroAmostra != null ? String(am.numeroAmostra) : '—', cx + cols[1].w, yy + 1, { align: 'right' }); cx += cols[1].w;
    doc.setFontSize(7);
    doc.text(san(am.areaRotulo) || 'talhão inteiro', cx, yy + 1, { maxWidth: cols[2].w - 2 }); cx += cols[2].w;
    doc.text(`${ROTULO_ORGAO[am.orgao]}${am.estadio ? ` · ${san(am.estadio)}` : ''}`, cx, yy + 1, { maxWidth: cols[3].w - 2 }); cx += cols[3].w;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
    doc.text(d.dris ? fmt(d.dris.ibn, 1) : '—', cx + cols[4].w, yy + 1, { align: 'right' }); cx += cols[4].w;
    doc.text(d.dris ? fmt(d.dris.ibnm, 2) : '—', cx + cols[5].w, yy + 1, { align: 'right' }); cx += cols[5].w;
    if (limitante) etiqueta(doc, cx + cols[6].w / 2 - 8, yy - 3.2, 16, 5.8, limitante, classe ? COR_CLASSE_PRA[classe] : '#94a3b8');
    else { doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...GRAY); doc.text('—', cx + cols[6].w / 2, yy + 1, { align: 'center' }); }
    cx += cols[6].w;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...GRAY);
    doc.text(ordem.length ? ordem.join(' < ') : 'sem ordem', cx, yy + 1, { maxWidth: cols[7].w - 2 }); cx += cols[7].w;
    const conf = d.confianca;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
    doc.setTextColor(...(conf ? rgb(COR_CONFIANCA[conf.faixa] ?? '#64748b') : GRAY));
    doc.text(conf ? String(Math.round(conf.valor)) : '—', cx + cols[8].w, yy + 1, { align: 'right' });
  });

  // Rodapé da tabela: quantas amostras ficaram sem DRIS, e por quê. E o aviso
  // que só existe no LOTE — órgãos diferentes na mesma tabela comparativa. A
  // norma é uma só (a da tela); comparar IBN de trifólio com e sem pecíolo lado
  // a lado compara duas coisas que a literatura diz não serem intercambiáveis.
  const semDris = entradas.filter(e => !e.diagnose.dris);
  const orgaos = new Set(entradas.map(e => e.amostra.orgao));
  const yN = Math.min(FIM - 12, TOPO + 20 + entradas.length * hl + 4);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...GRAY);
  doc.text(semDris.length
    ? `${semDris.length} de ${entradas.length} amostras sem índices DRIS: ${san(semDris[0].diagnose.drisMotivo ?? 'motivo não informado')}`
    : 'Todas as amostras receberam índices DRIS com a mesma norma e a mesma função f(A/B) — os IBN são comparáveis entre si.',
  x0, yN, { maxWidth: tw - 10 });
  if (orgaos.size > 1) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...AMBAR);
    doc.text(`ATENÇÃO: ${orgaos.size} órgãos amostrados diferentes nesta tabela (${[...orgaos].map(o => ROTULO_ORGAO[o]).join(', ')}). `
      + 'A norma vale no órgão em que foi gerada — os IBN destas amostras NÃO são comparáveis entre si.',
    x0, yN + 4, { maxWidth: tw - 10 });
  }
}

// ── Montagem ────────────────────────────────────────────────────────────────

/**
 * Renderiza as páginas de UMA amostra num doc jsPDF já existente (A4 paisagem).
 * `novaPaginaAntes` = o doc já tem conteúdo. `comHistorico` desliga a página 5
 * no relatório de lote, onde o histórico do talhão sai uma vez só no fim.
 */
export async function renderFoliarNoDoc(
  doc: JsPDF, e: EntradaRelatorioFoliar, logos: Logos,
  opts?: { novaPaginaAntes?: boolean; comHistorico?: boolean },
): Promise<void> {
  const pagina = (primeira = false) => { if (!primeira) doc.addPage('a4', 'landscape'); };
  let precisa = opts?.novaPaginaAntes ?? false;

  pagina(!precisa); precisa = true;
  paginaIdentificacao(doc, e, logos);

  pagina(); await paginaIndices(doc, e, logos);
  pagina(); await paginaConcordancia(doc, e, logos);
  pagina(); paginaConfianca(doc, e, logos);

  // Histórico só com DOIS pontos ou mais: um ponto não é uma série temporal.
  if ((opts?.comHistorico ?? true) && (e.historico?.length ?? 0) >= 2) {
    pagina(); await paginaHistorico(doc, e, logos);
  }
}

/** Núcleo: monta o PDF, abre na aba (com o erro visível nela) e devolve o Blob. */
async function gerarDoc(
  render: (doc: JsPDF) => Promise<void>, nomeArquivo: string,
): Promise<Blob> {
  const aba = typeof window !== 'undefined' ? window.open('', '_blank') : null;
  if (aba) try { aba.document.write('<!doctype html><meta charset="utf-8"><title>Relatório</title><body style="font-family:system-ui,sans-serif;padding:28px;color:#334155"><p>⏳ Gerando o relatório da diagnose foliar… aguarde alguns segundos.</p></body>'); } catch {}
  try {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    await render(doc);
    const nome = nomeArquivo.replace(/[^\w.\-]+/g, '_') + '.pdf';
    const blob = doc.output('blob');
    abrirPdfNaAba(aba, blob, nome);
    return blob;
  } catch (err) {
    const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
    console.error('[relatorioFoliar] falha:', err);
    if (aba) {
      try {
        aba.document.body.innerHTML = `<h3 style="color:#b91c1c;font-family:system-ui">Falha ao gerar o relatório</h3><pre style="white-space:pre-wrap;font-size:12px;color:#334155">${msg.replace(/[<>&]/g, s => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[s]!))}</pre>`;
      } catch {}
    }
    throw err;
  }
}

/** Nome no padrão da casa: SA03_FOLIAR_2026_EP01_DRIS. */
export function nomeArquivoFoliar(e: EntradaRelatorioFoliar, detalhe?: string): string {
  const id = e.identificacao;
  const per = periodoParaNome({
    dataReferencia: e.amostra.dataColeta ?? null, ano: id.ano ?? null, epoca: id.epoca ?? null, safra: id.safra,
  });
  return nomeExport({
    fazenda: id.fazenda, siglaFazenda: id.siglaFazenda, talhao: id.talhao, tipo: 'FOLIAR',
    ano: per.ano, epoca: per.epoca, detalhe,
  });
}

/** Valida o mínimo para a página existir — melhor recusar que imprimir vazio. */
function validar(e: EntradaRelatorioFoliar): string | null {
  if (!e?.diagnose) return 'Diagnose ausente — não há o que imprimir.';
  const temTeor = NUTRIENTES.some(n => {
    const v = e.diagnose.teores?.[n];
    return typeof v === 'number' && Number.isFinite(v);
  });
  if (!temTeor) return 'A amostra não tem nenhum teor informado — um laudo sem nutriente não diagnostica nada.';
  return null;
}

/** Relatório de UMA amostra (o botão da aba Foliar). */
export async function gerarRelatorioFoliar(e: EntradaRelatorioFoliar): Promise<Blob> {
  const erro = validar(e);
  if (erro) throw new Error(erro);
  const logos = await carregarLogos(e.identificacao.logoClienteUrl);
  return await gerarDoc(
    doc => renderFoliarNoDoc(doc, e, logos, { novaPaginaAntes: false, comHistorico: true }),
    nomeArquivoFoliar(e),
  );
}

/**
 * Relatório de LOTE — várias amostras do MESMO talhão/safra num PDF único:
 * capa com o resumo comparativo e, depois, as mesmas páginas de sempre, amostra
 * por amostra. As rotinas são as mesmas do relatório individual de propósito: o
 * dia em que a página de índices mudar, ela muda nos dois.
 *
 * O histórico entre safras sai UMA vez, no fim — é do talhão, não da amostra.
 */
export async function gerarRelatorioFoliarLote(entradas: EntradaRelatorioFoliar[]): Promise<Blob> {
  if (!entradas.length) throw new Error('Selecione ao menos uma amostra para o relatório.');
  for (const e of entradas) { const erro = validar(e); if (erro) throw new Error(erro); }
  const logos = await carregarLogos(entradas[0].identificacao.logoClienteUrl);

  // Mais recente primeiro é a ordem da lista na tela; no papel a leitura é
  // cronológica — a mesma ordem em que o talhão foi amostrado.
  const ordenadas = [...entradas].sort((a, b) =>
    (a.amostra.dataColeta ?? '').localeCompare(b.amostra.dataColeta ?? ''));
  const historico = ordenadas.find(e => (e.historico?.length ?? 0) >= 2)?.historico ?? [];

  return await gerarDoc(async doc => {
    capaLote(doc, ordenadas, logos);
    for (const e of ordenadas) {
      await renderFoliarNoDoc(doc, e, logos, { novaPaginaAntes: true, comHistorico: false });
    }
    if (historico.length >= 2) {
      doc.addPage('a4', 'landscape');
      await paginaHistorico(doc, { ...ordenadas[0], historico }, logos);
    }
  }, nomeArquivoFoliar(ordenadas[0], 'LOTE'));
}
