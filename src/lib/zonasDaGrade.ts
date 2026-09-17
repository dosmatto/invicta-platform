'use client';

// ZONAS DE MANEJO QUE VIAJAM DENTRO DA GRADE.
//
// O PROBLEMA (relatado do campo, set/2026): o operador abria "MCASH 09 — Zonas
// 1" no app de coleta e via os pontos "1-1, 2-6, 3-8" boiando sobre o satélite,
// sem uma única divisa. Numa amostragem por zona é a divisa que diz de qual
// zona é cada furo — e, no modelo A, qual saco recebe a sub-amostra.
//
// A CAUSA: a grade por zonas não carregava geometria nenhuma. Quem desenhava as
// divisas, no campo e na exportação, era `talhao.zonasGeojson` — um snapshot
// ÚNICO do talhão, escrito só por "Tornar padrão" (store.setZoneamentoPadraoMeap)
// e apagado por "remover adoção" (store.removerAdocaoMeap). Apagou o snapshot,
// sumiram as divisas de TODAS as grades daquele talhão, inclusive as já
// coletadas. E o app de campo não baixa `inv_meap_zoneamentos` (coleção pesada,
// pulada no boot de campo — ver lib/cloud), então lá não havia nem retaguarda.
//
// A CORREÇÃO: a zona passa a ser congelada na própria grade (`zonasGeo`), como
// a composta já fazia com as `celulas`. `inv_grades` desce para o aparelho, e
// com ela a divisa exata que gerou aqueles pontos — imune a qualquer troca de
// zoneamento padrão depois.
//
// Este módulo é a camada que conversa com o STORE. As regras (rótulo,
// arredondamento, casamento com os pontos) são puras e moram em
// lib/zonasCongeladas, com teste próprio.

import {
  getGrades, updateGrade, getTalhoes, updateTalhao, getZoneamentosMeap,
  type GradeAmostragem, type ZonaGrade,
} from './store';
import { congelarZonas, prefixosDosPontos, zoneamentoCasa } from './zonasCongeladas';

/** Os zoneamentos que PODEM ser a origem de uma grade antiga deste talhão, do
 *  mais provável ao menos: o snapshot do talhão (a fonte de que o simulador
 *  tirou as zonas na hora de gerar), depois o marcado padrão, depois o mais
 *  recente. Quem decide se um deles serve é `zoneamentoCasa`. */
function candidatos(talhaoId: string): GeoJSON.FeatureCollection[] {
  const out: GeoJSON.FeatureCollection[] = [];
  const t = getTalhoes().find(x => x.id === talhaoId);
  if (t?.zonasGeojson) {
    try {
      const fc = JSON.parse(t.zonasGeojson) as GeoJSON.FeatureCollection;
      if (fc?.features?.length) out.push(fc);
    } catch { /* snapshot ilegível — segue para os zoneamentos salvos */ }
  }
  const zs = getZoneamentosMeap(talhaoId);
  const padrao = zs.find(z => z.padrao);
  const recente = [...zs].sort((a, b) => (b.criadoEm ?? '').localeCompare(a.criadoEm ?? ''))[0];
  for (const z of [padrao, recente]) if (z?.fc?.features?.length) out.push(z.fc);
  return out;
}

/**
 * REPARO das grades por zona salvas antes da v2.170.0: preenche `zonasGeo`.
 *
 * Só congela um zoneamento que CASA com os pontos da grade (ver
 * `zoneamentoCasa`: os pontos têm que cair dentro da zona que dizem ser). Sem
 * candidato que case, a grade fica como está e o app cai na retaguarda de
 * sempre — divisa nenhuma é ruim, divisa errada é pior.
 *
 * Idempotente: só olha grades sem `zonasGeo` e nunca sobrescreve as congeladas.
 *
 * @returns quantas grades foram reparadas.
 */
export function repararZonasDasGrades(talhaoId: string | null | undefined): number {
  if (!talhaoId) return 0;
  const pendentes = getGrades(talhaoId)
    .filter(g => (g.metodo ?? 'grid') === 'zonas' && !g.zonasGeo?.length && g.pontos?.length);
  if (pendentes.length === 0) return 0;
  const fcs = candidatos(talhaoId);
  if (fcs.length === 0) return 0;

  let n = 0;
  for (const g of pendentes) {
    const fc = fcs.find(c => zoneamentoCasa(c, g.pontos));
    if (!fc) continue;
    const prefixos = prefixosDosPontos(g.pontos);
    updateGrade(g.id, { zonasGeo: congelarZonas(fc, r => prefixos.get(r)) });
    n++;
  }
  if (n > 0) console.log(`[zonas] ${n} grade(s) por zona do talhão ${talhaoId} receberam a geometria das zonas.`);
  // O que NÃO casou fica dito em voz alta: aquela grade continuará sem divisa
  // no app de campo, e quem abriu a aba é quem pode resolver (gerar a grade de
  // novo sobre o zoneamento em vigor). Silêncio aqui viraria "o campo continua
  // sem zona e ninguém sabe por quê".
  if (n < pendentes.length) {
    const faltam = pendentes.length - n;
    console.warn(`[zonas] ${faltam} grade(s) por zona do talhão ${talhaoId} ficaram SEM geometria: nenhum zoneamento salvo casa com os pontos delas (os pontos não caem dentro das zonas). Elas seguem sem divisa no app de campo.`);
  }
  return n;
}

/**
 * PREENCHE `talhao.zonasGeojson` quando ele está VAZIO e existe zoneamento
 * marcado padrão.
 *
 * Serve ao app de campo JÁ INSTALADO, que só sabe ler o snapshot: sem versão
 * nova nas lojas, ele volta a desenhar as divisas assim que sincronizar.
 *
 * DUAS TRAVAS, as duas deliberadas:
 *   • só com zoneamento marcado PADRÃO — cair na cascata aqui re-adotaria por
 *     conta própria um zoneamento que alguém removeu em "remover adoção".
 *   • só quando o snapshot está VAZIO, nunca por cima de um existente. Fusão e
 *     desmembramento de talhão escrevem snapshot PRÓPRIO, diferente de qualquer
 *     zoneamento salvo (lib/fundirTalhoes, lib/desmembrarTalhao) — sobrescrever
 *     apagaria as zonas do talhão absorvido, que já não existe para regerá-las.
 *
 * @returns true se preencheu.
 */
export function preencherSnapshotZonas(talhaoId: string | null | undefined): boolean {
  if (!talhaoId) return false;
  const t = getTalhoes().find(x => x.id === talhaoId);
  if (!t || t.zonasGeojson) return false;
  const padrao = getZoneamentosMeap(talhaoId).find(z => z.padrao);
  if (!padrao?.fc?.features?.length) return false;
  updateTalhao(talhaoId, { zonasGeojson: JSON.stringify(padrao.fc) });
  console.log(`[zonas] snapshot do talhão ${talhaoId} preenchido com o zoneamento padrão "${padrao.nome}".`);
  return true;
}

/** As zonas a desenhar para uma grade por zona: as congeladas nela. Vazio
 *  significa grade antiga ainda não reparada — quem chama decide a retaguarda
 *  (no desktop, a cascata; no campo, `talhao.zonasGeojson`). */
export function zonasDaGrade(grade: GradeAmostragem | null | undefined): ZonaGrade[] {
  return grade?.zonasGeo?.length ? grade.zonasGeo : [];
}
