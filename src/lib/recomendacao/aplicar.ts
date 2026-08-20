'use client';

// Fase R3 — aplica uma equação aos mapas de fertilidade de um talhão+importação,
// gerando o grid de DOSE (álgebra de mapas pixel a pixel via motor.ts). Carrega
// os grids salvos na nuvem (prefixo largo, igual à aba Fertilidade e ao relatório)
// e resolve cada atributo da equação na profundidade que a própria equação define.

import { cloudCarregarMapasPorPrefixo } from '../cloud';
import { descomprimirGrid, decodeGrid, type RespInterp } from '../fertilidade';
import { compilar, executarGrid, atributoPorToken, ajustarDose } from './motor';
import { escolherMapas, prefixoDose20, PIXEL_RECOMENDACAO_M, type UsoMapa } from './escolhaMapa';
import { coberturaDoGrid } from './cobertura';
import type { ConteudoEquacao } from '../biblioteca';
import { custosDaEquacao, type ConteudoInsumo } from '../insumos';

type MapaPronto = { resp: RespInterp; labels?: GeoJSON.FeatureCollection; interpoladoEm?: string };

// De onde veio o grid que entrou na conta — a tela mostra isto para que misturar
// resoluções ou interpoladores nunca mais passe despercebido.
export interface OrigemGrid { pixel?: number; metodo?: string; reamostrado: boolean }
export interface GridRecomendacao extends RespInterp { origem?: OrigemGrid }

async function carregarGaveta(prefixo: string, uso: UsoMapa) {
  const carregados = await cloudCarregarMapasPorPrefixo<MapaPronto>(prefixo);
  const escolha = escolherMapas(prefixo, carregados.map(c => ({
    id: c.id, tem: !!c.dados.resp?.grid?.b64, em: c.dados.interpoladoEm ?? '',
  })), uso);
  return { carregados, escolha };
}

// Carrega os grids do talhão+importação, indexados por `nut__prof`.
//
// `uso` é OBRIGATÓRIO de propósito. Quando tinha default 'dose', o zoneamento
// herdou a régua de 20 m sem ninguém escrever nada e as divisas das zonas saíram
// em escadinha (6bab014). Errar agora é erro de compilação.
//   'dose' → o mapa NATIVO de 20 m, da gaveta `dose20__`. Sem ele (talhão ainda não
//            reprocessado), cai no mapa de fertilidade e reamostra.
//   'zona' → o mapa de fertilidade como ele é, o mais fino.
export async function carregarGridsTalhao(
  talhaoId: string, importacaoId: string, uso: UsoMapa,
): Promise<Record<string, GridRecomendacao>> {
  const out: Record<string, GridRecomendacao> = {};
  const prefFert = `${talhaoId}__${importacaoId}__`;

  // A dose procura primeiro na gaveta própria — lá só existem mapas de 20 m.
  if (uso === 'dose') {
    const pref20 = prefixoDose20(talhaoId, importacaoId);
    const { carregados, escolha } = await carregarGaveta(pref20, uso);
    for (const k in escolha) {
      const e = escolha[k];
      const resp = carregados[e.indice].dados.resp;
      if (resp?.grid?.comp === 'gz') {
        try { resp.grid = await descomprimirGrid(resp.grid); } catch { /* segue */ }
      }
      out[k] = { ...resp, origem: { pixel: e.pixel ?? PIXEL_RECOMENDACAO_M, metodo: e.metodo, reamostrado: false } };
    }
  }

  const { carregados, escolha } = await carregarGaveta(prefFert, uso);
  for (const k in escolha) {
    if (out[k]) continue;                 // a gaveta de 20 m já resolveu este atributo
    const e = escolha[k];
    const resp = carregados[e.indice].dados.resp;
    if (resp?.grid?.comp === 'gz') {
      try { resp.grid = await descomprimirGrid(resp.grid); } catch { /* segue */ }
    }
    // ZONA fica com o mapa como ele é (o mais fino): reamostrar para 20 m
    // engrossaria a malha e a divisa da zona sairia em escadinha de 20 m.
    if (uso === 'zona') {
      out[k] = { ...resp, origem: { pixel: e.pixel, metodo: e.metodo, reamostrado: false } };
      continue;
    }
    const origem = { pixel: e.pixel, metodo: e.metodo, reamostrado: !e.eh20 };
    out[k] = e.eh20 ? { ...resp, origem } : { ...reamostrarPara20m(resp), origem };
  }
  return out;
}

