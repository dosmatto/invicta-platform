'use client';

// Painel do Produtor — a tela inicial do /portal.
//
// A pergunta que ela responde é uma só: "o que a Invicta já processou nos meus
// talhões este ano?". Números no topo, o mapa dos talhões colorido pelo
// andamento do ciclo, a área amostrada ano a ano, a evolução dos nutrientes do
// talhão que ele escolher, a colheita e — por fazenda — a JORNADA de cada
// talhão (amostragem → laudo → mapas → recomendação → aplicação), com atalho
// para a aba certa da página do talhão. Tudo somente leitura.
//
// A regra do que está pronto é de lib/portalProdutor.ts (puro, testado);
// a coleta é de lib/portalDados.ts. Aqui é só tela.

import { useCallback, useEffect, useMemo, useState, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import type { LucideIcon } from 'lucide-react';
import {
  LogOut, ChevronRight, ChevronDown, Check, Clock, Lock, Layers, Mountain, Zap, Satellite,
  BarChart3, Activity, FileText, User, ArrowLeft, Loader2, Sprout,
  Ruler, LayoutGrid, FlaskConical, Map as MapIcon, ClipboardList, FileDown, Search, ChevronUp, Eye,
} from 'lucide-react';
import { getClientes, getFazendas, getTalhoes, getSafras, getLegendasPorAtributo, type Cliente } from '@/lib/store';
import { getUsuarios } from '@/lib/iam/usuarios';
import { classeDoValor } from '@/lib/legendas';
import { rotuloAno, anoDaSafra } from '@/lib/periodo';
import { fmtHa } from '@/lib/formato';
import { logout, emailUsuario } from '@/lib/auth';
import { ROTULO_PAPEL, SECOES_PORTAL, type PlanoAssinatura, type PapelMembro } from '@/lib/empresa';
import { usarDadosSupabase } from '@/lib/supabaseData';
import { APP_VERSION } from '@/constants/version';
import { dadosLocaisDoTalhao, dadosNuvemDosTalhoes, juntarNuvem, type DadosNuvem } from '@/lib/portalDados';
import {
  avaliarTalhao, resumirPortal, areaAmostradaPorAno, evolucaoNutrientes, rankingColheita, linhaDoTempo,
  projetarTalhoes, estadoEtapa, etapaDef, fmtDataCurta, ETAPAS_CICLO, NUTRIENTES_EVOLUCAO,
  type AvaliacaoTalhao, type EtapaId, type Situacao, type SituacaoCiclo,
} from '@/lib/portalProdutor';
import { MosaicoTalhoes, BarrasAno, Rosca, LinhaEvolucao, PontosEixo, COR, COR_CICLO } from './GraficosPortal';

const COR_SIT: Record<Situacao, string> = { pronto: COR.verde, andamento: COR.ambar, pendente: COR.mudo };
const ROTULO_CICLO: Record<SituacaoCiclo, string> = { completo: 'Ciclo completo', andamento: 'Em andamento', 'sem-dado': 'Sem trabalho no ano' };

// Colunas da tabela de talhões (cabeçalho e linhas usam a mesma régua).
// (com o prefixo md: escrito por extenso: o Tailwind só gera a classe que encontra literal no fonte)
const GRADE_TALHAO = 'md:grid-cols-[minmax(140px,1fr)_minmax(500px,3fr)_minmax(200px,1.2fr)_minmax(180px,1.1fr)_90px]';
const cartao = { background: 'var(--bg-surface)', border: '1px solid var(--border-color)' } as const;
const fmtInt = (v: number) => Math.round(v).toLocaleString('pt-BR');
const talhoesTxt = (n: number) => `${n} ${n === 1 ? 'talhão' : 'talhões'}`;
// Cadastro em CAIXA ALTA vira "Campos Gerais" (com `capitalize` no CSS); o resto fica como está.
const nomeLegivel = (nome: string) => (nome === nome.toUpperCase() ? nome.toLowerCase() : nome);
const primeiroNome = (nome: string) => { const p = nome.trim().split(/\s+/)[0] ?? ''; return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(); };

// Camadas fora do ciclo que aparecem como selos na linha do talhão.
const EXTRAS: Array<{ id: EtapaId; icone: LucideIcon }> = [
  { id: 'zonas', icone: Layers }, { id: 'altimetria', icone: Mountain }, { id: 'condutividade', icone: Zap },
  { id: 'ndvi', icone: Satellite }, { id: 'produtividade', icone: BarChart3 }, { id: 'compactacao', icone: Activity },
  { id: 'relatorios', icone: FileText },
];

export function PainelProdutor({ cliente, plano, papel, preview }: {
  cliente: Cliente;
  plano: PlanoAssinatura | null;
  papel: PapelMembro | null;
  /** Owner/admin (ou a bancada local) vendo o portal como o produtor veria. */
  preview?: boolean;
}) {
  const router = useRouter();
  const safras = useMemo(() => getSafras(), []);
  const [safra, setSafra] = useState(() => safras.find(s => s.ativa)?.nome ?? safras[0]?.nome ?? '');
  const [nuvem, setNuvem] = useState<{ chave: string; dados: DadosNuvem } | null>(null);
  const [talhaoEscolhido, setTalhaoEscolhido] = useState('');

  // O produtor vê TODAS as fazendas do escopo dele — inclusive a que não está
  // no nome dele mas foi vinculada (condomínio). No preview o owner/admin
  // enxerga tudo, então ali vale o cadastro do produtor escolhido.
  const fazendas = useMemo(() => preview ? getFazendas(cliente.id) : getFazendas(), [cliente.id, preview]);
  const donos = useMemo(() => new Map(getClientes().map(c => [c.id, c.nome])), []);
  const talhoes = useMemo(() => fazendas.flatMap(f => getTalhoes(f.id)), [fazendas]);

  // Nuvem (mapas, cenários, relatórios): chega depois e completa a tela. O
  // resultado guarda para QUAIS talhões veio; se a lista mudou, conta como
  // "ainda carregando" sem precisar zerar o estado dentro do efeito.
  const chaveTalhoes = useMemo(() => talhoes.map(t => t.id).join('|'), [talhoes]);
  useEffect(() => {
    let vivo = true;
    dadosNuvemDosTalhoes(talhoes.map(t => t.id))
      .then(n => { if (vivo) setNuvem({ chave: chaveTalhoes, dados: n }); })
      .catch(() => { if (vivo) setNuvem({ chave: chaveTalhoes, dados: { mapasNuvem: {}, cenarios: {}, relatorios: {} } }); });
    return () => { vivo = false; };
  }, [talhoes, chaveTalhoes]);
  const nuvemAtual = nuvem && nuvem.chave === chaveTalhoes ? nuvem.dados : null;
  const sincronizando = nuvemAtual === null && usarDadosSupabase();

  const locais = useMemo(() => talhoes.map(t => dadosLocaisDoTalhao(t, safra)), [talhoes, safra]);
  const dados = useMemo(() => locais.map(d => juntarNuvem(d, nuvemAtual)), [locais, nuvemAtual]);
  const avs = useMemo(() => dados.map(d => avaliarTalhao(d, safra)), [dados, safra]);
  const resumo = useMemo(() => resumirPortal(avs), [avs]);
  // Quanto do ciclo do ano já foi feito, somando as etapas de todos os talhões:
  // é o que o anel mostra, e o número no centro é a mesma conta.
  const ciclo = useMemo(() => {
    const feitas = avs.reduce((s, a) => s + a.ciclo.feitas, 0);
    const total = avs.reduce((s, a) => s + a.ciclo.total, 0);
    return { feitas, total, pct: total > 0 ? Math.round((feitas / total) * 100) : 0 };
  }, [avs]);
  const porEtapa = useMemo(() => {
    const m = {} as Record<EtapaId, { prontos: number; andamento: number; area: number }>;
    for (const e of resumo.porEtapa) m[e.id] = e;
    return m;
  }, [resumo]);
  const anoSel = anoDaSafra(safra);
  const anosSafras = useMemo(() => safras.map(s => anoDaSafra(s.nome)).filter((a): a is number => a != null), [safras]);
  const serieAnos = useMemo(() => areaAmostradaPorAno(dados, anosSafras).slice(-6), [dados, anosSafras]);
  const ranking = useMemo(() => rankingColheita(avs).slice(0, 8), [avs]);
  // Cultura repetida em toda linha vira ruído: se é uma só, vai para o subtítulo.
  const culturaUnica = useMemo(() => { const c = new Set(ranking.map(r => r.cultura).filter(Boolean)); return c.size === 1 ? [...c][0] : null; }, [ranking]);
  const eventos = useMemo(() => linhaDoTempo(avs, 12), [avs]);
  const [verTudo, setVerTudo] = useState(false);
  // Mosaico: cada talhão desenhado na própria célula (forma real, tamanho
  // normalizado), agrupado por fazenda. Em vez de um mapa onde fazendas a
  // quilômetros uma da outra viram pontinhos, uma grade que se lê como lista.
  const mosaico = useMemo(() => fazendas.map(f => ({
    fazenda: f,
    itens: talhoes.filter(t => t.fazendaId === f.id).flatMap(t => {
      const p = projetarTalhoes([t], 100, 72, 4);
      return p.formas[0] ? [{ id: t.id, nome: t.nome, areaHa: t.areaHa, d: p.formas[0].d, viewBox: p.viewBox }] : [];
    }),
  })).filter(g => g.itens.length > 0), [fazendas, talhoes]);
  const semGeometria = talhoes.length - mosaico.reduce((n, g) => n + g.itens.length, 0);
  const mediaColheita = useMemo(() => ranking.length ? ranking.reduce((s, r) => s + r.mediaScHa, 0) / ranking.length : 0, [ranking]);
  // Busca, filtro por situação e fazendas recolhidas: para carteiras grandes
  // a lista não vira paredão.
  const [busca, setBusca] = useState('');
  const [filtroSit, setFiltroSit] = useState<'todos' | SituacaoCiclo>('todos');
  const [recolhidas, setRecolhidas] = useState<Set<string>>(() => new Set());
  const [expandidas, setExpandidas] = useState<Set<string>>(() => new Set());
  const alternar = (set: Dispatch<SetStateAction<Set<string>>>, id: string) =>
    set(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  // A situação que se repete na maioria dos talhões (da página inteira) vira
  // texto puro; o selo pastel fica para a que diverge — uma string, uma cara.
  const comum = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const a of avs) { const k = situacaoCurta(a).texto; contagem.set(k, (contagem.get(k) ?? 0) + 1); }
    const [top] = [...contagem.entries()].sort((x, y) => y[1] - x[1]);
    return avs.length >= 3 && top && top[1] > avs.length / 2 ? top[0] : null;
  }, [avs]);
  const situacaoPorId = useMemo(() => Object.fromEntries(avs.map(a => [a.talhaoId, a.ciclo.situacao])), [avs]);
  const avPorId = useMemo(() => new Map(avs.map(a => [a.talhaoId, a])), [avs]);

  // Evolução de nutrientes: começa pelo talhão com mais laudos.
  const talhoesComLaudo = useMemo(
    () => dados.filter(d => (d.laudos?.length ?? 0) > 0).sort((a, b) => (b.laudos?.length ?? 0) - (a.laudos?.length ?? 0)),
    [dados]);
  const talhaoSel = talhaoEscolhido && talhoes.some(t => t.id === talhaoEscolhido)
    ? talhaoEscolhido
    : (talhoesComLaudo[0]?.talhao.id ?? talhoes[0]?.id ?? '');
  const evolucao = useMemo(() => evolucaoNutrientes(dados.find(d => d.talhao.id === talhaoSel)?.laudos ?? []), [dados, talhaoSel]);
  const classeDe = useCallback((nut: string, v: number | null) => {
    if (v == null) return null;
    const leg = getLegendasPorAtributo(nut)[0];
    return leg ? classeDoValor(v, leg.classes) ?? null : null;
  }, []);

  const nomeAgronomo = useMemo(() => {
    const us = getUsuarios();
    return (email?: string) => (email ? (us.find(u => u.email === email)?.nome || email) : null);
  }, []);

  const liberada = useCallback((id: EtapaId) => {
    const def = etapaDef(id);
    if (!def.secao) return false;
    if (preview && !plano) return true;
    return !!plano?.secoes?.[def.secao];
  }, [plano, preview]);

  const abrir = useCallback((id: string, aba?: string | null) => {
    const q = new URLSearchParams();
    if (aba) q.set('aba', aba);
    if (safra) q.set('safra', safra);
    const qs = q.toString();
    router.push(`/talhao/${id}${qs ? `?${qs}` : ''}`);
  }, [router, safra]);

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-app)', color: COR.texto }}>
      {/* Cabeçalho — a barra azul da marca, como no resto da plataforma */}
      <header className="flex items-center justify-between px-5 py-3" style={{ background: 'var(--invicta-blue)', borderBottom: '1px solid var(--invicta-blue-dark)' }}>
        <div className="flex items-center gap-3">
          <Image src="/images/logo-branca.png" alt="Invicta" width={128} height={48} priority className="h-12 w-auto" style={{ objectFit: 'contain' }} />
          <span className="text-sm font-semibold hidden sm:inline" style={{ color: 'var(--sidebar-text)' }}>Portal do produtor</span>
        </div>
        <div className="flex items-center gap-3">
          {!preview && (
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold capitalize" style={{ color: 'var(--sidebar-text-active)' }}>{nomeLegivel(cliente.nome)}</p>
              <p className="text-xs" style={{ color: 'var(--sidebar-text)' }}>
                {emailUsuario()}{papel ? ` · ${ROTULO_PAPEL[papel]}` : ''}{plano ? ` · ${plano.nome}` : ''}
              </p>
            </div>
          )}
          {preview ? (
            <button onClick={() => router.push('/painel')} title="Voltar ao painel" className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-bold"
              style={{ background: 'var(--bg-surface)', color: 'var(--invicta-blue)' }}>
              <ArrowLeft size={14} /> Painel
            </button>
          ) : (
            <button onClick={() => logout()} title="Sair" className="p-1.5 rounded hover:opacity-80" style={{ color: 'var(--sidebar-text)' }}>
              <LogOut size={16} />
            </button>
          )}
        </div>
      </header>

      <main className="max-w-[1240px] mx-auto px-4 sm:px-6 py-6 space-y-6">
        {preview && (
          <div className="rounded-lg px-4 py-2 text-sm flex items-center gap-2" style={{ background: 'var(--status-info-bg)', color: 'var(--status-info)', border: '1px solid color-mix(in srgb, var(--status-info) 25%, var(--bg-surface))' }}>
            <Eye size={16} className="flex-shrink-0" />
            <span>Você está vendo o portal como <strong className="capitalize">{nomeLegivel(cliente.nome)}</strong> veria{plano ? `, no plano ${plano.nome}` : ', com todas as seções liberadas'}.</span>
          </div>
        )}
        {/* Saudação + ano */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: COR.texto }}>Olá, {primeiroNome(cliente.nome)} 👋</h1>
            <p className="text-sm mt-1" style={{ color: COR.texto2 }}>
              O que a Invicta já processou nos seus talhões em <strong style={{ color: COR.texto }}>{rotuloAno(safra)}</strong>.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm flex items-center gap-1.5" style={{ color: COR.texto2 }}>
              {sincronizando ? <><Loader2 size={12} className="animate-spin" /> sincronizando com a nuvem…</> : <><Clock size={12} /> atualizado em {fmtDataCurta(resumo.atualizadoEm)}</>}
            </span>
            {safras.length > 0 && (
              <Seletor valor={safra} onChange={setSafra} opcoes={safras.map(s => ({ valor: s.nome, rotulo: `Ano ${rotuloAno(s.nome)}` }))} />
            )}
          </div>
        </div>

        {fazendas.length === 0 ? (
          <Vazio titulo="Nenhuma fazenda cadastrada ainda." texto="Assim que a Invicta cadastrar suas fazendas e talhões, eles aparecem aqui." />
        ) : (
          <>
            {/* KPIs + andamento do ciclo (o "alvo do mês" da referência, à direita) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:items-start">
              <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 content-start">
                <Kpi icone={Ruler} rotulo="Área amostrada no ano" valor={fmtInt(resumo.areaAmostrada)} unidade="ha" sub={`${resumo.pctAmostrada}% da área`} zero="sem grade no ano" />
                <Kpi icone={LayoutGrid} rotulo="Talhões" valor={resumo.nTalhoes} sub={`em ${resumo.nFazendas} ${resumo.nFazendas === 1 ? 'fazenda' : 'fazendas'}`} zero="nenhum cadastrado" />
                <Kpi icone={FlaskConical} rotulo="Análises de solo" valor={resumo.nLaudos} sub={`${fmtInt(resumo.nAmostras)} amostras`} zero="sem laudo no ano" />
                <Kpi icone={MapIcon} rotulo="Mapas de fertilidade" valor={resumo.nMapas} sub={`${talhoesTxt(porEtapa.fertilidade.prontos)}`} zero="em preparo" tom="entrega" />
                <Kpi icone={ClipboardList} rotulo="Recomendações" valor={resumo.nCenarios} sub={`${porEtapa.recomendacoes.prontos} com dose para uso`} zero="em preparo" tom="entrega" />
                <Kpi icone={FileDown} rotulo="Arquivos de aplicação" valor={resumo.nArquivos} sub={`${talhoesTxt(porEtapa.prescricoes.prontos)}`} zero="em preparo" tom="entrega" />
              </div>
              <Cartao className="lg:col-span-4" titulo="Andamento do ciclo" sub="Quanto do ciclo do ano já foi feito nos seus talhões.">
                <div className="flex flex-col items-center justify-center gap-5 h-full">
                  <Rosca
                    partes={[
                      { rotulo: 'Etapas feitas', valor: ciclo.feitas, cor: COR.verde, arredondar: true },
                      { rotulo: 'Etapas por fazer', valor: Math.max(0, ciclo.total - ciclo.feitas), cor: COR.borda },
                    ]}
                    centro={`${ciclo.pct}%`} sub="do ciclo feito" tamanho={200} />
                  <p className="text-sm text-center" style={{ color: COR.texto2 }}>
                    {ciclo.feitas} de {ciclo.total} etapas feitas em {talhoesTxt(resumo.nTalhoes)}
                  </p>
                  <div className="w-full pt-4" style={{ borderTop: '1px solid var(--border-color)' }}>
                    <p className="text-xs mb-2" style={{ color: COR.texto2 }}>Talhões por estado</p>
                    <ul className="space-y-2 text-sm">
                      <ItemLegenda cor={COR_CICLO.completo} rotulo="Ciclo completo" valor={`${talhoesTxt(resumo.ciclo.completo)} · ${fmtInt(resumo.ciclo.areaCompleta)} ha`} zero={resumo.ciclo.completo === 0} />
                      <ItemLegenda cor={COR_CICLO.andamento} rotulo="Em andamento" valor={`${talhoesTxt(resumo.ciclo.andamento)} · ${fmtInt(resumo.ciclo.areaAndamento)} ha`} zero={resumo.ciclo.andamento === 0} />
                      <ItemLegenda cor={COR_CICLO['sem-dado']} rotulo="Sem trabalho no ano" valor={`${talhoesTxt(resumo.ciclo.semDado)} · ${fmtInt(resumo.ciclo.areaSemDado)} ha`} zero={resumo.ciclo.semDado === 0} />
                    </ul>
                  </div>
                </div>
              </Cartao>
            </div>

            {/* Mapa · área por ano */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:items-start">
              <Cartao className="lg:col-span-8" titulo="Seus talhões" sub="A forma de cada talhão, na cor do andamento do ciclo neste ano."
                rodape={<LegendaCiclo contagens={{ completo: resumo.ciclo.completo, andamento: resumo.ciclo.andamento, 'sem-dado': resumo.ciclo.semDado }} />}>
                {mosaico.length === 0 ? (
                  <p className="text-sm py-8 text-center" style={{ color: COR.texto2 }}>Os talhões ainda não têm limite desenhado.</p>
                ) : (
                  <div className="space-y-5">
                    {mosaico.map(g => (
                      <div key={g.fazenda.id}>
                        {mosaico.length > 1 && <p className="text-sm font-semibold mb-3" style={{ color: COR.texto }}>{g.fazenda.nome}</p>}
                        <MosaicoTalhoes itens={g.itens} situacao={situacaoPorId} onAbrir={id => abrir(id)} />
                      </div>
                    ))}
                    {semGeometria > 0 && <p className="text-xs" style={{ color: COR.texto2 }}>{talhoesTxt(semGeometria)} sem limite desenhado não aparecem aqui.</p>}
                  </div>
                )}
              </Cartao>
              <Cartao className="lg:col-span-4" titulo="Área amostrada por ano" sub="Hectares com grade de amostragem em cada ano." faixa
                rodape={(
                  <dl className="grid grid-cols-3 text-center">
                    {[['Área total', `${fmtInt(resumo.areaTotal)} ha`], ['Talhões', `${porEtapa.amostragem.prontos} de ${resumo.nTalhoes}`], ['Cobertura', `${resumo.pctAmostrada}%`]].map(([k, v], i) => (
                      <div key={k} style={{ borderLeft: i ? '1px solid var(--border-color)' : undefined }}>
                        <dt className="text-xs" style={{ color: COR.texto2 }}>{k}</dt>
                        <dd className="text-lg font-semibold tabular-nums mt-0.5" style={{ color: COR.texto }}>{v}</dd>
                      </div>
                    ))}
                  </dl>
                )}>
                <p className="flex items-baseline gap-2 mb-3">
                  <span className="text-4xl font-bold tabular-nums tracking-tight" style={{ color: COR.texto }}>{fmtInt(resumo.areaAmostrada)}</span>
                  <span className="text-sm" style={{ color: COR.texto2 }}>ha amostrados em {rotuloAno(safra)}</span>
                </p>
                <BarrasAno serie={serieAnos} anoSel={anoSel} onAno={ano => { const s = safras.find(x => anoDaSafra(x.nome) === ano); if (s) setSafra(s.nome); }} />
              </Cartao>
            </div>

            {/* Evolução dos nutrientes · colheita */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:items-start">
              <Cartao className="lg:col-span-8" titulo="Evolução dos nutrientes"
                sub={`Camada ${evolucao.profundidade ?? '—'} cm · média das amostras de cada ano, com a classe dos seus mapas.`}
                acao={talhoes.length > 0 && (
                  <Seletor valor={talhaoSel} onChange={setTalhaoEscolhido} opcoes={talhoes.map(t => ({ valor: t.id, rotulo: t.nome }))} />
                )}>
                {evolucao.pontos.length === 0 ? (
                  <p className="text-sm py-8 text-center" style={{ color: COR.texto2 }}>Este talhão ainda não tem análise de solo importada.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      {NUTRIENTES_EVOLUCAO.map(n => {
                        const ultimo = [...evolucao.pontos].reverse().find(p => p.valores[n.id] != null);
                        const classe = classeDe(n.id, ultimo?.valores[n.id] ?? null);
                        const cor = classe?.corFim ?? classe?.corBase ?? COR.azul;
                        return (
                          <div key={n.id} className="min-w-0">
                            <div className="h-12 flex flex-col justify-between">
                              <p className="text-sm font-bold leading-tight truncate" style={{ color: COR.texto }}>
                                {n.rotulo}{n.unidade && !n.rotulo.includes('%') && <span className="font-normal text-xs" style={{ color: COR.texto2 }}> {n.unidade}</span>}
                              </p>
                              {classe ? (
                                <span className="self-start inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                                  style={{ background: 'var(--bg-surface-hover)', color: COR.texto }}>
                                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cor }} />{classe.nome}
                                </span>
                              ) : <span className="h-5" />}
                            </div>
                            <LinhaEvolucao pontos={evolucao.pontos.map(p => ({ ano: p.ano, valor: p.valores[n.id] ?? null }))} cor={cor} unidade={n.unidade} casas={n.id === 'ph' || n.id === 'k' ? 2 : 1} />
                          </div>
                        );
                      })}
                    </div>
                    {evolucao.pontos.length === 1 && (
                      <p className="text-xs mt-3" style={{ color: COR.texto2 }}>Com o próximo ano de análise, a linha mostra a tendência.</p>
                    )}
                  </>
                )}
              </Cartao>
              <Cartao className="lg:col-span-4" titulo={`Colheita ${rotuloAno(safra)}`}
                sub={`Média do mapa de colheita${culturaUnica ? ` · ${culturaUnica}` : ''}, em sacas por hectare.`}>
                {ranking.length === 0 ? (
                  <p className="text-sm py-8 text-center" style={{ color: COR.texto2 }}>Sem mapa de colheita processado neste ano.</p>
                ) : (
                  <>
                    <p className="flex items-baseline gap-2 mb-3">
                      <span className="text-4xl font-bold tabular-nums tracking-tight" style={{ color: COR.texto }}>{mediaColheita.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
                      <span className="text-sm" style={{ color: COR.texto2 }}>sc/ha · média de {talhoesTxt(ranking.length)}</span>
                    </p>
                    <PontosEixo cor={COR.verde} onAbrir={id => abrir(id)}
                      itens={ranking.map(r => ({ id: r.talhaoId, rotulo: r.nome, sub: culturaUnica ? undefined : (r.cultura || undefined), valor: r.mediaScHa }))} />
                  </>
                )}
              </Cartao>
            </div>

            {/* Fazendas → talhões */}
            <Cartao titulo="Talhões por fazenda" sub="A jornada do ano de cada talhão. Clique numa etapa para abrir a aba certa."
              acao={(
              <div className="flex flex-wrap items-center gap-2">
                <label className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: COR.texto2 }} />
                  <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar talhão" aria-label="Buscar talhão"
                    className="h-9 pl-9 pr-3 rounded-lg text-sm outline-none w-44"
                    style={{ background: 'var(--bg-surface)', color: COR.texto, border: '1px solid var(--border-color)' }} />
                </label>
                <div className="flex items-center gap-1 rounded-lg p-1 h-9" style={{ background: 'var(--bg-surface-hover)', border: '1px solid var(--border-color)' }}>
                  {([['todos', 'Todos', resumo.nTalhoes], ['andamento', 'Em andamento', resumo.ciclo.andamento], ['completo', 'Completos', resumo.ciclo.completo], ['sem-dado', 'Sem trabalho', resumo.ciclo.semDado]] as Array<['todos' | SituacaoCiclo, string, number]>).map(([id, rotulo, n]) => (
                    <button key={id} type="button" onClick={() => setFiltroSit(id)}
                      className="h-7 px-3 rounded-md text-xs font-medium whitespace-nowrap"
                      style={filtroSit === id ? { background: 'var(--bg-surface)', color: COR.texto, boxShadow: '0 1px 2px var(--border-color)' } : { color: COR.texto2 }}>
                      {rotulo} <span className="tabular-nums" style={{ opacity: 0.75 }}>{n}</span>
                    </button>
                  ))}
                </div>
              </div>
            )} />
            {fazendas.map(f => {
              const todos = talhoes.filter(t => t.fazendaId === f.id).map(t => avPorId.get(t.id)).filter((a): a is AvaliacaoTalhao => !!a);
              const termo = busca.trim().toLowerCase();
              const doLote = todos.filter(a => (filtroSit === 'todos' || a.ciclo.situacao === filtroSit) && (!termo || a.nome.toLowerCase().includes(termo)));
              const filtrando = filtroSit !== 'todos' || !!termo;
              if (filtrando && doLote.length === 0) return null;
              const area = todos.reduce((s, a) => s + a.areaHa, 0);
              const agro = nomeAgronomo(f.agronomoResponsavel);
              const recolhida = recolhidas.has(f.id) && !filtrando;
              const LIMITE = 12;
              const mostrarTudo = expandidas.has(f.id) || filtrando;
              const visiveis = mostrarTudo ? doLote : doLote.slice(0, LIMITE);
              return (
                <Cartao key={f.id}>
                  <header className="flex flex-wrap items-start justify-between gap-3">
                    <button type="button" onClick={() => alternar(setRecolhidas, f.id)} className="flex items-start gap-2 min-w-0 text-left" aria-expanded={!recolhida}>
                      <div className="min-w-0">
                        <h2 className="text-lg font-bold leading-tight truncate capitalize" style={{ color: COR.texto }}>{nomeLegivel(f.nome)}</h2>
                        {f.clienteId !== cliente.id && (
                          <span className="inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded-full capitalize" style={{ background: 'var(--status-info-bg)', color: 'var(--status-info)' }}>
                            Acesso compartilhado · {nomeLegivel(donos.get(f.clienteId) ?? 'outro produtor')}
                          </span>
                        )}
                        <p className="text-sm mt-0.5" style={{ color: COR.texto2 }}>
                          {[[f.municipio, f.estado].filter(Boolean).join('/'), talhoesTxt(todos.length), `${fmtHa(area)} ha`].filter(Boolean).join(' · ')}
                          {filtrando && doLote.length !== todos.length ? ` · ${doLote.length} no filtro` : ''}
                        </p>
                      </div>
                      {recolhida ? <ChevronDown size={18} className="mt-1" style={{ color: COR.texto2 }} /> : <ChevronUp size={18} className="mt-1" style={{ color: COR.texto2 }} />}
                    </button>
                    {agro && (
                      <span className="text-sm flex items-center gap-1" style={{ color: COR.texto2 }}>
                        <User size={13} /> Agrônomo responsável: <strong style={{ color: COR.texto }}>{agro}</strong>
                      </span>
                    )}
                  </header>
                  {recolhida ? null : todos.length === 0 ? (
                    <p className="text-sm pt-3" style={{ color: COR.texto2 }}>Sem talhões cadastrados nesta fazenda.</p>
                  ) : (
                    <div className="mt-3">
                      <div className={`hidden md:grid ${GRADE_TALHAO} gap-4 pb-2 text-xs font-medium`} style={{ color: COR.texto2, opacity: 0.85, borderBottom: '1px solid var(--border-color)' }}>
                        <span>Talhão</span>
                        <span className="grid grid-cols-5 text-center text-xs">{ETAPAS_CICLO.map(id => <span key={id}>{etapaDef(id).curto}</span>)}</span>
                        <span>Situação</span>
                        <span>Outras camadas</span><span className="text-right pr-5">Atualizado</span>
                      </div>
                      {visiveis.map((av, i) => <LinhaTalhao key={av.talhaoId} av={av} liberada={liberada} abrir={abrir} comum={comum} ultimo={i === visiveis.length - 1 && visiveis.length === doLote.length} />)}
                      {visiveis.length < doLote.length && (
                        <button type="button" onClick={() => alternar(setExpandidas, f.id)} className="text-sm font-semibold pt-3" style={{ color: COR.azul }}>
                          Ver os {doLote.length - visiveis.length} restantes
                        </button>
                      )}
                    </div>
                  )}
                </Cartao>
              );
            })}
            {(busca.trim() || filtroSit !== 'todos') && !avs.some(a => (filtroSit === 'todos' || a.ciclo.situacao === filtroSit) && (!busca.trim() || a.nome.toLowerCase().includes(busca.trim().toLowerCase()))) && (
              <p className="text-sm py-4 text-center" style={{ color: COR.texto2 }}>Nenhum talhão com esse filtro.</p>
            )}

            {/* Últimas entregas · plano */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:items-start">
              <Cartao className="lg:col-span-8" titulo="Últimas entregas" sub="O que foi processado nos seus talhões, do mais recente para o mais antigo."
                rodape={eventos.length > 6 && (
                  <button type="button" onClick={() => setVerTudo(v => !v)} className="text-sm font-semibold" style={{ color: COR.azul }}>
                    {verTudo ? 'Mostrar menos' : `Ver as ${eventos.length - 6} anteriores`}
                  </button>
                )}>
                {eventos.length === 0 ? (
                  <p className="text-sm py-4" style={{ color: COR.texto2 }}>Nada processado em {rotuloAno(safra)} ainda.</p>
                ) : (
                  <ul className="space-y-1">
                    {(verTudo ? eventos : eventos.slice(0, 6)).map((ev, i) => {
                      const def = etapaDef(ev.etapa);
                      const ok = liberada(ev.etapa);
                      return (
                        <li key={`${ev.talhaoId}-${ev.etapa}-${i}`} className="flex items-center gap-3 h-12 cursor-pointer hover:opacity-80" style={{ borderTop: i ? '1px solid var(--bg-surface-hover)' : undefined }}
                          onClick={() => abrir(ev.talhaoId, ok ? def.aba : null)}>
                          <span className="text-sm tabular-nums w-16 flex-shrink-0" style={{ color: COR.texto2 }}>{fmtDataCurta(ev.em)}</span>
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: COR_SIT[ev.situacao] }} />
                          <p className="text-sm leading-snug min-w-0 flex-1 truncate" style={{ color: COR.texto2 }}>
                            <strong style={{ color: COR.texto }}>{ev.talhao}</strong> · {def.rotulo}
                          </p>
                          <span className="text-sm text-right flex-shrink-0 max-w-[55%] truncate" style={{ color: COR.texto2 }}>{ev.texto.replace(/^[^:]+:\s*/, '')}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Cartao>
              <Cartao className="lg:col-span-4" titulo="Seu plano" sub={plano?.nome ?? (preview ? 'Todas as seções liberadas' : undefined)}>
                <ul className="space-y-1.5">
                  {SECOES_PORTAL.map(s => {
                    const ok = preview && !plano ? true : !!plano?.secoes?.[s.id];
                    return (
                      <li key={s.id} className="flex items-center gap-2 text-sm" style={{ color: ok ? COR.texto : COR.texto2 }}>
                        {ok ? <Check size={14} style={{ color: COR.verde }} /> : <Lock size={13} style={{ color: COR.texto2 }} />}
                        {s.label}
                      </li>
                    );
                  })}
                </ul>
                <p className="text-sm mt-4" style={{ color: COR.texto2 }}>As seções liberadas abrem dentro de cada talhão. Para ampliar o plano, fale com a Invicta.</p>
              </Cartao>
            </div>

            <p className="text-center text-xs pt-1" style={{ color: COR.texto2 }}>INVICTA Platform · v{APP_VERSION}</p>
          </>
        )}
      </main>
    </div>
  );
}

// ── Peças ───────────────────────────────────────────────────────────────────

function Cartao({ titulo, sub, acao, rodape, faixa, children, className }: { titulo?: string; sub?: ReactNode; acao?: ReactNode; rodape?: ReactNode; faixa?: boolean; children?: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl p-5 sm:p-6 flex flex-col ${className ?? ''}`} style={cartao}>
      {(titulo || acao) && (
        <header className={`flex items-start justify-between gap-3 ${children ? 'mb-4' : ''}`}>
          <div className="min-w-0">
            {titulo && <h2 className="text-lg font-bold leading-tight" style={{ color: COR.texto }}>{titulo}</h2>}
            {sub && <p className="text-sm mt-1 leading-snug" style={{ color: COR.texto2 }}>{sub}</p>}
          </div>
          {acao}
        </header>
      )}
      {children && <div className="flex-1 min-h-0">{children}</div>}
      {rodape && (faixa ? (
        <div className="mt-5 -mx-5 sm:-mx-6 -mb-5 sm:-mb-6 px-5 sm:px-6 py-4 rounded-b-2xl" style={{ background: 'var(--bg-app)', borderTop: '1px solid var(--border-color)' }}>{rodape}</div>
      ) : (
        <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border-color)' }}>{rodape}</div>
      ))}
    </section>
  );
}

function Kpi({ icone: Icone, rotulo, valor, unidade, sub, zero, tom = 'neutro' }: { icone: LucideIcon; rotulo: string; valor: string | number; unidade?: string; sub: string; zero: string; tom?: 'neutro' | 'entrega' }) {
  const ehZero = valor === 0 || valor === '0';
  // Selo com semântica: proporção em cinza; entrega feita em verde; entrega
  // ainda por vir em âmbar — é o que separa "vazio de propósito" de "pronto".
  const selo = ehZero && tom === 'entrega'
    ? { background: 'var(--status-warning-bg)', color: COR.texto2 }
    : !ehZero && tom === 'entrega'
      ? { background: 'var(--status-active-bg)', color: 'var(--invicta-green-dark)' }
      : { background: 'var(--bg-surface-hover)', color: COR.texto2 };
  return (
    <div className="rounded-2xl p-6 flex flex-col gap-5" style={cartao}>
      <span className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'var(--bg-surface-hover)', color: COR.texto2 }}>
        <Icone size={22} />
      </span>
      <div>
        <p className="text-sm" style={{ color: COR.texto2 }}>{rotulo}</p>
        <div className="flex items-center justify-between gap-3 mt-1.5">
          <p className={`text-4xl tabular-nums leading-none tracking-tight whitespace-nowrap ${ehZero ? 'font-medium' : 'font-bold'}`} style={{ color: ehZero ? COR.mudo : COR.texto }}>
            {valor}{unidade && <span className="text-base font-medium" style={{ color: COR.texto2 }}> {unidade}</span>}
          </p>
          <span className="rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap truncate" style={selo}>
            {ehZero ? zero : sub}
          </span>
        </div>
      </div>
    </div>
  );
}

function Seletor({ valor, onChange, opcoes, rotulo }: { valor: string; onChange: (v: string) => void; opcoes: Array<{ valor: string; rotulo: string }>; rotulo?: string }) {
  return (
    <label className="inline-flex items-center gap-2 text-xs font-medium flex-shrink-0" style={{ color: COR.texto2 }}>
      {rotulo}
      <span className="relative inline-flex">
        <select value={valor} onChange={e => onChange(e.target.value)} aria-label={rotulo}
          className="appearance-none rounded-lg h-9 pl-3 pr-8 text-sm font-medium outline-none max-w-[220px] cursor-pointer"
          style={{ background: 'var(--bg-surface)', color: COR.texto, border: '1px solid var(--border-color)' }}>
          {opcoes.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
        </select>
        <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: COR.texto2 }} />
      </span>
    </label>
  );
}

function Vazio({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="rounded-xl p-6 text-center" style={cartao}>
      <Sprout size={22} className="mx-auto mb-2" style={{ color: COR.verde }} />
      <p className="text-sm font-bold" style={{ color: COR.texto }}>{titulo}</p>
      <p className="text-xs mt-1" style={{ color: COR.texto2 }}>{texto}</p>
    </div>
  );
}

function LegendaCiclo({ contagens }: { contagens?: Partial<Record<SituacaoCiclo, number>> }) {
  return (
    <span className="flex flex-wrap items-center gap-4 text-xs" style={{ color: COR.texto2 }}>
      {(['completo', 'andamento', 'sem-dado'] as SituacaoCiclo[]).filter(s => !contagens || (contagens[s] ?? 0) > 0).map(s => (
        <span key={s} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: COR_CICLO[s] }} />
          {ROTULO_CICLO[s]}{contagens && <span className="tabular-nums" style={{ color: COR.texto }}> · {contagens[s] ?? 0}</span>}
        </span>
      ))}
    </span>
  );
}

function ItemLegenda({ cor, rotulo, valor, zero }: { cor: string; rotulo: string; valor: string; zero?: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 min-w-0" style={{ color: COR.texto2 }}>
        <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: cor, opacity: zero ? 0.4 : 1 }} />{rotulo}
      </span>
      <span className={`tabular-nums whitespace-nowrap ${zero ? '' : 'font-semibold'}`} style={{ color: zero ? COR.texto2 : COR.texto }}>{valor}</span>
    </li>
  );
}

function LinhaTalhao({ av, liberada, abrir, ultimo, comum }: { av: AvaliacaoTalhao; liberada: (id: EtapaId) => boolean; abrir: (id: string, aba?: string | null) => void; ultimo?: boolean; comum?: string | null }) {
  const extras = EXTRAS.map(x => ({ ...x, e: estadoEtapa(av, x.id) })).filter(x => x.e.situacao === 'pronto');
  // Até 2 chips inline; com mais, "+N" com a lista no tooltip — a linha nunca quebra.
  const visiveis = extras.length <= 2 ? extras : extras.slice(0, 2);
  const escondidos = extras.slice(visiveis.length);
  const borda = ultimo ? undefined : '1px solid var(--bg-surface-hover)';
  // Talhão sem nada no ano: uma faixa curta, nome + área + selo, sem colunas vazias.
  if (av.ciclo.situacao === 'sem-dado') {
    return (
      <div className="h-11 flex items-center gap-3 px-2 -mx-2 rounded-lg" style={{ borderBottom: borda }}>
        <button type="button" onClick={() => abrir(av.talhaoId)} className="text-left min-w-0 group truncate">
          <span className="text-sm font-semibold group-hover:underline" style={{ color: COR.texto2 }}>{av.nome}</span>
          <span className="text-sm" style={{ color: COR.texto2 }}> · {fmtHa(av.areaHa)} ha</span>
        </button>
        <SeloSituacao av={av} destacar={false} />
        <span className="flex-1" />
        <button type="button" onClick={() => abrir(av.talhaoId)} className="flex items-center gap-2 text-sm" style={{ color: COR.texto2 }}><ChevronRight size={16} /></button>
      </div>
    );
  }
  return (
    <div className={`min-h-16 py-2 grid grid-cols-1 ${GRADE_TALHAO} items-center gap-4`} style={{ borderBottom: borda }}>
      <button type="button" onClick={() => abrir(av.talhaoId)} className="text-left min-w-0 group">
        <p className="text-base font-semibold leading-tight truncate group-hover:underline" style={{ color: COR.texto }}>{av.nome}</p>
        <p className="text-sm mt-0.5 truncate" style={{ color: COR.texto2 }}>{fmtHa(av.areaHa)} ha{av.cultura ? ` · ${av.cultura}` : ''}</p>
      </button>
      <Jornada av={av} liberada={liberada} abrir={abrir} />
      <div className="min-w-0"><SeloSituacao av={av} destacar={!comum || situacaoCurta(av).texto !== comum} /></div>
      <div className="flex flex-nowrap items-center gap-1.5 min-w-0 overflow-hidden">
        {extras.length === 0 && <span className="text-xs" style={{ color: COR.texto2 }}>—</span>}
        {visiveis.map(x => {
          const def = etapaDef(x.id);
          const ok = liberada(x.id);
          const Icone = x.icone;
          return (
            <button key={x.id} type="button" title={`${def.rotulo}: ${x.e.resumo}${ok ? '' : ' · abre dentro do talhão'}`}
              onClick={() => abrir(av.talhaoId, ok ? def.aba : null)}
              className="flex items-center gap-1 px-2 h-6 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0"
              style={{ background: 'var(--bg-surface-hover)', color: COR.texto2 }}>
              <Icone size={11} /> {def.curto}{x.e.quantidade > 0 && x.id !== 'altimetria' && x.id !== 'condutividade' ? ` ${x.e.quantidade}` : ''}
            </button>
          );
        })}
        {escondidos.length > 0 && (
          <span className="px-2 h-6 inline-flex items-center rounded-full text-xs font-medium flex-shrink-0" title={escondidos.map(x => etapaDef(x.id).curto).join(', ')}
            style={{ background: 'var(--bg-surface-hover)', color: COR.texto2 }}>+{escondidos.length}</span>
        )}
      </div>
      <button type="button" onClick={() => abrir(av.talhaoId)} className="flex items-center justify-end gap-2 text-sm tabular-nums" style={{ color: COR.texto2 }}>
        {fmtDataCurta(av.atualizadoEm)} <ChevronRight size={16} />
      </button>
    </div>
  );
}

/** Situação do talhão em uma palavra-e-meia (o texto longo fica no tooltip):
 *  a próxima etapa do ciclo diz o que está acontecendo. */
function situacaoCurta(av: AvaliacaoTalhao): { texto: string; longo: string; cor: string; fundo: string } {
  if (av.ciclo.situacao === 'completo') return { texto: 'Ciclo completo', longo: 'Arquivo de aplicação gerado', cor: COR.verde, fundo: 'var(--status-active-bg)' };
  if (av.ciclo.situacao === 'sem-dado') return { texto: 'Sem trabalho no ano', longo: 'Nenhuma etapa registrada neste ano', cor: COR.mudo, fundo: 'var(--bg-surface-hover)' };
  const prox = av.ciclo.proxima;
  const e = prox ? estadoEtapa(av, prox) : null;
  const CURTO: Record<EtapaId, string> = {
    amostragem: 'Grade em preparo', laudo: 'Aguardando laudo', fertilidade: 'Mapas em processamento',
    recomendacoes: e?.situacao === 'andamento' ? 'Cenários em avaliação' : 'Recomendação em preparo',
    prescricoes: e?.situacao === 'andamento' ? 'Arquivo em preparo' : 'Aplicação em preparo',
    zonas: '', altimetria: '', condutividade: '', ndvi: '', produtividade: '', compactacao: '', relatorios: '',
  };
  return { texto: (prox && CURTO[prox]) || 'Em andamento', longo: e?.resumo ?? ROTULO_CICLO[av.ciclo.situacao], cor: COR.ambar, fundo: 'var(--status-warning-bg)' };
}

function SeloSituacao({ av, destacar = true }: { av: AvaliacaoTalhao; destacar?: boolean }) {
  const s = situacaoCurta(av);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full h-6 text-xs font-medium max-w-full ${destacar ? 'px-2.5' : ''}`} title={s.longo}
      style={{ background: destacar ? s.fundo : 'transparent', color: COR.texto2 }}>
      {destacar && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.cor }} />}
      <span className="truncate">{s.texto}</span>
    </span>
  );
}

