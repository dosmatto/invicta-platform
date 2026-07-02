'use client';

// Seletor "Legenda do mapa" reutilizável (Condutividade, Produtividade, NDVI…).
// Lista as legendas de um módulo e deixa o usuário escolher qual aplicar. Só
// aparece quando há mais de uma opção. A preferência fica por módulo (localStorage).

import { useCallback, useState } from 'react';
import { getLegendas } from '@/lib/store';
import type { Legenda } from '@/lib/legendas';

const inputStyle = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;

// Legendas de um módulo: por atributoId OU categoria (ex.: 'produtividade' / 'ndvi').
export function legendasDoModulo(atributoId: string, categoria?: string): Legenda[] {
  const cat = categoria ?? atributoId;
  return getLegendas().filter(l => l.atributoId === atributoId || l.categoria === cat);
}

// Preferência de legenda do módulo (localStorage) + setter que persiste.
export function usePrefLegenda(prefKey: string) {
  const [legId, setLegId] = useState<string>(() =>
    (typeof window !== 'undefined' ? localStorage.getItem(prefKey) : null) ?? '');
  const escolher = useCallback((id: string) => {
    setLegId(id);
    try { localStorage.setItem(prefKey, id); } catch {}
  }, [prefKey]);
  return [legId, escolher] as const;
}

export function SeletorLegenda({ legendas, valorId, onEscolher, label = 'Legenda do mapa' }: {
  legendas: Legenda[];
  valorId: string | undefined;
  onEscolher: (id: string) => void;
  label?: string;
}) {
  if (legendas.length <= 1) return null;
  return (
    <div>
      <label className="text-[9px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>{label}</label>
      <select value={valorId ?? ''} onChange={e => onEscolher(e.target.value)}
        className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle}>
        {legendas.map(l => (
          <option key={l.id} value={l.id}>
            {l.nome}{l.escalaRelativa ? ` · ${l.escalaRelativa === 'quantil' ? 'quartil' : 'mín–máx'}` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
