// IA F4 — Motor de Regras Agronômicas (§17) + Score de Qualidade dos dados (§16).
//
// DETERMINÍSTICO e PURO (testável em Node, ZERO custo de IA): recebe o pacote de
// contexto do talhão (o mesmo do diagnóstico) e devolve sinais agronômicos já
// classificados + um score de completude dos dados. Os sinais ALIMENTAM a IA
// (evidências pré-classificadas, §17) e também aparecem na tela de graça.

export type TipoSinal = 'limitante' | 'risco' | 'oportunidade';

export interface SinalAgronomico {
  codigo: string;
  tipo: TipoSinal;
  texto: string;
}

export type NivelQualidade = 'alto' | 'medio' | 'baixo';

export interface QualidadeDados {
  nivel: NivelQualidade;
  temFertilidade: boolean;
  temProdutividade: boolean;
  temEspacial: boolean;         // ≥1 dado espacial complementar (NDVI/EC/MDE/zonas)
  motivos: string[];            // o que pesou (p/ exibir + justificar a confiança)
}

export interface AvaliacaoRegras {
  sinais: SinalAgronomico[];
  qualidade: QualidadeDados;
}

type Medias = Record<string, number> | undefined;

// Busca um elemento por id/alias (case-insensitive) no mapa de médias do laudo.
function pega(m: Medias, ...aliases: string[]): number | null {
  if (!m) return null;
  const chaves = Object.keys(m);
  for (const a of aliases) {
    const k = chaves.find(c => c.toLowerCase() === a.toLowerCase());
    if (k != null && typeof m[k] === 'number' && isFinite(m[k])) return m[k];
  }
  return null;
}

function cv(vals: number[]): number | null {
  const v = vals.filter(x => typeof x === 'number' && isFinite(x));
  if (v.length < 2) return null;
  const media = v.reduce((a, b) => a + b, 0) / v.length;
  if (media === 0) return null;
  const varp = v.reduce((a, b) => a + (b - media) ** 2, 0) / v.length;
  return (Math.sqrt(varp) / Math.abs(media)) * 100;
}

interface CtxRegras {
  fertilidade?: { medias?: Medias };
  produtividade_historica?: { media_kg_ha?: number }[];
  sensoriamento?: { ndvi_medio?: number | null };
  condutividade_eletrica?: unknown;
  altimetria?: unknown;
  zonas_manejo?: unknown;
}

export function avaliarRegras(ctx: CtxRegras): AvaliacaoRegras {
  const sinais: SinalAgronomico[] = [];
  const m = ctx.fertilidade?.medias;

  // Bases canônicas em mmolc/dm³ (padrão da plataforma), V% em %, pH em CaCl2.
  const v = pega(m, 'v', 'v_percent', 'sat_bases', 'saturacao_bases');
  const ph = pega(m, 'ph', 'ph_cacl2', 'phcacl2');
  const al = pega(m, 'al', 'al_mmolc');
  const k = pega(m, 'k', 'k_mmolc');
  const ctc = pega(m, 'ctc', 'ctc_mmolc', 't', 'ctc_ph7');
  let kCtc = pega(m, 'k_ctc', 'k_ctc_percent', 'k_percent');
  if (kCtc == null && k != null && ctc != null && ctc > 0) kCtc = (k / ctc) * 100;

  // §17 — regras determinísticas.
  if (kCtc != null && kCtc < 2) sinais.push({ codigo: 'k_baixo', tipo: 'limitante', texto: `K na CTC de ${kCtc.toFixed(1)}% (< 2%) — possível limitação de potássio.` });
  if (v != null && v < 50) sinais.push({ codigo: 'v_baixo', tipo: 'limitante', texto: `V% de ${v.toFixed(0)}% (< 50%) — atenção à correção de acidez.` });
  if (ph != null && ph < 5.0 && al != null && al >= 5) sinais.push({ codigo: 'toxidez_al', tipo: 'risco', texto: `pH ${ph.toFixed(1)} com Al ${al.toFixed(1)} mmolc/dm³ — risco de toxidez por alumínio.` });

  const ndvi = ctx.sensoriamento?.ndvi_medio;
  if (typeof ndvi === 'number' && isFinite(ndvi) && ndvi < 0.5) sinais.push({ codigo: 'ndvi_baixo', tipo: 'risco', texto: `NDVI médio de ${ndvi.toFixed(2)} (baixo) — investigar zona de menor vigor.` });

  const prods = (ctx.produtividade_historica ?? []).map(p => p.media_kg_ha).filter((x): x is number => typeof x === 'number');
  const cvProd = cv(prods);
  if (cvProd != null && cvProd > 20) sinais.push({ codigo: 'prod_instavel', tipo: 'risco', texto: `Produtividade oscila ${cvProd.toFixed(0)}% entre safras — instabilidade produtiva.` });

  const fertBoa = (v != null && v >= 60) && (kCtc != null && kCtc >= 3);
  if (fertBoa && prods.length > 0 && (cvProd == null || cvProd <= 15)) {
    sinais.push({ codigo: 'alto_potencial', tipo: 'oportunidade', texto: 'Fertilidade boa (V% e K adequados) com produtividade estável — zona de alto potencial.' });
  }

  // §16 — Score de qualidade dos dados.
  const temFertilidade = !!m && Object.keys(m).length > 0;
  const temProdutividade = prods.length > 0;
  const temNdvi = (typeof ndvi === 'number' && isFinite(ndvi));
  const temEspacial = temNdvi || ctx.condutividade_eletrica != null || ctx.altimetria != null || ctx.zonas_manejo != null;
  const motivos: string[] = [];
  if (temFertilidade) motivos.push('fertilidade disponível');
  if (temProdutividade) motivos.push(`${prods.length} safra(s) de produtividade`);
  const espaciais = [temNdvi && 'NDVI', ctx.condutividade_eletrica != null && 'condutividade', ctx.altimetria != null && 'relevo', ctx.zonas_manejo != null && 'zonas'].filter(Boolean);
  if (espaciais.length) motivos.push(`dados espaciais: ${espaciais.join(', ')}`);

  let nivel: NivelQualidade;
  if (temFertilidade && temProdutividade && temEspacial) nivel = 'alto';
  else if (temFertilidade && (temProdutividade || temEspacial)) nivel = 'medio';
  else nivel = 'baixo';
  if (!temProdutividade) motivos.push('sem produtividade histórica');
  if (!temFertilidade) motivos.push('sem laudo de fertilidade');

  return { sinais, qualidade: { nivel, temFertilidade, temProdutividade, temEspacial, motivos } };
}
