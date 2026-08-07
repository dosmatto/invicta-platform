// Testes do CABEÇALHO OFICIAL dos relatórios (src/lib/pdfCabecalho.ts).
// Pedido de 07/08/2026, com print anotado: o título tinha que parar de encolher
// (mesmo corpo em TODOS os layouts), o quadro "Informações da área" tinha que ir
// para o extremo direito e ficar JUSTIFICADO lá, o fuso tinha que sair, o datum
// virar WGS 84 e o laboratório entrar no quadro.
// Roda: `npm run teste:cabecalho`.
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import {
  desenharCabecalhoOficial, marcaInvicta, TITULO_PT, TITULO_MAXW, DATUM,
  larguraLogoCliente, bordaInfoArea, MARCA_H, MARCA_Y, PE_Y,
} from '../src/lib/pdfCabecalho.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

const W = 297, H = 210, M = 6;

// Grava tudo que o cabeçalho desenha, delegando as MEDIDAS a um jsPDF de verdade
// (getTextWidth precisa das métricas reais da helvetica).
function desenhar(opts) {
  const real = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const textos = [], imagens = [];
  let fonte = 'normal', corpo = 10;
  const doc = {
    getTextWidth: (s) => real.getTextWidth(s),
    setFont: (f, e) => { fonte = e ?? 'normal'; real.setFont(f, e); },
    setFontSize: (s) => { corpo = s; real.setFontSize(s); },
    setTextColor: () => {}, setDrawColor: () => {}, setLineWidth: () => {}, line: () => {},
    addImage: (_i, _f, x, y, w, h) => imagens.push({ x, y, w, h }),
    text: (txt, x, y, o) => textos.push({ txt, x, y, align: o?.align ?? 'left', corpo, fonte, largura: real.getTextWidth(txt) }),
  };
  desenharCabecalhoOficial(doc, opts);
  return { textos, imagens };
}

const logoFalsa = (wPx, hPx) => ({ naturalWidth: wPx, naturalHeight: hPx });
const BASE = {
  logoCliente: null,
  fazenda: 'Estância JM',
  esquerda: ['Produtor: JONATHAN VALLE MARIANO', 'Ano: 2026   |   Data: 08/2026'],
  titulo: 'Ca%', subtitulo: 'Saturação por Cálcio (%)',
  info: ['Área Total: 33,70 ha', 'Município: Ponta Grossa - PR', `Datum: ${DATUM}`],
};
const infoDe = (textos) => textos.filter(t => t.y >= 13 && t.align === 'right');

console.log('\nCabeçalho oficial dos relatórios\n');

t('título sai no corpo FIXO, sem encolher — o mesmo em qualquer layout', () => {
  const curto = desenhar(BASE).textos.find(t => t.txt === 'Ca%');
  const longo = desenhar({ ...BASE, titulo: 'ZONAS DE MANEJO', subtitulo: 'Produtividade 3 zonas' })
    .textos.find(t => t.txt === 'ZONAS DE MANEJO');
  assert.equal(curto.corpo, TITULO_PT);
  assert.equal(longo.corpo, TITULO_PT, 'o título longo encolheu — era o defeito antigo');
});

t('o corpo fixo COMPORTA o maior título existente sem cortar', () => {
  const longo = desenhar({ ...BASE, titulo: 'ZONAS DE MANEJO' }).textos.find(t => t.corpo === TITULO_PT);
  assert.equal(longo.txt, 'ZONAS DE MANEJO', 'o maior título saiu truncado com "…"');
});

t('a sigla sai LITERAL — "Ca%" não pode virar "CA%"', () => {
  assert.ok(desenhar(BASE).textos.some(t => t.txt === 'Ca%'));
});

t('quadro de informações JUSTIFICADO: todas as linhas terminam no mesmo x', () => {
  const linhas = infoDe(desenhar(BASE).textos);
  assert.equal(linhas.length, BASE.info.length);
  assert.ok(linhas.every(l => l.align === 'right'), 'linha sem alinhamento à direita');
  assert.equal(new Set(linhas.map(l => l.x)).size, 1, 'as linhas não terminam alinhadas');
});

t('sem logo do cliente, o quadro encosta na margem direita da página', () => {
  const linhas = infoDe(desenhar(BASE).textos);
  assert.equal(linhas[0].x, W - M);
});

t('com logo do cliente, o quadro para na borda ESQUERDA da logo (sem sobrepor)', () => {
  const cli = logoFalsa(400, 200);            // 2:1 → 32 mm de largura
  const { textos, imagens } = desenhar({ ...BASE, logoCliente: cli });
  const wCli = larguraLogoCliente(cli);
  const linhas = infoDe(textos);
  const logo = imagens.at(-1);
  assert.equal(linhas[0].x, bordaInfoArea(wCli));
  assert.ok(linhas[0].x < logo.x, 'o quadro entraria por baixo da logo do cliente');
});

