// Empacota o backend de interpolação num ZIP para download ("interpolador local").
// Gera public/interpolador-local-mac.zip com os .py + requirements + start.command/
// start.sh (Mac) e start.bat/start.ps1 (Windows), sob a pasta "interpolador-invicta/".
// Roda no prebuild (Vercel gera o zip fresco a cada deploy) — o arquivo é gitignored.
//
// start.command/start.sh recebem permissão de execução (0755) para o duplo-clique
// no Finder funcionar direto após descompactar.

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import JSZip from 'jszip';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const backend = join(raiz, 'backend');
const pub = join(raiz, 'public');
const PASTA = 'interpolador-invicta';

// Arquivos do backend que vão no pacote (o que o interpolador precisa p/ rodar).
const PY = ['app.py', 'interp.py', 'msr.py', 'cbers.py', 'colheita.py', 'ia.py', 'mde.py', 'indices.py', 'admin_usuarios.py'];
const OUTROS = ['requirements.txt', 'start.command', 'start.sh', 'start.bat', 'start.ps1'];
const EXECUTAVEIS = new Set(['start.command', 'start.sh']);

const LEIAME = `INTERPOLADOR LOCAL — INVICTA (macOS / Windows)
================================================================

Este é o motor de interpolação (krigagem) que roda NA SUA MÁQUINA, para lotes
pesados ("Processar tudo") sem disputar a nuvem com outros usuários.

COMO USAR (Mac) — MÉTODO QUE SEMPRE FUNCIONA (Terminal):
  1) Descompacte esta pasta.
  2) Abra o app "Terminal" (Spotlight: Cmd+Espaço, digite "Terminal").
  3) No Terminal, digite  bash  e um ESPAÇO, depois ARRASTE o arquivo "start.sh"
     desta pasta para dentro da janela do Terminal e tecle ENTER.
     (fica algo como:  bash /Users/voce/Downloads/interpolador-invicta/start.sh )
  4) Espere aparecer:  INVICTA — Interpolador local no ar em http://127.0.0.1:8800
     DEIXE ESSA JANELA ABERTA enquanto usa o app.
  5) No app (de preferência no Chrome): Configurações -> marque
     "Usar interpolador desta máquina".
  6) Pronto — as interpolações passam a rodar aqui. Para voltar à nuvem, desmarque.

  (O duplo-clique em "start.command" também funciona, MAS no macOS novo a Apple
   bloqueia arquivos baixados da internet. Se aparecer "não foi possível verificar",
   clique OK e vá em: Ajustes do Sistema -> Privacidade e Segurança -> role até o
   fim -> "start.command foi bloqueado" -> "Abrir Mesmo Assim". O método do Terminal
   acima evita isso.)

COMO USAR (Windows): dê 2 cliques em "start.bat".

REQUISITOS:
  - Python 3 instalado (macOS: "brew install python" ou python.org).
  - Na 1ª vez o script cria o ambiente e baixa as bibliotecas (~2-4 min).

Para PARAR: feche a janela ou tecle Ctrl+C nela.
`;

const zip = new JSZip();
const pasta = zip.folder(PASTA);

function add(nome, execavel) {
  const caminho = join(backend, nome);
  if (!existsSync(caminho)) { console.warn('[empacotar] pulei (não existe):', nome); return; }
  const conteudo = readFileSync(caminho);
  pasta.file(nome, conteudo, {
    unixPermissions: execavel ? 0o755 : 0o644,
    date: new Date(2020, 0, 1),   // data fixa → zip determinístico (build reproduzível)
  });
}

for (const f of PY) add(f, false);
for (const f of OUTROS) add(f, EXECUTAVEIS.has(f));
pasta.file('LEIA-ME.txt', LEIAME, { unixPermissions: 0o644, date: new Date(2020, 0, 1) });

const buf = await zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX', compression: 'DEFLATE' });
if (!existsSync(pub)) mkdirSync(pub, { recursive: true });
const saida = join(pub, 'interpolador-local-mac.zip');
writeFileSync(saida, buf);
console.log(`[empacotar] ${(buf.length / 1024).toFixed(0)} KB -> public/interpolador-local-mac.zip (${PY.length + OUTROS.length + 1} arquivos em ${PASTA}/)`);
