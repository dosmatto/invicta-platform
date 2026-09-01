'use client';

// INCORPORAR DIVISAS INTERNAS AO POLÍGONO ATUAL — painel de prévia.
//
// Pedido do agrônomo: o zoneamento é antigo e o contorno do talhão mudou depois.
// Partes das zonas ultrapassam o limite novo, outras não alcançam. Esta
// ferramenta descarta o contorno externo antigo, aproveita as DIVISAS INTERNAS
// (o trabalho agronômico de verdade), ESTICA as que morrem antes do limite
// SEGUINDO A TRAJETÓRIA da linha — não a menor distância — e CORTA as que passam.
//
// Segue o MESMO contrato do painel "Suavizar limites": prévia no mapa, resumo
// antes de decidir, e só então "Salvar como nova versão". O original nunca é
// tocado — vira uma versão nova na mesma linhagem.
//
// SEM PARÂMETROS de propósito. A suavização tem níveis porque o usuário escolhe
// quanto arredondar; aqui não há escolha a fazer: ou a divisa alcança o limite,
// ou não. O que o usuário decide é ACEITAR ou não o resultado — e para isso ele
// precisa dos avisos, não de botões.

import { useEffect, useRef, useState } from 'react';
import { incorporarDivisas, type RespIncorporarDivisas } from '@/lib/fertilidade';
import { AlertTriangle, Check, Loader2, Save, X, Scissors } from 'lucide-react';
import { fmtDec as fmt, fmtHa } from '@/lib/formato';

export interface IncorporarDivisasProps {
  titulo: string;
  fcOriginal: GeoJSON.FeatureCollection;
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  onPreview: (fc: GeoJSON.FeatureCollection | null) => void;
  onSalvarVersao: (fc: GeoJSON.FeatureCollection, resp: RespIncorporarDivisas) => void;
  onClose: () => void;
}

