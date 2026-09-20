# Predição Espacial de Produtividade de Soja — Invicta

Projeto de MBA **e** funcionalidade da plataforma Invicta: prever, antes da colheita, quanto um
talhão de soja deve produzir (kg/ha) e **onde dentro dele** a produtividade deve ser maior ou
menor, em grade de 20 × 20 m, com **incerteza** e **explicabilidade**.

---

## Status

> **Fase 1 concluída; nenhum código escrito; nenhum experimento rodado — não há `[RESULTADO]` ainda.**

Tudo neste diretório é **revisão de literatura, benchmark e decisão de protocolo**. Nenhuma linha
de código de produção foi escrita, nenhum modelo foi treinado, nenhum número deste projeto foi
medido. Todos os valores citados vêm de estudos de terceiros, com `paper_id` rastreável.

| Fase | Escopo | Estado |
|---|---|---|
| **Fase 1 — Estado da arte** | Revisão (87 estudos: 77 com DOI conferido no Crossref/DataCite; 10 sem DOI, com URL conferida), benchmarks de modelos e de soluções comerciais, fontes de dados, riscos metodológicos, ADR-001 e recomendações de arquitetura | **concluída** |
| Fase 2 — MVP | Inventário de dados → dataset → baselines → modelos → validação → incerteza → SHAP → mapas | não iniciada |
| Fase 3 — Integração | API e tela na plataforma | não iniciada |

**Rótulos usados em toda a documentação** (seções 45 e 58 do pedido original):
`[EVIDÊNCIA]` — com qualificador `[CONSENSO]` / `[EVIDÊNCIA LIMITADA]` / `[RESULTADO ESPECÍFICO]` ·
`[HIPÓTESE]` · `[LACUNA]` · `[RESULTADO]` (**reservado para experimento próprio — não
há nenhum**). **Decisões** só existem, na forma plena exigida pelas seções 20 e 46 (contexto ·
alternativas · evidências · decisão · consequências), dentro de `docs/decisions/`; os demais
documentos usam `[DECISÃO → ADR-001 Dn]` quando aplicam uma decisão já tomada, e
`[RECOMENDAÇÃO — a formalizar em ADR]` quando a escolha de engenharia ainda não tem ADR
(mapeadas em [`recomendacoes-arquitetura.md`](docs/product/recomendacoes-arquitetura.md) §17). Compatibilidade com a plataforma: `reusa` · `novo_barato` · `infra_nova`.
Unidade interna: **kg/ha** (1 sc = 60 kg); `sc/ha` só na interface.

---

## Índice dos documentos da Fase 1

| Doc. (seção 48) | Arquivo | O que é |
|---|---|---|
| 1 | [`docs/literature-review/estado-da-arte.md`](docs/literature-review/estado-da-arte.md) | Revisão completa; responde as 15 perguntas da seção 52 e as 18 da seção 5 |
| 2 | [`docs/literature-review/papers-database.csv`](docs/literature-review/papers-database.csv) · [`.md`](docs/literature-review/papers-database.md) | Base de 87 estudos únicos, 44 campos, **77 DOIs conferidos no Crossref/DataCite + 10 estudos sem DOI com URL testada** |
| 3 | [`docs/literature-review/matriz-comparativa.md`](docs/literature-review/matriz-comparativa.md) | Os 30 estudos mais relevantes, ordenados **pelo rigor da validação**, não pelo desempenho |
| 4 | [`docs/benchmarks/modelos.md`](docs/benchmarks/modelos.md) | Fichas de 21 famílias de modelos + tabela Cenário → modelo candidato |
| 5 | [`docs/benchmarks/commercial.md`](docs/benchmarks/commercial.md) · [`solucoes.csv`](docs/benchmarks/solucoes.csv) | 32 soluções comerciais e públicas, separando alegação comercial de validação |
| 6 | [`docs/data-sources/fontes-de-dados.md`](docs/data-sources/fontes-de-dados.md) · [`fontes-dados.csv`](docs/data-sources/fontes-dados.csv) | 32 fontes orbitais/públicas (imagem, clima, relevo, solo, datasets) com licença, latência e cobertura Brasil, **mais** 4 modalidades de aquisição própria (drone RGB, drone multiespectral, térmico, CEa) na §4b |
| 7 | [`docs/literature-review/riscos-metodologicos.md`](docs/literature-review/riscos-metodologicos.md) | Vazamento espacial/temporal, as 5 validações, incerteza, explicabilidade, checklist anti-vazamento |
| 8 | [`docs/decisions/ADR-001-model-strategy.md`](docs/decisions/ADR-001-model-strategy.md) | **As dez decisões (D1–D10)**: modelos, dados mínimos, resolução, alvo, validação, momento, incerteza, explicabilidade, arquitetura de treino, métricas e *kill criteria* |
| 9 | [`docs/product/recomendacoes-arquitetura.md`](docs/product/recomendacoes-arquitetura.md) | Como isso se encaixa na plataforma existente: pipeline mapeado nos módulos reais, dependências, armazenamento, API, UI, riscos e fases |

---

# Resumo final da Fase 1 (seção 64)

## 1. Principais descobertas

**(a) A validação, e não o modelo, é a decisão que define o projeto.** Em **todos** os estudos da
base que testam os dois esquemas lado a lado, a validação espacialmente consciente reporta
desempenho **igual ou pior** que o split aleatório — nunca melhor. Os números: R² de 0,53 para 0,14
ao trocar CV aleatória 10-fold por CV espacial 44-fold [C-01]; CV aleatória subestimando o erro em
5–54% [C-12]; R² de soja caindo de 0,90 para 0,79 sob validação agrupada por estado [D-12]; R² de
0,748 para 0,693 e RMSE de 414 para 585 kg/ha ao trocar split aleatório por safra nova *held-out*
em soja no Paraná [E-brasil-04]; e, no único estudo brasileiro de soja com validação externa entre
estados, R² de 0,72 para 0,34–0,76 [B-15, só abstract].

**(b) O mecanismo tem nome e foi demonstrado: o modelo aprende posição, não agronomia.** Um Random
Forest treinado **apenas com coordenadas X/Y** teve desempenho quase idêntico ao modelo com 36
covariáveis reais [C-01]. No regime da Invicta o risco é agudo: 20–100 talhões-safra × ~2.500
células por talhão produzem 5×10⁴ a 2,5×10⁵ linhas, mas apenas **20–100 unidades independentes**.

