'use client';

// Zonas de manejo de um talhão — a MESMA cascata que o módulo Zonas usa para
// decidir o que mostrar: zoneamento marcado como PADRÃO > o mais recente >
// snapshot do talhão (`talhao.zonasGeojson`).
//
// Existe como módulo próprio porque ler só o snapshot é uma armadilha
// conhecida: `zonasGeojson` só é gravado quando alguém aperta "Tornar padrão",
// então quem salvou um zoneamento e nunca o marcou ficava, para o resto da
// plataforma, "sem zonas". A cascata nasceu em FertilidadeSection e agora é
// compartilhada com o relatório de Produtividade.

import { getTalhoes, getZoneamentosMeap } from '@/lib/store';

export interface ZonaTalhao {
  id: string;
  classe: string;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
}

export function zonasDoTalhao(talhaoId: string | null | undefined): ZonaTalhao[] {
  if (!talhaoId) return [];
  let fc: GeoJSON.FeatureCollection | null = null;

  const zs = getZoneamentosMeap(talhaoId);
  const salvo = zs.find(z => z.padrao)
    ?? [...zs].sort((a, b) => (b.criadoEm ?? '').localeCompare(a.criadoEm ?? ''))[0];
  if (salvo?.fc?.features?.length) {
    fc = salvo.fc;
  } else {
    const t = getTalhoes().find(x => x.id === talhaoId);
    if (!t?.zonasGeojson) return [];
    try { fc = JSON.parse(t.zonasGeojson) as GeoJSON.FeatureCollection; } catch { return []; }
  }

  return fc.features
    .filter(f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'))
    .map(f => {
      const p = (f.properties ?? {}) as { id?: string; classe?: string };
      return {
        id: String(p.id ?? '?'),
        classe: String(p.classe ?? ''),
        geometry: f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id, 'pt-BR', { numeric: true }));
}
