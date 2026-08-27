'use client';

// PAINEL DE CONFERÊNCIA da importação de planilha fitotécnica (pendência 20).
//
// Tela cheia, e não o SlidePanel de 300–340 px: são 592 linhas com oito colunas
// e quatro estados. O overlay segue o padrão da Biblioteca (SlidePanel.tsx).
//
// O fluxo tem duas telas de propósito:
//   PRÉ-VOO   — antes de mostrar 592 linhas, mostra os 22 cadastros que faltam,
//               ordenados pelo que mais destrava. Cadastrar "Morro Chato"
//               resolve 30 linhas de uma vez; decidir isso linha a linha
//               custaria 30 vezes mais.
//   TABELA    — agrupada Produtor › Fazenda › Talhão, porque a decisão é do
//               grupo e não da linha.
//
// Nada é gravado até o botão final. O plano inteiro é recalculado a cada
// mudança (37 ms nas 592 linhas contra o cadastro real) — mais simples e mais
// confiável do que remendar o plano em pedaços.

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  getClientes, getFazendas, getTalhoes, getSafras, importarCultivosLote, CULTURAS,
} from '@/lib/store';
import { listar } from '@/lib/biblioteca';
import type { ConteudoCultivar, ConteudoProposito } from '@/lib/biblioteca';
import { anoDaSafra } from '@/lib/periodo';
import { lerPlanilhaFitotecnica, type LeituraPlanilha } from '@/lib/importacao/planilha';
import { conferirPlanilha, linhasEquivalentes, ROTULO_MOTIVO, type Cadastro, type PlanoImportacao } from '@/lib/importacao/conferencia';
import {
  aplicarDecisoes, decisoesVazias, contarPorAcao, montarCultivos, montarRelatorio,
  type Decisoes, type LinhaResolvida, type CampoDecisao,
} from '@/lib/importacao/aplicar';
import { CultivaresPanel, PropositosPanel } from './CatalogosImportacaoPanel';
import { inputStyle } from '@/constants/ui';
import {
  Upload, FileSpreadsheet, X, AlertTriangle, CheckCircle2, Plus, Layers, Ban, Download, Loader2,
} from 'lucide-react';

const COR = {
  fundo: '#061525', card: '#0b1d3a', borda: '#1a3a6b', azul: '#93c5fd',
  gravar: '#4ade80', confirmar: '#fbbf24', partir: '#a78bfa', criar: '#f87171', cinza: '#64748b',
};

type Aba = 'tudo' | 'pendentes' | 'prontas' | 'ignoradas';

