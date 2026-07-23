'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CATEGORIAS, listar, importar, exportar, criar, atualizar, excluir, ativar,
  type CategoriaBiblioteca, type EscopoBiblioteca, type DefCategoria,
  type ItemBiblioteca, type ConteudoLaboratorio, type ConteudoPerfil,
} from '@/lib/biblioteca';
import { Search, Plus, Download, Upload, ChevronRight, Edit3, Trash2, Save, X, Power, Shield } from 'lucide-react';
import { LegendasPanel } from './LegendasPanel';
import { EquacoesPanel } from './EquacoesPanel';
import { RecomendacoesPanel } from './RecomendacoesPanel';
import { SafrasPanel } from './SafrasPanel';
import { UsuariosPanel } from './UsuariosPanel';
import { ehAdmin } from '@/lib/empresa';

// Slug interno: as categorias da Biblioteca + a aba especial "Usuários".
type SlugBiblioteca = CategoriaBiblioteca | 'usuarios';
import { EtiquetaLayoutPicker } from '../talhao/EtiquetaLayoutPicker';
import { PERFIS_BUILTIN, norm as normSinonimo } from '@/lib/lab';
import {
  getPadroesAmostragem, savePadraoAmostragem, updatePadraoAmostragem, deletePadraoAmostragem,
  getPadroesElementos, savePadraoElementos, updatePadraoElementos, deletePadraoElementos,
  getConfigEtiqueta, saveConfigEtiqueta, getLegendasPorAtributo,
  getVariaveisAnalise, getVariaveisAtivas, garantirVariaveisComplementares,
  saveVariavelAnalise, novaVariavelAnalise, deleteVariavelAnalise, siglaVariavel,
  type PadraoElementos, type PadraoAmostragem, type ProfundidadeConfig, type ConfigEtiqueta, type VariavelAnalise,
} from '@/lib/store';

import { inputStyle } from '@/constants/ui';

export function BibliotecaPanel() {
  const [slug, setSlug] = useState<SlugBiblioteca>('legendas');
  return (
    <div className="flex h-full">
      <CategoriasNav slug={slug} setSlug={setSlug} />
      <CategoriaConteudo slug={slug} />
    </div>
  );
}

// ─── Sidebar interna com as categorias (+ Usuários para admin) ───────────

function CategoriasNav({ slug, setSlug }: { slug: SlugBiblioteca; setSlug: (s: SlugBiblioteca) => void }) {
  const item = (chave: SlugBiblioteca, nome: string, Icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>, emBreve = false) => {
    const ativo = chave === slug;
    return (
      <button key={chave} onClick={() => setSlug(chave)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-semibold text-left transition-colors"
        style={{
          background: ativo ? 'var(--invicta-blue)' : 'transparent',
          color: ativo ? '#fff' : '#cbd5e1',
          borderLeft: ativo ? '2px solid var(--invicta-green)' : '2px solid transparent',
        }}>
        <Icon size={11} style={{ flexShrink: 0 }} />
        <span className="truncate flex-1">{nome}</span>
        {emBreve && <span className="text-[8px] font-bold px-1 rounded" style={{ background: '#1a3a6b', color: '#64748b' }}>em breve</span>}
      </button>
    );
  };
  return (
    <nav className="flex-shrink-0 overflow-y-auto py-2"
      style={{ width: 140, background: '#061525', borderRight: '1px solid #1a3a6b' }}>
      {CATEGORIAS.map(c => item(c.slug, c.nome, c.icone, c.status === 'em-breve'))}
      {ehAdmin() && (
        <>
          <div className="my-1 mx-2" style={{ height: 1, background: '#1a3a6b' }} />
          {item('usuarios', 'Usuários', Shield)}
        </>
      )}
    </nav>
  );
}

// ─── Conteúdo da categoria selecionada ───────────────────────────────────

function CategoriaConteudo({ slug }: { slug: SlugBiblioteca }) {
  if (slug === 'usuarios') return <section className="flex-1 overflow-y-auto"><UsuariosPanel /></section>;
  // Categorias com adaptador próprio têm UI customizada (já implementadas).
  if (slug === 'legendas') return <ConteudoLegendas />;
  if (slug === 'equacoes') return <EquacoesPanel />;
  if (slug === 'recomendacoes') return <RecomendacoesPanel />;
  if (slug === 'laboratorios') return <ConteudoLaboratorios />;
  if (slug === 'perfis') return <ConteudoPerfis />;
  if (slug === 'safras') return <ConteudoSafras />;
  if (slug === 'grades') return <ConteudoGrades />;
  if (slug === 'preferencias-analise') return <ConteudoPreferencias />;
  return <ConteudoGenerico slug={slug} />;
}

function ConteudoLegendas() {
  const def = CATEGORIAS.find(c => c.slug === 'legendas')!;
  const Icon = def.icone;
  return (
    <section className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #1a3a6b' }}>
        <div className="flex items-center gap-2 mb-1">
          <Icon size={14} style={{ color: '#93c5fd' }} />
          <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: '#e2e8f0' }}>{def.nome}</h3>
        </div>
        <p className="text-[10px]" style={{ color: '#64748b' }}>{def.descricao}</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        <LegendasPanel />
      </div>
    </section>
  );
}

