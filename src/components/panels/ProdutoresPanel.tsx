'use client';

import { PanelSection, PanelButton, MockIndicator } from './_shared';
import { Plus, Search, ChevronRight, User } from 'lucide-react';
import { MOCK_PRODUTORES } from '@/constants/mocks';
import { useApp } from '@/context/AppContext';

export function ProdutoresPanel() {
  const { setActivePanel, setNav } = useApp();

  function abrirProdutor(p: typeof MOCK_PRODUTORES[0]) {
    setNav({ produtorId: p.id, produtor: p.nome, fazendaId: null, fazenda: '', talhaoId: null, talhao: '' });
    setActivePanel(`produtor-${p.id}`);
  }

  return (
    <div>
      <PanelSection>
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
            style={{ background: '#1a3a6b', color: '#64748b' }}>
            <Search size={12} /><span>Buscar produtor...</span>
          </div>
        </div>
        <PanelButton label="Novo Produtor" icon={<Plus size={12} />} color="var(--invicta-green-dark)" />
      </PanelSection>

      <PanelSection title="Produtores / Clientes">
        <div className="px-4 py-1 flex items-center gap-1"><MockIndicator /></div>
        {MOCK_PRODUTORES.map(p => (
          <button key={p.id} onClick={() => abrirProdutor(p)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
            style={{ borderBottom: '1px solid #0f2240' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-item-hover)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm"
              style={{ background: 'var(--invicta-blue-mid)', color: '#fff' }}>
              {p.nome.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: '#e2e8f0' }}>{p.nome}</p>
              <p className="text-[11px] truncate" style={{ color: '#64748b' }}>{p.cidade} · {p.estado}</p>
            </div>
            <ChevronRight size={14} style={{ color: '#64748b' }} />
          </button>
        ))}
      </PanelSection>
    </div>
  );
}