**(c) A evidência mais próxima do nosso caso é NEGATIVA.** Em soja intra-talhão nos EUA, sob
leave-one-field-out real, o XGBoost obteve R² de 0,54 / 0,40 / 0,24 e **−0,58 / −1,02 / −6,23** nos
outros três talhões-safra, com RMSE de 554–765 kg/ha; os autores concluem que 2–3 safras são
insuficientes para uma LOFO-CV robusta, e registram que **acrescentar solo e topografia piorou o
desempenho** (ruído e sobreajuste local) [C-11]. Esse resultado contraria diretamente a intuição de
que empilhar camadas melhora a previsão.

**(d) Não existe "melhor modelo", e três resultados negativos independentes provam.** Em soja
intra-talhão na Áustria, um linear treinado por SGD superou RF, XGBoost, SVM e MLR [B-07, só
abstract]; em milho na China, a rede neural quantílica **não** superou a regressão quantílica
tradicional [G-14, só abstract]; em soja mesorregional no Brasil, uma CNN exigiu mais computação e
**não** superou o Random Forest [E-brasil-05]. E nem entre anos há vencedor fixo: o RF teve o menor
RMSE agregado, mas o 1D-CNN venceu no ano de 2018 [A-09, só abstract].

**(e) Deep Learning venceu, na base, apenas sob condições que a plataforma não atende.** Em todos
os casos abertos de DL vencedor havia (a) volume massivo — 142.952 amostras [A-04]; (b) série
temporal longa por unidade — 13 anos × 15 estados [A-10], ou >2.000 condados × 39 anos [A-07, só
abstract]; ou (c) imagem de alta resolução por parcela — 450 plots com câmera RGB [A-06], fusão UAV
multimodal [H-06, só abstract]. Nenhuma é verdadeira hoje.

**(f) Resolução mais fina não converte automaticamente em melhor acurácia.** Numa simulação, a
variância intra-talhão explicada cai de 100% a 3 m para 86% a 10 m, **72% a 20 m** e 59% a 30 m —
mas nos **modelos empíricos do mesmo estudo** o R² médio foi **maior** em 30 m HLS (0,56) que em 3 m
Planet (0,30) [B-08, só abstract]; e em soja na Hungria, Sentinel-2 (10 m) superou PlanetScope
(3 m) em todas as métricas [B-05].

**(g) A escala infla a métrica mais que o modelo.** O mesmo método vai de r² 0,31 (pixel de 30 m)
para 0,40 (suavizado), 0,45 (talhão) e 0,69 (condado), em validação externa contra >1 milhão de
pontos reais de colhedora [B-04, só abstract]. **Uma métrica municipal nunca é benchmark de pixel.**

**(h) O teto de acurácia é o erro do alvo, não o modelo.** 10–50% das observações de um mapa de
colheita contêm erros significativos [H-12, só abstract]; um protocolo automatizado removeu ~30% do
dataset em 595 conjuntos reais, e é a limpeza dos outliers **espaciais locais** — não dos globais —
que altera a estrutura espacial do mapa [H-13, só abstract]; as quatro fontes de erro (dinâmica da
colhedora, medição contínua, GNSS, operador) estão catalogadas [H-14, só abstract].

**(i) Garantia teórica de incerteza não é cobertura empírica.** Uma rede bayesiana "correta"
envelopou **mais de 84%** das produtividades observadas num intervalo nominal de 95%
[G-13, só abstract] — o abstract diz *"more than 84%"*, valor compatível com 84,1% e com 94%:
a conclusão é "abaixo do nominal", não a magnitude do desvio. Qualquer
intervalo publicado precisa de cobertura **medida**, não assumida.

**(j) O gap de mercado existe e é exatamente o alvo do MVP.** Nenhuma das 32 soluções comerciais
revisadas entrega previsão intra-talhão (~20 m) com **número + incerteza + explicabilidade juntos**;
nenhuma solução privada publica número de produtividade com métrica de erro; **nenhuma solução
privada** menciona SHAP/XAI (entre as públicas, o JRC MARS/WOFOST é estruturalmente explicável
por ser modelo de processo); e o maior player prevê para a **safra seguinte**, não para a safra em curso
[F-comercial-01]. Em contrapartida, três casos (Farmers Edge→Corvian, Gro Intelligence encerrada em
2024, Descartes Labs descontinuado como serviço aberto) sugerem que prova técnica não garante
modelo de negócio B2C sustentável [F-comercial-10, F-comercial-18, F-comercial-19].

## 2. Tabela dos estudos mais relevantes

Doze linhas, ordenadas do esquema de validação mais rigoroso para o menos rigoroso. **Nenhuma
métrica desta tabela é comparável a outra linha** — cultura, escala, unidade e validação diferem.
Tabela completa (30 estudos) em [`matriz-comparativa.md`](docs/literature-review/matriz-comparativa.md).

