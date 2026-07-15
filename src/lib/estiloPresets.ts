// Presets de divisão de classes para o ESTILO do mapa de dose (recomendação).
// O usuário importa um padrão pronto (ex.: Calcário/Gesso com faixas grandes,
// KCl/P com faixas baixas) ou salva o seu próprio. Um preset é só um
// EstiloRecomendacao com nome. Presets do sistema são read-only (constantes);
// os do usuário ficam em inv_estilo_presets (getPresetsEstilo no store).
import type { EstiloRecomendacao, ClasseEstiloRec, PresetEstiloRec } from './biblioteca';

// ── Rampas de cores (estilo QGIS) — âncoras interpoladas p/ QUALQUER nº de classes ──
export const RAMPA_DOSE = ['#1b7a1f', '#3fa336', '#6fbf3f', '#9ccc4e', '#cddb39', '#ffe93b', '#ffc107', '#ff9800', '#fb5a23', '#e23b2e'];

// Catálogo de rampas disponíveis no editor de estilo (id → nome + âncoras).
// 'padrao' = a de sempre (verde→vermelho). As demais seguem o sentido canônico
// do QGIS/ColorBrewer — o editor tem "Inverter" para virar ao gosto.
export const RAMPAS: Record<string, { nome: string; cores: string[] }> = {
  padrao:  { nome: 'Padrão (verde→vermelho)', cores: RAMPA_DOSE },
  spectral: { nome: 'Spectral', cores: ['#9e0142', '#d53e4f', '#f46d43', '#fdae61', '#fee08b', '#ffffbf', '#e6f598', '#abdda4', '#66c2a5', '#3288bd', '#5e4fa2'] },
  rdylgn:  { nome: 'RdYlGn', cores: ['#a50026', '#d73027', '#f46d43', '#fdae61', '#fee08b', '#ffffbf', '#d9ef8b', '#a6d96a', '#66bd63', '#1a9850', '#006837'] },
  turbo:   { nome: 'Turbo', cores: ['#30123b', '#4145ab', '#4675ed', '#39a2fc', '#1bcfd4', '#24eca6', '#61fc6c', '#a4fc3b', '#d1e834', '#f3c63a', '#fe9b2d', '#f36315', '#d93806', '#b11901', '#7a0402'] },
};

// Âncoras efetivas de um estilo (rampa escolhida + inversão), com fallback no padrão.
export function coresDaRampa(rampa?: string, invertida?: boolean): string[] {
  const base = RAMPAS[rampa ?? 'padrao']?.cores ?? RAMPA_DOSE;
  return invertida ? [...base].reverse() : base;
}

const hexRgb = (h: string): [number, number, number] => { const n = h.replace('#', ''); return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)]; };
export function corNaRampa(t: number, cores: string[] = RAMPA_DOSE): string {
  const n = cores.length;
  const x = Math.max(0, Math.min(1, t)) * (n - 1);
  const i = Math.floor(x), f = x - i;
  if (i >= n - 1) return cores[n - 1];
  const a = hexRgb(cores[i]), b = hexRgb(cores[i + 1]);
  return '#' + [0, 1, 2].map(k => Math.round(a[k] + (b[k] - a[k]) * f).toString(16).padStart(2, '0')).join('');
}
// Reaplica a rampa nas classes pelo índice (1ª cor da rampa → última).
export const distribuirCores = <T extends { cor: string }>(classes: T[], cores: string[] = RAMPA_DOSE): T[] =>
  classes.map((c, i) => ({ ...c, cor: corNaRampa(classes.length <= 1 ? 1 : i / (classes.length - 1), cores) }));

// CSS de pré-visualização de uma rampa (barrinha gradiente).
export function gradienteCssRampa(cores: string[]): string {
  return `linear-gradient(to right, ${cores.join(', ')})`;
}

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
