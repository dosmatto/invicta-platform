// GET /api/precisionfarm/lote — todos os vínculos da parceria (qualquer status)
// com o que já foi publicado e as linhas recebidas: tela Biblioteca →
// PrecisionFarm. Sessão do usuário, owner/admin. Só lê.
import { tratarLote } from '@/lib/precisionfarm/rota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  return tratarLote(req);
}
