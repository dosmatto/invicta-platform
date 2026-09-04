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
import { salvarCenario, listarCenarios, descomprimirCenario, excluirCenario, hidratarRotulos, type Cenario } from '@/lib/recomendacao/cenarios';
import { colorirDose, recortarNoPoligono } from '@/lib/raster';
import { coordsFromBounds, extrairPoligono } from '@/lib/fertilidade';
import { agruparPorRotulo } from '@/lib/recomendacao/dosePorZona';
import { nutrientesDaEquacao } from '@/lib/recomendacao/doseZonaDireta';
import { bindingDasZonas, valoresDasZonas } from '@/lib/recomendacao/zonasComLaudo';
import { zonasDoTalhao } from '@/lib/recomendacao/zonasDoTalhao';
import { classesVisiveis, indiceClasse } from '@/lib/recomendacao/faixas';
import { ComparadorCenarios } from '@/components/talhao/ComparadorCenarios';
import { ModalFormulaAvulsa } from '@/components/equacao/ModalFormulaAvulsa';
import {
  assinaturaRascunho, checarRascunho, equacaoComRascunho, formulaEditada, gravarRascunho,
  lerRascunho, rascunhoDaEquacao, type RascunhoFormula,
} from '@/lib/recomendacao/formulaAvulsa';
import { montarBookOficial, abrirOuBaixar } from '@/lib/recomendacao/relatorioCenarios';
import { Play, Loader2, AlertTriangle, Wand2, Save, FolderOpen, Trash2, Eye, GitCompare, FileText, Star, Calculator, Pencil, RotateCcw, ChevronDown } from 'lucide-react';

import { inputStyle } from '@/constants/ui';
import { fmtDec as fmt, fmtHa } from '@/lib/formato';

