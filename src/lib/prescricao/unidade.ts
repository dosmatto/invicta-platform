// CONVERSÃO DE UNIDADE DA DOSE — população (sementes/ha) ↔ regulagem da
// plantadeira (sementes por metro linear).
//
// São o MESMO número dito de duas formas: o agrônomo pensa em plantas por
// hectare, o operador regula a plantadeira em sementes por metro de fileira.
// A ponte é o espaçamento entre linhas:
//
//     metros lineares por hectare = 10.000 ÷ espaçamento(m)
//     sementes/m = sementes/ha × espaçamento ÷ 10.000
//
// Refazer a prescrição só para trocar a unidade seria pedir para errar: a
// conversão é exata e reversível, então ela acontece na hora de VER e de
// EXPORTAR, sem tocar no que foi salvo.
//
// `totalDisponivel` NÃO é convertido de propósito: ele já é absoluto, na
// unidade-base (sementes). Convertê-lo mudaria o estoque só porque a régua
// mudou.
//
// Módulo PURO. npm run teste:prescricao

import { fatorBaseDose } from './calculo.ts';
import { ehUnidadeSemente, type Prescricao, type UnidadeDose } from './tipos.ts';

/** Unidades para as quais a dose desta prescrição pode ser convertida. */
export const UNIDADES_EQUIVALENTES: Partial<Record<UnidadeDose, UnidadeDose[]>> = {
  'sementes/ha': ['sementes/ha', 'sementes/m'],
  'sementes/m': ['sementes/m', 'sementes/ha'],
};

export function podeConverter(de: UnidadeDose, para: UnidadeDose, espacamentoM?: number): boolean {
  if (de === para) return true;
  if (!ehUnidadeSemente(de) || !ehUnidadeSemente(para)) return false;
  return !!espacamentoM && espacamentoM > 0;
}

/**
 * Converte UM valor de dose. Lança quando falta o espaçamento — sem ele a
 * conversão seria um chute, e chute vira população errada no campo.
 */
export function converterDose(valor: number, de: UnidadeDose, para: UnidadeDose, espacamentoM?: number): number {
  if (de === para) return valor;
  if (!ehUnidadeSemente(de) || !ehUnidadeSemente(para)) {
    throw new Error(`Conversão de ${de} para ${para} não existe — só população ↔ sementes por metro.`);
  }
  // fatorBaseDose leva CADA unidade à base (sementes); a razão entre os dois
  // fatores é a conversão, e ela vale nos dois sentidos.
  return (valor * fatorBaseDose(de, espacamentoM)) / fatorBaseDose(para, espacamentoM);
}

/**
 * Cópia da prescrição com as doses (e os limites) na unidade pedida.
 *
 * Devolve a MESMA referência quando não há o que converter — assim o caminho
 * normal não paga cópia nenhuma. O objeto devolvido é para VER e EXPORTAR: o
 * que está salvo continua na unidade original.
 */
export function prescricaoEmUnidade(p: Prescricao, para: UnidadeDose): Prescricao {
  if (p.unidade === para) return p;
  const esp = p.params.sementes?.espacamentoM;
  if (!podeConverter(p.unidade, para, esp)) {
    throw new Error(esp
      ? `Não dá para converter ${p.unidade} em ${para}.`
      : 'Informe o espaçamento entre linhas (Parâmetros da semente) para converter em sementes por metro.');
  }
  const conv = (v?: number) => (v == null ? v : converterDose(v, p.unidade, para, esp));
  return {
    ...p,
    unidade: para,
    zonas: p.zonas.map(z => ({ ...z, dose: converterDose(z.dose, p.unidade, para, esp) })),
    params: {
      ...p.params,
      doseMin: conv(p.params.doseMin),
      doseMax: conv(p.params.doseMax),
      doseBase: conv(p.params.doseBase),
      doseMedia: conv(p.params.doseMedia),
      incremento: conv(p.params.incremento),
      // totalDisponivel fica: já é absoluto (sementes), não por hectare.
    },
  };
}

/** Rótulo curto para o seletor de saída. */
export const ROTULO_SAIDA: Record<string, string> = {
  'sementes/ha': 'sementes/ha (população)',
  'sementes/m': 'sementes/m (regulagem)',
};
