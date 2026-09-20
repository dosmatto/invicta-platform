# Fontes de Dados — Predição de Produtividade

> Insumo desta análise: a trilha local de auditoria do eixo G (Parte 1 — fontes de dados acionáveis para o grid de 20 m), **não versionada** (texto bruto de páginas de terceiros), com contexto adicional da cópia versionada [`../product/perfil-compatibilidade.md`](../product/perfil-compatibilidade.md) (stack e dados já existentes na plataforma). 32 fontes **orbitais e públicas** catalogadas em [`fontes-dados.csv`](./fontes-dados.csv) (IDs `FD-01` a `FD-32`), com licença, latência e cobertura Brasil. A §4b acrescenta **`FD-33` a `FD-36`** — drones RGB e multiespectrais, imagens térmicas e mapas de CEa, nomeados na seção 13 do pedido. Esses quatro **não estão no CSV**: não são fontes públicas com provedor e licença, e sim modalidades de aquisição própria, para as quais as colunas do CSV não se aplicam.

## EVIDÊNCIA central deste documento

**[EVIDÊNCIA — catálogo de fontes, não literatura]** Nenhuma fonte gratuita de imagem óptica ou de clima chega perto do grid-alvo de 20 m com revisita útil ao mesmo tempo. Toda a família de reanálise/climatologia gratuita opera em grades de **~5 km [FD-15] a ~28 km [FD-11]** — ordens de grandeza maior que um talhão — e serve apenas para contexto regional/safra, nunca para diferenciar condições dentro do talhão. A faixa é derivada das linhas com resolução verificada: CHIRPS 0,05° (~5 km) [FD-15]; ERA5-Land 0,1° (~9 km) [FD-12]; AgERA5 0,1° (~10 km) [FD-13]; GPM IMERG 0,1° (~10 km) [FD-16]; BR-DWGD 0,1° (~10 km na v2022) [FD-18]; MERGE/CPTEC 0,1° (~10-11 km) [FD-19]; ERA5 0,25° (~28 km) [FD-11]. O NASA POWER [FD-14] seria ~0,5° (~50 km), mas esse valor está marcado como **pendência de verificação** neste documento e por isso **não** entra na faixa.

---

## 1. Imagens (sensoriamento remoto)

