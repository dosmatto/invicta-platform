'use client';

// IMPORTAÇÃO DE LAUDO FOLIAR EM LOTE (ledger 25 e 26).
//
// Mesmo fluxo da importação de solo (`talhao/LabImportSection`), que já é o que
// o usuário conhece: `lerArquivo` → perfil escolhido → prévia conferível →
// gravar. O que muda é o de-para (11 nutrientes em vez do catálogo de solo) e
// duas travas que não existem no laudo de solo:
//
//   1. ÓRGÃO É OBRIGATÓRIO (ledger 19). Amostra sem órgão não tem como ser
//      comparada honestamente a norma nenhuma. A planilha manda quando declara
//      a coluna; o resto do lote recebe o órgão escolhido aqui — e a tela diz
//      quantas linhas vieram de cada caminho.
//   2. A PRÉVIA MOSTRA A UNIDADE CONVERTIDA e o que foi reescalado. "N 4,62 %"
//      e "N 46,2 g/kg" são o mesmo teor; o erro de 10× entre eles não tem
//      sintoma visual, então ele é anunciado em texto.
//
// A triagem estatística (IQR/Tukey, "destoa das demais amostras") é a MESMA de
// `labOutliers` — aquele código é agnóstico ao domínio. O que não dava para
// reusar é a tabela de faixa plausível, que lá é de solo; a de folha vive em
// `foliarImportacao.FAIXAS_PLAUSIVEIS_FOLIAR` (e o porquê está documentado lá).

import { useMemo, useRef, useState } from 'react';
import { Upload, Save, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  getSafras, getTalhoes, getFazendas, getClientes, getPerfisLab, salvarPerfilLab,
  saveAmostraFoliar, produtividadeDoMapa, CULTURAS,
} from '@/lib/store';
import { lerArquivo, type PerfilLabConfig } from '@/lib/lab';
import { detectarOutliers, chaveAmostra, contarOutliers } from '@/lib/labOutliers';
import {
  autoConfigFoliar, escolherPerfilFoliar, importarFoliar, paraAmostras, paraTriagem,
  pontuarPerfilFoliar, teoresImplausiveis,
  PERFIS_FOLIAR_BUILTIN, PERFIL_FOLIAR_PADRAO,
  type LinhaFoliar,
} from '@/lib/foliarImportacao';
import { NUTRIENTES, ROTULO_ORGAO, unidadeDe, type Orgao } from '@/lib/foliar';
import { CONFIANCA_MINIMA } from '@/lib/lab';
import { hojeSaoPauloISO } from '@/lib/periodo';
import { pode } from '@/lib/empresa';
import { inputStyle } from '@/constants/ui';

/** Um perfil salvo é FOLIAR quando suas chaves de `elementos` são nutrientes.
 *  A categoria `laboratorios` guarda os dois domínios (ledger 26) e misturá-los
 *  no seletor ofereceria perfil de solo para laudo de folha. */
function ehPerfilFoliar(cfg: PerfilLabConfig): boolean {
  const chaves = Object.keys(cfg?.elementos ?? {});
  if (!chaves.length) return false;
  return chaves.every(k => (NUTRIENTES as readonly string[]).includes(k));
}

