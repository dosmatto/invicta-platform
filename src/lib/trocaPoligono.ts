'use client';

// Substituição do polígono de um talhão EXISTENTE (item 6 da especificação):
// a verificação considera SOMENTE o ciclo agrícola atual (a safra ATIVA da
// plataforma) — dados de ciclos anteriores nunca bloqueiam e permanecem
// vinculados à versão arquivada da geometria (talhao.geoVersoes, ver store.ts).
//
// Bloqueiam (se existirem no ciclo atual): cultura definida, grades e coletas
// de amostragem, análises de fertilidade, compactação (grades/leituras/
// processamentos), mapas de produtividade, composições de sensoriamento,
// medições de campo e recomendações/cenários (nuvem).
//
// NÃO bloqueiam: coleções ESTRUTURAIS sem dimensão de ciclo (condutividade,
// MDE/altimetria, zonas de manejo/MEAP) — ficam como estão, vinculadas à
// geometria da época. Sem safra ativa definida, a troca é livre (a nova
// geometria passa a valer para o próximo ciclo criado).

import {
  getSafras, getPlantio, getGrades, getImportacoesLab,
  getImportacoesCompactacao, getGradesCompactacao,
  getMapasProdutividade, getComposicoes,
} from './store';
import { getMedicoes } from './coleta';
import { listarCenarios } from './recomendacao/cenarios';
import { usarDadosSupabase } from './supabaseData';

export interface BloqueioCiclo { rotulo: string; qtd: number }

export interface VerificacaoTroca {
  ciclo: string | null;         // safra ativa verificada (null = nenhum ciclo ativo)
  bloqueios: BloqueioCiclo[];   // vazio = substituição liberada
  permitido: boolean;
}

// Coletas e leituras de campo ficam em chaves locais próprias (coleta.ts),
// fora do store — leitura direta, tolerante a ausência/corrupção.
function lerJsonLocal<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') as T[]; } catch { return []; }
}
type ItemCampo = { talhaoId?: string; safra?: string };

export async function verificarTrocaPoligono(talhaoId: string): Promise<VerificacaoTroca> {
  const ciclo = getSafras().find(s => s.ativa)?.nome ?? null;
  if (!ciclo) return { ciclo: null, bloqueios: [], permitido: true };

  const b: BloqueioCiclo[] = [];
  const add = (rotulo: string, qtd: number) => { if (qtd > 0) b.push({ rotulo, qtd }); };

  const cultura = getPlantio(talhaoId, ciclo);
  if (cultura) b.push({ rotulo: `cultura definida (${cultura})`, qtd: 1 });
  add('grade(s) de amostragem', getGrades(talhaoId, ciclo).length);
  add('coleta(s) de amostragem no campo',
    lerJsonLocal<ItemCampo>('inv_coletas').filter(c => c.talhaoId === talhaoId && c.safra === ciclo).length);
  add('análise(s) de fertilidade', getImportacoesLab(talhaoId, ciclo).length);
  add('grade(s) de compactação', getGradesCompactacao(talhaoId, ciclo).length);
  add('leitura(s) de compactação',
    lerJsonLocal<ItemCampo>('inv_leituras_compact').filter(l => l.talhaoId === talhaoId && l.safra === ciclo).length);
  add('processamento(s) de compactação', getImportacoesCompactacao(talhaoId, ciclo).length);
  add('mapa(s) de produtividade', getMapasProdutividade(talhaoId, ciclo).length);
  add('composição(ões) de sensoriamento', getComposicoes(talhaoId).filter(c => c.safra === ciclo).length);
  add('medição(ões) de campo', getMedicoes().filter(m => m.talhaoId === talhaoId && m.safra === ciclo).length);

  // Recomendações/cenários moram só na nuvem — sem conseguir consultar, não dá
  // para afirmar que o ciclo está vazio; a troca fica bloqueada por precaução.
  if (usarDadosSupabase()) {
    try {
      add('recomendação(ões)/cenário(s)', (await listarCenarios(talhaoId, ciclo)).length);
    } catch {
      b.push({ rotulo: 'não foi possível consultar as recomendações na nuvem (tente com internet)', qtd: 1 });
    }
  } else {
    b.push({ rotulo: 'sem conexão para verificar as recomendações do ciclo (tente com internet)', qtd: 1 });
  }

  return { ciclo, bloqueios: b, permitido: b.length === 0 };
}

// Mensagem no formato da especificação, com a lista resumida do que bloqueou.
export function mensagemBloqueioTroca(v: VerificacaoTroca): string {
  const itens = v.bloqueios.map(x => (x.qtd > 1 ? `${x.qtd} ${x.rotulo}` : x.rotulo)).join('; ');
  return `Não é possível substituir o polígono deste talhão porque ele já possui dados ou informações no ciclo atual: ${v.ciclo}. ` +
    `Encontrado: ${itens}. Remova ou transfira essas informações antes de alterar o polígono.`;
}

// Nota de sucesso (regra 11: exibir qual ciclo foi verificado).
export function notaCicloVerificado(v: VerificacaoTroca, versaoNova: number): string {
  return v.ciclo
    ? `Ciclo verificado: ${v.ciclo} — sem dados. Limite substituído (versão ${versaoNova}); o anterior ficou arquivado com o histórico.`
    : `Nenhum ciclo ativo definido — limite substituído (versão ${versaoNova}); o anterior ficou arquivado com o histórico.`;
}
