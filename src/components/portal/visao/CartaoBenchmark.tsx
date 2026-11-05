'use client';

// Cartão "Benchmark Invicta — Produtividade": a curva dos produtores Invicta
// na cultura e safra (aproximada pela média e pelo desvio que o servidor
// devolve), a média Invicta tracejada, VOCÊ em destaque e a posição "Top X%".
// Reaproveitável na página Comparativo (exportado).
//
// Estados honestos — os MESMOS da página Comparativo (um hook só, useBenchmark,
// e um aviso só, AvisoBenchmark): indisponível (bancada / servidor sem o
// recurso), sessão expirada, fora do acesso, erro (com "tentar de novo"),
// insuficiente (< 5 produtores na cultura+safra), sem colheita sua no ano.

import { Trophy, RefreshCw, LogIn, ShieldOff, ServerOff, AlertTriangle, type LucideIcon } from 'lucide-react';
import { Cartao, type AcaoCartao } from '../ui/Cartao';
import { Vazio } from '../ui/Vazio';
import { Esqueleto } from '../ui/Esqueleto';
import { COR, fmtNum } from '../ui/formato';
import { benchDaCultura, TEXTO_FALHA_BENCHMARK, type EstadoBenchmark, type FalhaBenchmarkPortal, type ItemProdutividade } from '../useBenchmark';

const ICONE_FALHA: Record<FalhaBenchmarkPortal, LucideIcon> = { indisponivel: ServerOff, 'sem-sessao': LogIn, proibido: ShieldOff, erro: AlertTriangle };

/** Aviso de consulta que não deu certo — o mesmo no cartão (compacto) e na página. */
export function AvisoBenchmark({ e, recarregar, compacto }: {
  e: Extract<EstadoBenchmark, { motivo: string }>;
  recarregar?: () => void;
  compacto?: boolean;
}) {
  return (
    <Vazio compacto={compacto} icone={ICONE_FALHA[e.estado]} titulo={TEXTO_FALHA_BENCHMARK[e.estado].titulo} texto={e.motivo}
      acao={e.estado === 'erro' && recarregar ? (
        <button type="button" onClick={recarregar} className="mt-2 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-bold" style={{ background: COR.verdeEscuro, color: '#fff' }}>
          <RefreshCw size={13} /> Tentar de novo
        </button>
      ) : undefined} />
  );
}

/** Legenda curta sob a curva/régua (o mesmo texto no cartão e na página). */
export function notaCurva(b: ItemProdutividade): string {
  if (b.quantis) return 'sombra = metade central dos produtores';
  if (b.desvioScHa != null) return `curva aproximada pela média e desvio de ${b.nProdutores} produtores`;
  return `média de ${b.nProdutores} produtores — a curva aparece a partir de 10`;
}

/** Sem desvio (servidor só manda com ≥ 10 produtores): régua com a média e você. */
function ReguaBenchmark({ media, voce, rotuloVoce }: { media: number; voce: number | null; rotuloVoce: string }) {
  const W = 320, H = 70, eixo = 40;
  const lo0 = Math.min(media * 0.8, voce ?? Infinity), hi0 = Math.max(media * 1.2, voce ?? -Infinity);
  const passo = (hi0 - lo0) > 60 ? 20 : 10;
  const lo = Math.floor(lo0 / passo) * passo, hi = Math.ceil(hi0 / passo) * passo;
  const x = (v: number) => 6 + ((v - lo) / ((hi - lo) || 1)) * (W - 12);
  const ticks = Array.from({ length: Math.round((hi - lo) / passo) + 1 }, (_, i) => lo + i * passo);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sua produtividade e a média dos produtores Invicta" style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
      <line x1={4} x2={W - 4} y1={eixo} y2={eixo} stroke={COR.borda} strokeWidth={2} />
      <line x1={x(media)} x2={x(media)} y1={10} y2={eixo} stroke={COR.texto2} strokeWidth={1.4} strokeDasharray="4 3" />
      {voce != null && (
        <circle cx={x(voce)} cy={eixo} r={6} fill="var(--invicta-green-dark)" stroke="var(--bg-surface)" strokeWidth={2}>
          <title>{`${rotuloVoce}: ${fmtNum(voce, 1)} sc/ha`}</title>
        </circle>
      )}
      {ticks.map(t => <text key={t} x={x(t)} y={H - 6} textAnchor="middle" fontSize={10.5} fill={COR.texto2}>{t}</text>)}
    </svg>
  );
}

