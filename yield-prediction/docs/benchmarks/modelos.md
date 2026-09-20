# Benchmark de Modelos — Predição de Produtividade

> Fonte única deste documento: `yield-prediction/docs/literature-review/papers-database.csv` (87 estudos verificados) e os briefs de eixo da trilha local de auditoria, não versionada (texto bruto de terceiros), em `<trilha-local>/yield/`. Nenhum número, autor ou afirmação técnica aqui vem de conhecimento externo à base. Onde a base não cobre a pergunta, o texto diz "sem evidência direta na base revisada" e a orientação é rotulada [HIPÓTESE] ou [LACUNA].
>
> Unidade interna: kg/ha (1 sc = 60 kg). Data de fechamento da base: 2026-09-19.

---

## 1. Como ler este documento

### 1.1 Não existe ranking universal de modelos

**[DECISÃO → ADR-001 D1]** Este documento não produz um pódio. A própria base revisada contém resultados que se contradizem quando se tenta fixar um vencedor:

- **[RESULTADO ESPECÍFICO]** Em soja em escala de município nos EUA, Random Forest teve o menor RMSE agregado (0,342 t/ha) entre RF/XGBoost/DTR/LASSO/1D-CNN com treino 2012–2016 e teste 2017–2021 (validação temporal, ano-fora) — mas o 1D-CNN foi o mais preciso especificamente no ano de 2018 [A-09, só abstract]. Nenhum modelo dominou todos os anos de teste.
- **[RESULTADO ESPECÍFICO]** Em soja intra-talhão na Áustria (Sentinel-2 10 m + solo, 3 safras), um modelo linear treinado por Stochastic Gradient Descent superou RF, XGBoost, SVM e MLR, com MAE de 0,436 t/ha — contra a expectativa dominante de que árvores vencem [B-07, só abstract]. O esquema de validação não é detalhado no abstract, o que limita o peso do achado.
- **[RESULTADO ESPECÍFICO]** Em milho na China (1.260 municípios × 36 anos, painel meteorológico), a rede neural quantílica **não** superou a regressão quantílica tradicional; QRF combinado com LASSO teve o melhor desempenho entre os métodos quantílicos testados [G-14, só abstract]. Complexidade maior não implicou desempenho melhor.

Consequência prática: as seções 4 e 7 propõem **candidatos a testar**, não decisões. A escolha final depende de um experimento próprio sobre os dados da Invicta, que ainda não existe — nenhum item deste documento carrega o rótulo [RESULTADO].

### 1.2 O que a base cobre — e o que não cobre

**Cobre bem:**
- Comparação de famílias de modelos em escala de **município/condado** (EUA, Brasil, China, Índia): [A-03], [A-07, só abstract], [A-09], [A-10], [B-03, só abstract], [B-15, só abstract], [C-13, só abstract], [E-brasil-04], [G-13, só abstract], [G-14].
- Sensoriamento remoto óptico para predição **intra-talhão**, majoritariamente com split aleatório de pixels: [B-01, só abstract], [B-02, só abstract], [B-05], [B-06], [B-07], [B-08, só abstract], [B-10, só abstract], [B-12].
- Metodologia de **validação espacial** e vazamento: eixo C inteiro.
- **Preditores não-espectrais** (solo, CEa, relevo, histórico): eixo D.

**Não cobre (lacunas declaradas):**
- **[LACUNA]** Nenhum estudo da base testa o regime exato da Invicta: 20–100 talhões-safra de soja, grid 20×20 m, no Brasil, com leave-one-field-out **e** leave-one-year-out combinados. O mais próximo em cultura/escala/país é [B-12] (soja, Paraná, grid 20 m, 15 talhões, Sentinel-2), que compara modelos por talhão / por fazenda / global mas **não** formaliza leave-one-field-out. O mais próximo em esquema de validação é [C-11] (soja, EUA, LOFO-CV real, 3 talhões).
- **[LACUNA]** Extra Trees e CatBoost: nenhum estudo da base os usa. kNN e modelos mistos aparecem apenas como benchmark ou como ferramenta explicativa, nunca como modelo preditivo avaliado com R²/RMSE de predição.
- **[LACUNA]** Nenhum estudo brasileiro da base reporta incerteza calibrada (`uncertainty=sim`) ou explicabilidade formal (`explainability=sim`) para soja — é ausência unânime na literatura brasileira revisada.
- **[LACUNA]** Curva contínua de acurácia × antecedência para soja intra-talhão: não encontrada. Há pontos isolados ([B-10], [H-03, só abstract], [B-12]) e curvas em escala municipal ([B-03], [B-15]).

### 1.3 Regime de dados da Invicta (o filtro que decide tudo)

Conforme `PERFIL-COMPATIBILIDADE.md`:

| Dimensão | Valor |
|---|---|
| Unidades independentes | 20–100 talhões-safra de soja com mapa de colheita |
| Pixels | muitos (grid 20×20 m sobre centenas de ha) — mas fortemente autocorrelacionados dentro do talhão |
| Safras por talhão | poucas (cold start real) |
| Série temporal intra-safra | já existe (robô noturno Sentinel-2/CBERS-4A + catálogo de índices) |
| Clima | **sem ingestão hoje** (ERA5/NASA POWER/CHIRPS seriam novos) |
| Hardware | Render *standard*, CPU-only, 2 workers, **sem GPU**; PyTorch/TensorFlow = custo novo relevante |
| Libs já pinadas | numpy, scipy, pykrige, shapely, pillow, rasterio, pystac-client |
| Libs "podem entrar" | pandas/geopandas/scikit-learn/xgboost/lightgbm/shap (CPU-only, leves) |

A distinção crítica é: **muitos pixels ≠ muitos dados**. O número de amostras estatisticamente independentes é o número de talhões-safra, não o número de células do grid. Todo dimensionamento de modelo neste documento parte disso, e é por isso que a evidência de regimes com centenas ou milhares de unidades ([A-04], [A-07], [A-10], [C-13]) não transfere automaticamente.

### 1.4 Como ler as métricas citadas

**[DECISÃO → ADR-001 D10]** Toda métrica neste documento vem acompanhada de **unidade + cultura + escala + tipo de validação** na mesma frase. R² e RMSE de estudos com escalas ou validações diferentes **não são comparáveis entre si**. Três armadilhas específicas registradas na verificação da base:

1. **Escala infla R².** Em milho no US Corn Belt, o mesmo método passou de r² 0,31 (pixel 30 m, sem suavização) para 0,40 (pixel suavizado), 0,45 (talhão) e 0,69 (condado), validado externamente contra >1 milhão de pontos reais de colhedora [B-04, só abstract]. Um R² de 0,90 em escala de condado e um R² de 0,50 intra-talhão podem descrever o mesmo modelo.
2. **Split aleatório infla desempenho.** Em soja em municípios do Paraná, o R² caiu de 0,748 (split aleatório 80/20) para 0,693 e o RMSE subiu de 414 para 585 kg/ha ao testar numa safra nova held-out [E-brasil-04]. Em biomassa florestal, R² caiu de 0,53 (random 10-fold) para 0,14 (spatial 44-fold) e o RMSE subiu de 56,5 para 77,5 Mg/ha [C-01].
3. **Métricas não intercambiáveis.** CCC (índice de concordância) de [B-14, só abstract] não é R². "Fração de variância capturada" de [H-09, só abstract] não é R² clássico. rRMSE de [B-11, só abstract] não é RMSE absoluto. RRMSE% de [A-03] é percentual, não kg/ha.

### 1.5 Rótulos usados

`[EVIDÊNCIA]` com qualificador `[CONSENSO]` / `[EVIDÊNCIA LIMITADA]` / `[RESULTADO ESPECÍFICO]` · `[HIPÓTESE]` · `[LACUNA]`. Decisões aparecem como **[DECISÃO → ADR-001 Dn]**: as seções 20 e 46 do pedido exigem que a decisão, com alternativas e evidências, more em `docs/decisions/` — aqui ela só é aplicada, e **não há `[DECISÃO]` nu**. Não há `[RESULTADO]` neste documento porque ainda não existe experimento próprio. Citações marcadas `só abstract` indicam que apenas o resumo foi lido; `só metadados` indica que nem o resumo foi acessível — essas **não sustentam nenhuma afirmação além de "o estudo existe"**.

Compatibilidade Invicta (item 11 do ledger): `reusa` = aproveita o que já está na stack · `novo_barato` = exige biblioteca/pipeline novo, CPU-only e leve · `infra_nova` = exige GPU, crop model, sensor ou volume de dados que a plataforma não tem.

---

## 2. Fichas por modelo

### 2.1 Regressão linear / múltipla (+ Lasso, Ridge)

- **O que é:** ajuste de uma combinação linear dos preditores ao alvo; Lasso e Ridge adicionam penalização L1/L2 para conter sobreajuste quando há muitas variáveis correlacionadas.
- **Evidência na base:**
  - **[RESULTADO ESPECÍFICO]** Milho, EUA, ensaios de híbridos (142.952 amostras de treino, teste no ano 2017 fora do treino): Lasso obteve RMSE 21,40 e R² 27,56% (unidades relatadas em % da média do rendimento), contra RMSE 12,79 e R² 81,91% da DNN [A-04]. Em regime de centenas de milhares de amostras com forte interação genótipo×ambiente, o modelo linear perde de forma ampla.
  - **[RESULTADO ESPECÍFICO]** Soja intra-talhão, Áustria, Sentinel-2 10 m + solo, 3 safras: um linear via Stochastic Gradient Descent superou RF/XGBoost/SVM/MLR (MAE 0,436 t/ha; esquema de validação não detalhado no abstract) [B-07].
  - **[EVIDÊNCIA LIMITADA]** MLR aparece como benchmark e é superado em milho county-level nos EUA por GWRFR (R² 0,90 vs. demais; validação não detalhada) [C-13], em soja municipal no Paraná por RFR [E-brasil-04], e em soja intra-talhão (S1+S2+topografia) por RF [B-13, só abstract].
  - **[CONSENSO]** Em milho/soja, correlações lineares simples entre CEa ou topografia e produtividade são descritas como "geralmente não muito úteis": só modelos não-lineares capturaram o sinal [D-02]; a relação CEa↔produtividade "often, but not always" existe [D-03].
  - **[EVIDÊNCIA LIMITADA, evidência geral fora da agricultura]** Fora da agricultura, um levantamento identificou vazamento de dados afetando 294 artigos em 17 campos científicos; num dos casos reproduzidos pelos autores, após corrigir o vazamento, "complex ML models do not perform substantively better" que a regressão logística clássica [C-07, só abstract] — argumento direto para manter a linear como baseline honesto, não como palha. (O texto completo com a taxonomia dos tipos de vazamento não foi aberto nesta revisão.)
- **Pontos fortes:** custo quase nulo; coeficientes diretamente interpretáveis; serve de piso de comparação obrigatório; pouco sujeita a sobreajuste com poucas unidades independentes.
- **Limitações:** não captura interação nem não-linearidade ([A-04]); sensível a colinearidade — os índices espectrais da Invicta (NDVI, SAVI, EVI2, GNDVI…) são altamente colineares entre si, o que desestabiliza coeficientes e sua interpretação [G-08, só abstract].
- **Exigência de dados:** mínima. Funciona com dezenas de amostras.
- **Custo computacional:** trivial em CPU.
- **Explicabilidade:** alta (coeficientes), com a ressalva da colinearidade.
- **Incerteza nativa?** Parcial — intervalos paramétricos sob hipóteses que a autocorrelação espacial dos pixels viola. Sem evidência na base revisada sobre intervalos lineares válidos em grid intra-talhão.
- **Compatibilidade Invicta:** `reusa` — numpy/scipy já pinados; scikit-learn entraria como lib leve. É o Baseline 1 da seção 29 do pedido.

### 2.2 PLS / PLSR (Partial Least Squares Regression)

- **O que é:** regressão sobre componentes latentes que maximizam a covariância entre preditores e alvo; desenhada para p ≫ n e preditores fortemente colineares — exatamente o caso de bandas espectrais.
- **Evidência na base:**
  - **[RESULTADO ESPECÍFICO]** Soja, Brasil (Embrapa Soja), parcelas experimentais com espectrorradiômetro **proximal de folha** (400–2500 nm), 3 safras: PLSR no estádio R5 obteve R² 0,731–0,924 e RMSE 334–403 kg/ha por safra; num modelo único para as 3 safras, R² 0,775 / 0,730 / 0,688 em calibração / validação cruzada / validação externa [H-03].
  - **[RESULTADO ESPECÍFICO]** Soja, Paraná, intra-talhão, Sentinel-2 (9 bandas Vis/NIR/SWIR), grade 20 m, 15 talhões: no estádio R5, o modelo global-based PLSR obteve R² 0,56 e RMSE 51,76 kg/ha, contra R² 0,75 e RMSE 38,82 kg/ha do SVR; validação 10-fold + split 75/25 com validação externa [B-12].
  - **[EVIDÊNCIA LIMITADA]** PLSR aparece como benchmark superado por GWRFR em milho county-level [C-13] e por DNN de fusão multimodal em soja com UAV (DNN-F2 R² 0,720) [H-06, só abstract].
- **Pontos fortes:** lida nativamente com colinearidade espectral; poucos hiperparâmetros (essencialmente o nº de componentes); estável com poucas amostras; barato.
- **Limitações:** **[CONSENSO fraco]** nos estudos da base onde PLSR compete com métodos de árvore, rede ou SVR sobre conjuntos de features ricos, fica atrás ([B-12], [C-13], [H-06]); é linear nos componentes latentes. O resultado mais favorável a PLSR ([H-03]) usa sensor proximal de folha, não orbital — não transfere direto.
- **Exigência de dados:** baixa; desenhada para n pequeno.
- **Custo computacional:** trivial em CPU.
- **Explicabilidade:** média — cargas por componente e VIP são interpretáveis, mas menos diretas que coeficientes.
- **Incerteza nativa?** Não.
- **Compatibilidade Invicta:** `novo_barato` — scikit-learn (`PLSRegression`), CPU-only. Vale como comparador direto do pipeline de [B-12], que é o mais próximo do MVP.

### 2.3 Modelos mistos (efeitos fixos + aleatórios)

