'use client';

// CONFIGURAÇÕES › IMPORTAR MIGRAÇÃO (só administrador).
//
// Sobe o acervo migrado da InCeres a partir da pasta de export
// (`<produtor>/<fazenda>/<talhão>/<safra> - <grade> [car_id]/`): produtores,
// fazendas, talhões (com as versões do polígono por safra), grades (grid e
// zona) e laudos. NÃO interpola — os mapas de fertilidade saem pela fila logo
// abaixo, "processar próximos N", retomável.
//
// A regra (o que é talhão, o que se pula, limite × versões, data no ano da
// safra) é pura e testada em lib/migracaoInceres. Aqui é só leitura dos
// arquivos, escolhas do usuário e gravação em LOTE por fazenda (lib/store
// *Lote), esperando o envio à nuvem terminar entre um lote e outro para cada
// POST levar só as linhas daquele lote.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, FolderOpen, Play, Square, AlertTriangle } from 'lucide-react';
import { PanelSection } from './_shared';
import {
  getClientes, getFazendas, getTalhoes, getSafras, saveSafra, salvarLaboratorio, getVariaveisAtivas,
  getGrades, getImportacoesLab, salvarClientesLote, salvarFazendasLote, gravarTalhoesMigracaoLote,
  salvarGradesLote, salvarImportacoesLabLote,
  type Talhao, type GradeAmostragem, type ImportacaoLab,
} from '@/lib/store';
import { lerArquivo, type ResultadoAmostra } from '@/lib/lab';
import {
  agruparArquivosPorPasta, prepararPasta, montarPlano, sugerirExistente, planejarLimites, montarGrade,
  lerLaudo, montarLaudo, amostrasForaDaGrade, bindingDaGradeMigrada, NOME_LABORATORIO, FONTE,
  type Plano, type PlanoProdutor, type PlanoFazenda, type ResultadoPreparo, type SafraInfo,
} from '@/lib/migracaoInceres';
import { cloudAguardarEnvio, cloudPodeGravar, cloudListarMapasMeta } from '@/lib/cloud';
import { processarMapasDaImportacao, ehErroDeParada, chavesEsperadas, chaveDoIdMapa } from '@/lib/processarFertilidade';
import { extrairPoligono } from '@/lib/fertilidade';
import { resolverGradeDoLaudo } from '@/lib/eloGrade';
import { zonasDoTalhao } from '@/lib/zonasDoTalhao';
import { msgBackendFora, ehBackendFora } from '@/lib/interpUrl';

const NOVO = '__novo__';
const CHAVES_NUVEM = ['inv_clientes', 'inv_fazendas', 'inv_talhoes', 'inv_grades', 'inv_lab'];
const ceder = () => new Promise<void>(r => setTimeout(r, 0));   // devolve a vez à UI

const cardStyle = { background: '#0b1d3a', border: '1px solid #1a3a6b' } as const;
const selectStyle = { background: '#0f2240', color: '#e2e8f0', border: '1px solid #2e5fa3' } as const;
const btnPrimario = 'flex items-center justify-center gap-2 px-3 py-2 rounded text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40';

interface Escolha { incluir: boolean; clienteId: string; fazendas: Record<string, string> }
interface LinhaLog { caminho: string; msg: string; tipo: 'erro' | 'aviso' }
interface Contagem { clientes: number; fazendas: number; talhoesNovos: number; talhoesAtualizados: number; grades: number; laudos: number; jaImportadas: number }

const chaveFaz = (f: PlanoFazenda) => f.nome;

