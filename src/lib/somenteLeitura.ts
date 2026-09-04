// Modo SOMENTE LEITURA: o produtor vê e exporta, não altera.
//
// A matriz de permissões (iam/permissoes.ts) já diz isso — o papel produtor só
// tem "ver/exportar" — e os módulos que consultam `pode()` escondem os botões.
// Mas nem todo módulo consulta (03/09/2026: altimetria, amostragem, compactação,
// condutividade, colheita, prescrições…). Em vez de caçar botão por botão em
// dezoito mil linhas, a trava fica na PORTA DA NUVEM (supabaseData.ts): nada
// que o produtor faça na tela vira gravação no Supabase.
//
// O cache do aparelho (localStorage/IndexedDB) NÃO é travado: ele é hidratado a
// partir da nuvem, e travá-lo quebraria a própria leitura. Uma alteração local
// do produtor some no próximo boot, porque a nuvem manda.

import { papelDoUsuario } from './empresa';
import { authConfigurado } from './auth';

/** Coleções que o PRÓPRIO produtor precisa gravar: o registro dele no IAM
 *  (status, último acesso, confirmação na nuvem), convites e a auditoria. */
const LIVRES = new Set(['inv_papeis', 'inv_convites', 'inv_auditoria']);

/** Satélite é onde o produtor TRABALHA (04/09/2026): índices mantidos
 *  (`<talhão>__ndvi__…` / `__ndvicbers__…`), composições temporais
 *  (`composicao__<talhão>__…` e a lista inv_composicoes) e as cenas rejeitadas. */
const COL_MAPAS = 'inv_mapas_fert';
const LIVRES_SATELITE = new Set(['inv_composicoes', 'inv_cenas_estado']);
function mapaDoSatelite(id: string): boolean {
  const s = id.split('__');
  return s[0] === 'composicao' || s[1] === 'ndvi' || s[1] === 'ndvicbers';
}

export function somenteLeitura(): boolean {
  return authConfigurado && papelDoUsuario() === 'produtor';
}

let avisadoEm = 0;
/** true = gravação bloqueada (avisa no console no máximo uma vez por minuto). */
export function escritaBloqueada(chave: string, id?: string): boolean {
  if (LIVRES.has(chave) || LIVRES_SATELITE.has(chave) || !somenteLeitura()) return false;
  if (chave === COL_MAPAS && id && mapaDoSatelite(id)) return false;
  const agora = Date.now();
  if (agora - avisadoEm > 60_000) {
    avisadoEm = agora;
    console.warn(`[somente-leitura] gravação em "${chave}" ignorada: o produtor só visualiza.`);
  }
  return true;
}
