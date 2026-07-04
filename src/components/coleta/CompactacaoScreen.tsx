'use client';

// App de campo — COMPACTAÇÃO (#36). A grade de pontos é criada NA PLATAFORMA
// (aba Compactação → Grade de compactação); aqui o operador navega por GPS até
// cada ponto e registra as leituras do PENETRÔMETRO por profundidade (offline).
// As leituras sincronizam como docs (inv_leituras_compact) e, na plataforma,
// viram um levantamento para interpolar. Segue o padrão da Amostragem/Mancha.

import { useState, useMemo, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { getClientes, getFazendas, getTalhoes, getGradesCompactacao, type Talhao, type GradeCompactacao } from '@/lib/store';
import {
  getLeiturasCompact, upsertLeituraCompact, pullLeiturasCompact, distanciaM, formatarDist,
  COR_STATUS, type LeituraCompactacao, type StatusPonto,
} from '@/lib/coleta';
import { emailUsuario } from '@/lib/auth';
import { useGps } from '@/components/coleta/useGps';
import { ChevronLeft, ChevronRight, MapPin, Gauge, Crosshair, Maximize2, X, CheckCircle2 } from 'lucide-react';

const MapaColeta = dynamic(() => import('@/components/coleta/MapaColeta').then(m => ({ default: m.MapaColeta })), { ssr: false });

const AZUL_ESC = '#061525', AZUL = '#0a1929', BORDA = '#1a3a6b', TXT = '#e2e8f0', SUB = '#64748b';
const RAIO_M = 15;  // raio para liberar o registro (GPS de celular; penetrômetro não exige o rigor do trado)

function talhaoComoFC(t: Talhao | null): GeoJSON.FeatureCollection | null {
  if (!t?.geojson) return null;
  try {
    const o = JSON.parse(t.geojson);
    if (o?.type === 'FeatureCollection') return o;
    if (o?.type === 'Feature') return { type: 'FeatureCollection', features: [o] };
    return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: o }] };
  } catch { return null; }
}

export function CompactacaoScreen({ onVoltar }: { onVoltar: () => void }) {
  const [prodId, setProdId] = useState<string | null>(null);
  const [fazId, setFazId] = useState<string | null>(null);
  const [talhaoId, setTalhaoId] = useState<string | null>(null);
  const [grade, setGrade] = useState<GradeCompactacao | null>(null);

  const produtores = useMemo(() => getClientes(), []);
  const fazendas = useMemo(() => (prodId ? getFazendas(prodId) : []), [prodId]);
  const talhoes = useMemo(() => {
    if (!fazId) return [];
    // só talhões com grade de compactação criada na plataforma
    return getTalhoes(fazId).filter(t => getGradesCompactacao(t.id).length > 0);
  }, [fazId]);
  const grades = useMemo(() => (talhaoId ? getGradesCompactacao(talhaoId) : []), [talhaoId]);
  const talhao = useMemo(() => (talhaoId ? getTalhoes().find(t => t.id === talhaoId) ?? null : null), [talhaoId]);

  if (grade && talhao) {
    return <CampoCompactacao grade={grade} talhao={talhao} onVoltar={() => setGrade(null)} />;
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
        <Gauge size={16} style={{ color: '#fbbf24' }} />
        <span className="text-sm font-bold" style={{ color: TXT }}>Compactação</span>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {!prodId ? (
          <Lista titulo="Produtor" vazio="Nenhum produtor sincronizado." itens={produtores.map(p => ({ id: p.id, nome: p.nome }))} onEscolher={id => setProdId(id)} />
        ) : !fazId ? (
          <Lista titulo="Fazenda" vazio="Nenhuma fazenda." itens={fazendas.map(f => ({ id: f.id, nome: f.nome }))} onEscolher={id => setFazId(id)} />
        ) : !talhaoId ? (
          <Lista titulo="Talhão" vazio="Nenhum talhão desta fazenda tem grade de compactação — crie na plataforma (aba Compactação) e sincronize." itens={talhoes.map(t => ({ id: t.id, nome: t.nome, sub: `${t.areaHa.toLocaleString('pt-BR')} ha · ${getGradesCompactacao(t.id).length} grade(s)` }))} onEscolher={id => setTalhaoId(id)} />
        ) : (
          <Lista titulo="Grade de compactação" vazio="Nenhuma grade sincronizada para este talhão." itens={grades.map(g => {
            const ls = getLeiturasCompact(g.id);
            const feitos = ls.filter(l => l.status !== 'pendente').length;
            return { id: g.id, nome: g.nome, sub: `${g.pontos.length} pontos · prof.: ${g.profundidades.join(' · ')} (${g.unidade})${feitos ? ` · ${feitos} feitos` : ''}` };
          })} onEscolher={id => setGrade(grades.find(g => g.id === id) ?? null)} />
        )}
      </main>
    </div>
  );
}

