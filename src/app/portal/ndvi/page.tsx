'use client';

// Portal do Produtor → NDVI / NDRE. O shell (layout.tsx) dá menu, cabeçalho e
// filtros; o conteúdo vive em components/portal/paginas/PaginaNdvi.

import { PaginaNdvi } from '@/components/portal/paginas/PaginaNdvi';

export default function NdviPage() {
  return <PaginaNdvi />;
}
