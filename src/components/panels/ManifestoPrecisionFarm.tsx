'use client';

// Biblioteca → PrecisionFarm → "Importar manifesto da PF" (owner/admin).
//
// ENTRADA: o ZIP inteiro que a PrecisionFarm manda, em dois formatos:
//   • v1 (PRECISIONFARM_INVICTA_COMPLEMENTO_20261028.zip): o manifesto aponta
//     os limites por caminho DENTRO do zip (boundary_file) com o SHA-256;
//   • v2 (PARA_INVICTA_ATIVAR_SINCRONIZACAO_20261104.zip): VINCULOS.json
//     (clients[], farm_groups[], fields[]) + LIMITES.geojson, uma feição por
//     talhão ligada por properties.shared_field_id.
// Também aceita os arquivos soltos (seleção múltipla).
//
// PRÉVIA (nada é gravado): cada talhão da PF × o nosso de maior sobreposição
// entre TODOS os talhões do aparelho (manifestoPF.casarManifestoAos), agrupada
// por cliente da PF → cliente nosso (que sai da GEOMETRIA, nunca do nome).
// Par 1:1 ≤ 5 % vem marcado (no v2, > 5 % também — Q3); ambíguo, já
// vinculado, conflito de IDs e limite inválido não podem ser marcados. Cada
// par mostra a fazenda nossa e de onde vem o shared_farm_id (Q2: o da PF na
// fazenda principal; UUID novo nas demais). CRIAR (clique explícito +
// confirmação) → POST /api/precisionfarm/manifesto, que confere tudo de novo
// e cria PENDENTES (ou substitui o pendente sem ID PF — Q5).
// EXPORTAR RETORNO → zip com o VINCULOS.json preenchido e o relatório por
// talhão (retornoPF.ts), montado a partir dos vínculos que EXISTEM.

import { useMemo, useRef, useState } from 'react';
import { Download, FileUp, Link2, Loader2, X } from 'lucide-react';
import { getClientes, getFazendas, getTalhoes } from '@/lib/store';
import { fmtDec } from '@/lib/formato';
import { criarVinculosManifestoPF, loteGeralPF, type ResultadoManifesto, type VinculoLote } from '@/lib/precisionfarm/cliente';
import {
  LIMIAR_PAR_PCT, acharArquivo, casarManifestoAos, lerLimitesGeojson, lerManifestoPF, limiteDoCampo, resumoFazendas,
  type Casamento, type FeicoesPorCampo, type FormatoManifesto, type PapelFazenda, type SituacaoCasamento,
} from '@/lib/precisionfarm/manifestoPF';
import { SITUACOES_RETORNO, montarRetornoPF, relatorioCsv, type RetornoPF } from '@/lib/precisionfarm/retornoPF';

const MAX_BYTES_ARQUIVOS = 50 * 1024 * 1024;

const ROTULO_SITUACAO: Record<SituacaoCasamento, { txt: string; cor: string }> = {
  par: { txt: 'Par 1:1', cor: '#4ade80' },
  diferente: { txt: `Diferença > ${LIMIAR_PAR_PCT}%`, cor: '#fbbf24' },
  ambiguo: { txt: 'Ambíguo', cor: '#f87171' },
  'sem-par': { txt: 'Sem par', cor: '#94a3b8' },
  'ja-vinculado': { txt: 'Já vinculado', cor: '#7dd3fc' },
  conflito: { txt: 'Conflito de IDs', cor: '#f87171' },
  invalido: { txt: 'Inválido', cor: '#f87171' },
};

const ROTULO_PAPEL: Record<PapelFazenda, { txt: string; dica: string }> = {
  principal: { txt: 'UUID da PF', dica: 'Fazenda principal do agrupamento: fica com o shared_farm_id que a PF propôs.' },
  nova: { txt: 'UUID novo', dica: 'Fazenda a mais no agrupamento da PF: recebe um shared_farm_id novo (vai no retorno).' },
  reuso: { txt: 'UUID da fazenda', dica: 'A fazenda já tem vínculo: usa o shared_farm_id que já tem.' },
};

async function sha256Hex(bytes: Uint8Array): Promise<string | null> {
  try {
    const d = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
    return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
  } catch { return null; }   // sem WebCrypto (http sem TLS): segue sem conferir
}

