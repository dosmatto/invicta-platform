'use client';

import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import {
  Upload, Play, CheckCircle2, Circle, AlertTriangle,
  Grid3x3, MapPin, FileUp, MousePointer2, QrCode,
  Download, ChevronRight, Info,
} from 'lucide-react';
import { MockIndicator } from '@/components/shared/MockIndicator';

type Metodo = 'grid-fixo' | 'grid-variavel' | 'manual' | 'importar';

const PROFUNDIDADES_PADRAO = ['0–10 cm', '0–20 cm', '10–20 cm', '20–40 cm'];

const METODOS = [
  { id: 'grid-fixo',    label: 'Grid Fixo',               icon: Grid3x3,      desc: 'Espaçamento uniforme em toda a área' },
  { id: 'grid-variavel',label: 'Grid Variável',            icon: Grid3x3,      desc: 'Distribuição por atributos (CE, Zonas)' },
  { id: 'importar',     label: 'Importar Pontos',          icon: FileUp,       desc: 'Shapefile ou CSV com lat/lon do QGIS' },
  { id: 'manual',       label: 'Manual no Mapa',           icon: MousePointer2,desc: 'Posicionar ponto a ponto no mapa' },
];

// Pontos mock gerados
const PONTOS_MOCK = Array.from({ length: 12 }, (_, i) => ({
  id: `PT-${String(i + 1).padStart(2, '0')}`,
  numero: i + 1,
  coletado: i < 5,
}));

