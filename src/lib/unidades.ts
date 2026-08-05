// Conversão de unidades de laboratório → unidade CANÔNICA da plataforma.
//
// Canônico = padrão São Paulo/Fundação ABC (o das legendas seed):
//   • bases/CTC/Al (K, Ca, Mg, Al, CTC, t): mmolc/dm³
//   • P, S, micros (B, Zn, Cu, Mn):          mg/dm³
//   • Matéria orgânica:                       g/dm³
//   • V%, m%:                                 %
//   • Argila/textura:                         %
//   • pH:                                     adimensional
//
// valor_canonico = valor × fator(elId, unidadeDeOrigem). Se a origem já é a
// canônica (ou desconhecida), fator = 1 (nada muda — retrocompatível).

// Elementos com CARGA (canônico mmolc/dm³). h/na/ca_mg: variáveis do catálogo
// complementar (lista InCeres) — grandezas de carga; sem isto o dropdown de
// unidade e a conversão cmolc→mmolc não valeriam para elas.
const CARGA = new Set(['k', 'ca', 'mg', 'al', 'ctc', 't', 'sb', 'hal', 'h_al', 'h', 'na', 'ca_mg', 'c', 'n']);

// Percentuais (saturações), granulometria (aceita g/kg) e adimensionais (pH por
// método e relações entre elementos). Sem estes conjuntos, toda variável fora do
// seed básico caía na lista de P/micros: o dropdown oferecia "mg/dm³" para Silte
// e para Ca/Mg, e a unidade "%" escrita no laudo não era reconhecida.
const PERCENTUAL = new Set(['v', 'm', 'h_pct', 'h_al_pct', 'si']);
const GRANULOMETRIA = new Set(['textura', 'silte', 'areia_total', 'areia_grossa', 'areia_fina']);
const ADIMENSIONAL = new Set([
  'ph_cacl2', 'ph_agua', 'ph_kcl', 'ph_smp', 'ras',
  'rel_ca_k', 'rel_ca_mg', 'rel_camg_k', 'rel_mg_k', 'rel_s_p', 'rel_k_na', 'rel_fe_mn', 'rel_p_zn',
]);

// mg/dm³ equivalentes a 1 mmolc/dm³ (peso do elemento ÷ valência). Só onde faz
// sentido reportar em massa: K(39,10/1), Ca(40,08/2), Mg(24,31/2), Al(26,98/3), Na(22,99/1).
const MG_POR_MMOLC: Record<string, number> = { k: 39.10, ca: 20.04, mg: 12.15, al: 8.99, na: 22.99 };

export const UNIDADE_CANONICA: Record<string, string> = {
  ph: '', p: 'mg/dm³', mo: 'g/dm³', v: '%', m: '%',
  k: 'mmolc/dm³', ca: 'mmolc/dm³', mg: 'mmolc/dm³', al: 'mmolc/dm³', ctc: 'mmolc/dm³', t: 'mmolc/dm³',
  s: 'mg/dm³', b: 'mg/dm³', zn: 'mg/dm³', cu: 'mg/dm³', mn: 'mg/dm³', textura: '%',
};

export function unidadeCanonica(elId: string): string {
  if (UNIDADE_CANONICA[elId] != null) return UNIDADE_CANONICA[elId];
  if (CARGA.has(elId)) return 'mmolc/dm³';
  if (PERCENTUAL.has(elId) || GRANULOMETRIA.has(elId)) return '%';
  return '';
}

// Unidades OFERECIDAS por elemento (dropdown). A 1ª é a canônica.
export function unidadesDe(elId: string): string[] {
  if (elId === 'ph') return ['pH'];
  if (ADIMENSIONAL.has(elId)) return ['—'];
  if (elId === 'v' || elId === 'm' || PERCENTUAL.has(elId)) return ['%'];
  if (elId === 'mo') return ['g/dm³', 'g/kg', 'dag/kg', '%'];
  if (GRANULOMETRIA.has(elId)) return ['%', 'g/kg'];
  if (CARGA.has(elId)) return ['mmolc/dm³', 'cmolc/dm³', 'meq/100cm³', ...(MG_POR_MMOLC[elId] ? ['mg/dm³'] : [])];
  return ['mg/dm³', 'mg/kg', 'ppm']; // P, S, micros
}

// Normaliza a grafia (³→3, sem acento/espaço, minúsculo).
function nu(u: string): string {
  return (u || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/³/g, '3').replace(/\s+/g, '');
}

