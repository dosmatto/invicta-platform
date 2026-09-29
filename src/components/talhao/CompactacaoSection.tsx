'use client';

// Aba Compactação (penetrometria): importa pontos georreferenciados com a
// resistência (MPa) por profundidade (mapeamento de colunas), e interpola um
// raster por profundidade reaproveitando o motor da Fertilidade + a legenda
// oficial de Compactação. O raster usa o mesmo canal do mapa (fertilidadeOverlay)
// e é PERSISTIDO na nuvem (autoload + gzip), igual à Fertilidade.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/context/AppContext';
import {
  getTalhoes, getLegendasPorAtributo, getImportacoesCompactacao, saveImportacaoCompactacao,
  deleteImportacaoCompactacao, getGradesCompactacao,
  type ImportacaoCompactacao, type GradeCompactacao,
} from '@/lib/store';
import {
  interpolar, rampaDaLegenda, gradienteCss, coordsFromBounds, extrairPoligono,
  comprimirGrid, descomprimirGrid, type RespInterp,
  interpoladorEfetivo, MIN_PTS_MAPA, MIN_PTS_KRIGE,
} from '@/lib/fertilidade';
import { colorirGridComLegenda, temGrid } from '@/lib/raster';
import { cloudSalvarMapa, cloudCarregarMapasPorPrefixo, cloudExcluirMapasPorPrefixo } from '@/lib/cloud';
import { parseArquivoPontos, pontosCompactacao, type ArquivoPontos } from '@/lib/compactacao';
import { estatisticaCamada, casarComGrade } from '@/lib/compactacaoFalker';
import { GradeCompactacaoEditor } from './GradeCompactacaoEditor';
import type { Legenda } from '@/lib/legendas';
import { Upload, Loader2, Activity, Eraser, AlertTriangle, Save, Trash2, Play, Plus, Layers, MapPin, FileDown } from 'lucide-react';
import { podeCompactacao, podeEm } from '@/lib/empresa';
import { gerarRelatorioCompactacao, montarDadosCompactacao, prefixoNuvemCompactacao } from '@/lib/relatorioCompactacao';
import { camadasFaltando } from '@/lib/relatorioCompactacaoCalc';
import { salvarRelatorio, TIPO_REL_COMPACTACAO } from '@/lib/relatoriosArquivo';
import { emailUsuario } from '@/lib/auth';

// Quem NÃO processa compactação (produtor, leitor) só troca importação/profundidade
// e vê o mapa — sem importar, criar grade, interpolar, limpar ou excluir.
// Cada ação segue a linha "Compactação" da matriz de permissões.
const podeProcessar = () => podeCompactacao('criar');
const podeExcluir = () => podeCompactacao('excluir');

import { inputStyle } from '@/constants/ui';
import { hojeSaoPauloISO, periodoDeData, rotuloEpoca } from '@/lib/periodo';
import { fmtMax2 as fmt } from '@/lib/formato';

// Resolução do mapa de compactação. 5 m é o padrão do app (igual à Fertilidade e
// à Condutividade) — aqui era 20 m fixo, sem opção, e o mapa saía em blocos.
const PIXEL_COMP_PADRAO = 5;
const PIXEIS_COMP = [2, 3, 5, 10, 15, 20, 25, 30];

type Ponto = { lng: number; lat: number; valor: number };
type MapaPronto = { resp: RespInterp; labels: GeoJSON.FeatureCollection };

// Persistência na nuvem (coleção inv_mapas_fert, compartilhada): namespace
// próprio para não colidir com os mapas de fertilidade.
const prefixoNuvem = prefixoNuvemCompactacao;
const idNuvem = (talhaoId: string, importacaoId: string, prof: string) => `${prefixoNuvem(talhaoId, importacaoId)}${prof}`;

