# Pendência 20 — Importação de dados fitotécnicos por planilha Excel

Plano de implementação. Complementa o lançamento em massa: em vez de digitar
talhão a talhão, o usuário solta a planilha do cliente e resolve as pendências
num painel de conferência.

Planilha de referência: `Planilha de Insumos Sementes` — 592 linhas, safra
2026/2027, 61 produtores, 114 fazendas, 581 talhões, 49 cultivares.

---

## 1. O que a planilha traz (colunas amarelas)

| Col | Cabeçalho | Distintos | Destino na plataforma |
|-----|-----------|----------:|-----------------------|
| A | SAFRA | 1 (`2026/2027`) | `Safra` — existe (`26/27`) |
| D | PRODUTOR | 61 | `Cliente` — existe |
| F | FAZENDA | 114 | `Fazenda` — existe |
| J | TALHÃO | 581 | `Talhao` — existe |
| K | ÁREA | — | **não tem onde gravar hoje** |
| M | CULTURA | 4 | **subcultura não existe** |
| S | PROPÓSITO | 4 | **não existe** |
| T | CULTIVAR | 49 | **não existe como cadastro** |

Colunas não-amarelas que **precisam ser lidas mesmo assim** (não são gravadas,
são desempate):

- **AI `PLANTIO/REPLANTIO`** — vale `PLANTIO` (591) ou `CONSÓRCIO` (1). É o que
  separa *talhão subdividido* de *consórcio*: em `CKLBV 10 a` há duas linhas com
  a **mesma área** (36,49 ha), milho + braquiária. Sem essa coluna o importador
  somaria 72,98 ha num talhão de 36,49.
- **E `NR. MATRÍCULA`** — confirma o produtor quando o nome está ambíguo.
- **B `TIPO SAFRA`** e **L `DT. RET.`** — a data dá a época (verão/safrinha).

---

## 2. Três premissas do pedido que não se sustentam no código

Levantado por varredura completa de `src/`. São achados que mudam o tamanho da
obra — não dá para "só trazer para o AP" porque o destino não existe.

### 2.1 Subcultura não existe

Não há `subcultura`, `sub-cultura` nem `espécie` em lugar nenhum do repositório.
O que existe é **um nível só**, constante fixa em `src/lib/store.ts:109`:

```ts
export const CULTURAS = ['Soja','Milho','Trigo','Feijão','Algodão','Aveia','Sorgo','Cevada','Pastagem','Outra'];
```

`SOJA TRANSGENICA` e `MILHO TRANSGENICO` são **mais granulares** que qualquer
coisa que a plataforma guarda. Hoje só caberia jogando fora o "TRANSGENICA".

Pior: há **três listas de cultura divergentes** no código —
`store.ts:109` (capitalizada, com acento), `ProdutividadeSection.tsx:60`
(minúscula, sem acento, sem Feijão) e `safras/page.tsx:12` (mock). A ponte entre
as duas primeiras tem bug de acento em `ProdutividadeSection.tsx:99`: `'Feijão'`
→ `'feijão'` não casa `'feijao'`, e a Produtividade cai calada para `'soja'`.

### 2.2 Propósito não existe

Zero ocorrências como campo de dado. As ~25 ocorrências de "propósito" em `src/`
são a expressão portuguesa "de propósito" em comentários. `silagem` não aparece
nenhuma vez no repositório.

### 2.3 Cultivar não tem cadastro

É texto livre em dois lugares desconexos, sem id, sem catálogo, sem apelido:

```ts
// src/lib/insumos.ts:62   (Biblioteca → Insumos → categoria 'semente')
cultivar?: string;
// src/lib/prescricao/tipos.ts:57
cultivar?: string;
// src/lib/prescricao/resumo.ts:141
// cultivar é texto livre do usuário, então passa por aqui.
```

Sem catálogo não há onde guardar que `55I57RSF IPRO` **é** `Brasmax Zeus IPRO` —
que é exatamente o item 6 do pedido.

### 2.4 Dois efeitos colaterais

- **Grupo de produtores não existe.** Nem condomínio, nem grupo familiar, nem
  matriz/filial. `Cliente` é entidade plana; a única aresta que sai dela é
  `Fazenda.clienteId`. O item 1 do pedido depende de criar isso.
- **`Plantio` é um por `(talhaoId, safra)`** (`store.ts:118`, upsert que
  sobrescreve). Não cabe consórcio, não cabe talhão subdividido com dois
  cultivares, não cabe safrinha. A planilha tem os três casos.

