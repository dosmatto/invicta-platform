import { Header } from '@/components/layout/Header';
import { MockIndicator } from '@/components/shared/MockIndicator';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Plus, Search, MapPin } from 'lucide-react';

const MOCK_FAZENDAS = [
  { id: '1', nome: 'Fazenda São João', produtor: 'João Silva', municipio: 'Sorriso', estado: 'MT', area_ha: 285.3, talhoes: 3, status: 'ativo' },
  { id: '2', nome: 'Fazenda Boa Vista', produtor: 'João Silva', municipio: 'Lucas do Rio Verde', estado: 'MT', area_ha: 120.0, talhoes: 2, status: 'ativo' },
  { id: '3', nome: 'Fazenda Santa Rita', produtor: 'Pedro Alves', municipio: 'Sorriso', estado: 'MT', area_ha: 430.8, talhoes: 4, status: 'ativo' },
  { id: '4', nome: 'Fazenda Esperança', produtor: 'Maria Oliveira', municipio: 'Campo Novo do Parecis', estado: 'MT', area_ha: 98.5, talhoes: 1, status: 'ativo' },
  { id: '5', nome: 'Fazenda Nova Era', produtor: 'Carlos Mendes', municipio: 'Primavera do Leste', estado: 'MT', area_ha: 640.0, talhoes: 5, status: 'ativo' },
];

export default function FazendasPage() {
  return (
    <>
      <Header title="Fazendas" breadcrumb={['Painel Invicta', 'Fazendas']} />
      <div className="flex-1 p-6 space-y-5">

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total de Fazendas', value: MOCK_FAZENDAS.length, color: 'var(--invicta-blue)' },
            { label: 'Área Total (ha)', value: MOCK_FAZENDAS.reduce((s, f) => s + f.area_ha, 0).toLocaleString('pt-BR'), color: 'var(--invicta-green)' },
            { label: 'Total de Talhões', value: MOCK_FAZENDAS.reduce((s, f) => s + f.talhoes, 0), color: 'var(--invicta-blue-mid)' },
          ].map(k => (
            <div key={k.label} className="rounded-xl border p-4 flex items-center gap-4"
              style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
              <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ background: k.color + '18' }}>
                <MapPin size={20} style={{ color: k.color }} />
              </div>
              <div>
                <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{k.value}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{k.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Tabela */}
        <div className="rounded-xl border overflow-hidden"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-color)' }}>
          <div className="flex items-center justify-between p-4 border-b gap-3"
            style={{ borderColor: 'var(--border-color)' }}>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Todas as Fazendas</h2>
              <MockIndicator />
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm"
                style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
                <Search size={14} /><span>Buscar fazenda...</span>
              </div>
              <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-white"
                style={{ background: 'var(--invicta-blue)' }}>
                <Plus size={14} /> Nova Fazenda
              </button>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--bg-app)' }}>
                {['Nome', 'Produtor', 'Município', 'UF', 'Área (ha)', 'Talhões', 'Status', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOCK_FAZENDAS.map((f, i) => (
                <tr key={f.id} className="border-t"
                  style={{ borderColor: 'var(--border-color)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-app)' }}>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{f.nome}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{f.produtor}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{f.municipio}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{f.estado}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{f.area_ha.toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3 text-center" style={{ color: 'var(--text-secondary)' }}>{f.talhoes}</td>
                  <td className="px-4 py-3"><StatusBadge status={f.status as 'ativo'} /></td>
                  <td className="px-4 py-3">
                    <a href={`/painel/fazendas/${f.id}`} className="text-xs font-medium" style={{ color: 'var(--invicta-blue-mid)' }}>Ver detalhes</a>
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
