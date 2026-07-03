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

// Elementos com CARGA (canônico mmolc/dm³).
const CARGA = new Set(['k', 'ca', 'mg', 'al', 'ctc', 't', 'sb', 'hal', 'h_al']);

// mg/dm³ equivalentes a 1 mmolc/dm³ (peso do elemento ÷ valência). Só onde faz
// sentido reportar em massa: K(39,10/1), Ca(40,08/2), Mg(24,31/2), Al(26,98/3).
const MG_POR_MMOLC: Record<string, number> = { k: 39.10, ca: 20.04, mg: 12.15, al: 8.99 };

export const UNIDADE_CANONICA: Record<string, string> = {
  ph: '', p: 'mg/dm³', mo: 'g/dm³', v: '%', m: '%',
  k: 'mmolc/dm³', ca: 'mmolc/dm³', mg: 'mmolc/dm³', al: 'mmolc/dm³', ctc: 'mmolc/dm³', t: 'mmolc/dm³',
  s: 'mg/dm³', b: 'mg/dm³', zn: 'mg/dm³', cu: 'mg/dm³', mn: 'mg/dm³', textura: '%',
};

export function unidadeCanonica(elId: string): string {
  return UNIDADE_CANONICA[elId] ?? (CARGA.has(elId) ? 'mmolc/dm³' : '');
}

// Unidades OFERECIDAS por elemento (dropdown). A 1ª é a canônica.
export function unidadesDe(elId: string): string[] {
  if (elId === 'ph') return ['pH'];
  if (elId === 'v' || elId === 'm') return ['%'];
  if (elId === 'mo') return ['g/dm³', 'g/kg', 'dag/kg', '%'];
  if (elId === 'textura') return ['%', 'g/kg'];
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
  if (elId === 'textura') {
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
