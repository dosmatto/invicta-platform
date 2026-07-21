'use client';

// Seed de dados de teste — pré-carrega um produtor/fazenda/talhão reais
// enquanto não há backend. Roda apenas se o localStorage estiver vazio,
// garantindo os mesmos dados de teste em qualquer plataforma/navegador.

import seedGeo from '@/constants/seedTalhaoGeo.json';
import seedZonas from '@/constants/seedZonasJraba.json';
import { Cliente, Fazenda, Talhao, PadraoElementos, PadraoAmostragem } from './store';
import { lerListaLocal, gravarListaLocal } from './localComprimido';

// ── Localização inicial do mapa: Escritório da Invicta (Carambeí/PR) ──────────
// Formato MapLibre: [longitude, latitude]
export const ESCRITORIO_INVICTA: { center: [number, number]; zoom: number } = {
  center: [-50.113887554757035, -24.948709844238678], // Escritório Invicta, Carambeí/PR
  zoom: 15,
};

const SEED_FLAG = 'inv_seeded_v4';

const SEED_CLIENTE: Cliente = {
  id: 'seed-frn',
  nome: 'Frederico Rodolfo Nolte',
  sigla: 'FRN',
  documento: '',
  tipoPessoa: 'PF',
  telefone: '',
  email: '',
  cidade: 'Carambeí',
  estado: 'PR',
  observacoes: 'Dados de teste pré-carregados.',
  criadoEm: new Date('2024-01-01').toISOString(),
};

const SEED_FAZENDA: Fazenda = {
  id: 'seed-frnfi',
  clienteId: 'seed-frn',
  nome: 'Figueira',
  sigla: 'FRNFI',
  municipio: 'Carambeí',
  estado: 'PR',
  criadoEm: new Date('2024-01-01').toISOString(),
};

const SEED_TALHAO: Talhao = {
  id: 'seed-frnfi-21',
  fazendaId: 'seed-frnfi',
  nome: 'FRNFI 21',
  areaHa: seedGeo.areaHa,
  status: 'ativo',
  geojson: JSON.stringify(seedGeo.geojson),
  bbox: seedGeo.bbox as [number, number, number, number],
  criadoEm: new Date('2024-01-01').toISOString(),
};

// Segundo caso de teste — com Zonas de Manejo (JRABA 01, reprojetado de UTM 22S)
const SEED_CLIENTE_2: Cliente = {
  id: 'seed-ricardo',
  nome: 'Ricardo Arruda',
  sigla: 'JRA',
  documento: '',
  tipoPessoa: 'PF',
  telefone: '',
  email: '',
  cidade: 'Carambeí',
  estado: 'PR',
  observacoes: 'Dados de teste — zonas de manejo.',
  criadoEm: new Date('2024-01-01').toISOString(),
};

const SEED_FAZENDA_2: Fazenda = {
  id: 'seed-barrinha',
  clienteId: 'seed-ricardo',
  nome: 'Barrinha',
  sigla: 'JRABA',
  municipio: 'Carambeí',
  estado: 'PR',
  criadoEm: new Date('2024-01-01').toISOString(),
};

const SEED_TALHAO_2: Talhao = {
  id: 'seed-jraba-01',
  fazendaId: 'seed-barrinha',
  nome: 'JRABA 01',
  areaHa: seedZonas.areaHa,
  status: 'ativo',
  geojson: JSON.stringify(seedZonas.limite),
  zonasGeojson: JSON.stringify(seedZonas.zonas),
  bbox: seedZonas.bbox as [number, number, number, number],
  criadoEm: new Date('2024-01-01').toISOString(),
};

// Padrões de Elementos pré-cadastrados para testes
const SEED_PADROES_ELEMENTOS: PadraoElementos[] = [
  {
    id: 'seed-pe-rotina-tex-micro',
    nome: 'Rotina + Textura + Micro',
    // Todos os elementos, exceto S
    elementos: ['ph', 'p', 'k', 'ca', 'mg', 'al', 'ctc', 'v', 'm', 'mo', 'b', 'zn', 'cu', 'mn', 'textura'],
    criadoEm: new Date('2024-01-01').toISOString(),
  },
  {
    id: 'seed-pe-rotina-s',
    nome: 'Rotina + S',
    // Rotina + Enxofre
    elementos: ['ph', 'p', 'k', 'ca', 'mg', 'al', 'ctc', 'v', 'm', 'mo', 's'],
    criadoEm: new Date('2024-01-01').toISOString(),
  },
];

// Padrão de Amostragem pré-cadastrado para testes (1 ponto / 2 ha):
// 00-20 em 100% dos pontos (Rotina + Textura + Micro) e 20-40 em 25% (Rotina + S).
const SEED_PADROES_AMOSTRAGEM: PadraoAmostragem[] = [
  {
    id: 'seed-pa-invicta-2ha',
    nome: 'Padrão Invicta 2 ha',
    densidadeHaPonto: 2,
    profundidades: [
      { rotulo: '00-20', percentual: 100, padraoElementosId: 'seed-pe-rotina-tex-micro' },
      { rotulo: '20-40', percentual: 25,  padraoElementosId: 'seed-pe-rotina-s' },
    ],
    criadoEm: new Date('2024-01-01').toISOString(),
  },
];

function mergeUnique<T extends { id: string }>(key: string, seed: T) {
  // Via localComprimido (e não localStorage cru): inv_talhoes é chave PESADA —
  // vive no cache em memória + IndexedDB; o acesso cru não enxergaria o valor
  // migrado e re-injetaria/sombrearia o seed.
  const list = lerListaLocal<T>(key);
  if (!list.some(item => item.id === seed.id)) {
    list.push(seed);
    gravarListaLocal(key, list);
  }
}

// Popula os dados de teste uma única vez (controlado por flag).
export function seedIfEmpty() {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem(SEED_FLAG)) return;

  mergeUnique('inv_clientes', SEED_CLIENTE);
  mergeUnique('inv_fazendas', SEED_FAZENDA);
  mergeUnique('inv_talhoes', SEED_TALHAO);
  mergeUnique('inv_clientes', SEED_CLIENTE_2);
  mergeUnique('inv_fazendas', SEED_FAZENDA_2);
  mergeUnique('inv_talhoes', SEED_TALHAO_2);
  SEED_PADROES_ELEMENTOS.forEach(pe => mergeUnique('inv_padroes_elem', pe));
  SEED_PADROES_AMOSTRAGEM.forEach(pa => mergeUnique('inv_padroes_amos', pa));

  localStorage.setItem(SEED_FLAG, '1');
}
