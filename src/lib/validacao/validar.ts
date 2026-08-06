// ORQUESTRADOR da validação — junta os módulos e devolve o relatório completo.
//
// Contrato que a tela pode confiar (e que os testes travam):
//   • `indicadores` traz SEMPRE os 16 do dashboard, na ordem, mesmo pendentes;
//   • nenhum indicador é omitido por falta de dado — falta vira `pendencia`;
//   • toda recomendação carrega `base` com os indicadores que a sustentam;
//   • o IQZM é o último a ser calculado, a partir dos que já existem.
//
// npm run teste:validacao

import { resumoValores, separacaoEntreZonas, escoreRuim, type Separacao } from './estatistica.ts';
import { metricasEspaciais, type MetricasEspaciais } from './espacial.ts';
import { amostrarPorZona, malhaNasZonas, valorNoPonto, decodificarF32, type Bounds, type Grid, type ZonaGeom } from './amostragem.ts';
import { calcularIVR, ivrDoZoneamento } from './ivr.ts';
import { calcularIPE, type CamadaTemporal, type DetalheIPE } from './ipe.ts';
import { calcularICA } from './ica.ts';
import { calcularIQZM, rotuloIQZM, type ComponenteIQZM } from './iqzm.ts';
import {
  INDICADORES_DASHBOARD, NOME_INDICADOR, descritivo, faixaMenorMelhor, faixaMaiorMelhor, pendente,
  type IdIndicador, type Indicador, type Recomendacao, type RelatorioValidacao, type ValidacaoZona,
} from './tipos.ts';

export interface CamadaValidacao {
  id: string;
  nome: string;
  unidade: string;
  grupo?: string;
  grid: Grid;
  bounds: Bounds;
  /** safra/ano/data — presente ⇒ entra na série temporal do IPE. */
  periodo?: string;
}

export interface PoligonoZona {
  idZona: string;
  nome: string;
  classe: string;
  cor: string;
  rank?: number;
  areaHa?: number;
  geometry: GeoJSON.Geometry | null | undefined;
}

export interface EntradaValidacao {
  cenarioId: string;
  cenarioNome: string;
  /** UM item por POLÍGONO (zonas multipartes repetem o idZona). */
  poligonos: PoligonoZona[];
  camadas: CamadaValidacao[];
  /** id da camada usada nos indicadores estatísticos. Default: a 1ª. */
  camadaValidacaoId?: string;
  /** Piso operacional da mancha (ha). Default: área mínima do zoneamento ou 0,5. */
  pisoHa?: number;
  /** Pontos de laboratório do talhão — entram na contagem de observações do ICA. */
  nPontosLab?: number;
}

export interface RelatorioCompleto extends RelatorioValidacao {
  espacial: MetricasEspaciais;
  separacao: Separacao | null;
  ipe: DetalheIPE | null;
}

