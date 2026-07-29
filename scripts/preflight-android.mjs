// Prepara e CONFERE o build de release do Android antes de chamar o Gradle.
//
// 1. Sincroniza a versão: a Play Store recusa um envio cujo versionCode já
//    exista, e aceita em silêncio um versionName errado — o app ficaria na loja
//    dizendo "1.0" enquanto o sistema está na 2.8.x. Derivar dos dois de
//    APP_VERSION acaba com a edição manual (e com o esquecimento dela).
//    versionCode = maior*10000 + menor*100 + correção  → 2.8.11 = 20811.
//    É monotônico com a versão e não guarda estado; reenviar a MESMA versão dá
//    código repetido e a loja recusa — que é o certo, ninguém deve publicar
//    duas builds diferentes com o mesmo número.
// 2. Confere a assinatura: sem keystore.properties o Gradle gera um .aab NÃO
//    assinado, que a loja recusa lá na frente com uma mensagem obscura. Melhor
//    parar aqui, dizendo o que fazer.
//
// Roda dentro do `npm run android:release`.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const gradle = join(raiz, 'android', 'app', 'build.gradle');
const props = join(raiz, 'android', 'keystore.properties');

// ── 1. versão ────────────────────────────────────────────────────────────────
const versao = readFileSync(join(raiz, 'src', 'constants', 'version.ts'), 'utf8')
  .match(/APP_VERSION\s*=\s*'([^']+)'/)?.[1];
if (!versao) { console.error('[android] não achei APP_VERSION em src/constants/version.ts'); process.exit(1); }

const [maior, menor, correcao] = versao.split('.').map(Number);
if ([maior, menor, correcao].some(n => !Number.isInteger(n)) || menor > 99 || correcao > 99) {
  console.error(`[android] versão "${versao}" fora do formato maior.menor.correção com menor/correção <= 99`);
  process.exit(1);
}
const codigo = maior * 10000 + menor * 100 + correcao;

const original = readFileSync(gradle, 'utf8');
const novo = original
  .replace(/versionCode\s+\d+/, `versionCode ${codigo}`)
  .replace(/versionName\s+"[^"]*"/, `versionName "${versao}"`);
if (novo !== original) writeFileSync(gradle, novo);
console.log(`[android] versão ${versao} · versionCode ${codigo}`);

// ── 2. assinatura ────────────────────────────────────────────────────────────
if (!existsSync(props)) {
  console.error(`
[android] FALTA A CHAVE DE ASSINATURA — o .aab sairia sem assinatura e a loja recusaria.

  Crie a chave (uma única vez na vida) e o android/keystore.properties.
  Passo a passo completo: docs/publicar-android.md (PASSO 1).
`);
  process.exit(1);
}
const conteudo = readFileSync(props, 'utf8');
const faltando = ['storeFile', 'storePassword', 'keyAlias', 'keyPassword']
  .filter(c => !new RegExp(`^${c}\\s*=\\s*\\S`, 'm').test(conteudo));
if (faltando.length) {
  console.error(`[android] android/keystore.properties sem: ${faltando.join(', ')}`);
  process.exit(1);
}
const arquivoChave = conteudo.match(/^storeFile\s*=\s*(.+)$/m)?.[1].trim();
if (arquivoChave && !existsSync(join(raiz, 'android', arquivoChave))) {
  console.error(`[android] o keystore.properties aponta para "${arquivoChave}", que não existe em android/`);
  process.exit(1);
}
console.log('[android] assinatura de release configurada ✓');
