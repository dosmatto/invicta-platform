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
// Módulo PURO — sem DOM, sem I/O. npm run teste:foliar

import { diagnosticarChance } from './chanceMatematica.ts';
import { calcularCnd } from './cnd.ts';
import { calcularConfianca } from './confianca.ts';
import { calcularDris } from './dris.ts';
import { classificarPorFaixa } from './faixaSuficiencia.ts';
import { consensoMultiMetodo, type VotosPorMetodo } from './interpretacao.ts';
import { normalizarTeores } from './nutrientes.ts';
import {
  type DiagnoseFoliar, type EstadoNutricional, type FuncaoDris, NUTRIENTES,
  type NormaDris, type NormaResumo, type NutrienteId, type Orgao, type TeoresParciais,
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
    cnd = calcularCnd(teores, norma);
    if (!cnd) cndMotivo = 'não foi possível fechar a composição da amostra (resíduo ≤ 0) ou não há nutriente com estatística clr na norma';
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
  const confianca = calcularConfianca({
    norma: norma ?? null,
    teores,
    orgaoAmostra: opcoes.orgaoAmostra ?? null,
    estadioAmostra: opcoes.estadioAmostra ?? null,
    produtividadeKgha: opcoes.produtividadeKgha ?? null,
  });

  // ── Avisos ────────────────────────────────────────────────────────────────
  if (!norma) {
    avisos.push('Nenhuma norma carregada: DRIS e CND não foram calculados. Carregue ou gere uma norma para esta cultura e órgão.');
  } else if (norma.avisos?.length) {
    avisos.push(...norma.avisos);
  }
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
