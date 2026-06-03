import Image from 'next/image';
import { MapPin, FileText, Map, History } from 'lucide-react';
import { MockIndicator } from '@/components/shared/MockIndicator';

const cards = [
  { label: 'Fazendas', desc: '3 propriedades cadastradas', icon: MapPin, href: '#' },
  { label: 'Relatórios', desc: '5 relatórios disponíveis', icon: FileText, href: '#' },
  { label: 'Mapas', desc: '2 mapas liberados', icon: Map, href: '#' },
  { label: 'Histórico', desc: 'Safras 22/23, 23/24, 24/25', icon: History, href: '#' },
];

export default function PortalPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-app)' }}>
      {/* Header */}
      <header className="border-b px-6 py-4 flex items-center justify-between"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
        <Image src="/images/logo-colorida.png" alt="Invicta" width={120} height={36} style={{ objectFit: 'contain' }} />
        <div className="flex items-center gap-2">
          <MockIndicator />
          <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>João Silva</span>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
            style={{ background: 'var(--invicta-green)' }}>J</div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        {/* Boas-vindas */}
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Olá, João! 👋
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Acompanhe suas propriedades e informações agronômicas.
          </p>
        </div>

        {/* Safra atual */}
        <div className="rounded-xl border p-5 flex items-center justify-between"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
          <div>
            <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Safra atual</p>
            <p className="text-xl font-bold" style={{ color: 'var(--invicta-blue)' }}>24/25</p>
          </div>
          <div className="text-right">
            <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Área total</p>
            <p className="text-xl font-bold" style={{ color: 'var(--invicta-green)' }}>285,3 ha</p>
          </div>
          <MockIndicator />
        </div>

        {/* Cards de acesso */}
        <div className="grid grid-cols-2 gap-4">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <a key={c.label} href={c.href}
                className="rounded-xl border p-5 flex items-start gap-4 hover:shadow-sm transition-shadow"
                style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ background: 'var(--status-info-bg)' }}>
                  <Icon size={20} style={{ color: 'var(--invicta-blue-mid)' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{c.label}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{c.desc}</p>
                </div>
              </a>
            );
          })}
        </div>

        {/* Link de volta */}
        <div className="text-center">
          <a href="/painel" className="text-xs underline" style={{ color: 'var(--text-muted)' }}>
            ← Voltar ao Painel Invicta
          </a>
        </div>
      </main>
    </div>
  );
}
