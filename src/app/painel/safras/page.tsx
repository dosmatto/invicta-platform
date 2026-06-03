import { Header } from '@/components/layout/Header';
import { MockIndicator } from '@/components/shared/MockIndicator';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Plus, CalendarDays, Leaf } from 'lucide-react';

const MOCK_SAFRAS = [
  { id: '1', nome: '24/25', ano_inicio: 2024, ano_fim: 2025, talhoes: 14, status: 'ativo' },
  { id: '2', nome: '23/24', ano_inicio: 2023, ano_fim: 2024, talhoes: 12, status: 'arquivado' },
  { id: '3', nome: '22/23', ano_inicio: 2022, ano_fim: 2023, talhoes: 10, status: 'arquivado' },
];

const MOCK_CULTIVOS = [
  { talhao: 'Talhão 01', fazenda: 'Fazenda São João', safra: '24/25', cultura: 'Soja', tipo: 'VERÃO', plantio: '10/10/2024', colheita: '15/02/2025', status: 'colhido' },
  { talhao: 'Talhão 02', fazenda: 'Fazenda São João', safra: '24/25', cultura: 'Milho', tipo: 'SAFRINHA', plantio: '01/02/2025', colheita: '—', status: 'ativo' },
  { talhao: 'Gleba A', fazenda: 'Fazenda Santa Rita', safra: '24/25', cultura: 'Soja', tipo: 'VERÃO', plantio: '05/10/2024', colheita: '20/02/2025', status: 'colhido' },
  { talhao: 'Talhão Norte', fazenda: 'Fazenda Boa Vista', safra: '24/25', cultura: 'Algodão', tipo: 'VERÃO', plantio: '20/11/2024', colheita: '—', status: 'ativo' },
];

const TIPO_COLOR: Record<string, string> = {
  'VERÃO': '#2e5fa3', 'SAFRINHA': '#d97706', 'INVERNO': '#7c3aed',
};

export default function SafrasPage() {
  return (
    <>
      <Header title="Safras e Culturas" breadcrumb={['Painel Invicta', 'Safras e Culturas']} />
      <div className="flex-1 p-6 space-y-6">

        {/* Safras */}
        <div className="rounded-xl border overflow-hidden"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
          <div className="flex items-center justify-between p-4 border-b"
            style={{ borderColor: 'var(--border-color)' }}>
            <div className="flex items-center gap-2">
              <CalendarDays size={16} style={{ color: 'var(--invicta-blue)' }} />
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Anos Agrícolas</h2>
              <MockIndicator />
            </div>
            <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-white"
              style={{ background: 'var(--invicta-blue)' }}>
              <Plus size={14} /> Nova Safra
            </button>
          </div>
          <div className="flex gap-4 p-4">
            {MOCK_SAFRAS.map(s => (
              <div key={s.id} className="flex-1 rounded-xl border p-4"
                style={{
                  borderColor: s.status === 'ativo' ? 'var(--invicta-green)' : 'var(--border-color)',
                  background: s.status === 'ativo' ? 'var(--status-active-bg)' : 'var(--bg-app)',
                }}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{s.nome}</p>
                  <StatusBadge status={s.status as 'ativo' | 'arquivado'} />
                </div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.ano_inicio} / {s.ano_fim}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{s.talhoes} talhões cadastrados</p>
              </div>
            ))}
          </div>
        </div>

        {/* Cultivos */}
        <div className="rounded-xl border overflow-hidden"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-2 p-4 border-b"
            style={{ borderColor: 'var(--border-color)' }}>
            <Leaf size={16} style={{ color: 'var(--invicta-green)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Cultivos — Safra 24/25</h2>
            <MockIndicator />
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--bg-app)' }}>
                {['Talhão', 'Fazenda', 'Cultura', 'Tipo', 'Plantio', 'Colheita', 'Status'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOCK_CULTIVOS.map((c, i) => (
                <tr key={i} className="border-t"
                  style={{ borderColor: 'var(--border-color)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-app)' }}>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{c.talhao}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{c.fazenda}</td>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--invicta-green-dark)' }}>{c.cultura}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium text-white"
                      style={{ background: TIPO_COLOR[c.tipo] ?? '#64748b' }}>{c.tipo}</span>
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{c.plantio}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{c.colheita}</td>
                  <td className="px-4 py-3"><StatusBadge status={c.status as 'ativo' | 'arquivado'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