// Número de cenário ANTIGO pode não existir. Quando `inv_cenarios` nasceu
// (v0.49.0) a dose era só `toneladas` + `custo: number | null` — `custoHa` só
// chegou na v0.51.0. `fmtDec` chama toLocaleString direto e estoura tanto em
// undefined quanto em null, derrubando a seção inteira ao abrir a gaveta.
// (A janela entre as duas versões é de um dia, então talvez não exista nenhum
// documento assim; a guarda custa nada e a alternativa é uma tela quebrada.)
// Ausente vira travessão, que é a verdade: não foi gravado.
const num = (v: number | null | undefined, dec = 0): string =>
  typeof v === 'number' && Number.isFinite(v) ? fmt(v, dec) : '—';

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
  //
  // PERSISTIDO POR TALHÃO, e não é capricho: trocar de aba DESMONTA este
  // componente (TalhaoPage renderiza `{tabAtivo === 'recomendacoes' && <.../>}`).
  // Com o modo em estado volátil, o agrônomo escolhia "Por zona", aplicava, ia
  // à aba Arquivos gerar o SHP, voltava — e encontrava "Interpolação" de novo.
  // Clicava em Aplicar e recebia o mapa interpolado, sem nenhuma mensagem. Era
  // literalmente o "continua entregando interpolado" do relato.
  // Inicializador preguiçoso (o padrão da casa — ver SeletorLegenda /
  // CondutividadeSection): o componente é remontado a cada volta para a aba,
  // então ler aqui já restaura a escolha.
  const [modoMapa, setModoMapaRaw] = useState<'interpolar' | 'zona'>(() =>
    (typeof window !== 'undefined' && nav.talhaoId
      && localStorage.getItem(`inv_recom_modo_${nav.talhaoId}`) === 'zona') ? 'zona' : 'interpolar');
  const setModoMapa = useCallback((m: 'interpolar' | 'zona') => {
    setModoMapaRaw(m);
    if (typeof window !== 'undefined' && nav.talhaoId) {
      localStorage.setItem(`inv_recom_modo_${nav.talhaoId}`, m);
    }
  }, [nav.talhaoId]);

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

  // ── FÓRMULA AVULSA (v2.73) ───────────────────────────────────────────────
  // A fórmula da equação escolhida aparece na tela e pode ser reescrita AQUI,
  // valendo só para este talhão (lógica do InCeres, adaptada: a Biblioteca só
  // muda por um botão de salvar). `rascunho` é a sobreposição aplicada; nulo =
  // vale o cadastro. Persistido por talhão+equação porque trocar de aba
  // desmonta esta seção — o mesmo motivo do `modoMapa` acima.
  const [editandoFormula, setEditandoFormula] = useState(false);
  const chaveRasc = nav.talhaoId && equacaoId ? `${nav.talhaoId}|${equacaoId}` : '';
  // O que está gravado (lido uma vez por talhão+equação) e o que foi mexido
  // nesta sessão de tela. Sem `useEffect`: a leitura é derivada da chave, do
  // mesmo jeito que o `modoMapa` lê o localStorage no inicializador.
  const rascunhoSalvo = useMemo(
    () => (nav.talhaoId && equacaoId) ? lerRascunho(nav.talhaoId, equacaoId) : null,
    [nav.talhaoId, equacaoId],
  );
  const [rascunhoMexido, setRascunhoMexido] = useState<Record<string, RascunhoFormula | null>>({});
  const rascunho = chaveRasc && chaveRasc in rascunhoMexido ? rascunhoMexido[chaveRasc] : rascunhoSalvo;
  const setRascunho = useCallback((r: RascunhoFormula | null) => {
    if (!chaveRasc) return;
    setRascunhoMexido(m => ({ ...m, [chaveRasc]: r }));
    if (nav.talhaoId && equacaoId) gravarRascunho(nav.talhaoId, equacaoId, r);
  }, [chaveRasc, nav.talhaoId, equacaoId]);

  // A fórmula que de fato vai ser aplicada (cadastro + rascunho por cima).
  const formulaEmUso = useMemo<RascunhoFormula | null>(() => {
    if (!eqSel) return null;
    return rascunho ?? rascunhoDaEquacao(eqSel.conteudo);
  }, [eqSel, rascunho]);
  const editada = !!(eqSel && rascunho && formulaEditada(eqSel.conteudo, rascunho));
  const checagem = useMemo(() => formulaEmUso ? checarRascunho(formulaEmUso) : null, [formulaEmUso]);
  // Equação a aplicar: a do cadastro, ou uma cópia com a fórmula editada. O `id`
  // é preservado (a numeração da equação nos relatórios continua batendo); o
  // nome carrega a marca, porque o cenário e o PDF têm de dizer que a conta que
  // gerou aquele mapa não é mais a que está na Biblioteca.
  const eqAplicar = useMemo(() => {
    if (!eqSel) return null;
    if (!editada || !rascunho) return eqSel;
    return { ...eqSel, nome: `${eqSel.nome} (fórmula editada)`, conteudo: equacaoComRascunho(eqSel.conteudo, rascunho) };
  }, [eqSel, editada, rascunho]);

  // GAVETA do cenário salvo: um por vez. Ver o conteúdo NÃO custa nada (os
  // rótulos são re-hidratados sem descomprimir grid) e, principalmente, não
  // mexe na tela — o "Reabrir" baixa e descomprime todos os grids e SUBSTITUI o
  // que está aberto, então usá-lo só para conferir o que tem dentro custa caro
  // e ainda faz perder o trabalho em andamento.
  const [cenarioAberto, setCenarioAberto] = useState<string | null>(null);
  const detalheCenario = useMemo(() => {
    const c = salvos.find(x => x.id === cenarioAberto);
    return c ? hidratarRotulos(c) : null;
    // `equacoes` entra como SINAL de que a Biblioteca mudou: hidratarRotulos lê
    // dela por dentro, e sem esta dependência renomear uma equação atualizava a
    // tela e deixava a gaveta aberta com o nome velho — exatamente o que a
    // legenda viva (legendaViva.ts) existe para não deixar acontecer.
  }, [cenarioAberto, salvos, equacoes]);

  const recarregarSalvos = useCallback(async () => {
    if (nav.talhaoId && safra) setSalvos(await listarCenarios(nav.talhaoId, safra));
  }, [nav.talhaoId, safra]);
  useEffect(() => { recarregarSalvos(); }, [recarregarSalvos]);

  // Assinatura da fórmula em uso — entra no id do cenário e na limpeza abaixo:
  // mexer na fórmula invalida o mapa que está na tela.
  const assinaturaFormula = useMemo(() => (editada && rascunho) ? assinaturaRascunho(rascunho) : '', [editada, rascunho]);

  // limpa resultado ao trocar contexto
  useEffect(() => { setDoses([]); setFalhas([]); setEstado('idle'); setErro(''); setVisivel(0); setSalvoMsg(''); setCenMeta(null); }, [modo, equacaoId, recomendacaoId, importacaoId, modoMapa, assinaturaFormula]);

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
      if (!eqSel || !eqAplicar) { setErro('Escolha uma equação.'); setEstado('erro'); return; }
      if (checagem && !checagem.ok) { setErro(`Fórmula inválida: ${checagem.erro}`); setEstado('erro'); return; }
      itens = [eqAplicar];
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
      // FÓRMULA EDITADA: vira BANDEIRA na dose, e não só texto no nome. Todo
      // relatório reabre o cenário por `descomprimirCenario`, que re-hidrata o
      // nome a partir da equação atual da Biblioteca — sem a bandeira, a
      // marcação sumia do PDF e ele dizia que o mapa veio da equação oficial.
      const marcadas = (editada && rascunho)
        ? ok.map(d => ({ ...d, formulaEditada: true, scriptUsado: rascunho.script }))
        : ok;
      // Divisão de aplicação (escolhida na hora) → grupo de mapas (passadas).
      const div: DivCfg = { ativo: divAtivo, limiteMax: parseFloat(divLimite.replace(',', '.')) || 0, unidade: divUnid };
      const finais = (modo === 'recomendacao') ? expandirDoses(marcadas, div, area) : marcadas;
      setDoses(finais); setFalhas(erros);
      setEstado(finais.length ? 'pronto' : 'erro');
      if (!finais.length) { setErro('Nenhuma equação pôde ser aplicada — veja os detalhes abaixo.'); return; }
      // Auto-salva o cenário na nuvem (id determinístico = não duplica ao reprocessar).
      const ref = modo === 'recomendacao' ? recomendacaoId : equacaoId;
      // O MODO ENTRA NO ID. Sem isso, aplicar em interpolação gravava por cima do
      // cenário por zona (mesmo doc na nuvem) e todos os entregáveis das abas
      // Arquivos/Relatórios voltavam a sair interpolados.
      const sufZona = porZonaAtivo ? '_zona' : '';
      // A FÓRMULA EDITADA ENTRA NO ID, pelo mesmo motivo do `_zona`: sem isso,
      // aplicar uma fórmula avulsa gravaria por cima do cenário da equação
      // original — e todos os entregáveis daquele cenário passariam a sair com
      // uma conta que não é a da Biblioteca, sem ninguém notar.
      const sufFormula = assinaturaFormula ? `_f${assinaturaFormula}` : '';
      const autoId = `cen_${nav.talhaoId}_${importacaoId}_${modo}_${ref}${sufZona}${sufFormula}`;
      const custoTotal = finais.reduce((s, d) => s + (d.custo ?? 0), 0);
      const nome = nomeCenario.trim() || `${recSel?.nome ?? eqAplicar?.nome ?? 'Cenário'}`;
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
    // REABRIR SUBSTITUI o que está na tela. Enquanto ele era o único jeito de
    // espiar o conteúdo de um cenário salvo, avisar seria atrapalhar; agora que
    // a gaveta mostra tudo sem custo, quem clica aqui quer mesmo trocar — e
    // trocar por engano custa o trabalho em andamento.
    if (estado === 'pronto' && doses.length > 0 && cen.id !== cenMeta?.id
      && !confirm(`Reabrir "${cen.nome}" substitui os ${doses.length} mapa(s) que estão na tela. Continuar?`)) return;
    setEstado('carregando'); setErro('');
    try {
      const full = await descomprimirCenario(cen);
      setDoses(full.doses); setFalhas([]); setVisivel(0); setEstado('pronto');
      // O cenário diz em que modo foi feito: se as doses trazem taxa por zona,
      // o seletor tem de refletir isso — senão a tela mostra "Interpolação" com
      // um resultado por zona na frente, e o próximo Aplicar troca tudo.
      setModoMapa(full.doses.some(d => d.porZona?.length) ? 'zona' : 'interpolar');
      setCenMeta({ id: cen.id, origem: full.origem, recomendacaoId: full.recomendacaoId, nome: full.nome });
    } catch (e) { setErro('Falha ao reabrir: ' + (e instanceof Error ? e.message : String(e))); setEstado('erro'); }
  }
  async function excluirSalvo(c: Cenario) {
    if (!confirm(`Excluir o cenário "${c.nome}"?`)) return;
    await excluirCenario(c.id); await recarregarSalvos();
    setSelCompara(prev => { const n = new Set(prev); n.delete(c.id); return n; });
    // O id do cenário é DETERMINÍSTICO (`cen_${talhaoId}_${importacaoId}_…`, sem
    // timestamp): sem limpar isto, aplicar de novo a mesma equação recria o
    // MESMO id e a gaveta reapareceria aberta sem ninguém ter clicado.
    setCenarioAberto(prev => (prev === c.id ? null : prev));
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
      // O BOOK RESPEITA O MODO DO MAPA. Antes ele sempre recalculava por
      // interpolação e regravava NO MESMO id do cenário — então um clique aqui
      // desfazia a recomendação por zona já salva, e as abas Arquivos/Relatórios
      // voltavam a entregar o mapa interpolado. Silenciosamente.
      const porZonaBook = modoMapa === 'zona' && zonasTalhao.length > 0;
      const impBook = importacoes.find(i => i.id === importacaoId) ?? null;
      const zonasBook = agruparPorRotulo(zonasTalhao);
      const bindBook = (porZonaBook && impBook && nav.talhaoId)
        ? bindingDasZonas(nav.talhaoId, safra, impBook, zonasBook) : null;
      const grids = porZonaBook ? {} : await carregarGridsTalhao(nav.talhaoId, importacaoId, 'dose');
      const area = talhao?.areaHa ?? 0;
      const cens: Cenario[] = [];
      for (const r of recs) {
        const itens = (r.conteudo.equacaoIds.map(id => equacoes.find(e => e.id === id)).filter(Boolean) as ItemBiblioteca<ConteudoEquacao>[]).sort(compararEquacoes);
        const ok: DoseCalculada[] = [];
        for (const it of itens) {
          try {
            if (porZonaBook && impBook && bindBook && poligono) {
              const c = it.conteudo;
              const vals = valoresDasZonas(impBook, bindBook, zonasBook, nutrientesDaEquacao(c.script, c.constantes), c.profundidade || '0-20');
              ok.push(calcularDosePorZona(it, zonasBook, vals, area, poligono, insumos));
            } else {
              ok.push(calcularDose(it, grids, area, poligono, insumos));
            }
          } catch { /* sem dado p/ essa equação */ }
        }
        if (ok.length === 0) continue;
        const divBook: DivCfg = { ativo: divAtivo, limiteMax: parseFloat(divLimite.replace(',', '.')) || 0, unidade: divUnid };
        const finais = expandirDoses(ok, divBook, area);   // divide em passadas se marcado
        const custoTotal = finais.reduce((s, d) => s + d.custo, 0);
        const financeiro = { custoTotal, custoHa: area ? custoTotal / area : 0, areaHa: area };
        cens.push({ id: '', talhaoId: nav.talhaoId, safra, importacaoId, origem: 'recomendacao', recomendacaoId: r.id, nome: r.nome, doses: finais, financeiro, geradoEm: Date.now(), geradoPor: '' });
        salvarCenario({ talhaoId: nav.talhaoId, safra, importacaoId, origem: 'recomendacao', recomendacaoId: r.id, nome: r.nome, doses: finais, financeiro }, `cen_${nav.talhaoId}_${importacaoId}_recomendacao_${r.id}${porZonaBook ? '_zona' : ''}`).catch(() => {});
      }
      if (cens.length === 0) { if (aba) aba.close(); setErroBook(porZonaBook
          ? 'Nenhuma recomendação pôde ser aplicada por zona — falta o resultado do laudo dos atributos usados, nas zonas.'
          : 'Nenhuma recomendação pôde ser aplicada — faltam mapas interpolados dos atributos usados.'); setBookEstado('erro'); return; }
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
  const podeAplicar = !!importacaoId
    && (modo === 'equacao' ? (!!eqSel && !!checagem?.ok) : !!recSel)
    && estado !== 'carregando';

  // Quem não calcula (produtor, leitor) vê a LISTA dos cenários do ano — nome,
  // "p/ uso", data, produtos e custo — e nada de editar. Os arquivos para
  // aplicação saem da aba Arquivos.
  if (!pode('recomendacoes')) return (
    <div className="p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Wand2 size={14} style={{ color: '#a78bfa' }} />
        <h3 className="text-sm font-bold" style={{ color: '#e2e8f0' }}>Recomendações do ano</h3>
      </div>
      {salvos.length === 0 ? (
        <p className="text-[11px]" style={{ color: '#64748b' }}>Nenhum cenário de recomendação neste ano.</p>
      ) : salvos.map(c => {
        const emUso = c.doses.filter(d => d.usar);
        return (
          <div key={c.id} className="p-2.5 rounded-lg space-y-1" style={{ background: '#061525', border: `1px solid ${emUso.length ? 'var(--invicta-green)' : '#1a3a6b'}` }}>
            <div className="text-[11px] font-bold flex items-center gap-1.5" style={{ color: '#e2e8f0' }}>
              {c.nome}
              {emUso.length > 0 && <span className="text-[8px] font-bold px-1 py-0.5 rounded" style={{ background: 'var(--invicta-green-dark)', color: '#fff' }}>para uso</span>}
            </div>
            <div className="text-[10px]" style={{ color: '#94a3b8' }}>
              {new Date(c.geradoEm).toLocaleDateString('pt-BR')} · {c.doses.length} produto(s) · R$ {num(c.financeiro?.custoTotal, 2)} ({num(c.financeiro?.custoHa, 2)}/ha)
            </div>
            {c.doses.length > 0 && (
              <ul className="text-[10px] space-y-0.5" style={{ color: '#cbd5e1' }}>
                {c.doses.map((d, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <span style={{ color: d.usar ? '#4ade80' : '#475569' }}>{d.usar ? '●' : '○'}</span>
                    <span className="truncate">{d.produto}</span>
                    <span className="ml-auto tabular-nums" style={{ color: '#94a3b8' }}>{num(d.stats?.media, 0)} {d.unidade} · {num(d.toneladas, 1)} t</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      {/* Relatório: o mesmo book PDF oficial de quem calcula — só gera, não grava. */}
      {recomendacoes.length > 0 && (
        <div style={{ borderTop: '1px solid #1a3a6b', paddingTop: 10 }}>
          <div className="flex items-center gap-1.5 mb-1">
            <FileText size={13} style={{ color: '#a78bfa' }} />
            <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#93c5fd' }}>Book de recomendações (PDF)</span>
          </div>
          <div className="space-y-0.5 mb-2">
            {recomendacoes.map(r => (
              <label key={r.id} className="flex items-center gap-2 text-[10px] p-1 rounded cursor-pointer" style={{ color: '#cbd5e1' }}>
                <input type="checkbox" checked={bookSel.has(r.id)} onChange={() => toggleBook(r.id)} />
                <span className="flex-1 truncate">{r.nome}</span>
              </label>
            ))}
          </div>
          <button onClick={gerarBook} disabled={bookSel.size === 0 || !importacaoId || bookEstado === 'carregando'}
            className="w-full py-2 rounded text-[11px] font-bold text-white flex items-center justify-center gap-1.5"
            style={{ background: (bookSel.size === 0 || !importacaoId || bookEstado === 'carregando') ? '#1a3a6b' : 'var(--invicta-green-dark)' }}>
            {bookEstado === 'carregando' ? <><Loader2 size={13} className="animate-spin" /> Gerando book…</> : <><FileText size={13} /> Gerar book PDF ({bookSel.size})</>}
          </button>
          {erroBook && <p className="mt-2 text-[10px]" style={{ color: '#fca5a5' }}>{erroBook}</p>}
        </div>
      )}
      <p className="text-[10px]" style={{ color: '#475569' }}>Os arquivos para aplicação dos cenários marcados “para uso” estão na aba Arquivos.</p>
    </div>
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

          {/* A FÓRMULA NA TELA. Antes o agrônomo escolhia a equação pelo nome e
              aplicava no escuro; aqui ele lê a conta que vai rodar e, se
              precisar, reescreve para este talhão. */}
          {eqSel && formulaEmUso && (
            <div className="mt-2 rounded" style={{ background: '#061525', border: `1px solid ${editada ? '#7c5e12' : '#1a3a6b'}` }}>
              <div className="flex items-center justify-between px-2 py-1" style={{ borderBottom: '1px solid #1a3a6b' }}>
                <div className="flex items-center gap-1 min-w-0">
                  <Calculator size={11} style={{ color: '#a78bfa' }} />
                  <span className="text-[10px] font-bold" style={{ color: '#cbd5e1' }}>Fórmula</span>
                  <span className="text-[9px] truncate" style={{ color: '#64748b' }}>
                    · {formulaEmUso.profundidade} · {formulaEmUso.unidadeTratamento}
                  </span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {editada && (
                    <button onClick={() => setRascunho(null)} title="Voltar à fórmula cadastrada na Biblioteca"
                      className="p-1 rounded hover:bg-white/10" style={{ color: '#fbbf24' }}><RotateCcw size={11} /></button>
                  )}
                  <button onClick={() => setEditandoFormula(true)} title="Abrir a fórmula para editar"
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
                    <Pencil size={9} /> Editar
                  </button>
                </div>
              </div>
              <pre className="px-2 py-1.5 text-[10px] font-mono whitespace-pre-wrap break-words m-0" style={{ color: '#a5d6a7', maxHeight: 140, overflowY: 'auto' }}>
                {formulaEmUso.script.trim() || '(vazia)'}
              </pre>
              {formulaEmUso.constantes.length > 0 && (
                <div className="px-2 pb-1 text-[9px] font-mono" style={{ color: '#93c5fd' }}>
                  {formulaEmUso.constantes.map(k => `${k.nome} = ${k.valor}`).join(' · ')}
                </div>
              )}
              <div className="px-2 pb-1.5 text-[9px]" style={{ color: checagem?.ok ? '#64748b' : '#fca5a5' }}>
                {checagem?.ok
                  ? `Atributos: ${checagem.vars.length ? checagem.vars.map(v => v.toUpperCase()).join(', ') : 'nenhum (só constantes)'}`
                  : checagem?.erro}
              </div>
              {editada && (
                <div className="px-2 py-1 text-[9px] font-semibold" style={{ background: '#2a230b', color: '#fbbf24' }}>
                  Fórmula alterada só para este talhão — a equação da Biblioteca continua como estava.
                </div>
              )}
            </div>
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

          {/* O MODO POR ZONA NÃO PODE FALHAR EM SILÊNCIO. Se o seletor está em
              "Por zona" e o que está na tela não é por zona, o usuário tem de
              saber POR QUÊ — antes desta caixa, o mapa simplesmente voltava a
              ser o raster interpolado e ele só via "continua interpolado". */}
          {modoMapa === 'zona' && doseAtiva && !dosePorZona && (
            <div className="p-2.5 rounded-lg" style={{ background: '#2d1a00', border: '1px solid #92400e' }}>
              <p className="text-[10px] font-bold" style={{ color: '#fbbf24' }}>
                Este mapa NÃO é por zona — está interpolado
              </p>
              <p className="text-[9px] mt-1" style={{ color: '#a16207' }}>
                {!doseAtiva.porZona?.length
                  ? 'O resultado na tela veio de um cálculo por interpolação (cenário reaberto ou aplicado em outro modo). Clique em "Aplicar e salvar" para recalcular por zona.'
                  : 'As zonas deste resultado não batem com o zoneamento atual do talhão — ele mudou depois do cálculo. Clique em "Aplicar e salvar" para recalcular.'}
              </p>
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
              const aberto = cenarioAberto === c.id;
              const doses = aberto ? (detalheCenario?.doses ?? c.doses) : c.doses;
              const nUso = c.doses.filter(d => d.usar).length;
              // Produto sem custo/tonelada entra no total como ZERO. A lista de
              // cima já marca isso com asterisco (fin.temSemCusto); sem a mesma
              // marca aqui, um cenário incompleto parece o mais barato — na tela
              // em que se escolhe cenário por dinheiro.
              const semCusto = c.doses.some(d => d.custoTonelada == null);
              return (
                <div key={c.id} className="rounded-lg overflow-hidden" style={{ background: '#061525', border: marcado ? '1px solid var(--invicta-green)' : '1px solid #1a3a6b' }}>
                  {/* A LINHA INTEIRA abre/fecha a gaveta. Caixa de comparar e os
                      botões de ação param o clique — cada um tem seu próprio efeito. */}
                  {/* A linha inteira abre/fecha no MOUSE, por conveniência — mas
                      quem carrega o papel de botão é a seta. Pôr role="button" no
                      container faria dele o único elemento que o leitor de tela
                      enxerga (filhos de um botão são presentacionais na ARIA), e
                      Comparar / Reabrir / Excluir sumiriam para quem navega assim. */}
                  <div className="p-2 flex items-center gap-2 cursor-pointer"
                    onClick={() => setCenarioAberto(aberto ? null : c.id)}>
                    <input type="checkbox" checked={marcado} onClick={e => e.stopPropagation()}
                      onChange={() => toggleCompara(c.id)} disabled={!marcado && selCompara.size >= 3} title="Comparar" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-bold truncate flex items-center gap-1" style={{ color: '#e2e8f0' }}>
                        {c.nome}
                        {nUso > 0 && <span className="text-[8px] font-bold px-1 py-0.5 rounded" style={{ background: 'var(--invicta-green-dark)', color: '#fff' }}>{nUso} p/ uso</span>}
                      </div>
                      <div className="text-[9px]" style={{ color: '#64748b' }}>
                        {new Date(c.geradoEm).toLocaleDateString('pt-BR')} · {c.doses.length} produto(s) · R$ {num(c.financeiro?.custoTotal, 2)}{semCusto ? '*' : ''}
                      </div>
                    </div>
                    <button aria-expanded={aberto} aria-label={`Ver os produtos de ${c.nome}`}
                      onClick={e => { e.stopPropagation(); setCenarioAberto(aberto ? null : c.id); }}
                      title={aberto ? 'Fechar' : 'Ver os produtos deste cenário'}
                      className="flex items-center px-1 py-0.5 rounded flex-shrink-0"
                      style={{ background: aberto ? '#2e5fa3' : '#1a3a6b', color: aberto ? '#fff' : '#93c5fd' }}>
                      <ChevronDown size={12} style={{ transform: aberto ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                    </button>
                    <button onClick={e => { e.stopPropagation(); reabrir(c); }} title="Reabrir — substitui os mapas que estão na tela" className="p-1 rounded hover:bg-white/10" style={{ color: '#93c5fd' }}><FolderOpen size={12} /></button>
                    <button onClick={e => { e.stopPropagation(); excluirSalvo(c); }} title="Excluir" className="p-1 rounded hover:bg-white/10" style={{ color: '#f87171' }}><Trash2 size={12} /></button>
                  </div>

                  {aberto && (
                    <div style={{ borderTop: '1px solid #1a3a6b', background: '#03101f' }}>
                      <div className="px-2 py-1.5 flex items-center gap-2 text-[9px]" style={{ color: '#64748b', borderBottom: '1px solid #0f2240' }}>
                        <span>R$ {num(c.financeiro?.custoHa, 2)}/ha</span>
                        <span>·</span>
                        <span>{num(c.financeiro?.areaHa, 2)} ha</span>
                      </div>
                      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                        {doses.map((d, i) => {
                          // MESMA linguagem da lista de doses da tela (logo acima):
                          // ★ âmbar para "p/ uso", "NN · equação" no título e o
                          // produto no subtítulo. Duas listas dos mesmos produtos
                          // com dois vocabulários obrigam a traduzir de cabeça.
                          const n = numeroEquacao(d.equacaoId);
                          const semPreco = d.custoTonelada == null;
                          // `unidade` pode vir STRING VAZIA (não só ausente): sem o
                          // fallback, "1.200 · 30 t" não diz se é kg/ha ou t/ha — mil
                          // vezes de diferença na tela em que se decide. 'kg/ha' é o
                          // mesmo padrão que o relatório usa (relatorioCenarios).
                          const unidade = d.unidade || 'kg/ha';
                          // E em t/ha o arredondamento a zero casas apagaria a dose:
                          // 0,4 t/ha viraria "0".
                          const casas = /t\/ha|ton/i.test(unidade) ? 2 : 0;
                          const min = d.stats?.min, max = d.stats?.max;
                          const varia = typeof min === 'number' && typeof max === 'number'
                            && Number.isFinite(min) && Number.isFinite(max) && max - min > 0.5;
                          return (
                            <div key={`${d.equacaoId}_${i}`} className="px-2 py-1 flex items-center gap-2"
                              style={{ borderBottom: i < doses.length - 1 ? '1px solid #0a1c30' : undefined }}>
                              <Star size={11} fill={d.usar ? '#fbbf24' : 'none'} className="flex-shrink-0"
                                style={{ color: d.usar ? '#fbbf24' : '#334155' }}
                                aria-label={d.usar ? 'Marcado para uso' : 'Não marcado'} />
                              <div className="flex-1 min-w-0">
                                <div className="text-[10px] font-bold truncate" style={{ color: d.usar ? '#e2e8f0' : '#94a3b8' }}>
                                  {n != null && <span style={{ color: '#93c5fd' }}>{String(n).padStart(2, '0')} · </span>}
                                  {d.nomeEquacao || d.produto}
                                  {d.porZona?.length ? <span className="ml-1 text-[8px] px-1 rounded" style={{ background: '#1a3a6b', color: '#93c5fd' }}>zona</span> : null}
                                  {d.formulaEditada ? <span className="ml-1 text-[8px] px-1 rounded" style={{ background: '#422006', color: '#fbbf24' }}>fórmula editada</span> : null}
                                </div>
                                {/* A FAIXA, não só a média: em taxa variável "méd 300"
                                    tanto pode ser 300 chapado quanto 120–480, e é
                                    justamente essa diferença que se quer saber. */}
                                <div className="text-[9px] truncate" style={{ color: '#64748b' }}>
                                  {d.produto && d.produto !== d.nomeEquacao ? `${d.produto} · ` : ''}méd {num(d.stats?.media, casas)}
                                  {varia ? ` (${num(min, casas)}–${num(max, casas)})` : ''} {unidade} · {num(d.toneladas, 1)} t
                                </div>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <div className="text-[10px]" style={{ color: semPreco ? '#fbbf24' : '#cbd5e1' }}>
                                  R$ {num(d.custo, 2)}{semPreco ? '*' : ''}
                                </div>
                                <div className="text-[9px]" style={{ color: '#64748b' }}>R$ {num(d.custoHa, 2)}/ha</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {semCusto && (
                        <div className="px-2 py-1 text-[8px]" style={{ color: '#64748b', borderTop: '1px solid #0f2240' }}>
                          * alguns produtos sem custo/tonelada — insumo sem preço, ou equação não vinculada
                        </div>
                      )}
                    </div>
                  )}
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

      {editandoFormula && eqSel && formulaEmUso && (
        <ModalFormulaAvulsa
          equacao={eqSel}
          rascunho={formulaEmUso}
          outras={equacoes.filter(e => e.id !== eqSel.id)}
          podeSalvarBiblioteca={pode('biblioteca')}
          onUsar={setRascunho}
          onTrocarEquacao={setEquacaoId}
          onFechar={() => setEditandoFormula(false)}
        />
      )}
    </div>
  );
}
