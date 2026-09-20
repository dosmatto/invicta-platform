# ADR-001 — Estratégia de Modelagem do Preditor Espacial de Produtividade de Soja

> **Status:** proposto · **Data:** 2026-09-19 · **Fase:** 1 (estado da arte concluída; nenhum experimento próprio executado)
> **Autor:** Fase 1 do projeto MBA + produto Invicta · **Substitui:** nada · **Revisão prevista:** ao fim do primeiro ciclo de experimentos (Etapas 7–10 do roadmap, seção 51)

---

## Como ler este documento

Formato exigido pela seção 46 do pedido original (**Contexto · Alternativas · Evidências · Decisão · Consequências**), aplicado uma vez por decisão (D1 a D10), com a estrutura da seção 20 dentro de cada uma: *alternativas · evidências · vantagens · desvantagens · decisão · justificativa*, mais um **nível de confiança**.

**Fonte única de evidência:** `../literature-review/papers-database.csv` (87 estudos verificados; `paper_id` entre colchetes). Dois outros espaços de identificadores aparecem e **não** são `paper_id`: `[FD-NN]` são fontes de dados catalogadas em `../data-sources/fontes-de-dados.md`, e `[F-comercial-NN]` são soluções comerciais catalogadas em `../benchmarks/commercial.md`. Estudos lidos só pelo resumo são marcados `[X-NN, só abstract]` na primeira citação; `só metadados` não sustenta nenhuma afirmação além de "o estudo existe".

**Rótulos** (seções 45 e 58): `[EVIDÊNCIA]` com qualificador `[CONSENSO]` / `[EVIDÊNCIA LIMITADA]` / `[RESULTADO ESPECÍFICO]` · `[HIPÓTESE]` · `[DECISÃO]` · `[LACUNA]`. **Não existe nenhum `[RESULTADO]` neste ADR** — nenhum experimento próprio foi executado.

**Onde mora o rótulo `[DECISÃO]`.** A seção 45 admite o rótulo em toda a documentação, mas as seções 20 e 46 exigem que uma decisão traga alternativas, evidências, justificativa e consequências. Neste projeto, portanto, `[DECISÃO]` nu só existe **dentro de `docs/decisions/`**. Fora daqui, os outros documentos usam `[DECISÃO → ADR-001 Dn]` (a decisão já está tomada aqui e lá só é aplicada) ou `[RECOMENDAÇÃO — a formalizar em ADR]` (escolha de engenharia ainda sem ADR, mapeada em "ADRs a abrir na Fase 2", abaixo).

**Compatibilidade** (item 11 do ledger, contra a cópia versionada [`../product/perfil-compatibilidade.md`](../product/perfil-compatibilidade.md)): `reusa` · `novo_barato` · `infra_nova`.

**Unidade interna:** kg/ha. `sc/ha` só como conversão de interface (1 sc = 60 kg).

**Regra que atravessa todo o documento.** *Decisão ≠ fato.* Onde a base revisada é fraca ou contraditória, a decisão registrada é **"testar A contra B sob tal protocolo"**, com o critério de corte escrito antes do experimento — nunca "usar A". Esse é o ponto: um ADR de Fase 1 decide o **procedimento**, não o vencedor.

---

## Contexto comum a todas as decisões

| Dimensão | Valor |
|---|---|
| Cultura / região / alvo | Soja, Brasil, previsão pré-colheita intra-talhão em kg/ha |
| Unidades **independentes** | 20–100 talhões-safra com mapa de colheita |
| Células | grid de 20 m sobre centenas de ha → 5×10⁴ a 2,5×10⁵ linhas, fortemente autocorrelacionadas |
| Safras por talhão | poucas (cold start real) |
| Série intra-safra | já existe (robô noturno Sentinel-2 `msr.py` + CBERS-4A `cbers.py` + catálogo `indices.py`) |
| Clima | **sem ingestão hoje** |
| Manejo | disponibilidade parcial/incerta |
| Hardware | Render *standard*, CPU, 2 workers, **sem GPU** |
| Libs pinadas | numpy, scipy, pykrige, shapely, pillow, rasterio, pystac-client |
| Estado do código | **nenhum código de produção nesta fase** — este ADR precede a implementação |

A distinção que governa tudo: **muitos pixels ≠ muitos dados.** O n efetivo é o número de talhões-safra, não o de células. `[RESULTADO ESPECÍFICO]` `[C-01]` demonstra o mecanismo: um Random Forest treinado **apenas com coordenadas X/Y** teve desempenho quase idêntico ao modelo com 36 covariáveis reais, e o R² caiu de 0,53 (random 10-fold) para 0,14 (spatial 44-fold), chegando ao nível do modelo nulo sob buffered-LOO — em biomassa florestal, pixel de 1 km, **não é agricultura**, mas o mecanismo é o mesmo.

---

# D1 — Família de modelos do MVP e protocolo de comparação

## Contexto

A seção 29 do pedido fixa um núcleo (Baseline 0 = média histórica; Baseline 1 = regressão linear; Modelo 2 = RF; Modelo 3 = XGBoost; Modelo 4 = LightGBM; Modelo 5 opcional = CatBoost) e condiciona Deep Learning a "clara justificativa" da revisão. A revisão está feita. Resta decidir: (a) o que a revisão manda **acrescentar** a esse núcleo, (b) o que fica **fora** e sob que critério objetivo pode reentrar, e (c) **como** comparar, já que a base contém resultados que se contradizem entre si.

## Alternativas

| # | Alternativa | Descrição |
|---|---|---|
| A1 | Núcleo da seção 29 apenas | Baselines + RF + XGBoost + LightGBM (+CatBoost) |
| A2 | Núcleo + acréscimos da revisão | A1 + PLSR + SVR + Extra Trees + GWRFR (regression-kriging de resíduos **fora** da comparação oficial — ver a ressalva de disponibilidade do alvo abaixo e D9) |
| A3 | A2 + Deep Learning | acrescentar MLP/CNN/LSTM/Transformer |
| A4 | A2 + crop model acoplado | acrescentar APSIM/CROPGRO/SCYM como gerador de features |
| A5 | Escolher um vencedor por leitura da literatura | dispensar o experimento próprio |

## Evidências

**A favor da família de árvores como núcleo.**
- `[EVIDÊNCIA LIMITADA, evidência geral fora da agricultura]` Em 45 datasets tabulares de porte médio (~10 mil amostras), com busca extensiva de hiperparâmetros, "tree-based models remain state-of-the-art on medium-sized data" frente a redes neurais `[A-02, só abstract]`. Um único estudo da base sustenta esta linha — daí o rótulo rebaixado.
- `[RESULTADO ESPECÍFICO]` Em simulação controlada (1.728 datasets, 12.096 avaliações) mais 5 datasets reais do Benim, Random Forest teve o melhor R² (0,80) e a maior robustez a dados ausentes e ao aumento do número de preditores, superando SVM, MLR, XGBoost, LightGBM, redes neurais e kNN `[A-11]`.
- `[RESULTADO ESPECÍFICO]` Soja, EUA, escala de município, treino 2012–2016 e teste 2017–2021 (ano-fora): RF teve o menor RMSE agregado (0,342 t/ha) entre RF/XGBoost/DTR/LASSO/1D-CNN — **mas** o 1D-CNN foi o mais preciso especificamente em 2018 `[A-09, só abstract]`.
- `[RESULTADO ESPECÍFICO]` LightGBM é o estudo da base com a métrica mais forte em soja **em grid**: R² 0,90 e RMSE 0,46 Mg/ha (460 kg/ha) para soja em grid de 30 m nos EUA, 134 crop-site-years, com RFECV 5-fold — caindo para R² médio 0,79 (faixa 0,67–0,88) sob validação *group-wise* por estado `[D-12]`.
- `[RESULTADO ESPECÍFICO]` XGBoost é o modelo do estudo mais próximo do regime Invicta em **esquema de validação**: soja, EUA, intra-talhão, PlanetScope 3,12 m, 3 talhões × 2 safras, **Leave-One-Field-Out CV real** — R² 0,54 / 0,40 / 0,24 / −0,58 / −1,02 / −6,23, RMSE 554–765 kg/ha (≈9,2–12,8 sc/ha), MAE 421–676 kg/ha `[C-11]`.

> **Nota de integridade sobre a faixa de RMSE de `[C-11]`.** A tabela verbatim do estudo (registrada na **trilha local de auditoria, não versionada** — texto bruto de terceiros, mantido fora do repositório) traz, por talhão-safra retido: 574 · 652 · **554** · 642 · **765** · 589 kg/ha. A faixa correta é portanto **554–765 kg/ha**. A base chegou a registrar "574 a 765" (**574 é o RMSE do talhão Edmunds/2021, não o mínimo da faixa**); o erro de transcrição foi corrigido na base e em todos os documentos da Fase 1 durante a revisão. Nenhuma afirmação deste ADR depende de qual dos dois valores seja o limite inferior.

**A favor de acrescentar PLSR e SVR.**
- `[RESULTADO ESPECÍFICO]` O estudo brasileiro metodologicamente mais próximo do MVP — soja, Paraná, **intra-talhão, grade de 20 m**, 15 talhões em 3 fazendas, >500 ha, safra 2019/20, Sentinel-2 (9 bandas Vis/NIR/SWIR + 8 índices), validação 10-fold + split 75/25 com validação externa — teve **SVR superando PLSR em todas as estratégias**: no estádio R5, global-based SVR R² 0,75 e RMSE 38,82 kg/ha (externa: R² 0,75 / RMSE 39,92 kg/ha), contra PLSR R² 0,56 e RMSE 51,76 kg/ha `[B-12]`. **Ressalva de unidade obrigatória:** a ordem de grandeza desses RMSE é muito inferior à dos demais estudos de soja da base (o próprio artigo reporta 369,70 kg/ha no experimento com reflectância foliar); não comparar diretamente com `[C-11]` (554–765 kg/ha) ou `[B-15, só abstract]` (301,52 kg/ha, **escala municipal**).
- `[RESULTADO ESPECÍFICO]` PLSR em soja atingiu R² 0,731–0,924 e RMSE 334–403 kg/ha no estádio R5 — **mas com espectrorradiômetro proximal de folha**, não orbital `[H-03, só abstract]`.

**Sobre regression-kriging dos resíduos — e por que ele NÃO entra na validação oficial.**
- `[RESULTADO ESPECÍFICO]` Krigar os resíduos de modelos de ML/DL reduziu o RMSE em **35–45%** (GRU 3,07 → 1,85 q/ha; LSTM 3,56 → 1,96 q/ha) e corrigiu mapas com resíduo espacialmente estruturado que um Random Forest com R² 0,9949 produzia "sem realismo espacial" `[H-04]`. **Ressalva de cultura/escala:** trigo e mostarda, Índia — não é soja em talhão comercial.
- **Ressalva decisiva, de disponibilidade do alvo** (a que faltava e que muda a decisão): em `[H-04]` o agregado é **observado**. O desenho do estudo é "treinar a nível de vilarejo → prever por pixel → **agregar de volta ao vilarejo** → comparar com a estatística oficial **reportada** → krigar esse resíduo". A validação declarada é literalmente *"agregação pixel→vilarejo/bloco comparada às estatísticas oficiais reportadas"*. O resíduo só existe porque **o valor agregado é conhecido no momento da predição**: trata-se de **desagregação/interpolação de um valor observado**, não de previsão de um valor desconhecido.
- **Consequência para o caso de uso deste projeto** (seções 4 e 61: prever espacialmente **antes** da colheita, em talhão/safra não vistos): resíduo = observado − previsto, e num talhão-safra pré-colheita não existe observado. Não há o que krigar. Pior: sob a validação oficial de D5 (grupo = talhão), krigar o resíduo do talhão retido exigiria conhecer a colheita dele — **vazamento pelo alvo**, proibido pelos testes B1/B6 e D1 do checklist (`../literature-review/riscos-metodologicos.md` §11).
- `[EVIDÊNCIA LIMITADA]` RFsp (RF com distâncias-buffer) obteve predições "equally accurate and unbiased" comparado à krigagem — **empate, não superioridade** — e os próprios autores alertam que, com poucos pontos e poucas covariáveis, "model-based geostatistics can still lead to more accurate predictions" `[C-10, só abstract]`. O regime da Invicta é exatamente o da ressalva.
**Contra fixar um vencedor por leitura (alternativa A5).**
- `[RESULTADO ESPECÍFICO — resultado negativo]` Em soja intra-talhão na Áustria (Sentinel-2 10 m + solo, 3 safras), um **modelo linear treinado por Stochastic Gradient Descent superou RF, XGBoost, SVM e MLR** (MAE 0,436 t/ha) — o esquema de validação não é detalhado no resumo, o que limita o peso, mas o resultado contraria a expectativa dominante `[B-07, só abstract]`.
- `[RESULTADO ESPECÍFICO — resultado negativo]` Em milho na China (1.260 municípios × 36 anos), a rede neural quantílica **não** superou a regressão quantílica tradicional; QRF+LASSO foi o melhor entre os métodos quantílicos `[G-14, só abstract]`.
- `[RESULTADO ESPECÍFICO — resultado negativo]` Em soja mesorregional no Brasil, uma CNN sobre *recurrence plots* exigiu mais poder computacional e **não** superou o Random Forest (MAPE 8%) `[E-brasil-05]`.

**Contra Deep Learning no regime atual.** Em **todos** os casos abertos da base em que uma arquitetura de DL venceu, ao menos uma destas condições estava presente:

| Condição | Caso | Evidência |
|---|---|---|
| (a) volume massivo de amostras | DNN de 21 camadas, milho, EUA | 142.952 amostras de treino; RMSE 12,79 vs. 21,40 do Lasso (% da média), teste no ano 2017 `[A-04]` |
| (b) série temporal longa por unidade | CNN-LSTM, soja county-level | 13 anos × 15 estados; R² 0,78, RMSE 329,53 kg/ha vs. 359–363 dos modelos isolados `[A-10]` |
| (b′) volume espaço-temporal extremo | GNN-RNN | >2.000 condados × 39 anos, sem métrica no material aberto `[A-07, só abstract]` |
| (c) imagem de alta resolução por parcela | ViT + transformer temporal, soja | 450 plots, câmera RGB de alta resolução em 3 datas + informação de semente; RMSE 332,07 kg/ha e R² 0,664 vs. CNN-LSTM 481,19 / 0,295 `[A-06]` |
| (c′) fusão multimodal por parcela | DNN-F2, soja com UAV | RGB + multiespectral + térmico simultâneos; R² 0,720, rRMSE 15,9% `[H-06, só abstract]` |

Nenhuma é atendida hoje: (a) o n efetivo é 20–100 talhões-safra; (b) há série **intra-safra** densa, mas poucas **safras** por talhão, e `[C-11]` registra que 2–3 safras são insuficientes até para uma LOFO-CV robusta; (c) o alvo é grid de 20 m sobre Sentinel-2 a 10–20 m — o oposto de "alta resolução por parcela".

**Contra crop model acoplado.** `[RESULTADO ESPECÍFICO]` Acoplar APSIM a um ensemble de ML reduziu o RMSE em **7–20%** (RRMSE 6–7% no melhor híbrido) em milho, US Corn Belt, **escala de condado**, 293 condados × 35 anos, sob **CV 10-fold aleatória para o ajuste + teste em anos retidos (2012, 2017 e 2018)** — não é *leave-one-year-out* `[A-03]`. **Ressalva obrigatória, declarada pelos próprios autores: as simulações APSIM usaram o clima REAL completo do ano de teste — *"the weather will be unknown"* na aplicação real.** O ganho é um teto otimista, não uma estimativa pré-colheita. Somado a isso, nenhum crop model está na stack e a plataforma nem sequer ingere clima hoje.

## Vantagens e desvantagens das alternativas

| Alternativa | Vantagens | Desvantagens |
|---|---|---|
| A1 | menor esforço; cumpre a seção 29 literalmente | deixa de fora o pipeline do único estudo brasileiro intra-talhão em grid de 20 m `[B-12]` |
| **A2** | cobre as duas linhas com evidência aplicável ao caso de uso (árvores e espectral-latente) e mantém a geoestatística como experimento de escopo restrito; tudo CPU-only | loop de CV maior; mais superfície para vazamento na seleção `[C-07, só abstract]` |
| A3 | teto potencial maior | nenhuma das condições (a)/(b)/(c) atendida; `infra_nova` (GPU); precedente direto de "gastou mais e não ganhou" `[E-brasil-05]` |
| A4 | melhor comportamento em ano extremo, segundo `[A-03]` | `infra_nova` de custo alto; ganho medido em condição otimista; exige clima que não existe |
| A5 | rápido | contrariada diretamente por `[B-07]`, `[A-09]`, `[G-14]`, `[E-brasil-05]` — não existe vencedor fixo |

## `[DECISÃO]` D1

**Adotar A2.** O MVP compara, em um único protocolo, os seguintes candidatos:

