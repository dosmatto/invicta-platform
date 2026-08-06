// Funções de formatação pt-BR compartilhadas entre componentes de talhao.
// Cada `fmt*` abaixo corresponde a uma variante idêntica encontrada em 2+ arquivos.
import type { Legenda } from '@/lib/legendas';

// Gera os rótulos de posição/texto da legenda de um raster (usado nos comparadores).
export function rotulosLegenda(leg: Legenda): { pos: number; txt: string }[] {
  let acc = 0; const out: { pos: number; txt: string }[] = [];
  for (let i = 0; i < leg.classes.length - 1; i++) {
    acc += leg.classes[i].larguraVisual;
    const b = leg.classes[i].valorMax;
    if (b != null) out.push({ pos: acc / 100, txt: b.toLocaleString('pt-BR') });
  }
  return out;
}

// Duplicada em RecomendacaoSection.tsx e ComparadorCenarios.tsx.
export const fmtDec = (v: number, dec = 0) => v.toLocaleString('pt-BR', { maximumFractionDigits: dec, minimumFractionDigits: dec });

// Duplicada em AltimetriaSection.tsx e LaboratorioZonas.tsx.
export const fmtMax1 = (v: number, d = 1) => v.toLocaleString('pt-BR', { maximumFractionDigits: d });

// Duplicada em ProdutividadeSection.tsx e ComparadorProdNdvi.tsx.
export const fmtMinMax0 = (v: number, d = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

// Duplicada em CondutividadeSection.tsx e CompactacaoSection.tsx.
export const fmtMax2 = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/**
 * ÁREA em hectares — SEMPRE duas casas, inclusive quando a última é zero.
 *
 * É a exceção da regra de casas por magnitude dos relatórios (fmtRel, em
 * prescricao/resumo.ts): área é o número pelo qual se paga o serviço, se
 * fecha contrato e se confere talhão contra a matrícula, e "159 ha" ao lado
 * de "159,38 ha" no documento vizinho vira dúvida. O zero final também
 * informa — "159,40" diz que a medição tem a casa dos ares, "159,4" parece
 * truncado.
 */
export const fmtHa = (v: number): string =>
  Number.isFinite(v) ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

/** Mesma regra devolvendo NÚMERO — células do Excel e campos do DBF. */
export const arredHa = (v: number): number => (Number.isFinite(v) ? Math.round(v * 100) / 100 : v);

/**
 * Formato de célula do Excel para área. A planilha guarda NÚMERO (área tem de
 * continuar somável), e número não carrega casas: 159,40 aparece como 159,4 se
 * a célula não disser quantas mostrar.
 */
export const FMT_HA_XLSX = '0.00';

// Casas decimais no Excel são FORMATO DA CÉLULA, não do valor: a área vai para
// a planilha como número (tem de continuar somável), e 159,40 aparece "159,4"
// enquanto a célula não disser quantas casas mostrar. Os dois helpers abaixo
// carimbam o formato — um na coluna inteira (planilha em tabela), outro na
// célula do valor de uma linha (planilha Item/Valor). O XLSX vem por parâmetro
// para este módulo continuar sem dependência de runtime (ele é importado pelos
// testes em node).
type Planilha = import('xlsx').WorkSheet;
type Xlsx = typeof import('xlsx');

export function formatarColunaXlsx(XLSX: Xlsx, ws: Planilha, cabecalho: string, z = FMT_HA_XLSX): void {
  if (!ws['!ref']) return;
  const rg = XLSX.utils.decode_range(ws['!ref']);
  for (let c = rg.s.c; c <= rg.e.c; c++) {
    const cab = ws[XLSX.utils.encode_cell({ r: rg.s.r, c })];
    if (!cab || String(cab.v) !== cabecalho) continue;
    for (let r = rg.s.r + 1; r <= rg.e.r; r++) {
      const cel = ws[XLSX.utils.encode_cell({ r, c })];
      if (cel && cel.t === 'n') cel.z = z;
    }
  }
}

export function formatarLinhaXlsx(XLSX: Xlsx, ws: Planilha, item: string, z = FMT_HA_XLSX): void {
  if (!ws['!ref']) return;
  const rg = XLSX.utils.decode_range(ws['!ref']);
  for (let r = rg.s.r + 1; r <= rg.e.r; r++) {
    const rot = ws[XLSX.utils.encode_cell({ r, c: 0 })];
    if (!rot || String(rot.v) !== item) continue;
    const cel = ws[XLSX.utils.encode_cell({ r, c: 1 })];
    if (cel && cel.t === 'n') cel.z = z;
  }
}
