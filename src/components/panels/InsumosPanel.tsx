'use client';

// BIBLIOTECA DE INSUMOS (Parte XIV, etapa 1) — cadastro dos produtos que as
// prescrições usam. O que muda de verdade aqui é a GARANTIA: antes o produto
// era texto livre e o teor de cada nutriente não existia em lugar nenhum, o
// que impedia qualquer conta de complementação.
//
// Um formulário por categoria, porque o que se cadastra é diferente em cada
// uma: fertilizante tem garantia em %, orgânico tem garantia em kg/t mais
// umidade, semente tem PMS e germinação.

import { useMemo, useState } from 'react';
import { listar, criar, atualizar, excluir as excluirItem, type ItemBiblioteca } from '@/lib/biblioteca';
import {
  ROTULO_CATEGORIA, NUTRIENTES, SIMBOLO_NUTRIENTE, unidadePreco, precoNaUnidade,
  type CategoriaInsumo, type ConteudoInsumo, type GarantiasInsumo,
} from '@/lib/insumos';
import { fmtMoeda, lerMoeda, arredMoeda } from '@/lib/formato';
import { inputStyle } from '@/constants/ui';
import { Plus, Save, Trash2, Pencil, X, Package, AlertTriangle } from 'lucide-react';

const CATEGORIAS: CategoriaInsumo[] = ['fertilizante', 'corretivo', 'gesso', 'esterco', 'composto', 'semente', 'personalizado'];
const ehOrganico = (c: CategoriaInsumo) => c === 'esterco' || c === 'composto';
const temGarantiaPct = (c: CategoriaInsumo) => c === 'fertilizante' || c === 'corretivo' || c === 'gesso' || c === 'personalizado';
const MICROS: Array<keyof GarantiasInsumo> = ['b', 'zn', 'cu', 'mn', 'fe', 'mo'];
const fmt = (v?: number) => (v == null ? '' : String(v));
const num = (s: string): number | undefined => {
  const v = Number(s.replace(',', '.'));
  return s.trim() === '' || !isFinite(v) ? undefined : v;
};

interface Rascunho {
  id: string | null;
  nome: string;
  categoria: CategoriaInsumo;
  conteudo: ConteudoInsumo;
}

// O rascunho carrega o preço SEMPRE na unidade que a categoria mostra
// (unidadePreco); a conversão para/da unidade gravada acontece em editar() e
// salvar(), nas duas únicas fronteiras com a Biblioteca.
const vazio = (categoria: CategoriaInsumo): Rascunho => ({
  id: null, nome: '', categoria,
  conteudo: { categoria, garantias: {}, organico: {}, semente: {}, precoUnidade: unidadePreco(categoria) },
});

