'use client';

// #3 — Pagina PUBLICA do "link do prestador". View-only: mostra SO a geometria
// recebida no link (poligono/linha/pontos) + o GPS do prestador, para ele navegar
// ate/dentro da area. Sem login, sem menus, sem nenhum outro dado.

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useGps } from '@/components/coleta/useGps';
import { lerCampoHash, bboxDeFC, type CampoPayload } from '@/lib/campoLink';
import { Crosshair, Maximize2, Layers, MapPin, AlertTriangle } from 'lucide-react';

const MapaColeta = dynamic(
  () => import('@/components/coleta/MapaColeta').then(m => ({ default: m.MapaColeta })),
  { ssr: false, loading: () => <div className="fixed inset-0" style={{ background: '#0a1929' }} /> },
);

const AZUL = '#0a1929', BORDA = '#1a3a6b', TXT = '#e2e8f0', SUB = '#64748b';
const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

function Botao({ ativo, onClick, titulo, children }: { ativo?: boolean; onClick: () => void; titulo: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={titulo}
      className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ background: ativo ? '#2e5fa3' : 'rgba(6,21,37,0.92)', color: ativo ? '#fff' : '#93c5fd', border: `1px solid ${BORDA}` }}>
      {children}
    </button>
  );
}

export default function CampoPage() {
  const { userPos, gpsErro } = useGps();
  const [payload, setPayload] = useState<CampoPayload | null | undefined>(undefined); // undefined = carregando
  const [modo, setModo] = useState<'sat' | 'ruas'>('sat');
  const [seguir, setSeguir] = useState(false);
  const [pedidoGps, setPedidoGps] = useState(0);
  const [pedidoEnquadrar, setPedidoEnquadrar] = useState(0);

  useEffect(() => {
    const ler = () => setPayload(lerCampoHash(window.location.hash));
    ler();
    window.addEventListener('hashchange', ler);
    return () => window.removeEventListener('hashchange', ler);
  }, []);

  const fc = payload?.g ?? null;
  const bbox = useMemo(() => bboxDeFC(fc), [fc]);

  if (payload === undefined) {
    return <div className="fixed inset-0 flex items-center justify-center" style={{ background: AZUL, color: SUB }}>Carregando…</div>;
  }
  if (!payload) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center" style={{ background: AZUL }}>
        <AlertTriangle size={40} style={{ color: '#f59e0b' }} />
        <p className="text-sm font-bold" style={{ color: TXT }}>Link inválido ou incompleto</p>
        <p className="text-xs" style={{ color: SUB }}>Peça um novo link para quem enviou. O endereço precisa vir inteiro (não corte nada depois do #).</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0" style={{ background: AZUL }}>
      <MapaColeta
        talhaoGeo={fc} bbox={bbox} pontos={EMPTY_FC}
        userPos={userPos} alvo={null} raioM={0}
        modo={modo} seguirGps={seguir}
        pedidoGps={pedidoGps} pedidoEnquadrar={pedidoEnquadrar}
        onSelecionarPonto={() => {}}
        onGestoUsuario={() => setSeguir(false)}
      />

      {/* cabeçalho: nome da área + INVICTA */}
      <div className="absolute top-0 left-0 right-0 flex items-center gap-2 px-3 py-2"
        style={{ background: 'rgba(6,21,37,0.92)', borderBottom: `1px solid ${BORDA}`, paddingTop: 'max(8px, env(safe-area-inset-top))' }}>
        <MapPin size={16} style={{ color: '#f59e0b' }} className="flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold truncate" style={{ color: TXT }}>{payload.n || 'Área'}</p>
          <p className="text-[10px]" style={{ color: SUB }}>INVICTA · navegação em campo</p>
        </div>
      </div>

      {/* leitura de GPS */}
      <div className="absolute left-3 flex flex-col gap-1" style={{ top: 'calc(56px + env(safe-area-inset-top))' }}>
        {userPos && (
          <div className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold"
            style={{ background: 'rgba(6,21,37,0.85)', color: userPos.acc <= 8 ? '#4ade80' : userPos.acc <= 20 ? '#fbbf24' : '#f87171' }}>
            GPS ±{Math.round(userPos.acc)} m
          </div>
        )}
        {gpsErro && (
          <div className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold flex items-center gap-1" style={{ background: '#78350f', color: '#fde68a' }}>
            <AlertTriangle size={11} /> {gpsErro}
          </div>
        )}
      </div>

      {/* controles (view-only): ir p/ mim, enquadrar a área, satélite/ruas */}
      <div className="absolute right-3 flex flex-col gap-2" style={{ top: 'calc(56px + env(safe-area-inset-top))' }}>
        <Botao ativo={seguir} onClick={() => { setSeguir(true); setPedidoGps(x => x + 1); }} titulo="Ir para onde estou (GPS)"><Crosshair size={18} /></Botao>
        <Botao onClick={() => { setSeguir(false); setPedidoEnquadrar(x => x + 1); }} titulo="Ver a área"><Maximize2 size={18} /></Botao>
        <Botao onClick={() => setModo(m => (m === 'sat' ? 'ruas' : 'sat'))} titulo="Satélite / Ruas"><Layers size={18} /></Botao>
      </div>
    </div>
  );
}
