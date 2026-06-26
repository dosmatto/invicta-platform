'use client';

// Card "Zonas de Manejo (MEAP)" na aba Resumo do talhão — Fase M1.
// Adota as zonas importadas e mostra, por zona, a homogeneidade interna (CV)
// calculada dos dados de laboratório. Convergência fica "—" até a 2ª versão
// (versionamento real é M3). Sem zonas importadas, o card não aparece.

import { useEffect, useMemo, useState } from 'react';
import type { Talhao } from '@/lib/store';
import { obterOuAdotarAmbiente } from '@/lib/meap/adocao';
import { simboloElemento } from '@/lib/lab';
import type { AmbienteProdutivo, Homogeneidade } from '@/lib/meap/tipos';
import { Layers } from 'lucide-react';

const HOMOG: Record<Homogeneidade, { label: string; cor: string; bg: string }> = {
  alta: { label: 'Homogênea', cor: '#86efac', bg: '#0f2a1a' },
  media: { label: 'Média', cor: '#fbbf24', bg: '#2d1a00' },
  baixa: { label: 'Heterogênea', cor: '#f87171', bg: '#2a0f12' },
};

const ESTADO: Record<AmbienteProdutivo['estado'], string> = {
  'em-formacao': 'Em formação',
  'em-consolidacao': 'Em consolidação',
  'consolidada': 'Consolidada',
};

export function MeapResumoCard({ talhao }: { talhao: Talhao; safraNome?: string }) {
  const [amb, setAmb] = useState<AmbienteProdutivo | null>(null);

  useEffect(() => {
    setAmb(obterOuAdotarAmbiente(talhao.id));
  }, [talhao.id, talhao.zonasGeojson]);

  const versao = useMemo(() => amb?.versoes.find(v => v.numero === amb.versaoVigente) ?? amb?.versoes[0] ?? null, [amb]);
  if (!amb || !versao) return null;

  const varSimbolo = versao.variavelValidacao ? simboloElemento(versao.variavelValidacao) : null;
  const temCV = versao.zonas.some(z => z.metricas.cvValidacao != null);

  return (
    <div className="p-3 rounded-lg" style={{ background: '#0a1929', border: '1px solid #1a3a6b' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Layers size={14} style={{ color: '#86efac' }} />
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#cbd5e1' }}>Zonas de Manejo (MEAP)</span>
        </div>
        <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: '#0b1f3a', color: '#93c5fd', border: '1px solid #1e3a8a' }}>
          {ESTADO[amb.estado]}
        </span>
      </div>

      {/* Linha de zonas */}
      <div className="space-y-1">
        {versao.zonas.map(z => {
          const h = z.metricas.homogeneidade ? HOMOG[z.metricas.homogeneidade] : null;
          return (
            <div key={z.id} className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
              <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0" style={{ background: z.cor, border: '1px solid #fff' }} />
              <span className="text-xs font-bold" style={{ color: '#e2e8f0', minWidth: '54px' }}>{z.rotulo}</span>
              <span className="text-[11px]" style={{ color: '#93c5fd' }}>{z.classeLabel}</span>
              <span className="text-[10px] ml-auto" style={{ color: '#64748b' }}>
                {z.areaHa.toLocaleString('pt-BR')} ha · {Math.round(z.percTalhao * 100)}%
              </span>
              {h && z.metricas.cvValidacao != null ? (
                <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0" style={{ background: h.bg, color: h.cor }}
                  title={`CV ${z.metricas.cvValidacao.toLocaleString('pt-BR')}% (${z.metricas.nPontos} pontos)`}>
                  {h.label} · CV {z.metricas.cvValidacao.toLocaleString('pt-BR')}%
                </span>
              ) : (
                <span className="text-[9px] px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: '#0b1f3a', color: '#475569' }} title="Sem dados de laboratório suficientes na zona">
                  CV —
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Rodapé: versão, convergência, variável de validação */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 pt-2 text-[10px]" style={{ borderTop: '1px solid #14263f', color: '#64748b' }}>
        <span>Versão <strong style={{ color: '#cbd5e1' }}>v{versao.numero}</strong></span>
        <span>Convergência <strong style={{ color: '#cbd5e1' }}>{versao.convergencia == null ? '—' : `${Math.round(versao.convergencia * 100)}%`}</strong></span>
        {temCV && varSimbolo && (
          <>
            <span>Validação por <strong style={{ color: '#cbd5e1' }}>{varSimbolo}</strong></span>
            {versao.cvMedioIntraZona != null && <span>CV médio <strong style={{ color: '#cbd5e1' }}>{versao.cvMedioIntraZona.toLocaleString('pt-BR')}%</strong></span>}
          </>
        )}
      </div>
      {!temCV && (
        <p className="text-[9px] mt-1.5" style={{ color: '#475569' }}>
          Importe resultados de laboratório casados à grade para calcular o CV (homogeneidade) de cada zona.
        </p>
      )}
    </div>
  );
}