export function CompactacaoSection({ safraNome }: { safraNome?: string } = {}) {
  const { nav, uploadedGeo, setFertilidadeOverlay, setFertilidadeLabels, setPontosSimulados } = useApp();
  const safra = safraNome ?? '';

  // Ordem canônica (padrão → sistema → nome) — a mesma dos demais mapas.
  const legenda = useMemo<Legenda | null>(() => getLegendasPorAtributo('compactacao')[0] ?? null, []);

  const poligono = useMemo(() => {
    const p = extrairPoligono(uploadedGeo);
    if (p) return p;
    if (!nav.talhaoId) return null;
    const t = getTalhoes().find(x => x.id === nav.talhaoId);
    if (t?.geojson) { try { return extrairPoligono(JSON.parse(t.geojson)); } catch {} }
    return null;
  }, [uploadedGeo, nav.talhaoId]);

  const [importacoes, setImportacoes] = useState<ImportacaoCompactacao[]>([]);
  const [importacaoId, setImportacaoId] = useState('');
  const [profundidade, setProfundidade] = useState('');
  const [modoUpload, setModoUpload] = useState(false);

  // upload + mapeamento
  const inputRef = useRef<HTMLInputElement>(null);
  const [arq, setArq] = useState<ArquivoPontos | null>(null);
  const [colsSel, setColsSel] = useState<string[]>([]);
  const [nome, setNome] = useState('');
  const [dataRef, setDataRef] = useState<string>(() => hojeSaoPauloISO());
  const [parseErro, setParseErro] = useState('');

  // Cobertura: o arquivo da Falker contra uma grade planejada (opcional).
  const [gradesTalhao, setGradesTalhao] = useState<GradeCompactacao[]>([]);
  const [gradeCobId, setGradeCobId] = useState('');
  const [verFaltantes, setVerFaltantes] = useState(false);
  useEffect(() => {
    setGradesTalhao(nav.talhaoId && safra ? getGradesCompactacao(nav.talhaoId, safra) : []);
    setGradeCobId('');
  }, [nav.talhaoId, safra]);
  const gradeCob = gradesTalhao.find(g => g.id === gradeCobId) ?? null;
  const cobertura = useMemo(
    () => (arq?.falker && gradeCob ? casarComGrade(arq.falker.pontos, gradeCob.pontos, 30) : null),
    [arq, gradeCob],
  );
  // Destaque no mapa: medidos em verde, faltantes em vermelho (canal pontosSimulados,
  // só enquanto ligado). O canal é dividido com o editor de grade — um dono por
  // vez: ligar aqui tira a grade vista de lá (coberturaNoMapa), e o editor, ao
  // publicar, desliga este (onUsarMapa). Ao sair, só limpa se ainda for o dono.
  const coberturaNoMapa = verFaltantes && !!cobertura && !!gradeCob;
  useEffect(() => {
    if (!verFaltantes || !cobertura || !gradeCob) return;
    const publicado: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: gradeCob.pontos.map(p => {
        const falta = !cobertura.porPonto[p.ordem];
        return {
          type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
          properties: { ordem: p.ordem, label: `C-${p.ordem + 1}`, profs: 1, cor: falta ? '#ef4444' : '#22c55e' },
        };
      }),
    };
    setPontosSimulados(publicado);
    return () => setPontosSimulados(cur => (cur === publicado ? null : cur));
  }, [verFaltantes, cobertura, gradeCob, setPontosSimulados]);

  // interpolação
  const [estado, setEstado] = useState<'idle' | 'processando' | 'pronto' | 'erro'>('idle');
  const [erro, setErro] = useState('');
  // Camada que teve de sair por IDW (poucos pontos). Aviso da rodada, não estado.
  const [quedaIdw, setQuedaIdw] = useState('');
  // Mapas prontos, SEMPRE marcados com a importação a que pertencem: um
  // resultado que chega depois da troca de importação (interpolação ou autoload
  // ainda em voo) é descartado em vez de entrar no cache — e no PDF — da outra.
  const [cacheSt, setCacheSt] = useState<{ imp: string; mapas: Record<string, MapaPronto> }>({ imp: '', mapas: {} });
  // Importação exibida agora (lida depois dos awaits, fora do closure).
  const importacaoAtualRef = useRef('');
  const [pixelM, setPixelM] = useState(PIXEL_COMP_PADRAO);
  // Método de interpolação escolhido (Krigagem é o padrão; IDW é opção).
  const [metodoSel, setMetodoSel] = useState<'krige' | 'idw'>('krige');
  // "Interpolar todas as camadas": progresso n/total da rodada sequencial.
  const [progresso, setProgresso] = useState<{ n: number; total: number } | null>(null);
  // Relatório PDF
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [pdfMsg, setPdfMsg] = useState<{ erro: boolean; txt: string } | null>(null);

  function recarregar() {
    if (nav.talhaoId && safra) {
      const lst = getImportacoesCompactacao(nav.talhaoId, safra);
      setImportacoes(lst);
      setImportacaoId(prev => prev || lst[0]?.id || '');
      if (lst.length === 0) setModoUpload(true);
    } else { setImportacoes([]); setImportacaoId(''); }
  }
  useEffect(recarregar, [nav.talhaoId, safra]); // eslint-disable-line react-hooks/exhaustive-deps

  const importacao = importacoes.find(i => i.id === importacaoId) ?? null;
  useEffect(() => { importacaoAtualRef.current = importacaoId; }, [importacaoId]);
  const cache = useMemo(() => (cacheSt.imp === importacaoId ? cacheSt.mapas : {}), [cacheSt, importacaoId]);
  // Grava mapas só se o cache ainda for da importação `imp`.
  const gravarNoCache = (imp: string, f: (m: Record<string, MapaPronto>) => Record<string, MapaPronto>) =>
    setCacheSt(c => (c.imp === imp ? { imp, mapas: f(c.mapas) } : c));

  useEffect(() => { setProfundidade(importacao?.profundidades[0] ?? ''); }, [importacaoId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autoload: hidrata da nuvem os rasters já interpolados desta importação.
  useEffect(() => {
    setCacheSt({ imp: importacaoId, mapas: {} }); setEstado('idle'); setErro(''); setQuedaIdw(''); setProgresso(null);
    if (!nav.talhaoId || !importacaoId) return;
    const imp = importacaoId;
    const prefixo = prefixoNuvem(nav.talhaoId, imp);
    (async () => {
      const carregados = await cloudCarregarMapasPorPrefixo<MapaPronto>(prefixo);
      if (carregados.length === 0) return;
      const novo: Record<string, MapaPronto> = {};
      for (const c of carregados) {
        const prof = c.id.slice(prefixo.length);
        const dados = c.dados;
        if (dados.resp?.grid?.comp === 'gz') {
          try { dados.resp.grid = await descomprimirGrid(dados.resp.grid); }
          catch (e) { console.warn('[compactacao] falha ao descomprimir grid:', e); }
        }
        novo[prof] = dados;
      }
      // Mantém o que já foi interpolado nesta sessão (mais novo que a nuvem).
      gravarNoCache(imp, m => ({ ...novo, ...m }));
    })();
  }, [importacaoId, nav.talhaoId]);

  useEffect(() => () => { setFertilidadeOverlay(null); setFertilidadeLabels(null); }, [setFertilidadeOverlay, setFertilidadeLabels]);

  // exibe o raster da profundidade selecionada (colore local a partir do grid)
  useEffect(() => {
    const c = cache[profundidade];
    if (!c || !legenda) { setFertilidadeOverlay(null); setFertilidadeLabels(null); return; }
    let url = '';
    if (temGrid(c.resp)) { try { url = colorirGridComLegenda(c.resp.grid!, legenda).dataUrl; } catch { /* cai no png */ } }
    if (!url && c.resp.png) url = c.resp.png;
    if (!url) { setFertilidadeOverlay(null); setFertilidadeLabels(null); return; }
    setFertilidadeOverlay({ url, coordinates: coordsFromBounds(c.resp.bounds), opacity: 1 });
    setFertilidadeLabels(c.labels);
  }, [profundidade, cache, legenda, setFertilidadeOverlay, setFertilidadeLabels]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setParseErro(''); setArq(null); setVerFaltantes(false);
    try {
      const r = await parseArquivoPontos(file);
      setArq(r);
      if (r.falker) {
        // Falker: camadas já prontas; nome = "Pasta:", data = coluna Data.
        setColsSel(r.falker.profundidades);
        setNome(r.falker.nome || file.name.replace(/\.[^.]+$/, ''));
        setDataRef(r.falker.dataReferencia ?? hojeSaoPauloISO());
      } else {
        setColsSel(r.colunasNumericas);
        setNome(file.name.replace(/\.[^.]+$/, ''));
      }
    } catch (err) {
      setParseErro(err instanceof Error ? err.message : 'Falha ao ler o arquivo.');
    }
  }

  // Vindo da grade 'falker' ("Importar arquivo da Falker desta grade"): abre a
  // importação já com essa grade escolhida para conferir a cobertura.
  const uploadRef = useRef<HTMLDivElement>(null);
  function importarFalkerDaGrade(gradeId: string) {
    if (!nav.talhaoId) return;
    setGradesTalhao(getGradesCompactacao(nav.talhaoId, safra));
    setGradeCobId(gradeId);
    setVerFaltantes(false);
    setModoUpload(true);
    if (arq?.falker) { uploadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); return; }
    // Já montado: abre o seletor ainda dentro do clique. Senão, no próximo quadro.
    if (inputRef.current) inputRef.current.click();
    else setTimeout(() => { inputRef.current?.click(); uploadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 0);
  }

  function toggleCol(c: string) {
    setColsSel(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
  }

  function salvarImportacao() {
    if (!arq || !nav.talhaoId || !safra || colsSel.length === 0) return;
    const nova = saveImportacaoCompactacao(arq.falker ? {
      talhaoId: nav.talhaoId, safra, nome: nome.trim() || 'Penetrometria Falker',
      profundidades: arq.falker.profundidades, dataReferencia: dataRef,
      pontos: arq.falker.pontos,
    } : {
      talhaoId: nav.talhaoId, safra, nome: nome.trim() || 'Penetrometria',
      profundidades: colsSel, dataReferencia: dataRef,
      pontos: pontosCompactacao(arq.pontos, colsSel),
    });
    setArq(null); setColsSel([]); setNome(''); setDataRef(hojeSaoPauloISO()); setModoUpload(false);
    setImportacoes(getImportacoesCompactacao(nav.talhaoId, safra));
    setImportacaoId(nova.id);
  }

  function pontosDe(prof: string): Ponto[] {
    if (!importacao) return [];
    const out: Ponto[] = [];
    for (const p of importacao.pontos) {
      const v = p.valores[prof];
      if (v == null || !isFinite(v)) continue;
      out.push({ lng: p.lng, lat: p.lat, valor: v });
    }
    return out;
  }
  function fcLabels(pts: Ponto[]): GeoJSON.FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: pts.map(p => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { txt: fmt(p.valor) },
      })),
    };
  }

  // Interpola UMA camada e persiste. Não mexe no estado da tela — devolve o
  // erro/aviso para quem chamou (uma camada ou a rodada "todas as camadas").
  // `imp` = importação em que a rodada começou: o resultado só entra no cache
  // se ela ainda for a exibida; a nuvem grava sempre no id de `imp` (correto).
  async function interpolarCamada(prof: string, imp: string): Promise<{ erro?: string; aviso?: string }> {
    if (!legenda) return { erro: 'Legenda de compactação não encontrada.' };
    if (!poligono) return { erro: 'Limite do talhão não encontrado — abra o talhão no mapa.' };
    const pts = pontosDe(prof);
    if (pts.length < MIN_PTS_MAPA) return { erro: `${prof}: menos de ${MIN_PTS_MAPA} pontos válidos.` };
    try {
      const { dominio, stops } = rampaDaLegenda(legenda);
      // Mesma regra da Fertilidade: com menos de 4 pontos a krigagem não ajusta
      // o variograma e o backend devolve "nao convergiu". Na penetrometria isso
      // aparece na camada mais funda, medida em menos pontos que as de cima.
      const { metodo, caiuParaIdw } = interpoladorEfetivo(metodoSel, pts.length);
      const aviso = caiuParaIdw ? `${prof}: só ${pts.length} pontos — mapa por IDW (a krigagem precisa de ${MIN_PTS_KRIGE}).` : undefined;
      const resp = await interpolar({ pontos: pts, poligono, dominio, stops, metodo, pixelM, modeloFixo: null });
      const labels = fcLabels(pts);
      gravarNoCache(imp, m => ({ ...m, [prof]: { resp, labels } }));
      // Persiste na nuvem (grid comprimido; sem PNG — colorimos local).
      if (nav.talhaoId && imp) {
        const gridGz = resp.grid ? await comprimirGrid(resp.grid) : undefined;
        const dados: MapaPronto = { resp: { ...resp, png: '', grid: gridGz }, labels };
        cloudSalvarMapa(idNuvem(nav.talhaoId, imp, prof), dados);
      }
      return { aviso };
    } catch (e) {
      return { erro: `${prof}: ${e instanceof Error ? e.message : 'Falha ao interpolar.'}` };
    }
  }

  async function processar(prof: string) {
    const imp = importacaoId;
    setEstado('processando'); setErro(''); setQuedaIdw('');
    const r = await interpolarCamada(prof, imp);
    if (importacaoAtualRef.current !== imp) return;   // trocou de importação: a tela já é de outra
    if (r.aviso) setQuedaIdw(r.aviso);
    if (r.erro) { setErro(r.erro); setEstado('erro'); } else setEstado('pronto');
  }

  // Todas as camadas, uma por vez (o backend interpola uma de cada vez); uma
  // camada que falha não interrompe as demais — os erros aparecem juntos no fim.
  async function processarTodas() {
    if (!importacao) return;
    const imp = importacao.id;
    const profs = importacao.profundidades;
    setEstado('processando'); setErro(''); setQuedaIdw('');
    const erros: string[] = [], avisos: string[] = [];
    for (let i = 0; i < profs.length; i++) {
      // Trocou de importação no meio da rodada (o seletor fica travado, mas criar
      // levantamento/salvar importação também trocam): para aqui, sem tocar na tela.
      if (importacaoAtualRef.current !== imp) return;
      setProgresso({ n: i + 1, total: profs.length });
      setProfundidade(profs[i]);
      const r = await interpolarCamada(profs[i], imp);
      if (r.erro) erros.push(r.erro);
      if (r.aviso) avisos.push(r.aviso);
    }
    if (importacaoAtualRef.current !== imp) return;
    setProgresso(null);
    if (avisos.length) setQuedaIdw(avisos.join(' · '));
    if (erros.length) { setErro(erros.join(' · ')); setEstado('erro'); } else setEstado('pronto');
  }

  function limparProf(prof: string) {
    gravarNoCache(importacaoId, m => { const n = { ...m }; delete n[prof]; return n; });
    if (nav.talhaoId && importacaoId) cloudExcluirMapasPorPrefixo(idNuvem(nav.talhaoId, importacaoId, prof));
  }

  function excluirImportacao() {
    if (!importacaoId) return;
    if (!confirm('Excluir esta importação de compactação (e seus mapas)?')) return;
    if (nav.talhaoId) cloudExcluirMapasPorPrefixo(prefixoNuvem(nav.talhaoId, importacaoId));
    deleteImportacaoCompactacao(importacaoId);
    setImportacaoId('');
    recarregar();
  }

  // Relatório PDF (resumo + 1 página por camada + tabela). Exige TODAS as camadas
  // da importação interpoladas; arquiva a configuração no histórico de relatórios
  // (aba Relatórios / portal) para quem cria relatórios.
  async function gerarPdf() {
    if (!importacao || !legenda || !nav.talhaoId || gerandoPdf) return;
    const mapas: Record<string, RespInterp> = {};
    for (const [p, c] of Object.entries(cache)) if (temGrid(c.resp)) mapas[p] = c.resp;
    const dados = montarDadosCompactacao({ talhaoId: nav.talhaoId, importacao, mapas, legenda, poligono });
    if ('erro' in dados) { setPdfMsg({ erro: true, txt: dados.erro }); return; }
    setGerandoPdf(true); setPdfMsg(null);
    try {
      const { paginas } = await gerarRelatorioCompactacao(dados);
      if (podeEm('relatorios', 'criar')) {
        try {
          await salvarRelatorio({
            talhaoId: nav.talhaoId, safra, tipo: TIPO_REL_COMPACTACAO,
            titulo: `${importacao.nome} (${importacao.profundidades.length} camadas)`,
            nuts: [], elementos: importacao.profundidades,
            satelite: dados.satelite, valores: true, paginas,
            importacaoId: importacao.id,
            geradoPor: emailUsuario() ?? '—',
          });
        } catch (e) {
          setPdfMsg({ erro: false, txt: 'PDF gerado, mas não foi registrado no histórico de relatórios. ' + (e instanceof Error ? e.message : '') });
        }
      }
    } catch (e) {
      setPdfMsg({ erro: true, txt: e instanceof Error ? e.message : 'Falha ao gerar o PDF.' });
    } finally { setGerandoPdf(false); }
  }

  if (!safra) return <div className="px-6 py-4"><Aviso texto="Defina um Ano (no topo do talhão) para a compactação." /></div>;
  if (!legenda) return <div className="px-6 py-4"><Aviso texto="Legenda de Compactação não encontrada na Biblioteca (Sistema)." /></div>;

  const mostrarUpload = modoUpload || importacoes.length === 0;
  const processando = estado === 'processando';
  const mapasSalvos = Object.keys(cache).length;

  if (!podeCompactacao('visualizar')) return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: '#2d1a00', border: '1px solid #92400e' }}>
        <AlertTriangle size={14} style={{ color: '#fbbf24' }} className="flex-shrink-0 mt-0.5" />
        <p className="text-[10px]" style={{ color: '#fbbf24' }}>Seu acesso não inclui Compactação. Peça ao administrador para liberar em Usuários e permissões.</p>
      </div>
    </div>
  );

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Seletor de importação + nova */}
      {importacoes.length > 0 && (
        <div>
          <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Importação de penetrometria</label>
          <div className="flex gap-1">
            {/* Travado enquanto interpola ou gera o PDF: os mapas da rodada são desta importação. */}
            <select value={importacaoId} onChange={e => setImportacaoId(e.target.value)} disabled={processando || gerandoPdf}
              title={processando || gerandoPdf ? 'Aguarde terminar a interpolação / o PDF para trocar de importação' : undefined}
              className="flex-1 rounded px-2 py-1.5 text-xs outline-none disabled:opacity-60" style={inputStyle}>
              {importacoes.map(i => <option key={i.id} value={i.id}>{i.nome} · {i.pontos.length} pts · {i.profundidades.length} prof.</option>)}
            </select>
{podeProcessar() && (            <button onClick={() => setModoUpload(v => !v)} title="Nova importação"
              className="px-2 py-1.5 rounded text-[10px] font-bold flex items-center gap-1" style={{ background: 'var(--invicta-green-dark)', color: '#fff' }}>
              <Plus size={11} />
            </button>)}
            {podeExcluir() && importacao && (
              <button onClick={excluirImportacao} title="Excluir importação" disabled={processando || gerandoPdf}
                className="px-2 py-1.5 rounded text-[10px] disabled:opacity-40" style={{ background: '#1a3a6b', color: '#f87171' }}>
                <Trash2 size={12} />
              </button>
            )}
          </div>
          {mapasSalvos > 0 && (
            <p className="text-[10px] mt-1 flex items-center gap-1" style={{ color: '#86efac' }}>
              <Layers size={10} /> {mapasSalvos} {mapasSalvos === 1 ? 'mapa salvo' : 'mapas salvos'} na nuvem — carregam sem reprocessar.
            </p>
          )}
        </div>
      )}

      {/* #36 — Grade de compactação: plataforma cria, app de campo coleta, aqui vira levantamento */}
      {podeProcessar() && nav.talhaoId && (
        <GradeCompactacaoEditor talhaoId={nav.talhaoId} safra={safra} poligono={poligono}
          podeExcluir={podeExcluir()}
          onGradesMudaram={() => setGradesTalhao(getGradesCompactacao(nav.talhaoId ?? '', safra))}
          onLevantamentoCriado={id => { recarregar(); setImportacaoId(id); setModoUpload(false); }}
          onImportarFalker={importarFalkerDaGrade}
          coberturaNoMapa={coberturaNoMapa} onUsarMapa={() => setVerFaltantes(false)} />
      )}

      {/* Upload + mapeamento de colunas */}
      {podeProcessar() && mostrarUpload && (
        <div ref={uploadRef} className="rounded-lg p-3 space-y-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
          <p className="text-[11px] font-semibold" style={{ color: '#93c5fd' }}>Importar pontos do penetrômetro</p>
          <button onClick={() => inputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold"
            style={{ background: '#1a3a6b', color: '#93c5fd', border: '1px dashed #2e5fa3' }}>
            <Upload size={13} /> Escolher arquivo (SHP .zip · KML · GeoJSON · CSV · XLSX)
          </button>
          <input ref={inputRef} type="file" accept=".zip,.kml,.geojson,.json,.csv,.txt,.xls,.xlsx" className="hidden" onChange={onFile} />
          {parseErro && <p className="text-[10px]" style={{ color: '#f87171' }}>{parseErro}</p>}
          {!arq && gradeCob && (
            <p className="text-[9px]" style={{ color: '#94a3b8' }}>Escolha o arquivo da Falker — a cobertura será conferida contra a <strong>{gradeCob.nome}</strong> ({gradeCob.pontos.length} pontos).</p>
          )}

          {arq?.falker && (
            // Falker: sem mapeamento de colunas — mostra o que foi lido.
            <div className="rounded px-2 py-1.5 space-y-0.5" style={{ background: '#0a1a2f', border: '1px solid #1a3a6b' }}>
              <p className="text-[10px] font-semibold" style={{ color: '#86efac' }}>
                Arquivo da Falker reconhecido — {arq.falker.resumo.nPontos} pontos · {arq.falker.resumo.camadas} camadas
              </p>
              <p className="text-[9px]" style={{ color: '#94a3b8' }}>
                Camadas: {arq.falker.profundidades.join(' · ')} cm (máximo de cada faixa de 10 cm, em MPa; leitura 0 ignorada).
              </p>
              <p className="text-[9px]" style={{ color: '#94a3b8' }}>
                {arq.falker.resumo.nLidos} medições lidas
                {arq.falker.resumo.agrupados > 0 && <> · {arq.falker.resumo.agrupados} agrupada(s) com outra a menos de 3 m (média)</>}
                {arq.falker.resumo.descartados > 0 && <> · {arq.falker.resumo.descartados} sem leitura válida (descartada)</>}
              </p>
              {arq.falker.resumo.incompletos > 0 && (
                <p className="text-[9px]" style={{ color: '#fbbf24' }}>
                  {arq.falker.resumo.incompletos} medição(ões) incompleta(s) — o cone não chegou ao fundo; as camadas sem leitura ficam de fora desses pontos.
                </p>
              )}
              {gradesTalhao.length > 0 && (
                <div className="pt-1 space-y-1">
                  <label className="text-[9px] block" style={{ color: '#64748b' }}>Conferir contra a grade planejada (opcional)
                    <select value={gradeCobId} onChange={e => { setGradeCobId(e.target.value); setVerFaltantes(false); }} className="w-full rounded px-2 py-1 text-[11px] outline-none mt-0.5" style={inputStyle}>
                      <option value="">— não conferir —</option>
                      {gradesTalhao.map(g => <option key={g.id} value={g.id}>{g.nome} · {g.pontos.length} pts</option>)}
                    </select>
                  </label>
                  {cobertura && (
                    <>
                      <p className="text-[10px] font-semibold" style={{ color: cobertura.faltando.length ? '#fbbf24' : '#86efac' }}>
                        {cobertura.medidos}/{cobertura.total} pontos da grade medidos
                        {cobertura.foraDaGrade > 0 && <span style={{ color: '#94a3b8' }}> · {cobertura.foraDaGrade} medição(ões) a mais de 30 m de qualquer ponto</span>}
                      </p>
                      {cobertura.faltando.length > 0 && (
                        <p className="text-[9px]" style={{ color: '#fbbf24' }}>
                          Faltando: {cobertura.faltando.slice(0, 12).map(o => `C-${o + 1}`).join(', ')}
                          {cobertura.faltando.length > 12 && ` … (+${cobertura.faltando.length - 12})`}
                        </p>
                      )}
                      <button onClick={() => setVerFaltantes(v => !v)}
                        className="w-full py-1 rounded text-[10px] font-semibold flex items-center justify-center gap-1" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
                        <MapPin size={11} /> {verFaltantes ? 'Tirar do mapa' : 'Ver no mapa (verde = medido, vermelho = faltando)'}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {arq && (
            <>
              {!arq.falker && <>
              <p className="text-[10px]" style={{ color: '#86efac' }}>{arq.pontos.length} pontos lidos.</p>
              <div>
                <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>
                  Colunas de resistência (cada uma vira uma profundidade)
                </label>
                <div className="flex flex-wrap gap-1">
                  {arq.colunas.map(c => {
                    const sel = colsSel.includes(c);
                    const num = arq.colunasNumericas.includes(c);
                    return (
                      <button key={c} onClick={() => toggleCol(c)} title={num ? 'coluna numérica' : 'coluna de texto (provavelmente não é resistência)'}
                        className="px-2 py-1 rounded text-[10px] font-bold"
                        style={{ background: sel ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: sel ? '#fff' : (num ? '#93c5fd' : '#475569') }}>
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>
              </>}
              <div>
                <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Nome da importação</label>
                <input value={nome} onChange={e => setNome(e.target.value)} className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
                <label className="text-[10px] font-semibold block mt-1.5" style={{ color: '#64748b' }}>Data de referência (define Ano/Época)</label>
                <div className="flex items-center gap-2">
                  <input type="date" value={dataRef} onChange={e => setDataRef(e.target.value)} className="rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
                  <span className="text-[10px]" style={{ color: periodoDeData(dataRef) ? '#86efac' : '#fbbf24' }}>{(() => { const p = periodoDeData(dataRef); return p ? `Ano ${p.ano} · ${rotuloEpoca(p.epoca)}` : 'data inválida'; })()}</span>
                </div>
              </div>
              <button onClick={salvarImportacao} disabled={colsSel.length === 0}
                className="w-full py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-40"
                style={{ background: 'var(--invicta-green-dark)' }}>
                <Save size={12} /> Salvar importação ({colsSel.length} profundidades)
              </button>
            </>
          )}
        </div>
      )}

      {/* Profundidades + processar */}
      {importacao && importacao.profundidades.length > 0 && (
        <>
          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>Profundidade</label>
            <div className="flex flex-wrap gap-1">
              {importacao.profundidades.map(p => {
                const sel = p === profundidade;
                const feito = !!cache[p];
                return (
                  <button key={p} onClick={() => setProfundidade(p)} className="px-2 py-1 rounded text-[10px] font-bold"
                    style={{ background: sel ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: sel ? '#fff' : (feito ? '#86efac' : '#93c5fd') }}>
                    {p}{feito ? ' ✓' : ''}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Estatística da camada exibida (pontos do arquivo, antes da interpolação) */}
          {(() => {
            const est = estatisticaCamada(importacao.pontos, profundidade);
            if (!est) return <p className="text-[10px]" style={{ color: '#fbbf24' }}>{profundidade}: nenhum ponto com leitura nesta camada.</p>;
            const u = legenda.unidade || 'MPa';
            return (
              <div className="grid grid-cols-4 gap-1">
                {[['Média', fmt(est.media)], ['Mín.', fmt(est.min)], ['Máx.', fmt(est.max)], ['Pontos', String(est.n)]].map(([r, v]) => (
                  <div key={r} className="rounded px-1.5 py-1 text-center" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
                    <p className="text-[8px] uppercase" style={{ color: '#64748b' }}>{r}</p>
                    <p className="text-[11px] font-bold" style={{ color: '#e2e8f0' }}>{v}</p>
                  </div>
                ))}
                <p className="col-span-4 text-[8px]" style={{ color: '#64748b' }}>Camada {profundidade} cm · valores em {u}, dos pontos medidos.</p>
              </div>
            );
          })()}

          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>Método</label>
              <select value={metodoSel} onChange={e => setMetodoSel(e.target.value as 'krige' | 'idw')} disabled={processando}
                className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle}>
                <option value="krige">Krigagem (padrão)</option>
                <option value="idw">IDW</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>Pixel</label>
              <select value={pixelM} onChange={e => setPixelM(Number(e.target.value))} disabled={processando}
                className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle}>
                {PIXEIS_COMP.map(p => <option key={p} value={p}>{p} × {p} m{p === PIXEL_COMP_PADRAO ? ' (padrão)' : ''}</option>)}
              </select>
            </div>
          </div>

{podeProcessar() && (<>
          <button onClick={() => processar(profundidade)} disabled={processando || !poligono || !profundidade}
            className="w-full py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1.5"
            style={{ background: (processando || !poligono) ? '#1a3a6b' : 'var(--invicta-green-dark)' }}>
            {processando && !progresso ? <><Loader2 size={13} className="animate-spin" /> Interpolando…</> : <><Play size={13} /> Interpolar {profundidade}</>}
          </button>
          {importacao.profundidades.length > 1 && (
            <button onClick={() => void processarTodas()} disabled={processando || !poligono}
              className="w-full py-2 rounded text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-60"
              style={{ background: '#1a3a6b', color: '#93c5fd', border: '1px solid #2e5fa3' }}>
              {progresso
                ? <><Loader2 size={13} className="animate-spin" /> Interpolando camada {progresso.n}/{progresso.total}…</>
                : <><Layers size={13} /> Interpolar todas as camadas ({importacao.profundidades.length})</>}
            </button>
          )}
</>)}

          {estado === 'erro' && <p className="text-[10px]" style={{ color: '#f87171' }}>{erro}</p>}
          {quedaIdw && <p className="text-[10px]" style={{ color: '#fbbf24' }}>{quedaIdw}</p>}

          {/* Legenda + stats */}
          {cache[profundidade] && (
            <div className="space-y-2 p-2.5 rounded-lg" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[10px]" style={{ color: '#86efac' }}>
                  <Activity size={12} /> {cache[profundidade].resp.stats.modelo} · {cache[profundidade].resp.stats.n} pts
                </div>
{podeExcluir() && (                <button onClick={() => limparProf(profundidade)}
                  className="flex items-center gap-1 text-[10px]" style={{ color: '#93c5fd' }}>
                  <Eraser size={11} /> Limpar
                </button>)}
              </div>
              <div>
                <div className="relative h-4 rounded overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)', background: gradienteCss(legenda) }} />
                <div className="flex justify-between text-[8px] mt-0.5" style={{ color: '#94a3b8' }}>
                  {legenda.classes.map((c, i) => c.valorMax != null && i < legenda.classes.length - 1 ? <span key={i}>{fmt(c.valorMax)}</span> : null)}
                </div>
              </div>
              <p className="text-[9px]" style={{ color: '#64748b' }}>{legenda.atributo} · {legenda.unidade} ({legenda.metodo})</p>
            </div>
          )}

          {/* Relatório PDF: todas as camadas interpoladas */}
          {podeCompactacao('exportar') && (() => {
            const falta = camadasFaltando(importacao.profundidades, Object.keys(cache).filter(p => temGrid(cache[p].resp)));
            const pronto = falta.length === 0 && !!poligono;
            return (
              <div className="space-y-1">
                <button onClick={() => void gerarPdf()} disabled={!pronto || gerandoPdf || processando}
                  className="w-full py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
                  style={{ background: pronto ? 'var(--invicta-blue-mid)' : '#1a3a6b' }}>
                  {gerandoPdf ? <><Loader2 size={13} className="animate-spin" /> Gerando PDF…</> : <><FileDown size={13} /> Gerar relatório (PDF)</>}
                </button>
                {!pronto && (
                  <p className="text-[9px]" style={{ color: '#fbbf24' }}>
                    {!poligono ? 'Limite do talhão não encontrado — abra o talhão no mapa.'
                      : `Faltam ${falta.length} de ${importacao.profundidades.length} camadas (${falta.join(', ')}) — use "Interpolar todas as camadas".`}
                  </p>
                )}
                {pdfMsg && <p className="text-[10px]" style={{ color: pdfMsg.erro ? '#f87171' : '#fbbf24' }}>{pdfMsg.txt}</p>}
              </div>
            );
          })()}
        </>
      )}
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
