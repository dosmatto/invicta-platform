// RESUMO GERAL das recomendações marcadas — NÚCLEO PURO.
//
// Responde à pergunta de compra e de logística de envio: "quanto de cada produto
// eu preciso, talhão a talhão, somando os anos que eu escolher — e quais
// recomendações vou ter de mandar para o campo?". Não é conferência de mapa: o
// relatório de recomendação da fazenda (relatorioCenarios.ts) continua sendo o
// que carrega os mapas de cada talhão.
//
// Este módulo é PURO de propósito — sem jsPDF, sem xlsx, sem nuvem e sem
// localStorage. Recebe uma lista achatada de LANÇAMENTOS (uma dose marcada de um
// talhão num ano) e devolve a estrutura que serve, sem retoque, ao PDF e ao
// Excel. A coleta mora em resumoGeralExport.ts. Roda em node:
// `npm run teste:resumo-geral`.

/** Uma dose marcada de um talhão num ano — a unidade mínima do resumo. */
export interface Lancamento {
  fazenda: string;
  talhaoId: string;
  talhao: string;
  areaHa: number;
  ano: number;
  safra: string;
  numero: number;      // nº do cadastro da equação (1e9+ = sem número)
  rotulo: string;      // "03 - Calcario Zona"
  produto: string;     // chaveProduto: produto || nome da fórmula
  toneladas: number;
  custo: number;
}

export interface LinhaResumo {
  fazenda: string;
  talhao: string;
  areaHa: number;
  /** Só os produtos que ESTE talhão recebeu — ausente nao e zero (celula vazia). */
  porProduto: Record<string, number>;
  custo: number;
}

export interface BlocoAno {
  ano: number;
  safras: string[];
  linhas: LinhaResumo[];
  totalProduto: Record<string, number>;
  totalCusto: number;
  areaHa: number;       // soma das áreas dos talhões DISTINTOS do ano
  nTalhoes: number;
}

/** Uma recomendação e onde ela é usada — a lista de conferência do envio. */
export interface RecomendacaoUso {
  rotulo: string;
  ano: number;
  produto: string;
  talhoes: string[];    // nomes, ordem alfanumérica, sem repetir
  toneladas: number;
  custo: number;
}

export interface ResumoGeral {
  produtos: string[];   // ordenados pelo volume total (maior primeiro)
  anos: BlocoAno[];     // mais recente primeiro
  totalGeral: { porProduto: Record<string, number>; custo: number; areaHa: number; nTalhoes: number };
  recomendacoes: RecomendacaoUso[];
}

const alfa = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true });
const soma = (alvo: Record<string, number>, chave: string, v: number) => {
  alvo[chave] = (alvo[chave] ?? 0) + (Number.isFinite(v) ? v : 0);
};

/** Produtos presentes nos lançamentos, do maior volume para o menor. */
export function produtosDe(lancs: Lancamento[]): string[] {
  const total: Record<string, number> = {};
  for (const l of lancs) soma(total, l.produto, l.toneladas);
  return Object.keys(total).sort((a, b) => (total[b] - total[a]) || alfa(a, b));
}

/**
 * Monta o resumo. `filtro` = produtos escolhidos na tela; sem ele, entram todos.
 *
 * O filtro é aplicado AQUI, no lançamento, e não depois nos totais: assim um
 * talhão que só recebeu produto não-selecionado simplesmente não aparece na
 * tabela, em vez de sair como uma linha de zeros.
 *
 * ÁREA nunca é somada por dose. Um talhão com três recomendações no mesmo ano
 * tem a sua área contada UMA vez no ano; e um talhão que aparece em dois anos
 * conta uma vez no total geral — senão a "área total" do relatório viraria
 * área vezes número de aplicações.
 */
