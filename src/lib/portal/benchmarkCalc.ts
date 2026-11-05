// Benchmark anônimo do Portal do Produtor ("Comparativo Invicta") — núcleo PURO.
//
// Sem banco, sem DOM: quem chama (benchmarkServidor.ts) traz os registros já
// lidos com a service role; aqui só se decide o NÚMERO. Testado em
// `node scripts/teste-portal-benchmark.mjs`. Imports com `.ts` explícito
// (o teste roda em node por type-stripping).
//
// ── Regras (contrato .workflow/scratch/contrato-benchmark.md; ledger Q3/Q6/Q7/Q10)
// · Unidade de agregação = PRODUTOR (cliente). Primeiro cada cliente vira UM
//   número (média ponderada pela área dos seus talhões/mapas); só depois sai a
//   estatística ENTRE clientes. Dez talhões do mesmo produtor contam 1.
// · Mínimo de 5 produtores (Q6) por cultura+safra (produtividade) ou por escopo
//   (fertilidade). Abaixo disso: `insuficiente: true` e NENHUM número agregado.
// · Saída sem nada individual de terceiros: sem listas, ids, nomes, mín./máx.
//
// ── Decisão de segurança (pensando como atacante) ───────────────────────────
// 1. QUANTIS com n = 5 revelam TODOS os valores individuais. Com interpolação
//    linear, p25 = x₂, p50 = x₃ e p75 = x₄ exatamente, e p10/p90 (= 0,6·x₁+0,4·x₂
//    e 0,4·x₄+0,6·x₅) entregam x₁ e x₅ por conta. Logo: quantis SÓ com n ≥ 10
//    (MINIMO_QUANTIS) e arredondados a 1 sc/ha inteiro. Com n ≥ 10 um quantil
//    ainda pode coincidir com o valor de ALGUÉM (ex.: n = 11 → p10 = x₂), mas é um
//    valor anônimo dentro de um grupo de ≥ 10 — o limite clássico de k-anonimato.
// 2. MÉDIA com n ≥ 5: o produtor conhece o próprio valor, então a média revela a
//    SOMA dos outros 4 — 1 equação, 4 incógnitas. Aceito (ledger Q6).
//    DESVIO só com n ≥ 10 (MINIMO_QUANTIS, como os quantis): com n = 5–9, média
//    E desvio dão a soma E a soma dos quadrados dos outros; num grupo homogêneo
//    isso cerca cada valor em ± √3·σ dos demais (σ pequeno ≈ revela). Com n ≥ 10
//    o cerco fica largo demais para apontar alguém.
// 3. PERCENTIL do "você": só a posição relativa (rank médio), nunca valores dos
//    outros.
// 4. ESCOPO da fertilidade é escolhido AQUI pela localização do próprio cliente —
//    o pedido não escolhe cidade/UF, então não dá para cruzar dois recortes.
// 5. Culturas que o cliente NÃO tem e com n < 5 nem aparecem na lista (não
//    revelam "há 2 produtores de sorgo"). As que ele tem aparecem com o n.
// 6. RISCO RESIDUAL documentado: ataque por DIFERENÇA no tempo. Se o grupo muda
//    de 5 para 6 produtores entre duas consultas, 6·m₆ − 5·m₅ = valor do sexto.
//    Mitigação: médias arredondadas (0,1 sc/ha via kgParaSc; 2 casas na
//    fertilidade) e cache de 10 min no servidor; o erro da dedução cresce com n.
//    Eliminar de vez exigiria ruído (privacidade diferencial) — fora do escopo.
//
// ── Fertilidade
// · Laudos do ANO da safra; talhão sem laudo no ano usa o laudo mais recente
//   ATÉ ele, dentro de JANELA_ANOS_FERTILIDADE (3 anos: ano, ano−1, ano−2 — o
//   ciclo usual de reamostragem). Mais antigo que isso não representa a área.
// · Só a camada superficial padrão 0-20 cm (CAMADA_PADRAO): misturar 0-10 de um
//   laboratório com 0-20 de outro compararia coisas diferentes. "00-20",
//   "0 a 20", "0-20 cm" normalizam para "0-20".
// · Valor do talhão = média das amostras; do cliente = média ponderada pela área
//   dos talhões. Unidade = a canônica gravada no laudo (a mesma que o app mostra
//   em NUTRIENTES_EVOLUCAO). Cada nutriente só sai com ≥ 5 produtores que o têm.
// · Escopo: cidade do cliente se ≥ 5 produtores lá; senão a UF; senão todos.
//   Localização = cidade/estado do CLIENTE; vazia → município/estado da fazenda
//   dele (a primeira com município, por id).
//
// ── Produtividade
// · Mapas de colheita do ANO da safra (anoDoRegistro, o mesmo filtro do portal).
// · Por talhão: a mesma regra de rankingColheita/avaliarTalhao (portalProdutor)
//   — o OFICIAL primeiro, senão o mais recente —, só que aplicada DENTRO de cada
//   cultura: um talhão com soja e milho safrinha no mesmo ano entra nas duas.
// · Cliente = Σ(média kg/ha × área)/Σ área dos seus talhões na cultura; mapa sem
//   área ou sem média válida fica fora. kg → sc pela kgParaSc do app.

