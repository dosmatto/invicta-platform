// POST /api/precisionfarm/reprocessar-linhas — { talhaoId, resourceId }.
// "Tentar de novo" na camada de linhas com erro: os avisos recusados dela voltam
// para a fila e são processados logo depois. Owner/admin.
import { tratarReprocessarLinhas } from '@/lib/precisionfarm/rota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  return tratarReprocessarLinhas(req);
}
