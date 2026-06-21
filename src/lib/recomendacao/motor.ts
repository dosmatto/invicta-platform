'use client';

// Motor da "Linguagem de Recomendação INVICTA" — álgebra de mapas simples e
// funcional. Padrão Excel pt-BR: VÍRGULA no decimal (0,71428) e PONTO-E-VÍRGULA
// nos argumentos (se(a; b; c)). Sem `eval`: tokenizer → parser recursivo → AST →
// avaliador genérico por um "resolver" (nome→número). O mesmo AST serve para o
// teste escalar (R1) e, depois, para a álgebra pixel a pixel sobre os grids (R3).
//
// Variáveis = atributos de fertilidade pelo nome (CTC, Ca, V, K…). Constantes
// vêm da tabela da equação. Funções: se / max / min / arredonda / raiz / abs /
// teto / piso. Resultado = `dose` (ou `resultado`, ou a última atribuição).

import type { ConstanteEquacao } from '../biblioteca';

// ─── Catálogo de atributos (variáveis disponíveis) ────────────────────────
// Espelha ELEMENTOS_LAB (lab.ts); o token é o nome digitável na equação e o
// `nut` casa com a chave do grid de fertilidade (usado na Fase R3).
export interface AtributoEq { token: string; nut: string; rotulo: string; unidade: string; exemplo: number; }
export const ATRIBUTOS_EQUACAO: AtributoEq[] = [
  { token: 'V',   nut: 'v',       rotulo: 'Saturação por bases (V%)', unidade: '%',         exemplo: 45 },
  { token: 'CTC', nut: 'ctc',     rotulo: 'CTC (T)',                  unidade: 'cmolc/dm³', exemplo: 8 },
  { token: 'Ca',  nut: 'ca',      rotulo: 'Cálcio',                   unidade: 'cmolc/dm³', exemplo: 3 },
  { token: 'Mg',  nut: 'mg',      rotulo: 'Magnésio',                 unidade: 'cmolc/dm³', exemplo: 1 },
  { token: 'K',   nut: 'k',       rotulo: 'Potássio',                 unidade: 'cmolc/dm³', exemplo: 0.2 },
  { token: 'P',   nut: 'p',       rotulo: 'Fósforo',                  unidade: 'mg/dm³',    exemplo: 12 },
  { token: 'MO',  nut: 'mo',      rotulo: 'Matéria orgânica',         unidade: 'g/dm³',     exemplo: 30 },
  { token: 'pH',  nut: 'ph',      rotulo: 'pH',                       unidade: '',          exemplo: 5.2 },
  { token: 'm',   nut: 'm',       rotulo: 'Saturação por Al (m%)',    unidade: '%',         exemplo: 10 },
  { token: 'Al',  nut: 'al',      rotulo: 'Alumínio',                 unidade: 'cmolc/dm³', exemplo: 0.3 },
  { token: 'S',   nut: 's',       rotulo: 'Enxofre',                  unidade: 'mg/dm³',    exemplo: 8 },
  { token: 'B',   nut: 'b',       rotulo: 'Boro',                     unidade: 'mg/dm³',    exemplo: 0.3 },
  { token: 'Zn',  nut: 'zn',      rotulo: 'Zinco',                    unidade: 'mg/dm³',    exemplo: 1 },
  { token: 'Cu',  nut: 'cu',      rotulo: 'Cobre',                    unidade: 'mg/dm³',    exemplo: 1 },
  { token: 'Mn',  nut: 'mn',      rotulo: 'Manganês',                 unidade: 'mg/dm³',    exemplo: 5 },
  { token: 'Arg', nut: 'textura', rotulo: 'Argila',                   unidade: '%',         exemplo: 35 },
];
const ATRIB_POR_TOKEN = new Map(ATRIBUTOS_EQUACAO.map(a => [a.token.toLowerCase(), a] as const));
export const ehAtributo = (nome: string) => ATRIB_POR_TOKEN.has(nome.toLowerCase());
export const atributoPorToken = (nome: string) => ATRIB_POR_TOKEN.get(nome.toLowerCase());

export class ErroEq extends Error {}
export type Resolver = (nome: string) => number;

const FUNCOES = new Set(['se', 'max', 'min', 'arredonda', 'raiz', 'abs', 'teto', 'piso']);

// ─── Tokenizer ────────────────────────────────────────────────────────────
type TokTipo = 'num' | 'id' | 'op' | 'lp' | 'rp' | 'sep';
interface Token { tipo: TokTipo; texto: string; valor?: number; }