// ── "Você" = o ESCOPO do usuário
// · Produtor: só os talhões que ELE vê (os mesmos que o portal dele mostra — a
//   regra podeVerTalhao: clienteId + clientesVinculados, fazendasVinculadas,
//   talhoesVinculados; fazenda de condomínio marcada entra). Talhão do cliente
//   fora do escopo dele NÃO entra no "você" (`talhoesDoEscopo`).
// · Owner/admin no preview: todos os talhões do cliente escolhido (o preview
//   mostra getFazendas(clienteId) inteiro).
// · A estatística do GRUPO (média, desvio, quantis, percentil) não muda com quem
//   pede: é sempre por cliente, com todos os talhões dele.

import { anoDoRegistro, kgParaSc } from '../portalProdutor.ts';
import { podeVerTalhao, type RegistroAcesso } from '../precisionfarm/acessoTalhao.ts';
import type { FazendaEscopo } from '../iam/escopoFazendas.ts';

export const MINIMO_PRODUTORES = 5;
export const MINIMO_QUANTIS = 10;
export const CAMADA_PADRAO = '0-20';
export const JANELA_ANOS_FERTILIDADE = 3;
export const ROTULO_GERAL = 'Todos os produtores Invicta';

// ── Contrato da resposta ────────────────────────────────────────────────────

export interface Quantis { p10: number; p25: number; p50: number; p75: number; p90: number }

export interface ItemProdutividade {
  cultura: string;
  nProdutores: number;
  insuficiente: boolean;
  mediaScHa?: number;
  desvioScHa?: number;
  quantis?: Quantis;
  voce?: { mediaScHa: number; percentil: number };
}

export interface ValoresFert { p?: number; k?: number; v?: number }

export interface FertilidadeBenchmark {
  escopo: 'cidade' | 'uf' | 'geral';
  rotulo: string;
  nProdutores: number;
  insuficiente: boolean;
  camada: string;
  medias?: ValoresFert;
  voce?: ValoresFert;
}

export interface RespostaBenchmark {
  ok: true;
  safra: string;
  minimoProdutores: typeof MINIMO_PRODUTORES;
  produtividade: ItemProdutividade[];
  fertilidade: FertilidadeBenchmark;
}

// ── Entradas (o que o servidor lê do app_kv / talhoes) ─────────────────────

export interface MapaColheitaIn {
  talhaoId: string;
  cultura: string | null;
  oficial: boolean;
  criadoEm?: string | null;
  ano?: number | null;
  safra?: string | null;
  dataReferencia?: string | null;
  mediaKgha: number | null;
  areaHa: number | null;
}

export interface LaudoIn {
  id: string;
  talhaoId: string;
  ano?: number | null;
  safra?: string | null;
  dataReferencia?: string | null;
  resultados?: Array<{ profundidade?: string | null; valores?: Record<string, unknown> | null }> | null;
}