/** Modal simples — o kit da casa (`panels/acessos/ui.tsx`) não é exportado daqui. */
function Modal({ titulo, largura = 'max-w-2xl', onFechar, children }: {
  titulo: string; largura?: string; onFechar: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onFechar}>
      <div className={`w-full ${largura} rounded-xl flex flex-col`}
        style={{ background: COR.card, border: `1px solid ${COR.borda}`, maxHeight: '88vh' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${COR.borda}` }}>
          <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: '#e2e8f0' }}>{titulo}</h3>
          <button onClick={onFechar} className="p-1 rounded hover:bg-white/10"><X size={16} style={{ color: '#94a3b8' }} /></button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function ImportarFitotecnicoPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState('');
  const [leitura, setLeitura] = useState<LeituraPlanilha | null>(null);
  const [erro, setErro] = useState('');
  const [lendo, setLendo] = useState(false);
  const [tick, setTick] = useState(0);          // força releitura do cadastro
  const [decisoes, setDecisoes] = useState<Decisoes>(decisoesVazias);
  const [tela, setTela] = useState<'preVoo' | 'tabela'>('preVoo');
  const [aba, setAba] = useState<Aba>('pendentes');
  const [criando, setCriando] = useState<{ tipo: 'cultivar' | 'proposito'; nome: string } | null>(null);
  const [resultado, setResultado] = useState('');
  const [gravando, setGravando] = useState(false);

  // ── cadastro, relido a cada mudança ──────────────────────────────────────
  const cadastro: Cadastro = useMemo(() => {
    const cultivares = listar<ConteudoCultivar>('cultivares');
    const propositos = listar<ConteudoProposito>('propositos');
    return {
      clientes: getClientes().map(c => ({ id: c.id, nome: c.nome })),
      fazendas: getFazendas().map(f => ({ id: f.id, nome: f.nome, clienteId: f.clienteId })),
      talhoes: getTalhoes().map(t => ({ id: t.id, nome: t.nome, fazendaId: t.fazendaId, areaHa: t.areaHa })),
      safras: getSafras().map(s => s.nome),
      culturas: CULTURAS,
      propositos: propositos.map(p => ({ id: p.id, nome: p.nome, sinonimos: p.conteudo?.sinonimos ?? [] })),
      // `siglas` do cultivar são o que a planilha manda; o casamento por sinônimo
      // do catálogo genérico lê o campo `sinonimos`, então elas entram como tal.
      cultivares: cultivares.map(c => ({ id: c.id, nome: c.nome, sinonimos: c.conteudo?.siglas ?? [] })),
      anoDaSafra,
    };
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const nomeCultivar = useCallback((id: string) => cadastro.cultivares.find(c => c.id === id)?.nome ?? '', [cadastro]);
  const nomeProposito = useCallback((id: string) => cadastro.propositos.find(p => p.id === id)?.nome ?? '', [cadastro]);
  const areaDoTalhao = useCallback((id: string) => cadastro.talhoes.find(t => t.id === id)?.areaHa, [cadastro]);

  const plano: PlanoImportacao | null = useMemo(
    () => (leitura?.linhas.length ? conferirPlanilha(leitura.linhas, cadastro) : null),
    [leitura, cadastro],
  );
  const resolvidas: LinhaResolvida[] = useMemo(
    () => (plano ? aplicarDecisoes(plano, decisoes) : []),
    [plano, decisoes],
  );
  const contagem = useMemo(() => contarPorAcao(resolvidas), [resolvidas]);

  // ── leitura do arquivo ───────────────────────────────────────────────────
  async function abrir(f: File) {
    setLendo(true); setErro(''); setResultado('');
    try {
      // `lerArquivo` já trata XLSX/XLS/CSV e o encoding windows-1252 dos
      // exports brasileiros. Import dinâmico: o SheetJS não vai no bundle.
      const { lerArquivo } = await import('@/lib/lab');
      const aoa = await lerArquivo(f);
      const r = lerPlanilhaFitotecnica(aoa);
      if (r.faltando.length) {
        setErro(`Não parece uma planilha fitotécnica: não achei a coluna de ${r.faltando.join(', ')}. Confira se o arquivo é o certo.`);
        setLeitura(null);
      } else if (!r.linhas.length) {
        setErro('O arquivo não tem nenhuma linha de dados.');
        setLeitura(null);
      } else {
        setLeitura(r); setArquivo(f.name); setDecisoes(decisoesVazias()); setTela('preVoo');
      }
    } catch (e) {
      setErro(`Falha ao ler o arquivo: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setLendo(false); }
  }

  // ── decisões ─────────────────────────────────────────────────────────────
  const decidir = (campo: CampoDecisao, chaveDecisao: string, valor: string) =>
    setDecisoes(d => ({ ...d, [campo]: { ...d[campo], [chaveDecisao]: valor } }));

  const alternarIgnorada = (linha: number) =>
    setDecisoes(d => ({
      ...d,
      ignoradas: d.ignoradas.includes(linha) ? d.ignoradas.filter(x => x !== linha) : [...d.ignoradas, linha],
    }));

  const classificarGrupo = (grupo: string, tipo: 'consorcio' | 'partes') =>
    setDecisoes(d => ({ ...d, repeticao: { ...d.repeticao, [grupo]: tipo } }));

  // ── gravação ─────────────────────────────────────────────────────────────
  async function gravar() {
    if (!plano) return;
    setGravando(true);
    try {
      const importacaoId = `imp-${Date.now().toString(36)}`;
      const cultivos = montarCultivos(resolvidas, decisoes, importacaoId, nomeCultivar, nomeProposito);
      const r = importarCultivosLote(cultivos.map(c => c.cultivo));
      const rel = montarRelatorio(resolvidas, areaDoTalhao);
      await baixarRelatorio(rel, arquivo, importacaoId);
      setResultado(`✓ ${r.criados} lançamento(s) gravado(s). ${rel.naoImportado.length} não entraram — estão no relatório que acabou de baixar.`);
      setTick(t => t + 1);
    } catch (e) {
      setErro(`Falha ao gravar: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setGravando(false); }
  }

  // ── render ───────────────────────────────────────────────────────────────
  if (!leitura) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-lg space-y-3">
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) abrir(f); }}
            className="rounded-xl p-10 text-center cursor-pointer"
            style={{ background: COR.card, border: `2px dashed ${COR.borda}` }}>
            {lendo ? <Loader2 size={28} className="mx-auto animate-spin" style={{ color: COR.azul }} />
                   : <Upload size={28} className="mx-auto" style={{ color: COR.azul }} />}
            <p className="text-sm font-bold mt-3" style={{ color: '#e2e8f0' }}>
              {lendo ? 'Lendo a planilha…' : 'Solte a planilha aqui'}
            </p>
            <p className="text-[10px] mt-1" style={{ color: COR.cinza }}>.xlsx · .xls · .csv</p>
            <p className="text-[10px] mt-3" style={{ color: COR.cinza }}>
              As colunas são encontradas pelo NOME — a ordem delas não importa.
            </p>
          </div>
          {erro && (
            <div className="p-3 rounded flex items-start gap-2" style={{ background: '#2a0d0d', border: '1px solid #7f1d1d' }}>
              <AlertTriangle size={13} style={{ color: COR.criar }} className="flex-shrink-0 mt-0.5" />
              <p className="text-[11px]" style={{ color: '#fca5a5' }}>{erro}</p>
            </div>
          )}
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) abrir(f); e.target.value = ''; }} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* cabeçalho fixo */}
      <div className="px-4 py-2 flex items-center gap-3 flex-shrink-0" style={{ borderBottom: `1px solid ${COR.borda}` }}>
        <FileSpreadsheet size={14} style={{ color: COR.azul }} />
        <span className="text-[11px] font-bold" style={{ color: '#e2e8f0' }}>{arquivo}</span>
        <span className="text-[10px]" style={{ color: COR.cinza }}>
          {leitura.linhas.length} linhas{leitura.ignoradas ? ` · ${leitura.ignoradas} vazias descartadas` : ''}
        </span>
        <Selo cor={COR.gravar} n={contagem.prontas} rotulo="prontas" />
        <Selo cor={COR.confirmar} n={contagem.pendentes} rotulo="pendentes" />
        {contagem.ignoradas > 0 && <Selo cor={COR.cinza} n={contagem.ignoradas} rotulo="fora" />}
        <div className="flex-1" />
        <button onClick={() => setTela(tela === 'preVoo' ? 'tabela' : 'preVoo')}
          className="px-2 py-1 rounded text-[10px] font-bold" style={{ background: COR.borda, color: COR.azul }}>
          {tela === 'preVoo' ? 'Ir para a tabela →' : '← Pré-voo'}
        </button>
        <button onClick={() => { setLeitura(null); setArquivo(''); setResultado(''); }}
          className="px-2 py-1 rounded text-[10px]" style={{ color: '#94a3b8' }}>Trocar arquivo</button>
      </div>

      {resultado && (
        <div className="px-4 py-2 flex items-start gap-2 flex-shrink-0" style={{ background: '#0b2a1a', borderBottom: '1px solid #166534' }}>
          <CheckCircle2 size={13} style={{ color: COR.gravar }} className="flex-shrink-0 mt-0.5" />
          <p className="text-[11px]" style={{ color: '#86efac' }}>{resultado}</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {tela === 'preVoo' && plano && (
          <PreVoo plano={plano} onCriarCultivar={n => setCriando({ tipo: 'cultivar', nome: n })}
            onCriarProposito={n => setCriando({ tipo: 'proposito', nome: n })}
            onIrParaTabela={() => setTela('tabela')} />
        )}
        {tela === 'tabela' && (
          <Tabela linhas={resolvidas} aba={aba} setAba={setAba} cadastro={cadastro} plano={plano!}
            decidir={decidir} decisoes={decisoes}
            aplicarATodos={(i, campo, valor) => {
              const alvos = linhasEquivalentes(plano!, i, campo);
              const chaveDe = (l: LinhaResolvida) => campo === 'produtor' ? l.produtor.chaveDecisao
                : campo === 'fazenda' ? `${l.produtor.chaveDecisao}|${l.fazenda.chaveDecisao}`
                : campo === 'talhao' ? `${l.produtor.chaveDecisao}|${l.fazenda.chaveDecisao}|${l.talhao.chaveDecisao}`
                : '';
              const k = chaveDe(resolvidas[i]);
              if (k) decidir(campo, k, valor);
              return alvos.length;
            }}
            alternarIgnorada={alternarIgnorada} classificarGrupo={classificarGrupo}
            onCriarCultivar={n => setCriando({ tipo: 'cultivar', nome: n })} />
        )}
      </div>

      {/* rodapé de gravação */}
      <div className="px-4 py-2 flex items-center gap-3 flex-shrink-0" style={{ borderTop: `1px solid ${COR.borda}` }}>
        <p className="text-[10px] flex-1" style={{ color: COR.cinza }}>
          Nada é gravado até você apertar aqui. O que não entrar sai no relatório.
        </p>
        <button onClick={gravar} disabled={gravando || contagem.prontas === 0}
          className="px-3 py-2 rounded text-[11px] font-bold text-white flex items-center gap-1.5 disabled:opacity-40"
          style={{ background: 'var(--invicta-green-dark)' }}>
          {gravando ? <><Loader2 size={12} className="animate-spin" /> Gravando…</>
                    : <><Download size={12} /> Importar {contagem.prontas} linha(s) e baixar o relatório</>}
        </button>
      </div>

      {criando && (
        <Modal titulo={criando.tipo === 'cultivar' ? 'Cadastrar cultivar' : 'Cadastrar propósito'}
          onFechar={() => { setCriando(null); setTick(t => t + 1); }}>
          {criando.tipo === 'cultivar'
            ? <CultivaresPanel nomeInicial={criando.nome} onCriado={() => { setCriando(null); setTick(t => t + 1); }} />
            : <PropositosPanel nomeInicial={criando.nome} onCriado={() => { setCriando(null); setTick(t => t + 1); }} />}
        </Modal>
      )}
    </div>
  );
}

const Selo = ({ cor, n, rotulo }: { cor: string; n: number; rotulo: string }) => (
  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${cor}22`, color: cor }}>
    {n} {rotulo}
  </span>
);

// ── pré-voo ────────────────────────────────────────────────────────────────

function PreVoo({ plano, onCriarCultivar, onCriarProposito, onIrParaTabela }: {
  plano: PlanoImportacao;
  onCriarCultivar: (n: string) => void;
  onCriarProposito: (n: string) => void;
  onIrParaTabela: () => void;
}) {
  const pv = plano.preVoo;
  const nada = !pv.produtores.length && !pv.fazendas.length && !pv.talhoes.length
    && !pv.cultivares.length && !pv.propositos.length && !pv.culturas.length && !pv.safrasAusentes.length;

  return (
    <div className="p-4 space-y-4 max-w-4xl">
      <div className="p-3 rounded" style={{ background: COR.card, border: `1px solid ${COR.borda}` }}>
        <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: '#e2e8f0' }}>Pré-voo</p>
        <p className="text-[11px]" style={{ color: COR.cinza }}>
          Resolver o que falta aqui vale muito mais que decidir linha a linha: cada item
          está ordenado pelo número de linhas que ele destrava.
        </p>
      </div>

      {nada && (
        <div className="p-3 rounded flex items-start gap-2" style={{ background: '#0b2a1a', border: '1px solid #166534' }}>
          <CheckCircle2 size={14} style={{ color: COR.gravar }} className="flex-shrink-0 mt-0.5" />
          <p className="text-[11px]" style={{ color: '#86efac' }}>
            Nada faltando no cadastro. Pode ir direto para a tabela.
          </p>
        </div>
      )}

      <Bloco titulo="Produtores que não estão no cadastro" itens={pv.produtores.map(p => ({ rotulo: p.nome, linhas: p.linhas }))}
        vazio="Todos os produtores da planilha foram encontrados."
        dica="Cadastre em Clientes → Novo. Depois volte aqui: o plano se refaz sozinho." />
      <Bloco titulo="Fazendas que não estão no cadastro do produtor"
        itens={pv.fazendas.map(f => ({ rotulo: f.nome, sub: f.produtor, linhas: f.linhas }))}
        vazio="Todas as fazendas foram encontradas."
        dica="Cadastre dentro do produtor, em Clientes → produtor → Nova Fazenda." />
      <Bloco titulo="Talhões que não estão no cadastro da fazenda"
        itens={pv.talhoes.map(t => ({ rotulo: t.nome, sub: t.fazenda, linhas: t.linhas }))}
        vazio="Todos os talhões foram encontrados."
        dica="Cadastre em Clientes → fazenda → Novo Talhão. Ele nasce sem limite geográfico, esperando o KML." />
      <Bloco titulo="Cultivares sem cadastro" itens={pv.cultivares.map(c => ({ rotulo: c.nome, linhas: c.linhas }))}
        vazio="Todos os cultivares da planilha já estão cadastrados."
        dica="Este é o trabalho que só se faz UMA vez: o código cadastrado hoje é reconhecido sozinho na planilha do ano que vem."
        acao={{ rotulo: 'Cadastrar', onClick: onCriarCultivar }} />
      <Bloco titulo="Propósitos sem cadastro" itens={pv.propositos.map(p => ({ rotulo: p.nome, linhas: p.linhas }))}
        vazio="Todos os propósitos foram encontrados."
        acao={{ rotulo: 'Cadastrar', onClick: onCriarProposito }} />
      <Bloco titulo="Culturas não reconhecidas" itens={pv.culturas.map(c => ({ rotulo: c.nome, linhas: c.linhas }))}
        vazio="Todas as culturas foram reconhecidas."
        dica="Resolva na tabela, escolhendo a cultura correspondente da lista da plataforma." />

      {pv.safrasAusentes.length > 0 && (
        <div className="p-3 rounded" style={{ background: '#2a2100', border: '1px solid #78350f' }}>
          <p className="text-[11px] font-bold" style={{ color: COR.confirmar }}>
            Ano não cadastrado: {pv.safrasAusentes.join(', ')}
          </p>
          <p className="text-[10px] mt-1" style={{ color: '#fcd34d' }}>
            Cadastre em Biblioteca → Anos. Sem o ano, nenhuma linha entra.
          </p>
        </div>
      )}

      <button onClick={onIrParaTabela}
        className="px-3 py-2 rounded text-[11px] font-bold text-white" style={{ background: 'var(--invicta-green-dark)' }}>
        Ir para a tabela →
      </button>
    </div>
  );
}

