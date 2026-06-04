'use client';

import { useState, useEffect, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import { getTalhoes, getSafras, saveSafra, updateTalhao, Talhao, Safra } from '@/lib/store';
import { parseGeoFile } from '@/lib/geo';
import { SimuladorAmostragem } from '@/components/talhao/SimuladorAmostragem';
import {
  ChevronLeft, Grid3x3, TestTube, QrCode, Leaf,
  Satellite, Zap, BarChart3, Layers, FileSpreadsheet,
  FileText, ChevronDown, ChevronRight, Play, Upload, Download,
  CheckCircle2, AlertTriangle, MapPin, Plus, X, Save,
} from 'lucide-react';

// ── tipos ──────────────────────────────────────────────────────────────────
interface SectionProps {
  title: string; icon: React.ElementType; color: string;
  children: React.ReactNode; moduleId?: string;
}

// ── componentes internos ───────────────────────────────────────────────────
function AccordionSection({ title, icon: Icon, color, children, moduleId }: SectionProps) {
  const [open, setOpen] = useState(false);
  const { setActiveModule } = useApp();

  function toggle() {
    const next = !open;
    setOpen(next);
    if (moduleId) setActiveModule(next ? moduleId : null);
  }

  return (
    <div style={{ borderBottom: '1px solid #0f2240' }}>
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-3 transition-colors"
        style={{ background: open ? '#1a3a6b' : 'transparent' }}
        onMouseEnter={e => { if (!open) (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-item-hover)'; }}
        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: color + '33' }}>
            <Icon size={13} style={{ color }} />
          </div>
          <span className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>{title}</span>
        </div>
        {open ? <ChevronDown size={14} style={{ color: '#64748b' }} /> : <ChevronRight size={14} style={{ color: '#64748b' }} />}
      </button>
      {open && <div style={{ background: '#0a1929' }}>{children}</div>}
    </div>
  );
}

function InnerRow({ label, value, sub }: { label: string; value?: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between px-6 py-2" style={{ borderBottom: '1px solid #0f2240' }}>
      <div>
        <p className="text-xs font-medium" style={{ color: '#cbd5e1' }}>{label}</p>
        {sub && <p className="text-[10px]" style={{ color: '#475569' }}>{sub}</p>}
      </div>
      {value && <span className="text-xs font-semibold" style={{ color: '#93c5fd' }}>{value}</span>}
    </div>
  );
}

function InnerBtn({ label, icon, color }: { label: string; icon?: React.ReactNode; color?: string }) {
  return (
    <button className="flex items-center gap-2 mx-4 my-2 px-3 py-1.5 rounded text-xs font-semibold text-white transition-opacity hover:opacity-90"
      style={{ background: color ?? 'var(--invicta-blue-mid)' }}>
      {icon}{label}
    </button>
  );
}

function SelectField({ placeholder }: { placeholder: string }) {
  return (
    <div className="mx-4 my-1.5 h-8 rounded px-3 flex items-center text-xs"
      style={{ background: '#1a3a6b', color: '#64748b' }}>{placeholder}</div>
  );
}

// ── seção de limite geográfico ──────────────────────────────────────────────
function GeoSection({ talhao, onUploaded }: {
  talhao: Talhao | null;
  onUploaded: (areaHa: number) => void;
}) {
  const { setUploadedGeo, setUploadedBbox } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<'idle' | 'loading' | 'ok' | 'erro'>('idle');
  const [erroMsg, setErroMsg] = useState('');
  const [dragging, setDragging] = useState(false);

  const temGeo = !!talhao?.geojson;

  async function processar(file: File) {
    setEstado('loading');
    setErroMsg('');
    try {
      const result = await parseGeoFile(file);
      // Persiste no store
      updateTalhao(talhao!.id, {
        geojson: JSON.stringify(result.geojson),
        bbox: result.bbox,
        areaHa: result.areaHa,
        areaHaSemHoles: result.areaHaBruta,
        status: 'ativo',
      });
      // Exibe no mapa
      setUploadedGeo(result.geojson);
      setUploadedBbox(result.bbox);
      setEstado('ok');
      onUploaded(result.areaHa);
    } catch (e: unknown) {
      setEstado('erro');
      setErroMsg(e instanceof Error ? e.message : 'Erro ao processar arquivo.');
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processar(file);
    e.target.value = '';
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processar(file);
  }

  return (
    <div style={{ borderBottom: '1px solid #1a3a6b' }}>
      <div className="px-4 py-2 flex items-center gap-2"
        style={{ background: '#0a1929', borderBottom: '1px solid #0f2240' }}>
        <MapPin size={12} style={{ color: '#93c5fd' }} />
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#93c5fd' }}>
          Limite Geográfico
        </span>
        {temGeo && (
          <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold" style={{ color: '#4ade80' }}>
            <CheckCircle2 size={11} /> {talhao!.areaHa.toLocaleString('pt-BR')} ha
          </span>
        )}
        {!temGeo && (
          <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold" style={{ color: '#fbbf24' }}>
            <AlertTriangle size={11} /> Sem limite
          </span>
        )}
      </div>

      <div className="p-3">
        {/* Zona de drop */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed rounded-lg py-5 text-center cursor-pointer transition-colors"
          style={{
            borderColor: dragging ? '#60a5fa' : estado === 'ok' ? '#4ade80' : '#1e3a5f',
            background: dragging ? '#0f2240' : 'transparent',
          }}>
          {estado === 'loading' ? (
            <div className="flex flex-col items-center gap-2">
              <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="#60a5fa" strokeWidth="3" strokeDasharray="40 20" />
              </svg>
              <p className="text-[10px]" style={{ color: '#64748b' }}>Processando arquivo...</p>
            </div>
          ) : estado === 'ok' ? (
            <div className="flex flex-col items-center gap-1">
              <CheckCircle2 size={20} style={{ color: '#4ade80' }} />
              <p className="text-[10px] font-semibold" style={{ color: '#4ade80' }}>Carregado com sucesso</p>
              <p className="text-[9px]" style={{ color: '#475569' }}>Clique para substituir</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <Upload size={18} style={{ color: '#475569' }} />
              <p className="text-[10px] font-semibold" style={{ color: '#94a3b8' }}>
                {temGeo ? 'Substituir geometria' : 'Carregar KML ou Shapefile'}
              </p>
              <p className="text-[9px]" style={{ color: '#475569' }}>
                Arraste ou clique · .kml · .zip (shapefile) · .geojson
              </p>
            </div>
          )}
        </div>

        {estado === 'erro' && (
          <p className="mt-2 text-[10px] text-center" style={{ color: '#f87171' }}>{erroMsg}</p>
        )}

        {temGeo && estado === 'idle' && (
          <button
            onClick={() => {
              const geo = JSON.parse(talhao!.geojson!) as GeoJSON.FeatureCollection;
              setUploadedGeo(geo);
              setUploadedBbox(talhao!.bbox!);
            }}
            className="mt-2 w-full py-1.5 rounded text-[10px] font-semibold transition-opacity hover:opacity-80"
            style={{ background: '#1a3a6b', color: '#93c5fd' }}>
            Mostrar no mapa
          </button>
        )}

        <input ref={inputRef} type="file" accept=".kml,.zip,.geojson,.json"
          className="hidden" onChange={onFileChange} />
      </div>
    </div>
  );
}

// ── painel principal ────────────────────────────────────────────────────────
export function TalhaoDetailPanel() {
  const { activePanel, setActivePanel, nav, setNav, setMapMode, setUploadedGeo, setUploadedBbox } = useApp();

  const [talhao, setTalhao] = useState<Talhao | null>(null);
  const [safras, setSafras] = useState<Safra[]>([]);
  const [safra, setSafra] = useState('');
  const [mostraFormSafra, setMostraFormSafra] = useState(false);
  const [novaSafra, setNovaSafra] = useState({ anoInicio: new Date().getFullYear(), anoFim: new Date().getFullYear() + 1 });

  // Carrega talhão do store, safras e restaura geo no mapa
  useEffect(() => {
    if (!nav.talhaoId) return;
    const todos = getTalhoes();
    const t = todos.find(x => x.id === nav.talhaoId) ?? null;
    setTalhao(t);
    const sf = getSafras();
    setSafras(sf);
    const ativa = sf.find(s => s.ativa);
    if (ativa) setSafra(ativa.nome);

    if (t?.geojson && t.bbox) {
      try {
        const geo = JSON.parse(t.geojson) as GeoJSON.FeatureCollection;
        setUploadedGeo(geo);
        setUploadedBbox(t.bbox);
      } catch {}
    }
  }, [nav.talhaoId, setUploadedGeo, setUploadedBbox]);

  function voltarFazenda() {
    setNav({ talhaoId: null, talhao: '', area: 0 });
    setMapMode('street');
    setUploadedGeo(null);
    setUploadedBbox(null);
    setActivePanel(`fazenda-${nav.fazendaId}`);
  }

  function handleUploaded(areaHa: number) {
    // Recarrega do store e atualiza nav.area
    const todos = getTalhoes();
    const t = todos.find(x => x.id === nav.talhaoId) ?? null;
    setTalhao(t);
    setNav({ area: areaHa });
  }

  function handleCriarSafra() {
    const { anoInicio, anoFim } = novaSafra;
    if (!anoInicio || !anoFim) return;
    const nome = `${String(anoInicio).slice(-2)}/${String(anoFim).slice(-2)}`;
    // Evita duplicar safra já existente
    const existente = getSafras().find(s => s.nome === nome);
    if (!existente) {
      // Primeira safra do sistema vira a ativa
      const primeira = getSafras().length === 0;
      saveSafra({ nome, anoInicio, anoFim, ativa: primeira });
    }
    const atualizadas = getSafras();
    setSafras(atualizadas);
    setSafra(nome);
    setMostraFormSafra(false);
  }

  return (
    <div className="flex flex-col h-full">

      {/* Cabeçalho do talhão */}
      <div className="flex-shrink-0" style={{ background: '#0a1929', borderBottom: '1px solid #1a3a6b' }}>
        {/* Voltar */}
        <button
          onClick={voltarFazenda}
          className="flex items-center gap-1.5 px-4 py-2 text-xs transition-colors w-full text-left"
          style={{ color: '#93c5fd', borderBottom: '1px solid #0f2240' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-item-hover)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
        >
          <ChevronLeft size={12} /> {nav.fazenda || 'Fazenda'}
        </button>

        {/* Info do talhão */}
        <div className="px-4 py-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-base font-bold" style={{ color: '#fff' }}>{nav.talhao}</p>
              <p className="text-xs mt-0.5" style={{ color: '#93c5fd' }}>{nav.fazenda}</p>
              <p className="text-xs" style={{ color: '#64748b' }}>
                {nav.area > 0 ? `${nav.area.toLocaleString('pt-BR')} ha · ` : ''}{nav.produtor}
              </p>
            </div>
            <span className="text-[10px] px-2 py-1 rounded-full font-semibold"
              style={{
                background: talhao?.status === 'ativo' ? '#166534' : '#78350f',
                color: talhao?.status === 'ativo' ? '#86efac' : '#fde68a',
              }}>
              {talhao?.status === 'ativo' ? 'Ativo' : 'Incompleto'}
            </span>
          </div>
        </div>

        {/* Seletor de Safra */}
        <div className="px-4 py-2" style={{ borderTop: '1px solid #0f2240' }}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-wider flex-shrink-0" style={{ color: '#64748b' }}>Safra</span>
            {safras.length === 0 && !mostraFormSafra && (
              <span className="text-[10px]" style={{ color: '#475569' }}>Nenhuma safra cadastrada</span>
            )}
            {safras.map(s => (
              <button key={s.id}
                onClick={() => setSafra(s.nome)}
                className="px-2.5 py-1 rounded text-xs font-bold transition-colors"
                style={{
                  background: safra === s.nome ? 'var(--invicta-blue-mid)' : '#1a3a6b',
                  color: safra === s.nome ? '#fff' : '#64748b',
                }}>
                {s.nome}
              </button>
            ))}
            {/* Botão criar safra a partir do talhão */}
            <button onClick={() => setMostraFormSafra(v => !v)}
              title="Cadastrar safra"
              className="px-1.5 py-1 rounded text-xs font-bold flex items-center gap-0.5 transition-colors"
              style={{ background: mostraFormSafra ? '#374151' : 'var(--invicta-green-dark)', color: '#fff' }}>
              {mostraFormSafra ? <X size={12} /> : <Plus size={12} />}
            </button>
          </div>

          {/* Mini-form de nova safra */}
          {mostraFormSafra && (
            <div className="mt-2 p-2 rounded space-y-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <label className="text-[9px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Ano início</label>
                  <input type="number" value={novaSafra.anoInicio} min={2000} max={2100}
                    onChange={e => setNovaSafra(p => ({ ...p, anoInicio: Number(e.target.value) }))}
                    className="w-full rounded px-2 py-1 text-xs outline-none"
                    style={{ background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' }} />
                </div>
                <div className="flex-1">
                  <label className="text-[9px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Ano fim</label>
                  <input type="number" value={novaSafra.anoFim} min={2000} max={2100}
                    onChange={e => setNovaSafra(p => ({ ...p, anoFim: Number(e.target.value) }))}
                    className="w-full rounded px-2 py-1 text-xs outline-none"
                    style={{ background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' }} />
                </div>
              </div>
              <button onClick={handleCriarSafra}
                className="w-full py-1.5 rounded text-xs font-bold text-white flex items-center justify-center gap-1"
                style={{ background: 'var(--invicta-green-dark)' }}>
                <Save size={11} /> Cadastrar {String(novaSafra.anoInicio).slice(-2)}/{String(novaSafra.anoFim).slice(-2)}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Módulos */}
      <div className="flex-1 overflow-y-auto">

        {/* Limite Geográfico — sempre visível no topo */}
        <GeoSection talhao={talhao} onUploaded={handleUploaded} />

        {/* Amostragem */}
        <AccordionSection title="Amostragem" icon={Grid3x3} color="#60a5fa" moduleId="amostragem">
          <SimuladorAmostragem />
        </AccordionSection>

        {/* Laboratório */}
        <AccordionSection title="Importação Laboratório" icon={TestTube} color="#a78bfa">
          <div className="py-1">
            <SelectField placeholder="Selecionar laboratório parceiro..." />
            <SelectField placeholder="Selecionar campanha de amostragem..." />
            <div className="mx-4 my-2 border-2 border-dashed rounded-lg py-4 text-center"
              style={{ borderColor: '#1a3a6b' }}>
              <Upload size={16} className="mx-auto mb-1" style={{ color: '#475569' }} />
              <p className="text-[10px]" style={{ color: '#475569' }}>Arraste XLSX / CSV aqui</p>
            </div>
            <InnerBtn label="Importar Resultados" icon={<Upload size={11} />} color="#7c3aed" />
            <p className="px-6 py-1 text-[10px] uppercase tracking-wider mt-1" style={{ color: '#475569' }}>Importações</p>
            <InnerRow label="Laborsolo — Ago/2024" value="Importado" sub="24 amostras · 2 profundidades" />
            <InnerRow label="Soloanalise — Out/2024" value="Aguardando" sub="30 amostras" />
          </div>
        </AccordionSection>

        {/* QR Code */}
        <AccordionSection title="QR Code e Etiquetas" icon={QrCode} color="#34d399">
          <div className="py-1">
            <SelectField placeholder="Selecionar campanha de amostragem..." />
            <InnerRow label="Etiquetas disponíveis" value="24" sub="Campanha Ago/2024" />
            <InnerRow label="Profundidades" value="0–10 / 10–20 cm" />
            <InnerBtn label="Gerar Etiquetas PDF" icon={<Download size={11} />} color="#065f46" />
          </div>
        </AccordionSection>

        {/* Fertilidade */}
        <AccordionSection title="Fertilidade" icon={Leaf} color="#4ade80">
          <div className="py-1">
            <p className="px-6 py-1 text-[10px] uppercase tracking-wider" style={{ color: '#475569' }}>Fluxo</p>
            {['Grid (Interpolação espacial)', 'Zonas de Manejo (valor por zona)'].map(f => (
              <div key={f} className="flex items-center gap-2 px-6 py-1.5 text-xs"
                style={{ color: '#94a3b8', borderBottom: '1px solid #0f2240' }}>
                <input type="radio" name="fluxo-fert" className="accent-green-500" defaultChecked={f.startsWith('Grid')} />
                {f}
              </div>
            ))}
            <SelectField placeholder="Metodologia / Legenda..." />
            <SelectField placeholder="Profundidade..." />
            <p className="px-6 py-1 text-[10px] uppercase tracking-wider mt-1" style={{ color: '#475569' }}>Nutriente</p>
            <div className="flex flex-wrap gap-1 px-6 py-2">
              {['pH', 'P', 'K', 'Ca', 'Mg', 'V%', 'MO', 'B', 'Zn'].map((n, i) => (
                <button key={n} className="px-2 py-1 rounded text-[10px] font-bold"
                  style={{ background: i === 1 ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: i === 1 ? '#fff' : '#64748b' }}>
                  {n}
                </button>
              ))}
            </div>
            <InnerBtn label="Processar Fertilidade" icon={<Play size={11} />} color="#166534" />
            <InnerRow label="Último processamento" value="Set/2024" sub="P · Grid · Embrapa Cerrado" />
          </div>
        </AccordionSection>

        {/* NDVI / Satélite */}
        <AccordionSection title="NDVI / Satélite" icon={Satellite} color="#38bdf8">
          <div className="py-1">
            <p className="px-6 py-1 text-[10px] uppercase tracking-wider" style={{ color: '#475569' }}>Fonte</p>
            {['Sentinel-2 (Biomassa / Visual)', 'Sensor Falker (Recomendação N)'].map(f => (
              <div key={f} className="flex items-center gap-2 px-6 py-1.5 text-xs"
                style={{ color: '#94a3b8', borderBottom: '1px solid #0f2240' }}>
                <input type="radio" name="fonte-ndvi" className="accent-blue-400" defaultChecked={f.includes('Sentinel')} />
                {f}
              </div>
            ))}
            <SelectField placeholder="Data da imagem..." />
            <InnerBtn label="Importar GeoTIFF" icon={<Upload size={11} />} color="#1d4ed8" />
            <InnerRow label="Jan/2025" value="NDVI 0.71" sub="Sentinel-2 · média" />
            <InnerRow label="Nov/2024" value="NDVI 0.64" sub="Sentinel-2 · média" />
          </div>
        </AccordionSection>

        {/* Condutividade Elétrica */}
        <AccordionSection title="Condutividade Elétrica" icon={Zap} color="#fbbf24">
          <div className="py-1">
            <SelectField placeholder="Data de coleta..." />
            <SelectField placeholder="Equipamento utilizado..." />
            <div className="mx-4 my-2 border-2 border-dashed rounded-lg py-4 text-center"
              style={{ borderColor: '#1a3a6b' }}>
              <Upload size={16} className="mx-auto mb-1" style={{ color: '#475569' }} />
              <p className="text-[10px]" style={{ color: '#475569' }}>Arraste CSV do equipamento</p>
            </div>
            <InnerBtn label="Importar CSV" icon={<Upload size={11} />} color="#92400e" />
            <InnerRow label="CE Disponível" value="Mar/2024" sub="Veris 3100 · camada estrutural" />
          </div>
        </AccordionSection>

        {/* Produtividade */}
        <AccordionSection title="Produtividade / Colheita" icon={BarChart3} color="#f472b6">
          <div className="py-1">
            <SelectField placeholder="Cultura / Safra..." />
            <div className="mx-4 my-2 border-2 border-dashed rounded-lg py-4 text-center"
              style={{ borderColor: '#1a3a6b' }}>
              <Upload size={16} className="mx-auto mb-1" style={{ color: '#475569' }} />
              <p className="text-[10px]" style={{ color: '#475569' }}>Shapefile ou CSV da colheitadeira</p>
            </div>
            <InnerBtn label="Importar e Limpar Outliers" icon={<Play size={11} />} color="#9d174d" />
            <InnerRow label="Soja 24/25" value="62,4 sc/ha" sub="Mapa limpo · Fev/2025" />
          </div>
        </AccordionSection>

        {/* Zonas de Manejo */}
        <AccordionSection title="Zonas de Manejo" icon={Layers} color="#c084fc">
          <div className="py-1">
            <p className="px-6 py-1 text-[10px] uppercase tracking-wider" style={{ color: '#475569' }}>Camadas</p>
            {['CE', 'NDVI Histórico', 'Fertilidade', 'Produtividade'].map(c => (
              <div key={c} className="flex items-center gap-2 px-6 py-1.5 text-xs"
                style={{ color: '#94a3b8', borderBottom: '1px solid #0f2240' }}>
                <input type="checkbox" className="accent-purple-500" defaultChecked={c === 'CE'} /> {c}
              </div>
            ))}
            <p className="px-6 py-1 text-[10px] uppercase tracking-wider mt-1" style={{ color: '#475569' }}>Número de zonas</p>
            <div className="flex gap-1.5 px-6 py-2">
              {[2, 3, 4, 5].map(n => (
                <button key={n} className="flex-1 py-1 rounded text-xs font-bold"
                  style={{ background: n === 4 ? '#7c3aed' : '#1a3a6b', color: '#fff' }}>{n}</button>
              ))}
            </div>
            <InnerBtn label="Gerar Zonas de Manejo" icon={<Play size={11} />} color="#6d28d9" />
            <InnerRow label="Versão atual: v2" value="4 zonas" sub="CE + NDVI · Ago/2024" />
          </div>
        </AccordionSection>

        {/* Mapas de Aplicação */}
        <AccordionSection title="Mapas de Aplicação" icon={FileSpreadsheet} color="#fb923c">
          <div className="py-1">
            <SelectField placeholder="Tipo de aplicação..." />
            <SelectField placeholder="Produto..." />
            <InnerRow label="Dose mínima" value="80 kg/ha" />
            <InnerRow label="Dose máxima" value="220 kg/ha" />
            <InnerBtn label="Gerar Mapa de Aplicação" icon={<Play size={11} />} color="#92400e" />
            <p className="px-6 py-1 text-[10px] uppercase tracking-wider mt-1" style={{ color: '#475569' }}>Exportar para</p>
            <div className="flex flex-wrap gap-1.5 px-6 py-2">
              {['John Deere', 'Trimble', 'Case', 'Raven', 'Stara', 'SHP'].map(f => (
                <button key={f} className="px-2 py-1 rounded text-[10px] font-medium flex items-center gap-1"
                  style={{ background: '#1a3a6b', color: '#93c5fd' }}>
                  <Download size={9} />{f}
                </button>
              ))}
            </div>
          </div>
        </AccordionSection>

        {/* Relatórios */}
        <AccordionSection title="Relatórios" icon={FileText} color="#94a3b8">
          <div className="py-1">
            <SelectField placeholder="Tipo de relatório..." />
            <InnerBtn label="Gerar Relatório" icon={<Play size={11} />} color="var(--invicta-blue)" />
            <InnerRow label="Fertilidade — Set/2024" value="PDF" sub="Liberado ao produtor" />
            <InnerRow label="NDVI — Jan/2025" value="PDF" sub="Aguardando revisão" />
          </div>
        </AccordionSection>

      </div>
    </div>
  );
}