| # | Candidato | Papel | Compat. |
|---|---|---|---|
| 0 | Média histórica do talhão | Baseline obrigatório (piso) | `reusa` |
| 1 | Regressão linear / Lasso | Baseline honesto | `reusa` |
| 2 | Random Forest | Núcleo (família com mais evidência) | `novo_barato` |
| 3 | XGBoost | Núcleo (regime de validação mais próximo `[C-11]`) | `novo_barato` |
| 4 | LightGBM | Núcleo (melhor evidência em grid `[D-12]`; categóricas nativas) | `novo_barato` |
| 5 | CatBoost | **Opcional**, sem evidência na base `[LACUNA]`; entra por custo marginal quase nulo | `novo_barato` |
| 6 | Extra Trees | **Acréscimo**, sem evidência na base `[LACUNA]`; mesma justificativa de custo marginal | `novo_barato` |
| 7 | **PLSR + SVR** | **Acréscimo exigido pela revisão** — replica o pipeline de `[B-12]`, o estudo brasileiro em grid de 20 m | `novo_barato` |
| 8 | **Regression-kriging dos resíduos** | **`[HIPÓTESE]`, FORA da validação oficial LOFO.** Só no experimento (b) de D9 — krigar resíduos de **safras anteriores** do mesmo talhão como feature/offset, testado sob leave-one-year-out. Usá-lo sobre o resíduo da **safra prevista** é vazamento pelo alvo; `[H-04]` é desagregação de agregado observado e não transfere para previsão pré-colheita | **`reusa`** (`pykrige` já em produção em `interp.py`) |
| 9 | GWRFR (RF geograficamente ponderado) | Acréscimo de **baixa prioridade**: R² 0,90 e menor Moran's I residual em milho county-level `[C-13, só abstract]`, mas validação não detalhada e **nenhum teste intra-talhão na base** | `novo_barato` |

**Ficam FORA do MVP:** Deep Learning em todas as variantes (MLP/DNN, CNN, 1D-CNN, LSTM/GRU, CNN-LSTM, Transformer/ViT, multimodal com GPU, GNN) e crop model acoplado (APSIM/CROPGRO/SCYM/assimilação de LAI).

**Critério objetivo de reentrada** (pré-registrado; qualquer um basta, e a reavaliação é um experimento, não uma troca automática):

| Rota | Gatilho quantitativo | O que se reavalia |
|---|---|---|
| R1 — volume | **`[HIPÓTESE]`** ≥ 1.000 talhões-safra de soja com mapa de colheita limpo. **O limiar é escolha deste projeto, e a unidade não é a das referências:** `[A-04]` operou com 1,4×10⁵ **amostras** e `[B-04, só abstract]` indica ≥1.000 **observações** reais para o RF empatar com método baseado em simulação — nenhum dos dois mede talhões-safra. O número foi fixado por ser uma ordem de grandeza acima do regime atual | MLP/DNN sobre features tabulares |
| R2 — série | **`[HIPÓTESE]`** ≥ 8 safras consecutivas na maioria dos talhões. **O limiar é escolha deste projeto:** `[A-10]` precisou de **13 anos** por unidade espacial — 13 é o que a referência usou, 8 é o valor proposto aqui, abaixo dela, e não vem de nenhuma fonte | CNN-LSTM / LSTM / 1D-CNN |
| R3 — resolução por parcela | aquisição regular de imagem ≤ 1 m por talhão (UAV ou equivalente) | Transformer/ViT `[A-06]`, fusão multimodal `[H-06]` |
| R4 — crop model | ingestão de clima operacional **em modo de previsão** (não clima observado) + calibração de solo/cultivar por talhão | híbrido crop model + ML `[A-03]` |
| R5 — desempenho | **`[HIPÓTESE]`** o melhor candidato de A2 não superar o Baseline 0 sob a validação oficial (D5) em ≥ 2 ciclos — "2 ciclos" é escolha deste projeto, sem âncora na base `[LACUNA]` | ver D10 (*kill criteria*) — reentrada de DL **não** é a resposta padrão aqui |

**Protocolo de comparação** (obrigatório, e é isto que a decisão realmente fixa):

1. **Mesmo dataset, mesmas *folds*, mesma semente** para todos os candidatos. Comparação sem isso não é comparação.
2. **CV aninhada**: laço externo = validação oficial de D5 (grupo = talhão); laço interno = `GroupKFold` sobre os talhões de treino, onde ocorrem seleção de features e busca de hiperparâmetros. `[EVIDÊNCIA]` Seleção fora do laço é vazamento documentado `[C-07]`; `[D-12]` reduziu 128 features para 13 em soja por RFECV e reporta a validação *group-wise* separadamente; `[C-11]` mostra que a resposta da seleção **muda** conforme o esquema de validação (acrescentar solo e topografia piorou o desempenho sob LOFO).
3. **Espaço de busca pequeno e registrado.** Em CPU sem GPU, o laço aninhado multiplica o custo; a saída é grade curta e documentada, **não** abandonar o aninhamento. Registrar o número de configurações avaliadas — comparar 200 variantes e reportar a melhor é seleção sobre o teste mesmo com a mecânica correta.
4. **Reportar distribuição, não média.** `[C-11]` (6 folds, 3 com R² negativo) e `[D-12]` (faixa 0,67–0,88 por estado) mostram por quê.
5. **Comparar sempre com o modelo nulo** (média do treino), controle usado por `[C-01]`.
6. **Declarar empate quando for empate.** Se dois candidatos ficarem dentro da variabilidade entre *folds*, escolhe-se o **mais simples e mais barato de operar**, não o de melhor média.

## Justificativa

A base revisada não autoriza escolher um vencedor: três resultados negativos independentes (`[B-07]`, `[G-14]`, `[E-brasil-05]`) mostram que o modelo mais complexo perde com frequência, e `[A-09]` mostra que nem entre anos existe um vencedor fixo. O que a base **autoriza** é: (i) restringir o campo às famílias com evidência aplicável ao regime e ao hardware; (ii) exigir um protocolo que não invente vantagem; (iii) excluir DL e crop model com critério objetivo de reentrada, porque a exclusão hoje é ancorada em condições verificáveis, não em preferência.

## Consequências

- O loop experimental tem **nove candidatos na validação oficial** — as linhas 0 a 7 da tabela acima, mais a linha 9 (GWRFR, baixa prioridade) — × folds de grupo × CV aninhada, com o candidato 8 (regression-kriging) rodando **à parte**, no experimento de escopo restrito de D9. *(Nota de contagem: são nove **linhas** da tabela, não nove implementações — a linha 7 são dois modelos, PLSR e SVR, executados no mesmo braço para replicar `[B-12]`. Onde os demais documentos escrevem "nove candidatos", é esta a contagem.)* Em CPU isso é horas, não minutos — precisa ser **job offline**, nunca no caminho da requisição (ver `../product/recomendacoes-arquitetura.md`).
- Entram como dependências novas `scikit-learn`, `xgboost`, `lightgbm` (e opcionalmente `catboost`) — todas CPU-only e sinalizadas como "podem entrar" no perfil. O regression-kriging **não** adiciona dependência: `pykrige` já está pinado.
- O ADR passa a dever um resultado: a tabela comparativa com distribuição por *fold*. Até lá, nenhum documento do projeto pode afirmar qual modelo é melhor.

**Nível de confiança: ALTO** para a exclusão de DL e crop model (as três condições são verificáveis e nenhuma é atendida; há precedente brasileiro direto de perda `[E-brasil-05]`). **MÉDIO** para a composição exata do conjunto de candidatos — nenhum estudo da base testa o regime de 20–100 talhões-safra de soja em grid de 20 m no Brasil `[LACUNA]`, então a lista é uma aposta informada, não uma dedução.

---

# D2 — Dados mínimos e grupos de features por prioridade

## Contexto

A seção 23 do pedido lista features iniciais (NDVI/NDRE; 10 atributos de solo; altitude/declividade; precipitação acumulada; manejo; CEa rasa/profunda) e a seção 30 as organiza em grupos A–F para ablação. A intuição do projeto — e do mercado — é que empilhar solo + CEa + relevo + clima sobre o espectral melhora a previsão. **A base revisada contém evidência negativa direta contra essa intuição**, e é essa evidência que esta decisão precisa encarar.

## Alternativas

| # | Alternativa |
|---|---|
| B1 | Usar tudo desde o início (Modelo F da seção 31) |
| B2 | Usar só espectral, por ser o único grupo com sinal comprovado intra-talhão |
| B3 | Ordem fixa por prioridade agronômica, decidida a priori |
| B4 | **Núcleo mínimo + ablação da seção 31 decide a inclusão de cada grupo, sob a validação oficial** |

## Evidências

**Os resultados negativos que mudam a decisão.**
- `[RESULTADO ESPECÍFICO — o mais importante desta seção]` Em soja intra-talhão nos EUA sob **LOFO-CV**, acrescentar índices de solo e variáveis topográficas ao modelo de índices de vegetação **não melhorou** o desempenho: "introduziu ruído e sobreajuste às condições locais" `[C-11]`. O modelo vencedor foi o **só com índices de vegetação**.
- `[RESULTADO ESPECÍFICO]` Bandas **brutas** (sem índice algum) foram competitivas ou superiores: em soja no Paraná, as bandas Vis/NIR/SWIR do Sentinel-2 superaram os 8 índices testados sob PLSR e SVR `[B-12]`; em soja nos EUA, bandas brutas do PlanetScope bastaram para uma curva de R² 0,26 (VE/VC) a >0,70 (R4/R5) `[B-10, só abstract]`. Isso **contradiz a suposição de que "índices sempre bastam"** e também a de que índices são necessariamente melhores que bandas.
- `[HIPÓTESE]` A dupla "NDVI + NDRE" da seção 23 **não é confirmada nem refutada** pela base: nenhum estudo testou exatamente essa dupla isolada contra um conjunto maior de forma controlada. É hipótese de trabalho, não consenso.

**O clima é quase constante dentro do talhão.**
- `[EVIDÊNCIA — catálogo de fontes, não literatura]` Toda a família de reanálise/climatologia gratuita opera em grades de **~5 km `[FD-15]` a ~28 km `[FD-11]`** entre as fontes com resolução verificada (`[FD-11]` a `[FD-13]`, `[FD-15]`, `[FD-16]`, `[FD-18]`, `[FD-19]`) — ordens de grandeza maior que um talhão. O NASA POWER `[FD-14]` seria ~50 km, valor declarado **não verificado** no próprio catálogo e por isso fora da faixa. **Nenhuma delas diferencia condições dentro do talhão** — catálogo de fontes de dados, `../data-sources/fontes-de-dados.md`. *(O rótulo não é `[CONSENSO]`: `FD-NN` são fontes de dados catalogadas, não estudos da base — ver `verificacao-citacoes.md`, adendo C-16.)*
- `[HIPÓTESE fundamentada]` O clima entra por **interação com relevo e solo**, não como efeito principal: a produtividade de áreas côncavas correlaciona **negativamente** com a chuva de maio e **positivamente** com a de agosto/setembro `[D-05]` — o mesmo evento de chuva tem sinal oposto conforme a posição topográfica. `[D-12]` confirma a interação explícita clima × relevo × solo via SHAP em soja.
- `[RESULTADO ESPECÍFICO]` E o peso relativo é cultura-dependente: em `[D-12]`, para **soja** o top-3 por SHAP/permutação é **declividade > precipitação de junho > elevação** (terreno domina; a chuva de junho foi a **única** variável climática retida no modelo final de soja), enquanto para **milho** quatro das cinco variáveis mais importantes são climáticas.

**Solo, CEa e relevo: sinal real, magnitude instável, direção que muda de lugar.**
- `[EVIDÊNCIA LIMITADA]` Solo explicou ~30% da variabilidade de produtividade (faixa **5–71% por campo**) e topografia ~20% (faixa 6–54%) `[D-01, só abstract]`. A faixa larga é o achado.
- `[RESULTADO ESPECÍFICO]` CEa isolada R² 0,21 > topografia 0,17; combinadas 0,32; em 6 de 9 *site-years* a CEa venceu a topografia — **mas a relação foi negativa** em Kansas/Missouri e diferente no Colorado por inversão do perfil de textura `[D-02]`. No Brasil, correlação **negativa** entre CEa e produtividade de soja em Latossolo Bruno (Guarapuava-PR), sem R² reportado `[D-11, só abstract]`.
- `[EVIDÊNCIA LIMITADA]` A CEa *"often, but not always"* se relaciona à produtividade — é medida integradora de textura, água, matéria orgânica e salinidade, não preditor causal único `[D-03]`.
- `[RESULTADO ESPECÍFICO]` O ranking muda com a escala de agregação: "soil map unit" domina quando os dados são agrupados entre campos, mas a **elevação** domina na análise por campo individual `[D-07, só abstract]`.
- `[RESULTADO ESPECÍFICO]` Em milho e soja no Canadá, o índice mais importante **não foi NDVI nem NDRE**, mas o Simple Ratio combinado com a **declividade** `[B-09, só abstract]` — relevo pesando tanto quanto espectral.
- `[RESULTADO ESPECÍFICO]` Em milho na Itália, o índice único mais correlacionado foi o **GNDVI** (R² 0,48), não o NDVI `[B-01, só abstract]`; e o NDVI **satura** em dossel fechado — "R2 was lower for fields with higher yields, suggesting saturation" `[B-08, só abstract]`.

**Erro em cascata das camadas interpoladas.** `[CONSENSO]` O uso de variáveis previamente mapeadas como preditores, sem reconhecer sua incerteza, amplifica erros a jusante `[C-05]`. `[HIPÓTESE]` Um mapa krigado de fertilidade é uma superfície **suave** construída a partir de poucos pontos: `[D-09, só abstract]` amostrou em grid de 35×35 m para predizer em 5×5 m (razão ~49:1 em área); a amostragem comercial brasileira é tipicamente muito mais esparsa, logo o fator de suavização é maior. O resultado é uma feature que varia lentamente no espaço — combustível para a memorização de vizinhança de `[C-01]`. **Nenhum estudo da base mede esse efeito — `[LACUNA]`.**

**Histórico e manejo.**
- `[RESULTADO ESPECÍFICO]` Para **soja especificamente**, o histórico de produtividade do próprio talhão é preditor **pior** do padrão espacial que o NDVI pós-fato — ao contrário de milho, trigo e algodão, onde o histórico vence `[D-04]`.
- `[RESULTADO ESPECÍFICO]` Gap de produtividade por déficit hídrico = 26–62% do potencial; por **manejo** = 9–39%, com a **data de semeadura** como principal fator, em soja no subtrópico brasileiro `[D-08, só abstract]`. `[LACUNA]` Nenhum estudo da base testa cultivar (categórica de alta cardinalidade) como feature codificada em ML de produtividade intra-talhão.

## Vantagens e desvantagens

| Alternativa | Vantagens | Desvantagens |
|---|---|---|
| B1 (tudo) | usa o que a plataforma já tem | contrariada frontalmente por `[C-11]`; maximiza superfície de vazamento e de erro em cascata |
| B2 (só espectral) | é o que venceu em `[C-11]`; menor risco | joga fora, sem teste, camadas que a plataforma já produz e que têm sinal em `[D-02]`, `[D-12]`, `[B-09]` |
| B3 (prioridade fixa) | simples de explicar | é intuição; o ranking da base é cultura- e escala-dependente `[D-07]`, `[D-12]` |
| **B4 (ablação decide)** | transforma a discordância da base em experimento; produz um resultado publicável | custa um ciclo experimental antes de qualquer promessa de produto |

## `[DECISÃO]` D2

**Adotar B4.** Três partes:

**(a) Dataset mínimo viável** — o que precisa existir para uma linha entrar no treino:

| Obrigatório | Origem | Compat. |
|---|---|---|
| Alvo: mapa de colheita limpo, agregado à célula de 20 m, com contagem de pontos por célula | `colheita.py` | `reusa` |
| Série espectral intra-safra com data de cena ≤ `data_previsao` | `msr.py` / `cbers.py` / `agenda.py` / `indices.py` | `reusa` |
| Relevo: altitude e declividade | `mde.py` | `reusa` |
| Identificadores e *lineage* completos (seções 25–26) | novo | `novo_barato` |

Tudo o mais é **candidato sujeito a ablação**, não requisito.

**(b) Grupos de features por prioridade de teste** (grupos A–F da seção 30, reordenados pela evidência):

| Prioridade | Grupo | Conteúdo | O que a base sustenta | Compat. |
|---|---|---|---|---|
| P0 | **A — espectral** | bandas brutas Vis/NIR/RedEdge/SWIR **e** índices do catálogo `indices.py`, agregados por estádio/janela de DAS | único grupo que venceu sozinho sob LOFO `[C-11]`; bandas brutas competitivas `[B-12]`, `[B-10]` | `reusa` |
| P1 | **C — relevo** | altitude, declividade; depois TWI, curvatura, aspecto | declividade no top-3 de soja `[D-12]`; SR+declividade acima de NDVI `[B-09]`; interação com chuva `[D-05]` | `reusa` |
| P2 | **F — CEa** | CEa rasa e profunda | R² 0,21 isolada, 0,32 com topografia `[D-02]`; **sinal muda com o solo** `[D-02]`, `[D-11]`, `[D-03]` | `reusa` |
| P3 | **B — solo** | argila, MO, pH, P, K, Ca, Mg, Al, CTC, V% (krigados) | 5–71% por campo `[D-01]`; **mas piorou sob LOFO em** `[C-11]`; erro em cascata `[C-05]`, `[D-09]` | `reusa` |
| P4 | **D — clima** | chuva, GDD, ETo, VPD por **fase**, como valor único por talhão-safra **cruzado** com relevo/solo | entra por interação, não como efeito principal `[D-05]`, `[D-12]`; nenhuma fonte gratuita resolve o talhão `[FD-11]`–`[FD-19]` | `novo_barato` |
| P5 | **E — manejo** | data de semeadura, grupo de maturação, população, cultivar, cultura anterior | data de semeadura é o principal fator de manejo `[D-08]`; cultivar como categórica é `[LACUNA]` | `novo_barato` |

