'use client';

// Aba Recomendações da Página do Talhão (Fase R3.A + R3.B).
// Dois modos: aplicar 1 EQUAÇÃO (avulso) ou uma RECOMENDAÇÃO inteira (N equações).
// Mostra os mapas de DOSE (clique p/ ver cada um), financeiro consolidado, e
// SALVA o cenário na nuvem (reabrir depois → habilita o Comparador C1 da R4).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { getImportacoesLab, getTalhoes, getFazendas, getPlantio, type ImportacaoLab } from '@/lib/store';
import { anoDaSafra } from '@/lib/periodo';
import { nomeExport } from '@/lib/nomeExport';
import { ExplicadorRecomendacaoIa } from '@/components/talhao/ExplicadorRecomendacaoIa';
import { pode } from '@/lib/empresa';
import { listar as bibListar, compararEquacoes, type ItemBiblioteca, type ConteudoEquacao, type ConteudoRecomendacao } from '@/lib/biblioteca';
import type { ConteudoInsumo } from '@/lib/insumos';
import { carregarGridsTalhao, calcularDose, calcularDosePorZona, dividirDoseEmPassadas, type DoseCalculada } from '@/lib/recomendacao/aplicar';
import { salvarCenario, listarCenarios, descomprimirCenario, excluirCenario, type Cenario } from '@/lib/recomendacao/cenarios';
import { colorirDose, recortarNoPoligono } from '@/lib/raster';
import { coordsFromBounds, extrairPoligono } from '@/lib/fertilidade';
import { agruparPorRotulo } from '@/lib/recomendacao/dosePorZona';
import { nutrientesDaEquacao } from '@/lib/recomendacao/doseZonaDireta';
import { bindingDasZonas, valoresDasZonas } from '@/lib/recomendacao/zonasComLaudo';
import { zonasDoTalhao } from '@/lib/recomendacao/zonasDoTalhao';
import { classesVisiveis, indiceClasse } from '@/lib/recomendacao/faixas';
import { ComparadorCenarios } from '@/components/talhao/ComparadorCenarios';
import { montarBookOficial, abrirOuBaixar } from '@/lib/recomendacao/relatorioCenarios';
import { Play, Loader2, AlertTriangle, Wand2, Save, FolderOpen, Trash2, Eye, GitCompare, FileText, Star } from 'lucide-react';

import { inputStyle } from '@/constants/ui';
import { fmtDec as fmt, fmtHa } from '@/lib/formato';

// Converte o limite (t/ha ou kg/ha) p/ a unidade da dose e divide em passadas.
function limiteNaUnidadeDaDose(limite: number, unidLimite: 't/ha' | 'kg/ha', unidDose: string): number {
  const doseT = /t\/ha|ton/i.test(unidDose || '');
  if (unidLimite === 't/ha' && !doseT) return limite * 1000;
  if (unidLimite === 'kg/ha' && doseT) return limite / 1000;
  return limite;
}
interface DivCfg { ativo: boolean; limiteMax: number; unidade: 't/ha' | 'kg/ha'; }
function expandirDoses(doses: DoseCalculada[], div: DivCfg, areaHa: number): DoseCalculada[] {
  if (!div.ativo || !(div.limiteMax > 0)) return doses;
  const out: DoseCalculada[] = [];
  for (const d of doses) out.push(...dividirDoseEmPassadas(d, limiteNaUnidadeDaDose(div.limiteMax, div.unidade, d.unidade), areaHa));
  return out;
}

