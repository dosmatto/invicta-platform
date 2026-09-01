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
// ── O que o interpolador DESTA MÁQUINA atende ───────────────────────────────
// Só CÁLCULO PURO sobre dados que o próprio app envia (pontos, polígono,
// parâmetros). É para isso que ele existe: tirar da nuvem o lote pesado de CPU.
//
// Todo o resto vai SEMPRE para a nuvem, porque a máquina do usuário não tem como
// atender — e antes ia para o local do mesmo jeito, e simplesmente falhava:
//   • /mde*      → precisa baixar modelo de elevação de fora;
//   • /ndvi*, /indices → dependem dos catálogos de satélite;
//   • /ia-*      → exige a chave da IA, que só existe no servidor;
//   • /grid-geotiff → exportação, não é interpolação (e é chamada uma vez só).
// Sintoma relatado: com o interpolador aberto no Windows, MDE e NDVI paravam de
// funcionar. Não era o servidor local estar quebrado — é que ele nunca deveria
// receber essas chamadas.
const ROTAS_LOCAIS = new Set([
  '/interpolar',          // krigagem / IDW — o motivo de o local existir
  '/limpar-pontos',       // MapFilter da condutividade (denso, pesado)
  '/colheita-processar',  // limpeza dos dados de colheita (denso, pesado)
  '/zonear-analisar', '/zonear-gerar', '/zonear-suavizar', '/zonear-dividir',
  '/zonear-incorporar-divisas',
]);
export function rotaVaiParaLocal(rota: string): boolean {
  return ROTAS_LOCAIS.has(rota.split('?')[0]);
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
    // No modo local a falha só chega aqui depois de a nuvem TAMBÉM ter falhado
    // (postBackend cai para ela sozinho) — então o texto fala dos dois.
    ? 'Não deu para processar: o interpolador desta máquina está desligado e o servidor da nuvem não respondeu. Verifique sua internet e tente de novo em ~1 minuto. (Para processar nesta máquina, abra o atalho "Interpolador INVICTA" na Área de Trabalho.)'
    : 'Servidor de processamento indisponível no momento. Verifique sua internet e tente de novo em ~1 minuto; se persistir, avise o suporte.';
}

// Erro de "backend fora" com a mensagem JÁ amigável (msgBackendFora) e uma marca
// estável para quem precisa DETECTAR o caso (parar um lote, por exemplo).
// Antes o throw levava o sentinela cru: telas que só exibem `e.message` — NDVI/
// satélite entre elas — mostravam "Servidor de processamento indisponível" mesmo
// quando o servidor estava perfeito e o problema era o interpolador local
// desligado. Mensagem que aponta o lugar errado custa mais tempo que erro nenhum.
export class BackendForaError extends Error {
  readonly backendFora = true;
  constructor() { super(msgBackendFora()); this.name = 'BackendForaError'; }
}
export function ehBackendFora(e: unknown): boolean {
  return e instanceof Error
    && ((e as { backendFora?: boolean }).backendFora === true || e.message === MSG_BACKEND_FORA);
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
//
// Toca a NUVEM mesmo no modo local: MDE, NDVI e IA vão sempre para lá, então
// quem está com o interpolador da máquina aberto continua precisando dela
// acordada. Antes o toque era pulado no modo local e a primeira imagem de
// satélite pegava o servidor dormindo.
export function tocarBackend(): void {
  if (typeof fetch === 'undefined') return;
  try { void fetch(`${INTERP_URL}/health`, { cache: 'no-store', headers: headersBackend() }).catch(() => {}); } catch { /* offline */ }
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

// Avisa que a chamada CAIU PARA A NUVEM porque o interpolador local não estava
// no ar — a UI mostra isso em vez de deixar a impressão de que nada aconteceu.
type NuvemCb = (usou: boolean) => void;
const nuvemListeners = new Set<NuvemCb>();
export function onCaiuParaNuvem(cb: NuvemCb): () => void {
  nuvemListeners.add(cb);
  return () => { nuvemListeners.delete(cb); };
}
function emitirCaiuParaNuvem(v: boolean) { for (const cb of nuvemListeners) { try { cb(v); } catch { /* ignora */ } } }

// Espera o /health responder (até ~150 s), cobrindo a janela em que o serviço
// da nuvem ainda está subindo (cold start do Render free pode passar de 1 min).
async function esperarBackend(base: string, budgetMs = 150_000): Promise<boolean> {
  const fim = Date.now() + budgetMs;
  while (Date.now() < fim) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20_000);
    try {
      const r = await fetch(`${base}/health`, { signal: ctrl.signal, cache: 'no-store', headers: headersBackend() });
      if (r.ok) return true;
    } catch { /* ainda fora */ } finally { clearTimeout(t); }
    await new Promise(res => setTimeout(res, 2_000));
  }
  return false;
}