- **O que é:** modelos lineares com termos aleatórios por grupo (talhão, fazenda, safra), que separam o efeito médio dos preditores da variação estrutural entre grupos.
- **Evidência na base:** **sem evidência direta na base revisada como modelo preditivo de produtividade avaliado com R²/RMSE.** Os dois estudos que os usam fazem análise explicativa, não predição validada:
  - **[RESULTADO ESPECÍFICO]** Milho/soja/trigo/algodão, EUA, intra-talhão, 571 talhões: modelo linear misto com seleção por AICc mostrou que o **histórico de produtividade do próprio talhão** é o melhor preditor do padrão espacial em milho/trigo/algodão, mas em **soja** o NDVI pós-fato superou o histórico [D-04]. Métrica reportada é AICc, não R²/RMSE.
  - **[RESULTADO ESPECÍFICO]** Milho/soja/trigo/algodão, EUA, intra-talhão, 338 talhões: modelo misto de efeitos aleatórios mostrou TWI médio significativamente maior em zonas instáveis (12,9) que em zonas estáveis-altas (12,7) e estáveis-baixas (12,4), p<0,05, em sequeiro — padrão que desaparece em campos irrigados [D-05].
- **Pontos fortes (dos estudos acima):** tratam explicitamente a estrutura hierárquica Cliente→Fazenda→Talhão→Safra que a Invicta já possui; fornecem erro padrão dos coeficientes (`uncertainty=sim` em [D-04] e [D-05]).
- **Limitações:** **[HIPÓTESE]** com 20–100 talhões-safra, estimar um efeito aleatório por talhão consome a maior parte dos graus de liberdade disponíveis; a base não traz nenhum teste desse limite. Nenhum dos dois estudos avalia capacidade preditiva fora da amostra.
- **Exigência de dados:** moderada; precisa de réplicas por grupo.
- **Custo computacional:** baixo em CPU.
- **Explicabilidade:** alta.
- **Incerteza nativa?** Parcial (erro padrão dos efeitos) — [D-04], [D-05].
- **Compatibilidade Invicta:** `novo_barato` — exigiria statsmodels ou similar. **[HIPÓTESE]** útil como arcabouço para o problema "global + calibração local" da seção 6, mas sem nenhuma validação na base revisada para esse uso.

### 2.4 GWR, GWRFR e modelos espaciais (inclui RFsp)

- **O que é:** GWR ajusta uma regressão local para cada posição, com pesos decrescentes na distância; GWRFR aplica a mesma ponderação geográfica a um Random Forest; RFsp adiciona distâncias-buffer a pontos conhecidos como features extras de um RF comum.
- **Evidência na base:**
  - **[RESULTADO ESPECÍFICO]** Trigo, México, escala de talhão, imagem de UAS (RGB): GWR superou PCR, com r = 0,74 no ambiente de seca e r = 0,46 no irrigado; "residuals from GW models were lower and less spatially dependent" que os do PCR [H-01, só abstract]. O abstract não detalha esquema de validação nem número de safras.
  - **[RESULTADO ESPECÍFICO]** Milho, US Corn Belt, escala de condado, features multi-fonte (GPP, índices, clima, solo): GWRFR obteve R² 0,90 e RMSE 0,764 MT/ha, superando MLR/PLSR/SVR/DTR/RFR em todas as categorias de features; o Moran's I dos resíduos do GWRFR foi menor que o dos demais modelos [C-13]. **Ressalva obrigatória:** escala de condado, não intra-talhão, e o esquema de validação não é detalhado (`validation=nd`) — este R² 0,90 **não** é um benchmark para grid de 20 m.
  - **[EVIDÊNCIA LIMITADA]** RFsp com distâncias-buffer obteve predições "equally accurate and unbiased" comparado à krigagem — ou seja, **empate, não superioridade** — e os próprios autores alertam que, em conjuntos com poucos pontos e poucas covariáveis, "model-based geostatistics can still lead to more accurate predictions" que o RFsp [C-10, só abstract]. Esse alerta é diretamente aplicável ao regime de poucos talhões-safra da Invicta.
  - **[LACUNA]** Existe um estudo de RFsp especificamente para mapas de produtividade [H-05, só metadados], mas nenhuma rota permitida devolveu o resumo — só é possível afirmar que ele existe.
  - **[EVIDÊNCIA LIMITADA]** Usar coordenadas X/Y como feature direta é caminho conhecido de vazamento espacial: em biomassa florestal, um RF treinado **só** com X/Y teve desempenho quase idêntico ao modelo "completo", mostrando memorização de proximidade geográfica [C-01].
- **Pontos fortes:** tratam explicitamente a não-estacionariedade (o mesmo preditor tendo efeito diferente em partes distintas do espaço) e reduzem autocorrelação residual [C-13], [H-01].
- **Limitações:** custo cresce com o número de pontos (um modelo por vizinhança); escolha da largura de banda é crítica e não há orientação na base para grid de 20 m; risco de vazamento se a ponderação geográfica vier a ser calibrada com pontos de teste [C-01], [C-07].
- **Exigência de dados:** densidade espacial suficiente para estimar modelos locais — a Invicta tem isso em pixels, mas não em unidades independentes.
- **Custo computacional:** moderado; CPU-only viável.
- **Explicabilidade:** alta em GWR (mapa de coeficientes locais); média em GWRFR.
- **Incerteza nativa?** Não nos estudos da base (`uncertainty=nao` em [C-13] e [H-01]).
- **Compatibilidade Invicta:** `novo_barato` — GWR/GWRFR são aproximáveis com numpy/scipy + scikit-learn, sem GPU. **[HIPÓTESE]** o ganho observado em escala de condado [C-13] não é demonstrado intra-talhão por nenhum estudo da base.

### 2.5 Gaussian Process / krigagem / regression-kriging de resíduos

- **O que é:** modelo probabilístico sobre funções, com covariância definida pela distância; krigagem é o caso geoestatístico clássico. Em regression-kriging, um modelo (ML) captura a tendência e a krigagem modela o resíduo espacialmente estruturado.
- **Evidência na base:**
  - **[RESULTADO ESPECÍFICO — o achado mais acionável desta ficha]** Trigo e mostarda, Índia, desagregação de estatística de vilarejo para pixel (Sentinel-1 + Sentinel-2 + clima + solo): krigar os resíduos de modelos de ML/DL reduziu o RMSE em 35–45% (GRU: 3,07 → 1,85 q/ha; LSTM: 3,56 → 1,96 q/ha); validação por agregação pixel→vilarejo contra estatísticas oficiais. O RF puro atingiu R² 0,9949 mas produziu mapas pixel a pixel "sem realismo espacial", enquanto GRU+krigagem ficou em R² 0,886 no nível de vilarejo com mapas espacialmente coerentes [H-04].
  - **[EVIDÊNCIA LIMITADA]** Soja, EUA, escala de município: um pipeline CNN ou LSTM seguido de Gaussian Process é apresentado como superior a técnicas concorrentes e viável mesmo "quando dados rotulados são escassos", com incerteza preditiva por construção — mas **sem métrica numérica verificável** no material aberto [A-08, só abstract]. Tratar como hipótese a testar.
  - **[EVIDÊNCIA LIMITADA]** Krigagem é competitiva ou superior a RFsp quando há poucos pontos e poucas covariáveis, segundo os próprios autores do RFsp [C-10].
  - **[EVIDÊNCIA LIMITADA]** Somar variâncias de pixels correlacionados do mesmo talhão como se fossem independentes subestima drasticamente o intervalo real do talhão; a saída defensável é calibração local sob exchangeability local aproximada — "spatial data can be treated as exactly or approximately exchangeable" apenas localmente [G-04, só abstract].
  - **[RESULTADO ESPECÍFICO]** Dimensionar blocos de validação espacial por variograma/correlograma é a escolha metodológica de maior impacto: "the most important methodological choice was the block size" [C-12] — um único estudo, nas condições dele.
- **Pontos fortes:** incerteza preditiva nativa; modela dependência espacial por construção; regression-kriging corrige justamente o defeito que o ML puro deixa (resíduo espacialmente estruturado) [H-04].
- **Limitações:** custo cúbico no número de pontos para GP exato — impraticável sobre todos os pixels sem aproximação; [H-04] é desagregação de estatística oficial em trigo/mostarda na Índia, **não** predição direta em talhão comercial de soja; [A-08] não tem número verificável.
- **Exigência de dados:** moderada; precisa de estrutura espacial estimável (variograma).
- **Custo computacional:** krigagem ordinária sobre grid de talhão já roda hoje na Invicta; GP global sobre todos os pixels seria caro.
- **Explicabilidade:** média — o variograma é interpretável agronomicamente (alcance = escala da variabilidade), mas não atribui efeito a preditores.
- **Incerteza nativa?** **Sim** — [A-08], [G-04] (com calibração local).
- **Compatibilidade Invicta:** `reusa` — `pykrige` já está pinado e a krigagem ordinária com validação cruzada LOO já é usada em `interp.py` para fertilidade. Aplicar krigagem sobre os resíduos de um RF/GBM é extensão barata em código — **mas só é aplicável onde o resíduo existe**: depois da colheita, ou sobre safras anteriores. Em [H-04] o agregado é observado (desagregação de estatística de vilarejo); numa previsão pré-colheita de talhão não visto não há resíduo para krigar, e usá-lo sob LOFO seria vazamento pelo alvo. Ver `../decisions/ADR-001-model-strategy.md`, D9 item 2-bis.

### 2.6 kNN (k-vizinhos mais próximos)

- **O que é:** predição pela média dos k vizinhos mais próximos no espaço de features.
- **Evidência na base:** **sem evidência direta na base revisada** — kNN aparece apenas como um dos algoritmos comparados, nunca como modelo escolhido nem com métrica própria isolada:
  - **[EVIDÊNCIA LIMITADA]** Em simulação controlada (1.728 cenários, 12.096 avaliações) mais 5 datasets reais do Benim, kNN está entre os 7 modelos testados (RF, SVM, MLR, XGBoost, LightGBM, redes neurais, kNN) e o Random Forest foi o mais robusto (R² 0,80) a dados ausentes e ao aumento do número de preditores [A-11].
  - **[EVIDÊNCIA LIMITADA]** Em soja intra-talhão com S1+S2+topografia, KNN é um dos 4 comparados (RF, KNN, MLR, DTR) e o RF foi o melhor (R² 0,41–0,89 conforme época; esquema de validação não detalhado no abstract) [B-13].
- **Pontos fortes (não medidos na base):** **[HIPÓTESE]** simplicidade e ausência de treino.
- **Limitações:** **[HIPÓTESE]** em dados espaciais, kNN no espaço de features tende a se aproximar de um interpolador espacial implícito quando as features são espacialmente suaves — o que reproduz o risco de memorização de proximidade documentado em [C-01]. Nenhum estudo da base testa isso.
- **Exigência de dados / custo / explicabilidade / incerteza:** sem evidência na base revisada.
- **Compatibilidade Invicta:** `novo_barato` (scikit-learn). **[HIPÓTESE]** sem justificativa na base para priorizá-lo sobre krigagem, que já existe na plataforma e trata a dependência espacial explicitamente.

### 2.7 SVR (Support Vector Regression)

- **O que é:** regressão de margem com kernel (tipicamente RBF), que ajusta uma função não-linear penalizando apenas erros acima de uma tolerância ε.
- **Evidência na base:**
  - **[RESULTADO ESPECÍFICO]** Soja, Paraná, intra-talhão, Sentinel-2 Vis/NIR/SWIR, grade 20 m, 15 talhões em 3 fazendas, >500 ha, safra 2019/20: SVR superou PLSR em todas as estratégias; no estádio R5, os modelos **field-based** (um por talhão) obtiveram R² entre 0,07 e 0,79 e RMSE entre 7,24 e 37,32 kg/ha; farm-based R² 0,60–0,70; global-based R² 0,75 e RMSE 38,82 kg/ha, com validação externa 75/25 confirmando R² 0,75 e RMSE 39,92 kg/ha [B-12]. **Ressalva de unidade:** a ordem de grandeza desses RMSE é muito inferior à dos demais estudos de soja da base; o próprio artigo reporta RMSE de 369,70 kg/ha no experimento com reflectância foliar da Embrapa Soja. Não comparar esses RMSE diretamente com [C-11] (554–765 kg/ha) ou [B-15] (301,52 kg/ha) sem essa ressalva.
  - **[EVIDÊNCIA LIMITADA]** SVM/SVR aparece como benchmark superado em [A-11] (por RF, simulação), [C-13] (por GWRFR, milho county-level), [H-06] (por DNN-F2, soja UAV) e [B-07] (por SGD, soja intra-talhão).
  - **[RESULTADO ESPECÍFICO]** Em predição de **atributos de solo** (não de produtividade) em 7 talhões de milho, SVM foi o melhor para K e Mg, enquanto RF foi o melhor para produtividade (R² 0,53; RMSE 0,97; 1 safra) [D-06, só abstract].
- **Pontos fortes:** funciona bem com n pequeno e p grande; o único estudo brasileiro intra-talhão com mapa de colhedora da base o coloca à frente do PLSR [B-12].
- **Limitações:** sensível a escala das features e ao tuning de C/γ/ε; não lida nativamente com categóricas nem com ausentes; não fornece importância de variáveis de forma direta.
- **Exigência de dados:** baixa a moderada.
- **Custo computacional:** cresce mais que linearmente com o nº de amostras — treinar sobre todos os pixels de muitos talhões pode ficar caro; [B-12] treinou sobre uma grade de amostragem de 40×40 m (20–30% dos pixels) e reporta que isso não perdeu acurácia frente a usar 100% dos pixels (R² 0,989 entre os dois conjuntos de predições).
- **Explicabilidade:** baixa nativamente; exigiria SHAP model-agnostic (mais caro que TreeSHAP).
- **Incerteza nativa?** Não.
- **Compatibilidade Invicta:** `novo_barato` — scikit-learn, CPU-only. Candidato forte por ser o modelo vencedor do estudo metodologicamente mais próximo do MVP [B-12].

### 2.8 Random Forest

