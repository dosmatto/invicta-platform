// Prescrição por zonas via EXPORTAÇÃO de nutrientes (src/lib/prescricao/porExportacao.ts)
// — roda: `npm run teste:prescricaoexportacao`.
//
// O que este arquivo protege:
//   • a conta do PDF de especificação (3500 kg/ha × 4,5 kg P/t, 05-32-04 → ≈112,8 kg/ha);
//   • cadastro antigo em óxido NÃO é convertido duas vezes;
//   • Modalidade 2: programado < necessidade → mesma fração do ideal, e o total
//     NUNCA é ultrapassado (nem com passo, nem com mín/máx);
//   • programado ≥ necessidade → cada zona no ideal, nenhuma passa dele, sobra explícita;
//   • garantia 0, coeficiente ausente, potencial ausente → erro com mensagem, nunca Infinity/NaN.
import assert from 'node:assert/strict';
import {
  doseIdealDaZona, coefElementoDoCadastro, classePotencialDe, potencialDasZonas, zoneamentoNoSemaforo, lerNumeroBR,
  prescreverPorExportacao, entregaDoFormulado, CLASSES_POTENCIAL, LIMIAR_DOSE_INTEIRA,
} from '../src/lib/prescricao/porExportacao.ts';
import { ELEMENTO_PARA_OXIDO } from '../src/lib/nutrienteBase.ts';
import { montarResumoPdf, contaExportacao, arredRel, doseArquivo, CASAS_LIMIAR } from '../src/lib/prescricao/resumo.ts';
import { resumoDoses } from '../src/lib/prescricao/calculo.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}
const perto = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
// Degrau da grade do ARQUIVO (sem passo da máquina): inteiro a partir de 100 kg/ha.
const degrau = (d) => (d >= 100 ? 1 : 0.01);
// O limiar do motor tem de ser o do arquivo — se um mudar sozinho, A1 volta.
assert.equal(LIMIAR_DOSE_INTEIRA, CASAS_LIMIAR, 'limiar de dose inteira divergente de resumo.ts');
const usado = (zonas, res) => zonas.reduce((s, z) => s + res.porZona[z.id].doseKgHa * z.areaHa, 0);
const finitoTudo = (res) => {
  for (const [k, v] of Object.entries(res)) {
    if (typeof v === 'number') assert.ok(Number.isFinite(v), `${k} = ${v}`);
  }
  for (const z of Object.values(res.porZona)) for (const [k, v] of Object.entries(z)) assert.ok(Number.isFinite(v), `zona.${k} = ${v}`);
};

console.log('\nConta de uma zona\n');

t('exemplo do PDF: 3500 kg/ha × 4,5 kg P/t, 05-32-04 → 15,75 P → 36,09 P₂O₅ → ≈112,8 kg/ha', () => {
  const c = doseIdealDaZona(3500, 4.5, 'p2o5', 32);
  assert.ok(perto(c.exportElementoKgHa, 15.75), `P=${c.exportElementoKgHa}`);
  assert.ok(perto(c.exportOxidoKgHa, 15.75 * 2.291335, 1e-4), `P2O5=${c.exportOxidoKgHa}`);
  assert.equal(Math.round(c.exportOxidoKgHa * 100) / 100, 36.09);
  assert.equal(Math.round(c.doseIdealKgHa * 10) / 10, 112.8);
});

t('fator P→P₂O₅ é o de nutrienteBase (2,291335) e K→K₂O 1,2046', () => {
  assert.ok(perto(ELEMENTO_PARA_OXIDO.p2o5, 2.291335, 1e-6));
  assert.ok(perto(ELEMENTO_PARA_OXIDO.k2o, 1.2046, 1e-4));
});

t('potássio: 3500 kg/ha × 18 kg K/t, KCl 60% → 63 K → 75,9 K₂O → ≈126,5 kg/ha', () => {
  const c = doseIdealDaZona(3500, 18, 'k2o', 60);
  assert.ok(perto(c.exportElementoKgHa, 63));
  assert.equal(Math.round(c.doseIdealKgHa * 10) / 10, 126.5);
});

t('garantia 0, coeficiente ausente ou potencial ausente → null (nunca Infinity)', () => {
  assert.equal(doseIdealDaZona(3500, 4.5, 'p2o5', 0), null);
  assert.equal(doseIdealDaZona(3500, 4.5, 'p2o5', undefined), null);
  assert.equal(doseIdealDaZona(3500, null, 'p2o5', 32), null);
  assert.equal(doseIdealDaZona(undefined, 4.5, 'p2o5', 32), null);
  assert.equal(doseIdealDaZona(NaN, 4.5, 'p2o5', 32), null);
});

console.log('\nCadastro: elemento × óxido\n');

t('cadastro novo (baseElemento) usa o número como está', () => {
  const r = coefElementoDoCadastro({ coeficientes: { p2o5: 4.5 }, baseElemento: true }, 'p2o5');
  assert.deepEqual(r, { coefElementoKgT: 4.5, deOxido: false });
});

