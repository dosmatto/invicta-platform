// Integração PrecisionFarm — EXECUÇÃO EM LOTE (Biblioteca → PrecisionFarm).
// Núcleo PURO (sem rede, sem store, sem node:*): roda no navegador (a tela de
// lote chama as rotas talhão a talhão), no servidor (resumo geral) e no teste
// em Node (imports com `.ts`).
//
// Regras do lote (ledger pf-lote, item 7):
//   • CONCORRÊNCIA LIMITADA — no máximo N talhões em andamento; cada publicação
//     é uma função da Vercel que lê a nuvem e monta o envelope, e a comparação
//     de limite bate na API da PF. Um lote de 50 talhões de uma vez estouraria
//     as duas.
//   • FALHA DE UM NÃO PARA OS OUTROS — a função de cada item pode lançar; vira
//     o desfecho "erro" daquele item e o lote segue.
//   • PROGRESSO — avisa a cada item concluído (feitos/total/em andamento).
//   • DESFECHO POR LINHA — ok · pulado (com o motivo: regra de negócio, nada a
//     fazer agora) · erro (falha de verdade: rede, servidor, PF fora).

export type DesfechoLote = 'ok' | 'pulado' | 'erro';

export interface ResultadoLote { desfecho: DesfechoLote; texto: string }

export interface ProgressoLote { feitos: number; total: number; emAndamento: number }

/** Talhões em andamento ao mesmo tempo nas ações da tela de lote. */
export const CONCORRENCIA_LOTE = 3;

export const ok = (texto: string): ResultadoLote => ({ desfecho: 'ok', texto });
export const pulado = (texto: string): ResultadoLote => ({ desfecho: 'pulado', texto });
export const erro = (texto: string): ResultadoLote => ({ desfecho: 'erro', texto });

/**
 * Roda `fn` para cada item com no máximo `concorrencia` em andamento. Devolve os
 * resultados NA ORDEM dos itens. Exceção de um item vira `erro` dele — nunca
 * derruba o lote.
 */
export async function executarEmLote<T>(
  itens: readonly T[],
  fn: (item: T, indice: number) => Promise<ResultadoLote>,
  opcoes: { concorrencia?: number; aoProgredir?: (p: ProgressoLote, indice: number, r: ResultadoLote) => void } = {},
): Promise<ResultadoLote[]> {
  const total = itens.length;
  let feitos = 0, emAndamento = 0;
  return mapearComLimite(itens, async (item, i) => {
    emAndamento++;
    let r: ResultadoLote;
    try { r = await fn(item, i); }
    catch (e) { r = erro(e instanceof Error ? e.message : 'Falha inesperada.'); }
    emAndamento--; feitos++;
    opcoes.aoProgredir?.({ feitos, total, emAndamento }, i, r);
    return r;
  }, opcoes.concorrencia ?? CONCORRENCIA_LOTE);
}

/** `itens.map(fn)` com no máximo `limite` promessas em andamento; resultados na
 *  ordem dos itens. Exceção sobe (quem quer isolar falhas usa executarEmLote). */
export async function mapearComLimite<T, R>(itens: readonly T[], fn: (item: T, indice: number) => Promise<R>, limite: number): Promise<R[]> {
  const saida: R[] = new Array(itens.length);
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < itens.length) { const i = proximo++; saida[i] = await fn(itens[i], i); }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, Math.floor(limite)), itens.length) }, trabalhador));
  return saida;
}

/**
 * Resposta de falha de uma rota /api/precisionfarm/* → desfecho. As recusas de
 * regra (409 sincronização/vínculo, 422 safra/época/ID, 404 não está na nuvem,
 * 413 grande demais) são "pulado": o talhão não estava pronto, nada quebrou.
 * O resto — sem status (rede), 400, 401/403 (sessão), 5xx (servidor ou PF) — é
 * "erro".
 */
export function desfechoDaFalha(status: number | undefined): DesfechoLote {
  return status === 404 || status === 409 || status === 413 || status === 422 ? 'pulado' : 'erro';
}

/** Vários resultados de UM talhão (ex.: uma colheita oficial por safra/época)
 *  → um só: erro se algum deu erro; senão ok se algum deu certo; senão pulado. */
export function juntarResultados(rs: readonly ResultadoLote[]): ResultadoLote {
  if (!rs.length) return pulado('Nada a fazer.');
  const desfecho: DesfechoLote = rs.some(r => r.desfecho === 'erro') ? 'erro' : rs.some(r => r.desfecho === 'ok') ? 'ok' : 'pulado';
  return { desfecho, texto: rs.map(r => r.texto).join(' · ') };
}

/** Resumo final do lote ("12 ok · 3 pulados · 1 erro"). */
export function resumoDoLote(rs: readonly ResultadoLote[]): { ok: number; pulados: number; erros: number; texto: string } {
  const n = (d: DesfechoLote) => rs.filter(r => r.desfecho === d).length;
  const c = { ok: n('ok'), pulados: n('pulado'), erros: n('erro') };
  const partes = [`${c.ok} ok`, `${c.pulados} pulado${c.pulados === 1 ? '' : 's'}`, `${c.erros} erro${c.erros === 1 ? '' : 's'}`];
  return { ...c, texto: partes.join(' · ') };
}
