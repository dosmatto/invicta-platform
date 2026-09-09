// FERTILIDADE POR ZONA — cada zona recebe UM valor (o da amostra daquela zona),
// sem NENHUMA interpolação, pintado com a escala da legenda.
//
// Serve o modo "Processar em zona" da aba Fertilidade: o usuário escolhe entre
// INTERPOLAR (krigagem/IDW, as ferramentas de sempre) e PROCESSAR EM ZONA —
// neste, o mapa é constante por zona. A peça central aqui é o VÍNCULO
// zona↔amostra por LOCALIZAÇÃO: o ponto de amostragem que cai dentro da zona é
// o que dá o valor dela (bindingPorPontos); a ordem só entra como fallback.
//
// Módulo PURO (sem DOM, sem store, sem I/O) — npm run teste:fertzona. Era só
// "quase" puro: arrastava `raster`/`fertilidade`/`store` por causa de duas
// funções que ninguém chamava (a aba tem a própria `fcLabelsZona`), e por isso
// não rodava em Node — o caminho da fertilidade por zona ficava sem UM teste.
// A rasterização/cor continua em `recomendacao/zonasGrid` e `lib/raster`.

import { dentroGeom, type ZonaValor } from '../recomendacao/zonasGrid.ts';
import type { ImportacaoLab } from '../store';

export interface ZonaGeom { id: string; classe: string; geometry: GeoJSON.Geometry }

/** Zonas do talhão a partir do zoneamento PADRÃO (snapshot em talhao.zonasGeojson).
 *  Mesma leitura da Fertilidade e da Recomendação — os `id` casam no app todo. */
export function lerZonasDoTalhao(zonasGeojson?: string): ZonaGeom[] {
  if (!zonasGeojson) return [];
  try {
    const fc = JSON.parse(zonasGeojson) as GeoJSON.FeatureCollection;
    return (fc.features ?? [])
      .filter(f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'))
      .map(f => {
        const p = (f.properties ?? {}) as { id?: string; classe?: string };
        return { id: String(p.id ?? '?'), classe: String(p.classe ?? ''), geometry: f.geometry! };
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  } catch { return []; }
}

/** Vínculo automático zona → nº da amostra, pela ORDEM (1ª zona ↔ menor número).
 *  É só a sugestão inicial; a tabela deixa o usuário corrigir. */
export function bindingAuto(zonas: ZonaGeom[], numeros: number[]): Record<string, number> {
  const nums = [...new Set(numeros)].sort((a, b) => a - b);
  const init: Record<string, number> = {};
  zonas.forEach((z, i) => { init[z.id] = nums[i] ?? nums[nums.length - 1] ?? 0; });
  return init;
}

/**
 * Vínculo zona → nº da amostra pela LOCALIZAÇÃO do ponto de amostragem: o ponto
 * que cai DENTRO da zona é a amostra dela — é o que "preencher com o valor do
 * ponto" significa no campo. Regras:
 *   • só entram pontos cujo número TEM resultado no laudo;
 *   • cada amostra serve UMA zona (a primeira que a contém); com mais de um
 *     ponto na zona, vale o de menor número ainda livre — determinístico;
 *   • zona sem ponto dentro cai no fallback pela ORDEM (números restantes).
 * A tabela da tela continua editável por cima desta sugestão.
 */
export function bindingPorPontos(
  zonas: ZonaGeom[],
  pontos: { numero: number; lng: number; lat: number }[],
  numerosComDado: number[],
): Record<string, number> {
  const comDado = new Set(numerosComDado);
  const pts = pontos.filter(p => comDado.has(p.numero)).sort((a, b) => a.numero - b.numero);
  const init: Record<string, number> = {};
  const usados = new Set<number>();
  for (const z of zonas) {
    const dentro = pts.find(p => !usados.has(p.numero) && dentroGeom(z.geometry, p.lng, p.lat));
    if (dentro) { init[z.id] = dentro.numero; usados.add(dentro.numero); }
  }
  // fallback pela ordem para zonas que ficaram sem ponto dentro
  const livres = [...comDado].sort((a, b) => a - b).filter(n => !usados.has(n));
  let i = 0;
  const ultimo = [...comDado].sort((a, b) => a - b).pop() ?? 0;
  for (const z of zonas) {
    if (init[z.id] == null) init[z.id] = livres[i++] ?? ultimo;
  }
  return init;
}

/** Valor de UMA zona: o resultado do laudo no número de amostra vinculado.
 *
 *  A LINHA ESCOLHIDA É A QUE TEM O NUTRIENTE — mesma regra da interpolação
 *  (`pontosDe`, em FertilidadeSection, filtra por `valores[nut] != null`). Antes
 *  aqui era `find(numero && profundidade)` e pronto: a PRIMEIRA linha daquele
 *  ponto vencia, tivesse ou não o nutriente pedido. Num laudo com mais de uma
 *  linha por número+profundidade — macro e micro chegando em protocolos
 *  diferentes, que é o que impede a fusão em lab.ts (a chave de fusão é o
 *  protocolo quando ele existe) — a zona caía na linha sem Ca/Mg/K, onde
 *  `calcularDerivados` APAGA o `t`, e a CTCe da zona virava NaN: a zona sumia do
 *  mapa ("nenhuma zona com valor") enquanto a interpolação, olhando as mesmas
 *  amostras, desenhava tudo. Zona de manejo NÃO interpola — ela traz o valor
 *  absoluto da amostra —, mas de QUAL amostra ela lê tem de ser a mesma conta.
 */
export function valorZona(
  imp: ImportacaoLab, mapaZonaNumero: Record<string, number>, zonaId: string, nut: string, prof: string,
): number {
  const num = mapaZonaNumero[zonaId];
  const r = imp.resultados.find(
    x => x.numero === num && x.profundidade === prof && x.valores[nut] != null && isFinite(x.valores[nut]),
  );
  const v = r?.valores[nut];
  return v != null && isFinite(v) ? v : NaN;
}

/** Zonas COM valor finito (as sem valor não entram — ficam transparentes). */
export function zonasComValor(
  zonas: ZonaGeom[], imp: ImportacaoLab, mapaZonaNumero: Record<string, number>, nut: string, prof: string,
): ZonaValor[] {
  return zonas
    .map(z => ({ id: z.id, geometry: z.geometry, valor: valorZona(imp, mapaZonaNumero, z.id, nut, prof) }))
    .filter(z => isFinite(z.valor));
}

/** As DIVISAS das zonas como linhas — desenhadas por cima do raster para cada
 *  zona aparecer separada no mapa por zona (anéis externos e furos). */
export function divisasDasZonas(zonas: ZonaGeom[]): GeoJSON.Feature[] {
  const feats: GeoJSON.Feature[] = [];
  for (const z of zonas) {
    const polys = z.geometry.type === 'Polygon' ? [z.geometry.coordinates]
      : z.geometry.type === 'MultiPolygon' ? z.geometry.coordinates : [];
    for (const rings of polys) {
      for (const ring of rings) {
        feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: ring }, properties: {} });
      }
    }
  }
  return feats;
}