| id | Estudo | Cultura / País | Escala | **Tipo de validação** | Métrica reportada | Por que importa aqui |
|---|---|---|---|---|---|---|
| **[C-11]** | Rathore et al. 2026 | soja / EUA | intra-talhão, PlanetScope 3,12 m | **Leave-One-Field-Out CV real** | R² 0,54 / 0,40 / 0,24 / **−0,58 / −1,02 / −6,23**; RMSE 554–765 kg/ha | Regime quase idêntico ao nosso; **solo e topografia pioraram**; 2–3 safras insuficientes |
| **[D-12]** | Smith et al. 2026 | milho e soja / EUA | grid de 30 m, 134 crop-site-years | RFECV 5-fold **+ group-wise por estado + por ano** | soja R² 0,90 → **0,79** (0,67–0,88); RMSE 0,46 Mg/ha; por ano 0,57–0,92 | Melhor métrica da base para soja **em grade**; SHAP põe declividade no top-3 |
| **[B-04]** | Deines et al. 2021 | milho / EUA | pixel 30 m → condado | **Validação externa** contra >1 M pontos de colhedora | r² 0,31 → 0,40 → 0,45 → 0,69 | Quantifica o efeito de agregação; RF falhou fora do domínio de treino |
| **[C-01]** | Ploton et al. 2020 | **biomassa florestal (não agrícola)** / África central | pixel 1 km | random 10-fold **vs.** spatial 44-fold **vs.** buffered LOO | R² 0,53 → 0,14; RMSPE 56,5 → 77,5 (nulo: 82 Mg/ha) | Demonstra a memorização de posição (modelo só X/Y ≈ modelo completo) |
| **[B-15]** | Pereira et al. 2026 | soja / **Brasil** (Centro-Oeste) | **municipal** (não é pixel) | split 70/30 **+ validação externa em estados independentes** | R² 0,72 → 0,34–0,76; RMSE 301,5 → 168,3–491,2 kg/ha | Degradação espacial mesmo em escala agregada, no Brasil |
| **[E-brasil-04]** | Mohite et al. 2023 | soja / **Brasil** (PR) | municipal | split 80/20 **+ safra nova held-out** | R² 0,748 → 0,693; RMSE 414 → 585 kg/ha | Única evidência brasileira quantificada do otimismo do split aleatório |
| **[A-03]** | Shahhosseini et al. 2021 | milho / EUA | condado, 293 × 35 anos | **CV 10-fold aleatória + anos de teste retidos** (2012, 2017, 2018) | RMSE −7 a 20% com APSIM+ML; RRMSE 6–7% | Melhor híbrido da base — **mas medido com o clima REAL do ano de teste** |
| **[G-13]** | Ma et al. 2021 | milho / EUA | condado | treino em anos anteriores, **teste 2010–2019** | R² 0,77; **PICP ≥84% para nominal de 95%** | O contraexemplo que obriga a medir cobertura empírica |
| **[H-04]** | Saravanakumar et al. 2026 | trigo e mostarda / Índia | desagregação vilarejo → pixel | agregação pixel→vilarejo vs. estatística oficial **reportada** | **RMSE −35 a 45%** ao krigar os resíduos; RF puro R² 0,9949 com mapa irreal | Mostra que R² alto convive com mapa espacialmente irreal. **Não transfere para o MVP:** o agregado é observado, logo é desagregação, não previsão (ver §3) |
| **[C-14]** | Habibi et al. 2023 (**proceedings, sem DOI**) | soja / Japão | intra-talhão, UAV, 7 talhões | RCV **vs.** spatial CV **vs.** LOFO, todos contra talhão independente | qualitativo (sem R²/RMSE no resumo estendido) | Desenho experimental exatamente certo; conclusão só qualitativa |
| **[B-12]** | Crusiol et al. 2022 | soja / **Brasil** (PR) | **intra-talhão, grade de 20 m**, 15 talhões | 10-fold aleatório + *hold-out* 75/25 nos **mesmos** 15 talhões, rotulado pelos autores como "validação externa" (**sem LOFO nem safra-fora**) | SVR global R² 0,75 / RMSE 38,82 kg/ha; field-based R² 0,07–0,79 | **O estudo mais próximo do MVP**; field > farm > global, mas sem talhão-fora |
| **[B-05]** | Amankulova et al. 2023 | soja / Hungria | intra-talhão, 7 talhões, 1 safra | **split 70/30 aleatório** (otimista) | S2 10 m R² 0,90 / RMSE 0,184 t/ha > PlanetScope 3 m 0,85 / 0,222 | Mostra que resolução mais fina não vence automaticamente |

## 3. Melhores técnicas identificadas

Ordenadas pela razão entre evidência aplicável e custo na stack atual. **"Melhor" aqui significa
"com mais evidência transferível", não "de maior desempenho medido"** — não há medição própria.

> **Uma técnica saiu desta lista na revisão.** O *regression-kriging* dos resíduos [H-04] figurava
> aqui como correção local do modelo global. Ele foi retirado: em [H-04] o valor agregado é
> **observado** no momento da predição, o que faz do estudo uma **desagregação** de um valor
> conhecido, não uma previsão. Como resíduo = observado − previsto, num talhão-safra pré-colheita
> não há resíduo para krigar; sob LOFO, usá-lo seria vazamento pelo alvo. A técnica continua no
> projeto, mas como `[HIPÓTESE]` de escopo restrito — pós-colheita/diagnóstico, e resíduo de
> safras anteriores como offset sob leave-one-year-out. Ver
> [`ADR-001`](docs/decisions/ADR-001-model-strategy.md), D9 item 2-bis.