export function montarResumoGeral(lancs: Lancamento[], filtro?: Iterable<string>): ResumoGeral {
  const permitido = filtro ? new Set(filtro) : null;
  const usados = lancs.filter(l => !permitido || permitido.has(l.produto));
  const produtos = produtosDe(usados);

  // blocos por ano
  const porAno = new Map<number, {
    safras: Set<string>;
    porTalhao: Map<string, LinhaResumo>;
    totalProduto: Record<string, number>;
    totalCusto: number;
  }>();

  for (const l of usados) {
    let a = porAno.get(l.ano);
    if (!a) { a = { safras: new Set(), porTalhao: new Map(), totalProduto: {}, totalCusto: 0 }; porAno.set(l.ano, a); }
    if (l.safra) a.safras.add(l.safra);
    let t = a.porTalhao.get(l.talhaoId);
    if (!t) {
      t = { fazenda: l.fazenda, talhao: l.talhao, areaHa: l.areaHa, porProduto: {}, custo: 0 };
      a.porTalhao.set(l.talhaoId, t);
    }
    soma(t.porProduto, l.produto, l.toneladas);
    t.custo += l.custo;
    soma(a.totalProduto, l.produto, l.toneladas);
    a.totalCusto += l.custo;
  }

  const anos: BlocoAno[] = [...porAno.entries()]
    .sort((x, y) => y[0] - x[0])
    .map(([ano, a]) => {
      const linhas = [...a.porTalhao.values()]
        .sort((x, y) => alfa(x.fazenda, y.fazenda) || alfa(x.talhao, y.talhao));
      return {
        ano,
        safras: [...a.safras].sort(),
        linhas,
        totalProduto: a.totalProduto,
        totalCusto: a.totalCusto,
        areaHa: linhas.reduce((s, l) => s + l.areaHa, 0),
        nTalhoes: linhas.length,
      };
    });

  // total geral: área por talhão DISTINTO, não por ano
  const areaPorTalhao = new Map<string, number>();
  const porProdutoGeral: Record<string, number> = {};
  let custoGeral = 0;
  for (const l of usados) {
    areaPorTalhao.set(l.talhaoId, l.areaHa);
    soma(porProdutoGeral, l.produto, l.toneladas);
    custoGeral += l.custo;
  }

  // índice recomendação -> talhões
  const porRec = new Map<string, RecomendacaoUso & { ordem: number; talhoesSet: Set<string> }>();
  for (const l of usados) {
    const k = `${l.ano} ${l.rotulo}`;
    let r = porRec.get(k);
    if (!r) {
      r = { rotulo: l.rotulo, ano: l.ano, produto: l.produto, talhoes: [], toneladas: 0, custo: 0, ordem: l.numero, talhoesSet: new Set() };
      porRec.set(k, r);
    }
    r.talhoesSet.add(l.talhao);
    r.toneladas += l.toneladas;
    r.custo += l.custo;
  }
  const recomendacoes: RecomendacaoUso[] = [...porRec.values()]
    .sort((x, y) => (y.ano - x.ano) || (x.ordem - y.ordem) || alfa(x.rotulo, y.rotulo))
    .map(r => ({
      rotulo: r.rotulo, ano: r.ano, produto: r.produto,
      talhoes: [...r.talhoesSet].sort(alfa), toneladas: r.toneladas, custo: r.custo,
    }));

  return {
    produtos,
    anos,
    totalGeral: {
      porProduto: porProdutoGeral,
      custo: custoGeral,
      areaHa: [...areaPorTalhao.values()].reduce((s, v) => s + v, 0),
      nTalhoes: areaPorTalhao.size,
    },
    recomendacoes,
  };
}

// ── Geometria da matriz no PDF ──────────────────────────────────────────────
//
// Com muitos produtos a matriz não cabe numa folha A4 paisagem. Em vez de
// encolher a fonte até ninguém ler, a tabela do ano se REPETE em grupos de
// produtos, mantendo as colunas fixas (talhão, área, investimento). Mora aqui,
// no módulo puro, para a conta ficar coberta por teste.

/** Largura útil de uma A4 paisagem com as margens do relatório (297 - 2x6). */
export const LARGURA_UTIL_MM = 285;
/** Abaixo disto "1.234,5" não cabe na coluna do produto. */
export const LARG_MIN_PRODUTO_MM = 17;

export interface PlanoTabela {
  grupos: string[][];   // produtos por página; 1 grupo = cabe tudo numa tabela só
  wProduto: number;     // largura de cada coluna de produto (mm)
}

export function planejarTabela(
  produtos: string[], fixasMm: number, utilMm = LARGURA_UTIL_MM,
): PlanoTabela {
  const disp = Math.max(LARG_MIN_PRODUTO_MM, utilMm - fixasMm);
  const cabem = Math.max(1, Math.floor(disp / LARG_MIN_PRODUTO_MM));
  if (produtos.length === 0) return { grupos: [], wProduto: disp };
  if (produtos.length <= cabem) return { grupos: [produtos], wProduto: disp / produtos.length };
  const grupos: string[][] = [];
  for (let i = 0; i < produtos.length; i += cabem) grupos.push(produtos.slice(i, i + cabem));
  return { grupos, wProduto: disp / cabem };
}
