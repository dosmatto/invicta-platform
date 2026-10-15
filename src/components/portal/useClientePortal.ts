'use client';

// Quem é o produtor desta página do portal — a mesma resposta para /portal e
// para as páginas irmãs (ex.: /portal/nutrientes). Era o miolo de
// app/portal/page.tsx; virou hook para não ser copiado.
//
// · Produtor logado: o cliente vem do vínculo (campo antigo OU IAM — ver
//   lib/iam/vinculoProdutor.ts) e o plano do registro dele.
// · "Ver como o produtor vê" (owner/admin, ou a bancada sem login): o cliente
//   vem de ?cliente= e o plano de ?plano=; `qsPreview` carrega os dois para a
//   próxima página do portal manter o preview.

import { useMemo, useSyncExternalStore } from 'react';
import { meuRegistro, papelDoUsuario, planoPorId, ehAdmin, type PlanoAssinatura, type PapelMembro } from '@/lib/empresa';
import { clienteIdDoProdutor } from '@/lib/iam/vinculoProdutor';
import { getClientes, type Cliente } from '@/lib/store';
import { authConfigurado } from '@/lib/auth';

// "Já está no navegador?" sem setState em efeito: no servidor é false, no
// cliente vira true depois da hidratação — e só então lemos a URL e o registro.
const semAssinatura = () => () => {};

export interface ClientePortal {
  pronto: boolean;
  papel: PapelMembro | null;
  /** Owner/admin ou bancada sem login: pode escolher um produtor para ver. */
  podePrever: boolean;
  /** Está vendo como o produtor veria (com ?cliente=). */
  preview: boolean;
  clienteParam: string | null;
  planoParam: string | null;
  cliente: Cliente | null;
  plano: PlanoAssinatura | null;
  /** Query string que mantém o preview ao navegar entre as páginas do portal ('' fora do preview). */
  qsPreview: string;
}

export function useClientePortal(): ClientePortal {
  const pronto = useSyncExternalStore(semAssinatura, () => true, () => false);
  const params = useMemo(() => (pronto ? new URLSearchParams(window.location.search) : null), [pronto]);
  const clienteParam = params?.get('cliente') ?? null;
  const planoParam = params?.get('plano') ?? null;

  const reg = useMemo(() => (pronto ? meuRegistro() : null), [pronto]);
  const papel = papelDoUsuario();
  const podePrever = !authConfigurado || ehAdmin();
  const preview = papel !== 'produtor' && podePrever && !!clienteParam;

  const cliente = useMemo(() => {
    if (!pronto) return null;
    const id = preview ? clienteParam : clienteIdDoProdutor(reg);
    return id ? getClientes().find(c => c.id === id) ?? null : null;
  }, [pronto, preview, clienteParam, reg]);
  const plano = useMemo(() => planoPorId(preview ? (planoParam ?? undefined) : reg?.planoId), [preview, planoParam, reg]);
  const qsPreview = preview && clienteParam
    ? `?cliente=${encodeURIComponent(clienteParam)}${planoParam ? `&plano=${encodeURIComponent(planoParam)}` : ''}`
    : '';

  return { pronto, papel, podePrever, preview, clienteParam, planoParam, cliente, plano, qsPreview };
}
