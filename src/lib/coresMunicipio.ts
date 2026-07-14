// Cor estável por município para o mapa de visão geral do Início.
// A ordem alfabética garante que o mesmo município receba sempre a mesma cor
// entre sessões, independente da ordem em que os talhões chegam.

const PALETA = [
  '#8b5cf6', // violeta
  '#0ea5e9', // azul céu
  '#a855f7', // roxo
  '#14b8a6', // turquesa
  '#f59e0b', // âmbar
  '#f97316', // laranja
  '#22c55e', // verde
  '#ef4444', // vermelho
  '#334155', // ardósia
  '#64748b', // cinza
  '#ec4899', // rosa
  '#84cc16', // lima
  '#06b6d4', // ciano
  '#eab308', // amarelo
  '#6366f1', // índigo
  '#10b981', // esmeralda
  '#d946ef', // fúcsia
  '#dc2626', // rubro
];

export function mapaCoresMunicipio(municipios: string[]): Record<string, string> {
  const unicos = Array.from(new Set(municipios.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const cores: Record<string, string> = {};
  unicos.forEach((m, i) => { cores[m] = PALETA[i % PALETA.length]; });
  return cores;
}
