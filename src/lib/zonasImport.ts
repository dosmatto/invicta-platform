// Detecção e mapeamento do CAMPO DE CLASSE de um zoneamento importado
// (etapas 5 e 6 do projeto de Zoneamento Nativo: "Detectar atributos" e
// "Mapear atributos").
//
// O problema que este módulo existe para resolver: a detecção antiga só aceitava
// classe TEXTUAL (alta/média/baixa). Arquivo com classe NUMÉRICA — 1..5, que é o
// que sai do script de taxa variável do QGIS e da maioria dos fornecedores —
// não era reconhecido, o campo ficava vazio, TODOS os polígonos caíam na mesma
// classe e o zoneamento aparecia como "1 zona · N polígonos · Único". Sem
// classes distintas não há o que prescrever: o mapa entra na plataforma morto.
//
// Puro (sem browser/DOM) para os testes rodarem em node.

// .ts explícito: o type-stripping do node (usado pelos testes) resolve o
// caminho literalmente — sem a extensão, `npm run teste:zonas-import` quebra.
import { classeReconhecida, classeZona } from './zonas.ts';

/** Um campo candidato a "classe", com o porquê de ter sido escolhido. */
export interface CandidatoClasse {
  campo: string;
  /** Valores distintos encontrados (ordenados; no máx. 40 para não estourar UI). */
  valores: string[];
  /** Quantos polígonos têm valor textual reconhecido pelo semáforo. */
  reconhecidosTexto: number;
  /** Todos os valores são numéricos? (classe 1..5 e afins) */
  numerico: boolean;
  /** Nota da heurística — maior é melhor. Só ordena candidatos. */
  nota: number;
}

const MAX_CLASSES = 12;   // acima disso não é classe, é identificador
const MIN_CLASSES = 2;    // 1 valor distinto não separa nada

const NOME_PLAUSIVEL = /class|zona|manejo|categoria|ugd|nivel|n[íi]vel|potencial|fertil|produt|rank/i;
// Campos que são IDENTIFICADOR e não classe. Sem isso, um "id" 1..5 num arquivo
// de 5 polígonos ganharia do campo certo por parecer numérico e pequeno.
const NOME_DE_ID = /^(id|fid|objectid|gid|uid|codigo|cod|shape_?(area|len|leng|length))$/i;

const texto = (v: unknown): string => (v == null ? '' : String(v).trim());
const ehNumero = (s: string): boolean => s !== '' && Number.isFinite(Number(s.replace(',', '.')));

/**
 * Lista os campos que PODEM ser a classe, do mais provável ao menos.
 * Não decide sozinho quando está em dúvida — quem decide é o usuário, na UI.
 */
export function candidatosClasse(
  features: Array<{ properties?: Record<string, unknown> | null }>,
): CandidatoClasse[] {
  const chaves = new Set<string>();
  for (const f of features) for (const k of Object.keys(f.properties ?? {})) chaves.add(k);

  const out: CandidatoClasse[] = [];
  for (const campo of chaves) {
    const brutos = features.map(f => texto((f.properties ?? {})[campo]));
    const preenchidos = brutos.filter(v => v !== '');
    if (!preenchidos.length) continue;

    const distintos = [...new Set(preenchidos)];
    if (distintos.length < MIN_CLASSES || distintos.length > MAX_CLASSES) continue;

    const reconhecidosTexto = preenchidos.filter(v => classeReconhecida(v)).length;
    const numerico = preenchidos.every(ehNumero);

    // Classe textual reconhecida é o sinal mais forte que existe — vale por
    // polígono. Numérico é bom sinal, mas fraco: por isso pesa bem menos e
    // ainda pode perder para um campo textual reconhecido.
    let nota = reconhecidosTexto * 2;
    if (numerico) nota += 3;
    if (NOME_PLAUSIVEL.test(campo)) nota += 5;
    if (NOME_DE_ID.test(campo)) nota -= 8;
    // Cobertura: campo com buraco em metade dos polígonos não serve de classe.
    nota *= preenchidos.length / features.length;

    out.push({ campo, valores: distintos.slice(0, 40), reconhecidosTexto, numerico, nota });
  }
  out.sort((a, b) => b.nota - a.nota || a.campo.localeCompare(b.campo));
  return out;
}

/** Ordem canônica de potencial (maior → menor), como o resto da plataforma. */
const ROTULOS: Record<number, string[]> = {
  2: ['Alta', 'Baixa'],
  3: ['Alta', 'Média', 'Baixa'],
  4: ['Alta', 'Média-alta', 'Média-baixa', 'Baixa'],
  5: ['Alta', 'Média-alta', 'Média', 'Média-baixa', 'Baixa'],
};

/**
 * Mapa valor-do-arquivo → rótulo de classe.
 *
 * Texto reconhecido passa direto pelo semáforo. Numérico é ORDENADO e recebe os
 * rótulos ordinais — e aí entra a decisão que nenhum arquivo carrega: se 1 é a
 * PIOR zona (convenção do script do QGIS) ou a MELHOR (convenção de quem numera
 * por ranking). Errar isso inverte a prescrição inteira — aplica mais onde
 * devia aplicar menos —, então é parâmetro explícito, sem "esperto" default.
 */
export function mapearValoresParaClasses(
  valores: string[], opcoes: { menorEhPior: boolean },
): Record<string, string> {
  const mapa: Record<string, string> = {};
  const numericos = valores.filter(ehNumero);

  if (numericos.length === valores.length && valores.length >= MIN_CLASSES) {
    const ord = [...valores].sort((a, b) => Number(a.replace(',', '.')) - Number(b.replace(',', '.')));
    // do MAIOR potencial para o menor
    const doMelhor = opcoes.menorEhPior ? [...ord].reverse() : ord;
    const rot = ROTULOS[doMelhor.length];
    doMelhor.forEach((v, i) => {
      mapa[v] = rot ? rot[i] : `Nível ${i + 1}`;
    });
    return mapa;
  }

  for (const v of valores) mapa[v] = classeZona(v).label;
  return mapa;
}

/** Aplica o mapa nas features, gravando `classe` textual padronizada. */
export function aplicarMapaClasses<T extends { properties?: Record<string, unknown> | null }>(
  features: T[], campo: string, mapa: Record<string, string>,
): Array<{ original: T; classe: string }> {
  return features.map(f => {
    const v = texto((f.properties ?? {})[campo]);
    return { original: f, classe: mapa[v] ?? (v ? classeZona(v).label : '') };
  });
}
