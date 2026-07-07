'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/context/AppContext';
import {
  getSafras, getGrades, getPerfisLab, salvarPerfilLab, deletePerfilLab,
  getImportacoesLab, saveImportacaoLab, deleteImportacaoLab, getVariaveisAtivas, siglaVariavel,
  GradeAmostragem, ImportacaoLab,
} from '@/lib/store';
import { lerArquivo, aplicarPerfil, autoConfig, PERFIS_BUILTIN, norm, numerosDaGrade, valorLab, ELEMENTOS_LAB, PerfilLabConfig, type ResultadoAmostra } from '@/lib/lab';
import { unidadesDe, unidadeCanonica, precisaConverter } from '@/lib/unidades';
import { detectarOutliers, chaveAmostra, contarOutliers } from '@/lib/labOutliers';
import { LabPreviewTable } from './LabPreviewTable';
import { pode } from '@/lib/empresa';
import { Upload, Save, Trash2, CheckCircle2, AlertTriangle, FlaskConical } from 'lucide-react';

const inputStyle = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;
const matchN = (a: string, b: string) => { if (!a || !b) return false; const x = norm(a), y = norm(b); return x.includes(y) || y.includes(x); };

export function LabImportSection() {
  const { nav } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);

  const safraAtiva = useMemo(() => getSafras().find(s => s.ativa) ?? null, []);
  const safraNome = safraAtiva?.nome ?? '';

  const [grades, setGrades] = useState<GradeAmostragem[]>([]);
  const [gradeId, setGradeId] = useState('');
  const [perfis, setPerfis] = useState(() => getPerfisLab());
  const [perfilId, setPerfilId] = useState(PERFIS_BUILTIN[0].id);
  const [nomeNovoLab, setNomeNovoLab] = useState('');
  const [aoa, setAoa] = useState<string[][] | null>(null);
  const [talhaoFiltro, setTalhaoFiltro] = useState('');
  const [campanhaFiltro, setCampanhaFiltro] = useState('');
  const [estado, setEstado] = useState<'idle' | 'loading' | 'pronto' | 'erro'>('idle');
  const [erro, setErro] = useState('');
  const [resumo, setResumo] = useState('');
  const [importacoes, setImportacoes] = useState<ImportacaoLab[]>([]);
  const [unidadeOverride, setUnidadeOverride] = useState<Record<string, string>>({});
  // Camada editável da prévia: correções por célula (texto cru) e amostras excluídas.
  // Só se aplicam ao confirmar; trocar de lab/arquivo zera tudo.
  const [edicoes, setEdicoes] = useState<Record<string, Record<string, string>>>({});
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());
  useEffect(() => { setUnidadeOverride({}); setEdicoes({}); setExcluidos(new Set()); }, [perfilId]);

  function recarregar() {
    if (!nav.talhaoId || !safraNome) return;
    setGrades(getGrades(nav.talhaoId, safraNome));
    setImportacoes(getImportacoesLab(nav.talhaoId, safraNome));
  }
  useEffect(() => { recarregar(); /* eslint-disable-next-line */ }, [nav.talhaoId, safraNome]);

  const grade = grades.find(g => g.id === gradeId) ?? null;

  // perfil/config selecionado
  const { cfg, perfilNome, ehAuto } = useMemo<{ cfg: PerfilLabConfig | null; perfilNome: string; ehAuto: boolean }>(() => {
    if (perfilId === 'auto') return { cfg: aoa ? autoConfig(aoa, getVariaveisAtivas()).config : null, perfilNome: nomeNovoLab.trim() || 'Novo laboratório', ehAuto: true };
    const b = PERFIS_BUILTIN.find(p => p.id === perfilId);
    if (b) return { cfg: b.config, perfilNome: b.nome, ehAuto: false };
    const c = perfis.find(p => p.id === perfilId);
    if (c) return { cfg: c.config, perfilNome: c.nome, ehAuto: false };
    return { cfg: null, perfilNome: '', ehAuto: false };
  }, [perfilId, aoa, perfis, nomeNovoLab]);

  // Aplica os overrides de unidade escolhidos na tela sobre o perfil.
  const cfgEfetivo = useMemo<PerfilLabConfig | null>(() => {
    if (!cfg) return null;
    if (Object.keys(unidadeOverride).length === 0) return cfg;
    const det: NonNullable<PerfilLabConfig['detalhes']> = { ...(cfg.detalhes ?? {}) };
    for (const [elId, u] of Object.entries(unidadeOverride)) det[elId] = { ...(det[elId] ?? {}), unidade: u };
    return { ...cfg, detalhes: det };
  }, [cfg, unidadeOverride]);

  const aplic = useMemo(() => (aoa && cfgEfetivo) ? aplicarPerfil(aoa, cfgEfetivo) : null, [aoa, cfgEfetivo]);

  const talhaoAuto = aplic ? (aplic.talhoes.find(t => matchN(t, nav.talhao)) ?? aplic.talhoes[0] ?? '') : '';
  const talhaoEscolhido = talhaoFiltro || talhaoAuto;
  const campanhasTalhao = aplic ? [...new Set(aplic.resultados.filter(r => matchN(r.talhao, talhaoEscolhido)).map(r => r.campanha).filter(Boolean))] : [];
  const campanhaEscolhida = campanhaFiltro || campanhasTalhao[0] || '';
  // Cadeia da prévia memoizada: cada tecla digitada muda `edicoes` e re-renderiza;
  // sem memo, o filtro + detecção de outliers recomputariam por tecla (pesa em
  // lotes grandes). As deps garantem recomputo só quando os insumos mudam.
  const campanhasKey = campanhasTalhao.length;   // só o "há campanhas?" afeta o filtro
  const resultadosFinais = useMemo(() => aplic ? aplic.resultados.filter(r =>
    (!talhaoEscolhido || matchN(r.talhao, talhaoEscolhido)) &&
    (campanhasKey === 0 || !campanhaEscolhida || r.campanha === campanhaEscolhida)
  ) : [], [aplic, talhaoEscolhido, campanhaEscolhida, campanhasKey]);
  const elementosOrdenados = useMemo(() => {
    const elementosFinais = [...new Set(resultadosFinais.flatMap(r => Object.keys(r.valores)))];
    // Colunas da tabela na ordem agronômica canônica (pH, P, K, Ca…); ids desconhecidos ao fim.
    const idxEl = (id: string) => { const i = ELEMENTOS_LAB.findIndex(e => e.id === id); return i < 0 ? 999 : i; };
    return elementosFinais.sort((a, b) => idxEl(a) - idxEl(b));
  }, [resultadosFinais]);

  // Valor exibido numa célula: edição do usuário (texto cru) ou o valor original.
  const valorTexto = (r: ResultadoAmostra, elId: string): string => {
    const t = edicoes[chaveAmostra(r)]?.[elId];
    if (t !== undefined) return t;
    const v = r.valores[elId];
    return v != null ? String(v) : '';
  };
  const editarValor = (r: ResultadoAmostra, elId: string, texto: string) =>
    setEdicoes(prev => { const k = chaveAmostra(r); return { ...prev, [k]: { ...(prev[k] ?? {}), [elId]: texto } }; });
  const toggleExcluir = (r: ResultadoAmostra) =>
    setExcluidos(prev => { const k = chaveAmostra(r), n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });

  // Resultados após aplicar edições e exclusões — é o que será realmente importado.
  const resultadosEditados = useMemo(() => resultadosFinais
    .filter(r => !excluidos.has(chaveAmostra(r)))
    .map(r => {
      const ed = edicoes[chaveAmostra(r)];
      if (!ed) return r;
      const valores = { ...r.valores };
      for (const [elId, txt] of Object.entries(ed)) {
        const n = valorLab(txt);
        if (n == null) delete valores[elId]; else valores[elId] = n;   // N.D./"<x" = 0; vazio/inválido = sem valor
      }
      return { ...r, valores };
    }), [resultadosFinais, edicoes, excluidos]);
  const elementosImport = useMemo(() => [...new Set(resultadosEditados.flatMap(r => Object.keys(r.valores)))], [resultadosEditados]);
  const outliers = useMemo(() => detectarOutliers(resultadosEditados, elementosOrdenados), [resultadosEditados, elementosOrdenados]);
  const nOutliers = contarOutliers(outliers);

  const numerosGrade = numerosDaGrade(grade);
  const foraDaGrade = grade ? resultadosEditados.filter(r => !numerosGrade.has(r.numero)).length : 0;

  async function onFile(file: File) {
    setEstado('loading'); setErro(''); setResumo(''); setTalhaoFiltro(''); setCampanhaFiltro(''); setUnidadeOverride({}); setEdicoes({}); setExcluidos(new Set());
    try {
      const m = await lerArquivo(file);
      if (m.length < 2) throw new Error('Não consegui ler linhas do arquivo.');
      setAoa(m); setEstado('pronto');
    } catch (e: unknown) {
      setEstado('erro'); setErro(e instanceof Error ? e.message : 'Erro ao ler o arquivo.');
    }
  }
  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }

  function importar() {
    if (!nav.talhaoId || !safraNome || resultadosEditados.length === 0) { setErro('Nada para importar (confira perfil, talhão e campanha).'); setEstado('erro'); return; }
    saveImportacaoLab({
      talhaoId: nav.talhaoId, safra: safraNome, gradeId: grade?.id ?? '',
      laboratorio: perfilNome, campanha: campanhaEscolhida,
      resultados: resultadosEditados, elementos: elementosImport,
    });
    setResumo(`${resultadosEditados.length} amostras importadas · ${elementosImport.length} elementos${foraDaGrade > 0 ? ` · ${foraDaGrade} fora da grade` : ''}`);
    setAoa(null); setEstado('idle');
    recarregar();
  }

  function salvarPerfil() {
    if (!ehAuto || !cfgEfetivo) return;
    if (!nomeNovoLab.trim()) { setErro('Dê um nome ao laboratório para salvar o perfil.'); setEstado('erro'); return; }
    salvarPerfilLab(nomeNovoLab.trim(), cfgEfetivo);   // guarda as unidades escolhidas
    const novos = getPerfisLab(); setPerfis(novos);
    const achado = novos.find(p => p.nome.toLowerCase() === nomeNovoLab.trim().toLowerCase());
    if (achado) setPerfilId(achado.id);
  }

  if (!pode('importarLaudo')) return <div className="px-6 py-4"><Aviso texto="Seu papel não importa laudos de laboratório (somente visualização)." /></div>;
  if (!safraAtiva) return <div className="px-6 py-4"><Aviso texto="Defina uma safra ativa (no topo do talhão) para importar resultados." /></div>;
  if (grades.length === 0) return <div className="px-6 py-4"><Aviso texto="Salve uma grade de amostragem (Amostragem) antes de importar — os resultados são ligados aos pontos." /></div>;

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Grade */}
      <div>
        <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Grade (campanha)</label>
        <select value={gradeId} onChange={e => setGradeId(e.target.value)} className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
          <option value="">Selecione a grade…</option>
          {grades.map(g => <option key={g.id} value={g.id}>{g.nome} · {g.metodo === 'zonas' ? 'Zonas' : 'Grid'} · {g.pontos.length} pts{g.paraProcessar ? ' · a processar' : ''}</option>)}
        </select>
      </div>

      {/* Perfil do laboratório */}
      <div>
        <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Laboratório (perfil)</label>
        <select value={perfilId} onChange={e => { setPerfilId(e.target.value); setTalhaoFiltro(''); setCampanhaFiltro(''); }} className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
          {PERFIS_BUILTIN.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          {perfis.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          <option value="auto">Detectar automaticamente (novo lab)…</option>
        </select>
        {ehAuto && (
          <input value={nomeNovoLab} onChange={e => setNomeNovoLab(e.target.value)} placeholder="Nome do laboratório novo"
            className="w-full rounded px-2 py-1.5 text-xs outline-none mt-1" style={inputStyle} />
        )}
      </div>

      {/* Upload */}
      <div onClick={() => inputRef.current?.click()} className="border-2 border-dashed rounded-lg py-4 text-center cursor-pointer"
        style={{ borderColor: estado === 'pronto' ? '#4ade80' : '#1e3a5f' }}>
        {estado === 'loading' ? <p className="text-[10px]" style={{ color: '#64748b' }}>Lendo planilha…</p> : (
          <div className="flex flex-col items-center gap-1">
            <Upload size={16} style={{ color: '#475569' }} />
            <p className="text-[10px] font-semibold" style={{ color: '#94a3b8' }}>{aoa ? 'Trocar arquivo' : 'Carregar resultados (XLSX / XLS / CSV)'}</p>
            <p className="text-[9px]" style={{ color: '#475569' }}>.xlsx · .xls · .csv</p>
          </div>
        )}
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden" onChange={onFileChange} />
      </div>

      {estado === 'erro' && <p className="text-[10px]" style={{ color: '#f87171' }}>{erro}</p>}
      {resumo && <p className="text-[10px] flex items-center gap-1" style={{ color: '#86efac' }}><CheckCircle2 size={12} /> {resumo}</p>}

      {/* Pré-visualização / filtros */}
      {aplic && estado === 'pronto' && (
        <div className="space-y-2 p-2.5 rounded-lg" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
          {aplic.talhoes.length > 0 && (
            <div>
              <label className="text-[9px] font-semibold block" style={{ color: '#64748b' }}>Talhão no arquivo</label>
              <select value={talhaoEscolhido} onChange={e => { setTalhaoFiltro(e.target.value); setCampanhaFiltro(''); }} className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle}>
                {aplic.talhoes.map(t => <option key={t} value={t}>{t}{matchN(t, nav.talhao) ? ' ✓ (atual)' : ''}</option>)}
              </select>
            </div>
          )}
          {campanhasTalhao.length > 1 && (
            <div>
              <label className="text-[9px] font-semibold block" style={{ color: '#64748b' }}>Campanha</label>
              <select value={campanhaEscolhida} onChange={e => setCampanhaFiltro(e.target.value)} className="w-full rounded px-2 py-1 text-[11px] outline-none" style={inputStyle}>
                {campanhasTalhao.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
          <p className="text-[10px]" style={{ color: '#cbd5e1' }}>
            <strong style={{ color: '#86efac' }}>{resultadosEditados.length}</strong> amostras · {elementosOrdenados.map(id => {
              const d = cfg?.detalhes?.[id];
              return siglaVariavel(id) + (d?.unidade ? ` (${d.unidade}${d.extrator ? ' · ' + d.extrator : ''})` : '');
            }).join(', ') || 'nenhum elemento'}
            {foraDaGrade > 0 && <span style={{ color: '#fbbf24' }}> · {foraDaGrade} fora da grade</span>}
          </p>
          {resultadosEditados.length === 0 && <p className="text-[9px]" style={{ color: '#fbbf24' }}>Nenhuma amostra — confira o perfil e o talhão.</p>}

          {/* Unidade de cada variável NESTE laudo → converte p/ o padrão da plataforma */}
          {elementosOrdenados.some(elId => unidadesDe(elId).length > 1) && (
            <div>
              <p className="text-[9px] font-semibold mb-1" style={{ color: '#64748b' }}>Unidade no laudo → convertida p/ o padrão da plataforma</p>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                {elementosOrdenados.filter(elId => unidadesDe(elId).length > 1).map(elId => {
                  const atual = cfgEfetivo?.detalhes?.[elId]?.unidade ?? unidadeCanonica(elId);
                  const conv = precisaConverter(elId, atual);
                  return (
                    <div key={elId} className="flex items-center gap-1">
                      <span className="text-[10px] font-bold w-7 flex-shrink-0" style={{ color: conv ? '#fbbf24' : '#cbd5e1' }}>{siglaVariavel(elId)}</span>
                      <select value={atual} onChange={e => setUnidadeOverride(o => ({ ...o, [elId]: e.target.value }))}
                        className="flex-1 min-w-0 rounded px-1 py-0.5 text-[10px] outline-none"
                        style={{ background: '#1a3a6b', color: '#e2e8f0', border: `1px solid ${conv ? '#b45309' : '#2e5fa3'}` }}>
                        {unidadesDe(elId).map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
              {elementosOrdenados.some(elId => precisaConverter(elId, cfgEfetivo?.detalhes?.[elId]?.unidade ?? unidadeCanonica(elId))) && (
                <p className="text-[9px] mt-0.5" style={{ color: '#fbbf24' }}>⚠ As destacadas serão CONVERTIDAS ao importar (→ padrão da plataforma).</p>
              )}
            </div>
          )}

          {/* Prévia editável com detecção de outliers — trava de qualidade da entrada */}
          {resultadosFinais.length > 0 && (
            <LabPreviewTable
              resultados={resultadosFinais}
              elementos={elementosOrdenados}
              sigla={siglaVariavel}
              valorTexto={valorTexto}
              onEditar={editarValor}
              excluidos={excluidos}
              onToggleExcluir={toggleExcluir}
              outliers={outliers}
            />
          )}

          <div className="flex gap-2">
            {ehAuto && (
              <button onClick={salvarPerfil} className="flex-1 py-1.5 rounded text-[10px] font-semibold flex items-center justify-center gap-1" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
                <Save size={11} /> Salvar perfil
              </button>
            )}
            <button onClick={importar} disabled={resultadosEditados.length === 0}
              className="flex-1 py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1"
              style={{ background: resultadosEditados.length ? 'var(--invicta-green-dark)' : '#1a3a6b', opacity: resultadosEditados.length ? 1 : 0.6 }}>
              <FlaskConical size={11} /> Importar{nOutliers > 0 ? ` (${nOutliers} a revisar)` : ''}
            </button>
          </div>
        </div>
      )}

      {/* Importações salvas */}
      {importacoes.length > 0 && (
        <div className="pt-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#475569' }}>Importações — Safra {safraNome}</p>
          <div className="space-y-1.5">
            {importacoes.map(imp => (
              <div key={imp.id} className="p-2 rounded-lg" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
                <div className="flex items-center gap-2">
                  <FlaskConical size={12} style={{ color: '#a78bfa' }} />
                  <span className="text-xs font-bold flex-1" style={{ color: '#e2e8f0' }}>{imp.laboratorio}{imp.campanha ? ` · ${imp.campanha}` : ''}</span>
                  <button onClick={() => { deleteImportacaoLab(imp.id); recarregar(); }} title="Excluir" className="p-1 rounded" style={{ color: '#f87171' }}><Trash2 size={11} /></button>
                </div>
                <p className="text-[9px] mt-0.5 pl-5" style={{ color: '#64748b' }}>
                  {imp.resultados.length} amostras · {imp.elementos.map(siglaVariavel).join(', ')} · {new Date(imp.criadoEm).toLocaleDateString('pt-BR')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Perfis salvos */}
      {perfis.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {perfis.map(p => (
            <span key={p.id} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
              {p.nome}
              <button onClick={() => { deletePerfilLab(p.id); setPerfis(getPerfisLab()); }} title="Remover perfil" style={{ color: '#f87171' }}><Trash2 size={9} /></button>
            </span>
          ))}
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
