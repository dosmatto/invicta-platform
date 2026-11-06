# Portal do Produtor v2 — onde fica cada peça

Somente leitura, para o produtor (e para owner/admin em "ver como o produtor vê", `?cliente=&plano=`).

| Peça | Arquivo |
|---|---|
| Shell (gate produtor/preview, menu, cabeçalho, tema) | `app/portal/layout.tsx` → `shell/PortalShell.tsx` |
| Itens do menu, título/subtítulo de cada página, seções do plano, aba do talhão | `shell/menu.ts` (`ITENS_MENU`, `itemLiberado`) |
| Guarda de plano POR ROTA (a única; o shell aplica a toda página) | `shell/GuardaPlano.tsx` |
| Contexto (cliente, filtros, talhões, dados, navegação) | `PortalContext.tsx` (`usePortal()`) |
| Kit visual | `ui/*` (importe de `../ui` ou `@/components/portal/ui`) |
| Mini-mapa leve/real + camadas reais prontas | `ui/MiniMapa.tsx`, `ui/camadasReais.ts` |
| Contas puras (KPIs, classes, alertas, Pearson, projeção) | `lib/portalPainel.ts` — teste `node scripts/teste-portal-painel.mjs` |
| Unidade da produtividade (kg/ha · sc/ha · sc/alq; `p.unidade`, padrão kg/ha) — números chegam em sc/ha, converta só na tela | `lib/portalUnidade.ts` (`fmtScHa`, `deScHa`, `classesNaUnidade`) — teste `node scripts/teste-portal-unidade.mjs`; preferência em `ui/unidadeProd.ts` |
| Coleta dos dados (aparelho + nuvem leve) | `lib/portalDados.ts` (`dadosLocaisPortal`, `dadosNuvemDosTalhoes`) |
| Benchmark (POST /api/portal/benchmark) — um hook só para o cartão e a página | `useBenchmark.ts` (`useBenchmark`, `benchDaCultura`), cartão e `AvisoBenchmark` em `visao/CartaoBenchmark.tsx` |
| Visão geral | `visao/VisaoGeral.tsx` |
| Talhões (lista + matriz talhão × ano) | `talhoes/PaginaTalhoes.tsx`, `talhoes/MatrizTalhaoAno.tsx` |

## Página nova (ex.: `/portal/zonas`)

Crie `app/portal/<rota>/page.tsx` (todas as rotas do menu já têm página) e ponha o conteúdo
(em arquivos próprios, ex.: `components/portal/zonas/PaginaZonas.tsx`):

```tsx
'use client';
import { usePortal } from '@/components/portal/PortalContext';
import { Cartao, Kpi, MiniMapa, LegendaClasses, Vazio, camadaZonas } from '@/components/portal/ui';

export function PaginaZonas() {
  const p = usePortal();            // p.dados = talhões no filtro (1 só se Talhão = um)
  const um = !!p.talhao;            // visão de UM talhão: mostre só ele, modo real natural
  // números: funções puras de lib/portalPainel (resumoZonas, kpisPainel…)
  // mapa:    <MiniMapa talhoes={…} corDe={id => …} camadaReal={useCallback(id => camadaZonas(…), […])}
  //          onClicar={id => um ? p.abrirTalhao(id, 'zonas') : p.setFiltro({ talhao: id })} />
  // links:   p.hrefPortal('/portal/prescricoes') mantém filtros + preview
  // plano:   a ROTA já é barrada pelo shell (GuardaPlano, a partir de ITENS_MENU[].secoes);
  //          p.liberada('recomendacoes') etc. só para recortes DENTRO da página
}
```

Regras:
- **Título e subtítulo** vêm de `ITENS_MENU` (não repita `<h1>` na página).
- **Nada inventado**: sem dado → `<Vazio titulo="Sem … nesta safra" />`. Sem nuvem (bancada) → diga que o dado fica na nuvem.
- **Cores só por token** (`COR.*`, `var(--…)`): o portal tem tema claro/escuro (`styles/portal-tema.css`).
- **Rasters** só pelo `MiniMapa` em modo real (carrega quando visível, um por vez, com cache). `camadaReal` precisa ser estável (`useCallback`).
- **Zonas**: `d.zonasFc` / `talhao.zonasGeojson`. Nunca `getZoneamentosMeap` em laço (ele grava).
- **Plano**: não embrulhe a página num bloqueio próprio — ponha `secoes` no item de `ITENS_MENU` (basta uma estar no plano) e a `GuardaPlano` do shell cuida do menu e da URL digitada.
- **Séries de NDVI/NDRE** usam o ciclo da colheita do ano (jul/A−1 → jun/A, rótulo "25/26" no filtro 2026: `janela 'ciclo'`, `cicloDeData`/`rotuloCiclo` em `lib/portalPainel`); os demais cartões seguem o ano civil do app.
- Filtros na URL: `?safra=&fazenda=&cultura=&talhao=` (+ `cliente`/`plano` no preview). Troque com `p.setFiltro({...})`.
