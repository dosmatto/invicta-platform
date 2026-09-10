// ONDE ESCREVER O NÚMERO DE CADA POLÍGONO NO MAPA.
//
// O rótulo saía na MÉDIA DOS VÉRTICES do anel externo — que não é o centro de
// nada. Em polígono comprido ou em C, a média cai fora da mancha; e como cada
// rótulo era desenhado sem olhar para os outros, zonas vizinhas e estreitas
// empilhavam os números uns sobre os outros ("77.764" por cima de "76.239").
//
// Aqui a escolha é em três passos:
//
//   1. ÂNCORA — o ponto mais "fundo" do polígono (o mais distante de qualquer
//      borda, pólo de inacessibilidade). Além de cair sempre DENTRO, ele traz de
//      graça o raio livre em volta: é ele que diz se o número cabe ali.
//   2. CABE? — testa a caixa do texto inteira, os quatro cantos dentro do
//      polígono. Raio sozinho seria conservador demais numa faixa comprida, onde
//      o número cabe deitado mas não num círculo.
//   3. NÃO CABE (ou bate em rótulo já posto) — o número vai para FORA, no
//      primeiro lugar livre em volta, e um TRAÇO liga o texto à âncora dentro da
//      mancha. Nenhum rótulo é descartado: sem o traço, um número solto no mapa
//      é pior que um número apertado.
//
// Trabalha em PIXELS, com o polígono já projetado — assim a regra é pura e roda
// em node. `npm run teste:rotulos-mapa`.

export type Ponto = [number, number];

export interface RotuloEntrada {
  texto: string;
  /** Anéis em PIXELS: o 0 é o externo, os demais são furos. */
  aneis: Ponto[][];
  /** Largura do texto medida pelo chamador (ctx.measureText). */
  largura: number;
  /** Altura da linha (≈ corpo da fonte). */
  altura: number;
}

export interface RotuloPosto {
  texto: string;
  /** Centro do texto. */
  x: number;
  y: number;
  /** Ponta do traço, dentro do polígono. null = o número coube na mancha. */
  traco: { x: number; y: number } | null;
}

export interface Polo { x: number; y: number; raio: number }

const dist2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) ** 2 + (ay - by) ** 2;

/** Distância de um ponto ao segmento a–b. */
function distSegmento(px: number, py: number, a: Ponto, b: Ponto): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - a[0]) * dx + (py - a[1]) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.sqrt(dist2(px, py, a[0] + t * dx, a[1] + t * dy));
}

function dentroDoAnel(x: number, y: number, anel: Ponto[]): boolean {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const xi = anel[i][0], yi = anel[i][1], xj = anel[j][0], yj = anel[j][1];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi)) dentro = !dentro;
  }
  return dentro;
}

/** Dentro do anel externo e fora de todos os furos. */
export function dentroDoPoligono(x: number, y: number, aneis: Ponto[][]): boolean {
  if (!aneis.length || !dentroDoAnel(x, y, aneis[0])) return false;
  for (let i = 1; i < aneis.length; i++) if (dentroDoAnel(x, y, aneis[i])) return false;
  return true;
}

/** Distância até a borda mais próxima (qualquer anel). */
function distanciaBorda(x: number, y: number, aneis: Ponto[][]): number {
  let d = Infinity;
  for (const anel of aneis) {
    for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
      const dd = distSegmento(x, y, anel[j], anel[i]);
      if (dd < d) d = dd;
    }
  }
  return d;
}

function bbox(anel: Ponto[]): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of anel) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

/**
 * PÓLO DE INACESSIBILIDADE: o ponto interno mais distante da borda. Busca em
 * grade com dois refinamentos — barato e suficiente para rótulo (não é preciso
 * o ótimo exato, é preciso um ponto folgado e sempre DENTRO).
 */
export function poloDeInacessibilidade(aneis: Ponto[][], passos = 14): Polo {
  const externo = aneis[0] ?? [];
  if (externo.length < 3) return { x: 0, y: 0, raio: 0 };
  const [x0, y0, x1, y1] = bbox(externo);
  let melhor: Polo = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, raio: -1 };

  const varrer = (ax: number, ay: number, bx: number, by: number, n: number) => {
    const dx = (bx - ax) / n, dy = (by - ay) / n;
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n; j++) {
        const x = ax + i * dx, y = ay + j * dy;
        if (!dentroDoPoligono(x, y, aneis)) continue;
        const r = distanciaBorda(x, y, aneis);
        if (r > melhor.raio) melhor = { x, y, raio: r };
      }
    }
  };

  varrer(x0, y0, x1, y1, passos);
  if (melhor.raio < 0) {
    // Polígono fininho demais para a grade acertar: usa o vértice do meio, que
    // ao menos pertence à mancha — melhor que o centro da bbox, que pode estar fora.
    const m = externo[Math.floor(externo.length / 2)];
    return { x: m[0], y: m[1], raio: 0 };
  }
  // Dois refinamentos em volta do melhor, cada um numa janela menor.
  let janela = Math.max((x1 - x0), (y1 - y0)) / passos;
  for (let k = 0; k < 2; k++) {
    varrer(melhor.x - janela, melhor.y - janela, melhor.x + janela, melhor.y + janela, 6);
    janela /= 3;
  }
  return melhor;
}

