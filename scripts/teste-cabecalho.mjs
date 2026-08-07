// Testes do CABEÇALHO OFICIAL dos relatórios (src/lib/pdfCabecalho.ts).
// Pedido de 07/08/2026, com print anotado: o título tinha que parar de encolher
// (mesmo corpo em TODOS os layouts), o quadro "Informações da área" tinha que ir
// para o extremo direito e ficar JUSTIFICADO lá, o fuso tinha que sair, o datum
// virar WGS 84 e o laboratório entrar no quadro.
// Roda: `npm run teste:cabecalho`.
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import {
  desenharCabecalhoOficial, TITULO_PT, DATUM, larguraLogoCliente, bordaInfoArea,
} from '../src/lib/pdfCabecalho.ts';

let ok = 0, fail = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓', nome); }
  catch (e) { fail++; console.error('  ✗', nome, '—', e.message); }
}

const W = 297, M = 6;

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
  logoInvicta: null, logoCliente: null,
  fazenda: 'Estância JM',
  esquerda: ['Produtor: JONATHAN VALLE MARIANO', 'Ano: 2026   |   Data: 08/2026'],
  titulo: 'Ca%', subtitulo: 'Saturação por Cálcio (%)',
  info: ['Área Total: 33,70 ha', 'Município: Ponta Grossa - PR', `Datum: ${DATUM}`, 'Laboratório: Fundação ABC'],
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

t('LABORATÓRIO entrou no quadro (saiu de baixo do título)', () => {
  const { textos } = desenhar(BASE);
  assert.ok(infoDe(textos).some(l => l.txt === 'Laboratório: Fundação ABC'));
  const sub = textos.find(t => t.corpo === 9);
  assert.equal(sub.txt, 'Saturação por Cálcio (%)', 'o subtítulo deixou de ser o nome da variável');
});

t('nome comprido de fazenda não invade o título (corta com "…")', () => {
  const { textos } = desenhar({ ...BASE, fazenda: 'Fazenda Nossa Senhora Aparecida do Rio Grande do Norte' });
  const faz = textos.find(t => t.corpo === 12);
  assert.ok(faz.txt.endsWith('…'));
  assert.ok(faz.largura <= 60);
});

console.log(`\n${ok} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
