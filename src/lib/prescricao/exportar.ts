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
import { doseArquivo, temCompensacao, totalDoArquivo, kgDeSementes, montarResumoPdf, fmtRel, arredRel, corDaDose } from './resumo.ts';
// A rampa de cor mora no módulo puro (testável em node); segue exportada daqui
// porque a tela de Prescrições já a importa deste arquivo.
export { corDaDose };
import { complementarNutriente, SIMBOLO_NUTRIENTE } from '../insumos';
import { fmtHa, arredHa, formatarColunaXlsx, formatarLinhaXlsx } from '../formato';
import { UNIDADE_TOTAL, ehUnidadeSemente, type Prescricao } from './tipos.ts';

// Fator unidade-dose → unidade-base da prescrição (1 exceto sementes/m, que usa
// o espaçamento salvo nos parâmetros da semente). Nunca lança na exportação —
// a validação já barrou sementes/m sem espaçamento; aqui cai em 1 defensivo.
function fatorDe(p: Prescricao): number {
  try { return fatorBaseDose(p.unidade, p.params.sementes?.espacamentoM); } catch { return 1; }
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
        dose: arredRel(doseArquivo(p, z.dose)),
        unidade: p.unidade,
        // população-alvo fica no arquivo quando a dose foi compensada: é o que
        // o agrônomo pediu, e sem ela ninguém confere a taxa lá na frente.
        ...(temCompensacao(p) ? { pop_alvo: Math.round(z.dose) } : {}),
        produto: san(p.produto).slice(0, 60),
        area_ha: arredHa(z.areaHa),
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
    'Área (ha)': arredHa(z.areaHa),
    ...(temCompensacao(p)
      ? {
          [`População (${p.unidade})`]: arredRel(z.dose),
          [`População ajustada (${p.unidade})`]: arredRel(doseArquivo(p, z.dose)),
        }
      : { [`Dose (${p.unidade})`]: arredRel(z.dose) }),
    [`Total (${un})`]: arredRel(doseArquivo(p, z.dose) * z.areaHa * fator),
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
    { Item: 'Área total (ha)', Valor: arredHa(r.areaHa) },
    { Item: `Quantidade usada (${un})`, Valor: arredRel(r.usado) },
    ...(p.params.totalDisponivel != null ? [
      { Item: `Disponível (${un})`, Valor: arredRel(p.params.totalDisponivel) },
      { Item: `Restante (${un})`, Valor: arredRel(p.params.totalDisponivel - r.usado) },
    ] : []),
    { Item: `Dose mínima (${p.unidade})`, Valor: arredRel(r.doseMin) },
    { Item: `Dose máxima (${p.unidade})`, Valor: arredRel(r.doseMax) },
    { Item: `Dose média (${p.unidade})`, Valor: arredRel(r.doseMedia) },
    // Os dois totais NOMEADOS + o peso, que é como se compra semente.
    ...(temCompensacao(p) ? (() => {
      const semAjuste = r.usado, comAjuste = totalDoArquivo(p, fator);
      const pms = p.params.sementes?.pmsG;
      const kg = (v: number) => { const k = kgDeSementes(v, pms); return k == null ? [] : [{ Item: `  em quilos (PMS ${pms} g)`, Valor: Number(k.toFixed(1)) }]; };
      return [
        { Item: 'Germinação (%)', Valor: p.params.sementes?.germinacaoPct ?? 100 },
        { Item: `Total SEM ajuste — população desejada (${un})`, Valor: Number(semAjuste.toFixed(0)) },
        ...kg(semAjuste),
        { Item: `Total COM ajuste de germinação (${un})`, Valor: Number(comAjuste.toFixed(0)) },
        ...kg(comAjuste),
        { Item: `Diferença a mais para comprar (${un})`, Valor: Number((comAjuste - semAjuste).toFixed(0)) },
        { Item: 'Observação', Valor: 'O arquivo de aplicação já sai com o ajuste de população (taxa de semeadura corrigida pela germinação).' },
      ];
    })() : (() => {
      const pms = p.params.sementes?.pmsG;
      const k = ehUnidadeSemente(p.unidade) ? kgDeSementes(r.usado, pms) : null;
      return k == null ? [] : [{ Item: `Quantidade usada em quilos (PMS ${pms} g)`, Valor: Number(k.toFixed(1)) }];
    })()),
    ...(r.custo != null ? [{ Item: 'Custo (R$)', Valor: arredRel(r.custo) }] : []),
    // Complementação por nutriente: a conta que justifica a dose.
    ...(p.modo === 'complemento' && p.params.complemento ? (() => {
      const c = p.params.complemento!;
      const sim = SIMBOLO_NUTRIENTE[c.nutriente] ?? c.nutriente;
      const res = complementarNutriente({
        metaKgHa: c.metaKgHa ?? 0, baseGarantiaPct: c.baseGarantiaPct ?? 0,
        baseDoseKgHa: c.baseDoseKgHa ?? 0, compGarantiaPct: c.compGarantiaPct ?? 0,
      });
      return [
        { Item: 'Nutriente de referência', Valor: sim },
        { Item: `Meta de ${sim} (kg/ha)`, Valor: Number((c.metaKgHa ?? 0).toFixed(2)) },
        { Item: 'Produto base', Valor: c.baseNome ?? '(nenhum)' },
        { Item: `Garantia do base (% ${sim})`, Valor: Number((c.baseGarantiaPct ?? 0).toFixed(2)) },
        { Item: 'Dose do base (kg/ha)', Valor: Number((c.baseDoseKgHa ?? 0).toFixed(2)) },
        { Item: `${sim} fornecido pelo base (kg/ha)`, Valor: Number(res.fornecidoKgHa.toFixed(2)) },
        { Item: `${sim} faltante (kg/ha)`, Valor: Number(res.faltanteKgHa.toFixed(2)) },
        { Item: 'Produto complementar', Valor: c.compNome ?? p.produto },
        { Item: `Garantia do complementar (% ${sim})`, Valor: Number((c.compGarantiaPct ?? 0).toFixed(2)) },
        { Item: 'Dose calculada do complementar (kg/ha)', Valor: Number(res.doseCompKgHa.toFixed(2)) },
      ];
    })() : []),
    { Item: 'Zonas', Valor: r.nZonas },
    { Item: 'Polígonos', Valor: p.fc.features.length },
    { Item: 'Versão', Valor: p.versao },
    { Item: 'Responsável', Valor: p.criadoPor },
  ];
  const wb = XLSX.utils.book_new();
  const wsDoses = XLSX.utils.json_to_sheet(linhas);
  const wsResumo = XLSX.utils.json_to_sheet(resumo);
  formatarColunaXlsx(XLSX, wsDoses, 'Área (ha)');
  formatarLinhaXlsx(XLSX, wsResumo, 'Área total (ha)');
  XLSX.utils.book_append_sheet(wb, wsDoses, 'Doses por zona');
  XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');
  const nome = `${nomeBase(p)}.xlsx`;
  XLSX.writeFile(wb, nome);
  return nome;
}

