'use client';

// FUNDIR DOIS TALHÕES — pendência 19.
//
// Escolhe o outro talhão, qual NOME permanece e qual CADASTRO sobrevive, e
// mostra o plano antes de aplicar. A conta e as gravações estão em
// lib/fundirTalhoes.ts; aqui só se decide e se confere.

import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getTalhoes, contarRegistrosDoTalhao, type Talhao } from '@/lib/store';
import { planejarFusao, aplicarFusao, type OpcoesFusao } from '@/lib/fundirTalhoes';
import { numerosEmFaixas } from '@/lib/desmembrarRegras';
import { X, Combine, ArrowLeftRight, Loader2, AlertTriangle } from 'lucide-react';

const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function FundirTalhoes({ talhao, outroIdInicial, nomeInicial, onFechar, onAplicado }: {
  talhao: Talhao;
  /** Pré-seleção vinda do renomear ("já existe um talhão com este nome"). */
  outroIdInicial?: string;
  nomeInicial?: string;
  onFechar: () => void;
  onAplicado: (msg: string, talhaoIdQueFicou: string) => void;
}) {
  const [outroId, setOutroId] = useState(outroIdInicial ?? '');
  const [inverter, setInverter] = useState(false);
  const [nome, setNome] = useState(nomeInicial ?? talhao.nome);
  const [fundirAmostragem, setFundirAmostragem] = useState(true);
  const [ciente, setCiente] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [erro, setErro] = useState('');

  const candidatos = useMemo(
    () => getTalhoes(talhao.fazendaId).filter(t => t.id !== talhao.id && !!t.geojson),
    [talhao.fazendaId, talhao.id]);
  const outro = candidatos.find(t => t.id === outroId) ?? null;

  // Qual CADASTRO sobrevive. O padrão é o que tem mais dados pendurados: migrar
  // o menor mexe em menos coisa, e o registro que fica leva junto o histórico
  // de limites e os mapas dele.
  const registros = useMemo(() => ({
    atual: contarRegistrosDoTalhao(talhao.id),
    outro: outro ? contarRegistrosDoTalhao(outro.id) : 0,
  }), [talhao.id, outro]);
  const atualEhHospedeiroPorPadrao = !outro || registros.atual >= registros.outro;
  const atualEhHospedeiro = inverter ? !atualEhHospedeiroPorPadrao : atualEhHospedeiroPorPadrao;
  const hospedeiro = atualEhHospedeiro ? talhao : (outro ?? talhao);
  const absorvido = atualEhHospedeiro ? outro : talhao;

  const opcoes: OpcoesFusao = { nomeQueFica: nome, fundirAmostragem };
  const plano = useMemo(
    () => (absorvido && hospedeiro.id !== absorvido.id ? planejarFusao(hospedeiro, absorvido, opcoes) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hospedeiro.id, absorvido?.id, nome, fundirAmostragem]);

  const renumerados = plano ? plano.grades.reduce((n, g) => n + (fundirAmostragem ? g.remapeados.length : 0), 0) : 0;
  const precisaCiente = !!plano && plano.impedimentos.length === 0;
  const podeAplicar = !!plano && plano.impedimentos.length === 0 && !aplicando && ciente;

  function confirmar() {
    if (!plano || !absorvido || !podeAplicar) return;
    setAplicando(true); setErro('');
    try {
      const r = aplicarFusao(hospedeiro, absorvido, plano, opcoes);
      const partes = [`"${absorvido.nome}" fundido em "${r.nome}" — ${fmt(r.areaHa)} ha`];
      if (r.pontosRenumerados) partes.push(`${r.pontosRenumerados} ponto(s) renumerado(s)`);
      if (r.laudosMovidos) partes.push(`${r.laudosMovidos} laudo(s)`);
      if (r.coletasMovidas) partes.push(`${r.coletasMovidas} coleta(s) de campo`);
      onAplicado(`${partes.join(' · ')}.`, r.talhaoId);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao fundir.');
      setAplicando(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl"
        style={{ background: '#0a1929', border: '1px solid #1a3a6b' }}>

        <div className="flex items-center gap-2 px-4 py-3 sticky top-0" style={{ background: '#0a1929', borderBottom: '1px solid #1a3a6b' }}>
          <Combine size={15} style={{ color: '#a78bfa' }} />
          <p className="text-sm font-bold flex-1" style={{ color: '#e2e8f0' }}>Fundir talhões</p>
          <button onClick={onFechar} className="p-1 rounded" style={{ color: '#64748b' }}><X size={16} /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* 1. COM QUEM */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#64748b' }}>1 · Fundir {talhao.nome} com</p>
            <select value={outroId} onChange={e => { setOutroId(e.target.value); setCiente(false); setInverter(false); }}
              className="w-full px-2.5 py-2 rounded-lg text-[12px] outline-none"
              style={{ background: '#0f2240', color: '#e2e8f0', border: '1px solid #1e3a5f' }}>
              <option value="">Escolha o outro talhão…</option>
              {candidatos.map(t => <option key={t.id} value={t.id}>{t.nome} · {fmt(t.areaHa)} ha</option>)}
            </select>
          </div>

          {outro && (
            <>
              {/* 2. NOME + CADASTRO */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#64748b' }}>2 · Qual nome permanece</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {[talhao.nome, outro.nome].map(n => (
                    <button key={n} onClick={() => setNome(n)}
                      className="py-1.5 rounded-lg text-[11px] font-bold truncate px-2"
                      style={{
                        background: nome === n ? '#166534' : '#0f2240',
                        color: nome === n ? '#86efac' : '#64748b',
                      }}>
                      {n}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2 px-2.5 py-2 rounded-lg" style={{ background: '#0f2240' }}>
                  <p className="text-[10px] flex-1 leading-snug" style={{ color: '#93c5fd' }}>
                    O cadastro de <strong style={{ color: '#e2e8f0' }}>{hospedeiro.nome}</strong> permanece
                    {' '}({atualEhHospedeiro ? registros.atual : registros.outro} registro(s) e o histórico de limites dele);
                    {' '}<strong style={{ color: '#e2e8f0' }}>{absorvido?.nome}</strong> é absorvido e sai da lista.
                  </p>
                  <button onClick={() => { setInverter(v => !v); setCiente(false); }}
                    title="Trocar qual cadastro permanece"
                    className="flex items-center gap-1 px-1.5 py-1 rounded flex-shrink-0 text-[9px] font-bold"
                    style={{ background: '#1a3a6b', color: '#93c5fd' }}>
                    <ArrowLeftRight size={11} /> Trocar
                  </button>
                </div>
              </div>

              {/* 3. AMOSTRAGEM */}
              {plano && plano.grades.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#64748b' }}>3 · Amostragem</p>
                  <label className="flex items-start gap-2 px-2.5 py-2 rounded-lg cursor-pointer" style={{ background: '#0f2240' }}>
                    <input type="checkbox" checked={fundirAmostragem} className="mt-0.5"
                      onChange={e => { setFundirAmostragem(e.target.checked); setCiente(false); }} />
                    <span className="text-[10px] leading-snug" style={{ color: '#93c5fd' }}>
                      Fundir as grades do mesmo ciclo numa só, renumerando os pontos que chegam quando o número já existe.
                      {' '}Desligado, as grades convivem no talhão e o mapa do ciclo continua sendo um por grade.
                    </span>
                  </label>
                </div>
              )}

              {/* 4. O QUE VAI ACONTECER */}
              {plano && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#64748b' }}>
                    {plano.grades.length > 0 ? '4' : '3'} · O que vai acontecer
                  </p>
                  <div className="rounded-lg p-2.5 space-y-1.5" style={{ background: '#0f2240' }}>
                    <p className="text-[11px]" style={{ color: '#e2e8f0' }}>
                      {fmt(plano.areaHospedeiroHa)} + {fmt(plano.areaAbsorvidoHa)} ha →{' '}
                      <strong style={{ color: '#a78bfa' }}>{fmt(plano.areaFinalHa)} ha</strong>
                      {plano.dissolveu
                        ? <span style={{ color: '#64748b' }}> · uma área só (a divisa some)</span>
                        : <span style={{ color: '#fbbf24' }}> · {plano.partesFinais} áreas separadas</span>}
                    </p>
                    {plano.grades.map(g => (
                      <div key={g.visitanteId} className="text-[10px] leading-snug" style={{ color: '#93c5fd' }}>
                        <strong style={{ color: '#e2e8f0' }}>{g.nome}</strong> ({g.safra}): {g.pontos} ponto(s)
                        {!g.hospedeiraId || !fundirAmostragem
                          ? ' — muda de talhão sem renumerar.'
                          : g.remapeados.length === 0
                            ? ' — funde na grade do ciclo sem renumerar nada.'
                            : ` — funde renumerando ${g.remapeados.length}: nº ${numerosEmFaixas(g.remapeados.map(r => r.numeroDe))} viram ${numerosEmFaixas(g.remapeados.map(r => r.numeroPara))}.`}
                      </div>
                    ))}
                    {plano.laudos > 0 && (
                      <p className="text-[10px]" style={{ color: '#93c5fd' }}>
                        {plano.laudos} laudo(s) seguem junto{renumerados > 0 ? ', com os números reescritos na mesma conta' : ''}.
                      </p>
                    )}
                    {plano.coletas > 0 && <p className="text-[10px]" style={{ color: '#93c5fd' }}>{plano.coletas} coleta(s) de campo acompanham os pontos.</p>}
                    {plano.zonas > 0 && <p className="text-[10px]" style={{ color: '#93c5fd' }}>{plano.zonas} zona(s) de manejo entram no snapshot do talhão.</p>}
                    {plano.outrosRegistros > 0 && (
                      <p className="text-[10px]" style={{ color: '#93c5fd' }}>
                        {plano.outrosRegistros} registro(s) de compactação / MDE / condutividade / MEAP trocam de dono.
                      </p>
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
                <label className="flex items-start gap-2 p-2.5 rounded-lg cursor-pointer" style={{ background: '#2e1065', border: '1px solid #5b21b6' }}>
                  <input type="checkbox" checked={ciente} onChange={e => setCiente(e.target.checked)} className="mt-0.5" />
                  <span className="text-[10px] leading-snug" style={{ color: '#ddd6fe' }}>
                    Entendo que <strong>{absorvido?.nome}</strong> deixa de existir como talhão — o nome fica registrado no
                    histórico de <strong>{nome}</strong>, junto com o contorno que ele tinha, mas não aparece mais nas listas.
                    E que isso não se desfaz.
                  </span>
                </label>
              )}
            </>
          )}

          {erro && <p className="text-[10px]" style={{ color: '#fca5a5' }}>⚠ {erro}</p>}

          <div className="flex gap-2">
            <button onClick={onFechar} className="flex-1 py-2 rounded-lg text-[11px] font-bold" style={{ background: '#0f2240', color: '#94a3b8' }}>
              Cancelar
            </button>
            <button onClick={confirmar} disabled={!podeAplicar}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-bold"
              style={{
                background: podeAplicar ? '#5b21b6' : '#0f2240',
                color: podeAplicar ? '#ddd6fe' : '#475569',
                cursor: podeAplicar ? 'pointer' : 'not-allowed',
              }}>
              {aplicando ? <Loader2 size={13} className="animate-spin" /> : <Combine size={13} />} Fundir
            </button>
          </div>

          <p className="text-[9px] leading-snug flex items-start gap-1" style={{ color: '#475569' }}>
            <AlertTriangle size={10} className="flex-shrink-0 mt-0.5" />
            O limite anterior fica arquivado como versão do talhão. Os mapas de fertilidade processados antes da fusão
            valem para o contorno antigo e precisam ser reprocessados.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
