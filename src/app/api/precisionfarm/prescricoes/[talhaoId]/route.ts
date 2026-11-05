// GET /api/precisionfarm/prescricoes/{talhaoId} — situação das prescrições com
// estrela (publicada rev N / pendente: motivo / arquivada). Só calcula; nada é
// gravado. Owner/admin.
import { tratarPrescricoesTalhao } from '@/lib/precisionfarm/rota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ talhaoId: string }> }) {
  const { talhaoId } = await params;
  return tratarPrescricoesTalhao(req, talhaoId);
}