function Bloco({ titulo, itens, vazio, dica, acao }: {
  titulo: string;
  itens: { rotulo: string; sub?: string; linhas: number }[];
  vazio: string;
  dica?: string;
  acao?: { rotulo: string; onClick: (nome: string) => void };
}) {
  const [aberto, setAberto] = useState(true);
  const total = itens.reduce((s, i) => s + i.linhas, 0);
  if (!itens.length) {
    return (
      <p className="text-[10px] flex items-center gap-1.5" style={{ color: COR.gravar }}>
        <CheckCircle2 size={11} /> {vazio}
      </p>
    );
  }
  return (
    <div className="rounded" style={{ background: COR.card, border: `1px solid ${COR.borda}` }}>
      <button onClick={() => setAberto(a => !a)} className="w-full px-3 py-2 flex items-center gap-2 text-left">
        <AlertTriangle size={12} style={{ color: COR.criar }} />
        <span className="text-[11px] font-bold flex-1" style={{ color: '#e2e8f0' }}>{titulo}</span>
        <span className="text-[10px] font-bold px-1.5 rounded" style={{ background: `${COR.criar}22`, color: COR.criar }}>
          {itens.length} itens · {total} linhas
        </span>
      </button>
      {aberto && (
        <div className="px-3 pb-2 space-y-0.5">
          {dica && <p className="text-[10px] pb-1" style={{ color: COR.cinza }}>{dica}</p>}
          {itens.map(i => (
            <div key={`${i.rotulo}|${i.sub ?? ''}`} className="flex items-center gap-2 py-0.5">
              <span className="text-[10px] font-bold tabular-nums w-12 text-right" style={{ color: COR.confirmar }}>
                {i.linhas} lin
              </span>
              <span className="text-[11px] flex-1 truncate" style={{ color: '#cbd5e1' }}>
                {i.rotulo}{i.sub && <span style={{ color: COR.cinza }}> · {i.sub}</span>}
              </span>
              {acao && (
                <button onClick={() => acao.onClick(i.rotulo)}
                  className="px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-1"
                  style={{ background: COR.borda, color: COR.azul }}>
                  <Plus size={9} /> {acao.rotulo}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── tabela ─────────────────────────────────────────────────────────────────

function Tabela({ linhas, aba, setAba, cadastro, plano, decidir, decisoes, aplicarATodos, alternarIgnorada, classificarGrupo, onCriarCultivar }: {
  linhas: LinhaResolvida[];
  aba: Aba; setAba: (a: Aba) => void;
  cadastro: Cadastro; plano: PlanoImportacao;
  decidir: (campo: CampoDecisao, chave: string, valor: string) => void;
  decisoes: Decisoes;
  aplicarATodos: (i: number, campo: CampoDecisao, valor: string) => number;
  alternarIgnorada: (linha: number) => void;
  classificarGrupo: (grupo: string, tipo: 'consorcio' | 'partes') => void;
  onCriarCultivar: (n: string) => void;
}) {
  const visiveis = useMemo(() => linhas.map((l, i) => ({ l, i })).filter(({ l }) =>
    aba === 'tudo' ? true
      : aba === 'ignoradas' ? l.ignorada
      : aba === 'prontas' ? !l.ignorada && !l.bloqueiosFinais.length
      : !l.ignorada && l.bloqueiosFinais.length > 0,
  ), [linhas, aba]);

  const n = (f: (l: LinhaResolvida) => boolean) => linhas.filter(f).length;
  const th = 'px-2 py-1 text-[9px] font-bold uppercase tracking-wide sticky top-0 z-10 text-left';

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center gap-1">
        {([
          ['pendentes', 'Pendentes', n(l => !l.ignorada && l.bloqueiosFinais.length > 0), COR.confirmar],
          ['prontas', 'Prontas', n(l => !l.ignorada && !l.bloqueiosFinais.length), COR.gravar],
          ['ignoradas', 'Fora', n(l => l.ignorada), COR.cinza],
          ['tudo', 'Tudo', linhas.length, COR.azul],
        ] as [Aba, string, number, string][]).map(([id, rot, qtd, cor]) => (
          <button key={id} onClick={() => setAba(id)}
            className="px-2 py-1 rounded text-[10px] font-bold"
            style={{ background: aba === id ? cor : 'transparent', color: aba === id ? '#061525' : cor,
                     border: `1px solid ${aba === id ? cor : COR.borda}` }}>
            {rot} ({qtd})
          </button>
        ))}
      </div>

      {!visiveis.length && (
        <p className="text-[11px] py-6 text-center" style={{ color: COR.cinza }}>
          {aba === 'pendentes' ? 'Nenhuma pendência — pode importar.' : 'Nada nesta aba.'}
        </p>
      )}

      <div className="overflow-auto rounded" style={{ border: `1px solid ${COR.borda}`, maxHeight: '58vh' }}>
        <table className="border-collapse w-full">
          <thead>
            <tr style={{ background: COR.card }}>
              <th className={th} style={{ color: COR.azul }}>Lin</th>
              <th className={th} style={{ color: COR.azul }}>Produtor</th>
              <th className={th} style={{ color: COR.azul }}>Fazenda</th>
              <th className={th} style={{ color: COR.azul }}>Talhão</th>
              <th className={th} style={{ color: COR.azul }}>Área</th>
              <th className={th} style={{ color: COR.azul }}>Cultura</th>
              <th className={th} style={{ color: COR.azul }}>Cultivar</th>
              <th className={th} style={{ color: COR.azul }}>O que falta</th>
              <th className={th} style={{ color: COR.azul }} />
            </tr>
          </thead>
          <tbody>
            {visiveis.map(({ l, i }) => (
              <LinhaTabela key={l.origem.linha} l={l} i={i} cadastro={cadastro} plano={plano}
                decidir={decidir} decisoes={decisoes} aplicarATodos={aplicarATodos}
                alternarIgnorada={alternarIgnorada} classificarGrupo={classificarGrupo}
                onCriarCultivar={onCriarCultivar} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LinhaTabela({ l, i, cadastro, plano, decidir, aplicarATodos, alternarIgnorada, classificarGrupo, onCriarCultivar }: {
  l: LinhaResolvida; i: number; cadastro: Cadastro; plano: PlanoImportacao;
  decidir: (campo: CampoDecisao, chave: string, valor: string) => void;
  decisoes: Decisoes;
  aplicarATodos: (i: number, campo: CampoDecisao, valor: string) => number;
  alternarIgnorada: (linha: number) => void;
  classificarGrupo: (grupo: string, tipo: 'consorcio' | 'partes') => void;
  onCriarCultivar: (n: string) => void;
}) {
  const cor = l.ignorada ? COR.cinza
    : l.bloqueiosFinais.length ? (l.final.produtorId && l.final.fazendaId && l.final.talhaoId ? COR.confirmar : COR.criar)
    : COR.gravar;
  const td = 'px-2 py-1 text-[10px] align-top';
  const opcoesFazenda = cadastro.fazendas.filter(f => f.clienteId === l.final.produtorId);
  const opcoesTalhao = cadastro.talhoes.filter(t => t.fazendaId === l.final.fazendaId);
  const iguais = linhasEquivalentes(plano, i, 'talhao').length;

  const escolher = (campo: CampoDecisao, chaveDecisao: string) => (valor: string) => {
    decidir(campo, chaveDecisao, valor);
    aplicarATodos(i, campo, valor);
  };

  return (
    <tr style={{ borderTop: `1px solid ${COR.borda}`, opacity: l.ignorada ? 0.45 : 1 }}>
      <td className={td} style={{ borderLeft: `3px solid ${cor}`, color: COR.cinza }}>{l.origem.linha}</td>
      <td className={td}>
        {l.final.produtorId
          ? <span style={{ color: '#cbd5e1' }}>{cadastro.clientes.find(c => c.id === l.final.produtorId)?.nome}</span>
          : <SeletorCadastro opcoes={cadastro.clientes} onEscolher={escolher('produtor', l.produtor.chaveDecisao)} />}
        <div className="text-[9px]" style={{ color: COR.cinza }}>{l.origem.produtor}</div>
      </td>
      <td className={td}>
        {l.final.fazendaId
          ? <span style={{ color: '#cbd5e1' }}>{opcoesFazenda.find(f => f.id === l.final.fazendaId)?.nome}</span>
          : <SeletorCadastro opcoes={opcoesFazenda} onEscolher={escolher('fazenda', `${l.produtor.chaveDecisao}|${l.fazenda.chaveDecisao}`)} />}
        <div className="text-[9px]" style={{ color: COR.cinza }}>{l.origem.fazenda}</div>
      </td>
      <td className={td}>
        {l.final.talhaoId
          ? <span style={{ color: '#cbd5e1' }}>{opcoesTalhao.find(t => t.id === l.final.talhaoId)?.nome}</span>
          : <SeletorCadastro opcoes={opcoesTalhao} onEscolher={escolher('talhao', `${l.produtor.chaveDecisao}|${l.fazenda.chaveDecisao}|${l.talhao.chaveDecisao}`)} />}
        <div className="text-[9px]" style={{ color: COR.cinza }}>
          {l.origem.talhao}
          {l.talhao.motivo === 'subdivisao' && l.talhao.pai && (
            <span style={{ color: COR.partir }}> · parte de {l.talhao.pai.nome}</span>
          )}
          {iguais > 1 && <span style={{ color: COR.azul }}> · +{iguais - 1} igual(is)</span>}
        </div>
      </td>
      <td className={`${td} tabular-nums`} style={{ color: '#cbd5e1' }}>{l.origem.areaHa ?? '—'}</td>
      <td className={td}>
        {l.final.cultura
          ? <span style={{ color: '#cbd5e1' }}>{l.final.cultura}</span>
          : <SeletorCadastro opcoes={CULTURAS.map(c => ({ id: c, nome: c }))}
              onEscolher={v => decidir('cultura', chaveTexto(l.origem.cultura), v)} />}
        <div className="text-[9px]" style={{ color: COR.cinza }}>{l.origem.cultura}</div>
      </td>
      <td className={td}>
        {l.final.cultivarId
          ? <span style={{ color: '#cbd5e1' }}>{cadastro.cultivares.find(c => c.id === l.final.cultivarId)?.nome}</span>
          : l.origem.cultivar ? (
            <div className="flex items-center gap-1">
              <div className="flex-1">
                <SeletorCadastro opcoes={cadastro.cultivares}
                  onEscolher={v => decidir('cultivar', chaveTexto(l.origem.cultivar), v)} />
              </div>
              <button onClick={() => onCriarCultivar(l.origem.cultivar)} title="Cadastrar este cultivar"
                className="p-0.5 rounded flex-shrink-0" style={{ background: COR.borda, color: COR.azul }}>
                <Plus size={10} />
              </button>
            </div>
          ) : <span style={{ color: COR.cinza }}>—</span>}
        <div className="text-[9px]" style={{ color: COR.cinza }}>{l.origem.cultivar}</div>
      </td>
      <td className={td} style={{ color: l.bloqueiosFinais.length ? COR.confirmar : COR.gravar, maxWidth: 260 }}>
        {l.bloqueiosFinais.length ? l.bloqueiosFinais.join(' ') : `casou: ${ROTULO_MOTIVO[l.talhao.motivo]}`}
        {l.repeticao === 'ambiguo' && (
          <div className="flex items-center gap-1 mt-1">
            <button onClick={() => classificarGrupo(l.grupo, 'partes')}
              className="px-1 py-0.5 rounded text-[9px]" style={{ background: COR.borda, color: COR.azul }}>
              <Layers size={9} className="inline" /> São partes
            </button>
            <button onClick={() => classificarGrupo(l.grupo, 'consorcio')}
              className="px-1 py-0.5 rounded text-[9px]" style={{ background: COR.borda, color: COR.azul }}>
              Mesma área
            </button>
          </div>
        )}
      </td>
      <td className={td}>
        <button onClick={() => alternarIgnorada(l.origem.linha)} title={l.ignorada ? 'Trazer de volta' : 'Deixar de fora'}
          className="p-0.5 rounded" style={{ color: l.ignorada ? COR.azul : COR.cinza }}>
          <Ban size={11} />
        </button>
      </td>
    </tr>
  );
}

/**
 * Célula de escolha: mostra um botão e só vira <select> quando clicada.
 *
 * Não é enfeite — é o que torna a tela usável. Renderizando o <select> de
 * imediato em toda linha pendente, 592 linhas geravam 2.366 selects; com 75
 * produtores e 1.061 talhões no cadastro real, isso viraria dezenas de milhares
 * de <option> no DOM e o navegador travava. Aberta uma por vez, o custo é o de
 * uma lista só.
 *
 * Fora do componente de linha de propósito: criado dentro do render, o React o
 * trata como um tipo novo a cada tecla e remonta o campo, fazendo o foco pular.
 */
function SeletorCadastro({ opcoes, onEscolher }: { opcoes: { id: string; nome: string }[]; onEscolher: (v: string) => void }) {
  const [aberto, setAberto] = useState(false);
  if (!aberto) {
    return (
      <button onClick={() => setAberto(true)}
        className="px-1 py-0.5 rounded text-[10px] w-full text-left"
        style={{ ...inputStyle, opacity: opcoes.length ? 1 : 0.5 }}
        disabled={!opcoes.length}
        title={opcoes.length ? 'Escolher no cadastro' : 'Resolva o nível acima primeiro'}>
        — escolher —
      </button>
    );
  }
  return (
    <select autoFocus value="" onChange={e => { onEscolher(e.target.value); setAberto(false); }}
      onBlur={() => setAberto(false)}
      className="px-1 py-0.5 rounded text-[10px] w-full" style={inputStyle}>
      <option value="">— escolher —</option>
      {opcoes.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
    </select>
  );
}

const chaveTexto = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// ── relatório ──────────────────────────────────────────────────────────────

async function baixarRelatorio(rel: ReturnType<typeof montarRelatorio>, arquivo: string, importacaoId: string) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const aba = (nome: string, dados: Record<string, string | number>[]) => {
    const ws = XLSX.utils.json_to_sheet(dados.length ? dados : [{ '—': 'nada nesta aba' }]);
    XLSX.utils.book_append_sheet(wb, ws, nome);
  };
  aba('Importado', rel.importado);
  aba('Não importado', rel.naoImportado);
  aba('Divergências de área', rel.divergencias);
  const nome = `IMPORTACAO_FITOTECNICA_${importacaoId}.xlsx`;
  XLSX.writeFile(wb, nome);
  return nome;
}