// POST único ao backend. Se a conexão falhar ou o serviço estiver subindo
// (falha de rede ou 502/503/504 do proxy), espera acordar e repete a MESMA
// chamada uma vez — as rotas são de cálculo puro, repetir é seguro.
//
// MODO LOCAL: se o interpolador desta máquina não atende, a chamada CAI PARA A
// NUVEM em vez de falhar. O interpolador local é uma otimização (lote pesado sem
// disputar CPU com os outros), não um requisito — nenhuma tela pode ficar refém
// de uma janela de Terminal que o usuário fechou, reiniciou o Mac ou nem abriu.
// O toggle continua marcado: a preferência é dele, e volta a valer sozinha assim
// que o local estiver no ar de novo.
export async function postBackend(rota: string, body: unknown, opts?: { signal?: AbortSignal }): Promise<Response> {
  const signal = opts?.signal;
  // O toggle "usar esta máquina" só vale para as rotas que ela sabe atender.
  // MDE, NDVI e IA vão SEMPRE para a nuvem, mesmo com o interpolador aberto.
  const local = isLocal() && rotaVaiParaLocal(rota);
  const tentarEm = (base: string) => fetch(`${base}${rota}`, {
    method: 'POST',
    headers: headersBackend({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
    signal,
  });
  // Só "fora do ar" mesmo: conexão recusada ou o proxy dizendo que o serviço não
  // está de pé. Um 500 é ERRO DE CÁLCULO do backend — repetir na nuvem daria o
  // mesmo 500 e ainda esconderia o defeito real.
  const foraDoAr = (r: Response | null) => !r || r.status === 502 || r.status === 503 || r.status === 504;

  let r: Response | null = null;
  try { r = await tentarEm(local ? INTERP_URL_LOCAL : INTERP_URL); }
  catch (e) {
    // Cancelamento explícito (usuário trocou de mapa/saiu): propaga o AbortError
    // SEM tentar acordar o backend (não é o servidor fora, é escolha do usuário).
    if (signal?.aborted) throw e;
    /* conexão recusada — cai no fluxo abaixo */
  }
  if (!foraDoAr(r)) return r!;
  if (signal?.aborted) throw new DOMException('Interpolação cancelada', 'AbortError');

  // Daqui pra baixo o destino é SEMPRE a nuvem: ou já era (modo nuvem e ela está
  // acordando), ou é o resgate do modo local.
  if (local) emitirCaiuParaNuvem(true);
  emitirAquecendo(true);   // a nuvem pode estar dormindo (cold start do Render)
  try {
    let n: Response | null = null;
    try { n = await tentarEm(INTERP_URL); }
    catch (e) { if (signal?.aborted) throw e; }
    if (foraDoAr(n)) {
      if (!(await esperarBackend(INTERP_URL))) throw new BackendForaError();
      if (signal?.aborted) throw new DOMException('Interpolação cancelada', 'AbortError');
      n = await tentarEm(INTERP_URL);
    }
    if (!n) throw new BackendForaError();
    return n;
  } catch (e) {
    if (signal?.aborted) throw e;
    if (local) emitirCaiuParaNuvem(false);   // nem o resgate funcionou
    throw e instanceof Error ? e : new BackendForaError();
  } finally {
    emitirAquecendo(false);
  }
}