// Fator multiplicativo p/ levar `unidade` → unidade canônica do elemento.
export function fatorParaCanonico(elId: string, unidade: string): number {
  const u = nu(unidade);
  if (!u) return 1;
  const can = nu(unidadeCanonica(elId));
  if (u === can) return 1;

  if (CARGA.has(elId)) {
    if (u === 'mmolc/dm3' || u === 'mmolc/kg' || u === 'mmol/dm3') return 1;
    if (u === 'cmolc/dm3' || u === 'cmolc/kg' || u === 'cmol/dm3' || u === 'meq/100cm3' || u === 'meq/100g' || u === 'meq/100ml') return 10;
    if ((u === 'mg/dm3' || u === 'mg/kg' || u === 'ppm' || u === 'mg/l') && MG_POR_MMOLC[elId]) return 1 / MG_POR_MMOLC[elId];
    return 1;
  }
  if (elId === 'mo') {
    if (u === 'g/dm3' || u === 'g/kg' || u === 'g/l') return 1;      // densidade ~1
    if (u === '%' || u === 'dag/kg') return 10;                       // 1% = 10 g/dm³
    return 1;
  }
  if (GRANULOMETRIA.has(elId)) {
    if (u === '%' || u === '%argila' || u === 'percent') return 1;
    if (u === 'g/kg' || u === 'g/dm3') return 0.1;                    // 10 g/kg = 1%
    return 1;
  }
  // P, S, micros: mg/dm³ = mg/kg = ppm (densidade ~1)
  if (u === 'mg/dm3' || u === 'mg/kg' || u === 'ppm' || u === 'mg/l') return 1;
  return 1;
}

export function converterParaCanonico(elId: string, valor: number, unidade?: string | null): number {
  if (!unidade) return valor;
  const f = fatorParaCanonico(elId, unidade);
  return f === 1 ? valor : valor * f;
}

// Precisa converter? (unidade informada e diferente da canônica com fator ≠ 1)
export function precisaConverter(elId: string, unidade?: string | null): boolean {
  return !!unidade && fatorParaCanonico(elId, unidade) !== 1;
}

// ── Leitura da UNIDADE escrita no laudo ──────────────────────────────────────
// Laudos em coluna (export InCeres e afins) trazem uma 2ª linha de cabeçalho só
// com a unidade de cada coluna ("mmolc/dm³", "g/dm³", "Sem Unidade"…). Estas duas
// funções deixam `autoConfig` (lab.ts) ler essa linha em vez de ASSUMIR que o
// laudo já veio na unidade canônica — que é o que o app fazia (acertava por sorte
// quando o lab usava o mesmo padrão de São Paulo, e errava calado quando não).

// Rótulo que significa "esta coluna não tem unidade" (pH, relações, textos).
export function ehRotuloSemUnidade(texto: string): boolean {
  const u = nu(texto);
  return u === '' || u === '-' || u === '—' || u === 'semunidade' || u === 'adimensional' || u === 'n/a';
}

// Grafias equivalentes que não estão no dropdown → a listada de mesmo significado
// (o fator de conversão já as trata em fatorParaCanonico; aqui é só p/ o <select>).
const ALIAS_UNIDADE: Record<string, string> = {
  'mmolc/kg': 'mmolc/dm3', 'mmol/dm3': 'mmolc/dm3',
  'cmolc/kg': 'cmolc/dm3', 'cmol/dm3': 'cmolc/dm3',
  'meq/100g': 'meq/100cm3', 'meq/100ml': 'meq/100cm3',
  'mg/l': 'mg/dm3', 'g/l': 'g/dm3',
};

// Texto da unidade escrito no laudo → a string EXATA de unidadesDe(elId), ou
// undefined (rótulo sem unidade / unidade desconhecida → fator 1, sem mexer no
// valor). Precisa ser a string exata: o <select> de unidade da tela de importação
// compara por valor, e um "mmolc/dm3" sem o ³ não casaria com nenhuma opção.
export function casarUnidade(elId: string, texto: string): string | undefined {
  if (ehRotuloSemUnidade(texto)) return undefined;
  const opcoes = unidadesDe(elId);
  const alvo = nu(texto);
  return opcoes.find(o => nu(o) === alvo) ?? opcoes.find(o => nu(o) === ALIAS_UNIDADE[alvo]);
}
