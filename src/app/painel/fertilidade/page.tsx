import { Header } from '@/components/layout/Header';
import { MockIndicator } from '@/components/shared/MockIndicator';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Leaf, Play, BarChart3 } from 'lucide-react';

const MOCK_RESULTADOS = [
  { talhao: 'Talhão 01', safra: '24/25', campanha: 'Ago/2024', fluxo: 'Grid', metodologia: 'Embrapa Cerrado', status: 'concluido' },
  { talhao: 'Gleba A', safra: '24/25', campanha: 'Ago/2024', fluxo: 'Grid', metodologia: 'Embrapa Cerrado', status: 'concluido' },
  { talhao: 'Talhão 02', safra: '24/25', campanha: 'Out/2024', fluxo: 'Zonas', metodologia: 'Legenda Invicta', status: 'aguardando' },
];

const CLASSES = [
  { classe: 'Muito Baixo', cor: '#d73027', pct: 8 },
  { classe: 'Baixo', cor: '#f46d43', pct: 22 },
  { classe: 'Médio', cor: '#fee090', pct: 41 },
  { classe: 'Alto', cor: '#74add1', pct: 21 },
  { classe: 'Muito Alto', cor: '#2166ac', pct: 8 },
];

export default function FertilidadePage() {
  return (
    <>
      <Header title="Fertilidade" breadcrumb={['Painel Invicta', 'Fertilidade']} />
      <div className="flex-1 p-6 space-y-6">

        {/* Novo processamento */}
        <div className="rounded-xl border p-5"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-2 mb-4">
            <Leaf size={16} style={{ color: 'var(--invicta-green)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Novo Processamento de Fertilidade</h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {['Campanha', 'Metodologia', 'Fluxo', 'Nutriente'].map(f => (
              <div key={f}>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>{f}</label>
                <div className="h-9 rounded-lg border px-3 flex items-center text-sm"
                  style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>Selecionar...</div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 mb-2">
            {['Grid (Interpolação)', 'Zonas de Manejo'].map(f => (
              <label key={f} className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                <input type="radio" name="fluxo" className="accent-blue-700" />
                {f}
              </label>
            ))}
          </div>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white mt-3"
            style={{ background: 'var(--invicta-green-dark)' }}>
            <Play size={14} /> Processar Fertilidade <MockIndicator />
          </button>
        </div>

        {/* Resultado simulado — distribuição */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border p-5"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 size={16} style={{ color: 'var(--invicta-blue)' }} />
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Distribuição por Classe — P (Talhão 01)</h2>
              <MockIndicator />
            </div>
            <div className="space-y-2">
              {CLASSES.map(c => (
                <div key={c.classe} className="flex items-center gap-3">
                  <span className="w-24 text-xs text-right" style={{ color: 'var(--text-secondary)' }}>{c.classe}</span>
                  <div className="flex-1 h-5 rounded-full overflow-hidden" style={{ background: 'var(--bg-app)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${c.pct}%`, background: c.cor }} />
                  </div>
                  <span className="w-8 text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{c.pct}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Mapa simulado */}
          <div className="rounded-xl border overflow-hidden"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
            <div className="flex items-center gap-2 p-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Mapa de Fertilidade — P</h2>
              <MockIndicator />
            </div>
            <div className="h-48 flex items-center justify-center" style={{ background: 'var(--map-bg)' }}>
              <div className="text-center">
                <Leaf size={32} className="mx-auto mb-2 opacity-40" style={{ color: 'var(--invicta-green-light)' }} />
                <p className="text-xs opacity-60" style={{ color: 'var(--invicta-green-light)' }}>Mapa de fertilidade simulado</p>
              </div>
            </div>
            <div className="flex justify-center gap-2 p-3">
              {CLASSES.map(c => (
                <div key={c.classe} className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-sm" style={{ background: c.cor }} />
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{c.classe}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Histórico */}
        <div className="rounded-xl border overflow-hidden"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-2 p-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Processamentos de Fertilidade</h2>
            <MockIndicator />
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--bg-app)' }}>
                {['Talhão', 'Safra', 'Campanha', 'Fluxo', 'Metodologia', 'Status', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOCK_RESULTADOS.map((r, i) => (
                <tr key={i} className="border-t"
                  style={{ borderColor: 'var(--border-color)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-app)' }}>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{r.talhao}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{r.safra}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{r.campanha}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{r.fluxo}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{r.metodologia}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.status as 'concluido' | 'aguardando'} /></td>
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