export function CurvaBenchmark({ b, voce, rotuloVoce = 'Você' }: { b: ItemProdutividade; voce: number | null; rotuloVoce?: string }) {
  if (b.desvioScHa == null) return <ReguaBenchmark media={b.mediaScHa!} voce={voce} rotuloVoce={rotuloVoce} />;
  const media = b.mediaScHa!, desvio = Math.max(b.desvioScHa, 0.5);
  const q = b.quantis;
  const W = 320, H = 150, base = 22, topo = 8;
  const lo0 = Math.min(q?.p10 ?? media - 2 * desvio, voce ?? Infinity, media - 2.6 * desvio);
  const hi0 = Math.max(q?.p90 ?? media + 2 * desvio, voce ?? -Infinity, media + 2.6 * desvio);
  const passo = (hi0 - lo0) > 60 ? 20 : 10;
  const lo = Math.floor(lo0 / passo) * passo, hi = Math.ceil(hi0 / passo) * passo;
  const x = (v: number) => 6 + ((v - lo) / ((hi - lo) || 1)) * (W - 12);
  const dens = (v: number) => Math.exp(-0.5 * ((v - media) / desvio) ** 2);
  const pts = Array.from({ length: 61 }, (_, i) => lo + ((hi - lo) * i) / 60);
  const y = (d: number) => H - base - d * (H - base - topo);
  const curva = `M${x(lo)} ${H - base} ` + pts.map(v => `L${x(v).toFixed(1)} ${y(dens(v)).toFixed(1)}`).join(' ') + ` L${x(hi)} ${H - base} Z`;
  const faixa = q ? pts.filter(v => v >= q.p25 && v <= q.p75) : [];
  const ticks = Array.from({ length: Math.round((hi - lo) / passo) + 1 }, (_, i) => lo + i * passo);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Distribuição da produtividade dos produtores Invicta" style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id="bench-curva" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--invicta-green)" stopOpacity="0.55" />
          <stop offset="1" stopColor="var(--invicta-green)" stopOpacity="0.12" />
        </linearGradient>
      </defs>
      <path d={curva} fill="url(#bench-curva)" stroke="var(--invicta-green)" strokeWidth={1.4} />
      {faixa.length > 1 && (
        <path d={`M${x(faixa[0])} ${H - base} ` + faixa.map(v => `L${x(v).toFixed(1)} ${y(dens(v)).toFixed(1)}`).join(' ') + ` L${x(faixa[faixa.length - 1])} ${H - base} Z`}
          fill="var(--invicta-green)" fillOpacity={0.22}>
          <title>{`Metade central dos produtores: ${fmtNum(q!.p25, 1)} a ${fmtNum(q!.p75, 1)} sc/ha`}</title>
        </path>
      )}
      <line x1={x(media)} x2={x(media)} y1={topo} y2={H - base} stroke={COR.texto2} strokeWidth={1.4} strokeDasharray="4 3" />
      {voce != null && (
        <g>
          <line x1={x(voce)} x2={x(voce)} y1={topo - 2} y2={H - base} stroke="var(--text-primary)" strokeWidth={2} />
          <circle cx={x(voce)} cy={y(dens(voce))} r={5} fill="var(--invicta-green-dark)" stroke="var(--bg-surface)" strokeWidth={2}>
            <title>{`${rotuloVoce}: ${fmtNum(voce, 1)} sc/ha`}</title>
          </circle>
        </g>
      )}
      <line x1={4} x2={W - 4} y1={H - base} y2={H - base} stroke={COR.borda} />
      {ticks.map(t => <text key={t} x={x(t)} y={H - 6} textAnchor="middle" fontSize={10.5} fill={COR.texto2}>{t}</text>)}
    </svg>
  );
}

