// Abre a página do talhão (/talhao/…) numa ABA NOVA a partir do painel.
//
// Por que existe (v3.3.1): com `noopener` o Chrome põe a aba nova num processo
// próprio — cada aba tem a sua memória e, se uma cair por falta de memória, as
// outras continuam. É o ganho da pendência "menos memória com várias abas".
//
// O PREÇO do `noopener`: a aba nova nasce com o sessionStorage VAZIO. Sem ele,
// `window.open(url, '_blank')` CLONA o sessionStorage da aba de origem — e dois
// modos da plataforma moram justamente lá e precisam atravessar para a aba do
// talhão:
//   · MODO APRESENTAÇÃO (`inv_apresentacao`, lib/modoApresentacao.ts): sem o
//     clone, a aba do talhão abriria como owner/admin — sem a faixa, com abas e
//     botões de edição e com gravação liberada, na frente do produtor;
//   · MODO MAPA DO PRODUTOR (`inv_produtor_mapa`, lib/modoProdutorMapa.ts): sem
//     o clone, o "voltar" da página do talhão leva ao portal, não ao mapa.
// Por isso o `noopener` só entra quando NENHUM dos dois está ligado. São sessões
// curtas; perder o ganho de memória nelas é aceitável.
//
// Toda abertura de /talhao em aba nova a partir do painel passa por aqui — não
// chame window.open direto para essa rota.

import { apresentacaoAtiva } from './empresa';
import { modoProdutorMapaAtivo } from './modoProdutorMapa';

/** true = há modo guardado no sessionStorage que a aba nova precisa herdar. */
export function abaPrecisaHerdarSessao(): boolean {
  return apresentacaoAtiva() || modoProdutorMapaAtivo();
}

/** Abre `url` numa aba nova: processo próprio quando dá, herdando a sessão da aba quando precisa. */
export function abrirTalhaoNovaAba(url: string): void {
  if (abaPrecisaHerdarSessao()) window.open(url, '_blank');
  else window.open(url, '_blank', 'noopener');
}
