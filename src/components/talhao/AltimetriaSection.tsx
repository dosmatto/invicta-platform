'use client';

// Aba Altimetria (MDE) — F1 Essencial (spec MDE + Análise Topográfica).
// Busca a base (Copernicus GLO-30 → SRTM, sem chave), mostra a PRÉVIA
// (hipsométrico / declividade / relevo sombreado + stats + histograma +
// avisos de qualidade) e, com a APROVAÇÃO do usuário, salva como MDE
// OFICIAL do talhão (metadados no store `inv_mde`; rasters na nuvem com
// prefixo mde__). Exporta GeoTIFF reusando o /grid-geotiff.

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { getTalhoes, getLegendas, getMdes, saveMde, setMdeOficial, deleteMde, type MdeTalhao } from '@/lib/store';
import { extrairPoligono, coordsFromBounds, exportarGeotiff, gradienteCss, type Grid } from '@/lib/fertilidade';
import { colorirGridComLegenda } from '@/lib/raster';
import { tocarBackend } from '@/lib/interpUrl';
import { emailUsuario } from '@/lib/auth';
import {
  buscarMde, salvarMdeNaNuvem, carregarMdeDaNuvem, excluirMdeDaNuvem, normalizarGrid0a100,
  FONTES_MDE, FONTES_MDE_INDISPONIVEIS, type FonteMde, type RespMde, type MdeCarregado,
} from '@/lib/mde';
import type { Legenda } from '@/lib/legendas';
import { Mountain, Loader2, Search, CheckCircle2, AlertTriangle, Trash2, Download, Star, Layers } from 'lucide-react';

const inputStyle = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;
const fmt = (v: number, d = 1) => v.toLocaleString('pt-BR', { maximumFractionDigits: d });

type CamadaVista = 'alt' | 'decl' | 'hs';

// Legenda de DECLIVIDADE (graus) — classes de relevo (Embrapa) fixas. Efêmera
// (objeto local): não entra na Biblioteca; F2+ pode oficializá-la.
const LEG_DECL: Legenda = {
  id: 'mde-decl-local', nome: 'Declividade (classes de relevo)',
  atributoId: 'declividade', atributo: 'Declividade', simbolo: 'Decl.',
  unidade: '°', metodo: 'MDE', fonte: 'INVICTA', categoria: 'altimetria-elevacao',
  invertida: false, tipoEscala: 'discreta', estilo: 'segmentado',
  dominioMin: 0, dominioMax: 45,
  classes: [
    { nome: 'Plano (0–1,7°)', valorMin: null, valorMax: 1.7, corInicio: '#1a9850', corFim: '#66bd63', larguraVisual: 20, ordem: 1 },
    { nome: 'Suave ondulado (–4,6°)', valorMin: 1.7, valorMax: 4.6, corInicio: '#a6d96a', corFim: '#d9ef8b', larguraVisual: 20, ordem: 2 },
    { nome: 'Ondulado (–11°)', valorMin: 4.6, valorMax: 11, corInicio: '#fee08b', corFim: '#fdae61', larguraVisual: 20, ordem: 3 },
    { nome: 'Forte ondulado (–24°)', valorMin: 11, valorMax: 24, corInicio: '#f46d43', corFim: '#d73027', larguraVisual: 20, ordem: 4 },
    { nome: 'Montanhoso (>24°)', valorMin: 24, valorMax: null, corInicio: '#a50026', corFim: '#67001f', larguraVisual: 20, ordem: 5 },
  ],
  criadoEm: '', atualizadoEm: '',
};

