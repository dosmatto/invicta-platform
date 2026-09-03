'use client';

// EDITOR DE CUSTOS DO PRODUTOR (e da fazenda) — aba Dados.
//
// Sobrepõe a Biblioteca sem alterá-la: o campo em branco mostra, em cinza, o
// valor herdado e continua herdando; digitar passa a mandar para este produtor
// (ou fazenda) naquele ano/semestre. Limpar o campo devolve a herança.
//
// Nada é copiado da Biblioteca para dentro do produtor no momento em que a tela
// abre: cópia silenciosa é como preço velho sobrevive a uma atualização de
// tabela. O que não foi digitado não existe aqui.
//
// A regra de quem vence está em lib/custosProdutor.ts (pura, testada).

import { useEffect, useMemo, useState } from 'react';
import { listar, type ItemBiblioteca } from '@/lib/biblioteca';
import { precoNaUnidade, type ConteudoInsumo } from '@/lib/insumos';
import {
  getCustosProdutor, salvarCustosProdutor, precoResolvidoDoInsumo, custoLavouraDoContexto,
} from '@/lib/store';
import { linhasAplicaveis, ROTULO_NIVEL, type CustosNivel } from '@/lib/custosProdutor';
import type { Epoca } from '@/lib/periodo';
import { Save, RotateCcw } from 'lucide-react';

