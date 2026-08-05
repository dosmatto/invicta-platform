// LINHAGEM DE VERSÕES de um zoneamento (spec §5).
//
// A versão sempre existiu no dado — suavizar e editar já gravavam
// `meta.suavizacao.origemId` / `meta.edicaoManual.origemId` e nunca
// sobrescreviam o original. O que não existia era a LEITURA disso: a tela
// mostrava uma lista plana onde "Zoneamento 2 — Suavização leve — Ajuste
// manual" aparecia solto do pai, e ninguém sabia o que veio de quê, em que
// ordem, nem o que mudou entre uma e outra.
//
// Este módulo reconstrói a árvore a partir do id de origem e numera as versões
// V1..VN por data DENTRO de cada linhagem — o talhão pode ter vários
// zoneamentos independentes, e cada um tem a sua contagem.
//
// Puro (sem browser/DOM): npm run teste:versoes

import type { ZoneamentoMeap } from '../store';

export type TipoVersao = 'importada' | 'gerada' | 'suavizada' | 'ajuste-manual' | 'restaurada';

export const ROTULO_TIPO: Record<TipoVersao, string> = {
  importada: 'Importada',
  gerada: 'Gerada',
  suavizada: 'Suavizada',
  'ajuste-manual': 'Ajuste manual',
  restaurada: 'Restaurada',
};

export interface VersaoZoneamento {
  z: ZoneamentoMeap;
  numero: number;            // 1..N dentro da linhagem
  rotulo: string;            // "V2 Suavizada"
  tipo: TipoVersao;
  origemId?: string;
  origemNumero?: number;     // nº do pai na linhagem (ausente na raiz)
  origemNome?: string;
  orfa: boolean;             // o pai citado não existe mais (foi excluído)
  data: string;
  usuario?: string;
  resumo: string;            // o que esta versão fez em relação ao pai
}

export interface Linhagem {
  id: string;                // id da versão raiz
  nome: string;              // nome-base (sem os sufixos de versão)
  versoes: VersaoZoneamento[];
  temPadrao: boolean;        // alguma versão desta linhagem é a oficial
}

/** De onde esta versão veio (id do zoneamento pai), se veio de alguma. */
export function origemDe(z: ZoneamentoMeap): { id?: string; nome?: string } {
  const m = z.meta;
  const fonte = m.restauracao ?? m.edicaoManual ?? m.suavizacao;
  return { id: fonte?.origemId, nome: fonte?.origemNome };
}

/** O que ESTA versão é. A ordem importa: restaurar/editar carrega a meta do pai. */
export function tipoDaVersao(z: ZoneamentoMeap): TipoVersao {
  const m = z.meta;
  if (m.restauracao) return 'restaurada';
  if (m.edicaoManual) return 'ajuste-manual';
  if (m.suavizacao) return 'suavizada';
  if (m.importacao) return 'importada';
  return 'gerada';
}

// Como o zoneamento foi feito (o nome cru do algoritmo não diz nada na tela).
export const ROTULO_ALG: Record<string, string> = { fcm: 'fuzzy', kmeans: 'k-means', quantis: 'quantis', importado: 'importação' };

const N1 = (v: number) => Math.round(v * 10) / 10;

/** Frase curta do que a versão fez — é o que o usuário lê para escolher. */
export function resumoDaVersao(z: ZoneamentoMeap): string {
  const m = z.meta;
  const polis = m.nPoligonos ? `${m.nPoligonos} polígonos` : '';
  if (m.restauracao) {
    return `cópia da ${m.restauracao.origemNome ?? 'versão anterior'} — o histórico segue intacto`;
  }
  if (m.edicaoManual) {
    const e = m.edicaoManual;
    const partes = [
      e.nUnificacoes ? `${e.nUnificacoes} unificação(ões)` : '',
      e.nReclassificacoes ? `${e.nReclassificacoes} reclassificação(ões)` : '',
      e.nDivisoes ? `${e.nDivisoes} divisão(ões)` : '',
    ].filter(Boolean);
    return partes.length ? partes.join(' · ') : 'edição manual sem operações registradas';
  }
  if (m.suavizacao) {
    const s = m.suavizacao;
    const vert = s.vertAntes && s.vertDepois ? ` · ${s.vertAntes}→${s.vertDepois} vértices` : '';
    const dif = s.diffTotalHa ? ` · ${N1(s.diffTotalHa)} ha mudaram de lugar` : '';
    return `suavização ${s.nivel} (tolerância ${N1(s.toleranciaM)} m)${vert}${dif}`;
  }
  if (m.importacao) {
    const i = m.importacao;
    const campo = i.campoClasse ? ` · classe pelo campo "${i.campoClasse}"` : '';
    return `${i.arquivo ?? 'arquivo do talhão'}${campo}`;
  }
  const cams = m.camadas.length ? ` de ${m.camadas.join(', ')}` : '';
  return `${m.nZonas} zonas por ${ROTULO_ALG[m.algoritmo] ?? m.algoritmo}${cams}${polis ? ` · ${polis}` : ''}`;
}

