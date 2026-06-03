import { Sidebar } from '@/components/layout/Sidebar';

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg-app)' }}>
      <Sidebar />
      <main className="flex-1 flex flex-col" style={{ marginLeft: 'var(--sidebar-width)' }}>
        {children}
      </main>
    </div>
  );
}
