// Biblioteca OFICIAL de Legendas — INVICTA AP (escopo 'sistema', no banco).
// Conforme BIBLIOTECA_OFICIAL_LEGENDAS_INVICTA_AP_v1: Fertilidade (ABC por
// nutriente), Textura, Altimetria, NDVI, Produtividade (por cultura) e
// Compactação. Paletas/limites das specs visuais; proporção 22,5/22,5/22,5/22,5/10.
// São semeadas no boot (seedLegendasSistema) — visíveis a todas as empresas,
// read-only (o usuário duplica para editar).

import { classesComPares, classesFertilidade5, type Legenda } from '@/lib/legendas';
import { LEGENDAS_SEED_ABC } from './legendasSeedABC';

const DT = '2026-06-13T00:00:00.000Z';

// Fertilidade ABC: mesmos limites por nutriente; vira escopo 'sistema'.
// V% e m% são percentuais → domínio 0..100 (evita colapso das pontas no mapa).
const DOMINIO_ABC: Record<string, [number, number]> = {
  fabc_v: [0, 100],
  fabc_m: [0, 100],
};
const ABC_SISTEMA: Legenda[] = LEGENDAS_SEED_ABC.map(l => ({
  ...l,
  escopo: 'sistema' as const,
  ...(DOMINIO_ABC[l.id] ? { dominioMin: DOMINIO_ABC[l.id][0], dominioMax: DOMINIO_ABC[l.id][1] } : {}),
}));

const baseFix = {
  fonte: 'INVICTA AP',
  tipoEscala: 'gradiente' as const,
  estilo: 'segmentado' as const,
  escopo: 'sistema' as const,
  criadoEm: DT,
  atualizadoEm: DT,
};

// ── Textura do Solo (pedológica, % de argila) ─────────────────────────────
const textura: Legenda = {
  ...baseFix,
  id: 'sys_textura_argila',
  nome: 'Textura do Solo (% argila)',
  atributoId: 'textura', atributo: 'Textura', simbolo: 'Argila',
  unidade: '% argila', metodo: 'Pedológico',
  categoria: 'textura', invertida: false,
  dominioMin: 0, dominioMax: 100,
  observacao: 'Sistema oficial de classes texturais (interpretação pedológica).',
  classes: classesComPares(
    [15, 25, 35, 60],
    [
      { inicio: '#F8E16C', fim: '#FFD54F' },
      { inicio: '#E8D7A5', fim: '#D6C08D' },
      { inicio: '#C89F6A', fim: '#A97C50' },
      { inicio: '#A05A2C', fim: '#7A3E12' },
      { inicio: '#6D2E0F', fim: '#3E1C08' },
    ],
    ['Arenoso', 'Médio Arenoso', 'Médio', 'Argiloso', 'Muito Argiloso'],
  ),
};

// ── Altimetria (relevo; limites dinâmicos por área = percentual do range) ──
const altimetria: Legenda = {
  ...baseFix,
  id: 'sys_altimetria',
  nome: 'Altimetria (relevo)',
  atributoId: 'altimetria', atributo: 'Altimetria', simbolo: 'Elev.',
  unidade: 'm', metodo: 'MDE',
  categoria: 'altimetria-elevacao', invertida: false,
  dominioMin: 0, dominioMax: 100,
  observacao: 'Limites dinâmicos por área (percentual do range de elevação). Referência vertical local.',
  classes: classesComPares(
    [25, 50, 75, 90],
    [
      { inicio: '#006400', fim: '#228B22' },
      { inicio: '#66BB6A', fim: '#9CCC65' },
      { inicio: '#D4E157', fim: '#FFD54F' },
      { inicio: '#FFA726', fim: '#EF6C00' },
      { inicio: '#8D6E63', fim: '#4E342E' },
    ],
    ['Baixadas', 'Baixo Relevo', 'Intermediário', 'Elevado', 'Topos'],
  ),
};

// ── NDVI (vigor vegetativo, índice 0..1) ──────────────────────────────────
const ndvi: Legenda = {
  ...baseFix,
  id: 'sys_ndvi',
  nome: 'NDVI (vigor vegetativo)',
  atributoId: 'ndvi', atributo: 'NDVI', simbolo: 'NDVI',
  unidade: 'índice', metodo: 'Sensor óptico',
  categoria: 'ndvi', invertida: false,
  dominioMin: 0, dominioMax: 1,
  observacao: 'Padrão universal de interpretação de NDVI (0–1).',
  classes: classesComPares(
    [0.20, 0.40, 0.60, 0.80],
    [
      { inicio: '#7A1F00', fim: '#C62828' },
      { inicio: '#E65100', fim: '#FFD600' },
      { inicio: '#D4E157', fim: '#7CB342' },
      { inicio: '#4CAF50', fim: '#2E7D32' },
      { inicio: '#1B5E20', fim: '#003300' },
    ],
    ['Muito Baixo', 'Baixo', 'Médio', 'Alto', 'Muito Alto'],
  ),
};

