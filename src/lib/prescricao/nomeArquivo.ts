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
// Módulo PURO. npm run teste:prescricao

import { ehUnidadeSemente, type UnidadeDose } from './tipos.ts';

/** Palavras que não entram na sigla — não distinguem uma fazenda de outra. */
const GENERICAS = new Set([
  'FAZENDA', 'FAZ', 'SITIO', 'CHACARA', 'ESTANCIA', 'AGROPECUARIA', 'GRANJA',
  'DE', 'DA', 'DO', 'DAS', 'DOS', 'E',
]);

const semAcento = (s: string): string =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

const soLetrasNum = (s: string): string => semAcento(s).replace(/[^A-Z0-9]/g, '');

/**
 * Sigla da fazenda: a cadastrada, quando existe; senão as INICIAIS das palavras
 * que distinguem ("SERRA AZUL" → SA, "Fazenda Boa Vista" → BV).
 */
export function siglaFazenda(nome: string, sigla?: string | null): string {
  const s = soLetrasNum(sigla ?? '');
  if (s) return s.slice(0, 4);
  const palavras = semAcento(nome).split(/[^A-Z0-9]+/).filter(Boolean);
  const uteis = palavras.filter(p => !GENERICAS.has(p));
  const base = (uteis.length ? uteis : palavras).map(p => p[0]).join('');
  return base.slice(0, 4) || 'FAZ';
}

/**
 * Número do talhão: o NÚMERO no fim do nome ("JCASA 03" → 03, "T-7" → 07).
 * Sem número, usa o nome enxugado — melhor um nome feio que dois arquivos
 * diferentes com o mesmo nome.
 */
export function numeroTalhao(nome: string): string {
  const m = semAcento(nome).match(/(\d+)\s*$/);
  if (m) return m[1].padStart(2, '0');
  return soLetrasNum(nome).slice(0, 6) || 'T';
}

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
