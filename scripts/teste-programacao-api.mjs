// Programação de safra vinda da Lavra (src/lib/programacao/nucleo.ts) —
// `npm run teste:programacao`.
//
// O que este arquivo protege:
//  1. VALIDAÇÃO — nenhuma prescrição nasce com zona sem dose, zona de outro
//     zoneamento, unidade trocada (kg/ha numa semente) ou chave desconhecida; e
//     os erros vêm TODOS de uma vez (a Lavra corrige o envio inteiro).
//  2. LIBERAÇÃO — só o zoneamento liberado AGORA no talhão aceita doses; o 409
//     devolve qual é o liberado.
//  3. IDEMPOTÊNCIA — reenvio igual não cria versão; reenvio diferente cria a
//     versão seguinte ligada à V1 (nunca uma duplicata); envio atrasado não
//     desfaz um mais novo; ids determinísticos (dois envios simultâneos caem na
//     mesma linha).

import assert from 'node:assert/strict';
import {
  validarFormato, validarZonas, conferirLiberacao, planejarGravacao, zonasDaProgramacao,
  idPrescricaoLavra, chaveIdempotencia, idsDoFc, parteIdTalhao, MAX_ITENS, MAX_ZONAS_ITEM,
} from '../src/lib/programacao/nucleo.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

// ── Fixture ─────────────────────────────────────────────────────────────────
const quad = (x, y, d = 0.001) => ({
  type: 'Polygon', coordinates: [[[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]],
});
const FC = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { id: '01', zona: 1, classe: 'Alta', cor: '#16a34a', areaHa: 30, potencialRank: 1 }, geometry: quad(-50, -25) },
    { type: 'Feature', properties: { id: '02', zona: 2, classe: 'Baixa', cor: '#dc2626', areaHa: 50, potencialRank: 2 }, geometry: quad(-50.01, -25) },
    { type: 'Feature', properties: { id: '02_2', zona: 2, classe: 'Baixa', cor: '#dc2626', areaHa: 20, potencialRank: 2 }, geometry: quad(-50.02, -25) },
  ],
};
const TALHAO = { id: 'tal1', areaHa: 100, empresaId: 'emp1', zoneamentoLiberadoId: 'zon1' };
const ZON = { id: 'zon1', talhaoId: 'tal1', nome: 'Zoneamento 1 — V2', fc: FC };

const doses = (a, b, c) => [{ idZona: '01', dose: a }, { idZona: '02', dose: b }, { idZona: '02_2', dose: c }];
function payload(extra = {}) {
  return {
    talhaoId: 'tal1', zoneamentoId: 'zon1', anoSafra: '2026/2027', tempo: 'NORMAL',
    origem: { sistema: 'lavra', cultivoId: '4812', planoId: 77, agronomo: 'Ana Souza', atualizadoEm: '2026-10-07T10:00:00-03:00' },
    prescricoes: [
      { chave: 'semente', tipo: 'sementes', produto: 'Soja NS 6601', unidade: 'sementes/ha', cultivar: 'NS 6601', zonas: doses(320000, 280000, 280000) },
      { chave: 'adubo_base', tipo: 'fertilizante', produto: 'MAP 11-52-00', unidade: 'kg/ha', zonas: doses(180, 220, 220) },
    ],
    ...extra,
  };
}
const valido = (raw) => { const r = validarFormato(raw); assert.equal(r.erros.length, 0, JSON.stringify(r.erros)); return r.payload; };
const codigos = (raw) => validarFormato(raw).erros.map(e => e.codigo);

// ── 1. Formato ──────────────────────────────────────────────────────────────
console.log('\nFormato');

t('payload completo passa e é normalizado (remover = [], planoId vira texto)', () => {
  const p = valido(payload());
  assert.deepEqual(p.remover, []);
  assert.equal(p.origem.planoId, '77');
  assert.equal(p.prescricoes.length, 2);
  assert.equal(p.prescricoes[0].cultivar, 'NS 6601');
});