**(c) Protocolo de ablação (seção 31), com as regras que o tornam conclusivo.** Comparar Modelo A (NDVI) · B (NDVI+NDRE) · C (+solo) · D (+relevo) · E (+clima) · F (tudo), acrescentando **A′ = bandas brutas** e **A″ = catálogo completo de índices** como braços extras, porque `[B-12]` e `[B-10]` tornam a comparação índice-vs-banda uma pergunta aberta real. Regras:

1. **Toda ablação é medida sob a validação oficial de D5** (grupo = talhão), **nunca** sob split aleatório. É a diferença entre `[C-11]` (que mediu certo e achou piora) e a maioria da literatura de sensoriamento.
2. **O grupo só entra no MVP se a mediana de RMSE por talhão melhorar**, e a melhora precisa ser maior que a dispersão entre *folds*. Empate ⇒ o grupo fica fora (menos features, menos vazamento, menos manutenção).
3. **A ablação é executada dentro do laço externo** — a ordem de inclusão dos grupos é parte do que se está avaliando, não uma decisão prévia.
4. **Para cada camada interpolada usada como feature, armazenar e propagar a variância de krigagem** (`interp.py` já roda validação cruzada LOO) e registrar a densidade amostral em pontos/ha no *lineage*.
5. **Colinearidade espectral é tratada na interface, não na atribuição**: NDVI, SAVI, MSAVI2, EVI2, EVI e GNDVI derivam das mesmas bandas; a decisão de quais manter é do experimento, mas a exibição agrupa (ver D8).
6. **Coordenadas absolutas, identificadores de célula e `talhao_id` numérico ficam fora do conjunto de features** — `[C-01]` mostra que um modelo alimentado **só** com coordenadas empata com o modelo completo, isto é, o que ele aprendeu foi posição. Essa é a metade da afirmação que `[C-01]` sustenta. **`[HIPÓTESE]` deste projeto** — e só isso — é a metade positiva: que posição **relativa e agronomicamente interpretável** (distância à borda do talhão, TWI, curvatura, elevação relativa) seja aceitável por transferir para um talhão novo. **Nenhum estudo da base mede se essas features transferem para um talhão não visto `[LACUNA]`**; `[C-01]` não trata de distância à borda, curvatura ou elevação relativa. A hipótese é testável e tem de ser testada: ver o item B7 do checklist anti-vazamento (`../literature-review/riscos-metodologicos.md` §11), que exige comparar, sob LOFO, o modelo com e sem esse bloco de features.

## Justificativa

A pergunta "solo/CEa/relevo/clima ajudam?" tem, na base revisada, respostas **contraditórias e escala-dependentes**: `[D-12]` põe a declividade no topo para soja, `[C-11]` mostra solo e topografia **piorando** sob LOFO, `[D-02]` e `[D-11]` mostram a CEa mudando de sinal conforme o solo, e `[D-01]` mostra uma faixa de 5–71% entre campos. Diante disso, qualquer ordem fixa de inclusão seria intuição travestida de decisão. O que se decide aqui é o **protocolo que responde à pergunta com os dados da Invicta** — e o fato de a plataforma já produzir todas essas camadas (`reusa`) torna o custo do experimento baixo e o valor acadêmico alto: nenhum estudo da base combina mapa intra-talhão + fertilidade krigada + CEa `[LACUNA]`.

## Consequências

- É possível — e deve ser tratado como resultado legítimo, não como fracasso — que o MVP termine com um modelo **só espectral + relevo**, replicando o achado de `[C-11]`. Isso precisa estar dito ao produto **antes** do experimento, para não virar decepção depois.
- Clima entra como P4, o que significa que a ingestão climática (dependência nova) **não bloqueia** o MVP; ela é pré-requisito do braço E da ablação, não do produto mínimo.
- Manejo (P5) depende de dado que a plataforma tem de forma parcial/incerta — o resultado da ablação nesse grupo será, provavelmente, "sem poder de teste suficiente", e isso deve ser declarado como `[LACUNA]` e não interpretado como "manejo não importa".

**Nível de confiança: MÉDIO-ALTO** para o protocolo (é o único caminho defensável diante de evidência contraditória). **BAIXO** para qualquer expectativa sobre *qual* grupo vai sobreviver à ablação — a base literalmente discorda de si mesma neste ponto.

---

# D3 — Resolução e unidade espacial

## Contexto

A seção 21 fixa o grid de 20×20 m, com 10 m e 30 m a avaliar depois. A plataforma já opera nesse pixel (`interp.py` recebe `pixel_m`, com 20,0 m no contrato documentado do backend). A pergunta é se a base sustenta 20 m e o que fazer com as outras resoluções.

## Alternativas

A célula de 10 m (nativa do Sentinel-2 para 4 bandas) · **20 m** · 30 m (HLS/Landsat) · resolução adaptativa por talhão.

## Evidências

