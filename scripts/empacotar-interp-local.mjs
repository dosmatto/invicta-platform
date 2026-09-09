// Empacota o backend de interpolação num ZIP para download ("interpolador local").
// Gera public/interpolador-local.zip (+ cópia com o nome antigo, p/ links salvos)
// com TODOS os .py do backend + requirements + start.command/start.sh (Mac) e
// start.bat/start.ps1 (Windows), sob a pasta "interpolador-invicta/".
// Roda no prebuild (Vercel gera o zip fresco a cada deploy) — o arquivo é gitignored.
//
// POR QUE NÃO HÁ MAIS LISTA MANUAL DE ARQUIVOS: havia, e ela ficou desatualizada.
// O `divisas.py` nasceu na 2.107.0 e ninguém o acrescentou à lista; o `app.py`
// de dentro do ZIP o importa na primeira linha, então o interpolador baixado
// morria em 1 segundo com "No module named divisas" — no Mac e no Windows. Uma
// lista que precisa ser lembrada a cada arquivo novo é um defeito esperando data.
// Agora: entra TODO .py da pasta backend, e o empacotador CONFERE que cada import
// dos arquivos empacotados existe (no pacote, na biblioteca padrão do Python ou no
// requirements.txt) — se não existir, ABORTA o build em vez de publicar um ZIP que
// só quebra na máquina do usuário.
//
// start.command/start.sh recebem permissão de execução (0755) para o duplo-clique
// no Finder funcionar direto após descompactar.

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import JSZip from 'jszip';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const backend = join(raiz, 'backend');
const pub = join(raiz, 'public');
const PASTA = 'interpolador-invicta';

// Não-.py que o pacote precisa. Faltar qualquer um destes ABORTA (sem eles o
// usuário não tem como ligar o interpolador).
const OUTROS = ['requirements.txt', 'start.command', 'start.sh', 'start.bat', 'start.ps1'];
const EXECUTAVEIS = new Set(['start.command', 'start.sh']);

// requirements.txt traz o nome do PACOTE; o código importa o nome do MÓDULO.
// Só os que diferem precisam de tradução.
const PACOTE_PARA_MODULO = {
  pillow: ['PIL'],
  'uvicorn-worker': ['uvicorn_worker'],
  'pystac-client': ['pystac_client'],
  'uvicorn[standard]': ['uvicorn'],
};

// Módulos que NÃO estão no requirements.txt porque vêm junto de quem está
// (pydantic e starlette são instalados pelo fastapi; click/h11 pelo uvicorn).
// Importá-los é seguro — o pip já os traz — mas eles precisam ser reconhecidos
// aqui para não parecerem arquivo nosso esquecido fora do pacote.
const TRANSITIVAS = new Set(['pydantic', 'starlette', 'click', 'h11', 'anyio', 'certifi', 'requests']);

// Biblioteca padrão do Python usada (ou plausível de vir a ser usada) aqui.
// Serve só para a conferência de imports — um nome a mais não faz mal; o que
// não pode é um módulo NOSSO passar por "externo" e ficar fora do pacote.
const STDLIB = new Set([
  '__future__', 'abc', 'argparse', 'array', 'asyncio', 'base64', 'binascii', 'bisect',
  'builtins', 'bz2', 'calendar', 'collections', 'colorsys', 'concurrent', 'contextlib',
  'copy', 'csv', 'ctypes', 'dataclasses', 'datetime', 'decimal', 'difflib', 'enum',
  'errno', 'faulthandler', 'fnmatch', 'fractions', 'functools', 'gc', 'getpass', 'glob',
  'gzip', 'hashlib', 'heapq', 'hmac', 'html', 'http', 'importlib', 'inspect', 'io',
  'ipaddress', 'itertools', 'json', 'logging', 'lzma', 'math', 'mimetypes', 'multiprocessing',
  'numbers', 'operator', 'os', 'pathlib', 'pickle', 'platform', 'pprint', 'queue', 'random',
  're', 'secrets', 'shutil', 'signal', 'socket', 'sqlite3', 'statistics', 'string', 'struct',
  'subprocess', 'sys', 'tempfile', 'textwrap', 'threading', 'time', 'timeit', 'traceback',
  'types', 'typing', 'unicodedata', 'urllib', 'uuid', 'warnings', 'weakref', 'xml', 'zipfile',
  'zlib', 'zoneinfo',
]);

