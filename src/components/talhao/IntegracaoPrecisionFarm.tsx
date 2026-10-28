'use client';

// Seção "Integração PrecisionFarm" do talhão — SÓ owner/admin (Q9).
//
// O que faz (fase 1, docs/integracao-precisionfarm.md):
//   • VÍNCULO: gera os três UUIDs compartilhados (produtor e fazenda
//     reaproveitados de vínculos já feitos), guarda o ID do talhão do lado da
//     PrecisionFarm e confirma/suspende. A chave da PF só enxerga CONFIRMADOS.
//   • PUBLICAR: zoneamento padrão e colheita OFICIAL (por safra/época) viram
//     revisões imutáveis. Só o publicado aparece para a PF; editar aqui não
//     manda nada sozinho.
//   • LIMITE DA PF (vínculo confirmado): comparar com o limite publicado pela
//     PrecisionFarm e, se o ciclo ativo permitir, adotá-lo (LimitePrecisionFarm).
// A rota do servidor confere a sessão e o papel de novo — esconder a seção é
// só conforto.

import { useCallback, useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Link2, Loader2, Send, ShieldCheck, PauseCircle } from 'lucide-react';
import { getMapasProdutividade, getZoneamentosMeap, type Talhao } from '@/lib/store';
import { ehAdmin } from '@/lib/empresa';
import {
  acaoVinculoPF, estadoPF, publicarColheitaPF, publicarZonasPF, type PublicadoPF, type VinculoPF,
} from '@/lib/precisionfarm/cliente';
import LimitePrecisionFarm from './LimitePrecisionFarm';

const ROTULO_EPOCA: Record<string, string> = { verao: 'Verão', safrinha: 'Safrinha', inverno: 'Inverno' };
const ROTULO_PERIODO: Record<string, string> = { main: 'Verão (main)', second: 'Safrinha (second)', winter: 'Inverno (winter)' };
const ROTULO_STATUS: Record<VinculoPF['status'], { txt: string; cor: string }> = {
  pendente: { txt: 'Pendente', cor: '#fbbf24' },
  confirmado: { txt: 'Confirmado', cor: '#4ade80' },
  suspenso: { txt: 'Suspenso', cor: '#f87171' },
};

const dataCurta = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

function LinhaId({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px]">
      <span className="w-16 shrink-0" style={{ color: '#64748b' }}>{rotulo}</span>
      <code className="flex-1 truncate" style={{ color: '#cbd5e1' }} title={valor}>{valor}</code>
      <button onClick={() => { void navigator.clipboard?.writeText(valor); }} title="Copiar" style={{ color: '#64748b' }}>
        <Copy size={11} />
      </button>
    </div>
  );
}

// `key` pelo talhão: trocar de talhão remonta a seção com o estado zerado (sem
// ressincronizar estado dentro de efeito).
// `onLimiteAdotado`: a tela que contém a seção relê o talhão depois que o
// limite da PrecisionFarm foi adotado (área, versão do limite, mapa).
export default function IntegracaoPrecisionFarm({ talhao, onLimiteAdotado }: { talhao: Talhao | null; onLimiteAdotado?: (t: Talhao) => void }) {
  if (!talhao || !ehAdmin()) return null;
  return <SecaoPF key={talhao.id} talhao={talhao} onLimiteAdotado={onLimiteAdotado} />;
}

