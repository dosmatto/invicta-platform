// Cultura × produtividade: o mapa de colheita está com a cultura certa?
//
// Regra PURA (sem DOM nem I/O; roda no teste node). Nasceu de um mapa de milho
// (~14.160 kg/ha) gravado como "Soja": o seletor de cultura da aba Produtividade
// começa em soja e herda a cultura PRINCIPAL da safra, então o milho safrinha
// processado sem trocar o seletor saía como soja. A média real da colheita
// denuncia o erro — 14 t/ha não existe em soja.
//
// As faixas são em kg/ha, FIXAS aqui de propósito e fáceis de ajustar (decisão
// do usuário). Cultura sem faixa (cana, café, algodão…) nunca gera aviso.

export type FaixaKgha = readonly [min: number, max: number];

/** Faixa plausível de produtividade média por cultura (kg/ha). Ajustar AQUI. */
export const FAIXAS_CULTURA: Readonly<Record<string, FaixaKgha>> = {
  soja: [600, 7200],
  milho: [1500, 16000],
  trigo: [500, 7500],
  feijao: [300, 5000],
  aveia: [500, 7000],
  cevada: [500, 7000],
};

const ROTULOS: Readonly<Record<string, string>> = {
  soja: 'Soja', milho: 'Milho', trigo: 'Trigo', feijao: 'Feijão', aveia: 'Aveia', cevada: 'Cevada',
};

/** Desempate da sugestão quando várias faixas contêm a média (decisão do usuário). */
const PRIORIDADE = ['soja', 'milho', 'trigo', 'feijao', 'aveia', 'cevada'] as const;

/** Acima disto só o milho cabe: soja/trigo/aveia/cevada passam de ~7,5 t/ha raramente. */
const LIMITE_SO_MILHO = 7200;

/** Minúsculas, sem acento, sem espaço sobrando. */
const norm = (s: string | null | undefined): string =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/**
 * Nome livre da cultura → chave de FAIXAS_CULTURA, ou null quando não há faixa.
 * "Milho safrinha", "milho 2ª safra", "MILHO" → 'milho'; "Soja 1ª safra" → 'soja';
 * "Feijão" / "feijao-carioca" → 'feijao'.
 */
export function chaveDaCultura(nome: string | null | undefined): string | null {
  const n = norm(nome);
  if (!n) return null;
  for (const chave of Object.keys(FAIXAS_CULTURA)) {
    if (n === chave || n.startsWith(chave + ' ') || n.startsWith(chave + '-') || n.startsWith(chave + '/') || n.startsWith(chave + '(')) return chave;
  }
  return null;
}

/** "milho" → "Milho"; cultura sem rótulo conhecido volta com a 1ª letra maiúscula. */
export function rotuloDaCultura(chaveOuNome: string | null | undefined): string {
  const chave = chaveDaCultura(chaveOuNome);
  if (chave) return ROTULOS[chave];
  const t = String(chaveOuNome ?? '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

export interface AvisoCultura {
  /** Chave canônica da cultura avaliada ('soja', 'milho'…). */
  cultura: string;
  mediaKgha: number;
  faixa: FaixaKgha;
  /** Chave da cultura cuja faixa contém a média; ausente se nenhuma contém. */
  sugestao?: string;
}

/**
 * A média (kg/ha) combina com a cultura? null = plausível, ou cultura sem faixa
 * (ou média inválida): não há o que avisar. Senão devolve o aviso, com a
 * cultura provável quando alguma faixa contém a média: entre várias, a primeira
 * da PRIORIDADE fixa (soja > milho > trigo > feijão > aveia/cevada); com média
 * > 7.200 é sempre o milho.
 */
export function avaliarCultura(cultura: string | null | undefined, mediaKgha: number): AvisoCultura | null {
  if (!Number.isFinite(mediaKgha)) return null;
  const chave = chaveDaCultura(cultura);
  if (!chave) return null;
  const faixa = FAIXAS_CULTURA[chave];
  if (mediaKgha >= faixa[0] && mediaKgha <= faixa[1]) return null;

  let sugestao: string | undefined;
  if (mediaKgha > LIMITE_SO_MILHO) {
    const f = FAIXAS_CULTURA.milho;
    if (chave !== 'milho' && mediaKgha >= f[0] && mediaKgha <= f[1]) sugestao = 'milho';
  } else {
    for (const c of PRIORIDADE) {
      const f = FAIXAS_CULTURA[c];
      if (c === chave || mediaKgha < f[0] || mediaKgha > f[1]) continue;
      sugestao = c;   // a 1ª da prioridade cuja faixa contém a média
      break;
    }
  }
  return { cultura: chave, mediaKgha, faixa, ...(sugestao ? { sugestao } : {}) };
}

/** Milhar com ponto, sem depender do ICU do ambiente: 14160 → "14.160". */
const milhar = (n: number): string => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** Texto único do aviso (formulário de processar e selo dos mapas salvos). */
export function textoAvisoCultura(a: AvisoCultura): string {
  const base = `Média de ${milhar(a.mediaKgha)} kg/ha não combina com ${rotuloDaCultura(a.cultura)} (${milhar(a.faixa[0])}–${milhar(a.faixa[1])}).`;
  return a.sugestao ? `${base} É ${rotuloDaCultura(a.sugestao)}?` : base;
}
