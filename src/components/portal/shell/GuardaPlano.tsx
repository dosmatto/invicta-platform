'use client';

// Guarda de plano POR ROTA — a ÚNICA peça que bloqueia uma página do portal
// fora do plano do produtor. O shell a aplica a toda rota a partir do mesmo
// mapa rota → seções que esconde o item do menu (`ITENS_MENU[].secoes`): quem
// digita /portal/fertilidade na URL sem 'fertilidade' no plano vê o aviso, não
// o conteúdo. As páginas NÃO repetem essa checagem; o que fazem com
// `p.liberada()` é só o recorte interno (ex.: Zonas esconde o cartão de
// prescrição quando 'recomendacoes' não está no plano).

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Lock } from 'lucide-react';
import { usePortal } from '../PortalContext';
import { Vazio } from '../ui/Vazio';
import { itemDaRota, itemLiberado } from './menu';

export function GuardaPlano({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const p = usePortal();
  const item = itemDaRota(pathname);
  if (!itemLiberado(item, p.liberada)) {
    return <Vazio icone={Lock} titulo="Esta seção não faz parte do seu plano" texto={`${item.titulo}: fale com a Invicta para liberar esta seção no portal.`} />;
  }
  return <>{children}</>;
}
