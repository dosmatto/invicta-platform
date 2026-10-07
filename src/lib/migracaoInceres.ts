// IMPORTADOR DE MIGRAÇÃO (InCeres → plataforma) — a lógica PURA.
//
// Lê o formato de pasta do export da migração:
//
//   <produtor>/<fazenda>/<talhão InCeres>/<safra> - <grade> [car_id]/
//       meta.json  contorno.geojson  pontos.geojson  zonas.geojson (zona)  laudo.xlsx
//
// e monta, sem tocar no store, tudo o que o importador grava: o plano por
// produtor/fazenda/talhão, as grades (grid e zona), os laudos e as VERSÕES do
// polígono por safra. A camada que fala com o store e com a tela fica em
// components/configuracoes/ImportarMigracaoSection.tsx.
//
// DECISÕES DO USUÁRIO (ledger do importador, 07/10/2026):
//   • IDENTIDADE DO TALHÃO = CÓDIGO da grade ("FCDSR 05 - 2024" → "FCDSR 05").
//     O nome da pasta de talhão da InCeres ("Talhão 1", "Talhão 1 + Talhão 2")
//     é genérico, junta talhões diferentes na mesma safra e muda entre safras —
//     ele só serve de contexto na listagem.
//   • Grade com nome fora do padrão "CÓDIGO - AAAA" → PULA e lista.
//   • Mesmo código + mesma safra com polígonos DIFERENTES → PULA e lista o grupo.
//   • Pasta sem laudo.xlsx ou sem pontos → PULA e lista.
//   • Polígono da safra mais nova = limite atual; polígonos diferentes de safras
//     antigas viram versões anteriores (geoVersoes) com as safras delas.
//   • Nada é interpolado na importação (a fila de interpolação é à parte).
//
// Módulo PURO (sem DOM, sem I/O). npm run teste:migracao

import { autoConfig, aplicarPerfil, escolherPerfil, PERFIS_BUILTIN, type ResultadoAmostra } from './lab.ts';
import { numerarPontosZonas, type ZonaComPontos } from './gradeZonas.ts';
import { congelarZonas, prefixosDosPontos } from './zonasCongeladas.ts';
import { areaHaGeo, areaHaGeoBruta } from './areaGeo.ts';
import { periodoDeData } from './periodo.ts';
import type {
  GradeAmostragem, ImportacaoLab, PontoAmostragem, ProfundidadeConfig, Talhao, VersaoPoligono,
  ZonaGrade, OrigemExterna,
} from './store';

export const FONTE = 'inceres' as const;
export const PERFIL_LAUDO = 'inceres';
/** Nome do perfil de planilha — vai como `laboratorio` do laudo, igual à importação manual. */
export const NOME_LABORATORIO = PERFIS_BUILTIN.find(p => p.id === PERFIL_LAUDO)?.nome ?? 'InCeres';

// ── Arquivos de uma pasta ───────────────────────────────────────────────────

/** Os textos de uma pasta de grade (o laudo é binário e vai à parte). */
export interface PastaLida {
  /** Caminho relativo da pasta (o que o usuário vê na lista). */
  caminho: string;
  meta?: string;
  contorno?: string;
  pontos?: string;
  zonas?: string;
  temLaudo: boolean;
}

/** Agrupa os caminhos relativos de um input de diretório por PASTA DE GRADE
 *  (a que contém meta.json). Funciona escolhendo a export/ inteira ou só a
 *  pasta de um produtor: a pasta da grade é sempre a que tem os arquivos. */
