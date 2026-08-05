'use client';

// ASSISTENTE DE IMPORTAÇÃO → ZONEAMENTO NATIVO (spec §3).
//
// Carrega SHP/KML/GeoJSON, deixa CONFERIR o que foi lido (qual atributo é a
// classe, se 1 é a pior ou a melhor zona, e o nome de cada classe) e converte
// no modelo interno da plataforma. A partir daí a zona importada é um
// zoneamento como qualquer outro: suavizar, editor manual, versão, exportação
// e prescrição funcionam sem saber da origem.
//
// A conferência não é enfeite: errar a direção da numeração INVERTE a
// prescrição (aplica mais onde devia aplicar menos), e nenhum arquivo carrega
// essa informação — quem sabe é quem fez o mapa.

import { useEffect, useMemo, useRef, useState } from 'react';
import { parseGeoFile, normalizarZonas, type ZonasPreparadas } from '@/lib/geo';
import { paraZoneamentoNativo, type ZoneamentoNativo } from '@/lib/meap/nativo';
import { getZoneamentosMeap, saveZoneamentoMeap, setZoneamentoPadraoMeap, type ZoneamentoMeap } from '@/lib/store';
import { usuarioAtual } from '@/lib/auth';
import { Upload, Loader2, X, Check, AlertTriangle, FileDown, ArrowUpDown } from 'lucide-react';

interface Props {
  talhaoId: string;
  onPreview: (fc: GeoJSON.FeatureCollection | null) => void;
  onSalvo: (z: ZoneamentoMeap) => void;
}

const FORMATOS: Record<string, string> = { kml: 'KML', zip: 'Shapefile', geojson: 'GeoJSON', json: 'GeoJSON' };

// Nome-base do zoneamento = nome do arquivo sem extensão (é como o cliente
// chama o mapa dele; "Zoneamento 3" não diz nada quando chega um arquivo).
function baseDoArquivo(nome: string): string {
  const semExt = nome.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
  return semExt.slice(0, 60) || 'Zoneamento importado';
}

