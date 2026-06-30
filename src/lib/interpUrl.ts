// URL única do backend de interpolação/krigagem/satélite.
//
// Padrão = NUVEM (Render), para o app funcionar SEM nenhum backend local
// ("parruda + online"). Para desenvolver o backend localmente, defina
// NEXT_PUBLIC_INTERP_URL=http://127.0.0.1:8800 no .env.local (override).
export const INTERP_URL =
  process.env.NEXT_PUBLIC_INTERP_URL ?? 'https://invicta-fertilidade-backend.onrender.com';
