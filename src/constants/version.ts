export const APP_VERSION = '0.16.1';

export const CHANGELOG: Record<string, string[]> = {
  '0.16.1': [
    'Amostragem com seletor de método: Grid ou Zona de Manejo',
    'Z1 Zonas de Manejo — zonas exibidas no mapa coloridas por classe (semáforo) + legenda e lista',
  ],
  '0.16.0': [
    'Zonas de Manejo — campo zonasGeojson no talhão + caso de teste JRABA 01',
    'Cadastro de teste: Ricardo Arruda (JRA) › Fazenda Barrinha (JRABA) › Talhão JRABA 01 (67,8 ha, 8 zonas)',
    'Zonas do shapefile reprojetadas de UTM 22S para WGS84 (classes ALTA/MÉDIA/BAIXA)',
  ],
  '0.15.3': [
    'Etiqueta da amostra sem QR Code — prioriza o número da amostra (grande) + profundidade',
  ],
  '0.15.2': [
    'Fix: extração robusta dos polígonos dos talhões (FeatureCollection, Feature, Geometry ou GeometryCollection) — todos os talhões da fazenda aparecem no mapa',
  ],
  '0.15.1': [
    'Fix: ao abrir a fazenda, o mapa enquadra TODOS os talhões (antes parava num zoom afastado)',
    'fitBounds sem animação (evita voo interrompido) + resize do container antes de enquadrar',
  ],
  '0.15.0': [
    'Ao abrir uma Fazenda, todos os talhões com geometria aparecem no mapa (satélite)',
    'Clicar num talhão no mapa abre o talhão (como link), com zoom automático no conjunto',
  ],
  '0.14.0': [
    'Fase 4 — Etiquetas com QR Code por amostra (PDF)',
    'Uma etiqueta por amostra (ponto × profundidade); QR codifica "Talhão - Ponto - Profundidade"',
    'Etiqueta com QR + texto legível (talhão, ponto, profundidade, safra/época)',
    'Pontos passam a guardar quais profundidades possuem (para etiquetas corretas)',
    'Botão "Etiquetas" em cada grade salva (ao lado de KML/SHP)',
  ],
  '0.13.0': [
    'Exportação da grade pronta em KML ou Shapefile (.zip)',
    'Pontos numerados + polígono do talhão incluídos na exportação',
    'Shapefile separa pontos_amostragem e talhao (com .prj WGS84); botões por grade salva',
  ],
  '0.12.1': [
    'Changelog recolhível — última versão sempre visível, anteriores ocultas e expansíveis',
  ],
  '0.12.0': [
    'Amostragem Fase 3b — edição manual dos pontos no mapa',
    'Arrastar pontos (não saem do talhão nem da faixa de borda — encaixa na posição válida mais próxima)',
    'Adicionar pontos extras (clique no mapa) escolhendo as profundidades de cada um',
    'Remover pontos (clique no ponto)',
    'Mexer nos parâmetros descarta a edição manual e regera a grade',
    'Numeração re-sequenciada após editar; grade salva guarda os pontos editados',
  ],
  '0.11.1': [
    'Seed: Padrão de Amostragem fixo "Padrão Invicta 2 ha" (00-20 100% + 20-40 25%) para testes',
  ],
  '0.11.0': [
    'Amostragem Fase 3a — salvar e gerenciar grades',
    'Várias grades por safra/talhão; marcar qual será processada (uma por safra)',
    'Grades com nome auto (renomeável), badge CUSTOM, excluir',
    'Densidade aceita decimais (ex: 1,5 ha) no simulador e no cadastro',
  ],
  '0.10.1': [
    'Aleatoriedade agora é radial e limitada a metade do espaçamento (L/2) — pontos nunca se cruzam',
  ],
  '0.10.0': [
    'Amostragem Fase 2 — Simulador de Grid (geração real sobre o polígono do talhão)',
    'Puxa densidade e profundidades do Padrão de Amostragem, permitindo customizar (marca "CUSTOMIZADO")',
    'Controles ao vivo: densidade, distância da borda, rotação (auto pela maior dimensão + manual), aleatoriedade 0–100%',
    'Pontos coloridos por nº de profundidades (1=laranja, 2=azul, 3+=roxo), numeração em serpentina',
    'Seleção dos pontos das profundidades parciais: Regular ou Aleatório, com refazer sorteio',
    'Seletor de safra ativa + 1ª/2ª época (até junho / julho–dezembro)',
  ],
  '0.9.11': [
    'Seed: 2 Padrões de Elementos de teste — "Rotina + Textura + Micro" (todos menos S) e "Rotina + S"',
  ],
  '0.9.10': [
    'Textura (granulometria) adicionada como análise selecionável nos Padrões de Elementos',
  ],
  '0.9.9': [
    'Base Agronômica movida para dentro do painel "Cadastros"',
    'Ícone separado "Base Ag." removido da barra lateral (consolidação dos cadastros)',
  ],
  '0.9.8': [
    'Amostragem Fase 1 — novo painel "Cadastros" na barra lateral',
    'Cadastro de Padrões de Elementos (conjuntos nomeados de elementos: Rotina, Micros…)',
    'Cadastro de Padrões de Amostragem (densidade + múltiplas profundidades, cada uma com % de pontos e padrão de elementos)',
    'Base para o simulador de grid (Fase 2)',
  ],
  '0.9.7': [
    'Cadastro de safra a partir do próprio talhão (botão + no seletor de safra)',
    'Safra recém-criada fica selecionada como contexto ativo do talhão',
    'A safra selecionada é o contexto temporal das operações do talhão',
  ],
  '0.9.6': [
    'Coordenada exata do Escritório da Invicta definida (Carambeí/PR) — mapa abre nela',
  ],
  '0.9.5': [
    'Dados de teste pré-carregados (seed): Frederico Rodolfo Nolte (FRN) › Fazenda Figueira (FRNFI) › Talhão FRNFI 21',
    'Talhão FRNFI 21 já vem com a geometria real (shapefile, 52,9 ha) carregada',
    'Seed roda uma vez em qualquer navegador/plataforma — contorna falta de sincronização do localStorage',
    'Mapa abre por padrão no modo Satélite',
    'Mapa abre centralizado na localização do Escritório da Invicta (Carambeí/PR)',
  ],
  '0.9.4': [
    'FIX DEFINITIVO mapa branco em produção — container do mapa colapsava para altura 0',
    'Causa: CSS do MapLibre força position:relative, anulando o `inset-0` do container',
    'Solução: width/height 100% via style inline (vence o CSS do MapLibre por especificidade)',
    'Diagnosticado reproduzindo o build de produção localmente',
  ],
  '0.9.3': [
    'Fix mapa branco em produção — CSS MapLibre carregado via CDN jsDelivr no <head>',
    'MapView: map.resize() após load para garantir dimensões corretas',
  ],
  '0.9.2': [
    'Fix mapa branco no Vercel — CSS do MapLibre importado no layout raiz (server component)',
  ],
  '0.9.1': [
    'Seletor de safra no talhão usa apenas safras cadastradas manualmente',
    'Safra ativa é pré-selecionada automaticamente ao abrir o talhão',
    'Exibe aviso quando nenhuma safra foi cadastrada',
  ],
  '0.9.0': [
    'Upload georreferenciado real no talhão — KML, Shapefile (.zip) e GeoJSON',
    'Geometria persiste no localStorage (geojson + bbox + areaHa) e restaura ao reabrir',
    'Status do talhão atualizado para Ativo automaticamente após upload',
    'Campo Sigla opcional em Cliente e Fazenda',
    'Cadastro de Safras — criar, ativar/desativar e excluir via SlidePanel',
    'FazendaDetailPanel migrado de mocks para store real (getFazendas/getTalhoes)',
    'Fix mapa branco em produção — CSS MapLibre movido para globals.css + ssr:false',
    'Fix build Vercel — erros TypeScript em páginas com mocks never[] corrigidos',
    'Fix conteúdo de rotas filhas vazando abaixo do mapa',
  ],
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
