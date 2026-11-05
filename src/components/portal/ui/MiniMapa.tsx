'use client';

// Mini-mapa dos cartões do portal — SVG, sem MapLibre.
//
// · Modo LEVE (padrão): os talhões projetados (lib/portalPainel.projetarMapa),
//   cada um pintado com `corDe(id)` — a cor da classe/média do talhão. Zero
//   rede: é o que deixa a Visão geral rápida com dezenas de talhões.
// · Modo REAL: para cada talhão com `camadaReal(id)`, o raster de verdade
//   (cloudCarregarMapa → colorir) desenhado como <image> nos bounds projetados,
//   recortado pelo polígono (clipPath); ou uma camada VETORIAL local (zonas).
//   Só carrega quando o mapa está VISÍVEL (IntersectionObserver), UM raster por
//   vez em toda a página (fila global) e com cache em memória — a mesma camada
//   em outro cartão/página não baixa de novo (e cloudCarregarMapa ainda tem o
//   cache do IndexedDB). Talhão sem raster fica na cor leve. Sem nuvem
//   (bancada local), camadas da nuvem caem para o leve com aviso discreto.
//
// `camadaReal` deve ser estável (useCallback) — ela define o que carregar.

import { useEffect, useId, useMemo, useReducer, useRef, useState } from 'react';
import { Loader2, Map as MapaIcone } from 'lucide-react';
import { projetarMapa, caminhoGeo, caixaDosBounds } from '@/lib/portalPainel';
import { cloudCarregarMapa } from '@/lib/cloud';
import { usarDadosSupabase } from '@/lib/supabaseData';
import { COR } from './formato';
import { useModoMapa, type ModoMapa } from './modoMapa';

export type DesenhoReal =
  | { tipo: 'raster'; url: string; bounds: [number, number, number, number] }
  | { tipo: 'vetor'; geojson: unknown; cor: (props: Record<string, unknown>) => string };

export interface CamadaReal {
  /** Identidade da camada no cache (inclua a legenda/colorização se variar). */
  chave: string;
  /** Mapa na nuvem (inv_mapas_fert). Ausente = camada LOCAL (sem rede). */
  mapaId?: string;
  /** `atualizadoEm` da listagem leve — valida o cache do IndexedDB. */
  atualizadoEm?: string | null;
  /** Documento carregado → desenho. */
  colorir?: (dados: unknown) => Promise<DesenhoReal | null> | DesenhoReal | null;
  /** Alternativa a mapaId+colorir: carrega e desenha sozinho. */
  carregar?: () => Promise<DesenhoReal | null>;
  /** true = precisa da nuvem (padrão: true quando há mapaId ou carregar). */
  nuvem?: boolean;
}

export interface TalhaoMini { id: string; nome?: string; geojson?: string | null }

// ── Cache e fila global ─────────────────────────────────────────────────────
const resolvidos = new Map<string, DesenhoReal | null>();
const emAndamento = new Map<string, Promise<void>>();
let fila: Promise<unknown> = Promise.resolve();
const precisaNuvem = (c: CamadaReal) => c.nuvem ?? (!!c.mapaId || !!c.carregar);

function carregarCamada(c: CamadaReal): Promise<void> {
  const existente = emAndamento.get(c.chave);
  if (existente) return existente;
  const executar = async () => {
    try {
      let d: DesenhoReal | null = null;
      if (c.carregar) d = await c.carregar();
      else if (c.mapaId && c.colorir) {
        const doc = await cloudCarregarMapa<unknown>(c.mapaId, c.atualizadoEm ?? undefined);
        d = doc ? await c.colorir(doc.dados) : null;
      } else if (c.colorir) d = await c.colorir(null);
      resolvidos.set(c.chave, d);
    } catch (e) {
      console.warn('[portal] mapa real não carregou:', c.chave, e);
      resolvidos.set(c.chave, null);
    } finally {
      emAndamento.delete(c.chave);
    }
  };
  // Rede: um por vez (fila). Local: na hora.
  const p = precisaNuvem(c) ? (fila = fila.then(executar, executar)) as Promise<void> : executar();
  emAndamento.set(c.chave, p);
  return p;
}

