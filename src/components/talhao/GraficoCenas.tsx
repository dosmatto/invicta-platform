'use client';

// Gráfico de seleção de cenas (pendência 40) — SVG puro, sem biblioteca.
//
// Resolve o problema de escolher imagem em período longo. O card com miniatura
// serve para 8 cenas de 3 meses; para 300 cenas de 3 anos, não há como ver o
// conjunto — nem como perceber que a melhor imagem de agosto está entre duas
// que o filtro de nuvem quase descartou.
//
// Duas camadas, porque uma é grátis e a outra custa:
//   • BARRAS (instantâneas) — a nuvem da CENA, que o catálogo já entrega.
//   • PONTOS + CURVA (sob demanda) — o % do TALHÃO limpo e o vigor médio, que
//     exigem ler a máscara de nuvem no servidor (/ndvi-avaliar).
// A diferença entre as duas não é acadêmica: neste talhão, a cena de 17,6% de
// nuvem deixou 69% do talhão limpo e a de 9,2% deixou 58% — a menos nublada era
// a pior. Enquanto só houver barras, a tela não afirma nada sobre o talhão.

import { useMemo, useRef, useState } from 'react';
import {
  escalaTempo, posX, dataDoPixel, cenasNaJanela, segmentosVigor, ticksTempo,
} from '@/lib/graficoCenas';
import { TEXTO_MOTIVO, type Motivo, type RegrasMsr } from '@/lib/msrSelecao';
import type { FonteNdvi } from '@/lib/msr';
import { Loader2, Play, Sparkles, Gauge, X } from 'lucide-react';

export interface ItemGrafico {
  chave: string;                // `${fonte}:${id}` — identidade na tela
  id: string;
  data: string;                 // 'YYYY-MM-DD'
  fonte: FonteNdvi;
  nuvem: number | null;         // da cena (catálogo)
  pctLimpo: number | null;      // do talhão (avaliação) — null = não avaliada
  ndviMedio: number | null;
  semMascara?: boolean;
  marcada: boolean;
  salva: boolean;
  rejeitada: boolean;
  aceita: boolean;              // veredito das regras
  motivo: Motivo;
}

const W = 340, H = 186, PL = 26, PR = 24, PT = 10, PB = 40;
const BASE = H - PB;                       // linha do 0%
const BRUSH_Y = H - 26, BRUSH_H = 15;      // faixa de arrasto, abaixo do eixo
const COR_FONTE: Record<FonteNdvi, string> = { sentinel: '#60a5fa', cbers: '#fbbf24' };
const COR_ACEITA = '#4ade80', COR_RECUSA = '#fb923c', COR_VIGOR = '#a78bfa', COR_MORTA = '#475569';

const ddmmyy = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
const yPct = (v: number) => BASE - (Math.min(100, Math.max(0, v)) / 100) * (BASE - PT);

