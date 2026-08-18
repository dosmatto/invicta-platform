#!/usr/bin/env node
// Motor de importação do acervo antigo (disco ARQUIVOS GEORREFERENCIADOS) para
// a plataforma: grades de amostragem (amostragem.shp) + laudos de fertilidade
// (export InCeres `id|prof|...` e laudo cru Fundação ABC) → app_kv
// (inv_grades / inv_lab), casando com talhões JÁ cadastrados pelo nome.
//
// Decisões do usuário (30/07/2026, ver ~/.claude/plans/plataforma-de-ap-deep-grove.md):
//   1. Registro cai no ANO DA AMOSTRAGEM (grade); grade+laudo juntos no mesmo ano.
//   2. Laudo sem grade: importa mesmo assim, com pendência "grade-faltando".
//   3. Talhão não cadastrado na plataforma: NÃO cria — entra no relatório como ignorado.
//
// Segurança: ids determinísticos com prefixo `mig` + marcador dados.origemImport
// = 'acervo-2026' → reimportar é idempotente (upsert) e o rollback em massa é
// possível sem tocar em dados criados pelo app. Nunca deleta nada no --apply.
//
// Uso (na raiz do repo):
//   node scripts/migracao-acervo/importar.mjs --pasta "/Volumes/WNOLTE_SSD/ARQUIVOS GEORREFERENCIADOS/A.S. EMPREENDIMENTOS" --fazenda mr984zmdw30osdjbzy            # dry-run (só relatório)
//   node scripts/migracao-acervo/importar.mjs --pasta "..." --fazenda mr984... --apply     # grava
//   node scripts/migracao-acervo/importar.mjs --rollback                                   # remove tudo que este motor gravou
//
// IMPORTANTE: aplicar com o app FECHADO (ou recarregar logo após): uma sessão do
// app que bootou ANTES do apply pode, no 1º push de inv_grades/inv_lab, podar as
// linhas novas (sync "delete not-in" — ver supabaseData.ts).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import * as XLSXmod from 'xlsx';
import * as shpjs from 'shpjs';

const XLSX = XLSXmod.default ?? XLSXmod;
const { parseShp, parseDbf, combine, parseZip } = shpjs;

const ORIGEM = 'acervo-2026';
const OUT_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), 'out');

// ── CLI ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = n => args.includes(`--${n}`);
const opt = n => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const PASTA = opt('pasta');
const FAZENDA_ID = opt('fazenda');
const APPLY = flag('apply');
const ROLLBACK = flag('rollback');

// ── Supabase (service role, leitura de .env.local como scripts/backup-supabase.mjs) ──
function lerEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local');
  const txt = fs.readFileSync(envPath, 'utf8');
  const get = k => txt.split('\n').find(l => l.startsWith(k + '='))?.slice(k.length + 1).trim();
  return { url: get('NEXT_PUBLIC_SUPABASE_URL'), key: get('SUPABASE_SERVICE_ROLE') };
}
const { url: SUPA_URL, key: SUPA_KEY } = lerEnvLocal();
if (!SUPA_URL || !SUPA_KEY) { console.error('Faltou NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE em .env.local'); process.exit(1); }
const sb = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

// ── Helpers ──────────────────────────────────────────────────────────────────
const sha = s => crypto.createHash('sha1').update(s).digest('hex');
const migId = (...partes) => 'mig' + sha(partes.join('|')).slice(0, 18);
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const normHdr = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9%/]/g, '');

// nº PT/US; '<x'/'N.D' → 0 (medido, não detectado); vazio/'-' → null (não analisado)
function valorLab(s) {
  if (s == null) return null;
  const t = String(s).trim();
  if (t === '' || t === '-' || /^-\s*$/.test(t)) return null;
  if (/^n[\s./-]?d\.?$/i.test(t) || t.startsWith('<')) return 0;
  if (t.startsWith('>') || t.includes('/')) return null;
  let x = t.replace(/[^\d.,-]/g, '');
  if (x.includes(',') && x.includes('.')) x = x.replace(/\./g, '').replace(',', '.');
  else if (x.includes(',')) x = x.replace(',', '.');
  const v = parseFloat(x);
  return Number.isFinite(v) ? v : null;
}

// Rótulo de profundidade → "0-20"/"20-40". Aceita "020 cm", "0-20 cm", "0 - 20".
function normProf(s) {
  const t = String(s ?? '').replace(/\s*cm\s*/i, '').trim();
  const m = /^(\d{1,2})\s*[-–]\s*(\d{1,2})$/.exec(t);
  if (m) return `${+m[1]}-${+m[2]}`;
  const d = /^(\d{3,4})$/.exec(t.replace(/\s+/g, ''));
  if (d) {                       // "020" = 0-20; "2040" = 20-40
    const s4 = d[1].padStart(4, '0');
    return `${+s4.slice(0, 2)}-${+s4.slice(2)}`;
  }
  return t;
}

const epocaDeMes = m => (m <= 6 ? '1' : '2');
const safraDoAno = ano => `${String(ano).slice(2)}/${String(ano + 1).slice(2)}`;

// t/CTCe + saturações — mesmo cálculo de src/lib/lab.ts (calcularDerivados)
function calcularDerivados(v) {
  const r1 = x => Math.round(x * 10) / 10;
  const { ca, mg, k, al, ctc } = v;
  if (ca != null && mg != null && k != null) v.t = r1(ca + mg + k + (al ?? 0)); else delete v.t;
  const sat = (id, base) => { if (ctc != null && ctc > 0 && base != null) v[id] = r1((base / ctc) * 100); else delete v[id]; };
  sat('satk', k); sat('satca', ca); sat('satmg', mg);
}

