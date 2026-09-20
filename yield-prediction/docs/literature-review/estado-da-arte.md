# Estado da Arte — Predição de Produtividade Agrícola com IA

> Documento 1 da Fase 1 (seção 52 do pedido original). Base única de evidência:
> `yield-prediction/docs/literature-review/papers-database.csv` (87 estudos únicos: 77 DOIs
> conferidos no Crossref/DataCite e 10 estudos sem DOI, com URL testada)
> e o registro de verificação da base, resumido em [`verificacao-citacoes.md`](./verificacao-citacoes.md).
> Nenhuma afirmação técnica deste documento vem de conhecimento próprio do redator ou de busca
> na web: toda ela é rastreável a um `paper_id` da base. Onde a base não sustenta resposta, está
> escrito **"sem evidência na base revisada"**.

**Convenções de rótulo** (seções 45 e 58 do pedido):

| Rótulo | Significado |
|---|---|
| **[EVIDÊNCIA]** | Sustentado por estudo(s) da base revisada. |
| **[CONSENSO]** | **Dois ou mais** estudos independentes da base convergem, e todos são citados no mesmo parágrafo. Um único estudo — por mais robusto que seja — nunca recebe este rótulo. |
| **[EVIDÊNCIA LIMITADA]** | Um ou dois estudos, ou fora da cultura/escala do nosso caso. |
| **[RESULTADO ESPECÍFICO]** | Achado de um estudo, sob condições dele — não generalizável. |
| **[HIPÓTESE]** | Ainda precisa ser testado; não há evidência direta na base. |
| **[LACUNA]** | A base revisada não cobre a pergunta. |
| **[DECISÃO → ADR-001 Dn]** | Decisão já tomada e justificada (alternativas, evidências, consequências) na decisão `Dn` do [`ADR-001`](../decisions/ADR-001-model-strategy.md); aqui ela é apenas **aplicada**. As seções 20 e 46 do pedido exigem que decisões morem em `docs/decisions/`, então este documento **não usa `[DECISÃO]` nu**. |

**Unidades.** A unidade interna deste projeto é **kg/ha**. Conversão: 1 sc = 60 kg
(ex.: 3.600 kg/ha = 60 sc/ha). Quando um estudo reporta t/ha ou Mg/ha, o valor é transcrito na
unidade original do estudo e a unidade vem explícita na mesma linha — nunca convertida em silêncio.

**Regra de comparação.** Nenhum R²/RMSE deste documento deve ser comparado a outro sem que
cultura, escala, resolução e **tipo de validação** sejam os mesmos. Esta regra é operacionalizada
na `matriz-comparativa.md`, que ordena os estudos pelo rigor do esquema de validação.

---

## 0. Escopo, método da revisão e limitações

### 0.1 Escopo

A revisão cobre predição **espacial** de produtividade agrícola com sensoriamento remoto e
aprendizado de máquina, com foco declarado em: **soja**, **Brasil**, **escala intra-talhão**
(grade de ~20 m), **previsão pré-colheita**, com **incerteza** e **explicabilidade**.

Estudos de outras culturas (milho, trigo, canola, algodão), de outras escalas (talhão, município,
regional) e de outros domínios (biomassa florestal, clorofila marinha, estatística geral) foram
incluídos quando trazem evidência **metodológica** transferível — sobretudo sobre validação
espacial, incerteza e explicabilidade, onde a literatura de soja é escassa. Toda vez que isso
acontece, a distância entre o estudo e o nosso caso é declarada na mesma frase.

### 0.2 Método da revisão

A busca foi organizada em **8 eixos temáticos**, cada um conduzido por um pesquisador dedicado a
partir da estratégia de busca das seções 6.1 e 7 do pedido original:

| Eixo | Tema | Estudos na base final |
|---|---|---|
| A | Classes de modelos (estatístico / ML / DL / híbridos) | 11 |
| B | Sensoriamento remoto, índices, resolução, fenologia | 15 |
| C | Vazamento espacial/temporal e esquemas de validação | 14 |
| D | Preditores não-espectrais (solo, CEa, relevo, clima, manejo) | 12 |
| E | Estudos brasileiros | 9 |
| F | Soluções comerciais e operacionais | (não entra nesta base — ver `benchmarks/commercial.md`) |
| G | Fontes de dados, incerteza e explicabilidade (XAI) | 13 |
| H | Lacunas deixadas pelos eixos anteriores | 13 |
| **Total** | | **87 estudos únicos** |

Os 8 eixos produziram 92 registros; a deduplicação por DOI identificou 4 grupos duplicados e
consolidou a base em **87 estudos únicos**. Os `paper_id` sobreviventes das fusões são: **A-03**
(absorveu C-15 e G-10), **B-03** (absorveu E-brasil-11), **B-12** (absorveu E-brasil-06, com o
conteúdo mais completo da versão E) e **C-13** (absorveu H-02). Os ids descontinuados não são
citados neste documento.

**Como as citações foram verificadas** (números de `verificacao.md`):

- **77 DOIs únicos** consultados de forma independente (Crossref; 1 via DataCite): **77/77
  resolvidos, 0 não-encontrado**. Título (comparação de similaridade), ano (±1) e primeiro autor
  conferidos: **76 corretos de imediato, 1 corrigido** (G-03, cujo DOI aponta para a monografia
  publicada em 2023 e não para o preprint de 2021).
- **10 estudos sem DOI** (teses, monografia, proceedings, publicação técnica, papers de NeurIPS/
  ICML/JMLR): as 10 URLs responderam HTTP 200.
- **Auditoria literal de métricas**: das 87 linhas, **37 continham R²/RMSE/MAE numérico** e as
  **37 foram reconferidas contra o texto-fonte** (4 exigiram checagem manual por diferença de
  notação, ex.: percentual vs. fração). As outras **50 linhas não têm métrica numérica** e foram
  deixadas em branco — nenhum valor foi inventado para preencher tabela.
- Atenção redobrada aos 8 estudos de **2025–2026** (A-11, B-14, B-15, C-11, C-12, D-12, G-14,
  H-04): todos confirmados no Crossref como artigo de periódico publicado, com o nome do
  periódico batendo com o registrado na base.

**Profundidade de leitura efetivamente alcançada** — este é o dado mais importante para calibrar
a confiança de qualquer afirmação deste documento:

| Nível de leitura | Estudos | % |
|---|---:|---:|
| **Texto completo (íntegra)** | 27 | 31% |
| **Somente abstract verbatim** | 54 | 62% |
| **Somente metadados** (título/DOI confirmados, sem abstract acessível) | 6 | 7% |

E por natureza da publicação:

| Tipo | Estudos |
|---|---:|
| Revisado por pares (`sim`) | 81 |
| Preprint | 1 (G-11) |
| Tese / dissertação | 2 (E-brasil-02, E-brasil-03) |
| Relatório / monografia / proceedings | 3 (C-14, D-11, E-brasil-05) |

**Regra de citação aplicada neste documento:** a primeira vez que um estudo lido apenas em
abstract é citado, a citação traz a marca — ex.: `[B-08, só abstract]`. Estudos em nível de
**metadados** (`E-brasil-08`, `E-brasil-09`, `E-brasil-10`, `H-05`, `H-07`, `H-11`) **não
sustentam nenhuma afirmação além de "este estudo existe"** e aparecem apenas como rastro de
busca. O nível de leitura de cada estudo está na tabela da seção 9.

**Cobertura temática da base** (contagens diretas do CSV):

| Recorte | Estudos |
|---|---:|
| Cultura contém soja/soybean | 45 |
| País = Brasil | 17 |
| Escala intra-talhão | 22 |
| Com validação talhão-fora **ou** ano-fora declarada (`val_field_out=sim` ou `val_year_out=sim`) | **11** |

O último número é o achado estrutural da revisão: **de 87 estudos, apenas 11 declaram algum
esquema de validação que simula o caso de uso real do produto** (talhão ou safra nunca vistos) —
2 com talhão-fora ([C-11], [C-14]) e 9 com ano-fora ([A-03], [A-04], [A-09], [A-10], [B-04],
[B-09], [D-12], [E-brasil-04], [G-13]).

*(Correção pós-verificação: a contagem era 13 e incluía [G-04] e [G-11], cujo próprio campo
`validation` diz "não especificado no abstract" — marcá-los como talhão-fora era contradição
interna do CSV. Ver [`verificacao-citacoes.md`](./verificacao-citacoes.md), adendo C-05.)*

### 0.3 Limitações da própria revisão

**[LIMITAÇÃO 1 — paywall.]** Apenas 31% dos estudos foram lidos na íntegra. Elsevier
(ScienceDirect), Springer, Wiley e, em parte, MDPI bloquearam o acesso direto (HTTP 403) em
praticamente todas as rotas permitidas, e a regra de integridade desta pesquisa proibiu o uso de
proxies/caches de terceiros. Consequência prática: **para 54 estudos só temos o que o abstract
diz**, e abstracts sistematicamente omitem o esquema de validação, o número de talhões e a
unidade das métricas — as três informações de que mais precisamos. Seis estudos (incluindo três
brasileiros recentes: E-brasil-08, E-brasil-09, E-brasil-10) ficaram só em metadados.

**[LIMITAÇÃO 2 — não é uma revisão sistemática no sentido PRISMA.]** Não houve protocolo
registrado a priori, não houve dupla triagem independente por dois revisores, não houve
fluxograma PRISMA de identificados → triados → elegíveis → incluídos, e não houve avaliação
formal de risco de viés por instrumento padronizado. A seleção foi guiada pelo mandato de cada
eixo e pela relevância para o caso de uso. O documento deve ser lido como **revisão narrativa
estruturada e auditável**, não como revisão sistemática.

**[LIMITAÇÃO 3 — viés pró-acesso aberto.]** A base está enviesada na direção do que é gratuito e
abre sem autenticação: Nature/Scientific Reports, PLOS ONE, Frontiers, PMC, Remote Sensing
(MDPI), Copernicus/ISPRS, repositórios institucionais (Embrapa/Alice, UFSM, USP) e repositórios
oficiais do USDA-ARS. Periódicos-chave para agricultura de precisão que ficam atrás de paywall —
*Precision Agriculture*, *Computers and Electronics in Agriculture*, *Field Crops Research*,
*Remote Sensing of Environment*, *Agricultural and Forest Meteorology* — estão representados
majoritariamente por abstract ou por metadados. **Isso provavelmente subestima a literatura
aplicada de agricultura de precisão e superestima a literatura metodológica de acesso aberto.**

**[LIMITAÇÃO 4 — assimetria entre eixos.]** O eixo C (validação) e o eixo G (incerteza/XAI) são
alimentados em boa parte por literatura **fora da agricultura** (ecologia, sensoriamento remoto
marinho, estatística, medicina). Isso é assumido: as respostas metodológicas desses eixos valem
como princípio geral, não como resultado replicado em soja brasileira. Sempre que uma
recomendação metodológica depende dessa transferência, ela está rotulada.

**[LIMITAÇÃO 5 — métrica não comparável entre estudos.]** As unidades reportadas na base são
heterogêneas: R² adimensional, RMSE em kg/ha, t/ha, Mg/ha, q/ha, RRMSE %, MAPE %, CCC, fração de
variância capturada, erro relativo em faixas percentuais. Três casos exigem cuidado explícito e
estão sinalizados ao longo do texto: **B-14** reporta CCC (não é R²/RMSE, não comparar);
**H-09** reporta fração de variância capturada (não é R² clássico); **C-09** teve o R² removido da
base porque o valor de 28% era a fração de variação do RMSE explicada por uma estatística de
Wasserstein, não um R² de predição.

**[LIMITAÇÃO 6 — ausência de resultado próprio.]** Nada neste documento é rotulado
**[RESULTADO]**: não há, nesta fase, nenhum experimento conduzido pelo projeto. Toda a seção 8
("quais técnicas testar primeiro") é uma priorização de hipóteses derivada da literatura, não um
resultado.

---

## 1. Panorama — metodologias e escalas

### 1.1 As cinco famílias metodológicas encontradas

**(a) Modelos agrometeorológicos / mecanísticos puros.**
Modelos determinísticos que traduzem radiação, temperatura, chuva e balanço hídrico em
produtividade potencial e penalizada. Na base, o representante brasileiro clássico é o AGROMET
aplicado a 144 municípios do Paraná em 5 safras [E-brasil-01]. **[RESULTADO ESPECÍFICO]** O
estudo é também uma lição sobre os limites da família: o modelo superestimou a produtividade em
10,8% na safra 96/97 por causa de uma doença fúngica não modelada, e subestimou em 10,5% em
00/01 por não capturar datas de semeadura e cultivares. Modelos de simulação de cultura calibrados
(CSM CROPGRO) também aparecem para decompor o *yield gap* da soja no subtrópico brasileiro
[D-08, só abstract].

**(b) Modelos estatísticos clássicos e espaciais.**
Regressão múltipla, PLSR, modelos mistos e regressão geograficamente ponderada (GWR).
**[RESULTADO ESPECÍFICO]** PLSR sobre reflectância foliar hiperespectral em soja no Paraná
alcançou R² de 0,731–0,924 por safra no estádio R5, com RMSE de 334–403 kg/ha — mas com
espectrorradiômetro **proximal de folha**, não orbital, em parcelas experimentais [H-03, só
abstract]. **[RESULTADO ESPECÍFICO]** GWR sobre imagens de UAS em trigo no México produziu
resíduos menores e menos espacialmente dependentes que regressão por componentes principais
(r = 0,74 em ambiente de seca, 0,46 em irrigado) [H-01, só abstract]. Modelos mistos são a
ferramenta de Maestrini & Basso para separar padrão espacial estável de instável em 571 e 338
talhões do Meio-Oeste americano [D-04; D-05].

**(c) Machine learning tabular (o grosso da literatura aplicada).**
Random Forest, XGBoost, LightGBM, SVR, kNN, redes rasas — aplicados a uma tabela em que cada
linha é um pixel, uma célula de grade, um talhão ou um município, e cada coluna é um índice
espectral, um atributo de solo, uma variável de relevo ou de clima. É a família dominante: RF
aparece como melhor modelo em [B-01, só abstract], [B-02, só abstract], [B-05], [B-13, só
abstract], [A-09, só abstract], [A-11], [D-06, só abstract], [D-07, só abstract], [D-09, só
abstract], [E-brasil-04], [E-brasil-05], [E-brasil-07, só abstract]; XGBoost em [C-11] e [B-15,
só abstract]; LightGBM em [D-12]; SVR em [B-12]. **[RESULTADO ESPECÍFICO]** Há pelo menos um
resultado contra-hegemônico na base: em soja na Áustria, Stochastic Gradient Descent superou RF e
XGBoost [B-07, só abstract].

**(d) Deep learning.**
DNN tabular [A-04], CNN-LSTM [A-10], 1D-CNN [A-09, só abstract], LSTM [B-03, só abstract],
Transformer/ViT [A-06], GNN-RNN [A-07, só abstract], Deep Gaussian Process [A-08, só abstract],
Bayesian Neural Network [G-13, só abstract], fusão multimodal DNN a partir de UAV [H-06, só
abstract], LSTM com atribuição de features em escala intra-talhão [G-11, preprint, só abstract].
**[CONSENSO indireto]** Em todos os casos da base em que o DL venceu, ao menos uma destas
condições estava presente: (i) dezenas de milhares de amostras (142.952 amostras de treino em
[A-04]); (ii) série temporal longa por unidade espacial (13 anos × 15 estados em [A-10]; 39 anos
× 2.000+ condados em [A-07, só abstract]); ou (iii) imagens brutas de alta resolução por parcela
(450 plots com câmera de alta resolução em [A-06]). Nenhuma corresponde ao regime de 20–100
talhões-safra do nosso caso.

**(e) Híbridos com modelos de cultura e híbridos geoestatísticos.**

- *Crop model → features de ML*: acoplar 22 saídas do APSIM (fenologia, umidade do solo, LAI,
  estresse hídrico) a um ensemble de ML reduziu o RMSE de milho em 7–20% no US Corn Belt, com
  RRMSE mínimo de 6–7% no melhor modelo híbrido [A-03]. **Ressalva obrigatória:** esse ganho foi
  medido usando o **clima real do ano de teste** como insumo do APSIM; em uso operacional
  pré-colheita o clima futuro é desconhecido e o ganho tende a ser menor [A-03].
- *Assimilação de LAI em modelo de crescimento*: LAI derivado do Sentinel-2 assimilado em um
  modelo de cultura baseado em processos, avaliado pixel a pixel contra monitor de colheita de
  alta densidade em 6 talhões e 21.175 pixels de soja, produziu rRMSE de 28% a 51% (35,8% no
  geral) e índice de Lee de 0,61–0,71 [B-11, só abstract].
- *Abordagem tipo SCYM* (**Scalable Crop Yield Mapper**): em vez de calibrar um modelo empírico
  com dados de colhedora, simula-se um modelo de cultura sob muitas combinações de clima/manejo,
  ajusta-se uma regressão entre índices de vegetação simulados e produtividade simulada, e
  aplica-se essa regressão às imagens reais. **[RESULTADO ESPECÍFICO]** O SCYM original capturou,
  em média, 35% da variação de produtividade em milho (faixa 14–58%) e 32% em soja, em mais de
  17.000 talhões de milho e 11.000 de soja nos EUA — **métrica de fração de variância capturada,
  que não é R² clássico e não deve ser comparada às demais linhas deste documento** [H-09, só
  abstract]. A avaliação em larga escala contra mais de 1 milhão de observações reais de colhedora
  mostrou r² de 0,31 por pixel de 30 m sem suavização, subindo para 0,40 com suavização harmônica
  da série temporal, 0,45 no talhão e 0,69 no condado [B-04, só abstract].
- *Krigagem de resíduos (regression-kriging)*: krigar os resíduos de um modelo de RF/DL reduziu o
  RMSE em 35–45% e corrigiu mapas cujo resíduo ainda tinha estrutura espacial, em trigo e mostarda
  na Índia [H-04].

**A relevância do SCYM para o nosso caso é estrutural, não incremental.** É a única família da
base que **não precisa de mapa de colheita para calibrar**, o que ataca de frente a restrição de
20–100 talhões-safra. Em contrapartida, exige um modelo de cultura calibrado para soja tropical,
que não existe hoje na plataforma (`infra_nova`), e o próprio [B-04, só abstract] registra que o
SCYM subestima a sensibilidade a qualidade de solo e data de plantio quando confrontado com dados
reais.

### 1.2 Escalas e o que muda entre elas

A base cobre três escalas, e **os números não são intercambiáveis entre elas**.

| Escala | Como é o alvo | Estudos da base | Ordem de grandeza típica de erro observada |
|---|---|---|---|
| **Intra-talhão** (pixel / célula de grade) | mapa de colhedora limpo, interpolado para grade | 22 estudos, incl. [B-12], [C-11], [B-05], [B-10, só abstract], [B-11, só abstract], [D-12], [B-01, só abstract] | RMSE de 0,12 a 0,77 t/ha em soja, conforme validação |
| **Talhão** (um valor por talhão-safra) | média do talhão | [B-02, só abstract], [D-01, só abstract], [D-02], [H-06, só abstract], [H-09, só abstract], [A-04] | — |
| **Município / condado / regional** | estatística oficial (IBGE, SEAB, USDA NASS) | [B-03, só abstract], [B-15, só abstract], [A-09, só abstract], [A-10], [E-brasil-01], [E-brasil-04], [E-brasil-07, só abstract], [H-10, só abstract], [C-13, só abstract], [G-13, só abstract] | RMSE 168–585 kg/ha em soja no Brasil |

**[RESULTADO ESPECÍFICO]** A agregação espacial melhora a métrica reportada, e o efeito está
quantificado em **um** estudo: no mesmo estudo, mesmo modelo, mesmos dados, o r² sobe de 0,31–0,40 (pixel de
30 m) para 0,45 (talhão) e 0,69 (condado) [B-04, só abstract]. É um único estudo, lido só pelo
resumo, em milho nos EUA — mas com validação externa contra >1 milhão de pontos de colhedora, o
que o torna a melhor medida disponível do efeito. Isto significa que **um R² de
município não é evidência de que o mesmo método funciona dentro do talhão** — e a maior parte da
literatura brasileira de soja com ML opera em escala municipal.

**[EVIDÊNCIA — RESULTADO ESPECÍFICO]** Há também uma hierarquia *dentro* da escala intra-talhão:
em 15 talhões de soja do Paraná, modelos SVR calibrados **por talhão** superaram modelos
calibrados **por fazenda**, que por sua vez superaram um modelo **global** — R² de 0,07 a 0,79
nos modelos por talhão, 0,60 a 0,70 por fazenda e 0,75 no global [B-12]. Esse resultado é
ambivalente e precisa ser lido junto da seção 5: o modelo por talhão só é "melhor" porque foi
calibrado e avaliado dentro do mesmo talhão; ele não responde à pergunta de produto, que é prever
um talhão ainda não colhido.

