// VOLUMES POR ZONA — a prévia que responde "quanto produto vai para cada zona".
//
// A aba Recomendações desenha o mapa da dose e diz a tonelagem do talhão inteiro,
// mas quem organiza a logística precisa do número POR ZONA: taxa, área e volume.
// Este módulo monta essa tabela a partir do que o cenário já tem, sem inventar
// nada:
//
//   • ORIGEM 'laudo' — a dose traz `porZona` (modo "Por zona de manejo"): a taxa
//     é a exata, calculada direto da equação com o laudo da zona, e o volume é
//     taxa × área da zona.
//   • ORIGEM 'mapa' — a dose foi calculada nos mapas interpolados (não há
//     `porZona`): a taxa de cada zona é a MÉDIA PONDERADA dos pixels do mapa da
//     dose cujo centro cai dentro dela, com o mesmo peso de cobertura que a
//     tonelagem do cenário usa. Quando a Fertilidade foi processada em zona o
//     mapa é chapado e a média é o próprio valor da zona; num mapa interpolado a
//     zona varia por dentro, e a faixa (min–max) é mostrada para ninguém tomar
//     a média por taxa fixa.
//
// Isto NÃO é o detector de "mapa chapado = por zona" que existiu na v2.63 e foi
// removido (ver dosePorZona.ts): aqui nada muda de modo, de arquivo nem de
// cálculo — é uma leitura do mapa que já está na tela, e a tabela diz de onde
// veio. Quem quer a taxa exata por zona (e o Shapefile por polígono) continua
// escolhendo "Por zona de manejo".
//
// ÁREA DAS ZONAS: fatiada da área do talhão (`fatiarArea`), a mesma régua do
// painel de Zonas e da Prescrição — a soma das zonas bate com o talhão, e o
// número que o agrônomo vê aqui é o mesmo que ele vê lá.
//
// Módulo PURO (sem React, sem nuvem). npm run teste:volzona

import { coberturaDoGrid } from './cobertura.ts';
import { dentroGeom } from './zonasGrid.ts';
import { decodeGrid, type Grid } from '../fertilidade.ts';
import { areaHaGeo, fatiarArea } from '../areaGeo.ts';
import type { ZonaGeom } from './dosePorZona.ts';

export interface VolumeDaZona {
  rotulo: string;
  /** hectares da zona, fatiados da área do talhão */
  areaHa: number;
  /** taxa na unidade da dose — exata (laudo) ou média ponderada (mapa); null = sem valor */
  dose: number | null;
  /** faixa da dose dentro da zona (só faz sentido na origem 'mapa') */
  min: number | null;
  max: number | null;
  /** a dose muda dentro da zona (mapa interpolado, não chapado) */
  varia: boolean;
  /** toneladas de produto para a zona (dose × área, convertida de kg quando preciso) */
  toneladas: number | null;
}

export interface VolumesPorZona {
  origem: 'laudo' | 'mapa';
  zonas: VolumeDaZona[];
  /** soma das zonas com valor */
  totalToneladas: number;
  totalAreaHa: number;
  /** zonas sem dose (faltou laudo, ou nenhum pixel do mapa caiu dentro) */
  semDose: string[];
}

export interface EntradaVolumes {
  /** zonas JÁ agrupadas por rótulo (agruparPorRotulo) — uma linha por zona */
  zonas: ZonaGeom[];
  areaTalhaoHa: number;
  /** unidade da dose ('kg/ha', 't/ha'…) — decide a conversão para toneladas */
  unidade: string;
  /** taxa exata por zona, quando o cenário foi feito por zona */
  porZona?: { rotulo: string; dose: number }[] | null;
  /** mapa da dose (modo interpolado) — lido só quando não há `porZona` */
  grid?: Grid | null;
  bounds?: [number, number, number, number] | null;
  /** contorno do talhão — peso de cobertura de cada pixel (o mesmo da tonelagem) */
  poligono?: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
}

/**
 * Diferença acima da qual a dose "varia" dentro da zona — o mesmo limiar da
 * lista de doses da tela (0,5 kg/ha), levado para a unidade da dose: em t/ha
 * 0,5 seria meia tonelada por hectare e nada nunca "variaria".
 */
function limiarVariacao(unidade: string): number {
  return ehTonelada(unidade) ? 0.0005 : 0.5;
}

function ehTonelada(unidade: string): boolean {
  return /t\/ha|ton/i.test(unidade || '');
}

/** [oeste, sul, leste, norte] de uma geometria — pré-filtro barato antes do ponto-em-polígono. */
function bboxDe(g: GeoJSON.Geometry): [number, number, number, number] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  for (const rings of polys) for (const ring of rings) for (const [x, y] of ring) {
    if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y;
  }
  return [w, s, e, n];
}

function paraToneladas(dose: number, areaHa: number, unidade: string): number {
  return ehTonelada(unidade) ? dose * areaHa : (dose * areaHa) / 1000;
}

