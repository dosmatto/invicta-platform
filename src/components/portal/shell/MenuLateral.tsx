'use client';

// Menu lateral do portal: azul-escuro da marca, logo branca, item ativo em
// verde. Fixo no desktop; no celular é a mesma lista dentro de uma gaveta.
// Item de seção fora do plano do produtor some (e a rota é barrada pela
// GuardaPlano do shell — mesma regra, `itemLiberado`).

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LifeBuoy, X } from 'lucide-react';
import { APP_VERSION } from '@/constants/version';
import { usePortal } from '../PortalContext';
import { ITENS_MENU, itemDaRota, itemLiberado } from './menu';

function ListaMenu({ onNavegar }: { onNavegar?: () => void }) {
  const pathname = usePathname();
  const p = usePortal();
  const ativo = itemDaRota(pathname).rota;
  const itens = ITENS_MENU.filter(i => itemLiberado(i, p.liberada));
  return (
    <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-2" aria-label="Seções do portal">
      <ul className="space-y-0.5">
        {itens.map(i => {
          const on = i.rota === ativo;
          const Icone = i.icone;
          return (
            <li key={i.rota}>
              <Link href={p.hrefPortal(i.rota)} onClick={onNavegar} aria-current={on ? 'page' : undefined}
                className="flex items-center gap-3 h-10 px-3 rounded-xl text-[13.5px] font-semibold transition-colors"
                style={on
                  ? { background: 'linear-gradient(90deg, var(--invicta-green-dark), var(--invicta-green))', color: '#fff', boxShadow: '0 6px 16px -8px rgba(61,154,61,0.9)' }
                  : { color: 'var(--sidebar-text)' }}
                onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
                onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'transparent'; }}>
                <Icone size={18} strokeWidth={on ? 2.2 : 1.8} className="flex-shrink-0" />
                <span className="truncate">{i.rotulo}</span>
                {i.emBreve && (
                  <span className="ml-auto flex-shrink-0 text-[9.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md"
                    style={{ background: on ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.1)', color: on ? '#fff' : 'var(--sidebar-text)' }}>
                    Em breve
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Marca() {
  return (
    <div className="px-5 pt-5 pb-4">
      <Image src="/images/logo-branca.png" alt="Invicta" width={150} height={56} priority className="h-11 w-auto" style={{ objectFit: 'contain' }} />
      <p className="text-[11px] font-semibold mt-1.5 uppercase tracking-[0.14em]" style={{ color: 'var(--sidebar-section)' }}>Portal do produtor</p>
    </div>
  );
}

function Rodape({ onNavegar }: { onNavegar?: () => void }) {
  return (
    <div className="px-3 pb-4 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
      <Link href="/suporte" onClick={onNavegar} className="flex items-center gap-3 h-10 px-3 rounded-xl text-[13.5px] font-semibold hover:bg-white/5" style={{ color: 'var(--sidebar-text)' }}>
        <LifeBuoy size={18} strokeWidth={1.8} /> Suporte
      </Link>
      <p className="px-3 mt-2 text-[10px]" style={{ color: 'rgba(200,216,236,0.45)' }}>INVICTA Platform · v{APP_VERSION}</p>
    </div>
  );
}

const FUNDO = 'linear-gradient(180deg, var(--invicta-blue-dark) 0%, #0c1c36 55%, #0a1a2f 100%)';

export function MenuLateral() {
  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-[248px] flex-col" style={{ background: FUNDO, borderRight: '1px solid rgba(255,255,255,0.06)' }}>
      <Marca />
      <ListaMenu />
      <Rodape />
    </aside>
  );
}

export function GavetaMenu({ aberta, onFechar }: { aberta: boolean; onFechar: () => void }) {
  if (!aberta) return null;
  return (
    <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Menu do portal">
      <button type="button" aria-label="Fechar menu" onClick={onFechar} className="absolute inset-0" style={{ background: 'rgba(5,13,26,0.55)' }} />
      <aside className="absolute inset-y-0 left-0 w-[272px] max-w-[85vw] flex flex-col shadow-2xl" style={{ background: FUNDO }}>
        <div className="flex items-start justify-between">
          <Marca />
          <button type="button" onClick={onFechar} aria-label="Fechar" className="m-3 p-2 rounded-lg" style={{ color: 'var(--sidebar-text)' }}><X size={18} /></button>
        </div>
        <ListaMenu onNavegar={onFechar} />
        <Rodape onNavegar={onFechar} />
      </aside>
    </div>
  );
}
