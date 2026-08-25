'use client';

// EDITOR DE FÓRMULA — o miolo da equação (constantes, fórmula, limites da dose,
// paleta de atributos e teste ao vivo). Nasceu dentro do editor da Biblioteca
// (EquacoesPanel) e virou componente próprio na v2.73, quando a aba
// Recomendações passou a abrir a fórmula REAL da equação escolhida para editar
// no talhão (modo "Equação avulsa"). São os DOIS únicos usos — Biblioteca
// (cadastro) e Recomendação (rascunho avulso), a mesma tela nos dois.

import { useMemo, useState } from 'react';
import type { ConstanteEquacao } from '@/lib/biblioteca';
import { ATRIBUTOS_EQUACAO, validar, testarEscalar, atributoPorToken } from '@/lib/recomendacao/motor';
import { parseNum } from '@/lib/lab';
import { inputStyle } from '@/constants/ui';
import { Plus, Trash2, Play, ChevronRight } from 'lucide-react';

// Funções da linguagem, com a assinatura já pronta para inserir no texto.
const FUNCOES_INSERIR: { rotulo: string; token: string; dica: string }[] = [
  { rotulo: 'se',        token: 'se(; ; )',   dica: 'se(condição; então; senão)' },
  { rotulo: 'max',       token: 'max(; )',    dica: 'maior valor entre os argumentos' },
  { rotulo: 'min',       token: 'min(; )',    dica: 'menor valor entre os argumentos' },
  { rotulo: 'arredonda', token: 'arredonda(; 0)', dica: 'arredonda(valor; casas)' },
  { rotulo: 'raiz',      token: 'raiz()',     dica: 'raiz quadrada' },
  { rotulo: 'abs',       token: 'abs()',      dica: 'valor absoluto' },
  { rotulo: 'teto',      token: 'teto()',     dica: 'arredonda para cima' },
  { rotulo: 'piso',      token: 'piso()',     dica: 'arredonda para baixo' },
];

