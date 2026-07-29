// Motor de cálculo das Prescrições — PURO (sem browser/storage/nuvem), para os
// testes de scripts/teste-prescricao.mjs rodarem em node.
//
// A invariante inegociável (spec): a redistribuição por estoque NUNCA usa mais
// do que o total disponível. Doses saem por zona; o gasto de uma zona é
// dose × área. Tudo em unidades coerentes: se a dose é kg/ha, o total é kg.

export interface ZonaEntrada {
  id: string;
  areaHa: number;
  /** Peso da prioridade agronômica (≥ 0). Zonas com peso maior recebem dose
   *  maior na redistribuição. Um jeito padrão de derivá-lo do zoneamento está
   *  em pesoDoRank(). Peso 0 = a zona fica na dose mínima. */
  peso: number;
}

export interface OpcoesEstoque {
  doseMin?: number;            // piso por zona (default 0)
  doseMax?: number;            // teto por zona (default Infinity)
  incremento?: number;         // passo da máquina; doses saem na grade do passo
}

export interface ResultadoDistribuicao {
  doses: Record<string, number>;   // id da zona → dose
  usado: number;                   // Σ dose·área (unidade-base)
  sobra: number;                   // total − usado (nunca negativo)
  falta: number;                   // quanto faltou p/ a dose mínima em todas (0 = ok)
  avisos: string[];
}

const EPS = 1e-9;

// Peso padrão a partir do potencial da zona (rank 1 = maior potencial).
// relação 'direta': maior potencial → maior peso (ex.: sementes por potencial).
// 'inversa': menor potencial → maior peso (ex.: corretivo onde está pior).
export function pesoDoRank(rank: number | undefined, nRanks: number, relacao: 'direta' | 'inversa'): number {
  const n = Math.max(1, nRanks);
  const r = Math.min(Math.max(1, rank ?? Math.ceil(n / 2)), n);
  // pesos 1..n lineares; nunca 0 (senão a zona ficaria travada no mínimo).
  return relacao === 'direta' ? (n - r + 1) : r;
}

// "Water-fill" ponderado com teto: distribui `budget` (unidade-base) como dose
// EXTRA proporcional ao peso, respeitando o teto de cada zona; o que bater no
// teto devolve o excedente para as demais. Converge em ≤ n voltas.
function waterfill(
  zonas: ZonaEntrada[], budget: number, tetoDose: (z: ZonaEntrada) => number,
): Record<string, number> {
  const extra: Record<string, number> = Object.fromEntries(zonas.map(z => [z.id, 0]));
  let restante = Math.max(0, budget);
  let ativas = zonas.filter(z => z.peso > EPS && z.areaHa > EPS && tetoDose(z) > EPS);
  while (restante > EPS && ativas.length > 0) {
    const somaPesoArea = ativas.reduce((s, z) => s + z.peso * z.areaHa, 0);
    if (somaPesoArea <= EPS) break;
    const lambda = restante / somaPesoArea;      // dose extra por unidade de peso
    const saturadas: ZonaEntrada[] = [];
    let gasto = 0;
    for (const z of ativas) {
      const alvo = lambda * z.peso;
      const cabe = tetoDose(z) - extra[z.id];
      const d = Math.min(alvo, cabe);
      extra[z.id] += d;
      gasto += d * z.areaHa;
      if (alvo >= cabe - EPS) saturadas.push(z);
    }
    restante -= gasto;
    if (saturadas.length === 0) break;           // ninguém saturou → tudo alocado
    ativas = ativas.filter(z => !saturadas.includes(z));
  }
  return extra;
}

