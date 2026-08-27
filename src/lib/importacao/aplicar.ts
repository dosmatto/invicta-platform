// DECISÕES DO USUÁRIO → REGISTROS. Puro: sem DOM, sem store, sem I/O.
//
// O plano que sai de `conferirPlanilha` é o que a MÁQUINA conseguiu deduzir.
// Aqui entram as escolhas do usuário, e daqui saem (a) os cultivos a gravar e
// (b) os dados do relatório final — o mesmo par que o pedido descreve: "o que
// foi importado e o que não foi, para poder fazer manualmente, e ter controle".
//
// As decisões são guardadas por CHAVE, não por linha. Escolher o produtor de uma
// linha resolve as outras 29 do mesmo produtor; confirmar uma subdivisão resolve
// as 22 escritas do mesmo jeito. É onde mora o ganho de tempo.

import { chave } from './texto.ts';
import type { Acao } from './identidade.ts';
import type { LinhaConferida, PlanoImportacao } from './conferencia.ts';

export type CampoDecisao = 'produtor' | 'fazenda' | 'talhao' | 'cultivar' | 'proposito' | 'cultura';

export interface Decisoes {
  /** chaveDecisao → id escolhido no cadastro. */
  produtor: Record<string, string>;
  fazenda: Record<string, string>;
  talhao: Record<string, string>;
  cultivar: Record<string, string>;
  proposito: Record<string, string>;
  /** chave do texto da planilha → nome da cultura da lista fixa. */
  cultura: Record<string, string>;
  /** Números de linha DO ARQUIVO que o usuário tirou da importação. */
  ignoradas: number[];
  /**
   * Grupos (chave de grupo) cuja repetição o usuário classificou à mão, quando
   * a planilha não deixava claro se era talhão partido ou lançamento repetido.
   */
  repeticao: Record<string, 'consorcio' | 'partes'>;
}

export const decisoesVazias = (): Decisoes => ({
  produtor: {}, fazenda: {}, talhao: {}, cultivar: {}, proposito: {}, cultura: {},
  ignoradas: [], repeticao: {},
});

export interface LinhaResolvida extends LinhaConferida {
  /** Ids finais, já com as escolhas do usuário aplicadas. */
  final: {
    produtorId: string; fazendaId: string; talhaoId: string;
    cultivarId: string; propositoId: string; cultura: string;
  };
  ignorada: boolean;
  /** Recalculada depois das decisões. */
  acaoFinal: Acao;
  bloqueiosFinais: string[];
}

/**
 * Aplica as decisões sobre o plano.
 *
 * Não recalcula casamento: `conferirPlanilha` já rodou contra o cadastro (que a
 * tela atualiza quando o usuário cadastra algo novo, disparando um replano).
 * Aqui só se resolve o que o usuário escolheu à mão e se recalcula a ação.
 */
export function aplicarDecisoes(plano: PlanoImportacao, d: Decisoes): LinhaResolvida[] {
  const ignoradas = new Set(d.ignoradas);
  return plano.linhas.map(l => {
    const produtorId = d.produtor[l.produtor.chaveDecisao] ?? l.produtor.alvo?.id ?? '';
    const kFaz = `${l.produtor.chaveDecisao}|${l.fazenda.chaveDecisao}`;
    const fazendaId = d.fazenda[kFaz] ?? l.fazenda.alvo?.id ?? '';
    const kTal = `${kFaz}|${l.talhao.chaveDecisao}`;
    const talhaoId = d.talhao[kTal] ?? l.talhao.alvo?.id ?? '';
    const cultivarId = d.cultivar[chave(l.origem.cultivar)] ?? l.cultivar.alvo?.id ?? '';
    const propositoId = d.proposito[chave(l.origem.proposito)] ?? l.proposito.alvo?.id ?? '';
    const cultura = d.cultura[chave(l.origem.cultura)] ?? l.cultura.cultura ?? '';

    const bloqueios: string[] = [];
    if (!produtorId) bloqueios.push('Produtor não resolvido.');
    if (!fazendaId) bloqueios.push('Fazenda não resolvida.');
    if (!talhaoId) bloqueios.push('Talhão não resolvido.');
    if (!l.safra) bloqueios.push(`Ano "${l.origem.safra}" não cadastrado.`);
    if (!cultura) bloqueios.push(`Cultura "${l.origem.cultura}" não resolvida.`);
    if (l.origem.cultivar && !cultivarId) bloqueios.push(`Cultivar "${l.origem.cultivar}" não resolvido.`);
    if (l.origem.proposito && !propositoId) bloqueios.push(`Propósito "${l.origem.proposito}" não resolvido.`);
    // Repetição ambígua só deixa de bloquear quando o usuário classifica.
    if (l.repeticao === 'ambiguo' && !d.repeticao[l.grupo]) {
      bloqueios.push('Talhão com duas linhas quase idênticas: diga se é talhão partido ou lançamento repetido.');
    }

    const ignorada = ignoradas.has(l.origem.linha);
    const acaoFinal: Acao = ignorada ? 'gravar'
      : bloqueios.length ? (produtorId && fazendaId && talhaoId ? 'confirmar' : 'criar')
      : 'gravar';

    return { ...l, final: { produtorId, fazendaId, talhaoId, cultivarId, propositoId, cultura }, ignorada, acaoFinal, bloqueiosFinais: bloqueios };
  });
}

