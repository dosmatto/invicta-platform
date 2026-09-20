# Recomendações de Arquitetura — Preditor de Produtividade na Plataforma Invicta

> **Documento 7 da seção 48** do pedido original. Responde: *como o preditor de produtividade se encaixa na plataforma que já existe.*
>
> **Estado:** Fase 1. **Nenhum código de produção foi escrito**, e nada aqui foi implementado. Este documento é recomendação técnica, não descrição de sistema.
>
> **Insumos:** `../decisions/ADR-001-model-strategy.md` (as dez decisões), `../literature-review/riscos-metodologicos.md`, `../benchmarks/modelos.md`, `../data-sources/fontes-de-dados.md`, `../benchmarks/commercial.md`, e a leitura direta (somente leitura, nada alterado) de `backend/README.md`, `backend/requirements.txt`, `backend/indices.py`, dos docstrings de `backend/{colheita,interp,msr,mde,cbers,agenda}.py`, de `render.yaml` e de `docs/15.00_DOC_CONCEITUAL_CONDUTIVIDADE.md`.
>
> **Evidência:** `paper_id` da base verificada entre colchetes. `[FD-NN]` = fontes de dados; `[F-comercial-NN]` = soluções comerciais — **não** são `paper_id`. Primeira citação de estudo lido só pelo resumo vem marcada `[X-NN, só abstract]`.
>
> **Classificação obrigatória (item 11 do ledger):** cada recomendação recebe **`reusa`** (aproveita o que já está na stack), **`novo_barato`** (biblioteca ou pipeline novo, CPU-only e leve) ou **`infra_nova`** (GPU, hardware, serviço ou orçamento recorrente novo). A classificação é feita contra a cópia versionada [`perfil-compatibilidade.md`](./perfil-compatibilidade.md).
>
> Unidade interna: kg/ha (1 sc = 60 kg).

## Como ler os rótulos de decisão deste documento

A seção 45 do pedido admite o rótulo `[DECISÃO]` em toda a documentação, mas as seções 20 e 46 exigem que uma decisão traga **alternativas, evidências, justificativa e consequências** — e que more em `docs/decisions/`. Este documento, portanto, **não usa `[DECISÃO]` nu**. Duas formas:

| Rótulo | Significado |
|---|---|
| `[DECISÃO → ADR-001 Dn]` | A decisão já está tomada e documentada, com alternativas e evidências, na decisão `Dn` do [`ADR-001`](../decisions/ADR-001-model-strategy.md). Aqui ela só é **aplicada** à plataforma. |
| `[RECOMENDAÇÃO — a formalizar em ADR]` | Escolha de engenharia **ainda sem ADR**. É proposta técnica fundamentada, não decisão registrada; o ADR que a formaliza está mapeado na §17, "ADRs a abrir na Fase 2". |

---

---

## 0. O que a plataforma já é — e o que isso determina

Antes de qualquer proposta, três fatos lidos do código e da configuração, porque eles restringem tudo:

1. **O backend é um serviço de cálculo geoespacial síncrono, em CPU, com 2 workers.** `render.yaml` declara `plan: standard` e `WEB_CONCURRENCY=2`, com o comentário explícito de que 2 workers existem para que "o lote pesado de um usuário não trave a interpolação dos outros". O plano foi elevado de *starter* para *standard* justamente porque "a krigagem é pesada em CPU e o 'Processar tudo' roda 26 mapas em fila". **Não há folga para treinar modelo nesse processo.**
2. **A memória já foi um limite atingido, e o teto que veio daí nunca foi reavaliado.** `interp.py` limita a malha a **400 células por lado** com a nota de que, a 2 m em talhões grandes, uma grade 500×500 "estourava a memória do plano do Render (512 MB) e derrubava o container". Esse comentário é **histórico**: descreve o limite do **plano anterior**; o `render.yaml` de hoje declara `plan: standard`. O que continua valendo é (i) o teto de 400 células/lado foi calibrado na época dos 512 MB e **não foi reavaliado após a migração**, e (ii) o worker é reciclado a cada ~100 requisições porque "GDAL/rasterio fragmentam a memória".
3. **Já existe o padrão certo para trabalho pesado: o robô noturno.** `agenda.py` roda numa thread daemon, com **trava em linha do banco** (`UPDATE` condicional em `app_kv`, serializado pelo Postgres, para que só um dos 2 workers leve a noite), **progresso commitado por cena** (morrer no meio custa uma cena), execução **serial com teto** e ativação **opt-in** por variável de ambiente. Esse desenho já resolveu, para o Sentinel-2, exatamente o problema que o preditor de produtividade vai ter.

> **`[DECISÃO → ADR-001 D1, D8]` de arquitetura que decorre disso, e da qual tudo o mais depende:** **treino, validação, SHAP e inferência em lote acontecem FORA do caminho da requisição.** O backend do Render serve **artefatos pré-computados**. A requisição do usuário lê um grid guardado, exatamente como já faz com as camadas de fertilidade e de NDVI. `reusa`.

---

## 1. Pipeline geoespacial (seção 27) mapeado no que já existe

Cada caixa do pipeline conceitual do pedido, com o módulo real que a cumpre hoje ou a marcação do que é novo.

