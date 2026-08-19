// Testes do ROTEAMENTO do interpolador local (lib/interpUrl).
//
// Caso relatado: no Windows, com o interpolador local aberto, MDE e NDVI paravam
// de funcionar. O toggle "usar esta máquina" mandava TODAS as chamadas para
// 127.0.0.1 — inclusive as que dependem de coisa que a máquina do usuário não
// tem: catálogo de satélite (NDVI), modelo de elevação (MDE) e a chave da IA.
// A regra: o local só atende CÁLCULO PURO sobre dados que o app envia.
// Roda: `npm run teste:rota`
import assert from 'node:assert/strict';
import { rotaVaiParaLocal } from '../src/lib/interpUrl.ts';

let ok = 0, fail = 0;
const t = (n, f) => { try { f(); ok++; console.log('  ✓', n); } catch (e) { fail++; console.error('  ✗', n, '—', e.message); } };

t('as rotas de CÁLCULO vão para a máquina do usuário', () => {
  for (const r of ['/interpolar', '/limpar-pontos', '/colheita-processar',
                   '/zonear-analisar', '/zonear-gerar', '/zonear-suavizar', '/zonear-dividir']) {
    assert.equal(rotaVaiParaLocal(r), true, `${r} deveria ir para o local`);
  }
});

t('O BUG: MDE nunca vai para o local (precisa baixar elevação de fora)', () => {
  for (const r of ['/mde', '/mde-pontos', '/mde-analise']) {
    assert.equal(rotaVaiParaLocal(r), false, `${r} tem de ir para a nuvem`);
  }
});

t('O BUG: NDVI e índices nunca vão para o local (catálogo de satélite)', () => {
  for (const r of ['/ndvi-cenas', '/ndvi-sentinel', '/ndvi-imagem', '/indices']) {
    assert.equal(rotaVaiParaLocal(r), false, `${r} tem de ir para a nuvem`);
  }
});

t('IA nunca vai para o local (a chave só existe no servidor)', () => {
  for (const r of ['/ia-diagnostico', '/ia-chat', '/ia-explicar-recomendacao']) {
    assert.equal(rotaVaiParaLocal(r), false, `${r} tem de ir para a nuvem`);
  }
});

t('exportar GeoTIFF vai para a nuvem (é exportação, não interpolação)', () => {
  assert.equal(rotaVaiParaLocal('/grid-geotiff'), false);
});

t('admin de usuários nunca vai para o local', () => {
  for (const r of ['/admin-usuarios/criar', '/admin-usuarios/resetar-senha']) {
    assert.equal(rotaVaiParaLocal(r), false);
  }
});

t('rota desconhecida cai na nuvem (lista é permissiva só com o que conhece)', () => {
  assert.equal(rotaVaiParaLocal('/rota-nova-que-ainda-nao-existe'), false);
});

t('query string não engana a regra', () => {
  assert.equal(rotaVaiParaLocal('/interpolar?x=1'), true);
  assert.equal(rotaVaiParaLocal('/ndvi-cenas?x=1'), false);
});

console.log(`\n${ok} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
