'use client';

// RESUMO GERAL das recomendações marcadas — COLETA + PDF + EXCEL.
//
// O núcleo (matriz, subtotais, índice recomendação→talhões) mora no módulo puro
// resumoGeral.ts; aqui só entra o que precisa de nuvem, jsPDF e xlsx.
//
// Duas decisões que sustentam o multi-ano:
//   1) UMA consulta por talhão (listarCenarios sem safra) e filtro em memória —
//      não uma por talhão POR ANO;
//   2) `hidratarRotulos` no lugar de `descomprimirCenario`: o resumo não desenha
//      mapa nenhum, então descomprimir o grid de cada dose de cada talhão de
//      cada ano seria pagar caro por um dado que não é usado.

import type { jsPDF as JsPDF } from 'jspdf';
import { listarCenarios, hidratarRotulos, rotulosAtuaisDasEquacoes, type Cenario } from './cenarios';
import {
  achatarDoses, construirNumDe, chaveProduto, ordenarTalhoesAlfa, abrirOuBaixar,
  cabecalhoNavy, rodapeNavy, cabTabela, linhaTabela, fmt, san, GREEN, NAVY,
  type Col, type ItemDose,
} from './relatorioCenarios';
import { montarResumoGeral, produtosDe, planejarTabela, nomeArquivoResumo, LARG_MIN_PRODUTO_MM, type Lancamento, type ResumoGeral } from './resumoGeral';
import { anoDaSafra } from '../periodo';

export interface TalhaoAlvo { id: string; nome: string; areaHa: number; fazenda: string }

export interface IdentResumo {
  escopo: 'fazenda' | 'produtor';
  produtor: string;
  fazenda?: string;            // só no escopo fazenda
  siglaFazenda?: string | null;
  nFazendas?: number;          // só no escopo produtor
}

/** Rótulo da recomendação: "03 - Calcário Zona" (sem número, só o nome). */
export const rotuloRecomendacao = (it: ItemDose): string =>
  (it.numero < 1e9 ? String(it.numero).padStart(2, '0') + ' - ' : '') + it.d.nomeEquacao;

// ── Coleta ──────────────────────────────────────────────────────────────────

export interface OpcoesColeta {
  onProgresso?: (feito: number, total: number, nome: string) => void;
  cancelado?: () => boolean;
}

/**
 * Achata em LANÇAMENTOS todas as doses marcadas dos talhões, nas safras pedidas.
 * Sequencial de propósito: no escopo do produtor são dezenas de talhões, e uma
 * rajada de consultas simultâneas à nuvem só troca espera por erro de limite.
 */
export async function coletarLancamentos(
  talhoes: TalhaoAlvo[], safras: string[], opts: OpcoesColeta = {},
): Promise<Lancamento[]> {
  const alvo = new Set(safras);
  const numDe = construirNumDe();
  const rotulos = rotulosAtuaisDasEquacoes();   // Biblioteca lida UMA vez
  const ordenados = ordenarTalhoesAlfa(talhoes);
  const out: Lancamento[] = [];

  for (let i = 0; i < ordenados.length; i++) {
    if (opts.cancelado?.()) return out;
    const t = ordenados[i];
    opts.onProgresso?.(i, ordenados.length, t.nome);
    const cens = await listarCenarios(t.id).catch(() => [] as Cenario[]);
    const doAno = cens.filter(c => alvo.has(c.safra)).map(c => hidratarRotulos(c, rotulos));
    for (const it of achatarDoses(doAno, numDe, true)) {
      const ano = anoDaSafra(it.cen.safra);
      if (ano == null) continue;
      out.push({
        fazenda: t.fazenda, talhaoId: t.id, talhao: t.nome, areaHa: t.areaHa ?? 0,
        ano, safra: it.cen.safra, numero: it.numero,
        rotulo: rotuloRecomendacao(it), produto: chaveProduto(it.d),
        toneladas: it.d.toneladas ?? 0, custo: it.d.custo ?? 0,
      });
    }
  }
  opts.onProgresso?.(ordenados.length, ordenados.length, '');
  return out;
}

