import { Header } from '@/components/layout/Header';
import { MockIndicator } from '@/components/shared/MockIndicator';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Plus, Grid3x3, MapPin } from 'lucide-react';

const MOCK_CAMPANHAS = [
  { id: '1', talhao: 'Talhão 01', fazenda: 'Fazenda São João', safra: '24/25', tipo: 'Grid Fixo', pontos: 12, status: 'concluido', data: '15/08/2024' },
  { id: '2', talhao: 'Gleba A', fazenda: 'Fazenda Santa Rita', safra: '24/25', tipo: 'Grid Variável', pontos: 18, status: 'concluido', data: '20/08/2024' },
  { id: '3', talhao: 'Talhão 02', fazenda: 'Fazenda São João', safra: '24/25', tipo: 'Grid Fixo', pontos: 15, status: 'aguardando', data: '—' },
];

export default function AmostragemPage() {
  return (
    <>
      <Header title="Amostragem" breadcrumb={['Painel Invicta', 'Amostragem']} />
      <div className="flex-1 p-6 space-y-5">

        {/* Nova campanha */}
        <div className="rounded-xl border p-5"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-2 mb-4">
            <Grid3x3 size={16} style={{ color: 'var(--invicta-blue)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Nova Campanha de Amostragem</h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {['Talhão', 'Safra', 'Método', 'Espaçamento'].map(f => (
              <div key={f}>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>{f}</label>
                <div className="h-9 rounded-lg border px-3 flex items-center text-sm"
                  style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
                  Selecionar...
                </div>
              </div>
            ))}
          </div>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: 'var(--invicta-blue)' }}>
            <Plus size={14} /> Iniciar Nova Campanha
          </button>
        </div>

        {/* Campanhas */}
        <div className="rounded-xl border overflow-hidden"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-2 p-4 border-b"
            style={{ borderColor: 'var(--border-color)' }}>
            <MapPin size={16} style={{ color: 'var(--invicta-green)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Campanhas de Amostragem</h2>
            <MockIndicator />
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--bg-app)' }}>
                {['Talhão', 'Fazenda', 'Safra', 'Método', 'Pontos', 'Data', 'Status', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOCK_CAMPANHAS.map((c, i) => (
                <tr key={c.id} className="border-t"
                  style={{ borderColor: 'var(--border-color)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-app)' }}>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{c.talhao}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{c.fazenda}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{c.safra}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{c.tipo}</td>
                  <td className="px-4 py-3 text-center" style={{ color: 'var(--text-secondary)' }}>{c.pontos}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{c.data}</td>
                  <td className="px-4 py-3"><StatusBadge status={c.status as 'concluido' | 'aguardando'} /></td>
                  <td className="px-4 py-3">
                    <button className="text-xs font-medium" style={{ color: 'var(--invicta-blue-mid)' }}>Ver mapa</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
