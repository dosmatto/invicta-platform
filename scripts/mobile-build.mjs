// Build ESTÁTICO do app nativo (Capacitor) — gera out/.
//
// A plataforma tem a rota dinâmica de servidor /talhao/[id], que o `output:
// export` não aceita sem generateStaticParams. Em vez de alterar essa rota (e
// mudar o comportamento dela na plataforma), removemos /talhao TEMPORARIAMENTE
// só durante o build mobile — o app de campo não abre essa rota. Assim o build
// da plataforma (Vercel) fica 100% inalterado.
import { renameSync, existsSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const cwd = process.cwd();
const talhao = join(cwd, 'src/app/talhao');
const off = join(cwd, 'src/app/_talhao_mobile_off');

// Recupera de uma execução anterior interrompida (rota ficou movida).
if (existsSync(off) && !existsSync(talhao)) renameSync(off, talhao);

let movida = false;
try {
  if (existsSync(talhao)) { renameSync(talhao, off); movida = true; }
  execSync('next build', { stdio: 'inherit', env: { ...process.env, BUILD_MOBILE: '1' } });
} finally {
  if (movida && existsSync(off)) renameSync(off, talhao);
}

// A abertura do app cai em out/index.html; como o app é só a Coleta, essa raiz
// vira um redirect para /coleta/ (a landing da plataforma não faz sentido aqui).
// Alvo EXPLÍCITO do arquivo (…/coleta/index.html): sob o esquema capacitor://
// do iOS, um redirect para o diretório "/coleta/" não resolve o index e trava a
// abertura numa tela em branco; o caminho completo do arquivo carrega certo.
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta http-equiv="refresh" content="0; url=./coleta/index.html">
<title>INVICTA Coleta</title>
<script>location.replace('./coleta/index.html');</script>
</head><body style="background:#061525"></body></html>`;
writeFileSync(join(cwd, 'out/index.html'), html, 'utf8');
console.log('[mobile] build ok · out/index.html → redirect para /coleta/');
