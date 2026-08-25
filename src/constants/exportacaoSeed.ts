// Coeficientes de EXPORTAÇÃO de nutrientes pela colheita, por cultura.
//
// kg do nutriente na forma de ÓXIDO (K₂O, P₂O₅) por TONELADA de grão colhido,
// na umidade comercial de 13%. Entram como itens de escopo SISTEMA e são
// EDITÁVEIS: cada casa adota a sua referência, e a fonte vai declarada em cada
// item para o agrônomo saber o que está usando.
//
// ⚠️ Estes são valores de ORDEM DE GRANDEZA, de literatura brasileira corrente.
// Um coeficiente errado aqui não quebra nada — produz um mapa plausível e
// falso, que é o pior tipo de erro. Confira contra a fonte da casa antes de
// entregar a cliente.

import type { ConteudoExportacao } from '@/lib/biblioteca';

export const EXPORTACAO_SEED: Array<{ nome: string; conteudo: ConteudoExportacao }> = [
  {
    nome: 'Soja — grão',
    conteudo: {
      culturaId: 'soja', parteColhida: 'grão', umidadePct: 13,
      coeficientes: { n: 51, p2o5: 14, k2o: 20, s: 5.4, ca: 3, mg: 2.7 },
      fonte: 'Literatura brasileira corrente (conferir com a referência da casa)',
    },
  },
  {
    nome: 'Milho — grão',
    conteudo: {
      culturaId: 'milho', parteColhida: 'grão', umidadePct: 13,
      coeficientes: { n: 15, p2o5: 7, k2o: 5, s: 1.4, ca: 0.4, mg: 1.2 },
      fonte: 'Literatura brasileira corrente (conferir com a referência da casa)',
    },
  },
  {
    nome: 'Trigo — grão',
    conteudo: {
      culturaId: 'trigo', parteColhida: 'grão', umidadePct: 13,
      coeficientes: { n: 21, p2o5: 8, k2o: 5, s: 1.5, ca: 0.5, mg: 1.5 },
      fonte: 'Literatura brasileira corrente (conferir com a referência da casa)',
    },
  },
  {
    nome: 'Feijão — grão',
    conteudo: {
      culturaId: 'feijao', parteColhida: 'grão', umidadePct: 13,
      coeficientes: { n: 35, p2o5: 8, k2o: 15, s: 2.5, ca: 2, mg: 2 },
      fonte: 'Literatura brasileira corrente (conferir com a referência da casa)',
    },
  },
];
