// Gera TODOS os ícones e telas de abertura do app nativo a partir de uma única
// fonte vetorial: src/app/icon.svg — a mesma marca que a plataforma web já usa
// como favicon. Vetor em vez de recorte do logo horizontal porque o ícone
// precisa continuar legível a 48dp, e o símbolo oficial (círculo com nervuras
// finas) vira borrão nesse tamanho.
//
// Roda com o `sharp` que já vem junto do Next.js — nenhuma dependência nova.
//
//   node scripts/gerar-icones-app.mjs
//
// O que sai:
//   android/app/src/main/res/mipmap-*/ic_launcher.png          (ícone legado, quadrado)
//   android/app/src/main/res/mipmap-*/ic_launcher_round.png    (ícone legado, redondo)
//   android/app/src/main/res/mipmap-*/ic_launcher_foreground.png (camada do ícone adaptativo)
//   android/app/src/main/res/drawable-{port,land}-*/splash.png (tela de abertura)
//   loja/icone-512.png · loja/destaque-1024x500.png            (ficha da Play Store)
//
// O fundo (#061525) é o mesmo do tema do app e da cor já declarada em
// res/values/ic_launcher_background.xml — mexer em um exige mexer no outro.

import sharp from 'sharp';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const RES = join(raiz, 'android/app/src/main/res');
const FUNDO = '#061525';

const svg = readFileSync(join(raiz, 'src/app/icon.svg'));

/** Renderiza a marca com `lado` px de largura, fundo transparente. */
const marca = lado => sharp(svg, { density: 600 }).resize(lado, lado, { fit: 'contain', background: '#00000000' }).png().toBuffer();

/** Canvas quadrado com a marca centralizada ocupando `proporcao` do lado. */
async function quadrado(lado, proporcao, fundo) {
  const simbolo = await marca(Math.round(lado * proporcao));
  return sharp({ create: { width: lado, height: lado, channels: 4, background: fundo } })
    .composite([{ input: simbolo, gravity: 'center' }])
    .png()
    .toBuffer();
}

/** Recorta um buffer quadrado em círculo (ícone legado "round"). */
async function circular(buf, lado) {
  const mascara = Buffer.from(`<svg width="${lado}" height="${lado}"><circle cx="${lado / 2}" cy="${lado / 2}" r="${lado / 2}" fill="#fff"/></svg>`);
  return sharp(buf).composite([{ input: mascara, blend: 'dest-in' }]).png().toBuffer();
}

const gravar = async (buf, caminho) => { await sharp(buf).toFile(caminho); console.log('  ·', caminho.replace(raiz + '/', '')); };

// ── 1. Ícones do launcher ────────────────────────────────────────────────────
// A camada de frente do ícone adaptativo é recortada pelo sistema (círculo,
// squircle, gota...): só o miolo é garantido. Daí a marca ocupar 58% do canvas
// de 108dp — dentro da "zona segura" de 66dp — enquanto o ícone legado, que
// ninguém recorta, pode usar 68%.
const DENSIDADES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

console.log('Ícones do launcher:');
for (const [dpi, lado] of Object.entries(DENSIDADES)) {
  const dir = join(RES, `mipmap-${dpi}`);
  const legado = await quadrado(lado, 0.68, FUNDO);
  await gravar(legado, join(dir, 'ic_launcher.png'));
  await gravar(await circular(await quadrado(lado, 0.62, FUNDO), lado), join(dir, 'ic_launcher_round.png'));
  // foreground do adaptativo: 108dp equivalentes, SEM fundo (o fundo é a cor).
  const ladoFg = Math.round(lado * 2.25);
  await gravar(await quadrado(ladoFg, 0.58, '#00000000'), join(dir, 'ic_launcher_foreground.png'));
}

