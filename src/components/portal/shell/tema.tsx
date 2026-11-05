'use client';

// Tema do portal: claro, escuro ou o do sistema (padrão). A raiz do portal
// recebe data-tema e o styles/portal-tema.css redefine os tokens dentro dela.

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';

export type EscolhaTema = 'sistema' | 'claro' | 'escuro';
const CHAVE = 'inv_portal_tema';

interface TemaCtx { escolha: EscolhaTema; tema: 'claro' | 'escuro'; setEscolha: (e: EscolhaTema) => void }
const Ctx = createContext<TemaCtx>({ escolha: 'sistema', tema: 'claro', setEscolha: () => {} });
export const useTemaPortal = () => useContext(Ctx);

const QUERY = '(prefers-color-scheme: dark)';
function assinarSistema(cb: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
const sistemaEscuro = () => (typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(QUERY).matches);

function lerEscolha(): EscolhaTema {
  try { const v = localStorage.getItem(CHAVE); if (v === 'claro' || v === 'escuro' || v === 'sistema') return v; } catch { /* sem storage */ }
  return 'sistema';
}

export function TemaPortal({ children }: { children: (tema: 'claro' | 'escuro') => ReactNode }) {
  const escuroSistema = useSyncExternalStore(assinarSistema, sistemaEscuro, () => false);
  const [escolha, setEscolhaEstado] = useState<EscolhaTema>(() => (typeof window === 'undefined' ? 'sistema' : lerEscolha()));
  const tema: 'claro' | 'escuro' = escolha === 'sistema' ? (escuroSistema ? 'escuro' : 'claro') : escolha;
  const setEscolha = useCallback((e: EscolhaTema) => {
    try { localStorage.setItem(CHAVE, e); } catch { /* sem storage: só nesta tela */ }
    setEscolhaEstado(e);
  }, []);
  const valor = useMemo(() => ({ escolha, tema, setEscolha }), [escolha, tema, setEscolha]);
  return <Ctx.Provider value={valor}>{children(tema)}</Ctx.Provider>;
}
