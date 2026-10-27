// GET /api/precisionfarm/linhas/{talhaoId}/revisao?resource=&n= — linhas de uma
// revisão recebida (vigente ou antiga, para comparar no mapa). Mesma
// autenticação da lista: sessão + acesso ao talhão.
import { tratarGeometriaLinhas } from '@/lib/precisionfarm/rota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: Request, { params }: { params: Promise<{ talhaoId: string }> }) {
  const { talhaoId } = await params;
  return tratarGeometriaLinhas(req, talhaoId);
}
