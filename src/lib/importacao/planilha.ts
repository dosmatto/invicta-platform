// LEITURA DA PLANILHA FITOTÉCNICA. Puro — recebe a matriz de células já lida do
// arquivo (`string[][]`) e devolve linhas tipadas. Quem abre o arquivo é a tela,
// com `lerArquivo` de `lib/lab.ts` (que já trata XLSX/XLS/CSV e o encoding
// windows-1252 dos exports brasileiros).
//
// O de-para de coluna é POR NOME, nunca por posição. A lição está registrada no
// importador de laudo (v2.79.0): perfil posicional descartava em silêncio toda
// coluna fora da lista, e foi assim que o Ferro sumiu de laudos inteiros sem
// ninguém perceber. Aqui o risco é o mesmo — a planilha do cliente sai de um ERP
// e a ordem das 39 colunas não é contrato.

import { na, chave } from './texto.ts';

export type CampoPlanilha =
  | 'safra' | 'produtor' | 'fazenda' | 'talhao' | 'areaHa'
  | 'cultura' | 'proposito' | 'cultivar'
  | 'tipoPlantio' | 'dataRetirada' | 'matricula' | 'agronomo';

/**
 * Sinônimos de cabeçalho, já normalizados por `chave()` na comparação.
 *
 * As oito primeiras são as colunas que o usuário marcou de amarelo. As quatro
 * últimas não são gravadas, mas mudam a interpretação:
 *  • tipoPlantio  — "CONSÓRCIO" separa consórcio de talhão partido;
 *  • dataRetirada — dá a época (verão / safrinha / inverno);
 *  • matricula    — desempata produtor homônimo;
 *  • agronomo     — só para o relatório de conferência; o vínculo já existe
 *                   na fazenda (`Fazenda.agronomoResponsavel`).
 */
export const SINONIMOS_COLUNA: Record<CampoPlanilha, string[]> = {
  safra: ['SAFRA', 'ANO', 'ANO AGRICOLA', 'ANO SAFRA'],
  produtor: ['PRODUTOR', 'CLIENTE', 'COOPERADO', 'NOME PRODUTOR'],
  fazenda: ['FAZENDA', 'PROPRIEDADE', 'IMOVEL', 'UNIDADE'],
  talhao: ['TALHAO', 'GLEBA', 'AREA TALHAO', 'NOME TALHAO', 'CAMPO'],
  areaHa: ['AREA', 'AREA HA', 'HECTARES', 'HA', 'AREA PLANTADA'],
  cultura: ['CULTURA', 'ESPECIE'],
  proposito: ['PROPOSITO', 'FINALIDADE', 'DESTINO', 'OBJETIVO'],
  cultivar: ['CULTIVAR', 'HIBRIDO', 'VARIEDADE', 'MATERIAL', 'CULTIVAR HIBRIDO'],
  tipoPlantio: ['PLANTIO REPLANTIO', 'PLANTIO/REPLANTIO', 'TIPO PLANTIO', 'PLANTIO'],
  dataRetirada: ['DT RET', 'DT RET.', 'DATA RETIRADA', 'DATA PLANTIO', 'DT PLANTIO', 'DATA'],
  matricula: ['NR MATRICULA', 'NR. MATRICULA', 'MATRICULA', 'CODIGO PRODUTOR'],
  agronomo: ['AGRONOMO', 'RESPONSAVEL TECNICO', 'RT', 'CONSULTOR'],
};

/** Sem estas o arquivo não é uma planilha fitotécnica. */
export const OBRIGATORIAS: CampoPlanilha[] = ['produtor', 'fazenda', 'talhao', 'cultura'];

export interface LinhaPlanilha {
  /** Número da linha NO ARQUIVO, 1-based — o mesmo que o Excel mostra na lateral.
   *  Sem isto, "erro na linha 47" não ajuda ninguém a achar a linha 47. */
  linha: number;
  safra: string;
  produtor: string;
  fazenda: string;
  talhao: string;
  areaHa: number | null;
  cultura: string;
  proposito: string;
  cultivar: string;
  tipoPlantio: string;
  dataRetirada: string;
  matricula: string;
  agronomo: string;
}

