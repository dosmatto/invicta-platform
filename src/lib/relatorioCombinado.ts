'use client';

// Relatório COMBINADO (aba Relatórios da Página do Talhão): um único PDF A4
// paisagem que junta, na ordem, a seção de RECOMENDAÇÃO (1 página por dose dos
// cenários selecionados) e a seção de FERTILIDADE (capa + 1 página por elemento).
// Cada seção é OPCIONAL — desmarcar uma gera só a outra. Reaproveita os
// desenhadores oficiais das duas famílias (nenhum layout é reimplementado aqui).

import { renderFertilidadeNoDoc, type DadosRelatorioFert } from './relatorioFertilidade';
import { renderBookOficialNoDoc } from './recomendacao/relatorioCenarios';
import type { Cenario } from './recomendacao/cenarios';

export interface ArgsRelatorioCombinado {
  recomendacao?: Cenario[];          // cenários com grids JÁ descomprimidos (doses[].grid)
  fertilidade?: DadosRelatorioFert[];
  nomeArquivo: string;
}

// Gera o PDF combinado, abre em nova aba e devolve o total de páginas (p/ o
// histórico). Abre a aba ANTES de qualquer await (senão o popup é bloqueado).
export async function gerarRelatorioCombinado(args: ArgsRelatorioCombinado): Promise<{ paginas: number }> {
  const temRec = !!args.recomendacao?.length;
  const temFert = !!args.fertilidade?.length;
  if (!temRec && !temFert) throw new Error('Selecione ao menos uma seção (Recomendação ou Fertilidade).');

  const aba = typeof window !== 'undefined' ? window.open('', '_blank') : null;
  if (aba) try { aba.document.write('<!doctype html><meta charset="utf-8"><title>Relatório</title><body style="font-family:system-ui,sans-serif;padding:28px;color:#334155"><p>⏳ Gerando o relatório PDF… aguarde alguns segundos (capturando os mapas).</p></body>'); } catch {}
  try {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    let temConteudo = false;
    if (temRec) {
      await renderBookOficialNoDoc(doc, args.recomendacao!, { novaPaginaAntes: false });
      temConteudo = true;
    }
    if (temFert) {
      await renderFertilidadeNoDoc(doc, args.fertilidade!, { novaPaginaAntes: temConteudo, comCapa: true });
      temConteudo = true;
    }
    const paginas = doc.getNumberOfPages();
    const nome = args.nomeArquivo.replace(/[^\w.\-]+/g, '_') + '.pdf';
    const blob = doc.output('blob');
    if (aba) { const url = URL.createObjectURL(blob); aba.location.href = url; setTimeout(() => URL.revokeObjectURL(url), 60000); }
    else doc.save(nome);
    return { paginas };
  } catch (e) {
    const msg = e instanceof Error ? (e.stack ?? e.message) : String(e);
    console.error('[relatorio-combinado] falha:', e);
    if (aba) { try { aba.document.body.innerHTML = `<h3 style="color:#b91c1c;font-family:system-ui">Falha ao gerar o relatório</h3><pre style="white-space:pre-wrap;font-size:12px;color:#334155">${msg.replace(/[<>&]/g, s => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[s]!))}</pre>`; } catch {} }
    throw e;
  }
}
