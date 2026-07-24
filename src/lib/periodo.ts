// Conceito de PERÍODO da plataforma: Ano + Época, derivados de uma DATA de
// referência. Substitui, na leitura do usuário, o antigo conceito de "Safra".
//   • Ano   = ano da data de referência; para safras legadas ("26/27") é o
//             PRIMEIRO número → 2026 (ver anoDaSafra).
//   • Época = 1ª (janeiro–junho) ou 2ª (julho–dezembro), derivada do mês.
//
// A época é apenas uma classificação DERIVADA da data — o usuário nunca a
// seleciona à mão. Estas funções são PURAS e SEM dependências, para poderem ser
// validadas por um script node puro (scripts/teste-periodo.mjs) e reusadas tanto
// no store (autoridade do cálculo) quanto na UI (exibição imediata).

export type Epoca = '1' | '2';

// Época a partir do mês (1..12). Jan–Jun = 1ª; Jul–Dez = 2ª.
export function epocaDeMes(mes: number): Epoca {
  return mes <= 6 ? '1' : '2';
}

// Extrai {ano, mes, dia} de uma data 'YYYY-MM-DD' (ou ISO completo) SEM depender
// do fuso local — não usa new Date(), que deslocaria o dia por timezone. Retorna
// null se a string não tiver o formato de data esperado.
export function partesData(iso: string): { ano: number; mes: number; dia: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? '').trim());
  if (!m) return null;
  const ano = +m[1], mes = +m[2], dia = +m[3];
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return { ano, mes, dia };
}

export function dataValida(iso: string): boolean {
  return partesData(iso) !== null;
}

// Ano da data de referência.
export function anoDeData(iso: string): number | null {
  return partesData(iso)?.ano ?? null;
}

// Época da data de referência.
export function epocaDeData(iso: string): Epoca | null {
  const p = partesData(iso);
  return p ? epocaDeMes(p.mes) : null;
}

// Ano + Época juntos (o "período" de um lançamento).
export function periodoDeData(iso: string): { ano: number; epoca: Epoca } | null {
  const p = partesData(iso);
  return p ? { ano: p.ano, epoca: epocaDeMes(p.mes) } : null;
}

// Ano de uma safra legada: PRIMEIRO número de "26/27", "25-26", "2026/2027",
// "26_27"… Também aceita um ano puro "2026". "26" → 2026, "25" → 2025.
export function anoDaSafra(nomeSafra: string): number | null {
  const m = /(\d{2,4})/.exec(String(nomeSafra ?? '').trim());
  if (!m) return null;
  let n = +m[1];
  if (n < 100) n += 2000;
  return n;
}

// Hoje em America/Sao_Paulo como 'YYYY-MM-DD' — default da Data de referência.
// dataBase existe só para testes determinísticos (default = agora).
export function hojeSaoPauloISO(dataBase?: Date): string {
  const d = dataBase ?? new Date();
  // 'en-CA' formata como 'YYYY-MM-DD'; timeZone garante o DIA correto em SP.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

// Rótulo do "Ano" a partir de uma safra legada para EXIBIÇÃO na UI/relatórios
// ("26/27" → "2026"). Fallback: a própria string se não parsear; '—' se vazio.
export function rotuloAno(safraNome: string | null | undefined): string {
  const a = anoDaSafra(String(safraNome ?? ''));
  return a != null ? String(a) : (safraNome ? String(safraNome) : '—');
}

export function rotuloEpoca(e: Epoca | null | undefined): string {
  return e === '1' ? '1ª época' : e === '2' ? '2ª época' : '—';
}

export function rotuloAnoEpoca(ano: number | null | undefined, e?: Epoca | null): string {
  if (ano == null) return '—';
  return e ? `${ano} · ${rotuloEpoca(e)}` : String(ano);
}
