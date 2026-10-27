// GET /integration/v1/resources/{id}/revisions/{n} — envelope completo (snapshot
// imutável) de uma revisão publicada. Contrato: docs/integracao-precisionfarm.md.
import { tratarRevisao } from '@/lib/precisionfarm/rota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await params;
  return tratarRevisao(req, id, n);
}
