// Camada REAL do NDVI/NDRE para o mini-mapa do portal (modo "Mapas reais").
//
// Mesma leitura e colorização da aba NDVI do talhão (lib/camadasTalhao →
// grupoNdvi): NDVI com domínio fixo 0–1, os demais índices esticados p2–p98, na
// rampa contínua da legenda designada de NDVI. Só descreve O QUE carregar — o
// MiniMapa decide quando (visível, um por vez, com cache).

import { descomprimirGrid, decodeGrid, type Grid } from '@/lib/fertilidade';
import { colorirGrid } from '@/lib/raster';
import { faixaPercentis } from '@/lib/quantis';
import { rampaVisualStops, type Legenda } from '@/lib/legendas';
import type { CenaSat } from '@/lib/portalPainelSensores';
import type { CamadaReal } from '../ui';

type DocCena = { resp?: { bounds?: [number, number, number, number]; grid?: Grid } };

export function camadaNdvi(cena: CenaSat | null | undefined, legenda: Legenda | null | undefined): CamadaReal | null {
  if (!cena || !legenda) return null;
  return {
    chave: `ndvi:${cena.itemId}:${cena.atualizadoEm ?? ''}:${legenda.id}`,
    mapaId: cena.itemId,
    atualizadoEm: cena.atualizadoEm,
    colorir: async dados => {
      const resp = (dados as DocCena | null)?.resp;
      if (!resp?.grid || !resp.bounds) return null;
      let grid = resp.grid;
      if (grid.comp === 'gz') { try { grid = await descomprimirGrid(grid); } catch { return null; } }
      if (!grid.b64) return null;
      const dominio: [number, number] = cena.indice === 'NDVI' ? [0, 1] : faixaPercentis(decodeGrid(grid).valores, 2, 98);
      const stops = rampaVisualStops({ ...legenda, estilo: 'continuo' });
      return { tipo: 'raster', url: colorirGrid(grid, dominio, stops).dataUrl, bounds: resp.bounds };
    },
  };
}
