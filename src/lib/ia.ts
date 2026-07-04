'use client';

// IA F1 — Diagnóstico Inteligente por Talhão (fluxo RAG da spec de IA).
//
// AQUI a plataforma monta o PACOTE DE CONTEXTO resumido (§9) com o que ela já
// tem — fertilidade, produtividade histórica, sensoriamento, EC, MDE, zonas —
// e manda pro backend (/ia-diagnostico), que guarda a chave e chama a OpenAI.
// O diagnóstico volta como JSON estruturado e é SALVO com o contexto para
// auditoria (§13); abrir a tela NUNCA chama a IA de novo (§14) — só o botão.

import {
  getTalhoes, getFazendas, getClientes, getPlantio, getImportacoesLab,
  getMapasProdutividade, getCondutividade, getMdes, getZoneamentosMeap,
  getImportacoesCompactacao, getComposicoes,
} from './store';
import { decodeGrid } from './fertilidade';
import { carregarNdviSalvos } from './meap/gerar';
import { postBackend } from './interpUrl';
import { salvarDocSupabase, carregarDocsPorCampoSupabase, usarDadosSupabase } from './supabaseData';
import { emailUsuario } from './empresa';

export interface RespostaIa {
  diagnostico_geral: string;
  potencial_do_talhao: 'alto' | 'medio' | 'baixo' | 'indefinido';
  principais_limitantes: string[];
  evidencias_tecnicas: string[];
  hipoteses_agronomicas: string[];
  oportunidades_de_manejo: string[];
  riscos: string[];
  dados_ausentes_relevantes: string[];
  nivel_de_confianca: 'alto' | 'medio' | 'baixo';
  justificativa_confianca: string;
  resumo_para_produtor: string;
  resumo_tecnico_interno: string;
}

export interface DiagnosticoIa {
  id: string;                     // `${talhaoId}__${safra||'geral'}`
  talhaoId: string;
  safra?: string;
  contexto: Record<string, unknown>;   // auditoria: exatamente o que a IA viu
  resposta: RespostaIa;
  modelo: string;
  tokensEntrada: number;
  tokensSaida: number;
  usuario?: string;
  criadoEm: string;
}

const COLECAO = 'inv_ia_diagnosticos';