export function agruparArquivosPorPasta(caminhos: string[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  caminhos.forEach((c, i) => {
    const partes = c.split('/').filter(Boolean);
    if (partes.length < 2) return;
    const nome = partes.pop()!;
    const pasta = partes.join('/');
    (out.get(pasta) ?? out.set(pasta, new Map()).get(pasta)!).set(nome, i);
  });
  for (const [pasta, arqs] of out) if (!arqs.has('meta.json')) out.delete(pasta);
  return out;
}

/** JSON do export com NaN cru (o Python/JS da InCeres deixou escapar). */
export function parseJsonTolerante<T>(txt: string): T {
  return JSON.parse(txt.replace(/\bNaN\b/g, 'null')) as T;
}

// ── Nomes ───────────────────────────────────────────────────────────────────

/** Nome comparável: sem acento, sem caixa, sem pontuação, espaços colapsados. */
export function normNome(s: string): string {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Sugere um existente com o MESMO nome normalizado (o usuário confirma). */
export function sugerirExistente<T extends { id: string; nome: string }>(nome: string, lista: T[]): T | null {
  const n = normNome(nome);
  if (!n) return null;
  return lista.find(x => normNome(x.nome) === n) ?? null;
}

const RE_CODIGO = /^(.*?)\s*-\s*((?:19|20)\d{2})\b/;

/** Código do talhão a partir do nome da grade ("FCDSR 05 - 2024" → "FCDSR 05").
 *  null = fora do padrão "CÓDIGO - AAAA" (a grade é pulada). */
export function codigoDaGrade(nomeGrade: string): string | null {
  const m = RE_CODIGO.exec(String(nomeGrade ?? '').trim());
  if (!m) return null;
  const cod = m[1].replace(/\s+/g, ' ').trim().toUpperCase();
  return cod || null;
}

// ── Safra e data ────────────────────────────────────────────────────────────

export interface SafraInfo { nome: string; anoInicio: number; anoFim: number }

/** "2020-2021" → { nome: "20/21", anoInicio: 2020, anoFim: 2021 } (o nome segue
 *  o padrão do cadastro de safras da plataforma). */
export function safraDaInceres(s: string): SafraInfo | null {
  const m = /^\s*(\d{4})\s*[-/]\s*(\d{4})\s*$/.exec(String(s ?? ''));
  if (!m) return null;
  const anoInicio = +m[1], anoFim = +m[2];
  if (anoFim !== anoInicio + 1) return null;
  return { nome: `${String(anoInicio).slice(-2)}/${String(anoFim).slice(-2)}`, anoInicio, anoFim };
}

/**
 * Data de referência da grade/laudo. As telas filtram pelo ANO da data
 * (`anoDaSafra("20/21")` = 2020): data fora do ano inicial da safra faz o
 * registro SUMIR da safra dele (armadilha do piloto — o default "hoje" caía em
 * 2026). Regra: a data de criação da grade na InCeres quando ela cai no ano
 * inicial da safra; senão 1º de julho do ano inicial (início do ciclo).
 */
export function dataReferenciaDaSafra(safra: SafraInfo, dataInceres?: string | null): string {
  const d = String(dataInceres ?? '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d) && +d.slice(0, 4) === safra.anoInicio && periodoDeData(d)) return d;
  return `${safra.anoInicio}-07-01`;
}

// ── Geometria ───────────────────────────────────────────────────────────────

type Poli = GeoJSON.Polygon | GeoJSON.MultiPolygon;
const ehPoli = (g: GeoJSON.Geometry | null | undefined): g is Poli => !!g && (g.type === 'Polygon' || g.type === 'MultiPolygon');
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Contorno só com as geometrias (as props da InCeres não interessam ao talhão). */
export function contornoLimpo(fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: (fc?.features ?? []).filter(f => ehPoli(f.geometry)).map(f => ({ type: 'Feature', properties: {}, geometry: f.geometry })),
  };
}

/** Assinatura do polígono: coordenadas a 6 casas (~11 cm), partes em ordem
 *  canônica. Dois contornos com a mesma assinatura são o MESMO limite. */
export function assinaturaGeo(fc: GeoJSON.FeatureCollection | null | undefined): string {
  const partes: string[] = [];
  for (const f of fc?.features ?? []) {
    const g = f.geometry;
    if (!ehPoli(g)) continue;
    const polis = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const p of polis) partes.push(JSON.stringify(p.map(anel => anel.map(([x, y]) => [r6(x), r6(y)]))));
  }
  return partes.sort().join('|');
}

export function bboxDaFC(fc: GeoJSON.FeatureCollection): [number, number, number, number] | undefined {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const f of fc.features) {
    const g = f.geometry;
    if (!ehPoli(g)) continue;
    const polis = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const p of polis) for (const anel of p) for (const [x, y] of anel) {
      if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y;
    }
  }
  return isFinite(a) ? [a, b, c, d] : undefined;
}