export function InsumosPanel() {
  const [cat, setCat] = useState<CategoriaInsumo>('fertilizante');
  const [tick, setTick] = useState(0);
  const [r, setR] = useState<Rascunho>(vazio('fertilizante'));
  const [erro, setErro] = useState('');

  const itens = useMemo(
    () => listar<ConteudoInsumo>('insumos').filter(i => i.conteudo?.categoria === cat),
    [cat, tick],
  );

  const set = (p: Partial<Rascunho>) => setR(x => ({ ...x, ...p }));
  const setC = (p: Partial<ConteudoInsumo>) => setR(x => ({ ...x, conteudo: { ...x.conteudo, ...p } }));
  const setG = (k: keyof GarantiasInsumo, v: string) => setC({ garantias: { ...r.conteudo.garantias, [k]: num(v) } });

  function trocarCategoria(c: CategoriaInsumo) { setCat(c); setR(vazio(c)); setErro(''); }

  function salvar() {
    setErro('');
    if (!r.nome.trim()) { setErro('Dê um nome ao insumo (ex.: "Ureia", "MAP", "KCl").'); return; }
    const conteudo: ConteudoInsumo = { ...r.conteudo, categoria: r.categoria, precoUnidade: unidadePreco(r.categoria) };
    if (r.id) atualizar<ConteudoInsumo>('insumos', r.id, { nome: r.nome.trim(), conteudo });
    // 'empresa' (e não o 'meu' padrão de `criar`): as equações e as prescrições
    // apontam para o insumo, e as duas são compartilhadas. Insumo privado seria
    // FK que só funciona para quem cadastrou — o segundo agrônomo abre a mesma
    // equação e o preço não existe para ele.
    else criar<ConteudoInsumo>('insumos', { nome: r.nome.trim(), conteudo, escopo: 'empresa' });
    setR(vazio(r.categoria));
    setTick(t => t + 1);
  }

  function editar(it: ItemBiblioteca<ConteudoInsumo>) {
    const u = unidadePreco(it.conteudo.categoria);
    setR({
      id: it.id, nome: it.nome, categoria: it.conteudo.categoria,
      // Cadastro antigo veio em R$/kg: sobe convertido e desce gravado em R$/t.
      conteudo: { garantias: {}, organico: {}, semente: {}, ...it.conteudo, precoMedio: precoNaUnidade(it.conteudo, u), precoUnidade: u },
    });
    setErro('');
  }

  function excluir(it: ItemBiblioteca<ConteudoInsumo>) {
    if (!confirm(`Excluir "${it.nome}"? As prescrições já salvas continuam com o produto que gravaram.`)) return;
    excluirItem('insumos', it.id);
    if (r.id === it.id) setR(vazio(cat));
    setTick(t => t + 1);
  }

  const g = r.conteudo.garantias ?? {};
  const org = r.conteudo.organico ?? {};
  const sem = r.conteudo.semente ?? {};

  return (
    <div className="p-3 space-y-3">
      {/* categorias */}
      <div className="flex flex-wrap gap-1">
        {CATEGORIAS.map(c => (
          <button key={c} onClick={() => trocarCategoria(c)}
            className="px-2 py-1 rounded text-[10px] font-semibold"
            style={{ background: cat === c ? 'var(--invicta-blue-mid)' : '#0f2240', color: cat === c ? '#fff' : '#93c5fd' }}>
            {ROTULO_CATEGORIA[c]}
          </button>
        ))}
      </div>

      {/* formulário */}
      <div className="p-2.5 rounded-lg space-y-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
        <div className="flex items-center gap-2">
          <Package size={13} style={{ color: '#93c5fd' }} />
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#cbd5e1' }}>
            {r.id ? 'Editar insumo' : `Novo em ${ROTULO_CATEGORIA[cat]}`}
          </span>
          {r.id && (
            <button onClick={() => setR(vazio(cat))} className="ml-auto text-[10px] font-semibold flex items-center gap-0.5" style={{ color: '#93c5fd' }}>
              cancelar <X size={10} />
            </button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Campo rotulo="Nome *">
            <input value={r.nome} onChange={e => set({ nome: e.target.value })}
              placeholder={cat === 'fertilizante' ? 'ex.: MAP, Ureia, KCl' : 'nome do produto'}
              className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
          </Campo>
          <Campo rotulo={`Preço médio (R$/${unidadePreco(cat)})`}>
            <InputMoeda valor={r.conteudo.precoMedio} onChange={v => setC({ precoMedio: v })} />
          </Campo>
          <Campo rotulo="Fornecedor">
            <input value={r.conteudo.fornecedor ?? ''} onChange={e => setC({ fornecedor: e.target.value })}
              className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
          </Campo>
        </div>

        {/* garantias em % — fertilizante, corretivo, gesso, personalizado */}
        {temGarantiaPct(cat) && (
          <div>
            <span className="text-[9px] font-semibold block mb-1" style={{ color: '#64748b' }}>
              Garantias (% em massa) — é daqui que sai o cálculo de quanto o produto entrega de cada nutriente
            </span>
            <div className="grid grid-cols-6 gap-1.5">
              {NUTRIENTES.map(n => (
                <Campo key={n} rotulo={`${SIMBOLO_NUTRIENTE[n]} (%)`}>
                  <input value={fmt(g[n])} onChange={e => setG(n, e.target.value)}
                    className="w-full rounded px-1.5 py-1 text-[11px] text-right outline-none" style={inputStyle} />
                </Campo>
              ))}
            </div>
            <span className="text-[9px] font-semibold block mt-1.5 mb-1" style={{ color: '#64748b' }}>Micronutrientes (%) — opcional</span>
            <div className="grid grid-cols-6 gap-1.5">
              {MICROS.map(m => (
                <Campo key={m} rotulo={`${String(m).toUpperCase()} (%)`}>
                  <input value={fmt(g[m])} onChange={e => setG(m, e.target.value)}
                    className="w-full rounded px-1.5 py-1 text-[11px] text-right outline-none" style={inputStyle} />
                </Campo>
              ))}
            </div>
          </div>
        )}

        {/* orgânicos — garantias em kg/t + umidade */}
        {ehOrganico(cat) && (
          <div>
            <span className="text-[9px] font-semibold block mb-1" style={{ color: '#64748b' }}>
              Garantias médias (kg por tonelada de produto) — valores de REFERÊNCIA: na prescrição dá para alterar sem mexer neste cadastro
            </span>
            <div className="grid grid-cols-5 gap-1.5">
              {(['n', 'p2o5', 'k2o', 'ca', 'mg'] as const).map(n => (
                <Campo key={n} rotulo={`${SIMBOLO_NUTRIENTE[n]} (kg/t)`}>
                  <input value={fmt(org.garantiasKgT?.[n])}
                    onChange={e => setC({ organico: { ...org, garantiasKgT: { ...org.garantiasKgT, [n]: num(e.target.value) } } })}
                    className="w-full rounded px-1.5 py-1 text-[11px] text-right outline-none" style={inputStyle} />
                </Campo>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-1.5">
              <Campo rotulo="Umidade (%)">
                <input value={fmt(org.umidadePct)} onChange={e => setC({ organico: { ...org, umidadePct: num(e.target.value) } })}
                  className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
              </Campo>
              <Campo rotulo="Matéria seca (%)">
                <input value={fmt(org.materiaSecaPct)} onChange={e => setC({ organico: { ...org, materiaSecaPct: num(e.target.value) } })}
                  className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
              </Campo>
              <Campo rotulo="Densidade (t/m³)">
                <input value={fmt(org.densidade)} onChange={e => setC({ organico: { ...org, densidade: num(e.target.value) } })}
                  className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
              </Campo>
            </div>
          </div>
        )}

        {/* sementes */}
        {cat === 'semente' && (
          <div className="grid grid-cols-4 gap-2">
            <Campo rotulo="Cultura"><input value={sem.cultura ?? ''} onChange={e => setC({ semente: { ...sem, cultura: e.target.value } })} className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} /></Campo>
            <Campo rotulo="Cultivar / Híbrido"><input value={sem.cultivar ?? ''} onChange={e => setC({ semente: { ...sem, cultivar: e.target.value } })} className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} /></Campo>
            <Campo rotulo="PMS (g)"><input value={fmt(sem.pmsG)} onChange={e => setC({ semente: { ...sem, pmsG: num(e.target.value) } })} className="w-full rounded px-2 py-1.5 text-xs text-right outline-none" style={inputStyle} /></Campo>
            <Campo rotulo="Germinação (%)"><input value={fmt(sem.germinacaoPct)} onChange={e => setC({ semente: { ...sem, germinacaoPct: num(e.target.value) } })} className="w-full rounded px-2 py-1.5 text-xs text-right outline-none" style={inputStyle} /></Campo>
            <Campo rotulo="Vigor (%)"><input value={fmt(sem.vigorPct)} onChange={e => setC({ semente: { ...sem, vigorPct: num(e.target.value) } })} className="w-full rounded px-2 py-1.5 text-xs text-right outline-none" style={inputStyle} /></Campo>
            <Campo rotulo="Peso da embalagem (kg)"><input value={fmt(sem.pesoEmbalagemKg)} onChange={e => setC({ semente: { ...sem, pesoEmbalagemKg: num(e.target.value) } })} className="w-full rounded px-2 py-1.5 text-xs text-right outline-none" style={inputStyle} /></Campo>
            <Campo rotulo="Sementes por embalagem"><input value={fmt(sem.sementesPorEmbalagem)} onChange={e => setC({ semente: { ...sem, sementesPorEmbalagem: num(e.target.value) } })} className="w-full rounded px-2 py-1.5 text-xs text-right outline-none" style={inputStyle} /></Campo>
          </div>
        )}

        <Campo rotulo="Observações">
          <input value={r.conteudo.observacoes ?? ''} onChange={e => setC({ observacoes: e.target.value })}
            className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
        </Campo>

        {erro && (
          <p className="text-[10px] flex items-start gap-1" style={{ color: '#f87171' }}>
            <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" /> {erro}
          </p>
        )}
        <button onClick={salvar} className="px-3 py-2 rounded text-[11px] font-bold text-white flex items-center gap-1.5" style={{ background: 'var(--invicta-green-dark)' }}>
          {r.id ? <><Save size={12} /> Salvar alterações</> : <><Plus size={12} /> Cadastrar insumo</>}
        </button>
      </div>

      {/* lista */}
      <div className="space-y-1">
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#cbd5e1' }}>
          {ROTULO_CATEGORIA[cat]} ({itens.length})
        </span>
        {itens.length === 0 && (
          <p className="text-[10px] py-2" style={{ color: '#64748b' }}>
            Nenhum insumo nesta categoria ainda. Cadastre acima — a Prescrição Variável só usa produtos daqui.
          </p>
        )}
        {itens.map(it => (
          <div key={it.id} className="px-2 py-1.5 rounded flex items-center gap-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate" style={{ color: '#e2e8f0' }}>{it.nome}</p>
              <p className="text-[9px]" style={{ color: '#64748b' }}>{resumoInsumo(it.conteudo)}</p>
            </div>
            <button onClick={() => editar(it)} title="Editar" className="p-1 rounded flex-shrink-0" style={{ background: '#1a3a6b', color: '#93c5fd' }}><Pencil size={11} /></button>
            <button onClick={() => excluir(it)} title="Excluir" className="p-1 rounded flex-shrink-0" style={{ color: '#f87171' }}><Trash2 size={11} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Linha de resumo: mostra o que o insumo ENTREGA, que é o que interessa. */
export function resumoInsumo(c: ConteudoInsumo): string {
  const partes: string[] = [];
  if (temGarantiaPct(c.categoria)) {
    const gs = NUTRIENTES.filter(n => (c.garantias?.[n] ?? 0) > 0)
      .map(n => `${SIMBOLO_NUTRIENTE[n]} ${c.garantias![n]}%`);
    partes.push(gs.length ? gs.join(' · ') : 'sem garantias declaradas');
  }
  if (ehOrganico(c.categoria)) {
    const gs = (['n', 'p2o5', 'k2o', 'ca', 'mg'] as const).filter(n => (c.organico?.garantiasKgT?.[n] ?? 0) > 0)
      .map(n => `${SIMBOLO_NUTRIENTE[n]} ${c.organico!.garantiasKgT![n]} kg/t`);
    partes.push(gs.length ? gs.join(' · ') : 'sem garantias declaradas');
    if (c.organico?.umidadePct != null) partes.push(`umidade ${c.organico.umidadePct}%`);
  }
  if (c.categoria === 'semente') {
    const s = c.semente ?? {};
    if (s.cultura || s.cultivar) partes.push([s.cultura, s.cultivar].filter(Boolean).join(' · '));
    if (s.pmsG) partes.push(`PMS ${s.pmsG} g`);
    if (s.germinacaoPct) partes.push(`germinação ${s.germinacaoPct}%`);
  }
  const u = unidadePreco(c.categoria);
  const preco = precoNaUnidade(c, u);
  if (preco != null) partes.push(`R$ ${fmtMoeda(preco)}/${u}`);
  if (c.fornecedor) partes.push(c.fornecedor);
  return partes.join(' · ') || '—';
}

/**
 * Campo de dinheiro: alinhado à direita e SEMPRE com duas casas ao sair
 * ("1.234,50"). Enquanto está em foco vale o texto cru — reformatar a cada
 * tecla joga o cursor para o fim e impede até digitar a vírgula, porque "350,"
 * vira "350" no meio da digitação.
 */
function InputMoeda({ valor, onChange }: { valor?: number; onChange: (v: number | undefined) => void }) {
  const [texto, setTexto] = useState<string | null>(null);
  const emFoco = (v?: number) => (v == null ? '' : fmtMoeda(v));
  return (
    <input
      value={texto ?? emFoco(valor)}
      inputMode="decimal"
      placeholder="0,00"
      onFocus={() => setTexto(emFoco(valor))}
      onChange={e => { setTexto(e.target.value); onChange(arredMoeda(lerMoeda(e.target.value))); }}
      onBlur={() => setTexto(null)}
      className="w-full rounded px-2 py-1.5 text-xs text-right outline-none" style={inputStyle} />
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[9px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>{rotulo}</span>
      {children}
    </label>
  );
}
