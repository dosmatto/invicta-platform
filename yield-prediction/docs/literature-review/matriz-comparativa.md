# Matriz Comparativa dos Estudos

> Seção 9 do pedido original. Recorte: os **30 estudos mais relevantes para predição intra-talhão
> de soja**, selecionados entre os 87 da base verificada
> (`papers-database.csv`), priorizando **soja → Brasil → escala intra-talhão → validação
> talhão-fora/ano-fora**. A tabela está ordenada **do esquema de validação mais rigoroso para o
> menos rigoroso**, e não por desempenho.

---

## Aviso — por que esta tabela não pode ser lida como um ranking

**Nenhuma métrica desta tabela deve ser comparada diretamente com outra linha.** Cultura, escala,
unidade, resolução, número de safras, dificuldade do conjunto de dados e — sobretudo — **tipo de
validação** diferem entre as linhas. A consequência prática:

> **Um R² de 0,90 obtido com split aleatório de pixels dentro dos mesmos talhões é menos confiável
> do que um R² de 0,40 obtido num talhão completamente independente.**

Esse não é um princípio abstrato: está quantificado na própria base. Em um mesmo estudo, com o
mesmo modelo e os mesmos dados, o R² caiu de **0,53 (validação aleatória 10-fold) para 0,14
(validação espacial 44-fold)** [C-01]; a validação aleatória 10-fold **subestimou o erro em 5–54%**
conforme o modelo [C-12]; e em soja intra-talhão sob leave-one-field-out o R² foi **negativo em 3
dos 6 talhões-safra retidos** [C-11].

Três cuidados adicionais, específicos desta tabela:

1. **Efeito de agregação.** O mesmo modelo e os mesmos dados dão r² de 0,31–0,40 por pixel de
   30 m, 0,45 por talhão e 0,69 por condado [B-04]. **Linha de escala municipal não é benchmark de
   acurácia intra-talhão.**
2. **Métricas não equivalentes.** [B-14] (não incluído nesta tabela) reporta CCC, que não é R² nem
   RMSE. [H-09] reporta **fração de variância capturada**, que não é R² clássico. [C-09] teve o R²
   removido da base porque o valor de 28% era a fração de variação do RMSE explicada por uma
   estatística de Wasserstein.
3. **Células vazias são honestas.** Onde não há número, é porque o estudo não reportou métrica
   numérica na fonte acessível (50 das 87 linhas da base estão nessa condição) ou porque o estudo
   só pôde ser lido em abstract/metadados. **Nenhum valor foi estimado, arredondado de terceiros ou
   inventado para preencher a tabela.**

---

## Legenda — tipos de validação, do mais para o menos rigoroso

| Código | Tipo | O que testa | Por que é mais ou menos rigoroso |
|---|---|---|---|
| **V1** | **Talhão-fora** (leave-one-field-out, LOFO-CV) | treina em vários talhões, prevê um talhão inteiro nunca visto | Reproduz exatamente o caso de uso do produto. Nenhum pixel do talhão de teste esteve no treino. |
| **V2** | **Ano-fora / safra retida** (leave-one-year-out) | treina em safras passadas, prevê uma safra não vista | Testa transferência temporal (clima, cultivar, manejo diferentes). Não impede vazamento espacial se o mesmo talhão aparece nos dois lados. |
| **V3** | **Externa espacial ou contra fonte independente** | prevê outra região/estado, ou compara contra dado independente (colhedora, estatística oficial) | Testa generalização fora do domínio de treino, mas frequentemente em escala agregada. |
| **V4** | **Espacial pixel a pixel, mesmo domínio** | compara mapa previsto contra mapa observado nos mesmos talhões/safras | Avalia realismo espacial, mas **não** generalização para talhão novo. |
| **V5** | **Split aleatório** | divide observações ao acaso entre treino e teste | Sujeito a vazamento espacial: pixels vizinhos autocorrelacionados ficam dos dois lados. Serve apenas como benchmark otimista. |
| **V6** | **Não declarado (`nd`)** | — | A métrica não é interpretável sem o esquema. Tratar como limite superior otimista. |

**Coluna "Leitura"**: `íntegra` = texto completo lido · `abstract` = somente abstract verbatim ·
`metadados` = sem abstract acessível. O nível de leitura de **todos** os 87 estudos da base — e não
só dos 30 desta tabela — está na seção 9 de
`estado-da-arte.md`; nas leituras transversais ao final deste documento, consulte essa coluna ou
aquela tabela antes de dar peso a qualquer número.

---

## A tabela

### V1 — Validação talhão-fora (leave-one-field-out)

