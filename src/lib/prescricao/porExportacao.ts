// PRESCRIÇÃO POR ZONAS VIA EXPORTAÇÃO DE NUTRIENTES — módulo PURO.
// npm run teste:prescricaoexportacao
//
// A ideia: repor o que a colheita vai levar. Cada zona de manejo tem um
// POTENCIAL produtivo (kg/ha, cadastrado por classe na Biblioteca →
// Exportação); a cultura tem o COEFICIENTE de exportação (kg do elemento por
// tonelada colhida); o formulado tem a GARANTIA do nutriente-guia (% de óxido,
// como vem no saco). A conta, zona a zona:
//
//   potencial (kg/ha) ÷ 1000 × coef (kg P ou K por t)  = elemento exportado (kg/ha)
//   × ELEMENTO_PARA_OXIDO (P→P₂O₅ 2,291335; K→K₂O 1,2046) = óxido exportado (kg/ha)
//   ÷ (garantia % ÷ 100)                                = dose ideal do formulado (kg/ha)
//
// Exemplo do PDF de especificação: 3500 kg/ha × 4,5 kg P/t = 15,75 kg P/ha
// → 36,09 kg P₂O₅/ha → ÷ 32% (05-32-04) = 112,8 kg/ha.
//
// Duas modalidades:
//   'livre' (Modalidade 1) — cada zona recebe o ideal; o total é consequência
//                            (o volume a comprar).
//   'total' (Modalidade 2) — há um volume PROGRAMADO (dose média ou total).
//       • programado < necessidade: a mesma FRAÇÃO (programado ÷ necessidade)
//         do ideal em todas as zonas; mín/máx/passo da máquina respeitados
//         SEM ultrapassar o programado.
//       • programado ≥ necessidade: cada zona fica no ideal (nenhuma passa
//         dele) e o excedente aparece como SOBRA.
//
// Divisões perigosas (garantia 0, coeficiente não declarado, potencial
// ausente, necessidade zero) viram ERRO com mensagem — nunca Infinity/NaN.

import { ELEMENTO_PARA_OXIDO, paraElemento } from '../nutrienteBase.ts';


export type NutrienteGuia = 'p2o5' | 'k2o';

/** As cinco classes padrão do semáforo das zonas (ver lib/zonas.ts). */
export const CLASSES_POTENCIAL = ['Alta', 'Média-alta', 'Média', 'Média-baixa', 'Baixa'] as const;
export type ClassePotencial = (typeof CLASSES_POTENCIAL)[number];
export type PotencialPorClasse = Partial<Record<ClassePotencial, number>>;

/** Rótulos de tela/relatório (ASCII-safe fica a cargo de quem imprime). */
export const ROTULO_GUIA: Record<NutrienteGuia, { oxido: string; elemento: string }> = {
  p2o5: { oxido: 'P₂O₅', elemento: 'P' },
  k2o: { oxido: 'K₂O', elemento: 'K' },
};

const EPS = 1e-9;
const finitoNaoNeg = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/**
 * Coeficiente de exportação do nutriente-guia em ELEMENTO (kg P ou K por t).
 *
 * O cadastro novo (baseElemento: true) já está em elemento. Cadastro antigo,
 * sem a marca, ainda está em ÓXIDO: converte UMA vez aqui — e só aqui — para
 * que a conta da dose (que volta para óxido) não converta duas vezes.
 * null = NÃO DECLARADO (distinto de 0 declarado).
 */
export function coefElementoDoCadastro(
  c: { coeficientes?: Partial<Record<string, number>>; baseElemento?: boolean } | null | undefined,
  nut: NutrienteGuia,
): { coefElementoKgT: number; deOxido: boolean } | null {
  const v = c?.coeficientes?.[nut];
  if (!finitoNaoNeg(v)) return null;
  if (c?.baseElemento) return { coefElementoKgT: v, deOxido: false };
  return { coefElementoKgT: paraElemento(nut, v), deOxido: true };
}

