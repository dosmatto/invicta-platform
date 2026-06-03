import { PanelSection, PanelRow } from './_shared';
export function ConfiguracoesPanel() {
  return (
    <div>
      <PanelSection title="Plataforma">
        {['Dados da empresa', 'Versão do sistema', 'Backup de dados'].map(i => <PanelRow key={i} label={i} value="›" />)}
      </PanelSection>
      <PanelSection title="Integrações">
        {['Motor QGIS', 'Firebase', 'Laboratórios parceiros', 'Vercel / Deploy'].map(i => <PanelRow key={i} label={i} value="›" />)}
      </PanelSection>
      <PanelSection title="Sobre">
        <div className="px-4 py-3 space-y-1 text-xs" style={{ color: 'var(--sidebar-section)' }}>
          <p>Invicta Platform</p>
          <p>Versão 0.2</p>
          <p>Consultoria em Agronegócio</p>
        </div>
      </PanelSection>
    </div>
  );
}
