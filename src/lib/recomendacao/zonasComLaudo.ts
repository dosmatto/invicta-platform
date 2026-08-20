'use client';

// O LAUDO DE CADA ZONA — a ponte entre a análise importada e a dose por zona.
//
// A Recomendação por zona roda a equação uma vez por zona (doseZonaDireta.ts) e
// para isso precisa do resultado do laboratório DAQUELA zona. Quem já sabia
// fazer esse vínculo era a aba Fertilidade; aqui ele é reusado tal e qual, das
// mesmas funções (`bindingPorPontos` / `bindingAuto` / `valorZona`) e com a
// mesma regra de grade (`resolverGradeDoLaudo`).
//
// Reusar importa mais do que parecer: se o vínculo zona↔amostra divergisse entre
// as duas telas, o mapa de fertilidade mostraria um valor na zona 3 e a dose
// dela sairia calculada com o laudo de outra zona — e nada na tela denunciaria.

import { getGrades, type ImportacaoLab } from '../store';
import { resolverGradeDoLaudo } from '../eloGrade';
import { bindingPorPontos, bindingAuto, valorZona } from '../meap/fertilidadePorZona';
import type { ZonaGeom } from './dosePorZona';
import type { ValoresDaZona } from './doseZonaDireta';

/**
 * Vínculo zona → nº da amostra, pela LOCALIZAÇÃO do ponto de coleta (o ponto que
 * cai dentro da zona é a amostra dela). Zona sem ponto dentro cai no fallback
 * pela ordem. É a mesma regra da aba Fertilidade em "Processar em zona".
 */
export function bindingDasZonas(
  talhaoId: string, safraNome: string, imp: ImportacaoLab, zonas: ZonaGeom[],
): Record<string, number> {
  const grade = resolverGradeDoLaudo(getGrades(talhaoId, safraNome), imp.gradeId);
  const pontos = (grade?.pontos ?? []).map(p => ({ numero: p.numero ?? p.ordem + 1, lng: p.lng, lat: p.lat }));
  const nums = [...new Set(imp.resultados.map(r => r.numero))];
  // `bindingPorPontos` pede { id, classe, geometry }; só `id` e `geometry` são
  // usados no vínculo — a classe não entra na conta.
  const zs = zonas.map(z => ({ id: z.id, classe: '', geometry: z.geometry }));
  return pontos.length ? bindingPorPontos(zs, pontos, nums) : bindingAuto(zs, nums);
}

/**
 * O valor de laudo de cada nutriente, por zona, na profundidade que a equação lê.
 *
 * Zona sem resultado para um nutriente simplesmente não recebe a chave — quem
 * calcula a dose devolve NaN com o motivo, em vez de inventar um número.
 */
export function valoresDasZonas(
  imp: ImportacaoLab,
  binding: Record<string, number>,
  zonas: ZonaGeom[],
  nutrientes: string[],
  profundidade: string,
): ValoresDaZona[] {
  return zonas.map(z => {
    const porNutriente: Record<string, number> = {};
    for (const nut of nutrientes) {
      const v = valorZona(imp, binding, z.id, nut, profundidade);
      if (Number.isFinite(v)) porNutriente[nut] = v;
    }
    return { id: z.id, porNutriente };
  });
}
