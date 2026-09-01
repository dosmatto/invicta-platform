'use client';

// PRESCRIÇÕES AGRONÔMICAS — doses em taxa variável por zona de manejo, prontas
// para virar arquivo de aplicação (SHP/Excel/PDF).
//
// Abas: Nova · Salvas · Arquivos de Aplicação · Histórico · Comparação (futura).
// O cálculo vive em lib/prescricao (puro, testado); aqui é montagem e edição.
// Fonte das zonas: os ZONEAMENTOS salvos na aba Zonas de Manejo — sem duplicar
// dado nenhum: a prescrição guarda um SNAPSHOT (documento operacional).

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import {
  getZoneamentosMeap, getPrescricoes, savePrescricao, salvarVersaoPrescricao,
  deletePrescricao, registrarExportePrescricao, getTalhoes, getFazendas, getClientes,
  type ZoneamentoMeap,
} from '@/lib/store';
import { emailUsuario } from '@/lib/empresa';
import { listar as bibListar, type ItemBiblioteca, type ConteudoEquacao } from '@/lib/biblioteca';
import {
  complementarNutriente, complementarPorZona, podeComplementar, NUTRIENTES, ROTULO_NUTRIENTE, SIMBOLO_NUTRIENTE, garantiaDe,
  precoNaUnidade,
  type CategoriaInsumo, type ConteudoInsumo, type Nutriente,
} from '@/lib/insumos';
import {
  redistribuirPorEstoque, distribuirProporcional, distribuirPorAjuste, resumoDoses, nutrientesPorZona, pesoDoRank, arredondarDose,
} from '@/lib/prescricao/calculo';
import { dosesPorEquacao, variaveisDaEquacao } from '@/lib/prescricao/equacao';
import {
  estoqueTotalSementes, metricasSementes, doseCompensada, fatorCampo,
  type EstoqueSementes,
} from '@/lib/prescricao/sementes';
import {
  validarPrescricao, exportarSHPPrescricao, exportarXlsxPrescricao, exportarPDFPrescricao,
  corDaDose, areaHaDe,
} from '@/lib/prescricao/exportar';
import { fatiarArea } from '@/lib/areaGeo';
import {
  ROTULO_TIPO, ROTULO_MODO, UNIDADE_TOTAL, ehUnidadeSemente,
  type Prescricao, type TipoPrescricao, type ModoCalculo, type UnidadeDose,
  type ZonaDose, type ParamsCalculo, type ParamsSementes,
} from '@/lib/prescricao/tipos';
import {
  Plus, Save, Trash2, FileDown, FileSpreadsheet, FileText, Loader2, AlertTriangle,
  CheckCircle2, History, FolderOpen, Scale, Sprout, Pencil, RefreshCw,
} from 'lucide-react';
import { inputStyle } from '@/constants/ui';
import { resumoInsumo } from '@/components/panels/InsumosPanel';
import { rotuloZona } from '@/lib/meap/rotuloZona';
import { prescricaoEmUnidade, podeConverter, converterDose, UNIDADES_SEMENTE, CASAS_DA_UNIDADE, ROTULO_CURTO, ROTULO_SAIDA } from '@/lib/prescricao/unidade';
import { fmtHa } from '@/lib/formato';

