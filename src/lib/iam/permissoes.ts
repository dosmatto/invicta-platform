'use client';

// IAM — matriz de permissões (módulo × ação) e checagem efetiva.
//
// Compatibilidade: as 13 capacidades antigas (`Capacidade` de empresa.ts)
// continuam funcionando — CAP_PARA_PERM traduz cada uma para o par
// módulo.ação equivalente. Assim os 28 pontos do app que chamam `pode()`
// seguem valendo, e quem tiver permissão granular definida passa a ser
// avaliado pelo modelo novo.

import type {
  AcaoIam, ChavePermissao, MapaPermissoes, ModuloIam, PapelIam,
} from './tipos.ts';
import { ACOES, MODULOS, chavePerm } from './tipos.ts';

// ── Helpers de construção da matriz ─────────────────────────────────────────
const nada = (): MapaPermissoes => ({});

function conceder(mapa: MapaPermissoes, modulos: ModuloIam[], acoes: AcaoIam[]): MapaPermissoes {
  for (const m of modulos) for (const a of acoes) mapa[chavePerm(m, a)] = true;
  return mapa;
}
const TODOS_MODULOS = MODULOS.map(m => m.id);
const TODAS_ACOES = ACOES.map(a => a.id);
const VER = ['visualizar'] as AcaoIam[];
const VER_EXP = ['visualizar', 'exportar'] as AcaoIam[];
const TRABALHAR = ['visualizar', 'criar', 'editar', 'exportar'] as AcaoIam[];

// Módulos "de análise" — o que um agrônomo opera no dia a dia.
const ANALISE: ModuloIam[] = [
  'fertilidade', 'zonas', 'satelite', 'recomendacoes',
  'compactacao', 'produtividade', 'relatorios',
];

// ── Matriz PADRÃO por papel ─────────────────────────────────────────────────
// Espelha o comportamento atual (DEFAULTS_PERMISSOES de empresa.ts), agora
// explícito por módulo/ação. É o ponto de partida; o Owner pode ajustar tudo
// na aba Permissões, e cada usuário pode ter exceções próprias.
export const MATRIZ_PADRAO: Record<PapelIam, MapaPermissoes> = {
  // Owner: tudo (o código já dá bypass, mas a matriz fica coerente na tela).
  owner: conceder(nada(), TODOS_MODULOS, TODAS_ACOES),

  // Admin: tudo, menos administrar usuários (só o Owner mexe em acesso).
  admin: (() => {
    const m = conceder(nada(), TODOS_MODULOS, TODAS_ACOES);
    m['usuarios.administrar'] = false;
    m['usuarios.excluir'] = false;
    return m;
  })(),

  // Agrônomo: análise completa + cadastro/laboratório de leitura e trabalho.
  agronomo: (() => {
    const m = conceder(nada(), ANALISE, TRABALHAR);
    conceder(m, ['zonas'], ['excluir']);                 // editor de zonas mexe/apaga
    conceder(m, ['cadastro', 'amostragem', 'laboratorio', 'biblioteca', 'arquivos'], VER_EXP);
    return m;
  })(),

  // Operador de campo: coleta. Vê o cadastro para navegar; não altera análise.
  operador: (() => {
    const m = conceder(nada(), ['amostragem'], TRABALHAR);
    conceder(m, ['compactacao'], ['visualizar', 'criar', 'editar']);
    conceder(m, ['cadastro', 'fertilidade', 'zonas', 'satelite'], VER);
    return m;
  })(),

  // Produtor: portal — só enxerga (o plano de assinatura ainda filtra seções).
  produtor: conceder(nada(),
    ['cadastro', 'fertilidade', 'recomendacoes', 'compactacao', 'relatorios', 'arquivos'], VER_EXP),

  // Prestador: serviço temporário — mesmo desenho do operador (com validade).
  prestador: (() => {
    const m = conceder(nada(), ['amostragem'], TRABALHAR);
    conceder(m, ['cadastro'], VER);
    return m;
  })(),

  // Somente leitura: vê e exporta, não altera nada.
  leitor: conceder(nada(), TODOS_MODULOS.filter(m => m !== 'usuarios'), VER_EXP),

  // Personalizado: nasce vazio — vale só o que for marcado no usuário.
  custom: nada(),

  // Legado (não atribuíveis na UI; mantidos p/ registros antigos).
  editor: conceder(nada(), TODOS_MODULOS.filter(m => m !== 'usuarios'), TODAS_ACOES),
  viewer: conceder(nada(), TODOS_MODULOS.filter(m => m !== 'usuarios'), VER),
};