function Jornada({ av, liberada, abrir }: { av: AvaliacaoTalhao; liberada: (id: EtapaId) => boolean; abrir: (id: string, aba?: string | null) => void }) {
  const estados = ETAPAS_CICLO.map(id => estadoEtapa(av, id));
  const n = ETAPAS_CICLO.length;
  const passo = 100 / n;
  // Cada trecho do trilho diz o que aconteceu entre dois nós: feito→feito é
  // verde; pendente→feito (etapa pulada) é tracejado; o resto é o trilho base.
  const trechos = estados.slice(0, -1).map((e, i) => {
    const prox = estados[i + 1];
    if (e.situacao === 'pronto' && prox.situacao === 'pronto') return 'feito';
    if (prox.situacao === 'pronto') return 'pulado';
    return 'base';
  });
  return (
    <div className="relative h-6 w-full min-w-0">
      {trechos.map((t, i) => (
        <span key={i} className="absolute top-1/2 -translate-y-1/2"
          style={{ left: `${passo / 2 + i * passo}%`, width: `${passo}%`, height: 0,
            borderTop: t === 'pulado' ? '2px dashed var(--text-muted)' : `2px solid ${t === 'feito' ? COR.verde : 'var(--border-color)'}`,
            opacity: t === 'feito' ? 0.55 : 1 }} />
      ))}
      <ol className="relative grid grid-cols-5 h-full">
        {ETAPAS_CICLO.map((id, i) => {
          const e = estados[i];
          const def = etapaDef(id);
          const ok = liberada(id);
          // Três pesos: feito é o mais pesado (disco 24px), em andamento é o anel
          // âmbar, pendente é um ponto leve de 12px.
          const pendente = e.situacao === 'pendente';
          const estilo = e.situacao === 'pronto'
            ? { background: 'var(--status-active-bg)', color: 'var(--invicta-green-dark)', boxShadow: 'inset 0 0 0 1.5px var(--invicta-green-light)' }
            : e.situacao === 'andamento'
              ? { background: 'var(--status-warning-bg)', color: COR.ambar, boxShadow: `inset 0 0 0 1.5px ${COR.ambar}` }
              : { background: 'var(--bg-surface-hover)', boxShadow: 'inset 0 0 0 1px var(--border-color)' };
          return (
            <li key={id} className="flex items-center justify-center">
              <button type="button" onClick={() => ok && abrir(av.talhaoId, def.aba)} disabled={!ok}
                title={`${def.rotulo}: ${e.resumo}${ok ? '' : ' (fora do seu plano)'}`}
                aria-label={`${def.rotulo}: ${e.resumo}`}
                className={`relative rounded-full flex items-center justify-center ${pendente ? 'w-3 h-3' : 'w-6 h-6'}`}
                style={{ ...estilo, cursor: ok ? 'pointer' : 'default' }}>
                {e.situacao === 'pronto' ? <Check size={13} strokeWidth={3} /> : null}
                {!ok && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: COR.texto2 }}>
                    <Lock size={8} />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
