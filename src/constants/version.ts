export const APP_VERSION = '0.8.0';

export const CHANGELOG: Record<string, string[]> = {
  '0.8.0': [
    'Upload real de KML e GeoJSON — parser client-side com @tmcw/togeojson',
    'Suporte a UTF-8 e UTF-16 (Topper 4500, QGIS, Google Earth)',
    'Geometria carregada exibida no MapLibre — zoom automático para o bbox',
    'Mapa troca para satélite automaticamente ao carregar arquivo',
    'Drag & drop ou click para upload',
    'Exibe número de feições e área estimada',
  ],
  '0.7.0': [
    'Módulo 08 — Amostragem completo dentro do Talhão',
    'Fluxo em 4 etapas: Limite → Método → Parâmetros → Pontos gerados',
    'Verificação de limite geográfico do talhão (obrigatório)',
    '4 métodos: Grid Fixo, Grid Variável, Importar, Manual no mapa',
    'Seleção de profundidades por campanha',
    'Pontos de amostragem exibidos no mapa MapLibre (toggle)',
    'Lista de pontos com status de coleta',
    'activeModule no contexto — mapa reage ao módulo ativo',
  ],
  '0.6.0': [
    'Base Agronômica completa — gerador de legendas por nutriente',
    'Barra de cor com gradiente padrão (vermelho→laranja→amarelo→verde→azul→roxo)',
    'Editor de limites de classe por nutriente (clique para expandir)',
    'Al e m% com escala invertida (roxo→vermelho = tóxico)',
    '15 nutrientes pré-configurados (Embrapa Cerrado)',
    'Abas: Legendas e Classes / Profundidades / Metodologias',
    'Preview compacto no painel lateral + link para editor completo',
  ],
  '0.5.0': [
    'Navegação hierárquica: Produtor → Fazenda → Talhão',
    'ProdutorDetailPanel: dados + lista de fazendas com cadastro',
    'FazendaDetailPanel: dados + lista de talhões com cadastro',
    'Mapa troca automaticamente para satélite (Esri) ao entrar no talhão',
    'Toggle manual Rua / Satélite no mapa',
    'Talhão selecionado destacado em verde no mapa',
  ],
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
