// DIAGNOSE FOLIAR — contrato de tipos do módulo.
//
// Três decisões de projeto estão codificadas AQUI, não na tela, para não
// dependerem de quem desenha o dashboard:
//
//  1. NUNCA INVENTAR NORMA (ledger 17). Todo resultado de método é
//     `Resultado* | null` acompanhado de um `*Motivo: string`. Sem norma
//     carregada, o DRIS não devolve zero — devolve `null` + "sem norma para
//     esta cultura/órgão". Zero é um diagnóstico ("equilibrado"); ausência de
//     norma não é.
//  2. ÓRGÃO E ESTÁDIO FAZEM PARTE DA NORMA. Trifólio COM e SEM pecíolo não são
//     intercambiáveis — teores de N, P, B, Fe, Mn e Zn são significativamente
//     maiores sem pecíolo e o K é menor (Kurihara et al. 2013, Rev. Ceres
//     60(3)). Por isso `Orgao` e `estadio` são campos obrigatórios da
//     `NormaDris` e entram no índice de confiança como penalidade forte.
//  3. TODO MÉTODO FALA A MESMA LÍNGUA no fim. Cada um tem seu resultado
//     próprio (índice DRIS, IZ do CND, faixa, chance), mas todos colapsam para
//     `EstadoNutricional` ('deficiente' | 'adequado' | 'excessivo') para que o
//     consenso multi-método seja calculável — é a tela que nenhum concorrente
//     tem.
//
// Espelha o espírito de `src/lib/validacao/tipos.ts`: cores e rótulos ao lado
// do tipo, nada de número mágico solto no componente.
//
// Módulo PURO — sem DOM, sem I/O. npm run teste:foliar

// ── Nutrientes e órgãos ─────────────────────────────────────────────────────

/** Os 11 nutrientes do laudo foliar padrão brasileiro (macro + micro). */
export type NutrienteId = 'N' | 'P' | 'K' | 'Ca' | 'Mg' | 'S' | 'B' | 'Cu' | 'Fe' | 'Mn' | 'Zn';

/** Ordem canônica: macros na ordem da lei de Liebig-tabela de laudo, micros depois. */
export const NUTRIENTES: readonly NutrienteId[] = ['N', 'P', 'K', 'Ca', 'Mg', 'S', 'B', 'Cu', 'Fe', 'Mn', 'Zn'] as const;

/** Unidade em que cada nutriente é publicado e guardado (macro g/kg, micro mg/kg). */
export type UnidadeTeor = 'g/kg' | 'mg/kg';

/**
 * Órgão amostrado. NÃO é decorativo: a norma só vale para o órgão em que foi
 * gerada (ledger 19).
 *  - soja: 3º trifólio a partir do ápice, com ou sem pecíolo, em R1–R2
 *  - milho: folha oposta e abaixo da espiga, em VT–R1
 *  - trigo/cevada: folha bandeira no espigamento
 */
export type Orgao = 'trifolio-com-peciolo' | 'trifolio-sem-peciolo' | 'folha-espiga' | 'folha-bandeira';

export const ROTULO_ORGAO: Record<Orgao, string> = {
  'trifolio-com-peciolo': '3º trifólio COM pecíolo',
  'trifolio-sem-peciolo': '3º trifólio SEM pecíolo',
  'folha-espiga': 'Folha da espiga',
  'folha-bandeira': 'Folha bandeira',
};

/**
 * Teores da amostra. `null` = nutriente NÃO analisado — diferente de zero.
 * Um nutriente ausente sai da conta (n ajustado); um nutriente zero seria uma
 * afirmação (planta sem o elemento) que o laudo não fez.
 */
export type TeoresFoliares = Record<NutrienteId, number | null>;

/** Forma de entrada tolerante — o formulário e o CSV preenchem aos poucos. */
export type TeoresParciais = Partial<Record<NutrienteId, number | null | undefined>>;

// ── Norma ───────────────────────────────────────────────────────────────────

