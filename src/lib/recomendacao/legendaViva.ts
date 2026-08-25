// LEGENDA VIVA da dose: o cenário salvo guarda o GRID (resultado do cálculo,
// imutável) mas a APRESENTAÇÃO vem da equação atual da Biblioteca.
//
// Por que existe (bug relatado em 2026-08-07): `calcularDose` copia o estilo da
// equação POR VALOR para dentro da dose (aplicar.ts) e esse snapshot é gravado
// no documento do cenário (`inv_cenarios`). Nenhum caminho de relatório relia a
// equação — só o número/ordem dela —, então editar as faixas em Biblioteca →
// Equações → "Estilo do mapa" mudava o mapa da TELA (recém-calculado) e nunca o
// mapa do RELATÓRIO, para sempre. Sintoma diagnóstico da mesma tela: mudar o
// NÚMERO da equação aparecia no PDF na hora; mudar as FAIXAS, nunca.
//
// O que é re-hidratado: estilo (faixas/cores), nome da equação e produto — tudo
// que é RÓTULO. O que NÃO é: `doseMinima` e os custos. `doseMinima` descreve o
// grid que já foi pisado/zerado no cálculo (relê-la faria a tabela contar pixels
// em faixas que o mapa nunca pintou — a divergência que faixas.ts existe para
// impedir), e os custos são o resultado financeiro daquele processamento.
//
// Sem imports de propósito: módulo puro, testável em Node sem DOM/localStorage
// (ver scripts/teste-faixas.mjs).

export interface EstiloComClasses { classes: Array<{ limiteSuperior: number }> }

// Dados que a dose passa a buscar na equação (o resto continua sendo snapshot).
export interface RotulosEquacao<E extends EstiloComClasses> {
  estilo: E;
  nome: string;
  produto: string;
}

// Dose vista só pelo que interessa aqui — o tipo real (DoseCalculada) tem muito
// mais campos e é preservado pela assinatura genérica de reidratarDoses.
export interface DoseRotulada<E extends EstiloComClasses> {
  equacaoId: string;
  estilo: E;
  nomeEquacao: string;
  produto: string;
  /** A dose veio da fórmula EDITADA no talhão (Recomendação → Equação avulsa). */
  formulaEditada?: boolean;
}

// Id da equação de origem, sem o sufixo de passada. A divisão em aplicações cria
// doses `<id>__ap1`, `<id>__ap2`… (aplicar.ts) — todas vêm da MESMA equação.
export function equacaoBaseDaDose(equacaoId: string): string {
  return (equacaoId ?? '').split('__ap')[0];
}

// Rabo " — aplicação 2/3" que a divisão acrescenta ao nome. Renomear a equação
// na Biblioteca não pode apagar essa marcação — ela diz qual passada é o mapa.
export function sufixoPassada(nome: string): string {
  const m = /\s+—\s+aplicação\s+\d+\/\d+\s*$/.exec(nome ?? '');
  return m ? m[0] : '';
}

// Marca de que o mapa NÃO saiu da fórmula que está na Biblioteca. Mesmo caso do
// sufixo de passada acima: é informação do PROCESSAMENTO, e renomear/reabrir não
// pode apagá-la — o PDF estaria dizendo que aquela dose veio da equação oficial.
export const MARCA_FORMULA_EDITADA = ' (fórmula editada)';
const RE_MARCA = /\s*\(fórmula editada\)\s*$/;

/** O sufixo a repor no nome. Aceita a bandeira (cenários novos) e o próprio nome
 *  já marcado (cenários salvos na v2.73.0, antes da bandeira existir). */
export function sufixoFormulaEditada(d: { formulaEditada?: boolean; nomeEquacao?: string }): string {
  return (d.formulaEditada || RE_MARCA.test(d.nomeEquacao ?? '')) ? MARCA_FORMULA_EDITADA : '';
}

// Um estilo só serve se tiver ao menos uma classe com limite FINITO — mesma
// condição de classesVisiveis. Sem esta guarda, adotar um estilo vazio (equação
// em edição, doc legado) pintaria o mapa inteiro de transparente.
export function estiloUtilizavel(estilo: EstiloComClasses | null | undefined): boolean {
  return !!estilo?.classes?.some(c => Number.isFinite(c?.limiteSuperior));
}

// Troca os rótulos das doses pelos da equação ATUAL. Casa pelo id exato e, se
// não achar, pelo id base (passadas). Sem equação (excluída) ou com estilo
// inutilizável, mantém o snapshot — é a rede de segurança que garante que o
// relatório continua saindo. Não muta a entrada; devolve a MESMA referência da
// dose quando não há nada a trocar.
export function reidratarDoses<E extends EstiloComClasses, D extends DoseRotulada<E>>(
  doses: readonly D[],
  atuais: ReadonlyMap<string, RotulosEquacao<E>>,
): D[] {
  return doses.map(d => {
    const atual = atuais.get(d.equacaoId) ?? atuais.get(equacaoBaseDaDose(d.equacaoId));
    if (!atual || !estiloUtilizavel(atual.estilo)) return d;
    // A marca da fórmula editada fica por ÚLTIMO, e sai do nome antes de
    // procurar o sufixo de passada — senão "… — aplicação 2/3 (fórmula
    // editada)" esconderia a passada do regex e a marcação dela se perderia.
    const semMarca = (d.nomeEquacao ?? '').replace(RE_MARCA, '');
    const nome = atual.nome
      ? atual.nome + sufixoPassada(semMarca) + sufixoFormulaEditada(d)
      : d.nomeEquacao;
    return Object.assign({}, d, {
      estilo: atual.estilo,
      nomeEquacao: nome,
      produto: atual.produto || d.produto,
    });
  });
}
