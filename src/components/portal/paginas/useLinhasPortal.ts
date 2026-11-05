'use client';

// Dados da página Linhas de plantio. Tudo vem das rotas /api/precisionfarm/*
// (as tabelas pf_* não são lidas pelo navegador; o servidor confere o acesso ao
// talhão):
//   1. UM POST de resumo (`linhas-resumo`) diz quais talhões têm linhas;
//   2. só para esses, o estado das camadas (espaçamento, ciclo, operação,
//      revisão, última sincronização) — poucos pedidos por vez;
//   3. a GEOMETRIA só para o talhão escolhido, e só das camadas ligadas.
// Respostas ficam em cache por ~1,5 min (a mesma camada não baixa de novo ao
// voltar para a página). Falha não fica em cache.

import { useEffect, useMemo, useState } from 'react';
import {
  estadoLinhasPF, geometriaLinhasPF, resumoLinhasPF,
  type CamadaLinhasPF, type Resp,
} from '@/lib/precisionfarm/cliente';
import { camadasComLinhas } from '@/lib/portalPainelExtras';

const VALIDADE_MS = 90_000;
const PARALELO = 4;
const MAX_RESUMO = 500;

type Entrada<T> = { em: number; p: Promise<T> };
const cacheResumo = new Map<string, Entrada<Resp<{ comLinhas: string[] }>>>();
const cacheEstado = new Map<string, Entrada<Resp<{ camadas: CamadaLinhasPF[] }>>>();
const cacheGeom = new Map<string, Entrada<Resp<{ geometria: GeoJSON.FeatureCollection }>>>();

function comCache<T extends { ok: boolean }>(cache: Map<string, Entrada<T>>, chave: string, buscar: () => Promise<T>): Promise<T> {
  const e = cache.get(chave);
  if (e && Date.now() - e.em < VALIDADE_MS) return e.p;
  const p = buscar();
  cache.set(chave, { em: Date.now(), p });
  void p.then(r => { if (!r.ok) cache.delete(chave); }, () => cache.delete(chave));
  return p;
}

export type EstadoResumo =
  | { estado: 'carregando' }
  | { estado: 'erro'; motivo: string }
  | { estado: 'ok'; comLinhas: Set<string> };

/** Quais talhões (do escopo) têm linhas. `ids` vazio ou `ligado` falso = não consulta. */
export function useResumoLinhas(ids: string[], ligado: boolean): EstadoResumo {
  const chave = ids.join('|');
  const [res, setRes] = useState<{ chave: string; v: EstadoResumo } | null>(null);
  useEffect(() => {
    if (!ligado || !chave) return;
    let vivo = true;
    comCache(cacheResumo, chave, () => resumoLinhasPF(chave.split('|').slice(0, MAX_RESUMO)))
      .then(r => {
        if (!vivo) return;
        setRes({ chave, v: r.ok ? { estado: 'ok', comLinhas: new Set(r.comLinhas) } : { estado: 'erro', motivo: r.erro } });
      })
      .catch(() => { if (vivo) setRes({ chave, v: { estado: 'erro', motivo: 'Sem conexão com o servidor.' } }); });
    return () => { vivo = false; };
  }, [chave, ligado]);
  if (!ligado) return { estado: 'erro', motivo: 'Sem nuvem.' };
  if (!chave) return { estado: 'ok', comLinhas: new Set() };
  return res && res.chave === chave ? res.v : { estado: 'carregando' };
}

export type CamadasPorTalhao = Record<string, CamadaLinhasPF[] | 'erro'>;

/** Camadas (com linhas, não arquivadas) dos talhões pedidos — vão chegando aos poucos. */
export function useCamadasLinhas(ids: string[]): { camadas: CamadasPorTalhao; pendentes: number } {
  const chave = ids.join('|');
  const [feitos, setFeitos] = useState<CamadasPorTalhao>({});
  useEffect(() => {
    if (!chave) return;
    let vivo = true;
    const fila = chave.split('|');
    const trabalhador = async () => {
      for (let id = fila.shift(); id; id = fila.shift()) {
        const alvo = id;
        let v: CamadasPorTalhao[string];
        try {
          const r = await comCache(cacheEstado, alvo, () => estadoLinhasPF(alvo));
          v = r.ok ? camadasComLinhas(r.camadas) : 'erro';
        } catch { v = 'erro'; }
        if (!vivo) return;
        setFeitos(prev => ({ ...prev, [alvo]: v }));
      }
    };
    for (let i = 0; i < Math.min(PARALELO, fila.length); i++) void trabalhador();
    return () => { vivo = false; };
  }, [chave]);
  const alvo = useMemo(() => new Set(chave ? chave.split('|') : []), [chave]);
  const camadas = useMemo(() => Object.fromEntries(Object.entries(feitos).filter(([id]) => alvo.has(id))), [feitos, alvo]);
  return { camadas, pendentes: [...alvo].filter(id => !(id in feitos)).length };
}

export interface PedidoGeometria { talhaoId: string; resourceId: string; n: number }
export type GeometriasLinhas = Record<string, GeoJSON.FeatureCollection | 'erro'>;
export const chaveGeometria = (p: PedidoGeometria) => `${p.talhaoId}\t${p.resourceId}\t${p.n}`;

/** Geometria das camadas pedidas (um talhão). Cada revisão é um snapshot — não muda. */
export function useGeometriasLinhas(pedidos: PedidoGeometria[]): { geometrias: GeometriasLinhas; carregando: boolean } {
  const chave = pedidos.map(chaveGeometria).join('\n');
  const [feitos, setFeitos] = useState<GeometriasLinhas>({});
  useEffect(() => {
    if (!chave) return;
    let vivo = true;
    for (const k of chave.split('\n')) {
      const [talhaoId, resourceId, n] = k.split('\t');
      comCache(cacheGeom, k, () => geometriaLinhasPF(talhaoId, resourceId, Number(n)))
        .then(r => { if (vivo) setFeitos(prev => ({ ...prev, [k]: r.ok ? r.geometria : 'erro' })); })
        .catch(() => { if (vivo) setFeitos(prev => ({ ...prev, [k]: 'erro' })); });
    }
    return () => { vivo = false; };
  }, [chave]);
  const chaves = chave ? chave.split('\n') : [];
  const geometrias = Object.fromEntries(Object.entries(feitos).filter(([k]) => chaves.includes(k)));
  return { geometrias, carregando: chaves.some(k => !(k in feitos)) };
}
