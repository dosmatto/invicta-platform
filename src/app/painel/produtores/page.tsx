import { Header } from '@/components/layout/Header';
import { MockIndicator } from '@/components/shared/MockIndicator';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { MOCK_PRODUTORES } from '@/constants/mocks';
import { Plus, Search } from 'lucide-react';

export default function ProdutoresPage() {
  return (
    <>
      <Header title="Produtores" breadcrumb={['Painel Invicta', 'Produtores']} />
      <div className="flex-1 p-6">
        <div className="rounded-xl border overflow-hidden"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>

          {/* Toolbar */}
          <div className="flex items-center justify-between p-4 border-b gap-3"
            style={{ borderColor: 'var(--border-color)' }}>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Todos os Produtores
              </h2>
              <MockIndicator />
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm"
                style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
                <Search size={14} />
                <span>Buscar produtor...</span>
              </div>
              <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-white"
                style={{ background: 'var(--invicta-blue)' }}>
                <Plus size={14} /> Novo Produtor
              </button>
            </div>
          </div>

          {/* Table */}
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--bg-app)' }}>
                {['Nome', 'CPF / CNPJ', 'Cidade', 'Estado', 'Fazendas', 'Status', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold"
                    style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOCK_PRODUTORES.map((p, i) => (
                <tr key={p.id}
                  className="border-t"
                  style={{ borderColor: 'var(--border-color)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-app)' }}>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{p.nome}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{p.documento}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{p.cidade}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{p.estado}</td>
                  <td className="px-4 py-3 text-center" style={{ color: 'var(--text-secondary)' }}>{p.fazendas}</td>
                  <td className="px-4 py-3"><StatusBadge status={p.status as 'ativo'} /></td>
                  <td className="px-4 py-3">
                    <a href={`/painel/produtores/${p.id}`} className="text-xs font-medium"
                      style={{ color: 'var(--invicta-blue-mid)' }}>Ver detalhes</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
