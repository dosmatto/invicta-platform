'use client';

// Portal do Produtor → Comparativo Invicta (benchmark anônimo, ledger Q3/Q6/Q7/Q10).
//
//   · Produtividade por cultura: a curva dos produtores Invicta (média e desvio,
//     com a faixa central dos quantis — o servidor só manda desvio e quantis a
//     partir de 10 produtores; com 5–9, uma régua com a média), a média
//     Invicta, VOCÊ e "Top X%".
//   · Fertilidade (P, K, V%): você × a média do escopo (cidade → UF → geral).
//
// O servidor devolve só agregados de, no mínimo, 5 produtores — nenhum dado de
// outro produtor chega aqui. Estados honestos: carregando, indisponível, sessão
// expirada, sem acesso, erro (com "tentar de novo"), insuficiente (< 5) e
// "você não tem dado neste ano". O comparativo é do PRODUTOR (todas as fazendas):
// o filtro de talhão/fazenda não o altera. Plano: cada bloco só aparece se a
// seção (produtividade / fertilidade) estiver liberada.

import { useMemo } from 'react';
import { Trophy, BarChart3, FlaskConical, Users, TrendingUp, Info } from 'lucide-react';
import { getLegendas } from '@/lib/store';
import { classeDoValor, corCheiaDaClasse } from '@/lib/legendas';
import { legendaPadraoDe } from '@/lib/processarFertilidade';
import { rotuloAno } from '@/lib/periodo';
import { chaveCulturaBench } from '@/lib/portal/benchmarkCalc';
import type { ItemProdutividade, FertilidadeBenchmark } from '@/lib/portal/benchmarkCalc';
import { diferenca, linhasFertilidade, ordenarCulturasBench, topoPct, type LinhaFertilidade } from '@/lib/portalPainelExtras';
import { usePortal } from '../PortalContext';
import { AvisoBenchmark, CurvaBenchmark, notaCurva } from '../visao/CartaoBenchmark';
import { Cartao, Kpi, Vazio, Esqueleto, COR, fmtNum, fmtInt, suave } from '../ui';
import { useBenchmark, type EstadoBenchmark } from '../useBenchmark';

const NUTRI: Record<'p' | 'k' | 'v', { rotulo: string; nome: string; unidade: string; casas: number }> = {
  p: { rotulo: 'P', nome: 'Fósforo', unidade: 'mg/dm³', casas: 1 },
  k: { rotulo: 'K', nome: 'Potássio', unidade: 'mmolc/dm³', casas: 2 },
  v: { rotulo: 'V%', nome: 'Saturação por bases', unidade: '%', casas: 1 },
};

const Nota = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-start gap-2 rounded-xl px-3 py-2 text-xs" style={{ background: suave('var(--status-info)', 8), border: '1px solid color-mix(in srgb, var(--status-info) 22%, transparent)', color: COR.texto2 }}>
    <Info size={15} className="flex-shrink-0 mt-px" style={{ color: 'var(--status-info)' }} />
    <span>{children}</span>
  </div>
);

