// Quais MAPAS DE COLHEITA entram como camada nas Zonas de Manejo (pendência 42).
//
// A produtividade é a camada mais direta que existe para zonear: ela é o
// resultado que as outras (fertilidade, EC, NDVI, relevo) tentam explicar. Até
// aqui ela só aparecia no Editor Manual (como fundo e para sugerir classe) —
// o catálogo do "Gerar zonas por similaridade" não a tinha.
//
// A regra de escolha é a mesma que a Validação já usa: UMA camada por contexto
// (cultura + ano + época), a OFICIAL manda; sem oficial, a versão mais recente.
// Listar todas as versões inflaria a lista com cinco "Soja 2025" que são o
// mesmo mapa reprocessado, e escolher entre elas não é decisão de zoneamento.
//
// Módulo separado (puro) de propósito: `gerar.ts` arrasta cloud/store e não
// carrega em Node. Coberto por `npm run teste:prod-zonas`.

/** Só o que a escolha precisa saber de um mapa de colheita. */
export interface MapaColheitaCandidato {
  id: string;
  safra: string;
  epoca: string;
  cultura: string;
  versao: number;
  oficial: boolean;
  ano?: number;
  criadoEm: string;
}

/** Ano de 4 dígitos de um nome de safra ("2025", "24/25", "Safra 2025"). */
export function anoDoMapa(m: Pick<MapaColheitaCandidato, 'ano' | 'safra'>): number | null {
  if (m.ano != null) return m.ano;
  const x = /(\d{2,4})/.exec(String(m.safra ?? '').trim());
  if (!x) return null;
  let n = +x[1];
  if (n < 100) n += 2000;
  return n;
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const EPOCAS: Record<string, string> = { verao: 'verão', safrinha: 'safrinha', inverno: 'inverno' };

/**
 * O que a tela escreve ao lado de "Produtividade": cultura + ano (+ época
 * quando informada). "Soja 2025", "Milho 2025 safrinha". Sem cultura cai em
 * "Colheita" para o botão nunca sair vazio.
 */
export function rotuloMapaColheita(m: Pick<MapaColheitaCandidato, 'cultura' | 'ano' | 'safra' | 'epoca'>): string {
  const ano = anoDoMapa(m);
  const ep = EPOCAS[(m.epoca || '').toLowerCase()] ?? '';
  return [cap(m.cultura || '') || 'Colheita', ano ? String(ano) : m.safra || '', ep].filter(Boolean).join(' ');
}

/** `nut` da camada — `prod_<cultura>` sem acento/espaço, para a legenda e a prévia. */
export function nutMapaColheita(m: Pick<MapaColheitaCandidato, 'cultura'>): string {
  const slug = (m.cultura || 'colheita').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `prod_${slug || 'colheita'}`;
}

/**
 * Um mapa por contexto (safra + época + cultura): o OFICIAL; sem oficial, a
 * maior versão. Ordem de saída: os do ANO selecionado primeiro, depois do mais
 * recente ao mais antigo — o mesmo critério que a fertilidade já segue, para
 * o seletor de Ano no alto da tela também valer aqui.
 */
export function selecionarMapasParaZonas<T extends MapaColheitaCandidato>(mapas: T[], anoSelecionado?: number | null): T[] {
  const porContexto = new Map<string, T>();
  for (const m of mapas) {
    const k = `${m.safra}|${m.epoca}|${(m.cultura || '').toLowerCase()}`;
    const atual = porContexto.get(k);
    if (!atual) { porContexto.set(k, m); continue; }
    // oficial > não oficial; entre iguais, a versão maior.
    if ((m.oficial && !atual.oficial) || (m.oficial === atual.oficial && m.versao > atual.versao)) porContexto.set(k, m);
  }
  const anoDe = (m: T) => anoDoMapa(m) ?? -Infinity;
  return [...porContexto.values()].sort((a, b) => {
    const aSel = anoSelecionado != null && anoDe(a) === anoSelecionado ? 1 : 0;
    const bSel = anoSelecionado != null && anoDe(b) === anoSelecionado ? 1 : 0;
    if (aSel !== bSel) return bSel - aSel;
    if (anoDe(a) !== anoDe(b)) return anoDe(b) - anoDe(a);
    return (b.criadoEm ?? '').localeCompare(a.criadoEm ?? '');
  });
}
