'use client';

// Portal do Produtor → Prescrições em taxa variável (/portal/prescricoes).
//
// A pergunta do produtor: o que vai em cada pedaço do talhão, quanto de
// produto preciso comprar e quais arquivos já estão prontos para a máquina.
// A página trabalha UM produto por vez (nunca mistura calcário com semente):
// mapa por dose (as zonas da prescrição, vetor local — sem nuvem), dose média
// PONDERADA pela área, total do produto, área e as exportações já geradas.
// Valem só as prescrições VIGENTES (a versão mais nova de cada uma).
//
// Contas: lib/portalPainelSolo (prescricoesVigentes, resumirPrescricao,
// escalaDeDoses…) — total com a compensação de germinação das sementes.

import { useCallback, useMemo, useState } from 'react';
import { Tractor, Map as MapaIcone, Layers, Gauge, Package, FileDown, ListChecks, ExternalLink } from 'lucide-react';
import { rotuloAno } from '@/lib/periodo';
import { fmtDataCurta } from '@/lib/portalProdutor';
import { fmtRel } from '@/lib/prescricao/resumo';
import type { Prescricao } from '@/lib/prescricao/tipos';
import {
  prescricoesVigentes, resumirPrescricao, produtosPrescritos, chaveProduto, escalaDeDoses, distribuirDoses, doseMediaDoConjunto,
  resumoExportes, rotuloExporte, type EscalaDose,
} from '@/lib/portalPainelSolo';
import { usePortal } from '../PortalContext';
import { Cartao, Kpi, LegendaClasses, Vazio, MiniMapa, COR, fmtHaCurto, fmtPct, talhoesTxt, plural, suave } from '../ui';
import type { CamadaReal } from '../ui';
import { Abas, NomeTalhao, TabelaTalhoes, acaoAbrirTalhao } from './SoloPecas';

/** Camada vetorial LOCAL da prescrição: as zonas do snapshot (`fc`) na cor da faixa da dose. */
function camadaPrescricao(pr: Prescricao, escala: EscalaDose, chaveEscala: string): CamadaReal | null {
  const feats = pr.fc?.features;
  if (!feats?.length) return null;
  const doseDe = new Map(pr.zonas.map(z => [String(z.idZona), z.dose]));
  return {
    chave: `presc:${pr.id}:${pr.versao ?? 1}:${chaveEscala}`,
    nuvem: false,
    colorir: () => ({
      tipo: 'vetor',
      geojson: {
        type: 'FeatureCollection',
        features: feats.map(f => {
          const dose = doseDe.get(String((f.properties as { id?: unknown } | null)?.id ?? ''));
          return { ...f, properties: { ...(f.properties ?? {}), cor: dose != null ? escala.corDe(dose) : '#94a3b8' } };
        }),
      },
      cor: props => String(props.cor ?? '#94a3b8'),
    }),
  };
}

/** Fora do plano ('recomendacoes'), a rota é barrada pela GuardaPlano do shell. */
export function PaginaPrescricoes() {
  return <Conteudo />;
}