// ── Rollback ─────────────────────────────────────────────────────────────────
async function rollback() {
  for (const colecao of ['inv_grades', 'inv_lab', 'inv_bib_safras']) {
    const del = await sb.from('app_kv').delete()
      .eq('colecao', colecao).like('item_id', 'mig%')
      .eq('dados->>origemImport', ORIGEM).select('item_id');
    if (del.error) { console.error(`rollback ${colecao}:`, del.error.message); process.exit(1); }
    console.log(`rollback ${colecao}: ${del.data.length} removidos`);
  }
}

// ── Scan do acervo ───────────────────────────────────────────────────────────
const CODE_RE = /AFSSA\s*_?\s*(\d{1,2}[AB]?)/gi;   // códigos de talhão no nome (piloto)

function codigosDoNome(nome) {
  const sem = nome.replace(/\.(xls|xlsx|zip|kml)$/i, '').replace(/[_\s-]((19|20)\d{2})(?=\b)/g, ' ');   // tira anos
  const out = [];
  let m; CODE_RE.lastIndex = 0;
  while ((m = CODE_RE.exec(sem))) out.push('AFSSA ' + m[1].replace(/^(\d)([AB]?)$/, '0$1$2').toUpperCase());
  // números soltos além do 1º código ("AFSSA 10 14 16", "ARTHUR 07 01 02") = mais talhões.
  // Ignora o número já coberto por um código com sufixo ("AFSSA 06B" não gera "AFSSA 06").
  const jaCobertos = new Set(out.map(c => c.replace(/^\D+/, '').replace(/[AB]$/, '')));
  const nums = [...sem.matchAll(/(?<![\dA-Za-z])(\d{1,2})(?![\d])/g)].map(x => +x[1]).filter(n => n >= 1 && n <= 30);
  for (const n of nums) {
    const dd = String(n).padStart(2, '0');
    if (jaCobertos.has(dd)) continue;
    const cod = 'AFSSA ' + dd;
    if (!out.includes(cod)) out.push(cod);
  }
  return out;
}
const anoDoNome = nome => { const m = /[_\s-]((?:19|20)\d{2})/.exec(nome); return m ? +m[1] : null; };

function listarDir(dir) {
  try { return fs.readdirSync(dir).filter(f => !f.startsWith('.') && !f.startsWith('~$')); } catch { return []; }
}

// Grades: qualquer amostragem.shp solto OU zip contendo amostragem.shp, sob PLANIMETRIA
function acharGrades(base) {
  const grades = [];
  for (const ano of listarDir(base).filter(d => /^(19|20)\d{2}$/.test(d))) {
    const plan = path.join(base, ano, 'PLANIMETRIA');
    if (!fs.existsSync(plan)) continue;
    const pilha = [plan];
    while (pilha.length) {
      const dir = pilha.pop();
      for (const f of listarDir(dir)) {
        const full = path.join(dir, f);
        const st = fs.statSync(full);
        if (st.isDirectory()) { pilha.push(full); continue; }
        if (f.toLowerCase() === 'amostragem.shp') {
          const pastaTalhao = path.basename(dir);
          // data embutida no zip InCeres irmão: grade-afssa-NN-ANO-YYYYMMDD-...
          let dataRef = null, fonteData = null;
          for (const g of listarDir(dir)) {
            const md = /grade-.*-(\d{4})(\d{2})(\d{2})-/.exec(g);
            if (md) { dataRef = `${md[1]}-${md[2]}-${md[3]}`; fonteData = `zip ${g}`; break; }
          }
          grades.push({ tipo: 'solto', dir, ano: +ano, pastaTalhao, dataRef, fonteData });
        } else if (/\.zip$/i.test(f) && !/^grade-/.test(f) && dir === plan) {
          // zips diretos na PLANIMETRIA (2021): "AFSSA 08.zip"
          try {
            const buf = fs.readFileSync(full);
            // presença de amostragem.shp (checagem barata pelo nome no diretório central do zip)
            if (buf.includes(Buffer.from('amostragem.shp'))) {
              grades.push({ tipo: 'zip', zipPath: full, ano: +ano, pastaTalhao: f.replace(/\.zip$/i, ''), dataRef: null, fonteData: null });
            }
          } catch { /* zip ilegível — reportado adiante se necessário */ }
        }
      }
    }
  }
  return grades;
}

// Laudos: FERTILIDADE/*.xls(x)
function acharLaudos(base) {
  const laudos = [];
  for (const ano of listarDir(base).filter(d => /^(19|20)\d{2}$/.test(d))) {
    const fert = path.join(base, ano, 'FERTILIDADE');
    for (const f of listarDir(fert)) {
      if (!/\.(xls|xlsx)$/i.test(f)) continue;
      laudos.push({ path: path.join(fert, f), arquivo: f, anoPasta: +ano });
    }
  }
  return laudos;
}