// Tetos do que entra na memória do navegador. O de cima vale para o que o
// usuário escolheu (o zip COMPRIMIDO); os dois de baixo para o DESCOMPRIMIDO —
// um zip de poucos KB pode declarar (ou esconder) gigabytes ("zip bomb"). Um
// limite de talhão real tem 0,01–0,2 MB; o LIMITES.geojson do v2 (162
// talhões), ~12 MB; o manifesto, dezenas a centenas de KB.
const MAX_BYTES_POR_ARQUIVO = 20 * 1024 * 1024;
const MAX_BYTES_DESCOMPRIMIDO = 200 * 1024 * 1024;
const mb = (n: number) => `${fmtDec(n / 1048576, 1)} MB`;

/** Pedaço do JSZip que usamos e que a tipagem pública não expõe: o tamanho
 *  declarado no diretório central e o fluxo de descompressão. */
type EntradaZip = {
  _data?: { uncompressedSize?: number };
  internalStream: (t: 'uint8array') => {
    on(ev: 'data', fn: (chunk: Uint8Array) => void): ReturnType<EntradaZip['internalStream']>;
    on(ev: 'error', fn: (e: Error) => void): ReturnType<EntradaZip['internalStream']>;
    on(ev: 'end', fn: () => void): ReturnType<EntradaZip['internalStream']>;
    resume(): void;
    pause(): void;
  };
};

/** Descomprime UMA entrada contando os bytes: passou do teto, para na hora
 *  (não confia só no tamanho declarado, que um zip forjado pode mentir). */
function descomprimirComTeto(e: EntradaZip, caminho: string, teto: number, motivoTeto: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const pedacos: Uint8Array[] = [];
    let n = 0, parou = false;
    const s = e.internalStream('uint8array');
    s.on('data', chunk => {
      if (parou) return;
      n += chunk.length;
      if (n > teto) { parou = true; s.pause(); reject(new Error(`${caminho}: ${motivoTeto}`)); return; }
      pedacos.push(chunk);
    })
      .on('error', err => { if (!parou) { parou = true; reject(err); } })
      .on('end', () => {
        if (parou) return;
        const out = new Uint8Array(n);
        let k = 0;
        for (const p of pedacos) { out.set(p, k); k += p.length; }
        resolve(out);
      });
    s.resume();
  });
}

/** Arquivos escolhidos → { caminho → bytes } (o zip é aberto aqui). */
async function lerArquivos(files: File[]): Promise<Map<string, Uint8Array>> {
  const total = files.reduce((s, f) => s + f.size, 0);
  if (total > MAX_BYTES_ARQUIVOS) throw new Error(`Arquivos grandes demais (${mb(total)}; até ${mb(MAX_BYTES_ARQUIVOS)}).`);
  const saida = new Map<string, Uint8Array>();
  let descomprimido = 0;
  const somar = (n: number) => {
    descomprimido += n;
    if (descomprimido > MAX_BYTES_DESCOMPRIMIDO) throw new Error(`O conteúdo descomprimido passa de ${mb(MAX_BYTES_DESCOMPRIMIDO)} — não é um pacote de limites; recusado.`);
  };
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) {
      const { default: JSZip } = await import('jszip');
      const zip = await JSZip.loadAsync(await f.arrayBuffer());
      const entradas = Object.entries(zip.files)
        .filter(([caminho, e]) => !e.dir && /\.(geo)?json$/i.test(caminho) && !caminho.startsWith('__MACOSX/'));
      // 1) Pelo tamanho DECLARADO no diretório do zip, antes de descomprimir nada.
      let declarado = 0;
      for (const [caminho, e] of entradas) {
        const d = (e as unknown as EntradaZip)._data?.uncompressedSize;
        if (typeof d === 'number' && Number.isFinite(d)) {
          if (d > MAX_BYTES_POR_ARQUIVO) throw new Error(`${caminho} tem ${mb(d)} descomprimido (até ${mb(MAX_BYTES_POR_ARQUIVO)} por arquivo) — recusado.`);
          declarado += d;
        }
      }
      if (descomprimido + declarado > MAX_BYTES_DESCOMPRIMIDO) {
        throw new Error(`O zip declara ${mb(declarado)} descomprimidos (até ${mb(MAX_BYTES_DESCOMPRIMIDO)} no total) — recusado.`);
      }
      // 2) Descomprimindo, conferindo de novo byte a byte (o declarado pode mentir).
      for (const [caminho, e] of entradas) {
        const resta = MAX_BYTES_DESCOMPRIMIDO - descomprimido;
        const teto = Math.min(MAX_BYTES_POR_ARQUIVO, resta);
        const motivo = teto < MAX_BYTES_POR_ARQUIVO
          ? `o conteúdo descomprimido passa de ${mb(MAX_BYTES_DESCOMPRIMIDO)} no total — recusado.`
          : `passa de ${mb(MAX_BYTES_POR_ARQUIVO)} descomprimido (o tamanho declarado no zip não confere) — recusado.`;
        const bytes = await descomprimirComTeto(e as unknown as EntradaZip, caminho, teto, motivo);
        somar(bytes.length);
        saida.set(caminho, bytes);
      }
    } else {
      if (f.size > MAX_BYTES_POR_ARQUIVO) throw new Error(`${f.name} tem ${mb(f.size)} (até ${mb(MAX_BYTES_POR_ARQUIVO)} por arquivo) — recusado.`);
      somar(f.size);
      saida.set(f.name, new Uint8Array(await f.arrayBuffer()));
    }
  }
  return saida;
}

