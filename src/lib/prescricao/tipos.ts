// Prescrições Agronômicas — modelo de dados.
//
// Uma PRESCRIÇÃO transforma um mapa (zonas de manejo, por ora) em doses
// operacionais por zona, prontas para virar arquivo de aplicação (SHP/Excel/
// PDF). Ela guarda TUDO o que a gerou (fonte, modo, parâmetros) para ser
// reproduzível, e carrega versão + histórico de alterações — prescrição é
// documento operacional: o que foi para a máquina precisa ser rastreável.

export type TipoPrescricao = 'sementes' | 'fertilizante' | 'corretivo' | 'organico' | 'personalizado';

export const ROTULO_TIPO: Record<TipoPrescricao, string> = {
  sementes: 'População de sementes',
  fertilizante: 'Fertilizante',
  corretivo: 'Corretivo',
  organico: 'Esterco / orgânico',
  personalizado: 'Produto personalizado',
};

export type ModoCalculo = 'manual' | 'estoque' | 'proporcional' | 'equacao';

export const ROTULO_MODO: Record<ModoCalculo, string> = {
  manual: 'Dose manual por zona',
  estoque: 'Quantidade total disponível',
  proporcional: 'Distribuição proporcional',
  equacao: 'Por equação salva',
};

// Unidade da DOSE (por hectare). O total usa a unidade-base correspondente
// (kg/ha→kg, t/ha→t, sementes/ha→sementes, L/ha→L).
// sementes/m = sementes por METRO LINEAR de fileira (como o operador regula a
// plantadeira). Converte para total via espaçamento — ver fatorBaseDose().
export type UnidadeDose = 'kg/ha' | 't/ha' | 'sementes/ha' | 'sementes/m' | 'L/ha';

export interface ZonaDose {
  idZona: string;
  nomeZona: string;
  classe: string;              // "Alta", "Média", ... (vem do zoneamento)
  cor: string;                 // cor da zona no mapa de origem
  areaHa: number;
  potencialRank?: number;      // 1 = maior potencial (vem do zoneamento)
  dose: number;                // na UnidadeDose da prescrição
}

export interface HistoricoPrescricao {
  em: string;                  // ISO
  por: string;                 // e-mail
  resumo: string;              // "criada", "doses editadas", "exportada SHP"…
}

// Parâmetros específicos de SEMENTES (fluxo próprio do MVP).
export interface ParamsSementes {
  cultivar?: string;
  pmsG?: number;               // peso de mil sementes (g)
  germinacaoPct: number;
  purezaPct?: number;
  sobrevivenciaPct?: number;   // emergência/estande a campo
  espacamentoM?: number;       // entre linhas
  sementesPorSaco?: number;
  populacaoMin?: number;       // plantas/ha
  populacaoMax?: number;
  margemPct?: number;          // segurança do "otimizar uso" (1, 2%…)
}

// Análise química do esterco/orgânico (teores em kg por tonelada do produto).
export interface AnaliseOrganico {
  tipo?: string;               // "cama de aviário", "dejeto suíno"…
  n?: number; p2o5?: number; k2o?: number; ca?: number; mg?: number;
  densidade?: number;          // t/m³ (informativo)
}

export interface ParamsCalculo {
  // estoque
  totalDisponivel?: number;    // na unidade-base (kg, t, sementes, L)
  doseMin?: number;
  doseMax?: number;
  incremento?: number;         // passo mínimo da máquina (na UnidadeDose)
  relacao?: 'direta' | 'inversa';   // maior potencial → maior dose (direta) ou o contrário
  // proporcional
  doseMedia?: number;
  variacaoPct?: number;
  // fluxos específicos
  sementes?: ParamsSementes;
  organico?: AnaliseOrganico;
}

export interface RegistroExporte {
  em: string;
  por: string;
  formato: 'shp' | 'xlsx' | 'pdf' | 'geojson' | 'kml' | 'csv';
  arquivo: string;             // nome do arquivo gerado
}

export interface Prescricao {
  id: string;
  talhaoId: string;
  ano?: string;                // rótulo do Ano/ciclo
  nome: string;                // "Calcário 2026", "Soja B1 — população"…
  tipo: TipoPrescricao;
  produto: string;             // nome comercial/insumo
  unidade: UnidadeDose;
  custoUnit?: number;          // R$ por unidade-base (kg/t/…)
  // origem
  zoneamentoId: string;
  zoneamentoNome: string;
  // cálculo (reproduzível)
  modo: ModoCalculo;
  params: ParamsCalculo;
  /** modo 'equacao': id da equação salva usada + os valores de entrada por zona
   *  (idZona → { varLower → número }) para reproduzir o cálculo. */
  equacaoId?: string;
  equacaoNome?: string;
  valoresEquacao?: Record<string, Record<string, number>>;
  // resultado
  zonas: ZonaDose[];
  /** SNAPSHOT das geometrias das zonas (FeatureCollection com properties.id
   *  casando com ZonaDose.idZona). Copiado do zoneamento na criação: prescrição
   *  é documento operacional — apagar/editar o zoneamento depois não pode mudar
   *  o que foi exportado para a máquina. */
  fc: GeoJSON.FeatureCollection;
  // documento
  versao: number;
  criadoEm: string;
  criadoPor: string;
  atualizadoEm: string;
  historico: HistoricoPrescricao[];
  exportes: RegistroExporte[];
  empresaId?: string;
}

// Fator unidade-base → rótulo do TOTAL (para resumos e validações).
export const UNIDADE_TOTAL: Record<UnidadeDose, string> = {
  'kg/ha': 'kg', 't/ha': 't', 'sementes/ha': 'sementes', 'sementes/m': 'sementes', 'L/ha': 'L',
};

// A unidade da dose é contada em SEMENTES (por ha ou por metro)?
export const ehUnidadeSemente = (u: UnidadeDose): boolean => u === 'sementes/ha' || u === 'sementes/m';
