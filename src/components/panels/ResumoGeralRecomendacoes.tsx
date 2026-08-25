'use client';

// RESUMO GERAL das recomendações marcadas — a tela (fazenda e produtor).
//
// Um componente só para os dois escopos: quem chama entrega a LISTA DE TALHÕES
// e como identificar o relatório. O painel da fazenda passa os talhões dela; o
// do produtor, os de todas as fazendas.
//
// O fluxo é em três passos porque a consulta é cara: escolher os ANOS → Carregar
// (uma consulta por talhão) → escolher os PRODUTOS e exportar. Trocar o filtro de
// produtos NÃO volta à nuvem: o resumo é remontado sobre o que já veio.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { anosDeTalhoes, type AnoFazenda } from '@/lib/fazendaRelatorios';
import { montarResumoGeral, type Lancamento } from '@/lib/recomendacao/resumoGeral';
import {
  coletarLancamentos, produtosDisponiveis, gerarResumoGeralPdf, gerarResumoGeralExcel,
  type TalhaoAlvo, type IdentResumo,
} from '@/lib/recomendacao/resumoGeralExport';
import { FileDown, Loader2, ListChecks, RefreshCw } from 'lucide-react';

interface Props {
  escopo: 'fazenda' | 'produtor';
  produtor: string;
  fazenda?: string;
  siglaFazenda?: string | null;
  nFazendas?: number;
  talhoes: TalhaoAlvo[];
}

