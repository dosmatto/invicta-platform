// Ritmo de consulta da aba Linhas enquanto há aviso na fila. Puro e SEM
// imports (vai para o navegador — linhas.ts usa node:crypto e não pode).
// Testado em `npm run teste:precisionfarm`.

export const CONSULTA_MIN_MS = 6_000;
export const CONSULTA_MAX_MS = 5 * 60_000;   // o intervalo do cron

/**
 * Próxima consulta: espera o próximo horário de tentativa da fila (+2 s),
 * nunca menos que `minimoMs` e nunca mais que 5 min. Quem chama dobra
 * `minimoMs` a cada consulta sem novidade (aviso esperando o cron não faz a
 * tela bater no servidor a cada 6 s).
 */
export function intervaloConsultaMs(proximaTentativaIso: string | null, agoraMs: number, minimoMs: number): number {
  const ate = proximaTentativaIso ? Date.parse(proximaTentativaIso) - agoraMs + 2000 : 0;
  return Math.min(CONSULTA_MAX_MS, Math.max(minimoMs, Number.isFinite(ate) ? ate : 0));
}

export const proximoMinimoMs = (minimoMs: number) => Math.min(60_000, minimoMs * 2);
