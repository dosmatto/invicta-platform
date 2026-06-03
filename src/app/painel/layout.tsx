'use client';

import { AppProvider } from '@/context/AppContext';
import { TopBar } from '@/components/layout/TopBar';
import { IconSidebar } from '@/components/layout/IconSidebar';
import { SlidePanel } from '@/components/layout/SlidePanel';
import { MapView } from '@/components/map/MapView';

export default function PainelLayout() {
  return (
    <AppProvider>
      <div className="flex flex-col h-screen overflow-hidden">
        {/* Top context bar */}
        <TopBar />

        {/* Main area */}
        <div className="flex flex-1 overflow-hidden relative">
          {/* Narrow icon sidebar */}
          <IconSidebar />

          {/* Slide panel */}
          <SlidePanel />

          {/* Map — fullscreen background */}
          <div className="flex-1 relative overflow-hidden">
            <MapView />
          </div>
        </div>
      </div>
    </AppProvider>
  );
}