// ── Preparo de UMA pasta ────────────────────────────────────────────────────

interface MetaInceres {
  produtor?: string; fazenda?: string; talhao?: string; safra?: string;
  grade_nome?: string; car_id?: number | string; tipo_grade?: string;
  unidade?: string; profundidades?: string[];
  car?: { dateOfManufacture?: string | null } | null;
  /** Código do talhão definido fora do nome da grade: grade "Amostragem Geral"
   *  ligada ao talhão pela sobreposição do polígono, na preparação da migração. */
  talhao_codigo?: string | null;
}

export interface GradePreparada {
  caminho: string;
  carId: string;
  produtor: string;
  fazenda: string;
  talhaoPasta: string;   // contexto (nome da pasta de talhão na InCeres)
  codigo: string;        // = nome do talhão na plataforma
  nomeGrade: string;
  safraInceres: string;  // "2020-2021"
  safra: SafraInfo;
  dataReferencia: string;
  tipo: 'grid' | 'zona';
  unidade: string;
  contorno: GeoJSON.FeatureCollection;
  assinatura: string;
  pontos: PontoAmostragem[];
  profundidades: ProfundidadeConfig[];
  /** ZONA: zoneamento normalizado (id "01", zona "01", classe "Zona 1"). */
  zonasFC?: GeoJSON.FeatureCollection;
  zonasGeo?: ZonaGrade[];
}

export interface Pulada {
  caminho: string;
  produtor: string;
  fazenda: string;
  talhaoPasta: string;
  grade: string;
  safra: string;
  motivo: string;
}

export type ResultadoPreparo = { ok: GradePreparada; pulada?: undefined } | { ok?: undefined; pulada: Pulada };

const pad2 = (k: number) => (k < 10 ? `0${k}` : String(k));

function profsDoPonto(raw: unknown, padrao: string[]): string[] {
  const s = String(raw ?? '').trim();
  return s ? s.split('|').map(x => x.trim()).filter(Boolean) : padrao;
}

/** % dos pontos que levam cada profundidade (o que o padrão de amostragem diz). */
function profundidadesDaGrade(pontos: PontoAmostragem[], ordem: string[]): ProfundidadeConfig[] {
  const todas = [...new Set([...ordem, ...pontos.flatMap(p => p.profundidades ?? [])])];
  const n = pontos.length || 1;
  return todas.map(rotulo => ({
    rotulo,
    percentual: Math.round((pontos.filter(p => (p.profundidades ?? []).includes(rotulo)).length / n) * 100),
    padraoElementosId: '',
  }));
}