- `[RESULTADO ESPECÍFICO]` Em **simulação de degradação de resolução** (milho e soja, EUA, intra-talhão, contra pontos de colhedora com GPS), a variância intra-talhão explicada cai de 100% a 3 m para 86% a 10 m, **72% a 20 m** e 59% a 30 m `[B-08]`. Este é o **único número da base que dimensiona diretamente o custo de informação do grid-alvo**.
- `[CONTRADIÇÃO DIRETA, mesmo estudo]` Nos **modelos empíricos reais** de `[B-08]`, o R² médio foi **maior** em 30 m HLS (0,56; faixa 0,21–0,88) do que em 3 m Planet (0,30; faixa 0,09–0,77). E em soja na Hungria, Sentinel-2 (10 m) superou PlanetScope (3 m) em **todas** as métricas: R² 0,90 vs. 0,85; RMSE 0,184 vs. 0,222 t/ha `[B-05]`. **Resolução mais fina não converte automaticamente em melhor acurácia empírica** — qualidade radiométrica, número de bandas úteis e consistência temporal pesam tanto ou mais que o GSD.
- `[RESULTADO ESPECÍFICO]` A agregação infla a métrica de forma quantificada: r² de **0,31** (pixel 30 m, sem suavização) → **0,40** (com regressão harmônica) → **0,45** (talhão) → **0,69** (condado), em validação externa contra >1 milhão de pontos reais de colhedora `[B-04]`. A mesma predição parece quase duas vezes melhor quando agregada.
- `[RESULTADO ESPECÍFICO]` **Precedente direto em grade de 20 m:** soja, Paraná, 15 talhões, Sentinel-2, grade de 20 m `[B-12]`. É o único estudo da base que usa exatamente o grid-alvo, em soja, no Brasil.
- `[RESULTADO ESPECÍFICO]` Grade de 10 m foi usada com sucesso em soja nos EUA (24.282 células) `[B-10]`.
- `[RESULTADO ESPECÍFICO]` Argumento indireto a favor de ir abaixo de 30 m: `[D-12]` treinou em grade de 30 m e **detectou autocorrelação residual ainda em 50 m** (Moran's I = 0,19; p = 0,01), lido pelos autores como sinal de que uma grade mais fina pode capturar padrão adicional.
- `[RESULTADO ESPECÍFICO]` Custo computacional pode ser cortado sem perda: em `[B-12]`, treinar sobre uma grade de amostragem de 40×40 m (20–30% dos pixels) **não perdeu acurácia** frente a usar 100% dos pixels (R² 0,989 entre os dois conjuntos de predições).
- Limite de sensor: Sentinel-2 entrega 10 m em 4 bandas e **20 m nas 6 bandas de red-edge/SWIR** `[FD-01]`; CBERS-4A MUX é 16,5 m `[FD-07]`. Um grid de 20 m é, portanto, a menor célula em que **todas** as bandas usadas existem sem superamostragem.
- Restrição de engenharia (não de literatura): `interp.py` limita a malha a 400 células por lado para proteger a memória do plano do Render (512 MB); a 20 m isso cobre 8 km de lado por talhão.

## Vantagens e desvantagens

| Opção | Vantagens | Desvantagens |
|---|---|---|
| 10 m | 86% da variância na simulação de `[B-08]`; nativo de 4 bandas do S2; precedente `[B-10]` | red-edge/SWIR precisariam ser superamostradas; 4× mais células (custo e memória); `[B-05]` mostra que mais fino ≠ melhor |
| **20 m** | precedente brasileiro direto em soja `[B-12]`; todas as bandas nativas; já é o pixel da plataforma; 72% da variância na simulação `[B-08]` | perde 28% da variância intra-talhão da simulação de `[B-08]` |
| 30 m | melhor R² empírico em `[B-08]`; alinha com HLS `[FD-04]` | autocorrelação residual ainda em 50 m `[D-12]`; grosseiro demais para manejo |
| adaptativa | otimiza por talhão | nenhuma evidência na base; complica *lineage*, comparação e cache |

## `[DECISÃO]` D3

1. **A unidade espacial de produção é a célula de 20×20 m**, em grade alinhada e estável por talhão (mesma origem entre safras, para que a célula seja comparável no tempo). `reusa` — é o pixel que `interp.py`, `colheita.py` e o front já operam.
2. **10 m e 30 m entram como experimento de sensibilidade obrigatório do MVP**, não como "avaliar depois": treinar o candidato vencedor nas três resoluções, com o mesmo protocolo, e reportar RMSE/mediana por talhão em cada uma. É barato (mesmo código, outro `pixel_m`) e responde localmente a contradição `[B-08]` vs. `[B-05]`.
3. **Toda métrica é reportada em três escalas separadas e rotuladas** — célula de 20 m, talhão, conjunto — e **nunca** se cita a métrica de talhão como se fosse a de célula. Decorre diretamente de `[B-04]`.
4. **Treinar sobre subamostra do grid quando o custo apertar.** Adotar uma grade de amostragem para treino (p.ex. 40 m, i.e. 1 célula a cada 2×2) e **prever em todas as células**, seguindo `[B-12]` (R² 0,989 entre os dois conjuntos). O ganho é direto no custo do laço aninhado de D1.
5. **`[DECISÃO]` Não adotar resolução adaptativa** no MVP: sem evidência na base e com custo de *lineage* e comparabilidade.

## Justificativa

20 m não é a resolução "ótima" — a base não permite afirmar que exista uma. É a resolução em que (i) existe o único precedente publicado de soja intra-talhão em grade no Brasil `[B-12]`, (ii) todas as bandas do Sentinel-2 usadas são nativas `[FD-01]`, e (iii) a plataforma já opera, o que torna o custo `reusa`. A contradição entre a simulação e os modelos empíricos de `[B-08]` é justamente a razão de 10/30 m entrarem como experimento e não como fé.

## Consequências

- Um talhão de 100 ha gera ~2.500 células; 20–100 talhões-safra geram 5×10⁴ a 2,5×10⁵ linhas — mas só 20–100 unidades independentes. Essa razão de ~2.500:1 é o principal agravante de vazamento e está na origem de D5.
- A subamostragem de treino (item 4) precisa ser espacialmente sistemática, não aleatória, para não reintroduzir vizinhança.

**Nível de confiança: ALTO** para 20 m como unidade de produção. **MÉDIO** para a expectativa de que 20 m seja melhor que 30 m em acurácia — `[B-08]` sugere que pode não ser, e é exatamente por isso que o experimento de sensibilidade é obrigatório.

---

# D4 — Variável-alvo

## Contexto

O alvo é produtividade em kg/ha, vinda do mapa de colheita limpo por `colheita.py`. O pipeline portado do QGIS termina com um **"ajuste à média real"**: reescala o mapa para que sua média coincida com a produtividade média informada da safra (tipicamente a pesagem de balança do talhão). Essa etapa é agronomicamente correta e, ao mesmo tempo, metodologicamente ambígua quando o alvo do modelo **é** a produtividade.

## Alternativas

| # | Alternativa |
|---|---|
| C1 | Alvo = `yield_ajustado` (com ajuste à média), como o pipeline entrega hoje |
| C2 | Alvo = `yield_sem_ajuste` (após todos os filtros, sem o reescalonamento final) |
| C3 | **Gerar e armazenar os dois; treinar/validar com C2 como primário e C1 como análise de sensibilidade** |
| C4 | Remover o ajuste do pipeline de produção |

## Evidências

**Por que o ajuste é ambíguo.** A média informada da safra é, ela própria, a resposta agregada que o modelo tenta prever.
- **Não é vazamento de feature:** nada do ajuste entra no vetor de entrada; as features (espectrais, solo, relevo, CEa) permanecem intactas.
- **É um alvo que incorpora informação pós-colheita:** o mapa-alvo não é medição independente, é medição calibrada por um agregado que só existe após a colheita. O fator é constante por talhão-safra, então **não** cria correlação diferencial entre células — mas **muda o que a métrica significa**: sob LOFO, o modelo é avaliado contra um alvo já corrigido para o nível médio correto daquele talhão, enquanto em operação real, em R3, esse nível médio é desconhecido.
- **Onde vira vazamento de fato:** se a média do talhão-safra (ou o fator de ajuste) for usada como feature, ou se o fator for estimado globalmente sobre o conjunto todo.
- `[LACUNA]` **Nenhum estudo da base discute o ajuste à média informada como fonte de vazamento.** A classificação é `[HIPÓTESE]` deste projeto.

**Por que o ajuste existe e deve permanecer no pipeline.** `[RESULTADO ESPECÍFICO]` `[H-14, só abstract]` cataloga quatro categorias de erro em mapas de colheita — (i) dinâmica de colheita da colhedora; (ii) medição contínua de umidade e produtividade; (iii) acurácia posicional (GNSS); (iv) erros do operador — e a categoria (ii) é exatamente o erro de calibração que o ajuste corrige.

**O erro do alvo é o teto de acurácia do modelo.**
- `[RESULTADO ESPECÍFICO]` "Pesquisadores relataram que **10 a 50% das observações** em um dado talhão contêm erros significativos e devem ser removidas", e os métodos de remoção **não foram padronizados** `[H-12, só abstract]`.
- `[RESULTADO ESPECÍFICO]` Em 595 datasets reais de grãos, um protocolo automatizado em dois estágios removeu **~30%** do dataset por talhão-monitor, sendo **um terço** dessa remoção atribuída a outliers **espaciais locais** — e *"the cleaning of local outliers impacted the yield spatial structure"*, enquanto os filtros globais só melhoram a distribuição `[H-13, só abstract]`.
- `[CONSENSO]` O desalinhamento pixel × ponto de colhedora vem de (i)+(iii): o grão registrado numa posição foi cortado metros antes (atraso de fluxo pela plataforma e elevador) e a posição carrega o offset da antena `[H-14]`. Numa célula de 20 m, um deslocamento de 5–15 m atribui produtividade à célula errada. `[B-07]` reconhece o problema do lado do sensoriamento e propõe um método dedicado de casamento polígono-pixel — sinal de que não é trivial.
- `[RESULTADO ESPECÍFICO]` A interpolação IDW **suaviza** o alvo, removendo variância de alta frequência e tornando-o mais fácil de prever que a realidade — o efeito de agregação quantificado em `[B-04]` (r² 0,31 → 0,69 só mudando a escala).

## Vantagens e desvantagens

| Alternativa | Vantagens | Desvantagens |
|---|---|---|
| C1 | alvo mais "limpo"; é o que o produto já mostra | métrica mede algo que a operação real não tem (o nível médio conhecido) |
| C2 | alvo mais próximo da medição independente | mantém o erro de calibração de colhedora documentado em `[H-14]` |
| **C3** | permite **medir** o efeito do ajuste em vez de supô-lo; conservador | dobra o armazenamento do alvo e exige um experimento a mais |
| C4 | elimina a ambiguidade | quebra um produto que já funciona e descarta uma correção agronômica legítima |

## `[DECISÃO]` D4

1. **Unidade interna: kg/ha.** `sc/ha` só na interface (1 sc = 60 kg).
2. **Adotar C3.** `colheita.py` passa a gerar e armazenar **duas versões** do alvo por talhão-safra: `yield_sem_ajuste` (após todos os filtros, sem o reescalonamento final) e `yield_ajustado` (com o ajuste à média real, que **permanece** no pipeline de produção do mapa de colheita).
3. **O alvo primário de treino e validação é `yield_sem_ajuste`.** `yield_ajustado` roda como **análise de sensibilidade declarada**. Se as métricas divergirem materialmente, o ajuste está carregando informação relevante e isso é um resultado a reportar, não a esconder.
4. **Em nenhuma circunstância** a média informada da safra, o fator de ajuste ou qualquer derivado entram como feature. Teste automático: nome em lista negra **e** correlação de Pearson entre cada feature e a média do talhão-safra acima de 0,95 sem justificativa registrada bloqueia o pipeline. **`[HIPÓTESE]`: o corte de 0,95 é escolha deste projeto — a base não traz limiar de correlação para detecção de vazamento `[LACUNA]`** —, fixado antes do experimento para não ser ajustado ao resultado.
5. **Decompor o erro em duas componentes reportadas separadamente:** *erro de nível* (o modelo acerta a média do talhão?) e *erro de padrão* (acerta onde é mais e onde é menos?). A seção 61 pergunta as duas coisas separadamente; então elas são medidas separadamente. Operacionalmente: bias e RMSE da média do talhão para o nível; correlação de Spearman entre predito e observado **dentro** do talhão para o padrão.
6. **Agregação de pontos de colhedora para a célula por mediana**, não média, com o **número de pontos por célula armazenado**; células abaixo de um limiar de densidade são excluídas do treino e marcadas na interface.
7. **Auditar o filtro local de `colheita.py` contra o índice de Moran local** de `[H-13]` e **registrar o percentual removido por estágio** em cada talhão-safra. Remoção < 5% (filtro frouxo) ou > 60% (agressivo) bloqueia o talhão-safra para revisão manual. **`[HIPÓTESE]` deste projeto:** a faixa foi escolhida **com folga** em torno dos ~30% de `[H-13, só abstract]` e dos 10–50% de `[H-12, só abstract]` — **os valores 5% e 60% não vêm de nenhuma fonte** e são fixados antes do experimento justamente para não serem ajustados ao resultado. `novo_barato` (Moran local com `numpy`/`scipy`).
8. **Quantificar e reportar o erro do alvo** (p.ex. variância entre passadas adjacentes em região homogênea) junto do RMSE do modelo, para que o leitor saiba quanto do erro é do modelo e quanto é do dado. `[DECISÃO]` Esse número é componente irredutível do RMSE.

## Justificativa

A decisão é deliberadamente conservadora porque a base **não cobre** o caso: nenhum estudo discute o ajuste à média como fonte de vazamento `[LACUNA]`. Diante disso, a escolha barata é armazenar as duas versões e **medir** — o custo é uma coluna a mais, e o benefício é que o projeto deixa de depender de uma suposição não testada. A insistência na decomposição nível/padrão vem de `[B-04]`: como a agregação sozinha muda o r² de 0,31 para 0,69, relatar um número único é enganoso por construção.

## Consequências

- O produto pode ter um erro de **nível** aceitável e um erro de **padrão** ruim (ou vice-versa). São dois produtos diferentes, com dois critérios de aceite diferentes (ver D10).
- Reprocessar o histórico de mapas de colheita para gerar a versão sem ajuste é um custo de migração único, e precisa acontecer **antes** do inventário de dados (Etapa 3 do roadmap).

**Nível de confiança: ALTO** para kg/ha, mediana por célula, contagem de pontos e decomposição nível/padrão. **BAIXO-MÉDIO** para a classificação do ajuste à média: é `[HIPÓTESE]` deste projeto, sem apoio na base, e a decisão foi tomada pelo lado conservador precisamente por isso. É uma das três decisões menos confiantes deste ADR.

---

# D5 — Estratégia de validação e métrica oficial

## Contexto

A seção 17 define cinco validações. A escolha de qual é **oficial** é a decisão mais consequente deste ADR, porque determina qual número o projeto vai publicar e comparar. A base contém um debate aberto sobre CV espacial, e seria desonesto apresentar só um lado.

## Alternativas

| # | Alternativa |
|---|---|
| V1 | Random split como métrica oficial (prática dominante na literatura de sensoriamento) |
| V2 | **GroupKFold por talhão como oficial**, com as demais como complementares |
| V3 | LOFO-CV como oficial |
| V4 | kNNDM como oficial |
| V5 | Amostragem probabilística + inferência *design-based* (recomendação de `[C-03]`) |

## Evidências

**Random split infla, e a direção é consistente.**

| id | Estudo | Cultura / escala | Comparação | Resultado |
|---|---|---|---|---|
| `[C-01]` | Ploton 2020 | **biomassa florestal, não agricultura**; pixel 1 km | random 10-fold vs. spatial 44-fold vs. buffered LOO | R² **0,53 → 0,14**; RMSPE 56,5 → 77,5 Mg/ha; modelo nulo 82 Mg/ha; com buffer ≥100 km, R² tende a zero |
| `[C-11]` | Rathore 2026 | **soja, intra-talhão**, EUA, 6 talhões-safra | só LOFO-CV | R² 0,54 / 0,40 / 0,24 / −0,58 / −1,02 / −6,23; RMSE 554–765 kg/ha |
| `[C-12]` | Stock 2025 | **clorofila marinha, não agricultura**; regional | random 10-fold vs. block CV | CV aleatória **subestimou o erro em 5–54%** |
| `[D-12]` | Smith 2026 | milho e **soja**, EUA, grid 30 m | split interno vs. *group-wise* por estado | soja R² 0,90 → **0,79** (0,67–0,88); milho 0,87 → 0,77 |
| `[B-15]` | Pereira 2026 | **soja, Brasil**, escala **municipal** | 70/30 vs. estados independentes | R² 0,72 → **0,34–0,76**; RMSE 301,5 → 168,3–491,2 kg/ha |
| `[B-04]` | Deines 2021 | milho, EUA, pixel 30 m → condado | validação externa contra >1 M pontos de colhedora | r² 0,31 → 0,40 → 0,45 → 0,69; RF "performed poorly when tested on years and locations not represented in the training data" |
| `[E-brasil-04]` | Mohite 2023 | **soja, Brasil**, municipal | 80/20 aleatório vs. safra nova *held-out* | R² 0,748 → **0,693**; RMSE 414 → **585 kg/ha** |
| `[C-14]` | Habibi 2023 (**proceedings**, sem DOI) | **soja, intra-talhão**, Japão, 7 talhões, UAV | RCV vs. SCV vs. LOFO, todos contra um talhão independente | qualitativo: CV aleatória com "poor accuracy" no talhão independente; SCV e LOFO "dentro das faixas" |

`[EVIDÊNCIA LIMITADA]` Em **todos** os estudos da base que testam os dois esquemas lado a lado, a validação espacialmente consciente reporta desempenho **igual ou pior** que o split aleatório, **nunca melhor**.

**O contra-argumento, que não pode ser omitido.** `[EVIDÊNCIA]` `[C-03]` contesta diretamente Ploton, Roberts e Meyer/Pebesma: sob amostragem **aleatória ou sistemática**, CV espacial e buffered-LOO **superestimaram** o erro (viés de +10 a +15 Mg/ha), enquanto a CV padrão ficou praticamente sem viés; sob amostragem **em cluster**, o quadro se inverte. Conclusão dos autores: *"spatial cross-validation methods have no theoretical underpinning"*.

**A reconciliação técnica.** `[CONSENSO]` `[C-08, só abstract]` e `[C-09]`: o desempenho de um esquema de CV depende da **área de predição (interpolação vs. extrapolação)**, do padrão de amostragem e da autocorrelação da paisagem. A buffered-LOO "geralmente superestimou erros de interpolação geográfica" — dando razão parcial a `[C-03]` — mas foi correta ao estimar acurácia **em novas áreas de predição**. `[C-09]` tabula o mesmo trade-off: CV aleatória é "excessivamente otimista para dados clusterizados"; CV espacial k-fold é "excessivamente pessimista". E `[C-02, só abstract]` já advertia que blocagem mal dimensionada pode "induzir involuntariamente extrapolações" — confirmado por `[C-12]`: *"the most important methodological choice was the block size"*, acima da forma, do número de *folds* e da atribuição.

**Poucas safras.** `[RESULTADO ESPECÍFICO]` `[C-11]` afirma textualmente que um dataset de **2–3 safras é insuficiente** para LOFO-CV robusta. `[LACUNA]` **O número mínimo de safras para uma leave-one-year-out robusta não está na base revisada.**

**Complementos.** `[C-04, só abstract]` define a Área de Aplicabilidade (AOA) pelo índice de dissimilaridade no **espaço de preditores** (não distância geográfica), com o achado central: *"the prediction error within the AOA is comparable to the cross-validation error... cross-validation error does not apply outside the AOA"*. `[C-05]` recomenda literalmente acinzentar as áreas fora da AOA e critica a estatística única e global, que "obscurece quaisquer diferenças". `[C-09]` reduz o kNNDM de 4,8 dias (NNDM LOO) para 1,2 min em 4.000 pontos, com k ≥ 10 para amostras aleatórias e k = 4–6 para clusterizadas.

## Vantagens e desvantagens

| Alternativa | Vantagens | Desvantagens |
|---|---|---|
| V1 | números bonitos; comparável à maioria da literatura | mede o teto otimista, não generalização; é o erro que `[C-01]`, `[C-12]`, `[D-12]`, `[E-brasil-04]` quantificam |
| **V2** | usa todos os *folds*; menor variância que LOFO; viável a partir de ~10 talhões (`[HIPÓTESE]` deste projeto — a base não fixa nº mínimo de grupos `[LACUNA]`) | não é exatamente o caso de uso (que é 1 talhão novo) |
| V3 | é exatamente o caso de uso | variância altíssima com poucos talhões; R² negativo esperado em parte dos *folds* `[C-11]` |
| V4 | tecnicamente o mais correto segundo `[C-08]`/`[C-09]` | exige conhecer a área de predição antes de treinar; implementação de referência é em R |
| V5 | tem fundamento teórico, segundo `[C-03]` | exige desenho amostral probabilístico dos talhões — impossível: os talhões são os que os clientes têm |

## `[DECISÃO]` D5

**Posição do projeto no debate.** O objetivo declarado do produto é prever um talhão e/ou uma safra que o modelo **nunca viu** (seção 61). Isso é **extrapolação geográfica**, não interpolação dentro de uma área amostrada. Pela própria formulação de `[C-08]`/`[C-09]`, é o cenário em que a CV espacialmente consciente está correta. A crítica de `[C-03]` é **aceita como ressalva, não como refutação**: ela vale plenamente quando o objetivo é interpolar dentro de uma área já amostrada — se no futuro a plataforma oferecer "preencher lacunas dentro de um talhão parcialmente colhido", **esse** produto será avaliado com CV aleatória ou NNDM, e não com LOFO.

**As cinco validações e seus papéis:**

| # | Esquema | Papel | Implementação | Compat. |
|---|---|---|---|---|
| 1 | Random split | **Só benchmark e detector de vazamento** — nunca métrica final | `KFold(shuffle=True)` | `reusa` |
| 2 | **GroupKFold por talhão** | **MÉTRICA OFICIAL DO PROJETO** | `GroupKFold(groups=talhao_id)` | `reusa` |
| 3 | LOFO-CV | Métrica secundária, reportada como **distribuição** | `LeaveOneGroupOut(groups=talhao_id)` | `reusa` |
| 4 | LOYO-CV | **Diagnóstico qualitativo** até haver ≥4 safras (o limiar de 4 é `[HIPÓTESE]` deste projeto — ver a nota logo abaixo) | `LeaveOneGroupOut(groups=safra)` | `reusa` |
| 5 | Fazenda externa | Estudo de caso final, avaliado **uma única vez** | hold-out por `fazenda_id` | `reusa` |

**Regras duras:**

1. **O grupo é o talhão (`talhao_id`), nunca o talhão-safra.** Agrupar por talhão-safra reintroduz vazamento pelo histórico do próprio talhão e pelas camadas fixas (CEa, MDE, fertilidade krigada), que são idênticas entre safras.
2. **Métrica ponderada por talhão, não pelo pool de pixels.** `GroupKFold` balanceia contagem de amostras, então um talhão de 300 ha domina um *fold*; a métrica reportada é a média/mediana **das métricas por talhão**.
3. **CV aninhada obrigatória** (ver D1, item 2 do protocolo).
4. **Talhões contíguos**: calcular a distância entre centroides por *fold* e comparar com o alcance de autocorrelação do variograma do alvo. `reusa` — `pykrige` já calcula variograma em `interp.py`. Distância menor que o alcance é registrada como aviso no relatório de validação. Complementarmente, `GroupKFold` por `fazenda_id` como esquema adicional.
5. **Interpolação (krigagem de solo, IDW da colheita) nunca cruza fronteira de talhão.** Com o split por talhão, isso mantém a interpolação contida dentro de um grupo. Verificar explicitamente que a krigagem de `interp.py` roda **por talhão** e não sobre a fazenda inteira.
6. **R² negativo em parte dos *folds* de LOFO é o resultado esperado, não um bug** — `[C-11]` teve 3 de 6 negativos. Reportar **mediana + faixa + quantos talhões ficaram piores que o modelo nulo**, nunca a média de R².

**Métrica OFICIAL:** **RMSE em kg/ha na célula de 20 m, sob GroupKFold por talhão, reportado como mediana entre talhões acompanhada da faixa (mín–máx) e do número de talhões piores que o modelo nulo.** Acompanham obrigatoriamente, na mesma tabela: bias (erro de nível), correlação de Spearman intra-talhão (erro de padrão, D4), R² por talhão (secundário) e a mesma linha em escala de talhão. Razão de o R² não ser a métrica oficial: ele é relativo à variância **daquele** talhão, e um talhão homogêneo produz R² ruim mesmo com erro absoluto pequeno — foi exatamente o que aconteceu em `[C-11]`, onde um R² de −6,23 convive com RMSE de 589 kg/ha.

**`[DECISÃO]` Sobre poucas safras:** implementar LOYO desde o início (custo de uma linha), mas tratá-la como **diagnóstico qualitativo** — "o modelo colapsa quando muda o ano?" — e não como métrica com precisão estatística, até que existam ≥4 safras. O limiar de 4 é **`[HIPÓTESE]` deste projeto por analogia direta com `[C-11]`** (que declara 2–3 insuficientes para LOFO); a base não traz o número `[LACUNA]`. Enquanto isso, o relatório de validação **nomeia cada safra do conjunto e a classifica** (normal / seca / excesso hídrico) pelo clima regional, ainda que o clima não entre como feature — uma métrica média sobre safras que não incluem nenhum ano ruim é enganosa por omissão.

**Complementos decididos:**
- **AOA / índice de dissimilaridade entra no MVP como *gate* de exibição**, não como refinamento futuro `[C-04]`, `[C-05]`. `novo_barato` (`numpy`/`scipy`). É o mecanismo que permite à interface dizer "não tenho suporte de dados para prever este talhão" em vez de emitir um número sem base.
- **kNNDM fica para a Fase 3** `[C-09]`, depois que GroupKFold/LOFO estiverem estabelecidos. `novo_barato`.
- **Alerta operacional:** `[C-12]` mostra que métodos espaciais **falharam** em selecionar contra modelos sobreajustados em mais de 50% dos casos. CV espacial reduz o viés da estimativa de erro, mas **não é garantia contra overfitting**.
- **Uso legítimo do split aleatório:** a diferença `RMSE_LOFO − RMSE_random` é a estimativa própria do projeto para a magnitude da inflação — o número que `[C-01]`, `[C-12]` e `[D-12]` mediram em outros contextos, e que ninguém mediu para soja no Brasil em grid de 20 m `[LACUNA]`. Um *gap* **próximo de zero** é tão suspeito quanto um *gap* enorme: sugere que o agrupamento não está separando de fato.

## Justificativa

A escolha de GroupKFold (e não LOFO) como oficial é uma decisão de **estimador**, não de rigor: com 15–40 talhões distintos, LOFO produz uma estimativa com variância altíssima (`[C-11]` é a demonstração), enquanto GroupKFold usa todos os *folds* e responde à mesma pergunta com menos ruído. LOFO permanece como métrica secundária porque é literalmente o caso de uso — e porque sua **distribuição**, não sua média, é a informação honesta. A ancoragem de expectativa mais próxima disponível é `[D-12]`: queda de R² 0,90 → 0,79 ao passar para validação agrupada em soja, uma queda **moderada**, muito menor que a de `[C-01]` — mas em grid de 30 m, nos EUA, e com o grupo sendo "estado", não "talhão".

## Consequências

- **Os números publicados pelo projeto serão piores que os da maioria da literatura de sensoriamento**, e isso precisa estar explicado no material acadêmico e comercial antes de aparecer. Uma queda de métrica ao passar de random para LOFO **não** será tratada como "modelo ruim", e sim como estimativa mais honesta do que esperar em campo (seção 60).
- O *hold-out* de fazenda externa consome sua independência a cada olhada: exige um contador persistido de avaliações, com falha se > 1 antes do relatório final.
- Se não houver ≥2 fazendas com ≥5 talhões-safra cada, a Validação 5 é declarada `[LACUNA]` explícita no relatório, não improvisada. **`[HIPÓTESE]`: "≥2 fazendas com ≥5 talhões-safra" é piso mínimo escolhido por este projeto; a base não traz tamanho mínimo de conjunto externo `[LACUNA]`.**

**Nível de confiança: ALTO.** É a decisão mais bem sustentada do ADR: oito estudos da base apontam na mesma direção, o contra-argumento está registrado e respondido, e a escolha entre GroupKFold e LOFO é justificada por variância, não por preferência.

---

# D6 — Momento da previsão e experimento temporal

## Contexto

A seção 32 pede avaliar previsões em V6, V10, R1, R3, R5 (ou dias após semeadura quando o estádio não for identificável) e responder: *qual é o primeiro momento em que a previsão se torna operacionalmente útil?* A seção 35 mostra "Momento da previsão: R2" na interface. A decisão precisa definir como o dataset é construído para que essa pergunta seja respondível **sem vazamento temporal**.

## Alternativas

| # | Alternativa |
|---|---|
| T1 | Um modelo único com features de toda a safra |
| T2 | **Um modelo por janela de antecedência, cada um com seu corte temporal** |
| T3 | Modelo sequencial que consome a série completa até a data (RNN/1D-CNN) |
| T4 | Datas fixas de calendário |

## Evidências

**A curva existe e é íngreme.**
- `[RESULTADO ESPECÍFICO]` Soja: R² sobe de **0,26** na emergência (VE/VC) para **>0,70** em R4/R5 (enchimento de grãos), em grid de 10 m nos EUA `[B-10]`. São 6 pontos de estádio — o mais próximo de uma curva que a base tem.
- `[RESULTADO ESPECÍFICO]` A janela **V4–V5 a R1** (60–70 dias antes da colheita) foi a data ótima em soja na Hungria `[B-05]`; o enchimento de grãos (R5) foi a janela testada como chave no Paraná `[B-12]`; em milho, o período mais adequado foi R4–R6 (105–135 dias após plantio) `[B-01]`.
- `[RESULTADO ESPECÍFICO]` Em escala **municipal**, o melhor XGBoost usou **150 dias após a semeadura** — próximo da maturação, não uma antecipação grande `[B-15]`; e o MAE degrada de 0,24 Mg/ha na previsão de março (DOY 64) para 0,42 Mg/ha na de janeiro (DOY 16) `[B-03, só abstract]`. **Ambos são escala municipal e não servem de benchmark de precisão de pixel.**
- `[RESULTADO ESPECÍFICO]` A incerteza também tem curva: um BNN em milho county-level teve R² ~0,75 já em meados de agosto (~2 meses pré-colheita), contra 0,77 no fim da safra `[G-13, só abstract]` — sustenta dizer ao usuário que "a previsão vai apertar conforme a safra avança", com ressalva de cultura e escala.
- `[LACUNA]` **Nenhum estudo da base traz curva contínua de R²/RMSE por dia-antes-da-colheita para soja intra-talhão.** É uma das lacunas mais exploráveis do projeto.

**Contra datas fixas de calendário.**
- `[RESULTADO ESPECÍFICO]` Em `[B-12]`, **não houve tendência temporal consistente na melhor data de monitoramento entre talhões**, e índices isolados tiveram correlação ora positiva ora negativa com a produtividade na mesma safra.
- `[RESULTADO ESPECÍFICO]` Cobertura de nuvens no Paraná de **40–70%**, restando **4–10 imagens Sentinel-2 por talhão na safra inteira** `[B-12]`. Uma data fixa simplesmente não existe para boa parte dos talhões.

**O vazamento temporal a evitar.** `[EVIDÊNCIA]` É o erro declarado em `[A-03]`: as simulações APSIM alimentadas ao ML usaram o clima real completo do ano-teste, e os autores registram que *"the weather will be unknown"*. O mesmo vale para índices espectrais — usar imagens de R6 para "prever" em R3 importa o salto de R² 0,26 → 0,70 de `[B-10]` inteiro como vazamento. `[EVIDÊNCIA]` Em `[A-03]`, a variável mais importante por *permutation importance* foi a tendência de produtividade (`yield_trend`) — em escala intra-talhão e com 2–5 safras, uma variável de tendência é indistinguível de efeito de ano e vira vazamento disfarçado.

## `[DECISÃO]` D6

1. **Adotar T2: um modelo por janela de antecedência**, cada um com seu próprio corte temporal. Toda linha do dataset carrega um campo obrigatório **`data_previsao`**, e a montagem de features filtra `data_imagem <= data_previsao` **na consulta**, não em pós-processamento.
2. **As janelas são definidas por dias após a semeadura (DAS), não por data de calendário**, com o estádio fenológico como rótulo secundário quando disponível. Justificativa direta: `[B-12]` não achou tendência temporal consistente entre talhões e registra 4–10 imagens por safra por causa de nuvem. Janelas propostas para o MVP (a serem confirmadas com a agronomia): ~30, ~50, ~70, ~90 e ~110 DAS, mapeadas aproximadamente a V6, V10, R1, R3 e R5.
3. **A curva de acurácia × antecedência é entregável do MVP**, não subproduto: RMSE (métrica oficial de D5) por janela, com a mesma validação e o mesmo modelo nulo. É a resposta direta à seção 32 e preenche uma `[LACUNA]` da literatura para soja intra-talhão.
4. **Só é publicada na interface a janela cujo desempenho supera o modelo nulo** sob a validação oficial. As janelas iniciais provavelmente não superam — e isso é informação, não falha. A interface mostra "ainda não é possível prever com confiança neste estádio", que é o comportamento coerente com o *gate* de AOA de D5.
5. **`[DECISÃO]` Não usar feature de tendência temporal (`yield_trend`) no MVP** — `[A-03]`.
6. **`[DECISÃO]` Nenhuma variável climática acumulada pode ter janela terminando após `data_previsao`.** O campo `janela_fim` de cada feature climática é verificado no *lineage*.
7. **T3 (modelo sequencial) fica fora**, por D1 (é DL) e porque todos os resultados quantificados da base com RNN são em escala municipal/vilarejo `[B-03]`, `[H-04]` ou em preprint sem métrica `[G-11, só abstract]`.
8. **Gaps de nuvem:** no MVP, features espectrais por janela são agregadas sobre as cenas **disponíveis** dentro da janela, com o número de cenas registrado como metadado da linha; janelas sem nenhuma cena aceita geram valor ausente (tratado nativamente por XGBoost/LightGBM). Preenchimento de gap por SAR `[B-13, só abstract]` ou HLS `[FD-04]` fica para a Fase 2 — ver "Decisões adiadas".

## Justificativa

A pergunta da seção 32 só tem resposta se o dataset for construído com corte temporal por linha. T2 é a única alternativa que permite responder e simultaneamente bloqueia o vazamento mais provável do projeto. A escolha de DAS sobre calendário não é preferência: é consequência direta dos dois achados de `[B-12]` (sem tendência consistente entre talhões; 4–10 imagens por safra por nuvem), que é o estudo no mesmo país, mesma cultura e mesma grade.

## Consequências

- O custo experimental multiplica por ~5 (uma janela por modelo). Combinado com ~9 candidatos e CV aninhada, isso confirma que treino é job offline.
- O produto passa a ter um comportamento de "silêncio honesto" nos estádios iniciais, que precisa ser desenhado na UI e vendido como característica, não como ausência.
- A curva por janela é o principal ativo acadêmico do MVP, porque a base não tem nenhuma.

**Nível de confiança: ALTO** para o corte temporal por linha e para janelas por DAS. **MÉDIO** para as janelas específicas propostas (30/50/70/90/110 DAS) — são uma tradução aproximada dos estádios de `[B-10]`/`[B-05]`/`[B-12]` e precisam do crivo agronômico da Invicta.

---

# D7 — Incerteza

## Contexto

O alvo de produto (seção 35) é exibir "Produtividade prevista: 58,7 sc/ha · Faixa estimada: 54,2–63,1 sc/ha" — internamente ~3.522 kg/ha com faixa de ~3.252 a ~3.786 kg/ha. A seção 35 já condiciona: "Apresentar somente se houver metodologia estatística bem definida". A decisão é o que entra no MVP, como calibrar e o que a interface pode mostrar.

## Alternativas

| # | Alternativa |
|---|---|
| U1 | Nenhuma incerteza no MVP |
| U2 | **QRF e/ou conformal (CQR), calibrados por grupo (talhão)** |
| U3 | NGBoost (paramétrico) |
| U4 | Bayesiano (BNN) |
| U5 | Variância entre membros de ensemble / bootstrap ingênuo |
| U6 | Só faixas qualitativas, sem número |

## Evidências

| Método | id | O que a base sustenta |
|---|---|---|
| **QRF** | `[G-02]` | Consistência assintótica **provada**; "competitivo em poder preditivo". Ressalva dos próprios fundamentos: assume observações **i.i.d.**; dependência espacial não é tratada. Sem garantia de cobertura em amostra finita |
| **Conformal / CQR** | `[G-01, só abstract]`, `[G-03, só abstract]` | Cobertura **válida em amostra finita, sem suposição distribucional**. Pressupõe **exchangeability** entre treino, calibração e teste — violada por pixels vizinhos correlacionados |
| **Conformal espacial** | `[G-04, só abstract]` | *"spatial data can be treated as exactly or approximately exchangeable in a wide range of settings"* — mas provado sob regime **infill assintótico** e apenas **localmente**. A saída correta é calibrar com **vizinhança local**, não com reamostragem global aleatória de pixels |
| **QRF aplicado a produtividade** | `[G-06, só abstract]` | Caso real (amendoim e milheto, Gana, escala nacional/anual): intervalos capturaram as produtividades observadas com alta probabilidade de cobertura (PICP/PINAW citados sem valores no resumo). **Não é soja, não é intra-talhão** |
| **BNN** | `[G-13]` | Milho, EUA, escala de **condado**: R² médio 0,77 (fim de safra). **Cobertura empírica de ≥84% para intervalo nominal de 95%** — o abstract diz *"more than 84%"*, compatível com 84,1% e com 94%: o que está estabelecido é "abaixo do nominal", não a magnitude |
| **Rede neural quantílica** | `[G-14]` | **Resultado negativo:** em 36 anos × 1.260 condados, *"quantile regression neural network does not perform better than the traditional quantile regression"*; QRF+LASSO foi o melhor |
| **NGBoost** | `[G-05, só abstract]` | Funciona com qualquer *base learner* e família de distribuição com parâmetros contínuos. O resumo **não** menciona validação em dados espaciais ou agrícolas |
| **Ensembles / bootstrap** | — | **Sem evidência na base revisada** sobre calibração para produtividade. `[LACUNA]` |

**O erro aritmético a evitar.** `[EVIDÊNCIA LIMITADA]` Se o talhão tem 2.500 células com desvio σ cada, somar variâncias como independentes dá desvio da média ≈ σ/50 — intervalo do talhão ~50× mais estreito que o da célula. É falso: as células **não** são independentes `[G-04]`, e toda a evidência de D5 documenta a autocorrelação.

**Referência de mercado.** `[F-comercial-31]` (GEOGLAM Crop Monitor, catálogo comercial) comunica condição de safra por **categorias qualitativas** (favorável / desfavorável / exceção) em vez de intervalo numérico — a abordagem mais robusta de comunicação de incerteza encontrada entre as 32 soluções revisadas, e a única entre sistemas públicos com essa escolha explícita. Nenhuma solução comercial **privada** divulga intervalo numérico; `[F-comercial-01]` (Climate FieldView) é a única que menciona o conceito de distribuição de probabilidade, sem números.

## Vantagens e desvantagens

| Alternativa | Vantagens | Desvantagens |
|---|---|---|
| U1 | simples | contraria o objetivo do produto e a seção 18; entrega número pontual com falsa precisão |
| **U2** | melhor evidência da base; CPU-only; QRF não troca de família de modelo | garantia depende de exchangeability, violada localmente — exige calibração por grupo |
| U3 | mais simples de implementar | exige assumir família de distribuição; `[HIPÓTESE]` menos robusto se o erro for assimétrico (risco de quebra por seca); sem validação espacial no resumo `[G-05]` |
| U4 | distribuição preditiva completa | `infra_nova` (GPU); e `[G-13]` entregou ≥84% para nominal de 95% |
| U5 | trivial | `[LACUNA]` — sem evidência de calibração na base |
| U6 | nunca mente | perde a pergunta central do produto ("quanto este talhão deverá produzir?") |

## `[DECISÃO]` D7

1. **Adotar U2 no MVP**: **QRF** `[G-02]` (via `quantile-forest`) **e** **split conformal / CQR** `[G-01]` (via `MAPIE` ou `crepes`), comparados entre si e contra uma **regressão quantílica simples** como baseline — porque `[G-14]` é evidência direta contra presumir que o método mais complexo ganha. `novo_barato`, CPU-only.
2. **A calibração é POR GRUPO (talhão), em modo Mondrian**, com os talhões de calibração distintos dos de treino, do mesmo modo que o LOFO. **Proibido** calibrar com split aleatório de pixels dentro do mesmo talhão — viola a exchangeability de que depende a garantia `[G-01]`, e `[G-04]` mostra que a exchangeability vale **localmente e de forma aproximada**, não globalmente.
   > **Nota de terminologia.** Onde `../literature-review/estado-da-arte.md` (oportunidade O5) diz "calibração por **vizinhança local**", este ADR está escolhendo a operacionalização concreta dessa mesma exigência de `[G-04]`: **o talhão é a vizinhança**. É a única partição que (i) respeita a dependência espacial, (ii) coincide com a unidade de agrupamento da validação oficial (D5) e (iii) corresponde à unidade em que o número será exibido ao usuário. Não são duas recomendações diferentes.
3. **A agregação célula → talhão nunca é feita somando variâncias independentes.** Ordem de preferência:
   (i) **calibrar diretamente no nível do talhão** — a unidade de calibração é o talhão-safra, o que resolve a dependência por construção (`novo_barato`);
   (ii) **bootstrap por bloco espacial** dimensionado pelo alcance do variograma (`reusa`, `pykrige`);
   (iii) **usar a covariância explicitamente**: Var(média) = (1/n²)·ΣΣ Cov(i,j), com a covariância vinda do variograma ajustado ao resíduo (`reusa`).
4. **Cobertura é MEDIDA, nunca assumida.** `[G-13]` é o contraexemplo da base: método bayesiano "correto" com ≥84% de cobertura para nominal de 95%. Métricas obrigatórias, calculadas sob a validação oficial de D5 (nunca sob split aleatório):

| Métrica | O que é | Critério |
|---|---|---|
| **PICP** (cobertura empírica) | fração de observações dentro do intervalo | comparar com o nominal; desvios reportados, não escondidos |
| **PINAW** (largura normalizada) | largura média | intervalo válido mas largo demais **não** é sucesso `[G-06]` |
| **Cobertura condicional por grupo** | por talhão e por safra | cobertura global de 90% com um talhão a 40% é falha de calibração local |
| **Cobertura por faixa de produtividade** | nas caudas | mesma partição do erro por faixa (seção 33) |

5. **`[DECISÃO]` Fora do MVP:** BNN `[G-13]` (`infra_nova`, e com o argumento adicional de `[G-14]`); NGBoost `[G-05]` entra apenas como braço opcional se o experimento com QRF/CQR falhar; bootstrap ingênuo de células (`[LACUNA]`).

6. **O que a interface pode mostrar** (detalhamento de UI em `../product/recomendacoes-arquitetura.md`):

| Defensável | Não defensável |
|---|---|
| **No talhão:** "3.520 kg/ha (3.250–3.790)" ⇔ "58,7 sc/ha (54,2–63,1)", **desde que** o intervalo venha de QRF/conformal calibrado no nível do talhão, com PICP medida sob LOFO/LOYO e o **nível nominal declarado** ("intervalo de 80%") | Intervalo por célula de 20 m com a mesma aparência de precisão do intervalo de talhão |
| **Na célula:** representação **ordinal e relativa** ("esta zona deve produzir acima / na média / abaixo da média do talhão") com faixa larga, em vez de número pontual com casa decimal | Intervalo de talhão obtido por soma de variâncias independentes |
| Indicador de confiança derivado do DI/AOA `[C-04]`, incluindo o estado "fora do domínio — não é possível prever com confiança" | Qualquer intervalo sem cobertura empírica medida `[G-13]` |
| "A previsão vai apertar conforme a safra avança" `[G-13]`, com ressalva de que aquele estudo é milho, escala de condado, EUA | Intervalo para talhão/safra fora da AOA |
| **Faixas qualitativas de confiança** (alta / média / baixa / sem suporte) no lugar do intervalo numérico, quando a PICP não estiver dentro da tolerância — inspirado em `[F-comercial-31]` | Comparar o intervalo da plataforma com números de estudos de escala diferente (`[G-06]` é nacional/anual; `[G-13]` e `[G-14]` são de condado) |

7. **`[DECISÃO]` Gate de publicação do intervalo numérico:** o intervalo em número só vai à interface se `|PICP − nominal| ≤ 5 pontos percentuais` sob a validação oficial **e** a cobertura condicional por talhão não tiver nenhum talhão abaixo de `nominal − 15 p.p.`. Caso contrário, a interface exibe a **faixa qualitativa** `[F-comercial-31]`. Os limiares são `[HIPÓTESE]` deste projeto — a base **não** traz limiar de tolerância `[LACUNA]` —, mas precisam ser fixados **antes** do experimento para não serem ajustados ao resultado.

## Justificativa

A base sustenta QRF e conformal como os dois pilares com bibliotecas Python maduras e CPU-only, e sustenta com igual clareza que **a garantia teórica não entrega cobertura empírica** `[G-13]` e que **a dependência espacial quebra a premissa** `[G-01]`/`[G-04]`. A decisão, portanto, não é "usar conformal": é "usar conformal calibrado por talhão **e medir a cobertura**, com um critério pré-registrado para não publicar o número quando a cobertura falhar". A alternativa qualitativa `[F-comercial-31]` não é um consolo — é a única forma honesta de comunicar incerteza quando 20–100 talhões-safra não bastam para calibrar um intervalo.

## Consequências

- A calibração por talhão **consome talhões**: parte do conjunto sai do treino para a calibração. Com 20–100 talhões-safra, isso é caro e pode ser o fator limitante real do produto de incerteza.
- `[EVIDÊNCIA LIMITADA]` **Nenhum estudo de QRF ou conformal da base foi aplicado a soja no Brasil em escala intra-talhão** `[LACUNA]`; `[G-04]` (conformal espacial) nunca foi validado em dados agrícolas. A extrapolação é uma aposta metodológica declarada, não uma réplica — e é, simultaneamente, contribuição original potencial.
- A interface precisa nascer com dois modos (numérico e qualitativo) e alternar entre eles por dado, não por decisão de design.

**Nível de confiança: MÉDIO.** Alta para "medir PICP e calibrar por grupo"; baixa para a expectativa de que o intervalo numérico por talhão seja publicável no MVP — pode simplesmente não haver talhões suficientes para calibrar. É uma das três decisões menos confiantes deste ADR.

---

# D8 — Explicabilidade

## Contexto

A seção 37 descreve o alvo: clicar numa região e ver "NDRE +4,7 sc/ha; Argila +1,9; Precipitação −5,1; K −1,7", com a ressalva de que são contribuições do modelo e não relações causais. A seção 19 pede explicabilidade formal. A decisão é qual método, como agregar, e o que pode ser dito ao agrônomo.

## Alternativas

SHAP/TreeSHAP · *permutation importance* · PDP · ALE · coeficientes de modelo linear · nenhuma.

## Evidências

- `[EVIDÊNCIA LIMITADA]` **TreeSHAP** `[G-07, só abstract]` é a referência canônica: segundo o próprio artigo, é o **primeiro** algoritmo em tempo polinomial para computar explicações ótimas baseadas em teoria dos jogos em modelos de árvore (RF, XGBoost, LightGBM) — "primeiro", não "único"; a base revisada não compara TreeSHAP com alternativas exatas posteriores `[LACUNA]`. Traz o algoritmo polinomial, um tipo de explicação que mede **interação local** entre features, e ferramentas para agregar explicações locais em estrutura global. A validação do artigo original é em **três problemas médicos, não agrícolas**.
- `[EVIDÊNCIA]` **Permutation importance** `[G-12]` é o método efetivamente usado na prática da literatura de produtividade: `[A-03]` usou permutação (não SHAP) e encontrou a tendência tecnológica como variável mais importante.
- `[EVIDÊNCIA LIMITADA]` **ALE deve substituir PDP** quando há features correlacionadas: *"PD plots require extrapolation of the response at predictor values that are far outside the multivariate envelope of the training data"* `[G-08, só abstract]`. Gráficos marginais (M plots) não extrapolam mas ficam "substancialmente enviesados". ALE herda as vantagens sem os defeitos e é "muito menos custoso computacionalmente que PDP". **A correlação alta é garantida neste projeto:** NDVI, SAVI, MSAVI2, EVI2, EVI e GNDVI derivam das mesmas bandas de `indices.py`; solo, relevo e clima covariam espacialmente.
- `[EVIDÊNCIA LIMITADA]` As armadilhas centrais estão catalogadas em `[G-09, só abstract]`: dependência entre features, interações não capturadas, **interpretação causal indevida**, interpretar modelos que não generalizam, e ignorar a incerteza da própria estimativa de importância.
- `[RESULTADO ESPECÍFICO]` A importância de uma variável pode variar por toda uma faixa entre modelos **igualmente bons** ajustados aos mesmos dados (*model class reliance* / conjunto de Rashomon) `[G-12]`. Reportar a importância de **um** modelo vencedor pode ser enganoso sobre o papel agronômico real da variável.
- `[RESULTADO ESPECÍFICO]` **Não existe ranking universal**: em `[D-12]`, soja tem declividade > chuva de junho > elevação, enquanto milho tem 4 das 5 mais importantes climáticas; `[D-07]` mostra o ranking mudando com a escala de agregação; `[B-09]` achou SR + declividade acima de NDVI/NDRE.
- `[RESULTADO ESPECÍFICO, o estudo mais próximo do caso Invicta]` `[G-11, só abstract, PREPRINT — revisão por pares não confirmada]` faz explicabilidade em nível **sub-talhão** para soja, trigo e colza na Argentina, Uruguai e Alemanha com LSTM e métodos de atribuição. O resumo **não** nomeia SHAP, não especifica sensor nem resolução, e não traz métricas.
- `[LACUNA]` **Não foi encontrado, na base revisada, nenhum artigo revisado por pares que aplique SHAP espacialmente (mapa de SHAP por pixel) a soja no Brasil.** Simultaneamente a lacuna acadêmica mais relevante e o espaço de diferenciação do produto: nenhuma solução comercial **privada** entre as 32 revisadas menciona SHAP/XAI `[F-comercial-05]`, `[F-comercial-13]` — a ressalva é do `../benchmarks/commercial.md`, item 5 das lacunas de mercado.
- `[EVIDÊNCIA]` SHAP interação tem valor agronômico direto: `[D-12]` mostra, via SHAP, interação explícita clima × relevo × solo em soja (teor de água residual e declividade modulam o efeito da chuva de junho), e `[D-05]` registra que áreas côncavas correlacionam negativamente com a chuva de maio e positivamente com a de agosto/setembro. **Um modelo aditivo sem interação não representa isso.**

## `[DECISÃO]` D8

1. **TreeSHAP é o método primário** `[G-07]`, viabilizado pela escolha de família de árvores em D1. `novo_barato` (`shap`, MIT, CPU-only). **Permutation importance** entra como verificação cruzada barata `[G-12]`.
2. **ALE é o padrão para efeito marginal; PDP só para features comprovadamente pouco correlacionadas** `[G-08]`.
3. **Mapas SHAP são gerados EXCLUSIVAMENTE a partir do modelo avaliado por GroupKFold/LOFO**, nunca do modelo de split aleatório — pitfall 4 de `[G-09]`. Um modelo com R² inflado produz um mapa SHAP que explica **o vazamento**, não a agronomia.
4. **SHAP é reportado agregado sobre os *folds* da CV por grupo, com a dispersão entre *folds* visível.** Se o ranking muda de *fold* para *fold*, isso é informação a exibir, não a esconder `[G-12]`.
5. **Regras de comunicação na interface** (derivadas de `[G-09]` e `[G-12]`):
   - **Verbo associativo, nunca causal.** "Nesta zona, o modelo associa a menor produtividade prevista a NDRE baixo e declividade alta" — não "a declividade está reduzindo a produtividade".
   - **Unidade e linha de base explícitas.** A contribuição é relativa à predição média do modelo; exibir "média prevista do talhão: 58,0 sc/ha" junto das contribuições.
   - **No máximo 5 fatores**, agrupando espectrais correlacionados num único item ("vigor da vegetação") em vez de listar NDVI, EVI2 e GNDVI separadamente — mitigação direta do pitfall de dependência entre features `[G-09]`, `[G-08]`.
   - **Marcar instabilidade:** fator cujo sinal muda entre *folds* recebe marcação visual de baixa confiança `[G-12]`.
   - **Não exibir SHAP para células fora da AOA** (D5).
6. **Texto de ressalva fixo, exibido junto de todo mapa de atribuição** (a seção 37 exige a ressalva; este é o texto proposto):

   > **Como ler este mapa.** Os valores abaixo mostram **como o modelo chegou à previsão**, não uma relação de causa e efeito comprovada no campo. Eles indicam associações aprendidas a partir dos talhões usados no treinamento. Variáveis parecidas entre si (índices de vegetação, por exemplo) podem ter sua importância distribuída de forma arbitrária entre elas. Este mapa **não é uma recomendação de manejo ou de adubação**: use-o como ponto de partida para investigação agronômica a campo.

7. **`[DECISÃO]` SHAP por pixel é job assíncrono, nunca síncrono na requisição.** Calcular SHAP em dezenas de milhares de linhas é polinomial com TreeSHAP `[G-07]` e viável em CPU, mas não cabe no caminho de uma requisição do Render com 2 workers.
8. **`[DECISÃO]` Nenhuma recomendação de manejo ou de adubação é derivada de SHAP no MVP.** "K baixo −1,8 sc/ha" significa *o modelo prevê menos onde o K é baixo*, não *aplicar K vai render +1,8 sc/ha*. A segunda leitura é comercialmente atraente e tecnicamente indefensável.

## Justificativa

A explicabilidade é o diferencial declarado do produto e a lacuna unânime da literatura brasileira revisada (nenhum dos estudos brasileiros da base reporta explicabilidade formal para soja) e do mercado (nenhuma solução **privada** entre as 32 revisadas menciona SHAP/XAI; o JRC MARS/WOFOST, por ser modelo de processo, é estruturalmente explicável). Ao mesmo tempo, é a área com maior risco de dano: um agrônomo que lê SHAP como causalidade toma decisão de adubação com base numa associação aprendida. Por isso a decisão é tão detalhada na **comunicação** quanto na **técnica**.

## Consequências

- O mapa SHAP por pixel é o entregável mais pesado do pipeline em CPU e determina a arquitetura de inferência (batch, pré-computado) descrita em `../product/recomendacoes-arquitetura.md`.
- Se D2 terminar com poucas features, a explicação fica curta — o que é bom para honestidade e ruim para percepção de valor. Vender "5 fatores" quando o modelo tem 6 features é um risco de produto a antecipar.

**Nível de confiança: ALTO.** As escolhas técnicas (TreeSHAP, ALE, SHAP só do modelo validado, agregação sobre *folds*) têm suporte direto e convergente em `[G-07]`, `[G-08]`, `[G-09]`, `[G-12]`, e as regras de comunicação decorrem delas sem extrapolação.

---

# D9 — Global vs. regional vs. por talhão vs. híbrido, e cold start

## Contexto

A seção 38 pede avaliar modelo global, modelo regional e, depois, híbrido (global + calibração local). A seção 39 pergunta o que acontece com uma fazenda nova sem histórico. A base contém um par de resultados que parece paradoxal.

## Alternativas

G1 modelo global único · G2 modelo regional/por ambiente · G3 modelo por talhão · G4 **híbrido: global + correção local** · G5 modelo por fazenda.

## Evidências

**O par que parece paradoxal e não é.**
1. `[RESULTADO ESPECÍFICO]` Um modelo ajustado **ao próprio talhão** descreve melhor a variabilidade interna daquele talhão: em soja no Paraná, R² decrescente de **field → farm → global** — SVR field-based R² 0,07–0,79 e RMSE 7,24–37,32 kg/ha; farm-based R² 0,60–0,70; global-based R² 0,75 e RMSE 38,82 kg/ha, com validação externa 75/25 confirmando R² 0,75 / RMSE 39,92 kg/ha `[B-12]`. **Ressalva decisiva: a comparação é feita SEM leave-one-field-out formal** — o modelo field-based é treinado e avaliado no mesmo talhão, o que não responde "como ele vai num talhão novo".
2. `[RESULTADO ESPECÍFICO]` Modelos ajustados a poucos talhões **não transferem**: sob LOFO-CV real em soja, R² de 0,54 a −6,23, com os autores concluindo que 2–3 safras são insuficientes `[C-11]`.

Ou seja: o ganho do modelo por talhão de `[B-12]` **não** se traduz em capacidade de prever um talhão nunca visto. São dois produtos diferentes — *descrever* a variabilidade de um talhão com histórico, e *prever* um talhão sem histórico.

**A degradação entre domínios é geral.** `[B-15]` R² 0,72 → 0,34–0,76 entre estados independentes (soja, Brasil, **escala municipal**); `[D-12]` 0,87–0,90 → 0,77–0,79 sob validação *group-wise* por estado; `[B-04]` RF "performed poorly when tested on years and locations not represented in the training data". `[E-brasil-04]` mostra o mesmo no eixo temporal: R² 0,748 → 0,693 e RMSE 414 → 585 kg/ha ao trocar split aleatório por safra nova *held-out*.

**Os mecanismos de correção local — e quais deles sobrevivem ao caso de uso.**
- **Ponderação geográfica** do próprio modelo (GWRFR): R² 0,90 e menor Moran's I residual em milho county-level `[C-13]`; GWR com resíduos menores e menos dependentes espacialmente que PCR em trigo `[H-01, só abstract]`. **Não exige o alvo do talhão previsto** — usa apenas a posição e as covariáveis, disponíveis antes da colheita. **`novo_barato`, mas sem nenhum teste intra-talhão na base.**
- **Features de vizinhança agronomicamente interpretáveis** (distância à borda, TWI, curvatura, elevação relativa) — disponíveis pré-colheita e admissíveis por D2, item 6. **`[HIPÓTESE]` deste projeto:** `[C-01]` sustenta apenas que um modelo só-posição empata com o completo (o modelo aprende posição); **nenhum estudo da base mede se posição relativa transfere para um talhão não visto `[LACUNA]`**, e essas features são superfícies suaves dentro do talhão — a classe que `../literature-review/riscos-metodologicos.md` §6 chama de combustível para a memorização de vizinhança de `[C-01]`.
- **Krigagem dos resíduos** do modelo global: reduziu RMSE em 35–45% e corrigiu mapas espacialmente irreais `[H-04]`. **`reusa`** — `pykrige` já em produção. **Mas não é aplicável à previsão pré-colheita**, e a ressalva que importa não é a de cultura/país: em `[H-04]` o agregado (a estatística de vilarejo) é **observado no momento da predição**, e a validação é *"agregação pixel→vilarejo/bloco comparada às estatísticas oficiais reportadas"*. Ou seja, o estudo **desagrega um valor conhecido**; não prevê um valor desconhecido. Regression-kriging exige resíduos **observados na vizinhança do ponto previsto e na mesma safra** — que, num talhão-safra pré-colheita, não existem. Sob a validação oficial de D5, krigar o resíduo do talhão retido significaria conhecer a colheita dele: **vazamento pelo alvo**.

**Cold start.**
- `[RESULTADO ESPECÍFICO]` Métodos híbridos que **não exigem calibração com dado de campo** são a resposta mais direta da base — o SCYM capturou em média 35% da variação em milho (faixa 14–58%) e 32% em soja `[H-09, só abstract]` (**fração de variância capturada, não R² clássico**), e `[B-04]` mostra o RF só empatando com ≥1.000 observações reais. **Custo: exige crop model → `infra_nova`, excluído por D1.**
- `[EVIDÊNCIA LIMITADA]` A resposta viável é o **filtro de aplicabilidade**: dentro da AOA, "prediction error is comparable to the cross-validation error"; fora dela, o erro de CV não se aplica `[C-04]`, e mapas devem ser publicados com as áreas fora do domínio destacadas `[C-05]`. `novo_barato`. É a recomendação mais segura: **prever com faixa larga ou não prever, em vez de prever mal.**
- `[RESULTADO ESPECÍFICO — boa notícia parcial para soja]` Para **soja especificamente**, o histórico do próprio talhão é preditor **pior** do padrão espacial que o NDVI pós-fato — ao contrário de milho, trigo e algodão `[D-04]`. Isso **atenua** o cold start em soja: a plataforma já tem a série espectral por talhão mesmo sem histórico de colheita.
- `[RESULTADO ESPECÍFICO]` O ganho de confiabilidade da classificação de zonas com anos adicionais de histórico é "modesto" (sem limiar numérico), em 768 campos e 5.520 mapas `[D-10, só abstract]` — um único estudo, nas condições dele. Não é preciso esperar 5+ safras — mas isso também significa que **o histórico não vai resolver o cold start**.
- `[RESULTADO ESPECÍFICO]` Onde está o vazamento do histórico: (i) usar a safra corrente como histórico; (ii) agrupar a CV por talhão-safra em vez de talhão; (iii) avaliar com LOFO um modelo que depende de histórico — um talhão novo **não tem** histórico, então a métrica mede outra coisa.

## `[DECISÃO]` D9

1. **A arquitetura do MVP é G4 — global + correção local, com a correção local restrita ao que está legitimamente disponível ANTES da colheita**: um modelo treinado sobre **todos** os talhões-safra disponíveis, sobre features que existem na data da previsão. A correção local admissível no MVP é (i) **features de vizinhança agronomicamente interpretáveis** (distância à borda, TWI, curvatura, elevação relativa) — **`[HIPÓTESE]` deste projeto, não resultado de `[C-01]`**: `[C-01]` sustenta a metade negativa (o modelo alimentado só com coordenadas empata com o completo, logo aprendeu posição), mas nenhum estudo da base mede se posição relativa transfere para um talhão não visto `[LACUNA]`; a hipótese é testada pelo item **B7** do checklist, sob LOFO, contra o mesmo modelo sem essas features — e (ii) **GWRFR / ponderação geográfica** `[C-13]`, `[H-01, só abstract]`, como braço experimental de segunda prioridade. **Regression-kriging do resíduo da safra prevista NÃO faz parte da arquitetura do MVP** — ver item 2-bis. `reusa` no que depende de `pykrige` (variograma, bootstrap por bloco); `novo_barato` no GWRFR.
2. **As três estratégias (global / por fazenda / por talhão) são comparadas no MESMO protocolo, sob LOFO-CV e leave-one-year-out** — exatamente a combinação que **nenhum estudo da base executou para soja intra-talhão** `[LACUNA]`. É replicar `[B-12]` (que achou field > farm > global) sob o esquema de `[C-11]` (que achou R² negativo em LOFO). Esta é a contribuição original mais direta do MVP.

2-bis. **`[HIPÓTESE]` Regression-kriging dos resíduos, reposicionado em dois usos de escopo restrito.** Cada um com seu protocolo e sua ressalva; nenhum dos dois entra na validação oficial de D5 nem no caminho de previsão pré-colheita do modelo cold-start:

| Uso | O que é | Protocolo | Ressalva que precisa viajar junto |
|---|---|---|---|
| **(a) Pós-colheita / diagnóstico** | análise espacial do erro e **completar o mapa de um talhão parcialmente colhido** (interpolar a parte não colhida a partir do resíduo observado na parte já colhida) | rodar **depois** da colheita, sobre resíduos observados; alimenta D10(c) (Moran's I, clusters de erro) e a camada `erro` da interface | é **interpolação de valor observado**, exatamente como `[H-04]`; não é previsão e **não pode** ser reportada como desempenho preditivo |
| **(b) "Resíduo persistente"** | krigar os resíduos de **safras anteriores** do mesmo talhão e usá-los como **feature/offset defasado** do modelo global | só para talhões com ≥2 safras; feature marcada `derivada_do_alvo=true` no *lineage*; avaliada **sob leave-one-year-out**, nunca sob LOFO; comparada contra o mesmo modelo sem o offset. **Exigência que fecha a segunda rota de vazamento:** o resíduo de cada safra anterior tem de ser **out-of-fold** — calculado por um modelo ajustado **sem** a safra retida e **recalculado dentro de cada fold externo**. A regra "só safras estritamente anteriores" restringe a data da observação, não a procedência do modelo que gerou o resíduo; sem essa exigência, um resíduo de `t−1` produzido pelo modelo global treinado em todas as safras carrega informação da safra `t` de teste. Ver item **D5** do checklist (`../literature-review/riscos-metodologicos.md` §11) | é uma **hipótese de estabilidade temporal do padrão intra-talhão**, não um resultado. A base dá apoio parcial e ambíguo: `[D-04]` mostra que, **para soja**, o histórico do próprio talhão é preditor *pior* do padrão espacial que o NDVI pós-fato; `[D-05]` mostra drivers de padrão (concavidade × chuva) que mudam de sinal entre fases; `[D-10, só abstract]` descreve o ganho de safras adicionais como "modesto". **Inexistente no cold start**: um talhão novo não tem resíduo de safra anterior |
3. **Dois modelos declarados e avaliados separadamente, nunca misturados:**
   - **Modelo cold-start** — sem nenhuma feature de histórico, avaliado por LOFO. É o que atende um talhão novo, e é o **modelo padrão do produto**.
   - **Modelo com histórico** — avaliado por LOYO dentro dos talhões com ≥2 safras. Nunca reportar sua métrica como se fosse a do primeiro.
   Feature de histórico sempre **defasada**: só safras estritamente anteriores a `data_previsao`.
4. **Modelo regional (G2) não entra no MVP** por falta de n: com 20–100 talhões-safra, particionar por região deixa cada partição sem poder estatístico. Reentra quando houver ≥3 regiões com ≥20 talhões-safra cada. **`[HIPÓTESE]`: "≥3 regiões com ≥20 talhões-safra" é gatilho escolhido por este projeto; nenhum estudo da base fixa n mínimo por partição regional `[LACUNA]`.**
5. **Cold start no MVP = AOA/DI como *gate*** `[C-04]`, `[C-05]`. Um talhão novo cujo DI esteja acima do limiar derivado do treino **não recebe número pontual**: recebe faixa qualitativa (D7) ou o estado "fora do domínio". Predições em talhões com densidade amostral de solo muito abaixo da mediana do treino também caem fora da AOA.
6. **`[DECISÃO]` Zonas de manejo (MEAP) derivadas de colheita ficam FORA das features do modelo cold-start**; só a versão derivada de solo/CEa/relevo (sem colheita) é admissível. Toda feature carrega um booleano `derivada_do_alvo` no *lineage*.
7. **`[DECISÃO]` Target encoding de categóricas de alta cardinalidade (cultivar, unidade de solo, zona) é calculado DENTRO do fold de treino**, ou substituído pela codificação nativa de categóricas do LightGBM, que não usa a média do alvo global. `[D-07]` mostra que "soil map unit" é exatamente o tipo de categórica que se vai querer codificar — e portanto o ponto onde o encoding vai vazar.

## Justificativa

A leitura conjunta de `[B-12]` e `[C-11]` é o achado mais importante desta seção: a literatura mostra o modelo por talhão ganhando **quando a pergunta é descrever**, e mostra modelos com poucos talhões falhando **quando a pergunta é prever um talhão novo**. Como o produto declarado (seção 61) é **prever**, a arquitetura tem de ser global — e, pela mesma razão, a correção local só pode usar informação que existe **antes** da colheita. É isso que separa o item 1 do item 2-bis: GWRFR e features de vizinhança usam posição e covariáveis, que existem na data da previsão; o resíduo krigado de `[H-04]` usa o alvo agregado **observado**, que não existe. A decisão fica assim coerente com D9.3: o **modelo cold-start é o padrão do produto**, e nada que dependa de histórico de colheita pode ser parte do caminho padrão.

## Consequências

- O MVP entrega **um** modelo global por janela de antecedência (D6), não um modelo por talhão. Isso simplifica versionamento, monitoramento e cache.
- O *gate* de AOA implica que **alguns talhões não recebem previsão**. Isso precisa ser decisão de produto acordada antes, não surpresa na entrega.
- A comparação das três estratégias sob LOFO+LOYO é o núcleo publicável do trabalho de MBA.
- **O job de inferência em lote não contém passo de krigagem de resíduo.** `../product/recomendacoes-arquitetura.md` §1 (caixa K) e §2.2 foram ajustados em conformidade: a krigagem que permanece no job noturno é a de (a) — pós-colheita, para a camada `erro` e para completar talhão parcialmente colhido.

**Nível de confiança: MÉDIO** para a arquitetura global + correção local. A parte **ALTA** é negativa e é a que mudou nesta revisão: está estabelecido que a correção local **não pode** depender do alvo observado da safra prevista — isso decorre da definição de resíduo e do checklist anti-vazamento, não de um estudo. A parte **BAIXA-MÉDIA** é qual correção local sobra: GWRFR `[C-13, só abstract]` não tem nenhum teste intra-talhão na base, e o offset de resíduo persistente (item 2-bis (b)) é `[HIPÓTESE]` contrariada em parte por `[D-04]` para soja. É possível que o MVP termine com um modelo global **sem** correção local — e isso é resultado legítimo.

---

# D10 — Métricas, critérios de sucesso e *kill criteria*

## Contexto

A seção 33 lista as métricas a calcular. A seção 60 define sucesso acadêmico **sem** exigir o menor RMSE da literatura. Falta o outro lado, que este ADR precisa fixar **antes** de qualquer experimento: **o que faria o projeto concluir, honestamente, que a previsão intra-talhão NÃO é viável com os dados atuais.** Concluir isso é resultado acadêmico válido (seção 60), e escrever os critérios depois de ver os números não é.

## Evidências

- `[EVIDÊNCIA LIMITADA]` **Não há limiar universal de erro "operacionalmente útil" na base revisada.** O único número de referência é o RRMSE de 6–7% de `[A-03]` — milho, US Corn Belt, **escala de condado**, sob **CV 10-fold aleatória + teste em anos retidos (2012, 2017, 2018)**, com a ressalva do clima real do ano-teste. Não serve de benchmark para grid de 20 m em soja no Brasil.
- Os números absolutos mais próximos do regime-alvo, **todos com ressalva de escala e validação**: `[C-11]` RMSE 554–765 kg/ha (soja, intra-talhão, LOFO-CV, EUA); `[D-12]` RMSE 460 kg/ha em teste interno para soja em grid de 30 m nos EUA, com faixa de 180 a 860 kg/ha entre anos; `[B-15]` RMSE 301,5 kg/ha (treino/teste) e 168,3–491,2 kg/ha (estados independentes), soja, Brasil, **escala municipal, não é pixel**; `[B-12]` RMSE 38,82 kg/ha global-based (soja, Paraná, grade 20 m) — **com a ressalva de unidade registrada em D1**.
- `[EVIDÊNCIA]` O modelo nulo é o controle certo: `[C-01]` usa exatamente a média do treino para mostrar que a CV espacial chegou ao nível do nulo (RMSPE 77,5 vs. 82 Mg/ha); e em `[A-06]` a média por semente (baseline) teve RMSE 570,57 kg/ha e R² 0,010 — o piso que qualquer modelo precisa superar.
- `[EVIDÊNCIA]` Concluir pelo negativo tem precedente e é publicável: `[C-11]` publicou R² fortemente negativos em LOFO; `[C-07]` mostra que, corrigido o vazamento em um caso de reprodutibilidade, "modelos complexos de ML não têm desempenho substantivamente melhor que modelos de regressão logística de décadas atrás"; `[B-07]`, `[G-14]` e `[E-brasil-05]` são resultados negativos publicados.
- `[EVIDÊNCIA]` O teto de acurácia é o erro do alvo: 10–50% das observações de um mapa de colheita contêm erros significativos `[H-12]`; ~30% removido em 595 datasets `[H-13]`; quatro categorias de erro de medição `[H-14]`.

## `[DECISÃO]` D10

**(a) Métricas a calcular** (seção 33), todas reportadas com **unidade + escala + esquema de validação na mesma linha**:

| Métrica | Papel |
|---|---|
| **RMSE (kg/ha)** | **Oficial** (D5) — mediana entre talhões + faixa |
| MAE (kg/ha) | secundária, menos sensível a caudas |
| bias (kg/ha) | **erro de nível** (D4) |
| Spearman intra-talhão | **erro de padrão** (D4) — é o que responde "onde produz mais e menos" |
| R² por talhão | secundária, sempre acompanhada de RMSE `[C-11]` |
| nRMSE / MAPE | só quando a média do talhão for bem definida; MAPE instável perto de zero |
| erro por faixa de produtividade | seção 33 — cauda alta e baixa separadas |
| PICP / PINAW / cobertura condicional | D7 |
| Moran's I dos resíduos, por talhão e por *fold* | D10(c) |
| Comparação com modelo nulo | obrigatória em toda tabela `[C-01]` |

**(b) `[DECISÃO]` Não adotar limiar de RMSE de outro estudo como meta.** Não existe na base `[LACUNA]`, e a seção 60 já define sucesso por metodologia. O critério operacional de utilidade é **relativo e definido com a área agronômica da Invicta**: o erro é útil se a **ordenação das zonas dentro do talhão for estável** e se o intervalo de talhão for estreito o bastante para a decisão comercial pretendida, com cobertura empírica verificada.

**(c) Análise espacial do erro** (seção 34), obrigatória: mapas `yield_predicted`, `yield_observed` e `yield_error = predicted − observed`; Moran's I global dos resíduos por talhão em cada *fold*; clusters de super e subestimação por Moran local, cruzados com as camadas existentes (zonas MEAP, CEa, TWI, bordas do talhão). `[D-04]`/`[D-05]` dão a hipótese agronômica a testar primeiro: zonas **instáveis** concentram-se em áreas côncavas de TWI alto — se os clusters de erro coincidirem com elas, o problema é de feature de interação, não de algoritmo. **Ressalva de `[C-01]`:** ausência de autocorrelação residual numa CV aleatória **não** prova ausência de vazamento; Moran's I é diagnóstico complementar, não substituto da validação por grupo. Se houver resíduo estruturado, as duas rotas com suporte na base são: (i) **modelo geograficamente ponderado** `[C-13]`, `[H-01]` (`novo_barato`) — a única que serve para **prever** um talhão novo, porque não usa o alvo; e (ii) **krigar os resíduos** `[H-04]` (`reusa`) — que aqui é **uso pós-colheita (D9, item 2-bis(a))**: descreve e mapeia o erro já observado, alimenta a camada `erro` da interface e completa o mapa de um talhão parcialmente colhido, mas **não pode ser reportada como desempenho preditivo** nem entrar no caminho de inferência pré-colheita. Ressalva de `[C-10]` de que, com poucos pontos, a geoestatística pura pode ser melhor e **não deve ser descartada como baseline**.

**(d) Critérios de sucesso do MVP** (seção 60 operacionalizada):

| # | Critério | Como se mede |
|---|---|---|
| S1 | Metodologia robusta e sem vazamento | Suíte anti-vazamento (A1–F4 de `../literature-review/riscos-metodologicos.md` §11) passando integralmente, como teste bloqueante |
| S2 | Validação realista | Métrica oficial de D5 reportada; *gap* random−LOFO medido e não nulo |
| S3 | Comparação justa | Todos os candidatos de D1 no mesmo dataset, mesmas *folds*, mesma semente, com distribuição reportada |
| S4 | Integração de múltiplas fontes | Ablação da seção 31 executada e reportada, **inclusive quando o resultado for "o grupo não ajuda"** |
| S5 | Interpretabilidade | Mapas SHAP do modelo validado por grupo, com dispersão entre *folds* e ressalva de não-causalidade |
| S6 | Aplicabilidade real | Pelo menos uma janela de antecedência (D6) superando o modelo nulo, com AOA definida |
| S7 | Utilidade agronômica | Spearman intra-talhão estável o bastante para a ordenação de zonas, com limiar acordado com a agronomia **antes** do experimento |

**(e) `[DECISÃO]` *Kill criteria* — o que faria o projeto concluir que a previsão intra-talhão NÃO é viável com os dados atuais.** Todos avaliados sob a **validação oficial de D5**, com o melhor candidato de D1 após a ablação de D2, e **pré-registrados antes de rodar o experimento**:

| # | Critério de parada | Limiar proposto | Leitura |
|---|---|---|---|
| **K1** | **Não bate o nulo** | o modelo não supera o Baseline 0 (média histórica do talhão) em RMSE mediano, **e** mais de 50% dos talhões ficam piores que o modelo nulo | O sinal não transfere entre talhões no regime atual. É o resultado que `[C-11]` obteve em 3 de 6 talhões-safra e `[C-01]` em CV espacial |
| **K2** | **Padrão intra-talhão não ordena** | Spearman mediano entre predito e observado **dentro** do talhão abaixo do limiar acordado com a agronomia, e sem estabilidade entre *folds* | O produto não responde "onde dentro do talhão produz mais e menos" (seção 61) — o núcleo da proposta de valor |
| **K3** | **Incerteza não calibra** | PICP fora da tolerância de D7 **e** irreparável por recalibração ao nível do talhão | O produto não pode publicar intervalo; sobra a faixa qualitativa `[F-comercial-31]`, que é um produto menor |
| **K4** | **O teto é o dado, não o modelo** | o erro estimado do alvo (D4, item 8) é da mesma ordem do RMSE total do modelo | Não é problema de modelagem: é problema de qualidade do mapa de colheita. A ação correta passa a ser `colheita.py`, não ML |
| **K5** | **A inflação explica tudo** | o *gap* `RMSE_LOFO − RMSE_random` é muito grande **e** o LOFO fica no nível do nulo | Todo o desempenho aparente vinha de vazamento espacial — o cenário de `[C-01]` |
| **K6** | **Nenhuma janela é útil** | nenhuma janela de antecedência (D6) supera o nulo antes de R5/R6 | A previsão só existe quando já não tem valor de decisão; o produto vira "estimativa de colheita", não "previsão" |

**Se K1, K2 ou K5 disparar, a conclusão a registrar é: "com 20–100 talhões-safra de soja, o sinal espectral+ambiental disponível não sustenta previsão intra-talhão generalizável a talhões não vistos".** Isso é **resultado acadêmico válido** (seção 60) e precisa ser publicado como tal — não escondido atrás de um número de split aleatório. Nesse caso, as rotas de continuação a avaliar, em ordem, são: (i) aumentar a base de talhões-safra via importação de mapas de colheita (padrão ISOXML/API `[F-comercial-02]`); (ii) reposicionar o produto de *previsão* para *descrição* de variabilidade intra-talhão com histórico, onde `[B-12]` mostra evidência favorável; (iii) atacar a qualidade do alvo (K4).

## Justificativa

Um ADR que só define sucesso é um ADR que não pode falhar — e portanto não decide nada. Os *kill criteria* existem para que a conclusão negativa seja **uma saída planejada e publicável**, não uma derrota a maquiar. A ancoragem é direta: `[C-11]` é um estudo publicado, revisado por pares, cujo resultado central é que o modelo não transferiu; `[C-07]` documenta o que acontece com uma literatura inteira quando o resultado negativo é evitado.

## Consequências

- Os limiares de K2 e S7 dependem da agronomia da Invicta e **precisam ser fixados antes** do primeiro experimento. Este ADR deixa o campo aberto de propósito; fechá-lo é tarefa da Etapa 3 do roadmap.
- O relatório de validação passa a ser um artefato de primeira classe, com formato fixo, e não um apêndice.

**Nível de confiança: MÉDIO.** Alta para a estrutura (existirem *kill criteria* pré-registrados, e quais fenômenos eles capturam). **Baixa para os limiares numéricos** — a base não oferece nenhum `[LACUNA]`, e "mais de 50% dos talhões piores que o nulo" é `[HIPÓTESE]` deste projeto, ancorada apenas no fato de que `[C-11]` teve exatamente 3 de 6. É uma das três decisões menos confiantes deste ADR.

---

# Decisões adiadas

Registradas aqui para não voltarem como improviso. Cada uma tem um gatilho.

| # | Decisão adiada | Por que agora não | Gatilho para retomar |
|---|---|---|---|
| A1 | **Ingestão de Sentinel-1 (SAR)** para atravessar nuvem | `novo_barato` em dado, `infra_nova` em pipeline (backscatter/speckle); `[B-13]` mostra ganho (R² 0,41–0,89) mas fora do Brasil tropical e com validação não detalhada; `[LACUNA]` nenhum estudo testa fusão SAR-óptico na safra de verão brasileira | Quando a análise de gaps mostrar que a cobertura de nuvem inviabiliza janelas de D6 em > 30% dos talhões — **`[HIPÓTESE]`**: o corte de 30% é deste projeto; `[B-12]` registra 40–70% de nuvem no Paraná, mas não propõe limiar de decisão |
| A2 | **HLS (Landsat+Sentinel harmonizado)** `[FD-04]` como preenchimento de gap | Mesma infraestrutura STAC já existente, custo baixo — mas é 30 m, e D3 fixou 20 m | Junto com A1, no mesmo diagnóstico de gaps |
| A3 | **kNNDM** como esquema de CV `[C-09]` | Refinamento sobre GroupKFold/LOFO já estabelecidos; exige conhecer a área de predição antes de treinar | Fase 3, após o primeiro ciclo completo de validação |
| A4 | **Crop model acoplado** `[A-03]`, `[B-11, só abstract]` | `infra_nova`; ganho de 7–20% medido com clima real do ano-teste | Rota R4 de D1 |
| A5 | **Deep Learning** | Nenhuma das condições (a)/(b)/(c) atendida | Rotas R1/R2/R3 de D1 |
| A6 | **Modelo regional** (seção 38) | Sem n para particionar | ≥3 regiões com ≥20 talhões-safra cada — **`[HIPÓTESE]`**, limiar deste projeto, sem âncora na base `[LACUNA]` |
| A7 | **Feature store formal** (seção 43) | A tabela de features em Parquet já cumpre o papel no MVP | Quando ≥2 produtos (produtividade + zonas, ou + risco) consumirem as mesmas features em produção |
| A8 | **PostGIS** | Toda geometria é resolvida em `shapely` e os grids são blobs | Quando houver consulta espacial **entre** talhões no caminho da requisição |
| A9 | **PlanetScope 3 m** `[FD-08]` | Licença comercial paga por área; e `[B-05]`/`[B-08]` mostram que mais fino ≠ melhor | Se o experimento de resolução de D3 mostrar ganho monotônico até 10 m **e** houver orçamento |
| A10 | **Limiares de K2/S7** (Spearman mínimo) | Dependem da agronomia | Etapa 3 do roadmap, antes do primeiro experimento |
| A11 | **Risco fitossanitário como fator** `[F-comercial-05]` | Fora do escopo do MVP; `[E-brasil-01]` mostra que doença não modelada gerou erro de +10,8% em modelo agrometeorológico | Fase 2, se os clusters de erro de D10(c) não se explicarem por solo/relevo/clima |

## ADRs a abrir na Fase 2

As decisões acima são de **modelagem**. Há um segundo conjunto, de **engenharia**, que está descrito em [`../product/recomendacoes-arquitetura.md`](../product/recomendacoes-arquitetura.md) mas **ainda não tem ADR** — e por isso aparece lá rotulado `[RECOMENDAÇÃO — a formalizar em ADR]`, nunca `[DECISÃO]`. A tabela completa, com escopo e gatilho de cada um, está em `recomendacoes-arquitetura.md` §17. Em resumo:

| ADR a abrir | Escopo | Corresponde a (seção 46) |
|---|---|---|
| `ADR-002-satellite-source` | fontes de imagem e de clima a ingerir; fallback de DEM | `ADR-002-satellite-source` |
| `ADR-003-feature-store` | armazenamento de features e de camadas; PostGIS; feature store (adiadas A7, A8) | `ADR-005-feature-store`, renumerado |
| `ADR-004-build-dependencies` | separação de `requirements`; regras de mudança do build pinado | — |
| `ADR-005-data-lineage` | identificadores obrigatórios e *lineage* por feature | — |
| `ADR-006-model-registry` | versionamento, monitoramento, *drift*, gatilho de re-treino | — |
| `ADR-007-inference-job` | onde treinar vs. inferir; desenho do job em lote | — |
| `ADR-008-api-contract` | contrato das rotas `/yield/*` | — |
| `ADR-009-uncertainty-ui` | comunicação de incerteza e de atribuição na interface | — |

Os três temas restantes da seção 46 — `grid-resolution`, `validation-method` e `model-family` — **já estão decididos neste documento** (D3, D5 e D1, respectivamente) e não ganham arquivo próprio. A numeração literal da seção 46 não pôde ser honrada porque a seção 56 fixou `ADR-001-model-strategy` como o ADR desta fase.

---

# O que invalidaria este ADR

Gatilhos explícitos de revisão. Qualquer um deles obriga a reabrir o documento, não a contorná-lo.

1. **O regime de dados mudar de ordem de grandeza.** Se o inventário da Etapa 3 revelar, por exemplo, 500+ talhões-safra (ou < 15) — `[HIPÓTESE]`: ambos os cortes são escolha deste projeto, a base não fixa nenhum deles `[LACUNA]` —, D1, D5, D7 e D9 mudam juntos: a rota R1 se abre, a calibração por talhão de D7 deixa de ser o gargalo, e o modelo regional de A6 passa a ser viável.
2. **O número de safras chegar a ≥4** (`[HIPÓTESE]` deste projeto, por analogia com `[C-11]`; ver D5)**.** LOYO deixa de ser diagnóstico qualitativo e passa a ser métrica (D5); o modelo com histórico de D9 ganha poder de teste.
3. **A ablação de D2 contrariar `[C-11]` com margem**, isto é, solo/CEa/relevo melhorarem claramente sob a validação oficial. Isso não invalida o protocolo, mas muda a expectativa central de D2 e o desenho de features do produto.
4. **O erro do alvo (D4, item 8) se revelar da ordem do RMSE do modelo.** Dispara K4: o projeto deixa de ser de modelagem e passa a ser de qualidade de dado, e `colheita.py` vira a frente principal.
5. **A cobertura empírica (PICP) não calibrar nem no nível do talhão.** D7 cai para faixas qualitativas e o produto muda de proposta de valor — e o gate de D7(7) passa a ser a regra permanente, não o fallback.
6. **Surgir, na literatura, um estudo revisado por pares com o desenho exato que falta** — soja, Brasil, grid de 10–30 m, LOFO **e** LOYO combinados. Hoje isso é `[LACUNA]` e é o que dá originalidade ao trabalho; se aparecer, D1/D2/D5 precisam ser confrontados com ele antes de qualquer experimento.
7. **A plataforma adquirir GPU ou imagem sub-métrica regular por talhão.** Reabre D1 pelas rotas R2/R3.
8. **Mudança no pipeline de `colheita.py`** (filtros, ajuste à média, IDW) sem reprocessar as duas versões do alvo. D4 depende de o pipeline produzir `yield_sem_ajuste` e `yield_ajustado` de forma versionada; alterar o pipeline sem versionar invalida toda comparação anterior.
9. **Qualquer item da suíte anti-vazamento falhar em produção depois de ter passado.** Um teste A1–F4 que quebra significa que o dataset mudou de forma não declarada; as métricas publicadas até ali deixam de valer.
10. **O produto deixar de ser previsão pré-colheita.** D9 depende inteiramente de o alvo ser desconhecido na hora da predição. Se o caso de uso mudar para *desagregação de um agregado observado* (por exemplo, distribuir espacialmente a pesagem de balança de um talhão já colhido, ou estimar a parte não colhida a partir da parte colhida), o regime passa a ser o de `[H-04]` e o regression-kriging do resíduo deixa de ser vazamento e volta a ser a técnica indicada. Isso é **outro produto**, e exige reabrir D1, D5 e D9.
11. **O experimento (b) de D9 (resíduo persistente sob leave-one-year-out) mostrar ganho consistente.** Nesse caso a hipótese de estabilidade temporal ganha suporte próprio, e o "modelo com histórico" de D9.3 deixa de ser secundário — mas o modelo cold-start continua sendo o padrão para talhão novo.

---

## Referências citadas neste ADR

`paper_id` da base verificada (`../literature-review/papers-database.csv`), com a extensão da leitura registrada: `completo` = texto integral · `abstract` = só o resumo · `metadados` = nem o resumo (não sustenta afirmação além de "existe").

| id | Referência curta | Leitura |
|---|---|---|
| A-02 | Grinsztajn, Oyallon & Varoquaux 2022 — árvores vs. DL em tabular | abstract |
| A-03 | Shahhosseini et al. 2021 — APSIM + ML, milho, US Corn Belt | completo |
| A-04 | Khaki & Wang 2019 — DNN, milho, EUA | completo |
| A-06 | Bi et al. 2023 — Transformer, soja, Canadá | completo |
| A-07 | Fan et al. 2022 — GNN-RNN | abstract |
| A-09 | Farmonov et al. 2024 — ML vs. DL, soja county-level | abstract |
| A-10 | Sun et al. 2019 — CNN-LSTM, soja county-level | completo |
| A-11 | Zinzinhedo et al. 2026 — sensibilidade a estrutura/qualidade de dados | completo |
| B-01 | Kayad et al. 2019 — milho intra-talhão, Sentinel-2 | abstract |
| B-03 | Schwalbert et al. 2020 — LSTM, soja, sul do Brasil, municipal | abstract |
| B-04 | Deines et al. 2021 — SCYM/RF, milho, validação externa >1 M pontos | abstract |
| B-05 | Amankulova et al. 2023 — PS vs. S2 vs. L8, soja intra-talhão | completo |
| B-07 | Pejak et al. 2022 — SGD vence árvores, soja intra-talhão | abstract |
| B-08 | Skakun et al. 2021 — resolução vs. variabilidade intra-talhão | abstract |
| B-09 | Kross et al. 2020 — ANN, milho e soja, ano-fora | abstract |
| B-10 | Joshi et al. 2023 — DNN, soja, grid 10 m, curva por estádio | abstract |
| B-11 | Gaso et al. 2021 — crop model + LAI Sentinel-2, soja intra-talhão | abstract |
| B-12 | Crusiol et al. 2022 — **soja, Paraná, grade 20 m, SVR/PLSR** | completo |
| B-13 | Amankulova et al. 2024 — S1+S2+topografia, soja | abstract |
| B-15 | Pereira et al. 2026 — XGBoost, soja, Centro-Oeste, municipal | abstract |
| C-01 | Ploton et al. 2020 — validação espacial, biomassa florestal | completo |
| C-02 | Roberts et al. 2017 — estratégias de CV com estrutura | abstract |
| C-03 | Wadoux et al. 2021 — crítica à CV espacial | completo |
| C-04 | Meyer & Pebesma 2021 — Área de Aplicabilidade (AOA) | abstract |
| C-05 | Meyer & Pebesma 2022 — mapas globais de ML e sua avaliação | completo |
| C-07 | Kapoor & Narayanan 2023 — vazamento e crise de reprodutibilidade | abstract |
| C-08 | Milà et al. 2022 — NNDM LOO CV | abstract |
| C-09 | Linnenbrink et al. 2024 — kNNDM CV | completo |
| C-10 | Hengl et al. 2018 — RFsp vs. krigagem | abstract |
| C-11 | Rathore et al. 2026 — **soja intra-talhão, LOFO-CV real** | completo |
| C-12 | Stock 2025 — escolha de blocos para CV espacial | completo |
| C-13 | Khan et al. 2022 — GWRFR, milho county-level | abstract |
| C-14 | Habibi et al. 2023 — CV e transferibilidade, soja, Japão (**proceedings, sem DOI**) | completo |
| D-01 | Kravchenko & Bullock 2000 — solo e topografia vs. produtividade | abstract |
| D-02 | Kitchen et al. 2003 — CEa e topografia vs. produtividade | completo |
| D-03 | Corwin & Lesch 2005 — CEa em agricultura (revisão fundacional) | completo |
| D-04 | Maestrini & Basso 2018 — padrões espaciais intra-talhão | completo |
| D-05 | Maestrini & Basso 2018 — drivers de variabilidade intra-talhão | completo |
| D-07 | Smidt et al. 2016 — atributos que predizem produtividade de soja | abstract |
| D-08 | Tagliapietra et al. 2021 — yield gap em soja no subtrópico brasileiro | abstract |
| D-09 | Adhikari et al. 2022 — CEa + topografia + ML para saúde do solo | abstract |
| D-10 | Maestrini & Basso 2021 — estabilidade temporal sub-talhão | abstract |
| D-11 | Oliveira, Franchini & Debiasi 2011 — CEa e produtividade de soja, Brasil (**sem DOI**) | abstract |
| D-12 | Smith et al. 2026 — **LightGBM, milho e soja, grid 30 m, SHAP** | completo |
| E-brasil-01 | Berka, Rudorff & Shimabukuro 2003 — modelo agrometeorológico, soja, PR | completo |
| E-brasil-04 | Mohite et al. 2023 — RF, soja, municípios do PR, safra held-out | completo |
| E-brasil-05 | Pessina 2024 — RF vs. CNN, soja mesorregional (**monografia**) | completo |
| G-01 | Romano, Patterson & Candès 2019 — Conformalized Quantile Regression | abstract |
| G-02 | Meinshausen 2006 — Quantile Regression Forests | completo |
| G-03 | Angelopoulos & Bates 2023 — conformal prediction (tutorial) | abstract |
| G-04 | Mao, Martin & Reich 2024 — predição espacial livre de modelo | abstract |
| G-05 | Duan et al. 2020 — NGBoost | abstract |
| G-06 | Gyamerah, Ngare & Ikpe 2020 — QRF probabilístico para produtividade | abstract |
| G-07 | Lundberg et al. 2020 — TreeSHAP | abstract |
| G-08 | Apley & Zhu 2020 — ALE vs. PDP | abstract |
| G-09 | Molnar et al. 2022 — pitfalls de interpretação agnóstica | abstract |
| G-11 | Najjar et al. 2024 — explicabilidade sub-talhão (**preprint**) | abstract |
| G-12 | Fisher, Rudin & Dominici 2019 — model class reliance / Rashomon | completo |
| G-13 | Ma et al. 2021 — BNN e incerteza, milho county-level | abstract |
| G-14 | Xiong et al. 2025 — QRF vs. rede quantílica, milho, China | abstract |
| H-01 | Haghighattalab et al. 2017 — GWR, trigo | abstract |
| H-03 | Crusiol et al. 2021 — PLSR, soja, espectrorradiômetro proximal | abstract |
| H-04 | Saravanakumar et al. 2026 — **krigagem de resíduos de ML/DL** | completo |
| H-06 | Maimaitijiang et al. 2020 — fusão multimodal UAV, soja | abstract |
| H-09 | Lobell et al. 2015 — SCYM | abstract |
| H-12 | Sudduth & Drummond 2007 — Yield Editor | abstract |
| H-13 | Vega et al. 2019 — protocolo de limpeza de mapas de colheita | abstract |
| H-14 | Lyle, Bryan & Ostendorf 2013/2014 — erros em mapas de colheita | abstract |

**Identificadores de outros catálogos citados neste ADR** (não são `paper_id`): `[FD-01]`, `[FD-04]`, `[FD-07]`, `[FD-08]`, `[FD-11]`–`[FD-19]` em `../data-sources/fontes-de-dados.md`; `[F-comercial-01]`, `[F-comercial-02]`, `[F-comercial-05]`, `[F-comercial-13]`, `[F-comercial-31]` em `../benchmarks/commercial.md`.

---

## Nota de encerramento

Dez decisões, nenhuma delas com um `[RESULTADO]` atrás. Seis são decisões de **protocolo** (D1, D2, D5, D6, D9, D10) — escolhas sobre como descobrir, não sobre o que é verdade. Quatro são decisões de **engenharia** com evidência razoável (D3, D4, D7, D8). Essa proporção é a leitura honesta do estado da base: a literatura revisada não contém nenhum estudo do regime exato da Invicta, e vários dos seus achados mais próximos são **negativos**. Um ADR que ignorasse isso e nomeasse vencedores seria mais confortável de ler e pior de usar.
