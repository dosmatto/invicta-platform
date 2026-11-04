'use client';

// Biblioteca → PrecisionFarm → "Importar manifesto da PF" (owner/admin).
//
// ENTRADA: o ZIP inteiro que a PrecisionFarm manda (ex.: PRECISIONFARM_
// INVICTA_COMPLEMENTO_20261028.zip) — o manifesto aponta os limites por caminho
// DENTRO do zip (boundary_file = "limites_figueira/IGEFI01.geojson") e traz o
// SHA-256 de cada arquivo, então o pacote como veio é a fonte mais segura e o
// usuário não precisa descompactar. Também aceita o .json do manifesto + os
// .geojson soltos (seleção múltipla), casados pelo nome do arquivo.
//
// PRÉVIA (nada é gravado): cada talhão da PF × o nosso de maior sobreposição,
// com a diferença simétrica (manifestoPF.casarManifesto). Par 1:1 ≤ 5 % vem
// marcado; ambíguo, já vinculado, conflito de IDs e limite inválido não podem
// ser marcados. CRIAR (clique explícito + confirmação) → POST
// /api/precisionfarm/manifesto, que confere tudo de novo e cria PENDENTES com
// os UUIDs da PF e o ID PF (local_field_id).

import { useMemo, useState } from 'react';
import { FileUp, Link2, Loader2, X } from 'lucide-react';
import { getFazendas, getTalhoes } from '@/lib/store';
import { fmtDec } from '@/lib/formato';
import { criarVinculosManifestoPF, type ResultadoManifesto, type VinculoLote } from '@/lib/precisionfarm/cliente';
import {
  LIMIAR_PAR_PCT, acharArquivo, casarManifesto, lerManifestoPF, limiteDoCampo,
  type Casamento, type SituacaoCasamento,
} from '@/lib/precisionfarm/manifestoPF';

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

async function sha256Hex(bytes: Uint8Array): Promise<string | null> {
  try {
    const d = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
    return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
  } catch { return null; }   // sem WebCrypto (http sem TLS): segue sem conferir
}

/** Arquivos escolhidos → { caminho → bytes } (o zip é aberto aqui). */
async function lerArquivos(files: File[]): Promise<Map<string, Uint8Array>> {
  const total = files.reduce((s, f) => s + f.size, 0);
  if (total > MAX_BYTES_ARQUIVOS) throw new Error(`Arquivos grandes demais (${fmtDec(total / 1048576, 1)} MB; até 50 MB).`);
  const saida = new Map<string, Uint8Array>();
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) {
      const { default: JSZip } = await import('jszip');
      const zip = await JSZip.loadAsync(await f.arrayBuffer());
      for (const [caminho, e] of Object.entries(zip.files)) {
        if (!e.dir && /\.(geo)?json$/i.test(caminho) && !caminho.startsWith('__MACOSX/')) saida.set(caminho, await e.async('uint8array'));
      }
    } else {
      saida.set(f.name, new Uint8Array(await f.arrayBuffer()));
    }
  }
  return saida;
}

/** O manifesto entre os arquivos: o .json com "fields" (vários → o de nome *VINCULOS*). */
function acharManifesto(arqs: Map<string, Uint8Array>): { caminho: string; texto: string } {
  const dec = new TextDecoder();
  const candidatos: { caminho: string; texto: string }[] = [];
  for (const [caminho, bytes] of arqs) {
    if (!/\.json$/i.test(caminho) || /\.geojson$/i.test(caminho)) continue;
    const texto = dec.decode(bytes);
    try { if (Array.isArray((JSON.parse(texto) as { fields?: unknown }).fields)) candidatos.push({ caminho, texto }); } catch { /* não é o manifesto */ }
  }
  if (!candidatos.length) throw new Error('Nenhum manifesto entre os arquivos (um .json com a lista "fields", como o FIGUEIRA_VINCULOS_PROPOSTOS.json).');
  if (candidatos.length === 1) return candidatos[0];
  const porNome = candidatos.filter(c => /vincul/i.test(c.caminho));
  if (porNome.length === 1) return porNome[0];
  throw new Error(`Mais de um manifesto entre os arquivos: ${candidatos.map(c => c.caminho).join(', ')}. Escolha um só.`);
}