/**
 * Um par de nutrientes na norma, JÁ na ordem escolhida pelo teste F.
 *
 * A ordem importa: Jones e Alvarez&Leite são sensíveis a ela (Bataglia &
 * Santos 1990). O gerador escolhe A/B ou B/A pelo maior F = S²baixa/S²alta
 * (Beaufils 1973) e grava o resultado — o diagnosticador RESPEITA a ordem
 * gravada em vez de recalcular, senão duas execuções da mesma norma poderiam
 * divergir.
 */
export interface ParNorma {
  a: NutrienteId;
  b: NutrienteId;
  /** Média da razão a/b na população de referência (alta produtividade). */
  media: number;
  /** Desvio-padrão da razão na população de referência. */
  dp: number;
  /** Coeficiente de variação em % — entra em Beaufils e Elwali&Gascho. */
  cv: number;
  /** F = S²(razão)baixa / S²(razão)alta. `null` quando não houve população baixa. */
  f: number | null;
  /** nº de amostras de alta produtividade que entraram neste par. */
  nAlta?: number;
  /** nº de amostras de baixa produtividade usadas no teste F. */
  nBaixa?: number;
}

/** Estatísticas clr da população de referência, usadas pelo CND. */
export interface NormaCnd {
  /** Média de zX por componente (os 11 nutrientes + 'R' de resíduo). */
  media: Record<string, number>;
  /** Desvio-padrão de zX por componente. */
  dp: Record<string, number>;
  /**
   * Matriz de covariância INVERSA dos valores clr, para a distância de
   * Mahalanobis D². Ausente ⇒ D² devolve `null`, nunca um número inventado.
   */
  covInversa?: number[][] | null;
  /** Ordem das linhas/colunas de `covInversa`. Obrigatória se ela existir. */
  ordem?: string[];
  /** nº de amostras completas que geraram as estatísticas clr. */
  n?: number;
}

/** Faixa de suficiência de um nutriente, na unidade canônica dele. */
export interface FaixaNutriente {
  min: number;
  max: number;
}

/** Uma classe de teor na Chance Matemática (quantis da população). */
export interface ClasseChance {
  /** Índice da classe, 0 = teores mais baixos. */
  i: number;
  min: number;
  max: number;
  /** nº de amostras da população que caíram nesta classe. */
  n: number;
  /** nº dessas amostras que são de alta produtividade. */
  nAlta: number;
  /** P(alta | teor nesta classe) — frequência condicional, 0..1. */
  probAlta: number;
  /**
   * Chance Matemática de Wadt/Beverly: probAlta × (nAlta / nAltaTotal).
   * O segundo fator penaliza a classe que acerta muito mas quase não tem
   * amostra de alta — sem ele, uma classe com 1 amostra e 1 alta daria 100%.
   */
  chance: number;
}

/** Chance Matemática de um nutriente, já resolvida para classe/teor ótimos. */
export interface ChanceNutriente {
  nutriente: NutrienteId;
  classes: ClasseChance[];
  /** Índice da classe de maior `chance`. */
  classeOtima: number;
  /** Teor ótimo = média dos teores das amostras de ALTA produtividade na classe ótima. */
  teorOtimo: number;
  /** Limites da classe ótima — a faixa recomendada pelo método. */
  faixaOtima: FaixaNutriente;
  /** nº de amostras da população inteira usadas para este nutriente. */
  n: number;
}

export interface NormaChance {
  /** Corte de produtividade usado (kg/ha). */
  corteKgha: number;
  porNutriente: Partial<Record<NutrienteId, ChanceNutriente>>;
}

/**
 * Norma de diagnose. `origem` é o que separa "número do nosso banco" de
 * "número copiado de artigo" — e pesa no índice de confiança.
 */