- **O que é:** ensemble de árvores de decisão treinadas em amostras bootstrap com subconjuntos aleatórios de features; predição pela média.
- **Evidência na base (a família com mais evidência):**
  - **[RESULTADO ESPECÍFICO]** Simulação controlada (1.728 datasets simulados, 12.096 avaliações) + 5 datasets reais do Benim: RF teve o melhor R² (0,80) e a maior robustez ao aumento do número de preditores e à presença de dados ausentes, superando SVM, MLR, XGBoost, LightGBM, redes neurais e kNN; "Random Forest demonstrated greater robustness across varying conditions" [A-11]. Ressalva dos próprios autores: mecanismo de ausência testado foi apenas MCAR, e DL não foi avaliado.
  - **[RESULTADO ESPECÍFICO]** Soja, Hungria, intra-talhão, 7 talhões, 1 safra, split 70/30: RF com Sentinel-2 (10 m) obteve R² 0,90, RMSE 0,184 t/ha e MAE 0,042 t/ha, à frente de PlanetScope 3 m (R² 0,85; RMSE 0,222 t/ha) e Landsat 8 30 m (R² 0,72; RMSE 0,321 t/ha) [B-05]. Split aleatório dentro dos mesmos talhões — número otimista.
  - **[RESULTADO ESPECÍFICO]** Trigo, Reino Unido, intra-talhão, 39 talhões, >8.000 pontos de colhedora, 1 ano: RF com Sentinel-2 obteve RMSE 0,66 t/ha, caindo para 0,61 t/ha ao acrescentar variáveis ambientais [B-02].
  - **[RESULTADO ESPECÍFICO]** Soja, **15 municípios** do Paraná, safras **2005/06–2020/21** (o artigo não declara o número de safras; o intervalo corresponde a 16 — os "15" do artigo são municípios), MODIS + CHIRPS: RFR obteve R² 0,748 e RMSE 414 kg/ha em teste 20% aleatório, caindo para R² 0,693 e RMSE 585 kg/ha na safra nova 2020/21 held-out [E-brasil-04].
  - **[RESULTADO ESPECÍFICO]** Soja, Cerrado brasileiro, escala regional: RF com R² 0,81 e RMSE 176,93 kg/ha [E-brasil-07, só abstract] — escala regional, não intra-talhão.
  - **[RESULTADO ESPECÍFICO]** Soja, 56 mesorregiões brasileiras, 15 safras, **apenas** dados de estações meteorológicas: RF obteve MAPE de 8% em teste, e uma CNN sobre recurrence plots exigiu mais poder computacional **sem** superar o RF [E-brasil-05].
  - **[ALERTA — o contraponto mais importante]** Milho, US Corn Belt, validação externa contra >1 milhão de observações reais de colhedora: o RF "performed poorly when tested on years and locations not represented in the training data" e só empata com o método baseado em simulação quando treinado com ≥1.000 observações reais [B-04]. Em biomassa florestal, o RF caiu de R² 0,53 (random 10-fold) para 0,14 (spatial 44-fold) e para o nível de um modelo nulo sob buffered LOO com raio ≥100 km [C-01]. Em desagregação na Índia, o RF atingiu R² 0,9949 produzindo mapas pixel a pixel espacialmente irreais [H-04].
  - **Variante com incerteza — QRF:** **[CONSENSO]** Quantile Regression Forests estimam quantis condicionais completos, com consistência assintótica provada sob observações i.i.d. [G-02]; aplicado a amendoim e milheto em Gana (escala municipal/anual), QRF com kernel Epanechnikov produziu densidade de probabilidade completa, não só intervalo [G-06, só abstract]; em milho na China, QRF+LASSO foi o melhor entre os métodos quantílicos testados [G-14].
- **Pontos fortes:** robustez a ausentes e a muitos preditores [A-11]; lida com não-linearidade e interações sem engenharia manual; barato em CPU; importância de variáveis nativa; variante QRF dá incerteza sem trocar de família [G-02].
- **Limitações:** não extrapola além da faixa observada do alvo (prediz por média de folhas); degrada fortemente fora do domínio de treino [B-04], [C-01]; pode memorizar proximidade geográfica se coordenadas ou features espacialmente suaves dominarem [C-01]; R² alto não garante mapa espacialmente realista [H-04].
- **Exigência de dados:** moderada — [B-04] indica ≥1.000 observações reais para o RF empatar com o método baseado em simulação em milho no Corn Belt.
- **Custo computacional:** baixo em CPU; paraleliza bem.
- **Explicabilidade:** alta — importância nativa, e TreeSHAP calcula valores de Shapley exatos em tempo polinomial para modelos de árvore [G-07, só abstract].
- **Incerteza nativa?** Não no RF padrão; **sim** na variante QRF [G-02], [G-06], [G-14].
- **Compatibilidade Invicta:** `reusa` — scikit-learn é CPU-only e leve, já sinalizado como "pode entrar"; `quantile-forest` e `shap` seriam adições `novo_barato`. É o Modelo 2 da seção 29 do pedido.

### 2.9 Extra Trees (Extremely Randomized Trees)

- **O que é:** ensemble de árvores com pontos de corte sorteados aleatoriamente em vez de otimizados, e (tipicamente) sem bootstrap.
- **Evidência na base:** **sem evidência direta na base revisada.** Nenhum dos 87 estudos usa, compara ou menciona Extra Trees; a busca dedicada do eixo H registra explicitamente: "Extra Trees dedicado a produtividade não apareceu em nenhuma busca" — **[LACUNA] sub-lacuna sem evidência acessível**.
- **Pontos fortes / limitações / exigência de dados / custo / explicabilidade / incerteza:** **[HIPÓTESE]** por pertencer à mesma família de árvores em ensemble, é razoável esperar comportamento qualitativamente próximo ao do Random Forest quanto a explicabilidade (TreeSHAP aplicável [G-07]) e custo em CPU — mas isso é extrapolação, não evidência: nenhum estudo da base mede Extra Trees em produtividade agrícola.
- **Compatibilidade Invicta:** `novo_barato` (scikit-learn, mesma dependência do RF). **[DECISÃO → ADR-001 D1]** (candidato 6) incluí-lo no protocolo experimental custa quase zero (é uma linha a mais no mesmo loop de CV), mas ele **não pode ser recomendado com base na literatura revisada** — só com base no resultado do experimento próprio.

### 2.10 Gradient Boosting / XGBoost

- **O que é:** ensemble sequencial em que cada árvore corrige o resíduo das anteriores; XGBoost acrescenta regularização explícita, tratamento nativo de ausentes e otimizações de desempenho.
- **Evidência na base:**
  - **[RESULTADO ESPECÍFICO — o mais próximo do regime Invicta]** Soja, EUA, intra-talhão, PlanetScope 3,12 m, 3 talhões, safras 2019/2021, **Leave-One-Field-Out CV real**: XGBoost com SHAP obteve R² de 0,54 / 0,40 / 0,24 em três talhões-safra e **−0,58 / −1,02 / −6,23** nos outros três, com RMSE de 554 a 765 kg/ha e MAE de 421 a 676 kg/ha. Os autores registram que 2–3 safras são insuficientes para uma LOFO-CV robusta e que acrescentar solo e topografia **piorou** o desempenho (ruído/sobreajuste local) [C-11]. Este é o alerta quantitativo mais direto disponível para o MVP.
  - **[RESULTADO ESPECÍFICO]** Soja, Centro-Oeste brasileiro, escala de município, Sentinel-2 + clima, 3 safras: XGBoost aos 150 dias após a semeadura obteve R² 0,72 e RMSE 301,52 kg/ha em split 70/30, caindo para R² 0,34–0,76 e RMSE 168,31–491,17 kg/ha em validação externa em estados independentes [B-15].
  - **[EVIDÊNCIA LIMITADA]** Soja, EUA: XGBoost sobre features tabulares derivadas de sensoriamento remoto atinge acurácias "promissoras comparadas ao estado da arte… Deep Learning"; os autores motivam a escolha citando o volume de dados exigido e a natureza black-box do DL [A-05, só abstract]. **Os ganhos percentuais citados por fontes secundárias não foram confirmados no texto aberto e não entraram na base.**
  - **[RESULTADO ESPECÍFICO]** Milho, US Corn Belt, 293 condados × 35 anos: XGBoost está entre os modelos-base de um conjunto (LR, LASSO, LightGBM, RF, XGBoost + 6 ensembles) cujo melhor resultado foi um Stacked Regression acoplado ao APSIM [A-03] — ver ficha 2.21.
  - **[RESULTADO NEGATIVO]** XGBoost foi superado por SGD em soja intra-talhão na Áustria [B-07] e por RF em simulação controlada [A-11] e em soja county-level nos EUA no agregado 2017–2021 [A-09].
  - **[EVIDÊNCIA LIMITADA, evidência geral fora da agricultura]** Em 45 datasets tabulares de porte médio (~10 mil amostras) com busca extensiva de hiperparâmetros, "tree-based models remain state-of-the-art on medium-sized data" frente a redes neurais, por três vieses indutivos: robustez a features não-informativas, sensibilidade à orientação dos dados e dificuldade das redes em aprender funções irregulares [A-02, só abstract].
- **Pontos fortes:** tratamento nativo de valores ausentes; regularização explícita; desempenho forte em tabular de porte médio [A-02]; combina bem com SHAP [C-11], [G-07].
- **Limitações:** propenso a sobreajuste com poucas unidades independentes — [C-11] é a demonstração direta disso em soja intra-talhão; muitos hiperparâmetros, o que exige CV aninhada para não vazar na seleção [C-07].
- **Exigência de dados:** moderada. Não há na base nenhum estudo que estabeleça um mínimo de talhões-safra; [C-11] mostra que 3 talhões × 2 safras é insuficiente.
- **Custo computacional:** baixo em CPU.
- **Explicabilidade:** alta via TreeSHAP [G-07]; usada na prática em [C-11] e [D-12].
- **Incerteza nativa?** Não no XGBoost padrão. Alternativas da base: conformal prediction / CQR [G-01, só abstract], NGBoost [G-05, só abstract] — este último exige assumir uma família paramétrica, o que **[HIPÓTESE]** tende a ser menos robusto que QRF se o erro de produtividade for assimétrico (risco de quebra por seca); hipótese não testada na base.
- **Compatibilidade Invicta:** `reusa` / `novo_barato` — `xgboost` é CPU-only e o perfil já o sinaliza como "pode entrar". É o Modelo 3 da seção 29.

### 2.11 LightGBM

- **O que é:** gradient boosting com crescimento leaf-wise, binning de histogramas e suporte nativo a variáveis categóricas.
- **Evidência na base:**
  - **[RESULTADO ESPECÍFICO]** Milho e soja, EUA, grid de 30 m, 134 crop-site-years, clima + solo + MDE públicos: LightGBM obteve R² 0,90 e RMSE 0,46 Mg/ha para **soja** (R² 0,87 e RMSE 1,12 Mg/ha para milho) com RFECV 5-fold; a validação **group-wise por estado** reduziu o R² médio para 0,77–0,79. Para soja, o top-3 de importância (SHAP + permutação) foi declividade > precipitação de junho > elevação — terreno dominando clima; para milho, 4 das 5 features mais importantes foram climáticas. Os autores detectaram autocorrelação residual ainda em 50 m, abaixo da grade de 30 m usada [D-12].
  - **[EVIDÊNCIA LIMITADA]** LightGBM é um dos modelos-base do ensemble híbrido com APSIM em milho county-level [A-03] e um dos 7 comparados na simulação controlada onde o RF foi o mais robusto [A-11].
- **Pontos fortes:** suporte nativo a categóricas de alta cardinalidade (relevante para cultivar, unidade de mapeamento de solo, zona de manejo — ver [D-07, só abstract], que aponta "soil map unit" como variável mais importante quando os dados são agrupados entre campos); rápido; o estudo da base com métricas mais fortes para **soja intra-talhão em grid** usa LightGBM [D-12].
- **Limitações:** o mesmo risco de sobreajuste do XGBoost com poucas unidades; o próprio [D-12] mostra queda de R² ao passar para validação agrupada por estado; leaf-wise é mais propenso a sobreajuste em datasets pequenos que level-wise — **[HIPÓTESE]**, não testada na base.
- **Exigência de dados:** moderada; [D-12] usou 134 crop-site-years.
- **Custo computacional:** baixo em CPU; tipicamente o mais rápido da família.
- **Explicabilidade:** alta — SHAP e permutation importance usados explicitamente em [D-12]; TreeSHAP aplicável [G-07].
- **Incerteza nativa?** Não; objetivo quantílico disponível como alternativa, sem evidência de calibração espacial na base.
- **Compatibilidade Invicta:** `reusa` / `novo_barato` — `lightgbm` é CPU-only, sinalizado como "pode entrar". É o Modelo 4 da seção 29.

### 2.12 CatBoost

- **O que é:** gradient boosting com ordered target statistics para categóricas e ordered boosting para reduzir viés de predição.
- **Evidência na base:** **sem evidência direta na base revisada.** Nenhum dos 87 estudos usa ou compara CatBoost. **[LACUNA]**
- **Pontos fortes / limitações:** **[HIPÓTESE]** a justificativa usual para CatBoost é o tratamento de categóricas de alta cardinalidade — problema real no caso Invicta (cultivar, unidade de solo, zona de manejo), documentado como relevante em [D-07] e discutido como lacuna de codificação em [D-08, só abstract]. Mas **nenhum estudo da base testa CatBoost**, e LightGBM já oferece suporte nativo a categóricas com evidência em soja intra-talhão [D-12].
- **Exigência de dados / custo / explicabilidade / incerteza:** sem evidência na base revisada. TreeSHAP é aplicável a modelos de árvore em geral [G-07] — **[HIPÓTESE]** para o CatBoost especificamente.
- **Compatibilidade Invicta:** `novo_barato` (pacote CPU-only, ainda não pinado). É o Modelo 5 **opcional** da seção 29 — e a base revisada não fornece nenhum argumento para promovê-lo de opcional a obrigatório.

### 2.13 MLP / DNN (redes densas)

- **O que é:** rede neural feed-forward com uma ou mais camadas ocultas sobre features tabulares.
- **Evidência na base:**
  - **[RESULTADO ESPECÍFICO]** Milho, EUA, 2.267 híbridos em 2.247 locais, 142.952 amostras de treino, teste no ano de 2017: uma DNN de 21 camadas obteve RMSE 12,79 e R² 81,91% (em % da média do rendimento), contra Lasso 21,40 / 27,56%, SNN 18,04 / 60,11% e Regression Tree 15,03 / 73,8% [A-04]. **Dataset da ordem de 26× o regime do MVP Invicta.**
  - **[RESULTADO ESPECÍFICO]** Soja, EUA, intra-talhão, PlanetScope (bandas brutas), grid 10×10 m, 24.282 células, 2 safras, 3 talhões: a DNN superou SVM, RF, LASSO e AdaBoost; R² sobe de 0,26 na emergência (VE/VC) para >0,70 em R4/R5 (enchimento de grãos). Os próprios autores registram que falta testar o modelo em talhões **não** usados no treino [B-10].
  - **[RESULTADO ESPECÍFICO]** Milho e soja, Canadá, intra-talhão, validação ano-fora explícita (2011↔2012): ANN com conjunto mínimo otimizado teve erro relativo <10% em 100% dos talhões de milho em 2011 e 75% em 2012; em **soja**, <10% em apenas 37% dos talhões (2011) e <20% em 100% (2012) — soja teve erro mais alto e mais variável que milho no mesmo método. As variáveis mais importantes foram Simple Ratio e declividade, não NDVI [B-09, só abstract].
  - **[RESULTADO ESPECÍFICO]** Soja, Brasil, escala regional (~73,2 milhões de ha), **apenas** clima e balanço hídrico mensais: ANN com R² 0,88 (estimativa) e 0,86 (previsão 2 meses antes da colheita), RMSE 167,85 e 185,85 kg/ha [H-10, só abstract].
  - **[RESULTADO ESPECÍFICO — incerteza]** Milho, EUA, escala de condado: Bayesian Neural Network com R² 0,77 (fim de safra) e ~0,75 já em meados de agosto (~2 meses pré-colheita), teste em 2010–2019 com treino em anos anteriores; **a cobertura empírica do intervalo de 95% foi de ≥84%** (*"more than 84%"*) [G-13]. Mesmo um método bayesiano pode ficar abaixo da cobertura nominal na prática.
  - **[RESULTADO NEGATIVO]** Redes neurais foram superadas pelo RF em robustez na simulação controlada [A-11]; uma CNN sobre recurrence plots exigiu mais computação e não superou RF em soja mesorregional no Brasil [E-brasil-05]; a rede neural quantílica não superou a regressão quantílica tradicional em milho na China [G-14].
  - **[EVIDÊNCIA LIMITADA, evidência geral fora da agricultura]** Em tabular de porte médio, árvores permanecem estado da arte frente a redes [A-02].
