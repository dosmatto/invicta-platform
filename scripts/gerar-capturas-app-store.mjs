// Ajusta as capturas de tela do app para o tamanho EXATO que a App Store exige.
//
// A diferença para a Play Store: o Google aceita qualquer captura entre 320 e
// 3840 px (só limita a proporção a 2:1), enquanto a Apple exige a resolução
// exata de um aparelho de referência e recusa o upload de qualquer outra coisa.
// As capturas que já estão em loja/screenshots/ vieram recortadas justamente
// para caber no limite de 2:1 do Google — nenhuma delas serve para a Apple.
//
// Referência usada: iPhone 6.9" (1290 × 2796 — iPhone 15/16 Pro Max). É o único
// conjunto obrigatório hoje; a Apple reduz sozinha para as telas menores.
//
//   node scripts/gerar-capturas-app-store.mjs
//
// Saída: loja/screenshots-ios/
//
// Como o encaixe é feito: a captura é redimensionada para 1290 de largura e a
// altura que faltar é completada REPETINDO a linha de pixels da borda
// (`extendWith: 'copy'`), não com uma tarja de cor. Onde a borda é uma faixa de
// cor chapada — a barra de status no topo, o rodapé do app — a emenda fica
// invisível: parece só uma barra mais alta.
//
// Só que isso NÃO vale para toda borda. Na captura do mapa o rodapé termina na
// imagem de satélite, e repetir aquela linha produz um borrão de listras
// verticais óbvio. Por isso cada borda é medida antes (`uniforme()`): a sobra
// vai inteira para a borda chapada e a borda desenhada não é tocada. Se as duas
// forem desenhadas, o script avisa em vez de entregar um borrão.

import sharp from 'sharp';
import { readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const entrada = join(raiz, 'loja', 'screenshots');
const saida = join(raiz, 'loja', 'screenshots-ios');

const LARGURA = 1290;
const ALTURA = 2796;

mkdirSync(saida, { recursive: true });

const capturas = readdirSync(entrada)
  .filter(n => /\.(jpe?g|png)$/i.test(n))
  .sort();

if (!capturas.length) {
  console.error(`Nenhuma captura em ${entrada.replace(raiz + '/', '')}`);
  process.exit(1);
}

/**
 * Uma linha de pixels é "chapada" quando os pixels dela mal variam. O desvio
 * médio por canal fica em 0–2 numa barra de cor sólida e passa de 25 numa faixa
 * de imagem de satélite, então o corte em 4 separa os dois casos com folga.
 */
async function uniforme(buffer, largura, y) {
  const { data } = await sharp(buffer)
    .extract({ left: 0, top: y, width: largura, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const canais = data.length / largura;
  const media = [0, 0, 0];
  for (let x = 0; x < largura; x++) for (let c = 0; c < 3; c++) media[c] += data[x * canais + c];
  for (let c = 0; c < 3; c++) media[c] /= largura;

  let desvio = 0;
  for (let x = 0; x < largura; x++) for (let c = 0; c < 3; c++) desvio += Math.abs(data[x * canais + c] - media[c]);
  return desvio / (largura * 3) < 4;
}

console.log(`App Store · iPhone 6.9" (${LARGURA}×${ALTURA})\n`);

let houveAviso = false;

for (const nome of capturas) {
  const origem = join(entrada, nome);
  const destino = join(saida, nome.replace(/\.jpe?g$/i, '.png'));

  // Largura primeiro: é ela que define a escala. A altura vira o que vier.
  const { data: redimensionada, info } = await sharp(origem)
    .resize({ width: LARGURA })
    .png()
    .toBuffer({ resolveWithObject: true });
  const alturaAtual = info.height;

  let imagem = sharp(redimensionada);

  if (alturaAtual > ALTURA) {
    // Sobrou altura: corta pelo topo, onde só há barra de status.
    imagem = imagem.extract({ left: 0, top: alturaAtual - ALTURA, width: LARGURA, height: ALTURA });
    console.log(`  · ${nome} — cortados ${alturaAtual - ALTURA}px do topo`);
  } else if (alturaAtual < ALTURA) {
    const falta = ALTURA - alturaAtual;
    const topoOk = await uniforme(redimensionada, LARGURA, 0);
    const rodapeOk = await uniforme(redimensionada, LARGURA, alturaAtual - 1);

    if (!topoOk && !rodapeOk) {
      console.log(`  · ${nome} — PULADA: faltam ${falta}px e nenhuma das bordas é chapada.`);
      console.log('      Refaça a captura no iPhone sem recortar (a tela já sai 1290×2796).');
      houveAviso = true;
      continue;
    }

    const topo = topoOk && rodapeOk ? Math.floor(falta / 2) : topoOk ? falta : 0;
    imagem = imagem.extend({ top: topo, bottom: falta - topo, extendWith: 'copy' });
    console.log(`  · ${nome} — estendidos ${topo}px no topo e ${falta - topo}px no rodapé`);
  } else {
    console.log(`  · ${nome} — já no tamanho`);
  }

  await imagem.png().toFile(destino);
}

if (houveAviso) console.log('\nAlguma captura foi pulada — veja acima.');

console.log(`\nPronto: ${saida.replace(raiz + '/', '')}/`);
