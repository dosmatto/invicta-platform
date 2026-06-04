// Layout próprio para Base Agronômica — substitui o layout map-cêntrico do painel
// Usa tela cheia com scroll, sem mapa
export default function BaseAgronomicaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      {children}
    </div>
  );
}
