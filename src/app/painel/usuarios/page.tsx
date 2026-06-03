import { Header } from '@/components/layout/Header';
import { MockIndicator } from '@/components/shared/MockIndicator';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Plus, Search, Shield } from 'lucide-react';

const MOCK_USUARIOS = [
  { id: '1', nome: 'Carlos Técnico', email: 'carlos@invicta.com.br', perfil: 'Equipe Técnica', status: 'ativo', ultimo_acesso: '03/06/2026' },
  { id: '2', nome: 'Ana Operadora', email: 'ana@invicta.com.br', perfil: 'Operador de Campo', status: 'ativo', ultimo_acesso: '02/06/2026' },
  { id: '3', nome: 'João Silva', email: 'joao@email.com', perfil: 'Produtor', status: 'ativo', ultimo_acesso: '01/06/2026' },
  { id: '4', nome: 'Pedro Alves', email: 'pedro@email.com', perfil: 'Produtor', status: 'inativo', ultimo_acesso: '15/04/2026' },
  { id: '5', nome: 'Admin Invicta', email: 'admin@invicta.com.br', perfil: 'Administrador', status: 'ativo', ultimo_acesso: '03/06/2026' },
];

const PERFIL_COLORS: Record<string, { bg: string; color: string }> = {
  'Administrador':    { bg: '#ede9fe', color: '#7c3aed' },
  'Equipe Técnica':   { bg: '#dbeafe', color: '#1d4ed8' },
  'Operador de Campo':{ bg: '#fef3c7', color: '#d97706' },
  'Produtor':         { bg: '#dcfce7', color: '#16a34a' },
  'Visitante':        { bg: '#f1f5f9', color: '#64748b' },
};

export default function UsuariosPage() {
  return (
    <>
      <Header title="Usuários e Permissões" breadcrumb={['Painel Invicta', 'Usuários']} />
      <div className="flex-1 p-6 space-y-5">

        {/* Cards de perfis */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {Object.entries(PERFIL_COLORS).map(([perfil, style]) => {
            const count = MOCK_USUARIOS.filter(u => u.perfil === perfil).length;
            return (
              <div key={perfil} className="rounded-xl border p-3 text-center"
                style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center mx-auto mb-2"
                  style={{ background: style.bg }}>
                  <Shield size={16} style={{ color: style.color }} />
                </div>
                <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{count}</p>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{perfil}</p>
              </div>
            );
          })}
        </div>

        {/* Tabela */}
        <div className="rounded-xl border overflow-hidden"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
          <div className="flex items-center justify-between p-4 border-b gap-3"
            style={{ borderColor: 'var(--border-color)' }}>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Todos os Usuários</h2>
              <MockIndicator />
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm"
                style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
                <Search size={14} /><span>Buscar usuário...</span>
              </div>
              <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-white"
                style={{ background: 'var(--invicta-blue)' }}>
                <Plus size={14} /> Novo Usuário
              </button>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--bg-app)' }}>
                {['Nome', 'E-mail', 'Perfil', 'Último Acesso', 'Status', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOCK_USUARIOS.map((u, i) => {
                const pStyle = PERFIL_COLORS[u.perfil] ?? PERFIL_COLORS['Visitante'];
                return (
                  <tr key={u.id} className="border-t"
                    style={{ borderColor: 'var(--border-color)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-app)' }}>
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
                          style={{ background: 'var(--invicta-blue)' }}>
                          {u.nome.charAt(0)}
                        </div>
                        {u.nome}
                      </div>
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{u.email}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ background: pStyle.bg, color: pStyle.color }}>
                        {u.perfil}
                      </span>
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{u.ultimo_acesso}</td>
                    <td className="px-4 py-3"><StatusBadge status={u.status as 'ativo' | 'inativo'} /></td>
                    <td className="px-4 py-3">
                      <button className="text-xs font-medium" style={{ color: 'var(--invicta-blue-mid)' }}>Editar</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
