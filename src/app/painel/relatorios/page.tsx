import { Header } from '@/components/layout/Header';
import { MockIndicator } from '@/components/shared/MockIndicator';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { FileText, Download, Send, Plus } from 'lucide-react';

const MOCK_RELATORIOS = [
  { id: '1', tipo: 'Relatório de Fertilidade', escopo: 'Talhão 01 — Fazenda São João', safra: '24/25', data: '15/09/2024', responsavel: 'Carlos Técnico', status: 'concluido', liberado: true },
  { id: '2', tipo: 'Relatório de Fertilidade', escopo: 'Gleba A — Fazenda Santa Rita', safra: '24/25', data: '18/09/2024', responsavel: 'Carlos Técnico', status: 'concluido', liberado: false },
  { id: '3', tipo: 'Relatório NDVI', escopo: 'Talhão 01 — Fazenda São João', safra: '24/25', data: '20/01/2025', responsavel: 'Ana Operadora', status: 'concluido', liberado: true },
  { id: '4', tipo: 'Recomendação de Adubação', escopo: 'Talhão 02 — Fazenda São João', safra: '24/25', data: '—', responsavel: '—', status: 'rascunho', liberado: false },
];

export default function RelatoriosPage() {
  return (
    <>
      <Header title="Relatórios" breadcrumb={['Painel Invicta', 'Relatórios']} />
      <div className="flex-1 p-6 space-y-5">

        {/* Gerar relatório */}
        <div className="rounded-xl border p-5"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-2 mb-4">
            <FileText size={16} style={{ color: 'var(--invicta-blue)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Gerar Novo Relatório</h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {['Tipo de relatório', 'Produtor', 'Talhão', 'Safra'].map(f => (
              <div key={f}>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>{f}</label>
                <div className="h-9 rounded-lg border px-3 flex items-center text-sm"
                  style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>Selecionar...</div>
              </div>
            ))}
          </div>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: 'var(--invicta-blue)' }}>
            <Plus size={14} /> Gerar Relatório <MockIndicator />
          </button>
        </div>

        {/* Listagem */}
        <div className="rounded-xl border overflow-hidden"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-2 p-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Relatórios Gerados</h2>
            <MockIndicator />
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--bg-app)' }}>
                {['Tipo', 'Escopo', 'Safra', 'Data', 'Responsável', 'Status', 'Produtor', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOCK_RELATORIOS.map((r, i) => (
                <tr key={r.id} className="border-t"
                  style={{ borderColor: 'var(--border-color)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-app)' }}>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{r.tipo}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{r.escopo}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{r.safra}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{r.data}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{r.responsavel}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.status as 'concluido' | 'rascunho'} /></td>
                  <td className="px-4 py-3">
                    {r.liberado
                      ? <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--status-active-bg)', color: 'var(--status-active)' }}>Liberado</span>
                      : <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#f1f5f9', color: '#64748b' }}>Não liberado</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button title="Baixar PDF"><Download size={14} style={{ color: 'var(--invicta-blue-mid)' }} /></button>
                      {!r.liberado && r.status === 'concluido' && (
                        <button title="Liberar ao produtor"><Send size={14} style={{ color: 'var(--invicta-green)' }} /></button>
                      )}
                    </div>
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
