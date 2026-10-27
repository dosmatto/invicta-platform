// GET /api/precisionfarm/talhao/{id} — vínculo PrecisionFarm do talhão e o que
// está publicado. Sessão do usuário (Bearer = access_token do Supabase) e papel
// owner/admin. Usado pela seção "Integração PrecisionFarm" do talhão.
import { tratarEstado } from '@/lib/precisionfarm/rota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return tratarEstado(req, id);
}
