'use client';

// Portal do Produtor → Produtividade. O shell (layout.tsx) dá menu, cabeçalho e
// filtros; o conteúdo vive em components/portal/paginas/PaginaProdutividade.

import { PaginaProdutividade } from '@/components/portal/paginas/PaginaProdutividade';

export default function ProdutividadePage() {
  return <PaginaProdutividade />;
}
