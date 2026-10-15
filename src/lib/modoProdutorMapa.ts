// Modo "MAPA DO PRODUTOR": o produtor sai do portal e abre a página normal do
// mapa (/painel), só com os clientes dele e sem nenhum botão de escrita.
//
// Sem este modo, o AppContext manda todo produtor de volta para /portal assim
// que os dados carregam. O botão "Mapa da fazenda" do portal liga o modo; o
// botão "Portal" do topo do mapa desliga. Fica no sessionStorage (chave
// `inv_produtor_mapa`) para sobreviver à navegação interna — ir à página do
// talhão e voltar, recarregar a página — e morrer junto com a aba.
//
// Só vale para quem está em SOMENTE LEITURA (produtor logado). Owner/admin no
// preview do portal vão ao /painel normal, com o papel deles: o modo nunca liga.

import { somenteLeitura } from './somenteLeitura';

const CHAVE = 'inv_produtor_mapa';
// 15/10/2026: o botão "Acessar a plataforma" também diz QUAL produtor abrir —
// o /painel cai direto no cadastro dele, com as áreas no mapa, em vez da
// lista de clientes. Consumido uma vez (AppContext) e apagado.
const CHAVE_ABRIR = 'inv_produtor_mapa_abrir';

/** Liga o modo (só tem efeito para o produtor em somente leitura). */
export function ligarModoProdutorMapa(clienteId?: string): void {
  if (!somenteLeitura()) return;
  try {
    sessionStorage.setItem(CHAVE, '1');
    if (clienteId) sessionStorage.setItem(CHAVE_ABRIR, clienteId);
  } catch { /* aba privada/bloqueada: segue sem o modo */ }
}

/** Produtor (cliente) que o /painel deve abrir ao carregar — uma vez só. */
export function consumirProdutorParaAbrir(): string | null {
  try {
    const id = sessionStorage.getItem(CHAVE_ABRIR);
    if (id) sessionStorage.removeItem(CHAVE_ABRIR);
    return id;
  } catch { return null; }
}

/** Desliga o modo (volta a valer o redirecionamento para o portal). */
export function desligarModoProdutorMapa(): void {
  try { sessionStorage.removeItem(CHAVE); sessionStorage.removeItem(CHAVE_ABRIR); } catch { /* nada a limpar */ }
}

/** true = produtor em somente leitura navegando pelo mapa (/painel). */
export function modoProdutorMapaAtivo(): boolean {
  if (!somenteLeitura()) return false;
  try { return sessionStorage.getItem(CHAVE) === '1'; } catch { return false; }
}
