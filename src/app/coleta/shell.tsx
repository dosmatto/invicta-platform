'use client';

import { AppProvider } from '@/context/AppContext';

export function ColetaShell({ children }: { children: React.ReactNode }) {
  return <AppProvider>{children}</AppProvider>;
}