t('cadastro antigo em óxido converte UMA vez — a dose final é a mesma do cadastro em elemento', () => {
  const oxido = 4.5 * ELEMENTO_PARA_OXIDO.p2o5;     // 10,311 kg P₂O₅/t
  const r = coefElementoDoCadastro({ coeficientes: { p2o5: oxido } }, 'p2o5');
  assert.equal(r.deOxido, true);
  assert.ok(perto(r.coefElementoKgT, 4.5, 1e-9));
  const dose = doseIdealDaZona(3500, r.coefElementoKgT, 'p2o5', 32).doseIdealKgHa;
  const doseNovo = doseIdealDaZona(3500, 4.5, 'p2o5', 32).doseIdealKgHa;
  assert.ok(perto(dose, doseNovo, 1e-9), `${dose} vs ${doseNovo}`);
});

t('coeficiente não declarado → null; zero declarado → 0 (são coisas diferentes)', () => {
  assert.equal(coefElementoDoCadastro({ coeficientes: {}, baseElemento: true }, 'k2o'), null);
  assert.equal(coefElementoDoCadastro(null, 'k2o'), null);
  assert.deepEqual(coefElementoDoCadastro({ coeficientes: { k2o: 0 }, baseElemento: true }, 'k2o'), { coefElementoKgT: 0, deOxido: false });
});

console.log('\nClasses e potencial por zona\n');

t('rótulo EXATO das 5 classes (variações de gênero/separador/acento) → classe; o resto → null', () => {
  assert.equal(classePotencialDe('ALTA'), 'Alta');
  assert.equal(classePotencialDe('Alto'), 'Alta');
  assert.equal(classePotencialDe('Média Alta'), 'Média-alta');
  assert.equal(classePotencialDe('MEDIO-ALTO'), 'Média-alta');
  assert.equal(classePotencialDe('medio_baixo'), 'Média-baixa');
  assert.equal(classePotencialDe('Média'), 'Média');
  assert.equal(classePotencialDe(' baixo '), 'Baixa');
  // A2: o classeZona() global casaria estes por pedaço — aqui não.
  for (const livre of ['Muito alto', 'Muito baixo', 'Baixada úmida', 'Alto do morro', 'Zona 7', '—', 'Classe 3', '']) {
    assert.equal(classePotencialDe(livre), null, livre);
  }
  assert.equal(CLASSES_POTENCIAL.length, 5);
});

t('zoneamento no semáforo: ≤5 rótulos distintos, todos exatos, cada um numa classe', () => {
  assert.equal(zoneamentoNoSemaforo(['Alta', 'Média-alta', 'Média', 'Média-baixa', 'Baixa']), true);
  assert.equal(zoneamentoNoSemaforo(['Alto', 'Médio', 'Baixo', 'Alto']), true, 'repetir a mesma classe em 2 polígonos vale');
  assert.equal(zoneamentoNoSemaforo(['Muito alto', 'Alto', 'Médio-alto', 'Médio', 'Médio-baixo', 'Baixo', 'Muito baixo']), false, '7 classes do MEAP');
  assert.equal(zoneamentoNoSemaforo(['Alta', 'Alto']), false, 'dois rótulos na mesma classe');
  assert.equal(zoneamentoNoSemaforo(['Alta', 'Baixada úmida']), false);
});

t('override desta prescrição > cadastro pela classe > falta', () => {
  const p = potencialDasZonas(
    [{ id: 'a', classe: 'Alta' }, { id: 'b', classe: 'Baixa' }, { id: 'd', classe: 'Média' }],
    { Alta: 4200, Baixa: 2800 },
    { b: 3000 },
  );
  assert.deepEqual(p.a, { kgHa: 4200, origem: 'cadastro', classe: 'Alta' });
  assert.deepEqual(p.b, { kgHa: 3000, origem: 'override', classe: 'Baixa' });
  assert.deepEqual(p.d, { kgHa: null, origem: 'falta', classe: 'Média' }, 'classe sem número no cadastro também pede');
});

t('A2: zoneamento de 7 classes ("Muito alto"…"Muito baixo") NÃO puxa do cadastro — todas pedem o número', () => {
  const rot = ['Muito alto', 'Alto', 'Médio-alto', 'Médio', 'Médio-baixo', 'Baixo', 'Muito baixo'];
  const cad = { Alta: 7000, 'Média-alta': 6000, Média: 5000, 'Média-baixa': 4000, Baixa: 3500 };
  const p = potencialDasZonas(rot.map((c, i) => ({ id: `z${i}`, classe: c })), cad, { z0: 7500 });
  assert.deepEqual(p.z0, { kgHa: 7500, origem: 'override', classe: null }, 'override continua valendo');
  for (let i = 1; i < 7; i++) assert.deepEqual(p[`z${i}`], { kgHa: null, origem: 'falta', classe: null }, rot[i]);
});

t('A2: rótulo livre num zoneamento de 3 classes faz o zoneamento inteiro pedir o número', () => {
  const p = potencialDasZonas([{ id: 'a', classe: 'Alta' }, { id: 'b', classe: 'Baixada úmida' }, { id: 'c', classe: 'Média' }], { Alta: 4200, Média: 3500, Baixa: 2800 }, {});
  for (const id of ['a', 'b', 'c']) assert.equal(p[id].origem, 'falta', id);
});

