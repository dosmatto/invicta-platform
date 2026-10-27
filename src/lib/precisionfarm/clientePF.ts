// Integração PrecisionFarm — cliente HTTP da Invicta para a API da PF
// (lado servidor). Só HTTPS, NUNCA segue redirecionamento, sempre com timeout
// e com teto de bytes lido do corpo. Erro sai como FalhaPF já classificado
// (temporária × permanente, regra em linhas.ts → classeDoStatus).
//
// Sem banco e sem segredo em log: a chave e o HMAC só vão nos cabeçalhos da
// requisição. Importável pelos testes em Node (imports com `.ts`).

import { RE_UUID } from './contrato.ts';
import {
  MAX_REVISAO_BYTES, assinarHmac, classeDoStatus, corpoRecibo,
  type ClasseFalha, type ConfigRecebimento, type StatusRecibo,
} from './linhas.ts';

/** Teto de uma página de inventário / changes. */
const MAX_PAGINA_BYTES = 5 * 1024 * 1024;
export const TIMEOUT_PADRAO_MS = 20_000;

export class FalhaPF extends Error {
  readonly classe: ClasseFalha;
  readonly status: number | null;
  constructor(mensagem: string, classe: ClasseFalha, status: number | null = null) {
    super(mensagem);
    this.name = 'FalhaPF';
    this.classe = classe;
    this.status = status;
  }
}

export interface PaginaPF { items: unknown[]; next_cursor: string; has_more: boolean }

export interface ClientePF {
  revisao(resourceId: string, n: number): Promise<unknown>;
  inventario(sharedFieldId: string, cursor: string): Promise<PaginaPF>;
  changes(cursor: string, limit: number): Promise<PaginaPF>;
  /** Devolve o status HTTP da PF (2xx = aceito). Rede/timeout → FalhaPF temporária. */
  enviarRecibo(eventId: string, status: StatusRecibo, motivo: string | null): Promise<number>;
}

type Fetch = typeof fetch;

/** Lê o corpo até `max` bytes; passou disso, corta a conexão e recusa. */
async function lerLimitado(r: Response, max: number): Promise<Uint8Array> {
  const decl = Number(r.headers.get('content-length'));
  if (Number.isFinite(decl) && decl > max) {
    try { await r.body?.cancel(); } catch { /* já fechado */ }
    throw new FalhaPF(`Resposta da PrecisionFarm maior que ${Math.round(max / 1024 / 1024)} MB.`, 'permanente', r.status);
  }
  if (!r.body) return new Uint8Array(0);
  const leitor = r.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      try { await leitor.cancel(); } catch { /* já fechado */ }
      throw new FalhaPF(`Resposta da PrecisionFarm maior que ${Math.round(max / 1024 / 1024)} MB.`, 'permanente', r.status);
    }
    partes.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of partes) { out.set(p, o); o += p.byteLength; }
  return out;
}

function mensagemDeRede(e: unknown): string {
  const nome = (e as { name?: string })?.name;
  if (nome === 'TimeoutError' || nome === 'AbortError') return 'A PrecisionFarm não respondeu a tempo.';
  return 'Sem conexão com a PrecisionFarm.';
}

function mensagemDeStatus(status: number, rota: string): string {
  if (status >= 300 && status < 400) return `A PrecisionFarm respondeu com redirecionamento (${status}) em ${rota} — o contrato não aceita redirect; confira PF_BASE_URL.`;
  if (status === 401) return 'A PrecisionFarm recusou a chave da Invicta (401) — confira PF_CHAVE.';
  if (status === 403) return 'A PrecisionFarm negou o acesso (403).';
  if (status === 404) return `A PrecisionFarm diz que ${rota} não existe (ainda) ou está fora do vínculo (404).`;
  if (status === 409) return 'A PrecisionFarm acusou conflito de identidade/revisão (409).';
  if (status === 413) return 'A PrecisionFarm recusou o tamanho (413).';
  if (status === 422) return 'A PrecisionFarm recusou o pedido como fora do contrato (422).';
  if (status === 503) return 'Integração desabilitada do lado da PrecisionFarm (503).';
  return `A PrecisionFarm respondeu ${status} em ${rota}.`;
}

