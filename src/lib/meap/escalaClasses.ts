// ESCALA DE CLASSES de um zoneamento — as classes que existem no mapa MAIS as
// classes padrão que ainda não existem, na ordem certa de potencial.
//
// Por que existe: o editor manual só oferecia, para reclassificar, as classes
// PRESENTES no mapa. Num zoneamento que saiu com "Muito alto / Alto /
// Médio-alto" não havia como marcar uma zona como Média, Média-baixa ou Baixa —
// justamente o que se quer fazer ao corrigir o mapa à mão. As cinco classes do
// semáforo passam a aparecer sempre.
//
// A regra que não pode quebrar: a ORDEM das classes que já estão no mapa é
// preservada — o rank ordena a prescrição (maior potencial = rank menor), e
// embaralhar isso trocaria as doses no campo. As classes novas são encaixadas
// entre elas pelo lugar que ocupam no semáforo, e a escala inteira é
// renumerada 1..N para continuar contígua.
//
// Módulo PURO (testável em node) — extensão .ts explícita nos imports.

import { classeZona, classeReconhecida, ORDEM_CLASSES } from '../zonas.ts';

export interface ClassePresente {
  label: string;
  cor?: string;
  /** rank que a classe tem hoje no mapa (1 = maior potencial). */
  rank: number;
}

export interface ClasseEscala {
  label: string;
  cor: string;
  /** rank NOVO, contíguo em 1..N. */
  rank: number;
  /** rank de hoje — ausente quando a classe ainda não existe no mapa. */
  rankAtual?: number;
  /** false = classe padrão que ainda não está no mapa (a UI marca como nova). */
  presente: boolean;
}

/** Posição da classe no semáforo (0 = Alta … 4 = Baixa). -1 se não reconhecida. */
function posPadrao(label: string): number {
  if (!classeReconhecida(label)) return -1;
  return ORDEM_CLASSES.indexOf(classeZona(label).label);
}

/**
 * Escala completa: presentes (na ordem que já têm) + as padrão que faltam.
 *
 * "Faltar" é por CLASSE do semáforo, não por texto: um mapa com "Muito alto" e
 * "Alto" já tem a classe Alta representada duas vezes — não faz sentido oferecer
 * um terceiro chip "Alta" ao lado deles.
 */
export function escalaClasses(presentes: ClassePresente[]): ClasseEscala[] {
  const ordenadas = [...presentes].sort((a, b) => a.rank - b.rank);
  const n = ordenadas.length;

  // Posição de cada presente no semáforo. Rótulo fora do vocabulário (um
  // zoneamento com nomes próprios, "Argila alta"…) não tem posição: usa a que
  // ele ocupa na própria escala, para as classes novas caírem em volta dele.
  const pos = ordenadas.map((c, i) => {
    const p = posPadrao(c.label);
    return p >= 0 ? p : (n <= 1 ? 2 : (i / (n - 1)) * (ORDEM_CLASSES.length - 1));
  });

  const representadas = new Set(
    ordenadas.filter(c => classeReconhecida(c.label)).map(c => classeZona(c.label).label),
  );

  // ondeEntra = posição na fila das presentes. No empate a classe NOVA vem
  // primeiro (ela "entra antes" da presente daquela posição); entre novas,
  // manda a ordem do semáforo.
  const DEPOIS = 1000;
  const itens: Array<{ item: ClasseEscala; ondeEntra: number; desempate: number }> = ordenadas.map((c, i) => ({
    item: {
      label: c.label,
      cor: c.cor ?? (classeReconhecida(c.label) ? classeZona(c.label).cor : '#94a3b8'),
      rank: 0, rankAtual: c.rank, presente: true,
    },
    ondeEntra: i,
    desempate: DEPOIS,
  }));

  ORDEM_CLASSES.forEach((padrao, m) => {
    if (representadas.has(padrao)) return;
    // Entra DEPOIS de toda classe presente que já é dela ou de potencial maior:
    // "Muito alto" (posição 0) e a padrão "Alta" (0) empatam, e quem estava no
    // mapa vem primeiro.
    const ondeEntra = pos.filter(p => p <= m).length;
    itens.push({
      item: { label: padrao, cor: classeZona(padrao).cor, rank: 0, presente: false },
      ondeEntra,
      desempate: m,
    });
  });

  itens.sort((a, b) => a.ondeEntra - b.ondeEntra || a.desempate - b.desempate);
  return itens.map((x, i) => ({ ...x.item, rank: i + 1 }));
}

/**
 * De→para dos ranks de hoje para os da escala nova. Só tem entrada quando o
 * rank MUDA — escala sem classe nova devolve mapa vazio, e aí nenhuma feição
 * precisa ser reescrita.
 */
export function remapeamentoDeRanks(escala: ClasseEscala[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const c of escala) {
    if (c.rankAtual != null && c.rankAtual !== c.rank) m.set(c.rankAtual, c.rank);
  }
  return m;
}