| Estudo | Cultura | País | Escala | Dados/sensor | Modelo | Resolução | Safras/Talhões | Validação (tipo explícito) | R² | RMSE (unidade) | Principal conclusão | Leitura |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **[C-11]** Rathore et al. 2026 | soja | EUA (South Dakota) | intra-talhão | PlanetScope (10 índices) + solo + topografia | XGBoost (só índices de vegetação) | 3,12 m | 2 safras (2019, 2021) / 3 talhões | **V1** — Leave-One-Field-Out CV | 0,54 / −0,58 / 0,40 / 0,24 / −1,02 / −6,23 (por talhão-safra retido) | 554–765 kg/ha (faixa entre talhões-safra); MAE 421–676 kg/ha | **A linha mais importante da tabela.** Regime de dados quase idêntico ao nosso e R² negativo em 3 de 6 casos sob talhão-fora. Solo e topografia **pioraram** o desempenho (ruído/sobreajuste local); o melhor modelo usou só índices. Autores afirmam que 2–3 safras são insuficientes para LOFO-CV robusta. | íntegra |
| **[C-14]** Habibi, Matsui & Tanaka 2023 | soja | Japão (Gifu) | intra-talhão | UAV multiespectral (índices) | LASSO, RF, XGBoost, ensemble empilhado | nd | 4 safras (2018–2021) / 7 talhões | **V1** — RCV vs. CV espacial por cluster vs. LOFOCV, testados contra talhão independente | — | — | Comparação direta dos três esquemas no mesmo conjunto: a CV aleatória teve acurácia pobre ao prever talhão independente, enquanto CV espacial e LOFOCV ficaram dentro da faixa de acurácia válida. Sem números no resumo de congresso (2 páginas). | íntegra (relatório/proceedings) |

### V2 — Validação ano-fora / safra retida

