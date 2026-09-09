'use client';

// Pré-visualização EDITÁVEL da importação de laboratório, com destaque de
// possíveis outliers por célula. Vermelho = fora da faixa plausível (erro de
// unidade/digitação); âmbar = destoa das demais amostras (estatístico). O
// usuário corrige valores e/ou exclui amostras aqui; nada é gravado até o
// "Importar" do componente pai — este componente só emite callbacks.

import type { ResultadoAmostra } from '@/lib/lab';
import { chaveAmostra, contarOutliers, type MapaOutliers } from '@/lib/labOutliers';
import { Trash2, RotateCcw } from 'lucide-react';

interface Props {
  resultados: ResultadoAmostra[];          // amostras já filtradas (talhão/campanha)
  elementos: string[];                      // colunas, na ordem desejada
  derivados?: Set<string>;                  // colunas calculadas (somente-leitura)
  sigla: (elId: string) => string;          // rótulo curto da coluna
  valorTexto: (r: ResultadoAmostra, elId: string) => string;   // valor exibido (edição ou original)
  onEditar: (r: ResultadoAmostra, elId: string, texto: string) => void;
  excluidos: Set<string>;
  onToggleExcluir: (r: ResultadoAmostra) => void;
  outliers: MapaOutliers;
}

const th = 'px-1.5 py-1 text-[9px] font-bold uppercase tracking-wide sticky top-0 z-10';
const cellBase = 'w-14 rounded px-1 py-0.5 text-[10px] text-center outline-none';

// Cor por tipo de flag: vermelho = fora da faixa; violeta = inversão de
// profundidade; âmbar = destoa estatisticamente das demais.
const COR_FLAG: Record<string, { borda: string; fundo: string }> = {
  faixa:        { borda: '#ef4444', fundo: '#2a0d0d' },
  profundidade: { borda: '#a78bfa', fundo: '#241a3a' },
  estatistico:  { borda: '#f59e0b', fundo: '#2a2100' },
};

// A CONTA de cada coluna calculada, dita por extenso no cabeçalho. A dúvida que
// isto encerra é sempre a mesma, e é agronômica: a CTC efetiva (t) NÃO leva H+Al
// — só os cátions trocáveis. Quem leva é a CTC pH 7,0, que vem do laudo e é
// SB + H+Al. As duas aparecem lado a lado nesta tabela, com números de ordens de
// grandeza diferentes, e sem dizer a fórmula parecia erro de cálculo.
const FORMULA_DERIVADA: Record<string, string> = {
  t:     'CTC efetiva = Ca + Mg + K + Al (cátions trocáveis). H+Al NÃO entra — quem soma H+Al é a CTC pH 7,0, que vem do laudo.',
  satk:  'K% = K ÷ CTC pH 7,0 × 100 (saturação na CTC nominal).',
  satca: 'Ca% = Ca ÷ CTC pH 7,0 × 100 (saturação na CTC nominal).',
  satmg: 'Mg% = Mg ÷ CTC pH 7,0 × 100 (saturação na CTC nominal).',
};

