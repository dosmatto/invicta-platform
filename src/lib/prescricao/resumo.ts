// RESUMO e conversões da prescrição para o ARQUIVO — puro (testável em node).
//
// Mora fora de exportar.ts de propósito: aquele módulo puxa jsPDF, xlsx e o
// canvas do mapa, e não carrega em node. A conta que decide quanta semente
// comprar não pode ficar refém disso.
//
// Extensão .ts explícita nos imports: os testes rodam com type-stripping.

import { doseCompensada } from './sementes.ts';
import { UNIDADE_TOTAL, ehUnidadeSemente, type Prescricao } from './tipos.ts';

const fmt = (v: number, d = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmt0 = (v: number) => Math.round(v).toLocaleString('pt-BR');

// Dose do ARQUIVO: quando a prescrição foi feita em população desejada, o que
// a máquina precisa é a taxa de semeadura — a dose compensada pela germinação.
// Sem isso o arquivo sai com a população e a lavoura nasce abaixo do alvo.
export const doseArquivo = (p: Prescricao, dose: number): number =>
  doseCompensada(dose, p.params.sementes, p.params.doseEhPopulacao && ehUnidadeSemente(p.unidade));

/**
 * true quando o arquivo leva um número diferente do digitado (há compensação).
 *
 * Germinação é assunto de SEMENTE. Fertilizante, corretivo e orgânico não
 * germinam: o relatório de um adubo saía falando em "população desejada" e
 * "ajuste de germinação (97%)" porque o marcador ficava ligado de uma
 * prescrição anterior — números certos, texto sem sentido agronômico. A
 * unidade decide, não só o marcador.
 */
export function temCompensacao(p: Prescricao): boolean {
  if (!ehUnidadeSemente(p.unidade)) return false;
  return !!p.params.doseEhPopulacao && Math.abs(doseArquivo(p, 1) - 1) > 1e-9;
}

/** Sementes → quilos pelo PMS (peso de mil sementes, em g). null sem PMS. */
export function kgDeSementes(sementes: number, pmsG?: number): number | null {
  return pmsG && pmsG > 0 ? (sementes * pmsG) / 1e6 : null;
}

/**
 * Linhas do RESUMO do PDF. Fora do desenho para caber teste e leitura.
 *
 * A pergunta que o resumo tem de responder é uma só: quanta semente eu compro,
 * e quanta a máquina vai plantar? Com compensação são DOIS totais — o da
 * população pedida e o ajustado pela germinação —, e é a diferença entre eles
 * que vira saco a mais no pedido.
 */
export function montarResumoPdf(
  p: Prescricao,
  r: { areaHa: number; nZonas: number; usado: number; doseMin: number; doseMax: number; doseMedia: number; custo: number | null },
  fator: number,
  nPoligonos: number,
): Array<{ txt: string; destaque?: boolean }> {
  const un = UNIDADE_TOTAL[p.unidade];
  const semente = ehUnidadeSemente(p.unidade);
  const nTot = (v: number) => (semente ? fmt0(v) : fmt(v, 1));
  const pms = p.params.sementes?.pmsG;
  const comKg = (sementes: number): string => {
    const kg = semente ? kgDeSementes(sementes, pms) : null;
    return kg == null ? '' : ` = ${fmt(kg, 1)} kg`;
  };

  const linhas: Array<{ txt: string; destaque?: boolean }> = [
    { txt: `Área: ${fmt(r.areaHa, 2)} ha em ${r.nZonas} zona(s) · ${nPoligonos} polígono(s)` },
  ];

  if (temCompensacao(p)) {
    const germ = p.params.sementes?.germinacaoPct ?? 100;
    const semAjuste = r.usado;                       // população pedida × área
    const comAjuste = totalDoArquivo(p, fator);      // taxa de semeadura × área
    const dif = comAjuste - semAjuste;
    const pct = semAjuste > 0 ? (dif / semAjuste) * 100 : 0;
    linhas.push(
      { txt: `População desejada: média ${fmt0(r.doseMedia)} ${p.unidade} (mín ${fmt0(r.doseMin)} · máx ${fmt0(r.doseMax)})` },
      { txt: `Total SEM ajuste (população desejada): ${nTot(semAjuste)} ${un}${comKg(semAjuste)}` },
      { txt: `Total COM ajuste de germinação (${fmt(germ, 0)}%): ${nTot(comAjuste)} ${un}${comKg(comAjuste)}`, destaque: true },
      { txt: `Diferença a mais para comprar: ${nTot(dif)} ${un}${comKg(dif)} (+${fmt(pct, 1)}%)` },
      { txt: `Taxa de semeadura: ${fmt0(comAjuste / (r.areaHa || 1))} ${un}/ha` },
    );
  } else {
    linhas.push(
      { txt: `Dose: mín ${fmt(r.doseMin, 1)} · máx ${fmt(r.doseMax, 1)} · média ${fmt(r.doseMedia, 1)} ${p.unidade}` },
      { txt: `Quantidade usada: ${nTot(r.usado)} ${un}${comKg(r.usado)}` },
    );
  }

  if (p.params.totalDisponivel != null) {
    const sobra = p.params.totalDisponivel - r.usado;
    linhas.push({ txt: `Disponível informado: ${nTot(p.params.totalDisponivel)} ${un} · ${sobra >= 0 ? 'restante' : 'falta'}: ${nTot(Math.abs(sobra))} ${un}` });
  }
  if (r.custo != null) linhas.push({ txt: `Custo estimado: R$ ${fmt(r.custo, 2)}` });

  linhas.push(temCompensacao(p)
    ? { txt: 'O arquivo de aplicação JÁ SAI com o ajuste de população: a máquina recebe a taxa de semeadura corrigida pela germinação, não a população desejada.', destaque: true }
    : { txt: 'O arquivo de aplicação sai com a dose exatamente como está na tabela acima.' });
  return linhas;
}

// Quanto de produto o arquivo consome de fato. Com compensação, o resumo conta
// em POPULAÇÃO (a base do total disponível) e o depósito entrega SEMENTES — o
// número que o comprador precisa é este.
export function totalDoArquivo(p: Prescricao, fator: number): number {
  return p.zonas.reduce((s, z) => s + doseArquivo(p, z.dose) * z.areaHa * fator, 0);
}
