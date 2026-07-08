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
