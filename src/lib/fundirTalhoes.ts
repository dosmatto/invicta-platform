'use client';

// FUNDIR DOIS TALHÕES — pendência 19.
//
// O caso: "05A" é, na verdade, parte do talhão "05". Fundir junta as duas
// geometrias (dissolvendo a divisa quando elas se encostam), escolhe qual NOME
// permanece, traz tudo que estava pendurado no talhão absorvido e o remove do
// cadastro — deixando o registro da fusão no talhão que ficou.
//
// É o inverso da separação de área (desmembrarTalhao.ts) e herda a mesma regra
// sagrada, com o sinal trocado. Lá, quem sai leva os números originais porque
// eles estão impressos na etiqueta. Aqui os números COLIDEM: as duas grades
// começaram no 1. Não dá para manter os dois "1" na mesma grade — o laudo casa
// por número e o valor cairia no ponto errado.
//
// A saída é renumerar SÓ o visitante, e só onde colide, guardando o
// `numeroAnterior` em cada ponto mexido. Isso é seguro em dois dos três casos:
//
//   1. Grade SEM remessa (nada saiu de casa) → renumerar é inócuo.
//   2. Grade com remessa e com LAUDO JÁ IMPORTADO → renumeramos a grade E os
//      resultados juntos: internamente fica consistente e o ciclo passa a ter um
//      mapa só. O que deixa de bater é o papel guardado (etiqueta/carta) — por
//      isso o `numeroAnterior` fica gravado e a tela avisa.
//   3. Grade com remessa e SEM laudo → as amostras estão NO LABORATÓRIO agora, e
//      ele vai devolver os números antigos. Renumerar aqui quebraria a
//      importação do laudo quando ele chegar. Neste caso a amostragem NÃO funde:
//      as grades convivem no mesmo talhão até o laudo entrar.
//
// O resto (compactação, MDE, condutividade, MEAP, composições, medições) só
// troca de talhaoId — nenhum deles tem chave que colida.

import {
  getTalhoes, getGrades, getImportacoesLab, getPlantio, setPlantio, getSafras,
  updateTalhao, updateGrade, deleteGrade, updateImportacaoLab, deleteImportacaoLab, deleteTalhao,
  repontarTalhaoNasColecoes, contarRegistrosDoTalhao,
  type Talhao, type GradeAmostragem, type FusaoRegistro,
} from './store';
import { getColetas, repontarColetasDeTalhao } from './coleta';
import { extrairPoligono } from './fertilidade';
import { areaHaGeo, areaHaGeoBruta } from './areaGeo';
import { fcDePartes, bboxDeFC } from './desmembrarRegras';
import { unirPartes, fundirGrades, remapearResultados, numeroDe, type RemapPonto } from './fundirRegras';

export interface OpcoesFusao {
  /** Nome que permanece — o do hospedeiro ou o do absorvido. */
  nomeQueFica: string;
  /** Fundir as grades do mesmo ano numa só (renumerando o visitante). */
  fundirAmostragem: boolean;
}

export interface GradeNaFusao {
  visitanteId: string;
  nome: string;
  safra: string;
  hospedeiraId: string | null;   // grade do hospedeiro com que fundiria
  colide: number[];              // números repetidos entre as duas
  remapeados: RemapPonto[];      // o que a fusão renumeraria
  remessaSemLaudo: boolean;      // amostras no laboratório AGORA
  pontos: number;
}

export interface PlanoFusao {
  hospedeiroId: string;
  absorvidoId: string;
  nomeHospedeiro: string;
  nomeAbsorvido: string;
  areaHospedeiroHa: number;
  areaAbsorvidoHa: number;
  areaFinalHa: number;
  partesFinais: number;
  dissolveu: boolean;            // as duas se encostavam e viraram uma área só
  grades: GradeNaFusao[];
  gradesQueMigram: number;       // grades que só trocam de talhão (sem fundir)
  laudos: number;
  coletas: number;
  zonas: number;
  outrosRegistros: number;       // compactação, MDE, condutividade, MEAP…
  impedimentos: string[];
  avisos: string[];
}

function partesDe(t: Pick<Talhao, 'geojson'>): GeoJSON.Position[][][] {
  if (!t.geojson) return [];
  try {
    const p = extrairPoligono(JSON.parse(t.geojson) as GeoJSON.GeoJSON);
    if (!p) return [];
    return p.type === 'Polygon' ? [p.coordinates] : p.coordinates;
  } catch { return []; }
}

/** Grades do mesmo ciclo e método — as candidatas a fundir uma na outra. */
function candidataNoHospedeiro(hospedeiro: GradeAmostragem[], v: GradeAmostragem): GradeAmostragem | null {
  return hospedeiro.find(h => (h.metodo ?? 'grid') === (v.metodo ?? 'grid')
    && (h.ano ?? null) === (v.ano ?? null) && h.epoca === v.epoca) ?? null;
}

