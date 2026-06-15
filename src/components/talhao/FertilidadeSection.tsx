'use client';

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import {
  getSafras, getGrades, getImportacoesLab, getTalhoes, getFazendas, getPlantio,
  getLegendas, getLegendasPorAtributo,
  type ImportacaoLab, type GradeAmostragem,
} from '@/lib/store';
import { gerarRelatorioFertilidade, type ProfundidadeRel } from '@/lib/relatorioFertilidade';
import {
  interpolar, rampaDaLegenda, gradienteCss, coordsFromBounds, extrairPoligono,
  comprimirGrid, descomprimirGrid,
  type RespInterp,
} from '@/lib/fertilidade';
import { colorirGridComLegenda, temGrid } from '@/lib/raster';
import { decodeGrid } from '@/lib/fertilidade';
import { stopsParaBackend, dominioDaLegenda, paresDaClasse } from '@/lib/legendas';
import type { Legenda } from '@/lib/legendas';
import { Play, Layers, Loader2, Eraser, AlertTriangle, Activity, Settings, BookOpen, Save, FileDown } from 'lucide-react';
import { cloudSalvarMapa, cloudCarregarMapasPorPrefixo, cloudExcluirMapasPorPrefixo, cloudAtivo } from '@/lib/cloud';
import { listar as bibListar, criar as bibCriar, type ConteudoPerfil, type ItemBiblioteca } from '@/lib/biblioteca';

const inputStyle = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;
const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const OPACIDADE = 1; // fixo 100%

type Ponto = { lng: number; lat: number; valor: number };
type MapaPronto = { resp: RespInterp; labels: GeoJSON.FeatureCollection; interpoladoEm?: string };

// Arquitetura: separamos raster (interpolação cara) de renderização (cor barata).
// A chave NÃO inclui a legenda — assim, trocar legenda/estilo apenas recolore o
// grid persistido (sem ir ao backend).
// Sufixo é `nut__prof`. Mapas anteriores (v0.21.0-0.22.x) usavam `legId__nut__prof`
// no mesmo prefixo — leitura tolera ambos (legacy = qualquer legenda salva com grid).
const ck = (nut: string, prof: string) => `${nut}__${prof}`;
const prefixoNuvem = (talhaoId: string, importacaoId: string, metodo: string, pixelM: number, modeloFixo: string) =>
  `${talhaoId}__${importacaoId}__${metodo}__${pixelM}__${modeloFixo || 'auto'}__`;
const idNuvem = (talhaoId: string, importacaoId: string, metodo: string, pixelM: number, modeloFixo: string, nut: string, prof: string) =>
  `${prefixoNuvem(talhaoId, importacaoId, metodo, pixelM, modeloFixo)}${nut}__${prof}`;

