// Itens do menu lateral do portal — UMA lista: o menu, o título/subtítulo do
// cabeçalho e o filtro por plano saem daqui. Página nova do portal = uma linha
// aqui + src/app/portal/<rota>/page.tsx.

import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Grid3x3, FlaskConical, TrendingUp, Shapes, Zap, Mountain, Satellite, BarChart3,
  Tractor, Rows3, Gauge, FileText, Trophy,
} from 'lucide-react';
import type { SecaoPortalPlano } from '../PortalContext';

export interface ItemMenu {
  rota: string;
  rotulo: string;
  icone: LucideIcon;
  /** Título do cabeçalho da página. */
  titulo: string;
  subtitulo: string;
  /** Seções do plano que liberam o item: basta UMA estar no plano (ausente =
   *  sempre visível). Vale para o menu E para a rota (guarda do shell). */
  secoes?: SecaoPortalPlano[];
  /** Aba da página do talhão equivalente (botão "Abrir na página do talhão"). */
  aba?: string;
}

export const ITENS_MENU: ItemMenu[] = [
  { rota: '/portal', rotulo: 'Visão geral', icone: LayoutDashboard, titulo: 'Agricultura de Precisão', subtitulo: 'Diagnóstico espacial, fertilidade do solo e zonas de manejo para decisões mais rentáveis.' },
  { rota: '/portal/talhoes', rotulo: 'Talhões', icone: Grid3x3, titulo: 'Talhões', subtitulo: 'O que já existe em cada talhão, ano a ano — clique para abrir.' },
  { rota: '/portal/fertilidade', rotulo: 'Fertilidade do solo', icone: FlaskConical, titulo: 'Fertilidade do solo', subtitulo: 'Mapas e classes dos atributos da última análise de solo.', secoes: ['fertilidade'], aba: 'fertilidade' },
  { rota: '/portal/nutrientes', rotulo: 'Nutrientes', icone: TrendingUp, titulo: 'Evolução dos nutrientes', subtitulo: 'Todos os talhões, um nutriente por vez, ano a ano.', secoes: ['fertilidade'], aba: 'fertilidade' },
  { rota: '/portal/zonas', rotulo: 'Zonas de manejo', icone: Shapes, titulo: 'Zonas de manejo', subtitulo: 'As zonas de cada talhão, com a área de cada classe.', aba: 'zonas' },
  { rota: '/portal/condutividade', rotulo: 'Condutividade elétrica', icone: Zap, titulo: 'Condutividade elétrica', subtitulo: 'Levantamentos de CE do solo — textura e variação dentro do talhão.', aba: 'condutividade' },
  { rota: '/portal/altimetria', rotulo: 'Altimetria / Relevo', icone: Mountain, titulo: 'Altimetria e relevo', subtitulo: 'Altitude, declividade e amplitude do terreno.', aba: 'altimetria' },
  { rota: '/portal/ndvi', rotulo: 'NDVI / NDRE', icone: Satellite, titulo: 'Índices de vegetação', subtitulo: 'NDVI e NDRE das cenas de satélite ao longo do ano.', secoes: ['ndvi'], aba: 'ndvi' },
  { rota: '/portal/produtividade', rotulo: 'Produtividade', icone: BarChart3, titulo: 'Produtividade', subtitulo: 'Mapas de colheita e a produtividade de cada talhão.', secoes: ['produtividade'], aba: 'produtividade' },
  { rota: '/portal/prescricoes', rotulo: 'Prescrições (VR)', icone: Tractor, titulo: 'Prescrições em taxa variável', subtitulo: 'Doses por zona e arquivos de aplicação gerados.', secoes: ['recomendacoes'], aba: 'prescricoes' },
  { rota: '/portal/linhas', rotulo: 'Linhas de plantio', icone: Rows3, titulo: 'Linhas de plantio', subtitulo: 'Projetos de linhas recebidos da PrecisionFarm.', aba: 'linhas' },
  { rota: '/portal/compactacao', rotulo: 'Compactação', icone: Gauge, titulo: 'Compactação do solo', subtitulo: 'Penetrometria por profundidade.', secoes: ['compactacao'], aba: 'compactacao' },
  { rota: '/portal/relatorios', rotulo: 'Relatórios', icone: FileText, titulo: 'Relatórios e recomendações', subtitulo: 'Relatórios em PDF e cenários de recomendação.', secoes: ['relatorios', 'recomendacoes'], aba: 'relatorios' },
  { rota: '/portal/comparativo', rotulo: 'Comparativo Invicta', icone: Trophy, titulo: 'Comparativo Invicta', subtitulo: 'Sua produtividade e fertilidade frente aos produtores Invicta — anônimo e agregado.', secoes: ['produtividade', 'fertilidade'] },
];

/** Item da rota atual (a mais específica que casa). */
export function itemDaRota(pathname: string): ItemMenu {
  const p = pathname.replace(/\/+$/, '') || '/portal';
  return [...ITENS_MENU].sort((a, b) => b.rota.length - a.rota.length).find(i => p === i.rota || p.startsWith(i.rota + '/')) ?? ITENS_MENU[0];
}

/** O item está no plano? (sem `secoes` = sempre). Menu e guarda de rota usam isto. */
export function itemLiberado(item: ItemMenu, liberada: (s: SecaoPortalPlano) => boolean): boolean {
  return !item.secoes?.length || item.secoes.some(liberada);
}
