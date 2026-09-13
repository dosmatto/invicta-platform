'use client';

// ABA FOLIAR / NUTRIÇÃO do talhão (ledger 24, 28, 30-33, 35, 37).
//
// O QUE ESTA TELA EXISTE PARA FAZER: transformar um laudo foliar — onze números
// numa folha de papel — em uma ordem de limitação defensável, mostrando ONDE os
// quatro métodos concordam e onde discordam. O diferencial não é ter DRIS: é a
// MATRIZ DE CONCORDÂNCIA. Um índice sozinho é opinião; quatro métodos
// independentes apontando o mesmo nutriente é evidência.
//
// TRÊS REGRAS QUE A TELA HERDA DO NÚCLEO E NÃO PODE AFROUXAR:
//
//  1. NUNCA INVENTAR NÚMERO (ledger 17). Método que não rodou aparece com o
//     `motivo` POR EXTENSO, nunca como célula vazia nem como zero. Zero é um
//     diagnóstico ("equilibrado"); ausência de norma não é.
//  2. NUTRIENTE NÃO ANALISADO É `null`, não zero. O formulário devolve `null`
//     no campo vazio — teor zero seria uma afirmação que o laboratório não fez.
//  3. ÓRGÃO MANDA NA NORMA (ledger 19). O seletor de norma só oferece normas do
//     ÓRGÃO da amostra: oferecer trifólio sem pecíolo para uma amostra com
//     pecíolo é o caminho mais curto para um diagnóstico errado com cara de
//     certo.
//
// A DIAGNOSE SALVA É CONGELADA (ledger 23): `saveDiagnoseFoliar` grava o
// resultado inteiro + `normaId`/`normaVersao`/`funcao`. Editar a norma no ano
// que vem não pode reescrever o laudo que o cliente recebeu impresso — por isso
// o histórico entre safras lê o que foi GRAVADO, e não recalcula.
//
// MAPA: publica no canal `zonasManejo` do AppContext, como as abas irmãs.
// Nenhuma chamada a MapLibre acontece aqui — quem desenha é o MapView.

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import {
  getSafras, getPlantio, getTalhoes, getGrades,
  getAmostrasFoliares, saveAmostraFoliar, updateAmostraFoliar, deleteAmostraFoliar,
  getDiagnosesFoliares, saveDiagnoseFoliar, produtividadeDoMapa,
  getNormasFoliares, normaFoliarPadrao,
  type AmostraFoliar, type DiagnoseFoliarSalva,
} from '@/lib/store';
import { zonasDoTalhao } from '@/lib/zonasDoTalhao';
import { ehComposta, celulasComoZonaTalhao } from '@/lib/celulasDaGrade';
import { rotuloAno } from '@/lib/periodo';
import { pode } from '@/lib/empresa';
import type { ItemBiblioteca } from '@/lib/biblioteca';
import {
  AVISOS_METODO, COR_CLASSE_PRA, COR_ESTADO, NUTRIENTES, NORMAS_FABRICA,
  ROTULO_CLASSE_PRA, ROTULO_ESTADO, ROTULO_FUNCAO, ROTULO_METODO, ROTULO_ORGAO,
  diagnosticar, nutrientePorId, unidadeDe,
  type DiagnoseFoliar, type EstadoNutricional, type FaixaNutriente, type FuncaoDris,
  type MetodoDiagnose, type NormaDris, type NutrienteId, type Orgao, type TeoresFoliares,
} from '@/lib/foliar';
import { BarrasIndices, LinhaIbn, MatrizConcordancia, RadarBalanco } from '@/components/foliar/GraficosFoliar';
import type { CelulaMatriz, DadosMatriz } from '@/lib/foliarGraficos';
import { inputStyle } from '@/constants/ui';
import {
  Salad, Plus, Pencil, Trash2, Save, X, ChevronDown, ChevronRight,
  AlertTriangle, Map as MapIcon, Info, Loader2,
} from 'lucide-react';

// ── Formatação e constantes de tela ─────────────────────────────────────────

const fmt = (v: number, casas = 1) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

/** Casas do teor: macro (g/kg) pede decimal; micro (mg/kg) é inteiro no laudo. */
const casasTeor = (id: NutrienteId) => (unidadeDe(id) === 'g/kg' ? 1 : 0);

const ORGAOS: Orgao[] = ['trifolio-com-peciolo', 'trifolio-sem-peciolo', 'folha-espiga', 'folha-bandeira'];
const FUNCOES: FuncaoDris[] = ['alvarez-leite', 'beaufils', 'jones', 'elwali-gascho'];
const METODOS: MetodoDiagnose[] = ['dris', 'cnd', 'faixa', 'chance'];

/** Abreviação do estado dentro da célula da matriz (canvas tem 40px de largura). */
const CURTO_ESTADO: Record<EstadoNutricional, string> = {
  deficiente: 'Def.', adequado: 'Adeq.', excessivo: 'Exc.',
};

const COR_NEUTRA = '#1e293b';

/** Cor por nutriente — só para o MAPA do nutriente mais limitante (categórica). */
const COR_NUTRIENTE: Record<NutrienteId, string> = {
  N: '#22c55e', P: '#f97316', K: '#a855f7', Ca: '#0ea5e9', Mg: '#14b8a6', S: '#eab308',
  B: '#ef4444', Cu: '#8b5cf6', Fe: '#a8a29e', Mn: '#ec4899', Zn: '#3b82f6',
};

/** Rampa do IBN: equilibrado (verde) → desequilibrado (vermelho). */
const RAMPA_IBN = ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444'];
function corIbn(v: number, max: number): string {
  if (!(max > 0) || !Number.isFinite(v)) return COR_NEUTRA;
  const t = Math.max(0, Math.min(0.999, v / max));
  return RAMPA_IBN[Math.floor(t * RAMPA_IBN.length)];
}

const chaveCultura = (c: string) => (c ?? '').trim().toLowerCase();

/** Órgão que a cultura pede — é só o PADRÃO do formulário, o usuário troca. */
function orgaoSugerido(cultura: string): Orgao {
  const c = chaveCultura(cultura);
  if (c === 'milho' || c === 'sorgo') return 'folha-espiga';
  if (c === 'trigo' || c === 'cevada' || c === 'aveia') return 'folha-bandeira';
  return 'trifolio-com-peciolo';
}

/** Estádio de amostragem consagrado da cultura (sugestão, não imposição). */
function estadioSugerido(cultura: string): string {
  const c = chaveCultura(cultura);
  if (c === 'soja') return 'R1-R2';
  if (c === 'milho') return 'VT-R1';
  if (c === 'trigo' || c === 'cevada') return 'Espigamento';
  return '';
}

/**
 * A faixa "de fábrica" do nutriente, usada só para AVISAR de teor implausível.
 * Prefere a faixa da norma em uso; na falta dela, procura nas normas de
 * literatura embarcadas da mesma cultura. `null` quando não existe faixa
 * publicada — e aí a tela não inventa limite nenhum.
 */
