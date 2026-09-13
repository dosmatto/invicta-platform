'use client';

// GERADOR DE NORMAS NA TELA (ledger 34) — o diferencial competitivo do módulo.
//
// O cálculo inteiro é de `foliar/normas.gerarNorma`, que é puro e testado
// (`npm run teste:foliar-normas`). O trabalho DESTA tela é o que o núcleo puro
// não pode fazer: cruzar o banco com a produtividade real da plataforma e
// mostrar, ANTES de gerar, de que população a norma vai nascer.
//
// TRÊS COISAS QUE A TELA MOSTRA DE PROPÓSITO, E QUE UM BOTÃO "GERAR" ESCONDERIA:
//
//  1. QUANTAS AMOSTRAS FICARAM DE FORA POR NÃO TER PRODUTIVIDADE. Sem a
//     variável de resposta não há como separar alta de baixa; a amostra sai da
//     conta. Se 40 de 50 saírem, o "n=10" da norma resultante é a informação
//     mais importante da tela — e ela tem de dizer isso antes, não depois.
//  2. n ALTA / n BAIXA NO CORTE ESCOLHIDO. É o que decide se o teste F
//     (S²baixa/S²alta) vai ter com que trabalhar. Corte alto demais deixa duas
//     amostras na referência e a norma sai frágil com cara de norma.
//  3. OS `avisos` DA NORMA, INTEIROS. `gerarNorma` devolve ressalvas explícitas
//     (n abaixo do mínimo, pares fracos, ausência de Mahalanobis). Gerar sem
//     mostrá-las seria entregar uma norma frágil sem a etiqueta de frágil.
//
// A produtividade de cada amostra vem de `amostra.produtividadeKgha` e, na
// ausência dela, de `produtividadeDoMapa(talhão, ano, cultura)` — o mapa de
// colheita que a plataforma já tem (ledger 6 e 34).

import { useMemo, useState } from 'react';
import { FlaskConical, Save, CheckCircle2 } from 'lucide-react';
import {
  getAmostrasFoliares, getTalhoes, getFazendas, getSafras, produtividadeDoMapa, CULTURAS,
  type AmostraFoliar,
} from '@/lib/store';
import { criar as bibCriar, listar as bibListar, ativar as bibAtivar } from '@/lib/biblioteca';
import {
  gerarNorma, corteDeProdutividade, N_MINIMO_NORMA, NUTRIENTES, ROTULO_ORGAO, unidadeDe,
  type AmostraNorma, type NormaDris, type Orgao, type ResultadoGeracao,
} from '@/lib/foliar';
import { inputStyle } from '@/constants/ui';
import { Aviso } from './FoliarImportacao';

/** Uma amostra já pronta para o gerador, com a procedência da produtividade —
 *  a tela precisa poder dizer "esta veio do mapa de colheita". */
interface Candidata {
  amostra: AmostraFoliar;
  produtividadeKgha: number | null;
  origem: 'amostra' | 'mapa' | null;
}

