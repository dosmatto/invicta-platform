// Qualquer outro caminho sob /integration/v1 — 404 em JSON no formato de erro do
// contrato, em vez da página HTML do Next. As rotas reais (estáticas/dinâmicas
// mais específicas) vencem este catch-all.
import { tratarRotaDesconhecida } from '@/lib/precisionfarm/rota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return tratarRotaDesconhecida();
}

export function POST() {
  return tratarRotaDesconhecida();
}
