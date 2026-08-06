'use client';

// Bloco de RELATÓRIOS da fazenda (tela da fazenda → aba Talhões).
// Antes os botões usavam a SAFRA ATIVA GLOBAL sem o usuário indicar o ano — se a
// ativa não fosse a desejada, o relatório saía vazio. Agora o app DETECTA os anos
// que têm dado e o usuário escolhe no seletor "Ano", que vale para todos os
// relatórios daqui. Inclui o relatório de SATÉLITE (índice + datas escolhidos).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { gerarRelatorioRecomendacaoFazenda, gerarRecomendacaoFazendaExcel } from '@/lib/recomendacao/relatorioCenarios';
import { anosDaFazenda, sateliteDaFazenda, type AnoFazenda, type SateliteFazenda } from '@/lib/fazendaRelatorios';
import { gerarRelatorioNdviFazenda } from '@/lib/relatorioNdviFazenda';
import { legendasDoModulo } from '@/components/talhao/SeletorLegenda';
import { respeitarPadraoHomonima } from '@/lib/legendas';
import type { Legenda } from '@/lib/legendas';
import { FileDown, Loader2, Satellite, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';

const fmtData = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('pt-BR');

export function RelatoriosFazenda({ fazendaId }: { fazendaId: string }) {
  const [anos, setAnos] = useState<AnoFazenda[] | null>(null);   // null = carregando
  const [anoSel, setAnoSel] = useState<number | null>(null);
  const [erro, setErro] = useState('');
  const [gerandoRel, setGerandoRel] = useState(false);
  const [gerandoXls, setGerandoXls] = useState(false);

  // Satélite
  const [painelSat, setPainelSat] = useState(false);
  const [sat, setSat] = useState<SateliteFazenda | null>(null);
  const [carregandoSat, setCarregandoSat] = useState(false);
  const [indiceSel, setIndiceSel] = useState<string>('TODOS');
  const [datasSel, setDatasSel] = useState<Set<string>>(new Set());
  const [gerandoSat, setGerandoSat] = useState(false);
  const [progresso, setProgresso] = useState<{ feito: number; total: number; nome: string } | null>(null);

  // Anos com dado (recomendação e/ou satélite), mais recente primeiro.
  // O componente é remontado por fazenda (key no pai), então o estado já nasce
  // limpo — aqui só buscamos.
  useEffect(() => {
    let vivo = true;
    anosDaFazenda(fazendaId)
      .then(lista => { if (!vivo) return; setAnos(lista); setAnoSel(lista[0]?.ano ?? null); })
      .catch(() => { if (vivo) setAnos([]); });
    return () => { vivo = false; };
  }, [fazendaId]);

  const ano = useMemo(() => anos?.find(a => a.ano === anoSel) ?? null, [anos, anoSel]);

  // Cenas do ano escolhido (só metadados) — carregadas ao abrir o painel de satélite.
  const carregarSat = useCallback(async (a: number) => {
    setCarregandoSat(true); setErro('');
    try {
      const s = await sateliteDaFazenda(fazendaId, a);
      setSat(s);
      setDatasSel(new Set(s.cenas.map(c => c.data)));   // por padrão, todas as datas
      setIndiceSel('TODOS');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao ler as imagens da fazenda.');
    } finally { setCarregandoSat(false); }
  }, [fazendaId]);

  // Abrir/fechar o painel de satélite (carrega as cenas ao ABRIR — evento, não efeito).
  function alternarPainelSat() {
    const abrindo = !painelSat;
    setPainelSat(abrindo);
    if (abrindo && anoSel != null && !sat) void carregarSat(anoSel);
  }
  // Trocar o ano: limpa as cenas e recarrega se o painel estiver aberto.
  function trocarAno(a: number) {
    setAnoSel(a); setSat(null); setErro('');
    if (painelSat) void carregarSat(a);
  }

  // Datas visíveis conforme o índice escolhido.
  const cenasVisiveis = useMemo(() => {
    if (!sat) return [];
    return indiceSel === 'TODOS' ? sat.cenas : sat.cenas.filter(c => c.indices.includes(indiceSel));
  }, [sat, indiceSel]);

  async function gerarRecomendacao(tipo: 'pdf' | 'xls') {
    if (!ano || gerandoRel || gerandoXls) return;
    const safra = ano.safras[0];
    if (!safra) { setErro('Este ano não tem recomendações lançadas.'); return; }
    setErro('');
    if (tipo === 'pdf') setGerandoRel(true); else setGerandoXls(true);
    try {
      if (tipo === 'pdf') await gerarRelatorioRecomendacaoFazenda(fazendaId, safra);
      else await gerarRecomendacaoFazendaExcel(fazendaId, safra);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao gerar o relatório.');
    } finally { setGerandoRel(false); setGerandoXls(false); }
  }

  async function gerarSatelite() {
    if (!sat || !ano || gerandoSat) return;
    const camadas = sat.camadas.filter(c =>
      datasSel.has(c.data) && (indiceSel === 'TODOS' || c.indice === indiceSel));
    if (camadas.length === 0) { setErro('Escolha ao menos uma data (e um índice com imagem).'); return; }
    const legendas: Legenda[] = legendasDoModulo('ndvi');
    const prefId = typeof localStorage !== 'undefined' ? localStorage.getItem('inv_leg_pref_ndvi') : null;
    const alvo = legendas.find(l => l.id === prefId);
    // Preferência apontando para a gêmea não-padrão (mesmo nome) → vale a padrão.
    const legenda = alvo ? respeitarPadraoHomonima(legendas, alvo) : legendas[0];
    if (!legenda) { setErro('Cadastre uma legenda de NDVI (Biblioteca → Legendas) para gerar o relatório.'); return; }

    setErro(''); setGerandoSat(true); setProgresso({ feito: 0, total: camadas.length, nome: '' });
    try {
      await gerarRelatorioNdviFazenda({
        fazendaId, ano: ano.ano, safraRotulo: ano.safras[0], camadas, legenda,
        onProgresso: (feito, total, nome) => setProgresso({ feito, total, nome }),
      });
      setPainelSat(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao gerar o relatório de satélite.');
    } finally { setGerandoSat(false); setProgresso(null); }
  }

  const ocupado = gerandoRel || gerandoXls || gerandoSat;

  if (anos === null) {
    return (
      <div className="flex items-center gap-2 text-[11px] px-1 py-1" style={{ color: '#64748b' }}>
        <Loader2 size={12} className="animate-spin" /> procurando anos com dado…
      </div>
    );
  }
  if (anos.length === 0) {
    return (
      <p className="text-[10px] px-1" style={{ color: '#64748b' }}>
        Nenhum dado de recomendação ou satélite nesta fazenda ainda.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {/* Seletor de ANO — vale para todos os relatórios da fazenda */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>Ano</span>
        <select value={anoSel ?? ''} onChange={e => trocarAno(Number(e.target.value))}
          disabled={ocupado}
          className="flex-1 rounded px-2 py-1 text-[11px] outline-none disabled:opacity-60"
          style={{ background: '#0f2240', color: '#e2e8f0', border: '1px solid #2e5fa3' }}>
          {anos.map(a => (
            <option key={a.ano} value={a.ano}>
              {a.ano}{a.temRecomendacao ? ' · recomendação' : ''}{a.temSatelite ? ' · satélite' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Recomendação */}
      <div className="flex gap-2">
        <button onClick={() => gerarRecomendacao('pdf')} disabled={ocupado || !ano?.temRecomendacao}
          title={ano?.temRecomendacao ? 'Relatório de recomendação de todos os talhões' : 'Este ano não tem recomendações lançadas'}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold disabled:opacity-40"
          style={{ background: '#2a1e4d', color: '#c4b5fd' }}>
          {gerandoRel ? <Loader2 size={12} className="animate-spin" /> : <FileDown size={12} />}
          {gerandoRel ? 'Gerando…' : 'Recomendação (PDF)'}
        </button>
        <button onClick={() => gerarRecomendacao('xls')} disabled={ocupado || !ano?.temRecomendacao}
          title="Versão Excel editável (resumo por talhão + volume total por produto)"
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-40"
          style={{ background: '#0f3d2e', color: '#6ee7b7' }}>
          {gerandoXls ? <Loader2 size={12} className="animate-spin" /> : <FileDown size={12} />}
          Excel
        </button>
      </div>

      {/* Satélite (NDVI / NDRE / SAVI…) */}
      <button onClick={alternarPainelSat} disabled={ocupado || !ano?.temSatelite}
        title={ano?.temSatelite ? 'Relatório de satélite de todos os talhões' : 'Este ano não tem imagens de satélite mantidas'}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold disabled:opacity-40"
        style={{ background: '#0b3a4d', color: '#7dd3fc' }}>
        <Satellite size={12} /> Relatório de satélite
        {painelSat ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {painelSat && (
        <div className="rounded-lg p-2 space-y-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
          {carregandoSat && (
            <p className="flex items-center gap-2 text-[11px]" style={{ color: '#64748b' }}>
              <Loader2 size={12} className="animate-spin" /> lendo as imagens dos talhões…
            </p>
          )}
          {!carregandoSat && sat && sat.cenas.length === 0 && (
            <p className="text-[10px]" style={{ color: '#fbbf24' }}>Nenhuma imagem mantida em {anoSel} nos talhões desta fazenda.</p>
          )}
          {!carregandoSat && sat && sat.cenas.length > 0 && (
            <>
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>Índice</span>
                <select value={indiceSel} onChange={e => setIndiceSel(e.target.value)} disabled={gerandoSat}
                  className="w-full mt-1 rounded px-2 py-1 text-[11px] outline-none disabled:opacity-60"
                  style={{ background: '#0f2240', color: '#e2e8f0', border: '1px solid #2e5fa3' }}>
                  <option value="TODOS">Todos os índices ({sat.indices.join(', ')})</option>
                  {sat.indices.map(i => <option key={i} value={i}>Somente {i}</option>)}
                </select>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>
                    Datas ({datasSel.size}/{cenasVisiveis.length})
                  </span>
                  <button onClick={() => setDatasSel(new Set(cenasVisiveis.map(c => c.data)))} disabled={gerandoSat}
                    className="ml-auto text-[9px] underline" style={{ color: '#93c5fd' }}>todas</button>
                  <button onClick={() => setDatasSel(new Set())} disabled={gerandoSat}
                    className="text-[9px] underline" style={{ color: '#93c5fd' }}>nenhuma</button>
                </div>
                <div className="mt-1 max-h-40 overflow-y-auto space-y-0.5 pr-1">
                  {cenasVisiveis.map(c => (
                    <label key={c.data} className="flex items-center gap-2 text-[11px] cursor-pointer px-1 py-0.5 rounded"
                      style={{ color: '#cbd5e1' }}>
                      <input type="checkbox" checked={datasSel.has(c.data)} disabled={gerandoSat}
                        onChange={e => {
                          const marcar = e.target.checked;
                          setDatasSel(s => {
                            const n = new Set(s);
                            if (marcar) n.add(c.data); else n.delete(c.data);
                            return n;
                          });
                        }} />
                      <span>{fmtData(c.data)}</span>
                      <span className="ml-auto text-[9px]" style={{ color: '#64748b' }}>
                        {c.nTalhoes} talhão(ões) · {c.indices.join(', ')}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <button onClick={gerarSatelite} disabled={gerandoSat || datasSel.size === 0}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-40"
                style={{ background: 'var(--invicta-blue-mid)' }}>
                {gerandoSat ? <Loader2 size={12} className="animate-spin" /> : <FileDown size={12} />}
                {gerandoSat ? 'Gerando…' : 'Gerar PDF de satélite'}
              </button>
              {progresso && (
                <p className="text-[10px]" style={{ color: '#7dd3fc' }}>
                  {progresso.feito}/{progresso.total} · {progresso.nome}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {erro && (
        <p className="flex items-start gap-1 text-[10px]" style={{ color: '#f87171' }}>
          <AlertTriangle size={11} className="mt-0.5 shrink-0" /> <span>{erro}</span>
        </p>
      )}
    </div>
  );
}
