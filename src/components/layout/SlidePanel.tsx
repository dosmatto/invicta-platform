'use client';

import { X } from 'lucide-react';
import { useApp } from '@/context/AppContext';

// Panels
import { DashboardPanel } from '@/components/panels/DashboardPanel';
import { ProdutoresPanel } from '@/components/panels/ProdutoresPanel';
import { FazendasPanel } from '@/components/panels/FazendasPanel';
import { TalhoesPanel } from '@/components/panels/TalhoesPanel';
import { SafrasPanel } from '@/components/panels/SafrasPanel';
import { AmostragemPanel } from '@/components/panels/AmostragemPanel';
import { FertilidadePanel } from '@/components/panels/FertilidadePanel';
import { NdviPanel } from '@/components/panels/NdviPanel';
import { CondutividadePanel } from '@/components/panels/CondutividadePanel';
import { ProdutividadePanel } from '@/components/panels/ProdutividadePanel';
import { ZonesManejoPanel } from '@/components/panels/ZonesManejoPanel';
import { MapasAplicacaoPanel } from '@/components/panels/MapasAplicacaoPanel';
import { LaboratoriosPanel } from '@/components/panels/LaboratoriosPanel';
import { QrCodePanel } from '@/components/panels/QrCodePanel';
import { BaseAgronomicaPanel } from '@/components/panels/BaseAgronomicaPanel';
import { RelatoriosPanel } from '@/components/panels/RelatoriosPanel';
import { UsuariosPanel } from '@/components/panels/UsuariosPanel';
import { ConfiguracoesPanel } from '@/components/panels/ConfiguracoesPanel';

const PANELS: Record<string, { title: string; component: React.ComponentType }> = {
  dashboard:       { title: 'Início',                component: DashboardPanel },
  produtores:      { title: 'Produtores / Clientes', component: ProdutoresPanel },
  fazendas:        { title: 'Fazendas',              component: FazendasPanel },
  talhoes:         { title: 'Talhões',               component: TalhoesPanel },
  safras:          { title: 'Safras e Culturas',     component: SafrasPanel },
  amostragem:      { title: 'Amostragem',            component: AmostragemPanel },
  fertilidade:     { title: 'Fertilidade',           component: FertilidadePanel },
  ndvi:            { title: 'NDVI / Satélite',       component: NdviPanel },
  condutividade:   { title: 'Condutividade Elétrica',component: CondutividadePanel },
  produtividade:   { title: 'Produtividade',         component: ProdutividadePanel },
  'zonas-manejo':  { title: 'Zonas de Manejo',       component: ZonesManejoPanel },
  'mapas-aplicacao':{ title: 'Mapas de Aplicação',   component: MapasAplicacaoPanel },
  laboratorios:    { title: 'Laboratórios',          component: LaboratoriosPanel },
  qrcode:          { title: 'QR Code e Etiquetas',   component: QrCodePanel },
  'base-agronomica':{ title: 'Base Agronômica',      component: BaseAgronomicaPanel },
  relatorios:      { title: 'Relatórios',            component: RelatoriosPanel },
  usuarios:        { title: 'Usuários',              component: UsuariosPanel },
  configuracoes:   { title: 'Configurações',         component: ConfiguracoesPanel },
};

export function SlidePanel() {
  const { activePanel, setActivePanel } = useApp();

  if (!activePanel || !PANELS[activePanel]) return null;

  const { title, component: PanelComponent } = PANELS[activePanel];

  return (
    <div
      className="flex flex-col z-30 overflow-hidden flex-shrink-0"
      style={{
        width: '300px',
        background: 'var(--invicta-blue-dark)',
        borderRight: '1px solid #1a3a6b',
      }}
    >
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid #1a3a6b' }}>
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: '#fff' }}>
          {title}
        </h2>
        <button
          onClick={() => setActivePanel(null)}
          className="p-1 rounded hover:bg-white/10 transition-colors"
        >
          <X size={14} style={{ color: 'var(--sidebar-text)' }} />
        </button>
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-y-auto">
        <PanelComponent />
      </div>
    </div>
  );
}