```text
                    ┌──────────────────────────────────────────────────────────────────────┐
                    │  A. DADOS BRUTOS                                                     │
                    ├──────────────────────────────────────────────────────────────────────┤
  Sentinel-2 L2A ──▶│ msr.py        STAC earth-search · COG · janela do talhão   [reusa]   │
  CBERS-4A WPM ────▶│ cbers.py      STAC data.inpe.br · PAN 2 m + bandas 8 m     [reusa]   │
  Pontos colhedora ▶│ colheita.py   5 filtros + IDW (alvo)                       [reusa]   │
  Laudos de solo ──▶│ interp.py     krigagem ordinária + CV LOO                  [reusa]   │
  Pontos de CEa ───▶│ interp.py     via módulo Condutividade (variável fixa)     [reusa]   │
  DEM público ─────▶│ mde.py        cop30 / srtm + buffer antes de derivar       [reusa]   │
  Robô noturno ────▶│ agenda.py     varre monitorados, aceita por nuvem, grava   [reusa]   │
  Clima ───────────▶│ ░ NOVO ░      AgERA5 [FD-13] / NASA POWER [FD-14]     [novo_barato]  │
                    └───────────────────────────────┬──────────────────────────────────────┘
                                                    │
                    ┌───────────────────────────────▼──────────────────────────────────────┐
                    │  B. VALIDAÇÃO                                                        │
                    │  parcialmente existe: regras de aceite por nuvem (agenda.py) e       │
                    │  Índice de Qualidade da CEa derivado do RMSE relativo da CV [reusa]  │
                    │  ░ NOVO ░ validador de dataset: densidade de pontos/célula,          │
                    │  % removido por estágio de filtro, lineage completo   [novo_barato]  │
                    └───────────────────────────────┬──────────────────────────────────────┘
                                                    │
                    ┌───────────────────────────────▼──────────────────────────────────────┐
                    │  C. PADRONIZAÇÃO DE CRS                                              │
                    │  JÁ RESOLVIDO: interp/msr/cbers/mde projetam para um plano métrico   │
                    │  local (equirretangular) e devolvem o MESMO envelope — bounds +      │
                    │  grid Float32 base64 com o norte no topo + stats           [reusa]   │
                    └───────────────────────────────┬──────────────────────────────────────┘
                                                    │
                    ┌───────────────────────────────▼──────────────────────────────────────┐
                    │  D. LIMPEZA                                                          │
                    │  colheita.py: filtro bruto · operacional · correção entre colhedoras │
                    │  · MapFilter global + local anisotrópico · ajuste à média  [reusa]   │
                    │  ░ NOVO ░ 2 alvos (yield_sem_ajuste / yield_ajustado) + auditoria    │
                    │  contra Moran local [H-13, só abstract] + log de %    [novo_barato]  │
                    │  removido por estágio                                                │
                    └───────────────────────────────┬──────────────────────────────────────┘
                                                    │
                    ┌───────────────────────────────▼──────────────────────────────────────┐
                    │  E. GRID ESPACIAL — célula de 20 m, origem estável por talhão        │
                    │  interp.interpolar já produz o grid; pixel_m = 20,0 é o contrato     │
                    │  documentado; teto de 400 células/lado protege a memória   [reusa]   │
                    └───────────────────────────────┬──────────────────────────────────────┘
                                                    │
    ════════════════════════════════════════════════╪═════════════════════════════════════════
      daqui para baixo: OFFLINE (job/notebook)      │      nada disto entra na requisição
    ════════════════════════════════════════════════╪═════════════════════════════════════════
                                                    │
                    ┌───────────────────────────────▼──────────────────────────────────────┐
                    │  F. EXTRAÇÃO DE FEATURES              ░ NOVO ░        [novo_barato]  │
                    │  empilha as camadas na célula · agrega espectral por janela de DAS   │
                    │  · aplica o corte data_imagem <= data_previsao NA CONSULTA           │
                    │  · grupos A–F da seção 30 · lineage por feature                      │
                    └───────────────────────────────┬──────────────────────────────────────┘
                                                    │
                    ┌───────────────────────────────▼──────────────────────────────────────┐
                    │  G. BANCO DE FEATURES                 ░ NOVO ░        [novo_barato]  │
                    │  Parquet particionado por safra/talhão em object storage             │
                    │  (recomendação condicional — ver §4)                                 │
                    └───────────────────────────────┬──────────────────────────────────────┘
                                                    │
                    ┌───────────────────────────────▼──────────────────────────────────────┐
                    │  H. TREINAMENTO                       ░ NOVO ░        [novo_barato]  │
                    │  9 candidatos (ADR D1: linhas 0-7 e 9) × janelas DAS × CV aninhada   │
                    │  NUNCA no processo do Render                                         │
                    └───────────────────────────────┬──────────────────────────────────────┘
                                                    │
                    ┌───────────────────────────────▼──────────────────────────────────────┐
                    │  I. VALIDAÇÃO                         ░ NOVO ░        [novo_barato]  │
                    │  GroupKFold por talhão (oficial) · LOFO · LOYO · fazenda externa     │
                    │  + AOA/DI + suíte anti-vazamento bloqueante                          │
                    └───────────────────────────────┬──────────────────────────────────────┘
                                                    │
                    ┌───────────────────────────────▼──────────────────────────────────────┐
                    │  J. MODELO (artefato versionado)      ░ NOVO ░        [novo_barato]  │
                    │  model_id + version + hash do pipeline + métricas + calibração       │
                    └───────────────────────────────┬──────────────────────────────────────┘
                                                    │
                    ┌───────────────────────────────▼──────────────────────────────────────┐
                    │  K. INFERÊNCIA EM LOTE                ░ NOVO ░        [novo_barato]  │
                    │  reusa o DESENHO de agenda.py: thread + trava em linha do banco +    │
                    │  progresso por talhão + serial com teto. Produz, por talhão-safra-   │
                    │  janela: previsto · incerteza · fatores (SHAP) · AOA                 │
                    │  SEM krigagem do resíduo da safra prevista (ADR D9: o alvo não       │
                    │  existe antes da colheita — seria vazamento)                         │
                    └───────────────────────────────┬──────────────────────────────────────┘
                                                    │
                    ┌───────────────────────────────▼──────────────────────────────────────┐
                    │  L. MAPA DE PRODUTIVIDADE PREVISTA                                   │
                    │  gravado no MESMO formato das camadas existentes (grid gzip por      │
                    │  talhão, namespace próprio) e servido por rota de leitura  [reusa]   │
                    └──────────────────────────────────────────────────────────────────────┘
```

**O que este diagrama diz, em uma frase:** das doze caixas, **seis já existem** (A parcial, B parcial, C, D, E, L) e a plataforma já resolveu os dois problemas mais difíceis de um pipeline geoespacial — padronização de CRS e limpeza de mapa de colheita. O que falta é tudo o que fica **abaixo da linha tracejada**, e nada disso pertence ao processo web.

---

## 2. Onde treinar vs. onde inferir

### 2.1 O backend do Render aguenta?

**Para treinar: não.** Três razões, todas verificáveis no repositório:

| Restrição | Evidência no código/config | Consequência |
|---|---|---|
| 2 workers compartilhados com usuários reais | `WEB_CONCURRENCY=2` em `render.yaml`, com o comentário de que existem para não travar a fila | Um treino de horas ocuparia metade da capacidade de atendimento |
| Memória compartilhada, com fragmentação conhecida — e um teto de malha herdado do **plano anterior (512 MB)**, não reavaliado após a migração para `standard` | `interp.py` limita a malha a 400/lado (comentário datado dos 512 MB); worker reciclado a cada ~100 requisições porque "GDAL/rasterio fragmentam a memória" | Um `DataFrame` de 2,5×10⁵ linhas × dezenas de features, multiplicado pelo número de *folds*, não cabe com folga num processo que também atende usuários |
| Reciclagem do worker mata threads de job | documentado em `agenda.py`: "uma thread de job é morta junto" | Treino longo em thread seria interrompido no meio |

**Para inferir: sim, desde que seja leitura de artefato.** A plataforma já serve grids de fertilidade e de NDVI a partir do Supabase (`inv_mapas_fert`, grid gzip por talhão com autoload). Um mapa de produtividade prevista é o mesmo tipo de objeto.

### 2.2 `[DECISÃO → ADR-001 D1, D8]` A separação recomendada

| Etapa | Onde roda | Classificação |
|---|---|---|
| Montagem do dataset de features | job offline (máquina de desenvolvimento ou runner de CI/agendado) | `novo_barato` |
| Treino, CV aninhada, ablação, curva por janela | **offline**, em notebook/script versionado | `novo_barato` |
| Calibração de incerteza (QRF/conformal por talhão) | **offline**, junto do treino | `novo_barato` |
| Cálculo de SHAP por pixel | **offline ou job noturno** — nunca síncrono | `novo_barato` |
| Krigagem de resíduos — **só uso pós-colheita** (camada `erro`, talhão parcialmente colhido) e **só no experimento (b) de D9** (resíduo de safras anteriores como offset, sob LOYO) | job noturno / offline, `pykrige` já pinado | **`reusa`** |
| Escrita dos grids resultantes | job noturno, padrão `inv_mapas_fert` | **`reusa`** |
| Leitura pela interface | backend Render, rota de leitura | **`reusa`** |

### 2.3 O que NÃO colocar no caminho da requisição — lista explícita

- Treino ou re-treino de qualquer modelo.
- Busca de hiperparâmetros, seleção de features, qualquer laço de CV.
- Cálculo de SHAP (TreeSHAP é polinomial `[G-07, só abstract]` e viável em CPU, mas sobre dezenas de milhares de linhas leva minutos, não milissegundos).
- Krigagem de resíduos sobre o talhão inteiro.
- Download de cena nova de satélite para atender uma previsão (é trabalho do robô).
- Qualquer chamada a API externa de clima.
- Carregamento de mais de um artefato de modelo por processo (memória).

Tudo isso é pré-computado e guardado. A requisição faz: *resolver talhão-safra-janela → ler grid gzip → devolver*.

### 2.4 `[RECOMENDAÇÃO — a formalizar em ADR]` Reusar o desenho de `agenda.py`, não reinventá-lo
*(ADR-007-inference-job, §17)*

O job de inferência noturna deve copiar, item a item, as quatro escolhas que `agenda.py` documenta como aprendidas na prática:

1. **Sem dependência de agendador novo** — thread daemon com laço próprio (um scheduler em memória morre com o worker reciclado e ainda exigiria a mesma trava).
2. **Trava em linha do banco** — `UPDATE` condicional serializado pelo Postgres, para que só um dos 2 workers execute.
3. **Progresso commitado por unidade** — aqui, por **talhão-safra-janela**, com id determinístico, para que a reciclagem do worker custe no máximo uma unidade.
4. **Serial, com teto e janela de horário**, e **opt-in por variável de ambiente** (nada arma sem a flag, como `MSR_AGENDA=1`).

Classificação: **`reusa`** — é padrão de código já existente, não infraestrutura nova.

---

## 3. Dependências novas: custo e risco para o build pinado