**Consequência:** antes de importar é preciso construir o domínio. É a maior
parte do trabalho, e é reaproveitável muito além desta planilha.

---

## 3. Calibração contra o cadastro real

Rodado contra o Supabase de produção (somente leitura, autorizado):
**75 produtores, 175 fazendas, 1.060 talhões, 7 safras, 1 plantio.**

Taxa de casamento das 592 linhas, medida — não estimada. A última linha é a
**implementação TypeScript real** (`src/lib/importacao/`), não um protótipo:

| Algoritmo | Linha 100% automática até o talhão |
|-----------|-----------------------------------:|
| Casamento ingênuo (igualdade de string normalizada) | **36,5%** |
| + núcleo da fazenda (ignorar `FAZENDA`/`CHÁCARA`/`SÍTIO`/`ESTÂNCIA`) | 54,9% |
| + tolerância a erro de digitação nos tokens do nome | 56,4% |
| + contenção de tokens no nome da fazenda | 62,0% |
| + nome cortado no campo de 33 do ERP | 62,5% |
| **`lib/importacao` como está no código** | **62,5%** |
| Considerando só linhas cujo produtor já existe (446) | **83,0%** |

Custo: **68 ms** para as 592 linhas (0,11 ms/linha) contra o cadastro inteiro.
A tela pode recalcular tudo a cada confirmação sem estratégia de cache.

Onde param as 592 linhas, com o código atual:

| | automático | a confirmar |
|---|---:|---:|
| Produtor | 446 (exato 357 · tokens 72 · cortado 17) | 146 sem cadastro |
| Fazenda | 429 (núcleo 309 · contido 78 · exato 42) | 17 sem cadastro |
| Talhão | 370 (exato 352 · canônico 18) | 59 (subdivisão 22 · sem match 28 · similar 4 · ambíguo 3 · agregado 2) |

### O que cada regra comprou

1. **Núcleo da fazenda (+18,4 pontos).** O cadastro guarda `SANTA TEREZINHA`; a
   planilha traz `FAZENDA SANTA TEREZINHA-12208`. Sozinha, essa regra recuperou
   217 linhas que o casamento ingênuo descartava.
2. **Contenção de tokens no nome da fazenda (+5,6 pontos).** Substituiu a
   similaridade solta e é melhor em tudo: `FAZENDA ROSEIRA / BOM SUCESSO` contém
   `BOM SUCESSO`; `CHACARA TAINHA/LAGOA` contém `TAINHA`; `PIERRE BILLARD`
   contém `BILLARD`. Fazendas a cadastrar caíram de 41 linhas para 17. Só vale
   com **um único** candidato — dois nomes que se contêm viram confirmação.
3. **Tolerância a digitação (+1,5 ponto), mas bem estreita.** O cadastro tem
   `DANIELLLE NEVES HILGEMBERG` com três Ls. A primeira versão — "1 erro de
   Levenshtein em tokens de 5+ letras" — resolvia esse caso e, de quebra, casava
   automaticamente `MARIO`×`MARIA`, `PAULO`×`PAULA`, `DANIEL`×`DANIELA`,
   `MEIJER`×`MEIJERS` e `PAULS`×`PAULUS`. Em português a última letra É o gênero;
   em holandês o S final É outro sobrenome. A regra final exige **7 letras, as 5
   primeiras iguais e a MESMA última letra** — `DANIELLE` passa, os pares acima
   não.
4. **Nome cortado no campo do ERP (+0,5 ponto, 17 linhas).** Nenhum nome da
   planilha passa de **33 caracteres**, e exatamente três produtores e três
   fazendas param em 33 cravados: `A.S. EMPREENDIMENTOS AGROPECUARIO`,
   `ESTANCIA PORTAL DO VENTO AGROPECU`, `AGROPECUARIA VAN DEN BOOGAARD LTD`,
   `FAZENDA SERRA DO GALVAO / AGUA CU`. Não é coincidência — é a largura do
   campo. O cadastro tem `…AGROPECUARIOS`, com S, que a regra de digitação
   rejeita de propósito. Quando o nome da planilha bate no teto e o do cadastro
   **começa exatamente com ele**, é corte, não outro nome.
