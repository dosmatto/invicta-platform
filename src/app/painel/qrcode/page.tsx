import { Header } from '@/components/layout/Header';
import { MockIndicator } from '@/components/shared/MockIndicator';
import { QrCode, Download } from 'lucide-react';

const MOCK_ETIQUETAS = [
  { id: 'AM-01-A-0-10', talhao: 'Talhão 01', ponto: 1, profundidade: '0–10 cm', campanha: 'Ago/2024' },
  { id: 'AM-01-A-10-20', talhao: 'Talhão 01', ponto: 1, profundidade: '10–20 cm', campanha: 'Ago/2024' },
  { id: 'AM-01-B-0-10', talhao: 'Talhão 01', ponto: 2, profundidade: '0–10 cm', campanha: 'Ago/2024' },
  { id: 'AM-02-A-0-10', talhao: 'Gleba A', ponto: 1, profundidade: '0–10 cm', campanha: 'Ago/2024' },
];

export default function QrCodePage() {
  return (
    <>
      <Header title="QR Code e Etiquetas" breadcrumb={['Painel Invicta', 'QR Code e Etiquetas']} />
      <div className="flex-1 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Etiquetas — Campanha Ago/2024</h2>
            <MockIndicator />
          </div>
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-white"
            style={{ background: 'var(--invicta-blue)' }}>
            <Download size={14} /> Exportar PDF
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {MOCK_ETIQUETAS.map(e => (
            <div key={e.id} className="rounded-xl border p-4 flex flex-col items-center gap-3 text-center"
              style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
              <div className="w-20 h-20 rounded-lg flex items-center justify-center"
                style={{ background: 'var(--bg-app)', border: '2px solid var(--border-color)' }}>
                <QrCode size={48} style={{ color: 'var(--text-primary)' }} />
              </div>
              <div>
                <p className="text-xs font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{e.id}</p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{e.talhao} · Ponto {e.ponto}</p>
                <p className="text-[11px]" style={{ color: 'var(--invicta-blue-mid)' }}>{e.profundidade}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
