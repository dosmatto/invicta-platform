// Fertilizantes de referência, como itens de INSUMO de escopo SISTEMA.
//
// Existem para que os "equivalentes em fertilizante" do relatório de
// produtividade tenham de onde sair no primeiro uso: o cadastro de insumos
// nasce vazio, e sem nenhum produto com garantia de K₂O ou P₂O₅ a tabela de
// equivalência sairia em branco.
//
// SEM PREÇO de propósito. Preço é do cliente e muda toda semana; um preço "de
// fábrica" no seed seria pior que nenhum, porque apareceria no relatório com
// cara de número apurado. Quem quiser custo preenche em Biblioteca → Insumos.

import type { ConteudoInsumo } from '@/lib/insumos';

export const INSUMOS_SEED_SISTEMA: Array<{ nome: string; conteudo: ConteudoInsumo }> = [
  { nome: 'Cloreto de Potássio (KCl)',    conteudo: { categoria: 'fertilizante', garantias: { k2o: 60 } } },
  { nome: 'Sulfato de Potássio',          conteudo: { categoria: 'fertilizante', garantias: { k2o: 50, s: 17 } } },
  { nome: 'MAP',                          conteudo: { categoria: 'fertilizante', garantias: { n: 11, p2o5: 52 } } },
  { nome: 'DAP',                          conteudo: { categoria: 'fertilizante', garantias: { n: 18, p2o5: 45 } } },
  { nome: 'Superfosfato Triplo',          conteudo: { categoria: 'fertilizante', garantias: { p2o5: 41, ca: 12 } } },
  { nome: 'Fosfato Natural Reativo — Gafsa', conteudo: { categoria: 'fertilizante', garantias: { p2o5: 29, ca: 30 } } },
  { nome: 'Fosfato Natural Reativo — Arad',  conteudo: { categoria: 'fertilizante', garantias: { p2o5: 29, ca: 30 } } },
  { nome: 'Superfosfato Simples',         conteudo: { categoria: 'fertilizante', garantias: { p2o5: 18, ca: 16, s: 8 } } },
];
