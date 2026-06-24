'use client';

// Portal do Produtor — tela cheia, AppProvider próprio (boot/hidratação a partir
// do mesmo localStorage/Firestore). Read-only; o produtor vê só o cliente dele.

import { AppProvider } from '@/context/AppContext';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <AppProvider>{children}</AppProvider>;
}