/** Produtos disponíveis para a tela montar os checkboxes. */
export const produtosDisponiveis = produtosDe;

// ── PDF ─────────────────────────────────────────────────────────────────────

const W = 297, H = 210, M = 6;
const UTIL = W - 2 * M;
const num = (v: number | undefined) => (v == null ? '' : fmt(v, 1));

// Largura das colunas FIXAS da matriz (as que se repetem em todo grupo).
const fixasDe = (escopo: 'fazenda' | 'produtor') => (escopo === 'produtor' ? 30 : 0) + 28 + 15 + 26;

function colunasDe(escopo: 'fazenda' | 'produtor', grupo: string[], wProduto: number): Col[] {
  const cols: Col[] = [];
  if (escopo === 'produtor') cols.push({ titulo: 'Fazenda', w: 30 });
  cols.push({ titulo: 'Talhão', w: 28 }, { titulo: 'Área (ha)', w: 15, align: 'r' });
  for (const p of grupo) cols.push({ titulo: `${p} (t)`, w: Math.max(LARG_MIN_PRODUTO_MM, wProduto), align: 'r' });
  cols.push({ titulo: 'Invest. (R$)', w: 26, align: 'r' });
  return cols;
}

export function montarPdfResumoGeral(
  doc: JsPDF, r: ResumoGeral, ident: IdentResumo, logo: HTMLImageElement | null,
): void {
  const anosTxt = r.anos.map(a => a.ano).join(', ') || '—';
  const campos: [string, string][] = ident.escopo === 'fazenda'
    ? [['FAZENDA', ident.fazenda ?? ''], ['PRODUTOR', ident.produtor], ['ANOS', anosTxt],
       ['TALHÕES', String(r.totalGeral.nTalhoes)], ['ÁREA', `${fmt(r.totalGeral.areaHa, 1)} ha`], ['DATA', new Date().toLocaleDateString('pt-BR')]]
    : [['PRODUTOR', ident.produtor], ['FAZENDAS', String(ident.nFazendas ?? 0)], ['ANOS', anosTxt],
       ['TALHÕES', String(r.totalGeral.nTalhoes)], ['ÁREA', `${fmt(r.totalGeral.areaHa, 1)} ha`], ['DATA', new Date().toLocaleDateString('pt-BR')]];

  const cab = () => cabecalhoNavy(doc, logo, campos) + 3;
  let y = cab();
  doc.setFontSize(12); doc.setTextColor(...GREEN); doc.setFont('helvetica', 'bold');
  doc.text('Resumo geral das recomendações marcadas', M, y);
  y += 6;

  const espaco = (precisa: number) => { if (y + precisa > H - 14) { doc.addPage(); y = cab() + 4; } };
  const plano = planejarTabela(r.produtos, fixasDe(ident.escopo), UTIL);
  const cel = (linha: { porProduto: Record<string, number> }, p: string) => num(linha.porProduto[p]);

  // Desenha cabeçalho + linhas REPETINDO o cabeçalho a cada quebra de página:
  // uma tabela de 40 talhões vira 2 folhas, e a segunda sem cabeçalho é uma
  // parede de números sem nome de coluna.
  const tabela = (cols: Col[], linhas: Array<{ cels: string[]; destaque?: boolean; fs?: number }>) => {
    y = cabTabela(doc, M, y, cols);
    for (const l of linhas) {
      if (y + 6 > H - 14) { doc.addPage(); y = cab() + 4; y = cabTabela(doc, M, y, cols); }
      y = linhaTabela(doc, M, y, cols, l.cels,
        l.destaque ? { bold: true, cor: GREEN, fill: true } : (l.fs ? { fontSize: l.fs } : undefined));
    }
  };

  for (const bloco of r.anos) {
    for (const grupo of plano.grupos) {
      const cols = colunasDe(ident.escopo, grupo, plano.wProduto);
      espaco(24);
      doc.setFontSize(9.5); doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold');
      const parte = r.produtos.length > grupo.length ? `  (produtos ${r.produtos.indexOf(grupo[0]) + 1} a ${r.produtos.indexOf(grupo[grupo.length - 1]) + 1})` : '';
      doc.text(san(`Ano ${bloco.ano}${bloco.safras.length ? ` · safra(s) ${bloco.safras.join(', ')}` : ''} · ${bloco.nTalhoes} talhão(ões) · ${fmt(bloco.areaHa, 1)} ha${parte}`), M, y);
      y += 4;
      const linhas: Array<{ cels: string[]; destaque?: boolean; fs?: number }> = bloco.linhas.map(l => ({
        cels: [...(ident.escopo === 'produtor' ? [l.fazenda] : []),
          l.talhao, fmt(l.areaHa, 1), ...grupo.map(p => cel(l, p)), fmt(l.custo, 2)],
      }));
      linhas.push({
        cels: [...(ident.escopo === 'produtor' ? [`TOTAL ${bloco.ano}`, ''] : [`TOTAL ${bloco.ano}`]),
          fmt(bloco.areaHa, 1), ...grupo.map(p => num(bloco.totalProduto[p])), fmt(bloco.totalCusto, 2)],
        destaque: true,
      });
      tabela(cols, linhas);
      y += 5;
    }
  }

  // Total geral — só quando há mais de um ano; com um ano só seria a mesma linha duas vezes.
  if (r.anos.length > 1) {
    for (const grupo of plano.grupos) {
      const cols = colunasDe(ident.escopo, grupo, plano.wProduto);
      espaco(16);
      doc.setFontSize(9.5); doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold');
      doc.text(san(`Total geral - ${r.anos.length} anos`), M, y); y += 4;
      const cels = ident.escopo === 'produtor' ? ['TOTAL GERAL', ''] : ['TOTAL GERAL'];
      cels.push(fmt(r.totalGeral.areaHa, 1), ...grupo.map(p => num(r.totalGeral.porProduto[p])), fmt(r.totalGeral.custo, 2));
      tabela(cols, [{ cels, destaque: true }]);
      y += 5;
    }
  }

  // ── Recomendações a enviar ──
  espaco(20);
  doc.setFontSize(11); doc.setTextColor(...GREEN); doc.setFont('helvetica', 'bold');
  doc.text('Recomendações a enviar', M, y); y += 5;
  // A coluna de 4 mm entre "Qtd" (alinhada à direita) e "Talhões" (à esquerda)
  // não é enfeite: sem ela o número encosta na primeira letra e sai "88,8IGEFI 01".
  const colsRec: Col[] = [
    { titulo: 'Ano', w: 14 }, { titulo: 'Recomendação', w: 72 }, { titulo: 'Produto', w: 38 },
    { titulo: 'Qtd (t)', w: 18, align: 'r' }, { titulo: '', w: 4 }, { titulo: 'Talhões', w: UTIL - 146 },
  ];
  tabela(colsRec, r.recomendacoes.map(rec => ({
    cels: [String(rec.ano), rec.rotulo, rec.produto, fmt(rec.toneladas, 1), '', rec.talhoes.join(', ')],
    fs: 7.4,
  })));

  const nPaginas = doc.getNumberOfPages();
  for (let p = 1; p <= nPaginas; p++) {
    doc.setPage(p);
    rodapeNavy(doc, logo, `Resumo geral de recomendações — página ${p}/${nPaginas}`);
  }
}

