// CÓDIGO DE REMESSA — o elo entre o lote de amostras que sai daqui e o laudo
// que volta do laboratório.
//
// POR QUE existe: o laboratório só recebe NOMES humanos (Produtor, Fazenda,
// Talhão — ver relatorioGrade.ts), e a plataforma precisa de `talhaoId`,
// `gradeId` e `empresaId` para gravar um laudo. Hoje quem faz essa tradução é
// uma pessoa. Deixar a API adivinhar por nome é o que NÃO pode: talhão homônimo
// ou um espaço a mais grava o laudo no talhão errado, em silêncio, e aquilo
// vira mapa de fertilidade e vira dose de adubo no campo. Com o código, a
// resolução é busca por chave — acerta ou devolve 404, nunca "quase".
//
// Puro de propósito (sem store, sem DOM): a rota da API roda no servidor.

// Alfabeto sem VOGAIS — um código aleatório não pode formar palavra, porque ele
// sai impresso no papel que vai para o cliente. Também fora: 0/O, 1/I/L, 5/S e
// 2/Z, os pares que se confundem escritos à mão ou ditados por telefone.
const ALFABETO = 'BCDFGHJKMNPQRTVWXY23456789';
const PREFIXO = 'INV';
const BLOCO = 4;
const BLOCOS = 2;
export const TAMANHO_REMESSA = BLOCO * BLOCOS;

/** Sorteia bytes com o CSPRNG da plataforma (navegador e Node ≥18 têm `crypto`). */
function bytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

/**
 * Novo código de remessa, no formato `INV-XXXX-XXXX`.
 *
 * Rejeição por módulo (o `while`) em vez de `% ALFABETO.length`: o resto
 * enviesaria as primeiras letras do alfabeto. Não é sobre segurança do sorteio,
 * é sobre não concentrar colisão num espaço que já é pequeno de propósito.
 */
export function gerarCodigoRemessa(): string {
  const n = ALFABETO.length;
  const limite = 256 - (256 % n);
  let saida = '';
  while (saida.length < TAMANHO_REMESSA) {
    for (const b of bytes(TAMANHO_REMESSA)) {
      if (b >= limite) continue;
      saida += ALFABETO[b % n];
      if (saida.length === TAMANHO_REMESSA) break;
    }
  }
  const partes: string[] = [];
  for (let i = 0; i < BLOCOS; i++) partes.push(saida.slice(i * BLOCO, (i + 1) * BLOCO));
  return `${PREFIXO}-${partes.join('-')}`;
}

/**
 * Normaliza o que o laboratório mandou para a forma canônica.
 *
 * Aceita minúscula, sem hífen, com espaços e sem o prefixo `INV` — o código
 * passa por e-mail, planilha e telefone antes de virar campo de JSON, e recusar
 * `inv7k3pqrtv` só geraria chamado de suporte. O que NÃO é tolerado é trocar
 * caractere: fora do alfabeto devolve null, porque adivinhar qual letra a pessoa
 * quis dizer é justamente o palpite que este código existe para eliminar.
 */
export function normalizarRemessa(bruto: string | null | undefined): string | null {
  const cru = String(bruto ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const corpo = cru.startsWith(PREFIXO) ? cru.slice(PREFIXO.length) : cru;
  if (corpo.length !== TAMANHO_REMESSA) return null;
  for (const ch of corpo) if (!ALFABETO.includes(ch)) return null;
  const partes: string[] = [];
  for (let i = 0; i < BLOCOS; i++) partes.push(corpo.slice(i * BLOCO, (i + 1) * BLOCO));
  return `${PREFIXO}-${partes.join('-')}`;
}

export function ehCodigoRemessa(bruto: string | null | undefined): boolean {
  return normalizarRemessa(bruto) != null;
}
