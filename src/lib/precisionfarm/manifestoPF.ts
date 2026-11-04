// Integração PrecisionFarm — MANIFESTO de vínculos propostos pela PF (ex.:
// FIGUEIRA_VINCULOS_PROPOSTOS.json do complemento de 28/10): leitura, casamento
// por GEOMETRIA contra os nossos talhões e a conferência que o servidor refaz
// antes de criar os vínculos. Núcleo PURO (turf + matemática; sem rede, sem
// store, sem node:*): roda no navegador (prévia), no servidor (criação) e no
// teste em Node (imports com `.ts`).
//
// Decisões do usuário (ledger pf-lote, Q4/Q5):
//   • formato: `fields[]` com local_field_id, name, shared_producer_id,
//     shared_farm_id, shared_field_id e boundary_file (ou a geometria no
//     próprio item);
//   • para cada talhão da PF: o NOSSO de maior sobreposição e a diferença
//     simétrica em % (a mesma conta da comparação de limite, compararLimite);
//   • PRÉ-MARCA o par 1:1 com diferença ≤ 5 %; talhão da PF que cobre dois ou
//     mais dos nossos com sobreposição relevante é AMBÍGUO e não pode ser
//     criado; o usuário marca/desmarca; os vínculos nascem PENDENTES com os
//     UUIDs da PF e o ID PF (local_field_id) preenchido.
// Duplicata (talhão ou shared_field_id já vinculado) é recusada com o motivo —
// aqui na prévia e de novo no servidor (validarCriacao), que é quem vale.

import turfIntersect from '@turf/intersect';
import { feature, featureCollection } from '@turf/helpers';
import { areaM2Geo } from '../areaGeo.ts';
import { compararLimites, geometriaDoTalhao } from './compararLimite.ts';
import { lerGeometriaLimite, type GeometriaLimite } from './limiteGeometria.ts';

/** Mesmo RE_UUID de contrato.ts (que tem node:crypto e não entra no navegador). */
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Par 1:1 com diferença simétrica até isto (% da área do nosso) é pré-marcado. */
export const LIMIAR_PAR_PCT = 5;
/** Sobreposição RELEVANTE (para "ambíguo"): o talhão da PF cobre ao menos esta
 *  fração do NOSSO talhão E a interseção é ao menos esta fração do talhão da
 *  PF. A borda vizinha que entra numa diferença de 0,03–3 % não chega perto; um
 *  talhão da PF que junta dois dos nossos (IGEFI11 da PF = nossos 10 + 11)
 *  cobre quase todo cada um. A 2ª condição evita que uma ilha pequena nossa
 *  dentro do talhão da PF o torne ambíguo. */
export const COBERTURA_RELEVANTE = 0.25;
export const FRACAO_PF_RELEVANTE = 0.05;
/** Teto de itens por manifesto / por pedido de criação. */
export const MAX_CAMPOS_MANIFESTO = 500;

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');

// ── Leitura do manifesto ─────────────────────────────────────────────────────

export interface CampoManifesto {
  /** local_field_id da PF (número lá) → texto, como o pf_local_id do vínculo. */
  pfLocalId: string;
  nome: string;
  sharedProducerId: string;
  sharedFarmId: string;
  sharedFieldId: string;
  /** boundary_file (caminho dentro do zip) — null se a geometria veio no item. */
  arquivoLimite: string | null;
  /** boundary_sha256 do arquivo, quando a PF manda (conferido na tela). */
  sha256: string | null;
  /** Geometria no próprio item (geometry/boundary/geojson), se houver. */
  geometriaNoItem: unknown;
  /** identity_status da PF (informativo). */
  statusPF: string | null;
  /** Defeito do item (UUID inválido, sem ID, repetido…) — não pode ser criado. */
  problema: string | null;
}

export type LeituraManifesto = { ok: true; campos: CampoManifesto[] } | { ok: false; erro: string };

