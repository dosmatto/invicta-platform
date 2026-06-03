export const IS_MOCK = true;

export const MOCK_PRODUTORES = [
  { id: '1', nome: 'João Silva', documento: '123.456.789-00', cidade: 'Sorriso', estado: 'MT', fazendas: 3, status: 'ativo' },
  { id: '2', nome: 'Pedro Alves', documento: '987.654.321-00', cidade: 'Lucas do Rio Verde', estado: 'MT', fazendas: 2, status: 'ativo' },
  { id: '3', nome: 'Maria Oliveira', documento: '456.789.123-00', cidade: 'Campo Novo do Parecis', estado: 'MT', fazendas: 1, status: 'ativo' },
  { id: '4', nome: 'Carlos Mendes', documento: '321.654.987-00', cidade: 'Primavera do Leste', estado: 'MT', fazendas: 4, status: 'ativo' },
];

export const MOCK_TALHOES = [
  { id: '1', nome: 'Talhão 01', fazenda: 'Fazenda São João', area: 48.5, status: 'ativo', safra: '24/25' },
  { id: '2', nome: 'Talhão 02', fazenda: 'Fazenda São João', area: 62.3, status: 'ativo', safra: '24/25' },
  { id: '3', nome: 'Talhão Norte', fazenda: 'Fazenda Boa Vista', area: 35.0, status: 'incompleto', safra: '—' },
  { id: '4', nome: 'Gleba A', fazenda: 'Fazenda Santa Rita', area: 120.8, status: 'ativo', safra: '24/25' },
];

export const MOCK_PROCESSAMENTOS = [
  { id: '1', tipo: 'NDVI Sentinel-2', talhao: 'Talhão 01', data: '2025-05-20', status: 'concluido' },
  { id: '2', tipo: 'Limpeza Colheita', talhao: 'Gleba A', data: '2025-05-18', status: 'concluido' },
  { id: '3', tipo: 'Zonas de Manejo', talhao: 'Talhão 02', data: '2025-05-22', status: 'processando' },
  { id: '4', tipo: 'Fertilidade Grid', talhao: 'Talhão 01', data: '2025-05-23', status: 'aguardando' },
];

export const MOCK_KPIS = {
  produtores: 4,
  fazendas: 8,
  talhoesAtivos: 14,
  talhoesIncompletos: 3,
  safraAtual: '24/25',
  areaTotal: 1842.5,
};