export function LabPreviewTable({ resultados, elementos, derivados, sigla, valorTexto, onEditar, excluidos, onToggleExcluir, outliers }: Props) {
  const ehDerivado = (elId: string) => derivados?.has(elId) ?? false;
  const nFlags = contarOutliers(outliers);
  const temCtce = elementos.some(e => e === 't' && ehDerivado(e));

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[9px] font-semibold" style={{ color: '#64748b' }}>
          Confira e corrija antes de importar
        </p>
        {nFlags > 0 && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#3a2a00', color: '#fbbf24' }}>
            {nFlags} possível(is) outlier(s)
          </span>
        )}
      </div>

      <div className="overflow-auto rounded-lg" style={{ maxHeight: 320, border: '1px solid #1a3a6b' }}>
        <table className="border-collapse" style={{ minWidth: '100%' }}>
          <thead>
            <tr style={{ background: '#0b1f3a' }}>
              <th className={th} style={{ color: '#93c5fd', textAlign: 'left' }}>#</th>
              <th className={th} style={{ color: '#93c5fd', textAlign: 'left' }}>Prof</th>
              {elementos.map(elId => (
                <th key={elId} className={th} style={{ color: ehDerivado(elId) ? '#7dd3fc' : '#cbd5e1', background: '#0b1f3a', fontStyle: ehDerivado(elId) ? 'italic' : 'normal' }}
                  title={ehDerivado(elId)
                    ? `Coluna calculada pela plataforma. ${FORMULA_DERIVADA[elId] ?? ''}`.trim()
                    : undefined}>{sigla(elId)}</th>
              ))}
              <th className={th} style={{ background: '#0b1f3a' }}></th>
            </tr>
          </thead>
          <tbody>
            {resultados.map((r, i) => {
              const k = chaveAmostra(r);
              const excl = excluidos.has(k);
              const flags = excl ? undefined : outliers.get(k);
              return (
                <tr key={k + i} style={{ background: i % 2 ? '#061525' : '#08182b', opacity: excl ? 0.4 : 1 }}>
                  <td className="px-1.5 py-0.5 text-[10px] font-bold" style={{ color: '#e2e8f0', textDecoration: excl ? 'line-through' : 'none' }}>{r.numero}</td>
                  <td className="px-1.5 py-0.5 text-[9px]" style={{ color: '#64748b' }}>{r.profundidade || '—'}</td>
                  {elementos.map(elId => {
                    const deriv = ehDerivado(elId);
                    const flag = flags?.[elId];
                    const cor = flag ? COR_FLAG[flag.tipo] : null;
                    const borda = cor?.borda ?? (deriv ? '#155e75' : '#24406b');
                    const fundo = cor?.fundo ?? (deriv ? '#07243040' : '#0b2036');
                    return (
                      <td key={elId} className="px-0.5 py-0.5">
                        <input
                          value={valorTexto(r, elId)}
                          onChange={e => { if (!deriv) onEditar(r, elId, e.target.value); }}
                          disabled={excl || deriv}
                          readOnly={deriv}
                          title={deriv ? 'Calculado pela plataforma' : flag?.motivo}
                          inputMode="decimal"
                          className={cellBase}
                          style={{ background: fundo, color: flag ? '#fde68a' : deriv ? '#7dd3fc' : '#e2e8f0', border: `1px solid ${borda}`, fontWeight: flag ? 700 : 400, fontStyle: deriv ? 'italic' : 'normal' }}
                        />
                      </td>
                    );
                  })}
                  <td className="px-1 py-0.5 text-center">
                    <button onClick={() => onToggleExcluir(r)} title={excl ? 'Restaurar amostra' : 'Excluir amostra'}
                      className="p-0.5 rounded" style={{ color: excl ? '#86efac' : '#f87171' }}>
                      {excl ? <RotateCcw size={11} /> : <Trash2 size={11} />}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legenda das cores */}
      <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1">
        <span className="flex items-center gap-1 text-[9px]" style={{ color: '#94a3b8' }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: COR_FLAG.faixa.fundo, border: `1px solid ${COR_FLAG.faixa.borda}` }} /> fora da faixa
        </span>
        <span className="flex items-center gap-1 text-[9px]" style={{ color: '#94a3b8' }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: COR_FLAG.profundidade.fundo, border: `1px solid ${COR_FLAG.profundidade.borda}` }} /> P/MO/V% sobe no fundo
        </span>
        <span className="flex items-center gap-1 text-[9px]" style={{ color: '#94a3b8' }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: COR_FLAG.estatistico.fundo, border: `1px solid ${COR_FLAG.estatistico.borda}` }} /> destoa das demais
        </span>
      </div>

      {/* As colunas em azul-claro/itálico são CALCULADAS. Dito aqui porque a CTCe
          fica ao lado da CTC do laudo, com número bem menor, e a diferença entre
          as duas é a acidez potencial — não um erro de importação. */}
      {temCtce && (
        <p className="text-[9px] mt-1" style={{ color: '#7dd3fc' }}>
          <strong>CTCe</strong> (calculada) = Ca + Mg + K + Al — <strong>H+Al não entra</strong>. A <strong>CTC</strong> do laudo é a pH 7,0 (SB + H+Al): são grandezas diferentes, e é normal a CTCe sair bem menor.
        </p>
      )}
    </div>
  );
}