t('corpo que não é objeto → erro, sem payload', () => {
  const r = validarFormato([1, 2]);
  assert.equal(r.payload, null);
  assert.equal(r.erros[0].codigo, 'invalido');
});

t('junta TODOS os erros numa passada', () => {
  const r = validarFormato({ ...payload(), talhaoId: '', anoSafra: '2026', tempo: 'INVERNO' });
  const campos = r.erros.map(e => e.campo);
  assert.ok(campos.includes('talhaoId') && campos.includes('anoSafra') && campos.includes('tempo'), campos.join(','));
});

t('anoSafra com anos não consecutivos é recusado', () => {
  assert.ok(codigos({ ...payload(), anoSafra: '2026/2028' }).includes('invalido'));
});

t('chave desconhecida, repetida e em conflito com remover', () => {
  const base = payload();
  assert.ok(codigos({ ...base, prescricoes: [{ ...base.prescricoes[1], chave: 'foliar' }] }).includes('chave-desconhecida'));
  assert.ok(codigos({ ...base, prescricoes: [base.prescricoes[1], base.prescricoes[1]] }).includes('chave-repetida'));
  assert.ok(codigos({ ...base, remover: ['adubo_base'] }).includes('conflito-remover'));
});

t('tipo incompatível com a chave (semente como fertilizante)', () => {
  const base = payload();
  assert.ok(codigos({ ...base, prescricoes: [{ ...base.prescricoes[0], tipo: 'fertilizante' }] }).includes('tipo-incompativel'));
});

t('unidade trocada: kg/ha em semente, sementes/ha em calcário', () => {
  const base = payload();
  assert.ok(codigos({ ...base, prescricoes: [{ ...base.prescricoes[0], unidade: 'kg/ha' }] }).includes('unidade-invalida'));
  assert.ok(codigos({ ...base, prescricoes: [{ chave: 'corretivo_calcario', tipo: 'corretivo', produto: 'Calcário dolomítico', unidade: 'sementes/ha', zonas: doses(1, 2, 3) }] }).includes('unidade-invalida'));
});

t('sementes/m sem espaçamento é recusado; com espaçamento passa', () => {
  const base = payload();
  const sem = { ...base.prescricoes[0], unidade: 'sementes/m', zonas: doses(14, 12, 12) };
  assert.ok(codigos({ ...base, prescricoes: [sem] }).includes('obrigatorio'));
  valido({ ...base, prescricoes: [{ ...sem, espacamentoM: 0.45 }] });
});

t('cultivar em adubo é recusado (só semente leva parâmetros de semente)', () => {
  const base = payload();
  assert.ok(codigos({ ...base, prescricoes: [{ ...base.prescricoes[1], cultivar: 'X' }] }).includes('invalido'));
});

t('dose negativa, texto ou ausente → dose-invalida; dose 0 é aceita (não aplica)', () => {
  const base = payload();
  for (const d of [-1, '180', null, Number.NaN]) {
    assert.ok(codigos({ ...base, prescricoes: [{ ...base.prescricoes[1], zonas: [{ idZona: '01', dose: d }, ...doses(0, 1, 1).slice(1)] }] }).includes('dose-invalida'), String(d));
  }
  valido({ ...base, prescricoes: [{ ...base.prescricoes[1], zonas: doses(0, 220, 220) }] });
});

t('zona repetida no mesmo item', () => {
  const base = payload();
  const r = validarFormato({ ...base, prescricoes: [{ ...base.prescricoes[1], zonas: [...doses(1, 2, 3), { idZona: '02', dose: 9 }] }] });
  const e = r.erros.find(x => x.codigo === 'zona-repetida');
  assert.ok(e); assert.deepEqual(e.zonas, ['02']);
});

t('cultivoId com caractere fora do padrão é recusado (vira parte do id)', () => {
  assert.ok(validarFormato({ ...payload(), origem: { ...payload().origem, cultivoId: 'a/b' } }).erros.some(e => e.campo === 'origem.cultivoId'));
});

