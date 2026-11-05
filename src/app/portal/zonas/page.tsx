'use client';

// Portal do Produtor → Zonas de manejo. O shell (layout.tsx) dá menu, cabeçalho
// e filtros; o conteúdo está em components/portal/paginas/SoloZonas.tsx.

import { PaginaZonas } from '@/components/portal/paginas/SoloZonas';

export default function ZonasPage() {
  return <PaginaZonas />;
}