| Estudo | Cultura | País | Escala | Dados/sensor | Modelo | Resolução | Safras/Talhões | Validação (tipo explícito) | R² | RMSE (unidade) | Principal conclusão | Leitura |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **[D-12]** Smith et al. 2026 | milho e soja | EUA (9 estados) | intra-talhão | clima + solo + MDE públicos | LightGBM | grade 30 m | multi-anos (incl. 2012, 2018) / 134 crop-site-years | **V2 + V3** — RFECV 5-fold, validação por ano **e** *group-wise* por estado | 0,87 (milho) / 0,90 (soja); **0,77–0,79 sob validação por estado** | 1,12 (milho) / 0,46 (soja) Mg/ha | Para **soja**, o top-3 por SHAP é declividade > chuva de junho > elevação: **terreno domina o clima**. Para milho, 4 das 5 principais são climáticas. Autocorrelação residual detectada ainda a 50 m, acima da grade de 30 m. A validação espacial derruba o R² em ~0,10. | íntegra |
| **[E-brasil-04]** Mohite et al. 2023 | soja | **Brasil** (Paraná) | município | MODIS (NDVI/EVI/LST) + CHIRPS | Random Forest Regression (ntree=200, mtry=5) | 1 km MODIS / ~5 km CHIRPS, agregado por município | safras 2005/06–2020/21 (16 safras no intervalo; o artigo não declara o nº de safras — os "15" do artigo são municípios) / **15 municípios** | **V2 + V3** — split 80/20 aleatório + 3-fold para tuning + **safra 2020/21 retida** | 0,748 (teste 20%) → **0,693 (safra nova)** | 414 (teste 20%) → **585 kg/ha (safra nova)** | Única evidência brasileira quantificada do otimismo do split aleatório: trocar split aleatório por safra retida custa 0,055 de R² e +171 kg/ha de RMSE — **e isso em escala municipal, onde a agregação já suaviza o erro.** | íntegra |
| **[B-09]** Kross et al. 2020 | milho e soja | Canadá | intra-talhão | satélite (índices) + MDE/relevo | ANN com conjunto mínimo otimizado | nd | 2 safras (2011, 2012) / múltiplos talhões | **V2** — treino em um ano, teste no outro | — | erro relativo: milho <10% em 100% dos talhões (2011) e 75% (2012); **soja <10% em apenas 37% (2011)**, <20% em 100% (2012) | Duas lições: (i) o índice mais importante **não foi NDVI nem NDRE, foi Simple Ratio combinado com declividade** — relevo pesa tanto quanto espectro; (ii) a transferibilidade milho→soja **não é automática**: mesmo método, mesmos anos, erro muito maior em soja. | abstract |
| **[A-10]** Sun et al. 2019 | soja | EUA (15 estados) | município | MODIS (refletância + LST) + Daymet | CNN-LSTM | nativa MODIS | 13 anos (2003–2015) / nível de condado | **V2** — treino com anos anteriores, teste sequencial 2011–2015 | 0,78 | 329,53 kg/ha | CNN-LSTM supera CNN e LSTM isolados de forma consistente — **mas exige série temporal de 13 anos por unidade espacial**, condição ausente no nosso regime. Desempenho cai em eventos extremos (seca de 2011 no Kansas). | íntegra |
| **[A-09]** Farmonov et al. 2024 | soja | EUA (Corn Belt) | município | nd | RF (agregado) / 1D-CNN (em 2018) | nd | treino 2012–16, teste 2017–21 / nível de condado | **V2** — split temporal | — | 0,342 t/ha (RF, agregado) | **Contradição explícita de "melhor modelo":** RF tem o menor RMSE no agregado, mas o 1D-CNN é o mais preciso especificamente em 2018. Nenhum modelo domina todos os anos — janela de treino curta (5 anos). | abstract |
| **[A-03]** Shahhosseini et al. 2021 | milho | EUA (IL, IN, IA) | município | clima + solo + plantio + **22 saídas do APSIM** | Stacked Regression (híbrido com crop model) | grid APSIM 5 arcmin | 35 anos (1984–2018) / 293 condados, ~10.016 obs | **V2** — CV 10-fold **aleatória** + anos de teste retidos (2012, 2017, 2018); o estudo **não** descreve leave-one-year-out | negativo em alguns modelos de referência no ano de 2012 | **redução de 7–20% no RMSE** com o híbrido; RRMSE mínimo de 6–7% | Híbrido crop model + ML mais citado da literatura. **Ressalva obrigatória: o ganho foi medido com o clima REAL do ano de teste alimentando o APSIM** — em previsão pré-colheita o clima é desconhecido e o ganho tende a cair. Variáveis de estresse hídrico do APSIM foram as mais importantes. | íntegra |
| **[G-13]** Ma et al. 2021 | milho | EUA (Corn Belt) | município | satélite (série) + clima + mapas de solo + histórico | Bayesian Neural Network | nd | desde 2001, teste 2010–2019 / nível de condado | **V2** — treino em anos anteriores, teste 2010–2019 | 0,77 (fim de safra); ~0,75 (meados de agosto, ~2 meses pré-colheita) | — | **A referência de incerteza da base.** O intervalo de confiança nominal de 95% teve **cobertura empírica de ≥84%** das observações (*"more than 84%"* no abstract) — garantia teórica não substitui verificação empírica de cobertura. | abstract |
| **[A-04]** Khaki & Wang 2019 | milho | EUA (2.247 locais) | talhão (ensaios de híbridos) | 627 marcadores genéticos + 8 de solo + 72 climáticas | DNN de 21 camadas | nd | 2008–2016 treino, 2017 alvo / 142.952 amostras de treino | **V2** — divisão sem sobreposição híbrido-local, 2017 fora do treino | 81,91% | 12,79% da média do yield (Lasso: 21,40%) | Demonstra a condição em que o DL vence: **volume de dados cerca de 26× maior que o do nosso MVP**. Autores citam a natureza de caixa-preta como limitação e a sensibilidade à qualidade da previsão meteorológica. | íntegra |

### V3 — Validação externa espacial ou contra fonte independente