export function prepararPasta(p: PastaLida): ResultadoPreparo {
  const nomePasta = p.caminho.split('/').filter(Boolean);
  const base: Pulada = {
    caminho: p.caminho,
    produtor: nomePasta[nomePasta.length - 4] ?? '',
    fazenda: nomePasta[nomePasta.length - 3] ?? '',
    talhaoPasta: nomePasta[nomePasta.length - 2] ?? '',
    grade: nomePasta[nomePasta.length - 1] ?? '',
    safra: '',
    motivo: '',
  };
  const pula = (motivo: string, extra: Partial<Pulada> = {}): ResultadoPreparo => ({ pulada: { ...base, ...extra, motivo } });

  if (!p.meta) return pula('sem meta.json');
  let meta: MetaInceres;
  try { meta = parseJsonTolerante<MetaInceres>(p.meta); } catch { return pula('meta.json ilegível'); }
  const ctx: Partial<Pulada> = {
    produtor: String(meta.produtor ?? base.produtor),
    fazenda: String(meta.fazenda ?? base.fazenda),
    talhaoPasta: String(meta.talhao ?? base.talhaoPasta),
    grade: String(meta.grade_nome ?? base.grade),
    safra: String(meta.safra ?? ''),
  };
  if (!p.temLaudo) return pula('sem laudo (laudo.xlsx)', ctx);
  if (!p.pontos) return pula('sem pontos (pontos.geojson)', ctx);
  if (!p.contorno) return pula('sem contorno (contorno.geojson)', ctx);
  const carId = meta.car_id != null ? String(meta.car_id) : '';
  if (!carId) return pula('meta.json sem car_id', ctx);
  // Nome sem código ("Amostragem Geral"): vale o código ligado pelo polígono, se houver.
  const codigoMeta = String(meta.talhao_codigo ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
  const codigo = codigoDaGrade(ctx.grade!) ?? (codigoMeta || null);
  if (!codigo) return pula('nome da grade fora do padrão "CÓDIGO - AAAA"', ctx);
  const safra = safraDaInceres(ctx.safra!);
  if (!safra) return pula(`safra ilegível ("${ctx.safra}")`, ctx);
  const tipo = meta.tipo_grade === 'zona' ? 'zona' : meta.tipo_grade === 'grid' ? 'grid' : null;
  if (!tipo) return pula(`tipo de grade desconhecido ("${meta.tipo_grade}")`, ctx);

  let contorno: GeoJSON.FeatureCollection, pontosFC: GeoJSON.FeatureCollection;
  try {
    contorno = contornoLimpo(parseJsonTolerante<GeoJSON.FeatureCollection>(p.contorno));
    pontosFC = parseJsonTolerante<GeoJSON.FeatureCollection>(p.pontos);
  } catch { return pula('GeoJSON ilegível', ctx); }
  if (!contorno.features.length) return pula('contorno sem polígono', ctx);

  const profsMeta = (meta.profundidades ?? []).map(String).filter(Boolean);
  const brutos = (pontosFC.features ?? [])
    .filter(f => f.geometry?.type === 'Point')
    .map(f => {
      const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
      const n = parseInt(String(f.properties?.numero ?? ''), 10);
      return { numero: Number.isFinite(n) && n > 0 ? n : NaN, lng, lat, profundidades: profsDoPonto(f.properties?.profundidades, profsMeta) };
    });
  if (brutos.length === 0) return pula('pontos.geojson sem pontos', ctx);
  if (brutos.some(b => Number.isNaN(b.numero))) return pula('ponto sem número (campo numero)', ctx);
  brutos.sort((a, b) => a.numero - b.numero);

  const comum = {
    caminho: p.caminho, carId,
    produtor: ctx.produtor!, fazenda: ctx.fazenda!, talhaoPasta: ctx.talhaoPasta!,
    codigo, nomeGrade: ctx.grade!, safraInceres: ctx.safra!, safra,
    dataReferencia: dataReferenciaDaSafra(safra, meta.car?.dateOfManufacture),
    unidade: String(meta.unidade ?? ''),
    contorno, assinatura: assinaturaGeo(contorno),
  };

  if (tipo === 'grid') {
    const pontos: PontoAmostragem[] = brutos.map((b, i) => ({
      ordem: i, numero: b.numero, lng: b.lng, lat: b.lat,
      profs: b.profundidades.length || 1, profundidades: b.profundidades,
    }));
    return { ok: { ...comum, tipo, pontos, profundidades: profundidadesDaGrade(pontos, profsMeta) } };
  }

  // ── ZONA ──
  if (!p.zonas) return pula('grade de zona sem zonas.geojson', ctx);
  let zonasBrutas: GeoJSON.FeatureCollection;
  try { zonasBrutas = parseJsonTolerante<GeoJSON.FeatureCollection>(p.zonas); } catch { return pula('zonas.geojson ilegível', ctx); }
  const feats = (zonasBrutas.features ?? []).filter(f => ehPoli(f.geometry));
  if (!feats.length) return pula('zonas.geojson sem polígono', ctx);
  // `numero` da zona = id da amostra no laudo (o baixador ligou zona↔nº pelo
  // ponto da composta). Zona sem número não tem de onde tirar valor: o vínculo
  // automático a encheria com a amostra de OUTRA zona. Pula a grade inteira.
  const nums = feats.map(f => parseInt(String(f.properties?.numero ?? ''), 10));
  if (nums.some(n => !Number.isFinite(n) || n <= 0)) return pula('zona sem vínculo com o nº do laudo', ctx);
  // Ids no padrão do zoneamento da plataforma: "01"; a 2ª mancha da mesma zona
  // vira "01_2" (identidade do polígono) e o `zona` "01" mantém o número.
  const vistos = new Map<number, number>();
  const zonasFC: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: feats.map((f, i) => {
      const k = nums[i];
      const n = (vistos.get(k) ?? 0) + 1;
      vistos.set(k, n);
      const ha = Number(f.properties?.hectares);
      return {
        type: 'Feature',
        properties: {
          id: n === 1 ? pad2(k) : `${pad2(k)}_${n}`,
          zona: pad2(k),
          classe: `Zona ${k}`,
          ...(isFinite(ha) && ha > 0 ? { areaHa: ha } : {}),
        },
        geometry: f.geometry,
      };
    }),
  };
  // Pontos da composta: um grupo por ZONA (rótulo do mapa "01"), na ordem das
  // zonas. A numeração é a da plataforma (lib/gradeZonas, modelo A): todo ponto
  // da zona k leva `numero` k — o que liga ao laudo.
  const zonasOrd = [...new Set(nums)].sort((a, b) => a - b);
  const grupos: ZonaComPontos[] = zonasOrd.map(k => ({
    id: pad2(k),
    pts: brutos.filter(b => b.numero === k).map(b => ({ lng: b.lng, lat: b.lat })),
  }));
  const pontos = numerarPontosZonas(grupos.filter(g => g.pts.length > 0), 'A', profsMeta);
  // Profundidades por ponto vindas do arquivo (podem variar por zona).
  for (const pt of pontos) {
    const orig = brutos.find(b => b.numero === pt.numero);
    if (orig) { pt.profundidades = orig.profundidades; pt.profs = orig.profundidades.length || 1; }
  }
  const prefixos = prefixosDosPontos(pontos);
  const zonasGeo = congelarZonas(zonasFC, r => prefixos.get(r)) as ZonaGrade[];
  return { ok: { ...comum, tipo, pontos, profundidades: profundidadesDaGrade(pontos, profsMeta), zonasFC, zonasGeo } };
}