/** O manifesto entre os arquivos: o .json com "fields" (vários → o de nome *VINCULOS*). */
function acharManifesto(arqs: Map<string, Uint8Array>): { caminho: string; texto: string; json: unknown } {
  const dec = new TextDecoder();
  const candidatos: { caminho: string; texto: string; json: unknown }[] = [];
  for (const [caminho, bytes] of arqs) {
    if (!/\.json$/i.test(caminho) || /\.geojson$/i.test(caminho)) continue;
    const texto = dec.decode(bytes);
    try {
      const json = JSON.parse(texto) as { fields?: unknown };
      if (Array.isArray(json.fields)) candidatos.push({ caminho, texto, json });
    } catch { /* não é o manifesto */ }
  }
  if (!candidatos.length) throw new Error('Nenhum manifesto entre os arquivos (um .json com a lista "fields", como o VINCULOS.json).');
  if (candidatos.length === 1) return candidatos[0];
  const porNome = candidatos.filter(c => /vincul/i.test(c.caminho));
  if (porNome.length === 1) return porNome[0];
  throw new Error(`Mais de um manifesto entre os arquivos: ${candidatos.map(c => c.caminho).join(', ')}. Escolha um só.`);
}

/** v2: indexa as feições de TODOS os .geojson com properties.shared_field_id
 *  (normalmente só o LIMITES.geojson). */
function indexarLimites(arqs: Map<string, Uint8Array>): { feicoes: FeicoesPorCampo; arquivos: string[] } {
  const dec = new TextDecoder();
  const feicoes: FeicoesPorCampo = new Map();
  const arquivos: string[] = [];
  for (const [caminho, bytes] of arqs) {
    if (!/\.geojson$/i.test(caminho)) continue;
    if (lerLimitesGeojson(dec.decode(bytes), feicoes).ok) arquivos.push(caminho);
  }
  if (!arquivos.length) throw new Error('O VINCULOS.json não traz os limites e nenhum .geojson tem feições com properties.shared_field_id (o LIMITES.geojson do pacote).');
  return { feicoes, arquivos };
}

function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const hoje = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');

