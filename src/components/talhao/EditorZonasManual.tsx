'use client';

// EDITOR MANUAL de Zonas de Manejo (spec "Editor Manual"). Painel inline aberto
// sobre um zoneamento SALVO — ajustes manuais preservando histórico, topologia e
// o mapa original (nada é sobrescrito; salva como NOVA versão).
//
// Reaproveita a arquitetura existente:
//   • união (dissolve a divisa interna) → lib/meap/fundir (unirFeatures/limparZona)
//   • corte/divisão → components/geo/EditorGeometria (mesmo editor das zonas)
//   • adjacência (fronteira compartilhada) → @turf/boolean-intersects
//   • área/perímetro → lib/geoEditor
//   • seleção no mapa → AppContext.zonaEvent (clique em zona-fill)
// A geometria/valores do raster NÃO são tocados: reclassificar só troca a classe.

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import booleanIntersects from '@turf/boolean-intersects';
import { unirFeatures, limparZona } from '@/lib/meap/fundir';
import { extrairEditavel, paraFeature, areaHaDe, perimetroMDe } from '@/lib/geoEditor';
import { classeZona, classeReconhecida, corZonaPorPosicao } from '@/lib/zonas';
import { usuarioAtual } from '@/lib/auth';
import { pode } from '@/lib/empresa';
import { estatisticasRasterZona } from '@/lib/meap/rasterStats';
import { useApp } from '@/context/AppContext';
import type { OperacaoEdicaoZona } from '@/lib/store';
import { Pencil, Combine, Scissors, Tag, Undo2, Redo2, RotateCcw, Save, X, CheckSquare, Square, AlertTriangle, MousePointerClick, Ruler, Lock, BarChart3 } from 'lucide-react';

const EditorGeometria = dynamic(
  () => import('@/components/geo/EditorGeometria').then(m => ({ default: m.EditorGeometria })),
  { ssr: false },
);

type Feat = GeoJSON.Feature;
const idDe = (f: Feat) => String((f.properties as { id?: string })?.id ?? '');
const rankDe = (f: Feat) => Number((f.properties as { potencialRank?: number })?.potencialRank ?? 0);
const areaDe = (f: Feat) => Number((f.properties as { areaHa?: number })?.areaHa ?? 0);
const classeDe = (f: Feat) => String((f.properties as { classe?: string })?.classe ?? '');

// Perímetro (m) e área (ha) de UMA feição, via geoEditor (mesma matemática do
// editor de limite). Geometrias multiparte somam as partes.
function perimetroM(f: Feat): number {
  const ed = extrairEditavel({ type: 'FeatureCollection', features: [f] });
  return ed ? perimetroMDe(ed) : 0;
}

// Camada (raster já interpolado) p/ as estatísticas por zona (spec §8).
export interface CamadaStats { simbolo: string; prof: string; b64: string; shape: [number, number]; }

export interface EditorZonasManualProps {
  nomeZoneamento: string;
  fcOriginal: GeoJSON.FeatureCollection;   // zoneamento salvo (não é alterado)
  areaMinHa?: number;                       // piso p/ divisão (spec §4)
  camadasStats?: CamadaStats[];             // camadas p/ valor médio/mín/máx/desvio
  boundsStats?: [number, number, number, number];
  onMapFc: (fc: GeoJSON.FeatureCollection | null) => void;   // prévia p/ o mapa
  onSalvarVersao: (fc: GeoJSON.FeatureCollection, log: OperacaoEdicaoZona[]) => void;
  onClose: () => void;
}