// ── Plano ───────────────────────────────────────────────────────────────────

export interface PlanoTalhao {
  codigo: string;
  /** Grades do talhão, da safra mais antiga para a mais nova. */
  grades: GradePreparada[];
}
export interface PlanoFazenda { nome: string; talhoes: PlanoTalhao[] }
export interface PlanoProdutor { nome: string; fazendas: PlanoFazenda[]; nGrades: number; safras: string[] }

export interface Plano {
  produtores: PlanoProdutor[];
  puladas: Pulada[];
}

/**
 * Agrupa as pastas preparadas em produtor → fazenda → talhão (código) e
 * aplica a regra de conflito: mesmo código + mesma safra com polígonos
 * diferentes = talhões reais distintos com o mesmo código → o GRUPO todo é
 * pulado e listado (não há como saber qual é o limite daquela safra).
 * Duas grades do mesmo código/safra com o MESMO polígono entram as duas.
 */
export function montarPlano(resultados: ResultadoPreparo[]): Plano {
  const puladas: Pulada[] = [];
  const validas: GradePreparada[] = [];
  for (const r of resultados) { if (r.ok) validas.push(r.ok); else puladas.push(r.pulada); }

  const chaveTal = (g: GradePreparada) => `${normNome(g.produtor)}|${normNome(g.fazenda)}|${normNome(g.codigo)}`;
  const porSafra = new Map<string, GradePreparada[]>();
  for (const g of validas) {
    const k = `${chaveTal(g)}|${g.safraInceres}`;
    (porSafra.get(k) ?? porSafra.set(k, []).get(k)!).push(g);
  }
  const conflito = new Set<string>();
  for (const [k, gs] of porSafra) {
    if (new Set(gs.map(g => g.assinatura)).size > 1) {
      conflito.add(k);
      for (const g of gs) puladas.push({
        caminho: g.caminho, produtor: g.produtor, fazenda: g.fazenda, talhaoPasta: g.talhaoPasta,
        grade: g.nomeGrade, safra: g.safraInceres,
        motivo: `${g.codigo} tem polígonos diferentes na mesma safra (${gs.length} grades)`,
      });
    }
  }

  const prods = new Map<string, { nome: string; faz: Map<string, { nome: string; tal: Map<string, PlanoTalhao> }> }>();
  for (const g of validas) {
    if (conflito.has(`${chaveTal(g)}|${g.safraInceres}`)) continue;
    const kp = normNome(g.produtor), kf = normNome(g.fazenda), kt = normNome(g.codigo);
    const p = prods.get(kp) ?? prods.set(kp, { nome: g.produtor, faz: new Map() }).get(kp)!;
    const f = p.faz.get(kf) ?? p.faz.set(kf, { nome: g.fazenda, tal: new Map() }).get(kf)!;
    const t = f.tal.get(kt) ?? f.tal.set(kt, { codigo: g.codigo, grades: [] }).get(kt)!;
    t.grades.push(g);
  }

  const cmp = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true });
  const produtores: PlanoProdutor[] = [...prods.values()].map(p => {
    const fazendas = [...p.faz.values()].map(f => ({
      nome: f.nome,
      talhoes: [...f.tal.values()]
        .map(t => ({ ...t, grades: [...t.grades].sort((a, b) => a.safraInceres.localeCompare(b.safraInceres) || cmp(a.nomeGrade, b.nomeGrade)) }))
        .sort((a, b) => cmp(a.codigo, b.codigo)),
    })).sort((a, b) => cmp(a.nome, b.nome));
    const gs = fazendas.flatMap(f => f.talhoes.flatMap(t => t.grades));
    return { nome: p.nome, fazendas, nGrades: gs.length, safras: [...new Set(gs.map(g => g.safra.nome))].sort() };
  }).sort((a, b) => cmp(a.nome, b.nome));

  puladas.sort((a, b) => cmp(a.caminho, b.caminho));
  return { produtores, puladas };
}

