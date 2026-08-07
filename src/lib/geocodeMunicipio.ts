// Município REAL por localização (reverse geocoding OSM/Nominatim), com cache
// local. O mapa de visão geral do Início classifica os talhões pela POSIÇÃO
// (não pelo município digitado no cadastro, que vinha sujo: caixa diferente,
// vazio, strings multi-município). Também corrige o cadastro pela posição real.
import { getFazendas, updateFazendasLote, type TalhaoCentroide } from './store';

const CACHE_KEY = 'inv_geo_municipio';
const NOMINATIM = 'https://nominatim.openstreetmap.org/reverse';

// ~110 m de resolução: talhões muito próximos (mesma gleba) reusam 1 consulta,
// mas talhões perto de divisa municipal continuam distinguíveis.
export function coordKey(lng: number, lat: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

export function lerCache(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; }
}
function salvarCache(c: Record<string, string>) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); }
  catch (e) {
    // Falha silenciosa aqui fazia a classificação RE-RODAR inteira toda sessão
    // (cache nunca persistia). Ao menos deixa o problema visível no console.
    console.warn('[geocode] cache de municípios não persistiu (quota?):', e);
  }
}

// Município real de um ponto (só do cache; null se ainda não geocodificado).
export function municipioReal(lng: number, lat: number, cache = lerCache()): string | null {
  return cache[coordKey(lng, lat)] ?? null;
}

async function reverse(lng: number, lat: number, timeoutMs?: number): Promise<{ municipio: string; uf: string } | null> {
  // zoom=10 = nível de município. accept-language pt-BR p/ nomes em português.
  const url = `${NOMINATIM}?format=jsonv2&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1&accept-language=pt-BR`;
  // Com timeout quando alguém está ESPERANDO (geração de PDF): Nominatim fora
  // do ar não pode pendurar o relatório.
  const ctrl = timeoutMs ? new AbortController() : null;
  const t = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl?.signal });
    if (!r.ok) return null;
    const j = await r.json();
    const a = (j?.address ?? {}) as Record<string, string>;
    const municipio = a.municipality || a.city || a.town || a.village || a.county || '';
    const iso = a['ISO3166-2-lvl4'];                       // ex.: "BR-PR"
    return municipio ? { municipio, uf: iso?.startsWith('BR-') ? iso.slice(3) : '' } : null;
  } finally { if (t) clearTimeout(t); }
}

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

// Geocodifica os centroides ainda SEM cache (throttle ~1,2 s/req — política do
// Nominatim é ≤1 req/s), salvando a cada acerto. onTick a cada consulta.
export async function geocodarFaltantes(
  centroides: TalhaoCentroide[],
  onTick?: (feitos: number, total: number) => void,
): Promise<Record<string, string>> {
  const cache = lerCache();
  // 1 consulta por coordKey distinta ainda não resolvida
  const rep = new Map<string, TalhaoCentroide>();
  centroides.forEach(c => { const k = coordKey(c.lng, c.lat); if (!(k in cache) && !rep.has(k)) rep.set(k, c); });
  const chaves = Array.from(rep.keys());
  let feitos = 0;
  let desdeUltimaGravacao = 0;
  for (const k of chaves) {
    const c = rep.get(k)!;
    try {
      const m = await reverse(c.lng, c.lat);
      if (m) { cache[k] = m.municipio; desdeUltimaGravacao++; }
    } catch { /* rede indisponível — fica pendente p/ próxima sessão */ }
    // Persiste em LOTE (a cada 10 acertos e no final) — regravar o cache
    // inteiro a cada consulta era O(n²) ao longo da sessão.
    if (desdeUltimaGravacao >= 10) { salvarCache(cache); desdeUltimaGravacao = 0; }
    onTick?.(++feitos, chaves.length);
    if (feitos < chaves.length) await sleep(1200);
  }
  if (desdeUltimaGravacao > 0) salvarCache(cache);
  return cache;
}

// Corrige o cadastro: cada fazenda recebe o município REAL dominante entre seus
// talhões (pela posição). Fazendas que cruzam divisa ficam com o predominante.
// Só grava quando muda. Retorna quantas fazendas foram atualizadas.
export function corrigirCadastroMunicipios(centroides: TalhaoCentroide[], cache = lerCache()): number {
  const contagem = new Map<string, Record<string, number>>();
  for (const c of centroides) {
    const m = cache[coordKey(c.lng, c.lat)];
    if (!m) continue;
    const cont = contagem.get(c.fazendaId) ?? {};
    cont[m] = (cont[m] ?? 0) + 1;
    contagem.set(c.fazendaId, cont);
  }
  const fazendas = getFazendas();
  const atualizacoes: { id: string; data: { municipio: string } }[] = [];
  for (const [fid, cont] of contagem) {
    const dominante = Object.entries(cont).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!dominante) continue;
    const fz = fazendas.find(f => f.id === fid);
    if (fz && fz.municipio !== dominante) atualizacoes.push({ id: fid, data: { municipio: dominante } });
  }
  // LOTE: 1 gravação da lista (e 1 push) — antes eram N gravações completas.
  return updateFazendasLote(atualizacoes);
}

// Município para o RELATÓRIO, garantido em CASCATA (07/08/2026: os PDFs saíam
// com "—" ou " - PR" sempre que o cadastro da fazenda não tinha o campo, e o
// preenchimento só existia num botão manual que ninguém apertava):
//   1. cadastro   → o que o usuário digitou manda;
//   2. cache local → o mesmo que o mapa do Início já resolveu, instantâneo;
//   3. Nominatim  → uma ida à rede, com timeout curto p/ nunca travar o PDF.
// O que a rede descobrir volta gravado no cache E no cadastro: cada fazenda paga
// a consulta uma única vez, e as telas passam a mostrar o município também.
const TIMEOUT_GEOCODE_MS = 6000;

export async function municipioDaFazenda(
  fazendaId: string | null | undefined,
  ponto: { lng: number; lat: number } | null,
): Promise<{ municipio: string; estado: string }> {
  const fz = fazendaId ? getFazendas().find(f => f.id === fazendaId) : undefined;
  let estado = (fz?.estado ?? '').toUpperCase();
  const doCadastro = (fz?.municipio ?? '').trim();
  if (doCadastro) return { municipio: doCadastro, estado };
  if (!ponto || !Number.isFinite(ponto.lng) || !Number.isFinite(ponto.lat)) return { municipio: '', estado };

  const cache = lerCache();
  const doCache = municipioReal(ponto.lng, ponto.lat, cache);
  if (doCache) {
    if (fz) updateFazendasLote([{ id: fz.id, data: { municipio: doCache } }]);
    return { municipio: doCache, estado };
  }
  try {
    const r = await reverse(ponto.lng, ponto.lat, TIMEOUT_GEOCODE_MS);
    if (r) {
      cache[coordKey(ponto.lng, ponto.lat)] = r.municipio;
      salvarCache(cache);
      if (!estado && r.uf) estado = r.uf;
      if (fz) updateFazendasLote([{ id: fz.id, data: { municipio: r.municipio, ...(r.uf ? { estado: r.uf } : {}) } }]);
      return { municipio: r.municipio, estado };
    }
  } catch { /* sem rede ou timeout: o relatório sai com "—" em vez de travar */ }
  return { municipio: '', estado };
}

// Conveniência: quantos centroides ainda faltam geocodificar.
export function faltamGeocodar(centroides: TalhaoCentroide[], cache = lerCache()): number {
  const set = new Set<string>();
  centroides.forEach(c => { const k = coordKey(c.lng, c.lat); if (!(k in cache)) set.add(k); });
  return set.size;
}
