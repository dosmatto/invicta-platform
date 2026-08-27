// NÚCLEO do laudo: catálogo de variáveis, normalização de nomes, leitura de
// valor e colunas derivadas. Puro — sem DOM, sem 'use client', sem I/O.
//
// Está separado de lab.ts (que é do navegador: lê File/XLSX) porque a rota de
// ingestão da API roda no SERVIDOR e precisa aplicar EXATAMENTE estas mesmas
// regras. Se a API reimplementasse a conversão, o mesmo laudo entraria diferente
// conforme a porta por onde chegou — e ninguém perceberia, porque os dois lados
// continuariam "funcionando". lab.ts re-exporta tudo daqui, então quem já
// importava de './lab' não muda nada.

// 'pres'/'mos': nomes de coluna do export InCeres ("P res", "MOS" = Matéria
// Orgânica Seca). Sem eles o auto-mapeamento perdia JUSTO P e MO: o casamento é
// `cabeçalho.includes(sinônimo)`, então 'p' (1 letra) e 'mo' (2) só casam exato,
// e 'presina' não está contido em 'pres' (o teste é no sentido inverso).
export const ELEMENTOS_LAB: { id: string; simbolo: string; sinonimos: string[] }[] = [
  { id: 'ph',  simbolo: 'pH',  sinonimos: ['ph', 'phcacl2', 'phcacl', 'phh2o', 'phagua', 'phsmp'] },
  { id: 'p',   simbolo: 'P',   sinonimos: ['p', 'pres', 'pmehlich', 'pmehl', 'pmeh', 'fosforo', 'presina', 'pmel'] },
  { id: 'k',   simbolo: 'K',   sinonimos: ['k', 'potassio'] },
  { id: 'ca',  simbolo: 'Ca',  sinonimos: ['ca', 'calcio'] },
  { id: 'mg',  simbolo: 'Mg',  sinonimos: ['mg', 'magnesio'] },
  { id: 'al',  simbolo: 'Al',  sinonimos: ['al', 'aluminio'] },
  { id: 'ctc', simbolo: 'CTC', sinonimos: ['ctc', 'ctcph7', 'captrocacations', 'capacidadetrocacationica'] },
  { id: 'v',   simbolo: 'V%',  sinonimos: ['v', 'v%', 'vperc', 'saturacaobases', 'satbases'] },
  { id: 'm',   simbolo: 'm%',  sinonimos: ['m%', 'mperc', 'saturacaoaluminio', 'satal', 'aluminioctcefetiva'] },
  { id: 'mo',  simbolo: 'MO',  sinonimos: ['mo', 'mos', 'moseca', 'materiaorganica', 'morg'] },
  { id: 's',   simbolo: 'S',   sinonimos: ['s', 'enxofre', 'sso4'] },
  { id: 'b',   simbolo: 'B',   sinonimos: ['b', 'boro'] },
  { id: 'zn',  simbolo: 'Zn',  sinonimos: ['zn', 'zinco'] },
  { id: 'cu',  simbolo: 'Cu',  sinonimos: ['cu', 'cobre'] },
  { id: 'mn',  simbolo: 'Mn',  sinonimos: ['mn', 'manganes'] },
  // Fe entrou depois (v2.77.0): o catálogo de ordenação do app já contava com ele
  // (ORDEM_PADRAO_FERT, entre Mn e Al) e o catálogo de variáveis também, mas AQUI
  // ele faltava — então a coluna Fe do laudo era lida e descartada em silêncio, e
  // o Ferro nunca aparecia para interpolar. Unidade canônica: mg/dm³ (não está em
  // CARGA/PERCENTUAL/GRANULOMETRIA em unidades.ts, então cai no padrão dos micros).
  { id: 'fe',  simbolo: 'Fe',  sinonimos: ['fe', 'ferro'] },
  { id: 'textura', simbolo: 'Textura', sinonimos: ['textura', 'argila', 'granulometria'] },
];

