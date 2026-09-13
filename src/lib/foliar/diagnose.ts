// DIAGNOSE FOLIAR — o orquestrador dos quatro métodos.
//
// REGRA QUE MANDA NESTE ARQUIVO (ledger 17): **nunca inventar número**. Cada
// método devolve `null` + um `motivo` em texto quando não pode rodar, e o
// motivo é o que a tela mostra. Um DRIS com todos os índices em zero por falta
// de norma seria indistinguível, na tela, de uma planta perfeitamente
// equilibrada — o erro mais caro que este módulo pode cometer.
//
// O QUE ACONTECE SEM NORMA:
//   · DRIS  → null, "sem norma para esta cultura/órgão"
//   · CND   → null, mesmo motivo (precisa das estatísticas clr da referência)
//   · Faixa → só roda se a norma trouxer `faixas`
//   · ChM   → só roda se a norma trouxer `chance`
//   · Consenso → lista completa dos 11 nutrientes com `consenso: null`, porque
//     sumir da tela esconde o buraco em vez de declará-lo.
//
// AS LIMITAÇÕES DO MÉTODO VIAJAM JUNTO COM O RESULTADO (ledger 37). Elas estão
// em `AVISOS_METODO` e entram em TODA diagnose, não numa nota de rodapé que o
// desenvolvedor da tela pode esquecer de renderizar:
//   1. os índices DRIS somam ~zero por construção — um "excesso" pode ser
//      artefato matemático de outro nutriente deficiente, não excesso real;
//   2. norma regional × universal muda o diagnóstico;
//   3. o método é sensível ao estádio e ao órgão amostrado.
//
// DUAS GUARDAS DE PROCEDÊNCIA, porque norma errada não dá erro — dá número:
//   · CULTURA. Se `opcoes.cultura` vier e não bater com `norma.cultura`, a
//     diagnose sai com aviso FORTE no topo. Uma norma de milho aplicada a soja
//     produz índices, ordem de limitação e consenso perfeitamente formados.
//   · COMPOSIÇÃO DO CND. O conjunto de nutrientes da amostra tem de ser
//     idêntico ao da norma; o motivo nomeia o que falta (ver `cnd.ts`).
//
// Módulo PURO — sem DOM, sem I/O. npm run teste:foliar

import { diagnosticarChance } from './chanceMatematica.ts';
import { calcularCnd, conferirComponentesCnd } from './cnd.ts';
import { calcularConfianca } from './confianca.ts';
import { calcularDris } from './dris.ts';
import { classificarPorFaixa } from './faixaSuficiencia.ts';
import { consensoMultiMetodo, type VotosPorMetodo } from './interpretacao.ts';
import { normalizarTeores } from './nutrientes.ts';
import {
  type DiagnoseFoliar, type EstadoNutricional, type FuncaoDris, type MetodoDiagnose,
  NUTRIENTES, type NormaDris, type NormaResumo, type NutrienteId, type Orgao,
  type TeoresParciais,
} from './tipos.ts';

export const SEM_NORMA = 'sem norma para esta cultura/órgão';

/** Limitações honestas do método, exibidas junto de todo resultado. */
export const AVISOS_METODO: string[] = [
  'Os índices DRIS somam aproximadamente zero por construção: um nutriente aparecer "em excesso" pode ser artefato de outro estar deficiente, e não excesso real na planta.',
  'Norma regional × universal muda o diagnóstico. Uma norma gerada na própria região com produtividade real é mais confiável que uma norma de artigo de outro estado.',
  'O diagnóstico é sensível ao ESTÁDIO e ao ÓRGÃO amostrados. Trifólio com e sem pecíolo não são intercambiáveis — a norma só vale no órgão em que foi gerada.',
  'A ordem de limitação indica desequilíbrio, não garante resposta agronômica à adubação: confirme a campo antes de mudar o programa nutricional.',
];

