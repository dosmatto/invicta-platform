'use client';

// Biblioteca de Padrões — Fase 1.B (esqueleto).
// Camada genérica para todas as categorias da Biblioteca. Cada categoria
// armazena um array de ItemBiblioteca<T> em `inv_bib_{slug}`. T é o conteúdo
// específico (Legenda, PerfilLab, PadraoAmostragem, etc.) — registrado por
// cada adaptador na Fase 2+. Aqui o esqueleto está vazio.
//
// Nada de Firestore neste momento: continua localStorage. A hierarquia
// `/empresas/{eid}/bib/{categoria}/...` entra na Fase 1.5.

import type {
  LucideIcon,
} from 'lucide-react';
import {
  SlidersHorizontal, CalendarDays, Grid3x3, Leaf, Salad, Mountain,
  Satellite, Layers, Calculator, Bug, Hash, Wand2, BarChart3,
  UserCog, FlaskConical, BookOpen,
} from 'lucide-react';
import { empresaAtivaId, uidUsuario } from './empresa';
import { cloudPushLista } from './cloud';
import type { PerfilLabConfig } from './lab';

// ─── Tipos ───────────────────────────────────────────────────────────────

export type EscopoBiblioteca = 'meu' | 'empresa' | 'sistema';

export type CategoriaBiblioteca =
  | 'preferencias-analise' | 'safras' | 'grades' | 'fertilidade'
  | 'analises-foliares' | 'altimetria' | 'imagem-satelite' | 'compactacao'
  | 'algebra-mapas' | 'pragas' | 'equacoes' | 'recomendacoes'
  | 'produtividade' | 'perfis' | 'laboratorios' | 'legendas';

export interface ItemBiblioteca<TConteudo = unknown> {
  id: string;
  categoria: CategoriaBiblioteca;
  nome: string;
  descricao?: string;
  tags?: string[];
  escopo: EscopoBiblioteca;
  donoUsuarioId?: string;       // quando escopo = 'meu'
  empresaId?: string;           // quando escopo = 'empresa'
  ativo: boolean;
  versao: number;
  padraoDe?: { contexto: string; chaveAtiva: string };
  criadoEm: string;
  atualizadoEm: string;
  criadoPor?: string;
  conteudo: TConteudo;
}

// ─── Catálogo de categorias ──────────────────────────────────────────────

export interface DefCategoria {
  slug: CategoriaBiblioteca;
  nome: string;
  descricao: string;
  icone: LucideIcon;
  status: 'disponivel' | 'em-breve';
}

export const CATEGORIAS: DefCategoria[] = [
  { slug: 'preferencias-analise', nome: 'Preferências de Análise', icone: SlidersHorizontal, status: 'em-breve',
    descricao: 'Configurações cross-módulo (unidades, profundidades padrão, etc.).' },
  { slug: 'safras', nome: 'Safras', icone: CalendarDays, status: 'em-breve',
    descricao: 'Safras reutilizáveis. Hoje ainda acessível pelo menu lateral; migra para cá na Fase 4.' },
  { slug: 'grades', nome: 'Grades', icone: Grid3x3, status: 'em-breve',
    descricao: 'Modelos de grade, densidades, padrões de amostragem.' },
  { slug: 'fertilidade', nome: 'Fertilidade', icone: Leaf, status: 'em-breve',
    descricao: 'Regras de interpretação e parâmetros padrão de krigagem/IDW.' },
  { slug: 'analises-foliares', nome: 'Análises Foliares', icone: Salad, status: 'em-breve',
    descricao: 'Modelos de interpretação de análises foliares.' },
  { slug: 'altimetria', nome: 'Altimetria', icone: Mountain, status: 'em-breve',
    descricao: 'Padrões de processamento e classes de elevação/declividade.' },
  { slug: 'imagem-satelite', nome: 'Imagem de Satélite', icone: Satellite, status: 'em-breve',
    descricao: 'NDVI, perfis temporais, índices de vegetação.' },
  { slug: 'compactacao', nome: 'Compactação', icone: Layers, status: 'em-breve',
    descricao: 'Classes e regras para mapas de compactação.' },
  { slug: 'algebra-mapas', nome: 'Álgebra de Mapas', icone: Calculator, status: 'em-breve',
    descricao: 'Expressões e operadores para combinar camadas.' },
  { slug: 'pragas', nome: 'Pragas', icone: Bug, status: 'em-breve',
    descricao: 'Catálogos de pragas, níveis de dano, recomendações.' },
  { slug: 'equacoes', nome: 'Equações', icone: Hash, status: 'em-breve',
    descricao: 'Fórmulas, cálculos e conversões reutilizáveis.' },
  { slug: 'recomendacoes', nome: 'Recomendações', icone: Wand2, status: 'em-breve',
    descricao: 'Regras de recomendação por cultura/objetivo.' },
  { slug: 'produtividade', nome: 'Produtividade', icone: BarChart3, status: 'em-breve',
    descricao: 'Padrões de mapas de colheita e classes de produtividade.' },
  { slug: 'perfis', nome: 'Perfis', icone: UserCog, status: 'disponivel',
    descricao: 'Combina laboratório + padrão de amostragem + legendas por elemento. Selecione um perfil na Fertilidade pra preencher tudo de uma vez.' },
  { slug: 'laboratorios', nome: 'Laboratórios', icone: FlaskConical, status: 'disponivel',
    descricao: 'Perfis de mapeamento de planilhas de laboratório (Fundação ABC, Interpartner, …).' },
  { slug: 'legendas', nome: 'Legendas', icone: BookOpen, status: 'disponivel',
    descricao: 'Repositório de legendas para mapas (fertilidade, NDVI, colheita, condutividade, etc.).' },
];

