'use client';

// Aba Recomendações da Página do Talhão (Fase R3.A): aplica UMA equação aos
// mapas de fertilidade do talhão+safra e mostra o mapa de DOSE no mapa, com
// estatísticas e custo. A profundidade vem da própria equação (automático).
// Aplicar a Recomendação completa (N equações) + persistência = Fase R3.B.

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { getImportacoesLab, getTalhoes, type ImportacaoLab } from '@/lib/store';
import { listar as bibListar, type ItemBiblioteca, type ConteudoEquacao } from '@/lib/biblioteca';
import { carregarGridsTalhao, aplicarEquacao, type ResultadoAplicacao } from '@/lib/recomendacao/aplicar';
import { colorirDose } from '@/lib/raster';
import { coordsFromBounds } from '@/lib/fertilidade';
import { Play, Loader2, AlertTriangle, Wand2 } from 'lucide-react';

const inputStyle = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;
const fmt = (v: number, dec = 0) => v.toLocaleString('pt-BR', { maximumFractionDigits: dec, minimumFractionDigits: dec });

export function RecomendacaoSection({ safraNome }: { safraNome?: string }) {
  const { nav, setFertilidadeOverlay, setFertilidadeLabels } = useApp();
  const safra = safraNome ?? '';

  const [importacoes, setImportacoes] = useState<ImportacaoLab[]>([]);
  const [importacaoId, setImportacaoId] = useState('');
  const [equacoes, setEquacoes] = useState<ItemBiblioteca<ConteudoEquacao>[]>([]);
  const [equacaoId, setEquacaoId] = useState('');
  const [estado, setEstado] = useState<'idle' | 'carregando' | 'pronto' | 'erro'>('idle');
  const [erro, setErro] = useState('');
  const [resultado, setResultado] = useState<ResultadoAplicacao | null>(null);

  useEffect(() => {
    const load = () => setEquacoes(bibListar<ConteudoEquacao>('equacoes').filter(e => e.ativo));
    load();
    const onBib = (e: Event) => { const d = (e as CustomEvent).detail as { slug?: string } | undefined; if (!d?.slug || d.slug === 'equacoes') load(); };
    if (typeof window !== 'undefined') window.addEventListener('inv:biblioteca', onBib);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('inv:biblioteca', onBib); };
  }, []);

  useEffect(() => { if (nav.talhaoId && safra) setImportacoes(getImportacoesLab(nav.talhaoId, safra)); }, [nav.talhaoId, safra]);
  useEffect(() => {
    if (importacaoId || importacoes.length === 0) return;
    const r = [...importacoes].sort((a, b) => (b.criadoEm ?? '').localeCompare(a.criadoEm ?? ''))[0];
    if (r) setImportacaoId(r.id);
  }, [importacoes, importacaoId]);

  const talhao = useMemo(() => getTalhoes().find(t => t.id === nav.talhaoId) ?? null, [nav.talhaoId]);
  const eqSel = equacoes.find(e => e.id === equacaoId) ?? null;

  useEffect(() => { setResultado(null); setEstado('idle'); setErro(''); }, [equacaoId, importacaoId]);

  // pinta o mapa de dose no overlay quando há resultado
  useEffect(() => {
    if (!resultado || !eqSel) return;
    try {
      const png = colorirDose(resultado.grid, eqSel.conteudo.estilo);
      setFertilidadeOverlay({ url: png.dataUrl, coordinates: coordsFromBounds(resultado.bounds), opacity: 1 });
      setFertilidadeLabels(null);
    } catch (e) { console.warn('[recomendacao] colorir falhou', e); }
  }, [resultado, eqSel, setFertilidadeOverlay, setFertilidadeLabels]);
  useEffect(() => () => { setFertilidadeOverlay(null); setFertilidadeLabels(null); }, [setFertilidadeOverlay, setFertilidadeLabels]);

  async function aplicar() {
    if (!eqSel) { setErro('Escolha uma equação.'); setEstado('erro'); return; }
    if (!nav.talhaoId || !importacaoId) { setErro('Selecione uma importação de laboratório.'); setEstado('erro'); return; }
    setEstado('carregando'); setErro(''); setResultado(null);
    try {
      const grids = await carregarGridsTalhao(nav.talhaoId, importacaoId);
      const res = aplicarEquacao(eqSel.conteudo, grids);
      setResultado(res); setEstado('pronto');
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); setEstado('erro'); }
  }

  const fin = useMemo(() => {
    if (!resultado || !eqSel) return null;
    const eq = eqSel.conteudo;
    const area = talhao?.areaHa ?? 0;
    const u = (eq.unidadeTratamento || '').toLowerCase();
    const ehT = u.includes('t/ha') || u.includes('ton');
    const totalT = ehT ? resultado.stats.media * area : resultado.stats.media * area / 1000;
    const custo = eq.custoTonelada != null ? totalT * eq.custoTonelada : null;
    return { area, totalT, custo };
  }, [resultado, eqSel, talhao]);

  const classes = useMemo(() => {
    if (!eqSel) return [];
    return [...eqSel.conteudo.estilo.classes].sort((a, b) => a.limiteSuperior - b.limiteSuperior);
  }, [eqSel]);

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Wand2 size={14} style={{ color: '#a78bfa' }} />
        <h3 className="text-sm font-bold" style={{ color: '#e2e8f0' }}>Aplicar equação</h3>
      </div>
      <p className="text-[10px]" style={{ color: '#64748b' }}>
        Aplica uma equação aos mapas de fertilidade desta safra e gera o mapa de dose. A profundidade é a definida na própria equação. Aplicar uma <strong>recomendação inteira</strong> (várias equações) vem na próxima etapa.
      </p>

      <div>
        <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>Importação de laboratório</label>
        <select value={importacaoId} onChange={e => setImportacaoId(e.target.value)} className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle}>
          {importacoes.length === 0 && <option value="">Nenhuma importação nesta safra</option>}
          {importacoes.map(i => <option key={i.id} value={i.id}>{i.laboratorio || 'Importação'} · {(i.criadoEm ?? '').slice(0, 10)}</option>)}
        </select>
      </div>

      <div>
        <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>Equação</label>
        {equacoes.length === 0 ? (
          <p className="text-[10px]" style={{ color: '#fbbf24' }}>Nenhuma equação. Crie em <strong>Biblioteca → Equações</strong>.</p>
        ) : (
          <select value={equacaoId} onChange={e => setEquacaoId(e.target.value)} className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle}>
            <option value="">Escolha uma equação…</option>
            {equacoes.map(e => <option key={e.id} value={e.id}>{e.nome}{e.conteudo.profundidade ? ` (${e.conteudo.profundidade})` : ''}</option>)}
          </select>
        )}
      </div>

      <button onClick={aplicar} disabled={!eqSel || !importacaoId || estado === 'carregando'}
        className="w-full py-2 rounded text-[11px] font-bold text-white flex items-center justify-center gap-1.5"
        style={{ background: (!eqSel || !importacaoId || estado === 'carregando') ? '#1a3a6b' : 'var(--invicta-green-dark)', opacity: (!eqSel || !importacaoId) ? 0.5 : 1 }}>
        {estado === 'carregando' ? <><Loader2 size={13} className="animate-spin" /> Aplicando…</> : <><Play size={13} /> Aplicar no mapa</>}
      </button>

      {erro && (
        <div className="px-2 py-1.5 rounded text-[10px] flex items-start gap-1.5" style={{ background: '#3a1a1a', color: '#fca5a5', border: '1px solid #7f1d1d' }}>
          <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" /> <span>{erro}</span>
        </div>
      )}

      {estado === 'pronto' && resultado && eqSel && (
        <div className="rounded-lg p-3 space-y-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
          <div className="text-[11px] font-bold" style={{ color: '#e2e8f0' }}>{eqSel.nome}</div>
          <div className="text-[9px]" style={{ color: '#64748b' }}>
            {eqSel.conteudo.produto || 'sem produto'} · {eqSel.conteudo.unidadeTratamento || '—'} · {eqSel.conteudo.profundidade} cm
          </div>

          {/* estatísticas */}
          <div className="grid grid-cols-3 gap-2 text-center">
            {([['Mín', resultado.stats.min], ['Média', resultado.stats.media], ['Máx', resultado.stats.max]] as [string, number][]).map(([k, v]) => (
              <div key={k} className="rounded py-1" style={{ background: '#0b1f38' }}>
                <div className="text-[8px] uppercase" style={{ color: '#64748b' }}>{k}</div>
                <div className="text-[12px] font-bold" style={{ color: '#e2e8f0' }}>{fmt(v, 0)}</div>
              </div>
            ))}
          </div>
          <div className="text-[9px] text-center" style={{ color: '#64748b' }}>dose em {eqSel.conteudo.unidadeTratamento || 'unidade'}</div>

          {/* financeiro */}
          {fin && (
            <div className="text-[10px] space-y-0.5 pt-1" style={{ color: '#cbd5e1', borderTop: '1px solid #1a3a6b' }}>
              <div className="flex justify-between"><span>Área</span><span>{fmt(fin.area, 1)} ha</span></div>
              <div className="flex justify-between"><span>Total estimado</span><span>{fmt(fin.totalT, 1)} t</span></div>
              {fin.custo != null
                ? <div className="flex justify-between font-bold" style={{ color: '#4ade80' }}><span>Custo estimado</span><span>R$ {fmt(fin.custo, 2)}</span></div>
                : <div className="text-[9px]" style={{ color: '#64748b' }}>Defina o custo/tonelada na equação para ver o custo.</div>}
            </div>
          )}

          {/* legenda */}
          {classes.length > 0 && (
            <div className="pt-1" style={{ borderTop: '1px solid #1a3a6b' }}>
              <div className="text-[9px] font-semibold mb-1" style={{ color: '#94a3b8' }}>Legenda (dose)</div>
              <div className="space-y-0.5">
                {classes.map((c, i) => {
                  const inf = i === 0 ? eqSel.conteudo.estilo.valorMinimo : classes[i - 1].limiteSuperior;
                  return (
                    <div key={i} className="flex items-center gap-1.5 text-[9px]" style={{ color: '#cbd5e1' }}>
                      <span className="w-4 h-3 rounded" style={{ background: c.cor, border: '1px solid #2e5fa3' }} />
                      <span>{fmt(inf)} – {fmt(c.limiteSuperior)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
