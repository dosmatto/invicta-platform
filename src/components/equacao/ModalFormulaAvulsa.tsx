'use client';

// MODAL "FÓRMULA" da aba Recomendações → Equação avulsa (v2.73).
//
// Abre a fórmula REAL da equação escolhida para editar antes de aplicar no
// talhão — a lógica do InCeres (a calculadora abre a equação num painel), com a
// diferença que aqui o cadastro da Biblioteca NÃO é tocado: o que sai daqui é um
// RASCUNHO que vale só para este talhão. Salvar na Biblioteca é um botão à
// parte, deliberado, porque a mesma equação serve a todos os outros talhões.
//
// O miolo (constantes, fórmula, limites, atributos, teste) é o MESMO componente
// do editor da Biblioteca — EditorFormula.

import { useMemo, useRef, useState } from 'react';
import { atualizar, criar, type ConstanteEquacao, type ConteudoEquacao, type ItemBiblioteca } from '@/lib/biblioteca';
import { validar } from '@/lib/recomendacao/motor';
import {
  equacaoComRascunho, formulaEditada, rascunhoDaEquacao, type RascunhoFormula,
} from '@/lib/recomendacao/formulaAvulsa';
import { parseNum } from '@/lib/lab';
import { EditorFormula } from '@/components/equacao/EditorFormula';
import { inputStyle } from '@/constants/ui';
import { X, Save, SaveAll, RotateCcw, Check, FileDown } from 'lucide-react';

const PROFUNDIDADES = ['0-20', '20-40', '0-40', '0-10', '10-20', '40-60'];
const UNIDADES = ['kg/ha', 't/ha', 'L/ha'];

