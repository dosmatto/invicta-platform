# Verificação de citações — base unificada (Fase 1)

## O que passou
- 92 linhas lidas dos 7 CSVs de eixo (A,B,C,D,E,G,H), todas com 39 colunas válidas — 0 erros estruturais.
- 77 DOIs únicos consultados de forma independente (Crossref; 1 via DataCite pois Crossref
  devolveu 404 — A-02, arXiv): **77/77 resolvidos, 0 não-encontrado**.
- Título (difflib), ano (±1) e primeiro autor comparados para os 77: **76 ok direto**, 1 corrigido (G-03, ver abaixo).
- 10 linhas sem DOI: as 10 URLs responderam HTTP 200 (nenhum link quebrado, nenhum 403).
- Atenção redobrada a estudos 2025–2026 (A-11 Zinzinhedo/PLOS One 2026; B-14 Al-Shammari 2025;
  B-15 2026; C-11 Rathore/Frontiers Agronomy 2026; C-12 Stock/Frontiers Remote Sensing 2025;
  D-12 Smith/Sci Rep 2026; G-14 2025; H-04 Saravanakumar/PLOS One 2026): todos confirmados no
  Crossref como **journal-article** publicado (não preprint/posted-content), container-title bate
  com o `venue` do CSV.
- Auditoria literal de métricas (R²/RMSE/MAE contra `fontes/`): 37 linhas com métrica numérica,
  **37/37 confirmadas** (4 exigiram checagem manual por diferença de notação — ver abaixo); 50
  linhas sem métrica numérica (`sem_metrica`, prosa/nd) — nada inventado.
- 3 linhas obtidas por rota não permitida (proxy) antes da regra do chair — **B-13, B-14, C-13** —
  re-confirmadas com abstract reconstruído via OpenAlex (API aberta, sem proxy): números batem
  100% com o que estava no CSV. Nenhuma métrica precisou ser apagada.

## Deduplicação (4 grupos por DOI; 92 → 87 linhas)
1. **10.1038/s41598-020-80820-1** (Shahhosseini et al. 2021) — A-03, C-15, G-10 → mantido **A-03**
   (primeiro eixo). Todas completo; divergências são de **ênfase**, não conflito: A-03/C-15 citam
   RRMSE% (6–7%), G-10 cita RMSE absoluto (883–1094 kg/ha em 2018) — mesmo estudo, métricas
   complementares, ambas registradas em `verif_obs`.
2. **10.1016/j.agrformet.2019.107886** (Schwalbert et al. 2020) — B-03, E-brasil-11 → mantido **B-03**.
   MAE 0,24–0,42 Mg/ha é uma **faixa por antecedência de previsão (DOY)**, não divergência entre
   fontes; E-brasil-11 tinha interpretado erroneamente como tese-vs-artigo — corrigido em `verif_obs`.
3. **10.1007/s11119-022-09876-5** (Crusiol et al. 2022) — B-12, E-brasil-06 → **paper_id=B-12**
   (primeiro eixo), mas **conteúdo trazido de E-brasil-06** (full_text_read=completo, com R²/RMSE
   numéricos) por ser mais completo que o B-12 original (abstract, sem números). Nenhuma divergência
   factual, só complementaridade.
4. **10.3390/rs14122843** (Khan et al. 2022) — C-13, H-02 → mantido **C-13**. Mesmos valores
   (R²=0,90; RMSE=0,764), unidade escrita como MT/ha vs t/ha (equivalente).

