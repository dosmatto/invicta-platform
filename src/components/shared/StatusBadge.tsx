type Status = 'ativo' | 'incompleto' | 'processando' | 'concluido' | 'aguardando' | 'erro' | 'rascunho' | 'inativo';

const config: Record<Status, { label: string; bg: string; color: string }> = {
  ativo:        { label: 'Ativo',        bg: 'var(--status-active-bg)',      color: 'var(--status-active)' },
  incompleto:   { label: 'Incompleto',   bg: 'var(--status-error-bg)',       color: 'var(--status-error)' },
  processando:  { label: 'Processando',  bg: 'var(--status-processing-bg)',  color: 'var(--status-processing)' },
  concluido:    { label: 'Concluído',    bg: 'var(--status-active-bg)',      color: 'var(--status-active)' },
  aguardando:   { label: 'Aguardando',   bg: 'var(--status-warning-bg)',     color: 'var(--status-warning)' },
  erro:         { label: 'Erro',         bg: 'var(--status-error-bg)',       color: 'var(--status-error)' },
  rascunho:     { label: 'Rascunho',     bg: '#f1f5f9',                      color: '#64748b' },
  inativo:      { label: 'Inativo',      bg: '#f1f5f9',                      color: '#64748b' },
};

export function StatusBadge({ status }: { status: Status }) {
  const s = config[status] ?? config.rascunho;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}
