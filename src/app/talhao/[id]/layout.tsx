'use client';

// Layout da Página Individual do Talhão — fora de /painel, em tela cheia.
// Tem seu próprio AppProvider (boot/hidratação a partir do mesmo
// localStorage/Firestore), então a rota é deep-linkável e abre em nova aba.

import { AppProvider } from '@/context/AppContext';

export default function TalhaoLayout({ children }: { children: React.ReactNode }) {
  return <AppProvider>{children}</AppProvider>;
}
