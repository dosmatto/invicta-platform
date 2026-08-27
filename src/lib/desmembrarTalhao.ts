'use client';

// DESMEMBRAR / EXCLUIR uma ÁREA SEPARADA do talhão — pendência 19.
//
// Um talhão multipolígono às vezes carrega uma área que não é dele: veio junto
// no shapefile, entrou no cadastro, e a amostragem foi gerada por cima. Este
// módulo tira essa área do talhão e decide o destino do que estava em cima dela.
//
// POR QUE NÃO É "TROCAR O POLÍGONO". A substituição de limite (trocaPoligono.ts)
// é BLOQUEADA quando o ciclo tem grade/laudo — e com razão: ela invalida tudo o
// que foi calculado sobre a geometria anterior. Aqui é o oposto: o resto do
// talhão não muda um vértice, então o dado dele continua valendo. Por isso a
// operação passa ao lado daquele bloqueio — e por isso ela é cirúrgica, com o
// plano do que vai acontecer mostrado ANTES de aplicar.
//
// A REGRA QUE MANDA EM TODO O RESTO: NÚMERO DE AMOSTRA NÃO SE RENUMERA. Ele está
// impresso na etiqueta do saco, foi na carta ao laboratório junto com a remessa
// (INV-XXXX-XXXX) e é a chave do casamento laudo↔ponto (`numero ?? ordem+1`, ver
// eloGrade.ts). Grade que muda de talhão leva os números ORIGINAIS — 4, 5, 18-22,
// 38 — esburacada de propósito. Renumerar faria o resultado da amostra 18 cair no
// ponto errado: um mapa plausível e FALSO, o pior tipo de erro que existe aqui.
//
// O `ordem` também é preservado: as coletas de campo são gravadas em
// `${gradeId}__${ordem}` (coleta.ts) e são remapeadas para a grade nova com o
// mesmo ordem — a caminhada já feita não se refaz.
//
// O QUE NÃO SEGUE: os mapas já interpolados. Eles foram krigados com o limite
// antigo; recortar o raster mentiria na borda. Em vez de apagá-los (o histórico
// dos ciclos anteriores está legitimamente amarrado à geometria da época, ver
// geoVersoes no store), as importações afetadas são CARIMBADAS com
// `limiteAlteradoEm` e a tela de Fertilidade avisa que o mapa é anterior à
// mudança e precisa ser reprocessado.

import {
  getTalhoes, getGrades, getImportacoesLab, getPlantio, setPlantio, getSafras,
  getZoneamentosMeap, updateTalhao, saveTalhao, updateGrade, saveGrade, deleteGrade,
  updateImportacaoLab, saveImportacaoLab, deleteImportacaoLab,
  type Talhao, type GradeAmostragem, type PontoAmostragem, type ImportacaoLab,
} from './store';
import { moverColetasDeGrade, removerColetasDaGrade, getColetas } from './coleta';
import { extrairPoligono } from './fertilidade';
import { areaHaGeo, areaHaGeoBruta, partesComArea } from './areaGeo';
import { pontoEmParte } from './partesTalhao';
import {
  separarPontos, colisaoDeNumeros, numeroDoPonto, fcDePartes, bboxDeFC,
} from './desmembrarRegras';

export {
  separarPontos, colisaoDeNumeros, numeroDoPonto, numerosEmFaixas, fcDePartes,
  geometriaSemParte,
} from './desmembrarRegras';

// ── Destino da área que sai ────────────────────────────────────────────────
export type Destino =
  | { tipo: 'excluir' }
  | { tipo: 'novo'; nome: string }
  | { tipo: 'existente'; talhaoId: string };

export interface GradeAfetada {
  gradeId: string;
  nome: string;
  safra: string;
  saem: PontoAmostragem[];
  ficam: PontoAmostragem[];
  temRemessa: boolean;          // já virou lote no laboratório (código impresso)
  temLaudo: boolean;            // alguma importação aponta para esta grade
  /** Números que já existem na grade do talhão DESTINO (só destino 'existente'). */
  colide: number[];
  /** Grade do destino com que ela se funde — null = entra como grade separada. */
  fundeCom: string | null;
}

