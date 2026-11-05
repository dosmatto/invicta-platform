'use client';

// Portal do Produtor → Evolução dos nutrientes. O shell (layout.tsx) dá menu,
// cabeçalho e filtros; o conteúdo está em components/portal/paginas/SoloNutrientes.tsx
// (o componente antigo EvolucaoNutrientesPagina foi removido).

import { PaginaNutrientes } from '@/components/portal/paginas/SoloNutrientes';

export default function NutrientesPage() {
  return <PaginaNutrientes />;
}
