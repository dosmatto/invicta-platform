'use client';

// PRESCRIÇÕES AGRONÔMICAS — doses em taxa variável por zona de manejo, prontas
// para virar arquivo de aplicação (SHP/Excel/PDF).
//
// Abas: Nova · Salvas · Arquivos de Aplicação · Histórico · Comparação (futura).
// O cálculo vive em lib/prescricao (puro, testado); aqui é montagem e edição.
// Fonte das zonas: os ZONEAMENTOS salvos na aba Zonas de Manejo — sem duplicar
// dado nenhum: a prescrição guarda um SNAPSHOT (documento operacional).

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import {
  getZoneamentosMeap, getPrescricoes, savePrescricao, updatePrescricao,
  deletePrescricao, registrarExportePrescricao, getTalhoes, getFazendas, getClientes,
  type ZoneamentoMeap,
} from '@/lib/store';
import { emailUsuario } from '@/lib/empresa';
import {
  redistribuirPorEstoque, distribuirProporcional, resumoDoses, nutrientesPorZona, pesoDoRank,
} from '@/lib/prescricao/calculo';
import {
  distribuirSementes, estoqueTotalSementes, metricasSementes,
  type EstoqueSementes,
} from '@/lib/prescricao/sementes';
import {
  validarPrescricao, exportarSHPPrescricao, exportarXlsxPrescricao, exportarPDFPrescricao,
  corDaDose, areaHaDe,
} from '@/lib/prescricao/exportar';
import {
  ROTULO_TIPO, ROTULO_MODO, UNIDADE_TOTAL,
  type Prescricao, type TipoPrescricao, type ModoCalculo, type UnidadeDose,
  type ZonaDose, type ParamsCalculo,
} from '@/lib/prescricao/tipos';
import {
  Plus, Save, Trash2, FileDown, FileSpreadsheet, FileText, Loader2, AlertTriangle,
  CheckCircle2, History, FolderOpen, Scale, Sprout, Pencil, RefreshCw,
} from 'lucide-react';
import { inputStyle } from '@/constants/ui';

