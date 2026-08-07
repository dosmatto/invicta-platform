'use client';

// IAM — Gestão de Identidade e Acessos. Tipos e vocabulário.
//
// Decisões estruturais (ver docs/iam.md):
// 1. CATEGORIA (quem a pessoa é) é SEPARADA de PAPEL (o que ela pode fazer).
//    Antes a categoria era derivada do papel, então não dava para ter um
//    "Gerente" e um "Consultor" ambos com papel de agrônomo.
// 2. PERMISSÃO é um par MÓDULO × AÇÃO (visualizar/criar/editar/excluir/
//    exportar/importar/aprovar/administrar), no lugar das 13 capacidades
//    booleanas antigas — que misturavam funcionalidade e verbo.
// 3. Tudo continua no MESMO registro por e-mail (inv_papeis): os campos novos
//    são opcionais, então a migração não tira o acesso de ninguém.

import type { PapelMembro } from '../empresa';

// ── Categoria (quem é a pessoa) ─────────────────────────────────────────────
export type CategoriaIam =
  | 'interno' | 'produtor' | 'gerente' | 'consultor' | 'revenda'
  | 'parceiro' | 'prestador' | 'pesquisador' | 'cliente';

export const CATEGORIAS: Array<{ id: CategoriaIam; nome: string; dica: string }> = [
  { id: 'interno',     nome: 'Interno',     dica: 'Equipe da Invicta' },
  { id: 'produtor',    nome: 'Produtor',    dica: 'Dono da área (portal do produtor)' },
  { id: 'gerente',     nome: 'Gerente',     dica: 'Gerente da fazenda/do produtor' },
  { id: 'consultor',   nome: 'Consultor',   dica: 'Consultoria externa' },
  { id: 'revenda',     nome: 'Revenda',     dica: 'Revenda parceira' },
  { id: 'parceiro',    nome: 'Parceiro',    dica: 'Parceiro comercial/técnico' },
  { id: 'prestador',   nome: 'Prestador',   dica: 'Serviço temporário (com validade)' },
  { id: 'pesquisador', nome: 'Pesquisador', dica: 'Pesquisa/experimentação' },
  { id: 'cliente',     nome: 'Cliente',     dica: 'Cliente sem vínculo de produção' },
];

// ── Papel (o que pode fazer) ────────────────────────────────────────────────
// Mantém os ids antigos (owner/admin/agronomo/operador/produtor/prestador) para
// não quebrar os 28 pontos que já chamam pode(); acrescenta leitor e custom.
export type PapelIam = PapelMembro | 'leitor' | 'custom';

export const PAPEIS: Array<{ id: PapelIam; nome: string; dica: string }> = [
  { id: 'owner',     nome: 'Owner',          dica: 'Controle total, inclusive usuários' },
  { id: 'admin',     nome: 'Administrador',  dica: 'Tudo, menos trocar o Owner' },
  { id: 'agronomo',  nome: 'Agrônomo',       dica: 'Análises, mapas e relatórios' },
  { id: 'operador',  nome: 'Operador',       dica: 'Coleta em campo' },
  { id: 'produtor',  nome: 'Produtor',       dica: 'Portal do produtor (só as áreas dele)' },
  { id: 'prestador', nome: 'Prestador',      dica: 'Acesso temporário' },
  { id: 'leitor',    nome: 'Somente leitura', dica: 'Vê, não altera nada' },
  { id: 'custom',    nome: 'Personalizado',  dica: 'Permissões definidas uma a uma' },
];

// ── Módulos e ações (permissão granular) ────────────────────────────────────
export type ModuloIam =
  | 'cadastro' | 'amostragem' | 'laboratorio' | 'fertilidade' | 'zonas'
  | 'satelite' | 'recomendacoes' | 'compactacao' | 'produtividade'
  | 'relatorios' | 'biblioteca' | 'arquivos' | 'usuarios';