// Colunas CALCULADAS na importação — a plataforma DERIVA a partir das colunas
// do laudo (não vêm do arquivo). Canônico: t (CTC efetiva) em mmolc/dm³ (soma de
// cátions); saturações em %. Ficam DEPOIS das colunas do laudo na prévia/tabela.
export const DERIVADOS_LAB: { id: string; simbolo: string }[] = [
  { id: 't',     simbolo: 'CTCe' },
  { id: 'satk',  simbolo: 'K%' },
  { id: 'satca', simbolo: 'Ca%' },
  { id: 'satmg', simbolo: 'Mg%' },
];
export const DERIVADOS_IDS = new Set(DERIVADOS_LAB.map(d => d.id));
const SIMB_DERIVADO: Record<string, string> = Object.fromEntries(DERIVADOS_LAB.map(d => [d.id, d.simbolo]));

export const simboloElemento = (id: string) =>
  SIMB_DERIVADO[id] ?? ELEMENTOS_LAB.find(e => e.id === id)?.simbolo ?? id;

// Preenche as colunas calculadas a partir dos valores JÁ canônicos (cátions e
// CTC em mmolc/dm³):
//   • t   (CTC efetiva) = Ca + Mg + K + Al  (Al ausente conta como 0)
//   • K%  = saturação de K na CTC NOMINAL (pH7) = K  / CTC × 100
//   • Ca% = Ca / CTC × 100      • Mg% = Mg / CTC × 100
// Sempre recalcula do estado atual (sobrescreve derivados anteriores) e nunca
// toca nas colunas do laudo. Só grava quando os insumos existem (senão remove,
// p/ não deixar coluna calculada com valor velho após uma edição na prévia).
export function calcularDerivados(v: Record<string, number>): void {
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const { ca, mg, k, al, ctc } = v;
  if (ca != null && mg != null && k != null) v.t = r1(ca + mg + k + (al ?? 0)); else delete v.t;
  const sat = (id: string, base: number | undefined) => {
    if (ctc != null && ctc > 0 && base != null) v[id] = r1((base / ctc) * 100); else delete v[id];
  };
  sat('satk', k); sat('satca', ca); sat('satmg', mg);
}

export const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9%]/g, '');

// Normalização de CABEÇALHO (só p/ o auto-mapeamento). Igual à `norm`, mas
// PRESERVA `/` e `+`: sem eles "Ca/Mg" (relação) e "Ca+Mg" (soma) viram o mesmo
// 'camg' e uma rouba a coluna da outra. `norm` não pode mudar — ela monta as
// chaves de talhão/profundidade em aplicarPerfil.
export const normCab = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9%/+]/g, '');

// Número PT/US, rejeitando datas e tokens não-numéricos (N.D, <x, -, 4/30/00…).
export function parseNum(s: string | number | null | undefined): number | null {
  if (s == null) return null;
  const t = String(s).trim();
  if (t === '' || /^n\.?d\.?$/i.test(t) || t === '-' || t.startsWith('<') || t.startsWith('>') || t.includes('/')) return null;
  let x = t.replace(/[^\d.,-]/g, '');
  if (x.includes(',') && x.includes('.')) x = x.replace(/\./g, '').replace(',', '.');
  else if (x.includes(',')) x = x.replace(',', '.');
  const v = parseFloat(x);
  return isFinite(v) ? v : null;
}

// Valor de LABORATÓRIO: número normal; tokens de "não detectado" (N.D., N.D, ND,
// N/D) e "abaixo do limite de detecção" (<x) viram ZERO — o laudo mediu e não
// achou, então 0 é o valor agronômico correto. Célula VAZIA, texto qualquer e
// ">x" continuam SEM valor (não inventa zero para o que não foi analisado).
export function valorLab(s: string | number | null | undefined): number | null {
  const v = parseNum(s);
  if (v != null) return v;
  const t = String(s ?? '').trim().toLowerCase();
  if (!t) return null;
  if (/^n[\s./-]?d\.?$/.test(t) || t.startsWith('<')) return 0;
  return null;
}

/**
 * Uma amostra já interpretada: valores em unidade CANÔNICA da plataforma.
 *
 * Vive aqui, e não em lab.ts, porque as DUAS portas de entrada têm de produzir
 * exatamente esta forma — o import de arquivo (aplicarPerfil) e a ingestão pela
 * API. Tipo compartilhado faz disso uma garantia do compilador em vez de um
 * comentário que envelhece.
 */
export interface ResultadoAmostra {
  numero: number;
  profundidade: string;
  talhao: string;
  campanha: string;
  valores: Record<string, number>;
}
