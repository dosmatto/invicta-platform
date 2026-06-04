'use client';

import { useState } from 'react';
import { LEGENDAS_PADRAO, LegendaNutriente } from '@/constants/agronomica';
import { NutrienteCard } from '@/components/agronomica/NutrienteCard';
import { LegendaBar } from '@/components/agronomica/LegendaBar';
import { FlaskConical, BookOpen, Layers, Search, Info } from 'lucide-react';

export default function BaseAgronomicaPage() {
  const [legendas, setLegendas] = useState<LegendaNutriente[]>(LEGENDAS_PADRAO);
  const [busca, setBusca] = useState('');
  const [aba, setAba] = useState<'legendas' | 'profundidades' | 'metodologias'>('legendas');

  const legendasFiltradas = legendas.filter(l =>
    l.nome.toLowerCase().includes(busca.toLowerCase()) ||
    l.simbolo.toLowerCase().includes(busca.toLowerCase())
  );

  function handleSave(updated: LegendaNutriente) {
    setLegendas(prev => prev.map(l => l.id === updated.id ? updated : l));
  }

  const PROFUNDIDADES = [
    { label: '0–10 cm', ativa: true },
    { label: '0–20 cm', ativa: true },
    { label: '10–20 cm', ativa: true },
    { label: '20–40 cm', ativa: true },
    { label: '40–60 cm', ativa: false },
  ];

  const METODOLOGIAS = [
    { nome: 'Embrapa Cerrado', regiao: 'Cerrado / MT / GO / MS', culturas: 'Soja, Milho, Algodão', padrao: true },
    { nome: 'CQFS RS/SC', regiao: 'Sul do Brasil', culturas: 'Soja, Trigo, Milho', padrao: false },
    { nome: 'IAC', regiao: 'São Paulo', culturas: 'Cana, Citricultura', padrao: false },
    { nome: 'Legenda Invicta', regiao: 'Personalizada', culturas: 'Todos', padrao: false },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#060e1a' }}>

      {/* Header da página */}
      <div className="flex-shrink-0 px-6 py-4 flex items-center justify-between"
        style={{ borderBottom: '1px solid #1a3a6b', background: '#0a1929' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--invicta-blue)' }}>
            <FlaskConical size={18} style={{ color: '#93c5fd' }} />
          </div>
          <div>
            <h1 className="text-base font-bold" style={{ color: '#fff' }}>Base Agronômica</h1>
            <p className="text-xs" style={{ color: '#475569' }}>
              Configuração de legendas, classes e parâmetros técnicos
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg"
          style={{ background: '#1a3a6b', color: '#64748b' }}>
          <Info size={12} />
          Dados aplicados a todos os processamentos
        </div>
      </div>

      {/* Abas */}
      <div className="flex flex-shrink-0 px-6" style={{ borderBottom: '1px solid #1a3a6b', background: '#0a1929' }}>
        {[
          { id: 'legendas',      label: 'Legendas e Classes',  icon: Layers },
          { id: 'profundidades', label: 'Profundidades',       icon: Layers },
          { id: 'metodologias',  label: 'Metodologias',        icon: BookOpen },
        ].map(({ id, label, icon: Icon }) => (
          <button key={id}
            onClick={() => setAba(id as typeof aba)}
            className="flex items-center gap-2 px-4 py-3 text-sm font-semibold transition-colors"
            style={{
              color: aba === id ? '#fff' : '#475569',
              borderBottom: aba === id ? '2px solid var(--invicta-green)' : '2px solid transparent',
              background: 'transparent',
            }}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto px-6 py-5">

        {/* ABA: Legendas */}
        {aba === 'legendas' && (
          <div className="space-y-4">

            {/* Paleta padrão */}
            <div className="rounded-xl p-5 mb-6" style={{ background: '#0a1929', border: '1px solid #1a3a6b' }}>
              <p className="text-sm font-bold mb-3" style={{ color: '#e2e8f0' }}>
                Paleta de Cores Padrão — Todos os Nutrientes
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-xs font-semibold mb-2" style={{ color: '#64748b' }}>
                    PADRÃO — pH, P, K, Ca, Mg, MO, S, B, Zn, Cu, Mn, CTC, V%
                  </p>
                  <LegendaBar legenda={LEGENDAS_PADRAO[0]} size="lg" />
                </div>
                <div>
                  <p className="text-xs font-semibold mb-2" style={{ color: '#a78bfa' }}>
                    INVERTIDO — Alumínio (Al) e Saturação de Alumínio (m%)
                  </p>
                  <LegendaBar legenda={LEGENDAS_PADRAO[5]} size="lg" />
                </div>
              </div>
              <p className="text-[10px] mt-3 italic" style={{ color: '#475569' }}>
                Vermelho = Baixo · Laranja = Médio-Baixo · Amarelo = Médio · Verde = Alto · Azul = Muito Alto · Roxo = Máximo.
                Para Al e m%, a escala é invertida: valores altos indicam toxidez (vermelho = ruim).
              </p>
            </div>

            {/* Busca */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-4 w-64"
              style={{ background: '#0a1929', border: '1px solid #1a3a6b' }}>
              <Search size={14} style={{ color: '#475569' }} />
              <input
                type="text"
                placeholder="Buscar nutriente..."
                value={busca}
                onChange={e => setBusca(e.target.value)}
                className="bg-transparent text-sm flex-1 outline-none"
                style={{ color: '#e2e8f0' }}
              />
            </div>

            {/* Cards de nutrientes */}
            <div className="space-y-3">
              {legendasFiltradas.map(l => (
                <NutrienteCard key={l.id} legenda={l} onSave={handleSave} />
              ))}
            </div>
          </div>
        )}

        {/* ABA: Profundidades */}
        {aba === 'profundidades' && (
          <div className="max-w-lg space-y-3">
            <p className="text-xs mb-4" style={{ color: '#475569' }}>
              Profundidades disponíveis para coleta de amostras. Profundidades inativas não aparecem nas campanhas.
              Não é possível editar uma profundidade após ela ter dados vinculados — apenas inativar.
            </p>
            {PROFUNDIDADES.map(p => (
              <div key={p.label} className="flex items-center justify-between rounded-xl px-5 py-4"
                style={{ background: '#0a1929', border: '1px solid #1a3a6b' }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: p.ativa ? '#166534' : '#1a3a6b' }}>
                    <Layers size={14} style={{ color: p.ativa ? '#86efac' : '#475569' }} />
                  </div>
                  <span className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>{p.label}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs px-2 py-1 rounded-full font-semibold"
                    style={{
                      background: p.ativa ? '#166534' : '#1a3a6b',
                      color: p.ativa ? '#86efac' : '#475569',
                    }}>
                    {p.ativa ? 'Ativa' : 'Inativa'}
                  </span>
                  <button className="text-xs px-3 py-1.5 rounded font-medium"
                    style={{ background: '#1a3a6b', color: '#93c5fd' }}>
                    {p.ativa ? 'Inativar' : 'Ativar'}
                  </button>
                </div>
              </div>
            ))}
            <button className="w-full py-3 rounded-xl text-sm font-semibold mt-4"
              style={{ background: '#1a3a6b', color: '#93c5fd', border: '1px dashed #2e5fa3' }}>
              + Nova Profundidade
            </button>
          </div>
        )}

        {/* ABA: Metodologias */}
        {aba === 'metodologias' && (
          <div className="max-w-2xl space-y-3">
            <p className="text-xs mb-4" style={{ color: '#475569' }}>
              Metodologias disponíveis para classificação de fertilidade. Cada legenda é configurada por metodologia.
              A metodologia padrão é aplicada automaticamente nos processamentos, mas pode ser sobrescrita por talhão.
            </p>
            {METODOLOGIAS.map(m => (
              <div key={m.nome} className="rounded-xl px-5 py-4"
                style={{ background: '#0a1929', border: `1px solid ${m.padrao ? 'var(--invicta-green)' : '#1a3a6b'}` }}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-bold" style={{ color: '#e2e8f0' }}>{m.nome}</p>
                      {m.padrao && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                          style={{ background: '#166534', color: '#86efac' }}>Padrão</span>
                      )}
                    </div>
                    <p className="text-xs" style={{ color: '#64748b' }}>Região: {m.regiao}</p>
                    <p className="text-xs" style={{ color: '#64748b' }}>Culturas: {m.culturas}</p>
                  </div>
                  <div className="flex gap-2">
                    {!m.padrao && (
                      <button className="text-xs px-3 py-1.5 rounded font-medium"
                        style={{ background: '#1a3a6b', color: '#93c5fd' }}>
                        Definir padrão
                      </button>
                    )}
                    <button className="text-xs px-3 py-1.5 rounded font-medium"
                      style={{ background: '#1a3a6b', color: '#93c5fd' }}>
                      Editar
                    </button>
                  </div>
                </div>
              </div>
            ))}
            <button className="w-full py-3 rounded-xl text-sm font-semibold mt-4"
              style={{ background: '#1a3a6b', color: '#93c5fd', border: '1px dashed #2e5fa3' }}>
              + Nova Metodologia
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