export interface LaudoAfetado {
  importacaoId: string;
  safra: string;
  laboratorio: string;
  gradeId: string;
  numerosQueSaem: number[];
  totalResultados: number;
}

export interface PlanoDesmembramento {
  talhaoId: string;
  parteIndice: number;
  areaQueSaiHa: number;
  areaQueFicaHa: number;
  partesQueFicam: number;
  grades: GradeAfetada[];
  laudos: LaudoAfetado[];
  coletasQueSeguem: number;
  zonasQueSeguem: number;
  culturas: string[];           // safras com cultura definida que serão copiadas
  /** Impede aplicar — some quando o usuário corrige. */
  impedimentos: string[];
  avisos: string[];
}

// ── Geometria ──────────────────────────────────────────────────────────────

/** Os anéis de cada parte separada, na ORDEM DA GEOMETRIA. */
export function partesDoTalhaoGeo(t: Pick<Talhao, 'geojson'>): GeoJSON.Position[][][] {
  if (!t.geojson) return [];
  let poly: GeoJSON.Polygon | GeoJSON.MultiPolygon | null = null;
  try { poly = extrairPoligono(JSON.parse(t.geojson) as GeoJSON.GeoJSON); } catch { return []; }
  if (!poly) return [];
  return poly.type === 'Polygon' ? [poly.coordinates] : poly.coordinates;
}

/** Centro (média dos vértices do anel externo) — basta para dizer em que parte
 *  uma zona de manejo cai: zonas subdividem o talhão e não se sobrepõem. */
function centroDoAnel(anel: GeoJSON.Position[]): [number, number] {
  let x = 0, y = 0;
  for (const p of anel) { x += p[0]; y += p[1]; }
  return [x / (anel.length || 1), y / (anel.length || 1)];
}

function geometriaDaFeature(f: GeoJSON.Feature): GeoJSON.Position[] | null {
  const g = f.geometry;
  if (!g) return null;
  if (g.type === 'Polygon') return g.coordinates[0] ?? null;
  if (g.type === 'MultiPolygon') return g.coordinates[0]?.[0] ?? null;
  return null;
}

// ── Plano ──────────────────────────────────────────────────────────────────

/**
 * O que vai acontecer se a parte `parteIndice` sair com este destino. Não grava
 * nada — é o que a tela mostra para confirmar.
 */
