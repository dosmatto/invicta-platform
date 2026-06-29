// Classes de zona de manejo → cores do semáforo.
// Robusto a variações: ALTA/ALTO, MÉDIA-ALTA, MÉDIA/MÉDIO, MÉDIA-BAIXA, BAIXA/BAIXO.

export interface ClasseZona {
  label: string;
  cor: string;
}

function normaliza(raw: string): string {
  return (raw || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
    .toUpperCase().replace(/[_\s]+/g, '-').trim();
}

// Retorna { label, cor } para uma classe textual qualquer
export function classeZona(raw: string): ClasseZona {
  const c = normaliza(raw);
  const temMedio = /MEDI/.test(c);
  const temAlto = /ALT/.test(c);
  const temBaixo = /BAIX/.test(c);

  if (temMedio && temAlto) return { label: 'Média-alta', cor: '#84cc16' }; // verde-claro
  if (temMedio && temBaixo) return { label: 'Média-baixa', cor: '#f97316' }; // laranja
  if (temAlto) return { label: 'Alta', cor: '#16a34a' };   // verde
  if (temBaixo) return { label: 'Baixa', cor: '#dc2626' }; // vermelho
  if (temMedio) return { label: 'Média', cor: '#eab308' }; // amarelo
  return { label: raw || '—', cor: '#94a3b8' };            // desconhecida: cinza
}

// true se o texto bate com uma classe conhecida (alto/médio/baixo e combinações)
export function classeReconhecida(raw: string): boolean {
  return /MEDI|ALT|BAIX/.test(normaliza(raw));
}

// Cor por POSIÇÃO no ranking (0 = maior potencial = verde … último = vermelho).
// Usada quando há mais classes (6–12) do que os 5 nomes do semáforo — aí
// classeZona não tem nome/cor e cairia em cinza.
export function corZonaPorPosicao(pos: number, total: number): string {
  const t = total <= 1 ? 0 : Math.min(1, Math.max(0, pos / (total - 1)));
  const stops: Array<[number, number, number]> = [[22, 163, 74], [234, 179, 8], [220, 38, 38]]; // verde, amarelo, vermelho
  const seg = t <= 0.5 ? 0 : 1;
  const lt = t <= 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
  const [r1, g1, b1] = stops[seg], [r2, g2, b2] = stops[seg + 1];
  const mix = (a: number, b: number) => Math.round(a + (b - a) * lt);
  const hex = (v: number) => v.toString(16).padStart(2, '0');
  return `#${hex(mix(r1, r2))}${hex(mix(g1, g2))}${hex(mix(b1, b2))}`;
}

// Ordem da legenda (alta → baixa)
export const ORDEM_CLASSES = ['Alta', 'Média-alta', 'Média', 'Média-baixa', 'Baixa'];
