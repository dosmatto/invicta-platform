'use client';

// Módulo de MEDIÇÃO do app de campo: desenha polígono (área em ha + perímetro)
// ou linha (distância) tocando no mapa OU marcando vértices na posição do GPS
// enquanto caminha. Medições podem ser salvas com nome (localStorage) e
// reabertas depois — tudo funciona offline.

import { useMemo, useState, useEffect, useRef } from 'react';
import turfArea from '@turf/area';
import { MapaColeta } from './MapaColeta';
import { useGps } from './useGps';
import {
  distanciaM, formatarDist,
  MedicaoCampo, TipoMedicao, getMedicoes, salvarMedicao, excluirMedicao,
} from '@/lib/coleta';
import { emailUsuario } from '@/lib/auth';
import {
  ChevronLeft, Crosshair, Layers, Maximize2, Plus, Undo2, Trash2, List, X, AlertTriangle, Save,
  Play, Pause, Flag, MoveHorizontal,
} from 'lucide-react';

const AZUL_ESC = '#061525', AZUL = '#0a1929', BORDA = '#1a3a6b', TXT = '#e2e8f0', SUB = '#64748b';
const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

const PASSO_GRAVACAO_M = 3; // distância mínima entre vértices ao gravar caminhando

// Aplica um OFFSET lateral (m) perpendicular à direção de caminhada. Útil quando
// o GPS/veículo anda paralelo à divisa (ex.: 2,5 m à direita da cerca).
function aplicarOffset(
  lng: number, lat: number, prevLng: number, prevLat: number,
  offM: number, lado: 'esq' | 'dir',
): [number, number] {
  if (!offM) return [lng, lat];
  const mLat = 1 / 110540;
  const mLng = 1 / (111320 * Math.cos((lat * Math.PI) / 180));
  let dx = (lng - prevLng) / mLng, dy = (lat - prevLat) / mLat; // direção (m)
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return [lng, lat]; // parado → sem direção confiável
  dx /= len; dy /= len;
  const [px, py] = lado === 'esq' ? [-dy, dx] : [dy, -dx]; // perpendicular
  return [lng + px * offM * mLng, lat + py * offM * mLat];
}

