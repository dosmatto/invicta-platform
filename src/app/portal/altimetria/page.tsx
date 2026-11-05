'use client';

// Portal do Produtor → Altimetria / Relevo. O shell (layout.tsx) dá menu,
// cabeçalho e filtros; o conteúdo vive em components/portal/paginas/PaginaAltimetria.

import { PaginaAltimetria } from '@/components/portal/paginas/PaginaAltimetria';

export default function AltimetriaPage() {
  return <PaginaAltimetria />;
}
