'use client';

// Shell do Portal do Produtor v2 — UMA vez para todas as rotas do portal
// (app/portal/layout.tsx): decide QUEM vê (produtor logado; owner/admin ou a
// bancada sem login escolhendo um produtor; os demais papéis são mandados ao
// painel), monta o contexto (PortalContext) e desenha a moldura — menu
// lateral, cabeçalho com filtros e a área da página.
//
// "VER COMO O PRODUTOR VÊ": owner/admin — e a bancada local, sem login — abrem
// /portal e escolhem um produtor (ou passam ?cliente=<id>&plano=<id>). É a
// forma de conferir a tela ANTES de liberar o acesso a alguém.

import { useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AlertTriangle, Eye, ChevronRight, ArrowLeft } from 'lucide-react';
import { getPlanos, ROTULO_PAPEL } from '@/lib/empresa';
import { getClientes, getFazendas } from '@/lib/store';
import { logout } from '@/lib/auth';
import { useClientePortal } from '../useClientePortal';
import { PortalProvider, usePortal } from '../PortalContext';
import { ModoMapaContext } from '../ui/modoMapa';
import { COR } from '../ui/formato';
import { MenuLateral, GavetaMenu } from './MenuLateral';
import { Cabecalho, FaixaPreview } from './Cabecalho';
import { TemaPortal } from './tema';
import { GuardaPlano } from './GuardaPlano';

export function PortalShell({ children }: { children: ReactNode }) {
  return (
    <TemaPortal>
      {tema => (
        <div className="portal-raiz min-h-screen" data-tema={tema}
          style={{ fontFamily: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif', background: 'var(--bg-app)', color: 'var(--text-primary)' }}>
          <Portao>{children}</Portao>
        </div>
      )}
    </TemaPortal>
  );
}

function Portao({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { pronto, papel, podePrever, preview, cliente, plano, qsPreview } = useClientePortal();

  if (!pronto) return null;

  if (papel !== 'produtor' && !preview) {
    if (podePrever) {
      return <EscolherProdutor onEscolher={(id, planoId) => router.replace(`${pathname}?cliente=${encodeURIComponent(id)}${planoId ? `&plano=${encodeURIComponent(planoId)}` : ''}`)}
        onVoltar={() => router.replace('/painel')} />;
    }
    return <Aviso titulo="Portal do Produtor" texto={`Este espaço é do produtor. Seu acesso é de ${papel ? ROTULO_PAPEL[papel] : 'outro tipo'} — use o painel principal.`}
      acao={{ label: 'Ir para o painel', onClick: () => router.replace('/painel') }} />;
  }
  if (!cliente) {
    if (preview) {
      return <Aviso titulo="Produtor não encontrado" texto="O id passado em ?cliente= não existe no cadastro."
        acao={{ label: 'Escolher outro', onClick: () => router.replace(pathname) }} />;
    }
    return <Aviso titulo="Acesso ainda não vinculado" texto="Seu acesso de produtor ainda não está ligado a um cliente. Peça ao escritório para vincular."
      acao={{ label: 'Sair', onClick: () => logout() }} />;
  }

  return (
    <PortalProvider key={cliente.id} cliente={cliente} plano={plano} papel={papel} preview={preview} qsPreview={qsPreview}>
      <Moldura>{children}</Moldura>
    </PortalProvider>
  );
}

function Moldura({ children }: { children: ReactNode }) {
  const p = usePortal();
  const [menuAberto, setMenuAberto] = useState(false);
  return (
    <ModoMapaContext.Provider value={p.modoMapa}>
      <MenuLateral />
      <GavetaMenu aberta={menuAberto} onFechar={() => setMenuAberto(false)} />
      <div className="lg:pl-[248px] min-h-screen flex flex-col">
        <FaixaPreview />
        <Cabecalho onAbrirMenu={() => setMenuAberto(true)} />
        <main className="flex-1 w-full max-w-[1520px] mx-auto px-3 sm:px-5 lg:px-8 py-4 sm:py-6">
          {p.fazendas.length === 0 ? (
            <SemFazenda />
          ) : <GuardaPlano>{children}</GuardaPlano>}
        </main>
      </div>
    </ModoMapaContext.Provider>
  );
}

function SemFazenda() {
  return (
    <div className="rounded-2xl p-8 text-center" style={{ background: COR.superficie, border: `1px solid ${COR.borda}` }}>
      <p className="text-base font-bold">Nenhuma fazenda cadastrada ainda.</p>
      <p className="text-sm mt-1" style={{ color: COR.texto2 }}>Assim que a Invicta cadastrar suas fazendas e talhões, eles aparecem aqui.</p>
    </div>
  );
}

// Owner/admin (ou a bancada): qual produtor ver, e com qual plano.
function EscolherProdutor({ onEscolher, onVoltar }: { onEscolher: (id: string, planoId: string) => void; onVoltar: () => void }) {
  const clientes = useMemo(() => getClientes(), []);
  const planos = useMemo(() => getPlanos(), []);
  const [planoId, setPlanoId] = useState('');
  return (
    <div className="min-h-screen px-6 py-10" style={{ background: 'var(--bg-app)', color: 'var(--text-primary)' }}>
      <div className="max-w-lg mx-auto">
        <button onClick={onVoltar} className="flex items-center gap-1 text-xs font-semibold mb-4" style={{ color: 'var(--p-azul-texto)' }}>
          <ArrowLeft size={14} /> Voltar ao painel
        </button>
        <div className="flex items-center gap-2 mb-1">
          <Eye size={18} style={{ color: 'var(--invicta-green)' }} />
          <h1 className="text-lg font-extrabold">Ver o portal como o produtor vê</h1>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
          Escolha o produtor. A tela abre exatamente como ele a veria — somente leitura.
        </p>
        {planos.length > 0 && (
          <label className="flex items-center gap-2 text-xs font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>
            Plano
            <select value={planoId} onChange={e => setPlanoId(e.target.value)} className="rounded-lg px-2 py-1.5 text-xs outline-none"
              style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}>
              <option value="">Todas as seções (sem plano)</option>
              {planos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </label>
        )}
        {clientes.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Nenhum produtor cadastrado.</p>
        ) : (
          <ul className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
            {clientes.map((c, i) => {
              const nFaz = getFazendas(c.id).length;
              return (
                <li key={c.id} style={{ borderTop: i ? '1px solid var(--border-color)' : undefined }}>
                  <button onClick={() => onEscolher(c.id, planoId)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:opacity-80">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{c.nome}</p>
                      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{nFaz} {nFaz === 1 ? 'fazenda' : 'fazendas'}{c.cidade ? ` · ${c.cidade}/${c.estado}` : ''}</p>
                    </div>
                    <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Aviso({ titulo, texto, acao }: { titulo: string; texto: string; acao: { label: string; onClick: () => void } }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center" style={{ background: 'var(--bg-app)' }}>
      <AlertTriangle size={26} style={{ color: 'var(--status-warning)' }} />
      <div className="max-w-sm space-y-1">
        <p className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{titulo}</p>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{texto}</p>
      </div>
      <button onClick={acao.onClick} className="px-4 py-2 rounded text-xs font-bold text-white" style={{ background: 'var(--invicta-blue-mid)' }}>
        {acao.label}
      </button>
    </div>
  );
}