export function IncorporarDivisas({
  titulo, fcOriginal, poligono, onPreview, onSalvarVersao, onClose,
}: IncorporarDivisasProps) {
  const [resp, setResp] = useState<RespIncorporarDivisas | null>(null);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [verOriginal, setVerOriginal] = useState(false);
  const [mostrarDiff, setMostrarDiff] = useState(true);
  const [confirmo, setConfirmo] = useState(false);
  // Guarda de corrida: resposta de um cálculo antigo não pode sobrescrever o novo.
  const geracao = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // O cálculo roda dentro do timer (mesmo padrão do painel de suavização): sem
  // isso o `setState` sairia síncrono dentro do efeito, e o cálculo dispararia
  // antes de a tela mostrar o "Reajustando…".
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const g = ++geracao.current;
    timer.current = setTimeout(async () => {
      if (!poligono) {
        setErro('O talhão não tem contorno salvo — sem ele não há como reajustar as divisas.');
        return;
      }
      setProcessando(true); setErro(null);
      try {
        const r = await incorporarDivisas({ fc: fcOriginal, poligono });
        if (g === geracao.current) setResp(r);
      } catch (e) {
        if (g === geracao.current) { setResp(null); setErro(e instanceof Error ? e.message : 'Falha ao incorporar as divisas.'); }
      } finally {
        if (g === geracao.current) setProcessando(false);
      }
    }, 30);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [fcOriginal, poligono]);

  // Prévia no mapa: o resultado, com o diff (ganhou/perdeu) em amarelo por cima.
  useEffect(() => {
    if (!resp) { onPreview(null); return; }
    const base = verOriginal ? fcOriginal : resp.fc;
    const feats: GeoJSON.Feature[] = base.features.map(f => {
      const p = (f.properties ?? {}) as { cor?: string; zona?: string; classe?: string };
      return { type: 'Feature' as const, properties: { cor: p.cor, rotulo: p.zona ?? p.classe, classeLabel: p.classe, selecionada: false }, geometry: f.geometry! };
    });
    if (mostrarDiff && !verOriginal) {
      feats.push(...resp.diff.features.map(f => ({
        ...f, properties: { ...(f.properties ?? {}), cor: '#fde047', rotulo: '', classeLabel: '' },
      })));
    }
    onPreview({ type: 'FeatureCollection', features: feats });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resp, verOriginal, mostrarDiff]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => onPreview(null), []);

  const r = resp?.resumo;
  // Avisos que pedem decisão humana (classe sumiu, empate, herança fraca) —
  // separados do relato operacional para o usuário não ter de garimpar.
  const graves = (resp?.avisos ?? []).filter(a =>
    /DESAPARECEU|EMPATE|DESCARTADA|sem zona antiga|conferir/i.test(a));
  const outros = (resp?.avisos ?? []).filter(a => !graves.includes(a));
  const podeSalvar = !!resp && !processando && (graves.length === 0 || confirmo);

  return (
    <div className="p-2.5 rounded-lg space-y-2" style={{ background: '#0b1f3a', border: '1px solid #2e5fa3' }}>
      <div className="flex items-center gap-1.5">
        <Scissors size={12} style={{ color: '#93c5fd' }} />
        <p className="text-[10px] font-bold uppercase tracking-wider flex-1" style={{ color: '#93c5fd' }}>
          Incorporar divisas ao polígono atual
        </p>
        <button onClick={onClose} className="p-0.5 rounded" style={{ color: '#64748b' }}><X size={12} /></button>
      </div>
      <p className="text-[9px]" style={{ color: '#64748b' }}>
        {titulo} — o limite externo antigo é descartado. As divisas internas que não alcançam o
        contorno atual são <strong style={{ color: '#93c5fd' }}>esticadas seguindo a trajetória da linha</strong>;
        as que ultrapassam são cortadas.
      </p>

      {processando && (
        <p className="text-[10px] flex items-center gap-1.5" style={{ color: '#93c5fd' }}>
          <Loader2 size={12} className="animate-spin" /> Reajustando as divisas…
        </p>
      )}

      {erro && (
        <div className="flex items-start gap-1.5 p-2 rounded" style={{ background: '#2a0f12', border: '1px solid #7f1d1d' }}>
          <AlertTriangle size={12} style={{ color: '#f87171' }} className="flex-shrink-0 mt-0.5" />
          <p className="text-[10px] leading-relaxed" style={{ color: '#fca5a5' }}>{erro}</p>
        </div>
      )}

      {r && (
        <>
          <div className="flex gap-1">
            <button onClick={() => setVerOriginal(v => !v)}
              className="text-[9px] px-2 py-0.5 rounded font-semibold"
              style={{ background: verOriginal ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: verOriginal ? '#fff' : '#93c5fd' }}>
              Ver original
            </button>
            <button onClick={() => setMostrarDiff(v => !v)}
              className="text-[9px] px-2 py-0.5 rounded font-semibold"
              style={{ background: mostrarDiff ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: mostrarDiff ? '#fff' : '#93c5fd' }}>
              Diferenças
            </button>
          </div>

          <div className="p-2 rounded space-y-0.5 text-[9px]" style={{ background: '#061525', border: '1px solid #1a3a6b', color: '#cbd5e1' }}>
            <p><strong style={{ color: '#e2e8f0' }}>{r.nZonas}</strong> zonas cobrindo <strong style={{ color: '#e2e8f0' }}>{fmtHa(r.areaTalhaoHa)}</strong> ha
              {' · '}cobertura <strong style={{ color: r.coberturaPct >= 99.99 ? '#86efac' : '#fbbf24' }}>{fmt(r.coberturaPct, 2)}%</strong></p>
            <p style={{ color: '#94a3b8' }}>
              {r.nDivisas} divisa(s) interna(s) aproveitada(s) · {fmt(r.mDivisas, 0)} m
            </p>
            <p style={{ color: '#94a3b8' }}>
              esticadas: <strong style={{ color: '#93c5fd' }}>{r.nEsticadas}</strong> ({fmt(r.mEsticado, 0)} m)
              {' · '}cortadas: <strong style={{ color: '#93c5fd' }}>{r.nCortadas}</strong> ({fmt(r.mCortado, 0)} m)
              {r.nDescartadas > 0 && <> · <span style={{ color: '#fbbf24' }}>descartadas: {r.nDescartadas}</span></>}
            </p>
            <p style={{ color: '#94a3b8' }}>
              o talhão <strong style={{ color: '#86efac' }}>ganhou {fmtHa(r.areaGanhaHa)} ha</strong> e
              {' '}<strong style={{ color: '#fca5a5' }}>perdeu {fmtHa(r.areaPerdidaHa)} ha</strong> em relação ao zoneamento antigo
            </p>
          </div>

          {graves.length > 0 && (
            <div className="p-2 rounded space-y-1" style={{ background: '#2d1a00', border: '1px solid #92400e' }}>
              <p className="text-[10px] font-bold" style={{ color: '#fbbf24' }}>Precisa da sua decisão</p>
              {graves.map((a, i) => <p key={i} className="text-[9px]" style={{ color: '#fde68a' }}>• {a}</p>)}
              <label className="flex items-start gap-1.5 text-[9px] cursor-pointer mt-1" style={{ color: '#fbbf24' }}>
                <input type="checkbox" checked={confirmo} onChange={e => setConfirmo(e.target.checked)} className="accent-amber-500 mt-0.5" />
                Li os avisos acima e quero salvar assim mesmo.
              </label>
            </div>
          )}

          {outros.length > 0 && (
            <details className="text-[9px]" style={{ color: '#64748b' }}>
              <summary className="cursor-pointer">O que foi ajustado no arquivo antigo ({outros.length})</summary>
              <div className="mt-1 space-y-0.5">
                {outros.map((a, i) => <p key={i}>• {a}</p>)}
              </div>
            </details>
          )}
        </>
      )}

      <div className="flex gap-2">
        <button onClick={onClose}
          className="flex-1 py-1.5 rounded text-[10px] font-semibold" style={{ background: '#1a3a6b', color: '#94a3b8' }}>
          Cancelar
        </button>
        <button onClick={() => resp && onSalvarVersao(resp.fc, resp)} disabled={!podeSalvar}
          className="flex-1 py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1"
          style={{ background: podeSalvar ? 'var(--invicta-green-dark)' : '#1a3a6b', opacity: podeSalvar ? 1 : 0.6 }}>
          <Save size={11} /> Salvar como nova versão
        </button>
      </div>
      <p className="text-[9px]" style={{ color: '#475569' }}>
        <Check size={9} style={{ display: 'inline', verticalAlign: 'middle' }} /> O zoneamento original
        continua na lista e pode ser reaberto a qualquer momento.
      </p>
    </div>
  );
}
