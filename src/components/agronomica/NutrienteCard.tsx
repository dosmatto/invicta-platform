'use client';

import { useState } from 'react';
import { LegendaNutriente, GRADIENTE_NORMAL, GRADIENTE_INVERTIDO, CORES_CLASSES } from '@/constants/agronomica';
import { LegendaBar } from './LegendaBar';
import { ChevronDown, ChevronUp, RotateCcw, Save, FlipHorizontal } from 'lucide-react';

interface NutrienteCardProps {
  legenda: LegendaNutriente;
  onSave?: (updated: LegendaNutriente) => void;
}

export function NutrienteCard({ legenda, onSave }: NutrienteCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<LegendaNutriente>(legenda);
  const [saved, setSaved] = useState(false);

  function handleLimitChange(classeIdx: number, field: 'min' | 'max', value: string) {
    const num = value === '' || value === '—' || value === '∞' ? null : parseFloat(value);
    const updated = { ...editing };
    updated.classes = editing.classes.map((c, i) =>
      i === classeIdx ? { ...c, [field]: num } : c
    );
    setEditing(updated);
  }

  function handleSave() {
    onSave?.(editing);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleReset() {
    setEditing(legenda);
  }

  const gradiente = editing.invertido ? GRADIENTE_INVERTIDO : GRADIENTE_NORMAL;
  const cores = editing.invertido ? CORES_CLASSES.invertido : CORES_CLASSES.normal;
  const NOMES = ['Muito Baixo', 'Baixo', 'Médio', 'Alto', 'Muito Alto'] as const;

  return (
    <div className="rounded-xl overflow-hidden border"
      style={{ borderColor: '#1a3a6b', background: '#0a1929' }}>

      {/* Header do card */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-4 px-5 py-4 text-left transition-colors"
        style={{ background: expanded ? '#0f2240' : 'transparent' }}
        onMouseEnter={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = '#0d1e36'; }}
        onMouseLeave={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        {/* Símbolo */}
        <div className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg flex-shrink-0"
          style={{ background: '#1a3a6b', color: '#93c5fd' }}>
          {legenda.simbolo}
        </div>

        {/* Info + barra preview */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-bold" style={{ color: '#e2e8f0' }}>{legenda.nome}</p>
            <span className="text-[10px] px-1.5 py-0.5 rounded font-mono"
              style={{ background: '#1a3a6b', color: '#64748b' }}>{legenda.unidade}</span>
            {legenda.invertido && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold flex items-center gap-1"
                style={{ background: '#7c3aed22', color: '#a78bfa', border: '1px solid #7c3aed44' }}>
                <FlipHorizontal size={9} /> Invertido
              </span>
            )}
          </div>
          {/* Mini barra preview */}
          <div className="rounded" style={{ height: '8px', background: gradiente }} />
        </div>

        {/* Limites resumidos */}
        <div className="text-right flex-shrink-0 hidden sm:block">
          <p className="text-[10px] font-mono" style={{ color: '#475569' }}>
            {editing.classes.map(c => c.max ?? '∞').join(' · ')}
          </p>
          <p className="text-[10px]" style={{ color: '#475569' }}>{legenda.metodologia}</p>
        </div>

        {expanded ? <ChevronUp size={16} style={{ color: '#475569' }} /> : <ChevronDown size={16} style={{ color: '#475569' }} />}
      </button>

      {/* Conteúdo expandido */}
      {expanded && (
        <div className="px-5 pb-5" style={{ borderTop: '1px solid #0f2240' }}>

          {/* Legenda em tamanho completo */}
          <div className="pt-4 pb-2">
            <LegendaBar legenda={editing} size="lg" />
          </div>

          {legenda.observacao && (
            <p className="text-[10px] mt-1 mb-3 italic" style={{ color: '#475569' }}>
              ⚠ {legenda.observacao}
            </p>
          )}

          {/* Editor de classes */}
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#64748b' }}>
              Limites das Classes
            </p>

            {/* Header da tabela */}
            <div className="grid grid-cols-5 gap-2 mb-2">
              {NOMES.map(n => (
                <div key={n} className="text-center">
                  <div className="h-3 rounded-sm mb-1" style={{ background: cores[n] }} />
                  <p className="text-[9px] font-semibold" style={{ color: '#94a3b8' }}>{n}</p>
                </div>
              ))}
            </div>

            {/* Linha de inputs — max de cada classe */}
            <div className="grid grid-cols-5 gap-2">
              {editing.classes.map((classe, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <label className="text-[9px] text-center" style={{ color: '#475569' }}>
                    {i === 0 ? 'Min' : 'Limite'}
                  </label>
                  {i === 0 && (
                    <input
                      type="number"
                      value={classe.min ?? ''}
                      onChange={e => handleLimitChange(i, 'min', e.target.value)}
                      placeholder="—"
                      className="w-full rounded px-2 py-1.5 text-xs font-mono text-center"
                      style={{ background: '#1a3a6b', color: '#e2e8f0', border: `1px solid ${cores[NOMES[i]]}44` }}
                    />
                  )}
                  <label className="text-[9px] text-center" style={{ color: '#475569' }}>
                    {i === 4 ? '—' : 'Até'}
                  </label>
                  <input
                    type="number"
                    value={classe.max ?? ''}
                    onChange={e => handleLimitChange(i, 'max', e.target.value)}
                    placeholder={i === 4 ? '∞' : ''}
                    disabled={i === 4}
                    className="w-full rounded px-2 py-1.5 text-xs font-mono text-center"
                    style={{
                      background: i === 4 ? '#0f2240' : '#1a3a6b',
                      color: i === 4 ? '#475569' : '#e2e8f0',
                      border: `1px solid ${cores[NOMES[i]]}44`,
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Metodologia */}
            <div className="mt-4">
              <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>
                Metodologia / Fonte
              </label>
              <input
                type="text"
                value={editing.metodologia}
                onChange={e => setEditing(prev => ({ ...prev, metodologia: e.target.value }))}
                className="w-full rounded px-3 py-2 text-xs"
                style={{ background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #1e3a5f' }}
              />
            </div>

            {/* Ações */}
            <div className="flex gap-2 mt-4">
              <button onClick={handleSave}
                className="flex items-center gap-1.5 px-4 py-2 rounded text-xs font-semibold text-white transition-all"
                style={{ background: saved ? '#166534' : 'var(--invicta-green-dark)' }}>
                <Save size={12} />
                {saved ? 'Salvo!' : 'Salvar Legenda'}
              </button>
              <button onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-2 rounded text-xs font-semibold transition-colors"
                style={{ background: '#1a3a6b', color: '#94a3b8' }}>
                <RotateCcw size={12} /> Restaurar padrão
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
