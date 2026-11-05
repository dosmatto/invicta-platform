'use client';

// Camada "Curvas PrecisionFarm" da aba Altimetria — curvas de nível RECEBIDAS
// da PrecisionFarm (topografia, extensão 0.3.0 do contrato; ledger
// pf-contrato-03, Q6). SOMENTE visualização: nunca altera o limite do talhão
// nem o MDE local. A validação e a publicação são feitas lá; aqui chega a
// revisão vigente (a anterior fica no histórico do servidor).
//
// Mapa: canal `curvasPF` do AppContext (MapView desenha com a cor da PF —
// mestras #e5a33b a cada 8 m, demais #466e9b —, rótulo com a cota e a cota ao
// clicar). Também empilhável na aba Camadas (camadasTalhao → grupoCurvas).

import { useCallback, useEffect, useState } from 'react';
import { Download, Eye, EyeOff, Loader2, Lock, RefreshCw } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import {
  buscarTopografiaPF, camadasVisiveisPF, estadoTopografiaPF, geometriaLinhasPF, type EstadoLinhasPF,
} from '@/lib/precisionfarm/cliente';

const dataCurta = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('pt-BR') : '—');

export function CurvasPrecisionFarm({ talhaoId }: { talhaoId: string }) {
  return <Curvas key={talhaoId} talhaoId={talhaoId} />;
}

