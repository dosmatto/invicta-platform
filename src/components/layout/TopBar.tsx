'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Wifi, User, LogOut, Lock, ArrowLeft } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { getSafras, getTalhoes } from '@/lib/store';
import { rotuloAno } from '@/lib/periodo';
import { EmpresaSwitcher } from './EmpresaSwitcher';
import { logout, emailUsuario, authConfigurado } from '@/lib/auth';
import { modoProdutorMapaAtivo, desligarModoProdutorMapa } from '@/lib/modoProdutorMapa';

export function TopBar() {
  const { nav: context } = useApp();
  const router = useRouter();
  // Produtor no mapa (botão "Mapa da fazenda" do portal): selo de somente
  // leitura + botão de volta ao portal. Demais papéis: topo como sempre.
  const modoProdutor = modoProdutorMapaAtivo();
  function voltarPortal() {
    desligarModoProdutorMapa();
    router.push('/portal');
  }

  // ÁREA = a do POLÍGONO do talhão, lida do cadastro a cada render. `nav.area` é
  // só uma cópia feita na navegação e não acompanha a troca de limite (o caso
  // relatado: trilha com 143,5 ha e o limite v2 com 142,38 na mesma tela).
  const areaTalhao = (context.talhaoId
    ? getTalhoes().find(t => t.id === context.talhaoId)?.areaHa
    : undefined) ?? context.area;

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
        {/* height fixa + width auto (mantém proporção) — sem warning do next/image; priority = LCP do painel */}
        <Image src="/images/logo-branca.png" alt="Invicta" width={90} height={28} priority style={{ objectFit: 'contain', height: 28, width: 'auto' }} />
      </div>

      {modoProdutor && (
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={voltarPortal} title="Voltar ao portal"
            className="flex items-center gap-1 px-2 py-1.5 rounded text-xs font-semibold"
            style={{ background: '#1a3a6b', color: '#93c5fd' }}>
            <ArrowLeft size={14} /> Portal
          </button>
          <span className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider"
            title="Você vê o que a Invicta processou nos seus talhões. Alterações só pelo escritório."
            style={{ background: '#0f2240', color: '#93c5fd', border: '1px solid #1a3a6b' }}>
            <Lock size={10} /> Somente leitura
          </span>
        </div>
      )}

      {/* Breadcrumb contextual */}
      <div className="flex items-center gap-1.5 text-xs flex-1 min-w-0">
        {[
          { label: 'Cliente', value: context.produtor },
          { label: 'Fazenda', value: context.fazenda },
          { label: 'Talhão', value: context.talhao },
          { label: 'Ano', value: rotuloAno(safraAtiva || context.safra) },
        ].map((item, i) => (
          <span key={item.label} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight size={12} className="opacity-40 flex-shrink-0" style={{ color: '#fff' }} />}
            <span className="opacity-60 flex-shrink-0" style={{ color: '#93c5fd' }}>{item.label}:</span>
            <span className="font-semibold truncate" style={{ color: '#fff' }}>{item.value}</span>
          </span>
        ))}

        {areaTalhao > 0 && (
          <>
            <ChevronRight size={12} className="opacity-40" style={{ color: '#fff' }} />
            <span className="font-bold flex-shrink-0" style={{ color: '#86efac' }}>
              {areaTalhao.toLocaleString('pt-BR')} ha
            </span>
          </>
        )}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {/* Produtor no mapa: sem troca de empresa ("Nova empresa"/"Gerenciar" são escrita). */}
        {!modoProdutor && <EmpresaSwitcher />}
        <Wifi size={16} style={{ color: '#86efac' }} />
        <div className="flex items-center gap-2 pl-3 border-l border-white/20">
          {authConfigurado && emailUsuario() && (
            <span className="text-[11px] truncate max-w-[150px] hidden sm:inline" style={{ color: '#cbd5e1' }}>{emailUsuario()}</span>
          )}
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
            style={{ background: 'var(--invicta-blue-mid)' }}>
            <User size={14} />
          </div>
          {authConfigurado && (
            <button onClick={() => logout()} title="Sair" className="p-1 rounded transition-colors hover:bg-white/10" style={{ color: '#93c5fd' }}>
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
