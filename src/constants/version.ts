export const APP_VERSION = '0.4.0';

export const CHANGELOG: Record<string, string[]> = {
  '0.4.0': [
    'Fluxo talhão-cêntrico: todos os módulos técnicos dentro do talhão',
    'Sidebar simplificada: apenas Dashboard, Clientes, Fazendas, Talhões, Base Ag., Usuários, Config',
    'TalhaoDetailPanel com seletor de safra + 9 módulos em accordion',
    'Módulos vinculados ao talhão: Amostragem, Lab, QR Code, Fertilidade, NDVI, CE, Produtividade, Zonas, Aplicação, Relatórios',
  ],
  '0.3.0': [
    'Redesign completo para layout mapa-cêntrico (inspirado InCeres)',
    'Sidebar narrow com ícones (64px)',
    'Painéis deslizantes para todos os 18 módulos',
    'MapLibre GL integrado com talhões simulados',
    'TopBar de contexto: Produtor > Fazenda > Talhão > Safra > ha',
  ],
  '0.2.0': [
    'Layout completo de todos os módulos (tabelas)',
    'Módulos: Usuários, Fazendas, Safras, Base Agronômica, Amostragem, QR Code, Laboratórios, Fertilidade, NDVI, Relatórios',
  ],
  '0.1.0': [
    'Estrutura base Next.js + TypeScript + Tailwind + shadcn/ui',
    'Dashboard, Produtores, Talhões, Portal do Produtor',
    'Deploy inicial no Vercel',
    'Paleta de cores extraída das logos Invicta',
  ],
};
