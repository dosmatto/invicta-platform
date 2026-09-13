// IMPORTAÇÃO DE LAUDO FOLIAR em lote (CSV/XLSX) — ledger 25 e 26.
//
// POR QUE NÃO DEU PARA CHAMAR `autoConfig`/`escolherPerfil` DE `lab.ts` DIRETO,
// e o que de fato é reusado aqui:
//
//   · REUSADO DE VERDADE: `lerArquivo` (a tela), `aplicarPerfil` (o laço de
//     linhas, a extração do nº por regex, o talhão herdado de célula mesclada e
//     a FUSÃO de linhas macro+micro do mesmo ponto), `valorLab` (N.D. e "<x"),
//     `norm`/`normCab`, o tipo `PontuacaoPerfil` e a constante
//     `CONFIANCA_MINIMA` — o mesmo limiar que decide "este perfil não é deste
//     arquivo" no laudo de solo decide aqui.
//   · NÃO REUSÁVEL: `autoConfig` e `pontuarPerfil` casam cabeçalho por
//     `casaCabecalho`, que EXIGE IGUALDADE EXATA para sinônimos de 1–2 letras
//     (senão o "P" pegaria qualquer coluna com "p" no nome). Cabeçalho foliar é
//     justamente "N g/kg", "P (g/kg)", "B mg/kg" — `normCab` deles é 'ngkg',
//     'pgkg', 'bmgkg' e nenhum é igual a 'n', 'p' ou 'b'. Quem sabe desfazer o
//     sufixo de unidade é `normalizarNomeNutriente` (foliar/nutrientes.ts), que
//     já existe, já é testado e ainda resolve óxido (P₂O₅ → P) e unidade
//     (% → g/kg, ppm → mg/kg). Então `autoConfigFoliar` e `pontuarPerfilFoliar`
//     são o MESMO algoritmo de `lab.ts` com o leitor de cabeçalho certo — não
//     uma segunda verdade sobre o que é um perfil.
//
// POR QUE OS PERFIS FOLIARES FICAM EM LISTA PARALELA (`PERFIS_FOLIAR_BUILTIN`)
// E NÃO EM `PERFIS_BUILTIN`: `escolherPerfil` de solo varre `PERFIS_BUILTIN`
// inteiro e aceita o perfil posicional de maior confiança. Um perfil foliar
// posicional (Amostra · Talhão · N…Zn) tem 11 colunas de elemento e casaria por
// acaso em laudo de solo com layout parecido — e perfil posicional no arquivo
// errado importa TUDO trocado sem erro nenhum (é o defeito que `pontuarPerfil`
// existe para denunciar). A recíproca é igualmente ruim. Listas separadas
// mantêm `npm run teste:lab` intacto e cada domínio escolhendo entre os seus.
//
// UNIDADE: o valor sai daqui SEMPRE na unidade canônica do nutriente (macro
// g/kg, micro mg/kg). A conversão vem do CABEÇALHO, via `interpretarColuna` —
// `cfg.detalhes` (unidade de solo: mmolc/dm³, mg/dm³) é deliberadamente
// ignorado, senão `aplicarPerfil` aplicaria a escala do solo num teor de folha.
//
// Módulo PURO — sem DOM, sem I/O, sem store. npm run teste:foliar-importacao

import {
  aplicarPerfil, norm, normCab, valorLab, CONFIANCA_MINIMA,
  type PerfilLabBuiltin, type PerfilLabConfig, type PontuacaoPerfil, type ResultadoAmostra,
} from './lab.ts';
import {
  interpretarColuna, normalizarNomeNutriente, normalizarTeores, unidadeDe,
  type UnidadeEntrada,
} from './foliar/nutrientes.ts';
import { NUTRIENTES, type NutrienteId, type Orgao, type TeoresFoliares } from './foliar/tipos.ts';

// ── Uma coluna de nutriente já interpretada ─────────────────────────────────

