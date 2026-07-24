// URL do backend de interpolação/krigagem/satélite + POST padrão.
//
// Padrão = NUVEM (Render). O usuário pode OPTAR (opt-in, não default) por usar o
// interpolador DESTA MÁQUINA — útil p/ lotes pesados ("Processar tudo") e p/ não
// disputar a CPU da nuvem com outros usuários. O toggle é em runtime (localStorage),
// global ao app. Chamadas de ADMIN de usuários continuam SEMPRE na nuvem (INTERP_URL).
export const INTERP_URL =
  process.env.NEXT_PUBLIC_INTERP_URL ?? 'https://invicta-fertilidade-backend.onrender.com';

export const INTERP_URL_LOCAL = 'http://127.0.0.1:8800';

// Toggle "usar interpolador desta máquina" (opt-in). Persistido em localStorage,
// vale para todo o app. Se o env já apontar p/ local (dev), sempre local.
const K_LOCAL = 'inv_interp_local';
const ENV_EH_LOCAL = /127\.0\.0\.1|localhost/.test(process.env.NEXT_PUBLIC_INTERP_URL ?? '');
export function usarLocal(): boolean {
  if (ENV_EH_LOCAL) return true;
  if (typeof localStorage === 'undefined') return false;
  try { return localStorage.getItem(K_LOCAL) === '1'; } catch { return false; }
}
export function setUsarLocal(v: boolean): void {
  try { if (v) localStorage.setItem(K_LOCAL, '1'); else localStorage.removeItem(K_LOCAL); } catch { /* storage off */ }
  for (const cb of localListeners) { try { cb(v); } catch { /* ignora */ } }
}
// URL EFETIVA das chamadas de INTERPOLAÇÃO (respeita o toggle). Admin usa INTERP_URL.
export function interpUrl(): string { return usarLocal() ? INTERP_URL_LOCAL : INTERP_URL; }
export function isLocal(): boolean { return usarLocal(); }

// Compat: alguns módulos importavam BACKEND_LOCAL como const. Agora é runtime;
// mantido como getter via Object para não quebrar imports diretos legados.
export const BACKEND_LOCAL = ENV_EH_LOCAL; // só reflete o override de build (dev)

type LocalCb = (v: boolean) => void;
const localListeners = new Set<LocalCb>();
export function onInterpLocalMudou(cb: LocalCb): () => void { localListeners.add(cb); return () => { localListeners.delete(cb); }; }

// Chave anti-abuso OPT-IN: só é enviada se NEXT_PUBLIC_INTERP_API_KEY estiver
// definida (senão nenhum header extra é enviado — zero mudança de comportamento).
// ATENÇÃO: esta chave é PÚBLICA (vai no bundle do client) — protege contra abuso
// casual (bots/curiosos batendo direto na URL), não é segurança forte.
const INTERP_API_KEY = process.env.NEXT_PUBLIC_INTERP_API_KEY ?? '';

// Cabeçalhos extra para chamadas ao backend. Use em QUALQUER fetch direto ao
// INTERP_URL (fora dos helpers deste arquivo) para manter a mesma proteção.
export function headersBackend(base?: HeadersInit): HeadersInit {
  if (!INTERP_API_KEY) return base ?? {};
  return { ...(base ?? {}), 'X-Api-Key': INTERP_API_KEY };
}

// Sentinela ESTÁVEL (usado em comparações `msg === MSG_BACKEND_FORA` para
// detectar "backend fora" e parar o lote). O texto exibido vem de msgBackendFora().
export const MSG_BACKEND_FORA = 'Servidor de processamento indisponível no momento.';
// Texto amigável conforme o destino atual (local x nuvem).
export function msgBackendFora(): string {
  return isLocal()
    ? 'Interpolador desta máquina está desligado. Dê dois cliques em backend/start.command (Mac) ou backend\\start.bat (Windows), espere a janela abrir, e tente de novo — ou desligue "Usar interpolador desta máquina" para voltar à nuvem.'
    : 'Servidor de processamento indisponível no momento. Verifique sua internet e tente de novo em ~1 minuto; se persistir, avise o suporte.';
}

