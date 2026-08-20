'use client';

// As zonas de manejo de um talhão, no formato que a prescrição por zona espera.
//
// Fica separado de `dosePorZona.ts` de propósito: aquele módulo é PURO e sem
// import nenhum (é o que o deixa rodar no node cru, `npm run teste:dosezona`).
// A leitura do `zonasGeojson` precisa do `rotuloZona`, então mora aqui.

import { rotuloZona } from '../meap/rotuloZona';
import { getTalhoes, getZoneamentosMeap } from '../store';
import type { ZonaGeom } from './dosePorZona';

function daFC(fc: GeoJSON.FeatureCollection | null | undefined): ZonaGeom[] {
  return (fc?.features ?? [])
    .filter(f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'))
    .map(f => {
      const p = (f.properties ?? {}) as { id?: string; zona?: string };
      return { id: String(p.id ?? '?'), rotulo: rotuloZona(p), geometry: f.geometry! };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * O zoneamento do talhão, no formato que a prescrição por zona espera.
 *
 * MESMA REGRA DA ABA FERTILIDADE: zoneamento PADRÃO salvo > o mais recente >
 * snapshot do talhão. Tem de ser a mesma, senão a prescrição sai desenhada com
 * um zoneamento e as taxas calculadas com outro — e as zonas do arquivo não
 * correspondem às do mapa que gerou os valores. O snapshot (`zonasGeojson`) só
 * é escrito no "Tornar padrão" e não é limpo ao apagar um zoneamento, então
 * sozinho ele envelhece.
 *
 * `id` é a identidade do POLÍGONO ("01", "01_2"); `rotulo` é o número que o mapa
 * mostra — e é por ele que a prescrição agrupa: duas manchas da mesma zona têm o
 * mesmo rótulo e saem com UMA taxa só. Usar o id cru faria "01_2" virar uma
 * "zona 12" que não existe no talhão.
 */
export function zonasDoTalhao(talhaoId?: string | null): ZonaGeom[] {
  if (!talhaoId) return [];
  const zs = getZoneamentosMeap(talhaoId);
  const salvo = zs.find(z => z.padrao)
    ?? [...zs].sort((a, b) => (b.criadoEm ?? '').localeCompare(a.criadoEm ?? ''))[0];
  if (salvo?.fc?.features?.length) return daFC(salvo.fc);
  const t = getTalhoes().find(x => x.id === talhaoId);
  if (!t?.zonasGeojson) return [];
  try { return daFC(JSON.parse(t.zonasGeojson) as GeoJSON.FeatureCollection); } catch { return []; }
}
