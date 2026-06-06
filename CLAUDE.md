# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> **Next.js 16.2.7** is used here and has breaking changes vs. your training data (see `@AGENTS.md`). When unsure about an API, read `node_modules/next/dist/docs/`.

## Commands

```bash
npm run dev          # dev server on :3000 (launch config "invicta-platform")
npm run build        # next build — full production build; ALSO runs the complete TS check (~1–2 min)
npm start -- --port 3006   # serve the production build locally — reproduces Vercel (launch config "invicta-prod")
npm run lint         # eslint (eslint-config-next)
npx tsc --noEmit     # fast type-check without building
```

There is **no test framework** configured and no test files in the repo — "run a single test" does not apply. Verification is done via `npx tsc --noEmit` + `npm run build`.

## Critical project rules

- **Versioning is mandatory on every change.** Bump `src/constants/version.ts`: increment `APP_VERSION` and add a new `CHANGELOG` entry (newest first) in the *same commit*. The Configurações panel renders this changelog to users.
- **Deploy = push to `master`.** Vercel auto-deploys to https://invicta-platform.vercel.app. If a deploy doesn't appear, a TypeScript error most likely failed the build silently — run `npx tsc --noEmit`. CSS for external libs (MapLibre) must live in `globals.css`, never imported inside a component.
- UI copy and code comments are **Portuguese (pt-BR)** — match the existing language.

## Architecture (the big picture)

**Map-centric SPA living under `/painel`.** `src/app/painel/layout.tsx` renders a fixed shell — `TopBar` + `IconSidebar` + `SlidePanel` + a full-screen `MapView` — and renders the route `children` **hidden**. Routes exist only to flip the active panel.

**Navigation is React state, not URL routing.** `AppContext` (`src/context/AppContext.tsx`) is the hub.
- Each `src/app/painel/<x>/page.tsx` is a stub: it calls `setActivePanel('<x>')` in a `useEffect` and returns `null`.
- `SlidePanel` maps `activePanel` → a panel component. Detail panels use **prefixed ids**: `produtor-<id>`, `fazenda-<id>`, `talhao-<id>`. Hierarchical drill-down: `ProdutoresPanel → ProdutorDetailPanel → FazendaDetailPanel → TalhaoDetailPanel`.

**MapView is the single owner of the map** and is loaded `dynamic({ ssr: false })`. Panels never call MapLibre directly — they **publish GeoJSON through AppContext channels** and `MapView` reacts. All sources/layers are created once on `load`; data updates flow via `source.setData(...)`, never by re-adding layers.
- Panel → map data channels: `talhoesFazenda` (farm's talhões, clickable), `zonasManejo` (management zones, colored), `pontosSimulados` (sampling points), `uploadedGeo`/`uploadedBbox` (loaded boundary).
- Map → panel event channels (one-shot, consumer resets to `null`): `pontoEvent` (point edit: move/add/remove), `zonaEvent` (zone clicked).
- Highlighting/refit caveat: zone selection re-publishes `zonasManejo` with a `selecionada` flag; MapView only re-`fitBounds` when the *set* of zones changes (signature of `rotulo`s), so selecting a zone doesn't reset zoom.

**No backend — everything is `localStorage`** via `src/lib/store.ts` (keys `inv_*`, all CRUD synchronous: `getX/saveX/updateX/deleteX`). Entity graph:
`Cliente → Fazenda → Talhao` (`Talhao` holds `geojson` = boundary, `zonasGeojson` = zones, `bbox`); `Safra`; `PadraoElementos` (named element sets referencing Base Agronômica ids); `PadraoAmostragem` (density + `ProfundidadeConfig[]`); `GradeAmostragem` (a saved sampling grid — many per talhão+safra, exactly one `paraProcessar`, enforced by `marcarParaProcessar`).

**Seed** (`src/lib/seed.ts`): `seedIfEmpty()` runs once in `AppProvider`, guarded by a versioned flag (`inv_seeded_vN`). **Bump the flag** to force a re-seed in every browser (works around localStorage not syncing between localhost and Vercel). Seeds test data (Frederico/Figueira/FRNFI 21 with real geometry; Ricardo Arruda/Barrinha/JRABA 01 with zones) + fixed padrões. `ESCRITORIO_INVICTA` is the initial map center (opens in satellite mode).

## Soil sampling — the core domain feature (inside a Talhão)

Two methods selected in `components/talhao/AmostragemModulo.tsx`: **Grid** (`SimuladorAmostragem`) and **Zona de Manejo** (`SimuladorZonas`). The flow: cadastrar padrões → simular (live preview on map) → editar pontos → salvar grades → exportar / etiquetas.
- `src/lib/grid.ts` — `gerarGrid()` builds a real grid over the polygon in **local metric coords**: density (ha/point), auto rotation (longest dimension) + manual, edge distance, and **radial jitter capped at L/2** so points never cross. `criarValidador`/`pontoInterno` back manual editing and guarantee ≥1 point in small zones.
- `src/lib/zonas.ts` — `classeZona()` normalizes a class string → semaphore color (Alta green … Baixa red). Zones come from SHP/KML and may be UTM without `.prj` → reproject with proj4 (a `shpjs` dependency) to WGS84.
- `src/lib/geo.ts` — `parseKML` (via `@tmcw/togeojson`), handles UTF-8/UTF-16.
- Export `src/lib/exportGrade.ts` — KML (native) + Shapefile `.zip` (`@mapbox/shp-write`): numbered points + talhão polygon.
- Labels `src/lib/etiquetas.ts` — `jspdf`, A4 3×8 grid, large sample number + depth (QR intentionally removed). *Future: configurable Pimaco adhesive-sheet layout.*

## Conventions & gotchas

- **Styling:** Tailwind v4 + heavy inline `style={{}}` with CSS variables (`--invicta-*`, dark-blue theme). shadcn-style primitives in `src/components/ui`. Match this mixed approach rather than refactoring it.
- **MapLibre white-map-in-prod:** MapLibre's CSS forces `position:relative` on the container, nullifying Tailwind `inset-0` and collapsing height to 0. The map container sets inline `width/height:100%` to win by specificity — don't remove it.
- **OneDrive:** the repo lives under OneDrive, which (a) locks `.next` (EPERM) — kill node + delete `.next` before rebuilding if a build wedges; and (b) can prevent `Glob` from traversing the tree — prefer targeted `Read`/`Grep` or PowerShell `Get-ChildItem` for discovery.
