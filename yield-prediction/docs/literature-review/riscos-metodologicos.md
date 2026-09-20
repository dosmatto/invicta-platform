# Riscos Metodológicos — Predição Espacial de Produtividade

> **Escopo.** Este documento cobre os itens exigidos pelas seções 16 (vazamento espacial), 17 (estratégia de validação), 18 (incerteza), 19 (explicabilidade), 33 (métricas), 34 (análise espacial do erro) e 42 (checklist anti-vazamento) do pedido original, sob os critérios das seções 45, 58 e 60.
>
> **Base de evidência.** Todo número, autor e afirmação técnica vem de `papers-database.csv` (87 estudos, `paper_id` entre colchetes). Estudos cuja leitura ficou limitada ao resumo são marcados `[X-NN, só abstract]` na primeira citação. Quando a base não cobre uma pergunta, o texto diz literalmente **"sem evidência na base revisada"** e rotula `[LACUNA]` ou `[HIPÓTESE]`.
>
> **Unidades.** Unidade interna é kg/ha; sc/ha aparece apenas como conversão (1 sc = 60 kg).
>
> **Contexto de aplicação.** Plataforma Invicta, soja, Brasil, grid de 20×20 m, previsão pré-colheita intra-talhão, regime de dados de **20–100 talhões-safra** com mapa de colheita (`PERFIL-COMPATIBILIDADE.md`).

## Convenções de rótulo

| Rótulo | Significado |
|---|---|
| `[EVIDÊNCIA]` | sustentado por estudo(s) da base, com id |
| `[HIPÓTESE]` | raciocínio plausível ainda não testado; não há estudo da base que confirme |
| `[DECISÃO → ADR-001 Dn]` | escolha já **decidida e justificada** (alternativas, evidências, consequências) na decisão `Dn` do [`ADR-001`](../decisions/ADR-001-model-strategy.md); aqui ela só é aplicada. As seções 20 e 46 do pedido exigem que decisões morem em `docs/decisions/`, então este documento **não usa `[DECISÃO]` nu** |
| `[LACUNA]` | a base revisada não responde a pergunta |
| `[CONSENSO]` / `[EVIDÊNCIA LIMITADA]` / `[RESULTADO ESPECÍFICO]` | grau de suporte dentro de `[EVIDÊNCIA]` |
| `reusa` / `novo_barato` / `infra_nova` | compatibilidade com o stack atual (item 11 do ledger) |

Não existe nenhum `[RESULTADO]` neste documento: nenhum experimento próprio foi executado até aqui.

---

## 1. Por que dividir pixels aleatoriamente infla o resultado

### 1.1 O mecanismo, em linguagem direta

Um grid de 20 m sobre um talhão de 100 ha produz cerca de 2.500 células. É tentador tratá-las como 2.500 observações independentes, sortear 80% para treino e 20% para teste e reportar o R² obtido. Esse número é quase sempre otimista, por dois motivos encadeados.

**(a) Autocorrelação espacial.** Produtividade, matéria orgânica, NDVI, declividade e CEa variam de forma contínua no espaço: duas células vizinhas de 20 m são, na prática, quase a mesma amostra medida duas vezes. Quando o sorteio aleatório coloca uma na treino e a outra na teste, o modelo já "viu" a resposta do vizinho imediato. O conjunto de teste deixa de ser independente e passa a ser uma cópia ruidosa do treino. `[CONSENSO]` — este é o argumento central de Roberts et al. `[C-02, só abstract]`, de Meyer & Pebesma `[C-05]` ("dependências entre amostras próximas resultam em avaliação enviesada e otimista demais") e é o que `blockCV` `[C-06]` foi construído para corrigir.

**(b) Memorização de vizinhança.** Modelos flexíveis (Random Forest, XGBoost, LightGBM) conseguem ajustar a superfície espacial em si — ou seja, aprender *onde* o pixel está em vez de *como* as covariáveis explicam a produtividade. A evidência mais direta disso está em `[C-01]`: um Random Forest treinado **apenas com as coordenadas X/Y** teve desempenho praticamente idêntico ao modelo "completo" com 36 preditores ópticos e ambientais. O modelo completo, portanto, estava predizendo por proximidade geográfica, não por relação ecológica. O mesmo estudo mostra que os resíduos da CV aleatória **não exibiam autocorrelação aparente** — a estrutura espacial tinha sido absorvida pelo próprio modelo —, de forma que a ausência de autocorrelação residual em uma CV aleatória **não é prova de ausência de vazamento**.

O sintoma clínico é sempre o mesmo: métricas excelentes em teste aleatório, desempenho medíocre no primeiro talhão novo.

### 1.2 Evidência quantitativa da base

Cada linha abaixo traz cultura, escala e tipo de validação na mesma linha, porque os números **não são comparáveis entre si** (seção 9 do pedido).

| id | Estudo | Cultura / escala | O que compara | Resultado |
|---|---|---|---|---|
| `[C-01]` | Ploton et al. 2020, *Nat. Commun.* | **Biomassa florestal acima do solo — NÃO é agricultura**; África central; pixel de 1 km, escala regional; 11,8 M de árvores | Random 10-fold CV vs. spatial 44-fold CV vs. buffered LOO | R² **0,53 → 0,14**; RMSPE **56,5 → 77,5 Mg/ha**. Modelo nulo (média do treino): RMSPE 82 Mg/ha. Com buffer ≥ 100 km, R² tende a zero. Variograma: AGB correlacionado até ~120 km |
| `[C-11]` | Rathore et al. 2026, *Front. Agronomy* | **Soja**, South Dakota (EUA), intra-talhão, PlanetScope 3,12 m; 3 talhões × 2 safras = 6 talhões-safra | **Leave-One-Field-Out CV** (sem CV aleatória) | R² por talhão-safra retido: **0,54 / 0,40 / 0,24 / −0,58 / −1,02 / −6,23**; RMSE **554–765 kg/ha** (≈ 9,2–12,8 sc/ha). Três dos seis piores que a média |
| `[C-12]` | Stock 2025, *Front. Remote Sens.* | **Clorofila-a marinha — NÃO é agricultura**; Mar Báltico, escala regional; 1.426 datasets | Random 10-fold CV vs. block CV com tamanhos variados | CV aleatória **subestimou o erro em 5–54%** conforme o modelo |
| `[D-12]` | Smith et al. 2026, *Sci. Rep.* | Milho e **soja**, 9 estados dos EUA, grid de treino de 30 m, 134 crop-site-years | Split interno (RFECV 5-fold) vs. validação *group-wise* por estado | Soja: R² de teste **0,90** → R² médio **0,79** (faixa 0,67–0,88) por estado. Milho: **0,87 → 0,77** (faixa 0,54–0,91), RMSE médio 1,13 Mg/ha |
| `[B-15, só abstract]` | Pereira et al. 2026, *Big Earth Data* | **Soja, Brasil (Centro-Oeste)**, escala **municipal** (não intra-talhão), Sentinel-2 | Split 70/30 por DAS vs. validação externa em estados independentes | R² **0,72 → 0,34–0,76**; RMSE **301,5 kg/ha → 168,3–491,2 kg/ha** |
| `[B-04, só abstract]` | Deines et al. 2021, *RSE* | Milho, US Corn Belt, pixel de 30 m a condado; >1 M de observações de colhedora, 2008–2018 | Validação externa contra colhedora real | r² **0,31** (pixel 30 m, sem suavização) → **0,40** (com regressão harmônica) → **0,45** (talhão) → **0,69** (condado). Random Forest treinado com ≥1.000 observações reais igualou o SCYM na amostra, mas "teve desempenho ruim quando testado em anos e locais não representados no treino" |
| `[C-14]` | Habibi, Matsui & Tanaka 2023, anais JASS (**proceedings**, revisão por pares mais leve; sem DOI) | **Soja**, 7 talhões, Gifu (Japão), 2018–2021, UAV multiespectral, intra-talhão | Random CV vs. spatial cluster CV vs. LOFO-CV, todos testados contra **um talhão independente** | Qualitativo (o extended abstract não traz R²/RMSE): modelos de CV aleatória tiveram "poor accuracy" no talhão independente; SCV e LOFO-CV ficaram "dentro das faixas de acurácia de validação" |

**Leitura honesta desta tabela.** A evidência **mais dramática** (`[C-01]`, queda de R² 0,53 → 0,14) é de **biomassa florestal, não de agricultura**, e em pixel de 1 km — a magnitude não transfere automaticamente para soja em grid de 20 m. A evidência **quantitativa mais próxima do caso Invicta** é `[C-11]` (soja, intra-talhão, 6 talhões-safra) e `[D-12]` (soja, grid 30 m, group-wise por estado). `[C-12]` quantifica a direção geral (5–54% de subestimação) mas em dado marinho. `[C-14]` é soja intra-talhão com o desenho experimental exatamente certo, mas é resumo de congresso e só traz conclusão qualitativa. **A base não contém nenhum estudo que meça a inflação de R² por split aleatório em soja no Brasil em grid de 20 m** — `[LACUNA]`.

`[EVIDÊNCIA LIMITADA]` Apesar disso, a direção do efeito é consistente em **todos** os estudos da base que testam os dois esquemas lado a lado (`[C-01]`, `[C-12]`, `[D-12]`, `[B-15]`, `[B-04]`, `[C-14]`): a validação espacialmente consciente sempre reporta desempenho **igual ou pior** que o split aleatório, nunca melhor. Nenhum estudo da base encontrou o contrário.

### 1.3 Por que o risco é agudo especificamente neste projeto

Três agravantes somados:

1. **A razão pixels/unidades independentes é extrema.** 20–100 talhões-safra × ~2.500 células = 50.000 a 250.000 linhas, mas apenas 20–100 unidades verdadeiramente independentes. Um split aleatório de linhas produz um "n" nominal 2.500× maior que o n efetivo.
2. **O alvo passa por interpolação.** O mapa de colheita limpo pela plataforma é interpolado por IDW antes de virar grid. A interpolação **cria** correlação entre células vizinhas que não existe no dado bruto (ver §5 e §6).
3. **Várias features já são produtos interpolados** (krigagem de argila, MO, pH, P, K; CEa; MDE reamostrado). Cada uma delas é uma superfície suave, o que amplifica a capacidade do modelo de "adivinhar posição" (§4.5 e §6).

---

## 2. O debate: spatial CV é pessimista demais ou necessária?

A base contém as duas posições, e seria desonesto apresentar só uma.

**Posição A — spatial CV é necessária.** Roberts et al. `[C-02, só abstract]`: *"block cross-validation is nearly universally more appropriate than random cross-validation"*. Ploton et al. `[C-01]`: *"spatial validation methods accounting for SAC reveal quasi-null predictive power"*. Meyer & Pebesma `[C-05]` vão além e afirmam que publicar mapas preditos sem indicação confiável de erro local e global "não é congruente com integridade científica básica".

**Posição B — spatial CV é enviesada.** Wadoux et al. 2021 `[C-03]`, em experimento numérico próprio (biomassa, Amazônia, escala regional), contestam diretamente Ploton, Roberts e Meyer/Pebesma: sob amostragem **aleatória ou sistemática**, CV espacial e buffered-LOO **superestimaram** o erro (viés de +10 a +15 Mg/ha no RMSE), enquanto a CV padrão ficou praticamente sem viés nesse cenário. Sob amostragem **em cluster**, o quadro se inverte: a CV padrão subestimou o erro (viés de −10 Mg/ha) e a CV espacial teve viés menor. A conclusão dos autores é dura: *"spatial cross-validation methods have no theoretical underpinning"*, e a recomendação é amostragem probabilística com inferência *design-based*.

**Reconciliação.** Milà et al. `[C-08, só abstract]` e Linnenbrink et al. `[C-09]` oferecem a saída técnica: o desempenho de um esquema de CV depende de três fatores — **a área de predição (interpolação vs. extrapolação geográfica), o padrão de amostragem e a autocorrelação da paisagem**. Nos testes de `[C-08]`, a LOO não espacial deu boas estimativas em paisagens com alcance curto de autocorrelação **ou** quando se estimava interpolação com amostras aleatórias; a buffered-LOO deu estimativas realistas ao estimar acurácia **em novas áreas de predição**, mas "geralmente superestimou erros de interpolação geográfica" — dando razão parcial a Wadoux. O NNDM LOO foi o único método confiável em **todos** os cenários testados. `[C-09]` tabula o mesmo trade-off: CV aleatória k-fold é "excessivamente otimista para dados clusterizados"; CV espacial k-fold é "excessivamente pessimista" e superestima o erro de mapeamento.

Roberts `[C-02]` já advertia que blocagem mal dimensionada pode "induzir involuntariamente extrapolações" e inflar o erro de interpolação — ou seja, **o tamanho do bloco importa mais que a escolha binária espacial-vs-aleatório**. Isso é confirmado experimentalmente por Stock `[C-12]`: *"the most important methodological choice was the block size"*, acima da forma do bloco, do número de folds e da atribuição.

### `[DECISÃO → ADR-001 D5]` Posição adotada neste projeto

**O objetivo declarado do produto é prever um talhão e/ou uma safra que o modelo nunca viu** (seção 61 do pedido: "Quanto este talhão deverá produzir?" para um talhão comercial qualquer). Isso é **extrapolação geográfica**, não interpolação dentro de uma área amostrada. Pela própria formulação de `[C-08]`/`[C-09]`, é exatamente o cenário em que a CV espacialmente consciente está correta e a CV aleatória é otimista demais.

Portanto:

1. **A métrica oficial do projeto será a de validação por grupo (talhão / safra / fazenda), não a de split aleatório.** O split aleatório permanece, mas só como benchmark de referência e como *detector de vazamento* (§3.1).
2. **A crítica de Wadoux `[C-03]` é aceita como ressalva, não como refutação:** ela vale plenamente quando o objetivo é interpolar dentro de uma área já amostrada. Se, no futuro, a plataforma oferecer um produto de "preencher lacunas dentro de um talhão já colhido parcialmente", esse produto deve ser avaliado com CV aleatória ou NNDM, e não com LOFO.
3. **Uma queda de métrica ao passar de random para LOFO não será tratada como "modelo ruim"**, e sim como estimativa mais honesta do que esperar em campo (critério da seção 60: "ausência de leakage" e "validação realista" valem mais que "menor RMSE").

---

## 3. As cinco validações da seção 17

Visão geral antes do detalhe:

| # | Esquema | Pergunta que responde | Implementação | Viabilidade com 20–100 talhões-safra |
|---|---|---|---|---|
| 1 | Random split | "Quanto o modelo consegue ajustar, no limite otimista?" | `KFold(shuffle=True)` | Sempre viável — mas **nunca** como métrica final |
| 2 | GroupKFold por talhão | "Generaliza para outro talhão do mesmo conjunto?" | `GroupKFold(groups=talhao_id)` | Viável desde ~10 talhões — `[HIPÓTESE]` deste projeto, a base não fixa nº mínimo de grupos `[LACUNA]` |
| 3 | Leave-One-Field-Out | "Generaliza para um talhão completamente desconhecido?" | `LeaveOneGroupOut(groups=talhao_id)` | Viável, mas com variância altíssima em n pequeno |
| 4 | Leave-One-Year-Out | "Generaliza para uma safra não vista?" | `LeaveOneGroupOut(groups=safra)` | **Frágil**: poucas safras (ver alerta de `[C-11]`) |
| 5 | Fazenda externa | "Generaliza para outro ambiente/manejo?" | Hold-out por `fazenda_id`, avaliado uma única vez | Só quando houver ≥2 fazendas com dado suficiente (piso operacional "≥2 fazendas com ≥5 talhões-safra" — `[HIPÓTESE]` deste projeto, ver §3.5) |

