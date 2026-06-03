'use client';

import { Bell, User } from 'lucide-react';

interface HeaderProps {
  title: string;
  breadcrumb?: string[];
}

export function Header({ title, breadcrumb = [] }: HeaderProps) {
  return (
    <header className="h-14 flex items-center justify-between px-6 border-b"
      style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
      <div>
        {breadcrumb.length > 0 && (
          <p className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>
            {breadcrumb.join(' › ')}
          </p>
        )}
        <h1 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h1>
      </div>
      <div className="flex items-center gap-3">
        <button className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <Bell size={18} style={{ color: 'var(--text-secondary)' }} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
            style={{ background: 'var(--status-error)' }} />
        </button>
        <div className="flex items-center gap-2 pl-3 border-l" style={{ borderColor: 'var(--border-color)' }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
            style={{ background: 'var(--invicta-blue)' }}>
            <User size={16} />
          </div>
          <div className="hidden sm:block">
            <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Equipe Invicta</p>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Técnico</p>
          </div>
        </div>
      </div>
    </header>
  );
}
