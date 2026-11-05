'use client';

// Portal do Produtor → Linhas de plantio. O shell (layout.tsx) dá menu,
// cabeçalho e filtros; o conteúdo está em components/portal/paginas/LinhasPagina.tsx.

import { LinhasPagina } from '@/components/portal/paginas/LinhasPagina';

export default function LinhasPage() {
  return <LinhasPagina />;
}