/** Lê o manifesto (objeto ou texto JSON). Defeito de UM item marca só ele. */
export function lerManifestoPF(json: unknown): LeituraManifesto {
  let m = json;
  if (typeof m === 'string') {
    try { m = JSON.parse(m); } catch { return { ok: false, erro: 'O manifesto não é um JSON válido.' }; }
  }
  if (!ehObjeto(m) || !Array.isArray(m.fields)) return { ok: false, erro: 'O manifesto não tem a lista "fields" (formato do FIGUEIRA_VINCULOS_PROPOSTOS.json).' };
  if (!m.fields.length) return { ok: false, erro: 'O manifesto não traz nenhum talhão em "fields".' };
  if (m.fields.length > MAX_CAMPOS_MANIFESTO) return { ok: false, erro: `O manifesto traz ${m.fields.length} talhões; o limite por importação é ${MAX_CAMPOS_MANIFESTO}.` };

  const campos = m.fields.map((f, k): CampoManifesto => {
    const o = ehObjeto(f) ? f : {};
    const uuid = (v: unknown) => texto(v).toLowerCase();
    const c: CampoManifesto = {
      pfLocalId: texto(o.local_field_id).slice(0, 200),
      nome: texto(o.name) || `item ${k + 1}`,
      sharedProducerId: uuid(o.shared_producer_id),
      sharedFarmId: uuid(o.shared_farm_id),
      sharedFieldId: uuid(o.shared_field_id),
      arquivoLimite: texto(o.boundary_file) || null,
      sha256: texto(o.boundary_sha256).toLowerCase() || null,
      geometriaNoItem: o.geometry ?? o.boundary ?? o.geojson ?? null,
      statusPF: texto(o.identity_status) || null,
      problema: null,
    };
    const falta: string[] = [];
    if (!ehObjeto(f)) c.problema = 'Item do manifesto não é um objeto.';
    else if (!c.pfLocalId) c.problema = 'Sem local_field_id (o ID do talhão na PrecisionFarm).';
    else {
      if (!RE_UUID.test(c.sharedProducerId)) falta.push('shared_producer_id');
      if (!RE_UUID.test(c.sharedFarmId)) falta.push('shared_farm_id');
      if (!RE_UUID.test(c.sharedFieldId)) falta.push('shared_field_id');
      if (falta.length) c.problema = `UUID ausente ou inválido: ${falta.join(', ')}.`;
      else if (!c.arquivoLimite && c.geometriaNoItem == null) c.problema = 'Sem limite (boundary_file ou geometria no item).';
    }
    return c;
  });
  // Repetidos DENTRO do manifesto: nenhum dos dois entra (não há como saber qual vale).
  const marcarRepetidos = (chave: (c: CampoManifesto) => string, rotulo: string) => {
    const conta = new Map<string, number>();
    for (const c of campos) if (chave(c)) conta.set(chave(c), (conta.get(chave(c)) ?? 0) + 1);
    for (const c of campos) if (!c.problema && (conta.get(chave(c)) ?? 0) > 1) c.problema = `${rotulo} repetido no manifesto.`;
  };
  marcarRepetidos(c => c.sharedFieldId, 'shared_field_id');
  marcarRepetidos(c => c.pfLocalId, 'local_field_id');
  return { ok: true, campos };
}

/** Caminho do zip ↔ boundary_file: exato, senão pelo nome do arquivo (o
 *  usuário pode ter mandado os .geojson soltos, sem a pasta). */