t('A7: "3.500" é três mil e quinhentos; "3,5" e "3.5" continuam decimais', () => {
  assert.equal(lerNumeroBR('3.500'), 3500);
  assert.equal(lerNumeroBR('12.345.678'), 12345678);
  assert.equal(lerNumeroBR('3.500,5'), 3500.5);
  assert.equal(lerNumeroBR('3500'), 3500);
  assert.equal(lerNumeroBR('3,5'), 3.5);
  assert.equal(lerNumeroBR('3.5'), 3.5);
  assert.equal(lerNumeroBR(''), undefined);
  assert.equal(lerNumeroBR('abc'), undefined);
});

t('A7: potencial implausível (< 300 kg/ha) gera aviso', () => {
  const r = prescreverPorExportacao({ zonas: [{ id: 'a', nome: '1', areaHa: 10, potencialKgHa: 3.5 }], nutriente: 'p2o5', coefElementoKgT: 4.5, garantiaPct: 32, cenario: 'livre' });
  assert.ok(r.avisos.some(a => /t\/ha/.test(a) && /3\.500/.test(a)), r.avisos.join(' | '));
});

console.log('\nModalidade 1 — livre\n');

const Z = [
  { id: 'alta', nome: '1', areaHa: 10, potencialKgHa: 4200 },
  { id: 'media', nome: '2', areaHa: 20, potencialKgHa: 3500 },
  { id: 'baixa', nome: '3', areaHa: 10, potencialKgHa: 2800 },
];
const BASE = { zonas: Z, nutriente: 'p2o5', coefElementoKgT: 4.5, garantiaPct: 32 };
const ideal = (pot) => doseIdealDaZona(pot, 4.5, 'p2o5', 32).doseIdealKgHa;

t('cada zona no ideal (na grade do arquivo, AO MAIS PRÓXIMO); necessidade = Σ ideal × área; média ponderada por área', () => {
  const r = prescreverPorExportacao({ ...BASE, cenario: 'livre' });
  assert.equal(r.ok, true);
  for (const z of Z) {
    const d = r.porZona[z.id].doseKgHa, id = ideal(z.potencialKgHa);
    assert.ok(Math.abs(d - id) <= degrau(id) / 2 + 1e-9, `${z.id}: ${d} vs ${id}`);
    assert.equal(arredRel(d), d, 'gravado == exportado');
  }
  assert.equal(r.porZona.alta.doseKgHa, 135);    // ideal 135,33 → inteiro (≥100)
  assert.equal(r.porZona.media.doseKgHa, 113);   // ideal 112,78 → 113: o exemplo do PDF na Modalidade 1
  assert.equal(r.porZona.baixa.doseKgHa, 90.22); // ideal 90,22 (<100: centésimo)
  const nec = Z.reduce((s, z) => s + ideal(z.potencialKgHa) * z.areaHa, 0);
  assert.ok(perto(r.necessidadeKg, nec));
  assert.ok(perto(r.usadoKg, usado(Z, r)));
  assert.ok(perto(r.doseMedia, r.usadoKg / 40));
  assert.ok(perto(r.doseMediaIdeal, ideal(3500)), 'zona média no meio, áreas simétricas → média = ideal da média');
  assert.equal(r.programadoKg, null);
  assert.equal(r.sobraKg, null);
  finitoTudo(r);
});

t('exemplo do PDF na Modalidade 1: 3500 kg/ha, 4,5 kg P/t, 05-32-04 → 113 kg/ha (112,78 ao mais próximo)', () => {
  const r = prescreverPorExportacao({ ...BASE, zonas: [{ id: 'a', areaHa: 10, potencialKgHa: 3500 }], cenario: 'livre' });
  assert.equal(r.porZona.a.doseKgHa, 113);
  assert.equal(arredRel(r.porZona.a.doseKgHa), 113);
});

t('A6: livre com mín/máx/passo — passo ao mais próximo; a máxima trava em cima; a MÍNIMA da máquina sobe a dose (com aviso)', () => {
  const r = prescreverPorExportacao({ ...BASE, cenario: 'livre', doseMin: 100, doseMax: 130, incremento: 5 });
  assert.equal(r.porZona.baixa.doseKgHa, 100);       // ideal 90,2 → 90 < mínimo → sobe para 100 (grade 5)
  assert.equal(r.porZona.alta.doseKgHa, 130);        // ideal 135,3 → 135 > máx → desce um passo
  assert.equal(r.porZona.media.doseKgHa, 115);       // 112,8 → passo 5 ao mais próximo (o ideal não é teto na Mod. 1)
  assert.ok(r.avisos.some(a => /dose máxima deixou 1 zona/.test(a)), r.avisos.join(' | '));
  assert.ok(r.avisos.some(a => /mínima da máquina deixou 1 zona\(s\) ACIMA do ideal da exportação: 3/.test(a)), r.avisos.join(' | '));
});

t('Modalidade 1: mínimo sem passo sobe para a mínima na grade do arquivo; mín > máx é erro', () => {
  const r = prescreverPorExportacao({ ...BASE, cenario: 'livre', doseMin: 95.5 });
  assert.equal(r.porZona.baixa.doseKgHa, 95.5);      // ideal 90,22 → 95,5
  assert.equal(r.porZona.media.doseKgHa, 113);       // acima da mínima: não mexe
  const r2 = prescreverPorExportacao({ ...BASE, cenario: 'livre', doseMin: 120, doseMax: 100 });
  assert.equal(r2.ok, false);
  assert.ok(r2.erros.some(x => /máxima é menor que a mínima/.test(x)));
});

