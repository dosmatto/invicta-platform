'use client';

// Aba "Camadas" do talhão — SÓ VISUALIZAÇÃO. Junta no mesmo mapa o que as
// outras abas já geraram e guardaram (fertilidade, NDVI, produtividade, linhas
// da PrecisionFarm, zonas, pontos, contorno), sem reprocessar nada: o que ainda
// não foi gerado na aba de origem simplesmente não aparece aqui.
//
// O usuário liga camadas nos grupos expansíveis; cada ligada entra no TOPO da
// pilha, onde dá para subir/descer e regular a transparência. A pilha vai ao
// mapa pelo canal `camadasPilha` do AppContext (MapView, efeito 6e) e vale só
// enquanto esta aba está aberta — ao sair, o canal volta a `null` e as outras
// abas seguem como sempre. A escolha (quais, ordem, transparência) fica
// guardada por talhão neste aparelho.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Layers, Loader2, X } from 'lucide-react';
import { useApp, type CamadaMapa } from '@/context/AppContext';
import type { Talhao } from '@/lib/store';
import { listarFontesCamadas, type GrupoCamadas, type ItemCamada } from '@/lib/camadasTalhao';

type Escolha = { id: string; opacidade: number };
const kEscolha = (talhaoId: string) => `invicta:camadas:${talhaoId}`;

// Primeira vez no talhão: só o contorno, para o limite não sumir do mapa (a
// pilha esconde o contorno fixo enquanto a aba está aberta).
function lerEscolha(talhaoId: string): Escolha[] {
  try {
    const raw = localStorage.getItem(kEscolha(talhaoId));
    if (raw == null) return [{ id: 'contorno', opacidade: 1 }];
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((e): e is Escolha => typeof e?.id === 'string' && typeof e?.opacidade === 'number') : [];
  } catch { return []; }
}

export function CamadasSection({ talhao, safra }: { talhao: Talhao; safra: string }) {
  // A safra entra na chave: laudos e grades mudam com ela, e camada da safra
  // anterior não pode ficar presa no mapa (a pilha recomeça da escolha salva).
  return <Camadas key={`${talhao.id}|${safra}`} talhao={talhao} safra={safra} />;
}