export const MODULOS: Array<{ id: ModuloIam; nome: string }> = [
  { id: 'cadastro',      nome: 'Cadastro (produtores/fazendas/talhões)' },
  { id: 'amostragem',    nome: 'Amostragem e coleta' },
  { id: 'laboratorio',   nome: 'Laboratório (laudos)' },
  { id: 'fertilidade',   nome: 'Fertilidade (interpolação)' },
  { id: 'zonas',         nome: 'Zonas de manejo' },
  { id: 'satelite',      nome: 'Satélite (NDVI/índices)' },
  { id: 'recomendacoes', nome: 'Recomendações e doses' },
  { id: 'compactacao',   nome: 'Compactação' },
  { id: 'produtividade', nome: 'Produtividade/colheita' },
  { id: 'relatorios',    nome: 'Relatórios' },
  { id: 'biblioteca',    nome: 'Biblioteca (legendas/equações/perfis)' },
  { id: 'arquivos',      nome: 'Arquivos de aplicação' },
  { id: 'usuarios',      nome: 'Usuários e permissões' },
];

export type AcaoIam =
  | 'visualizar' | 'criar' | 'editar' | 'excluir'
  | 'exportar' | 'importar' | 'aprovar' | 'administrar';

export const ACOES: Array<{ id: AcaoIam; nome: string; curto: string }> = [
  { id: 'visualizar',  nome: 'Visualizar',  curto: 'Ver' },
  { id: 'criar',       nome: 'Criar',       curto: 'Criar' },
  { id: 'editar',      nome: 'Editar',      curto: 'Editar' },
  { id: 'excluir',     nome: 'Excluir',     curto: 'Excluir' },
  { id: 'exportar',    nome: 'Exportar',    curto: 'Export' },
  { id: 'importar',    nome: 'Importar',    curto: 'Import' },
  { id: 'aprovar',     nome: 'Aprovar',     curto: 'Aprovar' },
  { id: 'administrar', nome: 'Administrar', curto: 'Admin' },
];

// Mapa de permissões: 'modulo.acao' → true. Ausente = negado.
export type ChavePermissao = `${ModuloIam}.${AcaoIam}`;
export type MapaPermissoes = Partial<Record<ChavePermissao, boolean>>;
export const chavePerm = (m: ModuloIam, a: AcaoIam): ChavePermissao => `${m}.${a}`;

// ── Status do usuário ───────────────────────────────────────────────────────
export type StatusIam =
  | 'ativo' | 'convite_enviado' | 'aguardando_aprovacao' | 'bloqueado' | 'inativo' | 'rejeitado';

export const STATUS: Array<{ id: StatusIam; nome: string; cor: string }> = [
  { id: 'ativo',                nome: 'Ativo',                 cor: '#4ade80' },
  { id: 'convite_enviado',      nome: 'Convite enviado',       cor: '#60a5fa' },
  { id: 'aguardando_aprovacao', nome: 'Aguardando aprovação',  cor: '#fbbf24' },
  { id: 'bloqueado',            nome: 'Bloqueado',             cor: '#f87171' },
  { id: 'inativo',              nome: 'Inativo',               cor: '#64748b' },
  { id: 'rejeitado',            nome: 'Rejeitado',             cor: '#94a3b8' },
];
export const statusInfo = (s: StatusIam | undefined) =>
  STATUS.find(x => x.id === (s ?? 'ativo')) ?? STATUS[0];

// ── Dados de perfil e vínculos que passam a existir no registro ─────────────
// Campos NOVOS do RegistroPapel (todos opcionais — migração sem quebra).
export interface CamposIam {
  nome?: string;
  telefone?: string;
  categoria?: CategoriaIam;
  status?: StatusIam;
  permissoes?: MapaPermissoes;      // sobrepõe o papel (papel 'custom' usa só isto)
  fazendasVinculadas?: string[];    // NOVO: vínculo por fazenda (antes só cliente/talhão)
  empresasVinculadas?: string[];    // preparado p/ multi-empresa (hoje single-tenant)
  criadoEm?: string;
  criadoPor?: string;
  aprovadoEm?: string;
  aprovadoPor?: string;
  ultimoAcesso?: string;
  bloqueadoEm?: string;
  bloqueadoPor?: string;
  motivoBloqueio?: string;
  observacoes?: string;
  aceiteLgpdEm?: string;
  aceiteTermosEm?: string;
  conviteId?: string;               // convite que originou o cadastro
  /** Papel/perfil que o LINK do convite propunha. Só sugestão: a tela de
   *  aprovação já abre com eles preenchidos, mas quem aprova decide. */
  papelSugerido?: PapelIam;
  perfilSugeridoId?: string;
}

