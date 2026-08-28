'use client';

// BIBLIOTECA → EXPORTAÇÃO DE NUTRIENTES — quanto de cada nutriente sai do
// talhão dentro do grão, por tonelada colhida.
//
// É o cadastro que alimenta o mapa de exportação do relatório de produtividade.
// Os coeficientes são em ELEMENTO (P, K) — decisão do usuário em 27/08/2026,
// para acompanhar a literatura de absorção/exportação. A GARANTIA DO
// FERTILIZANTE continua em óxido (P₂O₅, K₂O), que é o que a lei manda estampar
// no saco; quem cruza os dois converte na hora (ver lib/nutrienteBase.ts).
// O cadastro que já existia foi convertido uma vez por
// store.migrarExportacaoElementarV1, com marca no registro para não repetir.
//
// Os coeficientes dependem da UMIDADE de referência — daí o campo: um
// coeficiente medido a 13% não descreve grão a 20%.
//
// A casa semeia valores de literatura como escopo Sistema; eles são editáveis
// e cada item declara a fonte, porque a referência adotada é decisão
// agronômica de cada consultoria, não da plataforma.

import { useEffect, useMemo, useState } from 'react';
import { listar, criar, atualizar, excluir as excluirItem, type ItemBiblioteca, type ConteudoExportacao } from '@/lib/biblioteca';
import { NUTRIENTES, type Nutriente } from '@/lib/insumos';
import { SIMBOLO_ELEMENTO } from '@/lib/nutrienteBase';
import { CULTURAS } from '@/lib/store';
import { inputStyle } from '@/constants/ui';
import { Plus, Save, Trash2, Pencil, X, Recycle } from 'lucide-react';

type Item = ItemBiblioteca<ConteudoExportacao>;

const vazio = (): ConteudoExportacao => ({
  culturaId: 'soja', parteColhida: 'grão', umidadePct: 13, coeficientes: {}, fonte: '',
});

