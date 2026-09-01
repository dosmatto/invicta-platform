'use client';

// Composição Temporal de Índices (IV5) — painel dentro do módulo de Índices
// Vegetativos. Usa SÓ as cenas MANTIDAS (aprovadas na prévia RGB): escolha o
// índice base, 2+ datas e o método (mediana padrão) → gera no navegador →
// conferência no mapa → APROVAR salva (nunca automático) → a camada aprovada
// e apta entra no MEAP (Sensoriamento Remoto).

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { getPlantio, getComposicoes, saveComposicao, deleteComposicao, type ComposicaoTemporal } from '@/lib/store';
import { coordsFromBounds, comprimirGrid, descomprimirGrid, decodeGrid, exportarGeotiff, type Grid } from '@/lib/fertilidade';
import { colorirGrid } from '@/lib/raster';
import { faixaPercentis } from '@/lib/quantis';
import { sanitizar } from '@/lib/nomeExport';
import { rampaVisualStops, type Legenda } from '@/lib/legendas';
import { legendasDoModulo } from './SeletorLegenda';
import { carregarNdviSalvos, encodeF32, type NdviCamada } from '@/lib/meap/gerar';
import { cloudSalvarMapa, cloudCarregarMapasPorPrefixo, cloudExcluirMapasPorPrefixo } from '@/lib/cloud';
import { compor, nomeTecnico, METODOS_COMPOSICAO, MIN_PCT_VALIDOS_ZONAS, type MetodoComposicao, type ResultadoComposicao, type CenaComposicao } from '@/lib/composicao';
import { emailUsuario } from '@/lib/empresa';
import { Layers3, Loader2, CheckCircle2, AlertTriangle, Trash2, Eye, Play, Contrast, Download } from 'lucide-react';

import { inputStyle } from '@/constants/ui';
const fmt = (v: number, d = 2) => v.toLocaleString('pt-BR', { maximumFractionDigits: d });
const ddmmyy = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });

const idNuvemComp = (talhaoId: string, compId: string) => `composicao__${talhaoId}__${compId}`;

// Grid + bounds de uma composição SALVA (o raster mora na nuvem, não no meta).
// Devolve o grid já descomprimido — serve tanto ao overlay quanto ao GeoTIFF.
async function carregarGridSalvo(talhaoId: string, compId: string): Promise<{ grid: Grid; bounds: [number, number, number, number] } | null> {
  const docs = await cloudCarregarMapasPorPrefixo<{ resp: { bounds: [number, number, number, number]; grid?: Grid } }>(idNuvemComp(talhaoId, compId));
  const d = docs[0]?.dados?.resp;
  if (!d?.grid?.b64) return null;
  const grid = d.grid.comp === 'gz' ? await descomprimirGrid(d.grid) : d.grid;
  return { grid, bounds: d.bounds };
}