t('envio vazio (sem prescricoes e sem remover) é recusado', () => {
  assert.ok(codigos({ ...payload(), prescricoes: [] }).includes('vazio'));
  valido({ ...payload(), prescricoes: [], remover: ['cobertura_2'] });
});

// ── 2. Liberação e zonas ────────────────────────────────────────────────────
console.log('\nLiberação e zonas');

t('zoneamento liberado → ok', () => {
  assert.deepEqual(conferirLiberacao({ zoneamentoId: 'zon1' }, TALHAO, ZON), { ok: true });
});

t('talhão sem liberação → nao-liberado, liberado null', () => {
  const r = conferirLiberacao({ zoneamentoId: 'zon1' }, { ...TALHAO, zoneamentoLiberadoId: null }, ZON);
  assert.equal(r.ok, false); assert.equal(r.motivo, 'nao-liberado'); assert.equal(r.zoneamentoLiberadoId, null);
});

t('liberação trocada → trocado, devolve o liberado atual', () => {
  const r = conferirLiberacao({ zoneamentoId: 'zonVelho' }, TALHAO, ZON);
  assert.equal(r.motivo, 'trocado'); assert.equal(r.zoneamentoLiberadoId, 'zon1');
});

t('espelho apontando para zoneamento de outro talhão → recusa', () => {
  const r = conferirLiberacao({ zoneamentoId: 'zon1' }, TALHAO, { ...ZON, talhaoId: 'outro' });
  assert.equal(r.motivo, 'outro-talhao');
  assert.equal(conferirLiberacao({ zoneamentoId: 'zon1' }, TALHAO, null).motivo, 'outro-talhao');
});

t('zona faltando e zona inexistente, com a lista', () => {
  const p = valido({ ...payload(), prescricoes: [{ ...payload().prescricoes[1], zonas: [{ idZona: '01', dose: 1 }, { idZona: '99', dose: 1 }] }] });
  const e = validarZonas(p.prescricoes, FC);
  assert.deepEqual(e.find(x => x.codigo === 'zona-inexistente').zonas, ['99']);
  assert.deepEqual(e.find(x => x.codigo === 'zona-faltando').zonas, ['02', '02_2']);
});

t('todas as zonas presentes → sem erro', () => {
  assert.deepEqual(validarZonas(valido(payload()).prescricoes, FC), []);
});

t('polígono sem id vira z<índice> (mesma regra da tela de Prescrições)', () => {
  const fc = { ...FC, features: [{ ...FC.features[0], properties: { zona: 1 } }] };
  assert.deepEqual(idsDoFc(fc), ['z0']);
});

t('zonas: área é fatia da área do talhão, cor/classe/rank do fc, dose da Lavra', () => {
  const z = zonasDaProgramacao(FC, 110, doses(1, 2, 3));
  assert.deepEqual(z.map(x => x.dose), [1, 2, 3]);
  const soma = z.reduce((s, x) => s + x.areaHa, 0);
  assert.ok(Math.abs(soma - 110) < 0.02, String(soma));
  assert.equal(z[0].classe, 'Alta'); assert.equal(z[0].cor, '#16a34a'); assert.equal(z[0].potencialRank, 1);
  assert.equal(z[2].nomeZona, '2');   // 02_2 é pedaço da zona 2
});

// ── 3. Idempotência ─────────────────────────────────────────────────────────
console.log('\nIdempotência');

const AGORA1 = '2026-10-07T13:00:00.000Z';
const AGORA2 = '2026-10-07T14:00:00.000Z';
const ctx = (existentes, agora = AGORA1) => ({ talhao: TALHAO, zoneamento: ZON, existentes, agora });

