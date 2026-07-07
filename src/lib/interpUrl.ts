// URL única do backend de interpolação/krigagem/satélite + POST padrão.
//
// Padrão = NUVEM (Render), para o app funcionar SEM nenhum backend local
// ("parruda + online"). Para desenvolver o backend localmente, defina
// NEXT_PUBLIC_INTERP_URL=http://127.0.0.1:8800 no .env.local (override).
export const INTERP_URL =
  process.env.NEXT_PUBLIC_INTERP_URL ?? 'https://invicta-fertilidade-backend.onrender.com';

// true só no override de desenvolvimento (backend na própria máquina).
export const BACKEND_LOCAL = /127\.0\.0\.1|localhost/.test(INTERP_URL);

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

export const MSG_BACKEND_FORA = BACKEND_LOCAL
  ? 'Interpolador desligado nesta máquina. Dê dois cliques em backend\\start.bat (Windows) ou backend/start.command (Mac), espere a janela abrir, e tente de novo.'
  : 'Servidor de processamento indisponível no momento. Verifique sua internet e tente de novo em ~1 minuto; se persistir, avise o suporte.';

// O servidor da nuvem ADORMECE sem uso e leva ~1 min para acordar. Este toque
// dispara a subida sem esperar resposta — chamar ao abrir telas que processam.
export function tocarBackend(): void {
  if (BACKEND_LOCAL || typeof fetch === 'undefined') return;
  try { void fetch(`${INTERP_URL}/health`, { cache: 'no-store', headers: headersBackend() }).catch(() => {}); } catch { /* offline */ }
}

// Espera o /health responder (até ~90 s), cobrindo a janela em que o serviço
// da nuvem ainda está subindo.
async function esperarBackend(budgetMs = 90_000): Promise<boolean> {
  const fim = Date.now() + budgetMs;
  while (Date.now() < fim) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20_000);
    try {
      const r = await fetch(`${INTERP_URL}/health`, { signal: ctrl.signal, cache: 'no-store', headers: headersBackend() });
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
export async function postBackend(rota: string, body: unknown): Promise<Response> {
  const tentar = () => fetch(`${INTERP_URL}${rota}`, {
    method: 'POST',
    headers: headersBackend({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  let r: Response | null = null;
  try { r = await tentar(); } catch { /* conexão recusada/abortada */ }
  if (!r || r.status === 502 || r.status === 503 || r.status === 504) {
    if (BACKEND_LOCAL || !(await esperarBackend())) throw new Error(MSG_BACKEND_FORA);
    try { r = await tentar(); } catch { throw new Error(MSG_BACKEND_FORA); }
  }
  return r;
}
