'use client';

// Biblioteca → Equações (Fase R1). Lista ÚNICA e prática (sem abas de escopo) +
// busca; equações novas/clonadas nascem COMPARTILHADAS (escopo 'empresa') para
// que todos os usuários enxerguem. Editor numa página só (Detalhes → Equação →
// Estilo, sem trocar de aba) com "Salvar" e "Salvar como" (clona p/ pequenas
// alterações sem mexer na original). A equação é validada/testada ao vivo pelo
// motor (lib/recomendacao/motor.ts). Aplicar a um talhão e gerar o mapa de dose
// é a Fase R3.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CATEGORIAS, listar, criar, atualizar, excluir, ativar,
  type ItemBiblioteca, type ConteudoEquacao, type ConstanteEquacao, type EstiloRecomendacao,
} from '@/lib/biblioteca';
import type { CategoriaBiblioteca } from '@/lib/biblioteca';
import { ATRIBUTOS_EQUACAO, validar, testarEscalar, atributoPorToken } from '@/lib/recomendacao/motor';
import { pode } from '@/lib/empresa';
import { Plus, Edit3, Trash2, Power, Copy, X, Save, Play, ChevronRight, Search, SaveAll } from 'lucide-react';

const SLUG: CategoriaBiblioteca = 'equacoes';
const SEM_GRUPO = 'Sem grupo';
const inputStyle = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;

const listaDe = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean);
const parseNum = (s: string) => parseFloat(s.replace(',', '.'));

// Rampa de cores da dose (verde → vermelho) — âncoras interpoladas para QUALQUER nº de classes.
const RAMPA_DOSE = ['#1b7a1f', '#3fa336', '#6fbf3f', '#9ccc4e', '#cddb39', '#ffe93b', '#ffc107', '#ff9800', '#fb5a23', '#e23b2e'];
const hexRgb = (h: string): [number, number, number] => { const n = h.replace('#', ''); return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)]; };
function corNaRampa(t: number): string {
  const n = RAMPA_DOSE.length;
  const x = Math.max(0, Math.min(1, t)) * (n - 1);
  const i = Math.floor(x), f = x - i;
  if (i >= n - 1) return RAMPA_DOSE[n - 1];
  const a = hexRgb(RAMPA_DOSE[i]), b = hexRgb(RAMPA_DOSE[i + 1]);
  return '#' + [0, 1, 2].map(k => Math.round(a[k] + (b[k] - a[k]) * f).toString(16).padStart(2, '0')).join('');
}
// Reaplica a rampa nas classes pelo índice (1ª = verde escuro, última = vermelho, intermediárias interpoladas).
const distribuirCores = <T extends { cor: string }>(classes: T[]): T[] =>
  classes.map((c, i) => ({ ...c, cor: corNaRampa(classes.length <= 1 ? 1 : i / (classes.length - 1)) }));

function estiloPadrao(): EstiloRecomendacao {
  // 10 faixas padrão (verde → vermelho), limites de 1.000 em 1.000 kg/ha.
  return {
    valorMinimo: 0,
    classes: distribuirCores(Array.from({ length: 10 }, (_, i) => ({ cor: '', limiteSuperior: (i + 1) * 1000 }))),
    dividirAuto: false,
    zeroTransparente: true,
  };
}

