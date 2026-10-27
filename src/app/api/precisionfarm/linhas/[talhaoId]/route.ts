// GET /api/precisionfarm/linhas/{talhaoId} — camadas de linhas recebidas da
// PrecisionFarm (situação, vigente, histórico; sem geometria). Sessão do
// usuário e acesso ao talhão (todos com acesso, só leitura — Q4).
import { tratarLinhasTalhao } from '@/lib/precisionfarm/rota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ talhaoId: string }> }) {
  const { talhaoId } = await params;
  return tratarLinhasTalhao(req, talhaoId);
}
