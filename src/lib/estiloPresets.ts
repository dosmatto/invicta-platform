// Presets de divisão de classes para o ESTILO do mapa de dose (recomendação).
// O usuário importa um padrão pronto (ex.: Calcário/Gesso com faixas grandes,
// KCl/P com faixas baixas) ou salva o seu próprio. Um preset é só um
// EstiloRecomendacao com nome. Presets do sistema são read-only (constantes);
// os do usuário ficam em inv_estilo_presets (getPresetsEstilo no store).
import type { EstiloRecomendacao, ClasseEstiloRec, PresetEstiloRec } from './biblioteca';

// ── Rampa de cores da dose (verde → vermelho), compartilhada com o editor ──
export const RAMPA_DOSE = ['#1b7a1f', '#3fa336', '#6fbf3f', '#9ccc4e', '#cddb39', '#ffe93b', '#ffc107', '#ff9800', '#fb5a23', '#e23b2e'];
const hexRgb = (h: string): [number, number, number] => { const n = h.replace('#', ''); return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)]; };
export function corNaRampa(t: number): string {
  const n = RAMPA_DOSE.length;
  const x = Math.max(0, Math.min(1, t)) * (n - 1);
  const i = Math.floor(x), f = x - i;
  if (i >= n - 1) return RAMPA_DOSE[n - 1];
  const a = hexRgb(RAMPA_DOSE[i]), b = hexRgb(RAMPA_DOSE[i + 1]);
  return '#' + [0, 1, 2].map(k => Math.round(a[k] + (b[k] - a[k]) * f).toString(16).padStart(2, '0')).join('');
}
// Reaplica a rampa nas classes pelo índice (1ª = verde escuro, última = vermelho).
export const distribuirCores = <T extends { cor: string }>(classes: T[]): T[] =>
  classes.map((c, i) => ({ ...c, cor: corNaRampa(classes.length <= 1 ? 1 : i / (classes.length - 1)) }));

// Constrói as classes (com cores da rampa) a partir dos limites superiores.
function classesDe(limites: number[]): ClasseEstiloRec[] {
  return distribuirCores(limites.map(l => ({ cor: '', limiteSuperior: l })));
}

function estilo(limites: number[], extra?: Partial<EstiloRecomendacao>): EstiloRecomendacao {
  return { valorMinimo: 0, zeroTransparente: true, dividirAuto: false, classes: classesDe(limites), ...extra };
}

// ── Presets do sistema (prontos, não editáveis/apagáveis) ──────────────────
export const PRESETS_SISTEMA: PresetEstiloRec[] = [
  { id: 'sys-calcario-gesso', nome: 'Calcário / Gesso (kg/ha)', escopo: 'sistema',
    estilo: estilo([1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000]) },
  { id: 'sys-kcl', nome: 'KCl / Potássio (kg/ha)', escopo: 'sistema',
    estilo: estilo([25, 50, 75, 100, 125, 150, 175, 200, 225, 250]) },
  { id: 'sys-p', nome: 'Fósforo / P (kg/ha)', escopo: 'sistema',
    estilo: estilo([20, 40, 60, 80, 100, 120, 140, 160, 180, 200]) },
];
