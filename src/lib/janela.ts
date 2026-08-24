// A JANELA visível do mapa como geometria — sem dependência nenhuma.
//
// Existe porque o app tem duas perguntas diferentes sobre a mesma cena: "o que
// há DENTRO do talhão" (a análise) e "o que há em volta" (o vizinho, a mata, o
// carreador). A segunda precisa do retângulo que está na tela, e o servidor de
// satélite recebe sempre um polígono — então a janela vira um polígono aqui.
//
// Módulo separado de propósito: `msr.ts` arrasta o cliente HTTP e não carrega em
// Node, e esta conversão é justamente o tipo de coisa que erra em silêncio (um
// eixo trocado põe o GeoTIFF do outro lado do mundo sem quebrar nada).
// Coberto por `npm run teste:tiff`.

/** Limites do mapa na ordem [oeste, sul, leste, norte] — a mesma do GeoJSON. */
export type Limites = [number, number, number, number];

/** Retângulo da janela como Polygon, anel fechado começando no canto sudoeste. */
export function retanguloDe(bounds: Limites): GeoJSON.Polygon {
  const [w, s, e, n] = bounds;
  return { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] };
}
