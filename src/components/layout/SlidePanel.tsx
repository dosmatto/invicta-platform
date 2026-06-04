'use client';

import { X } from 'lucide-react';
import { useApp } from '@/context/AppContext';

import { DashboardPanel } from '@/components/panels/DashboardPanel';
import { ProdutoresPanel } from '@/components/panels/ProdutoresPanel';
import { FazendasPanel } from '@/components/panels/FazendasPanel';
import { TalhoesPanel } from '@/components/panels/TalhoesPanel';
import { TalhaoDetailPanel } from '@/components/panels/TalhaoDetailPanel';
import { SafrasPanel } from '@/components/panels/SafrasPanel';
import { BaseAgronomicaPanel } from '@/components/panels/BaseAgronomicaPanel';
import { RelatoriosPanel } from '@/components/panels/RelatoriosPanel';
import { UsuariosPanel } from '@/components/panels/UsuariosPanel';
import { ConfiguracoesPanel } from '@/components/panels/ConfiguracoesPanel';

const PANELS: Record<string, { title: string; component: React.ComponentType; wide?: boolean }> = {
  dashboard:        { title: 'Início',                component: DashboardPanel },
  produtores:       { title: 'Produtores / Clientes', component: ProdutoresPanel },
  fazendas:         { title: 'Fazendas',              component: FazendasPanel },
  talhoes:          { title: 'Talhões',               component: TalhoesPanel },
  safras:           { title: 'Safras e Culturas',     component: SafrasPanel },
  'base-agronomica':{ title: 'Base Agronômica',       component: BaseAgronomicaPanel },
  relatorios:       { title: 'Relatórios',            component: RelatoriosPanel },
  usuarios:         { title: 'Usuários',              component: UsuariosPanel },
  configuracoes:    { title: 'Configurações',         component: ConfiguracoesPanel },
};

export function SlidePanel() {
  const { activePanel, setActivePanel } = useApp();

  if (!activePanel) return null;

  // Talhão detalhe — qualquer painel que começa com "talhao-"
  const isTalhaoDetail = activePanel.startsWith('talhao-');

  if (isTalhaoDetail) {
    return (
      <div className="flex flex-col z-30 overflow-hidden flex-shrink-0"
        style={{ width: '320px', background: 'var(--invicta-blue-dark)', borderRight: '1px solid #1a3a6b' }}>
        <TalhaoDetailPanel />
      </div>
    );
  }

  const panel = PANELS[activePanel];
  if (!panel) return null;

  const { title, component: PanelComponent } = panel;

  return (
    <div className="flex flex-col z-30 overflow-hidden flex-shrink-0"
      style={{ width: '300px', background: 'var(--invicta-blue-dark)', borderRight: '1px solid #1a3a6b' }}>

      {/* Header */}
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
