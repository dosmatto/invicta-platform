'use client';

// REGISTROS DE CAMPO — o que o operador anotou em cada ponto durante a coleta:
// horário, quem coletou, distância do ponto planejado, condições
// (umidade/compactação/problemas), a ANOTAÇÃO livre e as FOTOS.
//
// Esses dados eram gravados no aparelho e sincronizados na nuvem desde a
// primeira coleta, mas NENHUMA tela da plataforma os lia de volta — ficavam
// invisíveis. É o que salva a interpretação de um laudo fora da curva: "ponto 14
// deu P altíssimo" → a anotação diz "formigueiro / resto de adubo".

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { getTalhoes, getFazendas, getClientes, getGrades, type GradeAmostragem } from '@/lib/store';
import {
  getColetas, pullColetas, urlsFotosColetaNuvem, ROTULO_STATUS, COR_STATUS,
  type RegistroColeta,
} from '@/lib/coleta';
import { gerarCadernoCampo, type PontoCampo } from '@/lib/relatorioCampo';
import { fmtMax2 as fmt } from '@/lib/formato';
import { nomeExport, periodoParaNome } from '@/lib/nomeExport';
import {
  RefreshCw, Loader2, FileText, Table2, Camera, MapPin, User, Clock,
  ChevronDown, ChevronRight, StickyNote, AlertTriangle,
} from 'lucide-react';

const dataHoraBR = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

// Um ponto entra na lista se o operador REGISTROU algo nele. Ponto ainda
// pendente não é registro de campo — é tarefa em aberto, e polui a leitura.
const temRegistro = (c: RegistroColeta) => c.status !== 'pendente';
const temAnotacao = (c: RegistroColeta) => !!(c.obs || c.problemas || c.umidade || c.compactacao);

