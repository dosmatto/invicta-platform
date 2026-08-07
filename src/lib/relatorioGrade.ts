'use client';

// Relatório de CONFERÊNCIA DA GRADE em Excel — pedido do usuário (04/08/2026):
// depois que a amostragem foi feita, poder conferir o que foi programado ponto
// a ponto, no mesmo formato da planilha que já circula com o laboratório
// (afssa-01-2025.xlsx):
//
//   Produtor | Município | Fazenda | Talhão | ID | Profundidade | Análises
//
// UMA LINHA POR PONTO × PROFUNDIDADE — não por ponto. É o que torna a planilha
// conferível: o ponto 4 que vai a 0-20 e 20-40 aparece em duas linhas, e a
// contagem de linhas bate com o número de amostras que saem do campo (e com o
// número de etiquetas impressas, que usam a mesma expansão).
//
// A montagem das linhas é PURA de propósito (sem xlsx, sem browser): é ela que
// os testes cobrem (npm run teste:relatorio-grade), porque o que erra num
// relatório desses é a expansão das profundidades e o join com o padrão de
// elementos — não a escrita do arquivo.

import type { GradeAmostragem, PontoAmostragem } from './store';
import { nomeExport, periodoParaNome } from './nomeExport.ts';

export interface LinhaRelatorioGrade {
  Produtor: string;
  'Município': string;
  Fazenda: string;
  'Talhão': string;
  ID: number;
  Profundidade: string;
  'Análises': string;
}

export interface ContextoGrade {
  produtor: string;
  municipio: string;
  fazenda: string;
  siglaFazenda?: string | null;   // só para o nome do arquivo (lib/nomeExport)
  talhao: string;
  /** rótulo da profundidade → nome do padrão de elementos (coluna "Análises"). */
  analisePorProfundidade: Record<string, string>;
}

// Profundidades de um ponto. Mesma regra das etiquetas (etiquetas.ts): o rótulo
// salvo NO PONTO manda, porque pontos editados à mão podem divergir da config
// da grade; sem ele, deriva da config pelo nº de profundidades do ponto.
// Divergir daqui faria a planilha discordar das etiquetas coladas nos sacos.
function profundidadesDoPonto(p: PontoAmostragem, grade: GradeAmostragem): string[] {
  if (p.profundidades && p.profundidades.length) return p.profundidades;
  return grade.profundidades.slice(0, p.profs).map(pr => pr.rotulo);
}

/** Expande a grade em linhas ponto × profundidade, na ordem da grade. */
export function linhasDaGrade(ctx: ContextoGrade, grade: GradeAmostragem): LinhaRelatorioGrade[] {
  const out: LinhaRelatorioGrade[] = [];
  for (const pt of grade.pontos) {
    // Mesmo ID que o laboratório recebe: `numero` quando a grade veio de fora
    // (importada), senão a ordem 1-based. Igual ao join do módulo de laudos.
    const id = pt.numero ?? pt.ordem + 1;
    for (const prof of profundidadesDoPonto(pt, grade)) {
      out.push({
        Produtor: ctx.produtor,
        'Município': ctx.municipio,
        Fazenda: ctx.fazenda,
        'Talhão': ctx.talhao,
        ID: id,
        Profundidade: prof,
        // Profundidade sem padrão casado é erro de cadastro, não de exportação:
        // marca na célula em vez de omitir a linha, senão a amostra sumiria da
        // conferência justamente no caso em que ela precisa ser vista.
        'Análises': ctx.analisePorProfundidade[prof] ?? '—',
      });
    }
  }
  return out;
}

/** Resumo para a UI confirmar o que saiu (nº de amostras ≠ nº de pontos). */
export function resumoDaGrade(linhas: LinhaRelatorioGrade[]) {
  const porProfundidade = new Map<string, number>();
  const pontos = new Set<number>();
  for (const l of linhas) {
    porProfundidade.set(l.Profundidade, (porProfundidade.get(l.Profundidade) ?? 0) + 1);
    pontos.add(l.ID);
  }
  return { amostras: linhas.length, pontos: pontos.size, porProfundidade };
}

// SA03_GRADE_2026_EP01_CONFERENCIA — fica ao lado do KML/SHP da mesma grade.
export function nomeArquivoRelatorio(ctx: ContextoGrade, grade: GradeAmostragem): string {
  const per = periodoParaNome({
    ano: grade.ano, epoca: grade.epoca, dataReferencia: grade.dataReferencia, safra: grade.safra,
  });
  return nomeExport({
    fazenda: ctx.fazenda, siglaFazenda: ctx.siglaFazenda, talhao: ctx.talhao,
    tipo: 'GRADE', ano: per.ano, epoca: per.epoca, detalhe: 'conferencia',
  }) + '.xlsx';
}

/** Gera e baixa o .xlsx. Retorna o resumo para a UI dar o retorno ao usuário. */
export async function exportarRelatorioGradeXlsx(ctx: ContextoGrade, grade: GradeAmostragem) {
  const linhas = linhasDaGrade(ctx, grade);
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(linhas);
  ws['!cols'] = [{ wch: 26 }, { wch: 16 }, { wch: 20 }, { wch: 14 }, { wch: 6 }, { wch: 13 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Conferência');
  XLSX.writeFile(wb, nomeArquivoRelatorio(ctx, grade));
  return resumoDaGrade(linhas);
}
