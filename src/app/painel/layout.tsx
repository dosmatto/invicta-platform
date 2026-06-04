'use client';

import dynamic from 'next/dynamic';
import { AppProvider } from '@/context/AppContext';
import { TopBar } from '@/components/layout/TopBar';
import { IconSidebar } from '@/components/layout/IconSidebar';
import { SlidePanel } from '@/components/layout/SlidePanel';

const MapView = dynamic(
  () => import('@/components/map/MapView').then(m => ({ default: m.MapView })),
  { ssr: false, loading: () => <div className="flex-1" style={{ background: '#0a1929' }} /> }
);

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <div className="flex flex-col h-screen overflow-hidden">
        <TopBar />
        <div className="flex flex-1 overflow-hidden relative">
          <IconSidebar />
          <SlidePanel />
          <div className="flex-1 relative overflow-hidden">
            <MapView />
          </div>
        </div>
      </div>
      {/* Páginas de rota ocultas — navegação via SlidePanel */}
      <div className="hidden">{children}</div>
    </AppProvider>
  );
}
