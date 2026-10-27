// POST /api/precisionfarm/vinculo — { talhaoId, acao: criar|salvar|confirmar|suspender, pfLocalId? }
// Sessão do usuário (owner/admin). Grava só em pf_vinculos.
import { tratarVinculo } from '@/lib/precisionfarm/rota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return tratarVinculo(req);
}