5. **Regra de identidade de pessoa (evita erro grave).** O casamento por
   similaridade bruta casava `THIAGO AARDOON VAN DEN BOOGAARD` com
   `LUCIANO AARDOON VAN DEN BOOGAARD` a 0,87 — pessoas diferentes da mesma
   família. A regra adotada: **primeiro nome e último sobrenome têm de casar**
   (aceitando inicial abreviada, `RAPHAEL C. HOOGERHEIDE` ≡ `RAPHAEL CORNELIS
   HOOGERHEIDE`); partículas (`DE`, `DA`, `VAN`, `DEN`, `LTDA`) não contam.
   Com ela, Thiago cai corretamente em "cadastrar", não em "casado errado".

   Mas essa trava não basta numa colônia holandesa, onde os irmãos compartilham
   primeiro nome e sobrenome: `GERRIT JAN LOS` × `GERRIT PIETER LOS` dava
   exatamente o mesmo 2/3 de `GERRIT LOS` × `GERRIT JAN LOS` — o primeiro par são
   duas pessoas, o segundo é a mesma com o cadastro incompleto. A regra que os
   separa: **token sobrando dos DOIS lados é contradição, não omissão**, e
   contradição nunca grava sozinha.

### O gargalo real

**24,7% das linhas param no produtor** — 22 produtores da planilha não existem no
cadastro. Não é problema de algoritmo, é lacuna de cadastro:

```
AFFONSO CESAR AARDOOM · AGRO PAULS LTDA · AGROPECUARIA VAN DEN BOOGAARD LTD
ALYSSON GOMES BONAWITZ · ANDRE DE GEUS CERVI · ANDRE SCHMIDT DE SOUZA
ANTONIO VICENTIM NETO · CRISTINA OTTILIA SCHMIDT · DAVID NOLTE
ELISA ALEXANDRINA EIKELENBOOM · ESTANCIA PORTAL DO VENTO AGROPECU
ISABELLE DE GEUS LARA · KRYSTIAN LEONARDO HARMS · LUCIANNE BARROS CORREIA MANSANI
LUIZ UBIRAJARA GOMES DA SILVA · MORRO CHATO AGROPECUARIA LTDA
NICOLE BODERA DE ALBUQUERQUE · RONILDA GOMES BONAWITZ · SOLANGE SELY GRILLO HARMS
THIAGO AARDOON VAN DEN BOOGAARD · VICTOR AUGUSTO AARDOOM · VITOR SIJMEN EIKELENBOOM
```

Cada produtor cadastrado destrava em média **6,6 linhas** (146 ÷ 22), e os
maiores valem muito mais: Morro Chato sozinho destrava 30 linhas, A.S.
Empreendimentos e Isabelle de Geus 17 cada. Daí o **pré-voo** da seção 6.1:
resolver os 22 antes de abrir a tabela, não linha a linha.

Depois deles, o que sobra é pequeno: **17 linhas** de fazenda a cadastrar (7
fazendas) e **58 linhas** de talhão a resolver — 25 subdivisões (que a seção 6.3
resolve em bloco), 28 talhões novos, 4 parecidos e 1 agregado.

---

## 4. Evidência de campo — os casos que a planilha realmente tem

### 4.1 Grupo / condomínio (item 1)

`FAZENDA 4E-281611` é de **Rodrigo de Geus Cervi**, `FAZENDA 4E-281613` é de
**Thiago Aardoon van den Boogaard** — mesmo nome de fazenda, ids diferentes, e a
sigla de talhão `RGC4E` é **compartilhada**: `RGC4E 18 a` é de um, `RGC4E 18 b` é
do outro. Sem o conceito de grupo, o casamento por sigla erra o dono.

Onze núcleos de nome de fazenda se repetem entre produtores diferentes
(`4E`, `SANTO ANDRE`, `CRISTALINA I`, `SANTA TEREZINHA`, `PEREIRA`, `TABATINGA`,
`SANTA ROSA`, `CRISTINA`, `BELA VISTA`, `GABRIELE`, `AURORA`) — é por isso que a
fazenda é procurada **dentro do produtor**, nunca no cadastro inteiro.

Sete siglas de talhão são compartilhadas por mais de um produtor:

| Sigla | Produtores |
|-------|-----------|
| `EPACR` | AGRO PAULS LTDA · ERNST PAULS |
| `HAHSR` | ESTANCIA PORTAL DO VENTO · HENRIQUE ANTON HARMS |
| `IGEFI` | DAVID NOLTE · ISABELLE DE GEUS LARA · MARIO DYKSTRA |
| `MGEPE` / `MGESA` | ELISA · VITOR SIJMEN EIKELENBOOM |
| `RGC4E` | RODRIGO DE GEUS CERVI · THIAGO AARDOON VAN DEN BOOGAARD |
| `SGHGA` | KRYSTIAN LEONARDO HARMS · SOLANGE SELY GRILLO HARMS |

