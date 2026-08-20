// DOSE POR ZONA — CALCULADA DIRETO DA EQUAÇÃO.
//
// Pedido do usuário, textual: "o valor que deve ser atrelado a cada zona é o
// valor REAL dele utilizando a equação diretamente, nada de interpolar e fazer
// média para o ponto."
//
// É o caminho certo, e não é o mesmo que ler a dose de volta do mapa. Ler do
// raster passa por duas aproximações que aqui não existem:
//   • o valor do laudo vira pixel (float32) e volta — o decimal anda;
//   • célula que cai na divisa, ou zona que o raster não alcançou, obrigaria a
//     escolher um representante (média, centroide) para a zona.
// Aqui a conta é a mesma que o agrônomo faria na mão: pega o resultado do laudo
// daquela zona, joga na equação, e o que sair É a taxa da zona. Uma execução
// por zona, sem mapa nenhum no meio.
//
// O motor é o MESMO da Recomendação (recomendacao/motor.ts) e a execução por
// zona é a MESMA já usada na aba Prescrições (prescricao/equacao.ts) — nenhuma
// segunda implementação da linguagem de equações.
//
// Módulo puro. npm run teste:dosezona

import { atributoPorToken, validar } from './motor.ts';
import { dosesPorEquacao, type EquacaoPresc } from '../prescricao/equacao.ts';

/** O que a equação precisa saber de uma zona: o valor de cada atributo. */
export interface ValoresDaZona {
  /** identidade do polígono, a mesma chave do zoneamento */
  id: string;
  /** valor do laudo por NUTRIENTE (chave `nut` do atributo, ex.: 'ctc', 'satk') */
  porNutriente: Record<string, number>;
}

export interface DoseZonaDireta {
  id: string;
  /** a taxa da zona, saída da equação (NaN quando faltou valor) */
  dose: number;
  /** por que ficou sem dose (falta de valor no laudo, erro da equação) */
  erro?: string;
}

/**
 * Roda a equação UMA VEZ POR ZONA.
 *
 * `valores` traz, por zona, o resultado do laudo de cada nutriente. A ponte
 * token→nutriente é a do próprio motor (`atributoPorToken`), a mesma que a
 * Recomendação usa para escolher o mapa de cada atributo — assim "CTC" na
 * equação lê o mesmo dado nos dois caminhos.
 *
 * Zona sem o valor de algum atributo sai com `dose: NaN` e o motivo em `erro`,
 * NUNCA com um número inventado: melhor a tela dizer "faltou CTC na zona 3" do
 * que a máquina receber uma taxa que ninguém calculou.
 */
export function dosesDiretasPorZona(
  valores: ValoresDaZona[],
  eq: EquacaoPresc,
): { doses: DoseZonaDireta[]; erroCompilacao?: string } {
  // Os tokens que a equação usa (V, CTC, P…), na grafia do motor.
  const tokens = validar(eq.script, eq.constantes).vars;
  // dosesPorEquacao espera `valoresPorZona[idZona][tokenEmMinusculo]`.
  const porZona: Record<string, Record<string, number>> = {};
  for (const z of valores) {
    const linha: Record<string, number> = {};
    for (const tk of tokens) {
      const at = atributoPorToken(tk);
      if (!at) continue;                       // token desconhecido: o motor reclama
      const v = z.porNutriente[at.nut];
      if (v != null && Number.isFinite(v)) linha[tk.toLowerCase()] = v;
    }
    porZona[z.id] = linha;
  }
  const r = dosesPorEquacao(valores.map(z => ({ id: z.id })), porZona, eq);
  return { doses: r.doses.map(d => ({ id: d.id, dose: d.dose, erro: d.erro })), erroCompilacao: r.erroCompilacao };
}

/** Os nutrientes que a equação lê — para a tela saber o que buscar no laudo. */
export function nutrientesDaEquacao(script: string, constantes: EquacaoPresc['constantes']): string[] {
  const out: string[] = [];
  for (const tk of validar(script, constantes).vars) {
    const at = atributoPorToken(tk);
    if (at && !out.includes(at.nut)) out.push(at.nut);
  }
  return out;
}
