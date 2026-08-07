// BIBLIOTECA DE INSUMOS (Parte XIV) — cadastro central dos produtos usados na
// plataforma, e o motor de COMPLEMENTAÇÃO POR NUTRIENTE.
//
// Por que centralizar: o campo "Produto" da prescrição era texto livre. Dois
// agrônomos escreviam "Ureia", "ureia 45" e "URÉIA" para o mesmo insumo, e a
// garantia — o número que faz a conta — não existia em lugar nenhum: ficava na
// cabeça de quem prescrevia. Sem garantia cadastrada não há como saber quanto
// de N um adubo entrega, e é exatamente isso que a complementação precisa.
//
// Este módulo é PURO (sem browser/DOM): o CRUD vive na Biblioteca genérica
// (lib/biblioteca.ts) e a UI só monta os formulários. Assim a conta que define
// quanto adubo vai para o campo pode ser testada em node.
//
// Rodar: npm run teste:insumos

export type CategoriaInsumo =
  | 'fertilizante' | 'corretivo' | 'gesso' | 'esterco' | 'composto'
  | 'semente' | 'personalizado';

export const ROTULO_CATEGORIA: Record<CategoriaInsumo, string> = {
  fertilizante: 'Fertilizantes minerais',
  corretivo: 'Corretivos',
  gesso: 'Gesso',
  esterco: 'Estercos',
  composto: 'Compostos orgânicos',
  semente: 'Sementes',
  personalizado: 'Produtos personalizados',
};

/** Nutrientes que a complementação sabe usar (um por cálculo, nesta versão). */
export type Nutriente = 'n' | 'p2o5' | 'k2o' | 's' | 'ca' | 'mg';

export const ROTULO_NUTRIENTE: Record<Nutriente, string> = {
  n: 'Nitrogênio (N)', p2o5: 'Fósforo (P₂O₅)', k2o: 'Potássio (K₂O)',
  s: 'Enxofre (S)', ca: 'Cálcio (Ca)', mg: 'Magnésio (Mg)',
};

export const SIMBOLO_NUTRIENTE: Record<Nutriente, string> = {
  n: 'N', p2o5: 'P₂O₅', k2o: 'K₂O', s: 'S', ca: 'Ca', mg: 'Mg',
};

export const NUTRIENTES: Nutriente[] = ['n', 'p2o5', 'k2o', 's', 'ca', 'mg'];

/** Garantias em % da massa do produto (o que vem no saco). */
export interface GarantiasInsumo {
  n?: number; p2o5?: number; k2o?: number; s?: number; ca?: number; mg?: number;
  // micros (opcionais, informativos nesta versão)
  b?: number; zn?: number; cu?: number; mn?: number; fe?: number; mo?: number;
}

/** Orgânicos: garantias vêm em kg/t do produto, e a umidade importa. */
export interface DadosOrganico {
  umidadePct?: number;
  materiaSecaPct?: number;
  densidade?: number;            // t/m³
  /** kg do nutriente por TONELADA do produto (mesma base de AnaliseOrganico). */
  garantiasKgT?: { n?: number; p2o5?: number; k2o?: number; ca?: number; mg?: number };
}

export interface DadosSemente {
  cultura?: string;
  cultivar?: string;
  pmsG?: number;                 // peso de mil sementes (g)
  germinacaoPct?: number;
  vigorPct?: number;
  pesoEmbalagemKg?: number;
  sementesPorEmbalagem?: number;
}

/** Unidade em que o PREÇO do insumo é digitado, mostrado e gravado. */
export type UnidadePreco = 'kg' | 't';

export interface ConteudoInsumo {
  categoria: CategoriaInsumo;
  /** % em massa — fertilizante, corretivo, gesso e personalizado. */
  garantias?: GarantiasInsumo;
  organico?: DadosOrganico;
  semente?: DadosSemente;
  /** R$ pela unidade de `precoUnidade` — leia sempre por `precoNaUnidade`. */
  precoMedio?: number;
  /** Unidade de `precoMedio`. Ausente = 'kg' (cadastros anteriores à v2.41). */
  precoUnidade?: UnidadePreco;
  fornecedor?: string;
  observacoes?: string;
}

/**
 * Semente se compra por QUILO (é assim que vem o saco); todo o resto do que vai
 * ao campo se compra por TONELADA. Calcário a "R$ 0,35/kg" não é como se cota,
 * se confere nota nem se fecha pedido — e um zero a menos num número desses
 * passa despercebido justamente por causa das casas decimais.
 */
export const unidadePreco = (c: CategoriaInsumo): UnidadePreco => (c === 'semente' ? 'kg' : 't');

/** Quilos por unidade de preço — a régua das conversões. */
const KG_POR: Record<UnidadePreco, number> = { kg: 1, t: 1000 };

