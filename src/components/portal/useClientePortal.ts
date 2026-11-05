'use client';

// Quem é o produtor do portal — resolvido UMA vez, no shell (app/portal/
// layout.tsx → shell/PortalShell), para todas as páginas do portal.
//
// · Produtor logado: o cliente vem do vínculo (campo antigo OU IAM — ver
//   lib/iam/vinculoProdutor.ts) e o plano do registro dele.
// · "Ver como o produtor vê" (owner/admin, ou a bancada sem login): o cliente
//   vem de ?cliente= e o plano de ?plano=; `qsPreview` carrega os dois para a
//   próxima página do portal manter o preview.
//
// Lê a URL por useSearchParams (reativo): o shell vive no layout, que NÃO
// remonta ao trocar de página nem ao escolher outro produtor — sem isto o
// cliente ficaria preso ao da primeira URL. Quem chama precisa estar dentro de
// um <Suspense> (o layout do portal já está).

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  meuRegistro, papelDoUsuario, planoPorId, ehAdmin, apresentacaoAtual, desligarApresentacao, ligarApresentacao,
  podeApresentarComoProdutor, type PlanoAssinatura, type PapelMembro,
} from '@/lib/empresa';
import { assinarApresentacao, estadoBruto } from '@/lib/modoApresentacao';
import { clienteIdDoProdutor } from '@/lib/iam/vinculoProdutor';
import { getClientes, type Cliente } from '@/lib/store';
import { authConfigurado } from '@/lib/auth';

// "Já está no navegador?" sem setState em efeito: no servidor é false, no
// cliente vira true depois da hidratação — e só então lemos o registro.
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
  const sp = useSearchParams();
  const clienteParam = pronto ? sp.get('cliente') : null;
  const planoParam = pronto ? sp.get('plano') : null;

  // Modo apresentação (lib/modoApresentacao.ts): o registro passa a ser o do
  // produtor apresentado — o portal abre como ele, sem ?cliente=.
  const bruto = useSyncExternalStore(assinarApresentacao, estadoBruto, () => '');
  const reg = useMemo(() => (pronto ? meuRegistro() : null), [pronto, bruto]); // eslint-disable-line react-hooks/exhaustive-deps
  const papel = papelDoUsuario();
  const podePrever = !authConfigurado || ehAdmin();
  const preview = papel !== 'produtor' && podePrever && !!clienteParam;

  // O preview ?cliente= de owner/admin ENTRA no modo apresentação: a partir
  // daí o /painel, o /talhao e o portal seguem como o produtor até o Sair da
  // faixa. Só grava a aba (sessionStorage), uma vez por cliente.
  const ligarPreview = pronto && !!clienteParam && podeApresentarComoProdutor();
  useEffect(() => {
    if (!ligarPreview || !clienteParam) return;
    const atual = apresentacaoAtual();
    // Mesmo cliente E mesmo plano: nada a fazer. Plano diferente no ?plano=
    // (ou sem ?plano= = todas as seções) religa com o plano pedido.
    if (atual?.clienteId === clienteParam && atual.planoId === (planoParam ?? null)) return;
    if (atual) desligarApresentacao();        // o cadastro volta a ser o do admin para achar o cliente
    const c = getClientes().find(x => x.id === clienteParam);
    if (c) ligarApresentacao({ id: c.id, nome: c.nome }, planoParam ?? null);
  }, [ligarPreview, clienteParam, planoParam]);

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