export const contarPorAcao = (linhas: LinhaResolvida[]) => {
  const r = { total: linhas.length, prontas: 0, pendentes: 0, ignoradas: 0 };
  for (const l of linhas) {
    if (l.ignorada) r.ignoradas++;
    else if (l.bloqueiosFinais.length) r.pendentes++;
    else r.prontas++;
  }
  return r;
};

/** O registro que vai para `importarCultivosLote`, sem depender do tipo do store. */
export interface CultivoParaGravar {
  talhaoId: string;
  safra: string;
  epoca: '' | 'verao' | 'safrinha' | 'inverno';
  parte: string;
  ordem: number;
  cultura: string;
  culturaOrigem?: string;
  cultivarId?: string;
  cultivarNome?: string;
  propositoId?: string;
  propositoNome?: string;
  areaHa?: number;
  dataPlantio?: string;
  origem: 'importacao';
  importacaoId: string;
}

/** O cultivo mais a linha do arquivo de onde ele veio, para o relatório. */
export interface CultivoComOrigem { cultivo: CultivoParaGravar; linha: number }

/**
 * Converte as linhas prontas em cultivos.
 *
 * A `parte` sai da análise do nome do talhão ("HABPU 02 a" → "A"), e a `ordem`
 * do grupo — mas SÓ em consórcio. Em talhão partido cada parte é um cultivo com
 * ordem 1, porque são áreas diferentes; em consórcio a área é a mesma e a ordem
 * é o que distingue os dois registros.
 */
export function montarCultivos(
  linhas: LinhaResolvida[], d: Decisoes, importacaoId: string,
  nomeCultivar: (id: string) => string, nomeProposito: (id: string) => string,
): CultivoComOrigem[] {
  const out: CultivoComOrigem[] = [];
  for (const l of linhas) {
    if (l.ignorada || l.bloqueiosFinais.length) continue;
    const tipo = d.repeticao[l.grupo] ?? l.repeticao;
    const ehConsorcio = tipo === 'consorcio';
    out.push({ linha: l.origem.linha, cultivo: {
      talhaoId: l.final.talhaoId,
      safra: l.safra,
      epoca: l.epoca,
      parte: l.talhao.analise.sufixos.join(''),
      ordem: ehConsorcio ? l.ordemNoGrupo : 1,
      cultura: l.final.cultura,
      culturaOrigem: l.origem.cultura || undefined,
      cultivarId: l.final.cultivarId || undefined,
      cultivarNome: l.final.cultivarId ? nomeCultivar(l.final.cultivarId) : undefined,
      propositoId: l.final.propositoId || undefined,
      propositoNome: l.final.propositoId ? nomeProposito(l.final.propositoId) : undefined,
      areaHa: l.origem.areaHa ?? undefined,
      dataPlantio: l.origem.dataRetirada || undefined,
      origem: 'importacao',
      importacaoId,
    } });
  }
  return out;
}