const ehLetra = (c: string) => /[A-Za-zÀ-ÿ_]/.test(c);
const ehLetraNum = (c: string) => /[A-Za-zÀ-ÿ0-9_]/.test(c);
const ehDigito = (c: string) => c >= '0' && c <= '9';
const OPS2 = ['<=', '>=', '<>', '!=', '=='];

function tokenizar(linha: string): Token[] {
  const out: Token[] = [];
  const s = linha;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (ehDigito(c)) {
      let j = i + 1;
      while (j < s.length && ehDigito(s[j])) j++;
      // decimal: vírgula OU ponto, desde que seguido de dígito
      if (j < s.length && (s[j] === ',' || s[j] === '.') && j + 1 < s.length && ehDigito(s[j + 1])) {
        j++;
        while (j < s.length && ehDigito(s[j])) j++;
      }
      const bruto = s.slice(i, j);
      out.push({ tipo: 'num', texto: bruto, valor: parseFloat(bruto.replace(',', '.')) });
      i = j; continue;
    }
    if (ehLetra(c)) {
      let j = i + 1;
      while (j < s.length && ehLetraNum(s[j])) j++;
      out.push({ tipo: 'id', texto: s.slice(i, j) });
      i = j; continue;
    }
    if (c === '(') { out.push({ tipo: 'lp', texto: '(' }); i++; continue; }
    if (c === ')') { out.push({ tipo: 'rp', texto: ')' }); i++; continue; }
    if (c === ';') { out.push({ tipo: 'sep', texto: ';' }); i++; continue; }
    const dois = s.slice(i, i + 2);
    if (OPS2.includes(dois)) { out.push({ tipo: 'op', texto: dois }); i += 2; continue; }
    if ('+-*/<>='.includes(c)) { out.push({ tipo: 'op', texto: c }); i++; continue; }
    throw new ErroEq(`Caractere inesperado: "${c}"`);
  }
  return out;
}

// ─── AST + Parser (precedência: comparação < +- < */ < unário < primário) ──
type No =
  | { k: 'num'; v: number }
  | { k: 'var'; nome: string }
  | { k: 'un'; op: string; a: No }
  | { k: 'bin'; op: string; a: No; b: No }
  | { k: 'call'; fn: string; args: No[] };

const COMPARS = ['<', '>', '<=', '>=', '=', '==', '<>', '!='];
const normOp = (op: string) => (op === '==' ? '=' : op === '!=' ? '<>' : op);

class Parser {
  private pos = 0;
  constructor(private toks: Token[]) {}
  private peek() { return this.toks[this.pos]; }
  private next() { return this.toks[this.pos++]; }
  fim() { return this.pos >= this.toks.length; }
  esperaFim() { if (!this.fim()) throw new ErroEq(`Sobrou "${this.peek().texto}" no final`); }

  expr(): No { return this.comp(); }
  private comp(): No {
    let a = this.add();
    while (!this.fim() && this.peek().tipo === 'op' && COMPARS.includes(this.peek().texto)) {
      const op = normOp(this.next().texto); a = { k: 'bin', op, a, b: this.add() };
    }
    return a;
  }
  private add(): No {
    let a = this.mul();
    while (!this.fim() && this.peek().tipo === 'op' && (this.peek().texto === '+' || this.peek().texto === '-')) {
      const op = this.next().texto; a = { k: 'bin', op, a, b: this.mul() };
    }
    return a;
  }
  private mul(): No {
    let a = this.unary();
    while (!this.fim() && this.peek().tipo === 'op' && (this.peek().texto === '*' || this.peek().texto === '/')) {
      const op = this.next().texto; a = { k: 'bin', op, a, b: this.unary() };
    }
    return a;
  }
  private unary(): No {
    if (!this.fim() && this.peek().tipo === 'op' && (this.peek().texto === '-' || this.peek().texto === '+')) {
      const op = this.next().texto; return { k: 'un', op, a: this.unary() };
    }
    return this.prim();
  }
  private prim(): No {
    const t = this.peek();
    if (!t) throw new ErroEq('Fim inesperado da expressão');
    if (t.tipo === 'num') { this.next(); return { k: 'num', v: t.valor! }; }
    if (t.tipo === 'lp') {
      this.next();
      const e = this.expr();
      if (this.fim() || this.peek().tipo !== 'rp') throw new ErroEq('Falta fechar ")"');
      this.next(); return e;
    }
    if (t.tipo === 'id') {
      this.next();
      if (!this.fim() && this.peek().tipo === 'lp') {
        this.next();
        const args: No[] = [];
        if (!this.fim() && this.peek().tipo !== 'rp') {
          args.push(this.expr());
          while (!this.fim() && this.peek().tipo === 'sep') { this.next(); args.push(this.expr()); }
        }
        if (this.fim() || this.peek().tipo !== 'rp') throw new ErroEq(`Falta ")" em ${t.texto}(...)`);
        this.next();
        return { k: 'call', fn: t.texto.toLowerCase(), args };
      }
      return { k: 'var', nome: t.texto };
    }
    throw new ErroEq(`Inesperado: "${t.texto}"`);
  }
}