t('logo MUITO larga é limitada a 34 mm e o quadro se ajusta a ela', () => {
  const cli = logoFalsa(2000, 200);
  assert.equal(larguraLogoCliente(cli), 34);
  assert.equal(infoDe(desenhar({ ...BASE, logoCliente: cli }).textos)[0].x, W - M - 34 - 5);
});

t('o quadro não invade o título central nem estoura a régua do cabeçalho', () => {
  const { textos } = desenhar(BASE);
  const titulo = textos.find(t => t.corpo === TITULO_PT);
  const dirTitulo = titulo.x + titulo.largura / 2;
  for (const l of infoDe(textos)) {
    assert.ok(l.x - l.largura > dirTitulo, `"${l.txt}" encosta no título`);
    assert.ok(l.y <= 25, `"${l.txt}" passa da régua em 26,5 mm`);
  }
});

t('FUSO saiu do cabeçalho e o datum é WGS 84', () => {
  const tudo = desenhar(BASE).textos.map(t => t.txt).join(' | ');
  assert.equal(DATUM, 'WGS 84');
  assert.ok(!/fuso/i.test(tudo), 'o fuso continua no cabeçalho');
  assert.ok(tudo.includes('Datum: WGS 84'));
  assert.ok(!/SIRGAS/i.test(tudo));
});

t('o subtítulo é o nome da variável com a unidade', () => {
  const sub = desenhar(BASE).textos.find(t => t.corpo === 9);
  assert.equal(sub.txt, 'Saturação por Cálcio (%)');
});

// ── Modelo aprovado em 07/08/2026 ─────────────────────────────────────────────

t('LABORATÓRIO saiu do quadro de informações (foi assinar o pé da página)', () => {
  const tudo = desenhar(BASE).textos.map(t => t.txt).join(' | ');
  assert.ok(!/laborat/i.test(tudo), 'o laboratório continua no cabeçalho');
});

t('a fazenda encosta na MARGEM esquerda (a logo saiu do cabeçalho)', () => {
  const { textos, imagens } = desenhar(BASE);
  assert.equal(textos.find(t => t.corpo === 12).x, M);
  assert.equal(imagens.length, 0, 'o cabeçalho ainda desenha alguma logo');
});

t('as linhas de contexto acompanham a fazenda na margem', () => {
  const ctx = desenhar(BASE).textos.filter(t => t.corpo === 8.5);
  assert.equal(ctx.length, 2);
  assert.ok(ctx.every(t => t.x === M));
});

t('título e subtítulo CENTRALIZADOS na página, entre os blocos laterais', () => {
  const { textos } = desenhar(BASE);
  const titulo = textos.find(t => t.corpo === TITULO_PT);
  const sub = textos.find(t => t.corpo === 9);
  assert.equal(titulo.align, 'center');
  assert.equal(titulo.x, W / 2, 'o título não está no centro da página');
  assert.equal(sub.x, W / 2, 'o subtítulo não acompanha o título');
  // não pode encostar em nenhum dos dois blocos laterais
  const esqFim = Math.max(...textos.filter(t => t.align === 'left').map(t => t.x + t.largura));
  assert.ok(titulo.x - titulo.largura / 2 > esqFim, 'o título encosta no bloco da fazenda');
  assert.ok(titulo.x + titulo.largura / 2 < Math.min(...infoDe(textos).map(l => l.x - l.largura)));
});

t('nome comprido de fazenda não invade o título (corta com "…")', () => {
  const { textos } = desenhar({ ...BASE, fazenda: 'Fazenda Nossa Senhora Aparecida do Alto Rio Grande do Norte e Arredores' });
  const faz = textos.find(t => t.corpo === 12);
  assert.ok(faz.txt.endsWith('…'));
  assert.ok(M + faz.largura < W / 2 - TITULO_MAXW / 2, 'a fazenda entra na caixa do título');
});

t('a marca INVICTA fica no pé da área branca, sem tocar a barra do rodapé', () => {
  const logo = logoFalsa(2111, 669);            // a logo-colorida.png real
  const imagens = [];
  const espia = { addImage: (_i, _f, x, y, w, h) => imagens.push({ x, y, w, h }) };
  marcaInvicta(espia, logo, 'direita');
  marcaInvicta(espia, logo, 'esquerda');
  const [dir, esq] = imagens;
  assert.equal(dir.y, MARCA_Y);
  assert.equal(dir.h, MARCA_H);
  assert.ok(dir.y + dir.h < H - 10, 'a marca invade a barra azul do rodapé');
  assert.equal(dir.x + dir.w, W - M, 'a marca da direita não encosta na margem');
  assert.equal(esq.x, M, 'a marca da esquerda não encosta na margem');
});

t('a linha do laboratório fica dentro da faixa da marca, acima da barra', () => {
  assert.ok(PE_Y > MARCA_Y && PE_Y <= MARCA_Y + MARCA_H);
  assert.ok(PE_Y < H - 10);
});

t('sem logo do cliente o cabeçalho não desenha imagem nenhuma', () => {
  assert.equal(desenhar(BASE).imagens.length, 0);
});

console.log(`\n${ok} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