export function ExportacaoPanel() {
  const [itens, setItens] = useState<Item[]>([]);
  const [editando, setEditando] = useState<Item | null>(null);
  const [novo, setNovo] = useState(false);
  const [nome, setNome] = useState('');
  const [c, setC] = useState<ConteudoExportacao>(vazio());

  const recarregar = () => setItens(listar<ConteudoExportacao>('exportacao'));
  useEffect(() => {
    recarregar();
    // O save() da Biblioteca dispara este evento — outro painel (ou outra aba)
    // editando o mesmo cadastro reflete aqui sem F5.
    const h = (e: Event) => { if ((e as CustomEvent).detail?.slug === 'exportacao') recarregar(); };
    window.addEventListener('inv:biblioteca', h);
    return () => window.removeEventListener('inv:biblioteca', h);
  }, []);

  const ordenados = useMemo(
    () => [...itens].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [itens],
  );

  function abrirNovo() {
    setNovo(true); setEditando(null); setNome(''); setC(vazio());
  }
  function abrirEdicao(it: Item) {
    setNovo(false); setEditando(it); setNome(it.nome); setC({ ...vazio(), ...it.conteudo });
  }
  function fechar() { setNovo(false); setEditando(null); }

  function salvar() {
    const limpo: ConteudoExportacao = {
      ...c,
      culturaId: (c.culturaId || 'outra').toLowerCase(),
      // O que se digita aqui é ELEMENTO (P, K) — a marca impede que a migração
      // de conversão (store.migrarExportacaoElementarV1) mexa nestes números.
      baseElemento: true,
      // Coeficiente vazio é AUSENTE, não zero: zero declarado significa "esta
      // cultura não exporta este nutriente", que é outra afirmação.
      coeficientes: Object.fromEntries(
        Object.entries(c.coeficientes).filter(([, v]) => Number.isFinite(v)),
      ) as ConteudoExportacao['coeficientes'],
      coeficientesExtracao: Object.fromEntries(
        Object.entries(c.coeficientesExtracao ?? {}).filter(([, v]) => Number.isFinite(v)),
      ) as ConteudoExportacao['coeficientesExtracao'],
    };
    if (editando) atualizar<ConteudoExportacao>('exportacao', editando.id, { nome, conteudo: limpo });
    else criar<ConteudoExportacao>('exportacao', { nome: nome || 'Sem nome', conteudo: limpo, escopo: 'empresa' });
    fechar(); recarregar();
  }

  function remover(it: Item) {
    if (!confirm(`Excluir "${it.nome}"?`)) return;
    excluirItem('exportacao', it.id);
    recarregar();
  }

  const setCoef = (base: 'coeficientes' | 'coeficientesExtracao', n: Nutriente, txt: string) => {
    const v = txt.trim() === '' ? undefined : Number(txt.replace(',', '.'));
    setC(x => ({ ...x, [base]: { ...(x[base] ?? {}), [n]: Number.isFinite(v) ? v : undefined } }));
  };

  const editorAberto = novo || !!editando;

  return (
    <div className="p-3 space-y-2">
      {!editorAberto && (
        <button onClick={abrirNovo}
          className="w-full py-1.5 rounded text-[11px] font-bold flex items-center justify-center gap-1 text-white"
          style={{ background: 'var(--invicta-blue-mid)' }}>
          <Plus size={12} /> Nova cultura
        </button>
      )}

      {editorAberto && (
        <div className="rounded-lg p-2.5 space-y-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold" style={{ color: '#93c5fd' }}>
              {editando ? 'Editar' : 'Nova'} — exportação por tonelada
            </p>
            <button onClick={fechar} style={{ color: '#94a3b8' }}><X size={13} /></button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Campo label="Nome">
              <input value={nome} onChange={e => setNome(e.target.value)} placeholder="ex.: Soja — grão"
                className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle} />
            </Campo>
            <Campo label="Cultura">
              <select value={c.culturaId} onChange={e => setC(x => ({ ...x, culturaId: e.target.value }))}
                className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle}>
                {CULTURAS.map(k => <option key={k} value={k.toLowerCase()}>{k}</option>)}
              </select>
            </Campo>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Campo label="Parte colhida">
              <input value={c.parteColhida ?? ''} onChange={e => setC(x => ({ ...x, parteColhida: e.target.value }))}
                placeholder="grão" className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle} />
            </Campo>
            <Campo label="Umidade de referência (%)">
              <input type="number" value={c.umidadePct ?? ''} onChange={e => setC(x => ({ ...x, umidadePct: e.target.value === '' ? undefined : Number(e.target.value) }))}
                className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle} />
            </Campo>
          </div>

          <div>
            <p className="text-[10px] font-semibold mb-1" style={{ color: '#64748b' }}>
              EXPORTAÇÃO — kg por tonelada colhida que sai do talhão no grão (elemento: P, K)
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {NUTRIENTES.map(n => (
                <Campo key={n} label={SIMBOLO_ELEMENTO[n]}>
                  <input type="number" step="0.1" value={c.coeficientes[n] ?? ''}
                    onChange={e => setCoef('coeficientes', n, e.target.value)}
                    className="w-full rounded px-1.5 py-1 text-[11px] outline-none" style={inputStyle} />
                </Campo>
              ))}
            </div>
            <p className="text-[9px] mt-1" style={{ color: '#64748b' }}>
              Em branco = não declarado. Zero = declarado como zero — são coisas diferentes no relatório.
            </p>
          </div>

          <div>
            <p className="text-[10px] font-semibold mb-1" style={{ color: '#64748b' }}>
              EXTRAÇÃO — kg por tonelada colhida absorvidos pela planta inteira (grão + palhada), em elemento
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {NUTRIENTES.map(n => (
                <Campo key={n} label={SIMBOLO_ELEMENTO[n]}>
                  <input type="number" step="0.1" value={c.coeficientesExtracao?.[n] ?? ''}
                    onChange={e => setCoef('coeficientesExtracao', n, e.target.value)}
                    className="w-full rounded px-1.5 py-1 text-[11px] outline-none" style={inputStyle} />
                </Campo>
              ))}
            </div>
            <p className="text-[9px] mt-1" style={{ color: '#64748b' }}>
              Opcional, e sempre maior que a exportação. Serve para dimensionar a DEMANDA da cultura —
              não para repor: a palhada fica no talhão e devolve boa parte ao solo.
            </p>
          </div>

          <Campo label="Fonte">
            <input value={c.fonte ?? ''} onChange={e => setC(x => ({ ...x, fonte: e.target.value }))}
              placeholder="ex.: Boletim 100 (IAC)" className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle} />
          </Campo>

          <div className="flex gap-2">
            <button onClick={fechar} className="flex-1 py-1.5 rounded text-[11px] font-bold" style={{ background: '#1a3a6b', color: '#93c5fd' }}>Cancelar</button>
            <button onClick={salvar} className="flex-1 py-1.5 rounded text-[11px] font-bold text-white flex items-center justify-center gap-1" style={{ background: 'var(--invicta-blue-mid)' }}>
              <Save size={12} /> Salvar
            </button>
          </div>
        </div>
      )}

      {ordenados.length === 0 && !editorAberto && (
        <p className="text-[10px] text-center py-4" style={{ color: '#64748b' }}>
          Nenhuma cultura cadastrada.
        </p>
      )}

      <div className="space-y-1">
        {ordenados.map(it => {
          const co = it.conteudo?.coeficientes ?? {};
          const usados = NUTRIENTES.filter(n => Number.isFinite(co[n]));
          return (
            <div key={it.id} className="flex items-start gap-2 p-2 rounded-lg" style={{ background: '#0b1f3a', border: '1px solid #1a3a6b' }}>
              <Recycle size={12} style={{ color: '#86efac' }} className="flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold truncate" style={{ color: '#e2e8f0' }}>
                  {it.nome}
                  {it.escopo === 'sistema' && (
                    <span className="ml-1 px-1 rounded text-[8px] font-bold" style={{ background: '#1e3a5f', color: '#93c5fd' }}>SISTEMA</span>
                  )}
                </p>
                <p className="text-[9px]" style={{ color: '#94a3b8' }}>
                  {usados.length
                    ? usados.map(n => `${SIMBOLO_ELEMENTO[n]} ${co[n]}`).join(' · ') + ' kg/t'
                    : 'sem coeficiente declarado'}
                  {NUTRIENTES.some(n => Number.isFinite(it.conteudo?.coeficientesExtracao?.[n])) && ' · com extração'}
                </p>
                {it.conteudo?.fonte && <p className="text-[9px] truncate" style={{ color: '#64748b' }}>{it.conteudo.fonte}</p>}
              </div>
              <button onClick={() => abrirEdicao(it)} title="Editar" style={{ color: '#cbd5e1' }}><Pencil size={12} /></button>
              <button onClick={() => remover(it)} title="Excluir" style={{ color: '#f87171' }}><Trash2 size={12} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-[9px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>{label}</label>{children}</div>;
}