O `requirements.txt` é deliberadamente pinado, com a justificativa escrita no próprio arquivo: build reprodutível e imune a um "latest" futuro mais lento — "a lentidão da interpolação já foi suspeita de atualização de libs; pinar elimina esse risco". **Qualquer recomendação que engorde esse arquivo tem de pagar por si.**

### 3.1 `[RECOMENDAÇÃO — a formalizar em ADR]` Separar dois conjuntos de dependências
*(ADR-004-build-dependencies, §17)*

| Arquivo | Propósito | Vai para o Render? |
|---|---|---|
| `backend/requirements.txt` | **produção** — servir a plataforma | sim, e **muda o mínimo possível** |
| `requirements-train.txt` (novo, fora do `backend/`) | **offline** — dataset, treino, validação, SHAP | **não** |

Isso é possível **porque** a decisão de §2 tira o treino e o SHAP do caminho da requisição. Se a inferência também for pré-computada em lote fora do Render (recomendado no MVP), o backend de produção **não precisa nem do `xgboost`**: ele só lê grids. Essa é a maior economia de risco deste documento.

### 3.2 Tabela de dependências

| Biblioteca | Para quê | Onde | Custo / risco | Classificação |
|---|---|---|---|---|
| `pandas` | manipulação do dataset tabular | treino | leve; não toca o build de produção | `novo_barato` |
| `pyarrow` | ler/escrever Parquet | treino (+ job) | binário razoável; sem GDAL | `novo_barato` |
| `scikit-learn` | CV por grupo, Pipeline, LR/SVR/PLSR/Extra Trees, métricas | treino | leve, CPU-only; o perfil já o sinaliza como "pode entrar" | `novo_barato` |
| `xgboost` | Modelo 3 (ADR D1) | treino (+ inferência **se** não for pré-computada) | wheel CPU-only; aumenta a imagem | `novo_barato` |
| `lightgbm` | Modelo 4; categóricas nativas | treino (idem) | idem | `novo_barato` |
| `catboost` | Modelo 5 opcional | treino | **maior** que os dois anteriores; só entra se o experimento justificar | `novo_barato` |
| `shap` | TreeSHAP (ADR D8) | **só treino/job** | MIT, CPU-only, maduro; **não precisa ir à produção** se o SHAP for pré-computado | `novo_barato` |
| `quantile-forest` **ou** `MAPIE` / `crepes` | QRF / conformal (ADR D7) | treino | leves, CPU-only; escolher **um** após o experimento comparativo | `novo_barato` |
| `statsmodels` | modelos mistos (se entrarem) | treino | leve; ADR não os inclui no MVP | `novo_barato` |
| `geopandas` | — | — | **evitar**: arrasta `fiona`/`pyproj`/GDAL, o mesmo conjunto que já fragmenta memória no worker. `shapely` + `rasterio` (já pinados) cobrem o que o pipeline precisa | `infra_nova` de fato, apesar de parecer barata |
| `optuna` | busca de hiperparâmetros | — | **fora do MVP**: o ADR D1 pede grade curta e registrada, não busca extensiva | — |
| `cdsapi` | ingestão AgERA5/ERA5-Land `[FD-12]`, `[FD-13]` | job de clima | leve; exige credencial do CDS | `novo_barato` |
| `cfgrib`/`eccodes` | MERGE/CPTEC `[FD-19]` (grib2) | — | **fora do MVP**: dependência binária pesada | `infra_nova` |
| PyTorch / TensorFlow | Deep Learning | — | **fora** por decisão D1 do ADR | `infra_nova` |

### 3.3 `[RECOMENDAÇÃO — a formalizar em ADR]` Regras de mudança do build de produção
*(ADR-004-build-dependencies, §17)*

1. Nenhuma biblioteca entra em `backend/requirements.txt` **sem versão exata**, mantendo a política atual.
2. Nenhuma entra **antes** de o experimento mostrar que ela é necessária em produção (e não só em treino).
3. O `buildFilter` de `render.yaml` (`backend/**` + `render.yaml`) já impede que mudanças fora do backend rebuildem o serviço — o diretório de treino deve ficar **fora** de `backend/` para preservar isso.
4. Toda adição é acompanhada de uma medição do tempo de build e do tamanho da imagem antes/depois. O comentário no `render.yaml` sobre rebuilds desnecessários existe porque esse custo já doeu uma vez.

---

## 4. Armazenamento de features — recomendação condicional

### 4.1 As três opções

| Opção | Como seria | A favor | Contra |
|---|---|---|---|
| **Parquet/GeoParquet em object storage** | uma partição por safra e talhão; leitura colunar no treino | formato colunar ideal para ML; compressão alta; não toca o Postgres; versionável por caminho | exige object storage (o repositório não declara um hoje); consultas ad-hoc exigem ferramenta |
| **Tabela no Postgres/Supabase** | tabela larga `cell × features` | já existe; transacional; junta com a hierarquia Cliente→Fazenda→Talhão→Safra | 5×10⁴–2,5×10⁵ linhas **por safra** e dezenas de colunas viram tabela larga; Supabase tem limite de plano; leitura para treino é lenta e cara |
| **Grid gzip por talhão no `inv_mapas_fert`** | mesmo padrão das camadas atuais | **já funciona em produção**; autoload no front; zero infraestrutura nova | é formato de *camada*, não de *tabela de treino*: montar o dataset exige desserializar talhão a talhão |

### 4.2 `[RECOMENDAÇÃO — a formalizar em ADR]` Recomendação condicional
*(ADR-003-feature-store, §17)*

**Regra:** cada artefato vai para o formato do seu consumidor.

| Artefato | Consumidor | Formato recomendado | Classificação |
|---|---|---|---|
| **Tabela de features para treino** | job offline | **Parquet particionado** por `safra/talhao_id`, em object storage; **se** não houver object storage disponível, **diretório local versionado + checksum** no MVP, e a migração fica adiada | `novo_barato` |
| **Camadas servidas** (previsto, incerteza, fatores, real, erro) | front | **grid gzip no padrão `inv_mapas_fert`**, com namespace próprio (ex.: `produtividade_prevista__<talhao>__<safra>__<janela>__<model_version>`), seguindo o mesmo desenho de `condutividade__<talhao>__<versao>__<prof>` | **`reusa`** |
| **Metadados, lineage, versões de modelo, métricas** | plataforma e auditoria | **tabelas no Postgres/Supabase** — são poucos registros, relacionais e precisam de junção com a hierarquia | `novo_barato` |
| **Artefato do modelo** (`.pkl`/`.json` + calibração) | job de inferência | object storage ou anexo versionado, com `model_id` registrado no Postgres | `novo_barato` |

**GeoParquet vs. Parquet:** no MVP, **Parquet simples basta**. A geometria da célula é derivável determinísticamente de (`talhao_id`, grid de 20 m, origem estável) — guardar polígono por célula multiplica o tamanho do arquivo sem ganho. GeoParquet entra se e quando o dataset for compartilhado com ferramentas GIS externas.

**COG (Cloud Optimized GeoTIFF)** para as camadas raster: `rasterio` já está pinado e `mde.py` já menciona export GeoTIFF; é a escolha natural **se** houver object storage. Enquanto não houver, o grid gzip no Supabase já resolve e é `reusa`.

### 4.3 `[RECOMENDAÇÃO — a formalizar em ADR]` PostGIS: **não** no MVP
*(ADR-003-feature-store, §17; registrado como decisão adiada A8 no ADR-001)*

| Argumento | Peso |
|---|---|
| Toda a geometria é resolvida hoje em `shapely` (recorte por polígono, projeção métrica local), e os grids são blobs | contra PostGIS |
| Não há, no produto proposto, nenhuma consulta espacial **entre** talhões no caminho da requisição | contra PostGIS |
| Habilitar PostGIS no Supabase é barato, mas migrar geometria e manter dois lugares de verdade não é | contra PostGIS |
| **A favor, e é o único:** se o *gate* de AOA (ADR D5) evoluir para "encontre talhões similares no espaço de preditores", isso continua sendo álgebra em `numpy`, não consulta espacial | inconclusivo |

**Gatilho de reversão:** quando aparecer a primeira consulta espacial entre talhões que precise rodar sincronamente. Registrado como decisão adiada A8 no ADR.

---

## 5. Identificadores e lineage (seções 25–26)

