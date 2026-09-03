'use client';

// Ponte entre a BIBLIOTECA (cadastro) e os módulos puros de exportação.
//
// Existe pelo mesmo motivo que `insumos.ts` é puro e `biblioteca.ts` é
// 'use client': a matemática não deve saber de localStorage, e o cadastro não
// deve saber de grid. Este arquivo é a única costura entre os dois.

import { listar, type ItemBiblioteca, type ConteudoExportacao } from './biblioteca';
import { garantiaDe, precoNaUnidade, paraRelatorio, type ConteudoInsumo, type Nutriente } from './insumos';
import type { ProdutoEquivalente } from './exportacao';
import { precoResolvidoDoInsumo } from './store';
import type { Epoca } from './periodo';

/**
 * Coeficientes cadastrados para uma cultura.
 *
 * Item do usuário ('meu'/'empresa') VENCE o de sistema: quem cadastrou o
 * próprio número quis usá-lo. Só itens ativos.
 */
export function coeficientesDaCultura(cultura: string): ItemBiblioteca<ConteudoExportacao> | null {
  const alvo = (cultura || '').trim().toLowerCase();
  if (!alvo) return null;
  const candidatos = listar<ConteudoExportacao>('exportacao')
    .filter(i => i.ativo !== false && (i.conteudo?.culturaId ?? '').toLowerCase() === alvo);
  if (!candidatos.length) return null;
  return candidatos.find(i => i.escopo !== 'sistema') ?? candidatos[0];
}

/**
 * Fertilizantes que servem de equivalente para um nutriente, do mais
 * concentrado para o menos. Produto sem garantia declarada fica de fora — não
 * há como dividir por ela.
 *
 * A escolha de QUAIS produtos é do cadastro, não do código: vale a marca
 * "usar no relatório" do insumo (`paraRelatorio`), e ela é aplicada ANTES do
 * corte por garantia — marcar um produto que não declara o nutriente não
 * esvazia a tabela dos outros, só não acrescenta esse.
 */
export function fertilizantesCom(
  nutriente: Nutriente,
  /** Contexto do produtor: sem ele, vale o preço da Biblioteca (como antes). */
  ctx?: { clienteId?: string | null; fazendaId?: string | null; ano?: number | null; epoca?: Epoca | null },
): ProdutoEquivalente[] {
  const fertilizantes = listar<ConteudoInsumo>('insumos')
    .filter(i => i.ativo !== false && i.conteudo?.categoria === 'fertilizante');
  return paraRelatorio(fertilizantes.map(i => ({ id: i.id, nome: i.nome, c: i.conteudo, usarNoRelatorio: i.conteudo?.usarNoRelatorio })))
    .map(({ id, nome, c: conteudo }) => ({
      insumoId: id,
      nome,
      garantiaPct: garantiaDe(conteudo, nutriente),
      // Preço RESOLVIDO: biblioteca → produtor → fazenda. Sem contexto, é o da
      // biblioteca, como sempre foi. null = desconhecido (nunca 0, que diria
      // "de graça").
      precoT: ctx
        ? precoResolvidoDoInsumo(id, conteudo, ctx).precoTotalT   // posto na fazenda (produto + frete)
        : precoNaUnidade(conteudo, 't') ?? null,
    }))
    .filter(p => p.garantiaPct > 0)
    .sort((a, b) => b.garantiaPct - a.garantiaPct);
}
