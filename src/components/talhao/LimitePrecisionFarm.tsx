'use client';

// Bloco "Limite da PrecisionFarm" dentro da seção Integração PrecisionFarm —
// owner/admin e SÓ com vínculo CONFIRMADO (Q3). O usuário considera os limites
// da PF mais precisos (Q4): aqui ele COMPARA sempre e, se quiser, ADOTA o da PF
// como novo limite do talhão.
//
//   Comparar → GET /api/precisionfarm/limite/{id} (inventário + revisão na PF,
//     sob demanda, sem tabela nova) → mapa com os dois contornos e as sobras +
//     números (lib/precisionfarm/compararLimite: plataforma e UTM plana).
//   Adotar → a MESMA regra do upload/editor (Q1, lib/trocaPoligono): com dados
//     no ciclo ativo, mostra o bloqueio e não grava; liberado, pede confirmação
//     e grava por updateTalhao (o versionamento geoVersoes/geoVersao é o
//     automático do store). O talhão guarda de onde veio (limiteOrigem).
// A comparação aparece mesmo quando o Adotar está bloqueado.

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, GitCompare, Loader2 } from 'lucide-react';
import { getTalhoes, updateTalhao, type LimiteOrigem, type Talhao } from '@/lib/store';
import { useApp } from '@/context/AppContext';
import { usuarioAtual } from '@/lib/auth';
import { areaHaGeo, areaHaGeoBruta } from '@/lib/areaGeo';
import { conflitosDe, talhaoParaAlvo, type Conflito } from '@/lib/overlap';
import { fmtDec } from '@/lib/formato';
import { verificarTrocaPoligono, mensagemBloqueioTroca, notaCicloVerificado, type VerificacaoTroca } from '@/lib/trocaPoligono';
import { caixaDoLimite, compararLimites, geometriaDoTalhao, type ComparacaoLimites } from '@/lib/precisionfarm/compararLimite';
import { limitePF, type LimitePFTela } from '@/lib/precisionfarm/cliente';
import MapaComparacaoLimite, { CORES_COMPARACAO } from './MapaComparacaoLimite';

const dataCurta = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

const ha4 = (v: number) => fmtDec(v, 4);
const m2 = (v: number) => fmtDec(v, v < 100 ? 1 : 0);

/** Origem do limite atual ainda vale? (a versão gravada pela adoção é a vigente). */
export function origemVigente(t: Talhao): LimiteOrigem | null {
  const o = t.limiteOrigem;
  return o && o.fonte === 'precisionfarm' && o.geoVersao === (t.geoVersao ?? 1) ? o : null;
}

function Legenda({ cor, txt, tracejado }: { cor: string; txt: string; tracejado?: boolean }) {
  return (
    <span className="flex items-center gap-1">
      <span style={{ width: 14, height: tracejado ? 0 : 8, borderTop: tracejado ? `2px dashed ${cor}` : undefined, background: tracejado ? undefined : cor, display: 'inline-block' }} />
      {txt}
    </span>
  );
}