export function FoliarImportacao() {
  const inputRef = useRef<HTMLInputElement>(null);

  const [perfis, setPerfis] = useState(() => getPerfisLab().filter(p => ehPerfilFoliar(p.config)));
  const [perfilId, setPerfilId] = useState<string>(PERFIL_FOLIAR_PADRAO);
  const [nomeNovoPerfil, setNomeNovoPerfil] = useState('');
  const [aoa, setAoa] = useState<string[][] | null>(null);
  const [estado, setEstado] = useState<'idle' | 'loading' | 'pronto' | 'erro'>('idle');
  const [erro, setErro] = useState('');
  const [resumo, setResumo] = useState('');

  // Destino do lote
  const [talhaoId, setTalhaoId] = useState('');
  const [safra, setSafra] = useState(() => getSafras().find(s => s.ativa)?.nome ?? '');
  const [cultura, setCultura] = useState('Soja');
  const [orgaoPadrao, setOrgaoPadrao] = useState<Orgao>('trifolio-com-peciolo');
  const [estadioPadrao, setEstadioPadrao] = useState('R1-R2');
  const [dataColeta, setDataColeta] = useState(() => hojeSaoPauloISO());
  const [filtroTalhao, setFiltroTalhao] = useState('');
  // Exclusões da prévia são zeradas nos DOIS pontos em que o lote muda de
  // identidade (trocar de perfil, trocar de arquivo) — e não num efeito que
  // observa o estado: efeito que chama setState dispara render em cascata e a
  // prévia piscaria a cada troca.
  const [excluidas, setExcluidas] = useState<Set<string>>(new Set());

  const safras = useMemo(() => getSafras(), []);
  const opcoesTalhao = useMemo(() => {
    const fazendas = new Map(getFazendas().map(f => [f.id, f]));
    const clientes = new Map(getClientes().map(c => [c.id, c]));
    return getTalhoes().map(t => {
      const f = fazendas.get(t.fazendaId);
      const c = f ? clientes.get(f.clienteId) : undefined;
      return { id: t.id, rotulo: `${c?.nome ?? '—'} · ${f?.nome ?? '—'} · ${t.nome}` };
    }).sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
  }, []);

  // ── Perfil efetivo ────────────────────────────────────────────────────────
  const { cfg, perfilNome, ehAuto, posicional } = useMemo<{
    cfg: PerfilLabConfig | null; perfilNome: string; ehAuto: boolean; posicional: boolean;
  }>(() => {
    const doArquivo = () => (aoa ? autoConfigFoliar(aoa).config : null);
    const b = PERFIS_FOLIAR_BUILTIN.find(p => p.id === perfilId);
    if (b?.auto) return { cfg: doArquivo(), perfilNome: b.nome, ehAuto: true, posicional: false };
    if (b) return { cfg: b.config, perfilNome: b.nome, ehAuto: false, posicional: true };
    const salvo = perfis.find(p => p.id === perfilId);
    if (salvo) return { cfg: salvo.config, perfilNome: salvo.nome, ehAuto: false, posicional: true };
    return { cfg: null, perfilNome: '', ehAuto: false, posicional: false };
  }, [perfilId, aoa, perfis]);

  // Perfil POSICIONAL no arquivo errado importa tudo trocado sem erro nenhum —
  // só a conferência do cabeçalho denuncia (mesma trava do laudo de solo).
  const pont = useMemo(() => (aoa && cfg && posicional) ? pontuarPerfilFoliar(aoa, cfg) : null, [aoa, cfg, posicional]);
  const perfilSuspeito = !!pont && pont.esperados > 0 && pont.confianca < CONFIANCA_MINIMA;

  const imp = useMemo(
    () => (aoa && cfg) ? importarFoliar(aoa, cfg, { filtroTalhao: filtroTalhao || undefined }) : null,
    [aoa, cfg, filtroTalhao],
  );

  const linhasVivas = useMemo<LinhaFoliar[]>(
    () => (imp?.linhas ?? []).filter(l => !excluidas.has(l.chave)),
    [imp, excluidas],
  );

  // Triagem: a camada estatística vem de `labOutliers` (agnóstica ao domínio);
  // a faixa plausível de FOLHA vem de `foliarImportacao`.
  const outliers = useMemo(
    () => detectarOutliers(paraTriagem(linhasVivas), NUTRIENTES as unknown as string[]),
    [linhasVivas],
  );
  const nOutliers = contarOutliers(outliers);
  const implausiveis = useMemo(
    () => linhasVivas.flatMap(l => teoresImplausiveis(l.teores).map(a => ({ chave: l.chave, ...a }))),
    [linhasVivas],
  );

  const comOrgaoProprio = linhasVivas.filter(l => l.orgao).length;
  const comProdutividade = linhasVivas.filter(l => l.produtividadeKgha != null).length;
  const colunasPresentes = useMemo(
    () => (imp?.colunas ?? []).filter(c => linhasVivas.some(l => l.teores[c.nutriente] != null)),
    [imp, linhasVivas],
  );

  async function onFile(file: File) {
    setEstado('loading'); setErro(''); setResumo(''); setFiltroTalhao(''); setExcluidas(new Set());
    try {
      const m = await lerArquivo(file);
      if (m.length < 2) throw new Error('Não consegui ler linhas do arquivo.');
      setPerfilId(escolherPerfilFoliar(m, perfis));
      setAoa(m); setEstado('pronto');
    } catch (e: unknown) {
      setEstado('erro'); setErro(e instanceof Error ? e.message : 'Erro ao ler o arquivo.');
    }
  }

  function confirmar() {
    if (!talhaoId || !safra || !cultura) { setErro('Escolha talhão, ano e cultura antes de importar.'); setEstado('erro'); return; }
    if (!linhasVivas.length) { setErro('Nada para importar.'); setEstado('erro'); return; }

    const amostras = paraAmostras(linhasVivas, { talhaoId, safra, cultura, dataColeta, orgaoPadrao, estadioPadrao });
    // Produtividade: a da planilha manda; na falta dela, a que a plataforma JÁ
    // TEM (mapa de colheita oficial do talhão+ano+cultura). Ausente nas duas,
    // fica `null` — nunca zero, que jogaria a amostra para a população de BAIXA
    // produtividade e envenenaria a norma gerada depois.
    const doMapa = produtividadeDoMapa(talhaoId, safra, cultura);
    let herdadas = 0;
    for (const a of amostras) {
      if (a.produtividadeKgha == null && doMapa != null) {
        a.produtividadeKgha = doMapa;
        a.origemProdutividade = 'mapa';
        herdadas++;
      }
      saveAmostraFoliar(a);
    }

    setResumo(`${amostras.length} amostra(s) gravada(s)${herdadas ? ` · ${herdadas} com produtividade do mapa de colheita` : ''}.`);
    setAoa(null); setEstado('idle'); setErro('');
  }

  function salvarPerfil() {
    if (!cfg) return;
    const nome = nomeNovoPerfil.trim();
    if (!nome) { setErro('Dê um nome ao perfil de planilha para salvá-lo na Biblioteca.'); setEstado('erro'); return; }
    salvarPerfilLab(nome, cfg);
    const novos = getPerfisLab().filter(p => ehPerfilFoliar(p.config));
    setPerfis(novos);
    const achado = novos.find(p => p.nome.toLowerCase() === nome.toLowerCase());
    if (achado) setPerfilId(achado.id);
    setNomeNovoPerfil('');
  }

  if (!pode('importarLaudo')) {
    return <div className="px-4 py-4"><Aviso texto="Seu papel não importa laudos de laboratório (somente visualização)." /></div>;
  }

  return (
    <div className="h-full overflow-y-auto px-3 py-3 space-y-3">
      {/* Destino do lote */}
      <Bloco titulo="Destino do lote">
        <Campo rotulo="Talhão">
          <select value={talhaoId} onChange={e => setTalhaoId(e.target.value)}
            className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle}>
            <option value="">Selecione o talhão…</option>
            {opcoesTalhao.map(o => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
          </select>
        </Campo>
        <div className="grid grid-cols-2 gap-2">
          <Campo rotulo="Ano">
            <select value={safra} onChange={e => setSafra(e.target.value)}
              className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle}>
              <option value="">—</option>
              {safras.map(s => <option key={s.id} value={s.nome}>{s.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Cultura">
            <select value={cultura} onChange={e => setCultura(e.target.value)}
              className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle}>
              {CULTURAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Campo>
        </div>
        <Campo rotulo="Órgão amostrado (padrão do lote)">
          <select value={orgaoPadrao} onChange={e => setOrgaoPadrao(e.target.value as Orgao)}
            className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle}>
            {(Object.keys(ROTULO_ORGAO) as Orgao[]).map(o => <option key={o} value={o}>{ROTULO_ORGAO[o]}</option>)}
          </select>
          <p className="text-[9px] mt-0.5" style={{ color: '#64748b' }}>
            Com e sem pecíolo NÃO são intercambiáveis: a norma só vale para o órgão em que foi gerada.
            Linhas com órgão declarado na planilha mantêm o da planilha.
          </p>
        </Campo>
        <div className="grid grid-cols-2 gap-2">
          <Campo rotulo="Estádio (padrão)">
            <input value={estadioPadrao} onChange={e => setEstadioPadrao(e.target.value)} placeholder="R1-R2"
              className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle} />
          </Campo>
          <Campo rotulo="Data da coleta">
            <input type="date" value={dataColeta} onChange={e => setDataColeta(e.target.value)}
              className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle} />
          </Campo>
        </div>
      </Bloco>

      {/* Perfil de planilha */}
      <Bloco titulo="Perfil da planilha">
        <select value={perfilId} onChange={e => { setPerfilId(e.target.value); setExcluidas(new Set()); }}
          className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle}>
          {PERFIS_FOLIAR_BUILTIN.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          {perfis.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        {cfg && aoa && (
          <div className="flex gap-1 mt-1">
            <input value={nomeNovoPerfil} onChange={e => setNomeNovoPerfil(e.target.value)}
              placeholder="Salvar este de-para como perfil…"
              className="flex-1 rounded px-2 py-1 text-[10px] outline-none" style={inputStyle} />
            <button onClick={salvarPerfil} className="px-2 rounded text-[10px] font-bold text-white"
              style={{ background: 'var(--invicta-blue-mid)' }}>
              <Save size={10} />
            </button>
          </div>
        )}
      </Bloco>

      {/* Upload */}
      <div onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed rounded-lg py-4 text-center cursor-pointer"
        style={{ borderColor: estado === 'pronto' ? '#4ade80' : '#1e3a5f' }}>
        {estado === 'loading' ? <p className="text-[10px]" style={{ color: '#64748b' }}>Lendo planilha…</p> : (
          <div className="flex flex-col items-center gap-1">
            <Upload size={16} style={{ color: '#475569' }} />
            <p className="text-[10px] font-semibold" style={{ color: '#94a3b8' }}>
              {aoa ? 'Trocar arquivo' : 'Carregar laudo foliar (XLSX / XLS / CSV)'}
            </p>
            <p className="text-[9px]" style={{ color: '#475569' }}>.xlsx · .xls · .csv</p>
          </div>
        )}
      </div>
      <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />

      {erro && <Aviso texto={erro} tom="erro" />}
      {resumo && (
        <div className="flex items-start gap-1.5 p-2 rounded" style={{ background: '#052e16', border: '1px solid #166534' }}>
          <CheckCircle2 size={12} style={{ color: '#4ade80', flexShrink: 0, marginTop: 1 }} />
          <p className="text-[10px]" style={{ color: '#bbf7d0' }}>{resumo}</p>
        </div>
      )}

      {/* Prévia */}
      {imp && (
        <>
          {perfilSuspeito && pont && (
            <Aviso tom="erro" texto={
              `O perfil "${perfilNome}" não parece ser deste arquivo: só ${pont.acertos} de ${pont.esperados} colunas batem com o cabeçalho`
              + (pont.exemplo ? ` (esperava ${pont.exemplo.elId} na coluna ${pont.exemplo.coluna}, o cabeçalho diz "${pont.exemplo.cabecalho}")` : '')
              + '. Perfil posicional no arquivo errado importa tudo trocado sem dar erro — troque para "Detectar pelo cabeçalho".'
            } />
          )}

          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold" style={{ color: '#e2e8f0' }}>
              Prévia · {linhasVivas.length} amostra(s) · {colunasPresentes.length} nutriente(s)
            </span>
            {pont && !perfilSuspeito && (
              <span className="text-[9px]" style={{ color: '#4ade80' }}>
                confiança {Math.round(pont.confianca * 100)}%
              </span>
            )}
            {ehAuto && <span className="text-[9px]" style={{ color: '#93c5fd' }}>de-para lido do cabeçalho</span>}
          </div>

          {imp.talhoes.length > 1 && (
            <Campo rotulo="Filtrar por talhão da planilha">
              <select value={filtroTalhao} onChange={e => setFiltroTalhao(e.target.value)}
                className="w-full rounded px-2 py-1 text-[10px] outline-none" style={inputStyle}>
                <option value="">Todos ({imp.talhoes.length})</option>
                {imp.talhoes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Campo>
          )}

          {imp.avisos.map((a, i) => <Aviso key={i} texto={a} />)}

          <div className="flex flex-wrap gap-2 text-[9px]" style={{ color: '#64748b' }}>
            <span>{comOrgaoProprio} com órgão na planilha · {linhasVivas.length - comOrgaoProprio} herdam &quot;{ROTULO_ORGAO[orgaoPadrao]}&quot;</span>
            <span>· {comProdutividade} com produtividade</span>
            {nOutliers > 0 && <span style={{ color: '#fbbf24' }}>· {nOutliers} valor(es) destoando do lote</span>}
          </div>

          {implausiveis.length > 0 && (
            <Aviso tom="erro" texto={`${implausiveis.length} teor(es) fora da faixa plausível de folha. ${implausiveis[0].motivo}`} />
          )}

          <div className="overflow-auto" style={{ maxHeight: 260, border: '1px solid #1a3a6b', borderRadius: 6 }}>
            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th className="sticky top-0 text-left px-1 py-1 text-[9px] font-bold"
                    style={{ background: '#061525', color: '#64748b' }}>#</th>
                  {colunasPresentes.map(c => (
                    <th key={c.nutriente} className="sticky top-0 text-right px-1 py-1 text-[9px] font-bold"
                      style={{ background: '#061525', color: '#93c5fd' }} title={`${c.cabecalho} → ${unidadeDe(c.nutriente)}`}>
                      {c.nutriente}
                    </th>
                  ))}
                  <th className="sticky top-0 text-right px-1 py-1 text-[9px] font-bold"
                    style={{ background: '#061525', color: '#64748b' }}>kg/ha</th>
                </tr>
              </thead>
              <tbody>
                {(imp.linhas ?? []).map(l => {
                  const fora = excluidas.has(l.chave);
                  const flags = outliers.get(chaveAmostra({ talhao: l.talhao, campanha: l.campanha, numero: l.numeroAmostra, profundidade: '' })) ?? {};
                  return (
                    <tr key={l.chave} style={{ borderBottom: '1px solid #0f2240', opacity: fora ? 0.35 : 1 }}>
                      <td className="px-1 py-0.5 text-[9px] cursor-pointer" style={{ color: '#94a3b8' }}
                        title={fora ? 'Restaurar' : 'Excluir da importação'}
                        onClick={() => setExcluidas(prev => {
                          const n = new Set(prev); if (n.has(l.chave)) n.delete(l.chave); else n.add(l.chave); return n;
                        })}>
                        {l.numeroAmostra}{l.talhao ? ` · ${l.talhao}` : ''}
                      </td>
                      {colunasPresentes.map(c => {
                        const v = l.teores[c.nutriente];
                        const flag = flags[c.nutriente];
                        return (
                          <td key={c.nutriente} className="px-1 py-0.5 text-[9px] text-right"
                            style={{ color: flag ? '#fbbf24' : '#e2e8f0' }} title={flag?.motivo}>
                            {v == null ? '—' : v.toFixed(v < 10 ? 2 : 1)}
                          </td>
                        );
                      })}
                      <td className="px-1 py-0.5 text-[9px] text-right" style={{ color: '#64748b' }}>
                        {l.produtividadeKgha == null ? '—' : Math.round(l.produtividadeKgha)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button onClick={confirmar} disabled={!linhasVivas.length || !talhaoId}
            className="w-full py-2 rounded text-[11px] font-bold text-white disabled:opacity-40"
            style={{ background: 'var(--invicta-green-dark)' }}>
            Importar {linhasVivas.length} amostra(s)
          </button>
        </>
      )}
    </div>
  );
}

// ── Peças de tela ───────────────────────────────────────────────────────────

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="p-2 rounded-lg space-y-1.5" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
      <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#64748b' }}>{titulo}</p>
      {children}
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[9px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>{rotulo}</label>
      {children}
    </div>
  );
}

export function Aviso({ texto, tom = 'neutro' }: { texto: string; tom?: 'neutro' | 'erro' }) {
  const erro = tom === 'erro';
  return (
    <div className="flex items-start gap-1.5 p-2 rounded"
      style={{ background: erro ? '#3f1d1d' : '#0f2240', border: `1px solid ${erro ? '#7f1d1d' : '#1a3a6b'}` }}>
      <AlertTriangle size={11} style={{ color: erro ? '#f87171' : '#fbbf24', flexShrink: 0, marginTop: 1 }} />
      <p className="text-[9px] leading-snug" style={{ color: erro ? '#fecaca' : '#94a3b8' }}>{texto}</p>
    </div>
  );
}
