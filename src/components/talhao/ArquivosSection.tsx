'use client';

// Aba Arquivos (Fase EXP-1). Lista os cenários marcados "Para uso" (oficiais) do
// talhão+safra e gera o MAPA FINAL de recomendação: PDF oficial (reusa o book) e
// imagem JPG (satélite + dose). Os arquivos de taxa variável (Shapefile por marca
// de monitor) vêm na EXP-2.

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { getTalhoes } from '@/lib/store';
import { extrairPoligono } from '@/lib/fertilidade';
import { colorirDose } from '@/lib/raster';
import { capturarMapaFertilidade } from '@/lib/capturaMapa';
import { listarCenarios, descomprimirCenario, type Cenario } from '@/lib/recomendacao/cenarios';
import { montarBookOficial, abrirOuBaixar } from '@/lib/recomendacao/relatorioCenarios';
import { MONITORES, monitorPorId, gerarShapefileZip } from '@/lib/recomendacao/shapefile';
import { FileText, FileImage, Loader2, FolderArchive, Star, FileCode } from 'lucide-react';

const VAZIO: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const fmt = (v: number, d = 0) => v.toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: d });

function carregarImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
async function pngParaJpeg(dataUrl: string): Promise<string> {
  const img = await carregarImg(dataUrl);
  const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const ctx = cv.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(img, 0, 0);
  return cv.toDataURL('image/jpeg', 0.92);
}
function baixar(dataUrl: string, nome: string) {
  const a = document.createElement('a'); a.href = dataUrl; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
}
function baixarBlob(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function ArquivosSection({ safraNome }: { safraNome?: string }) {
  const { nav } = useApp();
  const safra = safraNome ?? '';
  const [cens, setCens] = useState<Cenario[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [busy, setBusy] = useState('');
  const [monitorId, setMonitorId] = useState('raiz');
  const [clipBorda, setClipBorda] = useState(false);

  useEffect(() => {
    if (!nav.talhaoId || !safra) return;
    setCarregando(true);
    listarCenarios(nav.talhaoId, safra).then(cs => setCens(cs.filter(c => c.doses.some(d => d.usar)))).finally(() => setCarregando(false));
  }, [nav.talhaoId, safra]);

  const poligono = useMemo(() => {
    const t = getTalhoes().find(x => x.id === nav.talhaoId);
    if (t?.geojson) { try { return extrairPoligono(JSON.parse(t.geojson)); } catch { /* */ } }
    return null;
  }, [nav.talhaoId]);

  async function pdfOficial(c: Cenario) {
    const aba = typeof window !== 'undefined' ? window.open('', '_blank') : null;
    setBusy('pdf-' + c.id);
    try { const full = await descomprimirCenario(c); const marc = { ...full, doses: full.doses.filter(d => d.usar) }; const blob = await montarBookOficial([marc]); abrirOuBaixar(blob, aba, `recomendacao-${c.nome}.pdf`); }
    catch (e) { if (aba) aba.close(); alert('Falha ao gerar o PDF: ' + (e instanceof Error ? e.message : String(e))); }
    finally { setBusy(''); }
  }
  async function jpgDose(c: Cenario, eqId: string) {
    if (!poligono) { alert('Talhão sem polígono salvo.'); return; }
    setBusy(`jpg-${c.id}-${eqId}`);
    try {
      const full = await descomprimirCenario(c);
      const d = full.doses.find(x => x.equacaoId === eqId); if (!d) return;
      const png = colorirDose(d.grid, d.estilo).dataUrl;
      const comp = await capturarMapaFertilidade({ rasterPng: png, bounds: d.bounds, poligono, valores: VAZIO, satelite: true, corLimite: '#ffffff', larguraPx: 1600, alturaPx: 1120 });
      baixar(await pngParaJpeg(comp), `mapa-${c.nome}-${(d.produto || d.nomeEquacao)}.jpg`);
    } catch (e) { alert('Falha ao gerar a imagem: ' + (e instanceof Error ? e.message : String(e))); }
    finally { setBusy(''); }
  }
  async function shpDose(c: Cenario, eqId: string) {
    setBusy(`shp-${c.id}-${eqId}`);
    try {
      const full = await descomprimirCenario(c);
      const d = full.doses.find(x => x.equacaoId === eqId); if (!d) return;
      const t = getTalhoes().find(x => x.id === nav.talhaoId);
      const blob = await gerarShapefileZip(d, t?.nome ?? 'talhao', poligono, clipBorda);
      baixarBlob(blob, `RX_${t?.nome ?? 'talhao'}_${d.produto || d.nomeEquacao}_shp.zip`.replace(/[^\w.\-]+/g, '_'));
    } catch (e) { alert('Falha ao gerar o Shapefile: ' + (e instanceof Error ? e.message : String(e))); }
    finally { setBusy(''); }
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FolderArchive size={14} style={{ color: '#a78bfa' }} />
        <h3 className="text-sm font-bold" style={{ color: '#e2e8f0' }}>Arquivos da recomendação</h3>
      </div>
      <p className="text-[10px]" style={{ color: '#64748b' }}>
        Cenários marcados <strong>“Para uso”</strong> (estrela) na aba Recomendações. Gere o mapa final (PDF / imagem). Os arquivos de taxa variável (Shapefile) entram em breve.
      </p>

      {carregando ? (
        <div className="text-[10px] flex items-center gap-1.5" style={{ color: '#64748b' }}><Loader2 size={12} className="animate-spin" /> Carregando cenários…</div>
      ) : cens.length === 0 ? (
        <div className="text-center py-8 px-4">
          <p className="text-[10px]" style={{ color: '#64748b' }}>
            Nenhum mapa marcado para uso. Vá em <strong>Recomendações</strong>, aplique/reabra um cenário e clique na <Star size={10} style={{ display: 'inline', verticalAlign: 'middle', color: '#fbbf24' }} /> dos mapas que serão utilizados.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {cens.map(c => (
            <div key={c.id} className="rounded-lg p-2.5" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Star size={11} fill="#fbbf24" style={{ color: '#fbbf24' }} />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-bold truncate" style={{ color: '#e2e8f0' }}>{c.nome}</div>
                  <div className="text-[9px]" style={{ color: '#64748b' }}>{c.doses.filter(d => d.usar).length} mapa(s) p/ uso · {fmt(c.financeiro.areaHa, 1)} ha</div>
                </div>
                <button onClick={() => pdfOficial(c)} disabled={!!busy}
                  className="px-2 py-1 rounded text-[10px] font-bold text-white flex items-center gap-1" style={{ background: 'var(--invicta-green-dark)', opacity: busy ? 0.6 : 1 }}>
                  {busy === 'pdf-' + c.id ? <Loader2 size={11} className="animate-spin" /> : <FileText size={11} />} PDF oficial
                </button>
              </div>
              <div className="space-y-1">
                {c.doses.filter(d => d.usar).map(d => (
                  <div key={d.equacaoId} className="flex items-center gap-1.5">
                    <span className="flex-1 truncate text-[9px]" style={{ color: '#cbd5e1' }}>{d.produto || d.nomeEquacao}</span>
                    <button onClick={() => jpgDose(c, d.equacaoId)} disabled={!!busy} title="Imagem JPG (satélite + dose)"
                      className="px-1.5 py-1 rounded text-[9px] font-semibold flex items-center gap-1" style={{ background: '#1a3a6b', color: '#93c5fd', opacity: busy ? 0.6 : 1 }}>
                      {busy === `jpg-${c.id}-${d.equacaoId}` ? <Loader2 size={10} className="animate-spin" /> : <FileImage size={10} />} JPG
                    </button>
                    <button onClick={() => shpDose(c, d.equacaoId)} disabled={!!busy} title="Shapefile de taxa variável (.shp/.shx/.dbf)"
                      className="px-1.5 py-1 rounded text-[9px] font-semibold flex items-center gap-1" style={{ background: '#1a3a6b', color: '#93c5fd', opacity: busy ? 0.6 : 1 }}>
                      {busy === `shp-${c.id}-${d.equacaoId}` ? <Loader2 size={10} className="animate-spin" /> : <FileCode size={10} />} SHP
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="rounded-lg p-2.5 mt-1" style={{ background: '#0b1f38', border: '1px solid #2e5fa3' }}>
            <div className="text-[10px] font-bold mb-1" style={{ color: '#93c5fd' }}>Shapefile (taxa variável)</div>
            <label className="text-[9px] block mb-1" style={{ color: '#94a3b8' }}>Borda (células 20×20 m):</label>
            <div className="flex gap-1 mb-2">
              {([[false, 'Sem clipar (células inteiras)'], [true, 'Clipar pela borda do talhão']] as const).map(([v, label]) => (
                <button key={String(v)} onClick={() => setClipBorda(v)} className="flex-1 py-1.5 rounded text-[9px] font-bold"
                  style={{ background: clipBorda === v ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: clipBorda === v ? '#fff' : '#94a3b8' }}>{label}</button>
              ))}
            </div>
            <label className="text-[9px] block mb-1" style={{ color: '#94a3b8' }}>Monitor / máquina:</label>
            <select value={monitorId} onChange={e => setMonitorId(e.target.value)} className="w-full rounded px-2 py-1.5 text-[10px] outline-none" style={{ background: '#1a3a6b', color: '#e2e8f0', border: '1px solid #2e5fa3' }}>
              {MONITORES.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
            <p className="text-[9px] mt-1.5" style={{ color: '#64748b' }}>
              Baixe o <strong>SHP</strong> de cada mapa (botões acima) e copie os arquivos <code>.shp/.shx/.dbf/.prj</code> para: <strong style={{ color: '#cbd5e1' }}>{monitorPorId(monitorId).pasta}</strong>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
