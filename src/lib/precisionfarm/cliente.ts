'use client';

// Chamadas da tela do talhão às rotas /api/precisionfarm/* (vínculo e
// publicação). A rota exige a SESSÃO: vai o access_token do Supabase em
// Authorization: Bearer, e o servidor confere owner/admin (lib/precisionfarm/
// servidor.ts → autenticarUsuario). Esconder a seção não é a proteção — isto é.

import { getSupabase } from '../supabase';

export interface VinculoPF {
  status: 'pendente' | 'confirmado' | 'suspenso';
  sharedProducerId: string;
  sharedFarmId: string;
  sharedFieldId: string;
  pfLocalId: string | null;
  criadoPor: string | null; criadoEm: string;
  confirmadoPor: string | null; confirmadoEm: string | null;
  suspensoPor: string | null; suspensoEm: string | null;
}

export interface PublicadoPF {
  resourceId: string;
  tipo: 'management_zones' | 'harvest';
  chaveLocal: string;
  revisao: number;
  nome: string | null;
  season: string | null;
  seasonPeriod: string | null;
  checksum: string;
  boundaryRevision: number;
  publicadoEm: string;
  publicadoPor: string | null;
  tamanhoBytes: number | null;
}

export type Resp<T> = ({ ok: true } & T) | { ok: false; erro: string };

async function chamar<T>(caminho: string, init?: { method?: string; body?: unknown }): Promise<Resp<T>> {
  const sb = getSupabase();
  const token = sb ? (await sb.auth.getSession()).data.session?.access_token : null;
  if (!token) return { ok: false, erro: 'Sessão ausente — entre na plataforma com a nuvem ligada.' };
  try {
    const r = await fetch(caminho, {
      method: init?.method ?? 'GET',
      headers: { Authorization: `Bearer ${token}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });
    const corpo = await r.json().catch(() => null) as ({ ok?: boolean; erro?: string } & T) | null;
    if (!corpo) return { ok: false, erro: `Erro ${r.status} no servidor.` };
    if (!r.ok || corpo.ok === false) return { ok: false, erro: corpo.erro ?? `Erro ${r.status} no servidor.` };
    return { ...corpo, ok: true } as Resp<T>;
  } catch {
    return { ok: false, erro: 'Sem conexão com o servidor.' };
  }
}

export const estadoPF = (talhaoId: string) =>
  chamar<{ vinculo: VinculoPF | null; publicados: PublicadoPF[] }>(`/api/precisionfarm/talhao/${encodeURIComponent(talhaoId)}`);

export const acaoVinculoPF = (talhaoId: string, acao: 'criar' | 'salvar' | 'confirmar' | 'suspender', pfLocalId?: string) =>
  chamar<{ vinculo: VinculoPF }>('/api/precisionfarm/vinculo', { method: 'POST', body: { talhaoId, acao, pfLocalId } });

export interface ResultadoPublicacao { criada: boolean; revisao: number; checksum: string; mensagem?: string; tamanhoBytes?: number; nFeicoes?: number }

export const publicarZonasPF = (talhaoId: string, zoneamentoId: string | null, geoVersao: number) =>
  chamar<ResultadoPublicacao>('/api/precisionfarm/publicar', { method: 'POST', body: { talhaoId, tipo: 'zonas', zoneamentoId, geoVersao } });

export const publicarColheitaPF = (talhaoId: string, mapaId: string, geoVersao: number) =>
  chamar<ResultadoPublicacao>('/api/precisionfarm/publicar', { method: 'POST', body: { talhaoId, tipo: 'colheita', mapaId, geoVersao } });

// ── Fase 2: linhas RECEBIDAS da PrecisionFarm (aba Linhas) ──────────────────
// Leitura para todos com acesso ao talhão; "Buscar" só owner/admin.

export interface RevisaoLinhasPF {
  n: number;
  operacao: 'upsert' | 'archive';
  recebidoEm: string;
  checksum: string;
  nFeicoes: number | null;
  boundaryRevision: number;
  /** Ex.: feições que vieram sem `kind` (desenhadas como linha guia). */
  observacao: string | null;
}

export interface CamadaLinhasPF {
  resourceId: string;
  nome: string | null;
  integrationName: string | null;
  ciclo: string | null;
  categoria: string | null;
  espacamentoM: number | null;
  origem: 'PrecisionFarm';
  revisaoVigente: number | null;
  revisaoGeometria: number | null;
  boundaryRevision: number | null;
  arquivada: boolean;
  arquivadaEm: string | null;
  ultimaSincronizacao: string | null;
  situacao: 'atualizado' | 'sincronizando' | 'erro';
  motivo: string | null;
  /** Próximo horário de tentativa dos avisos na fila (a tela espera até lá). */
  proximaTentativaEm: string | null;
  /** Owner/admin, configurado e há aviso recusado: mostra "Tentar de novo". */
  podeTentarDeNovo: boolean;
  revisoes: RevisaoLinhasPF[];
  recusadas: Array<{ n: number; motivo: string | null; em: string | null }>;
}

export interface EstadoLinhasPF {
  recebimento: { configurado: boolean; mensagem: string | null; faltando: string[] };
  gestor: boolean;
  vinculo: { status: VinculoPF['status'] } | null;
  podeBuscar: boolean;
  camadas: CamadaLinhasPF[];
}

export const estadoLinhasPF = (talhaoId: string) =>
  chamar<EstadoLinhasPF>(`/api/precisionfarm/linhas/${encodeURIComponent(talhaoId)}`);

export const geometriaLinhasPF = (talhaoId: string, resourceId: string, n: number) =>
  chamar<{ geometria: GeoJSON.FeatureCollection }>(
    `/api/precisionfarm/linhas/${encodeURIComponent(talhaoId)}/revisao?resource=${encodeURIComponent(resourceId)}&n=${n}`);

export const buscarLinhasPF = (talhaoId: string) =>
  chamar<{ mensagem: string; novos: number }>('/api/precisionfarm/carga-linhas', { method: 'POST', body: { talhaoId } });

export const tentarDeNovoLinhasPF = (talhaoId: string, resourceId: string) =>
  chamar<{ mensagem: string; reabertos: number }>('/api/precisionfarm/reprocessar-linhas', { method: 'POST', body: { talhaoId, resourceId } });

// ── Limite publicado pela PrecisionFarm (comparar / adotar) ─────────────────
// Owner/admin, vínculo confirmado. Mesmo formato de lib/precisionfarm/limite.ts
// (LimitePF) — repetido aqui porque aquele módulo é só do servidor.

export interface LimitePFTela {
  geometria: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  partes: number; furos: number; vertices: number;
  resourceId: string;
  revisao: number;
  boundaryRevision: number;
  data: string | null;
  nome: string | null;
  checksum: string | null;
  conferencia: 'checksum' | 'basica';
  itensNoInventario: number;
}

export const limitePF = (talhaoId: string) =>
  chamar<{ limite: LimitePFTela }>(`/api/precisionfarm/limite/${encodeURIComponent(talhaoId)}`);

/** Camadas que contam como "o talhão tem linhas" (aba no portal do produtor). */
export const camadasVisiveisPF = (c: CamadaLinhasPF[]) => c.filter(x => x.revisaoGeometria != null && !x.arquivada);
