// Gera a área de DEMONSTRAÇÃO para a revisão da Apple: um talhão fictício sobre
// o Apple Park (Cupertino, Califórnia) e uma grade de pontos densa o bastante
// para o revisor conseguir registrar uma coleta sem sair do prédio dele.
//
//   node scripts/gerar-area-demo-apple.mjs
//
// O que sai (em loja/demo-apple/):
//   talhao-demo-apple.kml   → importar como LIMITE do talhão
//   grade-demo-apple.kml    → importar em Amostragem → Importar Grade
//   previa-demo-apple.html  → conferência visual antes de importar
//
// ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────────
// A coleta só é liberada quando o operador está dentro do raio do ponto
// (`disabled={!dentroRaio}` em src/app/coleta/page.tsx). É a trava que impede
// amostra registrada no lugar errado — e é também o que impediria o revisor da
// Apple, sentado na Califórnia, de exercitar a função principal do app. Sem
// isso ele reprova com "we were unable to review the core functionality".
//
// A saída NÃO é desligar a trava (a build revisada é a build publicada — os
// operadores ficariam sem a proteção). É dar ao revisor um lugar onde ele já
// está dentro do raio.
//
// ── AS DUAS CONTAS DA DENSIDADE ──────────────────────────────────────────────
// 1. Numa grade quadrada de lado L, o pior caso é o revisor no CENTRO de uma
//    célula: L/√2 do ponto mais próximo. Com L = 30 m, isso dá 21 m.
// 2. O revisor está DENTRO de um prédio, onde o iPhone cai para posicionamento
//    por Wi-Fi e erra de 20 a 50 m. Esse erro entra somado ao de cima.
//
// Por isso a nota da revisão pede para ele subir o raio para 50 m em
// Configurações (o app já oferece de 5 a 50 m, é ajuste de usuário, não código):
// 21 m de grade + ~25 m de erro de GPS = 46 m, com folga dentro dos 50.
// Com o raio padrão de 15 m a conta não fecha em ambiente interno — daí a
// instrução ser parte da entrega, não um detalhe.

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import area from '@turf/area';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const saida = join(raiz, 'loja', 'demo-apple');
mkdirSync(saida, { recursive: true });

// Centro do anel do Apple Park.
const LAT0 = 37.33464;
const LNG0 = -122.00901;

const ESPACAMENTO_M = 30;   // lado da grade
const M_POR_GRAU_LAT = 111_320;
const M_POR_GRAU_LNG = 111_320 * Math.cos((LAT0 * Math.PI) / 180);

/** Converte um deslocamento em metros (x=leste, y=norte) para [lng, lat]. */
const paraGeo = (x, y) => [LNG0 + x / M_POR_GRAU_LNG, LAT0 + y / M_POR_GRAU_LAT];

// Contorno do talhão, em metros a partir do centro. É um hexágono irregular de
// propósito: um retângulo perfeito denuncia dado sintético, e o formato torto
// parece o que é — um talhão. Abrange ~700 m em cada direção, o suficiente para
// cobrir o anel do Apple Park (460 m de diâmetro) e o estacionamento em volta.
const CONTORNO_M = [
  [-360, 330], [120, 380], [370, 210], [340, -180],
  [60, -370], [-300, -290], [-390, 40],
];
const contorno = CONTORNO_M.map(([x, y]) => paraGeo(x, y));
contorno.push(contorno[0]);   // KML exige o anel fechado

/** Ponto dentro do polígono (ray casting), com o anel em metros. */
function dentro(x, y) {
  let bate = false;
  for (let i = 0, j = CONTORNO_M.length - 1; i < CONTORNO_M.length; j = i++) {
    const [xi, yi] = CONTORNO_M[i];
    const [xj, yj] = CONTORNO_M[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) bate = !bate;
  }
  return bate;
}

/**
 * Área em hectares pelo @turf/area — a MESMA função que a plataforma chama ao
 * importar o KML. Reimplementar a conta aqui parecia inofensivo e não é: um
 * shoelace no plano local devolve 45,6 onde a tela mostra 45,5, e meia hectare
 * de divergência é exatamente o tipo de coisa que faz alguém abortar a
 * importação achando que o arquivo entrou errado. O pacote já é dependência do
 * projeto.
 */
const areaHa = () =>
  area({ type: 'Polygon', coordinates: [contorno] }) / 10_000;

// Grade regular, SEM jitter. A plataforma sorteia um deslocamento aleatório em
// cada ponto quando gera a grade sozinha (grid.ts) — aqui isso trabalharia
// contra: o deslocamento afasta pontos vizinhos e estica o pior caso da conta
// acima. Numa área de demonstração o que importa é a cobertura, não parecer
// uma amostragem estatisticamente honesta.
const pontos = [];
const limite = 420;
for (let y = -limite; y <= limite; y += ESPACAMENTO_M) {
  const linha = [];
  for (let x = -limite; x <= limite; x += ESPACAMENTO_M) if (dentro(x, y)) linha.push([x, y]);
  // Serpentina: a numeração segue o caminho que o operador faria a pé, alternando
  // o sentido a cada linha. É a mesma convenção da grade real (campo `ordem`).
  if ((Math.round((y + limite) / ESPACAMENTO_M)) % 2 === 1) linha.reverse();
  pontos.push(...linha);
}