---

## 2. Respostas às 15 perguntas da seção 52

### 2.1 Quais são atualmente as principais metodologias de predição de produtividade?

**[EVIDÊNCIA]** Cinco famílias, detalhadas na seção 1: (a) agrometeorológica/mecanística
[E-brasil-01; D-08, só abstract]; (b) estatística clássica e espacial — regressão múltipla, PLSR,
modelos mistos, GWR [H-03, só abstract; H-01, só abstract; D-04; D-05]; (c) **ML tabular** — RF,
XGBoost, LightGBM, SVR — que é a família dominante na literatura aplicada [B-01…B-15, D-06, D-07,
D-09, D-12, C-11, E-brasil-04, E-brasil-05, E-brasil-07]; (d) deep learning — DNN, CNN-LSTM,
LSTM, Transformer/ViT, GNN-RNN, BNN [A-04, A-06, A-07, A-08, A-10, B-03, G-11, G-13, H-06]; e
(e) híbridos — crop model + ML [A-03], assimilação de LAI [B-11, só abstract], SCYM [H-09, só
abstract; B-04, só abstract] e krigagem de resíduos [H-04].

**[RESULTADO ESPECÍFICO]** A revisão sistemática presente na base (567 estudos triados, 50 de ML
e 30 de DL selecionados) **não aponta um vencedor único** entre as famílias; as features mais
recorrentes nos estudos revisados são temperatura, chuva e tipo de solo [A-01, só abstract]. É
uma única revisão, lida só pelo resumo — o rótulo `[CONSENSO]` está reservado, neste documento,
para afirmações em que **dois ou mais estudos independentes da base** convergem.

### 2.2 Quais modelos obtiveram melhores resultados?

**Não existe "o melhor modelo" na base revisada.** A pergunta só tem resposta condicionada ao
regime de dados, e há evidência direta de instabilidade entre anos.

**[RESULTADO ESPECÍFICO]** Em soja em escala de condado nos EUA, RF teve o menor RMSE agregado
(0,342 t/ha) entre RF, XGBoost, árvore de decisão, LASSO e 1D-CNN — mas o **1D-CNN foi o mais
preciso especificamente no ano de 2018** [A-09, só abstract]. Nenhum modelo dominou todos os anos.

**[RESULTADO ESPECÍFICO]** Em simulação fatorial controlada (1.728 conjuntos simulados, 12.096
avaliações, mais 5 conjuntos reais do Benin), Random Forest obteve o melhor R² (0,80) e foi o mais
robusto ao aumento do número de preditores e a taxas de dados ausentes de até 25% [A-11].

**[RESULTADO ESPECÍFICO]** Em milho de condado, o ganho relevante **não veio de trocar de família
de modelo**, mas de acoplar um crop model: LR, LASSO, LightGBM, RF e XGBoost e seus ensembles
ficaram próximos entre si, e o ganho de 7–20% de RMSE veio da entrada das 22 saídas do APSIM
[A-03] — com a ressalva de que o APSIM foi alimentado com o clima real do ano de teste, condição
indisponível em previsão pré-colheita real [A-03].

**[RESULTADO ESPECÍFICO]** Em conjunto tabular grande (142.952 amostras de treino, 2.247 locais,
627 marcadores genéticos + 8 de solo + 72 climáticas), um DNN de 21 camadas superou Lasso, SNN e
árvore de regressão por larga margem: RMSE de 12,79% da média do yield contra 21,40% do Lasso, e
R² de 81,91% [A-04].

**[RESULTADO ESPECÍFICO]** Em conjunto pequeno (450 plots de soja, 1 safra, imagens RGB de alta
resolução), um Transformer (ViT + transformer temporal + informação de semente) alcançou R² de
0,664 e RMSE de 332,07 kg/ha, reduzindo o erro em mais de 40% frente a CNN-LSTM no mesmo conjunto
[A-06].

**[RESULTADO ESPECÍFICO]** Em soja no Paraná em escala intra-talhão, SVR superou PLSR, com SVR
por talhão chegando a R² de 0,79 [B-12]. Em soja na Áustria, SGD superou RF e XGBoost [B-07, só
abstract]. Em milho de condado, Geographically Weighted Random Forest superou MLR, PLSR, SVR,
árvore de decisão e RF padrão (R² = 0,90; RMSE = 0,764 MT/ha) — mas o esquema de validação não
está descrito no material acessível [C-13, só abstract].

**[RESULTADO ESPECÍFICO, evidência geral fora da agricultura]** Em 45 conjuntos tabulares de
porte médio (~10 mil amostras), modelos de árvore (XGBoost, RF) permanecem estado da arte frente a MLP e
ResNet, mesmo com busca extensiva de hiperparâmetros, por três razões de viés indutivo: robustez
a features não informativas, sensibilidade à orientação dos dados e dificuldade das redes em
aprender funções irregulares [A-02, só abstract]. É **um** estudo de benchmark, lido só pelo
resumo, e fora da agricultura — não é consenso da base.

**Formulação correta da resposta, conforme a seção 58 do pedido:** em [A-09], [A-11], [A-03],
[B-12], [B-07], [C-13] e [A-02], sob as condições específicas de cada estudo, determinados modelos
superaram outros — e as ordens de vitória se contradizem entre estudos e até entre anos do mesmo
estudo.

### 2.3 Em quais culturas?

**[EVIDÊNCIA]** Dos 87 estudos, **45 envolvem soja**. A distribuição real da evidência:

> Nas quatro listas de enumeração abaixo, a marca de nível de leitura aparece na primeira
> ocorrência de cada estudo; o nível de todos os 87 está na tabela da seção 9.

- **Soja**: [A-05, só abstract], [A-06], [A-08], [A-09], [A-10], [B-03], [B-05], [B-06], [B-07],
  [B-08], [B-09, só abstract], [B-10], [B-11], [B-12], [B-13], [B-15], [C-11], [C-14], [D-01],
  [D-04], [D-05], [D-07], [D-08], [D-10, só abstract], [D-11, só abstract], [D-12], de
  [E-brasil-01] a [E-brasil-09] e [E-brasil-10, só metadados], [G-11], [H-03], [H-06], [H-09],
  [H-10], [H-11, só metadados].
- **Milho**: [A-03], [A-04], [B-01], [B-04], [B-08], [B-09], [C-13], [D-01], [D-02], [D-04],
  [D-05], [D-06], [D-10], [D-12], [G-13], [G-14, só abstract], [H-09].
- **Trigo**: [B-02], [B-14, só abstract], [D-04], [D-05], [D-10], [H-01], [H-04].
- **Outras**: canola [B-14], algodão [D-04], [D-05], [D-10], mostarda [H-04], amendoim e milheto
  [G-06, só abstract], inhame/mandioca/sorgo [A-11], colza [G-11].
- **Fora da agricultura** (usados só por conteúdo metodológico): biomassa florestal [C-01],
  biomassa amazônica [C-03], clorofila marinha [C-12], dados tabulares genéricos [A-02],
  reincidência criminal [G-12], problemas médicos [G-07, só abstract].

**[EVIDÊNCIA — RESULTADO ESPECÍFICO]** Transferibilidade entre culturas **não é automática**: no
mesmo estudo, com o mesmo método (ANN sobre índices + relevo) e os mesmos dois anos, o erro
relativo em milho ficou abaixo de 10% em 100% dos talhões em 2011 e em 75% em 2012, enquanto em
**soja** ficou abaixo de 10% em apenas 37% dos talhões em 2011 [B-09, só abstract]. E o ranking
de importância de variáveis muda com a cultura: para **soja**, o top-3 por SHAP/permutação é
declividade > precipitação de junho > elevação; para **milho**, 4 das 5 variáveis mais importantes
são climáticas [D-12].

### 2.4 Quais dados foram utilizados?

**[EVIDÊNCIA]** Cinco blocos, em ordem de frequência na base:

1. **Reflectância orbital e índices derivados** — presente em quase todos os estudos de
   sensoriamento (eixo B) e na maior parte dos brasileiros.
2. **Relevo/topografia** — elevação, declividade, curvatura, aspecto, acúmulo de fluxo, TWI
   [D-01, só abstract; D-02; D-05; D-06, só abstract; D-09, só abstract; D-12; B-09, só abstract;
   B-13, só abstract].
3. **Solo** — matéria orgânica, CTC, P, K, pH, água disponível, unidade de mapeamento de solo,
   parâmetros hidráulicos de Brooks-Corey [D-01, só abstract; D-06, só abstract; D-07, só
   abstract; D-12]; e **condutividade elétrica aparente (CEa)** [D-02; D-03; D-09, só abstract;
   D-11, só abstract].
4. **Clima** — chuva, temperatura do ar e de superfície (LST), radiação, déficit de pressão de
   vapor, balanço hídrico [A-03; A-04; A-10; B-03, só abstract; B-15, só abstract; D-05;
   E-brasil-01; E-brasil-04; E-brasil-05; H-10, só abstract].
5. **Manejo e genética** — data de semeadura, grupo de maturação, densidade de plantas [D-08, só
   abstract]; taxa de semeadura [D-07, só abstract]; marcadores genéticos [A-04]; informação de
   semente [A-06]; **histórico de produtividade do próprio talhão** [D-04; D-10, só abstract].

**[EVIDÊNCIA — CONSENSO]** O **alvo** é tão determinante quanto as features. Três estudos
metodológicos convergem em que o mapa de colhedora bruto é ruidoso a ponto de exigir limpeza
formal: 10 a 50% das observações de um talhão contêm erro significativo e devem ser removidas
[H-12, só abstract]; um protocolo automatizado em dois estágios sobre 595 conjuntos removeu cerca
de 30% dos dados, um terço disso por outliers **espaciais locais**, e a limpeza desses outliers
locais — não a dos globais — é o que altera a estrutura espacial do mapa [H-13, só abstract]; e
uma revisão de 25 anos catalogou quatro categorias de erro: dinâmica da colhedora, medição
contínua de umidade/produtividade, acurácia posicional GNSS e erro do operador [H-14, só
abstract].

### 2.5 Quais sensores?

**[EVIDÊNCIA]** Por ordem de relevância para o nosso caso:

| Sensor | Resolução usada | Estudos |
|---|---|---|
| **Sentinel-2** (óptico) | 10–20 m | [B-01, B-02, B-05, B-06, B-07, B-08, B-11, B-12, B-13, B-14, B-15], [H-04] |
| **PlanetScope** (óptico comercial) | 3–3,12 m | [B-05, B-06, B-08, B-10], [C-11] |
| **Landsat 8/HLS** | 30 m | [B-04, B-05, B-08], [E-brasil-10, só metadados] |
| **WorldView-3** | ~1 m | [B-08, só abstract] |
| **MODIS** | 250 m–1 km | [A-10], [C-01], [C-03], [E-brasil-04] |
| **Sentinel-1 (SAR)** | ~10 m | [B-13, só abstract], [H-04] |
| **CBERS-1 WFI** | — (só delimitação de área) | [E-brasil-01] |
| **UAV / UAS** (RGB, multiespectral, térmico) | alta, GSD não uniforme | [A-06], [C-14], [H-01, só abstract], [H-06, só abstract] |
| **Espectrorradiômetro proximal / sensor ativo** | pontual, folha | [H-03, só abstract], [E-brasil-03, só abstract] |
| **Veris 3100 / indução eletromagnética (CEa)** | linha de amostragem | [D-02], [D-03], [D-09, só abstract], [D-11, só abstract] |
| **MDE / dados topográficos** | 1 m a 30 m | [D-06, só abstract], [D-09, só abstract], [D-12], [D-05] |

**[EVIDÊNCIA — RESULTADO ESPECÍFICO]** O sensor mais fino não é automaticamente o melhor: em
soja na Hungria, Sentinel-2 (10 m) superou PlanetScope (3 m) em R², RMSE e MAE simultaneamente
(R² 0,90 vs. 0,85; RMSE 0,184 vs. 0,222 t/ha, só espectral, split 70/30) [B-05]. Detalhe na
resposta 2.8.

### 2.6 Quais índices?

**[EVIDÊNCIA]** Os índices efetivamente usados na base: NDVI, EVI, EVI2, GNDVI, BNDVI, SAVI,
MSAVI, NDRE, NDII, NDII2, NDWI, DVI, RVI, TGI, VARI, GLI, Simple Ratio (SR), LAI recuperado e o
TREI (índice com três bandas red-edge, proposto em [B-14]).

**[RESULTADO ESPECÍFICO — NDVI não é o melhor por padrão]** Em milho na Itália, o índice
individual mais correlacionado com produtividade foi **GNDVI (R² = 0,48)**, não NDVI; o RF sobre o
conjunto de índices chegou a ~0,60 sob split aleatório [B-01, só abstract]. Em milho e soja no
Canadá, o índice mais importante foi **Simple Ratio combinado com declividade**, e não NDVI nem
NDRE [B-09, só abstract]. Em escala municipal no Centro-Oeste brasileiro, **NDRE e as bandas
red-edge/SWIR/red/NIR** apareceram entre as variáveis mais importantes [B-15, só abstract].

**[EVIDÊNCIA LIMITADA — saturação]** NDVI satura em dossel fechado: o R² empírico foi
sistematicamente **menor nos talhões de maior produtividade**, o que os autores **sugerem** ser
saturação da refletância — *"R2 was lower for fields with higher yields, suggesting saturation of
the satellite-collected reflectance features in those cases"* [B-08, só abstract]. É um único
estudo, lido só pelo resumo, e a atribuição é dos próprios autores em forma de hipótese.

**[EVIDÊNCIA LIMITADA — red-edge]** Usar as três bandas red-edge do Sentinel-2 juntas (TREI)
superou índices com 0, 1 ou 2 bandas red-edge em canola (CCC = 0,89) e trigo (CCC = 0,85) na
Austrália, em 168 e 123 campos — **CCC não é R² nem RMSE e não pode ser comparado às demais
linhas**; e não foi testado em soja [B-14, só abstract].

**[RESULTADO ESPECÍFICO — bandas brutas podem dispensar índices]** Em soja nos EUA, apenas as
bandas brutas blue/green/red/NIR do PlanetScope, sem nenhum índice, produziram a curva de acurácia
de R² 0,26 (emergência) a >0,70 (R4/R5) [B-10, só abstract]. Em soja no Paraná, as 9 bandas
Vis/NIR/SWIR do Sentinel-2 superaram os 8 índices de vegetação testados sob PLSR e SVR [B-12].

### 2.7 Quantas safras?

**[EVIDÊNCIA]** A base se divide em dois mundos:

| Faixa | Estudos representativos | Comentário |
|---|---|---|
| **1 safra** | [A-06] (2020), [B-02, só abstract], [B-05] (2021), [B-12] (2019/20 principal), [D-06, só abstract] (2013), [D-09, só abstract] | Impossível testar transferência temporal |
| **2–3 safras** | [B-06] (2017/2020/2021), [B-07, só abstract] (2018–2020), [B-09, só abstract] (2011–2012), [B-10, só abstract] (2019/2021), [B-15, só abstract] (3 safras), [C-11] (2019/2021), [D-07, só abstract] (2013–2014), [H-03, só abstract] (3 safras) | Faixa do nosso caso |
| **4–11 safras** | [C-14] (2018–2021), [D-01, só abstract] (1994–1997), [D-02] (1997–1999, 9 site-years), [E-brasil-01] (5 safras), [B-04, só abstract] (11 safras) | |
| **13–39 safras** | [A-10] (13 anos), [E-brasil-04] (safras 2005/06–2020/21 — 16 safras no intervalo; ver §4.1), [E-brasil-05] (15 safras), [A-03] (35 anos), [G-14, só abstract] (36 anos), [A-07, só abstract] (39 anos), [E-brasil-10, só metadados] (19 anos) | Quase sempre escala municipal/condado |

**[EVIDÊNCIA — achado crítico para o nosso regime]** Os autores de [C-11] afirmam explicitamente
que **2–3 safras são insuficientes para uma leave-one-field-out CV robusta** em soja intra-talhão
— e é exatamente essa a ordem de grandeza disponível no nosso caso. **[LACUNA]** O número mínimo
de safras necessário para uma leave-one-year-out confiável **não foi encontrado explicitamente em
nenhum estudo da base** — sem evidência na base revisada.

**[RESULTADO ESPECÍFICO — notícia parcialmente boa]** Em 768 talhões e 5.520 mapas de colheita
do Meio-Oeste americano, o ganho de confiabilidade da classificação de zonas de estabilidade ao
acrescentar mais anos de histórico foi descrito como **modesto** [D-10, só abstract] — ou seja,
não é preciso esperar cinco ou mais safras para começar a extrair sinal de estabilidade temporal.

### 2.8 Qual resolução?

**[EVIDÊNCIA — há uma contradição direta na base, e ela importa.]**

**Argumento teórico a favor da resolução fina.** Em simulação de degradação de resolução sobre
talhões de milho e soja em Iowa, a variabilidade intra-talhão explicada cai de 100% a 3 m para
86% a 10 m, 72% a 20 m e 59% a 30 m [B-08, só abstract].

**Evidência empírica em sentido oposto, no mesmo estudo.** Nos modelos empíricos reais desse mesmo
trabalho, o R² médio foi **maior a 30 m (HLS: 0,21–0,88, média 0,56) do que a 3 m (PlanetScope:
0,09–0,77, média 0,30)** [B-08, só abstract]. E, em soja na Hungria, Sentinel-2 (10 m) superou
PlanetScope (3 m) em todas as métricas [B-05].

**[CONSENSO derivado]** Resolução mais fina **não converte automaticamente em melhor acurácia
empírica**; qualidade radiométrica, número de bandas úteis e consistência temporal do sensor pesam
tanto ou mais que o tamanho do pixel [B-08, só abstract; B-05].

**[EVIDÊNCIA — o trade-off de agregação está quantificado]** No mesmo modelo e mesmos dados, o r²
sobe de 0,31–0,40 (pixel 30 m) para 0,45 (talhão) e 0,69 (condado) [B-04, só abstract]. Quanto
maior a célula, melhor a métrica e menor a utilidade para manejo localizado.

**[EVIDÊNCIA — grades efetivamente usadas em soja intra-talhão]** 10 × 10 m com 24.282 células em
3 talhões [B-10, só abstract]; **20 m** em 15 talhões no Paraná [B-12]; 3,12 m em 3 talhões em
South Dakota [C-11]; 30 m em 134 crop-site-years, com **autocorrelação espacial residual ainda
detectada a 50 m** — indício de que 30 m pode ser grosseiro demais [D-12]; 5 × 5 m de predição a
partir de amostragem em 35 × 35 m [D-09, só abstract].

**[LACUNA]** Nenhum estudo da base compara de forma controlada resoluções de MDE (SRTM 30 m vs.
Copernicus GLO-30 vs. MDE local/RTK) quanto ao impacto na predição intra-talhão — sem evidência na
base revisada.

### 2.9 Como foram validados?

**[EVIDÊNCIA]** Esta é a resposta mais desconfortável da revisão. Dos 87 estudos, apenas **11**
declaram validação talhão-fora ou ano-fora, enquanto **42** (48% da base) não declaram esquema
algum — 28 com `validation` literalmente igual a `nd` e outros 14 com texto livre do tipo "não
detalhado no abstract".

