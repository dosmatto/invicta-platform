'use client';

// Chamadas da tela do talhão às rotas /api/precisionfarm/* (vínculo e
// publicação). A rota exige a SESSÃO: vai o access_token do Supabase em
// Authorization: Bearer, e o servidor confere owner/admin (lib/precisionfarm/
// servidor.ts → autenticarUsuario). Esconder a seção não é a proteção — isto é.

import { getSupabase } from '../supabase';
import { apresentacaoAtiva } from '../empresa';

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
  tipo: 'management_zones' | 'harvest' | 'prescription';
  chaveLocal: string;
  revisao: number;
  nome: string | null;
  season: string | null;
  seasonPeriod: string | null;
  /** 'archive' = prescrição sem estrela (arquivada na PF). */
  operacao?: 'upsert' | 'archive';
  checksum: string;
  boundaryRevision: number;
  publicadoEm: string;
  publicadoPor: string | null;
  tamanhoBytes: number | null;
}

/** `status` na falha: o HTTP da rota (ausente = sem conexão/sessão) — a tela
 *  de lote separa "pulado" (409/422…) de "erro" (lote.ts → desfechoDaFalha). */
export type Resp<T> = ({ ok: true } & T) | { ok: false; erro: string; status?: number };

// POSTs que só LEEM (a lista de ids não cabe na URL). Os demais POSTs gravam.
const POST_SO_LEITURA = new Set(['/api/precisionfarm/linhas-resumo']);

async function chamar<T>(caminho: string, init?: { method?: string; body?: unknown }): Promise<Resp<T>> {
  // Modo apresentação (lib/modoApresentacao.ts): a sessão é a do admin e o
  // servidor decide "gestor" pelo papel REAL — então a trava é aqui, antes de
  // sair: nenhuma rota que grava é chamada enquanto o modo vale.
  if ((init?.method ?? 'GET') !== 'GET' && !POST_SO_LEITURA.has(caminho) && apresentacaoAtiva()) {
    return { ok: false, erro: 'Modo apresentação: nada é gravado.', status: 403 };
  }
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
    if (!corpo) return { ok: false, erro: `Erro ${r.status} no servidor.`, status: r.status };
    if (!r.ok || corpo.ok === false) return { ok: false, erro: corpo.erro ?? `Erro ${r.status} no servidor.`, status: r.status };
    return { ...corpo, ok: true } as Resp<T>;
  } catch {
    return { ok: false, erro: 'Sem conexão com o servidor.' };
  }
}

export const estadoPF = (talhaoId: string) =>
  chamar<{ vinculo: VinculoPF | null; publicados: PublicadoPF[] }>(`/api/precisionfarm/talhao/${encodeURIComponent(talhaoId)}`);

/** `prescricoes`: na confirmação, o resumo das prescrições com estrela que
 *  publicaram junto (texto vazio = nenhuma). */
export const acaoVinculoPF = (talhaoId: string, acao: 'criar' | 'salvar' | 'confirmar' | 'suspender', pfLocalId?: string) =>
  chamar<{ vinculo: VinculoPF; prescricoes?: string }>('/api/precisionfarm/vinculo', { method: 'POST', body: { talhaoId, acao, pfLocalId } });

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
  /** Topografia: { interval_m, index_interval_m, smoothed, cota_min, cota_max, n_mestras }. */
  meta?: Record<string, unknown> | null;
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

/** Modo apresentação: a resposta vem com o papel REAL (owner/admin = gestor);
 *  a tela tem de ver o que o produtor veria — sem Buscar / Tentar de novo. */
function comoProdutorNoModo(r: Resp<EstadoLinhasPF>): Resp<EstadoLinhasPF> {
  if (!r.ok || !apresentacaoAtiva()) return r;
  return {
    ...r, gestor: false, vinculo: null, podeBuscar: false,
    recebimento: { ...r.recebimento, faltando: [] },
    camadas: r.camadas.map(c => ({ ...c, podeTentarDeNovo: false })),
  };
}

export const estadoLinhasPF = (talhaoId: string) =>
  chamar<EstadoLinhasPF>(`/api/precisionfarm/linhas/${encodeURIComponent(talhaoId)}`).then(comoProdutorNoModo);

/** Curvas de nível (topografia 0.3) recebidas da PF — mesmo formato das linhas. */
export const estadoTopografiaPF = (talhaoId: string) =>
  chamar<EstadoLinhasPF>(`/api/precisionfarm/linhas/${encodeURIComponent(talhaoId)}?tipo=topography`).then(comoProdutorNoModo);

