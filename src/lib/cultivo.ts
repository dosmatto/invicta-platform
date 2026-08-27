// CULTIVO — o registro fitotécnico de um talhão numa safra. Puro: sem DOM, sem
// I/O, sem 'use client'. Só as REGRAS; a gravação fica em `store.ts`.
//
// Está separado pelo mesmo motivo que `laudo/nucleo.ts` está separado de
// `lab.ts`: `store.ts` importa meia dúzia de módulos de navegador e não roda em
// node, então nada dele é testável. E o que precisa de teste aqui não é a
// persistência — é QUEM SOBRESCREVE QUEM. Errar isso faz o consórcio apagar a
// cultura principal, ou as duas partes de um talhão virarem uma só.
//
// Substitui o antigo `Plantio` (que era só `cultura: string`, um por
// talhão+safra). A planilha do cliente tem três coisas que não cabiam ali:
//
//   • CONSÓRCIO — milho e braquiária na MESMA área, mesmo talhão, mesma safra
//     (CKLBV 10 a: 36,49 ha nas duas linhas). Com um registro por talhão+safra,
//     o segundo sobrescrevia o primeiro.
//   • TALHÃO PARTIDO — "HABPU 02 a" (20,76 ha) e "HABPU 02 b" (76,90 ha), cada
//     pedaço com o seu cultivar.
//   • SAFRINHA — soja no verão e milho depois, no mesmo talhão e no mesmo ano.

export type EpocaCultivo = '' | 'verao' | 'safrinha' | 'inverno';

export interface Cultivo {
  id: string;
  talhaoId: string;
  /** Nome da safra ("26/27"), igual ao Plantio antigo. */
  safra: string;
  /** Época dentro do ano. '' = a principal/única. */
  epoca: EpocaCultivo;
  /** Rótulo da parte do talhão ('', 'A', 'B', 'AB'). '' = o talhão inteiro. */
  parte: string;
  /** 1 = principal. 2+ = consorciado, na MESMA área do 1. */
  ordem: number;
  /** Um dos valores de CULTURAS (store.ts). */
  cultura: string;
  /**
   * O texto exato da planilha ("SOJA TRANSGENICA"). A plataforma não tem
   * subcultura e, por decisão de 27/08/2026, não vai ter — mas jogar o texto
   * fora seria perder dado do cliente que não volta. Fica aqui.
   */
  culturaOrigem?: string;
  /** Item da Biblioteca, categoria 'cultivares'. */
  cultivarId?: string;
  /** Nome no momento do lançamento. Snapshot: o relatório não pode depender de
   *  o item da Biblioteca continuar existindo. */
  cultivarNome?: string;
  propositoId?: string;
  propositoNome?: string;
  /**
   * Área DECLARADA pelo cliente, em ha. Nunca sobrescreve `Talhao.areaHa`, que
   * é geodésica e calculada do polígono — as duas convivem, e a divergência
   * entre elas é justamente o que a conferência mostra.
   */
  areaHa?: number;
  dataPlantio?: string;
  origem: 'manual' | 'importacao';
  /** Rastreabilidade: de qual importação este registro veio. */
  importacaoId?: string;
  empresaId?: string;
  criadoEm: string;
  atualizadoEm?: string;
}

/** O que a planilha manda antes de virar registro. */
export type NovoCultivo = Omit<Cultivo, 'id' | 'criadoEm'> & { id?: string };

type Coordenadas = Pick<Cultivo, 'epoca' | 'parte' | 'ordem'>;

/**
 * Chave de unicidade: (talhão, safra, época, parte, ordem).
 *
 * É a definição que sustenta os três casos acima. Trocar qualquer componente
 * por outro faz um deles colapsar em silêncio.
 */
export function chaveCultivo(c: Pick<Cultivo, 'talhaoId' | 'safra'> & Partial<Coordenadas>): string {
  return `${c.talhaoId}|${c.safra}|${c.epoca ?? ''}|${c.parte ?? ''}|${c.ordem ?? 1}`;
}

/** O principal: época padrão, talhão inteiro, ordem 1. */
export const ehPrincipal = (c: Partial<Coordenadas>): boolean =>
  !c.epoca && !c.parte && (c.ordem ?? 1) === 1;

