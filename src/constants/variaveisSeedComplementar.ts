// Catálogo COMPLEMENTAR de Variáveis de Análise — baseado na lista da InCeres
// (Preferências de Análise), a pedido do usuário (22-23/07/2026). Estas variáveis
// são SEMEADAS além do seed básico (ELEMENTOS_LAB): ficam CADASTRADAS no catálogo
// e o usuário liga/desliga o "Usar" — por padrão entram DESLIGADAS, exceto as
// derivadas (K%/Ca%/Mg%/CTCe), que a plataforma calcula na importação e devem
// aparecer nos Perfis.
//
// Decisões de mapeamento (não duplicar o que já existe no seed básico):
//   • MOS (Matéria Orgânica Seca)  ≡ 'mo' existente (Matéria Orgânica) — não recriada;
//   • Al% (Saturação de Alumínio)  ≡ 'm' existente (m%) — não recriada;
//   • P/K/Ca/Mg/S/B/Zn/Cu/Mn/pH/Al/CTC/V%/m%/MO/Textura já existem no seed básico.
// Unidades seguem a lista de referência; são editáveis no painel.
// Sinônimos VAZIOS nas derivadas: elas nunca são lidas de coluna de arquivo
// (calcularDerivados recalcula e sobrescreve sempre — lab.ts).

export interface VariavelComplementar {
  id: string;
  sigla: string;
  nome: string;
  unidade: string;
  sinonimos: string[];
  usar: boolean;
  /** posiciona junto de outra variável do seed básico (ordem = base + 0.5) */
  aposId?: string;
}

