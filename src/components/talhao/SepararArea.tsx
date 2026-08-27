'use client';

// SEPARAR UMA ÁREA DO TALHÃO — pendência 19.
//
// Talhão multipolígono às vezes carrega uma área que não é dele (veio junto no
// shapefile) e a amostragem já foi gerada por cima. Aqui se escolhe a área, o
// destino, e se CONFERE o plano antes de aplicar — a regra é a de sempre nesta
// base: nada de mudança silenciosa em dado de laboratório.
//
// A conta e as gravações estão em lib/desmembrarTalhao.ts; esta tela só mostra.

import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getTalhoes, type Talhao } from '@/lib/store';
import { partesComArea } from '@/lib/areaGeo';
import { extrairPoligono } from '@/lib/fertilidade';
import { planejar, aplicar, numeroDoPonto, numerosEmFaixas, type Destino } from '@/lib/desmembrarTalhao';
import { X, Scissors, Trash2, MapPin, AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';

const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function SepararArea({ talhao, onFechar, onAplicado }: {
  talhao: Talhao;
  onFechar: () => void;
  onAplicado: (msg: string) => void;
}) {
  const [parte, setParte] = useState<number | null>(null);
  const [tipo, setTipo] = useState<Destino['tipo']>('novo');
  const [nome, setNome] = useState('');
  const [alvoId, setAlvoId] = useState('');
  const [ciente, setCiente] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [erro, setErro] = useState('');

  const areas = useMemo(() => {
    if (!talhao.geojson) return [];
    try {
      const poly = extrairPoligono(JSON.parse(talhao.geojson) as GeoJSON.GeoJSON);
      return poly ? partesComArea(poly) : [];
    } catch { return []; }
  }, [talhao.geojson]);

  const vizinhos = useMemo(
    () => getTalhoes(talhao.fazendaId).filter(t => t.id !== talhao.id && !!t.geojson),
    [talhao.fazendaId, talhao.id]);

  const destino: Destino = tipo === 'novo' ? { tipo: 'novo', nome }
    : tipo === 'existente' ? { tipo: 'existente', talhaoId: alvoId }
    : { tipo: 'excluir' };

  const plano = useMemo(
    () => (parte == null ? null : planejar(talhao, parte, destino)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [talhao, parte, tipo, nome, alvoId]);

  const pontosQueSaem = plano ? plano.grades.reduce((n, g) => n + g.saem.length, 0) : 0;
  const resultadosQueSaem = plano ? plano.laudos.reduce((n, l) => n + l.totalResultados, 0) : 0;
  const precisaCiente = tipo === 'excluir' && (pontosQueSaem > 0 || resultadosQueSaem > 0);
  const podeAplicar = !!plano && plano.impedimentos.length === 0 && !aplicando && (!precisaCiente || ciente);

  function confirmar() {
    if (!plano || !podeAplicar) return;
    setAplicando(true); setErro('');
    try {
      const r = aplicar(talhao, plano, destino);
      const partes: string[] = [];
      if (tipo === 'excluir') partes.push(`Área de ${fmt(plano.areaQueSaiHa)} ha excluída do talhão`);
      else partes.push(`Área de ${fmt(plano.areaQueSaiHa)} ha ${tipo === 'novo' ? 'desmembrada em' : 'anexada a'} "${r.nomeDestino}"`);
      if (r.pontosMovidos) partes.push(`${r.pontosMovidos} ponto(s) de amostragem`);
      if (r.resultadosMovidos) partes.push(`${r.resultadosMovidos} resultado(s) de laudo`);
      if (r.coletasMovidas) partes.push(`${r.coletasMovidas} coleta(s) de campo`);
      onAplicado(`${partes.join(' · ')}. O talhão ficou com ${fmt(plano.areaQueFicaHa)} ha.`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao separar a área.');
      setAplicando(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl"
        style={{ background: '#0a1929', border: '1px solid #1a3a6b' }}>

        <div className="flex items-center gap-2 px-4 py-3 sticky top-0" style={{ background: '#0a1929', borderBottom: '1px solid #1a3a6b' }}>
          <Scissors size={15} style={{ color: '#fbbf24' }} />
          <p className="text-sm font-bold flex-1" style={{ color: '#e2e8f0' }}>Separar área — {talhao.nome}</p>
          <button onClick={onFechar} className="p-1 rounded" style={{ color: '#64748b' }}><X size={16} /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* 1. QUAL ÁREA */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#64748b' }}>1 · Qual área sai</p>
            <div className="space-y-1">
              {areas.map((a, i) => (
                <button key={a.indice} onClick={() => { setParte(a.indice); setCiente(false); }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left"
                  style={{
                    background: parte === a.indice ? '#1a3a6b' : '#0f2240',
                    border: `1px solid ${parte === a.indice ? '#60a5fa' : 'transparent'}`,
                  }}>
                  <MapPin size={13} style={{ color: parte === a.indice ? '#93c5fd' : '#475569' }} />
                  <span className="text-[11px] font-semibold flex-1" style={{ color: '#e2e8f0' }}>Área {i + 1}</span>
                  <span className="text-[11px] font-semibold" style={{ color: '#e2e8f0' }}>{fmt(a.areaHa)} ha</span>
                  <span className="text-[9px] w-9 text-right" style={{ color: '#64748b' }}>{a.pct.toFixed(1)}%</span>
                </button>
              ))}
            </div>
            <p className="text-[9px] mt-1" style={{ color: '#475569' }}>Da maior para a menor — a mesma ordem da lista da fazenda.</p>
          </div>

          {/* 2. DESTINO */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#64748b' }}>2 · Para onde ela vai</p>
            <div className="grid grid-cols-3 gap-1.5">
              {([['novo', 'Novo talhão'], ['existente', 'Talhão existente'], ['excluir', 'Excluir']] as const).map(([t, rot]) => (
                <button key={t} onClick={() => { setTipo(t); setCiente(false); }}
                  className="py-1.5 rounded-lg text-[10px] font-bold"
                  style={{
                    background: tipo === t ? (t === 'excluir' ? '#7f1d1d' : '#166534') : '#0f2240',
                    color: tipo === t ? (t === 'excluir' ? '#fecaca' : '#86efac') : '#64748b',
                  }}>
                  {rot}
                </button>
              ))}
            </div>
            {tipo === 'novo' && (
              <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do talhão novo (ex.: IGEFI 02B)"
                className="mt-2 w-full px-2.5 py-2 rounded-lg text-[12px] outline-none"
                style={{ background: '#0f2240', color: '#e2e8f0', border: '1px solid #1e3a5f' }} />
            )}
            {tipo === 'existente' && (
              <select value={alvoId} onChange={e => setAlvoId(e.target.value)}
                className="mt-2 w-full px-2.5 py-2 rounded-lg text-[12px] outline-none"
                style={{ background: '#0f2240', color: '#e2e8f0', border: '1px solid #1e3a5f' }}>
                <option value="">Escolha o talhão que recebe a área…</option>
                {vizinhos.map(t => <option key={t.id} value={t.id}>{t.nome} · {fmt(t.areaHa)} ha</option>)}
              </select>
            )}
          </div>

          {/* 3. O QUE VAI ACONTECER */}
          {plano && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#64748b' }}>3 · O que vai acontecer</p>
              <div className="rounded-lg p-2.5 space-y-1.5" style={{ background: '#0f2240' }}>
                <div className="flex items-center gap-2 text-[11px]" style={{ color: '#e2e8f0' }}>
                  <span style={{ color: '#fbbf24' }}>{fmt(plano.areaQueSaiHa)} ha</span>
                  <ArrowRight size={11} style={{ color: '#475569' }} />
                  <span>{tipo === 'excluir' ? 'descartados' : tipo === 'novo' ? (nome.trim() || 'talhão novo') : (vizinhos.find(t => t.id === alvoId)?.nome ?? 'talhão destino')}</span>
                  <span className="ml-auto text-[10px]" style={{ color: '#64748b' }}>
                    o talhão fica com {fmt(plano.areaQueFicaHa)} ha
                  </span>
                </div>

                {plano.grades.length === 0 ? (
                  <p className="text-[10px]" style={{ color: '#64748b' }}>Nenhum ponto de amostragem cai nesta área.</p>
                ) : plano.grades.map(g => (
                  <div key={g.gradeId} className="text-[10px] leading-snug" style={{ color: '#93c5fd' }}>
                    <strong style={{ color: '#e2e8f0' }}>{g.nome}</strong> ({g.safra}): saem {g.saem.length} ponto(s) —
                    nº {numerosEmFaixas(g.saem.map(numeroDoPonto))}; ficam {g.ficam.length}.
                    {g.temRemessa && <span style={{ color: '#fbbf24' }}> Remessa já emitida — os números não mudam.</span>}
                  </div>
                ))}

                {plano.laudos.map(l => (
                  <div key={l.importacaoId} className="text-[10px]" style={{ color: '#93c5fd' }}>
                    Laudo {l.safra} ({l.laboratorio}): {l.totalResultados} resultado(s) {tipo === 'excluir' ? 'descartados' : 'seguem junto'}.
                  </div>
                ))}
                {plano.coletasQueSeguem > 0 && (
                  <p className="text-[10px]" style={{ color: '#93c5fd' }}>
                    {plano.coletasQueSeguem} coleta(s) de campo {tipo === 'excluir' ? 'descartadas' : 'seguem com o mesmo ponto'}.
                  </p>
                )}
                {plano.zonasQueSeguem > 0 && (
                  <p className="text-[10px]" style={{ color: '#93c5fd' }}>{plano.zonasQueSeguem} zona(s) de manejo nesta área.</p>
                )}
                {plano.culturas.length > 0 && tipo === 'novo' && (
                  <p className="text-[10px]" style={{ color: '#93c5fd' }}>Cultura copiada para: {plano.culturas.join(', ')}.</p>
                )}
              </div>

              {plano.avisos.map((a, i) => (
                <p key={i} className="mt-1.5 text-[10px] leading-snug" style={{ color: '#fbbf24' }}>⚠ {a}</p>
              ))}
              {plano.impedimentos.map((a, i) => (
                <p key={i} className="mt-1.5 text-[10px] leading-snug" style={{ color: '#fca5a5' }}>✕ {a}</p>
              ))}
            </div>
          )}

          {precisaCiente && (
            <label className="flex items-start gap-2 p-2.5 rounded-lg cursor-pointer" style={{ background: '#2a0f12', border: '1px solid #7f1d1d' }}>
              <input type="checkbox" checked={ciente} onChange={e => setCiente(e.target.checked)} className="mt-0.5" />
              <span className="text-[10px] leading-snug" style={{ color: '#fca5a5' }}>
                Entendo que {pontosQueSaem} ponto(s) de amostragem{resultadosQueSaem > 0 ? ` e ${resultadosQueSaem} resultado(s) de laudo` : ''} serão
                descartados junto com a área, e que isso não se desfaz.
              </span>
            </label>
          )}

          {erro && <p className="text-[10px]" style={{ color: '#fca5a5' }}>⚠ {erro}</p>}

          <div className="flex gap-2">
            <button onClick={onFechar} className="flex-1 py-2 rounded-lg text-[11px] font-bold" style={{ background: '#0f2240', color: '#94a3b8' }}>
              Cancelar
            </button>
            <button onClick={confirmar} disabled={!podeAplicar}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-bold"
              style={{
                background: podeAplicar ? (tipo === 'excluir' ? '#7f1d1d' : 'var(--invicta-green-dark)') : '#0f2240',
                color: podeAplicar ? (tipo === 'excluir' ? '#fecaca' : '#fff') : '#475569',
                cursor: podeAplicar ? 'pointer' : 'not-allowed',
              }}>
              {aplicando ? <Loader2 size={13} className="animate-spin" />
                : tipo === 'excluir' ? <Trash2 size={13} /> : <Scissors size={13} />}
              {tipo === 'excluir' ? 'Excluir a área' : tipo === 'novo' ? 'Desmembrar' : 'Anexar'}
            </button>
          </div>

          <p className="text-[9px] leading-snug flex items-start gap-1" style={{ color: '#475569' }}>
            <AlertTriangle size={10} className="flex-shrink-0 mt-0.5" />
            O limite anterior fica arquivado como versão do talhão — os ciclos que já usaram aquela geometria continuam
            apontando para ela. Os mapas de fertilidade processados antes desta mudança precisam ser reprocessados.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