/** Ordem de exibição: primeiro por parte, depois pela ordem do consórcio. */
export const compararCultivos = (a: Cultivo, b: Cultivo): number =>
  (a.parte ?? '').localeCompare(b.parte ?? '') || (a.ordem ?? 1) - (b.ordem ?? 1);

/**
 * Upsert por chave (ou por id, quando ele vem). Devolve a lista NOVA e o
 * registro gravado — nunca muta a lista recebida.
 */
export function aplicarCultivo(
  lista: Cultivo[], novo: NovoCultivo, agora: string, gerarId: () => string,
): { lista: Cultivo[]; salvo: Cultivo } {
  const i = novo.id
    ? lista.findIndex(x => x.id === novo.id)
    : lista.findIndex(x => chaveCultivo(x) === chaveCultivo(novo));
  const out = [...lista];
  let salvo: Cultivo;
  if (i >= 0) {
    salvo = { ...out[i], ...novo, id: out[i].id, atualizadoEm: agora };
    out[i] = salvo;
  } else {
    salvo = { ...novo, id: novo.id ?? gerarId(), criadoEm: agora, atualizadoEm: agora } as Cultivo;
    out.push(salvo);
  }
  return { lista: out, salvo };
}

/**
 * A cultura que o app enxerga pelo caminho antigo (`getPlantio`): a do cultivo
 * principal. Quando há consórcio ou talhão partido devolve a do principal —
 * quem precisa do quadro completo lista os cultivos.
 */
export function culturaPrincipal(lista: Cultivo[], talhaoId: string, safra: string): string {
  if (!talhaoId || !safra) return '';
  const doTalhao = lista.filter(c => c.talhaoId === talhaoId && c.safra === safra);
  return (doTalhao.find(ehPrincipal) ?? doTalhao.sort(compararCultivos)[0])?.cultura ?? '';
}

/**
 * Grava a cultura do cultivo PRINCIPAL. Cultura vazia remove SÓ ele — consórcios
 * e partes do mesmo talhão/safra ficam intactos, que é a diferença em relação ao
 * `setPlantio` antigo (aquele só tinha um registro para apagar).
 */
export function definirCulturaPrincipal(
  lista: Cultivo[], talhaoId: string, safra: string, cultura: string, agora: string, gerarId: () => string,
): Cultivo[] {
  if (!talhaoId || !safra) return lista;
  const i = lista.findIndex(c => c.talhaoId === talhaoId && c.safra === safra && ehPrincipal(c));
  const out = [...lista];
  if (i >= 0) {
    if (cultura) out[i] = { ...out[i], cultura, atualizadoEm: agora };
    else out.splice(i, 1);
    return out;
  }
  if (!cultura) return out;
  out.push({
    id: gerarId(), talhaoId, safra, epoca: '', parte: '', ordem: 1,
    cultura, origem: 'manual', criadoEm: agora, atualizadoEm: agora,
  });
  return out;
}

/** O formato antigo, para a migração. */
export interface PlantioLegado {
  id: string; talhaoId: string; safra: string; cultura: string; criadoEm: string; empresaId?: string;
}

/**
 * Converte `Plantio` em `Cultivo`, sem duplicar o que já foi convertido.
 *
 * IDEMPOTENTE de propósito: a flag do localStorage pode ser limpa (troca de
 * navegador, limpeza de dados, boot em outra aba), e uma segunda passada que
 * duplicasse duplicaria o histórico INTEIRO de culturas do cliente.
 */
export function migrarPlantios(antigos: PlantioLegado[], atuais: Cultivo[]): Cultivo[] {
  const jaTem = new Set(atuais.map(chaveCultivo));
  const out = [...atuais];
  for (const p of antigos) {
    if (!p?.cultura || !p.talhaoId || !p.safra) continue;
    const k = chaveCultivo({ talhaoId: p.talhaoId, safra: p.safra });
    if (jaTem.has(k)) continue;
    out.push({
      id: p.id, talhaoId: p.talhaoId, safra: p.safra,
      epoca: '', parte: '', ordem: 1, cultura: p.cultura,
      // Histórico é lançamento manual, não importação: marcar como importação
      // faria o filtro de auditoria devolver registros que nunca vieram de
      // planilha nenhuma.
      origem: 'manual',
      criadoEm: p.criadoEm, atualizadoEm: p.criadoEm,
      ...(p.empresaId ? { empresaId: p.empresaId } : {}),
    });
    jaTem.add(k);
  }
  return out;
}