| Estudo | Cultura | País | Escala | Dados/sensor | Modelo | Resolução | Safras/Talhões | Validação (tipo explícito) | R² | RMSE (unidade) | Principal conclusão | Leitura |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **[B-04]** Deines et al. 2021 | milho | EUA (Corn Belt) | intra-talhão até condado | Landsat (método SCYM, suavização harmônica) | SCYM (simulação) e RF | 30 m (pixel) até condado | 11 safras (2008–2018) / **>1.000.000 de observações de colhedora** | **V3** — comparação pixel a pixel contra dados reais de colhedora; SCYM não usa dado de campo para calibrar; RF testado em anos/locais fora do treino | pixel 30 m: 0,31 sem suavização / **0,40 com suavização harmônica**; talhão 0,45; condado 0,69 | — | **A validação mais robusta da base e a evidência direta do efeito de agregação.** Dois achados críticos para nós: (i) suavizar a série temporal sobe o r² de 0,31 para 0,40 sem trocar de modelo; (ii) o RF puro só funciona bem com ≥1.000 observações reais de calibração e **degrada fora do domínio de treino**. | abstract |
| **[B-15]** Pereira et al. 2026 | soja | **Brasil** (Centro-Oeste) | município | Sentinel-2 (bandas + índices) + clima | XGBoost aos 150 dias após semeadura | agregado por município | 3 safras (2019/20–2021/22) | **V3** — split 70/30 por DAS + **validação externa em estados independentes** | 0,72 (treino/teste) → **0,34–0,76 (estados independentes)** | 301,52 → **168,31–491,17 kg/ha** | Mesmo em escala agregada, generalizar para outro estado derruba o R² para até 0,34. NDRE e bandas red-edge/SWIR/red/NIR entre as mais importantes. Melhor desempenho aos 150 DAS — **pouca antecipação real**. | abstract |
| **[H-04]** Saravanakumar et al. 2026 | trigo e mostarda | Índia (Haryana) | município → pixel | Sentinel-1 (SAR) + Sentinel-2 + ERA5-Land + SoilGrids | GRU + krigagem dos resíduos | pixel ~10–20 m desagregado de nível vilarejo | nd / estatísticas de vilarejo | **V3** — agregação pixel→vilarejo/bloco contra estatísticas oficiais | RF 0,9949 (sem realismo espacial); LSTM 0,9013; GRU 0,9024; **GRU+krigagem 0,886** | **redução de 35–45% após krigagem dos resíduos** (GRU 3,07 → 1,85 q/ha; LSTM 3,56 → 1,96 q/ha) | **Duas lições transferíveis.** (i) R² altíssimo pode vir acompanhado de mapa espacialmente irreal — métrica global e qualidade de mapa divergem. (ii) Krigar os resíduos de um modelo já treinado reduz o RMSE em 35–45% — e `pykrige` já está na nossa stack. | íntegra |
| **[H-03]** Crusiol et al. 2021 | soja | **Brasil** (Londrina, PR — Embrapa Soja) | talhão / parcela experimental | espectrorradiômetro **proximal** de folha (400–2500 nm) | PLSR (estádio R5) | pontual (folha), sem grade | 3 safras (2016/17–2018/19) / parcelas em blocos | **V3** — calibração / validação cruzada / **validação externa** | 0,731–0,924 (por safra, R5); 0,775 / 0,730 / 0,688 (calib./CV/externa, modelo único das 3 safras) | 334–403 kg/ha (por safra, R5); <634 kg/ha (modelo único) | Teto de acurácia espectral em soja **sob condições de sensor ideal**: R5 é o melhor estádio e o PLSR é mais acurado sob déficit hídrico. **Não é comparável a linhas orbitais** — sensor proximal de folha, parcela experimental. | abstract |
| **[E-brasil-01]** Berka, Rudorff & Shimabukuro 2003 | soja | **Brasil** (Paraná) | município | estações meteorológicas + CBERS-1 WFI (só delimitação de área) | AGROMET (agrometeorológico determinístico) | não-pixel | 5 safras (1996/97–2000/01) / 144 municípios | **V3** — comparação contra estatística oficial SEAB (teste t pareado) | — | diferença absoluta: **+10,8% em 96/97 e −10,5% em 00/01** | Clássico brasileiro e alerta permanente: o erro de +10,8% foi atribuído a **oídio não modelado**, e o de −10,5% a datas de semeadura e cultivares não capturadas. No Brasil, o resíduo de um modelo clima+espectro pode ser dominado por fitossanidade e manejo. | íntegra |

### V4 — Validação espacial pixel a pixel, mesmo domínio (sem talhão-fora)

| Estudo | Cultura | País | Escala | Dados/sensor | Modelo | Resolução | Safras/Talhões | Validação (tipo explícito) | R² | RMSE (unidade) | Principal conclusão | Leitura |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **[B-11]** Gaso et al. 2021 | soja | nd | intra-talhão | Sentinel-2 (LAI assimilado em modelo de cultura) | híbrido: crop model + assimilação de LAI | pixel Sentinel-2 | 7 campanhas de campo / **6 talhões, 21.175 pixels** | **V4** — pixel a pixel contra monitor de colheita de alta densidade | — | rRMSE 28–51% (35,8% no geral); índice de Lee 0,61–0,71 | Alternativa ao ML puro que **não depende de muitos talhões para calibrar**: modelo baseado em processos + LAI de satélite. Interpretável por construção (profundidade do solo, capacidade de campo, N translocado). Custo: exige implementar um crop model. | abstract |
| **[B-08]** Skakun et al. 2021 | milho e soja | EUA (Iowa) | intra-talhão | WorldView-3 (~1 m), PlanetScope (3 m), Sentinel-2 (10–20 m), Landsat 8/HLS (30 m) | modelos empíricos por sensor | 1 / 3 / 10 / 20 / 30 m (comparação) | nd / múltiplos talhões, verdade de campo por GPS de colhedora | **V4** — contra pontos de colhedora GPS + simulação de degradação de resolução | **simulação**: 100% da variabilidade a 3 m → 86% (10 m) → 72% (20 m) → 59% (30 m). **Empírico**: 0,21–0,88 (média **0,56**) a 30 m HLS; 0,09–0,77 (média **0,30**) a 3 m Planet | — | **A contradição de resolução, dentro de um único estudo.** A teoria favorece 3 m; os modelos empíricos reais foram melhores a 30 m. Qualidade radiométrica e consistência temporal pesam tanto quanto o tamanho do pixel. Também documenta **saturação**: R² menor nos talhões de maior produtividade. | abstract |