// ── Parse de grade ───────────────────────────────────────────────────────────
async function parseGrade(g) {
  let fc;
  if (g.tipo === 'zip') {
    const parsed = await parseZip(fs.readFileSync(g.zipPath));
    const fcs = Array.isArray(parsed) ? parsed : [parsed];
    fc = fcs.find(x => (x.fileName ?? '').toLowerCase().includes('amostragem'))
      ?? fcs.find(x => x.features?.[0]?.geometry?.type === 'Point');
    if (!g.dataRef) {
      // data = mtime interno mais comum do zip (cabeçalho local não é lido pelo shpjs;
      // usa mtime do arquivo zip como aproximação e marca como estimada)
      const st = fs.statSync(g.zipPath);
      g.dataRef = st.mtime.toISOString().slice(0, 10); g.fonteData = 'mtime zip (estimada)';
    }
  } else {
    const shpBuf = fs.readFileSync(path.join(g.dir, 'amostragem.shp'));
    const dbfBuf = fs.readFileSync(path.join(g.dir, 'amostragem.dbf'));
    let cpg; try { cpg = fs.readFileSync(path.join(g.dir, 'amostragem.cpg'), 'utf8').trim(); } catch { cpg = undefined; }
    fc = combine([parseShp(shpBuf), parseDbf(dbfBuf, cpg)]);
    if (!g.dataRef) {
      const st = fs.statSync(path.join(g.dir, 'amostragem.shp'));
      g.dataRef = st.mtime.toISOString().slice(0, 10); g.fonteData = 'mtime shp (estimada)';
    }
  }
  if (!fc?.features?.length) throw new Error('shapefile sem pontos');
  const campoId = Object.keys(fc.features[0].properties ?? {}).find(k => normHdr(k) === 'id') ?? Object.keys(fc.features[0].properties ?? {})[0];
  let zonas = false;
  const pontos = fc.features.filter(f => f.geometry?.type === 'Point').map((f, i) => {
    const raw = String(f.properties?.[campoId] ?? '').trim();
    if (/\d+\s*-\s*\d+/.test(raw)) zonas = true;
    const m = raw.match(/\d+/);
    const [lng, lat] = f.geometry.coordinates;
    return { ordem: i, numero: m ? +m[0] : undefined, lng, lat, profs: 1 };
  });
  // sanity de CRS: WGS84 na região dos Campos Gerais
  const foraCRS = pontos.some(p => p.lng < -60 || p.lng > -40 || p.lat < -30 || p.lat > -18);
  return { pontos, zonas, foraCRS };
}

// ── Parse de laudo ───────────────────────────────────────────────────────────
const MAPA_INCERES = { pres: 'p', mos: 'mo', ph: 'ph', al: 'al', k: 'k', ca: 'ca', mg: 'mg', ctc: 'ctc', 'v%': 'v', 'm%': 'm', argila: 'textura', 'h/al': 'hal' };
const IGNORAR_INCERES = new Set(['t', 'silte', 'areiagrossa', 'areiatot', 'areiatotal', 'areiafina', 'areia']);
const CARGA = new Set(['k', 'ca', 'mg', 'al', 'ctc', 'hal']);

function fatorCanonico(elId, unidade, valoresColuna) {
  const u = normHdr(unidade ?? '');
  if (CARGA.has(elId)) {
    if (u.includes('cmolc') || u.includes('meq')) return 10;
    return 1;                                  // mmolc (default InCeres) = canônico
  }
  if (elId === 'mo') {
    if (u === '%' || u.includes('dag')) {
      // InCeres às vezes rotula '%' mas os valores têm magnitude de g/dm³
      const nums = valoresColuna.filter(v => v != null).sort((a, b) => a - b);
      const p50 = nums[Math.floor(nums.length / 2)] ?? 0;
      return p50 > 8 ? 1 : 10;
    }
    return 1;                                  // g/dm³ = canônico
  }
  if (elId === 'textura') {
    if (u.includes('g/kg') || u.includes('g/dm')) return 0.1;
    // sem rótulo de unidade: argila > 100 só existe em g/kg (em % o teto é 100)
    const nums = valoresColuna.filter(v => v != null).sort((a, b) => a - b);
    const p50 = nums[Math.floor(nums.length / 2)] ?? 0;
    return p50 > 100 ? 0.1 : 1;
  }
  return 1;                                    // p (mg/dm³), v, m, ph
}

function aoaDaPlanilha(ws) {
  return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, raw: false, defval: '' })
    .map(r => r.map(c => String(c ?? '')));
}

// Formato export InCeres: linha 0 = id|prof|..., linha 1 pode ser unidades.
function parseInceres(aoa) {
  const hdr = aoa[0].map(normHdr);
  const temUnidades = (aoa[1] ?? []).some(c => /mmolc|cmolc|mg\/dm|g\/dm|sem unidade/i.test(c)) &&
    valorLab(aoa[1]?.[0]) == null;
  const unidades = temUnidades ? aoa[1] : [];
  const dados = aoa.slice(temUnidades ? 2 : 1);
  const cols = [];      // {idx, elId}
  const ignoradas = [];
  hdr.forEach((h, i) => {
    if (i < 2 || !h) return;
    const el = MAPA_INCERES[h];
    if (el) cols.push({ idx: i, elId: el });
    else if (!IGNORAR_INCERES.has(h)) ignoradas.push(aoa[0][i]);
  });
  const fatores = {};
  for (const { idx, elId } of cols) {
    fatores[idx] = fatorCanonico(elId, unidades[idx], dados.map(r => valorLab(r[idx])));
  }
  const resultados = new Map();   // talhao|numero|prof
  for (const r of dados) {
    // A coluna `id` pode ser só o número ("19") ou trazer o talhão junto, em
    // arquivos de vários talhões ("AFSSA 10  19", "AFSSA 06 - 37").
    const idTxt = String(r[0] ?? '').trim();
    const mNum = idTxt.match(/(\d+)\s*$/);
    const numero = mNum ? +mNum[1] : NaN;
    if (!numero) continue;
    const talhaoTxt = idTxt.slice(0, mNum.index).replace(/[-–\s]+$/, '').trim();
    const talhao = /[a-z]/i.test(talhaoTxt) ? talhaoTxt.toUpperCase() : '';
    const prof = normProf(r[1]);
    const valores = {};
    for (const { idx, elId } of cols) {
      const v = valorLab(r[idx]);
      if (v != null) valores[elId] = Math.round(v * fatores[idx] * 100) / 100;
    }
    if (!Object.keys(valores).length) continue;
    const key = `${norm(talhao)}|${numero}|${prof}`;
    const ex = resultados.get(key);
    if (ex) Object.assign(ex.valores, valores);
    else resultados.set(key, { numero, profundidade: prof, talhao, campanha: '', valores });
  }
  const lista = [...resultados.values()].sort((a, b) => a.numero - b.numero || a.profundidade.localeCompare(b.profundidade));
  for (const r of lista) calcularDerivados(r.valores);
  const multi = new Set(lista.map(r => norm(r.talhao)).filter(Boolean)).size > 0;
  return { formato: 'inceres', resultados: lista, ignoradas, dataEvidencia: null, temTalhaoNaLinha: multi };
}

