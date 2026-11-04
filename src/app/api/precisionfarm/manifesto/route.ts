// POST /api/precisionfarm/manifesto — { itens: [{ talhaoId, pfLocalId, sharedProducerId,
// sharedFarmId, sharedFieldId, nomePF }] }: cria vínculos PENDENTES com os UUIDs
// do manifesto da PrecisionFarm (Biblioteca → PrecisionFarm → Importar manifesto).
// Sessão do usuário, owner/admin. Grava só em pf_vinculos.
import { tratarManifesto } from '@/lib/precisionfarm/rota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  return tratarManifesto(req);
}