### V5 — Split aleatório declarado (benchmark otimista)

| Estudo | Cultura | País | Escala | Dados/sensor | Modelo | Resolução | Safras/Talhões | Validação (tipo explícito) | R² | RMSE (unidade) | Principal conclusão | Leitura |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **[B-12]** Crusiol et al. 2022 (Embrapa Soja) | soja | **Brasil** (Paraná — Astorga e Mauá da Serra) | intra-talhão | Sentinel-2, **9 bandas Vis/NIR/SWIR + 8 índices** | SVR (melhor, *field-based*, estádio R5) e PLSR | **grade de 20 m** no mapa de produtividade; S2 nativo 10–20 m | 1 safra principal (2019/20) / **15 talhões em 3 fazendas, >500 ha** | **V5** — 10-fold CV **aleatória** + *hold-out* 75/25 nos **mesmos 15 talhões**, 1 safra, rotulado pelos autores como "validação externa"; **sem talhão-fora e sem safra-fora** (o CSV registra `val_random=sim`, `val_field_out=nao`) | *field-based* 0,07–0,79 (15 talhões); *farm-based* 0,60–0,70; *global-based* 0,75 | *field-based* 7,24–37,32; *global-based* 38,82 — registrado na base em kg/ha (ver nota abaixo da tabela) | **O estudo mais próximo do nosso MVP**: mesma cultura, mesmo país, mesma grade de 20 m, mesmo pipeline (mapa de colheita → filtro → grade → Sentinel-2 → ML). Achado central: **modelo por talhão > por fazenda > global**. Bandas brutas superaram os 8 índices. Nebulosidade de 40–70% deixou apenas **4–10 imagens por talhão na safra**. **Não responde se generaliza para talhão novo** — e é por isso que esta linha está em V5, e não em V3: o "externo" dos autores é uma partição de observações do mesmo conjunto de talhões e da mesma safra, e deu praticamente o mesmo resultado do CV interno (R² 0,75 / 0,75). O crédito qualitativo (*field* > *farm* > *global*) permanece. | íntegra |
| **[B-02]** Hunt et al. 2019 | trigo | Reino Unido | intra-talhão | Sentinel-2 + meteorologia + topografia + umidade do solo | Random Forest | 10 m | 1 safra / **39 talhões, >8.000 pontos de colhedora** | **V5** — treino/validação com pontos de colhedora das 39 lavouras, com extrapolação para a paisagem | — | 0,66 (só S2) / 0,61 (S2 + ambientais) t/ha | Método (RF + Sentinel-2 + ambientais) diretamente transferível a soja, e conjunto grande de talhões. Estudo de **um único ano**: não testa estabilidade interanual. | abstract |
| **[B-05]** Amankulova et al. 2023 | soja | Hungria | intra-talhão | PlanetScope (3 m), Sentinel-2 (10 m), Landsat 8 (30 m) + topografia/meteorologia | Random Forest (500 árvores) | 3 / 10 / 30 m (comparação) | 1 safra (2021) / **7 talhões** (3 desenvolvimento, 4 validação) | **V5** — split 70/30 | PS 0,85 / **S2 0,90** / L8 0,72 | PS 0,222 / **S2 0,184** / L8 0,321 t/ha (só espectral); com ambientais: 0,165 / 0,177 / 0,271 t/ha | **Resultado contraintuitivo:** Sentinel-2 (10 m) superou PlanetScope (3 m) em R², RMSE e MAE simultaneamente. Estádio ótimo entre V4-V5 e R1, **60–70 dias antes da colheita**. O clima em pixel grosseiro (4 km) diluiu o ganho da resolução fina. | íntegra |
| **[B-06]** Sarkar et al. 2024 | soja | EUA (Columbia, MO) | intra-talhão | fusão espectral PlanetScope + Sentinel-2 (rede neural MKSF) | RFR e outros | 3 m fundido com bandas de 10–20 m | 3 safras (2017, 2020, 2021) / 2 campos (91 + 191 parcelas), 426 amostras | **V5** — split 70/30 + CV 80/20 no treino, *early stopping* | **rendimento 0,36–0,49** (pico aos 93 DAS); sacarose 0,50–0,68; proteína/fibra/amido 0,0–0,35 | — | **Resultado negativo relevante:** entre todos os traços previstos, **a produtividade foi o mais fraco** — pior que sacarose. Fusão espectral PlanetScope+S2 não garante ganho proporcional para yield. Subpredição de valores altos. | íntegra |
| **[B-01]** Kayad et al. 2019 | milho | Itália (norte) | intra-talhão | Sentinel-2 (índices de 34 imagens) | Random Forest | 10 m | 3 safras (2016–2018) / **1 talhão (22 ha)** | **V5** — *hold-out* de metade das observações (mesmos talhão/safras); **tipo de partição não especificado no abstract** — está em V5 por inferência, não por declaração dos autores | GNDVI 0,48 (índice único) / RF ~0,60 | — | O índice individual mais correlacionado foi **GNDVI, não NDVI**. Estádio ótimo R4–R6 (105–135 dias após plantio) em milho. Um único talhão e split de observações: **risco alto de vazamento espacial**. | abstract |
| **[A-06]** Bi et al. 2023 | soja | Canadá | talhão (450 plots) | câmera *handheld* RGB de alta resolução, 3 datas | ViT + transformer temporal + informação de semente | sem grade definida | 1 safra (2020) / **450 plots em 3 campos** | **V5** — split fixo 344/38/68 plots | 0,664 | 332,07 kg/ha | **O único caso da base em que DL venceu com conjunto pequeno**: reduziu o erro em mais de 40% frente a CNN-LSTM no mesmo conjunto (RMSE 332 vs. 481 kg/ha). Condição habilitante: imagem bruta de alta resolução **por parcela** + informação de semente. | íntegra |