t('A6: o caso do verificador — doseMax 113, passo 5, ideal 112,78 → 110 (antes 115)', () => {
  const r = prescreverPorExportacao({ ...BASE, zonas: [Z[1]], cenario: 'livre', doseMax: 113, incremento: 5 });
  assert.equal(r.porZona.media.doseKgHa, 110);
});

t('A6: varredura da Modalidade 1 — nunca acima da dose máxima, perto do ideal (≤ 1 degrau), gravado == exportado', () => {
  let s = 777;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let k = 0; k < 500; k++) {
    const zonas = Array.from({ length: 1 + Math.floor(rnd() * 8) }, (_, i) => ({ id: `z${i}`, areaHa: 0.01 + rnd() * 40, potencialKgHa: 1500 + rnd() * 6000 }));
    const doseMax = rnd() < 0.5 ? 50 + rnd() * 200 : undefined;
    const incremento = rnd() < 0.5 ? [0.5, 1, 2.5, 5, 10][Math.floor(rnd() * 5)] : undefined;
    const doseMin = rnd() < 0.4 ? rnd() * Math.min(150, doseMax ?? 150) : undefined;
    const r = prescreverPorExportacao({
      zonas, nutriente: rnd() < 0.5 ? 'p2o5' : 'k2o', coefElementoKgT: 2 + rnd() * 18, garantiaPct: 10 + rnd() * 50, cenario: 'livre',
      doseMin, doseMax, incremento,
    });
    const semGrade = r.avisos.some(a => /não há dose entre a mínima e a máxima/.test(a));
    for (const z of zonas) {
      const d = r.porZona[z.id].doseKgHa, id = r.porZona[z.id].doseIdealKgHa;
      assert.ok(d <= (doseMax ?? Infinity) + 1e-9, `caso ${k}: ${d} > máx ${doseMax}`);
      if (doseMin != null && !semGrade) assert.ok(d >= doseMin - 1e-9, `caso ${k}: ${d} < mín ${doseMin}`);
      if ((doseMax == null || id + (incremento ?? 1) < doseMax) && (doseMin == null || id > doseMin + (incremento ?? 1))) {
        assert.ok(Math.abs(d - id) <= (incremento ?? 0) + 1 + 1e-9, `caso ${k}: ${d} longe do ideal ${id}`);
      }
      assert.equal(arredRel(d), d, `caso ${k}: ${d} não está na grade do arquivo`);
    }
  }
});

console.log('\nModalidade 2 — volume programado (Q3: menor que a necessidade)\n');

t('programado = 60% da necessidade → cada zona com 60% do ideal, sem passar do total', () => {
  const nec = prescreverPorExportacao({ ...BASE, cenario: 'livre' }).necessidadeKg;
  const prog = nec * 0.6;
  const r = prescreverPorExportacao({ ...BASE, cenario: 'total', programadoKg: prog });
  assert.equal(r.ok, true);
  assert.ok(perto(r.fracao, 0.6));
  for (const z of Z) {
    const d = r.porZona[z.id].doseKgHa, alvo = 0.6 * ideal(z.potencialKgHa);
    assert.ok(Math.abs(d - alvo) <= degrau(alvo) + 1e-9, `${z.id}: ${d} vs ${alvo}`);
    assert.equal(arredRel(d), d, 'dose já na grade do arquivo (sem resíduo de float)');
  }
  const u = usado(Z, r);
  assert.ok(u <= prog + 1e-6, `usado ${u} > programado ${prog}`);
  assert.ok(prog - u < 0.01 * 40 + 1e-6, `sobra grande demais: ${prog - u}`);
  assert.ok(perto(r.sobraKg, prog - u, 1e-6));
  assert.ok(r.avisos.some(a => /60%/.test(a)), r.avisos.join(' | '));
  finitoTudo(r);
});

t('dose média programada (kg/ha × área) é o mesmo que o volume total', () => {
  const r1 = prescreverPorExportacao({ ...BASE, cenario: 'total', programadoKg: 80 * 40 });
  const r2 = prescreverPorExportacao({ ...BASE, cenario: 'total', programadoKg: 3200 });
  assert.deepEqual(r1.porZona, r2.porZona);
  assert.ok(r1.doseMedia <= 80 + 1e-9);
});

t('com incremento 5: doses na grade, nunca acima do ideal, total nunca ultrapassado', () => {
  const nec = prescreverPorExportacao({ ...BASE, cenario: 'livre' }).necessidadeKg;
  for (const f of [0.3, 0.55, 0.77, 0.93, 0.999]) {
    const prog = nec * f;
    const r = prescreverPorExportacao({ ...BASE, cenario: 'total', programadoKg: prog, incremento: 5 });
    for (const z of Z) {
      const d = r.porZona[z.id].doseKgHa;
      assert.ok(perto(d / 5, Math.round(d / 5), 1e-6), `${d} fora da grade 5`);
      assert.ok(d <= ideal(z.potencialKgHa) + 1e-9, `${z.id} passou do ideal`);
    }
    assert.ok(usado(Z, r) <= prog + 1e-6, `f=${f}: usado ${usado(Z, r)} > ${prog}`);
  }
});

