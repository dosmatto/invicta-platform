'use client';

// PAINEL FOLIAR (ledger 29) — a visão MULTI-TALHÃO do módulo.
//
// A aba do Talhão responde "como está ESTE talhão". Este painel responde as
// perguntas que só existem acima do talhão e que são, na prática, o trabalho do
// consultor: onde está o pior desequilíbrio da carteira inteira, qual nutriente
// mais se repete como limitante, e — o principal — dá para transformar todo
// esse banco numa NORMA própria?
//
// Três abas, nesta ordem porque é a ordem do trabalho real:
//   1. Visão geral — todas as amostras diagnosticadas, filtráveis.
//   2. Importar    — o laudo em lote entra (ledger 25/26).
//   3. Gerar norma — o banco vira norma da Biblioteca (ledger 34).
//
// DIAGNOSE É DERIVADA, NÃO GRAVADA, AQUI. A lista roda `diagnosticar` ao vivo
// contra a norma PADRÃO de cada cultura+órgão. Gravar a diagnose é ato
// deliberado da aba do Talhão (é ela que congela `normaId`/`normaVersao`, ledger
// 23); uma lista que gravasse ao renderizar encheria o histórico de resultados
// que ninguém pediu.

import { useEffect, useMemo, useState } from 'react';
import { Salad, Upload, FlaskConical, ListFilter, AlertTriangle } from 'lucide-react';
import {
  getAmostrasFoliares, getTalhoes, getFazendas, getClientes, getSafras,
  normaFoliarPadrao, CULTURAS,
  type AmostraFoliar, type Talhao, type Fazenda, type Cliente,
} from '@/lib/store';
import { diagnosticar, ROTULO_ORGAO, COR_ESTADO, type DiagnoseFoliar, type NutrienteId, type Orgao } from '@/lib/foliar';
import { inputStyle } from '@/constants/ui';
import { FoliarImportacao } from './FoliarImportacao';
import { FoliarGeradorNormas } from './FoliarGeradorNormas';

type AbaFoliar = 'geral' | 'importar' | 'normas';

const ABAS: { id: AbaFoliar; label: string; icone: React.ComponentType<{ size?: number }> }[] = [
  { id: 'geral', label: 'Visão geral', icone: ListFilter },
  { id: 'importar', label: 'Importar', icone: Upload },
  { id: 'normas', label: 'Gerar norma', icone: FlaskConical },
];

export function FoliarPanel() {
  const [aba, setAba] = useState<AbaFoliar>('geral');

  return (
    <section className="flex flex-col h-full overflow-hidden">
      <div className="flex gap-1 px-3 pt-2 flex-shrink-0">
        {ABAS.map(a => {
          const Icon = a.icone;
          const ativo = a.id === aba;
          return (
            <button key={a.id} onClick={() => setAba(a.id)}
              className="flex-1 py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1"
              style={{ background: ativo ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: ativo ? '#fff' : '#64748b' }}>
              <Icon size={11} />{a.label}
            </button>
          );
        })}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {aba === 'geral' && <VisaoGeral />}
        {aba === 'importar' && <FoliarImportacao />}
        {aba === 'normas' && <FoliarGeradorNormas />}
      </div>
    </section>
  );
}

// ── Visão geral multi-talhão ────────────────────────────────────────────────

/** Uma linha da tabela: a amostra + o contexto resolvido + a diagnose ao vivo. */
interface LinhaGeral {
  amostra: AmostraFoliar;
  produtor: string;
  fazenda: string;
  talhao: string;
  diagnose: DiagnoseFoliar;
  /** Nutriente mais limitante segundo o método que conseguiu opinar. */
  limitante: NutrienteId | null;
  /** De que método veio o `limitante` — a tela não pode fingir que foi o DRIS. */
  limitanteMetodo: 'DRIS' | 'CND' | 'Faixa' | null;
  ibn: number | null;
  temNorma: boolean;
}

/**
 * O mais limitante, com a procedência. Ordem de preferência = ordem de força do
 * método: DRIS (se a norma tem pares), CND (se tem clr), e só então a faixa de
 * suficiência — que não ordena, apenas aponta o primeiro deficiente na ordem do
 * laudo. Devolver "N" sem dizer de onde veio seria a tela afirmando um DRIS que
 * não existe.
 */