/**
 * O que acontece se `absorvido` for fundido em `hospedeiro`. Não grava nada —
 * é o que a tela mostra antes de confirmar.
 */
export function planejarFusao(hospedeiro: Talhao, absorvido: Talhao, opcoes: OpcoesFusao): PlanoFusao {
  const impedimentos: string[] = [];
  const avisos: string[] = [];
  const plano: PlanoFusao = {
    hospedeiroId: hospedeiro.id, absorvidoId: absorvido.id,
    nomeHospedeiro: hospedeiro.nome, nomeAbsorvido: absorvido.nome,
    areaHospedeiroHa: hospedeiro.areaHa, areaAbsorvidoHa: absorvido.areaHa,
    areaFinalHa: 0, partesFinais: 0, dissolveu: false,
    grades: [], gradesQueMigram: 0, laudos: 0, coletas: 0, zonas: 0, outrosRegistros: 0,
    impedimentos, avisos,
  };

  if (hospedeiro.id === absorvido.id) {
    impedimentos.push('Escolha dois talhões diferentes.');
    return plano;
  }
  if (!opcoes.nomeQueFica.trim()) impedimentos.push('Escolha qual nome permanece.');
  if (hospedeiro.fazendaId !== absorvido.fazendaId) {
    avisos.push(`"${absorvido.nome}" é de outra fazenda — a área muda de fazenda na fusão.`);
  }

  // Geometria
  const pa = partesDe(hospedeiro), pb = partesDe(absorvido);
  if (pa.length === 0 || pb.length === 0) {
    impedimentos.push('Os dois talhões precisam ter limite cadastrado para fundir.');
  } else {
    const u = unirPartes(pa, pb);
    if (!u) {
      impedimentos.push('Não consegui unir as duas geometrias (contorno inválido) — corrija o traçado antes de fundir.');
    } else {
      const fc = fcDePartes(u.partes, opcoes.nomeQueFica);
      plano.areaFinalHa = areaHaGeo(fc);
      plano.partesFinais = u.partes.length;
      plano.dissolveu = u.dissolveu;
      const soma = Math.round((hospedeiro.areaHa + absorvido.areaHa) * 100) / 100;
      if (u.dissolveu && plano.areaFinalHa < soma - 0.02) {
        avisos.push(`Os dois se SOBREPÕEM: ${(soma - plano.areaFinalHa).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ha estavam contados duas vezes. A área final (${plano.areaFinalHa.toLocaleString('pt-BR')} ha) é a do contorno unido, não a soma.`);
      }
      if (plano.areaFinalHa > soma + 0.02) {
        avisos.push(`A soma das áreas cadastradas (${soma.toLocaleString('pt-BR')} ha) é MENOR que o contorno unido (${plano.areaFinalHa.toLocaleString('pt-BR')} ha) — algum dos dois está com a área desatualizada no cadastro. Vale a do contorno.`);
      }
      if (!u.dissolveu) {
        avisos.push(`Os contornos não se encostam: o talhão fica com ${u.partes.length} áreas separadas (a gaveta da lista mostra cada uma).`);
      }
    }
  }

  // Cultura da safra — o talhão fundido só pode ter uma por ciclo
  for (const s of getSafras()) {
    const ca = getPlantio(hospedeiro.id, s.nome), cb = getPlantio(absorvido.id, s.nome);
    if (ca && cb && ca !== cb) {
      impedimentos.push(`Culturas diferentes em ${s.nome}: "${ca}" em ${hospedeiro.nome} e "${cb}" em ${absorvido.nome}. Acerte a cultura antes de fundir — o talhão fundido só tem uma.`);
    }
  }

  // Amostragem
  const gradesHosp = getGrades(hospedeiro.id);
  const laudos = getImportacoesLab(absorvido.id);
  for (const v of getGrades(absorvido.id)) {
    const cand = candidataNoHospedeiro(gradesHosp, v);
    const fus = cand ? fundirGrades(cand.pontos ?? [], v.pontos ?? []) : null;
    const temLaudo = laudos.some(l => l.gradeId === v.id);
    const remessaSemLaudo = !!v.codigoRemessa && !temLaudo;
    const g: GradeNaFusao = {
      visitanteId: v.id, nome: v.nome, safra: v.safra,
      hospedeiraId: cand?.id ?? null,
      colide: fus?.colidiuNumero ?? [],
      remapeados: fus?.remapeados ?? [],
      remessaSemLaudo,
      pontos: (v.pontos ?? []).length,
    };
    plano.grades.push(g);
    if (!cand || !opcoes.fundirAmostragem) plano.gradesQueMigram++;
    plano.coletas += getColetas(v.id).length;

    if (cand && opcoes.fundirAmostragem && g.remapeados.length > 0) {
      if (remessaSemLaudo) {
        impedimentos.push(`"${v.nome}" já foi enviada ao laboratório e o laudo ainda não voltou. Renumerar agora quebraria a importação quando ele chegar — desligue "fundir a amostragem" ou espere o laudo.`);
      } else if (v.codigoRemessa) {
        avisos.push(`"${v.nome}": ${g.remapeados.length} ponto(s) serão renumerados e o laudo já importado é reescrito junto. O papel guardado (etiqueta/carta da remessa ${v.codigoRemessa}) deixa de bater com a tela — cada ponto guarda o número anterior.`);
      }
    }
  }
  if (!opcoes.fundirAmostragem && plano.grades.length > 0) {
    avisos.push('A amostragem NÃO será fundida: as grades convivem no mesmo talhão e o mapa de fertilidade do ciclo continua sendo um por grade.');
  }

  plano.laudos = laudos.length;
  if (absorvido.zonasGeojson) {
    try { plano.zonas = (JSON.parse(absorvido.zonasGeojson) as GeoJSON.FeatureCollection).features.length; } catch { /* snapshot ilegível */ }
  }
  plano.outrosRegistros = contarRegistrosDoTalhao(absorvido.id, ['inv_grades', 'inv_lab']);
  if (plano.laudos > 0 || getImportacoesLab(hospedeiro.id).length > 0) {
    avisos.push('Os mapas de fertilidade já processados ficam anteriores ao limite novo — a aba Fertilidade vai pedir o reprocessamento nos dois lados.');
  }

  return plano;
}



