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
//
// Exceções — onde o produtor TRABALHA, e só nos talhões DELE (v2.186.0):
//   · satélite (04/09/2026): índices `<talhão>__ndvi__…` / `__ndvicbers__…`,
//     composições (`composicao__<talhão>__…` e a lista inv_composicoes) e as
//     cenas rejeitadas (inv_cenas_estado);
//   · compactação (v2.181.0): importações (inv_compactacao), grades
//     (inv_grades_compact) e mapas `compactacao__<talhão>__…`.
// Esta trava é só educação do cliente: quem GARANTE é a RLS (políticas
// app_kv_produtor_* em docs/seguranca-rls.sql). A regra por registro mora em
// iam/escritaProdutor.ts, espelho da função SQL inv_talhao_do_registro.

import { papelDoUsuario } from './empresa';
import { authConfigurado } from './auth';
import { getTalhoes } from './store';
import { colecaoGravavelProdutor, produtorPodeGravar } from './iam/escritaProdutor';

export function somenteLeitura(): boolean {
  return authConfigurado && papelDoUsuario() === 'produtor';
}

// Talhões do escopo do produtor (mesma conta de getTalhoes: produtor → fazendas
// marcadas → talhões vinculados). Memo curto: um push de lista pergunta por
// registro, e montar o conjunto a cada um seria desperdício.
let memo: { em: number; talhoes: Set<string> } | null = null;
function talhoesDoEscopo(): Set<string> {
  const agora = Date.now();
  if (!memo || agora - memo.em > 5_000) memo = { em: agora, talhoes: new Set(getTalhoes().map(t => t.id)) };
  return memo.talhoes;
}

let avisadoEm = 0;
function avisar(chave: string, motivo: string): true {
  const agora = Date.now();
  if (agora - avisadoEm > 60_000) {
    avisadoEm = agora;
    console.warn(`[somente-leitura] gravação em "${chave}" ignorada: ${motivo}`);
  }
  return true;
}

/** Porta da COLEÇÃO: true = nada desta coleção sobe (avisa no console no
 *  máximo uma vez por minuto). Coleção com exceção passa — quem chama decide
 *  registro a registro com `registroBloqueado`. */
export function escritaBloqueada(chave: string): boolean {
  if (!somenteLeitura() || colecaoGravavelProdutor(chave)) return false;
  return avisar(chave, 'o produtor só visualiza.');
}

/** Porta do REGISTRO: true = este registro (ou prefixo de mapa) não é de um
 *  talhão do produtor. `dados` é o documento (para achar o `talhaoId`). */
export function registroBloqueado(chave: string, id: string, dados?: unknown): boolean {
  if (!somenteLeitura()) return false;
  if (produtorPodeGravar(chave, id, dados, talhoesDoEscopo())) return false;
  return avisar(chave, 'o produtor só grava compactação e satélite dos talhões dele.');
}