// ── Limite do talhão e versões por safra ────────────────────────────────────

/** O que interessa do talhão existente (null = talhão novo). */
export type LimiteAtual = Pick<Talhao, 'geojson' | 'geoVersao' | 'geoVersoes' | 'bbox' | 'areaHa' | 'areaHaSemHoles' | 'origemExterna'>;

function camposDoLimite(fc: GeoJSON.FeatureCollection) {
  const net = areaHaGeo(fc);
  const bruta = areaHaGeoBruta(fc);
  return {
    geojson: JSON.stringify(fc),
    areaHa: Math.round(net * 100) / 100,
    areaHaSemHoles: Math.round((bruta > 0 ? bruta : net) * 100) / 100,
    bbox: bboxDaFC(fc),
  };
}

/**
 * Limite atual + versões anteriores do talhão a partir dos polígonos por safra.
 *
 *   • Talhão NOVO: o polígono da safra mais nova é o limite; cada polígono
 *     DIFERENTE das safras anteriores vira uma versão (1, 2, …, da mais antiga
 *     para a mais nova) com as safras em que vigorou; o limite atual é a
 *     versão seguinte (`geoVersao` = a mais alta).
 *   • Talhão EXISTENTE: o limite só é trocado se estiver vazio ou se veio de uma
 *     migração anterior de safra mais antiga (`origemExterna.safraLimite`) — um
 *     limite cadastrado na plataforma nunca é sobrescrito pela migração. O
 *     limite substituído é arquivado como versão. Polígonos importados que não
 *     são o limite entram como versões (ou ganham a safra, se a versão já existe).
 *   • REIMPORTAR não muda nada (mesmas assinaturas → `null`).
 *
 * `porSafra`: nome da safra da plataforma ("20/21") → contorno daquela safra.
 */