export function FertilidadeSection({ safraNome: safraProp }: { safraNome?: string } = {}) {
  const { nav, uploadedGeo, setFertilidadeOverlay, setFertilidadeLabels } = useApp();

  // safraProp (vinda da Página do Talhão) tem prioridade; sem ela, usa a ativa global.
  const safraAtiva = useMemo(() => getSafras().find(s => s.ativa) ?? null, []);
  const safraNome = safraProp ?? safraAtiva?.nome ?? '';

  const [importacoes, setImportacoes] = useState<ImportacaoLab[]>([]);
  const [importacaoId, setImportacaoId] = useState('');
  const [nutriente, setNutriente] = useState('');
  const [profundidade, setProfundidade] = useState('');
  const [metodo, setMetodo] = useState<'krige' | 'idw'>('krige');
  const [pixelM, setPixelM] = useState(20);
  const [modeloFixo, setModeloFixo] = useState('');
  const [cfgAberto, setCfgAberto] = useState(false);
  const [estado, setEstado] = useState<'idle' | 'processando' | 'pronto' | 'erro'>('idle');
  const [erro, setErro] = useState('');
  const [progresso, setProgresso] = useState<{ atual: number; total: number; nome: string } | null>(null);
  const [debugAberto, setDebugAberto] = useState(false);

  // legendas carregadas (seed garantido ao abrir)
  const [legendas, setLegendas] = useState<Legenda[]>([]);
  // qual legenda aplicar por atributo (pH, P, K...) — o usuário escolhe
  const [legendaIdPorAtributo, setLegendaIdPorAtributo] = useState<Record<string, string>>({});

  // Perfis agronômicos (Biblioteca > Perfis) — preset opcional que pré-preenche
  // o legendaIdPorAtributo todo de uma vez.
  const [perfis, setPerfis] = useState<ItemBiblioteca<ConteudoPerfil>[]>([]);
  const [perfilId, setPerfilId] = useState('');
  useEffect(() => {
    setPerfis(bibListar<ConteudoPerfil>('perfis').filter(p => p.ativo));
    const onBib = (e: Event) => {
      const d = (e as CustomEvent).detail as { slug?: string } | undefined;
      if (!d?.slug || d.slug === 'perfis') {
        setPerfis(bibListar<ConteudoPerfil>('perfis').filter(p => p.ativo));
      }
    };
    if (typeof window !== 'undefined') window.addEventListener('inv:biblioteca', onBib);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('inv:biblioteca', onBib); };
  }, []);

  // cache de mapas: chave = legenda+nutriente+profundidade
  const [cache, setCache] = useState<Record<string, MapaPronto>>({});
  const [gerandoPdf, setGerandoPdf] = useState(false);

  // Seed automático do repositório Fundação ABC + carrega legendas do store.
  // Reage a mudanças no editor de Legendas via evento custom.
  useEffect(() => {
    setLegendas(getLegendas());
    const onLeg = () => setLegendas(getLegendas());
    if (typeof window !== 'undefined') window.addEventListener('inv:legendas', onLeg);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('inv:legendas', onLeg); };
  }, []);

  useEffect(() => {
    if (nav.talhaoId && safraNome) setImportacoes(getImportacoesLab(nav.talhaoId, safraNome));
  }, [nav.talhaoId, safraNome]);

  // Carregamento inteligente (Etapa 2): ao abrir o talhão, auto-seleciona a
  // importação mais recente. Isso dispara a hidratação da nuvem abaixo, então
  // os mapas já interpolados reaparecem sozinhos (sem reprocessar). Antes o
  // seletor abria vazio e o usuário precisava reescolher a importação.
  useEffect(() => {
    if (importacaoId || importacoes.length === 0) return;
    const maisRecente = [...importacoes].sort((a, b) => (b.criadoEm ?? '').localeCompare(a.criadoEm ?? ''))[0];
    if (maisRecente) setImportacaoId(maisRecente.id);
  }, [importacoes, importacaoId]);

  const importacao = importacoes.find(i => i.id === importacaoId) ?? null;
  const importacaoMaisRecente = useMemo(
    () => [...importacoes].sort((a, b) => (b.criadoEm ?? '').localeCompare(a.criadoEm ?? ''))[0] ?? null,
    [importacoes],
  );

  const grade = useMemo<GradeAmostragem | null>(() => {
    if (!importacao || !nav.talhaoId) return null;
    return getGrades(nav.talhaoId, safraNome).find(g => g.id === importacao.gradeId) ?? null;
  }, [importacao, nav.talhaoId, safraNome]);

  const pontoPorNumero = useMemo(() => {
    const m = new Map<number, { lng: number; lat: number }>();
    (grade?.pontos ?? []).forEach(p => m.set(p.numero ?? p.ordem + 1, { lng: p.lng, lat: p.lat }));
    return m;
  }, [grade]);

  const poligono = useMemo(() => {
    const p = extrairPoligono(uploadedGeo);
    if (p) return p;
    if (!nav.talhaoId) return null;
    const t = getTalhoes().find(x => x.id === nav.talhaoId);
    if (t?.geojson) { try { return extrairPoligono(JSON.parse(t.geojson)); } catch {} }
    return null;
  }, [uploadedGeo, nav.talhaoId]);

  // só nutrientes que têm pelo menos uma legenda cadastrada
  const nutrientes = useMemo(() => {
    if (!importacao) return [] as string[];
    return importacao.elementos.filter(id => legendas.some(l => l.atributoId === id));
  }, [importacao, legendas]);

  const profundidades = useMemo(
    () => (importacao ? [...new Set(importacao.resultados.map(r => r.profundidade).filter(Boolean))] : []),
    [importacao],
  );
  const profsAll = profundidades.length ? profundidades : [profundidade];

  // helper: legenda escolhida para um atributo (default = primeira do atributo)
  function legendaDe(atributoId: string): Legenda | undefined {
    const lst = legendas.filter(l => l.atributoId === atributoId);
    if (lst.length === 0) return undefined;
    const escolhida = legendaIdPorAtributo[atributoId];
    return lst.find(l => l.id === escolhida) ?? lst[0];
  }

  // Aplica um perfil da Biblioteca: pré-preenche legendaIdPorAtributo com o
  // mapa do perfil. Não trava — o usuário pode trocar individualmente depois.
  function aplicarPerfil(id: string) {
    setPerfilId(id);
    if (!id) return;
    const p = perfis.find(x => x.id === id);
    if (!p) return;
    setLegendaIdPorAtributo({ ...(p.conteudo.legendasPorElemento ?? {}) });
  }

  // Captura escolhas atuais (legendas por nutriente + grade.padraoAmostragemId)
  // num novo Perfil da Biblioteca. Lab fica vazio (associação por nome livre
  // não é confiável); usuário edita depois se quiser.
  function salvarComoPerfil() {
    if (!importacao) { alert('Selecione uma importação antes de salvar.'); return; }
    const nome = window.prompt('Nome do perfil:', importacao.laboratorio ? `${importacao.laboratorio} — rotina` : '')?.trim();
    if (!nome) return;
    const legPorEl: Record<string, string> = {};
    for (const n of nutrientes) {
      const l = legendaDe(n);
      if (l) legPorEl[n] = l.id;
    }
    const novo = bibCriar<ConteudoPerfil>('perfis', {
      nome,
      conteudo: {
        padraoAmostragemId: grade?.padraoAmostragemId,
        legendasPorElemento: Object.keys(legPorEl).length ? legPorEl : undefined,
      },
    });
    setPerfilId(novo.id);
    alert(`Perfil "${nome}" salvo na Biblioteca > Perfis.`);
  }

  function pontosDe(nut: string, prof: string): Ponto[] {
    if (!importacao || !nut) return [];
    const out: Ponto[] = [];
    for (const r of importacao.resultados) {
      if (r.profundidade !== prof) continue;
      const v = r.valores[nut];
      if (v == null || !isFinite(v)) continue;
      const pt = pontoPorNumero.get(r.numero);
      if (pt) out.push({ lng: pt.lng, lat: pt.lat, valor: v });
    }
    return out;
  }
  function fcLabels(pts: Ponto[]): GeoJSON.FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: pts.map(p => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: { txt: fmt(p.valor) },
      })),
    };
  }

  // defaults ao trocar de importação
  useEffect(() => {
    setNutriente(nutrientes[0] ?? '');
    setProfundidade(profundidades[0] ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importacaoId]);

  // trocar contexto: hidrata da nuvem o que estiver salvo daquela combinação.
  // Aceita tanto a chave nova (`nut__prof`) quanto a antiga (`legId__nut__prof`).
  useEffect(() => {
    setCache({}); setEstado('idle'); setErro('');
    if (!nav.talhaoId || !importacaoId) return;
    const prefixo = prefixoNuvem(nav.talhaoId, importacaoId, metodo, pixelM, modeloFixo);
    (async () => {
      const carregados = await cloudCarregarMapasPorPrefixo<MapaPronto>(prefixo);
      if (carregados.length === 0) return;
      const novo: Record<string, MapaPronto> = {};
      for (const c of carregados) {
        const sufixo = c.id.slice(prefixo.length);
        const partes = sufixo.split('__');
        // novo: `${nut}__${prof}` (2 partes) · legacy: `${legId}__${nut}__${prof}` (3+ partes)
        const chave = partes.length >= 3 ? `${partes.slice(-2).join('__')}` : sufixo;
        // prefere o mais "novo" (sufixo curto). Se já houver, ignora legacy.
        if (novo[chave] && partes.length >= 3) continue;
        const dados = c.dados;
        // Grid pode vir comprimido (gzip) — descomprime p/ o render colorir local.
        if (dados.resp?.grid?.comp === 'gz') {
          try { dados.resp.grid = await descomprimirGrid(dados.resp.grid); }
          catch (e) { console.warn('[fertilidade] falha ao descomprimir grid da nuvem:', e); }
        }
        novo[chave] = dados;
      }
      setCache(novo);
    })();
  }, [importacaoId, metodo, pixelM, modeloFixo, nav.talhaoId]);

  // exibe no mapa o mapa do nutriente+profundidade selecionados.
  // Estratégia: tenta colorir local (do grid); se falhar OU não houver grid, cai
  // pro PNG do backend (presente na sessão atual; ausente nos docs antigos da nuvem).
  const legAtual = nutriente ? legendaDe(nutriente) : undefined;
  const estiloAtual = legAtual?.estilo ?? 'segmentado';
  const legHash = useMemo(() => legAtual ? JSON.stringify({ e: legAtual.estilo, i: legAtual.invertida, c: legAtual.classes }) : '', [legAtual]);
  useEffect(() => {
    if (!legAtual) { setFertilidadeOverlay(null); setFertilidadeLabels(null); return; }
    const r = cache[ck(nutriente, profundidade)];
    if (!r) { setFertilidadeOverlay(null); setFertilidadeLabels(null); return; }
    let url: string | undefined;
    if (temGrid(r.resp)) {
      try { url = colorirGridComLegenda(r.resp.grid, legAtual).dataUrl; }
      catch (e) { console.warn('[fertilidade] colorir local falhou, usando PNG do backend:', e); }
    }
    if (!url && r.resp.png) url = r.resp.png; // fallback (legacy ou sessão atual)
    if (!url) {
      console.warn('[fertilidade] mapa sem grid e sem PNG — reprocesse este nutriente.');
      setFertilidadeOverlay(null); setFertilidadeLabels(null); return;
    }
    setFertilidadeOverlay({ url, coordinates: coordsFromBounds(r.resp.bounds), opacity: OPACIDADE });
    setFertilidadeLabels(r.labels);
  // legHash garante re-render quando o usuário edita classes/cores da legenda atual
  }, [cache, nutriente, profundidade, legAtual, legHash, estiloAtual, setFertilidadeOverlay, setFertilidadeLabels]);

  useEffect(() => () => { setFertilidadeOverlay(null); setFertilidadeLabels(null); }, [setFertilidadeOverlay, setFertilidadeLabels]);

  const pontosInterp = useMemo(() => pontosDe(nutriente, profundidade), [nutriente, profundidade, importacao, pontoPorNumero]); // eslint-disable-line react-hooks/exhaustive-deps

  async function processarUm(nut: string, prof: string) {
    const leg = legendaDe(nut);
    if (!leg) throw new Error(`${nut}: sem legenda`);
    const pts = pontosDe(nut, prof);
    if (pts.length < 3) throw new Error(`${leg.simbolo} ${prof}: menos de 3 pontos`);
    // o backend devolve grid + bounds + stats + png; só usamos grid/bounds/stats.
    // O domínio e os stops vão só pra colorir o PNG do backend (ignorado aqui).
    const { dominio, stops } = rampaDaLegenda(leg);
    const resp = await interpolar({ pontos: pts, poligono: poligono!, dominio, stops, metodo, pixelM, modeloFixo: modeloFixo || null });
    const labels = fcLabels(pts);
    const interpoladoEm = new Date().toISOString();
    // Sessão guarda o PNG do backend como fallback (~10-30 KB). Quem economiza é o Firestore.
    setCache(c => ({ ...c, [ck(nut, prof)]: { resp, labels, interpoladoEm } }));
    if (nav.talhaoId && importacaoId) {
      // Joga fora o PNG (colorimos local a partir do grid) e comprime o grid
      // com gzip p/ caber no limite de 1 MB/doc do Firestore.
      const gridGz = resp.grid ? await comprimirGrid(resp.grid) : undefined;
      let dados: { resp: RespInterp; labels: GeoJSON.FeatureCollection; interpoladoEm: string } = { resp: { ...resp, png: '', grid: gridGz }, labels, interpoladoEm };
      // Salvaguarda final (não deve disparar com o teto 500×500 + gzip): se ainda
      // estourar, salva só metadados pra não falhar o write.
      const aprox = JSON.stringify(dados).length;
      if (aprox > 950_000) {
        dados = { resp: { ...resp, png: '', grid: undefined }, labels, interpoladoEm };
        console.warn(`[fertilidade] grid grande demais p/ Firestore mesmo comprimido (${Math.round(aprox/1024)} KB); salvando só metadados de ${nut} ${prof}.`);
      }
      cloudSalvarMapa(idNuvem(nav.talhaoId, importacaoId, metodo, pixelM, modeloFixo, nut, prof), dados);
    }
  }

  async function processar() {
    if (!poligono) { setErro('Limite do talhão não encontrado — abra o talhão no mapa.'); setEstado('erro'); return; }
    if (!nutriente) { setErro('Selecione uma variável.'); setEstado('erro'); return; }
    setEstado('processando'); setErro('');
    try { await processarUm(nutriente, profundidade); setEstado('pronto'); }
    catch (e) { setEstado('erro'); setErro(e instanceof Error ? e.message : 'Falha ao processar.'); }
  }

  async function processarTodos() {
    if (!poligono) { setErro('Limite do talhão não encontrado — abra o talhão no mapa.'); setEstado('erro'); return; }
    if (nutrientes.length === 0) return;
    setEstado('processando'); setErro('');
    const total = nutrientes.length * profsAll.length;
    const falhas: string[] = [];
    let backendOff = false;
    let i = 0;
    for (const prof of profsAll) {
      for (const nut of nutrientes) {
        i++;
        const sim = legendaDe(nut)?.simbolo ?? nut;
        setProgresso({ atual: i, total, nome: `${sim} ${prof}` });
        try { await processarUm(nut, prof); }
        catch (e) {
          const msg = e instanceof Error ? e.message : '';
          if (msg.includes('Interpolador desligado')) { backendOff = true; break; }
          falhas.push(`${sim} ${prof}`);
        }
      }
      if (backendOff) break;
    }
    setProgresso(null);
    if (backendOff) {
      setEstado('erro');
      setErro('Interpolador desligado nesta máquina. Veja Configurações → Interpolação.');
    } else {
      setEstado(falhas.length === total ? 'erro' : 'pronto');
      setErro(falhas.length ? `Não processou: ${falhas.join(', ')}.` : '');
    }
  }

  function limpar() {
    setCache({}); setEstado('idle'); setErro('');
    if (nav.talhaoId && importacaoId) {
      cloudExcluirMapasPorPrefixo(prefixoNuvem(nav.talhaoId, importacaoId, metodo, pixelM, modeloFixo));
    }
  }

  // Estatísticas a partir do RASTER interpolado (spec: nunca dos pontos).
  function statsRaster(resp: RespInterp): { min: number; media: number; max: number } | null {
    if (!resp.grid) return null;
    try {
      const { valores } = decodeGrid(resp.grid);
      let n = 0, soma = 0, mn = Infinity, mx = -Infinity;
      for (let i = 0; i < valores.length; i++) { const v = valores[i]; if (!isFinite(v)) continue; n++; soma += v; if (v < mn) mn = v; if (v > mx) mx = v; }
      return n ? { min: mn, media: soma / n, max: mx } : null;
    } catch { return null; }
  }

  // Gera o PDF "Layout Oficial Fertilidade V1" do atributo atual (todas as
  // profundidades já processadas, lado a lado).
  async function gerarPDF() {
    if (!legAtual || !nutriente) return;
    if (!poligono) { setErro('Limite do talhão não encontrado — abra o talhão no mapa.'); setEstado('erro'); return; }
    const profs: ProfundidadeRel[] = [];
    for (const prof of profsAll) {
      const m = cache[ck(nutriente, prof)];
      if (!m) continue;
      const st = statsRaster(m.resp);
      if (!st) continue;
      const url = temGrid(m.resp) ? colorirGridComLegenda(m.resp.grid, legAtual).dataUrl : m.resp.png;
      if (!url) continue;
      profs.push({ profundidade: prof, rasterPng: url, bounds: m.resp.bounds, valores: m.labels, stats: st });
    }
    if (profs.length === 0) { setErro('Processe o(s) mapa(s) antes de gerar o PDF.'); setEstado('erro'); return; }

    const fz = getFazendas().find(f => f.id === nav.fazendaId);
    const cultura = nav.talhaoId ? getPlantio(nav.talhaoId, safraNome) : '';
    const ts = profsAll.map(p => cache[ck(nutriente, p)]?.interpoladoEm).filter(Boolean).sort().pop()
      ?? importacao?.criadoEm ?? new Date().toISOString();
    const dataInterp = new Date(ts).toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' });

    setGerandoPdf(true); setErro('');
    try {
      await gerarRelatorioFertilidade({
        fazenda: nav.fazenda, produtor: nav.produtor, talhao: nav.talhao, safra: safraNome,
        cultura, areaHa: nav.area, municipio: fz?.municipio ?? '', estado: fz?.estado ?? '',
        atributo: legAtual.atributo, simbolo: legAtual.simbolo, metodo: legAtual.metodo ?? null,
        fonte: legAtual.fonte, unidade: legAtual.unidade, legenda: legAtual,
        dataInterpolacao: dataInterp, poligono, profundidades: profs, satelite: true, corLimite: '#ffffff',
      });
    } catch (e) {
      setEstado('erro'); setErro(e instanceof Error ? e.message : 'Falha ao gerar o PDF.');
    } finally {
      setGerandoPdf(false);
    }
  }

  if (!safraNome) return <div className="px-6 py-4"><Aviso texto="Defina uma safra para gerar o mapa de fertilidade." /></div>;
  if (importacoes.length === 0) return <div className="px-6 py-4"><Aviso texto="Importe resultados de laboratório (seção acima) — o mapa de fertilidade é gerado a partir deles." /></div>;

  const processando = estado === 'processando';
  const mapasSalvos = Object.keys(cache).length;
  // Etapa 3: os mapas em tela são de uma importação mais antiga que a disponível
  // → podem estar desatualizados (o usuário reimportou laudo depois).
  const desatualizado = !!(
    importacao && mapasSalvos > 0 && importacaoMaisRecente &&
    importacaoMaisRecente.id !== importacao.id &&
    (importacaoMaisRecente.criadoEm ?? '') > (importacao.criadoEm ?? '')
  );
  const stats = (nutriente && profundidade) ? cache[ck(nutriente, profundidade)]?.resp.stats : undefined;
  const totalMapas = nutrientes.length * profsAll.length;
  const feitosNaProf = nutrientes.filter(n => {
    const l = legendaDe(n);
    return l && cache[ck(n, profundidade)];
  }).length;

  // legendas disponíveis pro atributo atual (pra o dropdown)
  const legendasDoAtributo = nutriente ? getLegendasPorAtributo(nutriente) : [];

  return (
    <div className="px-4 py-3 space-y-3">
      {!cloudAtivo() && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg" style={{ background: '#2d1a00', border: '1px solid #92400e' }}>
          <AlertTriangle size={13} style={{ color: '#fbbf24' }} className="flex-shrink-0 mt-0.5" />
          <p className="text-[10px]" style={{ color: '#fbbf24' }}>
            <strong>Nuvem inativa nesta sessão</strong> — os mapas interpolados <strong>não estão sendo salvos</strong> e precisam ser reprocessados ao reabrir. Verifique o Firebase (login anônimo habilitado + regras do Firestore). Veja o console (F12) por mensagens "[nuvem]".
          </p>
        </div>
      )}

      {/* Importação */}
      <div>
        <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Importação (laboratório / campanha)</label>
        <select value={importacaoId} onChange={e => setImportacaoId(e.target.value)} className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
          <option value="">Selecione a importação…</option>
          {importacoes.map(i => <option key={i.id} value={i.id}>{i.laboratorio}{i.campanha ? ` · ${i.campanha}` : ''} · {i.resultados.length} amostras</option>)}
        </select>
        {mapasSalvos > 0 && (
          <p className="text-[10px] mt-1 flex items-center gap-1" style={{ color: '#86efac' }}>
            <Layers size={10} /> {mapasSalvos} {mapasSalvos === 1 ? 'mapa salvo' : 'mapas salvos'} na nuvem — carregam sem reprocessar.
          </p>
        )}
      </div>

      {/* Desatualizado (Etapa 3): existe importação mais recente que a destes mapas. */}
      {desatualizado && importacaoMaisRecente && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg" style={{ background: '#2d1a00', border: '1px solid #92400e' }}>
          <AlertTriangle size={13} style={{ color: '#fbbf24' }} className="flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-[10px]" style={{ color: '#fbbf24' }}>
              Estes mapas são de uma importação anterior. Há uma mais recente
              {importacaoMaisRecente.campanha ? ` (${importacaoMaisRecente.campanha})` : ''} — podem estar desatualizados.
            </p>
            <button onClick={() => setImportacaoId(importacaoMaisRecente.id)}
              className="mt-1 px-2 py-1 rounded text-[10px] font-bold text-white"
              style={{ background: 'var(--invicta-blue-mid)' }}>
              Ir para a mais recente e regenerar
            </button>
          </div>
        </div>
      )}

      {/* Perfil agronômico — preset opcional (Biblioteca > Perfis). */}
      <div>
        <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Perfil (preenche legendas)</label>
        <div className="flex gap-1">
          <select value={perfilId} onChange={e => aplicarPerfil(e.target.value)}
            className="flex-1 rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
            <option value="">— Manual (sem perfil)</option>
            {perfis.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          <button onClick={salvarComoPerfil} disabled={!importacao}
            title="Salvar escolhas atuais como Perfil"
            className="px-2 py-1.5 rounded text-[10px] font-bold flex items-center gap-1 disabled:opacity-40"
            style={{ background: 'var(--invicta-blue-mid)', color: '#fff' }}>
            <Save size={11} /> Salvar
          </button>
        </div>
      </div>

      {importacao && (
        <>
          {/* Configurações da interpolação (recolhível) */}
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #1a3a6b' }}>
            <button onClick={() => setCfgAberto(v => !v)} className="w-full flex items-center justify-between px-2.5 py-1.5 text-[10px] font-semibold" style={{ background: '#061525', color: '#93c5fd' }}>
              <span className="flex items-center gap-1"><Settings size={12} /> Configurações da interpolação</span>
              <span style={{ color: '#64748b' }}>{metodo === 'idw' ? 'IDW' : `Krigagem · ${modeloFixo || 'auto'}`} · {pixelM} m {cfgAberto ? '▴' : '▾'}</span>
            </button>
            {cfgAberto && (
              <div className="px-2.5 py-2 space-y-2" style={{ background: '#061525' }}>
                <div>
                  <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>Interpolador</label>
                  <div className="flex gap-1">
                    {(['krige', 'idw'] as const).map(mt => (
                      <button key={mt} onClick={() => setMetodo(mt)} className="flex-1 py-1 rounded text-[10px] font-bold"
                        style={{ background: metodo === mt ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: metodo === mt ? '#fff' : '#64748b' }}>
                        {mt === 'krige' ? 'Krigagem' : 'IDW'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>Pixel</label>
                    <select value={pixelM} onChange={e => setPixelM(Number(e.target.value))} className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle}>
                      {[5, 10, 20].map(p => <option key={p} value={p}>{p} × {p} m{p === 20 ? ' (padrão)' : ''}</option>)}
                    </select>
                  </div>
                  {metodo === 'krige' && (
                    <div className="flex-1">
                      <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>Variograma</label>
                      <select value={modeloFixo} onChange={e => setModeloFixo(e.target.value)} className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle}>
                        <option value="">Auto (melhor)</option>
                        <option value="spherical">Esférico</option>
                        <option value="exponential">Exponencial</option>
                        <option value="gaussian">Gaussiano</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Processar */}
          {!poligono && <Aviso texto="Limite do talhão não carregado no mapa." />}
          <button onClick={processarTodos} disabled={processando || !poligono || nutrientes.length === 0}
            className="w-full py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1.5"
            style={{ background: (processando || !poligono || nutrientes.length === 0) ? '#1a3a6b' : 'var(--invicta-green-dark)', opacity: (!poligono || nutrientes.length === 0) ? 0.6 : 1 }}>
            {processando && progresso
              ? <><Loader2 size={13} className="animate-spin" /> {progresso.nome} ({progresso.atual}/{progresso.total})</>
              : <><Layers size={13} /> Processar tudo ({totalMapas} mapas)</>}
          </button>
          <button onClick={processar} disabled={processando || !poligono || !nutriente}
            className="w-full py-1 rounded text-[10px] font-semibold flex items-center justify-center gap-1"
            style={{ background: '#1a3a6b', color: '#93c5fd', opacity: (processando || !poligono || !nutriente) ? 0.6 : 1 }}>
            <Play size={10} /> Processar só o selecionado
          </button>

          {estado === 'erro' && <p className="text-[10px]" style={{ color: '#f87171' }}>{erro}</p>}
          {erro && estado !== 'erro' && <p className="text-[10px]" style={{ color: '#fbbf24' }}>{erro}</p>}

          {/* Profundidade */}
          {profundidades.length > 0 && (
            <div>
              <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>Profundidade</label>
              <div className="flex gap-1">
                {profundidades.map(p => (
                  <button key={p} onClick={() => setProfundidade(p)} className="flex-1 py-1 rounded text-[10px] font-bold"
                    style={{ background: profundidade === p ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: profundidade === p ? '#fff' : '#64748b' }}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Variáveis */}
          {nutrientes.length === 0 ? (
            <p className="text-[10px]" style={{ color: '#fbbf24' }}>Nenhuma variável desta importação tem legenda cadastrada.</p>
          ) : (
            <div>
              <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>
                Variável no mapa {feitosNaProf > 0 && <span style={{ color: '#475569' }}>· {feitosNaProf}/{nutrientes.length} prontos</span>}
              </label>
              <div className="flex flex-wrap gap-1">
                {nutrientes.map(id => {
                  const sel = id === nutriente;
                  const l = legendaDe(id);
                  const feito = l && !!cache[ck(id, profundidade)];
                  return (
                    <button key={id} onClick={() => setNutriente(id)} className="px-2 py-1 rounded text-[10px] font-bold"
                      style={{ background: sel ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: sel ? '#fff' : (feito ? '#86efac' : '#64748b') }}>
                      {l?.simbolo ?? id}{feito ? ' ✓' : ''}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] mt-1" style={{ color: '#94a3b8' }}>
                <strong style={{ color: pontosInterp.length >= 3 ? '#86efac' : '#fbbf24' }}>{pontosInterp.length}</strong> pontos
                {legAtual ? ` · ${legAtual.atributo} (${legAtual.unidade})` : ''}
              </p>
            </div>
          )}

          {/* Seletor de Legenda para o atributo atual */}
          {nutriente && legendasDoAtributo.length > 0 && (
            <div>
              <label className="text-[10px] font-semibold block mb-1 flex items-center gap-1" style={{ color: '#64748b' }}>
                <BookOpen size={11} /> Legenda
              </label>
              <select
                value={legAtual?.id ?? ''}
                onChange={e => setLegendaIdPorAtributo(m => ({ ...m, [nutriente]: e.target.value }))}
                className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle}
              >
                {legendasDoAtributo.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.nome}{l.metodo ? ` · ${l.metodo}` : ''}
                  </option>
                ))}
              </select>
              {legendasDoAtributo.length === 1 && (
                <p className="text-[9px] mt-0.5" style={{ color: '#475569' }}>Cadastre outras fontes em Configurações → Legendas (em breve).</p>
              )}
            </div>
          )}

          {/* Mapa exibido: detalhes + barra de legenda */}
          {stats && legAtual && (
            <div className="space-y-2 p-2.5 rounded-lg" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[10px]" style={{ color: stats.modelo === 'idw' ? '#93c5fd' : '#86efac' }}>
                  <Activity size={12} />
                  {stats.modelo === 'idw' ? `IDW · ${stats.n} pts` : `Krigagem · ${stats.modelo} · ${stats.n} pts`}
                </div>
                <button onClick={limpar} title="Limpar mapas" className="flex items-center gap-1 text-[10px]" style={{ color: '#93c5fd' }}>
                  <Eraser size={11} /> Limpar
                </button>
              </div>

              <div className="text-[9px] leading-relaxed" style={{ color: '#64748b' }}>
                pixel <strong style={{ color: '#94a3b8' }}>{stats.pixel_m} m</strong> · grade {stats.nx}×{stats.ny}
                {stats.variograma && <> · alcance <strong style={{ color: '#94a3b8' }}>{stats.variograma.alcance_m} m</strong> · patamar {fmt(stats.variograma.patamar)} · pepita {fmt(stats.variograma.pepita)}</>}
                {stats.rmse != null && <> · RMSE {stats.rmse}</>}
              </div>

              {/* Barra de legenda (largura visual por classe, conforme spec) */}
              <BarraLegenda leg={legAtual} />
              <p className="text-[9px]" style={{ color: '#64748b' }}>{legAtual.fonte} · {legAtual.atributo}{legAtual.metodo ? ` (${legAtual.metodo})` : ''} · {legAtual.unidade}</p>

              {/* Gerar PDF (Layout Oficial Fertilidade V1 — todas as profundidades do atributo) */}
              <button onClick={gerarPDF} disabled={gerandoPdf}
                className="w-full mt-1 py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
                style={{ background: 'var(--invicta-blue-mid)' }}>
                {gerandoPdf ? <><Loader2 size={13} className="animate-spin" /> Gerando PDF…</> : <><FileDown size={13} /> Gerar PDF (Fertilidade)</>}
              </button>
            </div>
          )}

          {/* Debug temporário — ajuda a diagnosticar discrepâncias entre valor e cor */}
          {legAtual && cache[ck(nutriente, profundidade)] && (
            <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #1a3a6b' }}>
              <button onClick={() => setDebugAberto(v => !v)} className="w-full flex items-center justify-between px-2.5 py-1.5 text-[10px] font-semibold" style={{ background: '#061525', color: '#fbbf24' }}>
                <span>🔬 Debug — valores vs cores</span>
                <span>{debugAberto ? '▴' : '▾'}</span>
              </button>
              {debugAberto && (
                <DebugBox leg={legAtual} resp={cache[ck(nutriente, profundidade)].resp} pontos={pontosInterp} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Barra horizontal com as classes (faixas de cor com largura visual fixa) +
// rótulos das bordas (limites) abaixo de cada divisão.
function BarraLegenda({ leg }: { leg: Legenda }) {
  return (
    <div>
      <div className="relative h-4 rounded overflow-hidden"
        style={{ border: '1px solid rgba(255,255,255,0.1)', background: gradienteCss(leg) }}
        title={leg.classes.map(c => `${c.nome}${c.valorMin != null ? ` · >${c.valorMin}` : ''}${c.valorMax != null ? ` · ≤${c.valorMax}` : ''}`).join('  |  ')} />
      <div className="relative h-3 text-[8px]" style={{ color: '#cbd5e1' }}>
        {(() => {
          let acumulado = 0;
          const bordas: Array<{ valor: number; pos: number }> = [];
          for (let i = 0; i < leg.classes.length - 1; i++) {
            acumulado += leg.classes[i].larguraVisual;
            const b = leg.classes[i].valorMax;
            if (b != null) bordas.push({ valor: b, pos: acumulado });
          }
          return bordas.map(b => (
            <span key={b.valor} className="absolute" style={{ left: `${b.pos}%`, transform: 'translateX(-50%)' }}>{fmt(b.valor)}</span>
          ));
        })()}
      </div>
    </div>
  );
}

// ============================================================
// DEBUG — ajuda a diagnosticar discrepâncias entre valor e cor
// ============================================================
function DebugBox({ leg, resp, pontos }: { leg: Legenda; resp: RespInterp; pontos: Array<{ lng: number; lat: number; valor: number }> }) {
  const { dominio, stops } = stopsParaBackend(leg);
  const [vmin, vmax] = dominio;
  let stats: { rows: number; cols: number; min: number; max: number; media: number; n: number } | null = null;
  if (resp.grid) {
    try {
      const { valores, rows, cols } = decodeGrid(resp.grid);
      let n = 0, soma = 0, vmin2 = Infinity, vmax2 = -Infinity;
      for (let i = 0; i < valores.length; i++) {
        const v = valores[i];
        if (!isFinite(v)) continue;
        n++; soma += v;
        if (v < vmin2) vmin2 = v;
        if (v > vmax2) vmax2 = v;
      }
      stats = { rows, cols, min: vmin2, max: vmax2, media: soma / Math.max(1, n), n };
    } catch (e) { console.warn('debug decode falhou:', e); }
  }

  // Pra cada ponto: qual cor o pipeline mapearia
  function corDoValor(v: number): string {
    const span = (vmax - vmin) || 1;
    const t = Math.max(0, Math.min(1, (v - vmin) / span));
    // mesma lógica do interpolarCor mas em hex
    if (t <= stops[0][0]) return rgbHex(stops[0][1]);
    if (t >= stops[stops.length - 1][0]) return rgbHex(stops[stops.length - 1][1]);
    let i = 0;
    while (i < stops.length - 1 && stops[i + 1][0] < t) i++;
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    const k = (t - t0) / (t1 - t0 || 1);
    return rgbHex([
      Math.round(c0[0] + (c1[0] - c0[0]) * k),
      Math.round(c0[1] + (c1[1] - c0[1]) * k),
      Math.round(c0[2] + (c1[2] - c0[2]) * k),
    ]);
  }

  return (
    <div className="px-2.5 py-2 space-y-2 text-[10px]" style={{ background: '#061525', color: '#cbd5e1' }}>
      <div>
        <strong style={{ color: '#fbbf24' }}>Legenda:</strong> {leg.nome} · invertida={String(leg.invertida)} · estilo={leg.estilo ?? 'segmentado'}
      </div>
      <div>
        <strong style={{ color: '#fbbf24' }}>Domínio:</strong> [{fmt(vmin)} , {fmt(vmax)}] · span={fmt(vmax - vmin)}
      </div>
      <div>
        <strong style={{ color: '#fbbf24' }}>Stops ({stops.length}):</strong>
        <div className="space-y-0.5 mt-1">
          {stops.map(([t, [r, g, b]], i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span style={{ display: 'inline-block', width: 18, height: 10, background: `rgb(${r},${g},${b})`, border: '1px solid rgba(255,255,255,0.15)' }} />
              <span style={{ color: '#94a3b8' }}>t={t.toFixed(4)}</span>
              <span style={{ color: '#475569' }}>·</span>
              <span style={{ color: '#cbd5e1' }}>{rgbHex([r, g, b])}</span>
            </div>
          ))}
        </div>
      </div>
      {stats && (
        <div>
          <strong style={{ color: '#fbbf24' }}>Grid bruto ({stats.rows}×{stats.cols}, {stats.n} pixels válidos):</strong>
          <div>min={fmt(stats.min)} · max={fmt(stats.max)} · média={fmt(stats.media)}</div>
        </div>
      )}
      {!resp.grid && <div style={{ color: '#f87171' }}>⚠ Sem grid (mapa legacy — reprocesse para diagnóstico completo).</div>}
      <div>
        <strong style={{ color: '#fbbf24' }}>Pontos amostrais ({pontos.length}):</strong>
        <div className="space-y-0.5 mt-1 max-h-44 overflow-y-auto">
          {pontos.slice().sort((a, b) => a.valor - b.valor).map((p, i) => {
            const cor = corDoValor(p.valor);
            return (
              <div key={i} className="flex items-center gap-1.5">
                <span style={{ display: 'inline-block', width: 18, height: 10, background: cor, border: '1px solid rgba(255,255,255,0.15)' }} />
                <span style={{ color: '#94a3b8' }}>V={fmt(p.valor)}</span>
                <span style={{ color: '#475569' }}>·</span>
                <span style={{ color: '#cbd5e1' }}>{cor}</span>
              </div>
            );
          })}
        </div>
      </div>
      <button onClick={() => {
        // log tudo no console pra inspeção
        // eslint-disable-next-line no-console
        console.log('[fertilidade/debug]', { leg, dominio, stops, stats, primeirosValores: resp.grid ? Array.from(decodeGrid(resp.grid).valores.slice(0, 20)) : null });
      }} className="w-full py-1 rounded text-[10px] font-semibold" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
        Logar no console (F12)
      </button>
    </div>
  );
}

function rgbHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
}

function Aviso({ texto }: { texto: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: '#2d1a00', border: '1px solid #92400e' }}>
      <AlertTriangle size={14} style={{ color: '#fbbf24' }} className="flex-shrink-0 mt-0.5" />
      <p className="text-[10px]" style={{ color: '#fbbf24' }}>{texto}</p>
    </div>
  );
}