// Redistribuição por QUANTIDADE TOTAL DISPONÍVEL.
// Garante: Σ dose·área ≤ total (sempre); doseMin/doseMax respeitados quando o
// estoque permite; sobra mínima (water-fill usa tudo que couber nos tetos).
// Estoque insuficiente para o piso: NINGUÉM recebe acima do piso e a falta é
// reportada — nunca inventamos produto que não existe.
export function redistribuirPorEstoque(
  zonas: ZonaEntrada[], total: number, op: OpcoesEstoque = {},
): ResultadoDistribuicao {
  const avisos: string[] = [];
  const doseMin = Math.max(0, op.doseMin ?? 0);
  const doseMax = op.doseMax ?? Infinity;
  const inc = op.incremento && op.incremento > 0 ? op.incremento : 0;
  if (doseMax < doseMin) throw new Error('doseMax menor que doseMin');
  const validas = zonas.filter(z => z.areaHa > EPS);
  const doses: Record<string, number> = Object.fromEntries(zonas.map(z => [z.id, 0]));
  if (validas.length === 0 || total <= EPS) {
    if (total <= EPS && validas.length) avisos.push('Sem estoque disponível — doses zeradas.');
    return { doses, usado: 0, sobra: Math.max(0, total), falta: doseMin * validas.reduce((s, z) => s + z.areaHa, 0), avisos };
  }

  const custoPiso = validas.reduce((s, z) => s + doseMin * z.areaHa, 0);
  let falta = 0;

  if (total + EPS < custoPiso) {
    // Não dá para o piso em todas: distribui o que HÁ (proporcional ao peso),
    // com teto no próprio piso — ninguém passa do mínimo enquanto falta.
    falta = custoPiso - total;
    avisos.push(`Estoque insuficiente para a dose mínima em todas as zonas — faltam ${arred(falta)} na unidade-base.`);
    const extra = waterfill(validas.map(z => ({ ...z, peso: Math.max(z.peso, EPS) })), total, () => doseMin);
    for (const z of validas) doses[z.id] = extra[z.id];
  } else {
    const capTotal = validas.reduce((s, z) => s + doseMax * z.areaHa, 0);
    if (isFinite(capTotal) && total > capTotal + EPS) {
      avisos.push(`Estoque maior do que cabe na dose máxima — sobrarão ${arred(total - capTotal)} na unidade-base.`);
    }
    const budget = Math.min(total, isFinite(capTotal) ? capTotal : total) - custoPiso;
    const extra = waterfill(validas, budget, () => doseMax - doseMin);
    for (const z of validas) doses[z.id] = doseMin + extra[z.id];
  }

  // Grade do incremento (passo da máquina): arredonda para BAIXO ancorado no
  // piso (nunca estoura o estoque) e devolve o troco em passos inteiros às
  // zonas com maior perda — maior aproveitamento sem violar teto nem total.
  if (inc > 0) {
    const bruto: Record<string, number> = { ...doses };
    for (const z of validas) {
      const base = total + EPS < custoPiso ? 0 : doseMin;
      doses[z.id] = base + Math.floor((doses[z.id] - base + EPS) / inc) * inc;
    }
    let restante = total - validas.reduce((s, z) => s + doses[z.id] * z.areaHa, 0);
    const teto = total + EPS < custoPiso ? doseMin : doseMax;
    // ordena por perda (bruto − arredondado) decrescente; desempate por id
    const fila = [...validas].sort((a, b) => (bruto[b.id] - doses[b.id]) - (bruto[a.id] - doses[a.id]) || a.id.localeCompare(b.id));
    let mexeu = true;
    while (mexeu) {
      mexeu = false;
      for (const z of fila) {
        if (doses[z.id] + inc <= teto + EPS && inc * z.areaHa <= restante + EPS) {
          doses[z.id] += inc;
          restante -= inc * z.areaHa;
          mexeu = true;
        }
      }
    }
  }

  const usado = validas.reduce((s, z) => s + doses[z.id] * z.areaHa, 0);
  return { doses, usado, sobra: Math.max(0, total - usado), falta, avisos };
}

