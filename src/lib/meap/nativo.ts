// ZONEAMENTO NATIVO — converte um zoneamento IMPORTADO (arquivo do cliente) no
// MESMO modelo interno que a plataforma grava quando ELA gera as zonas.
//
// Por que este módulo existe: a zona importada vivia solta em
// `talhao.zonasGeojson` — um arquivo colado no talhão. As ferramentas (suavizar,
// editor manual, versionar, exportar, prescrever) operam sobre um ZONEAMENTO
// salvo: id, meta, versão, histórico. Por isso o cliente "não conseguia
// trabalhar com zonas importadas": não faltava ferramenta, faltava MODELO.
// Converter uma vez destrava todas de uma vez.
//
// O contrato de saída é o das features que `salvar()` grava no MeapSection:
//   { id, zona, classe, cor, potencialRank, areaHa }
// Quem consome isso — EditorZonasManual (rank/classe/cor/id), SuavizarLimites,
// ExportarZonas, Prescrições — passa a funcionar sem saber da origem.
//
// Puro (sem browser/DOM) para os testes rodarem em node: npm run teste:nativo
// .ts explícito nos imports: o type-stripping do node resolve o caminho literal.

import turfArea from '@turf/area';
import { limparGeometria } from './fundir.ts';
import { classeZona, classeReconhecida, corZonaPorPosicao, ORDEM_CLASSES } from '../zonas.ts';

type Poligonal = GeoJSON.Feature;

/** Uma classe oficial do zoneamento convertido (uma "zona", com N polígonos). */
export interface ClasseNativa {
  /** valor CRU do arquivo (o que estava no atributo escolhido) */
  valor: string;
  /** rótulo final — o que aparece na plataforma */
  classe: string;
  /** 0 = maior potencial (mesma convenção do zoneamento gerado) */
  rank: number;
  /** nº da zona oficial: "01", "02"… pela ordem do potencial */
  num: string;
  cor: string;
  nPolig: number;
  areaHa: number;
}

export interface ZoneamentoNativo {
  fc: GeoJSON.FeatureCollection;
  classes: ClasseNativa[];
  nPoligonos: number;
  areaTotalHa: number;
  /** o que a validação descartou — some na tela, então tem que ser dito */
  descartados: { semGeometria: number; semArea: number };
}

export interface OpcoesNativo {
  /** valor cru → rótulo final (renomear cada valor à mão) */
  nomes?: Record<string, string>;
  /** valores crus do MAIOR potencial ao menor; sem isso, deduz dos rótulos */
  ordemValores?: string[];
  /** corrige topologia: descarta buracos/ilhas menores que isso (ha). 0 = não mexe */
  fragMinHa?: number;
}

const texto = (v: unknown): string => (v == null ? '' : String(v).trim());

const areaHaDe = (geom: GeoJSON.Geometry): number =>
  Math.round((turfArea({ type: 'Feature', geometry: geom, properties: {} }) / 10000) * 100) / 100;

/** Posição canônica de um rótulo na escala de potencial (menor = melhor zona). */
function posCanonica(label: string): number {
  const i = ORDEM_CLASSES.indexOf(label);
  if (i >= 0) return i;                                  // Alta … Baixa
  const m = label.match(/(\d+)/);
  if (m) return 100 + parseInt(m[1], 10);                // "Nível 3", "Zona 2"
  return 900;                                            // nome livre: mantém a ordem de chegada
}

/**
 * Ordena rótulos do MAIOR potencial para o menor. Empate (nomes livres, que a
 * escala não conhece) preserva a ordem de entrada — renomear uma classe não
 * pode reordenar o zoneamento.
 */
export function ordenarClasses(labels: string[]): string[] {
  return labels
    .map((label, i) => ({ label, i }))
    .sort((a, b) => posCanonica(a.label) - posCanonica(b.label) || a.i - b.i)
    .map(x => x.label);
}

/**
 * Converte a FeatureCollection importada em Zoneamento Nativo.
 *
 * Etapas (spec §2): validar geometria → corrigir topologia → padronizar
 * atributos → criar IDs internos → agrupar em zonas oficiais ordenadas por
 * potencial. A gravação (versão/vínculo/metadados) fica com quem chama —
 * este módulo é puro para poder ser testado sem browser.
 */
