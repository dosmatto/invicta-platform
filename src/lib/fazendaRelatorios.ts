'use client';

// Descoberta de "o que existe" para os relatórios da FAZENDA inteira:
//   - quais ANOS têm dado (recomendações e/ou índices de satélite);
//   - quais CENAS (data + índice) de satélite existem em um ano.
//
// Por que existe: os botões de relatório da fazenda usavam a SAFRA ATIVA GLOBAL,
// sem o usuário indicar o ano — se a ativa não fosse a desejada, o relatório saía
// vazio/errado. Aqui o app DETECTA os anos com dado e deixa escolher.
//
// Cuidado com os dois mundos de data (ver src/lib/periodo.ts):
//   - Recomendação: campo `safra` (string legada, ex. "26/27") → anoDaSafra()
//   - Satélite/NDVI: NÃO tem safra; tem a DATA ISO da cena → anoDeData()
// A ponte entre eles é sempre o ANO (número).

import { getTalhoes } from './store';
import { anoDaSafra, anoDeData } from './periodo';
import { safrasComCenario } from './recomendacao/cenarios';
import { listarNdviSalvos, type NdviCamadaMeta } from './meap/gerar';

export interface AnoFazenda {
  ano: number;
  safras: string[];        // safras legadas daquele ano (ex.: ["26/27"]) — p/ chamar as libs existentes
  temRecomendacao: boolean;
  temSatelite: boolean;
}

const talhoesDaFazenda = (fazendaId: string) => getTalhoes().filter(t => t.fazendaId === fazendaId);

// Anos com dado na fazenda (união recomendação + satélite), mais recente primeiro.
export async function anosDaFazenda(fazendaId: string): Promise<AnoFazenda[]> {
  const ids = talhoesDaFazenda(fazendaId).map(t => t.id);
  if (ids.length === 0) return [];

  const [safras, listasNdvi] = await Promise.all([
    safrasComCenario(ids).catch(() => null),
    Promise.all(ids.map(id => listarNdviSalvos(id).catch(() => [] as NdviCamadaMeta[]))),
  ]);

  const porAno = new Map<number, AnoFazenda>();
  const obter = (ano: number): AnoFazenda => {
    let a = porAno.get(ano);
    if (!a) { a = { ano, safras: [], temRecomendacao: false, temSatelite: false }; porAno.set(ano, a); }
    return a;
  };

  for (const s of safras ?? []) {
    const ano = anoDaSafra(s);
    if (ano == null) continue;
    const a = obter(ano);
    a.temRecomendacao = true;
    if (!a.safras.includes(s)) a.safras.push(s);
  }
  for (const lista of listasNdvi) {
    for (const c of lista) {
      const ano = anoDeData(c.data);
      if (ano == null) continue;
      obter(ano).temSatelite = true;
    }
  }
  return [...porAno.values()].sort((a, b) => b.ano - a.ano);
}

// ── Cenas de satélite da fazenda em um ANO ──────────────────────────────────
export interface CamadaTalhao extends NdviCamadaMeta { talhaoId: string; talhaoNome: string; }
export interface CenaFazenda {
  data: string;              // ISO yyyy-mm-dd
  indices: string[];         // índices disponíveis nessa data (NDVI, NDRE…)
  nTalhoes: number;          // quantos talhões têm imagem nessa data
}
export interface SateliteFazenda {
  camadas: CamadaTalhao[];   // tudo do ano (para gerar depois, sem re-consultar)
  cenas: CenaFazenda[];      // agrupado por data, mais recente primeiro
  indices: string[];         // todos os índices do ano (para o seletor)
}

// Varre os talhões da fazenda e devolve as camadas de satélite do ANO indicado.
// Só metadados (KBs) — os rasters são baixados na hora de gerar o PDF.
export async function sateliteDaFazenda(fazendaId: string, ano: number): Promise<SateliteFazenda> {
  const talhoes = talhoesDaFazenda(fazendaId);
  const listas = await Promise.all(
    talhoes.map(t => listarNdviSalvos(t.id).catch(() => [] as NdviCamadaMeta[])),
  );

  const camadas: CamadaTalhao[] = [];
  talhoes.forEach((t, i) => {
    for (const c of listas[i]) {
      if (anoDeData(c.data) !== ano) continue;
      camadas.push({ ...c, talhaoId: t.id, talhaoNome: t.nome });
    }
  });

  const porData = new Map<string, { indices: Set<string>; talhoes: Set<string> }>();
  const indices = new Set<string>();
  for (const c of camadas) {
    indices.add(c.indice);
    let d = porData.get(c.data);
    if (!d) { d = { indices: new Set(), talhoes: new Set() }; porData.set(c.data, d); }
    d.indices.add(c.indice);
    d.talhoes.add(c.talhaoId);
  }

  const cenas: CenaFazenda[] = [...porData.entries()]
    .map(([data, d]) => ({ data, indices: [...d.indices].sort(), nTalhoes: d.talhoes.size }))
    .sort((a, b) => b.data.localeCompare(a.data));

  return { camadas, cenas, indices: [...indices].sort() };
}
