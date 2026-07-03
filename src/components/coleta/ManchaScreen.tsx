'use client';

// App de campo — NDVI / Mancha (#37). Prepara no Wi-Fi: escolhe talhão → baixa um
// índice (NDVI/SAVI…) COLORIDO pro aparelho (offline). No campo, sem sinal, abre a
// mancha sobre o satélite e TOCA nela pra navegar por GPS (distância + linha).

import { useState, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { getClientes, getFazendas, getTalhoes, getLegendasPorAtributo, type Talhao } from '@/lib/store';
import { carregarNdviSalvos } from '@/lib/meap/gerar';
import { colorirGridComLegenda } from '@/lib/raster';
import {
  getManchasDoTalhao, salvarManchaOffline, excluirMancha, distanciaM, formatarDist,
  type ManchaOffline,
} from '@/lib/coleta';
import { useGps } from '@/components/coleta/useGps';
import {
  ChevronLeft, ChevronRight, MapPin, Download, Trash2, Loader2, Crosshair, Maximize2, Satellite, CheckCircle2, WifiOff, X,
} from 'lucide-react';

const MapaColeta = dynamic(() => import('@/components/coleta/MapaColeta').then(m => ({ default: m.MapaColeta })), { ssr: false });

const AZUL_ESC = '#061525', AZUL = '#0a1929', BORDA = '#1a3a6b', TXT = '#e2e8f0', SUB = '#64748b';

function talhaoComoFC(t: Talhao | null): GeoJSON.FeatureCollection | null {
  if (!t?.geojson) return null;
  try {
    const o = JSON.parse(t.geojson);
    if (o?.type === 'FeatureCollection') return o;
    if (o?.type === 'Feature') return { type: 'FeatureCollection', features: [o] };
    return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: o }] };
  } catch { return null; }
}

export function ManchaScreen({ onVoltar }: { onVoltar: () => void }) {
  const [prodId, setProdId] = useState<string | null>(null);
  const [fazId, setFazId] = useState<string | null>(null);
  const [talhaoId, setTalhaoId] = useState<string | null>(null);
  const [aberta, setAberta] = useState<ManchaOffline | null>(null);

  const produtores = useMemo(() => getClientes(), []);
  const fazendas = useMemo(() => (prodId ? getFazendas(prodId) : []), [prodId]);
  const talhoes = useMemo(() => (fazId ? getTalhoes(fazId).filter(t => t.geojson) : []), [fazId]);
  const talhao = useMemo(() => (talhaoId ? getTalhoes().find(t => t.id === talhaoId) ?? null : null), [talhaoId]);

  if (aberta && talhao) {
    return <CampoMancha mancha={aberta} talhao={talhao} onVoltar={() => setAberta(null)} />;
  }

  function voltar() {
    if (talhaoId) setTalhaoId(null);
    else if (fazId) setFazId(null);
    else if (prodId) setProdId(null);
    else onVoltar();
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: AZUL_ESC }}>
      <header className="flex items-center gap-2 px-4 py-3 flex-shrink-0" style={{ background: AZUL, borderBottom: `1px solid ${BORDA}` }}>
        <button onClick={voltar} className="p-1.5 rounded-lg" style={{ background: BORDA, color: '#93c5fd' }}><ChevronLeft size={16} /></button>
        <Satellite size={16} style={{ color: '#93c5fd' }} />
        <span className="text-sm font-bold" style={{ color: TXT }}>NDVI / Mancha</span>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {!prodId ? (
          <Lista titulo="Produtor" vazio="Nenhum produtor sincronizado." itens={produtores.map(p => ({ id: p.id, nome: p.nome }))} onEscolher={id => setProdId(id)} />
        ) : !fazId ? (
          <Lista titulo="Fazenda" vazio="Nenhuma fazenda." itens={fazendas.map(f => ({ id: f.id, nome: f.nome }))} onEscolher={id => setFazId(id)} />
        ) : !talhaoId ? (
          <Lista titulo="Talhão" vazio="Nenhum talhão com limite." itens={talhoes.map(t => ({ id: t.id, nome: t.nome, sub: `${t.areaHa.toLocaleString('pt-BR')} ha` }))} onEscolher={id => setTalhaoId(id)} />
        ) : (
          <IndicesTalhao talhaoId={talhaoId} talhaoNome={talhao?.nome ?? ''} onAbrir={setAberta} />
        )}
      </main>
    </div>
  );
}