// ── Convite ─────────────────────────────────────────────────────────────────
export type StatusConvite = 'pendente' | 'usado' | 'expirado' | 'cancelado';

export interface Convite {
  id: string;              // = token (usado na URL /convite?t=…)
  email: string;           // e-mail previsto ('' nos convites MULTIUSO)
  nome?: string;
  categoria?: CategoriaIam;
  papel?: PapelIam;        // sugestão; a aprovação confirma
  /** Convite de TIPO: um link só, reutilizável por várias pessoas (ex.: mandar
   *  no grupo dos produtores). Não é consumido no 1º cadastro — conta usos.
   *  Sem e-mail previsto: cada pessoa informa o dela. */
  multiuso?: boolean;
  /** Nome do convite. No link de TIPO ele aparece para quem abre ("Convite para
   *  Produtores"); no convite INDIVIDUAL é só interno — serve para o
   *  administrador saber para quem mandou cada link, e nunca é exibido à
   *  pessoa. Não confundir com `nome`, que é o nome DELA (pré-preenche o
   *  formulário de cadastro). */
  rotulo?: string;
  perfilId?: string;       // perfil de permissão sugerido na aprovação
  usos?: number;           // quantos se cadastraram por este link (multiuso)
  /** Acesso já definido no convite: produtores/fazendas que a pessoa vai poder
   *  ver. Vazio/ausente = sem restrição. NÃO libera nada sozinho — os vínculos
   *  entram no cadastro e são aplicados na APROVAÇÃO, que continua manual. */
  clientesVinculados?: string[];
  fazendasVinculadas?: string[];
  criadoEm: string;
  criadoPor: string;
  expiraEm: string;        // ISO
  status: StatusConvite;
  usadoEm?: string;
  usadoPor?: string;       // e-mail que de fato se cadastrou
  canceladoEm?: string;
  observacao?: string;
}

// ── Auditoria ───────────────────────────────────────────────────────────────
export type AcaoAuditoria =
  | 'convite_criado' | 'convite_cancelado' | 'convite_reenviado' | 'convite_usado'
  | 'cadastro_solicitado' | 'usuario_aprovado' | 'usuario_rejeitado'
  | 'papel_alterado' | 'categoria_alterada' | 'permissao_alterada'
  | 'vinculo_alterado' | 'senha_resetada' | 'senha_trocada'
  | 'usuario_bloqueado' | 'usuario_desbloqueado' | 'usuario_removido'
  | 'validade_renovada' | 'login' | 'plano_alterado';

export interface EventoAuditoria {
  id: string;
  em: string;              // ISO
  quem: string;            // e-mail de quem executou
  acao: AcaoAuditoria;
  alvo?: string;           // e-mail afetado
  detalhe?: string;        // texto curto legível
  de?: string;             // valor anterior
  para?: string;           // valor novo
}

export const ROTULO_ACAO: Record<AcaoAuditoria, string> = {
  convite_criado: 'Convite criado', convite_cancelado: 'Convite cancelado',
  convite_reenviado: 'Convite reenviado', convite_usado: 'Convite utilizado',
  cadastro_solicitado: 'Cadastro solicitado', usuario_aprovado: 'Usuário aprovado',
  usuario_rejeitado: 'Usuário rejeitado', papel_alterado: 'Papel alterado',
  categoria_alterada: 'Categoria alterada', permissao_alterada: 'Permissão alterada',
  vinculo_alterado: 'Vínculo alterado', senha_resetada: 'Senha resetada',
  senha_trocada: 'Senha trocada', usuario_bloqueado: 'Usuário bloqueado',
  usuario_desbloqueado: 'Usuário desbloqueado', usuario_removido: 'Acesso removido',
  validade_renovada: 'Validade renovada', login: 'Entrou no sistema',
  plano_alterado: 'Plano alterado',
};