const fmt = (v: number, d = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmt0 = (v: number) => Math.round(v).toLocaleString('pt-BR');
const dataBR = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

type AbaId = 'nova' | 'salvas' | 'arquivos' | 'historico' | 'comparacao';

// Rascunho da prescrição em edição (nova ou aberta de uma salva).
interface Rascunho {
  editandoId: string | null;
  nome: string;
  tipo: TipoPrescricao;
  produto: string;
  insumoId: string;
  unidade: UnidadeDose;
  custoUnit: string;             // texto do input; número no salvar
  zoneamentoId: string;
  zoneamentoNome: string;
  modo: ModoCalculo;
  params: ParamsCalculo;
  zonas: ZonaDose[];
  fc: GeoJSON.FeatureCollection | null;
  // modo 'equacao'
  equacaoId: string;
  valoresEquacao: Record<string, Record<string, number>>;   // idZona → varLower → nº
}

// Modos oferecidos ao criar. 'estoque' e 'proporcional' saíram da tela: os dois
// faziam, com outro nome, o que "Dose base + ajuste % por zona" faz — e o que
// só o de estoque acrescentava (informar o disponível em sacos/kg/milhões)
// virou um botão dentro do ajuste. Prescrições salvas nesses modos continuam
// abrindo e exportando: o botão do modo legado reaparece para elas.
const MODOS_VISIVEIS: ModoCalculo[] = ['manual', 'ajuste', 'equacao', 'complemento'];

// Que categorias da Biblioteca de Insumos servem a cada tipo de prescrição.
const CATEGORIA_DO_TIPO: Record<TipoPrescricao, CategoriaInsumo[]> = {
  sementes: ['semente'],
  fertilizante: ['fertilizante'],
  corretivo: ['corretivo', 'gesso'],
  organico: ['esterco', 'composto'],
  personalizado: ['personalizado', 'fertilizante', 'corretivo', 'gesso', 'esterco', 'composto', 'semente'],
};

const RASCUNHO_VAZIO: Rascunho = {
  editandoId: null, nome: '', tipo: 'fertilizante', produto: '', insumoId: '', unidade: 'kg/ha',
  custoUnit: '', zoneamentoId: '', zoneamentoNome: '', modo: 'manual',
  // Config inicial do rascunho = a que mais se usa na semente:
  //   • Total fixo — consome o disponível (cenarioAjuste 'total'): parte-se do
  //     estoque/meta e distribui-se por zona, em vez de somar dose a dose.
  //   • Total POR HECTARE (sementes/ha): é como o agrônomo pensa a dose
  //     ("80.000/ha"); digitar isso no modo "total" fazia a prescrição sair
  //     dezenas de vezes menor sem avisar.
  // Prescrição salva mantém o que foi gravado; só o rascunho novo nasce assim.
  params: { totalPorHa: true, cenarioAjuste: 'total' }, zonas: [], fc: null, equacaoId: '', valoresEquacao: {},
};

// Padrão dos Parâmetros da semente quando ainda não foram informados: 98% de
// germinação (semente comercial fiscalizada) e 60.000 sementes/saco (milho, o
// mais comum). São só o VALOR INICIAL do campo — o agrônomo troca quando o lote
// pede. Antes o padrão era 90% e o saco vinha vazio.
const SEMENTE_PADRAO: ParamsSementes = { germinacaoPct: 98, sementesPorSaco: 60000 };

// Zonas a partir de um zoneamento salvo (1 feature = 1 zona no MEAP).
//
// A área de cada zona é uma FATIA da área do polígono do talhão, não a área
// geodésica crua do desenho dela: as zonas nascem sobre uma malha (raster,
// suavização, área mínima) e somavam alguns hectares a menos que o limite — a
// prescrição imprimia "139,28 ha" num talhão de 142,38 ha, e a diferença virava
// dúvida em vez de informação.
function zonasDoZoneamento(z: ZoneamentoMeap, areaTalhaoHa = 0): ZonaDose[] {
  const areas = fatiarArea(z.fc.features.map(f => areaHaDe(f)), areaTalhaoHa);
  return z.fc.features.map((f, i) => {
    const p = (f.properties ?? {}) as { id?: string; zona?: string | number; classe?: string; cor?: string; potencialRank?: number };
    return {
      idZona: String(p.id ?? `z${i}`),
      nomeZona: p.zona != null || p.id != null ? rotuloZona(p) : String(i + 1),
      classe: String(p.classe ?? '—'),
      cor: String(p.cor ?? '#94a3b8'),
      areaHa: areas[i] ?? areaHaDe(f),
      potencialRank: typeof p.potencialRank === 'number' ? p.potencialRank : undefined,
      dose: 0,
    };
  });
}

export function PrescricoesSection({ safraNome }: { safraNome?: string } = {}) {
  const { nav, setZonasManejo } = useApp();
  const talhaoId = nav.talhaoId ?? '';
  const [aba, setAba] = useState<AbaId>('nova');
  const [tick, setTick] = useState(0);
  // A área do POLÍGONO do talhão é a régua de tudo: as zonas são fatias dela.
  const areaTalhaoHa = useMemo(
    () => getTalhoes().find(t => t.id === talhaoId)?.areaHa ?? 0,
    [talhaoId, tick],   // eslint-disable-line react-hooks/exhaustive-deps
  );


  useEffect(() => {
    const h = () => setTick(t => t + 1);
    window.addEventListener('inv:prescricoes', h);
    return () => window.removeEventListener('inv:prescricoes', h);
  }, []);

  const zoneamentos = useMemo(() => (talhaoId ? getZoneamentosMeap(talhaoId) : []), [talhaoId]);
  const prescricoes = useMemo(() => (talhaoId ? getPrescricoes(talhaoId) : []), [talhaoId, tick]);
  // Agrupa as VERSÕES da mesma prescrição (ligadas por origemId): a mais nova
  // primeiro, as anteriores logo abaixo — nenhuma some ao salvar alterações.
  const linhagens = useMemo(() => {
    const grupos = new Map<string, Prescricao[]>();
    for (const p of prescricoes) {
      const chave = p.origemId ?? p.id;
      const arr = grupos.get(chave);
      if (arr) arr.push(p); else grupos.set(chave, [p]);
    }
    return [...grupos.values()]
      .map(vs => [...vs].sort((a, b) => b.versao - a.versao))
      .sort((a, b) => b[0].atualizadoEm.localeCompare(a[0].atualizadoEm));
  }, [prescricoes]);

  const [r, setR] = useState<Rascunho>(RASCUNHO_VAZIO);
  const patch = (p: Partial<Rascunho>) => setR(x => ({ ...x, ...p }));
  const patchParams = (p: Partial<ParamsCalculo>) => setR(x => ({ ...x, params: { ...x.params, ...p } }));

  const [avisosCalc, setAvisosCalc] = useState<string[]>([]);
  const [erro, setErro] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [exportando, setExportando] = useState('');
  // UNIDADE DE SAÍDA: população (sementes/ha) é como o agrônomo pensa;
  // sementes por metro linear é como o operador regula a plantadeira. São o
  // mesmo número em réguas diferentes — a escolha vale para a TABELA e para o
  // ARQUIVO, sem refazer a prescrição. null = a unidade da própria prescrição.
  const [unidadeSaida, setUnidadeSaida] = useState<UnidadeDose | null>(null);
  /** As réguas de semente disponíveis para ver/exportar esta prescrição. */
  const reguas = useMemo(() => {
    if (!ehUnidadeSemente(r.unidade)) return null;
    const esp = r.params.sementes?.espacamentoM;
    return {
      espacamentoM: esp,
      opcoes: UNIDADES_SEMENTE.map(u => ({ u, ok: podeConverter(r.unidade, u, esp) })),
    };
  }, [r.unidade, r.params.sementes?.espacamentoM]);
  /** Régua escolhida para a saída (e para a coluna de equivalência da tabela). */
  const saida = unidadeSaida && reguas?.opcoes.some(o => o.u === unidadeSaida && o.ok) ? unidadeSaida : r.unidade;

  function escolherZoneamento(id: string) {
    const z = zoneamentos.find(x => x.id === id);
    if (!z) { patch({ zoneamentoId: '', zoneamentoNome: '', zonas: [], fc: null }); return; }
    patch({ zoneamentoId: z.id, zoneamentoNome: z.nome, zonas: zonasDoZoneamento(z, areaTalhaoHa), fc: z.fc });
    setAvisosCalc([]); setErro(''); setOkMsg('');
  }

  function abrirSalva(p: Prescricao) {
    setR({
      editandoId: p.id, nome: p.nome, tipo: p.tipo, produto: p.produto, insumoId: p.insumoId ?? '', unidade: p.unidade,
      custoUnit: p.custoUnit != null ? String(p.custoUnit) : '',
      zoneamentoId: p.zoneamentoId, zoneamentoNome: p.zoneamentoNome,
      modo: p.modo, params: p.params, zonas: p.zonas.map(z => ({ ...z })), fc: p.fc,
      equacaoId: p.equacaoId ?? '', valoresEquacao: p.valoresEquacao ?? {},
    });
    setAvisosCalc([]); setErro(''); setOkMsg('');
    setAba('nova');
  }

  // Equações salvas na Biblioteca (mesmas da Recomendação) — fonte do modo 'equacao'.
  const equacoes = useMemo(() => bibListar<ConteudoEquacao>('equacoes').filter(e => e.ativo), [tick]);

  // ── Insumos da Biblioteca (Parte XIV) ────────────────────────────────────
  // O produto deixou de ser texto livre: sem garantia cadastrada não há como
  // saber quanto o adubo entrega de cada nutriente, e é disso que a
  // complementação vive. Cada tipo de prescrição enxerga a sua categoria.
  const insumos = useMemo(() => bibListar<ConteudoInsumo>('insumos').filter(i => i.ativo), [tick]);
  const insumosDoTipo = useMemo(
    () => insumos.filter(i => CATEGORIA_DO_TIPO[r.tipo].includes(i.conteudo?.categoria)),
    [insumos, r.tipo],
  );
  const fertilizantes = useMemo(() => insumos.filter(i => podeComplementar(i.conteudo?.categoria)), [insumos]);
  const insumoSel = useMemo(() => insumos.find(i => i.id === r.insumoId) ?? null, [insumos, r.insumoId]);

  function escolherInsumo(id: string) {
    const it = insumos.find(x => x.id === id);
    if (!it) { patch({ insumoId: '', produto: '' }); return; }
    const c = it.conteudo;
    // Puxa junto o que o cadastro sabe: preço, garantias do orgânico e os
    // parâmetros da semente — digitar de novo é pedir divergência.
    const extras: Partial<Rascunho> = {};
    // O custo daqui é por unidade-BASE da dose (kg quando a dose é kg/ha, t
    // quando é t/ha) e o cadastro guarda por tonelada — sem converter, um
    // calcário de R$ 350/t entrava como R$ 350/KG numa prescrição em kg/ha.
    // Unidade-base que não é de massa (sementes, litro) não sai do peso: melhor
    // deixar em branco do que preencher com número errado.
    const base = UNIDADE_TOTAL[r.unidade];
    const preco = base === 'kg' || base === 't' ? precoNaUnidade(c, base) : undefined;
    if (preco != null && !r.custoUnit) extras.custoUnit = String(preco);
    if (c.organico?.garantiasKgT) patchParams({ organico: { ...r.params.organico, ...c.organico.garantiasKgT } });
    if (c.semente) {
      patchParams({ sementes: {
        ...(r.params.sementes ?? SEMENTE_PADRAO),
        ...(c.semente.pmsG != null ? { pmsG: c.semente.pmsG } : {}),
        ...(c.semente.germinacaoPct != null ? { germinacaoPct: c.semente.germinacaoPct } : {}),
        ...(c.semente.cultivar ? { cultivar: c.semente.cultivar } : {}),
      } });
    }
    patch({ insumoId: it.id, produto: it.nome, ...extras });
    // No modo complementação, o produto DESTA prescrição é o complementar —
    // não faz sentido escolher de novo lá embaixo; a garantia vem junto.
    if (r.modo === 'complemento') {
      const nut = r.params.complemento?.nutriente ?? 'n';
      patchComp({ compInsumoId: it.id, compNome: it.nome, compGarantiaPct: garantiaDe(c, nut) });
    }
  }

  // ── Complementação por nutriente (Parte XIV §7) ──────────────────────────
  const comp = r.params.complemento;
  const resultadoComp = useMemo(() => (comp ? complementarNutriente({
    metaKgHa: comp.metaKgHa ?? 0,
    baseGarantiaPct: comp.baseGarantiaPct ?? 0,
    baseDoseKgHa: comp.baseDoseKgHa ?? 0,
    compGarantiaPct: comp.compGarantiaPct ?? 0,
  }) : null), [comp]);

  // Prescrições JÁ SALVAS que podem servir de base: fertilizante, versão mais
  // recente de cada linhagem, e nunca a que está sendo editada.
  const prescricoesBase = useMemo(
    () => linhagens.map(vs => vs[0]).filter(p => p.tipo === 'fertilizante' && p.id !== r.editandoId),
    [linhagens, r.editandoId],
  );

  /** Usa uma prescrição salva como produto base: puxa o produto, a garantia do
   *  nutriente e — o que importa — a dose de CADA zona. */
  function escolherPrescricaoBase(id: string, nut: Nutriente) {
    if (!id) { patchComp({ basePrescricaoId: undefined, basePrescricaoNome: undefined, baseDosePorZona: undefined }); return; }
    const base = prescricoesBase.find(p => p.id === id);
    if (!base) return;
    // Prescrição salva antes da Biblioteca de Insumos não tem insumoId; casar
    // pelo NOME do produto recupera a garantia em vez de deixar o campo vazio.
    const ins = insumos.find(i => i.id === base.insumoId)
      ?? insumos.find(i => i.nome.trim().toLowerCase() === (base.produto ?? '').trim().toLowerCase());
    const dosePorZona: Record<string, number> = {};
    base.zonas.forEach(z => { dosePorZona[z.idZona] = z.dose; });
    patchComp({
      basePrescricaoId: base.id,
      basePrescricaoNome: `${base.nome} (v${base.versao})`,
      baseInsumoId: ins?.id ?? base.insumoId,
      baseNome: base.produto || ins?.nome,
      baseGarantiaPct: ins ? garantiaDe(ins.conteudo, nut) : undefined,
      baseDosePorZona: dosePorZona,
      baseDoseKgHa: undefined,
    });
    // Zoneamento diferente = as zonas não casam; melhor dizer agora do que
    // deixar metade das zonas sem base na hora de aplicar.
    if (r.zoneamentoId && base.zoneamentoId && base.zoneamentoId !== r.zoneamentoId) {
      setAvisosCalc([`A prescrição base usa outro zoneamento ("${base.zoneamentoNome}"). As zonas que não casarem ficam sem desconto do produto base.`]);
    }
  }

  function patchComp(pc: Partial<NonNullable<ParamsCalculo['complemento']>>) {
    patchParams({ complemento: { nutriente: 'n', ...(r.params.complemento ?? {}), ...pc } });
  }

  /** Aplica a dose calculada nas zonas. Com prescrição base, cada zona tem a
   *  sua — a taxa variável do base se propaga para o complemento. */
  function aplicarComplemento() {
    setErro(''); setOkMsg('');
    const c = r.params.complemento;
    if (!c) { setErro('Configure a complementação primeiro.'); return; }

    if (c.baseDosePorZona) {
      const porZona = complementarPorZona(
        r.zonas.map(z => ({ idZona: z.idZona, baseDoseKgHa: c.baseDosePorZona![z.idZona] ?? 0 })),
        { metaKgHa: c.metaKgHa ?? 0, baseGarantiaPct: c.baseGarantiaPct ?? 0, compGarantiaPct: c.compGarantiaPct ?? 0 },
      );
      const doses = new Map(porZona.map(x => [x.idZona, arredondarDose(x.doseCompKgHa)]));
      patch({ zonas: r.zonas.map(z => ({ ...z, dose: doses.get(z.idZona) ?? 0 })) });
      const semBase = r.zonas.filter(z => c.baseDosePorZona![z.idZona] == null).map(z => z.nomeZona);
      const vals = [...doses.values()];
      setAvisosCalc([
        ...[...new Set(porZona.flatMap(x => x.avisos))],
        ...(semBase.length ? [`Sem dose do produto base nas zonas ${semBase.join(', ')} — nelas o complemento cobre a meta inteira.`] : []),
        `Dose calculada por zona: ${fmt(Math.min(...vals), 1)} a ${fmt(Math.max(...vals), 1)} ${r.unidade} — a taxa variável do produto base foi mantida.`,
      ]);
      return;
    }

    if (!resultadoComp) { setErro('Configure a complementação primeiro.'); return; }
    if (resultadoComp.doseCompKgHa <= 0) {
      setAvisosCalc(resultadoComp.avisos.length ? resultadoComp.avisos : ['Nada a complementar: a meta já foi atingida pelo produto base.']);
      return;
    }
    const dose = arredondarDose(resultadoComp.doseCompKgHa);
    patch({ zonas: r.zonas.map(z => ({ ...z, dose })) });
    setAvisosCalc([
      ...resultadoComp.avisos,
      `Dose de ${r.produto || 'complementar'} aplicada em todas as zonas: ${fmt(dose, 1)} ${r.unidade}. Ajuste zona a zona na tabela se quiser taxa variável.`,
    ]);
  }
  const eqSel = useMemo(() => equacoes.find(e => e.id === r.equacaoId) ?? null, [equacoes, r.equacaoId]);
  const varsEq = useMemo(
    () => (eqSel ? variaveisDaEquacao(eqSel.conteudo.script, eqSel.conteudo.constantes) : []),
    [eqSel]);

  // Fator de conversão da unidade-dose → unidade-base (1 exceto sementes/m).
  // sementes/m sem espaçamento → null (bloqueia cálculo/salvamento). Sem
  // try/catch no useMemo: a única fonte de erro é o espaçamento ausente, testado
  // aqui direto (fatorBaseDose só lança nesse caso).
  const espac = r.params.sementes?.espacamentoM;
  const fatorBase = useMemo<number | null>(() => {
    if (r.unidade !== 'sementes/m') return 1;
    return espac && espac > 0 ? 10_000 / espac : null;
  }, [r.unidade, espac]);

  // ── Cálculo (por modo) ────────────────────────────────────────────────────
  const nRanks = useMemo(() => Math.max(1, ...r.zonas.map(z => z.potencialRank ?? 1)), [r.zonas]);

  function calcular() {
    setErro(''); setOkMsg('');
    try {
      const pr = r.params;
      if (r.modo === 'estoque') {
        if (!pr.totalDisponivel || pr.totalDisponivel <= 0) { setErro('Informe a quantidade total disponível.'); return; }
        const rel = pr.relacao ?? 'direta';
        const res = redistribuirPorEstoque(
          r.zonas.map(z => ({ id: z.idZona, areaHa: z.areaHa, peso: pesoDoRank(z.potencialRank, nRanks, rel) })),
          pr.totalDisponivel,
          { doseMin: pr.doseMin, doseMax: pr.doseMax, incremento: pr.incremento },
        );
        patch({ zonas: r.zonas.map(z => ({ ...z, dose: arredondarDose(res.doses[z.idZona] ?? 0) })) });
        setAvisosCalc(res.avisos);
      } else if (r.modo === 'proporcional') {
        if (!pr.doseMedia || pr.doseMedia <= 0) { setErro('Informe a dose média.'); return; }
        const rel = pr.relacao ?? 'direta';
        const res = distribuirProporcional(
          // valorBase = potencial da zona (rank 1 = maior) → valor MAIOR
          r.zonas.map(z => ({ id: z.idZona, areaHa: z.areaHa, valorBase: nRanks - (z.potencialRank ?? Math.ceil(nRanks / 2)) + 1 })),
          { doseMedia: pr.doseMedia, variacaoPct: pr.variacaoPct ?? 20, relacao: rel, doseMin: pr.doseMin, doseMax: pr.doseMax },
        );
        patch({ zonas: r.zonas.map(z => ({ ...z, dose: arredondarDose(res.doses[z.idZona] ?? 0) })) });
        setAvisosCalc(res.avisos);
      } else if (r.modo === 'ajuste') {
        const cen = pr.cenarioAjuste ?? 'livre';
        if (cen === 'livre' && !(pr.doseBase && pr.doseBase > 0)) { setErro('Informe a dose base.'); return; }
        if (cen === 'total' && !(pr.totalDisponivel && pr.totalDisponivel > 0)) { setErro('Informe a quantidade total disponível.'); return; }
        if (fatorBase == null) { setErro('Para dose em sementes por metro, informe o espaçamento entre linhas.'); return; }
        const res = distribuirPorAjuste(
          r.zonas.map(z => ({ id: z.idZona, areaHa: z.areaHa })),
          {
            doseBase: pr.doseBase ?? 0, ajustePct: pr.ajustePct ?? {}, cenario: cen,
            totalDisponivel: pr.totalDisponivel, fatorBase,
            doseMin: pr.doseMin, doseMax: pr.doseMax, incremento: pr.incremento,
          },
        );
        patch({ zonas: r.zonas.map(z => ({ ...z, dose: arredondarDose(res.doses[z.idZona] ?? 0) })) });
        setAvisosCalc(res.avisos);
      }
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
  }

  // Valor de entrada de UMA variável numa zona (modo equação).
  function setValorEq(idZona: string, varLower: string, valor: number | undefined) {
    setR(x => {
      const zona = { ...(x.valoresEquacao[idZona] ?? {}) };
      if (valor == null) delete zona[varLower]; else zona[varLower] = valor;
      return { ...x, valoresEquacao: { ...x.valoresEquacao, [idZona]: zona } };
    });
  }
  // Pré-preenche uma variável em TODAS as zonas com o "número da zona" escolhido.
  function preencherVarComFonte(varLower: string, fonte: 'rank' | 'nome' | 'area') {
    setR(x => {
      const vals = { ...x.valoresEquacao };
      for (const z of x.zonas) {
        const n = fonte === 'rank' ? (z.potencialRank ?? NaN)
          : fonte === 'area' ? z.areaHa
          : Number(z.nomeZona);
        if (Number.isFinite(n)) vals[z.idZona] = { ...(vals[z.idZona] ?? {}), [varLower]: n };
      }
      return { ...x, valoresEquacao: vals };
    });
  }

  function calcularEquacao() {
    setErro(''); setOkMsg('');
    if (!eqSel) { setErro('Escolha uma equação salva.'); return; }
    const c = eqSel.conteudo;
    const { doses, erroCompilacao } = dosesPorEquacao(
      r.zonas.map(z => ({ id: z.idZona })), r.valoresEquacao,
      { script: c.script, constantes: c.constantes, naoNegativo: c.naoNegativo,
        doseMinimaViavel: c.doseMinimaViavel, abaixoMinimo: c.abaixoMinimo, doseMaxima: c.doseMaxima },
    );
    if (erroCompilacao) { setErro(`Equação com erro: ${erroCompilacao}`); return; }
    const porId = new Map(doses.map(d => [d.id, d]));
    patch({ zonas: r.zonas.map(z => { const d = porId.get(z.idZona)?.dose; return { ...z, dose: d == null ? NaN : arredondarDose(d) }; }) });
    const comErro = doses.filter(d => d.erro);
    setAvisosCalc(comErro.length
      ? comErro.map(d => `Zona ${r.zonas.find(z => z.idZona === d.id)?.nomeZona}: ${d.erro}`)
      : [`Doses calculadas pela equação "${eqSel.nome}".`]);
  }

  // sementes: estado próprio do estoque (como o usuário informa)
  const [estSem, setEstSem] = useState<{ modo: keyof EstoqueSementes; valor: string }>({ modo: 'populacaoMediaHa', valor: '' });

  // Estoque de sementes (sacos, kg, milhões ou média/ha) → Total disponível.
  // O painel era um MODO à parte ("Quantidade total disponível"), que fazia o
  // mesmo papel do ajuste % por zona com outro nome. Aqui ele volta ao que
  // realmente acrescenta: converter o que o produtor tem no depósito para o
  // número de sementes que alimenta o cálculo por ajuste.
  function usarEstoqueComoTotal() {
    setErro(''); setOkMsg('');
    try {
      const ps = r.params.sementes ?? SEMENTE_PADRAO;
      const areaTot = r.zonas.reduce((s, z) => s + z.areaHa, 0);
      const v = Number(estSem.valor.replace(',', '.'));
      if (!v || v <= 0) { setErro('Informe o estoque de sementes.'); return; }
      const total = estoqueTotalSementes({ [estSem.modo]: v } as EstoqueSementes, ps, areaTot);
      const margem = Math.min(50, Math.max(0, ps.margemPct ?? 0)) / 100;
      const disponivel = total * (1 - margem);
      patchParams({ totalDisponivel: disponivel, totalPorHa: false, cenarioAjuste: 'total' });
      setAvisosCalc([
        `Total disponível: ${fmt0(disponivel)} sementes` +
        (margem > 0 ? ` (margem de ${fmt(margem * 100, 0)}% já descontada de ${fmt0(total)}).` : '.') +
        ' Ajuste os % por zona e clique em "Calcular doses por ajuste".',
      ]);
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
  }

  // ── Resumo ao vivo (editor) ───────────────────────────────────────────────
  // A dose digitada é população e há fator de campo para compensar? Então a
  // tabela mostra as duas colunas: o que foi pedido e o que vai no arquivo.
  const compensa = ehUnidadeSemente(r.unidade) && !!r.params.doseEhPopulacao && Math.abs(fatorCampo(r.params.sementes ?? { germinacaoPct: 100 }) - 1) > 1e-9;
  const custoNum = Number(r.custoUnit.replace(',', '.')) || undefined;
  // O resumo (usado/restante/dose média) conta pela dose DIGITADA — é a mesma
  // base do "Total disponível", senão o restante acusa um estouro que não
  // existe: com compensação, a meta é dada em população e o arquivo sai em
  // sementes. O consumo real de sementes vai separado, logo abaixo.
  const resumo = useMemo(() => resumoDoses(r.zonas, custoNum, fatorBase ?? 1), [r.zonas, custoNum, fatorBase]);
  const totalArquivo = useMemo(
    () => (compensa ? r.zonas.reduce((s, z) => s + doseCompensada(z.dose, r.params.sementes, true) * z.areaHa * (fatorBase ?? 1), 0) : null),
    [compensa, r.zonas, r.params.sementes, fatorBase],
  );
  const nutri = useMemo(() => (
    r.tipo === 'organico' && r.params.organico
      ? nutrientesPorZona(r.zonas.map(z => ({ id: z.idZona, areaHa: z.areaHa, dose: z.dose })), r.params.organico)
      : null
  ), [r.tipo, r.params.organico, r.zonas]);

  const metricasSem = useMemo(() => {
    // metricasSementes espera sementes/HA; se a dose está em sementes/m, sobe
    // pela conversão (× fator). doseMedia já está na unidade-dose.
    if (!ehUnidadeSemente(r.unidade) || !r.params.sementes || resumo.doseMedia <= 0) return null;
    // Com compensação, a taxa é a dose compensada — senão a "população final"
    // sai descontada duas vezes e aparece 72.000 onde o alvo é 80.000.
    const base = doseCompensada(resumo.doseMedia, r.params.sementes, compensa);
    const doseHa = base * (r.unidade === 'sementes/m' ? (fatorBase ?? 1) : 1);
    try { return metricasSementes(doseHa, resumo.areaHa, r.params.sementes); } catch { return null; }
  }, [r.unidade, r.params.sementes, resumo, fatorBase, compensa]);

  // ── Mapa: zonas da prescrição + a DOSE em cada uma ───────────────────────
  // A aba não publicava nada no mapa: escolher o zoneamento montava a tabela e
  // o mapa continuava só com o limite do talhão — a prescrição era decidida no
  // escuro. Aqui as zonas do mapa-base entram com a cor delas e o rótulo passa
  // a carregar a dose, que é o número que vai para a máquina.
  const zonasMapa = useMemo<GeoJSON.FeatureCollection | null>(() => {
    const feats = r.fc?.features?.filter(f => f.geometry) ?? [];
    if (!feats.length) return null;
    const porId = new Map(r.zonas.map(z => [z.idZona, z]));
    // Antes de calcular, toda dose é 0 — mostrar "0 kg/ha" em tudo seria ruído.
    // Depois de calcular, o 0 de uma zona é decisão ("não aplica aqui") e tem
    // que aparecer.
    const temDose = r.zonas.some(z => Number.isFinite(z.dose) && z.dose > 0);
    const casas = ehUnidadeSemente(r.unidade) ? 0 : 1;
    return {
      type: 'FeatureCollection',
      features: feats.map((f, i) => {
        const p = (f.properties ?? {}) as { id?: string; zona?: string | number; classe?: string; cor?: string };
        const z = porId.get(String(p.id ?? `z${i}`));
        const nome = z?.nomeZona ?? String(p.zona ?? i + 1);
        const dose = z?.dose;
        const linhaDose = temDose && dose != null && Number.isFinite(dose)
          ? `\n${casas ? fmt(dose, 1) : fmt0(dose)} ${r.unidade}`
          : '';
        return {
          type: 'Feature' as const,
          properties: {
            cor: z?.cor ?? p.cor ?? '#94a3b8',
            rotulo: `Zona ${nome}${linhaDose}`,
            classeLabel: z?.classe ?? p.classe ?? '',
            selecionada: false,
          },
          geometry: f.geometry!,
        };
      }),
    };
  }, [r.fc, r.zonas, r.unidade]);

  // Sincroniza o mapa (sistema externo) com o rascunho; some ao sair da aba.
  useEffect(() => { setZonasManejo(zonasMapa); return () => setZonasManejo(null); }, [zonasMapa, setZonasManejo]);

  // ── Salvar / exportar ─────────────────────────────────────────────────────
  function montarPrescricao(): Omit<Prescricao, 'id' | 'versao' | 'criadoEm' | 'atualizadoEm' | 'historico' | 'exportes'> | null {
    if (!r.fc || !r.zonas.length) { setErro('Escolha um zoneamento (Zonas de Manejo) primeiro.'); return null; }
    if (!r.nome.trim()) { setErro('Dê um nome à prescrição (ex.: "Calcário 2026").'); return null; }
    if (!r.produto.trim()) { setErro('Informe o produto.'); return null; }
    if (r.unidade === 'sementes/m' && fatorBase == null) {
      setErro('Para dose em sementes por metro, informe o espaçamento entre linhas (nos parâmetros da semente).'); return null;
    }
    return {
      talhaoId, ano: safraNome || undefined, nome: r.nome.trim(), tipo: r.tipo,
      produto: r.produto.trim(), insumoId: r.insumoId || undefined, unidade: r.unidade, custoUnit: custoNum,
      zoneamentoId: r.zoneamentoId, zoneamentoNome: r.zoneamentoNome,
      modo: r.modo, params: r.params, zonas: r.zonas, fc: r.fc,
      criadoPor: emailUsuario() ?? 'sistema',
      ...(r.modo === 'equacao' && eqSel
        ? { equacaoId: eqSel.id, equacaoNome: eqSel.nome, valoresEquacao: r.valoresEquacao }
        : {}),
    };
  }

  function salvar() {
    setErro(''); setOkMsg('');
    const base = montarPrescricao();
    if (!base) return;
    if (r.editandoId) {
      // Versão NOVA, registro novo: a anterior fica salva com os arquivos que
      // gerou. O editor passa a trabalhar sobre a versão recém-criada.
      const nova = salvarVersaoPrescricao(r.editandoId, base, 'doses/parâmetros editados', emailUsuario() ?? 'sistema');
      if (!nova) { setErro('Versão anterior não encontrada.'); return; }
      patch({ editandoId: nova.id });
      setOkMsg(`Versão ${nova.versao} salva — a v${nova.versao - 1} continua na lista, com os arquivos dela.`);
    } else {
      const nova = savePrescricao(base);
      patch({ editandoId: nova.id });
      setOkMsg('Prescrição salva — agora dá para exportar.');
    }
    setTick(t => t + 1);
  }

  async function exportar(formato: 'shp' | 'xlsx' | 'pdf', deSalva?: Prescricao) {
    setErro(''); setOkMsg('');
    let p: Prescricao | undefined = deSalva;
    if (!p) {
      // Arquivo de aplicação precisa ser rastreável — mas exigir "salve antes"
      // e devolver o usuário para outro botão é atrito à toa: se ainda não foi
      // salva, salva aqui e segue direto para a exportação. O que a regra
      // protege (existir versão registrada) continua valendo.
      let id = r.editandoId;
      if (!id) {
        const base = montarPrescricao();
        if (!base) return;               // montarPrescricao já explicou o que falta
        const nova = savePrescricao(base);
        id = nova.id;
        patch({ editandoId: id });
        setTick(t => t + 1);
      }
      p = getPrescricoes(talhaoId).find(x => x.id === id);
    }
    if (!p) { setErro('Prescrição não encontrada.'); return; }
    // Unidade de saída: o arquivo sai na régua escolhida (população ou
    // sementes/m). A prescrição SALVA não muda — a conversão é exata e
    // reversível, então ela acontece só na saída.
    // Só entre unidades de SEMENTE: a escolha feita no editor não pode vazar
    // para uma prescrição salva de adubo (kg/ha não vira sementes/m).
    if (unidadeSaida && unidadeSaida !== p.unidade && ehUnidadeSemente(p.unidade) && ehUnidadeSemente(unidadeSaida)) {
      if (!podeConverter(p.unidade, unidadeSaida, p.params.sementes?.espacamentoM)) {
        setErro('Informe o espaçamento entre linhas (Parâmetros da semente) para exportar em sementes por metro.');
        return;
      }
      p = prescricaoEmUnidade(p, unidadeSaida);
    }
    const val = validarPrescricao(p);
    // Erro = o arquivo sairia quebrado; não há o que decidir.
    if (val.erros.length) { setErro(`Não exportado — corrija: ${val.erros.join(' · ')}`); return; }
    // Ressalva = o arquivo sai certo, mas a conta não fecha com o que foi
    // declarado. Quem decide se manda assim é o agrônomo, não a validação.
    if (val.ressalvas.length && !confirm(`${val.ressalvas.join('\n\n')}\n\nGerar o arquivo assim mesmo?`)) return;
    if (val.avisos.length || val.ressalvas.length) setAvisosCalc([...val.ressalvas, ...val.avisos]);
    setExportando(`${p.id}:${formato}`);
    try {
      const t = getTalhoes().find(x => x.id === talhaoId);
      const f = getFazendas().find(x => x.id === t?.fazendaId);
      const c = getClientes().find(x => x.id === f?.clienteId);
      // Nome do arquivo no padrão de campo (SA03_TX_MILHO): a fazenda e o
      // talhão só existem aqui na tela — o motor de exportação não os conhece.
      const identArq = { fazenda: f?.nome ?? '', siglaFazenda: f?.sigla ?? null, talhao: t?.nome ?? '' };
      const nome =
        formato === 'shp' ? await exportarSHPPrescricao(p, identArq)
        : formato === 'xlsx' ? await exportarXlsxPrescricao(p, identArq)
        : await exportarPDFPrescricao(p, {
            produtor: c?.nome ?? '', fazenda: f?.nome ?? '', talhao: t?.nome ?? '',
            siglaFazenda: f?.sigla ?? null,
            logoClienteUrl: (c as { logoUrl?: string } | undefined)?.logoUrl ?? null,
          });
      registrarExportePrescricao(p.id, formato, nome, emailUsuario() ?? 'sistema');
      setOkMsg(`Arquivo gerado: ${nome}`);
      setTick(t2 => t2 + 1);
    } catch (e) {
      setErro(`Falha ao exportar: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setExportando(''); }
  }

  if (!talhaoId) return <p className="px-4 py-6 text-center text-[11px]" style={{ color: '#64748b' }}>Selecione um talhão.</p>;

  const ABAS: Array<[AbaId, string, React.ElementType]> = [
    ['nova', r.editandoId ? 'Editar' : 'Nova', Plus],
    ['salvas', `Salvas (${linhagens.length})`, FolderOpen],
    ['arquivos', 'Arquivos de Aplicação', FileDown],
    ['historico', 'Histórico', History],
    ['comparacao', 'Planejado × Realizado', Scale],
  ];

  return (
    <div>
      <div className="flex gap-1 p-2 flex-wrap" style={{ borderBottom: '1px solid #1a3a6b' }}>
        {ABAS.map(([id, rot, Ic]) => (
          <button key={id} onClick={() => setAba(id)}
            className="flex items-center gap-1 px-2 py-1.5 rounded text-[10px] font-semibold"
            style={{ background: aba === id ? 'var(--invicta-blue-mid)' : '#0f2240', color: aba === id ? '#fff' : '#93c5fd' }}>
            <Ic size={11} /> {rot}
          </button>
        ))}
      </div>

      <div className="px-4 py-3 space-y-3">
        {erro && <Aviso tom="erro" texto={erro} />}
        {okMsg && <Aviso tom="ok" texto={okMsg} />}

        {aba === 'nova' && (
          <>
            {/* ── Identificação ── */}
            <div className="grid grid-cols-2 gap-2">
              <Campo rotulo="Nome da prescrição *">
                <input value={r.nome} onChange={e => patch({ nome: e.target.value })} placeholder='ex.: "Calcário 2026"'
                  className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
              </Campo>
              <Campo rotulo="Tipo">
                <select value={r.tipo}
                  onChange={e => {
                    const tipo = e.target.value as TipoPrescricao;
                    // Sair de sementes DESLIGA a compensação: senão o marcador
                    // fica ligado e o relatório de um adubo passa a falar em
                    // "população" e "germinação", que ali não existem.
                    patch({ tipo, unidade: tipo === 'sementes' ? 'sementes/ha' : tipo === 'organico' || tipo === 'corretivo' ? 't/ha' : 'kg/ha' });
                    if (tipo !== 'sementes') patchParams({ doseEhPopulacao: false });
                  }}
                  className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
                  {Object.entries(ROTULO_TIPO).map(([id, rot]) => <option key={id} value={id}>{rot}</option>)}
                </select>
              </Campo>
              {/* Produto vem da BIBLIOTECA DE INSUMOS (Parte XIV §5): texto livre
                  não carrega garantia, e sem garantia não há complementação nem
                  conta de nutriente. Prescrição antiga, salva com produto
                  digitado, continua abrindo — o nome aparece como opção legada. */}
              <Campo rotulo={r.modo === 'complemento' ? 'Produto * — o que ESTA prescrição aplica (o complemento)' : 'Produto * (Biblioteca → Insumos)'}>
                <select value={r.insumoId || (r.produto ? '__legado' : '')}
                  onChange={e => { if (e.target.value !== '__legado') escolherInsumo(e.target.value); }}
                  className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
                  <option value="">Selecione o produto…</option>
                  {r.produto && !r.insumoId && <option value="__legado">{r.produto} (cadastro antigo)</option>}
                  {insumosDoTipo.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
                </select>
                {insumosDoTipo.length === 0 && (
                  <p className="text-[9px] mt-0.5 leading-relaxed" style={{ color: '#fbbf24' }}>
                    Nenhum insumo cadastrado para <strong>{ROTULO_TIPO[r.tipo]}</strong>. Cadastre em{' '}
                    <strong style={{ color: '#93c5fd' }}>Biblioteca → Insumos</strong> — é lá que ficam as garantias que os cálculos usam.
                  </p>
                )}
                {insumoSel && (
                  <p className="text-[9px] mt-0.5" style={{ color: '#64748b' }}>{resumoInsumo(insumoSel.conteudo)}</p>
                )}
              </Campo>
              <div className="grid grid-cols-2 gap-2">
                <Campo rotulo="Unidade">
                  <select value={r.unidade} onChange={e => patch({ unidade: e.target.value as UnidadeDose })}
                    className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
                    {(['kg/ha', 't/ha', 'sementes/ha', 'sementes/m', 'sementes/m2', 'L/ha'] as UnidadeDose[]).map(u =>
                      <option key={u} value={u}>{ROTULO_SAIDA[u] ?? u}</option>)}
                  </select>
                </Campo>
                <Campo rotulo={`Custo (R$/${UNIDADE_TOTAL[r.unidade]})`}>
                  <input value={r.custoUnit} onChange={e => patch({ custoUnit: e.target.value })} placeholder="opcional"
                    className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
                </Campo>
              </div>
            </div>

            {/* ── Fonte das zonas ── */}
            <Campo rotulo="Zonas de manejo (mapa-base) *">
              <select value={r.zoneamentoId} onChange={e => escolherZoneamento(e.target.value)}
                className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
                <option value="">Selecione o zoneamento…</option>
                {zoneamentos.map(z => <option key={z.id} value={z.id}>{z.nome} · {z.meta.nZonas} zonas{z.padrao ? ' · padrão' : ''}</option>)}
              </select>
              {zoneamentos.length === 0 && (
                <p className="text-[10px] mt-1" style={{ color: '#fbbf24' }}>
                  Este talhão ainda não tem zoneamento salvo. Crie um na aba <b>Zonas de Manejo</b> primeiro.
                </p>
              )}
            </Campo>

            {/* Espaçamento é obrigatório p/ converter sementes/m em total. */}
            {r.unidade === 'sementes/m' && (
              <div className="p-2 rounded-lg flex items-end gap-2" style={{ background: '#061525', border: `1px solid ${fatorBase == null ? '#92400e' : '#1a3a6b'}` }}>
                <div className="flex-1">
                  <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Espaçamento entre linhas (m) *</label>
                  <InputNum valor={r.params.sementes?.espacamentoM}
                    onMudou={v => patchParams({ sementes: { ...(r.params.sementes ?? SEMENTE_PADRAO), espacamentoM: v } })} />
                </div>
                <p className="flex-[2] text-[9px] leading-relaxed" style={{ color: fatorBase == null ? '#fbbf24' : '#94a3b8' }}>
                  {fatorBase == null
                    ? 'Informe o espaçamento para a dose em sementes/metro virar total (10.000/espaçamento = metros de linha por hectare).'
                    : `${fmt0(fatorBase)} m de linha por hectare — cada semente/metro equivale a ${fmt0(fatorBase)} sementes/ha.`}
                </p>
              </div>
            )}

            {r.zonas.length > 0 && (
              <>
                {/* ── Modo de cálculo ── */}
                <div className="flex gap-1 flex-wrap">
                  {(Object.entries(ROTULO_MODO) as Array<[ModoCalculo, string]>)
                    .filter(([id]) => MODOS_VISIVEIS.includes(id) || r.modo === id)
                    .map(([id, rot]) => (
                    <button key={id} onClick={() => {
                        patch({ modo: id }); setAvisosCalc([]);
                        if (id === 'complemento') {
                          const it = insumos.find(x => x.id === r.insumoId);
                          const nut = r.params.complemento?.nutriente ?? 'n';
                          if (it) patchComp({ compInsumoId: it.id, compNome: it.nome, compGarantiaPct: garantiaDe(it.conteudo, nut) });
                          else patchComp({ nutriente: nut });
                        }
                      }}
                      className="px-2 py-1.5 rounded text-[10px] font-semibold"
                      style={{ background: r.modo === id ? 'var(--invicta-green-dark)' : '#0f2240', color: r.modo === id ? '#fff' : '#93c5fd' }}>
                      {rot}
                    </button>
                  ))}
                </div>

                {/* ── Parâmetros por modo ── */}
                {r.modo === 'manual' && (
                  <p className="text-[10px]" style={{ color: '#94a3b8' }}>
                    Digite a dose de cada zona na tabela abaixo — o resumo atualiza sozinho.
                  </p>
                )}

                {r.modo === 'estoque' && r.tipo !== 'sementes' && (
                  <div className="p-2.5 rounded-lg space-y-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
                    <div className="grid grid-cols-4 gap-2">
                      <CampoTotalDisponivel rotulo="Disponível" unidadeTotal={UNIDADE_TOTAL[r.unidade]}
                        porHa={!!r.params.totalPorHa} totalAbs={r.params.totalDisponivel}
                        areaHa={resumo.areaHa} semente={ehUnidadeSemente(r.unidade)}
                        onMudou={patchParams} />
                      <Campo rotulo={`Dose mín (${r.unidade})`}>
                        <InputNum valor={r.params.doseMin} onMudou={v => patchParams({ doseMin: v })} />
                      </Campo>
                      <Campo rotulo={`Dose máx (${r.unidade})`}>
                        <InputNum valor={r.params.doseMax} onMudou={v => patchParams({ doseMax: v })} />
                      </Campo>
                      <Campo rotulo={`Incremento (${r.unidade})`}>
                        <InputNum valor={r.params.incremento} onMudou={v => patchParams({ incremento: v })} />
                      </Campo>
                    </div>
                    <SeletorRelacao relacao={r.params.relacao ?? 'direta'} onMudou={rel => patchParams({ relacao: rel })} />
                    {r.tipo === 'organico' && <AnaliseOrganicoCampos r={r} patchParams={patchParams} />}
                    <button onClick={calcular} className="px-3 py-1.5 rounded text-[10px] font-bold text-white flex items-center gap-1.5" style={{ background: 'var(--invicta-green-dark)' }}>
                      <RefreshCw size={11} /> Distribuir o estoque entre as zonas
                    </button>
                    <p className="text-[9px]" style={{ color: '#64748b' }}>
                      O sistema respeita mínimo, máximo e prioridade — e <b>nunca</b> passa da quantidade disponível.
                    </p>
                  </div>
                )}

                {r.modo === 'proporcional' && r.tipo !== 'sementes' && (
                  <div className="p-2.5 rounded-lg space-y-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
                    <div className="grid grid-cols-4 gap-2">
                      <Campo rotulo={`Dose média (${r.unidade}) *`}>
                        <InputNum valor={r.params.doseMedia} onMudou={v => patchParams({ doseMedia: v })} />
                      </Campo>
                      <Campo rotulo="Variação máx (%)">
                        <InputNum valor={r.params.variacaoPct ?? 20} onMudou={v => patchParams({ variacaoPct: v })} />
                      </Campo>
                      <Campo rotulo={`Dose mín (${r.unidade})`}>
                        <InputNum valor={r.params.doseMin} onMudou={v => patchParams({ doseMin: v })} />
                      </Campo>
                      <Campo rotulo={`Dose máx (${r.unidade})`}>
                        <InputNum valor={r.params.doseMax} onMudou={v => patchParams({ doseMax: v })} />
                      </Campo>
                    </div>
                    <SeletorRelacao relacao={r.params.relacao ?? 'direta'} onMudou={rel => patchParams({ relacao: rel })} />
                    <button onClick={calcular} className="px-3 py-1.5 rounded text-[10px] font-bold text-white flex items-center gap-1.5" style={{ background: 'var(--invicta-green-dark)' }}>
                      <RefreshCw size={11} /> Calcular doses proporcionais
                    </button>
                  </div>
                )}

                {/* ── Modo AJUSTE: dose base + % digitado por zona ──
                    O agrônomo dita o percentual de cada zona (é como a decisão
                    já vem pronta do campo). Dois cenários com a MESMA tabela:
                    "livre" diz quanto comprar; "total" crava o que existe. */}
                {r.modo === 'ajuste' && (
                  <div className="p-2.5 rounded-lg space-y-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
                    <div className="flex items-center gap-1.5">
                      {([['livre', 'Livre — total é consequência'], ['total', 'Total fixo — consome o disponível']] as const).map(([id, rot]) => (
                        <button key={id} onClick={() => patchParams({ cenarioAjuste: id })}
                          className="px-2 py-1 rounded text-[10px] font-semibold"
                          style={{ background: (r.params.cenarioAjuste ?? 'livre') === id ? 'var(--invicta-blue-mid)' : '#0f2240', color: (r.params.cenarioAjuste ?? 'livre') === id ? '#fff' : '#93c5fd' }}>
                          {rot}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {(r.params.cenarioAjuste ?? 'livre') === 'livre' ? (
                        <Campo rotulo={`Dose base (${r.unidade}) *`}>
                          <InputNum valor={r.params.doseBase} onMudou={v => patchParams({ doseBase: v })} />
                        </Campo>
                      ) : (
                        <CampoTotalDisponivel rotulo="Total disponível" unidadeTotal={UNIDADE_TOTAL[r.unidade]}
                          porHa={!!r.params.totalPorHa} totalAbs={r.params.totalDisponivel}
                          areaHa={resumo.areaHa} semente={ehUnidadeSemente(r.unidade)}
                          onMudou={patchParams} />
                      )}
                      <Campo rotulo={`Dose mín (${r.unidade})`}>
                        <InputNum valor={r.params.doseMin} onMudou={v => patchParams({ doseMin: v })} />
                      </Campo>
                      <Campo rotulo={`Dose máx (${r.unidade})`}>
                        <InputNum valor={r.params.doseMax} onMudou={v => patchParams({ doseMax: v })} />
                      </Campo>
                      <Campo rotulo={`Incremento (${r.unidade})`}>
                        <InputNum valor={r.params.incremento} onMudou={v => patchParams({ incremento: v })} />
                      </Campo>
                    </div>
                    <div>
                      <p className="text-[9px] mb-1" style={{ color: '#64748b' }}>
                        Ajuste por zona (%) — negativo aplica menos, positivo aplica mais. −100% não aplica na zona.
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {r.zonas.map(z => (
                          <div key={z.idZona} className="flex items-center gap-1 px-1.5 py-1 rounded" style={{ background: '#0f2240' }}>
                            <span className="inline-block w-2 h-2 rounded-full" style={{ background: z.cor }} />
                            <span className="text-[9px]" style={{ color: '#cbd5e1' }}>{z.nomeZona}</span>
                            <input type="number" step="1"
                              value={r.params.ajustePct?.[z.idZona] ?? 0}
                              onChange={e => patchParams({ ajustePct: { ...(r.params.ajustePct ?? {}), [z.idZona]: Number(e.target.value) } })}
                              className="w-14 rounded px-1 py-0.5 text-[10px] text-right outline-none" style={inputStyle} />
                            <span className="text-[9px]" style={{ color: '#64748b' }}>%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <button onClick={calcular} className="px-3 py-1.5 rounded text-[10px] font-bold text-white flex items-center gap-1.5" style={{ background: 'var(--invicta-green-dark)' }}>
                      <RefreshCw size={11} /> Calcular doses por ajuste
                    </button>
                  </div>
                )}

                {/* Semente sempre mostra os parâmetros: a compensação de germinação
                    vale para qualquer modo, inclusive dose manual — era ali que ela
                    mais faltava. O estoque só aparece onde existe Total disponível. */}
                {/* ── Modo COMPLEMENTAÇÃO POR NUTRIENTE (Parte XIV §9/§10) ── */}
                {r.modo === 'complemento' && (() => {
                  const c = r.params.complemento ?? { nutriente: 'n' as Nutriente };
                  const nut = c.nutriente ?? 'n';
                  const sim = SIMBOLO_NUTRIENTE[nut];
                  const res = resultadoComp;
                  const soFertilizante = r.tipo === 'fertilizante';
                  // A garantia SEMPRE vem do cadastro do insumo; digitar por cima é
                  // exceção (lote fora do padrão, análise própria). Saber de onde
                  // veio o número — e poder voltar ao cadastro — é o que separa
                  // "ajustei de propósito" de "ficou um valor velho na tela".
                  const insBase = insumos.find(i => i.id === c.baseInsumoId) ?? null;
                  const insComp = insumos.find(i => i.id === (c.compInsumoId ?? r.insumoId)) ?? null;
                  const gCadBase = insBase ? garantiaDe(insBase.conteudo, nut) : null;
                  const gCadComp = insComp ? garantiaDe(insComp.conteudo, nut) : null;
                  const difBase = gCadBase != null && Math.abs((c.baseGarantiaPct ?? 0) - gCadBase) > 1e-9;
                  const difComp = gCadComp != null && Math.abs((c.compGarantiaPct ?? 0) - gCadComp) > 1e-9;
                  const NotaGarantia = ({ cadastro, alterada, nome, onVoltar }: {
                    cadastro: number | null; alterada: boolean; nome?: string; onVoltar: () => void;
                  }) => {
                    if (cadastro == null) {
                      return <p className="text-[9px] mt-0.5" style={{ color: '#fbbf24' }}>sem cadastro vinculado — informe o %</p>;
                    }
                    if (!alterada) {
                      return <p className="text-[9px] mt-0.5" style={{ color: '#86efac' }}>do cadastro de {nome}</p>;
                    }
                    return (
                      <p className="text-[9px] mt-0.5" style={{ color: '#fbbf24' }}>
                        alterado à mão · cadastro: {fmt(cadastro, 1)}%{' '}
                        <button onClick={onVoltar} className="underline font-semibold" style={{ color: '#93c5fd' }}>usar o do cadastro</button>
                      </p>
                    );
                  };
                  // Faixas para o resumo quando a base é uma prescrição salva:
                  // cada zona tem a sua dose, então o que se mostra é o intervalo.
                  const porZona = (() => {
                    if (!c.baseDosePorZona || !r.zonas.length) return null;
                    const rz = complementarPorZona(
                      r.zonas.map(z => ({ idZona: z.idZona, baseDoseKgHa: c.baseDosePorZona![z.idZona] ?? 0 })),
                      { metaKgHa: c.metaKgHa ?? 0, baseGarantiaPct: c.baseGarantiaPct ?? 0, compGarantiaPct: c.compGarantiaPct ?? 0 },
                    );
                    const doses = r.zonas.map(z => c.baseDosePorZona![z.idZona] ?? 0);
                    return {
                      doseMin: Math.min(...doses), doseMax: Math.max(...doses),
                      fornMin: Math.min(...rz.map(x => x.fornecidoKgHa)), fornMax: Math.max(...rz.map(x => x.fornecidoKgHa)),
                      faltMin: Math.min(...rz.map(x => x.faltanteKgHa)), faltMax: Math.max(...rz.map(x => x.faltanteKgHa)),
                      compMin: Math.min(...rz.map(x => x.doseCompKgHa)), compMax: Math.max(...rz.map(x => x.doseCompKgHa)),
                      avisos: [...new Set(rz.flatMap(x => x.avisos))],
                    };
                  })();
                  return (
                    <div className="p-2.5 rounded-lg space-y-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
                      {!soFertilizante ? (
                        <p className="text-[10px] leading-relaxed" style={{ color: '#fbbf24' }}>
                          <AlertTriangle size={11} className="inline mr-1" />
                          A complementação por nutriente é <strong>só para fertilizante mineral</strong>. Troque o Tipo para “Fertilizante”.
                        </p>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 gap-2">
                            <Campo rotulo="Nutriente de referência">
                              <select value={nut} onChange={e => {
                                  const novo = e.target.value as Nutriente;
                                  // A garantia é POR nutriente: trocar de nutriente sem
                                  // reler o cadastro deixaria o % do anterior na tela.
                                  const base = insumos.find(i => i.id === c.baseInsumoId);
                                  const comp = insumos.find(i => i.id === (c.compInsumoId ?? r.insumoId));
                                  patchComp({
                                    nutriente: novo,
                                    ...(base ? { baseGarantiaPct: garantiaDe(base.conteudo, novo) } : {}),
                                    ...(comp ? { compGarantiaPct: garantiaDe(comp.conteudo, novo) } : {}),
                                  });
                                }}
                                className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
                                {NUTRIENTES.map(n => <option key={n} value={n}>{ROTULO_NUTRIENTE[n]}</option>)}
                              </select>
                            </Campo>
                            <Campo rotulo={`Meta de ${sim} (kg/ha) *`}>
                              <InputNum valor={c.metaKgHa} onMudou={v => patchComp({ metaKgHa: v })} />
                            </Campo>
                          </div>

                          <p className="text-[10px] font-semibold" style={{ color: '#93c5fd' }}>Produto base — o que já vai ser aplicado</p>
                          {/* De onde vem a dose do base: de uma prescrição JÁ SALVA
                              (que tem dose por zona, e aí o complemento também sai
                              variável) ou digitada à mão, dose única. */}
                          <Campo rotulo="Prescrição já salva como base (opcional — traz a dose de cada zona)">
                            <select value={c.basePrescricaoId ?? ''}
                              onChange={e => escolherPrescricaoBase(e.target.value, nut)}
                              className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
                              <option value="">informar a dose à mão (uma dose para todas as zonas)</option>
                              {prescricoesBase.map(p => (
                                <option key={p.id} value={p.id}>{p.nome} (v{p.versao}) · {p.produto} · {p.zonas.length} zonas</option>
                              ))}
                            </select>
                            {prescricoesBase.length === 0 && (
                              <p className="text-[9px] mt-0.5" style={{ color: '#64748b' }}>
                                Nenhuma prescrição de fertilizante salva neste talhão ainda — informe a dose do base à mão abaixo.
                              </p>
                            )}
                            {c.basePrescricaoId && c.baseDosePorZona && (
                              <p className="text-[9px] mt-0.5" style={{ color: '#86efac' }}>
                                Doses de <strong>{c.baseNome}</strong> por zona:{' '}
                                {fmt(Math.min(...Object.values(c.baseDosePorZona)), 1)}–{fmt(Math.max(...Object.values(c.baseDosePorZona)), 1)} kg/ha
                                {' '}· o complemento sai variável, zona a zona.
                              </p>
                            )}
                          </Campo>
                          <div className="grid grid-cols-3 gap-2">
                            {/* Com prescrição base escolhida, o produto é o DELA —
                                um select aqui só permitiria divergir do que foi de
                                fato aplicado no campo. */}
                            <Campo rotulo={c.basePrescricaoId ? 'Produto base (da prescrição)' : 'Produto base'}>
                              {c.basePrescricaoId ? (
                                <p className="text-[11px] px-2 py-1.5 rounded truncate" style={{ background: '#0b1f3a', color: '#e2e8f0' }}>
                                  {c.baseNome ?? '—'}
                                </p>
                              ) : (
                                <select value={c.baseInsumoId ?? ''}
                                  onChange={e => {
                                    const it = fertilizantes.find(x => x.id === e.target.value);
                                    patchComp({ baseInsumoId: it?.id, baseNome: it?.nome, baseGarantiaPct: it ? garantiaDe(it.conteudo, nut) : undefined });
                                  }}
                                  className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
                                  <option value="">nenhum (a meta é toda do complementar)</option>
                                  {fertilizantes.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
                                </select>
                              )}
                            </Campo>
                            <Campo rotulo={`Garantia de ${sim} (%)`}>
                              <InputNum valor={c.baseGarantiaPct} onMudou={v => patchComp({ baseGarantiaPct: v })} />
                              <NotaGarantia cadastro={gCadBase} alterada={difBase} nome={insBase?.nome}
                                onVoltar={() => patchComp({ baseGarantiaPct: gCadBase ?? undefined })} />
                            </Campo>
                            <Campo rotulo={c.baseDosePorZona ? 'Dose aplicada (vem da prescrição)' : 'Dose aplicada (kg/ha)'}>
                              {c.baseDosePorZona
                                ? <p className="text-[11px] px-2 py-1.5 rounded" style={{ background: '#0b1f3a', color: '#86efac' }}>por zona</p>
                                : <InputNum valor={c.baseDoseKgHa} onMudou={v => patchComp({ baseDoseKgHa: v })} />}
                            </Campo>
                          </div>

                          <p className="text-[10px] font-semibold" style={{ color: '#93c5fd' }}>Produto complementar — o que esta prescrição vai aplicar</p>
                          <div className="grid grid-cols-2 gap-2">
                            {/* A FÓRMULA DA COMPLEMENTAÇÃO é a decisão do usuário — o
                                base é consequência da prescrição escolhida. Escolher
                                aqui também troca o "Produto" da prescrição no topo:
                                é este produto que ela vai aplicar. */}
                            <Campo rotulo="Fórmula do complemento *">
                              <select value={c.compInsumoId ?? r.insumoId ?? ''}
                                onChange={e => {
                                  const it = fertilizantes.find(x => x.id === e.target.value);
                                  if (!it) return;
                                  escolherInsumo(it.id);
                                  patchComp({ compInsumoId: it.id, compNome: it.nome, compGarantiaPct: garantiaDe(it.conteudo, nut) });
                                }}
                                className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
                                <option value="">Selecione o adubo que vai complementar…</option>
                                {fertilizantes.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
                              </select>
                            </Campo>
                            <Campo rotulo={`Garantia de ${sim} (%)`}>
                              <InputNum valor={c.compGarantiaPct} onMudou={v => patchComp({ compGarantiaPct: v })} />
                              <NotaGarantia cadastro={gCadComp} alterada={difComp} nome={insComp?.nome}
                                onVoltar={() => patchComp({ compGarantiaPct: gCadComp ?? undefined })} />
                            </Campo>
                          </div>
                          {c.baseInsumoId && (c.compInsumoId ?? r.insumoId) === c.baseInsumoId && (
                            <p className="text-[9px] leading-relaxed" style={{ color: '#fbbf24' }}>
                              <AlertTriangle size={10} className="inline mr-1" />
                              O complemento está com o MESMO produto do base (<strong>{c.baseNome}</strong>). Escolha em “Fórmula do complemento” o adubo que vai fechar a meta.
                            </p>
                          )}
                          {insComp && (gCadComp ?? 0) <= 0 && (
                            <p className="text-[9px] leading-relaxed" style={{ color: '#fbbf24' }}>
                              <AlertTriangle size={10} className="inline mr-1" />
                              <strong>{insComp.nome}</strong> não tem {sim} declarado em Biblioteca → Insumos. Cadastre a garantia lá, ou digite o % aqui só para este cálculo.
                            </p>
                          )}

                          {/* Resumo do cálculo (§10) — a conta inteira, à vista */}
                          {res && (
                            <div className="p-2 rounded space-y-0.5" style={{ background: '#0b1f3a', border: '1px solid #1e3a8a' }}>
                              <p className="text-[10px] font-bold" style={{ color: '#93c5fd' }}>Resumo do cálculo</p>
                              {porZona ? (
                                <>
                                  <p className="text-[10px]" style={{ color: '#cbd5e1' }}>
                                    Base <strong>{c.baseNome ?? '—'}</strong> ({c.basePrescricaoNome}): {fmt(porZona.doseMin, 1)}–{fmt(porZona.doseMax, 1)} kg/ha × {fmt(c.baseGarantiaPct ?? 0, 1)}% ={' '}
                                    <strong>{fmt(porZona.fornMin, 1)}–{fmt(porZona.fornMax, 1)} kg/ha de {sim}</strong>
                                  </p>
                                  <p className="text-[10px]" style={{ color: '#cbd5e1' }}>
                                    Meta {fmt(c.metaKgHa ?? 0, 1)} − fornecido = <strong>{fmt(porZona.faltMin, 1)}–{fmt(porZona.faltMax, 1)} kg/ha de {sim} faltando</strong>
                                  </p>
                                  <p className="text-[11px]" style={{ color: '#86efac' }}>
                                    {c.compNome ?? 'Complementar'} a {fmt(c.compGarantiaPct ?? 0, 1)}%:{' '}
                                    <strong>{fmt(porZona.compMin, 1)}–{fmt(porZona.compMax, 1)} kg/ha</strong> (varia por zona)
                                  </p>
                                </>
                              ) : (
                                <>
                                  <p className="text-[10px]" style={{ color: '#cbd5e1' }}>
                                    Base <strong>{c.baseNome ?? '—'}</strong>: {fmt(c.baseDoseKgHa ?? 0, 1)} kg/ha × {fmt(c.baseGarantiaPct ?? 0, 1)}% ={' '}
                                    <strong>{fmt(res.fornecidoKgHa, 1)} kg/ha de {sim}</strong>
                                  </p>
                                  <p className="text-[10px]" style={{ color: '#cbd5e1' }}>
                                    Meta {fmt(c.metaKgHa ?? 0, 1)} − fornecido {fmt(res.fornecidoKgHa, 1)} ={' '}
                                    <strong>{fmt(res.faltanteKgHa, 1)} kg/ha de {sim} faltando</strong>
                                  </p>
                                  <p className="text-[11px]" style={{ color: '#86efac' }}>
                                    {c.compNome ?? 'Complementar'}: {fmt(res.faltanteKgHa, 1)} ÷ {fmt(c.compGarantiaPct ?? 0, 1)}% ={' '}
                                    <strong>{fmt(res.doseCompKgHa, 1)} kg/ha</strong>
                                  </p>
                                </>
                              )}
                              {(porZona?.avisos ?? res.avisos).map((a, i) => (
                                <p key={i} className="text-[9px] leading-relaxed" style={{ color: '#fbbf24' }}>{a}</p>
                              ))}
                            </div>
                          )}

                          <button onClick={aplicarComplemento}
                            className="px-3 py-1.5 rounded text-[10px] font-bold text-white flex items-center gap-1.5" style={{ background: 'var(--invicta-green-dark)' }}>
                            <RefreshCw size={11} /> Aplicar a dose calculada nas zonas
                          </button>
                          <p className="text-[9px]" style={{ color: '#64748b' }}>
                            {porZona
                              ? 'Cada zona recebe a sua dose, descontando o que o produto base já entregou ali — a taxa variável do base se propaga para o complemento.'
                              : 'A dose entra igual em todas as zonas; para taxa variável, escolha uma prescrição base acima ou ajuste zona a zona na tabela.'}
                          </p>
                        </>
                      )}
                    </div>
                  );
                })()}

                {r.tipo === 'sementes' && (
                  <SementesCampos r={r} patchParams={patchParams} estSem={estSem} setEstSem={setEstSem}
                    usarComoTotal={usarEstoqueComoTotal}
                    mostrarEstoque={r.modo === 'ajuste' && (r.params.cenarioAjuste ?? 'livre') === 'total'} />
                )}

                {/* ── Modo EQUAÇÃO: usa uma equação salva, calcula por zona ── */}
                {r.modo === 'equacao' && (
                  <div className="p-2.5 rounded-lg space-y-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
                    <Campo rotulo="Equação salva (Biblioteca → Equações)">
                      <select value={r.equacaoId} onChange={e => patch({ equacaoId: e.target.value })}
                        className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
                        <option value="">Selecione a equação…</option>
                        {equacoes.map(e => <option key={e.id} value={e.id}>{e.nome}{e.conteudo.grupo ? ` · ${e.conteudo.grupo}` : ''}</option>)}
                      </select>
                      {equacoes.length === 0 && (
                        <p className="text-[10px] mt-1" style={{ color: '#fbbf24' }}>
                          Nenhuma equação salva. Crie em <b>Biblioteca → Equações</b> — a mesma usada na Recomendação.
                        </p>
                      )}
                    </Campo>

                    {eqSel && (
                      <>
                        <p className="text-[10px] px-2 py-1.5 rounded font-mono" style={{ background: '#0b1e38', color: '#cbd5e1' }}>
                          {eqSel.conteudo.script.split('\n').filter(Boolean).join(' · ')}
                        </p>
                        {varsEq.length === 0 ? (
                          <p className="text-[10px]" style={{ color: '#94a3b8' }}>Esta equação não pede variável externa — o resultado é fixo.</p>
                        ) : (
                          <div className="space-y-1.5">
                            <p className="text-[10px]" style={{ color: '#94a3b8' }}>
                              Informe o valor de cada variável por zona (o &quot;número da zona&quot;). Preencher rápido a partir de:
                            </p>
                            {varsEq.map(v => (
                              <div key={v} className="flex items-center gap-1.5 text-[9px]" style={{ color: '#93c5fd' }}>
                                <span className="font-bold uppercase w-12">{v}</span>
                                <span style={{ color: '#64748b' }}>preencher com:</span>
                                <button onClick={() => preencherVarComFonte(v, 'rank')} className="px-1.5 py-0.5 rounded" style={{ background: '#1a3a6b' }}>ranking</button>
                                <button onClick={() => preencherVarComFonte(v, 'nome')} className="px-1.5 py-0.5 rounded" style={{ background: '#1a3a6b' }}>nº da zona</button>
                                <button onClick={() => preencherVarComFonte(v, 'area')} className="px-1.5 py-0.5 rounded" style={{ background: '#1a3a6b' }}>área</button>
                              </div>
                            ))}
                          </div>
                        )}
                        <button onClick={calcularEquacao} className="px-3 py-1.5 rounded text-[10px] font-bold text-white flex items-center gap-1.5" style={{ background: 'var(--invicta-green-dark)' }}>
                          <RefreshCw size={11} /> Calcular doses pela equação
                        </button>
                        <p className="text-[9px]" style={{ color: '#64748b' }}>
                          A equação roda por zona com os valores da tabela abaixo (colunas por variável). Mínimo, máximo e
                          &quot;não-negativo&quot; da própria equação são respeitados.
                        </p>
                      </>
                    )}
                  </div>
                )}

                {avisosCalc.length > 0 && (
                  <div className="space-y-1">{avisosCalc.map((a, i) => <Aviso key={i} tom="atencao" texto={a} />)}</div>
                )}

                {/* ── Editor: tabela de doses ── */}
                <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #1a3a6b' }}>
                  <table className="w-full text-[10px]" style={{ color: '#cbd5e1' }}>
                    <thead>
                      <tr style={{ background: '#0f2240', color: '#93c5fd' }}>
                        <th className="text-left px-2 py-1.5">Zona</th>
                        <th className="text-left px-2 py-1.5">Classe</th>
                        <th className="text-right px-2 py-1.5">Área (ha)</th>
                        {r.modo === 'equacao' && varsEq.map(v => <th key={v} className="text-right px-2 py-1.5 uppercase">{v}</th>)}
                        <th className="text-right px-2 py-1.5">{compensa ? `População (${r.unidade})` : `Dose (${r.unidade})`}</th>
                        {saida !== r.unidade && (
                          <th className="text-right px-2 py-1.5" style={{ color: '#c4b5fd' }}
                            title={`Mesma dose na régua escolhida para exportar${reguas?.espacamentoM ? ` — espaçamento ${fmt(reguas.espacamentoM, 2)} m` : ''}`}>
                            ≈ {ROTULO_CURTO(saida)}
                          </th>
                        )}
                        {compensa && <th className="text-right px-2 py-1.5" style={{ color: '#86efac' }}>No arquivo ({r.unidade})</th>}
                        <th className="text-right px-2 py-1.5">Total ({UNIDADE_TOTAL[r.unidade]})</th>
                        {nutri && <th className="text-right px-2 py-1.5">N·P·K (kg/ha)</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {r.zonas.map(z => {
                        const totalZona = z.dose * z.areaHa * (fatorBase ?? 1);
                        return (
                        <tr key={z.idZona} style={{ borderTop: '1px solid #0f2240', background: '#061525' }}>
                          <td className="px-2 py-1">
                            <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: resumo.doseMax > resumo.doseMin && Number.isFinite(z.dose) ? corDaDose(z.dose, resumo.doseMin, resumo.doseMax) : z.cor }} />
                            {z.nomeZona}
                          </td>
                          <td className="px-2 py-1">{z.classe}</td>
                          <td className="px-2 py-1 text-right">{fmtHa(z.areaHa)}</td>
                          {r.modo === 'equacao' && varsEq.map(v => (
                            <td key={v} className="px-2 py-1 text-right">
                              <input
                                value={r.valoresEquacao[z.idZona]?.[v] != null ? String(r.valoresEquacao[z.idZona][v]) : ''}
                                onChange={e => {
                                  const txt = e.target.value.trim();
                                  const n = Number(txt.replace(',', '.'));
                                  setValorEq(z.idZona, v, txt === '' || !Number.isFinite(n) ? undefined : n);
                                }}
                                placeholder="—"
                                className="w-16 rounded px-1.5 py-0.5 text-right text-[10px] outline-none" style={inputStyle} />
                            </td>
                          ))}
                          <td className="px-2 py-1 text-right">
                            <input
                              value={Number.isFinite(z.dose) ? String(z.dose) : ''}
                              onChange={e => {
                                const v = Number(e.target.value.replace(',', '.'));
                                patch({ zonas: r.zonas.map(x => x.idZona === z.idZona ? { ...x, dose: Number.isFinite(v) ? v : 0 } : x) });
                              }}
                              placeholder={Number.isFinite(z.dose) ? undefined : 'erro'}
                              className="w-20 rounded px-1.5 py-0.5 text-right text-[10px] outline-none" style={inputStyle} />
                          </td>
                          {saida !== r.unidade && (
                            <td className="px-2 py-1 text-right" style={{ color: '#c4b5fd' }}>
                              {Number.isFinite(z.dose)
                                ? fmt(converterDose(z.dose, r.unidade, saida, reguas?.espacamentoM), CASAS_DA_UNIDADE(saida))
                                : '—'}
                            </td>
                          )}
                          {compensa && (
                            <td className="px-2 py-1 text-right font-semibold" style={{ color: '#86efac' }}>
                              {Number.isFinite(z.dose) ? fmt0(doseCompensada(z.dose, r.params.sementes, true)) : '—'}
                            </td>
                          )}
                          <td className="px-2 py-1 text-right">{!Number.isFinite(totalZona) ? '—' : ehUnidadeSemente(r.unidade) ? fmt0(totalZona) : fmt(totalZona, 1)}</td>
                          {nutri && (
                            <td className="px-2 py-1 text-right" style={{ color: '#94a3b8' }}>
                              {fmt(nutri[z.idZona].n, 0)}·{fmt(nutri[z.idZona].p2o5, 0)}·{fmt(nutri[z.idZona].k2o, 0)}
                            </td>
                          )}
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* ── Resumo ao vivo ── */}
                <div className="grid grid-cols-4 gap-1.5">
                  <Kpi rot="Área" val={`${fmtHa(resumo.areaHa)} ha`} />
                  {/* O total absoluto não é o número que se confere no campo: a
                      dose média por hectare é. Fica ao lado do usado sempre que
                      há área, para "fechar em 80.000/ha" ser verificável. */}
                  <Kpi rot={`Usado (${UNIDADE_TOTAL[r.unidade]})`} val={ehUnidadeSemente(r.unidade) ? fmt0(resumo.usado) : fmt(resumo.usado, 1)}
                    sub={resumo.areaHa > 0 && resumo.usado > 0
                      ? `${ehUnidadeSemente(r.unidade) ? fmt0(resumo.usado / resumo.areaHa) : fmt(resumo.usado / resumo.areaHa, 1)} ${UNIDADE_TOTAL[r.unidade]}/ha`
                      : undefined} />
                  {r.params.totalDisponivel != null
                    ? <Kpi rot="Restante" val={ehUnidadeSemente(r.unidade) ? fmt0(r.params.totalDisponivel - resumo.usado) : fmt(r.params.totalDisponivel - resumo.usado, 1)}
                        cor={r.params.totalDisponivel - resumo.usado < -1e-6 ? '#f87171' : '#4ade80'} />
                    : <Kpi rot="Dose média" val={fmt(resumo.doseMedia, 1)} />}
                  <Kpi rot="Custo" val={resumo.custo != null ? `R$ ${fmt(resumo.custo, 0)}` : '—'} />
                </div>
                {totalArquivo != null && (
                  <p className="text-[10px] flex items-center gap-1" style={{ color: '#86efac' }}>
                    <Sprout size={10} />
                    No arquivo de aplicação: <strong>{fmt0(totalArquivo)} {UNIDADE_TOTAL[r.unidade]}</strong>
                    {resumo.areaHa > 0 && <> · {fmt0(totalArquivo / resumo.areaHa)} {UNIDADE_TOTAL[r.unidade]}/ha</>}
                    <span style={{ color: '#64748b' }}> — é o que sai do depósito depois de compensar a germinação.</span>
                  </p>
                )}
                {metricasSem && (
                  <p className="text-[10px]" style={{ color: '#94a3b8' }}>
                    <Sprout size={10} className="inline mr-1" />
                    Média: {metricasSem.sementesPorMetro != null ? `${fmt(metricasSem.sementesPorMetro, 1)} sem/m · ` : ''}
                    {metricasSem.kgHa != null ? `${fmt(metricasSem.kgHa, 1)} kg/ha · ` : ''}
                    população final ~{fmt0(metricasSem.populacaoFinal)} plantas/ha
                    {metricasSem.sacos != null ? ` · ${fmt(metricasSem.sacos, 1)} sacos no total` : ''}
                  </p>
                )}

                {/* ── Unidade do ARQUIVO ──
                    A prescrição é decidida em população (pl/ha) e a plantadeira
                    é regulada em sementes por metro linear. São a mesma dose em
                    réguas diferentes: aqui se escolhe em qual o SHP/Excel/PDF
                    sai, sem refazer nada — o que está salvo não muda. */}
                {reguas && (
                  <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded" style={{ background: '#0f2240', border: '1px solid #1a3a6b' }}>
                    <Sprout size={11} style={{ color: '#c4b5fd' }} />
                    <span className="text-[10px]" style={{ color: '#93c5fd' }}>Exportar em:</span>
                    {reguas.opcoes.map(({ u, ok }) => {
                      const ativo = saida === u;
                      return (
                        <button key={u} onClick={() => setUnidadeSaida(u)} disabled={!ok}
                          title={ok ? `Arquivo e tabela em ${u}` : 'Informe o espaçamento entre linhas em Parâmetros da semente'}
                          className="text-[10px] px-2 py-1 rounded font-semibold disabled:opacity-40"
                          style={{ background: ativo ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: ativo ? '#fff' : '#93c5fd', border: `1px solid ${ativo ? '#60a5fa' : '#1a3a6b'}` }}>
                          {ROTULO_SAIDA[u] ?? u}
                        </button>
                      );
                    })}
                    <span className="text-[9px]" style={{ color: '#64748b' }}>
                      {reguas.opcoes.every(o => o.ok)
                        ? `mesma dose em réguas diferentes (espaçamento ${fmt(reguas.espacamentoM!, 2)} m) — a prescrição salva continua em ${r.unidade}`
                        : 'metro quadrado não precisa de espaçamento; metro LINEAR precisa — informe em Parâmetros da semente'}
                    </span>
                  </div>
                )}

                {/* ── Ações ── */}
                <div className="flex gap-1.5 flex-wrap">
                  <button onClick={salvar} className="px-3 py-2 rounded text-[11px] font-bold text-white flex items-center gap-1.5" style={{ background: 'var(--invicta-green-dark)' }}>
                    <Save size={12} /> {r.editandoId ? 'Salvar alterações (nova versão)' : 'Salvar prescrição'}
                  </button>
                  <BotaoExport rot="SHP" icone={FileDown} ocupado={exportando.endsWith(':shp')} onClick={() => exportar('shp')} />
                  <BotaoExport rot="Excel" icone={FileSpreadsheet} ocupado={exportando.endsWith(':xlsx')} onClick={() => exportar('xlsx')} />
                  <BotaoExport rot="PDF" icone={FileText} ocupado={exportando.endsWith(':pdf')} onClick={() => exportar('pdf')} />
                  {r.editandoId && (
                    <button onClick={() => { setR(RASCUNHO_VAZIO); setAvisosCalc([]); setErro(''); setOkMsg(''); }}
                      className="px-2.5 py-2 rounded text-[10px] font-semibold" style={{ background: '#0f2240', color: '#93c5fd' }}>
                      Nova em branco
                    </button>
                  )}
                </div>

                {/* O retorno do clique aparece AQUI, ao lado do botão. Ele
                    também sai no topo da aba, que fica fora da vista quando se
                    salva no fim de uma tela longa — era isso que fazia o
                    "Salvar prescrição" parecer morto. */}
                {erro && <Aviso tom="erro" texto={erro} />}
                {okMsg && <Aviso tom="ok" texto={okMsg} />}
              </>
            )}

            {/* ── Salvas neste talhão — logo abaixo, como nas Zonas de Manejo ── */}
            {prescricoes.length > 0 && (
              <div className="pt-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <FolderOpen size={12} style={{ color: '#93c5fd' }} />
                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#cbd5e1' }}>
                    Prescrições salvas ({linhagens.length})
                  </span>
                </div>
                {linhagens.map(vs => (
                  <ListaVersoes key={vs[0].origemId ?? vs[0].id} versoes={vs} exportando={exportando}
                    onAbrir={abrirSalva} onExportar={exportar}
                    onExcluir={id => { deletePrescricao(id); setTick(t => t + 1); }} />
                ))}
              </div>
            )}
          </>
        )}

        {aba === 'salvas' && (
          prescricoes.length === 0
            ? <Vazia texto="Nenhuma prescrição salva neste talhão ainda." />
            : linhagens.map(vs => (
              <ListaVersoes key={vs[0].origemId ?? vs[0].id} versoes={vs} exportando={exportando}
                onAbrir={abrirSalva} onExportar={exportar}
                onExcluir={id => { deletePrescricao(id); setTick(t => t + 1); }} />
            ))
        )}

        {aba === 'arquivos' && (() => {
          const exps = prescricoes.flatMap(p => p.exportes.map(e => ({ ...e, presc: p })));
          exps.sort((a, b) => b.em.localeCompare(a.em));
          return exps.length === 0
            ? <Vazia texto="Nenhum arquivo de aplicação gerado ainda. Exporte uma prescrição (SHP/Excel/PDF) e ele aparece aqui." />
            : exps.map((e, i) => (
              <div key={i} className="p-2 rounded-lg flex items-center gap-2 text-[10px]" style={{ background: '#061525', border: '1px solid #1a3a6b', color: '#cbd5e1' }}>
                <FileDown size={12} style={{ color: '#93c5fd' }} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate" style={{ color: '#e2e8f0' }}>{e.arquivo}</p>
                  <p style={{ color: '#64748b' }}>{e.presc.nome} · v{e.presc.versao} · {dataBR(e.em)} · {e.por}</p>
                </div>
                <span className="px-1.5 py-0.5 rounded font-bold uppercase" style={{ background: '#0f2240', color: '#93c5fd' }}>{e.formato}</span>
                <button onClick={() => exportar(e.formato as 'shp' | 'xlsx' | 'pdf', e.presc)}
                  className="px-2 py-1 rounded font-semibold" style={{ background: '#1a3a6b', color: '#93c5fd' }}>Gerar de novo</button>
              </div>
            ));
        })()}

        {aba === 'historico' && (() => {
          const hist = prescricoes.flatMap(p => p.historico.map(h => ({ ...h, presc: p })));
          hist.sort((a, b) => b.em.localeCompare(a.em));
          return hist.length === 0
            ? <Vazia texto="Sem histórico ainda." />
            : hist.map((h, i) => (
              <div key={i} className="p-2 rounded-lg text-[10px] flex items-center gap-2" style={{ background: '#061525', border: '1px solid #1a3a6b', color: '#cbd5e1' }}>
                <History size={11} style={{ color: '#64748b' }} />
                <span className="flex-1"><b style={{ color: '#e2e8f0' }}>{h.presc.nome}</b> — {h.resumo}</span>
                <span style={{ color: '#64748b' }}>{dataBR(h.em)} · {h.por}</span>
              </div>
            ));
        })()}

        {aba === 'comparacao' && (
          <div className="py-8 text-center space-y-2">
            <Scale size={28} className="mx-auto" style={{ color: '#334155' }} />
            <p className="text-xs font-bold" style={{ color: '#64748b' }}>Planejado × Realizado</p>
            <p className="text-[10px] max-w-sm mx-auto leading-relaxed" style={{ color: '#475569' }}>
              Em breve: importe o mapa de aplicação REAL da máquina e compare com a prescrição —
              dose aplicada × prescrita por zona, desvios e área fora do alvo. A estrutura das
              prescrições já guarda tudo o que essa comparação vai precisar.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Blocos auxiliares ────────────────────────────────────────────────────────

/**
 * "Total disponível" — com a escolha de informar o número POR HECTARE.
 *
 * O campo pedia um estoque fechado ("80.000 sementes") e é comum o número que
 * o agrônomo tem na mão ser POR HECTARE ("80.000 sementes/ha"): digitado como
 * total, 80.000 viravam ~1.500/ha num talhão de 52 ha — a prescrição saía
 * cinquenta vezes menor sem nada avisar. Aqui o número digitado continua o
 * mesmo ao trocar a unidade; o que muda é o significado, e o absoluto usado no
 * cálculo aparece escrito embaixo.
 */
function CampoTotalDisponivel({ rotulo, unidadeTotal, porHa, totalAbs, areaHa, semente, onMudou }: {
  rotulo: string; unidadeTotal: string; porHa: boolean;
  totalAbs?: number; areaHa: number; semente: boolean;
  onMudou: (p: { totalDisponivel?: number; totalPorHa: boolean }) => void;
}) {
  const area = areaHa > 0 ? areaHa : 1;
  const exibido = porHa ? (totalAbs != null ? Math.round((totalAbs / area) * 100) / 100 : undefined) : totalAbs;
  const trocarModo = (novoPorHa: boolean) => {
    if (novoPorHa === porHa) return;
    // Preserva o NÚMERO na tela e reinterpreta: 80.000 "total" vira 80.000/ha.
    const n = exibido;
    onMudou({ totalDisponivel: n == null ? undefined : (novoPorHa ? n * area : n), totalPorHa: novoPorHa });
  };
  return (
    <div>
      <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>
        {rotulo} ({porHa ? `${unidadeTotal}/ha` : unidadeTotal}) *
      </label>
      <InputNum valor={exibido} onMudou={v => onMudou({ totalDisponivel: v == null ? undefined : (porHa ? v * area : v), totalPorHa: porHa })} />
      <div className="flex items-center gap-1 mt-1">
        {([[false, `total (${unidadeTotal})`], [true, `por hectare (${unidadeTotal}/ha)`]] as const).map(([v, rot]) => (
          <button key={String(v)} onClick={() => trocarModo(v)}
            className="px-1.5 py-0.5 rounded text-[9px] font-semibold"
            style={{ background: porHa === v ? 'var(--invicta-blue-mid)' : '#0f2240', color: porHa === v ? '#fff' : '#93c5fd' }}>
            {rot}
          </button>
        ))}
      </div>
      {porHa && totalAbs != null && totalAbs > 0 && (
        <p className="text-[9px] mt-0.5" style={{ color: '#4ade80' }}>
          = {semente ? fmt0(totalAbs) : fmt(totalAbs, 1)} {unidadeTotal} em {fmtHa(areaHa)} ha
        </p>
      )}
    </div>
  );
}

// Cartão de uma prescrição salva — o MESMO na aba "Salvas" e no rodapé da aba
// "Nova". Salvar e não ver nada acontecer é o que fazia parecer que o botão não
// funcionava: a confirmação aparecia no topo do formulário, longe do botão, que
// fica no fim de uma tela longa. Agora o resultado do trabalho aparece embaixo,
// como nas Zonas de Manejo e no NDVI.
// Uma prescrição e TODAS as suas versões: a mais nova em destaque e as
// anteriores logo abaixo, discretas — sempre à vista, sem botão para recolher.
function ListaVersoes({ versoes, exportando, onAbrir, onExportar, onExcluir }: {
  versoes: Prescricao[];
  exportando: string;
  onAbrir: (p: Prescricao) => void;
  onExportar: (formato: 'shp' | 'xlsx' | 'pdf', p: Prescricao) => void;
  onExcluir: (id: string) => void;
}) {
  const [atual, ...antigas] = versoes;
  return (
    <div className="space-y-1">
      <CartaoSalva p={atual} exportando={exportando} onAbrir={onAbrir} onExportar={onExportar} onExcluir={onExcluir} />
      {antigas.length > 0 && (
        <div className="pl-3 space-y-1" style={{ borderLeft: '2px solid #1a3a6b' }}>
          {antigas.map(v => (
            <CartaoSalva key={v.id} p={v} anterior exportando={exportando}
              onAbrir={onAbrir} onExportar={onExportar} onExcluir={onExcluir} />
          ))}
        </div>
      )}
    </div>
  );
}

function CartaoSalva({ p, anterior, exportando, onAbrir, onExportar, onExcluir }: {
  p: Prescricao;
  anterior?: boolean;          // versão antiga (fica discreta na lista)
  exportando: string;
  onAbrir: (p: Prescricao) => void;
  onExportar: (formato: 'shp' | 'xlsx' | 'pdf', p: Prescricao) => void;
  onExcluir: (id: string) => void;
}) {
  const rs = resumoDoses(p.zonas, p.custoUnit);
  return (
    <div className="p-2.5 rounded-lg space-y-1.5" style={{ background: anterior ? '#050f1c' : '#061525', border: `1px solid ${anterior ? '#132f52' : '#1a3a6b'}`, opacity: anterior ? 0.85 : 1 }}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold truncate" style={{ color: anterior ? '#94a3b8' : '#e2e8f0' }}>
            <span className="text-[9px] px-1 py-0.5 rounded mr-1.5" style={{ background: anterior ? '#0f2240' : '#1e3a5f', color: '#93c5fd' }}>v{p.versao}</span>
            {p.nome}
          </p>
          <p className="text-[10px]" style={{ color: '#94a3b8' }}>
            {p.produto} · {ROTULO_TIPO[p.tipo]} · v{p.versao} · {dataBR(p.atualizadoEm)} · {p.criadoPor}
          </p>
        </div>
      </div>
      <p className="text-[10px]" style={{ color: '#cbd5e1' }}>
        {rs.nZonas} zonas · {fmtHa(rs.areaHa)} ha · dose {fmt(rs.doseMin, 1)}–{fmt(rs.doseMax, 1)} (média {fmt(rs.doseMedia, 1)}) {p.unidade}
        {' '}· usa {p.unidade === 'sementes/ha' ? fmt0(rs.usado) : fmt(rs.usado, 1)} {UNIDADE_TOTAL[p.unidade]}
        {rs.custo != null ? ` · R$ ${fmt(rs.custo, 0)}` : ''}
      </p>
      <div className="flex gap-1.5 flex-wrap">
        <button onClick={() => onAbrir(p)} className="px-2 py-1 rounded text-[10px] font-semibold flex items-center gap-1" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
          <Pencil size={10} /> Abrir no editor
        </button>
        <BotaoExport rot="SHP" icone={FileDown} pequeno ocupado={exportando === `${p.id}:shp`} onClick={() => onExportar('shp', p)} />
        <BotaoExport rot="Excel" icone={FileSpreadsheet} pequeno ocupado={exportando === `${p.id}:xlsx`} onClick={() => onExportar('xlsx', p)} />
        <BotaoExport rot="PDF" icone={FileText} pequeno ocupado={exportando === `${p.id}:pdf`} onClick={() => onExportar('pdf', p)} />
        <button onClick={() => { if (confirm(`Excluir a prescrição "${p.nome}"?`)) onExcluir(p.id); }}
          className="px-2 py-1 rounded text-[10px] font-semibold flex items-center gap-1" style={{ background: '#3a1a1a', color: '#fca5a5' }}>
          <Trash2 size={10} /> Excluir
        </button>
      </div>
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>{rotulo}</label>
      {children}
    </div>
  );
}

/**
 * Campo numérico que aceita vírgula e preserva o que está sendo digitado.
 *
 * O texto vive em estado local para não atrapalhar a digitação ("2," não é
 * número ainda), mas ele PRECISA acompanhar quando o valor muda por fora —
 * restaurar a garantia do cadastro, trocar o nutriente de referência, "Usar
 * como Total disponível", o PMS que vem junto com o insumo. Antes o estado do
 * rascunho mudava e o campo continuava mostrando o número velho: a tela mentia
 * sobre o que seria calculado.
 *
 * `visto` guarda o último valor que ESTE campo produziu; quando o pai manda
 * algo diferente disso, a mudança veio de fora e o texto é sincronizado. É o
 * padrão de ajustar estado durante o render, sem effect.
 */
function InputNum({ valor, onMudou }: { valor: number | undefined; onMudou: (v: number | undefined) => void }) {
  const [txt, setTxt] = useState(valor != null ? String(valor) : '');
  const [visto, setVisto] = useState(valor);
  if (valor !== visto) {
    setVisto(valor);
    setTxt(valor != null ? String(valor) : '');
  }
  return (
    <input value={txt}
      onChange={e => {
        setTxt(e.target.value);
        const n = Number(e.target.value.replace(',', '.'));
        const v = e.target.value.trim() === '' ? undefined : Number.isFinite(n) ? n : undefined;
        setVisto(v);          // veio da digitação: o eco do pai não reescreve o texto
        onMudou(v);
      }}
      className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
  );
}

function SeletorRelacao({ relacao, onMudou }: { relacao: 'direta' | 'inversa'; onMudou: (r: 'direta' | 'inversa') => void }) {
  return (
    <div className="flex items-center gap-2 text-[10px]" style={{ color: '#94a3b8' }}>
      <span>Prioridade:</span>
      {([['direta', 'maior potencial → maior dose'], ['inversa', 'menor potencial → maior dose']] as const).map(([id, rot]) => (
        <button key={id} onClick={() => onMudou(id)}
          className="px-2 py-1 rounded font-semibold"
          style={{ background: relacao === id ? 'var(--invicta-blue-mid)' : '#0f2240', color: relacao === id ? '#fff' : '#93c5fd' }}>
          {rot}
        </button>
      ))}
    </div>
  );
}

function AnaliseOrganicoCampos({ r, patchParams }: {
  r: { params: ParamsCalculo }; patchParams: (p: Partial<ParamsCalculo>) => void;
}) {
  const o = r.params.organico ?? {};
  const set = (k: string, v: number | undefined) => patchParams({ organico: { ...o, [k]: v } });
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold" style={{ color: '#64748b' }}>Análise química do esterco (kg por tonelada)</p>
      <div className="grid grid-cols-6 gap-1.5">
        {([['n', 'N'], ['p2o5', 'P₂O₅'], ['k2o', 'K₂O'], ['ca', 'Ca'], ['mg', 'Mg'], ['densidade', 'Dens. (t/m³)']] as const).map(([k, rot]) => (
          <Campo key={k} rotulo={rot}>
            <InputNum valor={(o as Record<string, number | undefined>)[k]} onMudou={v => set(k, v)} />
          </Campo>
        ))}
      </div>
    </div>
  );
}

function SementesCampos({ r, patchParams, estSem, setEstSem, usarComoTotal, mostrarEstoque }: {
  r: { params: ParamsCalculo; unidade: UnidadeDose };
  patchParams: (p: Partial<ParamsCalculo>) => void;
  estSem: { modo: keyof EstoqueSementes; valor: string };
  setEstSem: (v: { modo: keyof EstoqueSementes; valor: string }) => void;
  usarComoTotal: () => void;
  mostrarEstoque: boolean;
}) {
  const s = r.params.sementes ?? SEMENTE_PADRAO;
  const set = (k: string, v: number | string | undefined) => patchParams({ sementes: { ...s, [k]: v } });
  const pop = !!r.params.doseEhPopulacao;
  const fator = fatorCampo(s);            // fração da semente que vira planta
  const exemplo = pop && fator > 0 ? doseCompensada(80_000, s, true) : null;
  return (
    <div className="p-2.5 rounded-lg space-y-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
      <p className="text-[10px] font-semibold flex items-center gap-1" style={{ color: '#93c5fd' }}><Sprout size={11} /> Parâmetros da semente</p>
      <div className="grid grid-cols-4 gap-1.5">
        <Campo rotulo="PMS (g)"><InputNum valor={s.pmsG} onMudou={v => set('pmsG', v)} /></Campo>
        <Campo rotulo="Germinação (%)"><InputNum valor={s.germinacaoPct} onMudou={v => set('germinacaoPct', v ?? 98)} /></Campo>
        <Campo rotulo="Espaçamento (m)"><InputNum valor={s.espacamentoM} onMudou={v => set('espacamentoM', v)} /></Campo>
        <Campo rotulo="Sementes/saco"><InputNum valor={s.sementesPorSaco} onMudou={v => set('sementesPorSaco', v)} /></Campo>
        <Campo rotulo="Pop. mínima (/ha)"><InputNum valor={s.populacaoMin} onMudou={v => set('populacaoMin', v)} /></Campo>
        <Campo rotulo="Pop. máxima (/ha)"><InputNum valor={s.populacaoMax} onMudou={v => set('populacaoMax', v)} /></Campo>
      </div>

      {/* ── Compensação: a dose digitada é POPULAÇÃO, o arquivo leva a TAXA ──
          Sem isso, 80.000 no arquivo com 90% de germinação viram ~72.000
          plantas no campo — a lavoura nasce abaixo do alvo e o erro só aparece
          depois de emergida. */}
      <div className="p-2 rounded" style={{ background: pop ? '#0f2a1a' : '#0f2240', border: `1px solid ${pop ? '#166534' : '#1a3a6b'}` }}>
        <label className="flex items-start gap-1.5 cursor-pointer">
          {/* Grava a germinação JUNTO: o 90% era só o valor mostrado no campo —
              sem o usuário encostar nele, params.sementes ficava vazio, a
              compensação não acontecia e o aviso verde aqui embaixo prometia
              uma taxa que o arquivo não levava. */}
          <input type="checkbox" checked={pop}
            onChange={e => patchParams({ doseEhPopulacao: e.target.checked, sementes: r.params.sementes ?? SEMENTE_PADRAO })}
            className="mt-0.5 accent-green-500" />
          <span className="text-[10px] leading-relaxed" style={{ color: '#cbd5e1' }}>
            A dose que eu digito é a <strong style={{ color: '#86efac' }}>população desejada</strong> (plantas/ha) —
            compensar a <strong style={{ color: '#86efac' }}>germinação</strong> no arquivo de aplicação.
          </span>
        </label>
        {pop && (
          <p className="text-[9px] mt-1 leading-relaxed" style={{ color: '#86efac' }}>
            Germinação {fmt(fator * 100, 1)}% — pedir <strong>80.000 plantas/ha</strong> grava{' '}
            <strong>{exemplo != null ? fmt0(exemplo) : '—'} sementes/ha</strong> no SHP, no Excel e no PDF.
            A tabela e o mapa seguem mostrando a população que você pediu.
          </p>
        )}
      </div>

      {mostrarEstoque && <>
      <p className="text-[10px] font-semibold" style={{ color: '#93c5fd' }}>Estoque disponível (converte para o Total disponível)</p>
      <div className="grid grid-cols-3 gap-1.5">
        <select value={estSem.modo} onChange={e => setEstSem({ ...estSem, modo: e.target.value as keyof EstoqueSementes })}
          className="rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
          <option value="populacaoMediaHa">População média (/ha)</option>
          <option value="sementes">Total de sementes</option>
          <option value="milhoes">Milhões de sementes</option>
          <option value="sacos">Sacos</option>
          <option value="kg">Quilos (usa o PMS)</option>
        </select>
        <input value={estSem.valor} onChange={e => setEstSem({ ...estSem, valor: e.target.value })}
          placeholder="ex.: 285000" className="rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
        <Campo rotulo="Margem de segurança (%)"><InputNum valor={s.margemPct} onMudou={v => set('margemPct', v)} /></Campo>
      </div>
      <button onClick={usarComoTotal} className="px-3 py-1.5 rounded text-[10px] font-bold text-white flex items-center gap-1.5" style={{ background: 'var(--invicta-green-dark)' }}>
        <Sprout size={11} /> Usar como Total disponível
      </button>
      <p className="text-[9px]" style={{ color: '#64748b' }}>
        Converte sacos, quilos, milhões ou a média por hectare em sementes e joga no <b>Total disponível</b> do
        cálculo por ajuste — a margem de segurança já sai descontada.
      </p>
      </>}
    </div>
  );
}

function Kpi({ rot, val, cor, sub }: { rot: string; val: string; cor?: string; sub?: string }) {
  return (
    <div className="p-2 rounded-lg text-center" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
      <div className="text-sm font-bold" style={{ color: cor ?? '#93c5fd' }}>{val}</div>
      <div className="text-[9px]" style={{ color: '#64748b' }}>{rot}</div>
      {sub && <div className="text-[9px] font-semibold" style={{ color: '#4ade80' }}>{sub}</div>}
    </div>
  );
}

function BotaoExport({ rot, icone: Ic, onClick, ocupado, pequeno }: {
  rot: string; icone: React.ElementType; onClick: () => void; ocupado?: boolean; pequeno?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={ocupado}
      className={`rounded font-semibold flex items-center gap-1 ${pequeno ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-2 text-[10px]'}`}
      style={{ background: '#1a3a6b', color: '#93c5fd', opacity: ocupado ? 0.6 : 1 }}>
      {ocupado ? <Loader2 size={11} className="animate-spin" /> : <Ic size={11} />} {rot}
    </button>
  );
}

function Vazia({ texto }: { texto: string }) {
  return <p className="text-[10px] py-6 text-center leading-relaxed" style={{ color: '#64748b' }}>{texto}</p>;
}

function Aviso({ tom, texto }: { tom: 'erro' | 'ok' | 'atencao'; texto: string }) {
  const cores = {
    erro: { bg: '#3a1a1a', bd: '#7f1d1d', fg: '#fca5a5' },
    ok: { bg: '#0f3d2e', bd: '#166534', fg: '#6ee7b7' },
    atencao: { bg: '#3a2300', bd: '#92400e', fg: '#fbbf24' },
  }[tom];
  const Ic = tom === 'ok' ? CheckCircle2 : AlertTriangle;
  return (
    <div className="flex items-start gap-1.5 p-2 rounded text-[10px]" style={{ background: cores.bg, border: `1px solid ${cores.bd}`, color: cores.fg }}>
      <Ic size={11} className="flex-shrink-0 mt-0.5" /> <span className="leading-relaxed">{texto}</span>
    </div>
  );
}
