'use client';

import { useEffect, useRef, useState } from 'react';
import { Building2, ChevronDown, Plus, Check, Settings as Cog } from 'lucide-react';
import {
  empresaAtiva, empresaAtivaId, setEmpresaAtivaId,
  getEmpresasDoUsuario, saveEmpresa, uidUsuario,
  type Empresa,
} from '@/lib/empresa';
import { useApp } from '@/context/AppContext';

export function EmpresaSwitcher() {
  const [aberto, setAberto] = useState(false);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [ativaId, setAtivaIdSt] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const { setActivePanel } = useApp();

  function recarregar() {
    setEmpresas(getEmpresasDoUsuario());
    setAtivaIdSt(empresaAtivaId());
  }
  useEffect(() => {
    recarregar();
    const onCh = () => recarregar();
    if (typeof window !== 'undefined') window.addEventListener('inv:empresa', onCh);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('inv:empresa', onCh); };
  }, []);

  // fechar ao clicar fora
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const atual = empresaAtiva();

  function trocar(id: string) {
    setEmpresaAtivaId(id);
    setAberto(false);
    // recarrega tudo que depende de dados (a maioria dos painéis re-pega via getX)
    if (typeof window !== 'undefined') setTimeout(() => window.location.reload(), 50);
  }

  function criarNova() {
    const nome = prompt('Nome da nova empresa:');
    if (!nome?.trim()) return;
    const u = uidUsuario();
    const nova = saveEmpresa({ nome: nome.trim(), criadoPor: u, membros: { [u]: 'admin' } });
    setEmpresaAtivaId(nova.id);
    setAberto(false);
    if (typeof window !== 'undefined') setTimeout(() => window.location.reload(), 50);
  }

  function abrirConfig() {
    setAberto(false);
    setActivePanel('empresa');
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setAberto(v => !v)}
        className="flex items-center gap-2 px-2.5 py-1 rounded text-xs"
        style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}
        title={atual?.nome ?? 'Selecione uma empresa'}>
        <Building2 size={13} />
        <span className="font-semibold truncate" style={{ maxWidth: 160 }}>
          {atual?.nome ?? 'Sem empresa'}
        </span>
        <ChevronDown size={12} />
      </button>

      {aberto && (
        <div className="absolute top-full right-0 mt-1 rounded-lg overflow-hidden shadow-lg z-50"
          style={{ background: 'var(--invicta-blue-dark)', border: '1px solid #1a3a6b', minWidth: 240 }}>
          <p className="text-[9px] font-semibold uppercase tracking-wider px-3 pt-2 pb-1" style={{ color: '#475569' }}>
            Empresas
          </p>
          <div className="max-h-60 overflow-y-auto">
            {empresas.length === 0 && (
              <div className="px-3 py-2 text-[11px]" style={{ color: '#64748b' }}>Nenhuma empresa.</div>
            )}
            {empresas.map(e => {
              const ativa = e.id === ativaId;
              return (
                <button key={e.id} onClick={() => trocar(e.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left"
                  style={{ background: ativa ? 'var(--invicta-blue)' : 'transparent', color: '#e2e8f0' }}>
                  {ativa ? <Check size={12} style={{ color: '#86efac' }} /> : <span style={{ width: 12 }} />}
                  <span className="flex-1 truncate font-semibold">{e.nome}</span>
                  <span className="text-[9px]" style={{ color: '#64748b' }}>{e.membros[uidUsuario()] ?? ''}</span>
                </button>
              );
            })}
          </div>
          <div style={{ borderTop: '1px solid #1a3a6b' }}>
            <button onClick={criarNova} className="w-full flex items-center gap-2 px-3 py-2 text-xs"
              style={{ color: '#93c5fd' }}>
              <Plus size={12} /> Nova empresa
            </button>
            {atual && (
              <button onClick={abrirConfig} className="w-full flex items-center gap-2 px-3 py-2 text-xs"
                style={{ color: '#93c5fd', borderTop: '1px solid #0f2240' }}>
                <Cog size={12} /> Gerenciar empresa atual
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
