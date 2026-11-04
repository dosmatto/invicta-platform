'use client';

// SELETOR DE ANO do cabeçalho do talhão, com os anos que TÊM DADO na aba aberta
// destacados (Fertilidade → anos com laudo, Produtividade → anos com mapa…).
//
// Por que não é um <select>: o menu nativo do Safari/macOS ignora cor e fundo das
// <option>, então o destaque não apareceria justamente no navegador do usuário.
//
// O ano de cada dado segue a MESMA regra com que as abas filtram (store:
// `ano` gravado → ano da safra legada), para o ano destacado abrir com os dados
// dentro. Zonas não têm ano (vigência por safra ainda não existe): vale o ano em
// que o zoneamento foi gerado. NDVI: ano da data da cena.

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import {
  type Safra, getImportacoesLab, getMapasProdutividade, getGrades, getImportacoesCompactacao,
  getGradesCompactacao, getZoneamentosMeap,
} from '@/lib/store';
import { anoDaSafra, anoDeData, rotuloAno } from '@/lib/periodo';
import { listarNdviSalvos } from '@/lib/meap/gerar';
import { safrasComCenario } from '@/lib/recomendacao/cenarios';

// Abas que têm "anos com dado" e o nome que aparece na legenda do menu.
export const ABAS_COM_ANO: Record<string, string> = {
  fertilidade: 'fertilidade',
  produtividade: 'produtividade',
  amostragem: 'amostragem',
  zonas: 'zonas',
  compactacao: 'compactação',
  ndvi: 'satélite',
  recomendacoes: 'recomendação',
};

const anoDe = (x: { ano?: number; safra?: string }) => x.ano ?? (x.safra ? anoDaSafra(x.safra) : null);

async function anosComDado(talhaoId: string, aba: string): Promise<Set<number>> {
  const out = new Set<number>();
  const add = (a: number | null | undefined) => { if (a != null) out.add(a); };
  switch (aba) {
    case 'fertilidade': getImportacoesLab(talhaoId).forEach(i => add(anoDe(i))); break;
    case 'produtividade': getMapasProdutividade(talhaoId).forEach(m => add(anoDe(m))); break;
    case 'amostragem': getGrades(talhaoId).forEach(g => add(anoDe(g))); break;
    case 'compactacao':
      getImportacoesCompactacao(talhaoId).forEach(i => add(anoDe(i)));
      getGradesCompactacao(talhaoId).forEach(g => add(anoDe(g)));
      break;
    case 'zonas': getZoneamentosMeap(talhaoId).forEach(z => add(anoDeData(z.criadoEm))); break;
    case 'ndvi': (await listarNdviSalvos(talhaoId, true).catch(() => [])).forEach(c => add(anoDeData(c.data))); break;
    case 'recomendacoes': ((await safrasComCenario([talhaoId]).catch(() => null)) ?? []).forEach(s => add(anoDaSafra(s))); break;
  }
  return out;
}

export function SeletorAno({ talhaoId, aba, safras, valor, onChange, estilo }: {
  talhaoId: string;
  aba: string | null;
  safras: Safra[];
  valor: string;
  onChange: (nome: string) => void;
  estilo: React.CSSProperties;
}) {
  const [aberto, setAberto] = useState(false);
  const [resultado, setResultado] = useState<{ chave: string; anos: Set<number> }>({ chave: '', anos: new Set() });
  const raiz = useRef<HTMLSpanElement>(null);
  const rotuloAba = aba ? ABAS_COM_ANO[aba] : undefined;

  // Recalcula ao trocar de aba E ao abrir o menu (um laudo importado agora já
  // aparece destacado sem recarregar a página).
  // `resultado.chave` diz de qual talhão/aba é a resposta: enquanto não bate com
  // a atual, o menu mostra "verificando…" e não destaca nada de outra aba.
  const chave = `${talhaoId}|${aba ?? ''}`;
  useEffect(() => {
    let vivo = true;
    anosComDado(talhaoId, aba ?? '').then(anos => { if (vivo) setResultado({ chave, anos }); });
    return () => { vivo = false; };
  }, [talhaoId, aba, chave, aberto]);
  const carregando = resultado.chave !== chave;
  const comDado = carregando ? new Set<number>() : resultado.anos;

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!raiz.current?.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);

  const anoSel = anoDaSafra(valor);
  const selTemDado = anoSel != null && comDado.has(anoSel);

  return (
    <span ref={raiz} className="relative flex-shrink-0">
      <button type="button" onClick={() => setAberto(a => !a)} disabled={safras.length === 0}
        title={rotuloAba ? `Ano dos trabalhos exibidos — destacados os anos com ${rotuloAba}` : 'Ano dos trabalhos exibidos neste talhão'}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs outline-none disabled:opacity-50"
        style={{ ...estilo, ...(selTemDado ? { color: '#86efac', borderColor: '#15803d' } : {}) }}>
        {selTemDado && <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#22c55e' }} />}
        {safras.length === 0 ? '— sem ano —' : rotuloAno(valor)}
        <ChevronDown size={11} style={{ transform: aberto ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>
      {aberto && (
        <div className="absolute left-0 top-full mt-1 rounded-lg shadow-lg py-1"
          style={{ background: "#0a1f38", border: "1px solid #1a3a6b", minWidth: 150, zIndex: 2000 }}>
          {rotuloAba && (
            <p className="px-2.5 pt-1 pb-1.5 text-[9px] font-semibold uppercase tracking-wide flex items-center gap-1"
              style={{ color: '#64748b', borderBottom: '1px solid #0f2240' }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#22c55e' }} />
              {carregando ? 'verificando…' : comDado.size ? `com ${rotuloAba}` : `nenhum ano com ${rotuloAba}`}
            </p>
          )}
          {safras.map(s => {
            const ano = anoDaSafra(s.nome);
            const tem = ano != null && comDado.has(ano);
            const sel = s.nome === valor;
            return (
              <button key={s.id} type="button"
                onClick={() => { onChange(s.nome); setAberto(false); }}
                className="w-full flex items-center gap-2 px-2.5 py-1 text-xs text-left"
                style={{
                  background: sel ? '#1d4ed8' : tem ? '#052e16' : 'transparent',
                  color: tem ? '#86efac' : sel ? '#fff' : '#94a3b8',
                  fontWeight: tem || sel ? 700 : 400,
                }}
                onMouseEnter={e => { if (!sel) (e.currentTarget as HTMLElement).style.background = '#1a3a6b'; }}
                onMouseLeave={e => { if (!sel) (e.currentTarget as HTMLElement).style.background = tem ? '#052e16' : 'transparent'; }}>
                <span className="w-3 flex-shrink-0">{sel && <Check size={11} />}</span>
                <span className="flex-1">{rotuloAno(s.nome)}</span>
                {tem && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#22c55e' }} />}
              </button>
            );
          })}
        </div>
      )}
    </span>
  );
}