t('com dose mínima: piso respeitado, fração das outras cai, total não ultrapassa', () => {
  const nec = prescreverPorExportacao({ ...BASE, cenario: 'total', programadoKg: 1 }).necessidadeKg;
  const prog = nec * 0.6;                     // 60% de 90,2 = 54 < mínimo 60
  const r = prescreverPorExportacao({ ...BASE, cenario: 'total', programadoKg: prog, doseMin: 60 });
  assert.ok(r.porZona.baixa.doseKgHa >= 60 - 1e-9, `baixa ${r.porZona.baixa.doseKgHa}`);
  assert.ok(usado(Z, r) <= prog + 1e-6);
  assert.ok(r.porZona.alta.doseKgHa < 0.6 * ideal(4200), 'a fração efetiva das outras ficou abaixo de 60%');
  assert.ok(r.avisos.some(a => /fração do ideal por zona ficou entre/.test(a)), r.avisos.join(' | '));
  assert.ok(!r.avisos.some(a => /cada zona recebe/.test(a)), 'A5: não promete fração única quando os limites a quebraram');
});

t('A5: programado ≥ necessidade com doseMax — o aviso não diz "cada zona no ideal"', () => {
  const r = prescreverPorExportacao({ ...BASE, cenario: 'total', programadoKg: 1e6, doseMax: 100 });
  assert.ok(r.avisos.some(a => /exceto 2 limitada\(s\) pela dose máxima/.test(a)), r.avisos.join(' | '));
  assert.ok(!r.avisos.some(a => /cada zona fica no ideal/.test(a)));
});

t('A5: 95% com doseMax 120 — informa a faixa real da fração por zona', () => {
  const nec = prescreverPorExportacao({ ...BASE, cenario: 'livre' }).necessidadeKg;
  const r = prescreverPorExportacao({ ...BASE, cenario: 'total', programadoKg: nec * 0.95, doseMax: 120 });
  const a = r.avisos.find(x => /ficou entre/.test(x));
  assert.ok(a, r.avisos.join(' | '));
  assert.ok(!r.avisos.some(x => /cada zona recebe 95/.test(x)));
});

t('A4: zona minúscula não engole o troco — desvio da fração única ≤ 1 degrau da grade', () => {
  const zonas = [
    { id: 'g', areaHa: 40, potencialKgHa: 4200 },
    { id: 'p', areaHa: 0.02, potencialKgHa: 4200 },
    { id: 'm', areaHa: 12.37, potencialKgHa: 3100 },
  ];
  const op = { zonas, nutriente: 'p2o5', coefElementoKgT: 4.5, garantiaPct: 32 };
  const nec = prescreverPorExportacao({ ...op, cenario: 'livre' }).necessidadeKg;
  const r = prescreverPorExportacao({ ...op, cenario: 'total', programadoKg: nec * 0.6 });
  for (const z of zonas) {
    const alvo = r.porZona[z.id].doseIdealKgHa * r.fracao;
    assert.ok(Math.abs(r.porZona[z.id].doseKgHa - alvo) <= degrau(alvo) + 1e-9, `${z.id}: ${r.porZona[z.id].doseKgHa} vs ${alvo}`);
  }
});

t('com dose máxima: teto respeitado, o volume vai para as outras sem passar do ideal', () => {
  const nec = prescreverPorExportacao({ ...BASE, cenario: 'total', programadoKg: 1 }).necessidadeKg;
  const prog = nec * 0.8;
  const r = prescreverPorExportacao({ ...BASE, cenario: 'total', programadoKg: prog, doseMax: 95 });
  for (const z of Z) {
    assert.ok(r.porZona[z.id].doseKgHa <= 95 + 1e-9);
    assert.ok(r.porZona[z.id].doseKgHa <= ideal(z.potencialKgHa) + 1e-9);
  }
  assert.ok(usado(Z, r) <= prog + 1e-6);
});

t('programado não alcança o mínimo em todas as zonas → mínimo ignorado com aviso, total respeitado', () => {
  const r = prescreverPorExportacao({ ...BASE, cenario: 'total', programadoKg: 1000, doseMin: 80 });
  assert.ok(r.avisos.some(a => /mínima em todas/.test(a)), r.avisos.join(' | '));
  assert.ok(usado(Z, r) <= 1000 + 1e-6);
  finitoTudo(r);
});