export function acharArquivo<T>(arquivos: ReadonlyMap<string, T>, caminho: string): T | null {
  const norm = (s: string) => s.replace(/\\/g, '/').replace(/^\.?\//, '');
  const alvo = norm(caminho);
  for (const [k, v] of arquivos) if (norm(k) === alvo) return v;
  const base = alvo.split('/').pop()!.toLowerCase();
  const porNome = [...arquivos].filter(([k]) => norm(k).split('/').pop()!.toLowerCase() === base);
  return porNome.length === 1 ? porNome[0][1] : null;
}

/** Limite do item: lido e VALIDADO (a mesma leitura estrita do limite da PF —
 *  nada é consertado). `conteudo` = texto do arquivo, ou null se não veio. */
export function limiteDoCampo(c: CampoManifesto, conteudo: string | null, sha256DoConteudo: string | null):
  { ok: true; geometria: GeometriaLimite } | { ok: false; erro: string } {
  let fonte: unknown = c.geometriaNoItem;
  if (fonte == null) {
    if (conteudo == null) return { ok: false, erro: `Arquivo do limite não encontrado: ${c.arquivoLimite}.` };
    if (c.sha256 && sha256DoConteudo && c.sha256 !== sha256DoConteudo) {
      return { ok: false, erro: `O arquivo ${c.arquivoLimite} não é o do manifesto (SHA-256 diferente).` };
    }
    fonte = conteudo;
  }
  const g = lerGeometriaLimite(fonte);
  return g.ok ? { ok: true, geometria: g.geometria } : { ok: false, erro: g.erro };
}

// ── Casamento por geometria ──────────────────────────────────────────────────

export interface TalhaoParaCasar {
  id: string;
  nome: string;
  fazendaId: string | null;
  clienteId: string | null;
  bbox?: [number, number, number, number] | null;
  /** Talhao.geojson (texto). */
  geojson: string | null | undefined;
}

export interface VinculoExistente {
  talhaoId: string;
  sharedProducerId: string;
  sharedFarmId: string;
  sharedFieldId: string;
  status: string;
  fazendaId: string | null;
  clienteId: string | null;
}

export interface Candidato {
  talhaoId: string;
  nome: string;
  fazendaId: string | null;
  intersecaoM2: number;
  /** % do NOSSO talhão dentro do da PF. */
  coberturaPct: number;
  /** Só no melhor (comparação completa); null nos demais. */
  difSimM2: number | null;
  /** Diferença simétrica em % da área do nosso (compararLimites). */
  difSimPct: number | null;
}

export type SituacaoCasamento = 'par' | 'diferente' | 'ambiguo' | 'sem-par' | 'ja-vinculado' | 'conflito' | 'invalido';

export interface Casamento {
  campo: CampoManifesto;
  areaPfHa: number | null;
  /** Nosso talhão de maior sobreposição. */
  melhor: Candidato | null;
  /** Demais com sobreposição relevante (ambíguo quando houver). */
  outrosRelevantes: Candidato[];
  situacao: SituacaoCasamento;
  motivo: string | null;
  preMarcado: boolean;
  podeCriar: boolean;
}

type Caixa = [number, number, number, number];

function caixaDe(g: GeometriaLimite): Caixa {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) for (const [x, y] of p[0]) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}
const cruzam = (a: Caixa, b: Caixa) => !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);

