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

import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import type { LucideIcon } from 'lucide-react';
import {
  LogOut, ChevronDown, Clock, Satellite, BarChart3, Activity, ArrowLeft, Loader2, Sprout,
  Ruler, LayoutGrid, FlaskConical, Map as MapIcon, ClipboardList, FileDown, Eye, ExternalLink, FileSpreadsheet,
} from 'lucide-react';
import { getFazendas, getTalhoes, getSafras, getLegendasPorAtributo, type Cliente } from '@/lib/store';
import { classeDoValor } from '@/lib/legendas';
import { rotuloAno, anoDaSafra, anoDeData, hojeSaoPauloISO } from '@/lib/periodo';
import { fmtHa } from '@/lib/formato';
import { logout, emailUsuario } from '@/lib/auth';
import { ROTULO_PAPEL, type PlanoAssinatura, type PapelMembro } from '@/lib/empresa';
import { usarDadosSupabase } from '@/lib/supabaseData';
import { ligarModoProdutorMapa, desligarModoProdutorMapa } from '@/lib/modoProdutorMapa';
import { APP_VERSION } from '@/constants/version';
import { dadosLocaisDoTalhao, dadosNuvemDosTalhoes, juntarNuvem, type DadosNuvem } from '@/lib/portalDados';
import {
  avaliarTalhao, resumirPortal, areaAmostradaPorAno, evolucaoNutrientes, rankingColheita,
  fmtDataCurta, NUTRIENTES_EVOLUCAO,
  anosDaMatriz, matrizAmostragem, idadeColeta, CAMADAS_ANO, type LinhaMatriz, type CelulaMatriz, type CamadaAno,
  type EtapaId,
} from '@/lib/portalProdutor';
import { BarrasAno, Rosca, LinhaEvolucao, PontosEixo, COR, COR_CICLO } from './GraficosPortal';