export function criarClientePF(cfg: ConfigRecebimento, opts: { fetch?: Fetch; timeoutMs?: number } = {}): ClientePF {
  const f: Fetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_PADRAO_MS;
  if (!cfg.baseUrl.startsWith('https://')) throw new Error('PF_BASE_URL precisa ser https://');

  async function chamar(metodo: 'GET' | 'POST', caminho: string, a: { max: number; corpo?: string; assinar?: boolean } ): Promise<{ status: number; bytes: Uint8Array }> {
    const headers: Record<string, string> = { Authorization: `Bearer ${cfg.chave}`, Accept: 'application/json' };
    if (a.corpo != null) headers['Content-Type'] = 'application/json';
    if (a.assinar && a.corpo != null) {
      const ts = String(Math.floor(Date.now() / 1000));
      headers['X-PF-Timestamp'] = ts;
      headers['X-PF-Signature'] = assinarHmac(cfg.hmacSaida, ts, a.corpo);
    }
    let r: Response;
    try {
      r = await f(`${cfg.baseUrl}${caminho}`, {
        method: metodo,
        headers,
        body: a.corpo,
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      throw new FalhaPF(mensagemDeRede(e), 'temporaria');
    }
    // `redirect: 'manual'` no Node devolve o próprio 3xx; no navegador seria
    // 'opaqueredirect' com status 0. Os dois são recusados.
    if (r.type === 'opaqueredirect' || (r.status >= 300 && r.status < 400) || r.status === 0) {
      try { await r.body?.cancel(); } catch { /* sem corpo */ }
      throw new FalhaPF(mensagemDeStatus(r.status >= 300 ? r.status : 302, caminho.split('?')[0]), 'temporaria', r.status);
    }
    let bytes: Uint8Array;
    try {
      bytes = await lerLimitado(r, a.max);
    } catch (e) {
      if (e instanceof FalhaPF) throw e;
      throw new FalhaPF(mensagemDeRede(e), 'temporaria', r.status);
    }
    return { status: r.status, bytes };
  }

  async function lerJson(caminho: string, max: number, classeJsonRuim: ClasseFalha): Promise<unknown> {
    const { status, bytes } = await chamar('GET', caminho, { max });
    if (status < 200 || status >= 300) throw new FalhaPF(mensagemDeStatus(status, caminho.split('?')[0]), classeDoStatus(status), status);
    try {
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
      throw new FalhaPF(`A PrecisionFarm devolveu um JSON inválido em ${caminho.split('?')[0]}.`, classeJsonRuim, status);
    }
  }

  function comoPagina(v: unknown, rota: string): PaginaPF {
    const o = v as { items?: unknown; next_cursor?: unknown; has_more?: unknown } | null;
    if (!o || !Array.isArray(o.items) || typeof o.next_cursor !== 'string' || typeof o.has_more !== 'boolean') {
      throw new FalhaPF(`Página de ${rota} fora do formato (items, next_cursor, has_more).`, 'temporaria');
    }
    return { items: o.items, next_cursor: o.next_cursor, has_more: o.has_more };
  }

  return {
    async revisao(resourceId, n) {
      if (!RE_UUID.test(resourceId) || !Number.isInteger(n) || n < 1) throw new FalhaPF('Recurso/revisão inválidos.', 'permanente');
      return lerJson(`/resources/${resourceId.toLowerCase()}/revisions/${n}`, MAX_REVISAO_BYTES, 'permanente');
    },
    async inventario(sharedFieldId, cursor) {
      if (!RE_UUID.test(sharedFieldId)) throw new FalhaPF('shared_field_id inválido.', 'permanente');
      const q = new URLSearchParams({ cursor, limit: '100' });
      return comoPagina(await lerJson(`/fields/${sharedFieldId.toLowerCase()}/inventory?${q}`, MAX_PAGINA_BYTES, 'temporaria'), '/inventory');
    },
    async changes(cursor, limit) {
      const q = new URLSearchParams({ cursor, limit: String(limit) });
      return comoPagina(await lerJson(`/changes?${q}`, MAX_PAGINA_BYTES, 'temporaria'), '/changes');
    },
    async enviarRecibo(eventId, status, motivo) {
      const corpo = corpoRecibo(eventId, status, motivo);
      const r = await chamar('POST', '/receipts', { max: 64 * 1024, corpo, assinar: true });
      return r.status;
    },
  };
}
