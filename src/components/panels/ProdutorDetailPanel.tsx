'use client';

import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { MOCK_PRODUTORES, MOCK_FAZENDAS } from '@/constants/mocks';
import { ChevronLeft, ChevronRight, Plus, Building2, Phone, Mail, FileText, Edit2 } from 'lucide-react';
import { PanelSection, PanelButton, MockIndicator } from './_shared';

export function ProdutorDetailPanel() {
  const { nav, setNav, setActivePanel } = useApp();
  const [tab, setTab] = useState<'fazendas' | 'dados'>('fazendas');

  const produtor = MOCK_PRODUTORES.find(p => p.id === nav.produtorId);
  const fazendas = MOCK_FAZENDAS.filter(f => f.produtorId === nav.produtorId);

  if (!produtor) return null;

  function abrirFazenda(f: typeof MOCK_FAZENDAS[0]) {
    setNav({ fazendaId: f.id, fazenda: f.nome });
    setActivePanel(`fazenda-${f.id}`);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Voltar */}
      <button onClick={() => setActivePanel('produtores')}
        className="flex items-center gap-1.5 px-4 py-2 text-xs w-full text-left transition-colors flex-shrink-0"
        style={{ color: '#93c5fd', borderBottom: '1px solid #0f2240' }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-item-hover)'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
        <ChevronLeft size={12} /> Produtores
      </button>

      {/* Header do produtor */}
      <div className="px-4 py-4 flex-shrink-0" style={{ borderBottom: '1px solid #1a3a6b', background: '#0a1929' }}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0"
            style={{ background: 'var(--invicta-blue-mid)', color: '#fff' }}>
            {produtor.nome.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold truncate" style={{ color: '#fff' }}>{produtor.nome}</p>
            <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>{produtor.documento}</p>
            <p className="text-xs" style={{ color: '#64748b' }}>{produtor.cidade} · {produtor.estado}</p>
          </div>
          <button className="p-1.5 rounded" style={{ background: '#1a3a6b' }}>
            <Edit2 size={12} style={{ color: '#93c5fd' }} />
          </button>
        </div>
        <div className="flex gap-3 mt-3">
          <div className="flex items-center gap-1.5 text-xs" style={{ color: '#64748b' }}>
            <Phone size={11} />{produtor.telefone}
          </div>
          <div className="flex items-center gap-1.5 text-xs truncate" style={{ color: '#64748b' }}>
            <Mail size={11} />{produtor.email}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-shrink-0" style={{ borderBottom: '1px solid #1a3a6b' }}>
        {[{ id: 'fazendas', label: `Fazendas (${fazendas.length})` }, { id: 'dados', label: 'Dados' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as typeof tab)}
            className="flex-1 py-2.5 text-xs font-semibold transition-colors"
            style={{
              color: tab === t.id ? '#fff' : '#64748b',
              borderBottom: tab === t.id ? '2px solid var(--invicta-green)' : '2px solid transparent',
              background: 'transparent',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'fazendas' && (
          <>
            <PanelSection>
              <PanelButton label="Nova Fazenda" icon={<Plus size={12} />} color="var(--invicta-green-dark)" />
            </PanelSection>
            <PanelSection>
              <div className="px-4 py-1 flex items-center gap-1"><MockIndicator /></div>
              {fazendas.length === 0 && (
                <div className="px-4 py-6 text-center text-xs" style={{ color: '#475569' }}>
                  Nenhuma fazenda cadastrada.
                </div>
              )}
              {fazendas.map(f => (
                <button key={f.id} onClick={() => abrirFazenda(f)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                  style={{ borderBottom: '1px solid #0f2240' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-item-hover)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: '#166534' }}>
                    <Building2 size={14} style={{ color: '#86efac' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: '#e2e8f0' }}>{f.nome}</p>
                    <p className="text-[11px]" style={{ color: '#64748b' }}>
                      {f.municipio} · {f.area_ha.toLocaleString('pt-BR')} ha
                    </p>
                  </div>
                  <ChevronRight size={14} style={{ color: '#64748b' }} />
                </button>
              ))}
            </PanelSection>
          </>
        )}

        {tab === 'dados' && (
          <PanelSection>
            {[
              { label: 'Nome completo', value: produtor.nome },
              { label: 'CPF / CNPJ', value: produtor.documento },
              { label: 'Município', value: produtor.cidade },
              { label: 'Estado', value: produtor.estado },
              { label: 'Telefone', value: produtor.telefone },
              { label: 'E-mail', value: produtor.email },
              { label: 'Status', value: produtor.status === 'ativo' ? 'Ativo' : 'Inativo' },
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