export function paraZoneamentoNativo(
  entrada: GeoJSON.FeatureCollection,
  opcoes: OpcoesNativo = {},
): ZoneamentoNativo {
  const feats = entrada.features ?? [];

  // 1) Validar geometria — só polígono entra num zoneamento.
  const poligonais = feats.filter(
    f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'),
  ) as Poligonal[];
  const semGeometria = feats.length - poligonais.length;

  // 2) Corrigir topologia + descartar o que não tem área (anel degenerado).
  const minM2 = Math.max(opcoes.fragMinHa ?? 0, 0) * 10000;
  const limpas: Array<{ geometry: GeoJSON.Geometry; props: Record<string, unknown>; areaHa: number }> = [];
  let semArea = 0;
  for (const f of poligonais) {
    const geometry = minM2 > 0 ? limparGeometria(f.geometry!, minM2) : f.geometry!;
    const areaHa = areaHaDe(geometry);
    if (areaHa <= 0) { semArea++; continue; }
    limpas.push({ geometry, props: { ...(f.properties ?? {}) }, areaHa });
  }

  // 3) Chave da classe: o valor CRU do arquivo (`classeOrigem`, gravado pela
  //    normalização) manda — é ele que permite renomear/remapear sem reimportar.
  //    Sem valor cru, cai no rótulo já normalizado.
  const chaveDe = (props: Record<string, unknown>): string => {
    const cru = texto(props.classeOrigem);
    if (cru) return cru;
    const label = texto(props.classe);
    return label || '—';
  };
  // O rótulo passa SEMPRE pelo semáforo quando é reconhecido: um arquivo antigo
  // chega com "BAIXA"/"MEDIA" cru, e texto cru não bate com a escala canônica —
  // a classe cairia no fim da fila de ordenação e "BAIXA" viraria o MAIOR
  // potencial (prescrição invertida). Nome livre, que o semáforo não conhece,
  // é preservado como o usuário escreveu.
  const rotuloDe = (chave: string, props: Record<string, unknown>): string => {
    const custom = opcoes.nomes?.[chave];
    if (custom && custom.trim()) return custom.trim();
    const label = texto(props.classe) || chave;
    return classeReconhecida(label) ? classeZona(label).label : label;
  };

  // Agrupa por classe preservando a ordem de aparição no arquivo.
  const grupos = new Map<string, { valor: string; classe: string; itens: typeof limpas }>();
  for (const item of limpas) {
    const chave = chaveDe(item.props);
    const g = grupos.get(chave);
    if (g) g.itens.push(item);
    else grupos.set(chave, { valor: chave, classe: rotuloDe(chave, item.props), itens: [item] });
  }

  // 4) Ordem do potencial: a explícita (a UI sabe a direção que o usuário
  //    escolheu) tem prioridade; sem ela, deduz dos rótulos.
  let ordenados = [...grupos.values()];
  if (opcoes.ordemValores?.length) {
    const pos = new Map(opcoes.ordemValores.map((v, i) => [v, i]));
    ordenados.sort((a, b) => (pos.get(a.valor) ?? 999) - (pos.get(b.valor) ?? 999));
  } else {
    const ordemLabels = ordenarClasses(ordenados.map(g => g.classe));
    const pos = new Map<string, number>();
    ordemLabels.forEach((l, i) => { if (!pos.has(l)) pos.set(l, i); });
    ordenados = ordenados
      .map((g, i) => ({ g, i }))
      .sort((a, b) => (pos.get(a.g.classe) ?? 999) - (pos.get(b.g.classe) ?? 999) || a.i - b.i)
      .map(x => x.g);
  }

  const total = ordenados.length;
  const classes: ClasseNativa[] = [];
  const features: GeoJSON.Feature[] = [];
  const idsUsados = new Set<string>();

  // Paleta: cor do semáforo só quando ELA SOZINHA distingue todas as zonas.
  // Um nome livre engana o semáforo — "Baixada úmida" casa com /BAIX/ e sairia
  // no mesmo vermelho de "Baixa", deixando duas zonas indistinguíveis no mapa.
  // Nesse caso a rampa verde→vermelho por posição vale para TODAS (paleta
  // coerente, uma cor por zona).
  const rotulos = ordenados.map(g => g.classe);
  const usarSemaforo = total <= 5
    && rotulos.every(r => classeReconhecida(r))
    && new Set(rotulos.map(r => classeZona(r).cor)).size === total;

  ordenados.forEach((g, pos) => {
    const num = String(pos + 1).padStart(2, '0');
    const cor = usarSemaforo ? classeZona(g.classe).cor : corZonaPorPosicao(pos, total);
    let areaHa = 0;

    for (const item of g.itens) {
      // 5) IDs internos — únicos por POLÍGONO (o editor manual indexa por id;
      //    id repetido faria uma zona sumir ao editar).
      let id = texto(item.props.id) || `${num}`;
      if (idsUsados.has(id)) {
        let n = 2;
        while (idsUsados.has(`${id}_${n}`)) n++;
        id = `${id}_${n}`;
      }
      idsUsados.add(id);
      areaHa += item.areaHa;

      // 6) Padronizar atributos — o contrato do zoneamento gerado.
      features.push({
        type: 'Feature',
        properties: {
          id, zona: num, classe: g.classe, cor, potencialRank: pos,
          areaHa: item.areaHa, classeOrigem: g.valor,
        },
        geometry: item.geometry,
      });
    }

    classes.push({
      valor: g.valor, classe: g.classe, rank: pos, num, cor,
      nPolig: g.itens.length, areaHa: Math.round(areaHa * 100) / 100,
    });
  });

  return {
    fc: { type: 'FeatureCollection', features },
    classes,
    nPoligonos: features.length,
    areaTotalHa: Math.round(classes.reduce((s, c) => s + c.areaHa, 0) * 100) / 100,
    descartados: { semGeometria, semArea },
  };
}
