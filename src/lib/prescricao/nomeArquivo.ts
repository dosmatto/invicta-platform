// NOME DO ARQUIVO de prescrição — o padrão que o pessoal usa no campo.
//
//     SA03_TX_MILHO
//     │  │  │  └── produto
//     │  │  └───── TX = taxa variável
//     │  └──────── número do talhão ("JCASA 03" → 03)
//     └─────────── sigla da fazenda ("SERRA AZUL" → SA)
//
// Por que importa: o arquivo sai do escritório e chega no monitor da máquina
// numa lista de nomes truncados. "prescricao_Milho_JCASA_03_Populacao_v2" não
// se distingue de nada nessa lista; SA03_TX_MILHO se lê de relance.
//
// SEM acento, SEM espaço e SEM minúscula de propósito: monitor antigo trunca,
// troca acento por lixo e às vezes ignora o arquivo por causa do nome.
//
// Este formato NÃO segue o padrão geral dos exportados (lib/nomeExport.ts, que
// é talhão_TIPO_ano_época): ele já está em uso nos monitores e mudar o nome de
// um arquivo que o operador reconhece de cor é convite para levar o errado. As
// PRIMITIVAS, porém, são as mesmas — vêm de lá, para as duas convenções nunca
// discordarem sobre o que é a sigla de uma fazenda.
//
// Módulo PURO. npm run teste:prescricao

import { ehUnidadeSemente, type UnidadeDose } from './tipos.ts';
import { siglaFazenda, numeroTalhao, soLetrasNum } from '../nomeExport.ts';

export { siglaFazenda, numeroTalhao };

/** Sufixo da régua: só quando NÃO é a população — é o que distingue dois
 *  arquivos da mesma prescrição exportados em unidades diferentes. */
export function sufixoUnidade(u: UnidadeDose): string {
  if (!ehUnidadeSemente(u)) return '';
  if (u === 'sementes/m') return '_M';
  if (u === 'sementes/m2') return '_M2';
  return '';
}

export interface DadosNomeArquivo {
  fazenda: string;
  siglaFazenda?: string | null;
  talhao: string;
  produto: string;
  unidade?: UnidadeDose;
}

/**
 * Nome base (sem extensão) do arquivo de prescrição.
 *
 * O sufixo da unidade existe para um perigo concreto: exportar a MESMA
 * prescrição em população e em sementes/m gera dois arquivos com números
 * diferentes por dentro — com o mesmo nome, é questão de tempo até o operador
 * levar o errado para a máquina.
 */
export function nomeArquivoPrescricao(d: DadosNomeArquivo): string {
  const sigla = siglaFazenda(d.fazenda || '', d.siglaFazenda);
  const talhao = numeroTalhao(d.talhao || '');
  const produto = soLetrasNum(d.produto || '').slice(0, 14) || 'PRODUTO';
  const sufixo = d.unidade ? sufixoUnidade(d.unidade) : '';
  return `${sigla}${talhao}_TX_${produto}${sufixo}`;
}