// Rótulo normalizado → classe padrão. EXATO, de propósito: o classeZona()
// global casa por pedaço (/ALT|MEDI|BAIX/) e transformaria "Muito alto" em
// Alta e "Baixada úmida" em Baixa — aqui isso daria à zona o potencial de
// outra classe, calado. Só os 5 nomes do semáforo (com as variações de
// gênero e de separador) puxam do cadastro; o resto pede o número.
const ROTULO_EXATO: Record<string, ClassePotencial> = {
  'ALTA': 'Alta', 'ALTO': 'Alta',
  'MEDIA-ALTA': 'Média-alta', 'MEDIO-ALTO': 'Média-alta', 'MEDIA-ALTO': 'Média-alta', 'MEDIO-ALTA': 'Média-alta',
  'MEDIA': 'Média', 'MEDIO': 'Média',
  'MEDIA-BAIXA': 'Média-baixa', 'MEDIO-BAIXO': 'Média-baixa', 'MEDIA-BAIXO': 'Média-baixa', 'MEDIO-BAIXA': 'Média-baixa',
  'BAIXA': 'Baixa', 'BAIXO': 'Baixa',
};
function normalizaRotulo(raw: string): string {
  return raw.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().trim().replace(/[\s_/]+/g, '-').replace(/-+/g, '-');
}

/** Classe padrão de UMA zona pelo rótulo exato ('Alto', 'Média-alta', 'MEDIO_BAIXO'…), ou null. */
export function classePotencialDe(classe: string | undefined | null): ClassePotencial | null {
  if (!classe) return null;
  return ROTULO_EXATO[normalizaRotulo(classe)] ?? null;
}

/**
 * O zoneamento está no semáforo das 5 classes? Exige: no máximo 5 rótulos
 * distintos, TODOS exatos, e cada um numa classe diferente. Um zoneamento de
 * 6–12 classes ("Muito alto", "Alto"… "Muito baixo") não está — ali "Alto" é a
 * 2ª classe, não a de maior potencial, e puxar o número de "Alta" mentiria.
 */
export function zoneamentoNoSemaforo(classes: Array<string | undefined | null>): boolean {
  const distintos = [...new Set(classes.map(c => (c ?? '').trim()))];
  if (!distintos.length || distintos.length > 5) return false;
  const mapeadas = distintos.map(classePotencialDe);
  if (mapeadas.some(c => c == null)) return false;
  return new Set(mapeadas).size === mapeadas.length;
}

/**
 * Número digitado em pt-BR. "3.500" é TRÊS MIL E QUINHENTOS (é assim que o
 * potencial aparece em boletim e na especificação), "3.500,5" idem com
 * decimal, "3500" e "3,5" como sempre. Ponto sozinho com outra quantidade de
 * dígitos ("3.5") continua decimal. Vazio/inválido = undefined.
 */
export function lerNumeroBR(txt: string): number | undefined {
  const s = (txt ?? '').trim();
  if (!s) return undefined;
  const limpo = /^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(',', '.');
  const n = Number(limpo);
  return Number.isFinite(n) ? n : undefined;
}

export interface PotencialZona {
  kgHa: number | null;
  /** de onde veio: override desta prescrição, cadastro pela classe, ou faltando */
  origem: 'override' | 'cadastro' | 'falta';
  /** classe padrão — null quando o rótulo não é exato ou o zoneamento não
   *  está no semáforo de 5 classes */
  classe: ClassePotencial | null;
}

/**
 * Potencial de cada zona. Ordem: override desta prescrição → cadastro pela
 * classe padrão → falta (zona de rótulo livre, zoneamento fora do semáforo de
 * 5 classes, ou classe sem número no cadastro: pede o potencial no formulário).
 */
export function potencialDasZonas(
  zonas: Array<{ id: string; classe?: string }>,
  porClasse: PotencialPorClasse | null | undefined,
  override: Record<string, number> | null | undefined,
): Record<string, PotencialZona> {
  const out: Record<string, PotencialZona> = {};
  const semaforo = zoneamentoNoSemaforo(zonas.map(z => z.classe));
  for (const z of zonas) {
    const classe = semaforo ? classePotencialDe(z.classe) : null;
    const ov = override?.[z.id];
    if (finitoNaoNeg(ov)) { out[z.id] = { kgHa: ov, origem: 'override', classe }; continue; }
    const cad = classe ? porClasse?.[classe] : undefined;
    out[z.id] = finitoNaoNeg(cad) ? { kgHa: cad, origem: 'cadastro', classe } : { kgHa: null, origem: 'falta', classe };
  }
  return out;
}

export interface ContaZona {
  exportElementoKgHa: number;
  exportOxidoKgHa: number;
  doseIdealKgHa: number;
}

