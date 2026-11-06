// Testes da regra "cultura × produtividade" (lib/culturaPlausivel): faixas por
// cultura, nome livre da cultura, e a sugestão quando a média cabe em outra.
// Roda: `node scripts/teste-cultura-plausivel.mjs`
import assert from 'node:assert/strict';
import {
  FAIXAS_CULTURA, chaveDaCultura, rotuloDaCultura, avaliarCultura, textoAvisoCultura,
} from '../src/lib/culturaPlausivel.ts';

let ok = 0, fail = 0;
const t = (n, f) => { try { f(); ok++; console.log('  ✓', n); } catch (e) { fail++; console.error('  ✗', n, '—', e.message); } };

console.log('culturaPlausivel');

t('faixas do ledger, em kg/ha', () => {
  assert.deepEqual([...FAIXAS_CULTURA.soja], [600, 7200]);
  assert.deepEqual([...FAIXAS_CULTURA.milho], [1500, 16000]);
  assert.deepEqual([...FAIXAS_CULTURA.trigo], [500, 7500]);
  assert.deepEqual([...FAIXAS_CULTURA.feijao], [300, 5000]);
  assert.deepEqual([...FAIXAS_CULTURA.aveia], [500, 7000]);
  assert.deepEqual([...FAIXAS_CULTURA.cevada], [500, 7000]);
});

t('nome da cultura: minúsculas, sem acento, safrinha e 2ª safra contam como milho', () => {
  assert.equal(chaveDaCultura('Soja'), 'soja');
  assert.equal(chaveDaCultura('  SOJA '), 'soja');
  assert.equal(chaveDaCultura('milho'), 'milho');
  assert.equal(chaveDaCultura('Milho safrinha'), 'milho');
  assert.equal(chaveDaCultura('milho 2ª safra'), 'milho');
  assert.equal(chaveDaCultura('Feijão'), 'feijao');
  assert.equal(chaveDaCultura('feijao'), 'feijao');
  assert.equal(chaveDaCultura('Aveia'), 'aveia');
  assert.equal(chaveDaCultura('CEVADA'), 'cevada');
});

t('cultura sem faixa ou vazia: sem chave', () => {
  for (const c of ['cana', 'café', 'algodão', 'outro', '', '  ', null, undefined, 'sojaX']) assert.equal(chaveDaCultura(c), null, String(c));
});

t('rótulo para mostrar', () => {
  assert.equal(rotuloDaCultura('milho safrinha'), 'Milho');
  assert.equal(rotuloDaCultura('feijao'), 'Feijão');
  assert.equal(rotuloDaCultura('cana'), 'Cana');
  assert.equal(rotuloDaCultura(''), '');
});

t('o caso real: milho de 14.160 kg/ha gravado como Soja → sugere Milho', () => {
  const a = avaliarCultura('soja', 14160);
  assert.ok(a);
  assert.equal(a.cultura, 'soja');
  assert.equal(a.mediaKgha, 14160);
  assert.deepEqual([...a.faixa], [600, 7200]);
  assert.equal(a.sugestao, 'milho');
  assert.equal(textoAvisoCultura(a), 'Média de 14.160 kg/ha não combina com Soja (600–7.200). É Milho?');
});

t('média plausível → null; bordas das faixas são plausíveis', () => {
  assert.equal(avaliarCultura('soja', 3800), null);
  assert.equal(avaliarCultura('soja', 600), null);
  assert.equal(avaliarCultura('soja', 7200), null);
  assert.equal(avaliarCultura('milho', 1500), null);
  assert.equal(avaliarCultura('milho', 16000), null);
  assert.equal(avaliarCultura('Milho safrinha', 6000), null);
  assert.equal(avaliarCultura('feijao', 300), null);
  assert.equal(avaliarCultura('feijao', 5000), null);
  assert.ok(avaliarCultura('soja', 7200.5));
  assert.ok(avaliarCultura('soja', 599.9));
});

t('cultura sem faixa → null, mesmo com média absurda', () => {
  assert.equal(avaliarCultura('cana', 90000), null);
  assert.equal(avaliarCultura('outro', 14160), null);
  assert.equal(avaliarCultura('', 14160), null);
  assert.equal(avaliarCultura(undefined, 14160), null);
});

t('média inválida → null', () => {
  assert.equal(avaliarCultura('soja', NaN), null);
  assert.equal(avaliarCultura('soja', Infinity), null);
});

t('média > 7.200: a sugestão é sempre o milho (e só se couber nele)', () => {
  assert.equal(avaliarCultura('soja', 7300).sugestao, 'milho');
  assert.equal(avaliarCultura('feijao', 7400).sugestao, 'milho');   // trigo (≤ 7.500) também caberia
  assert.equal(avaliarCultura('trigo', 9000).sugestao, 'milho');
  assert.equal(avaliarCultura('aveia', 12000).sugestao, 'milho');
  assert.equal(avaliarCultura('soja', 16001).sugestao, undefined);  // nem o milho: só o aviso
});

t('média ≤ 7.200: entre várias faixas que contêm, a prioridade fixa soja > milho > trigo > feijão > aveia/cevada', () => {
  // 1.000 kg/ha lançado como milho (mín 1.500): cabem soja, trigo, feijão, aveia, cevada → soja
  assert.equal(avaliarCultura('milho', 1000).sugestao, 'soja');
  // 5.500 como feijão (máx 5.000): cabem soja, milho, trigo, aveia, cevada → soja
  assert.equal(avaliarCultura('feijao', 5500).sugestao, 'soja');
  // 7.100 como aveia (máx 7.000): soja (até 7.200) ainda contém → soja
  assert.equal(avaliarCultura('aveia', 7100).sugestao, 'soja');
  // 7.600 como trigo (máx 7.500): acima de 7.200 → milho
  assert.equal(avaliarCultura('trigo', 7600).sugestao, 'milho');
  // 400 como soja (mín 600): só o feijão (300–5.000) contém
  assert.equal(avaliarCultura('soja', 400).sugestao, 'feijao');
  // 400 como milho: só o feijão
  assert.equal(avaliarCultura('milho', 400).sugestao, 'feijao');
});

t('abaixo de todas as faixas → aviso sem sugestão', () => {
  const a = avaliarCultura('soja', 100);
  assert.ok(a);
  assert.equal(a.sugestao, undefined);
  assert.equal(textoAvisoCultura(a), 'Média de 100 kg/ha não combina com Soja (600–7.200).');
});

t('a sugestão nunca é a própria cultura', () => {
  for (const c of Object.keys(FAIXAS_CULTURA)) {
    for (const m of [50, 400, 1000, 5500, 7100, 7300, 14160, 20000]) {
      const a = avaliarCultura(c, m);
      if (a?.sugestao) assert.notEqual(a.sugestao, c, `${c} ${m}`);
    }
  }
});

t('texto: milhar com ponto, média arredondada', () => {
  assert.equal(textoAvisoCultura(avaliarCultura('milho safrinha', 400)),
    'Média de 400 kg/ha não combina com Milho (1.500–16.000). É Feijão?');
  assert.equal(textoAvisoCultura(avaliarCultura('soja', 14159.6)),
    'Média de 14.160 kg/ha não combina com Soja (600–7.200). É Milho?');
});

console.log(`\n${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