export const VARIAVEIS_COMPLEMENTARES: VariavelComplementar[] = [
  // ── Derivadas (a plataforma calcula na importação) — entram ATIVAS ─────────
  { id: 't',     sigla: 'CTCe', nome: 'CTC efetiva',            unidade: 'cmolc/dm³', sinonimos: [], usar: true, aposId: 'ctc' },
  { id: 'satk',  sigla: 'K%',   nome: 'Saturação por Potássio', unidade: '%',         sinonimos: [], usar: true, aposId: 'k' },
  { id: 'satca', sigla: 'Ca%',  nome: 'Saturação por Cálcio',   unidade: '%',         sinonimos: [], usar: true, aposId: 'ca' },
  { id: 'satmg', sigla: 'Mg%',  nome: 'Saturação por Magnésio', unidade: '%',         sinonimos: [], usar: true, aposId: 'mg' },

  // ── pH por método ──────────────────────────────────────────────────────────
  { id: 'ph_cacl2', sigla: 'pH CaCl2', nome: 'pH por CaCl2', unidade: '', sinonimos: ['phcacl2', 'phcacl'], usar: false },
  { id: 'ph_agua',  sigla: 'pH Água',  nome: 'pH em Água',   unidade: '', sinonimos: ['phagua', 'phh2o'],   usar: false },
  { id: 'ph_kcl',   sigla: 'pH KCl',   nome: 'pH KCl',       unidade: '', sinonimos: ['phkcl'],             usar: false },
  { id: 'ph_smp',   sigla: 'pH SMP',   nome: 'pH SMP',       unidade: '', sinonimos: ['phsmp'],             usar: false },

  // ── Fósforo por extrator ───────────────────────────────────────────────────
  { id: 'p_res',   sigla: 'P res',   nome: 'Fósforo Resina',       unidade: 'mg/dm³', sinonimos: ['fosfororesina'],                usar: false },
  { id: 'p_mehl',  sigla: 'P mehl',  nome: 'Fósforo Mehlich',      unidade: 'mg/dm³', sinonimos: ['fosforomehlich'],               usar: false },
  { id: 'p_bray',  sigla: 'PB',      nome: 'Fósforo Bray II',      unidade: 'mg/dm³', sinonimos: ['pbray', 'pbrayii', 'bray'],     usar: false },
  { id: 'p_olsen', sigla: 'PO',      nome: 'Fósforo Olsen',        unidade: 'mg/dm³', sinonimos: ['polsen', 'olsen'],              usar: false },
  // p_rem SEM sinônimos: P remanescente NÃO é P disponível; automap por substring
  // ("fosforo…") arriscava contaminar o 'p' canônico. Mapeamento manual.
  { id: 'p_rem',   sigla: 'Prem',    nome: 'Fósforo Remanescente', unidade: 'mg/dm³', sinonimos: [],                               usar: false },
  { id: 'p_total', sigla: 'P Total', nome: 'Fósforo Total',        unidade: 'mg/dm³', sinonimos: ['ptotal', 'fosforototal'],       usar: false },

  // ── Cátions/ânions e somas ─────────────────────────────────────────────────
  // k_ppm SEM sinônimos (mapeamento só manual): se automapasse "K mg/K ppm", a
  // coluna deixaria de cair no 'k' canônico (que converte mg→mmolc ÷39,10) e o
  // K oficial ficaria vazio — sem K%, sem CTCe, sem mapa/equação de K.
  { id: 'k_ppm', sigla: 'K mg', nome: 'Potássio em Miligramas',   unidade: 'ppm',       sinonimos: [],                                    usar: false },
  { id: 'h',     sigla: 'H',    nome: 'Hidrogênio',               unidade: 'cmolc/dm³', sinonimos: ['hidrogenio'],                        usar: false },
  { id: 'na',    sigla: 'Na',   nome: 'Sódio',                    unidade: 'cmolc/dm³', sinonimos: ['sodio'],                             usar: false },
  { id: 'sb',    sigla: 'SB',   nome: 'Soma de Bases',            unidade: 'cmolc/dm³', sinonimos: ['somadebases', 'somabases'],          usar: false },
  { id: 'ca_mg', sigla: 'Ca+Mg', nome: 'Soma Cálcio + Magnésio',  unidade: 'cmolc/dm³', sinonimos: ['somacalciomagnesio'],                usar: false },
  { id: 'h_al',  sigla: 'H+Al', nome: 'Hidrogênio + Alumínio',    unidade: 'cmolc/dm³', sinonimos: ['hal', 'acidezpotencial'],            usar: false },
  { id: 'h_pct', sigla: 'H%',   nome: 'Saturação de Hidrogênio',  unidade: '%',         sinonimos: ['saturacaohidrogenio'],               usar: false },
  { id: 'so4',   sigla: 'SO4',  nome: 'Sulfato (SO4)',            unidade: 'meq/L',     sinonimos: ['so4', 'sulfato'],                    usar: false },

  // ── Micronutrientes e outros elementos ────────────────────────────────────
  { id: 'fe',    sigla: 'Fe', nome: 'Ferro',      unidade: 'mg/dm³',    sinonimos: ['ferro'],      usar: false },
  // ATENÇÃO: header "Mo" cru cai na Matéria Orgânica ('mo'); molibdênio só automapa
  // por extenso. Se um dia virar token de equação, usar 'Molib' (nunca 'Mo' ≍ MO).
  { id: 'molib', sigla: 'Mo', nome: 'Molibdênio', unidade: 'mg/dm³',    sinonimos: ['molibdenio'], usar: false },
  { id: 'si',    sigla: 'Si', nome: 'Silício',    unidade: '%',         sinonimos: ['silicio'],    usar: false },
  { id: 'c',     sigla: 'C',  nome: 'Carbono',    unidade: 'mmolc/dm³', sinonimos: ['carbono'],    usar: false },
  { id: 'n',     sigla: 'N',  nome: 'Nitrogênio', unidade: 'mmolc/dm³', sinonimos: ['nitrogenio'], usar: false },
  { id: 'cl',    sigla: 'Cl', nome: 'Cloro',      unidade: 'mg/dm³',    sinonimos: ['cloro'],      usar: false },

  // ── Relações entre elementos ───────────────────────────────────────────────
  { id: 'rel_ca_k',   sigla: 'Ca/K',    nome: 'Relação Cálcio/Potássio',        unidade: '', sinonimos: ['relacaocalciopotassio'],         usar: false },
  { id: 'rel_ca_mg',  sigla: 'Ca/Mg',   nome: 'Relação Cálcio/Magnésio',        unidade: '', sinonimos: ['relacaocalciomagnesio'],         usar: false },
  { id: 'rel_camg_k', sigla: 'Ca+Mg/K', nome: 'Relação (Ca+Mg)/Potássio',       unidade: '', sinonimos: ['relacaocalciomagnesiopotassio'], usar: false },
  { id: 'rel_mg_k',   sigla: 'Mg/K',    nome: 'Relação Magnésio/Potássio',      unidade: '', sinonimos: ['relacaomagnesiopotassio'],       usar: false },
  { id: 'rel_s_p',    sigla: 'S/P',     nome: 'Relação Enxofre/Fósforo',        unidade: '', sinonimos: ['relacaoenxofrefosforo'],         usar: false },
  { id: 'rel_k_na',   sigla: 'K/Na',    nome: 'Relação Potássio/Sódio',         unidade: '', sinonimos: ['relacaopotassiosodio'],          usar: false },
  { id: 'rel_fe_mn',  sigla: 'Fe/Mn',   nome: 'Relação Ferro/Manganês',         unidade: '', sinonimos: ['relacaoferromanganes'],          usar: false },
  { id: 'rel_p_zn',   sigla: 'P/Zn',    nome: 'Relação Fósforo/Zinco',          unidade: '', sinonimos: ['relacaofosforozinco'],           usar: false },

  // ── Solução do solo / solúveis / água ─────────────────────────────────────
  { id: 'hco3', sigla: 'HCO3', nome: 'Bicarbonato (HCO3)', unidade: 'meq/L', sinonimos: ['hco3', 'bicarbonato'],  usar: false },
  { id: 'co3',  sigla: 'CO3',  nome: 'Carbonato (CO3)',    unidade: 'meq/L', sinonimos: ['co3', 'carbonato'],     usar: false },
  { id: 'ks',   sigla: 'KS',   nome: 'Potássio Solúvel',   unidade: 'meq/L', sinonimos: ['potassiosoluvel'],      usar: false },
  { id: 'als',  sigla: 'AlS',  nome: 'Alumínio Solúvel',   unidade: 'meq/L', sinonimos: ['aluminiosoluvel'],      usar: false },
  { id: 'cas',  sigla: 'CaS',  nome: 'Cálcio Solúvel',     unidade: 'meq/L', sinonimos: ['calciosoluvel'],        usar: false },
  { id: 'mgs',  sigla: 'MgS',  nome: 'Magnésio Solúvel',   unidade: 'meq/L', sinonimos: ['magnesiosoluvel'],      usar: false },
  { id: 'nas',  sigla: 'NaS',  nome: 'Sódio Solúvel',      unidade: 'meq/L', sinonimos: ['sodiosoluvel'],         usar: false },
  { id: 'nh4',  sigla: 'NH4',  nome: 'Amônio (NH4)',       unidade: 'meq/L', sinonimos: ['nh4', 'amonio'],        usar: false },
  { id: 'no3',  sigla: 'NO3',  nome: 'Nitrato (NO3)',      unidade: 'meq/L', sinonimos: ['no3', 'nitrato'],       usar: false },
  // 'ras' como sinônimo curto casaria por substring "Leituras"/"Horas"/"Amostras" — só o nome por extenso.
  { id: 'ras',  sigla: 'RAS',  nome: 'Relação de Adsorção de Sódio (RAS)', unidade: '', sinonimos: ['relacaoadsorcaodesodio'], usar: false },

  // ── Físicos / sensores ────────────────────────────────────────────────────
  { id: 'ds',  sigla: 'Ds',  nome: 'Densidade do Solo',                unidade: 'g/cm³', sinonimos: ['densidadedosolo'],                  usar: false },
  // sigla 'CE' (não 'CEa') para não confundir com o CEa do módulo Condutividade
  // (atributoId 'condutividade', outro pipeline/unidade). Esta é a CE de laudo.
  { id: 'cea', sigla: 'CE',  nome: 'Condutividade Elétrica (laudo)',   unidade: 'dS/m',  sinonimos: ['condutividadeeletricaaparente'],    usar: false },
];