export function RecomendacaoSection({ safraNome }: { safraNome?: string }) {
  const { nav, uploadedGeo, setFertilidadeOverlay, setFertilidadeLabels, setZonasManejo } = useApp();
  const safra = safraNome ?? '';

  const [modo, setModo] = useState<'equacao' | 'recomendacao'>('recomendacao');
  const [importacoes, setImportacoes] = useState<ImportacaoLab[]>([]);
  const [importacaoId, setImportacaoId] = useState('');
  const [equacoes, setEquacoes] = useState<ItemBiblioteca<ConteudoEquacao>[]>([]);
  // Fonte única do preço (v2.42): a equação vinculada busca custo/frete/aplicação
  // aqui. Mapa por id porque `calcularDose` recebe os insumos injetados.
  const [insumos, setInsumos] = useState<ReadonlyMap<string, ConteudoInsumo>>(new Map());
  const [recomendacoes, setRecomendacoes] = useState<ItemBiblioteca<ConteudoRecomendacao>[]>([]);
  const [equacaoId, setEquacaoId] = useState('');
  const [recomendacaoId, setRecomendacaoId] = useState('');
  // Dividir aplicação (escolhido na hora de aplicar a recomendação)
  const [divAtivo, setDivAtivo] = useState(false);
  const [divLimite, setDivLimite] = useState('4');
  const [divUnid, setDivUnid] = useState<'t/ha' | 'kg/ha'>('t/ha');
  // Modo do mapa — o MESMO par da aba Fertilidade, para o usuário reconhecer.
  // 'zona' calcula a taxa de cada zona direto do laudo, sem depender de como os
  // mapas de fertilidade foram processados.
  const [modoMapa, setModoMapa] = useState<'interpolar' | 'zona'>('interpolar');

  const [estado, setEstado] = useState<'idle' | 'carregando' | 'pronto' | 'erro'>('idle');
  const [erro, setErro] = useState('');
  const [doses, setDoses] = useState<DoseCalculada[]>([]);
  const [falhas, setFalhas] = useState<{ nome: string; erro: string }[]>([]);
  const [visivel, setVisivel] = useState(0);
  // cenário atualmente exibido (p/ persistir a marcação "usar" por dose)
  const [cenMeta, setCenMeta] = useState<{ id: string; origem: 'equacao' | 'recomendacao'; recomendacaoId?: string; nome: string } | null>(null);
  const [nomeCenario, setNomeCenario] = useState('');
  const [salvoMsg, setSalvoMsg] = useState('');
  const [salvos, setSalvos] = useState<Cenario[]>([]);
  const [selCompara, setSelCompara] = useState<Set<string>>(new Set());
  const [comparar, setComparar] = useState<Cenario[] | null>(null);
  const [bookSel, setBookSel] = useState<Set<string>>(new Set());
  const [bookEstado, setBookEstado] = useState<'idle' | 'carregando' | 'pronto' | 'erro'>('idle');
  const [erroBook, setErroBook] = useState('');

  // Biblioteca (equações + recomendações) — reage a edições
  useEffect(() => {
    const load = () => {
      setEquacoes(bibListar<ConteudoEquacao>('equacoes').filter(e => e.ativo));
      setRecomendacoes(bibListar<ConteudoRecomendacao>('recomendacoes').filter(r => r.ativo));
      setInsumos(new Map(bibListar<ConteudoInsumo>('insumos').filter(i => i.ativo).map(i => [i.id, i.conteudo])));
    };
    load();
    // 'insumos' entra na lista porque mudar o preço de um insumo muda o custo
    // de toda equação vinculada a ele — sem isso a tela ficaria com o antigo.
    const onBib = (e: Event) => { const d = (e as CustomEvent).detail as { slug?: string } | undefined; if (!d?.slug || d.slug === 'equacoes' || d.slug === 'recomendacoes' || d.slug === 'insumos') load(); };
    if (typeof window !== 'undefined') window.addEventListener('inv:biblioteca', onBib);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('inv:biblioteca', onBib); };
  }, []);

  useEffect(() => { if (nav.talhaoId && safra) setImportacoes(getImportacoesLab(nav.talhaoId, safra)); }, [nav.talhaoId, safra]);
  useEffect(() => {
    if (importacaoId || importacoes.length === 0) return;
    const r = [...importacoes].sort((a, b) => (b.criadoEm ?? '').localeCompare(a.criadoEm ?? ''))[0];
    if (r) setImportacaoId(r.id);
  }, [importacoes, importacaoId]);

  const talhao = useMemo(() => getTalhoes().find(t => t.id === nav.talhaoId) ?? null, [nav.talhaoId]);
  // Contorno do talhão — recorta o raster da dose no mapa da tela. O raster de
  // 20 m transborda a divisa DE PROPÓSITO (cobre 100% do polígono), então sem o
  // contorno o mapa sai serrilhado por cima da linha. MESMA derivação da aba
  // Fertilidade: limite carregado no mapa primeiro, cadastro como reserva —
  // só o cadastro falhava em talhão cujo limite veio por upload.
  const poligono = useMemo(() => {
    const p = extrairPoligono(uploadedGeo);
    if (p) return p;
    if (!talhao?.geojson) return null;
    try { return extrairPoligono(JSON.parse(talhao.geojson)); } catch { return null; }
  }, [uploadedGeo, talhao]);
  // Nº do cadastro da equação (janela de Equações) — o MESMO que sai no relatório,
  // p/ mostrar na frente de cada dose e facilitar o cruzamento. Doses parceladas
  // têm equacaoId "<id>__apN" → usa o id base.
  const numeroEquacao = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of equacoes) if (typeof e.conteudo?.ordem === 'number') m.set(e.id, e.conteudo.ordem);
    return (equacaoId: string): number | undefined => m.get(equacaoId) ?? m.get(equacaoId.split('__ap')[0]);
  }, [equacoes]);
  const eqSel = equacoes.find(e => e.id === equacaoId) ?? null;
  const recSel = recomendacoes.find(r => r.id === recomendacaoId) ?? null;

  const recarregarSalvos = useCallback(async () => {
    if (nav.talhaoId && safra) setSalvos(await listarCenarios(nav.talhaoId, safra));
  }, [nav.talhaoId, safra]);
  useEffect(() => { recarregarSalvos(); }, [recarregarSalvos]);

  // limpa resultado ao trocar contexto
  useEffect(() => { setDoses([]); setFalhas([]); setEstado('idle'); setErro(''); setVisivel(0); setSalvoMsg(''); setCenMeta(null); }, [modo, equacaoId, recomendacaoId, importacaoId, modoMapa]);

  // dose visível no mapa
  const doseAtiva = doses[visivel] ?? null;

  // ── RECOMENDAÇÃO POR ZONA ────────────────────────────────────────────────
  // Quando a fertilidade foi processada em zona, a dose é CHAPADA dentro de cada
  // zona — ou seja, a zona tem UM valor, não um mosaico. Aí o mapa desenha o
  // POLÍGONO da zona com a sua taxa, em vez de esticar um raster de 20 m que
  // mostra a mesma coisa com a divisa em escadinha.
  //
  // A decisão é do próprio mapa, sem chave na tela: se a dose varia por dentro
  // (veio de interpolação), `todasChapadas` dá falso e continua o raster —
  // nunca achatamos à força uma superfície que de fato varia.
  const zonasTalhao = useMemo(() => zonasDoTalhao(nav.talhaoId), [nav.talhaoId]);
  // A taxa por zona vem PRONTA da dose (`porZona`), calculada direto da equação
  // no momento de aplicar — aqui só casamos com a geometria para desenhar.
  const dosePorZona = useMemo(() => {
    if (!doseAtiva?.porZona?.length) return null;
    const geomPorRotulo = new Map(agruparPorRotulo(zonasTalhao).map(z => [z.rotulo, z.geometry]));
    const out = doseAtiva.porZona
      .filter(z => Number.isFinite(z.dose) && geomPorRotulo.has(z.rotulo))
      .map(z => ({ rotulo: z.rotulo, dose: z.dose, geometry: geomPorRotulo.get(z.rotulo)! }));
    return out.length ? out : null;
  }, [doseAtiva, zonasTalhao]);
  // Zona que ficou sem taxa (faltou o valor no laudo) — tem de aparecer, senão
  // some do mapa e do arquivo sem ninguém notar.
  const zonasSemDose = useMemo(
    () => (doseAtiva?.porZona ?? []).filter(z => !Number.isFinite(z.dose)),
    [doseAtiva],
  );

  // Zonas coloridas pela faixa da dose + rótulo com a taxa (o número que vai
  // para a máquina). Mesma classificação do raster e da legenda (faixas.ts).
  const zonasMapa = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!dosePorZona || !doseAtiva) return null;
    const classes = classesVisiveis(doseAtiva.estilo.classes, doseAtiva.doseMinima ?? 0);
    if (!classes.length) return null;
    const lims = classes.map(c => c.limiteSuperior);
    const un = doseAtiva.unidade || 'kg/ha';
    return {
      type: 'FeatureCollection',
      features: dosePorZona.map(z => ({
        type: 'Feature' as const,
        properties: {
          cor: classes[indiceClasse(z.dose, lims)].cor,
          // dose grande vira inteiro; pequena (t/ha) mantém casa decimal
          rotulo: `Zona ${z.rotulo}\n${fmt(z.dose, Math.abs(z.dose) >= 100 ? 0 : 1)} ${un}`,
          classeLabel: '',
          selecionada: false,
        },
        geometry: z.geometry,
      })),
    };
  }, [dosePorZona, doseAtiva]);

  useEffect(() => { setZonasManejo(zonasMapa); return () => setZonasManejo(null); }, [zonasMapa, setZonasManejo]);

  useEffect(() => {
    if (!doseAtiva) { setFertilidadeOverlay(null); setFertilidadeLabels(null); return; }
    // Mapa por zona no ar → o raster sairia por baixo dele, sem servir para nada.
    if (zonasMapa) { setFertilidadeOverlay(null); setFertilidadeLabels(null); return; }
    let cancelado = false;
    (async () => {
      try {
        const png = colorirDose(doseAtiva.grid, doseAtiva.estilo, doseAtiva.doseMinima);
        // A malha de 20 m cobre 100% do talhão, então transborda um pouco na
        // divisa. O PDF já recorta ao desenhar (capturaMapa); aqui o mapa é uma
        // imagem esticada sobre os bounds, então o corte tem de ser no pixel.
        if (!poligono) console.warn('[recomendacao] sem contorno do talhão — mapa de dose exibido SEM recorte (vai serrilhar na divisa).');
        const recortado = poligono
          ? await recortarNoPoligono(png, doseAtiva.bounds, poligono)
          : png;
        if (cancelado) return;
        setFertilidadeOverlay({ url: recortado.dataUrl, coordinates: coordsFromBounds(doseAtiva.bounds), opacity: 1 });
        setFertilidadeLabels(null);
      } catch (e) { console.warn('[recomendacao] colorir falhou', e); }
    })();
    return () => { cancelado = true; };
  }, [doseAtiva, poligono, zonasMapa, setFertilidadeOverlay, setFertilidadeLabels]);
  useEffect(() => () => { setFertilidadeOverlay(null); setFertilidadeLabels(null); }, [setFertilidadeOverlay, setFertilidadeLabels]);

  async function aplicar() {
    setErro(''); setDoses([]); setFalhas([]); setVisivel(0); setSalvoMsg('');
    if (!nav.talhaoId || !importacaoId) { setErro('Selecione uma importação de laboratório.'); setEstado('erro'); return; }
    let itens: ItemBiblioteca<ConteudoEquacao>[] = [];
    if (modo === 'equacao') {
      if (!eqSel) { setErro('Escolha uma equação.'); setEstado('erro'); return; }
      itens = [eqSel];
    } else {
      if (!recSel) { setErro('Escolha uma recomendação.'); setEstado('erro'); return; }
      itens = (recSel.conteudo.equacaoIds.map(id => equacoes.find(e => e.id === id)).filter(Boolean) as ItemBiblioteca<ConteudoEquacao>[]).sort(compararEquacoes);
      if (itens.length === 0) { setErro('A recomendação não tem equações ativas.'); setEstado('erro'); return; }
    }
    setEstado('carregando');
    try {
      const porZonaAtivo = modoMapa === 'zona' && zonasTalhao.length > 0;
      // O caminho por zona não lê mapa nenhum da nuvem.
      const grids = porZonaAtivo ? {} : await carregarGridsTalhao(nav.talhaoId, importacaoId, 'dose');
      const area = talhao?.areaHa ?? 0;
      const ok: DoseCalculada[] = [];
      const erros: { nome: string; erro: string }[] = [];
      const imp = importacoes.find(i => i.id === importacaoId) ?? null;
      const zonasBase = agruparPorRotulo(zonasTalhao);
      // POR ZONA: a taxa sai da equação com o laudo da própria zona, sem tocar
      // nos mapas interpolados. Independe de como a Fertilidade foi processada.
      const binding = (porZonaAtivo && imp && nav.talhaoId)
        ? bindingDasZonas(nav.talhaoId, safra, imp, zonasBase) : null;

      for (const it of itens) {
        try {
          if (porZonaAtivo && imp && binding && poligono) {
            const c = it.conteudo;
            const nuts = nutrientesDaEquacao(c.script, c.constantes);
            const vals = valoresDasZonas(imp, binding, zonasBase, nuts, c.profundidade || '0-20');
            ok.push(calcularDosePorZona(it, zonasBase, vals, area, poligono, insumos));
          } else {
            ok.push(calcularDose(it, grids, area, poligono, insumos));
          }
        }
        catch (e) { erros.push({ nome: it.nome, erro: e instanceof Error ? e.message : String(e) }); }
      }
      // Divisão de aplicação (escolhida na hora) → grupo de mapas (passadas).
      const div: DivCfg = { ativo: divAtivo, limiteMax: parseFloat(divLimite.replace(',', '.')) || 0, unidade: divUnid };
      const finais = (modo === 'recomendacao') ? expandirDoses(ok, div, area) : ok;
      setDoses(finais); setFalhas(erros);
      setEstado(finais.length ? 'pronto' : 'erro');
      if (!finais.length) { setErro('Nenhuma equação pôde ser aplicada — veja os detalhes abaixo.'); return; }
      // Auto-salva o cenário na nuvem (id determinístico = não duplica ao reprocessar).
      const ref = modo === 'recomendacao' ? recomendacaoId : equacaoId;
      const autoId = `cen_${nav.talhaoId}_${importacaoId}_${modo}_${ref}`;
      const custoTotal = finais.reduce((s, d) => s + (d.custo ?? 0), 0);
      const nome = nomeCenario.trim() || `${recSel?.nome ?? eqSel?.nome ?? 'Cenário'}`;
      setCenMeta({ id: autoId, origem: modo, recomendacaoId: modo === 'recomendacao' ? recomendacaoId : undefined, nome });
      try {
        await salvarCenario({
          talhaoId: nav.talhaoId, safra, importacaoId,
          origem: modo, recomendacaoId: modo === 'recomendacao' ? recomendacaoId : undefined,
          nome, doses: finais, financeiro: { custoTotal, custoHa: area ? custoTotal / area : 0, areaHa: area },
        }, autoId);
        await recarregarSalvos();
        setSalvoMsg(`Salvo como "${nome}".`);
      } catch (e) { setSalvoMsg('Calculado, mas NÃO salvou na nuvem: ' + (e instanceof Error ? e.message : String(e))); }
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); setEstado('erro'); }
  }

  const fin = useMemo(() => {
    if (!doses.length) return null;
    const area = talhao?.areaHa ?? 0;
    let custoTotal = 0; let temSemCusto = false;
    for (const d of doses) { custoTotal += d.custo; if (d.custoTonelada == null) temSemCusto = true; }
    return { area, custoTotal, custoHa: area ? custoTotal / area : 0, temSemCusto };
  }, [doses, talhao]);

  async function reabrir(cen: Cenario) {
    setEstado('carregando'); setErro('');
    try {
      const full = await descomprimirCenario(cen);
      setDoses(full.doses); setFalhas([]); setVisivel(0); setEstado('pronto');
      setCenMeta({ id: cen.id, origem: full.origem, recomendacaoId: full.recomendacaoId, nome: full.nome });
    } catch (e) { setErro('Falha ao reabrir: ' + (e instanceof Error ? e.message : String(e))); setEstado('erro'); }
  }
  async function excluirSalvo(c: Cenario) {
    if (!confirm(`Excluir o cenário "${c.nome}"?`)) return;
    await excluirCenario(c.id); await recarregarSalvos();
    setSelCompara(prev => { const n = new Set(prev); n.delete(c.id); return n; });
  }
  // Marca/desmarca um MAPA (dose) como "será utilizado" e persiste o cenário atual.
  async function toggleUsar(i: number) {
    const novas = doses.map((d, k) => k === i ? { ...d, usar: !d.usar } : d);
    setDoses(novas);
    if (!cenMeta || !nav.talhaoId) return;
    const area = talhao?.areaHa ?? 0;
    const custoTotal = novas.reduce((s, d) => s + (d.custo ?? 0), 0);
    try {
      await salvarCenario({ talhaoId: nav.talhaoId, safra, importacaoId, origem: cenMeta.origem, recomendacaoId: cenMeta.recomendacaoId, nome: cenMeta.nome, doses: novas, financeiro: { custoTotal, custoHa: area ? custoTotal / area : 0, areaHa: area } }, cenMeta.id);
      await recarregarSalvos();
    } catch { /* mantém em memória mesmo se a nuvem falhar */ }
  }
  function toggleCompara(id: string) {
    setSelCompara(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else if (n.size < 3) n.add(id);   // compara até 3
      return n;
    });
  }
  async function abrirComparador() {
    const sel = salvos.filter(c => selCompara.has(c.id));
    if (sel.length < 2) return;
    const full = await Promise.all(sel.map(descomprimirCenario));
    setComparar(full);
  }

  // Book: todas as recomendações marcadas por padrão (o usuário desmarca o que não quer).
  useEffect(() => { setBookSel(new Set(recomendacoes.map(r => r.id))); }, [recomendacoes]);
  function toggleBook(id: string) {
    setBookSel(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  async function gerarBook() {
    setErroBook('');
    if (!nav.talhaoId || !importacaoId) { setErroBook('Selecione uma importação de laboratório.'); setBookEstado('erro'); return; }
    const recs = recomendacoes.filter(r => bookSel.has(r.id));
    if (recs.length === 0) { setErroBook('Marque ao menos uma recomendação.'); setBookEstado('erro'); return; }
    const aba = typeof window !== 'undefined' ? window.open('', '_blank') : null;  // antes de qualquer await
    setBookEstado('carregando');
    try {
      const grids = await carregarGridsTalhao(nav.talhaoId, importacaoId, 'dose');
      const area = talhao?.areaHa ?? 0;
      const cens: Cenario[] = [];
      for (const r of recs) {
        const itens = (r.conteudo.equacaoIds.map(id => equacoes.find(e => e.id === id)).filter(Boolean) as ItemBiblioteca<ConteudoEquacao>[]).sort(compararEquacoes);
        const ok: DoseCalculada[] = [];
        for (const it of itens) { try { ok.push(calcularDose(it, grids, area, poligono, insumos)); } catch { /* sem mapa p/ essa equação */ } }
        if (ok.length === 0) continue;
        const divBook: DivCfg = { ativo: divAtivo, limiteMax: parseFloat(divLimite.replace(',', '.')) || 0, unidade: divUnid };
        const finais = expandirDoses(ok, divBook, area);   // divide em passadas se marcado
        const custoTotal = finais.reduce((s, d) => s + d.custo, 0);
        const financeiro = { custoTotal, custoHa: area ? custoTotal / area : 0, areaHa: area };
        cens.push({ id: '', talhaoId: nav.talhaoId, safra, importacaoId, origem: 'recomendacao', recomendacaoId: r.id, nome: r.nome, doses: finais, financeiro, geradoEm: Date.now(), geradoPor: '' });
        salvarCenario({ talhaoId: nav.talhaoId, safra, importacaoId, origem: 'recomendacao', recomendacaoId: r.id, nome: r.nome, doses: finais, financeiro }, `cen_${nav.talhaoId}_${importacaoId}_recomendacao_${r.id}`).catch(() => {});
      }
      if (cens.length === 0) { if (aba) aba.close(); setErroBook('Nenhuma recomendação pôde ser aplicada — faltam mapas interpolados dos atributos usados.'); setBookEstado('erro'); return; }
      const blob = await montarBookOficial(cens);
      // SA03_RECOM_2026_BOOK — o nome antigo não dizia de que talhão era.
      const t = getTalhoes().find(x => x.id === nav.talhaoId);
      const f = t ? getFazendas().find(x => x.id === t.fazendaId) : undefined;
      abrirOuBaixar(blob, aba, `${nomeExport({
        fazenda: f?.nome ?? '', siglaFazenda: f?.sigla ?? null, talhao: t?.nome ?? '',
        tipo: 'RECOM', ano: anoDaSafra(safra), detalhe: 'book',
      })}.pdf`);
      await recarregarSalvos();
      setBookEstado('pronto');
    } catch (e) { if (aba) aba.close(); setErroBook(e instanceof Error ? e.message : String(e)); setBookEstado('erro'); }
  }

  const classesVis = useMemo(() => doseAtiva ? [...doseAtiva.estilo.classes].sort((a, b) => a.limiteSuperior - b.limiteSuperior) : [], [doseAtiva]);
  const podeAplicar = !!importacaoId && (modo === 'equacao' ? !!eqSel : !!recSel) && estado !== 'carregando';

  if (!pode('recomendacoes')) return (
    <div className="px-6 py-4"><p className="text-[11px]" style={{ color: '#fbbf24' }}>Seu papel não trabalha com recomendações (somente visualização).</p></div>
  );

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Wand2 size={14} style={{ color: '#a78bfa' }} />
        <h3 className="text-sm font-bold" style={{ color: '#e2e8f0' }}>Recomendação / Cenário</h3>
      </div>

      {/* Modo */}
      <div className="flex gap-1">
        {([['recomendacao', 'Recomendação'], ['equacao', 'Equação avulsa']] as const).map(([v, label]) => (
          <button key={v} onClick={() => setModo(v)} className="flex-1 py-1.5 rounded text-[10px] font-bold"
            style={{ background: modo === v ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: modo === v ? '#fff' : '#94a3b8' }}>{label}</button>
        ))}
      </div>

      <div>
        <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>Importação de laboratório</label>
        <select value={importacaoId} onChange={e => setImportacaoId(e.target.value)} className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle}>
          {importacoes.length === 0 && <option value="">Nenhuma importação neste ano</option>}
          {importacoes.map(i => <option key={i.id} value={i.id}>{i.laboratorio || 'Importação'} · {(i.criadoEm ?? '').slice(0, 10)}</option>)}
        </select>
      </div>

      {/* Modo do mapa — mesmo par da aba Fertilidade. Só aparece com zoneamento. */}
      {zonasTalhao.length > 0 && (
        <div>
          <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>Modo do mapa</label>
          <div className="grid grid-cols-2 gap-1">
            {([['interpolar', 'Interpolação'], ['zona', 'Por zona de manejo']] as const).map(([m, t]) => (
              <button key={m} onClick={() => setModoMapa(m)}
                className="py-1.5 px-2 rounded text-[11px] font-semibold"
                style={{ background: modoMapa === m ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: modoMapa === m ? '#fff' : '#93c5fd' }}>
                {t}
              </button>
            ))}
          </div>
          <p className="text-[9px] mt-1" style={{ color: '#475569' }}>
            {modoMapa === 'zona'
              ? `Uma taxa por zona (${agruparPorRotulo(zonasTalhao).length} zonas): a equação é aplicada ao laudo de cada zona, sem interpolar e sem média. Não depende de como a Fertilidade foi processada.`
              : 'Dose contínua, calculada nos mapas interpolados de fertilidade.'}
          </p>
        </div>
      )}

      {modo === 'equacao' ? (
        <div>
          <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>Equação</label>
          {equacoes.length === 0 ? (
            <p className="text-[10px]" style={{ color: '#fbbf24' }}>Nenhuma equação. Crie em <strong>Biblioteca → Equações</strong>.</p>
          ) : (
            <select value={equacaoId} onChange={e => setEquacaoId(e.target.value)} className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle}>
              <option value="">Escolha uma equação…</option>
              {equacoes.map(e => <option key={e.id} value={e.id}>{e.nome}{e.conteudo.profundidade ? ` (${e.conteudo.profundidade})` : ''}</option>)}
            </select>
          )}
        </div>
      ) : (
        <div>
          <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>Recomendação</label>
          {recomendacoes.length === 0 ? (
            <p className="text-[10px]" style={{ color: '#fbbf24' }}>Nenhuma recomendação. Crie em <strong>Biblioteca → Recomendações</strong>.</p>
          ) : (
            <select value={recomendacaoId} onChange={e => setRecomendacaoId(e.target.value)} className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle}>
              <option value="">Escolha uma recomendação…</option>
              {recomendacoes.map(r => <option key={r.id} value={r.id}>{r.nome} ({r.conteudo.equacaoIds.length})</option>)}
            </select>
          )}
        </div>
      )}

      {modo === 'recomendacao' && (
        <div style={{ borderTop: '1px solid #1a3a6b', paddingTop: 8 }}>
          <label className="flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: '#cbd5e1' }}>
            <input type="checkbox" checked={divAtivo} onChange={e => setDivAtivo(e.target.checked)} /> Dividir aplicação por limite máximo
          </label>
          {divAtivo && (
            <div className="mt-1.5 flex items-end gap-2">
              <div className="flex-1">
                <label className="text-[9px] block mb-0.5" style={{ color: '#94a3b8' }}>Limite por aplicação</label>
                <input value={divLimite} onChange={e => setDivLimite(e.target.value)} inputMode="decimal" className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle} />
              </div>
              <select value={divUnid} onChange={e => setDivUnid(e.target.value as 't/ha' | 'kg/ha')} className="rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle}>
                <option value="t/ha">t/ha</option>
                <option value="kg/ha">kg/ha</option>
              </select>
            </div>
          )}
          {divAtivo && <p className="text-[9px] mt-1" style={{ color: '#64748b' }}>Divide a dose em passadas de no máx. esse valor → grupo de mapas (aplicação 1, 2, 3…), cada um com PDF e SHP.</p>}
        </div>
      )}

      <div>
        <label className="text-[10px] font-semibold block mb-1" style={{ color: '#cbd5e1' }}>Nome do cenário (opcional)</label>
        <input value={nomeCenario} onChange={e => setNomeCenario(e.target.value)} placeholder="ex: Cenário A — V70"
          className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle} />
      </div>

      <button onClick={aplicar} disabled={!podeAplicar}
        className="w-full py-2 rounded text-[11px] font-bold text-white flex items-center justify-center gap-1.5"
        style={{ background: !podeAplicar ? '#1a3a6b' : 'var(--invicta-green-dark)', opacity: podeAplicar ? 1 : 0.5 }}>
        {estado === 'carregando' ? <><Loader2 size={13} className="animate-spin" /> Aplicando e salvando…</> : <><Play size={13} /> Aplicar e salvar</>}
      </button>

      {erro && (
        <div className="px-2 py-1.5 rounded text-[10px] flex items-start gap-1.5" style={{ background: '#3a1a1a', color: '#fca5a5', border: '1px solid #7f1d1d' }}>
          <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" /> <span>{erro}</span>
        </div>
      )}

      {falhas.length > 0 && (
        <div className="px-2 py-1.5 rounded text-[9px]" style={{ background: '#2a230b', color: '#fbbf24', border: '1px solid #614a0a' }}>
          <div className="font-bold mb-0.5">Não aplicadas:</div>
          {falhas.map((f, i) => <div key={i}>• {f.nome}: {f.erro}</div>)}
        </div>
      )}

      {/* Resultado */}
      {estado === 'pronto' && doses.length > 0 && (
        <div className="rounded-lg p-3 space-y-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
          {/* financeiro consolidado */}
          {fin && (
            <div className="text-[10px] space-y-0.5 pb-1" style={{ color: '#cbd5e1', borderBottom: '1px solid #1a3a6b' }}>
              <div className="flex justify-between"><span>Área</span><span>{fmtHa(fin.area)} ha</span></div>
              <div className="flex justify-between font-bold" style={{ color: '#4ade80' }}><span>Custo total{fin.temSemCusto ? '*' : ''}</span><span>R$ {fmt(fin.custoTotal, 2)}</span></div>
              <div className="flex justify-between"><span>Custo / ha</span><span>R$ {fmt(fin.custoHa, 2)}</span></div>
              {fin.temSemCusto && <div className="text-[8px]" style={{ color: '#64748b' }}>* alguns produtos sem custo/tonelada — insumo sem preço, ou equação não vinculada</div>}
            </div>
          )}

          {/* lista de doses (clique p/ ver no mapa) */}
          <div className="text-[9px] mb-1" style={{ color: '#64748b' }}>Clique no mapa para ver; clique na ★ para marcar os que serão utilizados (gera arquivo).</div>
          <div className="space-y-1">
            {doses.map((d, i) => (
              <div key={i} className="w-full p-1.5 rounded flex items-center gap-2"
                style={{ background: i === visivel ? '#11305a' : '#0b1f38', border: d.usar ? '1px solid var(--invicta-green)' : i === visivel ? '1px solid #2e5fa3' : '1px solid transparent' }}>
                <button onClick={() => setVisivel(i)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                  <Eye size={11} style={{ color: i === visivel ? '#4ade80' : '#475569', flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-bold truncate" style={{ color: '#e2e8f0' }}>
                      {(() => { const n = numeroEquacao(d.equacaoId); return n != null ? <span style={{ color: '#93c5fd' }}>{String(n).padStart(2, '0')} · </span> : null; })()}{d.nomeEquacao}
                    </div>
                    <div className="text-[9px] truncate" style={{ color: '#64748b' }}>
                      {d.produto ? `${d.produto} · ` : ''}méd {fmt(d.stats.media)} {d.unidade} · {fmt(d.toneladas, 1)} t{d.custo != null ? ` · R$ ${fmt(d.custo, 2)}` : ''}
                    </div>
                  </div>
                </button>
                <button onClick={() => toggleUsar(i)} title={d.usar ? 'Marcado para usar — clique para desmarcar' : 'Usar este mapa (entra na geração de arquivos)'} className="p-1 rounded hover:bg-white/10 flex-shrink-0" style={{ color: d.usar ? '#fbbf24' : '#475569' }}>
                  <Star size={13} fill={d.usar ? '#fbbf24' : 'none'} />
                </button>
              </div>
            ))}
          </div>

          {/* De onde vieram os mapas da dose visível. A conta pode misturar
              resolução ou interpolador sem avisar (os grids são escolhidos só por
              nut+profundidade) — aqui isso fica à vista. */}
          {doseAtiva?.fontes && doseAtiva.fontes.length > 0 && (() => {
            const f = doseAtiva.fontes;
            const metodos = new Set(f.map(x => x.metodo ?? '?'));
            const alerta = f.some(x => x.reamostrado) || metodos.size > 1;
            return (
              <p className="text-[9px] leading-relaxed" style={{ color: alerta ? '#fbbf24' : '#475569' }}>
                Mapas usados: {f.map(x =>
                  `${x.token} ${x.pixel ? `${x.pixel} m` : '?'}${x.metodo ? ` · ${x.metodo}` : ''}${x.reamostrado ? ' (reamostrado)' : ''}`
                ).join(' | ')}
                {f.some(x => x.reamostrado) && ' — sem mapa de 20 m: reprocesse na Fertilidade para a dose usar toda a amplitude.'}
                {metodos.size > 1 && ' — interpoladores diferentes entre atributos.'}
              </p>
            );
          })()}

          {/* Recomendação POR ZONA: o usuário precisa saber, porque muda o que
              ele vê no mapa E o arquivo que a máquina vai receber. */}
          {dosePorZona && (
            <div className="p-2 rounded-lg" style={{ background: '#0f2a1a', border: '1px solid #166534' }}>
              <p className="text-[10px] font-bold" style={{ color: '#86efac' }}>Recomendação por zona</p>
              <p className="text-[9px] mt-0.5" style={{ color: '#94a3b8' }}>
                A taxa de cada zona é a equação aplicada ao laudo daquela zona — sem interpolar e
                sem média. O Shapefile de taxa variável sai com um polígono por zona (aba Arquivos).
              </p>
              <div className="mt-1.5 space-y-0.5">
                {dosePorZona.map(z => (
                  <div key={z.rotulo} className="flex items-center gap-2 text-[9px]" style={{ color: '#cbd5e1' }}>
                    <span className="font-bold" style={{ color: '#e2e8f0', minWidth: '48px' }}>Zona {z.rotulo}</span>
                    <span>{fmt(z.dose, Math.abs(z.dose) >= 100 ? 0 : 1)} {doseAtiva?.unidade || 'kg/ha'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {zonasSemDose.length > 0 && (
            <div className="p-2 rounded-lg" style={{ background: '#2d1a00', border: '1px solid #92400e' }}>
              <p className="text-[10px] font-bold" style={{ color: '#fbbf24' }}>
                Sem taxa {zonasSemDose.length > 1 ? 'nas zonas' : 'na zona'} {zonasSemDose.map(z => z.rotulo).join(', ')}
              </p>
              <p className="text-[9px] mt-0.5" style={{ color: '#a16207' }}>
                {zonasSemDose[0].erro ?? 'faltou o resultado do laudo'} — essas zonas ficam FORA do
                arquivo de taxa variável, e a máquina passaria nelas sem aplicar. Confira o laudo
                (aba Fertilidade) antes de gerar o arquivo.
              </p>
            </div>
          )}

          {/* legenda da dose visível */}
          {classesVis.length > 0 && doseAtiva && (
            <div className="pt-1" style={{ borderTop: '1px solid #1a3a6b' }}>
              <div className="text-[9px] font-semibold mb-1" style={{ color: '#94a3b8' }}>Legenda · {doseAtiva.nomeEquacao} ({doseAtiva.unidade})</div>
              <div className="space-y-0.5">
                {classesVis.map((c, i) => {
                  const inf = i === 0 ? 0 : classesVis[i - 1].limiteSuperior;
                  const transp = doseAtiva.estilo.zeroTransparente && c.limiteSuperior <= doseAtiva.estilo.valorMinimo;
                  return (
                    <div key={i} className="flex items-center gap-1.5 text-[9px]" style={{ color: '#cbd5e1' }}>
                      <span className="w-4 h-3 rounded" style={{ background: transp ? 'transparent' : c.cor, border: transp ? '1px dashed #64748b' : '1px solid #2e5fa3' }} />
                      <span>{fmt(inf)} – {fmt(c.limiteSuperior)}{transp ? ' (transparente)' : ''}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* IA F3 — Explicador de Recomendação (§18): explica as doses sem alterá-las */}
          <ExplicadorRecomendacaoIa dados={{
            talhao: getTalhoes().find(t => t.id === nav.talhaoId)?.nome ?? null,
            cultura: (nav.talhaoId && safra ? getPlantio(nav.talhaoId, safra) : '') || null,
            safra: safra || null,
            area_ha: fin?.area ?? null,
            custo_total_reais: fin ? Math.round(fin.custoTotal * 100) / 100 : null,
            custo_ha_reais: fin ? Math.round(fin.custoHa * 100) / 100 : null,
            produtos: doses.map(d => ({
              equacao: d.nomeEquacao, produto: d.produto || null, unidade: d.unidade,
              dose_min: Math.round(d.stats.min * 100) / 100,
              dose_media: Math.round(d.stats.media * 100) / 100,
              dose_max: Math.round(d.stats.max * 100) / 100,
              toneladas: Math.round(d.toneladas * 10) / 10,
              custo_ha_reais: Math.round(d.custoHa * 100) / 100,
              marcado_para_uso: !!d.usar,
            })),
          }} />

          {/* status do auto-save */}
          {salvoMsg && (
            <div className="pt-1 flex items-center gap-1.5 text-[9px]" style={{ color: salvoMsg.startsWith('Salvo') ? '#4ade80' : '#fbbf24', borderTop: '1px solid #1a3a6b' }}>
              <Save size={10} /> <span>{salvoMsg} Apague em “Cenários salvos” o que não for usar.</span>
            </div>
          )}
        </div>
      )}

      {/* Cenários salvos */}
      {salvos.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: '#93c5fd' }}>Cenários salvos</div>
            <button onClick={abrirComparador} disabled={selCompara.size < 2}
              className="text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1"
              style={{ background: selCompara.size >= 2 ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: selCompara.size >= 2 ? '#fff' : '#64748b' }}>
              <GitCompare size={11} /> Comparar{selCompara.size ? ` (${selCompara.size})` : ''}
            </button>
          </div>
          <div className="text-[9px] mb-1" style={{ color: '#64748b' }}>Marque 2 ou 3 cenários para comparar lado a lado.</div>
          <div className="space-y-1">
            {salvos.map(c => {
              const marcado = selCompara.has(c.id);
              return (
                <div key={c.id} className="p-2 rounded-lg flex items-center gap-2" style={{ background: '#061525', border: marcado ? '1px solid var(--invicta-green)' : '1px solid #1a3a6b' }}>
                  <input type="checkbox" checked={marcado} onChange={() => toggleCompara(c.id)} disabled={!marcado && selCompara.size >= 3} title="Comparar" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-bold truncate flex items-center gap-1" style={{ color: '#e2e8f0' }}>
                      {c.nome}
                      {c.doses.some(d => d.usar) && <span className="text-[8px] font-bold px-1 py-0.5 rounded" style={{ background: 'var(--invicta-green-dark)', color: '#fff' }}>{c.doses.filter(d => d.usar).length} p/ uso</span>}
                    </div>
                    <div className="text-[9px]" style={{ color: '#64748b' }}>
                      {new Date(c.geradoEm).toLocaleDateString('pt-BR')} · {c.doses.length} produto(s) · R$ {fmt(c.financeiro.custoTotal, 2)}
                    </div>
                  </div>
                  <button onClick={() => reabrir(c)} title="Reabrir (marcar mapas p/ uso)" className="p-1 rounded hover:bg-white/10" style={{ color: '#93c5fd' }}><FolderOpen size={12} /></button>
                  <button onClick={() => excluirSalvo(c)} title="Excluir" className="p-1 rounded hover:bg-white/10" style={{ color: '#f87171' }}><Trash2 size={12} /></button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Book de recomendações (PDF oficial em lote) */}
      {recomendacoes.length > 0 && (
        <div style={{ borderTop: '1px solid #1a3a6b', paddingTop: 10 }}>
          <div className="flex items-center gap-1.5 mb-1">
            <FileText size={13} style={{ color: '#a78bfa' }} />
            <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#93c5fd' }}>Book de recomendações (PDF)</span>
          </div>
          <p className="text-[9px] mb-1.5" style={{ color: '#64748b' }}>
            Gera 1 PDF oficial por recomendação marcada (uma página por produto) para apresentar ao produtor. Todas vêm marcadas; desmarque as que não quiser.
          </p>
          <div className="space-y-0.5 mb-2">
            {recomendacoes.map(r => (
              <label key={r.id} className="flex items-center gap-2 text-[10px] p-1 rounded cursor-pointer" style={{ color: '#cbd5e1' }}>
                <input type="checkbox" checked={bookSel.has(r.id)} onChange={() => toggleBook(r.id)} />
                <span className="flex-1 truncate">{r.nome}</span>
                <span style={{ color: '#64748b' }}>{r.conteudo.equacaoIds.length} eq.</span>
              </label>
            ))}
          </div>
          <button onClick={gerarBook} disabled={bookSel.size === 0 || !importacaoId || bookEstado === 'carregando'}
            className="w-full py-2 rounded text-[11px] font-bold text-white flex items-center justify-center gap-1.5"
            style={{ background: (bookSel.size === 0 || !importacaoId || bookEstado === 'carregando') ? '#1a3a6b' : 'var(--invicta-green-dark)', opacity: (bookSel.size === 0 || !importacaoId) ? 0.5 : 1 }}>
            {bookEstado === 'carregando' ? <><Loader2 size={13} className="animate-spin" /> Gerando book…</> : <><FileText size={13} /> Gerar book PDF ({bookSel.size})</>}
          </button>
          {erroBook && (
            <div className="mt-2 px-2 py-1.5 rounded text-[10px] flex items-start gap-1.5" style={{ background: '#3a1a1a', color: '#fca5a5', border: '1px solid #7f1d1d' }}>
              <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" /> <span>{erroBook}</span>
            </div>
          )}
        </div>
      )}

      {comparar && <ComparadorCenarios cenarios={comparar} onClose={() => setComparar(null)} />}
    </div>
  );
}