function faixaDeReferencia(nut: NutrienteId, cultura: string, norma: NormaDris | null): FaixaNutriente | null {
  const daNorma = norma?.faixas?.[nut];
  if (daNorma) return daNorma;
  const c = chaveCultura(cultura);
  const candidatas = NORMAS_FABRICA
    .filter(n => chaveCultura(n.cultura) === c)
    .map(n => n.faixas?.[nut])
    .filter((f): f is FaixaNutriente => !!f);
  if (!candidatas.length) return null;
  return {
    min: Math.min(...candidatas.map(f => f.min)),
    max: Math.max(...candidatas.map(f => f.max)),
  };
}

const numBr = (s: string): number | null => {
  const t = String(s ?? '').replace(/\./g, '').replace(',', '.').trim();
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
};

// ── Formulário ──────────────────────────────────────────────────────────────

type TeoresTexto = Partial<Record<NutrienteId, string>>;

interface FormFoliar {
  id?: string;
  dataColeta: string;
  orgao: Orgao;
  estadio: string;
  numeroAmostra: string;
  areaId: string;             // zona de manejo OU célula da composta
  produtividade: string;
  origemProd: 'mapa' | 'manual';
  observacao: string;
  teores: TeoresTexto;
}

function formVazio(cultura: string, prodMapa: number | null): FormFoliar {
  return {
    dataColeta: new Date().toISOString().slice(0, 10),
    orgao: orgaoSugerido(cultura),
    estadio: estadioSugerido(cultura),
    numeroAmostra: '',
    areaId: '',
    produtividade: prodMapa != null ? String(Math.round(prodMapa)) : '',
    origemProd: prodMapa != null ? 'mapa' : 'manual',
    observacao: '',
    teores: {},
  };
}

function formDaAmostra(a: AmostraFoliar): FormFoliar {
  const teores: TeoresTexto = {};
  for (const n of NUTRIENTES) {
    const v = a.teores?.[n];
    if (v != null && Number.isFinite(v)) teores[n] = String(v).replace('.', ',');
  }
  return {
    id: a.id,
    dataColeta: a.dataColeta ?? a.dataReferencia ?? '',
    orgao: a.orgao,
    estadio: a.estadio ?? '',
    numeroAmostra: a.numeroAmostra != null ? String(a.numeroAmostra) : '',
    areaId: a.celulaId ?? a.zonaId ?? '',
    produtividade: a.produtividadeKgha != null ? String(Math.round(a.produtividadeKgha)) : '',
    origemProd: a.origemProdutividade ?? 'manual',
    observacao: a.observacao ?? '',
    teores,
  };
}

function teoresDoForm(form: FormFoliar): TeoresFoliares {
  const saida = {} as TeoresFoliares;
  for (const n of NUTRIENTES) {
    const v = numBr(form.teores[n] ?? '');
    saida[n] = v == null ? null : v;   // campo vazio = NÃO analisado, nunca zero
  }
  return saida;
}

/**
 * Validação de PLAUSIBILIDADE, em dois níveis. `erros` bloqueiam a gravação
 * (negativo não é teor); `alertas` só avisam — 0,2× a 5× a faixa publicada é
 * folga generosa de propósito: o objetivo é pegar erro de UNIDADE (laudo em %
 * digitado como g/kg dá 10×) e de vírgula, não discordar do laboratório.
 */
function validarForm(form: FormFoliar, cultura: string, norma: NormaDris | null): { erros: string[]; alertas: string[] } {
  const erros: string[] = [];
  const alertas: string[] = [];

  if (!form.dataColeta) erros.push('Informe a data da coleta — é ela que arquiva a amostra no ano certo.');

  let informados = 0;
  for (const n of NUTRIENTES) {
    const bruto = form.teores[n] ?? '';
    if (!bruto.trim()) continue;
    const v = numBr(bruto);
    const nome = nutrientePorId(n).simbolo;
    if (v == null) { erros.push(`${nome}: "${bruto}" não é um número.`); continue; }
    informados++;
    if (v < 0) { erros.push(`${nome}: teor negativo (${bruto}) — não existe.`); continue; }
    if (v === 0) { alertas.push(`${nome}: zero é uma afirmação ("a planta não tem o elemento"). Se o laboratório não analisou, deixe o campo VAZIO.`); continue; }
    const faixa = faixaDeReferencia(n, cultura, norma);
    if (!faixa) continue;
    const un = unidadeDe(n);
    if (v < faixa.min * 0.2) alertas.push(`${nome}: ${fmt(v, casasTeor(n))} ${un} é menos de 1/5 do limite inferior publicado (${fmt(faixa.min, casasTeor(n))}). Confira a unidade do laudo.`);
    else if (v > faixa.max * 5) alertas.push(`${nome}: ${fmt(v, casasTeor(n))} ${un} é mais de 5× o limite superior publicado (${fmt(faixa.max, casasTeor(n))}). Confira a unidade do laudo.`);
  }
  if (!informados) erros.push('Informe ao menos um teor — um laudo sem nutriente nenhum não diagnostica nada.');

  const prod = numBr(form.produtividade);
  if (form.produtividade.trim() && prod == null) erros.push('Produtividade: valor inválido.');
  if (prod != null && prod < 0) erros.push('Produtividade negativa não existe.');

  return { erros, alertas };
}

// ── Peças de tela ───────────────────────────────────────────────────────────

function Bloco({ titulo, icone, children, direita }: {
  titulo: string; icone?: React.ReactNode; children: React.ReactNode; direita?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg p-2.5" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
      <div className="flex items-center gap-1.5 mb-2">
        {icone}
        <div className="text-[11px] font-bold flex-1" style={{ color: '#e2e8f0' }}>{titulo}</div>
        {direita}
      </div>
      {children}
    </div>
  );
}

function Recolhivel({ titulo, aberto, alternar, children, cor }: {
  titulo: string; aberto: boolean; alternar: () => void; children: React.ReactNode; cor?: string;
}) {
  return (
    <div className="rounded-lg" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
      <button onClick={alternar} className="w-full flex items-center gap-1.5 px-2.5 py-2 text-left">
        {aberto ? <ChevronDown size={12} style={{ color: cor ?? '#94a3b8' }} /> : <ChevronRight size={12} style={{ color: cor ?? '#94a3b8' }} />}
        <span className="text-[11px] font-bold" style={{ color: cor ?? '#e2e8f0' }}>{titulo}</span>
      </button>
      {aberto && <div className="px-2.5 pb-2.5">{children}</div>}
    </div>
  );
}

