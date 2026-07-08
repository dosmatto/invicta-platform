'use client';

// Manutenção administrativa: backup e limpeza da base OPERACIONAL, preservando a
// Biblioteca (inv_bib_*) e as referências (legendas/safras/padrões/empresa).
// Sem botão na UI (decisão do usuário) — roda no Console do navegador logado:
//   await invLimparBase('APAGAR TUDO')
// Exposto em window.invLimparBase pelo AppContext (só para admin).

import { cloudPushLista, cloudExcluirColecao } from '../cloud';
import { lerRawLocal } from '../localComprimido';

// Dados de TRABALHO (apagam). Tudo o mais fica: inv_bib_*, inv_legendas,
// inv_safras, inv_padroes_*, inv_lab_perfis, inv_empresas/ativa, inv_config,
// inv_etiqueta_cfg, inv_uid_local.
const LISTAS_OPERACIONAIS = [
  'inv_clientes', 'inv_fazendas', 'inv_talhoes',
  'inv_lab', 'inv_grades', 'inv_plantios', 'inv_compactacao',
];
const COLECOES_DOCS = ['inv_mapas_fert', 'inv_cenarios', 'inv_relatorios'];

// Baixa um JSON com TODA a base local (chaves inv_*) — rede de segurança antes
// de qualquer apagamento.
export function backupBase(): void {
  if (typeof window === 'undefined') return;
  const dump: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith('inv_')) continue;
    const raw = lerRawLocal(k);
    try { dump[k] = raw ? JSON.parse(raw) : null; } catch { dump[k] = raw; }
  }
  const blob = new Blob([JSON.stringify({ geradoEm: new Date().toISOString(), dados: dump }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `invicta-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Apaga a base OPERACIONAL (localStorage + nuvem Supabase), preservando a Biblioteca.
// Faz backup automático antes. Exige a frase exata para evitar acidente.
export async function limparBaseOperacional(confirmacao: string): Promise<void> {
  if (confirmacao !== 'APAGAR TUDO') {
    throw new Error('Confirmação inválida. Para apagar a base, rode no Console:  await invLimparBase("APAGAR TUDO")');
  }
  backupBase();
  for (const key of LISTAS_OPERACIONAIS) {
    localStorage.setItem(key, '[]');
    cloudPushLista(key, []); // cloudPushLista remove da nuvem os docs ausentes na lista nova ([])
  }
  for (const key of COLECOES_DOCS) {
    localStorage.removeItem(key);
    await cloudExcluirColecao(key);
  }
  // As coleções de docs (mapas/cenários/relatórios) já foram aguardadas acima.
  // Os deletes das listas vão por cloudPushLista (fire-and-forget) — dá folga
  // antes do reload p/ não cancelar requisições em andamento na nuvem.
  console.log('%c[invicta] Base operacional apagada. Biblioteca preservada. Recarregando…', 'color:#4ade80;font-weight:bold');
  setTimeout(() => location.reload(), 3000);
}