## Correções aplicadas na base unificada
- **G-03** (Angelopoulos & Bates): CSV usava título/ano/peer_reviewed do **preprint arXiv 2021**
  ("A Gentle Introduction to Conformal Prediction…") mas o DOI registrado (10.1561/2200000101) é da
  **monografia publicada em 2023** em *Foundations and Trends in Machine Learning* ("Conformal
  Prediction: A Gentle Introduction"), confirmado via Crossref (`type=journal-article`). Corrigido
  título/ano/peer_reviewed para a versão publicada; título do preprint preservado em `notes`.
- **D-11** (Embrapa Soja): `peer_reviewed="nao"` não é categoria válida (sim/preprint/tese/
  relatorio/comercial) — reclassificado como `relatorio`.
- 20 células `val_random`/`val_spatial`/`val_field_out`/`val_year_out`/`val_external` continham
  `"sim (explicação)"` ou `"nao (explicação)"` em vez do valor atômico exigido pelo SPEC — normalizadas
  para `sim`/`nao`/`nd`, explicação preservada em `notes`.
- 7 linhas com `full_text_read="sim"` (valor inválido — categoria correta é completo/abstract/
  so_metadados): **B-05, B-06, D-02, D-03, D-04, D-05, D-12** corrigidas para `completo`, com base nas
  próprias `notes` do pesquisador (leitura via PDF/pdftotext, fonte institucional/Open Access direta,
  conteúdo com detalhe além do abstract).
- Sanitização: `verif_obs` é o único campo que continha `;` (dos registros de divergência de fusão);
  todos os `;` internos foram trocados por `,` para respeitar a regra "sem `;` dentro de campo"
  (39+5=44 colunas confirmadas em 100% das 87 linhas).

## Notação de métrica — checado manualmente, mesmo valor, símbolo/formato diferente (não é erro)
- **B-01**: fonte diz "R² of almost 0.6"; CSV registrou "0.60" (arredondamento).
- **B-06**: fonte diz "R²≈0–0.35"; CSV registrou "0.0-0.35" (mesmo valor).
- **C-09**: fonte diz "W explicou 28% da variação do RMSE" (não rotulado literalmente "R²" na escala
  continental); CSV interpretou como R²=0,28 — equivalência conceitual do próprio pesquisador do eixo C.
- **D-01**: fonte usa percentual ("explained about 30%/20%"); CSV converteu para fração 0.30/0.20.

## Flags heurísticos revisados e descartados (não são erro)
6 casos em que o texto de `validation` não citava literalmente "aleatório/k-fold" mas `val_random=sim`
(A-11, B-02, B-05, B-15, H-03) ou vice-versa (C-05): inspecionados manualmente — A-11/B-05/B-15 usam
"split" sem nomear "aleatório" (mesma coisa); C-05 é um estudo **sobre** crítica a CV aleatória, não usa
o método ele mesmo. Nenhuma correção necessária.

## O que os redatores NÃO podem usar
1. **G-03**: não citar o título/ano do preprint 2021 — o DOI aponta para a versão de 2023.
2. **B-14** (TREI): CCC (Concordance Correlation Coefficient) **não é R²/RMSE** — não comparar
   diretamente com outros estudos da tabela.
3. **A-03/C-15/G-10** (Shahhosseini): não existe um único R² "oficial" do estudo — é RRMSE% (6–7%) em
   contexto county-level EUA, com ano de seca extrema (2012) como pior caso; não é intra-talhão Brasil.
4. **C-13/H-02** (Khan GWRFR): R²=0,90 é em **escala de município/condado (EUA)**, não intra-talhão;
   abstract apenas, sem detalhe de esquema de validação (`validation=nd`).
5. **D-01**: 30%/20% de variância explicada são **médias** com variação de 5–71% e 6–54% por campo —
   não apresentar como número único estável.
6. **B-03/E-brasil-11** (Schwalbert): MAE varia de 0,24 a 0,42 t/ha conforme a antecedência da previsão
   (DOY) — nunca citar um único MAE sem informar a data/DOY.
7. Todas as **50 linhas `verif_metricas=sem_metrica`**: não têm R²/RMSE/MAE numérico verificável — não
   inventar valor para preencher tabela comparativa.
8. **D-11, tese/relatório** (E-brasil-02/03, C-14, D-11): sem DOI e sem revisão por pares formal —
   tratar como evidência de menor confiança (`peer_reviewed` ≠ sim).

## Caminhos

**Versionado neste repositório** (é o que qualquer leitor da branch encontra):
- [`papers-database.csv`](./papers-database.csv) e [`papers-database.md`](./papers-database.md) — a base de 87 estudos, fonte única de evidência.
- Este documento — resumo da verificação.

**Trilha local de auditoria, não versionada.** O material bruto da pesquisa (abstracts verbatim e
páginas de terceiros copiadas por eixo, mais o registro longo da unificação) **não foi versionado
de propósito**: é texto de terceiros, sujeito a direito autoral, e não pode ser redistribuído junto
do repositório. Ele existe apenas na máquina em que a Fase 1 foi executada. Onde um documento desta
fase cita "a fonte verbatim", é a essa trilha que se refere — e o que dela importa para o leitor
está transcrito aqui, no CSV e nos documentos versionados.

---

## Adendo — Correções pós-verificação (aplicadas após o relatório de verificação independente)

O corpo deste documento reflete a verificação feita durante a unificação da base. A revisão
independente posterior encontrou itens que o desatualizaram ou que exigiram correção na base e nos
documentos. Ficam registrados aqui:

| # | O que estava | O que passou a valer | Onde |
|---|---|---|---|
| C-01 | `[C-09]`: "R² 0,28 mantido por equivalência conceitual, nenhuma correção necessária" (§"Notação de métrica") | **O R² de `[C-09]` foi REMOVIDO da base.** 28% é a fração da variação do **RMSE** explicada pela estatística de Wasserstein `W`, não R² de predição. A coluna `r2` de C-09 está vazia no CSV, e nenhum documento cita esse número | `papers-database.csv`; `README.md`; `estado-da-arte.md` |
| C-02 | `[C-11]`: faixa de RMSE registrada como "574–765 kg/ha" | **554–765 kg/ha.** 574 é o RMSE de um talhão-safra específico (Edmunds/2021), não o mínimo da faixa | base e todos os documentos |
| C-03 | `[A-03]` descrito como "Leave-One-Year-Out" em três documentos | **"CV 10-fold aleatória + anos de teste retidos (2012, 2017, 2018)"** — é a formulação do CSV e da fonte; "leave-one-year-out CV" vinha do id descontinuado C-15 | `README.md`, `matriz-comparativa.md`, `estado-da-arte.md` |
| C-04 | `[B-01]` classificado como "split aleatório" | **"*hold-out* de metade das observações do mesmo talhão/safra, esquema de sorteio não declarado"** — o abstract diz apenas *"independent validation set of half of the total observations"* | `papers-database.csv` (coluna `validation`), `estado-da-arte.md`, `README.md` |
| C-05 | `[G-04]` e `[G-11]` com `val_field_out=sim` | **`nd`.** O próprio campo `validation` dessas duas linhas diz "não especificado no abstract" — marcar talhão-fora era contradição interna. A contagem de estudos com validação talhão-fora **ou** ano-fora cai de **13 para 11** | `papers-database.csv`, `estado-da-arte.md`, `README.md` |
| C-06 | "Doze estudos da base têm `validation = nd`" | **28 estudos**, recontados por script sobre o CSV. A lista de doze dada no texto estava errada nos dois sentidos | `estado-da-arte.md`, `README.md` |
| C-07 | `[G-13]`: "cobertura de 84%" / "apenas 84%" | **"≥84% para nominal de 95%"**. O abstract diz *"more than 84%"* — compatível com 84,1% e com 94%. A conclusão (cobertura abaixo do nominal) permanece; a magnitude do desvio, não | 14 ocorrências em 5 documentos |
| C-08 | `[B-08]`: "os autores atribuem diretamente à saturação" | **"o que os autores *sugerem* ser saturação"** (*"suggesting saturation"*), com rótulo `[EVIDÊNCIA LIMITADA]` | `estado-da-arte.md` |
| C-09 | `[B-12]` classificado como "validação externa" (V3) | **V5 — *hold-out* 75/25 no mesmo conjunto de 15 talhões, 1 safra, rotulado pelos autores como "validação externa"**. Não há talhão-fora nem safra-fora; o CSV já registrava `val_random=sim`, `val_field_out=nao` | `matriz-comparativa.md`, `estado-da-arte.md`, `README.md` |
| C-10 | README: "RMSE de 7,24 a 51,76 kg/ha" de `[B-12]` | **7,24–37,32 kg/ha (SVR *field-based*) e 38,82 kg/ha (SVR global)**; 51,76 é o RMSE do **PLSR** global, outro modelo | `README.md` |
| C-11 | Faixa de aceite 5%–60% de remoção "ancorada" em `[H-13]`/`[H-12]` | **`[HIPÓTESE]` deste projeto**, escolhida com folga em torno de ~30% `[H-13]` e 10–50% `[H-12]` — 5% e 60% não vêm de nenhuma fonte | `README.md`, `riscos-metodologicos.md` |
| C-12 | "Nenhuma das 32 soluções menciona XAI" | **"Nenhuma solução *privada* menciona SHAP/XAI"** — o JRC MARS/WOFOST é estruturalmente explicável. *(A contagem de `explicabilidade` citada nesta linha estava errada; corrigida em C-19.)* | `README.md`, `ADR-001`, `estado-da-arte.md` |
| C-13 | `commercial.md`: "ver também `fontes-de-dados.md`, D-08" | **FD-08.** `D-08` é um paper da base (Tagliapietra et al.); a fonte de dados PlanetScope é `FD-08` | `commercial.md` |
| C-14 | `fontes-de-dados.md`: "`mde.py` já usa DEM (equivalente a FD-20/SRTM); trocar por NASADEM é upgrade *drop-in*" | O modo `auto` de `mde.py` usa **`cop30 → srtm`**, isto é, **Copernicus DEM GLO-30 (`FD-21`) como primário**, e rotula a própria fonte de fallback como "NASADEM/SRTM (30 m)". A recomendação foi reduzida a "avaliar o produto NASADEM oficial no lugar dos tiles skadi, como fallback" | `fontes-de-dados.md`, `recomendacoes-arquitetura.md` |
| C-15 | "Memória de 512 MB" como restrição vigente | **Limite do plano anterior.** `render.yaml` declara `plan: standard`; o teto de 400 células/lado foi calibrado na época dos 512 MB e não foi reavaliado após a migração | `recomendacoes-arquitetura.md`, `README.md` |
| C-16 | `[CONSENSO]` sobre afirmações com um único estudo | Rebaixadas para `[RESULTADO ESPECÍFICO]` ou `[EVIDÊNCIA LIMITADA]`. `[CONSENSO]` passa a exigir **≥2 estudos independentes citados no mesmo parágrafo** | `estado-da-arte.md`, `riscos-metodologicos.md`, `commercial.md`, `ADR-001` |
| C-17 | ADR D9: MVP = "global + krigagem dos resíduos por talhão `[H-04]`" | Retirado do núcleo da arquitetura. Em `[H-04]` o agregado é **observado** (desagregação de estatística de vilarejo); em previsão pré-colheita de talhão não visto o resíduo não existe, e usá-lo sob LOFO seria vazamento pelo alvo. Reposicionado como `[HIPÓTESE]` em dois usos restritos (pós-colheita; resíduo persistente de safras anteriores sob LOYO) | `ADR-001`, `recomendacoes-arquitetura.md`, `README.md`, `modelos.md`, `estado-da-arte.md`, `riscos-metodologicos.md` |

### Segunda rodada de verificação independente

| # | O que estava | O que passou a valer | Onde |
|---|---|---|---|
| C-18 | "Outros **11** estudos registram `validation` em texto livre" → 39 dos 87 (45%) sem esquema declarado | **12 estudos**, e **40 dos 87 (46%)**. `G-05` (`validation = "nao especificada no abstract"`) pertence literalmente à categoria e estava fora da lista nominal. Recontado por script sobre o CSV. `[B-01]` ("esquema de sorteio não declarado") permanece **fora** da contagem, classificado entre os *splits* de observações do mesmo talhão, com a ressalva explícita na célula | `README.md`, `estado-da-arte.md`, `papers-database.md`, `matriz-comparativa.md` |
| C-19 | C-12 afirmava `explicabilidade=sim` em 6 linhas e `parcial` em 2 de `solucoes.csv` | **`sim` em 3** (F-comercial-30 JRC, 31 GEOGLAM, 32 NASA — todas **públicas**) e **`parcial` em 6**. A prova da 1ª rodada foi obtida por `split(';')`, e `solucoes.csv` tem `;` **dentro** de campos entre aspas (~60 células), o que desalinha as colunas. Com parser CSV correto, o CSV **sempre esteve coerente** com `commercial.md`: nada foi alterado indevidamente e a frase final ("nenhuma solução **privada** menciona SHAP/XAI") é conservadora e **correta**. O conteúdo do CSV **não foi alterado**; a exigência de parser ficou documentada em `commercial.md` §Limitações | `commercial.md` (nota "como ler"), este adendo |
| C-20 | `[C-01]` creditado também pela afirmação de que features de vizinhança interpretáveis (distância à borda, TWI, curvatura, elevação relativa) "transferem para um talhão novo" | `[C-01]` sustenta **só a metade negativa** (modelo só com coordenadas empata com o completo ⇒ aprendeu posição). A metade positiva é **`[HIPÓTESE]` deste projeto** e `[LACUNA]` na base, testável pelo novo item **B7** do checklist §11 (LOFO, com e sem o bloco de features) | `ADR-001` (D2 item 6, D9), `riscos-metodologicos.md` (§4.5, §11) |
| C-21 | Faixa de resolução da grade climática publicada em **três versões divergentes** (limite inferior ora 5, ora 9 quilômetros; limite superior ora 50, ora 55 quilômetros) em quatro lugares | **~5 km `[FD-15]` a ~28 km `[FD-11]`**, derivada das linhas FD com resolução verificada (`FD-11` a `FD-13`, `FD-15`, `FD-16`, `FD-18`, `FD-19`). O limite superior de 55 quilômetros não existe em nenhuma linha FD nem no material de origem; os ~50 km do NASA POWER `[FD-14]` ficam **fora** da faixa porque o próprio catálogo marca esse valor como pendência de verificação | `fontes-de-dados.md` (2×), `ADR-001`, `recomendacoes-arquitetura.md` |
| C-22 | `modelos.md`: "caso Invicta → RF/GBM com **agrupamento por talhão-safra** na validação" | **Agrupamento por talhão (`talhao_id`)**, nunca por talhão-safra (ADR D5). Era a única linha do produto que contradizia uma decisão: agrupar por talhão-safra reintroduz vazamento pelo histórico do próprio talhão e pelas camadas fixas (CEa, MDE, fertilidade krigada), idênticas entre safras. "Talhão-safra" segue sendo a **unidade de contagem** de amostras independentes, não o grupo do `GroupKFold` | `modelos.md` |
| C-23 | ADR D9, experimento (b) "resíduo persistente": a regra restringia só a **data** da observação ("safras estritamente anteriores") | O resíduo defasado tem de ser **out-of-fold** — calculado por modelo ajustado **sem** a safra retida e **recalculado dentro de cada fold externo**. Sem isso, sob LOYO o resíduo de `t−1` produzido pelo modelo global treinado em todas as safras carrega informação da safra de teste. Novo item **D5** no checklist §11; o checklist passa de 26 para **28 itens** (com o B7 de C-20) | `ADR-001` (D9 2-bis), `riscos-metodologicos.md` §11, `recomendacoes-arquitetura.md` |
| C-24 | Sete limiares de decisão sem âncora e sem rótulo (R1 ≥1.000 talhões-safra; R2 ≥8 safras; ≥2 fazendas com ≥5 talhões-safra; ≥3 regiões com ≥20 talhões-safra; modelo-só-posição ≥80%; R² > 0,97; correlação > 0,95) | Todos rotulados **`[HIPÓTESE]`** com cláusula de origem. Em R2 ficou explícito que **13 anos** é o que `[A-10]` usou e **8** é o limiar proposto por este projeto. Varredura por script estendeu o rótulo a R5 (≥2 ciclos), A1 (>30% dos talhões com nuvem) e A6, e aos ecos em `recomendacoes-arquitetura.md` §"suíte anti-vazamento" | `ADR-001`, `riscos-metodologicos.md`, `README.md`, `recomendacoes-arquitetura.md` |
| C-25 | `[CONSENSO]` aplicado ao catálogo de fontes de dados (ADR: grades de clima, `[FD-11]`–`[FD-19]`) | **`[EVIDÊNCIA — catálogo de fontes, não literatura]`**, o rótulo já usado em `fontes-de-dados.md` e `recomendacoes-arquitetura.md`. `FD-NN` não são estudos, e C-16 fixou que `[CONSENSO]` exige ≥2 estudos independentes da base | `ADR-001` |
| C-26 | `README.md`: "Revisão (87 estudos com DOI conferido)" | **"87 estudos: 77 com DOI conferido no Crossref/DataCite; 10 sem DOI, com URL conferida"**. Dez estudos (C-14, D-11, E-brasil-02, E-brasil-03, E-brasil-05, G-01, G-02, G-05, G-11, G-12) não têm DOI | `README.md` (2×), `estado-da-arte.md` |
| C-27 | "8 candidatos" (ADR) × "nove candidatos" (README, recomendações) | **Nove**, e a contagem ficou explícita: são as **linhas 0 a 7 e 9** da tabela de D1 (a linha 8, regression-kriging, está fora da validação oficial). A linha 7 são dois modelos (PLSR e SVR) no mesmo braço — por isso nove linhas, não nove implementações | `ADR-001`, `README.md`, `recomendacoes-arquitetura.md` |

### Terceira rodada de verificação independente

A terceira verificação apontou oito itens (N-01…N-08), corrigidos em seguida **sem nova verificação
independente**.

| # | O que estava | O que passou a valer | Onde |
|---|---|---|---|
| C-28 | `[CONSENSO]` apoiado em **um único estudo** em 14 blocos (a correção de C-16 tinha sido aplicada só onde a 1ª rodada apontou; a prova da 2ª rodada usava janela de linhas, que em lista de *bullets* engole os ids vizinhos) | Recontagem por script isolando o **bloco exato** (do marcador de lista até o próximo marcador/linha em branco; célula de tabela = a célula; parágrafo introdutório + a lista que ele abre). Os 14 blocos com < 2 `paper_id` distintos foram rebaixados para **`[EVIDÊNCIA LIMITADA]`** (afirmação metodológica de um estudo ou revisão) ou **`[RESULTADO ESPECÍFICO]`** (achado empírico de um estudo), preservando o qualificador "evidência geral fora da agricultura" onde existia. Script rodado de novo: **zero** `[CONSENSO]` com < 2 ids | `ADR-001` (6), `modelos.md` (7), `recomendacoes-arquitetura.md` (1) |
| C-29 | `[A-03]` ainda descrito como "leave-one-year-out / LOYO" em **7 pontos**, contra o próprio adendo C-03 e contra a fonte | **"CV 10-fold aleatória para o ajuste + teste em anos retidos (2012, 2017, 2018)"**, com a ressalva explícita "não é *leave-one-year-out*". É o que diz `A-modelos/fontes/03-shahhosseini-2021.md` (*"Random tenfold cross-validation"* + teste em anos fora da amostra) e o que o campo `validation` do CSV já registrava. O RRMSE 6–7% segue sendo "o único número de referência de erro", agora sempre com a validação correta e a escala (**condado, milho, EUA**). `val_year_out=sim` permanece correto: houve anos retidos. Varredura por script: **zero** ocorrências de A-03 a ≤ 300 caracteres de termo LOYO que descrevam a validação do estudo | `ADR-001` (2), `estado-da-arte.md` (2), `riscos-metodologicos.md` (2), `modelos.md` (1) |
| C-30 | GWRFR simultaneamente **dentro** (ADR D1: "nove candidatos na validação oficial — linhas 0 a 7 e 9") e **fora** ("fora da validação oficial, como experimento à parte") da validação oficial | Vale o ADR: **GWRFR é a linha 9 e está *dentro* da validação oficial**, com prioridade baixa. Fora ficam apenas a regression-kriging (linha 8) e o *offset* de "resíduo persistente" (D9, item 2-bis) | `README.md`, `recomendacoes-arquitetura.md` |
| C-31 | `[B-03]` fora da categoria "validação só em texto livre" por critério inconsistente; total publicado 40 de 87 (46%) | **Critério único, aplicado por script e enunciado em `estado-da-arte.md` §2.9**: conta-se como *sem esquema declarado* todo estudo cujo `validation` esteja literalmente `nd` **ou** cujo texto afirme que o esquema não foi especificado/detalhado/declarado/esclarecido/confirmado na fonte lida. Entram `[B-03]` e `[B-01]`: **14** em texto livre e **42 de 87 (48%)** no total. `[B-01]` continua em **V5** na matriz — a classificação registra o que se *infere*, a contagem registra o que a fonte *declara* (isto **revisa** o que C-18 dizia sobre `[B-01]`) | `README.md`, `estado-da-arte.md` (3), `papers-database.md` (2), `matriz-comparativa.md` |
| C-32 | `[E-brasil-04]`: "15 safras (2005/06–2020/21)" — número e intervalo incompatíveis | A fonte (`E-brasil/fontes/04-mohite-2023-isprs.md`) diz literalmente *"Municipality-level soybean yield data for **15 municipalities** … from the **2005–06 to the 2020–21** season"*: o "15" do artigo são **municípios**, e o artigo **não declara o número de safras**. Passa a valer **"safras 2005/06–2020/21"**, com a nota de que o intervalo informado corresponde a **16 safras** e de que o registro anterior confundia municípios com safras. Nenhum número foi escolhido por conta própria | `papers-database.csv` (campo `years`), `estado-da-arte.md` (3), `matriz-comparativa.md`, `modelos.md` |
| C-33 | `ADR:633` e 5 ecos: TreeSHAP é "a **única** opção que calcula valores de Shapley exatos em tempo polinomial" | **"o *primeiro* algoritmo em tempo polinomial"**, como diz `G-dados-xai/fontes/07-lundberg-treeshap.md` sobre `[G-07]` (Lundberg et al. 2020). "Primeiro" ≠ "única"; acrescentada a ressalva de que a base não compara TreeSHAP com alternativas exatas posteriores `[LACUNA]` | `ADR-001`, `README.md`, `estado-da-arte.md`, `riscos-metodologicos.md`, `modelos.md` (2) |
| C-34 | Resíduo de C-24: limiares de decisão do projeto sem rótulo nos **ecos** (~10 talhões para GroupKFold; ≥4 safras para LOYO; ≥2 fazendas com ≥5 talhões-safra; 500+ talhões-safra ou < 15 como gatilho de revisão) | Todos rotulados **`[HIPÓTESE]`** com cláusula de origem, igual ao que `ADR:453`, `ADR:469` e `README:301` já faziam. Varredura por script (linha com número **+** palavra de limiar **e sem** `[X-NN]`/`[HIPÓTESE]`) sobre README, ADR, riscos e recomendações; as demais linhas com número que sobraram são descrição do código existente (teto de 400 células/lado, 512 MB), exemplo ilustrativo ou evidência já ancorada em id na mesma frase | `ADR-001` (4), `riscos-metodologicos.md` (6) |
| C-35 | `README:399` e `:459` atribuíam a `[H-07]` "algodão / SHAP / grade de 20 m", na mesma frase que declara que `só metadados` não sustenta nada além de "o estudo existe" | No CSV, `H-07` tem `crop`, `country`, `scale`, `sensor`, `resolution`, `model` e `explainability` **todos `nd`**. Passa a valer **"título/DOI confirmados; conteúdo não lido"**, com apenas o que o título literalmente sustenta ("identificar causas da variabilidade de produtividade com ML interpretativo"). `H-05` e `H-11` foram reconferidos contra o título do CSV e estavam corretos | `README.md` (2), `estado-da-arte.md` |

**Fica aberto e declarado:** a redundância de `estado-da-arte.md` (~1.800 linhas), a unidade do RMSE
de `[B-12]` a reconferir na fonte primária, as pendências de verificação de `fontes-de-dados.md`, os
estudos que entraram na base só com metadados e o fato de que **as correções N-01…N-08 não passaram
por verificação independente** — todos listados em `README.md`, "Pendências conhecidas da Fase 1".
