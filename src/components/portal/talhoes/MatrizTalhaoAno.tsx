'use client';

// Matriz talhão × ano (redesenho do Portal v2 — a do painel antigo, pedida de
// volta no ledger Q8). Uma linha por talhão, uma coluna por ano: a DATA é a
// coleta de solo dos mapas de fertilidade prontos, colorida pela idade (ano
// atual → verde, 1 ano → amarelo, 2 → âmbar, 3+ → vermelho); os MARCADORES
// embaixo são o que mais existe no ano — satélite, colheita, compactação,
// recomendações — e cada um abre a própria aba do talhão, em nova aba.
// Regra pura: lib/portalProdutor (anosDaMatriz, matrizAmostragem, idadeColeta).

import { Fragment, useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Satellite, BarChart3, Activity, FileSpreadsheet, ExternalLink, CalendarClock } from 'lucide-react';
import { anosDaMatriz, matrizAmostragem, idadeColeta, fmtDataCurta, CAMADAS_ANO, type CelulaMatriz, type CamadaAno, type DadosTalhao } from '@/lib/portalProdutor';
import { anoDaSafra, anoDeData, hojeSaoPauloISO } from '@/lib/periodo';
import type { Fazenda, Safra } from '@/lib/store';
import { Cartao } from '../ui/Cartao';
import { Vazio } from '../ui/Vazio';
import { COR, fmtHaCurto, nomeLegivel, suave, talhoesTxt } from '../ui/formato';

type Idade = 0 | 1 | 2 | 3;
const TOM_IDADE: Record<Idade, { rotulo: string; cor: string }> = {
  0: { rotulo: 'ano atual', cor: 'var(--invicta-green)' },
  1: { rotulo: '1 ano', cor: '#ca8a04' },
  2: { rotulo: '2 anos', cor: 'var(--status-warning)' },
  3: { rotulo: '3 anos ou mais', cor: 'var(--status-error)' },
};
const ICONE_CAMADA: Record<CamadaAno, LucideIcon> = { ndvi: Satellite, colheita: BarChart3, compactacao: Activity, recomendacoes: FileSpreadsheet };