// Laudo cru Fundação ABC: Tipo|Recebimento|...|Identificação ("AFSSA 07 - P.23")
const MAPA_FABC = [
  ['aluminioctcefetiva', 'm'], ['%aluminio', 'm'],
  ['fosfororesina', 'p_res'], ['fosforo', 'p'],
  ['materiaorganica', 'mo'], ['ph', 'ph'],
  ['hidrogenioaluminio', 'hal'], ['aluminio', 'al'],
  ['potassio', 'k'], ['calcio', 'ca'], ['magnesio', 'mg'],
  ['capdetrocadecations', 'ctc'], ['captrocacat', 'ctce_skip'],
  ['saturacaodebases', 'v'], ['argila', 'textura'],
  ['boro', 'b'], ['enxofre', 's'], ['zinco', 'zn'], ['cobre', 'cu'], ['manganes', 'mn'],
];
function parseFabc(aoa) {
  const hdr = aoa[0].map(normHdr);
  const unidades = aoa[1] ?? [];
  const dados = aoa.slice(2);
  const idxIdent = hdr.findIndex(h => h.startsWith('identificacao'));
  const idxProf = hdr.findIndex(h => h.startsWith('profundidade'));
  const idxOS = hdr.findIndex(h => h.startsWith('ordemdeservico'));
  const idxRec = hdr.findIndex(h => h.startsWith('recebimento'));
  if (idxIdent < 0) throw new Error('FABC sem coluna Identificação');
  const cols = [];
  const usados = new Set();
  for (const [pref, elId] of MAPA_FABC) {
    const i = hdr.findIndex((h, ix) => !usados.has(ix) && h.startsWith(pref));
    if (i >= 0) { usados.add(i); if (!elId.endsWith('_skip')) cols.push({ idx: i, elId }); }
  }
  const resultados = new Map();
  let dataMin = null;
  const ignoradasIdent = [];
  for (const r of dados) {
    const ident = String(r[idxIdent] ?? '').trim();
    // "AFSSA 07 - P.23", "AFSSA 10 - 19", "AFSSA 10  19"
    const m = /^(.*?)[\s-–]+P?\.?\s*(\d+)\s*$/i.exec(ident);
    if (!m || !/[a-z]/i.test(m[1])) { if (ident) ignoradasIdent.push(ident); continue; }
    const talhao = m[1].trim().toUpperCase();
    const numero = +m[2];
    const prof = normProf(r[idxProf]);
    const campanha = idxOS >= 0 ? String(r[idxOS] ?? '').trim() : '';
    const rec = idxRec >= 0 ? String(r[idxRec] ?? '').slice(0, 10) : '';
    if (/^\d{4}-\d{2}-\d{2}/.test(rec) && (!dataMin || rec < dataMin)) dataMin = rec;
    const valores = {};
    for (const { idx, elId } of cols) {
      const v = valorLab(r[idx]);
      if (v == null) continue;
      const el = elId === 'p_res' ? 'p' : elId;
      const f = fatorCanonico(el, unidades[idx], []);
      if (el === 'p' && valores.p != null && elId === 'p') continue;   // resina já preencheu
      valores[el] = Math.round(v * f * 100) / 100;
    }
    if (!Object.keys(valores).length) continue;
    const key = `${norm(talhao)}|${numero}|${prof}`;
    const ex = resultados.get(key);
    if (ex) Object.assign(ex.valores, valores);
    else resultados.set(key, { numero, profundidade: prof, talhao, campanha, valores });
  }
  const lista = [...resultados.values()].sort((a, b) => a.numero - b.numero || a.profundidade.localeCompare(b.profundidade));
  for (const r of lista) calcularDerivados(r.valores);
  return { formato: 'fabc', resultados: lista, ignoradas: ignoradasIdent, dataEvidencia: dataMin };
}

// Lê um arquivo de laudo. `multiTalhao` força a aba do laudo CRU (Fundação ABC),
// a única com o talhão em cada linha — o export InCeres só tem `id`, então num
// arquivo de vários talhões (ex. "AFSSA 10 14 16") não há como separar por lá.
function parseLaudo(fp, multiTalhao = false) {
  const wb = XLSX.read(fs.readFileSync(fp), { type: 'buffer', codepage: 1252 });
  let melhorInceres = null, melhorFabc = null, tsSheet = null;
  for (const nome of wb.SheetNames) {
    const md = /^(\d{4})(\d{2})(\d{2})\d*$/.exec(nome);
    if (md) tsSheet = `${md[1]}-${md[2]}-${md[3]}`;
    const aoa = aoaDaPlanilha(wb.Sheets[nome]);
    if (!aoa.length) continue;
    const h0 = (aoa[0] ?? []).map(normHdr);
    if (h0[0] === 'id' && h0[1] === 'prof') { if (!melhorInceres) melhorInceres = aoa; }
    else if (h0[0] === 'tipo' && h0.some(c => c.startsWith('identificacao'))) { if (!melhorFabc) melhorFabc = aoa; }
  }
  const ordem = multiTalhao ? [['fabc', melhorFabc, parseFabc], ['inceres', melhorInceres, parseInceres]]
                            : [['inceres', melhorInceres, parseInceres], ['fabc', melhorFabc, parseFabc]];
  for (const [, aoa, fn] of ordem) {
    if (!aoa) continue;
    const p = fn(aoa);
    p.dataEvidencia = p.dataEvidencia ?? tsSheet;
    return p;
  }
  return null;
}

