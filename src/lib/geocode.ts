'use client';

// Geocoding reverso via Nominatim (OpenStreetMap) — grátis, sem chave. Usado
// para preencher o município/UF da fazenda a partir do polígono dos talhões.
// Política do OSM: baixo volume, 1 req/s (sequenciamos com pausa), Referer do
// browser identifica a origem. Cache em memória evita repetir pontos próximos.

import { getTalhoes, type Talhao } from './store';

const cache = new Map<string, { municipio: string; uf: string } | null>();
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Nome do estado (OSM devolve por extenso) → sigla, fallback se faltar o ISO.
const UF_POR_NOME: Record<string, string> = {
  acre: 'AC', alagoas: 'AL', amapá: 'AP', amazonas: 'AM', bahia: 'BA', ceará: 'CE',
  'distrito federal': 'DF', 'espírito santo': 'ES', goiás: 'GO', maranhão: 'MA',
  'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG', pará: 'PA',
  paraíba: 'PB', paraná: 'PR', pernambuco: 'PE', piauí: 'PI', 'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN', 'rio grande do sul': 'RS', rondônia: 'RO', roraima: 'RR',
  'santa catarina': 'SC', 'são paulo': 'SP', sergipe: 'SE', tocantins: 'TO',
};
function ufDoNome(nome?: string): string {
  return nome ? (UF_POR_NOME[nome.trim().toLowerCase()] ?? '') : '';
}

export async function municipioPorCoordenada(lat: number, lon: number): Promise<{ municipio: string; uf: string } | null> {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`;
  try {
    const r = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } });
    if (!r.ok) { cache.set(key, null); return null; }
    const j = await r.json();
    const a = (j.address ?? {}) as Record<string, string>;
    const municipio = a.municipality || a.city || a.town || a.village || a.county || '';
    const iso = a['ISO3166-2-lvl4']; // ex.: "BR-PR"
    const uf = iso && iso.startsWith('BR-') ? iso.slice(3) : ufDoNome(a.state);
    const res = municipio ? { municipio, uf } : null;
    cache.set(key, res);
    return res;
  } catch { return null; }
}

// Ponto representativo do talhão (centro do bbox; senão do geojson).
function centroTalhao(t: Talhao): { lat: number; lon: number } | null {
  if (t.bbox) { const [w, s, e, n] = t.bbox; return { lat: (s + n) / 2, lon: (w + e) / 2 }; }
  if (t.geojson) {
    try {
      const obj = JSON.parse(t.geojson);
      let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity, achou = false;
      const visitar = (c: unknown) => {
        if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') {
          const lon = c[0] as number, lat = c[1] as number;
          if (lon < w) w = lon; if (lon > e) e = lon; if (lat < s) s = lat; if (lat > n) n = lat; achou = true;
        } else if (Array.isArray(c)) c.forEach(visitar);
      };
      const geoms = obj.type === 'FeatureCollection' ? obj.features.map((f: { geometry?: unknown }) => f.geometry)
        : obj.type === 'Feature' ? [obj.geometry] : [obj];
      geoms.forEach((g: { coordinates?: unknown } | null) => g?.coordinates && visitar(g.coordinates));
      if (achou) return { lat: (s + n) / 2, lon: (w + e) / 2 };
    } catch { /* ignora */ }
  }
  return null;
}

// Detecta os municípios distintos da fazenda a partir dos talhões com geometria.
// Sequencial com pausa (política do OSM); dedupe pontos próximos (~1 km).
export async function detectarMunicipiosFazenda(fazendaId: string): Promise<{ municipios: string[]; uf: string } | null> {
  const talhoes = getTalhoes(fazendaId);
  const pontos = new Map<string, { lat: number; lon: number }>();
  for (const t of talhoes) {
    const c = centroTalhao(t);
    if (c) pontos.set(`${c.lat.toFixed(2)},${c.lon.toFixed(2)}`, c); // ~1 km de grade
  }
  if (pontos.size === 0) return null;
  const municipios = new Set<string>();
  let uf = '';
  let primeiro = true;
  for (const p of pontos.values()) {
    if (!primeiro) await sleep(1100); // respeita 1 req/s
    primeiro = false;
    const r = await municipioPorCoordenada(p.lat, p.lon);
    if (r?.municipio) { municipios.add(r.municipio); if (!uf && r.uf) uf = r.uf; }
  }
  return municipios.size ? { municipios: [...municipios], uf } : null;
}
