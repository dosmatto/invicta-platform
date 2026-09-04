// Painel do Produtor — o que a plataforma já PROCESSOU em cada talhão.
//
// Módulo PURO (sem DOM, sem store, sem nuvem): recebe listas simples — o que os
// getters do store e as listagens da nuvem devolvem — e responde três perguntas
// que o /portal desenha:
//   1. em que ETAPA está cada talhão neste ano (amostragem → laudo → mapas →
//      recomendação → arquivo de aplicação), e o que existe fora do ciclo
//      (zonas, relevo, CE, satélite, colheita, compactação, relatórios);
//   2. os TOTAIS do produtor (área amostrada, laudos, mapas…);
//   3. as SÉRIES dos gráficos (área amostrada por ano, evolução de nutrientes
//      do talhão, ranking de colheita, linha do tempo).
// Também projeta os polígonos dos talhões para o mini-mapa em SVG.
//
// Por que puro: `npm run teste:portal` roda isto em node sem navegador — o
// estado de "pronto/andamento/pendente" é uma regra de negócio, e regra de
// negócio sem teste vira surpresa na tela do cliente.
//
// Extensão .ts explícita nos imports: o teste roda em node (type-stripping).

import { anoDaSafra, anoDeData } from './periodo.ts';

// ── Etapas ──────────────────────────────────────────────────────────────────

export type EtapaId =
  | 'amostragem' | 'laudo' | 'fertilidade' | 'recomendacoes' | 'prescricoes'
  | 'zonas' | 'altimetria' | 'condutividade'
  | 'ndvi' | 'produtividade' | 'compactacao'
  | 'relatorios';

export type GrupoEtapa = 'ciclo' | 'estrutura' | 'observacao' | 'entrega';
export type Situacao = 'pronto' | 'andamento' | 'pendente';

/** Seções do plano de assinatura — os MESMOS ids de SECOES_PORTAL (lib/empresa). */
export type SecaoPlano = 'resumo' | 'fertilidade' | 'amostragem' | 'recomendacoes' | 'compactacao' | 'relatorios' | 'arquivos';

export interface EtapaDef {
  id: EtapaId;
  rotulo: string;
  curto: string;
  grupo: GrupoEtapa;
  /** Seção do plano que libera a etapa no portal; null = só informativa (sem aba para o produtor). */
  secao: SecaoPlano | null;
  /** Aba da página do talhão que abre a etapa (deep link `?aba=`). */
  aba: string | null;
  descricao: string;
}

export const ETAPAS: EtapaDef[] = [
  { id: 'amostragem',    rotulo: 'Amostragem de solo',     curto: 'Amostragem',   grupo: 'ciclo',      secao: 'amostragem',    aba: 'amostragem',    descricao: 'Grade de pontos gerada e amostras enviadas ao laboratório' },
  { id: 'laudo',         rotulo: 'Análise de solo',        curto: 'Laudo',        grupo: 'ciclo',      secao: 'fertilidade',   aba: 'fertilidade',   descricao: 'Resultados do laboratório importados na plataforma' },
  { id: 'fertilidade',   rotulo: 'Mapas de fertilidade',   curto: 'Mapas',        grupo: 'ciclo',      secao: 'fertilidade',   aba: 'fertilidade',   descricao: 'Mapas interpolados por nutriente e profundidade' },
  { id: 'recomendacoes', rotulo: 'Recomendações',          curto: 'Recomendação', grupo: 'ciclo',      secao: 'recomendacoes', aba: 'recomendacoes', descricao: 'Cenários de recomendação calculados' },
  { id: 'prescricoes',   rotulo: 'Arquivos de aplicação',  curto: 'Aplicação',    grupo: 'ciclo',      secao: 'arquivos',      aba: 'arquivos',      descricao: 'Prescrições e arquivos gerados para a máquina' },
  { id: 'zonas',         rotulo: 'Zonas de manejo',        curto: 'Zonas',        grupo: 'estrutura',  secao: null,            aba: null,            descricao: 'Zoneamento do talhão' },
  { id: 'altimetria',    rotulo: 'Altimetria (MDE)',       curto: 'Relevo',       grupo: 'estrutura',  secao: null,            aba: null,            descricao: 'Modelo digital de elevação aprovado' },
  { id: 'condutividade', rotulo: 'Condutividade elétrica', curto: 'CE',           grupo: 'estrutura',  secao: null,            aba: null,            descricao: 'Levantamento de condutividade do solo' },
  { id: 'ndvi',          rotulo: 'Satélite (NDVI)',        curto: 'Satélite',     grupo: 'observacao', secao: null,            aba: null,            descricao: 'Cenas de satélite processadas no ano' },
  { id: 'produtividade', rotulo: 'Mapa de colheita',       curto: 'Colheita',     grupo: 'observacao', secao: null,            aba: null,            descricao: 'Mapa de produtividade processado' },
  { id: 'compactacao',   rotulo: 'Compactação',            curto: 'Compactação',  grupo: 'observacao', secao: 'compactacao',   aba: 'compactacao',   descricao: 'Penetrometria importada' },
  { id: 'relatorios',    rotulo: 'Relatórios',             curto: 'Relatórios',   grupo: 'entrega',    secao: 'relatorios',    aba: 'relatorios',    descricao: 'Relatórios em PDF gerados' },
];