const kmlCabecalho = (nome) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n<name>${nome}</name>\n`;
const kmlRodape = '</Document>\n</kml>\n';
const coord = ([lng, lat]) => `${lng.toFixed(7)},${lat.toFixed(7)},0`;

// ── 1. Limite do talhão ──────────────────────────────────────────────────────
const kmlTalhao =
  kmlCabecalho('DEMO CUPERTINO — DEMO 01') +
  '<Placemark>\n<name>DEMO 01</name>\n<Polygon><outerBoundaryIs><LinearRing><coordinates>\n' +
  contorno.map(coord).join(' ') +
  '\n</coordinates></LinearRing></outerBoundaryIs></Polygon>\n</Placemark>\n' +
  kmlRodape;
writeFileSync(join(saida, 'talhao-demo-apple.kml'), kmlTalhao);

// ── 2. Grade de pontos ───────────────────────────────────────────────────────
// Cada ponto leva <name> com o número. É o campo que importarGrade.ts procura
// (CAMPOS_PREFERIDOS inclui 'name') para preservar o número da amostra.
const kmlGrade =
  kmlCabecalho('GRADE DEMO CUPERTINO') +
  pontos
    .map(([x, y], i) => {
      const n = i + 1;
      return `<Placemark>\n<name>${n}</name>\n<ExtendedData><Data name="numero"><value>${n}</value></Data></ExtendedData>\n<Point><coordinates>${coord(paraGeo(x, y))}</coordinates></Point>\n</Placemark>`;
    })
    .join('\n') +
  '\n' + kmlRodape;
writeFileSync(join(saida, 'grade-demo-apple.kml'), kmlGrade);

// ── 3. Prévia ────────────────────────────────────────────────────────────────
// Conferir ANTES de importar é barato; descobrir que o polígono saiu torto
// depois que ele virou cadastro na nuvem, não.
const previa = `<!doctype html><meta charset="utf-8"><title>Prévia — área demo Apple</title>
<style>body{margin:0;font:13px system-ui;background:#061525;color:#e2e8f0}
#m{position:absolute;inset:0}#i{position:absolute;z-index:1;top:12px;left:12px;background:rgba(6,21,37,.92);
padding:10px 14px;border-radius:10px;border:1px solid #1a3a6b;line-height:1.6}b{color:#8cc63f}</style>
<div id="i"><b>DEMO CUPERTINO · DEMO 01</b><br>${areaHa().toFixed(1)} ha · ${pontos.length} pontos · grade de ${ESPACAMENTO_M} m<br>
Pior caso até o ponto mais próximo: ${(ESPACAMENTO_M / Math.SQRT2).toFixed(0)} m</div><div id="m"></div>
<link href="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.css" rel="stylesheet">
<script src="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.js"></script>
<script>
const mapa = new maplibregl.Map({container:'m',center:[${LNG0},${LAT0}],zoom:15,
 style:{version:8,sources:{sat:{type:'raster',tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],tileSize:256}},
 layers:[{id:'sat',type:'raster',source:'sat'}]}});
// 'load' só dispara depois que os TILES chegam — atrás de proxy/firewall ele
// nunca vem e a prévia fica preta, escondendo o que ela existe para mostrar.
// 'style.load' depende apenas do estilo, que aqui é inline: o talhão e os
// pontos aparecem mesmo sem satélite.
mapa.on('style.load',()=>{
 mapa.addSource('t',{type:'geojson',data:${JSON.stringify({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [contorno] } })}});
 mapa.addLayer({id:'tf',type:'fill',source:'t',paint:{'fill-color':'#8cc63f','fill-opacity':0.18}});
 mapa.addLayer({id:'tl',type:'line',source:'t',paint:{'line-color':'#8cc63f','line-width':2}});
 mapa.addSource('p',{type:'geojson',data:${JSON.stringify({ type: 'FeatureCollection', features: pontos.map(([x, y], i) => ({ type: 'Feature', properties: { n: i + 1 }, geometry: { type: 'Point', coordinates: paraGeo(x, y) } })) })}});
 mapa.addLayer({id:'pc',type:'circle',source:'p',paint:{'circle-radius':4,'circle-color':'#fbbf24','circle-stroke-width':1,'circle-stroke-color':'#061525'}});
});
</script>`;
writeFileSync(join(saida, 'previa-demo-apple.html'), previa);

console.log(`Área de demonstração — Apple Park (${LAT0}, ${LNG0})\n`);
console.log(`  Talhão   ${areaHa().toFixed(1)} ha`);
console.log(`  Pontos   ${pontos.length} · grade de ${ESPACAMENTO_M} m`);
console.log(`  Pior caso até o ponto mais próximo: ${(ESPACAMENTO_M / Math.SQRT2).toFixed(1)} m`);
console.log(`  → com o raio em 50 m sobram ${(50 - ESPACAMENTO_M / Math.SQRT2).toFixed(0)} m para o erro de GPS interno\n`);
console.log(`  loja/demo-apple/talhao-demo-apple.kml`);
console.log(`  loja/demo-apple/grade-demo-apple.kml`);
console.log(`  loja/demo-apple/previa-demo-apple.html`);
