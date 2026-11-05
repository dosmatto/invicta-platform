'use client';

// Portal do Produtor → Prescrições (VR). O shell (layout.tsx) dá menu, cabeçalho
// e filtros; o conteúdo está em components/portal/paginas/SoloPrescricoes.tsx.

import { PaginaPrescricoes } from '@/components/portal/paginas/SoloPrescricoes';

export default function PrescricoesPage() {
  return <PaginaPrescricoes />;
}
