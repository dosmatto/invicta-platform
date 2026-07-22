'use client';

// SUAVIZAR LIMITES das zonas de manejo (S1) — painel inline pós-geração.
// Etapa OPCIONAL e REVERSÍVEL sobre zonas já prontas (preview gerado ou
// zoneamento salvo): o backend suaviza cada divisa UMA vez só (mesma linha
// para as duas zonas vizinhas — sem sobreposição/vão) e preserva o contorno
// do talhão por padrão. Nada é gravado até o usuário Aplicar/Salvar; a prévia
// vai para o mapa via onPreview e o resumo (áreas/vértices/deslocamento) é
// mostrado ANTES da decisão. Original sempre preservado (nova versão).

import { useEffect, useMemo, useRef, useState } from 'react';
import { suavizarZonas, type NivelSuavizacao, type RespSuavizarZonas } from '@/lib/fertilidade';
import { inputStyle } from '@/constants/ui';
import { Spline, Loader2, X, AlertTriangle, Eye, EyeOff, Save, Check, RotateCcw, Diff } from 'lucide-react';

// Limites de alteração de área (%) — configuráveis no modo personalizado.
const LIM_PADRAO = { alerta: 1, confirma: 3, bloqueia: 5 };

const NIVEIS: { id: NivelSuavizacao; rotulo: string; dica: string }[] = [
  { id: 'leve', rotulo: 'Leve', dica: 'Correções visuais pequenas; quase não altera a geometria.' },
  { id: 'moderado', rotulo: 'Moderado', dica: 'Equilíbrio recomendado: remove os principais serrilhados.' },
  { id: 'intenso', rotulo: 'Intenso', dica: 'Linhas bem arredondadas; pode alterar mais a geometria.' },
  { id: 'personalizado', rotulo: 'Personalizado', dica: 'Ajuste fino de tolerância, iterações e limites.' },
];

export interface SuavizarLimitesProps {
  titulo: string;                                   // nome do zoneamento/preview
  fcOriginal: GeoJSON.FeatureCollection;            // zonas prontas (com cor/classe)
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  onPreview: (fc: GeoJSON.FeatureCollection | null) => void;  // prévia p/ o mapa
  onAplicar?: (fc: GeoJSON.FeatureCollection, resp: RespSuavizarZonas) => void;  // substitui o preview em edição
  onSalvarVersao: (fc: GeoJSON.FeatureCollection, resp: RespSuavizarZonas, rotuloNivel: string) => void;
  onClose: () => void;
}