### 5.1 `[RECOMENDAÇÃO — a formalizar em ADR]` Identificadores obrigatórios em toda linha
*(ADR-005-data-lineage, §17)*

A hierarquia Cliente → Fazenda → Talhão → Safra já existe na plataforma — **`reusa`**. O que falta é carimbar cada linha do dataset:

| Campo | Origem | Observação |
|---|---|---|
| `organization_id`, `farm_id`, `field_id`, `season_id` | hierarquia existente | `field_id` é a chave de agrupamento da CV oficial (ADR D5) |
| `crop` | cadastro | soja no MVP |
| `cell_id` | derivado do grid de 20 m com origem estável por talhão | **estável entre safras**, para comparabilidade temporal |
| `geometry` | derivável de `cell_id` + origem | não armazenar por linha (§4.2) |
| `data_previsao` | **campo novo obrigatório** | é o corte temporal de D6; sem ele o dataset não é montável sem vazamento |
| `janela_das` | rótulo da janela de antecedência | D6 |
| `source`, `processing_version` | por camada | `colheita.py` já expõe `VERSION`; `msr.py` e `cbers.py` também |

### 5.2 `[RECOMENDAÇÃO — a formalizar em ADR]` Lineage por feature
*(ADR-005-data-lineage, §17; o campo `derivada_do_alvo` é exigência de `[DECISÃO → ADR-001 D9]`)*

Registrar, para **cada feature**, os campos da seção 26 mais quatro que os riscos metodológicos tornaram obrigatórios:

| Campo | Por quê |
|---|---|
| origem, resolução, data, método de interpolação, método de limpeza, CRS, versão, unidade, transformações | seção 26 |
| **`derivada_do_alvo`** (booleano) | bloqueia zonas MEAP derivadas de colheita, classificação de estabilidade e *target encoding* no modelo cold-start (ADR D9) |
| **`janela_fim`** (data) | permite o teste automático `janela_fim <= data_previsao` — o erro declarado por `[A-03]` |
| **`pontos_origem`** (lista de `ponto_id`) | permite verificar que krigagem e IDW não cruzaram fronteira de talhão nem usaram pontos do conjunto de teste |
| **`densidade_amostral`** (pontos/ha) e **`variancia_predicao`** (por célula) | propagação do erro em cascata; `interp.py` já roda CV LOO na krigagem, então a variância existe e só precisa ser guardada. `[EVIDÊNCIA LIMITADA]` O uso de variáveis previamente mapeadas como preditores sem reconhecer sua incerteza amplifica erros a jusante `[C-05]` |

Classificação: **`novo_barato`** — é esquema de metadados, não infraestrutura.

---

## 6. Versionamento de modelos (seção 40)

`[RECOMENDAÇÃO — a formalizar em ADR]` *(ADR-006-model-registry, §17)* Nenhum modelo substitui outro silenciosamente. Registro mínimo por modelo, em tabela no Postgres:

```
model_id · version · data_treinamento · crop · regioes · janela_das
features (lista + hash) · dataset_id (hash do Parquet) · hiperparametros
metricas (RMSE mediano, faixa, n_talhoes_pior_que_nulo, bias, Spearman, PICP, PINAW)
esquema_validacao · n_folds · git_sha · pipeline_hash · status (candidato|ativo|aposentado)
calibracao_id (artefato de conformal/QRF) · aoa_limiar
```

Três regras que decorrem do ADR:

1. **Um modelo por janela de antecedência** (D6) — `janela_das` faz parte da identidade, não é atributo.
2. **A calibração de incerteza é versionada junto e nunca separada do modelo** (D7): trocar o modelo sem recalibrar invalida a cobertura medida.
3. **Todo grid servido carrega o `model_version` que o gerou**, embutido no namespace da camada — assim o front pode mostrar, e a auditoria pode reconstruir, qual modelo produziu qual mapa.

Precedente interno direto: o módulo de Condutividade já opera com **versões por talhão e uma versão oficial** (`inv_condutividade`), com a regra de "nunca sobrescrever sem confirmação". O preditor deve herdar esse padrão. **`reusa`** no desenho, `novo_barato` na tabela.

---

## 7. Monitoramento e drift (seção 41)

`[RECOMENDAÇÃO — a formalizar em ADR]` *(ADR-006-model-registry, §17)* Relatório mensal automático, gerado pelo mesmo job noturno, com:

| O que | Como | Fonte da exigência |
|---|---|---|
| Erro médio e bias por talhão, por fazenda, por safra | comparar previsto × real **depois** da colheita | seção 41 |
| **Erro por região e por cultura** | segmentado, nunca agregado | `[C-05]`: a estatística única e global "obscurece quaisquer diferenças" |
| **Drift de features** | distribuição das features da safra corrente vs. a do treino | seção 41 |
| **Fração de talhões fora da AOA** | DI acima do limiar `[C-04, só abstract]` | é o indicador antecedente: sobe antes de o erro subir |
| **Cobertura empírica em produção (PICP)** | intervalos vs. real, por talhão | `[G-13, só abstract]` obteve ≥84% para nominal de 95% — a cobertura **precisa** ser monitorada, não só validada uma vez |
| **Classificação da safra** (normal / seca / excesso hídrico) | pelo clima regional, ainda que o clima não seja feature | `[A-03]`, `[C-11]`, `[D-12]`: ano extremo domina o resultado |
| **% removido pela limpeza, por estágio** | `colheita.py` | faixa de referência: ~30% `[H-13, só abstract]`, 10–50% `[H-12, só abstract]` |

**`[RECOMENDAÇÃO — a formalizar em ADR]` Gatilho de re-treino** *(ADR-006-model-registry, §17)*: não por calendário, e sim por evento — (i) erro médio em produção fora da faixa da validação; (ii) fração fora da AOA acima de um limiar; (iii) entrada de uma nova safra completa. Re-treino sempre gera **nova versão**, nunca sobrescrita.

Classificação: `novo_barato`.

---

## 8. Checklist anti-vazamento como teste automático (seção 42)

`[DECISÃO → ADR-001 D10]` (critério S1) O checklist de [`../literature-review/riscos-metodologicos.md`](../literature-review/riscos-metodologicos.md) §11 (**28 itens: A1–A4, B1–B7, C1–C4, D1–D5, E1–E4, F1–F4**) vira **suíte de testes automáticos em `tests/`**, e **um teste que falha bloqueia a publicação de métricas** — não gera aviso.

Os quatro itens de maior valor por custo, para implementar primeiro:

| Item | Teste | Por que primeiro |
|---|---|---|
| **A1** | `assert df.max_data_imagem <= df.data_previsao`, tolerância zero | é o vazamento mais provável do projeto: o robô noturno já guarda a safra inteira, e agregar "todos os índices da safra" é o caminho de menor esforço |
| **B1 + B2** | interseção de `talhao_id` entre treino e teste vazia em todo *fold*; `groups` é `talhao_id` e não `talhao_safra_id` | é o que sustenta a métrica oficial inteira |
| **B3** | lista negra de `x`, `y`, `lat`, `lon`, índice de linha/coluna, `cell_id` ordinal, `talhao_id` numérico **+** o teste de `[C-01]`: treinar um modelo **só** com as features suspeitas e falhar se ele atingir ≥80% do desempenho do modelo completo (**o corte de 80% é `[HIPÓTESE]` deste projeto**; em `[C-01]` o modelo só-posição ficou "quase idêntico" ao completo) | reproduz o experimento que expôs a memorização de vizinhança |
| **D3** | a média informada da safra, o fator de ajuste e derivados fora das features, verificado por nome **e** por correlação de Pearson > 0,95 com a média do talhão-safra (**o corte de 0,95 é `[HIPÓTESE]` deste projeto**) | é o vazamento específico desta plataforma (ADR D4) |

Dois detectores que não são testes de vazamento, mas pegam o mesmo problema: **E3** — R² de split aleatório > 0,97 em nível de célula dispara investigação obrigatória (**o corte de 0,97 é `[HIPÓTESE]` deste projeto**; a referência do padrão é um Random Forest com R² 0,9949 produzindo mapas "sem realismo espacial" `[H-04]`, que dá o exemplo, não o limiar); e **E4** — *gap* `random − LOFO` **próximo de zero** é tão suspeito quanto *gap* enorme, porque sugere que o agrupamento não está separando de fato.