export interface ColunaFoliar {
  nutriente: NutrienteId;
  coluna: number;
  cabecalho: string;
  /** Unidade LIDA no cabeçalho. `null` = o cabeçalho não disse (ver `avisos`). */
  unidade: UnidadeEntrada | null;
  /** Multiplicador aplicado ao valor bruto: fator de óxido × conversão de escala. */
  fator: number;
}

/** As colunas de `cfg.elementos` relidas no cabeçalho deste arquivo. */
export function colunasFoliares(headers: string[], elementos: Record<string, number>): ColunaFoliar[] {
  const out: ColunaFoliar[] = [];
  for (const id of NUTRIENTES) {
    const coluna = elementos?.[id];
    if (typeof coluna !== 'number' || coluna < 0) continue;
    const cabecalho = String(headers[coluna] ?? '');
    const lido = interpretarColuna(cabecalho);
    // O perfil MANDA sobre o nutriente (é ele que diz que a coluna 4 é o K);
    // do cabeçalho aproveita-se só a unidade e o óxido. Assim um perfil
    // posicional continua funcionando em planilha de cabeçalho ruim, e o
    // arquivo com cabeçalho bom ainda ganha a conversão certa.
    const mesmo = lido && lido.nutriente === id;
    out.push({
      nutriente: id, coluna, cabecalho,
      unidade: mesmo ? lido.unidade : null,
      fator: mesmo ? lido.fator : 1,
    });
  }
  return out.sort((a, b) => NUTRIENTES.indexOf(a.nutriente) - NUTRIENTES.indexOf(b.nutriente));
}

// ── Órgão e estádio escritos na planilha ────────────────────────────────────

const chaveTexto = (s: string) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Texto livre → `Orgao`. Devolve `null` quando o texto não é conclusivo — e
 * "trifólio" SOZINHO não é conclusivo: com e sem pecíolo são órgãos diferentes
 * e a norma de um não vale para o outro (ledger 19). Preferir o padrão do lote
 * escolhido na tela a adivinhar aqui.
 */
export function normalizarOrgao(texto: string): Orgao | null {
  const k = chaveTexto(texto);
  if (!k) return null;
  if (k.includes('sem peciolo') || k.includes('s peciolo')) return 'trifolio-sem-peciolo';
  if (k.includes('com peciolo') || k.includes('c peciolo') || k.includes('peciolo')) return 'trifolio-com-peciolo';
  if (k.includes('espiga')) return 'folha-espiga';
  if (k.includes('bandeira')) return 'folha-bandeira';
  return null;
}

// ── Produtividade ───────────────────────────────────────────────────────────

/**
 * Fator para kg/ha a partir do que o CABEÇALHO diz. Sacas de 60 kg e t/ha são
 * as duas grafias que aparecem em planilha de consultoria; sem esta leitura,
 * "65 sc/ha" entraria como 65 kg/ha e a lavoura recordista viraria a população
 * de BAIXA produtividade do gerador de normas.
 */
export function fatorProdutividade(cabecalho: string): number {
  const k = chaveTexto(cabecalho);
  if (/\bsc\b|\bsacas?\b|\bsc ha\b/.test(k)) return 60;
  if (/\bt ha\b|\btoneladas?\b/.test(k)) return 1000;
  return 1;
}

// ── Detecção do perfil a partir do cabeçalho ────────────────────────────────

const ROTULOS_ID = ['amostra', 'ponto', 'numero', 'no amostra', 'id amostra', 'identificacao'];
const ROTULOS_TALHAO = ['talhao', 'gleba', 'lote', 'area', 'campo', 'parcela'];
const ROTULOS_ORGAO = ['orgao', 'parte da planta', 'tecido', 'material', 'orgao amostrado'];
const ROTULOS_ESTADIO = ['estadio', 'estagio', 'fenologia', 'estadio fenologico', 'fenologico'];
const ROTULOS_PRODUTIVIDADE = ['produtividade', 'rendimento', 'produtiv', 'yield', 'prod kg ha', 'prod sc ha'];
const ROTULOS_CAMPANHA = ['safra', 'campanha', 'ano agricola', 'ordem de servico'];