export const buscarTopografiaPF = (talhaoId: string) =>
  chamar<{ mensagem: string; novos: number }>('/api/precisionfarm/carga-linhas', { method: 'POST', body: { talhaoId, tipo: 'topography' } });

// ── Prescrições com estrela "Enviar à PrecisionFarm" (extensão 0.3) ──────────

export interface SituacaoPrescricaoPF {
  linhagemId: string;
  versaoId: string | null;
  versao: number | null;
  nome: string | null;
  marcada: boolean;
  situacao: 'publicada' | 'pendente' | 'arquivada' | 'nao_publicada';
  motivo: string | null;
  revisao: number | null;
  resourceId: string | null;
  criada: boolean;
}

type RespPrescricoes = { situacoes: SituacaoPrescricaoPF[]; resumo: string };

/** Situação calculada (nada gravado). Owner/admin. `status` 503 = migração 0.3 pendente. */
export const estadoPrescricoesPF = (talhaoId: string) =>
  chamar<RespPrescricoes>(`/api/precisionfarm/prescricoes/${encodeURIComponent(talhaoId)}`);

/** Marca/desmarca a estrela da linhagem e publica/arquiva na hora. Owner/admin. */
export const marcarPrescricaoPF = (talhaoId: string, linhagemId: string, marcada: boolean) =>
  chamar<RespPrescricoes>('/api/precisionfarm/prescricoes', { method: 'POST', body: { talhaoId, linhagemId, marcada } });

/** Só sincroniza (versão nova salva, exclusão, lote). Quem tem acesso ao talhão. */
export const sincronizarPrescricoesPF = (talhaoId: string) =>
  chamar<RespPrescricoes>('/api/precisionfarm/prescricoes', { method: 'POST', body: { talhaoId } });

export const geometriaLinhasPF = (talhaoId: string, resourceId: string, n: number) =>
  chamar<{ geometria: GeoJSON.FeatureCollection }>(
    `/api/precisionfarm/linhas/${encodeURIComponent(talhaoId)}/revisao?resource=${encodeURIComponent(resourceId)}&n=${n}`);

/** Quais destes talhões têm linhas vigentes (selo na lista da fazenda). */
export const resumoLinhasPF = (talhaoIds: string[]) =>
  chamar<{ comLinhas: string[] }>('/api/precisionfarm/linhas-resumo', { method: 'POST', body: { talhaoIds } });

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

// ── Tela de lote (Biblioteca → PrecisionFarm) ───────────────────────────────

export interface PublicadoLote {
  tipo: PublicadoPF['tipo'];
  season: string | null;
  seasonPeriod: string | null;
  revisao: number;
  publicadoEm: string;
}

export interface VinculoLote extends VinculoPF {
  talhaoId: string;
  fazendaId: string | null;
  clienteId: string | null;
  /** Talhão na nuvem; null = não está lá (apagado, id estranho). */
  naNuvem: { nome: string; geoVersao: number } | null;
  publicados: PublicadoLote[];
  /** Camadas de linhas visíveis (com geometria, não arquivadas). */
  linhas: number;
  /** Prescrições com estrela (última situação registrada); null = migração 0.3 pendente. */
  prescricoes: { ativas: number; publicadas: number; pendentes: number } | null;
}

export const loteGeralPF = () => chamar<{ vinculos: VinculoLote[]; migracao03: string | null }>('/api/precisionfarm/lote');

export interface ResultadoManifesto { talhaoId: string; sharedFieldId: string; nomePF: string; ok: boolean; motivo?: string; substituido?: boolean }

/** `substituir`: troca o vínculo PENDENTE sem ID PF do talhão (Q5 do manifesto v2). */
export const criarVinculosManifestoPF = (itens: Array<{ talhaoId: string; pfLocalId: string; sharedProducerId: string; sharedFarmId: string; sharedFieldId: string; nomePF: string; substituir?: boolean }>) =>
  chamar<{ criados: number; resultados: ResultadoManifesto[] }>('/api/precisionfarm/manifesto', { method: 'POST', body: { itens } });

/** Camadas que contam como "o talhão tem linhas" (aba no portal do produtor). */
export const camadasVisiveisPF = (c: CamadaLinhasPF[]) => c.filter(x => x.revisaoGeometria != null && !x.arquivada);
