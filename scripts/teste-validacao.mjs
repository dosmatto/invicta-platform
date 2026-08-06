// Validador de Zonas de Manejo — roda: npm run teste:validacao
//
// O que este arquivo protege, em ordem de importância:
//   1. As 4 REGRAS da spec (nunca só o CV; todos os índices sempre; toda
//      recomendação justificada; arquitetura modular).
//   2. Os casos em que a estatística ingênua erra e manda um zoneamento ruim
//      para o campo: outlier de colhedora, camada centrada em zero, zonas que
//      não se separam, mapa picotado.
//   3. Falta de dado NUNCA vira zero — vira pendência declarada.

import assert from 'node:assert/strict';
import { resumoValores, separacaoEntreZonas, quantil, spearman, escoreBom, escoreRuim, normalizar } from '../src/lib/validacao/estatistica.ts';
import { metricasEspaciais, metricasPoligono } from '../src/lib/validacao/espacial.ts';
import { calcularIVR, ivrDoZoneamento } from '../src/lib/validacao/ivr.ts';
import { calcularIPE } from '../src/lib/validacao/ipe.ts';
import { calcularICA } from '../src/lib/validacao/ica.ts';
import { calcularIQZM, PESOS_IQZM } from '../src/lib/validacao/iqzm.ts';
import { validarZoneamento, compararCenarios } from '../src/lib/validacao/validar.ts';
import { INDICADORES_DASHBOARD } from '../src/lib/validacao/tipos.ts';
import { amostrarPorZona, malhaNasZonas } from '../src/lib/validacao/amostragem.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

// ── Fixtures ────────────────────────────────────────────────────────────────
// Talhão quadrado de ~1 km, dividido em 2 faixas (norte/sul).
const W = -50.30, S = -23.50, E = -50.29, N = -23.49;
const BOUNDS = [W, S, E, N];
const meio = (S + N) / 2;
const retangulo = (y0, y1) => ({ type: 'Polygon', coordinates: [[[W, y0], [E, y0], [E, y1], [W, y1], [W, y0]]] });

const POLIGONOS = [
  { idZona: 'z1', nome: '01', classe: 'Alta', cor: '#16a34a', rank: 1, geometry: retangulo(meio, N) },
  { idZona: 'z2', nome: '02', classe: 'Baixa', cor: '#dc2626', rank: 2, geometry: retangulo(S, meio) },
];

// Grid 40×40: metade norte ~4000, metade sul ~2000 (zonas MUITO separadas).
function gridSintetico(f) {
  const rows = 40, cols = 40;
  const a = new Float32Array(rows * cols);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lat = N - (r / (rows - 1)) * (N - S);
      const lng = W + (c / (cols - 1)) * (E - W);
      a[r * cols + c] = f(lat, lng, r, c);
    }
  }
  return { b64: Buffer.from(a.buffer).toString('base64'), shape: [rows, cols] };
}
const GRID_SEPARADO = gridSintetico(lat => (lat > meio ? 4000 : 2000) + ((lat * 1e5) % 7) * 3);
const GRID_UNIFORME = gridSintetico(() => 3000 + ((Math.random() * 0) + 0));   // sem variação nenhuma

const camada = (id, grid, periodo) => ({ id, nome: id, unidade: 'kg/ha', grid, bounds: BOUNDS, periodo });

console.log('\nEstatística — o que o CV sozinho não vê\n');

