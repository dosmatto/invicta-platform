'use client';

import { X } from 'lucide-react';
import { useApp } from '@/context/AppContext';

// Painéis de navegação
import { DashboardPanel } from '@/components/panels/DashboardPanel';
import { ProdutoresPanel } from '@/components/panels/ProdutoresPanel';
import { ProdutorDetailPanel } from '@/components/panels/ProdutorDetailPanel';
import { FazendaDetailPanel } from '@/components/panels/FazendaDetailPanel';
import { TalhaoDetailPanel } from '@/components/panels/TalhaoDetailPanel';

// Painéis auxiliares
import { SafrasPanel } from '@/components/panels/SafrasPanel';
import { BaseAgronomicaPanel } from '@/components/panels/BaseAgronomicaPanel';
import { UsuariosPanel } from '@/components/panels/UsuariosPanel';
import { ConfiguracoesPanel } from '@/components/panels/ConfiguracoesPanel';

const STATIC_PANELS: Record<string, { title: string; component: React.ComponentType }> = {
  dashboard:         { title: 'Início',          component: DashboardPanel },
  produtores:        { title: 'Clientes',        component: ProdutoresPanel },
  safras:            { title: 'Safras',          component: SafrasPanel },
  'base-agronomica': { title: 'Base Agronômica', component: BaseAgronomicaPanel },
  usuarios:          { title: 'Usuários',        component: UsuariosPanel },
  configuracoes:     { title: 'Configurações',   component: ConfiguracoesPanel },
};

export function SlidePanel() {
  const { activePanel, setActivePanel } = useApp();

  if (!activePanel) return null;

  // Roteamento hierárquico — sem header próprio (painel gerencia internamente)
  if (activePanel.startsWith('produtor-')) {
    return (
      <div className="flex flex-col z-30 overflow-hidden flex-shrink-0"
        style={{ width: '320px', background: 'var(--invicta-blue-dark)', borderRight: '1px solid #1a3a6b' }}>
        <ProdutorDetailPanel />
      </div>
    );
  }

  if (activePanel.startsWith('fazenda-')) {
    return (
      <div className="flex flex-col z-30 overflow-hidden flex-shrink-0"
        style={{ width: '320px', background: 'var(--invicta-blue-dark)', borderRight: '1px solid #1a3a6b' }}>
        <FazendaDetailPanel />
      </div>
    );
  }

  if (activePanel.startsWith('talhao-')) {
    return (
      <div className="flex flex-col z-30 overflow-hidden flex-shrink-0"
        style={{ width: '320px', background: 'var(--invicta-blue-dark)', borderRight: '1px solid #1a3a6b' }}>
        <TalhaoDetailPanel />
      </div>
    );
  }

  // Painéis estáticos com header padrão
  const panel = STATIC_PANELS[activePanel];
  if (!panel) return null;

  const { title, component: PanelComponent } = panel;

  return (
    <div className="flex flex-col z-30 overflow-hidden flex-shrink-0"
      style={{ width: '300px', background: 'var(--invicta-blue-dark)', borderRight: '1px solid #1a3a6b' }}>
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid #1a3a6b' }}>
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: '#fff' }}>{title}</h2>
        <button onClick={() => setActivePanel(null)} className="p-1 rounded hover:bg-white/10 transition-colors">
          <X size={14} style={{ color: 'var(--sidebar-text)' }} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <PanelComponent />
      </div>
    </div>
  );
}