export interface LeituraPlanilha {
  linhas: LinhaPlanilha[];
  /** Campo → índice de coluna. Ausente = não encontrado. */
  colunas: Partial<Record<CampoPlanilha, number>>;
  /** Obrigatórias que não foram encontradas. Não-vazio = arquivo recusado. */
  faltando: CampoPlanilha[];
  /** Índice 0-based da linha de cabeçalho dentro da matriz. */
  linhaCabecalho: number;
  /** Linhas puladas por estarem vazias nas colunas que importam. */
  ignoradas: number;
  /** Cabeçalhos que existem no arquivo e não foram usados. Vai para a tela. */
  colunasIgnoradas: string[];
}

/**
 * Número em português ou inglês. "1.799,10" e "1799.10" dão o mesmo.
 * Devolve null para vazio, texto e valores não positivos — área zero ou negativa
 * é dado quebrado, não é zero de verdade.
 */
export function parseArea(v: string | number | null | undefined): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) && v > 0 ? v : null;
  let t = String(v).trim().replace(/[^\d.,-]/g, '');
  if (!t) return null;
  if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.');
  else if (t.includes(',')) t = t.replace(',', '.');
  const n = parseFloat(t);
  return isFinite(n) && n > 0 ? n : null;
}

/**
 * Data do arquivo → ISO 'YYYY-MM-DD'. Aceita "05/10/2026" (o formato da planilha),
 * "2026-10-05" e "05/10/2026 14:56:46". Devolve '' quando não dá para ler —
 * nunca inventa data, porque a data define a época do cultivo.
 */