// ── PDF ─────────────────────────────────────────────────────────────────────
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
      rotulo: fmtRel(doseArquivo(p, z.dose)),
    }];
  });
  // Geometria da folha, num lugar só — o mapa é capturado NA PROPORÇÃO do
  // retângulo em que vai ser desenhado. jsPDF estica a imagem para o retângulo
  // dado: capturar 1200×860 e desenhar num quadro mais alto achataria o
  // satélite e as zonas junto.
  const mapX = M, mapY = 28, mapW = 168, mapH = 146;
  const FIM = H - 14;                       // fundo útil (rodapé começa em H-10)

  let mapaPng = '';
  try {
    mapaPng = await capturarMapaZonas({
      bounds: boundsDe(fc), externo: null, zonas: zonasMapa, linhas: [],
      satelite: true, larguraPx: 1200, alturaPx: Math.round((1200 * mapH) / mapW), preencherAlpha: 0.75,
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
  const lgW = 84, lgH = 4.5, passos = 48;
  for (let i = 0; i < passos; i++) {
    const cor = corDaDose(r.doseMin + (i / (passos - 1)) * (r.doseMax - r.doseMin), r.doseMin, r.doseMax);
    const m = /^#(..)(..)(..)$/.exec(cor)!;
    doc.setFillColor(parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16));
    doc.rect(mapX + (i * lgW) / passos, lgY + 2, lgW / passos + 0.1, lgH, 'F');
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...GRAY);
  doc.text(fmtRel(r.doseMin), mapX, lgY + 10);
  doc.text(fmtRel(r.doseMax), mapX + lgW, lgY + 10, { align: 'right' });
  doc.setFontSize(6.5); doc.text('menor dose', mapX, lgY + 13.5);
  doc.text('maior dose', mapX + lgW, lgY + 13.5, { align: 'right' });

  // ── tabela de doses (direita) ──
  const tabX = mapX + mapW + 6, tabW = W - M - tabX;
  const PAD = 5;                              // respiro interno do quadro RESUMO
  const utilResumo = tabW - PAD * 2;
  // O RESUMO é medido ANTES da tabela: ele fecha a coluna e não pode invadir o
  // rodapé, então é a altura dele que decide quantas zonas cabem na tabela.
  // Medido na MENOR fonte possível — é a reserva mínima; se sobrar espaço, o
  // quadro cresce e o texto respira (mais abaixo).
  const linhasResumo = montarResumoPdf(p, r, fator, fc.features.length);
  const quebrarResumo = (fs: number) => linhasResumo.map(l => {
    doc.setFont('helvetica', l.destaque ? 'bold' : 'normal'); doc.setFontSize(fs);
    return { destaque: l.destaque, partes: doc.splitTextToSize(san(l.txt), utilResumo) as string[] };
  });
  const FS_MIN = 7, FS_CAND = [9.5, 9, 8.5, 8, 7.5, FS_MIN];
  type Quebrada = { destaque?: boolean; partes: string[] };
  // Altura do quadro na fonte dada, com o espaçamento MÍNIMO entre itens: é
  // esta a conta que decide se a fonte cabe e quanto reservar para o quadro.
  const alturaResumo = (q: Quebrada[], fs: number) => {
    const n = q.reduce((a, l) => a + l.partes.length, 0);
    return 12 + n * fs * 0.52 + 0.8 * Math.max(0, q.length - 1) + 3;
  };
  const reservaResumo = alturaResumo(quebrarResumo(FS_MIN), FS_MIN);

  let ty = 30;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...NAVY);
  doc.text('DOSES POR ZONA', tabX, ty); ty += 4;
  // Colunas por posição de FIM (números alinhados à direita). O layout antigo
  // punha "Pop. -> dose (sementes/ha)" num vão de 22 mm com fonte 7: o título
  // invadia o da coluna seguinte e as duas frases saíam embaralhadas no PDF.
  // Com compensação são duas colunas de verdade — População e População
  // ajustada —, cabeçalho em duas linhas e fonte menor.
  const comp = temCompensacao(p);
  doc.setFontSize(6.2);
  const fimArea = tabX + (comp ? 40 : 52);
  const fimDose = tabX + (comp ? 64 : 82);
  const fimAjuste = tabX + 87;
  const fimTotal = tabX + tabW;
  const cab = (txt1: string, txt2: string, x: number) => {
    doc.text(txt1, x, ty, { align: 'right' });
    if (txt2) doc.text(txt2, x, ty + 2.7, { align: 'right' });
  };
  doc.text('Zona', tabX, ty);
  cab('Área', '(ha)', fimArea);
  if (comp) {
    cab('População', `(${p.unidade})`, fimDose);
    cab('População ajustada', `(${p.unidade})`, fimAjuste);
  } else {
    cab('Dose', `(${p.unidade})`, fimDose);
  }
  cab('Total', `(${un})`, fimTotal);
  ty += 4.2; doc.setDrawColor(...LINE); doc.line(tabX, ty, tabX + tabW, ty); ty += 4;
  doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 50, 70); doc.setFontSize(7.4);
  const zonasOrd = [...p.zonas].sort((a, b) => b.dose - a.dose);
  // Quantas linhas cabem sem empurrar o RESUMO para cima do rodapé. Antes eram
  // 18 fixas com a folha vazia embaixo; agora a tabela usa o espaço que existe.
  const passoLin = 5;
  const cabem = Math.max(4, Math.floor((FIM - reservaResumo - 3 - ty) / passoLin));
  const mostradas = zonasOrd.slice(0, cabem);
  for (const z of mostradas) {
    const m = /^#(..)(..)(..)$/.exec(corDaDose(z.dose, r.doseMin, r.doseMax))!;
    doc.setFillColor(parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16));
    doc.rect(tabX, ty - 2.5, 2.8, 2.8, 'F');
    doc.text(san(z.nomeZona).slice(0, 12), tabX + 4.4, ty);
    doc.text(fmtHa(z.areaHa), fimArea, ty, { align: 'right' });
    const dArq = doseArquivo(p, z.dose);
    doc.text(fmtRel(z.dose), fimDose, ty, { align: 'right' });
    if (comp) doc.text(fmtRel(dArq), fimAjuste, ty, { align: 'right' });
    doc.text(fmtRel(dArq * z.areaHa * fator), fimTotal, ty, { align: 'right' });
    ty += passoLin;
  }
  const ocultas = p.zonas.length - mostradas.length;
  if (ocultas > 0) { doc.setTextColor(...GRAY); doc.setFontSize(6.8); doc.text(`… +${ocultas} zona(s) — planilha completa no Excel`, tabX, ty); ty += passoLin; }

  // ── resumo ──
  // Antes era uma pilha de números sem dizer qual é qual: "quantidade usada",
  // "disponível" e "no arquivo" apareciam lado a lado, uns em população e
  // outros em semente, e ninguém sabia o que comprar. Agora as duas contas
  // aparecem NOMEADAS — o que você pediu e o que a máquina vai plantar —, em
  // sementes e (com PMS) em quilos, e a última linha diz que o arquivo já sai
  // ajustado, que é a dúvida que sobra na hora de mandar para o campo.
  ty += 3;
  // O quadro DESCE ATÉ O RODAPÉ: a folha terminava com um palmo de branco
  // embaixo dos dois lados, e o resumo — que é o texto que o agrônomo lê —
  // ficava espremido em fonte 7,5 no alto da coluna. Agora o espaço disponível
  // escolhe a fonte (a maior que couber) e distribui as entrelinhas dentro da
  // moldura, em vez de sobrar folha.
  //
  // A largura útil é medida na MESMA fonte em que o texto é desenhado — negrito
  // ocupa mais, então as linhas de destaque são medidas em negrito, senão eram
  // justamente elas que vazavam da moldura.
  const alturaBox = Math.max(reservaResumo, FIM - ty);
  let fsResumo = FS_MIN;
  let quebradas = quebrarResumo(FS_MIN);
  for (const cand of FS_CAND) {
    const q = quebrarResumo(cand);
    if (alturaResumo(q, cand) <= alturaBox) { fsResumo = cand; quebradas = q; break; }
  }
  const nLinhas = quebradas.reduce((a, l) => a + l.partes.length, 0);
  // A folga que sobra vira ESPAÇO ENTRE OS ITENS, não entrelinha: uma frase que
  // quebrou em duas linhas continua sendo um parágrafo só (linhas juntas), e o
  // que separa "Área", "Dose" e "Produto base" é o respiro entre eles. Esticar a
  // entrelinha por igual espalharia a frase quebrada e ela deixaria de se ler
  // como uma coisa só.
  const lh = fsResumo * 0.52;
  const sobra = alturaBox - (12 + nLinhas * lh + 3);
  const gap = Math.max(0.8, Math.min(6, sobra / Math.max(1, quebradas.length - 1)));
  doc.setDrawColor(...LINE); doc.roundedRect(tabX, ty, tabW, alturaBox, 2, 2, 'S');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(fsResumo + 0.5); doc.setTextColor(...NAVY);
  doc.text('RESUMO', tabX + PAD, ty + 6);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(fsResumo); doc.setTextColor(...GRAY);
  let ry = ty + 11;
  for (const l of quebradas) {
    if (l.destaque) { doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); }
    for (const parte of l.partes) { doc.text(parte, tabX + PAD, ry); ry += lh; }
    if (l.destaque) { doc.setTextColor(...GRAY); doc.setFont('helvetica', 'normal'); }
    ry += gap;
  }

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