// ── Tela de campo: mapa + navegação + registro por profundidade ───────────────
function CampoCompactacao({ grade, talhao, onVoltar }: { grade: GradeCompactacao; talhao: Talhao; onVoltar: () => void }) {
  const { userPos, gpsErro } = useGps();
  const [leituras, setLeituras] = useState<LeituraCompactacao[]>(() => getLeiturasCompact(grade.id));
  const [selOrdem, setSelOrdem] = useState<number | null>(null);
  const [formAberto, setFormAberto] = useState(false);
  const [seguir, setSeguir] = useState(false);
  const [pedidoGps, setPedidoGps] = useState(0);
  const [pedidoEnq, setPedidoEnq] = useState(0);
  const vibrouRef = useRef(false);

  const talhaoFC = useMemo(() => talhaoComoFC(talhao), [talhao]);
  const recarregar = () => setLeituras(getLeiturasCompact(grade.id));

  // multi-aparelho: puxa leituras já feitas por outros (fire-and-forget)
  useEffect(() => {
    let vivo = true;
    pullLeiturasCompact(grade.id).then(n => { if (vivo && n > 0) recarregar(); }).catch(() => {});
    return () => { vivo = false; };
  }, [grade.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const statusDe = (ordem: number): StatusPonto => leituras.find(l => l.ordem === ordem)?.status ?? 'pendente';

  const pontosFC = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: grade.pontos.map(p => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { ordem: p.ordem, codigo: `C-${p.ordem + 1}`, cor: COR_STATUS[statusDe(p.ordem)], sel: p.ordem === selOrdem },
    })),
  }), [grade.pontos, leituras, selOrdem]); // eslint-disable-line react-hooks/exhaustive-deps

  const bbox = useMemo<[number, number, number, number] | null>(() => {
    if (!grade.pontos.length) return null;
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    for (const p of grade.pontos) { if (p.lng < w) w = p.lng; if (p.lat < s) s = p.lat; if (p.lng > e) e = p.lng; if (p.lat > n) n = p.lat; }
    return [w, s, e, n];
  }, [grade.pontos]);

  const sel = selOrdem != null ? grade.pontos.find(p => p.ordem === selOrdem) ?? null : null;
  const dist = userPos && sel ? distanciaM(userPos.lng, userPos.lat, sel.lng, sel.lat) : null;
  const dentroRaio = dist != null && dist <= RAIO_M;
  const feitos = leituras.filter(l => l.status !== 'pendente').length;

  // vibra ao ENTRAR no raio do ponto selecionado (transição fora→dentro)
  useEffect(() => {
    if (dentroRaio && !vibrouRef.current) {
      vibrouRef.current = true;
      try { navigator.vibrate?.([180, 90, 180]); } catch { /* sem vibração */ }
    }
    if (!dentroRaio) vibrouRef.current = false;
  }, [dentroRaio]);

  function registrar(status: 'coletado' | 'pulado', valores: Record<string, number>, obs: string) {
    if (selOrdem == null || !sel) return;
    upsertLeituraCompact({
      id: `${grade.id}__${selOrdem}`,
      gradeId: grade.id, talhaoId: grade.talhaoId, safra: grade.safra,
      ordem: selOrdem, codigo: `C-${selOrdem + 1}`, status,
      valores,
      lngReal: userPos?.lng, latReal: userPos?.lat, precisaoM: userPos?.acc,
      distanciaAlvoM: dist ?? undefined,
      horario: new Date().toISOString(),
      operador: emailUsuario() || undefined,
      obs: obs || undefined,
    });
    setFormAberto(false); setSelOrdem(null);
    recarregar();
  }

  return (
    <div className="fixed inset-0" style={{ background: AZUL }}>
      <MapaColeta
        talhaoGeo={talhaoFC} bbox={bbox} pontos={pontosFC}
        userPos={userPos} alvo={sel ? { lng: sel.lng, lat: sel.lat } : null} raioM={RAIO_M} modo="sat" seguirGps={seguir}
        pedidoGps={pedidoGps} pedidoEnquadrar={pedidoEnq}
        onSelecionarPonto={ordem => { setSelOrdem(ordem); setFormAberto(false); }}
        onGestoUsuario={() => setSeguir(false)}
      />

      {/* topo */}
      <div className="absolute top-0 left-0 right-0 flex items-center gap-2 px-3 py-2" style={{ background: 'rgba(6,21,37,0.92)', borderBottom: `1px solid ${BORDA}`, paddingTop: 'max(8px, env(safe-area-inset-top))' }}>
        <button onClick={onVoltar} className="p-1.5 rounded-lg flex-shrink-0" style={{ background: BORDA, color: '#93c5fd' }}><ChevronLeft size={16} /></button>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold truncate" style={{ color: TXT }}>{talhao.nome} · {grade.nome}</p>
          <p className="text-[10px]" style={{ color: SUB }}>{feitos}/{grade.pontos.length} pontos · toque num ponto para navegar</p>
        </div>
      </div>

      {/* leitura de navegação */}
      <div className="absolute left-3 flex flex-col gap-1" style={{ top: 'calc(56px + env(safe-area-inset-top))' }}>
        {sel && dist != null && (
          <div className="px-3 py-2 rounded-xl" style={{ background: 'rgba(6,21,37,0.92)', border: `1px solid ${dentroRaio ? '#4ade80' : '#fbbf24'}` }}>
            <p className="text-[9px] font-bold uppercase" style={{ color: dentroRaio ? '#4ade80' : '#fbbf24' }}>→ C-{sel.ordem + 1}{dentroRaio ? ' · no ponto' : ''}</p>
            <p className="text-2xl font-black leading-tight" style={{ color: '#fff' }}>{formatarDist(dist)}</p>
          </div>
        )}
        {userPos && (
          <div className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold" style={{ background: 'rgba(6,21,37,0.85)', color: userPos.acc <= 8 ? '#4ade80' : userPos.acc <= 20 ? '#fbbf24' : '#f87171' }}>
            GPS ±{Math.round(userPos.acc)} m
          </div>
        )}
        {gpsErro && <div className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold" style={{ background: '#78350f', color: '#fde68a' }}>{gpsErro}</div>}
      </div>

      {/* botões do mapa */}
      <div className="absolute right-3 flex flex-col gap-2" style={{ top: 'calc(56px + env(safe-area-inset-top))' }}>
        <BotaoMapa ativo={seguir} onClick={() => { setSeguir(true); setPedidoGps(x => x + 1); }}><Crosshair size={18} /></BotaoMapa>
        <BotaoMapa onClick={() => { setSeguir(false); setPedidoEnq(x => x + 1); }}><Maximize2 size={18} /></BotaoMapa>
      </div>

      {/* rodapé: ação do ponto selecionado */}
      {sel && !formAberto && (
        <div className="absolute left-0 right-0 bottom-0 px-3 pb-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          <div className="rounded-2xl p-3 space-y-2" style={{ background: 'rgba(6,21,37,0.96)', border: `1px solid ${BORDA}` }}>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold" style={{ color: TXT }}>C-{sel.ordem + 1}</span>
              {statusDe(sel.ordem) !== 'pendente' && (
                <span className="flex items-center gap-1 text-[10px] font-bold" style={{ color: COR_STATUS[statusDe(sel.ordem)] }}>
                  <CheckCircle2 size={12} /> {statusDe(sel.ordem) === 'coletado' ? 'já registrado (registrar de novo substitui)' : 'pulado'}
                </span>
              )}
              <button onClick={() => setSelOrdem(null)} className="ml-auto p-1 rounded" style={{ color: SUB }}><X size={14} /></button>
            </div>
            <button onClick={() => setFormAberto(true)} disabled={!dentroRaio}
              className="w-full py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: dentroRaio ? '#15803d' : '#1a3a6b' }}>
              {dentroRaio ? '● Registrar leituras' : dist != null ? `Aproxime-se (${formatarDist(dist)})` : 'Aguardando GPS…'}
            </button>
          </div>
        </div>
      )}

      {formAberto && sel && (
        <FormLeituras grade={grade} codigo={`C-${sel.ordem + 1}`}
          onCancelar={() => setFormAberto(false)}
          onSalvar={(valores, obs) => registrar('coletado', valores, obs)}
          onPular={obs => registrar('pulado', {}, obs)} />
      )}
    </div>
  );
}