export default function ManifestoPrecisionFarm({ vinculos, onFechar, onCriados }: {
  vinculos: VinculoLote[];
  onFechar: () => void;
  onCriados: () => void;
}) {
  const [ocupado, setOcupado] = useState<'' | 'lendo' | 'criando'>('');
  const [erro, setErro] = useState<string | null>(null);
  const [origem, setOrigem] = useState<string | null>(null);
  const [casamentos, setCasamentos] = useState<Casamento[] | null>(null);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [criados, setCriados] = useState<Map<string, ResultadoManifesto> | null>(null);

  async function escolher(lista: FileList | null) {
    const files = lista ? [...lista] : [];
    if (!files.length) return;
    setOcupado('lendo'); setErro(null); setCasamentos(null); setCriados(null);
    try {
      const arqs = await lerArquivos(files);
      const man = acharManifesto(arqs);
      const lido = lerManifestoPF(man.texto);
      if (!lido.ok) throw new Error(lido.erro);
      const dec = new TextDecoder();
      const limites = await Promise.all(lido.campos.map(async c => {
        const bytes = c.arquivoLimite ? acharArquivo(arqs, c.arquivoLimite) : null;
        return limiteDoCampo(c, bytes ? dec.decode(bytes) : null, bytes && c.sha256 ? await sha256Hex(bytes) : null);
      }));
      const fazendas = new Map(getFazendas().map(f => [f.id, f.clienteId]));
      const talhoes = getTalhoes().map(t => ({
        id: t.id, nome: t.nome, fazendaId: t.fazendaId ?? null, clienteId: fazendas.get(t.fazendaId) ?? null, bbox: t.bbox ?? null, geojson: t.geojson,
      }));
      const existentes = vinculos.map(v => ({
        talhaoId: v.talhaoId, sharedProducerId: v.sharedProducerId, sharedFarmId: v.sharedFarmId, sharedFieldId: v.sharedFieldId,
        status: v.status, fazendaId: v.fazendaId, clienteId: v.clienteId,
      }));
      // Deixa o "Lendo…" aparecer: o casamento é síncrono (recortes de polígono).
      await new Promise(r => setTimeout(r, 30));
      const cas = casarManifesto(lido.campos, limites, talhoes, existentes);
      setOrigem(`${files.map(f => f.name).join(', ')} → ${man.caminho}`);
      setCasamentos(cas);
      setMarcados(new Set(cas.flatMap((c, k) => (c.preMarcado ? [k] : []))));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao ler os arquivos.');
    }
    setOcupado('');
  }

  const nomeFazenda = useMemo(() => new Map(getFazendas().map(f => [f.id, f.nome])), []);
  const marcaveis = casamentos?.filter(c => c.podeCriar).length ?? 0;

  function marcar(k: number) {
    setMarcados(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }

  async function criar() {
    if (!casamentos) return;
    const itens = casamentos.flatMap((c, k) => (marcados.has(k) && c.podeCriar && c.melhor ? [{
      talhaoId: c.melhor.talhaoId, pfLocalId: c.campo.pfLocalId, nomePF: c.campo.nome,
      sharedProducerId: c.campo.sharedProducerId, sharedFarmId: c.campo.sharedFarmId, sharedFieldId: c.campo.sharedFieldId,
    }] : []));
    if (!itens.length) return;
    if (!confirm(`Criar ${itens.length} vínculo(s) PENDENTE(S) com os UUIDs da PrecisionFarm?\n\nA PrecisionFarm só enxerga o talhão depois de confirmado.`)) return;
    setOcupado('criando'); setErro(null);
    const r = await criarVinculosManifestoPF(itens);
    setOcupado('');
    if (!r.ok) { setErro(r.erro); return; }
    setCriados(new Map(r.resultados.map(x => [x.sharedFieldId, x])));
    setMarcados(new Set());
    onCriados();
  }

  const nCriados = criados ? [...criados.values()].filter(x => x.ok).length : 0;

  return (
    <div className="mx-4 my-2 rounded p-3 space-y-2 text-[10px]" style={{ background: '#061525', border: '1px solid #1a3a6b', color: '#cbd5e1' }}>
      <div className="flex items-center gap-2">
        <FileUp size={12} style={{ color: '#7dd3fc' }} />
        <span className="font-bold uppercase tracking-wider flex-1">Importar manifesto de vínculos da PrecisionFarm</span>
        <button onClick={onFechar} title="Fechar" style={{ color: '#64748b' }}><X size={12} /></button>
      </div>
      <p style={{ color: '#94a3b8' }}>
        Escolha o <strong>.zip</strong> que a PrecisionFarm mandou (ou o .json do manifesto junto com os .geojson dos limites). Cada talhão da PF é
        comparado por geometria com os nossos; os pares 1:1 com diferença até {LIMIAR_PAR_PCT}% já vêm marcados. Nada é gravado até você clicar em Criar.
      </p>
      <label className="inline-flex items-center gap-1 px-2 py-1 rounded font-bold cursor-pointer" style={{ background: 'var(--invicta-blue-mid)', color: '#fff', opacity: ocupado ? 0.5 : 1 }}>
        {ocupado === 'lendo' ? <Loader2 size={11} className="animate-spin" /> : <FileUp size={11} />} Escolher arquivos
        <input type="file" multiple accept=".zip,.json,.geojson,application/json,application/zip" className="hidden" disabled={!!ocupado}
          onChange={e => { void escolher(e.target.files); e.target.value = ''; }} />
      </label>
      {origem && <div style={{ color: '#64748b' }}>Lido: {origem}</div>}
      {erro && <div className="rounded px-2 py-1.5" style={{ background: '#450a0a', color: '#fca5a5' }}>{erro}</div>}
      {criados && (
        <div className="rounded px-2 py-1.5" style={{ background: '#052e16', color: '#86efac' }}>
          {nCriados} vínculo(s) criado(s) como pendente(s){criados.size > nCriados ? `; ${criados.size - nCriados} recusado(s) — motivo na linha` : ''}. Confirme-os na tabela.
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
                <th className="px-1 py-1 text-left font-semibold">Fazenda</th>
                <th className="px-1 py-1 text-right font-semibold">Diferença</th>
                <th className="px-1 py-1 text-left font-semibold">Situação</th>
              </tr>
            </thead>
            <tbody>
              {casamentos.map((c, k) => {
                const s = ROTULO_SITUACAO[c.situacao];
                const feito = criados?.get(c.campo.sharedFieldId);
                return (
                  <tr key={k} style={{ borderTop: '1px solid #0f2240' }}>
                    <td className="px-1 py-1">
                      <input type="checkbox" checked={marcados.has(k)} disabled={!c.podeCriar || !!feito || !!ocupado} onChange={() => marcar(k)} />
                    </td>
                    <td className="px-1 py-1"><span style={{ color: '#e2e8f0' }}>{c.campo.nome}</span> <code style={{ color: '#64748b' }}>({c.campo.pfLocalId || '—'})</code></td>
                    <td className="px-1 py-1">{c.melhor?.nome ?? <span style={{ color: '#64748b' }}>—</span>}</td>
                    <td className="px-1 py-1">{c.melhor?.fazendaId ? nomeFazenda.get(c.melhor.fazendaId) ?? c.melhor.fazendaId : '—'}</td>
                    <td className="px-1 py-1 text-right">
                      {c.melhor?.difSimPct != null
                        ? <>{fmtDec(c.melhor.difSimPct, 2)}% <span style={{ color: '#64748b' }}>({fmtDec(c.melhor.difSimM2 ?? 0, 0)} m²)</span></>
                        : <span style={{ color: '#64748b' }}>—</span>}
                    </td>
                    <td className="px-1 py-1" style={{ maxWidth: 360 }}>
                      {feito
                        ? <span style={{ color: feito.ok ? '#86efac' : '#fca5a5' }}>{feito.ok ? '✓ Criado (pendente).' : `Recusado: ${feito.motivo ?? ''}`}</span>
                        : <><span className="font-bold" style={{ color: s.cor }}>{s.txt}</span>{c.motivo && <span style={{ color: '#94a3b8' }}> — {c.motivo}</span>}</>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex items-center gap-2">
            <button onClick={criar} disabled={!marcados.size || !!ocupado}
              className="px-2 py-1 rounded font-bold flex items-center gap-1" style={{ background: 'var(--invicta-green-dark)', color: '#fff', opacity: marcados.size && !ocupado ? 1 : 0.5 }}>
              {ocupado === 'criando' ? <Loader2 size={11} className="animate-spin" /> : <Link2 size={11} />} Criar {marcados.size} vínculo(s) pendente(s)
            </button>
            <span style={{ color: '#64748b' }}>{marcaveis} de {casamentos.length} podem ser criados.</span>
          </div>
        </>
      )}
    </div>
  );
}
