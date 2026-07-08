'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { getSafras, saveGrade, marcarParaProcessar, type PontoAmostragem } from '@/lib/store';
import { parseGeoFile } from '@/lib/geo';
import { chavesDePropriedades, detectarCampoId, pontosDaFC, montarGradeImportada } from '@/lib/importarGrade';
import { Upload, Save, AlertTriangle, CheckCircle2, MapPin } from 'lucide-react';

import { inputStyle } from '@/constants/ui';

function fcDePontos(pontos: PontoAmostragem[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: pontos.map(p => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { ordem: p.ordem, label: String(p.numero ?? p.ordem + 1), profs: p.profs ?? 1 },
    })),
  };
}

export function ImportarGradeSection() {
  const { nav, setPontosSimulados } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);

  const safraAtiva = useMemo(() => getSafras().find(s => s.ativa) ?? null, []);
  const safraNome = safraAtiva?.nome ?? '';

  const [fc, setFc] = useState<GeoJSON.FeatureCollection | null>(null);
  const [campoId, setCampoId] = useState('');
  const [nome, setNome] = useState('');
  const [estado, setEstado] = useState<'idle' | 'loading' | 'pronto' | 'erro'>('idle');
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');

  const chaves = fc ? chavesDePropriedades(fc) : [];
  const prev = useMemo(() => (fc ? pontosDaFC(fc, campoId || null) : null), [fc, campoId]);

  // preview no mapa quando muda o arquivo ou o campo do número
  useEffect(() => {
    if (prev) setPontosSimulados(fcDePontos(prev.pontos));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prev]);

  async function onFile(file: File) {
    setEstado('loading'); setErro(''); setOk('');
    try {
      const res = await parseGeoFile(file);
      const pts = res.geojson.features.filter(f => f.geometry?.type === 'Point');
      if (pts.length === 0) throw new Error('Nenhum ponto no arquivo (esperado pontos de amostragem).');
      setFc(res.geojson);
      setCampoId(detectarCampoId(res.geojson) ?? '');
      setNome(`Grade importada (${pts.length} pts)`);
      setEstado('pronto');
    } catch (e) {
      setEstado('erro'); setErro(e instanceof Error ? e.message : 'Erro ao ler o arquivo.');
    }
  }
  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '';
  }

  function salvar() {
    if (!nav.talhaoId || !safraNome) { setErro('Defina uma safra ativa e abra o talhão.'); setEstado('erro'); return; }
    if (!prev || prev.total === 0) { setErro('Nada para salvar.'); setEstado('erro'); return; }
    if (prev.comNumero === 0) { setErro('Não identifiquei o número dos pontos — escolha o campo correto abaixo.'); setEstado('erro'); return; }
    const grade = saveGrade(montarGradeImportada({ talhaoId: nav.talhaoId, safra: safraNome, nome: nome || 'Grade importada', pontos: prev.pontos }));
    marcarParaProcessar(grade.id);
    setOk(`Grade salva: ${prev.total} pontos · números ${prev.min}–${prev.max}.`);
    setFc(null); setCampoId(''); setEstado('idle');
  }

  if (!safraAtiva) return <div className="px-6 py-4"><Aviso texto="Defina uma safra ativa (no topo do talhão) para importar uma grade." /></div>;

  return (
    <div className="px-4 py-3 space-y-3">
      <p className="text-[10px]" style={{ color: '#64748b' }}>
        Importe pontos feitos fora da plataforma (Shapefile .zip / KML / GeoJSON). O <strong>número de cada ponto</strong> é preservado para ligar ao laboratório.
      </p>

      {/* Upload */}
      <div onClick={() => inputRef.current?.click()} className="border-2 border-dashed rounded-lg py-4 text-center cursor-pointer"
        style={{ borderColor: estado === 'pronto' ? '#22d3ee' : '#1e3a5f' }}>
        {estado === 'loading' ? <p className="text-[10px]" style={{ color: '#64748b' }}>Lendo arquivo…</p> : (
          <div className="flex flex-col items-center gap-1">
            <Upload size={16} style={{ color: '#475569' }} />
            <p className="text-[10px] font-semibold" style={{ color: '#94a3b8' }}>{fc ? 'Trocar arquivo' : 'Carregar pontos (.zip / .kml / .geojson)'}</p>
            <p className="text-[9px]" style={{ color: '#475569' }}>Shapefile .zip · KML · GeoJSON</p>
          </div>
        )}
        <input ref={inputRef} type="file" accept=".zip,.kml,.geojson,.json" className="hidden" onChange={onFileChange} />
      </div>

      {estado === 'erro' && <p className="text-[10px]" style={{ color: '#f87171' }}>{erro}</p>}
      {ok && <p className="text-[10px] flex items-center gap-1" style={{ color: '#86efac' }}><CheckCircle2 size={12} /> {ok}</p>}

      {fc && prev && estado === 'pronto' && (
        <div className="space-y-2 p-2.5 rounded-lg" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
          {/* campo do número */}
          <div>
            <label className="text-[9px] font-semibold block" style={{ color: '#64748b' }}>Campo do número do ponto</label>
            <select value={campoId} onChange={e => setCampoId(e.target.value)} className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle}>
              <option value="">(sem número — usar ordem)</option>
              {chaves.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>

          {/* nome */}
          <div>
            <label className="text-[9px] font-semibold block" style={{ color: '#64748b' }}>Nome da grade</label>
            <input value={nome} onChange={e => setNome(e.target.value)} className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle} />
          </div>

          <p className="text-[10px] flex items-center gap-1" style={{ color: '#cbd5e1' }}>
            <MapPin size={11} style={{ color: '#22d3ee' }} />
            <strong style={{ color: '#86efac' }}>{prev.total}</strong> pontos ·
            <strong style={{ color: prev.comNumero === prev.total ? '#86efac' : '#fbbf24' }}>{prev.comNumero}</strong> com número
            {prev.min != null && <span> · {prev.min}–{prev.max}</span>}
          </p>
          {prev.comNumero < prev.total && <p className="text-[9px]" style={{ color: '#fbbf24' }}>Alguns pontos sem número — confira o campo selecionado.</p>}

          <button onClick={salvar} disabled={prev.comNumero === 0}
            className="w-full py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1"
            style={{ background: prev.comNumero ? 'var(--invicta-blue)' : '#1a3a6b', opacity: prev.comNumero ? 1 : 0.6 }}>
            <Save size={11} /> Salvar grade
          </button>
        </div>
      )}
    </div>
  );
}

function Aviso({ texto }: { texto: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: '#2d1a00', border: '1px solid #92400e' }}>
      <AlertTriangle size={14} style={{ color: '#fbbf24' }} className="flex-shrink-0 mt-0.5" />
      <p className="text-[10px]" style={{ color: '#fbbf24' }}>{texto}</p>
    </div>
  );
}