const LEIAME = `INTERPOLADOR LOCAL — INVICTA (Windows / macOS)
================================================================

Este é o motor de interpolação (krigagem) que roda NA SUA MÁQUINA, para lotes
pesados ("Processar tudo") sem disputar a nuvem com outros usuários.

COMO USAR (WINDOWS):
  1) Descompacte esta pasta (botão direito no .zip -> "Extrair tudo").
     IMPORTANTE: rode a partir da pasta EXTRAÍDA. Dar 2 cliques direto de
     dentro do .zip não funciona — o Windows abre uma cópia temporária.
  2) Dê 2 cliques em "start.bat".
  3) Na 1ª vez ele cria o ambiente e baixa as bibliotecas (~2-4 min).
  4) Espere aparecer:  INVICTA — Interpolador local no ar em http://127.0.0.1:8800
     DEIXE ESSA JANELA ABERTA enquanto usa o app.
  5) No app (Chrome ou Edge): Configurações -> marque
     "Usar interpolador desta máquina".
  Se a janela fechar sozinha ou aparecer um erro, ele fica escrito na tela e
  espera você teclar ENTER — leia a mensagem antes de fechar.

COMO USAR (macOS) — MÉTODO QUE SEMPRE FUNCIONA (Terminal):
  1) Descompacte esta pasta.
  2) Abra o app "Terminal" (Spotlight: Cmd+Espaço, digite "Terminal").
  3) No Terminal, digite  bash  e um ESPAÇO, depois ARRASTE o arquivo "start.sh"
     desta pasta para dentro da janela do Terminal e tecle ENTER.
     (fica algo como:  bash /Users/voce/Downloads/interpolador-invicta/start.sh )
  4) Espere aparecer:  INVICTA — Interpolador local no ar em http://127.0.0.1:8800
     DEIXE ESSA JANELA ABERTA enquanto usa o app.
  5) No app (de preferência no Chrome): Configurações -> marque
     "Usar interpolador desta máquina".

  (O duplo-clique em "start.command" também funciona, MAS no macOS novo a Apple
   bloqueia arquivos baixados da internet. Se aparecer "não foi possível verificar",
   clique OK e vá em: Ajustes do Sistema -> Privacidade e Segurança -> role até o
   fim -> "start.command foi bloqueado" -> "Abrir Mesmo Assim". O método do Terminal
   acima evita isso.)

REQUISITOS:
  - Python 3 instalado.
      Windows: https://python.org/downloads — MARQUE "Add python.exe to PATH"
               na primeira tela do instalador.
      macOS:   "brew install python" ou python.org.
  - Na 1ª vez o script cria o ambiente e baixa as bibliotecas (~2-4 min).

ATUALIZANDO: baixe o .zip de novo e descompacte POR CIMA da pasta antiga. O
ambiente Python já instalado é reaproveitado — só as bibliotecas que mudaram
são baixadas.

NO SAFARI NÃO FUNCIONA: ele bloqueia um site https de falar com um programa da
própria máquina. Use Chrome (ou Edge, no Windows).

Para PARAR: feche a janela ou tecle Ctrl+C nela.
`;

// ── Coleta dos arquivos ─────────────────────────────────────────────────────
const py = readdirSync(backend)
  .filter(n => n.endsWith('.py') && !n.startsWith('.'))
  .sort();
if (!py.includes('app.py')) {
  console.error('[empacotar] ERRO: backend/app.py não existe — nada a empacotar.');
  process.exit(1);
}

