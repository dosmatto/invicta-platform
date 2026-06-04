'use client';

import { useState, useEffect } from 'react';
import { getSafras, saveSafra, updateSafra, deleteSafra, Safra } from '@/lib/store';
import { Plus, CalendarDays, CheckCircle2, Trash2, Save, X } from 'lucide-react';

export function SafrasPanel() {
  const [safras, setSafras] = useState<Safra[]>([]);
  const [mostraForm, setMostraForm] = useState(false);
  const [form, setForm] = useState({ anoInicio: new Date().getFullYear(), anoFim: new Date().getFullYear() + 1, ativa: true });
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { setSafras(getSafras()); }, []);

  function reload() { setSafras(getSafras()); }

  const nomeSafra = (anoInicio: number, anoFim: number) =>
    `${String(anoInicio).slice(-2)}/${String(anoFim).slice(-2)}`;

  function handleSave() {
    if (!form.anoInicio || !form.anoFim) return;
    setSalvando(true);
    setTimeout(() => {
      if (form.ativa) {
        getSafras().forEach(s => { if (s.ativa) updateSafra(s.id, { ativa: false }); });
      }
      saveSafra({ nome: nomeSafra(form.anoInicio, form.anoFim), anoInicio: form.anoInicio, anoFim: form.anoFim, ativa: form.ativa });
      reload();
      setMostraForm(false);
      setSalvando(false);
    }, 300);
  }

  function toggleAtiva(s: Safra) {
    if (s.ativa) return;
    getSafras().forEach(x => { if (x.ativa) updateSafra(x.id, { ativa: false }); });
    updateSafra(s.id, { ativa: true });
    reload();
  }

  function handleDelete(id: string) {
    deleteSafra(id);
    reload();
  }

  return (
    <div className="flex flex-col h-full">

      <div className="flex-shrink-0 p-3" style={{ borderBottom: '1px solid #1a3a6b' }}>
        <button
          onClick={() => setMostraForm(f => !f)}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold text-white"
          style={{ background: mostraForm ? '#374151' : 'var(--invicta-green-dark)' }}>
          {mostraForm ? <X size={12} /> : <Plus size={12} />}
          {mostraForm ? 'Cancelar' : 'Nova Safra'}
        </button>
      </div>

      {mostraForm && (
        <div className="flex-shrink-0 p-4 space-y-3" style={{ borderBottom: '1px solid #1a3a6b', background: '#061525' }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#93c5fd' }}>Nova Safra</p>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Ano Início *</label>
              <input type="number" value={form.anoInicio} min={2000} max={2100}
                onChange={e => setForm(p => ({ ...p, anoInicio: Number(e.target.value) }))}
                className="w-full rounded px-3 py-2 text-xs outline-none"
                style={{ background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' }} />
            </div>
            <div>
              <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Ano Fim *</label>
              <input type="number" value={form.anoFim} min={2000} max={2100}
                onChange={e => setForm(p => ({ ...p, anoFim: Number(e.target.value) }))}
                className="w-full rounded px-3 py-2 text-xs outline-none"
                style={{ background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' }} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="safra-ativa-cb" checked={form.ativa}
              onChange={e => setForm(p => ({ ...p, ativa: e.target.checked }))}
              className="accent-green-500" />
            <label htmlFor="safra-ativa-cb" className="text-xs" style={{ color: '#94a3b8' }}>
              Definir como safra ativa
            </label>
          </div>

          <div className="flex items-center gap-2 p-2 rounded text-[10px]" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
            <CalendarDays size={11} />
            Nome gerado: <strong>{nomeSafra(form.anoInicio, form.anoFim)}</strong>
          </div>

          <button onClick={handleSave} disabled={salvando}
            className="w-full py-2.5 rounded text-xs font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40"
            style={{ background: 'var(--invicta-green-dark)' }}>
            <Save size={13} />
            {salvando ? 'Salvando...' : 'Salvar Safra'}
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {safras.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-12 px-6 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: '#1a3a6b' }}>
              <CalendarDays size={28} style={{ color: '#2e5fa3' }} />
            </div>
            <p className="text-sm font-semibold" style={{ color: '#94a3b8' }}>Nenhuma safra cadastrada</p>
            <p className="text-xs" style={{ color: '#475569' }}>Clique em "+ Nova Safra" para começar</p>
          </div>
        ) : (
          safras.map(s => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3"
              style={{ borderBottom: '1px solid #0f2240' }}>
              <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: s.ativa ? '#166534' : '#1a3a6b' }}>
                <CalendarDays size={16} style={{ color: s.ativa ? '#86efac' : '#64748b' }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold" style={{ color: '#e2e8f0' }}>{s.nome}</p>
                  {s.ativa && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                      style={{ background: '#166534', color: '#86efac' }}>ATIVA</span>
                  )}
                </div>
                <p className="text-[10px]" style={{ color: '#64748b' }}>{s.anoInicio} / {s.anoFim}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {!s.ativa && (
                  <button onClick={() => toggleAtiva(s)} title="Definir como ativa"
                    className="p-1.5 rounded transition-colors"
                    style={{ background: '#1a3a6b', color: '#4ade80' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#166534'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#1a3a6b'}>
                    <CheckCircle2 size={13} />
                  </button>
                )}
                <button onClick={() => handleDelete(s.id)} title="Excluir"
                  className="p-1.5 rounded transition-colors"
                  style={{ background: '#1a3a6b', color: '#f87171' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#450a0a'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#1a3a6b'}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {safras.length > 0 && (
        <div className="flex-shrink-0 px-4 py-2 text-center text-[10px]"
          style={{ color: '#475569', borderTop: '1px solid #1a3a6b' }}>
          {safras.length} safra{safras.length !== 1 ? 's' : ''} cadastrada{safras.length !== 1 ? 's' : ''}
          {safras.find(s => s.ativa) && (
            <> · Ativa: <strong style={{ color: '#86efac' }}>{safras.find(s => s.ativa)!.nome}</strong></>
          )}
        </div>
      )}
    </div>
  );
}
