'use client';

// CADERNO DE CAMPO (A4 retrato) — o que o operador registrou em cada ponto da
// amostragem: horário, quem coletou, condições (umidade/compactação/problemas),
// a ANOTAÇÃO livre e as FOTOS. Mesmo padrão visual dos demais relatórios
// (paleta NAVY/GRAY/LINE, logos no topo, faixa de rodapé).
//
// Existe porque esses dados eram gravados e sincronizados desde a primeira
// coleta, mas nenhuma tela ou relatório os lia de volta — ficavam invisíveis.
// Servem para interpretar laudo fora da curva ("ponto 14: formigueiro").

import type { jsPDF as JsPDF } from 'jspdf';
import { imagemParaPdf, reduzirLogo, type ImagemPdf } from './pdfImagem';

const NAVY: [number, number, number] = [13, 33, 64];
const GRAY: [number, number, number] = [100, 116, 139];
const LINE: [number, number, number] = [210, 219, 232];
const VERDE: [number, number, number] = [34, 197, 94];
const CINZA: [number, number, number] = [148, 163, 184];
const VERMELHO: [number, number, number] = [239, 68, 68];

// jsPDF usa WinAnsi: fora desse conjunto sai lixo no lugar do caractere. O texto
// vem digitado no celular, em campo — emoji e afins são plausíveis.
const san = (s: string | null | undefined): string => (s ?? '').replace(/[^\x00-\xFF]/g, '');
const fmt = (v: number, d = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

function dataHoraBR(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function carregarImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => res(img); img.onerror = () => rej(new Error(`falha ao carregar ${src}`)); img.src = src;
  });
}

export interface PontoCampo {
  codigo: string;
  status: string;                 // rótulo já traduzido (Coletado/Pulado/…)
  horario?: string;
  operador?: string;
  distanciaAlvoM?: number;
  precisaoM?: number;
  profundidades?: string[];
  umidade?: string;
  compactacao?: string;
  problemas?: string;
  obs?: string;
  fotos: string[];                // URLs (assinadas) das fotos na nuvem
}

export interface DadosRelatorioCampo {
  produtor: string;
  fazenda: string;
  talhao: string;
  ciclo: string;
  grade: string;
  pontos: PontoCampo[];
  logoClienteUrl?: string | null;
}

const W = 210, H = 297, M = 12;
const TOPO = 30;          // altura do cabeçalho
const FIM = H - 14;       // onde o conteúdo tem que parar (acima do rodapé)

