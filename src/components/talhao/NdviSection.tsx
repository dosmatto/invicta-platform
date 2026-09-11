'use client';

// Aba NDVI / Satélite (MSR) — fluxo IV1 (spec Índices Vegetativos):
// PRÉVIA RGB PRIMEIRO. A busca lista CARDS com miniatura RGB do talhão (leve);
// clicar abre a CONFERÊNCIA (RGB fino no mapa + dados + rejeitar); o NDVI só é
// calculado quando o usuário confirma — e só é salvo quando ele clica "Manter".
// Fontes: Sentinel-2 (10 m, nuvem padrão 5%) e CBERS-4A (2 m, pan-sharpened,
// sem metadado de nuvem) — ou "Todos" (lista as duas juntas).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { getTalhoes } from '@/lib/store';
import { SeletorLegenda, legendasDoModulo, usePrefLegenda } from './SeletorLegenda';
import {
  extrairPoligono, coordsFromBounds, comprimirGrid, descomprimirGrid,
  decodeGrid, exportarGeotiff, type Grid,
} from '@/lib/fertilidade';
import { colorirGrid } from '@/lib/raster';
import { faixaPercentis } from '@/lib/quantis';
import { rampaVisualStops, respeitarPadraoHomonima } from '@/lib/legendas';
import {
  listarCenasNdvi, buscarImagemSatelite, buscarIndices, indicesDisponiveis,
  buscarNdviSentinel, baixarImagemGeotiff, avaliarCenas, MAX_AVALIAR,
  type RespNdvi, type CenaDisponivel, type FonteNdvi, type AvaliacaoCena,
} from '@/lib/msr';
import { GraficoCenas, type ItemGrafico } from './GraficoCenas';
import { avaliarRegras, melhoresPorJanela, REGRAS_PADRAO } from '@/lib/msrSelecao';
import { retanguloDe } from '@/lib/janela';
import { cloudSalvarMapa, cloudListarMapasMeta, cloudCarregarMapa, cloudExcluirMapasPorPrefixo, cloudExcluirMapas, cloudPodeGravar } from '@/lib/cloud';
import { BotaoMonitorar } from './MonitorSatelite';
import { getRejeitadasLocal, carregarRejeitadas, marcarRejeitada } from '@/lib/cenaEstados';
import { getFontesLocal, carregarFontes, marcarFonte, marcarFontes, idFonte } from '@/lib/ndviFontes';
import { onCaiuParaNuvem } from '@/lib/interpUrl';
import { pode, emailUsuario } from '@/lib/empresa';
import type { Legenda } from '@/lib/legendas';
import { ComposicaoTemporalPanel, ListaComposicoes } from './ComposicaoTemporalPanel';
import { getComposicoes } from '@/lib/store';
import { listarNdviSalvos, carregarGridNdvi, type NdviCamadaMeta } from '@/lib/meap/gerar';
import {
  Satellite, Loader2, AlertTriangle, Image as ImageIcon, Contrast, Check, Star,
  Eye, XCircle, RotateCcw, Play, X, Layers3, Download, Trash2, Target,
} from 'lucide-react';

