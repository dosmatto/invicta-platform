// GRÁFICOS DA DIAGNOSE FOLIAR — desenho puro em canvas (ledger 30).
//
// POR QUE CANVAS NA MÃO, e não uma biblioteca: os MESMOS quatro gráficos
// precisam sair na tela (React) e dentro do PDF do relatório (jsPDF, que recebe
// um canvas e chama `toDataURL`). Uma biblioteca de charts em React resolveria
// metade do problema e obrigaria a redesenhar a outra metade no PDF — duas
// implementações do mesmo gráfico é a garantia de que um dia a barra da tela e
// a barra do papel vão discordar na frente do cliente.
//
// CONTRATO DESTE ARQUIVO:
//  · funções PURAS-DE-DESENHO: recebem `ctx` + dados + dimensões e pintam;
//  · ZERO React, ZERO `document`, ZERO `window` — quem cria o <canvas> é o
//    chamador (o componente fino da tela ou o gerador do PDF);
//  · ZERO import: os dados chegam já traduzidos (rótulo, valor, cor), porque a
//    tradução "classe de Wadt → cor" é regra do núcleo (`foliar/tipos.ts`) e
//    não pode ser reimplementada aqui;
//  · o `ctx` chega com a escala do devicePixelRatio JÁ aplicada — as
//    dimensões são em PIXELS CSS, não em pixels de dispositivo.
//
// O tema é parâmetro (e não constante): o PDF é papel branco e a tela é azul
// escuro. Sem isso, o gráfico do relatório sairia com texto cinza-claro em
// fundo branco.

/** Largura e altura em pixels CSS da área de desenho. */
export interface DimsGrafico {
  largura: number;
  altura: number;
}

/** Cores do desenho. O padrão é o tema escuro da plataforma. */
export interface TemaGrafico {
  texto: string;
  textoFraco: string;
  grade: string;
  eixo: string;
  /** Fundo da área — `null` não pinta (deixa o que já estiver no canvas). */
  fundo: string | null;
}

export const TEMA_ESCURO: TemaGrafico = {
  texto: '#e2e8f0', textoFraco: '#94a3b8', grade: '#1a3a6b', eixo: '#2e5fa3', fundo: null,
};

/** Tema do relatório impresso — papel branco. */
export const TEMA_CLARO: TemaGrafico = {
  texto: '#1e293b', textoFraco: '#64748b', grade: '#e2e8f0', eixo: '#94a3b8', fundo: '#ffffff',
};