/** "+10,0%" / "−5,2%" colorido de forma neutra (acima/abaixo da média, sem juízo de valor). */
const sinal = (v: number, casas = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtNum(Math.abs(v), casas)}`;

// ── Produtividade ───────────────────────────────────────────────────────────

function CartaoCultura({ b, safraRotulo, destaque }: { b: ItemProdutividade; safraRotulo: string; destaque: boolean }) {
  const voce = b.voce?.mediaScHa ?? null;
  const top = topoPct(b.voce?.percentil);
  const dif = diferenca(voce, b.mediaScHa);
  const sub = `Safra ${safraRotulo} · ${b.nProdutores} ${b.nProdutores === 1 ? 'produtor' : 'produtores'}`;
  let corpo;
  if (b.insuficiente || b.mediaScHa == null) {
    corpo = <Vazio compacto icone={Users} titulo={`Ainda não há produtores suficientes (mín. 5) em ${b.cultura} ${safraRotulo}`}
      texto="O comparativo só aparece com produtores bastantes para ninguém ser identificado." />;
  } else {
    const q = b.quantis;
    corpo = (
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-4 items-center">
        <div>
          <CurvaBenchmark b={b} voce={voce} />
          <p className="text-[10.5px] text-center mt-0.5" style={{ color: COR.mudo }}>
            Produtividade (sc/ha) · {notaCurva(b)}
          </p>
        </div>
        <div className="space-y-2.5 min-w-0">
          <ul className="space-y-1.5 text-xs rounded-xl p-3" style={{ background: COR.superficie2 }}>
            <li className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: 'var(--invicta-green-dark)' }} />
              <span style={{ color: COR.texto2 }}>Você</span>
              <strong className="ml-auto tabular-nums">{voce != null ? `${fmtNum(voce, 1)} sc/ha` : '—'}</strong></li>
            <li className="flex items-center gap-2"><span className="w-3 border-t-2 border-dashed flex-shrink-0" style={{ borderColor: COR.texto2 }} />
              <span style={{ color: COR.texto2 }}>Média Invicta</span>
              <strong className="ml-auto tabular-nums">{fmtNum(b.mediaScHa, 1)} sc/ha</strong></li>
            {dif && (
              <li className="flex items-center gap-2"><TrendingUp size={13} className="flex-shrink-0" style={{ color: COR.texto2 }} />
                <span style={{ color: COR.texto2 }}>Diferença</span>
                <strong className="ml-auto tabular-nums" style={{ color: dif.abs >= 0 ? 'var(--p-verde-texto)' : COR.vermelho }}>
                  {sinal(dif.abs)} sc/ha{dif.pct != null ? ` (${sinal(dif.pct)}%)` : ''}
                </strong></li>
            )}
            {b.desvioScHa != null && (
              <li className="flex items-center gap-2"><span className="w-3 flex-shrink-0" />
                <span style={{ color: COR.texto2 }}>Desvio entre produtores</span>
                <strong className="ml-auto tabular-nums">± {fmtNum(b.desvioScHa, 1)} sc/ha</strong></li>
            )}
          </ul>
          {top != null ? (
            <div className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: suave('var(--status-warning)', 10), border: '1px solid color-mix(in srgb, var(--status-warning) 28%, transparent)' }}>
              <Trophy size={22} style={{ color: 'var(--status-warning)' }} className="flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-lg font-extrabold leading-none tabular-nums">Top {top}%</p>
                <p className="text-[11px] mt-1 leading-tight" style={{ color: COR.texto2 }}>
                  Sua produtividade de {b.cultura} supera a de {fmtNum(b.voce!.percentil, 0)}% dos produtores Invicta.
                </p>
              </div>
            </div>
          ) : (
            <p className="text-xs leading-snug" style={{ color: COR.texto2 }}>
              <strong style={{ color: COR.texto }}>Você não tem mapa de colheita de {b.cultura} em {safraRotulo}.</strong> Quando houver um mapa processado no ano, a sua posição aparece aqui.
            </p>
          )}
          {q && (
            <p className="text-[11px] leading-snug" style={{ color: COR.texto2 }}>
              Metade dos produtores fica entre <strong className="tabular-nums" style={{ color: COR.texto }}>{fmtNum(q.p25, 0)}</strong> e <strong className="tabular-nums" style={{ color: COR.texto }}>{fmtNum(q.p75, 0)}</strong> sc/ha;
              {' '}80% entre <strong className="tabular-nums" style={{ color: COR.texto }}>{fmtNum(q.p10, 0)}</strong> e <strong className="tabular-nums" style={{ color: COR.texto }}>{fmtNum(q.p90, 0)}</strong>; a mediana é {fmtNum(q.p50, 0)}.
            </p>
          )}
        </div>
      </div>
    );
  }
  return (
    <Cartao icone={BarChart3} titulo={b.cultura} sub={sub} className={destaque ? 'ring-2 ring-[color:var(--invicta-green)]' : undefined}>
      {corpo}
    </Cartao>
  );
}

// ── Fertilidade ─────────────────────────────────────────────────────────────

function BarraVs({ voce, media, max, casas }: { voce: number | null; media: number; max: number; casas: number }) {
  const larg = (v: number) => `${Math.max(2, Math.min(100, (v / (max || 1)) * 100))}%`;
  const linha = (rotulo: string, v: number | null, cor: string) => (
    <div className="flex items-center gap-2">
      <span className="w-[74px] text-[11px] flex-shrink-0" style={{ color: COR.texto2 }}>{rotulo}</span>
      <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: COR.superficie2 }}>
        {v != null && <div className="h-full rounded-full" style={{ width: larg(v), background: cor }} />}
      </div>
      <strong className="w-[52px] text-right text-xs tabular-nums flex-shrink-0">{v != null ? fmtNum(v, casas) : '—'}</strong>
    </div>
  );
  return <div className="space-y-1.5">{linha('Você', voce, 'var(--invicta-green-dark)')}{linha('Média', media, 'var(--invicta-blue-mid)')}</div>;
}

function CartaoFertilidade({ f, anoTxt, legendas }: { f: FertilidadeBenchmark; anoTxt: string; legendas: Record<string, ReturnType<typeof legendaPadraoDe>> }) {
  const linhas: LinhaFertilidade[] = linhasFertilidade(f);
  const sub = `${f.rotulo} · ${f.nProdutores} ${f.nProdutores === 1 ? 'produtor' : 'produtores'} · camada ${f.camada} cm · laudos até ${anoTxt}`;
  let corpo;
  if (f.insuficiente) {
    corpo = <Vazio compacto icone={Users} titulo="Ainda não há produtores suficientes (mín. 5) com análise de solo" texto="A média de fertilidade só aparece com produtores bastantes para ninguém ser identificado." />;
  } else if (!linhas.length) {
    corpo = <Vazio compacto icone={FlaskConical} titulo="Sem média de P, K ou V% com produtores suficientes" texto="Cada nutriente só aparece quando pelo menos 5 produtores do grupo têm o valor." />;
  } else {
    corpo = (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {linhas.map(l => {
          const n = NUTRI[l.id];
          const leg = legendas[l.id];
          const cVoce = leg && l.voce != null ? classeDoValor(l.voce, leg.classes) : undefined;
          const cMedia = leg ? classeDoValor(l.media, leg.classes) : undefined;
          const max = Math.max(l.media, l.voce ?? 0) * 1.15;
          return (
            <div key={l.id} className="rounded-2xl p-3.5 min-w-0" style={{ background: COR.superficie2 }}>
              <p className="text-sm font-extrabold">{n.rotulo} <span className="text-[11px] font-semibold" style={{ color: COR.texto2 }}>· {n.nome} ({leg?.unidade || n.unidade})</span></p>
              <div className="mt-3"><BarraVs voce={l.voce} media={l.media} max={max} casas={n.casas} /></div>
              <div className="mt-3 text-xs leading-snug" style={{ color: COR.texto2 }}>
                {l.dif ? (
                  <p>
                    <strong className="tabular-nums" style={{ color: COR.texto }}>{l.dif.abs === 0 ? 'Igual à média' : `${sinal(l.dif.abs, n.casas)} ${leg?.unidade || n.unidade}`}</strong>
                    {l.dif.pct != null && l.dif.abs !== 0 ? ` (${sinal(l.dif.pct)}%) ${l.dif.abs > 0 ? 'acima' : 'abaixo'} da média do grupo` : l.dif.abs !== 0 ? (l.dif.abs > 0 ? ' acima da média do grupo' : ' abaixo da média do grupo') : ''}
                  </p>
                ) : <p>Você não tem análise de solo até {anoTxt} na camada {f.camada} cm.</p>}
                {(cVoce || cMedia) && (
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    {cVoce && <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: corCheiaDaClasse(cVoce) }} />Você: <strong style={{ color: COR.texto }}>{cVoce.nome}</strong></span>}
                    {cMedia && <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: corCheiaDaClasse(cMedia) }} />Média: <strong style={{ color: COR.texto }}>{cMedia.nome}</strong></span>}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  return <Cartao icone={FlaskConical} titulo="Fertilidade do solo" sub={sub}>{corpo}</Cartao>;
}

// ── Página ──────────────────────────────────────────────────────────────────

/** O conteúdo recebe o estado pronto (a página liga ao servidor; o conteúdo só desenha). */
export function ComparativoConteudo({ estado, recarregar }: { estado: EstadoBenchmark; recarregar: () => void }) {
  const p = usePortal();
  const libProd = p.liberada('produtividade'), libFert = p.liberada('fertilidade');
  const anoTxt = rotuloAno(p.safra);
  const legendas = useMemo(() => {
    const todas = getLegendas();
    return { p: legendaPadraoDe(todas, 'p'), k: legendaPadraoDe(todas, 'k'), v: legendaPadraoDe(todas, 'v') };
  }, []);

  const dados = estado.estado === 'ok' ? estado.dados : null;
  const culturas = useMemo(() => (dados ? ordenarCulturasBench(dados.produtividade, p.cultura, chaveCulturaBench) : []), [dados, p.cultura]);
  // KPI de posição: a cultura do filtro; sem ela, a primeira em que o produtor tem posição.
  const foco = useMemo(() => culturas.find(c => !c.insuficiente && c.mediaScHa != null && c.voce) ?? culturas.find(c => !c.insuficiente && c.mediaScHa != null) ?? null, [culturas]);

  if (estado.estado === 'carregando') {
    return <div className="space-y-4"><div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">{[0, 1, 2, 3].map(i => <Esqueleto key={i} altura={92} />)}</div><Esqueleto altura={280} /><Esqueleto altura={200} /></div>;
  }
  if (estado.estado !== 'ok' || !dados) {
    return <AvisoBenchmark e={estado as Extract<EstadoBenchmark, { motivo: string }>} recarregar={recarregar} />;
  }

  const topFoco = topoPct(foco?.voce?.percentil);
  const difFoco = diferenca(foco?.voce?.mediaScHa, foco?.mediaScHa);
  const fert = dados.fertilidade;
  const filtrado = !!p.talhao || !!p.fazendaId;

  return (
    <div className="space-y-4">
      {libProd && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <Kpi icone={Trophy} tom="ambar" rotulo="Sua posição" valor={topFoco != null ? `Top ${topFoco}%` : null}
            sub={foco ? `${foco.cultura} · safra ${anoTxt}` : undefined} vazio={foco ? `sem mapa de colheita seu de ${foco.cultura} em ${anoTxt}` : `sem comparativo de produtividade em ${anoTxt}`} />
          <Kpi icone={BarChart3} tom="verde" rotulo="Sua produtividade" valor={foco?.voce ? fmtNum(foco.voce.mediaScHa, 1) : null} unidade="sc/ha"
            delta={difFoco?.pct != null ? { valor: difFoco.pct, rotulo: 'vs. média Invicta' } : null}
            sub={foco ? foco.cultura : undefined} vazio="sem mapa de colheita seu no ano" />
          <Kpi icone={Users} tom="azul" rotulo="Média Invicta" valor={foco?.mediaScHa != null ? fmtNum(foco.mediaScHa, 1) : null} unidade="sc/ha"
            sub={foco ? `${foco.cultura} · ${fmtInt(foco.nProdutores)} produtores` : undefined} vazio="produtores insuficientes (mín. 5)" />
          {libFert ? (
            <Kpi icone={FlaskConical} tom="roxo" rotulo="Fertilidade comparada com" valor={fert.insuficiente ? null : fert.rotulo}
              sub={`${fmtInt(fert.nProdutores)} produtores · camada ${fert.camada} cm`} vazio="produtores insuficientes (mín. 5)" />
          ) : (
            <Kpi icone={Users} tom="roxo" rotulo="Culturas comparadas" valor={fmtInt(culturas.filter(c => !c.insuficiente).length)} sub={`de ${culturas.length} na safra ${anoTxt}`} />
          )}
        </div>
      )}

      {filtrado && <Nota>O comparativo é do produtor, com todas as suas fazendas e talhões: os filtros de fazenda e talhão não o alteram.</Nota>}

      {libProd && (
        <section className="space-y-3" aria-label="Produtividade por cultura">
          <h2 className="text-sm font-extrabold tracking-tight flex items-center gap-2"><BarChart3 size={16} style={{ color: COR.verdeTexto }} /> Produtividade por cultura</h2>
          {culturas.length === 0 ? (
            <Vazio icone={BarChart3} titulo={`Sem comparativo de produtividade em ${anoTxt}`} texto="Nenhuma cultura tem produtores suficientes (mín. 5) nesta safra, nem mapa de colheita seu." />
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {culturas.map(b => <CartaoCultura key={b.cultura} b={b} safraRotulo={anoTxt} destaque={!!p.cultura && chaveCulturaBench(p.cultura) === chaveCulturaBench(b.cultura)} />)}
            </div>
          )}
        </section>
      )}

      {libFert && (
        <section className="space-y-3" aria-label="Fertilidade">
          <h2 className="text-sm font-extrabold tracking-tight flex items-center gap-2"><FlaskConical size={16} style={{ color: COR.verdeTexto }} /> Fertilidade: você × produtores Invicta</h2>
          <CartaoFertilidade f={fert} anoTxt={anoTxt} legendas={legendas} />
        </section>
      )}

      <Nota>
        Anônimo e agregado: o cálculo roda no servidor da Invicta, por produtor (não por talhão), e só mostra um grupo com pelo menos {dados.minimoProdutores} produtores. Nenhum dado, nome ou valor de outro produtor chega ao seu navegador.
      </Nota>
    </div>
  );
}

export function ComparativoPagina() {
  const p = usePortal();
  // O MESMO hook (e cache) do cartão da Visão geral: as duas telas mostram o mesmo estado.
  const { estado, recarregar } = useBenchmark(p.safra, p.preview ? p.cliente.id : undefined);
  return <ComparativoConteudo estado={estado} recarregar={recarregar} />;
}
