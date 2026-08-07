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
  CATEGORIAS, listar, criar, atualizar, atualizarVarios, excluir, ativar, blocoDaEquacao, compararEquacoes, semAcento,
  type ItemBiblioteca, type ConteudoEquacao, type ConstanteEquacao, type EstiloRecomendacao,
} from '@/lib/biblioteca';
import type { CategoriaBiblioteca } from '@/lib/biblioteca';
import { custosDaEquacao, unidadePreco, ROTULO_CATEGORIA, type ConteudoInsumo, type CategoriaInsumo, type CustosResolvidos } from '@/lib/insumos';
import { ATRIBUTOS_EQUACAO, validar, testarEscalar, atributoPorToken } from '@/lib/recomendacao/motor';
import { pode } from '@/lib/empresa';
import { getPresetsEstilo, savePresetEstilo, deletePresetEstilo } from '@/lib/store';
import { distribuirCores, PRESETS_SISTEMA, RAMPAS, coresDaRampa, gradienteCssRampa } from '@/lib/estiloPresets';
import type { PresetEstiloRec } from '@/lib/biblioteca';
import { parseNum } from '@/lib/lab';
import { Plus, Edit3, Trash2, Power, Copy, X, Save, Play, ChevronRight, Search, SaveAll, Link2, Link2Off, AlertTriangle, Pencil } from 'lucide-react';

const SLUG: CategoriaBiblioteca = 'equacoes';
const SEM_GRUPO = 'Sem grupo';
import { inputStyle } from '@/constants/ui';

const listaDe = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean);

// ── Vínculo com a Biblioteca de Insumos (v2.42) ─────────────────────────────
// O preço saiu de dentro da equação e passou a morar no insumo. Estes helpers
// são compartilhados pela lista, pelo diálogo do grupo e pelo editor.

type MapaInsumos = ReadonlyMap<string, ItemBiblioteca<ConteudoInsumo>>;

