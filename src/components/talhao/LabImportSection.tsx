'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/context/AppContext';
import {
  getSafras, getGrades, getPerfisLab, salvarPerfilLab, deletePerfilLab,
  getImportacoesLab, saveImportacaoLab, deleteImportacaoLab,
  GradeAmostragem, ImportacaoLab,
} from '@/lib/store';
import { parsePlanilha, autoAtribuir, casarComGrade, ELEMENTOS_LAB, AtribuicaoColuna, PlanilhaParsed } from '@/lib/lab';
import { Upload, Save, Trash2, CheckCircle2, AlertTriangle, FlaskConical } from 'lucide-react';

const inputStyle = { background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;

const OPCOES: { v: string; l: string }[] = [
  { v: 'ignorar', l: 'Ignorar' },
  { v: 'numero', l: 'Nº amostra' },
  { v: 'profundidade', l: 'Profundidade' },
  ...ELEMENTOS_LAB.map(e => ({ v: e.id, l: e.simbolo })),
];

export function LabImportSection() {
  const { nav } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);

  const safraAtiva = useMemo(() => getSafras().find(s => s.ativa) ?? null, []);
  const safraNome = safraAtiva?.nome ?? '';

  const [grades, setGrades] = useState<GradeAmostragem[]>([]);
  const [gradeId, setGradeId] = useState('');
  const [perfis, setPerfis] = useState(() => getPerfisLab());
  const [labNome, setLabNome] = useState('');
  const [parsed, setParsed] = useState<PlanilhaParsed | null>(null);
  const [atribuicao, setAtribuicao] = useState<AtribuicaoColuna>({});
  const [estado, setEstado] = useState<'idle' | 'loading' | 'pronto' | 'erro'>('idle');
  const [erro, setErro] = useState('');
  const [resumo, setResumo] = useState('');
  const [importacoes, setImportacoes] = useState<ImportacaoLab[]>([]);

  function recarregar() {
    if (!nav.talhaoId || !safraNome) return;
    setGrades(getGrades(nav.talhaoId, safraNome));
    setImportacoes(getImportacoesLab(nav.talhaoId, safraNome));
  }
  useEffect(() => { recarregar(); /* eslint-disable-next-line */ }, [nav.talhaoId, safraNome]);

  const grade = grades.find(g => g.id === gradeId) ?? null;

  async function onFile(file: File) {
    setEstado('loading'); setErro(''); setResumo('');
    try {
      const p = await parsePlanilha(file);
      if (p.headers.length === 0 || p.linhas.length === 0) throw new Error('Não consegui ler linhas do arquivo.');
      // perfil salvo para este lab? aplica; senão auto-detecta
      const perfil = perfis.find(pf => pf.nome.toLowerCase() === labNome.trim().toLowerCase());
      const at: AtribuicaoColuna = {};
      if (perfil) p.headers.forEach(h => { at[h] = perfil.atribuicao[h] ?? 'ignorar'; });
      const base = perfil ? at : autoAtribuir(p.headers);
      setParsed(p);
      setAtribuicao(base);
      setEstado('pronto');
    } catch (e: unknown) {
      setEstado('erro');
      setErro(e instanceof Error ? e.message : 'Erro ao ler o arquivo.');
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '';
  }

  function setCol(header: string, v: string) {
    setAtribuicao(prev => ({ ...prev, [header]: v }));
  }

  function importar() {
    if (!parsed || !nav.talhaoId || !safraNome) return;
    const r = casarComGrade(parsed.linhas, atribuicao, grade);
    if (r.resultados.length === 0) { setErro('Nenhuma amostra válida (defina a coluna do nº da amostra e ao menos um elemento).'); setEstado('erro'); return; }
    saveImportacaoLab({
      talhaoId: nav.talhaoId, safra: safraNome, gradeId: grade?.id ?? '',
      laboratorio: labNome.trim() || 'Laboratório',
      resultados: r.resultados, elementos: r.elementos,
    });
    setResumo(`${r.resultados.length} amostras importadas · ${r.elementos.length} elementos${r.naoCasados > 0 ? ` · ${r.naoCasados} fora da grade` : ''}`);
    setParsed(null); setEstado('idle');
    recarregar();
  }

  function salvarPerfil() {
    if (!labNome.trim()) { setErro('Dê um nome ao laboratório para salvar o perfil.'); setEstado('erro'); return; }
    salvarPerfilLab(labNome.trim(), atribuicao);
    setPerfis(getPerfisLab());
  }

  if (!safraAtiva) {
    return <div className="px-6 py-4"><Aviso texto="Defina uma safra ativa (no topo do talhão) para importar resultados." /></div>;
  }
  if (grades.length === 0) {
    return <div className="px-6 py-4"><Aviso texto="Salve uma grade de amostragem (Amostragem) antes de importar resultados — eles são ligados aos pontos." /></div>;
  }

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Grade + Laboratório */}
      <div>
        <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Grade (campanha)</label>
        <select value={gradeId} onChange={e => setGradeId(e.target.value)} className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
          <option value="">Selecione a grade…</option>
          {grades.map(g => <option key={g.id} value={g.id}>{g.nome} · {g.metodo === 'zonas' ? 'Zonas' : 'Grid'} · {g.pontos.length} pts{g.paraProcessar ? ' · a processar' : ''}</option>)}
        </select>
      </div>
      <div>
        <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Laboratório</label>
        <input list="perfis-lab" value={labNome} onChange={e => setLabNome(e.target.value)} placeholder="Ex: Fundação ABC, Interpartner…"
          className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
        <datalist id="perfis-lab">{perfis.map(p => <option key={p.id} value={p.nome} />)}</datalist>
        {perfis.length > 0 && <p className="text-[9px] mt-0.5" style={{ color: '#475569' }}>Perfis salvos: {perfis.map(p => p.nome).join(', ')}</p>}
      </div>

      {/* Upload */}
      <div onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed rounded-lg py-4 text-center cursor-pointer"
        style={{ borderColor: estado === 'pronto' ? '#4ade80' : '#1e3a5f' }}>
        {estado === 'loading' ? (
          <p className="text-[10px]" style={{ color: '#64748b' }}>Lendo planilha…</p>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <Upload size={16} style={{ color: '#475569' }} />
            <p className="text-[10px] font-semibold" style={{ color: '#94a3b8' }}>{parsed ? 'Trocar arquivo' : 'Carregar resultados (XLSX / CSV)'}</p>
            <p className="text-[9px]" style={{ color: '#475569' }}>.xlsx · .csv</p>
          </div>
        )}
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFileChange} />
      </div>

      {estado === 'erro' && <p className="text-[10px]" style={{ color: '#f87171' }}>{erro}</p>}
      {resumo && <p className="text-[10px] flex items-center gap-1" style={{ color: '#86efac' }}><CheckCircle2 size={12} /> {resumo}</p>}

      {/* Mapeamento de colunas */}
      {parsed && estado === 'pronto' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold" style={{ color: '#93c5fd' }}>Mapeamento das colunas</p>
            <span className="text-[9px]" style={{ color: '#475569' }}>{parsed.linhas.length} linhas</span>
          </div>
          <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
            {parsed.headers.map(h => (
              <div key={h} className="flex items-center gap-2">
                <span className="text-[10px] flex-1 truncate" style={{ color: atribuicao[h] === 'ignorar' ? '#475569' : '#cbd5e1' }} title={h}>{h}</span>
                <select value={atribuicao[h] ?? 'ignorar'} onChange={e => setCol(h, e.target.value)}
                  className="rounded px-1.5 py-1 text-[11px] outline-none" style={{ ...inputStyle, width: '120px' }}>
                  {OPCOES.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={salvarPerfil} className="flex-1 py-1.5 rounded text-[10px] font-semibold flex items-center justify-center gap-1" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
              <Save size={11} /> Salvar perfil {labNome.trim() && `(${labNome.trim()})`}
            </button>
            <button onClick={importar} disabled={!grade}
              className="flex-1 py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1"
              style={{ background: grade ? 'var(--invicta-green-dark)' : '#1a3a6b', opacity: grade ? 1 : 0.6 }}>
              <FlaskConical size={11} /> Importar
            </button>
          </div>
          {!grade && <p className="text-[9px]" style={{ color: '#fbbf24' }}>Selecione a grade para importar.</p>}
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
                  <span className="text-xs font-bold flex-1" style={{ color: '#e2e8f0' }}>{imp.laboratorio}</span>
                  <button onClick={() => { deleteImportacaoLab(imp.id); recarregar(); }} title="Excluir" className="p-1 rounded" style={{ color: '#f87171' }}><Trash2 size={11} /></button>
                </div>
                <p className="text-[9px] mt-0.5 pl-5" style={{ color: '#64748b' }}>
                  {imp.resultados.length} amostras · {imp.elementos.length} elementos · {new Date(imp.criadoEm).toLocaleDateString('pt-BR')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Perfis salvos (gerenciar) */}
      {perfis.length > 0 && (
        <div className="pt-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#475569' }}>Perfis de laboratório</p>
          <div className="flex flex-wrap gap-1.5">
            {perfis.map(p => (
              <span key={p.id} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
                {p.nome}
                <button onClick={() => { deletePerfilLab(p.id); setPerfis(getPerfisLab()); }} title="Remover perfil" style={{ color: '#f87171' }}><Trash2 size={9} /></button>
              </span>
            ))}
          </div>
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