const fmt = (v: number, d = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmt0 = (v: number) => Math.round(v).toLocaleString('pt-BR');

/** Metros por pixel de um grid (aproximação pela latitude do centro). */
export function resolucaoM(grid: Grid, b: Bounds): number | null {
  const [rows, cols] = grid.shape;
  if (!rows || !cols) return null;
  const [w, s, e, n] = b;
  const latC = (s + n) / 2;
  const larguraM = Math.abs(e - w) * 111_320 * Math.cos((latC * Math.PI) / 180);
  const alturaM = Math.abs(n - s) * 110_540;
  const px = larguraM / Math.max(1, cols - 1);
  const py = alturaM / Math.max(1, rows - 1);
  const m = (px + py) / 2;
  return Number.isFinite(m) && m > 0 ? Math.round(m * 10) / 10 : null;
}

export function validarZoneamento(e: EntradaValidacao): RelatorioCompleto {
  // ── 1. Espacial (independe de camada: é a forma do mapa) ──────────────────
  const espacial = metricasEspaciais(
    e.poligonos.map(p => ({ idZona: p.idZona, geometry: p.geometry, areaHa: p.areaHa })),
    e.pisoHa ?? 0.5,
  );
  const areaTotalHa = espacial.areaTotalHa;

  // Identidade das zonas (o 1º polígono manda no rótulo/cor).
  const idsZona: string[] = [];
  const idente = new Map<string, PoligonoZona>();
  for (const p of e.poligonos) if (!idente.has(p.idZona)) { idente.set(p.idZona, p); idsZona.push(p.idZona); }
  const zonasGeom: ZonaGeom[] = e.poligonos.map(p => ({ idZona: p.idZona, geometry: p.geometry }));

  // ── 2. Camada de validação ────────────────────────────────────────────────
  const camada = e.camadas.find(c => c.id === e.camadaValidacaoId) ?? e.camadas[0] ?? null;

  const valoresPorZona = camada ? amostrarPorZona(zonasGeom, camada.grid, camada.bounds) : new Map<string, number[]>();
  const todos: number[] = [];
  for (const v of valoresPorZona.values()) todos.push(...v);
  const resumoTalhao = camada ? resumoValores(todos) : null;
  const escalaTalhao = resumoTalhao ? resumoTalhao.amplitude : undefined;

  // ── 3. Por zona: resumo + IVR ─────────────────────────────────────────────
  const porZona: ValidacaoZona[] = idsZona.map(id => {
    const ref = idente.get(id)!;
    const esp = espacial.porZona.find(z => z.idZona === id);
    const r = resumoValores(valoresPorZona.get(id) ?? []);
    const { indicador } = calcularIVR(r, camada?.unidade ?? '', escalaTalhao);
    return {
      idZona: id, nome: ref.nome, classe: ref.classe, cor: ref.cor, rank: ref.rank,
      areaHa: esp?.areaHa ?? ref.areaHa ?? 0,
      percArea: areaTotalHa > 0 ? (esp?.areaHa ?? 0) / areaTotalHa : 0,
      nPoligonos: esp?.nPoligonos ?? 0,
      resumo: r,
      ivr: indicador,
    };
  });

  const ivrGlobal = ivrDoZoneamento(porZona.map(z => ({ areaHa: z.areaHa, ivr: z.ivr.valor })));
  const coberturaPct = areaTotalHa > 0 ? (ivrGlobal.areaAvaliadaHa / areaTotalHa) * 100 : 0;

  // ── 4. Separação entre zonas ──────────────────────────────────────────────
  const separacao = camada
    ? separacaoEntreZonas(idsZona.map(id => ({ id, valores: valoresPorZona.get(id) ?? [] })))
    : null;

  // ── 5. Persistência (IPE) ─────────────────────────────────────────────────
  const temporais: CamadaTemporal[] = e.camadas
    .filter(c => !!c.periodo)
    .map(c => ({ id: c.id, nome: c.nome, periodo: c.periodo!, grid: c.grid, bounds: c.bounds }));
  const ipeRes = calcularIPE(zonasGeom, temporais);
  const nSafras = new Set(temporais.map(c => c.periodo)).size;

  // ── 6. Confiança da base (ICA) ────────────────────────────────────────────
  //
  // CONSISTÊNCIA ENTRE OS MAPAS: quanto do talhão cada camada realmente cobre.
  // Um NDVI com metade do talhão sob nuvem ou um mapa de colheita que parou no
  // meio da lavoura entram na análise como se fossem inteiros — e é exatamente
  // aí que a nota fica otimista sem ninguém perceber. Medido na MESMA malha
  // para todas as camadas, então a comparação é justa.
  const malha = malhaNasZonas(zonasGeom, 900);
  const coberturaCamadas = e.camadas.map(c => {
    let vals: Float32Array | undefined;
    try { vals = decodificarF32(c.grid.b64); } catch { vals = undefined; }
    const validos = malha.reduce((n, p) => n + (Number.isFinite(valorNoPonto(c.grid, c.bounds, p.lng, p.lat, vals)) ? 1 : 0), 0);
    return { id: c.id, nome: c.nome, coberturaPct: malha.length ? (validos / malha.length) * 100 : 0 };
  });
  const consistenciaPct = coberturaCamadas.length
    ? coberturaCamadas.reduce((s, c) => s + c.coberturaPct, 0) / coberturaCamadas.length
    : null;
  const piorCamada = coberturaCamadas.length
    ? [...coberturaCamadas].sort((a, b) => a.coberturaPct - b.coberturaPct)[0]
    : null;

  const icaRes = calcularICA({
    nSafras,
    nCamadas: e.camadas.length,
    resolucaoM: camada ? resolucaoM(camada.grid, camada.bounds) : null,
    coberturaPct,
    nObservacoes: todos.length + (e.nPontosLab ?? 0),
    outliersPct: resumoTalhao ? resumoTalhao.pctOutliers : null,
    consistenciaPct,
    piorCamada: piorCamada && piorCamada.coberturaPct < 95 ? { nome: piorCamada.nome, coberturaPct: piorCamada.coberturaPct } : null,
  });

  // ── 7. Escores espaciais ──────────────────────────────────────────────────
  // Fragmentação: MENOR é melhor. Polígonos por zona pesa mais que a área em
  // respingo porque é o que o operador sente (trocar de dose muitas vezes).
  const escoreFrag = espacial.nZonas
    ? 0.6 * escoreRuim(espacial.poligonosPorZona, 1, 8) + 0.4 * escoreRuim(espacial.pctAreaFragmentos, 0, 15)
    : null;
  // Continuidade: MAIOR é melhor. LPI (a zona é uma mancha só?) + forma
  // (contorno rendado exige manobra que a máquina não faz).
  const escoreCont = espacial.nZonas
    ? 0.6 * (espacial.lpiMedio * 100) + 0.4 * (100 - escoreRuim(espacial.indiceFormaMedio, 1.3, 3))
    : null;

  // ── 8. IQZM (por último, sobre o que existe) ──────────────────────────────
  const componentes: Partial<Record<ComponenteIQZM, number | null>> = {
    homogeneidade: ivrGlobal.valor != null ? 100 - ivrGlobal.valor : null,
    separacao: separacao ? separacao.eta2 * separacao.distincao * 100 : null,
    continuidade: escoreCont,
    fragmentacao: escoreFrag != null ? 100 - escoreFrag : null,
    ipe: ipeRes.indicador.valor,
  };
  const iqzmRes = calcularIQZM({ componentes });

  // ── 9. Os 16 do dashboard, sempre ─────────────────────────────────────────
  const un = camada?.unidade ?? '';
  const semCamada = 'Nenhuma camada de validação disponível (produtividade, NDVI, CE ou fertilidade interpolada).';

  const ind = (id: IdIndicador): Indicador => {
    switch (id) {
      case 'iqzm': return iqzmRes.indicador;
      case 'ica': return icaRes.indicador;
      case 'ipe': return ipeRes.indicador;
      case 'ivr':
        return ivrGlobal.valor == null
          ? pendente('ivr', camada ? 'Nenhuma zona recebeu pixels suficientes da camada de validação.' : semCamada)
          : {
              id: 'ivr', nome: NOME_INDICADOR.ivr, valor: ivrGlobal.valor, unidade: '',
              faixa: faixaMenorMelhor(ivrGlobal.valor),
              justificativa: `Média das zonas ponderada por área (${fmt(ivrGlobal.areaAvaliadaHa)} de ${fmt(areaTotalHa)} ha avaliados), sobre ${camada?.nome}. Menor = mais homogêneo por dentro.`,
              entradas: { areaAvaliadaHa: ivrGlobal.areaAvaliadaHa, areaTotalHa },
            };
      case 'cv':
        return resumoTalhao?.cv == null
          ? pendente('cv', resumoTalhao ? 'A média da camada é ~0 — o CV perde sentido nesta escala; leia amplitude e IQR.' : semCamada, '%')
          : {
              id: 'cv', nome: NOME_INDICADOR.cv, valor: Math.round(resumoTalhao.cv * 10) / 10, unidade: '%',
              faixa: resumoTalhao.cv <= 10 ? 'otimo' : resumoTalhao.cv <= 20 ? 'bom' : resumoTalhao.cv <= 30 ? 'regular' : 'ruim',
              justificativa: `CV do talhão inteiro em ${camada?.nome}. É a variação TOTAL — a que o zoneamento tenta explicar; sozinho não diz se as zonas ficaram boas (por isso o IVR e a separação ao lado).`,
              entradas: { n: resumoTalhao.n },
            };
      case 'media': return descritivo('media', resumoTalhao?.media ?? null, un, resumoTalhao ? `Média de ${fmt0(resumoTalhao.n)} pixels de ${camada?.nome}.` : semCamada);
      case 'mediana': return descritivo('mediana', resumoTalhao?.mediana ?? null, un, resumoTalhao ? 'Metade da área está abaixo deste valor. Não se move com outlier — compare com a média para farejar cauda.' : semCamada);
      case 'minimo': return descritivo('minimo', resumoTalhao?.min ?? null, un, resumoTalhao ? `Menor valor observado (p5 = ${fmt(resumoTalhao.p5)}).` : semCamada);
      case 'maximo': return descritivo('maximo', resumoTalhao?.max ?? null, un, resumoTalhao ? `Maior valor observado (p95 = ${fmt(resumoTalhao.p95)}).` : semCamada);
      case 'amplitude': return descritivo('amplitude', resumoTalhao?.amplitude ?? null, un, resumoTalhao ? `Máximo − mínimo. Faixa robusta (p95−p5): ${fmt(resumoTalhao.p95 - resumoTalhao.p5)} ${un}.` : semCamada);
      case 'desvio': return descritivo('desvio', resumoTalhao?.desvio ?? null, un, resumoTalhao ? `Desvio padrão populacional · IQR ${fmt(resumoTalhao.iqr)} ${un} · ${fmt(resumoTalhao.pctOutliers)}% de outliers.` : semCamada);
      case 'safras':
        return nSafras === 0
          ? pendente('safras', 'Nenhuma camada com safra/data identificada.', 'safras')
          : {
              id: 'safras', nome: NOME_INDICADOR.safras, valor: nSafras, unidade: nSafras === 1 ? 'safra' : 'safras',
              faixa: nSafras >= 4 ? 'otimo' : nSafras >= 3 ? 'bom' : nSafras >= 2 ? 'regular' : 'ruim',
              justificativa: nSafras >= 2
                ? `${nSafras} períodos distintos entram na persistência (IPE).`
                : 'Com uma safra só não há persistência a medir — o IPE fica em aberto.',
            };
      case 'fragmentacao':
        return escoreFrag == null
          ? pendente('fragmentacao', 'Zoneamento sem polígonos válidos.')
          : {
              id: 'fragmentacao', nome: NOME_INDICADOR.fragmentacao, valor: Math.round(escoreFrag * 10) / 10, unidade: '',
              faixa: faixaMenorMelhor(escoreFrag),
              justificativa: `${espacial.nPoligonos} polígono(s) para ${espacial.nZonas} zona(s) (${fmt(espacial.poligonosPorZona)} por zona) · ${fmt(espacial.pctAreaFragmentos)}% da área em manchas menores que ${fmt(espacial.pisoHa, 2)} ha. Menor = mais operável.`,
              entradas: { nPoligonos: espacial.nPoligonos, nZonas: espacial.nZonas, pctFragmentos: espacial.pctAreaFragmentos },
            };
      case 'continuidade':
        return escoreCont == null
          ? pendente('continuidade', 'Zoneamento sem polígonos válidos.')
          : {
              id: 'continuidade', nome: NOME_INDICADOR.continuidade, valor: Math.round(escoreCont * 10) / 10, unidade: '',
              faixa: faixaMaiorMelhor(escoreCont),
              justificativa: `Maior mancha cobre ${fmt(espacial.lpiMedio * 100)}% da zona (média ponderada) · índice de forma ${fmt(espacial.indiceFormaMedio, 2)} (1 = mancha redonda, acima de 2 = contorno rendado). Maior = melhor de operar.`,
              entradas: { lpiMedio: espacial.lpiMedio, indiceForma: espacial.indiceFormaMedio },
            };
      case 'homogeneidade':
        return ivrGlobal.valor == null
          ? pendente('homogeneidade', camada ? 'Sem pixels suficientes nas zonas.' : semCamada)
          : {
              id: 'homogeneidade', nome: NOME_INDICADOR.homogeneidade, valor: Math.round((100 - ivrGlobal.valor) * 10) / 10, unidade: '',
              faixa: faixaMaiorMelhor(100 - ivrGlobal.valor),
              justificativa: 'Complemento do IVR (100 − IVR): quanto do que acontece dentro das zonas é uniforme. Maior = melhor.',
            };
      case 'separacao':
        return !separacao
          ? pendente('separacao', camada ? 'Menos de duas zonas com dados suficientes para comparar.' : semCamada)
          : {
              id: 'separacao', nome: NOME_INDICADOR.separacao, valor: Math.round(separacao.eta2 * separacao.distincao * 1000) / 10, unidade: '%',
              faixa: faixaMaiorMelhor(separacao.eta2 * separacao.distincao * 100),
              justificativa: `η² = ${fmt(separacao.eta2 * 100)}% da variação total é explicada pela divisão em zonas${separacao.f != null ? ` (F = ${fmt(separacao.f)})` : ''}, descontado pela distinção entre vizinhas (${fmt(separacao.distincao * 100, 0)}% dos pares vizinhos se separam). ${separacao.vizinhosConfundidos.length ? `Confundem-se: ${separacao.vizinhosConfundidos.map(v => `${v.a}×${v.b}`).join(', ')} — o η² sobe sozinho a cada zona criada, então é o vizinho indistinguível que denuncia zona demais.` : 'Nenhum par vizinho se confunde.'}`,
              entradas: { eta2: separacao.eta2, distincao: separacao.distincao, f: separacao.f, paresSobrepostos: separacao.paresSobrepostos },
            };
    }
  };

  const indicadores = INDICADORES_DASHBOARD.map(id => ind(id));

  // ── 10. Recomendações (sempre com base declarada) ─────────────────────────
  const recomendacoes = montarRecomendacoes({
    porZona, separacao, espacial, ipe: ipeRes.indicador, ica: icaRes.indicador,
    iqzm: iqzmRes.indicador, rotuloIqzm: rotuloIQZM(iqzmRes.indicador.valor), rotuloIca: icaRes.rotulo,
    escoreFrag, nSafras, ausentesIqzm: iqzmRes.ausentes,
  });

  return {
    cenarioId: e.cenarioId,
    cenarioNome: e.cenarioNome,
    camadaValidacao: camada ? { id: camada.id, nome: camada.nome, unidade: camada.unidade } : null,
    indicadores,
    porZona,
    parcial: iqzmRes.parcial,
    recomendacoes,
    espacial,
    separacao,
    ipe: ipeRes.detalhe,
  };
}

function montarRecomendacoes(c: {
  porZona: ValidacaoZona[];
  separacao: Separacao | null;
  espacial: MetricasEspaciais;
  ipe: Indicador;
  ica: Indicador;
  iqzm: Indicador;
  rotuloIqzm: string;
  rotuloIca: string;
  escoreFrag: number | null;
  nSafras: number;
  ausentesIqzm: ComponenteIQZM[];
}): Recomendacao[] {
  const out: Recomendacao[] = [];
  const nomeZona = (id: string) => c.porZona.find(z => z.idZona === id)?.nome ?? id;

  // Zonas heterogêneas por dentro
  const ruins = c.porZona.filter(z => z.ivr.valor != null && z.ivr.valor > 55);
  if (ruins.length) {
    out.push({
      severidade: 'atencao',
      texto: `${ruins.length === 1 ? 'A zona' : 'As zonas'} ${ruins.map(z => z.nome).join(', ')} ${ruins.length === 1 ? 'ainda mistura' : 'ainda misturam'} realidades diferentes por dentro (IVR ${ruins.map(z => fmt(z.ivr.valor!)).join(', ')}). Vale dividir, ou revisar a camada que gerou a divisão — prescrever com dose única aí desperdiça de um lado e falta do outro.`,
      base: ['ivr', 'cv'],
    });
  }

  // Zonas que não se distinguem
  if (c.separacao?.vizinhosConfundidos.length) {
    const pares = c.separacao.vizinhosConfundidos.slice(0, 4)
      .map(p => `${nomeZona(p.a)}×${nomeZona(p.b)}`).join(', ');
    out.push({
      severidade: 'atencao',
      texto: `${c.separacao.vizinhosConfundidos.length} par(es) de zonas VIZINHAS não se separam estatisticamente (${pares}): a diferença entre elas é menor que a variação de dentro delas. Reduzir o número de zonas — juntando essas — costuma melhorar o mapa sem perder informação, e simplifica a operação.`,
      base: ['separacao', 'ivr'],
    });
  }

  // Fragmentação
  if (c.escoreFrag != null && c.escoreFrag > 55) {
    out.push({
      severidade: 'atencao',
      texto: `Mapa fragmentado: ${c.espacial.nPoligonos} polígonos para ${c.espacial.nZonas} zonas e ${fmt(c.espacial.pctAreaFragmentos)}% da área em manchas abaixo de ${fmt(c.espacial.pisoHa, 2)} ha. Aplique área mínima ou suavização antes de exportar — a máquina não troca de dose nessa escala.`,
      base: ['fragmentacao', 'continuidade'],
    });
  }

  // Persistência
  if (c.ipe.pendencia) {
    out.push({
      severidade: 'informativa',
      texto: `Persistência entre safras ainda não pode ser avaliada: ${c.ipe.pendencia} Enquanto isso, o IQZM sai marcado como parcial — trate o zoneamento como hipótese a confirmar na próxima colheita.`,
      base: ['ipe', 'safras'],
    });
  } else if ((c.ipe.valor ?? 0) < 45) {
    out.push({
      severidade: 'critica',
      texto: `O padrão não se repete entre as safras (IPE ${fmt(c.ipe.valor!)}%, perto do acaso). O mapa provavelmente retrata um evento de ano — verifique se não há falha de plantio, deriva ou problema de calibração de colhedora antes de investir em taxa variável.`,
      base: ['ipe', 'safras'],
    });
  }

  // Nota alta sobre base fraca — o caso que o ICA existe para não deixar passar.
  if (c.iqzm.valor != null && c.iqzm.valor >= 70 && (c.ica.valor ?? 100) < 55) {
    out.push({
      severidade: 'critica',
      texto: `Cuidado com a leitura otimista: o mapa tirou IQZM ${fmt(c.iqzm.valor)} (${c.rotuloIqzm}), mas a base é fraca — ICA ${fmt(c.ica.valor ?? 0)} (${c.rotuloIca}). A nota alta descreve o que os dados MOSTRAM, não o que o talhão É; com mais safras ou camadas ela pode mudar. Trate como hipótese de trabalho e confirme antes de investir.`,
      base: ['iqzm', 'ica', 'safras'],
    });
  } else if ((c.ica.valor ?? 0) < 45) {
    out.push({
      severidade: 'atencao',
      texto: `Base de dados fraca — ${c.rotuloIca} (ICA ${fmt(c.ica.valor ?? 0)}). ${c.ica.justificativa}`,
      base: ['ica', 'safras'],
    });
  }

  // Aprovação
  if (c.iqzm.valor != null && c.iqzm.valor >= 65 && (c.ica.valor ?? 0) >= 55 && !ruins.length && !c.separacao?.vizinhosConfundidos.length) {
    out.push({
      severidade: 'informativa',
      texto: `Zoneamento aprovado para prescrição — IQZM ${fmt(c.iqzm.valor)} (${c.rotuloIqzm}) com ${c.rotuloIca.toLowerCase()} (ICA ${fmt(c.ica.valor ?? 0)}): zonas homogêneas por dentro, distintas entre si e operáveis${c.ausentesIqzm.length ? ' — lembrando que o índice está parcial' : ''}.`,
      base: ['iqzm', 'ica', 'ivr', 'separacao'],
    });
  }

  return out;
}

// ── Comparação de cenários ──────────────────────────────────────────────────

export interface LinhaComparacao {
  cenarioId: string;
  cenarioNome: string;
  iqzm: number | null;
  parcial: boolean;
  indicadores: Record<string, number | null>;
  melhor: boolean;
}

/**
 * Ranking de cenários pelo IQZM — substitui o "melhor = menor CV médio".
 *
 * Empate técnico existe: diferença de menos de 3 pontos no IQZM está dentro do
 * ruído das amostragens, e eleger um vencedor ali seria fabricar precisão.
 * Nesse caso ninguém recebe a coroa e a justificativa diz por quê.
 */
export function compararCenarios(relatorios: RelatorioValidacao[]): { linhas: LinhaComparacao[]; veredito: string } {
  const linhas: LinhaComparacao[] = relatorios.map(r => ({
    cenarioId: r.cenarioId,
    cenarioNome: r.cenarioNome,
    iqzm: r.indicadores.find(i => i.id === 'iqzm')?.valor ?? null,
    parcial: r.parcial,
    indicadores: Object.fromEntries(r.indicadores.map(i => [i.id, i.valor])),
    melhor: false,
  }));

  const comIqzm = linhas.filter(l => l.iqzm != null).sort((a, b) => (b.iqzm as number) - (a.iqzm as number));
  if (!comIqzm.length) return { linhas, veredito: 'Nenhum cenário pôde ser avaliado — falta camada de validação.' };

  const topo = comIqzm[0], segundo = comIqzm[1];
  const empate = segundo != null && (topo.iqzm as number) - (segundo.iqzm as number) < 3;
  if (!empate) {
    const alvo = linhas.find(l => l.cenarioId === topo.cenarioId)!;
    alvo.melhor = true;
    return {
      linhas,
      veredito: `${topo.cenarioNome} lidera com IQZM ${fmt(topo.iqzm as number)}${segundo ? ` contra ${fmt(segundo.iqzm as number)} do segundo (${segundo.cenarioNome})` : ''}. O índice resume homogeneidade, separação, continuidade, fragmentação, persistência e confiança da base — não é só o CV.`,
    };
  }
  return {
    linhas,
    veredito: `Empate técnico entre ${topo.cenarioNome} (${fmt(topo.iqzm as number)}) e ${segundo!.cenarioNome} (${fmt(segundo!.iqzm as number)}): menos de 3 pontos de IQZM está dentro do ruído da amostragem. Decida pelos indicadores individuais — ou pelo que é mais simples de operar.`,
  };
}