export interface OpcoesDiagnose {
  /** Função f do DRIS. Padrão: Alvarez V. & Leite (1999). */
  funcao?: FuncaoDris;
  /** Órgão da amostra — entra no índice de confiança (penalidade forte se divergir). */
  orgaoAmostra?: Orgao | null;
  estadioAmostra?: string | null;
  produtividadeKgha?: number | null;
  /**
   * Cultura da AMOSTRA. Quando informada e diferente da cultura da norma, a
   * diagnose sai com aviso forte — ver `culturaDivergente`.
   */
  cultura?: string | null;
}

/** Compara culturas ignorando caixa, acento, plural simples e pontuação. */
function mesmaCultura(a?: string | null, b?: string | null): boolean | null {
  if (!a || !b) return null;                        // desconhecido não acusa nada
  const k = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '').replace(/s$/, '');
  const ka = k(a), kb = k(b);
  if (!ka || !kb) return null;
  return ka === kb;
}

function resumoDaNorma(n: NormaDris): NormaResumo {
  return {
    id: n.id, versao: n.versao, cultura: n.cultura, orgao: n.orgao,
    estadio: n.estadio, fonte: n.fonte, origem: n.origem, n: n.n,
  };
}

/**
 * Diagnostica uma amostra contra uma norma (ou contra norma nenhuma).
 * NUNCA lança: entrada impossível vira `motivo` textual.
 */
