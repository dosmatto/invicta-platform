// SUGESTÃO DE CLASSIFICAÇÃO DE POTENCIAL PRODUTIVO.
//
// O zoneamento sai do algoritmo com rótulos que só dizem "zona 1, zona 2" — ou,
// pior, com classes herdadas de outro mapa que não correspondem ao que a
// produtividade mostra. Aqui a validação devolve o favor: já que ela mediu a
// média de cada zona na camada de referência E sabe quais zonas NÃO se
// distinguem estatisticamente, dá para propor a classificação certa.
//
// Duas regras que fazem a sugestão valer mais que ordenar por média:
//
//  1. ZONAS INDISTINGUÍVEIS RECEBEM A MESMA CLASSE. Se 03 e 05 diferem menos
//     que a variação de dentro delas (d de Cohen < 0,5), chamá-las de "Média"
//     e "Média-baixa" inventa uma diferença que o dado não tem — e vira dose
//     diferente no campo por nada.
//  2. O NÚMERO DE CLASSES SAI DOS GRUPOS, não do número de zonas. Três grupos
//     distintos viram Alta/Média/Baixa; cinco viram a escala inteira.
//
// A sugestão nunca é aplicada sozinha: quem aceita é o agrônomo, e o aceite
// grava uma VERSÃO NOVA (o zoneamento original continua intacto).
//
// Módulo PURO. npm run teste:validacao

import { classeZona } from '../zonas.ts';
import type { ParSeparacao, Separacao } from './estatistica.ts';

/** Escalas por número de grupos distintos — sempre do maior para o menor potencial. */
export const ESCALAS: Record<number, string[]> = {
  1: ['Média'],
  2: ['Alta', 'Baixa'],
  3: ['Alta', 'Média', 'Baixa'],
  4: ['Alta', 'Média-alta', 'Média-baixa', 'Baixa'],
  5: ['Alta', 'Média-alta', 'Média', 'Média-baixa', 'Baixa'],
};

export interface ZonaParaSugestao {
  idZona: string;
  nome: string;
  classeAtual: string;
  areaHa: number;
  /** média da camada de validação na zona (null = sem dado) */
  media: number | null;
}

export interface SugestaoZona {
  idZona: string;
  nome: string;
  classeAtual: string;
  classeSugerida: string;
  cor: string;
  rankSugerido: number;
  media: number | null;
  /** grupo estatístico (zonas do mesmo grupo não se distinguem entre si) */
  grupo: number;
  mudou: boolean;
}

export interface Sugestao {
  zonas: SugestaoZona[];
  nGrupos: number;
  nMudancas: number;
  /** Zonas que ficaram de fora (sem dado da camada) — mantêm a classe atual. */
  semDado: string[];
  justificativa: string;
  /** Pares vizinhos que motivaram fusão de classe. */
  fundidos: ParSeparacao[];
}

const fmt = (v: number, d = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * Propõe a classe de cada zona a partir da média medida e da separação
 * estatística. `unidade` só entra no texto.
 */
export function sugerirClassificacao(
  zonas: ZonaParaSugestao[],
  separacao: Separacao | null,
  unidade = '',
): Sugestao {
  const comDado = zonas.filter(z => z.media != null).sort((a, b) => (b.media as number) - (a.media as number));
  const semDado = zonas.filter(z => z.media == null).map(z => z.nome);

  if (!comDado.length) {
    return {
      zonas: [], nGrupos: 0, nMudancas: 0, semDado,
      justificativa: 'Nenhuma zona tem dado da camada de validação — não há como sugerir classificação.',
      fundidos: [],
    };
  }

  // Par indistinguível? Consulta a matriz do d de Cohen já calculada.
  const parDe = (a: string, b: string): ParSeparacao | undefined =>
    separacao?.pares.find(p => (p.a === a && p.b === b) || (p.a === b && p.b === a));

  // Agrupa na ordem decrescente de média: a zona entra no grupo anterior quando
  // não se distingue dele (comparação com a ÚLTIMA da corrente — é a vizinha).
  const grupos: ZonaParaSugestao[][] = [];
  const fundidos: ParSeparacao[] = [];
  for (const z of comDado) {
    const atual = grupos[grupos.length - 1];
    const anterior = atual?.[atual.length - 1];
    const par = anterior ? parDe(anterior.idZona, z.idZona) : undefined;
    if (atual && par && par.sobrepostas) { atual.push(z); fundidos.push(par); }
    else grupos.push([z]);
  }

  const escala = ESCALAS[grupos.length] ?? null;
  const nomes = escala ?? grupos.map((_, i) => `Classe ${i + 1}`);

  const out: SugestaoZona[] = [];
  grupos.forEach((grupo, i) => {
    const label = nomes[i];
    const cor = classeZona(label).cor;
    for (const z of grupo) {
      out.push({
        idZona: z.idZona, nome: z.nome, classeAtual: z.classeAtual,
        classeSugerida: label, cor, rankSugerido: i + 1, media: z.media, grupo: i + 1,
        mudou: (z.classeAtual || '').trim().toLowerCase() !== label.toLowerCase(),
      });
    }
  });

  const nMudancas = out.filter(z => z.mudou).length;
  const faixas = grupos.map((g, i) => {
    const ms = g.map(z => z.media as number);
    const txt = g.length === 1 ? fmt(ms[0]) : `${fmt(Math.min(...ms))}–${fmt(Math.max(...ms))}`;
    return `${nomes[i]}: ${g.map(z => z.nome).join(', ')} (${txt}${unidade ? ` ${unidade}` : ''})`;
  }).join(' · ');

  const notaFusao = fundidos.length
    ? ` ${fundidos.length} par(es) de zonas receberam a MESMA classe por não se distinguirem estatisticamente (d de Cohen < 0,5) — dar nomes diferentes a elas criaria dose diferente sem diferença real no campo.`
    : '';
  const notaEscala = !escala
    ? ` Mais de 5 grupos distintos: a escala do semáforo tem 5 nomes, então os grupos excedentes saem numerados.`
    : '';
  const notaSemDado = semDado.length
    ? ` ${semDado.length} zona(s) sem dado da camada (${semDado.join(', ')}) mantêm a classe atual.`
    : '';

  return {
    zonas: out, nGrupos: grupos.length, nMudancas, semDado, fundidos,
    justificativa: `${grupos.length} grupo(s) distinto(s) pela média medida — ${faixas}.${notaFusao}${notaEscala}${notaSemDado}`,
  };
}

/**
 * Aplica a sugestão a uma FeatureCollection de zoneamento, devolvendo a NOVA.
 * Não altera a original (documento operacional: versão nova, sempre).
 */
export function aplicarSugestao(fc: GeoJSON.FeatureCollection, sug: Sugestao): GeoJSON.FeatureCollection {
  const porZona = new Map(sug.zonas.map(z => [z.idZona, z]));
  return {
    type: 'FeatureCollection',
    features: fc.features.map(f => {
      const props = (f.properties ?? {}) as Record<string, unknown>;
      const id = String(props.id ?? props.zona ?? '');
      const s = porZona.get(id);
      if (!s) return f;
      return {
        ...f,
        properties: { ...props, classe: s.classeSugerida, cor: s.cor, potencialRank: s.rankSugerido },
      };
    }),
  };
}
