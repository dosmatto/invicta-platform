// Seleção de cenas de satélite (pendência 40) — motor PURO (testável em Node).
//
// Duas perguntas, uma regra só:
//   1. Esta cena presta para este talhão?            → avaliarRegras
//   2. Das que prestam, quais eu processo?           → melhoresPorJanela
//
// Existe porque o número que o catálogo entrega de graça — `eo:cloud_cover` — é
// a nuvem da CENA INTEIRA (~110 km) e engana. Medido num pivô real de Mato
// Grosso: a cena de 17,6% de nuvem deixou 69% do talhão limpo; a de 9,2% deixou
// 58%. Escolher pela nuvem da cena é escolher errado. O que decide é `pctLimpo`,
// que vem da máscara de nuvem recortada NO TALHÃO (rota /ndvi-avaliar).
//
// As MESMAS regras rodam no robô noturno, em Python (backend/agenda.py). A
// duplicação é consciente — o backend não importa TypeScript — e os dois lados
// usam os mesmos vetores de teste (scripts/teste-msr-selecao.mjs).

import { MIN_PCT_VALIDOS_ZONAS } from './composicao.ts';

export type FonteCena = 'sentinel' | 'cbers';

/** Uma cena depois de avaliada. `pctLimpo`/`ndviMedio` nulos = ainda não avaliada. */
export interface CenaAval {
  id: string;
  data: string;                 // 'YYYY-MM-DD'
  fonte: FonteCena;
  nuvem: number | null;         // % da CENA (catálogo) — não do talhão
  pctLimpo: number | null;      // % do TALHÃO sem nuvem/sombra
  ndviMedio: number | null;     // média do índice no que sobrou
  semMascara?: boolean;         // CBERS: sem banda de qualidade — nuvem não é detectada
}

export interface RegrasMsr {
  /** % máx de nuvem da CENA — filtro barato, aplicado já no catálogo. */
  nuvemMaxCena: number;
  /** % mín do TALHÃO livre de nuvem/sombra. */
  pctLimpoMin: number;
  /** NDVI médio mín — barra solo nu, pós-colheita e cena morta. */
  ndviMin: number;
  /** Dias mínimos entre duas cenas guardadas do mesmo talhão. */
  intervaloMinDias: number;
}

// pctLimpoMin nasce do limiar que a Composição Temporal já usa para liberar uma
// camada para Zonas de Manejo. Um segundo número aqui só criaria divergência.
export const REGRAS_PADRAO: RegrasMsr = {
  nuvemMaxCena: 20,
  pctLimpoMin: MIN_PCT_VALIDOS_ZONAS,
  ndviMin: 0.15,
  intervaloMinDias: 5,
};

export type Motivo =
  | 'ok' | 'sem_mascara' | 'nuvem_cena' | 'pct_limpo' | 'ndvi_min'
  | 'intervalo' | 'sem_avaliacao';

/** Texto de UI e de log — o usuário precisa saber POR QUE a cena foi recusada. */
export const TEXTO_MOTIVO: Record<Motivo, string> = {
  ok: 'aceita',
  sem_mascara: 'sensor sem máscara de nuvem — não dá para garantir o talhão limpo',
  nuvem_cena: 'nuvem da cena acima do limite',
  pct_limpo: 'talhão encoberto (pouco pixel limpo)',
  ndvi_min: 'vigor abaixo do mínimo — provável solo exposto ou pós-colheita',
  intervalo: 'muito perto da cena anterior já guardada',
  sem_avaliacao: 'cena ainda não avaliada',
};

/** Dias inteiros entre duas datas 'YYYY-MM-DD' (UTC — imune a horário de verão). */
export function diasEntre(a: string, b: string): number {
  const ms = Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z');
  return Math.round(ms / 86400000);
}

export interface Veredito { aceita: boolean; motivo: Motivo }

/**
 * A cena serve? Checagens na ordem do mais barato para o mais caro — a mesma
 * ordem que o robô noturno segue, para que ele nunca baixe banda à toa.
 *
 * `ultimaSalvaData` ausente = a regra de intervalo não se aplica (primeira cena
 * do talhão). Limiar batido EXATAMENTE passa: "mínimo 70%" inclui 70%.
 */