/** A linha de cabeçalho é a que RECONHECE mais nutrientes — não a primeira não
 *  vazia. Laudo de laboratório costuma abrir com duas ou três linhas de
 *  timbre/protocolo, e ler o timbre como cabeçalho não mapeia nutriente nenhum. */
function acharLinhaCabecalho(aoa: string[][]): number {
  let melhor = 0, melhorN = -1;
  for (let i = 0; i < Math.min(aoa.length, 15); i++) {
    const linha = aoa[i] ?? [];
    if (linha.filter(c => String(c).trim()).length < 3) continue;
    const n = new Set(linha.map(c => normalizarNomeNutriente(String(c ?? ''))).filter(Boolean)).size;
    if (n > melhorN) { melhor = i; melhorN = n; }
  }
  return melhor;
}

/**
 * Perfil deduzido do cabeçalho do próprio arquivo — o análogo foliar de
 * `autoConfig`. Os METADADOS são reservados ANTES dos nutrientes: sem isso uma
 * coluna "Produtividade (sc/ha)" ou "Safra" poderia ser disputada, e o número
 * da amostra entraria como teor (o mesmo defeito do 'mos' dentro de "aMOStra"
 * que `lab.ts` documenta).
 */
export function autoConfigFoliar(aoa: string[][]): { config: PerfilLabConfig; headers: string[] } {
  const hi = acharLinhaCabecalho(aoa);
  const headers = (aoa[hi] ?? []).map((h, i) => String(h ?? '').trim() || `col${i + 1}`);
  const usados = new Set<number>();
  const achar = (rotulos: string[]) => {
    const i = headers.findIndex((h, idx) => !usados.has(idx) && rotulos.some(r => chaveTexto(h).includes(r)));
    if (i >= 0) usados.add(i);
    return i;
  };

  const colId = achar(ROTULOS_ID);
  const colTalhao = achar(ROTULOS_TALHAO);
  const colProdutividade = achar(ROTULOS_PRODUTIVIDADE);
  const colEstadio = achar(ROTULOS_ESTADIO);
  const colOrgao = achar(ROTULOS_ORGAO);
  const colCampanha = achar(ROTULOS_CAMPANHA);

  const elementos: Record<string, number> = {};
  headers.forEach((h, i) => {
    if (usados.has(i)) return;
    const id = normalizarNomeNutriente(h);
    if (!id || elementos[id] != null) return;   // primeira coluna de cada nutriente vence
    elementos[id] = i;
    usados.add(i);
  });

  const config: PerfilLabConfig = {
    linhaCabecalho: hi,
    colId: colId >= 0 ? colId : 0,
    colTalhao: colTalhao >= 0 ? colTalhao : undefined,
    colCampanha: colCampanha >= 0 ? colCampanha : undefined,
    colOrgao: colOrgao >= 0 ? colOrgao : undefined,
    colEstadio: colEstadio >= 0 ? colEstadio : undefined,
    colProdutividade: colProdutividade >= 0 ? colProdutividade : undefined,
    elementos,
  };
  return { config, headers };
}

/**
 * "Este perfil é DESTE arquivo?" — mesma pergunta e mesma escala 0..1 de
 * `pontuarPerfil`, lendo o cabeçalho com `normalizarNomeNutriente`.
 */
export function pontuarPerfilFoliar(aoa: string[][], cfg: PerfilLabConfig): PontuacaoPerfil {
  const headers = aoa[cfg.linhaCabecalho ?? 0] ?? [];
  let acertos = 0, esperados = 0;
  let exemplo: PontuacaoPerfil['exemplo'];
  for (const [elId, idx] of Object.entries(cfg.elementos ?? {})) {
    if (!NUTRIENTES.includes(elId as NutrienteId)) continue;
    esperados++;
    const cab = String(headers[idx] ?? '');
    if (normalizarNomeNutriente(cab) === elId) acertos++;
    else exemplo ??= { elId, coluna: idx, cabecalho: cab };
  }
  return { acertos, esperados, confianca: esperados === 0 ? 1 : acertos / esperados, exemplo };
}

