import type { CapacitorConfig } from '@capacitor/cli';

// App NATIVO de Coleta (Capacitor). Empacota a exportação estática (out/) gerada
// por `npm run build:mobile`. O app abre na tela de Coleta (out/index.html é um
// redirect para /coleta — ver scripts/mobile-postbuild.mjs).
const config: CapacitorConfig = {
  appId: 'br.com.invictaap.coleta',
  appName: 'INVICTA Coleta',
  webDir: 'out',
  ios: {
    // respeita a safe area (relógio/bateria) — o app é mobile-first portrait
    contentInset: 'always',
  },
};

export default config;
