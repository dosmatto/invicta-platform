// RESUMO e conversões da prescrição para o ARQUIVO — puro (testável em node).
//
// Mora fora de exportar.ts de propósito: aquele módulo puxa jsPDF, xlsx e o
// canvas do mapa, e não carrega em node. A conta que decide quanta semente
// comprar não pode ficar refém disso.
//
// Extensão .ts explícita nos imports: os testes rodam com type-stripping.

import { doseCompensada } from './sementes.ts';
import { reguasEquivalentes, converterDose, ROTULO_CURTO } from './unidade.ts';
import { UNIDADE_TOTAL, ehUnidadeSemente, type Prescricao, type UnidadeDose } from './tipos.ts';
import { complementarNutriente, SIMBOLO_NUTRIENTE } from '../insumos.ts';
import { fmtHa } from '../formato.ts';

// Símbolo do nutriente em ASCII para o PDF: os subscritos de P₂O₅ e K₂O estão
// fora do WinAnsi da helvetica e são descartados na hora de desenhar — sairia
// "PO" e "KO" no relatório. Na tela e no Excel o símbolo bonito continua.
const SIMBOLO_PDF: Record<string, string> = {
  n: 'N', p2o5: 'P2O5', k2o: 'K2O', s: 'S', ca: 'Ca', mg: 'Mg',
};