function ConteudoGenerico({ slug }: { slug: CategoriaBiblioteca }) {
  const def: DefCategoria = useMemo(() => CATEGORIAS.find(c => c.slug === slug)!, [slug]);
  const [aba, setAba] = useState<EscopoBiblioteca>('meu');
  const [filtro, setFiltro] = useState('');
  const [refresh, setRefresh] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // recarrega quando outro componente muda a Biblioteca
  useEffect(() => {
    const onCh = (e: Event) => {
      const d = (e as CustomEvent).detail as { slug?: CategoriaBiblioteca } | undefined;
      if (!d?.slug || d.slug === slug) setRefresh(x => x + 1);
    };
    if (typeof window !== 'undefined') window.addEventListener('inv:biblioteca', onCh);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('inv:biblioteca', onCh); };
  }, [slug]);

  const itens = useMemo(
    () => listar(slug, aba),
    [slug, aba, refresh], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const itensFiltrados = useMemo(() => {
    const f = filtro.trim().toLowerCase();
    if (!f) return itens;
    return itens.filter(i => {
      const alvo = `${i.nome} ${i.descricao ?? ''} ${(i.tags ?? []).join(' ')}`.toLowerCase();
      return alvo.includes(f);
    });
  }, [itens, filtro]);

  async function importarArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const json = await f.text();
      const n = importar(slug, json);
      alert(`${n} item(ns) importado(s).`);
      setRefresh(x => x + 1);
    } catch (err) {
      alert('Falha ao importar: ' + (err instanceof Error ? err.message : String(err)));
    }
  }
  function exportarTudo() {
    const json = exportar(slug);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `biblioteca-${slug}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const Icon = def.icone;
  const emBreve = def.status === 'em-breve';

  return (
    <section className="flex-1 flex flex-col overflow-hidden">
      {/* Header da categoria */}
      <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #1a3a6b' }}>
        <div className="flex items-center gap-2 mb-1">
          <Icon size={14} style={{ color: '#93c5fd' }} />
          <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: '#e2e8f0' }}>{def.nome}</h3>
          {emBreve && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#1a3a6b', color: '#fbbf24' }}>em breve</span>}
        </div>
        <p className="text-[10px]" style={{ color: '#64748b' }}>{def.descricao}</p>
      </div>

      {/* Abas Meu / Empresa / Sistema */}
      <div className="flex gap-1 px-3 pt-2 flex-shrink-0">
        {([
          { id: 'meu', label: 'Meus padrões' },
          { id: 'empresa', label: 'Empresa' },
          { id: 'sistema', label: 'Sistema' },
        ] as { id: EscopoBiblioteca; label: string }[]).map(t => (
          <button key={t.id} onClick={() => setAba(t.id)}
            className="flex-1 py-1 rounded text-[10px] font-bold"
            style={{ background: aba === t.id ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: aba === t.id ? '#fff' : '#64748b' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Ações */}
      <div className="px-3 pt-2 flex-shrink-0 flex gap-1">
        <button disabled={emBreve}
          className="flex-1 py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1"
          style={{ background: emBreve ? '#1a3a6b' : 'var(--invicta-green-dark)', opacity: emBreve ? 0.5 : 1 }}>
          <Plus size={11} /> Novo
        </button>
        <button onClick={() => inputRef.current?.click()} disabled={emBreve}
          className="px-2 py-1.5 rounded text-[10px] font-semibold flex items-center gap-1"
          style={{ background: '#1a3a6b', color: '#93c5fd', opacity: emBreve ? 0.5 : 1 }}>
          <Upload size={11} /> Importar
        </button>
        <button onClick={exportarTudo} disabled={emBreve || itensFiltrados.length === 0}
          className="px-2 py-1.5 rounded text-[10px] font-semibold flex items-center gap-1"
          style={{ background: '#1a3a6b', color: '#93c5fd', opacity: (emBreve || itensFiltrados.length === 0) ? 0.5 : 1 }}>
          <Download size={11} /> Exportar
        </button>
        <input ref={inputRef} type="file" accept=".json" className="hidden" onChange={importarArquivo} />
      </div>

      {/* Filtro */}
      <div className="px-3 py-2 flex-shrink-0">
        <div className="relative">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: '#64748b' }} />
          <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Filtrar..."
            className="w-full rounded pl-7 pr-2 py-1.5 text-[11px] outline-none" style={inputStyle} />
        </div>
      </div>

      {/* Lista (vazia por enquanto) */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {emBreve ? (
          <div className="text-center py-12 px-4">
            <Icon size={32} className="mx-auto mb-2" style={{ color: '#1a3a6b' }} />
            <p className="text-[11px] font-bold mb-1" style={{ color: '#94a3b8' }}>Categoria em construção</p>
            <p className="text-[10px]" style={{ color: '#64748b' }}>{def.descricao}</p>
            <p className="text-[9px] mt-3" style={{ color: '#475569' }}>
              Esta categoria vai ganhar conteúdo conforme as fases da reorganização. Veja
              <span style={{ color: '#93c5fd' }}> docs/MAPA_E_REORGANIZACAO.md</span>.
            </p>
          </div>
        ) : itensFiltrados.length === 0 ? (
          <div className="text-center py-8 px-4">
            <p className="text-[10px]" style={{ color: '#64748b' }}>
              Nenhum item em <strong>{abaLabel(aba)}</strong>. Use <em>+ Novo</em> ou <em>Importar</em>.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {itensFiltrados.map(it => (
              <button key={it.id} className="w-full p-2 rounded-lg text-left flex items-center gap-2"
                style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-bold truncate" style={{ color: '#e2e8f0' }}>{it.nome}</div>
                  {it.descricao && <div className="text-[9px] truncate" style={{ color: '#64748b' }}>{it.descricao}</div>}
                </div>
                {!it.ativo && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#1a3a6b', color: '#94a3b8' }}>inativo</span>}
                <ChevronRight size={11} style={{ color: '#475569' }} />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function abaLabel(e: EscopoBiblioteca) {
  return e === 'meu' ? 'Meus padrões' : e === 'empresa' ? 'Empresa' : 'Sistema';
}

// ─── Laboratórios ─────────────────────────────────────────────────────────
// Lista perfis de mapeamento (PerfilLabConfig) com ações reais. Aba Sistema
// expõe PERFIS_BUILTIN readonly. Cadastro principal ainda nasce do "Salvar
// perfil" dentro do LabImportSection — esta UI é gestão posterior.

interface LabEditState {
  id: string | null;
  nome: string;
  configJson: string;
}

function ConteudoLaboratorios() {
  const def = CATEGORIAS.find(c => c.slug === 'laboratorios')!;
  const Icon = def.icone;
  const [aba, setAba] = useState<EscopoBiblioteca>('meu');
  const [refresh, setRefresh] = useState(0);
  const [edit, setEdit] = useState<LabEditState | null>(null);

  useEffect(() => {
    const onCh = (e: Event) => {
      const d = (e as CustomEvent).detail as { slug?: CategoriaBiblioteca } | undefined;
      if (!d?.slug || d.slug === 'laboratorios') setRefresh(x => x + 1);
    };
    if (typeof window !== 'undefined') window.addEventListener('inv:biblioteca', onCh);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('inv:biblioteca', onCh); };
  }, []);

  const itens = useMemo(
    () => aba === 'sistema' ? [] : listar<ConteudoLaboratorio>('laboratorios', aba),
    [aba, refresh], // eslint-disable-line react-hooks/exhaustive-deps
  );

  function novo() {
    setEdit({ id: null, nome: '', configJson: '{\n  "linhaCabecalho": 0,\n  "colId": 0,\n  "elementos": {}\n}' });
  }
  function editar(it: ItemBiblioteca<ConteudoLaboratorio>) {
    setEdit({ id: it.id, nome: it.nome, configJson: JSON.stringify(it.conteudo.config, null, 2) });
  }
  function excluirItem(it: ItemBiblioteca<ConteudoLaboratorio>) {
    if (!confirm(`Excluir o perfil "${it.nome}"?`)) return;
    excluir('laboratorios', it.id);
  }
  function alternarAtivo(it: ItemBiblioteca<ConteudoLaboratorio>) {
    ativar('laboratorios', it.id, !it.ativo);
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
        {([
          { id: 'meu', label: 'Meus padrões' },
          { id: 'empresa', label: 'Empresa' },
          { id: 'sistema', label: 'Sistema' },
        ] as { id: EscopoBiblioteca; label: string }[]).map(t => (
          <button key={t.id} onClick={() => setAba(t.id)}
            className="flex-1 py-1 rounded text-[10px] font-bold"
            style={{ background: aba === t.id ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: aba === t.id ? '#fff' : '#64748b' }}>
            {t.label}
          </button>
        ))}
      </div>

      {aba !== 'sistema' && (
        <div className="px-3 pt-2 flex-shrink-0">
          <button onClick={novo}
            className="w-full py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1"
            style={{ background: 'var(--invicta-green-dark)' }}>
            <Plus size={11} /> Novo perfil
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {aba === 'sistema' ? (
          <PerfisSistema />
        ) : itens.length === 0 ? (
          <div className="text-center py-8 px-4">
            <p className="text-[10px]" style={{ color: '#64748b' }}>
              Nenhum perfil em <strong>{abaLabel(aba)}</strong>.
              Use <em>+ Novo perfil</em> ou salve um a partir do laboratório dentro do talhão.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {itens.map(it => (
              <div key={it.id} className="p-2 rounded-lg"
                style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-bold truncate" style={{ color: '#e2e8f0' }}>{it.nome}</div>
                    <div className="text-[9px]" style={{ color: '#64748b' }}>
                      {Object.keys(it.conteudo.config.elementos ?? {}).length} elementos
                    </div>
                  </div>
                  {!it.ativo && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#1a3a6b', color: '#94a3b8' }}>inativo</span>}
                  <button onClick={() => editar(it)} title="Editar" className="p-1 rounded hover:bg-white/10" style={{ color: '#93c5fd' }}>
                    <Edit3 size={11} />
                  </button>
                  <button onClick={() => alternarAtivo(it)} title={it.ativo ? 'Inativar' : 'Ativar'} className="p-1 rounded hover:bg-white/10" style={{ color: it.ativo ? '#fbbf24' : '#22c55e' }}>
                    <Power size={11} />
                  </button>
                  <button onClick={() => excluirItem(it)} title="Excluir" className="p-1 rounded hover:bg-white/10" style={{ color: '#f87171' }}>
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {edit && <LabEditor state={edit} onClose={() => setEdit(null)} />}
    </section>
  );
}

function PerfisSistema() {
  return (
    <div className="space-y-1.5">
      {PERFIS_BUILTIN.map(p => (
        <div key={p.id} className="p-2 rounded-lg"
          style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-bold truncate" style={{ color: '#e2e8f0' }}>{p.nome}</div>
              <div className="text-[9px]" style={{ color: '#64748b' }}>
                {Object.keys(p.config.elementos ?? {}).length} elementos · readonly
              </div>
            </div>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#1a3a6b', color: '#93c5fd' }}>sistema</span>
          </div>
        </div>
      ))}
      <p className="text-[9px] mt-3 px-2" style={{ color: '#475569' }}>
        Perfis embutidos (Fundação ABC, Interpartner). Para customizar, duplique como perfil próprio
        salvando-o de novo dentro do talhão com um nome diferente.
      </p>
    </div>
  );
}

type DetalhesLab = Record<string, { unidade?: string; extrator?: string }>;

function LabEditor({ state, onClose }: { state: LabEditState; onClose: () => void }) {
  const [nome, setNome] = useState(state.nome);
  const [configJson, setConfigJson] = useState(state.configJson);
  const [erro, setErro] = useState('');
  // Unidade/extrator por variável deste laboratório (parte do PerfilLabConfig).
  const [detalhes, setDetalhes] = useState<DetalhesLab>(() => {
    try { return (JSON.parse(state.configJson) as { detalhes?: DetalhesLab }).detalhes ?? {}; } catch { return {}; }
  });
  const elsMapeados = useMemo<string[]>(() => {
    try { return Object.keys((JSON.parse(configJson) as { elementos?: Record<string, number> }).elementos ?? {}); } catch { return []; }
  }, [configJson]);
  const setDet = (id: string, patch: { unidade?: string; extrator?: string }) =>
    setDetalhes(d => ({ ...d, [id]: { ...d[id], ...patch } }));

  function salvar() {
    setErro('');
    const n = nome.trim();
    if (!n) { setErro('Dê um nome.'); return; }
    let cfg: unknown;
    try { cfg = JSON.parse(configJson); }
    catch (e) { setErro('JSON inválido: ' + (e instanceof Error ? e.message : String(e))); return; }
    if (!cfg || typeof cfg !== 'object') { setErro('Config precisa ser um objeto JSON.'); return; }
    const cfgObj = cfg as { colId?: unknown; elementos?: unknown; detalhes?: DetalhesLab };
    if (typeof cfgObj.colId !== 'number') { setErro('Campo "colId" precisa ser numérico.'); return; }
    if (!cfgObj.elementos || typeof cfgObj.elementos !== 'object') { setErro('Campo "elementos" precisa ser objeto.'); return; }
    // grava os detalhes preenchidos (unidade/extrator por variável) no perfil
    const dLimpo: DetalhesLab = {};
    for (const [id, d] of Object.entries(detalhes)) {
      const unidade = d.unidade?.trim(), extrator = d.extrator?.trim();
      if (unidade || extrator) dLimpo[id] = { ...(unidade ? { unidade } : {}), ...(extrator ? { extrator } : {}) };
    }
    if (Object.keys(dLimpo).length) cfgObj.detalhes = dLimpo; else delete cfgObj.detalhes;

    if (state.id) {
      atualizar<ConteudoLaboratorio>('laboratorios', state.id, {
        nome: n,
        conteudo: { config: cfg as ConteudoLaboratorio['config'] },
      });
    } else {
      criar<ConteudoLaboratorio>('laboratorios', {
        nome: n,
        conteudo: { config: cfg as ConteudoLaboratorio['config'] },
      });
    }
    onClose();
  }

  return (
    <div className="absolute inset-0 z-10 flex flex-col" style={{ background: 'var(--invicta-blue-dark)' }}>
      <div className="flex items-center justify-between px-4 py-2 flex-shrink-0" style={{ borderBottom: '1px solid #1a3a6b' }}>
        <span className="text-[11px] font-bold uppercase" style={{ color: '#e2e8f0' }}>
          {state.id ? 'Editar perfil' : 'Novo perfil'}
        </span>
        <button onClick={onClose} className="p-1 rounded hover:bg-white/10" style={{ color: '#cbd5e1' }}>
          <X size={12} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <div>
          <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>Nome do laboratório</label>
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder="ex: Fundação ABC"
            className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle} />
        </div>

        {/* Unidade + extrator POR VARIÁVEL deste laboratório (K pode ser mmolc/dm³
            Mehlich num lab e cmolc/dm³ Resina em outro). Vive no perfil (detalhes). */}
        {elsMapeados.length > 0 && (
          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>Unidade e extrator deste laboratório (por variável)</label>
            <div className="grid items-center gap-x-2 px-1 pb-1 text-[9px] font-bold uppercase" style={{ gridTemplateColumns: '52px 1fr 1fr', color: '#475569' }}>
              <span>Var.</span><span>Unidade</span><span>Extrator / método</span>
            </div>
            <div className="space-y-1">
              {elsMapeados.map(id => (
                <div key={id} className="grid items-center gap-x-2" style={{ gridTemplateColumns: '52px 1fr 1fr' }}>
                  <span className="text-[10px] font-mono font-bold truncate" style={{ color: '#93c5fd' }}>{siglaVariavel(id)}</span>
                  <input value={detalhes[id]?.unidade ?? ''} onChange={e => setDet(id, { unidade: e.target.value })}
                    placeholder="ex: mmolc/dm³" list="unidades-analise-lab"
                    className="rounded px-2 py-1 text-[10px] outline-none" style={inputStyle} />
                  <input value={detalhes[id]?.extrator ?? ''} onChange={e => setDet(id, { extrator: e.target.value })}
                    placeholder="ex: Mehlich / Resina"
                    className="rounded px-2 py-1 text-[10px] outline-none" style={inputStyle} />
                </div>
              ))}
            </div>
            <p className="text-[9px] mt-1" style={{ color: '#64748b' }}>Deixe em branco para usar a unidade de referência do catálogo (Preferências de Análise › Variáveis).</p>
            <datalist id="unidades-analise-lab">
              {['mg/dm³', 'cmolc/dm³', 'mmolc/dm³', 'g/dm³', 'g/kg', '%', 'dag/kg'].map(u => <option key={u} value={u} />)}
            </datalist>
          </div>
        )}

        <div>
          <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>Config (JSON do PerfilLabConfig)</label>
          <textarea value={configJson} onChange={e => setConfigJson(e.target.value)}
            rows={18} spellCheck={false}
            className="w-full rounded px-2 py-1.5 text-[10px] font-mono outline-none resize-none"
            style={inputStyle} />
          <p className="text-[9px] mt-1" style={{ color: '#64748b' }}>
            Campos: colId (obrigatório), linhaCabecalho, regexNumero, colTalhao, regexTalhao,
            colProfundidade, regexProfundidade, colCampanha, colProtocolo, elementos (obrigatório).
          </p>
        </div>
        {erro && (
          <div className="px-2 py-1.5 rounded text-[10px]" style={{ background: '#3a1a1a', color: '#fca5a5', border: '1px solid #7f1d1d' }}>
            {erro}
          </div>
        )}
      </div>
      <div className="flex gap-2 px-3 py-2 flex-shrink-0" style={{ borderTop: '1px solid #1a3a6b' }}>
        <button onClick={onClose}
          className="flex-1 py-1.5 rounded text-[10px] font-bold"
          style={{ background: '#1a3a6b', color: '#cbd5e1' }}>
          Cancelar
        </button>
        <button onClick={salvar}
          className="flex-1 py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1"
          style={{ background: 'var(--invicta-green-dark)' }}>
          <Save size={11} /> Salvar
        </button>
      </div>
    </div>
  );
}

// ─── Perfis Agronômicos ───────────────────────────────────────────────────
// Item da Biblioteca que referencia Lab + PadraoAmostragem + legendas por
// elemento. É só um preset — aplicado no FertilidadeSection pré-preenche
// `legendaIdPorAtributo` sem travar a escolha individual.

interface PerfilEditState {
  id: string | null;
  nome: string;
  laboratorioId: string;
  padraoAmostragemId: string;
  legendasPorElemento: Record<string, string>;
}

function ConteudoPerfis() {
  const def = CATEGORIAS.find(c => c.slug === 'perfis')!;
  const Icon = def.icone;
  const [aba, setAba] = useState<EscopoBiblioteca>('meu');
  const [refresh, setRefresh] = useState(0);
  const [edit, setEdit] = useState<PerfilEditState | null>(null);

  useEffect(() => {
    const onCh = (e: Event) => {
      const d = (e as CustomEvent).detail as { slug?: CategoriaBiblioteca } | undefined;
      if (!d?.slug || d.slug === 'perfis') setRefresh(x => x + 1);
    };
    if (typeof window !== 'undefined') window.addEventListener('inv:biblioteca', onCh);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('inv:biblioteca', onCh); };
  }, []);

  const itens = useMemo(
    () => aba === 'sistema' ? [] : listar<ConteudoPerfil>('perfis', aba),
    [aba, refresh], // eslint-disable-line react-hooks/exhaustive-deps
  );

  function novo() {
    setEdit({ id: null, nome: '', laboratorioId: '', padraoAmostragemId: '', legendasPorElemento: {} });
  }
  function editar(it: ItemBiblioteca<ConteudoPerfil>) {
    setEdit({
      id: it.id, nome: it.nome,
      laboratorioId: it.conteudo.laboratorioId ?? '',
      padraoAmostragemId: it.conteudo.padraoAmostragemId ?? '',
      legendasPorElemento: it.conteudo.legendasPorElemento ?? {},
    });
  }
  function excluirItem(it: ItemBiblioteca<ConteudoPerfil>) {
    if (!confirm(`Excluir o perfil "${it.nome}"?`)) return;
    excluir('perfis', it.id);
  }
  function alternarAtivo(it: ItemBiblioteca<ConteudoPerfil>) {
    ativar('perfis', it.id, !it.ativo);
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
        {([
          { id: 'meu', label: 'Meus padrões' },
          { id: 'empresa', label: 'Empresa' },
          { id: 'sistema', label: 'Sistema' },
        ] as { id: EscopoBiblioteca; label: string }[]).map(t => (
          <button key={t.id} onClick={() => setAba(t.id)}
            className="flex-1 py-1 rounded text-[10px] font-bold"
            style={{ background: aba === t.id ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: aba === t.id ? '#fff' : '#64748b' }}>
            {t.label}
          </button>
        ))}
      </div>

      {aba !== 'sistema' && (
        <div className="px-3 pt-2 flex-shrink-0">
          <button onClick={novo}
            className="w-full py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1"
            style={{ background: 'var(--invicta-green-dark)' }}>
            <Plus size={11} /> Novo perfil
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {aba === 'sistema' ? (
          <div className="text-center py-8 px-4">
            <p className="text-[10px]" style={{ color: '#64748b' }}>
              Ainda não há perfis embutidos pelo sistema. Crie um em <em>Meus padrões</em>
              ou use o botão <em>Salvar como Perfil</em> dentro da Fertilidade.
            </p>
          </div>
        ) : itens.length === 0 ? (
          <div className="text-center py-8 px-4">
            <p className="text-[10px]" style={{ color: '#64748b' }}>
              Nenhum perfil em <strong>{abaLabel(aba)}</strong>.
              Use <em>+ Novo perfil</em> ou salve um a partir da Fertilidade.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {itens.map(it => (
              <ItemPerfil key={it.id} it={it}
                onEdit={() => editar(it)} onDel={() => excluirItem(it)} onToggle={() => alternarAtivo(it)} />
            ))}
          </div>
        )}
      </div>

      {edit && <PerfilEditor state={edit} onClose={() => setEdit(null)} />}
    </section>
  );
}

function ItemPerfil({
  it, onEdit, onDel, onToggle,
}: {
  it: ItemBiblioteca<ConteudoPerfil>;
  onEdit: () => void; onDel: () => void; onToggle: () => void;
}) {
  const labNome = useMemo(() => {
    if (!it.conteudo.laboratorioId) return null;
    const builtin = PERFIS_BUILTIN.find(p => p.id === it.conteudo.laboratorioId);
    if (builtin) return builtin.nome;
    const item = listar<ConteudoLaboratorio>('laboratorios').find(i => i.id === it.conteudo.laboratorioId);
    return item?.nome ?? '?';
  }, [it.conteudo.laboratorioId]);

  const nElementos = Object.keys(it.conteudo.legendasPorElemento ?? {}).length;
  const padrAm = it.conteudo.padraoAmostragemId
    ? getPadroesAmostragem().find(p => p.id === it.conteudo.padraoAmostragemId)?.nome ?? '?'
    : null;

  return (
    <div className="p-2 rounded-lg" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-bold truncate" style={{ color: '#e2e8f0' }}>{it.nome}</div>
          <div className="text-[9px]" style={{ color: '#64748b' }}>
            {[labNome && `Lab: ${labNome}`, padrAm && `Padrão: ${padrAm}`, `${nElementos} legenda(s)`]
              .filter(Boolean).join(' · ')}
          </div>
        </div>
        {!it.ativo && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#1a3a6b', color: '#94a3b8' }}>inativo</span>}
        <button onClick={onEdit} title="Editar" className="p-1 rounded hover:bg-white/10" style={{ color: '#93c5fd' }}><Edit3 size={11} /></button>
        <button onClick={onToggle} title={it.ativo ? 'Inativar' : 'Ativar'} className="p-1 rounded hover:bg-white/10" style={{ color: it.ativo ? '#fbbf24' : '#22c55e' }}><Power size={11} /></button>
        <button onClick={onDel} title="Excluir" className="p-1 rounded hover:bg-white/10" style={{ color: '#f87171' }}><Trash2 size={11} /></button>
      </div>
    </div>
  );
}

function PerfilEditor({ state, onClose }: { state: PerfilEditState; onClose: () => void }) {
  const [nome, setNome] = useState(state.nome);
  const [labId, setLabId] = useState(state.laboratorioId);
  const [padrAmId, setPadrAmId] = useState(state.padraoAmostragemId);
  const [legPorEl, setLegPorEl] = useState<Record<string, string>>(state.legendasPorElemento);
  const [erro, setErro] = useState('');

  // Lab options = builtins + biblioteca laboratorios (escopo filtrado)
  const labOptions = useMemo(() => {
    const builtins = PERFIS_BUILTIN.map(p => ({ id: p.id, nome: `${p.nome} (sistema)` }));
    const salvos = listar<ConteudoLaboratorio>('laboratorios')
      .filter(i => i.ativo)
      .map(i => ({ id: i.id, nome: i.nome }));
    return [...builtins, ...salvos];
  }, []);

  const padroes = useMemo(() => getPadroesAmostragem(), []);

  function setLeg(el: string, legendaId: string) {
    setLegPorEl(prev => {
      const next = { ...prev };
      if (legendaId) next[el] = legendaId;
      else delete next[el];
      return next;
    });
  }

  function salvar() {
    setErro('');
    const n = nome.trim();
    if (!n) { setErro('Dê um nome.'); return; }
    if (!labId && !padrAmId && Object.keys(legPorEl).length === 0) {
      setErro('Defina ao menos um campo (laboratório, padrão de amostragem ou ao menos uma legenda).');
      return;
    }
    const conteudo: ConteudoPerfil = {
      laboratorioId: labId || undefined,
      padraoAmostragemId: padrAmId || undefined,
      legendasPorElemento: Object.keys(legPorEl).length ? legPorEl : undefined,
    };

    if (state.id) {
      atualizar<ConteudoPerfil>('perfis', state.id, { nome: n, conteudo });
    } else {
      criar<ConteudoPerfil>('perfis', { nome: n, conteudo });
    }
    onClose();
  }

  return (
    <div className="absolute inset-0 z-10 flex flex-col" style={{ background: 'var(--invicta-blue-dark)' }}>
      <div className="flex items-center justify-between px-4 py-2 flex-shrink-0" style={{ borderBottom: '1px solid #1a3a6b' }}>
        <span className="text-[11px] font-bold uppercase" style={{ color: '#e2e8f0' }}>
          {state.id ? 'Editar perfil' : 'Novo perfil'}
        </span>
        <button onClick={onClose} className="p-1 rounded hover:bg-white/10" style={{ color: '#cbd5e1' }}>
          <X size={12} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div>
          <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>Nome</label>
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder="ex: Fundação ABC — rotina"
            className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle} />
        </div>

        <div>
          <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>Laboratório (de-para de colunas)</label>
          <select value={labId} onChange={e => setLabId(e.target.value)}
            className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle}>
            <option value="">— Nenhum</option>
            {labOptions.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </div>

        <div>
          <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>Padrão de Amostragem</label>
          <select value={padrAmId} onChange={e => setPadrAmId(e.target.value)}
            className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle}>
            <option value="">— Nenhum</option>
            {padroes.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>

        <div>
          <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>Legendas por elemento</label>
          <div className="space-y-1">
            {getVariaveisAtivas().map(el => {
              const legs = getLegendasPorAtributo(el.id);
              const valor = legPorEl[el.id] ?? '';
              return (
                <div key={el.id} className="flex items-center gap-2">
                  <span className="text-[10px] font-mono flex-shrink-0" style={{ width: 60, color: '#93c5fd' }}>{el.sigla}</span>
                  <select value={valor} onChange={e => setLeg(el.id, e.target.value)}
                    disabled={legs.length === 0}
                    className="flex-1 rounded px-2 py-1 text-[10px] outline-none" style={inputStyle}>
                    <option value="">{legs.length === 0 ? '— sem legendas cadastradas' : '— Nenhuma'}</option>
                    {legs.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        </div>

        {erro && (
          <div className="px-2 py-1.5 rounded text-[10px]" style={{ background: '#3a1a1a', color: '#fca5a5', border: '1px solid #7f1d1d' }}>
            {erro}
          </div>
        )}
      </div>

      <div className="flex gap-2 px-3 py-2 flex-shrink-0" style={{ borderTop: '1px solid #1a3a6b' }}>
        <button onClick={onClose}
          className="flex-1 py-1.5 rounded text-[10px] font-bold"
          style={{ background: '#1a3a6b', color: '#cbd5e1' }}>
          Cancelar
        </button>
        <button onClick={salvar}
          className="flex-1 py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1"
          style={{ background: 'var(--invicta-green-dark)' }}>
          <Save size={11} /> Salvar
        </button>
      </div>
    </div>
  );
}

// ─── Safras ───────────────────────────────────────────────────────────────
// Embute o SafrasPanel existente (que já opera via wrappers da Biblioteca).

function ConteudoSafras() {
  const def = CATEGORIAS.find(c => c.slug === 'safras')!;
  const Icon = def.icone;
  return (
    <section className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #1a3a6b' }}>
        <div className="flex items-center gap-2 mb-1">
          <Icon size={14} style={{ color: '#93c5fd' }} />
          <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: '#e2e8f0' }}>{def.nome}</h3>
        </div>
        <p className="text-[10px]" style={{ color: '#64748b' }}>{def.descricao}</p>
      </div>
      <div className="flex-1 overflow-y-auto"><SafrasPanel /></div>
    </section>
  );
}

// ─── Preferências de Análise (hoje: Etiqueta) ─────────────────────────────

function ConteudoPreferencias() {
  const def = CATEGORIAS.find(c => c.slug === 'preferencias-analise')!;
  const Icon = def.icone;
  const [sub, setSub] = useState<'variaveis' | 'etiqueta'>('variaveis');
  return (
    <section className="flex-1 flex flex-col overflow-hidden relative">
      <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #1a3a6b' }}>
        <div className="flex items-center gap-2 mb-1">
          <Icon size={14} style={{ color: '#93c5fd' }} />
          <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: '#e2e8f0' }}>{def.nome}</h3>
        </div>
        <p className="text-[10px]" style={{ color: '#64748b' }}>Variáveis dos laudos (sigla, nome, unidade) e o modelo de etiqueta.</p>
      </div>
      <div className="flex gap-1 px-3 pt-2 flex-shrink-0">
        {([
          { id: 'variaveis', label: 'Variáveis de Análise' },
          { id: 'etiqueta', label: 'Etiquetas' },
        ] as { id: 'variaveis' | 'etiqueta'; label: string }[]).map(t => (
          <button key={t.id} onClick={() => setSub(t.id)}
            className="flex-1 py-1 rounded text-[10px] font-bold"
            style={{ background: sub === t.id ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: sub === t.id ? '#fff' : '#64748b' }}>
            {t.label}
          </button>
        ))}
      </div>
      {sub === 'variaveis' ? <PrefVariaveis /> : <PrefEtiqueta />}
    </section>
  );
}

function PrefEtiqueta() {
  const [etq, setEtq] = useState<ConfigEtiqueta>(() => getConfigEtiqueta());
  function atualizar(patch: Partial<ConfigEtiqueta>) {
    const novo = { ...etq, ...patch };
    setEtq(novo);
    saveConfigEtiqueta(novo);
  }
  return (
    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
      <div className="rounded-lg p-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
        <div className="text-[11px] font-bold mb-2" style={{ color: '#e2e8f0' }}>Etiquetas (Pimaco)</div>
        <EtiquetaLayoutPicker
          layoutId={etq.layoutId} setLayoutId={id => atualizar({ layoutId: id })}
          dx={etq.dx} dy={etq.dy}
          setDx={v => atualizar({ dx: v })} setDy={v => atualizar({ dy: v })}
        />
      </div>
      <p className="text-[9px]" style={{ color: '#475569' }}>
        Também acessível em Configurações › Etiquetas — as duas telas editam o mesmo padrão.
      </p>
    </div>
  );
}

// ── Variáveis de Análise (catálogo tipo InCeres: Sigla · Nome · Unidade · Usar) ──
function PrefVariaveis() {
  const [refresh, setRefresh] = useState(0);
  const [edit, setEdit] = useState<{ v: VariavelAnalise | null } | null>(null); // v=null → nova
  useEffect(() => { garantirVariaveisComplementares(); setRefresh(x => x + 1); }, []);   // já materializa o seed básico por dentro
  const vars = useMemo(() => getVariaveisAnalise(), [refresh]);   // eslint-disable-line react-hooks/exhaustive-deps

  function toggleUsar(v: VariavelAnalise) {
    saveVariavelAnalise({ ...v, usar: !v.usar });
    setRefresh(x => x + 1);
  }
  function del(v: VariavelAnalise) {
    if (!confirm(`Excluir a variável "${v.sigla}"?`)) return;
    if (!deleteVariavelAnalise(v.id)) { alert('Esta variável é do sistema (chave de dados existentes) — desative-a em vez de excluir.'); return; }
    setRefresh(x => x + 1);
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-3 pt-2 flex-shrink-0">
        <button onClick={() => setEdit({ v: null })}
          className="w-full py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1"
          style={{ background: 'var(--invicta-green-dark)' }}>
          <Plus size={11} /> Nova variável
        </button>
        <p className="text-[9px] mt-1" style={{ color: '#64748b' }}>
          A unidade aqui é a de referência — a unidade/extrator de CADA laboratório fica no perfil do Laboratório.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <div className="grid items-center gap-x-2 px-2 pb-1 text-[9px] font-bold uppercase" style={{ gridTemplateColumns: '52px 1fr 76px 44px 40px', color: '#475569' }}>
          <span>Sigla</span><span>Nome</span><span>Unidade</span><span>Usar</span><span />
        </div>
        <div className="space-y-1">
          {vars.map(v => (
            <div key={v.id} className="grid items-center gap-x-2 p-2 rounded-lg" style={{ gridTemplateColumns: '52px 1fr 76px 44px 40px', background: '#061525', border: '1px solid #1a3a6b', opacity: v.usar ? 1 : 0.55 }}>
              <span className="text-[10px] font-mono font-bold truncate" style={{ color: '#93c5fd' }}>{v.sigla}</span>
              <span className="text-[10px] truncate" style={{ color: '#e2e8f0' }}>{v.nome}</span>
              <span className="text-[9px] truncate" style={{ color: '#94a3b8' }}>{v.unidade || '—'}</span>
              <button onClick={() => toggleUsar(v)} className="py-0.5 rounded text-[9px] font-bold"
                style={{ background: v.usar ? 'var(--invicta-green-dark)' : '#1a3a6b', color: v.usar ? '#fff' : '#64748b' }}>
                {v.usar ? 'Sim' : 'Não'}
              </button>
              <div className="flex items-center gap-1 justify-end">
                <button onClick={() => setEdit({ v })} title="Editar" className="p-1 rounded hover:bg-white/10" style={{ color: '#93c5fd' }}><Edit3 size={11} /></button>
                <button onClick={() => del(v)} title="Excluir" className="p-1 rounded hover:bg-white/10" style={{ color: '#f87171' }}><Trash2 size={11} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
      {edit && <VariavelEditor variavel={edit.v} onClose={() => { setEdit(null); setRefresh(x => x + 1); }} />}
    </div>
  );
}

function VariavelEditor({ variavel, onClose }: { variavel: VariavelAnalise | null; onClose: () => void }) {
  const [sigla, setSigla] = useState(variavel?.sigla ?? '');
  const [nome, setNome] = useState(variavel?.nome ?? '');
  const [unidade, setUnidade] = useState(variavel?.unidade ?? '');
  const [sinonimos, setSinonimos] = useState((variavel?.sinonimos ?? []).join(', '));
  const [casas, setCasas] = useState(variavel?.casasDecimais != null ? String(variavel.casasDecimais) : '');
  const [erro, setErro] = useState('');

  function salvar() {
    setErro('');
    const s = sigla.trim();
    if (!s) { setErro('Dê uma sigla (ex.: K, pH SMP).'); return; }
    const sins = sinonimos.split(',').map(x => normSinonimo(x)).filter(Boolean);
    if (sins.length === 0) sins.push(normSinonimo(s));
    const dados = { sigla: s, nome: nome.trim() || s, unidade: unidade.trim(), sinonimos: sins, usar: variavel?.usar ?? true, casasDecimais: casas === '' ? undefined : Number(casas) };
    if (variavel) saveVariavelAnalise({ ...variavel, ...dados });
    else novaVariavelAnalise(dados);
    onClose();
  }

  return (
    <div className="absolute inset-0 z-10 flex flex-col" style={{ background: 'var(--invicta-blue-dark)' }}>
      <div className="flex items-center justify-between px-4 py-2 flex-shrink-0" style={{ borderBottom: '1px solid #1a3a6b' }}>
        <span className="text-[11px] font-bold uppercase" style={{ color: '#e2e8f0' }}>{variavel ? `Editar ${variavel.sigla}` : 'Nova variável de análise'}</span>
        <button onClick={onClose} className="p-1 rounded hover:bg-white/10" style={{ color: '#cbd5e1' }}><X size={12} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>Sigla</label>
            <input value={sigla} onChange={e => setSigla(e.target.value)} placeholder="ex: pH SMP"
              className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle} />
          </div>
          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>Unidade (referência)</label>
            <input value={unidade} onChange={e => setUnidade(e.target.value)} placeholder="ex: cmolc/dm³" list="unidades-analise"
              className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle} />
            <datalist id="unidades-analise">
              {['mg/dm³', 'cmolc/dm³', 'mmolc/dm³', 'g/dm³', 'g/kg', '%', 'mS/m', 'dag/kg'].map(u => <option key={u} value={u} />)}
            </datalist>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>Nome</label>
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="ex: pH SMP (índice de calagem)"
              className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle} />
          </div>
          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>Casas decimais (exibição)</label>
            <select value={casas} onChange={e => setCasas(e.target.value)} className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle}>
              <option value="">Padrão (automático)</option>
              <option value="0">0 (inteiro)</option>
              <option value="1">1 casa</option>
              <option value="2">2 casas</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>Sinônimos (para achar a coluna na planilha — separados por vírgula)</label>
          <input value={sinonimos} onChange={e => setSinonimos(e.target.value)} placeholder="ex: phsmp, smp, indicesmp"
            className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle} />
          <p className="text-[9px] mt-1" style={{ color: '#64748b' }}>São comparados com o cabeçalho da planilha (sem acento/maiúsculas). Evite repetir sinônimos de outra variável.</p>
        </div>
        {erro && (
          <div className="px-2 py-1.5 rounded text-[10px]" style={{ background: '#3a1a1a', color: '#fca5a5', border: '1px solid #7f1d1d' }}>{erro}</div>
        )}
      </div>
      <div className="flex gap-2 px-3 py-2 flex-shrink-0" style={{ borderTop: '1px solid #1a3a6b' }}>
        <button onClick={onClose} className="flex-1 py-1.5 rounded text-[10px] font-bold" style={{ background: '#1a3a6b', color: '#cbd5e1' }}>Cancelar</button>
        <button onClick={salvar} className="flex-1 py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1" style={{ background: 'var(--invicta-green-dark)' }}><Save size={11} /> Salvar</button>
      </div>
    </div>
  );
}

// ─── Grades (Padrões de Amostragem + Padrões de Elementos) ────────────────

function ConteudoGrades() {
  const def = CATEGORIAS.find(c => c.slug === 'grades')!;
  const Icon = def.icone;
  const [sub, setSub] = useState<'amostragem' | 'elementos'>('amostragem');
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
        {([
          { id: 'amostragem', label: 'Padrões de Amostragem' },
          { id: 'elementos', label: 'Padrões de Elementos' },
        ] as { id: 'amostragem' | 'elementos'; label: string }[]).map(t => (
          <button key={t.id} onClick={() => setSub(t.id)}
            className="flex-1 py-1 rounded text-[10px] font-bold"
            style={{ background: sub === t.id ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: sub === t.id ? '#fff' : '#64748b' }}>
            {t.label}
          </button>
        ))}
      </div>
      {sub === 'amostragem' ? <GradesAmostragem /> : <GradesElementos />}
    </section>
  );
}

function GradesElementos() {
  const [refresh, setRefresh] = useState(0);
  const [edit, setEdit] = useState<{ id: string | null; nome: string; elementos: string[] } | null>(null);
  const itens = useMemo(() => getPadroesElementos(), [refresh]);

  function del(p: PadraoElementos) {
    if (!confirm(`Excluir o padrão de elementos "${p.nome}"?`)) return;
    deletePadraoElementos(p.id);
    setRefresh(x => x + 1);
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-3 pt-2 flex-shrink-0">
        <button onClick={() => setEdit({ id: null, nome: '', elementos: [] })}
          className="w-full py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1"
          style={{ background: 'var(--invicta-green-dark)' }}>
          <Plus size={11} /> Novo padrão de elementos
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {itens.length === 0 ? (
          <p className="text-center text-[10px] py-8" style={{ color: '#64748b' }}>Nenhum padrão de elementos. Use <em>+ Novo</em>.</p>
        ) : (
          <div className="space-y-1.5">
            {itens.map(p => (
              <div key={p.id} className="p-2 rounded-lg flex items-center gap-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-bold truncate" style={{ color: '#e2e8f0' }}>{p.nome}</div>
                  <div className="text-[9px] truncate" style={{ color: '#64748b' }}>{p.elementos.map(siglaVariavel).join(', ')}</div>
                </div>
                <button onClick={() => setEdit({ id: p.id, nome: p.nome, elementos: [...p.elementos] })} title="Editar" className="p-1 rounded hover:bg-white/10" style={{ color: '#93c5fd' }}><Edit3 size={11} /></button>
                <button onClick={() => del(p)} title="Excluir" className="p-1 rounded hover:bg-white/10" style={{ color: '#f87171' }}><Trash2 size={11} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
      {edit && <ElementosEditor state={edit} onClose={() => { setEdit(null); setRefresh(x => x + 1); }} />}
    </div>
  );
}

function ElementosEditor({ state, onClose }: { state: { id: string | null; nome: string; elementos: string[] }; onClose: () => void }) {
  const [nome, setNome] = useState(state.nome);
  const [els, setEls] = useState<string[]>(state.elementos);
  const [erro, setErro] = useState('');

  function toggle(id: string) {
    setEls(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  }
  function salvar() {
    setErro('');
    const n = nome.trim();
    if (!n) { setErro('Dê um nome.'); return; }
    if (els.length === 0) { setErro('Selecione ao menos um elemento.'); return; }
    if (state.id) updatePadraoElementos(state.id, { nome: n, elementos: els });
    else savePadraoElementos({ nome: n, elementos: els });
    onClose();
  }

  return (
    <div className="absolute inset-0 z-10 flex flex-col" style={{ background: 'var(--invicta-blue-dark)' }}>
      <div className="flex items-center justify-between px-4 py-2 flex-shrink-0" style={{ borderBottom: '1px solid #1a3a6b' }}>
        <span className="text-[11px] font-bold uppercase" style={{ color: '#e2e8f0' }}>{state.id ? 'Editar padrão de elementos' : 'Novo padrão de elementos'}</span>
        <button onClick={onClose} className="p-1 rounded hover:bg-white/10" style={{ color: '#cbd5e1' }}><X size={12} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div>
          <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>Nome</label>
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder="ex: Rotina + Micros"
            className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle} />
        </div>
        <div>
          <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>Elementos ({els.length})</label>
          <div className="grid grid-cols-3 gap-1">
            {getVariaveisAtivas().map(el => {
              const on = els.includes(el.id);
              return (
                <button key={el.id} onClick={() => toggle(el.id)}
                  className="py-1 rounded text-[10px] font-bold"
                  style={{ background: on ? 'var(--invicta-green-dark)' : '#1a3a6b', color: on ? '#fff' : '#94a3b8' }}>
                  {el.sigla}
                </button>
              );
            })}
          </div>
        </div>
        {erro && (
          <div className="px-2 py-1.5 rounded text-[10px]" style={{ background: '#3a1a1a', color: '#fca5a5', border: '1px solid #7f1d1d' }}>{erro}</div>
        )}
      </div>
      <div className="flex gap-2 px-3 py-2 flex-shrink-0" style={{ borderTop: '1px solid #1a3a6b' }}>
        <button onClick={onClose} className="flex-1 py-1.5 rounded text-[10px] font-bold" style={{ background: '#1a3a6b', color: '#cbd5e1' }}>Cancelar</button>
        <button onClick={salvar} className="flex-1 py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1" style={{ background: 'var(--invicta-green-dark)' }}><Save size={11} /> Salvar</button>
      </div>
    </div>
  );
}

function GradesAmostragem() {
  const [refresh, setRefresh] = useState(0);
  const [edit, setEdit] = useState<{ id: string | null; nome: string; densidadeHaPonto: number; profundidades: ProfundidadeConfig[] } | null>(null);
  const itens = useMemo(() => getPadroesAmostragem(), [refresh]);

  function del(p: PadraoAmostragem) {
    if (!confirm(`Excluir o padrão de amostragem "${p.nome}"?`)) return;
    deletePadraoAmostragem(p.id);
    setRefresh(x => x + 1);
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-3 pt-2 flex-shrink-0">
        <button onClick={() => setEdit({ id: null, nome: '', densidadeHaPonto: 2, profundidades: [] })}
          className="w-full py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1"
          style={{ background: 'var(--invicta-green-dark)' }}>
          <Plus size={11} /> Novo padrão de amostragem
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {itens.length === 0 ? (
          <p className="text-center text-[10px] py-8" style={{ color: '#64748b' }}>Nenhum padrão de amostragem. Use <em>+ Novo</em>.</p>
        ) : (
          <div className="space-y-1.5">
            {itens.map(p => (
              <div key={p.id} className="p-2 rounded-lg flex items-center gap-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-bold truncate" style={{ color: '#e2e8f0' }}>{p.nome}</div>
                  <div className="text-[9px] truncate" style={{ color: '#64748b' }}>
                    1 ponto / {p.densidadeHaPonto} ha · {p.profundidades.length} profundidade(s)
                  </div>
                </div>
                <button onClick={() => setEdit({ id: p.id, nome: p.nome, densidadeHaPonto: p.densidadeHaPonto, profundidades: p.profundidades.map(x => ({ ...x })) })} title="Editar" className="p-1 rounded hover:bg-white/10" style={{ color: '#93c5fd' }}><Edit3 size={11} /></button>
                <button onClick={() => del(p)} title="Excluir" className="p-1 rounded hover:bg-white/10" style={{ color: '#f87171' }}><Trash2 size={11} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
      {edit && <AmostragemEditor state={edit} onClose={() => { setEdit(null); setRefresh(x => x + 1); }} />}
    </div>
  );
}

function AmostragemEditor({ state, onClose }: { state: { id: string | null; nome: string; densidadeHaPonto: number; profundidades: ProfundidadeConfig[] }; onClose: () => void }) {
  const [nome, setNome] = useState(state.nome);
  const [densidade, setDensidade] = useState(state.densidadeHaPonto);
  const [profs, setProfs] = useState<ProfundidadeConfig[]>(state.profundidades);
  const padrEl = useMemo(() => getPadroesElementos(), []);
  const [erro, setErro] = useState('');

  function addProf() {
    setProfs(p => [...p, { rotulo: '', percentual: 100, padraoElementosId: padrEl[0]?.id ?? '' }]);
  }
  function setProf(i: number, patch: Partial<ProfundidadeConfig>) {
    setProfs(p => p.map((x, idx) => idx === i ? { ...x, ...patch } : x));
  }
  function salvar() {
    setErro('');
    const n = nome.trim();
    if (!n) { setErro('Dê um nome.'); return; }
    if (!densidade || densidade <= 0) { setErro('Densidade deve ser maior que zero.'); return; }
    if (profs.length === 0) { setErro('Adicione ao menos uma profundidade.'); return; }
    for (const p of profs) {
      if (!p.rotulo.trim()) { setErro('Cada profundidade precisa de um rótulo (ex: 00-20).'); return; }
      if (!p.padraoElementosId) { setErro('Cada profundidade precisa de um padrão de elementos.'); return; }
    }
    const data = { nome: n, densidadeHaPonto: densidade, profundidades: profs };
    if (state.id) updatePadraoAmostragem(state.id, data);
    else savePadraoAmostragem(data);
    onClose();
  }

  return (
    <div className="absolute inset-0 z-10 flex flex-col" style={{ background: 'var(--invicta-blue-dark)' }}>
      <div className="flex items-center justify-between px-4 py-2 flex-shrink-0" style={{ borderBottom: '1px solid #1a3a6b' }}>
        <span className="text-[11px] font-bold uppercase" style={{ color: '#e2e8f0' }}>{state.id ? 'Editar padrão de amostragem' : 'Novo padrão de amostragem'}</span>
        <button onClick={onClose} className="p-1 rounded hover:bg-white/10" style={{ color: '#cbd5e1' }}><X size={12} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {padrEl.length === 0 && (
          <div className="px-2 py-1.5 rounded text-[10px]" style={{ background: '#3a2e1a', color: '#fbbf24', border: '1px solid #78510f' }}>
            Crie ao menos um <strong>Padrão de Elementos</strong> primeiro (aba ao lado) — cada profundidade aponta para um.
          </div>
        )}
        <div>
          <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>Nome</label>
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder="ex: Padrão Invicta 2 ha"
            className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle} />
        </div>
        <div>
          <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>Densidade (ha por ponto)</label>
          <input type="number" step="0.5" min="0.5" value={densidade}
            onChange={e => setDensidade(Number(e.target.value.replace(',', '.')) || 0)}
            className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] font-semibold" style={{ color: '#cbd5e1' }}>Profundidades</label>
            <button onClick={addProf} className="text-[10px] font-bold flex items-center gap-1" style={{ color: '#4ade80' }}>
              <Plus size={10} /> Adicionar
            </button>
          </div>
          <div className="space-y-1.5">
            {profs.map((p, i) => (
              <div key={i} className="p-2 rounded space-y-1" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
                <div className="flex items-center gap-1">
                  <input value={p.rotulo} onChange={e => setProf(i, { rotulo: e.target.value })} placeholder="00-20"
                    className="rounded px-1.5 py-1 text-[10px] outline-none" style={{ ...inputStyle, width: 64 }} />
                  <input type="number" min="0" max="100" value={p.percentual}
                    onChange={e => setProf(i, { percentual: Number(e.target.value) || 0 })}
                    className="rounded px-1.5 py-1 text-[10px] outline-none" style={{ ...inputStyle, width: 52 }} />
                  <span className="text-[10px]" style={{ color: '#64748b' }}>%</span>
                  <button onClick={() => setProfs(prev => prev.filter((_, idx) => idx !== i))} title="Remover" className="ml-auto p-1 rounded hover:bg-white/10" style={{ color: '#f87171' }}><Trash2 size={10} /></button>
                </div>
                <select value={p.padraoElementosId} onChange={e => setProf(i, { padraoElementosId: e.target.value })}
                  className="w-full rounded px-1.5 py-1 text-[10px] outline-none" style={inputStyle}>
                  <option value="">— Padrão de elementos…</option>
                  {padrEl.map(pe => <option key={pe.id} value={pe.id}>{pe.nome}</option>)}
                </select>
              </div>
            ))}
            {profs.length === 0 && <p className="text-[9px]" style={{ color: '#64748b' }}>Nenhuma profundidade. Clique em Adicionar.</p>}
          </div>
        </div>
        {erro && (
          <div className="px-2 py-1.5 rounded text-[10px]" style={{ background: '#3a1a1a', color: '#fca5a5', border: '1px solid #7f1d1d' }}>{erro}</div>
        )}
      </div>
      <div className="flex gap-2 px-3 py-2 flex-shrink-0" style={{ borderTop: '1px solid #1a3a6b' }}>
        <button onClick={onClose} className="flex-1 py-1.5 rounded text-[10px] font-bold" style={{ background: '#1a3a6b', color: '#cbd5e1' }}>Cancelar</button>
        <button onClick={salvar} className="flex-1 py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1" style={{ background: 'var(--invicta-green-dark)' }}><Save size={11} /> Salvar</button>
      </div>
    </div>
  );
}
