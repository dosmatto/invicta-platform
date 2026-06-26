'use client';

// Adoção das zonas já importadas (talhao.zonasGeojson) como Ambiente Produtivo
// do MEAP — Fase M1. Cria/atualiza UMA versão (v1) com o CV por zona calculado
// dos dados de laboratório casados à grade. Idempotente por `fonteHash`: só
// recalcula quando as zonas ou a importação de origem mudam.

import { getTalhoes, getImportacoesLab, getGrades, getAmbienteMeap, saveAmbienteMeap } from '@/lib/store';
import { classeZona } from '@/lib/zonas';
import { calcularCVZonas } from './cv';
import type { AmbienteProdutivo, VersaoMeap, ZonaMeap, MetricasZonaMeap } from './tipos';

interface ZonaGeo { id: string; classe: string; areaHa: number; geometry: GeoJSON.Geometry; }

function lerZonas(zonasGeojson: string): ZonaGeo[] {
  try {
    const fc = JSON.parse(zonasGeojson) as GeoJSON.FeatureCollection;
    return fc.features
      .filter(f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'))
      .map(f => {
        const p = (f.properties ?? {}) as { id?: string; classe?: string; areaHa?: number };
        return { id: String(p.id ?? '?'), classe: String(p.classe ?? ''), areaHa: Number(p.areaHa ?? 0), geometry: f.geometry! };
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  } catch { return []; }
}

// Hash estável (djb2) da fonte — muda quando as zonas ou o lab de origem mudam.
function hashFonte(...partes: string[]): string {
  let h = 5381;
  const s = partes.join('|');
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// Obtém o ambiente do talhão, adotando/atualizando a v1 se necessário.
// Retorna null quando o talhão não tem zonas de manejo importadas.
export function obterOuAdotarAmbiente(talhaoId: string): AmbienteProdutivo | null {
  const talhao = getTalhoes().find(t => t.id === talhaoId);
  if (!talhao?.zonasGeojson) return null;
  const zonas = lerZonas(talhao.zonasGeojson);
  if (zonas.length === 0) return null;

  // Lab mais recente do talhão + a grade a que ele está casado (numero → coord).
  const imp = getImportacoesLab(talhaoId)[0] ?? null;
  const grade = imp ? getGrades(talhaoId).find(g => g.id === imp.gradeId) ?? null : null;

  const fonte = hashFonte(talhao.zonasGeojson, imp?.id ?? '', grade?.id ?? '');
  const existente = getAmbienteMeap(talhaoId);
  if (existente && existente.fonteHash === fonte) return existente; // nada mudou

  const pontos = (grade?.pontos ?? []).map(p => ({ numero: p.numero ?? p.ordem + 1, lng: p.lng, lat: p.lat }));
  const cv = calcularCVZonas({
    zonas: zonas.map(z => ({ id: z.id, geometry: z.geometry })),
    pontos,
    resultados: imp?.resultados ?? [],
  });

  const areaTotal = zonas.reduce((s, z) => s + z.areaHa, 0) || 1;
  const zonasMeap: ZonaMeap[] = zonas.map(z => {
    const cz = classeZona(z.classe);
    const m: MetricasZonaMeap = cv.porZona[z.id] ?? {
      cvValidacao: null, variavelValidacao: cv.variavelValidacao, cvPorAtributo: {}, homogeneidade: null, nPontos: 0,
    };
    return { id: z.id, rotulo: `Zona ${z.id}`, classeLabel: cz.label, cor: cz.cor, areaHa: z.areaHa, percTalhao: z.areaHa / areaTotal, metricas: m };
  });

  // CV médio intra-zona ponderado por área (só zonas com CV calculado).
  const comCv = zonasMeap.filter(z => z.metricas.cvValidacao != null);
  const areaCv = comCv.reduce((s, z) => s + z.areaHa, 0);
  const cvMedio = areaCv > 0
    ? Math.round((comCv.reduce((s, z) => s + z.metricas.cvValidacao! * z.areaHa, 0) / areaCv) * 10) / 10
    : null;

  const agora = new Date().toISOString();
  const versao: VersaoMeap = {
    numero: 1, dataReferencia: agora, origem: 'adocao-zonas-importadas', zonas: zonasMeap,
    convergencia: null, cvMedioIntraZona: cvMedio, variavelValidacao: cv.variavelValidacao,
  };
  const amb: AmbienteProdutivo = {
    id: talhaoId, talhaoId, estado: 'em-formacao', versaoVigente: 1, versoes: [versao],
    fonteHash: fonte, criadoEm: existente?.criadoEm ?? agora, atualizadoEm: agora,
  };
  saveAmbienteMeap(amb);
  return amb;
}
