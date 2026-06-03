import { Header } from '@/components/layout/Header';
import { MockIndicator } from '@/components/shared/MockIndicator';
import { Plus, FlaskConical, Layers, BookOpen, Leaf } from 'lucide-react';

const NUTRIENTES = [
  { simbolo: 'pH', nome: 'pH do Solo', unidade: '—', metodo: 'CaCl₂' },
  { simbolo: 'P', nome: 'Fósforo', unidade: 'mg/dm³', metodo: 'Mehlich-1' },
  { simbolo: 'K', nome: 'Potássio', unidade: 'cmolc/dm³', metodo: 'Mehlich-1' },
  { simbolo: 'Ca', nome: 'Cálcio', unidade: 'cmolc/dm³', metodo: 'KCl' },
  { simbolo: 'Mg', nome: 'Magnésio', unidade: 'cmolc/dm³', metodo: 'KCl' },
  { simbolo: 'Al', nome: 'Alumínio', unidade: 'cmolc/dm³', metodo: 'KCl' },
  { simbolo: 'S', nome: 'Enxofre', unidade: 'mg/dm³', metodo: 'Fosfato de cálcio' },
  { simbolo: 'B', nome: 'Boro', unidade: 'mg/dm³', metodo: 'Agua quente' },
  { simbolo: 'Zn', nome: 'Zinco', unidade: 'mg/dm³', metodo: 'Mehlich-1' },
  { simbolo: 'Cu', nome: 'Cobre', unidade: 'mg/dm³', metodo: 'Mehlich-1' },
  { simbolo: 'MO', nome: 'Matéria Orgânica', unidade: 'g/dm³', metodo: 'Walkley-Black' },
  { simbolo: 'V%', nome: 'Saturação de Bases', unidade: '%', metodo: 'Calculado' },
];

const PROFUNDIDADES = [
  { label: '0–10 cm', ativa: true },
  { label: '0–20 cm', ativa: true },
  { label: '10–20 cm', ativa: true },
  { label: '20–40 cm', ativa: true },
  { label: '40–60 cm', ativa: false },
];

const METODOLOGIAS = [
  { nome: 'Embrapa Cerrado', regiao: 'Cerrado / MT / GO', status: 'ativa' },
  { nome: 'CQFS RS/SC', regiao: 'Sul do Brasil', status: 'ativa' },
  { nome: 'IAC', regiao: 'São Paulo', status: 'ativa' },
  { nome: 'Legenda Invicta', regiao: 'Personalizada', status: 'ativa' },
];

const CULTURAS = [
  { nome: 'Soja', ciclo: '110–130 dias' },
  { nome: 'Milho', ciclo: '120–140 dias' },
  { nome: 'Milho Safrinha', ciclo: '100–115 dias' },
  { nome: 'Algodão', ciclo: '150–180 dias' },
  { nome: 'Trigo', ciclo: '90–110 dias' },
  { nome: 'Feijão', ciclo: '85–100 dias' },
];

function SectionCard({ title, icon: Icon, color, children }: {
  title: string; icon: React.ElementType; color: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border overflow-hidden"
      style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
      <div className="flex items-center justify-between p-4 border-b"
        style={{ borderColor: 'var(--border-color)' }}>
        <div className="flex items-center gap-2">
          <Icon size={16} style={{ color }} />
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
          <MockIndicator />
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
          style={{ background: 'var(--invicta-blue)' }}>
          <Plus size={12} /> Adicionar
        </button>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export default function BaseAgronomicaPage() {
  return (
    <>
      <Header title="Base Agronômica" breadcrumb={['Painel Invicta', 'Base Agronômica']} />
      <div className="flex-1 p-6 space-y-6">

        {/* Nutrientes */}
        <SectionCard title="Nutrientes e Atributos" icon={FlaskConical} color="var(--invicta-blue)">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {NUTRIENTES.map(n => (
              <div key={n.simbolo} className="rounded-lg border p-3"
                style={{ borderColor: 'var(--border-color)', background: 'var(--bg-app)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-8 h-8 rounded-md flex items-center justify-center text-white text-xs font-bold"
                    style={{ background: 'var(--invicta-blue)' }}>{n.simbolo}</span>
                  <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{n.nome}</span>
                </div>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{n.unidade} · {n.metodo}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Profundidades */}
          <SectionCard title="Profundidades" icon={Layers} color="var(--invicta-green)">
            <div className="space-y-2">
              {PROFUNDIDADES.map(p => (
                <div key={p.label} className="flex items-center justify-between py-2 border-b last:border-0"
                  style={{ borderColor: 'var(--border-color)' }}>
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{p.label}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full"
                    style={{
                      background: p.ativa ? 'var(--status-active-bg)' : '#f1f5f9',
                      color: p.ativa ? 'var(--status-active)' : '#64748b',
                    }}>
                    {p.ativa ? 'Ativa' : 'Inativa'}
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Metodologias */}
          <SectionCard title="Metodologias" icon={BookOpen} color="var(--invicta-blue-mid)">
            <div className="space-y-2">
              {METODOLOGIAS.map(m => (
                <div key={m.nome} className="py-2 border-b last:border-0"
                  style={{ borderColor: 'var(--border-color)' }}>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{m.nome}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{m.regiao}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Culturas */}
          <SectionCard title="Culturas" icon={Leaf} color="var(--invicta-green-dark)">
            <div className="space-y-2">
              {CULTURAS.map(c => (
                <div key={c.nome} className="flex items-center justify-between py-2 border-b last:border-0"
                  style={{ borderColor: 'var(--border-color)' }}>
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{c.nome}</span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{c.ciclo}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </>
  );
}