### V6 — Esquema de validação não declarado

> As linhas abaixo têm `validation = nd` na base. **As métricas devem ser lidas como limite
> superior otimista**, não como desempenho esperado em produção.

| Estudo | Cultura | País | Escala | Dados/sensor | Modelo | Resolução | Safras/Talhões | Validação (tipo explícito) | R² | RMSE (unidade) | Principal conclusão | Leitura |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **[B-10]** Joshi et al. 2023 | soja | EUA | intra-talhão | PlanetScope — **apenas bandas brutas**, sem índices | Deep Neural Network | **grid 10 × 10 m** | 2 safras (2019, 2021) / **3 talhões, 24.282 células** | **V6** — não detalhado; os autores reconhecem que falta testar em talhões fora do treino | **0,26 (VE/VC, emergência) até >0,70 (R4/R5, enchimento de grãos)** | — | **A melhor referência da base para a curva de acurácia por estádio em soja** (6 pontos). Bandas brutas, sem nenhum índice, bastaram para produzir essa curva. Grade de 10 m, próxima do nosso alvo de 20 m. Limitação declarada pelos próprios autores: sem teste talhão-fora. | abstract |
| **[B-07]** Pejak et al. 2022 | soja | Áustria (Alta Áustria) | intra-talhão | Sentinel-2 (**apenas 3 imagens/ano sem nuvem**) + dados de solo | **Stochastic Gradient Descent** (superou RF e XGBoost) | 10 m | 3 safras (2018–2020) / 411 ha de fazendas | **V6** — não fica claro no abstract se é safra-fora ou aleatório | coef. de correlação 0,83 (não é R²) | MAE 4,36 kg/pixel = 0,436 t/ha | **Resultado contra-hegemônico:** SGD superou RF e XGBoost — reforça não presumir vencedor de algoritmo. Contribuição metodológica aproveitável: o método de **interpolação polígono-pixel** para casar polígonos de colheita com pixels de satélite. | abstract |
| **[B-13]** Amankulova et al. 2024 | soja | nd | intra-talhão | **Sentinel-1 (SAR) + Sentinel-2 + TWI** | Random Forest | 10 m | nd | **V6** — não detalhado (aleatório vs. talhão-fora não fica claro) | 0,41–0,89 (faixa por época/estádio) | 0,122–0,224 t/ha; MAE 0,089–0,163 t/ha | Única evidência da base do ganho de **fusão SAR + óptico + topografia** em soja. A faixa larga de R² mostra dependência forte da data de aquisição, não só da resolução. Não testado em safra tropical brasileira. | abstract |
| **[H-06]** Maimaitijiang et al. 2020 | soja | EUA (Columbia, MO) | talhão | UAV RGB + multiespectral + **térmico** (fusão multimodal) | DNN-F2 (fusão intermediária) | alta (GSD não informado) | nd / 1 site, 3 genótipos | **V6** — não declarado | 0,720 | RMSE relativo 15,9% | Fusão multimodal supera sensor único, e o DNN foi menos sujeito a saturação em alta biomassa que os modelos lineares. Exige sensores térmico/estrutura em UAV e GPU — fora do nosso ambiente. | abstract |
| **[G-11]** Najjar et al. 2024 | soja, trigo, colza | Argentina, Uruguai, Alemanha | intra-talhão | satélite (sensor não especificado) | LSTM + métodos de atribuição de features | nd | nd | **V6** — não especificado no abstract | — | — | **O estudo mais próximo do nosso objetivo exato** (explicabilidade intra-talhão para soja via sensoriamento remoto), e geograficamente próximo do Cone Sul. Mas é **preprint**, sem revisão por pares confirmada, e o abstract não traz sensor, resolução nem métricas. | abstract (preprint) |
| **[E-brasil-07]** Barbosa dos Santos et al. 2021 | soja | **Brasil** (MATOPIBA / Cerrado) | regional | indícios de dados meteorológicos, sem sensoriamento remoto (não verbatim) | Random Forest | nd | nd | **V6** — não confirmado por leitura verbatim | 0,81 | 176,93 kg/ha | RMSE baixo, mas em **escala regional** e com esquema de validação desconhecido: não é benchmark intra-talhão. Detalhes precisam de acesso institucional para confirmação. | abstract |
| **[H-09]** Lobell et al. 2015 | milho e soja | EUA (Meio-Oeste) | talhão | Landsat + clima em grade (Google Earth Engine) + simulações de crop model | **SCYM** (híbrido crop model + estatístico) | pixel Landsat | múltiplas safras / **>17.000 talhões (milho), >11.000 (soja)** | **V6** — não declarado | — | milho 14–58% (média **35%**) e soja média **32%** da variação capturada — **fração de variância, NÃO é R² clássico** | O artigo original do SCYM: **a única família da base que dispensa mapa de colheita para calibrar**, o que ataca de frente a restrição de poucos talhões-safra. Custo: exige um modelo de cultura calibrado, que não existe na nossa stack. | abstract |