export function diagnosticar(
  teoresEntrada: TeoresParciais,
  norma: NormaDris | null | undefined,
  opcoes: OpcoesDiagnose = {},
): DiagnoseFoliar {
  const teores = normalizarTeores(teoresEntrada);
  const funcao = opcoes.funcao ?? 'alvarez-leite';
  const avisos: string[] = [];

  // ── DRIS ──────────────────────────────────────────────────────────────────
  let dris = null as DiagnoseFoliar['dris'];
  let drisMotivo: string | null = null;
  if (!norma || !norma.pares || !norma.pares.length) {
    drisMotivo = SEM_NORMA;
  } else {
    dris = calcularDris(teores, norma, funcao);
    if (!dris) drisMotivo = 'a norma tem pares, mas nenhum pôde ser calculado com os nutrientes deste laudo';
  }

  // ── CND ───────────────────────────────────────────────────────────────────
  let cnd = null as DiagnoseFoliar['cnd'];
  let cndMotivo: string | null = null;
  if (!norma || !norma.cnd) {
    cndMotivo = !norma ? SEM_NORMA : 'a norma não traz as estatísticas clr da população de referência';
  } else {
    // O conjunto de componentes é conferido ANTES, para que o motivo diga QUAL
    // nutriente falta em vez de um genérico "não foi possível" (ledger 5 e 17).
    const incompativel = conferirComponentesCnd(teores, norma.cnd);
    if (incompativel) {
      cndMotivo = incompativel;
    } else {
      cnd = calcularCnd(teores, norma);
      if (!cnd) cndMotivo = 'não foi possível fechar a composição da amostra (resíduo ≤ 0) ou não há nutriente com estatística clr na norma';
    }
  }

  // ── Faixa de suficiência ──────────────────────────────────────────────────
  let faixa = null as DiagnoseFoliar['faixa'];
  let faixaMotivo: string | null = null;
  if (!norma || !norma.faixas) {
    faixaMotivo = !norma ? SEM_NORMA : 'a norma não traz faixas de suficiência';
  } else {
    faixa = classificarPorFaixa(teores, norma);
    if (!faixa) faixaMotivo = 'nenhum nutriente do laudo tem faixa publicada nesta norma';
  }

  // ── Chance matemática ─────────────────────────────────────────────────────
  let chance = null as DiagnoseFoliar['chance'];
  let chanceMotivo: string | null = null;
  if (!norma || !norma.chance) {
    chanceMotivo = !norma ? SEM_NORMA : 'a norma não traz chance matemática (exige população com teor × produtividade)';
  } else {
    chance = diagnosticarChance(teores, norma.chance);
    if (!chance) chanceMotivo = 'nenhum nutriente do laudo tem chance matemática calculada nesta norma';
  }

  // ── Consenso ──────────────────────────────────────────────────────────────
  const votos: VotosPorMetodo = {};
  if (dris) {
    const v: Partial<Record<NutrienteId, EstadoNutricional>> = {};
    for (const i of dris.indices) v[i.nutriente] = i.estado;
    votos.dris = v;
  }
  if (cnd) {
    const v: Partial<Record<NutrienteId, EstadoNutricional>> = {};
    for (const i of cnd.indices) v[i.nutriente] = i.estado;
    votos.cnd = v;
  }
  if (faixa) {
    const v: Partial<Record<NutrienteId, EstadoNutricional>> = {};
    for (const i of faixa.itens) v[i.nutriente] = i.estado;
    votos.faixa = v;
  }
  if (chance) {
    const v: Partial<Record<NutrienteId, EstadoNutricional>> = {};
    for (const i of chance.itens) v[i.nutriente] = i.estado;
    votos.chance = v;
  }
  const consenso = consensoMultiMetodo(votos, NUTRIENTES);

  // ── Confiança ─────────────────────────────────────────────────────────────
  // A COBERTURA DE MÉTODOS sai daqui, não de dentro de `confianca.ts`: este é o
  // único ponto que sabe quem chegou a um resultado, e `votos` já foi montado
  // exatamente com os métodos não-nulos — reusá-lo evita uma segunda lista para
  // manter em dia quando um quinto método entrar. Sem esse número a nota mediria
  // só a procedência da norma e diria "Muito alta confiabilidade" numa diagnose
  // em que três dos quatro métodos não rodaram.
  const confianca = calcularConfianca({
    norma: norma ?? null,
    teores,
    orgaoAmostra: opcoes.orgaoAmostra ?? null,
    estadioAmostra: opcoes.estadioAmostra ?? null,
    produtividadeKgha: opcoes.produtividadeKgha ?? null,
    metodosComResultado: Object.keys(votos) as MetodoDiagnose[],
  });

  // ── Avisos ────────────────────────────────────────────────────────────────
  if (!norma) {
    avisos.push('Nenhuma norma carregada: DRIS e CND não foram calculados. Carregue ou gere uma norma para esta cultura e órgão.');
  } else if (norma.avisos?.length) {
    avisos.push(...norma.avisos);
  }
  // Cultura divergente: aviso FORTE e no topo da lista. A norma de milho roda
  // sobre soja sem erro nenhum — os números saem, a ordem de limitação sai, e
  // nada na tela denuncia que a referência é de outra espécie.
  if (norma && mesmaCultura(opcoes.cultura, norma.cultura) === false) {
    avisos.unshift(
      `NORMA DE OUTRA CULTURA: a norma é de ${norma.cultura} e a amostra foi informada como ${opcoes.cultura}. `
      + 'Teores de referência e razões duais são específicos da espécie — este diagnóstico NÃO deve ser usado para recomendação. Gere ou carregue uma norma da cultura da amostra.',
    );
  }
  if (cndMotivo && norma?.cnd) avisos.push(`CND não calculado — ${cndMotivo}`);
  if (dris?.avisos.length) avisos.push(...dris.avisos);
  if (cnd?.avisos.length) avisos.push(...cnd.avisos);
  if (faixa?.avisos.length) avisos.push(...faixa.avisos);
  if (chance?.avisos.length) avisos.push(...chance.avisos);
  avisos.push(...AVISOS_METODO);

  return {
    teores,
    funcao,
    norma: norma ? resumoDaNorma(norma) : null,
    dris, drisMotivo,
    cnd, cndMotivo,
    faixa, faixaMotivo,
    chance, chanceMotivo,
    consenso,
    confianca,
    avisos: [...new Set(avisos)],
  };
}
