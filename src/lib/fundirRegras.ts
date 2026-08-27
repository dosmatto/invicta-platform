// REGRAS PURAS da FUSÃO de dois talhões — pendência 19.
//
// Sem estado e sem store (espelha partesTalhao.ts e desmembrarRegras.ts): roda
// em `npm run teste:fundir` sem navegador. As gravações ficam em fundirTalhoes.ts.
//
// O caso real: uma área cadastrada como "05A" que é, na verdade, parte do talhão
// "05". Fundir é o inverso da separação da v2.82.0 — e traz o mesmo perigo, com
// o sinal trocado: aqui os números de amostra das duas grades COLIDEM (cada uma
// começou no 1), e duas amostras "1" na mesma grade fazem o laudo casar valor no
// ponto errado.
//
// Duas chaves distintas precisam ficar únicas na grade fundida, e por motivos
// diferentes:
//   • `numero` — é o que o laboratório devolve no laudo (eloGrade.ts);
//   • `ordem`  — é a chave das coletas de campo, `${gradeId}__${ordem}` (coleta.ts).
// Renumerar uma sem a outra deixa a caminhada apontando para o ponto errado.

import union from '@turf/union';

export interface PontoFundivel {
  ordem: number;
  numero?: number;
  numeroAnterior?: number;   // preenchido quando a fusão renumerou este ponto
  lng: number;
  lat: number;
}

export function numeroDe(p: PontoFundivel): number {
  return p.numero ?? p.ordem + 1;
}

// ── Geometria ──────────────────────────────────────────────────────────────

/**
 * Une as partes de dois talhões. Quando os polígonos se ENCOSTAM o turf
 * dissolve a divisa e devolve uma área só — que é o que "05 + 05A viram o
 * talhão 05" significa para quem olha o mapa. Quando estão separados, o
 * resultado é multipolígono e o talhão passa a ter duas áreas (a gaveta da
 * v2.81.0 mostra cada uma).
 *
 * Devolve `null` se a união falhar — geometria inválida existe, e é melhor
 * recusar a fusão do que gravar um polígono quebrado por cima do cadastro.
 */
export function unirPartes(
  a: GeoJSON.Position[][][], b: GeoJSON.Position[][][],
): { partes: GeoJSON.Position[][][]; dissolveu: boolean } | null {
  const todas = [...a, ...b];
  if (todas.length === 0) return null;
  const fc: GeoJSON.FeatureCollection<GeoJSON.Polygon> = {
    type: 'FeatureCollection',
    features: todas.map(coordinates => ({
      type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates },
    })),
  };
  let u: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null = null;
  try { u = union(fc); } catch { return null; }
  if (!u?.geometry) return null;
  const partes = u.geometry.type === 'Polygon' ? [u.geometry.coordinates] : u.geometry.coordinates;
  if (partes.length === 0) return null;
  return { partes, dissolveu: partes.length < todas.length };
}

// ── Numeração ──────────────────────────────────────────────────────────────

/** Menor inteiro > que todos os usados — onde a renumeração começa. */
function proximoLivre(usados: Set<number>): number {
  let n = 0;
  for (const u of usados) if (u > n) n = u;
  return n + 1;
}

export interface RemapPonto { ordem: number; numeroDe: number; numeroPara: number; ordemDe: number; ordemPara: number }

export interface FusaoDeGrade<T extends PontoFundivel = PontoFundivel> {
  pontos: T[];                  // grade fundida, ordenada por número
  remapeados: RemapPonto[];     // só os que precisaram mudar
  colidiuNumero: number[];      // números que já existiam na grade hospedeira
}

/**
 * Funde os pontos de duas grades. Os pontos do HOSPEDEIRO nunca mudam — a grade
 * dele é a que fica, e mexer nela seria mexer no que já está certo. Só o
 * visitante é renumerado, e SÓ nos números que colidem: se a grade que chega já
 * usa 41-52, nada muda em ninguém.
 *
 * Cada ponto renumerado guarda o `numeroAnterior`, para a etiqueta impressa
 * continuar rastreável depois da fusão.
 */
export function fundirGrades<T extends PontoFundivel>(hospedeiro: T[], visitante: T[]): FusaoDeGrade<T> {
  const numsUsados = new Set(hospedeiro.map(numeroDe));
  const ordensUsadas = new Set(hospedeiro.map(p => p.ordem));
  const colidiuNumero: number[] = [];
  const remapeados: RemapPonto[] = [];
  const novos: T[] = [];

  for (const p of visitante) {
    const nAtual = numeroDe(p), oAtual = p.ordem;
    const precisaNum = numsUsados.has(nAtual);
    const precisaOrdem = ordensUsadas.has(oAtual);
    if (precisaNum) colidiuNumero.push(nAtual);
    const nNovo = precisaNum ? proximoLivre(numsUsados) : nAtual;
    const oNovo = precisaOrdem ? proximoLivre(ordensUsadas) : oAtual;
    numsUsados.add(nNovo);
    ordensUsadas.add(oNovo);
    if (precisaNum || precisaOrdem) {
      remapeados.push({ ordem: oAtual, numeroDe: nAtual, numeroPara: nNovo, ordemDe: oAtual, ordemPara: oNovo });
      novos.push({
        ...p, numero: nNovo, ordem: oNovo,
        ...(precisaNum ? { numeroAnterior: p.numeroAnterior ?? nAtual } : {}),
      });
    } else {
      novos.push({ ...p, numero: nAtual });
    }
  }

  return {
    pontos: [...hospedeiro, ...novos].sort((x, y) => numeroDe(x) - numeroDe(y)),
    remapeados,
    colidiuNumero: [...new Set(colidiuNumero)].sort((a, b) => a - b),
  };
}

/** Aplica o remapeamento de números aos resultados de um laudo que vem junto. */
export function remapearResultados<T extends { numero: number }>(
  resultados: T[], remapeados: RemapPonto[],
): T[] {
  if (remapeados.length === 0) return resultados;
  const de = new Map(remapeados.map(r => [r.numeroDe, r.numeroPara]));
  return resultados.map(r => (de.has(r.numero) ? { ...r, numero: de.get(r.numero)! } : r));
}