export default function ManifestoPrecisionFarm({ vinculos, onFechar, onCriados }: {
  vinculos: VinculoLote[];
  onFechar: () => void;
  onCriados: () => void;
}) {
  const [ocupado, setOcupado] = useState<'' | 'lendo' | 'criando' | 'exportando'>('');
  const [erro, setErro] = useState<string | null>(null);
  const [origem, setOrigem] = useState<string | null>(null);
  const [formato, setFormato] = useState<FormatoManifesto | null>(null);
  const [casamentos, setCasamentos] = useState<Casamento[] | null>(null);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [criados, setCriados] = useState<Map<string, ResultadoManifesto> | null>(null);
  const [retorno, setRetorno] = useState<RetornoPF | null>(null);
  const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null);
  // O VINCULOS.json como veio (base do retorno — preserva tudo o que a PF mandou).
  const original = useRef<unknown>(null);

  async function escolher(lista: FileList | null) {
    const files = lista ? [...lista] : [];
    if (!files.length) return;
    setOcupado('lendo'); setErro(null); setCasamentos(null); setCriados(null); setRetorno(null);
    try {
      const arqs = await lerArquivos(files);
      const man = acharManifesto(arqs);
      const lido = lerManifestoPF(man.json);
      if (!lido.ok) throw new Error(lido.erro);
      const idx = lido.campos.some(c => c.limiteNoGeojson) ? indexarLimites(arqs) : null;
      const dec = new TextDecoder();
      const limites = await Promise.all(lido.campos.map(async c => {
        const bytes = c.arquivoLimite ? acharArquivo(arqs, c.arquivoLimite) : null;
        return limiteDoCampo(c, bytes ? dec.decode(bytes) : null, bytes && c.sha256 ? await sha256Hex(bytes) : null, idx?.feicoes);
      }));
      const fazendas = new Map(getFazendas().map(f => [f.id, f.clienteId]));
      const talhoes = getTalhoes().map(t => ({
        id: t.id, nome: t.nome, fazendaId: t.fazendaId ?? null, clienteId: fazendas.get(t.fazendaId) ?? null, bbox: t.bbox ?? null, geojson: t.geojson,
      }));
      const existentes = vinculos.map(v => ({
        talhaoId: v.talhaoId, sharedProducerId: v.sharedProducerId, sharedFarmId: v.sharedFarmId, sharedFieldId: v.sharedFieldId,
        status: v.status, fazendaId: v.fazendaId, clienteId: v.clienteId, pfLocalId: v.pfLocalId, temPublicacao: v.publicados.length > 0,
      }));
      // Recortes de polígono (limites de milhares de vértices): segundos no
      // pacote de 162 talhões — em fatias, devolvendo a vez ao navegador.
      setProgresso({ feitos: 0, total: lido.campos.length });
      const cas = await casarManifestoAos(lido.campos, limites, talhoes, existentes, { preMarcarDiferentes: lido.formato === 'v2' },
        (feitos, total) => setProgresso({ feitos, total }));
      original.current = man.json;
      setFormato(lido.formato);
      setOrigem(`${files.map(f => f.name).join(', ')} → ${man.caminho}${idx ? ` + ${idx.arquivos.join(', ')}` : ''} (formato ${lido.formato})`);
      setCasamentos(cas);
      setMarcados(new Set(cas.flatMap((c, k) => (c.preMarcado ? [k] : []))));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao ler os arquivos.');
    }
    setProgresso(null);
    setOcupado('');
  }

  const nomeFazenda = useMemo(() => new Map(getFazendas().map(f => [f.id, f.nome])), []);
  const nomeCliente = useMemo(() => new Map(getClientes().map(c => [c.id, c.nome])), []);
  const marcaveis = casamentos?.filter(c => c.podeCriar).length ?? 0;
  const divididos = useMemo(() => (casamentos ? resumoFazendas(casamentos).filter(g => g.dividido) : []), [casamentos]);

  // Prévia agrupada por cliente da PF → cliente(s) nosso(s) da geometria.
  const grupos = useMemo(() => {
    if (!casamentos) return [];
    const m = new Map<string, { titulo: string; itens: { c: Casamento; k: number }[]; clientes: Set<string> }>();
    casamentos.forEach((c, k) => {
      const chave = c.campo.localProducerId ?? '';
      const g = m.get(chave) ?? { titulo: c.campo.nomeClientePF ?? (chave ? `produtor PF ${chave}` : 'Manifesto'), itens: [], clientes: new Set<string>() };
      g.itens.push({ c, k });
      if (c.melhor?.clienteId && (c.podeCriar || c.situacao === 'ja-vinculado')) g.clientes.add(c.melhor.clienteId);
      m.set(chave, g);
    });
    return [...m.values()];
  }, [casamentos]);

  function marcar(k: number) {
    setMarcados(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }

  async function criar() {
    if (!casamentos) return;
    const itens = casamentos.flatMap((c, k) => (marcados.has(k) && c.podeCriar && c.melhor && c.ids ? [{
      talhaoId: c.melhor.talhaoId, pfLocalId: c.campo.pfLocalId, nomePF: c.campo.nome,
      sharedProducerId: c.ids.sharedProducerId, sharedFarmId: c.ids.sharedFarmId, sharedFieldId: c.campo.sharedFieldId,
      substituir: !!c.substitui,
    }] : []));
    if (!itens.length) return;
    const nSub = itens.filter(i => i.substituir).length;
    const nNova = casamentos.filter((c, k) => marcados.has(k) && c.ids?.papelFazenda === 'nova').length;
    if (!confirm(`Criar ${itens.length - nSub} vínculo(s) PENDENTE(S) com os UUIDs da PrecisionFarm`
      + `${nSub ? ` e substituir ${nSub} vínculo(s) pendente(s) sem ID PF` : ''}?`
      + `${nNova ? `\n\n${nNova} talhão(ões) ficam em fazendas que recebem um shared_farm_id NOVO (agrupamento da PF dividido) — vai no retorno.` : ''}`
      + '\n\nA PrecisionFarm só enxerga o talhão depois de confirmado.')) return;
    setOcupado('criando'); setErro(null);
    const r = await criarVinculosManifestoPF(itens);
    setOcupado('');
    if (!r.ok) { setErro(r.erro); return; }
    setCriados(new Map(r.resultados.map(x => [x.sharedFieldId, x])));
    setMarcados(new Set());
    setRetorno(null);
    onCriados();
  }

  async function exportarRetorno() {
    if (!casamentos || original.current == null) return;
    setOcupado('exportando'); setErro(null);
    try {
      // Lista FRESCA do servidor: a prop `vinculos` pode ainda ser a de antes
      // do "Criar" (o pai recarrega em paralelo) — o retorno sai do banco.
      const fresca = await loteGeralPF();
      if (!fresca.ok) throw new Error(`Não foi possível recarregar os vínculos: ${fresca.erro}`);
      const atuais = fresca.vinculos;
      const talhoesLocais = new Map(getTalhoes().map(t => [t.id, t.nome]));
      const nomeTalhao = new Map(atuais.map(v => [v.talhaoId, talhoesLocais.get(v.talhaoId) ?? v.naNuvem?.nome ?? v.talhaoId]));
      for (const c of casamentos) if (c.melhor && !nomeTalhao.has(c.melhor.talhaoId)) nomeTalhao.set(c.melhor.talhaoId, c.melhor.nome);
      const ret = montarRetornoPF(original.current, casamentos, atuais.map(v => ({
        talhaoId: v.talhaoId, fazendaId: v.fazendaId, clienteId: v.clienteId, sharedProducerId: v.sharedProducerId,
        sharedFarmId: v.sharedFarmId, sharedFieldId: v.sharedFieldId, status: v.status, publicados: v.publicados.length,
      })), { talhao: nomeTalhao, fazenda: nomeFazenda, cliente: nomeCliente });
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      zip.file('VINCULOS.json', JSON.stringify(ret.vinculosJson, null, 2));
      zip.file('SITUACAO_POR_TALHAO.csv', relatorioCsv(ret.linhas));
      baixar(await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }), `INVICTA_RETORNO_VINCULOS_${hoje()}.zip`);
      setRetorno(ret);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao montar o retorno.');
    }
    setOcupado('');
  }

  const nCriados = criados ? [...criados.values()].filter(x => x.ok).length : 0;
  const nomeFaz = (id: string | null | undefined) => (id ? nomeFazenda.get(id) ?? id : '—');

  return (
    <div className="mx-4 my-2 rounded p-3 space-y-2 text-[10px]" style={{ background: '#061525', border: '1px solid #1a3a6b', color: '#cbd5e1' }}>
      <div className="flex items-center gap-2">
        <FileUp size={12} style={{ color: '#7dd3fc' }} />
        <span className="font-bold uppercase tracking-wider flex-1">Importar manifesto de vínculos da PrecisionFarm</span>
        <button onClick={onFechar} title="Fechar" style={{ color: '#64748b' }}><X size={12} /></button>
      </div>
      <p style={{ color: '#94a3b8' }}>
        Escolha o <strong>.zip</strong> que a PrecisionFarm mandou (ou os arquivos soltos: VINCULOS.json + LIMITES.geojson, ou o .json do manifesto
        antigo com os .geojson). Cada talhão da PF é comparado por geometria com todos os nossos; o cliente nosso sai da geometria, nunca do nome.
        Pares 1:1 vêm marcados (até {LIMIAR_PAR_PCT}%; no pacote novo, acima também). Nada é gravado até você clicar em Criar.
      </p>
      <label className="inline-flex items-center gap-1 px-2 py-1 rounded font-bold cursor-pointer" style={{ background: 'var(--invicta-blue-mid)', color: '#fff', opacity: ocupado ? 0.5 : 1 }}>
        {ocupado === 'lendo' ? <Loader2 size={11} className="animate-spin" /> : <FileUp size={11} />} Escolher arquivos
        <input type="file" multiple accept=".zip,.json,.geojson,application/json,application/zip" className="hidden" disabled={!!ocupado}
          onChange={e => { void escolher(e.target.files); e.target.value = ''; }} />
      </label>
      {progresso && <div style={{ color: '#7dd3fc' }}>Comparando os limites com os nossos talhões… {progresso.feitos} de {progresso.total}</div>}
      {origem && <div style={{ color: '#64748b' }}>Lido: {origem}</div>}
      {erro && <div className="rounded px-2 py-1.5" style={{ background: '#450a0a', color: '#fca5a5' }}>{erro}</div>}
      {criados && (
        <div className="rounded px-2 py-1.5" style={{ background: '#052e16', color: '#86efac' }}>
          {nCriados} vínculo(s) criado(s)/substituído(s) como pendente(s){criados.size > nCriados ? `; ${criados.size - nCriados} recusado(s) — motivo na linha` : ''}. Confirme-os na tabela e depois exporte o retorno.
        </div>
      )}

      {casamentos && divididos.length > 0 && (
        <div className="rounded px-2 py-1.5 space-y-0.5" style={{ background: '#0b2340', color: '#bae6fd' }}>
          <div className="font-bold">Agrupamentos da PF divididos em mais de uma fazenda nossa ({divididos.length}):</div>
          {divididos.map(g => (
            <div key={g.sharedFarmIdPF}>
              {g.nomeClientePF ?? g.sharedFarmIdPF}: {g.fazendas.map(f => `${nomeFaz(f.fazendaId)} (${f.pares}, ${ROTULO_PAPEL[f.papel].txt})`).join(' · ')}
            </div>
          ))}
        </div>
      )}

      {casamentos && (
        <>
          <table className="w-full">
            <thead>
              <tr style={{ color: '#64748b' }}>
                <th className="px-1 py-1 text-left"></th>
                <th className="px-1 py-1 text-left font-semibold">Talhão na PF (ID)</th>
                <th className="px-1 py-1 text-left font-semibold">Nosso talhão</th>
                <th className="px-1 py-1 text-left font-semibold">Fazenda (shared_farm_id)</th>
                <th className="px-1 py-1 text-right font-semibold">Diferença</th>
                <th className="px-1 py-1 text-left font-semibold">Situação</th>
              </tr>
            </thead>
            {grupos.map((g, gi) => (
              <tbody key={gi}>
                {formato === 'v2' && (
                  <tr style={{ borderTop: '1px solid #1a3a6b', background: '#0a1d33' }}>
                    <td colSpan={6} className="px-1 py-1 font-bold" style={{ color: '#e2e8f0' }}>
                      {g.titulo} <span style={{ color: '#64748b' }}>(PF)</span> →{' '}
                      {g.clientes.size
                        ? [...g.clientes].map(id => nomeCliente.get(id) ?? id).join(', ')
                        : <span style={{ color: '#64748b' }}>sem cliente nosso</span>}
                      <span style={{ color: '#64748b' }}> · {g.itens.length} talhão(ões), {g.itens.filter(x => x.c.podeCriar).length} criável(is)</span>
                    </td>
                  </tr>
                )}
                {g.itens.map(({ c, k }) => {
                  const s = ROTULO_SITUACAO[c.situacao];
                  const feito = criados?.get(c.campo.sharedFieldId);
                  return (
                    <tr key={k} style={{ borderTop: '1px solid #0f2240' }}>
                      <td className="px-1 py-1">
                        <input type="checkbox" checked={marcados.has(k)} disabled={!c.podeCriar || !!feito || !!ocupado} onChange={() => marcar(k)} />
                      </td>
                      <td className="px-1 py-1"><span style={{ color: '#e2e8f0' }}>{c.campo.nome}</span> <code style={{ color: '#64748b' }}>({c.campo.pfLocalId || '—'})</code></td>
                      <td className="px-1 py-1">{c.melhor?.nome ?? <span style={{ color: '#64748b' }}>—</span>}</td>
                      <td className="px-1 py-1">
                        {nomeFaz(c.melhor?.fazendaId)}
                        {c.ids && <span title={`${ROTULO_PAPEL[c.ids.papelFazenda].dica} ${c.ids.sharedFarmId}`} style={{ color: c.ids.papelFazenda === 'nova' ? '#fbbf24' : '#64748b' }}> · {ROTULO_PAPEL[c.ids.papelFazenda].txt}</span>}
                      </td>
                      <td className="px-1 py-1 text-right">
                        {c.melhor?.difSimPct != null
                          ? <>{fmtDec(c.melhor.difSimPct, 2)}% <span style={{ color: '#64748b' }}>({fmtDec(c.melhor.difSimM2 ?? 0, 0)} m²)</span></>
                          : <span style={{ color: '#64748b' }}>—</span>}
                      </td>
                      <td className="px-1 py-1" style={{ maxWidth: 360 }}>
                        {feito
                          ? <span style={{ color: feito.ok ? '#86efac' : '#fca5a5' }}>{feito.ok ? (feito.substituido ? '✓ Substituído (pendente).' : '✓ Criado (pendente).') : `Recusado: ${feito.motivo ?? ''}`}</span>
                          : <><span className="font-bold" style={{ color: s.cor }}>{s.txt}{c.substitui ? ' · substitui pendente' : ''}</span>{c.motivo && <span style={{ color: '#94a3b8' }}> — {c.motivo}</span>}</>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={criar} disabled={!marcados.size || !!ocupado}
              className="px-2 py-1 rounded font-bold flex items-center gap-1" style={{ background: 'var(--invicta-green-dark)', color: '#fff', opacity: marcados.size && !ocupado ? 1 : 0.5 }}>
              {ocupado === 'criando' ? <Loader2 size={11} className="animate-spin" /> : <Link2 size={11} />} Criar {marcados.size} vínculo(s) pendente(s)
            </button>
            <button onClick={exportarRetorno} disabled={!!ocupado}
              title="VINCULOS.json preenchido (IDs da Invicta, fazendas divididas) + relatório por talhão, a partir dos vínculos que existem agora"
              className="px-2 py-1 rounded font-bold flex items-center gap-1" style={{ background: 'var(--invicta-blue-mid)', color: '#fff', opacity: ocupado ? 0.5 : 1 }}>
              {ocupado === 'exportando' ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />} Exportar retorno
            </button>
            <span style={{ color: '#64748b' }}>{marcaveis} de {casamentos.length} podem ser criados.</span>
          </div>
          {retorno && (
            <div className="rounded px-2 py-1.5" style={{ background: '#0b2340', color: '#bae6fd' }}>
              Retorno exportado: {SITUACOES_RETORNO.filter(s => retorno.contagem[s]).map(s => `${retorno.contagem[s]} ${s}`).join(' · ')}
              {retorno.gruposDivididos ? ` · ${retorno.gruposDivididos} agrupamento(s) dividido(s), ${retorno.fazendasNovas} fazenda(s) a mais` : ''}.
              {retorno.pendentes > 0 && <span style={{ color: '#fbbf24' }}> {retorno.pendentes} vínculo(s) ainda pendente(s) — a PF só os vê depois de confirmados; confirme e exporte de novo.</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
