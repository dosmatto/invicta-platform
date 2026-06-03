'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, Building2, Map, CalendarDays,
  FlaskConical, Grid3x3, QrCode, TestTube, Leaf, Satellite,
  Zap, BarChart3, Layers, FileSpreadsheet, ClipboardList,
  DollarSign, FileText, Globe, Settings, ChevronRight,
} from 'lucide-react';

const menu = [
  {
    section: 'PRINCIPAL',
    items: [
      { label: 'Dashboard', href: '/painel', icon: LayoutDashboard },
    ],
  },
  {
    section: 'CADASTROS',
    items: [
      { label: 'Produtores', href: '/painel/produtores', icon: Users },
      { label: 'Fazendas', href: '/painel/fazendas', icon: Building2 },
      { label: 'Talhões', href: '/painel/talhoes', icon: Map },
      { label: 'Safras e Culturas', href: '/painel/safras', icon: CalendarDays },
    ],
  },
  {
    section: 'BASE AGRONÔMICA',
    items: [
      { label: 'Base Agronômica', href: '/painel/base-agronomica', icon: FlaskConical },
      { label: 'Legendas Regionais', href: '/painel/legendas', icon: Grid3x3 },
    ],
  },
  {
    section: 'AMOSTRAGEM',
    items: [
      { label: 'Amostragem', href: '/painel/amostragem', icon: Grid3x3 },
      { label: 'QR Code e Etiquetas', href: '/painel/qrcode', icon: QrCode },
      { label: 'Laboratórios', href: '/painel/laboratorios', icon: TestTube },
    ],
  },
  {
    section: 'ANÁLISE',
    items: [
      { label: 'Fertilidade', href: '/painel/fertilidade', icon: Leaf },
      { label: 'NDVI', href: '/painel/ndvi', icon: Satellite },
      { label: 'Condutividade Elétrica', href: '/painel/condutividade', icon: Zap },
      { label: 'Produtividade', href: '/painel/produtividade', icon: BarChart3 },
    ],
  },
  {
    section: 'DECISÃO',
    items: [
      { label: 'Zonas de Manejo', href: '/painel/zonas-manejo', icon: Layers },
      { label: 'Mapas de Aplicação', href: '/painel/mapas-aplicacao', icon: FileSpreadsheet },
    ],
  },
  {
    section: 'OPERACIONAL',
    items: [
      { label: 'Operações', href: '/painel/operacoes', icon: ClipboardList },
      { label: 'Custos', href: '/painel/custos', icon: DollarSign },
    ],
  },
  {
    section: 'SAÍDA',
    items: [
      { label: 'Relatórios', href: '/painel/relatorios', icon: FileText },
      { label: 'Portal do Produtor', href: '/portal', icon: Globe },
    ],
  },
  {
    section: 'SISTEMA',
    items: [
      { label: 'Configurações', href: '/painel/configuracoes', icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="fixed top-0 left-0 h-screen flex flex-col z-40 overflow-y-auto"
      style={{
        width: 'var(--sidebar-width)',
        background: 'var(--sidebar-bg)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b" style={{ borderColor: '#1a3a6b' }}>
        <Image src="/images/logo-branca.png" alt="Invicta" width={130} height={40} style={{ objectFit: 'contain' }} />
      </div>

      {/* Menu */}
      <nav className="flex-1 py-4 px-3">
        {menu.map((group) => (
          <div key={group.section} className="mb-4">
            <p className="px-3 mb-1 text-[10px] font-semibold tracking-wider"
              style={{ color: 'var(--sidebar-section)' }}>
              {group.section}
            </p>
            {group.items.map((item) => {
              const active = pathname === item.href || (item.href !== '/painel' && pathname.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 px-3 py-2 rounded-md mb-0.5 text-sm transition-colors group"
                  style={{
                    color: active ? 'var(--sidebar-text-active)' : 'var(--sidebar-text)',
                    background: active ? 'var(--sidebar-item-active)' : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-item-hover)';
                  }}
                  onMouseLeave={(e) => {
                    if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }}
                >
                  <Icon size={16} />
                  <span className="flex-1">{item.label}</span>
                  {active && <ChevronRight size={14} />}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-3 border-t text-xs" style={{ borderColor: '#1a3a6b', color: 'var(--sidebar-section)' }}>
        v0.1 — Invicta Platform
      </div>
    </aside>
  );
}
