'use client';

// ELO LAUDO ↔ GRADE — as coordenadas dos pontos de um laudo importado vêm da
// grade de amostragem; o laudo só traz o NÚMERO da amostra. Duas perguntas:
//   1) qual grade dá os pontos deste laudo?  (resolverGradeDoLaudo)
//   2) qual ponto é a amostra nº N?          (casarAmostrasComPontos)
//
// Estava respondido em DOIS lugares com regras diferentes: a tela (Fertilidade)
// tinha os dois fallbacks — grade sem pontos e laudo renumerado pelo lab — e o
// relatório do Gerador exigia o casamento exato. Resultado: talhões em que a
// tela mostrava tudo saíam no PDF sem o nº dos pontos na capa e sem os valores
// sobre os mapas. Regra única aqui, usada pelos dois.

import type { GradeAmostragem } from './store';

export interface PontoValor { lng: number; lat: number; valor: number }

// Grade que dá os pontos de um laudo. Preferência: a APONTADA pelo laudo, desde
// que tenha pontos; senão a grade com MAIS pontos do talhão/ano (o laudo pode
// apontar p/ uma grade esvaziada ou que não existe mais); em último caso, a
// apontada mesmo sem pontos (p/ o chamador distinguir "não achei" de "vazia").
export function resolverGradeDoLaudo(
  todas: GradeAmostragem[], gradeId?: string | null,
): GradeAmostragem | null {
  const exata = todas.find(g => g.id === gradeId) ?? null;
  if (exata && (exata.pontos?.length ?? 0) > 0) return exata;
  const comPontos = todas
    .filter(g => (g.pontos?.length ?? 0) > 0)
    .sort((a, b) => (b.pontos?.length ?? 0) - (a.pontos?.length ?? 0));
  return comPontos[0] ?? exata;
}

// Nº do ponto → coordenada. O nº é `numero` quando existe; senão `ordem + 1`.
export function pontosPorNumero(grade: GradeAmostragem | null): Map<number, { lng: number; lat: number }> {
  const m = new Map<number, { lng: number; lat: number }>();
  for (const p of grade?.pontos ?? []) m.set(p.numero ?? p.ordem + 1, { lng: p.lng, lat: p.lat });
  return m;
}

// Casa cada amostra do laudo com o seu ponto na grade.
//  1) pelo NÚMERO (nº da amostra ↔ nº do ponto) — o caminho normal;
//  2) FALLBACK por ORDEM quando os números não batem (lab renumerou as
//     amostras): assume que o laudo veio na ordem dos pontos e casa a i-ésima
//     amostra com o i-ésimo ponto. Só com ≥3 amostras e grade suficiente —
//     abaixo disso um acerto por acaso vale menos que não mostrar nada.
export function casarAmostrasComPontos(
  amostras: { numero: number; valor: number }[],
  grade: GradeAmostragem | null,
): PontoValor[] {
  const porNum = pontosPorNumero(grade);
  const porNumero: PontoValor[] = [];
  for (const a of amostras) {
    const pt = porNum.get(a.numero);
    if (pt) porNumero.push({ lng: pt.lng, lat: pt.lat, valor: a.valor });
  }
  if (porNumero.length >= 3) return porNumero;
  const ptsGrade = [...(grade?.pontos ?? [])].sort((a, b) => (a.numero ?? a.ordem + 1) - (b.numero ?? b.ordem + 1));
  if (amostras.length >= 3 && ptsGrade.length >= amostras.length) {
    const ord = [...amostras].sort((a, b) => a.numero - b.numero);
    return ord.map((a, i) => ({ lng: ptsGrade[i].lng, lat: ptsGrade[i].lat, valor: a.valor }));
  }
  return porNumero;
}