### 3.1 Validação 1 — Random split (somente benchmark)

**O que mede.** O teto otimista: quanto o modelo consegue ajustar quando o teste é espacialmente vizinho do treino. Não mede generalização.

**Como implementar.** `sklearn.model_selection.KFold(n_splits=5, shuffle=True, random_state=…)` sobre as linhas do grid. `reusa`/`novo_barato` — scikit-learn é CPU-only e leve, mas ainda não está nas libs pinadas do backend.

**Armadilhas.** (i) Reportá-lo como resultado do projeto. Grande parte da literatura de sensoriamento remoto faz exatamente isso: `[B-01, só abstract]` (milho, intra-talhão, split aleatório de metade das observações nos mesmos talhões/safras), `[B-07, só abstract]` (soja, intra-talhão, esquema não detalhado no abstract). O próprio `[B-10, só abstract]` (soja, intra-talhão, grid de 10 m, 24.282 células, R² subindo de 0,26 em VE/VC para >0,70 em R4/R5) reconhece o limite: "trabalho adicional precisa ser feito para avaliar a capacidade do modelo de prever produtividade de soja em talhões não usados no treino". (ii) Comparar o R² de um split aleatório com o R² de outro estudo em validação espacial.

**Uso defensável.** Duas funções legítimas:
- *Teto de referência*: a diferença `R²_random − R²_LOFO` é a estimativa própria do projeto para a magnitude da inflação — o número que `[C-01]`, `[C-12]` e `[D-12]` mediram em outros contextos.
- *Detector de vazamento não espacial*: se o R² aleatório estiver absurdamente alto (p.ex. >0,97 em pixel), a suspeita imediata não é "modelo bom", e sim feature derivada do alvo (§4.7). `[H-04]` é ilustração direta: um Random Forest obteve R²=0,9949 em nível agregado "sem realismo espacial", enquanto o mapa continuava com resíduo espacialmente estruturado.

### 3.2 Validação 2 — GroupKFold por talhão

**O que mede.** Generalização para outros talhões **do mesmo pool**, com todos os folds usados e o erro médio calculado sobre várias combinações — menos variância que LOFO.

**Como implementar.** `sklearn.model_selection.GroupKFold(n_splits=k)` com `groups = talhao_id`. Regra dura: **o grupo é o talhão, não o talhão-safra**, para que o mesmo talhão em safras diferentes nunca caia dos dois lados. Se houver interesse em avaliar talhão-safra, use `GroupKFold` aninhado com o grupo mais grosseiro externo.

**Armadilhas.**
- **Grupo errado.** Agrupar por `talhao_safra_id` (e não por `talhao_id`) reintroduz vazamento pelo histórico do próprio talhão (§4.6) e pelas camadas fixas do talhão (CEa, MDE, fertilidade krigada), que são idênticas entre safras.
- **Talhões contíguos.** Dois talhões vizinhos da mesma fazenda compartilham solo, relevo e manejo. `[C-02]` alerta que blocos mal desenhados podem não separar de fato. Mitigação: `GroupKFold` por `fazenda_id` como esquema adicional, ou blocos espaciais dimensionados por variograma (§3.6).
- **Desbalanceamento de tamanho.** `GroupKFold` balanceia contagem de amostras, então um talhão de 300 ha domina um fold. Ponderar a métrica por talhão (média das métricas por talhão, não métrica do pool de pixels) evita que o resultado seja o de um único talhão grande.

**O que a base mostra.** `[D-12]` é o análogo mais próximo com número: validação *group-wise* por estado derrubou o R² da soja de 0,90 (teste interno) para **0,79** médio (0,67–0,88) e o do milho de 0,87 para **0,77** (0,54–0,91). É uma queda moderada — bem menor que a de `[C-01]` — e é a melhor referência de expectativa realista, embora seja EUA, grid de 30 m, e o grupo seja "estado", não "talhão".

**Viabilidade.** Com 20–100 talhões-safra e, digamos, 15–40 talhões distintos, `GroupKFold(n_splits=5)` é viável e é **o esquema com melhor relação robustez/custo do conjunto**. `reusa`.

### 3.3 Validação 3 — Leave-One-Field-Out (LOFO-CV)

**O que mede.** Exatamente o caso de uso do produto: treinar em N−1 talhões e prever o talhão N, completamente desconhecido.

**Como implementar.** `sklearn.model_selection.LeaveOneGroupOut()` com `groups = talhao_id`. Reportar a **distribuição** das métricas por talhão (mediana, faixa, quantos talhões ficaram piores que o modelo nulo), não apenas a média.

**Armadilhas.**
- **R² negativo é o resultado esperado em parte dos folds, não um bug.** Em `[C-11]` (soja, intra-talhão, LOFO-CV), 3 de 6 talhões-safra tiveram R² negativo (−0,58; −1,02; −6,23), ou seja, piores que prever a média. Os autores atribuem isso a efeitos de retrotransformação e à baixa transferibilidade entre talhões com variabilidade extrema (o talhão Miner estava em seca).
- **Média de R² entre folds é enganosa.** Um único R² de −6,23 arrasta qualquer média. Preferir mediana + RMSE, que em `[C-11]` foi bem-comportado (554–765 kg/ha, ≈ 9,2–12,8 sc/ha) mesmo onde o R² despencou. RMSE e R² discordam porque R² é relativo à variância **daquele** talhão: um talhão homogêneo tem variância baixa e produz R² ruim mesmo com erro absoluto pequeno.
- **Adicionar features não necessariamente ajuda sob LOFO.** `[C-11]` reporta que adicionar índices de solo e variáveis topográficas ao modelo de índices de vegetação **não** melhorou o desempenho — introduziu ruído e sobreajuste às condições locais. Este é um resultado negativo importante para o projeto, que planeja exatamente empilhar solo + CEa + relevo sobre o espectral.
- **Métrica agregada no pool de pixels** mascara a variância entre talhões. Reportar por talhão.

**O que a base mostra.** `[C-11]` é a única evidência quantitativa direta (soja, intra-talhão, LOFO-CV, XGBoost + SHAP, PlanetScope 3,12 m, MDE de 1 m). `[C-14]` confirma qualitativamente que LOFO-CV é "especificamente apropriada para prever produtividade fora do domínio espacial do modelo". `[B-04]` reforça pelo negativo: Random Forest treinado com ≥1.000 observações reais de colhedora "teve desempenho ruim quando testado em anos e locais não representados no treino".

**Viabilidade.** Viável, mas com o alerta explícito de `[C-11]`: os próprios autores declaram que um dataset de **2–3 safras é insuficiente para uma LOFO-CV robusta**. Com 20–100 talhões-safra, os folds serão poucos e a variância da estimativa será alta. `[DECISÃO → ADR-001 D5]`: reportar LOFO-CV sempre acompanhada de (i) número de folds, (ii) distribuição completa, (iii) comparação com o modelo nulo (média do treino) — que é o mesmo controle usado por `[C-01]`. `reusa`.

### 3.4 Validação 4 — Leave-One-Year-Out (LOYO-CV)

**O que mede.** Transferência temporal: treinar em safras passadas e prever a safra corrente, que é o modo operacional real do produto.

**Como implementar.** `LeaveOneGroupOut()` com `groups = safra`. Atenção: é o único esquema que reproduz o cenário de uso, porque em produção o modelo **sempre** prevê um ano que não estava no treino.

**Armadilhas.**
- **Clima do ano de teste vazando para dentro das features.** Este é o erro documentado em `[A-03]`. O estudo acoplou APSIM a ML no US Corn Belt (milho, escala de condado, 10.016 observações, 293 condados, 1984–2018) com anos-teste 2012, 2017 e 2018, e reduziu o RMSE em **7–20%** (RMSE de 2018: 959–1.482 kg/ha no benchmark → 883–1.094 kg/ha no híbrido; no ano seco de 2012 a melhoria foi de 5–43%). **Ressalva obrigatória: as simulações APSIM usadas como entrada do ML utilizaram o clima REAL completo do ano de teste.** Os próprios autores escrevem: *"the weather will be unknown"* na aplicação real. O ganho relatado, portanto, é um teto otimista, não uma estimativa pré-colheita. Qualquer replicação na Invicta que use clima acumulado até a colheita comete o mesmo vazamento temporal.
- **Poucas safras.** `[C-11]` afirma textualmente que 2–3 safras são insuficientes para validação robusta no seu contexto (LOFO). `[HIPÓTESE]` Por analogia direta de regime de dados, o mesmo vale para LOYO: com 2–3 safras, cada fold treina em 1–2 safras e a estimativa é dominada pela idiossincrasia do ano. **O número mínimo de safras para uma LOYO robusta não foi encontrado explicitamente na base revisada — `[LACUNA]`.**
- **Ano extremo domina o resultado.** Ver §7.
- **Tendência tecnológica.** Em `[A-03]`, a variável mais importante por permutation importance foi a tendência de produtividade (`yield_trend`). Em escala intra-talhão e com 2–5 safras, uma variável de tendência é indistinguível de um efeito de ano e tende a virar vazamento disfarçado. `[DECISÃO → ADR-001 D2]`: não usar tendência temporal explícita no MVP.

**Viabilidade.** **Frágil no regime atual.** `[DECISÃO → ADR-001 D5]`: implementar LOYO desde o início (o custo é uma linha de código), mas tratá-la como diagnóstico qualitativo — "o modelo colapsa quando muda o ano?" — e não como métrica com precisão estatística, até que existam ≥4 safras. **O limiar de 4 é `[HIPÓTESE]` deste projeto, por analogia direta com `[C-11]` (que declara 2–3 safras insuficientes para LOFO); a base não traz o número `[LACUNA]`.** `reusa`.

### 3.5 Validação 5 — Fazenda externa

**O que mede.** Generalização para outro ambiente completo: solo, clima local, cultivar, calendário e prática de manejo diferentes — e, crucialmente, outra colhedora, com outra calibração e outro pipeline de erro no alvo (§5).

**Como implementar.** Hold-out por `fazenda_id`, separado **antes de qualquer processamento** e avaliado **uma única vez**, ao final. Se for reavaliado a cada iteração de modelagem, deixa de ser externo e vira conjunto de validação (vazamento de seleção, §4.3).

**Armadilhas.**
- **Reuso.** Cada olhada no conjunto externo consome sua independência.
- **n=1.** Com uma única fazenda externa, a métrica é uma amostra de tamanho 1 na dimensão que mais importa. Reportar como estudo de caso, com faixa, não como número pontual.
- **Confundir "externo" com "distante".** `[C-04, só abstract]` e `[C-05]` mostram que o que importa é a dissimilaridade no **espaço de preditores**, não a distância geográfica: uma fazenda a 400 km com solo e clima parecidos pode ser mais fácil que um talhão vizinho com textura diferente. Por isso a Área de Aplicabilidade (§3.6) deve acompanhar o teste externo.

**O que a base mostra.** `[B-15]` é a referência direta, e é brasileira: soja, Centro-Oeste, Sentinel-2, escala **municipal**, R² caindo de 0,72 (treino/teste) para **0,34–0,76** em estados independentes, com RMSE passando de 301,5 kg/ha para **168,3–491,2 kg/ha**. Note que a faixa externa inclui valores *melhores* que o interno — um estado externo pode ser mais fácil que a média do treino; isso reforça reportar faixa e não média. **Ressalva de escala: `[B-15]` é municipal, não intra-talhão; não serve de benchmark de precisão de pixel.** `[B-04]` reforça a mesma direção em escala de pixel.

**Viabilidade.** Depende do cadastro. `[DECISÃO → ADR-001 D5]`: se houver ≥2 fazendas com ≥5 talhões-safra cada, reservar a menor como hold-out externo desde o dia 1. Caso contrário, registrar como `[LACUNA]` explícita no relatório de validação. **`[HIPÓTESE]`: "≥2 fazendas com ≥5 talhões-safra" é piso mínimo escolhido por este projeto; a base não traz tamanho mínimo de conjunto externo `[LACUNA]`.** `reusa`.

### 3.6 Complementos técnicos

Estes três não substituem as cinco validações; qualificam-nas.

**(a) Dimensionamento de bloco por variograma.** `[EVIDÊNCIA]` `[C-12]` mostra experimentalmente que *"the most important methodological choice was the block size"*, acima de forma, número de folds e atribuição. A abordagem primária recomendada é analisar a autocorrelação espacial dos preditores por **correlograma e variograma** (no caso de `[C-12]`, os correlogramas mostraram alcance mais nítido que os variogramas); a secundária é iterar sobre uma faixa plausível de tamanhos e observar como a estimativa de erro muda com a distância de separação. `[C-06]` embute exatamente essa função (estimar o alcance de autocorrelação das covariáveis candidatas para informar o tamanho do bloco). `[C-01]` ilustra a ordem de grandeza envolvida: AGB tinha correlação até ~120 km e as covariáveis climáticas/topográficas, 250–500 km — o bloco de 150 km foi escolhido acima do alcance do alvo.
> **Compatibilidade:** `reusa`. `pykrige` já está pinado no backend e é usado em `interp.py`; o variograma empírico do mapa de colheita limpo pode ser calculado com as mesmas rotinas. Um alerta operacional: `[C-12]` também mostra que métodos espaciais **falharam** em selecionar contra modelos sobreajustados em mais de 50% dos casos — CV espacial reduz o viés da estimativa de erro, mas **não é garantia contra overfitting**.

**(b) kNNDM / NNDM.** `[CONSENSO]` `[C-08]`/`[C-09]`: em vez de escolher arbitrariamente entre aleatório e espacial, o método **casa a distribuição de distâncias teste↔treino durante a CV com a distribuição real predição↔treino** esperada na aplicação. NNDM LOO foi o único método confiável em todos os cenários de `[C-08]`, mas é leave-one-out e não escala; kNNDM `[C-09]` resolve isso — para 4.000 pontos de treino clusterizados, reduziu o tempo de "4,8 dias para 1,2 minuto" em relação ao NNDM LOO, com desempenho semelhante. Parâmetros práticos de `[C-09]`: k ≥ 10 é melhor para amostras aleatórias/regulares, k = 4–6 para dados clusterizados. Limitações declaradas pelos autores: o método é "puramente baseado em distâncias geográficas e ignora a localização dos pontos de treino ou a direção das distâncias"; **exige conhecer a área de predição antes de treinar**; e perde poder explicativo quando a área de predição difere muito da de treino — na simulação de escala continental, a estatística W explicou apenas **28% da variação do RMSE**, contra mais de 60% em escala nacional (isto é fração de variação do RMSE, **não** R² de predição).
> **Compatibilidade:** `novo_barato`. As implementações de referência (`CAST`, `blockCV`) são pacotes R, mas o algoritmo é reprodutível com `numpy`/`scipy`/`scikit-learn` sem GPU. Em Python nativo existem `spatial-kfold`, `spacv` e `verde.BlockKFold`. `[DECISÃO → ADR-001 A3]` (decisão adiada): não é prioridade de MVP; entra como refinamento da Fase 3, depois que GroupKFold/LOFO estiverem estabelecidos.

