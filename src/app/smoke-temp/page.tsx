'use client';
import { useEffect, useState } from 'react';
import { classesQuantis } from '@/lib/quantis';
import { colorirGridPorQuantis, colorirGridComLegenda } from '@/lib/raster';
import { resumoValores, separacaoEntreZonas } from '@/lib/validacao/estatistica';
import { legendaDaCultura, f32ParaB64 } from '@/lib/produtividade';
import { corCheiaDaClasse } from '@/lib/legendas';
import { classeZona, classeReconhecida } from '@/lib/zonas';
import { gerarRelatorioProdutividade } from '@/lib/relatorioProdutividade';

export default function Smoke() {
  const [log, setLog] = useState<string[]>([]);
  useEffect(() => {
    const out: string[] = [];
    (async () => {
      const rows = 60, cols = 90;
      const vals = new Float32Array(rows * cols);
      let seed = 9; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
        vals[r * cols + c] = (r < 2 || c < 2 || r > rows - 3 || c > cols - 3) ? NaN : 3200 + c * 34 + rnd() * 700;
      const bounds: [number, number, number, number] = [-50.2, -25.1, -50.14, -25.06];
      const pixelM = 10;
      const grid = { b64: f32ParaB64(vals), shape: [rows, cols] as [number, number] };
      const leg = legendaDaCultura('soja')!;
      const q = classesQuantis(vals, { k: 5, pixelM, cores: leg.classes.map(corCheiaDaClasse), nomes: leg.classes.map(c => c.nome) })!;
      const resumo = resumoValores(vals)!;
      const { amostrarPorZona } = await import('@/lib/validacao/amostragem');
      const [w, s, e, n2] = bounds;
      const poligono: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n2], [w, n2], [w, s]]] };

      // 5 faixas verticais. A produtividade CRESCE de oeste para leste, mas as
      // classes foram atribuidas ao contrario de proposito nas duas primeiras:
      // e esse desacordo que a pagina tem de revelar.
      const K = 5;
      const CLASSES = ['Alta', 'Média-alta', 'Média', 'Média-baixa', 'Baixa'];
      const faixa = (i: number): GeoJSON.Polygon => {
        const x0 = w + ((e - w) * i) / K, x1 = w + ((e - w) * (i + 1)) / K;
        return { type: 'Polygon', coordinates: [[[x0, s], [x1, s], [x1, n2], [x0, n2], [x0, s]]] };
      };
      const zg = Array.from({ length: K }, (_, i) => ({ idZona: String(i + 1).padStart(2, '0'), geometry: faixa(i) as GeoJSON.Geometry }));
      const porZona = amostrarPorZona(zg, grid, bounds);
      const zonas = zg.map((z, i) => ({
        id: z.idZona, classe: CLASSES[i],
        classeLabel: classeZona(CLASSES[i]).label,
        classeConhecida: classeReconhecida(CLASSES[i]),
        cor: classeZona(CLASSES[i]).cor,
        geometry: faixa(i) as GeoJSON.Polygon,
        stats: resumoValores(porZona.get(z.idZona) ?? []), areaHa: 13.3,
      }));
      zonas.forEach(z => out.push(`OK  Zona ${z.id} classificada "${z.classeLabel}" → media ${Math.round(z.stats!.media)} kg/ha`));
      const sep = separacaoEntreZonas(zonas.map(z => ({ id: z.id, valores: porZona.get(z.id) ?? [] })));

      const d = {
        fazenda: 'Campina da Raia', produtor: 'Agropecuaria Aardoom', talhao: 'JCACR 02', safra: '2025/2026',
        cultura: 'soja', areaHa: 66.36, municipio: 'Carambei', estado: 'PR', siglaFazenda: 'CR',
        ano: null, epoca: null, dataReferencia: '2026-03-14', dataPlantio: null, logoClienteUrl: null,
        poligono, satelite: false, corLimite: '#ffffff',
        unidade: 'kg/ha' as const, bounds, pixelM, legenda: leg,
        rasterAbsolutoPng: colorirGridComLegenda(grid, leg).dataUrl,
        rasterQuantilPng: colorirGridPorQuantis(grid, q.breaks, q.faixas.map(f => f.cor)).dataUrl,
        quantis: q,
        stats: { nUsados: 35034, areaHa: q.areaHa, producaoTotalKg: Math.round(q.faixas.reduce((a, f) => a + f.somaKg, 0)), mediaKgha: Math.round(resumo.media), minKgha: Math.round(resumo.min), maxKgha: Math.round(resumo.max), cv: resumo.cv ?? 0, histograma: [] },
        resumo,
        limpeza: { n_bruto: 162083, n_apos_filtro_bruto: 158000, mapfilter_global_removidos: 82000, mapfilter_local_removidos: 41000, n_usados: 35034, media_calculada: resumo.media, fator_media_real: 1.012, correcao_colhedora_global: { maquinas_corrigidas: 2 } },
        cleaningSalvo: null, nPontosSalvo: null, versao: 1, nMaquinas: 2, mediaRealKgha: 4787,
        cobertura: { pctCobertura: 99.8, areaSemDadoHa: 0.22, maiorVazioHa: 0.1, raioM: 15, recortado: true },
        sobreposicaoNdvi: null, separacaoZonas: sep, zonas, correlacao: null, ndvi: null,
        rentabilidades: [], exportacoes: [],
      };
      const wo = window.open;
      (window as unknown as { open: () => null }).open = () => null;
      const blob = await gerarRelatorioProdutividade(d as never);
      window.open = wo;
      out.push(`OK  PDF ${(blob.size / 1024).toFixed(0)} KB`);
      await fetch('/api/smoke-pdf', { method: 'POST', body: new Uint8Array(await blob.arrayBuffer()) });
      setLog(out);
    })().catch(e => setLog([...out, 'ERRO ' + (e instanceof Error ? e.stack ?? e.message : String(e))]));
  }, []);
  return <pre style={{ padding: 16, fontSize: 11, whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace,monospace', background: '#fff', color: '#111' }}>{log.length ? log.join('\n') : 'rodando…'}</pre>;
}
