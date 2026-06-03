import { Header } from '@/components/layout/Header';
import { MockIndicator } from '@/components/shared/MockIndicator';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { MOCK_KPIS, MOCK_PROCESSAMENTOS, MOCK_TALHOES } from '@/constants/mocks';
import {
  Users, Building2, Map, BarChart3, Activity, ArrowUpRight,
} from 'lucide-react';

const kpiCards = [
  { label: 'Produtores', value: MOCK_KPIS.produtores, icon: Users, color: 'var(--invicta-blue)' },
  { label: 'Fazendas', value: MOCK_KPIS.fazendas, icon: Building2, color: 'var(--invicta-blue-mid)' },
  { label: 'Talhões Ativos', value: MOCK_KPIS.talhoesAtivos, icon: Map, color: 'var(--status-active)' },
  { label: 'Área Total (ha)', value: MOCK_KPIS.areaTotal.toLocaleString('pt-BR'), icon: BarChart3, color: 'var(--invicta-green)' },
];

export default function DashboardPage() {
  return (
    <>
      <Header title="Dashboard" breadcrumb={['Painel Invicta']} />
      <div className="flex-1 p-6 space-y-6">

        {/* Safra atual */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Safra atual:</span>
          <span className="text-sm font-bold px-2 py-0.5 rounded"
            style={{ background: 'var(--status-info-bg)', color: 'var(--status-info)' }}>
            {MOCK_KPIS.safraAtual}
          </span>
          <MockIndicator />
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="rounded-xl p-4 border flex items-center gap-4"
                style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ background: card.color + '18' }}>
                  <Icon size={20} style={{ color: card.color }} />
                </div>
                <div>
                  <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{card.value}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{card.label}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Últimos Processamentos */}
          <div className="rounded-xl border p-5"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity size={16} style={{ color: 'var(--invicta-blue)' }} />
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Processamentos Recentes
                </h2>
                <MockIndicator />
              </div>
            </div>
            <div className="space-y-3">
              {MOCK_PROCESSAMENTOS.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2 border-b last:border-0"
                  style={{ borderColor: 'var(--border-color)' }}>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{p.tipo}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{p.talhao} · {p.data}</p>
                  </div>
                  <StatusBadge status={p.status as 'ativo' | 'concluido' | 'processando' | 'aguardando'} />
                </div>
              ))}
            </div>
          </div>

          {/* Talhões Recentes */}
          <div className="rounded-xl border p-5"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Map size={16} style={{ color: 'var(--invicta-green)' }} />
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Talhões
                </h2>
                <MockIndicator />
              </div>
              <a href="/painel/talhoes" className="text-xs flex items-center gap-1"
                style={{ color: 'var(--invicta-blue-mid)' }}>
                Ver todos <ArrowUpRight size={12} />
              </a>
            </div>
            <div className="space-y-3">
              {MOCK_TALHOES.map((t) => (
                <div key={t.id} className="flex items-center justify-between py-2 border-b last:border-0"
                  style={{ borderColor: 'var(--border-color)' }}>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t.nome}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t.fazenda} · {t.area} ha</p>
                  </div>
                  <StatusBadge status={t.status as 'ativo' | 'incompleto'} />
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Alerta talhões incompletos */}
        {MOCK_KPIS.talhoesIncompletos > 0 && (
          <div className="flex items-center gap-3 p-4 rounded-xl border"
            style={{ background: 'var(--status-warning-bg)', borderColor: '#fcd34d' }}>
            <Map size={18} style={{ color: 'var(--status-warning)' }} />
            <p className="text-sm" style={{ color: 'var(--status-warning)' }}>
              <strong>{MOCK_KPIS.talhoesIncompletos} talhões</strong> estão incompletos — sem limite geográfico cadastrado.
            </p>
            <a href="/painel/talhoes" className="ml-auto text-xs font-medium underline"
              style={{ color: 'var(--status-warning)' }}>
              Resolver
            </a>
          </div>
        )}

      </div>
    </>
  );
}