**(c) Área de Aplicabilidade (AOA) e índice de dissimilaridade (DI).** `[C-04]` define o DI como a distância mínima ao dado de treino no **espaço multidimensional de preditores**, com cada preditor ponderado pela sua importância no modelo; a AOA é a região onde o DI fica abaixo de um limiar derivado (o DI máximo dos dados de treino, com outliers removidos, obtido via CV). O achado central das simulações: *"the prediction error within the AOA is comparable to the cross-validation error... cross-validation error does not apply outside the AOA"* — e isso vale tanto para treino distribuído aleatoriamente quanto para treino clusterizado com CV espacial. `[C-05]` recomenda literalmente "acinzentar" (*gray out*) as áreas fora da AOA em mapas publicados, e critica a estatística de acurácia única e global, que "obscurece quaisquer diferenças, por exemplo, entre continentes ou zonas climáticas" — o análogo direto aqui é: **uma métrica única para a plataforma inteira não diz nada sobre a qualidade no talhão X**.
> **Compatibilidade:** `novo_barato` (`numpy`/`scipy`). **Este é o complemento de maior valor de produto de toda a seção**: é o mecanismo técnico que permite à interface dizer "não tenho suporte de dados para prever este talhão" em vez de emitir um número sem base. `[DECISÃO → ADR-001 D9]` (item 5): incluir DI/AOA no MVP como gate de exibição, não como refinamento futuro.

### 3.7 Viabilidade consolidada no regime de 20–100 talhões-safra

| Esquema | n de folds esperado | Risco principal | Veredito | Compat. |
|---|---|---|---|---|
| Random split | 5 | Inflação; ser confundido com resultado | Só como benchmark e detector | `reusa` |
| GroupKFold por talhão | 5 | Talhões contíguos no mesmo fold | **Métrica primária do MVP** | `reusa` |
| LOFO-CV | 15–40 | Variância alta; R² negativo por fold | Métrica secundária, reportada como distribuição | `reusa` |
| LOYO-CV | 2–5 | Poucas safras (alerta de `[C-11]`); ano extremo domina | Diagnóstico qualitativo até ≥4 safras (limiar `[HIPÓTESE]`, §3.4) | `reusa` |
| Fazenda externa | 1 | Reuso; n=1 | Estudo de caso final, avaliado uma vez | `reusa` |
| Bloco por variograma | — | Bloco mal dimensionado (`[C-12]`) | Complemento; usa `pykrige` existente | `reusa` |
| kNNDM | — | Exige conhecer a área de predição | Fase 3 | `novo_barato` |
| AOA / DI | — | Limiar arbitrário | **MVP — gate de exibição** | `novo_barato` |

`[EVIDÊNCIA LIMITADA]` Nenhum estudo da base combina LOFO-CV **e** LOYO-CV em soja no Brasil em grid de 20 m — `[LACUNA]`. Os regimes mais próximos (`[C-11]`, soja EUA; `[C-14]`, soja Japão) são de outros países.

---

## 4. Outras fontes de vazamento

`[RESULTADO ESPECÍFICO]` O enquadramento geral vem de um único levantamento da base, Kapoor & Narayanan `[C-07, só abstract]`: levantamento sistemático que encontrou vazamento em **17 campos científicos, afetando 294 artigos**, e propõe uma **taxonomia de oito tipos**, de "erros de livro-texto" a problemas de pesquisa em aberto. O resultado mais contundente é o estudo de reprodutibilidade de predição de guerra civil: corrigidos os erros de vazamento, "modelos complexos de ML não têm desempenho substantivamente melhor que modelos de regressão logística de décadas atrás". A ferramenta proposta pelos autores são *model info sheets* preenchidas por tipo de vazamento — que é exatamente o formato do checklist da §11.

**Nota de integridade:** o texto completo de `[C-07]`, com a descrição detalhada de cada um dos oito tipos, não foi aberto na pesquisa (o resumo confirma os números-chave: 17 campos, 294 artigos, 8 tipos). Os oito casos concretos abaixo são a **aplicação desta taxonomia geral ao pipeline da Invicta**, feita neste documento; a atribuição de cada caso a um tipo nomeado da taxonomia original é `[HIPÓTESE]`, não citação.

### 4.1 Imagens posteriores à data da previsão

**Como acontece nesta plataforma.** O robô noturno de `msr.py`/`cbers.py` busca cenas novas continuamente e grava camadas por talhão, gerando uma série temporal completa da safra. Ao montar o dataset de treino a partir do banco, o caminho de menor esforço é agregar "todos os índices da safra" (máximo de NDVI, integral do NDVI, data do pico, taxa de senescência). Metade dessas features só existe **depois** da colheita. Um modelo treinado assim reporta métricas excelentes e é inútil para prever em R3.

**Por que o risco é real e não teórico.** É exatamente o erro que `[A-03]` cometeu e declarou: as simulações APSIM alimentadas ao ML usaram o clima real completo do ano-teste, e os autores registram que "na prática o clima será desconhecido" — o ganho de 7–20% de RMSE é, portanto, um teto otimista. O mesmo vale para índices espectrais: `[B-10]` mostra que o R² da soja sobe de 0,26 em VE/VC para >0,70 em R4/R5; usar imagens de R6 para "prever" em R3 importa esse salto inteiro como vazamento.

**Como evitar.**
- Toda linha do dataset carrega um campo obrigatório `data_previsao`. A montagem de features filtra `data_imagem <= data_previsao` **na consulta**, não em pós-processamento.
- Produzir um modelo **por janela de antecedência** (p.ex. R1, R3, R5), cada um com seu próprio corte temporal, e reportar a curva de acurácia × antecedência. `[LACUNA]`: nenhum estudo da base traz curva contínua de R²/RMSE por dia-antes-da-colheita para soja intra-talhão; `[B-10]` é o mais próximo, com 6 pontos de estádio.
- Teste automático: para cada linha, `max(data_imagem) <= data_previsao` (§11).

### 4.2 Normalização e estatísticas calculadas antes do split

**Como acontece nesta plataforma.** Grids são armazenados gzipados por talhão no Supabase. O caminho natural é carregar tudo, concatenar num array, normalizar (z-score, min-max, ou remoção de outliers por percentil) e só então dividir. Média e desvio calculados sobre o conjunto inteiro carregam informação do teste para dentro do treino. O caso mais grave é normalizar o **alvo** por percentil global.

**Como evitar.**
- Toda transformação com parâmetro aprendido entra num `sklearn.pipeline.Pipeline`, que é ajustado **dentro** de cada fold de CV. Nunca `scaler.fit(X_completo)`.
- Modelos de árvore (RF, XGBoost, LightGBM — os candidatos principais do MVP) são invariantes a escala monotônica, o que reduz, mas não elimina, o risco: imputação de faltantes, *target encoding* de categóricas (§4.7) e winsorização continuam sendo parâmetros aprendidos.
- Teste automático: comparar média/desvio das features do fold de treino com as do dataset completo; se coincidirem exatamente, a normalização vazou (§11).

### 4.3 Seleção de features e de hiperparâmetros fora de CV aninhada

**Como acontece nesta plataforma.** Rodar eliminação recursiva de features e busca de hiperparâmetros sobre o dataset todo, escolher o melhor conjunto, e **depois** rodar o LOFO-CV para reportar. O LOFO já nasce contaminado: o conjunto de features foi escolhido olhando os talhões de teste.

**Por que importa aqui.** `[D-12]` reduziu 128 features iniciais para 20 (milho) e 13 (soja) por RFECV com 5-fold — e reporta separadamente a validação *group-wise* por estado. `[C-11]` reporta que adicionar índices de solo e topografia **piorou** o resultado sob LOFO, o que só é detectável se a seleção for avaliada dentro do esquema de validação correto. Combinados, os dois indicam que a seleção de features é uma decisão que muda de resposta conforme o esquema de validação — logo, precisa estar **dentro** dele.

**Como evitar.**
- CV aninhada: loop externo `LeaveOneGroupOut`/`GroupKFold` (estimativa de desempenho), loop interno `GroupKFold` sobre os talhões de treino (seleção + hiperparâmetros). Em scikit-learn: `GridSearchCV`/`RandomizedSearchCV` com `cv=GroupKFold(...)` **dentro** de `cross_val_score(..., cv=LeaveOneGroupOut(), groups=...)`.
- Custo: o loop aninhado multiplica o tempo de treino. Com CPU-only no Render *standard*, isso é uma restrição real. `[DECISÃO → ADR-001 D1]` (protocolo, item 3): manter o espaço de busca pequeno e documentado (poucos hiperparâmetros, grade curta) em vez de abandonar o aninhamento.
- Registrar quantas configurações foram avaliadas. Comparar 200 variantes e reportar a melhor sob LOFO é seleção sobre o teste, mesmo com a mecânica correta.

### 4.4 Krigagem de solo/CEa e interpolação IDW da colheita usando pontos da área de teste

**Como acontece nesta plataforma.** Este é o vazamento mais específico e mais provável de passar despercebido, porque acontece **antes** de qualquer código de ML:

- `interp.py` faz krigagem ordinária automática dos laudos de solo com validação cruzada LOO, cobrindo o talhão inteiro. Se o modelo de variograma e os pesos forem ajustados usando **todos** os pontos do talhão e o grid resultante for usado como feature, então as células de teste receberam valor calculado a partir de pontos que, num LOFO, deveriam estar fora. Quando o grupo é o talhão inteiro, esse caso específico não gera vazamento **entre** grupos; mas gera se a krigagem cruzar fronteiras de talhão (pontos de um talhão influenciando o mapa do vizinho).
- `colheita.py` faz interpolação IDW dos pontos de colhedora para gerar o alvo em grid. Toda célula do alvo é uma média ponderada de pontos vizinhos, o que **cria** correlação entre células adjacentes. Se qualquer avaliação for feita com split aleatório de células, o alvo do teste é literalmente uma combinação linear de pontos que também formaram o alvo do treino.
- O filtro MapFilter local anisotrópico usa vizinhança espacial — mesma lógica.

**Como evitar.**
- `[DECISÃO → ADR-001 D5, D2]` **A unidade de split é o talhão, e a interpolação nunca cruza fronteira de talhão.** Com essa regra, krigagem e IDW ficam contidas dentro de um grupo e não vazam entre folds. Validar explicitamente que a krigagem de `interp.py` é executada por talhão e não sobre a fazenda inteira.
- Quando houver avaliação em escala de célula (p.ex. para a Validação 1 ou para um futuro produto de interpolação), refazer a interpolação **dentro de cada fold**, usando apenas os pontos do fold de treino — e aceitar o custo computacional.
- Registrar no *lineage* de cada camada quais pontos de amostragem a geraram, para que o teste de vazamento possa checar interseção com o conjunto de teste (§11).
- `[LACUNA]` Nenhum estudo da base testa explicitamente vazamento por interpolação (mapa krigado como feature). O risco é inferido, não medido. `[HIPÓTESE]`

### 4.5 Coordenadas X/Y como feature

**Como acontece nesta plataforma.** O grid já vem com coordenadas. Incluí-las (ou incluir proxies como "distância ao centroide do talhão", "linha/coluna do grid", ou identificadores ordinais de célula) é trivial e costuma **subir** todas as métricas de split aleatório.

**Por que é armadilha.** `[RESULTADO ESPECÍFICO]` `[C-01]`: o modelo RF treinado apenas com X/Y teve desempenho quase idêntico ao modelo com 36 covariáveis reais. Sob split aleatório isso parece sucesso; sob validação espacial, o modelo X/Y não tem nada a dizer sobre um talhão novo, porque as coordenadas do talhão novo estão fora do domínio de treino.

**Nuance importante — quando posição é legítima.** `[C-10, só abstract]` (RFsp) propõe justamente usar distâncias-buffer aos pontos de observação como covariáveis, e mostra que o resultado é "igualmente acurado e não enviesado" comparado a krigagem — **empate, não superioridade**. Os próprios autores ressalvam: "para muitos conjuntos de dados, especialmente os com menor número de pontos e covariáveis e relações quase lineares, a geoestatística baseada em modelo ainda pode levar a predições mais acuradas que o RFsp". O regime da Invicta (poucos talhões-safra, krigagem já disponível via `pykrige`) é exatamente o caso da ressalva.

**Como evitar.**
- `[DECISÃO → ADR-001 D2]` (item 6) **Coordenadas absolutas, identificadores de célula e `talhao_id` numérico ficam fora do conjunto de features do MVP.**
- Variáveis de posição **relativa e agronomicamente interpretável** são admitidas como hipótese de trabalho, e não são o mesmo objeto que X/Y absoluto: distância à borda do talhão (usada em `[D-12]`), posição na paisagem via TWI/curvatura, elevação relativa. **`[HIPÓTESE]` deste projeto:** que elas transfiram para um talhão novo. **Nenhum estudo da base mede isso `[LACUNA]`** — `[C-01]` sustenta a metade negativa (o modelo só-posição empata com o completo) e não trata de borda, curvatura ou elevação relativa. Como são superfícies suaves dentro do talhão (§6), a hipótese é testada pelo item **B7** do checklist da §11, sob LOFO, contra o mesmo modelo sem elas.
- Teste automático: rodar um modelo só com as features suspeitas de posição; se seu desempenho se aproximar do modelo completo, há dependência de posição (§11) — é o teste que `[C-01]` executou.

### 4.6 Histórico de produtividade do próprio talhão

**Como acontece nesta plataforma.** `colheita.py` já produz mapa de colheita limpo por safra. Usar a média da safra anterior (ou o mapa inteiro da safra anterior, célula a célula) como feature é a coisa mais natural do mundo — e é também o preditor mais forte disponível.

**O que a base diz.** `[EVIDÊNCIA]` `[D-04]` (Maestrini & Basso 2018, intra-talhão, milho/soja/trigo/algodão): para zonas **estáveis**, o histórico de produtividade do próprio talhão é o melhor preditor do padrão espacial — **mas não para soja**, onde NDVI pós-fato venceu. `[D-10, só abstract]` (768 campos, 5.520 mapas, intra-talhão) mostra que a distribuição de produtividade é negativamente assimétrica em todas as quatro culturas (p<0,05), de modo que algoritmos de estabilidade baseados em desvio-padrão são enviesados, e que o ganho de confiabilidade da classificação de zona com mais anos de histórico é "modesto" — sem limiar numérico.

**Onde está o vazamento.** Não está em usar o histórico *per se*, e sim em três descuidos:
1. Usar a safra **corrente** (mesma que se quer prever) como histórico. Vazamento direto.
2. Agrupar a CV por `talhao_safra_id` em vez de `talhao_id`: o talhão A em 2023 fica no treino e o talhão A em 2024 no teste, e o histórico faz a ponte.
3. Avaliar com LOFO um modelo que depende de histórico: um talhão novo **não tem** histórico, então a feature fica ausente ou imputada, e a métrica de LOFO mede algo diferente do que o produto fará.

**Como evitar.**
- `[DECISÃO → ADR-001 D9]` (item 3) Dois modelos declarados e avaliados separadamente: **modelo cold-start** (sem histórico, avaliado por LOFO — é o que atende um talhão novo) e **modelo com histórico** (avaliado por LOYO dentro dos talhões que têm ≥2 safras). Nunca reportar a métrica do segundo como se fosse do primeiro.
- Feature de histórico sempre defasada: só safras estritamente anteriores a `data_previsao`.
- Nota parcialmente animadora de `[D-10]`: como o ganho de anos adicionais é "modesto", não é preciso esperar 5+ safras para extrair sinal de estabilidade — mas isso também significa que o histórico não vai resolver o cold start.

### 4.7 Features derivadas do alvo

