import { PanelSection, PanelRow, PanelButton } from './_shared';
import { Plus } from 'lucide-react';
const USUARIOS = [
  { nome: 'Admin Invicta', perfil: 'Administrador', status: 'Ativo' },
  { nome: 'Carlos Técnico', perfil: 'Equipe Técnica', status: 'Ativo' },
  { nome: 'Ana Operadora', perfil: 'Operador', status: 'Ativo' },
  { nome: 'João Silva', perfil: 'Produtor', status: 'Ativo' },
  { nome: 'Pedro Alves', perfil: 'Produtor', status: 'Inativo' },
];
export function UsuariosPanel() {
  return (
    <div className="h-full overflow-y-auto">
      <PanelSection>
        <PanelButton label="Novo Usuário" icon={<Plus size={12} />} color="var(--invicta-blue-mid)" />
      </PanelSection>
      <PanelSection title="Usuários do Sistema">
        {USUARIOS.map((u, i) => (
          <PanelRow key={i} label={u.nome} sub={u.perfil}
            badge={<span className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: u.status === 'Ativo' ? '#166534' : '#374151', color: '#fff' }}>
              {u.status}
            </span>}
          />
        ))}
      </PanelSection>
    </div>
  );
}