export interface NormaDris {
  id?: string;
  versao?: number;
  cultura: string;
  orgao: Orgao;
  /** Estádio fenológico de validade (ex.: 'R1-R2', 'VT-R1'). */
  estadio: string;
  /** Citação bibliográfica ou descrição da geração. Vai para a tela. */
  fonte: string;
  origem: 'literatura' | 'gerada' | 'importada';
  /** nº de amostras da população de referência. `null` quando desconhecido. */
  n: number | null;
  /** Como a população de alta produtividade foi separada. */
  criterioCorte: string;
  /** Pares duais com média/DP/CV/F. Vazio ⇒ a norma não serve para DRIS. */
  pares: ParNorma[];
  cnd?: NormaCnd | null;
  faixas?: Partial<Record<NutrienteId, FaixaNutriente>> | null;
  chance?: NormaChance | null;
  /** Ressalvas geradas junto com a norma (n baixo, par com poucas amostras…). */
  avisos?: string[];
}

// ── Métodos e classes ───────────────────────────────────────────────────────

export type MetodoDiagnose = 'dris' | 'cnd' | 'faixa' | 'chance';

export const ROTULO_METODO: Record<MetodoDiagnose, string> = {
  dris: 'DRIS',
  cnd: 'CND',
  faixa: 'Faixa de suficiência',
  chance: 'Chance matemática',
};

/** As quatro funções f(A/B) concorrentes da literatura. */
export type FuncaoDris = 'alvarez-leite' | 'beaufils' | 'jones' | 'elwali-gascho';

export const ROTULO_FUNCAO: Record<FuncaoDris, string> = {
  'alvarez-leite': 'Alvarez V. & Leite (1999) — padrão brasileiro, C=10',
  beaufils: 'Beaufils (1973) — assimétrica, k/CV%',
  jones: 'Jones (1981) — linear, variável normal reduzida',
  'elwali-gascho': 'Elwali & Gascho (1984) — zona morta ±1 DP',
};

/**
 * Potencial de Resposta à Adubação — Wadt (1996). Cinco classes, comparando
 * |índice| com o IBNm (ver `interpretacao.ts` para a regra completa).
 */
export type ClassePRA = 'p' | 'pz' | 'z' | 'zp' | 'e';

export const ROTULO_CLASSE_PRA: Record<ClassePRA, string> = {
  p: 'Deficiente — alta chance de resposta positiva',
  pz: 'Tendência à deficiência — resposta positiva pouco provável',
  z: 'Equilibrado — resposta nula',
  zp: 'Tendência ao excesso — resposta negativa pouco provável',
  e: 'Excessivo — alta chance de resposta negativa',
};

export const COR_CLASSE_PRA: Record<ClassePRA, string> = {
  p: '#dc2626', pz: '#f59e0b', z: '#22c55e', zp: '#60a5fa', e: '#7c3aed',
};

/** A linguagem comum dos quatro métodos — sem ela não há consenso calculável. */
export type EstadoNutricional = 'deficiente' | 'adequado' | 'excessivo';

export const ROTULO_ESTADO: Record<EstadoNutricional, string> = {
  deficiente: 'Deficiente', adequado: 'Adequado', excessivo: 'Excessivo',
};

export const COR_ESTADO: Record<EstadoNutricional, string> = {
  deficiente: '#dc2626', adequado: '#22c55e', excessivo: '#7c3aed',
};

// ── Resultados por método ───────────────────────────────────────────────────

export interface IndiceNutriente {
  nutriente: NutrienteId;
  /** Índice DRIS = [Σf(A/B) − Σf(B/A)] / n. */
  indice: number;
  /** nº de funções f que entraram — pares com nutriente ausente saem da conta. */
  nPares: number;
  classe: ClassePRA;
  estado: EstadoNutricional;
  /** Posição na ordem de limitação: 1 = mais limitante (índice mais negativo). */
  ordem: number;
}

export interface ResultadoDris {
  funcao: FuncaoDris;
  indices: IndiceNutriente[];
  /** IBN = Σ|índices| — quanto maior, mais desequilibrada a planta. */
  ibn: number;
  /** IBNm = IBN / nº de nutrientes — a régua das classes de Wadt. */
  ibnm: number;
  /** Do mais limitante ao mais em excesso. */
  ordemLimitacao: NutrienteId[];
  /** nº de nutrientes que receberam índice. */
  nNutrientes: number;
  avisos: string[];
}

