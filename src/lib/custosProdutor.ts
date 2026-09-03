// CUSTOS POR PRODUTOR (e por fazenda): a camada que sobrepõe a Biblioteca.
//
// A Biblioteca guarda o preço DA CASA — um número só, para todo mundo. Mas o
// preço é negociado por cliente e muda a cada safra, e o custo da lavoura é do
// produtor, não do escritório. Antes disso, corrigir um preço para um cliente
// obrigava a mexer no cadastro global (mudando para todos) ou a redigitar o
// custo dentro de cada mapa de colheita.
//
// A REGRA, em uma linha: vazio herda, preenchido vence, e o mais específico
// ganha — biblioteca → produtor → fazenda.
//
// `0` é ZERO DE VERDADE, não "vazio": é assim que se diz "aqui não tem frete".
// Quem não quer o custo deixa o campo em branco; quem quer dizer que não custa
// nada digita 0 e o relatório soma zero. Mesma distinção que já vale entre
// equação e insumo (lib/insumos.custosDaEquacao).
//
// PERÍODO: ano + época (1º semestre = jan–jun, 2º = jul–dez), o mesmo recorte
// que o resto do app usa (lib/periodo). Registro SEM época vale para o ano
// inteiro — serve de padrão quando não há linha do semestre.
//
// Módulo PURO. npm run teste:custos-produtor

import type { Epoca } from './periodo.ts';

/** Onde o número foi encontrado. É isto que a tela e o relatório mostram. */
export type NivelCusto = 'fazenda' | 'produtor' | 'biblioteca' | 'nenhum';

/** Valores que um nível pode sobrescrever. Ausente/null = herda. */
export interface CustosNivel {
  /** R$ por tonelada do insumo. */
  precoT?: number | null;
  /** R$/ha da aplicação DESTE insumo. */
  aplicacaoHa?: number | null;
}

/** O que fica gravado para um produtor (ou fazenda) num ano/época. */
export interface CustosDoProdutor {
  id: string;
  clienteId: string;
  /** Preenchido = a linha vale só para esta fazenda; vazio = todo o produtor. */
  fazendaId?: string | null;
  ano: number;
  /** Vazio = vale para o ano inteiro (padrão dos dois semestres). */
  epoca?: Epoca | null;
  /** insumoId → valores próprios. */
  insumos?: Record<string, CustosNivel>;
  /** R$/ha de aplicação quando o insumo não tem o dele. */
  aplicacaoPadraoHa?: number | null;
  /** R$/ha da lavoura — o custo de produção que alimenta a rentabilidade. */
  custoLavouraHa?: number | null;
  atualizadoEm?: string;
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/**
 * As linhas que valem para um contexto, da MENOS para a MAIS específica —
 * ordem em que devem ser aplicadas (a última sobrescreve).
 *
 * Dentro do mesmo nível, a linha do SEMESTRE vence a do ano inteiro. Entre
 * níveis, fazenda vence produtor. Linha de OUTRA fazenda nunca entra.
 */
export function linhasAplicaveis(
  todas: readonly CustosDoProdutor[],
  ctx: { clienteId: string; fazendaId?: string | null; ano: number; epoca?: Epoca | null },
): CustosDoProdutor[] {
  const doCliente = todas.filter(l => l.clienteId === ctx.clienteId && l.ano === ctx.ano);
  const peso = (l: CustosDoProdutor): number | null => {
    const daFazenda = !!l.fazendaId;
    if (daFazenda && l.fazendaId !== ctx.fazendaId) return null;   // outra fazenda
    const doSemestre = !!l.epoca;
    if (doSemestre && l.epoca !== ctx.epoca) return null;          // outro semestre
    return (daFazenda ? 2 : 0) + (doSemestre ? 1 : 0);             // 0..3
  };
  return doCliente
    .map(l => ({ l, p: peso(l) }))
    .filter((x): x is { l: CustosDoProdutor; p: number } => x.p !== null)
    .sort((a, b) => a.p - b.p)
    .map(x => x.l);
}

export interface PrecoResolvido {
  /** R$/t. null = ninguém sabe o preço (≠ 0, que seria "de graça"). */
  precoT: number | null;
  /** R$/ha da aplicação. Sempre um número: sem ninguém declarando, é 0. */
  aplicacaoHa: number;
  fonte: { preco: NivelCusto; aplicacao: NivelCusto };
}

/**
 * Preço e aplicação de UM insumo no contexto, já resolvidos.
 *
 * `daBiblioteca` é o cadastro global (o preço da casa). Os níveis seguintes
 * sobrescrevem campo a campo — sobrescrever preço não obriga a redigitar a
 * aplicação, e vice-versa.
 */
export function precoDoInsumo(
  insumoId: string,
  daBiblioteca: { precoT?: number | null; aplicacaoHa?: number | null },
  linhas: readonly CustosDoProdutor[],
): PrecoResolvido {
  let precoT = num(daBiblioteca.precoT);
  let fontePreco: NivelCusto = precoT != null ? 'biblioteca' : 'nenhum';
  let aplic = num(daBiblioteca.aplicacaoHa);
  let fonteAplic: NivelCusto = aplic != null ? 'biblioteca' : 'nenhum';

  for (const l of linhas) {
    const nivel: NivelCusto = l.fazendaId ? 'fazenda' : 'produtor';
    const proprio = l.insumos?.[insumoId];
    const p = num(proprio?.precoT);
    if (p != null) { precoT = p; fontePreco = nivel; }
    const a = num(proprio?.aplicacaoHa);
    if (a != null) { aplic = a; fonteAplic = nivel; }
    // Aplicação PADRÃO do nível: só vale para insumo que não declarou a dele.
    const padrao = num(l.aplicacaoPadraoHa);
    if (padrao != null && a == null && num(proprio?.aplicacaoHa) == null) {
      aplic = padrao; fonteAplic = nivel;
    }
  }
  return { precoT, aplicacaoHa: aplic ?? 0, fonte: { preco: fontePreco, aplicacao: fonteAplic } };
}

/** Custo da lavoura (R$/ha) do contexto. null = não informado. */
export function custoLavoura(
  linhas: readonly CustosDoProdutor[],
): { custoHa: number | null; fonte: NivelCusto } {
  let custoHa: number | null = null;
  let fonte: NivelCusto = 'nenhum';
  for (const l of linhas) {
    const v = num(l.custoLavouraHa);
    if (v != null) { custoHa = v; fonte = l.fazendaId ? 'fazenda' : 'produtor'; }
  }
  return { custoHa, fonte };
}

export const ROTULO_NIVEL: Record<NivelCusto, string> = {
  fazenda: 'da fazenda', produtor: 'do produtor', biblioteca: 'da biblioteca', nenhum: 'não informado',
};
