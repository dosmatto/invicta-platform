// POST /integration/v1/notifications — aviso de revisão da PrecisionFarm (fase 2:
// só linhas, resource_type 'guidance'). Bearer da PF + X-PF-Timestamp +
// X-PF-Signature (HMAC com PF_HMAC_ENTRADA). Enfileira ANTES do 202 e processa
// logo depois com after(); o cron (pg_cron) pega o que sobrar.
// Contrato: docs/integracao-precisionfarm.md §6.
import { tratarMetodoNaoPermitido, tratarNotificacao } from '@/lib/precisionfarm/rota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// O after() roda dentro deste prazo: buscar e validar uma revisão de até 10 MB.
export const maxDuration = 60;

export async function POST(req: Request) {
  return tratarNotificacao(req);
}

export function GET() {
  return tratarMetodoNaoPermitido();
}