/** A conta de UMA zona. null = não dá para calcular (nunca Infinity). */
export function doseIdealDaZona(
  potencialKgHa: number | null | undefined,
  coefElementoKgT: number | null | undefined,
  nut: NutrienteGuia,
  garantiaPct: number | null | undefined,
): ContaZona | null {
  if (!finitoNaoNeg(potencialKgHa) || !finitoNaoNeg(coefElementoKgT)) return null;
  if (typeof garantiaPct !== 'number' || !Number.isFinite(garantiaPct) || garantiaPct <= 0) return null;
  const exportElementoKgHa = (potencialKgHa / 1000) * coefElementoKgT;
  const exportOxidoKgHa = exportElementoKgHa * ELEMENTO_PARA_OXIDO[nut];
  return { exportElementoKgHa, exportOxidoKgHa, doseIdealKgHa: exportOxidoKgHa / (garantiaPct / 100) };
}

export interface EntradaExportacao {
  zonas: Array<{ id: string; nome?: string; areaHa: number; potencialKgHa: number | null | undefined }>;
  nutriente: NutrienteGuia;
  coefElementoKgT: number | null | undefined;
  garantiaPct: number | null | undefined;
  cenario: 'livre' | 'total';
  /** Modalidade 2: volume programado em kg (dose média × área, ou o total). */
  programadoKg?: number;
  doseMin?: number;
  doseMax?: number;
  /** passo da máquina (kg/ha) */
  incremento?: number;
}

export interface ZonaResultado extends ContaZona {
  /** dose aplicada (kg/ha) — ideal na Modalidade 1; fração/limites na 2 */
  doseKgHa: number;
}

export interface ResultadoExportacao {
  ok: boolean;
  erros: string[];
  avisos: string[];
  porZona: Record<string, ZonaResultado>;
  areaHa: number;
  /** Σ ideal × área (kg) — quanto repõe a exportação inteira */
  necessidadeKg: number;
  /** média ponderada do ideal (kg/ha) */
  doseMediaIdeal: number;
  /** Σ dose × área (kg) */
  usadoKg: number;
  doseMedia: number;
  /** Modalidade 2 */
  programadoKg: number | null;
  /** programado ÷ necessidade (pode passar de 1) */
  fracao: number | null;
  /** programado − usado (≥ 0) */
  sobraKg: number | null;
  /** Modalidade 2: zonas cujo ideal passa da dose máxima */
  limitadasMax: string[];
  /** Modalidade 2: [mín, máx] de dose ÷ ideal quando os limites quebraram a fração única */
  faixaFracao: [number, number] | null;
}

const vazio = (erros: string[], avisos: string[] = []): ResultadoExportacao => ({
  ok: false, erros, avisos, porZona: {}, areaHa: 0, necessidadeKg: 0, doseMediaIdeal: 0,
  usadoKg: 0, doseMedia: 0, programadoKg: null, fracao: null, sobraKg: null, limitadasMax: [], faixaFracao: null,
});

// ── Grade do arquivo de aplicação ───────────────────────────────────────────
// O SHP/Excel/PDF escrevem a dose com arredRel (resumo.ts): a partir de
// CASAS_LIMIAR = 100 sai INTEIRA, abaixo com 2 casas. Se a dose gravada não
// estiver nessa grade, o arquivo arredonda de novo — e 225,55 vira 226, acima
// do ideal, e a soma passa do programado. Por isso este módulo grava a dose
// JÁ na grade (mesmo limiar, de propósito duplicado aqui: resumo.ts importa
// este arquivo; o teste confere que arredRel(dose) === dose).
export const LIMIAR_DOSE_INTEIRA = 100;

/** Tira só o resíduo de ponto flutuante de uma dose que já está na grade. */
export function limparDose(v: number): number {
  if (!Number.isFinite(v)) return v;
  return Math.abs(v) >= LIMIAR_DOSE_INTEIRA ? Math.round(v) : Math.round(v * 100) / 100;
}

/** Maior valor na precisão do arquivo que não passa de v. */
function pisoArquivo(v: number): number {
  if (v >= LIMIAR_DOSE_INTEIRA) return Math.floor(v + 1e-9);
  return limparDose(Math.floor(v * 100 + 1e-7) / 100);
}

