'use client';

// Aba NDVI / Satélite (MSR — Fase S1). Busca a cena Sentinel-2 mais recente
// com pouca nuvem sobre o talhão, calcula o NDVI no backend e exibe no mapa
// com a legenda oficial. Reusa o overlay/render/persistência da Fertilidade.

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { getTalhoes, getLegendasPorAtributo } from '@/lib/store';
import {
  extrairPoligono, coordsFromBounds, gradienteCss,
  comprimirGrid, descomprimirGrid, type Grid,
} from '@/lib/fertilidade';
import { colorirGridComLegenda } from '@/lib/raster';
import { buscarNdviSentinel, type RespNdvi } from '@/lib/msr';
import { cloudSalvarMapa, cloudCarregarMapasPorPrefixo, cloudPodeGravar } from '@/lib/cloud';
import type { Legenda } from '@/lib/legendas';
import { Satellite, Loader2, AlertTriangle, Save, Calendar } from 'lucide-react';

const inputStyle = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;
const fmt2 = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const OPACIDADE = 1;

type MapaNdvi = { resp: RespNdvi; criadoEm: string };
const prefixoNuvem = (talhaoId: string) => `${talhaoId}__ndvi__`;
const idNuvem = (talhaoId: string, data: string) => `${prefixoNuvem(talhaoId)}NDVI__${data}`;

