'use client';

// Esqueleto de carregamento (brilho em styles/portal-tema.css).

export function Esqueleto({ altura = 16, largura = '100%', className, redondo }: { altura?: number | string; largura?: number | string; className?: string; redondo?: boolean }) {
  return <span className={`portal-esqueleto block ${redondo ? 'rounded-full' : 'rounded-lg'} ${className ?? ''}`} style={{ height: altura, width: largura }} />;
}

export function EsqueletoCartao({ altura = 220, className }: { altura?: number; className?: string }) {
  return (
    <div className={`rounded-2xl p-5 space-y-3 ${className ?? ''}`} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', boxShadow: 'var(--p-sombra)' }}>
      <Esqueleto altura={18} largura="45%" />
      <Esqueleto altura={altura - 60} />
    </div>
  );
}
