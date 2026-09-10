'use client';

// Leitura do LOG do robô noturno de satélite (pendência 40).
//
// A configuração do monitoramento vive no store (inv_msr_monitor, espelhado no
// sync como as demais listas). Já o log é escrito SÓ pelo backend, com a
// service_role — por isso mora numa coleção fora do boot e é lido sob demanda,
// no padrão de cenaEstados.ts. Se entrasse em KEYS_LISTA, o primeiro push de um
// navegador podaria os órfãos remotos e apagaria o histórico inteiro
// (ver podePodar em supabaseData.ts).

import { carregarColecaoSupabase, usarDadosSupabase } from './supabaseData';

const COL_EXEC = 'inv_msr_execucoes';

export type DecisaoCena = 'salva' | 'rejeitada' | 'erro';

export interface ItemExecucao {
  talhaoId: string;
  cenaId?: string;
  data?: string;
  nuvem?: number | null;
  pctLimpo?: number | null;
  ndviMedio?: number | null;
  decisao: DecisaoCena;
  motivo?: string;
  indices?: string[];
}

export interface ExecucaoMsr {
  id: string;
  iniciadoEm: string;
  terminadoEm?: string;
  host?: string;
  status: 'rodando' | 'ok' | 'interrompida' | 'erro';
  totais: { talhoes: number; avaliadas: number; salvas: number; erros: number };
  itens: ItemExecucao[];
}

export const TEXTO_STATUS: Record<ExecucaoMsr['status'], string> = {
  rodando: 'em andamento',
  ok: 'concluída',
  interrompida: 'interrompida',
  erro: 'com erro',
};

/** As últimas execuções, mais recente primeiro. */
export async function listarExecucoes(limite = 10): Promise<ExecucaoMsr[]> {
  if (!usarDadosSupabase()) return [];
  try {
    const docs = await carregarColecaoSupabase<ExecucaoMsr>(COL_EXEC);
    return docs
      .filter(d => !!d?.id)
      .sort((a, b) => (b.iniciadoEm ?? '').localeCompare(a.iniciadoEm ?? ''))
      .slice(0, limite);
  } catch {
    return [];
  }
}

/** Só o que aconteceu com UM talhão, achatado em ordem cronológica inversa. */
export function itensDoTalhao(execs: ExecucaoMsr[], talhaoId: string): Array<ItemExecucao & { quando: string }> {
  const out: Array<ItemExecucao & { quando: string }> = [];
  for (const e of execs) {
    for (const i of e.itens ?? []) {
      if (i.talhaoId === talhaoId) out.push({ ...i, quando: e.iniciadoEm });
    }
  }
  return out;
}