// Dispara o download de um Blob já pronto (o <a> some depois do clique).
function baixarBlob(blob: Blob, nomeArquivo: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nomeArquivo;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function ComposicaoTemporalPanel({ safraNome }: { safraNome?: string }) {
  const { nav, setFertilidadeOverlay } = useApp();
  const talhaoId = nav.talhaoId ?? '';

  const legNdvi = useMemo<Legenda | undefined>(() => legendasDoModulo('ndvi')[0], []);
  const gradCss = useMemo(() => {
    if (!legNdvi) return 'transparent';
    const stops = rampaVisualStops({ ...legNdvi, estilo: 'continuo' });
    return `linear-gradient(to right, ${stops.map(([pos, [r, g, b]]) => `rgb(${r},${g},${b}) ${(pos * 100).toFixed(1)}%`).join(', ')})`;
  }, [legNdvi]);

  const [cenas, setCenas] = useState<NdviCamada[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [indice, setIndice] = useState('NDVI');
  const [selDatas, setSelDatas] = useState<Record<string, boolean>>({});
  const [metodo, setMetodo] = useState<MetodoComposicao>('mediana');
  const [nome, setNome] = useState('');
  const [nomeTocado, setNomeTocado] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState('');
  const [previa, setPrevia] = useState<(ResultadoComposicao & { indice: string; metodo: MetodoComposicao; datas: string[]; sensores: string[] }) | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvas, setSalvas] = useState<ComposicaoTemporal[]>([]);
  const [vendo, setVendo] = useState<string | null>(null);   // composição salva em visualização
  const [contraste, setContraste] = useState(false);         // escala esticada p2–p98
  const [dominioMapa, setDominioMapa] = useState<[number, number] | null>(null);  // escala do que está no mapa
  const [baixandoTif, setBaixandoTif] = useState('');        // 'previa' | id da composição salva
  const [erroTif, setErroTif] = useState('');

  // Cenas mantidas do talhão (aprovadas na prévia RGB), agrupadas por índice.
  useEffect(() => {
    let vivo = true;
    setCarregando(true); setCenas([]); setPrevia(null); setSelDatas({});
    if (!talhaoId) { setCarregando(false); return; }
    carregarNdviSalvos(talhaoId)
      .then(cs => { if (vivo) setCenas(cs); })
      .catch(() => {})
      .finally(() => { if (vivo) setCarregando(false); });
    setSalvas(getComposicoes(talhaoId));
    return () => { vivo = false; };
  }, [talhaoId]);

  useEffect(() => () => { setFertilidadeOverlay(null); }, [setFertilidadeOverlay]);

  const indicesDisp = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cenas) m.set(c.indice, (m.get(c.indice) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [cenas]);

  const cenasDoIndice = useMemo(
    () => cenas.filter(c => c.indice === indice).sort((a, b) => a.data.localeCompare(b.data)),
    [cenas, indice]);
  const marcadas = cenasDoIndice.filter(c => selDatas[c.chave]);

  // Nome amigável automático (editável). Ex.: "NDVI Mediana — Soja 25/26".
  useEffect(() => {
    if (nomeTocado || marcadas.length === 0) return;
    const met = METODOS_COMPOSICAO.find(x => x.id === metodo)?.rotulo ?? metodo;
    const cultura = talhaoId && safraNome ? getPlantio(talhaoId, safraNome) : '';
    const sufixo = [cultura, safraNome].filter(Boolean).join(' ');
    setNome(`${indice} ${met}${sufixo ? ` — ${sufixo}` : ''} (${marcadas.length} datas)`);
  }, [indice, metodo, marcadas.length, nomeTocado, safraNome, talhaoId]);

  function gerar() {
    if (marcadas.length < 2 || gerando) return;
    setGerando(true); setErro(''); setVendo(null);
    // deixa o spinner pintar antes do cálculo síncrono
    setTimeout(() => {
      try {
        const entrada: CenaComposicao[] = marcadas.map(c => {
          const { valores } = decodeGrid({ b64: c.b64, shape: c.shape });
          return { valores, shape: c.shape, bounds: c.bounds };
        });
        const r = compor(entrada, metodo);
        const sensores = [...new Set(marcadas.map(c => (c.nut.startsWith('ndvi_cbers') ? 'CBERS-4A' : 'Sentinel-2')))];
        setPrevia({ ...r, indice, metodo, datas: marcadas.map(c => c.data), sensores });
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Falha ao compor.');
      } finally { setGerando(false); }
    }, 30);
  }

  // Overlay da prévia (ou da composição salva em visualização).
  useEffect(() => {
    (async () => {
      if (previa) {
        const grid: Grid = { b64: encodeF32(previa.valores), shape: previa.shape };
        mostrarGrid(grid, previa.bounds, previa.indice);
        return;
      }
      if (vendo && talhaoId) {
        try {
          const d = await carregarGridSalvo(talhaoId, vendo);
          if (d) mostrarGrid(d.grid, d.bounds, salvas.find(s => s.id === vendo)?.indice ?? 'NDVI');
        } catch {}
        return;
      }
      setFertilidadeOverlay(null);
      setDominioMapa(null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previa, vendo, contraste]);

  // Escala de cor do que vai ao mapa. Sem contraste: NDVI no domínio da legenda
  // oficial (0–1, comparável entre datas e talhões) e os demais índices no
  // mín–máx do composto. Com CONTRASTE: p2–p98 do próprio composto — a mediana
  // do período aperta a distribuição (é essa a graça dela), e no domínio fixo o
  // talhão inteiro sai de um verde só, escondendo justamente a variação interna
  // que a composição existe para mostrar.
  function mostrarGrid(grid: Grid, bounds: [number, number, number, number], ind: string) {
    if (!legNdvi) return;
    const stops = rampaVisualStops({ ...legNdvi, estilo: 'continuo' });
    let dominio: [number, number] = [legNdvi.dominioMin ?? 0, legNdvi.dominioMax ?? 1];
    if (contraste) {
      dominio = faixaPercentis(decodeGrid(grid).valores, 2, 98);
    } else if (ind !== 'NDVI') {
      const { valores } = decodeGrid(grid);
      let mn = Infinity, mx = -Infinity;
      for (let i = 0; i < valores.length; i++) { const v = valores[i]; if (isFinite(v)) { if (v < mn) mn = v; if (v > mx) mx = v; } }
      if (mn < mx) dominio = [mn, mx];
    }
    const { dataUrl } = colorirGrid(grid, dominio, stops);
    setDominioMapa(dominio);
    setFertilidadeOverlay({ url: dataUrl, coordinates: coordsFromBounds(bounds), opacity: 1 });
  }

  // GeoTIFF da PRÉVIA (ainda não salva) — mesmos valores que estão no mapa,
  // EPSG:4326, float32, nodata onde nenhuma cena tinha dado.
  async function baixarTifPrevia() {
    if (!previa || baixandoTif) return;
    setBaixandoTif('previa'); setErroTif('');
    try {
      const base = sanitizar(nomeTecnico(previa.indice, previa.metodo, previa.datas));
      const blob = await exportarGeotiff({ b64: encodeF32(previa.valores), shape: previa.shape }, previa.bounds, base);
      baixarBlob(blob, `${base}.tif`);
    } catch (e) {
      setErroTif(e instanceof Error ? e.message : 'Falha ao gerar o GeoTIFF.');
    } finally { setBaixandoTif(''); }
  }

  async function aprovarSalvar() {
    if (!previa || !talhaoId || salvando) return;
    setSalvando(true); setErro('');
    try {
      const meta = saveComposicao({
        talhaoId,
        safra: safraNome || undefined,
        cultura: (safraNome ? getPlantio(talhaoId, safraNome) : '') || undefined,
        indice: previa.indice, metodo: previa.metodo,
        sensores: previa.sensores, datas: previa.datas,
        resolucaoPx: previa.shape, pctValidos: previa.pctValidos,
        mascaraNuvem: previa.sensores.includes('Sentinel-2'),
        nome: nome.trim() || `${previa.indice} ${previa.metodo}`,
        nomeTecnico: nomeTecnico(previa.indice, previa.metodo, previa.datas),
        aprovada: true, aptoZonas: previa.aptoZonas,
        usuario: emailUsuario() || undefined,
      });
      const gridGz = await comprimirGrid({ b64: encodeF32(previa.valores), shape: previa.shape });
      cloudSalvarMapa(idNuvemComp(talhaoId, meta.id), { resp: { bounds: previa.bounds, grid: gridGz } });
      setSalvas(getComposicoes(talhaoId));
      setPrevia(null); setSelDatas({}); setNomeTocado(false);
      setVendo(meta.id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao salvar.');
    } finally { setSalvando(false); }
  }

  function excluir(c: ComposicaoTemporal) {
    if (!confirm(`Excluir a composição "${c.nome}"?`)) return;
    cloudExcluirMapasPorPrefixo(idNuvemComp(c.talhaoId, c.id));
    deleteComposicao(c.id);
    setSalvas(getComposicoes(talhaoId));
    if (vendo === c.id) setVendo(null);
  }

  if (!talhaoId) return null;

  return (
    <div className="space-y-3">
      <p className="text-[9px] leading-relaxed" style={{ color: '#475569' }}>
        Combina 2+ imagens <strong>aprovadas</strong> do mesmo índice numa camada mais estável do período — reduz o efeito de nuvem, sombra e estresse momentâneo de uma data isolada. A <strong>mediana</strong> é o método recomendado.
      </p>

      {carregando ? (
        <p className="text-[10px] flex items-center gap-1.5" style={{ color: '#64748b' }}><Loader2 size={12} className="animate-spin" /> Carregando cenas mantidas…</p>
      ) : indicesDisp.length === 0 ? (
        <p className="text-[10px] p-2 rounded" style={{ color: '#fbbf24', background: '#2d1a00', border: '1px solid #92400e' }}>
          Nenhuma cena mantida ainda — na aba <strong>Imagens & índices</strong>, busque as imagens, aprove na prévia RGB, processe o índice e clique em Manter. Depois volte aqui.
        </p>
      ) : (
        <div className="rounded-lg p-2.5 space-y-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="text-[9px]" style={{ color: '#64748b' }}>Índice base
              <select value={indice} onChange={e => { setIndice(e.target.value); setSelDatas({}); setPrevia(null); }} className="w-full rounded px-2 py-1.5 text-xs outline-none mt-0.5" style={inputStyle}>
                {indicesDisp.map(([ind, n]) => <option key={ind} value={ind}>{ind} ({n} datas)</option>)}
              </select>
            </label>
            <label className="text-[9px]" style={{ color: '#64748b' }}>Método
              <select value={metodo} onChange={e => setMetodo(e.target.value as MetodoComposicao)} className="w-full rounded px-2 py-1.5 text-xs outline-none mt-0.5" style={inputStyle}>
                {METODOS_COMPOSICAO.map(m => <option key={m.id} value={m.id}>{m.rotulo} — {m.desc}</option>)}
              </select>
            </label>
          </div>

          <div>
            <p className="text-[9px] font-semibold mb-1" style={{ color: '#64748b' }}>Datas aprovadas ({marcadas.length} de {cenasDoIndice.length} marcadas — mínimo 2)</p>
            <div className="flex flex-wrap gap-1">
              {cenasDoIndice.map(c => {
                const sel = !!selDatas[c.chave];
                const fonte = c.nut.startsWith('ndvi_cbers') ? 'CBERS' : 'S2';
                return (
                  <button key={c.chave} onClick={() => { setSelDatas(s => ({ ...s, [c.chave]: !s[c.chave] })); setPrevia(null); }}
                    className="px-2 py-1 rounded text-[10px] font-bold"
                    style={{ background: sel ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: sel ? '#fff' : '#93c5fd' }}>
                    {ddmmyy(c.data)} · {fonte}
                  </button>
                );
              })}
            </div>
          </div>

          <button onClick={gerar} disabled={marcadas.length < 2 || gerando}
            className="w-full py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-40"
            style={{ background: 'var(--invicta-green-dark)' }}>
            {gerando ? <><Loader2 size={13} className="animate-spin" /> Compondo…</> : <><Play size={13} /> Gerar composição ({marcadas.length} datas)</>}
          </button>
          {erro && <p className="text-[10px]" style={{ color: '#f87171' }}>{erro}</p>}

          {/* Conferência da prévia — aprovar ou descartar (nada salva sozinho) */}
          {previa && (
            <div className="rounded p-2 space-y-1.5" style={{ background: '#0a1a2f', border: '1px solid #2e5fa3' }}>
              <p className="text-[10px] font-bold" style={{ color: '#fbbf24' }}>PRÉVIA — confira no mapa antes de aprovar</p>
              <p className="text-[9px]" style={{ color: '#94a3b8' }}>
                {previa.indice} · {METODOS_COMPOSICAO.find(m => m.id === previa.metodo)?.rotulo} · {previa.nCenas} datas · {previa.sensores.join(' + ')} · grade {previa.shape[0]}×{previa.shape[1]}
              </p>
              <p className="text-[9px]" style={{ color: '#94a3b8' }}>
                mín {fmt(previa.stats.min)} · média {fmt(previa.stats.media)} · máx {fmt(previa.stats.max)} · <strong style={{ color: previa.pctValidos >= MIN_PCT_VALIDOS_ZONAS ? '#86efac' : '#fbbf24' }}>{previa.pctValidos}% de pixels válidos</strong>
              </p>
              {previa.aptoZonas
                ? <p className="text-[9px] flex items-center gap-1" style={{ color: '#86efac' }}><CheckCircle2 size={11} /> Apta para Zonas de Manejo (entra no MEAP como Sensoriamento Remoto)</p>
                : <p className="text-[9px] flex items-start gap-1" style={{ color: '#fbbf24' }}><AlertTriangle size={11} className="flex-shrink-0 mt-[1px]" /> Abaixo de {MIN_PCT_VALIDOS_ZONAS}% de pixels válidos — será salva como camada de CONSULTA (não recomendada para gerar zonas).</p>}
              <label className="text-[9px] block" style={{ color: '#64748b' }}>Nome da camada
                <input value={nome} onChange={e => { setNome(e.target.value); setNomeTocado(true); }} className="w-full rounded px-2 py-1.5 text-xs outline-none mt-0.5" style={inputStyle} />
              </label>
              <div className="flex gap-1">
                <button onClick={() => void aprovarSalvar()} disabled={salvando}
                  className="flex-1 py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-50" style={{ background: '#15803d' }}>
                  {salvando ? <><Loader2 size={12} className="animate-spin" /> Salvando…</> : <><CheckCircle2 size={12} /> Aprovar e salvar</>}
                </button>
                <button onClick={() => void baixarTifPrevia()} disabled={!!baixandoTif} title="Baixar esta prévia em GeoTIFF"
                  className="px-3 py-2 rounded text-xs flex items-center gap-1 disabled:opacity-50" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
                  {baixandoTif === 'previa' ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} TIF
                </button>
                <button onClick={() => setPrevia(null)} className="px-3 py-2 rounded text-xs" style={{ background: '#1a3a6b', color: '#cbd5e1' }}>Descartar</button>
              </div>
              {erroTif && <p className="text-[10px]" style={{ color: '#f87171' }}>{erroTif}</p>}
            </div>
          )}
        </div>
      )}

      {/* Escala do que está no mapa — vale para a prévia e para a composição salva em visualização. */}
      {(previa || vendo) && dominioMapa && (
        <div className="rounded-lg p-2.5 space-y-1.5" style={{ background: '#0a1a2f', border: '1px solid #1a3a6b' }}>
          <button onClick={() => setContraste(v => !v)}
            className="w-full py-1 rounded text-[10px] font-semibold flex items-center justify-center gap-1"
            style={{ background: contraste ? 'var(--invicta-green-dark)' : '#1a3a6b', color: contraste ? '#fff' : '#93c5fd' }}>
            <Contrast size={11} /> Contraste {contraste ? 'realçado' : 'normal'}
          </button>
          <div>
            <div className="h-4 rounded" style={{ border: '1px solid rgba(255,255,255,0.1)', background: gradCss }} />
            <div className="flex justify-between text-[8px] mt-0.5" style={{ color: '#cbd5e1' }}>
              <span>{fmt(dominioMapa[0])}</span>
              <span>{fmt((dominioMapa[0] + dominioMapa[1]) / 2)}</span>
              <span>{fmt(dominioMapa[1])}</span>
            </div>
          </div>
          <p className="text-[9px] leading-relaxed" style={{ color: '#64748b' }}>
            {contraste
              ? 'Esticada p2–p98 do próprio composto: mostra a variação DENTRO do talhão, mas as cores não se comparam com outro mapa.'
              : 'Escala fixa da legenda — comparável entre datas e talhões. Se o talhão sair de uma cor só, ligue o contraste.'}
          </p>
        </div>
      )}

      <ListaComposicoes salvas={salvas} vendo={vendo} onVer={id => { setPrevia(null); setVendo(v => v === id ? null : id); }} onExcluir={excluir} />
    </div>
  );
}

// Lista das composições salvas (usada aqui e na aba "Camadas salvas").
export function ListaComposicoes({ salvas, vendo, onVer, onExcluir }: {
  salvas: ComposicaoTemporal[];
  vendo?: string | null;
  onVer?: (id: string) => void;
  onExcluir?: (c: ComposicaoTemporal) => void;
}) {
  // Download do GeoTIFF: mora AQUI (e não no painel) para valer também na aba
  // "Camadas salvas", que usa esta mesma lista sem os callbacks de ver/excluir.
  const [baixando, setBaixando] = useState('');
  const [erro, setErro] = useState('');

  async function baixarTif(c: ComposicaoTemporal) {
    if (baixando) return;
    setBaixando(c.id); setErro('');
    try {
      const d = await carregarGridSalvo(c.talhaoId, c.id);
      if (!d) throw new Error('O raster desta composição não está na nuvem — gere-a de novo.');
      const base = sanitizar(c.nomeTecnico || c.nome) || 'composicao';
      baixarBlob(await exportarGeotiff(d.grid, d.bounds, base), `${base}.tif`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao gerar o GeoTIFF.');
    } finally { setBaixando(''); }
  }

  if (salvas.length === 0) return null;
  return (
    <div className="rounded-lg p-2.5 space-y-1.5" style={{ background: '#0a1a2f', border: '1px solid #1a3a6b' }}>
      <p className="text-[10px] font-bold flex items-center gap-1.5" style={{ color: '#93c5fd' }}><Layers3 size={11} /> Composições salvas ({salvas.length})</p>
      {salvas.map(c => (
        <div key={c.id} className="rounded px-2 py-1.5" style={{ background: vendo === c.id ? '#0f2240' : '#061525', border: `1px solid ${vendo === c.id ? '#22d3ee' : '#1a3a6b'}` }}>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold flex-1 truncate" style={{ color: '#e2e8f0' }}>{c.nome}</span>
            {c.aptoZonas
              ? <span className="text-[8px] px-1.5 py-0.5 rounded font-bold" style={{ background: '#0f2a1a', color: '#86efac' }}>apta p/ zonas</span>
              : <span className="text-[8px] px-1.5 py-0.5 rounded font-bold" style={{ background: '#2d1a00', color: '#fbbf24' }}>consulta</span>}
            {onVer && (
              <button onClick={() => onVer(c.id)} title="Ver no mapa" className="p-1 rounded" style={{ color: vendo === c.id ? '#22d3ee' : '#93c5fd' }}><Eye size={12} /></button>
            )}
            <button onClick={() => void baixarTif(c)} disabled={!!baixando} title="Baixar em GeoTIFF (EPSG:4326)" className="p-1 rounded disabled:opacity-40" style={{ color: '#93c5fd' }}>
              {baixando === c.id ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            </button>
            {onExcluir && (
              <button onClick={() => onExcluir(c)} title="Excluir" className="p-1 rounded" style={{ color: '#f87171' }}><Trash2 size={12} /></button>
            )}
          </div>
          <p className="text-[9px]" style={{ color: '#64748b' }}>
            {c.indice} · {c.metodo} · {c.datas.length} datas ({c.datas.map(ddmmyy).join(', ')}) · {c.sensores.join(' + ')} · {c.pctValidos}% válidos
            {c.cultura ? ` · ${c.cultura}` : ''}{c.safra ? ` · ${c.safra}` : ''}
          </p>
        </div>
      ))}
      {erro && <p className="text-[10px]" style={{ color: '#f87171' }}>{erro}</p>}
    </div>
  );
}
