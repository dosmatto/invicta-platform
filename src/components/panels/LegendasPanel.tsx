'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getLegendas, saveLegenda, upsertLegenda, updateLegenda, deleteLegenda,
} from '@/lib/store';
import {
  type Legenda, type ClasseLegenda, type CategoriaLegenda, type EstiloLegenda,
  gradienteCssDaLegenda, PARES_OFICIAIS_5, LARGURAS_VISUAIS_5, classesFertilidade5, paresDaClasse,
  CATEGORIAS_LEGENDA,
} from '@/lib/legendas';
import { ELEMENTOS_LAB } from '@/lib/lab';
import {
  Plus, Edit3, Copy, Trash2, Download, Upload, ChevronLeft, BookOpen,
  Save, X, ArrowUp, ArrowDown, AlertTriangle, Check,
} from 'lucide-react';

const inputStyle = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;
const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

export function LegendasPanel() {
  const [modo, setModo] = useState<'lista' | 'editor'>('lista');
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [legendas, setLegendas] = useState<Legenda[]>([]);

  function recarregar() { setLegendas(getLegendas()); }
  useEffect(() => { recarregar(); }, []);

  if (modo === 'editor') {
    const leg = legendas.find(l => l.id === editandoId);
    return (
      <LegendaEditor
        legenda={leg ?? null}
        onClose={() => { setModo('lista'); setEditandoId(null); recarregar(); }}
      />
    );
  }

  return (
    <LegendasLista
      legendas={legendas}
      onNova={() => { setEditandoId(null); setModo('editor'); }}
      onEditar={id => { setEditandoId(id); setModo('editor'); }}
      onMudou={recarregar}
    />
  );
}

// ============================================================
// LISTA
// ============================================================