const fmt = (v: number, d = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmt0 = (v: number) => Math.round(v).toLocaleString('pt-BR');
const dataBR = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

type AbaId = 'nova' | 'salvas' | 'arquivos' | 'historico' | 'comparacao';

// Rascunho da prescrição em edição (nova ou aberta de uma salva).
interface Rascunho {
  editandoId: string | null;
  nome: string;
  tipo: TipoPrescricao;
  produto: string;
  unidade: UnidadeDose;
  custoUnit: string;             // texto do input; número no salvar
  zoneamentoId: string;
  zoneamentoNome: string;
  modo: ModoCalculo;
  params: ParamsCalculo;
  zonas: ZonaDose[];
  fc: GeoJSON.FeatureCollection | null;
}

const RASCUNHO_VAZIO: Rascunho = {
  editandoId: null, nome: '', tipo: 'fertilizante', produto: '', unidade: 'kg/ha',
  custoUnit: '', zoneamentoId: '', zoneamentoNome: '', modo: 'manual',
  params: {}, zonas: [], fc: null,
};

// Zonas a partir de um zoneamento salvo (1 feature = 1 zona no MEAP).
function zonasDoZoneamento(z: ZoneamentoMeap): ZonaDose[] {
  return z.fc.features.map((f, i) => {
    const p = (f.properties ?? {}) as { id?: string; zona?: string | number; classe?: string; cor?: string; potencialRank?: number };
    return {
      idZona: String(p.id ?? `z${i}`),
      nomeZona: String(p.zona ?? i + 1),
      classe: String(p.classe ?? '—'),
      cor: String(p.cor ?? '#94a3b8'),
      areaHa: areaHaDe(f),
      potencialRank: typeof p.potencialRank === 'number' ? p.potencialRank : undefined,
      dose: 0,
    };
  });
}

export function PrescricoesSection({ safraNome }: { safraNome?: string } = {}) {
  const { nav } = useApp();
  const talhaoId = nav.talhaoId ?? '';
  const [aba, setAba] = useState<AbaId>('nova');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const h = () => setTick(t => t + 1);
    window.addEventListener('inv:prescricoes', h);
    return () => window.removeEventListener('inv:prescricoes', h);
  }, []);

  const zoneamentos = useMemo(() => (talhaoId ? getZoneamentosMeap(talhaoId) : []), [talhaoId]);
  const prescricoes = useMemo(() => (talhaoId ? getPrescricoes(talhaoId) : []), [talhaoId, tick]);

  const [r, setR] = useState<Rascunho>(RASCUNHO_VAZIO);
  const patch = (p: Partial<Rascunho>) => setR(x => ({ ...x, ...p }));
  const patchParams = (p: Partial<ParamsCalculo>) => setR(x => ({ ...x, params: { ...x.params, ...p } }));

  const [avisosCalc, setAvisosCalc] = useState<string[]>([]);
  const [erro, setErro] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [exportando, setExportando] = useState('');

  function escolherZoneamento(id: string) {
    const z = zoneamentos.find(x => x.id === id);
    if (!z) { patch({ zoneamentoId: '', zoneamentoNome: '', zonas: [], fc: null }); return; }
    patch({ zoneamentoId: z.id, zoneamentoNome: z.nome, zonas: zonasDoZoneamento(z), fc: z.fc });
    setAvisosCalc([]); setErro(''); setOkMsg('');
  }

  function abrirSalva(p: Prescricao) {
    setR({
      editandoId: p.id, nome: p.nome, tipo: p.tipo, produto: p.produto, unidade: p.unidade,
      custoUnit: p.custoUnit != null ? String(p.custoUnit) : '',
      zoneamentoId: p.zoneamentoId, zoneamentoNome: p.zoneamentoNome,
      modo: p.modo, params: p.params, zonas: p.zonas.map(z => ({ ...z })), fc: p.fc,
    });
    setAvisosCalc([]); setErro(''); setOkMsg('');
    setAba('nova');
  }

  // ── Cálculo (por modo) ────────────────────────────────────────────────────
  const nRanks = useMemo(() => Math.max(1, ...r.zonas.map(z => z.potencialRank ?? 1)), [r.zonas]);

  function calcular() {
    setErro(''); setOkMsg('');
    try {
      const pr = r.params;
      if (r.modo === 'estoque') {
        if (!pr.totalDisponivel || pr.totalDisponivel <= 0) { setErro('Informe a quantidade total disponível.'); return; }
        const rel = pr.relacao ?? 'direta';
        const res = redistribuirPorEstoque(
          r.zonas.map(z => ({ id: z.idZona, areaHa: z.areaHa, peso: pesoDoRank(z.potencialRank, nRanks, rel) })),
          pr.totalDisponivel,
          { doseMin: pr.doseMin, doseMax: pr.doseMax, incremento: pr.incremento },
        );
        patch({ zonas: r.zonas.map(z => ({ ...z, dose: res.doses[z.idZona] ?? 0 })) });
        setAvisosCalc(res.avisos);
      } else if (r.modo === 'proporcional') {
        if (!pr.doseMedia || pr.doseMedia <= 0) { setErro('Informe a dose média.'); return; }
        const rel = pr.relacao ?? 'direta';
        const res = distribuirProporcional(
          // valorBase = potencial da zona (rank 1 = maior) → valor MAIOR
          r.zonas.map(z => ({ id: z.idZona, areaHa: z.areaHa, valorBase: nRanks - (z.potencialRank ?? Math.ceil(nRanks / 2)) + 1 })),
          { doseMedia: pr.doseMedia, variacaoPct: pr.variacaoPct ?? 20, relacao: rel, doseMin: pr.doseMin, doseMax: pr.doseMax },
        );
        patch({ zonas: r.zonas.map(z => ({ ...z, dose: res.doses[z.idZona] ?? 0 })) });
        setAvisosCalc(res.avisos);
      }
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
  }

  // sementes: estado próprio do estoque (como o usuário informa)
  const [estSem, setEstSem] = useState<{ modo: keyof EstoqueSementes; valor: string }>({ modo: 'populacaoMediaHa', valor: '' });

  function calcularSementes() {
    setErro(''); setOkMsg('');
    try {
      const ps = r.params.sementes ?? { germinacaoPct: 90 };
      const areaTot = r.zonas.reduce((s, z) => s + z.areaHa, 0);
      const v = Number(estSem.valor.replace(',', '.'));
      if (!v || v <= 0) { setErro('Informe o estoque de sementes.'); return; }
      const total = estoqueTotalSementes({ [estSem.modo]: v } as EstoqueSementes, ps, areaTot);
      const rel = r.params.relacao ?? 'direta';
      const res = distribuirSementes(
        r.zonas.map(z => ({ id: z.idZona, areaHa: z.areaHa, potencialRank: z.potencialRank })),
        total, ps, rel,
      );
      patch({ zonas: r.zonas.map(z => ({ ...z, dose: res.doses[z.idZona] ?? 0 })), params: { ...r.params, totalDisponivel: total } });
      const dif = total - res.usado;
      const pctDif = total > 0 ? (dif / total) * 100 : 0;
      const extra: string[] = [];
      if (res.falta > 0) extra.push(`FALTAM sementes para a população mínima: ${fmt0(res.falta)}.`);
      else if (pctDif > 5) extra.push(`Sobrarão ${fmt0(dif)} sementes (${fmt(pctDif, 1)}%) — considere subir a população máxima ou reduzir o estoque reservado.`);
      setAvisosCalc([...res.avisos, ...extra, `População média resultante: ${fmt0(res.populacaoMedia)} plantas/ha.`]);
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
  }

  // ── Resumo ao vivo (editor) ───────────────────────────────────────────────
  const custoNum = Number(r.custoUnit.replace(',', '.')) || undefined;
  const resumo = useMemo(() => resumoDoses(r.zonas, custoNum), [r.zonas, custoNum]);
  const nutri = useMemo(() => (
    r.tipo === 'organico' && r.params.organico
      ? nutrientesPorZona(r.zonas.map(z => ({ id: z.idZona, areaHa: z.areaHa, dose: z.dose })), r.params.organico)
      : null
  ), [r.tipo, r.params.organico, r.zonas]);

  const metricasSem = useMemo(() => {
    if (r.tipo !== 'sementes' || !r.params.sementes || resumo.doseMedia <= 0) return null;
    try { return metricasSementes(resumo.doseMedia, resumo.areaHa, r.params.sementes); } catch { return null; }
  }, [r.tipo, r.params.sementes, resumo]);

  // ── Salvar / exportar ─────────────────────────────────────────────────────
  function montarPrescricao(): Omit<Prescricao, 'id' | 'versao' | 'criadoEm' | 'atualizadoEm' | 'historico' | 'exportes'> | null {
    if (!r.fc || !r.zonas.length) { setErro('Escolha um zoneamento (Zonas de Manejo) primeiro.'); return null; }
    if (!r.nome.trim()) { setErro('Dê um nome à prescrição (ex.: "Calcário 2026").'); return null; }
    if (!r.produto.trim()) { setErro('Informe o produto.'); return null; }
    return {
      talhaoId, ano: safraNome || undefined, nome: r.nome.trim(), tipo: r.tipo,
      produto: r.produto.trim(), unidade: r.unidade, custoUnit: custoNum,
      zoneamentoId: r.zoneamentoId, zoneamentoNome: r.zoneamentoNome,
      modo: r.modo, params: r.params, zonas: r.zonas, fc: r.fc,
      criadoPor: emailUsuario() ?? 'sistema',
    };
  }

  function salvar() {
    setErro(''); setOkMsg('');
    const base = montarPrescricao();
    if (!base) return;
    if (r.editandoId) {
      updatePrescricao(r.editandoId, base, 'doses/parâmetros editados', emailUsuario() ?? 'sistema');
      setOkMsg('Prescrição atualizada (nova versão registrada no histórico).');
    } else {
      const nova = savePrescricao(base);
      patch({ editandoId: nova.id });
      setOkMsg('Prescrição salva — agora dá para exportar.');
    }
    setTick(t => t + 1);
  }

  async function exportar(formato: 'shp' | 'xlsx' | 'pdf', deSalva?: Prescricao) {
    setErro(''); setOkMsg('');
    let p: Prescricao | undefined = deSalva;
    if (!p) {
      if (!r.editandoId) { setErro('Salve a prescrição antes de exportar — o arquivo precisa ser rastreável.'); return; }
      p = getPrescricoes(talhaoId).find(x => x.id === r.editandoId);
    }
    if (!p) { setErro('Prescrição não encontrada.'); return; }
    const val = validarPrescricao(p);
    if (val.erros.length) { setErro(`Não exportado — corrija: ${val.erros.join(' · ')}`); return; }
    if (val.avisos.length) setAvisosCalc(val.avisos);
    setExportando(`${p.id}:${formato}`);
    try {
      const t = getTalhoes().find(x => x.id === talhaoId);
      const f = getFazendas().find(x => x.id === t?.fazendaId);
      const c = getClientes().find(x => x.id === f?.clienteId);
      const nome =
        formato === 'shp' ? await exportarSHPPrescricao(p)
        : formato === 'xlsx' ? await exportarXlsxPrescricao(p)
        : await exportarPDFPrescricao(p, {
            produtor: c?.nome ?? '', fazenda: f?.nome ?? '', talhao: t?.nome ?? '',
            logoClienteUrl: (c as { logoUrl?: string } | undefined)?.logoUrl ?? null,
          });
      registrarExportePrescricao(p.id, formato, nome, emailUsuario() ?? 'sistema');
      setOkMsg(`Arquivo gerado: ${nome}`);
      setTick(t2 => t2 + 1);
    } catch (e) {
      setErro(`Falha ao exportar: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setExportando(''); }
  }

  if (!talhaoId) return <p className="px-4 py-6 text-center text-[11px]" style={{ color: '#64748b' }}>Selecione um talhão.</p>;

  const ABAS: Array<[AbaId, string, React.ElementType]> = [
    ['nova', r.editandoId ? 'Editar' : 'Nova', Plus],
    ['salvas', `Salvas (${prescricoes.length})`, FolderOpen],
    ['arquivos', 'Arquivos de Aplicação', FileDown],
    ['historico', 'Histórico', History],
    ['comparacao', 'Planejado × Realizado', Scale],
  ];

  return (
    <div>
      <div className="flex gap-1 p-2 flex-wrap" style={{ borderBottom: '1px solid #1a3a6b' }}>
        {ABAS.map(([id, rot, Ic]) => (
          <button key={id} onClick={() => setAba(id)}
            className="flex items-center gap-1 px-2 py-1.5 rounded text-[10px] font-semibold"
            style={{ background: aba === id ? 'var(--invicta-blue-mid)' : '#0f2240', color: aba === id ? '#fff' : '#93c5fd' }}>
            <Ic size={11} /> {rot}
          </button>
        ))}
      </div>

      <div className="px-4 py-3 space-y-3">
        {erro && <Aviso tom="erro" texto={erro} />}
        {okMsg && <Aviso tom="ok" texto={okMsg} />}

        {aba === 'nova' && (
          <>
            {/* ── Identificação ── */}
            <div className="grid grid-cols-2 gap-2">
              <Campo rotulo="Nome da prescrição *">
                <input value={r.nome} onChange={e => patch({ nome: e.target.value })} placeholder='ex.: "Calcário 2026"'
                  className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
              </Campo>
              <Campo rotulo="Tipo">
                <select value={r.tipo}
                  onChange={e => {
                    const tipo = e.target.value as TipoPrescricao;
                    patch({ tipo, unidade: tipo === 'sementes' ? 'sementes/ha' : tipo === 'organico' || tipo === 'corretivo' ? 't/ha' : 'kg/ha' });
                  }}
                  className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
                  {Object.entries(ROTULO_TIPO).map(([id, rot]) => <option key={id} value={id}>{rot}</option>)}
                </select>
              </Campo>
              <Campo rotulo="Produto *">
                <input value={r.produto} onChange={e => patch({ produto: e.target.value })}
                  placeholder={r.tipo === 'sementes' ? 'cultivar/híbrido' : 'ex.: Calcário dolomítico'}
                  className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
              </Campo>
              <div className="grid grid-cols-2 gap-2">
                <Campo rotulo="Unidade">
                  <select value={r.unidade} onChange={e => patch({ unidade: e.target.value as UnidadeDose })}
                    className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
                    {(['kg/ha', 't/ha', 'sementes/ha', 'L/ha'] as UnidadeDose[]).map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </Campo>
                <Campo rotulo={`Custo (R$/${UNIDADE_TOTAL[r.unidade]})`}>
                  <input value={r.custoUnit} onChange={e => patch({ custoUnit: e.target.value })} placeholder="opcional"
                    className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
                </Campo>
              </div>
            </div>

            {/* ── Fonte das zonas ── */}
            <Campo rotulo="Zonas de manejo (mapa-base) *">
              <select value={r.zoneamentoId} onChange={e => escolherZoneamento(e.target.value)}
                className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
                <option value="">Selecione o zoneamento…</option>
                {zoneamentos.map(z => <option key={z.id} value={z.id}>{z.nome} · {z.meta.nZonas} zonas{z.padrao ? ' · padrão' : ''}</option>)}
              </select>
              {zoneamentos.length === 0 && (
                <p className="text-[10px] mt-1" style={{ color: '#fbbf24' }}>
                  Este talhão ainda não tem zoneamento salvo. Crie um na aba <b>Zonas de Manejo</b> primeiro.
                </p>
              )}
            </Campo>

            {r.zonas.length > 0 && (
              <>
                {/* ── Modo de cálculo ── */}
                <div className="flex gap-1 flex-wrap">
                  {(Object.entries(ROTULO_MODO) as Array<[ModoCalculo, string]>).map(([id, rot]) => (
                    <button key={id} onClick={() => { patch({ modo: id }); setAvisosCalc([]); }}
                      className="px-2 py-1.5 rounded text-[10px] font-semibold"
                      style={{ background: r.modo === id ? 'var(--invicta-green-dark)' : '#0f2240', color: r.modo === id ? '#fff' : '#93c5fd' }}>
                      {rot}
                    </button>
                  ))}
                </div>

                {/* ── Parâmetros por modo ── */}
                {r.modo === 'manual' && (
                  <p className="text-[10px]" style={{ color: '#94a3b8' }}>
                    Digite a dose de cada zona na tabela abaixo — o resumo atualiza sozinho.
                  </p>
                )}

                {r.modo === 'estoque' && r.tipo !== 'sementes' && (
                  <div className="p-2.5 rounded-lg space-y-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
                    <div className="grid grid-cols-4 gap-2">
                      <Campo rotulo={`Disponível (${UNIDADE_TOTAL[r.unidade]}) *`}>
                        <InputNum valor={r.params.totalDisponivel} onMudou={v => patchParams({ totalDisponivel: v })} />
                      </Campo>
                      <Campo rotulo={`Dose mín (${r.unidade})`}>
                        <InputNum valor={r.params.doseMin} onMudou={v => patchParams({ doseMin: v })} />
                      </Campo>
                      <Campo rotulo={`Dose máx (${r.unidade})`}>
                        <InputNum valor={r.params.doseMax} onMudou={v => patchParams({ doseMax: v })} />
                      </Campo>
                      <Campo rotulo={`Incremento (${r.unidade})`}>
                        <InputNum valor={r.params.incremento} onMudou={v => patchParams({ incremento: v })} />
                      </Campo>
                    </div>
                    <SeletorRelacao relacao={r.params.relacao ?? 'direta'} onMudou={rel => patchParams({ relacao: rel })} />
                    {r.tipo === 'organico' && <AnaliseOrganicoCampos r={r} patchParams={patchParams} />}
                    <button onClick={calcular} className="px-3 py-1.5 rounded text-[10px] font-bold text-white flex items-center gap-1.5" style={{ background: 'var(--invicta-green-dark)' }}>
                      <RefreshCw size={11} /> Distribuir o estoque entre as zonas
                    </button>
                    <p className="text-[9px]" style={{ color: '#64748b' }}>
                      O sistema respeita mínimo, máximo e prioridade — e <b>nunca</b> passa da quantidade disponível.
                    </p>
                  </div>
                )}

                {r.modo === 'proporcional' && r.tipo !== 'sementes' && (
                  <div className="p-2.5 rounded-lg space-y-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
                    <div className="grid grid-cols-4 gap-2">
                      <Campo rotulo={`Dose média (${r.unidade}) *`}>
                        <InputNum valor={r.params.doseMedia} onMudou={v => patchParams({ doseMedia: v })} />
                      </Campo>
                      <Campo rotulo="Variação máx (%)">
                        <InputNum valor={r.params.variacaoPct ?? 20} onMudou={v => patchParams({ variacaoPct: v })} />
                      </Campo>
                      <Campo rotulo={`Dose mín (${r.unidade})`}>
                        <InputNum valor={r.params.doseMin} onMudou={v => patchParams({ doseMin: v })} />
                      </Campo>
                      <Campo rotulo={`Dose máx (${r.unidade})`}>
                        <InputNum valor={r.params.doseMax} onMudou={v => patchParams({ doseMax: v })} />
                      </Campo>
                    </div>
                    <SeletorRelacao relacao={r.params.relacao ?? 'direta'} onMudou={rel => patchParams({ relacao: rel })} />
                    <button onClick={calcular} className="px-3 py-1.5 rounded text-[10px] font-bold text-white flex items-center gap-1.5" style={{ background: 'var(--invicta-green-dark)' }}>
                      <RefreshCw size={11} /> Calcular doses proporcionais
                    </button>
                  </div>
                )}

                {r.tipo === 'sementes' && r.modo !== 'manual' && (
                  <SementesCampos r={r} patchParams={patchParams} estSem={estSem} setEstSem={setEstSem} calcular={calcularSementes} />
                )}

                {avisosCalc.length > 0 && (
                  <div className="space-y-1">{avisosCalc.map((a, i) => <Aviso key={i} tom="atencao" texto={a} />)}</div>
                )}

                {/* ── Editor: tabela de doses ── */}
                <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #1a3a6b' }}>
                  <table className="w-full text-[10px]" style={{ color: '#cbd5e1' }}>
                    <thead>
                      <tr style={{ background: '#0f2240', color: '#93c5fd' }}>
                        <th className="text-left px-2 py-1.5">Zona</th>
                        <th className="text-left px-2 py-1.5">Classe</th>
                        <th className="text-right px-2 py-1.5">Área (ha)</th>
                        <th className="text-right px-2 py-1.5">Dose ({r.unidade})</th>
                        <th className="text-right px-2 py-1.5">Total ({UNIDADE_TOTAL[r.unidade]})</th>
                        {nutri && <th className="text-right px-2 py-1.5">N·P·K (kg/ha)</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {r.zonas.map(z => (
                        <tr key={z.idZona} style={{ borderTop: '1px solid #0f2240', background: '#061525' }}>
                          <td className="px-2 py-1">
                            <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: resumo.doseMax > resumo.doseMin ? corDaDose(z.dose, resumo.doseMin, resumo.doseMax) : z.cor }} />
                            {z.nomeZona}
                          </td>
                          <td className="px-2 py-1">{z.classe}</td>
                          <td className="px-2 py-1 text-right">{fmt(z.areaHa, 2)}</td>
                          <td className="px-2 py-1 text-right">
                            <input
                              value={String(z.dose)}
                              onChange={e => {
                                const v = Number(e.target.value.replace(',', '.'));
                                patch({ zonas: r.zonas.map(x => x.idZona === z.idZona ? { ...x, dose: Number.isFinite(v) ? v : 0 } : x) });
                              }}
                              className="w-20 rounded px-1.5 py-0.5 text-right text-[10px] outline-none" style={inputStyle} />
                          </td>
                          <td className="px-2 py-1 text-right">{r.unidade === 'sementes/ha' ? fmt0(z.dose * z.areaHa) : fmt(z.dose * z.areaHa, 1)}</td>
                          {nutri && (
                            <td className="px-2 py-1 text-right" style={{ color: '#94a3b8' }}>
                              {fmt(nutri[z.idZona].n, 0)}·{fmt(nutri[z.idZona].p2o5, 0)}·{fmt(nutri[z.idZona].k2o, 0)}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* ── Resumo ao vivo ── */}
                <div className="grid grid-cols-4 gap-1.5">
                  <Kpi rot="Área" val={`${fmt(resumo.areaHa, 1)} ha`} />
                  <Kpi rot={`Usado (${UNIDADE_TOTAL[r.unidade]})`} val={r.unidade === 'sementes/ha' ? fmt0(resumo.usado) : fmt(resumo.usado, 1)} />
                  {r.params.totalDisponivel != null
                    ? <Kpi rot="Restante" val={r.unidade === 'sementes/ha' ? fmt0(r.params.totalDisponivel - resumo.usado) : fmt(r.params.totalDisponivel - resumo.usado, 1)}
                        cor={r.params.totalDisponivel - resumo.usado < -1e-6 ? '#f87171' : '#4ade80'} />
                    : <Kpi rot="Dose média" val={fmt(resumo.doseMedia, 1)} />}
                  <Kpi rot="Custo" val={resumo.custo != null ? `R$ ${fmt(resumo.custo, 0)}` : '—'} />
                </div>
                {metricasSem && (
                  <p className="text-[10px]" style={{ color: '#94a3b8' }}>
                    <Sprout size={10} className="inline mr-1" />
                    Média: {metricasSem.sementesPorMetro != null ? `${fmt(metricasSem.sementesPorMetro, 1)} sem/m · ` : ''}
                    {metricasSem.kgHa != null ? `${fmt(metricasSem.kgHa, 1)} kg/ha · ` : ''}
                    população final ~{fmt0(metricasSem.populacaoFinal)} plantas/ha
                    {metricasSem.sacos != null ? ` · ${fmt(metricasSem.sacos, 1)} sacos no total` : ''}
                  </p>
                )}

                {/* ── Ações ── */}
                <div className="flex gap-1.5 flex-wrap">
                  <button onClick={salvar} className="px-3 py-2 rounded text-[11px] font-bold text-white flex items-center gap-1.5" style={{ background: 'var(--invicta-green-dark)' }}>
                    <Save size={12} /> {r.editandoId ? 'Salvar alterações (nova versão)' : 'Salvar prescrição'}
                  </button>
                  <BotaoExport rot="SHP" icone={FileDown} ocupado={exportando.endsWith(':shp')} onClick={() => exportar('shp')} />
                  <BotaoExport rot="Excel" icone={FileSpreadsheet} ocupado={exportando.endsWith(':xlsx')} onClick={() => exportar('xlsx')} />
                  <BotaoExport rot="PDF" icone={FileText} ocupado={exportando.endsWith(':pdf')} onClick={() => exportar('pdf')} />
                  {r.editandoId && (
                    <button onClick={() => { setR(RASCUNHO_VAZIO); setAvisosCalc([]); setErro(''); setOkMsg(''); }}
                      className="px-2.5 py-2 rounded text-[10px] font-semibold" style={{ background: '#0f2240', color: '#93c5fd' }}>
                      Nova em branco
                    </button>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {aba === 'salvas' && (
          prescricoes.length === 0
            ? <Vazia texto="Nenhuma prescrição salva neste talhão ainda." />
            : prescricoes.map(p => {
              const rs = resumoDoses(p.zonas, p.custoUnit);
              return (
                <div key={p.id} className="p-2.5 rounded-lg space-y-1.5" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold truncate" style={{ color: '#e2e8f0' }}>{p.nome}</p>
                      <p className="text-[10px]" style={{ color: '#94a3b8' }}>
                        {p.produto} · {ROTULO_TIPO[p.tipo]} · v{p.versao} · {dataBR(p.atualizadoEm)} · {p.criadoPor}
                      </p>
                    </div>
                  </div>
                  <p className="text-[10px]" style={{ color: '#cbd5e1' }}>
                    {rs.nZonas} zonas · {fmt(rs.areaHa, 1)} ha · dose {fmt(rs.doseMin, 1)}–{fmt(rs.doseMax, 1)} (média {fmt(rs.doseMedia, 1)}) {p.unidade}
                    {' '}· usa {p.unidade === 'sementes/ha' ? fmt0(rs.usado) : fmt(rs.usado, 1)} {UNIDADE_TOTAL[p.unidade]}
                    {rs.custo != null ? ` · R$ ${fmt(rs.custo, 0)}` : ''}
                  </p>
                  <div className="flex gap-1.5 flex-wrap">
                    <button onClick={() => abrirSalva(p)} className="px-2 py-1 rounded text-[10px] font-semibold flex items-center gap-1" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
                      <Pencil size={10} /> Abrir no editor
                    </button>
                    <BotaoExport rot="SHP" icone={FileDown} pequeno ocupado={exportando === `${p.id}:shp`} onClick={() => exportar('shp', p)} />
                    <BotaoExport rot="Excel" icone={FileSpreadsheet} pequeno ocupado={exportando === `${p.id}:xlsx`} onClick={() => exportar('xlsx', p)} />
                    <BotaoExport rot="PDF" icone={FileText} pequeno ocupado={exportando === `${p.id}:pdf`} onClick={() => exportar('pdf', p)} />
                    <button onClick={() => { if (confirm(`Excluir a prescrição "${p.nome}"?`)) { deletePrescricao(p.id); setTick(t => t + 1); } }}
                      className="px-2 py-1 rounded text-[10px] font-semibold flex items-center gap-1" style={{ background: '#3a1a1a', color: '#fca5a5' }}>
                      <Trash2 size={10} /> Excluir
                    </button>
                  </div>
                </div>
              );
            })
        )}

        {aba === 'arquivos' && (() => {
          const exps = prescricoes.flatMap(p => p.exportes.map(e => ({ ...e, presc: p })));
          exps.sort((a, b) => b.em.localeCompare(a.em));
          return exps.length === 0
            ? <Vazia texto="Nenhum arquivo de aplicação gerado ainda. Exporte uma prescrição (SHP/Excel/PDF) e ele aparece aqui." />
            : exps.map((e, i) => (
              <div key={i} className="p-2 rounded-lg flex items-center gap-2 text-[10px]" style={{ background: '#061525', border: '1px solid #1a3a6b', color: '#cbd5e1' }}>
                <FileDown size={12} style={{ color: '#93c5fd' }} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate" style={{ color: '#e2e8f0' }}>{e.arquivo}</p>
                  <p style={{ color: '#64748b' }}>{e.presc.nome} · v{e.presc.versao} · {dataBR(e.em)} · {e.por}</p>
                </div>
                <span className="px-1.5 py-0.5 rounded font-bold uppercase" style={{ background: '#0f2240', color: '#93c5fd' }}>{e.formato}</span>
                <button onClick={() => exportar(e.formato as 'shp' | 'xlsx' | 'pdf', e.presc)}
                  className="px-2 py-1 rounded font-semibold" style={{ background: '#1a3a6b', color: '#93c5fd' }}>Gerar de novo</button>
              </div>
            ));
        })()}

        {aba === 'historico' && (() => {
          const hist = prescricoes.flatMap(p => p.historico.map(h => ({ ...h, presc: p })));
          hist.sort((a, b) => b.em.localeCompare(a.em));
          return hist.length === 0
            ? <Vazia texto="Sem histórico ainda." />
            : hist.map((h, i) => (
              <div key={i} className="p-2 rounded-lg text-[10px] flex items-center gap-2" style={{ background: '#061525', border: '1px solid #1a3a6b', color: '#cbd5e1' }}>
                <History size={11} style={{ color: '#64748b' }} />
                <span className="flex-1"><b style={{ color: '#e2e8f0' }}>{h.presc.nome}</b> — {h.resumo}</span>
                <span style={{ color: '#64748b' }}>{dataBR(h.em)} · {h.por}</span>
              </div>
            ));
        })()}

        {aba === 'comparacao' && (
          <div className="py-8 text-center space-y-2">
            <Scale size={28} className="mx-auto" style={{ color: '#334155' }} />
            <p className="text-xs font-bold" style={{ color: '#64748b' }}>Planejado × Realizado</p>
            <p className="text-[10px] max-w-sm mx-auto leading-relaxed" style={{ color: '#475569' }}>
              Em breve: importe o mapa de aplicação REAL da máquina e compare com a prescrição —
              dose aplicada × prescrita por zona, desvios e área fora do alvo. A estrutura das
              prescrições já guarda tudo o que essa comparação vai precisar.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Blocos auxiliares ────────────────────────────────────────────────────────

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>{rotulo}</label>
      {children}
    </div>
  );
}

function InputNum({ valor, onMudou }: { valor: number | undefined; onMudou: (v: number | undefined) => void }) {
  const [txt, setTxt] = useState(valor != null ? String(valor) : '');
  return (
    <input value={txt}
      onChange={e => {
        setTxt(e.target.value);
        const v = Number(e.target.value.replace(',', '.'));
        onMudou(e.target.value.trim() === '' ? undefined : Number.isFinite(v) ? v : undefined);
      }}
      className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
  );
}

function SeletorRelacao({ relacao, onMudou }: { relacao: 'direta' | 'inversa'; onMudou: (r: 'direta' | 'inversa') => void }) {
  return (
    <div className="flex items-center gap-2 text-[10px]" style={{ color: '#94a3b8' }}>
      <span>Prioridade:</span>
      {([['direta', 'maior potencial → maior dose'], ['inversa', 'menor potencial → maior dose']] as const).map(([id, rot]) => (
        <button key={id} onClick={() => onMudou(id)}
          className="px-2 py-1 rounded font-semibold"
          style={{ background: relacao === id ? 'var(--invicta-blue-mid)' : '#0f2240', color: relacao === id ? '#fff' : '#93c5fd' }}>
          {rot}
        </button>
      ))}
    </div>
  );
}

function AnaliseOrganicoCampos({ r, patchParams }: {
  r: { params: ParamsCalculo }; patchParams: (p: Partial<ParamsCalculo>) => void;
}) {
  const o = r.params.organico ?? {};
  const set = (k: string, v: number | undefined) => patchParams({ organico: { ...o, [k]: v } });
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold" style={{ color: '#64748b' }}>Análise química do esterco (kg por tonelada)</p>
      <div className="grid grid-cols-6 gap-1.5">
        {([['n', 'N'], ['p2o5', 'P₂O₅'], ['k2o', 'K₂O'], ['ca', 'Ca'], ['mg', 'Mg'], ['densidade', 'Dens. (t/m³)']] as const).map(([k, rot]) => (
          <Campo key={k} rotulo={rot}>
            <InputNum valor={(o as Record<string, number | undefined>)[k]} onMudou={v => set(k, v)} />
          </Campo>
        ))}
      </div>
    </div>
  );
}

function SementesCampos({ r, patchParams, estSem, setEstSem, calcular }: {
  r: { params: ParamsCalculo }; patchParams: (p: Partial<ParamsCalculo>) => void;
  estSem: { modo: keyof EstoqueSementes; valor: string };
  setEstSem: (v: { modo: keyof EstoqueSementes; valor: string }) => void;
  calcular: () => void;
}) {
  const s = r.params.sementes ?? { germinacaoPct: 90 };
  const set = (k: string, v: number | string | undefined) => patchParams({ sementes: { ...s, [k]: v } });
  return (
    <div className="p-2.5 rounded-lg space-y-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
      <p className="text-[10px] font-semibold flex items-center gap-1" style={{ color: '#93c5fd' }}><Sprout size={11} /> Parâmetros da semente</p>
      <div className="grid grid-cols-4 gap-1.5">
        <Campo rotulo="PMS (g)"><InputNum valor={s.pmsG} onMudou={v => set('pmsG', v)} /></Campo>
        <Campo rotulo="Germinação (%)"><InputNum valor={s.germinacaoPct} onMudou={v => set('germinacaoPct', v ?? 90)} /></Campo>
        <Campo rotulo="Pureza (%)"><InputNum valor={s.purezaPct} onMudou={v => set('purezaPct', v)} /></Campo>
        <Campo rotulo="Sobrevivência (%)"><InputNum valor={s.sobrevivenciaPct} onMudou={v => set('sobrevivenciaPct', v)} /></Campo>
        <Campo rotulo="Espaçamento (m)"><InputNum valor={s.espacamentoM} onMudou={v => set('espacamentoM', v)} /></Campo>
        <Campo rotulo="Sementes/saco"><InputNum valor={s.sementesPorSaco} onMudou={v => set('sementesPorSaco', v)} /></Campo>
        <Campo rotulo="Pop. mínima (/ha)"><InputNum valor={s.populacaoMin} onMudou={v => set('populacaoMin', v)} /></Campo>
        <Campo rotulo="Pop. máxima (/ha)"><InputNum valor={s.populacaoMax} onMudou={v => set('populacaoMax', v)} /></Campo>
      </div>
      <p className="text-[10px] font-semibold" style={{ color: '#93c5fd' }}>Estoque disponível</p>
      <div className="grid grid-cols-3 gap-1.5">
        <select value={estSem.modo} onChange={e => setEstSem({ ...estSem, modo: e.target.value as keyof EstoqueSementes })}
          className="rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
          <option value="populacaoMediaHa">População média (/ha)</option>
          <option value="sementes">Total de sementes</option>
          <option value="milhoes">Milhões de sementes</option>
          <option value="sacos">Sacos</option>
          <option value="kg">Quilos (usa o PMS)</option>
        </select>
        <input value={estSem.valor} onChange={e => setEstSem({ ...estSem, valor: e.target.value })}
          placeholder="ex.: 285000" className="rounded px-2 py-1.5 text-xs outline-none" style={inputStyle} />
        <Campo rotulo="Margem de segurança (%)"><InputNum valor={s.margemPct} onMudou={v => set('margemPct', v)} /></Campo>
      </div>
      <SeletorRelacao relacao={r.params.relacao ?? 'direta'} onMudou={rel => patchParams({ relacao: rel })} />
      <button onClick={calcular} className="px-3 py-1.5 rounded text-[10px] font-bold text-white flex items-center gap-1.5" style={{ background: 'var(--invicta-green-dark)' }}>
        <Sprout size={11} /> Otimizar uso das sementes
      </button>
      <p className="text-[9px]" style={{ color: '#64748b' }}>
        Distribui o estoque entre as zonas mantendo a média geral, respeitando população mínima/máxima e a margem —
        se faltar ou sobrar demais, o aviso aparece ANTES de você salvar.
      </p>
    </div>
  );
}

function Kpi({ rot, val, cor }: { rot: string; val: string; cor?: string }) {
  return (
    <div className="p-2 rounded-lg text-center" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
      <div className="text-sm font-bold" style={{ color: cor ?? '#93c5fd' }}>{val}</div>
      <div className="text-[9px]" style={{ color: '#64748b' }}>{rot}</div>
    </div>
  );
}

function BotaoExport({ rot, icone: Ic, onClick, ocupado, pequeno }: {
  rot: string; icone: React.ElementType; onClick: () => void; ocupado?: boolean; pequeno?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={ocupado}
      className={`rounded font-semibold flex items-center gap-1 ${pequeno ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-2 text-[10px]'}`}
      style={{ background: '#1a3a6b', color: '#93c5fd', opacity: ocupado ? 0.6 : 1 }}>
      {ocupado ? <Loader2 size={11} className="animate-spin" /> : <Ic size={11} />} {rot}
    </button>
  );
}

function Vazia({ texto }: { texto: string }) {
  return <p className="text-[10px] py-6 text-center leading-relaxed" style={{ color: '#64748b' }}>{texto}</p>;
}

function Aviso({ tom, texto }: { tom: 'erro' | 'ok' | 'atencao'; texto: string }) {
  const cores = {
    erro: { bg: '#3a1a1a', bd: '#7f1d1d', fg: '#fca5a5' },
    ok: { bg: '#0f3d2e', bd: '#166534', fg: '#6ee7b7' },
    atencao: { bg: '#3a2300', bd: '#92400e', fg: '#fbbf24' },
  }[tom];
  const Ic = tom === 'ok' ? CheckCircle2 : AlertTriangle;
  return (
    <div className="flex items-start gap-1.5 p-2 rounded text-[10px]" style={{ background: cores.bg, border: `1px solid ${cores.bd}`, color: cores.fg }}>
      <Ic size={11} className="flex-shrink-0 mt-0.5" /> <span className="leading-relaxed">{texto}</span>
    </div>
  );
}
