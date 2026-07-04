'use client';

// IA F1 — card "Diagnóstico com IA" no Resumo do talhão (§12 da spec de IA).
// Abrir a tela mostra o diagnóstico SALVO (nunca chama a IA sozinho — §14);
// só os botões Gerar/Atualizar disparam a análise (custo controlado).

import { useEffect, useState } from 'react';
import { gerarDiagnostico, carregarDiagnostico, type DiagnosticoIa } from '@/lib/ia';
import { Sparkles, Loader2, AlertTriangle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

const COR_POT: Record<string, string> = { alto: '#86efac', medio: '#fbbf24', baixo: '#f87171', indefinido: '#94a3b8' };
const ROT_POT: Record<string, string> = { alto: 'Alto', medio: 'Médio', baixo: 'Baixo', indefinido: 'Indefinido' };
const COR_CONF: Record<string, string> = { alto: '#86efac', medio: '#fbbf24', baixo: '#f87171' };

export function DiagnosticoIaCard({ talhaoId, safraNome }: { talhaoId: string; safraNome?: string }) {
  const [diag, setDiag] = useState<DiagnosticoIa | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState('');
  const [tecAberto, setTecAberto] = useState(false);

  useEffect(() => {
    let vivo = true;
    setDiag(null); setErro(''); setCarregando(true);
    carregarDiagnostico(talhaoId, safraNome)
      .then(d => { if (vivo) setDiag(d); })
      .catch(() => {})
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [talhaoId, safraNome]);

  async function gerar() {
    if (gerando) return;
    setGerando(true); setErro('');
    try {
      setDiag(await gerarDiagnostico(talhaoId, safraNome));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao gerar o diagnóstico.');
    } finally { setGerando(false); }
  }

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
              {new Date(diag.criadoEm).toLocaleDateString('pt-BR')} {new Date(diag.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · {diag.modelo}
            </span>
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