/** Talhão já resolvido até o cliente (talhão → fazenda → cliente). */
export interface TalhaoIn { id: string; clienteId: string; areaHa: number | null; fazendaId?: string }

export interface LocalCliente { cidade: string; uf: string }

export interface EntradaBase {
  ano: number;
  mapas: MapaColheitaIn[];
  laudos: LaudoIn[];
  talhoes: TalhaoIn[];
  locais: Map<string, LocalCliente>;
}

/** Valores POR CLIENTE — só vive na memória do servidor, nunca sai na resposta. */
export interface BaseBenchmark {
  ano: number;
  /** rótulo da cultura → clienteId → média kg/ha ponderada pela área. */
  produtividade: Map<string, Map<string, number>>;
  /** clienteId → médias P/K/V% (camada padrão). */
  fertilidade: Map<string, ValoresFert>;
  locais: Map<string, LocalCliente>;
  /** Por TALHÃO (para o "você" do escopo do usuário): cultura → talhão → kg/ha e área. */
  prodTalhao: Map<string, Map<string, { kg: number; area: number }>>;
  /** talhão → médias P/K/V% (camada padrão) e área. */
  fertTalhao: Map<string, { area: number; valores: ValoresFert }>;
  talhoes: Map<string, TalhaoIn>;
}

/** Quem é o "você": o cliente (localização da fertilidade) e, para quem tem
 *  escopo restrito (produtor), os TALHÕES que ele vê. `talhoes` null/ausente =
 *  todos os talhões do cliente (owner/admin no preview). */
export interface VoceBenchmark { clienteId: string | null; talhoes?: ReadonlySet<string> | null }

// ── Safra pedida ────────────────────────────────────────────────────────────

/** Menor ano aceito no pedido. Maior = ano atual + 1 (safra que começa). */
export const ANO_MIN_BENCHMARK = 2000;

/** O ano da safra pedida é aceitável? Fora de [2000, ano atual + 1] o servidor
 *  responde 400 'invalido' — cada ano novo custaria uma varredura completa. */
export function anoBenchmarkValido(ano: number | null | undefined, anoAtual: number): ano is number {
  return typeof ano === 'number' && Number.isInteger(ano) && ano >= ANO_MIN_BENCHMARK && ano <= anoAtual + 1;
}

// ── Normalizações ───────────────────────────────────────────────────────────

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const chaveTexto = (s: string) => semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Culturas do app (store.ts CULTURAS, sem 'Outra'); copiadas para manter o núcleo puro. */
const CULTURAS_CANONICAS = ['Soja', 'Milho', 'Trigo', 'Feijão', 'Algodão', 'Aveia', 'Sorgo', 'Cevada', 'Pastagem'];
const CANONICAS = CULTURAS_CANONICAS.map(r => ({ chave: chaveTexto(r), rotulo: r }));

/**
 * Nome de cultura comparável: ignora caixa, acento, pontuação e plural simples;
 * variações que COMEÇAM pelo nome canônico ("Milho safrinha", "milho 2ª safra",
 * "SOJA") caem na canônica. Desconhecida → o próprio texto com a 1ª maiúscula.
 * Vazia → null (mapa sem cultura não entra no comparativo).
 */
export function normalizarCultura(s: string | null | undefined): string | null {
  const bruto = String(s ?? '').trim();
  const k = chaveTexto(bruto).replace(/s$/, '');
  if (!k) return null;
  const c = CANONICAS.find(x => k === x.chave || k.startsWith(x.chave));
  if (c) return c.rotulo;
  const limpo = bruto.replace(/\s+/g, ' ');
  return limpo.charAt(0).toUpperCase() + limpo.slice(1).toLowerCase();
}

/** Chave de cultura do benchmark (normalizarCultura; vazia → ''). O NAVEGADOR usa
 *  esta mesma função para achar a cultura dele na resposta: "Milho safrinha" do
 *  portal tem de bater com o "Milho" que o servidor agregou. */
export const chaveCulturaBench = (s: string | null | undefined): string => normalizarCultura(s) ?? '';

