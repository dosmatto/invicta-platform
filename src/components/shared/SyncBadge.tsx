'use client';

// Indicador discreto de sincronização — escuta os eventos globais disparados
// por supabaseData.ts ('inv:sync') e localComprimido.ts ('inv:quota-erro').
// Tudo OK -> não renderiza nada (sem poluição visual). Com pendência de sync
// -> dot âmbar + texto curto. Quota de localStorage estourada -> dot vermelho
// (tem prioridade sobre o âmbar).

import { useEffect, useState } from 'react';

// Nomes amigáveis das coleções mais comuns; as demais mostram a própria key.
const NOMES_COLECAO: Record<string, string> = {
  inv_talhoes: 'Talhões',
  inv_clientes: 'Produtores',
  inv_fazendas: 'Fazendas',
  inv_grades: 'Grades',
  inv_lab: 'Laudos',
};

function nomeAmigavel(key: string): string {
  return NOMES_COLECAO[key] ?? key;
}

// iconOnly: usado em locais estreitos (ex.: IconSidebar, 64px) — mostra só o
// dot colorido com title/tooltip, sem o texto ao lado.
export function SyncBadge({ iconOnly = false }: { iconOnly?: boolean } = {}) {
  const [pendentes, setPendentes] = useState<Set<string>>(new Set());
  const [quotaErro, setQuotaErro] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    function onSync(e: Event) {
      const { key, status } = (e as CustomEvent<{ key: string; status: 'ok' | 'erro' }>).detail;
      setPendentes(prev => {
        const next = new Set(prev);
        if (status === 'erro') next.add(key);
        else next.delete(key);
        return next;
      });
    }

    function onQuotaErro() {
      setQuotaErro(true);
    }

    window.addEventListener('inv:sync', onSync);
    window.addEventListener('inv:quota-erro', onQuotaErro);
    return () => {
      window.removeEventListener('inv:sync', onSync);
      window.removeEventListener('inv:quota-erro', onQuotaErro);
    };
  }, []);

  if (!quotaErro && pendentes.size === 0) return null;

  if (quotaErro) {
    const title = 'Armazenamento local do navegador cheio — libere espaço (ex.: limpe dados de outros sites) para os dados voltarem a salvar.';
    if (iconOnly) {
      return <span className="rounded-full flex-shrink-0" style={{ width: 6, height: 6, background: '#f87171' }} title={title} />;
    }
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] font-semibold"
        style={{ color: '#f87171' }}
        title={title}
      >
        <span className="rounded-full flex-shrink-0" style={{ width: 6, height: 6, background: '#f87171' }} />
        armazenamento cheio
      </span>
    );
  }

  const lista = [...pendentes].map(nomeAmigavel).join(', ');
  const title = `Pendente: ${lista}. Reenvio automático ao voltar a internet.`;
  if (iconOnly) {
    return <span className="rounded-full flex-shrink-0" style={{ width: 6, height: 6, background: '#fbbf24' }} title={title} />;
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-semibold"
      style={{ color: '#fbbf24' }}
      title={title}
    >
      <span className="rounded-full flex-shrink-0" style={{ width: 6, height: 6, background: '#fbbf24' }} />
      não sincronizado
    </span>
  );
}
