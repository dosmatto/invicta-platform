// Talhão em PARTES — e quais delas ficaram sem amostra no laudo.
//
// Um talhão pode ser um multipolígono: duas ou mais áreas separadas que são o
// mesmo talhão. A krigagem cobre todas elas (a máscara do backend usa o polígono
// inteiro), mas onde não há amostra dentro do alcance do variograma ela prediz a
// MÉDIA — e o mapa sai com uma cor chapada, do mesmo jeito que sairia um dado
// medido. Quem olha não tem como distinguir.
//
// Caso que motivou (talhão WNOCG 06): o laudo trouxe 34 amostras e faltaram
// exatamente os números 4, 5, 17-22, 38 e 39 — os dez pontos da área separada.
// O casamento amostra↔ponto estava certo, a geometria chegou inteira ao servidor;
// o que não existia era o dado. Nenhuma camada do app percebia isso, porque todos
// os diagnósticos são por CONTAGEM (quantas amostras casaram) e nunca por
// COBERTURA (onde elas estão).
//
// Sem dependências de propósito — é regra pura, coberta por `npm run teste:partes`.

export interface PontoGrade { numero: number; lng: number; lat: number }

export interface ParteTalhao {
  indice: number;            // ordem da parte no multipolígono
  pontos: number[];          // números dos pontos da grade que caem nesta parte
  comAmostra: number[];      // desses, os que têm valor no laudo
  semAmostra: number[];      // desses, os que NÃO têm
}

function pontoEmAnel(lng: number, lat: number, anel: GeoJSON.Position[]): boolean {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const xi = anel[i][0], yi = anel[i][1];
    const xj = anel[j][0], yj = anel[j][1];
    const cruza = (yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi;
    if (cruza) dentro = !dentro;
  }
  return dentro;
}

/** Dentro do anel externo e fora de todos os furos. */
export function pontoEmParte(lng: number, lat: number, aneis: GeoJSON.Position[][]): boolean {
  if (!aneis.length || !pontoEmAnel(lng, lat, aneis[0])) return false;
  for (let h = 1; h < aneis.length; h++) if (pontoEmAnel(lng, lat, aneis[h])) return false;
  return true;
}

/** As partes separadas do talhão. Polygon → uma parte; MultiPolygon → uma por área. */
export function separarPartes(p: GeoJSON.Polygon | GeoJSON.MultiPolygon): GeoJSON.Position[][][] {
  return p.type === 'Polygon' ? [p.coordinates] : p.coordinates;
}

/**
 * Distribui os pontos da grade pelas partes do talhão e marca quais estão sem
 * amostra. `temAmostra` responde se aquele número tem valor no laudo, para a
 * variável e profundidade que estão sendo processadas.
 */
export function partesDoTalhao(
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  pontos: PontoGrade[],
  temAmostra: (numero: number) => boolean,
): ParteTalhao[] {
  const partes = separarPartes(poligono);
  const out: ParteTalhao[] = partes.map((_, indice) => ({ indice, pontos: [], comAmostra: [], semAmostra: [] }));
  for (const pt of pontos) {
    // Um ponto pode cair em mais de uma parte só se elas se sobrepuserem — o que
    // não acontece num talhão. A primeira que contiver resolve.
    const i = partes.findIndex(aneis => pontoEmParte(pt.lng, pt.lat, aneis));
    if (i < 0) continue;                       // ponto fora do talhão: não é assunto daqui
    out[i].pontos.push(pt.numero);
    (temAmostra(pt.numero) ? out[i].comAmostra : out[i].semAmostra).push(pt.numero);
  }
  return out;
}

/**
 * Partes que têm ponto de amostragem mas NENHUMA amostra no laudo — as que vão
 * sair chapadas no mapa. Só faz sentido avisar quando o talhão tem mais de uma
 * parte: com uma só, "sem amostra" já é tratado como "sem mapa".
 */
export function partesSemAmostra(partes: ParteTalhao[]): ParteTalhao[] {
  if (partes.length < 2) return [];
  return partes.filter(p => p.pontos.length > 0 && p.comAmostra.length === 0);
}
