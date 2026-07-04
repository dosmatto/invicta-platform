'use client';

// IA F1 — card "Diagnóstico com IA" no Resumo do talhão (§12 da spec de IA).
// Abrir a tela mostra o diagnóstico SALVO (nunca chama a IA sozinho — §14);
// só os botões Gerar/Atualizar disparam a análise (custo controlado).

import { useEffect, useMemo, useState } from 'react';
import { gerarDiagnostico, carregarHistoricoDiagnosticos, avaliarRegrasTalhao, type DiagnosticoIa } from '@/lib/ia';
import type { AvaliacaoRegras, TipoSinal } from '@/lib/iaRegras';
import { Sparkles, Loader2, AlertTriangle, RefreshCw, ChevronDown, ChevronUp, History, Clock, Gauge } from 'lucide-react';

const usd = (v?: number) => (v == null ? '—' : `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 4 })}`);
const dataHora = (s: string) => `${new Date(s).toLocaleDateString('pt-BR')} ${new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

const COR_SINAL: Record<TipoSinal, string> = { limitante: '#f87171', risco: '#fbbf24', oportunidade: '#86efac' };
const COR_QUAL: Record<string, string> = { alto: '#86efac', medio: '#fbbf24', baixo: '#f87171' };
const ROT_QUAL: Record<string, string> = { alto: 'Alta', medio: 'Média', baixo: 'Baixa' };

const COR_POT: Record<string, string> = { alto: '#86efac', medio: '#fbbf24', baixo: '#f87171', indefinido: '#94a3b8' };
const ROT_POT: Record<string, string> = { alto: 'Alto', medio: 'Médio', baixo: 'Baixo', indefinido: 'Indefinido' };
const COR_CONF: Record<string, string> = { alto: '#86efac', medio: '#fbbf24', baixo: '#f87171' };

export function DiagnosticoIaCard({ talhaoId, safraNome }: { talhaoId: string; safraNome?: string }) {
  const [historico, setHistorico] = useState<DiagnosticoIa[]>([]);
  const [verId, setVerId] = useState<string | null>(null);   // qual diagnóstico do histórico está aberto (null = o mais recente)
  const [carregando, setCarregando] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState('');
  const [tecAberto, setTecAberto] = useState(false);
  const [histAberto, setHistAberto] = useState(false);
  const [regras, setRegras] = useState<AvaliacaoRegras | null>(null);

  useEffect(() => {
    let vivo = true;
    setHistorico([]); setVerId(null); setErro(''); setCarregando(true); setHistAberto(false); setRegras(null);
    carregarHistoricoDiagnosticos(talhaoId, safraNome)
      .then(h => { if (vivo) setHistorico(h); })
      .catch(() => {})
      .finally(() => { if (vivo) setCarregando(false); });
    // sinais + score de qualidade (determinístico, sem custo de IA)
    avaliarRegrasTalhao(talhaoId, safraNome).then(a => { if (vivo) setRegras(a); }).catch(() => {});
    return () => { vivo = false; };
  }, [talhaoId, safraNome]);

  async function gerar() {
    if (gerando) return;
    setGerando(true); setErro('');
    try {
      const novo = await gerarDiagnostico(talhaoId, safraNome);
      setHistorico(h => [novo, ...h]);
      setVerId(null);   // mostra o recém-gerado (o mais recente)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao gerar o diagnóstico.');
    } finally { setGerando(false); }
  }

  const diag = useMemo(() => (verId ? historico.find(d => d.id === verId) : historico[0]) ?? null, [historico, verId]);
  const custoTotal = useMemo(() => historico.reduce((s, d) => s + (d.custoEstimado ?? 0), 0), [historico]);
  const r = diag?.resposta;

  return (
    <div className="p-3 rounded-lg space-y-2" style={{ background: '#0a1929', border: '1px solid #1a3a6b' }}>
      <div className="flex items-center gap-2">
        <Sparkles size={14} style={{ color: '#c084fc' }} />
        <p className="text-[11px] font-bold uppercase tracking-wider flex-1" style={{ color: '#cbd5e1' }}>Diagnóstico com IA</p>
        {diag && (
          <button onClick={() => void gerar()} disabled={gerando} title="Atualizar (nova análise)" className="flex items-center gap-1 text-[9px] px-2 py-1 rounded disabled:opacity-50" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
            {gerando ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />} Atualizar
          </button>
        )}
      </div>

      {/* Sinais agronômicos (regras determinísticas §17) + qualidade dos dados (§16) — sem custo de IA */}
      {regras && (regras.sinais.length > 0 || regras.qualidade.nivel) && (
        <div className="rounded p-2 space-y-1" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
          <div className="flex items-center gap-1.5">
            <Gauge size={11} style={{ color: COR_QUAL[regras.qualidade.nivel] }} />
            <span className="text-[9px] font-bold uppercase" style={{ color: '#93c5fd' }}>Sinais das regras</span>
            <span className="text-[8px] px-1.5 py-0.5 rounded font-bold ml-auto" style={{ background: '#0f2240', color: COR_QUAL[regras.qualidade.nivel] }}>
              Qualidade dos dados: {ROT_QUAL[regras.qualidade.nivel]}
            </span>
          </div>
          {regras.sinais.length > 0 ? regras.sinais.map(s => (
            <p key={s.codigo} className="text-[10px] flex items-start gap-1" style={{ color: '#cbd5e1' }}>
              <span style={{ color: COR_SINAL[s.tipo] }}>●</span> {s.texto}
            </p>
          )) : <p className="text-[9px]" style={{ color: '#64748b' }}>Nenhum sinal automático nas regras atuais.</p>}
          {regras.qualidade.motivos.length > 0 && <p className="text-[8px]" style={{ color: '#475569' }}>{regras.qualidade.motivos.join(' · ')}</p>}
        </div>
      )}

      {carregando ? (
        <p className="text-[10px] flex items-center gap-1.5" style={{ color: '#64748b' }}><Loader2 size={11} className="animate-spin" /> Verificando diagnóstico salvo…</p>
      ) : !diag ? (
        <>
          <p className="text-[10px] leading-relaxed" style={{ color: '#94a3b8' }}>
            A IA agronômica analisa os dados que o talhão já tem (fertilidade, produtividade, satélite, EC, relevo, zonas) e gera um diagnóstico técnico — sem inventar nada e informando o nível de confiança.
          </p>
          <button onClick={() => void gerar()} disabled={gerando}
            className="w-full py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-60"
            style={{ background: '#7c3aed' }}>
            {gerando ? <><Loader2 size={13} className="animate-spin" /> Analisando (~15–30 s)…</> : <><Sparkles size={13} /> Gerar diagnóstico com IA</>}
          </button>
        </>
      ) : r ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5 text-[9px]">
            <span className="px-1.5 py-0.5 rounded font-bold" style={{ background: '#0f2240', color: COR_POT[r.potencial_do_talhao] }}>
              Potencial: {ROT_POT[r.potencial_do_talhao]}
            </span>
            <span className="px-1.5 py-0.5 rounded font-bold" style={{ background: '#0f2240', color: COR_CONF[r.nivel_de_confianca] }}>
              Confiança: {r.nivel_de_confianca}
            </span>
            <span style={{ color: '#475569' }}>
              {dataHora(diag.criadoEm)} · {diag.modelo} · {(diag.tokensEntrada + diag.tokensSaida).toLocaleString('pt-BR')} tokens · {usd(diag.custoEstimado)}
            </span>
            {verId && historico[0] && diag.id !== historico[0].id && (
              <button onClick={() => setVerId(null)} className="px-1.5 py-0.5 rounded font-bold" style={{ background: '#78350f', color: '#fde68a' }}>
                versão antiga · ver a atual
              </button>
            )}
          </div>

          <p className="text-[11px] leading-relaxed" style={{ color: '#e2e8f0' }}>{r.diagnostico_geral}</p>

          {r.principais_limitantes.length > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase mb-0.5" style={{ color: '#f87171' }}>Principais limitantes</p>
              {r.principais_limitantes.map((x, i) => <p key={i} className="text-[10px]" style={{ color: '#cbd5e1' }}>• {x}</p>)}
            </div>
          )}
          {r.oportunidades_de_manejo.length > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase mb-0.5" style={{ color: '#86efac' }}>Oportunidades de manejo</p>
              {r.oportunidades_de_manejo.map((x, i) => <p key={i} className="text-[10px]" style={{ color: '#cbd5e1' }}>• {x}</p>)}
            </div>
          )}

          <div className="p-2 rounded" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
            <p className="text-[9px] font-bold uppercase mb-0.5" style={{ color: '#93c5fd' }}>Resumo para o produtor</p>
            <p className="text-[10px] leading-relaxed" style={{ color: '#cbd5e1' }}>{r.resumo_para_produtor}</p>
          </div>

          <button onClick={() => setTecAberto(a => !a)} className="w-full flex items-center justify-between text-[9px] font-semibold" style={{ color: '#64748b' }}>
            <span>Detalhes técnicos (evidências, hipóteses, riscos)</span>
            {tecAberto ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
          {tecAberto && (
            <div className="space-y-1.5 text-[10px]" style={{ color: '#94a3b8' }}>
              {r.evidencias_tecnicas.length > 0 && <div><p className="font-bold text-[9px] uppercase" style={{ color: '#93c5fd' }}>Evidências</p>{r.evidencias_tecnicas.map((x, i) => <p key={i}>• {x}</p>)}</div>}
              {r.hipoteses_agronomicas.length > 0 && <div><p className="font-bold text-[9px] uppercase" style={{ color: '#93c5fd' }}>Hipóteses</p>{r.hipoteses_agronomicas.map((x, i) => <p key={i}>• {x}</p>)}</div>}
              {r.riscos.length > 0 && <div><p className="font-bold text-[9px] uppercase" style={{ color: '#fbbf24' }}>Riscos</p>{r.riscos.map((x, i) => <p key={i}>• {x}</p>)}</div>}
              {r.dados_ausentes_relevantes.length > 0 && <div><p className="font-bold text-[9px] uppercase" style={{ color: '#64748b' }}>Dados ausentes</p>{r.dados_ausentes_relevantes.map((x, i) => <p key={i}>• {x}</p>)}</div>}
              <div><p className="font-bold text-[9px] uppercase" style={{ color: '#93c5fd' }}>Resumo técnico interno</p><p>{r.resumo_tecnico_interno}</p></div>
              <p style={{ color: '#475569' }}>Justificativa da confiança: {r.justificativa_confianca}</p>
            </div>
          )}

          {/* Histórico de diagnósticos (§13-14) — cada geração fica guardada */}
          {historico.length > 1 && (
            <div className="pt-1" style={{ borderTop: '1px solid #0f2240' }}>
              <button onClick={() => setHistAberto(a => !a)} className="w-full flex items-center justify-between text-[9px] font-semibold" style={{ color: '#64748b' }}>
                <span className="flex items-center gap-1"><History size={10} /> Histórico · {historico.length} análises · {usd(custoTotal)} no total</span>
                {histAberto ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
              {histAberto && (
                <div className="mt-1 space-y-1">
                  {historico.map((d, i) => {
                    const ativo = d.id === diag.id;
                    return (
                      <button key={d.id} onClick={() => setVerId(i === 0 ? null : d.id)}
                        className="w-full flex items-center gap-2 text-[9px] rounded px-2 py-1 text-left"
                        style={{ background: ativo ? '#0f2240' : '#061525', border: `1px solid ${ativo ? '#2e5fa3' : '#1a3a6b'}` }}>
                        <Clock size={9} style={{ color: '#64748b' }} className="flex-shrink-0" />
                        <span className="flex-1" style={{ color: '#cbd5e1' }}>{dataHora(d.criadoEm)}{i === 0 ? ' · atual' : ''}</span>
                        <span style={{ color: COR_POT[d.resposta.potencial_do_talhao] }}>{ROT_POT[d.resposta.potencial_do_talhao]}</span>
                        <span style={{ color: '#475569' }}>{usd(d.custoEstimado)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}

      {erro && (
        <p className="text-[10px] flex items-start gap-1" style={{ color: '#f87171' }}>
          <AlertTriangle size={11} className="flex-shrink-0 mt-[1px]" /> {erro}
        </p>
      )}
      <p className="text-[8px] leading-relaxed" style={{ color: '#475569' }}>
        A IA usa somente os dados desta plataforma e não substitui o agrônomo. Diagnóstico e contexto ficam salvos para auditoria.
      </p>
    </div>
  );
}
