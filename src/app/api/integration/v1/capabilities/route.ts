// GET /integration/v1/capabilities (rewrite em next.config.ts → /api/integration/v1/…)
// Versão do contrato, ambiente, tipos, formatos e limites. Contrato PrecisionFarm
// 0.2.0 — docs/integracao-precisionfarm.md.
//
// 'nodejs': node:crypto (hash da chave) + service role. 'force-dynamic': resposta
// autenticada, nada pode ser cacheado.
import { tratarCapabilities } from '@/lib/precisionfarm/rota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return tratarCapabilities(req);
}
