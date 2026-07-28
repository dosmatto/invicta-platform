import type { NextConfig } from "next";

// BUILD_MOBILE=1 → exportação ESTÁTICA (out/) para empacotar no app nativo
// iOS/Android (Capacitor). Nesse modo: output 'export', next/image sem
// otimização de servidor, e SEM headers() (não se aplicam a arquivos locais
// dentro do app). Sem a flag, o build é o da PLATAFORMA (Vercel) — inalterado.
const mobile = process.env.BUILD_MOBILE === '1';

const plataforma: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Impede o navegador de "adivinhar" o tipo de conteúdo (MIME sniffing).
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Envia só a origem como referrer para outros sites.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Bloqueia o app dentro de iframes (clickjacking).
          { key: 'X-Frame-Options', value: 'DENY' },
          // Content-Security-Policy foi propositalmente OMITIDA: o app usa
          // MapLibre (workers + blob:), tiles da Esri, Supabase e backend no
          // Render — uma CSP mal calibrada derruba o mapa. Se um dia for
          // adicionada, precisa liberar worker-src blob:, connect-src para
          // Supabase/Render/Esri e img-src para os tiles.
        ],
      },
    ];
  },
};

const app: NextConfig = {
  output: 'export',
  images: { unoptimized: true },   // sem servidor de otimização no app empacotado
  trailingSlash: true,             // rotas viram pastas (/coleta/index.html) — casa com file://
};

export default (mobile ? app : plataforma);
