// POST /api/v1/programacao/validar — mesma validação e o mesmo plano da rota
// real (o que seria criado/atualizado, com id e versão), SEM gravar.
import { tratarProgramacao } from '@/lib/programacao/rota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return tratarProgramacao(req, { gravar: false });
}