export function SuavizarLimites({ titulo, fcOriginal, poligono, onPreview, onAplicar, onSalvarVersao, onClose }: SuavizarLimitesProps) {
  const [nivel, setNivel] = useState<NivelSuavizacao>('moderado');
  const [tolM, setTolM] = useState(10);            // personalizado: tolerância (m)
  const [iters, setIters] = useState(2);           // personalizado: iterações Chaikin
  const [manterExterno, setManterExterno] = useState(true);
  const [corrigirFrag, setCorrigirFrag] = useState(false);
  const [fragMinHa, setFragMinHa] = useState(0.5);
  const [adequarOper, setAdequarOper] = useState(false);
  const [larguraMinM, setLarguraMinM] = useState(24);   // ~largura do implemento
  const [limites, setLimites] = useState(LIM_PADRAO);
  const [modoAvancado, setModoAvancado] = useState(false);
  const [confirmoAlteracao, setConfirmoAlteracao] = useState(false);

  const [resp, setResp] = useState<RespSuavizarZonas | null>(null);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [verOriginal, setVerOriginal] = useState(false);
  const [mostrarDiff, setMostrarDiff] = useState(true);

  // Prévia automática (debounce): muda parâmetro → recalcula SEM tocar no original.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const geracao = useRef(0);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const g = ++geracao.current;
    setConfirmoAlteracao(false);
    timer.current = setTimeout(async () => {
      setProcessando(true); setErro(null);
      try {
        const r = await suavizarZonas({
          fc: fcOriginal, poligono, nivel,
          toleranciaM: nivel === 'personalizado' ? tolM : null,
          iteracoes: nivel === 'personalizado' ? iters : null,
          fragMinHa: corrigirFrag ? fragMinHa : 0,
          larguraMinM: adequarOper ? larguraMinM : 0,
          manterLimiteExterno: manterExterno,
        });
        if (g === geracao.current) setResp(r);
      } catch (e) {
        if (g === geracao.current) { setResp(null); setErro(e instanceof Error ? e.message : 'Falha ao suavizar.'); }
      } finally {
        if (g === geracao.current) setProcessando(false);
      }
    }, 600);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fcOriginal, poligono, nivel, tolM, iters, manterExterno, corrigirFrag, fragMinHa, adequarOper, larguraMinM]);

  // Prévia no mapa: suavizado (ou original, no "antes") + destaque das diferenças.
  useEffect(() => {
    if (!resp) { onPreview(null); return; }
    const base = verOriginal ? fcOriginal : resp.fc;
    const feats: GeoJSON.Feature[] = [...base.features];
    if (mostrarDiff && !verOriginal) {
      feats.push(...resp.diff.features.map(f => ({
        ...f, properties: { ...(f.properties ?? {}), cor: '#fde047', zona: '', classe: '' },
      })));
    }
    onPreview({ type: 'FeatureCollection', features: feats });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resp, verOriginal, mostrarDiff]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => onPreview(null), []);

  const r = resp?.resumo ?? null;
  const maiorPct = r?.maiorDiffPct ?? 0;
  const perdidas = r?.zonasPerdidas ?? [];
  const bloqueado = !!r && (perdidas.length > 0 || (maiorPct > limites.bloqueia && !modoAvancado));
  const precisaConfirmar = !!r && maiorPct > limites.confirma && !bloqueado;
  const podeConcluir = !!resp && !processando && !bloqueado && (!precisaConfirmar || confirmoAlteracao);
  const rotuloNivel = NIVEIS.find(n => n.id === nivel)?.rotulo ?? nivel;

  const fmt = (v: number, d = 2) => v.toLocaleString('pt-BR', { maximumFractionDigits: d });
  const corDiff = (pct: number) => Math.abs(pct) > limites.confirma ? '#f87171' : Math.abs(pct) > limites.alerta ? '#fbbf24' : '#86efac';

  const restaurarParametros = () => {
    setNivel('moderado'); setTolM(10); setIters(2); setManterExterno(true);
    setCorrigirFrag(false); setFragMinHa(0.5); setAdequarOper(false); setLarguraMinM(24);
    setLimites(LIM_PADRAO); setModoAvancado(false); setConfirmoAlteracao(false);
  };

  const chip = (on: boolean) => ({
    background: on ? 'var(--invicta-blue-mid)' : '#1a3a6b',
    color: on ? '#fff' : '#93c5fd',
    border: `1px solid ${on ? '#60a5fa' : '#1a3a6b'}`,
  });

  const porZonaOrdenado = useMemo(
    () => (r ? [...r.porZona].sort((a, b) => Math.abs(b.diffPct) - Math.abs(a.diffPct)) : []),
    [r],
  );

  return (
    <div className="p-2 rounded space-y-2" style={{ background: '#071c30', border: '1px solid #0e7490' }}>
      <div className="flex items-center gap-2">
        <Spline size={13} style={{ color: '#22d3ee' }} />
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#67e8f9' }}>Suavizar limites</span>
        <span className="text-[9px] truncate" style={{ color: '#64748b' }}>— {titulo}</span>
        <button onClick={onClose} title="Fechar (nada é alterado)" className="ml-auto p-1 rounded" style={{ color: '#93c5fd' }}><X size={12} /></button>
      </div>
      <p className="text-[9px] leading-relaxed" style={{ color: '#6d8bbe' }}>
        Arredonda serrilhados e remove excesso de vértices <strong style={{ color: '#a5f3fc' }}>preservando a topologia</strong>: a divisa entre duas zonas continua sendo a <strong style={{ color: '#a5f3fc' }}>mesma linha</strong> (sem sobreposições nem vazios) e o contorno do talhão fica intacto. O original <strong style={{ color: '#a5f3fc' }}>não é alterado</strong> até você aplicar/salvar.
      </p>

      {/* Níveis */}
      <div>
        <span className="text-[9px] font-semibold block mb-1" style={{ color: '#64748b' }}>Nível de suavização</span>
        <div className="grid grid-cols-4 gap-1">
          {NIVEIS.map(n => (
            <button key={n.id} onClick={() => setNivel(n.id)} title={n.dica}
              className="py-1.5 rounded text-[10px] font-semibold" style={chip(nivel === n.id)}>{n.rotulo}</button>
          ))}
        </div>
        <p className="text-[9px] mt-0.5" style={{ color: '#475569' }}>{NIVEIS.find(n => n.id === nivel)?.dica}</p>
        {nivel === 'intenso' && (
          <p className="text-[9px] mt-0.5 flex items-center gap-1" style={{ color: '#fbbf24' }}>
            <AlertTriangle size={9} /> Nível intenso pode alterar mais a geometria — confira o resumo antes de salvar.
          </p>
        )}
      </div>

      {/* Personalizado */}
      {nivel === 'personalizado' && (
        <div className="p-1.5 rounded space-y-1.5" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
          <div className="flex items-center gap-2">
            <span className="text-[9px] flex-shrink-0" style={{ color: '#64748b', minWidth: 130 }}>Tolerância (m) — intensidade</span>
            <input type="range" min={1} max={50} step={1} value={tolM} onChange={e => setTolM(Number(e.target.value))} className="flex-1 accent-cyan-500" />
            <span className="text-[10px] font-bold tabular-nums" style={{ color: '#67e8f9', minWidth: 34, textAlign: 'right' }}>{tolM} m</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] flex-shrink-0" style={{ color: '#64748b', minWidth: 130 }}>Arredondamento (iterações)</span>
            <input type="range" min={0} max={5} step={1} value={iters} onChange={e => setIters(Number(e.target.value))} className="flex-1 accent-cyan-500" />
            <span className="text-[10px] font-bold tabular-nums" style={{ color: '#67e8f9', minWidth: 34, textAlign: 'right' }}>{iters}×</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] flex-shrink-0" style={{ color: '#64748b', minWidth: 130 }}>Limites de área (alerta/confirmar/bloquear %)</span>
            {(['alerta', 'confirma', 'bloqueia'] as const).map(k => (
              <input key={k} type="number" step="0.5" min="0" value={limites[k]}
                onChange={e => setLimites(l => ({ ...l, [k]: Math.max(0, Number(e.target.value.replace(',', '.')) || 0) }))}
                className="w-12 rounded px-1 py-0.5 text-[10px] outline-none" style={inputStyle} />
            ))}
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={modoAvancado} onChange={e => setModoAvancado(e.target.checked)} className="accent-cyan-500" />
            <span className="text-[9px]" style={{ color: '#94a3b8' }}>Modo avançado: permitir alteração acima de {limites.bloqueia}%</span>
          </label>
        </div>
      )}

      {/* Opções de topologia / fragmentos / operação */}
      <div className="space-y-1">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={manterExterno} onChange={e => setManterExterno(e.target.checked)} className="accent-cyan-500" />
          <span className="text-[10px] font-semibold" style={{ color: '#cbd5e1' }}>Manter limite externo do talhão</span>
          <span className="text-[9px]" style={{ color: '#64748b' }}>(recomendado — só as divisas internas mudam)</span>
        </label>
        {!manterExterno && (
          <p className="text-[9px] flex items-center gap-1 pl-4" style={{ color: '#fbbf24' }}>
            <AlertTriangle size={9} /> Contorno externo também será suavizado — o resultado continua recortado no talhão oficial.
          </p>
        )}
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={corrigirFrag} onChange={e => setCorrigirFrag(e.target.checked)} className="accent-cyan-500" />
          <span className="text-[10px] font-semibold" style={{ color: '#cbd5e1' }}>Corrigir pequenos fragmentos</span>
          {corrigirFrag && (
            <span className="flex items-center gap-1 text-[9px]" style={{ color: '#64748b' }}>
              — menores que
              <input type="number" step="0.1" min="0" value={fragMinHa}
                onChange={e => setFragMinHa(Math.max(0, Number(e.target.value.replace(',', '.')) || 0))}
                className="w-12 rounded px-1 py-0.5 text-[10px] outline-none" style={inputStyle} />
              ha vão para a zona vizinha de maior divisa
            </span>
          )}
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={adequarOper} onChange={e => setAdequarOper(e.target.checked)} className="accent-cyan-500" />
          <span className="text-[10px] font-semibold" style={{ color: '#cbd5e1' }}>Adequar para operação de máquinas</span>
          {adequarOper && (
            <span className="flex items-center gap-1 text-[9px]" style={{ color: '#64748b' }}>
              — largura mínima da zona (implemento):
              <input type="number" step="1" min="0" value={larguraMinM}
                onChange={e => setLarguraMinM(Math.max(0, Number(e.target.value.replace(',', '.')) || 0))}
                className="w-12 rounded px-1 py-0.5 text-[10px] outline-none" style={inputStyle} />
              m
            </span>
          )}
        </label>
        {adequarOper && (
          <p className="text-[9px] pl-4 leading-relaxed" style={{ color: '#6d8bbe' }}>
            Trechos mais estreitos que a largura mínima (gargalos, pontas e corredores sem aplicação prática) são incorporados à zona vizinha.
          </p>
        )}
      </div>

      {/* Prévia: estado + controles antes/depois/diferenças */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {processando
          ? <span className="text-[10px] flex items-center gap-1.5" style={{ color: '#67e8f9' }}><Loader2 size={11} className="animate-spin" /> Calculando prévia…</span>
          : resp
            ? <span className="text-[10px] flex items-center gap-1" style={{ color: '#86efac' }}><Check size={11} /> Prévia no mapa</span>
            : <span className="text-[10px]" style={{ color: '#64748b' }}>Ajuste os parâmetros — a prévia atualiza sozinha.</span>}
        {resp && (
          <>
            <button onClick={() => setVerOriginal(v => !v)}
              className="ml-auto flex items-center gap-1 text-[9px] px-2 py-0.5 rounded font-semibold" style={chip(verOriginal)}>
              {verOriginal ? <EyeOff size={9} /> : <Eye size={9} />} {verOriginal ? 'Vendo ORIGINAL' : 'Ver original'}
            </button>
            <button onClick={() => setMostrarDiff(v => !v)} title="Destacar (em amarelo) as áreas que mudaram"
              className="flex items-center gap-1 text-[9px] px-2 py-0.5 rounded font-semibold" style={chip(mostrarDiff)}>
              <Diff size={9} /> Diferenças
            </button>
          </>
        )}
      </div>

      {erro && (
        <div className="flex items-start gap-1.5 p-2 rounded" style={{ background: '#2a0f12', border: '1px solid #7f1d1d' }}>
          <AlertTriangle size={12} style={{ color: '#f87171' }} className="flex-shrink-0 mt-0.5" />
          <p className="text-[10px] leading-relaxed" style={{ color: '#fca5a5' }}>{erro}</p>
        </div>
      )}

      {/* Resumo das diferenças (antes de decidir) */}
      {r && (
        <div className="p-1.5 rounded space-y-1" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
          <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#67e8f9' }}>Resumo da suavização</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px]" style={{ color: '#94a3b8' }}>
            <span>Área total: {fmt(r.areaAntesHa)} → {fmt(r.areaDepoisHa)} ha <strong style={{ color: corDiff(maiorPct) }}>({r.diffTotalHa >= 0 ? '+' : ''}{fmt(r.diffTotalHa, 3)} ha)</strong></span>
            <span>Maior alteração de zona: <strong style={{ color: corDiff(maiorPct) }}>{fmt(maiorPct)}%</strong></span>
            <span>Vértices: {r.vertAntes} → <strong style={{ color: '#cbd5e1' }}>{r.vertDepois}</strong></span>
            <span>Deslocamento máx. da linha: <strong style={{ color: '#cbd5e1' }}>{fmt(r.deslocMaxM, 1)} m</strong></span>
            <span>Tolerância usada: {fmt(r.toleranciaM, 1)} m · {r.iteracoes}× arredondamento</span>
            <span>
              {r.sobreposicaoCorrigidaHa > 0 && <>Sobreposições corrigidas: {fmt(r.sobreposicaoCorrigidaHa, 3)} ha · </>}
              {r.vaosCorrigidosHa > 0 && <>vazios corrigidos: {fmt(r.vaosCorrigidosHa, 3)} ha · </>}
              fragmentos incorporados: {r.fragmentosIncorporados}
            </span>
          </div>
          {porZonaOrdenado.length > 0 && (
            <div className="max-h-28 overflow-y-auto">
              <table className="w-full text-[9px]" style={{ color: '#94a3b8' }}>
                <thead>
                  <tr style={{ color: '#64748b' }}>
                    <th className="text-left font-semibold">Zona</th>
                    <th className="text-right font-semibold">Antes (ha)</th>
                    <th className="text-right font-semibold">Depois (ha)</th>
                    <th className="text-right font-semibold">Δ%</th>
                    <th className="text-right font-semibold">Vért.</th>
                    <th className="text-right font-semibold">Desloc.</th>
                  </tr>
                </thead>
                <tbody>
                  {porZonaOrdenado.map(z => (
                    <tr key={z.id}>
                      <td>{z.id}</td>
                      <td className="text-right tabular-nums">{fmt(z.areaAntesHa)}</td>
                      <td className="text-right tabular-nums">{fmt(z.areaDepoisHa)}</td>
                      <td className="text-right tabular-nums font-semibold" style={{ color: corDiff(z.diffPct) }}>{z.diffPct >= 0 ? '+' : ''}{fmt(z.diffPct)}</td>
                      <td className="text-right tabular-nums">{z.vertAntes}→{z.vertDepois}</td>
                      <td className="text-right tabular-nums">{fmt(z.deslocMaxM, 1)} m</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {r.zonasIncorporadas.length > 0 && (
            <p className="text-[9px]" style={{ color: '#fbbf24' }}>Zonas totalmente incorporadas (fragmento/largura): {r.zonasIncorporadas.join(', ')}.</p>
          )}
          {r.vaosPreservadosHa > 0.01 && (
            <p className="text-[9px]" style={{ color: '#64748b' }}>Buracos legítimos preservados: {fmt(r.vaosPreservadosHa)} ha (áreas sem dado não são preenchidas).</p>
          )}
        </div>
      )}

      {/* Alertas de alteração de área */}
      {r && perdidas.length > 0 && (
        <div className="flex items-start gap-1.5 p-2 rounded" style={{ background: '#2a0f12', border: '1px solid #7f1d1d' }}>
          <AlertTriangle size={12} style={{ color: '#f87171' }} className="flex-shrink-0 mt-0.5" />
          <p className="text-[10px] leading-relaxed" style={{ color: '#fca5a5' }}>
            A zona {perdidas.join(', ')} desapareceria com estes parâmetros — reduza a intensidade. Aplicação bloqueada.
          </p>
        </div>
      )}
      {r && perdidas.length === 0 && maiorPct > limites.bloqueia && !modoAvancado && (
        <div className="flex items-start gap-1.5 p-2 rounded" style={{ background: '#2a0f12', border: '1px solid #7f1d1d' }}>
          <AlertTriangle size={12} style={{ color: '#f87171' }} className="flex-shrink-0 mt-0.5" />
          <p className="text-[10px] leading-relaxed" style={{ color: '#fca5a5' }}>
            Alteração de área acima de {limites.bloqueia}% — bloqueado. Reduza a intensidade ou habilite o modo avançado (nível Personalizado).
          </p>
        </div>
      )}
      {precisaConfirmar && (
        <label className="flex items-start gap-1.5 p-2 rounded cursor-pointer" style={{ background: '#2d1a00', border: '1px solid #a16207' }}>
          <input type="checkbox" checked={confirmoAlteracao} onChange={e => setConfirmoAlteracao(e.target.checked)} className="accent-amber-500 mt-0.5" />
          <span className="text-[10px] leading-relaxed" style={{ color: '#fcd34d' }}>
            A maior alteração de zona é {fmt(maiorPct)}% (acima de {limites.confirma}%). Confirmo que revisei a prévia e aceito a alteração.
          </span>
        </label>
      )}
      {r && perdidas.length === 0 && maiorPct > limites.alerta && maiorPct <= limites.confirma && (
        <p className="text-[9px] flex items-center gap-1" style={{ color: '#fbbf24' }}>
          <AlertTriangle size={9} /> Alteração de área acima de {limites.alerta}% — confira o resumo por zona.
        </p>
      )}

      {/* Ações */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button onClick={onClose} className="text-[10px] px-2 py-1.5 rounded font-semibold" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
          Cancelar
        </button>
        <button onClick={restaurarParametros} title="Volta os parâmetros ao padrão" className="flex items-center gap-1 text-[10px] px-2 py-1.5 rounded font-semibold" style={{ background: '#1a3a6b', color: '#93c5fd' }}>
          <RotateCcw size={10} /> Restaurar parâmetros
        </button>
        {onAplicar && (
          <button onClick={() => resp && onAplicar(resp.fc, resp)} disabled={!podeConcluir}
            title="Substitui as zonas em edição (dá para desfazer)"
            className="flex items-center gap-1 text-[10px] px-2 py-1.5 rounded font-bold text-white disabled:opacity-40"
            style={{ background: '#0e7490' }}>
            <Check size={10} /> Aplicar suavização
          </button>
        )}
        <button onClick={() => resp && onSalvarVersao(resp.fc, resp, rotuloNivel)} disabled={!podeConcluir}
          title="Cria uma NOVA versão do zoneamento — o original fica guardado"
          className="ml-auto flex items-center gap-1 text-[10px] px-2 py-1.5 rounded font-bold text-white disabled:opacity-40"
          style={{ background: '#065f46' }}>
          <Save size={10} /> Salvar como nova versão
        </button>
      </div>
      <p className="text-[9px] leading-relaxed" style={{ color: '#475569' }}>
        Recomendado: <strong style={{ color: '#86efac' }}>Salvar como nova versão</strong> — o zoneamento original continua na lista e pode ser restaurado a qualquer momento.
      </p>
    </div>
  );
}
