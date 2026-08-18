// Janela do boot × gravação local (src/lib/janelaBoot.ts) — a regra que impede o
// retrato da nuvem de apagar o que o usuário editou ENQUANTO o boot rodava.
// Roda: `npm run teste:janela`.
//
// O caso real: reordenar os elementos no Perfil (Biblioteca → Perfis → setinhas)
// logo depois de abrir o app. A gravação local acontecia, o push subia, e o boot
// — que já tinha o retrato antigo em mãos — regravava o localStorage por cima.
import assert from 'node:assert/strict';
import { marcarGravacaoLocal, editadaDuranteBoot, chavesEditadasDuranteBoot } from '../src/lib/janelaBoot.ts';

let ok = 0, fail = 0;
const t = (nome, fn) => {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
};

const CATALOGO = 'inv_bib_preferencias-analise';
const T0 = 1_000_000;   // instante em que o boot começou

console.log('\nJanela do boot × gravação local\n');

t('edição DURANTE o boot vence o retrato da nuvem', () => {
  const reg = {};
  marcarGravacaoLocal(reg, CATALOGO, T0 + 1500);   // usuário reordenou 1,5s após abrir
  assert.equal(editadaDuranteBoot(reg, CATALOGO, T0), true);
});

t('chave não tocada nesta sessão não bloqueia o boot', () => {
  const reg = {};
  marcarGravacaoLocal(reg, 'inv_bib_legendas', T0 + 10);
  assert.equal(editadaDuranteBoot(reg, CATALOGO, T0), false,
    'só a chave editada é preservada — o resto continua hidratando normalmente');
});

t('edição ANTERIOR ao boot não impede a hidratação', () => {
  // Boot que roda depois (ex.: reconexão): o retrato já é mais novo que a edição.
  const reg = {};
  marcarGravacaoLocal(reg, CATALOGO, T0 - 1);
  assert.equal(editadaDuranteBoot(reg, CATALOGO, T0), false);
});

t('empate no mesmo milissegundo conta como edição (local vence)', () => {
  // Sem ordem definível no mesmo ms: preservar o local no máximo mantém um dado
  // que o push já está subindo; o contrário apaga a edição do usuário.
  const reg = {};
  marcarGravacaoLocal(reg, CATALOGO, T0);
  assert.equal(editadaDuranteBoot(reg, CATALOGO, T0), true);
});

t('a última gravação da chave é a que vale', () => {
  const reg = {};
  marcarGravacaoLocal(reg, CATALOGO, T0 - 500);
  marcarGravacaoLocal(reg, CATALOGO, T0 + 500);
  assert.equal(editadaDuranteBoot(reg, CATALOGO, T0), true);
  assert.equal(reg[CATALOGO], T0 + 500);
});

t('lista de chaves a re-enviar sai só com as editadas na janela', () => {
  const reg = {};
  marcarGravacaoLocal(reg, CATALOGO, T0 + 200);
  marcarGravacaoLocal(reg, 'inv_bib_perfis', T0 + 300);
  marcarGravacaoLocal(reg, 'inv_bib_legendas', T0 - 300);
  const keys = [CATALOGO, 'inv_bib_perfis', 'inv_bib_legendas', 'inv_talhoes'];
  assert.deepEqual(chavesEditadasDuranteBoot(reg, keys, T0), [CATALOGO, 'inv_bib_perfis']);
});

t('cenário do bug: reordenar → push confirma → boot termina', () => {
  // 1) boot começa (retrato da nuvem = ordem ANTIGA)
  const reg = {};
  // 2) usuário reordena: grava local e enfileira o push
  marcarGravacaoLocal(reg, CATALOGO, T0 + 900);
  // 3) o push confirma e limpa a pendência ("sujo") — a defesa antiga acabava aqui
  const sujo = {};                     // sem pendência: lerSujos() volta vazio
  const defesaAntiga = !!sujo[CATALOGO];
  assert.equal(defesaAntiga, false, 'era exatamente por isso que a nuvem passava por cima');
  // 4) o boot termina e vai gravar: agora a janela segura
  assert.equal(defesaAntiga || editadaDuranteBoot(reg, CATALOGO, T0), true);
});

console.log(`\n${ok} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
