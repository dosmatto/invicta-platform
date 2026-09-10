// Geometria do gráfico de cenas (pendência 40) — motor PURO (testável em Node).
//
// O eixo X é TEMPO REAL, não a posição da cena no array. Parece detalhe e não é:
// as passagens do Sentinel-2 são regulares, mas as que sobram depois do filtro de
// nuvem não são — em 3 anos há vazios de dois meses na estação chuvosa. Espaçar
// por índice esconde exatamente o buraco que o usuário precisa enxergar.
//
// Pelo mesmo motivo a curva de vigor é quebrada em segmentos: ligar dois pontos
// separados por dois meses desenha uma reta que ninguém mediu.

export const MS_DIA = 86400000;

/** ms UTC de uma data 'YYYY-MM-DD' (UTC: imune a horário de verão). */
export function ms(data: string): number {
  return Date.parse(data + 'T00:00:00Z');
}

/** 'YYYY-MM-DD' de um instante em ms UTC. */
export function iso(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

export interface Escala { t0: number; t1: number }

/**
 * Extremos do eixo. Com uma data só (ou todas iguais), abre ±1 dia — senão
 * `t1 - t0` é zero e todo x vira NaN.
 */
export function escalaTempo(datas: string[]): Escala {
  const ts = datas.map(ms).filter(t => Number.isFinite(t));
  if (ts.length === 0) return { t0: 0, t1: MS_DIA };
  const t0 = Math.min(...ts), t1 = Math.max(...ts);
  return t0 === t1 ? { t0: t0 - MS_DIA, t1: t1 + MS_DIA } : { t0, t1 };
}

export interface Caixa { W: number; PL: number; PR: number }

export function posX(data: string, e: Escala, c: Caixa): number {
  const larg = c.W - c.PL - c.PR;
  return c.PL + ((ms(data) - e.t0) / (e.t1 - e.t0)) * larg;
}

/** Inversa de posX — é o que o arrasto do brush usa. Fora da área, grampeia. */
export function dataDoPixel(px: number, e: Escala, c: Caixa): string {
  const larg = c.W - c.PL - c.PR;
  const f = Math.min(1, Math.max(0, (px - c.PL) / larg));
  return iso(Math.round(e.t0 + f * (e.t1 - e.t0)));
}

/** Cenas com data no intervalo, INCLUSIVE nas duas pontas. */
export function cenasNaJanela<T extends { data: string }>(cenas: T[], ini: string, fim: string): T[] {
  const a = ini <= fim ? ini : fim;
  const b = ini <= fim ? fim : ini;
  return cenas.filter(c => c.data >= a && c.data <= b);
}

export interface PontoVigor { data: string; valor: number }

/**
 * Quebra a série em segmentos contínuos: um vão MAIOR que `gapDias` vira um
 * corte. Exatamente `gapDias` ainda liga (o limiar é "no máximo tantos dias").
 */
export function segmentosVigor(pts: PontoVigor[], gapDias = 30): PontoVigor[][] {
  const ord = [...pts].sort((a, b) => a.data.localeCompare(b.data));
  const out: PontoVigor[][] = [];
  let atual: PontoVigor[] = [];
  for (const p of ord) {
    const ant = atual[atual.length - 1];
    if (ant && (ms(p.data) - ms(ant.data)) / MS_DIA > gapDias) {
      out.push(atual);
      atual = [];
    }
    atual.push(p);
  }
  if (atual.length) out.push(atual);
  return out;
}

export interface Tick { data: string; rotulo: string }

/**
 * Marcas do eixo, com densidade conforme o período: ano (> 18 meses),
 * trimestre (6–18) ou mês (até 6). Nunca mais que ~8 rótulos — num SVG de 340
 * de largura, mais que isso vira borrão.
 */
export function ticksTempo(e: Escala): Tick[] {
  const meses = (e.t1 - e.t0) / (MS_DIA * 30.44);
  const passo = meses > 18 ? 12 : meses > 6 ? 3 : 1;
  const d0 = new Date(e.t0);
  const out: Tick[] = [];
  // Começa no primeiro limite alinhado ao passo, à frente de t0.
  let ano = d0.getUTCFullYear();
  let mes = Math.floor(d0.getUTCMonth() / passo) * passo;
  for (let i = 0; i < 200; i++) {
    const t = Date.UTC(ano, mes, 1);
    if (t > e.t1) break;
    if (t >= e.t0) {
      const data = iso(t);
      out.push({
        data,
        rotulo: passo === 12 ? String(ano)
          : passo === 3 ? `${String(mes + 1).padStart(2, '0')}/${String(ano).slice(2)}`
            : `${String(mes + 1).padStart(2, '0')}/${String(ano).slice(2)}`,
      });
    }
    mes += passo;
    if (mes > 11) { mes -= 12; ano += 1; }
  }
  return out;
}