const faltando = OUTROS.filter(n => !existsSync(join(backend, n)));
if (faltando.length) {
  console.error(`[empacotar] ERRO: faltam arquivos obrigatórios no backend: ${faltando.join(', ')}`);
  process.exit(1);
}

// ── Conferência: todo import dos .py empacotados tem de existir ─────────────
// (é a trava que faltava quando o divisas.py ficou de fora e o ZIP publicado
//  quebrava na máquina do usuário)
const modulosNoPacote = new Set(py.map(n => n.slice(0, -3)));
const externos = new Set();
for (const linha of readFileSync(join(backend, 'requirements.txt'), 'utf8').split('\n')) {
  const bruta = linha.split('#')[0].trim();
  if (!bruta) continue;
  const pacote = bruta.split(/[=<>!~[\]]/)[0].trim().toLowerCase();
  const comExtras = bruta.split(/[=<>!~]/)[0].trim().toLowerCase();
  for (const m of PACOTE_PARA_MODULO[comExtras] ?? PACOTE_PARA_MODULO[pacote] ?? [pacote]) externos.add(m);
  externos.add(pacote.replace(/-/g, '_'));
}

const RE_IMPORT = /^[ \t]*(?:import|from)[ \t]+([A-Za-z_][A-Za-z0-9_.]*)/gm;
const orfaos = [];
for (const nome of py) {
  const src = readFileSync(join(backend, nome), 'utf8');
  for (const [, alvo] of src.matchAll(RE_IMPORT)) {
    const raizMod = alvo.split('.')[0];
    if (modulosNoPacote.has(raizMod) || STDLIB.has(raizMod)
      || externos.has(raizMod) || TRANSITIVAS.has(raizMod)) continue;
    orfaos.push(`${nome}: import ${alvo}`);
  }
}
if (orfaos.length) {
  console.error('[empacotar] ERRO — imports sem origem no pacote (o interpolador baixado NÃO abriria):');
  for (const o of [...new Set(orfaos)]) console.error('  •', o);
  console.error('  Acrescente o arquivo ao backend/ ou a dependência ao backend/requirements.txt.');
  process.exit(1);
}

// ── Monta o ZIP ─────────────────────────────────────────────────────────────
const zip = new JSZip();
const pasta = zip.folder(PASTA);

// Scripts do Windows precisam de CRLF. O .gitattributes cuida disso no clone do
// Windows, mas o ZIP é gerado no build da Vercel (Linux), onde o checkout vem com
// LF — e o cmd.exe erra ao ler blocos (if/else de várias linhas) sem CRLF.
// Forçar aqui deixa o pacote correto qualquer que seja a máquina que o gerou.
const CRLF = new Set(['start.bat', 'start.ps1']);

function add(nome, execavel) {
  let conteudo = readFileSync(join(backend, nome));
  if (CRLF.has(nome)) conteudo = Buffer.from(conteudo.toString('utf8').replace(/\r?\n/g, '\r\n'), 'utf8');
  pasta.file(nome, conteudo, {
    unixPermissions: execavel ? 0o755 : 0o644,
    date: new Date(2020, 0, 1),   // data fixa → zip determinístico (build reproduzível)
  });
}

for (const f of py) add(f, false);
for (const f of OUTROS) add(f, EXECUTAVEIS.has(f));
pasta.file('LEIA-ME.txt', LEIAME, { unixPermissions: 0o644, date: new Date(2020, 0, 1) });

const buf = await zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX', compression: 'DEFLATE' });
if (!existsSync(pub)) mkdirSync(pub, { recursive: true });
// Nome atual (o pacote serve aos dois sistemas) + o nome antigo, porque links
// e favoritos de "interpolador-local-mac.zip" continuam por aí.
const saidas = ['interpolador-local.zip', 'interpolador-local-mac.zip'];
for (const s of saidas) writeFileSync(join(pub, s), buf);
console.log(`[empacotar] ${(buf.length / 1024).toFixed(0)} KB -> public/${saidas.join(' + public/')} `
  + `(${py.length} .py + ${OUTROS.length} + LEIA-ME em ${PASTA}/)`);
