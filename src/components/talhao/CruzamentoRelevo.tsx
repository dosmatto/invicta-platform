'use client';

// MDE F4.b — Cruzamento por classe de relevo (§12.1): média de uma variável
// (produtividade, NDVI, fertilidade, condutividade…) por classe topográfica
// (Topo/Ombro/Meia encosta/Baixada/…) + diferença da média do talhão. Reusa o
// grid de CÓDIGOS das classes (backend) + os grids co-registrados do MEAP.

import { useEffect, useMemo, useState } from 'react';
import { getMapasProdutividade } from '@/lib/store';
import { descomprimirGrid, type Grid } from '@/lib/fertilidade';
import { cloudCarregarMapasPorPrefixo } from '@/lib/cloud';
import { carregarCamadas } from '@/lib/meap/gerar';
import { mediaPorClasse, type RespMdeAnalise, type LinhaCruzamento } from '@/lib/mde';
import { GitCompare, Loader2, ArrowUp, ArrowDown } from 'lucide-react';

import { inputStyle } from '@/constants/ui';
const fmt = (v: number | null, d = 1) => (v == null ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: d }));

interface OpcaoVar { id: string; rotulo: string; unidade: string; grid: Grid; bounds: [number, number, number, number]; }

export function CruzamentoRelevo({ analise, talhaoId }: { analise: RespMdeAnalise; talhaoId: string }) {
  const [opcoes, setOpcoes] = useState<OpcaoVar[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [sel, setSel] = useState('');

  useEffect(() => {
    let vivo = true;
    setCarregando(true); setOpcoes([]); setSel('');
    (async () => {
      const out: OpcaoVar[] = [];
      // 1) Produtividade oficial (o exemplo da spec §12.1)
      const prod = getMapasProdutividade(talhaoId).find(m => m.oficial);
      if (prod) {
        try {
          const docs = await cloudCarregarMapasPorPrefixo<{ resp: { bounds: [number, number, number, number]; grid?: Grid } }>(`${talhaoId}__prod__${prod.id}`);
          const d = docs[0]?.dados?.resp;
          let g = d?.grid;
          if (d && g) { if (g.comp === 'gz') g = await descomprimirGrid(g); out.push({ id: 'prod', rotulo: `Produtividade · ${prod.safra}`, unidade: 'kg/ha', grid: g, bounds: d.bounds }); }
        } catch { /* sem produtividade */ }
      }
      // 2) Demais camadas co-registradas do MEAP (fertilidade, NDVI, EC, composições) — exceto o próprio relevo
      try {
        const cc = await carregarCamadas(talhaoId);
        if (cc) for (const c of cc.camadas.filter(c => !c.chave.startsWith('topo__'))) {
          out.push({ id: c.chave, rotulo: c.simbolo, unidade: '', grid: { b64: c.b64, shape: c.shape }, bounds: cc.bounds });
        }
      } catch { /* sem camadas */ }
      if (vivo) { setOpcoes(out); setSel(out[0]?.id ?? ''); setCarregando(false); }
    })();
    return () => { vivo = false; };
  }, [talhaoId]);

  const opt = opcoes.find(o => o.id === sel) ?? null;
  const cruz = useMemo(() => {
    if (!opt) return null;
    return mediaPorClasse({ grid: analise.classes_cod, bounds: analise.bounds }, { grid: opt.grid, bounds: opt.bounds }, analise.meta.classes);
  }, [opt, analise]);

  const ordenadas: LinhaCruzamento[] = useMemo(() => (cruz?.linhas ?? []).slice().sort((a, b) => a.codigo - b.codigo), [cruz]);

  return (
    <div className="rounded p-2 space-y-1.5" style={{ background: '#0a1a2f', border: '1px solid #1a3a6b' }}>
      <p className="text-[10px] font-bold flex items-center gap-1.5" style={{ color: '#93c5fd' }}><GitCompare size={11} /> Cruzar por classe de relevo</p>

      {carregando ? (
        <p className="text-[9px] flex items-center gap-1.5" style={{ color: '#64748b' }}><Loader2 size={10} className="animate-spin" /> Carregando variáveis…</p>
      ) : opcoes.length === 0 ? (
        <p className="text-[9px]" style={{ color: '#64748b' }}>Nenhuma variável para cruzar ainda — importe produtividade, fertilidade, NDVI ou condutividade neste talhão.</p>
      ) : (
        <>
          <select value={sel} onChange={e => setSel(e.target.value)} className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
            {opcoes.map(o => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
          </select>

          {cruz && ordenadas.length > 0 ? (
            <div className="space-y-0.5">
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 text-[8px] font-bold uppercase pb-0.5" style={{ color: '#64748b', borderBottom: '1px solid #1a3a6b' }}>
                <span>Classe</span><span className="text-right">Área</span><span className="text-right">Média{opt?.unidade ? ` (${opt.unidade})` : ''}</span><span className="text-right">Dif.</span>
              </div>
              {ordenadas.map(l => (
                <div key={l.codigo} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 text-[10px] items-center" style={{ color: '#cbd5e1' }}>
                  <span className="flex items-center gap-1 truncate"><span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: l.cor }} />{l.nome}</span>
                  <span className="text-right" style={{ color: '#94a3b8' }}>{fmt(l.areaHa, 1)} ha</span>
                  <span className="text-right font-bold">{fmt(l.media, 0)}</span>
                  <span className="text-right flex items-center justify-end gap-0.5" style={{ color: l.diffPct == null ? '#64748b' : l.diffPct >= 0 ? '#86efac' : '#f87171' }}>
                    {l.diffPct != null && (l.diffPct >= 0 ? <ArrowUp size={9} /> : <ArrowDown size={9} />)}{l.diffPct == null ? '—' : `${l.diffPct >= 0 ? '+' : ''}${fmt(l.diffPct, 0)}%`}
                  </span>
                </div>
              ))}
              <p className="text-[8px] pt-0.5" style={{ color: '#475569' }}>
                Média do talhão: {fmt(cruz.mediaGeral, 0)}{opt?.unidade ? ` ${opt.unidade}` : ''} · diferença = quanto cada classe rende acima/abaixo da média.
              </p>
            </div>
          ) : (
            <p className="text-[9px]" style={{ color: '#fbbf24' }}>Sem sobreposição entre esta variável e as classes de relevo (verifique se cobrem o mesmo talhão).</p>
          )}
        </>
      )}
    </div>
  );
}
