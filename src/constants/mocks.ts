export const IS_MOCK = false;

// Dados zerados — cadastro real via localStorage (src/lib/store.ts)
export const MOCK_PRODUTORES: never[] = [];
export const MOCK_FAZENDAS:   never[] = [];
export const MOCK_TALHOES:    never[] = [];

export const MOCK_PROCESSAMENTOS = [
  { id: '1', tipo: 'NDVI Sentinel-2', talhao: '—', data: '—', status: 'aguardando' },
];

export const MOCK_KPIS = {
  produtores: 0, fazendas: 0, talhoesAtivos: 0,
  talhoesIncompletos: 0, safraAtual: '24/25', areaTotal: 0,
};

// KML demo pre-carregado
export const TALHAO_KML_URLS: Record<string, string> = {};