export function avaliarRegras(
  c: CenaAval,
  r: RegrasMsr,
  ultimaSalvaData?: string | null,
  aceitarSemMascara = false,
): Veredito {
  if (c.semMascara && !aceitarSemMascara) return { aceita: false, motivo: 'sem_mascara' };
  if (c.nuvem != null && c.nuvem > r.nuvemMaxCena) return { aceita: false, motivo: 'nuvem_cena' };
  if (c.pctLimpo == null) return { aceita: false, motivo: 'sem_avaliacao' };
  if (c.pctLimpo < r.pctLimpoMin) return { aceita: false, motivo: 'pct_limpo' };
  if (c.ndviMedio == null) return { aceita: false, motivo: 'sem_avaliacao' };
  if (c.ndviMedio < r.ndviMin) return { aceita: false, motivo: 'ndvi_min' };
  if (ultimaSalvaData && diasEntre(ultimaSalvaData, c.data) < r.intervaloMinDias) {
    return { aceita: false, motivo: 'intervalo' };
  }
  return { aceita: true, motivo: 'ok' };
}

/**
 * A melhor cena de cada janela de `dias`, entre as que passam nas regras.
 *
 * Regra em uma frase, que é como ela precisa ser explicada ao agrônomo: divide o
 * período em faixas de N dias e, em cada faixa, fica a cena com MAIS talhão
 * limpo; empatou, a de maior vigor.
 *
 * A regra de intervalo mínimo NÃO entra aqui — quem dá o espaçamento é a própria
 * janela escolhida pelo usuário. O resultado não depende da ordem da entrada.
 */
export function melhoresPorJanela(
  cenas: CenaAval[],
  dias: number,
  r: RegrasMsr,
  aceitarSemMascara = false,
): string[] {
  const janela = Math.max(1, Math.floor(dias));
  const aptas = cenas
    .filter(c => avaliarRegras(c, r, null, aceitarSemMascara).aceita)
    .sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));
  if (aptas.length === 0) return [];

  const inicio = aptas[0].data;
  const melhorDoBalde = new Map<number, CenaAval>();
  for (const c of aptas) {
    const balde = Math.floor(diasEntre(inicio, c.data) / janela);
    const atual = melhorDoBalde.get(balde);
    if (!atual || melhor(c, atual)) melhorDoBalde.set(balde, c);
  }
  return [...melhorDoBalde.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, c]) => c.id);
}

// Desempate determinístico: mais talhão limpo → maior vigor → menos nuvem de
// cena → id (para que a mesma entrada, em qualquer ordem, dê a mesma saída).
function melhor(a: CenaAval, b: CenaAval): boolean {
  const pa = a.pctLimpo ?? -1, pb = b.pctLimpo ?? -1;
  if (pa !== pb) return pa > pb;
  const va = a.ndviMedio ?? -1, vb = b.ndviMedio ?? -1;
  if (va !== vb) return va > vb;
  const na = a.nuvem ?? 101, nb = b.nuvem ?? 101;
  if (na !== nb) return na < nb;
  return a.id.localeCompare(b.id) < 0;
}

// ── Fonte de análise: quais camadas GUARDADAS entram nos cálculos ────────────
// Guardar uma camada (★) e usá-la (◎) viraram decisões separadas. A regra é uma
// só e vale para Zonas de Manejo, Comparador, Produtividade e IA: sem marcação,
// a camada fica arquivada e não entra em cálculo nenhum. Mora aqui, e não junto
// da persistência (lib/ndviFontes.ts), para poder ser testada em Node.

/** Identidade de uma camada na marcação: talhão + chave (ndvi_s2__NDVI__data). */
export const idFonte = (talhaoId: string, chave: string) => `${talhaoId}:${chave}`;

/** Só as camadas marcadas como fonte de análise neste talhão. */
export function apenasFontes<T extends { chave: string }>(
  camadas: T[], talhaoId: string, marcadas: Record<string, boolean>,
): T[] {
  return camadas.filter(c => marcadas[idFonte(talhaoId, c.chave)] === true);
}

/**
 * Quanto cada cena guardada ocupa no banco, em MB.
 *
 * Serve para a tela avisar ANTES de o usuário marcar 40 talhões para
 * monitoramento: Float32 → gzip (~40% do cru em raster de índice) → base64
 * (+33%, porque o grid mora num campo jsonb).
 */
export function estimativaMbPorCena(nx: number, ny: number, nIndices = 1): number {
  const cru = Math.max(0, nx) * Math.max(0, ny) * 4;
  return (cru * 0.4 * (4 / 3) * Math.max(0, nIndices)) / 1e6;
}