export function EquacoesPanel() {
  const def = CATEGORIAS.find(c => c.slug === SLUG)!;
  const Icon = def.icone;
  const [refresh, setRefresh] = useState(0);
  const [filtro, setFiltro] = useState('');
  const [edit, setEdit] = useState<ItemBiblioteca<ConteudoEquacao> | 'novo' | null>(null);
  const podeBib = pode('biblioteca');

  useEffect(() => {
    const onCh = (e: Event) => {
      const d = (e as CustomEvent).detail as { slug?: CategoriaBiblioteca } | undefined;
      if (!d?.slug || d.slug === SLUG) setRefresh(x => x + 1);
    };
    if (typeof window !== 'undefined') window.addEventListener('inv:biblioteca', onCh);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('inv:biblioteca', onCh); };
  }, []);

  // Lista ÚNICA: tudo que o usuário enxerga (suas + da empresa + do sistema).
  const itens = useMemo(
    () => listar<ConteudoEquacao>(SLUG),
    [refresh], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const filtrados = useMemo(() => {
    const f = filtro.trim().toLowerCase();
    if (!f) return itens;
    return itens.filter(i => `${i.nome} ${i.conteudo.produto ?? ''} ${i.conteudo.grupo ?? ''} ${(i.conteudo.culturas ?? []).join(' ')}`.toLowerCase().includes(f));
  }, [itens, filtro]);

  // Agrupa por Grupo (rótulo livre); "Sem grupo" por último. Cabeçalhos recolhem.
  const grupos = useMemo(() => {
    const m = new Map<string, ItemBiblioteca<ConteudoEquacao>[]>();
    for (const it of filtrados) {
      const g = it.conteudo.grupo?.trim() || SEM_GRUPO;
      (m.get(g) ?? m.set(g, []).get(g)!).push(it);
    }
    return [...m.entries()].sort(([a], [b]) =>
      a === SEM_GRUPO ? 1 : b === SEM_GRUPO ? -1 : a.localeCompare(b, 'pt-BR'));
  }, [filtrados]);
  const [colapsados, setColapsados] = useState<Set<string>>(new Set());
  const toggleGrupo = (g: string) => setColapsados(prev => {
    const n = new Set(prev); if (n.has(g)) n.delete(g); else n.add(g); return n;
  });

  function excluirItem(it: ItemBiblioteca<ConteudoEquacao>) {
    if (!confirm(`Excluir a equação "${it.nome}"?`)) return;
    excluir(SLUG, it.id);
  }
  // Clona como COMPARTILHADA (não como 'meu') para o outro usuário também ver.
  function clonar(it: ItemBiblioteca<ConteudoEquacao>) {
    criar<ConteudoEquacao>(SLUG, { nome: `${it.nome} (cópia)`, descricao: it.descricao, conteudo: it.conteudo, escopo: 'empresa' });
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

      <div className="px-3 pt-2 flex-shrink-0 flex gap-1.5">
        <div className="relative flex-1">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: '#64748b' }} />
          <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Buscar equação..."
            className="w-full rounded pl-7 pr-2 py-1.5 text-[11px] outline-none" style={inputStyle} />
        </div>
        {podeBib && (
          <button onClick={() => setEdit('novo')}
            className="px-2.5 py-1.5 rounded text-[10px] font-bold text-white flex items-center gap-1 flex-shrink-0"
            style={{ background: 'var(--invicta-green-dark)' }}>
            <Plus size={11} /> Nova
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {filtrados.length === 0 ? (
          <div className="text-center py-8 px-4">
            <p className="text-[10px]" style={{ color: '#64748b' }}>
              {itens.length === 0 ? 'Nenhuma equação ainda. Use ' : 'Nada encontrado. '}
              {itens.length === 0 && <em>+ Nova</em>}{itens.length === 0 ? '.' : ''}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {grupos.map(([g, lista]) => {
              const aberto = filtro.trim() ? true : !colapsados.has(g);
              return (
                <div key={g}>
                  <button onClick={() => toggleGrupo(g)} className="w-full flex items-center gap-1.5 px-1 py-1 text-left rounded hover:bg-white/5">
                    <ChevronRight size={12} style={{ color: '#93c5fd', transform: aberto ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
                    <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: g === SEM_GRUPO ? '#64748b' : '#93c5fd' }}>{g}</span>
                    <span className="text-[9px]" style={{ color: '#475569' }}>· {lista.length}</span>
                  </button>
                  {aberto && (
                    <div className="space-y-1.5 mt-1 pl-1">
                      {lista.map(it => (
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
                            {it.escopo === 'sistema' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#1a3a6b', color: '#93c5fd' }}>sistema</span>}
                            {!it.ativo && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#1a3a6b', color: '#94a3b8' }}>inativo</span>}
                            {podeBib && (<>
                              <button onClick={() => setEdit(it)} title="Editar" className="p-1 rounded hover:bg-white/10" style={{ color: '#93c5fd' }}><Edit3 size={11} /></button>
                              <button onClick={() => clonar(it)} title="Clonar" className="p-1 rounded hover:bg-white/10" style={{ color: '#93c5fd' }}><Copy size={11} /></button>
                              <button onClick={() => ativar(SLUG, it.id, !it.ativo)} title={it.ativo ? 'Inativar' : 'Ativar'} className="p-1 rounded hover:bg-white/10" style={{ color: it.ativo ? '#fbbf24' : '#22c55e' }}><Power size={11} /></button>
                              <button onClick={() => excluirItem(it)} title="Excluir" className="p-1 rounded hover:bg-white/10" style={{ color: '#f87171' }}><Trash2 size={11} /></button>
                            </>)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {edit && <EquacaoEditor item={edit === 'novo' ? null : edit} onClose={() => setEdit(null)} />}
    </section>
  );
}

// ─── Editor (página única) ────────────────────────────────────────────────

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wide mb-1.5 pb-1" style={{ color: '#93c5fd', borderBottom: '1px solid #1a3a6b' }}>{titulo}</div>
      {children}
    </div>
  );
}

function EquacaoEditor({ item, onClose }: { item: ItemBiblioteca<ConteudoEquacao> | null; onClose: () => void }) {
  const c = item?.conteudo;
  const [nome, setNome] = useState(item?.nome ?? '');
  const [descricao, setDescricao] = useState(item?.descricao ?? '');
  const [produto, setProduto] = useState(c?.produto ?? '');
  const [custo, setCusto] = useState(c?.custoTonelada != null ? String(c.custoTonelada) : '');
  const [frete, setFrete] = useState(c?.freteHa ? String(c.freteHa) : '');
  const [aplicacao, setAplicacao] = useState(c?.aplicacaoHa ? String(c.aplicacaoHa) : '');
  const [profundidade, setProfundidade] = useState(c?.profundidade ?? '0-20');
  const [unEq, setUnEq] = useState(c?.unidadeEquacao ?? '');
  const [unTrat, setUnTrat] = useState(c?.unidadeTratamento ?? 'kg/ha');
  const [tratamento, setTratamento] = useState<'taxa-variada' | 'taxa-fixa'>(c?.tratamento ?? 'taxa-variada');
  const [grupo, setGrupo] = useState(c?.grupo ?? '');
  // grupos já existentes (autocomplete do campo Grupo)
  const gruposExistentes = useMemo(() => {
    const set = new Set<string>();
    for (const it of listar<ConteudoEquacao>(SLUG)) { const g = it.conteudo.grupo?.trim(); if (g) set.add(g); }
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, []);
  const [culturas, setCulturas] = useState((c?.culturas ?? []).join(', '));
  const [fases, setFases] = useState((c?.fases ?? []).join(', '));
  const [naoNeg, setNaoNeg] = useState(c?.naoNegativo ?? true);
  const [doseMinima, setDoseMinima] = useState(c?.doseMinimaViavel ? String(c.doseMinimaViavel) : '');
  const [abaixoMinimo, setAbaixoMinimo] = useState<'zero' | 'minimo'>(c?.abaixoMinimo ?? 'zero');
  const [doseMaxima, setDoseMaxima] = useState(c?.doseMaxima ? String(c.doseMaxima) : '');
  const [constantes, setConstantes] = useState<ConstanteEquacao[]>(c?.constantes ?? []);
  const [script, setScript] = useState(c?.script ?? 'dose = ');
  const [estilo, setEstilo] = useState<EstiloRecomendacao>(c?.estilo ?? estiloPadrao());
  const [erro, setErro] = useState('');
  const scriptRef = useRef<HTMLTextAreaElement>(null);

  const val = useMemo(() => validar(script, constantes), [script, constantes]);

  function montarConteudo(): ConteudoEquacao {
    return {
      produto: produto.trim(),
      custoTonelada: custo.trim() ? parseNum(custo) : null,
      freteHa: frete.trim() ? (parseNum(frete) || 0) : 0,
      aplicacaoHa: aplicacao.trim() ? (parseNum(aplicacao) || 0) : 0,
      profundidade: profundidade || '0-20',
      unidadeEquacao: unEq.trim(),
      unidadeTratamento: unTrat.trim(),
      tratamento,
      grupo: grupo.trim() || undefined,
      culturas: listaDe(culturas),
      fases: listaDe(fases),
      naoNegativo: naoNeg,
      doseMinimaViavel: doseMinima.trim() ? (parseNum(doseMinima) || 0) : 0,
      abaixoMinimo,
      doseMaxima: doseMaxima.trim() ? (parseNum(doseMaxima) || 0) : 0,
      constantes: constantes.filter(k => k.nome.trim()),
      script,
      estilo,
    };
  }
  function validarTudo(): boolean {
    setErro('');
    if (!nome.trim()) { setErro('Dê um nome à equação.'); return false; }
    const v = validar(script, constantes);
    if (!v.ok) { setErro(v.erro ?? 'Equação inválida.'); return false; }
    return true;
  }
  function salvar() {
    if (!validarTudo()) return;
    const conteudo = montarConteudo();
    if (item) atualizar<ConteudoEquacao>(SLUG, item.id, { nome: nome.trim(), descricao: descricao.trim() || undefined, conteudo });
    else criar<ConteudoEquacao>(SLUG, { nome: nome.trim(), descricao: descricao.trim() || undefined, conteudo, escopo: 'empresa' });
    onClose();
  }
  // Salvar como = clona (cria NOVA) a partir das edições atuais, sem mexer na original.
  function salvarComo() {
    if (!validarTudo()) return;
    const base = nome.trim();
    const nomeNovo = item && base === item.nome ? `${base} (cópia)` : base;
    criar<ConteudoEquacao>(SLUG, { nome: nomeNovo, descricao: descricao.trim() || undefined, conteudo: montarConteudo(), escopo: 'empresa' });
    onClose();
  }

  function inserirToken(tk: string) {
    const ta = scriptRef.current;
    if (!ta) { setScript(s => s + tk); return; }
    const start = ta.selectionStart ?? script.length;
    const end = ta.selectionEnd ?? script.length;
    setScript(script.slice(0, start) + tk + script.slice(end));
    requestAnimationFrame(() => { ta.focus(); const p = start + tk.length; ta.setSelectionRange(p, p); });
  }

  return (
    <div className="absolute inset-0 z-10 flex flex-col" style={{ background: 'var(--invicta-blue-dark)' }}>
      <div className="flex items-center justify-between px-4 py-2 flex-shrink-0" style={{ borderBottom: '1px solid #1a3a6b' }}>
        <span className="text-[11px] font-bold uppercase truncate" style={{ color: '#e2e8f0' }}>{item ? 'Editar equação' : 'Nova equação'}</span>
        <button onClick={onClose} className="p-1 rounded hover:bg-white/10" style={{ color: '#cbd5e1' }}><X size={12} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <Secao titulo="Detalhes">
          <Detalhes {...{ nome, setNome, produto, setProduto, custo, setCusto, frete, setFrete, aplicacao, setAplicacao, profundidade, setProfundidade, unEq, setUnEq, unTrat, setUnTrat, tratamento, setTratamento, grupo, setGrupo, gruposExistentes, culturas, setCulturas, fases, setFases, descricao, setDescricao }} />
        </Secao>
        <Secao titulo="Equação">
          <Equacao {...{ constantes, setConstantes, script, setScript, scriptRef, naoNeg, setNaoNeg, doseMinima, setDoseMinima, abaixoMinimo, setAbaixoMinimo, doseMaxima, setDoseMaxima, unTrat, val, inserirToken }} />
        </Secao>
        <Secao titulo="Estilo do mapa">
          <Estilo estilo={estilo} setEstilo={setEstilo} unidade={unTrat} />
        </Secao>
      </div>

      {erro && <div className="mx-3 mb-2 px-2 py-1.5 rounded text-[10px] flex-shrink-0" style={{ background: '#3a1a1a', color: '#fca5a5', border: '1px solid #7f1d1d' }}>{erro}</div>}
      <div className="flex gap-2 px-3 py-2 flex-shrink-0" style={{ borderTop: '1px solid #1a3a6b' }}>
        <button onClick={onClose} className="py-1.5 px-3 rounded text-[10px] font-bold" style={{ background: '#1a3a6b', color: '#cbd5e1' }}>Cancelar</button>
        <button onClick={salvarComo} title="Cria uma nova equação a partir destas edições (não altera a original)"
          className="flex-1 py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
          <SaveAll size={11} /> Salvar como
        </button>
        <button onClick={salvar} className="flex-1 py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1" style={{ background: 'var(--invicta-green-dark)' }}>
          <Save size={11} /> Salvar
        </button>
      </div>
    </div>
  );
}

// ── Componentes de campo ────────────────────────────────────────────────────
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>{label}</label>
      {children}
    </div>
  );
}
const txt = "w-full rounded px-2 py-1.5 text-[11px] outline-none";

const PROFUNDIDADES = ['0-20', '20-40', '0-40', '0-10', '10-20', '40-60'];

function Detalhes(p: {
  nome: string; setNome: (s: string) => void; produto: string; setProduto: (s: string) => void;
  custo: string; setCusto: (s: string) => void; frete: string; setFrete: (s: string) => void;
  aplicacao: string; setAplicacao: (s: string) => void; profundidade: string; setProfundidade: (s: string) => void;
  unEq: string; setUnEq: (s: string) => void;
  unTrat: string; setUnTrat: (s: string) => void; tratamento: 'taxa-variada' | 'taxa-fixa'; setTratamento: (s: 'taxa-variada' | 'taxa-fixa') => void;
  grupo: string; setGrupo: (s: string) => void; gruposExistentes: string[];
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
        <Campo label="Frete (R$/ha)"><input value={p.frete} onChange={e => p.setFrete(e.target.value)} placeholder="ex: 18" inputMode="decimal" className={txt} style={inputStyle} /></Campo>
        <Campo label="Aplicação (R$/ha)"><input value={p.aplicacao} onChange={e => p.setAplicacao(e.target.value)} placeholder="ex: 22" inputMode="decimal" className={txt} style={inputStyle} /></Campo>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Campo label="Profundidade (a equação lê)">
          <select value={p.profundidade} onChange={e => p.setProfundidade(e.target.value)} className={txt} style={inputStyle}>
            {(PROFUNDIDADES.includes(p.profundidade) ? PROFUNDIDADES : [p.profundidade, ...PROFUNDIDADES]).map(d => <option key={d} value={d}>{d} cm</option>)}
          </select>
        </Campo>
        <Campo label="Unidade de tratamento"><input value={p.unTrat} onChange={e => p.setUnTrat(e.target.value)} placeholder="ex: kg/ha" className={txt} style={inputStyle} /></Campo>
      </div>
      <Campo label="Unidade da equação"><input value={p.unEq} onChange={e => p.setUnEq(e.target.value)} placeholder="ex: mmolc/dm³" className={txt} style={inputStyle} /></Campo>
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
      <Campo label="Grupo (organiza a lista)">
        <input value={p.grupo} onChange={e => p.setGrupo(e.target.value)} placeholder="ex: Calcário, Gesso, KCl" list="grupos-equacoes" className={txt} style={inputStyle} />
        <datalist id="grupos-equacoes">{p.gruposExistentes.map(g => <option key={g} value={g} />)}</datalist>
      </Campo>
      <div className="grid grid-cols-2 gap-2">
        <Campo label="Culturas (vírgula)"><input value={p.culturas} onChange={e => p.setCulturas(e.target.value)} placeholder="Soja, Milho" className={txt} style={inputStyle} /></Campo>
        <Campo label="Fases (vírgula)"><input value={p.fases} onChange={e => p.setFases(e.target.value)} placeholder="Pré-plantio" className={txt} style={inputStyle} /></Campo>
      </div>
      <Campo label="Descrição"><textarea value={p.descricao} onChange={e => p.setDescricao(e.target.value)} rows={2} className={txt + " resize-none"} style={inputStyle} /></Campo>
    </div>
  );
}

function Equacao(p: {
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
      valores[v] = raw != null && raw.trim() ? parseNum(raw) : (at?.exemplo ?? NaN);
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

function Estilo({ estilo, setEstilo, unidade }: { estilo: EstiloRecomendacao; setEstilo: (e: EstiloRecomendacao) => void; unidade: string }) {
  function setClasse(i: number, patch: Partial<{ cor: string; limiteSuperior: number }>) {
    setEstilo({ ...estilo, classes: estilo.classes.map((c, idx) => idx === i ? { ...c, ...patch } : c) });
  }
  function addClasse() {
    const ult = estilo.classes[estilo.classes.length - 1];
    const novas = [...estilo.classes, { cor: '#e23b2e', limiteSuperior: (ult?.limiteSuperior ?? 0) + 1000 }];
    setEstilo({ ...estilo, classes: distribuirCores(novas) });   // re-espalha verde→vermelho
  }
  function rmClasse(i: number) {
    setEstilo({ ...estilo, classes: distribuirCores(estilo.classes.filter((_, idx) => idx !== i)) });
  }

  return (
    <div className="space-y-3">
      <p className="text-[9px]" style={{ color: '#64748b' }}>
        Escala fixa de cores por classe de dose{unidade ? ` (${unidade})` : ''}. Menor dose = verde, maior = vermelho. Cada classe vai do limite anterior até o seu <strong>limite superior</strong>.
      </p>

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
          <div className="flex items-center gap-1">
            <button onClick={() => setEstilo({ ...estilo, classes: distribuirCores(estilo.classes) })} title="Reaplica a rampa verde→vermelho em todas as classes" className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#1a3a6b', color: '#93c5fd' }}>Distribuir cores</button>
            <button onClick={addClasse} className="text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1" style={{ background: '#1a3a6b', color: '#93c5fd' }}><Plus size={10} /> Classe</button>
          </div>
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