const cartao = { background: 'var(--bg-surface)', border: '1px solid var(--border-color)' } as const;
const fmtInt = (v: number) => Math.round(v).toLocaleString('pt-BR');
const talhoesTxt = (n: number) => `${n} ${n === 1 ? 'talhão' : 'talhões'}`;
// Cadastro em CAIXA ALTA vira "Campos Gerais" (com `capitalize` no CSS); o resto fica como está.
const nomeLegivel = (nome: string) => (nome === nome.toUpperCase() ? nome.toLowerCase() : nome);
const primeiroNome = (nome: string) => { const p = nome.trim().split(/\s+/)[0] ?? ''; return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(); };

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
  const fazendasTodas = useMemo(() => preview ? getFazendas(cliente.id) : getFazendas(), [cliente.id, preview]);
  // Filtro de fazenda (15/10/2026): '' = todas. Tudo abaixo — indicadores,
  // gráficos, matriz, lista, entregas — deriva de `fazendas`, então o filtro
  // vale para o painel inteiro.
  const [fazendaSel, setFazendaSel] = useState('');
  const fazendas = useMemo(() => (fazendaSel ? fazendasTodas.filter(f => f.id === fazendaSel) : fazendasTodas), [fazendasTodas, fazendaSel]);
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
  // Matriz talhão × ano (15/10/2026): colunas = anos das safras + anos com dado.
  const anoAtual = useMemo(() => anoDeData(hojeSaoPauloISO()) ?? new Date().getFullYear(), []);
  const anosMatriz = useMemo(() => anosDaMatriz(dados, anosSafras), [dados, anosSafras]);
  const matriz = useMemo(() => matrizAmostragem(dados, anosMatriz), [dados, anosMatriz]);
  const ranking = useMemo(() => rankingColheita(avs).slice(0, 8), [avs]);
  // Cultura repetida em toda linha vira ruído: se é uma só, vai para o subtítulo.
  const culturaUnica = useMemo(() => { const c = new Set(ranking.map(r => r.cultura).filter(Boolean)); return c.size === 1 ? [...c][0] : null; }, [ranking]);
  const mediaColheita = useMemo(() => ranking.length ? ranking.reduce((s, r) => s + r.mediaScHa, 0) / ranking.length : 0, [ranking]);

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

  const abrir = useCallback((id: string, aba?: string | null) => {
    const q = new URLSearchParams();
    if (aba) q.set('aba', aba);
    if (safra) q.set('safra', safra);
    // Preview (owner/admin): a página do talhão também abre "como o produtor vê".
    if (preview) { q.set('preview', '1'); if (plano) q.set('plano', plano.id); }
    const qs = q.toString();
    router.push(`/talhao/${id}${qs ? `?${qs}` : ''}`);
  }, [router, safra, preview, plano]);
  // Nome da safra de um ANO (para o deep link ?safra=): a cadastrada, ou o
  // padrão "26/27" quando o ano ainda não tem safra na Biblioteca.
  const safraDoAno = useCallback((ano: number) =>
    safras.find(s => anoDaSafra(s.nome) === ano)?.nome ?? `${String(ano).slice(2)}/${String(ano + 1).slice(2)}`, [safras]);
  // Matriz: abre o talhão em NOVA ABA, já na aba e no ano da célula.
  const abrirNovaAba = useCallback((id: string, aba: string, ano: number) => {
    const q = new URLSearchParams({ aba, safra: safraDoAno(ano) });
    if (preview) { q.set('preview', '1'); if (plano) q.set('plano', plano.id); }
    window.open(`/talhao/${id}?${q.toString()}`, '_blank', 'noopener,noreferrer');
  }, [safraDoAno, preview, plano]);

  // Estar no portal = fora do modo mapa. Sem isto, quem chegasse aqui por outro
  // caminho (URL digitada) com o modo ainda ligado voltaria do talhão ao mapa.
  useEffect(() => { desligarModoProdutorMapa(); }, []);
  // ligarModoProdutorMapa() só vale para o produtor logado; no preview não faz nada.
  const abrirMapa = useCallback(() => {
    ligarModoProdutorMapa();
    router.push('/painel');
  }, [router]);

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
          {/* Mapa da fazenda: a página normal do mapa (/painel), em somente
              leitura e só com os clientes dele. No preview (owner/admin) o modo
              não liga — é o /painel normal, com o papel de quem está vendo. */}
          <button onClick={abrirMapa} title="Abrir o mapa da fazenda (somente leitura)"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold"
            style={{ background: 'var(--invicta-green-dark)', color: '#fff' }}>
            <MapIcon size={14} /> Mapa da fazenda
          </button>
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
            {fazendasTodas.length > 1 && (
              <Seletor valor={fazendaSel} onChange={setFazendaSel}
                opcoes={[{ valor: '', rotulo: 'Todas as fazendas' }, ...fazendasTodas.map(f => ({ valor: f.id, rotulo: f.nome }))]} />
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

            {/* Matriz talhão × ano: logo abaixo dos indicadores (15/10/2026) — é o
                atalho de navegação; os gráficos vêm depois. */}
            <MatrizAmostragem linhas={matriz} anos={anosMatriz} anoAtual={anoAtual} fazendas={fazendas} abrir={abrirNovaAba} />

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

            {/* Colheita em largura cheia: a lista de talhões respira e não sobra buraco ao lado. */}
            <Cartao titulo={`Colheita ${rotuloAno(safra)}`}
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

// ── Matriz talhão × ano ────────────────────────────────────────────────────
// A DATA é a coleta de solo, colorida pela idade (ano atual → verde, 1 ano →
// amarelo, 2 anos → âmbar, 3 ou mais → vermelho; o amarelo não tem token no
// tema). Os MARCADORES embaixo são o que mais existe no ano — satélite,
// colheita, compactação, recomendações — e cada um abre a própria aba.
type Idade = 0 | 1 | 2 | 3;
const TOM_IDADE: Record<Idade, { rotulo: string; bg: string; cor: string; borda: string }> = {
  0: { rotulo: 'ano atual', bg: 'var(--status-active-bg)', cor: 'var(--invicta-green-dark)', borda: 'var(--invicta-green-light)' },
  1: { rotulo: '1 ano', bg: '#fef9c3', cor: '#854d0e', borda: '#fde047' },
  2: { rotulo: '2 anos', bg: 'var(--status-warning-bg)', cor: 'var(--status-warning)', borda: '#fdba74' },
  3: { rotulo: '3 anos ou mais', bg: 'var(--status-error-bg)', cor: 'var(--status-error)', borda: '#fca5a5' },
};
const ICONE_CAMADA: Record<CamadaAno, LucideIcon> = { ndvi: Satellite, colheita: BarChart3, compactacao: Activity, recomendacoes: FileSpreadsheet };

function MatrizAmostragem({ linhas, anos, anoAtual, fazendas, abrir }: {
  linhas: LinhaMatriz[]; anos: number[]; anoAtual: number;
  fazendas: Array<{ id: string; nome: string }>;
  abrir: (talhaoId: string, aba: string, ano: number) => void;
}) {
  const grupos = fazendas.map(f => ({ f, itens: linhas.filter(l => l.fazendaId === f.id) })).filter(g => g.itens.length > 0);
  const semNada = !anos.length || linhas.every(l => !l.temAlgo);
  return (
    <Cartao titulo="Seus talhões ano a ano" sub="Os mapas de fertilidade prontos de cada talhão em cada ano — a data é a da coleta de solo — e o que mais já existe no ano. Clique para abrir o talhão em nova aba, já na aba e no ano certos."
      rodape={semNada ? undefined : <LegendaMatriz />}>
      {semNada ? (
        <p className="text-sm" style={{ color: COR.texto2 }}>Nada processado ainda nos seus talhões.</p>
      ) : (
        <div className="overflow-x-auto -mx-5 sm:-mx-6 px-5 sm:px-6">
          <table className="w-full text-sm" style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: 320 + anos.length * 112 }}>
            <thead>
              <tr style={{ color: COR.texto2 }}>
                <th className="text-left text-xs font-medium py-2 pr-3 sticky left-0 z-10" style={{ background: 'var(--bg-surface)' }}>Talhão</th>
                <th className="text-right text-xs font-medium py-2 pr-4">Área</th>
                {anos.map(a => (
                  <th key={a} className="text-center text-xs font-semibold py-2 px-1 tabular-nums" style={{ color: a === anoAtual ? COR.texto : COR.texto2 }}>{a}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grupos.map(g => {
                const area = g.itens.reduce((s, l) => s + l.areaHa, 0);
                return (
                  <Fragment key={g.f.id}>
                    <tr>
                      <td colSpan={2 + anos.length} className="pt-4 pb-1 text-xs font-semibold uppercase tracking-wider capitalize" style={{ color: COR.texto2 }}>
                        {nomeLegivel(g.f.nome)} · {talhoesTxt(g.itens.length)} · {fmtHa(area)} ha
                      </td>
                    </tr>
                    {g.itens.map(l => (
                      <tr key={l.talhaoId}>
                        <td className="py-1.5 pr-3 font-semibold sticky left-0 z-10 align-top" style={{ color: COR.texto, background: 'var(--bg-surface)', borderTop: '1px solid var(--border-color)' }}>{l.nome}</td>
                        <td className="py-1.5 pr-4 text-right tabular-nums whitespace-nowrap align-top" style={{ color: COR.texto2, borderTop: '1px solid var(--border-color)' }}>{fmtHa(l.areaHa)} ha</td>
                        {l.celulas.map(c => (
                          <td key={c.ano} className="py-1.5 px-1 align-top" style={{ borderTop: '1px solid var(--border-color)' }}>
                            <CelulaAno c={c} anoAtual={anoAtual} abrir={aba => abrir(l.talhaoId, aba, c.ano)} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Cartao>
  );
}

function CelulaAno({ c, anoAtual, abrir }: { c: CelulaMatriz; anoAtual: number; abrir: (aba: string) => void }) {
  const extras = CAMADAS_ANO.filter(k => c.camadas[k.id] > 0);
  // Só MAPA PROCESSADO ganha a data (decisão de 15/10/2026): laudo sem mapa e
  // grade sem laudo não aparecem — o produtor vê o que já pode abrir.
  const comMapa = c.situacao === 'mapas';
  if (!comMapa && extras.length === 0) return <span className="block w-full py-1.5 text-center text-xs" style={{ color: COR.mudo }}>—</span>;
  const tom = TOM_IDADE[idadeColeta(c.ano, anoAtual) ?? 3];
  return (
    <div className="flex flex-col items-stretch gap-1">
      {comMapa && (
        <button type="button" onClick={() => abrir('fertilidade')}
          title={`${c.mapas} ${c.mapas === 1 ? 'mapa' : 'mapas'} de fertilidade · ${c.amostras} amostras — abre em nova aba`}
          className="w-full py-1.5 px-1 rounded-md text-xs font-semibold tabular-nums inline-flex items-center justify-center gap-1 whitespace-nowrap"
          style={{ background: tom.bg, color: tom.cor, border: `1px solid ${tom.borda}` }}>
          {fmtDataCurta(c.data)}
          <ExternalLink size={11} style={{ opacity: 0.8 }} />
        </button>
      )}
      {extras.length > 0 && (
        <div className="flex items-center justify-center gap-1">
          {extras.map(k => {
            const Icone = ICONE_CAMADA[k.id];
            const n = c.camadas[k.id];
            return (
              <button key={k.id} type="button" onClick={() => abrir(k.aba)} title={`${k.rotulo}: ${n} — abre em nova aba`} aria-label={`${k.rotulo} em ${c.ano}`}
                className="h-6 px-1.5 rounded-md inline-flex items-center gap-1 text-[11px] tabular-nums"
                style={{ background: 'var(--bg-surface-hover)', color: COR.texto2, border: '1px solid var(--border-color)' }}>
                <Icone size={12} />{n > 1 ? n : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AmostraLegenda({ bg, borda }: { bg: string; borda: string }) {
  return <span className="inline-block w-3.5 h-3.5 rounded-sm flex-shrink-0" style={{ background: bg, border: `1px solid ${borda}` }} />;
}

function LegendaMatriz() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs" style={{ color: COR.texto2 }}>
      <span className="font-semibold" style={{ color: COR.texto }}>Mapas de fertilidade prontos · data da coleta</span>
      {([0, 1, 2, 3] as Idade[]).map(i => (
        <span key={i} className="inline-flex items-center gap-1.5"><AmostraLegenda bg={TOM_IDADE[i].bg} borda={TOM_IDADE[i].borda} />{TOM_IDADE[i].rotulo}</span>
      ))}
      <span className="font-semibold" style={{ color: COR.texto }}>Também no ano</span>
      {CAMADAS_ANO.map(k => { const Icone = ICONE_CAMADA[k.id]; return <span key={k.id} className="inline-flex items-center gap-1.5"><Icone size={13} />{k.rotulo}</span>; })}
    </div>
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

function Vazio({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="rounded-xl p-6 text-center" style={cartao}>
      <Sprout size={22} className="mx-auto mb-2" style={{ color: COR.verde }} />
      <p className="text-sm font-bold" style={{ color: COR.texto }}>{titulo}</p>
      <p className="text-xs mt-1" style={{ color: COR.texto2 }}>{texto}</p>
    </div>
  );
}