import { inputStyle } from '@/constants/ui';
const fmt2 = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
// Período padrão da busca (todas as fontes): "De" = 3 meses atrás, "Até" = hoje.
const mesesAtras = (n: number) => { const d = new Date(); d.setMonth(d.getMonth() - n); return isoDate(d); };
const ddmmyy = (s?: string | null) => s ? new Date(s + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
const OPACIDADE = 1;

// resp + metadados do índice (fórmula/bandas/máscara/usuário — spec seção 13).
// O grid é OPCIONAL: o autoload traz só metadados (leve); o raster da cena
// selecionada é baixado sob demanda (nuvemId/nuvemEm → cloudCarregarMapa).
type RespNdviLocal = Omit<RespNdvi, 'grid'> & { grid?: Grid };
type MapaNdvi = {
  resp: RespNdviLocal; criadoEm: string;
  indice?: string; formula?: string; bandas?: string[]; mascara?: boolean;
  usuario?: string; salvoEm?: string;
  nuvemId?: string; nuvemEm?: string | null;
};
type Imagem = { bounds: [number, number, number, number]; png: string };
type FonteBusca = FonteNdvi | 'todos';
type Cand = CenaDisponivel & { fonte: FonteNdvi };

const pixelDe = (fonte: FonteNdvi) => (fonte === 'cbers' ? 2 : 10);            // índices + imagem final
const PIXEL_THUMB: Record<FonteNdvi, number> = { sentinel: 24, cbers: 20 };    // miniatura do card
const PIXEL_PREVIA: Record<FonteNdvi, number> = { sentinel: 10, cbers: 6 };    // conferência
const NUVEM_PADRAO = 5;
// Teto de miniaturas por busca. Cada uma é uma leitura de COG no servidor; sem
// teto, um período de 3 anos (300+ cenas) viraria 300 chamadas de uma vez e
// derrubaria o backend. As demais mostram o ícone até entrarem em cena.
const MAX_THUMBS = 24;
// Acima disso, os cartões deixam de ser navegáveis e a tela abre no gráfico.
const CARTOES_DEMAIS = 40;
// Período longo precisa de teto alto no catálogo (o padrão do servidor é 30, que
// truncava 3 anos em silêncio). Curto continua barato.
const limiteBusca = (dataIni: string, dataFim: string) =>
  (Date.parse(dataFim) - Date.parse(dataIni)) / 86400000 > 190 ? 800 : 60;

const prefixoNuvem = (talhaoId: string, fonte: FonteNdvi) => `${talhaoId}__ndvi${fonte === 'cbers' ? 'cbers' : ''}__`;
const idNuvem = (talhaoId: string, fonte: FonteNdvi, data: string, indice = 'NDVI') =>
  `${prefixoNuvem(talhaoId, fonte)}${indice}__${data}`;
// Chave da CAMADA salva, no formato de meap/gerar.ts — é por ela que a marcação
// de "fonte de análise" identifica o que entra nos cálculos (lib/ndviFontes.ts).
const chaveCamada = (fonte: FonteNdvi, data: string, indice: string) =>
  `ndvi_${fonte === 'cbers' ? 'cbers' : 's2'}__${indice}__${data}`;
// chave de RESULTADO (fonte:data:INDICE) e de CENA (fonte:data — thumbs/prévias)
const chaveDe = (fonte: FonteNdvi, data: string | null, indice = 'NDVI') => `${fonte}:${data ?? ''}:${indice}`;
const chaveCena = (fonte: FonteNdvi, data: string | null) => `${fonte}:${data ?? ''}`;
const ROTULO_FONTE: Record<FonteNdvi, string> = { sentinel: 'Sentinel-2', cbers: 'CBERS-4A' };

// Cenas rejeitadas: persistidas na NUVEM por talhão (IV4) — ver lib/cenaEstados.

// p2–p98 de um grid (o contraste realçado). A faixa em si vive em lib/quantis,
// para a Composição Temporal usar exatamente a mesma escala.
const percentis = (grid: Grid, pLo: number, pHi: number): [number, number] =>
  faixaPercentis(decodeGrid(grid).valores, pLo, pHi);

export function NdviSection({ safraNome }: { safraNome?: string } = {}) {
  const { nav, uploadedGeo, boundsTela, setFertilidadeOverlay, setFertilidadeLabels } = useApp();
  // IV5 — organização em ABAS (spec Composição Temporal): buscar & processar |
  // composição temporal | camadas salvas. O fluxo existente vive na 1ª.
  const [abaIv, setAbaIv] = useState<'buscar' | 'comp' | 'salvas'>('buscar');

  const hoje = useMemo(() => new Date(), []);
  const [fonteBusca, setFonteBusca] = useState<FonteBusca>('sentinel');
  const [dataIni, setDataIni] = useState(() => mesesAtras(3));
  const [dataFim, setDataFim] = useState(isoDate(hoje));
  const [nuvemMax, setNuvemMax] = useState(NUVEM_PADRAO);

  const [estado, setEstado] = useState<'idle' | 'listando' | 'erro'>('idle');
  const [erro, setErro] = useState('');
  // O interpolador desta máquina estava desligado e a chamada foi resgatada pela
  // nuvem: informa, senão o usuário não entende por que "às vezes demora mais".
  const [caiuParaNuvem, setCaiuParaNuvem] = useState(false);
  useEffect(() => onCaiuParaNuvem(setCaiuParaNuvem), []);
  const [sugerirNuvem, setSugerirNuvem] = useState(0);        // sugestão de ampliar a nuvem (0 = sem)
  const [candidatos, setCandidatos] = useState<Cand[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});     // chave → dataURL | 'loading' | 'err'
  const thumbsRef = useRef(thumbs); thumbsRef.current = thumbs;
  const [previas, setPrevias] = useState<Record<string, Imagem>>({});   // conferência (RGB fino)
  const [previaDe, setPreviaDe] = useState<Cand | null>(null);          // card em conferência
  const [selIdx, setSelIdx] = useState<Record<string, boolean>>({ NDVI: true }); // índices marcados p/ processar
  const [carregandoPrevia, setCarregandoPrevia] = useState(false);
  const [vistas, setVistas] = useState<Record<string, boolean>>({});    // visualizadas (sessão)
  const [rejeitadas, setRejeitadas] = useState<Record<string, boolean>>({});
  // Camadas marcadas como FONTE DE ANÁLISE. Manter guarda; marcar aqui é o que
  // libera a camada para Zonas de Manejo, Comparador, Produtividade e IA.
  const [fontes, setFontes] = useState<Record<string, boolean>>({});

  const [cenas, setCenas] = useState<Record<string, MapaNdvi>>({});     // NDVI calculado, chave fonte:data
  const [selKey, setSelKey] = useState('');
  const [carregandoId, setCarregandoId] = useState('');
  const [modo, setModo] = useState<'ndvi' | 'imagem'>('ndvi');
  const [contraste, setContraste] = useState(false);
  const [imagens, setImagens] = useState<Record<string, Imagem>>({});   // cor verdadeira FINA por chave
  const [carregandoImg, setCarregandoImg] = useState(false);
  const [salvos, setSalvos] = useState<Record<string, boolean>>({});    // mantidas na nuvem, por chave

  // ── Gráfico de seleção de cenas (pendência 40) ─────────────────────────────
  // O catálogo só informa a nuvem da CENA INTEIRA (~110 km). A avaliação lê a
  // máscara de nuvem recortada NO TALHÃO e responde o que decide a escolha.
  const [vista, setVista] = useState<'grafico' | 'cartoes'>('cartoes');
  const [avaliacoes, setAvaliacoes] = useState<Record<string, AvaliacaoCena>>({});  // chave de CENA
  const [marcadas, setMarcadas] = useState<Record<string, boolean>>({});            // idem
  const [avaliando, setAvaliando] = useState(false);
  const [processandoLote, setProcessandoLote] = useState(false);
  const [progresso, setProgresso] = useState<{ feitas: number; total: number } | null>(null);
  const regras = REGRAS_PADRAO;
  // Desligar o monitoramento não pode apagar nada sozinho: são meses de
  // processamento. Pergunta, contando quantas camadas estão em jogo.
  const [confirmarApagar, setConfirmarApagar] = useState<number | null>(null);
  const [apagando, setApagando] = useState(false);

  // Legenda NDVI (seletor) → versão contínua.
  const legendasNdvi = useMemo(() => legendasDoModulo('ndvi'), []);
  const [legNdviId, escolherLegNdvi] = usePrefLegenda('inv_leg_pref_ndvi');
  const legNdvi: Legenda | undefined = useMemo(() => {
    const alvo = legendasNdvi.find(l => l.id === legNdviId);
    // Preferência apontando para a gêmea não-padrão (mesmo nome) → vale a padrão.
    return alvo ? respeitarPadraoHomonima(legendasNdvi, alvo) : legendasNdvi[0];
  }, [legendasNdvi, legNdviId]);
  const corStops = useMemo(() => legNdvi ? rampaVisualStops({ ...legNdvi, estilo: 'continuo' }) : [], [legNdvi]);
  const gradCss = useMemo(
    () => corStops.length ? `linear-gradient(to right, ${corStops.map(([p, [r, g, b]]) => `rgb(${r},${g},${b}) ${(p * 100).toFixed(1)}%`).join(', ')})` : 'transparent',
    [corStops],
  );

  const poligono = useMemo(() => {
    const p = extrairPoligono(uploadedGeo);
    if (p) return p;
    if (!nav.talhaoId) return null;
    const t = getTalhoes().find(x => x.id === nav.talhaoId);
    if (t?.geojson) { try { return extrairPoligono(JSON.parse(t.geojson)); } catch {} }
    return null;
  }, [uploadedGeo, nav.talhaoId]);

  const sel = selKey ? cenas[selKey] : undefined;
  const fonteSel = (selKey.split(':')[0] || 'sentinel') as FonteNdvi;
  const dataSel = selKey.split(':')[1] || '';
  const indSel = selKey.split(':')[2] || 'NDVI';
  const chaveCenaSel = chaveCena(fonteSel, dataSel);

  // NDVI tem domínio fixo 0–1 (toggle de contraste); os demais índices variam
  // por cena → sempre esticados p2–p98 (o rodapé mostra o intervalo real).
  const dominio = useMemo<[number, number]>(() => {
    const grid = sel?.resp.grid;
    if (!grid) return [0, 1];
    return (contraste || indSel !== 'NDVI') ? percentis(grid, 2, 98) : [0, 1];
  }, [sel, contraste, indSel]);

  const idRejeicao = (c: Cand) => `${nav.talhaoId}:${c.fonte}:${c.id}`;

  function trocarFonte(f: FonteBusca) {
    if (f === fonteBusca) return;
    setFonteBusca(f);
    setCandidatos([]); setThumbs({}); setPreviaDe(null); setErro(''); setSugerirNuvem(0);
    setDataIni(mesesAtras(3)); setDataFim(isoDate(new Date()));
  }

  // Autoload das cenas MANTIDAS (as duas fontes) ao abrir o talhão — SÓ os
  // METADADOS (KBs). O raster da cena selecionada é baixado sob demanda no
  // efeito abaixo, com cache local — abrir a aba não baixa mais megabytes.
  useEffect(() => {
    setCenas({}); setImagens({}); setPrevias({}); setCandidatos([]); setThumbs({});
    setSelKey(''); setPreviaDe(null); setEstado('idle'); setErro(''); setSalvos({});
    setRejeitadas(getRejeitadasLocal());
    setFontes(getFontesLocal());
    if (!nav.talhaoId) return;
    void carregarRejeitadas(nav.talhaoId).then(setRejeitadas).catch(() => {});
    void carregarFontes(nav.talhaoId).then(setFontes).catch(() => {});
    (async () => {
      const fontes: FonteNdvi[] = ['sentinel', 'cbers'];
      const listas = await Promise.all(fontes.map(f => cloudListarMapasMeta(prefixoNuvem(nav.talhaoId!, f)).catch(() => [])));
      const novo: Record<string, MapaNdvi> = {};
      fontes.forEach((f, i) => {
        const pref = prefixoNuvem(nav.talhaoId!, f);
        for (const m of listas[i]) {
          const data = m.cena?.data;
          if (!data || !m.bounds) continue;
          // índice vem do id (…__INDICE__data); mapas antigos são NDVI
          const indice = m.indice ?? m.id.slice(pref.length).split('__')[0] ?? 'NDVI';
          novo[chaveDe(f, data, indice)] = {
            resp: {
              bounds: m.bounds,
              stats: (m.stats ?? { n: 0, min: null, max: null, media: null, nx: 0, ny: 0, pixel_m: 0, indice }) as RespNdvi['stats'],
              cena: (m.cena ?? { id: '', data }) as RespNdvi['cena'],
            },
            criadoEm: m.criadoEm ?? '', indice,
            formula: m.formula ?? undefined, bandas: m.bandas ?? undefined,
            mascara: m.mascara ?? undefined, usuario: m.usuario ?? undefined,
            salvoEm: m.salvoEm ?? undefined,
            nuvemId: m.id, nuvemEm: m.atualizadoEm,
          };
        }
      });
      if (Object.keys(novo).length === 0) return;
      setCenas(novo);
      setSalvos(Object.fromEntries(Object.keys(novo).map(k => [k, true])));
      const maisRecente = Object.keys(novo).sort((a, b) => a.split(':')[1].localeCompare(b.split(':')[1])).pop();
      if (maisRecente) setSelKey(maisRecente);
    })();
  }, [nav.talhaoId]);

  // Grid SOB DEMANDA da cena selecionada (autoload leve não traz rasters):
  // ── Download em GeoTIFF ────────────────────────────────────────────────────
  // 'talhao' = recortado na divisa; 'tela' = o retângulo visível, sem recorte.
  // O índice do talhão sai do grid que a tela JÁ tem (nada de rebuscar o
  // satélite); os outros três caminhos precisam de uma busca nova, porque o dado
  // guardado cobre só o retângulo do talhão.
  async function baixarTiff(tipo: 'indice' | 'imagem', alvo: 'talhao' | 'tela') {
    if (!sel || !poligono) return;
    if (alvo === 'tela' && !boundsTela) { setErroTiff('Ainda não sei o que está na tela — mexa no mapa e tente de novo.'); return; }
    setBaixandoTiff(`${tipo}:${alvo}`); setErroTiff('');
    const area = alvo === 'tela' ? retanguloDe(boundsTela!) : poligono;
    const pixelM = pixelDe(fonteSel);
    const base = `${nav.talhao || 'talhao'}_${tipo === 'indice' ? indSel : 'RGB'}_${dataSel || 'cena'}_${alvo}`
      .replace(/[^\w.-]+/g, '_');
    try {
      let blob: Blob;
      if (tipo === 'imagem') {
        blob = await baixarImagemGeotiff({
          poligono: area, cenaId: sel.resp.cena.id, fonte: fonteSel, pixelM,
          recortar: alvo === 'talhao', filename: base,
        });
      } else {
        let grid = sel.resp.grid;
        let bounds = sel.resp.bounds;
        if (alvo === 'tela' || !grid?.b64) {
          // Índice na janela (ou grid ainda não baixado): refaz o cálculo na área
          // pedida. O recorte é o próprio retângulo, então nada é mascarado.
          const r = indSel === 'NDVI'
            ? await buscarNdviSentinel({ poligono: area, dataIni: dataSel, dataFim: dataSel, cenaId: sel.resp.cena.id, fonte: fonteSel, pixelM })
            : await (async () => {
                const ix = await buscarIndices({ poligono: area, cenaId: sel.resp.cena.id, indices: [indSel], fonte: fonteSel, pixelM });
                const res = ix.resultados[indSel];
                if (!res?.grid?.b64) throw new Error(`O servidor não devolveu o índice ${indSel} para esta cena.`);
                return { grid: res.grid, bounds: ix.bounds };
              })();
          grid = r.grid; bounds = r.bounds;
        }
        if (!grid?.b64) throw new Error('Esta cena ainda não tem o mapa carregado.');
        blob = await exportarGeotiff(grid, bounds, base);
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${base}.tif`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setErroTiff(e instanceof Error ? e.message : 'Falha ao gerar o GeoTIFF.');
    } finally { setBaixandoTiff(''); }
  }

  // baixa 1 grid — do cache local se a versão da nuvem não mudou — e injeta na
  // cena. Cenas processadas nesta sessão já têm grid e não passam por aqui.
  const [carregandoGrid, setCarregandoGrid] = useState(false);
  const [baixandoTiff, setBaixandoTiff] = useState('');   // `${tipo}:${alvo}` em andamento
  const [erroTiff, setErroTiff] = useState('');
  useEffect(() => {
    const m = selKey ? cenas[selKey] : undefined;
    if (!m || m.resp.grid || !m.nuvemId) return;
    let vivo = true;
    setCarregandoGrid(true);
    (async () => {
      try {
        const doc = await cloudCarregarMapa<{ resp?: { grid?: Grid } }>(m.nuvemId!, m.nuvemEm);
        let grid = doc?.dados?.resp?.grid;
        if (!grid?.b64) return;
        if (grid.comp === 'gz') grid = await descomprimirGrid(grid);
        if (vivo) {
          setCenas(prev => prev[selKey]
            ? { ...prev, [selKey]: { ...prev[selKey], resp: { ...prev[selKey].resp, grid } } }
            : prev);
        }
      } catch (e) {
        console.warn('[ndvi] grid sob demanda falhou:', e);
        if (vivo) setErro('Falha ao baixar o mapa desta cena — tente de novo.');
      } finally {
        if (vivo) setCarregandoGrid(false);
      }
    })();
    return () => { vivo = false; };
  }, [selKey, cenas]);

  // Render no mapa: prévia RGB (conferência) > NDVI/imagem da cena selecionada.
  useEffect(() => {
    setFertilidadeLabels(null);
    if (previaDe) {
      const img = previas[chaveCena(previaDe.fonte, previaDe.data)];
      if (img) setFertilidadeOverlay({ url: img.png, coordinates: coordsFromBounds(img.bounds), opacity: OPACIDADE });
      else setFertilidadeOverlay(null);
      return;
    }
    if (!legNdvi || !selKey) { setFertilidadeOverlay(null); return; }
    if (modo === 'imagem') {
      const img = imagens[chaveCena(fonteSel, dataSel)];
      if (!img) { setFertilidadeOverlay(null); return; }
      setFertilidadeOverlay({ url: img.png, coordinates: coordsFromBounds(img.bounds), opacity: OPACIDADE });
      return;
    }
    const m = cenas[selKey];
    if (!m?.resp?.grid?.b64) { setFertilidadeOverlay(null); return; }
    let url: string | undefined;
    try { url = colorirGrid(m.resp.grid, dominio, corStops).dataUrl; }
    catch (e) { console.warn('[ndvi] colorir falhou:', e); }
    if (!url) { setFertilidadeOverlay(null); return; }
    setFertilidadeOverlay({ url, coordinates: coordsFromBounds(m.resp.bounds), opacity: OPACIDADE });
  }, [cenas, imagens, previas, previaDe, selKey, fonteSel, dataSel, modo, dominio, corStops, legNdvi, setFertilidadeOverlay, setFertilidadeLabels]);

  // Miniaturas RGB dos cards (leves, 2 por vez) — só das que ainda não têm.
  // TETO e guarda de vista: cada miniatura é uma leitura de COG no servidor, e
  // um período de 3 anos traz centenas de cenas. Sem isto, abrir o histórico
  // longo dispararia centenas de chamadas simultâneas ao backend.
  useEffect(() => {
    if (!poligono || candidatos.length === 0 || vista !== 'cartoes') return;
    let vivo = true;
    const fila = candidatos
      .filter(c => c.data && !thumbsRef.current[chaveCena(c.fonte, c.data)])
      .slice(0, MAX_THUMBS);
    if (fila.length === 0) return;
    setThumbs(t => ({ ...t, ...Object.fromEntries(fila.map(c => [chaveCena(c.fonte, c.data), 'loading'])) }));
    (async () => {
      const worker = async () => {
        while (vivo) {
          const c = fila.shift();
          if (!c) return;
          const ch = chaveCena(c.fonte, c.data);
          try {
            const img = await buscarImagemSatelite({ poligono, cenaId: c.id, fonte: c.fonte, pixelM: PIXEL_THUMB[c.fonte] });
            if (vivo) setThumbs(t => ({ ...t, [ch]: img.png }));
          } catch {
            if (vivo) setThumbs(t => ({ ...t, [ch]: 'err' }));
          }
        }
      };
      await Promise.all([worker(), worker()]);
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidatos, poligono, vista]);

  // Prévia FINA da conferência (RGB no mapa).
  useEffect(() => {
    if (!previaDe || !poligono) return;
    const ch = chaveCena(previaDe.fonte, previaDe.data);
    if (previas[ch]) return;
    let vivo = true;
    setCarregandoPrevia(true);
    buscarImagemSatelite({ poligono, cenaId: previaDe.id, fonte: previaDe.fonte, pixelM: PIXEL_PREVIA[previaDe.fonte] })
      .then(img => { if (vivo) setPrevias(prev => ({ ...prev, [ch]: { bounds: img.bounds, png: img.png } })); })
      .catch(e => { if (vivo) setErro(e instanceof Error ? e.message : 'Falha ao carregar a prévia.'); })
      .finally(() => { if (vivo) setCarregandoPrevia(false); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previaDe, poligono]);

  // Imagem FINA do modo "Imagem" (resultado) — cache por CENA.
  useEffect(() => {
    if (modo !== 'imagem' || !selKey || !sel || !poligono || previaDe) return;
    const chCena = chaveCena(fonteSel, dataSel);
    if (imagens[chCena]) return;
    let vivo = true;
    setCarregandoImg(true);
    buscarImagemSatelite({ poligono, cenaId: sel.resp.cena.id, fonte: fonteSel, pixelM: pixelDe(fonteSel) })
      .then(img => { if (vivo) setImagens(prev => ({ ...prev, [chCena]: { bounds: img.bounds, png: img.png } })); })
      .catch(e => { if (vivo) setErro(e instanceof Error ? e.message : 'Falha ao buscar imagem.'); })
      .finally(() => { if (vivo) setCarregandoImg(false); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, selKey, poligono, previaDe]);

  useEffect(() => () => { setFertilidadeOverlay(null); setFertilidadeLabels(null); }, [setFertilidadeOverlay, setFertilidadeLabels]);

  async function listar(nuvemOverride?: number) {
    if (!poligono) { setErro('Limite do talhão não encontrado — abra o talhão no mapa.'); setEstado('erro'); return; }
    const nv = nuvemOverride ?? nuvemMax;
    if (nuvemOverride != null) setNuvemMax(nuvemOverride);
    setEstado('listando'); setErro(''); setSugerirNuvem(0); setPreviaDe(null);
    try {
      const fontes: FonteNdvi[] = fonteBusca === 'todos' ? ['sentinel', 'cbers'] : [fonteBusca];
      // O limite vai INLINE de propósito: içá-lo para uma const acrescenta mais
      // uma variável capturada por este closure e o react-hooks/immutability
      // passa a acusar (falsamente) a deduplicação abaixo como mutação de estado.
      const resultados = await Promise.all(fontes.map(async f => {
        const cs = await listarCenasNdvi({ poligono, dataIni, dataFim, nuvemMax: f === 'sentinel' ? nv : 100, fonte: f, limite: limiteBusca(dataIni, dataFim) });
        return cs.map(c => ({ ...c, fonte: f }));
      }));
      // 1 card por fonte+data: talhão na emenda de tiles repete a mesma passagem
      // em 2+ cenas — fica a de menor nuvem (ou a primeira, sem metadado).
      const porChave = new Map<string, Cand>();
      for (const c of resultados.flat()) {
        const ch = chaveDe(c.fonte, c.data);
        const atual = porChave.get(ch);
        if (!atual || (c.nuvem ?? 101) < (atual.nuvem ?? 101)) porChave.set(ch, c);
      }
      const juntas = [...porChave.values()].sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''));
      setCandidatos(juntas);
      // Busca nova = avaliação nova (as cenas mudaram); a marcação também some,
      // senão o usuário processaria em lote algo que não está mais na tela.
      setAvaliacoes({}); setMarcadas({});
      // Cartão não se navega às centenas: a partir daí a tela abre no gráfico.
      setVista(juntas.length > CARTOES_DEMAIS ? 'grafico' : 'cartoes');
      setEstado('idle');
      if (juntas.length === 0) {
        if (fontes.includes('sentinel') && nv < 15) {
          setErro(`Nenhuma cena com até ${nv}% de nuvem no período.`);
          setSugerirNuvem(nv < 10 ? 10 : 15);
        } else {
          setErro('Nenhuma cena no período. Amplie o período.');
        }
      }
    } catch (e) {
      setEstado('erro'); setErro(e instanceof Error ? e.message : 'Falha ao listar cenas.');
    }
  }

  // resultados já calculados de uma CENA (qualquer índice)
  const indicesDaCena = (fonte: FonteNdvi, data: string | null) =>
    Object.keys(cenas).filter(k => k.startsWith(chaveCena(fonte, data) + ':'));

  function abrirCard(c: Cand) {
    const feitos = indicesDaCena(c.fonte, c.data);
    if (feitos.length && !rejeitadas[idRejeicao(c)]) {
      // já processada → mostra resultado (NDVI primeiro), mas mantém a conferência acessível
      const ndvi = feitos.find(k => k.endsWith(':NDVI'));
      setSelKey(ndvi ?? feitos[0]); setPreviaDe(null);
      return;
    }
    setVistas(v => ({ ...v, [chaveCena(c.fonte, c.data)]: true }));
    setErro('');
    setPreviaDe(c);
    setSelKey('');
  }

  // Processa SÓ os índices selecionados da cena em conferência (spec seções 10/12).
  async function processarIndices(c: Cand) {
    if (!poligono) return;
    const escolhidos = indicesDisponiveis(c.fonte).ok.map(i => i.id).filter(id => selIdx[id]);
    if (escolhidos.length === 0) { setErro('Selecione pelo menos um índice.'); return; }
    setCarregandoId(c.id); setErro('');
    try {
      const r = await buscarIndices({ poligono, cenaId: c.id, fonte: c.fonte, indices: escolhidos, pixelM: pixelDe(c.fonte) });
      const d = r.cena.data ?? c.data ?? '';
      const agora = new Date().toISOString();
      const novos: Record<string, MapaNdvi> = {};
      for (const [ind, res] of Object.entries(r.resultados)) {
        novos[chaveDe(c.fonte, d, ind)] = {
          resp: { bounds: r.bounds, grid: res.grid, stats: res.stats, cena: r.cena },
          criadoEm: agora, indice: ind, formula: res.formula, bandas: res.bandas,
          mascara: r.mascara, usuario: emailUsuario() ?? undefined,
        };
      }
      setCenas(prev => ({ ...prev, ...novos }));
      const primeiro = novos[chaveDe(c.fonte, d, 'NDVI')] ? chaveDe(c.fonte, d, 'NDVI') : Object.keys(novos)[0];
      setSelKey(primeiro);
      setPreviaDe(null);
      setModo('ndvi');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao calcular os índices da cena.');
    } finally {
      setCarregandoId('');
    }
  }

  // Grava UMA camada na nuvem (grid comprimido + metadados — spec seção 13).
  // Compartilhado entre o botão "Manter" e o processamento em lote do gráfico:
  // as duas gravações têm que produzir exatamente o mesmo documento.
  async function salvarNaNuvem(fonte: FonteNdvi, data: string, indice: string, m: MapaNdvi) {
    if (!nav.talhaoId || !m.resp.grid) return;
    const gz = await comprimirGrid(m.resp.grid);
    cloudSalvarMapa(idNuvem(nav.talhaoId, fonte, data, indice), {
      resp: { ...m.resp, grid: gz }, criadoEm: m.criadoEm,
      indice, formula: m.formula, bandas: m.bandas, mascara: m.mascara,
      usuario: m.usuario ?? emailUsuario() ?? undefined, salvoEm: new Date().toISOString(),
    });
  }

  // Manter o ÍNDICE selecionado (vira camada oficial, com metadados — spec seção 13).
  async function manterCena() {
    if (!sel || !selKey || !nav.talhaoId) return;
    if (!cloudPodeGravar()) { setErro('Faça login para manter a camada salva.'); return; }
    if (!sel.resp.grid) { setErro('Aguarde o mapa desta cena terminar de carregar.'); return; }
    await salvarNaNuvem(fonteSel, dataSel, indSel, sel);
    setSalvos(s => ({ ...s, [selKey]: true }));
  }

  // ── Gráfico de seleção: avaliar, marcar e processar em lote ────────────────

  // O gráfico só desenha; toda decisão e toda chamada de rede ficam aqui.
  // `aceitaSemMascara`: o CBERS não tem banda de qualidade, então não dá para
  // afirmar que o talhão está sem nuvem. Quem escolheu CBERS de propósito
  // assume isso; em "Todos", ele aparece no gráfico mas não é marcado sozinho.
  const aceitaSemMascara = fonteBusca === 'cbers';

  const itensGrafico = useMemo<ItemGrafico[]>(() => candidatos
    .filter(c => !!c.data)
    .map(c => {
      const chave = chaveCena(c.fonte, c.data);
      const av = avaliacoes[chave];
      const base = {
        id: c.id, data: c.data as string, fonte: c.fonte,
        nuvem: c.nuvem ?? null,
        pctLimpo: av?.pctLimpo ?? null,
        ndviMedio: av?.ndviMedio ?? null,
        semMascara: av?.semMascara ?? (c.fonte === 'cbers'),
      };
      const v = avaliarRegras(base, regras, null, aceitaSemMascara);
      return {
        ...base, chave,
        marcada: !!marcadas[chave],
        salva: indicesDaCena(c.fonte, c.data).some(k => salvos[k]),
        rejeitada: !!rejeitadas[idRejeicao(c)],
        aceita: v.aceita, motivo: v.motivo,
      };
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candidatos, avaliacoes, marcadas, salvos, rejeitadas, cenas, aceitaSemMascara]);

  // Lê a máscara de nuvem das cenas do intervalo, em lotes, com progresso.
  // `corteLimpo` faz o servidor NÃO ler as bandas quando o talhão já reprovou no
  // percentual — medido, é ~7x mais rápido nas cenas nubladas, que são a maioria.
  async function avaliarIntervalo(alvos: ItemGrafico[]) {
    if (!poligono || alvos.length === 0) return;
    setAvaliando(true); setErro(''); setProgresso({ feitas: 0, total: alvos.length });
    try {
      for (let i = 0; i < alvos.length; i += MAX_AVALIAR) {
        const lote = alvos.slice(i, i + MAX_AVALIAR);
        const r = await avaliarCenas({
          poligono,
          cenas: lote.map(a => ({ id: a.id, fonte: a.fonte })),
          corteLimpo: regras.pctLimpoMin,
        });
        setAvaliacoes(prev => {
          const novo = { ...prev };
          for (const c of r.cenas) {
            const alvo = lote.find(a => a.id === c.id);
            if (alvo) novo[alvo.chave] = c;
          }
          return novo;
        });
        setProgresso({ feitas: Math.min(i + lote.length, alvos.length), total: alvos.length });
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao avaliar as cenas.');
    } finally {
      setAvaliando(false); setProgresso(null);
    }
  }

  function marcarMelhores(dias: number, doIntervalo: ItemGrafico[]) {
    const ids = new Set(melhoresPorJanela(doIntervalo, dias, regras, aceitaSemMascara));
    const novas: Record<string, boolean> = {};
    for (const i of doIntervalo) if (ids.has(i.id)) novas[i.chave] = true;
    setMarcadas(novas);
    if (Object.keys(novas).length === 0) {
      setErro('Nenhuma cena do intervalo passa nas regras — avalie o intervalo ou amplie o período.');
    } else {
      setErro('');
    }
  }

  // Calcula os índices marcados de UMA cena e JÁ salva. No lote não faz sentido
  // pedir "Manter" vinte vezes: a decisão consciente foi tomada no gráfico.
  async function calcularESalvar(c: Cand) {
    if (!poligono || !nav.talhaoId) return;
    const escolhidos = indicesDisponiveis(c.fonte).ok.map(i => i.id).filter(id => selIdx[id]);
    if (escolhidos.length === 0) throw new Error('nenhum índice selecionado');
    const r = await buscarIndices({ poligono, cenaId: c.id, fonte: c.fonte, indices: escolhidos, pixelM: pixelDe(c.fonte) });
    const d = r.cena.data ?? c.data ?? '';
    const agora = new Date().toISOString();
    const novos: Record<string, MapaNdvi> = {};
    for (const [ind, res] of Object.entries(r.resultados)) {
      novos[chaveDe(c.fonte, d, ind)] = {
        resp: { bounds: r.bounds, grid: res.grid, stats: res.stats, cena: r.cena },
        criadoEm: agora, indice: ind, formula: res.formula, bandas: res.bandas,
        mascara: r.mascara, usuario: emailUsuario() ?? undefined,
      };
    }
    setCenas(prev => ({ ...prev, ...novos }));
    for (const [k, m] of Object.entries(novos)) {
      await salvarNaNuvem(c.fonte, d, m.indice ?? 'NDVI', m);
      setSalvos(s => ({ ...s, [k]: true }));
    }
  }

  // Serial de propósito: o backend é compartilhado e cada cena lê vários COGs.
  // Uma falha não aborta o lote — só entra na conta e é listada no fim.
  async function processarLote() {
    const alvos = candidatos.filter(c => marcadas[chaveCena(c.fonte, c.data)]);
    if (alvos.length === 0) return;
    if (!cloudPodeGravar()) { setErro('Faça login para processar e salvar em lote.'); return; }
    setProcessandoLote(true); setErro(''); setProgresso({ feitas: 0, total: alvos.length });
    const falhas: string[] = [];
    for (let i = 0; i < alvos.length; i++) {
      try {
        await calcularESalvar(alvos[i]);
      } catch (e) {
        falhas.push(`${ddmmyy(alvos[i].data)} (${e instanceof Error ? e.message : 'falhou'})`);
      }
      setProgresso({ feitas: i + 1, total: alvos.length });
    }
    setProcessandoLote(false); setProgresso(null); setMarcadas({});
    setErro(falhas.length
      ? `${alvos.length - falhas.length} de ${alvos.length} salvas. Não deu certo em: ${falhas.slice(0, 3).join(', ')}${falhas.length > 3 ? '…' : ''}`
      : '');
  }

  async function perguntarApagarAutomaticas() {
    if (!nav.talhaoId) return;
    try {
      const metas = await listarNdviSalvos(nav.talhaoId, true);
      setConfirmarApagar(metas.filter(m => m.automatico).length);
    } catch {
      setConfirmarApagar(0);
    }
  }

  async function apagarAutomaticas() {
    if (!nav.talhaoId) return;
    setApagando(true);
    try {
      const metas = await listarNdviSalvos(nav.talhaoId, true);
      const ids = metas.filter(m => m.automatico).map(m => m.itemId);
      const n = await cloudExcluirMapas(ids);
      // 0 apagadas sem erro = RLS negando. Dizer "apagado" seria mentir.
      setErro(n === 0 && ids.length > 0
        ? 'O servidor não confirmou a exclusão — as camadas continuam lá. Verifique suas permissões.'
        : '');
      // Some a estrela SÓ das que saíram. Uma data pode ter uma camada
      // automática apagada e outra, do mesmo dia, mantida à mão.
      const prefC = prefixoNuvem(nav.talhaoId, 'cbers');
      const prefS = prefixoNuvem(nav.talhaoId, 'sentinel');
      setSalvos(sv => {
        const novo = { ...sv };
        for (const id of ids) {
          const cbers = id.startsWith(prefC);
          const [ind, data] = id.slice((cbers ? prefC : prefS).length).split('__');
          delete novo[chaveDe(cbers ? 'cbers' : 'sentinel', data ?? '', ind ?? 'NDVI')];
        }
        return novo;
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao apagar as camadas automáticas.');
    } finally {
      setApagando(false);
      setConfirmarApagar(null);
    }
  }

  function abrirDoGrafico(item: ItemGrafico) {
    const c = candidatos.find(x => x.fonte === item.fonte && x.data === item.data);
    if (c) { setVista('cartoes'); abrirCard(c); }
  }

  function removerCena() {
    if (!selKey || !nav.talhaoId) return;
    cloudExcluirMapasPorPrefixo(idNuvem(nav.talhaoId, fonteSel, dataSel, indSel));
    setSalvos(s => ({ ...s, [selKey]: false }));
  }

  // Liga/desliga a camada como fonte de análise. Só faz sentido no que já está
  // mantido — o que não foi salvo não existe para nenhum cálculo.
  function alternarFonte(fonte: FonteNdvi, data: string, indice: string) {
    if (!nav.talhaoId) return;
    const ch = chaveCamada(fonte, data, indice);
    marcarFonte(nav.talhaoId, ch, !fontes[idFonte(nav.talhaoId, ch)]);
    setFontes(getFontesLocal());
  }

  function toggleRejeitada(c: Cand) {
    if (!nav.talhaoId) return;
    const id = idRejeicao(c);
    const nova = !rejeitadas[id];
    marcarRejeitada(nav.talhaoId, id, nova);   // local + nuvem (vale em qualquer aparelho)
    setRejeitadas(getRejeitadasLocal());
    if (nova) setPreviaDe(null);
  }

  if (!legNdvi) return <div className="px-4 py-3"><Aviso texto="Legenda oficial de NDVI não encontrada (seed do sistema)." /></div>;

  // Quem não gera (produtor, leitor) vê o INVENTÁRIO do talhão: índices
  // mantidos na nuvem e composições temporais aprovadas.
  if (!pode('ndvi')) {
    return (
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center gap-2">
          <Satellite size={14} style={{ color: '#a78bfa' }} />
          <h3 className="text-sm font-bold" style={{ color: '#e2e8f0' }}>Satélite — camadas salvas</h3>
        </div>
        <CamadasSalvasView talhaoId={nav.talhaoId ?? ''} />
      </div>
    );
  }

  const listando = estado === 'listando';
  const chavePrevia = previaDe ? chaveCena(previaDe.fonte, previaDe.data) : '';
  const mantidas = Object.keys(cenas).sort((a, b) => b.split(':')[1].localeCompare(a.split(':')[1]));
  const dispPrevia = previaDe ? indicesDisponiveis(previaDe.fonte) : null;
  const nSel = dispPrevia ? dispPrevia.ok.filter(i => selIdx[i.id]).length : 0;
  const indicesCenaSel = selKey ? indicesDaCena(fonteSel, dataSel) : [];

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Abas do módulo de Índices Vegetativos (IV5) */}
      <div className="flex gap-1">
        {([['buscar', 'Imagens & índices'], ['comp', 'Composição temporal'], ['salvas', 'Camadas salvas']] as const).map(([a, r]) => (
          <button key={a} onClick={() => setAbaIv(a)} className="flex-1 py-1.5 rounded text-[10px] font-bold"
            style={{ background: abaIv === a ? 'var(--invicta-blue-mid)' : '#0f2240', color: abaIv === a ? '#fff' : '#93c5fd', border: '1px solid #1a3a6b' }}>
            {r}
          </button>
        ))}
      </div>

      {/* PDF rápido p/ produtor: escolhe os mapas (índices mantidos + RGB da sessão) */}
      {poligono && (
        <GeradorPdfNdvi talhaoId={nav.talhaoId ?? ''} poligono={poligono} legNdvi={legNdvi}
          imagens={imagens} info={{ produtor: nav.produtor, fazenda: nav.fazenda, talhao: nav.talhao, safra: safraNome ?? nav.safra, areaHa: nav.area }} />
      )}

      {abaIv === 'comp' && <ComposicaoTemporalPanel safraNome={safraNome} />}
      {abaIv === 'salvas' && <CamadasSalvasView talhaoId={nav.talhaoId ?? ''} />}
      {abaIv === 'buscar' && (<>
      {!cloudPodeGravar() && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg" style={{ background: '#2d1a00', border: '1px solid #92400e' }}>
          <AlertTriangle size={13} style={{ color: '#fbbf24' }} className="flex-shrink-0 mt-0.5" />
          <p className="text-[10px]" style={{ color: '#fbbf24' }}>
            <strong>Você não está logado</strong> — as cenas de NDVI <strong>não são salvas</strong> e precisam ser rebuscadas ao reabrir.
          </p>
        </div>
      )}

      {!poligono && <Aviso texto="Limite do talhão não carregado no mapa." />}

      {/* Busca automática de madrugada (pendência 40) */}
      {nav.talhaoId && (
        <BotaoMonitorar talhaoId={nav.talhaoId} fazendaId={nav.fazendaId ?? undefined}
          onDesligarComCamadas={() => void perguntarApagarAutomaticas()} />
      )}
      {confirmarApagar !== null && (
        <div className="rounded-lg p-2.5 space-y-2" style={{ background: '#2d1a00', border: '1px solid #92400e' }}>
          <p className="text-[10px]" style={{ color: '#fbbf24' }}>
            {confirmarApagar === 0
              ? 'Monitoramento desligado. Não há camadas automáticas guardadas neste talhão.'
              : `Monitoramento desligado. Este talhão tem ${confirmarApagar} camada${confirmarApagar > 1 ? 's' : ''} gerada${confirmarApagar > 1 ? 's' : ''} automaticamente. O que fazer com ela${confirmarApagar > 1 ? 's' : ''}?`}
          </p>
          <div className="flex gap-1.5">
            <button onClick={() => setConfirmarApagar(null)}
              className="flex-1 py-1.5 rounded text-[10px] font-bold" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
              {confirmarApagar === 0 ? 'Entendi' : 'Manter as camadas'}
            </button>
            {confirmarApagar > 0 && (
              <button onClick={() => void apagarAutomaticas()} disabled={apagando}
                className="flex-1 py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1"
                style={{ background: '#7f1d1d' }}>
                {apagando ? <><Loader2 size={11} className="animate-spin" /> Apagando…</> : <>Apagar também</>}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Fonte de imagem */}
      <div>
        <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>Fonte de imagem</label>
        <div className="flex gap-1">
          {([['sentinel', 'Sentinel-2 · 10 m'], ['cbers', 'CBERS-4A · 2 m'], ['todos', 'Todos']] as [FonteBusca, string][]).map(([f, r]) => (
            <button key={f} onClick={() => trocarFonte(f)} className="flex-1 py-1.5 rounded text-[10px] font-bold"
              style={{ background: fonteBusca === f ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: fonteBusca === f ? '#fff' : '#93c5fd' }}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Período + nuvem + buscar cenas */}
      <div className="rounded-lg p-2.5 space-y-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
        <p className="text-[11px] font-semibold flex items-center gap-1" style={{ color: '#93c5fd' }}>
          <Satellite size={12} /> Buscar imagens {fonteBusca === 'todos' ? '(Sentinel-2 + CBERS-4A)' : fonteBusca === 'cbers' ? 'CBERS-4A (2 m)' : 'Sentinel-2'}
        </p>
        {/* Atalhos de período — o histórico longo é o caso de uso do gráfico */}
        <div className="flex gap-1">
          {([[3, '3 meses'], [12, '1 ano'], [24, '2 anos'], [36, '3 anos']] as [number, string][]).map(([m, r]) => {
            const ini = mesesAtras(m), fim = isoDate(new Date());
            const ativo = dataIni === ini && dataFim === fim;
            return (
              <button key={m} onClick={() => { setDataIni(ini); setDataFim(fim); }}
                className="flex-1 py-1 rounded text-[9px] font-bold"
                style={{ background: ativo ? 'var(--invicta-blue-mid)' : '#0b1d3a', border: '1px solid #1a3a6b', color: ativo ? '#fff' : '#93c5fd' }}>
                {r}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>De</label>
            <input type="date" value={dataIni} max={dataFim} onChange={e => setDataIni(e.target.value)}
              className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle} />
          </div>
          <div className="flex-1">
            <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Até</label>
            <input type="date" value={dataFim} min={dataIni} max={isoDate(hoje)} onChange={e => setDataFim(e.target.value)}
              className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle} />
          </div>
          {fonteBusca !== 'cbers' && (
            <div style={{ width: 92 }}>
              <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Nuvem máx</label>
              <div className="flex items-center gap-1">
                <input type="number" min={0} max={100} value={nuvemMax} onChange={e => setNuvemMax(Number(e.target.value))}
                  className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle} />
                <span className="text-[10px]" style={{ color: '#64748b' }}>%</span>
              </div>
            </div>
          )}
        </div>
        <button onClick={() => void listar()} disabled={listando || !poligono}
          className="w-full py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1.5"
          style={{ background: (listando || !poligono) ? '#1a3a6b' : 'var(--invicta-green-dark)', opacity: !poligono ? 0.6 : 1 }}>
          {listando ? <><Loader2 size={13} className="animate-spin" /> Buscando imagens…</> : <><Satellite size={13} /> Buscar imagens no período</>}
        </button>
        <p className="text-[9px]" style={{ color: '#475569' }}>
          A busca mostra PRÉVIAS RGB — nada é processado nem salvo até você confirmar. {fonteBusca !== 'sentinel' ? 'CBERS-4A (INPE) não traz % de nuvem — avalie pela prévia. ' : ''}Nuvem padrão do Sentinel-2: {NUVEM_PADRAO}%.
        </p>
      </div>

      {estado === 'erro' && <p className="text-[10px]" style={{ color: '#f87171' }}>{erro}</p>}
      {erro && estado !== 'erro' && <p className="text-[10px]" style={{ color: '#fbbf24' }}>{erro}</p>}
      {caiuParaNuvem && (
        <p className="text-[10px] leading-relaxed p-2 rounded" style={{ background: '#0b1e38', color: '#93c5fd', border: '1px solid #1a3a6b' }}>
          Processado <b>na nuvem</b>: o interpolador desta máquina está desligado. Não precisa fazer nada —
          {' '}se quiser voltar a usar esta máquina, abra o atalho <b>Interpolador INVICTA</b> na Área de Trabalho.
        </p>
      )}
      {sugerirNuvem > 0 && (
        <button onClick={() => void listar(sugerirNuvem)}
          className="w-full py-1.5 rounded text-[10px] font-bold" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
          Ampliar para {sugerirNuvem}% de nuvem e buscar de novo
        </button>
      )}

      {/* Como olhar o resultado: gráfico (visão do período) ou cartões (prévia RGB) */}
      {candidatos.length >= 3 && (
        <div className="flex gap-1">
          {([['grafico', 'Gráfico do período'], ['cartoes', 'Cartões com prévia']] as ['grafico' | 'cartoes', string][]).map(([v, r]) => (
            <button key={v} onClick={() => setVista(v)} className="flex-1 py-1.5 rounded text-[10px] font-bold"
              style={{ background: vista === v ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: vista === v ? '#fff' : '#93c5fd' }}>
              {r}
            </button>
          ))}
        </div>
      )}

      {vista === 'grafico' && candidatos.length >= 3 && (
        <GraficoCenas
          itens={itensGrafico} regras={regras} janela={[dataIni, dataFim]}
          avaliando={avaliando} processando={processandoLote} progresso={progresso}
          onJanela={(a, b) => { setDataIni(a); setDataFim(b); }}
          onAvaliar={alvos => void avaliarIntervalo(alvos)}
          onMarcarMelhores={marcarMelhores}
          onLimparMarcas={() => setMarcadas({})}
          onAbrir={abrirDoGrafico}
          onProcessar={() => void processarLote()}
        />
      )}

      {/* Cards das imagens candidatas (prévia RGB) */}
      {candidatos.length > 0 && vista === 'cartoes' && (
        <div>
          <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>
            Imagens encontradas · {candidatos.length} · toque para conferir
          </label>
          {candidatos.length > MAX_THUMBS && (
            <p className="text-[9px] mb-1" style={{ color: '#64748b' }}>
              Prévia carregada só nas {MAX_THUMBS} primeiras — para um período longo, use o gráfico.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 max-h-[420px] overflow-y-auto pr-1">
            {candidatos.map(c => {
              const ch = chaveCena(c.fonte, c.data);
              const thumb = thumbs[ch];
              const rejeitada = !!rejeitadas[idRejeicao(c)];
              const feitos = indicesDaCena(c.fonte, c.data);
              const processada = feitos.length > 0;
              const salva = feitos.some(k => salvos[k]);
              const emConf = chavePrevia === ch && !!previaDe;
              return (
                <button key={`${c.fonte}-${c.id}`} onClick={() => abrirCard(c)}
                  className="rounded-lg overflow-hidden text-left"
                  style={{
                    background: '#0b1d3a', opacity: rejeitada ? 0.45 : 1,
                    border: `1px solid ${emConf ? '#60a5fa' : selKey.startsWith(ch + ':') ? '#4ade80' : '#1a3a6b'}`,
                  }}>
                  <div className="relative w-full h-20 flex items-center justify-center" style={{ background: '#061525' }}>
                    {thumb && thumb !== 'loading' && thumb !== 'err'
                      ? <img src={thumb} alt="" className="w-full h-full object-cover" />
                      : thumb === 'err'
                        ? <ImageIcon size={16} style={{ color: '#334155' }} />
                        : <Loader2 size={14} className="animate-spin" style={{ color: '#2e5fa3' }} />}
                    <span className="absolute top-1 left-1 px-1 rounded text-[8px] font-bold"
                      style={{ background: 'rgba(6,21,37,0.85)', color: c.fonte === 'cbers' ? '#fbbf24' : '#93c5fd' }}>
                      {ROTULO_FONTE[c.fonte]}
                    </span>
                    {rejeitada && <span className="absolute top-1 right-1 px-1 rounded text-[8px] font-bold" style={{ background: '#7f1d1d', color: '#fca5a5' }}>rejeitada</span>}
                    {!rejeitada && salva && <Star size={11} fill="#fbbf24" className="absolute top-1 right-1" style={{ color: '#fbbf24' }} />}
                  </div>
                  <div className="px-1.5 py-1">
                    <p className="text-[10px] font-bold" style={{ color: '#e2e8f0' }}>{ddmmyy(c.data)}</p>
                    <p className="text-[8px] flex items-center gap-1" style={{ color: '#64748b' }}>
                      ☁ {c.nuvem != null ? `${Math.round(c.nuvem)}%` : '—'}
                      {processada && <span className="flex items-center gap-0.5" style={{ color: '#86efac' }}><Check size={8} /> {feitos.length} índice{feitos.length > 1 ? 's' : ''}</span>}
                      {!processada && vistas[ch] && <Eye size={8} style={{ color: '#475569' }} />}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* CONFERÊNCIA da prévia (RGB no mapa + decisão) */}
      {previaDe && (
        <div className="space-y-2 p-2.5 rounded-lg" style={{ background: '#061525', border: '1px solid #60a5fa' }}>
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold flex items-center gap-1.5" style={{ color: '#93c5fd' }}>
              <ImageIcon size={12} /> Conferência — {ROTULO_FONTE[previaDe.fonte]} · {ddmmyy(previaDe.data)}
            </p>
            <button onClick={() => setPreviaDe(null)} className="p-0.5" style={{ color: '#64748b' }}><X size={14} /></button>
          </div>
          {carregandoPrevia && !previas[chavePrevia] ? (
            <p className="text-[10px] flex items-center gap-1.5" style={{ color: '#93c5fd' }}>
              <Loader2 size={12} className="animate-spin" /> Carregando a prévia RGB no mapa…
            </p>
          ) : (
            <p className="text-[10px]" style={{ color: '#94a3b8' }}>
              Prévia RGB no mapa (cor verdadeira, recortada no talhão). Avalie <strong style={{ color: '#cbd5e1' }}>nuvem, sombra, bruma, cultura e solo exposto</strong> antes de processar. Use o zoom do mapa.
            </p>
          )}
          <div className="text-[9px]" style={{ color: '#64748b' }}>
            ☁ {previaDe.nuvem != null ? `${fmt2(previaDe.nuvem)}%` : 'não informado'} · {previaDe.plataforma ?? ROTULO_FONTE[previaDe.fonte]} · prévia {PIXEL_PREVIA[previaDe.fonte]} m
            {previaDe.nuvem != null && previaDe.nuvem > 20 && <span style={{ color: '#fbbf24' }}> · ⚠ nuvem alta</span>}
          </div>
          {/* Escolha dos índices (spec seção 10/11) — só os marcados são processados */}
          {dispPrevia && (
            <div>
              <p className="text-[10px] font-semibold mb-1" style={{ color: '#64748b' }}>Índices a processar</p>
              <div className="grid grid-cols-2 gap-1">
                {dispPrevia.ok.map(i => (
                  <label key={i.id} className="flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer"
                    style={{ background: selIdx[i.id] ? '#0f2a1a' : '#0b1d3a', border: `1px solid ${selIdx[i.id] ? '#166534' : '#1a3a6b'}` }}
                    title={`${i.resumo} · usa ${i.bandas.join(' + ')}`}>
                    <input type="checkbox" checked={!!selIdx[i.id]} onChange={() => setSelIdx(s => ({ ...s, [i.id]: !s[i.id] }))}
                      className="accent-green-600" style={{ width: 12, height: 12 }} />
                    <span className="text-[10px] font-bold" style={{ color: selIdx[i.id] ? '#86efac' : '#94a3b8' }}>{i.nome}</span>
                    <span className="text-[8px] truncate" style={{ color: '#475569' }}>{i.resumo}</span>
                  </label>
                ))}
              </div>
              {dispPrevia.bloqueados.length > 0 && (
                <p className="text-[8px] mt-1" style={{ color: '#64748b' }}>
                  {dispPrevia.bloqueados.map(b => `${b.ind.nome} indisponível — ${b.motivo}`).join(' · ')}
                </p>
              )}
            </div>
          )}
          <div className="flex gap-1.5">
            <button onClick={() => processarIndices(previaDe)} disabled={carregandoId === previaDe.id || nSel === 0}
              className="flex-[2] py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1 disabled:opacity-50"
              style={{ background: 'var(--invicta-green-dark)' }}>
              {carregandoId === previaDe.id
                ? <><Loader2 size={11} className="animate-spin" /> Processando {nSel} índice(s)…</>
                : <><Play size={11} /> Processar {nSel} índice(s) ({pixelDe(previaDe.fonte)} m{previaDe.fonte === 'cbers' ? ', ~20–40 s' : ''})</>}
            </button>
            <button onClick={() => toggleRejeitada(previaDe)}
              className="flex-1 py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1"
              style={rejeitadas[idRejeicao(previaDe)] ? { background: '#1a3a6b', color: '#93c5fd' } : { background: '#7f1d1d', color: '#fca5a5' }}>
              {rejeitadas[idRejeicao(previaDe)] ? <><RotateCcw size={11} /> Reabilitar</> : <><XCircle size={11} /> Rejeitar</>}
            </button>
          </div>
          <p className="text-[8px]" style={{ color: '#475569' }}>
            Nada é salvo agora: cada índice processado só vira camada oficial quando você clicar em “Manter”.
          </p>
        </div>
      )}

      {/* Cenas processadas/mantidas (retrocompat) */}
      {!previaDe && mantidas.length > 0 && candidatos.length === 0 && (
        <div>
          <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>
            Cenas desta safra · {mantidas.length} · clique para ver
          </label>
          <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto pr-1">
            {mantidas.map(k => {
              const [f, d, ind] = k.split(':') as [FonteNdvi, string, string];
              const ativa = k === selKey;
              return (
                <button key={k} onClick={() => { setSelKey(k); setPreviaDe(null); }}
                  className="px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1"
                  style={{ background: ativa ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: ativa ? '#fff' : (salvos[k] ? '#86efac' : '#93c5fd') }}>
                  {salvos[k] ? <Star size={10} fill="currentColor" /> : <Check size={10} />}
                  {ind ?? 'NDVI'} · {ddmmyy(d)}
                  <span style={{ color: ativa ? '#cbd5e1' : '#64748b', fontWeight: 400 }}>· {f === 'cbers' ? 'C4A' : 'S2'}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Linha do tempo dos índices salvos (IV4 — histórico do talhão) */}
      {!previaDe && (
        <TimelineIndices cenas={cenas} salvos={salvos} selKey={selKey}
          onSel={k => { setSelKey(k); setPreviaDe(null); }} />
      )}

      {/* Resultado — cena processada selecionada */}
      {sel && !previaDe && (
        <div className="space-y-2 p-2.5 rounded-lg" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[10px]" style={{ color: '#86efac' }}>
              <Satellite size={12} />
              <strong>{indSel}</strong> · {sel.resp.cena.plataforma ?? 'Satélite'} · {ddmmyy(sel.resp.cena.data)} · {sel.resp.stats.pixel_m} m
            </div>
            {sel.resp.cena.nuvem != null && (
              <span className="text-[10px]" style={{ color: '#64748b' }}>☁ {fmt2(sel.resp.cena.nuvem)}%</span>
            )}
          </div>

          {/* índices calculados desta cena — troca com 1 toque */}
          {indicesCenaSel.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {indicesCenaSel.map(k => {
                const ind = k.split(':')[2] ?? 'NDVI';
                const ativa = k === selKey;
                return (
                  <button key={k} onClick={() => setSelKey(k)}
                    className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                    style={{ background: ativa ? '#2e5fa3' : '#1a3a6b', color: ativa ? '#fff' : (salvos[k] ? '#86efac' : '#93c5fd') }}>
                    {salvos[k] ? '★ ' : ''}{ind}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex gap-1">
            <button onClick={() => setModo('ndvi')} className="flex-1 py-1 rounded text-[10px] font-bold flex items-center justify-center gap-1"
              style={{ background: modo === 'ndvi' ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: modo === 'ndvi' ? '#fff' : '#93c5fd' }}>
              <Satellite size={11} /> {indSel}
            </button>
            <button onClick={() => setModo('imagem')} className="flex-1 py-1 rounded text-[10px] font-bold flex items-center justify-center gap-1"
              style={{ background: modo === 'imagem' ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: modo === 'imagem' ? '#fff' : '#93c5fd' }}>
              <ImageIcon size={11} /> Imagem
            </button>
          </div>

          {/* Download em GeoTIFF. Duas escolhas INDEPENDENTES, e as duas explícitas:
              O QUE baixar (valores do índice, 1 banda × imagem real, 3 bandas RGB)
              e ATÉ ONDE (talhão recortado na divisa × a janela que está na tela).
              Antes isto seguia o botão NDVI/Imagem lá de cima: quem estava no NDVI
              clicava em "Talhão" achando que levava a foto e recebia o índice de 1
              banda — que abre cinza no QGIS. Escolher no próprio lugar do download
              acaba com a confusão. */}
          <div className="rounded p-2 space-y-2" style={{ background: '#0b1f38', border: '1px solid #1a3a6b' }}>
            <p className="text-[10px] font-semibold" style={{ color: '#93c5fd' }}>Baixar GeoTIFF</p>

            {([
              { tipo: 'imagem' as const, rotulo: 'Imagem real (RGB)', nota: '3 bandas, cor verdadeira' },
              { tipo: 'indice' as const, rotulo: `${indSel} (valores)`, nota: '1 banda — colorir no QGIS' },
            ]).map(({ tipo, rotulo, nota }) => (
              <div key={tipo} className="space-y-1">
                <p className="text-[9px]" style={{ color: '#94a3b8' }}>
                  <b style={{ color: '#cbd5e1' }}>{rotulo}</b> · {nota}
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {([
                    { alvo: 'talhao' as const, txt: 'Talhão' },
                    { alvo: 'tela' as const, txt: 'Área da tela' },
                  ]).map(({ alvo, txt }) => {
                    const chave = `${tipo}:${alvo}`;
                    const travado = !!baixandoTiff || (alvo === 'tela' && !boundsTela);
                    return (
                      <button key={alvo} onClick={() => baixarTiff(tipo, alvo)} disabled={travado}
                        className="py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1"
                        style={{ background: '#1a3a6b', color: '#93c5fd', opacity: travado ? 0.6 : 1 }}>
                        {baixandoTiff === chave ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />} {txt}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <p className="text-[9px] leading-relaxed" style={{ color: '#64748b' }}>
              <b>Talhão</b>: recortado na divisa. <b>Área da tela</b>: o retângulo que você está vendo,
              {' '}sem recorte — busca o satélite de novo para a janela maior, então demora um pouco.
              {' '}Resolução da fonte ({pixelDe(fonteSel)} m); em janela muito ampla o servidor engrossa o
              {' '}pixel para a malha caber. Tudo em EPSG:4326.
            </p>
            {erroTiff && <p className="text-[10px]" style={{ color: '#f87171' }}>{erroTiff}</p>}
          </div>

          {modo === 'ndvi' ? (
            <>
              {carregandoGrid && !sel.resp.grid && (
                <p className="text-[10px] flex items-center gap-1.5" style={{ color: '#93c5fd' }}>
                  <Loader2 size={12} className="animate-spin" /> Baixando o mapa desta cena…
                </p>
              )}
              {indSel === 'NDVI' && (
                <button onClick={() => setContraste(v => !v)}
                  className="w-full py-1 rounded text-[10px] font-semibold flex items-center justify-center gap-1"
                  style={{ background: contraste ? 'var(--invicta-green-dark)' : '#1a3a6b', color: contraste ? '#fff' : '#93c5fd' }}>
                  <Contrast size={11} /> Contraste {contraste ? 'realçado' : 'normal'}
                </button>
              )}

              <div className="grid grid-cols-3 gap-2 text-center">
                <Metrica rotulo={`${indSel} médio`} valor={fmt2(sel.resp.stats.media)} destaque />
                <Metrica rotulo="mínimo" valor={fmt2(sel.resp.stats.min)} />
                <Metrica rotulo="máximo" valor={fmt2(sel.resp.stats.max)} />
              </div>

              <div className="text-[9px] leading-relaxed" style={{ color: '#64748b' }}>
                grade {sel.resp.stats.nx}×{sel.resp.stats.ny} · pixel <strong style={{ color: '#94a3b8' }}>{sel.resp.stats.pixel_m} m</strong> · {sel.resp.stats.n} px válidos
                {(sel.resp.stats as { pct_validos?: number }).pct_validos != null && <> ({(sel.resp.stats as { pct_validos?: number }).pct_validos}%)</>}
                {sel.mascara && <span style={{ color: '#86efac' }}> · máscara de nuvem aplicada</span>}
                {sel.formula && <><br />fórmula: <span style={{ color: '#94a3b8' }}>{sel.formula}</span></>}
              </div>

              <SeletorLegenda legendas={legendasNdvi} valorId={legNdvi?.id} onEscolher={escolherLegNdvi} />

              <div>
                <div className="h-4 rounded" style={{ border: '1px solid rgba(255,255,255,0.1)', background: gradCss }} />
                <div className="flex justify-between text-[8px] mt-0.5" style={{ color: '#cbd5e1' }}>
                  <span>{fmt2(dominio[0])}</span>
                  <span>{fmt2((dominio[0] + dominio[1]) / 2)}</span>
                  <span>{fmt2(dominio[1])}</span>
                </div>
                <p className="text-[9px] mt-0.5" style={{ color: '#64748b' }}>
                  {legNdvi.nome} · contínua{(contraste || indSel !== 'NDVI') ? ' · esticada p2–p98' : ''}{fonteSel === 'cbers' ? ' · 2 m (PAN)' : ''}
                </p>
              </div>
            </>
          ) : (
            <div className="text-[10px]" style={{ color: '#93c5fd' }}>
              {carregandoImg && !imagens[chaveCenaSel]
                ? <span className="flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Carregando imagem de satélite…</span>
                : <span className="flex items-center gap-1"><ImageIcon size={12} /> Cor verdadeira{fonteSel === 'cbers' ? ' (CBERS-4A 2 m, pan-sharpened)' : ' (Sentinel-2)'}, recortada no talhão.</span>}
            </div>
          )}

          {nav.talhaoId && (
            salvos[selKey] ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9px] flex items-center gap-1" style={{ color: '#86efac' }}>
                    <Star size={11} fill="#86efac" /> {indSel} mantido — guardado neste talhão
                  </span>
                  <button onClick={removerCena} className="text-[10px] font-semibold" style={{ color: '#93c5fd' }}>Remover</button>
                </div>
                {/* Guardar e USAR são decisões diferentes: sem esta marca, a camada
                    fica arquivada e não entra em cálculo nenhum. */}
                {(() => {
                  const ehFonte = !!(nav.talhaoId && fontes[idFonte(nav.talhaoId, chaveCamada(fonteSel, dataSel, indSel))]);
                  return (
                    <button onClick={() => alternarFonte(fonteSel, dataSel, indSel)}
                      className="w-full py-1.5 px-2 rounded text-left flex items-start gap-1.5"
                      style={{ background: ehFonte ? '#0b2a1a' : '#0b1d3a', border: `1px solid ${ehFonte ? '#166534' : '#1a3a6b'}` }}>
                      <Target size={12} className="flex-shrink-0 mt-px" style={{ color: ehFonte ? '#4ade80' : '#64748b' }} />
                      <span>
                        <span className="text-[10px] font-bold block" style={{ color: ehFonte ? '#86efac' : '#94a3b8' }}>
                          {ehFonte ? 'Fonte de análise — ligada' : 'Usar como fonte de análise'}
                        </span>
                        <span className="text-[8px] leading-snug block" style={{ color: '#64748b' }}>
                          {ehFonte
                            ? 'Esta camada entra nas Zonas de Manejo, no Comparador, na Produtividade e na IA.'
                            : 'Sem esta marca a camada fica só arquivada — não entra em cálculo nenhum.'}
                        </span>
                      </span>
                    </button>
                  );
                })()}
              </div>
            ) : (
              <button onClick={manterCena} disabled={!cloudPodeGravar()}
                className="w-full py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1 disabled:opacity-50"
                style={{ background: 'var(--invicta-blue-mid)', color: '#fff' }}>
                <Star size={12} /> Manter {indSel} desta cena{!cloudPodeGravar() ? ' (faça login)' : ''}
              </button>
            )
          )}

          {/* Processar OUTRO índice desta MESMA imagem (a cena já está processada):
              reabre a conferência com os índices ainda NÃO feitos pré-marcados. */}
          <button onClick={() => {
            const cand = candidatos.find(c => c.fonte === fonteSel && c.data === dataSel);
            if (!cand) { setErro('Esta imagem não está mais na lista — refaça a busca para processar outro índice.'); return; }
            setSelIdx({}); setSelKey(''); setPreviaDe(cand);   // nada pré-marcado — o usuário escolhe
          }}
            className="w-full py-1.5 rounded text-[10px] font-semibold flex items-center justify-center gap-1"
            style={{ background: '#1a3a6b', color: '#93c5fd' }}>
            <Play size={11} /> Processar outro índice desta imagem
          </button>
        </div>
      )}
      </>)}
    </div>
  );
}

// ── Aba "Camadas salvas" (IV5, etapa 4 da spec): tudo que está aprovado ──────
// Índices individuais mantidos (nuvem) + composições temporais. Gestão (ver no
// mapa/excluir) fica nas abas de origem; aqui é o inventário do talhão.
// ── PDF rápido para o produtor ────────────────────────────────────────────────
// Marca os mapas (índices MANTIDOS na nuvem + imagens RGB carregadas na sessão)
// e gera um PDF com 1 mapa por página (relatorioNdvi), pronto pra WhatsApp/e-mail.
function GeradorPdfNdvi({ talhaoId, poligono, legNdvi, imagens, info }: {
  talhaoId: string;
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  legNdvi: Legenda | undefined;
  imagens: Record<string, Imagem>;
  info: { produtor: string; fazenda: string; talhao: string; safra: string; areaHa: number };
}) {
  const [aberto, setAberto] = useState(false);
  const [salvos, setSalvosPdf] = useState<NdviCamadaMeta[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!aberto || !talhaoId) return;
    let vivo = true;
    setCarregando(true);
    listarNdviSalvos(talhaoId, true)   // só metadados — os rasters vêm ao gerar (com cache)
      .then(cs => { if (vivo) setSalvosPdf(cs); })
      .catch(() => {})
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [aberto, talhaoId]);

  // Itens disponíveis: RGB da sessão primeiro (mais recentes no topo), depois índices mantidos.
  const itensRgb = Object.entries(imagens).map(([k, img]) => {
    const [fonte, data] = k.split(':');
    return { chave: `rgb:${k}`, titulo: `Imagem real (RGB) · ${ROTULO_FONTE[fonte as FonteNdvi] ?? fonte} · ${ddmmyy(data)}`, img };
  });
  // NDVI tem escala fixa 0–1 no PDF; a variante "contraste realçado" (p2–p98,
  // como o botão Contraste do mapa) entra como 2º item selecionável.
  const itensIdx = salvos.flatMap(c => {
    const rotulo = `${c.indice} · ${c.nut.startsWith('ndvi_cbers') ? 'CBERS-4A' : 'Sentinel-2'} · ${ddmmyy(c.data)}`;
    const base = { chave: `idx:${c.chave}`, titulo: rotulo, camada: c, contraste: false };
    return c.indice === 'NDVI'
      ? [base, { chave: `idxc:${c.chave}`, titulo: `${rotulo} · contraste realçado`, camada: c, contraste: true }]
      : [base];
  });
  const nSel = [...itensRgb, ...itensIdx].filter(i => sel[i.chave]).length;

  async function gerar() {
    if (!legNdvi && itensIdx.some(i => sel[i.chave])) { setErro('Escolha uma legenda de NDVI.'); return; }
    setGerando(true); setErro('');
    try {
      const { gerarRelatorioNdvi } = await import('@/lib/relatorioNdvi');
      const mapas = [];
      for (const it of itensIdx) {
        if (!sel[it.chave]) continue;
        // raster sob demanda (cache local; normal+contraste do mesmo NDVI = 1 download)
        const grid = await carregarGridNdvi(it.camada);
        if (!grid) { setErro(`Falha ao baixar o mapa "${it.titulo}" — tente de novo.`); setGerando(false); return; }
        const dominio: [number, number] = (!it.contraste && it.camada.indice === 'NDVI') ? [0, 1] : percentis(grid, 2, 98);
        const stops = rampaVisualStops({ ...legNdvi!, estilo: 'continuo' });
        const png = colorirGrid(grid, dominio, stops).dataUrl;
        // média p/ a linha do tempo: stats da nuvem; mapas antigos sem stats → calcula do grid
        let media = it.camada.media;
        if (media == null) {
          const { valores } = decodeGrid(grid);
          let soma = 0, n = 0;
          for (let i = 0; i < valores.length; i++) { const v = valores[i]; if (isFinite(v)) { soma += v; n++; } }
          media = n ? soma / n : undefined;
        }
        mapas.push({
          titulo: it.titulo, png, bounds: it.camada.bounds, legenda: legNdvi, dominio, satelite: true,
          serie: `${it.camada.indice} · ${it.camada.nut.startsWith('ndvi_cbers') ? 'CBERS-4A' : 'Sentinel-2'}`,
          data: it.camada.data, media,
        });
      }
      for (const it of itensRgb) {
        if (!sel[it.chave]) continue;
        mapas.push({ titulo: it.titulo, png: it.img.png, bounds: it.img.bounds, satelite: false });
      }
      if (!mapas.length) { setErro('Marque ao menos um mapa.'); setGerando(false); return; }
      await gerarRelatorioNdvi({ ...info, poligono, mapas });
    } catch (e) {
      console.warn('[pdf-ndvi]', e);
      setErro(e instanceof Error ? e.message : 'Falha ao gerar o PDF.');
    }
    setGerando(false);
  }

  return (
    <div className="rounded-lg" style={{ background: '#0a1a2f', border: '1px solid #1a3a6b' }}>
      <button onClick={() => setAberto(v => !v)} className="w-full flex items-center justify-between px-2.5 py-1.5 text-[10px] font-bold" style={{ color: '#93c5fd' }}>
        <span>📄 Gerar PDF para o produtor</span>
        <span>{aberto ? '▾' : '▸'}</span>
      </button>
      {aberto && (
        <div className="px-2.5 pb-2.5 space-y-1.5">
          {carregando && <p className="text-[10px] flex items-center gap-1.5" style={{ color: '#64748b' }}><Loader2 size={11} className="animate-spin" /> Carregando camadas…</p>}
          {!carregando && itensRgb.length === 0 && itensIdx.length === 0 && (
            <p className="text-[10px]" style={{ color: '#64748b' }}>
              Nada disponível ainda — processe e <strong>mantenha</strong> um índice (ou carregue uma imagem RGB) e volte aqui.
            </p>
          )}
          {[...itensRgb, ...itensIdx].map(it => (
            <label key={it.chave} className="flex items-center gap-2 text-[10px] cursor-pointer" style={{ color: '#cbd5e1' }}>
              <input type="checkbox" checked={!!sel[it.chave]}
                onChange={e => setSel(s => ({ ...s, [it.chave]: e.target.checked }))} />
              {it.titulo}
            </label>
          ))}
          {(itensRgb.length > 0 || itensIdx.length > 0) && (
            <button onClick={gerar} disabled={gerando || nSel === 0}
              className="w-full py-1.5 rounded text-[11px] font-bold text-white flex items-center justify-center gap-1.5"
              style={{ background: nSel && !gerando ? '#166534' : '#1a3a6b', opacity: nSel && !gerando ? 1 : 0.7 }}>
              {gerando ? <><Loader2 size={12} className="animate-spin" /> Gerando…</> : `📄 Gerar PDF (${nSel} mapa${nSel === 1 ? '' : 's'})`}
            </button>
          )}
          {erro && <p className="text-[10px] font-semibold" style={{ color: '#f87171' }}>{erro}</p>}
        </div>
      )}
    </div>
  );
}

function CamadasSalvasView({ talhaoId }: { talhaoId: string }) {
  const [inds, setInds] = useState<NdviCamadaMeta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [filtro, setFiltro] = useState<'todas' | 'auto' | 'manuais'>('todas');
  const [excluindo, setExcluindo] = useState(false);
  const [aviso, setAviso] = useState('');
  const [fontes, setFontes] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setFontes(getFontesLocal());
    if (!talhaoId) { setCarregando(false); return; }
    listarNdviSalvos(talhaoId, true).then(cs => { if (vivo) setInds(cs); }).catch(() => {}).finally(() => { if (vivo) setCarregando(false); });
    void carregarFontes(talhaoId).then(f => { if (vivo) setFontes(f); }).catch(() => {});
    return () => { vivo = false; };
  }, [talhaoId]);

  const comps = talhaoId ? getComposicoes(talhaoId) : [];

  const visiveis = inds.filter(c => filtro === 'todas' || (filtro === 'auto' ? c.automatico : !c.automatico));
  const marcadas = visiveis.filter(c => sel[c.itemId]);   // marcadas para EXCLUIR
  const nAuto = inds.filter(c => c.automatico).length;

  // Fonte de análise: a marca que decide quem entra nos cálculos (◎), separada
  // da estrela, que só guarda a camada (★).
  const ehFonte = (c: NdviCamadaMeta) => !!fontes[idFonte(talhaoId, c.chave)];
  const nFontes = inds.filter(ehFonte).length;
  // Esta view é TAMBÉM o que o produtor/leitor vê (o ramo sem pode('ndvi') acima).
  // Para ele a lista é um inventário: sem caixa de excluir e sem trocar as fontes.
  const podeMexer = pode('ndvi');

  function alternarFonteLista(c: NdviCamadaMeta) {
    marcarFonte(talhaoId, c.chave, !ehFonte(c));
    setFontes(getFontesLocal());
  }

  function todasAsFontes(v: boolean) {
    marcarFontes(talhaoId, visiveis.map(c => c.chave), v);
    setFontes(getFontesLocal());
  }

  async function excluirSelecionadas() {
    if (marcadas.length === 0) return;
    setExcluindo(true); setAviso('');
    try {
      const ids = marcadas.map(c => c.itemId);
      const n = await cloudExcluirMapas(ids);
      // 0 sem erro = RLS negando em silêncio. Some da tela só o que saiu do banco.
      if (n === 0) {
        setAviso('O servidor não confirmou a exclusão — as camadas continuam lá. Verifique suas permissões.');
      } else {
        setInds(atual => atual.filter(c => !ids.includes(c.itemId)));
        setSel({});
        if (n < ids.length) setAviso(`${n} de ${ids.length} apagadas — as demais foram recusadas pelo servidor.`);
      }
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'Falha ao excluir.');
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg p-2.5 space-y-1.5" style={{ background: '#0a1a2f', border: '1px solid #1a3a6b' }}>
        <p className="text-[10px] font-bold flex items-center gap-1.5" style={{ color: '#93c5fd' }}><Star size={11} /> Índices individuais mantidos ({inds.length})</p>

        {/* Guardar ≠ usar. Esta linha existe para o zero não passar despercebido:
            sem nenhuma fonte marcada, a geração de zonas fica sem satélite. */}
        {inds.length > 0 && podeMexer && (
          <div className="rounded p-1.5 flex items-start gap-1.5"
            style={{ background: nFontes ? '#0b2a1a' : '#2d1a00', border: `1px solid ${nFontes ? '#166534' : '#92400e'}` }}>
            <Target size={11} className="flex-shrink-0 mt-px" style={{ color: nFontes ? '#4ade80' : '#fbbf24' }} />
            <p className="text-[9px] leading-snug" style={{ color: nFontes ? '#86efac' : '#fbbf24' }}>
              {nFontes
                ? `${nFontes} de ${inds.length} marcada${nFontes > 1 ? 's' : ''} como fonte de análise — só ela${nFontes > 1 ? 's' : ''} entra${nFontes > 1 ? 'm' : ''} nas Zonas de Manejo, no Comparador, na Produtividade e na IA.`
                : 'Nenhuma camada marcada como fonte de análise: a geração de Zonas de Manejo vai rodar SEM satélite. Toque no alvo (◎) das que você quer usar.'}
            </p>
          </div>
        )}

        {nAuto > 0 && (
          <div className="flex gap-1">
            {([['todas', `Todas (${inds.length})`], ['auto', `🤖 Automáticas (${nAuto})`], ['manuais', `Feitas à mão (${inds.length - nAuto})`]] as ['todas' | 'auto' | 'manuais', string][]).map(([f, r]) => (
              <button key={f} onClick={() => { setFiltro(f); setSel({}); }}
                className="flex-1 py-0.5 rounded text-[9px] font-bold"
                style={{ background: filtro === f ? 'var(--invicta-blue-mid)' : '#0b1d3a', border: '1px solid #1a3a6b', color: filtro === f ? '#fff' : '#93c5fd' }}>
                {r}
              </button>
            ))}
          </div>
        )}

        {carregando ? (
          <p className="text-[10px] flex items-center gap-1.5" style={{ color: '#64748b' }}><Loader2 size={11} className="animate-spin" /> Carregando…</p>
        ) : visiveis.length === 0 ? (
          <p className="text-[10px]" style={{ color: '#64748b' }}>
            {inds.length === 0 ? 'Nenhum índice mantido — processe e mantenha na aba Imagens & índices.' : 'Nenhuma camada neste filtro.'}
          </p>
        ) : (
          <>
            {podeMexer && (
              <div className="flex items-center justify-between text-[9px]" style={{ color: '#64748b' }}>
                <button onClick={() => setSel(marcadas.length === visiveis.length ? {} : Object.fromEntries(visiveis.map(c => [c.itemId, true])))}>
                  {marcadas.length === visiveis.length ? 'desmarcar todas' : 'selecionar todas'}
                </button>
                <span className="flex items-center gap-2">
                  <button onClick={() => todasAsFontes(true)} style={{ color: '#4ade80' }}>◎ todas</button>
                  <button onClick={() => todasAsFontes(false)} style={{ color: '#64748b' }}>◎ nenhuma</button>
                </span>
              </div>
            )}
            {visiveis.map(c => (
              <div key={c.chave} className="flex items-start gap-1.5">
                {podeMexer && (
                  <input type="checkbox" checked={!!sel[c.itemId]}
                    onChange={e => setSel(s => ({ ...s, [c.itemId]: e.target.checked }))}
                    title="selecionar para excluir"
                    className="accent-green-600 flex-shrink-0 cursor-pointer" style={{ width: 12, height: 12, marginTop: 2 }} />
                )}
                <span className="text-[9px] flex-1 min-w-0" style={{ color: '#cbd5e1' }}>
                  <strong>{c.indice}</strong> · {new Date(c.data + 'T00:00:00').toLocaleDateString('pt-BR')} · {c.nut.startsWith('ndvi_cbers') ? 'CBERS-4A' : 'Sentinel-2'}{c.nx && c.ny ? ` · ${c.ny}×${c.nx} px` : ''}
                  {c.automatico && <span title="gerada pela busca automática de madrugada"> · 🤖</span>}
                  {c.automatico && c.pctLimpo != null && <span style={{ color: '#64748b' }}> {c.pctLimpo}% limpo</span>}
                </span>
                <button onClick={() => podeMexer && alternarFonteLista(c)} disabled={!podeMexer}
                  className="flex-shrink-0 p-0.5 rounded"
                  title={ehFonte(c)
                    ? (podeMexer ? 'Fonte de análise LIGADA — clique para desligar' : 'Fonte de análise')
                    : (podeMexer ? 'Arquivada — clique para usar nas análises' : 'Arquivada (não entra nas análises)')}
                  style={{ background: ehFonte(c) ? '#0b2a1a' : 'transparent', border: `1px solid ${ehFonte(c) ? '#166534' : '#1a3a6b'}`, cursor: podeMexer ? 'pointer' : 'default' }}>
                  <Target size={11} style={{ color: ehFonte(c) ? '#4ade80' : '#475569' }} />
                </button>
              </div>
            ))}
            {podeMexer && marcadas.length > 0 && (
              <button onClick={() => void excluirSelecionadas()} disabled={excluindo}
                className="w-full py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1.5"
                style={{ background: '#7f1d1d' }}>
                {excluindo ? <><Loader2 size={11} className="animate-spin" /> Excluindo…</> : <><Trash2 size={11} /> Excluir {marcadas.length} selecionada{marcadas.length > 1 ? 's' : ''} do banco</>}
              </button>
            )}
          </>
        )}
        {aviso && <p className="text-[9px]" style={{ color: '#fbbf24' }}>{aviso}</p>}
      </div>
      <ListaComposicoes salvas={comps} />
      <p className="text-[9px] leading-relaxed" style={{ color: '#475569' }}>
        <Layers3 size={9} className="inline mr-0.5" /> Guardar (★) e usar (◎) são coisas diferentes: a estrela arquiva a camada no talhão; o alvo é o que a libera como fonte na Zona de Manejo (Sensoriamento Remoto), no Comparador, na Produtividade e na IA. Composições temporais seguem a própria regra (aprovada e apta).
      </p>
    </div>
  );
}

// ── Linha do tempo dos índices salvos (IV4 — spec seção 19) ──────────────────
// Média de cada índice mantido ao longo das datas; 1 série por índice+sensor.
const CORES_SERIE = ['#4ade80', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa', '#f87171', '#34d399', '#fb923c'];

function TimelineIndices({ cenas, salvos, selKey, onSel }: {
  cenas: Record<string, MapaNdvi>; salvos: Record<string, boolean>;
  selKey: string; onSel: (k: string) => void;
}) {
  const [ocultas, setOcultas] = useState<Record<string, boolean>>({});
  const pontos = useMemo(() => Object.entries(cenas)
    .filter(([k, m]) => salvos[k] && m.resp?.stats?.media != null && m.resp?.cena?.data)
    .map(([k, m]) => {
      const [f, d, ind] = k.split(':');
      return { k, serie: `${ind ?? 'NDVI'} ${f === 'cbers' ? 'C4A' : 'S2'}`, data: d, media: m.resp.stats.media as number };
    })
    .sort((a, b) => a.data.localeCompare(b.data)), [cenas, salvos]);
  const series = useMemo(() => [...new Set(pontos.map(p => p.serie))], [pontos]);
  if (pontos.length < 2) return null;

  const datas = [...new Set(pontos.map(p => p.data))].sort();
  const visiveis = pontos.filter(p => !ocultas[p.serie]);
  const base = visiveis.length ? visiveis : pontos;
  let lo = Math.min(...base.map(p => p.media)), hi = Math.max(...base.map(p => p.media));
  if (hi - lo < 0.05) { lo -= 0.05; hi += 0.05; }
  const W = 300, H = 90, PL = 30, PR = 8, PT = 8, PB = 16;
  const x = (d: string) => PL + (datas.length === 1 ? 0 : (datas.indexOf(d) / (datas.length - 1)) * (W - PL - PR));
  const y = (v: number) => PT + (1 - (v - lo) / (hi - lo)) * (H - PT - PB);
  const cor = (s: string) => CORES_SERIE[series.indexOf(s) % CORES_SERIE.length];

  return (
    <div className="p-2.5 rounded-lg space-y-1.5" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
      <p className="text-[10px] font-semibold" style={{ color: '#93c5fd' }}>Linha do tempo — média dos índices salvos</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 90 }}>
        <text x={PL - 4} y={y(hi) + 3} textAnchor="end" fontSize={7} fill="#64748b">{hi.toFixed(2)}</text>
        <text x={PL - 4} y={y(lo) + 3} textAnchor="end" fontSize={7} fill="#64748b">{lo.toFixed(2)}</text>
        <line x1={PL} y1={PT} x2={PL} y2={H - PB} stroke="#1a3a6b" strokeWidth={0.5} />
        <line x1={PL} y1={H - PB} x2={W - PR} y2={H - PB} stroke="#1a3a6b" strokeWidth={0.5} />
        <text x={PL} y={H - 4} fontSize={7} fill="#64748b">{ddmmyy(datas[0])}</text>
        <text x={W - PR} y={H - 4} textAnchor="end" fontSize={7} fill="#64748b">{ddmmyy(datas[datas.length - 1])}</text>
        {series.filter(s => !ocultas[s]).map(s => {
          const ps = pontos.filter(p => p.serie === s);
          return (
            <g key={s}>
              {ps.length > 1 && (
                <polyline points={ps.map(p => `${x(p.data)},${y(p.media)}`).join(' ')}
                  fill="none" stroke={cor(s)} strokeWidth={1.2} opacity={0.85} />
              )}
              {ps.map(p => (
                <circle key={p.k} cx={x(p.data)} cy={y(p.media)} r={p.k === selKey ? 3.5 : 2.5}
                  fill={cor(s)} stroke={p.k === selKey ? '#fff' : 'none'} strokeWidth={1}
                  style={{ cursor: 'pointer' }} onClick={() => onSel(p.k)}>
                  <title>{s} · {ddmmyy(p.data)} · média {p.media.toFixed(2)}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-1">
        {series.map(s => (
          <button key={s} onClick={() => setOcultas(o => ({ ...o, [s]: !o[s] }))}
            className="px-1.5 py-0.5 rounded-full text-[9px] font-bold flex items-center gap-1"
            style={{ background: '#0b1d3a', border: '1px solid #1a3a6b', color: ocultas[s] ? '#475569' : cor(s), opacity: ocultas[s] ? 0.6 : 1 }}>
            <span style={{ width: 7, height: 7, borderRadius: 4, background: ocultas[s] ? '#475569' : cor(s), display: 'inline-block' }} />
            {s}
          </button>
        ))}
      </div>
      <p className="text-[8px]" style={{ color: '#475569' }}>Toque num ponto para abrir o mapa daquela data. Clique numa série para ocultar/mostrar.</p>
    </div>
  );
}

function Metrica({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="rounded-lg py-1.5" style={{ background: '#0b1f3a', border: '1px solid #1a3a6b' }}>
      <div className="text-sm font-bold" style={{ color: destaque ? '#86efac' : '#e2e8f0' }}>{valor}</div>
      <div className="text-[9px]" style={{ color: '#64748b' }}>{rotulo}</div>
    </div>
  );
}

function Aviso({ texto }: { texto: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: '#2d1a00', border: '1px solid #92400e' }}>
      <AlertTriangle size={14} style={{ color: '#fbbf24' }} className="flex-shrink-0 mt-0.5" />
      <p className="text-[10px]" style={{ color: '#fbbf24' }}>{texto}</p>
    </div>
  );
}