export function planejar(talhao: Talhao, parteIndice: number, destino: Destino): PlanoDesmembramento {
  const impedimentos: string[] = [];
  const avisos: string[] = [];
  const partes = partesDoTalhaoGeo(talhao);
  const areas = talhao.geojson ? partesComArea(extrairPoligono(JSON.parse(talhao.geojson) as GeoJSON.GeoJSON)!) : [];

  const plano: PlanoDesmembramento = {
    talhaoId: talhao.id, parteIndice,
    areaQueSaiHa: areas.find(a => a.indice === parteIndice)?.areaHa ?? 0,
    areaQueFicaHa: 0, partesQueFicam: Math.max(0, partes.length - 1),
    grades: [], laudos: [], coletasQueSeguem: 0, zonasQueSeguem: 0, culturas: [],
    impedimentos, avisos,
  };

  if (partes.length < 2) {
    impedimentos.push('O talhão tem uma área só — não há o que separar.');
    return plano;
  }
  if (parteIndice < 0 || parteIndice >= partes.length) {
    impedimentos.push('Área inexistente.');
    return plano;
  }
  const aneisQueSaem = partes[parteIndice];
  const ficam = partes.filter((_, i) => i !== parteIndice);
  // AS ÁREAS FECHAM NOS TRÊS LUGARES em que aparecem, e cada escolha aqui é o
  // que faz fechar:
  //  • a que SAI é a fatia que `partesComArea` mostra na lista logo acima (e na
  //    gaveta da lista da fazenda) — mostrar 4,25 no plano ao lado de 4,24 na
  //    lista da mesma tela seria um centavo inexplicável;
  //  • a que FICA é a medição NOVA da geometria restante, que é o que a gaveta
  //    do talhão de origem vai somar dali em diante.
  // Como `partesComArea` arredonda compensado contra o total do talhão, as duas
  // ainda somam exatamente a área que ele tinha antes.
  plano.areaQueFicaHa = areaHaGeo(fcDePartes(ficam, talhao.nome));

  // Destino
  let talhaoDestino: Talhao | null = null;
  if (destino.tipo === 'novo') {
    const nome = destino.nome.trim();
    if (!nome) impedimentos.push('Dê um nome ao talhão novo.');
    else if (getTalhoes(talhao.fazendaId).some(t => t.nome.trim().toLowerCase() === nome.toLowerCase())) {
      impedimentos.push(`Já existe um talhão "${nome}" nesta fazenda.`);
    }
  } else if (destino.tipo === 'existente') {
    talhaoDestino = getTalhoes().find(t => t.id === destino.talhaoId) ?? null;
    if (!talhaoDestino) impedimentos.push('Talhão de destino não encontrado.');
    else if (talhaoDestino.id === talhao.id) impedimentos.push('O destino é o próprio talhão.');
    else if (talhaoDestino.fazendaId !== talhao.fazendaId) {
      avisos.push(`O destino "${talhaoDestino.nome}" é de outra fazenda — a área muda de fazenda junto.`);
    }
  }

  // Grades: quais pontos caem na área que sai
  const gradesDestino = talhaoDestino ? getGrades(talhaoDestino.id) : [];
  const laudos = getImportacoesLab(talhao.id);
  for (const g of getGrades(talhao.id)) {
    const { saem, ficam: ficamPts } = separarPontos(g.pontos ?? [], aneisQueSaem);
    if (saem.length === 0) continue;
    const temLaudo = laudos.some(l => l.gradeId === g.id);
    // Fusão com a grade do destino: só quando não há número repetido (duas
    // amostras "18" na mesma grade fariam o laudo casar valor no ponto errado)
    const candidata = gradesDestino.find(d => (d.metodo ?? 'grid') === (g.metodo ?? 'grid')
      && (d.ano ?? null) === (g.ano ?? null) && d.epoca === g.epoca);
    let colide: number[] = [];
    let fundeCom: string | null = null;
    if (candidata) {
      colide = colisaoDeNumeros(saem, candidata.pontos ?? []);
      fundeCom = colide.length === 0 ? candidata.id : null;
      if (colide.length > 0) {
        avisos.push(`"${g.nome}": os números ${colide.slice(0, 6).join(', ')}${colide.length > 6 ? '…' : ''} já existem em "${candidata.nome}" — os pontos entram como uma GRADE SEPARADA no destino, sem renumerar.`);
      }
    }
    plano.grades.push({
      gradeId: g.id, nome: g.nome, safra: g.safra, saem, ficam: ficamPts,
      temRemessa: !!g.codigoRemessa, temLaudo, colide, fundeCom,
    });
    plano.coletasQueSeguem += getColetas(g.id).filter(c => saem.some(p => p.ordem === c.ordem)).length;
  }

  // Laudos: resultados dos números que saem
  for (const l of laudos) {
    const g = plano.grades.find(x => x.gradeId === l.gradeId);
    if (!g) continue;
    const saem = new Set(g.saem.map(numeroDoPonto));
    const numeros = (l.resultados ?? []).filter(r => saem.has(r.numero)).map(r => r.numero);
    if (numeros.length === 0) continue;
    plano.laudos.push({
      importacaoId: l.id, safra: l.safra, laboratorio: l.laboratorio, gradeId: l.gradeId,
      numerosQueSaem: [...new Set(numeros)].sort((a, b) => a - b),
      totalResultados: numeros.length,
    });
  }

  // Zonas de manejo do snapshot (talhao.zonasGeojson)
  if (talhao.zonasGeojson) {
    try {
      const fc = JSON.parse(talhao.zonasGeojson) as GeoJSON.FeatureCollection;
      plano.zonasQueSeguem = fc.features.filter(f => {
        const anel = geometriaDaFeature(f);
        if (!anel) return false;
        const [x, y] = centroDoAnel(anel);
        return pontoEmParte(x, y, aneisQueSaem);
      }).length;
    } catch { /* snapshot corrompido: nada segue */ }
  }
  if (plano.zonasQueSeguem > 0 && getZoneamentosMeap(talhao.id).length > 0) {
    avisos.push('As zonas seguem como snapshot; o ZONEAMENTO (MEAP) que as gerou fica no talhão de origem e precisa ser refeito no novo.');
  }

  // Cultura por safra (copiada, nunca movida — o talhão de origem continua com a dele)
  if (destino.tipo !== 'excluir') {
    for (const s of getSafras()) {
      if (getPlantio(talhao.id, s.nome)) plano.culturas.push(s.nome);
    }
  }

  const esvaziadas = plano.grades.filter(g => g.ficam.length === 0);
  if (esvaziadas.length) {
    avisos.push(`${esvaziadas.length === 1 ? 'A grade' : 'As grades'} ${esvaziadas.map(g => `"${g.nome}"`).join(', ')} ${esvaziadas.length === 1 ? 'fica' : 'ficam'} sem nenhum ponto no talhão de origem e ${esvaziadas.length === 1 ? 'será removida' : 'serão removidas'} dele — toda a amostragem estava sobre esta área.`);
  }

  if (destino.tipo === 'excluir') {
    const nPontos = plano.grades.reduce((n, g) => n + g.saem.length, 0);
    const nRes = plano.laudos.reduce((n, l) => n + l.totalResultados, 0);
    if (nPontos > 0) avisos.push(`${nPontos} ponto(s) de amostragem e ${nRes} resultado(s) de laudo serão DESCARTADOS junto com a área. A numeração dos pontos que ficam não muda.`);
  }
  if (plano.laudos.length > 0) {
    avisos.push('Os mapas de fertilidade já processados ficam anteriores a esta mudança — a tela de Fertilidade vai pedir o reprocessamento nos dois talhões.');
  }

  return plano;
}

