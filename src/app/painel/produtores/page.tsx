'use client';

import { useEffect } from 'react';
import { useApp } from '@/context/AppContext';

export default function ProdutoresPage() {
  const { setActivePanel } = useApp();
  useEffect(() => { setActivePanel('produtores'); }, [setActivePanel]);
  return null;
}
