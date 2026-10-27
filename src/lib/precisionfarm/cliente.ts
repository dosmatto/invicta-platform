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