export function ResumoGeralRecomendacoes({ escopo, produtor, fazenda, siglaFazenda, nFazendas, talhoes }: Props) {
  const [anos, setAnos] = useState<AnoFazenda[] | null>(null);
  const [selAnos, setSelAnos] = useState<Set<number>>(new Set());
  const [lancs, setLancs] = useState<Lancamento[] | null>(null);
  const [selProdutos, setSelProdutos] = useState<Set<string>>(new Set());
  const [progresso, setProgresso] = useState<{ feito: number; total: number; nome: string } | null>(null);
  const [gerando, setGerando] = useState<'' | 'pdf' | 'xls'>('');
  const [erro, setErro] = useState('');
  const token = useRef(0);

  const ids = useMemo(() => talhoes.map(t => t.id).join('|'), [talhoes]);

  // Sem reset de estado aqui dentro: quem troca o escopo REMONTA o componente
  // (as duas telas passam `key`), então o estado já nasce limpo — e o efeito
  // fica só com o que ele existe para fazer, que é buscar.
  useEffect(() => {
    let vivo = true;
    anosDeTalhoes(talhoes.map(t => t.id))
      .then(lista => {
        if (!vivo) return;
        const comRec = lista.filter(a => a.temRecomendacao);
        setAnos(comRec);
        setSelAnos(new Set(comRec.length ? [comRec[0].ano] : []));
      })
      .catch(() => { if (vivo) { setAnos([]); setErro('Não foi possível consultar os anos com recomendação.'); } });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  const alternarAno = (ano: number) => {
    setSelAnos(s => { const n = new Set(s); if (n.has(ano)) n.delete(ano); else n.add(ano); return n; });
    setLancs(null);   // a seleção mudou: o que estava carregado não vale mais
  };

  const carregar = useCallback(async () => {
    const safras = (anos ?? []).filter(a => selAnos.has(a.ano)).flatMap(a => a.safras);
    if (safras.length === 0) { setErro('Escolha ao menos um ano.'); return; }
    setErro(''); setLancs(null);
    const meu = ++token.current;
    setProgresso({ feito: 0, total: talhoes.length, nome: '' });
    try {
      const out = await coletarLancamentos(talhoes, safras, {
        onProgresso: (feito, total, nome) => { if (token.current === meu) setProgresso({ feito, total, nome }); },
        cancelado: () => token.current !== meu,
      });
      if (token.current !== meu) return;
      setLancs(out);
      setSelProdutos(new Set(produtosDisponiveis(out)));
      if (out.length === 0) setErro('Nenhuma recomendação marcada com ★ nos anos escolhidos. Marque as doses (★) na aba Recomendações dos talhões.');
    } catch (e) {
      if (token.current === meu) setErro(e instanceof Error ? e.message : 'Falha ao carregar as recomendações.');
    } finally {
      if (token.current === meu) setProgresso(null);
    }
  }, [anos, selAnos, talhoes]);

  const produtos = useMemo(() => (lancs ? produtosDisponiveis(lancs) : []), [lancs]);
  const resumo = useMemo(
    () => (lancs ? montarResumoGeral(lancs, selProdutos) : null),
    [lancs, selProdutos],
  );

  async function exportar(tipo: 'pdf' | 'xls') {
    if (!resumo) return;
    setErro(''); setGerando(tipo);
    try {
      const ident: IdentResumo = { escopo, produtor, fazenda, siglaFazenda, nFazendas };
      if (tipo === 'pdf') await gerarResumoGeralPdf(resumo, ident);
      else await gerarResumoGeralExcel(resumo, ident);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao gerar o resumo.');
    } finally { setGerando(''); }
  }

  const ocupado = !!progresso || gerando !== '';
  const rotulo = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

  if (anos === null) {
    return <p className="text-[10px] px-1 flex items-center gap-1.5" style={{ color: '#64748b' }}>
      <Loader2 size={11} className="animate-spin" /> Procurando anos com recomendação…
    </p>;
  }
  if (anos.length === 0) {
    return <p className="text-[10px] px-1" style={{ color: '#64748b' }}>
      Nenhuma recomendação lançada {escopo === 'fazenda' ? 'nesta fazenda' : 'neste produtor'} ainda.
    </p>;
  }

  return (
    <div className="space-y-2 rounded-lg p-2.5" style={{ background: '#0b1c33', border: '1px solid #1a3a6b' }}>
      <div className="flex items-center gap-1.5">
        <ListChecks size={12} style={{ color: '#c4b5fd' }} />
        <span className="text-[11px] font-semibold" style={{ color: '#e2e8f0' }}>Resumo geral das recomendações marcadas</span>
      </div>
      <p className="text-[9.5px]" style={{ color: '#64748b' }}>
        Quantidade por talhão e por produto, somando os anos escolhidos, mais a lista de recomendações a enviar. Sem mapas.
      </p>

      {/* 1) anos */}
      <div className="flex flex-wrap gap-1.5">
        {anos.map(a => {
          const on = selAnos.has(a.ano);
          return (
            <button key={a.ano} onClick={() => alternarAno(a.ano)} disabled={ocupado}
              className="px-2 py-1 rounded text-[11px] font-semibold disabled:opacity-40"
              style={{
                background: on ? '#2a1e4d' : '#0f2240',
                color: on ? '#c4b5fd' : '#64748b',
                border: `1px solid ${on ? '#6d5bb5' : '#2e5fa3'}`,
              }}>
              {a.ano}
            </button>
          );
        })}
      </div>

      {/* 2) carregar */}
      <button onClick={carregar} disabled={ocupado || selAnos.size === 0}
        className="w-full flex items-center justify-center gap-2 py-1.5 rounded-lg text-[11px] font-semibold disabled:opacity-40"
        style={{ background: '#0f2240', color: '#93c5fd', border: '1px solid #2e5fa3' }}>
        {progresso ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
        {progresso
          ? `Lendo ${progresso.feito}/${progresso.total}${progresso.nome ? ` · ${progresso.nome}` : ''}…`
          : lancs ? 'Recarregar' : `Carregar (${rotulo(talhoes.length, 'talhão', 'talhões')})`}
      </button>

      {/* 3) produtos + exportação */}
      {lancs && produtos.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-[9.5px] font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>Produtos</span>
            <button onClick={() => setSelProdutos(new Set(selProdutos.size === produtos.length ? [] : produtos))}
              className="text-[9.5px] underline" style={{ color: '#93c5fd' }}>
              {selProdutos.size === produtos.length ? 'limpar' : 'todos'}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {produtos.map(p => {
              const on = selProdutos.has(p);
              return (
                <button key={p} onClick={() => setSelProdutos(s => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; })}
                  disabled={ocupado}
                  className="px-2 py-1 rounded text-[10px] font-semibold disabled:opacity-40"
                  style={{
                    background: on ? '#0f3d2e' : '#0f2240',
                    color: on ? '#6ee7b7' : '#64748b',
                    border: `1px solid ${on ? '#1f7a5a' : '#2e5fa3'}`,
                  }}>
                  {p}
                </button>
              );
            })}
          </div>

          {resumo && (
            <p className="text-[9.5px]" style={{ color: '#94a3b8' }}>
              {rotulo(resumo.totalGeral.nTalhoes, 'talhão', 'talhões')} · {rotulo(resumo.recomendacoes.length, 'recomendação', 'recomendações')} · {resumo.totalGeral.areaHa.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ha
            </p>
          )}

          <div className="flex gap-2">
            <button onClick={() => exportar('pdf')} disabled={ocupado || selProdutos.size === 0}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold disabled:opacity-40"
              style={{ background: '#2a1e4d', color: '#c4b5fd' }}>
              {gerando === 'pdf' ? <Loader2 size={12} className="animate-spin" /> : <FileDown size={12} />}
              {gerando === 'pdf' ? 'Gerando…' : 'Resumo geral (PDF)'}
            </button>
            <button onClick={() => exportar('xls')} disabled={ocupado || selProdutos.size === 0}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-40"
              style={{ background: '#0f3d2e', color: '#6ee7b7' }}>
              {gerando === 'xls' ? <Loader2 size={12} className="animate-spin" /> : <FileDown size={12} />}
              Excel
            </button>
          </div>
        </>
      )}

      {erro && <p className="text-[10px]" style={{ color: '#fca5a5' }}>{erro}</p>}
    </div>
  );
}
