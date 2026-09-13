'use client';

// Os quatro gráficos da diagnose foliar, em versão React. Cada um é uma casca:
// recebe os dados JÁ traduzidos (rótulo, valor, cor) e repassa à função de
// desenho correspondente em `lib/foliarGraficos.ts`. A tradução
// "classe de Wadt → cor" fica na FoliarSection, que é quem conhece o núcleo.
//
// Não há lógica de gráfico aqui de propósito: o dia em que o relatório em PDF
// desenhar estes mesmos quatro, ele importa `lib/foliarGraficos` direto e não
// passa por este arquivo.

import { useCallback } from 'react';
import { CanvasGrafico } from './CanvasGrafico';
import {
  type BarraIndice, type DadosMatriz, type DimsGrafico, type PontoLinha, type PontoRadar,
  desenharBarrasIndices, desenharLinhaIbn, desenharMatrizConcordancia, desenharRadar,
} from '@/lib/foliarGraficos';

export function BarrasIndices({ barras, altura, casas, descricao }: {
  barras: BarraIndice[]; altura?: number; casas?: number; descricao?: string;
}) {
  const desenhar = useCallback(
    (ctx: CanvasRenderingContext2D, dims: DimsGrafico) => desenharBarrasIndices(ctx, barras, dims, { casas }),
    [barras, casas],
  );
  const h = altura ?? Math.max(90, barras.length * 19 + 24);
  return (
    <CanvasGrafico
      altura={h}
      chave={`b:${casas}:${barras.map(b => `${b.rotulo}${b.valor.toFixed(3)}${b.cor}`).join('|')}`}
      desenhar={desenhar}
      descricao={descricao ?? 'Barras dos índices, zero no centro'}
    />
  );
}

export function RadarBalanco({ pontos, altura, cor, descricao }: {
  pontos: PontoRadar[]; altura?: number; cor?: string; descricao?: string;
}) {
  const desenhar = useCallback(
    (ctx: CanvasRenderingContext2D, dims: DimsGrafico) => desenharRadar(ctx, pontos, dims, { cor }),
    [pontos, cor],
  );
  return (
    <CanvasGrafico
      altura={altura ?? 220}
      chave={`r:${cor}:${pontos.map(p => `${p.rotulo}${p.valor.toFixed(3)}`).join('|')}`}
      desenhar={desenhar}
      descricao={descricao ?? 'Radar de balanço nutricional'}
    />
  );
}

export function MatrizConcordancia({ dados, altura, descricao }: {
  dados: DadosMatriz; altura?: number; descricao?: string;
}) {
  const desenhar = useCallback(
    (ctx: CanvasRenderingContext2D, dims: DimsGrafico) => desenharMatrizConcordancia(ctx, dados, dims),
    [dados],
  );
  const h = altura ?? 16 + dados.linhas.length * 18 + 4;
  return (
    <CanvasGrafico
      altura={h}
      chave={`m:${dados.colunas.join(',')}:${dados.linhas.map(l => `${l.rotulo}${l.celulas.map(c => c.texto + c.cor).join('')}`).join('|')}`}
      desenhar={desenhar}
      descricao={descricao ?? 'Matriz de concordância entre os métodos'}
    />
  );
}

export function LinhaIbn({ pontos, altura, cor, descricao }: {
  pontos: PontoLinha[]; altura?: number; cor?: string; descricao?: string;
}) {
  const desenhar = useCallback(
    (ctx: CanvasRenderingContext2D, dims: DimsGrafico) => desenharLinhaIbn(ctx, pontos, dims, { cor }),
    [pontos, cor],
  );
  return (
    <CanvasGrafico
      altura={altura ?? 110}
      chave={`l:${cor}:${pontos.map(p => `${p.rotulo}${p.valor ?? 'x'}`).join('|')}`}
      desenhar={desenhar}
      descricao={descricao ?? 'IBN por safra'}
    />
  );
}
