'use client';

import { useEffect, useState } from 'react';
import { PanelSection, PanelRow } from './_shared';
import { APP_VERSION, CHANGELOG } from '@/constants/version';
import { EtiquetaLayoutPicker } from '../talhao/EtiquetaLayoutPicker';
import { getConfigEtiqueta, saveConfigEtiqueta } from '@/lib/store';
import { INTERP_URL, BACKEND_LOCAL } from '@/lib/interpUrl';
import { ChevronDown, ChevronRight, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

// Status do servidor de processamento (nuvem) — só informação, sem instalação.
function ServidorNuvem() {
  const [status, setStatus] = useState<'checando' | 'ok' | 'off'>('checando');
  const [motor, setMotor] = useState('');
  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12_000);
    fetch(`${INTERP_URL}/health`, { signal: ctrl.signal, cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(j => { setMotor(String(j?.v ?? '')); setStatus('ok'); })
      .catch(() => setStatus('off'))
      .finally(() => clearTimeout(t));
    return () => { clearTimeout(t); ctrl.abort(); };
  }, []);
  return (
    <div className="px-4 py-2 flex items-center gap-2 text-xs" style={{ color: 'var(--sidebar-section)' }}>
      <span className="flex-1">Processamento de mapas {BACKEND_LOCAL ? '(local — dev)' : '(nuvem)'}</span>
      {status === 'checando' && <><Loader2 size={13} className="animate-spin" style={{ color: '#60a5fa' }} /><span style={{ color: '#60a5fa' }}>verificando…</span></>}
      {status === 'ok' && <><CheckCircle2 size={13} style={{ color: '#4ade80' }} /><span style={{ color: '#4ade80' }}>Online{motor ? ` · ${motor}` : ''}</span></>}
      {status === 'off' && <><XCircle size={13} style={{ color: '#f87171' }} /><span style={{ color: '#f87171' }}>Sem resposta (acordando? tente já já)</span></>}
    </div>
  );
}

export function ConfiguracoesPanel() {
  const versoes = Object.entries(CHANGELOG);
  const [atual, ...anteriores] = versoes;          // a primeira é a mais recente
  const [mostrarAnteriores, setMostrarAnteriores] = useState(false);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [etq, setEtq] = useState(() => getConfigEtiqueta());

  function atualizarEtq(patch: Partial<typeof etq>) {
    const novo = { ...etq, ...patch };
    setEtq(novo);
    saveConfigEtiqueta(novo);
  }

  function toggle(ver: string) {
    setAbertos(prev => ({ ...prev, [ver]: !prev[ver] }));
  }

  return (
    <div className="h-full overflow-y-auto">
      <PanelSection title="Plataforma">
        <PanelRow label="Versão do sistema" value={`v${APP_VERSION}`} />
        <ServidorNuvem />
      </PanelSection>

      <PanelSection title="Etiquetas">
        <div className="px-4 py-3">
          <EtiquetaLayoutPicker
            layoutId={etq.layoutId} setLayoutId={id => atualizarEtq({ layoutId: id })}
            dx={etq.dx} dy={etq.dy}
            setDx={v => atualizarEtq({ dx: v })} setDy={v => atualizarEtq({ dy: v })}
          />
        </div>
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