export function EditorZonasManual({ nomeZoneamento, fcOriginal, areaMinHa = 0, camadasStats, boundsStats, onMapFc, onSalvarVersao, onClose }: EditorZonasManualProps) {
  const { zonaEvent, setZonaEvent } = useApp();
  // Permissões granulares do editor (spec §9). Modo local (bancada) libera tudo.
  const podeUnif = pode('zonasUnificar'), podeRecl = pode('zonasReclassificar'), podeDiv = pode('zonasDividir'), podeSalvar = pode('zonasSalvar');

  // Cópia editável dos polígonos (o original NUNCA é tocado).
  const inicial = useMemo(
    () => (fcOriginal.features || []).filter(f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'))
      .map(f => ({ type: 'Feature', geometry: f.geometry!, properties: { ...(f.properties ?? {}) } }) as Feat),
    [fcOriginal],
  );
  const [feats, setFeats] = useState<Feat[]>(inicial);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [hist, setHist] = useState<Feat[][]>([]);
  const [redo, setRedo] = useState<Feat[][]>([]);
  const [log, setLog] = useState<OperacaoEdicaoZona[]>([]);
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [cortando, setCortando] = useState<{ id: string; fc: GeoJSON.FeatureCollection } | null>(null);
  const [reclassAberto, setReclassAberto] = useState(false);
  const [unifAberto, setUnifAberto] = useState(false);
  const minM2 = Math.max((areaMinHa || 0) * 10000, 1000);

  // Classes distintas presentes (rank → label/cor) — alvos de reclassificar/unificar.
  const classes = useMemo(() => {
    const m = new Map<number, { rank: number; label: string; cor: string }>();
    const ranks = [...new Set(feats.map(rankDe))].sort((a, b) => a - b);
    ranks.forEach((rank, i) => {
      const f = feats.find(x => rankDe(x) === rank);
      const label = classeDe(f!) || `Classe ${i + 1}`;
      const cor = (f!.properties as { cor?: string })?.cor
        ?? (classeReconhecida(label) ? classeZona(label).cor : corZonaPorPosicao(i, ranks.length));
      m.set(rank, { rank, label, cor });
    });
    return m;
  }, [feats]);
  const classesArr = useMemo(() => [...classes.values()], [classes]);

  // ── Publica no mapa: cor por classe + destaque das selecionadas (rotulo = id
  //    do polígono, p/ o clique no mapa casar com a seleção). ──
  useEffect(() => {
    onMapFc({
      type: 'FeatureCollection',
      features: feats.map(f => {
        const c = classes.get(rankDe(f));
        return {
          type: 'Feature' as const,
          properties: { cor: c?.cor ?? '#94a3b8', rotulo: idDe(f), classeLabel: c?.label ?? classeDe(f), selecionada: sel.has(idDe(f)) },
          geometry: f.geometry!,
        };
      }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feats, sel, classes]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => onMapFc(null), []);

  // ── Seleção pelo MAPA: clique numa zona (zona-fill emite {rotulo}=id). ──
  useEffect(() => {
    if (!zonaEvent) return;
    const id = zonaEvent.rotulo;
    if (feats.some(f => idDe(f) === id)) {
      setSel(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    }
    setZonaEvent(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zonaEvent]);

  // ── Histórico ──
  function empurrar() { setHist(h => [...h.slice(-49), feats]); setRedo([]); }
  function desfazer() {
    if (!hist.length) return;
    setRedo(r => [...r, feats]); setFeats(hist[hist.length - 1]); setHist(h => h.slice(0, -1));
    setSel(new Set()); setErro(null);
  }
  function refazer() {
    if (!redo.length) return;
    setHist(h => [...h, feats]); setFeats(redo[redo.length - 1]); setRedo(r => r.slice(0, -1));
    setSel(new Set()); setErro(null);
  }
  function restaurarOriginal() {
    if (!confirm('Restaurar as zonas originais? As alterações manuais desta sessão de edição serão descartadas (o zoneamento salvo continua intacto).')) return;
    empurrar(); setFeats(inicial); setSel(new Set()); setLog([]); setErro(null); setReclassAberto(false); setUnifAberto(false);
  }

  const selFeats = useMemo(() => feats.filter(f => sel.has(idDe(f))), [feats, sel]);
  function toggleSel(id: string) { setSel(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }

  function registrar(op: OperacaoEdicaoZona) { setLog(l => [...l, { ...op, data: new Date().toISOString(), usuario: usuarioAtual()?.email ?? undefined, motivo: motivo.trim() || undefined }]); }

  // Subconjunto de features conexo por fronteira compartilhada? (spec §2)
  function grupoConexo(fs: Feat[]): boolean {
    if (fs.length < 2) return true;
    const visto = new Set<string>([idDe(fs[0])]);
    const fila = [fs[0]];
    while (fila.length) {
      const a = fila.pop()!;
      for (const b of fs) {
        if (visto.has(idDe(b))) continue;
        if (a.geometry && b.geometry && booleanIntersects(a as Feat, b as Feat)) { visto.add(idDe(b)); fila.push(b); }
      }
    }
    return visto.size === fs.length;
  }

  // ── UNIFICAR (spec §2): dissolve a divisa interna das selecionadas ──
  function unificar(rankFinal: number) {
    setErro(null);
    if (!podeUnif) { setErro('Você não tem permissão para unificar zonas.'); return; }
    if (selFeats.length < 2) { setErro('Selecione 2 ou mais zonas vizinhas para unificar.'); return; }
    if (!grupoConexo(selFeats)) { setErro('Só é possível unificar zonas com fronteira compartilhada — a seleção tem zona(s) sem contato com as demais.'); return; }
    const alvo = classes.get(rankFinal);
    if (!alvo) return;
    empurrar();
    const base = selFeats.find(f => rankDe(f) === rankFinal) ?? selFeats.reduce((a, b) => (areaDe(b) > areaDe(a) ? b : a));
    const { geometry, areaHa } = unirFeatures(selFeats, minM2);
    const novo: Feat = {
      type: 'Feature', geometry,
      properties: { ...(base.properties ?? {}), id: idDe(base), potencialRank: rankFinal, classe: alvo.label, cor: alvo.cor, areaHa },
    };
    const resto = feats.filter(f => !sel.has(idDe(f)));
    setFeats([...resto, novo].sort((a, b) => idDe(a).localeCompare(idDe(b))));
    registrar({ tipo: 'unificar', data: '', zonas: selFeats.map(idDe), classeFinal: alvo.label });
    setSel(new Set([idDe(base)])); setUnifAberto(false);
  }

  // ── RECLASSIFICAR (spec §3): só troca a classe, geometria intacta ──
  function reclassificar(rankFinal: number) {
    setErro(null);
    if (!podeRecl) { setErro('Você não tem permissão para reclassificar zonas.'); return; }
    if (!selFeats.length) { setErro('Selecione ao menos uma zona para reclassificar.'); return; }
    const alvo = classes.get(rankFinal);
    if (!alvo) return;
    empurrar();
    const ids = new Set(selFeats.map(idDe));
    for (const f of selFeats) {
      if (rankDe(f) === rankFinal) continue;
      registrar({ tipo: 'reclassificar', data: '', zonas: [idDe(f)], classeOriginal: classeDe(f), classeFinal: alvo.label });
    }
    setFeats(fs => fs.map(f => ids.has(idDe(f))
      ? { ...f, properties: { ...(f.properties ?? {}), potencialRank: rankFinal, classe: alvo.label, cor: alvo.cor } }
      : f));
    setReclassAberto(false);
  }

  // ── DIVIDIR (spec §4): abre o editor de corte na zona selecionada ──
  function abrirDivisao() {
    setErro(null);
    if (!podeDiv) { setErro('Você não tem permissão para dividir zonas.'); return; }
    if (selFeats.length !== 1) { setErro('Selecione exatamente UMA zona para dividir.'); return; }
    const f = selFeats[0];
    setCortando({ id: idDe(f), fc: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: f.geometry! }] } });
  }
  function aplicarDivisao(id: string, fcs: GeoJSON.FeatureCollection[]) {
    const orig = feats.find(f => idDe(f) === id);
    if (!orig) { setCortando(null); return; }
    const eds = fcs.map(extrairEditavel).filter((e): e is NonNullable<ReturnType<typeof extrairEditavel>> => !!e && e.tipo === 'poligono');
    if (eds.length < 2) { setErro('A divisão precisa gerar pelo menos 2 partes (a linha deve atravessar a zona por inteiro).'); setCortando(null); return; }
    // Validação de área mínima (spec §4): nenhuma parte abaixo do piso.
    const areas = eds.map(e => areaHaDe(e) ?? 0);
    if (areaMinHa > 0 && areas.some(a => a > 0 && a < areaMinHa)) {
      setErro(`A divisão criaria zona menor que a área mínima (${areaMinHa.toLocaleString('pt-BR')} ha). Ajuste a linha de corte.`);
      setCortando(null); return;
    }
    empurrar();
    const props = (orig.properties ?? {}) as Record<string, unknown>;
    const novas: Feat[] = eds.map((ed, i) => ({
      type: 'Feature', geometry: paraFeature(ed).geometry,
      properties: { ...props, id: i === 0 ? id : `${id}_${i + 1}`, areaHa: areaHaDe(ed) ?? 0 },
    }));
    const resto = feats.filter(f => idDe(f) !== id);
    setFeats([...resto, ...novas].sort((a, b) => idDe(a).localeCompare(idDe(b))));
    registrar({ tipo: 'dividir', data: '', zonas: [id], partes: novas.length });
    setSel(new Set()); setCortando(null);
  }

  // ── Estatísticas (spec §8): área, perímetro, % — do conjunto selecionado ou total ──
  const areaTotal = useMemo(() => feats.reduce((s, f) => s + areaDe(f), 0) || 1, [feats]);
  const stats = useMemo(() => {
    const fs = selFeats.length ? selFeats : feats;
    const area = fs.reduce((s, f) => s + areaDe(f), 0);
    const perim = fs.reduce((s, f) => s + perimetroM(f), 0);
    return { n: fs.length, area, perim, perc: area / areaTotal, escopo: selFeats.length ? 'seleção' : 'total' };
  }, [selFeats, feats, areaTotal]);

  const nUni = log.filter(o => o.tipo === 'unificar').length;
  const nRec = log.filter(o => o.tipo === 'reclassificar').length;
  const nDiv = log.filter(o => o.tipo === 'dividir').length;
  const temEdicao = log.length > 0;

  // Estatísticas do RASTER da zona selecionada (spec §8): valor médio/mín/máx/
  // desvio por camada. Recalcula quando a geometria muda (unir/dividir).
  const rasterStats = useMemo(() => {
    if (selFeats.length !== 1 || !camadasStats?.length || !boundsStats) return null;
    const geom = selFeats[0].geometry;
    return camadasStats.map(c => ({
      simbolo: c.simbolo, prof: c.prof,
      st: estatisticasRasterZona(geom, { b64: c.b64, shape: c.shape }, boundsStats),
    })).filter(x => x.st);
  }, [selFeats, camadasStats, boundsStats]);

  const fmt = (v: number, d = 1) => v.toLocaleString('pt-BR', { maximumFractionDigits: d });
  const chip = (on: boolean) => ({ background: on ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: on ? '#fff' : '#93c5fd', border: `1px solid ${on ? '#60a5fa' : '#1a3a6b'}` });

  // Classe sugerida (maior área da seleção) p/ pré-selecionar nos seletores.
  const rankSugerido = selFeats.length ? rankDe(selFeats.reduce((a, b) => (areaDe(b) > areaDe(a) ? b : a))) : (classesArr[0]?.rank ?? 0);

  return (
    <div className="p-2 rounded space-y-2" style={{ background: '#1a1033', border: '1px solid #7c3aed' }}>
      <div className="flex items-center gap-2">
        <Pencil size={13} style={{ color: '#c4b5fd' }} />
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#ddd6fe' }}>Editor manual</span>
        <span className="text-[9px] truncate" style={{ color: '#64748b' }}>— {nomeZoneamento}</span>
        <button onClick={onClose} title="Fechar (nada é alterado)" className="ml-auto p-1 rounded" style={{ color: '#93c5fd' }}><X size={12} /></button>
      </div>
      <p className="text-[9px] leading-relaxed flex items-center gap-1" style={{ color: '#a78bfa' }}>
        <MousePointerClick size={10} /> Clique nas zonas <strong style={{ color: '#ddd6fe' }}>no mapa</strong> (ou na lista) para selecionar. O original é preservado — as mudanças viram uma <strong style={{ color: '#ddd6fe' }}>nova versão</strong>.
      </p>

      {/* Barra de ferramentas (cada operação respeita a permissão — spec §9) */}
      <div className="flex flex-wrap items-center gap-1">
        {podeUnif && (
          <button onClick={() => { setUnifAberto(v => !v); setReclassAberto(false); }} disabled={sel.size < 2}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded font-semibold disabled:opacity-40" style={chip(unifAberto)} title="Unir 2+ zonas vizinhas numa só">
            <Combine size={11} /> Unificar
          </button>
        )}
        {podeRecl && (
          <button onClick={() => { setReclassAberto(v => !v); setUnifAberto(false); }} disabled={sel.size < 1}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded font-semibold disabled:opacity-40" style={chip(reclassAberto)} title="Trocar a classe da(s) zona(s) selecionada(s)">
            <Tag size={11} /> Reclassificar
          </button>
        )}
        {podeDiv && (
          <button onClick={abrirDivisao} disabled={sel.size !== 1}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded font-semibold disabled:opacity-40" style={chip(false)} title="Dividir a zona selecionada por uma linha de corte">
            <Scissors size={11} /> Dividir
          </button>
        )}
        {!podeUnif && !podeRecl && !podeDiv && (
          <span className="flex items-center gap-1 text-[9px]" style={{ color: '#f59e0b' }}><Lock size={10} /> Sem permissão para editar zonas</span>
        )}
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={desfazer} disabled={!hist.length} title="Desfazer" className="p-1 rounded disabled:opacity-30" style={{ color: '#c4b5fd' }}><Undo2 size={13} /></button>
          <button onClick={refazer} disabled={!redo.length} title="Refazer" className="p-1 rounded disabled:opacity-30" style={{ color: '#c4b5fd' }}><Redo2 size={13} /></button>
          <button onClick={restaurarOriginal} title="Restaurar zonas originais" className="p-1 rounded" style={{ color: '#93c5fd' }}><RotateCcw size={13} /></button>
        </div>
      </div>

      {/* Motivo (opcional) — carimbado na próxima operação (spec §3, §5) */}
      <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo da alteração (opcional) — fica no histórico"
        className="w-full rounded px-2 py-1 text-[10px] outline-none" style={{ background: '#0b1f3a', color: '#e2e8f0', border: '1px solid #2e2050' }} />

      {/* Seletor de classe — Unificar */}
      {unifAberto && (
        <div className="p-1.5 rounded space-y-1" style={{ background: '#0b1f3a', border: '1px solid #5b21b6' }}>
          <p className="text-[9px] font-semibold" style={{ color: '#c4b5fd' }}>Unificar {sel.size} zonas — classe final:</p>
          <div className="flex flex-wrap gap-1">
            {classesArr.map(c => (
              <button key={c.rank} onClick={() => unificar(c.rank)} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded font-semibold" style={chip(c.rank === rankSugerido)}>
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: c.cor, border: '1px solid #fff' }} /> {c.label}
              </button>
            ))}
          </div>
          <p className="text-[9px]" style={{ color: '#64748b' }}>Sugerida: a da maior zona. A divisa interna é dissolvida; área e perímetro são recalculados.</p>
        </div>
      )}

      {/* Seletor de classe — Reclassificar */}
      {reclassAberto && (
        <div className="p-1.5 rounded space-y-1" style={{ background: '#0b1f3a', border: '1px solid #5b21b6' }}>
          <p className="text-[9px] font-semibold" style={{ color: '#c4b5fd' }}>Nova classe de {sel.size} zona(s) — só a classe muda (geometria intacta):</p>
          <div className="flex flex-wrap gap-1">
            {classesArr.map(c => (
              <button key={c.rank} onClick={() => reclassificar(c.rank)} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded font-semibold" style={chip(false)}>
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: c.cor, border: '1px solid #fff' }} /> {c.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {erro && (
        <div className="flex items-start gap-1.5 p-2 rounded" style={{ background: '#2a0f12', border: '1px solid #7f1d1d' }}>
          <AlertTriangle size={12} style={{ color: '#f87171' }} className="flex-shrink-0 mt-0.5" />
          <p className="text-[10px] leading-relaxed" style={{ color: '#fca5a5' }}>{erro}</p>
        </div>
      )}

      {/* Lista de zonas (seleção alternativa ao mapa) */}
      <div className="space-y-1 max-h-52 overflow-y-auto">
        {feats.map(f => {
          const id = idDe(f); const on = sel.has(id); const c = classes.get(rankDe(f));
          return (
            <button key={id} onClick={() => toggleSel(id)} className="w-full flex items-center gap-2 px-2 py-1 rounded text-left"
              style={{ background: on ? '#241748' : '#0b1f3a', border: `1px solid ${on ? '#a78bfa' : '#2e2050'}` }}>
              {on ? <CheckSquare size={12} className="flex-shrink-0" style={{ color: '#a78bfa' }} /> : <Square size={12} className="flex-shrink-0" style={{ color: '#475569' }} />}
              <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0" style={{ background: c?.cor ?? '#94a3b8', border: '1px solid #fff' }} />
              <span className="text-[10px] font-bold flex-shrink-0" style={{ color: '#e2e8f0' }}>#{id}</span>
              <span className="text-[10px] truncate" style={{ color: '#cbd5e1' }}>{c?.label ?? classeDe(f)}</span>
              <span className="text-[10px] ml-auto flex-shrink-0 tabular-nums" style={{ color: '#64748b' }}>{fmt(areaDe(f))} ha</span>
            </button>
          );
        })}
      </div>

      {/* Estatísticas geométricas (spec §8) */}
      <div className="flex items-center gap-2 p-1.5 rounded text-[9px]" style={{ background: '#0b1f3a', border: '1px solid #2e2050', color: '#94a3b8' }}>
        <Ruler size={11} style={{ color: '#a78bfa' }} className="flex-shrink-0" />
        <span>{stats.n} zona(s) · {stats.escopo}</span>
        <span>· <strong style={{ color: '#cbd5e1' }}>{fmt(stats.area)} ha</strong> ({fmt(stats.perc * 100, 0)}%)</span>
        <span>· perímetro {fmt(stats.perim / 1000, 2)} km</span>
      </div>

      {/* Estatísticas do raster da zona selecionada (spec §8: médio/mín/máx/desvio) */}
      {rasterStats && rasterStats.length > 0 && (
        <div className="p-1.5 rounded space-y-0.5" style={{ background: '#0b1f3a', border: '1px solid #2e2050' }}>
          <p className="text-[9px] font-semibold flex items-center gap-1" style={{ color: '#a78bfa' }}>
            <BarChart3 size={10} /> Valores do raster na zona #{idDe(selFeats[0])}
          </p>
          {rasterStats.map((c, i) => (
            <div key={i} className="text-[9px] tabular-nums" style={{ color: '#94a3b8' }}>
              <strong style={{ color: '#cbd5e1' }}>{c.simbolo} {c.prof}</strong>: méd {fmt(c.st!.media, 2)} · mín {fmt(c.st!.min, 2)} · máx {fmt(c.st!.max, 2)} · dp {fmt(c.st!.desvio, 2)} <span style={{ color: '#475569' }}>(n={c.st!.n})</span>
            </div>
          ))}
        </div>
      )}
      {selFeats.length === 1 && camadasStats?.length && rasterStats && rasterStats.length === 0 && (
        <p className="text-[9px]" style={{ color: '#64748b' }}>Sem valores de raster nesta zona (camadas não cobrem a área).</p>
      )}

      {temEdicao && (
        <p className="text-[9px]" style={{ color: '#a78bfa' }}>
          Alterações nesta sessão: {nUni} unificação(ões) · {nRec} reclassificação(ões) · {nDiv} divisão(ões).
        </p>
      )}

      {/* Ações */}
      <div className="flex items-center gap-1.5">
        <button onClick={onClose} className="text-[10px] px-2 py-1.5 rounded font-semibold" style={{ background: '#1a3a6b', color: '#93c5fd' }}>Cancelar</button>
        <button onClick={() => { if (podeSalvar) onSalvarVersao({ type: 'FeatureCollection', features: feats }, log); }} disabled={!temEdicao || !podeSalvar}
          title={!podeSalvar ? 'Você não tem permissão para salvar zonas' : undefined}
          className="ml-auto flex items-center gap-1 text-[10px] px-3 py-1.5 rounded font-bold text-white disabled:opacity-40"
          style={{ background: '#059669', border: '1px solid #34d399' }}>
          {podeSalvar ? <Save size={11} /> : <Lock size={11} />} Salvar como nova versão
        </button>
      </div>
      <p className="text-[9px]" style={{ color: '#6d5b9e' }}>O zoneamento original continua na lista e pode ser restaurado a qualquer momento.</p>

      {cortando && (
        <EditorGeometria titulo={`Dividir zona #${cortando.id}`} fc={cortando.fc}
          onSalvar={fcs => aplicarDivisao(cortando.id, fcs)}
          onFechar={() => setCortando(null)} />
      )}
    </div>
  );
}
