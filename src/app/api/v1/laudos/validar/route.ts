// POST /api/v1/laudos/validar — mesma validação da rota real, SEM gravar.
//
// É o "ambiente de homologação" do laboratório sem existir ambiente separado:
// ele confere formato, unidades e numeração das amostras contra a remessa de
// verdade e devolve o que a plataforma entenderia, sem tocar em dado nenhum.
import { tratarLaudo } from '@/lib/laudo/rota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return tratarLaudo(req, { gravar: false });
}