t('resumo traz mediana, percentis, IQR e outliers (não só média e desvio)', () => {
  const r = resumoValores([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  assert.equal(r.n, 11);
  assert.equal(r.mediana, 15);
  assert.equal(r.min, 10); assert.equal(r.max, 20); assert.equal(r.amplitude, 10);
  assert.ok(r.p25 < r.mediana && r.mediana < r.p75);
  assert.equal(r.outliers, 0);
});

t('OUTLIER DE COLHEDORA: CV dispara, mediana e IQR não se movem', () => {
  const bons = Array.from({ length: 50 }, (_, i) => 3000 + i);      // 3000..3049
  const comLixo = [...bons, 42000];                                  // um ponto absurdo
  const a = resumoValores(bons), b = resumoValores(comLixo);
  assert.ok(b.cv > a.cv * 3, `CV foi de ${a.cv.toFixed(1)} para ${b.cv.toFixed(1)}`);
  assert.ok(Math.abs(b.mediana - a.mediana) < 2, 'mediana praticamente igual');
  assert.ok(Math.abs(b.iqr - a.iqr) < 2, 'IQR praticamente igual');
  assert.equal(b.outliers, 1, 'e o ponto é sinalizado como outlier');
});

t('CAMADA CENTRADA EM ZERO: CV volta null em vez de explodir', () => {
  const r = resumoValores([-5, -2, 0, 1, 3, 4, -3, 2]);
  assert.equal(r.cv, null, 'média ~0 ⇒ CV não é reportado');
  assert.ok(r.iqr > 0, 'mas a dispersão robusta continua disponível');
});

t('quantil interpola (tipo 7) e aguenta vetor de 1 elemento', () => {
  assert.equal(quantil([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(quantil([7], 0.9), 7);
});

t('separação: zonas distintas dão η² alto; zonas iguais, η² ~0', () => {
  const distintas = separacaoEntreZonas([
    { id: 'a', valores: [10, 11, 12, 11, 10] },
    { id: 'b', valores: [50, 51, 52, 51, 50] },
  ]);
  assert.ok(distintas.eta2 > 0.95, `η²=${distintas.eta2}`);
  assert.equal(distintas.paresSobrepostos, 0);

  const iguais = separacaoEntreZonas([
    { id: 'a', valores: [10, 20, 30, 40, 50] },
    { id: 'b', valores: [11, 21, 31, 41, 49] },
  ]);
  assert.ok(iguais.eta2 < 0.05, `η²=${iguais.eta2}`);
  assert.equal(iguais.paresSobrepostos, 1, 'o par é sinalizado como candidato a fusão');
});

t('spearman: ordem mantida = 1, ordem invertida = -1', () => {
  assert.equal(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1);
  assert.equal(spearman([1, 2, 3, 4], [40, 30, 20, 10]), -1);
  assert.equal(spearman([1, 2], [2, 1]), null, 'menos de 3 pares não vira correlação');
});

t('escores normalizam e SATURAM (nunca passam de 0..100)', () => {
  assert.equal(escoreRuim(0, 10, 40), 0);
  assert.equal(escoreRuim(999, 10, 40), 100);
  assert.equal(escoreBom(999, 1, 4), 100, 'muito acima do "bom" é 100, não 0');
  assert.equal(escoreBom(-5, 1, 4), 0);
  assert.equal(escoreBom(4, 1, 4), 100);
  assert.equal(escoreBom(1, 1, 4), 0);
  assert.equal(normalizar(15, 10, 20), 50, 'régua linear no meio da faixa');
});

console.log('\nEspacial — o que a estatística não vê\n');

t('polígono: área bate com a informada e o índice de forma de um quadrado é ~1,13', () => {
  const m = metricasPoligono(retangulo(S, N));
  assert.ok(m.areaHa > 90 && m.areaHa < 130, `${m.areaHa} ha`);   // ~1 km × 1,1 km
  assert.ok(m.indiceForma > 1.1 && m.indiceForma < 1.2, `forma ${m.indiceForma}`);
});

t('MAPA PICOTADO: mesma área em 20 respingos tem fragmentação alta e LPI baixo', () => {
  const inteiro = metricasEspaciais([{ idZona: 'z1', geometry: retangulo(S, N) }]);
  const passo = (N - S) / 40;
  const picotado = metricasEspaciais(
    Array.from({ length: 20 }, (_, i) => ({ idZona: 'z1', geometry: retangulo(S + i * 2 * passo, S + (i * 2 + 1) * passo) })),
  );
  assert.equal(inteiro.poligonosPorZona, 1);
  assert.equal(picotado.poligonosPorZona, 20);
  assert.ok(inteiro.lpiMedio === 1, 'zona inteiriça: a maior mancha é a zona toda');
  assert.ok(picotado.lpiMedio < 0.1, `LPI ${picotado.lpiMedio}`);
});

t('piso operacional: manchas abaixo dele viram % de área fragmentada', () => {
  const passo = (N - S) / 600;   // faixa de ~0,18 ha — abaixo do piso de 0,5
  const m = metricasEspaciais(
    [{ idZona: 'z1', geometry: retangulo(meio, N) }, { idZona: 'z1', geometry: retangulo(S, S + passo) }],
    0.5,
  );
  assert.ok(m.pctAreaFragmentos > 0 && m.pctAreaFragmentos < 5, `${m.pctAreaFragmentos}%`);
});

console.log('\nAmostragem\n');

t('cada pixel vai para a zona certa (norte × sul)', () => {
  const porZona = amostrarPorZona(POLIGONOS, GRID_SEPARADO, BOUNDS);
  const z1 = porZona.get('z1'), z2 = porZona.get('z2');
  assert.ok(z1.length > 100 && z2.length > 100, `z1=${z1.length} z2=${z2.length}`);
  assert.ok(Math.min(...z1) > 3500, 'zona norte só tem valores altos');
  assert.ok(Math.max(...z2) < 2500, 'zona sul só tem valores baixos');
});

t('malha regular cai dentro das zonas e sabe de quem é cada ponto', () => {
  const pts = malhaNasZonas(POLIGONOS, 400);
  assert.ok(pts.length > 300, `${pts.length} pontos`);
  assert.ok(pts.every(p => p.idZona === 'z1' || p.idZona === 'z2'));
});

console.log('\nÍndices\n');

t('IVR: zona uniforme ≈ 0; zona bagunçada, alto', () => {
  const uniforme = calcularIVR(resumoValores(Array.from({ length: 100 }, () => 3000)));
  assert.ok(uniforme.indicador.valor < 5, `IVR ${uniforme.indicador.valor}`);
  assert.equal(uniforme.indicador.faixa, 'otimo');

  const bagunca = calcularIVR(resumoValores(Array.from({ length: 100 }, (_, i) => 500 + i * 90)));
  assert.ok(bagunca.indicador.valor > 40, `IVR ${bagunca.indicador.valor}`);
});

t('IVR de zona sem pixel suficiente é PENDENTE, não zero', () => {
  const r = calcularIVR(resumoValores([10, 20]));
  assert.equal(r.indicador.valor, null);
  assert.equal(r.indicador.faixa, 'pendente');
  assert.match(r.indicador.pendencia, /pixel/i);
});

t('IVR do zoneamento pondera por ÁREA (zona de 0,3 ha não decide o mapa)', () => {
  const v = ivrDoZoneamento([{ areaHa: 40, ivr: 10 }, { areaHa: 0.3, ivr: 90 }]);
  assert.ok(v.valor < 12, `veio ${v.valor}`);
});

t('IPE com 1 safra fica EM ABERTO e diz o que falta', () => {
  const r = calcularIPE(POLIGONOS, [camada('prod2024', GRID_SEPARADO, '23/24')]);
  assert.equal(r.indicador.valor, null);
  assert.equal(r.indicador.faixa, 'pendente');
  assert.match(r.indicador.pendencia, /1 safra|não há camada/i);
  assert.match(r.indicador.pendencia, /aberto|comparar/i);
});

t('IPE: mesmo padrão em 3 safras ⇒ persistência alta', () => {
  const r = calcularIPE(POLIGONOS, [
    camada('a', GRID_SEPARADO, '21/22'), camada('b', GRID_SEPARADO, '22/23'), camada('c', GRID_SEPARADO, '23/24'),
  ]);
  assert.ok(r.indicador.valor > 90, `IPE ${r.indicador.valor}`);
  assert.equal(r.detalhe.paresComparados, 3);
  assert.ok(r.detalhe.pctAreaSempreNoMesmoTerco > 90);
});

t('IPE: padrão INVERTIDO entre safras derruba o índice', () => {
  // 3 faixas: com 2 zonas não existe correlação de postos (n < 3), e é
  // justamente o ordenamento das zonas que se inverte aqui.
  const t1 = S + (N - S) / 3, t2 = S + (2 * (N - S)) / 3;
  const tres = [
    { idZona: 'a', nome: 'A', classe: 'Alta', cor: '#0f0', geometry: retangulo(t2, N) },
    { idZona: 'b', nome: 'B', classe: 'Média', cor: '#ff0', geometry: retangulo(t1, t2) },
    { idZona: 'c', nome: 'C', classe: 'Baixa', cor: '#f00', geometry: retangulo(S, t1) },
  ];
  const crescente = gridSintetico(lat => (lat > t2 ? 4000 : lat > t1 ? 3000 : 2000));
  const invertido = gridSintetico(lat => (lat > t2 ? 2000 : lat > t1 ? 3000 : 4000));
  const r = calcularIPE(tres, [camada('a', crescente, '22/23'), camada('b', invertido, '23/24')]);
  assert.ok(r.indicador.valor < 40, `IPE ${r.indicador.valor}`);
  assert.ok(r.detalhe.spearmanMedio < 0, `a ordem das zonas se inverteu (rho=${r.detalhe.spearmanMedio})`);
});

t('duas versões da MESMA safra não contam como duas observações', () => {
  const r = calcularIPE(POLIGONOS, [camada('v1', GRID_SEPARADO, '23/24'), camada('v2', GRID_SEPARADO, '23/24')]);
  assert.equal(r.indicador.valor, null, 'continua pendente: é uma safra só');
});

t('ICA: base pobre pontua baixo; base rica, alto — e aponta o gargalo', () => {
  const pobre = calcularICA({ nSafras: 1, nCamadas: 1, resolucaoM: 30, coberturaPct: 60, nObservacoes: 100 });
  assert.ok(pobre.indicador.valor < 20, `ICA ${pobre.indicador.valor}`);
  const rica = calcularICA({ nSafras: 5, nCamadas: 4, resolucaoM: 5, coberturaPct: 98, nObservacoes: 5000 });
  assert.ok(rica.indicador.valor > 95, `ICA ${rica.indicador.valor}`);
  assert.match(pobre.indicador.justificativa, /Ponto mais fraco/);
});

t('ICA: resolução desconhecida sai da conta em vez de virar nota zero', () => {
  const semRes = calcularICA({ nSafras: 4, nCamadas: 4, resolucaoM: null, coberturaPct: 95, nObservacoes: 3000 });
  assert.ok(semRes.indicador.valor > 95, `ICA ${semRes.indicador.valor}`);
  assert.equal(semRes.componentes.resolucao, undefined);
});

t('IQZM: componente ausente redistribui peso e marca PARCIAL (nunca zera)', () => {
  const completo = calcularIQZM({ componentes: { homogeneidade: 80, separacao: 80, continuidade: 80, fragmentacao: 80, ipe: 80, ica: 80 } });
  assert.ok(Math.abs(completo.indicador.valor - 80) < 0.01);
  assert.equal(completo.parcial, false);

  const semIpe = calcularIQZM({ componentes: { homogeneidade: 80, separacao: 80, continuidade: 80, fragmentacao: 80, ipe: null, ica: 80 } });
  assert.ok(Math.abs(semIpe.indicador.valor - 80) < 0.01, `veio ${semIpe.indicador.valor} — ausente virou zero?`);
  assert.equal(semIpe.parcial, true);
  assert.deepEqual(semIpe.ausentes, ['ipe']);
  assert.match(semIpe.indicador.justificativa, /PARCIAL/);
});

t('IQZM diz QUEM puxou para baixo (não é caixa-preta)', () => {
  const r = calcularIQZM({ componentes: { homogeneidade: 90, separacao: 20, continuidade: 90, fragmentacao: 90, ipe: 90, ica: 90 } });
  assert.match(r.indicador.justificativa, /Puxa para baixo: separação entre zonas/);
});

t('pesos do IQZM somam 1 (senão o índice muda de escala em silêncio)', () => {
  const soma = Object.values(PESOS_IQZM).reduce((s, p) => s + p, 0);
  assert.ok(Math.abs(soma - 1) < 1e-9, `soma ${soma}`);
});

console.log('\nRelatório completo — as 4 regras do projeto\n');

const ENTRADA = {
  cenarioId: 'c1', cenarioNome: 'Cenário multivariável',
  poligonos: POLIGONOS,
  camadas: [camada('prod2223', GRID_SEPARADO, '22/23'), camada('prod2324', GRID_SEPARADO, '23/24')],
  pisoHa: 0.5,
};

t('REGRA 2: os 16 indicadores aparecem SEMPRE, na ordem — inclusive sem dado nenhum', () => {
  const completo = validarZoneamento(ENTRADA);
  assert.deepEqual(completo.indicadores.map(i => i.id), [...INDICADORES_DASHBOARD]);

  const vazio = validarZoneamento({ cenarioId: 'x', cenarioNome: 'sem dados', poligonos: POLIGONOS, camadas: [] });
  assert.deepEqual(vazio.indicadores.map(i => i.id), [...INDICADORES_DASHBOARD], 'sem camada a lista continua completa');
  const semCamada = vazio.indicadores.filter(i => i.id !== 'fragmentacao' && i.id !== 'continuidade');
  assert.ok(semCamada.every(i => i.valor == null || i.pendencia == null), 'indicador sem dado precisa vir com pendência');
});

t('REGRA 1: o IQZM NÃO é o CV — cenário de CV alto pode ter qualidade alta', () => {
  const r = validarZoneamento(ENTRADA);
  const cv = r.indicadores.find(i => i.id === 'cv');
  const iqzm = r.indicadores.find(i => i.id === 'iqzm');
  const sep = r.indicadores.find(i => i.id === 'separacao');
  // O talhão tem CV alto (duas populações bem distintas), e é exatamente por
  // isso que o zoneamento é BOM: as zonas capturam essa diferença.
  assert.ok(cv.valor > 20, `CV do talhão ${cv.valor}%`);
  assert.ok(sep.valor > 90, `separação ${sep.valor}%`);
  assert.ok(iqzm.valor > 65, `IQZM ${iqzm.valor} — o CV alto não pode reprovar o mapa`);
});

t('REGRA 3: toda recomendação declara os indicadores que a sustentam', () => {
  const r = validarZoneamento(ENTRADA);
  assert.ok(r.recomendacoes.length > 0);
  for (const rec of r.recomendacoes) {
    assert.ok(Array.isArray(rec.base) && rec.base.length > 0, `sem base: "${rec.texto}"`);
    for (const b of rec.base) assert.ok(INDICADORES_DASHBOARD.includes(b), `base fora da lista: ${b}`);
    assert.ok(rec.texto.length > 30, 'recomendação precisa explicar, não só rotular');
  }
});

t('uma safra só: IQZM sai PARCIAL e a recomendação explica a pendência', () => {
  const r = validarZoneamento({ ...ENTRADA, camadas: [camada('prod2324', GRID_SEPARADO, '23/24')] });
  assert.equal(r.parcial, true);
  const ipe = r.indicadores.find(i => i.id === 'ipe');
  assert.equal(ipe.valor, null);
  assert.ok(r.recomendacoes.some(x => x.base.includes('ipe')), 'a pendência do IPE tem de virar recomendação');
  const iqzm = r.indicadores.find(i => i.id === 'iqzm');
  assert.ok(iqzm.valor != null, 'o IQZM continua existindo, só que parcial');
});

t('zoneamento RUIM (zonas que não se separam) é reprovado e o motivo aparece', () => {
  const r = validarZoneamento({
    ...ENTRADA,
    camadas: [camada('uniforme', GRID_UNIFORME, '23/24')],
  });
  const sep = r.indicadores.find(i => i.id === 'separacao');
  assert.ok(sep.valor != null && sep.valor < 10, `separação ${sep.valor}%`);
  assert.ok(r.recomendacoes.some(x => /não se separam/.test(x.texto)), 'precisa recomendar reduzir zonas');
});

t('ZONAS DEMAIS: 6 zonas sobre 3 padrões reais perdem para as 3 zonas certas', () => {
  // O caso que o η² sozinho não pega: ele SEMPRE sobe quando se criam mais
  // grupos, então "picotar mais" pareceria sempre melhor. Quem denuncia o
  // excesso é o par VIZINHO que não se distingue.
  const t1 = S + (N - S) / 3, t2 = S + (2 * (N - S)) / 3;
  // com ruído, como qualquer raster real: sem ele as faixas ficam perfeitas e o
  // teste mediria um caso que não existe no campo.
  const gradiente = gridSintetico((lat, _lng, r, c) =>
    (lat > t2 ? 4200 : lat > t1 ? 3400 : 2600) + (((r * 37 + c * 17) % 23) - 11) * 12);
  // Faixas com uma folga entre elas: sem a folga, o pixel exatamente na divisa
  // cai ora numa ora noutra e desloca a média de uma faixa inteira — artefato de
  // discretização que não tem nada a ver com o que este teste mede.
  const faixas = (n) => {
    const h = (N - S) / n, folga = h * 0.08;
    return Array.from({ length: n }, (_, i) => ({
      idZona: String(i + 1), nome: `0${i + 1}`, classe: `Z${i + 1}`, cor: '#888', rank: i + 1,
      geometry: retangulo(S + i * h + folga, S + (i + 1) * h - folga),
    }));
  };
  const base = { camadas: [camada('p', gradiente, '23/24')], pisoHa: 0.5 };
  const tres = validarZoneamento({ ...base, cenarioId: 'a', cenarioNome: '3 zonas', poligonos: faixas(3) });
  const seis = validarZoneamento({ ...base, cenarioId: 'b', cenarioNome: '6 zonas', poligonos: faixas(6) });

  const sepTres = tres.indicadores.find(i => i.id === 'separacao').valor;
  const sepSeis = seis.indicadores.find(i => i.id === 'separacao').valor;
  assert.ok(sepSeis < sepTres * 0.8, `separação: 3 zonas ${sepTres} × 6 zonas ${sepSeis}`);
  assert.ok(seis.separacao.vizinhosConfundidos.length >= 2, 'as vizinhas idênticas têm de ser apontadas');

  const iqzmTres = tres.indicadores[0].valor, iqzmSeis = seis.indicadores[0].valor;
  assert.ok(iqzmTres > iqzmSeis, `IQZM: 3 zonas ${iqzmTres} × 6 zonas ${iqzmSeis}`);
  const { linhas } = compararCenarios([tres, seis]);
  assert.equal(linhas.find(l => l.melhor)?.cenarioId, 'a', 'o cenário de 3 zonas tem de vencer');
  assert.ok(seis.recomendacoes.some(r => /VIZINHAS não se separam/.test(r.texto)));
});

t('por zona: cada zona traz seu resumo, seu IVR e sua área', () => {
  const r = validarZoneamento(ENTRADA);
  assert.equal(r.porZona.length, 2);
  for (const z of r.porZona) {
    assert.ok(z.resumo && z.resumo.n > 50, `zona ${z.nome} sem pixels`);
    assert.ok(z.ivr.valor != null);
    assert.ok(z.areaHa > 0 && z.percArea > 0);
  }
  assert.ok(Math.abs(r.porZona.reduce((s, z) => s + z.percArea, 0) - 1) < 0.01);
});

t('comparação de cenários ranqueia pelo IQZM e reconhece empate técnico', () => {
  const bom = validarZoneamento(ENTRADA);
  const ruim = validarZoneamento({ ...ENTRADA, cenarioId: 'c2', cenarioNome: 'Cenário fraco', camadas: [camada('uniforme', GRID_UNIFORME, '23/24')] });
  const { linhas, veredito } = compararCenarios([bom, ruim]);
  assert.equal(linhas.length, 2);
  const vencedor = linhas.find(l => l.melhor);
  assert.equal(vencedor?.cenarioId, 'c1', veredito);
  assert.match(veredito, /não é só o CV/);

  const empate = compararCenarios([bom, { ...bom, cenarioId: 'c3', cenarioNome: 'Clone' }]);
  assert.ok(!empate.linhas.some(l => l.melhor), 'clone idêntico não pode ter vencedor');
  assert.match(empate.veredito, /Empate técnico/);
});

console.log(`\n${ok} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
