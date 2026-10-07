'use client';

// Selo do CABEÇALHO do talhão: "Zonas liberadas p/ Lavra". Diz, de qualquer
// aba, que a Lavra (plataforma fitotécnica) pode programar a safra sobre um
// zoneamento deste talhão — e qual. Componente próprio, com estado próprio,
// porque o `talhao` da página é o da abertura e a liberação muda na aba Zonas
// (o store avisa por 'inv:liberacao-lavra').

import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { getTalhoes, getZoneamentosMeap } from '@/lib/store';

function ler(talhaoId: string): { nome: string } | null {
  const id = getTalhoes().find(t => t.id === talhaoId)?.zoneamentoLiberadoId;
  if (!id) return null;
  const z = getZoneamentosMeap(talhaoId).find(x => x.id === id);
  return { nome: z?.nome ?? 'zoneamento' };
}

/** Use com `key={talhaoId}`: o estado nasce do talhão e só o evento o refaz. */
export function SeloLiberacaoLavra({ talhaoId }: { talhaoId: string }) {
  const [lib, setLib] = useState<{ nome: string } | null>(() => ler(talhaoId));
  useEffect(() => {
    const h = () => setLib(ler(talhaoId));
    window.addEventListener('inv:liberacao-lavra', h);
    return () => window.removeEventListener('inv:liberacao-lavra', h);
  }, [talhaoId]);
  if (!lib) return null;
  return (
    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0"
      title={`Zonas liberadas para a Lavra programar a safra: ${lib.nome}`}
      style={{ background: '#052e2b', color: '#5eead4', border: '1px solid #0f766e' }}>
      <Send size={9} /> Zonas liberadas p/ Lavra
    </span>
  );
}