function LegendasLista({
  legendas, onNova, onEditar, onMudou,
}: { legendas: Legenda[]; onNova: () => void; onEditar: (id: string) => void; onMudou: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [filtro, setFiltro] = useState('');

  const agrupadas = useMemo(() => {
    const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const f = norm(filtro);
    const filtradas = !f ? legendas : legendas.filter(l => {
      const alvo = norm(`${l.nome} ${l.atributo} ${l.simbolo} ${l.fonte} ${l.metodo ?? ''}`);
      return alvo.includes(f);
    });
    const mapa = new Map<string, Legenda[]>();
    for (const l of filtradas) {
      const k = l.fonte || '(sem fonte)';
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k)!.push(l);
    }
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  }, [legendas, filtro]);

  function duplicar(l: Legenda) {
    const copia: Omit<Legenda, 'id' | 'criadoEm' | 'atualizadoEm'> = {
      ...l, nome: `${l.nome} (cópia)`,
      classes: l.classes.map(c => ({ ...c })),
    };
    saveLegenda(copia);
    onMudou();
  }

  function excluir(l: Legenda) {
    if (!confirm(`Excluir a legenda "${l.nome}"?`)) return;
    deleteLegenda(l.id);
    onMudou();
  }

  function exportarTudo() {
    const json = JSON.stringify(legendas, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `legendas-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const txt = await f.text();
      const data = JSON.parse(txt);
      const itens: Legenda[] = Array.isArray(data) ? data : [data];
      let n = 0;
      for (const it of itens) {
        if (!it?.id || !it?.classes) continue;
        upsertLegenda(it as Legenda);
        n++;
      }
      alert(`${n} legenda(s) importada(s).`);
      onMudou();
    } catch (err) {
      alert('Arquivo inválido: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  return (
    <div className="px-3 py-3 space-y-3">
      {/* Ações topo */}
      <div className="flex gap-1">
        <button onClick={onNova} className="flex-1 py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1" style={{ background: 'var(--invicta-green-dark)' }}>
          <Plus size={11} /> Nova
        </button>
        <button onClick={() => fileInput.current?.click()} className="px-2 py-1.5 rounded text-[10px] font-semibold flex items-center gap-1" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
          <Upload size={11} /> Importar
        </button>
        <button onClick={exportarTudo} disabled={legendas.length === 0} className="px-2 py-1.5 rounded text-[10px] font-semibold flex items-center gap-1" style={{ background: '#1a3a6b', color: '#93c5fd', opacity: legendas.length === 0 ? 0.5 : 1 }}>
          <Download size={11} /> Exportar
        </button>
        <input ref={fileInput} type="file" accept=".json" className="hidden" onChange={importar} />
      </div>

      <input
        value={filtro} onChange={e => setFiltro(e.target.value)}
        placeholder="Filtrar por nome, atributo, fonte…"
        className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle}
      />

      {legendas.length === 0 && (
        <p className="text-[10px] py-4 text-center" style={{ color: '#64748b' }}>
          Nenhuma legenda cadastrada. Use Nova ou Importar.
        </p>
      )}

      {agrupadas.map(([fonte, lista]) => (
        <div key={fonte}>
          <div className="text-[9px] uppercase tracking-wider font-semibold mb-1 px-1" style={{ color: '#475569' }}>{fonte} · {lista.length}</div>
          <div className="space-y-1.5">
            {lista.map(l => (
              <div key={l.id} className="p-2 rounded-lg" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
                <div className="flex items-start gap-1.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <BookOpen size={11} style={{ color: '#93c5fd', flexShrink: 0 }} />
                      <span className="text-xs font-bold truncate" style={{ color: '#e2e8f0' }} title={l.nome}>{l.nome}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1 text-[9px]">
                      {l.escopo === 'sistema' && <Badge tone="sys">Sistema</Badge>}
                      <Badge>{l.atributo}{l.metodo ? ` · ${l.metodo}` : ''}</Badge>
                      <Badge>{l.unidade}</Badge>
                      <Badge tone="cat">{l.categoria}</Badge>
                      {l.invertida && <Badge tone="warn">invertida</Badge>}
                      <Badge tone="muted">{l.classes.length} classes</Badge>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    {l.escopo === 'sistema' ? (
                      <button onClick={() => duplicar(l)} title="Duplicar para editar (oficial é read-only)" className="p-1 rounded" style={{ color: '#93c5fd', background: '#1a3a6b' }}><Copy size={10} /></button>
                    ) : (
                      <>
                        <button onClick={() => onEditar(l.id)} title="Editar" className="p-1 rounded" style={{ color: '#93c5fd', background: '#1a3a6b' }}><Edit3 size={10} /></button>
                        <button onClick={() => duplicar(l)} title="Duplicar" className="p-1 rounded" style={{ color: '#93c5fd', background: '#1a3a6b' }}><Copy size={10} /></button>
                        <button onClick={() => excluir(l)} title="Excluir" className="p-1 rounded" style={{ color: '#f87171', background: '#1a3a6b' }}><Trash2 size={10} /></button>
                      </>
                    )}
                  </div>
                </div>
                {/* mini barra */}
                <div className="mt-1.5 h-2.5 rounded overflow-hidden" style={{ background: gradienteCssDaLegenda(l), border: '1px solid rgba(255,255,255,0.1)' }} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Badge({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'cat' | 'warn' | 'muted' | 'sys' }) {
  const bg = tone === 'warn' ? '#3a2300' : tone === 'cat' ? '#102a47' : tone === 'muted' ? '#0f1f3a' : tone === 'sys' ? '#064e3b' : '#1a3a6b';
  const fg = tone === 'warn' ? '#fbbf24' : tone === 'cat' ? '#7dd3fc' : tone === 'muted' ? '#64748b' : tone === 'sys' ? '#6ee7b7' : '#cbd5e1';
  return <span className="px-1.5 py-0.5 rounded font-semibold" style={{ background: bg, color: fg }}>{children}</span>;
}

// ============================================================
// EDITOR
// ============================================================

function novaLegendaVazia(): Omit<Legenda, 'id' | 'criadoEm' | 'atualizadoEm'> {
  return {
    nome: 'Nova legenda',
    atributoId: 'p',
    atributo: 'Fósforo',
    simbolo: 'P',
    unidade: 'mg/dm³',
    metodo: null,
    fonte: '',
    categoria: 'fertilidade',
    invertida: false,
    tipoEscala: 'gradiente',
    estilo: 'segmentado',
    classes: classesFertilidade5([6, 15, 40, 80]),
  };
}

function LegendaEditor({ legenda, onClose }: { legenda: Legenda | null; onClose: () => void }) {
  // edição ou criação
  const [form, setForm] = useState(() => legenda ? { ...legenda, classes: legenda.classes.map(c => ({ ...c })) } : novaLegendaVazia());
  const [aviso, setAviso] = useState('');

  function patch<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }
  function patchClasse(i: number, p: Partial<ClasseLegenda>) {
    setForm(f => ({ ...f, classes: f.classes.map((c, idx) => idx === i ? { ...c, ...p } : c) }));
  }
  function moverClasse(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= form.classes.length) return;
    setForm(f => {
      const arr = [...f.classes];
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...f, classes: arr.map((c, idx) => ({ ...c, ordem: idx + 1 })) };
    });
  }
  function addClasse() {
    setForm(f => ({
      ...f,
      classes: [...f.classes, { nome: 'Nova', valorMin: null, valorMax: null, corInicio: '#888888', corFim: '#444444', larguraVisual: 0, ordem: f.classes.length + 1 }],
    }));
  }
  function removerClasse(i: number) {
    setForm(f => ({ ...f, classes: f.classes.filter((_, idx) => idx !== i).map((c, idx) => ({ ...c, ordem: idx + 1 })) }));
  }
  function resetClasses5() {
    if (!confirm('Substituir as classes pelo padrão de 5 classes (cores oficiais)?')) return;
    setForm(f => ({ ...f, classes: classesFertilidade5([0, 0, 0, 0], f.invertida) }));
  }

  const somaLarguras = form.classes.reduce((a, c) => a + (Number(c.larguraVisual) || 0), 0);
  const somaOk = Math.abs(somaLarguras - 100) < 0.1;

  function salvar() {
    if (!form.nome.trim()) { setAviso('Nome é obrigatório.'); return; }
    if (form.classes.length < 2) { setAviso('A legenda precisa ter pelo menos 2 classes.'); return; }
    if (!somaOk) { setAviso(`Soma das larguras visuais deve ser 100% (atual: ${fmt(somaLarguras)}%).`); return; }
    if (legenda) {
      updateLegenda(legenda.id, form);
    } else {
      saveLegenda(form);
    }
    onClose();
  }

  return (
    <div className="px-3 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={onClose} className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: '#93c5fd' }}>
          <ChevronLeft size={12} /> Voltar
        </button>
        <button onClick={salvar} className="px-3 py-1.5 rounded text-[10px] font-bold text-white flex items-center gap-1" style={{ background: 'var(--invicta-green-dark)' }}>
          <Save size={11} /> {legenda ? 'Salvar' : 'Criar'}
        </button>
      </div>

      {aviso && <div className="p-2 rounded text-[10px] flex items-start gap-1.5" style={{ background: '#3a2300', color: '#fbbf24', border: '1px solid #92400e' }}><AlertTriangle size={11} /> {aviso}</div>}

      {/* Metadados */}
      <div className="space-y-2 p-2.5 rounded-lg" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
        <Field label="Nome">
          <input value={form.nome} onChange={e => patch('nome', e.target.value)} className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Atributo">
            <input value={form.atributo} onChange={e => patch('atributo', e.target.value)} className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle} />
          </Field>
          <Field label="Símbolo">
            <input value={form.simbolo} onChange={e => patch('simbolo', e.target.value)} className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle} />
          </Field>
        </div>
        <Field label="ID do atributo (casa com laboratório)">
          <select value={form.atributoId} onChange={e => patch('atributoId', e.target.value)} className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle}>
            {ELEMENTOS_LAB.map(el => <option key={el.id} value={el.id}>{el.id} · {el.simbolo}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Unidade">
            <input value={form.unidade} onChange={e => patch('unidade', e.target.value)} className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle} />
          </Field>
          <Field label="Método">
            <input value={form.metodo ?? ''} onChange={e => patch('metodo', e.target.value || null)} placeholder="(opcional)" className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Fonte">
            <input value={form.fonte} onChange={e => patch('fonte', e.target.value)} placeholder="Ex.: Fundação ABC" className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle} />
          </Field>
          <Field label="Categoria">
            <select value={form.categoria} onChange={e => patch('categoria', e.target.value as CategoriaLegenda)} className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle}>
              {CATEGORIAS_LEGENDA.map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Profundidade (opcional)">
            <input value={form.profundidade ?? ''} onChange={e => patch('profundidade', e.target.value || undefined)} placeholder="Ex.: 0-20" className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle} />
          </Field>
          <Field label="Escala invertida">
            <button onClick={() => patch('invertida', !form.invertida)} className="w-full rounded px-2 py-1 text-[11px] font-semibold flex items-center justify-center gap-1" style={{ background: form.invertida ? '#92400e' : '#1a3a6b', color: form.invertida ? '#fde68a' : '#cbd5e1' }}>
              {form.invertida ? <><Check size={11} /> Sim (toxidez)</> : 'Não'}
            </button>
          </Field>
        </div>
        {/* Domínio das pontas (evita o colapso das classes abertas no mapa) */}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Domínio mín (ponta inferior)">
            <input type="number" value={form.dominioMin ?? ''}
              onChange={e => patch('dominioMin', e.target.value === '' ? undefined : Number(e.target.value))}
              placeholder="auto" className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle} />
          </Field>
          <Field label="Domínio máx (ponta superior)">
            <input type="number" value={form.dominioMax ?? ''}
              onChange={e => patch('dominioMax', e.target.value === '' ? undefined : Number(e.target.value))}
              placeholder="auto" className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle} />
          </Field>
        </div>
        <p className="text-[9px] -mt-1" style={{ color: '#475569' }}>
          Limites de valor das classes abertas (ex.: NDVI 0–1, Textura/V%/m% 0–100). Em branco = meia-classe automática.
        </p>

        {/* Estilo da barra */}
        <Field label="Estilo da barra de cores">
          <div className="flex gap-1">
            {(['segmentado', 'continuo'] as EstiloLegenda[]).map(e => (
              <button key={e} onClick={() => patch('estilo', e)}
                className="flex-1 py-1 rounded text-[10px] font-bold"
                style={{ background: (form.estilo ?? 'segmentado') === e ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: (form.estilo ?? 'segmentado') === e ? '#fff' : '#64748b' }}>
                {e === 'segmentado' ? 'Segmentado' : 'Contínuo'}
              </button>
            ))}
          </div>
          <p className="text-[9px] mt-1" style={{ color: '#475569' }}>
            Só muda a aparência visual da barra. Não altera classes, limites, unidade, método, fonte ou escala invertida.
          </p>
        </Field>
      </div>

      {/* Classes */}
      <div className="space-y-2 p-2.5 rounded-lg" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold" style={{ color: '#93c5fd' }}>Classes ({form.classes.length})</span>
          <div className="flex gap-1">
            <button onClick={resetClasses5} title="Padrão 5 classes" className="px-2 py-1 rounded text-[9px] font-semibold" style={{ background: '#1a3a6b', color: '#93c5fd' }}>5 padrão</button>
            <button onClick={addClasse} className="px-2 py-1 rounded text-[9px] font-bold text-white" style={{ background: 'var(--invicta-blue)' }}>+ classe</button>
          </div>
        </div>

        {form.classes.map((c, i) => {
          const { inicio, fim } = paresDaClasse(c);
          return (
            <div key={i} className="p-2 rounded space-y-1.5" style={{ background: '#0b1d3a', border: '1px solid #1a3a6b' }}>
              <div className="flex items-center gap-1.5">
                <input value={c.nome} onChange={e => patchClasse(i, { nome: e.target.value })} className="flex-1 rounded px-2 py-1 text-[11px] outline-none" style={inputStyle} />
                <button onClick={() => moverClasse(i, -1)} disabled={i === 0} title="Subir" className="p-1 rounded" style={{ color: '#93c5fd', background: '#1a3a6b', opacity: i === 0 ? 0.4 : 1 }}><ArrowUp size={10} /></button>
                <button onClick={() => moverClasse(i, +1)} disabled={i === form.classes.length - 1} title="Descer" className="p-1 rounded" style={{ color: '#93c5fd', background: '#1a3a6b', opacity: i === form.classes.length - 1 ? 0.4 : 1 }}><ArrowDown size={10} /></button>
                <button onClick={() => removerClasse(i)} title="Remover" className="p-1 rounded" style={{ color: '#f87171', background: '#1a3a6b' }}><X size={10} /></button>
              </div>
              {/* mini barra da classe (claro → escuro) */}
              <div className="h-3 rounded overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)', background: `linear-gradient(to right, ${inicio}, ${fim})` }} />
              <div className="grid grid-cols-4 gap-1.5">
                <Field label="Cor início">
                  <input type="color" value={inicio} onChange={e => patchClasse(i, { corInicio: e.target.value, corBase: undefined })} className="w-full h-7 rounded cursor-pointer" style={{ border: '1px solid #2e5fa3', background: 'transparent' }} />
                </Field>
                <Field label="Cor fim">
                  <input type="color" value={fim} onChange={e => patchClasse(i, { corFim: e.target.value, corBase: undefined })} className="w-full h-7 rounded cursor-pointer" style={{ border: '1px solid #2e5fa3', background: 'transparent' }} />
                </Field>
                <Field label="Min">
                  <input type="number" step="any" value={c.valorMin ?? ''} onChange={e => patchClasse(i, { valorMin: e.target.value === '' ? null : Number(e.target.value) })} placeholder="(∞)" className="w-full rounded px-1.5 py-1 text-[10px] outline-none" style={inputStyle} />
                </Field>
                <Field label="Max">
                  <input type="number" step="any" value={c.valorMax ?? ''} onChange={e => patchClasse(i, { valorMax: e.target.value === '' ? null : Number(e.target.value) })} placeholder="(∞)" className="w-full rounded px-1.5 py-1 text-[10px] outline-none" style={inputStyle} />
                </Field>
              </div>
              <Field label="Largura visual %">
                <input type="number" step="0.1" min={0} max={100} value={c.larguraVisual} onChange={e => patchClasse(i, { larguraVisual: Number(e.target.value) || 0 })} className="w-full rounded px-1.5 py-1 text-[10px] outline-none" style={inputStyle} />
              </Field>
            </div>
          );
        })}

        <div className="text-[9px]" style={{ color: somaOk ? '#86efac' : '#fbbf24' }}>
          {somaOk ? '✓' : '⚠'} Soma das larguras: {fmt(somaLarguras)}% (precisa ser 100)
        </div>

        {/* prévia */}
        <div>
          <div className="text-[9px] mb-1" style={{ color: '#64748b' }}>Prévia (claro → escuro dentro de cada classe)</div>
          <div className="h-4 rounded overflow-hidden"
            style={{ border: '1px solid rgba(255,255,255,0.1)', background: gradienteCssDaLegenda({ ...form, id: 'preview', criadoEm: '', atualizadoEm: '' } as Legenda) }}
            title={form.classes.map(c => c.nome).join(' | ')} />
        </div>
      </div>

      <p className="text-[9px]" style={{ color: '#475569' }}>
        Pares oficiais (5 classes): {PARES_OFICIAIS_5.map(p => `${p.inicio}→${p.fim}`).join(' · ')}. Larguras: {LARGURAS_VISUAIS_5.join(' / ')}.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[9px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>{label}</label>
      {children}
    </div>
  );
}
