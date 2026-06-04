'use client';

import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { MOCK_FAZENDAS, MOCK_TALHOES } from '@/constants/mocks';
import { ChevronLeft, ChevronRight, Plus, Map, AlertTriangle, Edit2 } from 'lucide-react';
import { PanelSection, PanelButton, MockIndicator, StatusBadge } from './_shared';

export function FazendaDetailPanel() {
  const { nav, setNav, setActivePanel, setMapMode } = useApp();
  const [tab, setTab] = useState<'talhoes' | 'dados'>('talhoes');

  const fazenda = MOCK_FAZENDAS.find(f => f.id === nav.fazendaId);
  const talhoes = MOCK_TALHOES.filter(t => t.fazendaId === nav.fazendaId);
  const incompletos = talhoes.filter(t => t.status === 'incompleto').length;

  if (!fazenda) return null;

  function abrirTalhao(t: typeof MOCK_TALHOES[0]) {
    setNav({ talhaoId: t.id, talhao: t.nome, area: t.area });
    setMapMode('satellite'); // ← troca para satélite ao entrar no talhão
    setActivePanel(`talhao-${t.id}`);
  }

  function voltarProdutor() {
    setNav({ fazendaId: null, fazenda: '', talhaoId: null, talhao: '' });
    setActivePanel(`produtor-${nav.produtorId}`);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Voltar */}
      <button onClick={voltarProdutor}
        className="flex items-center gap-1.5 px-4 py-2 text-xs w-full text-left transition-colors flex-shrink-0"
        style={{ color: '#93c5fd', borderBottom: '1px solid #0f2240' }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-item-hover)'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
        <ChevronLeft size={12} /> {nav.produtor}
      </button>

      {/* Header da fazenda */}
      <div className="px-4 py-4 flex-shrink-0" style={{ borderBottom: '1px solid #1a3a6b', background: '#0a1929' }}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: '#166534' }}>
            <Map size={18} style={{ color: '#86efac' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold truncate" style={{ color: '#fff' }}>{fazenda.nome}</p>
            <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>{fazenda.municipio} · {fazenda.estado}</p>
            <p className="text-xs font-semibold mt-1" style={{ color: '#86efac' }}>
              {fazenda.area_ha.toLocaleString('pt-BR')} ha · {talhoes.length} talhões
            </p>
          </div>
          <button className="p-1.5 rounded" style={{ background: '#1a3a6b' }}>
            <Edit2 size={12} style={{ color: '#93c5fd' }} />
          </button>
        </div>

        {incompletos > 0 && (
          <div className="mt-3 flex items-center gap-2 p-2 rounded text-xs"
            style={{ background: '#78350f', color: '#fde68a' }}>
            <AlertTriangle size={12} />
            {incompletos} talhão(ões) sem limite geográfico
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-shrink-0" style={{ borderBottom: '1px solid #1a3a6b' }}>
        {[{ id: 'talhoes', label: `Talhões (${talhoes.length})` }, { id: 'dados', label: 'Dados' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as typeof tab)}
            className="flex-1 py-2.5 text-xs font-semibold transition-colors"
            style={{
              color: tab === t.id ? '#fff' : '#64748b',
              borderBottom: tab === t.id ? '2px solid var(--invicta-green)' : '2px solid transparent',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'talhoes' && (
          <>
            <PanelSection>
              <PanelButton label="Novo Talhão" icon={<Plus size={12} />} color="var(--invicta-green-dark)" />
            </PanelSection>
            <PanelSection>
              <div className="px-4 py-1 flex items-center gap-1"><MockIndicator /></div>
              {talhoes.length === 0 && (
                <div className="px-4 py-6 text-center text-xs" style={{ color: '#475569' }}>
                  Nenhum talhão cadastrado.
                </div>
              )}
              {talhoes.map(t => (
                <button key={t.id} onClick={() => abrirTalhao(t)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                  style={{ borderBottom: '1px solid #0f2240' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-item-hover)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: t.status === 'ativo' ? '#166534' : '#78350f' }}>
                    <Map size={14} style={{ color: t.status === 'ativo' ? '#86efac' : '#fde68a' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: '#e2e8f0' }}>{t.nome}</p>
                    <p className="text-[11px]" style={{ color: '#64748b' }}>{t.area} ha · Safra {t.safra}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={t.status as 'ativo' | 'incompleto'} />
                    <ChevronRight size={14} style={{ color: '#64748b' }} />
                  </div>
                </button>
              ))}
            </PanelSection>

            <PanelSection>
              <div className="mx-4 my-3 p-3 rounded text-xs" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
                🛰 Ao entrar em um talhão, o mapa troca automaticamente para visão de satélite.
              </div>
            </PanelSection>
          </>
        )}

        {tab === 'dados' && (
          <PanelSection>
            {[
              { label: 'Nome', value: fazenda.nome },
              { label: 'Município', value: fazenda.municipio },
              { label: 'Estado', value: fazenda.estado },
              { label: 'Área total', value: `${fazenda.area_ha.toLocaleString('pt-BR')} ha` },
              { label: 'CAR', value: fazenda.car },
              { label: 'Status', value: 'Ativa' },
            ].map(d => (
              <div key={d.label} className="flex items-center justify-between px-4 py-2.5"
                style={{ borderBottom: '1px solid #0f2240' }}>
                <p className="text-xs" style={{ color: '#64748b' }}>{d.label}</p>
                <p className="text-xs font-semibold" style={{ color: '#e2e8f0' }}>{d.value}</p>
              </div>
            ))}
            <div className="p-4">
              <button className="w-full py-2 rounded text-xs font-semibold text-white"
                style={{ background: 'var(--invicta-blue-mid)' }}>
                Editar Cadastro
              </button>
            </div>
          </PanelSection>
        )}
      </div>
    </div>
  );
}