// A RECOMENDAÇÃO trabalha SEMPRE em ~20 m: o detalhe fino é da aba Fertilidade;
// a dose final (PDF + arquivos de máquina) mantém a resolução de 20 m.
//
// O CAMINHO BOM é a aba Fertilidade interpolar um mapa NATIVO de 20 m (krigagem
// nos nós de 20 m) junto com o fino — é o que `carregarGridsTalhao` procura.
// A reamostragem abaixo virou FALLBACK para talhões ainda não reprocessados.
//
// Duas armadilhas que ela carrega, e que o mapa nativo não tem:
//   • devolve `{...resp}` com os `bounds` do grid FINO e um shape novo — como os
//     consumidores mapeiam índice→lon/lat por linspace sobre os bounds, o mapa sai
//     deslocado em ~meio pixel grosso (o centro do bloco não é o nó da grade);
//   • preserva o `stats` do grid fino (pixel_m, nx/ny, min/max), que passa a não
//     descrever o grid que o acompanha.
// Sobre a DOSE em si o efeito é pequeno (~1% medido no backend real): a superfície
// krigada é lisa na escala de 20 m, então a média de 16 pixels quase não a muda.
// (PIXEL_RECOMENDACAO_M e a regra de escolha vivem em ./escolhaMapa — testáveis.)

function reamostrarPara20m(resp: RespInterp): RespInterp {
  const shape = resp.grid?.shape;
  if (!resp.grid?.b64 || !shape) return resp;
  const [rows, cols] = shape;
  const [minx, miny, maxx, maxy] = resp.bounds;
  const lat0 = (miny + maxy) / 2;
  const dxM = ((maxx - minx) / Math.max(cols, 1)) * 111320 * Math.cos((lat0 * Math.PI) / 180);
  const dyM = ((maxy - miny) / Math.max(rows, 1)) * 110540;
  const pixelM = Math.min(Math.abs(dxM), Math.abs(dyM)) || PIXEL_RECOMENDACAO_M;
  const f = Math.round(PIXEL_RECOMENDACAO_M / pixelM);
  if (f < 2) return resp;   // já é ~20 m (ou mais grosso)
  const { valores } = decodeGrid(resp.grid);
  const nr = Math.ceil(rows / f), nc = Math.ceil(cols / f);
  const grosso = new Float32Array(nr * nc);
  for (let r = 0; r < nr; r++) {
    for (let c = 0; c < nc; c++) {
      let soma = 0, n = 0;
      const iMax = Math.min((r + 1) * f, rows), jMax = Math.min((c + 1) * f, cols);
      for (let i = r * f; i < iMax; i++) {
        for (let j = c * f; j < jMax; j++) {
          const v = valores[i * cols + j];
          if (isFinite(v)) { soma += v; n++; }
        }
      }
      grosso[r * nc + c] = n ? soma / n : NaN;
    }
  }
  return { ...resp, grid: { b64: float32ParaB64(grosso), shape: [nr, nc] } };
}

export interface ResultadoAplicacao {
  grid: { b64: string; shape: [number, number] };
  bounds: [number, number, number, number];
  stats: { min: number; media: number; max: number; n: number };
  // Qual mapa entrou em cada atributo da equação — a tela mostra isto para que
  // misturar resolução ou interpolador não passe despercebido.
  fontes?: { token: string; pixel?: number; metodo?: string; reamostrado: boolean }[];
}

function float32ParaB64(arr: Float32Array): string {
  const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < u8.length; i += CHUNK) s += String.fromCharCode(...u8.subarray(i, i + CHUNK));
  return btoa(s);
}

