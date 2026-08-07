// Número da zona para EXIBIÇÃO — uma regra só, para o mapa, a validação e os
// relatórios não discordarem entre si.
//
// O problema que isto resolve: um polígono de zoneamento carrega DOIS números.
//   • `zona`  — o número oficial da zona; polígonos da mesma zona repetem.
//   • `id`    — identidade ÚNICA do polígono. Nasce do número da zona ("01") e
//               ganha sufixo quando a zona tem mais de um pedaço ("01_2").
//
// O editor manual renumera pelo `id` (é a identidade dele: seleção, histórico,
// divisão). O mapa rotulava pelo `zona`. Resultado relatado: o agrônomo
// renumerava as zonas no editor, via a numeração nova enquanto editava e, ao
// sair, o mapa voltava à antiga — com números repetidos, porque dois polígonos
// ainda dividiam o mesmo `zona`.
//
// A regra: quando o `id` é um número puro ("01", "5"), ELE é o número da zona
// — por construção é assim que o zoneamento nasce, e é isso que a renumeração
// manual escreve. Sufixado ("01_2") ou textual ("z1"), o `id` é identidade
// interna e quem rotula é o `zona`.
//
// Módulo PURO. npm run teste:rotulo-zona

export interface PropsZona {
  id?: string | number | null;
  zona?: string | number | null;
}

const PURO = /^\d+$/;

/** true quando o id É o número da zona (e não uma identidade interna). */
export function idEhNumeroDaZona(id: unknown): boolean {
  return typeof id === 'string' || typeof id === 'number'
    ? PURO.test(String(id).trim())
    : false;
}

/** Número a mostrar para o polígono. '?' quando não há nenhum dos dois. */
export function rotuloZona(props: PropsZona | null | undefined): string {
  const p = props ?? {};
  const id = p.id == null ? '' : String(p.id).trim();
  const zona = p.zona == null ? '' : String(p.zona).trim();
  if (idEhNumeroDaZona(id)) return id;
  if (zona) return zona;
  if (id) return id;
  return '?';
}
