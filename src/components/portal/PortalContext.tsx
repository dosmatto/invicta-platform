'use client';

// Contexto do Portal do Produtor v2 — o que TODA página do portal precisa:
// quem é o produtor (já resolvido pelo shell), os filtros do cabeçalho
// (Safra · Cultura · Fazenda · Talhão, guardados na URL), os talhões filtrados
// e os DADOS de cada um (aparelho + listagem leve da nuvem, juntados), mais os
// atalhos de navegação. Somente leitura — nada aqui grava.
//
//   const p = usePortal();
//   p.dados            → DadosPainel[] dos talhões no filtro (um só, se Talhão = um)
//   p.dadosEscopo      → todos os talhões da fazenda/cultura (ignora o filtro de talhão)
//   p.talhao           → o talhão escolhido (null = todos)
//   p.ano / p.safra    → o ano da safra do filtro
//   p.hrefPortal('/portal/zonas')   → link que mantém filtros + preview
//   p.abrirTalhao(id, 'zonas')      → /talhao/[id]?aba=&safra= (+ preview)
//   p.liberada('ndvi') → a seção está no plano do produtor?
//
// Filtros na URL (?safra=&fazenda=&talhao=&cultura=, mais ?cliente=&plano= no
// preview): a troca usa history.replaceState (o Next sincroniza o
// useSearchParams sem remontar a página).

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { getFazendas, getTalhoes, getSafras, type Cliente, type Fazenda, type Talhao, type Safra } from '@/lib/store';
import { secaoLiberada, apresentacaoAtiva, type PlanoAssinatura, type PapelMembro } from '@/lib/empresa';
import { anoDaSafra, anoDeData, hojeSaoPauloISO } from '@/lib/periodo';
import { usarDadosSupabase } from '@/lib/supabaseData';
import { ligarModoProdutorMapa, desligarModoProdutorMapa } from '@/lib/modoProdutorMapa';
import { dadosLocaisPortal, dadosNuvemDosTalhoes, juntarNuvem, type DadosNuvem, type FalhaNuvem } from '@/lib/portalDados';
import { culturasDoAno, talhaoDaCultura, normCultura, type DadosPainel } from '@/lib/portalPainel';
import { lerModoSalvo, salvarModo, type ModoMapa } from './ui/modoMapa';

export interface FiltrosPortal { safra: string; fazenda: string; talhao: string; cultura: string }

/** Seções do plano que o portal respeita (lib/empresa SECOES_PORTAL). */
export type SecaoPortalPlano = 'fertilidade' | 'ndvi' | 'produtividade' | 'relatorios' | 'compactacao' | 'recomendacoes' | 'arquivos' | 'amostragem';

export interface PortalCtx {
  cliente: Cliente;
  plano: PlanoAssinatura | null;
  papel: PapelMembro | null;
  preview: boolean;
  qsPreview: string;
  /** Owner/admin no modo apresentação (lib/modoApresentacao.ts): portal do produtor, login do admin. */
  apresentacao: boolean;
  /** Cliente a mandar ao servidor (benchmark): o do preview/apresentação; undefined = o próprio vínculo. */
  clienteServidor: string | undefined;

  safras: Safra[];
  /** Nome da safra do filtro ("26/27"); sem safra cadastrada, o ano corrente ("2026"). */
  safra: string;
  ano: number | null;
  opcoesSafra: Array<{ valor: string; rotulo: string }>;
  fazendas: Fazenda[];
  fazendaId: string;
  culturas: string[];
  cultura: string;
  /** Talhões no filtro de fazenda + cultura (as opções do filtro Talhão). */
  talhoesEscopo: Talhao[];
  talhaoId: string;
  talhao: Talhao | null;
  /** Talhões no filtro completo (um só quando Talhão = um). */
  talhoes: Talhao[];

  dadosEscopo: DadosPainel[];
  dados: DadosPainel[];
  /** A nuvem ainda não respondeu (mapas, cenários, relatórios). */
  sincronizando: boolean;
  /** Consultas da nuvem que falharam (≠ vazias). */
  falhasNuvem: FalhaNuvem[];
  /** Há nuvem neste aparelho (fora da bancada local). */
  comNuvem: boolean;

  setFiltro: (f: Partial<FiltrosPortal>) => void;
  hrefPortal: (rota: string, extras?: Record<string, string | null | undefined>) => string;
  abrirTalhao: (id: string, aba?: string | null, opcoes?: { novaAba?: boolean; ano?: number | null }) => void;
  abrirPlataforma: () => void;
  liberada: (secao: SecaoPortalPlano) => boolean;

  modoMapa: ModoMapa;
  setModoMapa: (m: ModoMapa) => void;
}

const Ctx = createContext<PortalCtx | null>(null);

export function usePortal(): PortalCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePortal() fora do PortalProvider (o shell do portal fornece).');
  return c;
}

const CHAVES_FILTRO: Array<keyof FiltrosPortal> = ['safra', 'fazenda', 'talhao', 'cultura'];