t('1º envio cria V1 de cada item, ids determinísticos, modo manual, fc copiado', () => {
  const { resultados, gravar } = planejarGravacao(valido(payload()), ctx([]));
  assert.deepEqual(resultados.map(r => [r.chave, r.acao, r.versao]), [['semente', 'criada', 1], ['adubo_base', 'criada', 1]]);
  const s = gravar[0];
  assert.equal(s.id, idPrescricaoLavra('tal1', '4812', 'semente', 1));
  assert.equal(s.origemId, undefined);
  assert.equal(s.modo, 'manual');
  assert.equal(s.tipo, 'sementes');
  assert.equal(s.unidade, 'sementes/ha');
  assert.equal(s.params.sementes.cultivar, 'NS 6601');
  assert.equal(s.params.sementes.germinacaoPct, 100);
  assert.equal(s.fc, FC);
  assert.equal(s.zoneamentoId, 'zon1');
  assert.equal(s.zoneamentoNome, 'Zoneamento 1 — V2');
  assert.equal(s.ano, '2026/2027');
  assert.equal(s.empresaId, 'emp1');
  assert.equal(s.origemLavra.chave, chaveIdempotencia('tal1', '4812', 'semente'));
  assert.equal(s.origemLavra.idRegistro, s.id);
  assert.equal(s.origemLavra.agronomo, 'Ana Souza');
  assert.equal(s.historico.length, 1);
  assert.deepEqual(gravar[1].params, {});
});

t('reenvio IDÊNTICO não cria versão (inalterada, mesmo id)', () => {
  const v1 = planejarGravacao(valido(payload()), ctx([])).gravar;
  const { resultados, gravar } = planejarGravacao(valido(payload()), ctx(v1, AGORA2));
  assert.equal(gravar.length, 0);
  assert.deepEqual(resultados.map(r => r.acao), ['inalterada', 'inalterada']);
  assert.equal(resultados[0].id, v1[0].id);
});

t('reenvio com dose diferente cria V2 ligada à V1 (historico acumula, exportes zerados)', () => {
  const v1 = planejarGravacao(valido(payload()), ctx([])).gravar;
  const p2 = payload({ origem: { ...payload().origem, atualizadoEm: '2026-10-07T11:00:00-03:00' } });
  p2.prescricoes[1] = { ...p2.prescricoes[1], zonas: doses(190, 230, 230) };
  const { resultados, gravar } = planejarGravacao(valido(p2), ctx([...v1, { ...v1[1], exportes: [{ em: AGORA1, por: 'x', formato: 'shp', arquivo: 'a.zip' }] }].slice(0, 2), AGORA2));
  assert.deepEqual(resultados.map(r => r.acao), ['inalterada', 'atualizada']);
  assert.equal(gravar.length, 1);
  const v2 = gravar[0];
  assert.equal(v2.versao, 2);
  assert.equal(v2.id, idPrescricaoLavra('tal1', '4812', 'adubo_base', 2));
  assert.equal(v2.origemId, v1[1].id);
  assert.equal(v2.historico.length, 2);
  assert.deepEqual(v2.exportes, []);
  assert.deepEqual(v2.zonas.map(z => z.dose), [190, 230, 230]);
});

t('V3 aponta para a V1, não para a V2', () => {
  const v1 = planejarGravacao(valido(payload()), ctx([])).gravar;
  const p2 = payload(); p2.prescricoes[1] = { ...p2.prescricoes[1], zonas: doses(1, 1, 1) };
  const v2 = planejarGravacao(valido(p2), ctx(v1)).gravar;
  const p3 = payload(); p3.prescricoes[1] = { ...p3.prescricoes[1], zonas: doses(2, 2, 2) };
  const v3 = planejarGravacao(valido(p3), ctx([...v1, ...v2])).gravar[0];
  assert.equal(v3.versao, 3);
  assert.equal(v3.origemId, v1[1].id);
});

