// Cálculo do CV (coeficiente de variação) por zona de manejo — MEAP Fase M1.
//
// Funções PURAS (sem React, sem window): recebem zonas + pontos + resultados de
// laboratório e devolvem o CV por zona. Conforme docs/13.02 §9.5:
//   - o CV é calculado na ESCALA ORIGINAL dos atributos medidos (P, K, argila…),
//     nunca sobre um índice normalizado;
//   - uma "variável de validação" vira o CV principal (headline) da zona;
//   - faixa legível: Alta ≤10% · Média 10–20% · Baixa >20%.
//
// Point-in-polygon é ray-casting próprio (turf só traz @turf/area no projeto).

import type { ResultadoAmostra } from '../lab';
import type { MetricasZonaMeap, Homogeneidade } from './tipos';

// Ordem de preferência para a variável de validação (headline). Argila/textura
// é a variável clássica que define ambiente; depois CTC e saturações; por fim
// macronutrientes. A primeira com cobertura em alguma zona é a escolhida.
const PRIORIDADE_VALIDACAO = ['textura', 'ctc', 'v', 'mo', 'p', 'k', 'ca', 'mg', 'ph'];

// ── Geometria: ponto dentro de polígono (com furos) e multipolígono ──────────
function pontoEmAnel(lng: number, lat: number, anel: GeoJSON.Position[]): boolean {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const xi = anel[i][0], yi = anel[i][1];
    const xj = anel[j][0], yj = anel[j][1];
    const cruza = (yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (cruza) dentro = !dentro;
  }
  return dentro;
}

function pontoEmPoligono(lng: number, lat: number, coords: GeoJSON.Position[][]): boolean {
  if (!coords.length || !pontoEmAnel(lng, lat, coords[0])) return false; // fora do anel externo
  for (let h = 1; h < coords.length; h++) if (pontoEmAnel(lng, lat, coords[h])) return false; // num furo
  return true;
}

export function pontoEmGeometria(lng: number, lat: number, geom: GeoJSON.Geometry): boolean {
  if (geom.type === 'Polygon') return pontoEmPoligono(lng, lat, geom.coordinates);
  if (geom.type === 'MultiPolygon') return geom.coordinates.some(p => pontoEmPoligono(lng, lat, p));
  return false;
}

// ── Estatística ──────────────────────────────────────────────────────────────
// CV (%) com desvio-padrão amostral (n-1). Null quando n<2 ou média ~0.
export function calcularCV(valores: number[]): number | null {
  const n = valores.length;
  if (n < 2) return null;
  const media = valores.reduce((s, v) => s + v, 0) / n;
  if (Math.abs(media) < 1e-9) return null;
  const variancia = valores.reduce((s, v) => s + (v - media) ** 2, 0) / (n - 1);
  const cv = (Math.sqrt(variancia) / Math.abs(media)) * 100;
  return Math.round(cv * 10) / 10; // 1 casa decimal
}

export function faixaHomogeneidade(cv: number): Homogeneidade {
  if (cv <= 10) return 'alta';
  if (cv <= 20) return 'media';
  return 'baixa';
}

// ── Orquestração: CV por zona ────────────────────────────────────────────────
export interface EntradaCV {
  zonas: { id: string; geometry: GeoJSON.Geometry }[];
  pontos: { numero: number; lng: number; lat: number }[];
  resultados: ResultadoAmostra[];
}

export interface SaidaCV {
  porZona: Record<string, MetricasZonaMeap>;
  variavelValidacao: string | null;
  profundidade: string | null; // camada usada no cálculo
}

export function calcularCVZonas(e: EntradaCV): SaidaCV {
  const vazio: SaidaCV = { porZona: {}, variavelValidacao: null, profundidade: null };

  // 1. Profundidade dominante (a com mais amostras) — evita misturar camadas.
  const contagemProf = new Map<string, number>();
  for (const r of e.resultados) contagemProf.set(r.profundidade, (contagemProf.get(r.profundidade) ?? 0) + 1);
  let profundidade: string | null = null, maxProf = -1;
  for (const [p, c] of contagemProf) if (c > maxProf) { maxProf = c; profundidade = p; }

  // 2. numero → valores (na camada dominante) e numero → coordenada.
  const valoresPorNumero = new Map<number, Record<string, number>>();
  for (const r of e.resultados) {
    if (r.profundidade !== profundidade) continue;
    valoresPorNumero.set(r.numero, { ...(valoresPorNumero.get(r.numero) ?? {}), ...r.valores });
  }
  const coordPorNumero = new Map<number, { lng: number; lat: number }>();
  for (const p of e.pontos) coordPorNumero.set(p.numero, { lng: p.lng, lat: p.lat });

  // Pontos utilizáveis: têm coordenada E valores.
  const amostras = [...valoresPorNumero.entries()]
    .filter(([num]) => coordPorNumero.has(num))
    .map(([num, valores]) => ({ ...coordPorNumero.get(num)!, valores }));

  // 3. CV por elemento, dentro de cada zona.
  const porZona: Record<string, MetricasZonaMeap> = {};
  for (const z of e.zonas) {
    const dentro = amostras.filter(a => pontoEmGeometria(a.lng, a.lat, z.geometry));
    const porElemento: Record<string, number[]> = {};
    for (const a of dentro) for (const [el, v] of Object.entries(a.valores)) (porElemento[el] ??= []).push(v);

    const cvPorAtributo: Record<string, number> = {};
    for (const [el, vals] of Object.entries(porElemento)) {
      const cv = calcularCV(vals);
      if (cv != null) cvPorAtributo[el] = cv;
    }
    porZona[z.id] = { cvValidacao: null, variavelValidacao: null, cvPorAtributo, homogeneidade: null, nPontos: dentro.length };
  }

  // 4. Escolha da variável de validação: 1ª da prioridade presente em alguma
  //    zona; senão, o elemento com maior cobertura entre as zonas.
  const cobertura = (el: string) => e.zonas.reduce((s, z) => s + (porZona[z.id].cvPorAtributo[el] != null ? 1 : 0), 0);
  let variavelValidacao = PRIORIDADE_VALIDACAO.find(el => cobertura(el) > 0) ?? null;
  if (!variavelValidacao) {
    const todos = new Set<string>();
    for (const z of e.zonas) for (const el of Object.keys(porZona[z.id].cvPorAtributo)) todos.add(el);
    let melhor = 0;
    for (const el of todos) { const c = cobertura(el); if (c > melhor) { melhor = c; variavelValidacao = el; } }
  }
  if (!variavelValidacao) return vazio;

  // 5. Preenche headline + faixa por zona.
  for (const z of e.zonas) {
    const m = porZona[z.id];
    const cv = m.cvPorAtributo[variavelValidacao];
    m.variavelValidacao = variavelValidacao;
    if (cv != null) { m.cvValidacao = cv; m.homogeneidade = faixaHomogeneidade(cv); }
  }

  return { porZona, variavelValidacao, profundidade };
}