export function AltimetriaSection() {
  const { nav, uploadedGeo, setFertilidadeOverlay, setFertilidadeLabels } = useApp();

  const legendaAlt = useMemo<Legenda | null>(
    () => getLegendas().find(l => l.atributoId === 'altimetria' || l.categoria === 'altimetria-elevacao') ?? null, []);

  const poligono = useMemo(() => {
    const p = extrairPoligono(uploadedGeo);
    if (p) return p;
    if (!nav.talhaoId) return null;
    const t = getTalhoes().find(x => x.id === nav.talhaoId);
    if (t?.geojson) { try { return extrairPoligono(JSON.parse(t.geojson)); } catch {} }
    return null;
  }, [uploadedGeo, nav.talhaoId]);

  const [mdes, setMdes] = useState<MdeTalhao[]>([]);
  const [fonte, setFonte] = useState<FonteMde>('auto');
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState('');
  const [previa, setPrevia] = useState<RespMde | null>(null);       // prévia AINDA não aprovada
  const [salvando, setSalvando] = useState(false);
  const [oficialDados, setOficialDados] = useState<(MdeCarregado & { meta: MdeTalhao }) | null>(null);
  const [camada, setCamada] = useState<CamadaVista>('alt');
  const [exportando, setExportando] = useState<'alt' | 'decl' | null>(null);

  const oficial = mdes.find(m => m.oficial) ?? null;

  useEffect(() => { tocarBackend(); }, []);
  useEffect(() => {
    setPrevia(null); setErro(''); setOficialDados(null); setCamada('alt');
    setMdes(nav.talhaoId ? getMdes(nav.talhaoId) : []);
  }, [nav.talhaoId]);

  // Autoload da base OFICIAL (nuvem) quando não há prévia em andamento.
  useEffect(() => {
    if (!nav.talhaoId || !oficial || previa) return;
    let vivo = true;
    carregarMdeDaNuvem(nav.talhaoId, oficial.id)
      .then(d => { if (vivo && d) setOficialDados({ ...d, meta: oficial }); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [nav.talhaoId, oficial?.id, previa]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { setFertilidadeOverlay(null); setFertilidadeLabels(null); }, [setFertilidadeOverlay, setFertilidadeLabels]);

  // Render da camada escolhida (da prévia OU da oficial carregada).
  useEffect(() => {
    const fonteDados = previa ?? oficialDados;
    if (!fonteDados) { setFertilidadeOverlay(null); return; }
    const bounds = fonteDados.bounds;
    let url = '';
    try {
      if (camada === 'hs') {
        url = (previa ? previa.hillshade_png : oficialDados?.hillshadePng) ?? '';
      } else if (camada === 'alt' && legendaAlt) {
        const g: Grid | null = previa ? previa.elevacao : oficialDados?.elevacao ?? null;
        if (g) url = colorirGridComLegenda(normalizarGrid0a100(g), legendaAlt).dataUrl;
      } else if (camada === 'decl') {
        const g: Grid | null = previa ? previa.declividade : oficialDados?.declividade ?? null;
        if (g) url = colorirGridComLegenda(g, LEG_DECL).dataUrl;
      }
    } catch { /* grid inválido */ }
    if (!url) { setFertilidadeOverlay(null); return; }
    setFertilidadeOverlay({ url, coordinates: coordsFromBounds(bounds), opacity: 1 });
    setFertilidadeLabels(null);
  }, [previa, oficialDados, camada, legendaAlt, setFertilidadeOverlay, setFertilidadeLabels]);

  async function buscar() {
    if (!poligono || buscando) return;
    setBuscando(true); setErro(''); setPrevia(null);
    try {
      const r = await buscarMde({ poligono, fonte });
      setPrevia(r); setCamada('alt');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao buscar o MDE.');
    } finally { setBuscando(false); }
  }

  async function aprovar() {
    if (!previa || !nav.talhaoId || salvando) return;
    // spec §19: MDE já aprovado → confirmação antes de substituir (a antiga fica no histórico).
    if (oficial && !confirm(`Este talhão já tem um MDE oficial (${oficial.rotuloFonte}). Aprovar esta base a torna a NOVA oficial — a anterior fica no histórico. Continuar?`)) return;
    setSalvando(true); setErro('');
    try {
      const meta = saveMde({
        talhaoId: nav.talhaoId, fonte: previa.fonte, rotuloFonte: previa.rotulo,
        resolucaoM: previa.resolucao_m,
        stats: { alt_min: previa.stats.alt_min, alt_med: previa.stats.alt_med, alt_max: previa.stats.alt_max, amplitude: previa.stats.amplitude, decl_media: previa.stats.decl_media, decl_max: previa.stats.decl_max },
        usuario: emailUsuario() || undefined,
        oficial: true,
      });
      await salvarMdeNaNuvem(nav.talhaoId, meta.id, previa);
      setMdes(getMdes(nav.talhaoId));
      setPrevia(null);   // o autoload assume com a oficial recém-salva
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao salvar o MDE.');
    } finally { setSalvando(false); }
  }

  function tornarOficial(m: MdeTalhao) {
    setMdeOficial(m.id);
    setMdes(getMdes(nav.talhaoId ?? undefined));
    setOficialDados(null);  // força recarregar a nova oficial
  }

  function excluirVersao(m: MdeTalhao) {
    if (!confirm(`Excluir a versão ${m.rotuloFonte} de ${new Date(m.criadoEm).toLocaleDateString('pt-BR')}${m.oficial ? ' (OFICIAL)' : ''}? Os rasters dela na nuvem também são apagados.`)) return;
    if (nav.talhaoId) excluirMdeDaNuvem(nav.talhaoId, m.id);
    deleteMde(m.id);
    setMdes(getMdes(nav.talhaoId ?? undefined));
    if (oficialDados?.meta.id === m.id) setOficialDados(null);
  }

  async function baixarGeotiff(qual: 'alt' | 'decl') {
    const src = previa ?? oficialDados;
    if (!src || exportando) return;
    const grid = qual === 'alt'
      ? (previa ? previa.elevacao : oficialDados?.elevacao)
      : (previa ? previa.declividade : oficialDados?.declividade);
    if (!grid) return;
    setExportando(qual);
    try {
      const nomeT = getTalhoes().find(t => t.id === nav.talhaoId)?.nome ?? 'talhao';
      const base = `${nomeT}_${qual === 'alt' ? 'altitude' : 'declividade'}`.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_');
      const blob = await exportarGeotiff(grid, src.bounds, `${base}.tif`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${base}.tif`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao exportar GeoTIFF.');
    } finally { setExportando(null); }
  }

  if (!nav.talhaoId) return <div className="px-6 py-4"><Aviso texto="Abra um talhão para buscar o MDE." /></div>;

  const stats = previa?.stats ?? null;
  const temDados = !!(previa || oficialDados);

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Base oficial (quando existe e não há prévia em andamento) */}
      {oficial && !previa && (
        <div className="rounded-lg p-2.5 space-y-1" style={{ background: '#0f2a1a', border: '1px solid #2a5a3a' }}>
          <div className="flex items-center gap-2">
            <CheckCircle2 size={13} style={{ color: '#86efac' }} />
            <span className="text-[11px] font-bold" style={{ color: '#86efac' }}>MDE oficial: {oficial.rotuloFonte}</span>
          </div>
          <p className="text-[9px]" style={{ color: '#94a3b8' }}>
            {oficial.stats.alt_min}–{oficial.stats.alt_max} m (amplitude {fmt(oficial.stats.amplitude)} m)
            {oficial.stats.decl_media != null && <> · declividade média {fmt(oficial.stats.decl_media)}°</>}
            {' · '}aprovado em {new Date(oficial.criadoEm).toLocaleDateString('pt-BR')}{oficial.usuario ? ` por ${oficial.usuario}` : ''}
          </p>
          {!oficialDados && <p className="text-[9px] flex items-center gap-1" style={{ color: '#64748b' }}><Loader2 size={10} className="animate-spin" /> carregando os mapas da nuvem…</p>}
        </div>
      )}

      {/* Busca */}
      <div className="rounded-lg p-2.5 space-y-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
        <p className="text-[11px] font-semibold flex items-center gap-1.5" style={{ color: '#93c5fd' }}><Mountain size={13} /> {oficial ? 'Buscar outra base' : 'Buscar o MDE do talhão'}</p>
        <div>
          <label className="text-[9px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Fonte</label>
          <select value={fonte} onChange={e => setFonte(e.target.value as FonteMde)} className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
            {FONTES_MDE.map(f => <option key={f.id} value={f.id}>{f.rotulo}</option>)}
            {FONTES_MDE_INDISPONIVEIS.map(f => <option key={f.rotulo} disabled>{f.rotulo} — {f.motivo}</option>)}
          </select>
        </div>
        <button onClick={() => void buscar()} disabled={buscando || !poligono}
          className="w-full py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-40"
          style={{ background: 'var(--invicta-green-dark)' }}>
          {buscando ? <><Loader2 size={13} className="animate-spin" /> Buscando e processando (~10–30 s)…</> : <><Search size={13} /> Buscar MDE</>}
        </button>
        {!poligono && <p className="text-[9px]" style={{ color: '#fbbf24' }}>Limite do talhão não encontrado.</p>}
        {erro && <p className="text-[10px]" style={{ color: '#f87171' }}>{erro}</p>}
      </div>

      {/* Prévia / visualização */}
      {temDados && (
        <div className="rounded-lg p-2.5 space-y-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold" style={{ color: previa ? '#fbbf24' : '#86efac' }}>
              {previa ? `PRÉVIA · ${previa.rotulo}` : 'Camadas da base oficial'}
            </p>
            <div className="flex gap-2">
              <button onClick={() => void baixarGeotiff('alt')} disabled={!!exportando} title="Baixar a altitude como GeoTIFF (EPSG:4326)" className="flex items-center gap-1 text-[9px] disabled:opacity-50" style={{ color: '#86efac' }}>
                {exportando === 'alt' ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />} Altitude
              </button>
              <button onClick={() => void baixarGeotiff('decl')} disabled={!!exportando} title="Baixar a declividade como GeoTIFF (EPSG:4326)" className="flex items-center gap-1 text-[9px] disabled:opacity-50" style={{ color: '#86efac' }}>
                {exportando === 'decl' ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />} Declividade
              </button>
            </div>
          </div>

          {/* Alternador de camada */}
          <div className="flex gap-1">
            {([['alt', 'Altitude'], ['decl', 'Declividade'], ['hs', 'Relevo sombreado']] as const).map(([v, t]) => (
              <button key={v} onClick={() => setCamada(v)} className="flex-1 py-1 rounded text-[10px] font-bold"
                style={{ background: camada === v ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: camada === v ? '#fff' : '#93c5fd' }}>
                {t}
              </button>
            ))}
          </div>

          {/* Legenda da camada ativa */}
          {camada === 'alt' && legendaAlt && (
            <div>
              <div className="relative h-4 rounded overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)', background: gradienteCss(legendaAlt) }} />
              <div className="flex justify-between text-[8px] mt-0.5" style={{ color: '#94a3b8' }}>
                <span>{stats ? `${fmt(stats.alt_min)} m` : `${fmt(oficialDados?.meta.stats.alt_min ?? 0)} m`}</span>
                <span style={{ color: '#64748b' }}>baixadas → topos (relativo à área)</span>
                <span>{stats ? `${fmt(stats.alt_max)} m` : `${fmt(oficialDados?.meta.stats.alt_max ?? 0)} m`}</span>
              </div>
            </div>
          )}
          {camada === 'decl' && (
            <div>
              <div className="relative h-4 rounded overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)', background: gradienteCss(LEG_DECL) }} />
              <div className="flex justify-between text-[8px] mt-0.5" style={{ color: '#94a3b8' }}>
                <span>plano</span><span>1,7°</span><span>4,6°</span><span>11°</span><span>24°</span><span>montanhoso</span>
              </div>
            </div>
          )}
          {camada === 'hs' && <p className="text-[9px]" style={{ color: '#64748b' }}>Relevo sombreado (iluminação NO 315° / 45°) — leitura visual do terreno.</p>}

          {/* Stats + histograma + avisos (prévia) */}
          {previa && stats && (
            <>
              <div className="grid grid-cols-4 gap-1 text-center">
                {([['Mínima', `${fmt(stats.alt_min)} m`], ['Média', `${fmt(stats.alt_med)} m`], ['Máxima', `${fmt(stats.alt_max)} m`], ['Amplitude', `${fmt(stats.amplitude)} m`]] as const).map(([r, v]) => (
                  <div key={r} className="rounded px-1 py-1.5" style={{ background: '#0a1a2f', border: '1px solid #1a3a6b' }}>
                    <p className="text-[8px]" style={{ color: '#64748b' }}>{r}</p>
                    <p className="text-[11px] font-bold" style={{ color: '#e2e8f0' }}>{v}</p>
                  </div>
                ))}
              </div>
              <p className="text-[9px]" style={{ color: '#94a3b8' }}>
                Declividade média {stats.decl_media != null ? `${fmt(stats.decl_media)}°` : '—'} · máxima {stats.decl_max != null ? `${fmt(stats.decl_max)}°` : '—'} · resolução {previa.resolucao_m} m · {stats.n_px.toLocaleString('pt-BR')} px · EPSG:4326
              </p>

              {/* Histograma de altitude */}
              <div>
                <p className="text-[9px] font-semibold mb-0.5" style={{ color: '#64748b' }}>Distribuição da altitude</p>
                <div className="flex items-end gap-[1px] h-10">
                  {previa.histograma.counts.map((c, i) => {
                    const mx = Math.max(...previa.histograma.counts, 1);
                    return <div key={i} className="flex-1 rounded-t-[1px]" style={{ height: `${Math.max(2, (c / mx) * 100)}%`, background: '#2e5fa3' }} title={`${c} px`} />;
                  })}
                </div>
                <div className="flex justify-between text-[8px]" style={{ color: '#475569' }}>
                  <span>{fmt(previa.histograma.ini)} m</span><span>{fmt(previa.histograma.fim)} m</span>
                </div>
              </div>

              {previa.avisos.map((a, i) => (
                <p key={i} className="text-[9px] flex items-start gap-1" style={{ color: '#fbbf24' }}><AlertTriangle size={10} className="flex-shrink-0 mt-[1px]" /> {a}</p>
              ))}

              <button onClick={() => void aprovar()} disabled={salvando}
                className="w-full py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
                style={{ background: '#15803d' }}>
                {salvando ? <><Loader2 size={13} className="animate-spin" /> Salvando…</> : <><CheckCircle2 size={13} /> Aprovar — virar MDE oficial do talhão</>}
              </button>
              <button onClick={() => { setPrevia(null); setErro(''); }} className="w-full py-1.5 rounded text-[10px]" style={{ background: '#1a3a6b', color: '#cbd5e1' }}>
                Descartar prévia
              </button>
            </>
          )}
        </div>
      )}

      {/* Histórico de versões (spec §21 — nunca apagar automaticamente) */}
      {mdes.length > 1 && (
        <div className="rounded-lg p-2.5 space-y-1" style={{ background: '#0a1a2f', border: '1px solid #1a3a6b' }}>
          <p className="text-[10px] font-bold flex items-center gap-1.5" style={{ color: '#93c5fd' }}><Layers size={11} /> Versões ({mdes.length})</p>
          {mdes.map(m => (
            <div key={m.id} className="flex items-center gap-2 text-[9px] rounded px-2 py-1" style={{ background: '#061525', border: `1px solid ${m.oficial ? '#2a5a3a' : '#1a3a6b'}` }}>
              <span className="flex-1 truncate" style={{ color: '#cbd5e1' }}>
                {m.rotuloFonte} · {new Date(m.criadoEm).toLocaleDateString('pt-BR')}
                {m.oficial && <span className="ml-1 font-bold" style={{ color: '#86efac' }}>· oficial</span>}
              </span>
              {!m.oficial && (
                <button onClick={() => tornarOficial(m)} title="Restaurar esta base como oficial" className="flex items-center gap-0.5" style={{ color: '#fbbf24' }}>
                  <Star size={10} /> Tornar oficial
                </button>
              )}
              <button onClick={() => excluirVersao(m)} title="Excluir versão" style={{ color: '#f87171' }}><Trash2 size={10} /></button>
            </div>
          ))}
        </div>
      )}

      <p className="text-[9px] leading-relaxed" style={{ color: '#475569' }}>
        MDE de 30 m dá excelente visão geral, mas tem limite em talhões pequenos; TWI/fluxo (fases seguintes) são tendências, não medição de água. Bases próprias (drone/RTK) entram numa fase futura.
      </p>
    </div>
  );
}

function Aviso({ texto }: { texto: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: '#2d1a00', border: '1px solid #92400e' }}>
      <AlertTriangle size={14} style={{ color: '#fbbf24' }} className="flex-shrink-0 mt-0.5" />
      <p className="text-[10px]" style={{ color: '#fbbf24' }}>{texto}</p>
    </div>
  );
}
