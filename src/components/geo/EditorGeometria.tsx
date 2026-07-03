'use client';

// EDITOR DE GEOMETRIA em tela cheia (medições e limites de talhão).
// Ferramentas: mover/inserir/remover vértices, simplificar, suavizar,
// CORTAR o polígono em dois e RECORTAR buraco/ilha. Mapa próprio (satélite),
// independente do MapView — mesmo padrão leve do MapaColeta.
//
// Contrato: recebe um FeatureCollection e devolve em onSalvar um ARRAY de
// FeatureCollections — normalmente 1; depois de um corte, 1 por parte (a
// primeira é a "principal", as demais viram novos registros no chamador).

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  GeoEditavel, Anel, extrairEditaveis, paraFC, bboxDe,
  areaHaDe, perimetroMDe, simplificarAnel, suavizarAnel, reduzirColineares,
  cortarAnel, validarFuro, pontoNoAnel,
} from '@/lib/geoEditor';
import {
  Move, Eraser, Scissors, CircleDashed, Minimize2, Shrink, Waves, Undo2, X, Check, MousePointerClick,
} from 'lucide-react';

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
  sources: {
    esri_sat: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256, maxzoom: 19, attribution: '© Esri',
    },
  },
  layers: [{ id: 'layer-sat', type: 'raster', source: 'esri_sat' }],
};

type Modo = 'mover' | 'remover' | 'cortar' | 'buraco';

const DICAS: Record<Modo, string> = {
  mover: 'Arraste um vértice para movê-lo · toque num ponto pequeno (entre dois vértices) para INSERIR um novo',
  remover: 'Toque num vértice para removê-lo',
  cortar: 'Toque no mapa desenhando a linha de corte — comece FORA, atravesse a área e termine FORA. Depois toque em Aplicar',
  buraco: 'Toque no mapa desenhando o contorno do recorte (benfeitoria, mata, açude) DENTRO da área. Depois toque em Aplicar',
};

const clonar = (ps: GeoEditavel[]): GeoEditavel[] =>
  ps.map(p => ({ tipo: p.tipo, anel: p.anel.map(v => [...v] as [number, number]), furos: p.furos.map(f => f.map(v => [...v] as [number, number])) }));

