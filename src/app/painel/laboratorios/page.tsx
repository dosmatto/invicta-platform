import { Header } from '@/components/layout/Header';
import { MockIndicator } from '@/components/shared/MockIndicator';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Upload, TestTube } from 'lucide-react';

const MOCK_ENVIOS = [
  { id: '1', campanha: 'Talhão 01 — Ago/2024', laboratorio: 'Laborsolo', amostras: 24, envio: '20/08/2024', resultado: '10/09/2024', status: 'concluido' },
  { id: '2', campanha: 'Gleba A — Ago/2024', laboratorio: 'Laborsolo', amostras: 36, envio: '22/08/2024', resultado: '12/09/2024', status: 'concluido' },
  { id: '3', campanha: 'Talhão 02 — Out/2024', laboratorio: 'Soloanalise', amostras: 30, envio: '05/10/2024', resultado: '—', status: 'aguardando' },
];

export default function LaboratoriosPage() {
  return (
    <>
      <Header title="Laboratórios" breadcrumb={['Painel Invicta', 'Laboratórios']} />
      <div className="flex-1 p-6 space-y-5">

        {/* Importar resultados */}
        <div className="rounded-xl border p-5"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-2 mb-4">
            <Upload size={16} style={{ color: 'var(--invicta-blue)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Importar Resultados</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Laboratório</label>
              <div className="h-9 rounded-lg border px-3 flex items-center text-sm"
                style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>Selecionar laboratório...</div>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Campanha</label>
              <div className="h-9 rounded-lg border px-3 flex items-center text-sm"
                style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>Selecionar campanha...</div>
            </div>
          </div>
          <div className="border-2 border-dashed rounded-xl p-8 text-center mb-4"
            style={{ borderColor: 'var(--border-color)' }}>
            <Upload size={24} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Arraste o arquivo XLSX ou CSV aqui</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>ou clique para selecionar</p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: 'var(--invicta-blue)' }}>
            <Upload size={14} /> Importar Resultados
          </button>
        </div>

        {/* Histórico */}
        <div className="rounded-xl border overflow-hidden"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-2 p-4 border-b"
            style={{ borderColor: 'var(--border-color)' }}>
            <TestTube size={16} style={{ color: 'var(--invicta-blue)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Histórico de Envios</h2>
            <MockIndicator />
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--bg-app)' }}>
                {['Campanha', 'Laboratório', 'Amostras', 'Envio', 'Resultado', 'Status', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOCK_ENVIOS.map((e, i) => (
                <tr key={e.id} className="border-t"
                  style={{ borderColor: 'var(--border-color)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-app)' }}>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{e.campanha}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{e.laboratorio}</td>
                  <td className="px-4 py-3 text-center" style={{ color: 'var(--text-secondary)' }}>{e.amostras}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{e.envio}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{e.resultado}</td>
                  <td className="px-4 py-3"><StatusBadge status={e.status as 'concluido' | 'aguardando'} /></td>
                  <td className="px-4 py-3">
                    <button className="text-xs font-medium" style={{ color: 'var(--invicta-blue-mid)' }}>Ver resultados</button>
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
