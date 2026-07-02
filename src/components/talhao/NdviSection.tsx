'use client';

// Aba NDVI / Satélite (MSR). Duas fontes: Sentinel-2 (10 m, global) e CBERS-4A
// (2 m, Brasil, pan-sharpened). Lista as cenas do período, deixa ESCOLHER quais
// carregar, calcula o NDVI no backend e exibe no mapa. Legenda CONTÍNUA, toggle
// de CONTRASTE (stretch p2–p98) e toggle de IMAGEM (cor verdadeira).

import { useEffect, useMemo, useState } from 'react';
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
import type { Legenda } from '@/lib/legendas';
import { Satellite, Loader2, AlertTriangle, Calendar, Image as ImageIcon, Contrast, Check, Star } from 'lucide-react';

const inputStyle = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;
const fmt2 = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const ddmmyy = (s?: string | null) => s ? new Date(s + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
const OPACIDADE = 1;

type MapaNdvi = { resp: RespNdvi; criadoEm: string };
type Imagem = { bounds: [number, number, number, number]; png: string };
const pixelDe = (fonte: FonteNdvi) => (fonte === 'cbers' ? 2 : 10);
const prefixoNuvem = (talhaoId: string, fonte: FonteNdvi) => `${talhaoId}__ndvi${fonte === 'cbers' ? 'cbers' : ''}__`;
const idNuvem = (talhaoId: string, fonte: FonteNdvi, data: string) => `${prefixoNuvem(talhaoId, fonte)}NDVI__${data}`;

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
  const [fonte, setFonte] = useState<FonteNdvi>('sentinel');
  const [dataIni, setDataIni] = useState(isoDate(new Date(Date.now() - 90 * 864e5)));
  const [dataFim, setDataFim] = useState(isoDate(hoje));
  const [nuvemMax, setNuvemMax] = useState(60);

  const [estado, setEstado] = useState<'idle' | 'listando' | 'erro'>('idle');
  const [erro, setErro] = useState('');
  const [candidatos, setCandidatos] = useState<CenaDisponivel[]>([]);
  const [cenas, setCenas] = useState<Record<string, MapaNdvi>>({});   // NDVI já calculado, por data
  const [dataSel, setDataSel] = useState('');
  const [carregandoId, setCarregandoId] = useState('');               // cena sendo calculada
  const [modo, setModo] = useState<'ndvi' | 'imagem'>('ndvi');
  const [contraste, setContraste] = useState(false);
  const [imagens, setImagens] = useState<Record<string, Imagem>>({}); // cor verdadeira por data
  const [carregandoImg, setCarregandoImg] = useState(false);
  const [salvos, setSalvos] = useState<Record<string, boolean>>({}); // cenas MANTIDAS (persistidas) por data

  // Legenda NDVI: o usuário escolhe entre as de NDVI (seletor) -> versão CONTÍNUA.
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

  const sel = dataSel ? cenas[dataSel] : undefined;
  const cenaIdSel = sel?.resp.cena.id;

  const dominio = useMemo<[number, number]>(() => {
    if (!sel?.resp.grid) return [0, 1];
    return contraste ? percentis(sel.resp.grid, 2, 98) : [0, 1];
  }, [sel, contraste]);

  // Troca de fonte: ajusta o período padrão (CBERS revisita ~mensal) — o reset
  // do estado vem do efeito de autoload (depende de [talhaoId, fonte]).
  function trocarFonte(f: FonteNdvi) {
    if (f === fonte) return;
    setFonte(f);
    setDataIni(isoDate(new Date(Date.now() - (f === 'cbers' ? 365 : 90) * 864e5)));
  }

  // Autoload das cenas salvas ao abrir o talhão / trocar de fonte.
  useEffect(() => {
    setCenas({}); setImagens({}); setCandidatos([]); setDataSel(''); setEstado('idle'); setErro(''); setSalvos({});
    if (!nav.talhaoId) return;
    (async () => {
      const carregados = await cloudCarregarMapasPorPrefixo<MapaNdvi>(prefixoNuvem(nav.talhaoId!, fonte));
      if (carregados.length === 0) return;
      const novo: Record<string, MapaNdvi> = {};
      for (const c of carregados) {
        const m = c.dados;
        const data = m.resp?.cena?.data;
        if (!data || !m.resp?.grid) continue;
        if (m.resp.grid.comp === 'gz') {
          try { m.resp.grid = await descomprimirGrid(m.resp.grid); }
          catch (e) { console.warn('[ndvi] falha ao descomprimir grid:', e); }
        }
        novo[data] = m;
      }
      setCenas(novo);
      setSalvos(Object.fromEntries(Object.keys(novo).map(k => [k, true]))); // o que veio da nuvem já está mantido
      const maisRecente = Object.keys(novo).sort().pop();
      if (maisRecente) setDataSel(maisRecente);
    })();
  }, [nav.talhaoId, fonte]);

  // Render no mapa: NDVI (contínuo, com contraste) ou imagem de satélite.
  useEffect(() => {
    if (!legNdvi || !dataSel) { setFertilidadeOverlay(null); setFertilidadeLabels(null); return; }
    setFertilidadeLabels(null);
    if (modo === 'imagem') {
      const img = imagens[dataSel];
      if (!img) { setFertilidadeOverlay(null); return; }
      setFertilidadeOverlay({ url: img.png, coordinates: coordsFromBounds(img.bounds), opacity: OPACIDADE });
      return;
    }
    const m = cenas[dataSel];
    if (!m?.resp?.grid?.b64) { setFertilidadeOverlay(null); return; }
    let url: string | undefined;
    try { url = colorirGrid(m.resp.grid, dominio, corStops).dataUrl; }
    catch (e) { console.warn('[ndvi] colorir falhou:', e); }
    if (!url) { setFertilidadeOverlay(null); return; }
    setFertilidadeOverlay({ url, coordinates: coordsFromBounds(m.resp.bounds), opacity: OPACIDADE });
  }, [cenas, imagens, dataSel, modo, dominio, corStops, legNdvi, setFertilidadeOverlay, setFertilidadeLabels]);

  // Busca preguiçosa da imagem de satélite quando o usuário troca p/ "Imagem".
  useEffect(() => {
    if (modo !== 'imagem' || !dataSel || !cenaIdSel || !poligono) return;
    if (imagens[dataSel]) return;
    let vivo = true;
    setCarregandoImg(true);
    buscarImagemSatelite({ poligono, cenaId: cenaIdSel, fonte, pixelM: pixelDe(fonte) })
      .then(img => { if (vivo) setImagens(prev => ({ ...prev, [dataSel]: { bounds: img.bounds, png: img.png } })); })
      .catch(e => { if (vivo) setErro(e instanceof Error ? e.message : 'Falha ao buscar imagem.'); })
      .finally(() => { if (vivo) setCarregandoImg(false); });
    return () => { vivo = false; };
  }, [modo, dataSel, cenaIdSel, poligono, imagens, fonte]);

  // Limpa o overlay ao sair da aba.
  useEffect(() => () => { setFertilidadeOverlay(null); setFertilidadeLabels(null); }, [setFertilidadeOverlay, setFertilidadeLabels]);

  async function listar() {
    if (!poligono) { setErro('Limite do talhão não encontrado — abra o talhão no mapa.'); setEstado('erro'); return; }
    setEstado('listando'); setErro('');
    try {
      const cs = await listarCenasNdvi({ poligono, dataIni, dataFim, nuvemMax, fonte });
      setCandidatos(cs);
      setEstado('idle');
      if (cs.length === 0) setErro('Nenhuma cena no período. Amplie o período' + (fonte === 'sentinel' ? ' ou a nuvem máx.' : '.'));
    } catch (e) {
      setEstado('erro'); setErro(e instanceof Error ? e.message : 'Falha ao listar cenas.');
    }
  }

  async function carregarCena(c: CenaDisponivel) {
    const data = c.data ?? '';
    if (cenas[data]) { setDataSel(data); return; }
    if (!poligono) return;
    setCarregandoId(c.id); setErro('');
    try {
      // Buscar NÃO salva: a cena fica só na sessão até o usuário clicar "Manter".
      const resp = await buscarNdviSentinel({ poligono, dataIni, dataFim, cenaId: c.id, fonte, pixelM: pixelDe(fonte) });
      const d = resp.cena.data ?? data;
      const criadoEm = new Date().toISOString();
      setCenas(prev => ({ ...prev, [d]: { resp, criadoEm } }));
      setDataSel(d);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao calcular NDVI da cena.');
    } finally {
      setCarregandoId('');
    }
  }

  // Manter a cena selecionada: persiste na nuvem (vira disponível p/ Zona de Manejo).
  async function manterCena() {
    if (!sel || !dataSel || !nav.talhaoId) return;
    if (!cloudPodeGravar()) { setErro('Faça login para manter a cena salva.'); return; }
    const gz = await comprimirGrid(sel.resp.grid);
    cloudSalvarMapa(idNuvem(nav.talhaoId, fonte, dataSel), { resp: { ...sel.resp, grid: gz }, criadoEm: sel.criadoEm });
    setSalvos(s => ({ ...s, [dataSel]: true }));
  }

  function removerCena() {
    if (!dataSel || !nav.talhaoId) return;
    cloudExcluirMapasPorPrefixo(idNuvem(nav.talhaoId, fonte, dataSel)); // id exato = prefixo só desta cena
    setSalvos(s => ({ ...s, [dataSel]: false }));
  }

  if (!legNdvi) return <div className="px-4 py-3"><Aviso texto="Legenda oficial de NDVI não encontrada (seed do sistema)." /></div>;

  const listando = estado === 'listando';
  const ehCbers = fonte === 'cbers';
  const porData = new Map<string, CenaDisponivel & { carregada: boolean }>();
  candidatos.forEach(c => { if (c.data) porData.set(c.data, { ...c, carregada: !!cenas[c.data] }); });
  Object.values(cenas).forEach(m => { const d = m.resp.cena.data; if (d && !porData.has(d)) porData.set(d, { ...m.resp.cena, carregada: true }); });
  const lista = [...porData.values()].sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''));

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
          <button onClick={() => trocarFonte('sentinel')} className="flex-1 py-1.5 rounded text-[10px] font-bold"
            style={{ background: !ehCbers ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: !ehCbers ? '#fff' : '#93c5fd' }}>
            Sentinel-2 · 10 m
          </button>
          <button onClick={() => trocarFonte('cbers')} className="flex-1 py-1.5 rounded text-[10px] font-bold"
            style={{ background: ehCbers ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: ehCbers ? '#fff' : '#93c5fd' }}>
            CBERS-4A · 2 m
          </button>
        </div>
      </div>

      {/* Período + nuvem + buscar cenas */}
      <div className="rounded-lg p-2.5 space-y-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
        <p className="text-[11px] font-semibold flex items-center gap-1" style={{ color: '#93c5fd' }}>
          <Satellite size={12} /> Buscar cenas {ehCbers ? 'CBERS-4A (2 m)' : 'Sentinel-2'}
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
          {!ehCbers && (
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
        <button onClick={listar} disabled={listando || !poligono}
          className="w-full py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1.5"
          style={{ background: (listando || !poligono) ? '#1a3a6b' : 'var(--invicta-green-dark)', opacity: !poligono ? 0.6 : 1 }}>
          {listando ? <><Loader2 size={13} className="animate-spin" /> Buscando cenas…</> : <><Satellite size={13} /> Buscar cenas no período</>}
        </button>
        <p className="text-[9px]" style={{ color: '#475569' }}>
          {ehCbers
            ? 'CBERS-4A (INPE) não traz % de nuvem — escolha pela data/imagem. NDVI a 2 m (realçado com a banda PAN); ~20–30 s por cena.'
            : 'Lista as passagens do Sentinel-2 com nuvem abaixo do limite. Clique numa data para calcular o NDVI dela (10 m, recortado no talhão).'}
        </p>
      </div>

      {estado === 'erro' && <p className="text-[10px]" style={{ color: '#f87171' }}>{erro}</p>}
      {erro && estado !== 'erro' && <p className="text-[10px]" style={{ color: '#fbbf24' }}>{erro}</p>}

      {/* Cenas (disponíveis + carregadas) — escolha quais ver */}
      {lista.length > 0 && (
        <div>
          <label className="text-[10px] font-semibold block mb-1 flex items-center gap-1" style={{ color: '#64748b' }}>
            <Calendar size={11} /> Cenas <span style={{ color: '#475569' }}>· {lista.length} · clique para ver</span>
          </label>
          <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto pr-1">
            {lista.map(c => {
              const ativa = c.data === dataSel;
              const carregando = carregandoId === c.id;
              return (
                <button key={c.id} onClick={() => carregarCena(c)} disabled={carregando}
                  className="px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1"
                  title={`${ddmmyy(c.data)}${c.nuvem != null ? ` · nuvem ${fmt2(c.nuvem)}%` : ''} · ${c.plataforma ?? ''}`}
                  style={{ background: ativa ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: ativa ? '#fff' : (c.carregada ? '#86efac' : '#93c5fd') }}>
                  {carregando ? <Loader2 size={10} className="animate-spin" />
                    : (c.data && salvos[c.data]) ? <Star size={10} fill="currentColor" />
                    : c.carregada ? <Check size={10} /> : null}
                  {ddmmyy(c.data)}
                  {c.nuvem != null && <span style={{ color: ativa ? '#cbd5e1' : '#64748b', fontWeight: 400 }}>· {Math.round(c.nuvem)}%</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Cena selecionada — modo, contraste, info, legenda */}
      {sel && (
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

          {/* Modo de exibição: NDVI x Imagem (cor verdadeira) */}
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
                  {legNdvi.nome} · contínua{contraste ? ' · contraste realçado (p2–p98)' : ''}{ehCbers ? ' · 2 m (PAN)' : ''}
                </p>
              </div>
            </>
          ) : (
            <div className="text-[10px]" style={{ color: '#93c5fd' }}>
              {carregandoImg && !imagens[dataSel]
                ? <span className="flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Carregando imagem de satélite…</span>
                : <span className="flex items-center gap-1"><ImageIcon size={12} /> Cor verdadeira{ehCbers ? ' (CBERS-4A 2 m, pan-sharpened)' : ' (Sentinel-2)'}, recortada no talhão.</span>}
            </div>
          )}

          {nav.talhaoId && (
            salvos[dataSel] ? (
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