// ─── Avaliador ──────────────────────────────────────────────────────────────
function evalNo(n: No, scope: Map<string, number>, ext: Resolver): number {
  switch (n.k) {
    case 'num': return n.v;
    case 'var': { const lc = n.nome.toLowerCase(); return scope.has(lc) ? scope.get(lc)! : ext(n.nome); }
    case 'un': { const a = evalNo(n.a, scope, ext); return n.op === '-' ? -a : a; }
    case 'bin': return evalBin(n.op, evalNo(n.a, scope, ext), evalNo(n.b, scope, ext));
    case 'call': return evalCall(n, scope, ext);
  }
}

function evalBin(op: string, a: number, b: number): number {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return a / b;
  }
  // comparações: NaN (fora do polígono) propaga; senão 1/0
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  switch (op) {
    case '<': return a < b ? 1 : 0;
    case '>': return a > b ? 1 : 0;
    case '<=': return a <= b ? 1 : 0;
    case '>=': return a >= b ? 1 : 0;
    case '=': return a === b ? 1 : 0;
    case '<>': return a !== b ? 1 : 0;
  }
  throw new ErroEq(`Operador desconhecido: ${op}`);
}

function evalCall(n: Extract<No, { k: 'call' }>, scope: Map<string, number>, ext: Resolver): number {
  const { fn, args } = n;
  const ev = (i: number) => evalNo(args[i], scope, ext);
  switch (fn) {
    case 'se': {
      if (args.length !== 3) throw new ErroEq('se(condição; então; senão) precisa de 3 argumentos');
      const c = ev(0); if (Number.isNaN(c)) return NaN; return c !== 0 ? ev(1) : ev(2);
    }
    case 'max': case 'min': {
      if (args.length === 0) throw new ErroEq(`${fn} precisa de ao menos 1 argumento`);
      let m = fn === 'max' ? -Infinity : Infinity;
      for (let i = 0; i < args.length; i++) { const v = ev(i); if (Number.isNaN(v)) return NaN; m = fn === 'max' ? Math.max(m, v) : Math.min(m, v); }
      return m;
    }
    case 'arredonda': { const x = ev(0); const casas = args.length > 1 ? Math.round(ev(1)) : 0; const f = Math.pow(10, casas); return Math.round(x * f) / f; }
    case 'raiz': return Math.sqrt(ev(0));
    case 'abs': return Math.abs(ev(0));
    case 'teto': return Math.ceil(ev(0));
    case 'piso': return Math.floor(ev(0));
  }
  throw new ErroEq(`Função desconhecida: ${fn}`);
}

// ─── Programa (multi-linha) ──────────────────────────────────────────────
interface Stmt { nome: string | null; no: No; }
export interface Programa { stmts: Stmt[]; resultadoVar: string; varsExternas: string[]; }

function coletarVars(n: No, out: Set<string>) {
  switch (n.k) {
    case 'var': out.add(n.nome.toLowerCase()); break;
    case 'un': coletarVars(n.a, out); break;
    case 'bin': coletarVars(n.a, out); coletarVars(n.b, out); break;
    case 'call': n.args.forEach(a => coletarVars(a, out)); break;
  }
}

function tiraComentario(linha: string): string {
  const h = linha.indexOf('#'); if (h >= 0) linha = linha.slice(0, h);
  const b = linha.indexOf('//'); if (b >= 0) linha = linha.slice(0, b);
  return linha;
}

