'use client';

// Peças visuais da Central de Acessos. Extraídas para um lugar só porque a tela
// tem 11 abas — repetir estilo inline em cada uma (como fazia o painel antigo,
// 559 linhas) ficaria impossível de manter.

import type { ReactNode } from 'react';
import { statusInfo, type StatusIam } from '@/lib/iam/tipos';

export const COR = {
  fundo: '#061525', card: '#0b1d3a', borda: '#1a3a6b', bordaClara: '#2e5fa3',
  campo: '#0f2240', txt: '#e2e8f0', sub: '#94a3b8', fraco: '#64748b',
  azul: '#93c5fd', ok: '#4ade80', alerta: '#fbbf24', erro: '#f87171',
} as const;

export const campoSt = {
  background: COR.campo, color: COR.txt, border: `1px solid ${COR.bordaClara}`,
} as const;

// ── Abas (scroll horizontal — são 11) ───────────────────────────────────────
export function Abas<T extends string>({ abas, ativa, onChange }: {
  abas: Array<{ id: T; label: string; contagem?: number; destaque?: boolean }>;
  ativa: T; onChange: (id: T) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
      {abas.map(a => {
        const on = a.id === ativa;
        return (
          <button key={a.id} onClick={() => onChange(a.id)}
            className="px-2.5 py-1 rounded text-[10px] font-bold whitespace-nowrap flex items-center gap-1"
            style={{ background: on ? 'var(--invicta-blue-mid)' : COR.borda, color: on ? '#fff' : COR.fraco }}>
            {a.label}
            {a.contagem != null && a.contagem > 0 && (
              <span className="px-1 rounded-full text-[9px]"
                style={{ background: a.destaque ? COR.alerta : (on ? 'rgba(255,255,255,.25)' : '#0b1d3a'),
                         color: a.destaque ? '#422006' : (on ? '#fff' : COR.azul) }}>
                {a.contagem}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Selo de status ──────────────────────────────────────────────────────────
export function SeloStatus({ status }: { status?: StatusIam }) {
  const s = statusInfo(status);
  return (
    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold whitespace-nowrap"
      style={{ background: `${s.cor}22`, color: s.cor, border: `1px solid ${s.cor}55` }}>
      {s.nome}
    </span>
  );
}

// ── Cartão de usuário ───────────────────────────────────────────────────────
export function Cartao({ children, onClick, ativo }: {
  children: ReactNode; onClick?: () => void; ativo?: boolean;
}) {
  return (
    <div onClick={onClick}
      className={`rounded-lg p-2.5 space-y-1.5 ${onClick ? 'cursor-pointer' : ''}`}
      style={{ background: ativo ? '#0f2240' : COR.card,
               border: `1px solid ${ativo ? '#22d3ee' : COR.borda}` }}>
      {children}
    </div>
  );
}

export function Rotulo({ children }: { children: ReactNode }) {
  return <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: COR.fraco }}>{children}</span>;
}

export function Chip({ children, cor }: { children: ReactNode; cor?: string }) {
  return (
    <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold whitespace-nowrap"
      style={{ background: '#12305f', color: cor ?? COR.azul }}>{children}</span>
  );
}

export function Botao({ children, onClick, tom = 'neutro', disabled, titulo, pequeno }: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; titulo?: string;
  pequeno?: boolean; tom?: 'neutro' | 'ok' | 'perigo' | 'primario';
}) {
  const tons = {
    neutro:   { background: COR.borda, color: COR.azul },
    primario: { background: 'var(--invicta-blue-mid)', color: '#fff' },
    ok:       { background: 'var(--invicta-green-dark)', color: '#fff' },
    perigo:   { background: '#3a1a1a', color: '#fca5a5' },
  }[tom];
  return (
    <button onClick={onClick} disabled={disabled} title={titulo}
      className={`rounded font-bold disabled:opacity-40 whitespace-nowrap ${pequeno ? 'px-2 py-1 text-[9px]' : 'px-2.5 py-1.5 text-[10px]'}`}
      style={tons}>
      {children}
    </button>
  );
}

// ── Modal simples (o painel antigo usava window.confirm cru) ────────────────
export function Modal({ titulo, children, onFechar, largura = 'max-w-md' }: {
  titulo: string; children: ReactNode; onFechar: () => void; largura?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)' }} onClick={onFechar}>
      <div className={`w-full ${largura} rounded-xl flex flex-col`}
        style={{ background: COR.card, border: `1px solid ${COR.borda}`, maxHeight: '85vh' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-2.5 flex-shrink-0"
          style={{ borderBottom: `1px solid ${COR.borda}` }}>
          <p className="text-xs font-bold" style={{ color: COR.txt }}>{titulo}</p>
          <button onClick={onFechar} className="text-lg leading-none" style={{ color: COR.fraco }}>×</button>
        </div>
        <div className="px-4 py-3 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function Vazio({ texto }: { texto: string }) {
  return <p className="text-[11px] py-6 text-center" style={{ color: COR.fraco }}>{texto}</p>;
}

export const fmtData = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';
export const fmtDataHora = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
export function fmtRelativo(iso?: string): string {
  if (!iso) return 'nunca';
  const ms = Date.now() - Date.parse(iso);
  if (!isFinite(ms)) return '—';
  const dias = Math.floor(ms / 86400_000);
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 30) return `há ${dias} dias`;
  const meses = Math.floor(dias / 30);
  return meses < 12 ? `há ${meses} mês(es)` : `há ${Math.floor(meses / 12)} ano(s)`;
}
