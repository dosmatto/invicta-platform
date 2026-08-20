// Build ESTÁTICO do app nativo (Capacitor) — gera out/.
//
// A plataforma tem rotas que só existem no SERVIDOR e que o `output: 'export'`
// não aceita: /talhao/[id] (dinâmica, sem generateStaticParams) e /api (Route
// Handlers da ingestão de laudos). Em vez de alterar essas rotas — e mudar o
// comportamento delas na plataforma —, movemos as pastas TEMPORARIAMENTE só
// durante o build mobile. O app de campo não abre nenhuma das duas: ele fala
// com o Supabase direto. Assim o build da Vercel fica 100% inalterado.
import { renameSync, existsSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const cwd = process.cwd();
const SO_SERVIDOR = ['talhao', 'api'].map(nome => ({
  ativa: join(cwd, 'src/app', nome),
  off: join(cwd, `src/app/_${nome}_mobile_off`),
}));

// Recupera de uma execução anterior interrompida (pasta ficou movida).
for (const r of SO_SERVIDOR) if (existsSync(r.off) && !existsSync(r.ativa)) renameSync(r.off, r.ativa);

const movidas = [];
try {
  for (const r of SO_SERVIDOR) {
    if (existsSync(r.ativa)) { renameSync(r.ativa, r.off); movidas.push(r); }
  }
  execSync('next build', { stdio: 'inherit', env: { ...process.env, BUILD_MOBILE: '1' } });
} finally {
  for (const r of movidas) if (existsSync(r.off)) renameSync(r.off, r.ativa);
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
