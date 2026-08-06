'use client';

// EDITOR MANUAL de Zonas de Manejo (spec "Editor Manual"). Painel inline aberto
// sobre um zoneamento SALVO — ajustes manuais preservando histórico, topologia e
// o mapa original (nada é sobrescrito; salva como NOVA versão).
//
// Reaproveita a arquitetura existente:
//   • união (dissolve a divisa interna) → lib/meap/fundir (unirFeatures/limparZona)
//   • corte por LINHA (padrão) → traço no próprio mapa + /zonear-dividir (shapely)
//   • corte por editor (avançado) → components/geo/EditorGeometria
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
import { escalaClasses, remapeamentoDeRanks, type ClasseEscala } from '@/lib/meap/escalaClasses';
import { carregarCamadasValidacao } from '@/lib/validacao/carregar';
import { amostrarPorZona } from '@/lib/validacao/amostragem';
import { resumoValores, separacaoEntreZonas } from '@/lib/validacao/estatistica';
import { sugerirClassificacao, type Sugestao } from '@/lib/validacao/sugestao';
import type { CamadaValidacao } from '@/lib/validacao/validar';
import { usuarioAtual } from '@/lib/auth';
import { pode } from '@/lib/empresa';
import { estatisticasRasterZona } from '@/lib/meap/rasterStats';
import { useApp } from '@/context/AppContext';
import type { OperacaoEdicaoZona } from '@/lib/store';
import { Pencil, Combine, Scissors, Tag, Undo2, Redo2, RotateCcw, Save, X, CheckSquare, Square, AlertTriangle, MousePointerClick, Ruler, Lock, BarChart3, Wand2, Loader2, ArrowRight, Check } from 'lucide-react';

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
  talhaoId: string;
  nomeZoneamento: string;
  fcOriginal: GeoJSON.FeatureCollection;   // zoneamento salvo (não é alterado)
  areaMinHa?: number;                       // piso p/ divisão (spec §4)
  camadasStats?: CamadaStats[];             // camadas p/ valor médio/mín/máx/desvio
  boundsStats?: [number, number, number, number];
  onMapFc: (fc: GeoJSON.FeatureCollection | null) => void;   // prévia p/ o mapa
  onSalvarVersao: (fc: GeoJSON.FeatureCollection, log: OperacaoEdicaoZona[]) => void;
  onClose: () => void;
}

