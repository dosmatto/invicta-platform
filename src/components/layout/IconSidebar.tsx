'use client';

import {
  LayoutDashboard, Users, Building2, Map, CalendarDays,
  FlaskConical, Grid3x3, QrCode, TestTube, Leaf, Satellite,
  Zap, BarChart3, Layers, FileSpreadsheet, FileText,
  Settings, Shield,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';

const MENU = [
  { id: 'dashboard',       label: 'Início',       icon: LayoutDashboard },
  { id: 'produtores',      label: 'Clientes',     icon: Users },
  { id: 'fazendas',        label: 'Fazendas',     icon: Building2 },
  { id: 'talhoes',         label: 'Talhões',      icon: Map },
  { id: 'safras',          label: 'Safras',       icon: CalendarDays },
  null, // divider
  { id: 'amostragem',      label: 'Amost.',       icon: Grid3x3 },
  { id: 'fertilidade',     label: 'Fertil.',      icon: Leaf },
  { id: 'ndvi',            label: 'Satélite',     icon: Satellite },
  { id: 'condutividade',   label: 'CE',           icon: Zap },
  { id: 'produtividade',   label: 'Produt.',      icon: BarChart3 },
  null, // divider
  { id: 'zonas-manejo',    label: 'Zonas',        icon: Layers },
  { id: 'mapas-aplicacao', label: 'Aplicação',    icon: FileSpreadsheet },
  null, // divider
  { id: 'laboratorios',    label: 'Lab.',         icon: TestTube },
  { id: 'qrcode',          label: 'QR Code',      icon: QrCode },
  { id: 'base-agronomica', label: 'Base Ag.',     icon: FlaskConical },
  { id: 'relatorios',      label: 'Relat.',       icon: FileText },
  null, // divider
  { id: 'usuarios',        label: 'Usuários',     icon: Shield },
  { id: 'configuracoes',   label: 'Config.',      icon: Settings },
];

export function IconSidebar() {
  const { activePanel, setActivePanel } = useApp();

  function handleClick(id: string) {
    setActivePanel(activePanel === id ? null : id);
  }

  return (
    <aside
      className="flex flex-col items-center py-2 gap-0.5 overflow-y-auto z-40 flex-shrink-0"
      style={{
        width: '64px',
        background: 'var(--invicta-blue-dark)',
        borderRight: '1px solid #1a3a6b',
      }}
    >
      {MENU.map((item, i) => {
        if (!item) {
          return <div key={`div-${i}`} className="w-8 my-1" style={{ height: '1px', background: '#1a3a6b' }} />;
        }

        const Icon = item.icon;
        const isActive = activePanel === item.id;

        return (
          <button
            key={item.id}
            onClick={() => handleClick(item.id)}
            title={item.label}
            className="flex flex-col items-center gap-1 w-full px-1 py-2.5 rounded-md transition-all"
            style={{
              background: isActive ? 'var(--invicta-blue)' : 'transparent',
              color: isActive ? '#fff' : 'var(--sidebar-text)',
              borderLeft: isActive ? '3px solid var(--invicta-green)' : '3px solid transparent',
            }}
            onMouseEnter={e => {
              if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-item-hover)';
            }}
            onMouseLeave={e => {
              if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent';
            }}
          >
            <Icon size={18} />
            <span className="text-[9px] font-medium leading-tight text-center" style={{ maxWidth: '52px' }}>
              {item.label}
            </span>
          </button>
        );
      })}
    </aside>
  );
}