| # | Técnica | Evidência | Compat. |
|---|---|---|---|
| 1 | **Validação por grupo (talhão)** como métrica oficial, com LOFO como distribuição e LOYO como diagnóstico | [C-01], [C-11], [C-12], [D-12], [B-15], [B-04], [E-brasil-04], [C-14] | `reusa` |
| 2 | **Família de árvores** (RF / XGBoost / LightGBM) sobre features tabulares por célula | [A-02, só abstract] (árvores são estado da arte em tabular de porte médio), [A-11] (RF mais robusto em 1.728 cenários, R² 0,80), [D-12], [C-11] | `novo_barato` |
| 3 | **GWR / GWRFR (ponderação geográfica)** como correção local que **não** exige o alvo | [C-13, só abstract] (R² 0,90 e menor Moran's I residual em milho de condado), [H-01, só abstract]; **nenhum teste intra-talhão na base** | `novo_barato` |
| 4 | **SVR e PLSR** como comparadores diretos | [B-12] (SVR > PLSR em soja, PR, grade de 20 m), [H-03, só abstract] | `novo_barato` |
| 5 | **TreeSHAP** para atribuição, com **ALE no lugar de PDP** | [G-07, só abstract] (o **primeiro** algoritmo em tempo polinomial para explicações ótimas em modelos de árvore — "primeiro", não "único"), [G-08, só abstract] | `novo_barato` |
| 6 | **QRF e conformal/CQR** para incerteza, calibrados por grupo | [G-02], [G-01, só abstract], [G-04, só abstract], [G-14] | `novo_barato` |
| 7 | **Área de Aplicabilidade (AOA/DI)** como filtro de exibição | [C-04, só abstract] ("prediction error within the AOA is comparable to the cross-validation error"), [C-05] | `novo_barato` |
| 8 | **Dimensionar blocos de validação por variograma** | [C-12] ("the most important methodological choice was the block size"), [C-06] | **`reusa`** (`pykrige`) |
| 9 | **Limpeza do alvo em dois estágios** (global + espacial local por Moran) | [H-13, só abstract], [H-12, só abstract], [H-14, só abstract] | `reusa` + `novo_barato` |
| 10 | **Série intra-safra agregada por estádio**, em vez de imagem única | [B-12] ("information pooled across the cropping season presented better results"), [B-04] (suavização harmônica: r² 0,31 → 0,40) | `reusa` |
| 11 | **Relevo como grupo de features de alta prioridade** | [D-12] (declividade no top-3 da soja), [B-09, só abstract] (SR + declividade acima de NDVI/NDRE), [D-05] | `reusa` |
| 12 | **kNNDM** como refinamento posterior da validação | [C-09] (4,8 dias → 1,2 min em 4.000 pontos), [C-08, só abstract] | `novo_barato` |

**Fora do MVP, com critério objetivo de reentrada** (ADR D1): Deep Learning em todas as variantes e
híbrido com crop model. [A-03] registra ganho de 7–20% com APSIM, **mas medido com o clima real do
ano de teste** — os autores escrevem que, na prática, *"the weather will be unknown"*.

## 4. Erros metodológicos frequentes

Dezesseis erros catalogados em [`estado-da-arte.md §6`](docs/literature-review/estado-da-arte.md);
os oito de maior impacto para este projeto:

1. **Split de observações do mesmo talhão como validação final** — prática dominante na
   literatura de sensoriamento ([B-05] e [B-06], ambos 70/30 aleatório declarado; [B-01, só
   abstract] usa *hold-out* de metade das observações do mesmo talhão/safra, sem declarar o
   esquema de sorteio); documentado como fonte de
   otimismo em [C-01], [C-12], [C-14]. Os próprios autores de [B-10, só abstract] registram que
   falta testar em talhões não usados no treino.
2. **Não declarar o esquema de validação** — **28 estudos** da base têm `validation = nd`, e
   outros **14** trazem em texto livre "não detalhado/não especificado no abstract": 42 dos 87, ou
   48% da base. Sem o esquema, a métrica não é interpretável. *(Critério único de contagem, por
   script sobre o CSV, enunciado em [`estado-da-arte.md` §2.9](docs/literature-review/estado-da-arte.md).)*
3. **Comparar métricas entre escalas diferentes** — o mesmo modelo vai de 0,31 a 0,69 apenas
   mudando a unidade de agregação [B-04].
4. **Usar informação do futuro como feature** — clima real do ano de teste alimentando o crop model
   [A-03]; ou imagens posteriores à data da previsão, que importariam o salto de R² 0,26 → 0,70 de
   [B-10] inteiro como vazamento.
5. **Coordenadas ou proxies de posição como feature** [C-01].
6. **Confiar no R² global e não olhar o mapa** — RF com R² 0,9949 produzindo mapas espacialmente
   irreais [H-04].
7. **Vazamento em seleção de features, normalização e hiperparâmetros fora da CV aninhada** —
   taxonomia geral em [C-07, só abstract], que documenta 294 artigos afetados em 17 campos
   científicos; num caso reproduzido, corrigido o vazamento, "modelos complexos de ML não têm
   desempenho substantivamente melhor que modelos de regressão logística de décadas atrás".
8. **Publicar intervalo de incerteza sem verificar a cobertura empírica** [G-13] e **publicar mapa
   sem dizer onde ele não se aplica** [C-04], [C-05].

## 5. Lacunas da literatura

Dezesseis lacunas declaradas em [`estado-da-arte.md §7.1`](docs/literature-review/estado-da-arte.md).
As sete que mais afetam as decisões do ADR:

| # | Lacuna | Consequência no ADR |
|---|---|---|
| L1 | **Nenhum estudo combina soja + Brasil + intra-talhão + leave-one-field-out + leave-one-year-out.** Sem evidência na base revisada | D5 e D9 decidem protocolo, não vencedor |
| L2 | **Nenhum estudo brasileiro da base reporta incerteza nem explicabilidade** para soja | D7 e D8 são apostas metodológicas declaradas |
| L3 | **Nenhum artigo revisado por pares aplica SHAP espacial a soja no Brasil.** O mais próximo é preprint, em Argentina/Uruguai/Alemanha [G-11, só abstract] | D8 é contribuição original potencial |
| L5 | **Não há curva contínua de acurácia × antecedência para soja intra-talhão.** [B-10, só abstract] tem 6 pontos de estádio | D6 torna a curva um entregável |
| L7 | **Não há teste explícito de vazamento por interpolação** (mapa krigado como feature) | D2 exige ablação sob LOFO, não intuição |
| L12 | **Não há comparação direta GBM vs. DL no regime de 20–100 talhões-safra** | D1 exclui DL por condição verificável, não por medição |
| L13 | **Não há limiar de erro "operacionalmente útil"** para predição intra-talhão de soja | D10 recusa adotar limiar de outro estudo e define critério relativo |

Acrescente-se uma lacuna específica deste projeto: **nenhum estudo da base discute o "ajuste à
média real" do pipeline de limpeza de colheita como fonte de vazamento** — a classificação e a
decisão conservadora de D4 são `[HIPÓTESE]` própria, sem apoio na literatura.

## 6. Oportunidades de inovação

Dez oportunidades em [`estado-da-arte.md §7.2`](docs/literature-review/estado-da-arte.md). As cinco
de maior razão valor/custo, todas viáveis com o que a plataforma já tem:

1. **Escada de validação completa publicada para soja intra-talhão brasileira** (ataca L1) —
   aleatório → GroupKFold → LOFO → LOYO → fazenda externa, **publicando a degradação em cada
   degrau**. A base mostra essa degradação em outros contextos, nunca neste. `reusa`.
2. **Integração inédita de mapa de colheita + fertilidade krigada + CEa + relevo em soja** (L4) —
   a plataforma já produz as quatro camadas; nenhum estudo da base as combina. `reusa`.
3. **Curva de acurácia × antecedência com as restrições reais de nuvem do Brasil** (L5) — [B-12]
   registra 40–70% de cobertura de nuvens no Paraná, restando **4–10 imagens Sentinel-2 por talhão
   na safra inteira**. `reusa`.
4. **Mapa de SHAP por célula de 20 m para soja no Brasil** (L3), com ALE no lugar de PDP e
   verificação de estabilidade entre *folds*. É simultaneamente lacuna acadêmica e diferencial de
   produto: nenhuma solução comercial **privada** entre as 32 revisadas menciona SHAP/XAI. `novo_barato`.
5. **Quantificar o vazamento por interpolação** (L7) — comparar, sob CV aleatória **e** sob LOFO, um
   modelo com mapas krigados de fertilidade como features contra um sem eles. Se a hipótese estiver
   certa, o modelo com mapa krigado ganha na CV aleatória e **perde** na LOFO. `reusa`.

Complementam: auditoria do
`colheita.py` contra o protocolo de dois estágios de [H-13], e publicação do código e do protocolo —
nenhum dos **17** estudos brasileiros da base declara código aberto (6 declaram "não" e 11 não informam).

## 7. Proposta de arquitetura para a Invicta

Detalhe completo em [`recomendacoes-arquitetura.md`](docs/product/recomendacoes-arquitetura.md);
decisões em [`ADR-001`](docs/decisions/ADR-001-model-strategy.md). Em síntese:

**Princípio único do qual tudo decorre:** o backend do Render é um serviço de cálculo geoespacial
**síncrono, em CPU, com 2 workers e memória apertada** — `interp.py` já limita a malha a 400 células
por lado — teto calibrado na época em que o plano do Render tinha **512 MB** e uma grade maior
"estourava a memória … e derrubava o container"; o plano hoje é `standard`, mas **o teto não foi
reavaliado após a migração**. E o worker é reciclado a cada ~100 requisições porque GDAL/rasterio
fragmentam memória. Portanto: **treino,
validação, SHAP e inferência em lote acontecem FORA do caminho da requisição; o backend serve
artefatos pré-computados.**

**O que já existe e é reusado** (seis das doze caixas do pipeline da seção 27): aquisição de imagem
via STAC (`msr.py`, `cbers.py`) com robô noturno (`agenda.py`); catálogo de 12 índices
(`indices.py`); padronização de CRS (todos os módulos já projetam para plano métrico local e
devolvem o mesmo envelope bounds + grid Float32 b64 + stats); limpeza do mapa de colheita
(`colheita.py`); grid e interpolação (`interp.py`, com `pixel_m` = 20 m); relevo (`mde.py`);
fertilidade krigada e CEa; e o padrão de persistência de camadas (grid gzip por talhão no Supabase).

**O que é novo e barato:** montagem de features com corte temporal por linha; tabela de features em
Parquet; treino e validação offline; calibração de incerteza; SHAP pré-computado; job de inferência
noturna **copiando o desenho de `agenda.py`** (thread + trava em linha do banco + progresso
commitado por unidade + opt-in por variável de ambiente); *lineage*, versionamento de modelos e
monitoramento de drift; e a suíte anti-vazamento como teste bloqueante.

**O que fica fora:** GPU e Deep Learning, crop model acoplado, pipeline SAR, PlanetScope, PostGIS,
feature store gerenciada e `geopandas` (que arrastaria GDAL/fiona/pyproj para o mesmo processo que
já fragmenta memória — `shapely` + `rasterio`, já pinados, cobrem o necessário).

**Recomendação sobre o build pinado:** separar `backend/requirements.txt` (produção, muda o mínimo)
de um `requirements-train.txt` fora de `backend/` (offline). Se a inferência for pré-computada em
lote, **o backend de produção não precisa nem do `xgboost`** — ele só lê grids. Essa é a maior
economia de risco da proposta, e preserva o `buildFilter` do `render.yaml`.

**Contrato de API e interface:** rotas de leitura (`/yield/predicao`, `/yield/mapa`,
`/yield/explicacao`, `/yield/janelas`, `/yield/modelos`) que **nunca disparam cálculo**, com o nível
nominal do intervalo sempre explícito, `intervalo: null` como estado válido, e **faixas qualitativas
de confiança** (alta / média / baixa / sem suporte) quando o intervalo numérico não for defensável —
abordagem inspirada em [F-comercial-31], a única entre as 32 soluções revisadas que comunica
condição por categoria em vez de número. No mapa, células fora da AOA em cinza [C-05]; na célula,
representação ordinal, nunca número com casa decimal; e o texto fixo de ressalva de
**não-causalidade** junto de todo mapa de atribuição.

## 8. Plano detalhado para o primeiro MVP

Alinhado ao roadmap da seção 51. **Começa pela Etapa 3** — as Etapas 1 e 2 (revisão e benchmark) são
o conteúdo deste diretório.

### Etapa 3 — Inventário dos dados disponíveis · *ponto de partida*

| | |
|---|---|
| **Entregáveis** | (1) Planilha de inventário: por talhão-safra de soja — área, nº de pontos de colhedora, nº de cenas Sentinel-2/CBERS aceitas por janela de DAS, existência de laudos de solo (e densidade em pontos/ha), existência de CEa, cobertura de MDE, safras disponíveis por talhão, fazenda. (2) Contagem de **unidades independentes**: talhões distintos, fazendas distintas, safras distintas. (3) Diagnóstico de nuvem: distribuição do nº de cenas por talhão-safra. |
| **Critérios de aceite** | Nº de talhões-safra confirmado dentro (ou fora) da faixa de 20–100; ≥2 fazendas com ≥5 talhões-safra cada, **ou** declaração explícita de que a Validação 5 é `[LACUNA]`; nº de safras confirmado, com LOYO marcada como diagnóstico qualitativo se < 4. **Os pisos "≥2 fazendas com ≥5 talhões-safra" e "< 4 safras" são `[HIPÓTESE]` deste projeto — a base não fixa tamanho mínimo de conjunto externo nem de série `[LACUNA]`** |
| **Dependências de dados** | Cadastro Cliente→Fazenda→Talhão→Safra; `inv_msr_monitor`; mapas de colheita brutos; laudos de solo; `inv_condutividade` |
| **Por que primeiro** | Se o inventário mudar a ordem de grandeza, D1/D5/D7/D9 do ADR precisam ser reabertos antes de qualquer código |

### Etapa 3b — Alvo e qualidade do alvo

| | |
|---|---|
| **Entregáveis** | `colheita.py` gerando e armazenando **as duas versões do alvo** (`yield_sem_ajuste` e `yield_ajustado`); log do **% removido por estágio de filtro**; auditoria do filtro local contra o índice de Moran local; estimativa quantitativa do **erro do alvo** (variância entre passadas adjacentes em região homogênea); agregação à célula por **mediana** com contagem de pontos |
| **Critérios de aceite** | Remoção por talhão-safra entre 5% e 60% — **faixa `[HIPÓTESE]` deste projeto**, escolhida com folga em torno dos ~30% de [H-13, só abstract] e da faixa de 10–50% de [H-12, só abstract]; **os limites 5% e 60% não vêm de nenhuma fonte**. Fora deles, o talhão-safra é bloqueado para revisão manual. Erro do alvo estimado e documentado |
| **Dependências** | Mapas de colheita brutos com pontos, velocidade e identificação de colhedora |
| **Evidência** | [H-12, só abstract], [H-13, só abstract], [H-14, só abstract] |

### Etapa 4 — Escolha do primeiro dataset

Selecionar a região mais homogênea e com melhor histórico (seção 21). **Entregável:** conjunto
congelado, com hash, e a fazenda externa **separada antes de qualquer processamento**.
**Aceite:** a fazenda externa tem contador de avaliações persistido, com falha se > 1 antes do
relatório final.

### Etapa 5 — Padronização espacial

Grid de 20 m com **origem estável por talhão** (mesma célula comparável entre safras).
**Aceite:** `cell_id` reproduzível; krigagem e IDW **contidas no talhão**, verificado no *lineage*
(`pontos_origem` do mesmo `talhao_id`). **Compat.:** `reusa` (`interp.py`).

### Etapa 6 — Feature engineering

| | |
|---|---|
| **Entregáveis** | Tabela de features em Parquet, uma linha por `cell × season × data_previsao`, com grupos A–F (seção 30) e **`data_previsao` obrigatório**; *lineage* por feature com `derivada_do_alvo`, `janela_fim`, `pontos_origem`, `densidade_amostral` e `variancia_predicao`; janelas por **dias após semeadura** (~30/50/70/90/110 DAS) |
| **Critérios de aceite** | **Testes A1, B1, B2, B3 e D3 da suíte anti-vazamento passando**: nenhuma imagem posterior a `data_previsao`; nenhum talhão nos dois lados do split; grupo = `talhao_id`; nenhuma coordenada absoluta entre as features; a média informada da safra fora das features (por nome **e** por correlação > 0,95) |
| **Dependências** | Etapas 3b e 5; clima **não** é bloqueante (entra na prioridade P4 da ablação) |

### Etapa 7 — Baselines

Baseline 0 (média histórica do talhão) e Baseline 1 (regressão linear/Lasso). **Aceite:** ambos
avaliados sob a métrica oficial; o Baseline 0 é o piso contra o qual todo modelo será comparado
— referência de que o piso é real: em [A-06], a média por semente teve RMSE 570,57 kg/ha e R² 0,010.

### Etapas 9 e 10 — Validação espacial e temporal *(antes dos modelos, deliberadamente)*

| | |
|---|---|
| **Entregáveis** | Os cinco esquemas implementados; *gap* `RMSE_random − RMSE_LOFO` medido; bloco dimensionado por variograma; AOA/DI calculada |
| **Critérios de aceite** | Métrica oficial produzindo **mediana entre talhões + faixa + nº de talhões piores que o nulo**; *gap* random−LOFO **diferente de zero** (gap nulo indica que o agrupamento não separa de fato) |
| **Compat.** | `reusa` (`GroupKFold`/`LeaveOneGroupOut`; variograma com `pykrige`) |

### Etapa 8 — Modelos e ablação

| | |
|---|---|
| **Entregáveis** | Os nove candidatos do ADR D1 (linhas 0 a 7 e 9 da tabela de D1; a linha 8, regression-kriging, fica fora da validação oficial) sob CV aninhada, mesmas *folds* e mesma semente; **ablação da seção 31** (A, B, C, D, E, F + A′ bandas brutas + A″ catálogo completo de índices); comparação global × por fazenda × por talhão (ADR D9, item 2); **curva de acurácia × antecedência** por janela de DAS. O **GWRFR é a linha 9 e está *dentro* da validação oficial**, com prioridade baixa (ADR D1). Fora da validação oficial, como experimentos à parte: a regression-kriging da linha 8 e o offset de "resíduo persistente" de safras anteriores sob LOYO (ADR D9, item 2-bis) |
| **Critérios de aceite** | Nenhum grupo de features entra sem melhora da mediana de RMSE por talhão maior que a dispersão entre *folds*; número de configurações de hiperparâmetros registrado; empate resolvido pelo candidato **mais simples** |
| **Dependências** | Etapas 6, 7, 9, 10. Clima (NASA POWER → AgERA5) só é necessário para o braço E |

### Etapa 11 — Incerteza e explicabilidade

| | |
|---|---|
| **Entregáveis** | QRF e conformal/CQR calibrados **por talhão**, comparados contra regressão quantílica simples; PICP, PINAW e cobertura condicional por talhão e por faixa; TreeSHAP agregado sobre os *folds* com dispersão visível; ALE |
| **Critérios de aceite** | Intervalo numérico só é aprovado se `\|PICP − nominal\| ≤ 5 p.p.` e nenhum talhão abaixo de `nominal − 15 p.p.` — **limiares `[HIPÓTESE]` deste projeto (ADR D7, item 7); a base não traz limiar de tolerância `[LACUNA]`**, e por isso eles são fixados antes do experimento; caso contrário, faixa qualitativa. Intervalo de talhão **nunca** obtido por soma de variâncias independentes (teste F1). SHAP gerado apenas do modelo validado por grupo (teste F3) |

### Etapa 12 — Mapas e **portão de viabilidade**

| | |
|---|---|
| **Entregáveis** | Os cinco mapas (previsto, incerteza, fatores, real, erro); Moran's I dos resíduos por talhão e por *fold*; clusters de erro cruzados com zonas MEAP, CEa e TWI; **avaliação dos *kill criteria* K1–K6 do ADR D10** |
| **Critério de aceite / parada** | Se **K1** (não bate o nulo), **K2** (o padrão intra-talhão não ordena) ou **K5** (todo o desempenho vinha de vazamento) disparar, o projeto **não avança** para a Etapa 13: registra a conclusão negativa como resultado acadêmico (seção 60) e reabre o ADR pelas rotas de continuação ali listadas |

### Etapas 13, 14 e 15 — MVP, API e integração

Job de inferência em lote no padrão de `agenda.py`; artefato de modelo versionado com calibração;
gravação dos grids no padrão `inv_mapas_fert`; rotas de leitura sem cálculo síncrono; tela de
Predição de Produtividade com os dois modos de confiança. **Aceite:** nenhuma rota de leitura
dispara cálculo; todo grid servido carrega o `model_version` que o gerou; nenhuma previsão fora da
AOA é exibida como número pontual.

### Dependências de dados, consolidadas

| Bloqueante para o MVP | Não bloqueante |
|---|---|
| Mapa de colheita limpo, com as duas versões do alvo e contagem de pontos por célula | **Clima** — pré-requisito do braço E da ablação, não do produto mínimo |
| Série espectral intra-safra com data de cena por talhão | Manejo (cultivar, data de semeadura, população) — disponibilidade parcial/incerta; resultado provável da ablação é "sem poder de teste suficiente", a declarar como `[LACUNA]` |
| Relevo (altitude, declividade) | Fertilidade krigada e CEa — candidatas sujeitas a ablação, com o alerta de [C-11] de que podem piorar |
| Identificadores e *lineage* completos | Sentinel-1 (SAR) e HLS — decisões adiadas com gatilho de cobertura de nuvem |

---

## Limitações da revisão

Declaradas para que nenhum número deste diretório seja lido como mais forte do que é.

1. **Leitura parcial.** Dos 87 estudos, **27 foram lidos na íntegra, 54 apenas pelo resumo e 6
   apenas em metadados**. Citações de estudos lidos só pelo resumo são marcadas `[X-NN, só
   abstract]` na primeira ocorrência; os 6 de metadados (`E-brasil-08`, `E-brasil-09`,
   `E-brasil-10`, `H-05`, `H-07`, `H-11`) **não sustentam nenhuma afirmação além de "o estudo
   existe"** — e dois deles tratam, **segundo o título registrado no CSV**, de temas centrais do
   projeto: `H-05` ("algoritmo baseado em *random forest* para interpolação espacial intensiva em
   mapeamento de produtividade") e `H-07` ("identificar causas da variabilidade de produtividade com
   *machine learning* interpretativo"). Nos dois casos, **título/DOI confirmados; conteúdo não
   lido** — no CSV, `H-07` tem `crop`, `country`, `scale`, `sensor`, `resolution`, `model` e
   `explainability` **todos `nd`**, de modo que cultura, método de atribuição e resolução de grade
   não estão verificados.
2. **Paywall.** Vários artigos relevantes ficaram inacessíveis por 403/paywall em todas as rotas
   permitidas; métricas ausentes ficaram em branco, **nunca estimadas**.
3. **Nenhum estudo cobre o regime exato do projeto.** Não há, na base, estudo de soja + Brasil +
   grade de 20 m + leave-one-field-out + leave-one-year-out. As decisões do ADR são, por isso,
   majoritariamente decisões de **protocolo**, não de resultado.
4. **Evidência metodológica importada de fora da agricultura.** Os achados mais fortes sobre
   validação espacial vêm de biomassa florestal [C-01] e clorofila marinha [C-12]; a magnitude não
   transfere automaticamente para soja em grade de 20 m, embora a direção seja consistente em todos
   os estudos agrícolas da base que testam os dois esquemas.
5. **Métricas não comparáveis entre si.** CCC não é R² [B-14, só abstract]; "fração de variância
   capturada" não é R² clássico [H-09, só abstract]; rRMSE não é RMSE absoluto [B-11, só abstract];
   RRMSE% é percentual, não kg/ha [A-03]. Um R² foi **removido** da base por ser, na verdade, a
   fração de variação do RMSE explicada por uma estatística de Wasserstein [C-09].
6. **Ressalva de unidade em [B-12].** Os RMSE do estudo mais próximo do MVP — **7,24–37,32 kg/ha
   (SVR *field-based*, por talhão) e 38,82 kg/ha (SVR *global-based*)** — são de ordem de grandeza
   muito inferior à dos demais estudos de soja da base, que ficam entre ~180 e ~765 kg/ha; o próprio
   artigo reporta 369,70 kg/ha no experimento com reflectância foliar. **Não comparar [B-12] com
   [C-11] (554–765 kg/ha) nem com [B-15] (301,52 kg/ha, escala municipal) sem essa ressalva**, e
   reconferir a unidade no artigo original antes de usar qualquer um desses valores como referência
   de erro. (51,76 kg/ha, que chegou a aparecer aqui como limite superior, é o RMSE do **PLSR**
   global — outro modelo.)
7. **Ressalva obrigatória de [A-03].** O ganho de 7–20% do híbrido APSIM+ML foi medido com o **clima
   real do ano de teste**; em uso pré-colheita real o ganho tende a ser menor.
8. **Benchmark comercial baseado em páginas públicas.** Nenhum contato comercial, cotação, NDA ou
   demonstração; várias páginas bloquearam leitura direta e os dados vieram de *snippet* de busca,
   com confiança moderada e marcada linha a linha. Nenhum preço para o Brasil foi encontrado.
9. **Pendências de verificação nas fontes de dados** (resolução exata do NASA POWER, termos de
   redistribuição do BR-DWGD e do HYBRAS, licença `NOASSERTION` do CY-Bench, entre outras) estão
   listadas ao fim de [`fontes-de-dados.md`](docs/data-sources/fontes-de-dados.md) e **não devem ser
   tratadas como fato**.
10. **Erro de transcrição corrigido durante a revisão.** A faixa de RMSE de [C-11] chegou a ser
    registrada na base como "574–765 kg/ha"; a tabela verbatim do estudo confirma **554–765 kg/ha**
    (574 é o RMSE de um talhão-safra específico, não o mínimo). A base e todos os documentos foram
    corrigidos. Fica o registro: a auditoria literal de métricas confere se o número existe na
    fonte, não se ele é o mínimo/máximo correto de uma faixa — faixas merecem releitura manual.

### Pendências conhecidas da Fase 1

Itens que a revisão independente deixou **abertos e declarados**, para não voltarem como surpresa na
Fase 2. Nenhum deles invalida número publicado; todos são dívida conhecida.

> **A Fase 1 passou por três verificações independentes; a terceira apontou os itens N-01…N-08,
> corrigidos em seguida SEM nova verificação independente.** O registro item a item do que mudou
> está em [`verificacao-citacoes.md`](docs/literature-review/verificacao-citacoes.md), adendos
> C-28…C-35. Duas correções mexeram em número publicado e merecem atenção de quem reler:
> os estudos **sem esquema de validação declarado** passaram de 40 (46%) para **42 de 87 (48%)**,
> por critério único enunciado em `estado-da-arte.md` §2.9; e o campo `years` de `[E-brasil-04]`
> deixou de dizer "15 safras" (era o nº de **municípios**) e passa a registrar o intervalo
> **2005/06–2020/21**, que corresponde a 16 safras.

1. **Tamanho e redundância de [`estado-da-arte.md`](docs/literature-review/estado-da-arte.md)
   (~1.800 linhas).** A tabela de remissão da §5 reduziu a repetição, mas §6 e §7 ainda reexpõem
   números já apresentados ([B-12] aparece 39×, [C-11] 28×, [D-12] 27×). **Enxugar antes de o
   documento virar capítulo do MBA** — a redação acadêmica não tolera a repetição que uma revisão
   navegável tolera.
2. **Unidade do RMSE de [B-12] a reconferir no artigo original.** Os valores de 7,24–38,82 kg/ha são
   uma ordem de grandeza abaixo dos demais estudos de soja da base (~180 a ~765 kg/ha), e o próprio
   artigo reporta 369,70 kg/ha em outro experimento. A ressalva viaja junto do número em todos os
   documentos, mas a unidade **não foi confirmada na fonte primária** — ver limitação 6 acima.
3. **Pendências de verificação em [`fontes-de-dados.md`](docs/data-sources/fontes-de-dados.md):**
   resolução exata e SLA de latência do NASA POWER (FD-14), termos de redistribuição do BR-DWGD e do
   HYBRAS, licença `NOASSERTION` do CY-Bench, entre outras. Estão listadas ao fim daquele documento e
   **não devem ser tratadas como fato** — o valor de ~50 km do FD-14, em particular, ficou **fora**
   da faixa de resolução climática publicada justamente por isso.
4. **Estudos relevantes que entraram na base sem conteúdo utilizável.** Nenhum dos alvos citados
   durante a pesquisa ficou de fora da base — todos foram localizados e registrados —, mas quatro
   entraram com leitura limitada e por isso sustentam pouco ou nada: **[H-07]** (Jones et al. 2022 —
   **título/DOI confirmados; conteúdo não lido**; segundo o título, "identificar causas da
   variabilidade de produtividade com ML interpretativo") e **[H-11]** (von Bloh et al. 2023 —
   segundo o título, "*machine learning* para previsão de produtividade de soja no Brasil") são
   `só metadados` — DOI confirmado, nenhum abstract acessível por rota permitida, e **não sustentam
   afirmação além de "o estudo existe"**; **[H-06]** (Maimaitijiang et al. 2020, UAV multimodal em
   soja) e **[H-08]** (Leroux & Tisseyre 2018/2019, revisão de indicadores de variabilidade)
   entraram só pelo abstract. Os dois primeiros tratam de temas centrais do projeto e merecem nova
   tentativa de acesso na Fase 2, junto com **[H-05]**, também `só metadados`.
5. **`docs/mba/` a criar na Fase 2.** A seção 44 do pedido fica, nesta fase, sem artefato próprio —
   ver a nota na estrutura do projeto, logo abaixo.
6. **`solucoes.csv` exige *parser* CSV, não `split(';')`.** Cerca de 60 células trazem `;` **dentro**
   de campo entre aspas, o que desalinha qualquer leitura ingênua (foi a causa de um erro de
   contagem na 1ª rodada). O CSV **não foi alterado**; a exigência está documentada em
   [`commercial.md`](docs/benchmarks/commercial.md) §Limitações. Ver adendo C-19.
7. **As correções do 3º ciclo não foram reverificadas.** Os oito itens N-01…N-08 foram aplicados
   depois da última verificação independente, com auditoria por script do próprio corretor (rótulo
   de consenso sempre com ≥ 2 estudos citados no mesmo bloco; esquema de validação de cada estudo
   igual ao da fonte; ids citados contidos no CSV; 44 colunas; links e tabelas íntegros).
   **Auditoria própria não substitui verificação independente** — quem
   retomar a Fase 2 deve tratar esses oito pontos como os mais recentes e, portanto, os menos
   testados do produto.
8. **Limiares de decisão do projeto continuam sendo `[HIPÓTESE]`, não evidência.** "~10 talhões"
   para `GroupKFold`, "≥4 safras" para LOYO virar métrica, "≥2 fazendas com ≥5 talhões-safra" para
   a Validação 5 e os gatilhos de revisão do ADR (500+ talhões-safra, < 15) estão todos rotulados e
   com cláusula de origem, mas **nenhum deles tem âncora na base revisada** `[LACUNA]`. A Etapa 3 do
   roadmap fecha os de K2/S7 com a agronomia; os demais só serão testáveis com dados reais.

---

## Estrutura do projeto (seção 47)

Estrutura-alvo completa. **Apenas `README.md` e `docs/` existem hoje** — nada de código foi criado,
e pastas vazias não foram geradas de propósito. O restante é criado na Fase 2, item a item.

- `yield-prediction/`
  - `README.md` — *(este arquivo)*
  - `docs/`
    - `literature-review/` — estado da arte, base de papers, matriz comparativa, riscos metodológicos
    - `benchmarks/` — benchmark de modelos, benchmark de soluções comerciais
    - `decisions/` — ADRs (`ADR-001-model-strategy.md`)
    - `mba/` — material acadêmico **(a criar na Fase 2)** — a pasta **não** foi criada vazia. A
      seção 44 do pedido ("documentação acadêmica — produzir continuamente") fica, nesta fase, sem
      artefato próprio: o material que a alimentaria está em `literature-review/` e em
      `decisions/`, e a consolidação em formato acadêmico é entregável da Fase 2
    - `product/` — recomendações de arquitetura
    - `data-sources/` — fontes de dados *(acréscimo desta fase à estrutura da seção 47)*
  - `data/` *(a criar)*
    - `raw/` · `interim/` · `processed/` · `external/`
  - `notebooks/` *(a criar)*
  - `src/` *(a criar)*
    - `ingestion/` · `preprocessing/` · `geospatial/` · `features/` · `models/` · `validation/` · `explainability/` · `inference/`
  - `tests/` *(a criar — abriga a suíte anti-vazamento A1–F4, bloqueante)*
  - `models/` *(a criar)*
  - `reports/` *(a criar)*
  - `configs/` *(a criar)*

---

## Próximo passo

**Etapa 3 — inventário dos dados disponíveis.** Nenhuma linha de código de modelagem antes disso:
o inventário é o que confirma ou refuta o regime de 20–100 talhões-safra sobre o qual todas as dez
decisões do ADR-001 foram construídas.
