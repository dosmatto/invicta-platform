'use client';

// Portal do Produtor — tela cheia, AppProvider próprio (boot/hidratação a partir
// do mesmo localStorage/Firestore). Read-only; o produtor vê só o cliente dele.

import { AppProvider } from '@/context/AppContext';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      {/* O tema global declara `--font-sans: var(--font-sans)` (aponta para si
          mesmo) e o app inteiro cai na serifa padrão do navegador. Até isso ser
          resolvido no tema, o portal fixa a Geist que o layout raiz carrega. */}
      <div style={{ fontFamily: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif' }}>{children}</div>
    </AppProvider>
  );
}
