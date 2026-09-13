'use client';

// BIBLIOTECA → ANÁLISES FOLIARES (ledger 21 e 22).
//
// A tela rica da categoria. O que ela existe para NÃO deixar acontecer:
//
//  1. NORMA SEM PROCEDÊNCIA NA TELA. A tabela clássica Sfredo/Embrapa entra de
//     fábrica com a ressalva "valores amplamente reproduzidos na literatura,
//     não conferidos na fonte primária nesta versão" dentro de `avisos`. Um
//     `ConteudoGenerico` (editor de JSON) deixaria essa ressalva enterrada num
//     campo que ninguém abre. Aqui ela é ALERTA, no topo do detalhe, em
//     vermelho, sempre visível — é o `avisos` que viaja junto da norma.
//  2. NORMA DE FÁBRICA EDITADA POR ENGANO. Os itens de escopo `sistema` têm id
//     FIXO e são regravados pela semeadura; editá-los é trabalho perdido e, na
//     nuvem, trabalho perdido em todas as máquinas. Fábrica aqui só DUPLICA.
//  3. ÓRGÃO INVISÍVEL. Órgão e estádio são o que dá validade à norma (ledger
//     19) — vão no cabeçalho de cada item, não num detalhe escondido.
//
// A edição de faixas é deliberadamente a ÚNICA edição oferecida: faixa de
// suficiência é um par de números com significado direto. Média/DP/CV dos pares
// duais saem do gerador, com teste F — digitar à mão ali seria inventar norma,
// que é exatamente o que o ledger 17 proíbe.

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Edit3, Power, Trash2, Save, X, AlertTriangle } from 'lucide-react';
import {
  CATEGORIAS, listar, atualizar, excluir, ativar, duplicar,
  type CategoriaBiblioteca, type EscopoBiblioteca, type ItemBiblioteca,
} from '@/lib/biblioteca';
import { NUTRIENTES, ROTULO_ORGAO, unidadeDe, type NormaDris, type NutrienteId } from '@/lib/foliar';
import { inputStyle } from '@/constants/ui';

const SLUG: CategoriaBiblioteca = 'analises-foliares';

const ROTULO_ORIGEM: Record<NormaDris['origem'], string> = {
  literatura: 'Literatura',
  gerada: 'Gerada do banco',
  importada: 'Importada',
};

const COR_ORIGEM: Record<NormaDris['origem'], string> = {
  literatura: '#93c5fd',
  gerada: '#4ade80',
  importada: '#fbbf24',
};