// medidas de uma sequência de vértices
function medir(tipo: TipoMedicao, coords: [number, number][]) {
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

export function MedicaoScreen({ onVoltar }: { onVoltar: () => void }) {
  const { userPos, gpsErro } = useGps();
  const [tipo, setTipo] = useState<TipoMedicao>('poligono');
  const [coords, setCoords] = useState<[number, number][]>([]);
  const [modo, setModo] = useState<'sat' | 'ruas'>('sat');
  const [seguir, setSeguir] = useState(true); // abre seguindo o GPS
  const [pedidoGps, setPedidoGps] = useState(0);
  const [pedidoEnquadrar, setPedidoEnquadrar] = useState(0);
  const [mostraSalvas, setMostraSalvas] = useState(false);
  const [salvas, setSalvas] = useState<MedicaoCampo[]>(() => getMedicoes());
  const [msg, setMsg] = useState('');

  // ── gravação de caminhada (estilo FieldRover) ──
  const [gravando, setGravando] = useState(false); // sessão de caminhada ativa
  const [pausado, setPausado] = useState(false);    // pausado no meio (retoma emendando)
  const [offsetM, setOffsetM] = useState(0);        // offset lateral em metros (1 casa)
  const [offsetLado, setOffsetLado] = useState<'esq' | 'dir'>('dir');
  const [mostraOffset, setMostraOffset] = useState(false);
  const ultimaPosRef = useRef<[number, number] | null>(null);   // última leitura crua do GPS
  const ultimoGravadoRef = useRef<[number, number] | null>(null); // último vértice gravado (cru)

  // Grava vértices automaticamente enquanto o operador caminha (com offset).
  useEffect(() => {
    if (!userPos) return;
    const cur: [number, number] = [userPos.lng, userPos.lat];
    const prev = ultimaPosRef.current;
    ultimaPosRef.current = cur;
    if (!gravando || pausado) return;
    const ultimo = ultimoGravadoRef.current;
    if (ultimo && distanciaM(ultimo[0], ultimo[1], cur[0], cur[1]) < PASSO_GRAVACAO_M) return;
    const ponto = prev ? aplicarOffset(cur[0], cur[1], prev[0], prev[1], offsetM, offsetLado) : cur;
    ultimoGravadoRef.current = cur;
    setCoords(c => [...c, ponto]);
  }, [userPos, gravando, pausado, offsetM, offsetLado]);

  function iniciarGravacao() {
    setGravando(true); setPausado(false); setMsg('');
    setSeguir(true); setPedidoGps(x => x + 1);
    ultimoGravadoRef.current = null; // 1º ponto é gravado já na próxima leitura
  }
  function finalizarGravacao() {
    setGravando(false); setPausado(false);
    if (tipo === 'poligono' && coords.length >= 3) setMsg('Caminhada finalizada — pontos ligados automaticamente.');
    else if (coords.length >= 2) setMsg('Caminhada finalizada.');
    setSeguir(false); setPedidoEnquadrar(x => x + 1);
  }

  const medidas = useMemo(() => medir(tipo, coords), [tipo, coords]);

  const desenho: GeoJSON.FeatureCollection = useMemo(() => {
    if (coords.length === 0) return EMPTY_FC;
    const feats: GeoJSON.Feature[] = coords.map(c => ({
      type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c },
    }));
    if (tipo === 'poligono' && coords.length >= 3) {
      feats.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...coords, coords[0]]] } });
    } else if (coords.length >= 2) {
      feats.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } });
    }
    return { type: 'FeatureCollection', features: feats };
  }, [tipo, coords]);

  const bboxDesenho = useMemo<[number, number, number, number] | null>(() => {
    if (coords.length < 2) return null;
    let [a, b, c, d] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [lng, lat] of coords) {
      a = Math.min(a, lng); b = Math.min(b, lat); c = Math.max(c, lng); d = Math.max(d, lat);
    }
    const mLng = (c - a) * 0.15 || 0.001, mLat = (d - b) * 0.15 || 0.001;
    return [a - mLng, b - mLat, c + mLng, d + mLat];
  }, [coords]);

  function addVerticeGps() {
    if (!userPos) { setMsg('Aguardando o GPS…'); return; }
    setMsg('');
    const prev = ultimaPosRef.current;
    const ponto: [number, number] = prev
      ? aplicarOffset(userPos.lng, userPos.lat, prev[0], prev[1], offsetM, offsetLado)
      : [userPos.lng, userPos.lat];
    ultimoGravadoRef.current = [userPos.lng, userPos.lat];
    setCoords(c => [...c, ponto]);
  }

  function salvar() {
    const nome = prompt('Nome da medição:', `Medição ${salvas.length + 1}`);
    if (!nome?.trim()) return;
    salvarMedicao({
      id: Date.now().toString(36), nome: nome.trim(), tipo, coords,
      criadoEm: new Date().toISOString(), operador: emailUsuario() || undefined,
    });
    setSalvas(getMedicoes());
    setMsg(`✓ "${nome.trim()}" salva no aparelho — sobe pra plataforma na sincronização.`);
  }

  function abrir(m: MedicaoCampo) {
    setTipo(m.tipo); setCoords(m.coords); setMostraSalvas(false);
    setSeguir(false);
    setPedidoEnquadrar(x => x + 1);
  }

  function excluir(id: string) {
    excluirMedicao(id);
    setSalvas(getMedicoes());
  }

  return (
    <div className="fixed inset-0" style={{ background: AZUL }}>
      <MapaColeta
        talhaoGeo={null} bbox={bboxDesenho} pontos={EMPTY_FC}
        userPos={userPos} alvo={null} raioM={0}
        modo={modo} seguirGps={seguir}
        pedidoGps={pedidoGps} pedidoEnquadrar={pedidoEnquadrar}
        onSelecionarPonto={() => {}}
        onGestoUsuario={() => setSeguir(false)}
        desenho={desenho}
        onClickMapa={(lng, lat) => { setMsg(''); setCoords(c => [...c, [lng, lat]]); }}
      />

      {/* topo */}
      <div className="absolute top-0 left-0 right-0 flex items-center gap-2 px-3 py-2"
        style={{ background: 'rgba(6,21,37,0.92)', borderBottom: `1px solid ${BORDA}`, paddingTop: 'max(8px, env(safe-area-inset-top))' }}>
        <button onClick={onVoltar} className="p-1.5 rounded-lg flex-shrink-0" style={{ background: BORDA, color: '#93c5fd' }}>
          <ChevronLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold" style={{ color: TXT }}>Medição</p>
          <p className="text-[10px]" style={{ color: gravando && !pausado ? '#f87171' : SUB }}>
            {gravando ? (pausado ? '⏸ Pausado — retoma emendando' : '● Gravando caminhada…') : 'Toque no mapa, marque no GPS ou grave a caminhada'}
          </p>
        </div>
        <button onClick={() => setMostraSalvas(true)} className="p-1.5 rounded-lg flex-shrink-0" style={{ background: BORDA, color: '#93c5fd' }} title="Medições salvas">
          <List size={16} />
        </button>
      </div>

      {/* GPS / avisos */}
      <div className="absolute left-3 flex flex-col gap-1" style={{ top: 'calc(56px + env(safe-area-inset-top))' }}>
        {userPos && (
          <div className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold"
            style={{ background: 'rgba(6,21,37,0.85)', color: userPos.acc <= 8 ? '#4ade80' : userPos.acc <= 20 ? '#fbbf24' : '#f87171' }}>
            GPS ±{Math.round(userPos.acc)} m
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
        <BotaoMapa onClick={addVerticeGps} titulo="Marcar vértice no meu GPS"><Plus size={18} /></BotaoMapa>
        <BotaoMapa ativo={offsetM > 0} onClick={() => setMostraOffset(true)} titulo="Offset lateral (m)"><MoveHorizontal size={18} /></BotaoMapa>
        <BotaoMapa onClick={() => setCoords(c => c.slice(0, -1))} titulo="Desfazer último vértice"><Undo2 size={18} /></BotaoMapa>
        <BotaoMapa onClick={() => { setCoords([]); setMsg(''); setGravando(false); setPausado(false); ultimoGravadoRef.current = null; }} titulo="Limpar desenho"><Trash2 size={18} /></BotaoMapa>
      </div>

      {/* rodapé: tipo + medidas + salvar */}
      <div className="absolute bottom-0 left-0 right-0" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {msg && (
          <p className="mx-3 mb-1.5 px-3 py-1.5 rounded-lg text-[10px]"
            style={{ background: 'rgba(6,21,37,0.92)', color: '#94a3b8' }}>{msg}</p>
        )}
        <div className="px-4 py-3" style={{ background: 'rgba(6,21,37,0.95)', borderTop: `1px solid ${BORDA}` }}>
          <div className="flex gap-1.5 mb-2">
            {(['poligono', 'linha'] as TipoMedicao[]).map(t => (
              <button key={t} onClick={() => setTipo(t)}
                className="px-3 py-1.5 rounded-full text-[11px] font-bold"
                style={{
                  background: tipo === t ? '#2e5fa3' : BORDA,
                  color: tipo === t ? '#fff' : '#94a3b8',
                  border: `1px solid ${tipo === t ? '#60a5fa' : BORDA}`,
                }}>
                {t === 'poligono' ? '⬠ Polígono (área)' : '⎯ Linha (distância)'}
              </button>
            ))}
            {offsetM > 0 && (
              <span className="ml-auto self-center text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#1e3a8a', color: '#93c5fd' }}>
                offset {offsetM.toFixed(1)} m {offsetLado === 'esq' ? '←' : '→'}
              </span>
            )}
          </div>

          {/* gravar caminhada / pausar-retomar / finalizar */}
          <div className="flex gap-1.5 mb-2">
            {!gravando ? (
              <button onClick={iniciarGravacao}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-white"
                style={{ background: '#166534' }}>
                <Play size={14} /> Gravar caminhada
              </button>
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
              </>
            )}
          </div>

          {coords.length === 0 ? (
            <p className="text-[11px] py-1" style={{ color: SUB }}>
              Toque no mapa para marcar os vértices — ou caminhe e use o botão <strong style={{ color: '#93c5fd' }}>+</strong> para marcar onde você está.
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
                      Perímetro {formatarDist(medidas.perimetroM)} · {coords.length} vértices
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-black leading-tight" style={{ color: '#4ade80' }}>
                      {formatarDist(medidas.perimetroM)}
                    </p>
                    <p className="text-[10px]" style={{ color: SUB }}>
                      {tipo === 'poligono' ? 'Marque pelo menos 3 vértices para fechar a área' : `${coords.length} vértices`}
                    </p>
                  </>
                )}
              </div>
              <button onClick={salvar} disabled={coords.length < 2}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-40"
                style={{ background: 'var(--invicta-green-dark)' }}>
                <Save size={13} /> Salvar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* offset lateral */}
      {mostraOffset && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setMostraOffset(false)}>
          <div className="w-full max-w-md rounded-t-2xl p-5 space-y-4" style={{ background: AZUL, paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
            onClick={e => e.stopPropagation()}>
            <p className="text-sm font-bold" style={{ color: TXT }}>Offset lateral</p>
            <p className="text-[11px]" style={{ color: SUB }}>
              Desloca os vértices para o lado, perpendicular à direção de caminhada — útil quando você anda paralelo à divisa (ex.: 2,5 m à direita da cerca).
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
              <button onClick={() => { setOffsetM(0); setMostraOffset(false); }}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold" style={{ background: BORDA, color: '#94a3b8' }}>
                Sem offset
              </button>
              <button onClick={() => setMostraOffset(false)}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white" style={{ background: 'var(--invicta-green-dark)' }}>
                Aplicar
              </button>
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
                      <p className="text-xs font-bold truncate" style={{ color: TXT }}>{m.nome}</p>
                      <p className="text-[10px]" style={{ color: SUB }}>
                        {m.tipo === 'poligono' && md.areaHa != null
                          ? `${md.areaHa.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ha · perím. ${formatarDist(md.perimetroM)}`
                          : formatarDist(md.perimetroM)}
                        {' · '}{new Date(m.criadoEm).toLocaleDateString('pt-BR')}
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