t('versão editada na AP (id aleatório) conta na cadeia: Lavra cria a seguinte', () => {
  const v1 = planejarGravacao(valido(payload()), ctx([])).gravar;
  const editadaAp = { ...v1[1], id: 'abc123', versao: 2, origemId: v1[1].id, zonas: v1[1].zonas.map(z => ({ ...z, dose: 999 })) };
  const { resultados, gravar } = planejarGravacao(valido(payload()), ctx([...v1, editadaAp]));
  const r = resultados.find(x => x.chave === 'adubo_base');
  assert.equal(r.acao, 'atualizada'); assert.equal(r.versao, 3);
  assert.equal(gravar.find(g => g.origemLavra.item === 'adubo_base').origemLavra.idRegistro, idPrescricaoLavra('tal1', '4812', 'adubo_base', 3));
});

t('envio ATRASADO (atualizadoEm mais antigo) é ignorado, não desfaz o mais novo', () => {
  const novo = payload({ origem: { ...payload().origem, atualizadoEm: '2026-10-07T12:00:00-03:00' } });
  const v = planejarGravacao(valido(novo), ctx([])).gravar;
  const velho = payload(); velho.prescricoes[1] = { ...velho.prescricoes[1], zonas: doses(5, 5, 5) };
  const { resultados, gravar } = planejarGravacao(valido(velho), ctx(v));
  assert.equal(gravar.length, 0);
  assert.deepEqual(resultados.map(r => r.acao), ['ignorada', 'ignorada']);
});

t('trocar o zoneamento liberado gera versão nova com o fc novo', () => {
  const v1 = planejarGravacao(valido(payload()), ctx([])).gravar;
  const fc2 = { ...FC, features: FC.features.slice(0, 2) };
  const p = payload({ zoneamentoId: 'zon2' });
  p.prescricoes = p.prescricoes.map(i => ({ ...i, zonas: i.zonas.slice(0, 2) }));
  const { resultados, gravar } = planejarGravacao(valido(p), { talhao: { ...TALHAO, zoneamentoLiberadoId: 'zon2' }, zoneamento: { ...ZON, id: 'zon2', fc: fc2 }, existentes: v1, agora: AGORA2 });
  assert.deepEqual(resultados.map(r => r.acao), ['atualizada', 'atualizada']);
  assert.equal(gravar[0].zoneamentoId, 'zon2');
  assert.equal(gravar[0].fc.features.length, 2);
});

t('remover: versão nova marcada removida; repetir = inalterada; sem histórico = inexistente', () => {
  const v1 = planejarGravacao(valido(payload()), ctx([])).gravar;
  const rem = payload({ prescricoes: [], remover: ['adubo_base', 'cobertura_2'] });
  const r1 = planejarGravacao(valido(rem), ctx(v1, AGORA2));
  assert.deepEqual(r1.resultados.map(r => [r.chave, r.acao]), [['adubo_base', 'removida'], ['cobertura_2', 'inexistente']]);
  const g = r1.gravar[0];
  assert.equal(g.versao, 2); assert.equal(g.origemLavra.removida, true); assert.equal(g.origemId, v1[1].id);
  const r2 = planejarGravacao(valido(rem), ctx([...v1, g], AGORA2));
  assert.equal(r2.resultados[0].acao, 'inalterada');
  assert.equal(r2.gravar.length, 0);
});

t('reprogramar depois de remover cria versão nova (não fica "inalterada")', () => {
  const v1 = planejarGravacao(valido(payload()), ctx([])).gravar;
  const g = planejarGravacao(valido(payload({ prescricoes: [], remover: ['adubo_base'] })), ctx(v1)).gravar[0];
  const r = planejarGravacao(valido(payload()), ctx([...v1, g]));
  assert.equal(r.resultados.find(x => x.chave === 'adubo_base').acao, 'atualizada');
  assert.equal(r.resultados.find(x => x.chave === 'adubo_base').versao, 3);
});

t('cultivos diferentes não se misturam (cadeias por cultivo)', () => {
  const v1 = planejarGravacao(valido(payload()), ctx([])).gravar;
  const outro = payload({ origem: { ...payload().origem, cultivoId: '9999' } });
  const r = planejarGravacao(valido(outro), ctx(v1));
  assert.deepEqual(r.resultados.map(x => [x.acao, x.versao]), [['criada', 1], ['criada', 1]]);
});