const FONTE = (px: number, peso = '') => `${peso ? peso + ' ' : ''}${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;

/** Número curto para rótulo dentro do gráfico (pt-BR, no máximo `casas` casas). */
function num(v: number, casas = 2): string {
  return v.toLocaleString('pt-BR', { maximumFractionDigits: casas });
}

function fundo(ctx: CanvasRenderingContext2D, dims: DimsGrafico, tema: TemaGrafico) {
  if (!tema.fundo) return;
  ctx.fillStyle = tema.fundo;
  ctx.fillRect(0, 0, dims.largura, dims.altura);
}

// ── 1. Barras horizontais dos índices ───────────────────────────────────────

export interface BarraIndice {
  /** Símbolo do nutriente (N, P, K…) — é o que cabe no eixo. */
  rotulo: string;
  valor: number;
  /** Cor da classe de Wadt (`COR_CLASSE_PRA`), decidida pelo chamador. */
  cor: string;
}

export interface OpcoesBarras {
  tema?: TemaGrafico;
  /** Casas decimais do número ao lado da barra. */
  casas?: number;
  /** Altura máxima de cada barra, em px. */
  alturaBarra?: number;
}

/**
 * Barras horizontais com o ZERO NO CENTRO — deficiente à esquerda, excesso à
 * direita. A ordem das barras é a que vier na lista: a tela manda já ordenada
 * pela ordem de limitação, que é a leitura agronômica (a de cima é a que
 * limita) e não a ordem alfabética do laudo.
 *
 * A escala é simétrica de propósito. Um eixo que fosse de `min` a `max` faria o
 * zero andar de amostra para amostra e duas diagnoses lado a lado ficariam
 * incomparáveis no olho.
 */
export function desenharBarrasIndices(
  ctx: CanvasRenderingContext2D,
  barras: BarraIndice[],
  dims: DimsGrafico,
  opcoes: OpcoesBarras = {},
): void {
  const tema = opcoes.tema ?? TEMA_ESCURO;
  fundo(ctx, dims, tema);
  if (!barras.length) return;

  const casas = opcoes.casas ?? 2;
  const mEsq = 30, mDir = 44, mTopo = 6, mBase = 16;
  const larg = Math.max(40, dims.largura - mEsq - mDir);
  const alt = Math.max(20, dims.altura - mTopo - mBase);
  const centro = mEsq + larg / 2;

  // Limite simétrico: o maior |índice| com 12% de folga para o rótulo respirar.
  const limite = Math.max(0.5, ...barras.map(b => Math.abs(b.valor) || 0)) * 1.12;
  const escala = (larg / 2) / limite;

  const passo = alt / barras.length;
  const hBarra = Math.max(4, Math.min(opcoes.alturaBarra ?? 16, passo - 3));

  // Grade: três verticais (−limite, 0, +limite) — mais que isso polui.
  ctx.lineWidth = 1;
  for (const frac of [-1, -0.5, 0.5, 1]) {
    const x = Math.round(centro + frac * (larg / 2)) + 0.5;
    ctx.strokeStyle = tema.grade;
    ctx.beginPath(); ctx.moveTo(x, mTopo); ctx.lineTo(x, mTopo + alt); ctx.stroke();
  }

  barras.forEach((b, i) => {
    const y = mTopo + i * passo + (passo - hBarra) / 2;
    const v = Number.isFinite(b.valor) ? b.valor : 0;
    const comp = Math.abs(v) * escala;
    const x = v < 0 ? centro - comp : centro;

    ctx.fillStyle = b.cor;
    ctx.fillRect(x, y, Math.max(1.5, comp), hBarra);

    // Nutriente à esquerda do eixo, sempre na mesma coluna.
    ctx.fillStyle = tema.texto;
    ctx.font = FONTE(10, 'bold');
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(b.rotulo, mEsq - 5, y + hBarra / 2);

    // Valor à direita da área, fora das barras (não some sob a barra curta).
    ctx.fillStyle = tema.textoFraco;
    ctx.font = FONTE(9);
    ctx.textAlign = 'left';
    ctx.fillText(num(v, casas), mEsq + larg + 5, y + hBarra / 2);
  });

  // Eixo do zero por cima das barras — é a referência de leitura.
  const xz = Math.round(centro) + 0.5;
  ctx.strokeStyle = tema.eixo; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(xz, mTopo); ctx.lineTo(xz, mTopo + alt); ctx.stroke();

  ctx.fillStyle = tema.textoFraco;
  ctx.font = FONTE(8);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillText(`−${num(limite, 1)}`, mEsq, dims.altura - 4);
  ctx.textAlign = 'center';
  ctx.fillText('0', centro, dims.altura - 4);
  ctx.textAlign = 'right';
  ctx.fillText(`+${num(limite, 1)}`, mEsq + larg, dims.altura - 4);
}

// ── 2. Radar de balanço ─────────────────────────────────────────────────────

export interface PontoRadar {
  rotulo: string;
  /** Índice DRIS ou IZ do CND. */
  valor: number;
}

export interface OpcoesRadar {
  tema?: TemaGrafico;
  /** Cor da linha/preenchimento do polígono. */
  cor?: string;
  casas?: number;
}

/**
 * Radar do balanço nutricional. O ANEL DO ZERO fica no MEIO do raio, não no
 * centro: os índices são positivos E negativos, e um radar que colocasse o zero
 * no centro esmagaria toda deficiência num ponto só — exatamente a metade que o
 * agrônomo precisa ver. Com o zero no meio, a planta equilibrada é um círculo
 * perfeito e o desequilíbrio é uma amassadura visível.
 */
export function desenharRadar(
  ctx: CanvasRenderingContext2D,
  pontos: PontoRadar[],
  dims: DimsGrafico,
  opcoes: OpcoesRadar = {},
): void {
  const tema = opcoes.tema ?? TEMA_ESCURO;
  fundo(ctx, dims, tema);
  if (pontos.length < 3) return;   // com 2 eixos não existe polígono

  const cor = opcoes.cor ?? '#38bdf8';
  const cx = dims.largura / 2, cy = dims.altura / 2;
  const raio = Math.max(24, Math.min(dims.largura, dims.altura) / 2 - 22);
  const limite = Math.max(0.5, ...pontos.map(p => Math.abs(p.valor) || 0));
  const n = pontos.length;

  const ang = (i: number) => (i / n) * Math.PI * 2 - Math.PI / 2;   // começa no topo
  const rDe = (v: number) => raio * (0.5 + 0.5 * Math.max(-1, Math.min(1, v / limite)));

  // Teias: 0,25 · 0,5 (zero) · 0,75 · 1,0 do raio.
  for (const frac of [0.25, 0.5, 0.75, 1]) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = ang(i), r = raio * frac;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = frac === 0.5 ? tema.eixo : tema.grade;
    ctx.lineWidth = frac === 0.5 ? 1.4 : 1;
    ctx.stroke();
  }

  // Raios e rótulos dos nutrientes.
  ctx.font = FONTE(9, 'bold');
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < n; i++) {
    const a = ang(i);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * raio, cy + Math.sin(a) * raio);
    ctx.strokeStyle = tema.grade; ctx.lineWidth = 1; ctx.stroke();

    ctx.fillStyle = tema.texto;
    ctx.fillText(pontos[i].rotulo, cx + Math.cos(a) * (raio + 12), cy + Math.sin(a) * (raio + 11));
  }

  // Polígono da amostra.
  ctx.beginPath();
  pontos.forEach((p, i) => {
    const a = ang(i), r = rDe(Number.isFinite(p.valor) ? p.valor : 0);
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = cor + '33';   // 20% de opacidade em hex
  ctx.fill();
  ctx.strokeStyle = cor; ctx.lineWidth = 1.8; ctx.stroke();

  pontos.forEach((p, i) => {
    const a = ang(i), r = rDe(Number.isFinite(p.valor) ? p.valor : 0);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.4, 0, Math.PI * 2);
    ctx.fillStyle = cor; ctx.fill();
  });

  // A régua do radar em texto: sem ela o polígono não tem escala.
  ctx.font = FONTE(8);
  ctx.fillStyle = tema.textoFraco;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(`anel central = 0 · borda = ±${num(limite, opcoes.casas ?? 1)}`, 2, dims.altura - 3);
}

// ── 3. Matriz de concordância ───────────────────────────────────────────────

export interface CelulaMatriz {
  /** Texto curto dentro da célula ("Def.", "Adeq.", "—"). */
  texto: string;
  /** Cor de fundo da célula. */
  cor: string;
  /** Cor do texto. Padrão: branco sobre cor cheia. */
  corTexto?: string;
}

export interface LinhaMatriz {
  rotulo: string;
  celulas: CelulaMatriz[];
}

export interface DadosMatriz {
  colunas: string[];
  linhas: LinhaMatriz[];
}

export interface OpcoesMatriz {
  tema?: TemaGrafico;
  /** Largura reservada aos rótulos de linha (nutrientes). */
  largRotulo?: number;
}

/**
 * A matriz DRIS × CND × Faixa × Chance, nutriente a nutriente — a tela que
 * mostra ONDE os métodos discordam em vez de esconder a discordância atrás de
 * um número só. Célula sem opinião NÃO fica vazia: o chamador manda um traço e
 * a cor neutra (ledger 17 — buraco declarado, nunca buraco disfarçado).
 */
export function desenharMatrizConcordancia(
  ctx: CanvasRenderingContext2D,
  dados: DadosMatriz,
  dims: DimsGrafico,
  opcoes: OpcoesMatriz = {},
): void {
  const tema = opcoes.tema ?? TEMA_ESCURO;
  fundo(ctx, dims, tema);
  if (!dados.linhas.length || !dados.colunas.length) return;

  const largRotulo = opcoes.largRotulo ?? 34;
  const hCabec = 16;
  const nCols = dados.colunas.length;
  const largCel = Math.max(18, (dims.largura - largRotulo - 2) / nCols);
  const hLinha = Math.max(12, Math.min(20, (dims.altura - hCabec - 2) / dados.linhas.length));

  ctx.textBaseline = 'middle';

  // Cabeçalho.
  ctx.font = FONTE(8, 'bold');
  ctx.fillStyle = tema.textoFraco;
  ctx.textAlign = 'center';
  dados.colunas.forEach((c, j) => {
    ctx.fillText(c, largRotulo + j * largCel + largCel / 2, hCabec / 2);
  });

  dados.linhas.forEach((linha, i) => {
    const y = hCabec + i * hLinha;

    ctx.font = FONTE(9, 'bold');
    ctx.fillStyle = tema.texto;
    ctx.textAlign = 'right';
    ctx.fillText(linha.rotulo, largRotulo - 5, y + hLinha / 2);

    linha.celulas.slice(0, nCols).forEach((cel, j) => {
      const x = largRotulo + j * largCel;
      ctx.fillStyle = cel.cor;
      ctx.fillRect(x + 1, y + 1, largCel - 2, hLinha - 2);
      ctx.font = FONTE(8, 'bold');
      ctx.fillStyle = cel.corTexto ?? '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(cel.texto, x + largCel / 2, y + hLinha / 2);
    });
  });
}

// ── 4. Linha do IBN entre safras ────────────────────────────────────────────

export interface PontoLinha {
  rotulo: string;
  /** `null` = safra sem diagnose. A linha QUEBRA — não interpola o buraco. */
  valor: number | null;
}

export interface OpcoesLinha {
  tema?: TemaGrafico;
  cor?: string;
  casas?: number;
}

/**
 * IBN por safra. Safra sem diagnose quebra a linha em vez de ser ligada por um
 * segmento reto: o segmento diria "o desequilíbrio caiu suavemente naquele ano"
 * — uma afirmação que nenhum laudo fez.
 */
export function desenharLinhaIbn(
  ctx: CanvasRenderingContext2D,
  pontos: PontoLinha[],
  dims: DimsGrafico,
  opcoes: OpcoesLinha = {},
): void {
  const tema = opcoes.tema ?? TEMA_ESCURO;
  fundo(ctx, dims, tema);
  if (!pontos.length) return;

  const cor = opcoes.cor ?? '#38bdf8';
  const casas = opcoes.casas ?? 1;
  const mEsq = 30, mDir = 8, mTopo = 8, mBase = 16;
  const larg = Math.max(20, dims.largura - mEsq - mDir);
  const alt = Math.max(16, dims.altura - mTopo - mBase);

  const valores = pontos.map(p => p.valor).filter((v): v is number => v != null && Number.isFinite(v));
  if (!valores.length) return;
  const vMax = Math.max(...valores) * 1.1 || 1;
  const vMin = 0;   // IBN é uma soma de módulos: a base do eixo é zero, sempre.

  const x = (i: number) => pontos.length === 1
    ? mEsq + larg / 2
    : mEsq + (i / (pontos.length - 1)) * larg;
  const y = (v: number) => mTopo + alt - ((v - vMin) / (vMax - vMin)) * alt;

  // Três linhas de grade + os valores do eixo.
  ctx.font = FONTE(8);
  ctx.textBaseline = 'middle';
  for (const frac of [0, 0.5, 1]) {
    const v = vMin + frac * (vMax - vMin);
    const yy = Math.round(y(v)) + 0.5;
    ctx.strokeStyle = tema.grade; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(mEsq, yy); ctx.lineTo(mEsq + larg, yy); ctx.stroke();
    ctx.fillStyle = tema.textoFraco; ctx.textAlign = 'right';
    ctx.fillText(num(v, casas), mEsq - 4, yy);
  }

  // Segmentos: só liga pontos CONSECUTIVOS com valor.
  ctx.strokeStyle = cor; ctx.lineWidth = 2;
  for (let i = 1; i < pontos.length; i++) {
    const a = pontos[i - 1].valor, b = pontos[i].valor;
    if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) continue;
    ctx.beginPath();
    ctx.moveTo(x(i - 1), y(a));
    ctx.lineTo(x(i), y(b));
    ctx.stroke();
  }

  ctx.textAlign = 'center';
  pontos.forEach((p, i) => {
    if (p.valor != null && Number.isFinite(p.valor)) {
      ctx.beginPath();
      ctx.arc(x(i), y(p.valor), 3, 0, Math.PI * 2);
      ctx.fillStyle = cor; ctx.fill();
    }
    ctx.font = FONTE(8);
    ctx.fillStyle = tema.textoFraco;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(p.rotulo, x(i), dims.altura - 4);
  });
}
