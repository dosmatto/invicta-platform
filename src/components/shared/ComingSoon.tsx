import { Construction } from 'lucide-react';
import { Header } from '@/components/layout/Header';

interface ComingSoonProps {
  title: string;
  breadcrumb: string[];
  description?: string;
}

export function ComingSoon({ title, breadcrumb, description }: ComingSoonProps) {
  return (
    <>
      <Header title={title} breadcrumb={breadcrumb} />
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-12">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: 'var(--status-info-bg)' }}>
          <Construction size={32} style={{ color: 'var(--invicta-blue-mid)' }} />
        </div>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
        <p className="text-sm text-center max-w-sm" style={{ color: 'var(--text-muted)' }}>
          {description ?? 'Este módulo está em desenvolvimento. Em breve estará disponível com todas as funcionalidades.'}
        </p>
        <span className="px-3 py-1 rounded-full text-xs font-medium"
          style={{ background: 'var(--status-warning-bg)', color: 'var(--status-warning)' }}>
          Em desenvolvimento
        </span>
      </div>
    </>
  );
}
