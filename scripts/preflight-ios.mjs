// Sincroniza a versão do projeto iOS com APP_VERSION antes de abrir o Xcode.
//
// Mesma dor do Android (ver preflight-android.mjs), com um detalhe pior: a App
// Store aceita em silêncio um MARKETING_VERSION errado. O app subiria para a
// loja anunciando "1.0" — que é o valor que o Capacitor deixa — enquanto o
// sistema está na 2.12.x, e ninguém percebe até um usuário perguntar por que a
// versão do iPhone é mais antiga que a do Android.
//
//   MARKETING_VERSION       = APP_VERSION            (o que o usuário vê)
//   CURRENT_PROJECT_VERSION = maior*10000 + menor*100 + correção
//
// O build é o mesmo número do versionCode do Android, de propósito: os dois
// apps saem do mesmo código, e ter o mesmo número dos dois lados torna óbvio
// qual build corresponde a qual. A App Store exige que ele CRESÇA a cada envio
// da mesma versão — reenviar a mesma versão é recusado, que é o certo.
//
// Roda dentro do `npm run ios:sync`.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const pbxproj = join(raiz, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj');

const versao = readFileSync(join(raiz, 'src', 'constants', 'version.ts'), 'utf8')
  .match(/APP_VERSION\s*=\s*'([^']+)'/)?.[1];
if (!versao) { console.error('[ios] não achei APP_VERSION em src/constants/version.ts'); process.exit(1); }

const [maior, menor, correcao] = versao.split('.').map(Number);
if ([maior, menor, correcao].some(n => !Number.isInteger(n)) || menor > 99 || correcao > 99) {
  console.error(`[ios] versão "${versao}" fora do formato maior.menor.correção com menor/correção <= 99`);
  process.exit(1);
}
const build = maior * 10000 + menor * 100 + correcao;

const original = readFileSync(pbxproj, 'utf8');
const novo = original
  .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${versao};`)
  .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`);
if (novo !== original) writeFileSync(pbxproj, novo);
console.log(`[ios] versão ${versao} · build ${build}`);

// O identificador precisa bater com o do Capacitor (e com o do Android): é ele
// que amarra o app ao registro na App Store, e trocar depois de publicar é
// impossível. Só avisa — corrigir sozinho o pbxproj seria pior do que dizer.
const cfg = readFileSync(join(raiz, 'capacitor.config.ts'), 'utf8').match(/appId:\s*'([^']+)'/)?.[1];
const noXcode = original.match(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/)?.[1];
if (cfg && noXcode && cfg !== noXcode) {
  console.error(`
[ios] BUNDLE IDENTIFIER DIVERGENTE — o envio para a App Store seria recusado.

  capacitor.config.ts : ${cfg}
  Xcode (pbxproj)     : ${noXcode}

  Ajuste no Xcode em Signing & Capabilities, ou no pbxproj, para ${cfg}.
`);
  process.exit(1);
}