// ── relatório final ────────────────────────────────────────────────────────

export interface LinhaRelatorio { [coluna: string]: string | number }

export interface Relatorio {
  importado: LinhaRelatorio[];
  naoImportado: LinhaRelatorio[];
  divergencias: LinhaRelatorio[];
}

/** Diferença de área acima disto vira linha na aba de divergências. */
export const TOLERANCIA_AREA_PCT = 2;

/**
 * Monta as abas do relatório.
 *
 * A aba de NÃO IMPORTADO é a que o pedido chama de "o que não foi, para poder
 * fazer manualmente": leva o número da linha no arquivo, tudo que veio nela e o
 * motivo em português.
 *
 * `areaDoTalhao` devolve a área geodésica do cadastro; a divergência contra a
 * área declarada na planilha é informação, não erro — talhão partido soma as
 * partes e é normal que não bata linha a linha.
 */
export function montarRelatorio(
  linhas: LinhaResolvida[], areaDoTalhao: (id: string) => number | undefined,
): Relatorio {
  const importado: LinhaRelatorio[] = [];
  const naoImportado: LinhaRelatorio[] = [];
  const divergencias: LinhaRelatorio[] = [];

  // Área declarada somada por talhão: é a soma das partes que se compara com o
  // cadastro, não cada parte isolada.
  const somaPorTalhao = new Map<string, { ha: number; linhas: number[]; nome: string }>();

  for (const l of linhas) {
    const base = {
      'Linha': l.origem.linha,
      'Produtor (planilha)': l.origem.produtor,
      'Fazenda (planilha)': l.origem.fazenda,
      'Talhão (planilha)': l.origem.talhao,
      'Área (ha)': l.origem.areaHa ?? '',
      'Cultura (planilha)': l.origem.cultura,
      'Propósito (planilha)': l.origem.proposito,
      'Cultivar (planilha)': l.origem.cultivar,
    };

    if (l.ignorada) {
      naoImportado.push({ ...base, 'Motivo': 'Excluída da importação pelo usuário.' });
      continue;
    }
    if (l.bloqueiosFinais.length) {
      naoImportado.push({ ...base, 'Motivo': l.bloqueiosFinais.join(' ') });
      continue;
    }

    importado.push({
      ...base,
      'Produtor (cadastro)': l.produtor.alvo?.nome ?? '',
      'Fazenda (cadastro)': l.fazenda.alvo?.nome ?? '',
      'Talhão (cadastro)': l.talhao.alvo?.nome ?? '',
      'Ano': l.safra,
      'Época': l.epoca || 'principal',
      'Cultura': l.final.cultura,
      'Como casou': `produtor: ${l.produtor.motivo} · fazenda: ${l.fazenda.motivo} · talhão: ${l.talhao.motivo}`,
    });

    const tId = l.final.talhaoId;
    if (tId && l.origem.areaHa) {
      const a = somaPorTalhao.get(tId) ?? { ha: 0, linhas: [], nome: l.talhao.alvo?.nome ?? l.origem.talhao };
      // Consórcio ocupa a MESMA área: somar dobraria o talhão.
      if (!(l.repeticao === 'consorcio' && l.ordemNoGrupo > 1)) a.ha += l.origem.areaHa;
      a.linhas.push(l.origem.linha);
      somaPorTalhao.set(tId, a);
    }
  }

  for (const [tId, a] of somaPorTalhao) {
    const cadastro = areaDoTalhao(tId);
    if (!cadastro || cadastro <= 0) continue;
    const difPct = Math.abs(a.ha - cadastro) / cadastro * 100;
    if (difPct <= TOLERANCIA_AREA_PCT) continue;
    divergencias.push({
      'Talhão': a.nome,
      'Área declarada (planilha)': Math.round(a.ha * 100) / 100,
      'Área do cadastro (ha)': Math.round(cadastro * 100) / 100,
      'Diferença (%)': Math.round(difPct * 10) / 10,
      'Linhas': a.linhas.join(', '),
    });
  }

  divergencias.sort((x, y) => Number(y['Diferença (%)']) - Number(x['Diferença (%)']));
  return { importado, naoImportado, divergencias };
}
