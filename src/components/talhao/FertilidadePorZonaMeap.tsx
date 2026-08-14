'use client';

// FERTILIDADE POR ZONA (módulo Zonas) — mostra cada zona preenchida com o valor
// da sua amostra composta, sem interpolação, na escala de cores da legenda.
//
// Separado do módulo Fertilidade DE PROPÓSITO: lá o mapa interpola (krigagem);
// aqui, no módulo Zonas, o dado se comporta por zona. É só PRÉVIA — não salva
// nada na nuvem (não polui o prefixo de fertilidade). Emite o overlay para cima
// (onOverlay); quem desenha no mapa é o MeapSection, dono do slot de overlay.

import { useEffect, useMemo, useState } from 'react';
import { getImportacoesLab, getLegendasPorAtributo, getTalhoes, type ImportacaoLab } from '@/lib/store';
import { simboloElemento } from '@/lib/lab';
import {
  lerZonasDoTalhao, bindingAuto, construirOverlayPorZona, zonasComValor, type OverlayPorZona,
} from '@/lib/meap/fertilidadePorZona';
import { inputStyle } from '@/constants/ui';
import { Layers } from 'lucide-react';

export function FertilidadePorZonaMeap({ talhaoId, safraNome, zonasGeojson, onOverlay }: {
  talhaoId: string;
  safraNome?: string;
  zonasGeojson?: string;
  onOverlay: (o: OverlayPorZona | null) => void;
}) {
  const [importacoes, setImportacoes] = useState<ImportacaoLab[]>([]);
  const [importacaoId, setImportacaoId] = useState('');
  const [nutrienteSel, setNutriente] = useState('');
  const [profundidadeSel, setProfundidade] = useState('');
  const [mapaZonaNumero, setMapaZonaNumero] = useState<Record<string, number>>({});
  const [ativo, setAtivo] = useState(false);

  useEffect(() => {
    const carregar = () => setImportacoes(getImportacoesLab(talhaoId, safraNome));
    carregar();
    const h = () => carregar();
    window.addEventListener('inv:lab', h);
    return () => window.removeEventListener('inv:lab', h);
  }, [talhaoId, safraNome]);

  const importacao = useMemo(() => importacoes.find(i => i.id === importacaoId) ?? null, [importacoes, importacaoId]);

  // Zonas do padrão — lê fresco (o snapshot no prop pode estar velho após salvar).
  const zonas = useMemo(() => {
    const gj = zonasGeojson || getTalhoes().find(t => t.id === talhaoId)?.zonasGeojson;
    return lerZonasDoTalhao(gj);
  }, [zonasGeojson, talhaoId]);

  // Só nutrientes com legenda (CTCe 't' herda a de 'ctc' enquanto não tiver a sua).
  const temLegenda = (id: string) => getLegendasPorAtributo(id).length > 0 || (id === 't' && getLegendasPorAtributo('ctc').length > 0);
  const nutrientes = useMemo(() => (importacao ? importacao.elementos.filter(temLegenda) : []), [importacao]);
  const profundidades = useMemo(
    () => (importacao ? [...new Set(importacao.resultados.map(r => r.profundidade).filter(Boolean))] : []),
    [importacao],
  );

  // Valor EFETIVO derivado em render (sem efeito): a escolha do usuário se ainda
  // é válida; senão o 1º da lista. Evita setState-em-efeito e nunca fica preso
  // num nutriente/profundidade que sumiu ao trocar de laudo.
  const nutriente = nutrientes.includes(nutrienteSel) ? nutrienteSel : (nutrientes[0] ?? '');
  const profundidade = profundidades.includes(profundidadeSel) ? profundidadeSel : (profundidades[0] ?? '');

  // Vínculo zona↔amostra: refaz a sugestão ao trocar de laudo/zonas. É estado
  // derivado que o usuário edita depois — por isso um efeito, não render.
  useEffect(() => {
    const binding = (!importacao || zonas.length === 0)
      ? {}
      : bindingAuto(zonas, importacao.resultados.map(r => r.numero));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMapaZonaNumero(binding);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importacaoId, zonas]);

  const legenda = useMemo(() => {
    if (!nutriente) return undefined;
    const lst = getLegendasPorAtributo(nutriente);
    return lst[0] ?? (nutriente === 't' ? getLegendasPorAtributo('ctc')[0] : undefined);
  }, [nutriente]);

  // Emite o overlay para o MeapSection (ou null). Recalcula quando qualquer
  // entrada muda; limpa ao desligar / desmontar.
  useEffect(() => {
    if (!ativo || !importacao || !legenda || !nutriente || !profundidade || zonas.length === 0) {
      onOverlay(null);
      return;
    }
    onOverlay(construirOverlayPorZona({ zonas, imp: importacao, mapaZonaNumero, nut: nutriente, prof: profundidade, legenda }));
    return () => onOverlay(null);
  }, [ativo, importacao, legenda, nutriente, profundidade, mapaZonaNumero, zonas, onOverlay]);

  const numeros = useMemo(
    () => (importacao ? [...new Set(importacao.resultados.map(r => r.numero))].sort((a, b) => a - b) : []),
    [importacao],
  );
  const semValor = ativo && !!importacao && !!legenda && zonas.length > 0 && !!nutriente && !!profundidade &&
    zonasComValor(zonas, importacao, mapaZonaNumero, nutriente, profundidade).length === 0;

  if (zonas.length === 0) return null;   // sem zonas de manejo, nada a preencher

  return (
    <div className="rounded-lg p-2.5" style={{ background: '#0b1f3a', border: '1px solid #2e5fa3' }}>
      <p className="text-[11px] font-semibold mb-1 flex items-center gap-1" style={{ color: '#93c5fd' }}>
        <Layers size={12} /> Fertilidade por zona (sem interpolação)
      </p>
      <p className="text-[10px] mb-2" style={{ color: '#64748b' }}>
        Cada zona recebe o valor da sua amostra composta, na escala de cores. É prévia no mapa — a interpolação fica no módulo Fertilidade.
      </p>

      <div className="grid grid-cols-2 gap-1.5 mb-2">
        <select value={importacaoId} onChange={e => setImportacaoId(e.target.value)}
          className="col-span-2 w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
          <option value="">Selecione o laudo…</option>
          {importacoes.map(i => (
            <option key={i.id} value={i.id}>{i.laboratorio}{i.campanha ? ` · ${i.campanha}` : ''} · {i.resultados.length} amostras</option>
          ))}
        </select>
        {importacao && (
          <>
            <select value={nutriente} onChange={e => setNutriente(e.target.value)}
              className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
              {nutrientes.length === 0 && <option value="">sem legenda</option>}
              {nutrientes.map(n => <option key={n} value={n}>{simboloElemento(n)}</option>)}
            </select>
            <select value={profundidade} onChange={e => setProfundidade(e.target.value)}
              className="w-full rounded px-2 py-1.5 text-xs outline-none" style={inputStyle}>
              {profundidades.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </>
        )}
      </div>

      {importacao && zonas.length > 0 && (
        <div className="space-y-1 mb-2">
          <p className="text-[10px] font-semibold" style={{ color: '#64748b' }}>Vínculo zona ↔ nº da amostra</p>
          {zonas.map(z => (
            <div key={z.id} className="flex items-center gap-2">
              <span className="text-xs font-bold" style={{ color: '#e2e8f0', minWidth: 30 }}>Z{z.id}</span>
              <span className="text-[10px] flex-1 truncate" style={{ color: '#93c5fd' }}>{z.classe || '—'}</span>
              <span className="text-[10px]" style={{ color: '#64748b' }}>amostra</span>
              <select value={mapaZonaNumero[z.id] ?? ''} onChange={e => setMapaZonaNumero(m => ({ ...m, [z.id]: Number(e.target.value) }))}
                className="rounded px-1.5 py-0.5 text-[11px] outline-none" style={inputStyle}>
                {numeros.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}

      <button onClick={() => setAtivo(a => !a)} disabled={!importacao || !legenda}
        className="w-full rounded px-2 py-1.5 text-xs font-semibold disabled:opacity-40"
        style={{ background: ativo ? '#166534' : 'var(--invicta-blue-mid)', color: '#fff' }}>
        {ativo ? '✓ Preenchendo por zona — ocultar' : 'Preencher zonas no mapa'}
      </button>

      {semValor && (
        <p className="text-[10px] mt-1" style={{ color: '#fbbf24' }}>
          Nenhuma zona com valor para {simboloElemento(nutriente)} {profundidade}. Confira o vínculo zona ↔ amostra.
        </p>
      )}
    </div>
  );
}
