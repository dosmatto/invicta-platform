# Benchmark de Soluções Comerciais — Predição de Produtividade

> Insumo desta análise: a trilha local de auditoria do eixo F-comercial — **não versionada** (texto bruto de páginas de terceiros) — com 32 soluções e 31 fontes abertas via WebFetch/WebSearch; o CSV resultante está versionado em [`solucoes.csv`](./solucoes.csv). Nenhuma métrica foi inventada; onde a fonte não divulgou um número, o campo aparece como `não divulgada`/`nd`.

## Aviso metodológico

**Convenção de leitura deste documento** — alegação comercial não equivale a validação científica. Toda linha deste documento distingue explicitamente:

- **[ALEGAÇÃO COMERCIAL]** — número publicado pela própria empresa (press release, blog, página de produto), sem revisão por pares nem auditoria de terceiro independente.
- **[VALIDADO]** — metodologia pública, auditável e/ou com literatura científica associada (tipicamente sistemas governamentais/institucionais).
- **[NÃO DIVULGADO]** — a fonte consultada não publica nenhum número de precisão.

Nenhuma das 32 soluções revisadas foi comparada com um "ranking de melhor/pior": os modelos de negócio, escalas e culturas são heterogêneos demais para isso, e a instrução da seção 57 do pedido original veda comparar resultados fora de contexto.

**Data de acesso das fontes:** 2026-09-19.

---

## Tabela-resumo — as 32 soluções pesquisadas

