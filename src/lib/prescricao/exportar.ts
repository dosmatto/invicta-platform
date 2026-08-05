'use client';

// Exportação e VALIDAÇÃO das Prescrições — SHP (.zip), Excel e PDF.
//
// Reusa a infraestrutura das Zonas de Manejo: shpFiles (DBF latin1 + .cpg
// ISO-8859-1 — ver exportZonas.ts), capturarMapaZonas (mapa p/ o PDF) e o
// padrão visual dos relatórios (NAVY/GRAY/LINE, logos, rodapé).
//
// Validação SEMPRE antes de gerar: arquivo de aplicação errado vira dose errada
// no campo. Erros bloqueiam; avisos aparecem mas deixam seguir.

import type { jsPDF as JsPDF } from 'jspdf';
import area from '@turf/area';
import { shpFiles, baixarBlob, validarParaExport } from '../exportZonas';
import { capturarMapaZonas } from '../capturaMapa';
import { imagemParaPdf, reduzirLogo } from '../pdfImagem';
import { resumoDoses, nutrientesPorZona, fatorBaseDose } from './calculo.ts';
import { doseCompensada } from './sementes.ts';
import { UNIDADE_TOTAL, ehUnidadeSemente, type Prescricao } from './tipos.ts';

// Fator unidade-dose → unidade-base da prescrição (1 exceto sementes/m, que usa
// o espaçamento salvo nos parâmetros da semente). Nunca lança na exportação —
// a validação já barrou sementes/m sem espaçamento; aqui cai em 1 defensivo.
function fatorDe(p: Prescricao): number {
  try { return fatorBaseDose(p.unidade, p.params.sementes?.espacamentoM); } catch { return 1; }
}

// Dose do ARQUIVO: quando a prescrição foi feita em população desejada, o que
// a máquina precisa é a taxa de semeadura — a dose compensada pela germinação.
// Sem isso o arquivo sai com a população e a lavoura nasce abaixo do alvo.
const doseArquivo = (p: Prescricao, dose: number): number =>
  doseCompensada(dose, p.params.sementes, p.params.doseEhPopulacao);

/** true quando o arquivo leva um número diferente do digitado (há compensação). */
export function temCompensacao(p: Prescricao): boolean {
  return !!p.params.doseEhPopulacao && Math.abs(doseArquivo(p, 1) - 1) > 1e-9;
}

// Quanto de produto o arquivo consome de fato. Com compensação, o resumo conta
// em POPULAÇÃO (a base do total disponível) e o depósito entrega SEMENTES — o
// número que o comprador precisa é este.
export function totalDoArquivo(p: Prescricao, fator: number): number {
  return p.zonas.reduce((s, z) => s + doseArquivo(p, z.dose) * z.areaHa * fator, 0);
}

