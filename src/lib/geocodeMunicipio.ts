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

async function reverse(lng: number, lat: number): Promise<string | null> {
  // zoom=10 = nível de município. accept-language pt-BR p/ nomes em português.
  const url = `${NOMINATIM}?format=jsonv2&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1&accept-language=pt-BR`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) return null;
  const j = await r.json();
  const a = j?.address ?? {};
  return a.municipality || a.city || a.town || a.village || a.county || null;
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
      if (m) { cache[k] = m; desdeUltimaGravacao++; }
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

// Conveniência: quantos centroides ainda faltam geocodificar.
export function faltamGeocodar(centroides: TalhaoCentroide[], cache = lerCache()): number {
  const set = new Set<string>();
  centroides.forEach(c => { const k = coordKey(c.lng, c.lat); if (!(k in cache)) set.add(k); });
  return set.size;
}