const fmtPct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: v < 1 ? 2 : 1 })}%`;

/**
 * Conflito de IDs de produtor/fazenda com os vínculos que JÁ existem (e com os
 * que vêm antes no mesmo lote): a mesma regra de reuso do "Gerar
 * identificadores" (idsParaNovoVinculo) — uma fazenda nossa tem UM
 * shared_farm_id, um cliente nosso tem UM shared_producer_id. Manifesto que
 * propõe outro UUID para a mesma fazenda/cliente criaria duas identidades.
 */
export function conflitoDeIds(
  a: { fazendaId: string | null; clienteId: string | null; sharedFarmId: string; sharedProducerId: string },
  vinculos: readonly Pick<VinculoExistente, 'fazendaId' | 'clienteId' | 'sharedFarmId' | 'sharedProducerId'>[],
): string | null {
  const daFazenda = a.fazendaId ? vinculos.find(v => v.fazendaId === a.fazendaId && v.sharedFarmId !== a.sharedFarmId) : undefined;
  if (daFazenda) return `A fazenda deste talhão já tem vínculo com outro shared_farm_id (${daFazenda.sharedFarmId}); o manifesto traz ${a.sharedFarmId}.`;
  const doCliente = a.clienteId ? vinculos.find(v => v.clienteId === a.clienteId && v.sharedProducerId !== a.sharedProducerId) : undefined;
  if (doCliente) return `O cliente deste talhão já tem vínculo com outro shared_producer_id (${doCliente.sharedProducerId}); o manifesto traz ${a.sharedProducerId}.`;
  return null;
}

/**
 * Casa cada talhão da PF com os nossos. `limites` = geometria validada de cada
 * campo (mesma ordem de `campos`) ou o erro de leitura.
 */
export function casarManifesto(
  campos: readonly CampoManifesto[],
  limites: readonly ({ ok: true; geometria: GeometriaLimite } | { ok: false; erro: string })[],
  talhoes: readonly TalhaoParaCasar[],
  vinculos: readonly VinculoExistente[],
): Casamento[] {
  // Geometria dos nossos: lida só quando a caixa cruza a de algum talhão da PF
  // (a base inteira tem milhares de talhões; ler todos custaria segundos).
  const geoCache = new Map<string, GeometriaLimite | null>();
  const geoDo = (t: TalhaoParaCasar) => {
    if (!geoCache.has(t.id)) geoCache.set(t.id, geometriaDoTalhao(t.geojson));
    return geoCache.get(t.id)!;
  };
  const caixaDo = (t: TalhaoParaCasar): Caixa | null => {
    if (t.bbox && t.bbox.every(Number.isFinite)) return t.bbox;
    const g = geoDo(t);
    return g ? caixaDe(g) : null;
  };
  const porTalhao = new Map(vinculos.map(v => [v.talhaoId, v]));
  const porCampo = new Map(vinculos.map(v => [v.sharedFieldId.toLowerCase(), v]));
  const nomeDo = new Map(talhoes.map(t => [t.id, t.nome]));

  const res: Casamento[] = campos.map((campo, k) => {
    const base = { campo, areaPfHa: null, melhor: null, outrosRelevantes: [], preMarcado: false, podeCriar: false } as Omit<Casamento, 'situacao' | 'motivo'>;
    if (campo.problema) return { ...base, situacao: 'invalido', motivo: campo.problema };
    const lim = limites[k];
    if (!lim?.ok) return { ...base, situacao: 'invalido', motivo: lim?.erro ?? 'Limite não lido.' };
    const pf = lim.geometria;
    const cx = caixaDe(pf);
    const candidatos: Candidato[] = [];
    const areaPfM2 = areaM2Geo(pf);
    // Um recorte (interseção) por vizinho; a comparação completa (dois recortes
    // + UTM) só para o melhor — os vizinhos de divisa são muitos.
    const geoCand = new Map<string, GeometriaLimite>();
    for (const t of talhoes) {
      const c = caixaDo(t);
      if (!c || !cruzam(c, cx)) continue;
      const g = geoDo(t);
      if (!g) continue;
      let intersecaoM2: number;
      try {
        const r = turfIntersect(featureCollection([feature(pf), feature(g)]));
        intersecaoM2 = r ? areaM2Geo(r.geometry as GeometriaLimite) : 0;
      } catch { continue; }   // recorte falhou nesse par: não é candidato
      if (intersecaoM2 < 1) continue;   // só encosta
      const areaNossoM2 = areaM2Geo(g);
      geoCand.set(t.id, g);
      candidatos.push({
        talhaoId: t.id, nome: t.nome, fazendaId: t.fazendaId, intersecaoM2,
        coberturaPct: areaNossoM2 > 0 ? (intersecaoM2 / areaNossoM2) * 100 : 0,
        difSimM2: null, difSimPct: null,
      });
    }
    candidatos.sort((a, b) => b.intersecaoM2 - a.intersecaoM2);
    const melhor = candidatos[0] ?? null;
    if (melhor) {
      try {
        const cmp = compararLimites(pf, geoCand.get(melhor.talhaoId)!);
        melhor.difSimM2 = cmp.difSimM2; melhor.difSimPct = cmp.difSimPct;
      } catch { /* sem a diferença: não pré-marca (cai em "diferente") */ }
    }
    const relevante = (c: Candidato) => c.coberturaPct >= COBERTURA_RELEVANTE * 100 && c.intersecaoM2 >= FRACAO_PF_RELEVANTE * areaPfM2;
    const relevantes = candidatos.filter(relevante);
    const outrosRelevantes = relevantes.filter(c => c !== melhor);
    const com = { ...base, areaPfHa: areaPfM2 / 10_000, melhor, outrosRelevantes };

    // 1) O shared_field_id da PF já está num vínculo nosso.
    const doCampo = porCampo.get(campo.sharedFieldId);
    if (doCampo) {
      const mesmo = melhor && doCampo.talhaoId === melhor.talhaoId;
      return {
        ...com, situacao: 'ja-vinculado',
        motivo: mesmo
          ? `Já vinculado a este talhão com estes mesmos IDs (${doCampo.status}).`
          : `Este shared_field_id já está no vínculo do talhão ${nomeDo.get(doCampo.talhaoId) ?? doCampo.talhaoId} (${doCampo.status}).`,
      };
    }
    // 2) Cobre dois ou mais dos nossos.
    if (relevantes.length >= 2) {
      return { ...com, situacao: 'ambiguo', motivo: `Cobre ${relevantes.length} talhões nossos: ${relevantes.map(c => `${c.nome} (${fmtPct(c.coberturaPct)} dele)`).join(', ')}. Resolva à mão.` };
    }
    if (!melhor) return { ...com, situacao: 'sem-par', motivo: 'Nenhum talhão nosso sobrepõe este limite.' };
    // 3) Nosso talhão já tem vínculo (com outros UUIDs).
    const doTalhao = porTalhao.get(melhor.talhaoId);
    if (doTalhao) {
      return { ...com, situacao: 'ja-vinculado', motivo: `O talhão ${melhor.nome} já tem vínculo com outros UUIDs (${doTalhao.status}, shared_field_id ${doTalhao.sharedFieldId}).` };
    }
    // 4) Produtor/fazenda com outra identidade.
    const t = talhoes.find(x => x.id === melhor.talhaoId)!;
    const ids = conflitoDeIds({ fazendaId: t.fazendaId, clienteId: t.clienteId, sharedFarmId: campo.sharedFarmId, sharedProducerId: campo.sharedProducerId }, vinculos);
    if (ids) return { ...com, situacao: 'conflito', motivo: ids };
    const pct = melhor.difSimPct;
    if (pct != null && pct <= LIMIAR_PAR_PCT) return { ...com, situacao: 'par', motivo: null, preMarcado: true, podeCriar: true };
    return {
      ...com, situacao: 'diferente', podeCriar: true,
      motivo: `Diferença de ${pct != null ? fmtPct(pct) : '—'} (acima de ${LIMIAR_PAR_PCT}%): confira antes de marcar.`,
    };
  });

  // 5) Dois talhões da PF no MESMO talhão nosso: não é 1:1 — nenhum dos dois entra.
  const conta = new Map<string, number>();
  for (const r of res) if (r.podeCriar && r.melhor) conta.set(r.melhor.talhaoId, (conta.get(r.melhor.talhaoId) ?? 0) + 1);
  for (const r of res) {
    if (r.podeCriar && r.melhor && (conta.get(r.melhor.talhaoId) ?? 0) > 1) {
      const outros = res.filter(x => x !== r && x.podeCriar && x.melhor?.talhaoId === r.melhor!.talhaoId).map(x => x.campo.nome);
      Object.assign(r, { situacao: 'ambiguo', podeCriar: false, preMarcado: false, motivo: `O talhão ${r.melhor.nome} também casa com ${outros.join(', ')} da PrecisionFarm. Resolva à mão.` });
    }
  }
  // 6) Mesmo cliente/fazenda nossos recebendo produtor/fazenda DIFERENTES dentro
  //    do próprio manifesto: só o primeiro de cada identidade passa.
  const aceitos: { fazendaId: string | null; clienteId: string | null; sharedFarmId: string; sharedProducerId: string }[] = [];
  for (const r of res) {
    if (!r.podeCriar || !r.melhor) continue;
    const t = talhoes.find(x => x.id === r.melhor!.talhaoId)!;
    const a = { fazendaId: t.fazendaId, clienteId: t.clienteId, sharedFarmId: r.campo.sharedFarmId, sharedProducerId: r.campo.sharedProducerId };
    const c = conflitoDeIds(a, aceitos);
    if (c) Object.assign(r, { situacao: 'conflito', podeCriar: false, preMarcado: false, motivo: `${c} (outro item do manifesto)` });
    else aceitos.push(a);
  }
  return res;
}

// ── Conferência do servidor antes de criar ───────────────────────────────────

export interface ItemCriacao {
  talhaoId: string;
  pfLocalId: string;
  sharedProducerId: string;
  sharedFarmId: string;
  sharedFieldId: string;
  /** Nome do talhão na PF (só para a mensagem). */
  nomePF: string;
}

/** Corpo do POST → itens normalizados (ou o erro do pedido inteiro). */
export function lerItensCriacao(corpo: unknown): { ok: true; itens: ItemCriacao[] } | { ok: false; erro: string } {
  const lista = ehObjeto(corpo) ? corpo.itens : null;
  if (!Array.isArray(lista) || !lista.length) return { ok: false, erro: 'Informe itens: [{ talhaoId, pfLocalId, sharedProducerId, sharedFarmId, sharedFieldId }].' };
  if (lista.length > MAX_CAMPOS_MANIFESTO) return { ok: false, erro: `No máximo ${MAX_CAMPOS_MANIFESTO} vínculos por pedido.` };
  return {
    ok: true,
    itens: lista.map(x => {
      const o = ehObjeto(x) ? x : {};
      return {
        talhaoId: texto(o.talhaoId), pfLocalId: texto(o.pfLocalId).slice(0, 200),
        sharedProducerId: texto(o.sharedProducerId).toLowerCase(), sharedFarmId: texto(o.sharedFarmId).toLowerCase(),
        sharedFieldId: texto(o.sharedFieldId).toLowerCase(), nomePF: texto(o.nomePF).slice(0, 200),
      };
    }),
  };
}

export type ConferenciaCriacao =
  | { ok: true; item: ItemCriacao; fazendaId: string | null; clienteId: string | null; empresaId: string | null }
  | { ok: false; item: ItemCriacao; motivo: string };

/**
 * O que o servidor confere ANTES de inserir (a prévia da tela é conforto; isto
 * é a regra): formato, talhão na nuvem, talhão sem vínculo, shared_field_id
 * livre, sem repetição no próprio pedido e a mesma identidade de produtor/
 * fazenda dos vínculos existentes. `talhoes`: os da nuvem (sem o talhão = não
 * sincronizado ou inexistente).
 */
export function conferirCriacao(
  itens: readonly ItemCriacao[],
  talhoes: ReadonlyMap<string, { fazendaId: string | null; clienteId: string | null; empresaId: string | null }>,
  vinculos: readonly VinculoExistente[],
): ConferenciaCriacao[] {
  const porTalhao = new Map(vinculos.map(v => [v.talhaoId, v]));
  const porCampo = new Map(vinculos.map(v => [v.sharedFieldId.toLowerCase(), v]));
  const aceitos: VinculoExistente[] = [];
  return itens.map((item): ConferenciaCriacao => {
    const recusa = (motivo: string): ConferenciaCriacao => ({ ok: false, item, motivo });
    if (!item.talhaoId) return recusa('Sem talhão.');
    if (!item.pfLocalId) return recusa('Sem o ID do talhão na PrecisionFarm (local_field_id).');
    if (![item.sharedProducerId, item.sharedFarmId, item.sharedFieldId].every(u => RE_UUID.test(u))) return recusa('UUID ausente ou inválido.');
    const t = talhoes.get(item.talhaoId);
    if (!t) return recusa('Este talhão não está na nuvem (ainda não sincronizou ou não existe).');
    const v1 = porTalhao.get(item.talhaoId);
    if (v1) return recusa(`O talhão já tem vínculo (${v1.status}, shared_field_id ${v1.sharedFieldId}).`);
    const v2 = porCampo.get(item.sharedFieldId);
    if (v2) return recusa(`Este shared_field_id já está no vínculo de outro talhão (${v2.talhaoId}, ${v2.status}).`);
    if (aceitos.some(a => a.talhaoId === item.talhaoId)) return recusa('Talhão repetido neste pedido.');
    if (aceitos.some(a => a.sharedFieldId === item.sharedFieldId)) return recusa('shared_field_id repetido neste pedido.');
    const ids = conflitoDeIds({ fazendaId: t.fazendaId, clienteId: t.clienteId, sharedFarmId: item.sharedFarmId, sharedProducerId: item.sharedProducerId }, [...vinculos, ...aceitos]);
    if (ids) return recusa(ids);
    aceitos.push({
      talhaoId: item.talhaoId, sharedProducerId: item.sharedProducerId, sharedFarmId: item.sharedFarmId, sharedFieldId: item.sharedFieldId,
      status: 'pendente', fazendaId: t.fazendaId, clienteId: t.clienteId,
    });
    return { ok: true, item, fazendaId: t.fazendaId, clienteId: t.clienteId, empresaId: t.empresaId };
  });
}
