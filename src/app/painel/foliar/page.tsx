'use client';

// Rota do painel Foliar (ledger 29). É um STUB de propósito: quem desenha é o
// `FoliarPanel` dentro do `SlidePanel`, sobre o mapa — a página só liga o
// painel. Mesmo molde de `painel/produtores/page.tsx` (o `painel/safras` é mock
// morto e não serve de modelo).

import { useEffect } from 'react';
import { useApp } from '@/context/AppContext';

export default function FoliarPage() {
  const { setActivePanel } = useApp();
  useEffect(() => { setActivePanel('foliar'); }, [setActivePanel]);
  return null;
}
