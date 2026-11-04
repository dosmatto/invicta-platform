// POST /api/precisionfarm/linhas-resumo { talhaoIds } — quais talhões têm
// camada de linhas vigente da PrecisionFarm (selo na lista da fazenda).
// Sessão do usuário e acesso talhão a talhão (mesma regra da aba Linhas).
import { tratarResumoLinhas } from '@/lib/precisionfarm/rota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(req: Request) {
  return tratarResumoLinhas(req);
}