Classificação: `novo_barato` — é `pytest` sobre o dataset, sem infraestrutura.

---

## 9. Feature store (seção 43): agora ou depois?

`[RECOMENDAÇÃO — a formalizar em ADR]` *(ADR-003-feature-store, §17; registrado como decisão adiada A7 no ADR-001)* **Depois.** No MVP, a **tabela de features em Parquet (§4.2) já é a feature store em tudo o que importa**: contrato de esquema, particionamento por talhão/safra, lineage e versionamento por caminho. O que uma feature store formal acrescenta — *serving* online de baixa latência, *point-in-time correctness* automática, registro compartilhado entre times — não tem consumidor hoje:

- não há *serving* online (a inferência é em lote, §2);
- a correção temporal é garantida pelo campo `data_previsao` e pelo teste A1, de forma explícita e auditável;
- há um time, não vários.

**Gatilho para retomar:** quando ≥2 produtos da plataforma consumirem as mesmas features em produção. O esboço da seção 43 já antecipa isso — a mesma base servindo produtividade, zonas de manejo, risco, população e fertilidade —, e é coerente com a visão de "Agronomic Intelligence Engine" da seção 62. Projetar o esquema Parquet **pensando** nesse futuro (nomes estáveis, unidades explícitas, uma linha por `cell × season × data_previsao`) custa zero agora e evita migração depois.

Classificação: `novo_barato` agora (esquema), `infra_nova` se virar feature store gerenciada.

---

## 10. Clima: qual fonte ingerir primeiro

**Contexto:** `[EVIDÊNCIA — catálogo de fontes, não literatura]` nenhuma fonte gratuita de clima chega perto do talhão — toda a família de reanálise opera em grades de **~5 km `[FD-15]` a ~28 km `[FD-11]`** entre as fontes com resolução verificada (`[FD-11]`–`[FD-13]`, `[FD-15]`, `[FD-16]`, `[FD-18]`, `[FD-19]`; o NASA POWER `[FD-14]` seria ~50 km, valor não verificado) e **não diferencia condições dentro do talhão**. O clima entra, portanto, como **um valor por talhão-safra por fase fenológica**, cruzado com relevo e solo (ADR D2, prioridade P4), nunca como camada intra-talhão.

`[RECOMENDAÇÃO — a formalizar em ADR]` *(ADR-002-satellite-source, §17)* Ordem de ingestão:

| Ordem | Fonte | Por quê | Classificação |
|---|---|---|---|
| **1º — protótipo** | **NASA POWER** `[FD-14]` | API REST simples, sem cadastro, séries prontas para uso agrícola; desbloqueia o braço E da ablação em dias. **Ressalva registrada:** a resolução exata da grade e o SLA de latência **não foram confirmados** na revisão das fontes | `novo_barato` |
| **2º — operacional** | **AgERA5** `[FD-13]` | 22 variáveis agrometeorológicas diárias já corrigidas para topografia fina, ~0,1°, licença Copernicus com uso comercial permitido, via `cdsapi`; é a melhor relação custo/benefício entre as gratuitas para uso agronômico direto (ETo, déficit hídrico, VPD) | `novo_barato` |
| **3º — histórico calibrado** | **BR-DWGD / Xavier** `[FD-18]` | melhor calibração histórica para o Brasil (3.625+ pluviômetros), mas **termina em 2020/2022** — serve para normais climatológicas, não para a safra corrente. **Termos exatos de redistribuição não confirmados** — verificar antes de embutir em produção | `novo_barato` |
| Alternativas | ERA5-Land `[FD-12]`, CHIRPS `[FD-15]`, GPM IMERG `[FD-16]`, MERGE/CPTEC `[FD-19]` | avaliar caso a caso; MERGE exige `cfgrib`/`eccodes` (grib2), dependência binária nova | `novo_barato` a `infra_nova` |
| Validação, não fonte primária | INMET/BDMEP `[FD-17]` | sem API REST oficial estável e densidade baixa no interior agrícola; melhor uso é como verdade-de-campo para calibrar produtos de grade | `novo_barato` |

`[DECISÃO → ADR-001 D2]` **A ingestão de clima não bloqueia o MVP.** É pré-requisito do braço E da ablação (ADR D2), não do produto mínimo — que é espectral + relevo + alvo.

**Nota de oportunidade fora do clima, mesma seção:** o baseline de relevo **já é bom**. `mde.py` opera no modo `auto` com a ordem `cop30 → srtm`, isto é, **Copernicus DEM GLO-30 `[FD-21]` primeiro** — justamente o DEM com a menor incerteza vertical absoluta documentada (<4 m LE90) entre os testados — e cai para uma fonte que o próprio código rotula `"NASADEM/SRTM (30 m)"` (tiles skadi). Portanto **não há upgrade *drop-in* para NASADEM `[FD-24]`**: na melhor hipótese seria redundante. O que resta como oportunidade real, de escopo menor, é **avaliar o produto NASADEM oficial (LP DAAC) no lugar dos tiles skadi como fallback**, já que `[FD-24]` reporta o menor MAE em terreno plano — sem mexer no primário `cop30`. **`reusa`**, esforço mínimo, ganho provavelmente marginal. E fica registrado o achado de licença: **FABDEM** `[FD-23]` é o mais preciso em áreas com vegetação residual, mas a licença CC BY-NC-SA **bloqueia uso comercial** — `mde.py` já o marca como indisponível, o que está correto.

---

## 11. Contrato de API sugerido (sem implementar)

> **Não implementar nesta fase.** É esboço para discussão, seguindo o estilo já usado em `POST /interpolar` e nas rotas do MSR: envelope de grid = `bounds` + grid Float32 base64 (norte no topo) + `stats`.

### 11.1 Rotas

| Rota | Método | O que faz | Custo |
|---|---|---|---|
| `/yield/predicao` | GET | devolve a previsão do talhão-safra na janela pedida: valor, intervalo, momento, confiança, fatores | leitura de artefato |
| `/yield/mapa` | GET | devolve **uma** camada em grid: `previsto` · `incerteza` · `fatores` · `real` · `erro` | leitura de grid gzip |
| `/yield/explicacao` | GET | top-5 fatores de uma célula ou zona, com o texto de ressalva | leitura |
| `/yield/janelas` | GET | janelas disponíveis para o talhão-safra e quais já são publicáveis | leitura |
| `/yield/modelos` | GET | catálogo de versões ativas, com métricas de validação | leitura |
| `/yield/reprocessar` | POST | dispara o job de inferência sob demanda | **exige `X-Api-Key` sempre**, como `/msr-agenda-rodar` — esta rota **escreve** |

### 11.2 Payload e resposta de `/yield/predicao`

```jsonc
// GET /yield/predicao?talhao_id=…&safra_id=…&janela_das=70
{
  "talhao_id": "…", "safra_id": "…", "crop": "soja",
  "janela": { "das": 70, "estadio_aprox": "R1", "data_previsao": "2026-01-12",
              "cenas_usadas": 3, "sensor": ["sentinel-2", "cbers-4a"] },

  "previsao": {
    "valor_kg_ha": 3520,
    "valor_sc_ha": 58.7,                    // 1 sc = 60 kg, só apresentação
    "intervalo_kg_ha": [3250, 3790],
    "intervalo_sc_ha": [54.2, 63.1],
    "nivel_nominal": 0.80,                  // SEMPRE declarado (ADR D7)
    "metodo_intervalo": "conformal_por_talhao",
    "cobertura_empirica_validacao": 0.78    // PICP medida sob a validação oficial
  },

  // Quando o intervalo numérico NÃO é defensável (ADR D7, item 7):
  // "previsao": { "valor_kg_ha": 3520, "intervalo_kg_ha": null,
  //               "faixa_qualitativa": "media", "motivo": "cobertura_fora_da_tolerancia" }

  "confianca": {
    "faixa": "media",                       // alta | media | baixa | sem_suporte
    "aoa": { "dentro": true, "di": 0.42, "limiar": 0.61 }
  },

  "fatores": [                              // máx. 5; espectrais colineares agrupados
    { "nome": "Vigor da vegetação", "contrib_kg_ha":  282, "estabilidade": "alta" },
    { "nome": "Declividade",        "contrib_kg_ha": -114, "estabilidade": "alta" },
    { "nome": "Matéria orgânica",   "contrib_kg_ha":   96, "estabilidade": "baixa" }
  ],
  "linha_base_kg_ha": 3480,                 // predição média do modelo (ADR D8)
  "ressalva": "Como ler este mapa. Os valores mostram como o modelo chegou à previsão, não uma relação de causa e efeito comprovada no campo. […]",

  "modelo": { "model_id": "yield-soja-br", "version": "0.1.0",
              "validacao": "GroupKFold por talhão",
              "rmse_mediano_kg_ha": 520, "faixa_rmse_kg_ha": [410, 880],
              "talhoes_pior_que_nulo": 3, "n_talhoes": 28 },

  "gerado_em": "2026-01-13T04:12:00Z"
}
```

