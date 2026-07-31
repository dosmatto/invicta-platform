import type { CapacitorConfig } from '@capacitor/cli';

// App NATIVO de Coleta (Capacitor). Empacota a exportação estática (out/) gerada
// por `npm run build:mobile`. O app abre na tela de Coleta (out/index.html é um
// redirect para /coleta — ver scripts/mobile-postbuild.mjs).
const config: CapacitorConfig = {
  appId: 'br.agr.invicta.coleta',
  appName: 'INVICTA Coleta',
  webDir: 'out',
  ios: {
    // respeita a safe area (relógio/bateria) — o app é mobile-first portrait
    contentInset: 'always',
  },
  plugins: {
    // O cabeçalho do app estava POR BAIXO da barra de status do Android
    // (relógio/sinal/bateria): do Android 15 em diante o sistema desenha
    // "edge-to-edge" por padrão, e a WebView passa a ocupar a tela inteira.
    // `overlaysWebView: false` faz o sistema RESERVAR a faixa da barra, então o
    // conteúdo começa abaixo dela. A cor casa com o fundo do app para a faixa
    // não aparecer como uma tarja destoante.
    StatusBar: {
      overlaysWebView: false,
      style: 'DARK',              // ícones claros sobre fundo escuro
      backgroundColor: '#061525',
    },
  },
};

export default config;
