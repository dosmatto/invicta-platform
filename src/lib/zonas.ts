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

// Ordem da legenda (alta → baixa)
export const ORDEM_CLASSES = ['Alta', 'Média-alta', 'Média', 'Média-baixa', 'Baixa'];