### 11.3 Regras do contrato (`[RECOMENDAÇÃO — a formalizar em ADR]`)
*(ADR-008-api-contract, §17; as regras 1 a 3 aplicam `[DECISÃO → ADR-001 D7]`)*

1. **O nível nominal do intervalo é sempre explícito.** Nunca devolver `[a, b]` sem dizer de que nível é.
2. **`intervalo_kg_ha: null` é um estado válido** e a interface tem de saber renderizá-lo (cai na faixa qualitativa).
3. **Fora da AOA, a resposta não traz valor pontual** — traz `faixa_qualitativa` e `aoa.dentro = false`.
4. **As métricas de validação do modelo viajam junto da previsão.** O usuário avançado (e o auditor) veem de onde vem o número, sem abrir outra tela.
5. **`sc/ha` é sempre derivado de `kg/ha`, nunca armazenado**, para evitar duas verdades.
6. **Nenhuma rota de leitura dispara cálculo.** Se o artefato não existir, a resposta é `404` com `motivo: "ainda_nao_processado"`, não um cálculo síncrono.

---

## 12. Esboço da interface (seções 35–37)

```text
┌─ Predição de Produtividade ────────────────────────────  Fazenda ▾ Talhão ▾ Safra ▾ ─┐
│                                                                                      │
│   Produtividade prevista          Faixa estimada (80%)        Momento da previsão    │
│      58,7 sc/ha                     54,2 – 63,1 sc/ha            ~70 DAS (≈ R1)      │
│      3.520 kg/ha                    3.250 – 3.790 kg/ha          3 cenas usadas      │
│                                                                                      │
│   Confiança do modelo:  ●●●○  MÉDIA        [ i ] como isto é calculado               │
│                                                                                      │
│  ┌── Mapas ─────────────────────────────────────────────────────────────────────┐    │
│  │  [Previsto]  [Incerteza]  [Principais fatores]  [Real]  [Erro]               │    │
│  │                                                                              │    │
│  │      célula de 20 m · escala em sc/ha · células sem suporte em cinza         │    │
│  └──────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  ┌── Região selecionada ────────────────────────────────────────────────────────┐    │
│  │  Esta zona deve produzir  ACIMA DA MÉDIA do talhão                           │    │
│  │  Média prevista do talhão: 58,0 sc/ha                                        │    │
│  │                                                                              │    │
│  │  Fatores associados pelo modelo:                                             │    │
│  │    Vigor da vegetação    +4,7 sc/ha   ●●● estável                            │    │
│  │    Matéria orgânica      +1,6 sc/ha   ●●● estável                            │    │
│  │    Declividade           −1,9 sc/ha   ●○○ instável entre validações          │    │
│  │                                                                              │    │
│  │  ⓘ  Como ler: os valores mostram COMO O MODELO CHEGOU À PREVISÃO, não uma    │    │
│  │     relação de causa e efeito comprovada no campo. São associações           │    │
│  │     aprendidas nos talhões usados no treinamento. Variáveis parecidas        │    │
│  │     entre si (índices de vegetação) podem ter sua importância distribuída    │    │
│  │     de forma arbitrária entre elas. Este mapa NÃO É RECOMENDAÇÃO DE MANEJO   │    │
│  │     OU DE ADUBAÇÃO: use-o como ponto de partida para investigação a campo.   │    │
│  └──────────────────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### 12.1 `[DECISÃO → ADR-001 D7, D8]` Regras de interface derivadas da evidência

| Regra | Origem |
|---|---|
| **Número pontual só no nível do talhão.** Na célula, representação **ordinal e relativa** ("acima / na média / abaixo da média do talhão") com faixa larga — nunca um número com casa decimal por pixel | `[G-04, só abstract]`, `[G-13]`; agregar incerteza de células correlacionadas somando variâncias independentes estreitaria o intervalo ~50× de forma falsa |
| **Células fora da AOA em cinza**, não coloridas | `[C-05]` recomenda literalmente acinzentar as áreas fora do domínio aplicável |
| **Nível nominal do intervalo sempre visível** ("faixa estimada (80%)") | `[G-13]`: ≥84% de cobertura empírica para nominal de 95% — o número sem o nível é enganoso |
| **Máximo 5 fatores, espectrais colineares agrupados** em "vigor da vegetação" | `[G-08, só abstract]`, `[G-09, só abstract]`: com features correlacionadas, a atribuição entre elas é arbitrária |
| **Marcação de instabilidade** por fator cujo sinal muda entre *folds* | `[G-12]`: a importância de uma variável pode variar por toda uma faixa entre modelos igualmente bons |
| **Verbo associativo, nunca causal**, em todo texto gerado | `[G-09]` lista "interpretações causais injustificadas" entre os pitfalls centrais |
| **"A previsão vai apertar conforme a safra avança"** como expectativa comunicada | `[G-13]`, com a ressalva de que aquele estudo é milho, escala de condado, EUA |

### 12.2 `[DECISÃO → ADR-001 D7]` Faixas qualitativas de confiança

Quando o intervalo numérico **não for defensável** — cobertura empírica fora da tolerância, talhão fora da AOA, ou janela de antecedência que não supera o modelo nulo — a interface **substitui** o intervalo por uma faixa qualitativa:

| Faixa | Quando | O que o usuário vê |
|---|---|---|
| **Alta** | dentro da AOA, PICP dentro da tolerância, janela validada | valor + intervalo numérico + nível nominal |
| **Média** | dentro da AOA, PICP no limite | valor + intervalo **mais largo** + aviso |
| **Baixa** | DI perto do limiar, ou janela inicial | **ordinal**: "tendência acima/abaixo da média", sem número de intervalo |
| **Sem suporte** | fora da AOA, ou sem cenas na janela | **sem previsão**, com o motivo explicado |

Inspiração direta: `[F-comercial-31]` (GEOGLAM Crop Monitor) é a única solução, entre as 32 revisadas, que comunica condição de safra por **categorias qualitativas** em vez de número — e nenhuma solução comercial privada divulga intervalo de incerteza numérico; `[F-comercial-01]` (Climate FieldView) é a única que menciona o conceito de distribuição de probabilidade, sem números. Classificação: `novo_barato` (é regra de renderização, não de modelagem).

---

## 13. Riscos de produto

Probabilidade e impacto são avaliação `[HIPÓTESE]` deste documento para o contexto Invicta; a coluna de ids aponta a evidência de que o fenômeno existe.

| # | Risco | Prob. | Impacto | Mitigação | ids |
|---|---|---|---|---|---|
| P1 | **A previsão decepciona no primeiro talhão novo** porque a métrica publicada veio de split aleatório | Alta | Alto | Métrica oficial por grupo desde o dia 1; comunicar internamente que os números serão piores que os da literatura | `[C-01]`, `[C-11]`, `[C-12]`, `[D-12]`, `[B-15, só abstract]` |
| P2 | **Agrônomo ou cliente lê SHAP como causalidade** e toma decisão de adubação | Alta | Alto | Texto de ressalva fixo; verbo associativo; nenhuma recomendação derivada de SHAP no MVP | `[G-09]`, `[G-12]` |
| P3 | **Intervalo numérico publicado sem cobertura real** | Alta | Alto | Gate de publicação por PICP (ADR D7); faixa qualitativa como fallback | `[G-13]`, `[G-01, só abstract]` |
| P4 | **Nenhuma janela útil antes de R5** — a previsão só existe quando já não decide nada | Média | Alto | Curva de antecedência como entregável; posicionar o produto por janela, não como "previsão" genérica | `[B-10, só abstract]`, `[B-03, só abstract]`, `[B-15]` |
| P5 | **O *gate* de AOA deixa talhões sem previsão** e o cliente percebe como falha do produto | Média | Médio | Acordar o comportamento antes; explicar "sem suporte" como proteção, não como ausência | `[C-04]`, `[C-05]` |
| P6 | **O erro do alvo é o teto invisível** — investe-se em modelo quando o problema é o mapa de colheita | Alta | Alto | Quantificar e reportar o erro do alvo junto do RMSE; auditar `colheita.py` contra Moran local | `[H-12]`, `[H-13]`, `[H-14, só abstract]` |
| P7 | **Ano extremo destrói a previsão justamente quando ela mais vale** | Média | Alto | Classificar cada safra no relatório; *gate* de AOA para safra fora do domínio; não prometer desempenho em ano atípico | `[A-03]`, `[C-11]`, `[D-12]` |
| P8 | **Nuvem inviabiliza as janelas** na safra de verão | Média | Médio | Janelas por DAS com número de cenas registrado; SAR/HLS como decisão adiada com gatilho | `[B-12]` (40–70% de nuvem no Paraná, 4–10 imagens/talhão) |
| P9 | **Dependência nova quebra ou desacelera o build pinado** | Média | Médio | Separar `requirements-train.txt`; manter o backend de produção sem bibliotecas de ML enquanto a inferência for pré-computada | comentário do próprio `requirements.txt` |
| P10 | **O modelo de negócio B2C puro de previsão não se sustenta** | Média | Médio | Tratar a previsão como funcionalidade de uma plataforma que já entrega valor (fertilidade, zonas, CEa), não como produto isolado; avaliar B2B adjacente | `[F-comercial-10]` (Farmers Edge→Corvian), `[F-comercial-18]` (Gro Intelligence, encerrada), `[F-comercial-19]` (Descartes Labs, descontinuado como serviço aberto) |
| P11 | **Expectativa interna de que solo/CEa vão melhorar muito a previsão** | Alta | Médio | Comunicar o resultado negativo de `[C-11]` **antes** do experimento; a ablação decide | `[C-11]`, `[D-01, só abstract]` |
| P12 | **Promessa comercial de precisão acima do que a validação sustenta** | Média | Alto | Nenhum número de marketing sem escala + validação na mesma frase; nenhuma comparação com métrica de outro estudo de escala diferente | `[B-04, só abstract]` (r² 0,31 → 0,69 só mudando a escala) |

---

## 14. Sequência de entrega em fases (alinhada ao roadmap da seção 51)

| Fase | Etapas do roadmap | Entregável | Depende de | Classificação predominante |
|---|---|---|---|---|
| **F0 — concluída** | 1, 2 | Revisão de literatura, benchmarks, fontes de dados, riscos, ADR-001, este documento | — | — |
| **F1 — inventário e alvo** | **3, 4** | Inventário real de talhões-safra de soja com mapa de colheita; reprocessamento de `colheita.py` gerando **os dois alvos** (`yield_sem_ajuste` / `yield_ajustado`); log de % removido por estágio; auditoria contra Moran local; estimativa do **erro do alvo**; fixação dos limiares de K2/S7 com a agronomia | `colheita.py` | `reusa` + `novo_barato` |
| **F2 — grid e features** | **5, 6** | Grid de 20 m com origem estável por talhão; montagem do dataset com `data_previsao` por linha e lineage completo; tabela Parquet; **suíte anti-vazamento A1/B1/B2/B3/D3 rodando** | F1, `interp.py`, `msr.py`, `mde.py` | `novo_barato` |
| **F3 — baselines e validação** | **7, 9, 10** | Baseline 0 e 1; GroupKFold por talhão, LOFO, LOYO, fazenda externa; *gap* random−LOFO medido; AOA/DI | F2 | `novo_barato` |
| **F4 — modelos e ablação** | **8** | RF / XGBoost / LightGBM / SVR / PLSR / Extra Trees (+CatBoost) sob CV aninhada; **ablação da seção 31**; comparação global × fazenda × talhão (ADR D9, item 2); **curva de antecedência por janela de DAS**. O **GWRFR é a linha 9 da tabela de D1 e está *dentro* da validação oficial**, com prioridade baixa. Fora da validação oficial, como experimentos à parte: a regression-kriging da linha 8 e o offset de "resíduo persistente" sob LOYO (ADR D9, item 2-bis(b)) | F3 | `novo_barato` + `reusa` (pykrige) |
| **F5 — incerteza e explicabilidade** | **11** | QRF / conformal calibrado por talhão; PICP/PINAW; TreeSHAP agregado sobre *folds*; ALE | F4 | `novo_barato` |
| **F6 — mapas e decisão de viabilidade** | **12** | Os cinco mapas (previsto, incerteza, fatores, real, erro); Moran's I dos resíduos; **avaliação dos *kill criteria* K1–K6** | F5 | `novo_barato` |
| **F7 — MVP** | **13** | Job de inferência em lote no padrão de `agenda.py`; artefato de modelo versionado; gravação dos grids no padrão `inv_mapas_fert` | F6 aprovado | `reusa` + `novo_barato` |
| **F8 — API** | **14** | Rotas de leitura (§11), sem cálculo síncrono | F7 | `reusa` |
| **F9 — integração na plataforma** | **15** | Tela de Predição de Produtividade (§12), com os dois modos de confiança | F8 | `novo_barato` |

**`[DECISÃO → ADR-001 D10]` F6 é um portão, não uma etapa.** Se os *kill criteria* do ADR D10 dispararem em F6, o projeto **não** avança para F7: registra a conclusão negativa como resultado acadêmico (seção 60) e reabre o ADR pelas rotas de continuação ali listadas. Planejar a parada é o que torna a conclusão negativa publicável em vez de constrangedora.

---

## 15. Resumo das recomendações, por classificação

### `reusa` — aproveita o que já existe

| # | Recomendação |
|---|---|
| R1 | Manter `msr.py` / `cbers.py` / `agenda.py` como fonte espectral; o catálogo `indices.py` já cobre os índices da seção 23 e mais |
| R2 | Manter `colheita.py` como produtor do alvo, com o ajuste à média **preservado** no pipeline de produção |
| R3 | Manter `interp.py` como motor de grid (krigagem e IDW) e reusar seu variograma para dimensionar blocos de validação |
| R4 | Manter `mde.py` como fonte de relevo — o modo `auto` já usa **Copernicus DEM GLO-30 `[FD-21]` como primário**, com fallback NASADEM/SRTM; a única avaliação pendente é trocar os tiles skadi pelo produto NASADEM oficial `[FD-24]` como fallback (§10) |
| R5 | Reusar CEa e fertilidade krigada como features candidatas (sujeitas à ablação) |
| R6 | **`pykrige` na análise espacial do erro** — variograma para dimensionar blocos de validação e *bootstrap* por bloco (D7), krigagem de resíduo **pós-colheita** para a camada `erro` e para completar talhão parcialmente colhido (ADR D9, item 2-bis(a)). **Não** entra no caminho de previsão pré-colheita: em `[H-04]` o agregado é observado, aqui não é `[HIPÓTESE]` quanto ao uso (b) |
| R7 | Reusar o **desenho** de `agenda.py` (thread + trava em linha + progresso por unidade + opt-in) para o job de inferência |
| R8 | Reusar o padrão `inv_mapas_fert` (grid gzip por talhão, namespace versionado) para servir as camadas de produtividade |
| R9 | Reusar o padrão de versões do módulo de Condutividade (versões + versão oficial, nunca sobrescrever sem confirmação) |
| R10 | Reusar o envelope de resposta (bounds + grid Float32 b64 + stats) nas novas rotas |
| R11 | Reusar o padrão `X-Api-Key` de `/msr-agenda-rodar` para qualquer rota que **escreva** |

### `novo_barato` — CPU-only, leve, sem infraestrutura nova

| # | Recomendação |
|---|---|
| N1 | `scikit-learn`, `xgboost`, `lightgbm` (+`catboost` opcional) — **fora** do `requirements.txt` de produção enquanto a inferência for pré-computada |
| N2 | `pandas` + `pyarrow` e tabela de features em **Parquet particionado** |
| N3 | `shap` (TreeSHAP) e ALE — **só offline/job** |
| N4 | `quantile-forest` **ou** `MAPIE`/`crepes` — escolher um após o experimento |
| N5 | AOA / índice de dissimilaridade em `numpy`/`scipy`, como *gate* de exibição |
| N6 | Índice de Moran (global e local) em `numpy`/`scipy` — serve tanto para auditar `colheita.py` quanto para a análise espacial do erro |
| N7 | Suíte anti-vazamento em `pytest`, bloqueante |
| N8 | Esquema de lineage e tabelas de versionamento/monitoramento no Postgres |
| N9 | Ingestão de clima: NASA POWER `[FD-14]` para protótipo, AgERA5 `[FD-13]` via `cdsapi` para operação |
| N10 | Dois modos de confiança na interface (numérico e qualitativo), alternando por dado |

### `infra_nova` — fora do MVP

| # | Item | Por quê |
|---|---|---|
| I1 | GPU, PyTorch/TensorFlow e todo Deep Learning | ADR D1: nenhuma das três condições (volume / série longa / imagem por parcela) é atendida |
| I2 | Crop model acoplado (APSIM/CROPGRO/SCYM) | ADR D1; ganho de `[A-03]` medido com clima real do ano-teste |
| I3 | Pipeline SAR (Sentinel-1, backscatter/speckle) | decisão adiada A1 do ADR, com gatilho de cobertura de nuvem |
| I4 | PlanetScope 3 m `[FD-08]` | licença comercial por área; e mais fino ≠ melhor `[B-05]`, `[B-08, só abstract]` |
| I5 | PostGIS | decisão adiada A8; nenhuma consulta espacial entre talhões no caminho da requisição |
| I6 | Feature store gerenciada | decisão adiada A7; sem consumidor hoje |
| I7 | `geopandas` | arrasta GDAL/fiona/pyproj para o mesmo processo que já fragmenta memória; `shapely` + `rasterio` cobrem o necessário |
| I8 | `cfgrib`/`eccodes` (MERGE/CPTEC `[FD-19]`) | dependência binária pesada para ganho marginal sobre AgERA5 |
| I9 | Hardware próprio de sensoriamento (drone, robô) | `[F-comercial-09]`, `[F-comercial-13]`, `[F-comercial-22]`; a plataforma opera com satélite de terceiros |

---

## 16. Limitações deste documento

1. **Nada aqui foi implementado nem medido.** As afirmações sobre o que o backend aguenta vêm dos comentários e limites escritos no próprio código (`interp.py`, `render.yaml`, `agenda.py`), não de teste de carga. Um *benchmark* real do job de inferência é trabalho da F7.
2. **O volume real de dados não é conhecido.** Todo o dimensionamento parte de "20–100 talhões-safra" informado pelo usuário; a Etapa 3 do roadmap pode mudar a ordem de grandeza e, com ela, várias recomendações.
3. **Não há object storage declarado no repositório.** A recomendação de Parquet em object storage é condicional a essa disponibilidade; o fallback (diretório versionado + checksum) é explicitamente provisório.
4. **O contrato de API é esboço para discussão**, não especificação. Nomes de campo, paginação, autenticação e erros precisam passar pelo padrão real da plataforma.
5. **A tela desenhada em §12 é esquema funcional, não design.** Ela fixa quais informações são obrigatórias e quais são proibidas, não a aparência.
6. **`[LACUNA]` Nenhum estudo da base revisada descreve uma arquitetura de produção para predição intra-talhão** — as recomendações de engenharia deste documento são derivadas da restrição real da plataforma e dos riscos metodológicos documentados, não de precedente na literatura. Do lado comercial, nenhuma das 32 soluções revisadas publica sua arquitetura.
7. **Nenhuma recomendação deste documento é, ainda, uma decisão registrada.** Tudo o que está marcado `[RECOMENDAÇÃO — a formalizar em ADR]` carece de alternativas e evidências no formato exigido pelas seções 20 e 46 do pedido. A §17 diz qual ADR fecha cada uma.

---

## 17. ADRs a abrir na Fase 2

A seção 46 do pedido original propõe cinco ADRs: `ADR-001-grid-resolution`, `ADR-002-satellite-source`, `ADR-003-validation-method`, `ADR-004-model-family`, `ADR-005-feature-store`. **A numeração literal não é utilizável** porque a seção 56 exigiu que o ADR desta fase se chamasse `ADR-001-model-strategy`, e ele já **decide** três dos cinco temas. Para evitar colisão, a proposta é manter `ADR-001-model-strategy` e abrir a sequência a partir de `ADR-002`, registrando a correspondência:

| Tema da seção 46 | Onde está / vai estar |
|---|---|
| `ADR-001-grid-resolution` | **já decidido** em `ADR-001-model-strategy`, **D3** (célula de 20 m; 10 m e 30 m como experimento de sensibilidade) |
| `ADR-003-validation-method` | **já decidido** em `ADR-001-model-strategy`, **D5** (GroupKFold por talhão como oficial) |
| `ADR-004-model-family` | **já decidido** em `ADR-001-model-strategy`, **D1** (família de árvores + PLSR/SVR; DL e crop model fora, com critério de reentrada) |
| `ADR-002-satellite-source` | a abrir — mantém o nome e o número da seção 46 |
| `ADR-005-feature-store` | a abrir como **`ADR-003-feature-store`** (renumerado; o número 005 fica livre) |

**Sequência proposta, sem colisão.** Cada linha consolida as recomendações deste documento marcadas `[RECOMENDAÇÃO — a formalizar em ADR]`:

| ADR a abrir | Escopo | Recomendações que consolida | Gatilho |
|---|---|---|---|
| **`ADR-002-satellite-source`** | quais fontes de imagem e de clima ingerir e em que ordem | §10 (NASA POWER → AgERA5 → BR-DWGD); HLS `[FD-04]` e Sentinel-1 `[FD-06]` (decisões adiadas A1/A2 do ADR-001); fallback de DEM (§10, nota) | antes da Etapa 6 (feature engineering), porque define quais colunas existem |
| **`ADR-003-feature-store`** | armazenamento de features e de camadas | §4.1, §4.2 (Parquet particionado vs. Postgres vs. grid gzip), §4.3 (PostGIS: não), §9 (feature store: depois) — decisões adiadas A7 e A8 do ADR-001 | antes da Etapa 6 |
| **`ADR-004-build-dependencies`** | separação `backend/requirements.txt` × `requirements-train.txt` e regras de mudança do build pinado | §3.1, §3.3, e a exclusão de `geopandas`/`optuna`/`cfgrib` da §3.2 | antes de a primeira dependência de ML entrar no repositório |
| **`ADR-005-data-lineage`** | identificadores obrigatórios e *lineage* por feature | §5.1, §5.2 (incluindo `derivada_do_alvo`, `janela_fim`, `pontos_origem`, `densidade_amostral`, `variancia_predicao`) | antes da Etapa 6 — é pré-requisito dos testes A1/B3/D3 |
| **`ADR-006-model-registry`** | versionamento de modelos, monitoramento, *drift* e gatilho de re-treino | §6, §7 | antes da Etapa 13 (MVP em produção) |
| **`ADR-007-inference-job`** | onde treinar vs. onde inferir e o desenho do job de inferência em lote | §2.2 (aplicação de D1/D8), §2.4 (desenho de `agenda.py`) | antes da Etapa 13 |
| **`ADR-008-api-contract`** | contrato das rotas `/yield/*` | §11.1, §11.2, §11.3 | antes da Etapa 14 |
| **`ADR-009-uncertainty-ui`** | como a interface comunica incerteza e atribuição | §12.1, §12.2 (operacionalização de D7 e D8 em regras de renderização) | antes da Etapa 15 |

**Regra de convivência de identificadores.** `D1…D10` são decisões do `ADR-001-model-strategy`; `A1…A11` são as decisões adiadas do mesmo ADR; `ADR-002…ADR-009` são documentos futuros. Nenhum deles é `paper_id` — e `[D-01]…[D-12]` **são** papers da base, razão pela qual as decisões nunca aparecem entre colchetes neste projeto.