// ── Perfis embutidos ────────────────────────────────────────────────────────

/** Marcado antes de qualquer arquivo. AUTO por padrão (e não um posicional):
 *  laudo foliar brasileiro não tem layout dominante como o de solo tem, e um
 *  posicional pré-selecionado no arquivo errado é a pior falha possível. */
export const PERFIL_FOLIAR_PADRAO = 'foliar-auto';

export const PERFIS_FOLIAR_BUILTIN: PerfilLabBuiltin[] = [
  {
    id: 'foliar-auto',
    nome: 'Detectar pelo cabeçalho do laudo',
    auto: true,
    config: { colId: 0, elementos: {} },
  },
  {
    // Layout de planilha de consultoria/laboratório: uma linha por amostra, o
    // nº e o talhão à frente e os 11 nutrientes na ordem do laudo, macro em
    // g/kg e micro em mg/kg.
    id: 'foliar-laudo-br',
    nome: 'Laudo foliar padrão (Amostra · Talhão · N…Zn)',
    assinatura: ['amostra', 'talhao'],
    config: {
      linhaCabecalho: 0, colId: 0, colTalhao: 1,
      elementos: { N: 2, P: 3, K: 4, Ca: 5, Mg: 6, S: 7, B: 8, Cu: 9, Fe: 10, Mn: 11, Zn: 12 },
    },
  },
];

/**
 * Perfil a pré-selecionar quando um arquivo entra — mesma escada de
 * `escolherPerfil` (assinatura → posicional confiável → auto), sobre a lista
 * foliar.
 */
export function escolherPerfilFoliar(
  aoa: string[][],
  salvos: { id: string; config: PerfilLabConfig }[] = [],
): string {
  const { config: autoCfg, headers } = autoConfigFoliar(aoa);

  const porAssinatura = PERFIS_FOLIAR_BUILTIN.find(b =>
    b.assinatura?.length && b.assinatura.every((s, i) => normCab(headers[i] ?? '') === s));
  if (porAssinatura) return porAssinatura.id;

  let melhor = { id: '', confianca: 0 };
  for (const p of [...PERFIS_FOLIAR_BUILTIN.filter(b => !b.auto), ...salvos]) {
    const { esperados, confianca } = pontuarPerfilFoliar(aoa, p.config);
    if (esperados === 0 || confianca <= melhor.confianca) continue;
    if (importarFoliar(aoa, p.config).linhas.length > 0) melhor = { id: p.id, confianca };
  }
  if (melhor.confianca >= CONFIANCA_MINIMA) return melhor.id;

  return Object.keys(autoCfg.elementos).length >= 3 ? 'foliar-auto' : PERFIL_FOLIAR_PADRAO;
}

// ── Faixa plausível de TEOR FOLIAR ──────────────────────────────────────────

/**
 * Limites amplos de teor em TECIDO FOLIAR (não são faixas de interpretação —
 * são o "isto é impossível" que denuncia erro de unidade ou de digitação).
 *
 * Existem aqui, e não em `labOutliers.ts`, porque a tabela de lá é de SOLO:
 * `p: 0–1000 mg/dm³`, `k: 0–60 mmolc/dm³`. Aplicada a folha, ela aprovaria um
 * N de 460 g/kg (erro de 10×) e reprovaria um Fe de 80 mg/kg perfeitamente
 * normal. A camada ESTATÍSTICA (IQR/Tukey, "destoa das demais amostras") é que
 * é reusada de `labOutliers.detectarOutliers`, via `paraTriagem` — aquela sim
 * é agnóstica ao domínio.
 */
export const FAIXAS_PLAUSIVEIS_FOLIAR: Record<NutrienteId, { min: number; max: number }> = {
  N:  { min: 5,   max: 80 },     // g/kg
  P:  { min: 0.5, max: 12 },
  K:  { min: 2,   max: 60 },
  Ca: { min: 1,   max: 60 },
  Mg: { min: 0.5, max: 20 },
  S:  { min: 0.5, max: 15 },
  B:  { min: 1,   max: 300 },    // mg/kg
  Cu: { min: 1,   max: 200 },
  Fe: { min: 10,  max: 3000 },
  Mn: { min: 5,   max: 3000 },
  Zn: { min: 3,   max: 500 },
};

