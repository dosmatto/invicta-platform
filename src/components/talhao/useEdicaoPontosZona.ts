'use client';

// EDIÇÃO MANUAL DOS PONTOS de uma grade dividida em ÁREAS — zona de manejo ou
// célula da amostragem composta. As duas abas fazem exatamente a mesma coisa, e
// a regra é sutil demais para viver duplicada: a correção entraria numa e não na
// outra, e o defeito só apareceria semanas depois, no campo.
//
// MOVER preserva `ordem` e o número da amostra (só muda lng/lat) — protege as
// coletas já feitas, presas por `${gradeId}__${ordem}`. O ponto fica travado
// DENTRO da sua própria área.
//
// ADICIONAR / REMOVER mudam a contagem da área, então o `área-sequencial` tem de
// fechar sem buraco: `renumerarPontosZonas` reagrupa e renumera tudo. É uma
// edição de DESENHO, feita antes de ir a campo.

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { criarValidador } from '@/lib/grid';
import { renumerarPontosZonas } from '@/lib/gradeZonas';
import { dentroGeom } from '@/lib/recomendacao/zonasGrid';
import { updateGrade, type GradeAmostragem, type PontoAmostragem, type ProfundidadeConfig } from '@/lib/store';

/** Uma área que dá o prefixo e o saco do ponto. `chave` é o que vai em
 *  `p.zona`: o rótulo da zona que o mapa mostra, ou o id da célula. Duas
 *  manchas da mesma área entram como duas entradas com a MESMA chave. */
export interface AreaDePontos {
  chave: string;
  geometry: GeoJSON.Geometry;
}

interface Params {
  /** Os pontos gerados (antes de qualquer edição). */
  pontosGrade: PontoAmostragem[];
  areas: AreaDePontos[];
  distanciaBorda: number;
  modelo: 'A' | 'B';
  profs: ProfundidadeConfig[];
  /** Grade salva aberta no mapa (o "olho"): editar parte dela, e salvar grava
   *  por cima. Sem ela, a edição é da simulação ao vivo. */
  gradeVista: GradeAmostragem | null;
  /** Recarrega a lista de grades depois de gravar. */
  aoSalvar: () => void;
}

export function useEdicaoPontosZona(p: Params) {
  const { edicaoAtiva, setEdicaoAtiva, setEdicaoModo, pontoEvent, setPontoEvent } = useApp();
  const [pontosManuais, setPontosManuais] = useState<PontoAmostragem[] | null>(null);
  const [gradeEditandoId, setGradeEditandoId] = useState<string | null>(null);

  const pontosEfetivos = pontosManuais ?? p.pontosGrade;
  const editandoPontos = edicaoAtiva && pontosManuais != null;
  // Grade LEGADA (salva antes da numeração por área): pontos sem `zona`. Add e
  // Remover reagrupariam tudo num saco só — nela, só Mover.
  const gradeSemZona = editandoPontos && pontosEfetivos.some(pt => !pt.zona);

  // Geometria por chave, para PRENDER o ponto movido dentro da sua própria área
  // (não só do talhão). Área de várias manchas junta todas: o ponto pode ir
  // para qualquer pedaço dela.
  const geomPorChave = useMemo(() => {
    const m = new Map<string, GeoJSON.Feature[]>();
    for (const a of p.areas) {
      const arr = m.get(a.chave) ?? [];
      arr.push({ type: 'Feature', properties: {}, geometry: a.geometry });
      m.set(a.chave, arr);
    }
    return m;
  }, [p.areas]);
  const geomTodas = useMemo<GeoJSON.Feature[]>(
    () => p.areas.map(a => ({ type: 'Feature', properties: {}, geometry: a.geometry })),
    [p.areas],
  );

  useEffect(() => {
    if (!pontoEvent) return;
    const profRotulos = p.profs.map(x => x.rotulo);
    setPontosManuais(prev => {
      const base = prev ?? p.pontosGrade;
      if (pontoEvent.tipo === 'mover') {
        const orig = base.find(x => x.ordem === pontoEvent.ordem);
        if (!orig) return base;
        // Se a área não existe mais (grade antiga, zoneamento trocado, células
        // regeradas), cai para o contorno de TODAS — nunca solto: melhor um
        // ponto na área vizinha que um ponto fora do talhão.
        const feats = geomPorChave.get(orig.zona ?? '') ?? geomTodas;
        const destino = feats.length
          ? criarValidador({ type: 'FeatureCollection', features: feats }, p.distanciaBorda)
              .ajustar(orig.lng, orig.lat, pontoEvent.lng, pontoEvent.lat)
          : { lng: pontoEvent.lng, lat: pontoEvent.lat };
        return base.map(x => x.ordem === pontoEvent.ordem
          ? { ...x, lng: destino.lng, lat: destino.lat, manual: true } : x);
      }
      if (base.some(x => !x.zona)) return base;   // grade legada: só Mover
      if (pontoEvent.tipo === 'remover') {
        return renumerarPontosZonas(base.filter(x => x.ordem !== pontoEvent.ordem), p.modelo, profRotulos);
      }
      if (pontoEvent.tipo === 'add') {
        // O ponto novo TEM de pertencer a uma área — é ela que dá o prefixo e o
        // saco. Fora de todas, ignora: não há como numerá-lo.
        const a = p.areas.find(x => dentroGeom(x.geometry, pontoEvent.lng, pontoEvent.lat));
        if (!a) return base;
        // Profundidade herdada de um ponto EXISTENTE (da mesma área, senão
        // qualquer um) — nunca vazia, senão o app de campo mostra 0 profundidade.
        const ref = base.find(x => x.zona === a.chave) ?? base[0];
        const prof = ref?.profundidades?.length ? ref.profundidades : profRotulos;
        return renumerarPontosZonas(
          [...base, { lng: pontoEvent.lng, lat: pontoEvent.lat, zona: a.chave, profundidades: prof }],
          p.modelo, profRotulos,
        );
      }
      return base;
    });
    setPontoEvent(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pontoEvent]);

  // Regerar (mudar parâmetro/áreas) descarta as posições manuais e sai da
  // edição. Sem isto, editar depois de mexer num slider deixava as posições
  // velhas sobre uma geração nova.
  useEffect(() => {
    setPontosManuais(null); setGradeEditandoId(null); setEdicaoAtiva(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.pontosGrade]);

  useEffect(() => () => setEdicaoAtiva(false), [setEdicaoAtiva]);

  function iniciar() {
    const base = p.gradeVista ? p.gradeVista.pontos : p.pontosGrade;
    setPontosManuais(base.map(x => ({ ...x })));
    setGradeEditandoId(p.gradeVista?.id ?? null);
    setEdicaoModo('mover');
    setEdicaoAtiva(true);
  }
  function concluir() { setEdicaoAtiva(false); }
  function descartar() { setPontosManuais(null); setGradeEditandoId(null); setEdicaoAtiva(false); }
  /** Grava as posições movidas POR CIMA da grade de origem (como a aba Grid). */
  function salvar() {
    if (!gradeEditandoId || pontosEfetivos.length === 0) return;
    updateGrade(gradeEditandoId, { pontos: pontosEfetivos, customizado: true });
    setPontosManuais(null); setGradeEditandoId(null); setEdicaoAtiva(false);
    p.aoSalvar();
  }

  return {
    pontosManuais, pontosEfetivos, editandoPontos, gradeSemZona, gradeEditandoId,
    iniciar, concluir, descartar, salvar,
  };
}