E oito nomes-base de fazenda repetem entre produtores distintos
(`AGRO FAZENDA PEREIRA`, `CHACARA CRISTINA`, `FAZENDA 4E`, `FAZENDA CRISTALINA I`,
`FAZENDA SANTA ROSA`, `FAZENDA SANTA TEREZINHA`, `FAZENDA SANTO ANDRE`,
`FAZENDA TABATINGA`) — todos candidatos a grupo.

### 4.2 Nome de talhão (item 3)

| Classe | Linhas | % | Exemplo |
|--------|-------:|--:|---------|
| Limpo `SIGLA NN` | 487 | 82,3% | `GJGCC 01` |
| Sufixo de letra (subdivisão) | 60 | 10,1% | `CFMMB 04 A`, `DNHDV 09a`, `CKLBV 10 a` |
| Apelido (hífen ou parênteses) | 33 | 5,6% | `LFAIC 02 - Ilha`, `LUGCG 01 (Mauri)` |
| Agregado (1 linha → N talhões) | 10 | 1,7% | `GSLTA 01 E 02`, `MGEPE 1-2` |
| Sem número | 2 | 0,3% | `GVBIPE`, `GJGSM ABERTURA` |

Casos que exigem regra específica:

- **Sufixo colado, separado, maiúsculo e minúsculo, na mesma fazenda**:
  `GJGCC 05A` e `GJGCC 08 a` convivem.
- **Dois níveis de sufixo**: `GJGCC 09A a` / `GJGCC 09A b`.
- **Três partes com uma quarta entre elas**: `MCACA 07A` (109,87) ·
  `MCACA 07AB` (15,76) · `MCACA 07B` (66,89).
- **Zero-padding inconsistente**: `MGEPE 1-2` ao lado de `MGEPE 01`.
- **Sem número**: `GVBIPE`.

### 4.3 Subdivisão × consórcio (item 7)

11 combinações `produtor+fazenda+talhão` aparecem em mais de uma linha. A
distinção é pela **área** e pela coluna AI:

São **três** situações, não duas — e essa foi a descoberta que mudou o desenho:

| Situação | Sinal | Quantos dos 11 | Exemplo |
|----------|-------|---------------:|---------|
| **Consórcio** | AI=`CONSÓRCIO`, ou culturas diferentes na mesma área | 1 | `CKLBV 10 a`: milho + braquiária, 36,49 nas duas |
| **Partes** | áreas diferentes **e** cultura ou cultivar diferentes | 5 | `FCDPI 01`: 71,53 + 3,70, dois cultivares |
| **Ambíguo** | cultura, cultivar, propósito, data e população **idênticos**, só a área muda | 5 | `IGEFI 02`: 91,60 + 20,00 |

Os cinco ambíguos têm todos uma das áreas em exatos **20,00 ha**, com a semente
calculada em cima desses 20 ha — parecem duas remessas do mesmo pedido, não um
talhão partido. Somar lançaria 111,60 ha num talhão que a outra linha diz ter
91,60; em `RBRDG 08` a "parte" de 20,00 ha é *maior* que a outra parte inteira
(17,77). A planilha não decide isso, então o importador também não decide: a
terceira resposta é `'ambiguo'` e a tela pergunta.

**Colisão de chave que quase passou.** `MCALN 01 E 02` (123,28 ha) e `MCALN 01`
(184,05 ha) são linhas distintas da mesma fazenda. Se a chave canônica de um
agregado usar só o primeiro número, as duas viram `MCALN 01` e qualquer
agrupamento lança **307,33 ha num talhão de 184,05**, calado. É o único agregado
da planilha cujas partes também aparecem sozinhas — e por isso a base de um nome
agregado carrega todos os números (`MCALN 01+02`).

23 bases de talhão vêm subdivididas com sufixo de letra — ex.: `HABPU 02 a`
(20,76) + `HABPU 02 b` (76,90) = 97,66 ha, contra um único `HABPU 02` no
cadastro.

### 4.4 Cultivar (item 6)

Dois padrões dão ganho imediato, sem o usuário digitar nada:

- **Nome comercial já entre parênteses** — `DP155100886 (P25300PWU)` e
  `7602PRO4 (AS 1901 PRO4)`. Extrair o parêntese resolve sozinho.
- **Prefixo de marca reconhecível** — `AG…` (Agroceres), `DKB…` (Dekalb),
  `AS…` (Agroeste), `B…PWU` (Brevant), `SS…` (Syngenta), `IPR…` (IAPAR),
  `IAC…`, `NS…` (Nidera), `BRS…` (Embrapa). Serve para **pré-preencher a
  marca** no cadastro novo, não para adivinhar o nome.

