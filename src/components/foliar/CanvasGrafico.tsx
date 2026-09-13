'use client';

// O <canvas> e nada mais. Toda a inteligência de desenho está em
// `src/lib/foliarGraficos.ts`, que não conhece React — é o mesmo código que o
// PDF do relatório vai chamar. Aqui ficam só as três coisas que dependem do
// navegador:
//
//  1. devicePixelRatio — sem escalar o backing store, o gráfico sai borrado em
//     tela Retina (e ilegível no texto de 8px que os rótulos usam);
//  2. largura real do container — o painel do talhão é ARRASTÁVEL, então a
//     largura muda sem que o React re-renderize nada;
//  3. redesenho no resize, via ResizeObserver no elemento pai.
//
// `desenhar` vive numa ref de propósito: passá-la como dependência do efeito
// faria o ResizeObserver ser recriado a cada render do pai. Quem manda o
// redesenho é a prop `chave` — a assinatura dos dados, montada por quem sabe o
// que mudou.

import { useEffect, useRef } from 'react';
import type { DimsGrafico } from '@/lib/foliarGraficos';

export interface CanvasGraficoProps {
  /** Altura em pixels CSS. A largura é sempre 100% do container. */
  altura: number;
  /** Muda ⇒ redesenha. Assinatura dos dados (ids, valores, função DRIS…). */
  chave: string;
  desenhar: (ctx: CanvasRenderingContext2D, dims: DimsGrafico) => void;
  /** Texto do `title`/aria — o canvas é opaco para leitor de tela. */
  descricao?: string;
}

export function CanvasGrafico({ altura, chave, desenhar, descricao }: CanvasGraficoProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const desenharRef = useRef(desenhar);

  // Atualiza a ref num efeito PRÓPRIO, declarado antes do efeito que pinta:
  // efeitos rodam na ordem em que são declarados, então o desenho abaixo já
  // enxerga a função nova. (Escrever na ref durante o render é o que a regra
  // react-hooks/refs proíbe — e com razão: o React pode descartar o render.)
  useEffect(() => { desenharRef.current = desenhar; });

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;

    const pintar = () => {
      const pai = cv.parentElement;
      const largura = Math.max(120, Math.round(pai?.clientWidth || cv.clientWidth || 320));
      const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      cv.width = Math.round(largura * dpr);
      cv.height = Math.round(altura * dpr);
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, largura, altura);
      desenharRef.current(ctx, { largura, altura });
    };

    pintar();
    const pai = cv.parentElement;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => pintar()) : null;
    if (ro && pai) ro.observe(pai);
    window.addEventListener('resize', pintar);
    return () => { ro?.disconnect(); window.removeEventListener('resize', pintar); };
  }, [altura, chave]);

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={descricao}
      title={descricao}
      style={{ display: 'block', width: '100%', height: altura }}
    />
  );
}
