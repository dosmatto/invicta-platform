'use client';

// Repositório de Medições de campo (painel web). Lista as medições que o app
// de coleta enviou pra nuvem (+ locais), mostra no mapa e permite baixar
// (SHP/KML/GeoJSON), CRIAR um talhão a partir do polígono ou SUBSTITUIR o
// limite de um talhão existente. Fecha o ciclo campo → escritório.

import { useState, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useApp } from '@/context/AppContext';
import {
  MedicaoCampo, carregarMedicoes, excluirMedicao, salvarMedicao, formatarDist,
} from '@/lib/coleta';
import {
  ehPoligono, areaHaMedicao, perimetroM, bboxMedicao, medicaoParaFC,
  baixarShp, baixarKML, baixarGeoJSON, criarTalhaoDaMedicao, substituirLimiteTalhao,
} from '@/lib/medicoesRepo';
import { extrairEditavel } from '@/lib/geoEditor';
import { fcDeMedicao, compartilharLinkCampo } from '@/lib/campoLink';
import { getClientes, getFazendas, getTalhoes } from '@/lib/store';
import { verificarTrocaPoligono, mensagemBloqueioTroca } from '@/lib/trocaPoligono';
import { escopoClienteIds, emailUsuario } from '@/lib/empresa';
import {
  RefreshCw, Loader2, Ruler, MapPin, Eye, Download, Plus, Repeat, Trash2, X, CheckCircle2, CloudUpload, Pencil, Link2,
} from 'lucide-react';

const EditorGeometria = dynamic(
  () => import('@/components/geo/EditorGeometria').then(m => ({ default: m.EditorGeometria })),
  { ssr: false },
);

const BORDA = '#1a3a6b', TXT = '#e2e8f0', SUB = '#64748b';

