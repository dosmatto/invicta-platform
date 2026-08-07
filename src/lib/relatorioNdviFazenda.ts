'use client';

// Relatório de SATÉLITE da FAZENDA inteira (todos os talhões num PDF só).
// Segue o padrão do relatório de recomendação da fazenda (relatorioCenarios.ts):
// coleta sequencial por talhão, erro de um talhão não derruba o relatório,
// ordem alfanumérica, e as páginas de mapa são as MESMAS do relatório do talhão
// (desenharPaginaMapaNdvi) — não há layout duplicado.
//
// O usuário escolhe ANO + ÍNDICE(s) + DATAS na tela da fazenda; aqui só geramos.

import type { jsPDF as JsPDF } from 'jspdf';
import { getTalhoes, getFazendas, getClientes, type Talhao } from './store';
import { extrairPoligono } from './fertilidade';
import { carregarGridNdvi } from './meap/gerar';
import { colorirGrid } from './raster';
import { rampaVisualStops, type Legenda } from './legendas';
import { rotuloAno } from './periodo';
import {
  carregarLogosNdvi, desenharPaginaMapaNdvi, desenharRodapeNdvi,
  type CtxNdvi, type MapaRelNdvi,
} from './relatorioNdvi';
import type { CamadaTalhao } from './fazendaRelatorios';
import { nomeExport } from './nomeExport';

const NAVY: [number, number, number] = [13, 33, 64];
const GRAY: [number, number, number] = [100, 116, 139];
const LINE: [number, number, number] = [210, 219, 232];
// Área: SEMPRE duas casas, inclusive o zero final (ver fmtHa em lib/formato).
const fmtHa = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtData = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('pt-BR');

