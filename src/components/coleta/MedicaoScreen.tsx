'use client';

// Módulo de MEDIÇÃO GPS do app de campo (spec Sistema_Medicoes_GPS_Invicta.md).
// Desenha polígono (área) ou linha (distância) tocando no mapa, marcando no GPS
// ou GRAVANDO A CAMINHADA — registra 1 ponto/seg em movimento, com filtro de
// precisão. Pausar/retomar, finalizar (fecha o polígono), cancelar. Cada ponto
// guarda metadados (precisão, velocidade, hora). Offline; sincroniza depois.

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import turfArea from '@turf/area';
import { MapaColeta } from './MapaColeta';
import { useGps } from './useGps';
import {
  distanciaM, formatarDist,
  MedicaoCampo, PontoMedicao, TipoMedicao, CATEGORIAS_MEDICAO,
  getMedicoes, salvarMedicao, excluirMedicao,
} from '@/lib/coleta';
import { getTalhoes, getSafras, getFazendas, getClientes, Talhao } from '@/lib/store';
import { parseGeoFile } from '@/lib/geo';
import { emailUsuario } from '@/lib/auth';
import {
  ChevronLeft, Crosshair, Layers, Maximize2, Plus, Undo2, Trash2, List, X, AlertTriangle, Save,
  Play, Pause, Flag, SlidersHorizontal, Shapes, Upload,
} from 'lucide-react';

const AZUL_ESC = '#061525', AZUL = '#0a1929', BORDA = '#1a3a6b', TXT = '#e2e8f0', SUB = '#64748b';
const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

// Parâmetros da captura (spec seções 4.3 e 15).
const TICK_MS = 1000;      // base do cronômetro (1 s); a gravação amostra a cada N ticks
const FREQS = [1, 2, 3, 4, 5] as const; // frequência de gravação (segundos)
const MIN_MOVE_M = 0.7;    // só grava se andou ≥ 0,7 m (em movimento)
const MAX_ACC_M = 25;      // ignora leituras com precisão pior que 25 m

// Aplica um OFFSET lateral (m) perpendicular à direção de caminhada.
function aplicarOffset(
  lng: number, lat: number, prevLng: number, prevLat: number,
  offM: number, lado: 'esq' | 'dir',
): [number, number] {
  if (!offM) return [lng, lat];
  const mLat = 1 / 110540;
  const mLng = 1 / (111320 * Math.cos((lat * Math.PI) / 180));
  let dx = (lng - prevLng) / mLng, dy = (lat - prevLat) / mLat;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return [lng, lat];
  dx /= len; dy /= len;
  const [px, py] = lado === 'esq' ? [-dy, dx] : [dy, -dx];
  return [lng + px * offM * mLng, lat + py * offM * mLat];
}

function medir(tipo: TipoMedicao, coords: [number, number][]) {
  if (tipo === 'ponto') return { areaHa: null as number | null, perimetroM: 0 };
  let compr = 0;
  for (let i = 1; i < coords.length; i++) {
    compr += distanciaM(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
  }
  if (tipo === 'linha' || coords.length < 3) return { areaHa: null as number | null, perimetroM: compr };
  const anel = [...coords, coords[0]];
  const fechamento = distanciaM(coords[coords.length - 1][0], coords[coords.length - 1][1], coords[0][0], coords[0][1]);
  const fc: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [anel] } }],
  };
  return { areaHa: turfArea(fc) / 10000, perimetroM: compr + fechamento };
}