/** O item da cultura numa resposta (pela chave do servidor); undefined se não há. */
export function itemDaCulturaBench<T extends { cultura: string }>(itens: readonly T[], cultura: string): T | undefined {
  const k = chaveCulturaBench(cultura);
  return k ? itens.find(x => chaveCulturaBench(x.cultura) === k) : undefined;
}

/** "00-20", "0 a 20", "0-20 cm" → "0-20". Sem dois números → null. */
export function normalizarCamada(s: string | null | undefined): string | null {
  const m = /(\d+)\D+(\d+)/.exec(String(s ?? ''));
  return m ? `${Number(m[1])}-${Number(m[2])}` : null;
}

/** Cidade/UF comparáveis (caixa, acento e espaços não contam). */
export const chaveCidade = (l: LocalCliente) => `${chaveTexto(l.cidade)}|${chaveTexto(l.uf)}`;
export const chaveUf = (l: LocalCliente) => chaveTexto(l.uf);

// ── Estatística ─────────────────────────────────────────────────────────────

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const r2 = (x: number) => Math.round(x * 100) / 100;

export function media(xs: readonly number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

/** Desvio-padrão AMOSTRAL (n − 1); 0 com um valor só. */
export function desvio(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = media(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

/** Quantil por interpolação linear (tipo 7, o do R/Excel). `xs` ordenado. */
export function quantil(ordenado: readonly number[], q: number): number {
  const pos = (ordenado.length - 1) * q;
  const i = Math.floor(pos);
  const f = pos - i;
  return i + 1 < ordenado.length ? ordenado[i] + f * (ordenado[i + 1] - ordenado[i]) : ordenado[i];
}

/** Percentil 0–100 por rank médio: (abaixo + ½·empatados) / n. */
export function percentil(valores: readonly number[], x: number): number {
  const abaixo = valores.filter(v => v < x).length;
  const empates = valores.filter(v => v === x).length;
  return Math.round((100 * (abaixo + 0.5 * empates)) / valores.length);
}

// ── Base por cliente ────────────────────────────────────────────────────────

/** Média ponderada; pesos ≤ 0 ou inválidos ficam fora. null se nada sobrar. */
function ponderada(itens: Array<{ v: number; peso: number }>): number | null {
  let s = 0, w = 0;
  for (const it of itens) if (it.peso > 0 && Number.isFinite(it.v)) { s += it.v * it.peso; w += it.peso; }
  return w > 0 ? s / w : null;
}

/** Produtividade de cada TALHÃO por cultura: cultura → talhão → kg/ha e área
 *  (oficial primeiro, senão o mais recente; sem média ou área válida fica fora). */
export function produtividadePorTalhao(mapas: readonly MapaColheitaIn[], talhaoCliente: ReadonlyMap<string, string>, ano: number): Map<string, Map<string, { kg: number; area: number }>> {
  const escolhido = new Map<string, { m: MapaColheitaIn; cultura: string }>();
  for (const m of mapas) {
    if (anoDoRegistro(m) !== ano) continue;
    const cultura = normalizarCultura(m.cultura);
    if (!cultura || !talhaoCliente.has(m.talhaoId)) continue;
    const chave = `${m.talhaoId}|${cultura}`;
    const atual = escolhido.get(chave);
    const melhor = !atual
      || (m.oficial && !atual.m.oficial)
      || (m.oficial === atual.m.oficial && String(m.criadoEm ?? '') > String(atual.m.criadoEm ?? ''));
    if (melhor) escolhido.set(chave, { m, cultura });
  }
  const out = new Map<string, Map<string, { kg: number; area: number }>>();
  for (const { m, cultura } of escolhido.values()) {
    const kg = num(m.mediaKgha), area = num(m.areaHa);
    if (kg == null || kg <= 0 || area == null || area <= 0) continue;
    let porT = out.get(cultura);
    if (!porT) { porT = new Map(); out.set(cultura, porT); }
    porT.set(m.talhaoId, { kg, area });
  }
  return out;
}

/** Produtividade de cada cliente por cultura (ver regras no topo): média
 *  ponderada pela área dos talhões dele. */
export function produtividadePorCliente(mapas: readonly MapaColheitaIn[], talhaoCliente: ReadonlyMap<string, string>, ano: number): Map<string, Map<string, number>> {
  return clientesDosTalhoes(produtividadePorTalhao(mapas, talhaoCliente, ano), talhaoCliente);
}

function clientesDosTalhoes(porTalhao: ReadonlyMap<string, ReadonlyMap<string, { kg: number; area: number }>>, talhaoCliente: ReadonlyMap<string, string>): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const [cultura, porT] of porTalhao) {
    const porCli = new Map<string, Array<{ v: number; peso: number }>>();
    for (const [tid, x] of porT) {
      const cli = talhaoCliente.get(tid);
      if (!cli) continue;
      const l = porCli.get(cli) ?? [];
      l.push({ v: x.kg, peso: x.area });
      porCli.set(cli, l);
    }
    const m = new Map<string, number>();
    for (const [cli, itens] of porCli) { const v = ponderada(itens); if (v != null) m.set(cli, v); }
    if (m.size) out.set(cultura, m);
  }
  return out;
}

/** Por talhão, os laudos do ano mais recente dentro da janela [ano−2, ano]. */
export function laudosDaJanela(laudos: readonly LaudoIn[], ano: number): LaudoIn[] {
  const anoDe = new Map<string, number>();
  for (const l of laudos) {
    const a = anoDoRegistro(l);
    if (a == null || a > ano || a <= ano - JANELA_ANOS_FERTILIDADE) continue;
    if ((anoDe.get(l.talhaoId) ?? -Infinity) < a) anoDe.set(l.talhaoId, a);
  }
  return laudos.filter(l => { const a = anoDoRegistro(l); return a != null && anoDe.get(l.talhaoId) === a; });
}

const NUTS = ['p', 'k', 'v'] as const;

/** Fertilidade de cada cliente na camada padrão (ver regras no topo). */
export function fertilidadePorCliente(laudos: readonly LaudoIn[], talhoes: ReadonlyMap<string, TalhaoIn>, ano: number): Map<string, ValoresFert> {
  return fertClientesDosTalhoes(fertilidadePorTalhao(laudos, talhoes, ano), talhoes);
}

/** Média das amostras 0-20 de cada talhão (todos os laudos do ano escolhido),
 *  com a área do talhão (talhão sem área válida fica fora). */
export function fertilidadePorTalhao(laudos: readonly LaudoIn[], talhoes: ReadonlyMap<string, TalhaoIn>, ano: number): Map<string, { area: number; valores: ValoresFert }> {
  const porTalhao = new Map<string, Record<string, { s: number; n: number }>>();
  for (const l of laudosDaJanela(laudos, ano)) {
    if (!talhoes.has(l.talhaoId)) continue;
    for (const r of l.resultados ?? []) {
      if (normalizarCamada(r.profundidade) !== CAMADA_PADRAO) continue;
      for (const nut of NUTS) {
        const v = num(r.valores?.[nut]);
        if (v == null || v < 0) continue;
        let acc = porTalhao.get(l.talhaoId);
        if (!acc) { acc = {}; porTalhao.set(l.talhaoId, acc); }
        const a = (acc[nut] ??= { s: 0, n: 0 });
        a.s += v; a.n += 1;
      }
    }
  }
  const out = new Map<string, { area: number; valores: ValoresFert }>();
  for (const [tid, acc] of porTalhao) {
    const area = num(talhoes.get(tid)!.areaHa);
    if (area == null || area <= 0) continue;
    const valores: ValoresFert = {};
    for (const nut of NUTS) if (acc[nut]?.n) valores[nut] = acc[nut].s / acc[nut].n;
    if (Object.keys(valores).length) out.set(tid, { area, valores });
  }
  return out;
}

/** Médias P/K/V% de um conjunto de talhões, ponderadas pela área. */
function fertDoConjunto(itens: Array<{ area: number; valores: ValoresFert }>): ValoresFert {
  const v: ValoresFert = {};
  for (const nut of NUTS) {
    const m = ponderada(itens.filter(x => x.valores[nut] != null).map(x => ({ v: x.valores[nut]!, peso: x.area })));
    if (m != null) v[nut] = m;
  }
  return v;
}

function fertClientesDosTalhoes(porTalhao: ReadonlyMap<string, { area: number; valores: ValoresFert }>, talhoes: ReadonlyMap<string, TalhaoIn>): Map<string, ValoresFert> {
  const porCli = new Map<string, Array<{ area: number; valores: ValoresFert }>>();
  for (const [tid, x] of porTalhao) {
    const cli = talhoes.get(tid)?.clienteId;
    if (!cli) continue;
    const l = porCli.get(cli) ?? [];
    l.push(x);
    porCli.set(cli, l);
  }
  const out = new Map<string, ValoresFert>();
  for (const [cli, l] of porCli) { const v = fertDoConjunto(l); if (Object.keys(v).length) out.set(cli, v); }
  return out;
}

export function montarBase(e: EntradaBase): BaseBenchmark {
  const talhoes = new Map(e.talhoes.map(t => [t.id, t]));
  const talhaoCliente = new Map(e.talhoes.map(t => [t.id, t.clienteId]));
  const prodTalhao = produtividadePorTalhao(e.mapas, talhaoCliente, e.ano);
  const fertTalhao = fertilidadePorTalhao(e.laudos, talhoes, e.ano);
  return {
    ano: e.ano,
    produtividade: clientesDosTalhoes(prodTalhao, talhaoCliente),
    fertilidade: fertClientesDosTalhoes(fertTalhao, talhoes),
    locais: e.locais,
    prodTalhao, fertTalhao, talhoes,
  };
}

/** Os talhões da base que o usuário VÊ (regra podeVerTalhao — a mesma do
 *  portal/RLS). `fazendasMarcadas`: as fazendas de `reg.fazendasVinculadas` com
 *  o cliente de cada uma (a regra 2 de escopoFazendas precisa delas, mesmo sem
 *  talhão com dado). */
export function talhoesDoEscopo(reg: RegistroAcesso, base: BaseBenchmark, fazendasMarcadas: readonly FazendaEscopo[] = []): Set<string> {
  const fazendas = new Map<string, FazendaEscopo>();
  for (const f of fazendasMarcadas) if (f.id) fazendas.set(f.id, f);
  for (const t of base.talhoes.values()) if (t.fazendaId && !fazendas.has(t.fazendaId)) fazendas.set(t.fazendaId, { id: t.fazendaId, clienteId: t.clienteId });
  const lista = [...fazendas.values()];
  const out = new Set<string>();
  for (const t of base.talhoes.values()) if (podeVerTalhao(reg, { id: t.id, fazendaId: t.fazendaId ?? null }, lista)) out.add(t.id);
  return out;
}

// ── Resposta (o que sai para o navegador) ───────────────────────────────────

const comoVoce = (v: string | null | VoceBenchmark): VoceBenchmark => (v != null && typeof v === 'object' ? v : { clienteId: v });

/** O "você" na cultura: média ponderada dos talhões do escopo (produtor) ou o
 *  valor do cliente inteiro (preview). undefined = não tem a cultura. */
function meuValorProd(base: BaseBenchmark, cultura: string, voce: VoceBenchmark): number | undefined {
  if (voce.talhoes) {
    const porT = base.prodTalhao.get(cultura);
    if (!porT) return undefined;
    const v = ponderada([...porT].filter(([tid]) => voce.talhoes!.has(tid)).map(([, x]) => ({ v: x.kg, peso: x.area })));
    return v ?? undefined;
  }
  return voce.clienteId != null ? base.produtividade.get(cultura)?.get(voce.clienteId) : undefined;
}

function itemProdutividade(cultura: string, porCli: ReadonlyMap<string, number>, meu: number | undefined): ItemProdutividade {
  const valores = [...porCli.values()];
  const n = valores.length;
  if (n < MINIMO_PRODUTORES) return { cultura, nProdutores: n, insuficiente: true };
  const item: ItemProdutividade = { cultura, nProdutores: n, insuficiente: false, mediaScHa: kgParaSc(media(valores)) };
  if (n >= MINIMO_QUANTIS) {
    // Desvio e quantis só com n ≥ 10 (decisão 1 e 2 no topo).
    item.desvioScHa = kgParaSc(desvio(valores));
    const o = [...valores].sort((a, b) => a - b);
    const q = (p: number) => Math.round(kgParaSc(quantil(o, p)));
    item.quantis = { p10: q(0.1), p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9) };
  }
  if (meu != null) item.voce = { mediaScHa: kgParaSc(meu), percentil: percentil(valores, meu) };
  return item;
}

