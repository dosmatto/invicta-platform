// NUMERAÇÃO DOS PONTOS DA GRADE DE ZONAS — padrão de campo `zona-sequencial`.
//
// O operador anda a zona inteira coletando sub-amostras. Numerar tudo de 1 a 50
// direto o faz perder a conta de onde está: "estou no 34" não diz em qual zona.
// Por isso cada ponto leva o número da ZONA e um sequencial DENTRO dela —
// 1-1, 1-2, … 2-1, 2-2 — como no mapa da Inceres que o campo já usa.
//
// DUAS IDENTIDADES DIFERENTES, de propósito:
//
//   `rotulo` (texto, "2-3") — o que o operador vê: app de campo, mapa, KML/SHP.
//   `numero` (NÚMERO, 2)    — o que o LABORATÓRIO recebe, e o que liga o laudo
//                             de volta ao ponto (eloGrade/pontosPorNumero).
//
// Elas não podem ser a mesma coisa: o parser do laudo tira os não-dígitos do id
// (lab.ts), então "1-1" viraria 11 — e "1-12" e "11-2" colidiriam no mesmo 112.
// O rótulo NUNCA vai para o campo numérico.
//
// O que é uma AMOSTRA depende do modelo:
//   A (composta)  — 1 amostra por ZONA: todo ponto da zona 2 leva `numero` 2,
//                   porque todos vão para o mesmo saco. O laudo volta com 4
//                   amostras (uma por zona) e casa com a zona certa.
//   B (individual) — cada ponto é uma amostra: `numero` sequencial global.
//
// Módulo PURO. npm run teste:gradezonas

import type { PontoAmostragem } from './store';

/** Número da zona a partir do rótulo que o MAPA mostra ("01" → 1, "Z3" → 3);
 *  sem dígito utilizável, usa a ordem.
 *
 *  ATENÇÃO: o que entra aqui vem de `lib/meap/rotuloZona`, nunca o `id` cru do
 *  polígono. Uma zona partida em duas manchas tem ids "01" e "01_2", e "01_2"
 *  daria "zona 12" — um número que não existe no talhão. */
export function numeroDaZona(rotulo: string, indice: number): number {
  const d = String(rotulo ?? '').replace(/\D/g, '');
  const n = d ? parseInt(d, 10) : NaN;
  // Só inteiro SEGURO: um id gigante (coluna `cod`/`fid` do arquivo do cliente)
  // vira float, dois viram o MESMO float, e o `n++` do desempate abaixo não anda
  // mais — a tela congelava em laço infinito. Fora da faixa, vale a ordem.
  return Number.isSafeInteger(n) && n > 0 ? n : indice + 1;
}

/**
 * Números das zonas, na ordem — GARANTIDAMENTE únicos.
 *
 * Dois rótulos diferentes podem querer o mesmo número ("1" e "01", ou "A" e "1"
 * caindo os dois no fallback pela ordem). Dois pontos com o mesmo rótulo é o
 * pior resultado possível: o operador não sabe qual coletou, e na composta duas
 * zonas distintas viram um saco só. Quem chega depois recebe o menor número
 * livre — determinístico e sem colisão.
 */
export function numerosDasZonas(rotulos: string[]): number[] {
  const usados = new Set<number>();
  return rotulos.map((r, i) => {
    let n = numeroDaZona(r, i);
    while (usados.has(n) && n < Number.MAX_SAFE_INTEGER) n++;
    usados.add(n);
    return n;
  });
}

/** Rótulo do ponto: `zona-sequencial` (1-1, 1-2, 2-1). Sem zero à esquerda —
 *  cabe no balão do ponto no mapa e é como o campo fala. */
export const rotuloPonto = (zonaNum: number, seq: number): string => `${zonaNum}-${seq}`;

export interface ZonaComPontos {
  /** O número da zona COMO O MAPA MOSTRA (via lib/meap/rotuloZona), nunca o
   *  `id` cru do polígono — assim o prefixo do ponto é o mesmo número que o
   *  operador lê na tela. Zona de várias manchas entra como UMA entrada só,
   *  com os pontos de todas elas: o sequencial corre pela zona inteira. */
  id: string;
  pts: { lng: number; lat: number }[];
}

/**
 * Numera os pontos de todas as zonas, na ordem em que as zonas vêm.
 * `ordem` continua o índice GLOBAL 0-based: é a chave das coletas já feitas
 * (inv_coletas usa `${gradeId}__${ordem}`), então mexer nela órfã o que o campo
 * já coletou.
 */