// ── Poderes na Central de Acessos ───────────────────────────────────────────
// A tela nasceu inteira gateada em "sou o Owner?", o que contradizia a própria
// matriz acima: o papel ADMIN já tem usuarios.criar/editar/aprovar e só é
// barrado em `administrar` e `excluir`. Resultado prático: o administrador via
// a Central de Acessos em modo leitura — não gerava convite nem aprovava
// cadastro, e todo pendente dependia do dono.
//
// Aqui a matriz vira poder de tela, um por ação, para o Admin recuperar o que o
// papel dele já dizia — sem abrir o que é do dono: empresa/planos, a biblioteca
// de perfis, a matriz padrão e remover acesso.
export interface PoderesAcessos {
  /** Gerar, renovar e cancelar convites (links por tipo e individuais). */
  convidar: boolean;
  /** Aprovar ou rejeitar quem está aguardando aprovação. */
  aprovar: boolean;
  /** Editar dados, papel, categoria, vínculos, permissões, bloquear, senha. */
  editar: boolean;
  /** Remover o acesso de alguém (padrão: só o Owner). */
  excluir: boolean;
  /** Empresa/planos, biblioteca de perfis e matriz padrão (padrão: só o Owner). */
  administrar: boolean;
  /** Algum poder — falso = a tela é só de leitura. */
  algum: boolean;
}

export function poderesDeAcesso(
  pode: (modulo: string, acao: string) => boolean,
): PoderesAcessos {
  const convidar = pode('usuarios', 'criar');
  const aprovar = pode('usuarios', 'aprovar');
  const editar = pode('usuarios', 'editar');
  const excluir = pode('usuarios', 'excluir');
  const administrar = pode('usuarios', 'administrar');
  return {
    convidar, aprovar, editar, excluir, administrar,
    algum: convidar || aprovar || editar || excluir || administrar,
  };
}

/**
 * Trava do dono: o registro de quem tem papel `owner` só é editável ou
 * removível pelo PRÓPRIO Owner.
 *
 * Sem isto, abrir a edição para o Admin abriria junto o caminho para rebaixar
 * o dono — PAPEIS_ATRIBUIVEIS não oferece 'owner', então salvar o papel do dono
 * por outro qualquer o derrubaria, sem volta pela tela.
 */
export function poderesSobreUsuario(
  poderes: PoderesAcessos, papelAlvo: string | undefined, souOwner: boolean,
): { podeEditar: boolean; podeExcluir: boolean } {
  const alvoEhOwner = papelAlvo === 'owner';
  if (alvoEhOwner && !souOwner) return { podeEditar: false, podeExcluir: false };
  return { podeEditar: poderes.editar, podeExcluir: poderes.excluir };
}

// ── Ponte: capacidades antigas → módulo.ação ────────────────────────────────
// Usada por `pode()` (empresa.ts) para avaliar as capacidades legadas dentro do
// modelo novo, sem precisar reescrever os 28 call sites de uma vez.
export const CAP_PARA_PERM: Record<string, ChavePermissao> = {
  cadastro:            'cadastro.editar',
  excluirProdutor:     'cadastro.excluir',
  amostragem:          'amostragem.criar',
  importarLaudo:       'laboratorio.importar',
  fertilidade:         'fertilidade.criar',
  ndvi:                'satelite.criar',
  recomendacoes:       'recomendacoes.criar',
  biblioteca:          'biblioteca.editar',
  relatorios:          'relatorios.exportar',
  zonasUnificar:       'zonas.editar',
  zonasReclassificar:  'zonas.editar',
  zonasDividir:        'zonas.editar',
  zonasSalvar:         'zonas.criar',
};

// ── Permissões efetivas de um registro ──────────────────────────────────────
// Ordem: matriz do papel → exceções do próprio usuário (permissoes).
export function permissoesEfetivas(
  papel: PapelIam | null | undefined,
  excecoes?: MapaPermissoes,
): MapaPermissoes {
  const base = papel ? (MATRIZ_PADRAO[papel] ?? {}) : {};
  return { ...base, ...(excecoes ?? {}) };
}

export function temPermissao(
  perms: MapaPermissoes, modulo: ModuloIam, acao: AcaoIam,
): boolean {
  return perms[chavePerm(modulo, acao)] === true;
}

// Resumo legível ("Fertilidade: ver, criar, editar") — usado no painel lateral.
export function resumoPermissoes(perms: MapaPermissoes): Array<{ modulo: string; acoes: string[] }> {
  const out: Array<{ modulo: string; acoes: string[] }> = [];
  for (const m of MODULOS) {
    const acoes = ACOES.filter(a => perms[chavePerm(m.id, a.id)] === true).map(a => a.curto);
    if (acoes.length) out.push({ modulo: m.nome, acoes });
  }
  return out;
}

export function contarPermissoes(perms: MapaPermissoes): number {
  return Object.values(perms).filter(Boolean).length;
}