export interface IndiceCnd {
  nutriente: NutrienteId;
  /** zX = ln(vX / média geométrica). */
  clr: number;
  /** IZ = (zX − mX) / sX. */
  iz: number;
  classe: ClassePRA;
  estado: EstadoNutricional;
  ordem: number;
}

export interface ResultadoCnd {
  indices: IndiceCnd[];
  /** CND-r² = Σ IZ² — estado nutricional global. */
  r2: number;
  /** Média dos |IZ| — régua análoga ao IBNm para classificar por Wadt. */
  izm: number;
  /** Resíduo R = 1000 g/kg − Σ teores, o que fecha a composição. */
  residuoGkg: number;
  /** D² de Mahalanobis. `null` quando a norma não traz covariância inversa. */
  mahalanobis: number | null;
  ordemLimitacao: NutrienteId[];
  avisos: string[];
}

export interface ClassificacaoFaixa {
  nutriente: NutrienteId;
  teor: number;
  min: number;
  max: number;
  unidade: UnidadeTeor;
  estado: EstadoNutricional;
  /** Desvio % em relação ao limite MAIS PRÓXIMO. 0 dentro da faixa. */
  desvioPct: number;
}

export interface ResultadoFaixa {
  itens: ClassificacaoFaixa[];
  fonte: string;
  avisos: string[];
}

export interface DiagnosticoChance {
  nutriente: NutrienteId;
  teor: number;
  /** Posição do teor em relação à classe de maior chance de alta produtividade. */
  situacao: 'abaixo' | 'dentro' | 'acima';
  estado: EstadoNutricional;
  teorOtimo: number;
  faixaOtima: FaixaNutriente;
  /** Chance associada à classe em que o teor caiu (0..1), quando identificável. */
  chanceNaClasse: number | null;
}

export interface ResultadoChance {
  itens: DiagnosticoChance[];
  corteKgha: number;
  avisos: string[];
}

// ── Consenso e confiança ────────────────────────────────────────────────────

export interface ConsensoNutriente {
  nutriente: NutrienteId;
  porMetodo: Partial<Record<MetodoDiagnose, EstadoNutricional>>;
  /** O estado majoritário. `null` quando há empate ou nenhum método opinou. */
  consenso: EstadoNutricional | null;
  /** Fração dos métodos que opinaram e batem com a maioria. 0..1 */
  concordancia: number;
  /** Métodos que discordam da maioria — o que a matriz de concordância destaca. */
  divergentes: MetodoDiagnose[];
  /** nº de métodos que conseguiram opinar sobre este nutriente. */
  nMetodos: number;
}

export type FaixaConfianca = 'otimo' | 'bom' | 'regular' | 'ruim';

export interface ResultadoConfianca {
  /** 0..100. */
  valor: number;
  rotulo: string;
  faixa: FaixaConfianca;
  /** O componente mais fraco — o que explica o número e o que melhorar. */
  gargalo: { id: string; nome: string; escore: number };
  justificativa: string;
  componentes: Record<string, number>;
  entradas: Record<string, number | string | null>;
}

// ── Diagnose completa ───────────────────────────────────────────────────────

/** Identificação da norma copiada para dentro da diagnose (histórico não muda). */
export interface NormaResumo {
  id?: string;
  versao?: number;
  cultura: string;
  orgao: Orgao;
  estadio: string;
  fonte: string;
  origem: NormaDris['origem'];
  n: number | null;
}

export interface DiagnoseFoliar {
  teores: TeoresFoliares;
  funcao: FuncaoDris;
  norma: NormaResumo | null;

  dris: ResultadoDris | null;
  /** Por que o DRIS não saiu. Presente ⇔ `dris === null`. */
  drisMotivo: string | null;

  cnd: ResultadoCnd | null;
  cndMotivo: string | null;

  faixa: ResultadoFaixa | null;
  faixaMotivo: string | null;

  chance: ResultadoChance | null;
  chanceMotivo: string | null;

  consenso: ConsensoNutriente[];
  confianca: ResultadoConfianca | null;
  /** Limitações do método + ressalvas desta execução (ledger 37). */
  avisos: string[];
}