export const slugsCategorias = (): CategoriaBiblioteca[] => CATEGORIAS.map(c => c.slug);
export const defCategoria = (slug: CategoriaBiblioteca): DefCategoria | undefined =>
  CATEGORIAS.find(c => c.slug === slug);

// ─── Storage helpers ─────────────────────────────────────────────────────

const chaveCat = (slug: CategoriaBiblioteca) => `inv_bib_${slug}`;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

function load<T>(slug: CategoriaBiblioteca): ItemBiblioteca<T>[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(chaveCat(slug)) ?? '[]'); } catch { return []; }
}
function save<T>(slug: CategoriaBiblioteca, data: ItemBiblioteca<T>[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(chaveCat(slug), JSON.stringify(data));
  cloudPushLista(chaveCat(slug), data); // espelha na nuvem se a chave estiver na lista (no-op caso contrário)
  window.dispatchEvent(new CustomEvent('inv:biblioteca', { detail: { slug } }));
}

// ─── CRUD genérico ───────────────────────────────────────────────────────

export function listar<T = unknown>(slug: CategoriaBiblioteca, escopo?: EscopoBiblioteca): ItemBiblioteca<T>[] {
  const todos = load<T>(slug);
  const u = uidUsuario();
  const e = empresaAtivaId();
  return todos.filter(it => {
    if (escopo && it.escopo !== escopo) return false;
    if (it.escopo === 'meu') return it.donoUsuarioId === u;
    if (it.escopo === 'empresa') return it.empresaId === e;
    return true; // sistema é visível pra todos
  });
}

export function obter<T = unknown>(slug: CategoriaBiblioteca, id: string): ItemBiblioteca<T> | undefined {
  return load<T>(slug).find(i => i.id === id);
}

export function criar<T = unknown>(
  slug: CategoriaBiblioteca,
  partes: Omit<ItemBiblioteca<T>, 'id' | 'categoria' | 'criadoEm' | 'atualizadoEm' | 'versao' | 'ativo' | 'escopo' | 'donoUsuarioId' | 'empresaId' | 'criadoPor'>
    & { escopo?: EscopoBiblioteca; ativo?: boolean },
): ItemBiblioteca<T> {
  const agora = new Date().toISOString();
  const u = uidUsuario();
  const e = empresaAtivaId() ?? undefined;
  const escopo: EscopoBiblioteca = partes.escopo ?? 'meu';
  const it: ItemBiblioteca<T> = {
    ...partes,
    id: uid(),
    categoria: slug,
    escopo,
    donoUsuarioId: escopo === 'meu' ? u : undefined,
    empresaId: escopo === 'empresa' ? e : undefined,
    ativo: partes.ativo ?? true,
    versao: 1,
    criadoEm: agora,
    atualizadoEm: agora,
    criadoPor: u,
  };
  const lista = load<T>(slug);
  lista.push(it);
  save(slug, lista);
  return it;
}

export function atualizar<T = unknown>(
  slug: CategoriaBiblioteca, id: string,
  patch: Partial<Omit<ItemBiblioteca<T>, 'id' | 'categoria' | 'criadoEm' | 'versao'>>,
) {
  const lista = load<T>(slug);
  const idx = lista.findIndex(i => i.id === id);
  if (idx < 0) return;
  lista[idx] = { ...lista[idx], ...patch, versao: lista[idx].versao + 1, atualizadoEm: new Date().toISOString() };
  save(slug, lista);
}

export function duplicar<T = unknown>(slug: CategoriaBiblioteca, id: string): ItemBiblioteca<T> | undefined {
  const orig = obter<T>(slug, id);
  if (!orig) return;
  return criar<T>(slug, {
    nome: `${orig.nome} (cópia)`,
    descricao: orig.descricao,
    tags: orig.tags ? [...orig.tags] : undefined,
    conteudo: orig.conteudo,
    padraoDe: orig.padraoDe,
    escopo: 'meu', // duplicações sempre nascem privadas
  });
}

export function excluir(slug: CategoriaBiblioteca, id: string) {
  save(slug, load(slug).filter(i => i.id !== id));
}

export function ativar(slug: CategoriaBiblioteca, id: string, ativo: boolean) {
  atualizar(slug, id, { ativo });
}

export function compartilhar(slug: CategoriaBiblioteca, id: string, novoEscopo: EscopoBiblioteca) {
  const u = uidUsuario();
  const e = empresaAtivaId() ?? undefined;
  atualizar(slug, id, {
    escopo: novoEscopo,
    donoUsuarioId: novoEscopo === 'meu' ? u : undefined,
    empresaId: novoEscopo === 'empresa' ? e : undefined,
  });
}

// ─── Import / Export JSON ───────────────────────────────────────────────

export function exportar<T = unknown>(slug: CategoriaBiblioteca, ids?: string[]): string {
  const todos = load<T>(slug);
  const sel = ids?.length ? todos.filter(i => ids.includes(i.id)) : todos;
  return JSON.stringify({ categoria: slug, exportadoEm: new Date().toISOString(), itens: sel }, null, 2);
}

export function importar<T = unknown>(slug: CategoriaBiblioteca, json: string): number {
  let payload: { itens?: ItemBiblioteca<T>[]; categoria?: CategoriaBiblioteca };
  try { payload = JSON.parse(json); } catch { throw new Error('JSON inválido'); }
  if (!payload.itens || !Array.isArray(payload.itens)) throw new Error('Estrutura inválida (faltam itens)');
  if (payload.categoria && payload.categoria !== slug) {
    throw new Error(`Arquivo é da categoria ${payload.categoria}, não ${slug}`);
  }
  const lista = load<T>(slug);
  const porId = new Map(lista.map(i => [i.id, i] as const));
  for (const it of payload.itens) {
    if (porId.has(it.id)) {
      const idx = lista.findIndex(i => i.id === it.id);
      lista[idx] = it;
    } else {
      lista.push(it);
    }
  }
  save(slug, lista);
  return payload.itens.length;
}

// ─── Helpers de baixo nível para os wrappers de retrocompat (store.ts) ────

export function _bibLoadRaw<T = unknown>(slug: CategoriaBiblioteca): ItemBiblioteca<T>[] {
  return load<T>(slug);
}
export function _bibSaveRaw<T = unknown>(slug: CategoriaBiblioteca, data: ItemBiblioteca<T>[]) {
  save(slug, data);
}

// ─── Migrações idempotentes ──────────────────────────────────────────────

// Fase 3 — perfis de laboratório: inv_lab_perfis → inv_bib_laboratorios.
// Idempotente: marca uma flag local; preserva ids; não sobrescreve itens
// já presentes na biblioteca; mantém a chave antiga intacta (rollback fácil).
export interface ConteudoLaboratorio {
  config: PerfilLabConfig;
}

// Fase 4 — perfil agronômico (categoria 'perfis'). Refers Lab + PadrAmos +
// Legendas por elemento. Todos opcionais; é só um preset que pré-preenche
// as escolhas no Fertilidade. Não duplica os itens originais — só referencia.
export interface ConteudoPerfil {
  laboratorioId?: string;                          // FK Lab: builtin id ou item da biblioteca
  padraoAmostragemId?: string;                     // FK PadraoAmostragem (inv_padroes_amos)
  legendasPorElemento?: Record<string, string>;    // elementoId -> legendaId (inv_legendas)
}

export function migrarLaboratoriosV1() {
  if (typeof window === 'undefined') return;
  const FLAG = 'inv_migrado_lab_v1';
  if (localStorage.getItem(FLAG) === '1') return;

  type PerfilAntigo = { id: string; nome: string; config: PerfilLabConfig; criadoEm: string; empresaId?: string };
  let antigos: PerfilAntigo[] = [];
  try { antigos = JSON.parse(localStorage.getItem('inv_lab_perfis') ?? '[]'); } catch {}

  if (antigos.length === 0) {
    localStorage.setItem(FLAG, '1');
    return;
  }

  const lista = load<ConteudoLaboratorio>('laboratorios');
  const idsExistentes = new Set(lista.map(i => i.id));
  const u = uidUsuario();
  let adicionou = false;

  for (const p of antigos) {
    if (idsExistentes.has(p.id)) continue;
    const escopo: EscopoBiblioteca = p.empresaId ? 'empresa' : 'meu';
    lista.push({
      id: p.id,
      categoria: 'laboratorios',
      nome: p.nome,
      escopo,
      donoUsuarioId: escopo === 'meu' ? u : undefined,
      empresaId: escopo === 'empresa' ? p.empresaId : undefined,
      ativo: true,
      versao: 1,
      criadoEm: p.criadoEm,
      atualizadoEm: p.criadoEm,
      criadoPor: u,
      conteudo: { config: p.config },
    });
    adicionou = true;
  }
  if (adicionou) save('laboratorios', lista);
  localStorage.setItem(FLAG, '1');
}