t('varredura (500 casos aleatórios): o programado NUNCA é ultrapassado e nenhuma zona passa do ideal', () => {
  let s = 12345;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let k = 0; k < 500; k++) {
    const n = 1 + Math.floor(rnd() * 9);
    const zonas = Array.from({ length: n }, (_, i) => ({ id: `z${i}`, areaHa: 0.3 + rnd() * 40, potencialKgHa: 1500 + rnd() * 4000 }));
    const op = {
      zonas, nutriente: rnd() < 0.5 ? 'p2o5' : 'k2o', coefElementoKgT: 2 + rnd() * 18, garantiaPct: 10 + rnd() * 50,
      cenario: 'total',
      doseMin: rnd() < 0.4 ? rnd() * 80 : undefined,
      doseMax: rnd() < 0.4 ? 80 + rnd() * 200 : undefined,
      incremento: rnd() < 0.5 ? [1, 2.5, 5, 10][Math.floor(rnd() * 4)] : undefined,
    };
    const nec = prescreverPorExportacao({ ...op, cenario: 'livre', doseMin: undefined, doseMax: undefined, incremento: undefined }).necessidadeKg;
    op.programadoKg = nec * (0.05 + rnd() * 1.4);
    const r = prescreverPorExportacao(op);
    assert.equal(r.ok, true, r.erros.join(' '));
    finitoTudo(r);
    const u = usado(zonas, r);
    assert.ok(u <= op.programadoKg + 1e-6, `caso ${k}: usado ${u} > programado ${op.programadoKg}`);
    for (const z of zonas) {
      assert.ok(r.porZona[z.id].doseKgHa <= r.porZona[z.id].doseIdealKgHa + 1e-9, `caso ${k}: ${z.id} passou do ideal`);
      assert.ok(r.porZona[z.id].doseKgHa >= 0);
    }
  }
});

t('A1: varredura (3000 casos) do que VAI PARA O ARQUIVO (arredRel∘doseArquivo): gravado == exportado, zero estouros do programado, ninguém acima do ideal', () => {
  let s = 4242;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  let estouros = 0, acimaIdeal = 0, diverge = 0;
  for (let k = 0; k < 3000; k++) {
    const n = 1 + Math.floor(rnd() * 9);
    const zonas = Array.from({ length: n }, (_, i) => ({ id: `z${i}`, areaHa: (rnd() < 0.1 ? 0.01 : 0.3) + rnd() * 40, potencialKgHa: 1500 + rnd() * 6000 }));
    const op = {
      zonas, nutriente: rnd() < 0.5 ? 'p2o5' : 'k2o', coefElementoKgT: 2 + rnd() * 18, garantiaPct: 10 + rnd() * 50,
      cenario: 'total',
      doseMin: rnd() < 0.3 ? rnd() * 60 : undefined,
      doseMax: rnd() < 0.3 ? 60 + rnd() * 200 : undefined,
      incremento: rnd() < 0.4 ? [0.5, 1, 2.5, 5, 10][Math.floor(rnd() * 5)] : undefined,
    };
    const nec = prescreverPorExportacao({ ...op, cenario: 'livre', doseMin: undefined, doseMax: undefined, incremento: undefined }).necessidadeKg;
    op.programadoKg = nec * (0.05 + rnd() * 1.6);
    if (!prescreverPorExportacao(op).ok) throw new Error(`caso ${k} inválido`);
    const r = prescreverPorExportacao(op);
    // Prescrição montada como a tela grava, e a dose do ARQUIVO como o SHP escreve.
    const p = { unidade: 'kg/ha', params: {}, zonas: zonas.map(z => ({ idZona: z.id, areaHa: z.areaHa, dose: r.porZona[z.id].doseKgHa })) };
    let totalArq = 0;
    for (const z of p.zonas) {
      const arq = arredRel(doseArquivo(p, z.dose));
      if (arq !== z.dose) diverge++;
      if (arq > r.porZona[z.idZona].doseIdealKgHa + 1e-9) acimaIdeal++;
      totalArq += arq * z.areaHa;
    }
    if (totalArq > op.programadoKg + 1e-6) estouros++;
  }
  assert.equal(diverge, 0, `${diverge} doses mudam ao exportar`);
  assert.equal(estouros, 0, `${estouros} casos estouram o programado no arquivo`);
  assert.equal(acimaIdeal, 0, `${acimaIdeal} zonas acima do ideal no arquivo`);
});

t('A1: o cenário do verificador (10/25/15 ha; 7000/5000/3500; 90% e 150%) no arquivo', () => {
  const zonas = [{ id: 'A', areaHa: 10, potencialKgHa: 7000 }, { id: 'B', areaHa: 25, potencialKgHa: 5000 }, { id: 'C', areaHa: 15, potencialKgHa: 3500 }];
  const op = { zonas, nutriente: 'p2o5', coefElementoKgT: 4.5, garantiaPct: 32 };
  const nec = prescreverPorExportacao({ ...op, cenario: 'livre' }).necessidadeKg;
  const r90 = prescreverPorExportacao({ ...op, cenario: 'total', programadoKg: nec * 0.9 });
  const arq = (r) => zonas.reduce((s, z) => s + arredRel(r.porZona[z.id].doseKgHa) * z.areaHa, 0);
  assert.ok(arq(r90) <= nec * 0.9 + 1e-6, `${arq(r90)} > ${nec * 0.9}`);
  const r150 = prescreverPorExportacao({ ...op, cenario: 'total', programadoKg: nec * 1.5 });
  assert.equal(arredRel(r150.porZona.A.doseKgHa), 225);   // ideal 225,55 — antes saía 226
  assert.equal(arredRel(r150.porZona.B.doseKgHa), 161);   // ideal 161,11
  assert.equal(arredRel(r150.porZona.C.doseKgHa), 112);   // ideal 112,78 — antes saía 113
});

