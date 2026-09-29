// O que o PRODUTOR pode gravar na nuvem — e em QUAL talhão.
//
// É o espelho, no cliente, das políticas `app_kv_produtor_*` de
// docs/seguranca-rls.sql (função inv_talhao_do_registro). O banco é quem
// garante; este módulo só evita mandar o que o banco vai recusar. Sem ele, um
// lote de upsert com UM registro de talhão alheio (ex.: uma migração do boot que
// regravou a coleção inteira) seria recusado INTEIRO — inclusive o que o
// produtor fez de legítimo — e o selo de sync ficaria em erro.
//
// Regra (decisão de 29/09/2026): o produtor cria, altera e apaga SÓ na
// compactação e no satélite, e SÓ nos talhões dele. Todo o resto é consulta.
// Mudou aqui? Mude a função SQL junto (e vice-versa) — npm run teste:escritaprodutor.
//
// Lógica pura (sem store/DOM): importável pelos testes via type-stripping.

/** Coleções de registro com `talhaoId` no próprio documento. */
export const COLECOES_POR_TALHAO = new Set([
  'inv_compactacao', 'inv_grades_compact',     // compactação (v2.181.0)
  'inv_composicoes', 'inv_cenas_estado',       // satélite (04/09/2026)
]);

/** Coleção dos rasters: o talhão vem do id do mapa. */
export const COL_MAPAS = 'inv_mapas_fert';

/** Coleções do próprio usuário no IAM — as políticas de acesso de sempre valem. */
export const COLECOES_IAM = new Set(['inv_papeis', 'inv_convites', 'inv_auditoria']);

/** Talhão de um mapa que o produtor pode gravar, ou null se o mapa não é dele
 *  (fertilidade, CE, relevo…). Formatos aceitos:
 *   · `compactacao__<talhão>__<importação>__<camada>`
 *   · `composicao__<talhão>__…`
 *   · `<talhão>__ndvi__…` / `<talhão>__ndvicbers__…`
 *  Vale também para PREFIXOS de exclusão, desde que já tragam o tipo do mapa —
 *  `<talhão>__` sozinho apagaria a fertilidade junto e fica de fora. */
export function talhaoDoMapa(id: string): string | null {
  const s = id.split('__');
  if ((s[0] === 'compactacao' || s[0] === 'composicao') && s[1]) return s[1];
  if ((s[1] === 'ndvi' || s[1] === 'ndvicbers') && s[0]) return s[0];
  return null;
}

/** Talhão de um registro gravável pelo produtor; null = coleção fora da regra. */
export function talhaoDoRegistro(colecao: string, id: string, dados?: unknown): string | null {
  if (colecao === COL_MAPAS) return talhaoDoMapa(id);
  if (!COLECOES_POR_TALHAO.has(colecao)) return null;
  const t = (dados as { talhaoId?: unknown } | null | undefined)?.talhaoId;
  // inv_cenas_estado usa o próprio talhão como item_id (a exclusão chega sem
  // dados). Com dados, os dois têm que bater — senão um doc "do meu talhão"
  // ocuparia o item_id do talhão de outro.
  if (colecao === 'inv_cenas_estado') return id && (t == null || t === id) ? id : null;
  return typeof t === 'string' && t ? t : null;
}

/** A coleção tem ALGUMA escrita liberada ao produtor (a decisão fina é por registro)? */
export function colecaoGravavelProdutor(colecao: string): boolean {
  return COLECOES_IAM.has(colecao) || COLECOES_POR_TALHAO.has(colecao) || colecao === COL_MAPAS;
}

/** O produtor pode gravar/apagar ESTE registro? `talhoes` = talhões do escopo dele. */
export function produtorPodeGravar(
  colecao: string, id: string, dados: unknown, talhoes: ReadonlySet<string>,
): boolean {
  if (COLECOES_IAM.has(colecao)) return true;
  const t = talhaoDoRegistro(colecao, id, dados);
  return t != null && talhoes.has(t);
}