/**
 * Grade de doses possíveis: múltiplos do passo da máquina (sem passo, 0,01
 * kg/ha) levados à precisão do arquivo. `baixo(d)` = maior dose possível ≤ d;
 * `acima(d)` = menor dose possível > d; `abaixo(d)` = maior dose possível < d.
 */
export function gradeDoArquivo(incremento?: number) {
  const passo = incremento && incremento > 0 ? incremento : 0.01;
  const val = (m: number) => pisoArquivo(m * passo);
  const baixo = (d: number): number => {
    if (!(d > 0)) return 0;
    // val(m) ≥ m·passo − 1, então m ≤ (d + 1)/passo; desce até caber.
    let m = Math.floor((d + 1) / passo) + 1;
    while (m > 0 && val(m) > d + 1e-9) m--;
    return m > 0 ? val(m) : 0;
  };
  const acima = (d: number): number => {
    let m = Math.max(1, Math.floor(d / passo + 1e-9) + 1);
    for (let i = 0; i < 100000; i++, m++) { const c = val(m); if (c > d + 1e-9) return c; }
    return Infinity;
  };
  const abaixo = (d: number): number => baixo(d - 1e-7);
  return { passo, baixo, acima, abaixo };
}

const pct = (v: number) => `${(Math.round(v * 1000) / 10).toLocaleString('pt-BR')}%`;
const kg = (v: number) => `${Math.round(v).toLocaleString('pt-BR')} kg`;