export function EditorFormula(p: {
  constantes: ConstanteEquacao[]; setConstantes: (c: ConstanteEquacao[]) => void;
  script: string; setScript: (s: string) => void; scriptRef: React.RefObject<HTMLTextAreaElement | null>;
  naoNeg: boolean; setNaoNeg: (b: boolean) => void;
  doseMinima: string; setDoseMinima: (s: string) => void;
  abaixoMinimo: 'zero' | 'minimo'; setAbaixoMinimo: (s: 'zero' | 'minimo') => void;
  doseMaxima: string; setDoseMaxima: (s: string) => void;
  unTrat: string;
  val: ReturnType<typeof validar>; inserirToken: (t: string) => void;
}) {
  const [testVals, setTestVals] = useState<Record<string, string>>({});
  const teste = useMemo(() => {
    if (!p.val.ok) return null;
    const valores: Record<string, number> = {};
    for (const v of p.val.vars) {
      const raw = testVals[v];
      const at = atributoPorToken(v);
      valores[v] = raw != null && raw.trim() ? (parseNum(raw) ?? NaN) : (at?.exemplo ?? NaN);
    }
    return testarEscalar(p.script, p.constantes, valores, {
      naoNegativo: p.naoNeg, doseMinima: parseNum(p.doseMinima) || 0, abaixoMinimo: p.abaixoMinimo,
      doseMaxima: parseNum(p.doseMaxima) || 0,
    });
  }, [p.script, p.constantes, p.val, p.naoNeg, p.doseMinima, p.abaixoMinimo, p.doseMaxima, testVals]);

  function setConst(i: number, patch: Partial<ConstanteEquacao>) {
    p.setConstantes(p.constantes.map((c, idx) => idx === i ? { ...c, ...patch } : c));
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] font-semibold" style={{ color: '#cbd5e1' }}>Constantes</label>
          <button onClick={() => p.setConstantes([...p.constantes, { nome: '', valor: 0 }])}
            className="text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1" style={{ background: '#1a3a6b', color: '#93c5fd' }}><Plus size={10} /> Constante</button>
        </div>
        {p.constantes.length === 0 && <p className="text-[9px]" style={{ color: '#64748b' }}>Opcional. Ex.: CaO = 28, PRNT = 95.</p>}
        <div className="space-y-1">
          {p.constantes.map((k, i) => (
            <div key={i} className="flex gap-1 items-center">
              <input value={k.nome} onChange={e => setConst(i, { nome: e.target.value })} placeholder="nome" className="flex-1 rounded px-2 py-1 text-[10px] font-mono outline-none" style={inputStyle} />
              <input value={String(k.valor)} onChange={e => setConst(i, { valor: parseNum(e.target.value) || 0 })} placeholder="valor" inputMode="decimal" className="w-20 rounded px-2 py-1 text-[10px] font-mono outline-none" style={inputStyle} />
              <button onClick={() => p.setConstantes(p.constantes.filter((_, idx) => idx !== i))} className="p-1 rounded hover:bg-white/10" style={{ color: '#f87171' }}><Trash2 size={10} /></button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>Fórmula</label>
        <textarea ref={p.scriptRef} value={p.script} onChange={e => p.setScript(e.target.value)} rows={6} spellCheck={false}
          placeholder={'dose = (70 - V) / 100 * CTC * 10'}
          className="w-full rounded px-2 py-1.5 text-[11px] font-mono outline-none resize-none" style={inputStyle} />
        <p className="text-[9px] mt-1" style={{ color: '#64748b' }}>
          Resultado = <code>dose</code>. Decimal com vírgula (0,71428) e argumentos com ponto-e-vírgula. Funções: se · max · min · arredonda · raiz · abs.
        </p>
        <label className="flex items-center gap-1.5 mt-1.5 text-[10px]" style={{ color: '#cbd5e1' }}>
          <input type="checkbox" checked={p.naoNeg} onChange={e => p.setNaoNeg(e.target.checked)} /> Não permitir dose negativa (vira 0)
        </label>
      </div>

      {/* Dose mínima viável (operacional) */}
      <div>
        <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>
          Dose mínima viável{p.unTrat ? ` (${p.unTrat})` : ''}
        </label>
        <input value={p.doseMinima} onChange={e => p.setDoseMinima(e.target.value)} placeholder="0 = sem mínimo" inputMode="decimal"
          className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle} />
        {(parseNum(p.doseMinima) || 0) > 0 && (
          <div className="flex gap-1 mt-1">
            {([['zero', 'Abaixo disso: zera'], ['minimo', 'Abaixo disso: aplica a mínima']] as const).map(([v, label]) => (
              <button key={v} onClick={() => p.setAbaixoMinimo(v)} className="flex-1 py-1 rounded text-[9px] font-bold"
                style={{ background: p.abaixoMinimo === v ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: p.abaixoMinimo === v ? '#fff' : '#94a3b8' }}>
                {label}
              </button>
            ))}
          </div>
        )}
        <p className="text-[9px] mt-1" style={{ color: '#64748b' }}>Ex.: calcário só compensa a partir de uma dose; abaixo dela, zera ou sobe para a mínima.</p>
      </div>

      {/* Dose máxima (teto operacional) */}
      <div>
        <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>
          Dose máxima{p.unTrat ? ` (${p.unTrat})` : ''}
        </label>
        <input value={p.doseMaxima} onChange={e => p.setDoseMaxima(e.target.value)} placeholder="0 = sem máximo" inputMode="decimal"
          className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle} />
        <p className="text-[9px] mt-1" style={{ color: '#64748b' }}>Acima desse valor a dose é limitada ao teto no mapa (ex.: nunca aplicar mais que X t/ha numa passada).</p>
      </div>

      <div>
        <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>Atributos (clique para inserir)</label>
        <div className="flex flex-wrap gap-1">
          {ATRIBUTOS_EQUACAO.map(a => (
            <button key={a.token} onClick={() => p.inserirToken(a.token)} title={`${a.rotulo}${a.unidade ? ` (${a.unidade})` : ''}`}
              className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: '#1a3a6b', color: '#93c5fd' }}>{a.token}</button>
          ))}
        </div>
        <label className="text-[10px] font-semibold block mb-1 mt-2" style={{ color: '#cbd5e1' }}>Funções</label>
        <div className="flex flex-wrap gap-1">
          {FUNCOES_INSERIR.map(f => (
            <button key={f.rotulo} onClick={() => p.inserirToken(f.token)} title={f.dica}
              className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: '#12305c', color: '#c4b5fd' }}>{f.rotulo}</button>
          ))}
        </div>
      </div>

      <div className="rounded p-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
        <div className="flex items-center gap-1 mb-1">
          <Play size={11} style={{ color: '#22c55e' }} />
          <span className="text-[10px] font-bold" style={{ color: '#cbd5e1' }}>Teste</span>
        </div>
        {!p.val.ok ? (
          <p className="text-[10px]" style={{ color: '#fca5a5' }}>{p.val.erro}</p>
        ) : p.val.vars.length === 0 ? (
          <p className="text-[10px]" style={{ color: '#94a3b8' }}>
            Equação válida. {teste?.valor != null && isFinite(teste.valor) ? `Resultado: ${teste.valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}` : 'Sem atributos — use V, CTC, Ca…'}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-1 mb-1.5">
              {p.val.vars.map(v => {
                const at = atributoPorToken(v);
                return (
                  <div key={v} className="flex items-center gap-1">
                    <span className="text-[10px] font-mono w-10 text-right" style={{ color: '#93c5fd' }}>{at?.token ?? v}</span>
                    <input value={testVals[v] ?? ''} onChange={e => setTestVals(s => ({ ...s, [v]: e.target.value }))}
                      placeholder={String(at?.exemplo ?? '')} inputMode="decimal"
                      className="flex-1 rounded px-1.5 py-0.5 text-[10px] font-mono outline-none" style={inputStyle} />
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-1 text-[11px] font-bold" style={{ color: teste?.valor != null && isFinite(teste.valor) ? '#22c55e' : '#fca5a5' }}>
              <ChevronRight size={11} />
              {teste?.erro ? teste.erro
                : teste?.valor != null && isFinite(teste.valor)
                  ? `Dose ≈ ${teste.valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`
                  : 'preencha os valores'}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