const inputSt = { background: '#0f2240', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;
const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numDe = (txt: string): number | null => {
  const t = txt.trim().replace(/\./g, '').replace(',', '.');
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
};

export function CustosProdutorEditor({ clienteId, fazendaId, ano }: {
  clienteId: string;
  /** Preenchido = edita o nível FAZENDA (vence o do produtor). */
  fazendaId?: string | null;
  ano: number;
}) {
  const [epoca, setEpoca] = useState<Epoca | ''>('');
  const [tick, setTick] = useState(0);
  const [msg, setMsg] = useState('');

  const insumos = useMemo(
    () => listar<ConteudoInsumo>('insumos').filter(i => i.ativo !== false)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [tick]);

  const chave = useMemo(
    () => ({ clienteId, fazendaId: fazendaId ?? null, ano, epoca: (epoca || null) as Epoca | null }),
    [clienteId, fazendaId, ano, epoca]);

  // A linha DESTE escopo exato — é ela que os campos editam.
  const linha = useMemo(() => getCustosProdutor(clienteId).find(l =>
    (l.fazendaId ?? null) === (fazendaId ?? null) && l.ano === ano && (l.epoca ?? null) === (epoca || null),
  ) ?? null, [clienteId, fazendaId, ano, epoca, tick]);   // eslint-disable-line react-hooks/exhaustive-deps

  // …e o que VALE no contexto (pode vir de um nível acima), para mostrar em cinza.
  const herdadas = useMemo(() => linhasAplicaveis(getCustosProdutor(clienteId), {
    clienteId, fazendaId, ano, epoca: (epoca || null) as Epoca | null,
  }), [clienteId, fazendaId, ano, epoca, tick]);   // eslint-disable-line react-hooks/exhaustive-deps

  const [rascunho, setRascunho] = useState<Record<string, { preco: string; aplic: string }>>({});
  const [aplicPadrao, setAplicPadrao] = useState('');
  const [custoLavoura, setCustoLavoura] = useState('');

  // Recarrega os campos ao trocar de escopo (semestre, fazenda, ano).
  useEffect(() => {
    const r: Record<string, { preco: string; aplic: string }> = {};
    for (const [id, v] of Object.entries(linha?.insumos ?? {})) {
      r[id] = {
        preco: v.precoT == null ? '' : String(v.precoT).replace('.', ','),
        aplic: v.aplicacaoHa == null ? '' : String(v.aplicacaoHa).replace('.', ','),
      };
    }
    setRascunho(r);
    setAplicPadrao(linha?.aplicacaoPadraoHa == null ? '' : String(linha.aplicacaoPadraoHa).replace('.', ','));
    setCustoLavoura(linha?.custoLavouraHa == null ? '' : String(linha.custoLavouraHa).replace('.', ','));
  }, [linha]);

  function salvar() {
    const insumosPatch: Record<string, CustosNivel> = {};
    for (const [id, v] of Object.entries(rascunho)) {
      const preco = numDe(v.preco), aplic = numDe(v.aplic);
      if (preco == null && aplic == null) continue;   // nada digitado = não grava (segue herdando)
      insumosPatch[id] = {
        ...(preco != null ? { precoT: preco } : {}),
        ...(aplic != null ? { aplicacaoHa: aplic } : {}),
      };
    }
    salvarCustosProdutor(chave, {
      insumos: Object.keys(insumosPatch).length ? insumosPatch : undefined,
      aplicacaoPadraoHa: numDe(aplicPadrao),
      custoLavouraHa: numDe(custoLavoura),
    });
    setTick(t => t + 1);
    setMsg('Salvo. Os relatórios deste produtor passam a usar estes valores.');
    setTimeout(() => setMsg(''), 4000);
  }

  const custoVigente = custoLavouraDoContexto({ clienteId, fazendaId, ano, epoca: (epoca || null) as Epoca | null });
  const nivel = fazendaId ? 'fazenda' : 'produtor';

  return (
    <div className="p-3 space-y-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#93c5fd' }}>
          Custos {nivel === 'fazenda' ? 'desta fazenda' : 'deste produtor'} — {ano}
        </p>
        <p className="text-[10px] mt-0.5" style={{ color: '#64748b' }}>
          Campo em branco usa o valor da Biblioteca (mostrado em cinza). O que você digitar vale
          {nivel === 'fazenda' ? ' só para esta fazenda' : ' para este produtor'} neste período —
          e é o que os relatórios passam a usar. Zero é zero de verdade: entra na conta como R$ 0,00.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-[10px] font-semibold" style={{ color: '#64748b' }}>Período</label>
        <select value={epoca} onChange={e => setEpoca(e.target.value as Epoca | '')}
          className="rounded px-2 py-1 text-[11px] outline-none" style={inputSt}>
          <option value="">Ano inteiro ({ano})</option>
          <option value="1">1º semestre (jan–jun)</option>
          <option value="2">2º semestre (jul–dez)</option>
        </select>
      </div>

      <div className="rounded-lg p-2.5 space-y-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
        <p className="text-[10px] font-semibold" style={{ color: '#93c5fd' }}>Custo da lavoura (R$/ha)</p>
        <input value={custoLavoura} onChange={e => setCustoLavoura(e.target.value)} inputMode="decimal"
          placeholder={custoVigente.custoHa != null ? `${fmt(custoVigente.custoHa)} — ${ROTULO_NIVEL[custoVigente.fonte]}` : 'ex.: 5.400,00'}
          className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputSt} />
        <p className="text-[9px]" style={{ color: '#64748b' }}>
          Vira o padrão do mapa de rentabilidade deste produtor no ano — não precisa mais digitar em cada mapa.
        </p>
      </div>

      <div className="rounded-lg p-2.5 space-y-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
        <p className="text-[10px] font-semibold" style={{ color: '#93c5fd' }}>Aplicação padrão (R$/ha)</p>
        <input value={aplicPadrao} onChange={e => setAplicPadrao(e.target.value)} inputMode="decimal"
          placeholder="ex.: 45,00" className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputSt} />
        <p className="text-[9px]" style={{ color: '#64748b' }}>
          Vale para todo insumo que não tiver aplicação própria na lista abaixo.
        </p>
      </div>

      <div className="space-y-1">
        <p className="text-[10px] font-semibold" style={{ color: '#93c5fd' }}>Insumos — preço (R$/t) e aplicação (R$/ha)</p>
        {insumos.length === 0 && (
          <p className="text-[10px] py-3 text-center" style={{ color: '#64748b' }}>
            Nenhum insumo cadastrado na Biblioteca.
          </p>
        )}
        {insumos.map(it => {
          const r = rascunho[it.id] ?? { preco: '', aplic: '' };
          const vig = precoResolvidoDoInsumo(it.id, it.conteudo, {
            clienteId, fazendaId, ano, epoca: (epoca || null) as Epoca | null,
          });
          const daBib = it.conteudo ? precoNaUnidade(it.conteudo, 't') : undefined;
          return (
            <div key={it.id} className="rounded p-2 space-y-1" style={{ background: '#0a1929', border: '1px solid #14284a' }}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[11px] font-semibold truncate" style={{ color: '#e2e8f0' }}>{it.nome}</p>
                <p className="text-[9px] whitespace-nowrap" style={{ color: '#64748b' }}>
                  {vig.precoT != null ? `R$ ${fmt(vig.precoT)}/t` : 'sem preço'} · {ROTULO_NIVEL[vig.fonte.preco]}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <input value={r.preco} inputMode="decimal"
                  onChange={e => setRascunho(p => ({ ...p, [it.id]: { ...r, preco: e.target.value } }))}
                  placeholder={daBib != null ? `${fmt(daBib)} (biblioteca)` : 'preço R$/t'}
                  className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputSt} />
                <input value={r.aplic} inputMode="decimal"
                  onChange={e => setRascunho(p => ({ ...p, [it.id]: { ...r, aplic: e.target.value } }))}
                  placeholder={it.conteudo?.aplicacaoHa != null ? `${fmt(it.conteudo.aplicacaoHa)} (biblioteca)` : 'aplicação R$/ha'}
                  className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputSt} />
              </div>
              {(r.preco || r.aplic) && (
                <button onClick={() => setRascunho(p => ({ ...p, [it.id]: { preco: '', aplic: '' } }))}
                  className="text-[9px] flex items-center gap-1" style={{ color: '#93c5fd' }}>
                  <RotateCcw size={9} /> voltar ao valor da biblioteca
                </button>
              )}
            </div>
          );
        })}
      </div>

      {msg && <p className="text-[10px] rounded p-2" style={{ background: '#0f3d2e', color: '#6ee7b7' }}>{msg}</p>}

      <button onClick={salvar}
        className="w-full py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1"
        style={{ background: 'var(--invicta-green-dark)' }}>
        <Save size={12} /> Salvar custos {nivel === 'fazenda' ? 'da fazenda' : 'do produtor'}
      </button>
    </div>
  );
}