// ── Produtividade (paleta SEMÁFORO própria: vermelho→laranja→amarelo→verde) ─
// 3 variantes: Absoluta (kg/ha, limites por cultura), Percentil (% da área) e
// % da Média (cada pixel vs média do talhão). As duas relativas são genéricas.
const PARES_PROD = [
  { inicio: '#7F0000', fim: '#E53935' }, // Muito Baixa — vermelho
  { inicio: '#E65100', fim: '#FB8C00' }, // Baixa — laranja
  { inicio: '#F9A825', fim: '#FDD835' }, // Média — amarelo
  { inicio: '#9CCC65', fim: '#689F38' }, // Alta — verde claro
  { inicio: '#388E3C', fim: '#1B5E20' }, // Muito Alta — verde escuro
];
const NOMES_PROD = ['Muito Baixa', 'Baixa', 'Média', 'Alta', 'Muito Alta'];

function prodAbsoluta(id: string, cultura: string, bordas: [number, number, number, number]): Legenda {
  return {
    ...baseFix, id,
    nome: `Produtividade — ${cultura} (kg/ha)`,
    atributoId: 'produtividade', atributo: `Produtividade ${cultura}`, simbolo: 'kg/ha',
    unidade: 'kg/ha', metodo: cultura,
    categoria: 'produtividade-colheita', invertida: false,
    dominioMin: 0,
    observacao: 'Produtividade absoluta — limites por cultura (referências agronômicas/produtivas).',
    classes: classesComPares(bordas, PARES_PROD, NOMES_PROD),
  };
}
const prodSoja = prodAbsoluta('sys_prod_soja', 'Soja', [2700, 3600, 4500, 5400]);
const prodMilho = prodAbsoluta('sys_prod_milho', 'Milho', [7000, 9000, 11000, 15000]);
const prodTrigo = prodAbsoluta('sys_prod_trigo', 'Trigo/Cevada', [2500, 3600, 4800, 5500]);
const prodFeijao = prodAbsoluta('sys_prod_feijao', 'Feijão', [1000, 2000, 3000, 4000]);

const prodPercentil: Legenda = {
  ...baseFix, id: 'sys_prod_percentil',
  nome: 'Produtividade — Percentil (% da área)',
  atributoId: 'produtividade', atributo: 'Produtividade (percentil)', simbolo: 'pct',
  unidade: 'percentil %', metodo: 'Relativa',
  categoria: 'produtividade-colheita', invertida: false,
  dominioMin: 0, dominioMax: 100,
  observacao: 'Percentil calculado dentro da área analisada (0–20 … 80–100%).',
  classes: classesComPares([20, 40, 60, 80], PARES_PROD, NOMES_PROD),
};

const prodMedia: Legenda = {
  ...baseFix, id: 'sys_prod_media',
  nome: 'Produtividade — % da Média',
  atributoId: 'produtividade', atributo: 'Produtividade (% da média)', simbolo: '%méd',
  unidade: '% da média', metodo: 'Relativa',
  categoria: 'produtividade-colheita', invertida: false,
  dominioMin: 50, dominioMax: 150,
  observacao: 'Cada pixel comparado à média do talhão (<80% … >120%).',
  classes: classesComPares([80, 90, 110, 120], PARES_PROD, NOMES_PROD),
};

// ── Compactação (MPa; invertida: alta compactação = vermelho/alarme) ───────
const compactacao: Legenda = {
  ...baseFix,
  id: 'sys_compactacao',
  nome: 'Compactação do Solo',
  atributoId: 'compactacao', atributo: 'Compactação', simbolo: 'MPa',
  unidade: 'MPa', metodo: 'Penetrometria',
  categoria: 'compactacao', invertida: true,
  dominioMin: 0, dominioMax: 4,
  observacao: 'Resistência à penetração; valores altos = mais compactado (toxidez física).',
  classes: classesFertilidade5([1.0, 1.5, 2.0, 3.0], true),
};

export const LEGENDAS_OFICIAIS: Legenda[] = [
  ...ABC_SISTEMA,
  textura,
  altimetria,
  ndvi,
  prodSoja, prodMilho, prodTrigo, prodFeijao,
  prodPercentil, prodMedia,
  compactacao,
];
