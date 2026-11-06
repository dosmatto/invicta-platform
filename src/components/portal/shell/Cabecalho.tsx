'use client';

// Cabeçalho do portal: faixa com o gradiente da marca e uma textura sutil de
// LINHAS DE PLANTIO (SVG), título e subtítulo da página, filtros Safra ·
// Cultura · Fazenda · Talhão, alternador dos mini-mapas (leve × real), tema,
// "Acessar a plataforma" e quem está logado. No preview (owner/admin), a faixa
// "Você está vendo como X" fica acima.

import { usePathname, useRouter } from 'next/navigation';
import {
  Menu, CalendarRange, Wheat, Warehouse, Grid3x3, Map as MapaIcone, Layers, Image as ImagemIcone,
  Sun, Moon, MonitorSmartphone, LogOut, ArrowLeft, Eye, Loader2, ExternalLink, X, Users, Scale,
} from 'lucide-react';
import { UNIDADES_PROD, normalizarUnidadeProd } from '@/lib/portalUnidade';
import { logout, emailUsuario } from '@/lib/auth';
import { ROTULO_PAPEL } from '@/lib/empresa';
import { fmtHa } from '@/lib/formato';
import { usePortal } from '../PortalContext';
import { Seletor } from '../ui/Seletor';
import { nomeLegivel } from '../ui/formato';
import { itemDaRota } from './menu';
import { useTemaPortal, type EscolhaTema } from './tema';

function TexturaLinhas() {
  // Linhas de plantio em curva de nível, bem apagadas, à direita da faixa.
  const linhas = Array.from({ length: 22 }, (_, i) => i);
  return (
    <svg aria-hidden className="absolute inset-y-0 right-0 h-full w-[70%] pointer-events-none" viewBox="0 0 700 240" preserveAspectRatio="xMaxYMid slice" style={{ opacity: 0.16 }}>
      <defs>
        <linearGradient id="portal-hero-fade" x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="1" />
        </linearGradient>
        <mask id="portal-hero-mask"><rect width="700" height="240" fill="url(#portal-hero-fade)" /></mask>
      </defs>
      <g mask="url(#portal-hero-mask)" fill="none" stroke="#bff0bf" strokeWidth="1.4">
        {linhas.map(i => (
          <path key={i} d={`M ${-40 + i * 34} 260 C ${80 + i * 34} 170, ${120 + i * 30} 90, ${330 + i * 26} -20`} />
        ))}
      </g>
    </svg>
  );
}

function AlternadorModo() {
  const p = usePortal();
  const opcoes = [
    { id: 'leve' as const, rotulo: 'Visão leve', Icone: Layers, titulo: 'Talhões coloridos pela classe/média — rápido' },
    { id: 'real' as const, rotulo: 'Mapas reais', Icone: ImagemIcone, titulo: p.comNuvem ? 'Os mapas processados de cada talhão, carregados sob demanda' : 'Os mapas reais ficam na nuvem — indisponível nesta bancada' },
  ];
  return (
    <div className="inline-flex items-center rounded-xl p-0.5" role="group" aria-label="Tipo de mapa" style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}>
      {opcoes.map(o => {
        const on = p.modoMapa === o.id;
        return (
          <button key={o.id} type="button" onClick={() => p.setModoMapa(o.id)} title={o.titulo} aria-pressed={on}
            className="h-9 px-2.5 sm:px-3 rounded-[10px] inline-flex items-center gap-1.5 text-xs font-bold whitespace-nowrap transition-colors"
            style={on ? { background: '#fff', color: 'var(--invicta-blue)' } : { color: 'rgba(255,255,255,0.85)' }}>
            <o.Icone size={14} /><span className="hidden sm:inline">{o.rotulo}</span>
          </button>
        );
      })}
    </div>
  );
}

function AlternadorTema() {
  const { escolha, setEscolha } = useTemaPortal();
  const ordem: EscolhaTema[] = ['sistema', 'claro', 'escuro'];
  const prox = ordem[(ordem.indexOf(escolha) + 1) % ordem.length];
  const Icone = escolha === 'claro' ? Sun : escolha === 'escuro' ? Moon : MonitorSmartphone;
  const rotulo = { sistema: 'Tema do sistema', claro: 'Tema claro', escuro: 'Tema escuro' }[escolha];
  return (
    <button type="button" onClick={() => setEscolha(prox)} title={`${rotulo} — clique para trocar`} aria-label={rotulo}
      className="h-10 w-10 rounded-xl inline-flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff' }}>
      <Icone size={17} />
    </button>
  );
}

