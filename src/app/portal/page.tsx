'use client';

// Portal do Produtor (U3.B). O produtor logado vê SÓ o cliente dele.
//
// Desde a v2.120.0 a página é um PAINEL (components/portal/PainelProdutor): o
// que já foi processado em cada talhão neste ano, os gráficos do produtor e o
// atalho para a página do talhão (/talhao/[id], read-only, abas pelo plano).
//
// "VER COMO O PRODUTOR VÊ": owner/admin — e a bancada local, sem login — abrem
// /portal e escolhem um produtor (ou passam ?cliente=<id>&plano=<id>). É a
// forma de conferir a tela ANTES de liberar o acesso a alguém.

import { useMemo, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { meuRegistro, papelDoUsuario, planoPorId, ehAdmin, getPlanos, ROTULO_PAPEL } from '@/lib/empresa';
import { clienteIdDoProdutor } from '@/lib/iam/vinculoProdutor';
import { getClientes, getFazendas } from '@/lib/store';
import { logout, authConfigurado } from '@/lib/auth';
import { PainelProdutor } from '@/components/portal/PainelProdutor';
import { AlertTriangle, Eye, ChevronRight, ArrowLeft } from 'lucide-react';

// "Já está no navegador?" sem setState em efeito: no servidor é false, no
// cliente vira true depois da hidratação — e só então lemos a URL e o registro.
const semAssinatura = () => () => {};

export default function PortalPage() {
  const router = useRouter();
  const pronto = useSyncExternalStore(semAssinatura, () => true, () => false);
  const params = useMemo(() => (pronto ? new URLSearchParams(window.location.search) : null), [pronto]);
  const clienteParam = params?.get('cliente') ?? null;
  const planoParam = params?.get('plano') ?? null;

  const reg = useMemo(() => (pronto ? meuRegistro() : null), [pronto]);
  const papel = papelDoUsuario();
  // Quem pode ver como o produtor vê: owner/admin, ou a bancada sem login.
  const podePrever = !authConfigurado || ehAdmin();
  const preview = papel !== 'produtor' && podePrever && !!clienteParam;

  // O vínculo do produtor vem do campo antigo (Dados) OU do IAM (Vínculos /
  // convite / aprovação) — ver lib/iam/vinculoProdutor.ts.
  const cliente = useMemo(() => {
    if (!pronto) return null;
    const id = preview ? clienteParam : clienteIdDoProdutor(reg);
    return id ? getClientes().find(c => c.id === id) ?? null : null;
  }, [pronto, preview, clienteParam, reg]);
  const plano = useMemo(() => planoPorId(preview ? (planoParam ?? undefined) : reg?.planoId), [preview, planoParam, reg]);

  if (!pronto) return null;

  if (papel !== 'produtor' && !preview) {
    if (podePrever) {
      return <EscolherProdutor onEscolher={(id, planoId) => router.replace(`/portal?cliente=${encodeURIComponent(id)}${planoId ? `&plano=${encodeURIComponent(planoId)}` : ''}`)}
        onVoltar={() => router.replace('/painel')} />;
    }
    return <Aviso titulo="Portal do Produtor" texto={`Este espaço é do produtor. Seu acesso é de ${papel ? ROTULO_PAPEL[papel] : 'outro tipo'} — use o painel principal.`}
      acao={{ label: 'Ir para o painel', onClick: () => router.replace('/painel') }} />;
  }
  if (!cliente) {
    if (preview) {
      return <Aviso titulo="Produtor não encontrado" texto="O id passado em ?cliente= não existe no cadastro."
        acao={{ label: 'Escolher outro', onClick: () => router.replace('/portal') }} />;
    }
    return <Aviso titulo="Acesso ainda não vinculado" texto="Seu acesso de produtor ainda não está ligado a um cliente. Peça ao escritório para vincular."
      acao={{ label: 'Sair', onClick: () => logout() }} />;
  }

  return <PainelProdutor cliente={cliente} plano={plano} papel={papel} preview={preview} />;
}

// Owner/admin (ou a bancada): qual produtor ver, e com qual plano.
function EscolherProdutor({ onEscolher, onVoltar }: { onEscolher: (id: string, planoId: string) => void; onVoltar: () => void }) {
  const clientes = useMemo(() => getClientes(), []);
  const planos = useMemo(() => getPlanos(), []);
  const [planoId, setPlanoId] = useState('');
  return (
    <div className="min-h-screen px-6 py-10" style={{ background: 'var(--bg-app)', color: 'var(--text-primary)' }}>
      <div className="max-w-lg mx-auto">
        <button onClick={onVoltar} className="flex items-center gap-1 text-xs font-semibold mb-4" style={{ color: 'var(--invicta-blue-mid)' }}>
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
