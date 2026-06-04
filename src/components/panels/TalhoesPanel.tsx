'use client';

import { PanelSection, PanelButton, MockIndicator, StatusBadge } from './_shared';
import { Plus, ChevronRight, Map } from 'lucide-react';
import { MOCK_TALHOES } from '@/constants/mocks';
import { useApp } from '@/context/AppContext';

export function TalhoesPanel() {
  const { setActivePanel, setNav, setMapMode } = useApp();

  function abrirTalhao(t: typeof MOCK_TALHOES[0]) {
    setNav({ talhaoId: t.id, talhao: t.nome, area: t.area });
    setMapMode('satellite');
    setActivePanel(`talhao-${t.id}`);
  }

  return (
    <div>
      <PanelSection>
        <PanelButton label="Novo Talhão" icon={<Plus size={12} />} color="var(--invicta-green-dark)" />
      </PanelSection>

      <PanelSection title="Talhões Cadastrados">
        <div className="px-4 py-1 flex items-center gap-1"><MockIndicator /></div>
        {MOCK_TALHOES.map(t => (
          <button
            key={t.id}
            onClick={() => abrirTalhao(t)}
            className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors group"
            style={{ borderBottom: '1px solid #0f2240' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-item-hover)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                style={{ background: t.status === 'ativo' ? '#166534' : '#78350f' }}>
                <Map size={13} style={{ color: '#fff' }} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: '#e2e8f0' }}>{t.nome}</p>
                <p className="text-[11px] truncate" style={{ color: 'var(--sidebar-section)' }}>
                  {t.area} ha
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
              <StatusBadge status={t.status as 'ativo' | 'incompleto'} />
              <ChevronRight size={14} style={{ color: 'var(--sidebar-section)' }} />
            </div>
          </button>
        ))}
      </PanelSection>

      <PanelSection>
        <div className="mx-4 my-3 p-3 rounded text-xs" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
          💡 Clique em um talhão para acessar amostragem, fertilidade, NDVI, zonas de manejo e muito mais.
        </div>
      </PanelSection>
    </div>
  );
}