O resto (`55I57RSF IPRO` → `Brasmax Zeus IPRO`) **não pode ser adivinhado** —
errar o nome do cultivar é pior que não ter. A solução é o dicionário da
seção 5.3: o usuário confirma **uma vez**, fica gravado como sinônimo, e a
próxima planilha casa sozinha.

---

## 5. Arquitetura

### 5.1 Entidades novas (Biblioteca)

A Biblioteca (`src/lib/biblioteca.ts`) já resolve id, nome, escopo
(`'meu'`/`'empresa'`), versão e sync. Cinco categorias novas, todas com
`sinonimos: string[]` — é esse campo que faz o sistema aprender.

```ts
// src/lib/biblioteca.ts — categorias novas
ConteudoCultura   { culturaPaiId?: string; sinonimos: string[]; ativo: boolean }
ConteudoProposito { equivaleAGrao: boolean; sinonimos: string[]; ativo: boolean }
ConteudoCultivar  { culturaId?: string; marca?: string; tecnologia?: string;
                    siglas: string[]; sinonimos: string[]; ativo: boolean }
ConteudoGrupo     { tipo: 'condominio'|'familiar'|'economico'; membros: string[] }
```

**Hierarquia Cultura → Subcultura** via `culturaPaiId`. A planilha casa na
**subcultura**; a cultura-pai é derivada. Semeadura inicial:

```
Soja  → Soja Transgênica   (sinônimos: SOJA TRANSGENICA, SOJA RR, SOJA IPRO)
      → Soja Convencional
Milho → Milho Transgênico  (sinônimos: MILHO TRANSGENICO, MILHO BT)
      → Milho Convencional
Feijão · Braquiária · Trigo · Aveia · …
```

`CULTURAS` de `store.ts:109` vira wrapper de retrocompatibilidade sobre o
catálogo — mesmo padrão já usado quando `Safra` virou item de Biblioteca
(`store.ts:1043`). Isso **também corrige o bug de acento** de
`ProdutividadeSection.tsx:99`, porque passa a existir uma lista só.

**Propósito** semeado com `equivaleAGrao`, atendendo o item 5:

| Nome | equivaleAGrao |
|------|:-------------:|
| Produção de Grãos | ✅ |
| Campo de Semente-UBS | ✅ |
| Silagem Planta Inteira | ❌ |
| Cobertura | ❌ |

**Grupo** com `Cliente.grupoId?: string` no lado do produtor. Resolve o caso
`RGC4E`: sigla compartilhada dentro do grupo deixa de ser ambiguidade e passa a
ser candidata legítima, com o dono decidido pela fazenda.

### 5.2 Entidade `Cultivo` — o registro fitotécnico

`Plantio` fica intocado (nove pontos de leitura dependem dele). `Cultivo` é o
registro rico, e `getPlantio()` passa a derivar dele.

```ts
export interface Cultivo {
  id: string;
  talhaoId: string;
  safra: string;                 // "26/27"
  epoca: 'verao' | 'safrinha' | 'inverno' | '';
  ordem: number;                 // 1 = principal; 2+ = consórcio na mesma área
  parteRotulo?: string;          // "a", "B", "AB" — subdivisão do talhão
  culturaId: string;             // subcultura
  cultivarId?: string;
  propositoId?: string;
  areaHa?: number;               // área DECLARADA (planilha) — nunca sobrescreve Talhao.areaHa
  dataPlantio?: string;
  origem: 'manual' | 'importacao';
  importacaoId?: string;         // rastreabilidade
  criadoEm: string;
}
```

Chave de unicidade: `(talhaoId, safra, epoca, parteRotulo, ordem)`. É o que
permite representar, ao mesmo tempo:

- `HABPU 02 a` e `HABPU 02 b` — mesmo talhão, `parteRotulo` diferente;
- `CKLBV 10 a` milho + braquiária — mesma parte, `ordem` 1 e 2 (consórcio);
- soja de verão e milho safrinha — `epoca` diferente.

**Área.** `Talhao.areaHa` é geodésica calculada do polígono
(`src/lib/areaGeo.ts`) e **nunca** é digitada — a planilha não a sobrescreve. A
área da planilha vai para `Cultivo.areaHa` como área declarada, e a tela mostra
a divergência quando passar de 2%. Para talhão subdividido, a soma das partes é
conferida contra `Talhao.areaHa` e contra `partesComArea()` (v2.81.0), que já
sabe listar as áreas separadas do multipolígono.

