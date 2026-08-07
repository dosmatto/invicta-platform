// Qual mapa interpolado alimenta a RECOMENDAÇÃO — regra única, sem dependências.
//
// A dose sai sempre em 20 m (PDF e arquivo de máquina). Até a v2.36.0 pegávamos o
// mapa fino e fazíamos a MÉDIA de blocos 4×4. Agora a aba Fertilidade grava também
// um mapa interpolado NATIVAMENTE a 20 m, e é ele que deve ser escolhido aqui.
//
// MEDIDO (backend real, 40 pontos de K%, variograma fixo e auto): a diferença de
// DOSE entre os dois caminhos é ~1%. A superfície krigada é lisa na escala de 20 m,
// então a média de 16 pixels quase não muda o valor — não espere as doses subirem
// por causa disto. O que o mapa nativo resolve de verdade é outra coisa:
//   • a reamostragem mantinha os `bounds` do grid fino com um shape novo, o que
//     desloca o mapa em ~meio pixel grosso (o centro do bloco não é o nó do grid);
//   • o `stats` que acompanhava o grid continuava sendo o do mapa fino (pixel_m,
//     nx/ny, min/max), inconsistente com os dados ao lado;
//   • e, com dois mapas por atributo na nuvem, a escolha passou a ser EXPLÍCITA em
//     vez de "o mais recente ganha" — que é o que este arquivo garante.
//
// Módulo separado de propósito: `aplicar.ts` arrasta cloud/biblioteca e não carrega
// em Node, então esta regra ficaria sem teste. Coberto por `npm run teste:grids`.

// Resolução em que a recomendação calcula. Espelhada em FertilidadeSection
// (PIXEL_RECOMENDACAO), que é quem gera o mapa nessa resolução.
export const PIXEL_RECOMENDACAO_M = 20;

// Lê o id do mapa salvo pela aba Fertilidade, do FIM para o começo:
//   talhao__importacao__metodo__pixel__modelo__nut__prof
// Ler do fim é o que mantém a leitura estável quando um segmento novo entra no
// miolo (foi assim que `krigefixa` da v2.34.0 passou sem quebrar nada).
// Ids legados (v0.21-0.22) tinham `legenda__nut__prof` no mesmo prefixo — ali o
// campo do pixel não é numérico, e é isso que os distingue.
export function lerChaveMapa(resto: string): { chave: string; pixel?: number; metodo?: string } | null {
  const p = resto.split('__');
  if (p.length < 2) return null;
  const chave = `${p[p.length - 2]}__${p[p.length - 1]}`;
  if (p.length < 5) return { chave };
  const px = Number(p[p.length - 4]);
  if (!isFinite(px) || px <= 0) return { chave };
  return { chave, pixel: px, metodo: p[p.length - 5] };
}

export interface CandidatoMapa { id: string; tem: boolean; em: string }
export interface EscolhaMapa { indice: number; pixel?: number; metodo?: string; eh20: boolean }

// Qual mapa entra na conta, por `nut__prof`. Preferência, nesta ordem:
//   (1) tem grid  →  (2) é o de 20 m nativo  →  (3) o mais recente.
// O passo (2) é o que este arquivo existe para garantir: sem ele, um mapa fino
// reprocessado depois ganharia do de 20 m só por ser mais novo.
export function escolherMapas(prefixo: string, itens: CandidatoMapa[]): Record<string, EscolhaMapa> {
  const out: Record<string, EscolhaMapa> = {};
  itens.forEach((c, indice) => {
    const info = lerChaveMapa(c.id.startsWith(prefixo) ? c.id.slice(prefixo.length) : c.id);
    if (!info) return;
    const eh20 = info.pixel === PIXEL_RECOMENDACAO_M;
    const atual = out[info.chave];
    if (atual) {
      const anterior = itens[atual.indice];
      const trocar = (c.tem && !anterior.tem)
        || (c.tem === anterior.tem && eh20 && !atual.eh20)
        || (c.tem === anterior.tem && eh20 === atual.eh20 && c.em > anterior.em);
      if (!trocar) return;
    }
    out[info.chave] = { indice, pixel: info.pixel, metodo: info.metodo, eh20 };
  });
  return out;
}
