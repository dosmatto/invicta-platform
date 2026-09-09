// Prepara e CONFERE o build de release do Android antes de chamar o Gradle.
//
// 1. Sincroniza a versão: a Play Store recusa um envio cujo versionCode já
//    exista, e aceita em silêncio um versionName errado — o app ficaria na loja
//    dizendo "1.0" enquanto o sistema está na 2.8.x. Derivar dos dois de
//    APP_VERSION acaba com a edição manual (e com o esquecimento dela).
//    versionCode = maior*1_000_000 + menor*1_000 + correção → 2.134.0 = 2134000.
//    É monotônico com a versão e não guarda estado; reenviar a MESMA versão dá
//    código repetido e a loja recusa — que é o certo, ninguém deve publicar
//    duas builds diferentes com o mesmo número.
//    A fórmula antiga (maior*10_000 + menor*100) só cabia até "menor" 99 e
//    travou quando a plataforma passou da 2.99 — nenhum .aab saía mais. Esta
//    comporta menor/correção até 999 e continua bem abaixo do teto do Android
//    (2.100.000.000). Os códigos novos são MAIORES que os antigos (2.12.3 ia a
//    21203 e agora vai a 2012003), então a loja segue aceitando as atualizações.
// 2. Confere a assinatura: sem keystore.properties o Gradle gera um .aab NÃO
//    assinado, que a loja recusa lá na frente com uma mensagem obscura. Melhor
//    parar aqui, dizendo o que fazer.
// 3. Aponta o SDK do Android: o Gradle morre com "SDK location not found" se o
//    android/local.properties não existir — e ele NÃO é versionado (só nasce
//    quando alguém abre o projeto no Android Studio). Como o caminho é sempre o
//    mesmo, criamos o arquivo em vez de exigir o ritual do Studio.
//
// Roda dentro do `npm run android:release`.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const gradle = join(raiz, 'android', 'app', 'build.gradle');
const props = join(raiz, 'android', 'keystore.properties');
const localProps = join(raiz, 'android', 'local.properties');

// ── 1. versão ────────────────────────────────────────────────────────────────
const versao = readFileSync(join(raiz, 'src', 'constants', 'version.ts'), 'utf8')
  .match(/APP_VERSION\s*=\s*'([^']+)'/)?.[1];
if (!versao) { console.error('[android] não achei APP_VERSION em src/constants/version.ts'); process.exit(1); }

const [maior, menor, correcao] = versao.split('.').map(Number);
if ([maior, menor, correcao].some(n => !Number.isInteger(n)) || menor > 999 || correcao > 999) {
  console.error(`[android] versão "${versao}" fora do formato maior.menor.correção com menor/correção <= 999`);
  process.exit(1);
}
const codigo = maior * 1_000_000 + menor * 1_000 + correcao;

const original = readFileSync(gradle, 'utf8');
const novo = original
  .replace(/versionCode\s+\d+/, `versionCode ${codigo}`)
  .replace(/versionName\s+"[^"]*"/, `versionName "${versao}"`);
if (novo !== original) writeFileSync(gradle, novo);
console.log(`[android] versão ${versao} · versionCode ${codigo}`);

// ── 2. SDK do Android ────────────────────────────────────────────────────────
const sdkAtual = existsSync(localProps)
  ? readFileSync(localProps, 'utf8').match(/^sdk\.dir\s*=\s*(.+)$/m)?.[1].trim()
  : null;

if (!sdkAtual || !existsSync(sdkAtual)) {
  const candidatos = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    join(homedir(), 'Library/Android/sdk'),   // macOS (padrão do Android Studio)
    join(homedir(), 'Android/Sdk'),           // Linux
  ].filter(Boolean);
  const sdk = candidatos.find(c => existsSync(join(c, 'platform-tools')));
  if (!sdk) {
    console.error(`
[android] NÃO ACHEI O SDK DO ANDROID — o Gradle não compila sem ele.

  Instale pelo Android Studio (Settings → Languages & Frameworks → Android SDK)
  ou aponte a variável ANDROID_HOME para a pasta do SDK.
`);
    process.exit(1);
  }
  // Escapa o ':' de caminhos no formato .properties (Windows: C:\...).
  writeFileSync(localProps, `sdk.dir=${sdk.replace(/:/g, '\\:')}\n`, 'utf8');
  console.log(`[android] SDK em ${sdk} · local.properties criado`);
} else {
  console.log('[android] SDK do Android ✓');
}

// ── 3. assinatura ────────────────────────────────────────────────────────────
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