// ── 2. Telas de abertura ─────────────────────────────────────────────────────
// Mantém EXATAMENTE as dimensões que o Capacitor já criou (cada densidade tem a
// sua, retrato e paisagem) — regerar com outro tamanho faria o Android escalar
// e a marca sairia serrilhada.
console.log('Telas de abertura:');
for (const orientacao of ['port', 'land']) {
  for (const dpi of Object.keys(DENSIDADES)) {
    const arquivo = join(RES, `drawable-${orientacao}-${dpi}`, 'splash.png');
    if (!existsSync(arquivo)) continue;
    const { width, height } = await sharp(arquivo).metadata();
    const simbolo = await marca(Math.round(Math.min(width, height) * 0.32));
    const buf = await sharp({ create: { width, height, channels: 4, background: FUNDO } })
      .composite([{ input: simbolo, gravity: 'center' }])
      .png()
      .toBuffer();
    await gravar(buf, arquivo);
  }
}
// A splash "sem qualificador" é o fallback de qualquer aparelho que não case
// com as pastas acima.
const fallback = join(RES, 'drawable', 'splash.png');
if (existsSync(fallback)) {
  const { width, height } = await sharp(fallback).metadata();
  const simbolo = await marca(Math.round(Math.min(width, height) * 0.32));
  await gravar(
    await sharp({ create: { width, height, channels: 4, background: FUNDO } }).composite([{ input: simbolo, gravity: 'center' }]).png().toBuffer(),
    fallback,
  );
}

// ── 3. Ativos da ficha da Play Store ─────────────────────────────────────────
// O ícone de 512 NÃO pode ter transparência (a loja recusa) — por isso o fundo
// sólido. A imagem de destaque é 1024×500 fixo.
console.log('Ativos da loja:');
const loja = join(raiz, 'loja');
mkdirSync(loja, { recursive: true });
await gravar(await sharp(await quadrado(512, 0.66, FUNDO)).flatten({ background: FUNDO }).toBuffer(), join(loja, 'icone-512.png'));

const destaque = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500">
  <defs><linearGradient id="f" x1="0" y1="0" x2="1024" y2="500" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#061525"/><stop offset="1" stop-color="#0f2f45"/>
  </linearGradient></defs>
  <rect width="1024" height="500" fill="url(#f)"/>
  <text x="430" y="238" font-family="Helvetica, Arial, sans-serif" font-size="76" font-weight="bold" fill="#ffffff">INVICTA</text>
  <text x="430" y="310" font-family="Helvetica, Arial, sans-serif" font-size="52" fill="#8cc63f">Coleta</text>
  <text x="432" y="366" font-family="Helvetica, Arial, sans-serif" font-size="27" fill="#9db4c7">Amostragem de solo com GPS, offline</text>
</svg>`);
await gravar(
  await sharp(destaque).composite([{ input: await marca(240), left: 130, top: 130 }]).png().toBuffer(),
  join(loja, 'destaque-1024x500.png'),
);

// ── 4. Ícone do app iOS ──────────────────────────────────────────────────────
// A App Store RECUSA o envio se o ícone de 1024 tiver canal alfa — o erro chega
// por e-mail depois do upload ("Invalid large app icon ... can't be transparent
// nor contain an alpha channel") e obriga a refazer o Archive inteiro. O
// `flatten` mata o alfa; o fundo sólido é o mesmo do Android, para o app ter a
// mesma cara nas duas lojas.
//
// Ao contrário do Android, o iOS moderno usa UM único arquivo de 1024 e o Xcode
// deriva todos os tamanhos menores no build — não há mais conjunto de PNGs.
console.log('Ícone do app iOS:');
const iconeIOS = join(raiz, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');
if (existsSync(iconeIOS)) {
  await gravar(await sharp(await quadrado(1024, 0.66, FUNDO)).flatten({ background: FUNDO }).toBuffer(), iconeIOS);
} else {
  console.log('  · pulado (projeto iOS não encontrado)');
}

console.log('\nPronto. Rode `npm run android:sync` para levar os ícones ao projeto Android.');
