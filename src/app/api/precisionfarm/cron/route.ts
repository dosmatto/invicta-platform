// /api/precisionfarm/cron — rotina periódica do recebimento de linhas da
// PrecisionFarm: processa a fila (pendentes e retentativas), reenvia recibos e
// consulta GET {PF}/changes como recuperação. Chamada pelo pg_cron + pg_net do
// Supabase a cada 5 min com `Authorization: Bearer <PF_CRON_SEGREDO>`
// (docs/integracao-precisionfarm-fase2.sql). Sem o segredo configurado → 503.
import { tratarCron } from '@/lib/precisionfarm/rota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  return tratarCron(req);
}

export async function GET(req: Request) {
  return tratarCron(req);
}
