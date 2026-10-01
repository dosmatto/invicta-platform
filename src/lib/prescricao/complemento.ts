// COMPLEMENTAÇÃO POR NUTRIENTE sobre uma prescrição base — módulo PURO.
//
// A conta de cada área é a de lib/insumos.ts (complementarNutriente /
// complementarPorZona): complemento = max(0, meta − doseBase × garantiaBase)
// ÷ garantiaComp. Aqui fica o que vem ANTES e DEPOIS dela quando o produto base
// é uma prescrição já salva:
//
//   • base sobre ZONEAMENTO: as zonas da prescrição de complemento são as do
//     zoneamento escolhido; a dose do base é casada por idZona.
//   • base POR CONDIÇÃO (faixas de um mapa de fertilidade, ids f1..fN): não há
//     zoneamento para escolher — as áreas da prescrição de complemento SÃO as
//     faixas da base (snapshot do fc e das zonas). Uma dose de complemento por
//     faixa, sem cruzar mapas.
//
// Roda: npm run teste:prescricaocomplemento

import { complementarPorZona, type EntradaComplemento, type ResultadoZonaComplemento } from '../insumos.ts';
import { arredondarDose } from './calculo.ts';
import type { ParamsComplemento, Prescricao, ZonaDose } from './tipos.ts';

/** A base traz as PRÓPRIAS áreas (não usa zoneamento)? Hoje: só 'condicao'. */
export const baseTemAreasProprias = (base: Pick<Prescricao, 'modo'>): boolean => base.modo === 'condicao';

export interface AreasDaBase {
  zonas: ZonaDose[];
  fc: GeoJSON.FeatureCollection;
  zoneamentoNome: string;
  baseDosePorZona: Record<string, number>;
  baseCondicao: NonNullable<ParamsComplemento['baseCondicao']>;
}

/**
 * Áreas da prescrição de complemento a partir de uma base POR CONDIÇÃO.
 * Tudo é CÓPIA (snapshot): a base pode ganhar versão nova depois, e o que foi
 * para a máquina aqui não pode mudar sozinho. A dose das áreas nasce 0 — é o
 * "Aplicar a dose calculada" que a preenche.
 */
export function areasDaBaseCondicao(base: Prescricao): AreasDaBase | null {
  if (!baseTemAreasProprias(base) || !base.fc?.features?.length || !base.zonas.length) return null;
  const c = base.params.condicao;
  const baseDosePorZona: Record<string, number> = {};
  base.zonas.forEach(z => { baseDosePorZona[z.idZona] = z.dose; });
  return {
    zonas: base.zonas.map(z => ({ ...z, dose: 0 })),
    fc: JSON.parse(JSON.stringify(base.fc)) as GeoJSON.FeatureCollection,
    zoneamentoNome: `Áreas de ${base.nome} (v${base.versao})`,
    baseDosePorZona,
    baseCondicao: {
      rotuloMapa: c?.rotuloMapa ?? '',
      sigla: c?.sigla || (c?.nut ?? '').toUpperCase(),
      limiares: [...(c?.limiares ?? [])],
    },
  };
}

export interface DosesComplemento {
  /** resultado cru da conta, zona a zona (avisos incluídos) */
  porZona: ResultadoZonaComplemento[];
  /** idZona → dose do complementar, já arredondada (arredondarDose) */
  doses: Record<string, number>;
  /** nomes das zonas sem dose do base no snapshot (o complemento cobre a meta inteira) */
  semBase: string[];
  /** nomes das zonas onde o base tem dose 0 ("não aplica" naquela faixa) */
  baseZero: string[];
}

/**
 * Dose do complemento em cada zona, descontando o que o base entregou ali.
 * Zona sem dose do base no snapshot conta como base 0.
 */
export function dosesDoComplemento(
  zonas: Array<Pick<ZonaDose, 'idZona' | 'nomeZona'>>,
  baseDosePorZona: Record<string, number>,
  e: Omit<EntradaComplemento, 'baseDoseKgHa'>,
): DosesComplemento {
  const porZona = complementarPorZona(
    zonas.map(z => ({ idZona: z.idZona, baseDoseKgHa: baseDosePorZona[z.idZona] ?? 0 })),
    e,
  );
  const doses: Record<string, number> = {};
  porZona.forEach(x => { doses[x.idZona] = arredondarDose(x.doseCompKgHa); });
  const semBase = zonas.filter(z => baseDosePorZona[z.idZona] == null).map(z => z.nomeZona);
  const baseZero = zonas.filter(z => baseDosePorZona[z.idZona] === 0).map(z => z.nomeZona);
  return { porZona, doses, semBase, baseZero };
}
