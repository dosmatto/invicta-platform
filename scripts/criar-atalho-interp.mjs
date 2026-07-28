// Cria um ATALHO (app do macOS) na Área de Trabalho que liga o interpolador local:
// dois cliques -> abre o Terminal já rodando o backend em 127.0.0.1:8800.
//
// Por que um app criado AQUI e não o start.command baixado: arquivo baixado da
// internet vem com a "quarentena" do macOS e o Gatekeeper bloqueia o duplo-clique.
// Gerado localmente, não há quarentena — o duplo-clique funciona direto.
//
// Uso:  npm run interp:atalho            (aponta para o backend deste repositório)
//       npm run interp:atalho -- /caminho/da/pasta/interpolador-invicta
//
// Pode rodar quantas vezes quiser: refaz o atalho por cima.

import { existsSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const backend = resolve(process.argv[2] ?? join(raiz, 'backend'));
const inicio = join(backend, 'start.sh');
const NOME = 'Interpolador INVICTA';
const app = join(homedir(), 'Desktop', `${NOME}.app`);

if (process.platform !== 'darwin') {
  console.error('[atalho] Este atalho é do macOS. No Windows, use o start.bat do pacote.');
  process.exit(1);
}
if (!existsSync(inicio)) {
  console.error(`[atalho] Não achei o start.sh em ${backend}`);
  process.exit(1);
}

// Lançador: valida o caminho antes (se o repo mudar de lugar, avisa em vez de
// abrir um Terminal com erro) e entrega o start.sh para o Terminal executar.
const LANCADOR = `#!/bin/bash
# Gerado por scripts/criar-atalho-interp.mjs — não edite à mão, rode o script de novo.
INICIO=${JSON.stringify(inicio)}
if [ ! -f "$INICIO" ]; then
  osascript -e 'display alert "Interpolador INVICTA" message "Não achei os arquivos do interpolador. Eles foram movidos ou apagados. Rode: npm run interp:atalho" as critical'
  exit 1
fi
exec open -a Terminal "$INICIO"
`;

const PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>${NOME}</string>
  <key>CFBundleDisplayName</key><string>${NOME}</string>
  <key>CFBundleIdentifier</key><string>br.com.invictaap.interpolador</string>
  <key>CFBundleExecutable</key><string>interpolador</string>
  <key>CFBundleIconFile</key><string>interpolador</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
`;

rmSync(app, { recursive: true, force: true });
const macos = join(app, 'Contents', 'MacOS');
const recursos = join(app, 'Contents', 'Resources');
mkdirSync(macos, { recursive: true });
mkdirSync(recursos, { recursive: true });
writeFileSync(join(app, 'Contents', 'Info.plist'), PLIST);
writeFileSync(join(macos, 'interpolador'), LANCADOR);
chmodSync(join(macos, 'interpolador'), 0o755);

// Ícone: reaproveita o do app de coleta. Puro enfeite — se falhar, segue sem ele.
try {
  const png = join(raiz, 'public', 'icons', 'coleta-512.png');
  const iconset = join(recursos, 'interpolador.iconset');
  mkdirSync(iconset, { recursive: true });
  for (const [px, nome] of [[16, '16x16'], [32, '16x16@2x'], [32, '32x32'], [64, '32x32@2x'],
    [128, '128x128'], [256, '128x128@2x'], [256, '256x256'], [512, '256x256@2x'], [512, '512x512']]) {
    execFileSync('sips', ['-z', String(px), String(px), png, '--out', join(iconset, `icon_${nome}.png`)], { stdio: 'ignore' });
  }
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(recursos, 'interpolador.icns')], { stdio: 'ignore' });
  rmSync(iconset, { recursive: true, force: true });
} catch { console.warn('[atalho] sem ícone personalizado (segue com o ícone padrão)'); }

// Finder guarda o ícone em cache; mexer na data do pacote faz ele reler.
try { execFileSync('touch', [app]); } catch { /* irrelevante */ }

console.log(`[atalho] criado: ${app}`);
console.log(`[atalho] aponta para: ${inicio}`);
console.log('[atalho] dois cliques nele abrem o Terminal já rodando o interpolador.');