function Camadas({ talhao, safra }: { talhao: Talhao; safra: string }) {
  const { setCamadasPilha } = useApp();
  const [grupos, setGrupos] = useState<GrupoCamadas[] | null>(null);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  // Ordem da tela: índice 0 = topo do mapa.
  const [escolha, setEscolha] = useState<Escolha[]>([]);
  const [prontas, setProntas] = useState<Map<string, CamadaMapa>>(new Map());
  const [carregando, setCarregando] = useState<Set<string>>(new Set());
  const [falhas, setFalhas] = useState<Map<string, string>>(new Map());
  const emVoo = useRef(new Set<string>());
  const restaurou = useRef(false);

  useEffect(() => {
    let vivo = true;
    void listarFontesCamadas(talhao, safra).then(g => {
      if (!vivo) return;
      setGrupos(g);
      // Restaura a escolha salva INTEIRA: camada que não está na lista agora
      // (outra safra, nuvem que não respondeu) fica guardada e só não aparece —
      // descartar aqui apagaria a escolha por uma falha passageira.
      if (!restaurou.current) {
        restaurou.current = true;
        setEscolha(lerEscolha(talhao.id));
      }
    }).catch((e: unknown) => {
      // Um grupo local que estourou não pode prender a tela em "Procurando…".
      console.warn('[camadas] falha ao listar as fontes:', e);
      if (vivo) setGrupos([]);
    });
    return () => { vivo = false; };
  }, [talhao, safra]);

  useEffect(() => {
    if (!restaurou.current) return;
    try { localStorage.setItem(kEscolha(talhao.id), JSON.stringify(escolha)); } catch { /* modo privado */ }
  }, [escolha, talhao.id]);

  const itens = useMemo(() => new Map((grupos ?? []).flatMap(g => g.itens.map(i => [i.id, i] as const))), [grupos]);
  // O que a tela e o mapa mostram: só as escolhidas que existem nesta listagem.
  const visiveis = useMemo(() => escolha.filter(e => itens.has(e.id)), [escolha, itens]);

  // Carrega (uma vez) o desenho de cada camada escolhida. Quem falhou não é
  // tentado de novo a cada passo da régua — só ao religar (alternar limpa a falha).
  useEffect(() => {
    for (const e of visiveis) {
      const item = itens.get(e.id);
      if (!item || prontas.has(e.id) || falhas.has(e.id) || emVoo.current.has(e.id)) continue;
      emVoo.current.add(e.id);
      setCarregando(s => new Set(s).add(e.id));
      item.carregar()
        .then(c => {
          if (c) setProntas(m => new Map(m).set(e.id, { ...c, opacidade: 1 } as CamadaMapa));
          else setFalhas(m => new Map(m).set(e.id, 'Sem dado salvo para desenhar.'));
        })
        .catch((err: unknown) => setFalhas(m => new Map(m).set(e.id, err instanceof Error ? err.message : 'Falha ao carregar.')))
        .finally(() => {
          emVoo.current.delete(e.id);
          setCarregando(s => { const n = new Set(s); n.delete(e.id); return n; });
        });
    }
  }, [visiveis, itens, prontas, falhas]);

  // Publica a pilha no mapa. Abrir a aba já liga o canal (mesmo vazio): o
  // contorno fixo sai e entra o da pilha, se escolhido.
  useEffect(() => {
    const pilha: CamadaMapa[] = [];
    for (const e of visiveis) {
      const c = prontas.get(e.id);
      if (c) pilha.push({ ...c, opacidade: e.opacidade });
    }
    setCamadasPilha(pilha);
  }, [visiveis, prontas, setCamadasPilha]);
  useEffect(() => () => setCamadasPilha(null), [setCamadasPilha]);

  const ligada = (id: string) => escolha.some(e => e.id === id);
  const alternar = useCallback((item: ItemCamada) => {
    setFalhas(m => { if (!m.has(item.id)) return m; const n = new Map(m); n.delete(item.id); return n; });
    setEscolha(es => es.some(e => e.id === item.id)
      ? es.filter(e => e.id !== item.id)
      : [{ id: item.id, opacidade: item.opacidadePadrao ?? 1 }, ...es]);
  }, []);
  // Sobe/desce entre as VISÍVEIS: troca de lugar com a vizinha visível, mesmo
  // que haja escolhas guardadas (de outra safra) entre as duas no array.
  const mover = (i: number, d: -1 | 1) => {
    const a = visiveis[i]?.id, b = visiveis[i + d]?.id;
    if (!a || !b) return;
    setEscolha(es => {
      const ia = es.findIndex(e => e.id === a), ib = es.findIndex(e => e.id === b);
      const n = [...es];
      [n[ia], n[ib]] = [n[ib], n[ia]];
      return n;
    });
  };
  const opacidade = (id: string, v: number) => setEscolha(es => es.map(e => (e.id === id ? { ...e, opacidade: v } : e)));
  const alternarGrupo = (g: string) => setAbertos(s => { const n = new Set(s); if (n.has(g)) n.delete(g); else n.add(g); return n; });

  return (
    <div className="flex flex-col gap-3 text-xs" style={{ color: '#cbd5e1' }}>
      <div className="flex gap-2 rounded border p-2.5" style={{ borderColor: '#1e3a5f', background: '#0b2238' }}>
        <Layers size={14} className="shrink-0 mt-0.5" style={{ color: '#94a3b8' }} />
        <p className="leading-snug" style={{ color: '#94a3b8' }}>
          Só visualização: mostra juntos os mapas <strong style={{ color: '#e2e8f0' }}>já gerados</strong> nas outras abas.
          Ligue camadas abaixo; a de cima da lista fica por cima no mapa. Vale enquanto esta aba estiver aberta.
        </p>
      </div>

      {/* PILHA — ordem e transparência */}
      <section>
        <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: '#94a3b8' }}>No mapa (topo → fundo)</h3>
        {visiveis.length === 0 && (
          <p className="rounded border border-dashed p-3 text-center" style={{ borderColor: '#1e3a5f', color: '#64748b' }}>
            Nenhuma camada ligada. Escolha nos grupos abaixo.
          </p>
        )}
        <ul className="flex flex-col gap-1.5">
          {visiveis.map((e, i) => {
            const item = itens.get(e.id);
            const falha = falhas.get(e.id);
            return (
              <li key={e.id} className="rounded border p-2" style={{ borderColor: '#1e3a5f', background: '#0a1c30' }}>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: item?.cor ?? '#64748b' }} />
                  <span className="min-w-0 flex-1 truncate font-semibold" style={{ color: '#e2e8f0' }} title={item?.nome}>
                    {item?.nome ?? e.id}
                    <span className="ml-1 font-normal" style={{ color: '#64748b' }}>· {item?.grupo}</span>
                  </span>
                  {carregando.has(e.id) && <Loader2 size={12} className="animate-spin" />}
                  <button aria-label="Subir camada" onClick={() => mover(i, -1)} disabled={i === 0}
                    className="rounded p-0.5 disabled:opacity-30 hover:bg-white/10"><ArrowUp size={13} /></button>
                  <button aria-label="Descer camada" onClick={() => mover(i, 1)} disabled={i === visiveis.length - 1}
                    className="rounded p-0.5 disabled:opacity-30 hover:bg-white/10"><ArrowDown size={13} /></button>
                  <button aria-label="Tirar do mapa" onClick={() => item && alternar(item)}
                    className="rounded p-0.5 hover:bg-white/10"><X size={13} /></button>
                </div>
                {falha
                  ? <p className="mt-1" style={{ color: '#f87171' }}>{falha}</p>
                  : (
                    <label className="mt-1.5 flex items-center gap-2">
                      <span style={{ color: '#64748b' }}>Opacidade</span>
                      <input type="range" min={0} max={100} step={5} value={Math.round(e.opacidade * 100)}
                        onChange={ev => opacidade(e.id, Number(ev.target.value) / 100)}
                        className="flex-1 accent-sky-500" />
                      <span className="w-9 text-right tabular-nums">{Math.round(e.opacidade * 100)}%</span>
                    </label>
                  )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* GRUPOS — o que existe salvo */}
      <section>
        <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: '#94a3b8' }}>Camadas disponíveis</h3>
        {!grupos && <p className="flex items-center gap-2" style={{ color: '#64748b' }}><Loader2 size={12} className="animate-spin" /> Procurando mapas salvos…</p>}
        <div className="flex flex-col gap-1.5">
          {grupos?.map(g => {
            const aberto = abertos.has(g.id);
            const nLigadas = g.itens.filter(i => ligada(i.id)).length;
            return (
              <div key={g.id} className="rounded border" style={{ borderColor: '#1e3a5f', background: '#0a1c30' }}>
                <button onClick={() => alternarGrupo(g.id)} className="flex w-full items-center gap-1.5 p-2 text-left hover:bg-white/5">
                  {aberto ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  <span className="flex-1 font-semibold" style={{ color: '#e2e8f0' }}>{g.nome}</span>
                  {nLigadas > 0 && <span className="rounded px-1.5 text-[10px] font-bold" style={{ background: '#0c4a6e', color: '#7dd3fc' }}>{nLigadas}</span>}
                  <span style={{ color: '#64748b' }}>{g.itens.length || '—'}</span>
                </button>
                {aberto && (
                  <div className="border-t px-2 py-1.5" style={{ borderColor: '#1e3a5f' }}>
                    {g.itens.length === 0 && <p className="py-1" style={{ color: '#64748b' }}>{g.vazio}</p>}
                    {g.itens.map(i => (
                      <label key={i.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-white/5">
                        <input type="checkbox" checked={ligada(i.id)} onChange={() => alternar(i)} className="accent-sky-500" />
                        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: i.cor }} />
                        <span className="min-w-0 flex-1 truncate" title={i.nome}>{i.nome}</span>
                        {i.detalhe && <span className="shrink-0" style={{ color: '#64748b' }}>{i.detalhe}</span>}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