export function NdviSection() {
  const { nav, uploadedGeo, setFertilidadeOverlay, setFertilidadeLabels } = useApp();

  const hoje = useMemo(() => new Date(), []);
  const [dataIni, setDataIni] = useState(isoDate(new Date(Date.now() - 60 * 864e5)));
  const [dataFim, setDataFim] = useState(isoDate(hoje));
  const [nuvemMax, setNuvemMax] = useState(40);

  const [estado, setEstado] = useState<'idle' | 'buscando' | 'pronto' | 'erro'>('idle');
  const [erro, setErro] = useState('');
  // Cenas em mãos (chave = data da cena). Vira a série temporal inicial.
  const [cenas, setCenas] = useState<Record<string, MapaNdvi>>({});
  const [dataSel, setDataSel] = useState('');

  // Legenda NDVI oficial (seed garantido no boot).
  const legNdvi: Legenda | undefined = useMemo(() => getLegendasPorAtributo('ndvi')[0], []);

  const poligono = useMemo(() => {
    const p = extrairPoligono(uploadedGeo);
    if (p) return p;
    if (!nav.talhaoId) return null;
    const t = getTalhoes().find(x => x.id === nav.talhaoId);
    if (t?.geojson) { try { return extrairPoligono(JSON.parse(t.geojson)); } catch {} }
    return null;
  }, [uploadedGeo, nav.talhaoId]);

  // Autoload das cenas salvas ao abrir o talhão -> mostra a mais recente.
  useEffect(() => {
    setCenas({}); setDataSel(''); setEstado('idle'); setErro('');
    if (!nav.talhaoId) return;
    (async () => {
      const carregados = await cloudCarregarMapasPorPrefixo<MapaNdvi>(prefixoNuvem(nav.talhaoId!));
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
      const maisRecente = Object.keys(novo).sort().pop();
      if (maisRecente) setDataSel(maisRecente);
    })();
  }, [nav.talhaoId]);

  // Render no mapa: colore a cena selecionada com a legenda NDVI.
  useEffect(() => {
    if (!legNdvi || !dataSel) { setFertilidadeOverlay(null); setFertilidadeLabels(null); return; }
    const m = cenas[dataSel];
    if (!m?.resp?.grid?.b64) { setFertilidadeOverlay(null); return; }
    let url: string | undefined;
    try { url = colorirGridComLegenda(m.resp.grid, legNdvi).dataUrl; }
    catch (e) { console.warn('[ndvi] colorir falhou:', e); }
    if (!url) { setFertilidadeOverlay(null); return; }
    setFertilidadeOverlay({ url, coordinates: coordsFromBounds(m.resp.bounds), opacity: OPACIDADE });
    setFertilidadeLabels(null);
  }, [cenas, dataSel, legNdvi, setFertilidadeOverlay, setFertilidadeLabels]);

  // Limpa o overlay ao sair da aba.
  useEffect(() => () => { setFertilidadeOverlay(null); setFertilidadeLabels(null); }, [setFertilidadeOverlay, setFertilidadeLabels]);

  async function buscar() {
    if (!poligono) { setErro('Limite do talhão não encontrado — abra o talhão no mapa.'); setEstado('erro'); return; }
    setEstado('buscando'); setErro('');
    try {
      const resp = await buscarNdviSentinel({ poligono, dataIni, dataFim, nuvemMax });
      const data = resp.cena.data ?? isoDate(new Date());
      const criadoEm = new Date().toISOString();
      setCenas(c => ({ ...c, [data]: { resp, criadoEm } }));
      setDataSel(data);
      setEstado('pronto');
      // Persiste (grid gzip p/ caber no Firestore). PNG não é salvo (colorimos local).
      if (nav.talhaoId && cloudPodeGravar()) {
        const gz = await comprimirGrid(resp.grid);
        cloudSalvarMapa(idNuvem(nav.talhaoId, data), { resp: { ...resp, grid: gz }, criadoEm });
      }
    } catch (e) {
      setEstado('erro'); setErro(e instanceof Error ? e.message : 'Falha ao buscar NDVI.');
    }
  }

  if (!legNdvi) return <div className="px-4 py-3"><Aviso texto="Legenda oficial de NDVI não encontrada (seed do sistema)." /></div>;

  const buscando = estado === 'buscando';
  const sel = dataSel ? cenas[dataSel] : undefined;
  const datas = Object.keys(cenas).sort().reverse();

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

      {/* Período + nuvem */}
      <div className="rounded-lg p-2.5 space-y-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
        <p className="text-[11px] font-semibold flex items-center gap-1" style={{ color: '#93c5fd' }}>
          <Satellite size={12} /> Buscar cena Sentinel-2
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
          <div style={{ width: 92 }}>
            <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Nuvem máx</label>
            <div className="flex items-center gap-1">
              <input type="number" min={0} max={100} value={nuvemMax} onChange={e => setNuvemMax(Number(e.target.value))}
                className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle} />
              <span className="text-[10px]" style={{ color: '#64748b' }}>%</span>
            </div>
          </div>
        </div>
        <button onClick={buscar} disabled={buscando || !poligono}
          className="w-full py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1.5"
          style={{ background: (buscando || !poligono) ? '#1a3a6b' : 'var(--invicta-green-dark)', opacity: !poligono ? 0.6 : 1 }}>
          {buscando ? <><Loader2 size={13} className="animate-spin" /> Buscando imagem…</> : <><Satellite size={13} /> Buscar imagem (Sentinel-2)</>}
        </button>
        <p className="text-[9px]" style={{ color: '#475569' }}>
          Pega a cena mais recente com nuvem abaixo do limite. NDVI calculado no backend (10 m), recortado no talhão.
        </p>
      </div>

      {estado === 'erro' && <p className="text-[10px]" style={{ color: '#f87171' }}>{erro}</p>}

      {/* Cenas em mãos (série inicial) */}
      {datas.length > 0 && (
        <div>
          <label className="text-[10px] font-semibold block mb-1 flex items-center gap-1" style={{ color: '#64748b' }}>
            <Calendar size={11} /> Cenas {datas.length > 1 && <span style={{ color: '#475569' }}>· {datas.length}</span>}
          </label>
          <div className="flex flex-wrap gap-1">
            {datas.map(d => (
              <button key={d} onClick={() => setDataSel(d)} className="px-2 py-1 rounded text-[10px] font-bold"
                style={{ background: d === dataSel ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: d === dataSel ? '#fff' : '#93c5fd' }}>
                {new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Cena selecionada — info + estatísticas + legenda */}
      {sel && (
        <div className="space-y-2 p-2.5 rounded-lg" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[10px]" style={{ color: '#86efac' }}>
              <Satellite size={12} />
              {sel.resp.cena.plataforma ?? 'Sentinel-2'} · {sel.resp.cena.data ? new Date(sel.resp.cena.data + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
            </div>
            {sel.resp.cena.nuvem != null && (
              <span className="text-[10px]" style={{ color: '#64748b' }}>☁ {fmt2(sel.resp.cena.nuvem)}%</span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <Metrica rotulo="NDVI médio" valor={fmt2(sel.resp.stats.media)} destaque />
            <Metrica rotulo="mínimo" valor={fmt2(sel.resp.stats.min)} />
            <Metrica rotulo="máximo" valor={fmt2(sel.resp.stats.max)} />
          </div>

          <div className="text-[9px] leading-relaxed" style={{ color: '#64748b' }}>
            grade {sel.resp.stats.nx}×{sel.resp.stats.ny} · pixel <strong style={{ color: '#94a3b8' }}>{sel.resp.stats.pixel_m} m</strong> · {sel.resp.stats.n} px válidos
          </div>

          {/* Barra da legenda NDVI (0–1) */}
          <BarraLegenda leg={legNdvi} />
          <p className="text-[9px]" style={{ color: '#64748b' }}>{legNdvi.nome} · {legNdvi.unidade}</p>

          {nav.talhaoId && cloudPodeGravar() && (
            <p className="text-[9px] flex items-center gap-1" style={{ color: '#86efac' }}>
              <Save size={10} /> Cena salva na nuvem — recarrega sem rebuscar.
            </p>
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

// Barra horizontal da legenda (mesmas larguras visuais por classe) + limites.
function BarraLegenda({ leg }: { leg: Legenda }) {
  const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  return (
    <div>
      <div className="relative h-4 rounded overflow-hidden"
        style={{ border: '1px solid rgba(255,255,255,0.1)', background: gradienteCss(leg) }} />
      <div className="relative h-3 text-[8px]" style={{ color: '#cbd5e1' }}>
        {(() => {
          let acumulado = 0;
          const bordas: Array<{ valor: number; pos: number }> = [];
          for (let i = 0; i < leg.classes.length - 1; i++) {
            acumulado += leg.classes[i].larguraVisual;
            const b = leg.classes[i].valorMax;
            if (b != null) bordas.push({ valor: b, pos: acumulado });
          }
          return bordas.map(b => (
            <span key={b.valor} className="absolute" style={{ left: `${b.pos}%`, transform: 'translateX(-50%)' }}>{fmt(b.valor)}</span>
          ));
        })()}
      </div>
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