### 5.3 Motor de casamento — `src/lib/importacao/`

Módulos **puros** (sem DOM), testáveis com `node`, seguindo o padrão de
`src/lib/laudo/nucleo.ts`.

```
src/lib/importacao/
  texto.ts        na() · chave() · semSufixoId() · idExterno() · palavras()
                  lev() · similaridade() · tokensCompativeis()      ← ENTREGUE
  identidade.ts   Casamento<T> · Acao · casarProdutor() · casarFazenda()
                  scorePessoa() · nucleoImovel() · tokensImovel()   ← ENTREGUE
  casarTalhao.ts  analisarNomeTalhao() · casarTalhao()
                  classificarRepeticao()                            ← ENTREGUE
  catalogo.ts     casarCatalogo() genérico sobre sinonimos[]
  planilha.ts     lerPlanilhaFitotecnica() — de-para de coluna
  conferencia.ts  montar o plano de importação (linha → resolução)
  aplicar.ts      gravação em lote + relatório
```

`texto.ts` resolve uma dívida real: hoje existem **~20 cópias locais** de
`normalize('NFD')` espalhadas (`laudo/nucleo.ts:73`, `compactacao.ts:17`,
`condutividade.ts:13`, `store.ts:2596`, `store.ts:2677`, `FazendaDetailPanel.tsx:588`…),
cada uma com agressividade própria. As existentes ficam onde estão; o importador
nasce usando a central.

**Cascata de casamento**, do mais forte ao mais fraco. Cada nível registra o
motivo, e o motivo aparece na tela:

A ordem é a que o código executa, e cada resultado devolve o `motivo` e a `acao`:

| # | Regra | `motivo` | `acao` |
|--:|-------|----------|--------|
| 1 | nome idêntico depois de normalizar | `exato` | gravar |
| 2 | apelido/sigla já confirmado antes | `sinonimo` | gravar |
| 3 | nome da planilha cortado em 33, cadastro começa com ele | `truncado` | gravar |
| 4 | **agregado** — a linha cobre vários talhões | `agregado` | **partir** |
| 5 | núcleo do imóvel igual (sem `FAZENDA`/`CHÁCARA`) | `nucleo` | gravar |
| 5 | canônico do talhão igual (zero, letra, espaço, apelido) | `canonico` | gravar |
| 6 | tokens do imóvel contidos, candidato único | `contido` | gravar |
| 7 | tokens da pessoa compatíveis, sem contradição | `tokens` | gravar |
| 8 | base igual, sufixo a mais → subdivisão | `subdivisao` | **partir** |
| 9 | similaridade acima do limiar | `similar` | **confirmar** |
| — | dois candidatos igualmente bons | `ambiguo` | **confirmar** |
| — | nada casa | `nenhum` | **criar** |

O **agregado vem cedo de propósito**: se o canônico rodasse antes, `GSLTA 01 E 02`
casaria com o talhão 01 e o 02 sumiria sem aviso. Nada de `partir` para baixo
grava sozinho. O item 3 do pedido — "tentar o vínculo ou pedir a confirmação
exata" — é exatamente a fronteira 7/8.

**Leitura da planilha.** Reusar `lerArquivo()` de `src/lib/lab.ts:49` (já trata
XLSX/XLS/CSV, encoding windows-1252, `raw:false`) e o de-para por cabeçalho de
`casaCabecalho()`/`completarPorCabecalho()` (`lab.ts:203`/`:232`), incluindo a
lista `SO_EXATO` de substring venenosa. A detecção de coluna por **nome**, não
por posição, é o que faz a planilha do ano que vem funcionar mesmo se as colunas
mudarem de lugar.

### 5.4 Tela — painel de conferência

Overlay **tela cheia** dentro do `SlidePanel`, espelhando o caso `'biblioteca'`
(`SlidePanel.tsx:32-45`). O `SlidePanel` normal tem 300–340px — não comporta a
tabela.

Kit visual: `src/components/panels/acessos/ui.tsx` (`Abas` com contador, `Modal`,
`Botao`, `Chip`, `COR`). **Não usar `src/components/ui/*`** — é scaffolding
shadcn morto, com tokens Tailwind que não conversam com o tema `--invicta-*`.

Tabela modelada em `LabPreviewTable.tsx` — `sticky top-0` no `<thead>`,
`overflow-auto`, semáforo por célula. Cores por status:

```
verde   #4ade80  acao 'gravar'    — resolvido automaticamente
âmbar   #fbbf24  acao 'confirmar' — há candidato, mas alguém tem de olhar
violeta #a78bfa  acao 'partir'    — subdivisão, agregado ou consórcio
vermelho#f87171  acao 'criar'     — não existe no cadastro
cinza             linha excluída da importação
```