export function FoliarGeradorNormas() {
  const [cultura, setCultura] = useState('Soja');
  const [orgao, setOrgao] = useState<Orgao>('trifolio-com-peciolo');
  const [safra, setSafra] = useState('');
  const [uf, setUf] = useState('');
  const [estadio, setEstadio] = useState('R1-R2');
  const [modoCorte, setModoCorte] = useState<'percentil' | 'kgha'>('percentil');
  const [percentil, setPercentil] = useState(75);
  const [corteKgha, setCorteKgha] = useState(3600);
  const [nMinimo, setNMinimo] = useState(N_MINIMO_NORMA);

  const [resultado, setResultado] = useState<ResultadoGeracao | null>(null);
  const [nome, setNome] = useState('');
  const [tornarPadrao, setTornarPadrao] = useState(true);
  const [salvo, setSalvo] = useState('');

  const safras = useMemo(() => getSafras(), []);
  const ufs = useMemo(
    () => [...new Set(getFazendas().map(f => (f.estado ?? '').trim().toUpperCase()).filter(Boolean))].sort(),
    [],
  );

  // ── População candidata ───────────────────────────────────────────────────
  const candidatas = useMemo<Candidata[]>(() => {
    const talhoes = new Map(getTalhoes().map(t => [t.id, t]));
    const fazendas = new Map(getFazendas().map(f => [f.id, f]));
    const alvoUf = uf.trim().toUpperCase();

    return getAmostrasFoliares()
      .filter(a => a.cultura === cultura && a.orgao === orgao)
      .filter(a => !safra || a.safra === safra)
      .filter(a => {
        if (!alvoUf) return true;
        const t = talhoes.get(a.talhaoId);
        const f = t ? fazendas.get(t.fazendaId) : undefined;
        return (f?.estado ?? '').trim().toUpperCase() === alvoUf;
      })
      .map(a => {
        if (typeof a.produtividadeKgha === 'number' && a.produtividadeKgha > 0) {
          return { amostra: a, produtividadeKgha: a.produtividadeKgha, origem: 'amostra' as const };
        }
        const doMapa = produtividadeDoMapa(a.talhaoId, a.safra, a.cultura);
        return { amostra: a, produtividadeKgha: doMapa, origem: doMapa != null ? ('mapa' as const) : null };
      });
  }, [cultura, orgao, safra, uf]);

  const comProdutividade = useMemo(
    () => candidatas.filter((c): c is Candidata & { produtividadeKgha: number } => c.produtividadeKgha != null),
    [candidatas],
  );
  const semProdutividade = candidatas.length - comProdutividade.length;
  const doMapa = comProdutividade.filter(c => c.origem === 'mapa').length;

  const opcoesCorte = useMemo(
    () => modoCorte === 'kgha' ? { corteKgha } : { percentil: percentil / 100 },
    [modoCorte, corteKgha, percentil],
  );

  // Prévia do corte — é ela que responde "a norma vai nascer de quantas?"
  const previa = useMemo(() => {
    const prods = comProdutividade.map(c => c.produtividadeKgha);
    const corte = corteDeProdutividade(prods, opcoesCorte);
    if (corte == null) return null;
    const alta = prods.filter(p => p >= corte).length;
    return { corte, alta, baixa: prods.length - alta };
  }, [comProdutividade, opcoesCorte]);

  const anos = useMemo(() => {
    const lista = comProdutividade.map(c => c.amostra.ano).filter((n): n is number => !!n).sort();
    return lista.length ? { de: lista[0], ate: lista[lista.length - 1] } : null;
  }, [comProdutividade]);

  function gerar() {
    setSalvo('');
    const amostras: AmostraNorma[] = comProdutividade.map(c => ({
      teores: c.amostra.teores,
      produtividadeKgha: c.produtividadeKgha,
    }));
    const r = gerarNorma(amostras, {
      cultura, orgao, estadio,
      ...opcoesCorte,
      nMinimo,
      fonte: `Norma gerada do banco INVICTA — ${cultura}, ${ROTULO_ORGAO[orgao]}, ${estadio}`
        + `${safra ? `, ano ${safra}` : ''}${uf ? `, ${uf}` : ''}. `
        + `${amostras.length} amostra(s) com produtividade conhecida. `
        + 'Faixas = média ± 1 DP da população de referência (não é calibração com doses).',
    });
    setResultado(r);
    if (r.norma) {
      const faixaAnos = anos ? `${anos.de}–${anos.ate}` : '';
      setNome([cultura, ROTULO_ORGAO[orgao], faixaAnos, `n=${r.norma.n ?? amostras.length}`]
        .filter(Boolean).join(' · '));
    }
  }

  function salvar() {
    const norma = resultado?.norma;
    if (!norma || !nome.trim()) return;
    const item = bibCriar<NormaDris>('analises-foliares', {
      nome: nome.trim(),
      descricao: norma.fonte,
      tags: [cultura, ROTULO_ORGAO[orgao], estadio, 'gerada'],
      conteudo: norma,
      escopo: 'empresa',
    });
    let inativadas = 0;
    if (tornarPadrao) {
      // A norma PADRÃO (store.normaFoliarPadrao) é a primeira da lista visível
      // para a cultura+órgão. Inativar as outras normas PRÓPRIAS da mesma
      // combinação é o que torna a escolha inequívoca — elas continuam na
      // Biblioteca (a tela da categoria mostra as inativas) e voltam com um
      // clique. Normas de FÁBRICA não são tocadas: elas são a rede de segurança
      // do módulo e desligá-las por efeito colateral seria indefensável.
      for (const outro of bibListar<NormaDris>('analises-foliares')) {
        if (outro.id === item.id || !outro.ativo || outro.escopo === 'sistema') continue;
        if (outro.conteudo?.cultura !== cultura || outro.conteudo?.orgao !== orgao) continue;
        bibAtivar('analises-foliares', outro.id, false);
        inativadas++;
      }
    }
    setSalvo(`Norma "${item.nome}" salva na Biblioteca (Análises Foliares)`
      + (inativadas ? ` · ${inativadas} norma(s) própria(s) anterior(es) inativada(s)` : '') + '.');
  }

  const norma = resultado?.norma ?? null;
  const paresOrdenados = useMemo(
    () => [...(norma?.pares ?? [])].sort((a, b) => (b.f ?? -1) - (a.f ?? -1)),
    [norma],
  );

  return (
    <div className="h-full overflow-y-auto px-3 py-3 space-y-3">
      <Bloco titulo="População de referência">
        <div className="grid grid-cols-2 gap-2">
          <Campo rotulo="Cultura">
            <select value={cultura} onChange={e => { setCultura(e.target.value); setResultado(null); }}
              className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle}>
              {CULTURAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Estádio de validade">
            <input value={estadio} onChange={e => setEstadio(e.target.value)}
              className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle} />
          </Campo>
        </div>
        <Campo rotulo="Órgão amostrado">
          <select value={orgao} onChange={e => { setOrgao(e.target.value as Orgao); setResultado(null); }}
            className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle}>
            {(Object.keys(ROTULO_ORGAO) as Orgao[]).map(o => <option key={o} value={o}>{ROTULO_ORGAO[o]}</option>)}
          </select>
        </Campo>
        <div className="grid grid-cols-2 gap-2">
          <Campo rotulo="Ano (opcional)">
            <select value={safra} onChange={e => { setSafra(e.target.value); setResultado(null); }}
              className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle}>
              <option value="">Todos</option>
              {safras.map(s => <option key={s.id} value={s.nome}>{s.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Região / UF (opcional)">
            <select value={uf} onChange={e => { setUf(e.target.value); setResultado(null); }}
              className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle}>
              <option value="">Todas</option>
              {ufs.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </Campo>
        </div>
      </Bloco>

      {/* O que a população tem — antes de gerar */}
      <div className="p-2 rounded-lg" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Kpi rotulo="candidatas" valor={candidatas.length} />
          <Kpi rotulo="com produtividade" valor={comProdutividade.length} cor="#4ade80" />
          <Kpi rotulo="sem produtividade" valor={semProdutividade} cor={semProdutividade ? '#fbbf24' : '#475569'} />
        </div>
        {semProdutividade > 0 && (
          <p className="text-[9px] mt-1.5" style={{ color: '#fbbf24' }}>
            {semProdutividade} amostra(s) ficam FORA da norma: não têm produtividade na amostra nem mapa
            de colheita no talhão/ano/cultura. Sem a variável de resposta não há como separar alta de baixa.
          </p>
        )}
        {doMapa > 0 && (
          <p className="text-[9px] mt-1" style={{ color: '#64748b' }}>
            {doMapa} amostra(s) usam a média do mapa de colheita do talhão.
          </p>
        )}
      </div>

      <Bloco titulo="Corte de alta produtividade">
        <div className="flex gap-1">
          {([['percentil', 'Percentil'], ['kgha', 'kg/ha']] as const).map(([id, label]) => (
            <button key={id} onClick={() => { setModoCorte(id); setResultado(null); }}
              className="flex-1 py-1 rounded text-[10px] font-bold"
              style={{ background: modoCorte === id ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: modoCorte === id ? '#fff' : '#64748b' }}>
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {modoCorte === 'percentil' ? (
            <Campo rotulo="Percentil (%)">
              <input type="number" min={50} max={95} value={percentil}
                onChange={e => { setPercentil(Number(e.target.value)); setResultado(null); }}
                className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle} />
            </Campo>
          ) : (
            <Campo rotulo="Corte (kg/ha)">
              <input type="number" min={0} step={100} value={corteKgha}
                onChange={e => { setCorteKgha(Number(e.target.value)); setResultado(null); }}
                className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle} />
            </Campo>
          )}
          <Campo rotulo="n mínimo (aviso abaixo disto)">
            <input type="number" min={2} value={nMinimo}
              onChange={e => { setNMinimo(Number(e.target.value)); setResultado(null); }}
              className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle} />
          </Campo>
        </div>
        {previa && (
          <div className="flex items-center gap-3 text-[10px] pt-1" style={{ color: '#94a3b8' }}>
            <span>corte <strong style={{ color: '#e2e8f0' }}>{Math.round(previa.corte)} kg/ha</strong></span>
            <span>n alta <strong style={{ color: previa.alta < nMinimo ? '#fbbf24' : '#4ade80' }}>{previa.alta}</strong></span>
            <span>n baixa <strong style={{ color: '#93c5fd' }}>{previa.baixa}</strong></span>
          </div>
        )}
      </Bloco>

      <button onClick={gerar} disabled={comProdutividade.length < 4}
        className="w-full py-2 rounded text-[11px] font-bold text-white flex items-center justify-center gap-1 disabled:opacity-40"
        style={{ background: 'var(--invicta-green-dark)' }}>
        <FlaskConical size={12} /> Gerar norma
      </button>
      {comProdutividade.length < 4 && (
        <Aviso texto="São necessárias ao menos 4 amostras com produtividade conhecida para gerar uma norma." />
      )}

      {/* Resultado */}
      {resultado && !norma && <Aviso tom="erro" texto={resultado.motivo ?? 'Não foi possível gerar a norma.'} />}

      {norma && (
        <>
          {(norma.avisos ?? []).map((a, i) => <Aviso key={i} texto={a} tom={a.startsWith('CONFIANÇA BAIXA') ? 'erro' : 'neutro'} />)}

          <Bloco titulo={`Pares duais · ${norma.pares.length} (ordenados pelo teste F)`}>
            <div className="overflow-auto" style={{ maxHeight: 180 }}>
              <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Par', 'Média', 'DP', 'CV%', 'F', 'n alta'].map(h => (
                      <th key={h} className="sticky top-0 text-right px-1 py-0.5 text-[9px] font-bold"
                        style={{ background: '#061525', color: '#64748b' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paresOrdenados.map(p => (
                    <tr key={`${p.a}/${p.b}`} style={{ borderBottom: '1px solid #0f2240' }}>
                      <td className="px-1 py-0.5 text-[9px] font-bold text-left" style={{ color: '#e2e8f0' }}>{p.a}/{p.b}</td>
                      <td className="px-1 py-0.5 text-[9px] text-right" style={{ color: '#94a3b8' }}>{p.media.toFixed(3)}</td>
                      <td className="px-1 py-0.5 text-[9px] text-right" style={{ color: '#94a3b8' }}>{p.dp.toFixed(3)}</td>
                      <td className="px-1 py-0.5 text-[9px] text-right" style={{ color: '#94a3b8' }}>{p.cv.toFixed(1)}</td>
                      <td className="px-1 py-0.5 text-[9px] text-right font-bold" style={{ color: p.f == null ? '#475569' : '#93c5fd' }}>
                        {p.f == null ? '—' : p.f.toFixed(2)}
                      </td>
                      <td className="px-1 py-0.5 text-[9px] text-right" style={{ color: '#64748b' }}>{p.nAlta ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[9px]" style={{ color: '#475569' }}>
              F = S²(razão) na população de BAIXA ÷ na de ALTA. A ordem gravada (A/B ou B/A) é a de maior F —
              a mais discriminante. A diagnose respeita a ordem gravada; não recalcula.
            </p>
          </Bloco>

          {norma.faixas && (
            <Bloco titulo="Faixas geradas (média ± 1 DP da população de alta)">
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                {NUTRIENTES.filter(id => norma.faixas?.[id]).map(id => {
                  const f = norma.faixas?.[id];
                  if (!f) return null;
                  return (
                    <div key={id} className="flex items-baseline justify-between">
                      <span className="text-[10px] font-bold" style={{ color: '#93c5fd' }}>{id}</span>
                      <span className="text-[9px]" style={{ color: '#94a3b8' }}>
                        {f.min.toFixed(f.max < 10 ? 2 : 1)}–{f.max.toFixed(f.max < 10 ? 2 : 1)} {unidadeDe(id)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[9px]" style={{ color: '#475569' }}>
                Estas faixas NÃO são calibração com doses crescentes: são a dispersão da própria população de
                referência. Saem bem mais estreitas que as faixas clássicas da literatura — e é esse o ponto.
              </p>
            </Bloco>
          )}

          <Bloco titulo="Salvar na Biblioteca">
            <input value={nome} onChange={e => setNome(e.target.value)}
              className="w-full rounded px-2 py-1.5 text-[11px] outline-none" style={inputStyle} />
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={tornarPadrao} onChange={e => setTornarPadrao(e.target.checked)} />
              <span className="text-[9px]" style={{ color: '#94a3b8' }}>
                Tornar padrão — inativa as outras normas PRÓPRIAS de {cultura} · {ROTULO_ORGAO[orgao]}
                (elas ficam na Biblioteca e voltam com um clique; as de fábrica não são tocadas).
              </span>
            </label>
            <button onClick={salvar} disabled={!nome.trim()}
              className="w-full py-1.5 rounded text-[10px] font-bold text-white flex items-center justify-center gap-1 disabled:opacity-40"
              style={{ background: 'var(--invicta-blue-mid)' }}>
              <Save size={11} /> Salvar na Biblioteca
            </button>
            {salvo && (
              <div className="flex items-start gap-1.5 p-2 rounded" style={{ background: '#052e16', border: '1px solid #166534' }}>
                <CheckCircle2 size={11} style={{ color: '#4ade80', flexShrink: 0, marginTop: 1 }} />
                <p className="text-[9px]" style={{ color: '#bbf7d0' }}>{salvo}</p>
              </div>
            )}
          </Bloco>
        </>
      )}
    </div>
  );
}

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

function Kpi({ rotulo, valor, cor }: { rotulo: string; valor: number; cor?: string }) {
  return (
    <div>
      <div className="text-sm font-bold" style={{ color: cor ?? '#e2e8f0' }}>{valor}</div>
      <div className="text-[8px] uppercase tracking-wider" style={{ color: '#64748b' }}>{rotulo}</div>
    </div>
  );
}
