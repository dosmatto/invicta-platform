'use client';

// TELA DE VERSÕES do zoneamento (spec §5).
//
// A lista era plana: "Zoneamento 1", "Zoneamento 1 — Suavização leve",
// "Zoneamento 1 — Suavização leve — Ajuste manual" apareciam soltas, lado a
// lado com zoneamentos de outra origem. A história existia no dado (cada
// derivação grava o id do pai) e não era mostrada — então ninguém sabia o que
// veio de quê, nem podia voltar atrás com segurança.
//
// Aqui cada linhagem vira uma linha do tempo: V1 → V2 → V3, com data, autor e
// o que a versão FEZ. As ações antigas continuam nas mesmas mãos; entram
// COMPARAR (duas versões, no Laboratório) e RESTAURAR — que copia a versão
// escolhida para o topo em vez de apagar o que veio depois. Nada é
// sobrescrito, nunca.

import { useMemo, useState } from 'react';
import type { ZoneamentoMeap } from '@/lib/store';
import { montarLinhagens, nomeCurto, type VersaoZoneamento } from '@/lib/meap/versoes';
import { Star, Trash2, Eye, Pencil, Spline, GitCompare, RotateCcw, Tag, Check, X, AlertTriangle } from 'lucide-react';

interface Props {
  zoneamentos: ZoneamentoMeap[];
  vendoId: string | null;
  podeEditar: boolean;
  onVer: (id: string | null) => void;
  onTornarPadrao: (id: string) => void;
  onEditar: (z: ZoneamentoMeap) => void;
  onSuavizar: (z: ZoneamentoMeap) => void;
  onExcluir: (id: string) => void;
  onRenomear: (id: string, nome: string) => void;
  onRestaurar: (v: VersaoZoneamento, nomeBase: string) => void;
  onComparar: (aId: string, bId: string) => void;
}

const COR_TIPO: Record<string, string> = {
  importada: '#7dd3fc', gerada: '#c4b5fd', suavizada: '#22d3ee',
  'ajuste-manual': '#c4b5fd', restaurada: '#fbbf24',
};