export function aplicarEquacao(
  eq: ConteudoEquacao,
  grids: Record<string, GridRecomendacao>,
  poligono?: GeoJSON.Polygon | GeoJSON.MultiPolygon | null,
): ResultadoAplicacao {
  const prof = eq.profundidade || '0-20';
  const c = compilar(eq.script, eq.constantes);
  if (!c.ok) throw new Error(c.erro);
  const prog = c.prog;

  const gridPorVar = new Map<string, Float32Array>();
  let ref: RespInterp | null = null;
  const faltando: string[] = [];
  const fontes: NonNullable<ResultadoAplicacao['fontes']> = [];
  for (const v of prog.varsExternas) {
    const at = atributoPorToken(v);
    if (!at) { faltando.push(v); continue; }
    const resp = grids[`${at.nut}__${prof}`];
    if (!resp || !resp.grid?.b64) { faltando.push(`${at.token} ${prof}`); continue; }
    if (!ref) ref = resp;
    fontes.push({ token: at.token, pixel: resp.origem?.pixel, metodo: resp.origem?.metodo, reamostrado: resp.origem?.reamostrado ?? false });
    gridPorVar.set(v, decodeGrid(resp.grid).valores);
  }
  if (faltando.length) {
    throw new Error(`Faltam mapas para: ${faltando.join(', ')}. Interpole esses atributos na profundidade ${prof} (aba Fertilidade).`);
  }
  // equação só de constantes: usa qualquer grid da profundidade como malha-base.
  if (!ref) {
    const algum = Object.entries(grids).find(([k, r]) => k.endsWith(`__${prof}`) && r.grid?.b64);
    if (!algum) throw new Error(`Não há nenhum mapa na profundidade ${prof} para servir de base. Interpole ao menos um atributo nessa profundidade.`);
    ref = algum[1];
  }

  const [rows, cols] = ref.grid!.shape;
  const n = rows * cols;
  for (const arr of gridPorVar.values()) {
    if (arr.length !== n) {
      // Misturar mapa POR ZONA com mapa INTERPOLADO é a causa mais provável, e a
      // mensagem antiga ("mesmo pixel") mandava o usuário para o lugar errado: os
      // dois podem ser de 20 m e ainda assim ter malhas diferentes, porque a
      // rasterização por zona parte da bbox das zonas e a interpolação, do talhão.
      const metodos = new Set(fontes.map(f => f.metodo));
      if (metodos.has('zona') && metodos.size > 1) {
        const mistos = fontes.map(f => `${f.token} (${f.metodo === 'zona' ? 'zona' : 'interpolado'})`).join(', ');
        throw new Error(
          `Esta equação mistura mapa por ZONA com mapa INTERPOLADO: ${mistos}. `
          + 'Processe TODOS os atributos dela no mesmo modo, na aba Fertilidade (Modo do mapa).',
        );
      }
      throw new Error('Os mapas dos atributos têm tamanhos diferentes (pixel diferente). Reprocesse-os com o mesmo pixel na aba Fertilidade.');
    }
  }

  const dose = executarGrid(prog, eq.constantes, gridPorVar, n);
  const opts = { naoNegativo: eq.naoNegativo, doseMinima: eq.doseMinimaViavel ?? 0, abaixoMinimo: eq.abaixoMinimo ?? 'zero' as const, doseMaxima: eq.doseMaxima ?? 0 };
  for (let i = 0; i < n; i++) dose[i] = ajustarDose(dose[i], opts);

  // Média PONDERADA pela fração de cada pixel que está dentro do talhão. O raster
  // de 20 m cobre 100% do polígono e por isso transborda na divisa: contar a célula
  // de borda inteira — justo onde a krigagem extrapola — mexeria na dose média e,
  // por tabela, na tonelagem e no custo. Sem polígono (cenário antigo), o peso é 1
  // e a conta é exatamente a de antes.
  const peso = poligono ? coberturaDoGrid([rows, cols], ref.bounds, poligono) : null;
  let mn = Infinity, mx = -Infinity, soma = 0, pesoTotal = 0, cnt = 0;
  for (let i = 0; i < n; i++) {
    const d = dose[i];
    if (!isFinite(d)) continue;
    const p = peso ? peso[i] : 1;
    if (p <= 0) continue;                    // pixel só de transbordo: não é talhão
    cnt++; soma += d * p; pesoTotal += p;
    if (d < mn) mn = d;
    if (d > mx) mx = d;
  }

  return {
    grid: { b64: float32ParaB64(dose), shape: [rows, cols] },
    bounds: ref.bounds,
    stats: { min: cnt ? mn : 0, media: pesoTotal ? soma / pesoTotal : 0, max: cnt ? mx : 0, n: cnt },
    fontes,
  };
}

// Dose de UMA equação já com financeiro (toneladas + custo). Total por hectare:
// se a unidade de tratamento for t/ha → média×área; se kg/ha → média×área÷1000.
export interface DoseCalculada {
  equacaoId: string; nomeEquacao: string; produto: string; unidade: string;
  estilo: ConteudoEquacao['estilo'];
  grid: { b64: string; shape: [number, number]; comp?: 'gz' };
  bounds: [number, number, number, number];
  stats: { min: number; media: number; max: number; n: number };
  toneladas: number;
  usar?: boolean;                 // marcado "será utilizado" → entra na geração de arquivos
  custoTonelada: number | null;   // R$/t do produto
  freteHa: number;                // R$/ha
  aplicacaoHa: number;            // R$/ha
  custoProdutoHa: number;         // R$/ha só do produto
  custoHa: number;                // R$/ha total (produto + frete + aplicação)
  custo: number;                  // investimento total = custoHa × área
  insumoId?: string;              // de qual insumo vieram os custos (snapshot). Ainda NÃO
                                  // é chave de agregação: relatorioCenarios/ComparadorCenarios
                                  // casam por NOME, e os cenários já salvos não têm o campo.
  doseMinima?: number;            // dose mínima viável da equação — a 1ª faixa colorida começa aqui; abaixo (e zero) = transparente
  fontes?: ResultadoAplicacao['fontes'];   // de onde veio o mapa de cada atributo
}