console.log('\nModalidade 2 — programado ≥ necessidade (Q4)\n');

t('cada zona no ideal, nenhuma passa dele; sobra = programado − necessidade', () => {
  const nec = prescreverPorExportacao({ ...BASE, cenario: 'livre' }).necessidadeKg;
  const prog = nec * 1.5;
  const r = prescreverPorExportacao({ ...BASE, cenario: 'total', programadoKg: prog });
  for (const z of Z) {
    const d = r.porZona[z.id].doseKgHa;
    assert.ok(d <= ideal(z.potencialKgHa) + 1e-9, `${z.id} passou do ideal`);
    assert.ok(ideal(z.potencialKgHa) - d < degrau(ideal(z.potencialKgHa)) + 1e-9, `${z.id} longe do ideal`);
  }
  // A sobra = programado − necessidade, mais o que a grade do arquivo cortou (≤ 1 degrau por ha).
  assert.ok(r.sobraKg >= prog - nec - 1e-6 && r.sobraKg - (prog - nec) < 1 * 40 + 1e-6, `sobra ${r.sobraKg} vs ${prog - nec}`);
  assert.ok(r.fracao > 1);
  assert.ok(r.avisos.some(a => /sobra/.test(a)), r.avisos.join(' | '));
});

t('programado ≥ necessidade com incremento: arredonda PARA BAIXO (não passa do ideal)', () => {
  const r = prescreverPorExportacao({ ...BASE, cenario: 'total', programadoKg: 1e9, incremento: 10 });
  assert.equal(r.porZona.alta.doseKgHa, 130);   // ideal 135,3
  assert.equal(r.porZona.media.doseKgHa, 110);  // ideal 112,8
  assert.equal(r.porZona.baixa.doseKgHa, 90);   // ideal 90,2
});

console.log('\nDivisões perigosas — erro com mensagem, nunca Infinity/NaN\n');

t('garantia 0 → erro que fala do formulado', () => {
  const r = prescreverPorExportacao({ ...BASE, garantiaPct: 0, cenario: 'livre' });
  assert.equal(r.ok, false);
  assert.ok(r.erros.some(e => /P₂O₅/.test(e) && /formulado/.test(e)));
  finitoTudo(r);
});

t('coeficiente não declarado → erro que aponta o cadastro', () => {
  const r = prescreverPorExportacao({ ...BASE, coefElementoKgT: null, cenario: 'livre' });
  assert.equal(r.ok, false);
  assert.ok(r.erros.some(e => /coeficiente/.test(e)));
  finitoTudo(r);
});

t('zona sem potencial → erro com o nome da zona', () => {
  const r = prescreverPorExportacao({ ...BASE, zonas: [...Z, { id: 'x', nome: 'Z7', areaHa: 5, potencialKgHa: null }], cenario: 'livre' });
  assert.equal(r.ok, false);
  assert.ok(r.erros.some(e => /Z7/.test(e)));
});

t('Modalidade 2 sem programado → erro', () => {
  const r = prescreverPorExportacao({ ...BASE, cenario: 'total' });
  assert.equal(r.ok, false);
  assert.ok(r.erros.some(e => /programado/.test(e)));
});

t('coeficiente zero declarado → doses 0, aviso, e Modalidade 2 sem divisão por zero', () => {
  const r = prescreverPorExportacao({ ...BASE, coefElementoKgT: 0, cenario: 'total', programadoKg: 500 });
  assert.equal(r.ok, true);
  for (const z of Z) assert.equal(r.porZona[z.id].doseKgHa, 0);
  assert.equal(r.fracao, null);
  assert.equal(r.sobraKg, 500);
  finitoTudo(r);
});

console.log('\nO que o formulado entrega\n');

t('05-32-04 a 112,8 kg/ha → N 5,64 · P₂O₅ 36,09 · K₂O 4,51 (micros ficam de fora)', () => {
  const e = entregaDoFormulado(112.78, { n: 5, p2o5: 32, k2o: 4, zn: 0.5 });
  assert.ok(perto(e.n, 5.639, 1e-3));
  assert.ok(perto(e.p2o5, 36.0896, 1e-3));
  assert.ok(perto(e.k2o, 4.5112, 1e-3));
  assert.equal(e.zn, undefined);
  assert.deepEqual(entregaDoFormulado(NaN, { n: 5 }), {});
});

console.log('\nRelatório (snapshot salvo)\n');