t('chave e id incluem o talhão; id de talhão fora do padrão é sanitizado sem colidir', () => {
  assert.equal(chaveIdempotencia('tal1', '4812', 'semente'), 'lavra:tal1:4812:semente');
  assert.equal(idPrescricaoLavra('tal1', '4812', 'semente', 2), 'lavra__tal1__4812__semente__v2');
  const a = parteIdTalhao('a/b'), b = parteIdTalhao('a:b');
  assert.match(a, /^[A-Za-z0-9_.-]+$/); assert.match(b, /^[A-Za-z0-9_.-]+$/);
  assert.notEqual(a, b);
  assert.equal(parteIdTalhao('3f2c-uuid_1.x'), '3f2c-uuid_1.x');
});

// ── 4. Escopo: empresa, talhão, relógio, limites ────────────────────────────
console.log('\nEscopo (empresa × talhão), relógio e limites');

// Cadeia que pertence à empresa B (talhão talB) com o MESMO cultivoId — ids da
// Lavra são inteiros sequenciais, então o choque é plausível.
const TALHAO_B = { id: 'talB', areaHa: 50, empresaId: 'emp2', zoneamentoLiberadoId: 'zonB' };
const ZON_B = { id: 'zonB', talhaoId: 'talB', nome: 'Zon B', fc: FC };
const cadeiaB = () => planejarGravacao(valido(payload()), { talhao: TALHAO_B, zoneamento: ZON_B, existentes: [], agora: AGORA1 }).gravar;

t('remover com cultivoId de OUTRA empresa não grava nada nela (inexistente, sem aviso)', () => {
  const b = cadeiaB();
  const rem = payload({ prescricoes: [], remover: ['semente', 'adubo_base'], origem: { ...payload().origem, atualizadoEm: '2099-01-01T00:00:00Z' } });
  // atualizadoEm no futuro passa pelo relógio fixado em 2099 — o que se testa aqui é o escopo.
  const p = validarFormato(rem, Date.parse('2099-01-01T00:00:00Z')).payload;
  const { resultados, gravar, avisos } = planejarGravacao(p, ctx(b, AGORA2));
  assert.equal(gravar.length, 0);
  assert.deepEqual(resultados.map(r => [r.acao, r.id]), [['inexistente', null], ['inexistente', null]]);
  assert.deepEqual(avisos, []);   // nem a existência da cadeia de B vaza
});

t('envio com cultivoId de outra empresa cria cadeia PRÓPRIA: talhão/empresa do envio, sem herdar historico nem id de B', () => {
  const b = cadeiaB();
  const { resultados, gravar, avisos } = planejarGravacao(valido(payload()), ctx(b, AGORA2));
  assert.deepEqual(resultados.map(r => [r.acao, r.versao]), [['criada', 1], ['criada', 1]]);
  assert.ok(gravar.every(g => g.talhaoId === 'tal1' && g.empresaId === 'emp1' && g.historico.length === 1 && !g.origemId));
  assert.ok(gravar.every(g => !b.some(x => x.id === g.id)));
  assert.deepEqual(avisos, []);
});

t('revínculo: cultivo já programado no talhão 2 da MESMA empresa → cadeia nova no talhão 1 + aviso; talhão 2 intocado', () => {
  const T2 = { ...TALHAO, id: 'tal2', zoneamentoLiberadoId: 'zon2' };
  const v2 = planejarGravacao(valido(payload()), { talhao: T2, zoneamento: { ...ZON, id: 'zon2', talhaoId: 'tal2' }, existentes: [], agora: AGORA1 }).gravar;
  const { resultados, gravar, avisos } = planejarGravacao(valido(payload()), ctx(v2, AGORA2));
  assert.deepEqual(resultados.map(r => [r.acao, r.versao]), [['criada', 1], ['criada', 1]]);
  assert.ok(gravar.every(g => g.talhaoId === 'tal1' && !g.origemId && g.historico.length === 1));
  assert.ok(gravar.every(g => !v2.some(x => x.id === g.id)));
  assert.deepEqual(avisos.map(a => [a.codigo, a.item, a.talhoes]), [['cultivo-em-outro-talhao', 'semente', ['tal2']], ['cultivo-em-outro-talhao', 'adubo_base', ['tal2']]]);
});