O campo `acao` vem do módulo puro, e não de um `switch` na tela: as quatro abas,
as quatro cores e o relatório final leem a mesma fonte. Cada linha traz também
`entrada` (o texto cru da planilha, com o código do cliente), `idExterno` e
`opcoes[]` já ordenadas por nota — sem isso o painel teria de recalcular o que o
casamento acabou de computar.

Estrutura:

```
┌ Importar planilha fitotécnica ─────────────────────────── [X] ┐
│ PRÉ-VOO   592 linhas · 61 produtores · 114 fazendas           │
│  ⚠ 22 produtores sem cadastro (destravam 146 linhas)          │
│  ⚠ 15 fazendas · 55 talhões · 49 cultivares a resolver        │
│  [Resolver produtores em bloco]  [Ir para a tabela]           │
├───────────────────────────────────────────────────────────────┤
│ Abas: Tudo(592) · Automático(350) · Confirmar(96) · Criar(146)│
├───────────────────────────────────────────────────────────────┤
│ ▾ GASPAR JOAO DE GEUS → GASPAR JOÃO DE GEUS ✓          27 lin │
│    ▾ FAZENDA CERRADO CAJURU → CERRADO CAJURU ✓         15 lin │
│       GJGCC 01  52,51  Soja Transg.  Grãos  59IX61RSF…  ✓     │
│       GJGCC 08 a ⚠ subdivisão de GJGCC 08   [confirmar]       │
│ ▾ THIAGO AARDOON VAN DEN BOOGAARD  ✗ sem cadastro      11 lin │
│    [Criar produtor] [Vincular a grupo] [Vincular a existente] │
└───────────────────────────────────────────────────────────────┘
```

**Agrupamento hierárquico Produtor → Fazenda → Talhão** é o que faz o tempo
cair: resolver um produtor resolve as 9,7 linhas dele de uma vez.

**Criar cadastro sem sair da tela** (item 6). O padrão dominante da casa é
formulário inline que troca de lugar com a lista
(`ProdutorDetailPanel.tsx:185-240`), mas aqui a tela já é cheia — então
`Modal` de `acessos/ui.tsx:104`, que já tem backdrop, `maxHeight: 85vh` e
largura configurável. Ao salvar, **volta e vincula sozinho**, sem perder a
posição do scroll. Mesmo componente para produtor, fazenda, talhão, cultura,
cultivar e propósito.

### 5.5 Relatório final e controle

Ao gravar, sai um XLSX no padrão de `src/lib/relatorioConferencia.ts`
(`formatarColunaXlsx` já carimba `z='0.00'` na coluna de área):

| Aba | Conteúdo |
|-----|----------|
| Importado | linha da planilha → talhão/cultivo criado, com o motivo do casamento |
| Não importado | linha, o que faltou, e o que fazer |
| Cadastros criados | produtores/fazendas/talhões/cultivares novos |
| Divergências | área declarada × área do polígono, acima de 2% |

Cada importação vira um registro `ImportacaoFitotecnica { id, arquivo, safra,
quando, quem, linhas, criados, atualizados, ignorados }`, e todo `Cultivo`
carrega `importacaoId`. É o **controle** pedido: dá para auditar e desfazer.

---

## 6. Mecanismos de ganho de tempo

Estes são o objetivo, não efeito colateral.

### 6.1 Pré-voo antes da tabela

Antes de abrir 592 linhas, a tela mostra o agregado e oferece resolver os **22
produtores** em bloco. Isso muda 146 linhas de "bloqueada" para "automática"
antes de qualquer rolagem.

### 6.2 Dicionário que aprende (o multiplicador)

Toda confirmação vira `sinonimos[]`/`siglas[]` no catálogo. `55I57RSF IPRO`
confirmado como `Brasmax Zeus IPRO` **uma vez** faz as 55 linhas dessa planilha e
todas as planilhas futuras casarem no nível 2 — automático. Vale igual para
apelido de fazenda (`ROSEIRA / BOM SUCESSO` → `BOM SUCESSO`) e nome estendido de
talhão (`LFAIC 02 - Ilha` → `LFAIC 02`).

Efeito medido: dos 49 cultivares, 2 se resolvem sozinhos pelo parêntese; os 47
restantes são um esforço **único** que não se repete.

### 6.3 Aplicar a todos os iguais

