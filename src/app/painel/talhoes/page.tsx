import { Header } from '@/components/layout/Header';
import { MockIndicator } from '@/components/shared/MockIndicator';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { MOCK_TALHOES } from '@/constants/mocks';
import { Plus, Search, AlertTriangle } from 'lucide-react';

export default function TalhoesPage() {
  const incompletos = MOCK_TALHOES.filter(t => t.status === 'incompleto').length;

  return (
    <>
      <Header title="Talhões" breadcrumb={['Painel Invicta', 'Talhões']} />
      <div className="flex-1 p-6 space-y-4">

        {incompletos > 0 && (
          <div className="flex items-center gap-3 p-3 rounded-lg border text-sm"
            style={{ background: 'var(--status-warning-bg)', borderColor: '#fcd34d', color: 'var(--status-warning)' }}>
            <AlertTriangle size={16} />
            <strong>{incompletos} talhão(ões)</strong> sem limite geográfico — status Incompleto.
          </div>
        )}

        <div className="rounded-xl border overflow-hidden"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
          <div className="flex items-center justify-between p-4 border-b gap-3"
            style={{ borderColor: 'var(--border-color)' }}>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Todos os Talhões</h2>
              <MockIndicator />
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm"
                style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
                <Search size={14} /><span>Buscar talhão...</span>
              </div>
              <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-white"
                style={{ background: 'var(--invicta-blue)' }}>
                <Plus size={14} /> Novo Talhão
              </button>
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--bg-app)' }}>
                {['Nome', 'Fazenda', 'Área (ha)', 'Safra Atual', 'Status', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold"
                    style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOCK_TALHOES.map((t, i) => (
                <tr key={t.id} className="border-t"
                  style={{ borderColor: 'var(--border-color)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-app)' }}>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{t.nome}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{t.fazenda}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{t.area} ha</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{t.safra}</td>
                  <td className="px-4 py-3"><StatusBadge status={t.status as 'ativo' | 'incompleto'} /></td>
                  <td className="px-4 py-3">
                    <a href={`/painel/talhoes/${t.id}`} className="text-xs font-medium"
                      style={{ color: 'var(--invicta-blue-mid)' }}>Ver detalhes</a>
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
