// POST /api/precisionfarm/carga-linhas — { talhaoId }. "Buscar linhas da
// PrecisionFarm": lê o inventário do talhão na PF e enfileira o `event` de
// cada camada de linhas (o event_id deles, nada inventado). Owner/admin.
import { tratarCargaLinhas } from '@/lib/precisionfarm/rota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  return tratarCargaLinhas(req);
}