export function CartaoBenchmark({ estado, recarregar, cultura, safraRotulo, voce, rotuloVoce, acao, className, semColheita, predominante }: {
  estado: EstadoBenchmark;
  recarregar?: () => void;
  /** Cultura do seu KPI (a predominante, se o filtro está em "Todas"). */
  cultura: string;
  safraRotulo: string;
  /** Sua média (ou a do talhão escolhido); null = sem mapa de colheita. */
  voce: number | null;
  rotuloVoce?: string;
  acao?: AcaoCartao;
  className?: string;
  semColheita?: boolean;
  /** Filtro em "Todas" com mais de uma cultura no ano: `cultura` é a predominante. */
  predominante?: boolean;
}) {
  const titulo = 'Benchmark Invicta';
  const sub = `Produtividade${cultura ? ` (${cultura}${predominante ? ', predominante' : ''})` : ''} · anônimo e agregado: nenhum dado de outro produtor sai do servidor.`;
  let corpo;
  if (estado.estado === 'carregando') corpo = <div className="space-y-2"><Esqueleto altura={110} /><Esqueleto altura={14} largura="60%" /></div>;
  else if (estado.estado !== 'ok') corpo = <AvisoBenchmark compacto e={estado} recarregar={recarregar} />;
  else if (semColheita || !cultura) corpo = <Vazio compacto icone={Trophy} titulo={`Sem mapa de colheita seu em ${safraRotulo}`} texto="O comparativo de produtividade aparece quando houver um mapa de colheita processado no ano." />;
  else {
    const bc = benchDaCultura(estado.dados, cultura);
    if (bc.estado === 'insuficiente') {
      corpo = <Vazio compacto icone={Trophy} titulo={`Ainda não há produtores suficientes (mín. ${bc.minimo}) em ${cultura} ${safraRotulo}`}
        texto="O comparativo só aparece com produtores bastantes para ninguém ser identificado." />;
    } else {
      const b = bc.item;
      const top = b.voce && rotuloVoce == null ? Math.max(1, Math.round(100 - b.voce.percentil)) : null;
      const valorVoce = rotuloVoce == null ? (b.voce?.mediaScHa ?? voce) : voce;
      corpo = (
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_auto] gap-3 items-center">
          <div>
            <CurvaBenchmark b={b} voce={valorVoce} rotuloVoce={rotuloVoce} />
            <p className="text-[10.5px] text-center mt-0.5" style={{ color: COR.mudo }}>Produtividade (sc/ha) · {notaCurva(b)}</p>
          </div>
          <ul className="space-y-1.5 text-xs rounded-xl p-2.5" style={{ background: COR.superficie2 }}>
            <li className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--invicta-green-dark)' }} />
              <span style={{ color: COR.texto2 }}>{rotuloVoce ?? 'Você'}:</span><strong className="tabular-nums">{valorVoce != null ? `${fmtNum(valorVoce, 1)} sc/ha` : '—'}</strong></li>
            <li className="flex items-center gap-2"><span className="w-3 border-t-2 border-dashed" style={{ borderColor: COR.texto2 }} />
              <span style={{ color: COR.texto2 }}>Média Invicta:</span><strong className="tabular-nums">{fmtNum(b.mediaScHa, 1)} sc/ha</strong></li>
            {top != null && (
              <li className="flex items-center gap-2"><Trophy size={14} style={{ color: 'var(--status-warning)' }} />
                <span style={{ color: COR.texto2 }}>Sua posição:</span><strong>Top {top}%</strong></li>
            )}
          </ul>
        </div>
      );
    }
  }
  return <Cartao className={className} icone={Trophy} titulo={titulo} sub={sub} acao={acao}>{corpo}</Cartao>;
}