**Nota sobre a unidade de RMSE em [B-12].** Os valores de 7,24–37,32 e 38,82 estão registrados na
base como kg/ha e foram conferidos contra a fonte, mas a ordem de grandeza é muito inferior à dos
demais estudos de soja desta tabela (que ficam entre ~180 e ~765 kg/ha). **Antes de usar [B-12]
como referência numérica de erro, a unidade deve ser reconferida no artigo original.** A conclusão
qualitativa do estudo (*field-based* > *farm-based* > *global-based*) não depende desse ponto.

---

## Leituras transversais da tabela

### 1. Só 2 dos 30 estudos testam o que o produto realmente precisa fazer

Apenas [C-11] e [C-14] retêm um **talhão inteiro** fora do treino. Todo o resto da tabela — incluindo
o estudo mais próximo do nosso caso, [B-12] — responde a uma pergunta diferente da pergunta de
produto. Em escala de base inteira a proporção é igualmente severa: **11 dos 87 estudos** declaram
validação talhão-fora ou ano-fora — e **42** (48%) não declaram esquema nenhum, pelo critério único
enunciado em `estado-da-arte.md` §2.9. Consequência direta: **a maior parte dos R² publicados para
predição intra-talhão não estima o erro que veremos em campo.**

### 2. O preço da honestidade metodológica está quantificado — e é alto

Sempre que a tabela permite ver o mesmo estudo sob dois esquemas, a métrica piora ao endurecer a
validação: [E-brasil-04] 0,748 → 0,693 (R²) e 414 → 585 kg/ha; [B-15] 0,72 → 0,34–0,76 e 301,52 →
168,31–491,17 kg/ha; [D-12] 0,87–0,90 → 0,77–0,79. E [C-11], que **começa** pelo esquema duro,
reporta R² negativo em 3 de 6 talhões-safra. Fora da tabela, [C-01] vai de 0,53 a 0,14 e [C-12]
mede subestimação de erro de 5–54% pela CV aleatória. **Expectativa realista: os números do
projeto sob LOFO-CV serão visivelmente piores que qualquer R² publicado em split aleatório — e
isso não indica um modelo ruim, indica uma medida honesta.**

### 3. Resolução fina não compra acurácia; consistência temporal, sim

[B-08] mostra a contradição dentro de um mesmo estudo (3 m ganha na simulação, 30 m ganha no
modelo empírico); [B-05] mostra Sentinel-2 de 10 m batendo PlanetScope de 3 m em soja; [B-06]
mostra que fundir 3 m com 10–20 m deixou a produtividade como o traço **mais fraco**; e [C-11], com
3,12 m, ainda registra perda de eventos críticos de crescimento. Em contrapartida, [B-04] mostra
que **apenas suavizar a série temporal** elevou o r² por pixel de 0,31 para 0,40, sem trocar sensor
nem modelo. **O investimento com melhor retorno documentado está no eixo temporal, não no eixo
espacial** — o que é especialmente relevante no Brasil, onde a nuvem deixa 4–10 imagens por talhão
por safra [B-12].