**Como acontece nesta plataforma.** Casos concretos plausíveis:
- Zonas de manejo (MEAP) construídas usando mapas de colheita passados, e depois usadas como feature categórica.
- Classificação de estabilidade (zona estável-alta / estável-baixa / instável) derivada do alvo histórico.
- *Target encoding* de categóricas de alta cardinalidade (cultivar, unidade de mapeamento de solo, zona) calculado sobre o dataset completo. `[D-07, só abstract]` (Smidt et al. 2016, **soja**, EUA, escala de talhão) mostra que "soil map unit" é a variável mais importante em RF quando os dados são agrupados entre campos — ou seja, é exatamente o tipo de categórica que se vai querer codificar, e portanto o ponto onde o *target encoding* vai vazar.
- Qualquer estatística do alvo do próprio talhão (média, percentis) entrando como feature — o que inclui o caso do §4.8.

**Como evitar.**
- Regra: toda feature precisa de *lineage* declarado (seção 26 do pedido) com um campo booleano `derivada_do_alvo`. Se verdadeiro, a feature só entra em modelo cujo esquema de validação isole o alvo que a gerou.
- *Target encoding* calculado **dentro** do fold de treino (`category_encoders` com CV interna, ou codificação nativa de categóricas de LightGBM, que não usa a média do alvo global).
- Zonas de manejo: usar a versão derivada apenas de solo/CEa/relevo (sem colheita) como feature; a versão derivada de colheita fica fora do MVP, ou entra apenas no modelo com histórico (§4.6).
- Sinal de alarme: R² de split aleatório próximo de 0,99 em nível de pixel. `[H-04]` é a ilustração: RF com R²=0,9949 "sem realismo espacial".

### 4.8 O "ajuste à média real" do pipeline de limpeza de colheita

Este caso merece discussão própria porque é ambíguo e porque está **dentro do código existente** (`colheita.py`, etapa final do pipeline portado do QGIS).

**O que é.** Após os filtros (bruto, operacional, correção entre colhedoras, MapFilter global e local anisotrópico), o pipeline aplica um **ajuste à média real**: reescala o mapa para que sua média coincida com a produtividade média informada da safra (tipicamente a pesagem de balança do talhão).

**Por que isso é um problema quando o alvo é a produtividade.** A média informada da safra é, ela própria, a resposta agregada que o modelo está tentando prever. Se o alvo em cada célula foi reescalado por um fator que depende da média real observada, então **todas as células daquele talhão-safra carregam informação sobre o resultado final da safra**. Concretamente:

- **Não é vazamento de feature.** Nada do ajuste entra no vetor de entrada do modelo. As features (espectrais, solo, relevo, CEa) permanecem intactas.
- **É, porém, um alvo que incorpora informação pós-colheita.** O mapa-alvo não é uma medição independente: é uma medição calibrada por um agregado que só existe após a colheita. Isso não infla métricas *dentro* de um talhão — o fator é constante por talhão-safra e não cria correlação diferencial entre células. Mas **muda o que a métrica significa**: sob LOFO, o modelo é avaliado contra um alvo que já foi corrigido para o nível médio correto daquele talhão, enquanto na operação real, em R3, esse nível médio é desconhecido.
- **Onde vira vazamento de fato:** se a **média do talhão-safra** for usada como feature, ou se o ajuste for aplicado com um fator estimado a partir de dados que também alimentam o treino de outros talhões (p.ex. um fator global de calibração ajustado sobre o conjunto todo).

**`[DECISÃO → ADR-001 D4]` Posição adotada.**
1. **Manter o ajuste à média real no pipeline de produção do mapa de colheita** — ele corrige erro real de calibração de colhedora, documentado em `[H-14, só abstract]` como uma das quatro categorias de erro (medição contínua de umidade e produtividade).
2. **Gerar e armazenar as duas versões do alvo**: `yield_ajustado` (com ajuste à média) e `yield_sem_ajuste` (após todos os filtros, sem o reescalonamento final).
3. **Treinar e validar com `yield_sem_ajuste` como alvo primário**, e usar `yield_ajustado` como análise de sensibilidade. Se as métricas divergirem muito, o ajuste está carregando informação relevante e isso precisa ser reportado no documento de resultados.
4. **Em nenhuma circunstância** a média informada da safra entra como feature, nem o fator de ajuste.
5. Decompor o erro em duas partes distintas — **erro de nível** (o modelo acerta a média do talhão?) e **erro de padrão** (o modelo acerta onde é mais e onde é menos?) — e reportar ambas. A seção 61 do pedido pergunta as duas coisas separadamente ("Quanto este talhão deverá produzir?" e "Onde dentro do talhão a produtividade deverá ser maior ou menor?"), então elas devem ser medidas separadamente.

**`[LACUNA]`** Nenhum estudo da base discute explicitamente o ajuste à média informada como fonte de vazamento. `[H-14]` cataloga os erros de medição que motivam o ajuste e recomenda publicar os parâmetros de limpeza junto ao mapa interpolado, tanto para o dado bruto quanto para o pós-processado — o que é consistente com a decisão 2 acima. A classificação deste caso como vazamento ou não é `[HIPÓTESE]` deste documento, e a decisão foi tomada pelo lado conservador.

---

## 5. Qualidade do alvo: o mapa de colhedora como fonte de erro

Um ponto frequentemente ignorado: **o teto de acurácia do modelo é o erro do alvo**. Se o mapa de colheita limpo tem erro de 300 kg/ha, nenhum modelo pode reportar RMSE honesto abaixo disso.

### 5.1 Quanto do dado bruto é erro

`[RESULTADO ESPECÍFICO]` `[H-12, só abstract]` (Sudduth & Drummond 2007, *Agronomy Journal*, metodológico multi-cultura, escala de talhão; trabalho fundacional do software Yield Editor): *"pesquisadores relataram que 10 a 50% das observações em um dado talhão contêm erros significativos e devem ser removidas"*. Os autores também registram que os métodos de remoção **não foram padronizados**.