- **Pontos fortes:** captura interações complexas quando há volume [A-04]; menos sujeita à saturação espectral em alta biomassa que modelos lineares, segundo [H-06].
- **Limitações:** "the needed amounts of data and the 'black-box' nature can restrict" o uso do DL [A-05]; os próprios autores de [A-04] citam a opacidade como limitação central; sensível à qualidade da previsão meteorológica.
- **Exigência de dados:** alta — todos os casos de DNN vencedora na base têm dezenas de milhares de amostras ([A-04]: 142.952) ou dezenas de milhares de células de grid ([B-10]: 24.282, mas sem teste em talhão fora do treino).
- **Custo computacional:** MLP pequeno roda em CPU; treinos maiores e ajuste de hiperparâmetros pedem GPU — `infra_nova` no perfil atual.
- **Explicabilidade:** baixa; exigiria SHAP model-agnostic.
- **Incerteza nativa?** Não no MLP padrão; **sim** na variante bayesiana [G-13], com a ressalva de cobertura empírica abaixo do nominal.
- **Compatibilidade Invicta:** `infra_nova` — PyTorch/TensorFlow e GPU são custo novo relevante no perfil, e nenhum dos casos vencedores da base opera no regime de 20–100 talhões-safra.

### 2.14 CNN (convolucional sobre imagem)

- **O que é:** rede que aplica filtros convolucionais sobre a estrutura espacial da imagem, aprendendo texturas e padrões locais em vez de índices pré-definidos.
- **Evidência na base:**
  - **[RESULTADO ESPECÍFICO]** Soja, EUA, escala de condado, MODIS + Daymet, 13 anos × 15 estados, teste sequencial ano-fora 2011–2015: CNN puro obteve RMSE de 359–363 kg/ha, contra 329,53 kg/ha (R² 0,78) do CNN-LSTM [A-10].
  - **[RESULTADO ESPECÍFICO]** Soja, Canadá, 450 plots em 3 campos, 1 safra, imagens RGB de alta resolução em 3 datas: CNN-LR obteve RMSE 510,96 kg/ha e R² 0,205, e uma média por semente (baseline) RMSE 570,57 e R² 0,010 — ambos bem atrás das variantes com Transformer [A-06].
  - **[RESULTADO NEGATIVO]** CNN sobre recurrence plots de séries climáticas não superou RF em soja mesorregional no Brasil e exigiu mais poder computacional [E-brasil-05].
  - **[EVIDÊNCIA LIMITADA]** CNN combinado a Gaussian Process é apresentado como viável mesmo com poucos rótulos, sem métrica verificável [A-08].
- **Pontos fortes:** aprende textura espacial que índices pontuais não capturam. **[HIPÓTESE]** relevante porque medidas de textura em Sentinel-2 aparecem como linha promissora em soja no Brasil [E-brasil-09, só metadados] — mas esse estudo está bloqueado e **não sustenta nenhuma métrica**.
- **Limitações:** exige imagem bruta por unidade de predição e volume de amostras; nos dois casos da base em que CNN aparece isolada, ela perde para uma arquitetura mais rica no mesmo dataset ([A-10], [A-06]).
- **Exigência de dados:** alta.
- **Custo computacional:** GPU na prática.
- **Explicabilidade:** baixa (mapas de ativação, sem atribuição por variável agronômica).
- **Incerteza nativa?** Não.
- **Compatibilidade Invicta:** `infra_nova`.

### 2.15 1D-CNN / Temporal CNN

- **O que é:** convoluções ao longo do eixo temporal de uma série de índices/bandas, aprendendo padrões fenológicos locais (rampas, picos, senescência).
- **Evidência na base:**
  - **[RESULTADO ESPECÍFICO]** Soja, EUA, escala de condado, treino 2012–2016 e teste 2017–2021: o 1D-CNN foi o mais preciso no ano de 2018 especificamente, enquanto o RF teve o menor RMSE agregado (0,342 t/ha) no conjunto dos anos de teste [A-09]. Nenhum dos dois domina.
  - **[LACUNA]** "Temporal CNN" como arquitetura nomeada (TempCNN e variantes) **não aparece em nenhum estudo da base**.
- **Pontos fortes:** **[HIPÓTESE]** consome a série temporal sem exigir escolha manual de datas/estádios — problema real, já que [B-12] registra que **não houve tendência temporal consistente na melhor data de monitoramento entre talhões**, e que índices isolados tiveram correlação ora positiva ora negativa com a produtividade na mesma safra.
- **Limitações:** o único resultado da base é em escala de condado com 10 anos de série [A-09]; sem evidência intra-talhão.
- **Exigência de dados:** alta em nº de séries (unidades), não em nº de pixels.
- **Custo computacional:** menor que CNN 2D, mas ainda pede framework de DL.
- **Explicabilidade:** baixa.
- **Incerteza nativa?** Não.
- **Compatibilidade Invicta:** `infra_nova`.

### 2.16 LSTM / GRU

- **O que é:** redes recorrentes com portas, que mantêm um estado ao longo da sequência — série temporal intra-safra ou série de safras.
- **Evidência na base:**
  - **[RESULTADO ESPECÍFICO]** Soja, sul do Brasil, escala de **município** (agregado via CAR), satélite (NDVI/EVI/LST) + meteorologia: LSTM foi o melhor na maioria das datas de previsão, com MAE subindo de 0,24 Mg/ha na previsão de março (DOY 64) para 0,42 Mg/ha na previsão de janeiro (DOY 16) [B-03]. **Nunca citar um MAE único desse estudo sem informar a data/DOY.** A tese que originou o artigo reporta MAE 0,42 Mg/ha para soja a cerca de 70 dias da colheita [E-brasil-02, só abstract].
  - **[RESULTADO ESPECÍFICO]** Trigo e mostarda, Índia, desagregação vilarejo→pixel: LSTM R² 0,9013 e GRU R² 0,9024; após krigagem dos resíduos, GRU chegou a R² 0,886 no nível de vilarejo com RMSE caindo 39,6% (3,07 → 1,85 q/ha), e o LSTM 44,9% (3,56 → 1,96 q/ha) [H-04].
  - **[EVIDÊNCIA LIMITADA]** Soja, trigo e colza, Argentina/Uruguai/Alemanha, escala **intra-talhão**: LSTM sobre série de imagens de satélite com feature attribution para identificar estádios críticos e variabilidade intra-talhão — é o estudo geograficamente e conceitualmente mais próximo do problema da Invicta, mas é **preprint**, o abstract não especifica sensor, resolução nem métricas de erro [G-11, só abstract].
  - **[EVIDÊNCIA LIMITADA]** LSTM puro obteve RMSE 359–363 kg/ha em soja county-level, atrás do CNN-LSTM [A-10].
- **Pontos fortes:** modela dependência temporal sem engenharia manual de janelas; em [H-04], as arquiteturas recorrentes produziram mapas espacialmente mais realistas que o RF, apesar de R² menor.
- **Limitações:** todos os resultados quantificados da base são em escala municipal/vilarejo ([B-03], [H-04]) ou em preprint sem métrica ([G-11]); exigem série por unidade — a Invicta tem série **intra-safra** densa, mas poucas **safras** por talhão.
- **Exigência de dados:** alta em nº de sequências independentes.
- **Custo computacional:** framework de DL; GPU na prática para tuning.
- **Explicabilidade:** baixa nativamente; [G-11] usa métodos de atribuição de features por cima.
- **Incerteza nativa?** Não.
- **Compatibilidade Invicta:** `infra_nova`.

### 2.17 CNN-LSTM

- **O que é:** CNN extrai representação espacial/espectral por data; LSTM integra a sequência dessas representações ao longo da safra.
- **Evidência na base:**
  - **[RESULTADO ESPECÍFICO]** Soja, EUA, escala de condado, MODIS (reflectância + LST) + Daymet, 13 anos (2003–2015) × 15 estados, teste sequencial ano-fora: CNN-LSTM obteve R² 0,78 e RMSE 329,53 kg/ha, superando de forma consistente o CNN puro e o LSTM puro (359–363 kg/ha) [A-10]. Limitações citadas pelos autores: dificuldade em combinar fontes com resoluções/cadências diferentes e desempenho reduzido em eventos extremos (seca de 2011 no Kansas).
  - **[RESULTADO ESPECÍFICO]** Soja, Canadá, 450 plots, 1 safra, imagens RGB de alta resolução: CNN-LSTM obteve RMSE 481,19 kg/ha e R² 0,295, sendo superado pelo Transformer proposto (332,07 kg/ha; R² 0,664) no mesmo dataset e no mesmo split fixo de 344/38/68 plots [A-06].
- **Pontos fortes:** combina estrutura espacial e temporal; é a arquitetura de DL com o resultado mais consistente da base para soja ([A-10]).
- **Limitações:** a vantagem de [A-10] foi demonstrada com **13 anos de série por unidade espacial** — condição que a Invicta não atende; e no único dataset pequeno em que compete, perde [A-06].
- **Exigência de dados:** muito alta (série longa por unidade).
- **Custo computacional:** GPU.
- **Explicabilidade:** baixa.
- **Incerteza nativa?** Não.
- **Compatibilidade Invicta:** `infra_nova`.

### 2.18 Transformers / Vision Transformers (ViT)

- **O que é:** arquiteturas baseadas em atenção; ViT trata a imagem como sequência de patches, e um transformer temporal integra as datas da safra.
- **Evidência na base:**
  - **[RESULTADO ESPECÍFICO — o único caso de DL vencendo em dataset pequeno]** Soja, Canadá, 450 plots em 3 campos, 1 safra, câmera handheld RGB de alta resolução em 3 datas, split fixo 344/38/68 plots: o modelo proposto (ViT + transformer temporal + informação de semente) obteve RMSE 332,07 kg/ha e R² 0,664, contra CNN-LSTM 481,19 / 0,295, ViT-LSTM 451,62 / 0,379, ViT-T 445,62 / 0,395 e CNN-LR 510,96 / 0,205 — "reduce the prediction error by more than 40%" frente ao CNN-LSTM [A-06].
- **Pontos fortes:** o resultado de [A-06] mostra que um Transformer pode vencer com poucos plots **desde que** haja (a) imagem de **alta resolução por parcela** e (b) informação complementar (semente). Explicabilidade parcial via scores de atenção.
- **Limitações:** um único estudo, uma única safra, sem validação talhão-fora nem ano-fora (`val_field_out=nao`, `val_year_out=nao`); imagem handheld RGB, não orbital a 10–20 m; os próprios autores citam que a duração da série temporal não foi explorada e que faltam dados genéticos/edáficos. A condição (a) **não é atendida** pela Invicta hoje: Sentinel-2 a 10–20 m sobre um grid de 20 m não é "imagem de alta resolução por parcela".
- **Exigência de dados:** moderada em nº de amostras, alta em qualidade/resolução da imagem por unidade.
- **Custo computacional:** GPU.
- **Explicabilidade:** parcial (atenção), não atribuição por variável agronômica.
- **Incerteza nativa?** Não.
- **Compatibilidade Invicta:** `infra_nova` para o MVP. **[HIPÓTESE]** se em algum momento houver imagem de altíssima resolução por parcela (ex.: UAV), [A-06] seria o precedente a reexaminar.

### 2.19 Modelos multimodais (fusão de sensores/fontes)

- **O que é:** arquiteturas que fundem fontes heterogêneas — óptico, térmico, estrutural, SAR, clima, solo — em níveis diferentes (entrada, intermediário, decisão).
- **Evidência na base:**
  - **[RESULTADO ESPECÍFICO]** Soja, EUA, escala de talhão, UAV com RGB + multiespectral + térmico, 1 site: DNN-F2 (fusão intermediária) obteve R² 0,720 e RMSE relativo de 15,9%, superando PLSR, RFR, SVR e DNN-F1 (fusão na entrada); a fusão multimodal superou o sensor único, e a DNN mostrou-se menos sujeita à saturação em alta biomassa que os modelos lineares [H-06].
  - **[RESULTADO ESPECÍFICO]** Soja, intra-talhão, Sentinel-1 (SAR) + Sentinel-2 + índice topográfico de umidade (TWI), 10 m: RF obteve R² 0,41–0,89, RMSE 0,122–0,224 t/ha e MAE 0,089–0,163 t/ha, conforme a época/estádio; a faixa ampla indica forte dependência da data de aquisição e o esquema de validação não é detalhado no abstract [B-13].
  - **[RESULTADO NEGATIVO]** Fusão espectral PlanetScope+Sentinel-2 via rede (MKSF) em soja nos EUA: **a produtividade foi o traço mais fraco** entre os previstos (R² 0,36–0,49, pico aos 93 dias após semeadura), atrás de sacarose (0,50–0,68); fusão de sensores não garantiu ganho proporcional para produtividade [B-06].