export function planejarLimites(
  atual: LimiteAtual | null,
  porSafra: { safra: string; contorno: GeoJSON.FeatureCollection }[],
  agoraIso: string,
): Partial<Talhao> | null {
  if (!porSafra.length) return null;
  const ord = [...porSafra].sort((a, b) => a.safra.localeCompare(b.safra));
  // Agrupa safras por polígono (mesma assinatura = mesmo limite).
  const grupos: { sig: string; fc: GeoJSON.FeatureCollection; safras: string[] }[] = [];
  for (const s of ord) {
    const sig = assinaturaGeo(s.contorno);
    const g = grupos.find(x => x.sig === sig);
    if (g) { if (!g.safras.includes(s.safra)) g.safras.push(s.safra); } else grupos.push({ sig, fc: s.contorno, safras: [s.safra] });
  }
  const maisNova = ord[ord.length - 1];
  const sigNova = assinaturaGeo(maisNova.contorno);

  const lerFc = (s?: string): GeoJSON.FeatureCollection | null => { try { return s ? JSON.parse(s) as GeoJSON.FeatureCollection : null; } catch { return null; } };
  const sigAtual = atual?.geojson ? assinaturaGeo(lerFc(atual.geojson)) : null;
  const safraLim = atual?.origemExterna?.safraLimite;
  const versoes: VersaoPoligono[] = (atual?.geoVersoes ?? []).map(v => ({ ...v, safras: [...v.safras] }));
  const antes = JSON.stringify(versoes);
  let maior = Math.max(atual?.geojson ? (atual.geoVersao ?? 1) : 0, ...versoes.map(v => v.versao), 0);

  const patch: Partial<Talhao> = {};
  let sigLimite = sigAtual;
  const trocar = !atual?.geojson
    || (!!safraLim && maisNova.safra > safraLim && sigAtual !== sigNova);
  if (trocar) {
    if (atual?.geojson) {
      versoes.push({
        versao: atual.geoVersao ?? 1, geojson: atual.geojson, bbox: atual.bbox,
        areaHa: atual.areaHa ?? 0, areaHaSemHoles: atual.areaHaSemHoles,
        arquivadoEm: agoraIso, safras: safraLim ? [safraLim] : [],
      });
    }
    Object.assign(patch, camposDoLimite(maisNova.contorno));
    sigLimite = sigNova;
  }

  // Versões anteriores: todo polígono importado diferente do limite final.
  const novas: VersaoPoligono[] = [];
  for (const g of grupos) {
    if (g.sig === sigLimite) continue;
    const ja = versoes.find(v => assinaturaGeo(lerFc(v.geojson)) === g.sig);
    if (ja) { for (const s of g.safras) if (!ja.safras.includes(s)) ja.safras.push(s); continue; }
    const c = camposDoLimite(g.fc);
    novas.push({ versao: 0, geojson: c.geojson, bbox: c.bbox, areaHa: c.areaHa, areaHaSemHoles: c.areaHaSemHoles, arquivadoEm: agoraIso, safras: [...g.safras] });
  }
  for (const v of versoes) v.safras.sort();
  // Numeração: o que já existia mantém o número; as novas seguem a ordem das
  // safras; o limite atual é sempre a versão mais alta.
  for (const v of novas) v.versao = ++maior;
  const todas = [...versoes, ...novas].sort((a, b) => a.versao - b.versao);
  const mudouVersoes = JSON.stringify(todas) !== antes;
  if (mudouVersoes) patch.geoVersoes = todas;
  if (trocar || novas.length) patch.geoVersao = Math.max(maior, ...todas.map(v => v.versao)) + 1;
  if (trocar) patch.origemExterna = { fonte: FONTE, safraLimite: maisNova.safra };
  return Object.keys(patch).length ? patch : null;
}