export function prescreverPorExportacao(e: EntradaExportacao): ResultadoExportacao {
  const erros: string[] = [];
  const avisos: string[] = [];
  const g = ROTULO_GUIA[e.nutriente];
  if (!g) return vazio(['Escolha o nutriente-guia (P₂O₅ ou K₂O).']);
  if (!finitoNaoNeg(e.coefElementoKgT)) {
    erros.push(`A cultura não tem coeficiente de exportação de ${g.elemento} declarado (Biblioteca → Exportação de Nutrientes).`);
  }
  if (!(typeof e.garantiaPct === 'number' && Number.isFinite(e.garantiaPct) && e.garantiaPct > 0)) {
    erros.push(`O formulado escolhido não declara ${g.oxido} na garantia — ele não serve para repor ${g.elemento}. Escolha outro ou cadastre a garantia em Biblioteca → Insumos.`);
  }
  const semPotencial = e.zonas.filter(z => !finitoNaoNeg(z.potencialKgHa));
  if (semPotencial.length) {
    erros.push(`Informe o potencial produtivo (kg/ha) da(s) zona(s) ${semPotencial.map(z => z.nome ?? z.id).join(', ')}.`);
  }
  if (!e.zonas.length) erros.push('Não há zonas para prescrever.');
  if (e.doseMin != null && e.doseMax != null && e.doseMax < e.doseMin) erros.push('A dose máxima é menor que a mínima.');
  if (e.cenario === 'total' && !(typeof e.programadoKg === 'number' && Number.isFinite(e.programadoKg) && e.programadoKg > 0)) {
    erros.push('Informe o volume programado (dose média por hectare ou total).');
  }
  if (erros.length) return vazio(erros);

  const contas: Record<string, ContaZona> = {};
  for (const z of e.zonas) contas[z.id] = doseIdealDaZona(z.potencialKgHa, e.coefElementoKgT, e.nutriente, e.garantiaPct)!;
  if (e.coefElementoKgT === 0) avisos.push(`O coeficiente de ${g.elemento} da cultura está declarado como ZERO — nenhuma dose a repor.`);

  const area = (z: { areaHa: number }) => (z.areaHa > EPS ? z.areaHa : 0);
  const areaHa = e.zonas.reduce((s, z) => s + area(z), 0);
  const necessidadeKg = e.zonas.reduce((s, z) => s + contas[z.id].doseIdealKgHa * area(z), 0);
  const doseMediaIdeal = areaHa > EPS ? necessidadeKg / areaHa : 0;
  const doses: Record<string, number> = {};
  const g0 = gradeDoArquivo(e.incremento);

  // Plausibilidade: potencial de 3,5 "kg/ha" é quase sempre 3.500 digitado
  // com ponto, ou t/ha no campo de kg/ha.
  const baixos = e.zonas.filter(z => (z.potencialKgHa as number) > 0 && (z.potencialKgHa as number) < 300);
  if (baixos.length) {
    avisos.push(`Potencial muito baixo na(s) zona(s) ${baixos.map(z => `${z.nome ?? z.id} (${z.potencialKgHa} kg/ha)`).join(', ')} — confira se não foi digitado em t/ha. O campo é em kg/ha (3.500 = três mil e quinhentos).`);
  }

  // Teto e piso de cada zona. NENHUMA zona passa do ideal (nem pela dose
  // mínima, nem pelo passo da máquina, nem pelo arredondamento do arquivo).
  const tetos: Record<string, number> = {};
  const pisos: Record<string, number> = {};
  const abaixoDoMin: string[] = [];
  const limitadasMax: string[] = [];
  for (const z of e.zonas) {
    const ideal = contas[z.id].doseIdealKgHa;
    tetos[z.id] = Math.min(ideal, e.doseMax ?? Infinity);
    if (tetos[z.id] < ideal - EPS) limitadasMax.push(z.nome ?? z.id);
    const p = Math.max(0, e.doseMin ?? 0);
    if (e.doseMin != null && p > tetos[z.id] + EPS) abaixoDoMin.push(z.nome ?? z.id);
    pisos[z.id] = Math.min(p, tetos[z.id]);
  }
  // Na Modalidade 1 o mínimo SOBE a dose (aviso depois da grade, com as zonas
  // que passaram do ideal); na 2, nenhuma zona passa do ideal.
  if (abaixoDoMin.length && e.cenario !== 'livre') {
    avisos.push(`Na(s) zona(s) ${abaixoDoMin.join(', ')} o ideal fica abaixo da dose mínima — a dose não passa do ideal.`);
  }
  const subiuPeloMin: string[] = [];
  const semGradeEntreLimites: string[] = [];

  /** Alvo contínuo de cada zona, antes da grade. */
  const alvo: Record<string, number> = {};
  let programadoKg: number | null = null, fracao: number | null = null;
  let k = 1;
  let faixaFracao: [number, number] | null = null;
  let limitadasMaxM2: string[] = [];

  if (e.cenario === 'livre') {
    // Modalidade 1: o ideal (limitado pela dose máxima).
    for (const z of e.zonas) alvo[z.id] = tetos[z.id];
    if (limitadasMax.length) avisos.push(`A dose máxima deixou ${limitadasMax.length} zona(s) abaixo do ideal da exportação (${limitadasMax.join(', ')}).`);
  } else {
    // Modalidade 2: fração única sobre o ideal, depois limites e passo SEM
    // ultrapassar o programado.
    programadoKg = e.programadoKg!;
    if (necessidadeKg <= EPS) {
      for (const z of e.zonas) { alvo[z.id] = 0; pisos[z.id] = 0; }
      avisos.push('A necessidade calculada é zero — nada a distribuir; todo o programado fica de sobra.');
    } else {
      fracao = programadoKg / necessidadeKg;
      const custoPiso = e.zonas.reduce((s, z) => s + pisos[z.id] * area(z), 0);
      if (custoPiso > programadoKg + EPS) {
        avisos.push(`O programado (${kg(programadoKg)}) não alcança a dose mínima em todas as zonas (${kg(custoPiso)}) — o mínimo foi ignorado e vale só a fração do ideal.`);
        for (const z of e.zonas) pisos[z.id] = 0;
      }
      const doseCom = (kk: number, id: string) =>
        Math.min(tetos[id], Math.max(pisos[id], contas[id].doseIdealKgHa * kk));
      const gasto = (kk: number) => e.zonas.reduce((s, z) => s + doseCom(kk, z.id) * area(z), 0);
      // k = fração efetiva. Sem limites, k = fração. Com limites, acha por
      // bisseção o k que fecha o programado (gasto(k) é monótona em k).
      if (gasto(1) <= programadoKg + EPS) k = 1;
      else {
        let lo = 0, hi = 1;
        for (let i = 0; i < 200; i++) {
          const mid = (lo + hi) / 2;
          if (gasto(mid) <= programadoKg) lo = mid; else hi = mid;
        }
        k = lo;
      }
      for (const z of e.zonas) alvo[z.id] = doseCom(k, z.id);
    }
  }

  // ── Grade do ARQUIVO ──
  // A dose gravada já sai na grade que vai para a máquina (passo da máquina
  // e precisão do SHP: inteiro a partir de 100 kg/ha, centésimo abaixo), de
  // modo que gravado == exportado. Arredonda PARA BAIXO (nunca passa do
  // ideal nem do programado); depois devolve o troco, no máximo UM degrau por
  // zona (a fração continua única — zona minúscula não engole o troco todo).
  for (const z of e.zonas) {
    if (e.cenario === 'livre') {
      // Modalidade 1: não há volume a respeitar — arredonda AO MAIS PRÓXIMO
      // na grade do arquivo (112,78 → 113, como o relatório mostra). O ideal
      // NÃO é teto aqui; a única trava é a dose máxima: se o arredondado
      // passar dela, desce degrau a degrau (máx 113, passo 5: 115 → 110).
      const ideal = contas[z.id].doseIdealKgHa;
      const b = g0.baixo(ideal), u = g0.acima(b);
      let d = ideal - b < u - ideal ? b : u;
      // A dose mínima é limite da MÁQUINA e vale: sobe até ela, na grade.
      if (e.doseMin != null && d < e.doseMin - EPS) {
        for (let i = 0; i < 100000 && d < e.doseMin - EPS; i++) d = g0.acima(d);
        if (d > ideal + EPS) subiuPeloMin.push(z.nome ?? z.id);
      }
      if (e.doseMax != null) for (let i = 0; i < 100000 && d > e.doseMax + EPS && d > 0; i++) d = g0.abaixo(d);
      if (e.doseMin != null && d < e.doseMin - EPS) semGradeEntreLimites.push(z.nome ?? z.id);
      doses[z.id] = d;
      continue;
    }
    let d = g0.baixo(alvo[z.id]);
    if (d < pisos[z.id] - EPS) {
      let u = d;
      for (let i = 0; i < 100000 && u < pisos[z.id] - EPS; i++) u = g0.acima(u);
      if (u <= tetos[z.id] + EPS) d = u;
    }
    doses[z.id] = d;
  }
  if (subiuPeloMin.length) {
    avisos.push(`A dose mínima da máquina deixou ${subiuPeloMin.length} zona(s) ACIMA do ideal da exportação: ${subiuPeloMin.join(', ')}.`);
  }
  if (semGradeEntreLimites.length) {
    avisos.push(`Com o passo da máquina não há dose entre a mínima e a máxima na(s) zona(s) ${semGradeEntreLimites.join(', ')} — ficou abaixo da mínima para não passar da máxima.`);
  }
  if (programadoKg != null) {
    let restante = programadoKg - e.zonas.reduce((s, z) => s + doses[z.id] * area(z), 0);
    // Subir o piso para a grade pode ter estourado: tira degraus de quem ganhou.
    const porGanho = [...e.zonas].sort((a, b) => (doses[b.id] - alvo[b.id]) - (doses[a.id] - alvo[a.id]) || a.id.localeCompare(b.id));
    for (const z of porGanho) {
      while (restante < -EPS && area(z) > 0 && doses[z.id] > 0 && g0.abaixo(doses[z.id]) >= pisos[z.id] - EPS) {
        const nd = g0.abaixo(doses[z.id]);
        restante += (doses[z.id] - nd) * area(z); doses[z.id] = nd;
      }
    }
    // Ainda estourado: o mínimo na grade não cabe no programado. O total
    // manda — desce abaixo do mínimo (um degrau por zona por volta), avisando.
    if (restante < -EPS) {
      avisos.push('Com o passo da máquina, o mínimo não cabe no programado em todas as zonas — algumas ficaram abaixo da dose mínima para não passar do total.');
      let cortou = true;
      while (restante < -EPS && cortou) {
        cortou = false;
        for (const z of porGanho) {
          if (restante >= -EPS) break;
          if (area(z) > 0 && doses[z.id] > 0) {
            const nd = g0.abaixo(doses[z.id]);
            restante += (doses[z.id] - nd) * area(z); doses[z.id] = nd; cortou = true;
          }
        }
      }
    }
    // Troco: quem mais perdeu no arredondamento sobe UM degrau, se couber no
    // teto e no que resta do programado.
    const fila = [...e.zonas].sort((a, b) => (alvo[b.id] - doses[b.id]) - (alvo[a.id] - doses[a.id]) || a.id.localeCompare(b.id));
    for (const z of fila) {
      if (area(z) <= 0 || doses[z.id] >= alvo[z.id] - EPS) continue;
      const u = g0.acima(doses[z.id]);
      if (u <= tetos[z.id] + EPS && (u - doses[z.id]) * area(z) <= restante + EPS) {
        restante -= (u - doses[z.id]) * area(z); doses[z.id] = u;
      }
    }

    if (fracao != null) {
      const comLimite = Math.abs(k - fracao) > 1e-9
        || e.zonas.some(z => Math.abs(alvo[z.id] - contas[z.id].doseIdealKgHa * k) > 1e-9);
      if (fracao < 1 - EPS && comLimite) {
        const razoes = e.zonas.filter(z => contas[z.id].doseIdealKgHa > EPS).map(z => limparDose(doses[z.id]) / contas[z.id].doseIdealKgHa);
        if (razoes.length) faixaFracao = [Math.min(...razoes), Math.max(...razoes)];
      }
      limitadasMaxM2 = limitadasMax;
      avisos.push(textoModalidade2({ fracao, necessidadeKg, limitadasMax, faixaFracao }));
    }
  }
  // Só o resíduo de ponto flutuante (194,70000000000002 → 194,7): a dose já
  // está na grade do arquivo.
  for (const z of e.zonas) doses[z.id] = limparDose(doses[z.id]);

  const porZona: Record<string, ZonaResultado> = {};
  for (const z of e.zonas) porZona[z.id] = { ...contas[z.id], doseKgHa: doses[z.id] };
  const usadoKg = e.zonas.reduce((s, z) => s + doses[z.id] * area(z), 0);
  return {
    ok: true, erros, avisos, porZona, areaHa, necessidadeKg, doseMediaIdeal,
    usadoKg, doseMedia: areaHa > EPS ? usadoKg / areaHa : 0,
    programadoKg, fracao,
    sobraKg: programadoKg == null ? null : Math.max(0, programadoKg - usadoKg),
    limitadasMax: limitadasMaxM2, faixaFracao,
  };
}

