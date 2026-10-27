// POST /api/precisionfarm/publicar — publica o zoneamento padrão ou a colheita
// oficial como revisão imutável para a PrecisionFarm. Sessão do usuário
// (owner/admin). Lê a camada na nuvem; grava só em pf_recursos/pf_revisoes.
import { tratarPublicacao } from '@/lib/precisionfarm/rota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A colheita oficial pode ter dezenas de milhares de células: folga de tempo.
export const maxDuration = 60;

export async function POST(req: Request) {
  return tratarPublicacao(req);
}
