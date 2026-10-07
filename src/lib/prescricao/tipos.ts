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

export type ModoCalculo = 'manual' | 'estoque' | 'proporcional' | 'equacao' | 'ajuste' | 'complemento' | 'condicao';

export const ROTULO_MODO: Record<ModoCalculo, string> = {
  manual: 'Dose manual por zona',
  estoque: 'Quantidade total disponível',
  proporcional: 'Distribuição proporcional',
  equacao: 'Por equação salva',
  ajuste: 'Dose base + ajuste % por zona',
  complemento: 'Complementação por nutriente',
  condicao: 'Por condição no mapa de fertilidade',
};

/** Modo 'condicao': as áreas de aplicação saem do MAPA INTERPOLADO de um
 *  nutriente recortado nos limiares (não de um zoneamento). Guarda tudo o que
 *  reproduz o recorte — o mapa pode ser reprocessado depois, mas o que foi para
 *  a máquina fica no `fc` da prescrição. Ver lib/prescricao/condicao.ts. */
export interface ParamsCondicao {
  importacaoId: string;
  /** "Laboratório · data" do laudo, para ler sem abrir a importação. */
  importacaoNome?: string;
  nut: string;                 // chave do nutriente no mapa (ex.: 'p')
  prof: string;                // profundidade (ex.: '0-20')
  sigla: string;               // 'P', 'K', 'V'…
  unidadeValor?: string;       // 'mg/dm³', '%'…
  /** Rótulo do mapa: "Fósforo (P) · 0-20 cm · Lab X 2026-03-01". */
  rotuloMapa: string;
  /** Limiares crescentes. Faixa i = [L(i-1), L(i)); a primeira é < L0 e a
   *  última é ≥ o último limiar. */
  limiares: number[];
  /** Dose por faixa (limiares.length + 1), na UnidadeDose da prescrição. */
  faixas: Array<{ dose: number }>;
  /** Manchas menores que isto são absorvidas pela faixa vizinha (padrão 0,5). */
  areaMinHa: number;
  /** 'livre' (ausente = livre, prescrições anteriores): a dose da faixa é a
   *  aplicada. 'total' (volume travado): as doses das faixas viram PESOS e a
   *  aplicada é redistribuída para fechar ParamsCalculo.totalDisponivel (com
   *  totalPorHa, doseMin/doseMax/incremento de ParamsCalculo). Ver
   *  dosesDaCondicao. Não usa `cenarioAjuste`: o rascunho novo nasce com ele em
   *  'total' para o modo ajuste, e isso não pode travar a condição sozinho. */
  cenario?: 'livre' | 'total';
}

// Unidade da DOSE (por hectare). O total usa a unidade-base correspondente
// (kg/ha→kg, t/ha→t, sementes/ha→sementes, L/ha→L).
// sementes/m  = por METRO LINEAR de fileira (regulagem da plantadeira; depende
//               do espaçamento entre linhas).
// sementes/m2 = por METRO QUADRADO de área — a régua de outros monitores, e a
//               única das três que NÃO depende do espaçamento (1 ha = 10.000 m²).
// Converte para total via fatorBaseDose().
export type UnidadeDose = 'kg/ha' | 't/ha' | 'sementes/ha' | 'sementes/m' | 'sementes/m2' | 'L/ha';

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
  germinacaoPct: number;       // único desconto da semente → planta
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
  totalDisponivel?: number;    // SEMPRE absoluto, na unidade-base (kg, t, sementes, L)
  /** O total foi DIGITADO por hectare (ex.: 80.000 sementes/ha), não como
   *  estoque fechado. `totalDisponivel` segue absoluto — o cálculo, a
   *  validação e as exportações não mudam; isto só diz como reexibir o campo
   *  e evita a leitura errada de "80.000" como o total do talhão inteiro. */
  totalPorHa?: boolean;
  doseMin?: number;
  doseMax?: number;
  incremento?: number;         // passo mínimo da máquina (na UnidadeDose)
  relacao?: 'direta' | 'inversa';   // maior potencial → maior dose (direta) ou o contrário
  // proporcional
  doseMedia?: number;
  variacaoPct?: number;
  // ajuste % por zona
  doseBase?: number;
  /** idZona → ajuste em % sobre a dose base (ex.: −20). */
  ajustePct?: Record<string, number>;
  /** 'livre': o total é consequência (quanto comprar). 'total': crava o
   *  totalDisponivel, preservando as proporções entre as zonas. */
  cenarioAjuste?: 'livre' | 'total';
  /** A dose digitada é POPULAÇÃO desejada (plantas/ha), não a taxa de
   *  semeadura: o arquivo de aplicação sai compensado pela germinação
   *  (ver doseCompensada). */
  doseEhPopulacao?: boolean;
  /** modo 'complemento' (Parte XIV): fechar a meta de UM nutriente com um
   *  fertilizante complementar, descontando o que o produto base já entrega.
   *  Guarda as garantias USADAS no cálculo — o cadastro do insumo pode mudar
   *  depois, e o que foi para a máquina tem de continuar reproduzível. */
  complemento?: ParamsComplemento;
  /** modo 'condicao': faixas de valor de um mapa de fertilidade → dose. */
  condicao?: ParamsCondicao;
  // fluxos específicos
  sementes?: ParamsSementes;
  organico?: AnaliseOrganico;
}