### 4. Relevo compete com espectro em soja — e solo pode atrapalhar sob validação dura

Três linhas independentes convergem: em [D-12], para **soja**, declividade e elevação estão no
top-3 por SHAP, acima de quase todo o clima; em [B-09], as variáveis mais importantes foram
**Simple Ratio + declividade**, não NDVI nem NDRE; em [B-13], a inclusão de TWI acompanha o ganho
da fusão SAR+óptico. Mas [C-11] — a única linha com talhão-fora — encontrou que **acrescentar solo
e topografia piorou o desempenho**, atribuindo isso a ruído e sobreajuste local. A hipótese
testável que sai daí: features estáticas de talhão podem estar funcionando como identificador do
talhão em CV aleatória (o mesmo mecanismo que fez um modelo só com coordenadas empatar com o
modelo completo em [C-01]) e desabar quando o talhão sai do treino.

### 5. O "melhor modelo" muda de estudo para estudo, e até de ano para ano

Na tabela: RF vence no agregado e 1D-CNN vence em 2018 [A-09]; SGD vence RF e XGBoost [B-07]; ViT
vence CNN-LSTM com 450 plots [A-06]; DNN vence tudo com 142.952 amostras [A-04]; SVR vence PLSR em
soja no Paraná [B-12]; XGBoost é o escolhido sob talhão-fora [C-11]; LightGBM sob validação por
estado [D-12]; GRU+krigagem ganha de RF com R² **menor** porque o mapa é mais realista [H-04].
**A tabela não autoriza escolher um algoritmo a priori.** Autoriza comparar famílias sob o mesmo
esquema de validação e reportar a instabilidade como resultado.

### 6. Métrica global e qualidade do mapa podem apontar em direções opostas

[H-04] é o caso mais claro: um RF com R² de 0,9949 produziu mapas em nível de pixel
espacialmente irreais, e a solução foi krigar os resíduos — reduzindo o RMSE em 35–45% e aceitando
um R² menor (0,886) em troca de realismo espacial. [D-12] reforça pelo outro lado: mesmo com R² de
0,90 em soja, autocorrelação espacial residual ainda foi detectada a 50 m. **Qualquer avaliação do
nosso produto precisa incluir inspeção do mapa de erro, não apenas o número agregado.**

### 7. A evidência brasileira intra-talhão é um único estudo — e ele não fecha a pergunta

Das 30 linhas, cinco são brasileiras ([B-12], [B-15], [E-brasil-04], [E-brasil-01], [H-03]) e
apenas **uma** é intra-talhão com mapa de colhedora real: [B-12]. As outras são município
([B-15], [E-brasil-04], [E-brasil-01]) ou sensor proximal em parcela experimental ([H-03]).
Nenhuma das cinco reporta incerteza ou explicabilidade. **A combinação soja + Brasil +
intra-talhão + talhão-fora + ano-fora + incerteza + SHAP não existe na literatura revisada** — é
o espaço de contribuição original do projeto.

### 8. Há uma alternativa estrutural ao ML puro para o regime de poucos talhões

Três linhas apontam para o mesmo lugar: [H-09] (SCYM, que dispensa mapa de colheita para
calibrar), [B-04] (SCYM avaliado contra >1 milhão de pontos reais, com RF puro degradando fora do
domínio de treino e precisando de ≥1.000 observações) e [B-11] (assimilação de LAI em modelo de
cultura, avaliada pixel a pixel em 21.175 pixels de soja). Todas exigem um modelo de cultura
calibrado — infraestrutura que hoje não existe na plataforma. **Não é caminho para o primeiro MVP,
mas é a resposta mais direta da literatura à restrição de 20–100 talhões-safra** e deve permanecer
no radar de médio prazo.

---

## Nota de procedência

Todos os campos desta tabela vêm de `yield-prediction/docs/literature-review/papers-database.csv`
(87 estudos, 77 DOIs conferidos no Crossref/DataCite, 10 URLs sem DOI testadas, 37 linhas com
métrica numérica auditadas contra a fonte). O registro completo da verificação, das deduplicações
e das correções está resumido na cópia versionada [`verificacao-citacoes.md`](./verificacao-citacoes.md);
o registro bruto completo fica na **trilha local de auditoria, não versionada** (texto de terceiros). A discussão
interpretativa de cada achado está em
`yield-prediction/docs/literature-review/estado-da-arte.md`.

