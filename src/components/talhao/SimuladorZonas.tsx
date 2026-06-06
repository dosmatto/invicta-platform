'use client';

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { getTalhoes } from '@/lib/store';
import { classeZona, ORDEM_CLASSES } from '@/lib/zonas';
import { gerarGrid, pontoInterno } from '@/lib/grid';
import { AlertTriangle, Layers, MapPin, RotateCcw } from 'lucide-react';

interface ZonaFeat {
  id: string;
  classeLabel: string;
  cor: string;
  areaHa: number;
  geometry: GeoJSON.Geometry;
}

const inputStyle = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;
const COR_PONTO = '#0f172a';

export function SimuladorZonas() {
  const { nav, setZonasManejo, setPontosSimulados } = useApp();

  const [modelo, setModelo] = useState<'A' | 'B'>('A');
  const [densidade, setDensidade] = useState(1);     // pontos por ha (padrão geral)
  const [aleatoriedade, setAleatoriedade] = useState(0);
  const [distanciaBorda, setDistanciaBorda] = useState(15);
  const [seed, setSeed] = useState(1);

  const talhao = useMemo(() => getTalhoes().find(t => t.id === nav.talhaoId) ?? null, [nav.talhaoId]);

  // Zonas com geometria
  const zonas = useMemo<ZonaFeat[]>(() => {
    if (!talhao?.zonasGeojson) return [];
    try {
      const fc = JSON.parse(talhao.zonasGeojson) as GeoJSON.FeatureCollection;
      return fc.features
        .filter(f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'))
        .map(f => {
          const p = (f.properties ?? {}) as { id?: string; classe?: string; areaHa?: number };
          const cz = classeZona(p.classe ?? '');
          return { id: String(p.id ?? '?'), classeLabel: cz.label, cor: cz.cor, areaHa: Number(p.areaHa ?? 0), geometry: f.geometry! };
        })
        .sort((a, b) => a.id.localeCompare(b.id));
    } catch { return []; }
  }, [talhao]);

  // Publica as zonas coloridas no mapa
  useEffect(() => {
    if (zonas.length === 0) { setZonasManejo(null); return; }
    const features = zonas.map(z => ({
      type: 'Feature' as const,
      properties: { cor: z.cor, rotulo: z.id, classeLabel: z.classeLabel },
      geometry: z.geometry,
    }));
    setZonasManejo({ type: 'FeatureCollection', features });
    return () => setZonasManejo(null);
  }, [zonas, setZonasManejo]);

  // Geração de pontos por zona (grid dentro de cada zona + aleatoriedade)
  const { pontos, totalPontos } = useMemo(() => {
    const out: { lng: number; lat: number; label: string }[] = [];
    let seq = 0;
    zonas.forEach((z, idxZona) => {
      const zonaFC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: z.geometry }] };
      const haPonto = densidade > 0 ? 1 / densidade : 1;
      let pts = gerarGrid({ geojson: zonaFC, densidadeHaPonto: haPonto, distanciaBordaM: distanciaBorda, rotacaoGraus: 0, aleatoriedade, seed });
      if (pts.length === 0) {
        const pi = pontoInterno(zonaFC, distanciaBorda);
        if (pi) pts = [{ lng: pi.lng, lat: pi.lat, ordem: 0 }];
      }
      const amostraNum = idxZona + 1; // modelo A: 1 amostra por zona
      pts.forEach(p => {
        seq++;
        out.push({ lng: p.lng, lat: p.lat, label: modelo === 'A' ? String(amostraNum) : String(seq) });
      });
    });
    return { pontos: out, totalPontos: out.length };
  }, [zonas, modelo, densidade, aleatoriedade, distanciaBorda, seed]);

  // Publica os pontos no mapa
  useEffect(() => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: pontos.map(p => ({ type: 'Feature', properties: { label: p.label, cor: COR_PONTO }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } })),
    };
    setPontosSimulados(pontos.length ? fc : null);
    return () => setPontosSimulados(null);
  }, [pontos, setPontosSimulados]);

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

  const classesPresentes = ORDEM_CLASSES.filter(c => zonas.some(z => z.classeLabel === c));
  const areaTotal = Math.round(zonas.reduce((s, z) => s + z.areaHa, 0) * 100) / 100;
  const numAmostras = modelo === 'A' ? zonas.length : totalPontos;

  return (
    <div className="p-3 space-y-3">
      {/* Resumo */}
      <div className="flex items-center gap-2 text-xs" style={{ color: '#94a3b8' }}>
        <Layers size={14} style={{ color: '#86efac' }} />
        <span><strong style={{ color: '#e2e8f0' }}>{zonas.length}</strong> zonas · {areaTotal} ha</span>
      </div>

      {/* Modelo de coleta */}
      <div>
        <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>Modelo de coleta</label>
        <div className="space-y-1">
          {([['A', 'Amostra composta', '1 amostra por zona, de vários pontos'], ['B', 'Pontos individuais', 'cada ponto = 1 amostra ao laboratório']] as const).map(([m, t, d]) => (
            <button key={m} onClick={() => setModelo(m)}
              className="w-full flex items-start gap-2 p-2 rounded-lg text-left transition-colors"
              style={{ background: modelo === m ? '#0f2240' : 'transparent', border: `1px solid ${modelo === m ? 'var(--invicta-blue-mid)' : '#1a3a6b'}` }}>
              <div className="w-4 h-4 rounded-full mt-0.5 flex-shrink-0 flex items-center justify-center" style={{ border: `2px solid ${modelo === m ? '#60a5fa' : '#475569'}` }}>
                {modelo === m && <div className="w-2 h-2 rounded-full" style={{ background: '#60a5fa' }} />}
              </div>
              <div>
                <p className="text-xs font-semibold" style={{ color: modelo === m ? '#e2e8f0' : '#94a3b8' }}>{t}</p>
                <p className="text-[10px]" style={{ color: '#475569' }}>{d}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Densidade */}
      <div>
        <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Densidade (pontos / ha)</label>
        <input type="number" step="0.1" min="0.1" value={densidade}
          onChange={e => setDensidade(Number(e.target.value.replace(',', '.')) || 0)}
          className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
        <p className="text-[9px] mt-0.5" style={{ color: '#475569' }}>Padrão geral. Zonas pequenas recebem ao menos 1 ponto.</p>
      </div>

      {/* Distância da borda */}
      <div>
        <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Distância da borda da zona (m)</label>
        <input type="number" step="5" min="0" value={distanciaBorda}
          onChange={e => setDistanciaBorda(Number(e.target.value) || 0)}
          className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
      </div>

      {/* Aleatoriedade */}
      <div>
        <div className="flex items-center justify-between mb-0.5">
          <label className="text-[10px] font-semibold" style={{ color: '#64748b' }}>
            Aleatoriedade: {aleatoriedade}% {aleatoriedade === 0 ? '(grid exato)' : ''}
          </label>
          {aleatoriedade > 0 && (
            <button onClick={() => setSeed(s => s + 1)} title="Refazer posições"
              className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
              <RotateCcw size={9} /> Refazer
            </button>
          )}
        </div>
        <input type="range" min="0" max="100" value={aleatoriedade}
          onChange={e => setAleatoriedade(Number(e.target.value))} className="w-full accent-blue-500" />
      </div>

      {/* Resumo da geração */}
      <div className="p-2.5 rounded-lg" style={{ background: '#0f2a1a', border: '1px solid #166534' }}>
        <div className="flex items-center gap-2">
          <MapPin size={14} style={{ color: '#86efac' }} />
          <span className="text-sm font-bold" style={{ color: '#86efac' }}>{numAmostras} amostra{numAmostras !== 1 ? 's' : ''}</span>
          <span className="text-[10px]" style={{ color: '#64748b' }}>· {totalPontos} pontos de coleta</span>
        </div>
        <p className="text-[10px] mt-1" style={{ color: '#64748b' }}>
          {modelo === 'A' ? '1 amostra composta por zona' : 'cada ponto vira uma amostra'}
        </p>
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
          {zonas.map(z => (
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
        Ajuste de densidade por zona, profundidades e salvar — próxima etapa.
      </p>
    </div>
  );
}
