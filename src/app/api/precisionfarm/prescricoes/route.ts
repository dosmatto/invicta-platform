// POST /api/precisionfarm/prescricoes — estrela "Enviar à PrecisionFarm" das
// prescrições (extensão 0.3.0). { talhaoId, linhagemId, marcada } grava a
// estrela (owner/admin) e sincroniza; { talhaoId } só sincroniza (versão nova
// salva, exclusão, "Publicar prescrições" da tela de lote).
import { tratarPrescricoes } from '@/lib/precisionfarm/rota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  return tratarPrescricoes(req);
}
