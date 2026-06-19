'use client';

// Biblioteca → Equações (Fase R1). Lista de equações de recomendação com CRUD
// e um editor de 3 abas (Detalhes / Equação / Estilo), espelhando o modelo de
// referência. A equação é escrita na linguagem simples da plataforma e validada/
// testada ao vivo pelo motor (lib/recomendacao/motor.ts). Aplicar a um talhão e
// gerar o mapa de dose é a Fase R3.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CATEGORIAS, listar, criar, atualizar, excluir, ativar, duplicar,
  type EscopoBiblioteca, type CategoriaBiblioteca, type ItemBiblioteca,
  type ConteudoEquacao, type ConstanteEquacao, type EstiloRecomendacao,
} from '@/lib/biblioteca';
import { ATRIBUTOS_EQUACAO, validar, testarEscalar, atributoPorToken } from '@/lib/recomendacao/motor';
import { Plus, Edit3, Trash2, Power, Copy, X, Save, Play, ChevronRight } from 'lucide-react';

const SLUG: CategoriaBiblioteca = 'equacoes';
const inputStyle = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;

const abaLabel = (e: EscopoBiblioteca) => (e === 'meu' ? 'Meus padrões' : e === 'empresa' ? 'Empresa' : 'Sistema');
const listaDe = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean);
const parseNum = (s: string) => parseFloat(s.replace(',', '.'));

function estiloPadrao(): EstiloRecomendacao {
  return {
    valorMinimo: 0,
    classes: [
      { cor: '#1a7a1a', limiteSuperior: 250 },
      { cor: '#7cba2c', limiteSuperior: 500 },
      { cor: '#f2d600', limiteSuperior: 1000 },
      { cor: '#f59e0b', limiteSuperior: 2000 },
      { cor: '#e23b2e', limiteSuperior: 4000 },
    ],
    dividirAuto: false,
    zeroTransparente: true,
  };
}