const arred = (v: ValoresFert): ValoresFert => {
  const o: ValoresFert = {};
  for (const nut of NUTS) if (v[nut] != null) o[nut] = r2(v[nut]!);
  return o;
};

function fertilidade(base: BaseBenchmark, voce: VoceBenchmark): FertilidadeBenchmark {
  const { clienteId } = voce;
  const local = clienteId != null ? base.locais.get(clienteId) : undefined;
  const comDado = [...base.fertilidade.keys()];
  const doRecorte = (f: (l: LocalCliente) => boolean) => comDado.filter(c => { const l = base.locais.get(c); return !!l && f(l); });

  let escopo: FertilidadeBenchmark['escopo'] = 'geral';
  let rotulo = ROTULO_GERAL;
  let grupo = comDado;
  if (local && chaveTexto(local.cidade) && chaveTexto(local.uf)) {
    const k = chaveCidade(local);
    const g = doRecorte(l => chaveCidade(l) === k);
    if (g.length >= MINIMO_PRODUTORES) { escopo = 'cidade'; rotulo = `${local.cidade.trim()}/${local.uf.trim().toUpperCase()}`; grupo = g; }
  }
  if (escopo === 'geral' && local && chaveTexto(local.uf)) {
    const k = chaveUf(local);
    const g = doRecorte(l => chaveUf(l) === k);
    if (g.length >= MINIMO_PRODUTORES) { escopo = 'uf'; rotulo = local.uf.trim().toUpperCase(); grupo = g; }
  }

  const n = grupo.length;
  const out: FertilidadeBenchmark = { escopo, rotulo, nProdutores: n, insuficiente: n < MINIMO_PRODUTORES, camada: CAMADA_PADRAO };
  if (out.insuficiente) return out;
  const medias: ValoresFert = {};
  for (const nut of NUTS) {
    const xs = grupo.map(c => base.fertilidade.get(c)![nut]).filter((x): x is number => x != null);
    if (xs.length >= MINIMO_PRODUTORES) medias[nut] = media(xs);
  }
  out.medias = arred(medias);
  const meu = voce.talhoes
    ? fertDoConjunto([...base.fertTalhao].filter(([tid]) => voce.talhoes!.has(tid)).map(([, x]) => x))
    : clienteId != null ? base.fertilidade.get(clienteId) : undefined;
  if (meu && Object.keys(meu).length) out.voce = arred(meu);
  return out;
}

/**
 * A resposta do contrato para o "você" (`clienteId` ou { clienteId, talhoes }
 * do escopo; null = owner/admin sem cliente escolhido). Cultura entra na lista
 * se o você a tem OU se há ≥ 5 produtores nela; ordem: as do você primeiro,
 * depois por nº de produtores.
 */
export function montarResposta(base: BaseBenchmark, quem: string | null | VoceBenchmark, safra: string): RespostaBenchmark {
  const voce = comoVoce(quem);
  const itens: Array<{ minha: boolean; item: ItemProdutividade }> = [];
  for (const [cultura, porCli] of base.produtividade) {
    const meu = meuValorProd(base, cultura, voce);
    const minha = meu != null;
    if (!minha && porCli.size < MINIMO_PRODUTORES) continue;
    itens.push({ minha, item: itemProdutividade(cultura, porCli, meu) });
  }
  itens.sort((a, b) => Number(b.minha) - Number(a.minha) || b.item.nProdutores - a.item.nProdutores || a.item.cultura.localeCompare(b.item.cultura, 'pt-BR'));
  return { ok: true, safra, minimoProdutores: MINIMO_PRODUTORES, produtividade: itens.map(x => x.item), fertilidade: fertilidade(base, voce) };
}
