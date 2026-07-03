'use client';

// Aba NDVI / Satélite (MSR) — fluxo IV1 (spec Índices Vegetativos):
// PRÉVIA RGB PRIMEIRO. A busca lista CARDS com miniatura RGB do talhão (leve);
// clicar abre a CONFERÊNCIA (RGB fino no mapa + dados + rejeitar); o NDVI só é
// calculado quando o usuário confirma — e só é salvo quando ele clica "Manter".
// Fontes: Sentinel-2 (10 m, nuvem padrão 5%) e CBERS-4A (2 m, pan-sharpened,
// sem metadado de nuvem) — ou "Todos" (lista as duas juntas).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { getTalhoes } from '@/lib/store';
import { SeletorLegenda, legendasDoModulo, usePrefLegenda } from './SeletorLegenda';
import {
  extrairPoligono, coordsFromBounds, comprimirGrid, descomprimirGrid,
  decodeGrid, type Grid,
} from '@/lib/fertilidade';
import { colorirGrid } from '@/lib/raster';
import { rampaVisualStops } from '@/lib/legendas';
import {
  buscarNdviSentinel, listarCenasNdvi, buscarImagemSatelite,
  type RespNdvi, type CenaDisponivel, type FonteNdvi,
} from '@/lib/msr';
import { cloudSalvarMapa, cloudCarregarMapasPorPrefixo, cloudExcluirMapasPorPrefixo, cloudPodeGravar } from '@/lib/cloud';
import { pode } from '@/lib/empresa';
import type { Legenda } from '@/lib/legendas';
import {
  Satellite, Loader2, AlertTriangle, Image as ImageIcon, Contrast, Check, Star,
  Eye, XCircle, RotateCcw, Play, X,
} from 'lucide-react';

const inputStyle = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;
const fmt2 = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const ddmmyy = (s?: string | null) => s ? new Date(s + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
const OPACIDADE = 1;

type MapaNdvi = { resp: RespNdvi; criadoEm: string };
type Imagem = { bounds: [number, number, number, number]; png: string };
type FonteBusca = FonteNdvi | 'todos';
type Cand = CenaDisponivel & { fonte: FonteNdvi };

const pixelDe = (fonte: FonteNdvi) => (fonte === 'cbers' ? 2 : 10);            // NDVI + imagem final
const PIXEL_THUMB: Record<FonteNdvi, number> = { sentinel: 24, cbers: 20 };    // miniatura do card
const PIXEL_PREVIA: Record<FonteNdvi, number> = { sentinel: 10, cbers: 6 };    // conferência
const NUVEM_PADRAO = 5;

const prefixoNuvem = (talhaoId: string, fonte: FonteNdvi) => `${talhaoId}__ndvi${fonte === 'cbers' ? 'cbers' : ''}__`;
const idNuvem = (talhaoId: string, fonte: FonteNdvi, data: string) => `${prefixoNuvem(talhaoId, fonte)}NDVI__${data}`;
const chaveDe = (fonte: FonteNdvi, data: string | null) => `${fonte}:${data ?? ''}`;
const ROTULO_FONTE: Record<FonteNdvi, string> = { sentinel: 'Sentinel-2', cbers: 'CBERS-4A' };

// ── Cenas rejeitadas (estado persistido no aparelho) ─────────────────────────
const K_REJ = 'inv_ndvi_rejeitadas';
function getRejeitadas(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(K_REJ) ?? '{}'); } catch { return {}; }
}
function marcarRejeitada(id: string, v: boolean) {
  const r = getRejeitadas();
  if (v) r[id] = true; else delete r[id];
  localStorage.setItem(K_REJ, JSON.stringify(r));
}

// p-ésimo percentil de um grid (p em 0..100). Usado pelo contraste.
function percentis(grid: Grid, pLo: number, pHi: number): [number, number] {
  const { valores } = decodeGrid(grid);
  const arr: number[] = [];
  for (let i = 0; i < valores.length; i++) { const v = valores[i]; if (isFinite(v)) arr.push(v); }
  if (!arr.length) return [0, 1];
  arr.sort((a, b) => a - b);
  const q = (p: number) => arr[Math.min(arr.length - 1, Math.max(0, Math.round((p / 100) * (arr.length - 1))))];
  let lo = q(pLo), hi = q(pHi);
  if (hi - lo < 1e-4) { lo = arr[0]; hi = arr[arr.length - 1]; }
  if (hi - lo < 1e-4) hi = lo + 1e-4;
  return [lo, hi];
}

