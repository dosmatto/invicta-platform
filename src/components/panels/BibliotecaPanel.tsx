'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CATEGORIAS, listar, importar, exportar,
  type CategoriaBiblioteca, type EscopoBiblioteca, type DefCategoria,
} from '@/lib/biblioteca';
import { Search, Plus, Download, Upload, ChevronRight } from 'lucide-react';

const inputStyle = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;

export function BibliotecaPanel() {
  const [slug, setSlug] = useState<CategoriaBiblioteca>('legendas');
  return (
    <div className="flex h-full">
      <CategoriasNav slug={slug} setSlug={setSlug} />
      <CategoriaConteudo slug={slug} />
    </div>
  );
}

// ─── Sidebar interna com as 16 categorias ────────────────────────────────

function CategoriasNav({ slug, setSlug }: { slug: CategoriaBiblioteca; setSlug: (s: CategoriaBiblioteca) => void }) {
  return (
    <nav className="flex-shrink-0 overflow-y-auto py-2"
      style={{ width: 140, background: '#061525', borderRight: '1px solid #1a3a6b' }}>
      {CATEGORIAS.map(c => {
        const Icon = c.icone;
        const ativo = c.slug === slug;
        return (
          <button key={c.slug} onClick={() => setSlug(c.slug)}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-semibold text-left transition-colors"
            style={{
              background: ativo ? 'var(--invicta-blue)' : 'transparent',
              color: ativo ? '#fff' : '#cbd5e1',
              borderLeft: ativo ? '2px solid var(--invicta-green)' : '2px solid transparent',
            }}>
            <Icon size={11} style={{ flexShrink: 0 }} />
            <span className="truncate flex-1">{c.nome}</span>
            {c.status === 'em-breve' && (
              <span className="text-[8px] font-bold px-1 rounded" style={{ background: '#1a3a6b', color: '#64748b' }}>em breve</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

// ─── Conteúdo da categoria selecionada ───────────────────────────────────

function CategoriaConteudo({ slug }: { slug: CategoriaBiblioteca }) {
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