function CelulaAno({ c, anoAtual, abrir }: { c: CelulaMatriz; anoAtual: number; abrir: (aba: string) => void }) {
  const extras = CAMADAS_ANO.filter(k => c.camadas[k.id] > 0);
  // Só MAPA PROCESSADO ganha a data (decisão de 15/10/2026): laudo sem mapa e
  // grade sem laudo não aparecem — o produtor vê o que já pode abrir.
  const comMapa = c.situacao === 'mapas';
  if (!comMapa && extras.length === 0) return <span className="block w-full py-1.5 text-center text-xs" style={{ color: COR.mudo }}>—</span>;
  const tom = TOM_IDADE[(idadeColeta(c.ano, anoAtual) ?? 3) as Idade];
  return (
    <div className="flex flex-col items-stretch gap-1">
      {comMapa && (
        <button type="button" onClick={() => abrir('fertilidade')}
          title={`${c.mapas} ${c.mapas === 1 ? 'mapa' : 'mapas'} de fertilidade · ${c.amostras} amostras — abre em nova aba`}
          className="w-full h-8 px-1.5 rounded-lg text-xs font-bold tabular-nums inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-transform hover:-translate-y-px"
          style={{ background: suave(tom.cor, 16), color: COR.texto, border: `1px solid color-mix(in srgb, ${tom.cor} 55%, transparent)` }}>
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: tom.cor }} />
          {fmtDataCurta(c.data)}
          <ExternalLink size={11} style={{ opacity: 0.6 }} />
        </button>
      )}
      {extras.length > 0 && (
        <div className="flex items-center justify-center gap-1">
          {extras.map(k => {
            const Icone = ICONE_CAMADA[k.id];
            const n = c.camadas[k.id];
            return (
              <button key={k.id} type="button" onClick={() => abrir(k.aba)} title={`${k.rotulo}: ${n} — abre em nova aba`} aria-label={`${k.rotulo} em ${c.ano}`}
                className="h-6 px-1.5 rounded-md inline-flex items-center gap-1 text-[11px] tabular-nums"
                style={{ background: COR.superficie2, color: COR.texto2, border: `1px solid ${COR.borda}` }}>
                <Icone size={12} />{n > 1 ? n : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LegendaMatriz() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="font-bold" style={{ color: COR.texto }}>Mapas de fertilidade · data da coleta</span>
      {([0, 1, 2, 3] as Idade[]).map(i => (
        <span key={i} className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded" style={{ background: suave(TOM_IDADE[i].cor, 16), border: `1px solid ${TOM_IDADE[i].cor}` }} />{TOM_IDADE[i].rotulo}
        </span>
      ))}
      <span className="font-bold" style={{ color: COR.texto }}>Também no ano</span>
      {CAMADAS_ANO.map(k => { const Icone = ICONE_CAMADA[k.id]; return <span key={k.id} className="inline-flex items-center gap-1.5"><Icone size={13} />{k.rotulo}</span>; })}
    </div>
  );
}

export function MatrizTalhaoAno({ dados, fazendas, safras, abrir }: {
  dados: DadosTalhao[];
  fazendas: Fazenda[];
  safras: Safra[];
  abrir: (talhaoId: string, aba: string, ano: number) => void;
}) {
  const anoAtual = useMemo(() => anoDeData(hojeSaoPauloISO()) ?? new Date().getFullYear(), []);
  const anosSafras = useMemo(() => safras.map(s => anoDaSafra(s.nome)).filter((a): a is number => a != null), [safras]);
  const anos = useMemo(() => anosDaMatriz(dados, anosSafras), [dados, anosSafras]);
  const linhas = useMemo(() => matrizAmostragem(dados, anos), [dados, anos]);
  const grupos = fazendas.map(f => ({ f, itens: linhas.filter(l => l.fazendaId === f.id) })).filter(g => g.itens.length > 0);
  const semNada = !anos.length || linhas.every(l => !l.temAlgo);
  return (
    <Cartao icone={CalendarClock} titulo="Seus talhões ano a ano"
      sub="Os mapas de fertilidade prontos de cada talhão em cada ano — a data é a da coleta de solo — e o que mais já existe no ano. Clique para abrir o talhão em nova aba, já na aba e no ano certos."
      rodape={semNada ? undefined : <LegendaMatriz />}>
      {semNada ? (
        <Vazio compacto icone={CalendarClock} titulo="Nada processado ainda nos seus talhões" texto="Assim que houver mapas, colheita, satélite ou recomendações, eles aparecem aqui, ano a ano." />
      ) : (
        <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5">
          <table className="w-full text-sm" style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: 300 + anos.length * 104 }}>
            <thead>
              <tr style={{ color: COR.texto2 }}>
                <th className="text-left text-xs font-semibold py-2 pr-3 sticky left-0 z-10" style={{ background: COR.superficie }}>Talhão</th>
                <th className="text-right text-xs font-semibold py-2 pr-4">Área</th>
                {anos.map(a => (
                  <th key={a} className="text-center text-xs py-2 px-1 tabular-nums" style={{ color: a === anoAtual ? COR.texto : COR.texto2, fontWeight: a === anoAtual ? 800 : 600 }}>
                    {a === anoAtual ? <span className="px-2 py-0.5 rounded-full" style={{ background: suave('var(--invicta-green)', 14) }}>{a}</span> : a}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grupos.map(g => {
                const area = g.itens.reduce((s, l) => s + l.areaHa, 0);
                return (
                  <Fragment key={g.f.id}>
                    {grupos.length > 1 && (
                      <tr>
                        <td colSpan={2 + anos.length} className="pt-4 pb-1 text-[11px] font-bold uppercase tracking-wider capitalize" style={{ color: COR.texto2 }}>
                          {nomeLegivel(g.f.nome)} · {talhoesTxt(g.itens.length)} · {fmtHaCurto(area)} ha
                        </td>
                      </tr>
                    )}
                    {g.itens.map(l => (
                      <tr key={l.talhaoId}>
                        <td className="py-1.5 pr-3 font-bold sticky left-0 z-10 align-top whitespace-nowrap" style={{ color: COR.texto, background: COR.superficie, borderTop: `1px solid ${COR.borda}` }}>{l.nome}</td>
                        <td className="py-1.5 pr-4 text-right tabular-nums whitespace-nowrap align-top" style={{ color: COR.texto2, borderTop: `1px solid ${COR.borda}` }}>{fmtHaCurto(l.areaHa)} ha</td>
                        {l.celulas.map(c => (
                          <td key={c.ano} className="py-1.5 px-1 align-top" style={{ borderTop: `1px solid ${COR.borda}` }}>
                            <CelulaAno c={c} anoAtual={anoAtual} abrir={aba => abrir(l.talhaoId, aba, c.ano)} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Cartao>
  );
}
