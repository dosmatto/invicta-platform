// GET /integration/v1/catalog?cursor=&limit= — talhões com vínculo CONFIRMADO
// alcançados pela chave da PrecisionFarm. Contrato: docs/integracao-precisionfarm.md.
import { tratarCatalogo } from '@/lib/precisionfarm/rota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return tratarCatalogo(req);
}
