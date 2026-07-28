'use client';

// IAM — PERFIS DE PERMISSÃO salvos com nome.
//
// Para que serve: em vez de marcar permissão por permissão em cada pessoa (ou
// clonar de alguém e torcer para que aquele alguém esteja certo), o
// administrador monta um conjunto uma vez ("Agrônomo de campo", "Consultor
// externo"), salva com nome e aplica em quantas pessoas quiser. Depois de
// aplicado, cada pessoa continua ajustável individualmente — o perfil é um
// PONTO DE PARTIDA, não uma amarra.

import { lerListaLocal, gravarListaLocal } from '../localComprimido';
import { cloudPushLista } from '../cloud';
import { emailUsuario } from '../empresa';
import { registrar } from './auditoria';
import { permissoesEfetivas } from './permissoes';
import type { MapaPermissoes, PapelIam } from './tipos';

export const K_PERFIS = 'inv_perfis_permissao';

export interface PerfilPermissao {
  id: string;
  nome: string;
  descricao?: string;
  permissoes: MapaPermissoes;
  papelBase?: PapelIam;      // de qual papel partiu (só informativo)
  criadoEm: string;
  criadoPor: string;
}

function ler(): PerfilPermissao[] { return lerListaLocal<PerfilPermissao>(K_PERFIS); }
function gravar(lista: PerfilPermissao[]): void {
  gravarListaLocal(K_PERFIS, lista);
  cloudPushLista(K_PERFIS, lista as unknown as { id: unknown }[]);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('inv:empresa'));
}

export function getPerfis(): PerfilPermissao[] {
  return ler().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}
export function getPerfil(id: string): PerfilPermissao | null {
  return ler().find(p => p.id === id) ?? null;
}

// Cria (ou atualiza, se o nome já existir) um perfil com o conjunto informado.
export function salvarPerfil(dados: {
  nome: string; permissoes: MapaPermissoes; descricao?: string; papelBase?: PapelIam;
}): PerfilPermissao {
  const nome = dados.nome.trim();
  const lista = ler();
  const existente = lista.find(p => p.nome.toLowerCase() === nome.toLowerCase());
  if (existente) {
    existente.permissoes = { ...dados.permissoes };
    existente.descricao = dados.descricao ?? existente.descricao;
    existente.papelBase = dados.papelBase ?? existente.papelBase;
    gravar(lista);
    registrar('permissao_alterada', { detalhe: `perfil "${nome}" atualizado` });
    return existente;
  }
  const novo: PerfilPermissao = {
    id: `perf_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    nome, descricao: dados.descricao, permissoes: { ...dados.permissoes },
    papelBase: dados.papelBase,
    criadoEm: new Date().toISOString(), criadoPor: emailUsuario() ?? 'sistema',
  };
  lista.push(novo);
  gravar(lista);
  registrar('permissao_alterada', { detalhe: `perfil "${nome}" criado` });
  return novo;
}

export function renomearPerfil(id: string, nome: string): void {
  const lista = ler();
  const p = lista.find(x => x.id === id);
  if (!p) return;
  const antes = p.nome;
  p.nome = nome.trim() || antes;
  gravar(lista);
  registrar('permissao_alterada', { detalhe: `perfil renomeado`, de: antes, para: p.nome });
}

export function excluirPerfil(id: string): void {
  const p = getPerfil(id);
  gravar(ler().filter(x => x.id !== id));
  if (p) registrar('permissao_alterada', { detalhe: `perfil "${p.nome}" excluído` });
}

// Monta o conjunto a partir de um papel (o padrão dele) — atalho para criar um
// perfil "parecido com Agrônomo, mas com X a mais".
export function permissoesDoPapel(papel: PapelIam): MapaPermissoes {
  return { ...permissoesEfetivas(papel) };
}