/**
 * Preço do insumo convertido para `alvo`; `undefined` quando não há preço.
 *
 * Cadastro sem `precoUnidade` é anterior à v2.41, quando TODO preço era por
 * quilo — e é assim que ele é lido. Nada de migração em massa multiplicando por
 * 1000: se a marca de "já converti" se perdesse (outro navegador, nuvem ainda
 * não hidratada), o preço seria multiplicado de novo e nada no dado diria que
 * isso aconteceu. Número que se descreve não corre esse risco.
 */
export function precoNaUnidade(c: ConteudoInsumo, alvo: UnidadePreco): number | undefined {
  const p = c.precoMedio;
  if (p == null || !isFinite(p)) return undefined;
  const v = (p * KG_POR[alvo]) / KG_POR[c.precoUnidade ?? 'kg'];
  return Math.round(v * 1e6) / 1e6;      // 0,35 × 1000 dá 350,00000000000006
}

/** A complementação por nutriente só vale para fertilizante mineral (regra 12.5). */
export const podeComplementar = (c: CategoriaInsumo): boolean => c === 'fertilizante';

/** Garantia (%) de um nutriente no insumo. 0 quando não declarada. */
export function garantiaDe(insumo: ConteudoInsumo, nutriente: Nutriente): number {
  const g = insumo.garantias?.[nutriente];
  return typeof g === 'number' && isFinite(g) ? g : 0;
}

// ── Motor da complementação (Parte XIV §7) ──────────────────────────────────

export interface EntradaComplemento {
  /** meta do nutriente, kg/ha */
  metaKgHa: number;
  /** garantia do produto BASE, em % */
  baseGarantiaPct: number;
  /** dose já aplicada do produto base, kg/ha */
  baseDoseKgHa: number;
  /** garantia do produto COMPLEMENTAR, em % */
  compGarantiaPct: number;
}

export interface ResultadoComplemento {
  fornecidoKgHa: number;      // quanto o base já entrega do nutriente
  faltanteKgHa: number;       // o que falta para a meta (nunca negativo)
  doseCompKgHa: number;       // dose do complementar para fechar a meta
  excedenteKgHa: number;      // quanto o base passou da meta (0 quando não passa)
  avisos: string[];
}

/**
 * Quanto do complementar aplicar para fechar a meta do nutriente.
 *
 * base fornece = dose × garantia/100; falta = meta − fornecido; dose do
 * complementar = falta ÷ (garantia/100).
 *
 * Os casos que a conta crua erra e que aqui viram aviso: o base já passou da
 * meta (faltante negativo viraria dose negativa — "aplicar menos que nada") e
 * o complementar sem garantia do nutriente (divisão por zero → Infinity, que
 * chegaria à máquina como dose absurda).
 */
export function complementarNutriente(e: EntradaComplemento): ResultadoComplemento {
  const avisos: string[] = [];
  const meta = Math.max(0, e.metaKgHa || 0);
  const fornecido = Math.max(0, (e.baseDoseKgHa || 0) * (e.baseGarantiaPct || 0) / 100);
  const bruto = meta - fornecido;
  const faltante = Math.max(0, bruto);
  const excedente = Math.max(0, -bruto);

  if (meta <= 0) avisos.push('Informe a meta do nutriente (kg/ha).');
  if (excedente > 0) {
    avisos.push(`O produto base já entrega ${(fornecido).toFixed(1)} kg/ha — ${(excedente).toFixed(1)} kg/ha ACIMA da meta. Não há o que complementar.`);
  }

  let doseComp = 0;
  if (faltante > 0) {
    if (!e.compGarantiaPct || e.compGarantiaPct <= 0) {
      avisos.push('O produto complementar não tem garantia declarada para este nutriente — sem ela não dá para calcular a dose.');
    } else {
      doseComp = faltante / (e.compGarantiaPct / 100);
    }
  }
  return {
    fornecidoKgHa: fornecido,
    faltanteKgHa: faltante,
    doseCompKgHa: doseComp,
    excedenteKgHa: excedente,
    avisos,
  };
}

/**
 * Complementação POR ZONA — quando o produto base vem de uma prescrição já
 * salva, cada zona recebeu uma dose diferente, logo cada zona já tem uma
 * quantidade diferente do nutriente. Uma dose única de complemento jogaria
 * fora a taxa variável que já tinha sido decidida na prescrição base.
 */
export interface ZonaComplemento {
  idZona: string;
  /** dose do produto BASE naquela zona (kg/ha) */
  baseDoseKgHa: number;
}

export interface ResultadoZonaComplemento extends ResultadoComplemento {
  idZona: string;
}

export function complementarPorZona(
  zonas: ZonaComplemento[],
  e: Omit<EntradaComplemento, 'baseDoseKgHa'>,
): ResultadoZonaComplemento[] {
  return zonas.map(z => ({
    idZona: z.idZona,
    ...complementarNutriente({ ...e, baseDoseKgHa: z.baseDoseKgHa }),
  }));
}

/** Quanto de nutriente uma dose entrega (kg/ha), pela garantia em %. */
export function nutrienteFornecido(doseKgHa: number, garantiaPct: number): number {
  return (doseKgHa || 0) * (garantiaPct || 0) / 100;
}