export const ordenarAlfa = <T extends { nome?: string }>(arr: T[]): T[] =>
  [...arr].sort((a, b) => (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR', { numeric: true }));

export interface OpcoesRelNdviFazenda {
  fazendaId: string;
  ano: number;
  safraRotulo?: string;         // string de safra p/ o cabeçalho (ex.: "26/27"); default = o ano
  camadas: CamadaTalhao[];      // já filtradas por ano/índice/data na tela
  legenda: Legenda;             // legenda dos índices (barra de cores)
  logoClienteUrl?: string | null;
  onProgresso?: (feito: number, total: number, nome: string) => void;
}

// Domínio de cores: NDVI/índices normalizados ficam em [0,1]; os demais usam o
// min/max do próprio raster (mesma regra visual da aba NDVI do talhão).
const NORMALIZADOS = new Set(['NDVI', 'NDRE', 'GNDVI', 'NDWI', 'NDMI', 'SAVI', 'MSAVI2', 'EVI', 'EVI2']);

function dominioDe(indice: string, stats?: { min?: number | null; max?: number | null }): [number, number] {
  if (NORMALIZADOS.has(indice)) return [0, 1];
  const lo = stats?.min, hi = stats?.max;
  if (lo != null && hi != null && isFinite(lo) && isFinite(hi) && hi > lo) return [lo, hi];
  return [0, 1];
}

export async function montarRelatorioNdviFazenda(o: OpcoesRelNdviFazenda): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true }) as JsPDF;

  const faz = getFazendas().find(f => f.id === o.fazendaId) ?? null;
  const cli = faz ? getClientes().find(c => c.id === faz.clienteId) ?? null : null;
  const talhoes = ordenarAlfa(getTalhoes().filter(t => t.fazendaId === o.fazendaId));
  const logos = await carregarLogosNdvi(o.logoClienteUrl);
  const safra = o.safraRotulo || String(o.ano);
  const stops = rampaVisualStops({ ...o.legenda, estilo: 'continuo' });

  // Agrupa as camadas escolhidas por talhão (ordem alfanumérica dos talhões,
  // e dentro de cada talhão por data desc + índice).
  const porTalhao = new Map<string, CamadaTalhao[]>();
  for (const c of o.camadas) {
    const lista = porTalhao.get(c.talhaoId) ?? [];
    lista.push(c);
    porTalhao.set(c.talhaoId, lista);
  }
  for (const lista of porTalhao.values()) {
    lista.sort((a, b) => b.data.localeCompare(a.data) || a.indice.localeCompare(b.indice));
  }

  const comDados = talhoes.filter(t => (porTalhao.get(t.id)?.length ?? 0) > 0);
  const semDados = talhoes.filter(t => (porTalhao.get(t.id)?.length ?? 0) === 0);
  if (comDados.length === 0) {
    throw new Error(`Nenhum mapa de satélite ${o.ano} nos talhões desta fazenda com os filtros escolhidos.`);
  }

  // ── Capa: identificação + o que entra no relatório ──
  desenharCapa(doc, {
    produtor: cli?.nome ?? '', fazenda: faz?.nome ?? '', ano: o.ano,
    talhoes: comDados, porTalhao, semDados, logos,
  });

  // ── Páginas de mapa: um bloco por talhão ──
  let pag = 1;
  let feito = 0;
  const total = o.camadas.length;
  for (const t of comDados) {
    const lista = porTalhao.get(t.id) ?? [];
    let poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon | null = null;
    try { poligono = t.geojson ? extrairPoligono(JSON.parse(t.geojson)) : null; } catch { poligono = null; }
    if (!poligono) { feito += lista.length; continue; }   // talhão sem limite: não dá p/ recortar

    const ctx: CtxNdvi = {
      produtor: cli?.nome ?? '', fazenda: faz?.nome ?? '', talhao: t.nome,
      safra, areaHa: t.areaHa ?? 0, poligono,
    };

    for (const c of lista) {
      o.onProgresso?.(feito, total, `${t.nome} · ${c.indice} · ${fmtData(c.data)}`);
      try {
        const grid = await carregarGridNdvi(c);
        if (!grid) { feito++; continue; }
        const dominio = dominioDe(c.indice, { min: null, max: null });
        const png = colorirGrid(grid, dominio, stops).dataUrl;
        const mapa: MapaRelNdvi = {
          titulo: `${c.indice} · ${fmtData(c.data)}`,
          png, bounds: c.bounds, legenda: o.legenda, dominio,
          satelite: true, serie: c.indice, data: c.data, media: c.media ?? null,
        };
        doc.addPage();
        pag++;
        await desenharPaginaMapaNdvi(doc, mapa, ctx, logos, {
          titulo: `MAPAS DE SATÉLITE — ${t.nome}`,
          rodape: `${pag}`,
        });
      } catch (e) {
        console.warn('[rel-ndvi-fazenda] falhou', t.nome, c.indice, c.data, e);
      }
      feito++;
    }
  }
  o.onProgresso?.(total, total, 'finalizando');
  return doc.output('blob');
}

