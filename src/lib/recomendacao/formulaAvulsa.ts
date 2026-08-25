// FÓRMULA AVULSA — o rascunho de equação que a aba Recomendações usa no modo
// "Equação avulsa" (v2.73).
//
// A equação continua morando na Biblioteca; aqui o agrônomo abre a fórmula REAL
// dela na tela, mexe (ou reescreve inteira, escolhendo os atributos) e aplica
// SÓ NAQUELE talhão — sem alterar o cadastro para os outros. É a lógica do
// InCeres (clicar na calculadora abre a equação para editar) adaptada à nossa
// Biblioteca: o rascunho é uma sobreposição por cima do ConteudoEquacao, e
// salvar na Biblioteca é um gesto separado e explícito.
//
// Puro (sem browser/storage): testável em node — ver scripts/teste-formula-avulsa.mjs.

import type { ConstanteEquacao, ConteudoEquacao } from '../biblioteca.ts';
import { validar } from './motor.ts';

/** Os campos da equação que o rascunho pode sobrescrever. Tudo que muda o
 *  NÚMERO que vai para o mapa — o resto (produto, custos, estilo) continua
 *  vindo do cadastro, porque preço e cores não são "a fórmula". */
export interface RascunhoFormula {
  script: string;
  constantes: ConstanteEquacao[];
  naoNegativo: boolean;
  doseMinimaViavel: number;
  abaixoMinimo: 'zero' | 'minimo';
  doseMaxima: number;
  profundidade: string;
  unidadeTratamento: string;
}

/** Rascunho inicial = a fórmula como ela está cadastrada. */
export function rascunhoDaEquacao(c: ConteudoEquacao): RascunhoFormula {
  return {
    script: c.script ?? '',
    constantes: (c.constantes ?? []).map(k => ({ nome: k.nome, valor: k.valor })),
    naoNegativo: c.naoNegativo ?? true,
    doseMinimaViavel: c.doseMinimaViavel ?? 0,
    abaixoMinimo: c.abaixoMinimo ?? 'zero',
    doseMaxima: c.doseMaxima ?? 0,
    profundidade: c.profundidade || '0-20',
    unidadeTratamento: c.unidadeTratamento || 'kg/ha',
  };
}

/** Equação a aplicar = cadastro + rascunho por cima. */
export function equacaoComRascunho(c: ConteudoEquacao, r: RascunhoFormula): ConteudoEquacao {
  return {
    ...c,
    script: r.script,
    constantes: r.constantes.filter(k => k.nome.trim()),
    naoNegativo: r.naoNegativo,
    doseMinimaViavel: r.doseMinimaViavel,
    abaixoMinimo: r.abaixoMinimo,
    doseMaxima: r.doseMaxima,
    profundidade: r.profundidade,
    unidadeTratamento: r.unidadeTratamento,
  };
}

// Espaço e linha em branco não mudam conta nenhuma: sem normalizar, um Enter a
// mais marcaria a equação como "editada" e criaria um cenário separado à toa.
function normScript(s: string): string {
  return (s ?? '')
    .split('\n')
    .map(l => l.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}
function normConst(cs: ConstanteEquacao[] = []): string {
  return cs
    .filter(k => k.nome.trim())
    .map(k => `${k.nome.trim().toLowerCase()}=${k.valor}`)
    .sort()
    .join('|');
}

/** O rascunho difere do que está cadastrado? */
export function formulaEditada(c: ConteudoEquacao, r: RascunhoFormula): boolean {
  const base = rascunhoDaEquacao(c);
  return normScript(base.script) !== normScript(r.script)
    || normConst(base.constantes) !== normConst(r.constantes)
    || base.naoNegativo !== r.naoNegativo
    || base.doseMinimaViavel !== r.doseMinimaViavel
    || base.abaixoMinimo !== r.abaixoMinimo
    || base.doseMaxima !== r.doseMaxima
    || base.profundidade !== r.profundidade
    || base.unidadeTratamento !== r.unidadeTratamento;
}

/** Assinatura curta e ESTÁVEL do rascunho (djb2 → base36).
 *  Entra no id do cenário: sem ela, aplicar a fórmula editada gravaria por cima
 *  do cenário da equação original na nuvem — o mesmo estrago que o sufixo
 *  `_zona` já evita entre interpolação e zona. */
export function assinaturaRascunho(r: RascunhoFormula): string {
  const txt = [
    normScript(r.script), normConst(r.constantes),
    r.naoNegativo ? '1' : '0', String(r.doseMinimaViavel), r.abaixoMinimo,
    String(r.doseMaxima), r.profundidade, r.unidadeTratamento,
  ].join('');
  let h = 5381;
  for (let i = 0; i < txt.length; i++) h = (((h << 5) + h) ^ txt.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export interface ChecagemFormula { ok: boolean; erro?: string; vars: string[] }

/** Sintaxe + atributos reconhecidos, na mesma régua do editor da Biblioteca. */
export function checarRascunho(r: RascunhoFormula): ChecagemFormula {
  if (!r.script.trim()) return { ok: false, erro: 'Fórmula vazia.', vars: [] };
  const v = validar(r.script, r.constantes.filter(k => k.nome.trim()));
  return { ok: v.ok, erro: v.erro, vars: v.vars };
}

// ─── Rascunho por talhão+equação (localStorage) ───────────────────────────
// Trocar de aba DESMONTA a RecomendacaoSection (TalhaoPage renderiza a aba com
// `{tabAtivo === 'recomendacoes' && …}`), e é o mesmo motivo pelo qual o "Modo
// do mapa" já é persistido ali: sem isto, ir à aba Arquivos e voltar apagaria a
// fórmula que o agrônomo acabou de escrever.
export const chaveRascunho = (talhaoId: string, equacaoId: string) =>
  `inv_recom_formula_${talhaoId}_${equacaoId}`;

export function lerRascunho(talhaoId: string, equacaoId: string): RascunhoFormula | null {
  if (typeof window === 'undefined' || !talhaoId || !equacaoId) return null;
  try {
    const cru = localStorage.getItem(chaveRascunho(talhaoId, equacaoId));
    if (!cru) return null;
    const r = JSON.parse(cru) as Partial<RascunhoFormula>;
    if (typeof r?.script !== 'string') return null;
    return {
      script: r.script,
      constantes: Array.isArray(r.constantes) ? r.constantes : [],
      naoNegativo: r.naoNegativo ?? true,
      doseMinimaViavel: Number(r.doseMinimaViavel) || 0,
      abaixoMinimo: r.abaixoMinimo === 'minimo' ? 'minimo' : 'zero',
      doseMaxima: Number(r.doseMaxima) || 0,
      profundidade: r.profundidade || '0-20',
      unidadeTratamento: r.unidadeTratamento || 'kg/ha',
    };
  } catch { return null; }
}

export function gravarRascunho(talhaoId: string, equacaoId: string, r: RascunhoFormula | null) {
  if (typeof window === 'undefined' || !talhaoId || !equacaoId) return;
  const k = chaveRascunho(talhaoId, equacaoId);
  try {
    if (r) localStorage.setItem(k, JSON.stringify(r));
    else localStorage.removeItem(k);
  } catch { /* quota cheia: o rascunho continua valendo em memória */ }
}