// Distribuição PROPORCIONAL a um valor-base por zona (potencial, teor de P…),
// preservando a MÉDIA ponderada por área. relação 'direta' = valor maior →
// dose maior; 'inversa' = o contrário. variacaoPct limita o desvio da média.
export function distribuirProporcional(
  zonas: Array<{ id: string; areaHa: number; valorBase: number }>,
  op: { doseMedia: number; variacaoPct: number; relacao: 'direta' | 'inversa'; doseMin?: number; doseMax?: number },
): ResultadoDistribuicao {
  const avisos: string[] = [];
  const validas = zonas.filter(z => z.areaHa > EPS);
  const doses: Record<string, number> = Object.fromEntries(zonas.map(z => [z.id, 0]));
  if (!validas.length) return { doses, usado: 0, sobra: 0, falta: 0, avisos };
  const areaTot = validas.reduce((s, z) => s + z.areaHa, 0);
  const vMin = Math.min(...validas.map(z => z.valorBase));
  const vMax = Math.max(...validas.map(z => z.valorBase));
  const s = op.relacao === 'direta' ? 1 : -1;
  const amp = Math.max(0, op.variacaoPct) / 100;
  for (const z of validas) {
    const norm = vMax - vMin < EPS ? 0 : (2 * (z.valorBase - vMin) / (vMax - vMin) - 1);   // −1..+1
    doses[z.id] = op.doseMedia * (1 + s * amp * norm);
  }
  // reancora a média exata (o mapa pode ter mais área numa ponta que na outra)
  const mediaAtual = validas.reduce((sm, z) => sm + doses[z.id] * z.areaHa, 0) / areaTot;
  if (mediaAtual > EPS) {
    const k = op.doseMedia / mediaAtual;
    for (const z of validas) doses[z.id] *= k;
  }
  // limites (se derem, re-aviso: média pode desviar)
  if (op.doseMin != null || op.doseMax != null) {
    for (const z of validas) {
      doses[z.id] = Math.min(op.doseMax ?? Infinity, Math.max(op.doseMin ?? 0, doses[z.id]));
    }
    const m2 = validas.reduce((sm, z) => sm + doses[z.id] * z.areaHa, 0) / areaTot;
    if (Math.abs(m2 - op.doseMedia) / op.doseMedia > 0.001) {
      avisos.push(`Os limites mín/máx impediram manter a média exata (ficou ${arred(m2)}).`);
    }
  }
  const usado = validas.reduce((sm, z) => sm + doses[z.id] * z.areaHa, 0);
  return { doses, usado, sobra: 0, falta: 0, avisos };
}

// Resumo operacional (cartão final e validação pré-exportação).
export interface ResumoPrescricao {
  areaHa: number;
  nZonas: number;
  usado: number;               // unidade-base
  doseMin: number;
  doseMax: number;
  doseMedia: number;           // ponderada por área
  custo: number | null;        // usado × custoUnit
}

export function resumoDoses(
  zonas: Array<{ areaHa: number; dose: number }>, custoUnit?: number,
): ResumoPrescricao {
  const v = zonas.filter(z => z.areaHa > EPS);
  const areaHa = v.reduce((s, z) => s + z.areaHa, 0);
  const usado = v.reduce((s, z) => s + z.dose * z.areaHa, 0);
  const dosesV = v.map(z => z.dose);
  return {
    areaHa, nZonas: v.length, usado,
    doseMin: v.length ? Math.min(...dosesV) : 0,
    doseMax: v.length ? Math.max(...dosesV) : 0,
    doseMedia: areaHa > EPS ? usado / areaHa : 0,
    custo: custoUnit != null && custoUnit >= 0 ? usado * custoUnit : null,
  };
}

// Nutrientes entregues pelo ORGÂNICO (teores em kg/t; dose em t/ha).
export function nutrientesPorZona(
  zonas: Array<{ id: string; areaHa: number; dose: number }>,
  teoresKgT: { n?: number; p2o5?: number; k2o?: number; ca?: number; mg?: number },
): Record<string, { n: number; p2o5: number; k2o: number; ca: number; mg: number }> {
  const out: Record<string, { n: number; p2o5: number; k2o: number; ca: number; mg: number }> = {};
  for (const z of zonas) {
    out[z.id] = {
      n: z.dose * (teoresKgT.n ?? 0),
      p2o5: z.dose * (teoresKgT.p2o5 ?? 0),
      k2o: z.dose * (teoresKgT.k2o ?? 0),
      ca: z.dose * (teoresKgT.ca ?? 0),
      mg: z.dose * (teoresKgT.mg ?? 0),
    };   // kg/ha de cada nutriente naquela zona
  }
  return out;
}

const arred = (v: number) => Math.round(v * 100) / 100;