export function NdviSection() {
  const { nav, uploadedGeo, setFertilidadeOverlay, setFertilidadeLabels } = useApp();

  const hoje = useMemo(() => new Date(), []);
  const [fonteBusca, setFonteBusca] = useState<FonteBusca>('sentinel');
  const [dataIni, setDataIni] = useState(isoDate(new Date(Date.now() - 90 * 864e5)));
  const [dataFim, setDataFim] = useState(isoDate(hoje));
  const [nuvemMax, setNuvemMax] = useState(NUVEM_PADRAO);

  const [estado, setEstado] = useState<'idle' | 'listando' | 'erro'>('idle');
  const [erro, setErro] = useState('');
  const [sugerirNuvem, setSugerirNuvem] = useState(0);        // sugestão de ampliar a nuvem (0 = sem)
  const [candidatos, setCandidatos] = useState<Cand[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});     // chave → dataURL | 'loading' | 'err'
  const thumbsRef = useRef(thumbs); thumbsRef.current = thumbs;
  const [previas, setPrevias] = useState<Record<string, Imagem>>({});   // conferência (RGB fino)
  const [previaDe, setPreviaDe] = useState<Cand | null>(null);          // card em conferência
  const [carregandoPrevia, setCarregandoPrevia] = useState(false);
  const [vistas, setVistas] = useState<Record<string, boolean>>({});    // visualizadas (sessão)
  const [rejeitadas, setRejeitadas] = useState<Record<string, boolean>>({});

  const [cenas, setCenas] = useState<Record<string, MapaNdvi>>({});     // NDVI calculado, chave fonte:data
  const [selKey, setSelKey] = useState('');
  const [carregandoId, setCarregandoId] = useState('');
  const [modo, setModo] = useState<'ndvi' | 'imagem'>('ndvi');
  const [contraste, setContraste] = useState(false);
  const [imagens, setImagens] = useState<Record<string, Imagem>>({});   // cor verdadeira FINA por chave
  const [carregandoImg, setCarregandoImg] = useState(false);
  const [salvos, setSalvos] = useState<Record<string, boolean>>({});    // mantidas na nuvem, por chave

  // Legenda NDVI (seletor) → versão contínua.
  const legendasNdvi = useMemo(() => legendasDoModulo('ndvi'), []);
  const [legNdviId, escolherLegNdvi] = usePrefLegenda('inv_leg_pref_ndvi');
  const legNdvi: Legenda | undefined = useMemo(
    () => legendasNdvi.find(l => l.id === legNdviId) ?? legendasNdvi[0], [legendasNdvi, legNdviId]);
  const corStops = useMemo(() => legNdvi ? rampaVisualStops({ ...legNdvi, estilo: 'continuo' }) : [], [legNdvi]);
  const gradCss = useMemo(
    () => corStops.length ? `linear-gradient(to right, ${corStops.map(([p, [r, g, b]]) => `rgb(${r},${g},${b}) ${(p * 100).toFixed(1)}%`).join(', ')})` : 'transparent',
    [corStops],
  );

  const poligono = useMemo(() => {
    const p = extrairPoligono(uploadedGeo);
    if (p) return p;
    if (!nav.talhaoId) return null;
    const t = getTalhoes().find(x => x.id === nav.talhaoId);
    if (t?.geojson) { try { return extrairPoligono(JSON.parse(t.geojson)); } catch {} }
    return null;
  }, [uploadedGeo, nav.talhaoId]);

  const sel = selKey ? cenas[selKey] : undefined;
  const fonteSel = (selKey.split(':')[0] || 'sentinel') as FonteNdvi;

  const dominio = useMemo<[number, number]>(() => {
    if (!sel?.resp.grid) return [0, 1];
    return contraste ? percentis(sel.resp.grid, 2, 98) : [0, 1];
  }, [sel, contraste]);

  const idRejeicao = (c: Cand) => `${nav.talhaoId}:${c.fonte}:${c.id}`;

  function trocarFonte(f: FonteBusca) {
    if (f === fonteBusca) return;
    setFonteBusca(f);
    setCandidatos([]); setThumbs({}); setPreviaDe(null); setErro(''); setSugerirNuvem(0);
    const dias = f === 'sentinel' ? 90 : 365;
    setDataIni(isoDate(new Date(Date.now() - dias * 864e5)));
  }

  // Autoload das cenas MANTIDAS (as duas fontes) ao abrir o talhão.
  useEffect(() => {
    setCenas({}); setImagens({}); setPrevias({}); setCandidatos([]); setThumbs({});
    setSelKey(''); setPreviaDe(null); setEstado('idle'); setErro(''); setSalvos({});
    setRejeitadas(getRejeitadas());
    if (!nav.talhaoId) return;
    (async () => {
      const novo: Record<string, MapaNdvi> = {};
      for (const f of ['sentinel', 'cbers'] as FonteNdvi[]) {
        const carregados = await cloudCarregarMapasPorPrefixo<MapaNdvi>(prefixoNuvem(nav.talhaoId!, f));
        for (const c of carregados) {
          const m = c.dados;
          const data = m.resp?.cena?.data;
          if (!data || !m.resp?.grid) continue;
          if (m.resp.grid.comp === 'gz') {
            try { m.resp.grid = await descomprimirGrid(m.resp.grid); }
            catch (e) { console.warn('[ndvi] falha ao descomprimir grid:', e); }
          }
          novo[chaveDe(f, data)] = m;
        }
      }
      if (Object.keys(novo).length === 0) return;
      setCenas(novo);
      setSalvos(Object.fromEntries(Object.keys(novo).map(k => [k, true])));
      const maisRecente = Object.keys(novo).sort((a, b) => a.split(':')[1].localeCompare(b.split(':')[1])).pop();
      if (maisRecente) setSelKey(maisRecente);
    })();
  }, [nav.talhaoId]);

  // Render no mapa: prévia RGB (conferência) > NDVI/imagem da cena selecionada.
  useEffect(() => {
    setFertilidadeLabels(null);
    if (previaDe) {
      const img = previas[chaveDe(previaDe.fonte, previaDe.data)];
      if (img) setFertilidadeOverlay({ url: img.png, coordinates: coordsFromBounds(img.bounds), opacity: OPACIDADE });
      else setFertilidadeOverlay(null);
      return;
    }
    if (!legNdvi || !selKey) { setFertilidadeOverlay(null); return; }
    if (modo === 'imagem') {
      const img = imagens[selKey];
      if (!img) { setFertilidadeOverlay(null); return; }
      setFertilidadeOverlay({ url: img.png, coordinates: coordsFromBounds(img.bounds), opacity: OPACIDADE });
      return;
    }
    const m = cenas[selKey];
    if (!m?.resp?.grid?.b64) { setFertilidadeOverlay(null); return; }
    let url: string | undefined;
    try { url = colorirGrid(m.resp.grid, dominio, corStops).dataUrl; }
    catch (e) { console.warn('[ndvi] colorir falhou:', e); }
    if (!url) { setFertilidadeOverlay(null); return; }
    setFertilidadeOverlay({ url, coordinates: coordsFromBounds(m.resp.bounds), opacity: OPACIDADE });
  }, [cenas, imagens, previas, previaDe, selKey, modo, dominio, corStops, legNdvi, setFertilidadeOverlay, setFertilidadeLabels]);

  // Miniaturas RGB dos cards (leves, 2 por vez) — só das que ainda não têm.
  useEffect(() => {
    if (!poligono || candidatos.length === 0) return;
    let vivo = true;
    const fila = candidatos.filter(c => c.data && !thumbsRef.current[chaveDe(c.fonte, c.data)]);
    if (fila.length === 0) return;
    setThumbs(t => ({ ...t, ...Object.fromEntries(fila.map(c => [chaveDe(c.fonte, c.data), 'loading'])) }));
    (async () => {
      const worker = async () => {
        while (vivo) {
          const c = fila.shift();
          if (!c) return;
          const ch = chaveDe(c.fonte, c.data);
          try {
            const img = await buscarImagemSatelite({ poligono, cenaId: c.id, fonte: c.fonte, pixelM: PIXEL_THUMB[c.fonte] });
            if (vivo) setThumbs(t => ({ ...t, [ch]: img.png }));
          } catch {
            if (vivo) setThumbs(t => ({ ...t, [ch]: 'err' }));
          }
        }
      };
      await Promise.all([worker(), worker()]);
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidatos, poligono]);

  // Prévia FINA da conferência (RGB no mapa).
  useEffect(() => {
    if (!previaDe || !poligono) return;
    const ch = chaveDe(previaDe.fonte, previaDe.data);
    if (previas[ch]) return;
    let vivo = true;
    setCarregandoPrevia(true);
    buscarImagemSatelite({ poligono, cenaId: previaDe.id, fonte: previaDe.fonte, pixelM: PIXEL_PREVIA[previaDe.fonte] })
      .then(img => { if (vivo) setPrevias(prev => ({ ...prev, [ch]: { bounds: img.bounds, png: img.png } })); })
      .catch(e => { if (vivo) setErro(e instanceof Error ? e.message : 'Falha ao carregar a prévia.'); })
      .finally(() => { if (vivo) setCarregandoPrevia(false); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previaDe, poligono]);

  // Imagem FINA do modo "Imagem" (resultado).
  useEffect(() => {
    if (modo !== 'imagem' || !selKey || !sel || !poligono || previaDe) return;
    if (imagens[selKey]) return;
    let vivo = true;
    setCarregandoImg(true);
    buscarImagemSatelite({ poligono, cenaId: sel.resp.cena.id, fonte: fonteSel, pixelM: pixelDe(fonteSel) })
      .then(img => { if (vivo) setImagens(prev => ({ ...prev, [selKey]: { bounds: img.bounds, png: img.png } })); })
      .catch(e => { if (vivo) setErro(e instanceof Error ? e.message : 'Falha ao buscar imagem.'); })
      .finally(() => { if (vivo) setCarregandoImg(false); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, selKey, poligono, previaDe]);

  useEffect(() => () => { setFertilidadeOverlay(null); setFertilidadeLabels(null); }, [setFertilidadeOverlay, setFertilidadeLabels]);

  async function listar(nuvemOverride?: number) {
    if (!poligono) { setErro('Limite do talhão não encontrado — abra o talhão no mapa.'); setEstado('erro'); return; }
    const nv = nuvemOverride ?? nuvemMax;
    if (nuvemOverride != null) setNuvemMax(nuvemOverride);
    setEstado('listando'); setErro(''); setSugerirNuvem(0); setPreviaDe(null);
    try {
      const fontes: FonteNdvi[] = fonteBusca === 'todos' ? ['sentinel', 'cbers'] : [fonteBusca];
      const resultados = await Promise.all(fontes.map(async f => {
        const cs = await listarCenasNdvi({ poligono, dataIni, dataFim, nuvemMax: f === 'sentinel' ? nv : 100, fonte: f });
        return cs.map(c => ({ ...c, fonte: f }));
      }));
      // 1 card por fonte+data: talhão na emenda de tiles repete a mesma passagem
      // em 2+ cenas — fica a de menor nuvem (ou a primeira, sem metadado).
      const porChave = new Map<string, Cand>();
      for (const c of resultados.flat()) {
        const ch = chaveDe(c.fonte, c.data);
        const atual = porChave.get(ch);
        if (!atual || (c.nuvem ?? 101) < (atual.nuvem ?? 101)) porChave.set(ch, c);
      }
      const juntas = [...porChave.values()].sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''));
      setCandidatos(juntas);
      setEstado('idle');
      if (juntas.length === 0) {
        if (fontes.includes('sentinel') && nv < 15) {
          setErro(`Nenhuma cena com até ${nv}% de nuvem no período.`);
          setSugerirNuvem(nv < 10 ? 10 : 15);
        } else {
          setErro('Nenhuma cena no período. Amplie o período.');
        }
      }
    } catch (e) {
      setEstado('erro'); setErro(e instanceof Error ? e.message : 'Falha ao listar cenas.');
    }
  }

  function abrirCard(c: Cand) {
    const ch = chaveDe(c.fonte, c.data);
    if (cenas[ch]) { setSelKey(ch); setPreviaDe(null); return; }  // já processada → resultado
    setVistas(v => ({ ...v, [ch]: true }));
    setErro('');
    setPreviaDe(c);
    setSelKey('');
  }

  // Processa o NDVI da cena em conferência (só após confirmação do usuário).
  async function processarNdvi(c: Cand) {
    if (!poligono) return;
    setCarregandoId(c.id); setErro('');
    try {
      const resp = await buscarNdviSentinel({ poligono, dataIni, dataFim, cenaId: c.id, fonte: c.fonte, pixelM: pixelDe(c.fonte) });
      const d = resp.cena.data ?? c.data ?? '';
      const ch = chaveDe(c.fonte, d);
      setCenas(prev => ({ ...prev, [ch]: { resp, criadoEm: new Date().toISOString() } }));
      setSelKey(ch);
      setPreviaDe(null);
      setModo('ndvi');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao calcular NDVI da cena.');
    } finally {
      setCarregandoId('');
    }
  }

  async function manterCena() {
    if (!sel || !selKey || !nav.talhaoId) return;
    if (!cloudPodeGravar()) { setErro('Faça login para manter a cena salva.'); return; }
    const data = selKey.split(':')[1];
    const gz = await comprimirGrid(sel.resp.grid);
    cloudSalvarMapa(idNuvem(nav.talhaoId, fonteSel, data), { resp: { ...sel.resp, grid: gz }, criadoEm: sel.criadoEm });
    setSalvos(s => ({ ...s, [selKey]: true }));
  }

  function removerCena() {
    if (!selKey || !nav.talhaoId) return;
    const data = selKey.split(':')[1];
    cloudExcluirMapasPorPrefixo(idNuvem(nav.talhaoId, fonteSel, data));
    setSalvos(s => ({ ...s, [selKey]: false }));
  }

  function toggleRejeitada(c: Cand) {
    const id = idRejeicao(c);
    const nova = !rejeitadas[id];
    marcarRejeitada(id, nova);
    setRejeitadas(getRejeitadas());
    if (nova) setPreviaDe(null);
  }

  if (!legNdvi) return <div className="px-4 py-3"><Aviso texto="Legenda oficial de NDVI não encontrada (seed do sistema)." /></div>;

  if (!pode('ndvi')) {
    return (
      <div className="px-4 py-6">
        <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: '#0b1d3a', border: '1px solid #1a3a6b' }}>
          <AlertTriangle size={14} style={{ color: '#fbbf24' }} className="flex-shrink-0 mt-0.5" />
          <p className="text-[11px]" style={{ color: '#94a3b8' }}>
            Seu perfil não tem permissão para gerar mapas de NDVI / satélite. Peça a um administrador para liberar a permissão <strong style={{ color: '#cbd5e1' }}>NDVI</strong>.
          </p>
        </div>
      </div>
    );
  }

  const listando = estado === 'listando';
  const chavePrevia = previaDe ? chaveDe(previaDe.fonte, previaDe.data) : '';
  const mantidas = Object.keys(cenas).sort((a, b) => b.split(':')[1].localeCompare(a.split(':')[1]));

  return (
    <div className="px-4 py-3 space-y-3">
      {!cloudPodeGravar() && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg" style={{ background: '#2d1a00', border: '1px solid #92400e' }}>
          <AlertTriangle size={13} style={{ color: '#fbbf24' }} className="flex-shrink-0 mt-0.5" />
          <p className="text-[10px]" style={{ color: '#fbbf24' }}>
            <strong>Você não está logado</strong> — as cenas de NDVI <strong>não são salvas</strong> e precisam ser rebuscadas ao reabrir.
          </p>
        </div>
      )}

      {!poligono && <Aviso texto="Limite do talhão não carregado no mapa." />}

      {/* Fonte de imagem */}
      <div>
        <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>Fonte de imagem</label>
        <div className="flex gap-1">
          {([['sentinel', 'Sentinel-2 · 10 m'], ['cbers', 'CBERS-4A · 2 m'], ['todos', 'Todos']] as [FonteBusca, string][]).map(([f, r]) => (
            <button key={f} onClick={() => trocarFonte(f)} className="flex-1 py-1.5 rounded text-[10px] font-bold"
              style={{ background: fonteBusca === f ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: fonteBusca === f ? '#fff' : '#93c5fd' }}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Período + nuvem + buscar cenas */}
      <div className="rounded-lg p-2.5 space-y-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
        <p className="text-[11px] font-semibold flex items-center gap-1" style={{ color: '#93c5fd' }}>
          <Satellite size={12} /> Buscar imagens {fonteBusca === 'todos' ? '(Sentinel-2 + CBERS-4A)' : fonteBusca === 'cbers' ? 'CBERS-4A (2 m)' : 'Sentinel-2'}
        </p>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>De</label>
            <input type="date" value={dataIni} max={dataFim} onChange={e => setDataIni(e.target.value)}
              className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle} />
          </div>
          <div className="flex-1">
            <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Até</label>
            <input type="date" value={dataFim} min={dataIni} max={isoDate(hoje)} onChange={e => setDataFim(e.target.value)}
              className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle} />
          </div>
          {fonteBusca !== 'cbers' && (
            <div style={{ width: 92 }}>
              <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Nuvem máx</label>
              <div className="flex items-center gap-1">
                <input type="number" min={0} max={100} value={nuvemMax} onChange={e => setNuvemMax(Number(e.target.value))}
                  className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle} />
                <span className="text-[10px]" style={{ color: '#64748b' }}>%</span>
              </div>
            </div>
          )}
        </div>
        <button onClick={() => void listar()} disabled={listando || !poligono}
          className="w-full py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1.5"
          style={{ background: (listando || !poligono) ? '#1a3a6b' : 'var(--invicta-green-dark)', opacity: !poligono ? 0.6 : 1 }}>
          {listando ? <><Loader2 size={13} className="animate-spin" /> Buscando imagens…</> : <><Satellite size={13} /> Buscar imagens no período</>}
        </button>
        <p className="text-[9px]" style={{ color: '#475569' }}>
          A busca mostra PRÉVIAS RGB — nada é processado nem salvo até você confirmar. {fonteBusca !== 'sentinel' ? 'CBERS-4A (INPE) não traz % de nuvem — avalie pela prévia. ' : ''}Nuvem padrão do Sentinel-2: {NUVEM_PADRAO}%.
        </p>
      </div>

      {estado === 'erro' && <p className="text-[10px]" style={{ color: '#f87171' }}>{erro}</p>}
      {erro && estado !== 'erro' && <p className="text-[10px]" style={{ color: '#fbbf24' }}>{erro}</p>}
      {sugerirNuvem > 0 && (
        <button onClick={() => void listar(sugerirNuvem)}
          className="w-full py-1.5 rounded text-[10px] font-bold" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
          Ampliar para {sugerirNuvem}% de nuvem e buscar de novo
        </button>
      )}

      {/* Cards das imagens candidatas (prévia RGB) */}
      {candidatos.length > 0 && (
        <div>
          <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>
            Imagens encontradas · {candidatos.length} · toque para conferir
          </label>
          <div className="grid grid-cols-2 gap-2 max-h-[420px] overflow-y-auto pr-1">
            {candidatos.map(c => {
              const ch = chaveDe(c.fonte, c.data);
              const thumb = thumbs[ch];
              const rejeitada = !!rejeitadas[idRejeicao(c)];
              const processada = !!cenas[ch];
              const salva = !!salvos[ch];
              const emConf = chavePrevia === ch && !!previaDe;
              return (
                <button key={`${c.fonte}-${c.id}`} onClick={() => abrirCard(c)}
                  className="rounded-lg overflow-hidden text-left"
                  style={{
                    background: '#0b1d3a', opacity: rejeitada ? 0.45 : 1,
                    border: `1px solid ${emConf ? '#60a5fa' : selKey === ch ? '#4ade80' : '#1a3a6b'}`,
                  }}>
                  <div className="relative w-full h-20 flex items-center justify-center" style={{ background: '#061525' }}>
                    {thumb && thumb !== 'loading' && thumb !== 'err'
                      ? <img src={thumb} alt="" className="w-full h-full object-cover" />
                      : thumb === 'err'
                        ? <ImageIcon size={16} style={{ color: '#334155' }} />
                        : <Loader2 size={14} className="animate-spin" style={{ color: '#2e5fa3' }} />}
                    <span className="absolute top-1 left-1 px-1 rounded text-[8px] font-bold"
                      style={{ background: 'rgba(6,21,37,0.85)', color: c.fonte === 'cbers' ? '#fbbf24' : '#93c5fd' }}>
                      {ROTULO_FONTE[c.fonte]}
                    </span>
                    {rejeitada && <span className="absolute top-1 right-1 px-1 rounded text-[8px] font-bold" style={{ background: '#7f1d1d', color: '#fca5a5' }}>rejeitada</span>}
                    {!rejeitada && salva && <Star size={11} fill="#fbbf24" className="absolute top-1 right-1" style={{ color: '#fbbf24' }} />}
                  </div>
                  <div className="px-1.5 py-1">
                    <p className="text-[10px] font-bold" style={{ color: '#e2e8f0' }}>{ddmmyy(c.data)}</p>
                    <p className="text-[8px] flex items-center gap-1" style={{ color: '#64748b' }}>
                      ☁ {c.nuvem != null ? `${Math.round(c.nuvem)}%` : '—'}
                      {processada && <span className="flex items-center gap-0.5" style={{ color: '#86efac' }}><Check size={8} /> NDVI</span>}
                      {!processada && vistas[ch] && <Eye size={8} style={{ color: '#475569' }} />}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* CONFERÊNCIA da prévia (RGB no mapa + decisão) */}
      {previaDe && (
        <div className="space-y-2 p-2.5 rounded-lg" style={{ background: '#061525', border: '1px solid #60a5fa' }}>
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold flex items-center gap-1.5" style={{ color: '#93c5fd' }}>
              <ImageIcon size={12} /> Conferência — {ROTULO_FONTE[previaDe.fonte]} · {ddmmyy(previaDe.data)}
            </p>
            <button onClick={() => setPreviaDe(null)} className="p-0.5" style={{ color: '#64748b' }}><X size={14} /></button>
          </div>
          {carregandoPrevia && !previas[chavePrevia] ? (
            <p className="text-[10px] flex items-center gap-1.5" style={{ color: '#93c5fd' }}>
              <Loader2 size={12} className="animate-spin" /> Carregando a prévia RGB no mapa…
            </p>
          ) : (
            <p className="text-[10px]" style={{ color: '#94a3b8' }}>
              Prévia RGB no mapa (cor verdadeira, recortada no talhão). Avalie <strong style={{ color: '#cbd5e1' }}>nuvem, sombra, bruma, cultura e solo exposto</strong> antes de processar. Use o zoom do mapa.
            </p>
          )}
          <div className="text-[9px]" style={{ color: '#64748b' }}>
            ☁ {previaDe.nuvem != null ? `${fmt2(previaDe.nuvem)}%` : 'não informado'} · {previaDe.plataforma ?? ROTULO_FONTE[previaDe.fonte]} · prévia {PIXEL_PREVIA[previaDe.fonte]} m
            {previaDe.nuvem != null && previaDe.nuvem > 20 && <span style={{ color: '#fbbf24' }}> · ⚠ nuvem alta</span>}
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => processarNdvi(previaDe)} disabled={carregandoId === previaDe.id}
              className="flex-[2] py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1"
              style={{ background: 'var(--invicta-green-dark)' }}>
              {carregandoId === previaDe.id
                ? <><Loader2 size={11} className="animate-spin" /> Processando NDVI…</>
                : <><Play size={11} /> Processar NDVI ({pixelDe(previaDe.fonte)} m{previaDe.fonte === 'cbers' ? ', ~20–30 s' : ''})</>}
            </button>
            <button onClick={() => toggleRejeitada(previaDe)}
              className="flex-1 py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1"
              style={rejeitadas[idRejeicao(previaDe)] ? { background: '#1a3a6b', color: '#93c5fd' } : { background: '#7f1d1d', color: '#fca5a5' }}>
              {rejeitadas[idRejeicao(previaDe)] ? <><RotateCcw size={11} /> Reabilitar</> : <><XCircle size={11} /> Rejeitar</>}
            </button>
          </div>
          <p className="text-[8px]" style={{ color: '#475569' }}>
            Nada é salvo agora: o NDVI processado só vira camada oficial quando você clicar em “Manter”.
          </p>
        </div>
      )}

      {/* Cenas processadas/mantidas (retrocompat) */}
      {!previaDe && mantidas.length > 0 && candidatos.length === 0 && (
        <div>
          <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>
            Cenas desta safra · {mantidas.length} · clique para ver
          </label>
          <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto pr-1">
            {mantidas.map(k => {
              const [f, d] = k.split(':') as [FonteNdvi, string];
              const ativa = k === selKey;
              return (
                <button key={k} onClick={() => { setSelKey(k); setPreviaDe(null); }}
                  className="px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1"
                  style={{ background: ativa ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: ativa ? '#fff' : (salvos[k] ? '#86efac' : '#93c5fd') }}>
                  {salvos[k] ? <Star size={10} fill="currentColor" /> : <Check size={10} />}
                  {ddmmyy(d)}
                  <span style={{ color: ativa ? '#cbd5e1' : '#64748b', fontWeight: 400 }}>· {f === 'cbers' ? 'C4A' : 'S2'}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Resultado — cena processada selecionada */}
      {sel && !previaDe && (
        <div className="space-y-2 p-2.5 rounded-lg" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[10px]" style={{ color: '#86efac' }}>
              <Satellite size={12} />
              {sel.resp.cena.plataforma ?? 'Satélite'} · {ddmmyy(sel.resp.cena.data)} · {sel.resp.stats.pixel_m} m
            </div>
            {sel.resp.cena.nuvem != null && (
              <span className="text-[10px]" style={{ color: '#64748b' }}>☁ {fmt2(sel.resp.cena.nuvem)}%</span>
            )}
          </div>

          <div className="flex gap-1">
            <button onClick={() => setModo('ndvi')} className="flex-1 py-1 rounded text-[10px] font-bold flex items-center justify-center gap-1"
              style={{ background: modo === 'ndvi' ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: modo === 'ndvi' ? '#fff' : '#93c5fd' }}>
              <Satellite size={11} /> NDVI
            </button>
            <button onClick={() => setModo('imagem')} className="flex-1 py-1 rounded text-[10px] font-bold flex items-center justify-center gap-1"
              style={{ background: modo === 'imagem' ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: modo === 'imagem' ? '#fff' : '#93c5fd' }}>
              <ImageIcon size={11} /> Imagem
            </button>
          </div>

          {modo === 'ndvi' ? (
            <>
              <button onClick={() => setContraste(v => !v)}
                className="w-full py-1 rounded text-[10px] font-semibold flex items-center justify-center gap-1"
                style={{ background: contraste ? 'var(--invicta-green-dark)' : '#1a3a6b', color: contraste ? '#fff' : '#93c5fd' }}>
                <Contrast size={11} /> Contraste {contraste ? 'realçado' : 'normal'}
              </button>

              <div className="grid grid-cols-3 gap-2 text-center">
                <Metrica rotulo="NDVI médio" valor={fmt2(sel.resp.stats.media)} destaque />
                <Metrica rotulo="mínimo" valor={fmt2(sel.resp.stats.min)} />
                <Metrica rotulo="máximo" valor={fmt2(sel.resp.stats.max)} />
              </div>

              <div className="text-[9px] leading-relaxed" style={{ color: '#64748b' }}>
                grade {sel.resp.stats.nx}×{sel.resp.stats.ny} · pixel <strong style={{ color: '#94a3b8' }}>{sel.resp.stats.pixel_m} m</strong> · {sel.resp.stats.n} px válidos
              </div>

              <SeletorLegenda legendas={legendasNdvi} valorId={legNdvi?.id} onEscolher={escolherLegNdvi} />

              <div>
                <div className="h-4 rounded" style={{ border: '1px solid rgba(255,255,255,0.1)', background: gradCss }} />
                <div className="flex justify-between text-[8px] mt-0.5" style={{ color: '#cbd5e1' }}>
                  <span>{fmt2(dominio[0])}</span>
                  <span>{fmt2((dominio[0] + dominio[1]) / 2)}</span>
                  <span>{fmt2(dominio[1])}</span>
                </div>
                <p className="text-[9px] mt-0.5" style={{ color: '#64748b' }}>
                  {legNdvi.nome} · contínua{contraste ? ' · contraste realçado (p2–p98)' : ''}{fonteSel === 'cbers' ? ' · 2 m (PAN)' : ''}
                </p>
              </div>
            </>
          ) : (
            <div className="text-[10px]" style={{ color: '#93c5fd' }}>
              {carregandoImg && !imagens[selKey]
                ? <span className="flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Carregando imagem de satélite…</span>
                : <span className="flex items-center gap-1"><ImageIcon size={12} /> Cor verdadeira{fonteSel === 'cbers' ? ' (CBERS-4A 2 m, pan-sharpened)' : ' (Sentinel-2)'}, recortada no talhão.</span>}
            </div>
          )}

          {nav.talhaoId && (
            salvos[selKey] ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] flex items-center gap-1" style={{ color: '#86efac' }}>
                  <Star size={11} fill="#86efac" /> Mantida — disponível como fonte na Zona de Manejo
                </span>
                <button onClick={removerCena} className="text-[10px] font-semibold" style={{ color: '#93c5fd' }}>Remover</button>
              </div>
            ) : (
              <button onClick={manterCena} disabled={!cloudPodeGravar()}
                className="w-full py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1 disabled:opacity-50"
                style={{ background: 'var(--invicta-blue-mid)', color: '#fff' }}>
                <Star size={12} /> Manter esta cena{!cloudPodeGravar() ? ' (faça login)' : ''}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

function Metrica({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="rounded-lg py-1.5" style={{ background: '#0b1f3a', border: '1px solid #1a3a6b' }}>
      <div className="text-sm font-bold" style={{ color: destaque ? '#86efac' : '#e2e8f0' }}>{valor}</div>
      <div className="text-[9px]" style={{ color: '#64748b' }}>{rotulo}</div>
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
