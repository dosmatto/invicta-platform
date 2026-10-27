// /integration/v1/changes — previsto no contrato 0.2.0, fora da fase 1 da
// Invicta: responde 501 not_implemented em JSON (docs/integracao-precisionfarm.md).
import { tratarNaoImplementado } from '@/lib/precisionfarm/rota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return tratarNaoImplementado('/changes');
}
