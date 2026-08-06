// Texto do RELATÓRIO PDF da validação — parte pura (testável em node).
//
// Duas coisas moram aqui porque o PDF não perdoa nenhuma delas:
//
//  1. A FONTE DO PDF NÃO TEM η, ², ×, ÷, ≥. A helvetica do jsPDF escreve em
//     WinAnsi; o que está fora é DESCARTADO na hora de desenhar — sem erro,
//     sem aviso. Foi assim que o relatório de prescrição saiu com
//     "Faltante: 180,0 0,0 = 180,0" (sem o menos) e com "PO" no lugar de
//     P₂O₅. As justificativas da validação são cheias de "η² = 98,4%" e
//     "d de Cohen ≥ 0,5", então a conversão é obrigatória — e testada.
//
//  2. O RESUMO POR ZONA (mínimo, média, máximo) é a tabela que o agrônomo
//     lê primeiro. Montá-la aqui deixa o desenho do PDF só com posições.
//
// npm run teste:validacao

import type { ResumoValores, ValidacaoZona } from './tipos.ts';

/** Trocas ANTES de descartar: preservam o sentido em vez de sumir com ele. */
export const TROCAS_PDF: Array<[RegExp, string]> = [
  [/η²/g, 'eta2'], [/η/g, 'eta'],
  [/²/g, '2'], [/³/g, '3'], [/₂/g, '2'], [/₅/g, '5'],
  [/×/g, 'x'], [/÷/g, '/'], [/−/g, '-'], [/–/g, '-'],
  [/≥/g, '>='], [/≤/g, '<='], [/≈/g, '~'], [/→/g, '->'],
  [/•/g, '·'], [/✓/g, 'OK'],
];

/** Converte para o que a fonte do PDF sabe escrever. */
export function paraPdf(s: string | null | undefined): string {
  let t = s ?? '';
  for (const [re, sub] of TROCAS_PDF) t = t.replace(re, sub);
  return t.replace(/[^\x00-\xFF]/g, '');
}

/** true quando a camada de validação é de PRODUTIVIDADE (muda o que se soma). */
export const ehProdutividade = (unidade: string): boolean =>
  /kg\/ha|sc\/ha|t\/ha/i.test(unidade || '');

const fmt = (v: number, d = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmt0 = (v: number) => Math.round(v).toLocaleString('pt-BR');

/** Número do relatório: acima de 100 sem casa decimal (mesma regra dos demais). */
export function numRel(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  // Uma casa basta: "0,00" de IVR e "2,27%" de CV fingem precisão que a
  // amostragem de pixels não tem. E inteiro sai sem casa — "4 safras", não
  // "4,0 safras".
  if (Number.isInteger(v)) return fmt0(v);
  return Math.abs(v) >= 100 ? fmt0(v) : fmt(v, 1);
}

export interface LinhaZonaPdf {
  zona: string;
  classe: string;
  areaHa: number;
  percArea: number;
  nPoligonos: number;
  /** mínimo · média · máximo da camada dentro da zona (o resumo pedido). */
  min: string;
  media: string;
  max: string;
  cv: string;
  ivr: string;
  /** produção estimada da zona (média × área) — só para camada de produtividade. */
  producao: string;
  producaoNum: number | null;
}

/**
 * Linha da tabela por zona. `unidade` é a da camada (kg/ha, sc/ha, índice…).
 *
 * A produção estimada só aparece quando a camada é de produtividade: média ×
 * área é produção quando a unidade é por hectare de colheita, e é bobagem
 * quando a camada é NDVI ou condutividade.
 */
export function linhaZonaPdf(z: ValidacaoZona, unidade: string): LinhaZonaPdf {
  const r: ResumoValores | null = z.resumo;
  const prod = ehProdutividade(unidade) && r ? (r.media * z.areaHa) : null;
  return {
    zona: z.nome,
    classe: z.classe || '—',
    areaHa: z.areaHa,
    percArea: z.percArea,
    nPoligonos: z.nPoligonos,
    min: r ? numRel(r.min) : '—',
    media: r ? numRel(r.media) : '—',
    max: r ? numRel(r.max) : '—',
    cv: r?.cv != null ? `${numRel(r.cv)}%` : '—',
    ivr: z.ivr.valor != null ? numRel(z.ivr.valor) : '—',
    producao: prod == null ? '—' : `${fmt0(prod / 1000)} t`,
    producaoNum: prod,
  };
}

/** Total da produção estimada (t) — soma das zonas com dado. */
export function producaoTotalT(linhas: LinhaZonaPdf[]): number | null {
  const comProd = linhas.filter(l => l.producaoNum != null);
  return comProd.length ? comProd.reduce((s, l) => s + (l.producaoNum as number), 0) / 1000 : null;
}

/** Rodapé metodológico: sem isto o relatório não se sustenta fora da tela. */
export const METODOLOGIA = [
  'IVR (variabilidade relativa da zona): CV (peso 0,40) + amplitude p95-p5 (0,30) + IQR (0,20) + % de outliers (0,10), cada um normalizado 0-100. Menor = zona mais homogênea por dentro.',
  'Separação entre zonas: eta2 (fração da variação total explicada pela divisão) multiplicado pela distinção entre zonas vizinhas (d de Cohen >= 0,5). O eta2 sozinho sobe sempre que se criam mais zonas.',
  'IPE (persistência espacial): cada safra é classificada nos próprios tercos e mede-se a fração da área que cai no mesmo terco em cada par de safras. 33% é o que o acaso daria.',
  'ICA (confiança da análise): safras, camadas, resolução, cobertura, observações, ruído e consistência entre os mapas. Teto por safras: 1 safra = 48, 2 = 68, 3 = 84. NÃO entra no IQZM.',
  'IQZM: homogeneidade 0,32 + separação 0,26 + continuidade 0,16 + persistência 0,16 + fragmentação 0,10. Componente sem dado tem o peso redistribuído e o índice sai marcado como PARCIAL.',
];

/** Tudo que vai para o PDF, para a varredura do teste de caracteres. */
export function textosDoRelatorio(
  indicadores: Array<{ nome: string; justificativa: string }>,
  recomendacoes: Array<{ texto: string }>,
  extras: string[] = [],
): string[] {
  return [
    ...indicadores.flatMap(i => [i.nome, i.justificativa]),
    ...recomendacoes.map(r => r.texto),
    ...METODOLOGIA,
    ...extras,
  ];
}