// Perímetro do caminho ABERTO (sem fechamento), somando os segmentos.
// Usado pelo cálculo incremental (o fechamento do polígono entra à parte).
function comprAberto(coords: [number, number][]): number {
  let compr = 0;
  for (let i = 1; i < coords.length; i++) {
    compr += distanciaM(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
  }
  return compr;
}

// De quantos em quantos pontos novos a ÁREA exibida ao vivo é recalculada
// (turfArea é O(n)). O valor salvo continua vindo do medir() completo.
const AREA_THROTTLE = 10;

function fmtTempo(s: number) {
  const m = Math.floor(s / 60), r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export function MedicaoScreen({ onVoltar }: { onVoltar: () => void }) {
  const { userPos, velKmH, gpsErro } = useGps();
  const [tipo, setTipo] = useState<TipoMedicao>('poligono');
  const [pontos, setPontos] = useState<PontoMedicao[]>([]);
  const [modo, setModo] = useState<'sat' | 'ruas'>('sat');
  const [seguir, setSeguir] = useState(true);
  const [pedidoGps, setPedidoGps] = useState(0);
  const [pedidoEnquadrar, setPedidoEnquadrar] = useState(0);
  const [mostraSalvas, setMostraSalvas] = useState(false);
  const [mostraSalvar, setMostraSalvar] = useState(false);
  const [salvas, setSalvas] = useState<MedicaoCampo[]>(() => getMedicoes());
  const [msg, setMsg] = useState('');
  // #2: camada de referência (talhão/medição/arquivo) visível durante a medição
  const [referencia, setReferencia] = useState<GeoJSON.FeatureCollection | null>(null);
  const [refNome, setRefNome] = useState('');
  const [mostraRef, setMostraRef] = useState(false);
  const inputRefArq = useRef<HTMLInputElement>(null);
  // talhões com limite, em ÁRVORE produtor → fazenda → talhão (só os autorizados)
  const arvoreRef = useMemo(() => {
    const clientes = getClientes();
    const fazById = new Map(getFazendas().map(f => [f.id, f]));
    const porFaz = new Map<string, { id: string; nome: string; clienteId: string; talhoes: Talhao[] }>();
    for (const t of getTalhoes().filter(t => !!t.geojson)) {
      const f = fazById.get(t.fazendaId);
      if (!f) continue;
      const e = porFaz.get(f.id) ?? { id: f.id, nome: f.nome, clienteId: f.clienteId, talhoes: [] };
      e.talhoes.push(t); porFaz.set(f.id, e);
    }
    const porProd = new Map<string, { id: string; nome: string; fazendas: { id: string; nome: string; talhoes: Talhao[] }[] }>();
    for (const f of porFaz.values()) {
      const nome = clientes.find(c => c.id === f.clienteId)?.nome ?? '(sem produtor)';
      const p = porProd.get(f.clienteId) ?? { id: f.clienteId, nome, fazendas: [] };
      p.fazendas.push({ id: f.id, nome: f.nome, talhoes: f.talhoes }); porProd.set(f.clienteId, p);
    }
    const prods = [...porProd.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    prods.forEach(p => p.fazendas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
    return prods;
  }, []);
  const [drillProd, setDrillProd] = useState<string | null>(null);
  const [drillFaz, setDrillFaz] = useState<string | null>(null);
  const bboxRef2 = useMemo(() => bboxDeFC(referencia), [referencia]);

  // gravação de caminhada
  const [gravando, setGravando] = useState(false);
  const [pausado, setPausado] = useState(false);
  const [finalizado, setFinalizado] = useState(false); // fecha o polígono só ao finalizar
  const [elapsed, setElapsed] = useState(0);            // segundos gravando
  const [offsetM, setOffsetM] = useState(0);
  const [offsetLado, setOffsetLado] = useState<'esq' | 'dir'>('dir');
  const [freqS, setFreqS] = useState(1);   // grava 1 ponto a cada freqS segundos
  const [mostraAjustes, setMostraAjustes] = useState(false);

  const userPosRef = useRef(userPos); userPosRef.current = userPos;
  const velRef = useRef(velKmH); velRef.current = velKmH;
  const pausadoRef = useRef(pausado); pausadoRef.current = pausado;
  const offsetRef = useRef({ m: offsetM, lado: offsetLado }); offsetRef.current = { m: offsetM, lado: offsetLado };
  const freqRef = useRef(freqS); freqRef.current = freqS;
  const tickRef = useRef(0); // contador de ticks p/ amostrar a cada freqS
  const ultimoGravadoRef = useRef<[number, number] | null>(null); // último ponto gravado (cru, p/ espaçamento e direção)

  // ── estado derivado INCREMENTAL (evita O(n) por ponto durante a caminhada) ──
  // coordsRef espelha `pontos` como [lng,lat]; perimAbertoRef acumula o
  // comprimento do caminho ABERTO. A sincronização roda num useEffect keyed em
  // `pontos` (refs só são acessados em efeitos/handlers). Caminho quente = APPEND
  // puro (mesmo array + N no fim): soma só os novos segmentos. Qualquer outra
  // mudança de `pontos` (reset/limpar, desfazer/slice, reabrir salva) reconstrói
  // coordsRef e o perímetro do zero. As medidas exibidas vivem em STATE
  // (medidasView) para o render nunca ler refs meio-sincronizados.
  const coordsRef = useRef<[number, number][]>([]);
  const perimAbertoRef = useRef(0);          // soma dos segmentos (caminho aberto)
  const prevPontosRef = useRef<PontoMedicao[]>([]); // identidade anterior de `pontos`
  const areaAcumRef = useRef(0);             // pontos gravados desde o último turfArea
  const areaHaRef = useRef<number | null>(null); // última área calculada (p/ throttle)

  const [medidasView, setMedidasView] = useState<{ areaHa: number | null; perimetroM: number }>({ areaHa: null, perimetroM: 0 });

  // Atualiza medidasView a partir dos refs. Perímetro sempre EXATO (acumulador +
  // fechamento se polígono); área só recalcula (turfArea) quando `areaCompleta`,
  // senão mantém a última (throttle) — afeta apenas a EXIBIÇÃO ao vivo.
  const recomputarMedidas = useCallback((tp: TipoMedicao, areaCompleta: boolean) => {
    const cs = coordsRef.current;
    if (tp === 'ponto') { setMedidasView({ areaHa: null, perimetroM: 0 }); return; }
    const fecha = tp === 'poligono' && cs.length >= 3;
    const fechamento = fecha ? distanciaM(cs[cs.length - 1][0], cs[cs.length - 1][1], cs[0][0], cs[0][1]) : 0;
    if (fecha && areaCompleta) {
      const anel = [...cs, cs[0]];
      areaHaRef.current = turfArea({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [anel] } }] }) / 10000;
      areaAcumRef.current = 0;
    } else if (!fecha) {
      areaHaRef.current = null;
    }
    setMedidasView({ areaHa: fecha ? areaHaRef.current : null, perimetroM: perimAbertoRef.current + fechamento });
  }, []);

  // Sincroniza refs ↔ `pontos` e recalcula medidas. Roda quando `pontos`, `tipo`
  // ou `gravando` mudam. Caminho quente = APPEND puro (só soma novos segmentos);
  // reset/desfazer/reabrir reconstrói do zero e força área completa. Mudança só
  // de tipo/gravando não gera novos pontos (append de 0), mas força área completa
  // — garante que ao alternar tipo ou ao finalizar (fecha o polígono) o valor
  // exibido fique exato.
  useEffect(() => {
    const prev = prevPontosRef.current;
    const cs = coordsRef.current;
    const ehAppend = pontos.length >= prev.length && cs.length === prev.length
      && (prev.length === 0 || pontos[prev.length - 1] === prev[prev.length - 1]);
    let reconstruiu = false, novos = 0;
    if (ehAppend) {
      for (let i = prev.length; i < pontos.length; i++) {
        const p = pontos[i];
        if (cs.length > 0) perimAbertoRef.current += distanciaM(cs[cs.length - 1][0], cs[cs.length - 1][1], p.lng, p.lat);
        cs.push([p.lng, p.lat]);
      }
      novos = pontos.length - prev.length;
    } else {
      const nc = pontos.map(p => [p.lng, p.lat] as [number, number]);
      coordsRef.current = nc;
      perimAbertoRef.current = comprAberto(nc);
      reconstruiu = true;
    }
    prevPontosRef.current = pontos;
    areaAcumRef.current += novos;
    // Área com THROTTLE: turfArea a cada AREA_THROTTLE pontos gravados; fora de
    // gravação (toque/GPS manual, pausa, finalização), em reconstrução ou quando
    // não houve novos pontos (troca de tipo/estado) recalcula na hora.
    const areaCompleta = reconstruiu || !gravando || novos === 0 || areaAcumRef.current >= AREA_THROTTLE;
    recomputarMedidas(tipo, areaCompleta);
  }, [pontos, tipo, gravando, recomputarMedidas]);

  const nCoords = pontos.length; // == coordsRef.current.length (guardas de UI)

  const pushPonto = useCallback((lng: number, lat: number, meta?: Partial<PontoMedicao>) => {
    setPontos(ps => [...ps, { lng, lat, em: new Date().toISOString(), ...meta }]);
  }, []);

  // ── motor de captura: cronômetro de 1 s; amostra a cada freqS ticks (spec 4.2/4.3) ──
  useEffect(() => {
    if (!gravando) return;
    tickRef.current = 0;
    const id = setInterval(() => {
      setElapsed(e => e + 1);            // tempo decorrido em segundos reais
      if (pausadoRef.current) return;
      tickRef.current += 1;
      if (tickRef.current < freqRef.current) return; // ainda não é hora de gravar
      tickRef.current = 0;
      const p = userPosRef.current;
      if (!p) return;
      if (p.acc > MAX_ACC_M) { setMsg(`GPS impreciso (±${Math.round(p.acc)} m) — ponto ignorado.`); return; }
      const ultimo = ultimoGravadoRef.current;
      if (ultimo && distanciaM(ultimo[0], ultimo[1], p.lng, p.lat) < MIN_MOVE_M) return; // parado
      const { m, lado } = offsetRef.current;
      const pt = ultimo ? aplicarOffset(p.lng, p.lat, ultimo[0], ultimo[1], m, lado) : [p.lng, p.lat];
      ultimoGravadoRef.current = [p.lng, p.lat];
      pushPonto(pt[0], pt[1], { precisaoM: Math.round(p.acc), velKmH: velRef.current ?? undefined });
      setMsg('');
    }, TICK_MS);
    return () => clearInterval(id);
  }, [gravando, pushPonto]);

  function iniciarGravacao() {
    setGravando(true); setPausado(false); setFinalizado(false); setMsg('');
    if (pontos.length === 0) setElapsed(0);
    setSeguir(true); setPedidoGps(x => x + 1);
    ultimoGravadoRef.current = null;
  }
  function finalizarGravacao() {
    setGravando(false); setPausado(false); setFinalizado(true);
    setMsg(tipo === 'poligono' && pontos.length >= 3
      ? 'Finalizado — pontos ligados automaticamente (polígono fechado).'
      : 'Finalizado.');
    setSeguir(false); setPedidoEnquadrar(x => x + 1);
  }
  function cancelar() {
    if (pontos.length && !confirm('Deseja cancelar esta medição?\nOs pontos registrados serão descartados.')) return;
    setPontos([]); setGravando(false); setPausado(false); setFinalizado(false);
    setElapsed(0); setMsg(''); ultimoGravadoRef.current = null;
  }

  function addVerticeGps() {
    const p = userPosRef.current;
    if (!p) { setMsg('Aguardando o GPS…'); return; }
    setMsg('');
    const ultimo = ultimoGravadoRef.current;
    const { m, lado } = offsetRef.current;
    const pt = ultimo ? aplicarOffset(p.lng, p.lat, ultimo[0], ultimo[1], m, lado) : [p.lng, p.lat];
    ultimoGravadoRef.current = [p.lng, p.lat];
    pushPonto(pt[0], pt[1], { precisaoM: Math.round(p.acc), velKmH: velRef.current ?? undefined });
  }

  // Medidas exibidas ao vivo: perímetro sempre exato (acumulador), área com
  // throttle. O caminho de SALVAR usa medir(tipo, coords) completo (ver onSalvo
  // e SalvarDialog), então o valor gravado é idêntico ao original.
  const medidas = medidasView;

  // Durante a caminhada (não finalizado) o polígono é um CONTORNO ABERTO (spec 4.4).
  // Recria só o FeatureCollection por atualização (comportamento visível idêntico
  // ao anterior, atualiza a cada ponto). Deriva de `pontos` diretamente — a
  // otimização de O(n²) está no perímetro/área (acumulador + throttle), não aqui.
  const desenho: GeoJSON.FeatureCollection = useMemo(() => {
    if (pontos.length === 0) return EMPTY_FC;
    const feats: GeoJSON.Feature[] = pontos.map(p => ({
      type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
    }));
    const fecharPoligono = tipo === 'poligono' && pontos.length >= 3 && !gravando;
    if (fecharPoligono) {
      const anel = pontos.map(p => [p.lng, p.lat] as [number, number]);
      anel.push([pontos[0].lng, pontos[0].lat]);
      feats.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [anel] } });
    } else if (tipo !== 'ponto' && pontos.length >= 2) {
      feats.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pontos.map(p => [p.lng, p.lat]) } });
    }
    return { type: 'FeatureCollection', features: feats };
  }, [tipo, gravando, pontos]);

  const bboxDesenho = useMemo<[number, number, number, number] | null>(() => {
    if (pontos.length < 2) return null;
    let [a, b, c, d] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const { lng, lat } of pontos) {
      a = Math.min(a, lng); b = Math.min(b, lat); c = Math.max(c, lng); d = Math.max(d, lat);
    }
    const mLng = (c - a) * 0.15 || 0.001, mLat = (d - b) * 0.15 || 0.001;
    return [a - mLng, b - mLat, c + mLng, d + mLat];
  }, [pontos]);

  function onSalvo(dados: { nome: string; categoria: string; obs: string; talhaoId: string; talhaoNome: string; safra: string }) {
    // coords derivado direto de `pontos` no ato de salvar — idêntico ao original
    // (pontos.map). Resultado salvo NÃO muda com a otimização ao vivo.
    const coords = pontos.map(p => [p.lng, p.lat] as [number, number]);
    salvarMedicao({
      id: Date.now().toString(36), nome: dados.nome, tipo, coords, pontos,
      categoria: dados.categoria || undefined, obs: dados.obs || undefined,
      talhaoId: dados.talhaoId || undefined, talhaoNome: dados.talhaoNome || undefined,
      safra: dados.safra || undefined,
      criadoEm: new Date().toISOString(), operador: emailUsuario() || undefined,
    });
    setSalvas(getMedicoes());
    setMostraSalvar(false);
    setMsg(`✓ "${dados.nome}" salva — sobe pra plataforma na sincronização.`);
  }

  function abrir(m: MedicaoCampo) {
    setTipo(m.tipo);
    setPontos(m.pontos ?? m.coords.map(([lng, lat]) => ({ lng, lat, em: m.criadoEm })));
    setMostraSalvas(false); setSeguir(false); setFinalizado(true);
    setPedidoEnquadrar(x => x + 1);
  }

  function excluir(id: string) { excluirMedicao(id); setSalvas(getMedicoes()); }

  // #2 — referência: talhão, medição salva ou arquivo (KML/SHP/GeoJSON, offline)
  function fcDoTalhao(t: Talhao): GeoJSON.FeatureCollection | null {
    if (!t.geojson) return null;
    try {
      const o = JSON.parse(t.geojson);
      if (o?.type === 'FeatureCollection') return o;
      if (o?.type === 'Feature') return { type: 'FeatureCollection', features: [o] };
      return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: o }] };
    } catch { return null; }
  }
  function fcDaMedicao(m: MedicaoCampo): GeoJSON.FeatureCollection {
    if (m.tipo === 'ponto') {
      return { type: 'FeatureCollection', features: m.coords.map(c => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } })) };
    }
    const geom: GeoJSON.Geometry = m.tipo === 'poligono' && m.coords.length >= 3
      ? { type: 'Polygon', coordinates: [[...m.coords, m.coords[0]]] }
      : { type: 'LineString', coordinates: m.coords };
    return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: geom }] };
  }
  function usarRef(fc: GeoJSON.FeatureCollection | null, nome: string) {
    if (!fc) return;
    setReferencia(fc); setRefNome(nome); setMostraRef(false); setSeguir(false); setPedidoEnquadrar(x => x + 1);
  }
  async function refDeArquivo(file: File) {
    try { const r = await parseGeoFile(file); usarRef(r.geojson, file.name); }
    catch (e) { setMostraRef(false); setMsg('Não consegui ler o arquivo: ' + (e instanceof Error ? e.message : 'formato inválido')); }
  }
  function bboxDeFC(fc: GeoJSON.FeatureCollection | null): [number, number, number, number] | null {
    if (!fc) return null;
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    const scan = (co: unknown): void => {
      if (!Array.isArray(co)) return;
      if (typeof co[0] === 'number') { const x = co[0] as number, y = co[1] as number; if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; return; }
      for (const e of co) scan(e);
    };
    for (const f of fc.features) if (f.geometry && 'coordinates' in f.geometry) scan((f.geometry as { coordinates: unknown }).coordinates);
    return Number.isFinite(a) ? [a, b, c, d] : null;
  }

  const statusGps = !userPos ? { txt: 'sem sinal', cor: '#f87171' }
    : userPos.acc <= 8 ? { txt: `±${Math.round(userPos.acc)} m`, cor: '#4ade80' }
    : userPos.acc <= 20 ? { txt: `±${Math.round(userPos.acc)} m`, cor: '#fbbf24' }
    : { txt: `±${Math.round(userPos.acc)} m (fraco)`, cor: '#f87171' };

  return (
    <div className="fixed inset-0" style={{ background: AZUL }}>
      <MapaColeta
        talhaoGeo={null} bbox={bboxDesenho ?? bboxRef2} pontos={EMPTY_FC}
        userPos={userPos} alvo={null} raioM={0}
        modo={modo} seguirGps={seguir}
        pedidoGps={pedidoGps} pedidoEnquadrar={pedidoEnquadrar}
        onSelecionarPonto={() => {}}
        onGestoUsuario={() => setSeguir(false)}
        desenho={desenho}
        referencia={referencia}
        onClickMapa={(lng, lat) => { if (!gravando) { setMsg(''); setFinalizado(false); pushPonto(lng, lat); } }}
      />

      {/* topo */}
      <div className="absolute top-0 left-0 right-0 flex items-center gap-2 px-3 py-2"
        style={{ background: 'rgba(6,21,37,0.92)', borderBottom: `1px solid ${BORDA}`, paddingTop: 'max(8px, env(safe-area-inset-top))' }}>
        <button onClick={onVoltar} className="p-1.5 rounded-lg flex-shrink-0" style={{ background: BORDA, color: '#93c5fd' }}>
          <ChevronLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold" style={{ color: TXT }}>Medição GPS</p>
          <p className="text-[10px]" style={{ color: gravando && !pausado ? '#f87171' : SUB }}>
            {gravando ? (pausado ? '⏸ Pausado — retoma emendando' : `● Gravando · 1 ponto/${freqS}s`) : 'Toque no mapa, marque no GPS ou grave a caminhada'}
          </p>
        </div>
        <button onClick={() => setMostraSalvas(true)} className="p-1.5 rounded-lg flex-shrink-0" style={{ background: BORDA, color: '#93c5fd' }} title="Medições salvas">
          <List size={16} />
        </button>
      </div>

      {/* painel ao vivo (spec seção 7) */}
      <div className="absolute left-3 flex flex-col gap-1" style={{ top: 'calc(56px + env(safe-area-inset-top))' }}>
        {(gravando || nCoords > 0) && (
          <div className="px-3 py-2 rounded-xl text-[10px] leading-relaxed" style={{ background: 'rgba(6,21,37,0.9)', border: `1px solid ${BORDA}`, color: '#cbd5e1' }}>
            <div className="flex items-center gap-3">
              <span style={{ color: '#93c5fd' }}>{tipo === 'poligono' ? 'Polígono' : tipo === 'linha' ? 'Linha' : 'Pontos'}</span>
              {gravando && <span className="font-bold" style={{ color: '#fff' }}>⏱ {fmtTempo(elapsed)}</span>}
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span><b style={{ color: '#fff' }}>{pontos.length}</b> pts</span>
              {tipo !== 'ponto' && <span>{formatarDist(medidas.perimetroM)}</span>}
              {tipo === 'poligono' && medidas.areaHa != null && (
                <span style={{ color: '#4ade80' }}><b>{medidas.areaHa.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</b> ha</span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span style={{ color: statusGps.cor }}>GPS {statusGps.txt}</span>
              {velKmH != null && velKmH > 0.7 && <span>{velKmH.toFixed(0)} km/h</span>}
            </div>
          </div>
        )}
        {gpsErro && (
          <div className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold flex items-center gap-1"
            style={{ background: '#78350f', color: '#fde68a' }}>
            <AlertTriangle size={11} /> {gpsErro}
          </div>
        )}
      </div>

      {/* botões laterais */}
      <div className="absolute right-3 flex flex-col gap-2" style={{ top: 'calc(56px + env(safe-area-inset-top))' }}>
        <BotaoMapa ativo={seguir} onClick={() => { setSeguir(true); setPedidoGps(x => x + 1); }} titulo="Ir para onde estou (GPS)"><Crosshair size={18} /></BotaoMapa>
        <BotaoMapa onClick={() => { setSeguir(false); setPedidoEnquadrar(x => x + 1); }} titulo="Enquadrar o desenho"><Maximize2 size={18} /></BotaoMapa>
        <BotaoMapa onClick={() => setModo(m => (m === 'sat' ? 'ruas' : 'sat'))} titulo="Satélite / Ruas"><Layers size={18} /></BotaoMapa>
        <BotaoMapa ativo={!!referencia} onClick={() => { setSalvas(getMedicoes()); setDrillProd(null); setDrillFaz(null); setMostraRef(true); }} titulo="Camada de referência"><Shapes size={18} /></BotaoMapa>
        <BotaoMapa onClick={addVerticeGps} titulo="Marcar vértice no meu GPS"><Plus size={18} /></BotaoMapa>
        <BotaoMapa ativo={offsetM > 0 || freqS > 1} onClick={() => setMostraAjustes(true)} titulo="Ajustes (frequência, offset)"><SlidersHorizontal size={18} /></BotaoMapa>
        <BotaoMapa onClick={() => setPontos(ps => ps.slice(0, -1))} titulo="Desfazer último ponto"><Undo2 size={18} /></BotaoMapa>
        <BotaoMapa onClick={cancelar} titulo="Cancelar medição"><Trash2 size={18} /></BotaoMapa>
      </div>

      {/* rodapé */}
      <div className="absolute bottom-0 left-0 right-0" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {msg && (
          <p className="mx-3 mb-1.5 px-3 py-1.5 rounded-lg text-[10px]"
            style={{ background: 'rgba(6,21,37,0.92)', color: '#94a3b8' }}>{msg}</p>
        )}
        <div className="px-4 py-3" style={{ background: 'rgba(6,21,37,0.95)', borderTop: `1px solid ${BORDA}` }}>
          <div className="flex gap-1.5 mb-2">
            {(['poligono', 'linha', 'ponto'] as TipoMedicao[]).map(t => (
              <button key={t} onClick={() => setTipo(t)} disabled={gravando}
                className="px-3 py-1.5 rounded-full text-[11px] font-bold disabled:opacity-50"
                style={{
                  background: tipo === t ? '#2e5fa3' : BORDA,
                  color: tipo === t ? '#fff' : '#94a3b8',
                  border: `1px solid ${tipo === t ? '#60a5fa' : BORDA}`,
                }}>
                {t === 'poligono' ? '⬠ Polígono' : t === 'linha' ? '⎯ Linha' : '• Ponto(s)'}
              </button>
            ))}
            <span className="ml-auto self-center flex items-center gap-1.5">
              {freqS > 1 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#1e3a8a', color: '#93c5fd' }}>
                  {freqS}s/ponto
                </span>
              )}
              {offsetM > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#1e3a8a', color: '#93c5fd' }}>
                  offset {offsetM.toFixed(1)} m {offsetLado === 'esq' ? '←' : '→'}
                </span>
              )}
            </span>
          </div>

          {/* gravar / pausar-retomar / finalizar / cancelar — escondido no modo Ponto */}
          {tipo !== 'ponto' && (
          <div className="flex gap-1.5 mb-2">
            {!gravando ? (
              <>
                <button onClick={iniciarGravacao}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-white"
                  style={{ background: '#166534' }}>
                  <Play size={14} /> {pontos.length ? 'Retomar caminhada' : 'Gravar caminhada'}
                </button>
                {pontos.length > 0 && (
                  <button onClick={cancelar}
                    className="px-3 py-2 rounded-xl text-xs font-bold" style={{ background: '#7f1d1d', color: '#fca5a5' }}>
                    Cancelar
                  </button>
                )}
              </>
            ) : (
              <>
                <button onClick={() => setPausado(p => !p)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold"
                  style={{ background: pausado ? '#166534' : '#78350f', color: pausado ? '#86efac' : '#fde68a' }}>
                  {pausado ? <><Play size={14} /> Retomar</> : <><Pause size={14} /> Pausar</>}
                </button>
                <button onClick={finalizarGravacao}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-white"
                  style={{ background: '#2e5fa3' }}>
                  <Flag size={14} /> Finalizar
                </button>
                <button onClick={cancelar}
                  className="px-3 py-2 rounded-xl text-xs font-bold" style={{ background: '#7f1d1d', color: '#fca5a5' }}>
                  <X size={14} />
                </button>
              </>
            )}
          </div>
          )}

          {nCoords === 0 ? (
            <p className="text-[11px] py-1" style={{ color: SUB }}>
              {tipo === 'ponto'
                ? <>Toque no mapa ou use o <strong style={{ color: '#93c5fd' }}>+</strong> (GPS) para marcar pontos.</>
                : <><strong style={{ color: '#93c5fd' }}>Gravar caminhada</strong> registra 1 ponto/seg enquanto você anda a área. Ou toque no mapa / use o <strong style={{ color: '#93c5fd' }}>+</strong> para marcar vértices.</>}
            </p>
          ) : (
            <div className="flex items-end justify-between gap-3">
              <div>
                {tipo === 'poligono' && medidas.areaHa != null ? (
                  <>
                    <p className="text-2xl font-black leading-tight" style={{ color: '#4ade80' }}>
                      {medidas.areaHa.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ha
                    </p>
                    <p className="text-[10px]" style={{ color: SUB }}>
                      Perímetro {formatarDist(medidas.perimetroM)} · {pontos.length} pontos
                    </p>
                  </>
                ) : tipo === 'ponto' ? (
                  <>
                    <p className="text-2xl font-black leading-tight" style={{ color: '#4ade80' }}>
                      {pontos.length} ponto{pontos.length !== 1 ? 's' : ''}
                    </p>
                    <p className="text-[10px]" style={{ color: SUB }}>marque no mapa ou no GPS (+)</p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-black leading-tight" style={{ color: '#4ade80' }}>
                      {formatarDist(medidas.perimetroM)}
                    </p>
                    <p className="text-[10px]" style={{ color: SUB }}>
                      {tipo === 'poligono' ? 'Pelo menos 3 pontos para fechar a área' : `${pontos.length} pontos`}
                    </p>
                  </>
                )}
              </div>
              <button onClick={() => setMostraSalvar(true)} disabled={nCoords < (tipo === 'ponto' ? 1 : 2) || gravando}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-40"
                style={{ background: 'var(--invicta-green-dark)' }}>
                <Save size={13} /> Salvar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ajustes: frequência de gravação + offset lateral */}
      {mostraAjustes && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setMostraAjustes(false)}>
          <div className="w-full max-w-md rounded-t-2xl p-5 space-y-4" style={{ background: AZUL, paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
            onClick={e => e.stopPropagation()}>
            <p className="text-sm font-bold" style={{ color: TXT }}>Ajustes da medição</p>

            {/* frequência de gravação */}
            <div>
              <label className="text-[11px] font-semibold block mb-1.5" style={{ color: '#93c5fd' }}>
                Gravar 1 ponto a cada:
              </label>
              <div className="flex gap-1.5">
                {FREQS.map(f => (
                  <button key={f} onClick={() => setFreqS(f)}
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold"
                    style={{ background: freqS === f ? '#2e5fa3' : BORDA, color: freqS === f ? '#fff' : '#94a3b8', border: `1px solid ${freqS === f ? '#60a5fa' : BORDA}` }}>
                    {f}s
                  </button>
                ))}
              </div>
              <p className="text-[10px] mt-1" style={{ color: SUB }}>
                Intervalos maiores geram menos pontos (bom para áreas grandes e para economizar bateria). Pode mudar até no meio da gravação.
              </p>
            </div>

            <div className="h-px" style={{ background: BORDA }} />

            <p className="text-sm font-bold" style={{ color: TXT }}>Offset lateral</p>
            <p className="text-[11px]" style={{ color: SUB }}>
              Desloca os pontos para o lado, perpendicular à direção de caminhada — útil quando você anda paralelo à divisa (ex.: 2,5 m à direita da cerca).
            </p>
            <div className="flex items-center gap-2">
              <button onClick={() => setOffsetM(v => Math.max(0, Math.round((v - 0.5) * 10) / 10))}
                className="w-10 h-10 rounded-lg text-lg font-bold" style={{ background: BORDA, color: '#93c5fd' }}>−</button>
              <input type="number" step="0.1" min="0" value={offsetM}
                onChange={e => setOffsetM(Math.max(0, Math.round((Number(e.target.value) || 0) * 10) / 10))}
                className="flex-1 text-center rounded-lg px-2 py-2 text-lg font-black outline-none"
                style={{ background: '#0a1929', color: '#4ade80', border: '1px solid #2e5fa3' }} />
              <span className="text-xs font-bold" style={{ color: SUB }}>m</span>
              <button onClick={() => setOffsetM(v => Math.round((v + 0.5) * 10) / 10)}
                className="w-10 h-10 rounded-lg text-lg font-bold" style={{ background: BORDA, color: '#93c5fd' }}>+</button>
            </div>
            <div className="flex gap-2">
              {(['esq', 'dir'] as const).map(l => (
                <button key={l} onClick={() => setOffsetLado(l)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold"
                  style={{ background: offsetLado === l ? '#2e5fa3' : BORDA, color: offsetLado === l ? '#fff' : '#94a3b8' }}>
                  {l === 'esq' ? '← Esquerda' : 'Direita →'}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setOffsetM(0); }}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold" style={{ background: BORDA, color: '#94a3b8' }}>
                Sem offset
              </button>
              <button onClick={() => setMostraAjustes(false)}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white" style={{ background: 'var(--invicta-green-dark)' }}>
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* salvar (nome, categoria, talhão, ciclo, observação) */}
      {mostraSalvar && (
        <SalvarDialog tipo={tipo} medidas={medir(tipo, pontos.map(p => [p.lng, p.lat]))} nSugerido={salvas.length + 1}
          onFechar={() => setMostraSalvar(false)} onSalvar={onSalvo} />
      )}

      {/* #2 — escolher camada de referência */}
      {mostraRef && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: AZUL_ESC }}>
          <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: `1px solid ${BORDA}`, paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
            <button onClick={() => setMostraRef(false)} className="p-1.5 rounded-lg" style={{ background: BORDA, color: '#93c5fd' }}><X size={16} /></button>
            <p className="text-sm font-bold" style={{ color: TXT }}>Camada de referência</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            <p className="text-[11px]" style={{ color: SUB }}>Mostra um polígono/linha/pontos no mapa (em laranja) enquanto você mede. É só referência — não entra na medição.</p>
            {referencia && (
              <button onClick={() => { setReferencia(null); setRefNome(''); }}
                className="w-full px-3 py-2.5 rounded-xl text-xs font-bold" style={{ background: '#7f1d1d', color: '#fca5a5' }}>
                Remover referência{refNome ? ` — ${refNome}` : ''}
              </button>
            )}
            <label className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold cursor-pointer" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
              <Upload size={14} /> Abrir arquivo (KML / SHP / GeoJSON)
              <input ref={inputRefArq} type="file" accept=".kml,.kmz,.zip,.geojson,.json" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) void refDeArquivo(f); e.currentTarget.value = ''; }} />
            </label>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: SUB }}>Talhão (produtor › fazenda › talhão)</p>
              {(() => {
                const btn = 'w-full text-left px-3 py-2.5 rounded-lg mb-1 text-xs flex items-center justify-between gap-2';
                if (drillProd && drillFaz) {   // nível 3: talhões da fazenda
                  const faz = arvoreRef.find(p => p.id === drillProd)?.fazendas.find(f => f.id === drillFaz);
                  return (<>
                    <button onClick={() => setDrillFaz(null)} className={btn} style={{ background: BORDA, color: '#93c5fd' }}>‹ {faz?.nome ?? 'Fazenda'}</button>
                    {faz?.talhoes.map(t => (
                      <button key={t.id} onClick={() => usarRef(fcDoTalhao(t), t.nome)} className={btn} style={{ background: '#0b1d3a', color: TXT }}>{t.nome}</button>
                    ))}
                  </>);
                }
                if (drillProd) {                // nível 2: fazendas do produtor
                  const prod = arvoreRef.find(p => p.id === drillProd);
                  return (<>
                    <button onClick={() => setDrillProd(null)} className={btn} style={{ background: BORDA, color: '#93c5fd' }}>‹ {prod?.nome ?? 'Produtor'}</button>
                    {prod?.fazendas.map(f => (
                      <button key={f.id} onClick={() => setDrillFaz(f.id)} className={btn} style={{ background: '#0b1d3a', color: TXT }}>{f.nome}<span style={{ color: SUB }}>›</span></button>
                    ))}
                  </>);
                }
                return arvoreRef.length === 0   // nível 1: produtores
                  ? <p className="text-[11px]" style={{ color: SUB }}>Nenhum talhão com limite disponível.</p>
                  : arvoreRef.map(p => (
                    <button key={p.id} onClick={() => setDrillProd(p.id)} className={btn} style={{ background: '#0b1d3a', color: TXT }}>{p.nome}<span style={{ color: SUB }}>›</span></button>
                  ));
              })()}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: SUB }}>Medições salvas</p>
              {salvas.length === 0
                ? <p className="text-[11px]" style={{ color: SUB }}>Nenhuma medição salva.</p>
                : salvas.map(m => (
                  <button key={m.id} onClick={() => usarRef(fcDaMedicao(m), m.nome)}
                    className="w-full text-left px-3 py-2 rounded-lg mb-1 text-xs" style={{ background: '#0b1d3a', color: TXT }}>
                    {m.nome} · <span style={{ color: '#93c5fd' }}>{m.tipo === 'poligono' ? 'área' : 'linha'}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* medições salvas */}
      {mostraSalvas && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: AZUL_ESC }}>
          <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: `1px solid ${BORDA}`, paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
            <p className="text-sm font-bold flex-1" style={{ color: TXT }}>Medições salvas</p>
            <button onClick={() => setMostraSalvas(false)} className="p-1.5" style={{ color: SUB }}><X size={18} /></button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
            {salvas.length === 0 ? (
              <p className="text-xs py-10 text-center" style={{ color: SUB }}>Nenhuma medição salva ainda.</p>
            ) : (
              salvas.map(m => {
                const md = medir(m.tipo, m.coords);
                return (
                  <div key={m.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                    style={{ background: '#0b1d3a', border: `1px solid ${BORDA}` }}>
                    <button onClick={() => abrir(m)} className="flex-1 min-w-0 text-left">
                      <p className="text-xs font-bold truncate" style={{ color: TXT }}>
                        {m.nome}{m.categoria ? <span className="font-normal" style={{ color: '#93c5fd' }}> · {m.categoria}</span> : ''}
                      </p>
                      <p className="text-[10px]" style={{ color: SUB }}>
                        {m.tipo === 'poligono' && md.areaHa != null
                          ? `${md.areaHa.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ha · perím. ${formatarDist(md.perimetroM)}`
                          : formatarDist(md.perimetroM)}
                        {m.talhaoNome ? ` · ${m.talhaoNome}` : ''}
                        {' · '}{m.syncPendente ? 'a enviar' : 'na nuvem ✓'}
                      </p>
                    </button>
                    <button onClick={() => { if (confirm(`Excluir "${m.nome}"?`)) excluir(m.id); }}
                      className="p-1.5 rounded" style={{ color: '#f87171' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── diálogo de salvamento (spec seção 10) ─────────────────────────────────────
function SalvarDialog({ tipo, medidas, nSugerido, onFechar, onSalvar }: {
  tipo: TipoMedicao;
  medidas: { areaHa: number | null; perimetroM: number };
  nSugerido: number;
  onFechar: () => void;
  onSalvar: (d: { nome: string; categoria: string; obs: string; talhaoId: string; talhaoNome: string; safra: string }) => void;
}) {
  const talhoes = useMemo(() => getTalhoes(), []);
  const safras = useMemo(() => getSafras(), []);
  const [nome, setNome] = useState(`Medição ${nSugerido}`);
  const [categoria, setCategoria] = useState<string>(tipo === 'poligono' ? 'Mancha' : 'Carreador');
  const [obs, setObs] = useState('');
  const [talhaoId, setTalhaoId] = useState('');
  const [safra, setSafra] = useState(() => safras.find(s => s.ativa)?.nome ?? '');

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.65)' }} onClick={onFechar}>
      <div className="w-full max-w-md rounded-t-2xl flex flex-col" style={{ background: AZUL, maxHeight: '92dvh' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-3.5" style={{ borderBottom: `1px solid ${BORDA}` }}>
          <p className="text-sm font-black flex-1" style={{ color: TXT }}>Salvar medição</p>
          <button onClick={onFechar} className="p-1" style={{ color: SUB }}><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
          <p className="text-[11px] font-semibold" style={{ color: '#4ade80' }}>
            {tipo === 'poligono' && medidas.areaHa != null
              ? `${medidas.areaHa.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ha · perímetro ${formatarDist(medidas.perimetroM)}`
              : `${formatarDist(medidas.perimetroM)}`}
          </p>

          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{ color: SUB }}>Nome *</label>
            <input value={nome} onChange={e => setNome(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: BORDA, color: TXT, border: '1px solid #2e5fa3' }} />
          </div>

          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{ color: SUB }}>Categoria</label>
            <div className="flex gap-1.5 flex-wrap">
              {CATEGORIAS_MEDICAO.map(c => (
                <button key={c} onClick={() => setCategoria(c)}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold"
                  style={{ background: categoria === c ? '#2e5fa3' : BORDA, color: categoria === c ? '#fff' : '#94a3b8' }}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[10px] font-semibold block mb-1" style={{ color: SUB }}>Talhão (opcional)</label>
              <select value={talhaoId} onChange={e => setTalhaoId(e.target.value)}
                className="w-full rounded-lg px-2 py-2 text-xs outline-none" style={{ background: BORDA, color: TXT, border: '1px solid #2e5fa3' }}>
                <option value="">— nenhum —</option>
                {talhoes.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold block mb-1" style={{ color: SUB }}>Ciclo</label>
              <select value={safra} onChange={e => setSafra(e.target.value)}
                className="w-full rounded-lg px-2 py-2 text-xs outline-none" style={{ background: BORDA, color: TXT, border: '1px solid #2e5fa3' }}>
                <option value="">—</option>
                {safras.map(s => <option key={s.id} value={s.nome}>{s.nome}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{ color: SUB }}>Observação</label>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2}
              className="w-full rounded-lg px-3 py-2 text-xs outline-none resize-none" style={{ background: BORDA, color: TXT, border: '1px solid #2e5fa3' }} />
          </div>
        </div>

        <div className="px-5 py-3.5" style={{ borderTop: `1px solid ${BORDA}`, paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}>
          <button onClick={() => nome.trim() && onSalvar({
            nome: nome.trim(), categoria, obs,
            talhaoId, talhaoNome: talhoes.find(t => t.id === talhaoId)?.nome ?? '', safra,
          })}
            disabled={!nome.trim()}
            className="w-full py-3 rounded-xl text-sm font-black text-white disabled:opacity-40" style={{ background: '#16a34a' }}>
            ✓ Salvar medição
          </button>
        </div>
      </div>
    </div>
  );
}

function BotaoMapa({ children, onClick, titulo, ativo }: {
  children: React.ReactNode; onClick: () => void; titulo: string; ativo?: boolean;
}) {
  return (
    <button onClick={onClick} title={titulo}
      className="w-11 h-11 rounded-xl flex items-center justify-center active:opacity-70"
      style={{
        background: ativo ? '#2e5fa3' : 'rgba(6,21,37,0.92)',
        color: ativo ? '#fff' : '#93c5fd',
        border: `1px solid ${ativo ? '#60a5fa' : BORDA}`,
      }}>
      {children}
    </button>
  );
}
