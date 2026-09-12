// API pública do núcleo de Diagnose Foliar (DRIS / CND / Faixa / Chance).
//
// Existe para que a UI, a Biblioteca e o relatório importem UM lugar só e o
// núcleo possa ser reorganizado por dentro sem quebrar oito telas. Reexporta
// apenas o que é contrato — helpers internos ficam nos módulos.
//
// Camada PURA: nenhum arquivo daqui pode importar store, React ou DOM.
// Testes: npm run teste:foliar · npm run teste:foliar-normas

export * from './tipos.ts';

export {
  CATALOGO_NUTRIENTES, type Nutriente, type ColunaInterpretada, type UnidadeEntrada,
  converterParaCanonica, converterUnidade, fatorOxidoDaColuna, interpretarColuna,
  normalizarNomeNutriente, normalizarTeores, nutrientePorId, nutrientesPresentes,
  teoresEmGkg, teoresVazios, unidadeDaColuna, unidadeDe,
} from './nutrientes.ts';

export {
  chaveDoPar, chaveNaoOrientada, type ParNutrientes, paresDeNutrientes, razao, razoesDaAmostra,
} from './razoes.ts';

export { C_ALVAREZ_LEITE, C_JONES, K_BEAUFILS, calcularDris, funcaoF } from './dris.ts';

export {
  COMPONENTE_RESIDUO, type Clr, MATERIA_SECA_GKG, calcularClr, calcularCnd, mahalanobis,
} from './cnd.ts';

export { classificarPorFaixa, classificarTeor } from './faixaSuficiencia.ts';

export {
  type AmostraPopulacao, N_CLASSES_PADRAO, N_MINIMO_CHANCE, type OpcoesChance,
  PERCENTIL_CORTE_PADRAO, chanceDoNutriente, corteDeProdutividade, diagnosticarChance, gerarChance,
} from './chanceMatematica.ts';

export {
  LIMIAR_ZERO, type VotosPorMetodo, classeWadt, consensoMultiMetodo, estadoDaClasse, ordenarPorLimitacao,
} from './interpretacao.ts';

export {
  type AmostraNorma, N_MINIMO_NORMA, N_MINIMO_PAR, type OpcoesNorma,
  type ResultadoGeracao, gerarNorma,
} from './normas.ts';

export {
  type EntradaConfianca, ESCORE_ORIGEM, LIMIARES_CONFIANCA, TETO_ORGAO_DIFERENTE,
  TETO_SEM_NORMA, calcularConfianca, faixaConfianca, rotuloConfianca,
} from './confianca.ts';

export { AVISOS_METODO, type OpcoesDiagnose, SEM_NORMA, diagnosticar } from './diagnose.ts';