// Capa: identificação + tabela do que entra (talhão × nº de mapas) + avisos.
function desenharCapa(doc: JsPDF, d: {
  produtor: string; fazenda: string; ano: number;
  talhoes: Talhao[]; porTalhao: Map<string, CamadaTalhao[]>; semDados: Talhao[];
  logos: { inv: HTMLImageElement | null; cli: HTMLImageElement | null };
}): void {
  const W = 210, M = 14;
  let y = 16;
  doc.setTextColor(...NAVY).setFont('helvetica', 'bold').setFontSize(18);
  doc.text('MAPAS DE SATÉLITE', M, y);
  doc.setFontSize(13).setTextColor(...GRAY);
  doc.text(`${d.fazenda || '—'}  ·  Ano ${d.ano}`, M, y + 8);
  doc.setFont('helvetica', 'normal').setFontSize(9.5);
  doc.text(`Produtor: ${d.produtor || '—'}`, M, y + 15);
  doc.setDrawColor(...NAVY).setLineWidth(0.6).line(M, y + 19, W - M, y + 19);
  y += 28;

  const areaTotal = d.talhoes.reduce((s, t) => s + (t.areaHa || 0), 0);
  const nMapas = d.talhoes.reduce((s, t) => s + (d.porTalhao.get(t.id)?.length ?? 0), 0);
  doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(...GRAY);
  doc.text(`${d.talhoes.length} talhão(ões) · ${fmtHa(areaTotal)} ha · ${nMapas} mapa(s)`, M, y);
  y += 8;

  // Tabela: talhão | área | índices | datas
  doc.setFillColor(...NAVY).rect(M, y, W - 2 * M, 7, 'F');
  doc.setTextColor(255, 255, 255).setFont('helvetica', 'bold').setFontSize(8.5);
  doc.text('TALHÃO', M + 2, y + 4.8);
  doc.text('ÁREA (ha)', M + 42, y + 4.8);
  doc.text('ÍNDICES', M + 66, y + 4.8);
  doc.text('DATAS', M + 120, y + 4.8);
  y += 7;

  doc.setFont('helvetica', 'normal').setFontSize(8);
  for (const t of d.talhoes) {
    if (y > 265) { doc.addPage(); y = 20; }
    const lista = d.porTalhao.get(t.id) ?? [];
    const indices = [...new Set(lista.map(c => c.indice))].sort().join(', ');
    const datas = [...new Set(lista.map(c => c.data))].sort().reverse();
    const datasTxt = datas.length <= 3
      ? datas.map(fmtData).join(', ')
      : `${fmtData(datas[0])} … ${fmtData(datas[datas.length - 1])} (${datas.length})`;
    doc.setDrawColor(...LINE).setLineWidth(0.2).line(M, y + 5.6, W - M, y + 5.6);
    doc.setTextColor(...NAVY).text(t.nome, M + 2, y + 4);
    doc.setTextColor(...GRAY);
    doc.text(fmtHa(t.areaHa ?? 0), M + 42, y + 4);
    doc.text(indices || '—', M + 66, y + 4, { maxWidth: 52 });
    doc.text(datasTxt || '—', M + 120, y + 4, { maxWidth: W - M - 122 });
    y += 6.4;
  }

  // Talhões sem imagem no período — listados (não somem em silêncio).
  if (d.semDados.length > 0) {
    y += 6;
    if (y > 255) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...GRAY);
    doc.text('Sem imagem no período (não entram nos mapas):', M, y);
    doc.setFont('helvetica', 'normal');
    doc.text(ordenarAlfa(d.semDados).map(t => t.nome).join(', '), M, y + 4.5, { maxWidth: W - 2 * M });
  }
  desenharRodapeNdvi(doc, '1');
}

// Abre numa aba (padrão dos relatórios da fazenda) e faz fallback p/ download.
export async function gerarRelatorioNdviFazenda(o: OpcoesRelNdviFazenda): Promise<void> {
  const aba = typeof window !== 'undefined' ? window.open('', '_blank') : null;
  if (aba) aba.document.write('<title>Gerando…</title><p style="font:14px sans-serif;padding:24px">⏳ Gerando o relatório de satélite da fazenda…</p>');
  try {
    const blob = await montarRelatorioNdviFazenda(o);
    const url = URL.createObjectURL(blob);
    // SA_NDVI_2026 — sem número de talhão (o relatório cobre a fazenda toda),
    // mas COM a sigla: "Satelite_Fazenda_2026.pdf" era o mesmo nome para dois
    // produtores diferentes no mesmo ano.
    const faz = getFazendas().find(f => f.id === o.fazendaId);
    const nome = `${nomeExport({
      fazenda: faz?.nome ?? '', siglaFazenda: faz?.sigla ?? null, tipo: 'NDVI', ano: o.ano,
    })}.pdf`;
    if (aba) { aba.location.href = url; }
    else {
      const a = document.createElement('a');
      a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (aba) aba.document.body.innerHTML = `<p style="font:14px sans-serif;padding:24px;color:#b91c1c">${msg}</p>`;
    throw e;
  }
}

// Rótulo amigável do índice p/ a UI (mantém a sigla, que é o que o agrônomo usa).
export const rotuloIndice = (id: string) => id;
export { rotuloAno, fmt2 };