export function EditorGeometria({ titulo, fc, onSalvar, onFechar }: {
  titulo: string;
  fc: GeoJSON.FeatureCollection;
  onSalvar: (fcs: GeoJSON.FeatureCollection[]) => void;
  onFechar: () => void;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const prontoRef = useRef(false);

  const [partes, setPartes] = useState<GeoEditavel[]>([]);
  const [ativa, setAtiva] = useState(0);
  const [modo, setModo] = useState<Modo>('mover');
  const [draft, setDraft] = useState<Anel>([]);
  const [hist, setHist] = useState<GeoEditavel[][]>([]);
  const [msg, setMsg] = useState('');
  const [invalido, setInvalido] = useState(false);

  // refs espelho p/ os handlers do mapa (evita closure velha)
  const partesRef = useRef(partes); partesRef.current = partes;
  const ativaRef = useRef(ativa); ativaRef.current = ativa;
  const modoRef = useRef(modo); modoRef.current = modo;
  const draftRef = useRef(draft); draftRef.current = draft;

  // carrega a geometria inicial
  useEffect(() => {
    const eds = extrairEditaveis(fc);
    if (!eds.length) { setInvalido(true); return; }
    setPartes(eds);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const empurrarHist = useCallback(() => {
    setHist(h => [...h.slice(-29), clonar(partesRef.current)]);
  }, []);

  // ── desenho no mapa ─────────────────────────────────────────────────────────
  const pintar = useCallback(() => {
    const map = mapRef.current;
    if (!map || !prontoRef.current) return;
    const ps = partesRef.current, at = ativaRef.current, md = modoRef.current, dr = draftRef.current;

    const geo: GeoJSON.Feature[] = ps.map((p, i) => ({
      ...paraFC(p, { idx: i, ativa: i === at ? 1 : 0 }).features[0],
    }));
    (map.getSource('geo') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: geo });

    // vértices + pontos-médios (inserção) SÓ da parte ativa
    const verts: GeoJSON.Feature[] = [];
    const p = ps[at];
    if (p) {
      const aneis: { anel: Anel; ai: number }[] = [{ anel: p.anel, ai: -1 }, ...p.furos.map((f, i) => ({ anel: f, ai: i }))];
      for (const { anel, ai } of aneis) {
        const n = anel.length;
        anel.forEach(([lng, lat], i) => verts.push({
          type: 'Feature', properties: { ai, i, mid: 0 },
          geometry: { type: 'Point', coordinates: [lng, lat] },
        }));
        if (md === 'mover') {
          const nSeg = p.tipo === 'linha' && ai === -1 ? n - 1 : n;
          for (let i = 0; i < nSeg; i++) {
            const a = anel[i], b = anel[(i + 1) % n];
            verts.push({
              type: 'Feature', properties: { ai, i, mid: 1 },
              geometry: { type: 'Point', coordinates: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] },
            });
          }
        }
      }
    }
    (map.getSource('verts') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: verts });

    // linha de corte / contorno do buraco em desenho
    const draftFeats: GeoJSON.Feature[] = [];
    if (dr.length) {
      const fechado = md === 'buraco' && dr.length >= 3;
      draftFeats.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: fechado ? [...dr, dr[0]] : dr } });
      dr.forEach(pt => draftFeats.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: pt } }));
    }
    (map.getSource('draft') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: draftFeats });
  }, []);

  useEffect(() => { pintar(); }, [partes, ativa, modo, draft, pintar]);

  // ── mapa (init única) ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const map = new maplibregl.Map({ container: divRef.current, style: STYLE, center: [-51.5, -23.5], zoom: 13, attributionControl: false });
    mapRef.current = map;

    map.on('load', () => {
      map.addSource('geo', { type: 'geojson', data: EMPTY_FC });
      map.addSource('verts', { type: 'geojson', data: EMPTY_FC });
      map.addSource('draft', { type: 'geojson', data: EMPTY_FC });

      map.addLayer({ id: 'geo-fill', type: 'fill', source: 'geo', filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': ['case', ['==', ['get', 'ativa'], 1], '#4ade80', '#94a3b8'], 'fill-opacity': 0.14 } });
      map.addLayer({ id: 'geo-line', type: 'line', source: 'geo',
        paint: { 'line-color': ['case', ['==', ['get', 'ativa'], 1], '#4ade80', '#cbd5e1'], 'line-width': ['case', ['==', ['get', 'ativa'], 1], 2.5, 1.5] } });
      map.addLayer({ id: 'verts-mid', type: 'circle', source: 'verts', filter: ['==', ['get', 'mid'], 1],
        paint: { 'circle-radius': 4.5, 'circle-color': '#0ea5e9', 'circle-opacity': 0.55, 'circle-stroke-width': 1, 'circle-stroke-color': '#e0f2fe' } });
      map.addLayer({ id: 'verts-pt', type: 'circle', source: 'verts', filter: ['==', ['get', 'mid'], 0],
        paint: { 'circle-radius': 6.5, 'circle-color': '#fff', 'circle-stroke-width': 2.5, 'circle-stroke-color': '#16a34a' } });
      map.addLayer({ id: 'draft-line', type: 'line', source: 'draft',
        paint: { 'line-color': '#f59e0b', 'line-width': 2.5, 'line-dasharray': [1.6, 1.2] } });
      map.addLayer({ id: 'draft-pt', type: 'circle', source: 'draft', filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-radius': 5, 'circle-color': '#f59e0b', 'circle-stroke-width': 1.5, 'circle-stroke-color': '#fff' } });

      prontoRef.current = true;
      pintar();
      const p0 = partesRef.current[0];
      if (p0) {
        const [a, b, c, d] = bboxDe(p0);
        map.fitBounds([[a, b], [c, d]], { padding: 70, duration: 0, maxZoom: 17 });
      }

      // ── interações ──
      const canvas = map.getCanvas();
      let drag: { ai: number; i: number } | null = null;

      const moverPara = (lng: number, lat: number) => {
        if (!drag) return;
        const ps = partesRef.current;
        const p = ps[ativaRef.current];
        if (!p) return;
        const anel = drag.ai === -1 ? p.anel : p.furos[drag.ai];
        if (!anel?.[drag.i]) return;
        anel[drag.i] = [lng, lat];
        pintar();
      };
      const soltar = () => {
        if (!drag) return;
        drag = null;
        canvas.style.cursor = '';
        map.dragPan.enable();
        setPartes(ps => [...ps]); // commit → re-render (área/perímetro)
      };

      const pegar = (e: maplibregl.MapLayerMouseEvent | maplibregl.MapLayerTouchEvent) => {
        if (modoRef.current !== 'mover') return;
        const f = e.features?.[0];
        if (!f || f.properties?.mid === 1) return;
        e.preventDefault();
        empurrarHist();
        drag = { ai: f.properties!.ai as number, i: f.properties!.i as number };
        canvas.style.cursor = 'grabbing';
        map.dragPan.disable();
      };
      map.on('mousedown', 'verts-pt', pegar);
      map.on('touchstart', 'verts-pt', pegar);
      map.on('mousemove', e => { if (drag) moverPara(e.lngLat.lng, e.lngLat.lat); });
      map.on('touchmove', e => { if (drag && e.points.length === 1) moverPara(e.lngLat.lng, e.lngLat.lat); });
      map.on('mouseup', soltar);
      map.on('touchend', soltar);
      map.on('touchcancel', soltar);

      // inserir vértice: clique no ponto-médio
      map.on('click', 'verts-mid', e => {
        if (modoRef.current !== 'mover') return;
        const f = e.features?.[0];
        if (!f) return;
        const ai = f.properties!.ai as number, i = f.properties!.i as number;
        empurrarHist();
        setPartes(ps => {
          const novo = clonar(ps);
          const p = novo[ativaRef.current];
          const anel = ai === -1 ? p.anel : p.furos[ai];
          anel.splice(i + 1, 0, [e.lngLat.lng, e.lngLat.lat]);
          return novo;
        });
      });

      // remover vértice
      map.on('click', 'verts-pt', e => {
        if (modoRef.current !== 'remover') return;
        const f = e.features?.[0];
        if (!f || f.properties?.mid === 1) return;
        const ai = f.properties!.ai as number, i = f.properties!.i as number;
        empurrarHist();
        setPartes(ps => {
          const novo = clonar(ps);
          const p = novo[ativaRef.current];
          if (ai === -1) {
            const min = p.tipo === 'linha' ? 2 : 3;
            if (p.anel.length > min) p.anel.splice(i, 1);
            else setMsg(`O contorno precisa de pelo menos ${min} vértices.`);
          } else {
            p.furos[ai].splice(i, 1);
            if (p.furos[ai].length < 3) p.furos.splice(ai, 1); // furo degenerou → sai
          }
          return novo;
        });
      });

      // clique no mapa: desenha corte/buraco; ou seleciona outra parte
      map.on('click', e => {
        const md = modoRef.current;
        if (md === 'cortar' || md === 'buraco') {
          const sobre = map.queryRenderedFeatures(e.point, { layers: ['verts-pt', 'verts-mid', 'draft-pt'] });
          if (sobre.length) return;
          setDraft(d => [...d, [e.lngLat.lng, e.lngLat.lat]]);
          return;
        }
        // selecionar parte tocada (quando há mais de uma após um corte)
        if (partesRef.current.length > 1) {
          const hit = map.queryRenderedFeatures(e.point, { layers: ['geo-fill'] })[0];
          const idx = hit?.properties?.idx;
          if (idx != null && idx !== ativaRef.current) setAtiva(Number(idx));
        }
      });

      map.on('mouseenter', 'verts-pt', () => { if (!drag) canvas.style.cursor = modoRef.current === 'remover' ? 'not-allowed' : 'grab'; });
      map.on('mouseleave', 'verts-pt', () => { if (!drag) canvas.style.cursor = ''; });
    });

    return () => { map.remove(); mapRef.current = null; prontoRef.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // cursor por modo
  useEffect(() => {
    const c = mapRef.current?.getCanvas();
    if (c) c.style.cursor = (modo === 'cortar' || modo === 'buraco') ? 'crosshair' : '';
    if (modo !== 'cortar' && modo !== 'buraco') setDraft([]);
    setMsg(DICAS[modo]);
  }, [modo]);

  // ── ações da barra ──────────────────────────────────────────────────────────
  const parte = partes[ativa] ?? null;
  const ha = parte ? areaHaDe(parte) : null;
  const perM = parte ? perimetroMDe(parte) : 0;
  const nVerts = parte ? parte.anel.length + parte.furos.reduce((s, f) => s + f.length, 0) : 0;

  function aplicarCorte() {
    const p = partesRef.current[ativaRef.current];
    if (!p || p.tipo !== 'poligono') return;
    const r = cortarAnel(p.anel, draftRef.current);
    if ('erro' in r) { setMsg(`⚠ ${r.erro}`); return; }
    empurrarHist();
    setPartes(ps => {
      const novo = clonar(ps);
      const alvo = novo[ativaRef.current];
      const furosA = alvo.furos.filter(f => pontoNoAnel(f[0], r.a));
      const furosB = alvo.furos.filter(f => !pontoNoAnel(f[0], r.a));
      alvo.anel = r.a; alvo.furos = furosA;
      novo.splice(ativaRef.current + 1, 0, { tipo: 'poligono', anel: r.b, furos: furosB });
      return novo;
    });
    setDraft([]);
    setModo('mover');
    setMsg('✂ Dividido em 2 áreas — toque numa parte para selecioná-la. Ao salvar, cada parte vira um registro.');
  }

  function aplicarBuraco() {
    const p = partesRef.current[ativaRef.current];
    if (!p || p.tipo !== 'poligono') return;
    const erro = validarFuro(p.anel, p.furos, draftRef.current);
    if (erro) { setMsg(`⚠ ${erro}`); return; }
    empurrarHist();
    const novoFuro = draftRef.current.map(v => [...v] as [number, number]);
    setPartes(ps => {
      const novo = clonar(ps);
      novo[ativaRef.current].furos.push(novoFuro);
      return novo;
    });
    setDraft([]);
    setModo('mover');
    setMsg('◎ Recorte aplicado — a área já desconta o buraco.');
  }

  // reduzir SEM alterar o contorno (tira só vértices redundantes/colineares)
  function reduzir() {
    if (!parte) return;
    empurrarHist();
    const antes = nVerts;
    setPartes(ps => {
      const novo = clonar(ps);
      const p = novo[ativaRef.current];
      p.anel = reduzirColineares(p.anel, 0.3, p.tipo === 'poligono');
      p.furos = p.furos.map(f => reduzirColineares(f, 0.3, true));
      return novo;
    });
    setTimeout(() => {
      const p = partesRef.current[ativaRef.current];
      const depois = p ? p.anel.length + p.furos.reduce((s, f) => s + f.length, 0) : 0;
      setMsg(depois < antes
        ? `Reduzido: ${antes} → ${depois} vértices — contorno preservado (tolerância 0,3 m).`
        : 'Nenhum vértice redundante — o contorno já está enxuto.');
    }, 0);
  }

  function simplificar() {
    if (!parte) return;
    empurrarHist();
    const antes = nVerts;
    setPartes(ps => {
      const novo = clonar(ps);
      const p = novo[ativaRef.current];
      p.anel = simplificarAnel(p.anel, 1.5, p.tipo === 'poligono');
      p.furos = p.furos.map(f => simplificarAnel(f, 1.5, true));
      return novo;
    });
    setTimeout(() => {
      const p = partesRef.current[ativaRef.current];
      const depois = p ? p.anel.length + p.furos.reduce((s, f) => s + f.length, 0) : 0;
      setMsg(`Simplificado: de ${antes} para ${depois} vértices (tolerância 1,5 m — pode mexer levemente no contorno).`);
    }, 0);
  }

  function suavizar() {
    if (!parte) return;
    if (nVerts > 1500) { setMsg('⚠ Muitos vértices — simplifique antes de suavizar.'); return; }
    empurrarHist();
    setPartes(ps => {
      const novo = clonar(ps);
      const p = novo[ativaRef.current];
      p.anel = suavizarAnel(p.anel, p.tipo === 'poligono');
      p.furos = p.furos.map(f => suavizarAnel(f, true));
      return novo;
    });
    setMsg('Cantos suavizados (os vértices dobram — dá pra simplificar depois).');
  }

  function desfazer() {
    setHist(h => {
      if (!h.length) return h;
      const ult = h[h.length - 1];
      setPartes(ult);
      setAtiva(a => Math.min(a, ult.length - 1));
      return h.slice(0, -1);
    });
    setDraft([]);
  }

  function salvar() {
    onSalvar(partesRef.current.map(p => paraFC(p)));
  }

  const podeAplicar = modo === 'cortar' ? draft.length >= 2 : modo === 'buraco' ? draft.length >= 3 : false;
  const ehPoli = parte?.tipo === 'poligono';

  if (invalido) {
    return createPortal(
      <div className="fixed inset-0 z-[9999] flex items-center justify-center px-6" style={{ background: 'rgba(0,0,0,0.8)' }}>
        <div className="rounded-2xl p-6 max-w-sm text-center space-y-3" style={{ background: '#0a1929', border: '1px solid #1a3a6b' }}>
          <p className="text-sm font-bold" style={{ color: '#e2e8f0' }}>Não consegui montar a geometria</p>
          <p className="text-xs" style={{ color: '#94a3b8' }}>O arquivo não tem um polígono nem linhas que formem um contorno editável.</p>
          <button onClick={onFechar} className="px-4 py-2 rounded-lg text-xs font-bold text-white" style={{ background: 'var(--invicta-blue-mid)' }}>Fechar</button>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col" style={{ background: '#061525' }}>
      {/* HEADER: título + medidas + Cancelar/Salvar (sempre visíveis) */}
      <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
        style={{ background: '#0a1929', borderBottom: '1px solid #1a3a6b', paddingTop: 'max(8px, env(safe-area-inset-top))' }}>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold truncate" style={{ color: '#e2e8f0' }}>✏ {titulo}</p>
          <p className="text-[10px] truncate" style={{ color: '#93c5fd' }}>
            {ha != null ? `${ha.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ha · ` : ''}
            {(perM / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} km · {nVerts} vértices
            {partes.length > 1 ? ` · parte ${ativa + 1}/${partes.length}` : ''}
          </p>
        </div>
        <button onClick={onFechar} className="flex items-center gap-1 px-3 py-2 rounded-lg text-[11px] font-bold flex-shrink-0"
          style={{ background: '#7f1d1d', color: '#fca5a5' }}><X size={14} /> Cancelar</button>
        <button onClick={salvar} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black text-white flex-shrink-0 shadow"
          style={{ background: '#16a34a' }}><Check size={15} /> Salvar</button>
      </div>

      {/* PALETA: todas as ferramentas visíveis — modos (alternam) + ações */}
      <div className="flex items-center gap-1 px-2 py-1.5 overflow-x-auto flex-shrink-0"
        style={{ background: '#0b1d3a', borderBottom: '1px solid #1a3a6b' }}>
        <span className="text-[9px] font-bold uppercase tracking-wider px-1 flex-shrink-0" style={{ color: '#64748b' }}>Modo</span>
        <Ferramenta icone={Move} rotulo="Mover" ativa={modo === 'mover'} onClick={() => setModo('mover')} />
        <Ferramenta icone={Eraser} rotulo="Remover" ativa={modo === 'remover'} onClick={() => setModo('remover')} />
        {ehPoli && <Ferramenta icone={Scissors} rotulo="Cortar" ativa={modo === 'cortar'} onClick={() => setModo('cortar')} />}
        {ehPoli && <Ferramenta icone={CircleDashed} rotulo="Buraco" ativa={modo === 'buraco'} onClick={() => setModo('buraco')} />}
        <span className="w-px h-6 mx-1 flex-shrink-0" style={{ background: '#1a3a6b' }} />
        <span className="text-[9px] font-bold uppercase tracking-wider px-1 flex-shrink-0" style={{ color: '#64748b' }}>Ações</span>
        <Ferramenta icone={Shrink} rotulo="Reduzir" onClick={reduzir} />
        <Ferramenta icone={Minimize2} rotulo="Simplificar" onClick={simplificar} />
        <Ferramenta icone={Waves} rotulo="Suavizar" onClick={suavizar} />
        <Ferramenta icone={Undo2} rotulo="Desfazer" desabilitada={!hist.length} onClick={desfazer} />
      </div>

      {/* mapa */}
      <div className="flex-1 relative">
        <div ref={divRef} className="absolute inset-0" style={{ position: 'absolute' }} />
        {podeAplicar && (
          <button onClick={modo === 'cortar' ? aplicarCorte : aplicarBuraco}
            className="absolute bottom-16 left-1/2 -translate-x-1/2 flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-black text-white shadow-lg"
            style={{ background: '#d97706' }}>
            <MousePointerClick size={16} /> Aplicar {modo === 'cortar' ? 'corte' : 'recorte'} ({draft.length} pts)
          </button>
        )}
        {(modo === 'cortar' || modo === 'buraco') && draft.length > 0 && (
          <button onClick={() => setDraft([])}
            className="absolute bottom-16 right-3 px-3 py-2 rounded-xl text-[11px] font-bold"
            style={{ background: 'rgba(6,21,37,0.92)', color: '#fbbf24', border: '1px solid #1a3a6b' }}>
            Limpar traço
          </button>
        )}
      </div>

      {/* dica / mensagem */}
      <p className="px-4 py-2 text-[11px] flex-shrink-0" style={{ background: '#0a1929', borderTop: '1px solid #1a3a6b', color: msg.startsWith('⚠') ? '#fbbf24' : '#94a3b8', paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
        {msg || DICAS[modo]}
      </p>
    </div>,
    document.body,
  );
}

function Ferramenta({ icone: Icone, rotulo, ativa, desabilitada, onClick }: {
  icone: React.ElementType; rotulo: string; ativa?: boolean; desabilitada?: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} disabled={desabilitada} title={rotulo}
      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold disabled:opacity-35 flex-shrink-0 whitespace-nowrap"
      style={{ background: ativa ? '#2e5fa3' : '#1a3a6b', color: ativa ? '#fff' : '#93c5fd', outline: ativa ? '1.5px solid #60a5fa' : 'none' }}>
      <Icone size={13} /> {rotulo}
    </button>
  );
}
