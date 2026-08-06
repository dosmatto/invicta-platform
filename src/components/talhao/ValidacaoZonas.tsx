'use client';

// VALIDADOR DE ZONAS — dashboard dentro do Laboratório de Zonas.
//
// Mostra os 16 indicadores SEMPRE (o motor devolve a lista fechada, inclusive
// os pendentes) e ranqueia os cenários pelo IQZM — que substituiu o antigo
// "melhor = menor CV médio". O IQZM é resumo executivo: aparece grande, mas
// nunca sozinho, e a justificativa de cada número fica ao lado dele.
//
// O cálculo é síncrono e pesado (amostra os rasters dentro de cada zona);
// roda depois de um tick para o spinner pintar, como já faz a concordância.

import { useMemo, useState } from 'react';
import { Loader2, ShieldCheck, AlertTriangle, Info, ChevronDown, ChevronRight } from 'lucide-react';
import type { ZoneamentoMeap } from '@/lib/store';
import { carregarCamadasValidacao } from '@/lib/validacao/carregar';
import { validarZoneamento, compararCenarios, type CamadaValidacao, type RelatorioCompleto } from '@/lib/validacao/validar';
import { COR_FAIXA, ROTULO_FAIXA, type Indicador } from '@/lib/validacao/tipos';
import { fmtHa } from '@/lib/formato';

const num = (v: number | null, d = 1) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

const RESUMO_TABELA = ['iqzm', 'ica', 'ivr', 'ipe', 'separacao', 'fragmentacao', 'continuidade', 'cv'];

function Chip({ i }: { i: Indicador }) {
  const cor = COR_FAIXA[i.faixa];
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ color: cor, background: `${cor}1a` }}>
      {i.valor == null ? '—' : `${num(i.valor)}${i.unidade === '%' ? '%' : ''}`}
    </span>
  );
}

function CardIndicador({ i }: { i: Indicador }) {
  const cor = COR_FAIXA[i.faixa];
  return (
    <div className="rounded-lg p-2.5" style={{ background: '#0a1a2f', border: `1px solid ${i.pendencia ? '#334155' : '#1a3a6b'}` }}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold" style={{ color: '#93c5fd' }}>{i.nome}</span>
        {i.faixa !== 'neutro' && (
          <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: cor, background: `${cor}1a` }}>{ROTULO_FAIXA[i.faixa]}</span>
        )}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-xl font-bold" style={{ color: i.valor == null ? '#64748b' : cor }}>
          {i.valor == null ? '—' : num(i.valor)}
        </span>
        {i.valor != null && i.unidade && <span className="text-[10px]" style={{ color: '#64748b' }}>{i.unidade}</span>}
      </div>
      <p className="text-[9px] mt-1 leading-relaxed" style={{ color: i.pendencia ? '#94a3b8' : '#64748b' }}>{i.justificativa}</p>
    </div>
  );
}