| sol_id | Empresa / Produto | O que prevê | Escala | Quando | Fonte de dados | Precisão divulgada [rótulo] | Validação independente? | Incerteza? | Explicabilidade? | Integração com máquinas |
|---|---|---|---|---|---|---|---|---|---|---|
| [F-comercial-01](https://climate.com/en-us/resources/blog/the-past-present-and-future-of-predicting-yield.html) | Bayer/Climate LLC — Climate FieldView | Distribuição de probabilidade do yield da **safra seguinte** (escolha de semente) | Talhão | Antes do plantio (ano anterior à colheita) | Histórico de semente/yield, clima, solo | não divulgada **[NÃO DIVULGADO]** | não | sim (conceito, sem números) | não divulgada | sim — John Deere Operations Center + APIs de terceiros (ex. Leaf) |
| [F-comercial-02](https://developer.deere.com/) | Deere & Company — John Deere Operations Center | Nada — é hub de dados operacionais/máquina (recebe mapas de colheita via ISOXML) | Talhão/máquina | n/a (pós-colheita para mapas de yield) | Telemetria de máquina, ISOXML | não aplicável | não aplicável | não aplicável | não aplicável | sim — é o próprio hub (APIs OAuth2, ISO 15143-3/AEMP, ISOXML) |
| [F-comercial-03](https://www.corteva.com/us/products-and-solutions/digital-solutions/granular-insights.html) | Corteva — Granular Insights | Estimativa de yield potencial ASSISTIDA (produtor lê imagem+histórico), não número de modelo próprio | Talhão | Pré-colheita (planejar armazenagem/contratos) | Imagens de satélite, histórico, monitores de terceiros (Deere, Case IH, Ag Leader, Precision Planting) | não divulgada **[NÃO DIVULGADO]** | não | não | não | sim — importa de Deere Operations Center, Case IH AFS Connect, Ag Leader AgFiniti, Precision Planting Panorama |
| [F-comercial-04](https://www.cropwise.com/) | Syngenta Digital — Cropwise Grower/AI | Ganho de yield projetado (%) para recomendação de semente/manejo, não kg/ha por talhão com erro | Talhão/regional | Ao longo da safra | Clima histórico (>20 anos), solo, estádios, imagens de satélite | "até 5% de ganho de yield" **[ALEGAÇÃO COMERCIAL]** — press release Syngenta | não (auditoria KPMG cobre área monitorada, não acurácia do modelo) | não divulgada | não divulgada | não detalhado |
| [F-comercial-05](https://www.cropwise.com/protector) | Syngenta Digital (ex-Strider) — Cropwise Protector | Detecção/diagnóstico de infestação de nematoides via satélite — não é previsão de yield | Talhão (zonas de hotspot) | Durante a safra | Planet + amostragem de campo georreferenciada | não divulgada **[NÃO DIVULGADO]** | não | não | parcial (indica zona de risco, não quantifica efeito no yield) | não detalhado |
| [F-comercial-06](https://xarvio-itl02.basf.com/global/en/products/field-manager.html) | BASF Digital Farming — xarvio FIELD MANAGER | Recomendações de manejo + "estimate yield and revenue in near real time", sem número/metodologia públicos | Talhão | Durante a safra ("near real time") | Reconhecimento de imagem de satélite + modelagem agronômica | "31€/ha a mais" em trigo (estudo de caso) **[ALEGAÇÃO COMERCIAL]** | não | não divulgada | parcial (risco de doença/inseto por fator, sem quantificação de yield) | sim — xarvio CONNECT 2.0 |
| [F-comercial-07](https://eos.com/products/crop-monitoring/) | EOS Data Analytics — EOSDA Crop Monitoring | Yield e biomassa para os **próximos 14 dias** | Grade até 3 m (composição) | Contínuo, janela rolante de 14 dias | Sentinel-2 + PlanetScope, clima, dados de máquina John Deere | "predicting yield and biomass accurately" — sem número **[ALEGAÇÃO COMERCIAL]** | não | não divulgada | não divulgada | sim — conecta automaticamente máquinas John Deere; API própria |
| [F-comercial-08](https://www.onesoil.ai/en/blog/onesoil-yield-prediction-technology) | OneSoil | Não confirmado no texto aberto — produto visível é monitoramento/zoneamento NDVI, apesar do nome sugerir "yield prediction" | Talhão (zonas) | nd | Satélite (NDVI), "AI Agronomist" | não divulgada **[NÃO DIVULGADO]** | não | não | não | não confirmado |
| [F-comercial-09](https://www.taranis.com/) | Taranis — Yield Impact | Nome sugere impacto em yield, sem número/métrica de conversão imagem→yield; foco real é detecção foliar (estande, daninha, praga) | Sub-talhão ("submillimeter", drone) | Durante a safra | Imagens aéreas de drone submilimétricas + IA | não divulgada numericamente **[NÃO DIVULGADO]** | não | não | parcial (aponta causa, não fator quantificado) | não confirmado |
| [F-comercial-10](https://corvian.com/) | Corvian (ex-Farmers Edge) | Não especificado nesta página — empresa pivotou de yield prediction ao produtor para tecnologia enterprise/white-label | nd | nd | nd | nao mencionado nesta pagina | não aplicável | nd | não | não |
| [F-comercial-11](https://www.planet.com/products/planetary-variables/) | Planet Labs — Planetary Variables (Crop Biomass Accumulation) | Biomassa/crescimento (índice), **não** yield — é insumo para modelos de terceiros | 10 m (biomassa) / 1 km (umidade) | Contínuo, diário | PlanetScope, composições sem nuvem | não divulgada **[NÃO DIVULGADO]** | não (alega "paridade com sensores de solo" sem número) | não | não aplicável (é insumo, não decisão) | não aplicável |
| [F-comercial-12](https://www.satshot.com/) | Satshot — Mapcenter 3 / Landscout 2 / iCue | Nada — visualização/análise de imagem + mapas de prescrição VRA | Talhão, 3 níveis de resolução | n/a | Landsat (20-30 m), Sentinel (5-10 m), SPOT 6&7 (<5 m) | não aplicável | não aplicável | não aplicável | não aplicável | sim — mapas de prescrição VRA |
| [F-comercial-13](https://www.solinftec.com/en/solix-ia/) | Solinftec — Solix Ag Robotics / ALICE AI | Ganho de biomassa/yield potencial como EFEITO do manejo via robô — não é previsão preditiva de yield futuro | Sub-talhão (passagem do robô) | Durante a safra | Robôs solares terrestres + sensores + IA proprietária | "até 10% mais biomassa/yield potencial"; "até 98% menos herbicida" **[ALEGAÇÃO COMERCIAL]** | não | não | parcial (aponta local, não fator quantificado) | sim (robótica própria + dados agregados) |
| [F-comercial-14](https://www.aegro.com.br/) | Aegro | Nada relacionado a produtividade — foco em gestão de custo/financeiro | Talhão/fazenda | n/a | Registro manual do produtor | não aplicável | não aplicável | não aplicável | não aplicável | não mencionado |
| [F-comercial-15](https://agrosmart.com.br/) | Agrosmart — Nexus/BoosterPRO/BoosterAGRO | Não confirmado nesta página — foco declarado em inteligência climática e irrigação | Fazenda/talhão | nd | Dados climáticos e agronômicos | não divulgada **[NÃO DIVULGADO]** | não | não | não | não confirmado |
| [F-comercial-16](https://www.auravant.com/en/) | Auravant | Nada confirmado — detecção de anomalias via satélite (monitoramento) | Talhão | n/a | Imagens de satélite | não aplicável | não aplicável | não aplicável | não aplicável | não confirmado |
| [F-comercial-17](https://www.agrotools.com.br/) | Agrotools — Monitor de Safras | Nada de yield — evidência técnica auditável de uso do solo/risco (compliance, crédito, seguro) | Regional/talhão | n/a | Múltiplas bases de dados agregadas | não aplicável | não aplicável | não aplicável | não aplicável | não mencionado |
| F-comercial-18 | Gro Intelligence (**encerrada em 2024**) | Historicamente: previsão de produtividade/preço agrícola em escala de país via ML | País/regional | nd | nd | não verificada nesta sessão | não aplicável | nd | nd | nd |
| [F-comercial-19](https://medium.com/descarteslabs-team/advancing-the-science-of-corn-forecasting-350603e3c57f) | Descartes Labs (hoje EarthDaily) — Corn yield forecast 2015-2016 | Previsão pública de yield de milho no Corn Belt (EUA), **descontinuada** como serviço aberto | País/Corn Belt (não intra-talhão) | Durante a safra | Assinatura espectral via satélite + dados meteorológicos | "dentro de 1 bushel/acre do número final USDA" **[comparação direta com número oficial, mas divulgada pela própria empresa]**; "99% de acurácia" **[ALEGAÇÃO COMERCIAL]** | não (nenhum paper peer-reviewed reproduzindo o 99% localizado) | não divulgada | parcial | não aplicável |
| [F-comercial-20](https://www.dtn.com/weather/agriculture/) | DTN (incorporou aWhere) | Nada diretamente — dados climáticos/agronômicos como insumo para terceiros | nd | n/a (dado contínuo) | Dados meteorológicos próprios/agregados | não aplicável | não aplicável | não confirmado | não aplicável | não confirmado |
| [F-comercial-21](https://ceres.ai/) | Ceres (ex-Ceres Imaging) | Perda de produtividade (yield loss) para **perícia de seguro**, não previsão para manejo | Sub-talhão (nível de planta) | Durante/após evento (sinistro) | Imagens aéreas multiespectrais de planta | não divulgada numericamente **[NÃO DIVULGADO]** | não | não | parcial (correlação com água aplicada, não com yield) | não confirmado |
| [F-comercial-22](https://sentera.com/) | Sentera — FIELDAGENT/SMARTSCRIPT | Nada — insights a nível de planta para decisão agronômica | Sub-talhão | n/a | Sensores multiespectrais/câmeras próprias (drone) | não aplicável | não aplicável | não aplicável | não aplicável | não confirmado |
| [F-comercial-23](https://www.cropx.com/) | CropX | Modelo interno de crescimento de cultura existe, sem métrica de precisão de yield divulgada; caso isolado "70% yield increase" em cana | Talhão/sensor (pontual) | Durante a safra (irrigação) | Sensores de solo próprios (umidade, temperatura, CE, salinidade) | "70% Yield Increase" (cana, caso isolado) **[ALEGAÇÃO COMERCIAL]** | não | não | não | sim ("managing machine data and partner connections") |
| [F-comercial-24](https://earthdaily.com/agriculture) | EarthDaily (Geosys/EarthDaily Agro) | "Yield potential"/"forecast production" a partir de índices (NDVI/EVI/LAI/NDWI), sem número/resolução/erro divulgados | nd | Contínuo durante a safra | Satélite (índices multiespectrais) | não divulgada nesta página **[NÃO DIVULGADO]** | não | não | não | não confirmado |
| [F-comercial-25](https://www.solvi.ag/) | Solvi | Nada de yield comercial — métricas entre parcelas de ensaio (breeding/P&D) | Sub-talhão (parcela de ensaio) | Durante o ciclo do ensaio | Imagem de drone (RGB e multiespectral) | não aplicável | não aplicável | não aplicável | não aplicável | não aplicável |
| F-comercial-26 | SIMA (Sistema Integrado de Monitoramento Agrícola) | Não confirmado modelo preditivo próprio — oferece "mapas com histórico de produtividade" (provavelmente mapas de colheita importados) | Talhão/fazenda/município | nd | Registro via app mobile + integração ERP financeiro | não aplicável | não aplicável | não confirmado | não aplicável | não confirmado |
| [F-comercial-27](https://www.nass.usda.gov/Surveys/Guide_to_NASS_Surveys/Objective_Yield/index.php) | USDA/NASS — Objective Yield Survey | Número oficial de yield (bu/ac) por condado/estado/país, via **amostragem física real** | Amostral → agregado condado/estado/país | Mensal (a partir de agosto) até pós-colheita | Contagem física de plantas/vagens/espigas + área FSA/RMA | erro amostral publicado em separado, não consolidado nesta fonte — **[VALIDADO]** (metodologia pública e auditável) | sim — metodologia pública, referência da indústria/academia | parcial (erros amostrais existem em publicações técnicas) | não aplicável (é survey, não ML) | não aplicável |
| F-comercial-28 | USDA/NASS (GMU CSISS) — CropScape/CDL | Nada de yield — classificação categórica de cultura por pixel | ~30 m (não confirmado por fetch nesta sessão) | Pós-safra (mapa anual) | Landsat/satélite (classificação supervisionada) | não confirmado nesta sessão **[NÃO DIVULGADO — fetch bloqueado]** | não confirmado nesta sessão | não confirmado | não aplicável | não aplicável |
| [F-comercial-29](https://www.gov.br/conab/pt-br) | CONAB (Brasil) — Levantamento e Estimativa de Safras | Número oficial de produtividade (kg/ha) por UF/região — survey de campo + NDVI + estatística | Macro-regional/UF (não intra-talhão) | Levantamentos mensais (2º ao 12º) | >900 agentes de campo, NDVI de satélite, pacotes tecnológicos declarados | não confirmada numericamente nesta sessão **[VALIDADO parcialmente — metodologia pública, corpo técnico dos boletins não aberto]** | sim, metodologia pública/institucional | não confirmado | não aplicável (survey+estatística) | não aplicável |
| [F-comercial-30](https://joint-research-centre.ec.europa.eu/monitoring-agricultural-resources-mars/jrc-mars-bulletin_en) | JRC (Comissão Europeia) — MARS Bulletin (MCYFS) | Previsão de produtividade por país/UE (trigo, cevada, centeio, colza, batata, beterraba) via modelo de processo WOFOST | País/UE (não intra-talhão) | Mensal, desde 1992 | Grade meteorológica 25 km, mapa europeu de solos, observação da Terra | não divulgada nesta fonte **[VALIDADO institucionalmente — 30+ anos de operação e literatura científica associada não aberta nesta sessão]** | sim (sistema público de longa data) | não confirmado | sim (parcial) — modelo de processo biofísico | não aplicável |
| [F-comercial-31](https://cropmonitor.org/) | GEOGLAM (consórcio) — Crop Monitor | Classificação **qualitativa** de condição de safra — explicitamente NÃO um número de produtividade | Subnacional, global | Boletins mensais | NDVI, precipitação, temperatura, umidade do solo, calendários de safra | não aplicável (produto é categórico) | sim (consórcio científico multi-agência) | sim — via categorias qualitativas (favorável/desfavorável/exceção) | sim (declara variáveis de insumo) | não aplicável |
| [F-comercial-32](https://nasaharvest.org/) | NASA Harvest (incl. Harvest LatAm) | Consórcio de monitoramento de condição de safra e segurança alimentar — não é produto de previsão intra-talhão próprio | Global/regional | Contínuo/sazonal | Satélite + parcerias acadêmicas | não aplicável (consórcio de pesquisa) | sim (consórcio acadêmico liderado pela NASA) | não confirmado | sim (ciência aberta) | não aplicável |

---

## Fichas por solução (seção 12 do pedido original)

Onze soluções tinham investigação nominal explícita no pedido: FieldView, John Deere Operations Center, Granular, Cropwise, xarvio, EOSDA, OneSoil, Taranis, Farmers Edge, Planet, Satshot.

### Climate FieldView (Bayer/Climate LLC) — [F-comercial-01](https://climate.com/en-us/resources/blog/the-past-present-and-future-of-predicting-yield.html)

- **O que é previsto:** distribuição de probabilidade do yield da **safra seguinte** por campo, para apoiar escolha de semente — não previsão intra-safra pré-colheita.
- **Quando é previsto:** antes do plantio, cerca de um ano antes da colheita correspondente.
- **Fonte de dados:** histórico de semente/yield do campo, clima, solo, dados públicos.
- **Resolução:** talhão.
- **Culturas:** milho, soja (genérico, mercado dos EUA).
- **Precisão divulgada:** não divulgada **[NÃO DIVULGADO]**.
- **Mapas espaciais:** não confirmado nesta fonte (produto de Field Health é citado separadamente).
- **Séries temporais:** sim — histórico multi-safra por campo.
- **Explicabilidade:** não divulgada.
- **Integração com máquinas:** sim — John Deere Operations Center (Data Retrieval Connection) e APIs de terceiros (ex. Leaf).
- **Modelo de negócio:** SaaS por assinatura (Bayer).
- **Limitações:** sem métrica de erro publicada; previsão serve à escolha de semente da próxima safra, não à decisão intra-safra atual.
- **Poderia inspirar a Invicta:** **novo_barato** — reforça o valor de séries históricas por talhão (a Invicta já tem série de índices via robô noturno) para eventualmente alimentar um modelo probabilístico de escolha, mas não resolve o alvo do MVP (previsão intra-safra em kg/ha). Achado-chave do eixo: o maior player do mercado prevê para a **próxima** safra, reforçando que previsão intra-safra pré-colheita é um gap de mercado [F-comercial-01].

### John Deere Operations Center — [F-comercial-02](https://developer.deere.com/)

- **O que é previsto:** nada — é um hub de dados operacionais/máquina; recebe mapas de colheita (medição real pós-colheita) via ISOXML, não gera previsão.
- **Quando:** não aplicável (pós-colheita, para os mapas de yield que trafegam por ele).
- **Fonte de dados:** telemetria de máquina, arquivos ISOXML de monitores de colheita/plantio/aplicação.
- **Resolução:** talhão/máquina, passada a passada via monitor de colheita.
- **Culturas:** genérico (todas suportadas por monitores compatíveis).
- **Precisão divulgada:** não aplicável.
- **Mapas espaciais/séries temporais:** sim (mapas de colheita pós-colheita; histórico de operações por talhão).
- **Explicabilidade:** não aplicável.
- **Integração com máquinas:** é o próprio hub — APIs Organizations/Fields/Machine/Field Operations/Webhooks, OAuth2, suporte a ISO 15143-3 (AEMP) e ISOXML.
- **Modelo de negócio:** plataforma gratuita para conectar dados; monetização via venda de máquinas/assinaturas de precision ag.
- **Limitações:** não oferece previsão própria; depende de terceiros (Granular, EOSDA etc.) consumindo a API para gerar previsão. Fetch direto do corpo da página falhou (renderização client-side); dados vieram de WebSearch de páginas oficiais/GitHub api-evangelist [F-comercial-02].
- **Poderia inspirar a Invicta:** **reusa** — o padrão API/ISOXML é o modelo de integração de máquina que a Invicta deveria mirar se for buscar mapas de colheita de clientes que já usam Deere.

### Granular Insights (Corteva) — [F-comercial-03](https://www.corteva.com/us/products-and-solutions/digital-solutions/granular-insights.html)

- **O que é previsto:** estimativa de yield potencial **assistida** (o produtor lê imagem + histórico), não um número de modelo estatístico próprio.
- **Quando:** pré-colheita, para planejar espaço de armazenagem e contratos.
- **Fonte de dados:** imagens de satélite, dados históricos, monitores de colheita de terceiros (Deere, Case IH, Ag Leader, Precision Planting).
- **Resolução:** talhão. **Culturas:** grãos, genérico (EUA principalmente).
- **Precisão divulgada:** não divulgada **[NÃO DIVULGADO]**.
- **Mapas espaciais:** sim. **Séries temporais:** sim (histórico de campo).
- **Incerteza/Explicabilidade:** não.
- **Integração com máquinas:** sim — importa de John Deere Operations Center, Case IH AFS Connect, Ag Leader AgFiniti, Precision Planting Panorama.
- **Modelo de negócio:** SaaS de gestão agrícola (Corteva).
- **Limitações:** o foco real é gestão financeira/operacional; a "previsão" é estimativa manual do produtor apoiada por imagem, sem modelo publicado [F-comercial-03].
- **Poderia inspirar a Invicta:** **novo_barato** — o hub de importação multi-marca de monitor de colheita é um padrão replicável de baixo custo.

### Cropwise (Syngenta Digital) — [F-comercial-04](https://www.cropwise.com/) / [F-comercial-05](https://www.cropwise.com/protector)

- **O que é previsto:** Cropwise Grower/AI recomenda manejo/semente com ganho de yield **projetado em %** (não kg/ha por talhão com erro divulgado). Cropwise Protector, do mesmo grupo, detecta infestação de nematoides via satélite — não é previsão de produtividade.
- **Quando:** ao longo da safra (Cropwise AI usa mais de 20 anos de clima e mais de 80 mil observações de estádio).
- **Fonte de dados:** clima histórico, solo, estádios de crescimento, imagens de satélite; Protector usa Planet + amostragem de campo georreferenciada.
- **Resolução:** talhão/regional. **Culturas:** soja, milho, trigo (genérico).
- **Precisão divulgada:** "até 5% de ganho de yield" projetado para recomendação de semente **[ALEGAÇÃO COMERCIAL — press release Syngenta]**.
- **Validação independente:** não — a auditoria KPMG citada é sobre **área (hectares) monitorada pela plataforma**, não sobre a acurácia do modelo preditivo (risco de confundir "escala auditada" com "precisão validada", observado no brief [F-comercial-04]).
- **Mapas espaciais/séries temporais:** sim/sim.
- **Incerteza/Explicabilidade:** não divulgadas; Protector indica a causa (nematoide) mas não quantifica efeito no yield.
- **Integração com máquinas:** não detalhada nesta fonte.
- **Modelo de negócio:** SaaS + serviço agronômico (Syngenta).
- **Limitações:** "5% de ganho" é métrica de recomendação agronômica, não de precisão preditiva de yield (sem R²/RMSE) [F-comercial-04].
- **Presença no Brasil:** confirmada — piloto Cropwise AI e primeiro lançamento mundial do Cropwise Protector (130.000 ha de soja) [F-comercial-04, F-comercial-05].
- **Poderia inspirar a Invicta:** **novo_barato** — Brasil como mercado prioritário de pilotos de IA agrícola confirma demanda local; combinar zonas de risco fitossanitário (nematoide) com o modelo de yield poderia virar um fator explicativo adicional, ao lado de fertilidade/CEa já existentes na plataforma.

### xarvio FIELD MANAGER (BASF Digital Farming) — [F-comercial-06](https://xarvio-itl02.basf.com/global/en/products/field-manager.html)

- **O que é previsto:** recomendações de manejo (risco de doença/inseto, timing de pulverização) + "estimate yield and revenue in near real time", sem número ou metodologia públicos.
- **Quando:** durante a safra ("near real time").
- **Fonte de dados:** reconhecimento de imagem de satélite + "cutting edge agronomic modelling" (descrição da própria BASF, sem detalhe técnico aberto).
- **Resolução:** talhão. **Culturas:** trigo (estudo de caso), genérico.
- **Precisão divulgada:** "31€/ha a mais" em trigo protegido vs. manejo padrão **[ALEGAÇÃO COMERCIAL — estudo de caso BASF]**.
- **Mapas espaciais:** sim (biomassa semanal). **Séries temporais:** sim (biomassa semanal).
- **Incerteza:** não divulgada. **Explicabilidade:** parcial (risco de doença/inseto por fator, sem quantificação de yield).
- **Integração com máquinas:** sim — xarvio CONNECT 2.0 (troca de dados de máquina).
- **Modelo de negócio:** SaaS por assinatura (BASF).
- **Limitações:** **as páginas de produto retornaram 401/404 no fetch direto nesta sessão** — dados vieram de snippet de busca, não do corpo verbatim da página; confiança moderada [F-comercial-06].
- **Poderia inspirar a Invicta:** **novo_barato** — mapas de biomassa semanais consistentes (composição sem nuvem) são o tipo de insumo que a Invicta já produz via índices Sentinel-2/CBERS.

### EOSDA Crop Monitoring (EOS Data Analytics) — [F-comercial-07](https://eos.com/products/crop-monitoring/)

- **O que é previsto:** yield e biomassa para os **próximos 14 dias** (curto prazo), integrando tipo de cultura, irrigação e clima.
- **Quando:** continuamente durante a safra, janela rolante de 14 dias à frente.
- **Fonte de dados:** Sentinel-2 e PlanetScope (composição sem nuvem), clima, dados de máquina John Deere (auto-conectados).
- **Resolução:** até 3 m (composição), atualização diária. **Culturas:** genérico (10 índices de vegetação prontos).
- **Precisão divulgada:** "predicting yield and biomass accurately" — sem número **[ALEGAÇÃO COMERCIAL — página de produto]**.
- **Mapas espaciais/séries temporais:** sim/sim.
- **Incerteza/Explicabilidade:** não divulgadas.
- **Integração com máquinas:** sim — conecta automaticamente dados de máquinas John Deere; API própria (EOSDA API Connect).
- **Modelo de negócio:** freemium + assinatura + API paga.
- **Limitações:** janela de previsão curta (14 dias), não cobre a safra inteira; unidades kg/ha não informadas [F-comercial-07].
- **Poderia inspirar a Invicta:** **reusa** — já usa Sentinel-2 (a Invicta também); a janela de previsão rolante de 14 dias é um padrão de produto replicável com baixo custo adicional.

### OneSoil — [F-comercial-08](https://www.onesoil.ai/en/blog/onesoil-yield-prediction-technology)

- **O que é previsto:** **não confirmado no texto aberto** — a URL sugere "yield prediction technology", mas o conteúdo acessível não detalhou metodologia; o produto visível é monitoramento/zoneamento por NDVI.
- **Fonte de dados:** satélite (NDVI), "AI Agronomist" (descrição de marketing, não detalhada).
- **Resolução:** talhão (zonas de produtividade/tarefa). **Culturas:** genérico.
- **Precisão divulgada:** não divulgada **[NÃO DIVULGADO]**.
- **Mapas espaciais:** sim (mapas de zona). **Demais campos (série temporal, incerteza, explicabilidade, integração):** não confirmados.
- **Modelo de negócio:** freemium ("Try Free"/demo).
- **Limitações:** a página aberta não sustentou o título/URL sobre previsão de yield — possível gap entre marketing e conteúdo público [F-comercial-08].
- **Poderia inspirar a Invicta:** **novo_barato** — identificação automática de cultura e zoneamento são features de baixo custo já parcialmente cobertas pelo catálogo de índices da Invicta.

### Taranis — [F-comercial-09](https://www.taranis.com/)

- **O que é previsto:** o nome do produto ("Yield Impact") sugere impacto em yield, mas sem número/métrica de conversão imagem→yield divulgado; o foco real é detecção foliar (estande, daninha, praga, deficiência).
- **Quando:** durante a safra, monitoramento contínuo.
- **Fonte de dados:** imagens aéreas de drone submilimétricas + IA (mais de 500 milhões de pontos de dado, segundo a empresa).
- **Resolução:** sub-talhão (nível de folha/planta, "submillimeter"). **Culturas:** genérico.
- **Presença confirmada:** EUA e Israel; Brasil não mencionado.
- **Precisão divulgada:** não divulgada numericamente **[NÃO DIVULGADO]**.
- **Mapas espaciais:** sim. **Série temporal/incerteza:** não confirmadas/não divulgadas.
- **Explicabilidade:** parcial — aponta causa (daninha/praga/deficiência específica), não fator quantificado para yield.
- **Modelo de negócio:** assinatura por "Service Plans", foco em consultores agrícolas.
- **Limitações:** resolução submilimétrica via drone é operacionalmente cara e não escala como satélite; Brasil não confirmado [F-comercial-09].
- **Poderia inspirar a Invicta:** **infra_nova** — resolução sub-planta via drone exigiria voo próprio, fora do escopo de custo atual (Invicta usa satélite).

### Farmers Edge → Corvian — [F-comercial-10](https://corvian.com/)

- **O que é previsto:** não especificado nesta página como serviço nomeado — a empresa **pivotou** de yield prediction ao produtor para tecnologia empresarial/white-label (Corvian, DMaaS).
- **Sinal de mercado:** rebranding completo; `farmersedge.ca` redireciona (301) para `corvian.com`. O produto histórico de previsão de yield ao produtor parece descontinuado/reposicionado [F-comercial-10].
- **Modelo de negócio atual:** licenciamento/white-label + consultoria (B2B enterprise).
- **Poderia inspirar a Invicta:** **reusa** — como sinal de mercado, alerta de risco de que um modelo de negócio B2C puro em yield prediction pode não se sustentar isoladamente.

### Planet — Planetary Variables (Crop Biomass Accumulation) — [F-comercial-11](https://www.planet.com/products/planetary-variables/)

- **O que é previsto:** biomassa/crescimento de cultura (índice), **não** yield diretamente — serve de insumo (feature) para modelos de terceiros.
- **Quando:** contínuo, diário, durante a safra.
- **Fonte de dados:** PlanetScope (constelação própria), composições sem nuvem.
- **Resolução:** 10 m (biomassa) / 1 km (umidade do solo). **Culturas:** genérico.
- **Precisão divulgada:** não divulgada **[NÃO DIVULGADO]**; há alegação de "paridade com sensores de solo" sem número.
- **Mapas espaciais/séries temporais:** sim/sim (diário; solo com mais de 19 anos de arquivo).
- **Incerteza/Explicabilidade:** não / parcial (metodologia geral de composição descrita, sem paper aberto nesta sessão).
- **Modelo de negócio:** dado B2B via API/licenciamento — Planet é fornecedor de dado para vários outros players desta lista (EOSDA, Cropwise Protector etc.) [F-comercial-11].
- **Limitações:** não é um previsor de yield, é insumo; a precisão de conversão biomassa→yield fica a cargo de quem consome o dado.
- **Poderia inspirar a Invicta:** **reusa** — a Invicta já usa Sentinel-2/CBERS; Planet é referência de resolução diária de 10 m sem nuvem como padrão de mercado a perseguir se o custo permitir.

### Satshot — [F-comercial-12](https://www.satshot.com/)

- **O que é previsto:** nada — visualização/análise de imagem + geração de mapas de prescrição VRA; sem previsão de yield.
- **Fonte de dados:** Landsat (20-30 m), Sentinel (5-10 m), SPOT 6&7 (<5 m) — três níveis de resolução de imagem.
- **Resolução:** talhão. **Culturas:** genérico. Brasil não mencionado.
- **Mapas espaciais:** sim. **Integração com máquinas:** sim (mapas de prescrição VRA, formato não detalhado).
- **Modelo de negócio:** SaaS GIS agrícola.
- **Limitações:** produto de monitoramento/GIS mais antigo do mercado, sem funcionalidade de previsão [F-comercial-12].
- **Poderia inspirar a Invicta:** **reusa** — multi-fonte de resolução (baixa/média/alta) é um padrão simples de segmentar oferta por custo.

---

## Sistemas públicos operacionais

Todos classificados **[VALIDADO]** ou **[VALIDADO parcialmente]** por serem metodologia pública/institucional — mas nenhum opera em escala intra-talhão.

- **USDA/NASS — Objective Yield Survey** [F-comercial-27](https://www.nass.usda.gov/Surveys/Guide_to_NASS_Surveys/Objective_Yield/index.php): número oficial de yield (bu/ac) por condado/estado/país nos EUA, via amostragem física real em campo (contagem de plantas/vagens/espigas), não sensoriamento remoto + ML puro. Metodologia publicada em detalhe — **[VALIDADO]**. Processo caro e manual (enumeradores em campo); não escala para intra-talhão nem para países sem infraestrutura estatística equivalente.
- **CONAB (Brasil) — Levantamento e Estimativa de Safras** [F-comercial-29](https://www.gov.br/conab/pt-br): número oficial de produtividade (kg/ha) por UF/região, combinando survey de campo (>900 agentes) + NDVI de satélite + estatística; levantamentos mensais (2º ao 12º). **[VALIDADO parcialmente]** — metodologia pública e institucional, mas o corpo técnico dos boletins não foi aberto nesta sessão (fetch do portal `gov.br` trouxe apenas navegação; dados vêm de snippet de busca sobre página redirecionada). Análogo funcional ao USDA/NASS.
- **JRC MARS Bulletin (MCYFS)** [F-comercial-30](https://joint-research-centre.ec.europa.eu/monitoring-agricultural-resources-mars/jrc-mars-bulletin_en): previsão de produtividade por país/UE via modelo de processo biofísico WOFOST, mensal desde 1992, grade meteorológica de 25 km. **[VALIDADO institucionalmente]** — 30+ anos de operação contínua e literatura científica associada (há artigo dedicado sobre a performance 1993-2015, PMC6360854, **não aberto nesta sessão**). Não cobre soja/milho tropical diretamente (culturas europeias).
- **GEOGLAM Crop Monitor** [F-comercial-31](https://cropmonitor.org/): classificação **qualitativa** de condição de safra (favorável/desfavorável/exceção), não um número de produtividade. Consórcio científico multi-agência (inclui NASA/NASA Harvest). Abordagem de comunicação de incerteza por categoria — relevante para o regime de poucos dados de treino da Invicta (ver seção "inspiração" abaixo).
- **NASA Harvest** (incl. Harvest LatAm) [F-comercial-32](https://nasaharvest.org/): consórcio de monitoramento de condição de safra e segurança alimentar, não um produto de previsão de yield intra-talhão. Ciência aberta, com "Harvest LatAm" cobrindo a América Latina (incl. Brasil, sem detalhe de projeto específico nesta página).

---

## Sinais de mercado (descontinuações e pivôs)

- **Farmers Edge → Corvian** [F-comercial-10]: rebranding completo de yield prediction B2C/B2Farm para tecnologia enterprise/white-label.
- **Gro Intelligence — encerrada em 2024** [F-comercial-18]: previsão de produtividade/preço agrícola em escala de país; fechou após corte de 60% do quadro e troca de CEO, valuation caiu de US$850M para menos de US$25M, processada por ex-funcionários e investigada pela SEC. Incluída como estudo de caso de lacuna/risco de mercado, não como fonte técnica ativa.
- **Descartes Labs → EarthDaily** [F-comercial-19]: previsão pública de yield de milho (2015-2016), comparada diretamente com o número oficial USDA ("dentro de 1 bushel/acre") — o caso mais citado na indústria como prova de viabilidade técnica de yield forecast via satélite+ML. Ainda assim, **parou de publicar gratuitamente após parceria com a trading Cargill em 2018**, virando inteligência de mercado proprietária B2B.
- **Interpretação [EVIDÊNCIA LIMITADA — três casos de mercado, não estudos]:** os três casos, somados, sugerem que prova de conceito técnica boa não garante modelo de negócio B2C sustentável em yield prediction; B2B adjacente (seguro, crédito, trading) aparece como via alternativa mais recorrente [F-comercial-09/10, F-comercial-18, F-comercial-19].

---

## Lacunas de mercado

1. **Gap de escala confirmado:** nenhuma das 32 soluções revisadas entrega previsão intra-talhão (~20 m) com número + incerteza + explicabilidade juntos — é exatamente o alvo do MVP da Invicta. [EVIDÊNCIA LIMITADA — pode existir oferta enterprise não pública fora do alcance desta pesquisa]
2. **Nenhuma solução comercial privada** publica, em página oficial, um número de previsão de produtividade em kg/ha (ou equivalente) por talhão/pixel com métrica de erro divulgada. [EVIDÊNCIA LIMITADA — F-comercial-01, 04, 06, 07, 09, 23, 24. **Não é consenso de literatura:** estes são catálogos de páginas comerciais, não estudos independentes; a afirmação é uma constatação de ausência sobre o material público consultado]
3. **Nenhuma validação independente** (terceiro não afiliado) foi encontrada para nenhuma solução privada. [EVIDÊNCIA LIMITADA]
4. **Nenhuma solução comercial privada divulga intervalo de incerteza numérico** — o único player privado que sequer menciona o conceito é a Climate FieldView ("probability distribution", sem números) [F-comercial-01]. A abordagem mais robusta de comunicação de incerteza encontrada é a **categórica** do GEOGLAM (público, não comercial) [F-comercial-31].
5. **Explicabilidade:** nenhuma solução privada menciona SHAP/XAI; Cropwise Protector e Solinftec indicam causa (nematoide, daninha) sem quantificar efeito no yield [F-comercial-05, F-comercial-13]. JRC MARS/WOFOST, por ser processo biofísico, é estruturalmente mais explicável que ML puro [F-comercial-30].
6. **Preço no Brasil não foi encontrado** para nenhuma das soluções — nenhuma página divulgou tabela pública.

---

## O que pode inspirar a Invicta

Classificação conforme [`../product/perfil-compatibilidade.md`](../product/perfil-compatibilidade.md): **reusa** (a plataforma já tem o equivalente), **novo_barato** (CPU-only, encaixa no stack atual sem custo de infraestrutura relevante), **infra_nova** (exigiria hardware, GPU ou orçamento recorrente novo).

| Ideia | Classificação | Fonte |
|---|---|---|
| Padrão API/ISOXML (John Deere) como referência de integração para importar mapas de colheita de clientes que já usam Deere | **reusa** | F-comercial-02 |
| Combinar zonas de risco fitossanitário (nematoide, estilo Cropwise Protector) como fator explicativo do modelo de yield, ao lado de fertilidade/CEa já existentes | **novo_barato** | F-comercial-04, F-comercial-05 |
| Janela de previsão rolante de curto prazo (estilo EOSDA, 14 dias) como padrão de produto | **reusa** | F-comercial-07 |
| Comunicar incerteza por **categoria qualitativa** (estilo GEOGLAM: favorável/desfavorável/exceção) como fallback de UX quando o modelo tiver poucos dados (20-100 talhões-safra), em vez de intervalo numérico que passa falsa confiança | **novo_barato** | F-comercial-31 |
| Multi-fonte de resolução (baixa/média/alta), estilo Satshot, para segmentar oferta por custo | **reusa** | F-comercial-12 |
| Explorar receita B2B adjacente (seguro — Ceres AI; compliance/crédito — Agrotools) como alternativa ao B2C puro, dado o padrão de fragilidade financeira observado (Farmers Edge/Corvian, Descartes Labs, Gro Intelligence) | **novo_barato** (é decisão de modelo de negócio, não de engenharia) | F-comercial-17, F-comercial-21, F-comercial-09/10, F-comercial-18, F-comercial-19 |
| Usar CONAB como verdade agregada de UF/macro-região para calibrar/sanity-check o modelo intra-talhão | **novo_barato** | F-comercial-29 |
| Arquitetura de "extensions"/plugins de terceiros (estilo Auravant) como visão de longo prazo | **infra_nova** — fora do escopo do MVP | F-comercial-16 |
| Hardware próprio de sensoriamento (robótica Solinftec, drones Taranis/Sentera) | **infra_nova** — fora do escopo (Invicta usa satélite de terceiros, sem hardware de campo) | F-comercial-13, F-comercial-09, F-comercial-22 |
| PlanetScope (3 m, quase diário) como upgrade futuro de resolução óptica | **infra_nova** — licença comercial paga por km²/hectare monitorado, sem tabela de preço Brasil confirmada | F-comercial-11 (ver também [`../data-sources/fontes-de-dados.md`](../data-sources/fontes-de-dados.md), **FD-08**) |

---

## Limitações desta análise

- **Páginas que bloquearam leitura direta (fetch retornou erro/redirecionamento/apenas navegação):** xarvio (401/404 nas páginas de produto, F-comercial-06), Solinftec (403 na página oficial, F-comercial-13), CONAB (portal `gov.br` só trouxe navegação, corpo técnico dos boletins não aberto, F-comercial-29), CropScape/CDL (fetch trouxe apenas cabeçalho de navegação, F-comercial-28), SIMA (site oficial não aberto diretamente, apenas snippet, F-comercial-26), Gro Intelligence (empresa fechada, sem site ativo para fetch, F-comercial-18). Nesses casos a informação registrada veio de **snippet de busca (WebSearch)**, não do corpo verbatim da página (WebFetch) — a confiança é **moderada**, não alta, e está marcada linha a linha na tabela-resumo e nas fichas.
- **Preços no Brasil:** nenhuma fonte consultada divulgou tabela pública de preço para nenhuma das 32 soluções; nenhum dado de preço Brasil foi confirmado nesta pesquisa.
- **Patentes/artigos publicados:** nenhuma patente foi localizada/verificada nesta sessão para as empresas do eixo (Climate Corp, Descartes Labs, Planet). A literatura acadêmica dedicada ao JRC MARS (artigo sobre performance 1993-2015, PMC6360854) existe mas **não foi aberta nesta sessão** — fica como oportunidade de aprofundamento futuro, a verificar se o eixo de estado da arte (literature-review) já cobriu.
- **Escopo geográfico e temporal:** a pesquisa cobriu páginas oficiais e cobertura de imprensa acessíveis publicamente em 2026-09-19; não houve tentativa de contato comercial direto com nenhuma empresa (sem cotação, sem NDA, sem demo).
- Nenhum número de precisão foi inventado ou estimado por extrapolação; onde a fonte não divulgou, o campo permanece `não divulgada`/`nd`/`não confirmado`.
- **Como ler [`solucoes.csv`](./solucoes.csv) — exige parser CSV, não `split`.** O arquivo usa `;` como separador de campos **e** contém `;` **dentro** de campos entre aspas (cerca de 60 células, em colunas como `paises`, `precisao_divulgada`, `serie_temporal`, `limitacoes` e `notes` — por exemplo `"ate 10% mais biomassa e potencial de yield"; "ate 98% de reducao de herbicida"`). O arquivo é CSV válido, mas qualquer leitura por `linha.split(';')` desalinha as colunas e produz contagens erradas. Use `csv.reader(f, delimiter=';')`, `pandas.read_csv(..., sep=';')` ou equivalente. Exemplo do erro que isso já causou: uma contagem por `split` devolveu `explicabilidade=sim` em 6 soluções; com parser correto são **3** (F-comercial-30 JRC, 31 GEOGLAM, 32 NASA — **todas públicas**) e `parcial` em **6**. A conclusão do documento (nenhuma solução **privada** menciona SHAP/XAI) não muda — ver `../literature-review/verificacao-citacoes.md`, adendo C-19.