// ── Aplicação ──────────────────────────────────────────────────────────────

export interface ResultadoDesmembramento {
  talhaoDestinoId: string | null;
  nomeDestino: string | null;
  pontosMovidos: number;
  resultadosMovidos: number;
  coletasMovidas: number;
  gradesCriadas: number;
}

/**
 * Executa o plano. Grava tudo de uma vez (as listas do store são síncronas), na
 * ordem: destino primeiro (para ter id), depois grades/laudos/zonas, e o limite
 * do talhão de origem por ÚLTIMO — assim, se algo falhar no meio, a geometria
 * antiga ainda descreve onde os pontos estão.
 */
export function aplicar(talhao: Talhao, plano: PlanoDesmembramento, destino: Destino): ResultadoDesmembramento {
  if (plano.impedimentos.length) throw new Error(plano.impedimentos[0]);
  const partes = partesDoTalhaoGeo(talhao);
  const aneisQueSaem = partes[plano.parteIndice];
  const ficam = partes.filter((_, i) => i !== plano.parteIndice);
  const res: ResultadoDesmembramento = {
    talhaoDestinoId: null, nomeDestino: null,
    pontosMovidos: 0, resultadosMovidos: 0, coletasMovidas: 0, gradesCriadas: 0,
  };

  // 1. Talhão de destino (com a geometria da área que sai)
  const fcQueSai = fcDePartes([aneisQueSaem], destino.tipo === 'novo' ? destino.nome.trim() : talhao.nome);
  // Áreas vindas do PLANO (ver acima): as duas partes somam a área do cadastro.
  const areaQueSai = plano.areaQueSaiHa;
  const areaQueFica = plano.areaQueFicaHa;
  let destinoId: string | null = null;
  if (destino.tipo === 'novo') {
    const novo = saveTalhao({
      fazendaId: talhao.fazendaId,
      nome: destino.nome.trim(),
      areaHa: areaQueSai,
      areaHaSemHoles: areaHaGeoBruta(fcQueSai),
      status: 'ativo',
      geojson: JSON.stringify(fcQueSai),
      bbox: bboxDeFC(fcQueSai),
    });
    destinoId = novo.id;
    res.nomeDestino = novo.nome;
  } else if (destino.tipo === 'existente') {
    const alvo = getTalhoes().find(t => t.id === destino.talhaoId)!;
    // O limite do destino ganha a área — uma feature a mais, sem tocar no resto.
    const partesAlvo = partesDoTalhaoGeo(alvo);
    const fcAlvo = fcDePartes([...partesAlvo, aneisQueSaem], alvo.nome);
    updateTalhao(alvo.id, {
      geojson: JSON.stringify(fcAlvo),
      bbox: bboxDeFC(fcAlvo),
      areaHa: areaHaGeo(fcAlvo),
      areaHaSemHoles: areaHaGeoBruta(fcAlvo),
      status: 'ativo',
    });
    destinoId = alvo.id;
    res.nomeDestino = alvo.nome;
  }
  res.talhaoDestinoId = destinoId;

  // 2. Grades — os pontos que saem levam número e ordem originais
  const mapaGrades = new Map<string, string>();   // gradeId origem → gradeId destino
  for (const ga of plano.grades) {
    const original = getGrades(talhao.id).find(g => g.id === ga.gradeId);
    if (!original) continue;
    const saemOrdens = ga.saem.map(p => p.ordem);
    res.pontosMovidos += ga.saem.length;

    if (destinoId) {
      let gradeDestinoId: string;
      if (ga.fundeCom) {
        const alvo = getGrades(destinoId).find(g => g.id === ga.fundeCom);
        const juntos = [...(alvo?.pontos ?? []), ...ga.saem].sort((a, b) => numeroDoPonto(a) - numeroDoPonto(b));
        updateGrade(ga.fundeCom, { pontos: juntos });
        gradeDestinoId = ga.fundeCom;
      } else {
        const nova = saveGrade({
          ...clonarConfigGrade(original),
          talhaoId: destinoId,
          nome: `${original.nome} (área separada)`,
          pontos: ga.saem,
          paraProcessar: getGrades(destinoId).length === 0,
        });
        gradeDestinoId = nova.id;
        res.gradesCriadas++;
      }
      mapaGrades.set(ga.gradeId, gradeDestinoId);
      res.coletasMovidas += moverColetasDeGrade(ga.gradeId, gradeDestinoId, saemOrdens, destinoId);
    } else {
      removerColetasDaGrade(ga.gradeId, saemOrdens);
    }

    // A grade de origem fica só com os pontos que ficam — SEM RENUMERAR. Se
    // não sobrou nenhum, ela não descreve mais nada do talhão: sai.
    if (ga.ficam.length === 0) deleteGrade(ga.gradeId);
    else updateGrade(ga.gradeId, { pontos: ga.ficam });
  }

  // 3. Laudos — os resultados dos números que saem acompanham os pontos
  for (const la of plano.laudos) {
    const imp = getImportacoesLab(talhao.id).find(i => i.id === la.importacaoId);
    if (!imp) continue;
    const saem = new Set(la.numerosQueSaem);
    const resultadosQueSaem = (imp.resultados ?? []).filter(r => saem.has(r.numero));
    const resultadosQueFicam = (imp.resultados ?? []).filter(r => !saem.has(r.numero));
    if (destinoId) {
      const gradeDestinoId = mapaGrades.get(la.gradeId) ?? imp.gradeId;
      // Quando os pontos se fundem com uma grade que JÁ tem laudo no destino,
      // os resultados entram NAQUELA importação. Criar uma segunda importação
      // do mesmo ano deixaria a Fertilidade lendo só uma delas — e o mapa sairia
      // com metade das amostras, sem nada avisando.
      const existente = getImportacoesLab(destinoId)
        .find(i => i.gradeId === gradeDestinoId && (i.ano ?? null) === (imp.ano ?? null));
      if (existente) {
        const jaTem = new Set((existente.resultados ?? []).map(r => `${r.numero}__${r.profundidade}`));
        const novos = resultadosQueSaem.filter(r => !jaTem.has(`${r.numero}__${r.profundidade}`));
        updateImportacaoLab(existente.id, { resultados: [...(existente.resultados ?? []), ...novos] });
        res.resultadosMovidos += novos.length;
      } else {
        saveImportacaoLab({
          ...semIdentidade(imp),
          talhaoId: destinoId,
          gradeId: gradeDestinoId,
          resultados: resultadosQueSaem,
        });
        res.resultadosMovidos += resultadosQueSaem.length;
      }
    }
    // Carimbo: o limite mudou DEPOIS dos mapas já processados desta importação.
    // Importação que perdeu TODOS os resultados não descreve mais nada aqui.
    if (resultadosQueFicam.length === 0) deleteImportacaoLab(imp.id);
    else updateImportacaoLab(imp.id, { resultados: resultadosQueFicam, limiteAlteradoEm: new Date().toISOString() });
  }

  // 4. Zonas de manejo (snapshot) e cultura da safra
  if (talhao.zonasGeojson) {
    try {
      const fc = JSON.parse(talhao.zonasGeojson) as GeoJSON.FeatureCollection;
      const vaiJunto = (f: GeoJSON.Feature) => {
        const anel = geometriaDaFeature(f);
        if (!anel) return false;
        const [x, y] = centroDoAnel(anel);
        return pontoEmParte(x, y, aneisQueSaem);
      };
      const saem = fc.features.filter(vaiJunto);
      const restam = fc.features.filter(f => !vaiJunto(f));
      if (saem.length) {
        if (destino.tipo === 'novo' && destinoId) {
          updateTalhao(destinoId, { zonasGeojson: JSON.stringify({ type: 'FeatureCollection', features: saem }) });
        }
        updateTalhao(talhao.id, { zonasGeojson: JSON.stringify({ type: 'FeatureCollection', features: restam }) });
      }
    } catch { /* snapshot corrompido: fica como está */ }
  }
  if (destinoId && destino.tipo === 'novo') {
    for (const safra of plano.culturas) setPlantio(destinoId, safra, getPlantio(talhao.id, safra));
  }

  // 5. Limite do talhão de origem — por último. updateTalhao arquiva sozinho a
  //    versão anterior (comVersaoDeLimite), então o histórico dos ciclos que
  //    usaram a geometria antiga continua apontando para ela.
  const fcQueFica = fcDePartes(ficam, talhao.nome);
  updateTalhao(talhao.id, {
    geojson: JSON.stringify(fcQueFica),
    bbox: bboxDeFC(fcQueFica),
    areaHa: areaQueFica,
    areaHaSemHoles: areaHaGeoBruta(fcQueFica),
  });

  return res;
}

/** Config da grade sem o que é identidade do registro (id/criadoEm/talhão/pontos). */
function clonarConfigGrade(g: GradeAmostragem): Omit<GradeAmostragem, 'id' | 'criadoEm' | 'talhaoId' | 'pontos' | 'paraProcessar'> {
  const { id: _id, criadoEm: _c, talhaoId: _t, pontos: _p, paraProcessar: _pp, ...resto } = g;
  return resto;
}

function semIdentidade(i: ImportacaoLab): Omit<ImportacaoLab, 'id' | 'criadoEm'> {
  const { id: _id, criadoEm: _c, ...resto } = i;
  return resto;
}