async function carregarLogoBranca(): Promise<HTMLImageElement | null> {
  return new Promise(res => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => res(img); img.onerror = () => res(null);
    img.src = '/images/logo-branca.png';
  });
}


export async function gerarResumoGeralPdf(r: ResumoGeral, ident: IdentResumo): Promise<void> {
  if (r.anos.length === 0) throw new Error('Nada a resumir: nenhuma recomendação marcada (★) nos anos e produtos escolhidos.');
  const aba = typeof window !== 'undefined' ? window.open('', '_blank') : null;
  if (aba) try { aba.document.write('<!doctype html><meta charset="utf-8"><title>Resumo geral</title><body style="font-family:system-ui,sans-serif;padding:28px;color:#334155"><p>Gerando o resumo geral das recomendações…</p></body>'); } catch { /* popup fechado */ }
  try {
    const logo = await carregarLogoBranca();
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true }) as JsPDF;
    montarPdfResumoGeral(doc, r, ident, logo);
    abrirOuBaixar(doc.output('blob'), aba, nomeArquivoResumo(r, ident) + '.pdf');
  } catch (e) {
    const msg = e instanceof Error ? (e.stack ?? e.message) : String(e);
    console.error('[resumo-geral] falha:', e);
    if (aba) { try { aba.document.body.innerHTML = `<h3 style="color:#b91c1c;font-family:system-ui">Falha ao gerar o resumo</h3><pre style="white-space:pre-wrap;font-size:12px">${msg.replace(/[<>&]/g, s => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[s]!))}</pre>`; } catch { /* aba fechada */ } }
    throw e;
  }
}

