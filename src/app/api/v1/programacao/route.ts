// POST /api/v1/programacao — a Lavra devolve as doses programadas por zona e a
// AP grava as prescrições (contrato: docs/integracao-lavra.md).
//
// 'nodejs' e não edge: usa node:crypto (hash da chave) e a service role do
// Supabase. 'force-dynamic': POST autenticado, nada pode ser cacheado.
//
// Depois de gravar versões novas, as linhagens com a estrela "Enviar à
// PrecisionFarm" publicam a versão nova (extensão 0.3, Q4) — logo depois da
// resposta (after), sem atrasar a Lavra; falha fica registrada na estrela.
import { after } from 'next/server';
import { tratarProgramacao } from '@/lib/programacao/rota';
import { sincronizarPrescricoesAposLavra } from '@/lib/precisionfarm/rota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return tratarProgramacao(req, {
    gravar: true,
    aposGravar: talhaoId => after(() => sincronizarPrescricoesAposLavra(talhaoId)),
  });
}