function lerInsumos(): ItemBiblioteca<ConteudoInsumo>[] {
  return listar<ConteudoInsumo>('insumos').filter(i => i.ativo)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

const moeda = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "R$ 350,00/t · frete R$ 18,00/ha · aplicação R$ 22,00/ha" — some o que não há. */
function resumoCustos(c: CustosResolvidos): string {
  const p = [c.custoTonelada != null ? `R$ ${moeda(c.custoTonelada)}/t` : 'sem preço'];
  if (c.freteHa) p.push(`frete R$ ${moeda(c.freteHa)}/ha`);
  if (c.aplicacaoHa) p.push(`aplicação R$ ${moeda(c.aplicacaoHa)}/ha`);
  return p.join(' · ');
}

/** Insumo cujo nome bate com o produto digitado — a pré-seleção do vínculo. */
function acharPorNome(insumos: ItemBiblioteca<ConteudoInsumo>[], produto: string) {
  const alvo = semAcento((produto || '').trim());
  if (!alvo) return undefined;
  return insumos.find(i => semAcento(i.nome.trim()) === alvo);
}

// Rampa de cores (corNaRampa/distribuirCores) e presets do sistema vêm de @/lib/estiloPresets.

// Limites superiores de N classes dividindo [min, max] em partes iguais.
// Ex.: (50, 500, 10) → 95, 140, 185, … 500 (piso 50 fica implícito; abaixo = 0).
const arred2 = (x: number) => Math.round(x * 100) / 100;
function limitesDivididos(min: number, max: number, n: number): number[] {
  const passo = (max - min) / n;
  return Array.from({ length: n }, (_, i) => arred2(min + (i + 1) * passo));
}

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
      // 'insumos' também: o preço da equação vinculada vem de lá, e sem isto
      // editar o insumo não repintaria os custos desta lista.
      if (!d?.slug || d.slug === SLUG || d.slug === 'insumos') setRefresh(x => x + 1);
    };
    if (typeof window !== 'undefined') window.addEventListener('inv:biblioteca', onCh);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('inv:biblioteca', onCh); };
  }, []);

  // Lista ÚNICA: tudo que o usuário enxerga (suas + da empresa + do sistema).
  const itens = useMemo(
    () => listar<ConteudoEquacao>(SLUG),
    [refresh], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const insumos = useMemo(() => lerInsumos(), [refresh]);
  const insumosPorId: MapaInsumos = useMemo(() => new Map(insumos.map(i => [i.id, i])), [insumos]);
  const [vincular, setVincular] = useState<{ grupo: string; lista: ItemBiblioteca<ConteudoEquacao>[] } | null>(null);
  const filtrados = useMemo(() => {
    const f = filtro.trim().toLowerCase();
    if (!f) return itens;
    return itens.filter(i => `${i.nome} ${i.conteudo.produto ?? ''} ${i.conteudo.grupo ?? ''} ${(i.conteudo.culturas ?? []).join(' ')}`.toLowerCase().includes(f));
  }, [itens, filtro]);

  // Agrupa por Grupo (rótulo livre). Cabeçalhos na ordem canônica dos blocos
  // (Calcário → Gesso → Fosfatagem → KCL → outros); "Sem grupo" por último.
  // Dentro do grupo, ordena por ordem fina → nome. Cabeçalhos recolhem.
  const grupos = useMemo(() => {
    const m = new Map<string, ItemBiblioteca<ConteudoEquacao>[]>();
    for (const it of filtrados) {
      const g = it.conteudo.grupo?.trim() || SEM_GRUPO;
      (m.get(g) ?? m.set(g, []).get(g)!).push(it);
    }
    for (const lista of m.values()) lista.sort(compararEquacoes);
    const rankGrupo = (g: string) => g === SEM_GRUPO ? Infinity : blocoDaEquacao({ grupo: g } as ConteudoEquacao);
    return [...m.entries()].sort(([a], [b]) => {
      const ra = rankGrupo(a), rb = rankGrupo(b);
      return ra !== rb ? ra - rb : a.localeCompare(b, 'pt-BR');
    });
  }, [filtrados]);
  const [colapsados, setColapsados] = useState<Set<string>>(new Set());
  const toggleGrupo = (g: string) => setColapsados(prev => {
    const n = new Set(prev); if (n.has(g)) n.delete(g); else n.add(g); return n;
  });

  function excluirItem(it: ItemBiblioteca<ConteudoEquacao>) {
    if (!confirm(`Excluir a equação "${it.nome}"?`)) return;
    excluir(SLUG, it.id);
  }
  // Nº de ordem editado DIRETO na lista (blur/Enter): salva e a lista se
  // reordena sozinha (o save dispara 'inv:biblioteca' → refresh → sort).
  function salvarOrdem(it: ItemBiblioteca<ConteudoEquacao>, txt: string) {
    const n = txt.trim() === '' ? undefined : parseFloat(txt.replace(',', '.'));
    const novo = n != null && Number.isFinite(n) ? n : undefined;
    if (novo === it.conteudo.ordem) return;
    atualizar<ConteudoEquacao>(SLUG, it.id, { conteudo: { ...it.conteudo, ordem: novo } });
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
                  {/* Dois botões IRMÃOS (e não o de vincular dentro do de
                      colapsar): <button> aninhado é HTML inválido. */}
                  <div className="w-full flex items-center gap-1.5 px-1 py-1 rounded hover:bg-white/5">
                    <button onClick={() => toggleGrupo(g)} className="flex-1 flex items-center gap-1.5 text-left min-w-0">
                      <ChevronRight size={12} style={{ color: '#93c5fd', transform: aberto ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
                      <span className="text-[10px] font-bold uppercase tracking-wide truncate" style={{ color: g === SEM_GRUPO ? '#64748b' : '#93c5fd' }}>{g}</span>
                      <span className="text-[9px] flex-shrink-0" style={{ color: '#475569' }}>· {lista.length}</span>
                    </button>
                    {podeBib && <BotaoVincularGrupo lista={lista} insumosPorId={insumosPorId} onClick={() => setVincular({ grupo: g, lista })} />}
                  </div>
                  {aberto && (
                    <div className="space-y-1.5 mt-1 pl-1">
                      {lista.map(it => (
                        <div key={it.id} className="p-2 rounded-lg" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
                          <div className="flex items-center gap-2">
                            {podeBib && (
                              <input type="number" defaultValue={it.conteudo.ordem ?? ''} placeholder="nº"
                                title="Nº de ordem dentro do grupo (menor primeiro; vazio = ordena por nome). Salva ao sair do campo."
                                onBlur={e => salvarOrdem(it, e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                className="w-10 rounded px-1 py-0.5 text-[10px] text-center outline-none flex-shrink-0" style={inputStyle} />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-[11px] font-bold truncate" style={{ color: '#e2e8f0' }}>{it.nome}</div>
                              <SubtituloEquacao c={it.conteudo} insumosPorId={insumosPorId} />
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
      {vincular && <DialogoVincularGrupo grupo={vincular.grupo} lista={vincular.lista} insumos={insumos} onClose={() => setVincular(null)} />}
    </section>
  );
}

// ── Vínculo: o gesto do grupo ───────────────────────────────────────────────
//
// Vincular uma a uma seria dez cliques para o grupo CALCÁRIO — e é por isso que
// o preço acabava divergindo entre equações irmãs. O botão vive no cabeçalho do
// grupo, mas o `insumoId` é gravado em CADA equação: assim renomear o grupo não
// derruba o vínculo, um grupo pode ter produtos diferentes (Fosfatados = MAP +
// SSP) e a equação sem grupo também alcança um insumo.

function BotaoVincularGrupo({ lista, insumosPorId, onClick }: {
  lista: ItemBiblioteca<ConteudoEquacao>[]; insumosPorId: MapaInsumos; onClick: () => void;
}) {
  const ids = lista.map(e => e.conteudo.insumoId).filter(Boolean) as string[];
  const distintos = [...new Set(ids)];
  const todas = ids.length === lista.length && distintos.length === 1;
  const ins = distintos.length === 1 ? insumosPorId.get(distintos[0]) : undefined;
  const orfao = distintos.some(id => !insumosPorId.has(id));

  let rotulo = 'Vincular', cor = '#64748b', titulo = 'Vincular todas as equações deste grupo a um insumo';
  if (todas && ins && !orfao) {
    rotulo = ins.nome; cor = '#4ade80';
    titulo = `As ${lista.length} usam o insumo "${ins.nome}" — o preço vem de lá`;
  } else if (ids.length) {
    cor = '#fbbf24';
    rotulo = orfao ? 'órfão' : distintos.length > 1 ? `${distintos.length} insumos` : `${ids.length}/${lista.length}`;
    titulo = orfao ? 'Alguma equação aponta para um insumo que não existe mais'
      : distintos.length > 1 ? 'As equações deste grupo apontam para insumos diferentes'
      : `${ids.length} de ${lista.length} equações vinculadas`;
  }
  return (
    <button onClick={onClick} title={titulo}
      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold flex-shrink-0 hover:bg-white/10 max-w-[45%]"
      style={{ color: cor, border: `1px solid ${cor}33` }}>
      <Link2 size={9} className="flex-shrink-0" /><span className="truncate">{rotulo}</span>
    </button>
  );
}

/** Linha cinza sob o nome: produto · unidade · custo RESOLVIDO · de onde veio. */
function SubtituloEquacao({ c, insumosPorId }: { c: ConteudoEquacao; insumosPorId: MapaInsumos }) {
  const ins = c.insumoId ? insumosPorId.get(c.insumoId) : undefined;
  const orfao = !!c.insumoId && !ins;
  const cst = custosDaEquacao(c, ins?.conteudo);
  const sobrescreve = !!c.insumoId && (c.custoTonelada != null || c.freteHa != null || c.aplicacaoHa != null);
  return (
    <div className="text-[9px] truncate flex items-center gap-1" style={{ color: '#64748b' }}>
      <span className="truncate">
        {c.produto || 'sem produto'}
        {c.unidadeTratamento ? ` · ${c.unidadeTratamento}` : ''}
        {` · ${cst.custoTonelada != null ? `R$ ${moeda(cst.custoTonelada)}/t` : 'sem custo'}`}
      </span>
      {orfao && <span className="flex items-center gap-0.5 flex-shrink-0" style={{ color: '#fbbf24' }} title="A equação aponta para um insumo que não existe mais — revincule"><AlertTriangle size={9} /> vínculo órfão</span>}
      {ins && <span className="flex items-center gap-0.5 flex-shrink-0" style={{ color: sobrescreve ? '#fbbf24' : '#4ade80' }} title={sobrescreve ? `Vinculada a "${ins.nome}", mas com custo próprio preenchido` : `O preço vem do insumo "${ins.nome}"`}><Link2 size={9} />{ins.nome}{sobrescreve && <Pencil size={8} />}</span>}
    </div>
  );
}

function DialogoVincularGrupo({ grupo, lista, insumos, onClose }: {
  grupo: string; lista: ItemBiblioteca<ConteudoEquacao>[];
  insumos: ItemBiblioteca<ConteudoInsumo>[]; onClose: () => void;
}) {
  const porId = useMemo(() => new Map(insumos.map(i => [i.id, i])), [insumos]);
  // Pré-seleção: o insumo já vinculado; senão o que casa com o produto dominante.
  const dominante = useMemo(() => {
    const cont = new Map<string, number>();
    for (const e of lista) { const p = e.conteudo.produto?.trim(); if (p) cont.set(p, (cont.get(p) ?? 0) + 1); }
    return [...cont.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  }, [lista]);
  const jaVinculado = lista.find(e => e.conteudo.insumoId && porId.has(e.conteudo.insumoId))?.conteudo.insumoId;
  const [sel, setSel] = useState(() => jaVinculado ?? acharPorNome(insumos, dominante)?.id ?? '');
  const [criando, setCriando] = useState(false);
  const temVinculo = lista.some(e => e.conteudo.insumoId);

  // O que existe HOJE: produto + custo próprio, agrupados. Duas linhas aqui já
  // dizem por que o vínculo faz falta (mesmo produto, preços diferentes).
  const hoje = useMemo(() => {
    const m = new Map<string, { produto: string; custo: number | null; n: number }>();
    for (const e of lista) {
      const c = e.conteudo;
      const k = `${c.produto ?? ''}|${c.custoTonelada ?? ''}`;
      const at = m.get(k) ?? { produto: c.produto || 'sem produto', custo: c.custoTonelada, n: 0 };
      at.n++; m.set(k, at);
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [lista]);

  const ins = sel ? porId.get(sel) : undefined;
  const previa = ins ? custosDaEquacao({ custoTonelada: null, freteHa: null, aplicacaoHa: null }, ins.conteudo) : null;

  function vincular() {
    if (!ins) return;
    // Vincular ZERA os custos próprios, em vez de deixá-los como sobrescrita
    // silenciosa: é a decisão "o insumo manda" escrita no dado. Sem isso as dez
    // equações continuariam com o preço antigo preenchido, o insumo não valeria
    // nada e o vínculo só PARECERIA ter funcionado.
    atualizarVarios<ConteudoEquacao>(SLUG, lista.map(e => ({
      id: e.id,
      patch: { conteudo: { ...e.conteudo, insumoId: ins.id, produto: ins.nome, custoTonelada: null, freteHa: null, aplicacaoHa: null } },
    })));
    onClose();
  }
  function desvincular() {
    // Materializa os custos que estavam valendo antes de soltar a FK — assim
    // desvincular não muda número nenhum sem o usuário ver.
    atualizarVarios<ConteudoEquacao>(SLUG, lista.map(e => {
      const c = custosDaEquacao(e.conteudo, e.conteudo.insumoId ? porId.get(e.conteudo.insumoId)?.conteudo : undefined);
      return { id: e.id, patch: { conteudo: { ...e.conteudo, insumoId: undefined, custoTonelada: c.custoTonelada, freteHa: c.freteHa, aplicacaoHa: c.aplicacaoHa } } };
    }));
    onClose();
  }

  const nEq = lista.length;
  return (
    <div className="absolute inset-0 z-20 flex flex-col" style={{ background: 'var(--invicta-blue-dark)' }}>
      <div className="flex items-center justify-between px-4 py-2 flex-shrink-0" style={{ borderBottom: '1px solid #1a3a6b' }}>
        <span className="text-[11px] font-bold uppercase truncate" style={{ color: '#e2e8f0' }}>{grupo} · {nEq} {nEq === 1 ? 'equação' : 'equações'}</span>
        <button onClick={onClose} className="p-1 rounded hover:bg-white/10" style={{ color: '#cbd5e1' }}><X size={12} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide mb-1 pb-1" style={{ color: '#93c5fd', borderBottom: '1px solid #1a3a6b' }}>Como está hoje</div>
          {hoje.map((h, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-[10px] py-0.5" style={{ color: '#cbd5e1' }}>
              <span className="truncate">{h.produto}</span>
              <span className="flex-shrink-0" style={{ color: '#64748b' }}>{h.n}× · {h.custo != null ? `R$ ${moeda(h.custo)}/t` : 'sem custo'}</span>
            </div>
          ))}
        </div>

        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide mb-1 pb-1" style={{ color: '#93c5fd', borderBottom: '1px solid #1a3a6b' }}>Insumo (fonte do preço)</div>
          {insumos.length === 0 ? (
            <p className="text-[10px]" style={{ color: '#fbbf24' }}>Nenhum insumo cadastrado ainda. Crie um abaixo, ou cadastre em Biblioteca → Insumos.</p>
          ) : (
            <select value={sel} onChange={e => setSel(e.target.value)} className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle}>
              <option value="">Selecione o insumo…</option>
              {insumos.map(i => <option key={i.id} value={i.id}>{i.nome} ({ROTULO_CATEGORIA[i.conteudo.categoria]})</option>)}
            </select>
          )}
          {previa && (<>
            <p className="text-[10px] mt-1.5" style={{ color: previa.custoTonelada != null ? '#4ade80' : '#fbbf24' }}>
              Vai valer para {nEq === 1 ? 'a equação' : `as ${nEq}`}: {resumoCustos(previa)}
              {previa.custoTonelada == null && ' — cadastre o preço em Biblioteca → Insumos, senão a recomendação sai sem custo.'}
            </p>
            <p className="text-[9px] mt-1" style={{ color: '#64748b' }}>
              {nEq === 1 ? 'A equação perde o custo próprio' : `As ${nEq} perdem os custos próprios`}
              {hoje[0]?.custo != null ? ` (R$ ${moeda(hoje[0].custo)}/t)` : ''}. Os cenários já salvos não mudam.
            </p>
          </>)}

          {!criando && <button onClick={() => setCriando(true)} className="mt-2 w-full py-1 rounded text-[10px] font-semibold" style={{ background: '#1a3a6b', color: '#93c5fd' }}>+ Criar insumo com estes dados</button>}
          {criando && <CriarInsumoInline base={lista[0]?.conteudo} nomeSugerido={dominante} onPronto={id => { setCriando(false); setSel(id); }} onCancelar={() => setCriando(false)} />}
        </div>
      </div>

      <div className="flex gap-2 px-3 py-2 flex-shrink-0" style={{ borderTop: '1px solid #1a3a6b' }}>
        <button onClick={onClose} className="py-1.5 px-3 rounded text-[10px] font-bold" style={{ background: '#1a3a6b', color: '#cbd5e1' }}>Cancelar</button>
        {temVinculo && (
          <button onClick={desvincular} title="Solta o vínculo e grava nas equações os custos que estavam valendo"
            className="py-1.5 px-3 rounded text-[10px] font-bold flex items-center gap-1" style={{ background: '#1a3a6b', color: '#fbbf24' }}>
            <Link2Off size={11} /> Desvincular
          </button>
        )}
        <button onClick={vincular} disabled={!ins}
          className="flex-1 py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1 disabled:opacity-40" style={{ background: 'var(--invicta-green-dark)' }}>
          <Link2 size={11} /> Vincular {nEq === 1 ? 'a equação' : `as ${nEq}`}
        </button>
      </div>
    </div>
  );
}

/** Cria um insumo já com o produto e os custos da equação. A categoria é escolha
 *  do usuário: chutar pelo nome erraria o filtro por tipo das Prescrições. */
function CriarInsumoInline({ base, nomeSugerido, onPronto, onCancelar }: {
  base?: ConteudoEquacao; nomeSugerido: string; onPronto: (id: string) => void; onCancelar: () => void;
}) {
  const [nome, setNome] = useState(nomeSugerido);
  const [cat, setCat] = useState<CategoriaInsumo | ''>('');
  const herdado = custosDaEquacao(base ?? {}, undefined);

  function criarInsumo() {
    if (!nome.trim() || !cat) return;
    const un = unidadePreco(cat);
    // O custo da equação é sempre R$/t; semente se cadastra por QUILO. Sem esta
    // divisão o preço entraria 1000× maior — o mesmo erro que a v2.41 corrigiu
    // nas Prescrições.
    const preco = herdado.custoTonelada != null
      ? (un === 'kg' ? herdado.custoTonelada / 1000 : herdado.custoTonelada)
      : undefined;
    const novo = criar<ConteudoInsumo>('insumos', {
      nome: nome.trim(), escopo: 'empresa',
      conteudo: {
        categoria: cat, garantias: {}, organico: {}, semente: {},
        precoMedio: preco, precoUnidade: un,
        freteHa: herdado.freteHa || undefined, aplicacaoHa: herdado.aplicacaoHa || undefined,
      },
    });
    onPronto(novo.id);
  }

  return (
    <div className="mt-2 p-2 rounded space-y-1.5" style={{ background: '#0b1f3a', border: '1px solid #1a3a6b' }}>
      <input value={nome} onChange={e => setNome(e.target.value)} placeholder="nome do insumo" className={txt} style={inputStyle} />
      <select value={cat} onChange={e => setCat(e.target.value as CategoriaInsumo)} className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle}>
        <option value="">Escolha a categoria…</option>
        {(Object.keys(ROTULO_CATEGORIA) as CategoriaInsumo[]).map(c => <option key={c} value={c}>{ROTULO_CATEGORIA[c]}</option>)}
      </select>
      <p className="text-[9px]" style={{ color: '#64748b' }}>Vem da equação: {resumoCustos(herdado)}</p>
      <div className="flex gap-1.5">
        <button onClick={onCancelar} className="py-1 px-2 rounded text-[10px] font-semibold" style={{ background: '#1a3a6b', color: '#cbd5e1' }}>Cancelar</button>
        <button onClick={criarInsumo} disabled={!nome.trim() || !cat}
          className="flex-1 py-1 rounded text-[10px] font-bold text-white disabled:opacity-40" style={{ background: 'var(--invicta-green-dark)' }}>Criar insumo</button>
      </div>
    </div>
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
  const [insumoId, setInsumoId] = useState(c?.insumoId ?? '');
  // Campo VAZIO herda do insumo; PREENCHIDO sobrescreve. Por isso o `!= null` no
  // frete/aplicação: `0` é zero de propósito e tem que aparecer escrito.
  const [custo, setCusto] = useState(c?.custoTonelada != null ? String(c.custoTonelada) : '');
  const [frete, setFrete] = useState(c?.freteHa != null ? String(c.freteHa) : '');
  const [aplicacao, setAplicacao] = useState(c?.aplicacaoHa != null ? String(c.aplicacaoHa) : '');
  const [profundidade, setProfundidade] = useState(c?.profundidade ?? '0-20');
  const [unEq, setUnEq] = useState(c?.unidadeEquacao ?? '');
  const [unTrat, setUnTrat] = useState(c?.unidadeTratamento ?? 'kg/ha');
  const [tratamento, setTratamento] = useState<'taxa-variada' | 'taxa-fixa'>(c?.tratamento ?? 'taxa-variada');
  const [grupo, setGrupo] = useState(c?.grupo ?? '');
  const [ordem, setOrdem] = useState(c?.ordem != null ? String(c.ordem) : '');
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
      insumoId: insumoId || undefined,
      // Vazio vira `null` (herda do insumo, ou "sem custo" se não houver
      // vínculo). Antes virava 0, e aí "sem frete" e "não preenchi" eram o
      // mesmo dado — impossível saber qual dos dois o usuário quis dizer.
      custoTonelada: custo.trim() ? parseNum(custo) : null,
      freteHa: frete.trim() ? (parseNum(frete) ?? 0) : null,
      aplicacaoHa: aplicacao.trim() ? (parseNum(aplicacao) ?? 0) : null,
      profundidade: profundidade || '0-20',
      unidadeEquacao: unEq.trim(),
      unidadeTratamento: unTrat.trim(),
      tratamento,
      grupo: grupo.trim() || undefined,
      ordem: parseNum(ordem) ?? undefined,
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
  // Salvar como = clona (cria NOVA) a partir das edições atuais, sem mexer na
  // original. PERGUNTA o nome da nova equação (default = sugestão), para o
  // usuário nomear a cópia em vez de herdar o nome atual / "(cópia)".
  function salvarComo() {
    if (!validarTudo()) return;
    const base = nome.trim();
    const sugerido = item && base === item.nome ? `${base} (cópia)` : (base || 'Nova equação');
    const nomeNovo = window.prompt('Nome da nova equação (Salvar como):', sugerido)?.trim();
    if (!nomeNovo) return;   // cancelou ou deixou vazio → não cria
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
          <Detalhes {...{ nome, setNome, produto, setProduto, insumoId, setInsumoId, custo, setCusto, frete, setFrete, aplicacao, setAplicacao, profundidade, setProfundidade, unEq, setUnEq, unTrat, setUnTrat, tratamento, setTratamento, grupo, setGrupo, ordem, setOrdem, gruposExistentes, culturas, setCulturas, fases, setFases, descricao, setDescricao }} />
        </Secao>
        <Secao titulo="Equação">
          <Equacao {...{ constantes, setConstantes, script, setScript, scriptRef, naoNeg, setNaoNeg, doseMinima, setDoseMinima, abaixoMinimo, setAbaixoMinimo, doseMaxima, setDoseMaxima, unTrat, val, inserirToken }} />
        </Secao>
        <Secao titulo="Estilo do mapa">
          <Estilo estilo={estilo} setEstilo={setEstilo} unidade={unTrat}
            doseMin={parseNum(doseMinima) || 0} doseMax={parseNum(doseMaxima) || 0} />
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

/**
 * Campo de custo que HERDA do insumo: vazio mostra o valor herdado no
 * placeholder (sem gravar), preenchido acusa a sobrescrita e oferece a volta.
 *
 * Não pré-preencher é a decisão que faz o vínculo valer alguma coisa: um campo
 * preenchido vira sobrescrita no save, e aí mudar o preço no insumo não
 * chegaria nesta equação. Não desabilitar também é decisão: existe o caso real
 * do calcário de outra jazida naquele talhão, e desabilitar obrigaria a
 * desvincular e revincular só para digitar um número.
 *
 * Fora do componente pai de propósito: declarada dentro dele, ela seria um tipo
 * novo a cada render e o input perderia o foco a cada tecla.
 */
function CampoCusto({ label, valor, setValor, dica, herda, vinculado }: {
  label: string; valor: string; setValor: (s: string) => void;
  dica: string; herda: number | null; vinculado: boolean;
}) {
  return (
    <Campo label={label}>
      <input value={valor} onChange={e => setValor(e.target.value)} inputMode="decimal" className={txt} style={inputStyle}
        placeholder={vinculado && herda != null ? `herdado: ${moeda(herda)}` : dica} />
      {vinculado && !valor.trim() && (
        <span className="text-[8px] flex items-center gap-0.5 mt-0.5" style={{ color: '#64748b' }}><Link2 size={8} /> do insumo</span>
      )}
      {vinculado && !!valor.trim() && (
        <button onClick={() => setValor('')} title="Voltar a usar o valor do insumo"
          className="text-[8px] flex items-center gap-0.5 mt-0.5 hover:underline" style={{ color: '#fbbf24' }}>
          <Pencil size={8} /> sobrescreve o insumo · usar o do insumo
        </button>
      )}
    </Campo>
  );
}

const PROFUNDIDADES = ['0-20', '20-40', '0-40', '0-10', '10-20', '40-60'];

function Detalhes(p: {
  nome: string; setNome: (s: string) => void; produto: string; setProduto: (s: string) => void;
  insumoId: string; setInsumoId: (s: string) => void;
  custo: string; setCusto: (s: string) => void; frete: string; setFrete: (s: string) => void;
  aplicacao: string; setAplicacao: (s: string) => void; profundidade: string; setProfundidade: (s: string) => void;
  unEq: string; setUnEq: (s: string) => void;
  unTrat: string; setUnTrat: (s: string) => void; tratamento: 'taxa-variada' | 'taxa-fixa'; setTratamento: (s: 'taxa-variada' | 'taxa-fixa') => void;
  grupo: string; setGrupo: (s: string) => void; ordem: string; setOrdem: (s: string) => void; gruposExistentes: string[];
  culturas: string; setCulturas: (s: string) => void; fases: string; setFases: (s: string) => void;
  descricao: string; setDescricao: (s: string) => void;
}) {
  // Fonte única do preço: o insumo. Escolher aqui LIMPA os custos próprios (o
  // insumo manda); quem quiser fugir do padrão redigita o campo, e aí a
  // sobrescrita é deliberada e fica visível.
  const insumos = useMemo(() => lerInsumos(), []);
  const ins = p.insumoId ? insumos.find(i => i.id === p.insumoId) : undefined;
  const orfao = !!p.insumoId && !ins;
  const herdado = useMemo(() => custosDaEquacao({ custoTonelada: null, freteHa: null, aplicacaoHa: null }, ins?.conteudo), [ins]);
  const sugestao = !p.insumoId ? acharPorNome(insumos, p.produto) : undefined;

  function escolherInsumo(id: string) {
    if (id === '__legado') return;
    p.setInsumoId(id);
    if (!id) return;
    const i = insumos.find(x => x.id === id);
    if (!i) return;
    p.setProduto(i.nome);
    p.setCusto(''); p.setFrete(''); p.setAplicacao('');
  }

  return (
    <div className="space-y-2">
      <Campo label="Nome"><input value={p.nome} onChange={e => p.setNome(e.target.value)} placeholder="ex: 001 - Calagem 60% Ca" className={txt} style={inputStyle} /></Campo>

      {/* Vínculo com a Biblioteca de Insumos — a fonte única do preço (v2.42) */}
      <div className="p-2 rounded" style={{ background: '#0b1f3a', border: '1px solid #1a3a6b' }}>
        <div className="flex items-center gap-1 mb-1"><Link2 size={11} style={{ color: '#93c5fd' }} /><span className="text-[10px] font-bold" style={{ color: '#93c5fd' }}>Insumo (fonte do preço)</span></div>
        {insumos.length === 0 ? (
          <p className="text-[9px]" style={{ color: '#fbbf24' }}>Nenhum insumo cadastrado — cadastre em Biblioteca → Insumos para o preço vir de um lugar só.</p>
        ) : (
          <select value={p.insumoId || (p.produto ? '__legado' : '')} onChange={e => escolherInsumo(e.target.value)}
            className="w-full rounded px-1.5 py-1 text-[10px] outline-none" style={inputStyle}>
            <option value="">Selecione o insumo…</option>
            {p.produto && !p.insumoId && <option value="__legado">{p.produto} (cadastro antigo)</option>}
            {insumos.map(i => <option key={i.id} value={i.id}>{i.nome} ({ROTULO_CATEGORIA[i.conteudo.categoria]})</option>)}
          </select>
        )}
        {ins && <p className="text-[9px] mt-1" style={{ color: herdado.custoTonelada != null ? '#64748b' : '#fbbf24' }}>
          {herdado.custoTonelada != null ? resumoCustos(herdado) : 'sem preço cadastrado — a recomendação vai sair sem custo'}
        </p>}
        {orfao && <p className="text-[9px] mt-1 flex items-center gap-1" style={{ color: '#fbbf24' }}><AlertTriangle size={9} /> o insumo vinculado não existe mais — escolha outro</p>}
        {sugestao && <button onClick={() => escolherInsumo(sugestao.id)} className="text-[9px] mt-1 hover:underline" style={{ color: '#93c5fd' }}>
          Existe um insumo chamado “{sugestao.nome}” — vincular a ele
        </button>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Campo label="Produto">
          <input value={p.produto} onChange={e => p.setProduto(e.target.value)} placeholder="ex: Calcário" readOnly={!!ins}
            title={ins ? 'O nome vem do insumo vinculado' : undefined}
            className={txt} style={{ ...inputStyle, ...(ins ? { opacity: 0.7, cursor: 'default' } : null) }} />
          {ins && <span className="text-[8px] mt-0.5 block" style={{ color: '#64748b' }}>vem do insumo</span>}
        </Campo>
        <CampoCusto label="Custo / tonelada (R$)" valor={p.custo} setValor={p.setCusto} dica="ex: 180" herda={herdado.custoTonelada} vinculado={!!ins} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <CampoCusto label="Frete (R$/ha)" valor={p.frete} setValor={p.setFrete} dica="ex: 18" herda={herdado.freteHa} vinculado={!!ins} />
        <CampoCusto label="Aplicação (R$/ha)" valor={p.aplicacao} setValor={p.setAplicacao} dica="ex: 22" herda={herdado.aplicacaoHa} vinculado={!!ins} />
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
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Campo label="Grupo (organiza a lista)">
          <input value={p.grupo} onChange={e => p.setGrupo(e.target.value)} placeholder="ex: Calcário, Gesso, KCl" list="grupos-equacoes" className={txt} style={inputStyle} />
          <datalist id="grupos-equacoes">{p.gruposExistentes.map(g => <option key={g} value={g} />)}</datalist>
        </Campo>
        <Campo label="Ordem no grupo">
          <input value={p.ordem} onChange={e => p.setOrdem(e.target.value)} placeholder="ex: 1" inputMode="numeric" className={txt} style={{ ...inputStyle, width: 72 }} title="Ordem fina dentro do grupo (menor primeiro). Vazio = por nome. O grupo já define o bloco: Calcário → Gesso → Fosfatagem → KCL." />
        </Campo>
      </div>
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

function Estilo({ estilo, setEstilo, unidade, doseMin, doseMax }: {
  estilo: EstiloRecomendacao;
  setEstilo: (e: EstiloRecomendacao | ((prev: EstiloRecomendacao) => EstiloRecomendacao)) => void;
  unidade: string; doseMin: number; doseMax: number;
}) {
  const auto = estilo.dividirAuto;
  const intervaloValido = doseMax > doseMin;   // precisa de mínima E máxima na equação
  const nClasses = estilo.classes.length;

  // Divisão automática: com a chave ligada e intervalo válido, os limites das
  // classes passam a dividir [doseMin, doseMax] em partes iguais — o usuário
  // controla só a QUANTIDADE de classes e as cores. Piso = dose mínima (abaixo
  // dela a máquina não aplica → 0). Usa updater funcional p/ não sobrescrever
  // uma troca de cor feita entre renders e p/ não entrar em laço.
  useEffect(() => {
    if (!auto || !intervaloValido) return;
    setEstilo(prev => {
      if (!prev.dividirAuto || prev.classes.length < 1) return prev;
      const lims = limitesDivididos(doseMin, doseMax, prev.classes.length);
      if (prev.classes.every((c, i) => c.limiteSuperior === lims[i])) return prev;
      return { ...prev, classes: prev.classes.map((c, i) => ({ ...c, limiteSuperior: lims[i] })) };
    });
  }, [auto, doseMin, doseMax, nClasses, intervaloValido, setEstilo]);

  // Âncoras da rampa escolhida no estilo (com inversão) — usadas em toda redistribuição.
  const rampaCores = coresDaRampa(estilo.rampa, estilo.rampaInvertida);

  function setClasse(i: number, patch: Partial<{ cor: string; limiteSuperior: number }>) {
    setEstilo({ ...estilo, classes: estilo.classes.map((c, idx) => idx === i ? { ...c, ...patch } : c) });
  }
  function addClasse() {
    const ult = estilo.classes[estilo.classes.length - 1];
    const novas = [...estilo.classes, { cor: '#e23b2e', limiteSuperior: (ult?.limiteSuperior ?? 0) + 1000 }];
    setEstilo({ ...estilo, classes: distribuirCores(novas, rampaCores) });   // re-espalha na rampa atual
  }
  function rmClasse(i: number) {
    setEstilo({ ...estilo, classes: distribuirCores(estilo.classes.filter((_, idx) => idx !== i), rampaCores) });
  }
  function trocarRampa(id: string, invertida: boolean) {
    const cores = coresDaRampa(id, invertida);
    setEstilo({ ...estilo, rampa: id, rampaInvertida: invertida, classes: distribuirCores(estilo.classes, cores) });
  }

  // ── Presets de divisão de classes (sistema + do usuário) ──────────────────
  const [presetsUsuario, setPresetsUsuario] = useState<PresetEstiloRec[]>(() => getPresetsEstilo());
  const [presetSel, setPresetSel] = useState<PresetEstiloRec | null>(null); // último importado (p/ excluir se for meu)
  function importarPreset(id: string) {
    const p = [...PRESETS_SISTEMA, ...presetsUsuario].find(x => x.id === id);
    if (!p) { setPresetSel(null); return; }
    // clona o estilo do preset (não compartilha referência das classes)
    setEstilo({ ...p.estilo, classes: p.estilo.classes.map(c => ({ ...c })) });
    setPresetSel(p);
  }
  function salvarPreset() {
    const nome = window.prompt('Nome do preset (ex.: Calcário faixa fina):')?.trim();
    if (!nome) return;
    const novo = savePresetEstilo(nome, estilo);
    setPresetsUsuario(getPresetsEstilo());
    setPresetSel(novo);
  }
  function excluirPreset() {
    if (!presetSel || presetSel.escopo === 'sistema') return;
    if (!window.confirm(`Excluir o preset "${presetSel.nome}"?`)) return;
    deletePresetEstilo(presetSel.id);
    setPresetsUsuario(getPresetsEstilo());
    setPresetSel(null);
  }

  return (
    <div className="space-y-3">
      <p className="text-[9px]" style={{ color: '#64748b' }}>
        Escala fixa de cores por classe de dose{unidade ? ` (${unidade})` : ''}. Menor dose = verde, maior = vermelho. Cada classe vai do limite anterior até o seu <strong>limite superior</strong>.
      </p>

      {/* Presets de divisão de classes — importar pronto ou salvar o atual */}
      <div className="flex items-center gap-1.5">
        <select value={presetSel?.id ?? ''} onChange={e => importarPreset(e.target.value)}
          className="flex-1 rounded px-2 py-1 text-[10px] outline-none" style={inputStyle}>
          <option value="">Importar preset de classes…</option>
          <optgroup label="Prontos (sistema)">
            {PRESETS_SISTEMA.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </optgroup>
          {presetsUsuario.length > 0 && (
            <optgroup label="Meus presets">
              {presetsUsuario.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </optgroup>
          )}
        </select>
        {presetSel && presetSel.escopo !== 'sistema' && (
          <button onClick={excluirPreset} title="Excluir este preset" className="p-1 rounded hover:bg-white/10" style={{ color: '#f87171' }}><Trash2 size={11} /></button>
        )}
        <button onClick={salvarPreset} title="Salvar a divisão atual como um preset reutilizável"
          className="text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1 whitespace-nowrap" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
          <Save size={10} /> Salvar preset
        </button>
      </div>

      {/* Rampa de cores (estilo QGIS): escolha + inverter — redistribui as classes na hora */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] font-semibold" style={{ color: '#cbd5e1' }}>Rampa de cores</label>
          <label className="flex items-center gap-1.5 text-[10px]" style={{ color: '#cbd5e1' }}>
            <input type="checkbox" checked={!!estilo.rampaInvertida}
              onChange={e => trocarRampa(estilo.rampa ?? 'padrao', e.target.checked)} /> Inverter
          </label>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {Object.entries(RAMPAS).map(([id, r]) => {
            const ativa = (estilo.rampa ?? 'padrao') === id;
            return (
              <button key={id} onClick={() => trocarRampa(id, !!estilo.rampaInvertida)} title={r.nome}
                className="rounded overflow-hidden text-left"
                style={{ border: ativa ? '2px solid #22d3ee' : '1px solid #2e5fa3', opacity: ativa ? 1 : 0.85 }}>
                <div className="h-2.5" style={{ background: gradienteCssRampa(estilo.rampaInvertida ? [...r.cores].reverse() : r.cores) }} />
                <div className="px-1.5 py-0.5 text-[9px] font-semibold truncate" style={{ color: ativa ? '#7dd3fc' : '#94a3b8', background: '#0b1f3a' }}>{r.nome}</div>
              </button>
            );
          })}
        </div>
      </div>

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

      {auto && (
        <p className="text-[9px] -mt-1" style={{ color: intervaloValido ? '#7dd3fc' : '#fca5a5' }}>
          {intervaloValido
            ? `Classes dividindo ${doseMin}–${doseMax}${unidade ? ` ${unidade}` : ''} da equação em ${nClasses} faixa(s) iguais. Ajuste só o nº de classes e as cores.`
            : 'Defina a Dose mínima viável e a Dose máxima na equação acima para dividir automaticamente.'}
        </p>
      )}

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] font-semibold" style={{ color: '#cbd5e1' }}>Classes</label>
          <div className="flex items-center gap-1">
            <button onClick={() => setEstilo({ ...estilo, classes: distribuirCores(estilo.classes, rampaCores) })} title="Reaplica a rampa escolhida em todas as classes" className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#1a3a6b', color: '#93c5fd' }}>Distribuir cores</button>
            <button onClick={addClasse} className="text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1" style={{ background: '#1a3a6b', color: '#93c5fd' }}><Plus size={10} /> Classe</button>
          </div>
        </div>
        <div className="space-y-1">
          {estilo.classes.map((c, i) => (
            <div key={i} className="flex gap-1.5 items-center">
              <input type="color" value={c.cor} onChange={e => setClasse(i, { cor: e.target.value })} className="w-7 h-6 rounded cursor-pointer" style={{ background: 'transparent', border: '1px solid #2e5fa3' }} />
              <span className="text-[9px]" style={{ color: '#64748b' }}>até</span>
              <input value={String(c.limiteSuperior)} onChange={e => setClasse(i, { limiteSuperior: parseNum(e.target.value) || 0 })}
                readOnly={auto} title={auto ? 'Calculado pela divisão automática' : undefined}
                inputMode="decimal" className="flex-1 rounded px-2 py-1 text-[10px] font-mono outline-none"
                style={{ ...inputStyle, ...(auto ? { opacity: 0.6, cursor: 'not-allowed' } : {}) }} />
              <button onClick={() => rmClasse(i)} className="p-1 rounded hover:bg-white/10" style={{ color: '#f87171' }}><Trash2 size={10} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
