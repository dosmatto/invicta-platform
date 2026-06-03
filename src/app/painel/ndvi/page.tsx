import { Header } from '@/components/layout/Header';
import { MockIndicator } from '@/components/shared/MockIndicator';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Satellite, Upload, Play } from 'lucide-react';

const MOCK_NDVI = [
  { talhao: 'Talhão 01', fonte: 'Sentinel-2', data: '10/01/2025', min: 0.42, max: 0.89, media: 0.71, status: 'concluido' },
  { talhao: 'Talhão 01', fonte: 'Sentinel-2', data: '25/11/2024', min: 0.35, max: 0.82, media: 0.64, status: 'concluido' },
  { talhao: 'Gleba A', fonte: 'Sensor Falker', data: '15/01/2025', min: 0.28, max: 0.76, media: 0.55, status: 'concluido' },
  { talhao: 'Talhão 02', fonte: 'Sentinel-2', data: '—', min: '—', max: '—', media: '—', status: 'aguardando' },
];

const FONTE_COLOR: Record<string, { bg: string; color: string }> = {
  'Sentinel-2':    { bg: '#dbeafe', color: '#1d4ed8' },
  'Sensor Falker': { bg: '#dcfce7', color: '#16a34a' },
};

export default function NdviPage() {
  return (
    <>
      <Header title="NDVI" breadcrumb={['Painel Invicta', 'NDVI']} />
      <div className="flex-1 p-6 space-y-6">

        {/* Import cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Sentinel-2 */}
          <div className="rounded-xl border p-5"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#dbeafe' }}>
                <Satellite size={16} style={{ color: '#1d4ed8' }} />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Sentinel-2</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Visualização e histórico de biomassa</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {['Talhão', 'Data da imagem'].map(f => (
                <div key={f}>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>{f}</label>
                  <div className="h-8 rounded-lg border px-3 flex items-center text-xs"
                    style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>Selecionar...</div>
                </div>
              ))}
            </div>
            <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-white w-full justify-center"
              style={{ background: '#1d4ed8' }}>
              <Upload size={12} /> Importar GeoTIFF
            </button>
          </div>

          {/* Falker */}
          <div className="rounded-xl border p-5"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#dcfce7' }}>
                <Satellite size={16} style={{ color: '#16a34a' }} />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Sensor Falker</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Recomendação de N em cobertura</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {['Talhão', 'Data de coleta'].map(f => (
                <div key={f}>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>{f}</label>
                  <div className="h-8 rounded-lg border px-3 flex items-center text-xs"
                    style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>Selecionar...</div>
                </div>
              ))}
            </div>
            <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-white w-full justify-center"
              style={{ background: '#16a34a' }}>
              <Play size={12} /> Importar e Processar N <MockIndicator />
            </button>
          </div>
        </div>

        {/* Histórico */}
        <div className="rounded-xl border overflow-hidden"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-2 p-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Histórico de NDVI</h2>
            <MockIndicator />
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--bg-app)' }}>
                {['Talhão', 'Fonte', 'Data', 'Mín.', 'Máx.', 'Média', 'Status', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOCK_NDVI.map((n, i) => {
                const fStyle = FONTE_COLOR[n.fonte] ?? { bg: '#f1f5f9', color: '#64748b' };
                return (
                  <tr key={i} className="border-t"
                    style={{ borderColor: 'var(--border-color)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-app)' }}>
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{n.talhao}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ background: fStyle.bg, color: fStyle.color }}>{n.fonte}</span>
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{n.data}</td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{n.min}</td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{n.max}</td>
                    <td className="px-4 py-3 font-mono text-xs font-bold" style={{ color: 'var(--invicta-green-dark)' }}>{n.media}</td>
                    <td className="px-4 py-3"><StatusBadge status={n.status as 'concluido' | 'aguardando'} /></td>
                    <td className="px-4 py-3">
                      <button className="text-xs font-medium" style={{ color: 'var(--invicta-blue-mid)' }}>Ver mapa</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