// ── Form: uma leitura por PROFUNDIDADE (unidade da grade) ─────────────────────
function FormLeituras({ grade, codigo, onSalvar, onPular, onCancelar }: {
  grade: GradeCompactacao; codigo: string;
  onSalvar: (valores: Record<string, number>, obs: string) => void;
  onPular: (obs: string) => void;
  onCancelar: () => void;
}) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [obs, setObs] = useState('');

  const valores = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of grade.profundidades) {
      const n = parseFloat((vals[p] ?? '').replace(',', '.'));
      if (isFinite(n)) out[p] = n;
    }
    return out;
  }, [vals, grade.profundidades]);
  const nPreenchidas = Object.keys(valores).length;

  return (
    <div className="absolute inset-0 flex flex-col justify-end" style={{ background: 'rgba(0,0,0,0.45)' }}>
      <div className="rounded-t-2xl p-4 space-y-3 max-h-[80vh] overflow-y-auto" style={{ background: AZUL_ESC, borderTop: `1px solid ${BORDA}`, paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        <div className="flex items-center gap-2">
          <Gauge size={16} style={{ color: '#fbbf24' }} />
          <p className="text-sm font-bold flex-1" style={{ color: TXT }}>{codigo} — leituras do penetrômetro</p>
          <button onClick={onCancelar} className="p-1.5 rounded-lg" style={{ background: BORDA, color: '#93c5fd' }}><X size={15} /></button>
        </div>

        <div className="space-y-2">
          {grade.profundidades.map(p => (
            <label key={p} className="flex items-center gap-2">
              <span className="text-xs font-semibold w-24 flex-shrink-0" style={{ color: '#93c5fd' }}>{p} cm</span>
              <input inputMode="decimal" placeholder={`resistência (${grade.unidade})`} value={vals[p] ?? ''}
                onChange={e => setVals(v => ({ ...v, [p]: e.target.value }))}
                className="flex-1 rounded-lg px-3 py-2.5 text-sm outline-none"
                style={{ background: '#0b1d3a', color: TXT, border: `1px solid ${BORDA}` }} />
            </label>
          ))}
        </div>

        <input placeholder="Observação (opcional)" value={obs} onChange={e => setObs(e.target.value)}
          className="w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ background: '#0b1d3a', color: TXT, border: `1px solid ${BORDA}` }} />

        <div className="flex gap-2">
          <button onClick={() => onPular(obs)} className="px-4 py-3 rounded-xl text-xs font-bold" style={{ background: BORDA, color: '#cbd5e1' }}>Pular ponto</button>
          <button onClick={() => onSalvar(valores, obs)} disabled={nPreenchidas === 0}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: '#15803d' }}>
            Salvar ({nPreenchidas}/{grade.profundidades.length} profundidades)
          </button>
        </div>
        <p className="text-[10px]" style={{ color: SUB }}>Preencha as profundidades medidas — as vazias não entram. Salva no aparelho e sincroniza depois.</p>
      </div>
    </div>
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
              <MapPin size={16} style={{ color: '#fbbf24' }} className="flex-shrink-0" />
              <div className="flex-1 min-w-0"><p className="text-sm font-semibold truncate" style={{ color: TXT }}>{it.nome}</p>{it.sub && <p className="text-[10px] mt-0.5" style={{ color: SUB }}>{it.sub}</p>}</div>
              <ChevronRight size={16} style={{ color: SUB }} className="flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
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