export interface AlertaTeor {
  nutriente: NutrienteId;
  valor: number;
  min: number;
  max: number;
  motivo: string;
}

/** Os teores fora da faixa plausível de folha. Lista vazia = nada a apontar. */
export function teoresImplausiveis(teores: TeoresFoliares): AlertaTeor[] {
  const out: AlertaTeor[] = [];
  for (const id of NUTRIENTES) {
    const v = teores[id];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const f = FAIXAS_PLAUSIVEIS_FOLIAR[id];
    if (v >= f.min && v <= f.max) continue;
    out.push({
      nutriente: id, valor: v, min: f.min, max: f.max,
      motivo: `${id} = ${v} ${unidadeDe(id)} está fora da faixa plausível de folha (${f.min}–${f.max}) — confira a unidade da coluna.`,
    });
  }
  return out;
}

// ── Importação ──────────────────────────────────────────────────────────────

export interface LinhaFoliar {
  /** Mesma chave de `labOutliers.chaveAmostra` — casa a prévia com a triagem. */
  chave: string;
  numeroAmostra: number;
  talhao: string;
  campanha: string;
  teores: TeoresFoliares;
  /** `null` quando a planilha não disse — a tela aplica o padrão do lote. */
  orgao: Orgao | null;
  estadio: string;
  produtividadeKgha: number | null;
}

export interface ResultadoImportacaoFoliar {
  linhas: LinhaFoliar[];
  colunas: ColunaFoliar[];
  talhoes: string[];
  /** Linhas de dado lidas do arquivo. */
  total: number;
  /** Linhas descartadas (sem nº, sem nutriente, fora do filtro de talhão). */
  ignoradas: number;
  avisos: string[];
}

export interface OpcoesImportacaoFoliar {
  /** Só as amostras cujo talhão contém (ou está contido em) este texto. */
  filtroTalhao?: string;
}

const chaveFoliar = (talhao: string, campanha: string, numero: number) =>
  `${talhao}|${campanha}|${numero}|`;

/** Extras (órgão, estádio, produtividade) por `${norm(talhão)}|${nº}`. Só roda
 *  quando o perfil declara ao menos uma dessas colunas. */
function lerExtras(aoa: string[][], cfg: PerfilLabConfig): Map<string, { orgao: Orgao | null; estadio: string; produtividade: number | null }> {
  const mapa = new Map<string, { orgao: Orgao | null; estadio: string; produtividade: number | null }>();
  if (cfg.colOrgao == null && cfg.colEstadio == null && cfg.colProdutividade == null) return mapa;
  const headers = aoa[cfg.linhaCabecalho ?? 0] ?? [];
  const fatorProd = cfg.colProdutividade != null ? fatorProdutividade(String(headers[cfg.colProdutividade] ?? '')) : 1;
  const dados = aoa.slice((cfg.linhaUnidades ?? cfg.linhaCabecalho ?? 0) + 1);
  const reNum = cfg.regexNumero ? new RegExp(cfg.regexNumero, 'i') : null;
  const reTal = cfg.regexTalhao ? new RegExp(cfg.regexTalhao, 'i') : null;
  let talhaoAnterior = '';

  for (const row of dados) {
    const idText = String(row[cfg.colId] ?? '');
    let numero = NaN;
    if (reNum) { const m = idText.match(reNum); if (m) numero = parseInt(m[1], 10); }
    else numero = parseInt(idText.replace(/\D/g, ''), 10);
    if (!numero) continue;

    let talhao = '';
    if (cfg.colTalhao != null) talhao = String(row[cfg.colTalhao] ?? '').trim();
    else if (reTal) { const m = idText.match(reTal); if (m) talhao = m[1].trim(); }
    if (talhao) talhaoAnterior = talhao; else talhao = talhaoAnterior;

    const orgao = cfg.colOrgao != null ? normalizarOrgao(String(row[cfg.colOrgao] ?? '')) : null;
    const estadio = cfg.colEstadio != null ? String(row[cfg.colEstadio] ?? '').trim() : '';
    const bruta = cfg.colProdutividade != null ? valorLab(row[cfg.colProdutividade]) : null;
    const produtividade = bruta != null && bruta > 0 ? bruta * fatorProd : null;

    const k = `${norm(talhao)}|${numero}`;
    const ex = mapa.get(k);
    // Linhas macro+micro do mesmo ponto: a primeira que trouxer o dado manda —
    // a segunda costuma vir vazia e apagaria o que a primeira já disse.
    if (ex) {
      ex.orgao ??= orgao;
      if (!ex.estadio) ex.estadio = estadio;
      ex.produtividade ??= produtividade;
    } else {
      mapa.set(k, { orgao, estadio, produtividade });
    }
  }
  return mapa;
}