export function calcularDose(
  eq: { id: string; nome: string; conteudo: ConteudoEquacao },
  grids: Record<string, GridRecomendacao>, areaHa: number,
  poligono?: GeoJSON.Polygon | GeoJSON.MultiPolygon | null,
  // v2.42 — de onde sai o preço quando a equação está vinculada a um insumo.
  // INJETADO, não lido da Biblioteca: `calcularDose` só depende dos próprios
  // argumentos, e é isso que faz o mesmo cenário dar sempre o mesmo número.
  insumos?: ReadonlyMap<string, ConteudoInsumo>,
): DoseCalculada {
  const res = aplicarEquacao(eq.conteudo, grids, poligono);
  const c = eq.conteudo;
  const u = (c.unidadeTratamento || '').toLowerCase();
  const ehT = u.includes('t/ha') || u.includes('ton');
  const toneladas = ehT ? res.stats.media * areaHa : res.stats.media * areaHa / 1000;
  const tonHa = areaHa > 0 ? toneladas / areaHa : 0;
  const cst = custosDaEquacao(c, c.insumoId ? insumos?.get(c.insumoId) : undefined);
  const { freteHa, aplicacaoHa } = cst;
  const custoProdutoHa = tonHa * (cst.custoTonelada ?? 0);
  const custoHa = custoProdutoHa + freteHa + aplicacaoHa;
  return {
    equacaoId: eq.id, nomeEquacao: eq.nome, produto: c.produto, unidade: c.unidadeTratamento,
    estilo: c.estilo, grid: res.grid, bounds: res.bounds, stats: res.stats, toneladas,
    custoTonelada: cst.custoTonelada, freteHa, aplicacaoHa, custoProdutoHa, custoHa, custo: custoHa * areaHa,
    insumoId: c.insumoId,
    doseMinima: c.doseMinimaViavel ?? 0,
    fontes: res.fontes,
  };
}

// Divide a dose total em passadas de no máximo `limiteMax` (na unidade da dose):
// aplicação i = min(max(dose − (i−1)·limiteMax, 0), limiteMax). Nº de passadas =
// teto(maxDose / limiteMax). Cada passada vira uma DoseCalculada própria (mapa +
// financeiro recalculado; frete/aplicação contam por passada).
export function dividirDoseEmPassadas(dose: DoseCalculada, limiteMax: number, areaHa: number): DoseCalculada[] {
  if (!(limiteMax > 0)) return [dose];
  const { valores } = decodeGrid(dose.grid);
  let maxV = 0;
  for (let i = 0; i < valores.length; i++) { const v = valores[i]; if (isFinite(v) && v > maxV) maxV = v; }
  const n = Math.max(1, Math.ceil(maxV / limiteMax - 1e-9));
  if (n <= 1) return [dose];
  const u = (dose.unidade || '').toLowerCase();
  const ehT = u.includes('t/ha') || u.includes('ton');
  const passes: DoseCalculada[] = [];
  for (let i = 0; i < n; i++) {
    const arr = new Float32Array(valores.length);
    let mn = Infinity, mx = -Infinity, soma = 0, cnt = 0;
    for (let j = 0; j < valores.length; j++) {
      const v = valores[j];
      if (!isFinite(v)) { arr[j] = NaN; continue; }
      const p = Math.min(Math.max(v - i * limiteMax, 0), limiteMax);
      arr[j] = p; cnt++; soma += p; if (p < mn) mn = p; if (p > mx) mx = p;
    }
    const media = cnt ? soma / cnt : 0;
    const tonHa = ehT ? media : media / 1000;
    const custoProdutoHa = tonHa * (dose.custoTonelada ?? 0);
    const custoHa = custoProdutoHa + (dose.freteHa ?? 0) + (dose.aplicacaoHa ?? 0);
    passes.push({
      ...dose,
      equacaoId: `${dose.equacaoId}__ap${i + 1}`,
      nomeEquacao: `${dose.nomeEquacao} — aplicação ${i + 1}/${n}`,
      grid: { b64: float32ParaB64(arr), shape: dose.grid.shape },
      stats: { min: cnt ? mn : 0, media, max: cnt ? mx : 0, n: cnt },
      toneladas: tonHa * areaHa, custoProdutoHa, custoHa, custo: custoHa * areaHa, usar: true,
      doseMinima: 0,   // cada passada é fração — não cortar pela mínima (só zero fica transparente)
    });
  }
  return passes;
}