| ID | Nome / Provedor | Variáveis | Resolução espacial | Resolução temporal | Cobertura temporal | Latência | Cobertura Brasil | Licença | Custo | Biblioteca Python | Doc |
|---|---|---|---|---|---|---|---|---|---|---|---|
| FD-01 | Sentinel-2 L2A — ESA/Copernicus (via STAC Element84/AWS, Copernicus Data Space, Planetary Computer) | 13 bandas espectrais (visível, red-edge, NIR, SWIR), refletância de superfície | 10 m (4 bandas), 20 m (6 bandas), 60 m (3 bandas) | ~5 dias (2 satélites) | 2015-presente | horas a poucos dias | sim, global | Copernicus open data — **uso comercial permitido** | gratuito | `pystac-client` (já pinada), `planetary-computer`, `sentinelhub` | [doc](https://documentation.dataspace.copernicus.eu/) |
| FD-02 | Sentinel-2 via Copernicus Data Space Ecosystem | mesmas bandas do S2 L2A + Sentinel-1/3, DEM | 10-60 m (S2), varia por coleção | ~5 dias | 1999-presente (varia por missão) | poucas horas (S2 L2A) | sim | gratuito (Copernicus) | gratuito | `pystac-client`, `openeo` | [doc](https://documentation.dataspace.copernicus.eu/APIs/STAC.html) |
| FD-03 | Sentinel-2 via Microsoft Planetary Computer | refletância de superfície L2A, COG | 10-60 m | ~5 dias | 2016-presente | poucas horas | sim | Creative Commons/Copernicus | gratuito (compute pago se usar o Hub) | `pystac-client`, `planetary-computer`, `odc-stac` | [doc](https://planetarycomputer.microsoft.com/dataset/sentinel-2-l2a) |
| FD-04 | HLS (Harmonized Landsat Sentinel-2) — NASA (LP DAAC/Earthdata) | refletância harmonizada Landsat 8/9 + Sentinel-2 | 30 m | 2-3 dias (até 1,4 dia com 5 satélites em 2025) | Landsat 8 desde 2013, S2 desde 2015 | não confirmado (produto HLS-LL de baixa latência previsto para 2027) | sim, global exceto Antártida | dados públicos NASA/Copernicus | gratuito | `pystac-client`, `earthaccess` | [doc](https://hls.gsfc.nasa.gov/) |
| FD-05 | Landsat 8/9 Collection 2 — USGS | 11 bandas incl. termal | 30 m (multiespectral), 15 m (pancromática), 100 m (termal) | 16 dias (8 dias combinando 8+9) | 1982-presente (série completa); 8/9 desde 2013/2021 | horas a poucos dias | sim | domínio público USGS | gratuito | `pystac-client`, `landsatxplore` | [doc](https://www.usgs.gov/landsat-missions) |
| FD-06 | Sentinel-1 GRD/RTC (SAR) — ESA/Copernicus | retroespalhamento VV/VH (GRD) ou corrigido para terreno (RTC) | ~10 m (modo IW) | ~6-12 dias (variável após perda do Sentinel-1B) | 2014-presente | horas a poucos dias | sim | gratuito (Copernicus) | gratuito | `pystac-client`, `asf_search` | [doc](https://planetarycomputer.microsoft.com/dataset/sentinel-1-grd) |
| FD-07 | CBERS-4A — INPE (data.inpe.br STAC / Brazil Data Cube) | WFI (4 bandas, 55 m), MUX (4 bandas, 16,5 m), WPM (pan 2 m + multiespectral 8 m) | 55 m (WFI) / 16,5 m (MUX) / 2-8 m (WPM) | 31 dias (WFI) / 5 dias (MUX) | 2019-presente | dias (sem SLA formal divulgado) | sim — satélite sino-brasileiro, prioridade de cobertura no Brasil | distribuição livre INPE | gratuito | `pystac-client`, `wtss` (INPE) | [doc](https://data.inpe.br/stac/browser/) |
| FD-08 | PlanetScope (+ NICFI) — Planet Labs | 8 bandas (SuperDove), refletância de superfície | 3 m | quase diário | 2016-presente (arquivo comercial) | horas | sim; NICFI cobre só floresta tropical, uso não comercial | **licença comercial (PlanetScope)**; NICFI gratuito só para monitoramento não comercial de floresta tropical | pago — ordem mínima de 250 km², histórico ~US$1,80/km² (2023) ou por hectare monitorado | `planet` (SDK oficial), `sentinelhub` | [doc](https://www.planet.com/pricing/) |
| FD-09 | MODIS (Terra/Aqua) — NASA (LP DAAC) | índices de vegetação (NDVI/EVI), refletância, LST | 250 m (MOD13Q1) / 500 m (MCD43A4) | 16 dias / diário | 2000-presente (Terra), 2002-presente (Aqua) | ~1 dia (near real-time) a poucos dias | sim, global | domínio público NASA | gratuito | `earthaccess`, `pymodis` | [doc](https://www.earthdata.nasa.gov/data/instruments/modis/near-real-time-data) |
| FD-10 | VIIRS — NOAA/NASA | índices de vegetação, similar ao MODIS | 375-500 m | diário a 16 dias | 2012-presente (sucessor do MODIS) | poucos dias | sim | domínio público | gratuito | `earthaccess` | [doc](https://www.earthdata.nasa.gov/sensors/viirs) |

**Limitações para uso intra-talhão:** Sentinel-2/CBERS MUX (10-16,5 m) são as opções ópticas gratuitas mais próximas do grid de 20 m; bandas de 20-60 m do Sentinel-2 limitam índices como NDRE/SWIR na resolução alvo. MODIS/VIIRS (250-500 m) e HLS/Landsat (30 m) só servem como contexto regional/fenologia, não como mapa intra-talhão. PlanetScope (3 m) é a única opção realmente sub-20 m, mas é comercial e paga por hectare monitorado — inviável para uso amplo no MVP sem orçamento dedicado. Sentinel-1 (SAR) é o único sensor gratuito que atravessa nuvens, relevante para a janela chuvosa da soja, mas exige processamento de speckle e interpretação diferente da equipe de agronomia. [FD-01, FD-06, FD-07, FD-08, FD-09]

---

## 2. Clima

| ID | Nome / Provedor | Variáveis | Resolução espacial | Resolução temporal | Cobertura temporal | Latência | Cobertura Brasil | Licença | Custo | Biblioteca Python | Doc |
|---|---|---|---|---|---|---|---|---|---|---|---|
| FD-11 | ERA5 (reanálise) — ECMWF/Copernicus CDS | temperatura, vento, pressão, precipitação, radiação e dezenas de outras | ~0,25° (~28 km) | horária | 1940-presente | ~5 dias | sim, global | Copernicus open licence — uso comercial permitido com atribuição | gratuito | `cdsapi` | [doc](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels) |
| FD-12 | ERA5-Land — ECMWF/Copernicus CDS | temp. solo/ar, precipitação, umidade, evapotranspiração, radiação | ~0,1° (~9 km) | horária | 1950-presente | similar ao ERA5, poucos dias | sim | Copernicus open licence | gratuito | `cdsapi` | [doc](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land) |
| FD-13 | AgERA5 — Copernicus CDS/JRC | 22 variáveis agrometeorológicas diárias (temp., precipitação, ETo, radiação, déficit de pressão de vapor etc.), corrigidas para topografia fina | ~0,1° (~10 km), regressão para topografia | diária | 1979-presente | poucos dias | sim | Copernicus open licence | gratuito | `cdsapi`, `agera5tools` | [doc](https://cds.climate.copernicus.eu/datasets/sis-agrometeorological-indicators) |
| FD-14 | NASA POWER — NASA Langley | radiação solar, temperatura, precipitação, umidade, vento (séries prontas p/ uso agrícola) | **~0,5° (~50 km) — PENDÊNCIA DE VERIFICAÇÃO, ver seção abaixo** | diária, horária, climatologia mensal/anual | 1981-presente (varia por parâmetro) | não confirmado nesta sessão | sim | dados públicos NASA, sem cadastro | gratuito | `requests` (API REST simples, sem SDK dedicado) | [doc](https://power.larc.nasa.gov/docs/services/api/) |
| FD-15 | CHIRPS — Climate Hazards Center (UCSB) | precipitação | 0,05° (~5 km) | diária (também pentadal/mensal) | 1981-presente | rápida (GTS) ~2 dias; final (com estações) ~3ª semana do mês seguinte | sim, quase global (50S-50N) | domínio público, atribuição solicitada | gratuito | `requests`, `xarray` | [doc](https://www.chc.ucsb.edu/data/chirps) |
| FD-16 | GPM IMERG — NASA/JAXA | taxa de precipitação | 0,1° (~10 km) | 30 min (agregável) | 2000-presente | Early ~4h, Late ~14h, Final ~3,5 meses | sim, quase global | domínio público NASA | gratuito | `earthaccess`, `h5py`/`xarray` | [doc](https://gpm.nasa.gov/data/imerg) |
| FD-17 | INMET — estações automáticas / BDMEP | temperatura, precipitação, umidade, vento, pressão, radiação (por estação) | pontual (rede de estações, densidade variável) | horária (automáticas) / diária (BDMEP histórico) | séries históricas de décadas (varia por estação) | horas (estações automáticas) | sim — fonte primária nacional, mas densidade baixa no interior agrícola | dados públicos, uso livre | gratuito | `requests` + parsing (sem SDK oficial robusto; wrappers não oficiais no GitHub) | [doc](https://bdmep.inmet.gov.br/) |
| FD-18 | Xavier et al. — BR-DWGD (Brazilian Daily Weather Gridded Data) | precipitação, temp. máx/mín, radiação solar, umidade relativa, vento a 2 m, ETo | 0,1° (~10 km) na versão 2022 (versão original 2016 era 0,25°) | diária | 1961-2020 (precipitação estendida até 2022) | não operacional — série histórica reprocessada | sim — calibrado especificamente para o Brasil (3.625+ pluviômetros, 735+ estações) | **uso acadêmico/público — termos exatos de redistribuição NÃO confirmados, ver pendência abaixo** | gratuito | `xarray`, `rasterio` | [doc](https://github.com/AlexandreCandidoXavier/BR-DWGD) |
| FD-19 | MERGE/CPTEC — CPTEC/INPE | precipitação | 0,1° (~10-11 km), América do Sul | diária (desde jun/2000) e horária (desde jan/2010) | 2000-presente (diário), 2010-presente (horário) | operacional, atualização rotineira (latência exata não detalhada na doc consultada) | sim — produto operacional nacional | dados públicos INPE/CPTEC | gratuito | `requests`/`ftplib`, `xarray` (grib2) | [doc](https://product-user.readthedocs.io/pt/latest/) |

**Limitações para uso intra-talhão:** toda a família de reanálise/climatologia gratuita opera em grades de **~5 km [FD-15] a ~28 km [FD-11]** (NASA POWER [FD-14] seria ~50 km, valor não verificado — ver pendências) — muito maior que um talhão típico (dezenas a poucas centenas de hectares). **Nenhuma delas diferencia condições dentro do talhão**; servem só como contexto regional/safra. ERA5-Land/AgERA5 (~9-10 km) são as opções mais finas entre as gratuitas. BR-DWGD tem a melhor calibração histórica para o Brasil, mas termina em 2020/2022 — não serve para clima da safra corrente, só para normais climatológicas. INMET é pontual e de baixa densidade no interior agrícola; melhor uso é como verdade-de-campo para calibrar/validar produtos de grade, não como fonte primária. [FD-11 a FD-19]

---

## 3. Relevo

| ID | Nome / Provedor | Variáveis | Resolução espacial | Cobertura temporal | Cobertura Brasil | Licença | Custo | Biblioteca Python | Doc |
|---|---|---|---|---|---|---|---|---|---|
| FD-20 | SRTM — NASA/USGS | altitude | 30 m (v3 global) / 90 m (original fora dos EUA) | aquisição única (fev/2000) | sim, 60N-56S | domínio público | gratuito | `rasterio`, `elevation` | [doc](https://www2.jpl.nasa.gov/srtm/) |
| FD-21 | Copernicus DEM GLO-30 — ESA/Copernicus | altitude (DSM) | 30 m | dados TanDEM-X 2011-2015, estático | sim, global | licença Copernicus DEM gratuita (GLO-30); alguns tiles nacionais restritos | gratuito | `pystac-client`, `rasterio` | [doc](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Data/DEM.html) |
| FD-22 | ALOS AW3D30 — JAXA | altitude (DSM, originado de 5 m reamostrados) | 30 m | aquisição 2006-2011 (mosaico estático) | sim, global | licença JAXA — uso gratuito com registro, **redistribuição restrita** | gratuito | `rasterio` | [doc](https://www.eorc.jaxa.jp/ALOS/en/dataset/aw3d30/aw3d30_e.htm) |
| FD-23 | FABDEM — Univ. Bristol/Fathom | altitude (terreno nu, vegetação/edificações removidas do Copernicus DEM) | 30 m (1 arco-segundo) | derivado do Copernicus DEM (TanDEM-X 2011-2015) | sim, global | **Creative Commons BY-NC-SA 4.0 — NÃO permite uso comercial** | gratuito (só uso não comercial) | `rasterio` | [doc](https://data.bris.ac.uk/data/dataset/s5hqmjcdj8yo2ibzi9b4ew3sn) |
| FD-24 | NASADEM — NASA (LP DAAC) | altitude (reprocessamento do SRTM + fusão ICESat/ASTER) | 30 m (1 arco-segundo) | reprocessamento único dos dados de 2000 | sim, 60N-56S | domínio público | gratuito | `earthaccess`, `rasterio` | [doc](https://lpdaac.usgs.gov/products/nasadem_hgtv001/) |

**Destaque de licença:** **FABDEM (FD-23) é o DEM mais preciso em áreas com vegetação residual, mas sua licença CC BY-NC-SA bloqueia uso comercial** — inviável para o produto Invicta em produção sem negociar o FABDEM+ (versão comercial paga da Fathom). ALOS AW3D30 tem redistribuição restrita pela licença JAXA (verificar antes de embutir em produto).

**Limitações para uso intra-talhão:** entre os DEMs gratuitos e comerciáveis, **NASADEM** teve o menor MAE relatado em terreno plano (~1,6 m) em estudo comparativo, e **Copernicus DEM GLO-30** tem a menor incerteza vertical absoluta documentada (<4 m LE90) entre os testados — mas nenhum dos dois captura microrrelevo de poucos centímetros relevante para drenagem intra-talhão. [FD-20 a FD-24]

---

## 4. Solo

| ID | Nome / Provedor | Variáveis | Resolução espacial | Cobertura temporal | Cobertura Brasil | Licença | Custo | Biblioteca Python | Doc |
|---|---|---|---|---|---|---|---|---|---|
| FD-25 | SoilGrids 250m — ISRIC | 14 propriedades (carbono orgânico, pH, textura, CTC, nitrogênio etc.) em 6 profundidades | 250 m | última versão major 2020 (v2.0), sem cronograma de atualização contínua | sim, global — densidade de amostras de treino desigual no interior do Brasil | Creative Commons BY 4.0 — uso comercial permitido com atribuição | gratuito | `rasterio`, `owslib` (WCS), `soilgrids` (não oficial) | [doc](https://www.isric.org/explore/soilgrids) |
| FD-26 | Embrapa PronaSolos | 8 atributos em 6 profundidades até 2 m; mapas pedológicos tradicionais | 90 m (atributos), 1 km (estoque de carbono), 1:25.000-1:100.000 (levantamentos detalhados) | programa plurianual (meta 1,3 milhão km² em 10 anos, 6,9 milhões km² até 2048) — cobertura detalhada ainda parcial | sim — programa oficial brasileiro, mas cobertura em escala fina ainda incompleta | dados públicos Embrapa | gratuito | `rasterio`, `geopandas` | [doc](https://www.pronasolos.embrapa.br/) |
| FD-27 | HYBRAS (Hydrophysical Database for Brazilian Soils) | retenção de água no solo, condutividade hidráulica saturada, textura, carbono orgânico — por perfil pontual | pontual (445 sítios/1.075 amostras na v1; ~8.546 amostras na v2), cobre 15 de 26 estados na v1 | compilação de décadas de publicações, sem atualização programada | parcial — 15 de 26 estados na v1 | dados de pesquisa acadêmica — **termos de uso por publicação de origem não checados individualmente** | gratuito (uso acadêmico) | `pandas` (sem lib dedicada conhecida) | [doc](https://soil-modeling.org/resources-links/data-portal/hybras) |

**Limitações para uso intra-talhão:** **SoilGrids 250 m não resolve a variabilidade intra-talhão** capturada pela krigagem própria da Invicta a partir de amostras de solo (`interp.py`) — cross-validation do SoilGrids explica em média 61% da variância (56-83% conforme o atributo), com viés conhecido (superestima carbono orgânico baixo, subestima pH em alguns países) [FD-25]. PronaSolos (90 m/1 km) tem a mesma limitação de resolução e cobertura detalhada ainda incompleta no Brasil [FD-26]. HYBRAS é pontual e esparso — útil só para calibrar funções de pedotransferência (converter textura/CO já medidos nos laudos em capacidade de água disponível), não para mapear um talhão sem amostragem própria [FD-27].

---

## 4b. Sensoriamento de proximidade e aerotransportado — drones, térmico e mapas de CEa

A seção 13 do pedido nomeia, sob "Sensoriamento remoto", **drones RGB**, **drones multiespectrais**
e **imagens térmicas**, e sob "Solo", **mapas de condutividade elétrica**. As quatro não estavam
cobertas pelas tabelas acima, que catalogam apenas fontes **orbitais e públicas**. Esta subseção
fecha a lacuna com **o que a base revisada, os briefs de eixo e o perfil da plataforma sustentam —
e nada além disso**.

> **Natureza diferente das FD-01 a FD-32.** Estas quatro não são *fontes públicas com licença,
> latência e cobertura Brasil*: são **modalidades de aquisição própria**. Não há provedor a
> consultar, e por isso não recebem as mesmas colunas. O que existe de verificável é (i) quais
> estudos da base as usaram e com que resultado, e (ii) se a plataforma já as produz.

| ID | Modalidade | O que a base revisada registra | Existe na plataforma? | Situação no MVP |
|---|---|---|---|---|
| **FD-33** | **Drone / câmera RGB de alta resolução** | `[A-06]` — soja, Canadá, 450 *plots*, câmera *handheld* RGB de alta resolução em 3 datas + informação de semente, com ViT + transformer temporal: RMSE 332,07 kg/ha e R² 0,664, contra CNN-LSTM 481,19 / 0,295 (split fixo de *plots*, validação V5). `[H-01, só abstract]` — trigo, México, câmera RGB em UAS, com GWR. **É a condição (c) de vitória do Deep Learning identificada em `../decisions/ADR-001-model-strategy.md` D1: imagem bruta de alta resolução por parcela.** | **Não.** A plataforma opera com satélite de terceiros; não há hardware de campo `[F-comercial-09]`, `[F-comercial-13]`, `[F-comercial-22]` | **Fora do MVP.** É a rota de reentrada **R3** de D1 (aquisição regular de imagem ≤ 1 m por talhão). `infra_nova` |
| **FD-34** | **Drone multiespectral** | `[C-14]` (*proceedings*, sem DOI) — soja, Japão, 7 talhões, 4 safras, UAV multiespectral; é o estudo com o **desenho de validação mais correto da base** (CV aleatória × CV espacial × LOFO-CV, todos contra talhão independente), mas reporta conclusão só qualitativa. `[H-06, só abstract]` usa UAV multiespectral dentro da fusão multimodal | **Não** | **Fora do MVP.** `infra_nova` |
| **FD-35** | **Imagem térmica** | Orbital: a banda térmica do Landsat 8/9 a **100 m** já está em `FD-05`, e o LST do MODIS a 250–500 m em `FD-09` — nenhuma das duas resolve o grid de 20 m. `[A-10]` (soja, condado, EUA) e `[E-brasil-04]` (soja, Paraná, município) usam LST do MODIS **em escala agregada**. Por UAV: `[H-06, só abstract]` — soja, EUA, fusão RGB + multiespectral + térmico com DNN-F2, R² 0,720 e rRMSE 15,9%, esquema de validação **não declarado** | **Parcial** — apenas o que vem embutido em Landsat (`FD-05`), não usado hoje | **Fora do MVP** como camada intra-talhão. `[LACUNA — não pesquisado nesta fase]` a especificação de câmeras térmicas de UAV (modelo, GSD, custo, calibração): a base não traz, e não foi pesquisado |
| **FD-36** | **Mapa de condutividade elétrica aparente (CEa)** | A fonte mais citada da base neste tema: `[D-03]` (revisão fundacional, EUA — indução eletromagnética e contato direto tipo Veris) registra que a CEa *"often, but not always"* se relaciona à produtividade, por ser medida **integradora** de textura, água, matéria orgânica e salinidade. `[D-02]` (Veris 3100, raso + profundo, EUA): CEa isolada R² 0,21 > topografia 0,17, combinadas 0,32, e em 6 de 9 *site-years* a CEa venceu a topografia — **mas com relação negativa** em Kansas/Missouri. `[D-09, só abstract]` combina CEa + MDE, amostrando em grid de 35×35 m para predizer em 5×5 m. `[D-11, só abstract]` (Veris 3100, Guarapuava-PR, Latossolo Bruno) encontra correlação **negativa** entre CEa e produtividade de soja, sem R² reportado | **SIM — a plataforma já produz.** CEa rasa e profunda como "variável fixa do talhão" (`inv_condutividade`, com versões por talhão e versão oficial) | **Dentro do MVP como feature candidata**, prioridade **P2** da ablação de D2 — não como requisito. O sinal existe mas **muda de direção conforme o solo**, o que é exatamente o que a ablação precisa medir. `reusa` |

**`[LACUNA — não pesquisado nesta fase]`** Para FD-33, FD-34 e FD-35 **não** foram levantados:
provedores de serviço de voo no Brasil, modelos e GSD de câmera, custo por hectare, exigências
regulatórias (ANAC/DECEA), nem janela operacional em safra de verão. A base revisada não traz esses
dados e **nenhuma busca foi feita** — declará-los seria invenção. Se a rota R3 de D1 for aberta,
isso vira trabalho de pesquisa próprio.

**`[LACUNA — não pesquisado nesta fase]`** A seção 13 também nomeia, em "Relevo", *modelos locais
de maior resolução* (aerolevantamento, LiDAR, RTK) e, em "Clima", *estações locais / pluviômetros
próprios*. Nenhum dos dois tem entrada própria acima: a base revisada não contém estudo que os
avalie para predição de produtividade intra-talhão, e não há levantamento de fornecedor, custo ou
cobertura. O que existe é o registro indireto de que a resolução de 30 m dos DEMs públicos **não
captura microrrelevo de poucos centímetros relevante para drenagem intra-talhão** (§3) e de que a
rede do INMET tem densidade baixa no interior agrícola (`FD-17`).

---

## 5. Datasets abertos de produtividade

| ID | Nome / Provedor | O que é | Resolução | Cobertura Brasil / soja | Licença | Custo | Biblioteca Python | Doc |
|---|---|---|---|---|---|---|---|---|
| FD-28 | CropHarvest — Stanford/NASA Harvest | pontos rotulados de cultura (crop/não-crop, classes FAO incl. oleaginosas), pareados com S1/S2/SRTM/ERA5 — **classificação, não produtividade** | variável (harmoniza 20 datasets) | cobertura global heterogênea; presença no Brasil **não confirmada em detalhe nesta sessão** | Creative Commons BY-SA 4.0 — uso comercial permitido | gratuito | `cropharvest` (`pip install`) | [doc](https://github.com/nasaharvest/cropharvest) |
| FD-29 | EuroCrops — dida-do/DLR | polígonos de talhão + tipo de cultura autodeclarado (subsídio PAC), 16 países da UE | vetorial, escala de talhão real | não cobre o Brasil; sem soja em volume relevante | Creative Commons BY-SA 4.0 | gratuito | `geopandas` | [doc](https://github.com/maja601/EuroCrops) |
| FD-30 | CY-Bench (AgML Crop Yield Benchmark) — comunidade AgML/WUR | estatísticas de produtividade subnacional + preditores (clima, RS, ET, umidade, solo) para **milho e trigo** | subnacional (>25 países) | **não inclui Brasil de forma explícita nem soja** | **licença marcada como NOASSERTION no GitHub — verificar antes de uso comercial** | gratuito | pacote `agml` (do próprio repositório) | [doc](https://github.com/wur-ai/agml-cy-bench) |
| FD-31 | SustainBench (Crop Yield Prediction) — Stanford Sustainability and AI Lab | yield de **soja** por condado/município (t/ha) + histogramas espectrais/temperatura derivados de MODIS | condado/município (agregado), MODIS como entrada | **inclui Brasil explicitamente (32 municípios), além de EUA (857) e Argentina (135)** | implementação de referência (TorchGeo) sob MIT; **licença dos dados originais de produção não confirmada em detalhe** | gratuito | `torchgeo` (`SustainBenchCropYield`), `requests` | [doc](https://sustainlab-group.github.io/sustainbench/docs/datasets/sdg2/crop_yield.html) |
| FD-32 | KBS LTER (USDA/MSU) — mapas de colhedora | pontos de produtividade georreferenciados brutos de colhedora (milho, soja, trigo em rotação), 1996-2013 | pontual de alta densidade (dado bruto pré-limpeza) | **não cobre o Brasil** (Michigan, EUA) | dados públicos USDA/LTER — verificar termos exatos no registro antes de redistribuir | gratuito | `pandas`, `geopandas` | [doc](https://data.nal.usda.gov/dataset/precision-agriculture-yield-monitoring-row-crop-agriculture-kellogg-biological-station-hickory-corners-mi-1996-2013) |

**[RESULTADO ESPECÍFICO]** Nenhum dataset aberto combina exatamente soja + Brasil + escala intra-talhão. **SustainBench (FD-31)** é o candidato mais próximo — soja, inclui 32 municípios do Brasil — mas é agregado a nível de município com entrada MODIS grosseira, útil só para pré-treino/sanity-check de ordem de grandeza. **CY-Bench (FD-30)** é o benchmark mais ativo e metodologicamente melhor desenhado, mas cobre só milho/trigo, sem soja nem Brasil — valor está na metodologia de harmonização espaço-temporal, não como dado direto. **CropHarvest (FD-28)** classifica cultura, não produtividade. **EuroCrops (FD-29)** é só Europa. O dataset de colhedora do **KBS LTER (FD-32)** tem soja em rotação com dados brutos de GPS, mas é de Michigan/EUA — útil para testar o pipeline de limpeza (`colheita.py`) contra um dataset público independente, não para treinar o modelo do Brasil.

---

## Recomendação para o MVP

**[RECOMENDAÇÃO — a formalizar em ADR]** *(`ADR-002-satellite-source`; ver [`../product/recomendacoes-arquitetura.md`](../product/recomendacoes-arquitetura.md) §17)* — priorização por já existir na plataforma vs. o que precisa ser ingerido, seguindo [`../product/perfil-compatibilidade.md`](../product/perfil-compatibilidade.md) (stack Python CPU-only no Render, sem GPU; libs pinadas: numpy, scipy, pykrige, shapely, pillow, rasterio, pystac-client).

### Já existe na plataforma (reusa)

- **Imagens ópticas via STAC**: Sentinel-2 (`msr.py`) e CBERS-4A (`cbers.py`) já em produção, com robô noturno de aceite por nuvem — cobrem FD-01/FD-02/FD-03 e FD-07.
- **Catálogo de índices espectrais** (`indices.py`): NDVI, SAVI, MSAVI2, EVI2, EVI, GNDVI, NDWI, NDRE, NDMI, VARI, ExG, GLI — já consome as bandas de FD-01/FD-07.
- **Relevo (`mde.py`)**: no modo `auto`, a ordem de fontes é **`cop30 → srtm`** — ou seja, **Copernicus DEM GLO-30 (FD-21) é o primário**, e o próprio código rotula a fonte de fallback como "NASADEM/SRTM (30 m)" (tiles skadi). O baseline, portanto, **já é o DEM com a menor incerteza vertical absoluta documentada** entre os testados (<4 m LE90, ver §3), e **não há upgrade *drop-in* para NASADEM**: seria redundante. O que resta como avaliação de escopo menor é trocar os tiles skadi pelo produto **NASADEM oficial (FD-24, LP DAAC)** como fallback, já que é ele que reporta o menor MAE em terreno plano — sem mexer no primário.
- **Solo (`interp.py`)**: krigagem própria a partir de laudos de amostragem já supera SoilGrids (FD-25) e PronaSolos (FD-26) para dentro do talhão; essas fontes públicas servem só como contexto regional ou para talhões sem amostragem própria.

### Prioridade 1 — novo, barato, CPU-only (adicionar antes do MVP)

1. **Adicionar coleção HLS (FD-04)** à mesma infraestrutura STAC existente — preenche gaps de nuvem combinando Landsat+Sentinel-2 na mesma grade, sem nova dependência.
2. **Sentinel-1 GRD/RTC (FD-06)** — biblioteca `rasterio` já pinada cobre a leitura; falta só o pipeline de índices SAR (ex. RVI). Único sensor gratuito que atravessa nuvens, relevante para a safra de soja no período chuvoso.
3. **AgERA5 (FD-13)** ou **ERA5-Land (FD-12)** via `cdsapi` — melhor relação custo/benefício entre as reanálises gratuitas para uso agronômico direto (ETo, déficit hídrico); é a lacuna de clima confirmada em `PERFIL-COMPATIBILIDADE.md`. NASA POWER (FD-14) é a opção mais simples para prototipar (API REST sem cadastro), mas com resolução mais grosseira e pendência de verificação (ver abaixo).
4. **BR-DWGD/Xavier (FD-18)** para histórico calibrado ao Brasil — combinar com AgERA5/INMET para ter histórico de qualidade + operacional (recomendação de arquitetura, não testada nesta pesquisa — **[HIPÓTESE]**).
5. **Avaliar o produto NASADEM oficial (FD-24)** apenas como **fallback**, no lugar dos tiles skadi que `mde.py` usa hoje — o primário `cop30` (FD-21) permanece. Ganho esperado marginal; ver a nota de correção acima.

### Prioridade 2 — novo, custo de infraestrutura maior (avaliar caso a caso)

- **MERGE/CPTEC (FD-19)**: fonte nacional operacional de precipitação, mas exige nova dependência (`cfgrib`/`eccodes`, formato grib2) não pinada hoje.
- **CHIRPS (FD-15)** e **GPM IMERG (FD-16)**: pipeline de download e regrid novo; trade-off latência × acurácia entre versão rápida e final.
- **INMET/BDMEP (FD-17)**: sem API REST oficial estável — usar apenas como verdade-de-campo para calibrar/validar produtos de grade, não como fonte primária.
- **SustainBench (FD-31)**: único dataset aberto que combina soja + Brasil; usar para validar se o modelo capta tendência regional antes de aplicar em escala de talhão (pré-treino/sanity-check, não substitui dado próprio).
- **KBS LTER (FD-32)**: usar para teste de regressão do pipeline `colheita.py` contra dado público independente.

### Fora do MVP (infra_nova / bloqueado)

- **PlanetScope (FD-08)**: resolução de 3 m é a mais fina entre as ópticas revisadas, mas licença comercial e custo recorrente por hectare monitorado inviabilizam uso amplo sem orçamento dedicado.
- **FABDEM (FD-23)**: licença CC BY-NC-SA bloqueia uso comercial — só prototipagem/pesquisa interna, a menos que se licencie o FABDEM+ comercial.
- **CY-Bench (FD-30)** e **EuroCrops (FD-29)**: valor é só de referência metodológica (harmonização espaço-temporal, taxonomia HCAT), não como dado direto — não cobrem soja/Brasil.

---

## Pontos NÃO confirmados (pendência de verificação)

Os itens abaixo **não foram verificados por WebFetch/fonte primária nesta sessão** e não devem ser tratados como fato até nova checagem:

- **Resolução exata do NASA POWER (FD-14):** a documentação consultada não confirmou o valor exato da grade (referência de ~0,5°/~50 km é conhecimento geral, não verificado nesta sessão); também não foi possível confirmar o SLA de latência.
- **Licença de redistribuição do BR-DWGD/Xavier (FD-18):** os termos exatos de redistribuição no repositório GitHub do autor não foram confirmados em detalhe nesta sessão — verificar antes de embutir os dados em pipeline de produção ou redistribuir.
- **Licença/termos de HYBRAS (FD-27):** "verificar termos exatos por publicação de origem, não checados individualmente nesta sessão".
- **Cobertura do Brasil em CropHarvest (FD-28):** não foi verificado quais dos 20 datasets fonte que compõem o CropHarvest incluem território brasileiro, nem se soja aparece como classe individual ou apenas agregada em "oilseed crops".
- **Licença de CY-Bench (FD-30):** marcada como `NOASSERTION` no repositório GitHub — status legal para uso comercial não esclarecido.
- **Licença dos dados originais de produção do SustainBench (FD-31):** a implementação de referência (TorchGeo) é MIT, mas a licença das fontes governamentais de produção agregadas não foi confirmada em detalhe.
- **Termos de redistribuição do KBS LTER (FD-32):** "verificar termos exatos no registro Ag Data Commons antes de redistribuir".
- **CropScape/CDL** (não incluído na tabela acima por ser classificação de cultura, não fonte para o modelo de yield; ver `../benchmarks/commercial.md`, F-comercial-28): resolução e metodologia citadas na literatura geral não foram confirmadas por fetch nesta sessão.

---

## Apêndice — cobertura textual do catálogo

O CSV é um **catálogo**: nem toda linha precisa ser discutida em prosa. Fica registrado, para que a
diferença não seja lida como omissão, quais `FD-NN` existem **apenas** como linha de catálogo, sem
citação em nenhum outro documento da Fase 1:

**FD-02, FD-03** (rotas alternativas de acesso ao mesmo Sentinel-2 de FD-01) · **FD-09, FD-10**
(MODIS e VIIRS, 250–500 m — grosseiros demais para o grid-alvo) · **FD-22** (ALOS AW3D30,
redistribuição restrita) · **FD-25, FD-26, FD-27** (SoilGrids, PronaSolos, HYBRAS — discutidos na
§4 deste documento, mas não citados fora dele) · **FD-28 a FD-32** (datasets abertos de
produtividade, discutidos na §5 deste documento).

Todos estão descritos nas tabelas acima com licença, resolução e limitação; a ausência de citação
externa significa apenas que **nenhuma decisão da Fase 1 dependeu deles**. O mesmo vale, do lado
comercial, para a maior parte das 32 soluções de [`../benchmarks/commercial.md`](../benchmarks/commercial.md):
21 das 32 têm ficha própria naquele documento e não são citadas fora dele.

---

## Arquivos-fonte desta análise

- CSV completo copiado para [`fontes-dados.csv`](./fontes-dados.csv) (mesma pasta deste documento).
- Soluções comerciais copiadas para [`../benchmarks/solucoes.csv`](../benchmarks/solucoes.csv).