`[RESULTADO ESPECÍFICO]` `[H-13, só abstract]` (Vega et al. 2019, *Precision Agriculture*, 595 datasets reais de culturas de grãos, escala de talhão): o protocolo automatizado em dois estágios (filtro global de nulos/bordas/outliers globais; depois filtro espacial local via **índice de Moran local** e *Moran's plot*) removeu **aproximadamente 30% do tamanho do dataset** por talhão-monitor, sendo **um terço dessa remoção** atribuída aos outliers espaciais locais.

### 5.2 Outliers locais são qualitativamente diferentes dos globais

`[RESULTADO ESPECÍFICO]` O achado central de `[H-13, só abstract]` — um estudo, 595 datasets reais — é que filtros de nulo/borda/outlier global melhoram a **distribuição** da produtividade, mas é a limpeza de outliers **locais** que impacta a **estrutura espacial** do mapa: *"the cleaning of local outliers impacted the yield spatial structure"*. Isso tem consequência direta: um pipeline que só filtra por distribuição (percentis, limites físicos) pode deixar intactos erros espacialmente localizados — sobreposição de passadas, atraso de fluxo de grãos, entrada e saída de talhão.

> **Compatibilidade / ação:** `colheita.py` já implementa MapFilter global **e local anisotrópico**, o que cobre conceitualmente os dois estágios de `[H-13]`. `[DECISÃO → ADR-001 D4]` (item 7): auditar o filtro local existente contra o índice de Moran local de `[H-13]`, e registrar por talhão-safra o **percentual removido em cada estágio**. Se o percentual total ficar muito fora da faixa de ~30% de `[H-13]` ou dos 10–50% de `[H-12]`, é sinal de filtro frouxo ou agressivo demais. `novo_barato` (o índice de Moran local se implementa com `numpy`/`scipy`).

### 5.3 Desalinhamento pixel × ponto de colhedora

`[RESULTADO ESPECÍFICO]` `[H-14, só abstract]` (Lyle, Bryan & Ostendorf, revisão de 25 anos, escala de talhão) cataloga **quatro categorias** de erro de medição em mapas de colheita: (i) dinâmica de colheita da colhedora; (ii) medição contínua de umidade e produtividade; (iii) acurácia dos dados posicionais (GNSS); (iv) erros causados pelo operador (variação de velocidade, curvas, sobreposição de passadas).

`[EVIDÊNCIA LIMITADA]` As categorias (i) e (iii) de `[H-14, só abstract]`, combinadas, produzem o desalinhamento específico que importa aqui: **o grão que a colhedora registra numa posição foi cortado metros antes** (atraso de fluxo de grãos pela plataforma e pelo elevador), e a posição registrada tem o offset da antena GPS. Ou seja, o ponto de colhedora está sistematicamente deslocado em relação à área que realmente produziu aquele grão. Numa célula de 20 m, um deslocamento de 5–15 m atribui produtividade à célula errada.

`[EVIDÊNCIA LIMITADA]` `[B-07]` reconhece o problema do lado do sensoriamento e propõe um método específico de casamento ("Polygon-Pixel Interpolation") entre polígonos de colheita e pixels de satélite — sinal de que o problema é reconhecido e não resolvido trivialmente.

**Como mitigar.**
- Tratar o deslocamento de fluxo como parâmetro explícito e calibrável por colhedora/talhão, e registrá-lo no *lineage*.
- Agregar o alvo à célula de 20 m por **mediana** dos pontos de colhedora contidos, não por média, e registrar o **número de pontos por célula**; células com poucos pontos recebem peso menor ou são descartadas.
- Não superajustar features de borda: células nas bordas do talhão concentram erro de manobra e sobreposição.
- `[DECISÃO → ADR-001 D4]` (item 8): o erro do alvo é uma componente irredutível do RMSE. Quantificá-lo (variância entre passadas adjacentes na mesma região homogênea) e reportá-lo junto do RMSE do modelo, para que o leitor saiba quanto do erro é do modelo e quanto é do dado.

### 5.4 Suavização por interpolação e efeito de agregação do grid

A interpolação IDW que produz o grid **suaviza** o alvo: remove variância de alta frequência e, com isso, torna o alvo mais fácil de prever do que a realidade. Isso tende a **melhorar** as métricas sem melhorar o produto.

`[RESULTADO ESPECÍFICO]` O efeito de agregação está diretamente quantificado em `[B-04]` (milho, US Corn Belt, validação externa contra >1 M de pontos reais de colhedora): r² = **0,31** no pixel de 30 m sem suavização → **0,40** com suavização por regressão harmônica da série temporal → **0,45** em nível de talhão → **0,69** em nível de condado. Ou seja, **a mesma predição parece quase duas vezes melhor quando agregada de pixel para condado**. Os autores concluem daí "a necessidade de dados de verdade de campo em resolução fina para avaliar melhor a acurácia em nível sub-talhão de produtos de alta resolução".

**Consequência operacional.** `[DECISÃO → ADR-001 D3]` (item 3) O projeto reportará métricas em **três escalas separadas e rotuladas**: célula de 20 m, talhão, e conjunto. Nunca citar a métrica de talhão como se fosse a de célula. É exatamente o erro de comparação que `[B-04]` expõe.

`[EVIDÊNCIA LIMITADA]` A resolução mais fina não converte automaticamente em melhor acurácia: `[B-08, só abstract]` (Skakun et al. 2021, milho e soja, EUA, intra-talhão, comparação contra pontos de colhedora com GPS). Na **simulação de degradação de resolução**, a variância intra-talhão explicada cai de 100% a 3 m para 86% a 10 m, **72% a 20 m** e 59% a 30 m — o único número da base que dimensiona diretamente o custo de resolução no grid-alvo de 20 m. Mas nos **modelos empíricos do mesmo estudo** o R² médio foi **maior** em 30 m HLS (0,56; faixa 0,21–0,88) que em 3 m Planet (0,30; faixa 0,09–0,77). Isso reforça que a escolha de 20 m é uma decisão de produto, não uma garantia de acurácia: qualidade radiométrica e consistência temporal do sensor pesam tanto quanto o tamanho do pixel.

---

## 6. Erro em cascata: mapas krigados como features

O pipeline planejado empilha, sobre cada célula de 20 m, várias camadas que **não são medições, e sim predições de outro modelo**: argila, MO, pH, P, K, Ca, Mg, Al, CTC e V% krigados a partir de laudos; CEa rasa e profunda; MDE reamostrado. Cada uma carrega sua própria incerteza, que o modelo de produtividade trata como se fosse zero.

**`[CONSENSO]` O princípio geral está na base.** `[C-05]`: o uso de variáveis previamente mapeadas como preditores, sem reconhecer sua incerteza, **amplifica erros a jusante** (propagação de erro) — é uma das quatro recomendações centrais dos autores. `[C-10]` reforça pelo lado do modelo: autocorrelação espacial remanescente nos resíduos de CV "indica que as predições talvez estejam enviesadas, e isso é subótimo".

**O problema específico da densidade amostral.** `[HIPÓTESE, inferida]` Um mapa krigado de fertilidade é uma superfície **suave** construída a partir de poucos pontos. `[D-09, só abstract]` amostrou em grid denso de 35×35 m para predizer em 5×5 m — uma razão de área amostra:predição de ~49:1 — e obteve R² de 0,24–0,90 conforme o atributo de saúde do solo. A amostragem de solo típica na prática comercial brasileira é **bem mais esparsa** que 35×35 m (frequentemente 1 ponto/ha ou menos), de modo que o fator de suavização real é maior. O resultado é uma feature que varia lentamente no espaço, com valores fortemente correlacionados entre células vizinhas — precisamente o combustível da "memorização de vizinhança" descrita em §1.1. **Nenhum estudo da base mede esse efeito — `[LACUNA]`.**

**Camada adicional de ressalva sobre CEa.** `[EVIDÊNCIA]` `[D-03]` (Corwin & Lesch 2005, revisão fundacional, escala de talhão) é explícito: a condutividade elétrica aparente *"often, but not always, relates to crop yield"* — é uma medida **integradora** de textura, água, matéria orgânica e salinidade, não um preditor causal único. O eixo D registra ainda que a **direção** da relação muda com o solo: negativa em Kansas/Missouri e no Brasil (Latossolo Bruno, Guarapuava-PR), e diferente no Colorado por inversão do perfil de textura. Isso significa que um modelo treinado em uma região pode aprender o sinal errado para outra — risco direto para o teste de fazenda externa (§3.5).

**`[EVIDÊNCIA LIMITADA]` O que a base sugere fazer com o resíduo estruturado.** `[H-04]` (trigo e mostarda, Índia, desagregação de vilarejo para pixel) mostra que **krigar os resíduos** de um modelo de DL reduziu o RMSE em **35–45%** (GRU: 3,07 → 1,85 q/ha; LSTM: 3,56 → 1,96 q/ha), corrigindo mapas com resíduo espacialmente estruturado que o RF puro (R²=0,9949, "sem realismo espacial") não resolvia. Não é soja, não é Brasil, e a escala é de desagregação, não de predição intra-talhão — mas é a evidência mais forte da base de que combinar ML com geoestatística no **resíduo** é produtivo. `pykrige` já está no stack: `reusa`.

**Como mitigar o erro em cascata.**
- Propagar a variância de krigagem: `interp.py` já roda validação cruzada LOO na krigagem; armazenar a **variância de predição por célula** junto do valor e usá-la como peso ou como feature auxiliar.
- Testar por ablação se as camadas krigadas melhoram o desempenho **sob LOFO**, não sob split aleatório. Lembrar que `[C-11]` encontrou o resultado oposto ao esperado: adicionar índices de solo e topografia **não** melhorou, "introduzindo ruído e sobreajuste às condições locais".
- Não permitir que a krigagem cruze fronteiras de talhão (§4.4).
- Registrar a densidade amostral (pontos/ha) de cada mapa krigado no *lineage*; predições em talhões com densidade muito abaixo da mediana do treino devem cair fora da AOA (§3.6).

---

## 7. Transferência temporal e anos extremos

**O problema.** Safras diferem em chuva, temperatura e pressão biótica. Um modelo treinado em 2 ou 3 safras normais não tem como representar uma seca. E o valor comercial da previsão é **maior** justamente no ano ruim.

**`[RESULTADO ESPECÍFICO]`** `[A-03]` (milho, US Corn Belt, escala de condado, **CV 10-fold aleatória para o ajuste + teste em anos retidos: 2012, 2017 e 2018** — não é *leave-one-year-out*) é a evidência direta da base: acoplar APSIM ao ML reduziu o RMSE em **7–20%** (RRMSE de 6–7% no melhor híbrido), com ganho de 5–43% no ano de seca extrema de 2012 — **mas o desempenho absoluto foi pior em 2012 mesmo com o híbrido**, e alguns modelos benchmark tiveram R² negativo naquele ano. **Ressalva obrigatória (já registrada em §4.1): as simulações APSIM usaram o clima REAL completo do ano de teste; os próprios autores escrevem que "na prática o clima será desconhecido".** O ganho relatado é, portanto, um teto e não uma estimativa pré-colheita.

**`[RESULTADO ESPECÍFICO]`** `[C-11]` atribui explicitamente parte dos R² negativos de LOFO à seca no talhão Miner — ou seja, o ano extremo atravessa também a validação espacial.

**`[RESULTADO ESPECÍFICO]`** `[D-12]` mostra a variabilidade interanual na soja mesmo em condições normais: validação por ano deu R² de 0,57 a 0,92 (média 0,76) e RMSE de 0,18 a 0,86 Mg/ha (180 a 860 kg/ha). A faixa de RMSE é quase 5× entre o melhor e o pior ano. O mesmo estudo registra que o efeito de temperatura extrema é **ano-dependente**: na maioria dos anos o efeito foi positivo, e o sinal médio do SHAP mascara essa heterogeneidade.

**`[RESULTADO ESPECÍFICO]`** `[B-09, só abstract]` (milho e soja, intra-talhão, Canadá) usou treino em 2011 e teste em 2012 — ano-fora explícito — e é um dos poucos estudos de sensoriamento da base com esse desenho.

**Implicações.**
1. `[DECISÃO → ADR-001 D10]` O relatório de validação deve **nomear cada safra do conjunto** e classificá-la (normal / seca / excesso hídrico) com base no clima regional, ainda que o clima não entre como feature. Uma métrica média sobre safras que não incluem nenhum ano ruim é enganosa por omissão.
2. `[DECISÃO → ADR-001 D7, D9]` Quando o DI/AOA (§3.6) indicar que a safra corrente está fora do domínio de treino em termos de preditores, a interface **não exibe intervalo estreito** — exibe aviso de extrapolação. É a aplicação direta da recomendação de `[C-05]` de acinzentar áreas fora da AOA.
3. `[HIPÓTESE]` Modelos híbridos com modelo de cultura (tipo APSIM) são a rota da literatura para melhorar ano extremo `[A-03]`, mas isso é `infra_nova` de alto custo: não existe nada disso no stack atual, e a ressalva do clima real do ano de teste torna o ganho esperado incerto em cenário pré-colheita. Fora do MVP.
4. `[LACUNA]` O número mínimo de safras para LOYO robusta não está na base revisada.

---

## 8. Incerteza (seção 18)

O alvo de produto é exibir "produtividade estimada: 63,4 sc/ha; intervalo esperado: 58,9–67,8 sc/ha" — internamente, 3.804 kg/ha com intervalo de 3.534 a 4.068 kg/ha. A pergunta é o que a base sustenta.

### 8.1 Métodos e o que a base diz de cada um

| Método | id | O que é | O que a base sustenta |
|---|---|---|---|
| **Quantile Regression Forest (QRF)** | `[G-02]` | RF que retém a distribuição empírica completa em cada folha, permitindo estimar quantis condicionais | Consistência assintótica **provada**; "competitivo em poder preditivo". Ressalva dos próprios fundamentos: a consistência assume observações **i.i.d.**; dependência espacial não é tratada. Sem garantia de cobertura em amostra finita |
| **Conformal / split conformal / CQR** | `[G-01, só abstract]`, `[G-03, só abstract]` | Calibra intervalos com um conjunto de calibração; CQR adiciona adaptação a heterocedasticidade | Garantia de cobertura **válida em amostra finita, sem suposição distribucional**. Pressupõe **exchangeability** entre treino, calibração e teste — violada por pixels vizinhos correlacionados |
| **Conformal espacial** | `[G-04, só abstract]` | Conformal sem supor estacionariedade, usando vizinhança local | *"spatial data can be treated as exactly or approximately exchangeable in a wide range of settings"* — mas os autores provam isso sob regime **infill assintótico** e apenas **localmente**. A saída correta é calibrar com vizinhança local, não com reamostragem global aleatória de pixels |
| **QRF aplicado a produtividade** | `[G-06, só abstract]` | QRF + kernel de Epanechnikov para densidade completa | Caso aplicado real (amendoim e milheto, Gana, escala nacional/anual): os intervalos capturaram as produtividades observadas com alta probabilidade de cobertura (PICP/PINAW citados sem valores no resumo). **Não é soja, não é intra-talhão** |
| **Bayesiano (BNN)** | `[G-13, só abstract]` | Rede neural bayesiana com distribuição preditiva | Milho, EUA, escala de **condado**, anos-teste 2010–2019: R² médio 0,77 (late-season), ~0,75 já em meados de agosto (~2 meses pré-colheita). **Cobertura empírica de ≥84% para um intervalo nominal de 95%** |
| **Quantile regression neural network** | `[G-14, só abstract]` | Rede neural para regressão quantílica | **Resultado negativo:** em painel de 36 anos e 1.260 condados chineses (milho), *"quantile regression neural network does not perform better than the traditional quantile regression"*; QRF+LASSO foi o melhor entre os métodos quantílicos testados |
| **NGBoost** | `[G-05, só abstract]` | Boosting que ajusta parâmetros de uma distribuição paramétrica via gradiente natural | Funciona com qualquer *base learner*, família de distribuição com parâmetros contínuos e regra de pontuação. O resumo **não** menciona validação em dados espaciais ou agrícolas |
| **Ensembles / bootstrap** | — | Variância entre membros do ensemble como proxy de incerteza | **Sem evidência na base revisada** sobre calibração de ensembles/bootstrap para produtividade. `[LACUNA]` |

### 8.2 Os três avisos que a base dá de forma mais clara

**(a) `[RESULTADO ESPECÍFICO — resultado negativo]` Não presumir que o método mais complexo ganha.** `[G-14]`, com 36 safras e 1.260 condados, encontrou que a rede neural quantílica **não** supera a regressão quantílica tradicional, e que o LASSO "não melhora muito os modelos de predição neste contexto". A combinação vencedora foi QRF+LASSO. Isso é evidência direta contra adotar deep learning por padrão para incerteza.

**(b) `[RESULTADO ESPECÍFICO]` Garantia teórica não é cobertura empírica.** `[G-13]` é o contraexemplo mais útil da base: uma abordagem bayesiana "correta" envelopou **mais de 84%** (*"more than 84%"*, verbatim do abstract) das observações num intervalo nominal de 95%. O intervalo estava sistematicamente estreito demais. Lição direta: **todo intervalo publicado pela plataforma precisa de validação empírica de cobertura**, medida no esquema de validação correto (LOFO/LOYO), e não apenas da garantia teórica do método.

**(c) `[CONSENSO]` Exchangeability sob dependência espacial.** `[G-01]` depende de exchangeability entre treino, calibração e teste. Calibrar conformal com um split **aleatório de pixels dentro do mesmo talhão** viola essa premissa, porque os pixels de calibração são vizinhos dos de treino. `[G-04]` mostra a saída: sob regime de amostragem espacial densa (infill), a exchangeability vale **localmente e de forma aproximada**, e a calibração deve usar vizinhança local. Na prática deste projeto, isso significa: **calibrar por grupo (talhão), não por reamostragem global de pixels** — ou seja, conformal Mondrian/por grupo, com os talhões de calibração distintos dos de treino, do mesmo modo que o LOFO.

### 8.3 Agregar incerteza de células para o talhão

`[EVIDÊNCIA LIMITADA]` Este é o erro aritmético mais fácil de cometer e um dos mais graves — a premissa de independência que ele viola é refutada por `[G-04, só abstract]`, e a dependência espacial em si está documentada em toda a §1, mas **nenhum estudo da base mede este erro específico**. Se o talhão tem 2.500 células e cada uma tem desvio σ, **somar variâncias como se fossem independentes** dá desvio do total proporcional a σ·√2500 / 2500 = σ/50 — ou seja, o intervalo do talhão ficaria ~50× mais estreito que o da célula. Isso é falso, porque as células **não** são independentes: `[G-04]` é justamente sobre dependência espacial na predição, e toda a §1 documenta a autocorrelação.

**O que fazer em vez disso.** Quatro abordagens compatíveis com o stack, em ordem de preferência:
1. **Calibrar diretamente no nível do talhão.** O erro de interesse do usuário é o erro da média do talhão; então calibrar um intervalo conformal cuja unidade de calibração é o **talhão-safra** (não a célula), usando os talhões de calibração deixados de fora. Isso resolve a dependência por construção, ao custo de precisar de talhões suficientes para calibrar. `novo_barato`.
2. **Bootstrap por bloco espacial.** Reamostrar blocos dimensionados pelo alcance do variograma (§3.6), não células individuais, e propagar a variância entre blocos. `reusa` (`pykrige` já calcula o variograma).
3. **Usar a estrutura de covariância explicitamente.** Var(média) = (1/n²)·ΣΣ Cov(i,j), com a covariância vinda do variograma ajustado ao resíduo. `reusa`.
4. **Nunca** somar variâncias independentes. Se aparecer um intervalo de talhão muito mais estreito que o da célula típica, é sintoma deste erro (teste automático na §11).

### 8.4 O que é defensável mostrar na interface

`[DECISÃO → ADR-001 D7]` (item 6) Com base no acima:

**Defensável:**
- **No nível do talhão**, "63,4 sc/ha (58,9–67,8)" — *desde que* o intervalo venha de conformal ou QRF calibrado no nível do talhão, com cobertura empírica medida sob LOFO/LOYO, e o nível nominal declarado ("intervalo de 80%", "de 90%").
- **No nível da célula**, uma representação **ordinal e relativa** ("esta zona deve produzir acima / na média / abaixo da média do talhão") com uma faixa larga, em vez de um número pontual com casa decimal.
- Um indicador de confiança derivado do DI/AOA `[C-04]`, incluindo o estado "fora do domínio — não é possível prever com confiança".
- A evolução da incerteza ao longo da safra: `[G-13]` mostra que o nível de incerteza decresce ao longo do ciclo e se estabiliza, o que sustenta exibir "a previsão vai apertar conforme a safra avança" — com a ressalva de que aquele estudo é milho, escala de condado, EUA.

**Não defensável:**
- Intervalo por célula de 20 m com a mesma aparência de precisão do intervalo de talhão.
- Intervalo de talhão obtido por soma de variâncias independentes de células (§8.3).
- Qualquer intervalo sem cobertura empírica medida — a lição de `[G-13]` (≥84% para nominal de 95%).
- Intervalo para talhão/safra fora da AOA.
- Comparar o intervalo da plataforma com números de estudos de escala diferente (`[G-06]` é nacional/anual; `[G-13]` e `[G-14]` são de condado).

### 8.5 Métricas de calibração a reportar

| Métrica | O que é | Critério |
|---|---|---|
| **Cobertura empírica (PICP)** | fração de observações dentro do intervalo | comparar com o nominal; `[G-13]` obteve ≥84% para nominal de 95% — desvios desta ordem devem ser reportados, não escondidos |
| **Largura média do intervalo (PINAW)** | largura normalizada | intervalo válido mas inútil (largo demais) não é sucesso; `[G-06]` reporta PICP e PINAW em conjunto, e essa é a prática a seguir |
| **Cobertura condicional por grupo** | cobertura calculada por talhão e por safra | cobertura global de 90% com um talhão a 40% é falha de calibração local |
| **Cobertura por faixa de produtividade** | cobertura nas caudas | a seção 33 já pede erro por faixa; a cobertura deve seguir a mesma partição |

`[EVIDÊNCIA LIMITADA]` **Nenhum estudo de QRF ou conformal da base foi aplicado a soja no Brasil em escala intra-talhão.** `[G-06]` é amendoim/milheto em Gana, escala nacional; `[G-13]` e `[G-14]` são milho, escala de condado. A extrapolação para soja intra-talhão no Brasil é uma aposta metodológica, não uma réplica. `[LACUNA]` `[G-04]` (conformal espacial) não foi validado em dados agrícolas — é teoria estatística geral aplicada por analogia.

> **Compatibilidade.** QRF (`quantile-forest`), conformal (`MAPIE`, `crepes`) e NGBoost são todos CPU-only e leves: `novo_barato`, compatíveis com o Render *standard*. Abordagens bayesianas com rede neural `[G-13]` exigiriam PyTorch/TensorFlow: `infra_nova`, fora do MVP — e `[G-14]` dá argumento adicional contra.

---

## 9. Explicabilidade (seção 19)

O objetivo do produto é a decomposição por célula do tipo "NDRE +6,2 sc/ha; matéria orgânica +2,1; baixa chuva −4,7; K baixo −1,8; declividade −0,5". O que a base sustenta e onde estão as armadilhas.

### 9.1 Métodos

**SHAP / TreeSHAP** `[G-07, só abstract]`. É a referência canônica e, nas palavras do próprio artigo, o **primeiro** algoritmo que calcula valores de Shapley **exatos em tempo polinomial** para modelos de árvore (RF, XGBoost, LightGBM) — "primeiro", não "único": a base revisada não compara TreeSHAP com alternativas exatas posteriores `[LACUNA]`. Traz três contribuições: o algoritmo polinomial; um tipo de explicação que mede efeitos de **interação local** entre features; e ferramentas para agregar muitas explicações locais em estrutura global mantendo fidelidade local. A validação do artigo original é em **três problemas médicos, não agrícolas** — a transposição para produtividade é analógica.

**Permutation importance** `[G-12]`. Fundamentada formalmente por Fisher, Rudin & Dominici, que derivam conexões entre importância por permutação, U-statistics, importância condicional, efeitos causais condicionais e coeficientes de modelos lineares. É o método efetivamente usado na prática da literatura de produtividade: `[A-03]` usou permutation importance (não SHAP) e encontrou a tendência tecnológica (`yield_trend`) como variável mais importante e, entre as variáveis APSIM, o estresse hídrico médio como a mais relevante.

**PDP vs. ALE** `[G-08, só abstract]`. Apley & Zhu demonstram formalmente por que PDP falha com preditores correlacionados: *"PD plots require extrapolation of the response at predictor values that are far outside the multivariate envelope of the training data"*. Gráficos marginais (M plots) não extrapolam, mas ficam "substancialmente enviesados", de forma análoga ao viés de variável omitida. ALE herda as vantagens de ambos sem os defeitos e é "muito menos custoso computacionalmente que PDP".
> **Aplicação direta aqui:** correlação alta entre features é praticamente garantida neste projeto — NDVI, SAVI, MSAVI2, EVI2, EVI, GNDVI são todos derivados das mesmas bandas e altamente colineares; solo, relevo e clima covariam espacialmente. `[DECISÃO → ADR-001 D8]` (item 2): **ALE como padrão para efeito marginal; PDP apenas em features comprovadamente pouco correlacionadas.**

**Interações.** `[G-07]` fornece *SHAP interaction values*, que decompõem efeito principal e interação por par de features. Isso tem valor agronômico direto: `[D-12]` mostra, via SHAP, interação explícita clima × relevo × solo na soja (o teor de água residual do solo e a declividade modulam o efeito da chuva de junho), e `[D-05]` registra que a produtividade de áreas côncavas correlaciona **negativamente** com a chuva de maio e **positivamente** com a chuva de agosto/setembro (milho/soja/trigo/algodão, intra-talhão, US Midwest) — o mesmo evento de chuva tem sinal oposto conforme a posição topográfica. Um modelo aditivo sem interação não representa isso.

**Mapas SHAP espaciais.** `[RESULTADO ESPECÍFICO, o estudo mais próximo do caso Invicta]` `[G-11, só abstract, PREPRINT — revisão por pares não confirmada]` (Najjar et al. 2024) faz explicabilidade em **nível sub-talhão** para soja, trigo e colza na Argentina, Uruguai e Alemanha, com LSTM sobre séries de imagens de satélite e mapas de produtividade, usando métodos de atribuição de features para quantificar contribuições, identificar estádios críticos de crescimento e analisar variabilidade de produtividade no talhão. O resumo **não** nomeia SHAP explicitamente, não especifica sensor nem resolução, e não traz métricas.
> `[LACUNA]` **Não foi encontrado, na base revisada, nenhum artigo revisado por pares que aplique SHAP espacialmente (mapa de SHAP por pixel) a soja no Brasil.** Esta é a lacuna prática mais relevante para o trabalho acadêmico — e, simultaneamente, o espaço de diferenciação do produto.

### 9.2 Armadilhas

`[RESULTADO ESPECÍFICO]` A síntese de referência, e **única** da base sobre o tema, é Molnar et al. `[G-09, só abstract]`, que catalogam os pitfalls gerais de métodos de interpretação agnósticos ao modelo. Os que se aplicam diretamente:

1. **Correlação ≠ causalidade.** `[G-09]` lista explicitamente "interpretações causais injustificadas" entre os pitfalls. SHAP mede a contribuição de uma feature **para a predição do modelo**, não o efeito de intervir naquela variável no campo. "K baixo −1,8 sc/ha" significa *o modelo prevê menos onde o K é baixo*, não *aplicar K vai render +1,8 sc/ha*. A distinção é comercialmente crítica: a segunda leitura leva a recomendação de adubação, e a plataforma não tem evidência para sustentá-la.
2. **Features correlacionadas distorcem a atribuição.** `[G-09]` lista dependência entre features como primeiro pitfall; `[G-08]` mostra o mecanismo para PDP. Para SHAP em árvores, `[G-07]` opera sob formulações que ou assumem independência ou aproximam a distribuição condicional pela estrutura da árvore — o que pode distribuir importância de forma enganosa entre colineares. Se NDVI e EVI2 carregam o mesmo sinal, o SHAP pode dar 3,1 a um e 3,1 ao outro, ou 6,2 a um e 0 ao outro, sem diferença de capacidade preditiva.
3. **Instabilidade entre folds e entre modelos igualmente bons.** `[RESULTADO ESPECÍFICO]` `[G-12]` formaliza isso como *model class reliance* / "conjunto de Rashomon": a importância de uma variável pode variar por toda uma faixa entre modelos igualmente bons ajustados aos mesmos dados. Consequência prática: reportar a importância de **um** modelo vencedor pode ser enganoso sobre o papel agronômico real da variável. `[DECISÃO → ADR-001 D8]` (item 4): reportar SHAP **agregado sobre os folds da CV por grupo**, com a dispersão entre folds visível. Se o ranking muda de fold para fold, isso é informação a exibir, não a esconder.
4. **Interpretar modelo que não generaliza.** `[G-09]` lista este pitfall e ele é o mais perigoso aqui: um modelo com R² inflado por split aleatório (§1) produz um mapa SHAP que explica **o vazamento**, não a agronomia. `[DECISÃO → ADR-001 D8]` (item 3): **mapas SHAP só são gerados a partir do modelo avaliado por GroupKFold/LOFO**, nunca do modelo de split aleatório.
5. **Ignorar a incerteza da própria estimativa de importância.** `[G-09]` também lista este. Uma barra de SHAP sem indicação de dispersão sugere uma precisão que não existe.
6. **Ranking universal não existe.** As evidências da base divergem por cultura e por escala: `[D-12]` encontra, para **soja**, declividade > chuva de junho > elevação (terreno domina; a chuva de junho foi a única variável climática retida no modelo de soja), enquanto para **milho** quatro das cinco variáveis mais importantes são climáticas. `[D-07]` mostra que o ranking muda com a escala de agregação: unidade de mapeamento de solo domina quando os dados são agrupados entre campos, mas a elevação domina na análise por campo individual. `[B-09]` encontrou, em milho e soja no Canadá, que o índice mais importante não foi NDVI nem NDRE, mas o Simple Ratio combinado com a declividade do terreno. **Qualquer ranking que a plataforma exibir é específico do modelo, da cultura, da escala e do conjunto de talhões.**

### 9.3 Como comunicar a agrônomos

`[DECISÃO → ADR-001 D8]` (item 5) Regras de redação da interface, derivadas de `[G-09]` e `[G-12]`:

- **Verbo associativo, nunca causal.** "Nesta zona, o modelo associa a menor produtividade prevista a NDRE baixo e declividade alta" — não "a declividade está reduzindo a produtividade".
- **Unidade e referência explícitas.** A contribuição é sempre relativa à predição média do modelo. Exibir a linha de base ("média prevista do talhão: 58,0 sc/ha") junto das contribuições.
- **Exibir no máximo 5 fatores** e agrupar espectrais correlacionados num único item ("vigor da vegetação"), em vez de listar NDVI, EVI2 e GNDVI separadamente — mitigação direta do pitfall 2.
- **Marcar instabilidade.** Fator cujo sinal muda entre folds recebe marcação visual de baixa confiança (pitfall 3).
- **Não exibir SHAP para células fora da AOA** (§3.6).

**Texto de ressalva proposto para a interface** (a ser exibido junto de todo mapa de atribuição):

> **Como ler este mapa.** Os valores abaixo mostram **como o modelo chegou à previsão**, não uma relação de causa e efeito comprovada no campo. Eles indicam associações aprendidas a partir dos talhões usados no treinamento. Variáveis parecidas entre si (índices de vegetação, por exemplo) podem ter sua importância distribuída de forma arbitrária entre elas. Este mapa **não é uma recomendação de manejo ou de adubação**: use-o como ponto de partida para investigação agronômica a campo.

> **Compatibilidade.** `shap` é CPU-only, leve e maduro (licença MIT), mas ainda não está pinado no backend: `novo_barato`. Permutation importance e ALE são implementáveis com `numpy`/`scikit-learn`: `novo_barato`. Mapas SHAP por pixel para um grid de 20 m exigem calcular SHAP em dezenas de milhares de linhas — com TreeSHAP `[G-07]` isso é polinomial e viável em CPU, mas precisa ser assíncrono (job do robô noturno), não síncrono na requisição da interface: `novo_barato` com ressalva de arquitetura.

---

## 10. Métricas (seção 33) e análise espacial do erro (seção 34)

### 10.1 Métricas e como reportá-las

O pedido lista R², RMSE, MAE, MAPE (quando apropriado), nRMSE, bias e erro por faixa de produtividade. As regras de reporte que a base impõe:

| Regra | Origem |
|---|---|
| **Toda métrica sai acompanhada de escala (célula 20 m / talhão / conjunto) e esquema de validação** na mesma linha | `[B-04]`: r² 0,31 → 0,45 → 0,69 apenas mudando a escala de agregação; `[D-12]`: 0,90 → 0,79 apenas mudando o esquema |
| **R² por talhão precisa vir acompanhado de RMSE** | `[C-11]`: R² de −6,23 com RMSE de 589 kg/ha (≈9,8 sc/ha) — R² é relativo à variância local e engana em talhões homogêneos |
| **Comparar sempre com o modelo nulo** (média do treino) | `[C-01]` usa exatamente esse controle para mostrar que a CV espacial chegou ao nível do nulo (RMSPE 77,5 vs. 82 Mg/ha) |
| **Reportar distribuição, não só média**, quando a validação é por grupo | `[C-11]` (6 folds, 3 negativos); `[D-12]` (faixa 0,67–0,88 por estado); `[B-15]` (0,34–0,76 entre estados) |
| **Bias separado do RMSE** | §4.8: erro de nível e erro de padrão respondem perguntas diferentes (seção 61 do pedido) |
| **Não comparar com números de outra escala/cultura/validação** | Seção 9 do pedido; exemplificado por `[B-15]` (municipal) vs. `[C-11]` (intra-talhão) |

### 10.2 Existe um limiar de erro "operacionalmente útil"?

**`[EVIDÊNCIA LIMITADA]` Não há limiar universal na base revisada — e é isso que este documento afirma.**

O único número de referência disponível é o RRMSE de **6–7%** de `[A-03]` (milho, US Corn Belt, **escala de condado**, validação por **CV 10-fold aleatória + anos retidos de teste — 2012, 2017 e 2018 —, não *leave-one-year-out***, com a ressalva de que as entradas APSIM usaram o clima real do ano de teste). **Isso não deve ser tomado como benchmark para grid intra-talhão de 20 m em soja no Brasil**: escala, cultura e condição de validação são todas diferentes.

Os números de erro absoluto da base mais próximos do regime-alvo, todos com ressalva de escala e validação:
- `[C-11]`: RMSE de 554–765 kg/ha (≈9,2–12,8 sc/ha), soja, intra-talhão, PlanetScope 3,12 m, LOFO-CV, EUA.
- `[D-12]`: RMSE de 0,46 Mg/ha = 460 kg/ha (≈7,7 sc/ha) em teste interno para soja, grid de 30 m, EUA; por ano, a faixa foi de 180 a 860 kg/ha.
- `[B-15]`: RMSE de 301,5 kg/ha (treino/teste) e 168,3–491,2 kg/ha (estados independentes), soja, Brasil, **escala municipal** — não é pixel.

`[DECISÃO → ADR-001 D10]` (item b) O projeto **não adotará um limiar de RMSE como critério de sucesso**. Isso é coerente com a seção 60 do pedido, que estabelece explicitamente que "o projeto não precisa necessariamente obter o menor RMSE da literatura" e define sucesso por metodologia robusta, ausência de leakage, validação realista, comparação justa, interpretabilidade e aplicabilidade. O critério operacional será relativo e definido com a área agronômica: **o erro é útil se a ordenação das zonas dentro do talhão for estável** (o produto responde "onde produz mais e menos", seção 61) e se o intervalo de talhão for estreito o suficiente para a decisão comercial pretendida, com cobertura empírica verificada (§8.5).

### 10.3 Análise espacial do erro (seção 34)

Mapas obrigatórios: `yield_predicted`, `yield_observed` e `yield_error = predicted − observed`. Sobre o mapa de erro, três análises:

**(a) Moran's I dos resíduos.** `[EVIDÊNCIA]` Se os resíduos são espacialmente autocorrelacionados, há estrutura espacial que o modelo não capturou. `[C-10]` afirma diretamente que autocorrelação espacial remanescente nos resíduos de CV "indica que as predições talvez estejam enviesadas, e isso é subótimo". `[D-12]` fornece a referência quantitativa mais próxima: detectou autocorrelação espacial residual em **50 m (I = 0,19; p = 0,01)**, abaixo da sua grade de treino de 30 m — o que os autores leem como sinal de que uma grade mais fina que 30 m pode capturar padrão adicional (argumento indireto a favor dos 20 m-alvo). `[C-13, só abstract]` (milho, US Corn Belt, escala de condado, R²=0,90 e RMSE 0,764 MT/ha com Random Forest geograficamente ponderado) reporta Moran's I dos resíduos do GWRFR menor que o dos demais modelos — evidência de que ponderação geográfica reduz autocorrelação residual; `[H-01, só abstract]` (trigo, escala de talhão) converge: "resíduos de modelos GW foram menores e menos espacialmente dependentes" que os de PCR.
> `[DECISÃO → ADR-001 D10]` (item c) Calcular Moran's I global dos resíduos por talhão, em cada fold, e reportar. **Ressalva importante de `[C-01]`:** ausência de autocorrelação residual numa CV aleatória **não** prova ausência de vazamento — ali, a estrutura espacial tinha sido absorvida pelo próprio modelo e os resíduos pareciam limpos. Moran's I é diagnóstico complementar, não substituto da validação por grupo.
> **Compatibilidade:** `novo_barato` (`numpy`/`scipy`). O índice de Moran local já é necessário para auditar o filtro de `colheita.py` (§5.2), então é a mesma implementação.

**(b) Clusters de erro e regiões sistematicamente viesadas.** Identificar, via Moran local, aglomerados de superestimação e subestimação. Cruzar esses clusters com camadas existentes (zonas de manejo MEAP, CEa, TWI, bordas do talhão) é a forma mais direta de descobrir o que falta no modelo. `[D-04]`/`[D-05]` dão a hipótese agronômica a testar primeiro: zonas **instáveis** concentram-se em áreas côncavas de TWI alto, onde a produtividade depende da interação chuva × relevo — se os clusters de erro coincidirem com elas, o problema é de feature de interação, não de algoritmo.

**(c) Se houver resíduo estruturado, o que fazer.** Duas rotas com suporte na base, e elas **não** servem para a mesma coisa: (i) **modelo geograficamente ponderado** (`[C-13]`, `[H-01]` — `novo_barato`, CPU-only), que é a única das duas aplicável a **prever** um talhão novo, porque usa só posição e covariáveis; e (ii) **krigar os resíduos** (`[H-04]`, redução de RMSE de 35–45% em trigo/mostarda, Índia — `reusa`, `pykrige` disponível), que em `[H-04]` corrige o resíduo contra um agregado **observado** e, aqui, só pode ser usada **depois** da colheita (mapear o erro, completar talhão parcialmente colhido) ou sobre resíduos de **safras anteriores** sob leave-one-year-out. Usá-la sobre o resíduo da safra prevista é vazamento pelo alvo — ver ADR D9, item 2-bis. **Ressalva de `[C-10]`:** para conjuntos com poucos pontos e relações quase lineares, "a geoestatística baseada em modelo ainda pode levar a predições mais acuradas que o RFsp" — no regime de poucos talhões-safra da Invicta, a krigagem pura não deve ser descartada como baseline.

---

## 11. Checklist anti-vazamento (seção 42)

Formato pronto para virar suíte de testes automáticos no MVP. Cada item traz **o que checar**, **como checar** e **critério de falha**. Um teste que falha bloqueia a publicação de métricas.

### A. Vazamento temporal

- [ ] **A1 — Nenhuma imagem posterior à data da previsão.**
  *O que:* toda feature espectral de uma linha deve derivar de cena com data ≤ `data_previsao`.
  *Como:* para cada linha do dataset, `assert df.max_data_imagem <= df.data_previsao`.
  *Falha:* qualquer linha com `max_data_imagem > data_previsao`. Tolerância: zero.

- [ ] **A2 — Nenhuma variável climática acumulada além da data da previsão.**
  *O que:* GDD, chuva acumulada, VPD e afins devem ter janela terminando em `data_previsao`.
  *Como:* checar o campo `janela_fim` no lineage de cada feature climática.
  *Falha:* `janela_fim > data_previsao`. (Este é o erro declarado por `[A-03]`.)

- [ ] **A3 — Nenhum histórico de produtividade da safra corrente ou futura.**
  *O que:* features de histórico só podem usar safras estritamente anteriores.
  *Como:* `assert df.safra_origem_historico < df.safra`.
  *Falha:* qualquer `safra_origem_historico >= safra`.

- [ ] **A4 — Nenhuma feature de tendência temporal no modelo cold-start.**
  *O que:* variáveis do tipo `yield_trend` não entram no MVP.
  *Como:* lista negra de nomes de feature verificada na montagem do dataset.
  *Falha:* presença de qualquer feature marcada `temporal_trend=True`.

### B. Vazamento espacial

- [ ] **B1 — Nenhum talhão nos dois lados do split.**
  *O que:* interseção de `talhao_id` entre treino e teste deve ser vazia em todo fold.
  *Como:* `assert set(train.talhao_id) & set(test.talhao_id) == set()`.
  *Falha:* interseção não vazia. Tolerância: zero.

- [ ] **B2 — Agrupamento por talhão, não por talhão-safra.**
  *O que:* o vetor `groups` passado ao `GroupKFold`/`LeaveOneGroupOut` é `talhao_id`.
  *Como:* inspeção do objeto de CV antes de rodar; asserção sobre a cardinalidade de `groups` (deve ser igual ao número de talhões distintos, não de talhões-safra).
  *Falha:* `len(set(groups)) != n_talhoes_distintos`.

- [ ] **B3 — Nenhuma coordenada absoluta nem proxy de posição entre as features.**
  *O que:* `x`, `y`, `lat`, `lon`, índice de linha/coluna, id de célula, `talhao_id` numérico.
  *Como:* lista negra de nomes + teste de sanidade — treinar um modelo **apenas** com as features suspeitas e comparar seu desempenho com o do modelo completo, no mesmo esquema de validação (o teste de `[C-01]`).
  *Falha:* feature da lista negra presente, **ou** modelo-só-posição atingindo ≥80% do R² do modelo completo. **`[HIPÓTESE]`: o corte de 80% é escolha deste projeto.** Em `[C-01]` o modelo só com coordenadas ficou "quase idêntico" ao completo (≈100%); a base não fixa a partir de que fração o alerta deve disparar `[LACUNA]`. Fixado antes do experimento para não ser ajustado ao resultado.

- [ ] **B4 — Talhões contíguos não caem em folds diferentes sem verificação.**
  *O que:* distância mínima entre o centroide de um talhão de treino e o de teste.
  *Como:* calcular a matriz de distâncias entre centroides por fold e comparar com o alcance de autocorrelação estimado pelo variograma do alvo (§3.6, `[C-12]`).
  *Falha:* distância mínima entre folds menor que o alcance do variograma — reportar como aviso e registrar no relatório de validação.

- [ ] **B5 — Interpolação e krigagem não cruzam fronteira de talhão.**
  *O que:* cada mapa krigado (solo, CEa) e cada IDW de colheita usa apenas pontos do próprio talhão.
  *Como:* verificar no lineage da camada que o conjunto de `ponto_id` usado pertence ao mesmo `talhao_id`.
  *Falha:* qualquer `ponto_id` de outro talhão na origem da camada.

- [ ] **B6 — Interpolação não usa pontos do conjunto de teste (quando o split é sub-talhão).**
  *O que:* aplicável apenas a avaliações em escala de célula.
  *Como:* interseção entre `pontos_origem_da_camada` e os pontos atribuídos ao fold de teste.
  *Falha:* interseção não vazia.

- [ ] **B7 — Features de vizinhança "agronomicamente interpretáveis" testadas contra a hipótese de que transferem.**
  *O que:* distância à borda do talhão, TWI, curvatura e elevação relativa são admitidas por ADR D2, item 6, sob `[HIPÓTESE]` — a base **não** mede se elas transferem para um talhão não visto, e `[C-01]` sustenta apenas a metade negativa (o modelo aprende posição). São, além disso, superfícies suaves dentro do talhão, a classe que a §6 chama de combustível para memorização de vizinhança.
  *Como:* treinar dois modelos com o mesmo dataset, as mesmas *folds* e a mesma semente — um com o bloco de features de vizinhança, outro sem — e comparar a **mediana de RMSE por talhão sob LOFO**, não sob split aleatório.
  *Falha:* o bloco entra no MVP **apenas** se a melhora sob LOFO for maior que a dispersão entre *folds*. Melhora só sob split aleatório, ou empate, reprova a hipótese e o bloco fica fora.

### C. Vazamento por processamento

- [ ] **C1 — Nenhuma estatística global usada em transformação.**
  *O que:* normalização, imputação, winsorização e encoding ajustados apenas no fold de treino.
  *Como:* toda transformação dentro de `sklearn.pipeline.Pipeline`; teste — comparar `scaler.mean_` do fold com a média do dataset completo.
  *Falha:* coincidência exata (até a tolerância numérica) entre os dois.

- [ ] **C2 — Seleção de features dentro da CV aninhada.**
  *O que:* RFE/RFECV e seleção por importância acontecem no loop interno.
  *Como:* asserção estrutural — o objeto de seleção é componente do `Pipeline` passado ao `cross_val_score` externo, nunca ajustado antes.
  *Falha:* seleção executada fora do pipeline.

- [ ] **C3 — Busca de hiperparâmetros dentro da CV aninhada, com grupos.**
  *O que:* `GridSearchCV`/`RandomizedSearchCV` com `cv=GroupKFold` sobre os talhões de treino.
  *Como:* inspeção do objeto de busca; registro do número de configurações avaliadas.
  *Falha:* `cv` sem grupos, **ou** busca executada fora do loop externo.

- [ ] **C4 — Conjunto externo (fazenda) avaliado uma única vez.**
  *O que:* contador de avaliações no hold-out externo.
  *Como:* log persistido; incrementa a cada chamada de avaliação sobre `fazenda_externa`.
  *Falha:* contador > 1 antes do relatório final.

### D. Vazamento pelo alvo

- [ ] **D1 — Nenhuma feature derivada do alvo no modelo cold-start.**
  *O que:* zonas de manejo derivadas de colheita, classificação de estabilidade, target encoding.
  *Como:* campo booleano `derivada_do_alvo` no lineage de cada feature; asserção de que nenhuma está marcada.
  *Falha:* qualquer feature com `derivada_do_alvo=True`.

- [ ] **D2 — Target encoding calculado dentro do fold.**
  *O que:* codificação de cultivar, unidade de solo e zona.
  *Como:* encoder dentro do `Pipeline`; alternativamente usar categórica nativa de LightGBM.
  *Falha:* encoder ajustado sobre o dataset completo.

- [ ] **D3 — A média informada da safra não é feature.**
  *O que:* nem a média, nem o fator de ajuste do `colheita.py`, nem qualquer derivado.
  *Como:* lista negra por nome + verificação de correlação: correlação de Pearson entre cada feature e a média do talhão-safra.
  *Falha:* feature da lista negra presente, **ou** correlação com a média do talhão-safra acima de 0,95 sem justificativa registrada. **`[HIPÓTESE]`: o corte de 0,95 é escolha deste projeto; a base não traz limiar de correlação para detecção de vazamento `[LACUNA]`.**

- [ ] **D4 — O alvo primário é `yield_sem_ajuste`.**
  *O que:* decisão de §4.8.
  *Como:* asserção sobre o nome da coluna-alvo do experimento primário; o experimento com `yield_ajustado` roda como sensibilidade separada.
  *Falha:* alvo primário diferente de `yield_sem_ajuste` sem registro de decisão.

- [ ] **D5 — O resíduo defasado do experimento "resíduo persistente" vem de modelo treinado SEM a safra retida.**
  *O que:* no experimento (b) de ADR D9 (item 2-bis), o resíduo krigado da safra `t−k` usado como feature/offset tem de ser um resíduo **out-of-fold**. A regra "só safras estritamente anteriores a `data_previsao`" restringe a **data da observação**, não a **procedência do modelo que gerou o resíduo**: sob leave-one-year-out com a safra `t` retida, um resíduo de `t−1` calculado pelo modelo global treinado em todas as safras (inclusive `t`) carrega informação da safra de teste — é o mesmo mecanismo de D2, aplicado a outro objeto.
  *Como:* o lineage da feature registra o identificador do modelo que a produziu e o conjunto de safras usadas no seu treino; asserção de que `safra_retida ∉ safras_de_treino_do_modelo_do_residuo`, por fold externo. Os resíduos são **recalculados dentro de cada fold externo**, nunca reaproveitados entre folds.
  *Falha:* resíduo produzido por modelo cujo treino inclui a safra retida, resíduo sem lineage de procedência, ou resíduo calculado uma única vez fora do laço externo.

### E. Sanidade e qualidade do alvo

- [ ] **E1 — Percentual removido pela limpeza dentro da faixa esperada.**
  *O que:* fração de pontos de colhedora descartada por talhão-safra, por estágio de filtro.
  *Como:* log por estágio; comparar com ~30% de `[H-13]` e com a faixa de 10–50% de `[H-12]`.
  *Falha:* remoção < 5% (filtro frouxo) ou > 60% (filtro agressivo) — bloqueia o talhão-safra para revisão manual. **`[HIPÓTESE]`: os limites 5% e 60% são escolha deste projeto, com folga em torno dos valores das fontes; nem 5% nem 60% vêm de `[H-12]` ou `[H-13]`.** Fixados antes do experimento para não serem ajustados ao resultado.

- [ ] **E2 — Densidade mínima de pontos de colhedora por célula.**
  *O que:* número de pontos brutos que geraram cada célula de 20 m.
  *Como:* contagem armazenada junto do grid.
  *Falha:* célula com contagem abaixo do limiar definido → excluída do treino e marcada na interface.

- [ ] **E3 — R² de split aleatório absurdamente alto.**
  *O que:* detector genérico de vazamento.
  *Como:* R² da Validação 1 em nível de célula.
  *Falha:* R² > 0,97 → investigação obrigatória antes de qualquer reporte (referência do padrão: `[H-04]`, R²=0,9949 "sem realismo espacial"). **`[HIPÓTESE]`: 0,97 é escolha deste projeto** — `[H-04]` fornece o exemplo (0,9949), não o limiar; a base não define a partir de que valor um R² é "absurdamente alto" `[LACUNA]`.

- [ ] **E4 — Gap entre random e LOFO dentro do esperado.**
  *O que:* `R²_random − R²_LOFO`.
  *Como:* comparar os dois esquemas no mesmo modelo e conjunto.
  *Falha:* gap **próximo de zero** é tão suspeito quanto gap enorme — sugere que o esquema de grupo não está separando de fato (checar B1/B2).

### F. Incerteza e explicabilidade

- [ ] **F1 — Intervalo de talhão não obtido por soma de variâncias independentes.**
  *O que:* §8.3.
  *Como:* comparar a largura do intervalo do talhão com a largura mediana do intervalo de célula.
  *Falha:* intervalo de talhão mais estreito que ~1/√n vezes o de célula → indica soma de variâncias independentes.

- [ ] **F2 — Cobertura empírica medida no esquema de validação correto.**
  *O que:* PICP calculado sob LOFO/LOYO, não sob split aleatório.
  *Como:* fração de observações dentro do intervalo, por fold de grupo.
  *Falha:* ausência da métrica, **ou** cobertura desviando do nominal sem registro (referência de que isso acontece: `[G-13]`, ≥84% para nominal de 95%).

- [ ] **F3 — Mapas SHAP gerados a partir do modelo validado por grupo.**
  *O que:* §9.2, pitfall 4.
  *Como:* asserção sobre a procedência do modelo usado para explicação.
  *Falha:* SHAP calculado sobre o modelo do split aleatório.

- [ ] **F4 — Predição fora da AOA não é exibida como número pontual.**
  *O que:* §3.6.
  *Como:* DI da célula/talhão comparado ao limiar derivado do treino.
  *Falha:* exibição de valor pontual ou intervalo estreito para DI acima do limiar.

---

## 12. Tabela-resumo de riscos

Probabilidade e impacto são avaliações `[HIPÓTESE]` deste documento para o contexto da Invicta (regime de 20–100 talhões-safra), não medições da literatura. As colunas `ids` apontam a evidência que sustenta a existência do risco.

| # | Risco | Prob. | Impacto | Mitigação | ids |
|---|---|---|---|---|---|
| R1 | Split aleatório de células infla as métricas e o produto decepciona em campo | **Alta** | **Alto** | GroupKFold por talhão como métrica primária; random só como benchmark e detector | `[C-01]`, `[C-11]`, `[C-12]`, `[D-12]`, `[B-04]`, `[C-14]`, `[B-15]` |
| R2 | Modelo aprende posição em vez de agronomia | **Alta** | **Alto** | Coordenadas e proxies fora das features; teste do modelo-só-posição (B3) | `[C-01]`, `[C-10]` |
| R3 | LOFO com poucos talhões-safra dá estimativa instável (R² negativo, variância alta) | **Alta** | Médio | Reportar distribuição + mediana + RMSE + comparação com modelo nulo; não reportar média de R² | `[C-11]`, `[C-01]` |
| R4 | LOYO inviável por número de safras | **Alta** | Médio | Tratar LOYO como diagnóstico qualitativo até ≥4 safras (limiar `[HIPÓTESE]` deste projeto, §3.4); declarar `[LACUNA]` | `[C-11]`, `[A-03]` |
| R5 | Imagens/clima posteriores à data da previsão entram nas features | **Média** | **Alto** | Campo `data_previsao` obrigatório + filtro na consulta; modelo por janela de antecedência; testes A1/A2 | `[A-03]`, `[B-10]` |
| R6 | Normalização/estatística global antes do split | **Média** | Médio | `Pipeline` ajustado dentro do fold; teste C1 | `[C-07]` |
| R7 | Seleção de features/hiperparâmetros fora de CV aninhada | **Alta** | Médio | CV aninhada com grupos; registrar nº de configurações; testes C2/C3 | `[C-07]`, `[D-12]`, `[C-11]` |
| R8 | Krigagem/IDW cruzando fronteira ou usando pontos de teste | **Média** | **Alto** | Interpolação contida no talhão; lineage com `ponto_id`; testes B5/B6 | `[C-05]`, `[D-03]`, `[D-09]` — efeito não medido na base (`[LACUNA]`) |
| R9 | Histórico do próprio talhão confundindo cold start com caso fácil | **Média** | **Alto** | Dois modelos declarados e avaliados separadamente; histórico sempre defasado; teste A3 | `[D-04]`, `[D-10]` |
| R10 | Features derivadas do alvo (zonas, estabilidade, target encoding) | **Média** | **Alto** | `derivada_do_alvo` no lineage; encoding dentro do fold; testes D1/D2 | `[C-07]`, `[H-04]`, `[D-07]` |
| R11 | "Ajuste à média real" muda o significado da métrica | **Média** | Médio | Dois alvos armazenados; treinar com `yield_sem_ajuste`; decompor erro de nível vs. de padrão; teste D3/D4 | `[H-14]` — classificação é `[HIPÓTESE]` |
| R12 | Erro do alvo (mapa de colhedora) estabelece teto de acurácia invisível | **Alta** | **Alto** | Auditar `colheita.py` contra Moran local; logar % removido por estágio; quantificar e reportar o erro do alvo | `[H-12]`, `[H-13]`, `[H-14]` |
| R13 | Desalinhamento pixel × ponto de colhedora | **Alta** | Médio | Offset de fluxo calibrável por colhedora; mediana por célula; contagem de pontos por célula | `[H-14]`, `[B-07]` |
| R14 | Suavização por IDW e agregação de grid inflam a métrica | **Alta** | Médio | Reportar em três escalas separadas e rotuladas | `[B-04]`, `[B-08]` |
| R15 | Erro em cascata de mapas krigados como features | **Média** | Médio | Propagar variância de krigagem; ablação sob LOFO; densidade amostral no lineage e no gate da AOA | `[C-05]`, `[C-10]`, `[D-03]`, `[D-09]`, `[H-04]` |
| R16 | Ano extremo destrói a previsão justamente quando ela mais vale | **Média** | **Alto** | Classificar cada safra no relatório; gate de AOA para safra fora do domínio; não prometer desempenho em ano atípico | `[A-03]`, `[C-11]`, `[D-12]` |
| R17 | Intervalo de incerteza com cobertura abaixo do nominal | **Alta** | **Alto** | PICP/PINAW medidos sob LOFO/LOYO; cobertura condicional por talhão e por faixa; teste F2 | `[G-13]`, `[G-01]`, `[G-04]` |
| R18 | Agregar incerteza de células somando variâncias independentes | **Média** | **Alto** | Calibrar no nível do talhão; bootstrap por bloco; usar covariância do variograma; teste F1 | `[G-04]` |
| R19 | Adotar método de incerteza complexo sem ganho | **Média** | Baixo | Começar por QRF/CQR; comparar contra regressão quantílica simples antes de escalar | `[G-14]`, `[G-02]`, `[G-01]` |
| R20 | SHAP interpretado como causalidade por agrônomo ou cliente | **Alta** | **Alto** | Texto de ressalva fixo na interface; verbo associativo; sem recomendação de manejo derivada de SHAP | `[G-09]`, `[G-12]` |
| R21 | Importância instável entre folds reportada como verdade agronômica | **Alta** | Médio | SHAP agregado sobre folds com dispersão visível; marcação de baixa confiança | `[G-12]`, `[G-09]` |
| R22 | PDP com features correlacionadas gerando gráfico enganoso | **Alta** | Médio | ALE como padrão; PDP só para features pouco correlacionadas; agrupar espectrais na interface | `[G-08]`, `[G-09]` |
| R23 | Explicar modelo que não generaliza | **Média** | **Alto** | SHAP só a partir do modelo validado por grupo; teste F3 | `[G-09]`, `[C-01]` |
| R24 | Resíduo espacialmente estruturado não detectado | **Média** | Médio | Moran's I dos resíduos por talhão e por fold; mapa de clusters de erro | `[C-10]`, `[D-12]`, `[C-13]`, `[H-01]` |
| R25 | Adotar limiar de RMSE de outro estudo como meta | **Média** | Médio | Não adotar limiar universal (não existe na base); critério relativo definido com a agronomia | `[A-03]`, `[B-15]`, `[C-11]`, `[D-12]` |
| R26 | Prever fora do domínio de treino sem aviso | **Alta** | **Alto** | DI/AOA como gate de exibição no MVP; teste F4 | `[C-04]`, `[C-05]` |

---

## 13. Referências citadas

Ordenadas por `paper_id`. `ftr` = extensão da leitura registrada na base (`completo` / `abstract` / `so_metadados`).

| id | Referência | ftr |
|---|---|---|
| `A-03` | Shahhosseini M., Hu G., Huber I., Archontoulis S.V. (2021). *Coupling machine learning and crop modeling improves crop yield prediction in the US Corn Belt.* Scientific Reports. DOI 10.1038/s41598-020-80820-1 | completo |
| `B-04` | Deines J., Patel R., Liang S., Dado W.T., Lobell D. (2021). *A million kernels of truth: Insights into scalable satellite maize yield mapping and yield gap analysis from an extensive ground dataset in the US Corn Belt.* Remote Sensing of Environment. DOI 10.1016/j.rse.2020.112174 | abstract |
| `B-07` | Pejak B. et al. (2022). *Soya Yield Prediction on a Within-Field Scale Using Machine Learning Models Trained on Sentinel-2 and Soil Data.* Remote Sensing. DOI 10.3390/rs14092256 | abstract |
| `B-08` | Skakun S. et al. (2021). *Assessing within-Field Corn and Soybean Yield Variability from WorldView-3, Planet, Sentinel-2, and Landsat 8 Satellite Imagery.* Remote Sensing. DOI 10.3390/rs13050872 | abstract |
| `B-09` | Kross A. et al. (2020). *Using Artificial Neural Networks and Remotely Sensed Data to Evaluate the Relative Importance of Variables for Prediction of Within-Field Corn and Soybean Yields.* Remote Sensing. DOI 10.3390/rs12142230 | abstract |
| `B-10` | Joshi D.R. et al. (2023). *Artificial Intelligence and Satellite Based Remote Sensing can be used to Predict Soybean (Glycine max) Yield.* Agronomy Journal. DOI 10.1002/agj2.21473 | abstract |
| `B-15` | Pereira E.C. et al. (2026). *Soybean yield estimation in the Brazilian Midwest using Sentinel-2 imagery.* Big Earth Data. DOI 10.1080/20964471.2026.2631900 | abstract |
| `C-01` | Ploton P. et al. (2020). *Spatial validation reveals poor predictive performance of large-scale ecological mapping models.* Nature Communications. DOI 10.1038/s41467-020-18321-y | completo |
| `C-02` | Roberts D.R. et al. (2017). *Cross-validation strategies for data with temporal, spatial, hierarchical, or phylogenetic structure.* Ecography. DOI 10.1111/ecog.02881 | abstract |
| `C-03` | Wadoux A.M.J.-C., Heuvelink G.B.M., de Bruin S., Brus D.J. (2021). *Spatial cross-validation is not the right way to evaluate map accuracy.* Ecological Modelling. DOI 10.1016/j.ecolmodel.2021.109692 | completo |
| `C-04` | Meyer H., Pebesma E. (2021). *Predicting into unknown space? Estimating the area of applicability of spatial prediction models.* Methods in Ecology and Evolution. DOI 10.1111/2041-210X.13650 | abstract |
| `C-05` | Meyer H., Pebesma E. (2022). *Machine learning-based global maps of ecological variables and the challenge of assessing them.* Nature Communications. DOI 10.1038/s41467-022-29838-9 | completo |
| `C-06` | Valavi R., Elith J., Lahoz-Monfort J.J., Guillera-Arroita G. (2019). *blockCV: An R package for generating spatially or environmentally separated folds for k-fold cross-validation of species distribution models.* Methods in Ecology and Evolution. DOI 10.1111/2041-210X.13107 | completo |
| `C-07` | Kapoor S., Narayanan A. (2023). *Leakage and the reproducibility crisis in machine-learning-based science.* Patterns. DOI 10.1016/j.patter.2023.100804 | abstract |
| `C-08` | Milà C., Mateu J., Pebesma E., Meyer H. (2022). *Nearest neighbour distance matching Leave-One-Out Cross-Validation for map validation.* Methods in Ecology and Evolution. DOI 10.1111/2041-210X.13851 | abstract |
| `C-09` | Linnenbrink J., Milà C., Ludwig M., Meyer H. (2024). *kNNDM CV: k-fold nearest-neighbour distance matching cross-validation for map accuracy estimation.* Geoscientific Model Development. DOI 10.5194/gmd-17-5897-2024 | completo |
| `C-10` | Hengl T., Nussbaum M., Wright M.N., Heuvelink G.B.M., Gräler B. (2018). *Random forest as a generic framework for predictive modeling of spatial and spatio-temporal variables.* PeerJ. DOI 10.7717/peerj.5518 | abstract |
| `C-11` | Rathore J. et al. (2026). *On-farm soybean yield estimation using earth observation data and machine learning models.* Frontiers in Agronomy. DOI 10.3389/fagro.2026.1923239 | completo |
| `C-12` | Stock A. (2025). *Choosing blocks for spatial cross-validation: lessons from a marine remote sensing case study.* Frontiers in Remote Sensing. DOI 10.3389/frsen.2025.1531097 | completo |
| `C-13` | Khan S.N., Li D., Maimaitijiang M. (2022). *A Geographically Weighted Random Forest Approach to Predict Corn Yield in the US Corn Belt.* Remote Sensing. DOI 10.3390/rs14122843 | abstract |
| `C-14` | Habibi L.N., Matsui T., Tanaka T.S.T. (2023). *The effects of a cross-validation approaches on the model transferability of a soybean yield prediction model using UAV-based remote sensing.* Anais JASS Hiroshima 2023 (**proceedings**, sem DOI) | completo |
| `D-03` | Corwin D.L., Lesch S.M. (2005). *Apparent soil electrical conductivity measurements in agriculture.* Computers and Electronics in Agriculture. DOI 10.1016/j.compag.2004.10.005 | completo |
| `D-04` | Maestrini B., Basso B. (2018). *Predicting spatial patterns of within-field crop yield variability.* Field Crops Research. DOI 10.1016/j.fcr.2018.01.028 | completo |
| `D-05` | Maestrini B., Basso B. (2018). *Drivers of within-field spatial and temporal variability of crop yield across the US Midwest.* Scientific Reports. DOI 10.1038/s41598-018-32779-3 | completo |
| `D-07` | Smidt E.R., Conley S.P., Zhu J., Arriaga F.J. (2016). *Identifying Field Attributes that Predict Soybean Yield Using Random Forest Analysis.* Agronomy Journal. DOI 10.2134/agronj2015.0222 | abstract |
| `D-09` | Adhikari K. et al. (2022). *Mapping Within-Field Soil Health Variations Using Apparent Electrical Conductivity, Topography, and Machine Learning.* Agronomy. DOI 10.3390/agronomy12051019 | abstract |
| `D-10` | Maestrini B., Basso B. (2021). *Subfield crop yields and temporal stability in thousands of US Midwest fields.* Precision Agriculture. DOI 10.1007/s11119-021-09810-1 | abstract |
| `D-12` | Smith H.W. et al. (2026). *Harvesting insights: interpretable machine learning to understand environmental drivers of U.S. maize and soybean yield.* Scientific Reports. DOI 10.1038/s41598-026-38724-z | completo |
| `G-01` | Romano Y., Patterson E., Candès E. (2019). *Conformalized Quantile Regression.* NeurIPS 2019 (sem DOI formal) | abstract |
| `G-02` | Meinshausen N. (2006). *Quantile Regression Forests.* JMLR 7:983–999 (sem DOI formal) | completo |
| `G-03` | Angelopoulos A.N., Bates S. (2023). *Conformal Prediction: A Gentle Introduction.* Foundations and Trends in Machine Learning 16(4). DOI 10.1561/2200000101 | abstract |
| `G-04` | Mao H., Martin R., Reich B. (2024). *Valid Model-Free Spatial Prediction.* JASA 119(546):904–914. DOI 10.1080/01621459.2022.2147531 | abstract |
| `G-05` | Duan T. et al. (2020). *NGBoost: Natural Gradient Boosting for Probabilistic Prediction.* ICML, PMLR 119:2690–2700 (sem DOI formal) | abstract |
| `G-06` | Gyamerah S.A., Ngare P., Ikpe D. (2020). *Probabilistic forecasting of crop yields via quantile random forest and Epanechnikov Kernel function.* Agricultural and Forest Meteorology. DOI 10.1016/j.agrformet.2019.107808 | abstract |
| `G-07` | Lundberg S.M. et al. (2020). *From local explanations to global understanding with explainable AI for trees.* Nature Machine Intelligence 2:56–67. DOI 10.1038/s42256-019-0138-9 | abstract |
| `G-08` | Apley D.W., Zhu J. (2020). *Visualizing the Effects of Predictor Variables in Black Box Supervised Learning Models.* JRSS-B 82(4):1059–1086. DOI 10.1111/rssb.12377 | abstract |
| `G-09` | Molnar C. et al. (2022). *General Pitfalls of Model-Agnostic Interpretation Methods for Machine Learning Models.* xxAI — Beyond Explainable AI, LNAI 13200:39–68. DOI 10.1007/978-3-031-04083-2_4 | abstract |
| `G-11` | Najjar H., Miranda M., Nuske M., Roscher R., Dengel A. (2024). *Explainability of Sub-Field Level Crop Yield Prediction using Remote Sensing.* arXiv (**preprint** — revisão por pares não confirmada) | abstract |
| `G-12` | Fisher A., Rudin C., Dominici F. (2019). *All Models are Wrong, but Many are Useful: Learning a Variable's Importance by Studying an Entire Class of Prediction Models Simultaneously.* JMLR 20(177):1–81 (sem DOI formal) | completo |
| `G-13` | Ma Y., Zhang Z., Kang Y., Özdoğan M. (2021). *Corn yield prediction and uncertainty analysis based on remotely sensed variables using a Bayesian neural network approach.* Remote Sensing of Environment. DOI 10.1016/j.rse.2021.112408 | abstract |
| `G-14` | Xiong T., Xia M., Li G., Li J., Xia W. (2025). *Beyond point forecasting: Probability density forecasting of corn yield based on quantile regression forest.* IFAMR 28(2). DOI 10.22434/ifamr1134 | abstract |
| `H-01` | Haghighattalab A. et al. (2017). *Application of Geographically Weighted Regression to Improve Grain Yield Prediction from Unmanned Aerial System Imagery.* Crop Science. DOI 10.2135/cropsci2016.12.1016 | abstract |
| `H-04` | Saravanakumar R. et al. (2026). *Hybridizing deep learning algorithms and geostatistical approaches for improved crop yield disaggregation.* PLOS One. DOI 10.1371/journal.pone.0344081 | completo |
| `H-12` | Sudduth K.A., Drummond S.T. (2007). *Yield Editor: Software for Removing Errors from Crop Yield Maps.* Agronomy Journal. DOI 10.2134/agronj2006.0326 | abstract |
| `H-13` | Vega A., Córdoba M., Castro-Franco M., Balzarini M. (2019). *Protocol for automating error removal from yield maps.* Precision Agriculture. DOI 10.1007/s11119-018-09632-8 | abstract |
| `H-14` | Lyle G., Bryan B.A., Ostendorf B. (2013/2014). *Post-processing methods to eliminate erroneous grain yield measurements: review and directions for future development.* Precision Agriculture. DOI 10.1007/s11119-013-9336-3 | abstract |

---

## Lacunas declaradas neste documento

Resumo das perguntas para as quais **não há evidência na base revisada**:

1. Magnitude da inflação de métrica por split aleatório em **soja, Brasil, grid de 20 m** — nenhum estudo mede isso (§1.2).
2. Nenhum estudo combina **LOFO-CV e LOYO-CV** em soja no Brasil intra-talhão (§3.7).
3. **Número mínimo de safras** para uma leave-one-year-out robusta (§3.4, §7).
4. Vazamento por **interpolação** (mapa krigado como feature) nunca foi testado explicitamente (§4.4, §6).
5. O **"ajuste à média real"** como fonte de vazamento não é discutido por nenhum estudo da base; a classificação e a decisão deste documento são `[HIPÓTESE]` conservadora (§4.8).
6. Calibração de **ensembles/bootstrap** para incerteza de produtividade (§8.1).
7. Nenhum estudo de **QRF ou conformal aplicado a soja no Brasil em escala intra-talhão**; `[G-04]` (conformal espacial) nunca foi validado em dados agrícolas (§8.5).
8. Nenhum artigo revisado por pares com **mapa de SHAP por pixel para soja no Brasil** (§9.1).
9. Não existe **limiar universal de erro "operacionalmente útil"** na base revisada (§10.2).
10. Nenhuma **curva contínua** de R²/RMSE por dia-antes-da-colheita para soja intra-talhão (§4.1).