export function EditorZonasManual({ talhaoId, nomeZoneamento, fcOriginal, areaMinHa = 0, camadasStats, boundsStats, onMapFc, onSalvarVersao, onClose }: EditorZonasManualProps) {
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
  /** Corte aplicado com parte abaixo da área mínima da geração — informa sem impedir. */
  const [avisoDiv, setAvisoDiv] = useState<string | null>(null);
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [nomeTemp, setNomeTemp] = useState('');
  const [cortando, setCortando] = useState<{ id: string; fc: GeoJSON.FeatureCollection } | null>(null);
  const [reclassAberto, setReclassAberto] = useState(false);
  const [unifAberto, setUnifAberto] = useState(false);
  // Sugestão de classificação vinda da VALIDAÇÃO (mesma conta do Laboratório):
  // média medida por zona + quais zonas não se distinguem estatisticamente.
  const [sugAberto, setSugAberto] = useState(false);
  const [sugCarregando, setSugCarregando] = useState(false);
  const [sugCamadas, setSugCamadas] = useState<CamadaValidacao[] | null>(null);
  const [sugCamadaId, setSugCamadaId] = useState('');
  const [sugestao, setSugestao] = useState<Sugestao | null>(null);
  const [sugErro, setSugErro] = useState<string | null>(null);
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

  // Alvos do RECLASSIFICAR: as classes do mapa MAIS as 5 do semáforo que ainda
  // não existem nele. Um zoneamento que saiu só com "Muito alto / Alto /
  // Médio-alto" não deixava marcar uma zona como Média ou Baixa — que é
  // justamente o que se corrige à mão. Ver lib/meap/escalaClasses.ts.
  const escala = useMemo(
    () => escalaClasses(classesArr.map(c => ({ label: c.label, cor: c.cor, rank: c.rank }))),
    [classesArr],
  );

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

  // Renumerar a zona. O id É a identidade dela aqui dentro (seleção, log,
  // divisão), então trocar exige carregar a mudança para esses três lugares —
  // deixar a seleção com o id velho faria a zona "sumir" do que está marcado.
  function confirmarRenome(idAntigo: string) {
    const novo = nomeTemp.trim();
    setRenomeando(null); setNomeTemp('');
    if (!novo || novo === idAntigo) return;
    if (feats.some(f => idDe(f) === novo)) {
      setErro(`Já existe uma zona #${novo} neste mapa. Escolha outro número.`);
      return;
    }
    empurrar();
    setFeats(fs => fs.map(f => (idDe(f) === idAntigo
      ? { ...f, properties: { ...(f.properties ?? {}), id: novo } }
      : f)).sort((a, b) => idDe(a).localeCompare(idDe(b), 'pt-BR', { numeric: true })));
    setSel(prev => {
      if (!prev.has(idAntigo)) return prev;
      const n = new Set(prev); n.delete(idAntigo); n.add(novo); return n;
    });
    registrar({ tipo: 'renumerar', data: '', zonas: [idAntigo, novo] });
  }

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
  //
  // O alvo pode ser uma classe que ainda NÃO existe no mapa (as 5 do semáforo
  // aparecem sempre). Nesse caso a escala ganha um degrau e os ranks são
  // renumerados para continuarem contíguos — a ORDEM das classes que já
  // estavam nunca muda, só o número: é o rank que ordena a dose na prescrição.
  function reclassificar(alvo: ClasseEscala) {
    setErro(null);
    if (!podeRecl) { setErro('Você não tem permissão para reclassificar zonas.'); return; }
    if (!selFeats.length) { setErro('Selecione ao menos uma zona para reclassificar.'); return; }
    empurrar();
    const ids = new Set(selFeats.map(idDe));
    for (const f of selFeats) {
      if (classeDe(f) === alvo.label) continue;
      registrar({ tipo: 'reclassificar', data: '', zonas: [idDe(f)], classeOriginal: classeDe(f), classeFinal: alvo.label });
    }
    const dePara = remapeamentoDeRanks(escala);
    setFeats(fs => fs.map(f => {
      if (ids.has(idDe(f))) {
        return { ...f, properties: { ...(f.properties ?? {}), potencialRank: alvo.rank, classe: alvo.label, cor: alvo.cor } };
      }
      const novo = dePara.get(rankDe(f));
      return novo == null ? f : { ...f, properties: { ...(f.properties ?? {}), potencialRank: novo } };
    }));
    setReclassAberto(false);
  }

  // ── SUGERIR CLASSIFICAÇÃO (validação) ───────────────────────────────────
  //
  // Mede a média de cada zona na camada escolhida — sobre a CÓPIA DE TRABALHO,
  // não sobre o zoneamento salvo: se você acabou de unir ou dividir, a
  // sugestão tem de enxergar o mapa como ele está agora. Aplicar é uma edição
  // como qualquer outra: entra no histórico, dá para desfazer e só vira versão
  // quando você clicar em salvar.
  async function abrirSugestao() {
    setSugAberto(v => !v);
    setUnifAberto(false); setReclassAberto(false);
    if (sugestao || sugCarregando) return;
    setSugCarregando(true); setSugErro(null);
    try {
      const cams = sugCamadas ?? (await carregarCamadasValidacao(talhaoId)).camadas;
      setSugCamadas(cams);
      if (!cams.length) { setSugErro('Nenhuma camada disponível para basear a sugestão (produtividade, NDVI, condutividade ou fertilidade interpolada).'); return; }
      const alvo = sugCamadaId || cams[0].id;
      setSugCamadaId(alvo);
      calcularSugestao(cams, alvo);
    } catch (e) {
      setSugErro(e instanceof Error ? e.message : 'falha ao carregar as camadas');
    } finally { setSugCarregando(false); }
  }

  function calcularSugestao(cams: CamadaValidacao[], camadaId: string) {
    const cam = cams.find(c => c.id === camadaId) ?? cams[0];
    if (!cam) return;
    const zonasGeom = feats.map(f => ({ idZona: idDe(f), geometry: f.geometry }));
    const valores = amostrarPorZona(zonasGeom, cam.grid, cam.bounds);
    const ids = [...new Set(feats.map(idDe))];
    const sep = separacaoEntreZonas(ids.map(id => ({ id, valores: valores.get(id) ?? [] })));
    const sug = sugerirClassificacao(
      ids.map(id => {
        const f = feats.find(x => idDe(x) === id)!;
        const r = resumoValores(valores.get(id) ?? []);
        return { idZona: id, nome: id, classeAtual: classeDe(f), areaHa: areaDe(f), media: r?.media ?? null };
      }),
      sep, cam.unidade,
    );
    setSugestao(sug);
    setSugErro(sug.zonas.length ? null : sug.justificativa);
  }

  function aplicarSugestao() {
    if (!sugestao || !podeRecl) { if (!podeRecl) setErro('Você não tem permissão para reclassificar zonas.'); return; }
    const mudam = sugestao.zonas.filter(z => z.mudou);
    if (!mudam.length) return;
    empurrar();
    const porId = new Map(sugestao.zonas.map(z => [z.idZona, z]));
    for (const z of mudam) registrar({ tipo: 'reclassificar', data: '', zonas: [z.idZona], classeOriginal: z.classeAtual, classeFinal: z.classeSugerida });
    setFeats(fs => fs.map(f => {
      const z = porId.get(idDe(f));
      return z ? { ...f, properties: { ...(f.properties ?? {}), classe: z.classeSugerida, cor: z.cor, potencialRank: z.rankSugerido } } : f;
    }));
    setSugAberto(false); setSel(new Set());
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
    // Área mínima NÃO bloqueia o corte manual. Ela é um parâmetro da GERAÇÃO
    // automática — serve para o algoritmo não picotar o mapa em manchas. Aqui
    // quem desenha a linha é o agrônomo, que está separando um pedaço porque
    // conhece o talhão (uma mancha de pedra, um encharcado, a beira de um
    // carreador): recusar o corte por ele ter 1,2 ha seria o sistema discordar
    // de quem viu a área. Vira AVISO — informa e deixa seguir.
    const areas = eds.map(e => areaHaDe(e) ?? 0);
    const menores = areas.filter(a => a > 0 && a < areaMinHa);
    setAvisoDiv(areaMinHa > 0 && menores.length
      ? `${menores.length === 1 ? 'Uma parte ficou' : `${menores.length} partes ficaram`} abaixo da área mínima da geração (${areaMinHa.toLocaleString('pt-BR')} ha): ${menores.map(a => a.toLocaleString('pt-BR', { maximumFractionDigits: 2 })).join(', ')} ha. O corte foi aplicado.`
      : null);
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
        {podeRecl && (
          <button onClick={abrirSugestao} disabled={sugCarregando}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded font-semibold disabled:opacity-40" style={chip(sugAberto)}
            title="Sugerir a classe de cada zona pela validação (média medida + separação estatística)">
            {sugCarregando ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />} Sugerir classificação
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

      {/* Sugestão de classificação pela validação */}
      {sugAberto && (
        <div className="p-1.5 rounded space-y-1.5" style={{ background: '#0b1f3a', border: '1px solid #5b21b6' }}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[9px] font-semibold" style={{ color: '#c4b5fd' }}>Classificação sugerida pela validação:</span>
            {sugCamadas && sugCamadas.length > 0 && (
              <select value={sugCamadaId} onChange={e => { setSugCamadaId(e.target.value); calcularSugestao(sugCamadas, e.target.value); }}
                className="rounded px-1.5 py-0.5 text-[10px] outline-none" style={{ background: '#1a3a6b', border: '1px solid #2e5fa3', color: '#e2e8f0' }}>
                {sugCamadas.map(c => <option key={c.id} value={c.id}>{c.grupo ? `${c.grupo} · ` : ''}{c.nome}</option>)}
              </select>
            )}
            {sugCarregando && <span className="text-[9px]" style={{ color: '#64748b' }}>carregando camadas…</span>}
          </div>

          {sugErro && <p className="text-[9px]" style={{ color: '#fbbf24' }}>{sugErro}</p>}

          {sugestao && sugestao.zonas.length > 0 && (
            <>
              <p className="text-[9px] leading-relaxed" style={{ color: '#94a3b8' }}>{sugestao.justificativa}</p>
              <div className="space-y-0.5">
                {sugestao.zonas.map(z => (
                  <div key={z.idZona} className="flex items-center gap-2 px-2 py-1 rounded text-[10px]"
                    style={{ background: z.mudou ? '#241748' : '#0b1f3a', border: '1px solid #2e2050', opacity: z.mudou ? 1 : 0.55 }}>
                    <span className="font-bold" style={{ color: '#e2e8f0', minWidth: 34 }}>#{z.nome}</span>
                    <span style={{ color: '#64748b', minWidth: 92 }}>{z.media == null ? 'sem dado' : fmt(z.media, 0)}</span>
                    <span style={{ color: '#94a3b8' }}>{z.classeAtual || '—'}</span>
                    {z.mudou ? <ArrowRight size={11} style={{ color: '#a78bfa' }} /> : <span style={{ color: '#475569' }}>=</span>}
                    <span className="inline-flex items-center gap-1 font-semibold" style={{ color: z.cor }}>
                      <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: z.cor, border: '1px solid #fff3' }} />
                      {z.classeSugerida}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={aplicarSugestao} disabled={!sugestao.nMudancas}
                  className="flex items-center gap-1 text-[10px] px-2 py-1 rounded font-semibold disabled:opacity-40" style={{ background: '#5b21b6', color: '#fff' }}>
                  <Check size={11} /> Aceitar sugestão ({sugestao.nMudancas} zona{sugestao.nMudancas === 1 ? '' : 's'})
                </button>
                <span className="text-[9px]" style={{ color: '#64748b' }}>
                  {sugestao.nMudancas === 0
                    ? 'A classificação atual já é a que os dados indicam.'
                    : 'Aceitar aplica aqui no editor — dá para desfazer, e só vira versão ao salvar.'}
                </span>
              </div>
            </>
          )}
        </div>
      )}

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
            {escala.map(c => (
              <button key={`${c.label}-${c.rank}`} onClick={() => reclassificar(c)}
                title={c.presente ? `${c.label} — já existe neste mapa` : `${c.label} — classe padrão, ainda não usada neste mapa`}
                className="flex items-center gap-1 text-[10px] px-2 py-1 rounded font-semibold"
                style={{ ...chip(false), ...(c.presente ? {} : { borderStyle: 'dashed', opacity: 0.9 }) }}>
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: c.cor, border: '1px solid #fff' }} /> {c.label}
              </button>
            ))}
          </div>
          <p className="text-[9px]" style={{ color: '#64748b' }}>
            As 5 classes padrão aparecem sempre; as tracejadas ainda não existem neste mapa. Usar uma delas cria o degrau na escala — a ordem das classes que já estão não muda.
          </p>
        </div>
      )}

      {erro && (
        <div className="flex items-start gap-1.5 p-2 rounded" style={{ background: '#2a0f12', border: '1px solid #7f1d1d' }}>
          <AlertTriangle size={12} style={{ color: '#f87171' }} className="flex-shrink-0 mt-0.5" />
          <p className="text-[10px] leading-relaxed" style={{ color: '#fca5a5' }}>{erro}</p>
        </div>
      )}

      {avisoDiv && (
        <div className="flex items-start gap-1.5 p-2 rounded" style={{ background: '#2d1a00', border: '1px solid #92400e' }}>
          <AlertTriangle size={12} style={{ color: '#fbbf24' }} className="flex-shrink-0 mt-0.5" />
          <p className="text-[10px] leading-relaxed flex-1" style={{ color: '#fde68a' }}>{avisoDiv}</p>
          <button onClick={() => setAvisoDiv(null)} className="flex-shrink-0" style={{ color: '#92400e' }}><X size={11} /></button>
        </div>
      )}

      {/* Lista de zonas (seleção alternativa ao mapa) */}
      <div className="space-y-1 max-h-52 overflow-y-auto">
        {feats.map(f => {
          const id = idDe(f); const on = sel.has(id); const c = classes.get(rankDe(f));
          const editando = renomeando === id;
          return (
            <div key={id} onClick={() => { if (!editando) toggleSel(id); }} role="button" tabIndex={0}
              onKeyDown={e => { if (!editando && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleSel(id); } }}
              className="w-full flex items-center gap-2 px-2 py-1 rounded text-left cursor-pointer"
              style={{ background: on ? '#241748' : '#0b1f3a', border: `1px solid ${on ? '#a78bfa' : '#2e2050'}` }}>
              {on ? <CheckSquare size={12} className="flex-shrink-0" style={{ color: '#a78bfa' }} /> : <Square size={12} className="flex-shrink-0" style={{ color: '#475569' }} />}
              <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0" style={{ background: c?.cor ?? '#94a3b8', border: '1px solid #fff' }} />
              {/* Número da zona EDITÁVEL: o que veio da importação é o número do
                  arquivo de origem, que raramente é o que a equipe usa em campo
                  (e ganha sufixo "_2" quando a zona é dividida). Clicar edita. */}
              {editando ? (
                <input autoFocus value={nomeTemp}
                  onChange={e => setNomeTemp(e.target.value)}
                  onClick={e => e.stopPropagation()}
                  onBlur={() => confirmarRenome(id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') confirmarRenome(id);
                    if (e.key === 'Escape') { setRenomeando(null); setNomeTemp(''); }
                  }}
                  className="w-16 rounded px-1 py-0.5 text-[10px] font-bold outline-none flex-shrink-0"
                  style={{ background: '#061525', color: '#e2e8f0', border: '1px solid #a78bfa' }} />
              ) : (
                <span onClick={e => { e.stopPropagation(); setRenomeando(id); setNomeTemp(id); setErro(null); }}
                  title="Clique para renumerar esta zona"
                  className="text-[10px] font-bold flex-shrink-0 px-1 rounded hover:underline"
                  style={{ color: '#e2e8f0' }}>#{id}</span>
              )}
              <span className="text-[10px] truncate" style={{ color: '#cbd5e1' }}>{c?.label ?? classeDe(f)}</span>
              <span className="text-[10px] ml-auto flex-shrink-0 tabular-nums" style={{ color: '#64748b' }}>{fmt(areaDe(f))} ha</span>
            </div>
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
