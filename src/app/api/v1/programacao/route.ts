// POST /api/v1/programacao — a Lavra devolve as doses programadas por zona e a
// AP grava as prescrições (contrato: docs/integracao-lavra.md).
//
// 'nodejs' e não edge: usa node:crypto (hash da chave) e a service role do
// Supabase. 'force-dynamic': POST autenticado, nada pode ser cacheado.
import { tratarProgramacao } from '@/lib/programacao/rota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return tratarProgramacao(req, { gravar: true });
}
