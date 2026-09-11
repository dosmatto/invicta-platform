'use client';

// A barra Mover / Add / Remover da edição manual de pontos. Usada pela aba
// Zona de Manejo e pela Amostragem Composta — a única diferença entre elas é a
// palavra ("zona" / "célula"), então o componente é o mesmo.

import { useApp } from '@/context/AppContext';
import { Move, Plus, Eraser, Check, X } from 'lucide-react';

interface Props {
  /** Grade legada, sem numeração por área: só dá para mover. */
  somenteMover: boolean;
  /** Como a área se chama nas instruções. */
  termo: 'zona' | 'célula';
  /** Quando há grade salva em edição, o botão grava por cima dela. */
  temGradeEmEdicao: boolean;
  aoDescartar: () => void;
  aoSalvar: () => void;
  aoConcluir: () => void;
}

export function EdicaoPontosBarra({ somenteMover, termo, temGradeEmEdicao, aoDescartar, aoSalvar, aoConcluir }: Props) {
  const { edicaoModo, setEdicaoModo } = useApp();
  const daArea = termo === 'zona' ? 'da zona' : 'da célula';

  return (
    <div className="p-2.5 rounded-lg space-y-2" style={{ background: '#0a1f33', border: '1px solid #2e5fa3' }}>
      <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#93c5fd' }}>Edição manual</p>
      <div className={`grid ${somenteMover ? 'grid-cols-1' : 'grid-cols-3'} gap-1`}>
        {(somenteMover
          ? [['mover', 'Mover', Move]] as const
          : [['mover', 'Mover', Move], ['adicionar', 'Add', Plus], ['remover', 'Remover', Eraser]] as const
        ).map(([m, lbl, Ic]) => (
          <button key={m} onClick={() => setEdicaoModo(m)}
            className="py-1.5 rounded text-[10px] font-semibold flex flex-col items-center gap-0.5"
            style={{ background: edicaoModo === m ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: edicaoModo === m ? '#fff' : '#93c5fd' }}>
            <Ic size={12} /> {lbl}
          </button>
        ))}
      </div>
      <p className="text-[9px]" style={{ color: '#64748b' }}>
        {somenteMover
          ? `Grade antiga (sem numeração por ${termo}): só dá para mover. Gere e salve a grade de novo para poder adicionar e remover pontos.`
          : <>
              {edicaoModo === 'mover' && `Arraste os pontos. Cada ponto fica preso na sua ${termo}; o número não muda.`}
              {edicaoModo === 'adicionar' && `Clique dentro de uma ${termo} para adicionar um ponto. Ele entra como o último ${daArea}.`}
              {edicaoModo === 'remover' && `Clique num ponto para removê-lo. O sequencial ${daArea} se fecha sem buraco.`}
            </>}
      </p>
      <div className="flex gap-2">
        <button onClick={aoDescartar}
          className="flex-1 py-1.5 rounded text-[10px] font-semibold flex items-center justify-center gap-1" style={{ background: '#1a3a6b', color: '#94a3b8' }}>
          <X size={11} /> Descartar
        </button>
        {temGradeEmEdicao ? (
          <button onClick={aoSalvar}
            className="flex-1 py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1" style={{ background: 'var(--invicta-green-dark)' }}>
            <Check size={11} /> Salvar alterações
          </button>
        ) : (
          <button onClick={aoConcluir}
            className="flex-1 py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1" style={{ background: 'var(--invicta-blue-mid)' }}>
            <Check size={11} /> Concluir
          </button>
        )}
      </div>
    </div>
  );
}
