// Gera o .aab da Play Store — rodando o Gradle FORA do OneDrive.
//
// POR QUE ISTO EXISTE
// O Android Gradle Plugin copia recursos com Files.copy(..., COPY_ATTRIBUTES).
// Quando o arquivo de ORIGEM está em ~/Library/CloudStorage/ (OneDrive), essa
// chamada volta com "Operation not permitted": o provedor de arquivos da nuvem
// não entrega os atributos estendidos que o Java tenta copiar. O build morre em
// :capacitor-android:packageDebugResources com uma mensagem que não explica
// nada. Não existe flag do Gradle que contorne, e mudar a pasta de saída também
// não resolve — o problema é o lado de ORIGEM.
//
// Então espelhamos o que o Gradle precisa para uma pasta local, compilamos lá e
// trazemos o pacote de volta. O repositório continua onde está.
//
// A alternativa definitiva é mover o repositório para fora do OneDrive
// (ver docs/publicar-android.md) — aí este script vira desnecessário e o Gradle
// pode rodar direto na pasta do projeto.
//
// Roda no fim do `npm run android:release`.

import { execFileSync, execSync } from 'node:child_process';
import { readFileSync, existsSync, copyFileSync, mkdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const ESPELHO = join(homedir(), 'Library/Caches/invicta-android-build');

const versao = readFileSync(join(raiz, 'src/constants/version.ts'), 'utf8')
  .match(/APP_CAMPO_VERSION\s*=\s*'([^']+)'/)?.[1] ?? 'sem-versao';

// Sem keystore.properties o Gradle compila assim mesmo e entrega um .aab SEM
// assinatura — que parece pronto, tem o tamanho certo, e só é recusado lá na
// Play Store. O preflight já barra isso quando roda antes; esta trava repete a
// conferência porque este script também pode ser chamado sozinho.
if (!existsSync(join(raiz, 'android', 'keystore.properties'))) {
  console.error(`
[android] FALTA A CHAVE DE ASSINATURA — o pacote sairia sem assinatura e a loja recusaria.

  Crie a chave (uma única vez na vida):   bash scripts/criar-chave-android.sh
  Passo a passo: docs/publicar-android.md (PASSO 1).
`);
  process.exit(1);
}

// ── 1. espelhar ──────────────────────────────────────────────────────────────
// Só o que o Gradle lê: o projeto android/ e os plugins do Capacitor, que o
// settings.gradle referencia como ../node_modules/@capacitor/... — por isso o
// espelho precisa repetir essa mesma estrutura de pastas.
//
// build/ e .gradle/ ficam de fora do --delete para o espelho manter o cache
// incremental: sem isso todo empacotamento seria um build do zero.
//
// ATENÇÃO: android/keystore.properties e o .jks vão junto (o Gradle precisa
// deles para assinar). O rsync preserva as permissões restritas dos dois, mas
// saiba que existe uma segunda cópia da sua chave em ~/Library/Caches.
console.log('[android] espelhando o projeto para fora da nuvem...');
const pares = [
  [join(raiz, 'android') + '/', join(ESPELHO, 'android') + '/'],
  [join(raiz, 'node_modules/@capacitor') + '/', join(ESPELHO, 'node_modules/@capacitor') + '/'],
];
for (const [de, para] of pares) {
  mkdirSync(para, { recursive: true });
  execFileSync('rsync', ['-a', '--delete', '--exclude', 'build/', '--exclude', '.gradle/', de, para], { stdio: 'inherit' });
}

// ── 2. compilar ──────────────────────────────────────────────────────────────
// O macOS não traz JDK; o do Android Studio serve e evita instalar Java à parte.
const javaHome = process.env.JAVA_HOME || '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
console.log('[android] compilando...');
execSync('./gradlew bundleRelease', {
  cwd: join(ESPELHO, 'android'),
  stdio: 'inherit',
  env: { ...process.env, JAVA_HOME: javaHome },
});

// ── 3. trazer o pacote de volta ──────────────────────────────────────────────
const gerado = join(ESPELHO, 'android/app/build/outputs/bundle/release/app-release.aab');
if (!existsSync(gerado)) {
  console.error(`[android] o Gradle terminou mas não achei o pacote em:\n  ${gerado}`);
  process.exit(1);
}

const destino = join(raiz, 'loja', `INVICTA-Coleta-${versao}.aab`);
mkdirSync(join(raiz, 'loja'), { recursive: true });
copyFileSync(gerado, destino);

const mb = (statSync(destino).size / 1024 / 1024).toFixed(1);
console.log(`
[android] pacote pronto para a loja  (${mb} MB)

  loja/INVICTA-Coleta-${versao}.aab

  Suba este arquivo em: Play Console → Produção → Criar nova versão.
`);