const NAVY: [number, number, number] = [13, 33, 64];
const GRAY: [number, number, number] = [100, 116, 139];
const LINE: [number, number, number] = [210, 219, 232];
const fmt = (v: number, d = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmt0 = (v: number) => Math.round(v).toLocaleString('pt-BR');
const san = (s: string | null | undefined): string => (s ?? '').replace(/[^\x00-\xFF]/g, '');

// ── Validação pré-exportação ────────────────────────────────────────────────
//
// Três níveis, e a diferença entre eles é o que decide se o trabalho anda:
//   erros     — o arquivo sairia QUEBRADO (geometria inválida, dose NaN). Não
//               há decisão a tomar: bloqueia.
//   ressalvas — o arquivo sai CERTO, mas a conta não fecha com o que você
//               declarou ter (estoque insuficiente). É decisão agronômica —
//               pergunta e deixa seguir.
//   avisos    — informação; não interrompe nada.
//
// O estoque insuficiente já foi erro puro. Travava a exportação de prescrições
// legítimas: com dose mín/máx apertadas, a distribuição quase nunca fecha exata
// no total, e o agrônomo ficava sem PDF, sem Excel e sem SHP por causa de uma
// sobra de 0,5%. Quem decide se compra mais um saco é ele — não a validação.
export interface ValidacaoPrescricao { erros: string[]; ressalvas: string[]; avisos: string[] }

export function validarPrescricao(p: Prescricao): ValidacaoPrescricao {
  const erros: string[] = [];
  const ressalvas: string[] = [];
  const avisos: string[] = [];
  const geo = validarParaExport(p.fc);
  if (geo) erros.push(`Geometria: ${geo}`);
  if (p.zonas.length === 0) erros.push('A prescrição não tem zonas.');
  const semDose = p.zonas.filter(z => !Number.isFinite(z.dose) || z.dose < 0);
  if (semDose.length) erros.push(`Zona(s) sem dose válida: ${semDose.map(z => z.nomeZona).join(', ')}.`);
  if (p.unidade === 'sementes/m' && !(p.params.sementes?.espacamentoM)) {
    erros.push('Dose em sementes/m sem o espaçamento entre linhas — sem ele o total não fecha.');
  }
  const min = p.params.doseMin, max = p.params.doseMax;
  const fora = p.zonas.filter(z => (min != null && z.dose < min - 1e-9) || (max != null && z.dose > max + 1e-9));
  if (fora.length) avisos.push(`Dose fora dos limites definidos em: ${fora.map(z => `${z.nomeZona} (${fmt(z.dose, 2)})`).join(', ')}.`);
  const r = resumoDoses(p.zonas, undefined, fatorDe(p));
  if (p.params.totalDisponivel != null && r.usado > p.params.totalDisponivel + 1e-6) {
    const falta = r.usado - p.params.totalDisponivel;
    const un0 = UNIDADE_TOTAL[p.unidade];
    // Total informado POR HECTARE é uma META agronômica (80.000/ha), não um
    // estoque comprado: os limites de dose mín/máx quase sempre a fazem sobrar
    // ou faltar um pouco, e travar a exportação por isso impede o trabalho.
    // Estoque FÍSICO continua bloqueando — dali não se tira o que não existe.
    const msg = `a prescrição usa ${fmt(r.usado, 1)} ${un0} e o disponível é ${fmt(p.params.totalDisponivel, 1)} (${fmt(falta, 1)} a mais).`;
    if (p.params.totalPorHa) avisos.push(`Acima da meta: ${msg} Os limites de dose mín/máx não deixaram fechar exato.`);
    else ressalvas.push(`Estoque insuficiente: ${msg} Confira antes de mandar para o campo — pode faltar produto.`);
  }
  const pequenos = p.zonas.filter(z => z.areaHa > 0 && z.areaHa < 0.05);
  if (pequenos.length) avisos.push(`Polígono(s) muito pequeno(s) (<0,05 ha) — a máquina pode ignorar: ${pequenos.map(z => z.nomeZona).join(', ')}.`);
  // dose uniforme não é erro, mas taxa variável com 1 dose só costuma ser engano
  if (p.zonas.length > 1 && r.doseMax - r.doseMin < 1e-9) avisos.push('Todas as zonas com a MESMA dose — a aplicação não será variável.');
  return { erros, ressalvas, avisos };
}

// ── FeatureCollection da prescrição (dose por polígono) ─────────────────────
// Campos com nome ≤ 10 chars (limite do DBF do Shapefile).
export function fcPrescricao(p: Prescricao): GeoJSON.FeatureCollection {
  const porId = new Map(p.zonas.map(z => [z.idZona, z]));
  const features: GeoJSON.Feature[] = [];
  for (const f of p.fc.features) {
    const id = String((f.properties as { id?: string } | null)?.id ?? '');
    const z = porId.get(id);
    if (!z || !f.geometry) continue;
    features.push({
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        zona: san(z.nomeZona),
        classe: san(z.classe),
        dose: Math.round(doseArquivo(p, z.dose) * 1000) / 1000,
        unidade: p.unidade,
        // população-alvo fica no arquivo quando a dose foi compensada: é o que
        // o agrônomo pediu, e sem ela ninguém confere a taxa lá na frente.
        ...(p.params.doseEhPopulacao ? { pop_alvo: Math.round(z.dose) } : {}),
        produto: san(p.produto).slice(0, 60),
        area_ha: Math.round(z.areaHa * 100) / 100,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

const nomeBase = (p: Prescricao) =>
  `prescricao_${p.produto || p.tipo}_${p.nome}`.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').slice(0, 60);

// ── SHP (.zip) ──────────────────────────────────────────────────────────────
export async function exportarSHPPrescricao(p: Prescricao): Promise<string> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const files = await shpFiles(fcPrescricao(p), 'polygon');
  for (const ext of ['.shp', '.shx', '.dbf', '.prj']) if (files[ext]) zip.file(`prescricao${ext}`, files[ext]);
  zip.file('prescricao.cpg', new TextEncoder().encode('ISO-8859-1'));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const nome = `${nomeBase(p)}.zip`;
  baixarBlob(blob, nome);
  return nome;
}

// ── Excel ───────────────────────────────────────────────────────────────────
export async function exportarXlsxPrescricao(p: Prescricao): Promise<string> {
  const XLSX = await import('xlsx');
  const fator = fatorDe(p);
  const r = resumoDoses(p.zonas, p.custoUnit, fator);
  const un = UNIDADE_TOTAL[p.unidade];
  const teores = p.tipo === 'organico' ? p.params.organico : undefined;
  const nutri = teores ? nutrientesPorZona(p.zonas.map(z => ({ id: z.idZona, areaHa: z.areaHa, dose: z.dose })), teores) : null;
  const linhas = p.zonas.map(z => ({
    Zona: z.nomeZona,
    Classe: z.classe,
    'Área (ha)': Number(z.areaHa.toFixed(2)),
    ...(p.params.doseEhPopulacao
      ? {
          'População alvo (plantas/ha)': Number(z.dose.toFixed(0)),
          [`Dose do arquivo (${p.unidade})`]: Number(doseArquivo(p, z.dose).toFixed(3)),
        }
      : { [`Dose (${p.unidade})`]: Number(z.dose.toFixed(3)) }),
    [`Total (${un})`]: Number((doseArquivo(p, z.dose) * z.areaHa * fator).toFixed(2)),
    ...(nutri ? {
      'N (kg/ha)': Number(nutri[z.idZona].n.toFixed(1)),
      'P2O5 (kg/ha)': Number(nutri[z.idZona].p2o5.toFixed(1)),
      'K2O (kg/ha)': Number(nutri[z.idZona].k2o.toFixed(1)),
      'Ca (kg/ha)': Number(nutri[z.idZona].ca.toFixed(1)),
      'Mg (kg/ha)': Number(nutri[z.idZona].mg.toFixed(1)),
    } : {}),
  }));
  const resumo = [
    { Item: 'Produto', Valor: p.produto },
    { Item: 'Tipo', Valor: p.tipo },
    { Item: 'Área total (ha)', Valor: Number(r.areaHa.toFixed(2)) },
    { Item: `Quantidade usada (${un})`, Valor: Number(r.usado.toFixed(2)) },
    ...(p.params.totalDisponivel != null ? [
      { Item: `Disponível (${un})`, Valor: p.params.totalDisponivel },
      { Item: `Restante (${un})`, Valor: Number((p.params.totalDisponivel - r.usado).toFixed(2)) },
    ] : []),
    { Item: `Dose mínima (${p.unidade})`, Valor: Number(r.doseMin.toFixed(3)) },
    { Item: `Dose máxima (${p.unidade})`, Valor: Number(r.doseMax.toFixed(3)) },
    { Item: `Dose média (${p.unidade})`, Valor: Number(r.doseMedia.toFixed(3)) },
    ...(temCompensacao(p) ? [
      { Item: `No arquivo — total (${un})`, Valor: Number(totalDoArquivo(p, fator).toFixed(2)) },
      { Item: 'Germinação (%)', Valor: p.params.sementes?.germinacaoPct ?? 100 },
    ] : []),
    ...(r.custo != null ? [{ Item: 'Custo (R$)', Valor: Number(r.custo.toFixed(2)) }] : []),
    { Item: 'Zonas', Valor: r.nZonas },
    { Item: 'Polígonos', Valor: p.fc.features.length },
    { Item: 'Versão', Valor: p.versao },
    { Item: 'Responsável', Valor: p.criadoPor },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), 'Doses por zona');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), 'Resumo');
  const nome = `${nomeBase(p)}.xlsx`;
  XLSX.writeFile(wb, nome);
  return nome;
}

// ── PDF ─────────────────────────────────────────────────────────────────────
// Cor por DOSE (rampa verde clara→escura): mapa de prescrição se lê pela dose,
// não pela classe da zona de origem.
export function corDaDose(dose: number, doseMin: number, doseMax: number): string {
  const t = doseMax - doseMin < 1e-9 ? 0.5 : (dose - doseMin) / (doseMax - doseMin);
  const de = [199, 233, 192], ate = [0, 90, 50];   // verdes (ColorBrewer)
  const c = de.map((v, i) => Math.round(v + (ate[i] - v) * t));
  return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

function boundsDe(fc: GeoJSON.FeatureCollection): [number, number, number, number] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const varrer = (coords: GeoJSON.Position[]) => { for (const [x, y] of coords) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; } };
  for (const f of fc.features) {
    const g = f.geometry;
    if (g?.type === 'Polygon') g.coordinates.forEach(varrer);
    else if (g?.type === 'MultiPolygon') g.coordinates.forEach(pp => pp.forEach(varrer));
  }
  if (!isFinite(w)) return [-0.001, -0.001, 0.001, 0.001];
  return [w, s, e, n];
}

function carregarImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => res(img); img.onerror = () => rej(new Error(`falha ao carregar ${src}`)); img.src = src;
  });
}

export interface IdentPdfPrescricao {
  produtor: string; fazenda: string; talhao: string; municipio?: string; estado?: string;
  logoClienteUrl?: string | null;
}

export async function exportarPDFPrescricao(p: Prescricao, ident: IdentPdfPrescricao): Promise<string> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }) as JsPDF;
  const W = 297, H = 210, M = 6;

  const inv = await carregarImg('/images/logo-colorida.png').catch(() => null);
  const branca = await carregarImg('/images/logo-branca.png').catch(() => null);
  const cliRaw = ident.logoClienteUrl ? await carregarImg(ident.logoClienteUrl).catch(() => null) : null;
  const cli = cliRaw ? await reduzirLogo(cliRaw) : null;

  const fator = fatorDe(p);
  const r = resumoDoses(p.zonas, p.custoUnit, fator);
  const un = UNIDADE_TOTAL[p.unidade];
  const fc = fcPrescricao(p);
  const porId = new Map(p.zonas.map(z => [z.idZona, z]));

  // mapa colorido pela dose, rótulo = dose
  const zonasMapa = p.fc.features.flatMap(f => {
    const id = String((f.properties as { id?: string } | null)?.id ?? '');
    const z = porId.get(id);
    if (!z || !f.geometry || (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon')) return [];
    return [{
      geometry: f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon,
      cor: corDaDose(z.dose, r.doseMin, r.doseMax),
      rotulo: fmt(doseArquivo(p, z.dose), ehUnidadeSemente(p.unidade) ? (p.unidade === 'sementes/m' ? 1 : 0) : 1),
    }];
  });
  let mapaPng = '';
  try {
    mapaPng = await capturarMapaZonas({
      bounds: boundsDe(fc), externo: null, zonas: zonasMapa, linhas: [],
      satelite: true, larguraPx: 1200, alturaPx: 860, preencherAlpha: 0.75,
    });
  } catch { /* sem mapa (offline p.ex.) → PDF sai só com a tabela */ }

  // ── cabeçalho ──
  if (inv) { const h = 10, w = h * (inv.naturalWidth / inv.naturalHeight); doc.addImage(inv, 'PNG', M, 5, w, h); }
  if (cli) { const h = 10, w = h * (cli.naturalWidth / cli.naturalHeight); doc.addImage(cli, 'PNG', W - M - w, 5, w, h); }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...NAVY);
  doc.text('PRESCRIÇÃO AGRONÔMICA — TAXA VARIÁVEL', W / 2, 11, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAY);
  doc.text(san(`${p.produto} · ${p.nome}`), W / 2, 16, { align: 'center' });
  doc.setFontSize(7.5); doc.setTextColor(...NAVY);
  doc.text(san([
    `Produtor: ${ident.produtor || '—'}`, `Fazenda: ${ident.fazenda || '—'}`, `Talhao: ${ident.talhao || '—'}`,
    `Ano: ${p.ano || '—'}`, `Versao: ${p.versao}`, `Responsavel: ${p.criadoPor}`,
    `Emissao: ${new Date().toLocaleDateString('pt-BR')}`,
  ].join('   |   ')), W / 2, 21.5, { align: 'center', maxWidth: W - 2 * M });
  doc.setDrawColor(...LINE); doc.setLineWidth(0.4); doc.line(M, 24, W - M, 24);

  // ── mapa (esquerda) ──
  const mapX = M, mapY = 28, mapW = 168, mapH = 118;
  if (mapaPng) {
    const img = await imagemParaPdf(mapaPng, mapW);
    doc.addImage(img.data, img.formato, mapX, mapY, mapW, mapH);
    doc.setDrawColor(...LINE); doc.rect(mapX, mapY, mapW, mapH, 'S');
  } else {
    doc.setDrawColor(...LINE); doc.rect(mapX, mapY, mapW, mapH, 'S');
    doc.setFontSize(9); doc.setTextColor(...GRAY);
    doc.text('(mapa indisponível — gere novamente com internet)', mapX + mapW / 2, mapY + mapH / 2, { align: 'center' });
  }
  // legenda da rampa
  const lgY = mapY + mapH + 5;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...NAVY);
  doc.text(`Dose (${p.unidade})`, mapX, lgY);
  const lgW = 60, lgH = 4, passos = 24;
  for (let i = 0; i < passos; i++) {
    const cor = corDaDose(r.doseMin + (i / (passos - 1)) * (r.doseMax - r.doseMin), r.doseMin, r.doseMax);
    const m = /^#(..)(..)(..)$/.exec(cor)!;
    doc.setFillColor(parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16));
    doc.rect(mapX + (i * lgW) / passos, lgY + 2, lgW / passos + 0.1, lgH, 'F');
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...GRAY);
  doc.text(fmt(r.doseMin, 1), mapX, lgY + 10);
  doc.text(fmt(r.doseMax, 1), mapX + lgW, lgY + 10, { align: 'right' });

  // ── tabela de doses (direita) ──
  const tabX = mapX + mapW + 6, tabW = W - M - tabX;
  let ty = 30;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...NAVY);
  doc.text('DOSES POR ZONA', tabX, ty); ty += 4;
  doc.setFontSize(7);
  const comp = temCompensacao(p);
  const cols = [tabX, tabX + 26, tabX + 52, tabX + 74, tabX + tabW];
  doc.text('Zona', cols[0], ty); doc.text('Área (ha)', cols[1], ty);
  doc.text(comp ? `Pop. → dose (${p.unidade})` : `Dose (${p.unidade})`, cols[2], ty);
  doc.text(`Total (${un})`, cols[3], ty);
  ty += 1.5; doc.setDrawColor(...LINE); doc.line(tabX, ty, tabX + tabW, ty); ty += 3.5;
  doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 50, 70);
  const zonasOrd = [...p.zonas].sort((a, b) => b.dose - a.dose);
  for (const z of zonasOrd.slice(0, 18)) {
    const m = /^#(..)(..)(..)$/.exec(corDaDose(z.dose, r.doseMin, r.doseMax))!;
    doc.setFillColor(parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16));
    doc.rect(cols[0], ty - 2.4, 2.6, 2.6, 'F');
    doc.text(san(z.nomeZona).slice(0, 14), cols[0] + 4, ty);
    doc.text(fmt(z.areaHa, 2), cols[1] + 14, ty, { align: 'right' });
    const dArq = doseArquivo(p, z.dose);
    const txtDose = p.unidade === 'sementes/ha' ? fmt0(dArq) : fmt(dArq, 2);
    doc.text(comp ? `${fmt0(z.dose)} → ${txtDose}` : txtDose, cols[2] + 16, ty, { align: 'right' });
    doc.text(ehUnidadeSemente(p.unidade) ? fmt0(dArq * z.areaHa * fator) : fmt(dArq * z.areaHa * fator, 1), cols[3] + 18, ty, { align: 'right' });
    ty += 4.2;
  }
  if (p.zonas.length > 18) { doc.setTextColor(...GRAY); doc.text(`… +${p.zonas.length - 18} zonas (planilha completa no Excel)`, tabX, ty); ty += 4.2; }

  // ── resumo ──
  ty += 2;
  doc.setDrawColor(...LINE); doc.roundedRect(tabX, ty, tabW, temCompensacao(p) ? 47 : 42, 2, 2, 'S');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...NAVY); doc.text('RESUMO', tabX + 4, ty + 5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
  const linhasResumo = [
    `Área: ${fmt(r.areaHa, 2)} ha em ${r.nZonas} zona(s) · ${fc.features.length} polígono(s)`,
    `Quantidade usada: ${ehUnidadeSemente(p.unidade) ? fmt0(r.usado) : fmt(r.usado, 1)} ${un}`,
    ...(p.params.totalDisponivel != null
      ? [`Disponível: ${ehUnidadeSemente(p.unidade) ? fmt0(p.params.totalDisponivel) : fmt(p.params.totalDisponivel, 1)} ${un} · restante: ${ehUnidadeSemente(p.unidade) ? fmt0(p.params.totalDisponivel - r.usado) : fmt(p.params.totalDisponivel - r.usado, 1)} ${un}`]
      : []),
    `Dose: mín ${fmt(r.doseMin, 1)} · máx ${fmt(r.doseMax, 1)} · média ${fmt(r.doseMedia, 1)} ${p.unidade}`,
    // Com compensação, o resumo acima é a POPULAÇÃO pedida; quem carrega a
    // máquina precisa saber quanta semente sai de fato.
    ...(temCompensacao(p)
      ? [`No arquivo (germinação ${fmt(p.params.sementes?.germinacaoPct ?? 100, 0)}%): ${fmt0(totalDoArquivo(p, fator))} ${un} · ${fmt0(totalDoArquivo(p, fator) / (r.areaHa || 1))} ${un}/ha`]
      : []),
    ...(r.custo != null ? [`Custo estimado: R$ ${fmt(r.custo, 2)}`] : []),
  ];
  linhasResumo.forEach((tl, i) => doc.text(san(tl), tabX + 4, ty + 10 + i * 4.4, { maxWidth: tabW - 8 }));

  // ── rodapé ──
  doc.setFillColor(...NAVY); doc.rect(0, H - 10, W, 10, 'F');
  if (branca) { const h = 5, w = h * (branca.naturalWidth / branca.naturalHeight); doc.addImage(branca, 'PNG', M, H - 7.5, w, h); }
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
  doc.text('INVICTA AP   |   Tecnologia que transforma dados em produtividade.', M + 26, H - 3.8);
  doc.setFont('helvetica', 'bold'); doc.text('www.invicta.agr.br', W - M, H - 3.8, { align: 'right' });

  const nome = `${nomeBase(p)}.pdf`;
  doc.save(nome);
  return nome;
}

// Área geodésica de um feature (ha) — para montar ZonaDose de um zoneamento
// quando a property areaHa não veio preenchida.
export function areaHaDe(f: GeoJSON.Feature): number {
  const props = (f.properties ?? {}) as { areaHa?: number };
  if (typeof props.areaHa === 'number' && props.areaHa > 0) return props.areaHa;
  try { return area(f) / 10_000; } catch { return 0; }
}