export function numerarPontosZonas(
  zonas: ZonaComPontos[],
  modelo: 'A' | 'B',
  profundidades: string[],
): PontoAmostragem[] {
  const out: PontoAmostragem[] = [];
  let ordem = 0;
  let amostraSeq = 0;
  const nums = numerosDasZonas(zonas.map(z => z.id));
  zonas.forEach((z, iz) => {
    const zonaNum = nums[iz];
    z.pts.forEach((p, i) => {
      const seq = i + 1;
      if (modelo === 'B') amostraSeq++;
      out.push({
        ordem: ordem++,
        numero: modelo === 'A' ? zonaNum : amostraSeq,
        zona: z.id,
        seqZona: seq,
        rotulo: rotuloPonto(zonaNum, seq),
        lng: p.lng,
        lat: p.lat,
        profs: profundidades.length,
        profundidades,
      });
    });
  });
  return out;
}

/**
 * Renumera uma lista de pontos APÓS adicionar/remover na edição manual.
 *
 * Mover um ponto preserva `ordem`/`numero` (protege as coletas já feitas no
 * campo). Adicionar ou remover, não: muda a contagem da zona, então o
 * `zona-sequencial` tem de fechar sem buraco (removi 1-2 → 1-3 vira 1-2) e um
 * ponto novo entra como o último da sua zona. Reagrupa por `zona` PRESERVANDO a
 * ordem atual (primeira aparição da zona; ordem dos pontos dentro dela) e passa
 * pelo mesmo `numerarPontosZonas` da geração — uma fonte de verdade só.
 *
 * Ponto sem `zona` (grade antiga, ou add fora de qualquer zona) cai num grupo
 * de chave vazia: continua numerado, nunca some da lista.
 */
export function renumerarPontosZonas(
  pontos: Array<Pick<PontoAmostragem, 'lng' | 'lat' | 'zona' | 'profundidades' | 'manual'>>,
  modelo: 'A' | 'B',
  profundidadesPadrao: string[],
): PontoAmostragem[] {
  const ordemZonas: string[] = [];
  const porZona = new Map<string, typeof pontos>();
  for (const p of pontos) {
    const z = p.zona ?? '';
    let g = porZona.get(z);
    if (!g) { g = []; porZona.set(z, g); ordemZonas.push(z); }
    g.push(p);
  }
  const nums = numerosDasZonas(ordemZonas);
  const out: PontoAmostragem[] = [];
  let ordem = 0;
  let amostraSeq = 0;
  ordemZonas.forEach((zid, iz) => {
    const zonaNum = nums[iz];
    porZona.get(zid)!.forEach((p, i) => {
      const seq = i + 1;
      if (modelo === 'B') amostraSeq++;
      // PRESERVA a profundidade de CADA ponto (o generate uniformiza; o RE-numerar
      // não pode — senão editar uma grade salva sem o Padrão selecionado zeraria
      // `profundidades` de todos, e o app de campo (`?? grade.profundidades`) não
      // reergue porque `[]` não é nullish → zero profundidades para coletar). Só o
      // ponto NOVO (sem profundidade) herda o padrão.
      const prof = p.profundidades && p.profundidades.length ? p.profundidades : profundidadesPadrao;
      out.push({
        ordem: ordem++,
        numero: modelo === 'A' ? zonaNum : amostraSeq,
        zona: zid,
        seqZona: seq,
        rotulo: rotuloPonto(zonaNum, seq),
        lng: p.lng,
        lat: p.lat,
        profs: prof.length,
        profundidades: prof,
        ...(p.manual ? { manual: true } : {}),
      });
    });
  });
  return out;
}

/** O que o operador vê num ponto. Grade de zonas tem rótulo; as demais seguem
 *  no número da amostra (ou a ordem, quando o número não existe). */
export const rotuloDoPonto = (p: Pick<PontoAmostragem, 'rotulo' | 'numero' | 'ordem'>): string =>
  p.rotulo ?? String(p.numero ?? p.ordem + 1);

/** As AMOSTRAS de uma grade de zonas, na ordem do laboratório.
 *  Modelo A: uma por zona (o saco composto) — numero = nº da zona.
 *  Modelo B: uma por ponto — numero sequencial, rótulo `zona-seq`. */
export function amostrasDaGrade(
  pontos: PontoAmostragem[], modelo: 'A' | 'B',
): { numero: number; rotulo: string }[] {
  if (modelo === 'B') {
    return pontos.map(p => ({ numero: p.numero ?? p.ordem + 1, rotulo: rotuloDoPonto(p) }));
  }
  const vistos = new Map<number, string>();
  for (const p of pontos) {
    const n = p.numero ?? p.ordem + 1;
    if (!vistos.has(n)) vistos.set(n, String(n).padStart(2, '0'));
  }
  return [...vistos.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([numero, rotulo]) => ({ numero, rotulo }));
}