// ── Excel ───────────────────────────────────────────────────────────────────

const r1 = (x: number) => Math.round((x ?? 0) * 10) / 10;
const r2 = (x: number) => Math.round((x ?? 0) * 100) / 100;

export async function gerarResumoGeralExcel(r: ResumoGeral, ident: IdentResumo): Promise<void> {
  if (r.anos.length === 0) throw new Error('Nada a resumir: nenhuma recomendação marcada (★) nos anos e produtos escolhidos.');
  const comFazenda = ident.escopo === 'produtor';
  const cabecalho = [...(comFazenda ? ['FAZENDA'] : []), 'TALHÃO', 'ÁREA (ha)',
    ...r.produtos.map(p => `${p} (t)`), 'INVEST. (R$)'];

  const aoa: (string | number)[][] = [];
  for (const bloco of r.anos) {
    aoa.push([`ANO ${bloco.ano}${bloco.safras.length ? ` — safra(s) ${bloco.safras.join(', ')}` : ''}`]);
    aoa.push(cabecalho);
    for (const l of bloco.linhas) {
      aoa.push([
        ...(comFazenda ? [l.fazenda] : []), l.talhao, r1(l.areaHa),
        // Célula VAZIA quando o talhão não recebeu o produto: zero diria que a
        // conta deu zero, e não que não houve aplicação.
        ...r.produtos.map(p => (l.porProduto[p] == null ? '' : r1(l.porProduto[p]))),
        r2(l.custo),
      ]);
    }
    aoa.push([
      ...(comFazenda ? [''] : []), `TOTAL ${bloco.ano}`, r1(bloco.areaHa),
      ...r.produtos.map(p => (bloco.totalProduto[p] == null ? '' : r1(bloco.totalProduto[p]))),
      r2(bloco.totalCusto),
    ]);
    aoa.push([]);
  }
  if (r.anos.length > 1) {
    aoa.push([
      ...(comFazenda ? [''] : []), 'TOTAL GERAL', r1(r.totalGeral.areaHa),
      ...r.produtos.map(p => (r.totalGeral.porProduto[p] == null ? '' : r1(r.totalGeral.porProduto[p]))),
      r2(r.totalGeral.custo),
    ]);
  }

  const recs: (string | number)[][] = [['ANO', 'RECOMENDAÇÃO', 'PRODUTO', 'TALHÕES', 'Nº TALHÕES', 'QTD TOTAL (t)', 'INVEST. (R$)']];
  for (const rec of r.recomendacoes) {
    recs.push([rec.ano, rec.rotulo, rec.produto, rec.talhoes.join(', '), rec.talhoes.length, r1(rec.toneladas), r2(rec.custo)]);
  }

  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [...(comFazenda ? [{ wch: 20 }] : []), { wch: 18 }, { wch: 10 },
    ...r.produtos.map(() => ({ wch: 16 })), { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Resumo');
  const wsRec = XLSX.utils.aoa_to_sheet(recs);
  wsRec['!cols'] = [{ wch: 8 }, { wch: 40 }, { wch: 22 }, { wch: 60 }, { wch: 11 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsRec, 'Recomendações');
  XLSX.writeFile(wb, nomeArquivoResumo(r, ident) + '.xlsx');
}

/** Atalho usado pela tela: filtra os produtos e devolve o resumo pronto. */
export const resumoComFiltro = (lancs: Lancamento[], produtos: Iterable<string>) =>
  montarResumoGeral(lancs, produtos);