/** `ResultadoAmostra` → teores na unidade canônica, aplicando o fator da coluna. */
function teoresDoResultado(r: ResultadoAmostra, colunas: ColunaFoliar[]): TeoresFoliares {
  const parcial: Partial<Record<NutrienteId, number>> = {};
  for (const c of colunas) {
    const bruto = r.valores[c.nutriente];
    if (bruto == null || !Number.isFinite(bruto)) continue;
    const v = bruto * c.fator;
    // Zero em folha é "não detectado" (`valorLab` transforma N.D. e "<x" em 0):
    // como teor, zero envenenaria toda razão dual que passasse por ele. Vira
    // "não analisado", que é o que `null` significa em `TeoresFoliares`.
    if (!(v > 0)) continue;
    parcial[c.nutriente] = v;
  }
  return normalizarTeores(parcial);
}

/**
 * Aplica um perfil foliar sobre a matriz do arquivo. NUNCA lança: arquivo
 * impossível devolve lista vazia e `avisos` com o motivo — quem chama é tela.
 */
export function importarFoliar(
  aoa: string[][],
  cfg: PerfilLabConfig,
  opcoes: OpcoesImportacaoFoliar = {},
): ResultadoImportacaoFoliar {
  const avisos: string[] = [];
  const headers = (aoa?.[cfg?.linhaCabecalho ?? 0] ?? []).map(h => String(h ?? ''));
  const colunas = colunasFoliares(headers, cfg?.elementos ?? {});

  if (!colunas.length) {
    return { linhas: [], colunas: [], talhoes: [], total: 0, ignoradas: 0,
      avisos: ['Nenhuma coluna de nutriente reconhecida neste arquivo com o perfil escolhido.'] };
  }

  const semUnidade = colunas.filter(c => c.unidade == null).map(c => c.nutriente);
  if (semUnidade.length) {
    avisos.push(`Coluna(s) sem unidade declarada no cabeçalho (${semUnidade.join(', ')}): os valores foram assumidos já na unidade do laudo (macro g/kg, micro mg/kg).`);
  }
  const convertidas = colunas.filter(c => c.fator !== 1);
  if (convertidas.length) {
    avisos.push(`Convertida(s) pela unidade do cabeçalho: ${convertidas.map(c => `${c.nutriente} ×${Number(c.fator.toFixed(4))}`).join(', ')}.`);
  }

  // `detalhes` é de SOLO (mmolc/dm³, mg/dm³) — passar adiante faria
  // `aplicarPerfil` reescalar um teor de folha. A conversão foliar é a do
  // cabeçalho, aplicada em `teoresDoResultado`.
  const cfgSemDetalhes: PerfilLabConfig = { ...cfg, detalhes: undefined };
  const base = aplicarPerfil(aoa, cfgSemDetalhes, opcoes.filtroTalhao);
  const extras = lerExtras(aoa, cfg);

  const linhas: LinhaFoliar[] = [];
  for (const r of base.resultados) {
    const teores = teoresDoResultado(r, colunas);
    if (!NUTRIENTES.some(id => teores[id] != null)) continue;
    const ex = extras.get(`${norm(r.talhao)}|${r.numero}`);
    linhas.push({
      chave: chaveFoliar(r.talhao, r.campanha, r.numero),
      numeroAmostra: r.numero,
      talhao: r.talhao,
      campanha: r.campanha,
      teores,
      orgao: ex?.orgao ?? null,
      estadio: ex?.estadio ?? '',
      produtividadeKgha: ex?.produtividade ?? null,
    });
  }

  if (!linhas.length) {
    avisos.push('Nenhuma amostra foi reconhecida: confira a coluna do nº da amostra e o perfil escolhido.');
  }
  if (base.ignoradas > 0) {
    avisos.push(`${base.ignoradas} linha(s) do arquivo ficaram de fora (sem nº de amostra, sem nenhum teor ou fora do talhão filtrado).`);
  }

  return {
    linhas, colunas,
    talhoes: base.talhoes,
    total: base.total,
    ignoradas: base.ignoradas,
    avisos,
  };
}