// ── Grade, zoneamento do talhão e laudo ─────────────────────────────────────

export const origemDe = (carId: string): OrigemExterna => ({ fonte: FONTE, id: carId });

/** A grade como ela é gravada (o store recalcula ano/época da Data de referência). */
export function montarGrade(
  g: GradePreparada, talhaoId: string, safraNome: string, paraProcessar: boolean,
): Omit<GradeAmostragem, 'id' | 'criadoEm'> {
  const per = periodoDeData(g.dataReferencia);
  return {
    talhaoId, safra: safraNome, epoca: per?.epoca ?? '2', dataReferencia: g.dataReferencia, ano: per?.ano,
    nome: g.nomeGrade,
    padraoAmostragemId: '', padraoNome: 'Importada (InCeres)', customizado: true,
    densidade: 0, distanciaBorda: 0, rotacao: 0, aleatoriedade: 0, modoSel: 'regular',
    metodo: g.tipo === 'zona' ? 'zonas' : 'grid',
    ...(g.tipo === 'zona' ? { modelo: 'A' as const, modoDist: 'grade' as const, zonasGeo: g.zonasGeo } : {}),
    profundidades: g.profundidades, pontos: g.pontos, paraProcessar,
    origemExterna: origemDe(g.carId),
  };
}

/** Lê o laudo InCeres (matriz de strings da 1ª aba) pelo perfil `inceres` de
 *  lib/lab — o MESMO da importação manual: cabeçalho na linha 1, unidades na
 *  linha 2 (cmolc/mmolc convertidos para o canônico). */
export function lerLaudo(
  aoa: string[][], vars?: { id: string; sinonimos: string[] }[],
): { resultados: ResultadoAmostra[]; elementos: string[] } {
  const perfil = escolherPerfil(aoa, [], vars);
  if (perfil !== PERFIL_LAUDO) throw new Error(`planilha não é o laudo InCeres (perfil detectado: ${perfil})`);
  const { config } = autoConfig(aoa, vars);
  const { resultados } = aplicarPerfil(aoa, config);
  if (!resultados.length) throw new Error('laudo sem nenhuma amostra');
  const elementos = [...new Set(resultados.flatMap(r => Object.keys(r.valores)))];
  return { resultados, elementos };
}

/** Amostras do laudo que não têm ponto na grade (aviso, não erro). */
export function amostrasForaDaGrade(resultados: ResultadoAmostra[], pontos: PontoAmostragem[]): number[] {
  const nums = new Set(pontos.map(p => p.numero ?? p.ordem + 1));
  return [...new Set(resultados.map(r => r.numero))].filter(n => !nums.has(n)).sort((a, b) => a - b);
}

export function montarLaudo(
  g: GradePreparada, talhaoId: string, safraNome: string, gradeId: string,
  laudo: { resultados: ResultadoAmostra[]; elementos: string[] }, laboratorioId?: string,
): Omit<ImportacaoLab, 'id' | 'criadoEm'> {
  return {
    talhaoId, safra: safraNome, gradeId,
    laboratorio: NOME_LABORATORIO, laboratorioId,
    campanha: '',
    resultados: laudo.resultados, elementos: laudo.elementos,
    dataReferencia: g.dataReferencia,
    origemExterna: origemDe(g.carId),
  };
}

/** Vínculo zona → nº da amostra de uma grade de zona MIGRADA: conhecido por
 *  construção (o `zona` da feição é o nº do laudo), como `bindingDasCelulas`
 *  na composta. O vínculo por ponto-dentro deixaria a 2ª mancha de uma zona
 *  (sem ponto) no fallback pela ordem — com a amostra de outra zona. */
export function bindingDaGradeMigrada(zonas: { id: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const z of zonas) {
    const n = parseInt(String(z.id).split('_')[0], 10);
    if (Number.isFinite(n) && n > 0) out[z.id] = n;
  }
  return out;
}