/**
 * O texto da Modalidade 2 — o MESMO na tela (aviso do cálculo) e no PDF/Excel
 * (lido do snapshot). Só promete "cada zona no ideal" ou "a mesma fração"
 * quando os limites mín/máx não quebraram isso.
 */
export function textoModalidade2(o: {
  fracao: number; necessidadeKg: number;
  /** zonas cujo ideal passa da dose máxima */
  limitadasMax?: string[] | null;
  /** [mín, máx] de dose ÷ ideal quando os limites quebraram a fração única */
  faixaFracao?: [number, number] | null;
}): string {
  const lim = o.limitadasMax ?? [];
  if (o.fracao >= 1 - EPS) {
    return lim.length
      ? `O programado cobre a necessidade inteira (${kg(o.necessidadeKg)}): as zonas ficam no ideal, exceto ${lim.length} limitada(s) pela dose máxima (${lim.join(', ')}); o excedente sobra.`
      : `O programado cobre a necessidade inteira (${kg(o.necessidadeKg)}): cada zona fica no ideal e o excedente sobra.`;
  }
  if (!o.faixaFracao) {
    return `O programado cobre ${pct(o.fracao)} da necessidade (${kg(o.necessidadeKg)}): cada zona recebe ${pct(o.fracao)} do seu ideal.`;
  }
  return `O programado cobre ${pct(o.fracao)} da necessidade (${kg(o.necessidadeKg)}). Com os limites mín/máx, a fração do ideal por zona ficou entre ${pct(o.faixaFracao[0])} e ${pct(o.faixaFracao[1])}.`;
}

export type GarantiasEntrega = Partial<Record<'n' | 'p2o5' | 'k2o' | 's' | 'ca' | 'mg', number>>;

/** O que o formulado entrega de cada nutriente declarado (kg/ha), na dose dada. */
export function entregaDoFormulado(doseKgHa: number, garantias: GarantiasEntrega | null | undefined): GarantiasEntrega {
  const out: GarantiasEntrega = {};
  if (!Number.isFinite(doseKgHa) || !garantias) return out;
  // Só os macros/secundários do app (o cadastro também guarda micros, que
  // aqui não entram).
  for (const n of ['n', 'p2o5', 'k2o', 's', 'ca', 'mg'] as const) {
    const gp = garantias[n];
    if (typeof gp === 'number' && Number.isFinite(gp) && gp > 0) out[n] = doseKgHa * gp / 100;
  }
  return out;
}
