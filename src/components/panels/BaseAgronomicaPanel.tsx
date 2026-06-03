import { PanelSection, PanelRow } from './_shared';
const NUTRIENTES = ['pH', 'P', 'K', 'Ca', 'Mg', 'Al', 'H+Al', 'CTC', 'V%', 'MO', 'S', 'B', 'Zn', 'Cu', 'Mn'];
const PROFUNDIDADES = ['0–10 cm', '0–20 cm', '10–20 cm', '20–40 cm', '40–60 cm'];
const METODOLOGIAS = ['Embrapa Cerrado', 'CQFS RS/SC', 'IAC', 'Legenda Invicta'];
export function BaseAgronomicaPanel() {
  return (
    <div>
      <PanelSection title="Nutrientes e Atributos">
        <div className="flex flex-wrap gap-1.5 px-4 py-3">
          {NUTRIENTES.map(n => (
            <span key={n} className="px-2 py-1 rounded text-xs font-bold" style={{ background: '#1a3a6b', color: '#93c5fd' }}>{n}</span>
          ))}
        </div>
      </PanelSection>
      <PanelSection title="Profundidades">
        {PROFUNDIDADES.map(p => <PanelRow key={p} label={p} value="Ativa" />)}
      </PanelSection>
      <PanelSection title="Metodologias">
        {METODOLOGIAS.map(m => <PanelRow key={m} label={m} value="›" />)}
      </PanelSection>
    </div>
  );
}