export function PortalProvider({ cliente, plano, papel, preview, qsPreview, children }: {
  cliente: Cliente; plano: PlanoAssinatura | null; papel: PapelMembro | null; preview: boolean; qsPreview: string; children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  // ── Safra ──
  const safras = useMemo(() => getSafras(), []);
  const anoHoje = useMemo(() => anoDeData(hojeSaoPauloISO()) ?? new Date().getFullYear(), []);
  // Rótulo = só o ANO ("2026"): os números são do ano civil e o satélite, do
  // ciclo jul/A−1–jun/A ("jul/25–jun/26"). "safra 26/27" ao lado de "25/26"
  // se contradizia na mesma tela.
  const opcoesSafra = useMemo(() => (safras.length
    ? safras.map(s => ({ valor: s.nome, rotulo: String(anoDaSafra(s.nome) ?? s.nome) }))
    : [{ valor: String(anoHoje), rotulo: String(anoHoje) }]), [safras, anoHoje]);
  const safraPadrao = safras.find(s => s.ativa)?.nome ?? safras[0]?.nome ?? String(anoHoje);
  const safraUrl = sp.get('safra');
  const safra = safraUrl && opcoesSafra.some(o => o.valor === safraUrl) ? safraUrl : safraPadrao;
  const ano = anoDaSafra(safra);

  // ── Fazenda ── O produtor vê TODAS as fazendas do escopo dele (inclusive a
  // vinculada que não está no nome dele — condomínio). No preview vale o
  // cadastro do produtor escolhido.
  const fazendas = useMemo(() => (preview ? getFazendas(cliente.id) : getFazendas()), [cliente.id, preview]);
  const fazUrl = sp.get('fazenda') ?? '';
  const fazendaId = fazendas.some(f => f.id === fazUrl) ? fazUrl : '';
  const talhoesFazenda = useMemo(() => (fazendaId ? fazendas.filter(f => f.id === fazendaId) : fazendas).flatMap(f => getTalhoes(f.id)), [fazendas, fazendaId]);

  // ── Nuvem (mapas, cenários, relatórios): chega depois e completa a tela. O
  // resultado guarda para QUAIS talhões veio; se a lista mudou, conta como
  // "ainda carregando" sem zerar o estado dentro do efeito.
  const chaveTalhoes = useMemo(() => talhoesFazenda.map(t => t.id).join('|'), [talhoesFazenda]);
  const [nuvem, setNuvem] = useState<{ chave: string; dados: DadosNuvem } | null>(null);
  useEffect(() => {
    let vivo = true;
    dadosNuvemDosTalhoes(talhoesFazenda.map(t => t.id))
      .then(n => { if (vivo) setNuvem({ chave: chaveTalhoes, dados: n }); })
      .catch(() => { if (vivo) setNuvem({ chave: chaveTalhoes, dados: { mapasNuvem: {}, cenarios: {}, relatorios: {}, falhas: ['mapas', 'cenarios', 'relatorios'] } }); });
    return () => { vivo = false; };
  }, [talhoesFazenda, chaveTalhoes]);
  const nuvemAtual = nuvem && nuvem.chave === chaveTalhoes ? nuvem.dados : null;
  const comNuvem = usarDadosSupabase();
  const sincronizando = nuvemAtual === null && comNuvem;

  const locais = useMemo(() => talhoesFazenda.map(t => dadosLocaisPortal(t, safra)), [talhoesFazenda, safra]);
  const dadosFazenda = useMemo(() => locais.map(d => juntarNuvem(d, nuvemAtual)), [locais, nuvemAtual]);

  // ── Cultura ── (do ano: plantio cadastrado ou mapa de colheita)
  const culturas = useMemo(() => culturasDoAno(dadosFazenda, ano), [dadosFazenda, ano]);
  const culUrl = sp.get('cultura') ?? '';
  const cultura = culturas.find(c => normCultura(c) === normCultura(culUrl)) ?? '';
  const dadosEscopo = useMemo(() => (cultura ? dadosFazenda.filter(d => talhaoDaCultura(d, ano, cultura)) : dadosFazenda), [dadosFazenda, cultura, ano]);
  const talhoesEscopo = useMemo(() => {
    const ids = new Set(dadosEscopo.map(d => d.talhao.id));
    return talhoesFazenda.filter(t => ids.has(t.id));
  }, [dadosEscopo, talhoesFazenda]);

  // ── Talhão ──
  const talUrl = sp.get('talhao') ?? '';
  const talhao = talhoesEscopo.find(t => t.id === talUrl) ?? null;
  const talhaoId = talhao?.id ?? '';
  const talhoes = useMemo(() => (talhao ? [talhao] : talhoesEscopo), [talhao, talhoesEscopo]);
  const dados = useMemo(() => (talhaoId ? dadosEscopo.filter(d => d.talhao.id === talhaoId) : dadosEscopo), [dadosEscopo, talhaoId]);

  // ── Navegação ──
  const paramsBase = useCallback((): URLSearchParams => {
    const q = new URLSearchParams();
    if (preview) {
      const c = sp.get('cliente'); const p = sp.get('plano');
      if (c) q.set('cliente', c);
      if (p) q.set('plano', p);
    }
    if (safra && safra !== safraPadrao) q.set('safra', safra);
    if (fazendaId) q.set('fazenda', fazendaId);
    if (cultura) q.set('cultura', cultura);
    if (talhaoId) q.set('talhao', talhaoId);
    return q;
  }, [preview, sp, safra, safraPadrao, fazendaId, cultura, talhaoId]);

  const setFiltro = useCallback((f: Partial<FiltrosPortal>) => {
    const q = paramsBase();
    for (const k of CHAVES_FILTRO) {
      if (!(k in f)) continue;
      const v = f[k] ?? '';
      if (v && !(k === 'safra' && v === safraPadrao)) q.set(k, v); else q.delete(k);
    }
    // Trocar fazenda ou cultura pode tirar o talhão do escopo: volta a "todos".
    if (('fazenda' in f || 'cultura' in f) && !('talhao' in f)) q.delete('talhao');
    const qs = q.toString();
    window.history.replaceState(null, '', `${pathname}${qs ? `?${qs}` : ''}`);
  }, [paramsBase, pathname, safraPadrao]);

  const hrefPortal = useCallback((rota: string, extras?: Record<string, string | null | undefined>) => {
    const q = paramsBase();
    for (const [k, v] of Object.entries(extras ?? {})) { if (v) q.set(k, v); else q.delete(k); }
    const qs = q.toString();
    return `${rota}${qs ? `?${qs}` : ''}`;
  }, [paramsBase]);

  // Nome da safra de um ANO (deep link ?safra=): a cadastrada, ou "26/27".
  const safraDoAno = useCallback((a: number) =>
    safras.find(s => anoDaSafra(s.nome) === a)?.nome ?? `${String(a).slice(2)}/${String(a + 1).slice(2)}`, [safras]);

  const abrirTalhao = useCallback((id: string, aba?: string | null, opcoes?: { novaAba?: boolean; ano?: number | null }) => {
    const q = new URLSearchParams();
    if (aba) q.set('aba', aba);
    const s = opcoes?.ano != null ? safraDoAno(opcoes.ano) : safra;
    if (s) q.set('safra', s);
    // Preview (owner/admin): a página do talhão também abre "como o produtor vê".
    if (preview) { q.set('preview', '1'); if (plano) q.set('plano', plano.id); }
    const url = `/talhao/${id}?${q.toString()}`;
    if (opcoes?.novaAba) window.open(url, '_blank', 'noopener,noreferrer');
    else router.push(url);
  }, [router, safra, safraDoAno, preview, plano]);

  // Estar no portal = fora do modo mapa (quem chegou por URL digitada com o
  // modo ligado voltaria do talhão ao mapa).
  useEffect(() => { desligarModoProdutorMapa(); }, []);
  // ligarModoProdutorMapa() só vale em somente leitura: o produtor logado e o
  // owner/admin no modo apresentação (o preview ?cliente= já ligou o modo, ver
  // useClientePortal) — o /painel abre no cadastro do produtor, como ele vê.
  const abrirPlataforma = useCallback(() => {
    ligarModoProdutorMapa(cliente.id);
    router.push('/painel');
  }, [router, cliente.id]);

  const liberada = useCallback((secao: SecaoPortalPlano) => secaoLiberada(plano, secao), [plano]);

  // ── Mini-mapas: leve × real (preferência por escopo, no navegador) ──
  const [modos, setModos] = useState<{ todos: ModoMapa; um: ModoMapa }>(() => ({ todos: lerModoSalvo(false), um: lerModoSalvo(true) }));
  const modoMapa = talhaoId ? modos.um : modos.todos;
  const setModoMapa = useCallback((m: ModoMapa) => {
    const um = !!talhaoId;
    salvarModo(um, m);
    setModos(x => (um ? { ...x, um: m } : { ...x, todos: m }));
  }, [talhaoId]);

  // Modo apresentação: o portal é o do produtor (preview = false), mas quem
  // está logado é owner/admin — o servidor (benchmark) precisa do cliente.
  const apresentacao = apresentacaoAtiva();
  const clienteServidor = preview || apresentacao ? cliente.id : undefined;
  const valor = useMemo<PortalCtx>(() => ({
    cliente, plano, papel, preview, qsPreview, apresentacao, clienteServidor,
    safras, safra, ano, opcoesSafra,
    fazendas, fazendaId, culturas, cultura,
    talhoesEscopo, talhaoId, talhao, talhoes,
    dadosEscopo, dados, sincronizando, falhasNuvem: nuvemAtual?.falhas ?? [], comNuvem,
    setFiltro, hrefPortal, abrirTalhao, abrirPlataforma, liberada,
    modoMapa, setModoMapa,
  }), [cliente, plano, papel, preview, qsPreview, apresentacao, clienteServidor, safras, safra, ano, opcoesSafra, fazendas, fazendaId, culturas, cultura,
    talhoesEscopo, talhaoId, talhao, talhoes, dadosEscopo, dados, sincronizando, nuvemAtual, comNuvem,
    setFiltro, hrefPortal, abrirTalhao, abrirPlataforma, liberada, modoMapa, setModoMapa]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}
