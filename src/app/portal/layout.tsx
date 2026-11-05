'use client';

// Portal do Produtor — tela cheia, AppProvider próprio (boot/hidratação a partir
// do mesmo localStorage/Firestore). Read-only; o produtor vê só o cliente dele.
//
// Desde o Portal v2 o layout é o SHELL de todas as rotas do portal
// (components/portal/shell/PortalShell): quem vê, o contexto com os filtros e
// a moldura (menu lateral + cabeçalho). As páginas só desenham o conteúdo.
//
// <Suspense>: o shell lê a URL com useSearchParams (filtros e ?cliente= do
// preview); sem a fronteira, o build recusa o prerender da rota.

import { Suspense } from 'react';
import { AppProvider } from '@/context/AppContext';
import { PortalShell } from '@/components/portal/shell/PortalShell';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      {/* O tema global declara `--font-sans: var(--font-sans)` (aponta para si
          mesmo) e o app inteiro cai na serifa padrão do navegador. Até isso ser
          resolvido no tema, o portal fixa a Geist que o layout raiz carrega
          (no PortalShell). */}
      <Suspense fallback={null}>
        <PortalShell>{children}</PortalShell>
      </Suspense>
    </AppProvider>
  );
}
