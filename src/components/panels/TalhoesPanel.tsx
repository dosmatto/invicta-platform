'use client';

// Painel de listagem global de talhões — navegação real é via FazendaDetailPanel
import { useApp } from '@/context/AppContext';
import { Map } from 'lucide-react';

export function TalhoesPanel() {
  const { setActivePanel } = useApp();
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: '#1a3a6b' }}>
        <Map size={28} style={{ color: '#2e5fa3' }} />
      </div>
      <p className="text-sm font-semibold" style={{ color: '#94a3b8' }}>Acesse os talhões</p>
      <p className="text-xs" style={{ color: '#475569' }}>
        Navegue por Clientes → Fazenda → Talhão para visualizar e gerenciar talhões.
      </p>
      <button
        onClick={() => setActivePanel('produtores')}
        className="px-4 py-2 rounded-lg text-xs font-semibold text-white"
        style={{ background: 'var(--invicta-blue-mid)' }}>
        Ir para Clientes
      </button>
    </div>
  );
}