Confirmar uma resolução oferece "aplicar aos outros N casos idênticos". Todo
casamento devolve uma `chaveDecisao` — para talhão é o canônico, de modo que
`DNHDV 09a` e `DNHDV 09 A` recebem a mesma decisão. As 22 subdivisões por sufixo
de letra seguem a mesma regra: uma decisão resolve as 22.

### 6.4 Regras que já vêm prontas

Núcleo da fazenda, canonicalização de talhão, tolerância a digitação e extração
de parêntese estão medidas na seção 3 e valem **22,6 pontos percentuais** sem
nenhuma intervenção do usuário.

### 6.5 O que continua manual, de propósito

Nome de cultivar que não está no dicionário; vínculo de grupo; linha agregada
(`GSLTA 01 E 02`). Conforme sua decisão: quando não houver nada parecido na base,
**pedir a correspondência ao usuário** — nunca ratear no escuro — e o que não for
resolvido sai no relatório para tratamento manual.

---

## 7. Fases de entrega

Cada fase compila (`npx tsc --noEmit`), versiona e commita. A plataforma fica
utilizável ao fim de cada uma.

| # | Fase | Entrega | Versão |
|---|------|---------|--------|
| 1 | Fundação de texto | `texto.ts` + `identidade.ts` + `casarTalhao.ts` e 86 testes node — **ENTREGUE** | 2.83.0 |
| 2 | Catálogos | Cultura/Subcultura, Propósito, Cultivar na Biblioteca + semeadura + `CULTURAS` como wrapper (corrige o bug de acento) | 2.84.0 |
| 3 | Grupos | `ConteudoGrupo` + `Cliente.grupoId` + UI no painel de produtores | 2.85.0 |
| 4 | Cultivo | Entidade + `getPlantio` derivado + migração dos plantios existentes | 2.86.0 |
| 5 | Leitor + motor | `planilha.ts` + `conferencia.ts` + testes contra a planilha real | 2.87.0 |
| 6 | Painel | Tela cheia, tabela, agrupamento, modais de criação | 2.88.0 |
| 7 | Gravação | `aplicar.ts` em lote + relatório XLSX + registro de importação | 2.89.0 |

Fases 1, 2 e 3 são independentes entre si e podem ser construídas em paralelo.

---

## 8. Critérios de aceite

1. A planilha de referência importa com **≥ 62% das linhas** resolvidas sem
   nenhuma intervenção, e **≥ 83%** depois de cadastrados os 22 produtores.
   (Verificado: 62,5% e 83,0% com `lib/importacao` em 27/08/2026.)
1b. Nenhum casamento automático entre pessoas que diferem só no gênero
   (`MARIO`/`MARIA`), na geração (`OSMAR NETO`/`OSMAR`) ou no nome do meio
   (`GERRIT JAN LOS`/`GERRIT PIETER LOS`).
2. Nenhum casamento automático de produtor com primeiro nome ou último sobrenome
   diferente. `THIAGO` nunca casa com `LUCIANO`.
3. `CKLBV 10 a` grava **dois** cultivos de 36,49 ha (consórcio), não um de 72,98.
   E `MCALN 01 E 02` nunca é confundido com `MCALN 01`.
4. `HABPU 02 a` + `HABPU 02 b` gravam duas partes cuja soma (97,66) é conferida
   contra a área do talhão no cadastro.
5. `Talhao.areaHa` não muda em nenhuma linha da importação.
6. Um cultivar confirmado uma vez casa sozinho na importação seguinte.
7. Toda linha não importada aparece no relatório XLSX com o motivo.
8. `npx tsc --noEmit` limpo e `npm run build` passando.

---

## 9. Perguntas em aberto

1. **`Campo de Semente-UBS` conta como grão** (item 5) — isso significa
   `equivaleAGrao=true` para efeito de exportação de nutrientes e produtividade,
   mas o propósito continua registrado como Campo de Semente. Confirmar que é
   essa a leitura, e não fundir os dois propósitos num só.
2. **Talhão que não existe no cadastro** — criar sem geometria (`areaHa: 0`,
   `status: 'incompleto'`, como faz `FazendaDetailPanel.tsx:147`) e esperar o KML
   depois? É o único caminho hoje; confirmar que serve.
3. **Grupo** — os oito nomes de fazenda repetidos entre produtores são de fato
   condomínios, ou coincidência de nome? A resposta muda se o grupo é sugerido
   automaticamente ou só oferecido.
4. **Safra** — a planilha traz `2026/2027`, o cadastro tem `26/27` e **duas**
   entradas `25/26` duplicadas. Vale limpar a duplicata junto.