export function FaixaPreview() {
  const p = usePortal();
  const router = useRouter();
  const pathname = usePathname();
  if (!p.preview) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 sm:px-6 py-2 text-[13px]" style={{ background: 'var(--status-info-bg)', color: 'var(--status-info)', borderBottom: '1px solid color-mix(in srgb, var(--status-info) 25%, transparent)' }}>
      <Eye size={15} className="flex-shrink-0" />
      <span className="min-w-0 flex-1">
        Você está vendo o portal como <strong className="capitalize">{nomeLegivel(p.cliente.nome)}</strong> veria{p.plano ? `, no plano ${p.plano.nome}` : ', com todas as seções liberadas'}. Somente leitura.
      </span>
      <button type="button" onClick={() => router.replace(pathname)} className="inline-flex items-center gap-1 font-bold underline-offset-2 hover:underline"><Users size={13} /> Trocar produtor</button>
    </div>
  );
}

export function Cabecalho({ onAbrirMenu }: { onAbrirMenu: () => void }) {
  const p = usePortal();
  const router = useRouter();
  const pathname = usePathname();
  const item = itemDaRota(pathname);
  const visao = item.rota === '/portal';
  const titulo = visao && p.talhao ? `Painel do talhão ${p.talhao.nome}` : item.titulo;
  const subtitulo = p.talhao
    ? `${p.talhao.nome} · ${fmtHa(p.talhao.areaHa)} ha${p.fazendas.length > 1 ? ` · ${nomeLegivel(p.fazendas.find(f => f.id === p.talhao!.fazendaId)?.nome ?? '')}` : ''} — ${item.subtitulo.charAt(0).toLowerCase()}${item.subtitulo.slice(1)}`
    : item.subtitulo;
  const abaTalhao = item.aba ?? 'resumo';

  return (
    <header className="relative overflow-hidden" style={{ background: 'linear-gradient(120deg, var(--p-hero-a) 0%, var(--p-hero-b) 55%, var(--p-hero-c) 100%)', color: '#fff' }}>
      <TexturaLinhas />
      <div className="relative px-4 sm:px-6 lg:px-8 pt-4 pb-4 sm:pb-5">
        <div className="flex flex-wrap items-start gap-x-3 gap-y-3">
          <button type="button" onClick={onAbrirMenu} aria-label="Abrir menu" className="lg:hidden -ml-1 mt-0.5 p-2 rounded-lg flex-shrink-0" style={{ background: 'rgba(255,255,255,0.1)' }}>
            <Menu size={20} />
          </button>
          <div className="min-w-0 basis-[260px] flex-1">
            <h1 className="text-xl sm:text-2xl lg:text-[28px] font-extrabold tracking-tight leading-tight">{titulo}</h1>
            <p className="text-[13px] sm:text-sm mt-1 leading-snug" style={{ color: 'rgba(232,239,248,0.82)' }}>{subtitulo}</p>
          </div>
          <div className="hidden md:flex items-center gap-2 flex-shrink-0 ml-auto">
            <AlternadorModo />
            <AlternadorTema />
            <button type="button" onClick={p.abrirPlataforma} title="Abrir a plataforma nas suas áreas (somente leitura)"
              className="h-10 px-4 rounded-xl inline-flex items-center gap-2 text-sm font-extrabold whitespace-nowrap"
              style={{ background: 'var(--invicta-green)', color: '#fff', boxShadow: '0 8px 20px -10px rgba(61,154,61,0.95)' }}>
              <MapaIcone size={16} /> Acessar a plataforma
            </button>
            {p.preview ? (
              <button type="button" onClick={() => router.push('/painel')} title="Voltar ao painel" className="h-10 px-3 rounded-xl inline-flex items-center gap-1 text-sm font-bold"
                style={{ background: '#fff', color: 'var(--invicta-blue)' }}>
                <ArrowLeft size={14} /> Painel
              </button>
            ) : (
              <div className="flex items-center gap-2 pl-1">
                <div className="text-right hidden xl:block leading-tight">
                  <p className="text-[13px] font-bold capitalize">{nomeLegivel(p.cliente.nome)}</p>
                  {/* Modo apresentação: o e-mail é do admin — não vai para a tela do produtor. */}
                  <p className="text-[11px]" style={{ color: 'rgba(232,239,248,0.7)' }}>{p.apresentacao ? '' : emailUsuario()}{p.papel ? `${p.apresentacao ? '' : ' · '}${ROTULO_PAPEL[p.papel]}` : ''}{p.plano ? ` · ${p.plano.nome}` : ''}</p>
                </div>
                {!p.apresentacao && (
                  <button type="button" onClick={() => logout()} title="Sair" aria-label="Sair" className="h-10 w-10 rounded-xl inline-flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}>
                    <LogOut size={16} />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Ações no celular (as do desktop ficam no canto). */}
        <div className="md:hidden flex items-center gap-2 mt-3">
          <AlternadorModo />
          <AlternadorTema />
          <button type="button" onClick={p.abrirPlataforma} className="h-10 px-3 rounded-xl inline-flex items-center gap-1.5 text-[13px] font-extrabold flex-1 justify-center" style={{ background: 'var(--invicta-green)', color: '#fff' }}>
            <MapaIcone size={15} /> Plataforma
          </button>
          {p.preview
            ? <button type="button" onClick={() => router.push('/painel')} aria-label="Voltar ao painel" className="h-10 w-10 rounded-xl inline-flex items-center justify-center" style={{ background: '#fff', color: 'var(--invicta-blue)' }}><ArrowLeft size={16} /></button>
            : p.apresentacao ? null : <button type="button" onClick={() => logout()} aria-label="Sair" className="h-10 w-10 rounded-xl inline-flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}><LogOut size={16} /></button>}
        </div>

        {/* Filtros */}
        <div className="mt-3 sm:mt-4 grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
          <Seletor variante="hero" rotulo="Safra" icone={CalendarRange} valor={p.safra} onChange={v => p.setFiltro({ safra: v })} opcoes={p.opcoesSafra} />
          <Seletor variante="hero" rotulo="Cultura" icone={Wheat} valor={p.cultura} onChange={v => p.setFiltro({ cultura: v })}
            opcoes={[{ valor: '', rotulo: p.culturas.length ? 'Todas' : 'Sem cultura no ano' }, ...p.culturas.map(c => ({ valor: c, rotulo: c }))]} desabilitado={!p.culturas.length} />
          <Seletor variante="hero" rotulo="Fazenda" icone={Warehouse} valor={p.fazendaId} onChange={v => p.setFiltro({ fazenda: v })}
            opcoes={[{ valor: '', rotulo: p.fazendas.length === 1 ? nomeLegivel(p.fazendas[0].nome) : 'Todas' }, ...(p.fazendas.length > 1 ? p.fazendas.map(f => ({ valor: f.id, rotulo: nomeLegivel(f.nome) })) : [])]}
            desabilitado={p.fazendas.length <= 1} />
          <Seletor variante="hero" rotulo="Talhão" icone={Grid3x3} valor={p.talhaoId} onChange={v => p.setFiltro({ talhao: v })} largura={280}
            opcoes={[{ valor: '', rotulo: `Todos os talhões (${p.talhoesEscopo.length})` }, ...p.talhoesEscopo.map(t => ({ valor: t.id, rotulo: t.nome }))]} />
          {/* Unidade da produtividade (padrão kg/ha; a escolha fica neste navegador, por produtor). */}
          {p.liberada('produtividade') && (
            <Seletor variante="hero" rotulo="Unidade" icone={Scale} valor={p.unidade} onChange={v => p.setUnidade(normalizarUnidadeProd(v))} largura={150}
              opcoes={UNIDADES_PROD.map(u => ({ valor: u, rotulo: u }))} />
          )}
          {p.talhao && (
            <span className="col-span-2 sm:col-auto inline-flex items-center gap-2">
              {!item.emBreve && (
                <button type="button" onClick={() => p.abrirTalhao(p.talhao!.id, abaTalhao)} className="h-11 px-3 rounded-xl inline-flex items-center gap-1.5 text-[13px] font-bold whitespace-nowrap"
                  style={{ background: '#fff', color: 'var(--invicta-blue)' }} title="Abrir a página completa deste talhão">
                  <ExternalLink size={14} /> Abrir na página do talhão
                </button>
              )}
              <button type="button" onClick={() => p.setFiltro({ talhao: '' })} className="h-11 px-3 rounded-xl inline-flex items-center gap-1 text-[13px] font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }} title="Voltar para todos os talhões">
                <X size={14} /> Todos
              </button>
            </span>
          )}
          {p.sincronizando && (
            <span className="col-span-2 sm:col-auto inline-flex items-center gap-1.5 text-xs px-1" style={{ color: 'rgba(232,239,248,0.8)' }}>
              <Loader2 size={13} className="animate-spin" /> sincronizando com a nuvem…
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
