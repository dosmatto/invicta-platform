'use client';

// Portal do Produtor → Fertilidade do solo. O shell (layout.tsx) dá menu, cabeçalho
// e filtros; o conteúdo está em components/portal/paginas/SoloFertilidade.tsx.

import { PaginaFertilidade } from '@/components/portal/paginas/SoloFertilidade';

export default function FertilidadePage() {
  return <PaginaFertilidade />;
}