function Conteudo() {
  const p = usePortal();
  const { dados, ano } = p;
  const um = !!p.talhao;
  const anoTxt = rotuloAno(p.safra);
  const areaFiltro = useMemo(() => dados.reduce((s, d) => s + (Number.isFinite(d.talhao.areaHa) ? d.talhao.areaHa : 0), 0), [dados]);

  // Todas as prescrições vigentes (registro completo + resumo).
  const vigentes = useMemo(() => dados.flatMap(d => prescricoesVigentes(d, ano).map(pr => ({ pr, r: resumirPrescricao(pr, d.talhao.nome) })))
    .sort((a, b) => b.r.atualizadoEm.localeCompare(a.r.atualizadoEm)), [dados, ano]);
  const resumos = useMemo(() => vigentes.map(v => v.r), [vigentes]);
  const produtos = useMemo(() => produtosPrescritos(resumos), [resumos]);

  const [sel, setSel] = useState('');
  const chave = produtos.find(x => x.chave === sel)?.chave ?? produtos[0]?.chave ?? '';
  const produto = produtos.find(x => x.chave === chave) ?? null;

  // O produto escolhido: no máximo uma prescrição por talhão (a mais recente).
  const doProduto = useMemo(() => {
    const visto = new Set<string>();
    return vigentes.filter(v => chaveProduto(v.r) === chave).filter(v => (visto.has(v.r.talhaoId) ? false : (visto.add(v.r.talhaoId), true)));
  }, [vigentes, chave]);
  const resumosProduto = useMemo(() => doProduto.map(v => v.r), [doProduto]);
  const unidade = produto?.unidade ?? '';
  const escala = useMemo(() => escalaDeDoses(resumosProduto.flatMap(r => r.zonas.map(z => z.dose))), [resumosProduto]);
  const chaveEscala = useMemo(() => escala.faixas.map(f => `${f.min}-${f.max}`).join(','), [escala]);
  const dist = useMemo(() => distribuirDoses(resumosProduto, escala), [resumosProduto, escala]);
  const doseMedia = useMemo(() => doseMediaDoConjunto(resumosProduto), [resumosProduto]);
  const doseMin = resumosProduto.length ? Math.min(...resumosProduto.map(r => r.doseMin ?? Infinity)) : null;
  const doseMax = resumosProduto.length ? Math.max(...resumosProduto.map(r => r.doseMax ?? -Infinity)) : null;
  const comAjuste = resumosProduto.some(r => r.comAjusteGerminacao);
  const exportes = useMemo(() => resumoExportes(resumos), [resumos]);
  const arquivos = useMemo(() => resumos.flatMap(r => r.exportes.map(e => ({ ...e, talhaoId: r.talhaoId, talhaoNome: r.talhaoNome, prescricao: r.nome }))).sort((a, b) => b.em.localeCompare(a.em)), [resumos]);

  // ── Mapa ──
  const talhoesMapa = useMemo(() => doProduto.map(v => ({ id: v.r.talhaoId, nome: v.r.talhaoNome, geojson: dados.find(d => d.talhao.id === v.r.talhaoId)?.talhao.geojson })), [doProduto, dados]);
  const prDe = useMemo(() => new Map(doProduto.map(v => [v.r.talhaoId, v])), [doProduto]);
  const real = useCallback((id: string) => { const v = prDe.get(id); return v ? camadaPrescricao(v.pr, escala, chaveEscala) : null; }, [prDe, escala, chaveEscala]);
  const clicar = useCallback((id: string) => (um ? p.abrirTalhao(id, 'prescricoes') : p.setFiltro({ talhao: id })), [um, p]);
  const rotuloDose = (v: number) => `${fmtRel(v)} ${unidade}`;

  if (!vigentes.length) {
    return <Vazio icone={Tractor} titulo={`Sem prescrição em ${anoTxt}`} texto={um ? 'Este talhão ainda não tem prescrição em taxa variável neste ano.' : `Nenhum talhão no filtro tem prescrição em taxa variável em ${anoTxt}${p.cultura ? ` (${p.cultura})` : ''}.`} />;
  }

  const areaProduto = produto?.areaHa ?? 0;
  return (
    <div className="space-y-4">
      <Abas valor={chave} onChange={setSel} rotulo="Produto prescrito" opcoes={produtos.map(x => ({ valor: x.chave, rotulo: x.produto, sub: `${fmtHaCurto(x.areaHa)} ha` }))} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi icone={Tractor} tom="roxo" rotulo={`Prescrições em ${anoTxt}`} valor={String(vigentes.length)}
          sub={`${plural(produtos.length, 'produto', 'produtos')} · ${talhoesTxt(new Set(resumos.map(r => r.talhaoId)).size)}`} />
        <Kpi icone={Layers} tom="azul" rotulo={`Área com ${produto?.produto ?? 'o produto'}`} valor={areaProduto ? fmtHaCurto(areaProduto) : null} unidade="ha"
          sub={`${fmtPct(areaFiltro ? (areaProduto / areaFiltro) * 100 : 0, 0)} da área do filtro · ${talhoesTxt(produto?.nTalhoes ?? 0)}`} vazio="sem área prescrita" />
        <Kpi icone={Gauge} tom="verde" rotulo="Dose média ponderada" valor={doseMedia != null ? fmtRel(doseMedia) : null} unidade={unidade}
          sub={doseMin != null && doseMax != null && Number.isFinite(doseMin) && Number.isFinite(doseMax) ? `de ${fmtRel(doseMin)} a ${fmtRel(doseMax)} ${unidade}` : undefined} vazio="sem dose" />
        <Kpi icone={Package} tom="ambar" rotulo={`Total de ${produto?.produto ?? 'produto'}`} valor={produto?.total != null ? fmtRel(produto.total) : null} unidade={produto?.unidadeTotal}
          sub={comAjuste ? 'com ajuste de germinação · a comprar' : `${plural(produto?.nPresc ?? 0, 'prescrição', 'prescrições')} somadas`} vazio="faltam dados (ex.: espaçamento) para o total" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 xl:grid-cols-12 gap-4">
        <Cartao className="md:col-span-6 xl:col-span-7" icone={MapaIcone} titulo={`Mapa da dose · ${produto?.produto ?? ''}`}
          sub={`${unidade} · ${um ? 'zonas da prescrição' : 'zonas da prescrição de cada talhão'}`}
          acao={um ? acaoAbrirTalhao(p, 'prescricoes') : null}>
          {doProduto.length === 0 ? <Vazio compacto icone={Tractor} titulo="Sem prescrição deste produto" /> : (
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_230px] gap-4 items-start">
              <MiniMapa talhoes={talhoesMapa} altura={um ? 320 : 300} nomes={!um} modo="real"
                corDe={id => { const r = prDe.get(id)?.r; return r?.doseMedia != null ? escala.corDe(r.doseMedia) : null; }}
                rotulo={id => { const r = prDe.get(id)?.r; return r?.doseMedia != null ? `média ${rotuloDose(r.doseMedia)}` : null; }}
                camadaReal={real} onClicar={clicar} aria="Mapa da dose prescrita" />
              <LegendaClasses titulo={`Dose (${unidade})`}
                itens={dist.faixas.map(f => ({
                  cor: f.cor, rotulo: f.min === f.max ? fmtRel(f.min) : `${fmtRel(f.min)} – ${fmtRel(f.max)}`,
                  pct: f.pct, ha: f.ha, apagado: f.n === 0,
                }))}
                rodape={`% da área prescrita (${fmtHaCurto(dist.areaTotal)} ha). Dose média ponderada: ${doseMedia != null ? rotuloDose(doseMedia) : '—'}.`} />
            </div>
          )}
        </Cartao>

        <Cartao className="md:col-span-6 xl:col-span-5" icone={FileDown} titulo="Arquivos gerados" sub="Exportações já feitas para a máquina — todas as prescrições do filtro"
          acao={um ? { rotulo: 'Abrir no talhão', onClick: () => p.abrirTalhao(p.talhao!.id, 'prescricoes'), titulo: 'Os arquivos ficam na aba Prescrições do talhão' } : null}>
          {arquivos.length === 0 ? (
            <Vazio compacto icone={FileDown} titulo="Nenhum arquivo gerado ainda" texto="Quando a Invicta exportar a prescrição para a máquina (SHP, PDF…), ela aparece aqui." />
          ) : (
            <div className="space-y-3">
              <ul className="flex flex-wrap gap-2">
                {exportes.map(e => (
                  <li key={e.formato} className="rounded-xl px-3 py-2 text-xs" style={{ background: suave('var(--invicta-green)', 10), border: '1px solid color-mix(in srgb, var(--invicta-green) 35%, transparent)' }}>
                    <strong className="block text-sm font-extrabold uppercase">{e.formato}</strong>
                    <span style={{ color: COR.texto2 }}>{plural(e.n, 'arquivo', 'arquivos')} · último {fmtDataCurta(e.ultimo)}</span>
                  </li>
                ))}
              </ul>
              <ul className="space-y-1.5">
                {arquivos.slice(0, 5).map((a, i) => (
                  <li key={`${a.arquivo}-${i}`}>
                    <button type="button" onClick={() => p.abrirTalhao(a.talhaoId, 'prescricoes')} title={a.arquivo}
                      className="w-full flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-xs text-left hover:bg-[var(--bg-surface-hover)]" style={{ background: COR.superficie2 }}>
                      <span className="min-w-0"><strong className="block truncate">{a.talhaoNome} · {a.prescricao}</strong><span className="block truncate" style={{ color: COR.texto2 }}>{a.arquivo}</span></span>
                      <span className="whitespace-nowrap font-bold inline-flex items-center gap-1">{rotuloExporte(a)}<ExternalLink size={11} style={{ color: COR.mudo }} /></span>
                    </button>
                  </li>
                ))}
                {arquivos.length > 5 && <li className="text-[11px] px-1" style={{ color: COR.mudo }}>e mais {arquivos.length - 5}…</li>}
              </ul>
            </div>
          )}
        </Cartao>

        <Cartao className="md:col-span-6 xl:col-span-12" icone={ListChecks} titulo={um ? 'Prescrições deste talhão' : 'Prescrições por talhão'}
          sub="Só a versão mais recente de cada prescrição — clique para abrir o talhão"
          rodape="Dose média ponderada pela área das zonas. Total = dose × área (com ajuste de germinação nas sementes em população desejada).">
          <TabelaTalhoes aria="Prescrições vigentes" onClicar={clicar} minLargura={780}
            linhas={vigentes.map(v => ({ ...v.r, talhaoId: v.r.talhaoId, chaveLinha: v.r.id }))}
            colunas={[
              { id: 'n', titulo: 'Talhão', render: l => <NomeTalhao nome={l.talhaoNome} sub={`${fmtHaCurto(l.areaHa)} ha`} /> },
              { id: 'p', titulo: 'Prescrição', render: l => (
                <span className="block min-w-0">
                  <strong className="block truncate">{l.nome}</strong>
                  <span className="block text-[10.5px]" style={{ color: COR.mudo }}>
                    {l.produto} · v{l.versao}{l.daLavra ? ' · programada na Lavra' : ''}
                  </span>
                </span>
              ) },
              { id: 'z', titulo: 'Zonas', alinhar: 'right', render: l => <span className="tabular-nums">{l.nZonas}</span> },
              { id: 'd', titulo: 'Dose média', alinhar: 'right', render: l => (l.doseMedia != null
                ? <span className="tabular-nums"><strong>{fmtRel(l.doseMedia)}</strong> <span style={{ color: COR.texto2 }}>{l.unidade}</span></span> : <span style={{ color: COR.mudo }}>—</span>) },
              { id: 'f', titulo: 'Faixa', alinhar: 'right', render: l => (l.doseMin != null && l.doseMax != null
                ? <span className="tabular-nums" style={{ color: COR.texto2 }}>{l.doseMin === l.doseMax ? fmtRel(l.doseMin) : `${fmtRel(l.doseMin)} – ${fmtRel(l.doseMax)}`}</span> : '—') },
              { id: 't', titulo: 'Total', alinhar: 'right', render: l => (l.total != null
                ? <span className="tabular-nums"><strong>{fmtRel(l.total)}</strong> <span style={{ color: COR.texto2 }}>{l.unidadeTotal}</span></span> : <span style={{ color: COR.mudo }} title="Falta o espaçamento entre linhas para fechar o total">—</span>) },
              { id: 'a', titulo: 'Arquivos', render: l => (l.exportes.length
                ? <span className="flex flex-wrap gap-1">{[...new Set(l.exportes.map(e => e.formato))].map(f => <span key={f} className="px-1.5 h-5 inline-flex items-center rounded-md text-[10px] font-bold uppercase" style={{ background: suave('var(--invicta-green)', 13), color: 'var(--p-verde-texto)' }}>{f}</span>)}</span>
                : <span style={{ color: COR.mudo }}>—</span>) },
              { id: 'u', titulo: 'Atualizada', alinhar: 'right', sohDesktop: true, render: l => <span className="tabular-nums" style={{ color: COR.texto2 }}>{fmtDataCurta(l.atualizadoEm)}</span> },
            ]} />
        </Cartao>
      </div>
    </div>
  );
}