// Caminhos das feições vetoriais por desenho+quadro (evita reprojetar a cada hover).
const caminhosVetor = new WeakMap<object, Map<string, Array<{ d: string; cor: string }>>>();
function caminhosDe(des: Extract<DesenhoReal, { tipo: 'vetor' }>, quadro: string, ponto: (lng: number, lat: number) => [number, number]) {
  let porQuadro = caminhosVetor.get(des);
  if (!porQuadro) { porQuadro = new Map(); caminhosVetor.set(des, porQuadro); }
  let l = porQuadro.get(quadro);
  if (!l) {
    const geo = typeof des.geojson === 'string' ? (() => { try { return JSON.parse(des.geojson as string); } catch { return null; } })() : des.geojson;
    const feats = (geo as { features?: Array<{ geometry?: unknown; properties?: Record<string, unknown> }> } | null)?.features ?? [];
    l = feats.map(f => ({ d: caminhoGeo(f.geometry, ponto), cor: des.cor(f.properties ?? {}) })).filter(x => x.d);
    porQuadro.set(quadro, l);
  }
  return l;
}

export function MiniMapa({ talhoes, corDe, rotulo, modo, camadaReal, onClicar, altura = 220, nomes, destaque, className, aria }: {
  talhoes: TalhaoMini[];
  /** Cor leve do talhão (classe/média); null = sem dado (cinza). */
  corDe: (id: string) => string | null;
  /** Texto do valor no realce ("62,3 sc/ha"). */
  rotulo?: (id: string) => string | null;
  /** Força o modo; sem ele vale o alternador do cabeçalho. */
  modo?: ModoMapa;
  camadaReal?: (id: string) => CamadaReal | null;
  onClicar?: (id: string) => void;
  altura?: number;
  /** Escreve o nome dentro do talhão quando cabe. */
  nomes?: boolean;
  destaque?: string | null;
  className?: string;
  aria?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const modoCtx = useModoMapa();
  const modoEfetivo = modo ?? modoCtx;
  const nuvem = usarDadosSupabase();
  const LARG = 600;
  const proj = useMemo(() => projetarMapa(talhoes.map(t => ({ id: t.id, geojson: t.geojson })), LARG, Math.round(LARG * (altura / 380)), 10), [talhoes, altura]);
  const nomeDe = useMemo(() => new Map(talhoes.map(t => [t.id, t.nome ?? ''])), [talhoes]);
  const pedidos = useMemo(() => (modoEfetivo === 'real' && camadaReal ? proj.formas.map(f => ({ id: f.id, camada: camadaReal(f.id) })) : []), [modoEfetivo, camadaReal, proj]);
  // Sem nuvem (bancada), as camadas da nuvem nem chegam a existir (a listagem
  // leve vem vazia): o aviso vale sempre que o cartão tem camada real e nenhuma
  // é local (as zonas são vetor local e desenham mesmo assim).
  const pendentesNuvem = modoEfetivo === 'real' && !!camadaReal && !nuvem && !pedidos.some(p => p.camada && !precisaNuvem(p.camada));

  const caixa = useRef<HTMLDivElement>(null);
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    const el = caixa.current;
    if (!el || visivel) return;
    if (typeof IntersectionObserver === 'undefined') { queueMicrotask(() => setVisivel(true)); return; }
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setVisivel(true); io.disconnect(); } }, { rootMargin: '120px' });
    io.observe(el);
    return () => io.disconnect();
  }, [visivel]);

  const [, redesenhar] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!visivel || !pedidos.length) return;
    let vivo = true;
    for (const p of pedidos) {
      const c = p.camada;
      if (!c || resolvidos.has(c.chave)) continue;
      if (precisaNuvem(c) && !nuvem) continue;
      carregarCamada(c).then(() => { if (vivo) redesenhar(); });
    }
    return () => { vivo = false; };
  }, [visivel, pedidos, nuvem]);

  const [sobre, setSobre] = useState<string | null>(null);
  const comCamada = pedidos.filter(p => p.camada && (!precisaNuvem(p.camada) || nuvem));
  const prontos = comCamada.filter(p => resolvidos.has(p.camada!.chave)).length;
  const carregando = visivel && comCamada.length > 0 && prontos < comCamada.length;

  if (!proj.formas.length || !proj.ponto) {
    return (
      <div className={`rounded-xl flex flex-col items-center justify-center gap-1 text-xs ${className ?? ''}`} style={{ height: altura, background: 'var(--p-mapa-fundo)', color: COR.texto2 }}>
        <MapaIcone size={18} /> Sem limite de talhão para desenhar.
      </div>
    );
  }
  const ponto = proj.ponto;
  const ativo = sobre ?? destaque ?? null;
  const txtAtivo = ativo ? [nomeDe.get(ativo), rotulo?.(ativo)].filter(Boolean).join(' · ') : '';

  return (
    <div ref={caixa} className={`relative rounded-xl overflow-hidden ${className ?? ''}`} style={{ height: altura, background: 'var(--p-mapa-fundo)' }}>
      <svg viewBox={proj.viewBox} preserveAspectRatio="xMidYMid meet" role="img" aria-label={aria ?? 'Mapa dos talhões'}
        style={{ width: '100%', height: '100%', display: 'block' }} onMouseLeave={() => setSobre(null)}>
        <defs>
          <pattern id={`${uid}-grade`} width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M24 0H0V24" fill="none" stroke="var(--border-color)" strokeWidth="0.6" opacity="0.7" />
          </pattern>
          {proj.formas.map((f, i) => <clipPath key={f.id} id={`${uid}-c${i}`}><path d={f.d} clipRule="evenodd" /></clipPath>)}
        </defs>
        <rect x="0" y="0" width={proj.largura} height={proj.altura} fill={`url(#${uid}-grade)`} />
        {proj.formas.map((f, i) => {
          const p = pedidos.find(x => x.id === f.id);
          const des = p?.camada ? resolvidos.get(p.camada.chave) : undefined;
          const cor = corDe(f.id);
          const realce = ativo === f.id;
          return (
            <g key={f.id}>
              <path d={f.d} fill={cor ?? 'var(--p-sem-dado)'} fillOpacity={des ? 0.3 : cor ? 0.92 : 0.7} fillRule="evenodd" />
              {des?.tipo === 'raster' && (() => {
                const b = caixaDosBounds(des.bounds, ponto);
                return <image href={des.url} x={b.x} y={b.y} width={b.w} height={b.h} preserveAspectRatio="none" clipPath={`url(#${uid}-c${i})`} style={{ imageRendering: 'pixelated' }} />;
              })()}
              {des?.tipo === 'vetor' && (
                <g clipPath={`url(#${uid}-c${i})`}>
                  {caminhosDe(des, proj.viewBox, ponto).map((z, k) => <path key={k} d={z.d} fill={z.cor} fillOpacity={0.9} stroke="var(--p-contorno)" strokeWidth={0.8} fillRule="evenodd" />)}
                </g>
              )}
              <path d={f.d} fill="transparent" fillRule="evenodd" stroke={realce ? 'var(--text-primary)' : 'var(--p-contorno)'} strokeWidth={realce ? 2.6 : 1.4} strokeLinejoin="round"
                onMouseEnter={() => setSobre(f.id)} onClick={() => onClicar?.(f.id)} style={{ cursor: onClicar ? 'pointer' : 'default' }}>
                <title>{[nomeDe.get(f.id), rotulo?.(f.id)].filter(Boolean).join(' · ')}</title>
              </path>
              {nomes && f.w > 46 && f.h > 18 && (
                <text x={f.cx} y={f.cy} textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(15, Math.max(10, f.w / 7))} fontWeight={700}
                  fill="#fff" stroke="rgba(0,0,0,0.45)" strokeWidth={2.4} paintOrder="stroke" pointerEvents="none">
                  {(nomeDe.get(f.id) ?? '').split(/\s+/).pop()}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {txtAtivo && (
        <span className="absolute left-2 top-2 max-w-[85%] truncate rounded-lg px-2 py-1 text-[11px] font-bold pointer-events-none"
          style={{ background: 'color-mix(in srgb, var(--bg-surface) 88%, transparent)', color: COR.texto, boxShadow: 'var(--p-sombra)' }}>
          {txtAtivo}
        </span>
      )}
      {modoEfetivo === 'real' && (carregando || pendentesNuvem) && (
        <span className="absolute left-2 bottom-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10.5px] font-semibold"
          style={{ background: 'color-mix(in srgb, var(--bg-surface) 88%, transparent)', color: COR.texto2 }}>
          {pendentesNuvem ? 'Mapas reais ficam na nuvem — mostrando a visão leve' : <><Loader2 size={11} className="animate-spin" /> carregando mapas {prontos}/{comCamada.length}</>}
        </span>
      )}
    </div>
  );
}
