'use client';

// Mapa das linhas de plantio de UM talhão (SVG, sem MapLibre): o contorno do
// talhão e, por cima, as linhas guia e as bordaduras recebidas da PrecisionFarm.
// A geometria só chega aqui quando o produtor escolhe um talhão (ela pode ter
// milhares de feições); para não pesar o navegador, cada camada desenha no
// máximo MAX_FEICOES feições — se passar disso, o aviso diz quantas.

import { useMemo } from 'react';
import { Map as MapaIcone } from 'lucide-react';
import { projetarMapa } from '@/lib/portalPainel';
import { caminhoLinhas } from '@/lib/portalPainelExtras';
import { COR } from '@/components/portal/ui/formato';

export const COR_GUIA = 'var(--invicta-blue-mid)';
export const COR_BORDADURA = '#f97316';
const MAX_FEICOES = 4000;

export interface CamadaDesenhada { chave: string; nome: string; geometria: GeoJSON.FeatureCollection }

export function LinhasMapa({ talhaoId, geojson, camadas, altura = 380 }: {
  talhaoId: string;
  geojson?: string | null;
  camadas: CamadaDesenhada[];
  altura?: number;
}) {
  const proj = useMemo(() => projetarMapa([{ id: talhaoId, geojson }], 600, Math.round(600 * (altura / 380)), 12), [talhaoId, geojson, altura]);

  const desenho = useMemo(() => {
    const ponto = proj.ponto;
    if (!ponto) return { camadas: [] as Array<{ chave: string; guia: string; bordadura: string }>, cortadas: 0 };
    let cortadas = 0;
    const lista = camadas.map(c => {
      const feats = c.geometria.features ?? [];
      if (feats.length > MAX_FEICOES) cortadas += feats.length - MAX_FEICOES;
      const guias: string[] = [], bordas: string[] = [];
      for (const f of feats.slice(0, MAX_FEICOES)) {
        const d = caminhoLinhas(f.geometry as { type?: string; coordinates?: unknown }, ponto);
        if (!d) continue;
        (f.properties && (f.properties as Record<string, unknown>).kind === 'headland' ? bordas : guias).push(d);
      }
      return { chave: c.chave, guia: guias.join(''), bordadura: bordas.join('') };
    });
    return { camadas: lista, cortadas };
  }, [camadas, proj]);

  if (!proj.formas.length || !proj.ponto) {
    return (
      <div className="rounded-xl flex flex-col items-center justify-center gap-1 text-xs" style={{ height: altura, background: 'var(--p-mapa-fundo)', color: COR.texto2 }}>
        <MapaIcone size={18} /> Sem limite de talhão para desenhar.
      </div>
    );
  }
  const forma = proj.formas[0];
  return (
    <div className="relative rounded-xl overflow-hidden" style={{ height: altura, background: 'var(--p-mapa-fundo)' }}>
      <svg viewBox={proj.viewBox} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Mapa das linhas de plantio do talhão" style={{ width: '100%', height: '100%', display: 'block' }}>
        <path d={forma.d} fill="var(--p-sem-dado)" fillOpacity={0.28} fillRule="evenodd" />
        {desenho.camadas.map(c => (
          <g key={c.chave} fill="none" strokeLinecap="round" strokeLinejoin="round">
            {c.guia && <path d={c.guia} stroke={COR_GUIA} strokeWidth={1} vectorEffect="non-scaling-stroke" />}
            {c.bordadura && <path d={c.bordadura} stroke={COR_BORDADURA} strokeWidth={2} vectorEffect="non-scaling-stroke" />}
          </g>
        ))}
        <path d={forma.d} fill="none" fillRule="evenodd" stroke="var(--p-contorno)" strokeWidth={1.6} strokeLinejoin="round" />
      </svg>
      {desenho.cortadas > 0 && (
        <span className="absolute left-2 bottom-2 rounded-lg px-2 py-1 text-[10.5px] font-semibold"
          style={{ background: 'color-mix(in srgb, var(--bg-surface) 88%, transparent)', color: COR.texto2 }}>
          Desenhando {MAX_FEICOES.toLocaleString('pt-BR')} feições por camada; {desenho.cortadas.toLocaleString('pt-BR')} ficaram de fora do desenho.
        </span>
      )}
    </div>
  );
}
