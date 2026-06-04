'use client';

// Seed de dados de teste — pré-carrega um produtor/fazenda/talhão reais
// enquanto não há backend. Roda apenas se o localStorage estiver vazio,
// garantindo os mesmos dados de teste em qualquer plataforma/navegador.

import seedGeo from '@/constants/seedTalhaoGeo.json';
import { Cliente, Fazenda, Talhao, PadraoElementos } from './store';

// ── Localização inicial do mapa: Escritório da Invicta (Carambeí/PR) ──────────
// Formato MapLibre: [longitude, latitude]
export const ESCRITORIO_INVICTA: { center: [number, number]; zoom: number } = {
  center: [-50.113887554757035, -24.948709844238678], // Escritório Invicta, Carambeí/PR
  zoom: 15,
};

const SEED_FLAG = 'inv_seeded_v2';

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

function mergeUnique<T extends { id: string }>(key: string, seed: T) {
  const raw = localStorage.getItem(key);
  const list: T[] = raw ? JSON.parse(raw) : [];
  if (!list.some(item => item.id === seed.id)) {
    list.push(seed);
    localStorage.setItem(key, JSON.stringify(list));
  }
}

// Popula os dados de teste uma única vez (controlado por flag).
export function seedIfEmpty() {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem(SEED_FLAG)) return;

  mergeUnique('inv_clientes', SEED_CLIENTE);
  mergeUnique('inv_fazendas', SEED_FAZENDA);
  mergeUnique('inv_talhoes', SEED_TALHAO);
  SEED_PADROES_ELEMENTOS.forEach(pe => mergeUnique('inv_padroes_elem', pe));

  localStorage.setItem(SEED_FLAG, '1');
}
