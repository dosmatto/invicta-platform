import { MockIndicator } from '@/components/shared/MockIndicator';
import { StatusBadge } from '@/components/shared/StatusBadge';

export { MockIndicator, StatusBadge };

export function PanelSection({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="border-b" style={{ borderColor: '#1a3a6b' }}>
      {title && (
        <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--sidebar-section)' }}>{title}</p>
      )}
      {children}
    </div>
  );
}

export function PanelRow({
  label, value, sub, onClick, badge,
}: {
  label: string; value?: string; sub?: string; onClick?: () => void; badge?: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center justify-between px-4 py-2.5 cursor-pointer group transition-colors"
      style={{ borderBottom: '1px solid #0f2240' }}
      onClick={onClick}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-item-hover)'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: '#e2e8f0' }}>{label}</p>
        {sub && <p className="text-[11px] truncate" style={{ color: 'var(--sidebar-section)' }}>{sub}</p>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
        {badge}
        {value && <span className="text-xs font-semibold" style={{ color: '#93c5fd' }}>{value}</span>}
      </div>
    </div>
  );
}

export function PanelButton({
  label, onClick, color, icon,
}: {
  label: string; onClick?: () => void; color?: string; icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 w-full px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
      style={{ background: color ?? 'var(--invicta-blue-mid)' }}
    >
      {icon}{label}
    </button>
  );
}

export function PanelKpi({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex-1 text-center py-3">
      <p className="text-lg font-bold" style={{ color: color ?? '#fff' }}>{value}</p>
      <p className="text-[10px]" style={{ color: 'var(--sidebar-section)' }}>{label}</p>
    </div>
  );
}