export function parseDataBR(v: string | number | null | undefined): string {
  const t = String(v ?? '').trim();
  if (!t) return '';
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t);
  if (!br) return '';
  const [, d, m, a] = br;
  const dd = +d, mm = +m;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return '';
  return `${a}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/**
 * Época do ano a partir da data de plantio. A planilha de referência é toda de
 * verão/safrinha do Paraná: plantio de agosto a dezembro é a safra de verão;
 * janeiro a março é safrinha; abril a julho é inverno.
 *
 * Devolve '' quando não há data — e '' significa "a época principal", que é o
 * comportamento certo: sem informação, não se inventa uma segunda safra.
 */
export function epocaDePlantio(dataISO: string): '' | 'verao' | 'safrinha' | 'inverno' {
  const m = /^\d{4}-(\d{2})/.exec(dataISO);
  if (!m) return '';
  const mes = +m[1];
  if (mes >= 8 && mes <= 12) return 'verao';
  if (mes >= 1 && mes <= 3) return 'safrinha';
  return 'inverno';
}

/** Acha a primeira linha com pelo menos 3 células preenchidas — mesma heurística
 *  do importador de laudo, que se provou em arquivos com título e logotipo em
 *  cima da tabela. */
function acharCabecalho(aoa: string[][]): number {
  for (let i = 0; i < Math.min(aoa.length, 15); i++) {
    if ((aoa[i] ?? []).filter(c => String(c ?? '').trim()).length >= 3) return i;
  }
  return 0;
}

/**
 * Casa um cabeçalho do arquivo com um dos campos conhecidos.
 *
 * Igualdade da chave normalizada primeiro; só depois "começa com", e só para
 * sinônimos de 4+ caracteres. Sem esse piso, "HA" casaria com "HABITAT" e "ANO"
 * com "ANOTACOES". A ordem dos sinônimos decide o desempate.
 */
function campoDoCabecalho(cabecalho: string, usados: Set<number>, idx: number): CampoPlanilha | null {
  if (usados.has(idx)) return null;
  const k = chave(cabecalho);
  if (!k) return null;
  for (const [campo, sins] of Object.entries(SINONIMOS_COLUNA) as [CampoPlanilha, string[]][]) {
    if (sins.some(s => chave(s) === k)) return campo;
  }
  for (const [campo, sins] of Object.entries(SINONIMOS_COLUNA) as [CampoPlanilha, string[]][]) {
    if (sins.some(s => chave(s).length >= 4 && k.startsWith(chave(s)))) return campo;
  }
  return null;
}

/**
 * Lê a matriz de células e devolve as linhas tipadas.
 *
 * `mapaManual` permite a tela corrigir o de-para quando a detecção erra — é a
 * saída de emergência que o importador de laudo aprendeu a ter.
 */
export function lerPlanilhaFitotecnica(
  aoa: string[][],
  mapaManual?: Partial<Record<CampoPlanilha, number>>,
): LeituraPlanilha {
  const vazio: LeituraPlanilha = {
    linhas: [], colunas: {}, faltando: [...OBRIGATORIAS], linhaCabecalho: 0, ignoradas: 0, colunasIgnoradas: [],
  };
  if (!aoa?.length) return vazio;

  const linhaCabecalho = acharCabecalho(aoa);
  const cabecalhos = (aoa[linhaCabecalho] ?? []).map(c => String(c ?? '').trim());

  const colunas: Partial<Record<CampoPlanilha, number>> = {};
  const usados = new Set<number>();
  cabecalhos.forEach((cab, i) => {
    const campo = campoDoCabecalho(cab, usados, i);
    // Primeiro que casa leva: numa planilha com "DATA CRIAÇÃO" e "DATA
    // ATUALIZAÇÃO" além de "DT. RET.", a exata ganha das que só começam igual.
    if (campo && colunas[campo] == null) { colunas[campo] = i; usados.add(i); }
  });
  Object.assign(colunas, mapaManual ?? {});
  for (const i of Object.values(mapaManual ?? {})) if (typeof i === 'number') usados.add(i);

  const faltando = OBRIGATORIAS.filter(c => colunas[c] == null);
  const colunasIgnoradas = cabecalhos.filter((c, i) => c && !usados.has(i));
  if (faltando.length) return { ...vazio, colunas, faltando, linhaCabecalho, colunasIgnoradas };

  const cel = (linha: string[], campo: CampoPlanilha): string => {
    const i = colunas[campo];
    return i == null ? '' : String(linha[i] ?? '').trim();
  };

  const linhas: LinhaPlanilha[] = [];
  let ignoradas = 0;
  for (let r = linhaCabecalho + 1; r < aoa.length; r++) {
    const bruta = aoa[r] ?? [];
    const produtor = cel(bruta, 'produtor');
    const talhao = cel(bruta, 'talhao');
    // Linha sem produtor E sem talhão é rodapé, separador ou linha em branco.
    if (!produtor && !talhao) { ignoradas++; continue; }
    const dataRetirada = parseDataBR(cel(bruta, 'dataRetirada'));
    linhas.push({
      linha: r + 1,
      safra: cel(bruta, 'safra'),
      produtor, fazenda: cel(bruta, 'fazenda'), talhao,
      areaHa: parseArea(cel(bruta, 'areaHa')),
      cultura: cel(bruta, 'cultura'),
      proposito: cel(bruta, 'proposito'),
      cultivar: cel(bruta, 'cultivar'),
      tipoPlantio: cel(bruta, 'tipoPlantio'),
      dataRetirada,
      matricula: cel(bruta, 'matricula'),
      agronomo: cel(bruta, 'agronomo'),
    });
  }

  return { linhas, colunas, faltando: [], linhaCabecalho, ignoradas, colunasIgnoradas };
}

/**
 * Safra da planilha ("2026/2027") → nome da safra cadastrada ("26/27").
 *
 * Casa pelo ANO, não pela string: o cadastro guarda "26/27" e a planilha manda
 * "2026/2027", e `anoDaSafra` de `periodo.ts` já resolve os dois para 2026.
 * Devolve '' quando o ano não existe no cadastro — e aí a tela oferece criar.
 */
export function casarSafra(textoPlanilha: string, safrasCadastradas: string[], anoDe: (s: string) => number | null): string {
  const alvo = anoDe(textoPlanilha);
  if (alvo == null) return '';
  const exata = safrasCadastradas.find(s => na(s) === na(textoPlanilha));
  if (exata) return exata;
  return safrasCadastradas.find(s => anoDe(s) === alvo) ?? '';
}
