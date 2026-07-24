'use client';

// Botão "Exportar" da aba Zonas de Manejo: escolhe um MAPA PRONTO (zoneamento
// salvo) e exporta em Shapefile (SHP), KML ou Relatório PDF. Fonte única de
// dados (montarDadosZonas) → áreas/zonas iguais nos 3 formatos. Desabilita o
// botão durante a geração, mostra progresso, evita duplicatas e permite tentar
// de novo em caso de erro.

import { useMemo, useRef, useState } from 'react';
import { getFazendas, getClientes, type Talhao, type ZoneamentoMeap } from '@/lib/store';
import { extrairPoligono } from '@/lib/fertilidade';
import { rotuloAno } from '@/lib/periodo';
import { usuarioAtual } from '@/lib/auth';
import { pode } from '@/lib/empresa';
import {
  montarDadosZonas, validarParaExport, registrarAuditoriaExport,
  exportarSHPArquivo, exportarKMLArquivo, type IdentEntrada,
} from '@/lib/exportZonas';
import { gerarRelatorioZonas } from '@/lib/relatorioZonas';
import { FileDown, Loader2, FileText, Map as MapIcon, Layers, AlertTriangle } from 'lucide-react';

type Formato = 'shp' | 'kml' | 'pdf';

export function ExportarZonas({ talhao, zoneamentos, safraNome }: {
  talhao: Talhao; zoneamentos: ZoneamentoMeap[]; safraNome?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [mapaId, setMapaId] = useState<string>('');
  const [gerando, setGerando] = useState<Formato | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const emVoo = useRef(false);   // trava anti-duplicata (clique duplo)

  // Só mapas PRONTOS (com geometria válida de zonas).
  const prontos = useMemo(
    () => zoneamentos.filter(z => validarParaExport(z.fc) === null),
    [zoneamentos],
  );
  const selecionado = useMemo(
    () => prontos.find(z => z.id === mapaId) ?? prontos.find(z => z.padrao) ?? prontos[0] ?? null,
    [prontos, mapaId],
  );

  if (!pode('relatorios')) return null;      // gate de permissão (gerar relatórios)
  if (prontos.length === 0) return null;     // nada pronto para exportar

  function montarDados(z: ZoneamentoMeap) {
    const fazenda = getFazendas().find(f => f.id === talhao.fazendaId) ?? null;
    const cliente = fazenda ? getClientes().find(c => c.id === fazenda.clienteId) ?? null : null;
    let externo: GeoJSON.Polygon | GeoJSON.MultiPolygon | null = null;
    try { externo = talhao.geojson ? extrairPoligono(JSON.parse(talhao.geojson)) : null; } catch { externo = null; }
    const ident: IdentEntrada = {
      idMapa: z.id, nomeMapa: z.nome,
      produtor: cliente?.nome ?? '', fazenda: fazenda?.nome ?? '', talhao: talhao.nome,
      municipio: fazenda?.municipio ?? '', estado: fazenda?.estado ?? '',
      ano: rotuloAno(safraNome), responsavel: usuarioAtual()?.email ?? '',
      dataMapa: z.criadoEm, externo,
    };
    return montarDadosZonas(z.fc, ident);
  }

  async function exportar(fmt: Formato) {
    if (emVoo.current || !selecionado) return;      // anti-duplicata
    const inval = validarParaExport(selecionado.fc);
    if (inval) { setErro(inval); return; }
    emVoo.current = true; setGerando(fmt); setErro(null);
    try {
      const dados = montarDados(selecionado);
      if (fmt === 'shp') await exportarSHPArquivo(dados);
      else if (fmt === 'kml') exportarKMLArquivo(dados);
      else await gerarRelatorioZonas(dados, { satelite: true });
      registrarAuditoriaExport({
        formato: fmt, produtor: dados.produtor, fazenda: dados.fazenda,
        talhao: dados.talhao, mapa: dados.nomeMapa, usuario: usuarioAtual()?.email ?? '',
      });
      setAberto(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao gerar o arquivo. Tente de novo.');
    } finally {
      emVoo.current = false; setGerando(null);
    }
  }

  const btn = 'flex items-center gap-2 w-full px-3 py-2 text-[12px] text-left rounded hover:bg-[#12305f] disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setAberto(a => !a)}
        disabled={gerando !== null}
        className="flex items-center gap-1.5 rounded px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-60"
        style={{ background: 'var(--invicta-green-dark)' }}
      >
        {gerando ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
        {gerando ? 'Gerando…' : 'Exportar'}
      </button>

      {aberto && gerando === null && (
        <div className="absolute right-0 z-30 mt-1 w-72 rounded-lg border p-2 shadow-xl"
          style={{ background: '#0f2547', borderColor: '#1e3a6b' }}>
          <div className="px-1 pb-1 text-[11px] font-semibold text-slate-300">Mapa pronto</div>
          <select
            value={selecionado?.id ?? ''}
            onChange={e => setMapaId(e.target.value)}
            className="mb-2 w-full rounded px-2 py-1 text-[12px] outline-none"
            style={{ background: '#0b1e3d', color: '#e2e8f0', border: '1px solid #1e3a6b' }}
          >
            {prontos.map(z => (
              <option key={z.id} value={z.id}>{z.nome}{z.padrao ? ' (oficial)' : ''}</option>
            ))}
          </select>
          <button className={btn} style={{ color: '#e2e8f0' }} onClick={() => exportar('shp')} disabled={gerando !== null}>
            <Layers size={14} /> Shapefile — SHP <span className="ml-auto text-[10px] text-slate-400">.zip (2 camadas)</span>
          </button>
          <button className={btn} style={{ color: '#e2e8f0' }} onClick={() => exportar('kml')} disabled={gerando !== null}>
            <MapIcon size={14} /> KML <span className="ml-auto text-[10px] text-slate-400">.kml</span>
          </button>
          <button className={btn} style={{ color: '#e2e8f0' }} onClick={() => exportar('pdf')} disabled={gerando !== null}>
            <FileText size={14} /> Relatório PDF <span className="ml-auto text-[10px] text-slate-400">.pdf</span>
          </button>
          {erro && (
            <div className="mt-1 flex items-start gap-1 px-1 text-[11px] text-amber-300">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" /> <span>{erro} <button className="underline" onClick={() => setErro(null)}>ok</button></span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
