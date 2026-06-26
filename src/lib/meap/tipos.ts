// Tipos do MEAP — Fase M1 (subconjunto enxuto do modelo de dados da FS 13.01).
//
// Nesta fase há 1 AmbienteProdutivo por talhão, ADOTANDO as zonas já importadas
// (talhao.zonasGeojson). A geometria NÃO é duplicada aqui — cada ZonaMeap
// referencia a feição do GeoJSON do talhão pelo `id`. Versionamento, DNA e
// convergência reais entram nas fases M3+; aqui existe sempre uma única versão
// (v1) adotada, e o CV é calculado dos dados de laboratório já casados à grade.
//
// Doc de referência: docs/13.01_FS_MEAP_PARTE_01.md e docs/13.02 §9.5.

export type ClassePotencial = 'alto' | 'medio-alto' | 'medio' | 'medio-baixo' | 'baixo';
export type Faixa = 'baixa' | 'media' | 'alta';
export type Homogeneidade = 'alta' | 'media' | 'baixa';
export type EstadoAmbiente = 'em-formacao' | 'em-consolidacao' | 'consolidada';

export interface MetricasZonaMeap {
  cvValidacao: number | null;            // CV (%) da variável de validação (null = sem dado)
  variavelValidacao: string | null;      // id do elemento (ex.: 'textura', 'p')
  cvPorAtributo: Record<string, number>; // CV (%) por elemento medido na zona
  homogeneidade: Homogeneidade | null;   // faixa legível derivada do cvValidacao
  nPontos: number;                       // nº de pontos de lab usados no CV da zona
}

export interface ZonaMeap {
  id: string;            // = id da feição em talhao.zonasGeojson
  rotulo: string;        // "Zona 01"
  classeLabel: string;   // rótulo do semáforo (lib/zonas.ts)
  cor: string;
  areaHa: number;
  percTalhao: number;    // 0..1
  metricas: MetricasZonaMeap;
}

export interface VersaoMeap {
  numero: number;                       // 1 na M1
  dataReferencia: string;               // ISO
  origem: 'adocao-zonas-importadas';
  zonas: ZonaMeap[];
  convergencia: number | null;          // null até existir 2ª versão (M3)
  cvMedioIntraZona: number | null;      // média ponderada por área do CV das zonas
  variavelValidacao: string | null;
}

export interface AmbienteProdutivo {
  id: string;            // = talhaoId (1:1)
  talhaoId: string;
  empresaId?: string;    // carimbo multi-tenant (comEmpresa)
  estado: EstadoAmbiente;
  versaoVigente: number; // numero da versão oficial vigente
  versoes: VersaoMeap[];
  fonteHash: string;     // idempotência: muda quando zonas/lab de origem mudam
  criadoEm: string;
  atualizadoEm: string;
}