function dataCurta(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
    + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function VersoesZoneamentos({
  zoneamentos, vendoId, podeEditar,
  onVer, onTornarPadrao, onEditar, onSuavizar, onExcluir, onRenomear, onRestaurar, onComparar,
}: Props) {
  const linhagens = useMemo(() => montarLinhagens(zoneamentos), [zoneamentos]);
  const [sel, setSel] = useState<string[]>([]);          // ids marcados p/ comparar
  const [renomeando, setRenomeando] = useState<{ id: string; texto: string } | null>(null);

  function toggleSel(id: string) {
    setSel(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id].slice(-2)));  // guarda os 2 últimos
  }

  function confirmarRenome() {
    if (!renomeando) return;
    const nome = renomeando.texto.trim();
    if (nome) onRenomear(renomeando.id, nome);
    setRenomeando(null);
  }

  return (
    <div className="space-y-2">
      {linhagens.map(l => {
        const selDaLinhagem = l.versoes.filter(v => sel.includes(v.z.id));
        const podeComparar = selDaLinhagem.length === 2;
        return (
          <div key={l.id} className="rounded" style={{ background: '#061525', border: `1px solid ${l.temPadrao ? '#a16207' : '#1a3a6b'}` }}>
            {/* cabeçalho da linhagem */}
            <div className="flex items-center gap-2 px-2 py-1.5" style={{ borderBottom: '1px solid #10294a' }}>
              <span className="text-[11px] font-bold truncate flex-1" style={{ color: '#e2e8f0' }}>{l.nome}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: '#0b1f3a', color: '#93c5fd' }}>
                {l.versoes.length} {l.versoes.length === 1 ? 'versão' : 'versões'}
              </span>
              {podeComparar && (
                <button onClick={() => onComparar(selDaLinhagem[0].z.id, selDaLinhagem[1].z.id)}
                  className="flex items-center gap-1 text-[9px] px-2 py-0.5 rounded font-bold text-white flex-shrink-0" style={{ background: '#0e7490' }}>
                  <GitCompare size={10} /> Comparar V{selDaLinhagem[0].numero} × V{selDaLinhagem[1].numero}
                </button>
              )}
            </div>

            {/* linha do tempo */}
            <div className="p-1.5 space-y-1">
              {l.versoes.map((v, i) => {
                const z = v.z;
                const vendo = vendoId === z.id;
                const marcada = sel.includes(z.id);
                const ultima = i === l.versoes.length - 1;
                return (
                  <div key={z.id}>
                    <div onClick={() => onVer(vendo ? null : z.id)} title="Clique para ver esta versão no mapa"
                      className="px-2 py-1.5 rounded cursor-pointer"
                      style={{ background: vendo ? '#0f2240' : '#0a1929', border: `1px solid ${vendo ? '#22d3ee' : marcada ? '#0e7490' : '#132f52'}` }}>
                      <div className="flex items-center gap-1.5">
                        <button onClick={e => { e.stopPropagation(); toggleSel(z.id); }}
                          title="Marcar para comparar (duas versões da mesma linhagem)"
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                          style={{ background: marcada ? '#0e7490' : '#0b1f3a', color: marcada ? '#fff' : COR_TIPO[v.tipo] ?? '#93c5fd', border: `1px solid ${marcada ? '#22d3ee' : 'transparent'}` }}>
                          V{v.numero}
                        </button>

                        {renomeando?.id === z.id ? (
                          <input autoFocus value={renomeando.texto}
                            onClick={e => e.stopPropagation()}
                            onChange={e => setRenomeando({ id: z.id, texto: e.target.value })}
                            onKeyDown={e => { if (e.key === 'Enter') confirmarRenome(); if (e.key === 'Escape') setRenomeando(null); }}
                            className="flex-1 min-w-0 text-[11px] rounded px-1.5 py-0.5 outline-none"
                            style={{ background: '#0b1f3a', color: '#e2e8f0', border: '1px solid #22d3ee' }} />
                        ) : (
                          <span className="text-[11px] font-semibold truncate flex-1" title={z.nome} style={{ color: vendo ? '#e2e8f0' : '#cbd5e1' }}>
                            {nomeCurto(z.nome, l.nome) || v.rotulo}
                          </span>
                        )}

                        {vendo && <Eye size={11} className="flex-shrink-0" style={{ color: '#22d3ee' }} />}
                        {z.padrao
                          ? <span className="text-[9px] px-1.5 py-0.5 rounded font-bold flex items-center gap-1 flex-shrink-0" style={{ background: '#3a2e0a', color: '#fbbf24' }}><Star size={8} /> Padrão</span>
                          : <button onClick={e => { e.stopPropagation(); onTornarPadrao(z.id); }} title="Usar esta versão na Amostragem e nas Prescrições"
                              className="text-[9px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0" style={{ background: '#1a3a6b', color: '#93c5fd' }}>Tornar padrão</button>}
                      </div>

                      {/* o que esta versão é e o que ela fez */}
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: '#0b1f3a', color: COR_TIPO[v.tipo] ?? '#93c5fd' }}>
                          {v.rotulo}
                        </span>
                        {v.origemNumero != null && (
                          <span className="text-[9px] flex-shrink-0" style={{ color: '#64748b' }}>derivada da V{v.origemNumero}</span>
                        )}
                        {v.orfa && (
                          <span className="text-[9px] flex items-center gap-0.5 flex-shrink-0" style={{ color: '#fbbf24' }}>
                            <AlertTriangle size={9} /> veio de «{v.origemNome}», que foi excluída
                          </span>
                        )}
                        <span className="text-[9px] flex-shrink-0" style={{ color: '#475569' }}>
                          {dataCurta(v.data)}{v.usuario ? ` · ${v.usuario}` : ''}
                        </span>
                      </div>
                      <p className="text-[9px] mt-0.5 leading-relaxed" style={{ color: '#64748b' }}>
                        {z.meta.nZonas} zonas{z.meta.nPoligonos ? ` · ${z.meta.nPoligonos} polígonos` : ''}
                        {z.meta.cvMedio != null && <> · CV médio {z.meta.cvMedio.toLocaleString('pt-BR')}%</>}
                        {' — '}{v.resumo}
                      </p>

                      {/* ações */}
                      <div className="flex items-center gap-1 mt-1">
                        {renomeando?.id === z.id ? (
                          <>
                            <button onClick={e => { e.stopPropagation(); confirmarRenome(); }} className="p-1 rounded" title="Salvar nome" style={{ background: '#065f46', color: '#86efac' }}><Check size={11} /></button>
                            <button onClick={e => { e.stopPropagation(); setRenomeando(null); }} className="p-1 rounded" title="Cancelar" style={{ background: '#1a3a6b', color: '#93c5fd' }}><X size={11} /></button>
                          </>
                        ) : (
                          <>
                            <button onClick={e => { e.stopPropagation(); setRenomeando({ id: z.id, texto: z.nome }); }}
                              title="Renomear esta versão" className="p-1 rounded" style={{ background: '#0b1f3a', color: '#93c5fd' }}><Tag size={11} /></button>
                            {podeEditar && (
                              <button onClick={e => { e.stopPropagation(); onEditar(z); }}
                                title="Editar manualmente (unir/reclassificar/dividir — cria uma NOVA versão)"
                                className="p-1 rounded" style={{ background: '#241748', color: '#c4b5fd' }}><Pencil size={11} /></button>
                            )}
                            <button onClick={e => { e.stopPropagation(); onSuavizar(z); }}
                              title="Suavizar limites (cria uma NOVA versão; esta fica intacta)"
                              className="p-1 rounded" style={{ background: '#0b3a44', color: '#22d3ee' }}><Spline size={11} /></button>
                            {!ultima && (
                              <button onClick={e => { e.stopPropagation(); onRestaurar(v, l.nome); }}
                                title="Voltar a esta versão — ela é COPIADA para o topo da linha do tempo; nada do que veio depois é apagado"
                                className="p-1 rounded" style={{ background: '#3a2e0a', color: '#fbbf24' }}><RotateCcw size={11} /></button>
                            )}
                            <button onClick={e => { e.stopPropagation(); onExcluir(z.id); }}
                              title="Excluir esta versão" className="p-1 rounded ml-auto" style={{ color: '#f87171' }}><Trash2 size={11} /></button>
                          </>
                        )}
                      </div>
                    </div>
                    {!ultima && <div className="w-px h-1.5 ml-4" style={{ background: '#1a3a6b' }} />}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {/* Sem padrão marcado, o mapa desenha a versão mais recente e a Amostragem/
          Prescrições ficam sem zona — dizer isso evita a leitura de que o mapa
          "voltou sozinho" para um desenho antigo. */}
      {zoneamentos.length > 0 && !zoneamentos.some(z => z.padrao) && (
        <p className="text-[9px] leading-relaxed p-1.5 rounded" style={{ color: '#fde68a', background: '#2a1a05', border: '1px solid #b45309' }}>
          Nenhuma versão está marcada como <strong>padrão</strong>: o mapa mostra a mais recente, mas a Amostragem e as Prescrições ficam sem zona até você marcar uma.
        </p>
      )}
      <p className="text-[9px] leading-relaxed" style={{ color: '#6d8bbe' }}>
        Cada operação cria uma versão nova — a anterior nunca é sobrescrita. <strong style={{ color: '#fbbf24' }}>Padrão</strong> é a versão que a Amostragem e as Prescrições usam. Marque duas <strong style={{ color: '#22d3ee' }}>V</strong> da mesma linhagem para comparar.
      </p>
    </div>
  );
}
