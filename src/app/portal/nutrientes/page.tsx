'use client';

// Portal do Produtor → Evolução dos nutrientes (página própria, 15/10/2026).
// O cartão do painel mostra UM talhão por vez; aqui são TODOS os talhões do
// produtor numa tabela por ano, um nutriente de cada vez. Mesmo acesso do
// /portal (hook useClientePortal): produtor logado, ou owner/admin em
// "ver como o produtor vê" (?cliente=&plano=). Sem acesso, volta ao /portal.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useClientePortal } from '@/components/portal/useClientePortal';
import { EvolucaoNutrientesPagina } from '@/components/portal/EvolucaoNutrientesPagina';

export default function NutrientesPage() {
  const router = useRouter();
  const { pronto, papel, preview, cliente, plano, qsPreview } = useClientePortal();
  const semAcesso = pronto && ((papel !== 'produtor' && !preview) || !cliente);
  useEffect(() => { if (semAcesso) router.replace('/portal'); }, [semAcesso, router]);
  if (!pronto || !cliente || semAcesso) return null;
  return <EvolucaoNutrientesPagina cliente={cliente} plano={plano} preview={preview} qsPreview={qsPreview} />;
}