const fmt = (v: number, d = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmt0 = (v: number) => Math.round(v).toLocaleString('pt-BR');

/**
 * Casas decimais pela MAGNITUDE do número — regra dos relatórios.
 *
 * Acima de 100 a casa decimal não informa nada e só polui: "391 kg/ha" é a
 * dose, "391,1" finge uma precisão que a distribuidora não entrega. Abaixo de
 * 100 ela é o dado: sementes por metro linear é 12,52, e arredondar para 13
 * erra a população em quase 4%.
 */
export const CASAS_LIMIAR = 100;

export function fmtRel(v: number): string {
  if (!Number.isFinite(v)) return '—';
  return Math.abs(v) >= CASAS_LIMIAR
    ? Math.round(v).toLocaleString('pt-BR')
    : v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** Mesma regra, devolvendo NÚMERO — para as células do Excel e o DBF do SHP. */
export function arredRel(v: number): number {
  if (!Number.isFinite(v)) return v;
  return Math.abs(v) >= CASAS_LIMIAR ? Math.round(v) : Math.round(v * 100) / 100;
}

// Dose do ARQUIVO: quando a prescrição foi feita em população desejada, o que
// a máquina precisa é a taxa de semeadura — a dose compensada pela germinação.
// Sem isso o arquivo sai com a população e a lavoura nasce abaixo do alvo.
export const doseArquivo = (p: Prescricao, dose: number): number =>
  doseCompensada(dose, p.params.sementes, p.params.doseEhPopulacao && ehUnidadeSemente(p.unidade));

/**
 * true quando o arquivo leva um número diferente do digitado (há compensação).
 *
 * Germinação é assunto de SEMENTE. Fertilizante, corretivo e orgânico não
 * germinam: o relatório de um adubo saía falando em "população desejada" e
 * "ajuste de germinação (97%)" porque o marcador ficava ligado de uma
 * prescrição anterior — números certos, texto sem sentido agronômico. A
 * unidade decide, não só o marcador.
 */
export function temCompensacao(p: Prescricao): boolean {
  if (!ehUnidadeSemente(p.unidade)) return false;
  return !!p.params.doseEhPopulacao && Math.abs(doseArquivo(p, 1) - 1) > 1e-9;
}

// ── Réguas equivalentes nos relatórios ──────────────────────────────────────
//
// O relatório mostra a MESMA dose em mais de uma régua (ver reguasEquivalentes):
// população por hectare e sementes por metro linear saem sempre; num mapa feito
// em metro quadrado, o m² continua sendo a régua principal e as outras duas o
// acompanham. É conversão exata — não é conta nova, é o mesmo número medido de
// outro jeito —, então nada do que está salvo muda.

/** Réguas em que o relatório repete a dose, além da unidade da prescrição. */
export function reguasDoRelatorio(p: Prescricao): UnidadeDose[] {
  return reguasEquivalentes(p.unidade, p.params.sementes?.espacamentoM);
}

/**
 * Dose FINAL (a que a máquina aplica — já compensada pela germinação) na régua
 * pedida. É esta que o usuário chama de "população final": a desejada é a meta,
 * a final é o que vai plantado.
 */
export function doseFinalEm(p: Prescricao, dose: number, para: UnidadeDose): number {
  return converterDose(doseArquivo(p, dose), p.unidade, para, p.params.sementes?.espacamentoM);
}

/** Rótulo de coluna/linha: "5,19 sementes/m". */
const comRegua = (v: number, u: UnidadeDose): string => `${fmtRel(v)} ${ROTULO_CURTO(u)}`;

/**
 * A dose final MÉDIA escrita em todas as réguas — a linha que fecha o resumo.
 * A média é ponderada pela área (total do arquivo ÷ área), não a média simples
 * das zonas: uma zona de 3 ha não pesa igual a uma de 19 ha.
 * null quando não é semente (fertilizante não tem régua irmã).
 */
export function linhaEquivalencias(p: Prescricao, mediaFinalNaUnidade: number): string | null {
  if (!ehUnidadeSemente(p.unidade)) return null;
  const partes = [comRegua(mediaFinalNaUnidade, p.unidade)];
  for (const u of reguasDoRelatorio(p)) {
    partes.push(comRegua(converterDose(mediaFinalNaUnidade, p.unidade, u, p.params.sementes?.espacamentoM), u));
  }
  if (partes.length < 2) return null;   // sem espaçamento não há o que equivaler
  const rotulo = temCompensacao(p) ? 'Taxa de semeadura (média final)' : 'Dose média';
  return `${rotulo}: ${partes.join('  ·  ')}`;
}

/** Sementes → quilos pelo PMS (peso de mil sementes, em g). null sem PMS. */
export function kgDeSementes(sementes: number, pmsG?: number): number | null {
  return pmsG && pmsG > 0 ? (sementes * pmsG) / 1e6 : null;
}

/** Sementes → sacos. null quando a semente não tem sementes/saco cadastrado. */
export function sacosDeSementes(sementes: number, sementesPorSaco?: number): number | null {
  return sementesPorSaco && sementesPorSaco > 0 ? sementes / sementesPorSaco : null;
}

/**
 * Uma linha com os PARÂMETROS DA SEMENTE em uso — é ela que justifica os quilos
 * e os sacos do resumo. Sem isso, "= 1.047 kg = 59,6 sacos" são dois números que
 * ninguém consegue conferir: dependem do PMS e do sementes/saco que estavam
 * preenchidos na hora, e esses campos não aparecem em lugar nenhum do PDF.
 * null quando não há nenhum parâmetro (fertilizante, corretivo, orgânico).
 */
export function linhaParametrosSemente(p: Prescricao): string | null {
  if (!ehUnidadeSemente(p.unidade)) return null;
  const s = p.params.sementes;
  if (!s) return null;
  const partes: string[] = [];
  if (s.cultivar) partes.push(san(s.cultivar));
  if (s.pmsG && s.pmsG > 0) partes.push(`PMS ${fmtRel(s.pmsG)} g`);
  if (s.germinacaoPct > 0) partes.push(`germinacao ${fmt(s.germinacaoPct, 0)}%`);
  if (s.espacamentoM && s.espacamentoM > 0) partes.push(`espacamento ${fmt(s.espacamentoM, 2)} m`);
  if (s.sementesPorSaco && s.sementesPorSaco > 0) partes.push(`${fmt0(s.sementesPorSaco)} sementes/saco`);
  return partes.length ? `Semente: ${partes.join(' · ')}` : null;
}

// O PDF desenha em helvetica WinAnsi: acento fora do Latin-1 vira lixo. O
// cultivar é texto livre do usuário, então passa por aqui.
const san = (s: string): string => s.replace(/[^\x00-\xFF]/g, '').trim();

/**
 * Linhas do RESUMO do PDF. Fora do desenho para caber teste e leitura.
 *
 * A pergunta que o resumo tem de responder é uma só: quanta semente eu compro,
 * e quanta a máquina vai plantar? Com compensação são DOIS totais — o da
 * população pedida e o ajustado pela germinação —, e é a diferença entre eles
 * que vira saco a mais no pedido.
 */
export function montarResumoPdf(
  p: Prescricao,
  r: { areaHa: number; nZonas: number; usado: number; doseMin: number; doseMax: number; doseMedia: number; custo: number | null },
  fator: number,
  nPoligonos: number,
): Array<{ txt: string; destaque?: boolean }> {
  const un = UNIDADE_TOTAL[p.unidade];
  const semente = ehUnidadeSemente(p.unidade);
  const nTot = (v: number) => fmtRel(v);
  const pms = p.params.sementes?.pmsG;
  const porSaco = p.params.sementes?.sementesPorSaco;
  // Todo total de SEMENTE sai também em quilo e em SACO — é assim que se compra
  // e que se carrega a plantadeira. Cada conversão só aparece se o parâmetro que
  // a sustenta existir (PMS para o quilo, sementes/saco para o saco).
  const comKg = (sementes: number): string => {
    if (!semente) return '';
    const kg = kgDeSementes(sementes, pms);
    const sacos = sacosDeSementes(sementes, porSaco);
    return [kg == null ? null : `${fmtRel(kg)} kg`, sacos == null ? null : `${fmt(sacos, 1)} sacos`]
      .filter(Boolean).map(t => ` = ${t}`).join('');
  };

  const linhas: Array<{ txt: string; destaque?: boolean }> = [
    { txt: `Área: ${fmtHa(r.areaHa)} ha em ${r.nZonas} zona(s) · ${nPoligonos} polígono(s)` },
  ];
  const paramsSemente = linhaParametrosSemente(p);
  if (paramsSemente) linhas.push({ txt: paramsSemente });

  if (temCompensacao(p)) {
    const germ = p.params.sementes?.germinacaoPct ?? 100;
    const semAjuste = r.usado;                       // população pedida × área
    const comAjuste = totalDoArquivo(p, fator);      // taxa de semeadura × área
    const dif = comAjuste - semAjuste;
    const pct = semAjuste > 0 ? (dif / semAjuste) * 100 : 0;
    linhas.push(
      { txt: `População desejada: média ${fmtRel(r.doseMedia)} ${p.unidade} (mín ${fmtRel(r.doseMin)} · máx ${fmtRel(r.doseMax)})` },
      { txt: `Total SEM ajuste (população desejada): ${nTot(semAjuste)} ${un}${comKg(semAjuste)}` },
      { txt: `Total COM ajuste de germinação (${fmt(germ, 0)}%): ${nTot(comAjuste)} ${un}${comKg(comAjuste)}`, destaque: true },
      { txt: `Diferença a mais para comprar: ${nTot(dif)} ${un}${comKg(dif)} (+${fmt(pct, 1)}%)` },
    );
  } else {
    linhas.push(
      { txt: `Dose: mín ${fmtRel(r.doseMin)} · máx ${fmtRel(r.doseMax)} · média ${fmtRel(r.doseMedia)} ${p.unidade}` },
      { txt: `Quantidade usada: ${nTot(r.usado)} ${un}${comKg(r.usado)}` },
    );
  }

  // A dose FINAL média em todas as réguas — população por hectare e sementes
  // por metro linear saem SEMPRE, seja qual for a unidade em que a prescrição
  // foi feita. Substitui a antiga linha "Taxa de semeadura: … sementes/ha", que
  // dava a mesma média numa régua só.
  const eq = linhaEquivalencias(p, doseArquivo(p, r.doseMedia));
  if (eq) linhas.push({ txt: eq, destaque: true });

  // Complementação por nutriente (Parte XIV §11): a conta inteira no relatório,
  // porque é ela que justifica a dose — sem os números do produto base, a dose
  // do complementar é um valor que ninguém consegue conferir.
  const c = p.params.complemento;
  if (p.modo === 'complemento' && c) {
    const sim = SIMBOLO_PDF[c.nutriente] ?? SIMBOLO_NUTRIENTE[c.nutriente] ?? c.nutriente;
    const res = complementarNutriente({
      metaKgHa: c.metaKgHa ?? 0, baseGarantiaPct: c.baseGarantiaPct ?? 0,
      baseDoseKgHa: c.baseDoseKgHa ?? 0, compGarantiaPct: c.compGarantiaPct ?? 0,
    });
    // Sinais em ASCII: "−" (U+2212) e "÷" não existem na fonte do PDF e somem
    // na hora de desenhar — a linha saía "180,0 0,0 = 180,0", sem operador.
    const gComp = c.compGarantiaPct ?? 0;

    // Base vinda de uma prescrição salva: a dose VARIA por zona. Dizer
    // "0,0 kg/ha" ali é falso; o que informa é a faixa aplicada e o fato de a
    // correção ter sido feita zona a zona.
    const dz = c.baseDosePorZona;
    const doses = dz ? p.zonas.map(z => dz[z.idZona]).filter((v): v is number => v != null) : [];
    if (doses.length) {
      const rz = p.zonas.map(z => complementarNutriente({
        metaKgHa: c.metaKgHa ?? 0, baseGarantiaPct: c.baseGarantiaPct ?? 0,
        baseDoseKgHa: dz![z.idZona] ?? 0, compGarantiaPct: gComp,
      }));
      const faixa = (v: number[]) => (Math.abs(Math.max(...v) - Math.min(...v)) < 0.05
        ? fmtRel(v[0]) : `${fmtRel(Math.min(...v))} a ${fmtRel(Math.max(...v))}`);
      linhas.push(
        { txt: `Complementação por nutriente - referência: ${sim}, meta ${fmtRel(c.metaKgHa ?? 0)} kg/ha`, destaque: true },
        { txt: `Produto base: ${c.baseNome ?? '(nenhum)'} aplicado em TAXA VARIÁVEL (${c.basePrescricaoNome ?? 'prescrição anterior'}), ${faixa(doses)} kg/ha · garantia ${fmtRel(c.baseGarantiaPct ?? 0)}% de ${sim}` },
        { txt: `Já fornecido pelo base: ${faixa(rz.map(x => x.fornecidoKgHa))} kg/ha de ${sim} · faltando para a meta: ${faixa(rz.map(x => x.faltanteKgHa))} kg/ha` },
        { txt: `Produto complementar: ${c.compNome ?? p.produto} · garantia ${fmtRel(gComp)}% de ${sim} · dose calculada ZONA A ZONA para fechar a meta: ${faixa(rz.map(x => x.doseCompKgHa))} kg/ha`, destaque: true },
        ...[...new Set(rz.flatMap(x => x.avisos))].map(a => ({ txt: a })),
      );
    } else {
      linhas.push(
        { txt: `Complementação por nutriente - referência: ${sim}, meta ${fmtRel(c.metaKgHa ?? 0)} kg/ha`, destaque: true },
        { txt: `Produto base: ${c.baseNome ?? '(nenhum)'} · ${fmtRel(c.baseDoseKgHa ?? 0)} kg/ha · garantia ${fmtRel(c.baseGarantiaPct ?? 0)}% -> fornece ${fmtRel(res.fornecidoKgHa)} kg/ha de ${sim}` },
        { txt: `Faltante: ${fmtRel(c.metaKgHa ?? 0)} - ${fmtRel(res.fornecidoKgHa)} = ${fmtRel(res.faltanteKgHa)} kg/ha de ${sim}` },
        { txt: `Produto complementar: ${c.compNome ?? p.produto} · garantia ${fmtRel(gComp)}% -> ${fmtRel(res.faltanteKgHa)} / ${fmtRel(gComp)}% = ${fmtRel(res.doseCompKgHa)} kg/ha`, destaque: true },
        ...res.avisos.map(a => ({ txt: a })),
      );
    }
  }

  if (p.params.totalDisponivel != null) {
    const sobra = p.params.totalDisponivel - r.usado;
    linhas.push({ txt: `Disponível informado: ${nTot(p.params.totalDisponivel)} ${un} · ${sobra >= 0 ? 'restante' : 'falta'}: ${nTot(Math.abs(sobra))} ${un}` });
  }
  if (r.custo != null) linhas.push({ txt: `Custo estimado: R$ ${fmtRel(r.custo)}` });

  linhas.push(temCompensacao(p)
    ? { txt: 'O arquivo de aplicação JÁ SAI com o ajuste de população: a máquina recebe a taxa de semeadura corrigida pela germinação, não a população desejada.', destaque: true }
    : { txt: 'O arquivo de aplicação sai com a dose exatamente como está na tabela acima.' });
  return linhas;
}

// Quanto de produto o arquivo consome de fato. Com compensação, o resumo conta
// em POPULAÇÃO (a base do total disponível) e o depósito entrega SEMENTES — o
// número que o comprador precisa é este.
export function totalDoArquivo(p: Prescricao, fator: number): number {
  return p.zonas.reduce((s, z) => s + doseArquivo(p, z.dose) * z.areaHa * fator, 0);
}

// ── Cor da dose ─────────────────────────────────────────────────────────────
// Cor por DOSE — rampa VERDE → AMARELO → VERMELHO (RdYlGn invertida, a mesma
// família da declividade no relatório do MDE). Mapa de prescrição se lê pela
// dose, não pela classe da zona de origem.
//
// Era verde-claro → verde-escuro, e duas doses próximas ficavam indistinguíveis
// no papel: com 344 e 354 kg/ha o mapa inteiro saía do mesmo verde pálido. Com
// três cores o olho separa na hora — verde onde se aplica menos, vermelho onde
// se aplica mais — e a tabela usa o mesmo código, então o quadradinho da zona
// combina com a mancha do mapa.
const RAMPA_DOSE: [number, number, number][] = [
  [26, 152, 80],     // verde  — dose mínima
  [254, 224, 139],   // amarelo — meio
  [215, 48, 39],     // vermelho — dose máxima
];

export function corDaDose(dose: number, doseMin: number, doseMax: number): string {
  const t = doseMax - doseMin < 1e-9 ? 0.5 : (dose - doseMin) / (doseMax - doseMin);
  const u = Math.min(1, Math.max(0, t)) * (RAMPA_DOSE.length - 1);
  const i = Math.min(RAMPA_DOSE.length - 2, Math.floor(u));
  const f = u - i;
  const c = RAMPA_DOSE[i].map((v, k) => Math.round(v + (RAMPA_DOSE[i + 1][k] - v) * f));
  return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`;
}