- **Pontos fortes:** SAR atravessa nuvens — relevante para a safra de verão brasileira, em que [B-12] registra 40–70% de cobertura de nuvens no Paraná, restando 4–10 imagens Sentinel-2 por talhão na safra inteira.
- **Limitações:** **[HIPÓTESE]** o ganho da fusão SAR-óptico para a safra de verão brasileira é extrapolação — [B-13] não é no Brasil tropical e nenhum estudo da base testa gap-filling de nuvem tropical para soja; [B-06] mostra que fusão pode não ajudar justamente para a variável produtividade.
- **Exigência de dados:** alta (múltiplos sensores coerentes no tempo).
- **Custo computacional:** o DNN multimodal de [H-06] exige GPU; a fusão tabular S1+S2+topografia com RF de [B-13] roda em CPU.
- **Explicabilidade:** baixa em [H-06]; herdada do RF em [B-13].
- **Incerteza nativa?** Não.
- **Compatibilidade Invicta:** `infra_nova` para a via [H-06] (sensor térmico em UAV + GPU); `novo_barato` para a via [B-13] (ingestão Sentinel-1 via STAC + RF em CPU, mas exige pipeline novo de processamento de backscatter/speckle, que hoje não existe).

### 2.20 Graph Neural Networks (GNN)

- **O que é:** redes que operam sobre grafos, propagando informação entre nós vizinhos (ex.: condados adjacentes) — aqui combinadas a uma RNN para o eixo temporal.
- **Evidência na base:**
  - **[EVIDÊNCIA LIMITADA]** EUA, escala de condado, >2.000 condados × 39 anos (1981–2019): um GNN-RNN é reportado como superando métodos estado da arte, com validação espacial via grafo geoespacial entre condados — mas **sem métrica numérica no material aberto** [A-07, só abstract].
- **Pontos fortes:** explora explicitamente a vizinhança geográfica e o eixo temporal.
- **Limitações:** o regime de dados é o oposto do da Invicta — faltam nós para construir um grafo informativo (20–100 talhões-safra, não 2.000 condados) e faltam safras para a componente recorrente.
- **Exigência de dados:** muito alta.
- **Custo computacional:** GPU.
- **Explicabilidade:** não reportada (`explainability=nao`).
- **Incerteza nativa?** Não.
- **Compatibilidade Invicta:** `infra_nova`.

### 2.21 Híbridos crop model + ML (APSIM, DSSAT, WOFOST, AquaCrop)

- **O que é:** usar as saídas de um modelo de cultura baseado em processos (fenologia, LAI, umidade do solo, estresse hídrico) como features de um modelo estatístico — ou, no caminho inverso, assimilar observações de satélite dentro do crop model.
- **Evidência na base:**
  - **[RESULTADO ESPECÍFICO]** Milho, US Corn Belt, 293 condados × 35 anos (1984–2018), ~10.016 observações anuais, **CV 10-fold aleatória para o ajuste + teste em anos retidos** — 2012 (seca extrema), 2017 e 2018 —, **não *leave-one-year-out***: acoplar saídas do **APSIM** a um ensemble de ML (LR, LASSO, LightGBM, RF, XGBoost + 6 ensembles; melhor = Stacked Regression) reduziu o RMSE em **7 a 20%** frente ao ML puro, chegando a RRMSE de 6–7% no melhor modelo híbrido; variáveis de estresse hídrico do APSIM foram as mais importantes (por importância de permutação) [A-03]. **Ressalva obrigatória, registrada pelos próprios autores:** o ganho foi medido usando o **clima real do ano de teste** como insumo do APSIM ("the weather will be unknown" na prática); em uso operacional de previsão pré-colheita o APSIM teria de rodar em modo de previsão, o que tende a reduzir o ganho reportado. O desempenho piorou justamente no ano de seca extrema de 2012, mesmo com o híbrido.
  - **[RESULTADO ESPECÍFICO]** Soja, intra-talhão, 6 talhões e 21.175 pixels, validação **pixel a pixel** contra monitor de colheita de alta densidade: acoplar o LAI recuperado do Sentinel-2 a um modelo de cultura baseado em processos, otimizando 4 parâmetros (profundidade do solo, capacidade de campo, LAI inicial, N translocado), obteve rRMSE de 28% a 51% por talhão (geral 35,8%) e índice de Lee de 0,61–0,71, confirmando similaridade de padrão espacial entre mapa simulado e observado [B-11]. Não reporta RMSE absoluto em kg/ha nem R².
  - **[RESULTADO ESPECÍFICO]** Milho e soja, EUA, escala de talhão, >17.000 talhões de milho e >11.000 de soja, Landsat + clima em grade: o SCYM (híbrido crop-model + estatístico, que **não** exige calibração com dado de campo) capturou em média 35% da variação em milho (faixa 14–58%) e 32% em soja [H-09]. **Fração de variância capturada não é R² clássico.**
  - **[RESULTADO ESPECÍFICO]** Milho, US Corn Belt, validação externa contra >1 milhão de observações de colhedora: o SCYM com suavização harmônica da série temporal elevou o r² de pixel de 0,31 para 0,40 (30 m), atingindo 0,45 no talhão e 0,69 no condado; o RF só empata quando treinado com ≥1.000 observações reais e "performed poorly when tested on years and locations not represented in the training data" [B-04]. O SCYM subestima a sensibilidade à qualidade do solo e à data de plantio frente aos dados reais.
  - **[RESULTADO ESPECÍFICO]** Soja, Paraná, 144 municípios, 5 safras: um modelo agrometeorológico determinístico superestimou a produtividade em 10,8% em 1996/97 (doença fúngica não modelada) e subestimou 10,5% em 2000/01 (datas de semeadura e cultivares não capturadas), comparado contra estatística oficial independente [E-brasil-01].
  - **[RESULTADO ESPECÍFICO]** Soja, subtrópico brasileiro, 2011–2019, simulação com CSM-CROPGRO: o gap de produtividade por déficit hídrico foi de 26–62% do potencial e o gap por manejo de 9–39%, sendo a data de semeadura o principal fator de manejo [D-08].
  - **[LACUNA]** **DSSAT** e **AquaCrop** não aparecem nominalmente em nenhum estudo da base. Os crop models efetivamente documentados são APSIM [A-03], CSM-CROPGRO [D-08], um modelo de soja baseado em processos com assimilação de LAI [B-11], o SCYM [B-04], [H-09] e um modelo agrometeorológico determinístico [E-brasil-01].
- **Pontos fortes:** incorpora conhecimento agronômico que o ML puro não tem; [B-04] mostra que o SCYM não depende de calibração com dado de campo — atributo valioso no regime de poucos talhões-safra; [B-11] é interpretável por construção (parâmetros físicos).
- **Limitações:** custo de calibração e operação por talhão; a ressalva do clima real em [A-03]; [B-11] admite que o modelo não realoca biomassa sob limitação de fonte e que os algoritmos empíricos de LAI generalizam mal; [E-brasil-01] erra em anos de pressão de doença.
- **Exigência de dados:** alta em parâmetros (solo, cultivar, manejo, clima) — e a Invicta hoje **não ingere clima** e tem disponibilidade parcial/incerta de manejo.
- **Custo computacional:** moderado por simulação, alto em calibração e manutenção.
- **Explicabilidade:** alta por construção nos modelos de processo [B-11]; parcial no híbrido de [A-03] (só importância por permutação).
- **Incerteza nativa?** Não nos estudos da base (`uncertainty=nao` em [A-03] e [H-09]); [B-11] discute similaridade espacial via índice de Lee, não intervalo de predição.
- **Compatibilidade Invicta:** `infra_nova` — nenhum crop model está na stack; acoplar e calibrar um por talhão é custo alto frente ao ganho de 7–20% de [A-03], que ainda vem com a ressalva do clima conhecido. **[DECISÃO → ADR-001 D1]** fora do MVP; manter como linha de pesquisa da Fase 2+.

---

## 3. Tabela comparativa resumida

Legenda das colunas: **Dados exigidos** = ordem de grandeza de *unidades independentes* (talhões-safra), não de pixels · **Tabular / Série / Espacial** = adequação nativa ao tipo de estrutura · **Ausentes / Categóricas** = tratamento nativo · **Custo CPU** = viabilidade no Render standard sem GPU · **Evidência na base** = forte (≥3 estudos com métrica e contexto) / limitada (1–2 estudos, ou só benchmark, ou só abstract) / nenhuma.

| Modelo | Dados exigidos | Tabular | Série temporal | Dependência espacial | Ausentes | Categóricas | Explicabilidade | Incerteza nativa | Custo CPU | Evidência na base |
|---|---|---|---|---|---|---|---|---|---|---|
| Regressão linear / Lasso / Ridge | baixo (dezenas) | sim | não (via features) | não | não | via encoding | alta | parcial | trivial | **limitada** — [A-04], [B-07], [C-13], [D-02] |
| PLS / PLSR | baixo | sim (p≫n) | não (via pooling) | não | não | via encoding | média | não | trivial | **limitada** — [B-12], [H-03], [C-13], [H-06] |
| Modelos mistos | moderado (réplicas/grupo) | sim | parcial | parcial (grupo) | não | sim (grupo) | alta | parcial | baixo | **limitada** (uso explicativo) — [D-04], [D-05] |
| GWR / GWRFR | moderado, denso no espaço | sim | não | **sim, explícita** | não | via encoding | alta (GWR) | não | moderado | **limitada** — [H-01], [C-13] |
| RFsp (RF + distâncias) | moderado | sim | não | parcial | herda RF | herda RF | média | não | baixo | **limitada** (empate c/ krigagem) — [C-10], [H-05 só metadados] |
| GP / krigagem / regression-kriging | moderado | parcial | não | **sim, explícita** | não | não | média (variograma) | **sim** | baixo–alto | **limitada, mas acionável** — [H-04], [C-10], [A-08], [G-04] |
| kNN | ? | sim | não | implícita | não | não | baixa | não | baixo | **nenhuma** (só benchmark) — [A-11], [B-13] |
| SVR | baixo–moderado | sim | não (via pooling) | não | não | não | baixa | não | moderado | **limitada** — [B-12], [D-06], [C-13] |
| Random Forest | moderado (≥1.000 obs em [B-04]) | sim | não (via features) | não | **sim** [A-11] | sim | **alta** (TreeSHAP) | sim via QRF | baixo | **forte** — [A-11], [B-02], [B-05], [B-13], [E-brasil-04], [E-brasil-05], [D-06], [B-04], [C-01] |
| Extra Trees | ? | sim | não | não | herda família | herda família | alta (TreeSHAP) | não | baixo | **nenhuma** [LACUNA] |
| Gradient Boosting / XGBoost | moderado | sim | não (via features) | não | **sim** | via encoding | **alta** (TreeSHAP) | via conformal/NGBoost | baixo | **forte** — [C-11], [B-15], [A-05], [A-03], [A-09], [A-02] |
| LightGBM | moderado | sim | não (via features) | não | **sim** | **sim, nativo** | **alta** (SHAP) | via objetivo quantílico | baixo | **limitada, mas de alta qualidade** — [D-12], [A-03], [A-11] |
| CatBoost | ? | sim | não | não | sim | sim, nativo | alta (TreeSHAP) | não | baixo | **nenhuma** [LACUNA] |
| MLP / DNN | **alto** (10⁴–10⁵ amostras) | sim | não | não | não | via encoding | baixa | sim via BNN [G-13] | alto / GPU | **limitada** — [A-04], [B-10], [B-09], [H-10], [G-13] |
| CNN (imagem) | alto | não | não | parcial (textura) | não | não | baixa | não | GPU | **limitada** — [A-10], [A-06], [E-brasil-05] |
| 1D-CNN / Temporal CNN | alto (nº de séries) | não | **sim** | não | não | não | baixa | não | GPU | **limitada** — [A-09]; TempCNN: **nenhuma** |
| LSTM / GRU | alto (nº de sequências) | não | **sim** | não | não | não | baixa | não | GPU | **limitada** — [B-03], [H-04], [G-11 preprint] |
| CNN-LSTM | **muito alto** (13 anos/unidade em [A-10]) | não | **sim** | parcial | não | não | baixa | não | GPU | **limitada** — [A-10], [A-06] |
| Transformers / ViT | moderado em n, alto em resolução | não | **sim** | parcial | não | não | parcial (atenção) | não | GPU | **limitada** (1 estudo) — [A-06] |
| Multimodais | alto | parcial | sim | parcial | não | não | baixa | não | GPU ou CPU ([B-13]) | **limitada** — [H-06], [B-13], [B-06] |
| GNN | **muito alto** (milhares de nós) | não | sim (com RNN) | **sim, explícita** | não | não | não reportada | não | GPU | **limitada, sem métrica** — [A-07] |
| Híbrido crop model + ML | alto em parâmetros | sim | sim | parcial | não | sim | alta (processos) | não | moderado + infra | **limitada** — [A-03], [B-11], [B-04], [H-09], [E-brasil-01], [D-08] |

**Aviso:** "forte" nesta tabela significa *quantidade e consistência de evidência na base revisada*, **não** superioridade de desempenho. Nenhuma célula desta tabela autoriza a frase "modelo X é melhor que Y".

---

## 4. Cenário → modelo candidato (seção 11 do pedido)

**[DECISÃO → ADR-001 D1]** A coluna "Modelo candidato" registra o que a evidência revisada torna razoável **testar primeiro**, não uma escolha. Onde a base não cobre o cenário, isso está escrito.

