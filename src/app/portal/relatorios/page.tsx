'use client';

// Portal do Produtor → Relatórios. EM BREVE: a página está fechada até a Invicta
// escolher quais relatórios o produtor vai ver. Nada aqui leva aos relatórios
// nem às recomendações (nem a lista, nem os atalhos para a página do talhão).
// O conteúdo antigo continua em components/portal/paginas/RelatoriosPagina.tsx,
// só desligado — para reabrir, volte a renderizar <RelatoriosPagina /> e tire o
// `emBreve` do item em components/portal/shell/menu.ts.

import { FileText } from 'lucide-react';
import { Vazio } from '@/components/portal/ui';

export default function RelatoriosPage() {
  return (
    <Vazio icone={FileText} titulo="Em breve"
      texto="Os relatórios do produtor estão sendo preparados e aparecem aqui assim que estiverem disponíveis." />
  );
}
