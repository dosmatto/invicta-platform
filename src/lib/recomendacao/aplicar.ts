'use client';

// Fase R3 — aplica uma equação aos mapas de fertilidade de um talhão+importação,
// gerando o grid de DOSE (álgebra de mapas pixel a pixel via motor.ts). Carrega
// os grids salvos na nuvem (prefixo largo, igual à aba Fertilidade e ao relatório)
// e resolve cada atributo da equação na profundidade que a própria equação define.

import { cloudCarregarMapasPorPrefixo } from '../cloud';
import { descomprimirGrid, decodeGrid, type RespInterp } from '../fertilidade';
import { compilar, executarGrid, atributoPorToken, ajustarDose } from './motor';
import type { ConteudoEquacao } from '../biblioteca';

type MapaPronto = { resp: RespInterp; labels?: GeoJSON.FeatureCollection; interpoladoEm?: string };

// Carrega os grids do talhão+importação, indexados por `nut__prof`. Desempata
// igual à aba/relatório: prefere COM grid; entre iguais, o mais recente.
export async function carregarGridsTalhao(talhaoId: string, importacaoId: string): Promise<Record<string, RespInterp>> {
  const prefixo = `${talhaoId}__${importacaoId}__`;
  const carregados = await cloudCarregarMapasPorPrefixo<MapaPronto>(prefixo);
  const escolhido: Record<string, { resp: RespInterp; em: string; tem: boolean }> = {};
  for (const c of carregados) {
    const partes = c.id.slice(prefixo.length).split('__');
    if (partes.length < 2) continue;
    const chave = `${partes[partes.length - 2]}__${partes[partes.length - 1]}`;
    const em = c.dados.interpoladoEm ?? '';
    const tem = !!c.dados.resp?.grid?.b64;
    const atual = escolhido[chave];
    if (atual) {
      const trocar = (tem && !atual.tem) || (tem === atual.tem && em > atual.em);
      if (!trocar) continue;
    }
    if (c.dados.resp?.grid?.comp === 'gz') {
      try { c.dados.resp.grid = await descomprimirGrid(c.dados.resp.grid); } catch { /* segue */ }
    }
    escolhido[chave] = { resp: c.dados.resp, em, tem };
  }
  const out: Record<string, RespInterp> = {};
  for (const k in escolhido) out[k] = escolhido[k].resp;
  return out;
}

export interface ResultadoAplicacao {
  grid: { b64: string; shape: [number, number] };
  bounds: [number, number, number, number];
  stats: { min: number; media: number; max: number; n: number };
}

function float32ParaB64(arr: Float32Array): string {
  const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < u8.length; i += CHUNK) s += String.fromCharCode(...u8.subarray(i, i + CHUNK));
  return btoa(s);
}

export function aplicarEquacao(eq: ConteudoEquacao, grids: Record<string, RespInterp>): ResultadoAplicacao {
  const prof = eq.profundidade || '0-20';
  const c = compilar(eq.script, eq.constantes);
  if (!c.ok) throw new Error(c.erro);
  const prog = c.prog;

  const gridPorVar = new Map<string, Float32Array>();
  let ref: RespInterp | null = null;
  const faltando: string[] = [];
  for (const v of prog.varsExternas) {
    const at = atributoPorToken(v);
    if (!at) { faltando.push(v); continue; }
    const resp = grids[`${at.nut}__${prof}`];
    if (!resp || !resp.grid?.b64) { faltando.push(`${at.token} ${prof}`); continue; }
    if (!ref) ref = resp;
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
    if (arr.length !== n) throw new Error('Os mapas dos atributos têm tamanhos diferentes (pixel diferente). Reprocesse-os com o mesmo pixel na aba Fertilidade.');
  }

  const dose = executarGrid(prog, eq.constantes, gridPorVar, n);
  const opts = { naoNegativo: eq.naoNegativo, doseMinima: eq.doseMinimaViavel ?? 0, abaixoMinimo: eq.abaixoMinimo ?? 'zero' as const };
  for (let i = 0; i < n; i++) dose[i] = ajustarDose(dose[i], opts);

  let mn = Infinity, mx = -Infinity, soma = 0, cnt = 0;
  for (let i = 0; i < n; i++) { const d = dose[i]; if (!isFinite(d)) continue; cnt++; soma += d; if (d < mn) mn = d; if (d > mx) mx = d; }

  return {
    grid: { b64: float32ParaB64(dose), shape: [rows, cols] },
    bounds: ref.bounds,
    stats: { min: cnt ? mn : 0, media: cnt ? soma / cnt : 0, max: cnt ? mx : 0, n: cnt },
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
}

export function calcularDose(
  eq: { id: string; nome: string; conteudo: ConteudoEquacao },
  grids: Record<string, RespInterp>, areaHa: number,
): DoseCalculada {
  const res = aplicarEquacao(eq.conteudo, grids);
  const c = eq.conteudo;
  const u = (c.unidadeTratamento || '').toLowerCase();
  const ehT = u.includes('t/ha') || u.includes('ton');
  const toneladas = ehT ? res.stats.media * areaHa : res.stats.media * areaHa / 1000;
  const tonHa = areaHa > 0 ? toneladas / areaHa : 0;
  const custoProdutoHa = tonHa * (c.custoTonelada ?? 0);
  const freteHa = c.freteHa ?? 0;
  const aplicacaoHa = c.aplicacaoHa ?? 0;
  const custoHa = custoProdutoHa + freteHa + aplicacaoHa;
  return {
    equacaoId: eq.id, nomeEquacao: eq.nome, produto: c.produto, unidade: c.unidadeTratamento,
    estilo: c.estilo, grid: res.grid, bounds: res.bounds, stats: res.stats, toneladas,
    custoTonelada: c.custoTonelada, freteHa, aplicacaoHa, custoProdutoHa, custoHa, custo: custoHa * areaHa,
  };
}
