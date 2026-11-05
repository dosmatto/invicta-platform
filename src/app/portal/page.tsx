'use client';

// Portal do Produtor — Visão geral (Portal v2). O shell (layout.tsx) já
// resolveu quem vê e montou o contexto com os filtros; a página é só o
// conteúdo: components/portal/visao/VisaoGeral. Com o filtro Talhão = um
// talhão, a mesma tela vira o painel do talhão.

import { VisaoGeral } from '@/components/portal/visao/VisaoGeral';

export default function PortalPage() {
  return <VisaoGeral />;
}