/** Método sem resultado NUNCA some da tela: mostra o motivo por extenso. */
function SemResultado({ metodo, motivo }: { metodo: MetodoDiagnose; motivo: string | null }) {
  return (
    <div className="rounded px-2 py-1.5 text-[9px] flex items-start gap-1.5" style={{ background: '#0b1f38', border: '1px solid #2e5fa3' }}>
      <Info size={10} style={{ color: '#93c5fd', flexShrink: 0, marginTop: 1 }} />
      <span style={{ color: '#94a3b8' }}>
        <strong style={{ color: '#cbd5e1' }}>{ROTULO_METODO[metodo]}</strong> não rodou: {motivo ?? 'motivo não informado pelo núcleo.'}
      </span>
    </div>
  );
}

// ── Componente ──────────────────────────────────────────────────────────────

export function FoliarSection({ safraNome: safraProp }: { safraNome?: string } = {}) {
  const { nav, setZonasManejo } = useApp();
  const talhaoId = nav.talhaoId ?? '';

  // safraProp (Página do Talhão) manda; sem ela, a safra ativa global — igual
  // às abas irmãs, para a tela não trocar de ano ao ser aberta de outro lugar.
  const safraAtiva = useMemo(() => getSafras().find(s => s.ativa) ?? null, []);
  const safra = safraProp ?? safraAtiva?.nome ?? '';

  const talhao = useMemo(() => getTalhoes().find(t => t.id === talhaoId) ?? null, [talhaoId]);
  const cultura = useMemo(() => (talhaoId && safra ? getPlantio(talhaoId, safra) : ''), [talhaoId, safra]);
  const podeEditar = pode('importarLaudo');

  // `versao` é o único estado do carregamento: o store dispara `inv:foliar` em
  // toda escrita e o contador sobe, refazendo as listas. Guardar as listas em
  // estado obrigaria a chamar setState dentro de efeito (cascata de render) e a
  // ressincronizar na troca de talhão/safra — derivar é mais simples e nunca
  // fica desatualizado.
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    const h = () => setVersao(v => v + 1);
    window.addEventListener('inv:foliar', h);
    return () => window.removeEventListener('inv:foliar', h);
  }, []);

  const amostras: AmostraFoliar[] = useMemo(
    () => (talhaoId && safra ? getAmostrasFoliares(talhaoId, safra) : []),
    // `versao` entra de propósito: é ele que refaz a leitura do localStorage.
    [talhaoId, safra, versao],
  );
  const diagnosesSalvas: DiagnoseFoliarSalva[] = useMemo(
    () => (talhaoId ? getDiagnosesFoliares(talhaoId) : []),
    [talhaoId, versao],
  );

  const [selBruto, setSelBruto] = useState('');
  const [funcao, setFuncao] = useState<FuncaoDris>('alvarez-leite');
  const [normaIdBruto, setNormaIdBruto] = useState('');
  const [form, setForm] = useState<FormFoliar | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [avisoSalvo, setAvisoSalvo] = useState('');
  const [limitacoesAbertas, setLimitacoesAbertas] = useState(false);
  const [ressalvasAbertas, setRessalvasAbertas] = useState(false);
  const [mapaLigado, setMapaLigado] = useState(true);
  const [modoCor, setModoCor] = useState<'limitante' | 'ibn'>('limitante');

  // Seleção DERIVADA: id escolhido enquanto ele existir; senão, a amostra mais
  // recente. Corrigir a seleção num efeito faria a tela renderizar duas vezes a
  // cada exclusão — e piscar a diagnose da amostra errada no meio.
  const selId = useMemo(
    () => (amostras.some(a => a.id === selBruto) ? selBruto : (amostras[0]?.id ?? '')),
    [amostras, selBruto],
  );
  const amostraSel = useMemo(() => amostras.find(a => a.id === selId) ?? null, [amostras, selId]);

  // ── Norma em uso ──────────────────────────────────────────────────────────
  // O ÓRGÃO de referência sai da amostra selecionada (ou do formulário aberto):
  // é ele que filtra as normas oferecidas (ledger 19).
  const orgaoRef: Orgao = form?.orgao ?? amostraSel?.orgao ?? orgaoSugerido(cultura);
  const normasDisp: ItemBiblioteca<NormaDris>[] = useMemo(
    () => (cultura ? getNormasFoliares(cultura, orgaoRef) : []),
    [cultura, orgaoRef],
  );
  // Norma escolhida que some da lista (troca de órgão, item desativado na
  // Biblioteca) cai para o padrão — DERIVANDO, não corrigindo num efeito:
  // oferecer norma de outro órgão é o erro que o ledger 19 existe para evitar.
  const normaIdSel = useMemo(
    () => (normasDisp.some(i => i.id === normaIdBruto) ? normaIdBruto : ''),
    [normasDisp, normaIdBruto],
  );
  const norma: NormaDris | null = useMemo(() => {
    const item = normasDisp.find(i => i.id === normaIdSel);
    if (item) return { ...item.conteudo, id: item.id, versao: item.versao };
    return cultura ? normaFoliarPadrao(cultura, orgaoRef) : null;
  }, [normasDisp, normaIdSel, cultura, orgaoRef]);

  // ── Diagnose da amostra selecionada ───────────────────────────────────────
  const diag: DiagnoseFoliar | null = useMemo(() => {
    if (!amostraSel) return null;
    return diagnosticar(amostraSel.teores, norma, {
      funcao,
      orgaoAmostra: amostraSel.orgao,
      estadioAmostra: amostraSel.estadio ?? null,
      produtividadeKgha: amostraSel.produtividadeKgha ?? null,
    });
  }, [amostraSel, norma, funcao]);

  // ── Áreas do mapa (zonas de manejo ou células da composta) ────────────────
  const grade = useMemo(() => {
    if (!talhaoId || !safra) return null;
    const gs = getGrades(talhaoId, safra);
    return gs.find(g => g.paraProcessar && ehComposta(g)) ?? gs.find(g => ehComposta(g)) ?? null;
  }, [talhaoId, safra]);

  const areas = useMemo(
    () => (ehComposta(grade) ? celulasComoZonaTalhao(grade) : zonasDoTalhao(talhaoId)),
    [grade, talhaoId],
  );
  const areaEhCelula = ehComposta(grade);

  // Diagnose de TODAS as amostras com área — é o que pinta o mapa. Roda com a
  // mesma norma e a mesma função da tela: duas amostras coloridas por critérios
  // diferentes no mesmo mapa seriam ilegíveis.
  const porArea = useMemo(() => {
    const m = new Map<string, { amostra: AmostraFoliar; limitante: NutrienteId | null; ibn: number | null }>();
    for (const a of amostras) {
      const areaId = a.celulaId ?? a.zonaId;
      if (!areaId) continue;
      const d = diagnosticar(a.teores, norma, {
        funcao, orgaoAmostra: a.orgao, estadioAmostra: a.estadio ?? null,
        produtividadeKgha: a.produtividadeKgha ?? null,
      });
      const limitante = d.dris?.ordemLimitacao[0] ?? d.cnd?.ordemLimitacao[0] ?? null;
      const ibn = d.dris?.ibn ?? null;
      // A mais recente de cada área vence (a lista vem ordenada por criadoEm desc).
      if (!m.has(areaId)) m.set(areaId, { amostra: a, limitante, ibn });
    }
    return m;
  }, [amostras, norma, funcao]);

  const fcMapa = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!areas.length || !porArea.size) return null;
    const ibnMax = Math.max(...[...porArea.values()].map(v => v.ibn ?? 0), 0);
    const features = areas.map(z => {
      const info = porArea.get(z.id);
      const cor = !info ? '#334155'
        : modoCor === 'ibn'
          ? (info.ibn != null ? corIbn(info.ibn, ibnMax) : '#334155')
          : (info.limitante ? COR_NUTRIENTE[info.limitante] : '#334155');
      const classeLabel = !info ? 'sem amostra foliar'
        : modoCor === 'ibn'
          ? (info.ibn != null ? `IBN ${fmt(info.ibn, 1)}` : 'sem IBN (sem norma DRIS)')
          : (info.limitante ? `mais limitante: ${info.limitante}` : 'sem ordem de limitação');
      return {
        type: 'Feature' as const,
        properties: { cor, rotulo: z.id, classeLabel, selecionada: info?.amostra.id === selId },
        geometry: z.geometry,
      };
    });
    return { type: 'FeatureCollection', features };
  }, [areas, porArea, modoCor, selId]);

  // Publica no canal do mapa e LIMPA ao sair — sem o cleanup, as zonas da
  // foliar ficariam pintadas por cima da aba seguinte.
  useEffect(() => {
    if (!mapaLigado || !fcMapa) { setZonasManejo(null); return; }
    setZonasManejo(fcMapa);
    return () => setZonasManejo(null);
  }, [fcMapa, mapaLigado, setZonasManejo]);

  // ── Histórico entre safras (ledger 32) ────────────────────────────────────
  // Lê o que foi GRAVADO (diagnose congelada), nunca recalcula: o histórico
  // precisa mostrar o que o cliente recebeu, com a norma daquele ano.
  const historico = useMemo(() => {
    const porSafra = new Map<string, DiagnoseFoliarSalva>();
    for (const d of diagnosesSalvas) {
      if (!porSafra.has(d.safra)) porSafra.set(d.safra, d);   // lista desc por criadoEm
    }
    return [...porSafra.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR', { numeric: true }))
      .map(([s, d]) => {
        const r = d.resultado;
        const limitante = r.dris?.ordemLimitacao[0] ?? r.cnd?.ordemLimitacao[0] ?? null;
        const classe = limitante
          ? (r.dris?.indices.find(i => i.nutriente === limitante)?.classe
            ?? r.cnd?.indices.find(i => i.nutriente === limitante)?.classe ?? null)
          : null;
        return {
          safra: s, ibn: r.dris?.ibn ?? null, ibnMotivo: r.drisMotivo,
          limitante, classe, funcao: d.funcao, fonte: r.norma?.fonte ?? null, em: d.criadoEm,
        };
      });
  }, [diagnosesSalvas]);

  // ── Ações ─────────────────────────────────────────────────────────────────
  function abrirNovo() {
    const prod = talhaoId && safra && cultura ? produtividadeDoMapa(talhaoId, safra, cultura) : null;
    setForm(formVazio(cultura, prod));
    setAvisoSalvo('');
  }

  function abrirEdicao(a: AmostraFoliar) {
    setForm(formDaAmostra(a));
    setAvisoSalvo('');
  }

  function salvarAmostra() {
    if (!form || !talhaoId || !safra) return;
    const { erros } = validarForm(form, cultura, norma);
    if (erros.length) return;
    setSalvando(true);
    try {
      const prod = numBr(form.produtividade);
      const numero = numBr(form.numeroAmostra);
      const base = {
        talhaoId, safra, cultura,
        dataColeta: form.dataColeta,
        estadio: form.estadio.trim() || undefined,
        orgao: form.orgao,
        teores: teoresDoForm(form),
        produtividadeKgha: prod,
        origemProdutividade: form.origemProd,
        zonaId: !areaEhCelula && form.areaId ? form.areaId : undefined,
        celulaId: areaEhCelula && form.areaId ? form.areaId : undefined,
        numeroAmostra: numero != null ? Math.round(numero) : undefined,
        origem: 'manual' as const,
        observacao: form.observacao.trim() || undefined,
      };
      if (form.id) {
        updateAmostraFoliar(form.id, base);
      } else {
        const nova = saveAmostraFoliar(base);
        setSelBruto(nova.id);
      }
      setForm(null);
    } finally {
      setSalvando(false);
    }
  }

  function excluirAmostra(a: AmostraFoliar) {
    if (!window.confirm(`Excluir a amostra de ${a.dataColeta ?? 'data não informada'}? As diagnoses geradas a partir dela também saem.`)) return;
    deleteAmostraFoliar(a.id);
    if (form?.id === a.id) setForm(null);
  }

  function gravarDiagnose() {
    if (!diag || !amostraSel || !norma?.id) return;
    saveDiagnoseFoliar({
      amostraId: amostraSel.id,
      talhaoId, safra,
      normaId: norma.id,
      normaVersao: norma.versao ?? 1,
      funcao,
      resultado: diag,
    });
    setAvisoSalvo('Diagnose gravada no histórico do talhão.');
  }

  // ── Dados dos gráficos ────────────────────────────────────────────────────
  const barras = useMemo(() => {
    if (!diag?.dris) return [];
    return [...diag.dris.indices]
      .sort((a, b) => a.ordem - b.ordem)
      .map(i => ({ rotulo: i.nutriente, valor: i.indice, cor: COR_CLASSE_PRA[i.classe] }));
  }, [diag]);

  // Radar: DRIS quando existe; CND (IZ) como segunda opção — ambos são índices
  // centrados em zero, então o desenho é o mesmo.
  const radar = useMemo(() => {
    if (diag?.dris) return diag.dris.indices.map(i => ({ rotulo: i.nutriente, valor: i.indice }));
    if (diag?.cnd) return diag.cnd.indices.map(i => ({ rotulo: i.nutriente, valor: i.iz }));
    return [];
  }, [diag]);
  const radarEhCnd = !diag?.dris && !!diag?.cnd;

  const matriz = useMemo<DadosMatriz>(() => {
    const colunas = [...METODOS.map(m => ROTULO_METODO[m] === 'Faixa de suficiência' ? 'Faixa' : ROTULO_METODO[m]), 'Consenso', 'Concord.'];
    const linhas = (diag?.consenso ?? []).map(c => {
      const celulas: CelulaMatriz[] = METODOS.map(m => {
        const e = c.porMetodo[m];
        return e
          ? { texto: CURTO_ESTADO[e], cor: COR_ESTADO[e] }
          : { texto: '—', cor: COR_NEUTRA, corTexto: '#64748b' };
      });
      celulas.push(c.consenso
        ? { texto: CURTO_ESTADO[c.consenso], cor: COR_ESTADO[c.consenso] }
        : { texto: c.nMetodos ? 'empate' : '—', cor: COR_NEUTRA, corTexto: '#fbbf24' });
      celulas.push({
        texto: c.nMetodos ? `${Math.round(c.concordancia * 100)}%` : '—',
        cor: COR_NEUTRA,
        corTexto: c.concordancia >= 0.99 ? '#22c55e' : c.concordancia >= 0.7 ? '#eab308' : '#f97316',
      });
      return { rotulo: c.nutriente, celulas };
    });
    return { colunas, linhas };
  }, [diag]);

  const pontosIbn = useMemo(
    () => historico.map(h => ({ rotulo: rotuloAno(h.safra) || h.safra, valor: h.ibn })),
    [historico],
  );

  const ressalvas = useMemo(
    () => (diag?.avisos ?? []).filter(a => !AVISOS_METODO.includes(a)),
    [diag],
  );

  const validacao = form ? validarForm(form, cultura, norma) : null;

  // ── Render ────────────────────────────────────────────────────────────────
  if (!talhaoId) {
    return <div className="p-4 text-[11px]" style={{ color: '#64748b' }}>Abra um talhão para lançar análises foliares.</div>;
  }

  return (
    <div className="p-4 space-y-3">
      {/* Cabeçalho */}
      <div className="flex items-center gap-2">
        <Salad size={14} style={{ color: '#4ade80' }} />
        <h3 className="text-sm font-bold" style={{ color: '#e2e8f0' }}>Foliar / Nutrição</h3>
      </div>
      <div className="text-[10px]" style={{ color: '#64748b' }}>
        {talhao?.nome ?? 'Talhão'} · {rotuloAno(safra) || safra || 'sem ano'} · {cultura || 'cultura não informada'}
      </div>

      {/* Norma em uso + função DRIS */}
      <Bloco titulo="Norma em uso" icone={<Info size={12} style={{ color: '#93c5fd' }} />}>
        {!cultura && (
          <p className="text-[9px] mb-1.5" style={{ color: '#fbbf24' }}>
            Sem cultura definida para esta safra — defina o cultivo do talhão para a plataforma saber qual norma oferecer.
          </p>
        )}
        <label className="text-[9px] block mb-1" style={{ color: '#94a3b8' }}>
          Norma ({ROTULO_ORGAO[orgaoRef]}):
        </label>
        <select
          value={normaIdSel}
          onChange={e => setNormaIdBruto(e.target.value)}
          className="w-full rounded px-2 py-1.5 text-[10px] outline-none mb-1.5"
          style={inputStyle}
        >
          <option value="">Padrão da plataforma{norma ? '' : ' (nenhuma disponível)'}</option>
          {normasDisp.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
        </select>

        <label className="text-[9px] block mb-1" style={{ color: '#94a3b8' }}>Função f(A/B) do DRIS:</label>
        <select
          value={funcao}
          onChange={e => setFuncao(e.target.value as FuncaoDris)}
          className="w-full rounded px-2 py-1.5 text-[10px] outline-none"
          style={inputStyle}
        >
          {FUNCOES.map(f => <option key={f} value={f}>{ROTULO_FUNCAO[f]}</option>)}
        </select>

        {norma ? (
          <div className="mt-2 space-y-0.5">
            <div className="text-[9px]" style={{ color: '#cbd5e1' }}>
              {norma.cultura} · {ROTULO_ORGAO[norma.orgao]} · {norma.estadio} · origem <strong>{norma.origem}</strong>
              {norma.n != null && <> · n={norma.n}</>}
            </div>
            <div className="text-[9px]" style={{ color: '#64748b' }}>{norma.fonte}</div>
            <div className="text-[9px]" style={{ color: '#64748b' }}>
              Pares DRIS: {norma.pares.length} · CND: {norma.cnd ? 'sim' : 'não'} · Faixas: {norma.faixas ? 'sim' : 'não'} · Chance: {norma.chance ? 'sim' : 'não'}
            </div>
          </div>
        ) : (
          <p className="text-[9px] mt-2" style={{ color: '#fbbf24' }}>
            Nenhuma norma para {cultura || 'esta cultura'} em {ROTULO_ORGAO[orgaoRef]}. A diagnose vai declarar &quot;sem norma&quot; em vez de calcular — gere uma norma na Biblioteca a partir dos seus laudos.
          </p>
        )}
      </Bloco>

      {/* Amostras da safra */}
      <Bloco
        titulo={`Amostras (${amostras.length})`}
        icone={<Salad size={12} style={{ color: '#4ade80' }} />}
        direita={podeEditar && !form ? (
          <button onClick={abrirNovo} className="px-2 py-1 rounded text-[10px] font-bold text-white flex items-center gap-1" style={{ background: 'var(--invicta-green-dark)' }}>
            <Plus size={11} /> Nova
          </button>
        ) : undefined}
      >
        {!amostras.length ? (
          <p className="text-[9px]" style={{ color: '#64748b' }}>
            Nenhum laudo foliar neste talhão/ano. Lance o primeiro pelo botão <strong>Nova</strong> ou importe a planilha do laboratório.
          </p>
        ) : (
          <div className="space-y-1">
            {amostras.map(a => {
              const sel = a.id === selId;
              return (
                <div
                  key={a.id}
                  onClick={() => setSelBruto(a.id)}
                  className="rounded px-2 py-1.5 cursor-pointer flex items-center gap-1.5"
                  style={{ background: sel ? '#0b1f38' : '#08182b', border: `1px solid ${sel ? '#2e5fa3' : '#122c4d'}` }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-bold truncate" style={{ color: '#e2e8f0' }}>
                      {a.dataColeta ? a.dataColeta.split('-').reverse().join('/') : 'sem data'}
                      {a.numeroAmostra != null && <> · nº {a.numeroAmostra}</>}
                      {(a.celulaId ?? a.zonaId) && <> · {areaEhCelula ? 'célula' : 'zona'} {a.celulaId ?? a.zonaId}</>}
                    </div>
                    <div className="text-[9px] truncate" style={{ color: '#64748b' }}>
                      {ROTULO_ORGAO[a.orgao]}{a.estadio ? ` · ${a.estadio}` : ''} · origem {a.origem}
                      {a.produtividadeKgha != null && <> · {fmt(a.produtividadeKgha, 0)} kg/ha ({a.origemProdutividade === 'mapa' ? 'do mapa' : 'manual'})</>}
                    </div>
                  </div>
                  {podeEditar && (
                    <>
                      <button onClick={e => { e.stopPropagation(); abrirEdicao(a); }} title="Editar" className="p-1 rounded" style={{ background: '#1a3a6b' }}>
                        <Pencil size={10} style={{ color: '#93c5fd' }} />
                      </button>
                      <button onClick={e => { e.stopPropagation(); excluirAmostra(a); }} title="Excluir" className="p-1 rounded" style={{ background: '#3b1220' }}>
                        <Trash2 size={10} style={{ color: '#fca5a5' }} />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Bloco>

      {/* Formulário manual (ledger 24) */}
      {form && (
        <Bloco
          titulo={form.id ? 'Editar amostra' : 'Nova amostra foliar'}
          icone={<Pencil size={12} style={{ color: '#93c5fd' }} />}
          direita={
            <button onClick={() => setForm(null)} title="Fechar" className="p-1 rounded" style={{ background: '#1a3a6b' }}>
              <X size={11} style={{ color: '#94a3b8' }} />
            </button>
          }
        >
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            <div>
              <label className="text-[9px] block mb-0.5" style={{ color: '#94a3b8' }}>Data da coleta:</label>
              <input type="date" value={form.dataColeta} onChange={e => setForm({ ...form, dataColeta: e.target.value })}
                className="w-full rounded px-2 py-1 text-[10px] outline-none" style={inputStyle} />
            </div>
            <div>
              <label className="text-[9px] block mb-0.5" style={{ color: '#94a3b8' }}>Nº da amostra (laudo):</label>
              <input value={form.numeroAmostra} onChange={e => setForm({ ...form, numeroAmostra: e.target.value })}
                inputMode="numeric" placeholder="ex.: 7"
                className="w-full rounded px-2 py-1 text-[10px] outline-none" style={inputStyle} />
            </div>
          </div>

          <label className="text-[9px] block mb-0.5" style={{ color: '#94a3b8' }}>Órgão amostrado (a norma só vale no órgão em que foi gerada):</label>
          <select value={form.orgao} onChange={e => setForm({ ...form, orgao: e.target.value as Orgao })}
            className="w-full rounded px-2 py-1 text-[10px] outline-none mb-2" style={inputStyle}>
            {ORGAOS.map(o => <option key={o} value={o}>{ROTULO_ORGAO[o]}</option>)}
          </select>

          <div className="grid grid-cols-2 gap-1.5 mb-2">
            <div>
              <label className="text-[9px] block mb-0.5" style={{ color: '#94a3b8' }}>Estádio fenológico:</label>
              <input value={form.estadio} onChange={e => setForm({ ...form, estadio: e.target.value })}
                placeholder={estadioSugerido(cultura) || 'ex.: R1-R2'} maxLength={20}
                className="w-full rounded px-2 py-1 text-[10px] outline-none" style={inputStyle} />
              {estadioSugerido(cultura) && (
                <div className="text-[8px] mt-0.5" style={{ color: '#64748b' }}>sugestão p/ {cultura}: {estadioSugerido(cultura)}</div>
              )}
            </div>
            <div>
              <label className="text-[9px] block mb-0.5" style={{ color: '#94a3b8' }}>{areaEhCelula ? 'Célula da grade' : 'Zona de manejo'} (opcional):</label>
              <select value={form.areaId} onChange={e => setForm({ ...form, areaId: e.target.value })}
                className="w-full rounded px-2 py-1 text-[10px] outline-none" style={inputStyle}>
                <option value="">— talhão inteiro —</option>
                {areas.map(z => <option key={z.id} value={z.id}>{z.id}</option>)}
              </select>
            </div>
          </div>

          <label className="text-[9px] block mb-0.5" style={{ color: '#94a3b8' }}>Produtividade (kg/ha):</label>
          <input
            value={form.produtividade}
            onChange={e => setForm({ ...form, produtividade: e.target.value, origemProd: 'manual' })}
            inputMode="numeric" placeholder="ex.: 3800"
            className="w-full rounded px-2 py-1 text-[10px] outline-none" style={inputStyle}
          />
          <div className="text-[8px] mt-0.5 mb-2" style={{ color: form.origemProd === 'mapa' ? '#4ade80' : '#64748b' }}>
            {form.origemProd === 'mapa'
              ? 'do mapa de colheita deste talhão/safra — edite para substituir por um valor medido'
              : 'digitado à mão; sem mapa de colheita oficial para esta cultura/safra'}
          </div>

          <label className="text-[9px] block mb-1" style={{ color: '#94a3b8' }}>
            Teores — deixe VAZIO o nutriente que o laboratório não analisou (vazio ≠ zero):
          </label>
          <div className="grid grid-cols-3 gap-1 mb-2">
            {NUTRIENTES.map(n => (
              <div key={n} className="flex items-center gap-1">
                <span className="text-[10px] font-bold w-5 text-right" style={{ color: '#e2e8f0' }}>{n}</span>
                <input
                  value={form.teores[n] ?? ''}
                  onChange={e => setForm({ ...form, teores: { ...form.teores, [n]: e.target.value } })}
                  inputMode="decimal"
                  className="w-full min-w-0 rounded px-1 py-1 text-[10px] outline-none" style={inputStyle}
                />
                <span className="text-[8px] w-9" style={{ color: '#64748b' }}>{unidadeDe(n)}</span>
              </div>
            ))}
          </div>

          <label className="text-[9px] block mb-0.5" style={{ color: '#94a3b8' }}>Observação:</label>
          <input value={form.observacao} onChange={e => setForm({ ...form, observacao: e.target.value })}
            className="w-full rounded px-2 py-1 text-[10px] outline-none mb-2" style={inputStyle} />

          {!!validacao?.erros.length && (
            <div className="rounded px-2 py-1.5 mb-1.5" style={{ background: '#3b1220', border: '1px solid #7f1d1d' }}>
              {validacao.erros.map((e, i) => (
                <div key={i} className="text-[9px] flex items-start gap-1" style={{ color: '#fca5a5' }}>
                  <AlertTriangle size={9} style={{ flexShrink: 0, marginTop: 1 }} /> {e}
                </div>
              ))}
            </div>
          )}
          {!!validacao?.alertas.length && (
            <div className="rounded px-2 py-1.5 mb-1.5" style={{ background: '#2a2008', border: '1px solid #854d0e' }}>
              {validacao.alertas.map((a, i) => (
                <div key={i} className="text-[9px] flex items-start gap-1" style={{ color: '#fbbf24' }}>
                  <AlertTriangle size={9} style={{ flexShrink: 0, marginTop: 1 }} /> {a}
                </div>
              ))}
              <div className="text-[8px] mt-1" style={{ color: '#a16207' }}>Alertas não bloqueiam a gravação — confira o laudo e siga se estiver certo.</div>
            </div>
          )}

          <div className="flex gap-1.5">
            <button
              onClick={salvarAmostra}
              disabled={salvando || !!validacao?.erros.length}
              className="flex-1 py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1"
              style={{ background: 'var(--invicta-green-dark)', opacity: salvando || validacao?.erros.length ? 0.5 : 1 }}
            >
              {salvando ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} {form.id ? 'Salvar alterações' : 'Salvar amostra'}
            </button>
            <button onClick={() => setForm(null)} className="px-3 py-1.5 rounded text-[10px] font-bold" style={{ background: '#1a3a6b', color: '#94a3b8' }}>
              Cancelar
            </button>
          </div>
        </Bloco>
      )}

      {/* Diagnose */}
      {amostraSel && diag && (
        <>
          <Bloco
            titulo="Diagnose multi-método"
            icone={<Salad size={12} style={{ color: '#4ade80' }} />}
            direita={podeEditar ? (
              <button
                onClick={gravarDiagnose}
                disabled={!norma?.id}
                title={norma?.id ? 'Congela este resultado no histórico do talhão' : 'Sem norma não há o que congelar'}
                className="px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1"
                style={{ background: '#1a3a6b', color: '#93c5fd', opacity: norma?.id ? 1 : 0.5 }}
              >
                <Save size={10} /> Gravar
              </button>
            ) : undefined}
          >
            {avisoSalvo && <p className="text-[9px] mb-1.5" style={{ color: '#4ade80' }}>{avisoSalvo}</p>}

            {/* Confiança */}
            {diag.confianca && (
              <div className="rounded px-2 py-1.5 mb-2" style={{ background: '#08182b', border: '1px solid #122c4d' }}>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold" style={{ color: '#e2e8f0' }}>Confiança</span>
                  <span className="text-[13px] font-bold" style={{ color: COR_ESTADO_CONFIANCA[diag.confianca.faixa] }}>
                    {Math.round(diag.confianca.valor)}
                  </span>
                  <span className="text-[9px]" style={{ color: COR_ESTADO_CONFIANCA[diag.confianca.faixa] }}>{diag.confianca.rotulo}</span>
                </div>
                <div className="text-[9px] mt-0.5" style={{ color: '#94a3b8' }}>{diag.confianca.justificativa}</div>
                <div className="text-[9px] mt-0.5" style={{ color: '#64748b' }}>
                  Gargalo: <strong style={{ color: '#cbd5e1' }}>{diag.confianca.gargalo.nome}</strong> ({Math.round(diag.confianca.gargalo.escore)}/100)
                </div>
              </div>
            )}

            {/* Números globais */}
            <div className="grid grid-cols-3 gap-1 mb-2">
              <Numero rotulo="IBN" valor={diag.dris ? fmt(diag.dris.ibn, 1) : '—'} />
              <Numero rotulo="IBNm" valor={diag.dris ? fmt(diag.dris.ibnm, 2) : '—'} />
              <Numero rotulo="CND-r²" valor={diag.cnd ? fmt(diag.cnd.r2, 1) : '—'} />
            </div>

            {/* Barras dos índices */}
            {diag.dris ? (
              <>
                <div className="text-[9px] mb-0.5" style={{ color: '#94a3b8' }}>
                  Índices DRIS ({ROTULO_FUNCAO[diag.funcao].split('—')[0].trim()}) — do mais limitante ao mais em excesso:
                </div>
                <BarrasIndices barras={barras} descricao="Índices DRIS por nutriente, zero no centro" />
                <div className="flex flex-wrap gap-1.5 mt-1 mb-2">
                  {(['p', 'pz', 'z', 'zp', 'e'] as const).map(c => (
                    <span key={c} className="text-[8px] flex items-center gap-1" style={{ color: '#94a3b8' }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: COR_CLASSE_PRA[c], display: 'inline-block' }} />
                      {ROTULO_CLASSE_PRA[c].split('—')[0].trim()}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <div className="mb-2"><SemResultado metodo="dris" motivo={diag.drisMotivo} /></div>
            )}

            {/* Semáforo por método */}
            <div className="text-[9px] mb-1" style={{ color: '#94a3b8' }}>Semáforo por método:</div>
            <div className="space-y-1 mb-2">
              {METODOS.map(m => {
                const temVoto = diag.consenso.some(c => c.porMetodo[m] != null);
                if (!temVoto) {
                  const motivo = m === 'dris' ? diag.drisMotivo : m === 'cnd' ? diag.cndMotivo : m === 'faixa' ? diag.faixaMotivo : diag.chanceMotivo;
                  return <SemResultado key={m} metodo={m} motivo={motivo} />;
                }
                return (
                  <div key={m} className="flex items-center gap-1 flex-wrap">
                    <span className="text-[9px] font-bold w-14" style={{ color: '#cbd5e1' }}>
                      {m === 'faixa' ? 'Faixa' : ROTULO_METODO[m]}
                    </span>
                    {diag.consenso.map(c => {
                      const e = c.porMetodo[m];
                      return (
                        <span
                          key={c.nutriente}
                          title={e ? `${c.nutriente}: ${ROTULO_ESTADO[e]}` : `${c.nutriente}: sem opinião deste método`}
                          className="text-[8px] font-bold rounded px-1 py-0.5"
                          style={{ background: e ? COR_ESTADO[e] : COR_NEUTRA, color: e ? '#04121f' : '#475569' }}
                        >
                          {c.nutriente}
                        </span>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Radar */}
            {radar.length >= 3 && (
              <>
                <div className="text-[9px] mb-0.5" style={{ color: '#94a3b8' }}>
                  Radar de balanço ({radarEhCnd ? 'IZ do CND' : 'índices DRIS'}):
                </div>
                <RadarBalanco pontos={radar} cor={radarEhCnd ? '#a78bfa' : '#38bdf8'} />
              </>
            )}
          </Bloco>

          {/* Matriz de concordância */}
          <Bloco titulo="Matriz de concordância" icone={<Info size={12} style={{ color: '#93c5fd' }} />}>
            <p className="text-[9px] mb-1" style={{ color: '#64748b' }}>
              Onde os quatro métodos concordam, a evidência é forte. Onde discordam, a coluna <strong>Consenso</strong> declara o empate em vez de escolher um vencedor. Traço = o método não opinou sobre aquele nutriente.
            </p>
            <MatrizConcordancia dados={matriz} />
            <div className="flex flex-wrap gap-2 mt-1">
              {(['deficiente', 'adequado', 'excessivo'] as EstadoNutricional[]).map(e => (
                <span key={e} className="text-[8px] flex items-center gap-1" style={{ color: '#94a3b8' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: COR_ESTADO[e], display: 'inline-block' }} />
                  {ROTULO_ESTADO[e]}
                </span>
              ))}
            </div>
            {/* Motivos dos métodos que não rodaram — nunca célula muda (ledger 17). */}
            <div className="space-y-1 mt-2">
              {!diag.cnd && <SemResultado metodo="cnd" motivo={diag.cndMotivo} />}
              {!diag.faixa && <SemResultado metodo="faixa" motivo={diag.faixaMotivo} />}
              {!diag.chance && <SemResultado metodo="chance" motivo={diag.chanceMotivo} />}
            </div>
          </Bloco>

          {/* Limitações do método (ledger 37) */}
          <Recolhivel
            titulo="Limitações do método"
            aberto={limitacoesAbertas}
            alternar={() => setLimitacoesAbertas(v => !v)}
            cor="#fbbf24"
          >
            <ul className="space-y-1">
              {LIMITACOES_FIXAS.map((t, i) => (
                <li key={i} className="text-[9px] flex items-start gap-1" style={{ color: '#94a3b8' }}>
                  <span style={{ color: '#fbbf24' }}>•</span> {t}
                </li>
              ))}
              {AVISOS_METODO.map((t, i) => (
                <li key={`m${i}`} className="text-[9px] flex items-start gap-1" style={{ color: '#64748b' }}>
                  <span style={{ color: '#475569' }}>•</span> {t}
                </li>
              ))}
            </ul>
          </Recolhivel>

          {!!ressalvas.length && (
            <Recolhivel
              titulo={`Ressalvas desta diagnose (${ressalvas.length})`}
              aberto={ressalvasAbertas}
              alternar={() => setRessalvasAbertas(v => !v)}
              cor="#fbbf24"
            >
              <ul className="space-y-1">
                {ressalvas.map((t, i) => (
                  <li key={i} className="text-[9px] flex items-start gap-1" style={{ color: '#94a3b8' }}>
                    <span style={{ color: '#fbbf24' }}>•</span> {t}
                  </li>
                ))}
              </ul>
            </Recolhivel>
          )}
        </>
      )}

      {/* Histórico entre safras (ledger 32) */}
      <Bloco titulo="Histórico entre safras" icone={<Info size={12} style={{ color: '#93c5fd' }} />}>
        {!historico.length ? (
          <p className="text-[9px]" style={{ color: '#64748b' }}>
            Nenhuma diagnose gravada neste talhão. Grave a diagnose de uma amostra para ela entrar no histórico — o que aparece aqui é o resultado CONGELADO, com a norma usada naquele ano.
          </p>
        ) : (
          <>
            <div className="space-y-1 mb-2">
              {historico.map(h => (
                <div key={h.safra} className="flex items-center gap-1.5 rounded px-2 py-1" style={{ background: '#08182b', border: '1px solid #122c4d' }}>
                  <span className="text-[10px] font-bold w-14" style={{ color: '#e2e8f0' }}>{rotuloAno(h.safra) || h.safra}</span>
                  <span className="text-[9px] w-20" style={{ color: '#cbd5e1' }}>
                    IBN {h.ibn != null ? fmt(h.ibn, 1) : '—'}
                  </span>
                  {h.limitante ? (
                    <span className="text-[9px] font-bold rounded px-1 py-0.5" style={{ background: h.classe ? COR_CLASSE_PRA[h.classe] : COR_NEUTRA, color: '#04121f' }}>
                      {h.limitante}
                    </span>
                  ) : (
                    <span className="text-[9px]" style={{ color: '#64748b' }}>sem ordem de limitação</span>
                  )}
                  <span className="flex-1 text-[8px] truncate" style={{ color: '#64748b' }}>
                    {h.classe ? ROTULO_CLASSE_PRA[h.classe].split('—')[0].trim() : (h.ibnMotivo ?? '')}
                  </span>
                </div>
              ))}
            </div>
            <div className="text-[9px] mb-0.5" style={{ color: '#94a3b8' }}>IBN por safra (quanto menor, mais equilibrada a lavoura):</div>
            <LinhaIbn pontos={pontosIbn} descricao="IBN por safra" />
          </>
        )}
      </Bloco>

      {/* Mapa por zona/célula (ledger 33) */}
      {!!porArea.size && (
        <Bloco
          titulo="Mapa por zona"
          icone={<MapIcon size={12} style={{ color: '#93c5fd' }} />}
          direita={
            <button
              onClick={() => setMapaLigado(v => !v)}
              className="px-2 py-1 rounded text-[10px] font-bold"
              style={{ background: mapaLigado ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: mapaLigado ? '#fff' : '#94a3b8' }}
            >
              {mapaLigado ? 'No mapa' : 'Oculto'}
            </button>
          }
        >
          <div className="flex gap-1 mb-1.5">
            {([['limitante', 'Nutriente mais limitante'], ['ibn', 'IBN (desequilíbrio)']] as const).map(([v, label]) => (
              <button key={v} onClick={() => setModoCor(v)} className="flex-1 py-1.5 rounded text-[9px] font-bold"
                style={{ background: modoCor === v ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: modoCor === v ? '#fff' : '#94a3b8' }}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {modoCor === 'limitante'
              ? [...new Set([...porArea.values()].map(v => v.limitante).filter((n): n is NutrienteId => !!n))].map(n => (
                <span key={n} className="text-[8px] flex items-center gap-1" style={{ color: '#94a3b8' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: COR_NUTRIENTE[n], display: 'inline-block' }} />
                  {n} — {nutrientePorId(n).nome}
                </span>
              ))
              : RAMPA_IBN.map((c, i) => (
                <span key={c} className="text-[8px] flex items-center gap-1" style={{ color: '#94a3b8' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: c, display: 'inline-block' }} />
                  {i === 0 ? 'equilibrado' : i === RAMPA_IBN.length - 1 ? 'desequilibrado' : ''}
                </span>
              ))}
          </div>
          <p className="text-[8px] mt-1.5" style={{ color: '#64748b' }}>
            {areaEhCelula ? 'Células da grade de amostragem composta' : 'Zonas de manejo do talhão'} · {porArea.size} com laudo foliar de {areas.length} no total. Área em cinza = sem amostra.
          </p>
        </Bloco>
      )}
    </div>
  );
}

// ── Auxiliares de render ────────────────────────────────────────────────────

const COR_ESTADO_CONFIANCA: Record<string, string> = {
  otimo: '#22c55e', bom: '#84cc16', regular: '#eab308', ruim: '#ef4444',
};

/**
 * As quatro limitações que viajam com TODO resultado (ledger 37). Ficam aqui em
 * forma curta, ao lado dos avisos longos do núcleo (`AVISOS_METODO`): o
 * agrônomo lê estas quatro em cinco segundos, e o texto completo logo abaixo.
 */
const LIMITACOES_FIXAS: string[] = [
  'Os índices DRIS somam zero por construção — a soma é uma identidade matemática, não uma medida da planta.',
  'Um nutriente "em excesso" pode ser artefato da deficiência de outro, e não excesso real no tecido.',
  'Norma REGIONAL e norma UNIVERSAL dão diagnósticos diferentes para o mesmo laudo. Prefira a norma da sua região ou gerada com os seus dados.',
  'Trifólio COM e SEM pecíolo não são intercambiáveis: N, P, B, Fe, Mn e Zn são maiores sem pecíolo e o K é menor.',
];

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded px-2 py-1" style={{ background: '#08182b', border: '1px solid #122c4d' }}>
      <div className="text-[8px]" style={{ color: '#64748b' }}>{rotulo}</div>
      <div className="text-[12px] font-bold" style={{ color: '#e2e8f0' }}>{valor}</div>
    </div>
  );
}
