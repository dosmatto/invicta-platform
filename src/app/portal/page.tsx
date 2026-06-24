'use client';

// Portal do Produtor (U3.B). O produtor logado vê SÓ o cliente dele: lista as
// fazendas → talhões e abre a página do talhão (read-only, abas filtradas pelo
// plano de assinatura). Reaproveita /talhao/[id].

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { meuRegistro, papelDoUsuario, planoPorId, ROTULO_PAPEL } from '@/lib/empresa';
import { getClientes, getFazendas, getTalhoes, getSafras } from '@/lib/store';
import { logout, emailUsuario } from '@/lib/auth';
import { MapPin, LogOut, ChevronRight, Leaf, AlertTriangle } from 'lucide-react';

export default function PortalPage() {
  const router = useRouter();
  const [pronto, setPronto] = useState(false);
  const [safra, setSafra] = useState('');

  useEffect(() => {
    setSafra(getSafras().find(s => s.ativa)?.nome ?? '');
    setPronto(true);
  }, []);

  const reg = useMemo(() => meuRegistro(), [pronto]);
  const papel = papelDoUsuario();
  const cliente = useMemo(() => reg?.clienteId ? getClientes().find(c => c.id === reg.clienteId) ?? null : null, [reg]);
  const plano = useMemo(() => planoPorId(reg?.planoId), [reg]);
  const safras = useMemo(() => getSafras(), [pronto]);
  const fazendas = useMemo(() => cliente ? getFazendas(cliente.id) : [], [cliente]);

  if (!pronto) return null;

  if (papel !== 'produtor') {
    return <Aviso titulo="Portal do Produtor" texto="Este espaço é do produtor. Use o painel principal."
      acao={{ label: 'Ir para o painel', onClick: () => router.replace('/painel') }} />;
  }
  if (!cliente) {
    return <Aviso titulo="Acesso ainda não vinculado" texto="Seu acesso de produtor ainda não está ligado a um cliente. Peça ao escritório para vincular."
      acao={{ label: 'Sair', onClick: () => logout() }} />;
  }

  return (
    <div className="min-h-screen" style={{ background: '#0a1929' }}>
      <header className="flex items-center justify-between px-5 py-3" style={{ background: 'var(--invicta-blue)', borderBottom: '1px solid #1a3a6b' }}>
        <Image src="/images/logo-branca.png" alt="Invicta" width={96} height={28} style={{ objectFit: 'contain' }} />
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-semibold" style={{ color: '#fff' }}>{cliente.nome}</p>
            <p className="text-[10px]" style={{ color: '#93c5fd' }}>{emailUsuario()} · {ROTULO_PAPEL[papel]}{plano ? ` · ${plano.nome}` : ''}</p>
          </div>
          <button onClick={() => logout()} title="Sair" className="p-1.5 rounded hover:bg-white/10" style={{ color: '#93c5fd' }}>
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-bold" style={{ color: '#e2e8f0' }}>Olá, {cliente.nome.split(' ')[0]} 👋</h1>
            <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>Seus talhões e informações agronômicas (somente leitura).</p>
          </div>
          {safras.length > 0 && (
            <div>
              <label className="text-[10px] font-semibold block mb-0.5" style={{ color: '#64748b' }}>Safra</label>
              <select value={safra} onChange={e => setSafra(e.target.value)}
                className="rounded px-2 py-1.5 text-xs outline-none" style={{ background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' }}>
                {safras.map(s => <option key={s.id} value={s.nome}>{s.nome}</option>)}
              </select>
            </div>
          )}
        </div>

        {fazendas.length === 0 ? (
          <p className="text-xs py-10 text-center" style={{ color: '#64748b' }}>Nenhuma fazenda cadastrada ainda.</p>
        ) : (
          fazendas.map(f => {
            const talhoes = getTalhoes(f.id);
            return (
              <div key={f.id} className="rounded-xl p-4" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
                <div className="flex items-center gap-2 mb-2">
                  <MapPin size={14} style={{ color: '#86efac' }} />
                  <h2 className="text-sm font-bold" style={{ color: '#e2e8f0' }}>{f.nome}</h2>
                  <span className="text-[10px]" style={{ color: '#64748b' }}>· {talhoes.length} talhão(ões)</span>
                </div>
                {talhoes.length === 0 ? (
                  <p className="text-[11px]" style={{ color: '#64748b' }}>Sem talhões cadastrados.</p>
                ) : (
                  <div className="space-y-1.5">
                    {talhoes.map(t => (
                      <button key={t.id} onClick={() => router.push(`/talhao/${t.id}`)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors"
                        style={{ background: '#0b1d3a', border: '1px solid #1a3a6b' }}>
                        <Leaf size={13} style={{ color: '#86efac' }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate" style={{ color: '#e2e8f0' }}>{t.nome}</p>
                          {!!t.areaHa && <p className="text-[10px]" style={{ color: '#64748b' }}>{t.areaHa.toLocaleString('pt-BR')} ha</p>}
                        </div>
                        <ChevronRight size={14} style={{ color: '#64748b' }} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}

        {plano && (
          <p className="text-[10px] text-center pt-2" style={{ color: '#475569' }}>
            Plano <strong style={{ color: '#93c5fd' }}>{plano.nome}</strong> — as seções disponíveis em cada talhão seguem o seu plano.
          </p>
        )}
      </main>
    </div>
  );
}

function Aviso({ titulo, texto, acao }: { titulo: string; texto: string; acao: { label: string; onClick: () => void } }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center" style={{ background: '#0a1929' }}>
      <AlertTriangle size={26} style={{ color: '#fbbf24' }} />
      <div className="max-w-sm space-y-1">
        <p className="text-base font-bold" style={{ color: '#e2e8f0' }}>{titulo}</p>
        <p className="text-xs" style={{ color: '#94a3b8' }}>{texto}</p>
      </div>
      <button onClick={acao.onClick} className="px-4 py-2 rounded text-xs font-bold text-white" style={{ background: 'var(--invicta-blue-mid)' }}>
        {acao.label}
      </button>
    </div>
  );
}