function Curvas({ talhaoId }: { talhaoId: string }) {
  const { setCurvasPF } = useApp();
  const [estado, setEstado] = useState<EstadoLinhasPF | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ligada, setLigada] = useState(false);
  const [opacidade, setOpacidade] = useState(0.9);
  const [geom, setGeom] = useState<{ chave: string; fc: GeoJSON.FeatureCollection } | null>(null);
  const [buscando, setBuscando] = useState(false);

  const aplicar = useCallback((r: Awaited<ReturnType<typeof estadoTopografiaPF>>) => {
    if (!r.ok) { setErro(r.erro); return; }
    setErro(null);
    setEstado(r);
  }, []);
  useEffect(() => {
    let vivo = true;
    void estadoTopografiaPF(talhaoId).then(r => { if (vivo) aplicar(r); });
    return () => { vivo = false; };
  }, [talhaoId, aplicar]);

  // Sair da aba tira as curvas do mapa.
  useEffect(() => () => setCurvasPF(null), [setCurvasPF]);

  // A camada vigente (a de geometria mais nova entre as não arquivadas).
  const vigente = camadasVisiveisPF(estado?.camadas ?? [])
    .sort((a, b) => String(b.ultimaSincronizacao ?? '').localeCompare(String(a.ultimaSincronizacao ?? '')))[0] ?? null;
  const chave = vigente ? `${vigente.resourceId}:${vigente.revisaoGeometria}` : null;

  // Baixa a geometria da revisão vigente ao ligar (snapshot imutável: uma vez).
  useEffect(() => {
    if (!ligada || !vigente || !chave || geom?.chave === chave) return;
    let vivo = true;
    void geometriaLinhasPF(talhaoId, vigente.resourceId, vigente.revisaoGeometria!).then(r => {
      if (!vivo) return;
      if (!r.ok) { setErro(r.erro); setLigada(false); return; }
      setGeom({ chave, fc: r.geometria });
    });
    return () => { vivo = false; };
  }, [ligada, vigente, chave, geom, talhaoId]);

  // Publica no mapa (ou tira).
  useEffect(() => {
    setCurvasPF(ligada && geom && geom.chave === chave ? { fc: geom.fc, opacidade } : null);
  }, [ligada, geom, chave, opacidade, setCurvasPF]);

  async function buscar() {
    setBuscando(true); setMsg(null);
    const r = await buscarTopografiaPF(talhaoId);
    setBuscando(false);
    setMsg(r.ok ? r.mensagem : r.erro);
    // O processamento da fila roda no servidor logo depois: relê em instantes.
    setTimeout(() => { void estadoTopografiaPF(talhaoId).then(aplicar); }, 4000);
  }

  const meta = (vigente?.meta ?? {}) as Record<string, unknown>;
  const ultimaRev = vigente?.revisoes.find(x => x.n === vigente.revisaoGeometria) ?? null;
  const naFila = (estado?.camadas ?? []).find(c => c.situacao !== 'atualizado') ?? null;

  // Talhão sem nada da PF (ou sem nuvem/sessão): o bloco não aparece — a aba
  // Altimetria continua igual. A gestão o vê quando há vínculo (para "Buscar").
  if (!estado) return null;
  if (!vigente && !naFila && !(estado.gestor && estado.vinculo)) return null;

  return (
    <div className="rounded-lg p-3 space-y-2 text-xs" style={{ background: '#061525', border: '1px solid #1a3a6b', color: '#cbd5e1' }}>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider flex-1" style={{ color: '#e2e8f0' }}>Curvas PrecisionFarm</span>
        {estado.gestor && (
          <>
            <button onClick={buscar} disabled={!estado.podeBuscar || buscando}
              title={estado.podeBuscar ? 'Lê o inventário do talhão na PrecisionFarm e traz a topografia publicada' : 'Precisa do vínculo confirmado e do recebimento configurado.'}
              className="px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1"
              style={{ background: 'var(--invicta-blue-mid)', color: '#fff', opacity: estado.podeBuscar ? 1 : 0.5 }}>
              {buscando ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />} Buscar curvas
            </button>
            <button onClick={() => { void estadoTopografiaPF(talhaoId).then(aplicar); }} title="Atualizar" className="p-1 rounded" style={{ background: '#1e3a5f', color: '#cbd5e1' }}>
              <RefreshCw size={10} />
            </button>
          </>
        )}
      </div>
      <p className="text-[10px] flex items-start gap-1" style={{ color: '#94a3b8' }}>
        <Lock size={10} className="mt-0.5 flex-shrink-0" />
        Curvas de nível validadas e publicadas na PrecisionFarm (relevo de lá; não afirma precisão RTK nem datum certificado). Só visualização: não muda o limite nem o MDE daqui.
      </p>
      {erro && <div className="rounded px-2 py-1 text-[10px]" style={{ background: '#450a0a', color: '#fca5a5' }}>{erro}</div>}
      {msg && <div className="rounded px-2 py-1 text-[10px]" style={{ background: '#0f2240', color: '#bfdbfe' }}>{msg}</div>}
      {!vigente && !naFila && <p className="text-[10px]" style={{ color: '#64748b' }}>Nenhuma topografia recebida da PrecisionFarm para este talhão.</p>}
      {naFila && (
        <div className="rounded px-2 py-1 text-[10px]" style={{ background: naFila.situacao === 'erro' ? '#450a0a' : '#422006', color: naFila.situacao === 'erro' ? '#fca5a5' : '#fcd34d' }}>
          {naFila.situacao === 'erro' ? `Revisão recusada${vigente ? ' (a vigente foi mantida)' : ''}: ${naFila.motivo ?? ''}` : 'Sincronizando uma revisão nova…'}
        </div>
      )}
      {vigente && (
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={ligada} onChange={e => setLigada(e.target.checked)} />
            {ligada ? <Eye size={12} style={{ color: '#e5a33b' }} /> : <EyeOff size={12} style={{ color: '#475569' }} />}
            <span className="font-bold" style={{ color: '#e2e8f0' }}>Mostrar no mapa</span>
            <span className="ml-auto text-[10px]" style={{ color: '#7dd3fc' }}>rev. {vigente.revisaoGeometria} · {dataCurta(ultimaRev?.recebidoEm ?? vigente.ultimaSincronizacao)}</span>
          </label>
          <div className="flex items-center gap-2 text-[10px]" style={{ color: '#94a3b8' }}>
            Transparência
            <input type="range" min={10} max={100} step={5} value={Math.round(opacidade * 100)}
              onChange={e => setOpacidade(Number(e.target.value) / 100)} className="flex-1" />
            <span className="w-8 text-right">{Math.round(opacidade * 100)}%</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[10px]" style={{ color: '#94a3b8' }}>
            <span className="flex items-center gap-1"><span style={{ width: 16, height: 3, background: '#e5a33b', display: 'inline-block' }} /> Mestra (a cada {num(meta.index_interval_m)} m)</span>
            <span className="flex items-center gap-1"><span style={{ width: 16, height: 2, background: '#466e9b', display: 'inline-block' }} /> Intermediária ({num(meta.interval_m)} m)</span>
          </div>
          <div className="text-[10px]" style={{ color: '#64748b' }}>
            Cotas {num(meta.cota_min)}–{num(meta.cota_max)} m · {num(vigente.revisoes.find(x => x.n === vigente.revisaoGeometria)?.nFeicoes)} curvas
            {meta.smoothed === true ? ' · suavizadas' : ''} · clique numa curva para ver a cota.
          </div>
        </div>
      )}
    </div>
  );
}