export function ImportarMigracaoSection() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [lendo, setLendo] = useState<{ atual: number; total: number } | null>(null);
  const [plano, setPlano] = useState<Plano | null>(null);
  const laudosRef = useRef<Map<string, File>>(new Map());
  const [escolhas, setEscolhas] = useState<Record<string, Escolha>>({});
  const [verPuladas, setVerPuladas] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [progresso, setProgresso] = useState<{ atual: number; total: number; nome: string } | null>(null);
  const [log, setLog] = useState<LinhaLog[]>([]);
  const [resumo, setResumo] = useState<string>('');
  const pararRef = useRef(false);
  const [versaoDados, setVersaoDados] = useState(0);   // força recontar "já importadas" após gravar

  // O que já foi importado antes (idempotência: grade E laudo com o car_id).
  const ja = useMemo(() => {
    void versaoDados;
    if (!plano) return { grades: new Set<string>(), laudos: new Set<string>() };
    const ids = (xs: Array<GradeAmostragem | ImportacaoLab>) =>
      new Set(xs.filter(x => x.origemExterna?.fonte === FONTE && x.origemExterna.id).map(x => x.origemExterna!.id!));
    return { grades: ids(getGrades()), laudos: ids(getImportacoesLab()) };
  }, [plano, versaoDados]);

  // Produtores com TODAS as grades já importadas saem da lista (e da seleção):
  // assim a lista vai encolhendo conforme a migração avança.
  const completos = useMemo(() => {
    const s = new Set<string>();
    for (const prod of plano?.produtores ?? []) {
      const gs = prod.fazendas.flatMap(f => f.talhoes.flatMap(t => t.grades));
      if (gs.length && gs.every(g => ja.grades.has(g.carId) && ja.laudos.has(g.carId))) s.add(prod.nome);
    }
    return s;
  }, [plano, ja]);
  const [verCompletos, setVerCompletos] = useState(false);

  // Produtores que o usuário decidiu NÃO importar: saem da lista principal e da
  // seleção. Fica neste navegador (como o estado da fila), pois a pasta é relida
  // a cada sessão e a decisão precisa sobreviver a isso.
  const [ignorados, setIgnorados] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(K_IGNORADOS) ?? '[]') as string[]); } catch { return new Set(); }
  });
  const [verIgnorados, setVerIgnorados] = useState(false);
  function alternarIgnorado(nome: string, ignorar: boolean) {
    setIgnorados(prev => {
      const s = new Set(prev);
      if (ignorar) s.add(nome); else s.delete(nome);
      try { localStorage.setItem(K_IGNORADOS, JSON.stringify([...s])); } catch { /* sem espaço: segue só em memória */ }
      return s;
    });
  }

  const clientes = useMemo(() => (plano ? getClientes() : []), [plano, versaoDados]); // eslint-disable-line react-hooks/exhaustive-deps

  async function aoEscolherPasta(ev: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(ev.target.files ?? []);
    ev.target.value = '';
    if (!files.length) return;
    setPlano(null); setLog([]); setResumo('');
    const caminhos = files.map(f => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name);
    const pastas = agruparArquivosPorPasta(caminhos);
    const resultados: ResultadoPreparo[] = [];
    const laudos = new Map<string, File>();
    const texto = async (arqs: Map<string, number>, nome: string) => (arqs.has(nome) ? files[arqs.get(nome)!].text() : undefined);
    let i = 0;
    setLendo({ atual: 0, total: pastas.size });
    for (const [pasta, arqs] of pastas) {
      const temLaudo = arqs.has('laudo.xlsx');
      // Sem laudo a pasta é pulada: basta o meta.json para dizer de quem é.
      resultados.push(prepararPasta({
        caminho: pasta, temLaudo,
        meta: await texto(arqs, 'meta.json'),
        contorno: temLaudo ? await texto(arqs, 'contorno.geojson') : undefined,
        pontos: temLaudo ? await texto(arqs, 'pontos.geojson') : undefined,
        zonas: temLaudo ? await texto(arqs, 'zonas.geojson') : undefined,
      }));
      if (temLaudo) laudos.set(pasta, files[arqs.get('laudo.xlsx')!]);
      if (++i % 25 === 0) { setLendo({ atual: i, total: pastas.size }); await ceder(); }
    }
    laudosRef.current = laudos;
    const p = montarPlano(resultados);
    // Sugestões: produtor e fazenda existentes pelo nome normalizado.
    const cls = getClientes();
    const esc: Record<string, Escolha> = {};
    for (const prod of p.produtores) {
      const cli = sugerirExistente(prod.nome, cls);
      const fazs = cli ? getFazendas(cli.id) : [];
      esc[prod.nome] = {
        incluir: true,
        clienteId: cli?.id ?? NOVO,
        fazendas: Object.fromEntries(prod.fazendas.map(f => [chaveFaz(f), sugerirExistente(f.nome, fazs)?.id ?? NOVO])),
      };
    }
    setEscolhas(esc);
    setPlano(p);
    setLendo(null);
  }

  function escolherCliente(prod: PlanoProdutor, clienteId: string) {
    const fazs = clienteId === NOVO ? [] : getFazendas(clienteId);
    setEscolhas(e => ({
      ...e,
      [prod.nome]: {
        ...e[prod.nome], clienteId,
        fazendas: Object.fromEntries(prod.fazendas.map(f => [chaveFaz(f), sugerirExistente(f.nome, fazs)?.id ?? NOVO])),
      },
    }));
  }

  // Safras da InCeres → entidade Safra da plataforma ("20/21"), criando a que falta.
  function garantirSafras(infos: SafraInfo[]): Map<string, string> {
    const lista = getSafras();
    const out = new Map<string, string>();
    for (const info of infos) {
      let s = lista.find(x => x.nome === info.nome) ?? lista.find(x => x.anoInicio === info.anoInicio && x.anoFim === info.anoFim);
      if (!s) { s = saveSafra({ nome: info.nome, anoInicio: info.anoInicio, anoFim: info.anoFim, ativa: false }); lista.push(s); }
      out.set(info.nome, s.nome);
    }
    return out;
  }

  async function importar() {
    if (!plano) return;
    const sel = plano.produtores.filter(p => escolhas[p.nome]?.incluir && !completos.has(p.nome) && !ignorados.has(p.nome));
    if (!sel.length) return;
    const nGrades = sel.reduce((s, p) => s + p.nGrades, 0);
    if (!confirm(`Importar ${sel.length} produtor(es), ${nGrades} grade(s)? Os mapas NÃO são gerados agora (use a fila de interpolação).`)) return;
    pararRef.current = false;
    setRodando(true); setResumo('');
    const logs: LinhaLog[] = [];
    const c: Contagem = { clientes: 0, fazendas: 0, talhoesNovos: 0, talhoesAtualizados: 0, grades: 0, laudos: 0, jaImportadas: 0 };
    try {
      const todasGrades = sel.flatMap(p => p.fazendas.flatMap(f => f.talhoes.flatMap(t => t.grades)));
      const nomeSafra = garantirSafras([...new Map(todasGrades.map(g => [g.safra.nome, g.safra])).values()]);
      const labId = salvarLaboratorio(NOME_LABORATORIO)?.id;
      const vars = getVariaveisAtivas();
      let feitas = 0;
      for (const prod of sel) {
        if (pararRef.current) break;
        const esc = escolhas[prod.nome];
        let clienteId = esc.clienteId;
        if (clienteId === NOVO) {
          clienteId = salvarClientesLote([{
            nome: prod.nome, documento: '', tipoPessoa: 'PF', telefone: '', email: '', cidade: '', estado: '',
            observacoes: 'Importado da InCeres (migração).',
          }])[0].id;
          c.clientes++;
        }
        const novasFaz = prod.fazendas.filter(f => (esc.fazendas[chaveFaz(f)] ?? NOVO) === NOVO);
        const criadas = salvarFazendasLote(novasFaz.map(f => ({ clienteId, nome: f.nome, municipio: '', estado: '' })));
        c.fazendas += criadas.length;
        const fazId = new Map<string, string>(prod.fazendas.map(f => [chaveFaz(f), esc.fazendas[chaveFaz(f)]]));
        novasFaz.forEach((f, i) => fazId.set(chaveFaz(f), criadas[i].id));
        for (const faz of prod.fazendas) {
          if (pararRef.current) break;
          await importarFazenda(faz, fazId.get(chaveFaz(faz))!, { nomeSafra, labId, vars, logs, c, onGrade: (nome) => {
            feitas++;
            setProgresso({ atual: feitas, total: nGrades, nome: `${prod.nome} › ${nome}` });
          } });
          // Um lote por fazenda: espera o envio terminar antes do próximo.
          await cloudAguardarEnvio(CHAVES_NUVEM);
          await ceder();
        }
      }
    } catch (e) {
      logs.push({ caminho: '(importação)', msg: e instanceof Error ? e.message : String(e), tipo: 'erro' });
    } finally {
      setProgresso(null);
      setRodando(false);
      setLog(logs);
      setVersaoDados(v => v + 1);
      const erros = logs.filter(l => l.tipo === 'erro').length;
      setResumo(`${pararRef.current ? 'Interrompido. ' : '✅ '}Produtores novos ${c.clientes} · fazendas novas ${c.fazendas} · talhões novos ${c.talhoesNovos} (atualizados ${c.talhoesAtualizados}) · grades ${c.grades} · laudos ${c.laudos} · já importadas ${c.jaImportadas} · erros ${erros}.`);
    }
  }

  async function importarFazenda(
    faz: PlanoFazenda, fazendaId: string,
    ctx: { nomeSafra: Map<string, string>; labId?: string; vars: ReturnType<typeof getVariaveisAtivas>; logs: LinhaLog[]; c: Contagem; onGrade: (nome: string) => void },
  ) {
    const { logs, c } = ctx;
    // 1) Laudos primeiro: pasta cujo laudo não lê não entra (nem a grade).
    const laudos = new Map<string, { resultados: ResultadoAmostra[]; elementos: string[] } | null>();
    for (const tal of faz.talhoes) for (const g of tal.grades) {
      ctx.onGrade(g.nomeGrade);
      if (ja.grades.has(g.carId) && ja.laudos.has(g.carId)) { laudos.set(g.carId, null); c.jaImportadas++; continue; }
      try {
        const arq = laudosRef.current.get(g.caminho);
        if (!arq) throw new Error('laudo.xlsx não encontrado');
        const l = lerLaudo(await lerArquivo(arq), ctx.vars);
        const fora = amostrasForaDaGrade(l.resultados, g.pontos);
        if (fora.length) logs.push({ caminho: g.caminho, msg: `amostra(s) do laudo sem ponto na grade: ${fora.join(', ')}`, tipo: 'aviso' });
        laudos.set(g.carId, l);
      } catch (e) {
        logs.push({ caminho: g.caminho, msg: `laudo: ${e instanceof Error ? e.message : String(e)}`, tipo: 'erro' });
      }
      await ceder();
    }

    // 2) Talhões: um por código; limite = safra mais nova, versões por safra.
    const existentes = getTalhoes(fazendaId);
    const agora = new Date().toISOString();
    const novos: Omit<Talhao, 'id' | 'criadoEm'>[] = [];
    const novosCod: string[] = [];
    const atualizacoes: { id: string; data: Partial<Talhao> }[] = [];
    const talhaoDe = new Map<string, string>();    // código → talhaoId
    const ok = (cod: string) => faz.talhoes.find(t => t.codigo === cod)!.grades.filter(g => laudos.has(g.carId));
    for (const tal of faz.talhoes) {
      const gs = ok(tal.codigo);
      if (!gs.length) continue;
      const existente = sugerirExistente(tal.codigo, existentes);
      const patch = planejarLimites(existente ?? null, gs.map(g => ({ safra: ctx.nomeSafra.get(g.safra.nome)!, contorno: g.contorno })), agora) ?? {};
      // Grade de zona: a Fertilidade lê as zonas do talhão (zonasDoTalhao) —
      // o zoneamento da grade mais nova vira o snapshot, se o talhão não tem um.
      const zonaNova = [...gs].reverse().find(g => g.zonasFC);
      if (zonaNova && !existente?.zonasGeojson) patch.zonasGeojson = JSON.stringify(zonaNova.zonasFC);
      if (existente) {
        talhaoDe.set(tal.codigo, existente.id);
        if (Object.keys(patch).length) { atualizacoes.push({ id: existente.id, data: patch }); c.talhoesAtualizados++; }
      } else {
        novos.push({ fazendaId, nome: tal.codigo, areaHa: patch.areaHa ?? 0, status: 'ativo', ...patch });
        novosCod.push(tal.codigo);
      }
    }
    const criados = gravarTalhoesMigracaoLote(novos, atualizacoes);
    criados.forEach((t, i) => talhaoDe.set(novosCod[i], t.id));
    c.talhoesNovos += criados.length;

    // 3) Grades (idempotentes pelo car_id). Uma "para processar" por talhão+safra.
    const gradesIn: Omit<GradeAmostragem, 'id' | 'criadoEm'>[] = [];
    const gradesPrep: typeof faz.talhoes[number]['grades'] = [];
    const temMarcada = new Set<string>();
    for (const tal of faz.talhoes) {
      const tid = talhaoDe.get(tal.codigo);
      if (!tid) continue;
      for (const g of getGrades(tid)) if (g.paraProcessar) temMarcada.add(`${tid}|${g.safra}`);
      for (const g of ok(tal.codigo)) {
        const safra = ctx.nomeSafra.get(g.safra.nome)!;
        const k = `${tid}|${safra}`;
        const marcar = !temMarcada.has(k);
        temMarcada.add(k);
        gradesIn.push(montarGrade(g, tid, safra, marcar));
        gradesPrep.push(g);
      }
    }
    const antes = getGrades().length;
    const grades = salvarGradesLote(gradesIn);
    c.grades += getGrades().length - antes;

    // 4) Laudos ligados à grade (join por número na leitura, como sempre).
    const laudosIn: Omit<ImportacaoLab, 'id' | 'criadoEm'>[] = [];
    gradesPrep.forEach((g, i) => {
      const l = laudos.get(g.carId);
      if (!l) return;   // já importado
      laudosIn.push(montarLaudo(g, grades[i].talhaoId, grades[i].safra, grades[i].id, l, ctx.labId));
    });
    const antesL = getImportacoesLab().length;
    salvarImportacoesLabLote(laudosIn);
    c.laudos += getImportacoesLab().length - antesL;
  }

  const sel = plano?.produtores.filter(p => escolhas[p.nome]?.incluir && !completos.has(p.nome) && !ignorados.has(p.nome)) ?? [];
  const pendentes = plano?.produtores.filter(p => !completos.has(p.nome) && !ignorados.has(p.nome)) ?? [];
  // Só os ignorados presentes nesta pasta (um produtor de outra pasta não conta aqui).
  const nIgnorados = plano?.produtores.filter(p => ignorados.has(p.nome) && !completos.has(p.nome)).map(p => p.nome) ?? [];
  const motivos = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of plano?.puladas ?? []) {
      const k = p.motivo.replace(/^.*tem polígonos diferentes na mesma safra.*$/, 'mesmo código com polígonos diferentes na mesma safra');
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [plano]);

  return (
    <PanelSection title="Importar migração (InCeres)">
      <div className="px-4 py-2 space-y-2">
        <p className="text-[10px] leading-relaxed" style={{ color: '#94a3b8' }}>
          Escolha a pasta <b>export/</b> inteira ou a de um produtor. Cada grade com laudo vira talhão
          (pelo código da grade), grade e laudo na safra dela. Pastas sem laudo, sem pontos, com nome fora do
          padrão ou com polígonos conflitantes são puladas e listadas. Reimportar não duplica.
        </p>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={aoEscolherPasta}
          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} />
        <button onClick={() => inputRef.current?.click()} disabled={!!lendo || rodando}
          className={`${btnPrimario} w-full`} style={{ background: 'var(--invicta-blue)' }}>
          {lendo ? <Loader2 size={14} className="animate-spin" /> : <FolderOpen size={14} />}
          {lendo ? `Lendo pastas… ${lendo.atual}/${lendo.total}` : 'Escolher pasta do export'}
        </button>

        {plano && (
          <div className="space-y-2">
            <p className="text-[11px]" style={{ color: '#e2e8f0' }}>
              {pendentes.length} produtor(es) a importar · {pendentes.reduce((s, p) => s + p.nGrades, 0)} grade(s) com laudo
              {completos.size > 0 && <> · <button className="underline" style={{ color: '#4ade80' }} onClick={() => setVerCompletos(v => !v)}>{completos.size} já importado(s)</button></>}
              {nIgnorados.length > 0 && <> · <button className="underline" style={{ color: '#94a3b8' }} onClick={() => setVerIgnorados(v => !v)}>{nIgnorados.length} não importar</button></>}
              · <button className="underline" style={{ color: '#fbbf24' }} onClick={() => setVerPuladas(v => !v)}>{plano.puladas.length} pulada(s)</button>
            </p>
            {verPuladas && (
              <div className="rounded p-2 space-y-1 max-h-60 overflow-y-auto text-[10px]" style={cardStyle}>
                {motivos.map(([m, n]) => <p key={m} style={{ color: '#fbbf24' }}>{n}× {m}</p>)}
                <div className="pt-1 space-y-0.5" style={{ color: '#94a3b8' }}>
                  {plano.puladas.map(p => (
                    <p key={p.caminho}>{p.produtor} › {p.fazenda} › {p.talhaoPasta} › {p.grade} {p.safra && `(${p.safra})`} — <span style={{ color: '#fbbf24' }}>{p.motivo}</span></p>
                  ))}
                </div>
              </div>
            )}

            {verCompletos && completos.size > 0 && (
              <div className="rounded p-2 space-y-0.5 max-h-40 overflow-y-auto text-[10px]" style={{ ...cardStyle, color: '#4ade80' }}>
                {[...completos].map(nome => <p key={nome}>✓ {nome}</p>)}
              </div>
            )}

            {verIgnorados && nIgnorados.length > 0 && (
              <div className="rounded p-2 space-y-0.5 max-h-40 overflow-y-auto text-[10px]" style={{ ...cardStyle, color: '#94a3b8' }}>
                {nIgnorados.map(nome => (
                  <p key={nome} className="flex items-center justify-between gap-2">
                    <span className="truncate">✕ {nome}</span>
                    <button className="underline shrink-0" style={{ color: '#60a5fa' }} disabled={rodando}
                      onClick={() => alternarIgnorado(nome, false)}>voltar para a lista</button>
                  </p>
                ))}
              </div>
            )}

            <div className="flex gap-2 text-[10px]">
              <button className="underline" style={{ color: '#94a3b8' }} onClick={() => setEscolhas(e => Object.fromEntries(Object.entries(e).map(([k, v]) => [k, { ...v, incluir: true }])))}>marcar todos</button>
              <button className="underline" style={{ color: '#94a3b8' }} onClick={() => setEscolhas(e => Object.fromEntries(Object.entries(e).map(([k, v]) => [k, { ...v, incluir: false }])))}>desmarcar todos</button>
            </div>

            <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
              {pendentes.map(prod => {
                const esc = escolhas[prod.nome];
                if (!esc) return null;
                const fazsCli = esc.clienteId === NOVO ? [] : getFazendas(esc.clienteId);
                const grades = prod.fazendas.flatMap(f => f.talhoes.flatMap(t => t.grades));
                const jaN = grades.filter(g => ja.grades.has(g.carId) && ja.laudos.has(g.carId)).length;
                const nZona = grades.filter(g => g.tipo === 'zona').length;
                return (
                  <div key={prod.nome} className="rounded p-2 space-y-1.5" style={cardStyle}>
                    <div className="flex items-center gap-2">
                      <label className="flex-1 min-w-0 flex items-center gap-2 text-[11px] font-semibold" style={{ color: '#e2e8f0' }}>
                        <input type="checkbox" checked={esc.incluir} disabled={rodando}
                          onChange={ev => setEscolhas(e => ({ ...e, [prod.nome]: { ...e[prod.nome], incluir: ev.target.checked } }))} />
                        <span className="truncate">{prod.nome}</span>
                      </label>
                      <button className="shrink-0 text-[10px] underline" style={{ color: '#94a3b8' }} disabled={rodando}
                        title="Tira este produtor da lista; dá para trazer de volta em “não importar”"
                        onClick={() => alternarIgnorado(prod.nome, true)}>Não importar</button>
                    </div>
                    <p className="text-[10px]" style={{ color: '#94a3b8' }}>
                      {prod.fazendas.length} fazenda(s) · {prod.fazendas.reduce((s, f) => s + f.talhoes.length, 0)} talhão(ões) ·
                      {' '}{grades.length} grade(s){nZona ? ` (${nZona} zona)` : ''} + laudos · safras {prod.safras.join(', ')}
                      {jaN > 0 && <span style={{ color: '#4ade80' }}> · {jaN} já importada(s)</span>}
                    </p>
                    <div className="flex items-center gap-2 text-[10px]" style={{ color: '#94a3b8' }}>
                      <span className="w-14 shrink-0">Produtor</span>
                      <select className="flex-1 min-w-0 rounded px-1 py-0.5" style={selectStyle} value={esc.clienteId} disabled={rodando}
                        onChange={ev => escolherCliente(prod, ev.target.value)}>
                        <option value={NOVO}>Criar novo: {prod.nome.toUpperCase()}</option>
                        {clientes.map(c => <option key={c.id} value={c.id}>Juntar com: {c.nome}</option>)}
                      </select>
                    </div>
                    {prod.fazendas.map(f => {
                      const tExist = esc.fazendas[chaveFaz(f)] === NOVO ? [] : getTalhoes(esc.fazendas[chaveFaz(f)]);
                      const nExist = f.talhoes.filter(t => sugerirExistente(t.codigo, tExist)).length;
                      return (
                        <div key={f.nome} className="flex items-center gap-2 text-[10px]" style={{ color: '#94a3b8' }}>
                          <span className="w-14 shrink-0 truncate" title={f.nome}>{f.nome}</span>
                          <select className="flex-1 min-w-0 rounded px-1 py-0.5" style={selectStyle} value={esc.fazendas[chaveFaz(f)]} disabled={rodando}
                            onChange={ev => setEscolhas(e => ({ ...e, [prod.nome]: { ...e[prod.nome], fazendas: { ...e[prod.nome].fazendas, [chaveFaz(f)]: ev.target.value } } }))}>
                            <option value={NOVO}>Criar nova: {f.nome.toUpperCase()}</option>
                            {fazsCli.map(x => <option key={x.id} value={x.id}>Juntar com: {x.nome}</option>)}
                          </select>
                          <span className="shrink-0" title="talhões: novos / já existentes na fazenda">{f.talhoes.length - nExist}+{nExist}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {!rodando ? (
              <button onClick={importar} disabled={!sel.length}
                className={`${btnPrimario} w-full`} style={{ background: '#166534' }}>
                <Play size={14} /> Importar {sel.length} produtor(es)
              </button>
            ) : (
              <button onClick={() => { pararRef.current = true; }}
                className={`${btnPrimario} w-full`} style={{ background: '#b45309' }}>
                <Square size={14} /> Parar após a fazenda atual
              </button>
            )}
            {progresso && (
              <div className="space-y-1">
                <div className="h-1.5 rounded overflow-hidden" style={{ background: '#1a3a6b' }}>
                  <div className="h-full" style={{ width: `${(progresso.atual / Math.max(progresso.total, 1)) * 100}%`, background: 'var(--invicta-blue-mid)' }} />
                </div>
                <p className="text-[10px] truncate" style={{ color: '#94a3b8' }}>{progresso.atual}/{progresso.total} · {progresso.nome}</p>
              </div>
            )}
          </div>
        )}

        {resumo && <p className="text-[11px]" style={{ color: resumo.startsWith('✅') ? '#4ade80' : '#fbbf24' }}>{resumo}</p>}
        {log.length > 0 && (
          <div className="rounded p-2 space-y-0.5 max-h-48 overflow-y-auto text-[10px]" style={cardStyle}>
            {log.map((l, i) => (
              <p key={i} style={{ color: l.tipo === 'erro' ? '#f87171' : '#fbbf24' }}>{l.caminho} — {l.msg}</p>
            ))}
          </div>
        )}
      </div>
      <FilaInterpolacaoMigracao versao={versaoDados} />
    </PanelSection>
  );
}

// ── Fila de interpolação ─────────────────────────────────────────────────────
// Laudos migrados ainda sem mapa de fertilidade. O estado fica neste navegador
// (conveniência); a verdade é a NUVEM: antes de processar cada laudo, compara
// os mapas que já estão lá (`nut__prof`) com os que o laudo deve ter
// (chavesEsperadas) e processa SÓ os que faltam — uma rodada parada no meio
// retoma do ponto certo, em qualquer aparelho. Cada mapa só conta depois que a
// nuvem confirmou a gravação. `ok` = todos os esperados na nuvem; `parcial` =
// o resto não sai por falta de dado (`semDado`); `falha` = volta na próxima.

const K_FILA = 'inv_migracao_fila';
const K_IGNORADOS = 'inv_migracao_ignorados';
type EstadoFila = Record<string, { st: 'ok' | 'parcial' | 'falha'; msg?: string; semDado?: string[]; em: string }>;
function lerFila(): EstadoFila {
  try { return JSON.parse(localStorage.getItem(K_FILA) ?? '{}') as EstadoFila; } catch { return {}; }
}
function gravarFila(f: EstadoFila) {
  try { localStorage.setItem(K_FILA, JSON.stringify(f)); } catch { /* sem espaço: segue só em memória */ }
}

function FilaInterpolacaoMigracao({ versao }: { versao: number }) {
  const [fila, setFila] = useState<EstadoFila>({});
  const [n, setN] = useState(10);
  const [rodando, setRodando] = useState(false);
  const [progresso, setProgresso] = useState('');
  const [aviso, setAviso] = useState('');
  const [podeGravar, setPodeGravar] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [recarga, setRecarga] = useState(0);
  useEffect(() => { setFila(lerFila()); setPodeGravar(cloudPodeGravar()); }, []);

  const importadas = useMemo(() => {
    void versao; void recarga;
    if (typeof window === 'undefined') return [] as ImportacaoLab[];
    return getImportacoesLab().filter(i => i.origemExterna?.fonte === FONTE);
  }, [versao, recarga]);
  const pendentes = useMemo(() => {
    const nunca = importadas.filter(i => !fila[i.id]);
    const falhas = importadas.filter(i => fila[i.id]?.st === 'falha');
    return [...nunca, ...falhas];    // as que falharam vão para o fim
  }, [importadas, fila]);
  const cont = useMemo(() => ({
    ok: importadas.filter(i => fila[i.id]?.st === 'ok').length,
    parcial: importadas.filter(i => fila[i.id]?.st === 'parcial').length,
    falha: importadas.filter(i => fila[i.id]?.st === 'falha').length,
  }), [importadas, fila]);

  function marcar(id: string, st: EstadoFila[string]['st'], msg?: string, semDado?: string[]) {
    setFila(f => { const nf = { ...f, [id]: { st, msg, semDado, em: new Date().toISOString() } }; gravarFila(nf); return nf; });
  }

  async function processar() {
    const lote = pendentes.slice(0, Math.max(1, n));
    if (!lote.length) return;
    setRodando(true); setAviso('');
    abortRef.current = new AbortController();
    const talhoes = getTalhoes();
    try {
      for (let k = 0; k < lote.length; k++) {
        const imp = lote[k];
        if (abortRef.current.signal.aborted) break;
        const t = talhoes.find(x => x.id === imp.talhaoId);
        const nomeT = t?.nome ?? imp.talhaoId;
        setProgresso(`${k + 1}/${lote.length} · ${nomeT} (${imp.safra})`);
        try {
          // O que a NUVEM já tem deste laudo (outro aparelho, ou rodada
          // interrompida no meio): conta mapa a mapa (`nut__prof`) contra o que o
          // laudo deve ter. Só refaz os que faltam; "feito" = todos lá.
          const existentes = new Set((await cloudListarMapasMeta(`${imp.talhaoId}__${imp.id}__`)).map(m => chaveDoIdMapa(m.id)));
          const esperadas = chavesEsperadas(imp);
          const semDado = new Set(fila[imp.id]?.semDado ?? []);   // faltas de dado já constatadas
          const faltam = esperadas.filter(c => !existentes.has(c) && !semDado.has(c));
          if (faltam.length === 0) {
            const nOk = esperadas.filter(c => existentes.has(c)).length;
            if (nOk === 0) marcar(imp.id, 'falha', 'nenhum mapa possível com este laudo', [...semDado]);
            else marcar(imp.id, semDado.size ? 'parcial' : 'ok', `${nOk}/${esperadas.length} mapas na nuvem`, [...semDado]);
            continue;
          }
          if (!t) throw new Error('talhão não encontrado');
          // Polígono DA SAFRA do laudo: a versão arquivada daquela safra quando o
          // limite mudou depois; senão o limite atual.
          const geo = t.geoVersoes?.find(v => v.safras.includes(imp.safra))?.geojson ?? t.geojson;
          const poligono = geo ? extrairPoligono(JSON.parse(geo)) : null;
          if (!poligono) throw new Error('talhão sem limite');
          const grade = resolverGradeDoLaudo(getGrades(imp.talhaoId), imp.gradeId);
          let zona: { zonas: { id: string; classe: string; geometry: GeoJSON.Geometry }[]; vinculo: Record<string, number> } | undefined;
          if ((grade?.metodo ?? 'grid') === 'zonas') {
            // As zonas congeladas na grade (as da safra dela); retaguarda, as do talhão.
            const zonas = grade?.zonasGeo?.length
              ? grade.zonasGeo.map(z => ({ id: z.id, classe: z.classe, geometry: z.geometry as GeoJSON.Geometry }))
              : zonasDoTalhao(imp.talhaoId);
            if (!zonas.length) throw new Error('grade de zona sem zonas');
            zona = { zonas, vinculo: bindingDaGradeMigrada(zonas) };
          }
          const r = await processarMapasDaImportacao({
            talhaoId: imp.talhaoId, importacao: imp, grade, poligono, zona, signal: abortRef.current.signal,
            apenas: new Set(faltam),
            onProgresso: (i, total, nome) => setProgresso(`${k + 1}/${lote.length} · ${nomeT} (${imp.safra}) · ${i}/${total} ${nome}`),
          });
          // Falta de DADO é definitiva (refazer não muda); falha de ENVIO não —
          // o laudo fica como falha e volta na próxima rodada, só com o que falta.
          for (const f of r.falhas) if (!f.envio) semDado.add(f.chave);
          const envio = r.falhas.filter(f => f.envio);
          const nOk = esperadas.filter(c => existentes.has(c)).length + r.gerados;
          const detalhe = r.falhas.length ? `; sem mapa: ${r.falhas.map(f => f.msg).join('; ')}` : '';
          const msg = `${nOk}/${esperadas.length} mapas${detalhe}`;
          if (envio.length || nOk === 0) marcar(imp.id, 'falha', msg, [...semDado]);
          else marcar(imp.id, semDado.size ? 'parcial' : 'ok', msg, [...semDado]);
        } catch (e) {
          if (ehErroDeParada(e)) {
            if (ehBackendFora(e)) setAviso(msgBackendFora());
            break;   // a importação continua pendente
          }
          marcar(imp.id, 'falha', e instanceof Error ? e.message : String(e));
        }
      }
    } finally {
      setRodando(false); setProgresso(''); setRecarga(x => x + 1);
    }
  }

  const ultimasFalhas = importadas.filter(i => fila[i.id]?.st === 'falha').slice(0, 30);
  return (
    <div className="px-4 py-2 space-y-2 border-t" style={{ borderColor: '#1a3a6b' }}>
      <p className="text-[11px] font-semibold" style={{ color: '#e2e8f0' }}>Fila de interpolação (mapas de fertilidade)</p>
      <p className="text-[10px] leading-relaxed" style={{ color: '#94a3b8' }}>
        {importadas.length} laudo(s) migrado(s) · <span style={{ color: '#4ade80' }}>{cont.ok} com mapa</span>
        {cont.parcial > 0 && <> · <span style={{ color: '#fbbf24' }}>{cont.parcial} parcial(is)</span></>}
        {cont.falha > 0 && <> · <span style={{ color: '#f87171' }}>{cont.falha} com falha</span></>}
        {' '}· {pendentes.length} pendente(s). Grid = krigagem no servidor de processamento; zona = valor constante por zona.
      </p>
      {!podeGravar && (
        <p className="flex items-start gap-1 text-[10px]" style={{ color: '#fbbf24' }}>
          <AlertTriangle size={12} className="shrink-0 mt-0.5" /> Mapas só são salvos na nuvem com login — entre na plataforma para processar a fila.
        </p>
      )}
      <div className="flex items-center gap-2">
        <span className="text-[10px]" style={{ color: '#94a3b8' }}>Processar próximos</span>
        <input type="number" min={1} max={500} value={n} onChange={e => setN(Math.max(1, Number(e.target.value) || 1))} disabled={rodando}
          className="w-16 rounded px-1 py-0.5 text-[11px]" style={selectStyle} />
        {!rodando ? (
          <button onClick={processar} disabled={!podeGravar || pendentes.length === 0}
            className={`${btnPrimario} flex-1`} style={{ background: 'var(--invicta-blue-mid)' }}>
            <Play size={14} /> Processar
          </button>
        ) : (
          <button onClick={() => abortRef.current?.abort()}
            className={`${btnPrimario} flex-1`} style={{ background: '#b45309' }}>
            <Square size={14} /> Parar
          </button>
        )}
      </div>
      {progresso && <p className="flex items-center gap-1 text-[10px]" style={{ color: '#94a3b8' }}><Loader2 size={12} className="animate-spin" /> {progresso}</p>}
      {aviso && <p className="text-[10px]" style={{ color: '#f87171' }}>{aviso}</p>}
      {ultimasFalhas.length > 0 && (
        <div className="rounded p-2 space-y-0.5 max-h-32 overflow-y-auto text-[10px]" style={cardStyle}>
          {ultimasFalhas.map(i => (
            <p key={i.id} style={{ color: '#f87171' }}>{getTalhoes().find(t => t.id === i.talhaoId)?.nome ?? i.talhaoId} ({i.safra}) — {fila[i.id]?.msg}</p>
          ))}
        </div>
      )}
    </div>
  );
}
