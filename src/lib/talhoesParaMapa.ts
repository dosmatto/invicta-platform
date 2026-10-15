// Talhões → FeatureCollection para a camada `talhoesFazenda` do mapa (a mesma
// extração que o FazendaDetailPanel faz ao abrir uma fazenda: aceita
// FeatureCollection, Feature, geometria direta e GeometryCollection; ignora
// geojson inválido). Usado pelo "Acessar a plataforma" do portal, que põe TODAS
// as áreas do produtor no mapa de uma vez.

export interface TalhaoParaMapa { id: string; nome: string; areaHa: number; geojson?: string | null }

export function featuresDosTalhoes(talhoes: TalhaoParaMapa[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const t of talhoes) {
    if (!t.geojson) continue;
    let obj: unknown;
    try { obj = JSON.parse(t.geojson); } catch { continue; }
    const geoms: GeoJSON.Geometry[] = [];
    const visitGeom = (g: GeoJSON.Geometry | null | undefined) => {
      if (!g) return;
      if (g.type === 'Polygon' || g.type === 'MultiPolygon') geoms.push(g);
      else if (g.type === 'GeometryCollection') g.geometries.forEach(visitGeom);
    };
    const o = obj as { type?: string; features?: { geometry?: GeoJSON.Geometry }[]; geometry?: GeoJSON.Geometry };
    if (o?.type === 'FeatureCollection' && Array.isArray(o.features)) o.features.forEach(f => visitGeom(f?.geometry));
    else if (o?.type === 'Feature') visitGeom(o.geometry);
    else visitGeom(obj as GeoJSON.Geometry);
    for (const g of geoms) features.push({ type: 'Feature', properties: { talhaoId: t.id, nome: t.nome, area: t.areaHa }, geometry: g });
  }
  return { type: 'FeatureCollection', features };
}