export function compilar(script: string, constantes: ConstanteEquacao[] = []): { ok: true; prog: Programa } | { ok: false; erro: string } {
  try {
    const constNomes = new Set(constantes.map(c => c.nome.trim().toLowerCase()).filter(Boolean));
    const stmts: Stmt[] = [];
    const locais = new Set<string>();
    const linhas = script.split('\n');
    for (let li = 0; li < linhas.length; li++) {
      const linha = tiraComentario(linhas[li]);
      if (!linha.trim()) continue;
      const toks = tokenizar(linha);
      if (toks.length === 0) continue;
      let nome: string | null = null;
      let exprToks = toks;
      // atribuição: IDENT = ... (note: "==" é comparação, não atribuição)
      if (toks.length >= 2 && toks[0].tipo === 'id' && toks[1].tipo === 'op' && toks[1].texto === '=') {
        nome = toks[0].texto; exprToks = toks.slice(2);
        if (exprToks.length === 0) throw new ErroEq(`Linha ${li + 1}: "${nome} =" sem valor à direita`);
      }
      const p = new Parser(exprToks);
      const no = p.expr();
      p.esperaFim();
      stmts.push({ nome, no });
      if (nome) locais.add(nome.toLowerCase());
    }
    if (stmts.length === 0) return { ok: false, erro: 'Equação vazia. Ex.: dose = (70 - V)/100 * CTC * 10' };

    const nomesAtrib = stmts.filter(s => s.nome).map(s => s.nome!.toLowerCase());
    let resultadoVar = '__expr__';
    if (nomesAtrib.includes('dose')) resultadoVar = 'dose';
    else if (nomesAtrib.includes('resultado')) resultadoVar = 'resultado';
    else if (nomesAtrib.length) resultadoVar = nomesAtrib[nomesAtrib.length - 1];

    const ext = new Set<string>();
    for (const s of stmts) coletarVars(s.no, ext);
    const varsExternas = [...ext].filter(v => !locais.has(v) && !constNomes.has(v) && !FUNCOES.has(v));

    return { ok: true, prog: { stmts, resultadoVar, varsExternas } };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

export function executar(prog: Programa, constantes: ConstanteEquacao[], ext: Resolver): number {
  const scope = new Map<string, number>();
  for (const c of constantes) { const n = c.nome.trim().toLowerCase(); if (n) scope.set(n, c.valor); }
  let ultimaExpr = NaN;
  for (const s of prog.stmts) {
    const v = evalNo(s.no, scope, ext);
    if (s.nome) scope.set(s.nome.toLowerCase(), v);
    else ultimaExpr = v;
  }
  if (prog.resultadoVar === '__expr__') return ultimaExpr;
  return scope.has(prog.resultadoVar) ? scope.get(prog.resultadoVar)! : NaN;
}

// ─── Álgebra de mapas: avalia o programa PIXEL A PIXEL (Fase R3) ──────────
// gridPorVar mapeia o nome (token lowercased) da variável → Float32Array do
// atributo, todos do MESMO tamanho n. Fora do polígono o grid traz NaN, que
// propaga (resultado NaN = transparente). Reaproveita o mesmo AST do teste.
export function executarGrid(
  prog: Programa, constantes: ConstanteEquacao[],
  gridPorVar: Map<string, Float32Array>, n: number,
): Float32Array {
  const out = new Float32Array(n);
  let i = 0;
  const ext: Resolver = (nome) => { const a = gridPorVar.get(nome.toLowerCase()); return a ? a[i] : NaN; };
  for (i = 0; i < n; i++) out[i] = executar(prog, constantes, ext);
  return out;
}

// ─── Validação (sintaxe + variáveis reconhecidas) ─────────────────────────
export interface Validacao { ok: boolean; erro?: string; vars: string[]; desconhecidas: string[]; }
export function validar(script: string, constantes: ConstanteEquacao[] = []): Validacao {
  const c = compilar(script, constantes);
  if (!c.ok) return { ok: false, erro: c.erro, vars: [], desconhecidas: [] };
  const vars = c.prog.varsExternas;
  const desconhecidas = vars.filter(v => !ATRIB_POR_TOKEN.has(v));
  return {
    ok: desconhecidas.length === 0,
    vars,
    desconhecidas,
    erro: desconhecidas.length ? `Variável não reconhecida: ${desconhecidas.join(', ')}` : undefined,
  };
}

// ─── Teste escalar (preview com valores de amostra) ───────────────────────
export interface ResultadoTeste { ok: boolean; valor?: number; erro?: string; faltando: string[]; }
export function testarEscalar(
  script: string, constantes: ConstanteEquacao[],
  valores: Record<string, number>, naoNegativo: boolean,
): ResultadoTeste {
  const c = compilar(script, constantes);
  if (!c.ok) return { ok: false, erro: c.erro, faltando: [] };
  const faltando: string[] = [];
  const ext: Resolver = (nome) => {
    const lc = nome.toLowerCase();
    const v = valores[lc];
    if (v == null || Number.isNaN(v)) { if (!faltando.includes(lc)) faltando.push(lc); return NaN; }
    return v;
  };
  try {
    let v = executar(c.prog, constantes, ext);
    if (naoNegativo && v < 0) v = 0;
    return { ok: faltando.length === 0, valor: v, faltando };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e), faltando };
  }
}