// ── Pacote de contexto (§9): só o que EXISTE entra; o resto vira dados_ausentes ──
export async function montarContextoTalhao(talhaoId: string, safraNome?: string): Promise<Record<string, unknown>> {
  const t = getTalhoes().find(x => x.id === talhaoId);
  if (!t) throw new Error('talhão não encontrado');
  const faz = getFazendas().find(f => f.id === t.fazendaId);
  const cli = faz ? getClientes().find(c => c.id === faz.clienteId) : undefined;

  const ctx: Record<string, unknown> = {
    produtor: cli?.nome ?? null,
    fazenda: faz?.nome ?? null,
    talhao: t.nome,
    area_ha: t.areaHa,
    safra: safraNome || null,
    cultura_atual: (safraNome ? getPlantio(talhaoId, safraNome) : '') || null,
  };
  const ausentes: string[] = [];

  // Fertilidade: última importação de laudo → média por elemento na profundidade dominante.
  const lab = getImportacoesLab(talhaoId)[0];
  if (lab && lab.resultados?.length) {
    const porProf = new Map<string, number>();
    for (const r of lab.resultados) porProf.set(r.profundidade, (porProf.get(r.profundidade) ?? 0) + 1);
    const prof = [...porProf.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    const somas: Record<string, { s: number; n: number }> = {};
    for (const r of lab.resultados) {
      if (r.profundidade !== prof) continue;
      for (const [el, v] of Object.entries(r.valores)) {
        if (typeof v === 'number' && isFinite(v)) { (somas[el] ??= { s: 0, n: 0 }).s += v; somas[el].n++; }
      }
    }
    const medias: Record<string, number> = {};
    for (const [el, x] of Object.entries(somas)) medias[el] = Math.round((x.s / x.n) * 100) / 100;
    ctx.fertilidade = { profundidade: prof, n_amostras: porProf.get(prof) ?? 0, medias, safra_laudo: lab.safra };
  } else ausentes.push('fertilidade (laudo de solo)');

  // Produtividade histórica: mapas OFICIAIS por safra.
  const prods = getMapasProdutividade(talhaoId).filter(m => m.oficial);
  if (prods.length) {
    ctx.produtividade_historica = prods.map(m => ({
      safra: m.safra, cultura: m.cultura,
      media_kg_ha: Math.round(m.stats.mediaKgha), cv_pct: m.stats.cv,
    }));
  } else ausentes.push('produtividade (mapas de colheita)');

  // Sensoriamento: índice mais recente mantido + composições temporais aprovadas.
  try {
    const cenas = await carregarNdviSalvos(talhaoId);
    const ndvi = cenas.filter(c => c.indice === 'NDVI');
    if (ndvi.length) {
      const ult = ndvi[0]; // já vem mais recente primeiro
      const { valores } = decodeGrid({ b64: ult.b64, shape: ult.shape });
      let s = 0, n = 0, mn = Infinity, mx = -Infinity;
      for (let i = 0; i < valores.length; i++) { const v = valores[i]; if (isFinite(v)) { s += v; n++; if (v < mn) mn = v; if (v > mx) mx = v; } }
      ctx.sensoriamento = {
        ndvi_data: ult.data,
        ndvi_medio: n ? Math.round((s / n) * 100) / 100 : null,
        ndvi_min: n ? Math.round(mn * 100) / 100 : null,
        ndvi_max: n ? Math.round(mx * 100) / 100 : null,
        n_cenas_mantidas: cenas.length,
      };
    } else ausentes.push('NDVI/índices de satélite');
  } catch { ausentes.push('NDVI/índices de satélite'); }
  const comps = getComposicoes(talhaoId).filter(c => c.aprovada);
  if (comps.length) {
    ctx.composicoes_temporais = comps.map(c => ({ nome: c.nome, indice: c.indice, metodo: c.metodo, datas: c.datas.length, pct_validos: c.pctValidos }));
  }

  // Condutividade elétrica: versão oficial → média da profundidade oficial.
  const ec = getCondutividade(talhaoId).find(l => l.oficial);
  if (ec) {
    const prof = ec.profundidadeOficial ?? ec.profundidades[0];
    let s = 0, n = 0;
    for (const p of ec.pontos) { const v = p.valores[prof]; if (typeof v === 'number' && isFinite(v)) { s += v; n++; } }
    ctx.condutividade_eletrica = { disponivel: true, profundidade: prof, ce_media: n ? Math.round((s / n) * 10) / 10 : null, n_pontos: n };
  } else ausentes.push('condutividade elétrica');

  // Altimetria/MDE oficial.
  const mde = getMdes(talhaoId).find(m => m.oficial);
  if (mde) {
    ctx.altimetria = {
      fonte: mde.rotuloFonte, altitude_media_m: mde.stats.alt_med,
      amplitude_m: mde.stats.amplitude, declividade_media_graus: mde.stats.decl_media,
    };
  } else ausentes.push('altimetria/MDE');

  // Zonas de manejo (zoneamento padrão).
  const zon = getZoneamentosMeap(talhaoId).find(z => z.padrao);
  if (zon) {
    ctx.zonas_manejo = { disponivel: true, numero_zonas: zon.meta.nZonas, cv_medio_pct: zon.meta.cvMedio ?? null, camadas_usadas: zon.meta.camadas };
  } else ausentes.push('zonas de manejo');

  // Compactação (penetrometria) — qualquer safra.
  const comp = getImportacoesCompactacao(talhaoId)[0];
  if (comp) ctx.compactacao = { disponivel: true, safra: comp.safra, n_pontos: comp.pontos.length, profundidades: comp.profundidades };
  else ausentes.push('compactação (penetrometria)');

  ctx.dados_ausentes = ausentes;
  return ctx;
}

// ── Gerar (chama a IA via backend) + salvar p/ auditoria ─────────────────────
export async function gerarDiagnostico(talhaoId: string, safraNome?: string): Promise<DiagnosticoIa> {
  const contexto = await montarContextoTalhao(talhaoId, safraNome);
  const r = await postBackend('/ia-diagnostico', { contexto, tipo_analise: 'diagnostico_integrado' });
  if (r.status === 404) throw new Error('O servidor ainda não tem o módulo de IA — deve estar sendo atualizado. Tente em alguns minutos.');
  if (!r.ok) {
    let msg = `Backend respondeu ${r.status}`;
    try { const j = await r.json(); if (j?.detail) msg = String(j.detail); } catch {}
    throw new Error(msg);
  }
  const j = await r.json() as { resposta: RespostaIa; modelo: string; tokens_entrada: number; tokens_saida: number };
  const diag: DiagnosticoIa = {
    id: `${talhaoId}__${safraNome || 'geral'}`,
    talhaoId, safra: safraNome || undefined,
    contexto, resposta: j.resposta,
    modelo: j.modelo, tokensEntrada: j.tokens_entrada, tokensSaida: j.tokens_saida,
    usuario: emailUsuario() || undefined,
    criadoEm: new Date().toISOString(),
  };
  if (usarDadosSupabase()) {
    try { await salvarDocSupabase(COLECAO, diag.id, diag); } catch { /* offline: segue só em tela */ }
  }
  return diag;
}

// Carrega o diagnóstico SALVO (não chama a IA — §14).
export async function carregarDiagnostico(talhaoId: string, safraNome?: string): Promise<DiagnosticoIa | null> {
  if (!usarDadosSupabase()) return null;
  try {
    const docs = await carregarDocsPorCampoSupabase<DiagnosticoIa>(COLECAO, 'talhaoId', talhaoId);
    const alvo = `${talhaoId}__${safraNome || 'geral'}`;
    return docs.find(d => d.id === alvo) ?? docs.sort((a, b) => (b.criadoEm ?? '').localeCompare(a.criadoEm ?? ''))[0] ?? null;
  } catch { return null; }
}
