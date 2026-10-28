// Zoneamento salvo → feições prontas para o mapa (cor + rótulo). Regra única,
// usada pela aba Zonas (MeapSection) e pela aba Camadas — antes a Camadas tinha
// a própria versão e pintava de cinza o que a aba Zonas pintava pela posição.

import { classeReconhecida, classeZona, corZonaPorPosicao } from '@/lib/zonas';
import { rotuloZona } from '@/lib/meap/rotuloZona';

export function featuresParaMapa(fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  const feats = fc.features.filter(f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'));
  // nº de zonas oficiais distintas (p/ a rampa de cor por posição quando há >5 classes)
  const total = new Set(feats.map(f => String((f.properties as { zona?: string | number; classe?: string })?.zona ?? (f.properties as { classe?: string })?.classe ?? ''))).size;
  return {
    type: 'FeatureCollection',
    features: feats.map(f => {
      const p = (f.properties ?? {}) as { id?: string; zona?: string | number; classe?: string; cor?: string };
      const cz = classeZona(p.classe ?? '');
      // 1) cor salva na feature; 2) rampa por nº da zona quando a classe não é
      // reconhecida (Nível N); 3) cor do semáforo pela classe.
      let cor = p.cor;
      if (!cor) cor = (p.zona != null && !classeReconhecida(p.classe ?? '')) ? corZonaPorPosicao(Number(p.zona) - 1, total) : cz.cor;
      // Rótulo: regra única em lib/meap/rotuloZona — id numérico puro É o
      // número da zona (é o que a renumeração manual escreve); id sufixado
      // ("01_2") é identidade interna e quem rotula é o `zona`. Antes daqui o
      // mapa lia só `zona` e desfazia a renumeração feita no editor.
      const rotulo = rotuloZona(p);
      return { type: 'Feature' as const, properties: { cor, rotulo, classeLabel: cz.label, selecionada: false }, geometry: f.geometry! };
    }),
  };
}
