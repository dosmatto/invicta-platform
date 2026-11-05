'use client';

// Portal do Produtor → Condutividade elétrica. O shell (layout.tsx) dá menu,
// cabeçalho e filtros; o conteúdo vive em components/portal/paginas/PaginaCondutividade.

import { PaginaCondutividade } from '@/components/portal/paginas/PaginaCondutividade';

export default function CondutividadePage() {
  return <PaginaCondutividade />;
}