t('revínculo + remover: não grava a versão "removida" no talhão antigo', () => {
  const T2 = { ...TALHAO, id: 'tal2', zoneamentoLiberadoId: 'zon2' };
  const v2 = planejarGravacao(valido(payload()), { talhao: T2, zoneamento: { ...ZON, id: 'zon2', talhaoId: 'tal2' }, existentes: [], agora: AGORA1 }).gravar;
  const r = planejarGravacao(valido(payload({ prescricoes: [], remover: ['adubo_base'] })), ctx(v2, AGORA2));
  assert.equal(r.gravar.length, 0);
  assert.equal(r.resultados[0].acao, 'inexistente');
  assert.equal(r.avisos[0].codigo, 'cultivo-em-outro-talhao');
});

t('depois do revínculo, a cadeia do talhão 1 segue sozinha (sem aviso, V2 ligada à V1 dele)', () => {
  const T2 = { ...TALHAO, id: 'tal2', zoneamentoLiberadoId: 'zon2' };
  const v2 = planejarGravacao(valido(payload()), { talhao: T2, zoneamento: { ...ZON, id: 'zon2', talhaoId: 'tal2' }, existentes: [], agora: AGORA1 }).gravar;
  const t1 = planejarGravacao(valido(payload()), ctx(v2, AGORA1)).gravar;
  const p = payload(); p.prescricoes[1] = { ...p.prescricoes[1], zonas: doses(9, 9, 9) };
  const r = planejarGravacao(valido(p), ctx([...v2, ...t1], AGORA2));
  assert.deepEqual(r.avisos, []);
  const g = r.gravar[0];
  assert.equal(g.versao, 2); assert.equal(g.origemId, t1[1].id); assert.equal(g.talhaoId, 'tal1');
});

t('atualizadoEm > agora + 24 h → 422 data-futura; dentro da folga passa', () => {
  const agora = Date.parse('2026-10-07T13:00:00Z');
  const futuro = payload({ origem: { ...payload().origem, atualizadoEm: '2026-10-08T13:00:01Z' } });
  const r = validarFormato(futuro, agora);
  assert.equal(r.payload, null);
  assert.ok(r.erros.some(e => e.campo === 'origem.atualizadoEm' && e.codigo === 'data-futura'));
  const ok23h = payload({ origem: { ...payload().origem, atualizadoEm: '2026-10-08T12:00:00Z' } });
  assert.equal(validarFormato(ok23h, agora).erros.length, 0);
  assert.ok(validarFormato({ ...payload(), origem: { ...payload().origem, atualizadoEm: '2099-01-01' } }).erros.some(e => e.codigo === 'data-futura'));
});

t('limites: itens > MAX_ITENS e zonas > MAX_ZONAS_ITEM → limite-excedido', () => {
  const base = payload();
  const muitos = Array.from({ length: MAX_ITENS + 1 }, () => base.prescricoes[1]);
  assert.ok(codigos({ ...base, prescricoes: muitos }).includes('limite-excedido'));
  const zonas = Array.from({ length: MAX_ZONAS_ITEM + 1 }, (_, i) => ({ idZona: `z${i}`, dose: 1 }));
  assert.ok(codigos({ ...base, prescricoes: [{ ...base.prescricoes[1], zonas }] }).includes('limite-excedido'));
});

console.log(`\n${ok} ok, ${fail} falha(s)`);
if (fail) process.exit(1);