export function MedicoesPanel() {
  const { setUploadedGeo, setUploadedBbox, setMapMode } = useApp();
  const [meds, setMeds] = useState<MedicaoCampo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'todos' | 'poligono' | 'linha' | 'ponto'>('todos');
  const [acao, setAcao] = useState<{ m: MedicaoCampo; tipo: 'criar' | 'substituir' } | null>(null);
  const [editando, setEditando] = useState<MedicaoCampo | null>(null);
  const [msg, setMsg] = useState('');

  const recarregar = useCallback(async () => {
    setCarregando(true);
    const todas = await carregarMedicoes();
    // Vínculo (consultoria): usuário limitado vê só medições dos SEUS talhões
    // (getTalhoes já vem filtrado pelo escopo) + as que ele mesmo criou.
    const esc = escopoClienteIds();
    if (!esc) { setMeds(todas); }
    else {
      const meusTalhoes = new Set(getTalhoes().map(t => t.id));
      const meu = emailUsuario();
      setMeds(todas.filter(m =>
        (m.talhaoId && meusTalhoes.has(m.talhaoId)) || (!!meu && m.operador === meu),
      ));
    }
    setCarregando(false);
  }, []);
  useEffect(() => { void recarregar(); }, [recarregar]);

  const lista = useMemo(
    () => meds.filter(m => filtro === 'todos' || m.tipo === filtro),
    [meds, filtro],
  );

  function verNoMapa(m: MedicaoCampo) {
    setUploadedGeo(medicaoParaFC(m));
    setUploadedBbox(bboxMedicao(m));
    setMapMode('satellite');
    setMsg(`"${m.nome}" no mapa.`);
  }

  async function excluir(m: MedicaoCampo) {
    if (!confirm(`Excluir a medição "${m.nome}"?`)) return;
    excluirMedicao(m.id);
    setMsg(`"${m.nome}" excluída.`);
    await recarregar();
  }

  // aplica o resultado do editor: a 1ª parte ATUALIZA a medição; as demais
  // (depois de um corte) viram NOVAS medições "nome (2)", "nome (3)"…
  async function aplicarEdicao(m: MedicaoCampo, fcs: GeoJSON.FeatureCollection[]) {
    const eds = fcs.map(extrairEditavel).filter((e): e is NonNullable<typeof e> => !!e);
    if (!eds.length) { setEditando(null); setMsg('⚠ Edição vazia — nada salvo.'); return; }
    const [prim, ...resto] = eds;
    // pontos (metadados da caminhada) deixam de corresponder após editar → saem
    salvarMedicao({
      ...m, coords: prim.anel,
      furos: prim.tipo === 'poligono' && prim.furos.length ? prim.furos : undefined,
      pontos: undefined,
    });
    resto.forEach((ed, i) => {
      salvarMedicao({
        id: `med_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
        nome: `${m.nome} (${i + 2})`,
        tipo: 'poligono', coords: ed.anel,
        furos: ed.furos.length ? ed.furos : undefined,
        categoria: m.categoria, obs: m.obs, talhaoId: m.talhaoId, talhaoNome: m.talhaoNome,
        safra: m.safra, criadoEm: new Date().toISOString(), operador: m.operador,
      });
    });
    setEditando(null);
    setMsg(resto.length ? `"${m.nome}" editada e dividida em ${eds.length} áreas.` : `"${m.nome}" editada.`);
    await recarregar();
  }

  return (
    <div className="flex flex-col h-full">
      {/* topo */}
      <div className="flex items-center gap-2 px-4 py-2.5 flex-shrink-0" style={{ borderBottom: `1px solid ${BORDA}` }}>
        <Ruler size={14} style={{ color: '#93c5fd' }} />
        <span className="text-xs font-bold flex-1" style={{ color: TXT }}>
          {carregando ? 'Carregando…' : `${meds.length} medição(ões)`}
        </span>
        <button onClick={() => void recarregar()} disabled={carregando}
          className="p-1.5 rounded-lg disabled:opacity-50" style={{ background: BORDA, color: '#93c5fd' }} title="Atualizar">
          {carregando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
      </div>

      {/* filtros */}
      <div className="flex gap-1.5 px-4 py-2 flex-shrink-0" style={{ borderBottom: `1px solid #0f2240` }}>
        {([['todos', 'Todas'], ['poligono', 'Áreas'], ['linha', 'Linhas'], ['ponto', 'Pontos']] as const).map(([f, r]) => (
          <button key={f} onClick={() => setFiltro(f)}
            className="px-2.5 py-1 rounded-full text-[10px] font-bold"
            style={{ background: filtro === f ? '#2e5fa3' : BORDA, color: filtro === f ? '#fff' : '#94a3b8' }}>
            {r}
          </button>
        ))}
      </div>

      {msg && <p className="px-4 py-1.5 text-[10px] flex-shrink-0" style={{ color: '#94a3b8', background: '#0b1d3a' }}>{msg}</p>}

      {/* lista */}
      <div className="flex-1 overflow-y-auto">
        {!carregando && lista.length === 0 && (
          <div className="px-4 py-10 text-center">
            <Ruler size={26} className="mx-auto mb-2" style={{ color: '#2e3f5c' }} />
            <p className="text-xs" style={{ color: '#475569' }}>Nenhuma medição ainda.</p>
            <p className="text-[11px] mt-1" style={{ color: '#2e3f5c' }}>Elas aparecem aqui quando o app de campo sincroniza.</p>
          </div>
        )}
        {lista.map(m => {
          const poli = ehPoligono(m);
          const medida = poli
            ? `${(areaHaMedicao(m) ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ha`
            : formatarDist(perimetroM(m.coords, false));
          const aberto = sel === m.id;
          return (
            <div key={m.id} style={{ borderBottom: '1px solid #0f2240' }}>
              <button onClick={() => setSel(aberto ? null : m.id)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-item-hover)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: poli ? '#166534' : '#1e3a8a' }}>
                  {poli ? <MapPin size={13} style={{ color: '#86efac' }} /> : <Ruler size={13} style={{ color: '#93c5fd' }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: TXT }}>{m.nome}</p>
                  <p className="text-[10px] truncate" style={{ color: SUB }}>
                    {medida}{m.categoria ? ` · ${m.categoria}` : ''}{m.talhaoNome ? ` · ${m.talhaoNome}` : ''}
                  </p>
                </div>
                {m.syncPendente
                  ? <CloudUpload size={13} style={{ color: '#fbbf24' }} />
                  : <CheckCircle2 size={13} style={{ color: '#4ade80' }} />}
              </button>

              {aberto && (
                <div className="px-4 pb-3 pt-1 space-y-2" style={{ background: '#0a1929' }}>
                  {m.obs && <p className="text-[10px]" style={{ color: '#94a3b8' }}>{m.obs}</p>}
                  <p className="text-[9px]" style={{ color: '#475569' }}>
                    {(m.pontos?.length ?? m.coords.length)} pontos{m.operador ? ` · ${m.operador}` : ''}
                    {m.criadoEm ? ` · ${new Date(m.criadoEm).toLocaleString('pt-BR')}` : ''}
                    {m.safra ? ` · ${m.safra}` : ''}
                  </p>

                  <div className="grid grid-cols-2 gap-1.5">
                    <BotaoAcao icon={<Eye size={12} />} label="Ver no mapa" onClick={() => verNoMapa(m)} />
                    {(() => {
                      const fcLink = fcDeMedicao(m);
                      return (
                        <BotaoAcao icon={<Link2 size={12} />} label="Link do prestador" cor="#1a3a6b"
                          disabled={!fcLink}
                          title={fcLink ? 'Link do prestador (abre só esta área, sem login)' : 'sem geometria'}
                          onClick={() => { if (fcLink) void compartilharLinkCampo(m.nome, fcLink); }} />
                      );
                    })()}
                    <BotaoAcao icon={<Pencil size={12} />} label="Editar traçado" cor="#5b21b6" onClick={() => setEditando(m)} />
                    <BotaoAcao icon={<Download size={12} />} label="Baixar SHP" onClick={() => void baixarShp(m).catch(() => setMsg('Falha ao gerar SHP.'))} />
                    <BotaoAcao icon={<Download size={12} />} label="Baixar KML" onClick={() => baixarKML(m)} />
                    <BotaoAcao icon={<Download size={12} />} label="GeoJSON" onClick={() => baixarGeoJSON(m)} />
                    {poli && <BotaoAcao icon={<Plus size={12} />} label="Criar talhão" cor="#166534" onClick={() => setAcao({ m, tipo: 'criar' })} />}
                    {poli && <BotaoAcao icon={<Repeat size={12} />} label="Substituir limite" cor="#78350f" onClick={() => setAcao({ m, tipo: 'substituir' })} />}
                  </div>
                  <button onClick={() => void excluir(m)}
                    className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg text-[11px] font-bold"
                    style={{ background: '#7f1d1d', color: '#fca5a5' }}>
                    <Trash2 size={12} /> Excluir medição
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {acao && (
        <TalhaoDialog m={acao.m} tipo={acao.tipo}
          onFechar={() => setAcao(null)}
          onFeito={txt => { setAcao(null); setMsg(txt); }} />
      )}

      {editando && (
        <EditorGeometria titulo={editando.nome} fc={medicaoParaFC(editando)}
          onSalvar={fcs => void aplicarEdicao(editando, fcs)}
          onFechar={() => setEditando(null)} />
      )}
    </div>
  );
}

function BotaoAcao({ icon, label, onClick, cor, disabled, title }: { icon: React.ReactNode; label: string; onClick: () => void; cor?: string; disabled?: boolean; title?: string }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-bold text-white active:opacity-70 disabled:opacity-40"
      style={{ background: cor ?? 'var(--invicta-blue-mid)' }}>
      {icon}{label}
    </button>
  );
}

// ── criar / substituir talhão ─────────────────────────────────────────────────
function TalhaoDialog({ m, tipo, onFechar, onFeito }: {
  m: MedicaoCampo; tipo: 'criar' | 'substituir';
  onFechar: () => void; onFeito: (msg: string) => void;
}) {
  const clientes = useMemo(() => getClientes(), []);
  const [clienteId, setClienteId] = useState('');
  const [fazendaId, setFazendaId] = useState('');
  const [talhaoId, setTalhaoId] = useState('');
  const [nome, setNome] = useState(m.nome);
  const [verificando, setVerificando] = useState(false);
  const [erroTroca, setErroTroca] = useState('');
  const fazendas = useMemo(() => clienteId ? getFazendas(clienteId) : [], [clienteId]);
  const talhoes = useMemo(() => fazendaId ? getTalhoes(fazendaId) : [], [fazendaId]);

  async function confirmar() {
    if (tipo === 'criar') {
      if (!fazendaId || !nome.trim()) return;
      criarTalhaoDaMedicao(m, fazendaId, nome);
      onFeito(`Talhão "${nome.trim()}" criado a partir da medição.`);
    } else {
      if (!talhaoId || verificando) return;
      const t = talhoes.find(x => x.id === talhaoId);
      // Substituição de limite existente: só com o ciclo atual sem dados (trocaPoligono.ts).
      if (t?.geojson) {
        setVerificando(true); setErroTroca('');
        const v = await verificarTrocaPoligono(talhaoId);
        setVerificando(false);
        if (!v.permitido) { setErroTroca(mensagemBloqueioTroca(v)); return; }
        substituirLimiteTalhao(m, talhaoId);
        onFeito(`Limite de "${t?.nome ?? 'talhão'}" substituído pela medição${v.ciclo ? ` (ciclo verificado: ${v.ciclo}, sem dados)` : ''}. O limite anterior ficou arquivado.`);
        return;
      }
      substituirLimiteTalhao(m, talhaoId);
      onFeito(`Limite de "${t?.nome ?? 'talhão'}" substituído pela medição.`);
    }
  }

  const areaHa = areaHaMedicao(m);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.65)' }} onClick={onFechar}>
      <div className="w-full max-w-sm rounded-2xl p-5 space-y-4" style={{ background: 'var(--invicta-blue)', border: `1px solid ${BORDA}` }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold flex-1" style={{ color: TXT }}>
            {tipo === 'criar' ? 'Criar talhão da medição' : 'Substituir limite de talhão'}
          </p>
          <button onClick={onFechar} className="p-1" style={{ color: SUB }}><X size={16} /></button>
        </div>
        <p className="text-[11px]" style={{ color: '#4ade80' }}>
          {m.nome} · {areaHa != null ? `${areaHa.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ha` : ''}
        </p>

        <div>
          <label className="text-[10px] font-semibold block mb-1" style={{ color: SUB }}>Cliente</label>
          <select value={clienteId} onChange={e => { setClienteId(e.target.value); setFazendaId(''); setTalhaoId(''); }}
            className="w-full rounded-lg px-2 py-2 text-xs outline-none" style={{ background: BORDA, color: TXT, border: '1px solid #2e5fa3' }}>
            <option value="">— selecione —</option>
            {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-semibold block mb-1" style={{ color: SUB }}>Fazenda</label>
          <select value={fazendaId} onChange={e => { setFazendaId(e.target.value); setTalhaoId(''); }} disabled={!clienteId}
            className="w-full rounded-lg px-2 py-2 text-xs outline-none disabled:opacity-50" style={{ background: BORDA, color: TXT, border: '1px solid #2e5fa3' }}>
            <option value="">— selecione —</option>
            {fazendas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </div>

        {tipo === 'criar' ? (
          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{ color: SUB }}>Nome do talhão *</label>
            <input value={nome} onChange={e => setNome(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: BORDA, color: TXT, border: '1px solid #2e5fa3' }} />
          </div>
        ) : (
          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{ color: SUB }}>Talhão a substituir *</label>
            <select value={talhaoId} onChange={e => { setTalhaoId(e.target.value); setErroTroca(''); }} disabled={!fazendaId}
              className="w-full rounded-lg px-2 py-2 text-xs outline-none disabled:opacity-50" style={{ background: BORDA, color: TXT, border: '1px solid #2e5fa3' }}>
              <option value="">— selecione —</option>
              {talhoes.map(t => <option key={t.id} value={t.id}>{t.nome}{t.areaHa ? ` (${t.areaHa} ha)` : ''}</option>)}
            </select>
            {talhaoId && <p className="text-[10px] mt-1" style={{ color: '#fbbf24' }}>⚠ O limite atual será substituído pelo desta medição.</p>}
            {erroTroca && <p className="text-[10px] mt-1.5 leading-snug" style={{ color: '#fca5a5' }}>{erroTroca}</p>}
          </div>
        )}

        <button onClick={() => void confirmar()}
          disabled={(tipo === 'criar' ? (!fazendaId || !nome.trim()) : !talhaoId) || verificando}
          className="w-full py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40"
          style={{ background: tipo === 'criar' ? '#16a34a' : '#b45309' }}>
          {tipo === 'criar' ? 'Criar talhão' : verificando ? 'Verificando ciclo…' : 'Substituir limite'}
        </button>
      </div>
    </div>
  );
}