/** Quem assinou a versão (quando ficou registrado). */
export function usuarioDaVersao(z: ZoneamentoMeap): string | undefined {
  const m = z.meta;
  return m.restauracao?.usuario ?? m.edicaoManual?.usuario ?? m.suavizacao?.usuario ?? m.importacao?.usuario;
}

// Sufixos que as derivações penduram no nome. Tirados para o cabeçalho da
// linhagem mostrar o nome do zoneamento, não a pilha de operações.
const SUFIXOS = /\s+—\s+(Suavização|Ajuste manual|V\d+\s|Restaurada).*$/i;

export function nomeBase(nome: string): string {
  let n = nome;
  // aplica repetidamente: "X — Suavização leve — Ajuste manual"
  for (let i = 0; i < 6; i++) {
    const novo = n.replace(SUFIXOS, '').trim();
    if (novo === n) break;
    n = novo;
  }
  return n || nome;
}

/**
 * Nome da versão SEM o prefixo da linhagem — o cabeçalho já mostra o nome do
 * zoneamento, e repetir "Zoneamento FRNFI 21 QGIS — V1 Importada — Suavização
 * moderada" em cada linha empurra o que interessa para fora da tela.
 * Devolve '' quando não sobra nada além do nome-base (aí a linha usa o rótulo).
 */
export function nomeCurto(nome: string, base: string): string {
  if (!base || !nome.startsWith(base)) return nome;
  const resto = nome.slice(base.length).replace(/^[\s—–-]+/, '').trim();
  // Os sufixos empilham ("… — V1 Importada — Suavização moderada — Ajuste
  // manual"): o que descreve ESTA versão é o último segmento.
  const partes = resto.split(/\s+—\s+/).filter(Boolean);
  return partes.length ? partes[partes.length - 1] : '';
}

/**
 * Agrupa os zoneamentos do talhão em linhagens e numera as versões.
 *
 * Regras: a raiz é quem não aponta origem (ou aponta para algo que já não
 * existe — versão órfã, cujo pai foi excluído: ela vira raiz e diz de onde
 * veio, em vez de sumir da tela). Dentro da linhagem, a ordem é a de criação,
 * que é a ordem em que o trabalho aconteceu.
 */
export function montarLinhagens(zs: ZoneamentoMeap[]): Linhagem[] {
  const porId = new Map(zs.map(z => [z.id, z]));

  // Sobe até a raiz (com trava de ciclo — dado corrompido não pode travar a tela).
  const raizDe = (z: ZoneamentoMeap): ZoneamentoMeap => {
    let atual = z;
    const visto = new Set<string>([z.id]);
    for (let i = 0; i < 50; i++) {
      const pai = origemDe(atual).id;
      if (!pai || visto.has(pai)) break;
      const zp = porId.get(pai);
      if (!zp) break;                 // órfã: o pai foi excluído
      visto.add(pai);
      atual = zp;
    }
    return atual;
  };

  const grupos = new Map<string, ZoneamentoMeap[]>();
  for (const z of zs) {
    const raiz = raizDe(z).id;
    const arr = grupos.get(raiz);
    if (arr) arr.push(z); else grupos.set(raiz, [z]);
  }

  const linhagens: Linhagem[] = [];
  for (const [raizId, membros] of grupos) {
    const ordenados = [...membros].sort((a, b) => a.criadoEm.localeCompare(b.criadoEm) || a.id.localeCompare(b.id));
    const numeroPorId = new Map(ordenados.map((z, i) => [z.id, i + 1]));

    const versoes: VersaoZoneamento[] = ordenados.map((z, i) => {
      const org = origemDe(z);
      const paiExiste = !!(org.id && porId.has(org.id));
      const tipo = tipoDaVersao(z);
      return {
        z, numero: i + 1, tipo,
        rotulo: `V${i + 1} ${ROTULO_TIPO[tipo]}`,
        origemId: org.id, origemNome: org.nome,
        origemNumero: paiExiste ? numeroPorId.get(org.id!) : undefined,
        orfa: !!org.id && !paiExiste,
        data: z.criadoEm,
        usuario: usuarioDaVersao(z),
        resumo: resumoDaVersao(z),
      };
    });

    const raiz = porId.get(raizId) ?? ordenados[0];
    linhagens.push({
      id: raizId,
      nome: nomeBase(raiz.nome),
      versoes,
      temPadrao: ordenados.some(z => z.padrao),
    });
  }

  // Linhagem mais antiga primeiro (a ordem em que o talhão foi trabalhado).
  return linhagens.sort((a, b) => a.versoes[0].data.localeCompare(b.versoes[0].data));
}

/** Nome da versão criada ao RESTAURAR — nunca colide com um nome existente. */
export function nomeVersaoRestaurada(base: string, numeroOrigem: number, usados: Iterable<string>): string {
  const set = new Set(usados);
  const desejado = `${base} — Restaurada da V${numeroOrigem}`;
  if (!set.has(desejado)) return desejado;
  let n = 2;
  while (set.has(`${desejado} (${n})`)) n++;
  return `${desejado} (${n})`;
}