export function EquacoesPanel() {
  const def = CATEGORIAS.find(c => c.slug === SLUG)!;
  const Icon = def.icone;
  const [aba, setAba] = useState<EscopoBiblioteca>('meu');
  const [refresh, setRefresh] = useState(0);
  const [edit, setEdit] = useState<ItemBiblioteca<ConteudoEquacao> | 'novo' | null>(null);

  useEffect(() => {
    const onCh = (e: Event) => {
      const d = (e as CustomEvent).detail as { slug?: CategoriaBiblioteca } | undefined;
      if (!d?.slug || d.slug === SLUG) setRefresh(x => x + 1);
    };
    if (typeof window !== 'undefined') window.addEventListener('inv:biblioteca', onCh);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('inv:biblioteca', onCh); };
  }, []);

  const itens = useMemo(
    () => listar<ConteudoEquacao>(SLUG, aba),
    [aba, refresh], // eslint-disable-line react-hooks/exhaustive-deps
  );

  function excluirItem(it: ItemBiblioteca<ConteudoEquacao>) {
    if (!confirm(`Excluir a equação "${it.nome}"?`)) return;
    excluir(SLUG, it.id);
  }

  return (
    <section className="flex-1 flex flex-col overflow-hidden relative">
      <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #1a3a6b' }}>
        <div className="flex items-center gap-2 mb-1">
          <Icon size={14} style={{ color: '#93c5fd' }} />
          <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: '#e2e8f0' }}>{def.nome}</h3>
        </div>
        <p className="text-[10px]" style={{ color: '#64748b' }}>{def.descricao}</p>
      </div>

      <div className="flex gap-1 px-3 pt-2 flex-shrink-0">
        {(['meu', 'empresa', 'sistema'] as EscopoBiblioteca[]).map(t => (
          <button key={t} onClick={() => setAba(t)}
            className="flex-1 py-1 rounded text-[10px] font-bold"
            style={{ background: aba === t ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: aba === t ? '#fff' : '#64748b' }}>
            {abaLabel(t)}
          </button>
        ))}
      </div>

      {aba !== 'sistema' && (
        <div className="px-3 pt-2 flex-shrink-0">
          <button onClick={() => setEdit('novo')}
            className="w-full py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1"
            style={{ background: 'var(--invicta-green-dark)' }}>
            <Plus size={11} /> Nova equação
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {itens.length === 0 ? (
          <div className="text-center py-8 px-4">
            <p className="text-[10px]" style={{ color: '#64748b' }}>
              Nenhuma equação em <strong>{abaLabel(aba)}</strong>.
              {aba !== 'sistema' && <> Use <em>+ Nova equação</em>.</>}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {itens.map(it => (
              <div key={it.id} className="p-2 rounded-lg" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-bold truncate" style={{ color: '#e2e8f0' }}>{it.nome}</div>
                    <div className="text-[9px] truncate" style={{ color: '#64748b' }}>
                      {it.conteudo.produto || 'sem produto'}
                      {it.conteudo.unidadeTratamento ? ` · ${it.conteudo.unidadeTratamento}` : ''}
                      {it.conteudo.custoTonelada != null ? ` · R$ ${it.conteudo.custoTonelada}/t` : ''}
                    </div>
                  </div>
                  {!it.ativo && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#1a3a6b', color: '#94a3b8' }}>inativo</span>}
                  <button onClick={() => setEdit(it)} title="Editar" className="p-1 rounded hover:bg-white/10" style={{ color: '#93c5fd' }}><Edit3 size={11} /></button>
                  <button onClick={() => duplicar(SLUG, it.id)} title="Duplicar" className="p-1 rounded hover:bg-white/10" style={{ color: '#93c5fd' }}><Copy size={11} /></button>
                  <button onClick={() => ativar(SLUG, it.id, !it.ativo)} title={it.ativo ? 'Inativar' : 'Ativar'} className="p-1 rounded hover:bg-white/10" style={{ color: it.ativo ? '#fbbf24' : '#22c55e' }}><Power size={11} /></button>
                  <button onClick={() => excluirItem(it)} title="Excluir" className="p-1 rounded hover:bg-white/10" style={{ color: '#f87171' }}><Trash2 size={11} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {edit && (
        <EquacaoEditor
          item={edit === 'novo' ? null : edit}
          escopoNovo={aba === 'sistema' ? 'meu' : aba}
          onClose={() => setEdit(null)}
        />
      )}
    </section>
  );
}

// ─── Editor (3 abas) ──────────────────────────────────────────────────────

const TABS: { id: 'detalhes' | 'equacao' | 'estilo'; label: string }[] = [
  { id: 'detalhes', label: 'Detalhes' },
  { id: 'equacao', label: 'Equação' },
  { id: 'estilo', label: 'Estilo' },
];

function EquacaoEditor({ item, escopoNovo, onClose }: {
  item: ItemBiblioteca<ConteudoEquacao> | null;
  escopoNovo: EscopoBiblioteca;
  onClose: () => void;
}) {
  const c = item?.conteudo;
  const [tab, setTab] = useState<'detalhes' | 'equacao' | 'estilo'>('detalhes');
  const [nome, setNome] = useState(item?.nome ?? '');
  const [descricao, setDescricao] = useState(item?.descricao ?? '');
  const [produto, setProduto] = useState(c?.produto ?? '');
  const [custo, setCusto] = useState(c?.custoTonelada != null ? String(c.custoTonelada) : '');
  const [unEq, setUnEq] = useState(c?.unidadeEquacao ?? '');
  const [unTrat, setUnTrat] = useState(c?.unidadeTratamento ?? 'kg/ha');
  const [tratamento, setTratamento] = useState<'taxa-variada' | 'taxa-fixa'>(c?.tratamento ?? 'taxa-variada');
  const [culturas, setCulturas] = useState((c?.culturas ?? []).join(', '));
  const [fases, setFases] = useState((c?.fases ?? []).join(', '));
  const [naoNeg, setNaoNeg] = useState(c?.naoNegativo ?? true);
  const [constantes, setConstantes] = useState<ConstanteEquacao[]>(c?.constantes ?? []);
  const [script, setScript] = useState(c?.script ?? 'dose = ');
  const [estilo, setEstilo] = useState<EstiloRecomendacao>(c?.estilo ?? estiloPadrao());
  const [erro, setErro] = useState('');
  const scriptRef = useRef<HTMLTextAreaElement>(null);

  const val = useMemo(() => validar(script, constantes), [script, constantes]);

  function salvar() {
    setErro('');
    if (!nome.trim()) { setErro('Dê um nome à equação.'); setTab('detalhes'); return; }
    const v = validar(script, constantes);
    if (!v.ok) { setErro(v.erro ?? 'Equação inválida.'); setTab('equacao'); return; }
    const conteudo: ConteudoEquacao = {
      produto: produto.trim(),
      custoTonelada: custo.trim() ? parseNum(custo) : null,
      unidadeEquacao: unEq.trim(),
      unidadeTratamento: unTrat.trim(),
      tratamento,
      culturas: listaDe(culturas),
      fases: listaDe(fases),
      naoNegativo: naoNeg,
      constantes: constantes.filter(k => k.nome.trim()),
      script,
      estilo,
    };
    if (item) atualizar<ConteudoEquacao>(SLUG, item.id, { nome: nome.trim(), descricao: descricao.trim() || undefined, conteudo });
    else criar<ConteudoEquacao>(SLUG, { nome: nome.trim(), descricao: descricao.trim() || undefined, conteudo, escopo: escopoNovo });
    onClose();
  }

  function inserirToken(tk: string) {
    const ta = scriptRef.current;
    if (!ta) { setScript(s => s + tk); return; }
    const start = ta.selectionStart ?? script.length;
    const end = ta.selectionEnd ?? script.length;
    const novo = script.slice(0, start) + tk + script.slice(end);
    setScript(novo);
    requestAnimationFrame(() => { ta.focus(); const p = start + tk.length; ta.setSelectionRange(p, p); });
  }

  return (
    <div className="absolute inset-0 z-10 flex flex-col" style={{ background: 'var(--invicta-blue-dark)' }}>
      <div className="flex items-center justify-between px-4 py-2 flex-shrink-0" style={{ borderBottom: '1px solid #1a3a6b' }}>
        <span className="text-[11px] font-bold uppercase truncate" style={{ color: '#e2e8f0' }}>
          {item ? 'Editar equação' : 'Nova equação'}
        </span>
        <button onClick={onClose} className="p-1 rounded hover:bg-white/10" style={{ color: '#cbd5e1' }}><X size={12} /></button>
      </div>

      <div className="flex gap-1 px-3 pt-2 flex-shrink-0">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex-1 py-1 rounded text-[10px] font-bold"
            style={{ background: tab === t.id ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: tab === t.id ? '#fff' : '#64748b' }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {tab === 'detalhes' && (
          <Detalhes {...{ nome, setNome, produto, setProduto, custo, setCusto, unEq, setUnEq, unTrat, setUnTrat, tratamento, setTratamento, culturas, setCulturas, fases, setFases, descricao, setDescricao }} />
        )}
        {tab === 'equacao' && (
          <Equacao {...{ constantes, setConstantes, script, setScript, scriptRef, naoNeg, setNaoNeg, val, inserirToken }} />
        )}
        {tab === 'estilo' && (
          <Estilo estilo={estilo} setEstilo={setEstilo} unidade={unTrat} />
        )}
      </div>

      {erro && (
        <div className="mx-3 mb-2 px-2 py-1.5 rounded text-[10px] flex-shrink-0" style={{ background: '#3a1a1a', color: '#fca5a5', border: '1px solid #7f1d1d' }}>{erro}</div>
      )}
      <div className="flex gap-2 px-3 py-2 flex-shrink-0" style={{ borderTop: '1px solid #1a3a6b' }}>
        <button onClick={onClose} className="flex-1 py-1.5 rounded text-[10px] font-bold" style={{ background: '#1a3a6b', color: '#cbd5e1' }}>Cancelar</button>
        <button onClick={salvar} className="flex-1 py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1" style={{ background: 'var(--invicta-green-dark)' }}><Save size={11} /> Salvar</button>
      </div>
    </div>
  );
}

// ── Aba Detalhes ──────────────────────────────────────────────────────────
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>{label}</label>
      {children}
    </div>
  );
}
const txt = "w-full rounded px-2 py-1.5 text-[11px] outline-none";

function Detalhes(p: {
  nome: string; setNome: (s: string) => void; produto: string; setProduto: (s: string) => void;
  custo: string; setCusto: (s: string) => void; unEq: string; setUnEq: (s: string) => void;
  unTrat: string; setUnTrat: (s: string) => void; tratamento: 'taxa-variada' | 'taxa-fixa'; setTratamento: (s: 'taxa-variada' | 'taxa-fixa') => void;
  culturas: string; setCulturas: (s: string) => void; fases: string; setFases: (s: string) => void;
  descricao: string; setDescricao: (s: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Campo label="Nome"><input value={p.nome} onChange={e => p.setNome(e.target.value)} placeholder="ex: 001 - Calagem 60% Ca" className={txt} style={inputStyle} /></Campo>
      <div className="grid grid-cols-2 gap-2">
        <Campo label="Produto"><input value={p.produto} onChange={e => p.setProduto(e.target.value)} placeholder="ex: Calcário" className={txt} style={inputStyle} /></Campo>
        <Campo label="Custo / tonelada (R$)"><input value={p.custo} onChange={e => p.setCusto(e.target.value)} placeholder="ex: 180" inputMode="decimal" className={txt} style={inputStyle} /></Campo>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Campo label="Unidade da equação"><input value={p.unEq} onChange={e => p.setUnEq(e.target.value)} placeholder="ex: mmolc/dm³" className={txt} style={inputStyle} /></Campo>
        <Campo label="Unidade de tratamento"><input value={p.unTrat} onChange={e => p.setUnTrat(e.target.value)} placeholder="ex: kg/ha" className={txt} style={inputStyle} /></Campo>
      </div>
      <Campo label="Tratamento">
        <div className="flex gap-1">
          {(['taxa-variada', 'taxa-fixa'] as const).map(t => (
            <button key={t} onClick={() => p.setTratamento(t)} className="flex-1 py-1.5 rounded text-[10px] font-bold"
              style={{ background: p.tratamento === t ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: p.tratamento === t ? '#fff' : '#94a3b8' }}>
              {t === 'taxa-variada' ? 'Taxa Variada' : 'Taxa Fixa'}
            </button>
          ))}
        </div>
      </Campo>
      <div className="grid grid-cols-2 gap-2">
        <Campo label="Culturas (vírgula)"><input value={p.culturas} onChange={e => p.setCulturas(e.target.value)} placeholder="Soja, Milho" className={txt} style={inputStyle} /></Campo>
        <Campo label="Fases (vírgula)"><input value={p.fases} onChange={e => p.setFases(e.target.value)} placeholder="Pré-plantio" className={txt} style={inputStyle} /></Campo>
      </div>
      <Campo label="Descrição"><textarea value={p.descricao} onChange={e => p.setDescricao(e.target.value)} rows={3} className={txt + " resize-none"} style={inputStyle} /></Campo>
    </div>
  );
}

// ── Aba Equação ───────────────────────────────────────────────────────────
function Equacao(p: {
  constantes: ConstanteEquacao[]; setConstantes: (c: ConstanteEquacao[]) => void;
  script: string; setScript: (s: string) => void; scriptRef: React.RefObject<HTMLTextAreaElement | null>;
  naoNeg: boolean; setNaoNeg: (b: boolean) => void;
  val: ReturnType<typeof validar>; inserirToken: (t: string) => void;
}) {
  const [testVals, setTestVals] = useState<Record<string, string>>({});
  const teste = useMemo(() => {
    if (!p.val.ok || p.val.vars.length === 0 && !p.script.trim()) return null;
    const valores: Record<string, number> = {};
    for (const v of p.val.vars) {
      const raw = testVals[v];
      const at = atributoPorToken(v);
      valores[v] = raw != null && raw.trim() ? parseNum(raw) : (at?.exemplo ?? NaN);
    }
    return testarEscalar(p.script, p.constantes, valores, p.naoNeg);
  }, [p.script, p.constantes, p.val, p.naoNeg, testVals]);

  function setConst(i: number, patch: Partial<ConstanteEquacao>) {
    const next = p.constantes.map((c, idx) => idx === i ? { ...c, ...patch } : c);
    p.setConstantes(next);
  }

  return (
    <div className="space-y-3">
      {/* Constantes */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] font-semibold" style={{ color: '#cbd5e1' }}>Constantes</label>
          <button onClick={() => p.setConstantes([...p.constantes, { nome: '', valor: 0 }])}
            className="text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
            <Plus size={10} /> Constante
          </button>
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

      {/* Script */}
      <div>
        <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>Equação</label>
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

      {/* Variáveis disponíveis */}
      <div>
        <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>Atributos (clique para inserir)</label>
        <div className="flex flex-wrap gap-1">
          {ATRIBUTOS_EQUACAO.map(a => (
            <button key={a.token} onClick={() => p.inserirToken(a.token)} title={`${a.rotulo}${a.unidade ? ` (${a.unidade})` : ''}`}
              className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
              {a.token}
            </button>
          ))}
        </div>
      </div>

      {/* Validação + teste */}
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

// ── Aba Estilo ────────────────────────────────────────────────────────────
function Estilo({ estilo, setEstilo, unidade }: { estilo: EstiloRecomendacao; setEstilo: (e: EstiloRecomendacao) => void; unidade: string }) {
  function setClasse(i: number, patch: Partial<{ cor: string; limiteSuperior: number }>) {
    setEstilo({ ...estilo, classes: estilo.classes.map((c, idx) => idx === i ? { ...c, ...patch } : c) });
  }
  function addClasse() {
    const ult = estilo.classes[estilo.classes.length - 1];
    setEstilo({ ...estilo, classes: [...estilo.classes, { cor: '#e23b2e', limiteSuperior: (ult?.limiteSuperior ?? 0) + 1000 }] });
  }
  function rmClasse(i: number) {
    setEstilo({ ...estilo, classes: estilo.classes.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="space-y-3">
      <p className="text-[9px]" style={{ color: '#64748b' }}>
        Escala fixa de cores por classe de dose{unidade ? ` (${unidade})` : ''}. Menor dose = verde, maior = vermelho. Cada classe vai do limite anterior até o seu <strong>limite superior</strong>.
      </p>

      {/* Prévia da rampa */}
      <div className="h-3 rounded overflow-hidden flex" style={{ border: '1px solid #2e5fa3' }}>
        {estilo.classes.map((c, i) => <div key={i} className="flex-1" style={{ background: c.cor }} />)}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Campo label="Valor mínimo">
          <input value={String(estilo.valorMinimo)} onChange={e => setEstilo({ ...estilo, valorMinimo: parseNum(e.target.value) || 0 })} inputMode="decimal" className={txt} style={inputStyle} />
        </Campo>
        <div className="flex flex-col justify-end gap-1 pb-1">
          <label className="flex items-center gap-1.5 text-[10px]" style={{ color: '#cbd5e1' }}>
            <input type="checkbox" checked={estilo.zeroTransparente} onChange={e => setEstilo({ ...estilo, zeroTransparente: e.target.checked })} /> Cor zero transparente
          </label>
          <label className="flex items-center gap-1.5 text-[10px]" style={{ color: '#cbd5e1' }}>
            <input type="checkbox" checked={estilo.dividirAuto} onChange={e => setEstilo({ ...estilo, dividirAuto: e.target.checked })} /> Dividir classes automaticamente
          </label>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] font-semibold" style={{ color: '#cbd5e1' }}>Classes</label>
          <button onClick={addClasse} className="text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1" style={{ background: '#1a3a6b', color: '#93c5fd' }}><Plus size={10} /> Classe</button>
        </div>
        <div className="space-y-1">
          {estilo.classes.map((c, i) => (
            <div key={i} className="flex gap-1.5 items-center">
              <input type="color" value={c.cor} onChange={e => setClasse(i, { cor: e.target.value })} className="w-7 h-6 rounded cursor-pointer" style={{ background: 'transparent', border: '1px solid #2e5fa3' }} />
              <span className="text-[9px]" style={{ color: '#64748b' }}>até</span>
              <input value={String(c.limiteSuperior)} onChange={e => setClasse(i, { limiteSuperior: parseNum(e.target.value) || 0 })} inputMode="decimal" className="flex-1 rounded px-2 py-1 text-[10px] font-mono outline-none" style={inputStyle} />
              <button onClick={() => rmClasse(i)} className="p-1 rounded hover:bg-white/10" style={{ color: '#f87171' }}><Trash2 size={10} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
