# Perfil de compatibilidade — o que a plataforma Invicta JÁ TEM

Use como filtro: ao encontrar uma técnica, anote se ela (a) reusa o que existe,
(b) exige algo novo barato, ou (c) exige infraestrutura que não temos.

## Stack
- Front: Next.js 16 + MapLibre (SPA centrada no mapa), TypeScript, Vercel.
- Backend: Python FastAPI (gunicorn/uvicorn, 2 workers) no Render plano *standard*
  (CPU/RAM modestas, SEM GPU). Libs pinadas: numpy, scipy, pykrige, shapely,
  pillow, rasterio, pystac-client. Ainda NÃO há pandas/geopandas/scikit-learn/
  xgboost/lightgbm/shap — podem entrar (são CPU-only e leves); PyTorch/TensorFlow
  e GPU seriam custo novo relevante.
- Persistência: Supabase (Postgres) — grids gzip por talhão; não há PostGIS
  declarado nem feature store.

## Dados/funcionalidades existentes (por talhão)
- Sentinel-2 via STAC (`msr.py`) + CBERS-4A (`cbers.py`); robô noturno que busca
  cenas novas, aplica regras de aceite (nuvem) e grava camadas → JÁ existe série
  temporal de índices por talhão monitorado.
- Catálogo de índices (`indices.py`): NDVI, SAVI, MSAVI2, EVI2, EVI, GNDVI, NDWI,
  NDRE, NDMI, VARI, ExG, GLI (bandas blue/green/red/nir/rededge/swir).
- MDE/relevo (`mde.py`): altitude, análise de terreno.
- Mapa de colheita (`colheita.py`): pipeline de limpeza portado do QGIS da Invicta
  (filtro bruto, operacional, correção entre colhedoras, MapFilter global + local
  anisotrópico, ajuste à média real) + interpolação IDW → variável-alvo limpa.
- Fertilidade: pontos de amostragem de solo (grid / zona / composta) + laudos →
  krigagem ordinária automática (`interp.py`) com validação cruzada LOO → mapas
  de argila, MO, pH, P, K, Ca, Mg, Al, CTC, V% etc.
- Condutividade elétrica aparente (CEa) rasa/profunda como "variável fixa do talhão".
- Zonas de manejo (MEAP) multivariáveis; módulo de IA generativa para diagnóstico.
- Hierarquia Cliente → Fazenda → Talhão → Safra.

## Regime de dados (informado pelo usuário)
- 20–100 talhões-safra de soja com mapa de colheita. Muitos pixels, POUCAS safras
  e poucos talhões independentes. Clima: ainda não há ingestão (ERA5/NASA
  POWER/CHIRPS seriam novos). Manejo (cultivar, data de semeadura, população):
  disponibilidade parcial/incerta.

## Alvo do MVP
- Soja, Brasil, grid 20×20 m, alvo kg/ha, previsão pré-colheita intra-talhão,
  com incerteza e explicabilidade (SHAP). Deep Learning só se a evidência justificar.