export async function gerarCadernoCampo(d: DadosRelatorioCampo): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' }) as JsPDF;

  const invRaw = await carregarImg('/images/logo-colorida.png').catch(() => null);
  const cliRaw = d.logoClienteUrl ? await carregarImg(d.logoClienteUrl).catch(() => null) : null;
  const logos = {
    inv: invRaw ? await reduzirLogo(invRaw) : null,
    branca: await carregarImg('/images/logo-branca.png').catch(() => null),
    cli: cliRaw ? await reduzirLogo(cliRaw) : null,
  };

  // Fotos: baixadas UMA vez cada e reaproveitadas — a mesma foto pode repetir
  // entre pontos por engano do operador, e re-baixar custaria rede à toa.
  const cacheFoto = new Map<string, ImagemPdf | null>();
  async function fotoPdf(url: string, mmLargura: number): Promise<ImagemPdf | null> {
    if (cacheFoto.has(url)) return cacheFoto.get(url)!;
    let out: ImagemPdf | null = null;
    try { out = await imagemParaPdf(await carregarImg(url), mmLargura); }
    catch { out = null; }   // foto apagada/URL vencida → o bloco sai sem ela
    cacheFoto.set(url, out);
    return out;
  }

  let pagina = 0;
  function novaPagina() {
    if (pagina > 0) doc.addPage();
    pagina++;
    // ── CABEÇALHO ──
    doc.setFillColor(255, 255, 255); doc.rect(0, 0, W, TOPO, 'F');
    if (logos.inv) { const h = 9, w = h * (logos.inv.naturalWidth / logos.inv.naturalHeight); doc.addImage(logos.inv, 'PNG', M, 6, w, h); }
    if (logos.cli) { const h = 9, w = h * (logos.cli.naturalWidth / logos.cli.naturalHeight); doc.addImage(logos.cli, 'PNG', W - M - w, 6, w, h); }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...NAVY);
    doc.text('CADERNO DE CAMPO', W / 2, 11, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
    doc.text('Registros da amostragem de solo', W / 2, 15.5, { align: 'center' });

    doc.setFontSize(7.5); doc.setTextColor(...NAVY); doc.setFont('helvetica', 'normal');
    const linha = [
      `Produtor: ${san(d.produtor) || '—'}`,
      `Fazenda: ${san(d.fazenda) || '—'}`,
      `Talhao: ${san(d.talhao) || '—'}`,
      `Ano/ciclo: ${san(d.ciclo) || '—'}`,
      `Grade: ${san(d.grade) || '—'}`,
    ].join('   |   ');
    doc.text(linha, W / 2, 23, { align: 'center', maxWidth: W - 2 * M });
    doc.setDrawColor(...LINE); doc.setLineWidth(0.4); doc.line(M, TOPO - 3, W - M, TOPO - 3);

    // ── RODAPÉ ──
    doc.setFillColor(...NAVY); doc.rect(0, H - 10, W, 10, 'F');
    if (logos.branca) { const h = 5, w = h * (logos.branca.naturalWidth / logos.branca.naturalHeight); doc.addImage(logos.branca, 'PNG', M, H - 7.5, w, h); }
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
    doc.text('INVICTA AP   |   Tecnologia que transforma dados em produtividade.', M + 24, H - 3.8);
    doc.setFont('helvetica', 'bold'); doc.text('www.invictaap.com.br', W - M, H - 3.8, { align: 'right' });
  }

  novaPagina();
  let y = TOPO + 2;

  // Altura que o bloco do ponto vai ocupar — calculada ANTES de desenhar, para
  // não partir um ponto no meio da página.
  function alturaBloco(p: PontoCampo, linhasObs: number): number {
    return 7                                   // faixa do código
      + 4.5                                    // meta (horário/operador/GPS)
      + (p.umidade || p.compactacao || p.problemas ? 4.5 : 0)
      + (linhasObs ? 2 + linhasObs * 3.6 : 0)
      + (p.fotos.length ? 30 : 0)
      + 4;                                     // respiro
  }

  for (const p of d.pontos) {
    doc.setFontSize(7.5);
    const obsLinhas = p.obs ? doc.splitTextToSize(san(p.obs), W - 2 * M - 4) as string[] : [];
    if (y + alturaBloco(p, obsLinhas.length) > FIM) { novaPagina(); y = TOPO + 2; }

    // faixa do ponto
    const cor = /coletado/i.test(p.status) ? VERDE : /pulado/i.test(p.status) ? CINZA : VERMELHO;
    doc.setFillColor(246, 248, 251); doc.rect(M, y, W - 2 * M, 6, 'F');
    doc.setFillColor(...cor); doc.rect(M, y, 1.6, 6, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...NAVY);
    doc.text(san(p.codigo), M + 4, y + 4.2);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...cor);
    doc.text(san(p.status).toUpperCase(), W - M - 2, y + 4.2, { align: 'right' });
    y += 7;

    // meta
    const gps: string[] = [];
    if (p.distanciaAlvoM != null) gps.push(`${fmt(p.distanciaAlvoM, 1)} m do alvo`);
    if (p.precisaoM != null) gps.push(`precisao ${fmt(p.precisaoM, 1)} m`);
    if (p.profundidades?.length) gps.push(`prof. ${san(p.profundidades.join(', '))}`);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...GRAY);
    doc.text(san([dataHoraBR(p.horario), p.operador ?? '—', ...gps].join('   ·   ')), M + 4, y + 2.8, { maxWidth: W - 2 * M - 6 });
    y += 4.5;

    // condições
    const cond = [
      p.umidade && `Umidade: ${san(p.umidade)}`,
      p.compactacao && `Compactacao: ${san(p.compactacao)}`,
      p.problemas && `Problemas: ${san(p.problemas)}`,
    ].filter(Boolean) as string[];
    if (cond.length) {
      doc.setTextColor(...NAVY); doc.setFontSize(7);
      doc.text(cond.join('   ·   '), M + 4, y + 2.8, { maxWidth: W - 2 * M - 6 });
      y += 4.5;
    }

    // anotação
    if (obsLinhas.length) {
      doc.setDrawColor(...LINE); doc.setLineWidth(0.3);
      doc.line(M + 4, y + 1, M + 4, y + 1 + obsLinhas.length * 3.6);
      doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5); doc.setTextColor(40, 50, 70);
      obsLinhas.forEach((t, i) => doc.text(t, M + 7, y + 3.6 + i * 3.6));
      doc.setFont('helvetica', 'normal');
      y += 2 + obsLinhas.length * 3.6;
    }

    // fotos (até 4 por ponto — o que cabe na largura sem virar miniatura inútil)
    if (p.fotos.length) {
      const fw = 40, fh = 26;
      let fx = M + 4;
      for (const url of p.fotos.slice(0, 4)) {
        const img = await fotoPdf(url, fw);
        if (img) {
          try { doc.addImage(img.data, img.formato, fx, y + 1, fw, fh); } catch { /* foto ilegível → ignora */ }
          doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.rect(fx, y + 1, fw, fh, 'S');
        }
        fx += fw + 3;
      }
      if (p.fotos.length > 4) {
        doc.setFontSize(6.5); doc.setTextColor(...GRAY);
        doc.text(`+${p.fotos.length - 4}`, fx + 1, y + 14);
      }
      y += 30;
    }

    y += 4;
  }

  if (!d.pontos.length) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GRAY);
    doc.text('Nenhum registro de campo nesta grade.', W / 2, TOPO + 20, { align: 'center' });
  }

  const nome = `caderno_campo_${d.talhao || 'talhao'}_${d.ciclo || ''}`
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_');
  doc.save(`${nome}.pdf`);
}