function maisLimitante(d: DiagnoseFoliar): { id: NutrienteId | null; metodo: LinhaGeral['limitanteMetodo'] } {
  if (d.dris?.ordemLimitacao?.length) return { id: d.dris.ordemLimitacao[0], metodo: 'DRIS' };
  if (d.cnd?.ordemLimitacao?.length) return { id: d.cnd.ordemLimitacao[0], metodo: 'CND' };
  const def = d.faixa?.itens?.find(i => i.estado === 'deficiente');
  if (def) return { id: def.nutriente, metodo: 'Faixa' };
  return { id: null, metodo: null };
}

function VisaoGeral() {
  const [refresh, setRefresh] = useState(0);
  const [safra, setSafra] = useState('');
  const [cultura, setCultura] = useState('');
  const [orgao, setOrgao] = useState<'' | Orgao>('');

  // As telas do módulo conversam por 'inv:foliar' (mesma razão de 'inv:lab'):
  // importar um lote na aba ao lado tem de aparecer aqui sem sair e voltar.
  useEffect(() => {
    const onCh = () => setRefresh(x => x + 1);
    if (typeof window !== 'undefined') window.addEventListener('inv:foliar', onCh);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('inv:foliar', onCh); };
  }, []);

  const safras = useMemo(() => getSafras(), [refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  const linhas = useMemo<LinhaGeral[]>(() => {
    const talhoes = new Map<string, Talhao>(getTalhoes().map(t => [t.id, t]));
    const fazendas = new Map<string, Fazenda>(getFazendas().map(f => [f.id, f]));
    const clientes = new Map<string, Cliente>(getClientes().map(c => [c.id, c]));
    // Cache de norma por cultura+órgão: sem ele, `normaFoliarPadrao` varreria a
    // Biblioteca inteira uma vez por amostra.
    const normas = new Map<string, ReturnType<typeof normaFoliarPadrao>>();
    const normaDe = (cult: string, org: Orgao) => {
      const k = `${cult}|${org}`;
      if (!normas.has(k)) normas.set(k, normaFoliarPadrao(cult, org));
      return normas.get(k) ?? null;
    };

    return getAmostrasFoliares().map(a => {
      const t = talhoes.get(a.talhaoId);
      const f = t ? fazendas.get(t.fazendaId) : undefined;
      const c = f ? clientes.get(f.clienteId) : undefined;
      const norma = normaDe(a.cultura, a.orgao);
      const diagnose = diagnosticar(a.teores, norma, {
        orgaoAmostra: a.orgao,
        estadioAmostra: a.estadio ?? null,
        produtividadeKgha: a.produtividadeKgha ?? null,
      });
      const lim = maisLimitante(diagnose);
      return {
        amostra: a,
        produtor: c?.nome ?? '—',
        fazenda: f?.nome ?? '—',
        talhao: t?.nome ?? '—',
        diagnose,
        limitante: lim.id,
        limitanteMetodo: lim.metodo,
        ibn: diagnose.dris ? diagnose.dris.ibn : null,
        temNorma: !!norma,
      };
    });
  }, [refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtradas = useMemo(() => linhas.filter(l =>
    (!safra || l.amostra.safra === safra)
    && (!cultura || l.amostra.cultura === cultura)
    && (!orgao || l.amostra.orgao === orgao)
  ), [linhas, safra, cultura, orgao]);

  const semNorma = filtradas.filter(l => !l.temNorma).length;

  if (!linhas.length) {
    return (
      <div className="px-4 py-8 text-center">
        <Salad size={22} style={{ color: '#334155', margin: '0 auto 8px' }} />
        <p className="text-[11px] font-semibold" style={{ color: '#94a3b8' }}>Nenhuma análise foliar no banco.</p>
        <p className="text-[10px] mt-1" style={{ color: '#64748b' }}>
          Use a aba <strong>Importar</strong> para trazer um laudo de laboratório, ou lance uma amostra
          pela aba Foliar de um talhão.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Filtros */}
      <div className="px-3 py-2 flex gap-1.5 flex-shrink-0" style={{ borderBottom: '1px solid #1a3a6b' }}>
        <select value={safra} onChange={e => setSafra(e.target.value)}
          className="flex-1 min-w-0 rounded px-1.5 py-1 text-[10px] outline-none" style={inputStyle}>
          <option value="">Todos os anos</option>
          {safras.map(s => <option key={s.id} value={s.nome}>{s.nome}</option>)}
        </select>
        <select value={cultura} onChange={e => setCultura(e.target.value)}
          className="flex-1 min-w-0 rounded px-1.5 py-1 text-[10px] outline-none" style={inputStyle}>
          <option value="">Todas as culturas</option>
          {CULTURAS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={orgao} onChange={e => setOrgao(e.target.value as '' | Orgao)}
          className="flex-1 min-w-0 rounded px-1.5 py-1 text-[10px] outline-none" style={inputStyle}>
          <option value="">Todos os órgãos</option>
          {(Object.keys(ROTULO_ORGAO) as Orgao[]).map(o => <option key={o} value={o}>{ROTULO_ORGAO[o]}</option>)}
        </select>
      </div>

      <div className="px-3 py-1.5 flex items-center justify-between flex-shrink-0">
        <span className="text-[10px] font-semibold" style={{ color: '#94a3b8' }}>
          {filtradas.length} amostra(s)
        </span>
        {semNorma > 0 && (
          <span className="text-[9px] flex items-center gap-1" style={{ color: '#fbbf24' }}>
            <AlertTriangle size={10} />{semNorma} sem norma para a cultura/órgão
          </span>
        )}
      </div>

      <div className="flex-1 overflow-auto px-2 pb-3">
        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#061525' }}>
              {['Talhão', 'Ano', 'Cultura', 'IBN', 'Mais limitante'].map(h => (
                <th key={h} className="text-left px-1.5 py-1 text-[9px] font-bold uppercase sticky top-0"
                  style={{ color: '#64748b', background: '#061525', borderBottom: '1px solid #1a3a6b' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtradas.map(l => (
              <tr key={l.amostra.id} style={{ borderBottom: '1px solid #0f2240' }}>
                <td className="px-1.5 py-1.5 align-top">
                  <div className="text-[10px] font-bold truncate" style={{ color: '#e2e8f0', maxWidth: 150 }}>{l.talhao}</div>
                  <div className="text-[9px] truncate" style={{ color: '#64748b', maxWidth: 150 }}>
                    {l.produtor} · {l.fazenda}
                  </div>
                  <div className="text-[8px] truncate" style={{ color: '#475569', maxWidth: 150 }}>
                    {ROTULO_ORGAO[l.amostra.orgao]}{l.amostra.estadio ? ` · ${l.amostra.estadio}` : ''}
                    {l.amostra.numeroAmostra ? ` · amostra ${l.amostra.numeroAmostra}` : ''}
                  </div>
                </td>
                <td className="px-1.5 py-1.5 text-[10px] align-top" style={{ color: '#94a3b8' }}>{l.amostra.safra}</td>
                <td className="px-1.5 py-1.5 text-[10px] align-top" style={{ color: '#94a3b8' }}>{l.amostra.cultura}</td>
                <td className="px-1.5 py-1.5 text-[10px] font-bold align-top" style={{ color: l.ibn == null ? '#475569' : '#93c5fd' }}>
                  {l.ibn == null ? '—' : l.ibn.toFixed(1)}
                </td>
                <td className="px-1.5 py-1.5 align-top">
                  {l.limitante ? (
                    <>
                      <span className="text-[10px] font-bold px-1 rounded"
                        style={{ background: COR_ESTADO.deficiente + '22', color: COR_ESTADO.deficiente }}>
                        {l.limitante}
                      </span>
                      <span className="text-[8px] ml-1" style={{ color: '#475569' }}>{l.limitanteMetodo}</span>
                    </>
                  ) : (
                    <span className="text-[9px]" style={{ color: '#475569' }}>
                      {l.temNorma ? 'sem desequilíbrio' : 'sem norma'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="text-[9px] mt-3 px-1" style={{ color: '#475569' }}>
          IBN = soma dos |índices| DRIS: quanto maior, mais desequilibrada a planta. Fica vazio quando a
          norma padrão da cultura/órgão não traz pares duais — é o caso das normas de literatura, que só
          publicam faixas de suficiência. A coluna ao lado diz de QUE método veio o nutriente apontado.
        </p>
      </div>
    </div>
  );
}