function areasFatiadas(zonas: ZonaGeom[], areaTalhaoHa: number): number[] {
  return fatiarArea(zonas.map(z => areaHaGeo(z.geometry)), areaTalhaoHa);
}

/**
 * A tabela de volumes por zona, ou null quando não há como montá-la (sem zonas,
 * ou sem `porZona` E sem mapa).
 */
export function volumesPorZona(e: EntradaVolumes): VolumesPorZona | null {
  const zonas = e.zonas.filter(z => z.geometry && (z.geometry.type === 'Polygon' || z.geometry.type === 'MultiPolygon'));
  if (zonas.length === 0) return null;
  const areas = areasFatiadas(zonas, e.areaTalhaoHa);

  // ── ORIGEM LAUDO: taxa exata, vinda da equação ──────────────────────────
  if (e.porZona && e.porZona.length > 0) {
    const taxa = new Map(e.porZona.map(z => [z.rotulo, z.dose]));
    const linhas = zonas.map((z, i) => {
      const d = taxa.get(z.rotulo);
      const dose = typeof d === 'number' && Number.isFinite(d) ? d : null;
      return {
        rotulo: z.rotulo, areaHa: areas[i], dose, min: dose, max: dose, varia: false,
        toneladas: dose == null ? null : paraToneladas(dose, areas[i], e.unidade),
      };
    });
    return fechar('laudo', linhas);
  }

  // ── ORIGEM MAPA: média ponderada dos pixels de cada zona ────────────────
  if (!e.grid || !e.bounds) return null;
  const { valores, rows, cols } = decodeGrid(e.grid);
  const [w, s, ea, n] = e.bounds;
  if (!(rows > 0 && cols > 0) || !(ea > w) || !(n > s)) return null;
  // Sem contorno, todo pixel com valor pesa 1 — pior que o peso de cobertura,
  // mas ainda é a leitura honesta do mapa.
  const pesos = e.poligono ? coberturaDoGrid([rows, cols], e.bounds, e.poligono) : null;
  const dx = cols > 1 ? (ea - w) / (cols - 1) : (ea - w);
  const dy = rows > 1 ? (n - s) / (rows - 1) : (n - s);

  const soma = new Float64Array(zonas.length);
  const peso = new Float64Array(zonas.length);
  const mins = new Array<number>(zonas.length).fill(Infinity);
  const maxs = new Array<number>(zonas.length).fill(-Infinity);
  // Caixa de cada zona: o ponto-em-polígono percorre TODOS os vértices da zona
  // (milhares, num contorno vindo de similaridade) e roda num useMemo síncrono —
  // sem este pré-filtro um grid de 280×280 com 6 zonas grandes levava ~2 s
  // travando a tela a cada troca de dose. Fora da caixa, nem testa.
  const caixas = zonas.map(z => bboxDe(z.geometry));
  const limiar = limiarVariacao(e.unidade);
  for (let r = 0; r < rows; r++) {
    const cy = n - r * dy;     // linha 0 = norte, mesma convenção do grid
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const v = valores[i];
      if (!Number.isFinite(v)) continue;
      const pw = pesos ? pesos[i] : 1;
      if (!(pw > 0)) continue;
      const cx = w + c * dx;
      // O pixel pertence à zona que contém o seu CENTRO — um pixel, uma zona,
      // nunca contado duas vezes. (`agruparPorRotulo` já juntou as manchas de
      // um mesmo rótulo, então a primeira zona que contém o ponto é a única.)
      for (let k = 0; k < zonas.length; k++) {
        const [bw, bs, be, bn] = caixas[k];
        if (cx < bw || cx > be || cy < bs || cy > bn) continue;
        if (!dentroGeom(zonas[k].geometry, cx, cy)) continue;
        soma[k] += v * pw; peso[k] += pw;
        if (v < mins[k]) mins[k] = v;
        if (v > maxs[k]) maxs[k] = v;
        break;
      }
    }
  }
  const linhas = zonas.map((z, i) => {
    const temPixel = peso[i] > 0;
    const dose = temPixel ? soma[i] / peso[i] : null;
    const min = temPixel ? mins[i] : null;
    const max = temPixel ? maxs[i] : null;
    return {
      rotulo: z.rotulo, areaHa: areas[i], dose, min, max,
      varia: temPixel && (maxs[i] - mins[i]) > limiar,
      toneladas: dose == null ? null : paraToneladas(dose, areas[i], e.unidade),
    };
  });
  return fechar('mapa', linhas);
}

function fechar(origem: 'laudo' | 'mapa', zonas: VolumeDaZona[]): VolumesPorZona {
  let totalToneladas = 0, totalAreaHa = 0;
  const semDose: string[] = [];
  for (const z of zonas) {
    totalAreaHa += z.areaHa;
    if (z.toneladas == null) semDose.push(z.rotulo);
    else totalToneladas += z.toneladas;
  }
  return { origem, zonas, totalToneladas, totalAreaHa, semDose };
}
