'use client';

import { useEffect, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import { getTalhoes } from '@/lib/store';
import { classeZona, ORDEM_CLASSES } from '@/lib/zonas';
import { AlertTriangle, Layers } from 'lucide-react';

interface ZonaInfo { id: string; classeLabel: string; cor: string; areaHa: number }

export function SimuladorZonas() {
  const { nav, setZonasManejo } = useApp();

  // Carrega o talhão atual e suas zonas
  const talhao = useMemo(() => getTalhoes().find(t => t.id === nav.talhaoId) ?? null, [nav.talhaoId]);

  const zonas = useMemo<ZonaInfo[]>(() => {
    if (!talhao?.zonasGeojson) return [];
    try {
      const fc = JSON.parse(talhao.zonasGeojson) as GeoJSON.FeatureCollection;
      return fc.features.map(f => {
        const p = (f.properties ?? {}) as { id?: string; classe?: string; areaHa?: number };
        const cz = classeZona(p.classe ?? '');
        return { id: String(p.id ?? '?'), classeLabel: cz.label, cor: cz.cor, areaHa: Number(p.areaHa ?? 0) };
      });
    } catch { return []; }
  }, [talhao]);

  // Publica as zonas coloridas no mapa
  useEffect(() => {
    if (!talhao?.zonasGeojson) { setZonasManejo(null); return; }
    try {
      const fc = JSON.parse(talhao.zonasGeojson) as GeoJSON.FeatureCollection;
      const features = fc.features.map(f => {
        const p = (f.properties ?? {}) as { id?: string; classe?: string };
        const cz = classeZona(p.classe ?? '');
        return { ...f, properties: { ...p, cor: cz.cor, rotulo: String(p.id ?? ''), classeLabel: cz.label } };
      });
      setZonasManejo({ type: 'FeatureCollection', features });
    } catch { setZonasManejo(null); }
    return () => setZonasManejo(null);
  }, [talhao, setZonasManejo]);

  if (!talhao?.zonasGeojson || zonas.length === 0) {
    return (
      <div className="p-4">
        <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: '#2d1a00', border: '1px solid #92400e' }}>
          <AlertTriangle size={16} style={{ color: '#fbbf24' }} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold" style={{ color: '#fbbf24' }}>Talhão sem zonas de manejo</p>
            <p className="text-[10px] mt-1" style={{ color: '#78350f' }}>Carregue um arquivo de zonas (KML/Shapefile) — upload pela interface em breve.</p>
          </div>
        </div>
      </div>
    );
  }

  // Classes presentes (para a legenda), na ordem alta→baixa
  const classesPresentes = ORDEM_CLASSES.filter(c => zonas.some(z => z.classeLabel === c));
  const areaTotal = Math.round(zonas.reduce((s, z) => s + z.areaHa, 0) * 100) / 100;

  return (
    <div className="p-3 space-y-3">
      {/* Resumo */}
      <div className="flex items-center gap-2 text-xs" style={{ color: '#94a3b8' }}>
        <Layers size={14} style={{ color: '#86efac' }} />
        <span><strong style={{ color: '#e2e8f0' }}>{zonas.length}</strong> zonas · {areaTotal} ha</span>
      </div>

      {/* Legenda das classes */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#475569' }}>Classes</p>
        <div className="flex flex-wrap gap-2">
          {classesPresentes.map(c => (
            <span key={c} className="flex items-center gap-1.5 text-[10px]" style={{ color: '#cbd5e1' }}>
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: zonas.find(z => z.classeLabel === c)!.cor, border: '1px solid #fff' }} />
              {c}
            </span>
          ))}
        </div>
      </div>

      {/* Lista de zonas */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#475569' }}>Zonas</p>
        <div className="space-y-1">
          {[...zonas].sort((a, b) => a.id.localeCompare(b.id)).map(z => (
            <div key={z.id} className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
              <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0" style={{ background: z.cor, border: '1px solid #fff' }} />
              <span className="text-xs font-bold" style={{ color: '#e2e8f0', minWidth: '34px' }}>Z{z.id}</span>
              <span className="text-[11px]" style={{ color: '#93c5fd' }}>{z.classeLabel}</span>
              <span className="text-[10px] ml-auto" style={{ color: '#64748b' }}>{z.areaHa} ha</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[9px] text-center" style={{ color: '#475569' }}>
        Zonas exibidas no mapa por classe. Geração de pontos por zona — próxima etapa.
      </p>
    </div>
  );
}