/** O ciclo do ano, na ordem em que a Invicta trabalha. */
export const ETAPAS_CICLO: EtapaId[] = ['amostragem', 'laudo', 'fertilidade', 'recomendacoes', 'prescricoes'];

export function etapaDef(id: EtapaId): EtapaDef {
  const e = ETAPAS.find(x => x.id === id);
  if (!e) throw new Error(`etapa desconhecida: ${id}`);
  return e;
}

// ── Entradas (formas MÍNIMAS do que o store/nuvem devolvem) ─────────────────

export interface TalhaoBase { id: string; fazendaId: string; nome: string; areaHa: number; status?: string; geojson?: string | null }
export interface GradeIn { safra: string; ano?: number; criadoEm: string; dataReferencia?: string; nome?: string; codigoRemessa?: string; pontos: number | unknown[] }
export interface LaudoIn {
  id: string; safra: string; ano?: number; criadoEm: string; atualizadoEm?: string; dataReferencia?: string;
  laboratorio?: string; elementos?: string[];
  resultados?: Array<{ numero?: number; profundidade: string; valores: Record<string, number> }>;
}
/** Item da listagem leve da nuvem por prefixo `${talhaoId}__` (fertilidade, satélite, colheita). */
export interface MapaNuvemIn { id: string; atualizadoEm?: string | null; criadoEm?: string | null; salvoEm?: string | null; cena?: { data?: string | null } | null }
export interface ZoneamentoIn { padrao: boolean; criadoEm: string; meta?: { nZonas?: number } }
/** Projeção leve de `inv_cenarios` (campos vêm como texto da nuvem). */
export interface CenarioIn { safra: string | null; nome: string | null; geradoEm: number | string | null; oficial?: boolean | string | null }
export interface PrescricaoIn { ano?: string; nome: string; produto?: string; atualizadoEm: string; exportes?: Array<{ em: string; formato: string; arquivo: string }> }
export interface ColheitaIn { safra: string; ano?: number; oficial: boolean; cultura: string; criadoEm: string; stats: { mediaKgha: number; cv?: number; areaHa?: number } }
export interface ComposicaoIn { safra?: string; nome: string; criadoEm: string; datas: string[] }
export interface MdeIn { oficial: boolean; criadoEm: string; rotuloFonte?: string }
export interface CondutividadeIn { oficial: boolean; criadoEm: string; data?: string }
export interface CompactacaoIn { safra: string; ano?: number; criadoEm: string; pontos: number | unknown[] }
/** Projeção leve de `inv_relatorios`. */
export interface RelatorioIn { safra: string | null; tipo: string | null; titulo: string | null; geradoEm: number | string | null }

export interface DadosTalhao {
  talhao: TalhaoBase;
  cultura?: string;
  grades?: GradeIn[];
  laudos?: LaudoIn[];
  mapasNuvem?: MapaNuvemIn[];
  zoneamentos?: ZoneamentoIn[];
  cenarios?: CenarioIn[];
  prescricoes?: PrescricaoIn[];
  colheitas?: ColheitaIn[];
  composicoes?: ComposicaoIn[];
  mdes?: MdeIn[];
  condutividade?: CondutividadeIn[];
  compactacao?: CompactacaoIn[];
  relatorios?: RelatorioIn[];
}

// ── Saídas ──────────────────────────────────────────────────────────────────

export interface EstadoEtapa {
  id: EtapaId;
  situacao: Situacao;
  /** O número que a etapa entrega (pontos, amostras, mapas, cenários, arquivos, cenas…). */
  quantidade: number;
  /** Frase curta para o chip: "42 pontos · enviado ao laboratório". */
  resumo: string;
  /** ISO da última atualização da etapa; null quando não há nada. */
  em: string | null;
  extra?: Record<string, number | string>;
}