export function ImportarZoneamento({ talhaoId, onPreview, onSalvo }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<'idle' | 'lendo' | 'mapeando'>('idle');
  const [erro, setErro] = useState<string | null>(null);
  const [arquivo, setArquivo] = useState<{ nome: string; formato: string } | null>(null);
  const [bruto, setBruto] = useState<GeoJSON.FeatureCollection | null>(null);
  const [campo, setCampo] = useState('');
  const [menorEhPior, setMenorEhPior] = useState(true);
  const [nomes, setNomes] = useState<Record<string, string>>({});

  // Leitura do arquivo com o campo/direção ATUAIS (trocar não reabre o arquivo).
  const prep: ZonasPreparadas | null = useMemo(
    () => (bruto ? normalizarZonas(bruto, { campoClasse: campo || undefined, menorEhPior }) : null),
    [bruto, campo, menorEhPior],
  );

  // Ordem canônica dos valores (maior potencial → menor), ANTES de renomear:
  // renomear uma classe não pode reordenar o zoneamento.
  const ordemValores = useMemo(
    () => (prep ? paraZoneamentoNativo(prep.fc).classes.map(c => c.valor) : []),
    [prep],
  );

  const nativo: ZoneamentoNativo | null = useMemo(
    () => (prep ? paraZoneamentoNativo(prep.fc, { nomes, ordemValores }) : null),
    [prep, nomes, ordemValores],
  );

  // Prévia no mapa enquanto o assistente está aberto.
  useEffect(() => {
    if (!nativo || !nativo.fc.features.length) { onPreview(null); return; }
    onPreview({
      type: 'FeatureCollection',
      features: nativo.fc.features.map(f => {
        const p = (f.properties ?? {}) as { cor?: string; zona?: string; classe?: string };
        return { type: 'Feature' as const, properties: { cor: p.cor, rotulo: p.zona, classeLabel: p.classe, selecionada: false }, geometry: f.geometry! };
      }),
    });
  }, [nativo, onPreview]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => onPreview(null), []);

  async function carregar(file: File) {
    setErro(null); setEstado('lendo');
    try {
      const r = await parseGeoFile(file);
      const [a, b, c, d] = r.bbox;
      // Validar sistema de coordenadas (spec §3.3): arquivo projetado (UTM) tem
      // coordenadas na casa das centenas de milhares — entra no mapa no meio do
      // oceano. Barrar aqui é mais honesto que desenhar errado.
      if (!(a >= -180 && c <= 180 && b >= -90 && d <= 90)) {
        throw new Error('Arquivo em coordenadas projetadas (UTM). Exporte junto com o .prj, ou reprojete para WGS84 (EPSG:4326).');
      }
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      const prim = normalizarZonas(r.geojson);
      if (prim.count === 0) throw new Error('Nenhum polígono encontrado no arquivo (zoneamento precisa de polígonos, não de pontos ou linhas).');
      setBruto(r.geojson);
      setCampo(prim.campoClasse);
      setMenorEhPior(true);
      setNomes({});
      setArquivo({ nome: file.name, formato: FORMATOS[ext] ?? ext.toUpperCase() });
      setEstado('mapeando');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao ler o arquivo.');
      setEstado('idle');
    }
  }

  function fechar() {
    setEstado('idle'); setBruto(null); setArquivo(null); setNomes({}); setCampo(''); setErro(null);
    onPreview(null);
  }

  // Nome único: nunca sobrescreve um zoneamento existente.
  function nomeUnico(desejado: string): string {
    const usados = new Set(getZoneamentosMeap(talhaoId).map(z => z.nome));
    if (!usados.has(desejado)) return desejado;
    let n = 2;
    while (usados.has(`${desejado} (${n})`)) n++;
    return `${desejado} (${n})`;
  }

  function transformar() {
    if (!nativo || !prep || !arquivo || !nativo.fc.features.length) return;
    const mapa: Record<string, string> = {};
    nativo.classes.forEach(c => { mapa[c.valor] = c.classe; });
    const primeiro = getZoneamentosMeap(talhaoId).length === 0;
    const z = saveZoneamentoMeap({
      talhaoId,
      nome: nomeUnico(`${baseDoArquivo(arquivo.nome)} — V1 Importada`),
      padrao: false,
      fc: nativo.fc,
      meta: {
        camadas: [], algoritmo: 'importado',
        nPotenciais: nativo.classes.length, areaMinHa: 0,
        nZonas: nativo.classes.length, nPoligonos: nativo.nPoligonos, cvMedio: null,
        importacao: {
          arquivo: arquivo.nome, formato: arquivo.formato,
          campoClasse: prep.campoClasse, menorEhPior, mapa,
          nDescartados: nativo.descartados.semGeometria + nativo.descartados.semArea,
          data: new Date().toISOString(), usuario: usuarioAtual()?.email ?? undefined,
        },
      },
    });
    // Primeiro zoneamento do talhão vira o oficial (é o que a Amostragem usa).
    if (primeiro) setZoneamentoPadraoMeap(talhaoId, z.id);
    fechar();
    onSalvo(z);
  }

  const candidatos = prep?.candidatos ?? [];
  const escolhido = candidatos.find(c => c.campo === (campo || prep?.campoClasse));
  const nDescartados = (nativo?.descartados.semGeometria ?? 0) + (nativo?.descartados.semArea ?? 0);

  return (
    <div className="rounded-lg p-2.5 space-y-2" style={{ background: '#0b1f3a', border: '1px dashed #2e5fa3' }}>
      <div className="flex items-center gap-2">
        <FileDown size={13} style={{ color: '#7dd3fc' }} />
        <span className="text-[11px] font-bold uppercase tracking-wider flex-1" style={{ color: '#7dd3fc' }}>Importar zoneamento pronto</span>
        {estado === 'mapeando'
          ? <button onClick={fechar} className="text-[10px] font-semibold flex items-center gap-0.5" style={{ color: '#f87171' }}>cancelar <X size={10} /></button>
          : <button onClick={() => inputRef.current?.click()} disabled={estado === 'lendo'}
              className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded text-white" style={{ background: '#0369a1' }}>
              {estado === 'lendo' ? <><Loader2 size={11} className="animate-spin" /> Lendo…</> : <><Upload size={11} /> Escolher arquivo</>}
            </button>}
      </div>
      <input ref={inputRef} type="file" accept=".kml,.zip,.geojson,.json" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) carregar(f); e.target.value = ''; }} />

      {estado === 'idle' && !erro && (
        <p className="text-[10px] leading-relaxed" style={{ color: '#64748b' }}>
          SHP (.zip) · KML · GeoJSON, em WGS84. O arquivo não fica solto: vira um <strong style={{ color: '#7dd3fc' }}>Zoneamento Nativo</strong> — com versão, e com as mesmas ferramentas das zonas geradas aqui (suavizar, editar, prescrever, exportar).
        </p>
      )}

      {erro && (
        <p className="text-[10px] leading-relaxed flex items-start gap-1.5" style={{ color: '#f87171' }}>
          <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" /> {erro}
        </p>
      )}

      {estado === 'mapeando' && prep && nativo && (
        <div className="space-y-2">
          <p className="text-[10px]" style={{ color: '#cbd5e1' }}>
            <strong>{arquivo?.nome}</strong> <span style={{ color: '#64748b' }}>({arquivo?.formato})</span> · {nativo.nPoligonos} polígonos · {nativo.areaTotalHa.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ha
          </p>

          {/* ── Campo de classe (spec §3.5/3.6 — detectar e mapear atributos) ── */}
          <div>
            <span className="text-[9px] font-semibold block mb-1" style={{ color: '#64748b' }}>Qual atributo do arquivo é a CLASSE da zona?</span>
            {candidatos.length === 0 ? (
              <p className="text-[10px] leading-relaxed" style={{ color: '#fbbf24' }}>
                Nenhum atributo serve de classe (todos com um valor só, ou com valores demais). O arquivo entra como <strong>uma zona só</strong> — dá para nomeá-la abaixo e dividir depois no editor.
              </p>
            ) : (
              <select value={campo || prep.campoClasse} onChange={e => { setCampo(e.target.value); setNomes({}); }}
                className="w-full text-[11px] rounded px-2 py-1.5 outline-none" style={{ background: '#061525', color: '#e2e8f0', border: '1px solid #1a3a6b' }}>
                {candidatos.map(c => (
                  <option key={c.campo} value={c.campo}>
                    {c.campo} — {c.valores.length} valores {c.reconhecidosTexto > 0 ? '(classificação escrita)' : c.numerico ? '(numérico)' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* ── Direção da numeração — só faz sentido em campo numérico ── */}
          {escolhido?.numerico && escolhido.reconhecidosTexto === 0 && (
            <div>
              <span className="text-[9px] font-semibold block mb-1" style={{ color: '#64748b' }}>
                No arquivo, o número <strong style={{ color: '#fbbf24' }}>1</strong> é a pior ou a melhor zona? <span style={{ color: '#f87171' }}>Errar aqui inverte a prescrição.</span>
              </span>
              <div className="grid grid-cols-2 gap-1">
                {([[true, '1 = pior zona', 'padrão do QGIS'], [false, '1 = melhor zona', 'numerado por ranking']] as const).map(([v, t, sub]) => (
                  <button key={String(v)} onClick={() => setMenorEhPior(v)}
                    className="py-1.5 px-1 rounded text-[10px] font-semibold leading-tight"
                    style={{ background: menorEhPior === v ? 'var(--invicta-blue-mid)' : '#1a3a6b', color: menorEhPior === v ? '#fff' : '#93c5fd', border: `1px solid ${menorEhPior === v ? '#60a5fa' : '#1a3a6b'}` }}>
                    <ArrowUpDown size={9} className="inline mr-1" />{t}
                    <span className="block text-[8px]" style={{ opacity: 0.7 }}>{sub}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Classes lidas: conferir e NOMEAR cada uma à mão ── */}
          <div>
            <span className="text-[9px] font-semibold block mb-1" style={{ color: '#64748b' }}>
              Zonas lidas ({nativo.classes.length}) — da maior para a menor. O nome é seu: escreva como o cliente chama.
            </span>
            <div className="space-y-1">
              {nativo.classes.map(c => (
                <div key={c.valor} className="flex items-center gap-2 px-2 py-1 rounded" style={{ background: '#061525', border: '1px solid #1a3a6b' }}>
                  <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0" style={{ background: c.cor, border: '1px solid #fff' }} />
                  <span className="text-[10px] font-bold px-1 rounded flex-shrink-0" style={{ background: '#0b1f3a', color: '#93c5fd' }}>Zona {c.num}</span>
                  <input value={nomes[c.valor] ?? c.classe} onChange={e => setNomes(n => ({ ...n, [c.valor]: e.target.value }))}
                    className="flex-1 min-w-0 text-[11px] rounded px-1.5 py-1 outline-none" style={{ background: '#0b1f3a', color: '#e2e8f0', border: '1px solid #1a3a6b' }} />
                  <span className="text-[9px] flex-shrink-0 text-right" style={{ color: '#64748b', minWidth: '96px' }}>
                    {prep.campoClasse ? <>«{c.valor}» · </> : null}{c.nPolig} polí. · {c.areaHa.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ha
                  </span>
                </div>
              ))}
            </div>
          </div>

          {nDescartados > 0 && (
            <p className="text-[9px] leading-relaxed flex items-start gap-1" style={{ color: '#fbbf24' }}>
              <AlertTriangle size={10} className="flex-shrink-0 mt-0.5" />
              {nDescartados} feição(ões) descartada(s) na validação: {nativo.descartados.semGeometria} sem polígono, {nativo.descartados.semArea} sem área.
            </p>
          )}

          <button onClick={transformar} disabled={!nativo.fc.features.length}
            className="w-full py-2.5 rounded text-xs font-bold text-white flex items-center justify-center gap-2"
            style={{ background: '#0369a1', border: '1px solid #38bdf8', boxShadow: '0 2px 10px rgba(56,189,248,0.3)' }}>
            <Check size={14} /> Transformar em Zoneamento Nativo
          </button>
          <p className="text-[9px] leading-relaxed" style={{ color: '#6d8bbe' }}>
            Salva como <strong style={{ color: '#7dd3fc' }}>V1 Importada</strong> — essa versão fica preservada: suavizar ou editar depois cria uma versão nova ao lado dela.
          </p>
        </div>
      )}
    </div>
  );
}
