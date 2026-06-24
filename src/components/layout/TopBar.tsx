'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { ChevronRight, Wifi, User, LogOut } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { getSafras } from '@/lib/store';
import { EmpresaSwitcher } from './EmpresaSwitcher';
import { logout, emailUsuario, firebaseConfigurado } from '@/lib/auth';

export function TopBar() {
  const { nav: context } = useApp();

  // Safra exibida = a ATIVA de verdade (getSafras), não o default de nav.safra.
  // Reage à troca de safra (dispara inv:biblioteca) e à troca de empresa.
  const [safraAtiva, setSafraAtiva] = useState('');
  useEffect(() => {
    const ler = () => setSafraAtiva(getSafras().find(s => s.ativa)?.nome ?? '');
    ler();
    window.addEventListener('inv:biblioteca', ler);
    window.addEventListener('inv:empresa', ler);
    return () => { window.removeEventListener('inv:biblioteca', ler); window.removeEventListener('inv:empresa', ler); };
  }, []);

  return (
    <header
      className="flex items-center h-12 px-4 gap-4 z-50 relative flex-shrink-0 select-none"
      style={{ background: 'var(--invicta-blue)', borderBottom: '1px solid #1a3a6b' }}
    >
      {/* Logo */}
      <div className="flex-shrink-0 pr-4 border-r border-white/20">
        <Image src="/images/logo-branca.png" alt="Invicta" width={90} height={28} style={{ objectFit: 'contain' }} />
      </div>

      {/* Breadcrumb contextual */}
      <div className="flex items-center gap-1.5 text-xs flex-1 min-w-0">
        {[
          { label: 'Cliente', value: context.produtor },
          { label: 'Fazenda', value: context.fazenda },
          { label: 'Talhão', value: context.talhao },
          { label: 'Safra', value: safraAtiva || context.safra || '—' },
        ].map((item, i) => (
          <span key={item.label} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight size={12} className="opacity-40 flex-shrink-0" style={{ color: '#fff' }} />}
            <span className="opacity-60 flex-shrink-0" style={{ color: '#93c5fd' }}>{item.label}:</span>
            <span className="font-semibold truncate" style={{ color: '#fff' }}>{item.value}</span>
          </span>
        ))}

        {context.area > 0 && (
          <>
            <ChevronRight size={12} className="opacity-40" style={{ color: '#fff' }} />
            <span className="font-bold flex-shrink-0" style={{ color: '#86efac' }}>
              {context.area.toLocaleString('pt-BR')} ha
            </span>
          </>
        )}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <EmpresaSwitcher />
        <Wifi size={16} style={{ color: '#86efac' }} />
        <div className="flex items-center gap-2 pl-3 border-l border-white/20">
          {firebaseConfigurado && emailUsuario() && (
            <span className="text-[11px] truncate max-w-[150px] hidden sm:inline" style={{ color: '#cbd5e1' }}>{emailUsuario()}</span>
          )}
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
            style={{ background: 'var(--invicta-blue-mid)' }}>
            <User size={14} />
          </div>
          {firebaseConfigurado && (
            <button onClick={() => logout()} title="Sair" className="p-1 rounded transition-colors hover:bg-white/10" style={{ color: '#93c5fd' }}>
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