export type SituacaoCiclo = 'completo' | 'andamento' | 'sem-dado';

export interface AvaliacaoTalhao {
  talhaoId: string;
  fazendaId: string;
  nome: string;
  areaHa: number;
  cultura: string;
  ano: number | null;
  etapas: EstadoEtapa[];
  ciclo: { feitas: number; total: number; proxima: EtapaId | null; situacao: SituacaoCiclo };
  atualizadoEm: string | null;
}

// ── Utilitários de período/data ─────────────────────────────────────────────

const conta = (x: number | unknown[] | undefined): number => (Array.isArray(x) ? x.length : typeof x === 'number' && Number.isFinite(x) ? x : 0);

/** Ano de um registro, na ordem de confiança da casa: `ano` gravado → data de
 *  referência → safra legada ("26/27" → 2026) → data da cena. */
export function anoDoRegistro(r: { ano?: number | null; safra?: string | null; data?: string | null; dataReferencia?: string | null }): number | null {
  if (typeof r.ano === 'number' && Number.isFinite(r.ano)) return r.ano;
  if (r.dataReferencia) { const a = anoDeData(r.dataReferencia); if (a != null) return a; }
  if (r.safra) { const a = anoDaSafra(r.safra); if (a != null) return a; }
  if (r.data) return anoDeData(r.data);
  return null;
}

/** Normaliza para ISO: número (Date.now) ou texto numérico viram data; texto ISO passa. */
export function isoDe(v: number | string | null | undefined): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? new Date(v).toISOString() : null;
  if (/^\d{10,}$/.test(v)) return new Date(Number(v)).toISOString();
  return v;
}

/** O mais recente entre ISOs (comparação textual: 'YYYY-MM-DD…' ordena sozinho). */
export function maxIso(vals: Array<string | null | undefined>): string | null {
  let m: string | null = null;
  for (const v of vals) { if (v && (m == null || v > m)) m = v; }
  return m;
}

