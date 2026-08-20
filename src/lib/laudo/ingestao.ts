// INGESTÃO por API: payload JSON do laboratório → ResultadoAmostra[] canônico.
//
// Puro (sem rede, sem banco, sem DOM) para ser testável em node e para a rota
// ficar sendo só transporte + autenticação + gravação.
//
// A REGRA que governa este arquivo: tudo o que decide o VALOR de uma amostra sai
// do mesmo lugar que o import de arquivo usa — `valorLab` para a semântica de
// N.D./vazio, `converterParaCanonico` para unidade, `calcularDerivados` para as
// colunas calculadas. Se algum dia isto aqui reimplementar qualquer uma dessas,
// o mesmo laudo passa a entrar diferente conforme a porta por onde chegou, e os
// dois lados continuam "funcionando" — ninguém percebe. `npm run teste:laudo-api`
// alimenta o mesmo laudo pelos dois caminhos e exige saída idêntica.

import { converterParaCanonico, casarUnidade, unidadesDe } from '../unidades.ts';
import { calcularDerivados, valorLab, DERIVADOS_IDS, type ResultadoAmostra } from './nucleo.ts';
import { normalizarRemessa } from '../remessa.ts';

// Teto de amostras por chamada. Uma grade grande com 3 profundidades passa de
// 200; 5000 é folga larga e ainda barra payload absurdo antes de virar trabalho.
export const MAX_AMOSTRAS = 5000;

export interface AmostraPayload {
  id?: unknown;
  profundidade?: unknown;
  valores?: unknown;
}

export interface LaudoPayload {
  remessa?: unknown;
  protocolo_laboratorio?: unknown;
  data_analise?: unknown;
  laboratorio?: unknown;
  unidades?: unknown;
  amostras?: unknown;
}

export interface ErroIngestao {
  campo: string;        // caminho no payload, ex. "amostras[3].profundidade"
  mensagem: string;
  /** 'formato' = o payload está malformado (400). 'grade' = o payload está bem
   *  formado mas não bate com a remessa (422) — a distinção importa porque o
   *  conserto é de lados diferentes: o primeiro é código do laboratório, o
   *  segundo é numeração de amostra. */
  tipo?: 'formato' | 'grade';
}

export interface LaudoInterpretado {
  remessa: string | null;
  protocolo: string;
  dataAnalise: string | null;
  laboratorio: string | null;
  resultados: ResultadoAmostra[];
  elementos: string[];
  erros: ErroIngestao[];
  avisos: string[];
}

const ehObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const textoNaoVazio = (v: unknown): string | null => {
  const t = typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '';
  return t === '' ? null : t;
};

/**
 * Número do ponto a partir do `id` da amostra.
 *
 * Extrai os dígitos, igual ao import de arquivo (`aplicarPerfil`): a etiqueta
 * que foi colada no saco pode ter sido transcrita como `7`, `007` ou `P-07`, e
 * as duas portas têm de chegar no mesmo 7.
 */
