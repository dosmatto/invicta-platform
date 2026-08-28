// ÓXIDO × ELEMENTO para fósforo e potássio. Módulo PURO — npm run teste:exportacao.
//
// Por que existe (27/08/2026, pedido do usuário): a BIBLIOTECA DE EXPORTAÇÃO E
// EXTRAÇÃO passou a falar em ELEMENTO (P e K), que é como a literatura de
// absorção/exportação costuma publicar. A GARANTIA DO FERTILIZANTE continua em
// ÓXIDO (P₂O₅ e K₂O) — é o que a lei manda estampar no saco e o que está na
// nota fiscal; mudá-la obrigaria a redigitar o cadastro inteiro e a conferência
// contra a nota ficaria impossível.
//
// Com as duas bases convivendo, o cruzamento "quanto de adubo repõe isso"
// PRECISA converter antes de dividir. Sem isso o erro é de 20% no K e de 129%
// no P — e um erro desses passa despercebido, porque o número continua
// plausível.
//
// Fatores derivados das massas atômicas (IUPAC), não copiados de tabela: assim
// a conta fica auditável e ninguém precisa confiar num decimal solto.

const MASSA = { P: 30.973762, K: 39.0983, O: 15.999 } as const;

/** g/mol dos óxidos, para a conta ficar à vista. */
export const MASSA_MOLAR = {
  P2O5: 2 * MASSA.P + 5 * MASSA.O,   // 141,9425
  K2O:  2 * MASSA.K + MASSA.O,       // 94,1956
} as const;

/** Fração do ELEMENTO na massa do óxido. P₂O₅ → P = 0,436427; K₂O → K = 0,830151. */
export const OXIDO_PARA_ELEMENTO = {
  p2o5: (2 * MASSA.P) / MASSA_MOLAR.P2O5,
  k2o:  (2 * MASSA.K) / MASSA_MOLAR.K2O,
} as const;

/** O caminho de volta. P → P₂O₅ = 2,291335; K → K₂O = 1,204600. */
export const ELEMENTO_PARA_OXIDO = {
  p2o5: MASSA_MOLAR.P2O5 / (2 * MASSA.P),
  k2o:  MASSA_MOLAR.K2O / (2 * MASSA.K),
} as const;

/** Slots que têm as duas bases. N, S, Ca e Mg já são elementares no app. */
export type NutrienteOxido = keyof typeof OXIDO_PARA_ELEMENTO;
export const TEM_OXIDO = (nut: string): nut is NutrienteOxido =>
  nut === 'p2o5' || nut === 'k2o';

/** Símbolo do ELEMENTO por slot — para a Exportação/Extração e o relatório. */
export const SIMBOLO_ELEMENTO: Record<string, string> = {
  n: 'N', p2o5: 'P', k2o: 'K', s: 'S', ca: 'Ca', mg: 'Mg',
};

/** Valor em óxido → elemento. Slot sem óxido (N, S, Ca, Mg) passa direto. */
export function paraElemento(nut: string, valor: number): number {
  if (!Number.isFinite(valor)) return NaN;
  return TEM_OXIDO(nut) ? valor * OXIDO_PARA_ELEMENTO[nut] : valor;
}

/** Valor em elemento → óxido. É o que a garantia do saco espera. */
export function paraOxido(nut: string, valor: number): number {
  if (!Number.isFinite(valor)) return NaN;
  return TEM_OXIDO(nut) ? valor * ELEMENTO_PARA_OXIDO[nut] : valor;
}

/**
 * Converte a tabela de coeficientes inteira para elemento. Só P e K mudam;
 * campo ausente continua AUSENTE (não vira 0 — "não declarado" e "zero
 * declarado" são coisas diferentes no relatório).
 */
export function coefsParaElemento<T extends Record<string, number | undefined>>(coefs: T | undefined): T | undefined {
  if (!coefs) return coefs;
  const out = { ...coefs } as Record<string, number | undefined>;
  for (const nut of Object.keys(OXIDO_PARA_ELEMENTO) as NutrienteOxido[]) {
    const v = out[nut];
    if (typeof v === 'number' && Number.isFinite(v)) out[nut] = paraElemento(nut, v);
  }
  return out as T;
}