t('PDF: linhas da exportação saem do snapshot (cultura, coeficiente, garantia, modalidade)', () => {
  const r = prescreverPorExportacao({ ...BASE, cenario: 'total', programadoKg: 3000 });
  const p = {
    modo: 'exportacao', unidade: 'kg/ha', tipo: 'fertilizante', produto: '05-32-04',
    zonas: Z.map(z => ({ idZona: z.id, nomeZona: z.nome, classe: '', cor: '', areaHa: z.areaHa, dose: r.porZona[z.id].doseKgHa })),
    params: {
      totalDisponivel: 3000, totalPorHa: false,
      exportacao: {
        culturaId: 'soja', exportacaoNome: 'Soja — grão', nutriente: 'p2o5', cenario: 'total',
        coefElementoKgT: 4.5, garantiaPct: 32, garantiasFormulado: { n: 5, p2o5: 32, k2o: 4 },
        potencialUsado: Object.fromEntries(Z.map(z => [z.id, z.potencialKgHa])),
        doseIdeal: Object.fromEntries(Z.map(z => [z.id, r.porZona[z.id].doseIdealKgHa])),
        necessidadeKg: r.necessidadeKg,
      },
    },
    fc: { type: 'FeatureCollection', features: [] },
  };
  const c = contaExportacao(p);
  assert.ok(c && perto(c.fracao, 3000 / r.necessidadeKg));
  const linhas = montarResumoPdf(p, resumoDoses(p.zonas), 1, 3).map(l => l.txt).join('\n');
  assert.match(linhas, /exportação - cultura Soja/);
  assert.match(linhas, /4,5 kg P\/t/);
  assert.match(linhas, /32% de P2O5/);
  assert.match(linhas, /Modalidade 2/);
  assert.match(linhas, /2\.800 a 4\.200 kg\/ha/);
  assert.match(linhas, /entrega, na média: N .* P2O5 .* K2O/);
  assert.doesNotMatch(linhas, /NaN|Infinity/);
});

// N1: o PDF diz o mesmo que o aviso da tela (limites mín/máx inclusos).
const pdfDe = (zonas, op, r) => {
  const p = {
    modo: 'exportacao', unidade: 'kg/ha', tipo: 'fertilizante', produto: 'X',
    zonas: zonas.map(z => ({ idZona: z.id, nomeZona: z.nome ?? z.id, classe: '', cor: '', areaHa: z.areaHa, dose: r.porZona[z.id].doseKgHa })),
    params: {
      totalDisponivel: op.programadoKg, totalPorHa: false,
      exportacao: {
        culturaId: 'soja', nutriente: 'p2o5', cenario: 'total', coefElementoKgT: 4.5, garantiaPct: 32,
        potencialUsado: Object.fromEntries(zonas.map(z => [z.id, z.potencialKgHa])),
        doseIdeal: Object.fromEntries(zonas.map(z => [z.id, r.porZona[z.id].doseIdealKgHa])),
        necessidadeKg: r.necessidadeKg,
        limitadasMax: r.limitadasMax.length ? r.limitadasMax : undefined,
        faixaFracao: r.faixaFracao ?? undefined,
      },
    },
    fc: { type: 'FeatureCollection', features: [] },
  };
  return montarResumoPdf(p, resumoDoses(p.zonas), 1, 3).map(l => l.txt).join('\n');
};
const ZN1 = [{ id: 'A', nome: 'A', areaHa: 10, potencialKgHa: 7000 }, { id: 'B', nome: 'B', areaHa: 25, potencialKgHa: 5000 }, { id: 'C', nome: 'C', areaHa: 15, potencialKgHa: 3500 }];
const OPN1 = { zonas: ZN1, nutriente: 'p2o5', coefElementoKgT: 4.5, garantiaPct: 32 };
const NEC_N1 = prescreverPorExportacao({ ...OPN1, cenario: 'livre' }).necessidadeKg;

t('N1: 150% com doseMax 150 — PDF diz "exceto 2 limitada(s) pela dose máxima", igual à tela', () => {
  const op = { ...OPN1, cenario: 'total', programadoKg: NEC_N1 * 1.5, doseMax: 150 };
  const r = prescreverPorExportacao(op);
  const pdf = pdfDe(ZN1, op, r);
  assert.match(pdf, /exceto 2 limitada\(s\) pela dose máxima \(A, B\)/);
  assert.doesNotMatch(pdf, /cada zona (fica )?no ideal/);
  assert.ok(r.avisos.some(a => pdf.includes(a)), 'o texto do PDF é o aviso da tela');
});

t('N1: 70% com mínimo 100 — PDF informa a faixa real da fração, não "a mesma fração"', () => {
  const op = { ...OPN1, cenario: 'total', programadoKg: NEC_N1 * 0.7, doseMin: 100 };
  const r = prescreverPorExportacao(op);
  assert.ok(r.faixaFracao, 'o motor devolve a faixa');
  const pdf = pdfDe(ZN1, op, r);
  assert.match(pdf, /fração do ideal por zona ficou entre/);
  assert.doesNotMatch(pdf, /cada zona recebe/);
  assert.ok(r.avisos.some(a => pdf.includes(a)));
});

t('N1: 70% sem limites — PDF e tela dizem "cada zona recebe 70%"', () => {
  const op = { ...OPN1, cenario: 'total', programadoKg: NEC_N1 * 0.7 };
  const r = prescreverPorExportacao(op);
  assert.equal(r.faixaFracao, null);
  assert.match(pdfDe(ZN1, op, r), /cada zona recebe 70% do seu ideal/);
});

t('prescrição de outro modo, ou sem snapshot, não ganha linhas de exportação', () => {
  assert.equal(contaExportacao({ modo: 'manual', zonas: [], params: {} }), null);
  assert.equal(contaExportacao({ modo: 'exportacao', zonas: [], params: { exportacao: { culturaId: 'soja', nutriente: 'p2o5', cenario: 'livre' } } }), null);
});

console.log(`\n${ok} ok, ${fail} falha(s)\n`);
if (fail) process.exit(1);