interface Caixa { x0: number; y0: number; x1: number; y1: number }
const caixaDe = (x: number, y: number, w: number, h: number): Caixa =>
  ({ x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 });
const colidem = (a: Caixa, b: Caixa, folga: number) =>
  a.x0 - folga < b.x1 && a.x1 + folga > b.x0 && a.y0 - folga < b.y1 && a.y1 + folga > b.y0;

const areaAnel = (anel: Ponto[]): number => {
  let s = 0;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    s += anel[j][0] * anel[i][1] - anel[i][0] * anel[j][1];
  }
  return Math.abs(s) / 2;
};

/** A caixa do texto cabe inteira dentro do polígono, centrada em (x,y)? */
function cabeDentro(x: number, y: number, w: number, h: number, aneis: Ponto[][]): boolean {
  const c = caixaDe(x, y, w, h);
  return dentroDoPoligono(c.x0, c.y0, aneis) && dentroDoPoligono(c.x1, c.y0, aneis)
    && dentroDoPoligono(c.x1, c.y1, aneis) && dentroDoPoligono(c.x0, c.y1, aneis);
}

export interface OpcoesRotulo {
  /** Respiro entre dois rótulos, em px. */
  folga?: number;
  /** Margem que o rótulo respeita nas bordas da imagem. */
  margem?: number;
}

/**
 * Posiciona todos os rótulos de uma vez — é o "de uma vez" que evita a
 * sobreposição: cada rótulo enxerga os que já foram colocados.
 *
 * Os polígonos MAIORES escolhem primeiro: eles têm o melhor lugar interno e
 * quase sempre ficam sem traço; os pequenos, que são os que de fato não cabem,
 * é que saem para fora com o traço.
 */
export function posicionarRotulos(
  itens: RotuloEntrada[], area: { largura: number; altura: number }, opts: OpcoesRotulo = {},
): RotuloPosto[] {
  const folga = opts.folga ?? 2;
  const margem = opts.margem ?? 2;
  const ordem = itens
    .map((it, i) => ({ it, i, area: areaAnel(it.aneis[0] ?? []) }))
    .sort((a, b) => b.area - a.area);

  const postos: RotuloPosto[] = new Array(itens.length);
  const ocupadas: Caixa[] = [];

  for (const { it, i } of ordem) {
    if (!it.texto || !(it.aneis[0]?.length >= 3)) {
      postos[i] = { texto: it.texto, x: 0, y: 0, traco: null };
      continue;
    }
    const w = it.largura, h = it.altura;
    const polo = poloDeInacessibilidade(it.aneis);

    // 1) no lugar bom, se couber e não bater em ninguém
    const dentro = cabeDentro(polo.x, polo.y, w, h, it.aneis);
    const caixaPolo = caixaDe(polo.x, polo.y, w, h);
    if (dentro && !ocupadas.some(o => colidem(caixaPolo, o, folga))) {
      ocupadas.push(caixaPolo);
      postos[i] = { texto: it.texto, x: polo.x, y: polo.y, traco: null };
      continue;
    }

    // 2) para fora: gira em volta da âncora, afastando aos poucos, e para no
    //    primeiro lugar livre que ainda esteja dentro da imagem.
    const passoR = Math.max(h * 0.9, polo.raio + h * 0.8);
    const angulos = [-90, -45, -135, 0, 180, 45, 135, 90].map(g => (g * Math.PI) / 180);
    let escolhido: { x: number; y: number } | null = null;
    for (let volta = 1; volta <= 5 && !escolhido; volta++) {
      const r = passoR * volta + h * 0.4;
      for (const ang of angulos) {
        const x = polo.x + Math.cos(ang) * r;
        const y = polo.y + Math.sin(ang) * r;
        if (x - w / 2 < margem || x + w / 2 > area.largura - margem) continue;
        if (y - h / 2 < margem || y + h / 2 > area.altura - margem) continue;
        const cx = caixaDe(x, y, w, h);
        if (ocupadas.some(o => colidem(cx, o, folga))) continue;
        escolhido = { x, y };
        break;
      }
    }
    // 3) nada livre: fica no pólo mesmo — número apertado ainda informa; número
    //    ausente, não.
    const p = escolhido ?? { x: polo.x, y: polo.y };
    ocupadas.push(caixaDe(p.x, p.y, w, h));
    postos[i] = { texto: it.texto, x: p.x, y: p.y, traco: escolhido ? { x: polo.x, y: polo.y } : null };
  }
  return postos;
}

/**
 * Pólo com DESEMPATE pelo centro da mancha.
 *
 * Numa faixa larga o pólo não é único: toda a linha do meio está à mesma
 * distância das duas bordas compridas, e a varredura em grade fica no primeiro
 * empate que encontrar — normalmente perto de uma das PONTAS. Visualmente isso
 * é o mesmo defeito que se está corrigindo: o número encostado na borda.
 *
 * Então, entre todos os pontos que têm praticamente a mesma folga do melhor
 * (≥ 97%), fica o mais próximo de `alvo` — o centroide de área da mancha.
 */