/** 'YYYY-MM-DD…' → 'dd/mm/aa'. Sem data → '—'. */
export function fmtDataCurta(iso: string | null | undefined): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1].slice(2)}`;
}

const plural = (n: number, um: string, muitos: string) => `${n} ${n === 1 ? um : muitos}`;

/** kg/ha → sacas de 60 kg por hectare, 1 casa. */
export const kgParaSc = (kgha: number): number => Math.round((kgha / 60) * 10) / 10;

// ── Avaliação de um talhão ──────────────────────────────────────────────────

export function avaliarTalhao(d: DadosTalhao, safra: string): AvaliacaoTalhao {
  const ano = anoDaSafra(safra);
  const t = d.talhao;
  // Filtro de ano: por número quando a safra parseia; senão igualdade de texto (retrocompat).
  const doAno = <T extends { ano?: number | null; safra?: string | null; data?: string | null; dataReferencia?: string | null }>(lista: T[] | undefined): T[] =>
    (lista ?? []).filter(x => (ano != null ? anoDoRegistro(x) === ano : x.safra === safra));

  const etapas: EstadoEtapa[] = [];
  const seg = (id: string) => id.split('__');

  // 1. Amostragem
  const grades = doAno(d.grades);
  const pontos = grades.reduce((s, g) => s + conta(g.pontos), 0);
  const remessa = grades.some(g => !!g.codigoRemessa);
  etapas.push({
    id: 'amostragem',
    situacao: grades.length ? 'pronto' : 'pendente',
    quantidade: pontos,
    resumo: grades.length
      ? `${plural(pontos, 'ponto', 'pontos')}${grades.length > 1 ? ` em ${grades.length} grades` : ''}${remessa ? ' · enviado ao laboratório' : ''}`
      : 'Sem grade neste ano',
    em: maxIso(grades.map(g => g.criadoEm)),
    extra: { grades: grades.length },
  });

  // 2. Laudo
  const laudos = doAno(d.laudos);
  const amostras = laudos.reduce((s, l) => {
    const rs = l.resultados ?? [];
    const nums = new Set(rs.map(r => r.numero).filter((x): x is number => typeof x === 'number'));
    return s + (nums.size || rs.length);
  }, 0);
  const labs = Array.from(new Set(laudos.map(l => l.laboratorio).filter(Boolean)));
  etapas.push({
    id: 'laudo',
    situacao: laudos.length ? 'pronto' : remessa ? 'andamento' : 'pendente',
    quantidade: amostras,
    resumo: laudos.length
      ? `${plural(amostras, 'amostra', 'amostras')}${labs.length ? ` · ${labs.join(', ')}` : ''}`
      : remessa ? 'Amostras no laboratório — aguardando o laudo' : 'Sem análise neste ano',
    // "Aguardando o laudo" não tem data própria: herda a da remessa (a grade),
    // para entrar na linha do tempo como o que de fato aconteceu.
    em: maxIso(laudos.map(l => l.atualizadoEm ?? l.criadoEm)) ?? (remessa ? maxIso(grades.map(g => g.criadoEm)) : null),
  });

  // 3. Mapas de fertilidade: ids `${talhaoId}__${laudoId}__…__${nut}__${prof}`
  const idsLaudo = new Set(laudos.map(l => l.id));
  const mapasFert = (d.mapasNuvem ?? []).filter(m => { const s = seg(m.id); return s.length >= 4 && s[0] === t.id && idsLaudo.has(s[1]); });
  const chavesMapa = new Set(mapasFert.map(m => seg(m.id).slice(-2).join('__')));
  etapas.push({
    id: 'fertilidade',
    situacao: chavesMapa.size ? 'pronto' : laudos.length ? 'andamento' : 'pendente',
    quantidade: chavesMapa.size,
    resumo: chavesMapa.size
      ? plural(chavesMapa.size, 'mapa pronto', 'mapas prontos')
      : laudos.length ? 'Laudo recebido — mapas em processamento' : 'Sem mapas neste ano',
    // "Mapas em processamento" herda a data do laudo, pelo mesmo motivo.
    em: maxIso(mapasFert.map(m => m.atualizadoEm ?? m.salvoEm ?? m.criadoEm)) ?? maxIso(laudos.map(l => l.atualizadoEm ?? l.criadoEm)),
  });

  // 4. Recomendações (cenários; "para uso" = oficial)
  const cens = doAno(d.cenarios);
  const oficiais = cens.filter(c => c.oficial === true || c.oficial === 'true');
  etapas.push({
    id: 'recomendacoes',
    situacao: oficiais.length ? 'pronto' : cens.length ? 'andamento' : 'pendente',
    quantidade: cens.length,
    resumo: oficiais.length
      ? `${plural(cens.length, 'cenário', 'cenários')} · ${oficiais.length} para uso`
      : cens.length ? `${plural(cens.length, 'cenário', 'cenários')} em avaliação` : 'Sem recomendação neste ano',
    em: maxIso(cens.map(c => isoDe(c.geradoEm))),
    extra: { paraUso: oficiais.length },
  });

  // 5. Prescrições / arquivos de aplicação (ano é rótulo de texto; sem ano = vale sempre)
  const pres = (d.prescricoes ?? []).filter(p => !p.ano || (ano != null ? anoDaSafra(p.ano) === ano : p.ano === safra));
  const arquivos = pres.reduce((s, p) => s + (p.exportes?.length ?? 0), 0);
  etapas.push({
    id: 'prescricoes',
    situacao: arquivos ? 'pronto' : pres.length ? 'andamento' : 'pendente',
    quantidade: arquivos,
    resumo: arquivos
      ? `${plural(pres.length, 'prescrição', 'prescrições')} · ${plural(arquivos, 'arquivo gerado', 'arquivos gerados')}`
      : pres.length ? `${plural(pres.length, 'prescrição', 'prescrições')} sem arquivo ainda` : 'Sem prescrição neste ano',
    em: maxIso(pres.flatMap(p => [p.atualizadoEm, ...(p.exportes ?? []).map(e => e.em)])),
  });

  // 6. Zonas de manejo (estrutural — não depende do ano)
  const zs = d.zoneamentos ?? [];
  const zPadrao = zs.find(z => z.padrao) ?? zs[zs.length - 1];
  const nZonas = zPadrao?.meta?.nZonas ?? 0;
  etapas.push({
    id: 'zonas',
    situacao: zs.length ? 'pronto' : 'pendente',
    quantidade: nZonas,
    resumo: zs.length ? (nZonas ? plural(nZonas, 'zona', 'zonas') : 'zoneamento salvo') : 'Sem zoneamento',
    em: maxIso(zs.map(z => z.criadoEm)),
  });

  // 7. Altimetria
  const mdes = d.mdes ?? [];
  const mde = mdes.find(m => m.oficial) ?? mdes[mdes.length - 1];
  etapas.push({
    id: 'altimetria',
    situacao: mde ? 'pronto' : 'pendente',
    quantidade: mdes.length,
    resumo: mde ? (mde.rotuloFonte || 'relevo aprovado') : 'Sem relevo',
    em: maxIso(mdes.map(m => m.criadoEm)),
  });

  // 8. Condutividade elétrica
  const ces = d.condutividade ?? [];
  const ce = ces.find(c => c.oficial) ?? ces[ces.length - 1];
  etapas.push({
    id: 'condutividade',
    situacao: ce ? 'pronto' : 'pendente',
    quantidade: ces.length,
    resumo: ce ? `levantamento${ce.data ? ` de ${fmtDataCurta(ce.data)}` : ''}` : 'Sem levantamento',
    em: maxIso(ces.map(c => c.data ?? c.criadoEm)),
  });

  // 9. Satélite: cenas `${talhaoId}__ndvi__…` / `__ndvicbers__…` do ano + composições
  const cenas = (d.mapasNuvem ?? []).filter(m => {
    const s = seg(m.id);
    if (s[0] !== t.id || (s[1] !== 'ndvi' && s[1] !== 'ndvicbers')) return false;
    const data = m.cena?.data;
    return !!data && (ano == null || anoDeData(data) === ano);
  });
  const datas = new Set(cenas.map(m => m.cena?.data as string));
  const comps = doAno(d.composicoes);
  etapas.push({
    id: 'ndvi',
    situacao: datas.size || comps.length ? 'pronto' : 'pendente',
    quantidade: datas.size,
    resumo: datas.size
      ? `${plural(datas.size, 'cena', 'cenas')} · última ${fmtDataCurta(maxIso(Array.from(datas)))}${comps.length ? ` · ${plural(comps.length, 'composição', 'composições')}` : ''}`
      : comps.length ? plural(comps.length, 'composição temporal', 'composições temporais') : 'Sem cenas neste ano',
    em: maxIso([...Array.from(datas), ...comps.map(c => c.criadoEm)]),
  });

  // 10. Colheita
  const cols = doAno(d.colheitas);
  const col = cols.find(c => c.oficial) ?? cols[0];
  etapas.push({
    id: 'produtividade',
    situacao: col ? 'pronto' : 'pendente',
    quantidade: cols.length,
    resumo: col ? `${col.cultura || 'colheita'} · média ${kgParaSc(col.stats.mediaKgha).toLocaleString('pt-BR')} sc/ha` : 'Sem mapa de colheita',
    em: maxIso(cols.map(c => c.criadoEm)),
    extra: col ? { mediaScHa: kgParaSc(col.stats.mediaKgha), cv: col.stats.cv ?? 0, cultura: col.cultura || '' } : undefined,
  });

  // 11. Compactação
  const comp = doAno(d.compactacao);
  const pComp = comp.reduce((s, c) => s + conta(c.pontos), 0);
  etapas.push({
    id: 'compactacao',
    situacao: comp.length ? 'pronto' : 'pendente',
    quantidade: pComp,
    resumo: comp.length ? plural(pComp, 'ponto medido', 'pontos medidos') : 'Sem penetrometria',
    em: maxIso(comp.map(c => c.criadoEm)),
  });

  // 12. Relatórios
  const rels = doAno(d.relatorios);
  etapas.push({
    id: 'relatorios',
    situacao: rels.length ? 'pronto' : 'pendente',
    quantidade: rels.length,
    resumo: rels.length ? plural(rels.length, 'relatório gerado', 'relatórios gerados') : 'Sem relatório neste ano',
    em: maxIso(rels.map(r => isoDe(r.geradoEm))),
  });

  // Ciclo do ano
  const porId = new Map(etapas.map(e => [e.id, e]));
  const feitas = ETAPAS_CICLO.filter(id => porId.get(id)?.situacao === 'pronto').length;
  const proxima = ETAPAS_CICLO.find(id => porId.get(id)?.situacao !== 'pronto') ?? null;
  const algo = ETAPAS_CICLO.some(id => porId.get(id)?.situacao !== 'pendente');
  const situacao: SituacaoCiclo = feitas === ETAPAS_CICLO.length ? 'completo' : algo ? 'andamento' : 'sem-dado';

  return {
    talhaoId: t.id, fazendaId: t.fazendaId, nome: t.nome, areaHa: Number.isFinite(t.areaHa) ? t.areaHa : 0,
    cultura: d.cultura ?? '',
    ano,
    etapas,
    ciclo: { feitas, total: ETAPAS_CICLO.length, proxima, situacao },
    atualizadoEm: maxIso(etapas.map(e => e.em)),
  };
}

export function estadoEtapa(av: AvaliacaoTalhao, id: EtapaId): EstadoEtapa {
  const e = av.etapas.find(x => x.id === id);
  if (!e) throw new Error(`avaliação sem a etapa ${id}`);
  return e;
}

// ── Totais do produtor ──────────────────────────────────────────────────────

export interface ResumoPortal {
  nTalhoes: number;
  nFazendas: number;
  areaTotal: number;
  /** Área dos talhões com grade de amostragem no ano. */
  areaAmostrada: number;
  pctAmostrada: number;
  nPontos: number;
  nAmostras: number;
  nLaudos: number;
  nMapas: number;
  nCenarios: number;
  nArquivos: number;
  nCenas: number;
  nRelatorios: number;
  ciclo: { completo: number; andamento: number; semDado: number; areaCompleta: number; areaAndamento: number; areaSemDado: number };
  porEtapa: Array<{ id: EtapaId; prontos: number; andamento: number; area: number }>;
  atualizadoEm: string | null;
}

export function resumirPortal(avs: AvaliacaoTalhao[]): ResumoPortal {
  const arred = (v: number) => Math.round(v * 100) / 100;
  const areaTotal = avs.reduce((s, a) => s + a.areaHa, 0);
  const q = (a: AvaliacaoTalhao, id: EtapaId) => estadoEtapa(a, id).quantidade;
  const pronto = (a: AvaliacaoTalhao, id: EtapaId) => estadoEtapa(a, id).situacao === 'pronto';
  const areaAmostrada = avs.filter(a => pronto(a, 'amostragem')).reduce((s, a) => s + a.areaHa, 0);
  const ciclo = { completo: 0, andamento: 0, semDado: 0, areaCompleta: 0, areaAndamento: 0, areaSemDado: 0 };
  for (const a of avs) {
    if (a.ciclo.situacao === 'completo') { ciclo.completo++; ciclo.areaCompleta += a.areaHa; }
    else if (a.ciclo.situacao === 'andamento') { ciclo.andamento++; ciclo.areaAndamento += a.areaHa; }
    else { ciclo.semDado++; ciclo.areaSemDado += a.areaHa; }
  }
  ciclo.areaCompleta = arred(ciclo.areaCompleta); ciclo.areaAndamento = arred(ciclo.areaAndamento); ciclo.areaSemDado = arred(ciclo.areaSemDado);
  return {
    nTalhoes: avs.length,
    nFazendas: new Set(avs.map(a => a.fazendaId)).size,
    areaTotal: arred(areaTotal),
    areaAmostrada: arred(areaAmostrada),
    pctAmostrada: areaTotal > 0 ? Math.round((areaAmostrada / areaTotal) * 100) : 0,
    nPontos: avs.reduce((s, a) => s + q(a, 'amostragem'), 0),
    nAmostras: avs.reduce((s, a) => s + q(a, 'laudo'), 0),
    nLaudos: avs.filter(a => pronto(a, 'laudo')).length,
    nMapas: avs.reduce((s, a) => s + q(a, 'fertilidade'), 0),
    nCenarios: avs.reduce((s, a) => s + q(a, 'recomendacoes'), 0),
    nArquivos: avs.reduce((s, a) => s + q(a, 'prescricoes'), 0),
    nCenas: avs.reduce((s, a) => s + q(a, 'ndvi'), 0),
    nRelatorios: avs.reduce((s, a) => s + q(a, 'relatorios'), 0),
    ciclo,
    porEtapa: ETAPAS.map(e => ({
      id: e.id,
      prontos: avs.filter(a => pronto(a, e.id)).length,
      andamento: avs.filter(a => estadoEtapa(a, e.id).situacao === 'andamento').length,
      area: arred(avs.filter(a => pronto(a, e.id)).reduce((s, a) => s + a.areaHa, 0)),
    })),
    atualizadoEm: maxIso(avs.map(a => a.atualizadoEm)),
  };
}

// ── Séries dos gráficos ─────────────────────────────────────────────────────

export interface AreaPorAno { ano: number; areaHa: number; nTalhoes: number; pontos: number }

/** Área amostrada por ano: cada talhão conta UMA vez por ano (a área é a do
 *  talhão, não a soma das grades). `anos` força a presença de anos sem dado. */
export function areaAmostradaPorAno(dados: DadosTalhao[], anos: number[] = []): AreaPorAno[] {
  const porAno = new Map<number, AreaPorAno>();
  const obter = (ano: number) => { let a = porAno.get(ano); if (!a) { a = { ano, areaHa: 0, nTalhoes: 0, pontos: 0 }; porAno.set(ano, a); } return a; };
  for (const ano of anos) obter(ano);
  for (const d of dados) {
    const vistos = new Set<number>();
    for (const g of d.grades ?? []) {
      const ano = anoDoRegistro(g);
      if (ano == null) continue;
      const a = obter(ano);
      a.pontos += conta(g.pontos);
      if (!vistos.has(ano)) { vistos.add(ano); a.nTalhoes++; a.areaHa += Number.isFinite(d.talhao.areaHa) ? d.talhao.areaHa : 0; }
    }
  }
  return Array.from(porAno.values()).map(a => ({ ...a, areaHa: Math.round(a.areaHa * 100) / 100 })).sort((a, b) => a.ano - b.ano);
}

/** Nutrientes que o produtor acompanha no gráfico de evolução (ids do laudo). */
export const NUTRIENTES_EVOLUCAO: Array<{ id: string; rotulo: string; unidade: string }> = [
  { id: 'ph', rotulo: 'pH', unidade: '' },
  { id: 'p',  rotulo: 'P',  unidade: 'mg/dm³' },
  { id: 'k',  rotulo: 'K',  unidade: 'cmolc/dm³' },
  { id: 'mo', rotulo: 'MO', unidade: '%' },
  { id: 'v',  rotulo: 'V%', unidade: '%' },
];

export interface PontoEvolucao { ano: number; n: number; valores: Record<string, number | null> }
export interface EvolucaoNutrientes { profundidade: string | null; nutrientes: string[]; pontos: PontoEvolucao[] }

const profNum = (s: string): number => { const m = /(\d+)/.exec(s ?? ''); return m ? Number(m[1]) : 0; };

/** Média por ano de cada nutriente na camada MAIS RASA do laudo (0-20 em geral).
 *  Vários laudos no mesmo ano viram uma média ponderada pelo nº de amostras. */
export function evolucaoNutrientes(laudos: LaudoIn[], nutrientes: string[] = NUTRIENTES_EVOLUCAO.map(n => n.id)): EvolucaoNutrientes {
  let profRef: string | null = null;
  for (const l of laudos) for (const r of l.resultados ?? []) {
    if (profRef == null || profNum(r.profundidade) < profNum(profRef)) profRef = r.profundidade;
  }
  const porAno = new Map<number, { n: number; soma: Record<string, number>; cont: Record<string, number> }>();
  for (const l of laudos) {
    const ano = anoDoRegistro(l);
    if (ano == null) continue;
    const rs = (l.resultados ?? []).filter(r => profRef == null || profNum(r.profundidade) === profNum(profRef));
    if (!rs.length) continue;
    let acc = porAno.get(ano);
    if (!acc) { acc = { n: 0, soma: {}, cont: {} }; porAno.set(ano, acc); }
    acc.n += rs.length;
    for (const r of rs) for (const nut of nutrientes) {
      const v = r.valores?.[nut];
      if (typeof v === 'number' && Number.isFinite(v)) { acc.soma[nut] = (acc.soma[nut] ?? 0) + v; acc.cont[nut] = (acc.cont[nut] ?? 0) + 1; }
    }
  }
  const pontos: PontoEvolucao[] = Array.from(porAno.entries()).map(([ano, acc]) => ({
    ano, n: acc.n,
    valores: Object.fromEntries(nutrientes.map(nut => [nut, acc.cont[nut] ? Math.round((acc.soma[nut] / acc.cont[nut]) * 100) / 100 : null])),
  })).sort((a, b) => a.ano - b.ano);
  return { profundidade: profRef, nutrientes, pontos };
}

export interface ItemColheita { talhaoId: string; nome: string; cultura: string; mediaScHa: number; cv: number }

/** Talhões com mapa de colheita no ano, do mais produtivo ao menos. */
export function rankingColheita(avs: AvaliacaoTalhao[]): ItemColheita[] {
  const out: ItemColheita[] = [];
  for (const a of avs) {
    const e = estadoEtapa(a, 'produtividade');
    if (e.situacao !== 'pronto' || !e.extra) continue;
    out.push({ talhaoId: a.talhaoId, nome: a.nome, cultura: String(e.extra.cultura ?? ''), mediaScHa: Number(e.extra.mediaScHa ?? 0), cv: Number(e.extra.cv ?? 0) });
  }
  return out.sort((a, b) => b.mediaScHa - a.mediaScHa);
}

export interface EventoPortal { em: string; talhaoId: string; talhao: string; etapa: EtapaId; situacao: Situacao; texto: string }

/** Últimas entregas, da mais recente para a mais antiga. */
export function linhaDoTempo(avs: AvaliacaoTalhao[], limite = 12): EventoPortal[] {
  const out: EventoPortal[] = [];
  for (const a of avs) for (const e of a.etapas) {
    if (!e.em || e.situacao === 'pendente') continue;
    out.push({ em: e.em, talhaoId: a.talhaoId, talhao: a.nome, etapa: e.id, situacao: e.situacao, texto: `${etapaDef(e.id).rotulo}: ${e.resumo}` });
  }
  return out.sort((x, y) => (y.em > x.em ? 1 : y.em < x.em ? -1 : 0)).slice(0, limite);
}

// ── Mini-mapa em SVG ────────────────────────────────────────────────────────

export interface FormaTalhao { id: string; d: string; cx: number; cy: number; w: number; h: number }
export interface ProjecaoTalhoes { viewBox: string; largura: number; altura: number; formas: FormaTalhao[] }

type Anel = number[][];

function aneisDe(geo: unknown): Anel[] {
  const out: Anel[] = [];
  const visitar = (g: unknown) => {
    if (!g || typeof g !== 'object') return;
    const o = g as { type?: string; features?: unknown[]; geometry?: unknown; coordinates?: unknown; geometries?: unknown[] };
    if (o.type === 'FeatureCollection') (o.features ?? []).forEach(visitar);
    else if (o.type === 'Feature') visitar(o.geometry);
    else if (o.type === 'GeometryCollection') (o.geometries ?? []).forEach(visitar);
    else if (o.type === 'Polygon' && Array.isArray(o.coordinates)) (o.coordinates as Anel[]).forEach(r => out.push(r));
    else if (o.type === 'MultiPolygon' && Array.isArray(o.coordinates)) (o.coordinates as Anel[][]).forEach(p => (p ?? []).forEach(r => out.push(r)));
  };
  visitar(geo);
  return out.filter(r => Array.isArray(r) && r.length >= 3 && r.every(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])));
}

/** Projeta os polígonos (lng/lat) numa caixa `largura × altura`, mantendo a
 *  proporção real (longitude corrigida pelo cosseno da latitude). Talhão sem
 *  geometria válida fica de fora. */
export function projetarTalhoes(itens: Array<{ id: string; geojson?: string | null }>, largura = 600, altura = 400, margem = 12): ProjecaoTalhoes {
  const porTalhao: Array<{ id: string; aneis: Anel[] }> = [];
  for (const it of itens) {
    if (!it.geojson) continue;
    let geo: unknown;
    try { geo = JSON.parse(it.geojson); } catch { continue; }
    const aneis = aneisDe(geo);
    if (aneis.length) porTalhao.push({ id: it.id, aneis });
  }
  const viewBox = `0 0 ${largura} ${altura}`;
  if (!porTalhao.length) return { viewBox, largura, altura, formas: [] };

  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const t of porTalhao) for (const r of t.aneis) for (const [lng, lat] of r) {
    if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
  }
  const k = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180) || 1;
  const dx = (maxLng - minLng) * k || 1e-9;
  const dy = (maxLat - minLat) || 1e-9;
  const escala = Math.min((largura - 2 * margem) / dx, (altura - 2 * margem) / dy);
  const offX = margem + ((largura - 2 * margem) - dx * escala) / 2;
  const offY = margem + ((altura - 2 * margem) - dy * escala) / 2;
  const px = (lng: number) => Math.round((offX + (lng - minLng) * k * escala) * 10) / 10;
  const py = (lat: number) => Math.round((offY + (maxLat - lat) * escala) * 10) / 10;

  const formas: FormaTalhao[] = porTalhao.map(t => {
    let d = '';
    let a = Infinity, b = -Infinity, c = Infinity, e = -Infinity;
    for (const r of t.aneis) {
      d += r.map(([lng, lat], i) => `${i === 0 ? 'M' : 'L'}${px(lng)} ${py(lat)}`).join('') + 'Z';
      for (const [lng, lat] of r) { const x = px(lng), y = py(lat); if (x < a) a = x; if (x > b) b = x; if (y < c) c = y; if (y > e) e = y; }
    }
    // rótulo no centro da CAIXA do talhão (bom o bastante para um nome curto)
    return { id: t.id, d, cx: Math.round(((a + b) / 2) * 10) / 10, cy: Math.round(((c + e) / 2) * 10) / 10, w: Math.round((b - a) * 10) / 10, h: Math.round((e - c) * 10) / 10 };
  });
  return { viewBox, largura, altura, formas };
}
