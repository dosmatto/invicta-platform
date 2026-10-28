// GET /api/precisionfarm/limite/{talhaoId} — limite VIGENTE que a PrecisionFarm
// publicou para o talhão (inventário → revisão), para comparar com o limite da
// Invicta e adotar. Sessão do usuário, owner/admin, vínculo confirmado.
import { tratarLimitePF } from '@/lib/precisionfarm/rota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request, { params }: { params: Promise<{ talhaoId: string }> }) {
  const { talhaoId } = await params;
  return tratarLimitePF(req, talhaoId);
}
