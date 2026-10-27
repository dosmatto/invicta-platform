// GET /integration/v1/fields/{shared_field_id}/inventory?cursor=&limit= — camadas
// publicadas do talhão (revisão vigente + `event` para a carga inicial).
// Contrato: docs/integracao-precisionfarm.md.
import { tratarInventario } from '@/lib/precisionfarm/rota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ shared_field_id: string }> }) {
  const { shared_field_id } = await params;
  return tratarInventario(req, shared_field_id);
}