export function numeroDoId(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    const n = Math.trunc(v);
    return n > 0 ? n : null;
  }
  const digitos = String(v ?? '').replace(/\D/g, '');
  if (!digitos) return null;
  const n = parseInt(digitos, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 'YYYY-MM-DD' — a data é operacional (define Ano/Época), então tem de ser real. */
function dataISO(v: unknown): string | null {
  const t = textoNaoVazio(v);
  if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const [a, m, d] = t.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? t : null;
}

export interface OpcoesIngestao {
  /** Ids de variável que a plataforma aceita hoje (catálogo ATIVO do cliente). */
  variaveisValidas: Set<string>;
  /** Números de ponto da grade da remessa. Ausente = não confere (modo validar). */
  numerosDaGrade?: Set<number>;
  /** Rótulos de profundidade previstos na grade. Ausente = não confere. */
  profundidadesDaGrade?: Set<string>;
}

/**
 * Interpreta o payload inteiro. NUNCA para no primeiro erro: o laboratório
 * precisa da lista completa para corrigir de uma vez — devolver um erro por
 * chamada transforma a integração em pingue-pongue.
 */
export function interpretarLaudo(payload: LaudoPayload, opts: OpcoesIngestao): LaudoInterpretado {
  const erros: ErroIngestao[] = [];
  const avisos: string[] = [];
  const erro = (campo: string, mensagem: string, tipo: 'formato' | 'grade' = 'formato') => erros.push({ campo, mensagem, tipo });

  const remessa = normalizarRemessa(payload.remessa as string);
  if (!remessa) {
    erro('remessa', textoNaoVazio(payload.remessa)
      ? 'Código de remessa inválido. Use o código impresso na conferência que acompanhou as amostras (formato INV-XXXX-XXXX).'
      : 'Campo obrigatório: o código de remessa impresso na conferência que acompanhou as amostras.');
  }

  const protocolo = textoNaoVazio(payload.protocolo_laboratorio) ?? '';
  if (!protocolo) {
    erro('protocolo_laboratorio', 'Campo obrigatório: o número do laudo no sistema do laboratório. É por ele que o reenvio atualiza em vez de duplicar.');
  } else if (protocolo.length > 120) {
    erro('protocolo_laboratorio', 'Máximo de 120 caracteres.');
  }

  const dataAnalise = payload.data_analise == null ? null : dataISO(payload.data_analise);
  if (payload.data_analise != null && !dataAnalise) {
    erro('data_analise', 'Data inválida. Use o formato AAAA-MM-DD (ex.: 2026-08-14).');
  }

  // ── unidades declaradas ────────────────────────────────────────────────────
  // Unidade que não casa é ERRO, não aviso: cair calado para a canônica é o que
  // produz valor com ordem de grandeza errada, que ninguém detecta olhando o mapa.
  const unidades: Record<string, string> = {};
  if (payload.unidades != null) {
    if (!ehObj(payload.unidades)) {
      erro('unidades', 'Deve ser um objeto { variavel: unidade }.');
    } else {
      for (const [varId, u] of Object.entries(payload.unidades)) {
        if (!opts.variaveisValidas.has(varId)) {
          avisos.push(`unidades.${varId}: variável desconhecida — ignorada.`);
          continue;
        }
        const casada = casarUnidade(varId, String(u ?? ''));
        if (!casada) {
          erro(`unidades.${varId}`, `Unidade "${String(u)}" não reconhecida para ${varId}. Aceitas: ${unidadesDe(varId).join(', ')}.`);
          continue;
        }
        unidades[varId] = casada;
      }
    }
  }

  // ── amostras ───────────────────────────────────────────────────────────────
  const bruto = payload.amostras;
  if (!Array.isArray(bruto)) {
    erro('amostras', 'Deve ser uma lista de amostras.');
    return { remessa, protocolo, dataAnalise, laboratorio: textoNaoVazio(payload.laboratorio), resultados: [], elementos: [], erros, avisos };
  }
  if (bruto.length === 0) erro('amostras', 'Nenhuma amostra enviada.');
  if (bruto.length > MAX_AMOSTRAS) erro('amostras', `Máximo de ${MAX_AMOSTRAS} amostras por chamada; recebidas ${bruto.length}.`);

  // Chave (numero|profundidade) → amostra, para fundir linhas repetidas do mesmo
  // ponto (mesma regra do arquivo, onde macro e micro vêm em linhas separadas).
  const porChave = new Map<string, ResultadoAmostra>();
  const foraDaGrade = new Set<number>();
  const profDesconhecidas = new Set<string>();

  bruto.slice(0, MAX_AMOSTRAS).forEach((item, i) => {
    const onde = `amostras[${i}]`;
    if (!ehObj(item)) { erro(onde, 'Deve ser um objeto.'); return; }

    const numero = numeroDoId((item as AmostraPayload).id);
    if (numero == null) {
      erro(`${onde}.id`, 'Identificador do ponto ausente ou sem dígitos. Use o número da etiqueta da amostra.');
      return;
    }
    if (opts.numerosDaGrade && !opts.numerosDaGrade.has(numero)) foraDaGrade.add(numero);

    const profundidade = textoNaoVazio((item as AmostraPayload).profundidade);
    if (!profundidade) {
      erro(`${onde}.profundidade`, 'Campo obrigatório (ex.: "0-20").');
      return;
    }
    if (opts.profundidadesDaGrade && !opts.profundidadesDaGrade.has(profundidade)) profDesconhecidas.add(profundidade);

    const vals = (item as AmostraPayload).valores;
    if (!ehObj(vals)) { erro(`${onde}.valores`, 'Deve ser um objeto { variavel: valor }.'); return; }

    const valores: Record<string, number> = {};
    for (const [varId, cru] of Object.entries(vals)) {
      if (DERIVADOS_IDS.has(varId)) {
        avisos.push(`${onde}.valores.${varId}: a plataforma calcula esta variável — o valor enviado é ignorado.`);
        continue;
      }
      if (!opts.variaveisValidas.has(varId)) {
        avisos.push(`${onde}.valores.${varId}: variável desconhecida ou desativada no catálogo — ignorada.`);
        continue;
      }
      // Mesma semântica do arquivo: N.D./<x = 0 (mediu e não achou); vazio e
      // texto = SEM valor (não inventa zero para o que não foi analisado).
      const v = valorLab(cru as string | number | null);
      if (v == null) continue;
      valores[varId] = converterParaCanonico(varId, v, unidades[varId]);
    }

    if (Object.keys(valores).length === 0) {
      avisos.push(`${onde}: nenhum valor aproveitável — amostra ignorada.`);
      return;
    }

    const chave = `${numero}|${profundidade}`;
    const ex = porChave.get(chave);
    if (ex) {
      avisos.push(`${onde}: ponto ${numero} em ${profundidade} repetido — os valores foram somados na mesma amostra.`);
      Object.assign(ex.valores, valores);
    } else {
      porChave.set(chave, { numero, profundidade, talhao: '', campanha: protocolo, valores });
    }
  });

  if (foraDaGrade.size) {
    erro('amostras', `Pontos que não existem na grade desta remessa: ${[...foraDaGrade].sort((a, b) => a - b).join(', ')}. Confira se a numeração é a das etiquetas.`, 'grade');
  }
  if (profDesconhecidas.size) {
    avisos.push(`Profundidades fora do previsto na grade: ${[...profDesconhecidas].join(', ')}. Confira a grafia (ex.: "0-20" e "0-20 cm" viram camadas diferentes).`);
  }

  // Derivados por último, sobre os valores já canônicos — exatamente onde o
  // import de arquivo os calcula.
  const resultados = [...porChave.values()];
  for (const r of resultados) calcularDerivados(r.valores);

  // Mesma construção do import de arquivo (LabImportSection): ordem de primeira
  // aparição, sem ordenar — a tela e o relatório dependem dessa ordem.
  const elementos = [...new Set(resultados.flatMap(r => Object.keys(r.valores)))];

  return {
    remessa, protocolo, dataAnalise,
    laboratorio: textoNaoVazio(payload.laboratorio),
    resultados, elementos, erros, avisos,
  };
}
