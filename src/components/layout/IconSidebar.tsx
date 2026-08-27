'use client';

import {
  LayoutDashboard, Users, Settings, Library, Ruler,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { APP_VERSION } from '@/constants/version';
import { SyncBadge } from '@/components/shared/SyncBadge';

const MENU = [
  { id: 'dashboard',       label: 'Início',   icon: LayoutDashboard },
  null,
  { id: 'produtores',      label: 'Clientes', icon: Users },
  null,
  { id: 'medicoes',        label: 'Medições', icon: Ruler },
  null,
  { id: 'biblioteca',      label: 'Biblioteca', icon: Library },
  null,
  { id: 'configuracoes',   label: 'Config.',  icon: Settings },
];

export function IconSidebar() {
  const { activePanel, setActivePanel } = useApp();

  function handleClick(id: string) {
    setActivePanel(activePanel === id ? null : id);
  }

  return (
    <aside
      className="flex flex-col items-center py-2 gap-0.5 overflow-y-auto z-40 flex-shrink-0"
      style={{ width: '64px', background: 'var(--invicta-blue-dark)', borderRight: '1px solid #1a3a6b' }}
    >
      {MENU.map((item, i) => {
        if (!item) return <div key={`d-${i}`} className="w-8 my-1" style={{ height: '1px', background: '#1a3a6b' }} />;
        const Icon = item.icon;
        const isActive = activePanel === item.id
          || (item.id === 'produtores' && (
            activePanel?.startsWith('produtor-') ||
            activePanel?.startsWith('fazenda-') ||
            activePanel?.startsWith('talhao-')
          ));
        return (
          <button key={item.id} onClick={() => handleClick(item.id)}
            className="flex flex-col items-center gap-1 w-full px-1 py-2.5 rounded-md transition-all"
            style={{
              background: isActive ? 'var(--invicta-blue)' : 'transparent',
              color: isActive ? '#fff' : 'var(--sidebar-text)',
              borderLeft: isActive ? '3px solid var(--invicta-green)' : '3px solid transparent',
            }}
            onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-item-hover)'; }}
            onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <Icon size={18} />
            <span className="text-[9px] font-medium leading-tight text-center" style={{ maxWidth: '52px' }}>
              {item.label}
            </span>
          </button>
        );
      })}
      <div className="flex-1" />
      <div className="flex justify-center py-1 flex-shrink-0">
        <SyncBadge iconOnly />
      </div>
      <div className="py-2 text-center text-[9px] font-mono flex-shrink-0"
        style={{ color: '#2e5fa3', borderTop: '1px solid #1a3a6b', width: '100%' }}>
        v{APP_VERSION}
      </div>
    </aside>
  );
}