export function ModalFormulaAvulsa({
  equacao, rascunho, outras, podeSalvarBiblioteca, onUsar, onTrocarEquacao, onFechar,
}: {
  equacao: ItemBiblioteca<ConteudoEquacao>;
  /** Ponto de partida: o rascunho já aplicado, ou o da própria equação. */
  rascunho: RascunhoFormula;
  /** Outras equações da Biblioteca — para copiar a fórmula de uma delas. */
  outras: ItemBiblioteca<ConteudoEquacao>[];
  podeSalvarBiblioteca: boolean;
  /** `null` = a fórmula voltou a ser a do cadastro (some o rascunho). */
  onUsar: (r: RascunhoFormula | null) => void;
  /** Salvou como NOVA equação → a tela passa a apontar para ela. */
  onTrocarEquacao: (id: string) => void;
  onFechar: () => void;
}) {
  const base = useMemo(() => rascunhoDaEquacao(equacao.conteudo), [equacao]);
  const [script, setScript] = useState(rascunho.script);
  const [constantes, setConstantes] = useState<ConstanteEquacao[]>(rascunho.constantes);
  const [naoNeg, setNaoNeg] = useState(rascunho.naoNegativo);
  const [doseMinima, setDoseMinima] = useState(rascunho.doseMinimaViavel ? String(rascunho.doseMinimaViavel) : '');
  const [abaixoMinimo, setAbaixoMinimo] = useState<'zero' | 'minimo'>(rascunho.abaixoMinimo);
  const [doseMaxima, setDoseMaxima] = useState(rascunho.doseMaxima ? String(rascunho.doseMaxima) : '');
  const [profundidade, setProfundidade] = useState(rascunho.profundidade);
  const [unTrat, setUnTrat] = useState(rascunho.unidadeTratamento);
  const [erro, setErro] = useState('');
  const scriptRef = useRef<HTMLTextAreaElement>(null);

  const val = useMemo(() => validar(script, constantes), [script, constantes]);

  function montar(): RascunhoFormula {
    return {
      script,
      constantes: constantes.filter(k => k.nome.trim()),
      naoNegativo: naoNeg,
      doseMinimaViavel: parseNum(doseMinima) || 0,
      abaixoMinimo,
      doseMaxima: parseNum(doseMaxima) || 0,
      profundidade: profundidade || '0-20',
      unidadeTratamento: unTrat.trim() || 'kg/ha',
    };
  }
  function aplicarRascunho(r: RascunhoFormula) {
    setScript(r.script); setConstantes(r.constantes); setNaoNeg(r.naoNegativo);
    setDoseMinima(r.doseMinimaViavel ? String(r.doseMinimaViavel) : '');
    setAbaixoMinimo(r.abaixoMinimo);
    setDoseMaxima(r.doseMaxima ? String(r.doseMaxima) : '');
    setProfundidade(r.profundidade); setUnTrat(r.unidadeTratamento);
  }
  function checar(): RascunhoFormula | null {
    setErro('');
    const r = montar();
    if (!r.script.trim()) { setErro('A fórmula está vazia.'); return null; }
    const v = validar(r.script, r.constantes);
    if (!v.ok) { setErro(v.erro ?? 'Fórmula inválida.'); return null; }
    return r;
  }

  function usar() {
    const r = checar();
    if (!r) return;
    // Voltou a ser igual ao cadastro → não vale guardar rascunho nenhum.
    onUsar(formulaEditada(equacao.conteudo, r) ? r : null);
    onFechar();
  }
  function restaurar() { aplicarRascunho(base); setErro(''); }

  // Copia SÓ a fórmula (script + constantes) de outra equação. Profundidade,
  // unidade e limites continuam sendo os desta — quem copia quer a conta, não
  // o cadastro inteiro do outro produto.
  function copiarDe(id: string) {
    const o = outras.find(e => e.id === id);
    if (!o) return;
    setScript(o.conteudo.script ?? '');
    setConstantes((o.conteudo.constantes ?? []).map(k => ({ ...k })));
    setErro('');
  }

  function salvarNaEquacao() {
    const r = checar();
    if (!r) return;
    if (!confirm(`Gravar esta fórmula na equação "${equacao.nome}" da Biblioteca?\n\nEla passa a valer para TODOS os talhões que usarem esta equação.`)) return;
    atualizar<ConteudoEquacao>('equacoes', equacao.id, { conteudo: equacaoComRascunho(equacao.conteudo, r) });
    onUsar(null);   // o cadastro virou o rascunho: não há mais o que sobrepor
    onFechar();
  }
  function salvarComoNova() {
    const r = checar();
    if (!r) return;
    const nome = window.prompt('Nome da nova equação:', `${equacao.nome} (cópia)`)?.trim();
    if (!nome) return;
    const nova = criar<ConteudoEquacao>('equacoes', {
      nome, descricao: equacao.descricao, conteudo: equacaoComRascunho(equacao.conteudo, r), escopo: 'empresa',
    });
    onUsar(null);
    onTrocarEquacao(nova.id);
    onFechar();
  }

  function inserirToken(tk: string) {
    const ta = scriptRef.current;
    if (!ta) { setScript(s => s + tk); return; }
    const start = ta.selectionStart ?? script.length;
    const end = ta.selectionEnd ?? script.length;
    setScript(script.slice(0, start) + tk + script.slice(end));
    requestAnimationFrame(() => { ta.focus(); const p = start + tk.length; ta.setSelectionRange(p, p); });
  }

  const editada = formulaEditada(equacao.conteudo, montar());

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center p-4" style={{ background: 'rgba(3,12,24,0.75)' }} onClick={onFechar}>
      <div className="flex flex-col rounded-lg overflow-hidden w-full" style={{ maxWidth: 720, maxHeight: '90vh', background: 'var(--invicta-blue-dark)', border: '1px solid #2e5fa3' }}
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-4 py-2 flex-shrink-0" style={{ borderBottom: '1px solid #1a3a6b' }}>
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase truncate" style={{ color: '#e2e8f0' }}>Fórmula da equação</div>
            <div className="text-[10px] truncate" style={{ color: '#93c5fd' }}>{equacao.nome}{equacao.conteudo.produto ? ` · ${equacao.conteudo.produto}` : ''}</div>
          </div>
          <button onClick={onFechar} className="p-1 rounded hover:bg-white/10" style={{ color: '#cbd5e1' }}><X size={13} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <p className="text-[9px]" style={{ color: '#64748b' }}>
            O que você escrever aqui vale só para <strong>este talhão</strong> — a equação da Biblioteca não muda,
            a menos que você use um dos botões de salvar.
          </p>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>Profundidade</label>
              <select value={profundidade} onChange={e => setProfundidade(e.target.value)} className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle}>
                {[...new Set([profundidade, ...PROFUNDIDADES])].filter(Boolean).map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>Unidade da dose</label>
              <select value={unTrat} onChange={e => setUnTrat(e.target.value)} className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle}>
                {[...new Set([unTrat, ...UNIDADES])].filter(Boolean).map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold block mb-1 flex items-center gap-1" style={{ color: '#cbd5e1' }}><FileDown size={10} /> Copiar fórmula de</label>
              <select value="" onChange={e => copiarDe(e.target.value)} className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle}>
                <option value="">outra equação…</option>
                {outras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
              </select>
            </div>
          </div>

          <EditorFormula {...{ constantes, setConstantes, script, setScript, scriptRef, naoNeg, setNaoNeg, doseMinima, setDoseMinima, abaixoMinimo, setAbaixoMinimo, doseMaxima, setDoseMaxima, unTrat, val, inserirToken }} />
        </div>

        {erro && <div className="mx-3 mb-2 px-2 py-1.5 rounded text-[10px] flex-shrink-0" style={{ background: '#3a1a1a', color: '#fca5a5', border: '1px solid #7f1d1d' }}>{erro}</div>}

        <div className="flex flex-wrap gap-2 px-3 py-2 flex-shrink-0" style={{ borderTop: '1px solid #1a3a6b' }}>
          <button onClick={onFechar} className="py-1.5 px-3 rounded text-[10px] font-bold" style={{ background: '#1a3a6b', color: '#cbd5e1' }}>Cancelar</button>
          <button onClick={restaurar} disabled={!editada} title="Volta à fórmula cadastrada na Biblioteca"
            className="py-1.5 px-3 rounded text-[10px] font-bold flex items-center gap-1 disabled:opacity-40" style={{ background: '#1a3a6b', color: '#fbbf24' }}>
            <RotateCcw size={11} /> Restaurar original
          </button>
          {podeSalvarBiblioteca && (<>
            <button onClick={salvarComoNova} title="Cria uma equação nova na Biblioteca com esta fórmula"
              className="py-1.5 px-3 rounded text-[10px] font-bold flex items-center gap-1" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
              <SaveAll size={11} /> Salvar como nova
            </button>
            <button onClick={salvarNaEquacao} title="Grava na equação da Biblioteca (vale para todos os talhões)"
              className="py-1.5 px-3 rounded text-[10px] font-bold flex items-center gap-1" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
              <Save size={11} /> Salvar na equação
            </button>
          </>)}
          <button onClick={usar} className="flex-1 py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1"
            style={{ background: 'var(--invicta-green-dark)' }}>
            <Check size={11} /> Usar esta fórmula
          </button>
        </div>
      </div>
    </div>
  );

}