export function AmostragemSection() {
  const { nav, setActiveModule, activeModule } = useApp();

  const [etapa, setEtapa] = useState<1 | 2 | 3 | 4>(1);
  const [metodo, setMetodo] = useState<Metodo>('grid-fixo');
  const [espacamento, setEspacamento] = useState('2.5');
  const [profsSelecionadas, setProfsSelecionadas] = useState(['0–20 cm', '20–40 cm']);
  const [gerado, setGerado] = useState(false);
  const temLimite = nav.talhaoId !== null && nav.talhaoId !== '3'; // Talhão Norte não tem limite (mock)

  // Ativa a camada de pontos no mapa ao abrir
  const isActive = activeModule === 'amostragem';

  function toggleProf(p: string) {
    setProfsSelecionadas(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
    );
  }

  function gerarPontos() {
    setGerado(true);
    setEtapa(4);
  }

  const pontosEstimados = Math.round(nav.area / parseFloat(espacamento || '2.5'));

  return (
    <div className="py-1">

      {/* Indicador de módulo ativo no mapa */}
      <div className="mx-4 my-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px]" style={{ color: '#64748b' }}>
          <Circle size={8} className={isActive ? 'fill-green-500 text-green-500' : ''} />
          {isActive ? 'Pontos visíveis no mapa' : 'Clique para ver pontos no mapa'}
        </div>
        <button
          onClick={() => setActiveModule(isActive ? null : 'amostragem')}
          className="text-[10px] px-2 py-1 rounded transition-colors"
          style={{
            background: isActive ? '#166534' : '#1a3a6b',
            color: isActive ? '#86efac' : '#93c5fd',
          }}>
          {isActive ? '🔴 Ocultar mapa' : '🟢 Mostrar no mapa'}
        </button>
      </div>

      {/* Etapas */}
      <div className="flex items-center gap-1 px-4 py-2" style={{ borderBottom: '1px solid #0f2240' }}>
        {[1, 2, 3, 4].map(n => (
          <button key={n} onClick={() => n <= (gerado ? 4 : etapa) && setEtapa(n as 1|2|3|4)}
            className="flex items-center gap-1">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors`}
              style={{
                background: etapa === n ? 'var(--invicta-blue-mid)' : n < etapa || (gerado && n === 4) ? '#166534' : '#1a3a6b',
                color: '#fff',
              }}>
              {n < etapa || (gerado && n < 4) ? '✓' : n}
            </div>
            {n < 4 && <div className="w-4" style={{ height: '1px', background: '#1a3a6b' }} />}
          </button>
        ))}
        <span className="ml-2 text-[10px]" style={{ color: '#64748b' }}>
          {etapa === 1 ? 'Limite' : etapa === 2 ? 'Método' : etapa === 3 ? 'Parâmetros' : 'Pontos'}
        </span>
      </div>

      {/* ETAPA 1 — Limite geográfico do talhão */}
      {etapa === 1 && (
        <div className="px-4 py-3 space-y-3">
          <p className="text-xs font-semibold" style={{ color: '#94a3b8' }}>
            Limite Geográfico do Talhão
          </p>

          {temLimite ? (
            <div className="flex items-center gap-3 p-3 rounded-lg"
              style={{ background: '#0f2a1a', border: '1px solid #166534' }}>
              <CheckCircle2 size={18} style={{ color: '#86efac' }} />
              <div>
                <p className="text-xs font-semibold" style={{ color: '#86efac' }}>Limite cadastrado</p>
                <p className="text-[10px]" style={{ color: '#475569' }}>
                  {nav.area} ha · MultiPolygon · EPSG:4326 <MockIndicator />
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 rounded-lg"
              style={{ background: '#2d1a00', border: '1px solid #92400e' }}>
              <AlertTriangle size={18} style={{ color: '#fbbf24' }} />
              <div>
                <p className="text-xs font-semibold" style={{ color: '#fbbf24' }}>Sem limite geográfico</p>
                <p className="text-[10px]" style={{ color: '#78350f' }}>
                  O talhão precisa de um limite para gerar pontos.
                </p>
              </div>
            </div>
          )}

          {!temLimite && (
            <div>
              <p className="text-[10px] font-semibold mb-2" style={{ color: '#64748b' }}>
                Fazer upload do limite:
              </p>
              <div className="border-2 border-dashed rounded-lg p-5 text-center"
                style={{ borderColor: '#1a3a6b' }}>
                <Upload size={20} className="mx-auto mb-2" style={{ color: '#475569' }} />
                <p className="text-xs font-medium" style={{ color: '#94a3b8' }}>
                  Shapefile (.zip) · GeoJSON · KML
                </p>
                <p className="text-[10px] mt-1" style={{ color: '#475569' }}>
                  O sistema converte automaticamente para PostGIS
                </p>
                <button className="mt-3 px-4 py-2 rounded text-xs font-semibold text-white"
                  style={{ background: 'var(--invicta-blue-mid)' }}>
                  <Upload size={11} className="inline mr-1" /> Selecionar arquivo
                </button>
              </div>
            </div>
          )}

          <button
            onClick={() => setEtapa(2)}
            disabled={!temLimite}
            className="w-full py-2 rounded text-xs font-semibold text-white mt-2 flex items-center justify-center gap-2 disabled:opacity-40"
            style={{ background: 'var(--invicta-green-dark)' }}>
            Próximo <ChevronRight size={12} />
          </button>
        </div>
      )}

      {/* ETAPA 2 — Método */}
      {etapa === 2 && (
        <div className="px-4 py-3 space-y-2">
          <p className="text-xs font-semibold mb-3" style={{ color: '#94a3b8' }}>
            Método de Amostragem
          </p>
          {METODOS.map(m => {
            const Icon = m.icon;
            const sel = metodo === m.id;
            return (
              <button key={m.id} onClick={() => setMetodo(m.id as Metodo)}
                className="w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors"
                style={{
                  background: sel ? '#0f2240' : 'transparent',
                  border: `1px solid ${sel ? 'var(--invicta-blue-mid)' : '#1a3a6b'}`,
                }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: sel ? 'var(--invicta-blue-mid)' : '#1a3a6b' }}>
                  <Icon size={15} style={{ color: sel ? '#fff' : '#64748b' }} />
                </div>
                <div>
                  <p className="text-xs font-semibold" style={{ color: sel ? '#e2e8f0' : '#94a3b8' }}>{m.label}</p>
                  <p className="text-[10px]" style={{ color: '#475569' }}>{m.desc}</p>
                </div>
                {sel && <CheckCircle2 size={14} className="ml-auto" style={{ color: '#60a5fa' }} />}
              </button>
            );
          })}
          <div className="flex gap-2 pt-2">
            <button onClick={() => setEtapa(1)}
              className="flex-1 py-2 rounded text-xs font-semibold"
              style={{ background: '#1a3a6b', color: '#94a3b8' }}>Voltar</button>
            <button onClick={() => setEtapa(3)}
              className="flex-1 py-2 rounded text-xs font-semibold text-white flex items-center justify-center gap-1"
              style={{ background: 'var(--invicta-green-dark)' }}>
              Próximo <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}

      {/* ETAPA 3 — Parâmetros */}
      {etapa === 3 && (
        <div className="px-4 py-3 space-y-4">
          <p className="text-xs font-semibold" style={{ color: '#94a3b8' }}>Parâmetros da Campanha</p>

          {(metodo === 'grid-fixo' || metodo === 'grid-variavel') && (
            <div>
              <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>
                Espaçamento (ha / ponto)
              </label>
              <div className="flex gap-2">
                {['1.0', '2.5', '3.5', '5.0'].map(v => (
                  <button key={v} onClick={() => setEspacamento(v)}
                    className="flex-1 py-1.5 rounded text-xs font-bold transition-colors"
                    style={{
                      background: espacamento === v ? 'var(--invicta-blue-mid)' : '#1a3a6b',
                      color: '#fff',
                    }}>{v}</button>
                ))}
              </div>
              <div className="mt-2 p-2 rounded text-xs text-center"
                style={{ background: '#1a3a6b', color: '#93c5fd' }}>
                ~<strong>{pontosEstimados}</strong> pontos para {nav.area} ha
              </div>
            </div>
          )}

          {metodo === 'importar' && (
            <div>
              <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>
                Arquivo de pontos
              </label>
              <div className="border-2 border-dashed rounded-lg p-4 text-center"
                style={{ borderColor: '#1a3a6b' }}>
                <FileUp size={16} className="mx-auto mb-1" style={{ color: '#475569' }} />
                <p className="text-[10px]" style={{ color: '#475569' }}>
                  Shapefile (.zip) ou CSV com colunas lat, lon, id
                </p>
                <button className="mt-2 px-3 py-1.5 rounded text-[10px] font-semibold text-white"
                  style={{ background: 'var(--invicta-blue-mid)' }}>
                  Selecionar arquivo
                </button>
              </div>
            </div>
          )}

          {/* Profundidades */}
          <div>
            <label className="text-[10px] font-semibold block mb-2" style={{ color: '#64748b' }}>
              Profundidades a coletar
            </label>
            <div className="space-y-1">
              {PROFUNDIDADES_PADRAO.map(p => (
                <label key={p}
                  className="flex items-center gap-2 px-3 py-2 rounded cursor-pointer transition-colors"
                  style={{
                    background: profsSelecionadas.includes(p) ? '#0f2240' : 'transparent',
                    border: `1px solid ${profsSelecionadas.includes(p) ? '#2e5fa3' : '#1a3a6b'}`,
                  }}>
                  <input
                    type="checkbox"
                    checked={profsSelecionadas.includes(p)}
                    onChange={() => toggleProf(p)}
                    className="accent-blue-500"
                  />
                  <span className="text-xs" style={{ color: '#e2e8f0' }}>{p}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Nome da campanha */}
          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{ color: '#64748b' }}>
              Identificação da Campanha
            </label>
            <input
              type="text"
              defaultValue={`${nav.talhao} — Safra ${nav.safra}`}
              className="w-full rounded px-3 py-2 text-xs"
              style={{ background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' }}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={() => setEtapa(2)}
              className="flex-1 py-2 rounded text-xs font-semibold"
              style={{ background: '#1a3a6b', color: '#94a3b8' }}>Voltar</button>
            <button onClick={gerarPontos}
              className="flex-1 py-2 rounded text-xs font-semibold text-white flex items-center justify-center gap-1"
              style={{ background: '#166534' }}>
              <Play size={11} /> Gerar Pontos <MockIndicator />
            </button>
          </div>
        </div>
      )}

      {/* ETAPA 4 — Pontos gerados */}
      {etapa === 4 && (
        <div className="px-4 py-3 space-y-3">
          {/* Resumo */}
          <div className="p-3 rounded-lg" style={{ background: '#0f2a1a', border: '1px solid #166534' }}>
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 size={14} style={{ color: '#86efac' }} />
              <p className="text-xs font-bold" style={{ color: '#86efac' }}>
                {PONTOS_MOCK.length} pontos gerados <MockIndicator />
              </p>
            </div>
            <p className="text-[10px]" style={{ color: '#475569' }}>
              Método: {METODOS.find(m => m.id === metodo)?.label} · {profsSelecionadas.join(', ')}
            </p>
          </div>

          {/* Info mapa */}
          <div className="flex items-center gap-2 p-2 rounded text-[10px]"
            style={{ background: '#1a3a6b', color: '#93c5fd' }}>
            <Info size={11} />
            Os pontos aparecem no mapa. Ative &quot;Mostrar no mapa&quot; acima.
          </div>

          {/* Lista de pontos */}
          <div>
            <p className="text-[10px] font-semibold mb-2" style={{ color: '#64748b' }}>
              Pontos de amostragem
            </p>
            <div className="space-y-0.5 max-h-48 overflow-y-auto rounded" style={{ background: '#060e1a' }}>
              {PONTOS_MOCK.map(p => (
                <div key={p.id}
                  className="flex items-center justify-between px-3 py-2"
                  style={{ borderBottom: '1px solid #0f2240' }}>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ background: '#f59e0b' }}>
                      <MapPin size={10} style={{ color: '#fff' }} />
                    </div>
                    <span className="text-xs font-mono font-bold" style={{ color: '#e2e8f0' }}>{p.id}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] px-1.5 py-0.5 rounded"
                      style={{
                        background: p.coletado ? '#166534' : '#1a3a6b',
                        color: p.coletado ? '#86efac' : '#64748b',
                      }}>
                      {p.coletado ? 'Coletado' : 'Pendente'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Ações */}
          <div className="flex gap-2 pt-1">
            <button
              className="flex-1 py-2 rounded text-xs font-semibold text-white flex items-center justify-center gap-1"
              style={{ background: '#7c3aed' }}>
              <QrCode size={11} /> Gerar QR Codes
            </button>
            <button
              className="flex-1 py-2 rounded text-xs font-semibold text-white flex items-center justify-center gap-1"
              style={{ background: 'var(--invicta-blue-mid)' }}>
              <Download size={11} /> Exportar CSV
            </button>
          </div>

          {/* Resetar */}
          <button onClick={() => { setGerado(false); setEtapa(1); }}
            className="w-full py-1.5 rounded text-[10px]"
            style={{ background: 'transparent', color: '#475569', border: '1px solid #1a3a6b' }}>
            Nova campanha
          </button>
        </div>
      )}
    </div>
  );
}
