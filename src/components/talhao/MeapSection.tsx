'use client';

// Módulo "Zonas de Manejo" (MEAP) — aba dedicada da página do talhão (Fase M1).
// Mostra as zonas adotadas + a HOMOGENEIDADE INTERNA (CV) por zona e publica as
// zonas coloridas no mapa enquanto a aba está ativa. Convergência fica "—" até
// existir uma 2ª versão (versionamento real é M3).

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import type { Talhao } from '@/lib/store';
import { obterOuAdotarAmbiente } from '@/lib/meap/adocao';
import { classeZona } from '@/lib/zonas';
import { simboloElemento } from '@/lib/lab';
import type { AmbienteProdutivo, Homogeneidade } from '@/lib/meap/tipos';
import { Layers, AlertTriangle } from 'lucide-react';

const HOMOG: Record<Homogeneidade, { label: string; cor: string; bg: string }> = {
  alta: { label: 'Homogênea', cor: '#86efac', bg: '#0f2a1a' },
  media: { label: 'Média', cor: '#fbbf24', bg: '#2d1a00' },
  baixa: { label: 'Heterogênea', cor: '#f87171', bg: '#2a0f12' },
};

const ESTADO: Record<AmbienteProdutivo['estado'], string> = {
  'em-formacao': 'Em formação',
  'em-consolidacao': 'Em consolidação',
  'consolidada': 'Consolidada',
};

export function MeapSection({ talhao }: { talhao: Talhao; safraNome?: string }) {
  const { setZonasManejo } = useApp();
  const [amb, setAmb] = useState<AmbienteProdutivo | null>(null);

  useEffect(() => { setAmb(obterOuAdotarAmbiente(talhao.id)); }, [talhao.id, talhao.zonasGeojson]);

  // Publica as zonas coloridas no mapa enquanto a aba está aberta.
  useEffect(() => {
    if (!talhao.zonasGeojson) { setZonasManejo(null); return; }
    try {
      const fc = JSON.parse(talhao.zonasGeojson) as GeoJSON.FeatureCollection;
      const features = fc.features
        .filter(f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'))
        .map(f => {
          const p = (f.properties ?? {}) as { id?: string; classe?: string };
          const cz = classeZona(p.classe ?? '');
          return { type: 'Feature' as const, properties: { cor: cz.cor, rotulo: String(p.id ?? '?'), classeLabel: cz.label, selecionada: false }, geometry: f.geometry! };
        });
      setZonasManejo({ type: 'FeatureCollection', features });
    } catch { setZonasManejo(null); }
    return () => setZonasManejo(null);
  }, [talhao.zonasGeojson, setZonasManejo]);

  const versao = useMemo(() => amb?.versoes.find(v => v.numero === amb.versaoVigente) ?? amb?.versoes[0] ?? null, [amb]);

  // Estado vazio: sem zonas importadas.
  if (!amb || !versao) {
    return (
      <div className="p-4">
        <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: '#2d1a00', border: '1px solid #92400e' }}>
          <AlertTriangle size={16} style={{ color: '#fbbf24' }} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold" style={{ color: '#fbbf24' }}>Talhão sem zonas de manejo</p>
            <p className="text-[10px] mt-1 leading-relaxed" style={{ color: '#b45309' }}>
              Importe um arquivo de zonas (KML/Shapefile/GeoJSON) na ficha do talhão para o MEAP adotá-las e calcular o CV por zona. A geração automática de zonas a partir dos dados entra numa próxima fase.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const varSimbolo = versao.variavelValidacao ? simboloElemento(versao.variavelValidacao) : null;
  const temCV = versao.zonas.some(z => z.metricas.cvValidacao != null);

  return (
    <div className="p-3 space-y-3">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers size={15} style={{ color: '#86efac' }} />
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#cbd5e1' }}>Zonas de Manejo (MEAP)</span>
        </div>
        <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: '#0b1f3a', color: '#93c5fd', border: '1px solid #1e3a8a' }}>{ESTADO[amb.estado]}</span>
      </div>

      <p className="text-[10px] leading-relaxed" style={{ color: '#64748b' }}>
        <strong style={{ color: '#cbd5e1' }}>{versao.zonas.length}</strong> zonas · homogeneidade interna (CV) {temCV ? <>por <strong style={{ color: '#93c5fd' }}>{varSimbolo}</strong></> : 'indisponível (sem laboratório casado à grade)'}.
      </p>

      {/* Lista de zonas */}
      <div className="space-y-1">
        {versao.zonas.map(z => {
          const h = z.metricas.homogeneidade ? HOMOG[z.metricas.homogeneidade] : null;
          return (
            <div key={z.id} className="px-2 py-1.5 rounded" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
              <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0" style={{ background: z.cor, border: '1px solid #fff' }} />
                <span className="text-xs font-bold" style={{ color: '#e2e8f0', minWidth: '54px' }}>{z.rotulo}</span>
                <span className="text-[11px]" style={{ color: '#93c5fd' }}>{z.classeLabel}</span>
                <span className="text-[10px] ml-auto" style={{ color: '#64748b' }}>{z.areaHa.toLocaleString('pt-BR')} ha · {Math.round(z.percTalhao * 100)}%</span>
              </div>
              <div className="flex items-center gap-2 mt-1 pl-5">
                {h && z.metricas.cvValidacao != null ? (
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: h.bg, color: h.cor }}>
                    {h.label} · CV {z.metricas.cvValidacao.toLocaleString('pt-BR')}%
                  </span>
                ) : (
                  <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: '#0b1f3a', color: '#475569' }}>CV —</span>
                )}
                {z.metricas.nPontos > 0 && <span className="text-[9px]" style={{ color: '#475569' }}>{z.metricas.nPontos} pontos de lab</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Rodapé */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-[10px]" style={{ borderTop: '1px solid #14263f', color: '#64748b' }}>
        <span>Versão <strong style={{ color: '#cbd5e1' }}>v{versao.numero}</strong></span>
        <span>Convergência <strong style={{ color: '#cbd5e1' }}>{versao.convergencia == null ? '—' : `${Math.round(versao.convergencia * 100)}%`}</strong></span>
        {temCV && versao.cvMedioIntraZona != null && <span>CV médio <strong style={{ color: '#cbd5e1' }}>{versao.cvMedioIntraZona.toLocaleString('pt-BR')}%</strong></span>}
      </div>

      <p className="text-[9px] leading-relaxed" style={{ color: '#475569' }}>
        Uma boa zona de manejo é internamente homogênea (CV baixo). O CV é calculado dos resultados de laboratório que caem dentro de cada zona, na escala original do atributo.
      </p>
    </div>
  );
}
