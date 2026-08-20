// POST /api/v1/laudos — ingestão de laudo do laboratório (grava).
//
// 'nodejs' e não edge: usa node:crypto (hash da chave) e a service role do
// Supabase. 'force-dynamic' porque é POST autenticado — nada aqui pode ser
// cacheado pela infraestrutura.
import { tratarLaudo } from '@/lib/laudo/rota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return tratarLaudo(req, { gravar: true });
}