export function RegistrosCampoSection({ safraNome }: { safraNome?: string } = {}) {
  const { nav } = useApp();
  const safra = safraNome ?? '';

  const [gradeId, setGradeId] = useState('');
  const [coletas, setColetas] = useState<RegistroColeta[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [aberto, setAberto] = useState<Set<string>>(new Set());
  const [fotos, setFotos] = useState<Record<string, string[] | 'carregando'>>({});
  const [gerando, setGerando] = useState<'' | 'pdf' | 'xlsx'>('');
  const [progresso, setProgresso] = useState('');

  // Grades do talhão no ciclo — DERIVADAS, não estado: sem isso, trocar de
  // talhão deixava a lista antiga na tela por um render.
  const grades = useMemo<GradeAmostragem[]>(
    () => (nav.talhaoId ? getGrades(nav.talhaoId, safra || undefined) : []),
    [nav.talhaoId, safra]);
  // A escolha do usuário só vale enquanto a grade existir na lista atual.
  const gradeAtual = grades.some(g => g.id === gradeId) ? gradeId : (grades[0]?.id ?? '');

  const carregar = useCallback(async (id: string, daNuvem: boolean) => {
    if (!id) { setColetas([]); return; }
    setAviso('');
    if (daNuvem) {
      setCarregando(true);
      try { await pullColetas(id); }
      catch (e) { setAviso(`Não deu para buscar da nuvem: ${e instanceof Error ? e.message : String(e)}`); }
      finally { setCarregando(false); }
    }
    setColetas(getColetas(id).filter(temRegistro).sort((a, b) => a.ordem - b.ordem));
  }, []);

  // Busca da nuvem ao abrir/trocar de grade: a coleta aconteceu em OUTRO
  // aparelho (o celular do operador), então o local quase nunca tem os dados.
  // Em microtarefa (depois do commit) e com guarda: trocar de grade rápido não
  // deixa a resposta da grade anterior sobrescrever a tela.
  useEffect(() => {
    let vivo = true;
    queueMicrotask(() => { if (vivo) void carregar(gradeAtual, true); });
    return () => { vivo = false; };
  }, [gradeAtual, carregar]);

  const resumo = useMemo(() => ({
    total: coletas.length,
    coletados: coletas.filter(c => c.status === 'coletado').length,
    pulados: coletas.filter(c => c.status === 'pulado').length,
    comAnotacao: coletas.filter(temAnotacao).length,
    comFoto: coletas.filter(c => (c.fotos ?? 0) > 0).length,
  }), [coletas]);

  async function alternar(c: RegistroColeta) {
    const novo = new Set(aberto);
    if (novo.has(c.id)) { novo.delete(c.id); setAberto(novo); return; }
    novo.add(c.id); setAberto(novo);
    if (fotos[c.id] === undefined && (c.fotos ?? 0) > 0) {
      setFotos(f => ({ ...f, [c.id]: 'carregando' }));
      const urls = await urlsFotosColetaNuvem(c.id).catch(() => [] as string[]);
      setFotos(f => ({ ...f, [c.id]: urls }));
    }
  }

  function contexto() {
    const t = getTalhoes().find(x => x.id === nav.talhaoId);
    const f = getFazendas().find(x => x.id === t?.fazendaId);
    const c = getClientes().find(x => x.id === f?.clienteId);
    const g = grades.find(x => x.id === gradeAtual);
    return {
      talhao: t?.nome ?? '', fazenda: f?.nome ?? '', produtor: c?.nome ?? '',
      grade: g?.nome ?? '',
      logoClienteUrl: (c as { logoUrl?: string } | undefined)?.logoUrl ?? null,
      // só para o nome do arquivo (SA03_CAMPO_2026_EP01)
      siglaFazenda: f?.sigla ?? null, ano: g?.ano ?? null, epoca: g?.epoca ?? null,
    };
  }

  async function exportarPdf() {
    setGerando('pdf');
    try {
      const ctx = contexto();
      // As fotos só existem na nuvem; buscar as URLs de todos os pontos AQUI (e
      // não dentro do gerador) mantém o relatório puro e deixa o progresso visível.
      const pontos: PontoCampo[] = [];
      for (let i = 0; i < coletas.length; i++) {
        const c = coletas[i];
        setProgresso(`Buscando fotos… ${i + 1}/${coletas.length}`);
        const urls = (c.fotos ?? 0) > 0
          ? (fotos[c.id] && fotos[c.id] !== 'carregando'
            ? fotos[c.id] as string[]
            : await urlsFotosColetaNuvem(c.id).catch(() => []))
          : [];
        pontos.push({
          codigo: c.codigo, status: ROTULO_STATUS[c.status], horario: c.horario, operador: c.operador,
          distanciaAlvoM: c.distanciaAlvoM, precisaoM: c.precisaoM, profundidades: c.profundidades,
          umidade: c.umidade, compactacao: c.compactacao, problemas: c.problemas, obs: c.obs,
          fotos: urls,
        });
      }
      setProgresso('Montando o PDF…');
      await gerarCadernoCampo({ ...ctx, ciclo: safra, pontos });
    } catch (e) {
      setAviso(`Falha ao gerar o PDF: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setGerando(''); setProgresso(''); }
  }

  async function exportarXlsx() {
    setGerando('xlsx');
    try {
      const XLSX = await import('xlsx');
      const ctx = contexto();
      const linhas = coletas.map(c => ({
        Ponto: c.codigo,
        Status: ROTULO_STATUS[c.status],
        'Data/hora': dataHoraBR(c.horario),
        Operador: c.operador ?? '',
        'Profundidades': (c.profundidades ?? []).join(', '),
        'Dist. do alvo (m)': c.distanciaAlvoM != null ? Number(c.distanciaAlvoM.toFixed(1)) : '',
        'Precisão GPS (m)': c.precisaoM != null ? Number(c.precisaoM.toFixed(1)) : '',
        Umidade: c.umidade ?? '',
        Compactação: c.compactacao ?? '',
        Problemas: c.problemas ?? '',
        Anotação: c.obs ?? '',
        Fotos: c.fotos ?? 0,
        Longitude: c.lngReal ?? '',
        Latitude: c.latReal ?? '',
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), 'Registros de campo');
      const per = periodoParaNome({ ano: ctx.ano, epoca: ctx.epoca, safra });
      const nome = nomeExport({
        fazenda: ctx.fazenda, siglaFazenda: ctx.siglaFazenda, talhao: ctx.talhao,
        tipo: 'CAMPO', ano: per.ano, epoca: per.epoca,
      });
      XLSX.writeFile(wb, `${nome}.xlsx`);
    } catch (e) {
      setAviso(`Falha ao gerar a planilha: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setGerando(''); }
  }

  if (!nav.talhaoId) {
    return <p className="px-4 py-6 text-center text-[11px]" style={{ color: '#64748b' }}>Selecione um talhão.</p>;
  }

  return (
    <div className="px-4 py-3 space-y-3">
      {/* grade + atualizar */}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Grade de amostragem</label>
          <select value={gradeAtual} onChange={e => setGradeId(e.target.value)}
            className="w-full rounded px-2 py-1.5 text-xs outline-none"
            style={{ background: '#0b1e38', color: '#e2e8f0', border: '1px solid #1a3a6b' }}>
            {grades.length === 0 && <option value="">Nenhuma grade neste ano</option>}
            {grades.map(g => <option key={g.id} value={g.id}>{g.nome} · {g.pontos?.length ?? 0} pontos</option>)}
          </select>
        </div>
        <button onClick={() => carregar(gradeAtual, true)} disabled={!gradeAtual || carregando}
          title="Buscar na nuvem o que foi coletado no celular"
          className="px-2.5 py-1.5 rounded text-[10px] font-semibold flex items-center gap-1.5"
          style={{ background: '#1a3a6b', color: '#93c5fd', opacity: !gradeAtual || carregando ? 0.5 : 1 }}>
          {carregando ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} Atualizar
        </button>
      </div>

      {aviso && (
        <div className="flex items-start gap-1.5 p-2 rounded text-[10px]" style={{ background: '#3a2300', color: '#fbbf24', border: '1px solid #92400e' }}>
          <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" /> {aviso}
        </div>
      )}

      {/* resumo */}
      {coletas.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5">
          {([
            ['Pontos', resumo.total, '#93c5fd'],
            ['Coletados', resumo.coletados, '#4ade80'],
            ['Pulados', resumo.pulados, '#94a3b8'],
            ['Com anotação', resumo.comAnotacao, '#fbbf24'],
          ] as const).map(([rot, val, cor]) => (
            <div key={rot} className="p-2 rounded-lg text-center" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
              <div className="text-sm font-bold" style={{ color: cor }}>{val}</div>
              <div className="text-[9px]" style={{ color: '#64748b' }}>{rot}</div>
            </div>
          ))}
        </div>
      )}

      {/* exportar */}
      {coletas.length > 0 && (
        <div className="flex gap-1.5">
          <button onClick={exportarPdf} disabled={!!gerando}
            className="flex-1 py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1.5"
            style={{ background: 'var(--invicta-green-dark)', opacity: gerando ? 0.6 : 1 }}>
            {gerando === 'pdf' ? <Loader2 size={11} className="animate-spin" /> : <FileText size={11} />}
            Caderno de campo (PDF, com fotos)
          </button>
          <button onClick={exportarXlsx} disabled={!!gerando}
            className="px-2.5 py-1.5 rounded text-[10px] font-semibold flex items-center gap-1.5"
            style={{ background: '#1a3a6b', color: '#93c5fd', opacity: gerando ? 0.6 : 1 }}>
            {gerando === 'xlsx' ? <Loader2 size={11} className="animate-spin" /> : <Table2 size={11} />} Excel
          </button>
        </div>
      )}
      {progresso && <p className="text-[10px]" style={{ color: '#60a5fa' }}>{progresso}</p>}

      {/* lista */}
      {!carregando && coletas.length === 0 && (
        <p className="text-[10px] py-6 text-center leading-relaxed" style={{ color: '#64748b' }}>
          Nenhum ponto registrado nesta grade ainda.<br />
          Os registros aparecem aqui depois que o operador confirma os pontos no app de campo e sincroniza.
        </p>
      )}

      <div className="space-y-1.5">
        {coletas.map(c => {
          const exp = aberto.has(c.id);
          const fs = fotos[c.id];
          return (
            <div key={c.id} className="rounded-lg overflow-hidden" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
              <button onClick={() => alternar(c)} className="w-full flex items-center gap-2 p-2 text-left">
                {exp ? <ChevronDown size={12} style={{ color: '#64748b' }} /> : <ChevronRight size={12} style={{ color: '#64748b' }} />}
                <span className="w-1.5 h-6 rounded-full flex-shrink-0" style={{ background: COR_STATUS[c.status] }} />
                <span className="text-xs font-bold" style={{ color: '#e2e8f0' }}>{c.codigo}</span>
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                  style={{ background: '#0f1f3a', color: COR_STATUS[c.status] }}>{ROTULO_STATUS[c.status]}</span>
                <span className="flex-1" />
                {temAnotacao(c) && <StickyNote size={11} style={{ color: '#fbbf24' }} />}
                {(c.fotos ?? 0) > 0 && (
                  <span className="flex items-center gap-0.5 text-[9px]" style={{ color: '#93c5fd' }}>
                    <Camera size={10} /> {c.fotos}
                  </span>
                )}
              </button>

              {exp && (
                <div className="px-3 pb-3 space-y-2 text-[10px]" style={{ color: '#cbd5e1' }}>
                  <div className="flex flex-wrap gap-x-3 gap-y-1" style={{ color: '#94a3b8' }}>
                    <span className="flex items-center gap-1"><Clock size={10} /> {dataHoraBR(c.horario)}</span>
                    <span className="flex items-center gap-1"><User size={10} /> {c.operador ?? '—'}</span>
                    {c.distanciaAlvoM != null && (
                      <span className="flex items-center gap-1"><MapPin size={10} /> {fmt(c.distanciaAlvoM)} m do alvo</span>
                    )}
                    {c.precisaoM != null && <span>precisão {fmt(c.precisaoM)} m</span>}
                    {!!c.profundidades?.length && <span>prof. {c.profundidades.join(', ')}</span>}
                  </div>

                  {(c.umidade || c.compactacao || c.problemas) && (
                    <div className="flex flex-wrap gap-1">
                      {c.umidade && <Chip rotulo="Umidade" valor={c.umidade} />}
                      {c.compactacao && <Chip rotulo="Compactação" valor={c.compactacao} />}
                      {c.problemas && <Chip rotulo="Problemas" valor={c.problemas} tom="warn" />}
                    </div>
                  )}

                  {c.obs && (
                    <div className="p-2 rounded leading-relaxed"
                      style={{ background: '#0b1e38', borderLeft: '2px solid #fbbf24', color: '#e2e8f0' }}>
                      {c.obs}
                    </div>
                  )}

                  {fs === 'carregando' && (
                    <p className="flex items-center gap-1.5" style={{ color: '#60a5fa' }}>
                      <Loader2 size={11} className="animate-spin" /> carregando fotos…
                    </p>
                  )}
                  {Array.isArray(fs) && fs.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {fs.map(url => (
                        <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                          {/* URL assinada e temporária do Storage — next/image nao otimiza isso */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="foto do ponto" className="rounded object-cover"
                            style={{ width: 92, height: 68, border: '1px solid #1a3a6b' }} />
                        </a>
                      ))}
                    </div>
                  )}
                  {Array.isArray(fs) && fs.length === 0 && (c.fotos ?? 0) > 0 && (
                    <p style={{ color: '#94a3b8' }}>
                      {c.fotos} foto(s) registrada(s) no aparelho, mas ainda não sincronizada(s) para a nuvem.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Chip({ rotulo, valor, tom }: { rotulo: string; valor: string; tom?: 'warn' }) {
  return (
    <span className="px-1.5 py-0.5 rounded text-[9px]"
      style={{ background: tom === 'warn' ? '#3a2300' : '#0f1f3a', color: tom === 'warn' ? '#fbbf24' : '#93c5fd' }}>
      <b>{rotulo}:</b> {valor}
    </span>
  );
}
