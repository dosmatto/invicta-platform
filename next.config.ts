import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
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

export default nextConfig;