export function GraficoCenas({
  itens, regras, janela, avaliando, processando, progresso,
  onJanela, onAvaliar, onMarcarMelhores, onLimparMarcas, onAbrir, onProcessar,
}: {
  itens: ItemGrafico[];
  regras: RegrasMsr;
  janela: [string, string];
  avaliando: boolean;
  processando: boolean;
  progresso: { feitas: number; total: number } | null;
  onJanela: (ini: string, fim: string) => void;
  onAvaliar: (itens: ItemGrafico[]) => void;
  onMarcarMelhores: (dias: number, doIntervalo: ItemGrafico[]) => void;
  onLimparMarcas: () => void;
  onAbrir: (item: ItemGrafico) => void;
  onProcessar: () => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [arrasto, setArrasto] = useState<{ x0: number; x1: number } | null>(null);
  const [sel, setSel] = useState<[string, string] | null>(null);
  const [diasJanela, setDiasJanela] = useState(15);

  const caixa = { W, PL, PR };
  const escala = useMemo(() => escalaTempo(itens.map(i => i.data)), [itens]);

  // O intervalo de trabalho: o arrasto, quando existe; senão o período inteiro.
  const intervalo = useMemo<[string, string]>(
    () => sel ?? [janela[0], janela[1]],
    [sel, janela],
  );
  const doIntervalo = useMemo(
    () => cenasNaJanela(itens.filter(i => !i.rejeitada), intervalo[0], intervalo[1]),
    [itens, intervalo],
  );

  const aAvaliar = useMemo(() => doIntervalo.filter(i => i.pctLimpo == null), [doIntervalo]);
  const marcadas = useMemo(() => itens.filter(i => i.marcada), [itens]);
  const avaliadas = useMemo(() => itens.filter(i => i.pctLimpo != null), [itens]);
  const temAvaliacao = avaliadas.length > 0;

  const segmentos = useMemo(() => segmentosVigor(
    avaliadas.filter(i => i.ndviMedio != null).map(i => ({ data: i.data, valor: i.ndviMedio as number })),
    30,
  ), [avaliadas]);

  const ticks = useMemo(() => ticksTempo(escala), [escala]);

  // ── arrasto do brush ───────────────────────────────────────────────────────
  // Curto (< 5 px) é CLIQUE: abre a cena mais próxima. Sem isso, tocar num ponto
  // num painel estreito quase sempre vira um arrasto de 1 px e não abre nada.
  const pxDoEvento = (e: React.PointerEvent) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return PL;
    return ((e.clientX - r.left) / r.width) * W;
  };

  function aoDescer(e: React.PointerEvent) {
    if (!itens.length) return;
    const x = pxDoEvento(e);
    setArrasto({ x0: x, x1: x });
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  function aoMover(e: React.PointerEvent) {
    if (!arrasto) return;
    setArrasto({ ...arrasto, x1: pxDoEvento(e) });
  }
  function aoSubir() {
    if (!arrasto) return;
    const { x0, x1 } = arrasto;
    setArrasto(null);
    if (Math.abs(x1 - x0) < 5) {
      const alvo = maisProxima(itens, x0, escala, caixa);
      if (alvo) onAbrir(alvo);
      return;
    }
    const a = dataDoPixel(Math.min(x0, x1), escala, caixa);
    const b = dataDoPixel(Math.max(x0, x1), escala, caixa);
    setSel([a, b]);
    onJanela(a, b);
  }

  const brush = arrasto ?? (sel ? { x0: posX(sel[0], escala, caixa), x1: posX(sel[1], escala, caixa) } : null);

  if (itens.length < 3) return null;

  return (
    <div className="p-2.5 rounded-lg space-y-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold flex items-center gap-1.5" style={{ color: '#93c5fd' }}>
          <Gauge size={11} /> Cenas do período · {itens.length}
        </p>
        <p className="text-[9px]" style={{ color: '#64748b' }}>
          {temAvaliacao ? `${avaliadas.length} avaliada${avaliadas.length > 1 ? 's' : ''}` : 'nuvem da cena (ainda não avaliadas)'}
        </p>
      </div>

      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full select-none" style={{ height: 186, touchAction: 'none' }}
        onPointerDown={aoDescer} onPointerMove={aoMover} onPointerUp={aoSubir} onPointerCancel={aoSubir}>

        {/* grade horizontal + eixo esquerdo (%) */}
        {[0, 25, 50, 75, 100].map(v => (
          <g key={v}>
            <line x1={PL} y1={yPct(v)} x2={W - PR} y2={yPct(v)} stroke="#12294d" strokeWidth={0.5} />
            <text x={PL - 3} y={yPct(v) + 2.5} textAnchor="end" fontSize={6.5} fill="#475569">{v}</text>
          </g>
        ))}

        {/* limiar de % limpo — a linha que separa aceita de recusada */}
        <line x1={PL} y1={yPct(regras.pctLimpoMin)} x2={W - PR} y2={yPct(regras.pctLimpoMin)}
          stroke={COR_ACEITA} strokeWidth={0.7} strokeDasharray="3 2" opacity={0.6} />
        <text x={W - PR + 2} y={yPct(regras.pctLimpoMin) + 2.5} fontSize={6} fill={COR_ACEITA} opacity={0.8}>
          {regras.pctLimpoMin}%
        </text>

        {/* marcas de tempo */}
        {ticks.map(tk => (
          <g key={tk.data}>
            <line x1={posX(tk.data, escala, caixa)} y1={PT} x2={posX(tk.data, escala, caixa)} y2={BASE}
              stroke="#12294d" strokeWidth={0.5} />
            <text x={posX(tk.data, escala, caixa)} y={BASE + 9} textAnchor="middle" fontSize={6.5} fill="#64748b">{tk.rotulo}</text>
          </g>
        ))}

        <line x1={PL} y1={PT} x2={PL} y2={BASE} stroke="#1a3a6b" strokeWidth={0.6} />
        <line x1={PL} y1={BASE} x2={W - PR} y2={BASE} stroke="#1a3a6b" strokeWidth={0.6} />

        {/* faixa do arrasto */}
        {brush && (
          <rect x={Math.min(brush.x0, brush.x1)} y={PT} width={Math.abs(brush.x1 - brush.x0)} height={BASE - PT}
            fill="#60a5fa" opacity={0.13} stroke="#60a5fa" strokeWidth={0.5} strokeOpacity={0.5} pointerEvents="none" />
        )}

        {/* camada 1 — barras: quanto da CENA está limpo (grátis, do catálogo) */}
        {itens.map(i => {
          if (i.pctLimpo != null) return null;
          const x = posX(i.data, escala, caixa);
          const cor = i.rejeitada ? COR_MORTA : COR_FONTE[i.fonte];
          if (i.nuvem == null) {
            // sem metadado de nuvem (CBERS): tique na base, sem afirmar altura
            return <line key={i.chave} x1={x} y1={BASE} x2={x} y2={BASE - 4} stroke={cor} strokeWidth={1} opacity={0.5} />;
          }
          const topo = yPct(100 - i.nuvem);
          return <line key={i.chave} x1={x} y1={BASE} x2={x} y2={topo} stroke={cor} strokeWidth={1}
            opacity={i.rejeitada ? 0.25 : 0.45} />;
        })}

        {/* camada 2 — curva de vigor (NDVI médio), quebrada nos vazios da série */}
        {segmentos.filter(s => s.length > 1).map((s, k) => (
          <polyline key={k} fill="none" stroke={COR_VIGOR} strokeWidth={1} opacity={0.8}
            points={s.map(p => `${posX(p.data, escala, caixa)},${yPct(p.valor * 100)}`).join(' ')} />
        ))}

        {/* camada 2 — pontos: quanto do TALHÃO está limpo */}
        {itens.map(i => {
          if (i.pctLimpo == null) return null;
          const x = posX(i.data, escala, caixa);
          const y = yPct(i.pctLimpo);
          const cor = i.rejeitada ? COR_MORTA : i.aceita ? COR_ACEITA : COR_RECUSA;
          return (
            <g key={i.chave} opacity={i.rejeitada ? 0.35 : 1}>
              {i.marcada && <circle cx={x} cy={y} r={4.6} fill="none" stroke="#fff" strokeWidth={1} />}
              <circle cx={x} cy={y} r={i.salva ? 3.2 : 2.4} fill={cor}
                stroke={i.salva ? '#fbbf24' : 'none'} strokeWidth={1} style={{ cursor: 'pointer' }}>
                <title>
                  {ddmmyy(i.data)} · {i.fonte === 'cbers' ? 'CBERS-4A' : 'Sentinel-2'}
                  {'\n'}talhão limpo: {i.pctLimpo}%{i.semMascara ? ' (sem máscara de nuvem)' : ''}
                  {'\n'}nuvem da cena: {i.nuvem == null ? '—' : `${i.nuvem}%`}
                  {i.ndviMedio != null ? `\nvigor médio: ${i.ndviMedio.toFixed(3)}` : ''}
                  {'\n'}{TEXTO_MOTIVO[i.motivo]}{i.salva ? ' · já salva' : ''}
                </title>
              </circle>
            </g>
          );
        })}

        {/* eixo direito (NDVI) — só faz sentido quando há curva */}
        {temAvaliacao && (
          <>
            <text x={W - PR + 2} y={yPct(100) + 2.5} fontSize={6} fill={COR_VIGOR}>1,0</text>
            <text x={W - PR + 2} y={yPct(0) + 2.5} fontSize={6} fill={COR_VIGOR}>0</text>
          </>
        )}

        {/* faixa de arrasto (afordância) */}
        <rect x={PL} y={BRUSH_Y} width={W - PL - PR} height={BRUSH_H} rx={2} fill="#0b1d3a" stroke="#1a3a6b" strokeWidth={0.5} />
        {brush && (
          <rect x={Math.min(brush.x0, brush.x1)} y={BRUSH_Y} width={Math.abs(brush.x1 - brush.x0)} height={BRUSH_H}
            rx={2} fill="#60a5fa" opacity={0.35} pointerEvents="none" />
        )}
        <text x={(PL + W - PR) / 2} y={BRUSH_Y + 10.5} textAnchor="middle" fontSize={6.5} fill="#64748b" pointerEvents="none">
          {sel ? `${ddmmyy(sel[0])} — ${ddmmyy(sel[1])} · ${doIntervalo.length} cena${doIntervalo.length === 1 ? '' : 's'}` : 'arraste para escolher um intervalo · toque num ponto para abrir'}
        </text>
      </svg>

      {/* legenda */}
      <div className="flex flex-wrap gap-x-2.5 gap-y-1 text-[8px]" style={{ color: '#64748b' }}>
        <Pilula cor={COR_FONTE.sentinel} texto="Sentinel-2 (nuvem da cena)" />
        <Pilula cor={COR_FONTE.cbers} texto="CBERS-4A" />
        {temAvaliacao && <Pilula cor={COR_ACEITA} texto="talhão limpo — aceita" />}
        {temAvaliacao && <Pilula cor={COR_RECUSA} texto="reprovada nas regras" />}
        {temAvaliacao && <Pilula cor={COR_VIGOR} texto="vigor médio (NDVI)" />}
        <Pilula cor="#fbbf24" texto="já salva" />
      </div>

      {sel && (
        <button onClick={() => { setSel(null); onJanela(janela[0], janela[1]); }}
          className="text-[9px] flex items-center gap-1" style={{ color: '#64748b' }}>
          <X size={9} /> limpar o intervalo
        </button>
      )}

      {/* ações */}
      <div className="space-y-1.5 pt-0.5">
        <button onClick={() => onAvaliar(aAvaliar)} disabled={avaliando || aAvaliar.length === 0}
          className="w-full py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1.5"
          style={{ background: avaliando || !aAvaliar.length ? '#12294d' : '#1a3a6b', color: aAvaliar.length ? '#93c5fd' : '#475569' }}>
          {avaliando
            ? <><Loader2 size={11} className="animate-spin" /> Avaliando {progresso ? `${progresso.feitas}/${progresso.total}` : ''}…</>
            : <><Gauge size={11} /> {aAvaliar.length ? `Avaliar ${aAvaliar.length} cena${aAvaliar.length > 1 ? 's' : ''} do intervalo` : 'Intervalo já avaliado'}</>}
        </button>

        {temAvaliacao && (
          <div className="flex items-center gap-1.5">
            <button onClick={() => onMarcarMelhores(diasJanela, doIntervalo)} disabled={processando}
              className="flex-1 py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1.5"
              style={{ background: '#1a3a6b', color: '#c4b5fd' }}>
              <Sparkles size={11} /> Marcar as melhores
            </button>
            <div className="flex items-center gap-1 px-1.5 py-1 rounded" style={{ background: '#0b1d3a', border: '1px solid #1a3a6b' }}>
              <span className="text-[9px]" style={{ color: '#64748b' }}>a cada</span>
              <input type="number" min={1} max={365} value={diasJanela}
                onChange={e => setDiasJanela(Math.max(1, Number(e.target.value) || 1))}
                className="w-9 bg-transparent text-[10px] font-bold outline-none text-center" style={{ color: '#e2e8f0' }} />
              <span className="text-[9px]" style={{ color: '#64748b' }}>dias</span>
            </div>
          </div>
        )}

        {marcadas.length > 0 && (
          <>
            <button onClick={onProcessar} disabled={processando}
              className="w-full py-2 rounded text-xs font-bold text-white flex items-center justify-center gap-1.5"
              style={{ background: processando ? '#1a3a6b' : 'var(--invicta-green-dark)' }}>
              {processando
                ? <><Loader2 size={12} className="animate-spin" /> Processando {progresso ? `${progresso.feitas}/${progresso.total}` : ''}…</>
                : <><Play size={12} /> Processar e salvar {marcadas.length} cena{marcadas.length > 1 ? 's' : ''}</>}
            </button>
            {!processando && (
              <button onClick={onLimparMarcas} className="w-full text-[9px]" style={{ color: '#64748b' }}>
                desmarcar todas
              </button>
            )}
          </>
        )}

        <p className="text-[8px] leading-relaxed" style={{ color: '#475569' }}>
          {temAvaliacao
            ? 'A altura do ponto é quanto DESTE talhão está limpo — não a nuvem da cena. Marcar as melhores escolhe, em cada faixa de dias, a cena com mais talhão limpo (empate: maior vigor).'
            : 'As barras mostram só a nuvem da CENA INTEIRA (~110 km), que pode não ter nada a ver com o talhão. Avalie o intervalo para ver quanto do talhão está realmente limpo.'}
        </p>
      </div>
    </div>
  );
}

function Pilula({ cor, texto }: { cor: string; texto: string }) {
  return (
    <span className="flex items-center gap-1">
      <span style={{ width: 6, height: 6, borderRadius: 3, background: cor, display: 'inline-block' }} />
      {texto}
    </span>
  );
}

// Cena mais próxima do x clicado (só entre as visíveis) — o toque num painel
// estreito nunca acerta o pixel exato do ponto.
function maisProxima(itens: ItemGrafico[], x: number, escala: { t0: number; t1: number }, caixa: { W: number; PL: number; PR: number }) {
  let alvo: ItemGrafico | null = null;
  let melhor = Infinity;
  for (const i of itens) {
    const d = Math.abs(posX(i.data, escala, caixa) - x);
    if (d < melhor) { melhor = d; alvo = i; }
  }
  return melhor <= 8 ? alvo : null;
}