export interface ParamsComplemento {
  nutriente: 'n' | 'p2o5' | 'k2o' | 's' | 'ca' | 'mg';
  metaKgHa?: number;
  // produto BASE (o que já vai ser aplicado)
  baseInsumoId?: string;
  baseNome?: string;
  baseGarantiaPct?: number;
  /** dose única do base, quando informada à mão */
  baseDoseKgHa?: number;
  /** id da PRESCRIÇÃO já salva usada como base. Ela tem dose POR ZONA, então o
   *  nutriente fornecido varia de zona para zona — e o complemento também.
   *  Digitar uma dose única jogaria fora a taxa variável que já foi decidida. */
  basePrescricaoId?: string;
  basePrescricaoNome?: string;
  /** SNAPSHOT idZona → dose do base. A prescrição base pode ganhar versão nova
   *  depois; o que foi calculado aqui não pode mudar sozinho. */
  baseDosePorZona?: Record<string, number>;
  /** Presente quando a base é uma prescrição POR CONDIÇÃO: as áreas desta
   *  prescrição são as faixas da base (fc + zonas copiados, ids f1..fN), sem
   *  zoneamento. Guarda o que rotula as faixas no mapa e no relatório. */
  baseCondicao?: { rotuloMapa: string; sigla: string; limiares: number[] };
  // produto COMPLEMENTAR (o que a prescrição vai calcular)
  compInsumoId?: string;
  compNome?: string;
  compGarantiaPct?: number;
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
  produto: string;             // nome do insumo (snapshot: o cadastro pode mudar)
  /** id do insumo na Biblioteca. Ausente em prescrições anteriores à Parte XIV,
   *  quando o produto era texto livre — elas continuam abrindo e exportando. */
  insumoId?: string;
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
  /** id da PRIMEIRA versão desta prescrição (a V1). Ausente na própria V1.
   *  Salvar alterações cria um REGISTRO NOVO apontando para cá — as versões
   *  anteriores continuam salvas, cada uma com os arquivos que gerou. */
  origemId?: string;
  criadoEm: string;
  criadoPor: string;
  atualizadoEm: string;
  historico: HistoricoPrescricao[];
  exportes: RegistroExporte[];
  empresaId?: string;
  /** Presente quando a prescrição foi PROGRAMADA NA LAVRA (plataforma
   *  fitotécnica) e chegou por POST /api/v1/programacao. Ausente nas feitas na
   *  própria AP. Uma versão salva na AP a partir de uma da Lavra herda este
   *  campo (o `...anterior` de salvarVersaoPrescricao) — `idRegistro` diz se o
   *  registro é o que a Lavra mandou ou um derivado editado aqui. */
  origemLavra?: OrigemLavra;
}

/** Item da programação de safra da Lavra (um por produto da safra). */
export type ChaveProgramacao =
  | 'semente' | 'adubo_base' | 'cobertura_1' | 'cobertura_2' | 'corretivo_calcario' | 'corretivo_gesso';

export interface OrigemLavra {
  sistema: 'lavra';
  /** Chave de idempotência: `lavra:<talhaoId>:<cultivoId>:<chave>`. Todas as versões da
   *  mesma linha da programação compartilham esta chave. */
  chave: string;
  item: ChaveProgramacao;
  cultivoId: string;
  planoId?: string;
  subdivisao?: string;
  agronomo?: string;
  anoSafra: string;            // "2026/2027"
  tempo: 'NORMAL' | 'SAFRINHA';
  /** Quando a programação foi alterada NA LAVRA (o que ela informou). */
  atualizadoEm: string;
  /** Quando a AP recebeu (relógio do servidor). */
  recebidoEm: string;
  /** id do registro que o SERVIDOR gravou. Diferente de `Prescricao.id` ⇒ esta
   *  é uma versão editada na AP depois do que veio da Lavra. */
  idRegistro: string;
  /** A Lavra tirou este item da programação (`remover`). A versão continua
   *  salva — prescrição é documento — mas a tela avisa que não vale mais. */
  removida?: boolean;
}

// Fator unidade-base → rótulo do TOTAL (para resumos e validações).
export const UNIDADE_TOTAL: Record<UnidadeDose, string> = {
  'kg/ha': 'kg', 't/ha': 't', 'sementes/ha': 'sementes', 'sementes/m': 'sementes', 'sementes/m2': 'sementes', 'L/ha': 'L',
};

// A unidade da dose é contada em SEMENTES (por ha ou por metro)?
export const ehUnidadeSemente = (u: UnidadeDose): boolean =>
  u === 'sementes/ha' || u === 'sementes/m' || u === 'sementes/m2';
