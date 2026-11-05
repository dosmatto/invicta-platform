// POST /api/portal/benchmark { safra, clienteId? } — Comparativo Invicta
// (benchmark anônimo entre produtores: produtividade por cultura e P/K/V%).
// Sessão do usuário; o cálculo roda só aqui, com a service role, e só o
// agregado sai (lib/portal/benchmarkServidor.ts + benchmarkCalc.ts).
import { tratarBenchmark } from '@/lib/portal/benchmarkServidor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A 1ª leitura do ano (laudos de todos os produtores) é pesada; depois vem do cache.
export const maxDuration = 60;

export function POST(req: Request) {
  return tratarBenchmark(req);
}
