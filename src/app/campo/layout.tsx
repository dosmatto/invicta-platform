import type { Metadata, Viewport } from 'next';

// Rota PUBLICA do "link do prestador" (#3): NAO passa pelo AppProvider/login.
// A pagina e 100% client-side e le a geometria do hash da URL.

export const metadata: Metadata = {
  title: 'INVICTA — Navegacao em campo',
  description: 'Area compartilhada para navegacao por GPS em campo.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0a1929',
  viewportFit: 'cover',
};

export default function CampoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