> **Critério único de contagem (fixado no 3º ciclo de verificação).** Conta-se como *sem esquema de
> validação declarado* todo estudo cujo campo `validation` do CSV esteja **literalmente `nd`** ou
> cujo texto afirme, em palavras, que o esquema **não foi especificado, detalhado, declarado,
> esclarecido ou confirmado** na fonte lida — aplicado por script, sem exceções. Por esse critério
> `[B-03]` ("esquema exato não claro no abstract") e `[B-01]` ("esquema de sorteio não declarado no
> abstract") entram na contagem, que passa de 40 (46%) para **42 (48%)**. `[B-01]` continua
> classificado como V5 na matriz comparativa — a classificação registra o que se **infere** da
> partição; esta contagem registra o que a fonte **declara**, e as duas coisas são compatíveis.

Os esquemas encontrados, do mais para o menos rigoroso:

| Esquema | Estudos que o declaram |
|---|---|
| **Leave-one-field-out (talhão-fora)** | [C-11]; [C-14] (LOFOCV + CV espacial por cluster, contra talhão independente) |
| **Ano-fora / safra retida** | [B-09, só abstract] (2011→2012); [E-brasil-04] (safra 2020/21 retida); [A-10] (teste sequencial 2011–2015); [A-09, só abstract] (treino 2012–16, teste 2017–21); [A-03] (CV 10-fold aleatória para o ajuste **+** anos retidos de teste: 2012, 2017, 2018 — não é *leave-one-year-out*); [A-04] (2017 fora do treino, sem sobreposição híbrido-local); [G-13, só abstract] (treino em anos anteriores, teste 2010–2019); [D-12] (validação por ano **e** *group-wise* por estado) |
| **Externa espacial / contra fonte independente** | [B-15, só abstract] (estados independentes); [B-04, só abstract] (pixel a pixel contra >1 milhão de observações de colhedora); [H-04] (agregação pixel→vilarejo contra estatística oficial); [E-brasil-01] (contra estatística oficial SEAB); [H-03, só abstract] (calibração / CV / validação externa) |
| **Espacial pixel a pixel, mesmo domínio** | [B-11, só abstract]; [B-08, só abstract] (contra pontos GPS de colhedora) |
| **Split de observações do mesmo talhão** (aleatório quando declarado) | [B-05] (70/30 aleatório); [B-06] (70/30 + CV 80/20); [A-06] (split fixo de plots); [A-11] (cenários fatoriais); [B-02, só abstract]; **[B-12]** (10-fold + *hold-out* 75/25 nos mesmos 15 talhões, rotulado pelos autores como "validação externa"); [B-01, só abstract] (*hold-out* de metade das observações do mesmo talhão/safra, **esquema de sorteio não declarado**) |
| **Não declarado — `validation = nd` literal (28)** | [A-01], [A-02], [A-05], [A-08], [D-01], [D-02], [D-03], [D-05], [D-06], [D-07], [D-09], [D-10], [D-11], [E-brasil-03], [E-brasil-08], [E-brasil-09], [E-brasil-10], [H-01], [H-05], [H-06], [H-07], [H-08], [H-09], [H-10], [H-11], [H-12], [H-13], [H-14] |
| **Não declarado — texto livre "não detalhado/não especificado" (14)** | [A-07], [B-01, só abstract], [B-03, só abstract], [B-07], [B-10], [B-13], [B-14], [C-13], [E-brasil-02], [E-brasil-05], [E-brasil-07], [G-04], [G-05], [G-11]. *(`[B-01]` aparece também na linha de "split de observações", onde está por **inferência** da partição; aqui ele é contado pelo que a fonte **não declara** — as duas leituras convivem, ver o critério acima.)* |

> **Por que [B-12] não está na linha de "validação externa".** Os autores chamam a partição
> 75/25 de validação externa, mas ela divide observações dos **mesmos 15 talhões e da mesma
> safra** — não há talhão-fora nem safra-fora, e o CSV registra `val_random=sim`,
> `val_field_out=nao`. O resultado "externo" foi praticamente idêntico ao CV interno
> (R² 0,75 / 0,75), o que é o que se espera de uma partição interna. A
> [`matriz-comparativa.md`](./matriz-comparativa.md) classifica o estudo como **V5** pela mesma
> razão. O crédito qualitativo do estudo (*field* > *farm* > *global*, grade de 20 m no Brasil)
> permanece intacto.

**[EVIDÊNCIA — CONSENSO]** Quando o esquema muda de aleatório para espacial/temporal, **a métrica
cai, e cai muito**:

- Biomassa florestal, RF: R² de **0,53** (random 10-fold) para **0,14** (spatial 44-fold); RMSE
  de 56,5 para 77,5 Mg/ha, contra 82 Mg/ha de um modelo nulo. Um modelo treinado só com
  coordenadas X/Y teve desempenho quase idêntico ao modelo "real" — o RF estava memorizando
  proximidade geográfica [C-01].
- Sensoriamento remoto marinho: CV aleatória 10-fold **subestimou o erro em 5–54%** conforme o
  modelo [C-12].
- Soja intra-talhão (EUA), XGBoost + SHAP, LOFO-CV: R² de **0,54 / −0,58 / 0,40 / 0,24 / −1,02 /
  −6,23** entre os seis talhões-safra retidos; RMSE de 554 a 765 kg/ha; MAE de 421 a 676 kg/ha
  [C-11]. Três dos seis casos têm R² **negativo** — pior que prever a média.
- Soja escala municipal (Brasil): R² de **0,748** (teste 20% aleatório) para **0,693** na safra
  nova retida; RMSE de 414 para **585 kg/ha** [E-brasil-04].
- Soja escala municipal (Brasil): R² de **0,72** (70/30) para **0,34–0,76** em estados
  independentes; RMSE de 301,52 para 168,31–491,17 kg/ha [B-15, só abstract].
- Milho e soja intra-talhão (EUA), LightGBM: R² de 0,87 (milho) e 0,90 (soja) cai para **0,77–0,79
  em média** sob validação *group-wise* por estado [D-12].
- Soja no Japão: CV aleatória teve acurácia pobre ao prever talhão independente, enquanto CV
  espacial e LOFOCV ficaram dentro da faixa de acurácia válida [C-14].
- Milho SCYM: o RF treinado com dados reais teve desempenho ruim quando testado em anos e locais
  não representados no treino [B-04, só abstract].

### 2.10 Existe risco de spatial leakage?

**[EVIDÊNCIA — CONSENSO]** Sim, e é o risco metodológico central deste projeto.

O mecanismo: pixels vizinhos de um mesmo talhão são fortemente autocorrelacionados. Ao dividir
pixels aleatoriamente entre treino e teste, quase todo pixel de teste tem um vizinho quase idêntico
no treino. O modelo não precisa aprender relação agronômica alguma — basta interpolar posição. A
demonstração mais direta na base é a do modelo RF treinado **só com coordenadas X/Y**, que empatou
com o modelo completo em biomassa florestal [C-01].

**[EVIDÊNCIA]** Vazamento não é só espacial. Uma auditoria identificou uma taxonomia de vazamento
afetando **294 artigos em 17 campos científicos**, e mostrou que, uma vez corrigido o vazamento em
um caso de reprodutibilidade, modelos complexos de ML deixaram de superar substantivamente uma
regressão logística de décadas atrás [C-07, só abstract].

**Formas concretas de vazamento relevantes ao nosso pipeline**, cada uma com seu suporte:

1. **Split aleatório de pixels do mesmo talhão** — [C-01]; [C-11]; [C-12]; [C-14]; reconhecido
   como limitação pelos próprios autores em [B-10, só abstract], que registram a necessidade de
   testar em talhões não usados no treino.
2. **Coordenadas X/Y como feature direta** — [C-01] fornece a evidência empírica; **[HIPÓTESE]**
   a generalização para o caso agrícola não foi testada em nenhum estudo da base.
3. **Vazamento temporal: usar o clima já observado do ano-safra como feature** — é exatamente a
   ressalva que os autores de [A-03] fazem sobre o próprio ganho de 7–20%: o APSIM foi alimentado
   com o clima real do ano de teste, condição que não existe em previsão pré-colheita.
4. **Vazamento por interpolação (mapa krigado usado como feature)** — **[LACUNA]** nenhum estudo
   da base testa isso explicitamente; sem evidência na base revisada. O risco é inferido por
   analogia: um mapa krigado a partir de amostragem esparsa suaviza informação sobre a grade de
   20 m e cria correlação espacial artificial entre células vizinhas. Como referência de ordem de
   grandeza, [D-09, só abstract] amostrou em grade de 35 × 35 m para predizer em 5 × 5 m.
5. **Seleção de features ou de hiperparâmetros fora de uma CV aninhada** — coberto pela taxonomia
   geral de [C-07, só abstract]; não há teste específico em produtividade na base.

**[EVIDÊNCIA LIMITADA]** Outro sintoma de vazamento/ajuste excessivo espacial: na desagregação de
produtividade na Índia, um RF atingiu R² de 0,9949 mas produziu mapas em nível de pixel
espacialmente irreais, corrigidos só depois pela krigagem dos resíduos [H-04]. **R² alto em nível
agregado não garante mapa realista em nível de pixel.**

### 2.11 Existe validação externa?

**[EVIDÊNCIA]** Existe, mas é rara — e quando existe, o desempenho cai.

- **A validação externa mais robusta da base**: SCYM e RF avaliados pixel a pixel contra mais de
  1.000.000 de observações reais de colhedora no US Corn Belt, ao longo de 11 safras, com o SCYM
  não usando nenhum dado de campo para calibrar [B-04, só abstract].
- **Validação externa entre unidades geográficas**: em soja no Centro-Oeste brasileiro, o modelo
  treinado num conjunto de municípios e testado em **estados independentes** viu o R² cair de 0,72
  para a faixa 0,34–0,76 e o RMSE ir de 301,52 kg/ha para 168,31–491,17 kg/ha [B-15, só abstract].
- **Validação externa temporal**: a safra 2020/21 retida em soja no Paraná [E-brasil-04].
- **Validação contra fonte institucional independente**: o AGROMET comparado às médias estaduais
  da SEAB por teste t pareado [E-brasil-01]; a desagregação indiana comparada às estatísticas
  oficiais de vilarejo/bloco [H-04].
- **Validação externa em soja intra-talhão no Brasil**: [B-12] usa split 75/25 com validação
  externa no modelo global, mas **não formaliza leave-one-field-out** — a comparação
  talhão/fazenda/global é feita sem reter um talhão inteiro fora do ajuste.

**[LACUNA]** Nenhum estudo da base combina **soja + Brasil + intra-talhão + leave-one-field-out +
leave-one-year-out**. Sem evidência na base revisada. Esta é a principal lacuna que o projeto pode
preencher (seção 7).

**[EVIDÊNCIA — ferramenta complementar]** Para dizer *onde* a predição é confiável em vez de
apenas *quanto* ela erra em média, a base traz a **Área de Aplicabilidade (AOA)**, derivada de um
índice de dissimilaridade no espaço de preditores ponderado pela importância do modelo: dentro da
AOA, o erro de predição é comparável ao erro de validação cruzada; fora dela, o erro de CV não se
aplica [C-04, só abstract]. A mesma linha de trabalho defende que mapas só sejam publicados
acompanhados de medidas de acurácia **local**, e não apenas de uma estatística global única
[C-05].

### 2.12 Qual modelo aparenta maior robustez?

**[EVIDÊNCIA — a resposta honesta é condicional ao regime de dados.]** Para o regime declarado
(20–100 talhões-safra de soja, muitos pixels, poucas safras e poucos talhões independentes,
CPU-only, necessidade de explicabilidade), a convergência da base aponta para **ensembles de
árvores (RF e GBM)**, não porque sejam "os melhores", mas porque são os que menos dependem das
condições que não temos:

- Robustez a dados ausentes e a muitos preditores, medida de forma controlada: RF foi o mais
  robusto a até 25% de ausência e ao aumento do número de preditores entre RF, SVM, MLR, XGBoost,
  LightGBM, redes neurais e kNN [A-11].
- Superioridade de árvores em tabular de porte médio, com busca extensiva de hiperparâmetros, em
  45 conjuntos [A-02, só abstract].
- Desempenho competitivo em soja de condado (RF com menor RMSE agregado) [A-09, só abstract],
  em soja intra-talhão com LOFO-CV (XGBoost) [C-11], em soja municipal brasileira (RF)
  [E-brasil-04] e em milho/soja intra-talhão (LightGBM) [D-12].

**Ressalvas obrigatórias, todas com suporte na própria base:**

- **Robustez não é generalização.** O RF do [B-04, só abstract] teve desempenho ruim fora do
  domínio de treino, e só funcionou bem com pelo menos ~1.000 observações reais de calibração.
- **O XGBoost de [C-11] produziu R² negativo em três dos seis talhões-safra retidos** — ou seja,
  a família vencedora ainda falha no teste que mais importa para o produto.
- **Existem resultados contrários**: SGD > RF/XGBoost em soja na Áustria [B-07, só abstract];
  DNN > modelos rasos com 142.952 amostras [A-04]; ViT > CNN-LSTM com 450 plots [A-06];
  GWRFR > RF padrão em milho de condado [C-13, só abstract].
- **[EVIDÊNCIA LIMITADA]** Nenhum estudo da base comparou diretamente GBM vs. DL **no regime de
  20–100 talhões-safra**; todos os comparativos abertos são de condado ou de conjuntos muito
  maiores [A-03; A-05, só abstract; A-09, só abstract]. Sem evidência na base revisada para esse
  regime específico.

### 2.13 Quais métodos têm melhor relação desempenho/complexidade?

**[EVIDÊNCIA]** Ordenando pelo que a base mostra de ganho por unidade de esforço:

| Posição | Método | Ganho documentado | Custo |
|---|---|---|---|
| 1 | **Limpeza rigorosa do alvo (mapa de colhedora)** | 10–50% das observações contêm erro [H-12, só abstract]; ~30% removido em protocolo automatizado, e são os outliers **espaciais locais** que alteram a estrutura do mapa [H-13, só abstract] | quase nulo — o pipeline já existe |
| 2 | **Suavização da série temporal antes de modelar** | r² por pixel de 0,31 → 0,40 no SCYM, só por aplicar regressão harmônica [B-04, só abstract] | baixo |
| 3 | **RF / GBM sobre features tabulares** | melhor RMSE agregado em soja de condado [A-09, só abstract]; robustez controlada [A-11]; estado da arte em tabular [A-02, só abstract] | baixo, CPU-only |
| 4 | **Krigagem dos resíduos sobre um modelo já treinado** — **só pós-colheita ou sobre resíduos de safras anteriores** | redução de 35–45% no RMSE, corrigindo mapas espacialmente irreais [H-04] — **mas em desagregação de um agregado observado**, não em previsão (ver ressalva na §7.2, O8) | baixo — `pykrige` já está na stack |
| 5 | **Relevo como feature** | para **soja**, declividade e elevação estão no top-3 de importância, acima de quase todo o clima [D-12]; SR + declividade foram as variáveis mais importantes em [B-09, só abstract] | quase nulo — MDE já existe |
| 6 | **QRF / conformal para incerteza** | quantis condicionais completos [G-02]; cobertura de amostra finita [G-01, só abstract] | baixo, CPU-only |
| 7 | **TreeSHAP para explicabilidade** | valores de Shapley exatos em tempo polinomial para modelos de árvore [G-07, só abstract] | baixo, CPU-only |
| 8 | **Híbrido com crop model** | 7–20% de RMSE em milho de condado [A-03] — **medido com o clima real do ano de teste** | alto: nenhum crop model existe na stack |
| 9 | **Deep learning (ViT, CNN-LSTM, LSTM, GNN)** | ganhos reais, mas sempre acompanhados de dezenas de milhares de amostras, séries longas ou imagens brutas de alta resolução [A-04; A-06; A-07, só abstract; A-10] | alto: GPU e volume de dados que não temos |

### 2.14 Quais métodos são adequados para produção?

Critérios de produção neste projeto: rodar em CPU num backend Python modesto, treinar e predizer
em minutos, produzir incerteza e explicação, e não exigir dado que a plataforma não tem.

**[EVIDÊNCIA]** Adequados:

- **RF / XGBoost / LightGBM** sobre features tabulares — explicitamente motivados na base como
  alternativa viável ao DL justamente pelo volume de dados exigido e pela natureza de caixa-preta
  do DL [A-05, só abstract]; usados com sucesso em CPU em [C-11], [B-15, só abstract], [D-12],
  [E-brasil-04].
- **SVR e PLSR** — leves, e foram os modelos do estudo mais próximo do nosso caso [B-12].
- **GroupKFold / leave-one-field-out / leave-one-year-out** — esquemas de particionamento, custo
  computacional desprezível [C-11; C-14; C-02, só abstract].
- **QRF e conformal prediction (CQR)** para intervalo [G-02; G-01, só abstract], com a ressalva
  espacial de 2.16.
- **TreeSHAP e ALE** para explicação [G-07, só abstract; G-08, só abstract].
- **Krigagem ordinária** — já disponível. **Krigagem de resíduos** [H-04] também é `reusa`, mas só é aplicável **depois** da colheita ou sobre resíduos de safras anteriores (§7.2, O8).
- **AOA / índice de dissimilaridade** [C-04, só abstract] — cálculo de distâncias no espaço de
  features.
- **SCYM** — não exige ML pesado e roda em CPU [B-04, só abstract], mas exige um modelo de cultura.

**[EVIDÊNCIA]** Inadequados ao ambiente atual: DNN de alta capacidade [A-04], CNN-LSTM com série
de 13 anos por unidade [A-10], GNN sobre milhares de nós [A-07, só abstract], fusão espectral via
rede neural [B-06], fusão multimodal com sensor térmico de UAV [H-06, só abstract],
espectrorradiômetro proximal [H-03, só abstract], crop model acoplado [A-03; B-11, só abstract].

**Observação sobre o mercado.** O benchmark comercial deste projeto
(`yield-prediction/docs/benchmarks/commercial.md`, 32 soluções) registra que **nenhuma solução
comercial privada analisada publica previsão de produtividade em kg/ha por talhão com métrica de
erro divulgada, nem intervalo de incerteza numérico**. Isso não é evidência científica — é
levantamento de páginas oficiais, e está rotulado como alegação comercial naquele documento —
mas delimita o patamar a ser batido.

### 2.15 Quais técnicas devemos testar primeiro?

Resposta completa e priorizada na **seção 8**. Em uma frase: primeiro a **infraestrutura de
avaliação** (limpeza auditada do alvo + LOFO-CV/leave-one-year-out + baselines triviais), depois
**GBM/RF sobre features tabulares** com séries agregadas por estádio, depois **incerteza (QRF/CQR)
e explicabilidade (TreeSHAP/ALE)**, e só então as opções caras (SAR, DL, crop model). A razão é o
achado central da revisão: com o regime de dados disponível, o risco dominante não é escolher o
algoritmo errado — é **acreditar num número inflado por vazamento** [C-01; C-11; C-12; C-14;
E-brasil-04; B-04].

---

## 3. Respostas às 18 perguntas secundárias da seção 5

> Quando a pergunta coincide com a seção 52, a resposta aqui é curta e remete.

### 3.1 Quais algoritmos apresentam melhores resultados em predição de produtividade agrícola?

Ver **2.2** e **2.12**. Resumo: não há vencedor estável; RF/GBM dominam a literatura aplicada e
são os mais robustos no regime de poucos dados [A-11; A-02, só abstract], mas há resultados
contrários documentados [B-07, só abstract; A-06; C-13, só abstract; A-04], e o mesmo estudo pode
ter vencedores diferentes em anos diferentes [A-09, só abstract].

### 3.2 Random Forest, XGBoost e LightGBM continuam competitivos frente a Deep Learning?

**[CONSENSO, evidência geral fora da agricultura]** Sim, em dados tabulares de porte médio: em 45
conjuntos com ~10 mil amostras, árvores superaram MLP/ResNet mesmo com busca extensiva de
hiperparâmetros [A-02, só abstract]. **[RESULTADO ESPECÍFICO]** Em agricultura, RF teve o menor
RMSE agregado entre cinco famílias em soja de condado [A-09, só abstract]; LightGBM foi o modelo
final em milho/soja intra-talhão com validação por estado e por ano [D-12]; XGBoost é motivado na
literatura como alternativa ao DL justamente pelo volume de dados e pela opacidade deste
[A-05, só abstract]. Ver 2.12 para as ressalvas.

### 3.3 Em quais condições redes neurais apresentam vantagem real?

**[CONSENSO indireto — três condições, cada uma com suporte]:**

1. **Volume muito grande de amostras**: DNN de 21 camadas com 142.952 amostras de treino superou
   Lasso/SNN/árvore por larga margem (RMSE 12,79% vs. 21,40% da média) [A-04].
2. **Série temporal longa por unidade espacial**: CNN-LSTM superou CNN e LSTM isolados com 13 anos
   × 15 estados (R² 0,78; RMSE 329,53 kg/ha, teste sequencial 2011–2015) [A-10]; GNN-RNN superou o
   estado da arte com mais de 2.000 condados × 39 anos [A-07, só abstract].
3. **Imagens brutas de alta resolução por parcela**: ViT + transformer temporal reduziu o erro em
   mais de 40% frente a CNN-LSTM com apenas 450 plots de soja e uma safra [A-06] — o único caso da
   base em que DL venceu com conjunto pequeno, e ainda assim com imagem bruta por parcela e
   informação complementar de semente.

**[RESULTADO ESPECÍFICO — resultado negativo relevante]** Em previsão de densidade de
probabilidade de produtividade de milho (36 anos, 1.260 condados), a rede neural quantílica **não**
superou a regressão quantílica tradicional, e QRF + LASSO foi o melhor método testado [G-14, só
abstract]. Em soja de condado, o 1D-CNN só venceu em um ano específico [A-09, só abstract].
Em escala mesorregional brasileira, uma CNN sobre *recurrence plots* exigiu mais poder
computacional e **não superou o Random Forest** [E-brasil-05].

### 3.4 Quais índices espectrais são mais úteis?

Ver **2.6**. Resumo: GNDVI foi o melhor índice individual em milho [B-01, só abstract]; Simple
Ratio + declividade foram os mais importantes em milho/soja no Canadá [B-09, só abstract]; NDRE e
bandas red-edge/SWIR se destacaram em soja no Brasil em escala municipal [B-15, só abstract]; NDVI
satura em alta biomassa [B-08, só abstract]; e **bandas brutas podem superar índices** em soja
[B-12; B-10, só abstract].

### 3.5 NDVI e NDRE são suficientes como primeiro conjunto de variáveis?

**[HIPÓTESE — sem evidência na base revisada]** Nenhum estudo da base testa de forma controlada
exatamente a dupla NDVI+NDRE isolada contra um conjunto maior de índices em soja intra-talhão.
O que a base permite dizer, indiretamente:

- **Contra a suficiência**: o melhor índice individual não foi NDVI em nenhum dos estudos que
  ranqueiam índices [B-01, só abstract; B-09, só abstract]; NDVI satura exatamente nos talhões de
  maior produtividade [B-08, só abstract]; e usar as três bandas red-edge juntas superou usar
  menos bandas red-edge (o que sugere que NDRE sozinho deixa sinal na mesa) [B-14, só abstract].
- **A favor de um conjunto mínimo**: em soja, as bandas brutas sozinhas já produziram R² > 0,70 em
  R4/R5 [B-10, só abstract]; e nas 9 bandas Vis/NIR/SWIR do Sentinel-2 o desempenho superou os 8
  índices testados [B-12]. Ou seja, a alternativa baseada em evidência não é "NDVI+NDRE", é
  **"bandas brutas + poucos índices escolhidos por estádio"**.

**[EVIDÊNCIA]** Há também um argumento de multicolinearidade que vem do eixo de explicabilidade:
índices espectrais são altamente colineares entre si, e com features correlacionadas os gráficos
de dependência parcial exigem extrapolação para regiões fora do envelope multivariado dos dados,
o que os torna enganosos [G-08, só abstract]. Quanto mais índices redundantes, pior a
interpretabilidade — sem ganho preditivo garantido.

### 3.6 Séries temporais são superiores a imagens de uma única data?

**[EVIDÊNCIA — RESULTADO ESPECÍFICO, direção consistente]:**

- Em soja no Paraná, a informação combinada ao longo da safra produziu melhores resultados do que
  imagens isoladas [B-12].
- A suavização harmônica da série temporal elevou o r² por pixel de 0,31 para 0,40 no SCYM
  [B-04, só abstract].
- CNN-LSTM superou CNN e LSTM isolados sobre série MODIS + clima [A-10].

**[EVIDÊNCIA LIMITADA]** Nenhum estudo da base compara de forma controlada, para soja
intra-talhão, "imagem única no pico vegetativo" contra "métricas fenológicas completas" (data do
máximo, área sob a curva, taxa de senescência). A maioria usa datas fixas — [B-07, só abstract] usa
apenas 3 imagens por ano — sem extração fenológica formal. A lista de features fenológicas da
seção 15 do pedido (NDVI máximo, data do máximo, área sob a curva, taxa de crescimento e de
senescência, dias acima de um limiar, médias por estádio, percentis, estabilidade temporal)
**não tem validação direta na base revisada** — é hipótese de trabalho.

**[EVIDÊNCIA — restrição brasileira]** A série temporal no Brasil é curta por força das nuvens:
em soja no Paraná, a cobertura de nuvens de 40–70% deixou apenas **4 a 10 imagens Sentinel-2 por
talhão na safra** [B-12]. Isso limita o que é possível extrair de curva temporal.

### 3.7 Em qual estádio fenológico a previsão começa a apresentar precisão útil?

**[CONSENSO PARCIAL]** A janela de R3 a R5 (formação de vagens ao enchimento de grãos) é onde a
acurácia se torna útil em soja:

- **Soja**: R² sobe de **0,26 em VE/VC (emergência)** para **>0,70 em R4/R5 (enchimento de
  grãos)**, com seis pontos de estádio medidos [B-10, só abstract].
- **Soja**: a melhor data foi a janela V4-V5 a R1, cerca de **60–70 dias antes da colheita**
  [B-05]; o enchimento de grãos foi o estádio-chave no Paraná [B-12]; **R5** foi o melhor estádio
  para PLSR sobre reflectância foliar [H-03, só abstract].
- **Soja, fusão espectral**: pico de R² (0,36–0,49) aos **93 dias após a semeadura** [B-06].
- **Soja, escala municipal**: o melhor modelo XGBoost usou **150 dias após a semeadura** — próximo
  da maturação, pouca antecipação [B-15, só abstract].
- **Milho**: o período mais adequado foi R4–R6, 105–135 dias após o plantio [B-01, só abstract].

**[EVIDÊNCIA — o custo de antecipar está quantificado, mas em outra escala]** Em soja no Rio
Grande do Sul, escala **municipal**, o MAE sobe de 0,24 Mg/ha (DOY 64, março) para 0,42 Mg/ha
(DOY 16, janeiro) conforme se antecipa a previsão [B-03, só abstract]. **Este número não pode ser
usado como referência de precisão intra-talhão** — é município.

**[LACUNA]** Nenhum estudo da base apresenta uma curva contínua e comparável de R²/RMSE por
dia-antes-da-colheita para **soja intra-talhão**. [B-10, só abstract] é o mais próximo, com apenas
seis pontos de estádio. Sem evidência na base revisada.

### 3.8 O uso de atributos de solo aumenta significativamente o desempenho?

**[EVIDÊNCIA LIMITADA — sim, mas com magnitude instável e dependente da escala.]**

- Atributos de solo explicaram em média ~30% da variabilidade de produtividade (faixa de
  **5% a 71% entre campos**), e a topografia ~20% (faixa 6–54%); a matéria orgânica foi a variável
  mais influente [D-01, só abstract]. **As médias não devem ser apresentadas como número único
  estável** — a faixa é o achado.
- O **ranking muda com a escala de agregação**: em RF, a unidade de mapeamento de solo domina
  quando os dados de vários campos são agrupados, mas a **elevação** domina na análise por campo
  individual [D-07, só abstract].
- Correlações simples entre solo/CEa e produtividade foram descritas como pouco úteis; só modelos
  não-lineares (rede neural, RF) capturaram o sinal [D-02].
- Quando há imagem de solo nu de alta resolução disponível, os índices de solo/vegetação
  derivados dela pesaram **mais** que as variáveis topográficas (RF com R² = 0,53, RMSE = 0,97
  para produtividade de milho) [D-06, só abstract].

**[RESULTADO ESPECÍFICO — evidência contrária relevante]** Em soja intra-talhão com LOFO-CV,
acrescentar solo e topografia **piorou** o desempenho; o melhor modelo foi o que usava **apenas
índices de vegetação**, e os autores atribuem a piora a ruído e sobreajuste local [C-11]. Em
D-12, para soja, apenas 2 das 13 features finais eram de solo [D-12].

**[LACUNA]** Nenhum estudo da base isola o ΔR²/ΔRMSE atribuível a atributos de solo em **soja em
solo tropical brasileiro**. Sem evidência na base revisada.

### 3.9 Condutividade elétrica melhora a capacidade de previsão?

**[CONSENSO]** Sim, mas a relação **não é universal nem de sinal fixo**.

- A revisão fundacional é explícita: a CEa relaciona-se à produtividade com frequência, mas nem
  sempre — é uma medida integradora de textura, água, matéria orgânica e salinidade, não um
  preditor causal único [D-03].
- **Quantificação**: CEa isolada R² = 0,21; topografia isolada R² = 0,17; combinadas R² = 0,32
  (médias entre 9 site-years); em 6 dos 9 casos a CEa superou a topografia [D-02].
- **O sinal depende do solo**: a relação foi **negativa** (produtividade cai quando a CEa sobe) no
  Kansas e Missouri, e diferente no Colorado por causa do perfil de textura invertido [D-02]. No
  Brasil, em Latossolo Bruno de Guarapuava-PR, a correlação também foi **negativa** entre CEa e
  produtividade de soja, consistente com Kansas/Missouri, embora sem R² reportado [D-11, só
  abstract].
- **Teto técnico alto quando o alvo é o próprio solo**: CEa + topografia alcançaram R² de 0,24 a
  0,90 para atributos de saúde do solo em grade de 5 m [D-09, só abstract].

**[LACUNA]** Nenhum estudo da base testa a **estabilidade interanual** da relação CEa × produtividade
(ano seco vs. ano úmido) com métrica quantitativa. Sem evidência na base revisada.

### 3.10 Variáveis topográficas ajudam a explicar produtividade?

**[CONSENSO — sim, e para soja especificamente o peso é alto.]**

- **O achado mais direto**: em milho e soja intra-talhão em 9 estados dos EUA (134
  crop-site-years, LightGBM, SHAP + importância por permutação), para **soja** o top-3 é
  **declividade > precipitação de junho > elevação**, com a maioria das 13 features finais sendo
  atributos de terreno; para **milho**, 4 das 5 mais importantes são climáticas [D-12].
- Em milho e soja no Canadá, a **declividade** aparece junto com Simple Ratio como as variáveis
  mais importantes de um ANN com conjunto mínimo otimizado [B-09, só abstract].
- **TWI discrimina zonas de estabilidade**: TWI médio de 12,9 em zonas instáveis > 12,7 em
  estáveis-altas > 12,4 em estáveis-baixas (p < 0,05) em sequeiro — e o padrão **desaparece em
  campos irrigados** [D-05].
- Topografia isolada explicou ~20% da variabilidade (faixa 6–54% por campo) [D-01, só abstract] e
  R² = 0,17 como bloco isolado em [D-02].
- **Evidência contrária**: quando há imagem de solo nu de alta resolução, os índices derivados dela
  pesaram mais que a topografia [D-06, só abstract]; e em [C-11] acrescentar topografia piorou o
  LOFO-CV.

### 3.11 Qual a contribuição de dados climáticos?

**[EVIDÊNCIA]** Alta em escala agregada, indireta em escala intra-talhão.

- **Escala regional/municipal**: um ANN alimentado **apenas com clima e balanço hídrico** obteve
  R² de 0,88 (estimativa) e 0,86 (previsão 2 meses antes da colheita), com RMSE de 167,85 e
  185,85 kg/ha em soja no MATOPIBA [H-10, só abstract]. Em 56 mesorregiões brasileiras, um RF só
  com estações meteorológicas alcançou MAPE de 8% [E-brasil-05]. A integração de NDVI/EVI/LST +
  CHIRPS com RF em 15 municípios do Paraná ao longo das safras 2005/06–2020/21 deu R² de 0,748 no teste
  aleatório e 0,693 na safra nova [E-brasil-04]. Precipitação e radiação estiveram entre as
  variáveis mais importantes no modelo municipal do Centro-Oeste [B-15, só abstract].
- **Decomposição do yield gap**: no subtrópico brasileiro, o *gap* atribuído ao déficit hídrico foi
  de 26–62% da produtividade potencial, contra 9–39% atribuídos ao manejo [D-08, só abstract].
- **Escala intra-talhão**: o clima é quase constante dentro de um talhão. **[HIPÓTESE fundamentada]**
  ele entra por **interação com relevo e solo**, não como efeito principal: o mesmo evento de chuva
  tem sinal oposto conforme a posição topográfica da célula — áreas côncavas correlacionam-se
  negativamente com a chuva de maio e positivamente com a de agosto/setembro [D-05]; e o SHAP de
  [D-12] mostra interação explícita clima × relevo × solo, com parâmetros hidráulicos do solo e
  declividade modulando o efeito da chuva de junho na soja.
- **Armadilha**: usar o clima **já observado** do ano-safra como feature infla o desempenho
  relatado frente ao uso pré-colheita real — é a ressalva dos próprios autores de [A-03].

### 3.12 Qual a importância de população, cultivar e data de semeadura?

**[EVIDÊNCIA LIMITADA]**

- No subtrópico brasileiro, o *gap* de produtividade atribuído ao manejo (data de semeadura, grupo
  de maturação, densidade de plantas) foi de **9% a 39% da produtividade potencial**, e a **data de
  semeadura foi o principal fator de manejo**; grupos de maturação ≤ 5.5 tiveram maior eficiência
  de uso da água (9,6 kg/ha/mm) que os ≥ 5.6 [D-08, só abstract].
- A taxa de semeadura entrou como atributo num RF de soja no Wisconsin [D-07, só abstract].
- Informação de semente foi uma das entradas do Transformer que reduziu o erro em mais de 40%
  [A-06].
- Marcadores genéticos (627 após filtro) foram a maior parte das features do DNN de [A-04].
- **Evidência de que ignorar cultivar custa caro**: o AGROMET subestimou a produtividade em 10,5%
  numa safra, atribuindo o erro a datas de semeadura e cultivares não capturadas [E-brasil-01]; e
  o estudo intra-talhão do Paraná usou 6 cultivares/grupos de maturação **sem controlar por isso**,
  o que é limitação declarada [B-12].

**[LACUNA]** Nenhum estudo da base testa **cultivar como variável categórica de alta cardinalidade
codificada em ML** para produtividade intra-talhão. Sem evidência na base revisada. A pista
indireta é que a unidade de mapeamento de solo, também categórica, foi a variável mais importante
de um RF quando os dados foram agrupados entre campos [D-07, só abstract] — sugerindo que
categóricas de alta cardinalidade importam, mas sem teste de codificação.

### 3.13 Qual resolução espacial apresenta melhor equilíbrio entre precisão e custo?

Ver **2.8**. Resumo: a simulação favorece 3 m (100% da variabilidade contra 72% a 20 m e 59% a
30 m), mas os modelos empíricos do mesmo estudo foram **melhores a 30 m que a 3 m**, e o
Sentinel-2 de 10 m superou o PlanetScope de 3 m em soja [B-08, só abstract; B-05]. A grade de 20 m
tem precedente direto em soja no Brasil [B-12], e 10 × 10 m em soja nos EUA [B-10, só abstract].
A 30 m foi detectada autocorrelação residual ainda a 50 m [D-12], o que argumenta contra grades
grosseiras.

### 3.14 Como deve ser realizada a validação para evitar resultados artificialmente elevados?

Ver **2.9**, **2.10** e a seção 5 (o debate). Resumo operacional sustentado pela base:

1. **Nunca reportar apenas split aleatório de pixels** — ele subestimou o erro em 5–54% [C-12] e
   levou R² de 0,53 a 0,14 quando trocado por CV espacial [C-01].
2. **Usar o esquema que reproduz o uso real**: como o produto prevê talhão/safra **nunca vistos**
   (extrapolação, não interpolação), a literatura recomenda LOFO-CV e leave-one-year-out
   [C-11; C-14], aceitando que o número será mais conservador.
3. **Dimensionar o bloco pelo alcance de autocorrelação** — o tamanho do bloco foi a escolha
   metodológica mais importante, acima de forma e número de folds [C-12]; o alcance pode vir de um
   variograma [C-06].
4. **Casar a distribuição de distâncias**: NNDM e kNNDM casam a distribuição de distâncias
   teste↔treino da CV com a distribuição real predição↔treino esperada na aplicação; o kNNDM
   reduziu o custo de 4,8 dias para 1,2 minuto em 4.000 pontos [C-08, só abstract; C-09].
5. **Delimitar onde a predição vale** com AOA/índice de dissimilaridade [C-04, só abstract] e
   reportar erro local, não só global [C-05].
6. **Auditar vazamentos não espaciais**: seleção de features/hiperparâmetros fora da CV aninhada,
   normalização antes do split, features derivadas do alvo, imagens posteriores à data de previsão
   — todos casos da taxonomia de [C-07, só abstract].

### 3.15 Qual nível de erro é considerado útil operacionalmente?

**[LACUNA]** **Não há limiar universal na base revisada.** Sem evidência na base revisada para
"RMSE de X kg/ha é útil". O que existe são pontos de referência, cada um preso ao seu contexto:

| Referência | Valor | Contexto (não comparável entre linhas) |
|---|---|---|
| Melhor híbrido crop model + ML | RRMSE 6–7% | milho, condado, EUA, CV 10-fold aleatória + anos retidos de teste (2012, 2017, 2018), clima real do ano de teste [A-03] |
| Soja intra-talhão sob LOFO-CV | RMSE 554–765 kg/ha; MAE 421–676 kg/ha; R² de 0,54 a −6,23 | soja, 3 talhões, PlanetScope 3,12 m, EUA [C-11] |
| Soja municipal, safra nova retida | RMSE 585 kg/ha (vs. 414 no split aleatório) | soja, 15 municípios do PR, MODIS+CHIRPS [E-brasil-04] |
| Soja municipal, estados independentes | RMSE 168,31–491,17 kg/ha | soja, Centro-Oeste, Sentinel-2 + clima [B-15, só abstract] |
| Soja regional (Cerrado) | RMSE 176,93 kg/ha; R² 0,81 | soja, MATOPIBA, validação não declarada [E-brasil-07, só abstract] |
| Soja regional, só clima | RMSE 167,85–185,85 kg/ha | soja, MATOPIBA, ANN [H-10, só abstract] |
| Soja intra-talhão, Paraná | RMSE 7,24–37,32 (por talhão) e 38,82 (global) | soja, 15 talhões, grade 20 m, SVR, 10-fold + 75/25 [B-12] — valores registrados na base em kg/ha; a ordem de grandeza é muito inferior à dos demais estudos de soja e a unidade deve ser reconferida no artigo original antes de servir de referência |
| Soja intra-talhão, Hungria | RMSE 0,184 t/ha (S2) | soja, 7 talhões, 1 safra, split 70/30 [B-05] |
| Soja/trigo, UAV multimodal | RMSE relativo 15,9%; R² 0,720 | soja, 1 site, validação não declarada [H-06, só abstract] |

**[DECISÃO → ADR-001 D10]** (item b) Como não há limiar de literatura, o critério de utilidade do
projeto deve ser **relativo e interno**: superar, sob LOFO-CV e leave-one-year-out, os baselines
triviais (média do talhão, mapa histórico de produtividade do próprio talhão, índice único no
melhor estádio). O suporte para usar o histórico como baseline forte é [D-04]: para milho, trigo e
algodão o **histórico de produtividade foi o melhor preditor do padrão espacial**, embora para
**soja** o NDVI pós-fato tenha superado o histórico.

### 3.16 Como quantificar incerteza de previsão?

**[CONSENSO]** Dois pilares metodológicos, ambos com bibliotecas Python maduras e CPU-only:

- **Quantile Regression Forests (QRF)** — estima os quantis condicionais completos, não apenas a
  média, com consistência assintótica provada [G-02].
- **Conformal prediction / Conformalized Quantile Regression (CQR)** — intervalos com cobertura
  válida em amostra finita [G-01, só abstract]; o tutorial de referência cobre split conformal,
  *distribution shift* e séries temporais [G-03, só abstract].

Alternativas na base: **NGBoost**, paramétrico, mais simples de implementar mas exige assumir uma
família de distribuição — provavelmente menos robusto se o erro for assimétrico [G-05, só
abstract]; **Bayesian Neural Network** [G-13, só abstract]; **Deep Gaussian Process**, que fornece
incerteza por construção [A-08, só abstract]; **QRF com kernel de Epanechnikov** para densidade
completa, aplicado a amendoim e milheto em Gana [G-06, só abstract].

**[CONSENSO — a ressalva espacial é decisiva]** A garantia de cobertura do conformal padrão
depende de **permutabilidade (exchangeability) i.i.d.** entre treino, calibração e teste
[G-01, só abstract]. Calibrar com split aleatório de pixels dentro do mesmo talhão viola essa
premissa. A saída defendida na base é reconhecer **permutabilidade local aproximada** sob
amostragem espacial densa e **calibrar com vizinhança local**, não com reamostragem global
aleatória [G-04, só abstract]. A mesma referência sustenta que **não se pode agregar a incerteza
de células correlacionadas de um mesmo talhão somando variâncias como se fossem independentes** —
isso subestimaria drasticamente o intervalo do talhão.

**[RESULTADO ESPECÍFICO — garantia teórica não basta]** Um BNN aplicado a milho nos EUA obteve
R² de 0,77 no fim da safra e ~0,75 já em meados de agosto (~2 meses pré-colheita), mas a
**cobertura empírica do intervalo de 95% foi de ≥84%** das observações [G-13, só abstract] — o
abstract diz *"more than 84%"*, número compatível com 84,1% e com 94%; o que está estabelecido é
que ficou **abaixo do nominal**, não o quanto.
Qualquer intervalo publicado pelo produto precisa de **validação empírica de cobertura**, não só
da garantia teórica do método.

**[RESULTADO ESPECÍFICO]** Não presumir que redes neurais são superiores para incerteza: a rede
quantílica não superou a regressão quantílica tradicional, e QRF+LASSO foi o melhor método em um
painel de 36 anos e 1.260 condados [G-14, só abstract].

**[EVIDÊNCIA LIMITADA]** Nenhum estudo da base aplica QRF ou conformal a **soja no Brasil em
escala intra-talhão**. A extrapolação é aposta metodológica, não réplica. Sem evidência na base
revisada para esse caso.

### 3.17 Como tornar o modelo interpretável para um agrônomo?

**[CONSENSO]**

- **TreeSHAP** é a referência canônica e, segundo o próprio artigo, o **primeiro** algoritmo que
  calcula valores de Shapley **exatos em
  tempo polinomial** para modelos de árvore ("primeiro", não "único"), permitindo agregar explicações locais em entendimento
  global [G-07, só abstract]. É aplicável direto a RF/XGBoost/LightGBM.
- **ALE (Accumulated Local Effects) deve ser preferido a PDP** sempre que houver correlação
  relevante entre variáveis: está formalmente demonstrado que os gráficos de dependência parcial
  exigem extrapolação da resposta para valores de preditores muito fora do envelope multivariado
  dos dados de treino [G-08, só abstract]. Índices espectrais são altamente colineares entre si, e
  clima × relevo × solo covariam espacialmente — a condição que quebra o PDP é a regra, não a
  exceção, no nosso caso.
- **Armadilhas a comunicar explicitamente ao agrônomo**: dependência entre features, interações não
  capturadas, **interpretação causal indevida** (SHAP não é causalidade), interpretar modelos que
  não generalizam e ignorar a incerteza da própria estimativa de importância [G-09, só abstract].
- **Instabilidade da importância**: a importância de uma variável pode mudar entre modelos
  igualmente bons ajustados aos mesmos dados — o conceito de *Model Class Reliance* / conjunto de
  Rashomon [G-12]. Reportar a importância de **um** modelo vencedor pode ser enganoso sobre o papel
  agronômico real da variável.

**[EVIDÊNCIA]** Uso real em produtividade: SHAP em soja intra-talhão com LOFO-CV [C-11]; SHAP e
importância por permutação em milho/soja intra-talhão [D-12]; importância de variáveis em RF
[D-07, só abstract; D-09, só abstract]; atribuição de features para identificar estádios críticos
e variabilidade intra-talhão em soja/trigo/colza na Argentina, Uruguai e Alemanha
[G-11, preprint, só abstract]. Observação relevante: em milho de condado os autores usaram
**importância por permutação, não SHAP** [A-03] — a literatura aplicada ainda usa mais permutação
do que SHAP.

**[LACUNA]** Nenhum artigo revisado por pares da base aplica **SHAP espacialmente (mapa de SHAP
por pixel) a soja no Brasil**. Sem evidência na base revisada — e essa é uma das oportunidades de
contribuição original (seção 7).

### 3.18 Como transformar o modelo acadêmico em uma funcionalidade de software escalável?

**[EVIDÊNCIA LIMITADA]** A base é de literatura científica e cobre pouco de engenharia de
produto. O que ela sustenta diretamente:

1. **Escolher a família de modelo pela restrição operacional, não pela métrica**: XGBoost é
   motivado na literatura como alternativa ao DL precisamente pelo volume de dados exigido e pela
   natureza de caixa-preta deste [A-05, só abstract]; o SCYM é apresentado como método escalável
   que não exige ML pesado [B-04, só abstract; H-09, só abstract].
2. **Reprodutibilidade e ausência de vazamento são pré-requisito de produto, não refinamento
   acadêmico**: o vazamento afetou 294 artigos em 17 campos, e corrigi-lo derrubou a vantagem de
   modelos complexos [C-07, só abstract].
3. **O mapa precisa vir com medida de acurácia local e com demarcação de onde não se aplica**
   [C-05; C-04, só abstract] — isso é uma exigência de interface, não só de modelagem.
4. **Padronizar como a variabilidade é reportada**: existe uma revisão dedicada a indicadores de
   variabilidade intra-talhão e à sensibilidade de cada um, com árvore de decisão para escolher o
   indicador conforme o dado disponível [H-08, só abstract].
5. **Disponibilidade de código e dados é rara na base** — o que limita o reaproveitamento direto:
   têm código aberto declarado apenas [C-04, só abstract] (pacote R CAST), [C-06], [C-08, só
   abstract], [C-09], [C-10, só abstract], [G-05, só abstract] (NGBoost), [G-07, só abstract]
   (biblioteca `shap`), [G-08, só abstract] (ALE), [H-12, só abstract] (Yield Editor) e o método
   SCYM [B-04, só abstract]. **Nenhum dos 17 estudos brasileiros da base declara código aberto** (6 registram "não", 11 não informam).

**[LACUNA]** Arquitetura de serviço, *feature store*, versionamento de modelo, monitoramento de
*drift* e estratégia de *cold start* **não são cobertos por nenhum estudo da base**. Sem evidência
na base revisada — essas decisões pertencem ao ADR-001 e ao documento de arquitetura, e devem ser
rotuladas como **[DECISÃO → ADR-001 Dn]** (quando já decididas no ADR) ou **[RECOMENDAÇÃO — a formalizar em ADR]** (quando ainda não há ADR), nunca como evidência.

---

## 4. Evidência brasileira

### 4.1 O que existe

A base tem **17 estudos com país = Brasil**, distribuídos entre o eixo E (9 estudos brasileiros
dedicados) e os eixos B, D e H. Organizados por escala:

**Intra-talhão com mapa de colhedora real — um único estudo.**
[B-12] (Crusiol et al., 2022, *Precision Agriculture*, Embrapa Soja + parceiros): **15 talhões em
3 fazendas, mais de 500 ha, Paraná (Astorga e Mauá da Serra), safra 2019/20**, Sentinel-2 com
9 bandas Vis/NIR/SWIR + 8 índices, **grade de 20 m no mapa de produtividade**, PLSR e SVR,
validação com 10-fold CV + split 75/25 com validação externa no modelo global. Resultados: SVR
*field-based* com R² de 0,07 a 0,79 entre os 15 talhões, *farm-based* 0,60–0,70 e *global-based*
0,75; RMSE de 7,24 a 37,32 (por talhão) e 38,82 (global), registrados na base em kg/ha.
Limitações declaradas: nenhuma tendência temporal consistente na melhor data de monitoramento
entre talhões; índices isolados com correlação ora positiva ora negativa sem padrão; e nebulosidade
de 40–70% no Paraná, deixando apenas 4–10 imagens por talhão na safra.

**Intra-talhão sem alvo de produtividade colhida.**
[E-brasil-03, tese, só abstract] (UFSM, 2014): investiga causas da variabilidade do **índice de
massa** da soja (biomassa), testando nematoides (*Meloidogyne* sp., *Heterodera glycines*),
fertilidade, compactação, declividade e densidade de plantas, com três sensores; o sensor ativo
teve o melhor desempenho. **Não é predição de produtividade colhida**, e o abstract registra
ausência de correlação entre o índice de massa e a fertilidade do solo — achado contraintuitivo
que só temos em nível de abstract.

**Talhão / parcela experimental.**
[H-03, só abstract] (Embrapa Soja, Londrina): PLSR sobre reflectância **foliar** hiperespectral em
parcelas experimentais sob diferentes níveis de disponibilidade hídrica, 3 safras; R² de
0,731–0,924 por safra em R5, RMSE de 334–403 kg/ha; modelo único das 3 safras com 0,775/0,730/0,688
(calibração/CV/externa) e RMSE menor que 634 kg/ha. Sensor **proximal**, não orbital.
[D-11, relatório, só abstract] (Embrapa Soja, Guarapuava-PR): variabilidade espacial da
produtividade de soja e da CEa em Latossolo Bruno, correlação **negativa** entre CEa e
produtividade, sem R² reportado.

**Município.**
[E-brasil-01] (INPE, 2003): AGROMET em 144 municípios do Paraná, 5 safras, comparado por teste t
pareado contra a estatística oficial da SEAB; superestimou 10,8% em 96/97 (oídio não modelado) e
subestimou 10,5% em 00/01 (datas de semeadura e cultivares).
[E-brasil-04] (2023, ISPRS Archives): MODIS + CHIRPS, **15 municípios** do Paraná, **safras de
2005/06 a 2020/21**, 18 features. *(Correção de registro: o artigo declara literalmente "15
municipalities" e o intervalo "from the 2005–06 to the 2020–21 season"; **não declara o número de
safras**, e o intervalo informado corresponde a 16 safras. O "15 safras" antes registrado na base
confundia o número de municípios com o de safras — ver `verificacao-citacoes.md`, adendo C-32.)* RFR (ntree=200, mtry=5) com R² de 0,748 no teste de 20% e
0,693 na safra nova retida; RMSE de 414 para 585 kg/ha.
[B-03, só abstract] (Schwalbert et al., 2020): soja no Rio Grande do Sul, NDVI/EVI/LST +
meteorologia, LSTM melhor na maioria das datas de previsão; MAE de 0,24 Mg/ha (DOY 64) a
0,42 Mg/ha (DOY 16).
[B-15, só abstract] (2026, *Big Earth Data*): soja no Centro-Oeste, Sentinel-2 + clima, XGBoost aos
150 dias após a semeadura; R² 0,72 no split 70/30 e 0,34–0,76 em estados independentes; RMSE
301,52 kg/ha e 168,31–491,17 kg/ha respectivamente.

**Regional / nacional.**
[E-brasil-05, monografia] (ICMC-USP, 2024): 56 mesorregiões, 15 safras, **apenas estações
meteorológicas**, RF com MAPE de 8%; a CNN sobre *recurrence plots* exigiu mais computação e não
superou o RF.
[E-brasil-07, só abstract] (2021, *JSFA*): soja no MATOPIBA/Cerrado, RF com R² 0,81 e RMSE
176,93 kg/ha; esquema de validação não confirmado.
[H-10, só abstract] (2021, *Agronomy Journal*): ANN sobre clima e balanço hídrico no MATOPIBA;
R² 0,88 (estimativa) e 0,86 (previsão 2 meses antes), RMSE 167,85 e 185,85 kg/ha.
[D-08, só abstract]: CROPGRO no subtrópico gaúcho, decomposição do *yield gap*.

**Registrados apenas por rastreabilidade (só metadados — não sustentam número algum).**
[E-brasil-08, só metadados], [E-brasil-09, só metadados] (grupo Amaral/Oldoni/Freitas,
*Precision Agriculture*, 2024 — o
segundo sobre medidas de **textura** de imagem Sentinel-2, linha metodológica pouco explorada),
[E-brasil-10] (mapa nacional de soja a 30 m calibrado com alvo **municipal**, não com mapa de
colhedora), [H-11, só metadados] (ML para previsão de soja no Brasil, 2023).
[E-brasil-02, tese, só abstract]: tese de origem do artigo [B-03], LSTM, MAE de 0,42 Mg/ha em
soja cerca de 70 dias antes da colheita.

### 4.2 Particularidades tropicais que mudam o método

1. **Nuvens.** **[RESULTADO ESPECÍFICO]** 40–70% de cobertura de nuvens no Paraná deixaram apenas
   **4 a 10 imagens Sentinel-2 por talhão na safra** [B-12]. O estudo municipal do Paraná recorreu
   a CHIRPS justamente pela dificuldade óptica [E-brasil-04]. **[HIPÓTESE]** A fusão SAR-óptico é
   promissora para a safra de verão brasileira: Sentinel-1 + Sentinel-2 + TWI deu RF com R² de
   0,41–0,89 e RMSE de 0,122–0,224 t/ha em soja [B-13, só abstract], mas **fora do Brasil**, e a
   faixa larga de R² mostra dependência forte da data de aquisição. Sem evidência na base revisada
   para fusão SAR-óptico em safra tropical brasileira.
2. **Pressão de doença.** **[RESULTADO ESPECÍFICO]** Um modelo sem componente fitossanitário errou
   +10,8% numa safra de oídio [E-brasil-01] — evidência de que, no Brasil, o resíduo de um modelo
   clima+espectro pode ser dominado por eventos fitossanitários.
3. **Solos tropicais e plantio direto.** **[LACUNA]** Nenhum dos estudos brasileiros da base usa
   Latossolo, V%, acidez, alumínio ou CTC como covariável de um modelo de produtividade. O único a
   tocar em fertilidade [E-brasil-03, tese, só abstract] **não encontrou correlação** com o índice
   de massa. Sem evidência na base revisada.
4. **Cultivares e grupos de maturação.** [B-12] usou 6 cultivares/grupos de maturação sem
   controlar por isso — limitação declarada. [D-08, só abstract] mostra que o grupo de maturação
   altera a eficiência de uso da água (9,6 kg/ha/mm para MG ≤ 5.5 contra menos para MG ≥ 5.6).
5. **Rotação soja–milho safrinha.** **[LACUNA]** Nenhum estudo brasileiro revisado por pares na
   base trata a rotação/safrinha como componente do modelo de sensoriamento + ML. Sem evidência na
   base revisada.
6. **Ausência de base pública de mapas de colheita.** **[LACUNA]** Não há, na base revisada,
   nenhuma base pública brasileira de mapas de colhedora; o único dado de colhedora usado na
   literatura brasileira aqui reunida vem de origem privada e não é redistribuído [B-12].

### 4.3 O estudo mais próximo do nosso caso

**[B-12] é, com folga, o estudo mais próximo do MVP.** A tabela abaixo confronta os dois:

| Dimensão | [B-12] (Crusiol et al., 2022) | MVP Invicta |
|---|---|---|
| Cultura | soja | soja |
| País/região | Brasil, Paraná | Brasil |
| Escala | intra-talhão | intra-talhão |
| Grade do alvo | **20 m** | **20 × 20 m** |
| Alvo | mapa de colhedora limpo (filtro de outlier) e interpolado | mapa de colhedora limpo (`colheita.py`) + IDW |
| Sensor | Sentinel-2, 9 bandas Vis/NIR/SWIR + 8 índices | Sentinel-2 via STAC + CBERS-4A, catálogo de 12 índices |
| Modelos | PLSR, SVR | a definir (ADR-001) |
| Talhões / safras | 15 talhões, 3 fazendas, 1 safra principal | 20–100 talhões-safra |
| Validação | 10-fold + split 75/25 com validação externa | a definir — **aqui está a diferença decisiva** |
| Incerteza | não | sim (objetivo do MVP) |
| Explicabilidade | não | sim, SHAP (objetivo do MVP) |
| Solo / CEa / relevo | não usados | já existem na plataforma |

**O que herdamos de [B-12]**: a viabilidade do pipeline (mapa de colheita → limpeza → grade de
20 m → Sentinel-2 → ML) em condições brasileiras reais, e o alerta de que a nebulosidade limita a
série temporal. **O que ele não responde**: se o modelo generaliza para um talhão nunca visto — a
comparação *field-based* > *farm-based* > *global-based* é feita **sem** leave-one-field-out
formal, e portanto o R² de 0,79 do melhor talhão não é comparável ao R² de 0,54 a −6,23 obtido
sob LOFO-CV em soja nos EUA [C-11].

**Segundo estudo mais próximo**: [C-11], por ser soja, intra-talhão, XGBoost + SHAP, com
leave-one-field-out explícito e o regime de dados quase idêntico (3 talhões, 2 safras) — mas nos
EUA, com PlanetScope de 3,12 m.

---

## 5. Contradições e debates abertos

> **Como ler esta seção.** Ela **não reexpõe** os números das seções 2 e 3 — sintetiza os pontos
> em que a base **discorda de si mesma**, e remete à seção onde cada número está detalhado, com a
> unidade, a escala e o tipo de validação. Cada número deste documento é apresentado por extenso
> **uma vez**; as demais menções são remissões.
>
> | Contradição | Onde os números estão |
> |---|---|
> | 5.1 Validação espacial vs. crítica de Wadoux | §2.9, §2.10, §2.11 |
> | 5.2 Resolução fina vs. acurácia empírica | §2.8 |
> | 5.3 Bandas brutas vs. índices | §2.6 |
> | 5.4 Instabilidade do "melhor modelo" | §2.2, §2.12 |
> | 5.5 Solo e topografia no intra-talhão | §3.8, §3.9, §3.10 |
> | 5.6 Modelo por talhão vs. global | §1.2, §4.3 |

### 5.1 Validação espacial: necessária ou pessimista demais?

**Há duas posições na base, e elas se contradizem diretamente.**

**Posição A — a validação espacial é necessária, e a aleatória mente.** RF prevendo biomassa
florestal com 190.000 parcelas: R² de 0,53 (random 10-fold) para 0,14 (spatial 44-fold), RMSE de
56,5 para 77,5 Mg/ha contra 82 de um modelo nulo; com buffer de exclusão de 100 km ou mais o R²
tende a zero; e o modelo treinado só com coordenadas empata com o completo [C-01]. A CV em blocos
é defendida como mais apropriada que a aleatória em dados com estrutura espacial, temporal,
hierárquica ou filogenética [C-02, só abstract]. A CV aleatória subestimou o erro em 5–54% em
sensoriamento marinho [C-12]. Mapas de ML publicados com CV ingênua foram criticados como
inavaliáveis [C-05].

**Posição B — a CV espacial superestima o erro e não tem fundamento teórico.** Em experimento
numérico próprio sobre biomassa amazônica, a CV espacial e a *buffered* LOO **superestimaram o
erro** (viés de +10 a +15 Mg/ha) sob amostragem aleatória e sistemática, enquanto a CV padrão ficou
praticamente sem viés nesse cenário; sob amostragem em cluster a CV padrão subestimou o erro
(viés de −10 Mg/ha) e a espacial teve viés menor. A recomendação dos autores é amostragem
probabilística com inferência *design-based* [C-03].

**Reconciliação disponível na base.** O NNDM e o kNNDM propõem casar a distribuição de distâncias
teste↔treino da validação com a distribuição real predição↔treino esperada na aplicação
[C-08, só abstract; C-09]. A leitura que reconcilia as duas posições é: **a estratégia de
validação depende do objetivo**. Se o objetivo é **interpolar** dentro de uma área amostrada, a
CV espacial tende a ser pessimista (dá razão a [C-03]). Se o objetivo é **extrapolar para novas
áreas de predição**, a CV espacial é necessária (dá razão a [C-01]). E há o alerta complementar de
que uma blocagem mal desenhada pode induzir extrapolações involuntárias e superestimar o erro de
interpolação [C-02, só abstract] — motivo pelo qual **o tamanho do bloco foi identificado como a
escolha metodológica mais importante**, acima da forma e do número de folds [C-12].

**Implicação para este projeto.** O produto prevê **talhão e safra nunca vistos** — isto é
extrapolação, não interpolação. A base, portanto, recomenda o esquema conservador. **[HIPÓTESE]**
A tradução dessa recomendação para grade de 20 m em soja brasileira não foi testada por nenhum
estudo da base.

**Debate não resolvido em aberto.** [C-12] registra que a CV espacial, sozinha, **não impede
sobreajuste**: ela falhou em mais de 50% dos casos testados contra modelos deliberadamente
sobreajustados.

### 5.2 Resolução: 3 m vale mais que 10 m?

Contradição **interna a um mesmo estudo**: a simulação de degradação de resolução de [B-08, só
abstract] favorece o pixel fino, e os modelos empíricos do mesmo trabalho favorecem o pixel
grosseiro; em soja, [B-05] tem o Sentinel-2 de 10 m superando o PlanetScope de 3 m. **Os números
estão na §2.8** e não se repetem aqui. Do outro lado,
[C-11] usou PlanetScope de 3,12 m e ainda assim registra que as imagens **perderam eventos
críticos de crescimento**, e [B-06] mostra que a fusão espectral PlanetScope + Sentinel-2 produziu
o **pior desempenho justamente para produtividade** entre os traços previstos.

**Debate aberto.** A base não resolve se a vantagem teórica da resolução fina é anulada por
qualidade radiométrica, por número de bandas úteis, por revisita/cobertura de nuvens, ou por erro
de coregistro entre pixel e ponto de colhedora. **[EVIDÊNCIA LIMITADA]** Este último é reconhecido
como problema não trivial: um estudo propõe um método específico de casamento polígono-pixel para
alinhar polígonos de colheita com pixels de satélite [B-07, só abstract].

### 5.3 Bandas brutas versus índices de vegetação

**Posição A — índices são o caminho.** A maior parte da literatura aplicada usa índices, e há
ranking claro entre eles em estudos específicos: GNDVI melhor que NDVI em milho [B-01, só
abstract]; NDRE e red-edge entre os mais importantes em soja municipal [B-15, só abstract]; três
bandas red-edge juntas superando menos bandas red-edge [B-14, só abstract].

**Posição B — bandas brutas bastam ou superam.** Em soja, só as bandas brutas do PlanetScope
produziram a curva de R² 0,26 → >0,70 ao longo da fenologia [B-10, só abstract]; e em soja no
Paraná as 9 bandas Vis/NIR/SWIR do Sentinel-2 superaram os 8 índices testados sob PLSR e SVR
[B-12].

**Argumento adicional a favor de moderação no número de índices**: índices são fortemente
colineares, e features correlacionadas quebram o PDP e distribuem importância de forma enganosa
entre variáveis colineares [G-08, só abstract; G-07, só abstract].

**Debate aberto.** A base não contém um experimento de ablação controlado "bandas vs. índices vs.
bandas+índices" em soja intra-talhão brasileira. Sem evidência na base revisada.

### 5.4 "Melhor modelo" é instável entre anos, talhões e estudos

A base contém pelo menos cinco contradições diretas de ranking de modelo:

1. RF tem o menor RMSE agregado, mas o 1D-CNN vence **no ano de 2018** [A-09, só abstract].
2. SGD supera RF e XGBoost em soja na Áustria [B-07, só abstract], contra a hegemonia de árvores.
3. ViT supera CNN-LSTM com apenas 450 plots [A-06], contra a regra de que DL precisa de muitos
   dados.
4. GWRFR supera RF padrão, MLR, PLSR, SVR e árvore de decisão em milho de condado [C-13, só
   abstract]; mas RF com distâncias-buffer como features (RFsp) apenas **empata** com krigagem, e
   os autores alertam que, com poucos pontos e poucas covariáveis, a geoestatística baseada em
   modelo ainda pode ser mais acurada [C-10, só abstract].
5. Um RF com R² de 0,9949 produziu mapas espacialmente irreais, e a GRU com krigagem dos resíduos,
   com R² menor (0,886), foi considerada o melhor equilíbrio entre realismo espacial e acurácia
   [H-04]. **A métrica global e a qualidade do mapa podem apontar em direções opostas.** (Sobre o
   que dessa técnica transfere — e o que não transfere — para previsão pré-colheita, ver §7.2, O8.)

**Consequência metodológica**: a base não autoriza escolher um modelo a priori. Ela autoriza
**comparar famílias sob o mesmo esquema de validação rigoroso** e registrar a instabilidade como
resultado — o que é reforçado pelo conceito de conjunto de Rashomon [G-12].

### 5.5 Solo e topografia ajudam ou atrapalham no intra-talhão?

**A favor**: solo explica ~30% e topografia ~20% da variabilidade [D-01, só abstract]; CEa +
topografia dão R² de 0,32 combinados [D-02]; declividade e elevação estão no top-3 para soja
[D-12]; declividade aparece entre as variáveis mais importantes em [B-09, só abstract].

**Contra**: no único estudo de soja intra-talhão com LOFO-CV da base, **solo e topografia pioraram
o desempenho**, e o melhor modelo foi o que usava só índices de vegetação [C-11]. E, quando há
imagem de solo nu de alta resolução, os índices dela superam a topografia em importância relativa
[D-06, só abstract].

**Leitura possível, ainda não testada.** **[HIPÓTESE]** A contradição pode ser de **regime de
dados**, não de agronomia: features estáticas de solo/relevo descrevem o talhão, e com poucos
talhões independentes elas permitem ao modelo **identificar o talhão** em vez de aprender a
relação agronômica — exatamente o mecanismo de vazamento espacial demonstrado com coordenadas X/Y
em [C-01]. Sem evidência direta na base revisada; é uma hipótese testável pelo projeto.

### 5.6 Modelo específico por talhão versus modelo global

[B-12] mostra *field-based* > *farm-based* > *global-based* em soja no Paraná (números na §1.2;
leitura completa do estudo na §4.3). Mas modelo por talhão **não é utilizável para prever um
talhão novo**, e [B-04, só abstract] mostra que o RF treinado com dados reais só funciona bem com
pelo menos ~1.000 observações de calibração e degrada fora do domínio de treino. **[HIPÓTESE]** Um modelo global com efeito de talhão/cluster
explícito seria o compromisso; não há estudo na base que teste isso em soja brasileira.

---

## 6. Erros metodológicos frequentes na literatura

Lista de erros recorrentes **observados na própria base revisada** — cada um com o(s) estudo(s)
onde o problema aparece ou onde é documentado. Para não duplicar valores, os números de cada erro
ficam na seção que os apresenta (§2.8, §2.9, §2.10) e aqui há apenas a remissão.

1. **Split de pixels/observações do mesmo talhão como validação final.**
   Ocorre em [B-05] e [B-06] (ambos declaram 70/30 aleatório) e, em forma não declarada, em
   [B-01, só abstract], cujo abstract diz apenas *"an independent validation set of half of the
   total observations"* — metade das observações do mesmo talhão/safra, sem afirmar sorteio
   aleatório. É a prática dominante. Documentado como fonte
   de otimismo em [C-01], [C-12], [C-14]. Os próprios autores de [B-10, só abstract] registram
   que falta testar em talhões não usados no treino.
2. **Não declarar o esquema de validação.** **28 estudos** da base têm `validation` literalmente
   igual a `nd` ([A-01], [A-02], [A-05], [A-08], [D-01], [D-02], [D-03], [D-05], [D-06], [D-07],
   [D-09], [D-10], [D-11], [E-brasil-03], [E-brasil-08], [E-brasil-09], [E-brasil-10], [H-01],
   [H-05], [H-06], [H-07], [H-08], [H-09], [H-10], [H-11], [H-12], [H-13], [H-14]), e outros **14**
   registram em texto livre "não detalhado / não especificado no abstract" ([A-07], [B-01],
   [B-03], [B-07], [B-10],
   [B-13], [B-14], [C-13], [E-brasil-02], [E-brasil-05], [E-brasil-07], [G-04], [G-05], [G-11]).
   São **42 dos 87**, ou 48% da base. Sem o esquema, a métrica não é interpretável. *(Contagem
   refeita por script sobre o CSV, pelo critério único enunciado em §2.9; a versão anterior deste
   item dizia "doze" e listava estudos das
   duas categorias misturados — ver `verificacao-citacoes.md`, adendos C-06, C-18 e C-31.)*
3. **Comparar métricas entre escalas diferentes.** Um R² de condado e um R² de pixel não são a
   mesma quantidade — o mesmo modelo e os mesmos dados mudam de patamar só pela unidade de
   agregação [B-04, só abstract]. **Números na §1.2.**
4. **Usar informação do futuro como feature.** O ganho de 7–20% do híbrido com crop model foi
   medido com o **clima real do ano de teste** alimentando o APSIM — condição indisponível em
   previsão pré-colheita [A-03].
5. **Coordenadas ou proxies de posição como feature preditiva.** Demonstrado como suficiente para
   simular um bom modelo em [C-01].
6. **Apresentar média de uma faixa muito larga como número estável.** O "~30% de variância
   explicada pelo solo" esconde uma faixa de 5% a 71% entre campos [D-01, só abstract]; o
   "R² 0,41–0,89" de [B-13, só abstract] depende fortemente da época de aquisição.
7. **Tratar métricas não comparáveis como se fossem R²/RMSE.** CCC em [B-14, só abstract];
   fração de variância capturada em [H-09, só abstract]; e o caso corrigido de [C-09], cujo valor
   de 28% era a fração de variação do RMSE explicada por uma estatística de Wasserstein — removido
   da base como R².
8. **Confiar no R² global e não olhar o mapa.** RF com R² = 0,9949 e mapas espacialmente irreais
   [H-04].
9. **Não limpar o alvo com critério espacial.** 10–50% das observações de um talhão contêm erro
   [H-12, só abstract]; são os outliers **espaciais locais**, e não os globais, que alteram a
   estrutura do mapa [H-13, só abstract]; e as fontes de erro — dinâmica da colhedora, medição
   contínua, GNSS, operador — estão catalogadas [H-14, só abstract].
10. **Usar algoritmo de estabilidade temporal baseado em desvio-padrão.** A distribuição de
    produtividade é negativamente assimétrica em todas as 4 culturas testadas (p < 0,05), o que
    enviesa o algoritmo de desvio-padrão; um algoritmo baseado em percentil corrige o viés
    [D-10, só abstract].
11. **Vazamento em seleção de features, normalização e ajuste de hiperparâmetros fora da CV
    aninhada.** Taxonomia geral em [C-07, só abstract], que documenta 294 artigos afetados em
    17 campos.
12. **Usar PDP com features correlacionadas.** Formalmente demonstrado como enganoso
    [G-08, só abstract]; e a lista de armadilhas de interpretação — dependência entre features,
    interações não capturadas, causalidade indevida, ignorar a incerteza da importância — está
    consolidada em [G-09, só abstract].
13. **Reportar a importância de um único modelo vencedor como se fosse a importância agronômica da
    variável.** Contestado pelo conceito de conjunto de Rashomon / *Model Class Reliance* [G-12].
14. **Publicar intervalo de incerteza sem verificar a cobertura empírica.** Um BNN com intervalo
    nominal de 95% teve cobertura observada de ≥84% [G-13, só abstract].
15. **Publicar mapa sem dizer onde ele não se aplica.** A recomendação é acompanhar o mapa de
    medidas de acurácia local e de demarcação da área de aplicabilidade [C-05; C-04, só abstract].
16. **Presumir superioridade por complexidade.** A rede quantílica não superou a regressão
    quantílica tradicional [G-14, só abstract]; a CNN sobre *recurrence plots* não superou o RF em
    escala mesorregional brasileira [E-brasil-05].

---

## 7. Lacunas da literatura e oportunidades de contribuição original

### 7.1 Lacunas identificadas (todas com a formulação exigida)

| # | Lacuna | Suporte |
|---|---|---|
| L1 | **Nenhum estudo combina soja + Brasil + intra-talhão + leave-one-field-out + leave-one-year-out.** Sem evidência na base revisada. | [B-12] chega perto mas não formaliza LOFO; [C-11] e [C-14] fazem LOFO mas nos EUA/Japão |
| L2 | **Nenhum estudo brasileiro da base reporta incerteza (intervalo de predição) nem explicabilidade (SHAP).** Sem evidência na base revisada. | ausência unânime nas colunas `uncertainty` e `explainability` dos 9 estudos do eixo E |
| L3 | **Nenhum artigo revisado por pares aplica SHAP espacial (mapa de SHAP por pixel) a soja no Brasil.** Sem evidência na base revisada. | o mais próximo é [G-11, preprint, só abstract], em Argentina/Uruguai/Alemanha |
| L4 | **Nenhum estudo integra mapa intra-talhão + fertilidade krigada + CEa + relevo num mesmo modelo de produtividade de soja.** Sem evidência na base revisada. | [B-12] não usa solo/CEa; [D-02], [D-09], [D-11] usam CEa mas não sensoriamento orbital em grade fina |
| L5 | **Não há curva contínua de acurácia × antecedência (dias antes da colheita) para soja intra-talhão.** Sem evidência na base revisada. | [B-10, só abstract] tem 6 pontos de estádio; [B-03, só abstract] tem curva, mas municipal |
| L6 | **Não há teste controlado de resolução de MDE sobre a acurácia de predição intra-talhão.** Sem evidência na base revisada. | apenas literatura de acurácia vertical genérica de MDE, fora do escopo agronômico |
| L7 | **Não há teste explícito de vazamento por interpolação** (usar mapa krigado de fertilidade como feature). Sem evidência na base revisada. | risco inferido por analogia a partir de [D-09, só abstract] e [C-07, só abstract] |
| L8 | **Não há estudo de estabilidade interanual da relação CEa × produtividade** com métrica quantitativa. Sem evidência na base revisada. | [D-02] mostra variação entre sites, não entre anos secos/úmidos |
| L9 | **Não há teste de fusão SAR + óptico para a safra de verão tropical brasileira** (gap-filling sob nuvem). Sem evidência na base revisada. | [B-13, só abstract] testa S1+S2, mas fora do Brasil |
| L10 | **Não há estudo de soja–milho safrinha / rotação como covariável** em modelo de sensoriamento + ML. Sem evidência na base revisada. | busca dedicada não encontrou material acessível |
| L11 | **Não há conformal prediction espacial validado em dados agrícolas reais.** Sem evidência na base revisada. | [G-04, só abstract] é teoria estatística geral |
| L12 | **Não há comparação direta GBM vs. DL no regime de 20–100 talhões-safra.** Sem evidência na base revisada. | todos os comparativos da base são de condado ou de conjuntos muito maiores |
| L13 | **Não há limiar de erro operacionalmente útil estabelecido para predição intra-talhão de soja.** Sem evidência na base revisada. | ver tabela de 3.15 |
| L14 | **Não há codificação de cultivar (categórica de alta cardinalidade) testada em ML de produtividade intra-talhão.** Sem evidência na base revisada. | [D-07, só abstract] é a pista indireta mais próxima |
| L15 | **Não há base pública brasileira de mapas de colheita.** Sem evidência na base revisada. | o único dado de colhedora da literatura brasileira aqui reunida é privado [B-12] |
| L16 | **Nenhum dos 17 estudos brasileiros da base declara código aberto** (6 registram "não", 11 não informam). | colunas `code_available` do eixo E |

### 7.2 Oportunidades de contribuição original do projeto

Ordenadas por razão entre valor científico e viabilidade com o que a plataforma já tem.

**O1 — Protocolo de validação honesto para predição intra-talhão de soja no Brasil (ataca L1).**
Aplicar, no mesmo conjunto de 20–100 talhões-safra, a escada completa de validação da seção 17 do
pedido — aleatório → GroupKFold por talhão → leave-one-field-out → leave-one-year-out → fazenda
externa — e **publicar a degradação da métrica em cada degrau**. A base já mostra a degradação em
outros contextos ([C-01]: 0,53 → 0,14; [C-11]: até R² negativo; [E-brasil-04]: 0,748 → 0,693;
[B-15, só abstract]: 0,72 → 0,34–0,76; [D-12]: 0,90 → 0,77–0,79), mas **nunca para soja
intra-talhão brasileira**. Esta é a contribuição de maior valor e menor custo.
*Compatibilidade: `reusa` (particionamento com `scikit-learn`, que é leve e CPU-only) —
`scikit-learn` ainda não está nas libs pinadas do backend.*

**O2 — Integração inédita de mapa de colheita + fertilidade krigada + CEa + relevo (ataca L4).**
Nenhum estudo da base combina essas quatro camadas em soja. A plataforma já as tem todas em
produção (`colheita.py`, `interp.py` com krigagem ordinária validada por LOO, CEa rasa/profunda,
`mde.py`). Uma ablação por grupo de features responde de forma direta à pergunta 3.8/3.9/3.10 no
contexto tropical, que hoje é [LACUNA].
*Compatibilidade: `reusa`.*

**O3 — Quantificar o vazamento por interpolação (ataca L7 e testa a hipótese de 5.5).**
Comparar o desempenho sob LOFO-CV de um modelo que usa mapas krigados de fertilidade como features
contra um que usa apenas as amostras pontuais ou nenhum atributo de solo. Se a hipótese de 5.5
estiver certa, o modelo com mapa krigado ganha em CV aleatória e **perde** em LOFO-CV. Isso seria
um achado metodológico novo — a base não contém teste equivalente.
*Compatibilidade: `reusa`.*

**O4 — Curva de acurácia × antecedência para soja intra-talhão no Brasil (ataca L5).**
Produzir a curva contínua de RMSE/R² por data de previsão sob LOFO-CV, com as restrições reais de
nuvem do Brasil (4–10 imagens por talhão [B-12]). Responde à pergunta 3.7 com número brasileiro.
*Compatibilidade: `reusa` (a série de índices por talhão já existe via robô noturno + STAC).*

**O5 — Incerteza calibrada espacialmente e cobertura empírica verificada (ataca L2 e L11).**
Implementar QRF e/ou CQR com **calibração por vizinhança local**, conforme a exigência de
permutabilidade local [G-04, só abstract], e **reportar a cobertura empírica observada**, não
apenas a nominal — precaução justificada pelo caso do BNN com cobertura de ≥84% para nominal de 95% [G-13, só abstract].
Nenhum estudo brasileiro da base entrega intervalo.
*Compatibilidade: `novo_barato` (`quantile-forest`, `MAPIE`, `ngboost` são CPU-only e leves).*

**O6 — Mapa de SHAP por célula para soja no Brasil (ataca L3).**
Gerar o mapa de contribuição por variável por célula de 20 m, com ALE no lugar de PDP por causa da
colinearidade [G-08, só abstract], com aviso explícito de não-causalidade [G-09, só abstract] e com
verificação de estabilidade da importância entre folds à luz do conjunto de Rashomon [G-12].
*Compatibilidade: `novo_barato` (`shap` é CPU-only).*

**O7 — Auditoria do pipeline de limpeza do alvo contra o padrão da literatura (ataca a qualidade
do alvo).** Comparar o `colheita.py` atual com o protocolo em dois estágios de filtro global +
filtro espacial local por índice de Moran [H-13, só abstract] e com as categorias de erro de
[H-14, só abstract] e [H-12, só abstract]. O erro do alvo entra direto no RMSE reportado.
*Compatibilidade: `reusa` + `novo_barato` (Moran local com `numpy`/`scipy`).*

**O8 — Krigagem dos resíduos, em dois usos restritos (e não na previsão pré-colheita).**
[H-04] reporta redução de 35–45% no RMSE ao krigar os resíduos de um modelo já treinado, e a
plataforma já tem `pykrige` em produção — mas a oportunidade é menor do que parece, e a ressalva
que importa **não** é a de cultura/país.

**Por que não serve para o produto principal.** Em [H-04] o alvo agregado é **observado**: o
desenho é treinar a nível de vilarejo, prever por pixel, **agregar de volta ao vilarejo** e
comparar com a estatística oficial **reportada**; o resíduo existe porque esse valor é conhecido
no momento da predição. É desagregação/interpolação de um valor conhecido, não previsão. Como
resíduo = observado − previsto, num talhão-safra **pré-colheita** não existe observado, e num
talhão nunca visto não existe em ponto algum: não há o que krigar. Sob LOFO-CV, krigar o resíduo
do talhão retido exigiria conhecer a colheita dele — **vazamento pelo alvo**.

**O que sobra, como `[HIPÓTESE]` de escopo restrito:**

1. **Pós-colheita / diagnóstico.** Krigar o resíduo já observado para mapear o erro (§6 do ADR
   D10(c)) e para **completar o mapa de um talhão parcialmente colhido** a partir da parte já
   colhida. Aqui o regime é o mesmo de [H-04] — interpolação de valor observado — e a técnica é
   legítima. Não pode ser reportada como desempenho preditivo.
2. **"Resíduo persistente".** Krigar os resíduos de **safras anteriores** do mesmo talhão e usá-los
   como feature/offset defasado. Isso é uma **hipótese de estabilidade temporal do padrão
   intra-talhão**, não um resultado: a base dá apoio ambíguo — [D-04] mostra que, **para soja**, o
   histórico do próprio talhão é preditor *pior* do padrão espacial que o NDVI pós-fato; [D-05]
   mostra drivers que mudam de sinal entre fases; e [D-10, só abstract] chama de "modesto" o ganho
   de safras adicionais. Só existe para talhões com histórico, é marcada `derivada_do_alvo` no
   *lineage*, e deve ser avaliada sob **leave-one-year-out**, nunca sob LOFO. **Inexistente no
   cold start.**

*Compatibilidade: `reusa` — mas o valor esperado é menor do que a redução de 35–45% de [H-04]
sugere, porque o regime é outro.*

**O9 — Benchmark contra baselines triviais sob validação rigorosa (ataca L13).**
Publicar a comparação do modelo contra média do talhão, mapa histórico do próprio talhão [D-04;
D-10, só abstract] e índice único no melhor estádio [B-01, só abstract], todos sob o mesmo
LOFO-CV. Sem limiar de literatura (L13), este é o único critério de utilidade defensável.
*Compatibilidade: `reusa`.*

**O10 — Publicar código e protocolo (ataca L16).**
Nenhum dos 17 estudos brasileiros da base declara código aberto. Abrir o protocolo de validação e a
pipeline de features seria contribuição de reprodutibilidade, alinhada ao critério de sucesso
acadêmico da seção 60 do pedido (metodologia robusta, ausência de vazamento, validação realista,
comparação justa, interpretabilidade, aplicabilidade real) — que explicitamente **não exige o menor
RMSE da literatura**.
*Compatibilidade: `reusa`.*

---

## 8. Quais técnicas testar primeiro

> **Escopo desta seção.** É uma **priorização de experimentos**, não uma decisão de arquitetura.
> As decisões (qual modelo entra no MVP, qual resolução, qual esquema de validação será o oficial,
> qual biblioteca) pertencem ao `docs/decisions/ADR-001-model-strategy.md`. Aqui cada item traz
> apenas: o que testar, por que a base sustenta, e a **classe de compatibilidade** com o perfil
> atual da plataforma.
>
> Classes: **`reusa`** = usa o que já existe na stack; **`novo_barato`** = exige biblioteca ou
> ingestão nova, CPU-only e leve; **`infra_nova`** = exige infraestrutura que hoje não existe
> (GPU, crop model, pipeline SAR).

### Bloco 1 — Fundação de avaliação (antes de qualquer modelo)

| # | O que testar | Suporte | Classe | Motivo da classe |
|---|---|---|---|---|
| 1 | **Auditar e endurecer a limpeza do mapa de colheita**: comparar o `colheita.py` atual contra filtro global + filtro espacial local por índice de Moran; medir quanto do dado é removido e como a estrutura espacial muda | [H-12, só abstract]; [H-13, só abstract]; [H-14, só abstract]; [D-10, só abstract] | `reusa` + `novo_barato` | o pipeline de limpeza e a interpolação IDW já existem; o Moran local sai de `numpy`/`scipy` |
| 2 | **Escada de validação completa** — aleatório → GroupKFold por talhão → leave-one-field-out → leave-one-year-out → fazenda externa — reportando a métrica em **todos** os degraus | [C-11]; [C-14]; [C-02, só abstract]; [C-01]; [C-12]; [E-brasil-04]; [B-15, só abstract]; [D-12]; [B-04, só abstract] | `novo_barato` | `GroupKFold`/`LeaveOneGroupOut` do `scikit-learn`, que ainda não está nas libs pinadas mas é leve e CPU-only |
| 3 | **Dimensionar o bloco espacial pelo alcance de autocorrelação** via variograma, em vez de escolher tamanho arbitrário | [C-12]; [C-06]; [D-12] (autocorrelação residual ainda a 50 m) | `reusa` | `pykrige` já está na stack e já é usado em `interp.py` |
| 4 | **Baselines triviais obrigatórios**: média do talhão; mapa histórico de produtividade do próprio talhão; índice único no melhor estádio | [D-04]; [D-10, só abstract]; [B-01, só abstract] | `reusa` | histórico de mapas de colheita e catálogo de índices já existem |
| 5 | **Checklist de vazamento** aplicado ao pipeline de features (normalização antes do split, seleção de features fora da CV aninhada, features derivadas do alvo, imagens posteriores à data de previsão, coordenadas como feature) | [C-07, só abstract]; [C-01]; [A-03] | `reusa` | é disciplina de processo, sem custo |

### Bloco 2 — Modelos e features (o núcleo do MVP)

| # | O que testar | Suporte | Classe | Motivo da classe |
|---|---|---|---|---|
| 6 | **RF e GBM (XGBoost/LightGBM) sobre features tabulares por célula de 20 m** como família principal | [A-02, só abstract]; [A-11]; [A-09, só abstract]; [C-11]; [D-12]; [B-15, só abstract]; [E-brasil-04]; [A-05, só abstract] | `novo_barato` | `scikit-learn`/`xgboost`/`lightgbm` são CPU-only e leves; o perfil já sinaliza que podem entrar |
| 7 | **SVR e PLSR como comparadores diretos** — foram os modelos do estudo mais próximo do nosso caso | [B-12]; [H-03, só abstract] | `novo_barato` | ambos saem do `scikit-learn` |
| 8 | **Ablação bandas brutas vs. índices vs. bandas+índices**, por estádio fenológico | [B-10, só abstract]; [B-12]; [B-01, só abstract]; [B-09, só abstract]; [B-15, só abstract]; [G-08, só abstract] (colinearidade) | `reusa` | `msr.py` já entrega bandas e `indices.py` já entrega 12 índices |
| 9 | **Agregação temporal da série**: média/máximo/percentis por estádio e suavização da curva, contra imagem única no pico | [B-12]; [B-04, só abstract]; [A-10] | `reusa` | a série temporal por talhão já é gerada pelo robô noturno via STAC |
| 10 | **Grupo de features de relevo** (elevação, declividade, curvatura, TWI) | [D-12]; [B-09, só abstract]; [D-05]; [D-01, só abstract]; [D-02] | `reusa` | `mde.py` já existe |
| 11 | **Grupo de features de solo e CEa** (fertilidade krigada, CEa rasa/profunda) — com a ressalva de que solo e topografia **pioraram** o LOFO-CV em soja num estudo | [D-02]; [D-03]; [D-09, só abstract]; [D-11, só abstract]; [D-01, só abstract]; [C-11] (evidência contrária) | `reusa` | krigagem de fertilidade e CEa já estão em produção |
| 12 | **Teste de vazamento por interpolação**: mapa krigado como feature vs. amostras pontuais, avaliados sob CV aleatória **e** LOFO-CV | [C-07, só abstract]; [D-09, só abstract]; [C-01] (analogia); **[LACUNA] L7** | `reusa` | usa exatamente o que já existe |
| 13 | **Modelo por talhão vs. por fazenda vs. global**, mas avaliado com talhão retido (o que [B-12] não fez) | [B-12]; [B-04, só abstract] | `reusa` | — |
| 14 | **Curva de acurácia × antecedência** (RMSE/R² por data de previsão) sob LOFO-CV | [B-10, só abstract]; [B-05]; [B-06]; [B-12]; [B-03, só abstract]; **[LACUNA] L5** | `reusa` | — |
| 15 | **Clima agregado por talhão-safra em interação com relevo/solo** (GDD, chuva por fase, VPD), nunca como feature intra-talhão isolada | [D-05]; [D-12]; [D-08, só abstract]; [E-brasil-04]; [B-15, só abstract]; [H-10, só abstract]; [E-brasil-05] | `novo_barato` | não há ingestão de clima hoje; ERA5/NASA POWER/CHIRPS entrariam como valor por talhão-safra, sem grade fina |
| 16 | **Krigagem dos resíduos (regression-kriging)** — **fora da validação oficial LOFO**: (a) pós-colheita, para mapear o erro e completar talhão parcialmente colhido; (b) resíduo de **safras anteriores** como offset, avaliado sob **leave-one-year-out** | [H-04]; [C-10, só abstract]; a hipótese de estabilidade temporal em (b) esbarra em [D-04] (para soja, histórico é preditor pior do padrão que o NDVI) e [D-10, só abstract] | `reusa` | `pykrige` já está na stack; **inexistente no cold start** |

### Bloco 3 — Incerteza e explicabilidade (requisitos do produto)

| # | O que testar | Suporte | Classe | Motivo da classe |
|---|---|---|---|---|
| 17 | **QRF** para quantis condicionais | [G-02]; [G-14, só abstract]; [G-06, só abstract] | `novo_barato` | `quantile-forest` é CPU-only |
| 18 | **CQR / split conformal com calibração por vizinhança local**, não por reamostragem aleatória global de pixels | [G-01, só abstract]; [G-04, só abstract]; [G-03, só abstract] | `novo_barato` | `MAPIE` é CPU-only; a calibração local sai de `numpy`/`scipy` |
| 19 | **Verificação empírica de cobertura** do intervalo publicado (cobertura observada vs. nominal) | [G-13, só abstract] | `reusa` | é procedimento de avaliação |
| 20 | **Agregação correta da incerteza de células para o talhão** — sem somar variâncias como se as células fossem independentes | [G-04, só abstract] | `novo_barato` | — |
| 21 | **NGBoost como alternativa paramétrica**, com a ressalva de assumir família de distribuição | [G-05, só abstract] | `novo_barato` | `ngboost` é CPU-only |
| 22 | **TreeSHAP** + **mapa de SHAP por célula** | [G-07, só abstract]; [C-11]; [D-12]; [G-11, preprint, só abstract] | `novo_barato` | `shap` é CPU-only |
| 23 | **ALE no lugar de PDP**, dada a colinearidade dos índices | [G-08, só abstract]; [G-09, só abstract] | `novo_barato` | implementação leve |
| 24 | **Estabilidade da importância entre folds e entre modelos quase-ótimos** (conjunto de Rashomon) antes de comunicar qualquer fator ao agrônomo | [G-12]; [G-09, só abstract] | `novo_barato` | reamostragem de modelos já treinados |
| 25 | **AOA / índice de dissimilaridade** para marcar onde a predição está fora do domínio de treino, e **erro local** no mapa | [C-04, só abstract]; [C-05] | `novo_barato` | distâncias no espaço de features com `numpy`/`scipy` |
| 26 | **NNDM / kNNDM** como refinamento do esquema de validação, se o LOFO-CV se mostrar grosseiro demais | [C-08, só abstract]; [C-09] | `novo_barato` | algoritmo leve; o kNNDM reduziu o custo de 4,8 dias para 1,2 min em 4.000 pontos |

### Bloco 4 — Testar depois, e só se a evidência do bloco 2 justificar

| # | O que testar | Suporte | Classe | Motivo da classe |
|---|---|---|---|---|
| 27 | **GWR / GWRFR** (regressão geograficamente ponderada) | [C-13, só abstract]; [H-01, só abstract] | `novo_barato` | aproximável por RF ponderado por distância, CPU-only |
| 28 | **RFsp** (distâncias-buffer como features) — com a ressalva de que apenas empatou com krigagem e de que, com poucos pontos, a geoestatística pode ser superior | [C-10, só abstract] | `novo_barato` | — |
| 29 | **Índice TREI** (3 bandas red-edge do Sentinel-2) — não testado em soja, e a métrica original (CCC) não é comparável | [B-14, só abstract] | `novo_barato` | bastaria acrescentar um índice em `indices.py` |
| 30 | **Método de casamento polígono-pixel** entre polígonos de colheita e pixels de satélite | [B-07, só abstract] | `reusa` | `shapely` e `pykrige` já estão na stack |
| 31 | **Fusão SAR + óptico (Sentinel-1 + Sentinel-2)** para atravessar a nuvem da safra de verão | [B-13, só abstract]; [H-04]; **[LACUNA] L9** | `infra_nova` | não há ingestão SAR; exige pipeline de backscatter e tratamento de *speckle* |
| 32 | **Deep learning** (ViT, CNN-LSTM, LSTM, DNN) | [A-06]; [A-10]; [A-04]; [G-11, preprint, só abstract]; [H-06, só abstract] | `infra_nova` | PyTorch/TensorFlow e GPU são custo novo relevante; e nenhuma das três condições de vitória do DL (2.3 / 3.3) está presente no nosso regime |
| 33 | **Híbrido com crop model / abordagem tipo SCYM** (APSIM, DSSAT, WOFOST, assimilação de LAI) | [A-03] (com a ressalva do clima real do ano de teste); [B-11, só abstract]; [H-09, só abstract]; [B-04, só abstract] | `infra_nova` | nenhum crop model existe na stack; calibração para soja tropical é projeto à parte — mas é a única família que dispensa mapa de colheita para calibrar, o que a mantém no radar de médio prazo |
| 34 | **Fusão espectral PlanetScope + Sentinel-2 via rede neural** | [B-06] | `infra_nova` | e a produtividade foi o traço **mais fraco** entre os previstos nesse estudo |
| 35 | **Sensoriamento proximal / UAV multimodal com sensor térmico** | [H-03, só abstract]; [H-06, só abstract] | `infra_nova` | exige espectrorradiômetro ou UAV com câmera térmica, que a plataforma não tem |

### Ressalvas sobre esta priorização

- **Nada aqui é [RESULTADO].** Nenhum experimento próprio foi conduzido. A ordem reflete a razão
  entre evidência disponível e custo, não desempenho medido.
- **A priorização assume o regime declarado** (20–100 talhões-safra de soja, CPU-only, sem
  ingestão de clima). Se o número de talhões-safra crescer uma ordem de grandeza, os itens 32 e 33
  mudam de posição — é o que a própria base sugere ao mostrar DL vencendo com 142.952 amostras
  [A-04] ou 13–39 anos de série [A-10; A-07, só abstract].
- **Dois estudos potencialmente relevantes ficaram inacessíveis e não sustentam nada**: [H-05, só
  metadados] (algoritmo baseado em RF para interpolação espacial intensiva em mapas de
  produtividade) e [H-07, só metadados] (segundo o título: ML interpretativo para identificar causas
  da variabilidade de produtividade — cultura, método de atribuição e resolução de grade **não estão
  verificados**, todos `nd` no CSV). Ambos têm **título e DOI confirmados e conteúdo não lido**:
  nenhuma rota permitida devolveu abstract. Merecem nova tentativa com acesso institucional antes de o ADR ser
  fechado, porque tratam exatamente dos itens 28 e 22.

---

## 9. Referências

Todos os **87 estudos** da base são citados neste documento. Legenda das duas últimas colunas:

- **Tipo**: `revisado` (revisado por pares) · `preprint` · `tese` · `relatório` (inclui
  monografia, publicação técnica e proceedings).
- **Leitura**: `íntegra` (texto completo lido) · `abstract` (somente abstract verbatim) ·
  `metadados` (título/DOI confirmados, sem abstract acessível — **não sustenta afirmação alguma
  além de "existe"**).

### A — Classes de modelos

| id | Autores | Ano | Título | Periódico / Veículo | Tipo | Leitura |
|---|---|---|---|---|---|---|
| A-01 | van Klompenburg T, Kassahun A, Catal C | 2020 | [Crop yield prediction using machine learning: A systematic literature review](https://doi.org/10.1016/j.compag.2020.105709) | Computers and Electronics in Agriculture | revisado | abstract |
| A-02 | Grinsztajn L, Oyallon E, Varoquaux G | 2022 | [Why do tree-based models still outperform deep learning on tabular data?](https://doi.org/10.48550/arXiv.2207.08815) | NeurIPS 2022 Datasets and Benchmarks Track | revisado | abstract |
| A-03 | Shahhosseini M, Hu G, Huber I, Archontoulis SV | 2021 | [Coupling machine learning and crop modeling improves crop yield prediction in the US Corn Belt](https://doi.org/10.1038/s41598-020-80820-1) | Scientific Reports | revisado | íntegra |
| A-04 | Khaki S, Wang L | 2019 | [Crop Yield Prediction Using Deep Neural Networks](https://doi.org/10.3389/fpls.2019.00621) | Frontiers in Plant Science | revisado | íntegra |
| A-05 | Huber F, Yushchenko A, Stratmann B, Steinhage V | 2022 | [Extreme Gradient Boosting for Yield Estimation compared with Deep Learning Approaches](https://doi.org/10.1016/j.compag.2022.107346) | Computers and Electronics in Agriculture | revisado | abstract |
| A-06 | Bi L, Wally O, Hu G, Tenuta AU, Kandel YR, Mueller DS | 2023 | [A transformer-based approach for early prediction of soybean yield using time-series images](https://doi.org/10.3389/fpls.2023.1173036) | Frontiers in Plant Science | revisado | íntegra |
| A-07 | Fan J, Bai J, Li Z, Ortiz-Bobea A, Gomes CP | 2022 | [A GNN-RNN Approach for Harnessing Geospatial and Temporal Information: Application to Crop Yield Prediction](https://doi.org/10.1609/aaai.v36i11.21444) | AAAI-22 | revisado | abstract |
| A-08 | You J, Li X, Low M, Lobell D, Ermon S | 2017 | [Deep Gaussian Process for Crop Yield Prediction Based on Remote Sensing Data](https://doi.org/10.1609/aaai.v31i1.11172) | AAAI-17 | revisado | abstract |
| A-09 | Farmonov N, Amankulova K, Khan SN, Abdurakhimova M, Szatmari J, et al. | 2024 | [Effectiveness of machine learning and deep learning models at county-level soybean yield forecasting](https://doi.org/10.15201/hungeobull.72.4.4) | Hungarian Geographical Bulletin | revisado | abstract |
| A-10 | Sun J, Di L, Sun Z, Shen Y, Lai Z | 2019 | [County-Level Soybean Yield Prediction Using Deep CNN-LSTM Model](https://doi.org/10.3390/s19204363) | Sensors (MDPI) | revisado | íntegra |
| A-11 | Zinzinhedo ML, Mitchozounnou MF, Salako KV, Glele Kakai R | 2026 | [Sensitivity of machine learning regression models to data structure and quality in crop yield prediction](https://doi.org/10.1371/journal.pone.0353938) | PLOS ONE | revisado | íntegra |

### B — Sensoriamento remoto e dados de entrada

| id | Autores | Ano | Título | Periódico / Veículo | Tipo | Leitura |
|---|---|---|---|---|---|---|
| B-01 | Kayad A, et al. | 2019 | [Monitoring Within-Field Variability of Corn Yield using Sentinel-2 and Machine Learning Techniques](https://doi.org/10.3390/rs11232873) | Remote Sensing (MDPI) | revisado | abstract |
| B-02 | Hunt ML, Blackburn GA, Carrasco L, Redhead JW, Rowland CS | 2019 | [High resolution wheat yield mapping using Sentinel-2](https://doi.org/10.1016/j.rse.2019.111410) | Remote Sensing of Environment | revisado | abstract |
| B-03 | Schwalbert R, Amado T, Corassa G, Pott L, Vara Prasad PV, Ciampitti I | 2020 | [Satellite-based soybean yield forecast: Integrating machine learning and weather data for improving crop yield prediction in southern Brazil](https://doi.org/10.1016/j.agrformet.2019.107886) | Agricultural and Forest Meteorology | revisado | abstract |
| B-04 | Deines J, Patel R, Liang S, Dado WT, Lobell D | 2021 | [A million kernels of truth: Insights into scalable satellite maize yield mapping and yield gap analysis from an extensive ground dataset in the US Corn Belt](https://doi.org/10.1016/j.rse.2020.112174) | Remote Sensing of Environment | revisado | abstract |
| B-05 | Amankulova K, Farmonov N, Akramova P, Tursunov I, Mucsi L | 2023 | [Comparison of PlanetScope, Sentinel-2, and Landsat 8 data in soybean yield estimation within-field variability with random forest regression](https://doi.org/10.1016/j.heliyon.2023.e17432) | Heliyon | revisado | íntegra |
| B-06 | Sarkar S, Sagan V, Bhadra S, Fritschi FB | 2024 | [Spectral enhancement of PlanetScope using Sentinel-2 images to estimate soybean yield and seed composition](https://doi.org/10.1038/s41598-024-63650-3) | Scientific Reports | revisado | íntegra |
| B-07 | Pejak B, Lugonja P, Antic A, Panic MN, Pandzic M, et al. | 2022 | [Soya Yield Prediction on a Within-Field Scale Using Machine Learning Models Trained on Sentinel-2 and Soil Data](https://doi.org/10.3390/rs14092256) | Remote Sensing (MDPI) | revisado | abstract |
| B-08 | Skakun S, Kalecinski N, Brown MGL, Johnson DM, Vermote E, Roger J, Franch B | 2021 | [Assessing within-Field Corn and Soybean Yield Variability from WorldView-3, Planet, Sentinel-2, and Landsat 8 Satellite Imagery](https://doi.org/10.3390/rs13050872) | Remote Sensing (MDPI) | revisado | abstract |
| B-09 | Kross A, Znoj E, Callegari D, Kaur G, Sunohara M, Lapen D, McNairn H | 2020 | [Using Artificial Neural Networks and Remotely Sensed Data to Evaluate the Relative Importance of Variables for Prediction of Within-Field Corn and Soybean Yields](https://doi.org/10.3390/rs12142230) | Remote Sensing (MDPI) | revisado | abstract |
| B-10 | Joshi DR, Clay S, Sharma P, Rekabdarkolaee HM, Kharel TP, et al. | 2023 | [Artificial Intelligence and Satellite Based Remote Sensing can be used to Predict Soybean (Glycine max) Yield](https://doi.org/10.1002/agj2.21473) | Agronomy Journal | revisado | abstract |
| B-11 | Gaso D, de Wit AD, Berger A, Kooistra L | 2021 | [Predicting within-field soybean yield variability by coupling Sentinel-2 leaf area index with a crop growth model](https://doi.org/10.1016/j.agrformet.2021.108553) | Agricultural and Forest Meteorology | revisado | abstract |
| B-12 | Crusiol LGT, Sun L, Sibaldelli RNR, Felipe Junior V, Furlaneti WX, et al. (Embrapa Soja) | 2022 | [Strategies for monitoring within-field soybean yield using Sentinel-2 Vis-NIR-SWIR spectral bands and machine learning regression methods](https://doi.org/10.1007/s11119-022-09876-5) | Precision Agriculture | revisado | íntegra |
| B-13 | Amankulova K, Farmonov N, Omonov K, Abdurakhimova M, Mucsi L | 2024 | [Integrating the Sentinel-1, Sentinel-2 and topographic data into soybean yield modelling using machine learning](https://doi.org/10.1016/j.asr.2024.01.040) | Advances in Space Research | revisado | abstract |
| B-14 | Al-Shammari D, Whelan B, Wang C, Bramley R, Bishop TFA | 2025 (online 2024) | [Assessment of red-edge based vegetation indices for crop yield prediction at the field scale across large regions in Australia](https://doi.org/10.1016/j.eja.2024.127479) | European Journal of Agronomy | revisado | abstract |
| B-15 | Pereira EC, Santos GP, Chaves ME, Salgado GC, Poppiel R, et al. | 2026 | [Soybean yield estimation in the Brazilian Midwest using Sentinel-2 imagery](https://doi.org/10.1080/20964471.2026.2631900) | Big Earth Data | revisado | abstract |

### C — Validação espacial/temporal e vazamento

| id | Autores | Ano | Título | Periódico / Veículo | Tipo | Leitura |
|---|---|---|---|---|---|---|
| C-01 | Ploton P, et al. | 2020 | [Spatial validation reveals poor predictive performance of large-scale ecological mapping models](https://doi.org/10.1038/s41467-020-18321-y) | Nature Communications | revisado | íntegra |
| C-02 | Roberts DR, et al. | 2017 | [Cross-validation strategies for data with temporal, spatial, hierarchical, or phylogenetic structure](https://doi.org/10.1111/ecog.02881) | Ecography | revisado | abstract |
| C-03 | Wadoux AMJ-C, Heuvelink GBM, de Bruin S, Brus DJ | 2021 | [Spatial cross-validation is not the right way to evaluate map accuracy](https://doi.org/10.1016/j.ecolmodel.2021.109692) | Ecological Modelling | revisado | íntegra |
| C-04 | Meyer H, Pebesma E | 2021 | [Predicting into unknown space? Estimating the area of applicability of spatial prediction models](https://doi.org/10.1111/2041-210X.13650) | Methods in Ecology and Evolution | revisado | abstract |
| C-05 | Meyer H, Pebesma E | 2022 | [Machine learning-based global maps of ecological variables and the challenge of assessing them](https://doi.org/10.1038/s41467-022-29838-9) | Nature Communications | revisado | íntegra |
| C-06 | Valavi R, Elith J, Lahoz-Monfort JJ, Guillera-Arroita G | 2019 | [blockCV: An R package for generating spatially or environmentally separated folds for k-fold cross-validation of species distribution models](https://doi.org/10.1111/2041-210X.13107) | Methods in Ecology and Evolution | revisado | íntegra |
| C-07 | Kapoor S, Narayanan A | 2023 | [Leakage and the reproducibility crisis in machine-learning-based science](https://doi.org/10.1016/j.patter.2023.100804) | Patterns | revisado | abstract |
| C-08 | Milà C, Mateu J, Pebesma E, Meyer H | 2022 | [Nearest neighbour distance matching Leave-One-Out Cross-Validation for map validation](https://doi.org/10.1111/2041-210X.13851) | Methods in Ecology and Evolution | revisado | abstract |
| C-09 | Linnenbrink J, Milà C, Ludwig M, Meyer H | 2024 | [kNNDM CV: k-fold nearest-neighbour distance matching cross-validation for map accuracy estimation](https://doi.org/10.5194/gmd-17-5897-2024) | Geoscientific Model Development | revisado | íntegra |
| C-10 | Hengl T, Nussbaum M, Wright MN, Heuvelink GBM, Gräler B | 2018 | [Random forest as a generic framework for predictive modeling of spatial and spatio-temporal variables](https://doi.org/10.7717/peerj.5518) | PeerJ | revisado | abstract |
| C-11 | Rathore N, Joshi DR, Dadkhah K, Rizzo DM, Walsh O, Clay D, Gardezi M | 2026 | [On-farm soybean yield estimation using earth observation data and machine learning models](https://doi.org/10.3389/fagro.2026.1923239) | Frontiers in Agronomy | revisado | íntegra |
| C-12 | Stock A | 2025 | [Choosing blocks for spatial cross-validation: lessons from a marine remote sensing case study](https://doi.org/10.3389/frsen.2025.1531097) | Frontiers in Remote Sensing | revisado | íntegra |
| C-13 | Khan SN, Li D, Maimaitijiang M | 2022 | [A Geographically Weighted Random Forest Approach to Predict Corn Yield in the US Corn Belt](https://doi.org/10.3390/rs14122843) | Remote Sensing (MDPI) | revisado | abstract |
| C-14 | Habibi LN, Matsui T, Tanaka TST | 2023 | [The effects of cross-validation approaches on the model transferability of a soybean yield prediction model using UAV-based remote sensing](https://jassnet.org/hiroshima2023/PDF/A04-Luthfan%20Nur%20Habibi.pdf) | Anais JASS Hiroshima 2023 (proceedings) — sem DOI | relatório | íntegra |

### D — Preditores de solo, CEa, relevo, clima e manejo

| id | Autores | Ano | Título | Periódico / Veículo | Tipo | Leitura |
|---|---|---|---|---|---|---|
| D-01 | Kravchenko AN, Bullock DG | 2000 | [Correlation of Corn and Soybean Grain Yield with Topography and Soil Properties](https://doi.org/10.2134/agronj2000.92175x) | Agronomy Journal | revisado | abstract |
| D-02 | Kitchen NR, Drummond ST, Lund ED, Sudduth KA, Buchleiter GW | 2003 | [Soil Electrical Conductivity and Topography Related to Yield for Three Contrasting Soil-Crop Systems](https://doi.org/10.2134/agronj2003.4830) | Agronomy Journal | revisado | íntegra |
| D-03 | Corwin DL, Lesch SM | 2005 | [Apparent soil electrical conductivity measurements in agriculture](https://doi.org/10.1016/j.compag.2004.10.005) | Computers and Electronics in Agriculture | revisado | íntegra |
| D-04 | Maestrini B, Basso B | 2018 | [Predicting spatial patterns of within-field crop yield variability](https://doi.org/10.1016/j.fcr.2018.01.028) | Field Crops Research | revisado | íntegra |
| D-05 | Maestrini B, Basso B | 2018 | [Drivers of within-field spatial and temporal variability of crop yield across the US Midwest](https://doi.org/10.1038/s41598-018-32779-3) | Scientific Reports | revisado | íntegra |
| D-06 | Khanal S, Fulton J, Klopfenstein A, Douridas N, Shearer S | 2018 | [Integration of high resolution remotely sensed data and machine learning techniques for spatial prediction of soil properties and corn yield](https://doi.org/10.1016/j.compag.2018.07.016) | Computers and Electronics in Agriculture | revisado | abstract |
| D-07 | Smidt ER, Conley SP, Zhu J, Arriaga FJ | 2016 | [Identifying Field Attributes that Predict Soybean Yield Using Random Forest Analysis](https://doi.org/10.2134/agronj2015.0222) | Agronomy Journal | revisado | abstract |
| D-08 | Tagliapietra EL, Zanon AJ, Streck NA, Balest D, da Rosa SL, et al. | 2021 | [Biophysical and management factors causing yield gap in soybean in the subtropics of Brazil](https://doi.org/10.1002/agj2.20586) | Agronomy Journal | revisado | abstract |
| D-09 | Adhikari K, Smith DR, Collins H, Hajda C, Acharya BS, Owens PR | 2022 | [Mapping Within-Field Soil Health Variations Using Apparent Electrical Conductivity, Topography, and Machine Learning](https://doi.org/10.3390/agronomy12051019) | Agronomy (MDPI) | revisado | abstract |
| D-10 | Maestrini B, Basso B | 2021 | [Subfield crop yields and temporal stability in thousands of US Midwest fields](https://doi.org/10.1007/s11119-021-09810-1) | Precision Agriculture | revisado | abstract |
| D-11 | Oliveira FA, Franchini JC, Debiasi H | 2011 | [Variabilidade espacial da produtividade da soja e da condutividade elétrica de um Latossolo Bruno](https://www.embrapa.br/en/busca-de-publicacoes/-/publicacao/908829/variabilidade-espacial-da-produtividade-da-soja-e-da-condutividade-eletrica-de-um-latossolo-bruno) | Embrapa Soja (publicação técnica) — sem DOI | relatório | abstract |
| D-12 | Smith HW, Heffernan CJ, Ashworth AJ, Nalley LL, Bullock DS, Tullis J, Owens PR | 2026 | [Harvesting insights: interpretable machine learning to understand environmental drivers of U.S. maize and soybean yield](https://doi.org/10.1038/s41598-026-38724-z) | Scientific Reports | revisado | íntegra |

### E — Estudos brasileiros

| id | Autores | Ano | Título | Periódico / Veículo | Tipo | Leitura |
|---|---|---|---|---|---|---|
| E-brasil-01 | Berka LMS, Rudorff BFT, Shimabukuro YE | 2003 | [Soybean yield estimation by an agrometeorological model in a GIS](https://doi.org/10.1590/s0103-90162003000300003) | Scientia Agricola | revisado | íntegra |
| E-brasil-02 | Schwalbert RA | 2019 | [Imagens de satélite para predição espaço-temporal da produtividade de milho e soja em diferentes escalas geográficas](https://repositorio.ufsm.br/handle/1/19493) | Tese de Doutorado — UFSM — sem DOI | tese | abstract |
| E-brasil-03 | Wendling A | 2014 | [Sensoriamento remoto para identificação das causas da variabilidade no índice de massa da soja](https://repositorio.ufsm.br/handle/1/3621) | Tese de Doutorado — UFSM — sem DOI | tese | abstract |
| E-brasil-04 | Mohite JD, Sawant SA, Pandit A, Agrawal R, Pappula S | 2023 | [Soybean crop yield prediction by integration of remote sensing and weather observations](https://doi.org/10.5194/isprs-archives-XLVIII-M-1-2023-197-2023) | ISPRS Archives XLVIII-M-1-2023 (ISRSE-39) | revisado | íntegra |
| E-brasil-05 | Pessina ALR | 2024 | [Aprendizado de máquina para predição da produtividade mesorregional de soja utilizando dados públicos de estações meteorológicas no Brasil](https://bdta.abcd.usp.br/directbitstream/1d67e4f3-507e-4854-9f1a-f22f0d3a8192/Andre_Leal_Raymundo_Pessina.pdf) | Monografia MBA IA e Big Data — ICMC-USP — sem DOI | relatório | íntegra |
| E-brasil-07 | Barbosa dos Santos V, dos Santos AF, da Silva Cabral de Moraes JR, de Oliveira Vieira IC, de Souza Rolim G | 2021 | [Machine learning algorithms for soybean yield forecasting in the Brazilian Cerrado](https://doi.org/10.1002/jsfa.11713) | Journal of the Science of Food and Agriculture | revisado | abstract |
| E-brasil-08 | Amaral LR, Oldoni H, Baptista GMM, Ferreira GHS, Freitas RG, Martins CL, Cunha IA, Santos AF | 2024 | [Remote sensing imagery to predict soybean yield: a case study of vegetation indices contribution](https://doi.org/10.1007/s11119-024-10174-5) | Precision Agriculture | revisado | metadados |
| E-brasil-09 | Freitas RG, Oldoni H, Joaquim LF, Pozzuto JVF, Amaral LR | 2024 | [Predicting on-farm soybean yield variability using texture measures on Sentinel-2 image](https://doi.org/10.1007/s11119-024-10176-3) | Precision Agriculture | revisado | metadados |
| E-brasil-10 | Song XP, Li H, Potapov P, Hansen MC | 2022 | [Annual 30 m soybean yield mapping in Brazil using long-term satellite observations, climate data and machine learning](https://doi.org/10.1016/j.agrformet.2022.109186) | Agricultural and Forest Meteorology | revisado | metadados |

### G — Incerteza e explicabilidade (XAI)

| id | Autores | Ano | Título | Periódico / Veículo | Tipo | Leitura |
|---|---|---|---|---|---|---|
| G-01 | Romano Y, Patterson E, Candès E | 2019 | [Conformalized Quantile Regression](https://proceedings.neurips.cc/paper/2019/hash/5103c3584b063c431bd1268e9b5e76fb-Abstract.html) | NeurIPS 2019 — sem DOI | revisado | abstract |
| G-02 | Meinshausen N | 2006 | [Quantile Regression Forests](https://jmlr.org/papers/v7/meinshausen06a.html) | Journal of Machine Learning Research v7, p983-999 — sem DOI | revisado | íntegra |
| G-03 | Angelopoulos AN, Bates S | 2023 | [Conformal Prediction: A Gentle Introduction](https://doi.org/10.1561/2200000101) | Foundations and Trends in Machine Learning v16 n4 (monografia publicada; o preprint arXiv de 2021 tem título diferente) | revisado | abstract |
| G-04 | Mao H, Martin R, Reich B | 2024 | [Valid Model-Free Spatial Prediction](https://doi.org/10.1080/01621459.2022.2147531) | Journal of the American Statistical Association v119 n546, p904-914 | revisado | abstract |
| G-05 | Duan T, Avati A, Ding DY, Thai KK, Basu S, Ng A, Schuler A | 2020 | [NGBoost: Natural Gradient Boosting for Probabilistic Prediction](https://proceedings.mlr.press/v119/duan20a.html) | ICML 2020, PMLR v119, p2690-2700 — sem DOI | revisado | abstract |
| G-06 | Gyamerah SA, Ngare P, Ikpe D | 2020 | [Probabilistic forecasting of crop yields via quantile random forest and Epanechnikov Kernel function](https://doi.org/10.1016/j.agrformet.2019.107808) | Agricultural and Forest Meteorology v280 | revisado | abstract |
| G-07 | Lundberg SM, Erion G, Chen H, DeGrave A, Prutkin JM, Nair B, Katz R, Himmelfarb J, Bansal N, Lee S-I | 2020 | [From local explanations to global understanding with explainable AI for trees](https://doi.org/10.1038/s42256-019-0138-9) | Nature Machine Intelligence v2, p56-67 | revisado | abstract |
| G-08 | Apley DW, Zhu J | 2020 | [Visualizing the Effects of Predictor Variables in Black Box Supervised Learning Models](https://doi.org/10.1111/rssb.12377) | Journal of the Royal Statistical Society Series B v82 n4, p1059-1086 | revisado | abstract |
| G-09 | Molnar C, König G, Herbinger J, Freiesleben T, Dandl S, Scholbeck CA, Casalicchio G, Grosse-Wentrup M, Bischl B | 2022 | [General Pitfalls of Model-Agnostic Interpretation Methods for Machine Learning Models](https://doi.org/10.1007/978-3-031-04083-2_4) | xxAI — Beyond Explainable AI, LNCS/LNAI v13200, Springer, p39-68 | revisado | abstract |
| G-11 | Najjar H, Miranda M, Nuske M, Roscher R, Dengel A | 2024 | [Explainability of Sub-Field Level Crop Yield Prediction using Remote Sensing](https://arxiv.org/abs/2407.08274) | arXiv (versão revisada por pares não localizada) — sem DOI | preprint | abstract |
| G-12 | Fisher A, Rudin C, Dominici F | 2019 | [All Models are Wrong, but Many are Useful: Learning a Variable's Importance by Studying an Entire Class of Prediction Models Simultaneously](https://jmlr.org/papers/v20/18-760.html) | Journal of Machine Learning Research v20 n177, p1-81 — sem DOI | revisado | íntegra |
| G-13 | Ma Y, Zhang Z, Kang Y, Ozdogan M | 2021 | [Corn yield prediction and uncertainty analysis based on remotely sensed variables using a Bayesian neural network approach](https://doi.org/10.1016/j.rse.2021.112408) | Remote Sensing of Environment v259 | revisado | abstract |
| G-14 | Xiong T, Xia M, Li G, Li J, Xia W | 2025 | [Beyond point forecasting: Probability density forecasting of corn yield based on quantile regression forest](https://doi.org/10.22434/ifamr1134) | International Food and Agribusiness Management Review v28 n2 | revisado | abstract |

### H — Lacunas, pós-processamento e casos limítrofes

| id | Autores | Ano | Título | Periódico / Veículo | Tipo | Leitura |
|---|---|---|---|---|---|---|
| H-01 | Haghighattalab A, Crain J, Mondal S, Rutkoski J, Singh RP, Poland J | 2017 | [Application of Geographically Weighted Regression to Improve Grain Yield Prediction from Unmanned Aerial System Imagery](https://doi.org/10.2135/cropsci2016.12.1016) | Crop Science | revisado | abstract |
| H-03 | Crusiol LGT, Nanni MR, Furlanetto RH, Sibaldelli RNR, Cezar E, Sun L, Foloni JSS, Mertz-Henning LM, Nepomuceno AL, Neumaier N, Farias JRB | 2021 | [Yield Prediction in Soybean Crop Grown under Different Levels of Water Availability Using Reflectance Spectroscopy and Partial Least Squares Regression](https://doi.org/10.3390/rs13050977) | Remote Sensing (MDPI) | revisado | abstract |
| H-04 | Saravanakumar R, Jain R, Singh VK, Bharadwaj A, Sehgal VK, Biswas A, Arora A, Krishna H | 2026 | [Hybridizing deep learning algorithms and geostatistical approaches for improved crop yield disaggregation](https://doi.org/10.1371/journal.pone.0344081) | PLOS ONE | revisado | íntegra |
| H-05 | Córdoba M, Balzarini M | 2021 | [A random forest-based algorithm for data-intensive spatial interpolation in crop yield mapping](https://doi.org/10.1016/j.compag.2021.106094) | Computers and Electronics in Agriculture | revisado | metadados |
| H-06 | Maimaitijiang M, Sagan V, Sidike P, Hartling S, Esposito F, Fritschi FB | 2020 | [Soybean yield prediction from UAV using multimodal data fusion and deep learning](https://doi.org/10.1016/j.rse.2019.111599) | Remote Sensing of Environment | revisado | abstract |
| H-07 | Jones EJ, Bishop TFA, Malone BP, Hulme PJ, Whelan BM, Filippi P | 2022 | [Identifying causes of crop yield variability with interpretive machine learning](https://doi.org/10.1016/j.compag.2021.106632) | Computers and Electronics in Agriculture | revisado | metadados |
| H-08 | Leroux C, Tisseyre B | 2018 (online) / 2019 (fascículo) | [How to measure and report within-field variability: a review of common indicators and their sensitivity](https://doi.org/10.1007/s11119-018-9598-x) | Precision Agriculture | revisado | abstract |
| H-09 | Lobell DB, Thau D, Seifert C, Engle E, Little B | 2015 | [A scalable satellite-based crop yield mapper](https://doi.org/10.1016/j.rse.2015.04.021) | Remote Sensing of Environment | revisado | abstract |
| H-10 | Barbosa dos Santos V, dos Santos AMF, Rolim GS | 2021 | [Estimation and forecasting of soybean yield using artificial neural networks](https://doi.org/10.1002/agj2.20729) | Agronomy Journal | revisado | abstract |
| H-11 | von Bloh M, de Souza Noia Junior R, Wangerpohl X, Saltik AO, Haller V, Kaiser L, Asseng S | 2023 | [Machine learning for soybean yield forecasting in Brazil](https://doi.org/10.1016/j.agrformet.2023.109670) | Agricultural and Forest Meteorology | revisado | metadados |
| H-12 | Sudduth KA, Drummond ST | 2007 | [Yield Editor: Software for Removing Errors from Crop Yield Maps](https://doi.org/10.2134/agronj2006.0326) | Agronomy Journal | revisado | abstract |
| H-13 | Vega A, Córdoba M, Castro-Franco M, Balzarini M | 2019 | [Protocol for automating error removal from yield maps](https://doi.org/10.1007/s11119-018-09632-8) | Precision Agriculture | revisado | abstract |
| H-14 | Lyle G, Bryan BA, Ostendorf B | 2013 (online) / 2014 (fascículo) | [Post-processing methods to eliminate erroneous grain yield measurements: review and directions for future development](https://doi.org/10.1007/s11119-013-9336-3) | Precision Agriculture | revisado | abstract |

### Nota sobre ids descontinuados

Quatro `paper_id` usados pelos briefs de eixo **não existem** na base final e **não devem ser
citados**: `C-15` e `G-10` (ambos = **A-03**), `E-brasil-11` (= **B-03**), `E-brasil-06`
(= **B-12**) e `H-02` (= **C-13**).

### Documentos irmãos desta Fase 1

- `yield-prediction/docs/literature-review/matriz-comparativa.md` — matriz comparativa dos ~30
  estudos mais relevantes, ordenada por rigor de validação (seção 9 do pedido).
- `yield-prediction/docs/literature-review/papers-database.csv` / `.md` — base completa dos 87
  estudos com os 39 campos da seção 53 do pedido.
- `yield-prediction/docs/benchmarks/commercial.md` — 32 soluções comerciais/operacionais,
  separando alegação comercial de validação.
- `yield-prediction/docs/data-sources/fontes-de-dados.md` — 32 fontes de dados (sensores, clima,
  relevo, solo) com resolução, licença, latência e cobertura Brasil.
- Trilha local de auditoria, **não versionada** (texto bruto de terceiros) — registro completo da verificação de DOIs,
  URLs, deduplicação e auditoria de métricas.






