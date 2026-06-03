import { PanelSection, PanelRow } from './_shared';
import { APP_VERSION, CHANGELOG } from '@/constants/version';

export function ConfiguracoesPanel() {
  return (
    <div>
      <PanelSection title="Plataforma">
        {['Dados da empresa', 'Backup de dados'].map(i => <PanelRow key={i} label={i} value="›" />)}
        <PanelRow label="Versão do sistema" value={`v${APP_VERSION}`} />
      </PanelSection>
      <PanelSection title="Integrações">
        {['Motor QGIS', 'Firebase', 'Laboratórios parceiros', 'Vercel / Deploy'].map(i => <PanelRow key={i} label={i} value="›" />)}
      </PanelSection>
      <PanelSection title="Changelog">
        {Object.entries(CHANGELOG).map(([ver, items]) => (
          <div key={ver} className="px-4 py-2 border-b" style={{ borderColor: '#0f2240' }}>
            <p className="text-xs font-bold mb-1" style={{ color: '#93c5fd' }}>v{ver}</p>
            {items.map((item, i) => (
              <p key={i} className="text-[10px] leading-relaxed" style={{ color: 'var(--sidebar-section)' }}>· {item}</p>
            ))}
          </div>
        ))}
      </PanelSection>
      <PanelSection title="Sobre">
        <div className="px-4 py-3 space-y-1 text-xs" style={{ color: 'var(--sidebar-section)' }}>
          <p className="font-semibold" style={{ color: '#e2e8f0' }}>Invicta Platform</p>
          <p>Versão {APP_VERSION}</p>
          <p>Consultoria em Agronegócio</p>
        </div>
      </PanelSection>
    </div>
  );
}
