import type { Metadata, Viewport } from 'next';
import { ColetaShell } from './shell';

// Layout do PWA de Coleta: server component só pra metadata (manifest/ícones);
// o shell client embrulha no AppProvider (login + boot, como /talhao/[id]).

export const metadata: Metadata = {
  title: 'INVICTA Coleta de Solo',
  description: 'Coleta de solo em campo — offline, GPS e sincronização com a Plataforma INVICTA',
  manifest: '/manifest-coleta.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'INVICTA Coleta' },
  icons: { icon: '/icons/coleta-192.png', apple: '/icons/coleta-192.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0a1929',
  viewportFit: 'cover',
};

export default function ColetaLayout({ children }: { children: React.ReactNode }) {
  return <ColetaShell>{children}</ColetaShell>;
}