| Cenário | Modelo candidato | Motivo (evidência) | Limitação | ids |
|---|---|---|---|---|
| **Poucos dados** (20–100 talhões-safra) | RF ou GBM sobre poucas features tabulares; SVR/PLSR como comparadores | Em tabular de porte médio (~10 mil amostras), árvores permanecem estado da arte frente a redes [A-02]; em simulação controlada RF foi o mais robusto (R² 0,80) [A-11]; no estudo brasileiro intra-talhão mais próximo, SVR superou PLSR (R² global 0,75; RMSE 38,82 kg/ha; 10-fold + externa 75/25) [B-12] | **Nenhum estudo da base testa exatamente 20–100 talhões-safra de soja** [LACUNA]; com 3 talhões × 2 safras, o XGBoost com LOFO-CV chegou a R² −6,23 [C-11] | A-02, A-11, B-12, C-11 |
| **Muitos pixels, poucas safras** (caso Invicta) | RF/GBM com **agrupamento por talhão (`talhao_id`) na validação — nunca por talhão-safra** (ADR D5; agrupar por talhão-safra reintroduz vazamento pelo histórico do próprio talhão e pelas camadas fixas, idênticas entre safras); considerar amostrar o grid em vez de usar 100% dos pixels | Split aleatório de pixels autocorrelacionados infla o resultado: R² 0,53 → 0,14 ao trocar random 10-fold por spatial 44-fold [C-01]; CV aleatória 10-fold subestimou o erro em 5–54% [C-12]; em [B-12] amostrar 20–30% dos pixels (grade 40×40 m) não perdeu acurácia (R² 0,989 entre os dois conjuntos de predição) | Pixels não são unidades independentes; o R² reportado sem agrupamento é otimista por construção | C-01, C-12, B-12, C-11 |
| **Muitas variáveis tabulares** | LightGBM ou XGBoost com seleção de features dentro da CV | Ensemble GBM operou sobre conjunto de 598 features em milho county-level [A-03]; LightGBM com RFECV 5-fold chegou a R² 0,90 e RMSE 0,46 Mg/ha em soja em grid de 30 m (queda para R² médio 0,77–0,79 sob validação agrupada por estado) [D-12]; RF foi o mais robusto ao aumento do número de preditores em simulação [A-11] | Seleção de features **fora** da CV é vazamento documentado [C-07]; em [C-11], acrescentar solo e topografia **piorou** o desempenho em LOFO-CV | A-03, D-12, A-11, C-07, C-11 |
| **Séries temporais** | GBM com features agregadas por estádio fenológico; DL recorrente só com série longa por unidade | "Information pooled across the cropping season presented better results compared to single images" em soja no Paraná [B-12]; suavização harmônica da série elevou o r² de pixel de 0,31 para 0,40 [B-04]; CNN-LSTM só superou CNN/LSTM isolados com 13 anos × 15 estados (RMSE 329,53 vs. 359–363 kg/ha) [A-10] | **Não há tendência temporal consistente na melhor data entre talhões** [B-12]; com poucas safras por talhão, a vantagem do CNN-LSTM não é demonstrável | B-12, B-04, A-10, A-09 |
| **Forte dependência espacial** | **GWR/GWRFR** (a opção aplicável antes da colheita); krigagem dos resíduos apenas **pós-colheita** ou sobre safras anteriores | Krigar resíduos reduziu o RMSE em 35–45% e corrigiu mapas espacialmente irreais que o RF puro (R² 0,9949) não resolvia [H-04]; GWRFR teve Moran's I residual menor que os demais modelos em milho county-level [C-13]; GWR teve resíduos menores e menos dependentes espacialmente que PCR em trigo [H-01] | [H-04] é **desagregação de um agregado observado** em trigo/mostarda na Índia, não previsão intra-talhão de soja: o resíduo que ele kriga só existe porque a estatística de vilarejo é conhecida na hora da predição — num talhão pré-colheita não existe, e usá-lo sob LOFO seria vazamento pelo alvo. RFsp empatou (não superou) a krigagem, e com poucos pontos a geoestatística pode ser melhor [C-10] | H-04, C-13, H-01, C-10 |
| **Muitos valores ausentes** | Random Forest (ou GBM com tratamento nativo) | RF foi o mais robusto à presença de dados ausentes e ao aumento de preditores em 1.728 cenários simulados (R² 0,80) [A-11] | Apenas o mecanismo MCAR foi testado; padrões MAR/MNAR de campo real (nuvem sistemática em certas datas, falha de colhedora) não foram avaliados [A-11] | A-11 |
| **Variáveis categóricas** | LightGBM (categóricas nativas) ou árvores com target encoding | "Soil map unit" (categórica) foi a variável mais importante em RF quando os dados são agrupados entre campos, enquanto elevação domina na análise por campo individual [D-07]; o viés indutivo de árvores lida melhor com features não uniformes [A-02] | **Nenhum estudo da base testa cultivar (alta cardinalidade) como feature codificada em ML de produtividade intra-talhão** [LACUNA]; a literatura de manejo da base é toda de crop model [D-08] | D-07, A-02, D-08 |
| **Grande heterogeneidade entre fazendas** | Modelo por talhão, ou modelo pool com covariável de fazenda/cluster — decidir por experimento | Em soja no Paraná, os modelos **field-based** obtiveram a maior acurácia, acima de farm-based (R² 0,60–0,70) e global-based (R² 0,75 com RMSE 38,82 kg/ha), no estádio R5 [B-12]; a validação group-wise por estado derrubou o R² médio de 0,87–0,90 para 0,77–0,79 [D-12]; R² caiu de 0,72 para 0,34–0,76 entre estados independentes [B-15] | Modelo por talhão não resolve cold start (talhão novo sem histórico) — ver seção 6; [B-12] não formaliza leave-one-field-out | B-12, D-12, B-15 |
| **Precisa ser explicável** | RF/XGBoost/LightGBM + **TreeSHAP**, com ALE em vez de PDP | TreeSHAP é, segundo o próprio artigo, o **primeiro** algoritmo que calcula valores de Shapley **exatos** em tempo polinomial para modelos de árvore [G-07] — "primeiro", não "único"; SHAP já é usado em soja intra-talhão com LOFO-CV [C-11] e em grid de 30 m [D-12]; "PD plots require extrapolation… far outside the multivariate envelope of the training data" quando as features são correlacionadas — caso garantido com índices espectrais [G-08] | "Black box" é limitação central citada para DNN [A-04], [A-05]; a importância de uma variável pode mudar entre modelos igualmente bons (Rashomon set / Model Class Reliance) [G-12]; SHAP ≠ causalidade [G-09, só abstract] | G-07, G-08, G-09, G-12, C-11, D-12 |
| **Precisa rodar operacionalmente** (CPU, sem GPU) | RF / XGBoost / LightGBM / SVR / PLSR + krigagem já existente | XGBoost é citado como alternativa viável ao DL justamente pelo volume de dados e pela opacidade deste [A-05]; SVR e PLSR são leves e CPU-only e formam o pipeline de [B-12]; `pykrige` já roda em produção na Invicta [H-04 aplicável] | Componentes deep de [A-08], [A-10], [A-06], [H-06] exigiriam GPU = `infra_nova`; uma CNN chegou a exigir mais computação **sem** superar RF [E-brasil-05] | A-05, B-12, H-04, E-brasil-05 |

---

## 5. GBM vs. Deep Learning: o que a evidência sustenta

### 5.1 O que a base sustenta a favor do GBM/árvores

- **[EVIDÊNCIA LIMITADA, evidência geral fora da agricultura]** Em 45 datasets tabulares de porte médio (~10 mil amostras), com busca extensiva de hiperparâmetros e mesmo descontando a vantagem de velocidade, "tree-based models remain state-of-the-art on medium-sized data" [A-02]. Três razões de viés indutivo: robustez a features não informativas, sensibilidade à orientação dos dados e dificuldade das redes em aprender funções irregulares.
- **[RESULTADO ESPECÍFICO]** Em simulação controlada com 1.728 datasets, RF superou SVM, MLR, XGBoost, LightGBM, redes neurais e kNN em robustez (R² 0,80) [A-11].
- **[RESULTADO ESPECÍFICO]** Em soja county-level nos EUA (treino 2012–2016, teste 2017–2021), RF teve o menor RMSE agregado (0,342 t/ha) entre RF/XGBoost/DTR/LASSO/1D-CNN [A-09].
- **[RESULTADO ESPECÍFICO]** Em soja mesorregional no Brasil, uma CNN sobre recurrence plots exigiu mais poder computacional e **não** superou o RF (MAPE 8%) [E-brasil-05].
- **[RESULTADO ESPECÍFICO]** Em milho na China, a rede neural quantílica **não** superou a regressão quantílica tradicional, e QRF+LASSO foi o melhor entre os métodos quantílicos [G-14].
- **[EVIDÊNCIA LIMITADA]** Em soja nos EUA, XGBoost sobre features tabulares atinge acurácias "promissoras comparadas ao estado da arte… Deep Learning", com os autores citando explicitamente o volume de dados e a natureza black-box como restrições do DL [A-05].

### 5.2 Sob quais condições o DL venceu na base revisada

Em **todos** os quatro casos abertos em que uma arquitetura de DL venceu, ao menos uma destas condições estava presente:

| Condição | Caso | Evidência |
|---|---|---|
| **(a) Volume massivo de amostras** | DNN de 21 camadas em milho, EUA | 142.952 amostras de treino, 2.267 híbridos × 2.247 locais; RMSE 12,79 vs. 21,40 do Lasso (% da média), teste no ano 2017 [A-04] |
| **(b) Série temporal longa por unidade espacial** | CNN-LSTM em soja county-level | 13 anos (2003–2015) × 15 estados, MODIS + Daymet, teste sequencial ano-fora; RMSE 329,53 kg/ha vs. 359–363 dos modelos isolados [A-10] |
| **(b') Volume espaço-temporal extremo** | GNN-RNN | >2.000 condados × 39 anos [A-07] |
| **(c) Imagem de alta resolução por parcela** | ViT + transformer temporal em soja | 450 plots, câmera handheld RGB, 3 datas + informação de semente; RMSE 332,07 vs. 481,19 kg/ha do CNN-LSTM [A-06] |
| **(c') Fusão multimodal por parcela** | DNN-F2 em soja com UAV | RGB + multiespectral + térmico simultâneos, 1 site; R² 0,720, RMSE relativo 15,9% [H-06] |

### 5.3 Por que nenhuma dessas condições é atendida hoje

**[EVIDÊNCIA + regime de dados]**

- **(a) Volume:** o regime Invicta é de 20–100 **talhões-safra**. O número de pixels é grande, mas pixels vizinhos são autocorrelacionados e não contam como amostras independentes — [C-01] demonstra que um RF pode simplesmente memorizar proximidade geográfica, e [C-12] quantifica a subestimação de erro (5–54%) quando a CV ignora essa estrutura. O dataset de [A-04] é da ordem de 26× o regime do MVP, medido em unidades, não em células.
- **(b) Série longa por unidade:** a Invicta tem série **intra-safra** densa (robô noturno Sentinel-2/CBERS-4A), mas **poucas safras por talhão**. [A-10] precisou de 13 anos por unidade espacial; [C-11] registra explicitamente que 2–3 safras são insuficientes até para uma LOFO-CV robusta.
- **(c) Imagem de alta resolução por parcela:** o alvo do MVP é grid de 20×20 m sobre Sentinel-2 (10–20 m). Isso é o oposto de "imagem de alta resolução por parcela". Além disso, a base contém evidência de que resolução mais fina **não** converte automaticamente em melhor acurácia empírica: em simulação teórica, 3 m explicaria 100% da variabilidade intra-talhão contra 59% em 30 m, mas nos modelos empíricos reais do mesmo estudo o R² médio foi **maior** em 30 m HLS (0,56) do que em 3 m Planet (0,30) [B-08]; e em soja na Hungria, Sentinel-2 (10 m) superou PlanetScope (3 m) em R², RMSE e MAE [B-05].
- **Hardware:** o backend roda em CPU sem GPU; PyTorch/TensorFlow são custo novo relevante. [E-brasil-05] é o precedente direto de "gastou mais computação e não ganhou".

**[DECISÃO → ADR-001 D1]** Pelo critério da seção 29 do pedido ("Deep Learning somente deve entrar no MVP se a revisão demonstrar clara justificativa e houver volume de dados suficiente"), a revisão **não** demonstra essa justificativa para o regime atual. DL fica fora do MVP e é reavaliado se e quando (a), (b) ou (c) passar a ser verdade — por exemplo, com dezenas de fazendas-cliente acumulando várias safras, ou com aquisição de imagem por UAV por parcela.

---

## 6. Modelo global vs. regional vs. por talhão vs. híbrido, e cold start (seções 38–39)

### 6.1 A evidência direta

- **[RESULTADO ESPECÍFICO — evidência central]** Soja, Paraná, 15 talhões em 3 fazendas, >500 ha, Sentinel-2, grade 20 m, estádio R5: os modelos **field-based** (um por talhão) obtiveram a maior acurácia para mapear a variabilidade interna, com R² decrescente de field → farm → global. SVR field-based: R² 0,07–0,79 e RMSE 7,24–37,32 kg/ha; farm-based: R² 0,70 / 0,60 / 0,60 nas três fazendas; global-based: R² 0,75 e RMSE 38,82 kg/ha, com validação externa 75/25 confirmando R² 0,75 e RMSE 39,92 kg/ha [B-12]. **Ressalva:** a comparação é field vs. farm vs. global **sem** leave-one-field-out formal — ou seja, o modelo field-based é treinado e avaliado no mesmo talhão, o que não responde à pergunta "como ele vai num talhão novo".
- **[RESULTADO ESPECÍFICO — o contraponto que fecha o raciocínio]** Soja, EUA, 3 talhões, 2 safras, XGBoost + SHAP, **LOFO-CV real**: R² de 0,54 / 0,40 / 0,24 em três talhões-safra e **−0,58 / −1,02 / −6,23** nos outros três; RMSE 554–765 kg/ha; MAE 421–676 kg/ha. Os autores concluem que 2–3 safras são insuficientes para uma LOFO-CV robusta [C-11]. Ou seja: o ganho do modelo por talhão de [B-12] **não** se traduz em capacidade de prever um talhão nunca visto.
- **[RESULTADO ESPECÍFICO]** Milho, US Corn Belt, validação externa contra >1 milhão de observações reais: o RF "performed poorly when tested on years and locations not represented in the training data" e só empata com o método baseado em simulação quando treinado com ≥1.000 observações reais [B-04]. O método híbrido SCYM, que **não** exige calibração de campo, é o que sustenta desempenho fora do domínio.
- **[RESULTADO ESPECÍFICO]** Soja, Centro-Oeste brasileiro, escala de município: XGBoost com R² 0,72 e RMSE 301,52 kg/ha em split 70/30 cai para R² 0,34–0,76 e RMSE 168,31–491,17 kg/ha em estados independentes [B-15] — degradação de generalização espacial **mesmo em escala agregada**.
- **[RESULTADO ESPECÍFICO]** Milho/soja, EUA, grid 30 m: a validação group-wise por estado reduziu o R² médio de 0,87 (milho) / 0,90 (soja) para 0,77–0,79 [D-12].
- **[EVIDÊNCIA LIMITADA]** Em milho county-level, GWRFR — que é, na prática, um modelo global com ponderação local — obteve R² 0,90 e RMSE 0,764 MT/ha e o menor Moran's I residual entre os comparados [C-13]. Escala de condado, validação não detalhada.

### 6.2 Leitura conjunta

**[EVIDÊNCIA LIMITADA]** A base revisada sustenta um par de afirmações que parece paradoxal mas não é:

1. Um modelo ajustado **ao próprio talhão** descreve melhor a variabilidade interna daquele talhão [B-12].
2. Modelos ajustados a poucos talhões **não** transferem para talhões novos [C-11], e nem mesmo modelos em escala agregada transferem bem entre regiões [B-15], [D-12], [B-04].

Isso separa dois produtos diferentes: *descrever* a variabilidade de um talhão com histórico (onde o modelo por talhão tem evidência a favor) e *prever* um talhão sem histórico (onde a base mostra falha, não sucesso).

**[HIPÓTESE]** A arquitetura "global + calibração local" da seção 38 é a que concilia os dois — treinar um modelo sobre todos os talhões-safra disponíveis e corrigi-lo localmente. Dois mecanismos de correção local têm precedente na base, mas **só um deles funciona antes da colheita**:
- **ponderação geográfica** do próprio modelo (GWRFR), com Moran's I residual menor [C-13], `novo_barato` e sem evidência intra-talhão — **aplicável em previsão**, porque usa apenas posição e covariáveis;
- **krigagem dos resíduos** do modelo global, que reduziu RMSE em 35–45% e corrigiu mapas espacialmente irreais [H-04], e é `reusa` (pykrige já está em produção) — **mas não é aplicável em previsão pré-colheita**. **Ressalva decisiva:** em [H-04] o agregado (a estatística de vilarejo) é **observado** no momento da predição — é desagregação/interpolação de um valor conhecido, não previsão. Regression-kriging exige resíduos observados na vizinhança do ponto previsto e **na mesma safra**; em previsão pré-colheita de talhão/safra não vistos eles não existem, e usá-los sob LOFO seria vazamento pelo alvo. Sobra para ela dois usos de escopo restrito: pós-colheita (mapear o erro, completar talhão parcialmente colhido) e resíduo de **safras anteriores** como offset, sob leave-one-year-out, o que é uma hipótese de estabilidade temporal contrariada em parte por [D-04] para soja.

Nenhuma das duas foi testada em soja intra-talhão no Brasil — **[LACUNA]**, e é justamente onde o MVP pode contribuir com resultado original.

### 6.3 Cold start (seção 39)

O que a base oferece para uma fazenda nova sem histórico:

- **[RESULTADO ESPECÍFICO]** Métodos híbridos que **não exigem calibração com dado de campo** são a resposta mais direta: o SCYM capturou em média 35% da variação em milho e 32% em soja [H-09], e elevou o r² de pixel de 0,31 para 0,40 com suavização harmônica, contra o RF que só funciona com ≥1.000 observações reais [B-04]. Custo: exige um modelo de cultura, que a Invicta não tem → `infra_nova`.
- **[EVIDÊNCIA LIMITADA]** Filtro de aplicabilidade em vez de predição cega: o Area of Applicability / dissimilarity index delimita onde a predição é confiável: dentro da AOA, "prediction error… is comparable to the cross-validation error"; fora dela, o erro de validação cruzada não se aplica [C-04, só abstract]. Mapas deveriam ser publicados com medidas de erro local e global, com as áreas fora do domínio aplicável destacadas [C-05]. Isso é `novo_barato` (numpy/scipy) e é a recomendação mais segura para o cold start: **prever com faixa larga ou não prever, em vez de prever mal**.
- **[EVIDÊNCIA LIMITADA]** Similaridade de ambientes: o GWRFR pondera por proximidade geográfica [C-13] e o kNNDM casa a distribuição de distâncias teste↔treino com a de predição↔treino esperada na aplicação, reduzindo o tempo de 4,8 dias (NNDM LOO) para 1,2 min em 4.000 pontos [C-09]. Ambos são `novo_barato`.
- **[RESULTADO ESPECÍFICO]** Atualização após a primeira safra tem retorno decrescente: em 768 talhões e 5.520 mapas de colheita, o ganho de confiabilidade da classificação de zonas com anos adicionais de histórico é descrito como "modesto" (sem limiar numérico) e a distribuição de produtividade é negativamente assimétrica em todas as 4 culturas (p<0,05), o que enviesa algoritmos de estabilidade baseados em desvio-padrão — um algoritmo baseado em percentil corrige o viés [D-10, só abstract]. Notícia parcialmente boa para o cold start: não é preciso esperar 5+ safras para extrair sinal de estabilidade.
- **[RESULTADO ESPECÍFICO]** Para **soja** especificamente, o histórico do próprio talhão é um preditor **pior** do padrão espacial do que o NDVI pós-fato — ao contrário de milho, trigo e algodão, em que o histórico vence [D-04]. Isso atenua o problema de cold start em soja: a Invicta já tem a série espectral por talhão mesmo sem histórico de colheita.
- **[HIPÓTESE]** Dado o padrão field > farm > global de [B-12], um modelo nacional/regional único para o MVP provavelmente sofreria o mesmo problema com poucas safras e poucos talhões por cliente — não testado formalmente em nenhum estudo brasileiro da base.

**[DECISÃO → ADR-001 D9]** (item 2) Testar as três estratégias no mesmo protocolo (global / por fazenda / por talhão) exatamente como [B-12] fez, mas **sob LOFO-CV e leave-one-year-out** como [C-11], que é a combinação que nenhum estudo da base executou para soja intra-talhão.

---

## 7. Candidatos para o protocolo experimental do MVP

**[DECISÃO → ADR-001 D1]** O que segue são **candidatos a testar**, não decisões de arquitetura. A decisão pertence ao ADR-001, depois do experimento.

### 7.1 Núcleo definido na seção 29 do pedido

| # | Candidato | Justificativa na base | Compatibilidade |
|---|---|---|---|
| Baseline 0 | Média histórica do talhão | Referência obrigatória: em [A-06] a média por semente (baseline) teve RMSE 570,57 kg/ha e R² 0,010 — mostra o piso que qualquer modelo precisa superar. Para soja, porém, o histórico é preditor mais fraco do padrão espacial que o NDVI pós-fato [D-04] | `reusa` — `colheita.py` já produz o mapa limpo por safra |
| Baseline 1 | Regressão linear / Lasso | Piso honesto: em [C-07], após corrigir vazamento, modelos complexos não superaram substantivamente regressão clássica em pelo menos um caso reproduzido; e um linear via SGD venceu RF/XGBoost em soja intra-talhão em [B-07] | `reusa` — numpy/scipy + scikit-learn |
| Modelo 2 | Random Forest | Família com mais evidência da base; mais robusto a ausentes e a muitos preditores em simulação controlada (R² 0,80) [A-11]; usado em soja intra-talhão em [B-05], [B-13] | `reusa` — scikit-learn CPU-only |
| Modelo 3 | XGBoost | Evidência direta no regime mais próximo (soja intra-talhão com LOFO-CV) [C-11] e em soja municipal no Brasil [B-15]; tratamento nativo de ausentes | `novo_barato` — `xgboost`, CPU-only |
| Modelo 4 | LightGBM | Melhor evidência da base para soja em grid (R² 0,90; RMSE 0,46 Mg/ha com RFECV 5-fold, caindo para 0,77–0,79 sob validação agrupada) [D-12]; categóricas nativas | `novo_barato` — `lightgbm`, CPU-only |
| Modelo 5 (opcional) | CatBoost | **Sem evidência direta na base revisada** [LACUNA]. Entra apenas como linha extra no mesmo loop de CV, pelo custo marginal quase nulo | `novo_barato` |

### 7.2 Acréscimos que a revisão sugere

| # | Candidato | Justificativa na base | Compatibilidade |
|---|---|---|---|
| 6 | **Regression-kriging dos resíduos** — **[HIPÓTESE], fora da validação oficial LOFO** | Krigar resíduos reduziu o RMSE em 35–45% (GRU 3,07→1,85 q/ha; LSTM 3,56→1,96 q/ha) e corrigiu mapas que o RF puro (R² 0,9949) produzia sem realismo espacial [H-04]. **Ressalva que exclui o uso principal:** o estudo é **desagregação** de estatística de vilarejo **observada**, em trigo/mostarda na Índia; num talhão-safra pré-colheita não existe resíduo para krigar. Restam dois usos: (a) pós-colheita/diagnóstico; (b) resíduo de safras anteriores como offset, sob leave-one-year-out | **`reusa`** — `pykrige` já está pinado e em produção em `interp.py`; **inexistente no cold start** |
| 7 | **PLSR e SVR** | Reproduzem o pipeline do estudo brasileiro mais próximo do MVP (soja, Paraná, grade 20 m, Sentinel-2), em que SVR superou PLSR: global-based R² 0,75 / RMSE 38,82 kg/ha vs. 0,56 / 51,76 kg/ha [B-12] | `novo_barato` — scikit-learn |
| 8 | **Extra Trees** | **Sem evidência direta na base revisada** [LACUNA]; entra apenas por custo marginal nulo dentro do mesmo loop | `novo_barato` |
| 9 | **GWRFR** (RF geograficamente ponderado) | R² 0,90 e menor Moran's I residual em milho county-level [C-13]; GWR com resíduos menos espacialmente dependentes que PCR em trigo [H-01] — mas **nenhum teste intra-talhão na base** | `novo_barato` — aproximável com scikit-learn + scipy. Prioridade abaixo de (6) |
| 10 | **QRF** e/ou **conformal prediction (CQR)** para a faixa de produtividade | QRF estima quantis condicionais completos com consistência assintótica provada [G-02] e foi o melhor entre métodos quantílicos em milho na China [G-14]; CQR dá cobertura válida em amostra finita [G-01]. **Advertência dupla:** a garantia depende de exchangeability i.i.d., violada por pixels autocorrelacionados — a saída é calibração **local** [G-04]; e mesmo um método bayesiano "correto" entregou cobertura empírica de ≥84% contra 95% nominal [G-13], logo a cobertura precisa ser **medida**, não assumida | `novo_barato` — `quantile-forest` / MAPIE, CPU-only |
| 11 | **TreeSHAP** + **ALE** para explicabilidade | TreeSHAP é o **primeiro** algoritmo com valores de Shapley exatos em tempo polinomial para árvores [G-07] — "primeiro", não "único"; ALE deve ser preferido a PDP com features correlacionadas [G-08]; disclaimers obrigatórios sobre dependência entre features, interações e causalidade indevida [G-09]; reportar a importância de **um** modelo vencedor pode ser enganoso (Rashomon set) [G-12] | `novo_barato` — `shap`, CPU-only |
| 12 | **Comparação field / farm / global** sob LOFO-CV e leave-one-year-out | Replica [B-12] (que achou field > farm > global) sob o esquema de [C-11] (que achou R² negativo em LOFO-CV) — a combinação que **nenhum** estudo da base executou para soja intra-talhão | `reusa` — `GroupKFold` / `LeaveOneGroupOut` do scikit-learn |

### 7.3 Explicitamente fora do MVP

- **DL em todas as variantes** (MLP/DNN, CNN, 1D-CNN, LSTM/GRU, CNN-LSTM, Transformer/ViT, multimodal com GPU, GNN): `infra_nova`; nenhuma das três condições da seção 5.2 é atendida.
- **Crop model acoplado** (APSIM/CROPGRO/SCYM/assimilação de LAI): `infra_nova`; ganho de 7–20% de [A-03] vem com a ressalva do clima real do ano de teste, e nenhum crop model está na stack.
- **Sentinel-1 (SAR):** `novo_barato` em dado, `infra_nova` em pipeline (backscatter/speckle) — [B-13] mostra ganho, mas fora do Brasil tropical e com esquema de validação não detalhado. Reavaliar quando a cobertura de nuvens se mostrar bloqueante ([B-12] registra 40–70% de nuvem no Paraná, restando 4–10 imagens por talhão na safra).

---

## 8. Referências citadas

Tipo de leitura: **completo** = texto integral lido · **abstract** = apenas resumo verbatim · **metadados** = nem o resumo foi acessível (não sustenta afirmação além de "o estudo existe").

| id | Autores | Ano | Título | Link | Leitura |
|---|---|---|---|---|---|
| A-02 | Grinsztajn L, Oyallon E, Varoquaux G | 2022 | Why do tree-based models still outperform deep learning on tabular data? | https://arxiv.org/abs/2207.08815 | abstract |
| A-03 | Shahhosseini M, Hu G, Huber I, Archontoulis SV | 2021 | Coupling machine learning and crop modeling improves crop yield prediction in the US Corn Belt | https://www.nature.com/articles/s41598-020-80820-1 | completo |
| A-04 | Khaki S, Wang L | 2019 | Crop Yield Prediction Using Deep Neural Networks | https://www.frontiersin.org/journals/plant-science/articles/10.3389/fpls.2019.00621/full | completo |
| A-05 | Huber F, Yushchenko A, Stratmann B, Steinhage V | 2022 | Extreme Gradient Boosting for Yield Estimation compared with Deep Learning Approaches | https://arxiv.org/abs/2208.12633 | abstract |
| A-06 | Bi L, Wally O, Hu G, Tenuta AU, Kandel YR, Mueller DS | 2023 | A transformer-based approach for early prediction of soybean yield using time-series images | https://pmc.ncbi.nlm.nih.gov/articles/PMC10319415/ | completo |
| A-07 | Fan J, Bai J, Li Z, Ortiz-Bobea A, Gomes CP | 2022 | A GNN-RNN Approach for Harnessing Geospatial and Temporal Information: Application to Crop Yield Prediction | https://ojs.aaai.org/index.php/AAAI/article/view/21444 | abstract |
| A-08 | You J, Li X, Low M, Lobell D, Ermon S | 2017 | Deep Gaussian Process for Crop Yield Prediction Based on Remote Sensing Data | https://aaai.org/papers/11172-aaai-31-2017/ | abstract |
| A-09 | Farmonov N, Amankulova K, Khan SN, et al. | 2024 | Effectiveness of machine learning and deep learning models at county-level soybean yield forecasting | https://ojs3.mtak.hu/index.php/hungeobull/article/view/12631 | abstract |
| A-10 | Sun J, Di L, Sun Z, Shen Y, Lai Z | 2019 | County-Level Soybean Yield Prediction Using Deep CNN-LSTM Model | https://pmc.ncbi.nlm.nih.gov/articles/PMC6832950/ | completo |
| A-11 | Zinzinhedo ML, Mitchozounnou MF, Salako KV, Glele Kakai R | 2026 | Sensitivity of machine learning regression models to data structure and quality in crop yield prediction | https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0353938 | completo |
| B-01 | Kayad A. et al. | 2019 | Monitoring Within-Field Variability of Corn Yield using Sentinel-2 and Machine Learning Techniques | https://doi.org/10.3390/rs11232873 | abstract |
| B-02 | Hunt ML, Blackburn GA, Carrasco L, Redhead JW, Rowland CS | 2019 | High resolution wheat yield mapping using Sentinel-2 | https://doi.org/10.1016/j.rse.2019.111410 | abstract |
| B-03 | Schwalbert R, Amado T, Corassa G, Pott L, Vara Prasad PV, Ciampitti I | 2020 | Satellite-based soybean yield forecast: Integrating machine learning and weather data for improving crop yield prediction in southern Brazil | https://doi.org/10.1016/j.agrformet.2019.107886 | abstract |
| B-04 | Deines J, Patel R, Liang S, Dado WT, Lobell D | 2021 | A million kernels of truth: Insights into scalable satellite maize yield mapping and yield gap analysis from an extensive ground dataset in the US Corn Belt | https://doi.org/10.1016/j.rse.2020.112174 | abstract |
| B-05 | Amankulova K, Farmonov N, Akramova P, Tursunov I, Mucsi L | 2023 | Comparison of PlanetScope, Sentinel-2, and Landsat 8 data in soybean yield estimation within-field variability with random forest regression | https://pmc.ncbi.nlm.nih.gov/articles/PMC10319221/ | completo |
| B-06 | Sarkar S, Sagan V, Bhadra S, Fritschi FB | 2024 | Spectral enhancement of PlanetScope using Sentinel-2 images to estimate soybean yield and seed composition | https://pmc.ncbi.nlm.nih.gov/articles/PMC11729875/ | completo |
| B-07 | Pejak B, Lugonja P, Antic A, et al. | 2022 | Soya Yield Prediction on a Within-Field Scale Using Machine Learning Models Trained on Sentinel-2 and Soil Data | https://doi.org/10.3390/rs14092256 | abstract |
| B-08 | Skakun S, Kalecinski N, Brown MGL, Johnson DM, Vermote E, Roger J, Franch B | 2021 | Assessing within-Field Corn and Soybean Yield Variability from WorldView-3, Planet, Sentinel-2, and Landsat 8 Satellite Imagery | https://doi.org/10.3390/rs13050872 | abstract |
| B-09 | Kross A, Znoj E, Callegari D, Kaur G, Sunohara M, Lapen D, McNairn H | 2020 | Using Artificial Neural Networks and Remotely Sensed Data to Evaluate the Relative Importance of Variables for Prediction of Within-Field Corn and Soybean Yields | https://doi.org/10.3390/rs12142230 | abstract |
| B-10 | Joshi DR, Clay S, Sharma P, et al. | 2023 | Artificial Intelligence and Satellite Based Remote Sensing can be used to Predict Soybean (Glycine max) Yield | https://doi.org/10.1002/agj2.21473 | abstract |
| B-11 | Gaso D, de Wit AD, Berger A, Kooistra L | 2021 | Predicting within-field soybean yield variability by coupling Sentinel-2 leaf area index with a crop growth model | https://doi.org/10.1016/j.agrformet.2021.108553 | abstract |
| B-12 | Crusiol LGT, Sun L, Sibaldelli RNR, et al. | 2022 | Strategies for monitoring within-field soybean yield using Sentinel-2 Vis-NIR-SWIR spectral bands and machine learning regression methods | https://www.alice.cnptia.embrapa.br/alice/bitstream/doc/1151089/1/A-s11119-022-09876-5.pdf | completo |
| B-13 | Amankulova K, Farmonov N, Omonov K, Abdurakhimova M, Mucsi L | 2024 | Integrating the Sentinel-1, Sentinel-2 and topographic data into soybean yield modelling using machine learning | https://www.sciencedirect.com/science/article/pii/S0273117724000838 | abstract |
| B-14 | Al-Shammari D, Whelan B, Wang C, Bramley R, Bishop TF | 2025 | Assessment of red-edge based vegetation indices for crop yield prediction at the field scale across large regions in Australia | https://www.sciencedirect.com/science/article/pii/S1161030124004003 | abstract |
| B-15 | Pereira EC, Santos GP, Chaves ME, et al. | 2026 | Soybean yield estimation in the Brazilian Midwest using Sentinel-2 imagery | https://doi.org/10.1080/20964471.2026.2631900 | abstract |
| C-01 | Ploton P, et al. | 2020 | Spatial validation reveals poor predictive performance of large-scale ecological mapping models | https://www.nature.com/articles/s41467-020-18321-y | completo |
| C-04 | Meyer H, Pebesma E | 2021 | Predicting into unknown space? Estimating the area of applicability of spatial prediction models | https://api.openalex.org/works/https://doi.org/10.1111/2041-210X.13650 | abstract |
| C-05 | Meyer H, Pebesma E | 2022 | Machine learning-based global maps of ecological variables and the challenge of assessing them | https://www.nature.com/articles/s41467-022-29838-9 | completo |
| C-07 | Kapoor S, Narayanan A | 2023 | Leakage and the reproducibility crisis in machine-learning-based science | https://api.openalex.org/works/https://doi.org/10.1016/j.patter.2023.100804 | abstract |
| C-09 | Linnenbrink J, Milà C, Ludwig M, Meyer H | 2024 | kNNDM CV: k-fold nearest-neighbour distance matching cross-validation for map accuracy estimation | https://gmd.copernicus.org/articles/17/5897/2024/ | completo |
| C-10 | Hengl T, Nussbaum M, Wright MN, Heuvelink GBM, Gräler B | 2018 | Random forest as a generic framework for predictive modeling of spatial and spatio-temporal variables | https://api.openalex.org/works/https://doi.org/10.7717/peerj.5518 | abstract |
| C-11 | Rathore, Joshi, Dadkhah, Rizzo, Walsh, Clay, Gardezi | 2026 | On-farm soybean yield estimation using earth observation data and machine learning models | https://www.frontiersin.org/journals/agronomy/articles/10.3389/fagro.2026.1923239/full | completo |
| C-12 | Stock A | 2025 | Choosing blocks for spatial cross-validation: lessons from a marine remote sensing case study | https://www.frontiersin.org/journals/remote-sensing/articles/10.3389/frsen.2025.1531097/full | completo |
| C-13 | Khan SN, Li D, Maimaitijiang M | 2022 | A Geographically Weighted Random Forest Approach to Predict Corn Yield in the US Corn Belt | https://api.openalex.org/works/https://doi.org/10.3390/rs14122843 | abstract |
| D-02 | Kitchen NR, Drummond ST, Lund ED, Sudduth KA, Buchleiter GW | 2003 | Soil Electrical Conductivity and Topography Related to Yield for Three Contrasting Soil-Crop Systems | https://www.ars.usda.gov/ARSUserFiles/50701000/cswq-0027-123811.pdf | completo |
| D-03 | Corwin DL, Lesch SM | 2005 | Apparent soil electrical conductivity measurements in agriculture | https://www.ars.usda.gov/arsuserfiles/20360500/pdf_pubs/P1917.pdf | completo |
| D-04 | Maestrini B, Basso B | 2018 | Predicting spatial patterns of within-field crop yield variability | https://basso.psm.msu.edu/_assets/pdfs/Maestrini_and_basso_2018_FCR.pdf | completo |
| D-05 | Maestrini B, Basso B | 2018 | Drivers of within-field spatial and temporal variability of crop yield across the US Midwest | https://www.nature.com/articles/s41598-018-32779-3 | completo |
| D-06 | Khanal S, Fulton J, Klopfenstein A, Douridas N, Shearer S | 2018 | Integration of high resolution remotely sensed data and machine learning techniques for spatial prediction of soil properties and corn yield | https://doi.org/10.1016/j.compag.2018.07.016 | abstract |
| D-07 | Smidt ER, Conley SP, Zhu J, Arriaga FJ | 2016 | Identifying Field Attributes that Predict Soybean Yield Using Random Forest Analysis | https://doi.org/10.2134/agronj2015.0222 | abstract |
| D-08 | Tagliapietra EL, Zanon AJ, Streck NA, et al. | 2021 | Biophysical and management factors causing yield gap in soybean in the subtropics of Brazil | https://doi.org/10.1002/agj2.20586 | abstract |
| D-10 | Maestrini B, Basso B | 2021 | Subfield crop yields and temporal stability in thousands of US Midwest fields | https://doi.org/10.1007/s11119-021-09810-1 | abstract |
| D-12 | Smith HW, Heffernan CJ, Ashworth AJ, et al. | 2026 | Harvesting insights: interpretable machine learning to understand environmental drivers of U.S. maize and soybean yield | https://www.nature.com/articles/s41598-026-38724-z | completo |
| E-brasil-01 | Berka LMS, Rudorff BFT, Shimabukuro YE | 2003 | Soybean yield estimation by an agrometeorological model in a GIS | https://pdfs.semanticscholar.org/40c1/8873ef0d7a0307537714758fb194ac8e5aae.pdf | completo |
| E-brasil-02 | Schwalbert RA | 2019 | Imagens de satélite para predição espaço-temporal da produtividade de milho e soja em diferentes escalas geográficas (tese, UFSM) | https://repositorio.ufsm.br/handle/1/19493 | abstract |
| E-brasil-04 | Mohite JD, Sawant SA, Pandit A, Agrawal R, Pappula S | 2023 | Soybean crop yield prediction by integration of remote sensing and weather observations | https://isprs-archives.copernicus.org/articles/XLVIII-M-1-2023/197/2023/isprs-archives-XLVIII-M-1-2023-197-2023.pdf | completo |
| E-brasil-05 | Pessina ALR | 2024 | Aprendizado de máquina para predição da produtividade mesorregional de soja utilizando dados públicos de estações meteorológicas no Brasil (monografia, ICMC-USP) | https://bdta.abcd.usp.br/directbitstream/1d67e4f3-507e-4854-9f1a-f22f0d3a8192/Andre_Leal_Raymundo_Pessina.pdf | completo |
| E-brasil-07 | Barbosa dos Santos V, dos Santos AF, da Silva Cabral de Moraes JR, et al. | 2021 | Machine learning algorithms for soybean yield forecasting in the Brazilian Cerrado | https://onlinelibrary.wiley.com/doi/full/10.1002/jsfa.11713 | abstract |
| E-brasil-09 | Freitas RG, Oldoni H, Joaquim LF, Pozzuto JVF, Amaral LR | 2024 | Predicting on-farm soybean yield variability using texture measures on Sentinel-2 image | https://link.springer.com/article/10.1007/s11119-024-10176-3 | metadados |
| G-01 | Romano Y, Patterson E, Candès E | 2019 | Conformalized Quantile Regression | https://proceedings.neurips.cc/paper/2019/hash/5103c3584b063c431bd1268e9b5e76fb-Abstract.html | abstract |
| G-02 | Meinshausen N | 2006 | Quantile Regression Forests | https://jmlr.org/papers/v7/meinshausen06a.html | completo |
| G-04 | Mao H, Martin R, Reich B | 2024 | Valid Model-Free Spatial Prediction | https://arxiv.org/abs/2006.15640 | abstract |
| G-05 | Duan T, Avati A, Ding DY, et al. | 2020 | NGBoost: Natural Gradient Boosting for Probabilistic Prediction | https://proceedings.mlr.press/v119/duan20a.html | abstract |
| G-06 | Gyamerah SA, Ngare P, Ikpe D | 2020 | Probabilistic forecasting of crop yields via quantile random forest and Epanechnikov Kernel function | https://arxiv.org/abs/1904.10959 | abstract |
| G-07 | Lundberg SM, Erion G, Chen H, et al. | 2020 | From local explanations to global understanding with explainable AI for trees | https://arxiv.org/abs/1905.04610 | abstract |
| G-08 | Apley DW, Zhu J | 2020 | Visualizing the Effects of Predictor Variables in Black Box Supervised Learning Models | https://arxiv.org/abs/1612.08468 | abstract |
| G-09 | Molnar C, König G, Herbinger J, et al. | 2022 | General Pitfalls of Model-Agnostic Interpretation Methods for Machine Learning Models | https://arxiv.org/abs/2007.04131 | abstract |
| G-11 | Najjar H, Miranda M, Nuske M, Roscher R, Dengel A | 2024 | Explainability of Sub-Field Level Crop Yield Prediction using Remote Sensing (preprint) | https://arxiv.org/abs/2407.08274 | abstract |
| G-12 | Fisher A, Rudin C, Dominici F | 2019 | All Models are Wrong, but Many are Useful: Learning a Variable's Importance by Studying an Entire Class of Prediction Models Simultaneously | https://jmlr.org/papers/v20/18-760.html | completo |
| G-13 | Ma Y, Zhang Z, Kang Y, Özdoğan M | 2021 | Corn yield prediction and uncertainty analysis based on remotely sensed variables using a Bayesian neural network approach | https://api.semanticscholar.org/graph/v1/paper/DOI:10.1016/j.rse.2021.112408 | abstract |
| G-14 | Xiong T, Xia M, Li G, Li J, Xia W | 2025 | Beyond point forecasting: Probability density forecasting of corn yield based on quantile regression forest | https://api.openalex.org/works/doi:10.22434/ifamr1134 | abstract |
| H-01 | Haghighattalab A, Crain J, Mondal S, Rutkoski J, Singh RP, Poland J | 2017 | Application of Geographically Weighted Regression to Improve Grain Yield Prediction from Unmanned Aerial System Imagery | https://doi.org/10.2135/cropsci2016.12.1016 | abstract |
| H-03 | Crusiol LGT, Nanni MR, Furlanetto RH, et al. | 2021 | Yield Prediction in Soybean Crop Grown under Different Levels of Water Availability Using Reflectance Spectroscopy and Partial Least Squares Regression | https://doi.org/10.3390/rs13050977 | abstract |
| H-04 | Saravanakumar R, Jain R, Singh VK, et al. | 2026 | Hybridizing deep learning algorithms and geostatistical approaches for improved crop yield disaggregation | https://doi.org/10.1371/journal.pone.0344081 | completo |
| H-05 | Cordoba M, Balzarini M | 2021 | A random forest-based algorithm for data-intensive spatial interpolation in crop yield mapping | https://doi.org/10.1016/j.compag.2021.106094 | metadados |
| H-06 | Maimaitijiang M, Sagan V, Sidike P, Hartling S, Esposito F, Fritschi FB | 2020 | Soybean yield prediction from UAV using multimodal data fusion and deep learning | https://doi.org/10.1016/j.rse.2019.111599 | abstract |
| H-09 | Lobell DB, Thau D, Seifert C, Engle E, Little B | 2015 | A scalable satellite-based crop yield mapper | https://doi.org/10.1016/j.rse.2015.04.021 | abstract |
| H-10 | Barbosa dos Santos V, dos Santos AMF, Rolim GS | 2021 | Estimation and forecasting of soybean yield using artificial neural networks | https://doi.org/10.1002/agj2.20729 | abstract |

---

### Nota de encerramento

Este documento **não** contém nenhum `[RESULTADO]`: não há experimento próprio ainda. As seções 4 e 7 alimentam o ADR-001, que é onde as decisões de arquitetura de modelagem são formalizadas com o regime de dados real da Invicta e com o resultado do protocolo experimental.