// ── Índices do talhão: baixados (offline) + disponíveis na nuvem p/ baixar ─────
function IndicesTalhao({ talhaoId, talhaoNome, onAbrir }: { talhaoId: string; talhaoNome: string; onAbrir: (m: ManchaOffline) => void }) {
  const [manchas, setManchas] = useState<ManchaOffline[]>(() => getManchasDoTalhao(talhaoId));
  const [disp, setDisp] = useState<Awaited<ReturnType<typeof carregarNdviSalvos>>>([]);
  const [carregando, setCarregando] = useState(true);
  const [baixando, setBaixando] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const recarregar = () => setManchas(getManchasDoTalhao(talhaoId));

  useEffect(() => {
    let vivo = true;
    setCarregando(true); setMsg('');
    if (!navigator.onLine) { setCarregando(false); setMsg('Sem internet — mostrando só as manchas já baixadas.'); return; }
    carregarNdviSalvos(talhaoId)
      .then(d => { if (vivo) setDisp(d); })
      .catch(() => { if (vivo) setMsg('Não consegui buscar os índices na nuvem.'); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [talhaoId]);

  const jaTem = useMemo(() => new Set(manchas.map(m => m.id)), [manchas]);

  async function baixar(n: Awaited<ReturnType<typeof carregarNdviSalvos>>[number]) {
    const id = `${talhaoId}__${n.indice}__${n.data}`;
    if (baixando || jaTem.has(id)) return;
    setBaixando(id); setMsg('');
    try {
      const leg = getLegendasPorAtributo('ndvi')[0];
      if (!leg) throw new Error('sem legenda de NDVI');
      const { dataUrl } = colorirGridComLegenda({ b64: n.b64, shape: n.shape }, leg);
      salvarManchaOffline({
        id, talhaoId, talhaoNome, indice: n.indice, data: n.data,
        fonte: n.nut.startsWith('ndvi_cbers') ? 'CBERS' : 'S2',
        dataUrl, bounds: n.bounds, criadoEm: new Date().toISOString(),
      });
      recarregar();
      setMsg(`✓ ${n.indice} ${dm(n.data)} baixado pro campo.`);
    } catch (e) { setMsg(`⚠ Falha ao baixar: ${e instanceof Error ? e.message : ''}`); }
    setBaixando(null);
  }

  function remover(m: ManchaOffline) {
    if (!confirm(`Remover a mancha ${m.indice} ${dm(m.data)} do aparelho?`)) return;
    excluirMancha(m.id); recarregar();
  }

  return (
    <div className="space-y-3">
      {msg && <p className="text-[11px]" style={{ color: msg.startsWith('⚠') ? '#fbbf24' : '#94a3b8' }}>{msg}</p>}

      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#86efac' }}>Baixadas no aparelho (offline)</p>
        {manchas.length === 0 ? (
          <p className="text-xs py-2" style={{ color: SUB }}>Nenhuma ainda — baixe um índice abaixo (precisa de internet).</p>
        ) : (
          <div className="space-y-1.5">
            {manchas.map(m => (
              <div key={m.id} className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: '#0b1d3a', border: `1px solid ${BORDA}` }}>
                <img src={m.dataUrl} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" style={{ background: '#061525' }} />
                <button onClick={() => onAbrir(m)} className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-semibold truncate" style={{ color: TXT }}>{m.indice} · {dm(m.data)}</p>
                  <p className="text-[10px]" style={{ color: SUB }}>{m.fonte} · toque para navegar</p>
                </button>
                <button onClick={() => onAbrir(m)} className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: BORDA, color: '#86efac' }}><MapPin size={15} /></button>
                <button onClick={() => remover(m)} className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: '#7f1d1d', color: '#fca5a5' }}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#93c5fd' }}>Disponíveis na nuvem</p>
        {carregando ? (
          <p className="text-xs py-2 flex items-center gap-1.5" style={{ color: SUB }}><Loader2 size={13} className="animate-spin" /> Buscando índices…</p>
        ) : disp.length === 0 ? (
          <p className="text-xs py-2 flex items-center gap-1.5" style={{ color: SUB }}>{!navigator.onLine && <WifiOff size={12} />} Nenhum índice salvo para este talhão (processe o NDVI na plataforma).</p>
        ) : (
          <div className="space-y-1.5">
            {disp.map(n => {
              const id = `${talhaoId}__${n.indice}__${n.data}`;
              const tem = jaTem.has(id);
              return (
                <div key={id} className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: '#0b1d3a', border: `1px solid ${BORDA}` }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: TXT }}>{n.indice} · {dm(n.data)}</p>
                    <p className="text-[10px]" style={{ color: SUB }}>{n.nut.startsWith('ndvi_cbers') ? 'CBERS' : 'S2'}</p>
                  </div>
                  {tem ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1.5" style={{ color: '#4ade80' }}><CheckCircle2 size={13} /> baixado</span>
                  ) : (
                    <button onClick={() => void baixar(n)} disabled={!!baixando}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white disabled:opacity-50" style={{ background: 'var(--invicta-blue-mid)' }}>
                      {baixando === id ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Baixar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tela de campo: mancha sobre o satélite + navegação por GPS ────────────────
function CampoMancha({ mancha, talhao, onVoltar }: { mancha: ManchaOffline; talhao: Talhao; onVoltar: () => void }) {
  const { userPos, gpsErro } = useGps();
  const [alvo, setAlvo] = useState<{ lng: number; lat: number } | null>(null);
  const [seguir, setSeguir] = useState(false);
  const [pedidoGps, setPedidoGps] = useState(0);
  const [pedidoEnq, setPedidoEnq] = useState(0);
  const talhaoFC = useMemo(() => talhaoComoFC(talhao), [talhao]);
  const dist = userPos && alvo ? distanciaM(userPos.lng, userPos.lat, alvo.lng, alvo.lat) : null;

  return (
    <div className="fixed inset-0" style={{ background: AZUL }}>
      <MapaColeta
        talhaoGeo={talhaoFC} bbox={mancha.bounds} pontos={{ type: 'FeatureCollection', features: [] }}
        userPos={userPos} alvo={alvo} raioM={12} modo="sat" seguirGps={seguir}
        pedidoGps={pedidoGps} pedidoEnquadrar={pedidoEnq}
        onSelecionarPonto={() => {}}
        onGestoUsuario={() => setSeguir(false)}
        ndviOverlay={{ url: mancha.dataUrl, bounds: mancha.bounds }}
        onClickMapa={(lng, lat) => setAlvo({ lng, lat })}
      />

      {/* topo */}
      <div className="absolute top-0 left-0 right-0 flex items-center gap-2 px-3 py-2" style={{ background: 'rgba(6,21,37,0.92)', borderBottom: `1px solid ${BORDA}`, paddingTop: 'max(8px, env(safe-area-inset-top))' }}>
        <button onClick={onVoltar} className="p-1.5 rounded-lg flex-shrink-0" style={{ background: BORDA, color: '#93c5fd' }}><ChevronLeft size={16} /></button>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold truncate" style={{ color: TXT }}>{talhao.nome} · {mancha.indice} {dm(mancha.data)}</p>
          <p className="text-[10px]" style={{ color: SUB }}>Toque numa mancha para navegar até ela</p>
        </div>
      </div>

      {/* leitura */}
      <div className="absolute left-3 flex flex-col gap-1" style={{ top: 'calc(56px + env(safe-area-inset-top))' }}>
        {alvo && dist != null && (
          <div className="px-3 py-2 rounded-xl" style={{ background: 'rgba(6,21,37,0.92)', border: `1px solid #4ade80` }}>
            <p className="text-[9px] font-bold uppercase" style={{ color: '#4ade80' }}>→ Mancha</p>
            <p className="text-2xl font-black leading-tight" style={{ color: '#fff' }}>{formatarDist(dist)}</p>
          </div>
        )}
        {userPos && (
          <div className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold" style={{ background: 'rgba(6,21,37,0.85)', color: userPos.acc <= 8 ? '#4ade80' : userPos.acc <= 20 ? '#fbbf24' : '#f87171' }}>
            GPS ±{Math.round(userPos.acc)} m
          </div>
        )}
        {gpsErro && <div className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold" style={{ background: '#78350f', color: '#fde68a' }}>{gpsErro}</div>}
        {alvo && <button onClick={() => setAlvo(null)} className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1" style={{ background: 'rgba(6,21,37,0.85)', color: '#fca5a5' }}><X size={11} /> Limpar alvo</button>}
      </div>

      {/* botões */}
      <div className="absolute right-3 flex flex-col gap-2" style={{ top: 'calc(56px + env(safe-area-inset-top))' }}>
        <BotaoMapa ativo={seguir} onClick={() => { setSeguir(true); setPedidoGps(x => x + 1); }}><Crosshair size={18} /></BotaoMapa>
        <BotaoMapa onClick={() => { setSeguir(false); setPedidoEnq(x => x + 1); }}><Maximize2 size={18} /></BotaoMapa>
      </div>
    </div>
  );
}

function BotaoMapa({ children, onClick, ativo }: { children: React.ReactNode; onClick: () => void; ativo?: boolean }) {
  return (
    <button onClick={onClick} className="w-11 h-11 rounded-xl flex items-center justify-center active:opacity-70"
      style={{ background: ativo ? '#2e5fa3' : 'rgba(6,21,37,0.92)', color: ativo ? '#fff' : '#93c5fd', border: `1px solid ${ativo ? '#60a5fa' : BORDA}` }}>
      {children}
    </button>
  );
}

function Lista({ titulo, itens, vazio, onEscolher }: { titulo: string; vazio: string; itens: { id: string; nome: string; sub?: string }[]; onEscolher: (id: string) => void }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#93c5fd' }}>{titulo}</p>
      {itens.length === 0 ? <p className="text-xs py-8 text-center" style={{ color: SUB }}>{vazio}</p> : (
        <div className="space-y-2">
          {itens.map(it => (
            <button key={it.id} onClick={() => onEscolher(it.id)} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left active:opacity-70" style={{ background: '#0b1d3a', border: `1px solid ${BORDA}` }}>
              <MapPin size={16} style={{ color: '#86efac' }} className="flex-shrink-0" />
              <div className="flex-1 min-w-0"><p className="text-sm font-semibold truncate" style={{ color: TXT }}>{it.nome}</p>{it.sub && <p className="text-[10px] mt-0.5" style={{ color: SUB }}>{it.sub}</p>}</div>
              <ChevronRight size={16} style={{ color: SUB }} className="flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const dm = (s: string) => { try { return new Date(s + 'T00:00:00').toLocaleDateString('pt-BR'); } catch { return s; } };