export function ValidacaoZonas({ talhaoId, zoneamentos }: { talhaoId: string; zoneamentos: ZoneamentoMeap[] }) {
  const [camadas, setCamadas] = useState<CamadaValidacao[] | null>(null);
  const [camadaId, setCamadaId] = useState('');
  const [rels, setRels] = useState<RelatorioCompleto[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [rodando, setRodando] = useState(false);
  const [detalheId, setDetalheId] = useState<string>('');
  const [verZonas, setVerZonas] = useState(false);

  const periodos = useMemo(() => [...new Set((camadas ?? []).map(c => c.periodo).filter(Boolean))] as string[], [camadas]);

  function rodar(cams: CamadaValidacao[], alvo: string) {
    setRodando(true); setErro(null);
    setTimeout(() => {
      try {
        const saida = zoneamentos.map(z => validarZoneamento({
          cenarioId: z.id,
          cenarioNome: z.nome,
          poligonos: z.fc.features.map(f => {
            const p = (f.properties ?? {}) as { id?: string; zona?: string | number; classe?: string; cor?: string; potencialRank?: number; areaHa?: number };
            return {
              idZona: String(p.id ?? p.zona ?? '?'),
              nome: String(p.zona ?? p.id ?? '?'),
              classe: String(p.classe ?? ''),
              cor: String(p.cor ?? '#64748b'),
              rank: typeof p.potencialRank === 'number' ? p.potencialRank : undefined,
              areaHa: typeof p.areaHa === 'number' ? p.areaHa : undefined,
              geometry: f.geometry,
            };
          }),
          camadas: cams,
          camadaValidacaoId: alvo || undefined,
          pisoHa: z.meta.areaMinHa || 0.5,
        }));
        setRels(saida);
        setDetalheId(d => (d && saida.some(s => s.cenarioId === d) ? d : saida[0]?.cenarioId ?? ''));
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'falha ao validar');
      } finally { setRodando(false); }
    }, 30);
  }

  async function validar() {
    setRodando(true); setErro(null);
    try {
      const cams = camadas ?? (await carregarCamadasValidacao(talhaoId)).camadas;
      setCamadas(cams);
      if (!cams.length) { setErro('Nenhuma camada disponível para validar (produtividade, NDVI, condutividade ou fertilidade interpolada).'); setRodando(false); return; }
      const alvo = camadaId || cams[0].id;
      setCamadaId(alvo);
      rodar(cams, alvo);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'falha ao carregar as camadas');
      setRodando(false);
    }
  }

  const comparacao = useMemo(() => (rels ? compararCenarios(rels) : null), [rels]);
  const detalhe = rels?.find(r => r.cenarioId === detalheId) ?? null;

  const th = 'text-left font-semibold px-2 py-1.5 text-[10px]';
  const td = 'px-2 py-1.5 text-[11px]';

  return (
    <section>
      <h3 className="text-[13px] font-bold mb-1" style={{ color: '#cbd5e1' }}>Validação e qualidade do zoneamento</h3>
      <p className="text-[10px] mb-2" style={{ color: '#64748b' }}>
        Mede cada cenário com todos os indicadores — homogeneidade interna, separação entre zonas, fragmentação, continuidade, persistência entre safras e confiança da base.
        O <strong style={{ color: '#93c5fd' }}>IQZM</strong> é o resumo executivo; ele nunca substitui os indicadores individuais, que ficam abaixo.
      </p>

      <div className="flex flex-wrap items-end gap-3 mb-3">
        {camadas && camadas.length > 0 && (
          <label className="text-[11px]">
            <span className="block mb-0.5" style={{ color: '#64748b' }}>Camada de validação</span>
            <select value={camadaId} onChange={e => { setCamadaId(e.target.value); rodar(camadas, e.target.value); }}
              className="rounded px-2 py-1 text-[11px] outline-none" style={{ background: '#1a3a6b', border: '1px solid #2e5fa3', color: '#e2e8f0' }}>
              {camadas.map(c => <option key={c.id} value={c.id}>{c.grupo ? `${c.grupo} · ` : ''}{c.nome}</option>)}
            </select>
          </label>
        )}
        <button onClick={validar} disabled={rodando || !zoneamentos.length}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-semibold disabled:opacity-50" style={{ background: '#166534', color: '#fff' }}>
          {rodando ? <><Loader2 size={13} className="animate-spin" /> Calculando…</> : <><ShieldCheck size={13} /> {rels ? 'Recalcular' : 'Validar cenários'}</>}
        </button>
        {camadas && (
          <span className="text-[10px]" style={{ color: '#64748b' }}>
            {camadas.length} camada(s) · {periodos.length ? `safras: ${periodos.join(', ')}` : 'nenhuma safra identificada'}
          </span>
        )}
      </div>

      {erro && (
        <div className="flex items-start gap-1.5 p-2 rounded mb-3" style={{ background: '#2a0f12', border: '1px solid #7f1d1d' }}>
          <AlertTriangle size={12} style={{ color: '#f87171' }} className="flex-shrink-0 mt-0.5" />
          <p className="text-[10px]" style={{ color: '#fca5a5' }}>{erro}</p>
        </div>
      )}

      {rels && comparacao && (
        <>
          <div className="rounded-lg p-2.5 mb-3" style={{ background: '#0a1a2f', border: '1px solid #1a3a6b' }}>
            <p className="text-[11px]" style={{ color: '#cbd5e1' }}>{comparacao.veredito}</p>
          </div>

          <div className="overflow-x-auto rounded-lg mb-4" style={{ border: '1px solid #1a3a6b' }}>
            <table className="w-full border-collapse" style={{ minWidth: 720 }}>
              <thead>
                <tr style={{ background: '#0a1a2f', color: '#93c5fd' }}>
                  <th className={th}>Cenário</th>
                  {RESUMO_TABELA.map(id => (
                    <th key={id} className={th}>{rels[0].indicadores.find(i => i.id === id)?.nome.split(' — ')[0] ?? id}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rels.map(r => {
                  const linha = comparacao.linhas.find(l => l.cenarioId === r.cenarioId);
                  const sel = r.cenarioId === detalheId;
                  return (
                    <tr key={r.cenarioId} onClick={() => setDetalheId(r.cenarioId)} className="cursor-pointer"
                      style={{ background: sel ? '#12294a' : linha?.melhor ? '#0f2a1a' : 'transparent', borderTop: '1px solid #12294a' }}>
                      <td className={td}>
                        <div className="flex items-center gap-1.5">
                          {linha?.melhor && <ShieldCheck size={12} style={{ color: '#4ade80' }} />}
                          <span className="font-semibold">{r.cenarioNome}</span>
                          {r.parcial && <span className="text-[9px] px-1 rounded" style={{ color: '#fbbf24', background: '#fbbf2419' }}>parcial</span>}
                        </div>
                      </td>
                      {RESUMO_TABELA.map(id => {
                        const ind = r.indicadores.find(i => i.id === id)!;
                        return <td key={id} className={td} title={ind.justificativa}><Chip i={ind} /></td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {detalhe && (
            <>
              <h4 className="text-[12px] font-bold mb-2" style={{ color: '#cbd5e1' }}>
                {detalhe.cenarioNome}
                {detalhe.camadaValidacao && <span className="font-normal text-[10px]" style={{ color: '#64748b' }}> · medido em {detalhe.camadaValidacao.nome} ({detalhe.camadaValidacao.unidade})</span>}
              </h4>

              <div className="grid gap-2 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}>
                {detalhe.indicadores.map(i => <CardIndicador key={i.id} i={i} />)}
              </div>

              {detalhe.recomendacoes.length > 0 && (
                <div className="space-y-1.5 mb-4">
                  {detalhe.recomendacoes.map((r, k) => {
                    const cor = r.severidade === 'critica' ? '#f87171' : r.severidade === 'atencao' ? '#fbbf24' : '#93c5fd';
                    const Icone = r.severidade === 'informativa' ? Info : AlertTriangle;
                    return (
                      <div key={k} className="flex items-start gap-1.5 p-2 rounded" style={{ background: '#0a1a2f', border: `1px solid ${cor}44` }}>
                        <Icone size={12} style={{ color: cor }} className="flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[10px] leading-relaxed" style={{ color: '#cbd5e1' }}>{r.texto}</p>
                          <p className="text-[9px] mt-0.5" style={{ color: '#475569' }}>
                            base: {r.base.map(b => detalhe.indicadores.find(i => i.id === b)?.nome.split(' — ')[0] ?? b).join(' · ')}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <button onClick={() => setVerZonas(v => !v)} className="flex items-center gap-1 text-[11px] font-semibold mb-1" style={{ color: '#93c5fd' }}>
                {verZonas ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Indicadores zona a zona ({detalhe.porZona.length})
              </button>
              {verZonas && (
                <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid #1a3a6b' }}>
                  <table className="w-full border-collapse" style={{ minWidth: 700 }}>
                    <thead>
                      <tr style={{ background: '#0a1a2f', color: '#93c5fd' }}>
                        <th className={th}>Zona</th><th className={th}>Classe</th><th className={th}>Área</th><th className={th}>% talhão</th>
                        <th className={th}>Polígonos</th><th className={th}>Pixels</th><th className={th}>Média</th><th className={th}>Mediana</th>
                        <th className={th}>CV</th><th className={th}>IVR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detalhe.porZona.map(z => (
                        <tr key={z.idZona} style={{ borderTop: '1px solid #12294a' }}>
                          <td className={td}>
                            <span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-middle" style={{ background: z.cor, border: '1px solid #fff3' }} />
                            {z.nome}
                          </td>
                          <td className={td} style={{ color: '#94a3b8' }}>{z.classe || '—'}</td>
                          <td className={td}>{fmtHa(z.areaHa)} ha</td>
                          <td className={td}>{num(z.percArea * 100, 0)}%</td>
                          <td className={td}>{z.nPoligonos}</td>
                          <td className={td} style={{ color: '#94a3b8' }}>{z.resumo ? z.resumo.n.toLocaleString('pt-BR') : '—'}</td>
                          <td className={td}>{z.resumo ? num(z.resumo.media) : '—'}</td>
                          <td className={td}>{z.resumo ? num(z.resumo.mediana) : '—'}</td>
                          <td className={td}>{z.resumo?.cv != null ? `${num(z.resumo.cv)}%` : '—'}</td>
                          <td className={td} title={z.ivr.justificativa}><Chip i={z.ivr} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