function SecaoPF({ talhao, onLimiteAdotado }: { talhao: Talhao; onLimiteAdotado?: (t: Talhao) => void }) {
  const [aberto, setAberto] = useState(false);
  const [carregado, setCarregado] = useState(false);
  const [ocupado, setOcupado] = useState('');
  const [vinculo, setVinculo] = useState<VinculoPF | null>(null);
  const [publicados, setPublicados] = useState<PublicadoPF[]>([]);
  const [pfId, setPfId] = useState('');
  const [msg, setMsg] = useState<{ txt: string; erro: boolean } | null>(null);
  const talhaoId = talhao.id;
  const carregando = aberto && !carregado;

  // Só muda estado DEPOIS da resposta (nada síncrono dentro do efeito).
  const recarregar = useCallback(async () => {
    const r = await estadoPF(talhaoId);
    setCarregado(true);
    if (!r.ok) { setMsg({ txt: r.erro, erro: true }); return; }
    setVinculo(r.vinculo);
    setPfId(r.vinculo?.pfLocalId ?? '');
    setPublicados(r.publicados);
  }, [talhaoId]);

  // Carrega ao ABRIR (evento do clique, não efeito): fechado, não custa rede.
  function alternar() {
    const abrir = !aberto;
    setAberto(abrir);
    if (abrir && !carregado) void recarregar();
  }

  async function vincular(acao: 'criar' | 'salvar' | 'confirmar' | 'suspender') {
    if (acao === 'suspender' && !confirm('Suspender o vínculo? A PrecisionFarm deixa de enxergar este talhão até ele ser confirmado de novo.')) return;
    setOcupado(acao); setMsg(null);
    const r = await acaoVinculoPF(talhaoId, acao, pfId.trim() || undefined);
    setOcupado('');
    if (!r.ok) { setMsg({ txt: r.erro, erro: true }); return; }
    setVinculo(r.vinculo);
    setPfId(r.vinculo.pfLocalId ?? '');
    setMsg({ txt: acao === 'criar' ? 'Identificadores gerados. Envie-os à PrecisionFarm e confirme quando eles cadastrarem.' : 'Vínculo atualizado.', erro: false });
  }

  async function publicar(chave: string, fn: () => ReturnType<typeof publicarZonasPF>) {
    setOcupado(chave); setMsg(null);
    const r = await fn();
    setOcupado('');
    if (!r.ok) { setMsg({ txt: r.erro, erro: true }); return; }
    setMsg({ txt: r.criada ? `Publicado: revisão ${r.revisao} (${r.checksum.slice(0, 10)}…).` : (r.mensagem ?? 'Nada mudou.'), erro: false });
    void recarregar();
  }

  // Só com a seção aberta: getZoneamentosMeap pode reparar "dois padrões" e
  // gravar — não precisa rodar a cada render do painel fechado.
  const zonPadrao = aberto ? (getZoneamentosMeap(talhao.id).find(z => z.padrao) ?? null) : null;
  const oficiais = aberto ? getMapasProdutividade(talhao.id).filter(m => m.oficial) : [];
  const geoVersao = talhao.geoVersao ?? 1;
  const podePublicar = !!vinculo && vinculo.status !== 'suspenso';
  const st = vinculo ? ROTULO_STATUS[vinculo.status] : null;
  const btn = (cor: string) => ({ background: cor, color: '#fff' });

  return (
    <div>
      <button onClick={alternar} className="w-full px-4 py-2 flex items-center gap-2 text-left"
        style={{ background: '#0a1929', borderBottom: '1px solid #0f2240' }}>
        {aberto ? <ChevronDown size={12} style={{ color: '#64748b' }} /> : <ChevronRight size={12} style={{ color: '#64748b' }} />}
        <Link2 size={12} style={{ color: '#7dd3fc' }} />
        <span className="text-[10px] font-bold uppercase tracking-wider flex-1" style={{ color: '#cbd5e1' }}>Integração PrecisionFarm</span>
        {st && <span className="text-[9px] font-bold" style={{ color: st.cor }}>{st.txt}</span>}
      </button>

      {aberto && (
        <div className="px-4 py-3 space-y-3 text-xs" style={{ color: '#cbd5e1' }}>
          {carregando && <div className="flex items-center gap-1.5 text-[10px]" style={{ color: '#64748b' }}><Loader2 size={11} className="animate-spin" /> Carregando…</div>}

          {msg && (
            <div className="rounded px-2 py-1.5 text-[10px]" style={{ background: msg.erro ? '#450a0a' : '#052e16', color: msg.erro ? '#fca5a5' : '#86efac' }}>{msg.txt}</div>
          )}

          {/* ── Vínculo ── */}
          {!carregando && !vinculo && (
            <div className="space-y-2">
              <p className="text-[10px]" style={{ color: '#94a3b8' }}>
                Este talhão não está vinculado. Gerar os identificadores cria os UUIDs compartilhados (produtor e fazenda são
                reaproveitados se outro talhão do mesmo cliente/fazenda já tiver vínculo).
              </p>
              <button onClick={() => vincular('criar')} disabled={!!ocupado}
                className="px-3 py-1.5 rounded text-[11px] font-bold flex items-center gap-1" style={btn('var(--invicta-blue-mid)')}>
                {ocupado === 'criar' ? <Loader2 size={11} className="animate-spin" /> : <Link2 size={11} />} Gerar identificadores
              </button>
            </div>
          )}

          {vinculo && (
            <div className="space-y-1.5 rounded p-2" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
              <LinhaId rotulo="Produtor" valor={vinculo.sharedProducerId} />
              <LinhaId rotulo="Fazenda" valor={vinculo.sharedFarmId} />
              <LinhaId rotulo="Talhão" valor={vinculo.sharedFieldId} />
              <div className="flex items-center gap-1.5 pt-1">
                <input value={pfId} onChange={e => setPfId(e.target.value)} placeholder="ID do talhão na PrecisionFarm"
                  disabled={vinculo.status === 'confirmado'}
                  className="flex-1 rounded px-2 py-1 text-[11px] outline-none" style={{ background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' }} />
                {vinculo.status !== 'confirmado' && (
                  <button onClick={() => vincular('salvar')} disabled={!!ocupado} className="px-2 py-1 rounded text-[10px] font-bold" style={btn('#1e3a5f')}>Salvar</button>
                )}
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                {vinculo.status !== 'confirmado' && (
                  <button onClick={() => vincular('confirmar')} disabled={!!ocupado || !pfId.trim()}
                    title={!pfId.trim() ? 'Informe o ID da PrecisionFarm' : 'Liberar este talhão para a chave da PrecisionFarm'}
                    className="px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1" style={{ ...btn('var(--invicta-green-dark)'), opacity: pfId.trim() ? 1 : 0.5 }}>
                    <ShieldCheck size={11} /> Confirmar vínculo
                  </button>
                )}
                {vinculo.status !== 'suspenso' && (
                  <button onClick={() => vincular('suspender')} disabled={!!ocupado}
                    className="px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1" style={btn('#7f1d1d')}>
                    <PauseCircle size={11} /> Suspender
                  </button>
                )}
              </div>
              <p className="text-[9px]" style={{ color: '#64748b' }}>
                {vinculo.status === 'confirmado'
                  ? `Confirmado por ${vinculo.confirmadoPor ?? '—'} em ${dataCurta(vinculo.confirmadoEm)}.`
                  : vinculo.status === 'suspenso'
                    ? `Suspenso por ${vinculo.suspensoPor ?? '—'} em ${dataCurta(vinculo.suspensoEm)}. A PrecisionFarm não enxerga este talhão.`
                    : 'Pendente: a PrecisionFarm só enxerga o talhão depois de confirmado.'}
              </p>
            </div>
          )}

          {/* ── Limite publicado pela PF (comparar / adotar) — só confirmado ── */}
          {vinculo?.status === 'confirmado' && <LimitePrecisionFarm talhao={talhao} onLimiteAdotado={onLimiteAdotado} />}

          {/* ── Publicar ── */}
          {vinculo && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Publicar</div>
              <div className="flex items-center gap-2">
                <span className="flex-1 text-[10px] truncate" title={zonPadrao?.nome}>
                  Zoneamento padrão: {zonPadrao ? zonPadrao.nome : <em style={{ color: '#64748b' }}>nenhum</em>}
                </span>
                <button disabled={!podePublicar || !zonPadrao || !!ocupado}
                  onClick={() => publicar('zonas', () => publicarZonasPF(talhao.id, zonPadrao?.id ?? null, geoVersao))}
                  className="px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1"
                  style={{ ...btn('var(--invicta-blue-mid)'), opacity: podePublicar && zonPadrao ? 1 : 0.5 }}>
                  {ocupado === 'zonas' ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />} Publicar zoneamento
                </button>
              </div>
              {oficiais.length === 0 && <div className="text-[10px]" style={{ color: '#64748b' }}>Nenhum mapa de colheita oficial neste talhão.</div>}
              {oficiais.map(m => {
                const semEpoca = !ROTULO_EPOCA[m.epoca];
                const chave = `colheita:${m.id}`;
                return (
                  <div key={m.id} className="flex items-center gap-2">
                    <span className="flex-1 text-[10px] truncate">
                      Colheita oficial {m.safra} · {ROTULO_EPOCA[m.epoca] ?? <em style={{ color: '#fbbf24' }}>sem época</em>} · {m.cultura} v{m.versao}
                    </span>
                    <button disabled={!podePublicar || semEpoca || !!ocupado}
                      title={semEpoca ? 'Defina a época de cultivo do mapa (Verão, Safrinha ou Inverno) antes de publicar.' : undefined}
                      onClick={() => publicar(chave, () => publicarColheitaPF(talhao.id, m.id, geoVersao))}
                      className="px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1"
                      style={{ ...btn('var(--invicta-blue-mid)'), opacity: podePublicar && !semEpoca ? 1 : 0.5 }}>
                      {ocupado === chave ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />} Publicar colheita
                    </button>
                  </div>
                );
              })}
              {vinculo.status === 'suspenso' && <div className="text-[10px]" style={{ color: '#fca5a5' }}>Vínculo suspenso: confirme de novo para publicar.</div>}
            </div>
          )}

          {/* ── Publicado ── */}
          {vinculo && (
            <div className="space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Publicado para a PrecisionFarm</div>
              {publicados.length === 0 && <div className="text-[10px]" style={{ color: '#64748b' }}>Nada publicado ainda.</div>}
              {publicados.map(p => (
                <div key={p.resourceId} className="rounded px-2 py-1 text-[10px]" style={{ background: '#061525', border: '1px solid #0f2240' }}>
                  <div className="flex items-center gap-2">
                    <span className="font-bold" style={{ color: '#e2e8f0' }}>
                      {p.tipo === 'management_zones' ? 'Zonas de manejo' : `Colheita ${p.season ?? ''} · ${ROTULO_PERIODO[p.seasonPeriod ?? ''] ?? p.seasonPeriod ?? ''}`}
                    </span>
                    <span className="ml-auto" style={{ color: '#7dd3fc' }}>rev. {p.revisao}</span>
                  </div>
                  <div style={{ color: '#64748b' }}>
                    {dataCurta(p.publicadoEm)} · {p.publicadoPor ?? '—'} · <code title={p.checksum}>{p.checksum.slice(0, 12)}…</code>
                    {p.tamanhoBytes ? ` · ${(p.tamanhoBytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} MB` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