function poloCentrado(aneis: Ponto[][], alvo: Ponto, passos = 20): Polo {
  const base = poloDeInacessibilidade(aneis);
  const externo = aneis[0] ?? [];
  if (!(base.raio > 0) || externo.length < 3) return base;
  const [x0, y0, x1, y1] = bbox(externo);
  const minRaio = base.raio * 0.97;
  let melhor = base;
  let melhorD = dist2(base.x, base.y, alvo[0], alvo[1]);

  const varrer = (ax: number, ay: number, bx: number, by: number, n: number) => {
    const dx = (bx - ax) / n, dy = (by - ay) / n;
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n; j++) {
        const x = ax + i * dx, y = ay + j * dy;
        const d = dist2(x, y, alvo[0], alvo[1]);
        if (d >= melhorD) continue;                       // só interessa se aproxima do centro
        if (!dentroDoPoligono(x, y, aneis)) continue;
        const r = distanciaBorda(x, y, aneis);
        if (r < minRaio) continue;                        // perdeu folga: não vale a troca
        melhorD = d; melhor = { x, y, raio: r };
      }
    }
  };

  varrer(x0, y0, x1, y1, passos);
  let janela = Math.max(x1 - x0, y1 - y0) / passos;
  for (let k = 0; k < 2; k++) {
    varrer(melhor.x - janela, melhor.y - janela, melhor.x + janela, melhor.y + janela, 8);
    janela /= 3;
  }
  return melhor;
}

/** Centroide de ÁREA do anel (centro de massa) — o alvo do desempate. */
function centroideDoAnel(anel: Ponto[]): Ponto {
  let cx = 0, cy = 0, a2 = 0;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const w = anel[j][0] * anel[i][1] - anel[i][0] * anel[j][1];
    a2 += w; cx += (anel[j][0] + anel[i][0]) * w; cy += (anel[j][1] + anel[i][1]) * w;
  }
  if (Math.abs(a2) < 1e-18) {
    let sx = 0, sy = 0;
    for (const p of anel) { sx += p[0]; sy += p[1]; }
    return [sx / anel.length, sy / anel.length];
  }
  return [cx / (3 * a2), cy / (3 * a2)];
}

/**
 * ONDE ESCREVER O VALOR DE UMA ZONA, em LON/LAT (graus).
 *
 * Mesmo pólo de inacessibilidade de cima, só que sobre a geometria geográfica e
 * com o desempate de `poloCentrado`: o ponto mais FUNDO da zona — o que mais se
 * afasta de qualquer divisa — e, havendo empate, o mais perto do centro dela.
 * É ao mesmo tempo "centralizado na zona" e "a uma certa distância da borda".
 *
 * Por que não o centroide de área (`recomendacao/zonasGrid.centroideGeom`, que
 * era o usado no mapa de fertilidade por zona): o centroide é o centro de MASSA,
 * não o centro do ESPAÇO LIVRE. Em zona em C, em L ou em faixa comprida ele
 * encosta na divisa — e, entre duas zonas vizinhas, os dois números acabam
 * grudados na mesma linha, um de cada lado.
 *
 * Detalhes que importam:
 *  - MAIOR PARTE de um multipolígono (rotular a ilhota de 0,2 ha não ajuda
 *    ninguém), com os FUROS junto: o pólo nunca cai dentro de um furo.
 *  - PLANO LOCAL antes de medir: em -25° de latitude, 1° de longitude vale ~0,9°
 *    de latitude em metros. Sem encolher o eixo x por cos(lat), "distância até a
 *    borda" ficaria esticada no sentido leste-oeste e o ponto sairia deslocado.
 */
export function pontoRotuloGeo(geom: GeoJSON.Geometry | null | undefined): [number, number] | null {
  if (!geom) return null;
  const partes: GeoJSON.Position[][][] = geom.type === 'Polygon' ? [geom.coordinates]
    : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  if (!partes.length) return null;

  let rings: GeoJSON.Position[][] | null = null, maior = -1;
  for (const rs of partes) {
    const externo = rs[0];
    if (!externo || externo.length < 3) continue;
    const a = areaAnel(externo.map(p => [p[0], p[1]] as Ponto));
    if (a > maior) { maior = a; rings = rs; }
  }
  if (!rings?.[0]?.length) return null;

  const lat0 = rings[0].reduce((s, p) => s + p[1], 0) / rings[0].length;
  const k = Math.max(0.05, Math.cos((lat0 * Math.PI) / 180));
  const aneis: Ponto[][] = rings
    .filter(r => r.length >= 3)
    .map(r => r.map(p => [p[0] * k, p[1]] as Ponto));

  const polo = poloCentrado(aneis, centroideDoAnel(aneis[0]));
  if (!Number.isFinite(polo.x) || !Number.isFinite(polo.y)) return null;
  return [polo.x / k, polo.y];
}
