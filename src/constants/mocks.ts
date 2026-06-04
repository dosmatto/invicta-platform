export const IS_MOCK = true;

export const MOCK_PRODUTORES = [
  { id: '1', nome: 'João Silva', documento: '123.456.789-00', cidade: 'Sorriso', estado: 'MT', telefone: '(66) 99999-0001', email: 'joao@email.com', status: 'ativo' },
  { id: '2', nome: 'Pedro Alves', documento: '987.654.321-00', cidade: 'Lucas do Rio Verde', estado: 'MT', telefone: '(66) 99999-0002', email: 'pedro@email.com', status: 'ativo' },
  { id: '3', nome: 'Maria Oliveira', documento: '456.789.123-00', cidade: 'Campo Novo do Parecis', estado: 'MT', telefone: '(65) 99999-0003', email: 'maria@email.com', status: 'ativo' },
  { id: '4', nome: 'Carlos Mendes', documento: '321.654.987-00', cidade: 'Primavera do Leste', estado: 'MT', telefone: '(66) 99999-0004', email: 'carlos@email.com', status: 'ativo' },
];

export const MOCK_FAZENDAS = [
  { id: '1', produtorId: '1', nome: 'Fazenda São João', municipio: 'Sorriso', estado: 'MT', area_ha: 285.3, car: 'MT-123456', status: 'ativo' },
  { id: '2', produtorId: '1', nome: 'Fazenda Boa Vista', municipio: 'Lucas do Rio Verde', estado: 'MT', area_ha: 120.0, car: 'MT-123457', status: 'ativo' },
  { id: '3', produtorId: '2', nome: 'Fazenda Santa Rita', municipio: 'Sorriso', estado: 'MT', area_ha: 430.8, car: 'MT-654321', status: 'ativo' },
  { id: '4', produtorId: '3', nome: 'Fazenda Esperança', municipio: 'Campo Novo do Parecis', estado: 'MT', area_ha: 98.5, car: 'MT-789012', status: 'ativo' },
  { id: '5', produtorId: '4', nome: 'Fazenda Nova Era', municipio: 'Primavera do Leste', estado: 'MT', area_ha: 640.0, car: 'MT-345678', status: 'ativo' },
];

export const MOCK_TALHOES = [
  { id: '1', fazendaId: '1', nome: 'Talhão 01', area: 48.5, status: 'ativo', safra: '24/25', lat: -13.23, lng: -54.70 },
  { id: '2', fazendaId: '1', nome: 'Talhão 02', area: 62.3, status: 'ativo', safra: '24/25', lat: -13.21, lng: -54.61 },
  { id: '3', fazendaId: '1', nome: 'Talhão Norte', area: 35.0, status: 'incompleto', safra: '—', lat: -13.19, lng: -54.67 },
  { id: '4', fazendaId: '2', nome: 'Gleba A', area: 120.8, status: 'ativo', safra: '24/25', lat: -13.25, lng: -54.52 },
  { id: '5', fazendaId: '3', nome: 'Área 01', area: 95.2, status: 'ativo', safra: '24/25', lat: -13.28, lng: -54.55 },
];

export const MOCK_PROCESSAMENTOS = [
  { id: '1', tipo: 'NDVI Sentinel-2', talhao: 'Talhão 01', data: '2025-05-20', status: 'concluido' },
  { id: '2', tipo: 'Limpeza Colheita', talhao: 'Gleba A', data: '2025-05-18', status: 'concluido' },
  { id: '3', tipo: 'Zonas de Manejo', talhao: 'Talhão 02', data: '2025-05-22', status: 'processando' },
  { id: '4', tipo: 'Fertilidade Grid', talhao: 'Talhão 01', data: '2025-05-23', status: 'aguardando' },
];

export const MOCK_KPIS = {
  produtores: 4,
  fazendas: 5,
  talhoesAtivos: 4,
  talhoesIncompletos: 1,
  safraAtual: '24/25',
  areaTotal: 1574.6,
};
