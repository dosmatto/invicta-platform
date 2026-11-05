// Formatos e cores do kit visual do Portal do Produtor v2. Números sempre em
// pt-BR; cores sempre por token de tema (funcionam no claro e no escuro — ver
// styles/portal-tema.css).

export const COR = {
  texto: 'var(--text-primary)',
  texto2: 'var(--text-secondary)',
  mudo: 'var(--text-muted)',
  borda: 'var(--border-color)',
  superficie: 'var(--bg-surface)',
  superficie2: 'var(--bg-surface-hover)',
  fundo: 'var(--bg-app)',
  verde: 'var(--invicta-green)',
  verdeEscuro: 'var(--invicta-green-dark)',
  verdeClaro: 'var(--invicta-green-light)',
  verdeTexto: 'var(--p-verde-texto)',
  azul: 'var(--invicta-blue-mid)',
  azulTexto: 'var(--p-azul-texto)',
  azulEscuro: 'var(--invicta-blue)',
  ambar: 'var(--status-warning)',
  vermelho: 'var(--status-error)',
  semDado: 'var(--p-sem-dado)',
  sombra: 'var(--p-sombra)',
} as const;

/** Cor "suave" de fundo para um tom (tile de ícone, selo). */
export const suave = (cor: string, pct = 14) => `color-mix(in srgb, ${cor} ${pct}%, var(--bg-surface))`;

export const fmtNum = (v: number | null | undefined, casas = 1, minCasas = casas): string =>
  v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: minCasas, maximumFractionDigits: casas });
export const fmtInt = (v: number | null | undefined): string => fmtNum(v, 0);
/** Hectares: inteiro a partir de 100 ha, 1 casa abaixo. */
export const fmtHaCurto = (v: number | null | undefined): string =>
  v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 1 });
export const fmtPct = (v: number | null | undefined, casas = 1): string => (v == null || !Number.isFinite(v) ? '—' : `${fmtNum(v, casas)}%`);
export const plural = (n: number, um: string, muitos: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : muitos}`;
export const talhoesTxt = (n: number) => plural(n, 'talhão', 'talhões');

/** Cadastro em CAIXA ALTA vira minúsculas (a tela usa `capitalize`). */
export const nomeLegivel = (nome: string) => (nome === nome.toUpperCase() ? nome.toLowerCase() : nome);
export const primeiroNome = (nome: string) => { const p = nome.trim().split(/\s+/)[0] ?? ''; return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(); };

export const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** Rampa de relevo (baixada → topo), a mesma da legenda oficial de altimetria. */
export const RAMPA_RELEVO = ['#1b7a1b', '#7cc45f', '#e6d75a', '#f08a2c', '#6d4c41'];