// ── Ponto-em-polígono (ray casting; MultiPolygon GeoJSON) ────────────────────
function dentroDe(poly, lng, lat) {
  // poly: coordinates de Polygon (anéis) — usa só o anel externo
  const anel = poly[0];
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i], [xj, yj] = anel[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}
function pctDentro(geom, pontos) {
  if (!geom) return null;
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
  let n = 0;
  for (const p of pontos) if (polys.some(poly => dentroDe(poly, p.lng, p.lat))) n++;
  return pontos.length ? Math.round((n / pontos.length) * 100) : null;
}

// ── Faixas plausíveis (canônico) p/ validação ────────────────────────────────
const FAIXAS = { ph: [3, 9], p: [0, 400], k: [0, 25], ca: [0, 150], mg: [0, 80], al: [0, 40], ctc: [20, 250], v: [0, 100], m: [0, 100], mo: [3, 90], textura: [0, 90], hal: [0, 150] };
function foraDaFaixa(resultados) {
  const probs = {};
  for (const r of resultados) for (const [el, v] of Object.entries(r.valores)) {
    const f = FAIXAS[el];
    if (f && (v < f[0] || v > f[1])) probs[el] = (probs[el] ?? 0) + 1;
  }
  return probs;
}

// ── Principal ────────────────────────────────────────────────────────────────
async function main() {
  if (ROLLBACK) { await rollback(); return; }
  if (!PASTA || !FAZENDA_ID) { console.error('Uso: --pasta "<dir do produtor>" --fazenda <fazendaId> [--apply] | --rollback'); process.exit(1); }

  // 1. Talhões da fazenda na plataforma
  const tq = await sb.from('talhoes').select('id,nome,empresa_id,dados').eq('fazenda_id', FAZENDA_ID);
  if (tq.error) throw new Error('talhoes: ' + tq.error.message);
  const talhoes = new Map();   // norm(nome) → {id, nome, empresaId, geom}
  for (const t of tq.data) {
    let geom = null;
    try { geom = typeof t.dados.geojson === 'string' ? JSON.parse(t.dados.geojson) : t.dados.geojson; } catch { /* sem geometria */ }
    if (geom?.type === 'FeatureCollection') geom = geom.features[0]?.geometry;
    if (geom?.type === 'Feature') geom = geom.geometry;
    talhoes.set(norm(t.nome), { id: t.id, nome: t.nome, empresaId: t.empresa_id, geom });
  }
  console.log(`Talhões na plataforma (fazenda ${FAZENDA_ID}): ${talhoes.size}`);
  const empresaId = tq.data[0]?.empresa_id ?? null;
  // Prefixos dos talhões desta fazenda (ex. "AFSSA") — usados para filtrar
  // laudos que vêm como lote geral do laboratório, com vários produtores.
  const prefixosFazenda = new Set([...talhoes.keys()].map(n => n.replace(/\d+[AB]?$/, '')).filter(Boolean));

  // Aliases confirmáveis: grade "AFSSA 07A" pertence ao talhão AFSSA 07 (flag no relatório)
  const resolveTalhao = codigo => {
    const n = norm(codigo);
    if (talhoes.has(n)) return { t: talhoes.get(n), alias: false };
    const semSufixo = n.replace(/([0-9])[AB]$/, '$1');
    if (semSufixo !== n && talhoes.has(semSufixo)) return { t: talhoes.get(semSufixo), alias: true };
    return { t: null, alias: false };
  };

  // 2. Scan do acervo
  const gradesRaw = acharGrades(PASTA);
  const laudosRaw = acharLaudos(PASTA);

  // dedup de laudos: tira -SRV-WR e "Copia" quando existe gêmeo
  const laudosFiltrados = laudosRaw.filter(l => {
    if (/RESUMO|ESTIMATIVA/i.test(l.arquivo)) return false;
    const semSufixo = l.arquivo.replace(/-SRV-WR(?=\.)/i, '').replace(/\s*-\s*Copia(?=\.)/i, '');
    if (semSufixo !== l.arquivo && laudosRaw.some(o => o !== l && o.arquivo === semSufixo)) return false;
    return true;
  });

  // 3. Parse das grades
  const grades = [];   // {codigo, ano, dataRef, fonteData, pontos, zonas, origem}
  for (const g of gradesRaw) {
    const codigos = codigosDoNome(g.pastaTalhao);
    const codigo = codigos[0] ?? g.pastaTalhao.toUpperCase();
    try {
      const p = await parseGrade(g);
      grades.push({ codigo, codigoOriginal: g.pastaTalhao, ano: g.ano, dataRef: g.dataRef, fonteData: g.fonteData, ...p, origem: g.tipo === 'zip' ? path.basename(g.zipPath) : path.relative(PASTA, g.dir) });
    } catch (e) {
      grades.push({ codigo, codigoOriginal: g.pastaTalhao, ano: g.ano, erro: String(e.message ?? e), origem: g.tipo === 'zip' ? path.basename(g.zipPath) : path.relative(PASTA, g.dir) });
    }
  }

  // 4. Parse dos laudos → unidades talhão-ano
  const unidades = new Map();   // codigo|ano → {codigo, ano, laudo:{...}, fontes:[]}
  const avisos = [];
  for (const l of laudosFiltrados) {
    const zonasFile = /ZONAS/i.test(l.arquivo);
    const codsArquivo = codigosDoNome(l.arquivo);
    let parsed = null;
    try { parsed = parseLaudo(l.path, codsArquivo.length !== 1); } catch (e) { avisos.push(`ERRO parse ${l.arquivo}: ${e.message ?? e}`); continue; }
    if (!parsed || !parsed.resultados.length) { avisos.push(`sem dados: ${l.anoPasta}/${l.arquivo}`); continue; }
    const anoArq = anoDoNome(l.arquivo);
    // Separa por talhão: preferencialmente pelo talhão que vem em cada linha
    // (coluna Identificação do FABC ou id "AFSSA 10  19" do export); só quando
    // as linhas não têm talhão é que o código sai do nome do arquivo.
    const porTalhao = new Map();
    const push = (cod, r) => { if (!porTalhao.has(cod)) porTalhao.set(cod, []); porTalhao.get(cod).push(r); };
    if (parsed.formato === 'fabc' || parsed.temTalhaoNaLinha) {
      // A aba de laudo cru às vezes é o LOTE INTEIRO do laboratório (todos os
      // produtores daquele envio, milhares de linhas). Só entram as linhas dos
      // talhões que o nome do arquivo cita — ou, sem código no nome, as dos
      // talhões desta fazenda (pelo prefixo do nome, ex. AFSSA*).
      const aceitos = codsArquivo.length ? new Set(codsArquivo.map(norm)) : null;
      let descartadas = 0;
      for (const r of parsed.resultados) {
        if (!r.talhao) { if (codsArquivo.length === 1) push(codsArquivo[0], r); continue; }
        const cod = codigosDoNome(r.talhao)[0] ?? r.talhao.toUpperCase();
        const ok = aceitos ? aceitos.has(norm(cod)) : prefixosFazenda.has(norm(cod).replace(/\d+[AB]?$/, ''));
        if (!ok) { descartadas++; continue; }
        push(cod, r);
      }
      if (descartadas) avisos.push(`${l.anoPasta}/${l.arquivo}: ${descartadas} linhas de outros talhões/produtores descartadas (lote geral do laboratório)`);
    } else if (codsArquivo.length === 1) {
      porTalhao.set(codsArquivo[0], parsed.resultados);
    } else {
      avisos.push(`multi/zero talhão (${codsArquivo.join(', ') || 'nenhum'}) e linhas sem talhão: ${l.anoPasta}/${l.arquivo} — NÃO importado`);
      continue;
    }
    for (const [cod, resultados] of porTalhao) {
      const ano = anoArq ?? l.anoPasta;
      const key = `${cod}|${ano}`;
      // Específico = o nome do arquivo cita este talhão (e só ele) → vence um
      // arquivo "GERAL" multi-talhão, que costuma ser lote parcial/composta.
      const especifico = codsArquivo.length === 1 && norm(codsArquivo[0]) === norm(cod) ? 2
        : codsArquivo.some(c => norm(c) === norm(cod)) ? 1 : 0;
      const cand = { arquivo: `${l.anoPasta}/${l.arquivo}`, formato: parsed.formato, resultados, dataEvidencia: parsed.dataEvidencia, zonasFile, colunasIgnoradas: parsed.ignoradas, especifico };
      const ex = unidades.get(key);
      if (!ex) unidades.set(key, { codigo: cod, ano, candidatos: [cand] });
      else ex.candidatos.push(cand);
    }
  }

  // 5. Escolhe candidato por unidade (específico > mais amostras) e pareia grade.
  // O pareamento é em 2 passes para não roubar a grade de quem é do mesmo ano:
  // 1º passe casa ano do laudo == ano da grade; 2º passe usa a grade do ano
  // anterior (coleta set–nov, laudo no ano seguinte) só se ela ainda estiver livre.
  const pre = [];
  for (const u of unidades.values()) {
    u.candidatos.sort((a, b) => (b.especifico - a.especifico) || (b.resultados.length - a.resultados.length) || (a.formato === 'inceres' ? -1 : 1));
    const { t, alias } = resolveTalhao(u.codigo);
    const gcands = grades.filter(g => {
      if (g.erro) return false;
      const gc = codigosDoNome(g.codigoOriginal)[0] ?? g.codigo;
      if (norm(gc) === norm(u.codigo)) return true;
      const rt = resolveTalhao(gc).t;
      return !!(rt && t && rt.id === t.id);
    });
    pre.push({ ...u, laudo: u.candidatos[0], talhao: t, alias, gcands });
  }
  const gradeUsada = new Set();
  const plano = [];
  for (const p of pre) {
    const g = p.gcands.find(x => x.ano === p.ano && !gradeUsada.has(x.origem));
    if (g) gradeUsada.add(g.origem);
    plano.push({ ...p, grade: g ?? null });
  }
  for (const p of plano) {
    if (p.grade) continue;
    const g = p.gcands.find(x => x.ano === p.ano - 1 && !gradeUsada.has(x.origem));
    if (g) { gradeUsada.add(g.origem); p.grade = g; }
  }
  for (const p of plano) p.anoFinal = p.grade ? p.grade.ano : p.ano;   // decisão 1: ano da amostragem
  // grades órfãs (sem laudo)
  const usadas = new Set(plano.filter(p => p.grade).map(p => p.grade.origem));
  const gradesOrfas = grades.filter(g => !usadas.has(g.origem));

  // 6. Monta objetos + relatório
  const agora = new Date().toISOString();
  const rowsGrades = [], rowsLaudos = [], linhas = [];
  const anosUsados = new Set();
  for (const p of plano.sort((a, b) => a.codigo.localeCompare(b.codigo) || a.anoFinal - b.anoFinal)) {
    const st = [];
    if (!p.talhao) st.push('IGNORADO: talhão não cadastrado');
    if (p.laudo.zonasFile || p.grade?.zonas) st.push('PENDÊNCIA: amostragem por zonas — tratar depois');
    if (p.grade?.foraCRS) st.push('ERRO: grade fora de WGS84');
    const importavel = st.length === 0;

    let dataRef, fonteData;
    if (p.grade?.dataRef) { dataRef = p.grade.dataRef; fonteData = p.grade.fonteData; }
    else if (p.laudo.dataEvidencia) { dataRef = p.laudo.dataEvidencia; fonteData = 'data do laudo'; }
    else { dataRef = `${p.anoFinal}-10-15`; fonteData = 'estimada (meio do ciclo)'; }
    if (+dataRef.slice(0, 4) !== p.anoFinal) { dataRef = `${p.anoFinal}-10-15`; fonteData += ' → ajustada ao ano'; }

    const safra = safraDoAno(p.anoFinal);
    const epoca = epocaDeMes(+dataRef.slice(5, 7));
    const numerosLaudo = new Set(p.laudo.resultados.map(r => r.numero));
    const profsPorNum = new Map();
    for (const r of p.laudo.resultados) profsPorNum.set(r.numero, (profsPorNum.get(r.numero) ?? 0) + 1);

    let casamento = '', pdentro = null;
    if (p.grade && !p.grade.erro) {
      const numerosGrade = new Set(p.grade.pontos.map(pt => pt.numero).filter(n => n != null));
      const foraGrade = [...numerosLaudo].filter(n => !numerosGrade.has(n));
      casamento = `${numerosLaudo.size - foraGrade.length}/${numerosLaudo.size} pontos casam`;
      if (foraGrade.length) st.push(`AVISO: ${foraGrade.length} amostras sem ponto na grade (${foraGrade.slice(0, 5).join(',')}…)`);
      pdentro = pctDentro(p.talhao?.geom, p.grade.pontos);
      if (pdentro != null && pdentro < 80) st.push(`AVISO: só ${pdentro}% dos pontos dentro do polígono do talhão`);
    }
    const faixas = foraDaFaixa(p.laudo.resultados);
    if (Object.keys(faixas).length) st.push(`AVISO faixas: ${Object.entries(faixas).map(([k, v]) => `${k}×${v}`).join(' ')}`);

    if (importavel) {
      anosUsados.add(p.anoFinal);
      let gradeId = '';
      if (p.grade && !p.grade.erro) {
        gradeId = migId('grade', p.talhao.id, p.anoFinal, p.grade.origem);
        const pontos = p.grade.pontos.map(pt => ({ ...pt, profs: profsPorNum.get(pt.numero) ?? 1 }));
        rowsGrades.push({
          colecao: 'inv_grades', item_id: gradeId, empresa_id: p.talhao.empresaId ?? empresaId, atualizado_em: agora,
          dados: {
            id: gradeId, talhaoId: p.talhao.id, safra, epoca, dataReferencia: dataRef, ano: p.anoFinal,
            nome: `Grade ${p.anoFinal} (acervo)`, padraoAmostragemId: '', padraoNome: 'Importada (acervo)',
            customizado: true, densidade: 0, distanciaBorda: 0, rotacao: 0, aleatoriedade: 0,
            modoSel: 'regular', metodo: 'grid', profundidades: [], pontos, paraProcessar: false,
            criadoEm: agora, empresaId: p.talhao.empresaId ?? empresaId, origemImport: ORIGEM,
          },
        });
      } else st.push('PENDÊNCIA: grade-faltando (laudo importado sem pontos; vincular grade da InCeres depois)');

      const labId = migId('lab', p.talhao.id, p.anoFinal, p.laudo.arquivo, p.codigo);
      const elementos = [...new Set(p.laudo.resultados.flatMap(r => Object.keys(r.valores)))];
      const ordem = ['ph', 'p', 'k', 'ca', 'mg', 'al', 'hal', 'ctc', 'v', 'm', 'mo', 's', 'b', 'zn', 'cu', 'mn', 'textura', 't', 'satk', 'satca', 'satmg'];
      elementos.sort((a, b) => ordem.indexOf(a) - ordem.indexOf(b));
      rowsLaudos.push({
        colecao: 'inv_lab', item_id: labId, empresa_id: p.talhao.empresaId ?? empresaId, atualizado_em: agora,
        dados: {
          id: labId, talhaoId: p.talhao.id, safra, gradeId,
          laboratorio: p.laudo.formato === 'fabc' ? 'Fundação ABC' : 'Fundação ABC (via InCeres)',
          campanha: `Acervo ${p.anoFinal}`, resultados: p.laudo.resultados.map(r => ({ ...r, talhao: p.codigo })),
          elementos, criadoEm: agora, atualizadoEm: agora,
          dataReferencia: dataRef, ano: p.anoFinal, epoca,
          empresaId: p.talhao.empresaId ?? empresaId, origemImport: ORIGEM,
          ...(gradeId ? {} : { pendencia: 'grade-faltando' }),
        },
      });
    }

    linhas.push({
      codigo: p.codigo, ano: p.anoFinal, safra, dataRef, fonteData,
      talhao: p.talhao ? p.talhao.nome + (p.alias ? ' (ALIAS — confirmar!)' : '') : '—',
      grade: p.grade ? (p.grade.erro ? `ERRO: ${p.grade.erro}` : `${p.grade.pontos.length} pts (${p.grade.origem})`) : 'sem grade',
      laudo: `${p.laudo.arquivo} [${p.laudo.formato}] ${p.laudo.resultados.length} amostras`,
      casamento, pdentro, status: st.length ? st.join(' | ') : 'OK',
      importa: importavel,
      alternativos: p.candidatos.slice(1).map(c => c.arquivo),
    });
  }

  // 7. Safras faltantes
  const sq = await sb.from('app_kv').select('dados').eq('colecao', 'inv_bib_safras');
  const nomesSafras = new Set((sq.data ?? []).map(r => r.dados?.nome));
  const rowsSafras = [];
  for (const ano of [...anosUsados].sort()) {
    const nome = safraDoAno(ano);
    if (nomesSafras.has(nome)) continue;
    const id = migId('safra', nome);
    rowsSafras.push({
      colecao: 'inv_bib_safras', item_id: id, empresa_id: empresaId, atualizado_em: agora,
      dados: { id, categoria: 'safras', nome, escopo: 'empresa', empresaId, ativo: true, versao: 1, conteudo: { anoInicio: ano, anoFim: ano + 1, ativa: false }, criadoEm: agora, atualizadoEm: agora, criadoPor: 'migracao-acervo', origemImport: ORIGEM },
    });
  }

  // 8. Relatório
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const md = [];
  md.push(`# Migração do acervo — dry-run ${agora.slice(0, 16)}`);
  md.push(`\nPasta: \`${PASTA}\`  |  Fazenda: ${FAZENDA_ID}  |  Modo: ${APPLY ? '**APPLY**' : 'dry-run'}\n`);
  md.push(`| Talhão | Ano | Safra | Data ref (fonte) | Grade | Laudo | Casamento | %no polígono | Status |`);
  md.push(`|---|---|---|---|---|---|---|---|---|`);
  const doPlano = linhas.filter(l => l.talhao !== '—');
  for (const l of doPlano) {
    md.push(`| ${l.talhao} (${l.codigo}) | ${l.ano} | ${l.safra} | ${l.dataRef} (${l.fonteData}) | ${l.grade} | ${l.laudo} | ${l.casamento} | ${l.pdentro ?? '—'} | ${l.status} |`);
  }
  const foraFazenda = linhas.filter(l => l.talhao === '—');
  md.push(`\n## Ignorados — talhão não cadastrado nesta fazenda (${foraFazenda.length})`);
  const porArq = new Map();
  for (const l of foraFazenda) {
    const k = l.laudo.replace(/\[.*/, '').trim();
    if (!porArq.has(k)) porArq.set(k, []);
    porArq.get(k).push(`${l.codigo}(${l.ano})`);
  }
  for (const [arq, cods] of porArq) md.push(`- ${arq}: ${cods.join(', ')}`);
  md.push(`\n## Grades sem laudo (${gradesOrfas.length})`);
  for (const g of gradesOrfas) md.push(`- ${g.codigo} ${g.ano} — ${g.origem}${g.erro ? ` (ERRO: ${g.erro})` : ` (${g.pontos?.length ?? '?'} pts${g.zonas ? ', ZONAS' : ''})`}`);
  md.push(`\n## Avisos de parse (${avisos.length})`);
  for (const a of avisos) md.push(`- ${a}`);
  md.push(`\n## Resumo`);
  md.push(`- Unidades no plano: ${linhas.length} | importáveis: ${linhas.filter(l => l.importa).length}`);
  md.push(`- Grades a criar: ${rowsGrades.length} | Laudos a criar: ${rowsLaudos.length} (${rowsLaudos.filter(r => r.dados.pendencia).length} com pendência grade-faltando)`);
  md.push(`- Safras a criar: ${rowsSafras.map(r => r.dados.nome).join(', ') || 'nenhuma'}`);
  const relPath = path.join(OUT_DIR, 'relatorio.md');
  fs.writeFileSync(relPath, md.join('\n'));
  fs.writeFileSync(path.join(OUT_DIR, 'plano.json'), JSON.stringify({ linhas, rowsSafras, rowsGrades, rowsLaudos }, null, 1));
  console.log(md.join('\n'));
  console.log(`\nRelatório: ${relPath}`);

  // 9. Apply — tudo que acontecer aqui vai também para out/apply.log, para o
  // resultado poder ser conferido depois sem depender da rolagem do terminal.
  const logPath = path.join(OUT_DIR, 'apply.log');
  const log = [];
  const diga = m => { console.log(m); log.push(m); };
  if (!APPLY) {
    diga(`\n(dry-run — nada foi gravado. Para gravar, repita o comando com --apply no final.)`);
    fs.writeFileSync(logPath, `${agora} DRY-RUN\n` + log.join('\n'));
    return;
  }
  diga(`\n=== APPLY ${agora} ===`);
  try {
    for (const [nome, rows] of [['safras', rowsSafras], ['grades', rowsGrades], ['laudos', rowsLaudos]]) {
      let ok = 0;
      for (let i = 0; i < rows.length; i += 50) {
        const lote = rows.slice(i, i + 50);
        const up = await sb.from('app_kv').upsert(lote, { onConflict: 'colecao,item_id' });
        if (up.error) throw new Error(`upsert ${nome} (lote ${i}): ${up.error.message}`);
        ok += lote.length;
      }
      diga(`APPLY ${nome}: ${ok} gravados`);
    }
    for (const colecao of ['inv_grades', 'inv_lab']) {
      const c = await sb.from('app_kv').select('item_id', { count: 'exact', head: true })
        .eq('colecao', colecao).eq('dados->>origemImport', ORIGEM);
      if (c.error) throw new Error(`verificação ${colecao}: ${c.error.message}`);
      diga(`verificação ${colecao}: ${c.count} registros com origemImport=${ORIGEM}`);
    }
    diga('\n⚠️  Recarregue o app (fechar e abrir) ANTES de editar qualquer grade/laudo, para o boot puxar os novos registros.');
  } catch (e) {
    diga(`\n❌ FALHOU: ${e.message ?? e}`);
    fs.writeFileSync(logPath, log.join('\n'));
    console.error(`\nLog do apply: ${logPath}`);
    process.exit(1);
  }
  fs.writeFileSync(logPath, log.join('\n'));
  console.log(`\nLog do apply: ${logPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