// Checa se o backend ATUAL (local ou nuvem) responde ao /health. Usado pelo
// toggle da UI para dizer na hora se o interpolador local está no ar.
export async function backendVivo(timeoutMs = 4000): Promise<boolean> {
  if (typeof fetch === 'undefined') return false;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${interpUrl()}/health`, { signal: ctrl.signal, cache: 'no-store', headers: headersBackend() });
    return r.ok;
  } catch { return false; } finally { clearTimeout(t); }
}

// O servidor da nuvem ADORMECE sem uso e leva ~1 min para acordar. Este toque
// dispara a subida sem esperar resposta — chamar ao abrir telas que processam.
// (No modo local não há o que "acordar".)
export function tocarBackend(): void {
  if (isLocal() || typeof fetch === 'undefined') return;
  try { void fetch(`${interpUrl()}/health`, { cache: 'no-store', headers: headersBackend() }).catch(() => {}); } catch { /* offline */ }
}

// Aviso de "aquecendo o servidor" (cold start): a UI pode se inscrever para
// mostrar um estado enquanto o backend da nuvem acorda, em vez de só falhar.
type AquecendoCb = (aquecendo: boolean) => void;
const aquecendoListeners = new Set<AquecendoCb>();
export function onBackendAquecendo(cb: AquecendoCb): () => void {
  aquecendoListeners.add(cb);
  return () => { aquecendoListeners.delete(cb); };
}
function emitirAquecendo(v: boolean) { for (const cb of aquecendoListeners) { try { cb(v); } catch { /* ignora */ } } }

// Espera o /health responder (até ~150 s), cobrindo a janela em que o serviço
// da nuvem ainda está subindo (cold start do Render free pode passar de 1 min).
async function esperarBackend(budgetMs = 150_000): Promise<boolean> {
  const fim = Date.now() + budgetMs;
  while (Date.now() < fim) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20_000);
    try {
      const r = await fetch(`${interpUrl()}/health`, { signal: ctrl.signal, cache: 'no-store', headers: headersBackend() });
      if (r.ok) return true;
    } catch { /* ainda fora */ } finally { clearTimeout(t); }
    await new Promise(res => setTimeout(res, 2_000));
  }
  return false;
}

// POST único ao backend. Se a conexão falhar ou o serviço estiver subindo
// (falha de rede ou 502/503/504 do proxy), espera acordar e repete a MESMA
// chamada uma vez — as rotas são de cálculo puro, repetir é seguro. No modo
// local não há o que acordar: falha direto com a instrução do start.bat.
export async function postBackend(rota: string, body: unknown, opts?: { signal?: AbortSignal }): Promise<Response> {
  const signal = opts?.signal;
  const local = isLocal();
  const tentar = () => fetch(`${interpUrl()}${rota}`, {
    method: 'POST',
    headers: headersBackend({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
    signal,
  });
  let r: Response | null = null;
  try { r = await tentar(); }
  catch (e) {
    // Cancelamento explícito (usuário trocou de mapa/saiu): propaga o AbortError
    // SEM tentar acordar o backend (não é o servidor fora, é escolha do usuário).
    if (signal?.aborted) throw e;
    /* conexão recusada — cai no fluxo de "acordar servidor" abaixo */
  }
  if (!r || r.status === 502 || r.status === 503 || r.status === 504) {
    if (signal?.aborted) throw new DOMException('Interpolação cancelada', 'AbortError');
    if (local) throw new Error(MSG_BACKEND_FORA);   // local não "acorda" — falha direto
    emitirAquecendo(true);   // sinaliza p/ a UI: servidor da nuvem acordando
    try {
      if (!(await esperarBackend())) throw new Error(MSG_BACKEND_FORA);
      if (signal?.aborted) throw new DOMException('Interpolação cancelada', 'AbortError');
      r = await tentar();
    } catch (e) {
      if (signal?.aborted) throw e;
      throw e instanceof Error ? e : new Error(MSG_BACKEND_FORA);
    } finally {
      emitirAquecendo(false);
    }
  }
  return r;
}