export default function LimitePrecisionFarm({ talhao, onLimiteAdotado }: {
  talhao: Talhao;
  onLimiteAdotado?: (t: Talhao) => void;
}) {
  const { setUploadedGeo, setUploadedBbox } = useApp();
  // Depois de adotar, a seção passa a usar o talhão relido do store (o pai
  // pode demorar a repassar a prop nova).
  const [relido, setRelido] = useState<Talhao | null>(null);
  const t = relido ?? talhao;
  const [ocupado, setOcupado] = useState<'' | 'comparar' | 'adotar'>('');
  const [limite, setLimite] = useState<LimitePFTela | null>(null);
  const [verif, setVerif] = useState<VerificacaoTroca | null>(null);
  const [msg, setMsg] = useState<{ txt: string; erro: boolean } | null>(null);

  const origem = origemVigente(t);

  const geoInvicta = useMemo(() => geometriaDoTalhao(t.geojson), [t.geojson]);

  // Comparação: pura e síncrona (talhão ~ milhares de vértices: milissegundos).
  const cmp = useMemo((): { ok: true; c: ComparacaoLimites } | { ok: false; erro: string } | null => {
    if (!limite) return null;
    try { return { ok: true, c: compararLimites(limite.geometria, geoInvicta) }; }
    catch (e) { return { ok: false, erro: e instanceof Error ? e.message : 'Falha ao comparar os limites.' }; }
  }, [limite, geoInvicta]);

  // Sobreposição do limite da PF com os VIZINHOS da fazenda: só aviso (a PF
  // pode ter acertado a divisa e o vizinho é que está errado).
  const vizinhos = useMemo((): Conflito[] => {
    if (!limite) return [];
    const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: limite.geometria }] };
    const outros = getTalhoes(t.fazendaId).filter(x => x.id !== t.id).map(x => talhaoParaAlvo(x)).filter((a): a is NonNullable<typeof a> => !!a);
    try { return conflitosDe({ id: t.id, nome: t.nome, fc, bbox: caixaDoLimite(limite.geometria) }, [], outros); } catch { return []; }
  }, [limite, t.fazendaId, t.id, t.nome]);

  async function comparar() {
    setOcupado('comparar'); setMsg(null);
    const r = await limitePF(t.id);
    if (!r.ok) { setOcupado(''); setLimite(null); setVerif(null); setMsg({ txt: r.erro, erro: true }); return; }
    // A regra do bloqueio já aparece junto da comparação (o Adotar confere de novo no clique).
    const v = t.geojson ? await verificarTrocaPoligono(t.id) : null;
    setOcupado(''); setLimite(r.limite); setVerif(v);
  }

  async function adotar() {
    if (!limite) return;
    setOcupado('adotar'); setMsg(null);
    const atual = getTalhoes().find(x => x.id === t.id) ?? null;
    if (!atual) { setOcupado(''); setMsg({ txt: 'Talhão não encontrado neste aparelho.', erro: true }); return; }
    let v: VerificacaoTroca | null = null;
    if (atual.geojson) {
      v = await verificarTrocaPoligono(atual.id);
      setVerif(v);
      if (!v.permitido) { setOcupado(''); setMsg({ txt: mensagemBloqueioTroca(v), erro: true }); return; }
    }
    // Sem comparação (o limite daqui não pôde ser recortado), adotar continua
    // possível — é justamente o caso de trocar um limite ruim.
    const c = cmp?.ok ? cmp.c : null;
    const aviso = vizinhos.length ? `\n\nAtenção: o limite da PrecisionFarm sobrepõe ${vizinhos.map(x => `${x.nome} (${fmtDec(x.haSobrep * 10_000, 0)} m²)`).join(', ')}.` : '';
    const texto = `Adotar o limite da PrecisionFarm (rev. ${limite.revisao}, ${ha4(c?.pf.areaHa ?? areaHaGeo(limite.geometria))} ha) como novo limite de ${atual.nome}?\n\n`
      + (atual.geojson
        ? `O limite atual (v${atual.geoVersao ?? 1}, ${ha4(c?.invicta?.areaHa ?? atual.areaHa)} ha) fica arquivado no histórico do talhão.${c ? ` Diferença: ${m2(c.difSimM2)} m².` : ''}`
        : 'O talhão ainda não tem limite.') + aviso;
    if (!confirm(texto)) { setOcupado(''); return; }

    const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { nome: atual.nome }, geometry: limite.geometria }] };
    const geojson = JSON.stringify(fc);
    const bbox = caixaDoLimite(limite.geometria);
    // A mesma conta de comVersaoDeLimite (store): geojson diferente sobre um
    // limite existente = versão nova.
    const versaoNova = atual.geojson && atual.geojson !== geojson ? (atual.geoVersao ?? 1) + 1 : (atual.geoVersao ?? 1);
    const limiteOrigem: LimiteOrigem = {
      fonte: 'precisionfarm', resourceId: limite.resourceId, revisao: limite.revisao,
      boundaryRevision: limite.boundaryRevision, dataPF: limite.data, checksum: limite.checksum,
      adotadoEm: new Date().toISOString(), adotadoPor: usuarioAtual()?.email ?? null, geoVersao: versaoNova,
    };
    const areaHa = areaHaGeo(fc);
    updateTalhao(atual.id, { geojson, bbox, areaHa, areaHaSemHoles: areaHaGeoBruta(fc), status: 'ativo', limiteOrigem });
    const novo = getTalhoes().find(x => x.id === atual.id) ?? null;
    setOcupado('');
    if (!novo) return;
    setRelido(novo);
    setUploadedGeo(fc); setUploadedBbox(bbox);
    setMsg({
      txt: v ? notaCicloVerificado(v, versaoNova) : `Limite da PrecisionFarm adotado (versão ${versaoNova}).`,
      erro: false,
    });
    onLimiteAdotado?.(novo);
  }

  const c = cmp?.ok ? cmp.c : null;
  const bloqueado = !!verif && !verif.permitido;
  const btn = (cor: string) => ({ background: cor, color: '#fff' });

  // "Limite atual = PF rev N" × "difere da PF".
  let situacao: { txt: string; cor: string } | null = null;
  if (c && limite) {
    if (c.identicos) {
      situacao = origem
        ? { txt: `Limite atual = PrecisionFarm rev. ${origem.revisao}${origem.revisao !== limite.revisao ? ` (a PF está na rev. ${limite.revisao}, com a mesma geometria)` : ''}.`, cor: '#4ade80' }
        : { txt: `Limite atual igual ao da PrecisionFarm rev. ${limite.revisao} (não foi adotado por aqui).`, cor: '#4ade80' };
    } else if (!c.invicta) {
      situacao = { txt: 'O talhão ainda não tem limite — o da PrecisionFarm pode ser adotado.', cor: '#fbbf24' };
    } else {
      situacao = { txt: `Difere da PrecisionFarm rev. ${limite.revisao}: ${m2(c.difSimM2)} m² de diferença${c.difSimPct != null ? ` (${fmtDec(c.difSimPct, 3)}%)` : ''}.`, cor: '#fbbf24' };
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Limite da PrecisionFarm</div>
      <div className="text-[10px]" style={{ color: '#94a3b8' }}>
        {origem
          ? <>Limite atual (v{t.geoVersao ?? 1}) = PrecisionFarm rev. {origem.revisao} · adotado em {dataCurta(origem.adotadoEm)} por {origem.adotadoPor ?? '—'}.</>
          : <>Limite atual: v{t.geoVersao ?? 1} da Invicta{t.geojson ? '' : ' (sem limite)'}.</>}
      </div>

      <button onClick={comparar} disabled={!!ocupado}
        className="px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1" style={btn('var(--invicta-blue-mid)')}>
        {ocupado === 'comparar' ? <Loader2 size={11} className="animate-spin" /> : <GitCompare size={11} />} Comparar com o limite da PrecisionFarm
      </button>

      {msg && (
        <div className="rounded px-2 py-1.5 text-[10px]" style={{ background: msg.erro ? '#450a0a' : '#052e16', color: msg.erro ? '#fca5a5' : '#86efac' }}>{msg.txt}</div>
      )}
      {cmp && !cmp.ok && <div className="rounded px-2 py-1.5 text-[10px]" style={{ background: '#450a0a', color: '#fca5a5' }}>{cmp.erro}</div>}

      {limite && (
        <div className="space-y-1.5">
          <div className="text-[10px]" style={{ color: '#cbd5e1' }}>
            PrecisionFarm: <strong>{limite.nome ?? 'limite'}</strong> · rev. {limite.revisao} · boundary_revision {limite.boundaryRevision} (numeração da PF) · publicado em {dataCurta(limite.data)}
            {limite.checksum && <> · <code title={limite.checksum}>{limite.checksum.slice(0, 12)}…</code></>}
            {limite.conferencia === 'basica' && <span style={{ color: '#fbbf24' }}> · sem evento no inventário: checksum não conferido</span>}
            {limite.itensNoInventario > 1 && <span style={{ color: '#fbbf24' }}> · o inventário tem {limite.itensNoInventario} limites; vale o mais recente</span>}
          </div>
          {c && situacao && (
            <div className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: situacao.cor }}>
              {c.identicos ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />} {situacao.txt}
            </div>
          )}

          <MapaComparacaoLimite pf={limite.geometria} invicta={geoInvicta} soPf={c?.soPf ?? null} soInvicta={c?.soInvicta ?? null} />
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[9px]" style={{ color: '#94a3b8' }}>
            <Legenda cor={CORES_COMPARACAO.invicta} txt="Invicta (atual)" />
            <Legenda cor={CORES_COMPARACAO.pf} txt="PrecisionFarm" tracejado />
            <Legenda cor={CORES_COMPARACAO.soPf} txt="Só na PrecisionFarm" />
            <Legenda cor={CORES_COMPARACAO.soInvicta} txt="Só na Invicta" />
          </div>

          {c && <table className="w-full text-[10px]" style={{ color: '#cbd5e1' }}>
            <thead>
              <tr style={{ color: '#64748b' }}>
                <th className="text-left font-normal"></th>
                <th className="text-right font-normal">PrecisionFarm</th>
                <th className="text-right font-normal">Invicta</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Área (plataforma), ha</td><td className="text-right">{ha4(c.pf.areaHa)}</td><td className="text-right">{c.invicta ? ha4(c.invicta.areaHa) : '—'}</td></tr>
              <tr><td>Área UTM {c.fuso} plana, ha</td><td className="text-right">{ha4(c.pf.areaUtmHa)}</td><td className="text-right">{c.invicta ? ha4(c.invicta.areaUtmHa) : '—'}</td></tr>
              <tr><td>Partes / furos</td><td className="text-right">{c.pf.partes} / {c.pf.furos}</td><td className="text-right">{c.invicta ? `${c.invicta.partes} / ${c.invicta.furos}` : '—'}</td></tr>
              <tr><td>Vértices</td><td className="text-right">{c.pf.vertices.toLocaleString('pt-BR')}</td><td className="text-right">{c.invicta ? c.invicta.vertices.toLocaleString('pt-BR') : '—'}</td></tr>
            </tbody>
          </table>}
          {c?.invicta && (
            <table className="w-full text-[10px]" style={{ color: '#cbd5e1' }}>
              <thead>
                <tr style={{ color: '#64748b' }}>
                  <th className="text-left font-normal">Diferença</th>
                  <th className="text-right font-normal">plataforma, m²</th>
                  <th className="text-right font-normal">UTM {c.fuso}, m²</th>
                </tr>
              </thead>
              <tbody>
                <tr><td style={{ color: CORES_COMPARACAO.soPf }}>Só na PrecisionFarm</td><td className="text-right">{m2(c.soPfM2)}</td><td className="text-right">{m2(c.soPfUtmM2)}</td></tr>
                <tr><td style={{ color: CORES_COMPARACAO.soInvicta }}>Só na Invicta</td><td className="text-right">{m2(c.soInvictaM2)}</td><td className="text-right">{m2(c.soInvictaUtmM2)}</td></tr>
                <tr className="font-semibold"><td>Diferença simétrica</td><td className="text-right">{m2(c.difSimM2)}{c.difSimPct != null ? ` (${fmtDec(c.difSimPct, 3)}%)` : ''}</td><td className="text-right">{m2(c.difSimUtmM2)}</td></tr>
              </tbody>
            </table>
          )}
          {vizinhos.length > 0 && (
            <div className="text-[10px]" style={{ color: '#fbbf24' }}>
              O limite da PrecisionFarm sobrepõe {vizinhos.map(x => `${x.nome} (${fmtDec(x.haSobrep * 10_000, 0)} m²)`).join(', ')}.
            </div>
          )}

          {bloqueado && verif && (
            <div className="rounded px-2 py-1.5 text-[10px]" style={{ background: '#450a0a', color: '#fca5a5' }}>{mensagemBloqueioTroca(verif)}</div>
          )}
          {!(c?.identicos && origem && origem.revisao === limite.revisao) && (
            <button onClick={adotar} disabled={!!ocupado || bloqueado}
              title={bloqueado ? 'O ciclo ativo já tem dados neste talhão.' : 'Gravar o limite da PrecisionFarm como novo limite do talhão.'}
              className="px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1"
              style={{ ...btn('var(--invicta-green-dark)'), opacity: bloqueado ? 0.5 : 1 }}>
              {ocupado === 'adotar' ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />} Adotar limite da PrecisionFarm
            </button>
          )}
        </div>
      )}
    </div>
  );
}
