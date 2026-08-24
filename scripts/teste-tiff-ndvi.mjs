// Testes do download em GeoTIFF da aba NDVI.
//
// São dois recortes, e a diferença importa: "talhão" é o dado da análise
// (mascarado na divisa) e "área da tela" é a janela visível SEM máscara, para
// quando a pergunta passa da cerca. A janela vira um retângulo que é enviado ao
// servidor no lugar do talhão — se esse retângulo sair torto, o TIFF sai no
// lugar errado, e isso não aparece em type-check.
// Roda: `npm run teste:tiff`
import assert from 'node:assert/strict';
import { retanguloDe } from '../src/lib/janela.ts';
import { rotaVaiParaLocal } from '../src/lib/interpUrl.ts';

let ok = 0, fail = 0;
const t = (n, f) => { try { f(); ok++; console.log('  ✓', n); } catch (e) { fail++; console.error('  ✗', n, '—', e.message); } };

t('retângulo da tela: anel fechado, 5 vértices, sentido correto', () => {
  const p = retanguloDe([-50.3, -24.9, -50.2, -24.8]);
  assert.equal(p.type, 'Polygon');
  const anel = p.coordinates[0];
  assert.equal(anel.length, 5, 'o anel precisa fechar (1º = último)');
  assert.deepEqual(anel[0], anel[4], 'primeiro e último vértice têm de coincidir');
});

t('retângulo cobre EXATAMENTE os limites recebidos', () => {
  const [w, s, e, n] = [-50.3, -24.9, -50.2, -24.8];
  const anel = retanguloDe([w, s, e, n]).coordinates[0];
  const xs = anel.map(c => c[0]), ys = anel.map(c => c[1]);
  assert.equal(Math.min(...xs), w); assert.equal(Math.max(...xs), e);
  assert.equal(Math.min(...ys), s); assert.equal(Math.max(...ys), n);
});

t('ordem [oeste, sul, leste, norte] — trocar eixo daria TIFF no lugar errado', () => {
  const anel = retanguloDe([-50.3, -24.9, -50.2, -24.8]).coordinates[0];
  assert.deepEqual(anel[0], [-50.3, -24.9], 'começa no canto sudoeste');
  assert.deepEqual(anel[2], [-50.2, -24.8], 'canto oposto é o nordeste');
});

t('atravessando o equador/meridiano (sinais mistos) não quebra', () => {
  const anel = retanguloDe([-0.1, -0.1, 0.1, 0.1]).coordinates[0];
  assert.equal(anel.length, 5);
  assert.deepEqual(anel[0], [-0.1, -0.1]);
});

t('a rota do GeoTIFF da imagem vai para a NUVEM, nunca para a máquina', () => {
  // Depende de catálogo de satélite: no interpolador local não teria como rodar.
  assert.equal(rotaVaiParaLocal('/ndvi-imagem-geotiff'), false);
  assert.equal(rotaVaiParaLocal('/grid-geotiff'), false);
});

console.log(`\n${ok} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