export interface ResultadoFusao {
  talhaoId: string;
  nome: string;
  areaHa: number;
  pontosRenumerados: number;
  laudosMovidos: number;
  coletasMovidas: number;
}

/**
 * Executa a fusão. Ordem: amostragem e coleções primeiro (com o talhão absorvido
 * ainda existindo, para nada ficar apontando para o vazio), depois a geometria e
 * o nome do hospedeiro, e por último a remoção do absorvido.
 */
export function aplicarFusao(hospedeiro: Talhao, absorvido: Talhao, plano: PlanoFusao, opcoes: OpcoesFusao): ResultadoFusao {
  if (plano.impedimentos.length) throw new Error(plano.impedimentos[0]);
  const res: ResultadoFusao = {
    talhaoId: hospedeiro.id, nome: opcoes.nomeQueFica.trim(), areaHa: plano.areaFinalHa,
    pontosRenumerados: 0, laudosMovidos: 0, coletasMovidas: 0,
  };

  // 1. Grades — fundir onde dá, migrar o resto
  const remapPorGrade = new Map<string, { destinoId: string; remapeados: RemapPonto[] }>();
  for (const g of plano.grades) {
    const visitante = getGrades(absorvido.id).find(x => x.id === g.visitanteId);
    if (!visitante) continue;
    const hosp = g.hospedeiraId ? getGrades(hospedeiro.id).find(x => x.id === g.hospedeiraId) : null;

    if (hosp && opcoes.fundirAmostragem) {
      const fus = fundirGrades(hosp.pontos ?? [], visitante.pontos ?? []);
      updateGrade(hosp.id, { pontos: fus.pontos });
      remapPorGrade.set(visitante.id, { destinoId: hosp.id, remapeados: fus.remapeados });
      res.pontosRenumerados += fus.remapeados.length;
      // As coletas do visitante passam para a grade do hospedeiro, com o ordem novo.
      res.coletasMovidas += repontarColetasDeTalhao(
        visitante.id, hosp.id, hospedeiro.id,
        new Map(fus.remapeados.map(r => [r.ordemDe, r.ordemPara])),
      );
      updateGrade(visitante.id, { pontos: [] });
      deleteGradeVazia(visitante.id);
    } else {
      // A grade inteira muda de talhão. O id não muda, então as coletas dela
      // seguem válidas — só o carimbo de talhão precisa acompanhar.
      updateGrade(visitante.id, {
        talhaoId: hospedeiro.id,
        // Só uma grade por talhão+safra+método pode estar marcada para processar.
        paraProcessar: hosp ? false : visitante.paraProcessar,
      });
      remapPorGrade.set(visitante.id, { destinoId: visitante.id, remapeados: [] });
      res.coletasMovidas += repontarColetasDeTalhao(visitante.id, visitante.id, hospedeiro.id, new Map());
    }
  }

  // 2. Laudos do absorvido — seguem para o talhão que fica, com os números
  //    remapeados quando a grade deles foi fundida.
  for (const l of getImportacoesLab(absorvido.id)) {
    const destino = remapPorGrade.get(l.gradeId);
    const gradeDestinoId = destino?.destinoId ?? l.gradeId;
    const resultados = remapearResultados(l.resultados ?? [], destino?.remapeados ?? []);
    // Quando a grade se fundiu na do hospedeiro, o laudo do mesmo ANO tem de
    // entrar NAQUELA importação. Duas importações do mesmo ano na mesma grade
    // fariam a Fertilidade ler só uma — e o mapa do ciclo sairia com parte das
    // amostras, sem nada avisando.
    const irmao = getImportacoesLab(hospedeiro.id)
      .find(i => i.gradeId === gradeDestinoId && (i.ano ?? null) === (l.ano ?? null));
    if (irmao) {
      const jaTem = new Set((irmao.resultados ?? []).map(r => `${r.numero}__${r.profundidade}`));
      const novos = resultados.filter(r => !jaTem.has(`${r.numero}__${r.profundidade}`));
      updateImportacaoLab(irmao.id, {
        resultados: [...(irmao.resultados ?? []), ...novos],
        elementos: [...new Set([...(irmao.elementos ?? []), ...(l.elementos ?? [])])],
        limiteAlteradoEm: new Date().toISOString(),
      });
      deleteImportacaoLab(l.id);
    } else {
      updateImportacaoLab(l.id, {
        talhaoId: hospedeiro.id,
        gradeId: gradeDestinoId,
        resultados,
        limiteAlteradoEm: new Date().toISOString(),
      });
    }
    res.laudosMovidos++;
  }
  // Os laudos do hospedeiro não mudam de dono, mas o limite mudou embaixo deles.
  for (const l of getImportacoesLab(hospedeiro.id)) {
    updateImportacaoLab(l.id, { limiteAlteradoEm: new Date().toISOString() });
  }

  // 3. Cultura da safra (só entra onde o hospedeiro não tem — divergência é
  //    impedimento no plano) e demais coleções por talhaoId.
  for (const s of getSafras()) {
    const c = getPlantio(absorvido.id, s.nome);
    if (c && !getPlantio(hospedeiro.id, s.nome)) setPlantio(hospedeiro.id, s.nome, c);
  }
  repontarTalhaoNasColecoes(absorvido.id, hospedeiro.id);

  // 4. Geometria, nome e o registro da fusão
  const partes = unirPartes(partesDe(hospedeiro), partesDe(absorvido));
  const fc = fcDePartes(partes!.partes, res.nome);
  const zonas = juntarZonas(hospedeiro.zonasGeojson, absorvido.zonasGeojson);
  const registro: FusaoRegistro = {
    em: new Date().toISOString(),
    nomeAbsorvido: absorvido.nome,
    talhaoIdAbsorvido: absorvido.id,
    areaHaAbsorvida: absorvido.areaHa,
    geojsonAbsorvido: absorvido.geojson,
    nomeAnterior: hospedeiro.nome !== res.nome ? hospedeiro.nome : undefined,
    dissolveu: plano.dissolveu,
    pontosMovidos: plano.grades.reduce((n, g) => n + g.pontos, 0),
    laudosMovidos: res.laudosMovidos,
  };
  updateTalhao(hospedeiro.id, {
    nome: res.nome,
    geojson: JSON.stringify(fc),
    bbox: bboxDeFC(fc),
    areaHa: areaHaGeo(fc),
    areaHaSemHoles: areaHaGeoBruta(fc),
    status: 'ativo',
    ...(zonas ? { zonasGeojson: zonas } : {}),
    fusoes: [...(hospedeiro.fusoes ?? []), registro],
  });
  res.areaHa = areaHaGeo(fc);

  // 5. O absorvido sai do cadastro. Tudo que era dele já foi reapontado; o que
  //    fica na nuvem sob o id antigo (mapas krigados com o limite antigo) é
  //    inalcançável e será refeito — apagar seria irreversível sem ganho.
  deleteTalhao(absorvido.id);

  return res;
}

/** Zonas dos dois talhões no mesmo snapshot (as do absorvido entram no fim). */
function juntarZonas(a?: string, b?: string): string | null {
  const ler = (s?: string): GeoJSON.Feature[] => {
    if (!s) return [];
    try { return (JSON.parse(s) as GeoJSON.FeatureCollection).features ?? []; } catch { return []; }
  };
  const feats = [...ler(a), ...ler(b)];
  if (feats.length === 0) return null;
  return JSON.stringify({ type: 'FeatureCollection', features: feats });
}

// A grade do visitante foi absorvida inteira pela do hospedeiro: some, senão
// fica uma grade de zero pontos disputando a lista do ciclo.
function deleteGradeVazia(id: string) {
  const g = getGrades().find(x => x.id === id);
  if (g && (g.pontos ?? []).length === 0) deleteGrade(id);
}