/**
 * Adaptador para a triagem ESTATÍSTICA de `labOutliers.detectarOutliers` (a
 * camada IQR/Tukey, que é agnóstica ao domínio). A chave produzida por
 * `chaveAmostra` sobre este objeto é igual a `LinhaFoliar.chave`.
 *
 * Vive aqui e não importa `labOutliers` de propósito: aquele módulo é
 * `'use client'` e importa `./lab` sem extensão, o que quebra o teste em node
 * puro. A UI é que junta os dois.
 */
export function paraTriagem(linhas: LinhaFoliar[]): ResultadoAmostra[] {
  return linhas.map(l => {
    const valores: Record<string, number> = {};
    for (const id of NUTRIENTES) {
      const v = l.teores[id];
      if (typeof v === 'number' && Number.isFinite(v)) valores[id] = v;
    }
    return { numero: l.numeroAmostra, profundidade: '', talhao: l.talhao, campanha: l.campanha, valores };
  });
}

/**
 * O que a tela grava com `saveAmostraFoliar`. Tipo ESTRUTURAL (e não
 * `Omit<AmostraFoliar,…>` importado do store): `store.ts` é `'use client'` e
 * usa localStorage, e este módulo precisa rodar em node puro no teste. O
 * compilador cobre a compatibilidade no ponto de uso, dentro do painel.
 */
export interface AmostraFoliarImportada {
  talhaoId: string;
  safra: string;
  cultura: string;
  dataColeta?: string;
  estadio?: string;
  orgao: Orgao;
  teores: TeoresFoliares;
  produtividadeKgha?: number | null;
  origemProdutividade?: 'mapa' | 'manual';
  numeroAmostra?: number;
  origem: 'manual' | 'planilha' | 'pdf';
  observacao?: string;
}

export interface ContextoImportacaoFoliar {
  talhaoId: string;
  safra: string;
  cultura: string;
  dataColeta?: string;
  /** Órgão do lote — usado em toda linha que a planilha não declarou. */
  orgaoPadrao: Orgao;
  estadioPadrao?: string;
}

/** Linhas da prévia → amostras prontas para `saveAmostraFoliar` (sem id). */
export function paraAmostras(linhas: LinhaFoliar[], ctx: ContextoImportacaoFoliar): AmostraFoliarImportada[] {
  return linhas.map(l => ({
    talhaoId: ctx.talhaoId,
    safra: ctx.safra,
    cultura: ctx.cultura,
    dataColeta: ctx.dataColeta,
    estadio: l.estadio || ctx.estadioPadrao || undefined,
    orgao: l.orgao ?? ctx.orgaoPadrao,
    teores: l.teores,
    produtividadeKgha: l.produtividadeKgha,
    origemProdutividade: l.produtividadeKgha != null ? 'manual' : undefined,
    numeroAmostra: l.numeroAmostra,
    origem: 'planilha',
    observacao: l.talhao ? `Planilha · talhão "${l.talhao}"` : undefined,
  }));
}
