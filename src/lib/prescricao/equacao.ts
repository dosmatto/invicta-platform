// Prescrição POR EQUAÇÃO — usa uma equação JÁ criada na Biblioteca (a mesma
// linguagem/motor da Recomendação) para calcular a dose de cada zona a partir
// de um número de entrada por variável e por zona.
//
// Puro (sem browser/storage): reusa recomendacao/motor.ts. Testável em node.
//
// Pedido do usuário: "utilizar uma equação criada já, onde ele vai pegar o
// número do ponto ou da zona e fazer o cálculo." Cada zona traz um valor por
// variável exigida pela equação (o "número" — pode ser o rótulo da zona, o
// ranking de potencial, a área, ou um valor digitado); o motor roda por zona.

import { compilar, executar, ajustarDose, validar, type Resolver } from '../recomendacao/motor.ts';
import type { ConstanteEquacao } from '../biblioteca.ts';

export interface EquacaoPresc {
  script: string;
  constantes: ConstanteEquacao[];
  naoNegativo: boolean;
  doseMinimaViavel: number;
  abaixoMinimo: 'zero' | 'minimo';
  doseMaxima?: number;
}

// Variáveis externas que a equação precisa receber por zona (V, CTC, P…).
export function variaveisDaEquacao(script: string, constantes: ConstanteEquacao[] = []): string[] {
  return validar(script, constantes).vars;
}

export interface DoseZonaEq { id: string; dose: number; erro?: string }

// Calcula a dose de CADA zona. `valoresPorZona[idZona][varLower] = número`.
// Variável ausente numa zona vira NaN → dose NaN naquela zona (a UI sinaliza),
// sem derrubar as outras. Nunca lança: erros viram campo `erro` da zona.
export function dosesPorEquacao(
  zonas: Array<{ id: string }>,
  valoresPorZona: Record<string, Record<string, number>>,
  eq: EquacaoPresc,
): { doses: DoseZonaEq[]; erroCompilacao?: string } {
  const c = compilar(eq.script, eq.constantes);
  if (!c.ok) return { doses: zonas.map(z => ({ id: z.id, dose: NaN, erro: c.erro })), erroCompilacao: c.erro };
  const opts = {
    naoNegativo: eq.naoNegativo,
    doseMinima: eq.doseMinimaViavel,
    abaixoMinimo: eq.abaixoMinimo,
    doseMaxima: eq.doseMaxima ?? 0,
  };
  const doses = zonas.map(z => {
    const vals = valoresPorZona[z.id] ?? {};
    const faltando: string[] = [];
    const ext: Resolver = (nome) => {
      const lc = nome.toLowerCase();
      const v = vals[lc];
      if (v == null || Number.isNaN(v)) { if (!faltando.includes(lc)) faltando.push(lc); return NaN; }
      return v;
    };
    try {
      const bruta = executar(c.prog, eq.constantes, ext);
      const dose = ajustarDose(bruta, opts);
      if (faltando.length) return { id: z.id, dose: NaN, erro: `Faltou o valor de: ${faltando.join(', ')}` };
      if (!Number.isFinite(dose)) return { id: z.id, dose: NaN, erro: 'Resultado inválido' };
      return { id: z.id, dose };
    } catch (e) {
      return { id: z.id, dose: NaN, erro: e instanceof Error ? e.message : String(e) };
    }
  });
  return { doses };
}