export function ConteudoAnalisesFoliares() {
  const def = CATEGORIAS.find(c => c.slug === SLUG)!;
  const Icon = def.icone;
  const [aba, setAba] = useState<EscopoBiblioteca>('sistema');
  const [refresh, setRefresh] = useState(0);
  const [aberto, setAberto] = useState<string | null>(null);
  const [editando, setEditando] = useState<ItemBiblioteca<NormaDris> | null>(null);

  useEffect(() => {
    const onCh = (e: Event) => {
      const d = (e as CustomEvent).detail as { slug?: CategoriaBiblioteca } | undefined;
      if (!d?.slug || d.slug === SLUG) setRefresh(x => x + 1);
    };
    if (typeof window !== 'undefined') window.addEventListener('inv:biblioteca', onCh);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('inv:biblioteca', onCh); };
  }, []);

  const itens = useMemo(
    () => listar<NormaDris>(SLUG, aba).filter(i => !!i.conteudo),
    [aba, refresh], // eslint-disable-line react-hooks/exhaustive-deps
  );

  function duplicarItem(it: ItemBiblioteca<NormaDris>) {
    duplicar<NormaDris>(SLUG, it.id);
    setAba('meu');
  }
  function excluirItem(it: ItemBiblioteca<NormaDris>) {
    if (!confirm(`Excluir a norma "${it.nome}"? As diagnoses já gravadas continuam intactas (elas guardam o resultado, não a norma).`)) return;
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
        {([
          { id: 'sistema', label: 'De fábrica' },
          { id: 'empresa', label: 'Empresa' },
          { id: 'meu', label: 'Minhas' },
        ] as { id: EscopoBiblioteca; label: string }[]).map(t => (
          <button key={t.id} onClick={() => setAba(t.id)}
            className="flex-1 py-1 rounded text-[10px] font-bold"
            style={{ background: aba === t.id ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: aba === t.id ? '#fff' : '#64748b' }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
        {itens.length === 0 ? (
          <div className="text-center py-8 px-4">
            <p className="text-[10px]" style={{ color: '#64748b' }}>
              Nenhuma norma aqui. As normas próprias nascem no painel <strong>Foliar → Gerar norma</strong>,
              a partir dos seus laudos cruzados com os mapas de colheita.
            </p>
          </div>
        ) : itens.map(it => (
          <ItemNorma
            key={it.id}
            item={it}
            aberto={aberto === it.id}
            onToggle={() => setAberto(aberto === it.id ? null : it.id)}
            onDuplicar={() => duplicarItem(it)}
            onEditar={() => setEditando(it)}
            onAtivar={() => ativar(SLUG, it.id, !it.ativo)}
            onExcluir={() => excluirItem(it)}
          />
        ))}

        {aba === 'sistema' && itens.length > 0 && (
          <p className="text-[9px] mt-3 px-1" style={{ color: '#475569' }}>
            Normas de fábrica são regravadas pela semeadura (têm id fixo) — por isso só permitem DUPLICAR.
            Duplique para obter uma cópia própria e editável.
          </p>
        )}
      </div>

      {editando && <EditorFaixas item={editando} onClose={() => setEditando(null)} />}
    </section>
  );
}

// ── Um item da lista, com o detalhe embutido ────────────────────────────────

function ItemNorma({
  item, aberto, onToggle, onDuplicar, onEditar, onAtivar, onExcluir,
}: {
  item: ItemBiblioteca<NormaDris>;
  aberto: boolean;
  onToggle: () => void;
  onDuplicar: () => void;
  onEditar: () => void;
  onAtivar: () => void;
  onExcluir: () => void;
}) {
  const n = item.conteudo;
  const fabrica = item.escopo === 'sistema';
  const avisos = n.avisos ?? [];
  const faixas = n.faixas ?? null;
  const nutrientesComFaixa = NUTRIENTES.filter(id => faixas?.[id]);

  return (
    <div className="rounded-lg overflow-hidden" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
      <div className="flex items-start gap-1.5 p-2">
        <button onClick={onToggle} className="p-0.5 rounded hover:bg-white/10 mt-0.5" style={{ color: '#64748b' }}>
          {aberto ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onToggle}>
          <div className="text-[11px] font-bold truncate" style={{ color: '#e2e8f0' }}>{item.nome}</div>
          <div className="text-[9px] truncate" style={{ color: '#94a3b8' }}>
            {n.cultura} · {ROTULO_ORGAO[n.orgao]} · {n.estadio}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-[8px] font-bold px-1 rounded"
              style={{ background: COR_ORIGEM[n.origem] + '22', color: COR_ORIGEM[n.origem] }}>
              {ROTULO_ORIGEM[n.origem]}
            </span>
            <span className="text-[8px]" style={{ color: '#64748b' }}>
              n = {n.n ?? '—'} · {n.pares?.length ?? 0} pares · {nutrientesComFaixa.length} faixas
            </span>
            {!item.ativo && (
              <span className="text-[8px] font-bold px-1 rounded" style={{ background: '#1a3a6b', color: '#94a3b8' }}>inativa</span>
            )}
            {avisos.length > 0 && (
              <span className="text-[8px] font-bold px-1 rounded flex items-center gap-0.5"
                style={{ background: '#3f1d1d', color: '#fca5a5' }}>
                <AlertTriangle size={8} />{avisos.length}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button onClick={onDuplicar} title="Duplicar" className="p-1 rounded hover:bg-white/10" style={{ color: '#93c5fd' }}>
            <Copy size={11} />
          </button>
          {!fabrica && (
            <>
              <button onClick={onEditar} title="Editar faixas" className="p-1 rounded hover:bg-white/10" style={{ color: '#93c5fd' }}>
                <Edit3 size={11} />
              </button>
              <button onClick={onAtivar} title={item.ativo ? 'Inativar' : 'Ativar'} className="p-1 rounded hover:bg-white/10"
                style={{ color: item.ativo ? '#fbbf24' : '#22c55e' }}>
                <Power size={11} />
              </button>
              <button onClick={onExcluir} title="Excluir" className="p-1 rounded hover:bg-white/10" style={{ color: '#f87171' }}>
                <Trash2 size={11} />
              </button>
            </>
          )}
        </div>
      </div>

      {aberto && (
        <div className="px-2 pb-2 space-y-2" style={{ borderTop: '1px solid #0f2240' }}>
          {/* ALERTA — a ressalva de procedência tem de chegar à tela */}
          {avisos.map((a, i) => (
            <div key={i} className="flex items-start gap-1.5 p-2 rounded mt-2"
              style={{ background: '#3f1d1d', border: '1px solid #7f1d1d' }}>
              <AlertTriangle size={11} style={{ color: '#f87171', flexShrink: 0, marginTop: 1 }} />
              <p className="text-[9px] leading-snug" style={{ color: '#fecaca' }}>{a}</p>
            </div>
          ))}

          <div className="pt-2">
            <p className="text-[8px] font-bold uppercase tracking-wider" style={{ color: '#64748b' }}>Fonte</p>
            <p className="text-[9px] leading-snug" style={{ color: '#94a3b8' }}>{n.fonte}</p>
            <p className="text-[9px] mt-1" style={{ color: '#475569' }}>
              Critério de corte: {n.criterioCorte || '—'} · versão {item.versao}
            </p>
          </div>

          {nutrientesComFaixa.length > 0 && (
            <div>
              <p className="text-[8px] font-bold uppercase tracking-wider mb-0.5" style={{ color: '#64748b' }}>
                Faixas de suficiência
              </p>
              <div className="grid grid-cols-2 gap-x-3">
                {nutrientesComFaixa.map(id => {
                  const f = faixas?.[id];
                  if (!f) return null;
                  return (
                    <div key={id} className="flex items-baseline justify-between">
                      <span className="text-[10px] font-bold" style={{ color: '#93c5fd' }}>{id}</span>
                      <span className="text-[9px]" style={{ color: '#94a3b8' }}>
                        {f.min}–{f.max} {unidadeDe(id)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {n.pares?.length ? (
            <div>
              <p className="text-[8px] font-bold uppercase tracking-wider mb-0.5" style={{ color: '#64748b' }}>
                Pares duais ({n.pares.length})
              </p>
              <div className="overflow-auto" style={{ maxHeight: 160 }}>
                <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Par', 'Média', 'DP', 'CV%', 'F'].map(h => (
                        <th key={h} className="sticky top-0 text-right px-1 py-0.5 text-[8px] font-bold"
                          style={{ background: '#061525', color: '#64748b' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {n.pares.map(p => (
                      <tr key={`${p.a}/${p.b}`}>
                        <td className="px-1 text-[9px] font-bold text-left" style={{ color: '#e2e8f0' }}>{p.a}/{p.b}</td>
                        <td className="px-1 text-[9px] text-right" style={{ color: '#94a3b8' }}>{p.media.toFixed(3)}</td>
                        <td className="px-1 text-[9px] text-right" style={{ color: '#94a3b8' }}>{p.dp.toFixed(3)}</td>
                        <td className="px-1 text-[9px] text-right" style={{ color: '#94a3b8' }}>{p.cv.toFixed(1)}</td>
                        <td className="px-1 text-[9px] text-right" style={{ color: '#93c5fd' }}>{p.f == null ? '—' : p.f.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-[9px]" style={{ color: '#475569' }}>
              Sem pares duais: esta norma não faz DRIS, só faixa de suficiência. As normas de literatura
              publicam as tabelas de razões como imagem, e digitá-las &quot;de olho&quot; seria inventar número —
              o DRIS de verdade vem do gerador, com o seu próprio banco.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Editor de faixas ────────────────────────────────────────────────────────

function EditorFaixas({ item, onClose }: { item: ItemBiblioteca<NormaDris>; onClose: () => void }) {
  const [nome, setNome] = useState(item.nome);
  const [valores, setValores] = useState<Record<string, { min: string; max: string }>>(() => {
    const out: Record<string, { min: string; max: string }> = {};
    for (const id of NUTRIENTES) {
      const f = item.conteudo.faixas?.[id];
      out[id] = { min: f ? String(f.min) : '', max: f ? String(f.max) : '' };
    }
    return out;
  });
  const [erro, setErro] = useState('');

  function salvar() {
    const faixas: Partial<Record<NutrienteId, { min: number; max: number }>> = {};
    for (const id of NUTRIENTES) {
      const { min, max } = valores[id];
      if (!min.trim() && !max.trim()) continue;         // nutriente sem faixa: some da norma
      const lo = Number(String(min).replace(',', '.'));
      const hi = Number(String(max).replace(',', '.'));
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) { setErro(`Faixa de ${id} incompleta.`); return; }
      if (lo >= hi) { setErro(`Faixa de ${id} invertida (mínimo ≥ máximo).`); return; }
      faixas[id] = { min: lo, max: hi };
    }
    atualizar<NormaDris>(SLUG, item.id, {
      nome: nome.trim() || item.nome,
      // A norma inteira é reescrita com as faixas novas; pares, clr e chance
      // ficam INTACTOS — eles vêm do gerador, não da digitação.
      conteudo: { ...item.conteudo, faixas: Object.keys(faixas).length ? faixas : null },
    });
    onClose();
  }

  return (
    <div className="absolute inset-0 z-20 flex flex-col" style={{ background: 'var(--invicta-blue-dark)' }}>
      <div className="flex items-center justify-between px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid #1a3a6b' }}>
        <h4 className="text-[11px] font-bold uppercase" style={{ color: '#e2e8f0' }}>Editar faixas</h4>
        <button onClick={onClose} className="p-1 rounded hover:bg-white/10"><X size={13} style={{ color: '#94a3b8' }} /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        <div>
          <label className="text-[9px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Nome</label>
          <input value={nome} onChange={e => setNome(e.target.value)}
            className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle} />
        </div>
        <p className="text-[9px]" style={{ color: '#475569' }}>
          Deixe os dois campos vazios para o nutriente sair da norma — faixa em branco é &quot;não avaliado&quot;,
          e é mais honesto que uma faixa chutada.
        </p>
        {NUTRIENTES.map(id => (
          <div key={id} className="flex items-center gap-2">
            <span className="text-[10px] font-bold w-8" style={{ color: '#93c5fd' }}>{id}</span>
            <input value={valores[id].min} placeholder="mín"
              onChange={e => setValores(v => ({ ...v, [id]: { ...v[id], min: e.target.value } }))}
              className="flex-1 min-w-0 rounded px-2 py-1 text-[10px] outline-none" style={inputStyle} />
            <input value={valores[id].max} placeholder="máx"
              onChange={e => setValores(v => ({ ...v, [id]: { ...v[id], max: e.target.value } }))}
              className="flex-1 min-w-0 rounded px-2 py-1 text-[10px] outline-none" style={inputStyle} />
            <span className="text-[9px] w-10" style={{ color: '#64748b' }}>{unidadeDe(id)}</span>
          </div>
        ))}
        {erro && <p className="text-[9px]" style={{ color: '#f87171' }}>{erro}</p>}
      </div>
      <div className="px-3 py-2 flex-shrink-0" style={{ borderTop: '1px solid #1a3a6b' }}>
        <button onClick={salvar}
          className="w-full py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1"
          style={{ background: 'var(--invicta-green-dark)' }}>
          <Save size={11} /> Salvar faixas
        </button>
      </div>
    </div>
  );
}
