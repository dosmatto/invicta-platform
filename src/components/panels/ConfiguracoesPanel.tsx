'use client';

import { useState } from 'react';
import { PanelSection, PanelRow } from './_shared';
import { APP_VERSION, CHANGELOG } from '@/constants/version';
import { ChevronDown, ChevronRight } from 'lucide-react';

export function ConfiguracoesPanel() {
  const versoes = Object.entries(CHANGELOG);
  const [atual, ...anteriores] = versoes;          // a primeira é a mais recente
  const [mostrarAnteriores, setMostrarAnteriores] = useState(false);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});

  function toggle(ver: string) {
    setAbertos(prev => ({ ...prev, [ver]: !prev[ver] }));
  }

  return (
    <div>
      <PanelSection title="Plataforma">
        {['Dados da empresa', 'Backup de dados'].map(i => <PanelRow key={i} label={i} value="›" />)}
        <PanelRow label="Versão do sistema" value={`v${APP_VERSION}`} />
      </PanelSection>
      <PanelSection title="Integrações">
        {['Motor QGIS', 'Firebase', 'Laboratórios parceiros', 'Vercel / Deploy'].map(i => <PanelRow key={i} label={i} value="›" />)}
      </PanelSection>

      <PanelSection title="Changelog">
        {/* Última versão — sempre visível */}
        {atual && (
          <div className="px-4 py-2 border-b" style={{ borderColor: '#0f2240' }}>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs font-bold" style={{ color: '#93c5fd' }}>v{atual[0]}</p>
              <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: '#166534', color: '#86efac' }}>ATUAL</span>
            </div>
            {atual[1].map((item, i) => (
              <p key={i} className="text-[10px] leading-relaxed" style={{ color: 'var(--sidebar-section)' }}>· {item}</p>
            ))}
          </div>
        )}

        {/* Versões anteriores — ocultas por padrão */}
        {anteriores.length > 0 && (
          <>
            <button onClick={() => setMostrarAnteriores(v => !v)}
              className="w-full flex items-center justify-between px-4 py-2 transition-colors"
              style={{ color: '#64748b' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-item-hover)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
              <span className="text-[10px] font-semibold uppercase tracking-wider">
                Versões anteriores ({anteriores.length})
              </span>
              {mostrarAnteriores ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>

            {mostrarAnteriores && anteriores.map(([ver, items]) => (
              <div key={ver} className="border-b" style={{ borderColor: '#0f2240' }}>
                <button onClick={() => toggle(ver)}
                  className="w-full flex items-center justify-between px-4 py-1.5 transition-colors"
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-item-hover)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                  <span className="text-[11px] font-bold" style={{ color: '#64748b' }}>v{ver}</span>
                  {abertos[ver] ? <ChevronDown size={12} style={{ color: '#475569' }} /> : <ChevronRight size={12} style={{ color: '#475569' }} />}
                </button>
                {abertos[ver] && (
                  <div className="px-4 pb-2">
                    {items.map((item, i) => (
                      <p key={i} className="text-[10px] leading-relaxed" style={{ color: 'var(--sidebar-section)' }}>· {item}</p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </PanelSection>

      <PanelSection title="Sobre">
        <div className="px-4 py-3 space-y-1 text-xs" style={{ color: 'var(--sidebar-section)' }}>
          <p className="font-semibold" style={{ color: '#e2e8f0' }}>Invicta Platform</p>
          <p>Versão {APP_VERSION}</p>
          <p>Consultoria em Agronegócio</p>
        </div>
      </PanelSection>
    </div>
  );
}
