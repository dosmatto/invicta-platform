# Integração AP → Lavra → AP: zonas de manejo e programação de safra

Para quem desenvolve a **Lavra** (plataforma fitotécnica, Django). Este documento
é o contrato. Do lado da AP (Plataforma de Agricultura de Precisão, este repo) o
código está em `src/lib/programacao/` e `src/app/api/v1/programacao/`.

## O fluxo em uma linha

O agrônomo **libera** na AP uma versão do zoneamento de um talhão → a Lavra
**lê** essa versão direto no Supabase da AP (somente leitura) → o agrônomo
programa as doses da safra por zona na Lavra → a Lavra **envia** as doses para
`POST /api/v1/programacao` → a AP cria as **prescrições** (que viram SHP/XLSX/PDF
para a máquina).

A Lavra **nunca escreve** no banco da AP. O único caminho de volta é a API.

---

## 1. Como a Lavra LÊ (Supabase da AP, papel `fito_ro`)

O papel `fito_ro` já tem `SELECT` em `public.talhoes` e `public.app_kv`.

### 1.1 Talhões com zonas liberadas

Liberar é por talhão e só uma versão por vez. O talhão carrega um **espelho**
do zoneamento liberado em `dados->>'zoneamentoLiberadoId'`:

```sql
select t.id                                   as talhao_id,
       t.nome                                 as talhao_nome,
       t.fazenda_id,
       t.empresa_id,
       t.area_ha,
       t.dados->>'zoneamentoLiberadoId'        as zoneamento_id,
       t.atualizado_em
from public.talhoes t
where coalesce(t.dados->>'zoneamentoLiberadoId', '') <> '';
```

Para acompanhar mudanças sem reler tudo, filtre `t.atualizado_em > :ultima_leitura`
(e trate o talhão que **sumiu** do resultado como "liberação retirada": a chave
`zoneamentoLiberadoId` some do JSON quando o agrônomo desliga a liberação ou
apaga a versão).

`talhoes.id` é o `talhaoId` que vai no POST. É o `plataforma_id` do vínculo
Talhão Lavra ↔ talhão AP.

**Limite (contorno) do talhão**, se a Lavra quiser desenhá-lo por baixo das
zonas: `talhoes.dados->>'geojson'`. Atenção: é uma **STRING com JSON dentro**
(GeoJSON serializado, WGS84), não um objeto — em Python é preciso
`json.loads(dados["geojson"])` depois de já ter lido `dados`. Pode faltar
(talhão sem desenho). O `fc` do zoneamento (§1.2), ao contrário, é objeto JSON
de verdade.

```sql
select t.dados->>'geojson' as limite_geojson_texto   -- texto; parsear de novo
from public.talhoes t where t.id = :talhao_id;
```

Nome da fazenda/produtor, se precisar exibir:

```sql
select dados->>'id' as fazenda_id, dados->>'nome' as fazenda_nome, dados->>'clienteId' as cliente_id
from public.app_kv where colecao = 'inv_fazendas' and item_id = :fazenda_id;

select dados->>'nome' as produtor_nome
from public.app_kv where colecao = 'inv_clientes' and item_id = :cliente_id;
```

### 1.2 O zoneamento liberado (polígonos das zonas)

```sql
select z.item_id                              as zoneamento_id,
       z.dados->>'talhaoId'                   as talhao_id,
       z.dados->>'nome'                       as zoneamento_nome,
       z.dados->'liberadoProgramacao'->>'em'  as liberado_em,
       z.dados->'liberadoProgramacao'->>'por' as liberado_por,
       z.dados->'meta'->>'nZonas'             as n_zonas,
       z.dados->'fc'                          as fc,
       z.atualizado_em
from public.app_kv z
where z.colecao = 'inv_meap_zoneamentos'
  and z.item_id = :zoneamento_id;          -- = talhoes.dados->>'zoneamentoLiberadoId'
```

Confira sempre `z.dados->>'talhaoId' = talhao_id`. O espelho do talhão é a fonte
da verdade; `liberadoProgramacao` é só "quem liberou e quando" para exibir.

### 1.3 Formato do `fc`

GeoJSON `FeatureCollection` em **WGS84 (EPSG:4326, [lon, lat])**. Cada feature é
um **polígono** (`Polygon` ou `MultiPolygon`) de uma zona. Uma zona pode ter
**vários polígonos**.

| propriedade     | tipo            | significado |
|-----------------|-----------------|-------------|
| `id`            | string          | **identidade única do polígono** — é o `idZona` do POST. Ex.: `"01"`, `"02"`, `"02_2"` (2º pedaço da zona 2). |
| `zona`          | número/string   | número da zona; **repete** entre os pedaços da mesma zona. |
| `classe`        | string          | normalmente `"Alta"`, `"Média-alta"`, `"Média"`, `"Média-baixa"`, `"Baixa"` (ou `"Nível N"`; zoneamento importado pode trazer outro texto). |
| `areaHa`        | número (ha)     | área do polígono. Indicativa — veja "Áreas" abaixo. |
| `potencialRank` | número          | 1 = maior potencial. |
| `cor`           | string (#hex)   | cor da zona na AP (pode faltar). |

Outras propriedades podem existir — ignore. Polígono sem `id` (raro, dado antigo)
é identificado como `z<índice>` (`z0`, `z1`… pela ordem em `features`).

**Rótulo para a tela da Lavra:** se o `id` é só dígitos, ele é o número da zona;
senão use `zona`. (`"02_2"` → zona `2`.) Na tela de doses, agrupe por esse rótulo
se quiser digitar uma dose por zona — mas no POST mande **uma linha por
polígono** (`idZona` = `id`), repetindo a dose nos pedaços da mesma zona.

**Áreas:** a AP grava a área de cada zona da prescrição como **fatia
proporcional da área do talhão** (`talhoes.area_ha`), não a área crua do desenho
(as zonas nascem sobre uma malha e somam um pouco menos que o limite). Para a
Lavra exibir o mesmo número: `area_zona = areaHa_poligono × area_ha_talhao / Σ areaHa`.

---

## 2. Como a Lavra ENVIA (API da AP)

### 2.1 Endpoints

| método | URL | o que faz |
|---|---|---|
| POST | `https://invicta-platform.vercel.app/api/v1/programacao` | valida **e grava** |
| POST | `https://invicta-platform.vercel.app/api/v1/programacao/validar` | mesma validação e o mesmo plano (ids, versões, ações), **sem gravar** |

As duas percorrem exatamente o mesmo código; `/validar` é o ambiente de
homologação. Cabeçalhos:

```
Authorization: Bearer invlavra_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json
```

A chave é emitida pelo owner da AP (`node scripts/gerar-chave-integracao.mjs
--nome "Lavra produção"`), aparece uma vez e deve ficar num segredo da Lavra
(variável de ambiente). Chave revogada → 401.

### 2.2 Corpo

```json
{
  "talhaoId": "lk3x9a2bq0",
  "zoneamentoId": "lp0c7m1z4r",
  "anoSafra": "2026/2027",
  "tempo": "NORMAL",
  "origem": {
    "sistema": "lavra",
    "cultivoId": "4812",
    "planoId": "77",
    "subdivisao": "Gleba norte",
    "agronomo": "Ana Souza",
    "atualizadoEm": "2026-10-07T10:00:00-03:00"
  },
  "prescricoes": [
    {
      "chave": "semente",
      "tipo": "sementes",
      "produto": "Soja NS 6601 IPRO",
      "unidade": "sementes/ha",
      "cultivar": "NS 6601 IPRO",
      "espacamentoM": 0.45,
      "germinacaoPct": 92,
      "zonas": [
        { "idZona": "01",   "dose": 320000 },
        { "idZona": "02",   "dose": 280000 },
        { "idZona": "02_2", "dose": 280000 }
      ]
    },
    {
      "chave": "adubo_base",
      "tipo": "fertilizante",
      "produto": "MAP 11-52-00",
      "unidade": "kg/ha",
      "zonas": [
        { "idZona": "01",   "dose": 180 },
        { "idZona": "02",   "dose": 220 },
        { "idZona": "02_2", "dose": 220 }
      ]
    }
  ],
  "remover": ["cobertura_2"]
}
```

| campo | obrigatório | regra |
|---|---|---|
| `talhaoId` | sim | `talhoes.id` da AP. |
| `zoneamentoId` | sim | tem de ser **o liberado agora** (`talhoes.dados->>'zoneamentoLiberadoId'`). |
| `anoSafra` | sim | `"AAAA/AAAA"`, anos consecutivos. |
| `tempo` | sim | `"NORMAL"` ou `"SAFRINHA"`. |
| `origem.sistema` | sim | `"lavra"`. |
| `origem.cultivoId` | sim | id do cultivo na Lavra; até 80 caracteres `[A-Za-z0-9_.-]`. Texto ou número. |
| `origem.atualizadoEm` | sim | ISO 8601 de quando a programação foi alterada **na Lavra** (com fuso). **No máximo 24 h à frente** do relógio da AP — além disso → 422 `data-futura` (uma data futura travaria a linha: todo envio seguinte seria "anterior" e voltaria `ignorada`). |
| `origem.planoId`, `subdivisao`, `agronomo` | não | só registro/exibição. `agronomo` aparece no selo da AP. |
| `prescricoes` | não* | até **20** itens (acima → 422 `limite-excedido`); cada `chave` no máximo uma vez (na prática ≤ 6). |
| `remover` | não* | chaves a retirar da programação. Não pode repetir uma chave de `prescricoes`. |

\* pelo menos um item em `prescricoes` ou uma chave em `remover`.

Item de `prescricoes`:

| chave | `tipo` exigido | unidades aceitas |
|---|---|---|
| `semente` | `sementes` | `sementes/ha`, `sementes/m` (por metro linear), `sementes/m2` |
| `adubo_base`, `cobertura_1`, `cobertura_2` | `fertilizante` | `kg/ha`, `t/ha`, `L/ha` |
| `corretivo_calcario`, `corretivo_gesso` | `corretivo` | `kg/ha`, `t/ha` |

- `produto` (obrigatório): nome comercial — vira o nome do produto no arquivo.
- `zonas` (obrigatório): `[{ idZona, dose }]`, **um por polígono do fc**, sem
  faltar e sem sobrar. `dose` é número ≥ 0 na `unidade` do item; `0` = não aplica.
  No máximo **5000** zonas por item (acima → 422 `limite-excedido`).
- Só para `semente`: `cultivar` (texto), `espacamentoM` (m, 0 < x ≤ 3 —
  **obrigatório** com `sementes/m`), `germinacaoPct` (0–100).
- **A dose de semente é a TAXA DE SEMEADURA** (o que a plantadeira solta), não
  plantas/ha. A AP não compensa germinação em cima dela; `germinacaoPct` só
  alimenta as métricas informativas (sem ele, a AP assume 100%).

### 2.3 Resposta de sucesso (200)

```json
{
  "ok": true,
  "modo": "gravacao",
  "gravado": true,
  "talhaoId": "lk3x9a2bq0",
  "zoneamentoId": "lp0c7m1z4r",
  "cultivoId": "4812",
  "prescricoes": [
    { "chave": "semente",     "acao": "criada",      "id": "lavra__lk3x9a2bq0__4812__semente__v1",    "versao": 1 },
    { "chave": "adubo_base",  "acao": "atualizada",  "id": "lavra__lk3x9a2bq0__4812__adubo_base__v2", "versao": 2 },
    { "chave": "cobertura_2", "acao": "inexistente", "id": null, "versao": null }
  ],
  "avisos": []
}
```

Em `/validar`: `"modo": "validacao"`, `"gravado": false`, e `prescricoes` diz o
que **seria** feito (mesmos ids e versões, mesmos `avisos`).

`avisos` vem **sempre** (lista vazia quando não há nada). Aviso não impede a
gravação — é para a Lavra mostrar ao agrônomo. Hoje há um código:

| codigo | quando | campos |
|---|---|---|
| `cultivo-em-outro-talhao` | este talhão ainda não tem a linha (`criada`, ou `inexistente` num `remover`), mas o **mesmo `cultivoId` + `chave`** já tem prescrição em **outro talhão da mesma empresa** — típico de vínculo Talhão Lavra ↔ AP desfeito e refeito. A AP começa uma cadeia nova no talhão do envio e **não toca** a do outro talhão (ela continua lá, valendo, até alguém retirá-la: pela AP ou com `remover` enviado para aquele talhão). | `item`, `talhoes` (ids dos outros talhões), `mensagem` |

```json
"avisos": [
  { "codigo": "cultivo-em-outro-talhao", "item": "semente", "talhoes": ["lk3x9a2bq0"],
    "mensagem": "Semente: o cultivo 4812 já tem prescrição no(s) talhão(ões) lk3x9a2bq0 da AP. ..." }
]
```

Prescrições de **outra empresa** nunca entram em aviso, cadeia ou resposta.

`acao` por item:

| acao | quando |
|---|---|
| `criada` | primeira vez desta linha (`talhaoId` + `cultivoId` + `chave`) → versão 1. |
| `atualizada` | já existia e algo mudou (dose, produto, unidade, cultivar, espaçamento, zoneamento, safra) → **versão nova**; a anterior continua salva na AP. |
| `inalterada` | igual à última versão → nada gravado. Retentativas (timeout, fila) são seguras. |
| `removida` | estava em `remover` → versão nova marcada "retirada da programação". |
| `inexistente` | estava em `remover` mas nunca foi enviada → nada a fazer. |
| `ignorada` | `origem.atualizadoEm` é **anterior** ao da versão já gravada (envio atrasado/fora de ordem) → nada gravado; `motivo` explica. |

### 2.4 Idempotência e versões

- A identidade de uma linha da programação é
  **`lavra:<talhaoId>:<cultivoId>:<chave>`** — o talhão entra na chave: o mesmo
  cultivo enviado para outro talhão é **outra** linha (ver `avisos` em §2.3), e
  a cadeia é sempre recortada pela empresa do talhão (nunca lê nem escreve
  prescrição de outra empresa). Reenviar a mesma linha nunca cria duplicata: ou
  não faz nada (`inalterada`) ou cria a **próxima versão** (`atualizada`),
  ligada à primeira — é o mesmo versionamento das prescrições feitas na AP
  (cada versão guarda os arquivos que gerou).
- Os ids são determinísticos: `lavra__<talhaoId>__<cultivoId>__<chave>__v<versão>`
  (se o `talhaoId` tiver caractere fora de `[A-Za-z0-9_.-]`, ele é trocado por
  `-` e ganha um sufixo de hash — use o `id` devolvido, não o recalcule). Dois
  envios simultâneos da mesma alteração gravam a mesma linha.
- Versão `removida` (via `remover`) fica salva como histórico, mas a AP **não
  exporta** SHP/Excel/PDF dela. Para voltar a valer, reenvie o item.
- Se o agrônomo **editar na AP** uma prescrição que veio da Lavra, a AP cria uma
  versão própria (aparece "alterado na AP depois"). O próximo reenvio da Lavra
  cria a versão seguinte **por cima** dela. A Lavra é a dona da programação.
- Trocar o zoneamento liberado e reenviar gera versão nova com os polígonos
  novos.

### 2.5 Erros

Todas as respostas são JSON com `ok: false`.

| status | quando | corpo |
|---|---|---|
| 400 | corpo não é JSON | `{ ok, erro }` |
| 401 | chave ausente, inválida ou revogada | `{ ok, erro }` |
| 422 | formato/campos inválidos — **todos de uma vez** | `{ ok, erros: [{ campo, codigo, mensagem, item?, zonas? }] }` |
| 404 | talhão não existe (ou é de outra empresa que a da chave) | `{ ok, erro }` |
| 409 | zoneamento não liberado / trocado | `{ ok, codigo, erro, talhaoId, zoneamentoId, zoneamentoLiberadoId }` |
| 422 | zonas faltando / inexistentes no zoneamento liberado | `{ ok, talhaoId, zoneamentoId, erros: [...] }` |
| 500 | falha de banco | `{ ok, erro }` |
| 503 | API não configurada no ambiente | `{ ok, erro }` |

Ordem de checagem: JSON → chave → formato → talhão → liberação → zonas.

`codigo` do 409:

| codigo | `zoneamentoLiberadoId` | o que fazer na Lavra |
|---|---|---|
| `nao-liberado` | `null` | talhão sem liberação: avisar "zonas não liberadas na AP". |
| `trocado` | id do liberado atual | recarregar o fc desse id (§1.2), reprogramar as zonas e reenviar. |
| `outro-talhao` | `null` | espelho inconsistente; pedir à AP para liberar de novo. |

`codigo` dos erros 422:

| codigo | significado |
|---|---|
| `obrigatorio` | campo ausente (inclui `espacamentoM` com `sementes/m`). |
| `invalido` | formato errado (`anoSafra`, `tempo`, `cultivoId`, `atualizadoEm`, números fora da faixa, parâmetros de semente em item que não é semente). |
| `data-futura` | `origem.atualizadoEm` mais de 24 h à frente do relógio da AP (relógio/fuso da Lavra errado). |
| `limite-excedido` | mais de 20 itens em `prescricoes` ou mais de 5000 zonas num item. |
| `vazio` | nem `prescricoes` nem `remover`. |
| `chave-desconhecida` / `chave-repetida` / `conflito-remover` | problemas com `chave`. |
| `tipo-incompativel` | `tipo` não bate com a `chave`. |
| `unidade-invalida` | unidade não serve para o tipo. |
| `dose-invalida` | dose ausente, texto, negativa ou não finita (`zonas: [idZona]`). |
| `zona-repetida` | mesmo `idZona` duas vezes no item (`zonas`). |
| `zona-inexistente` | `idZona` que não está no fc liberado (`zonas`). |
| `zona-faltando` | polígono do fc sem dose (`zonas`). |

Exemplo de 422 de zonas:

```json
{
  "ok": false,
  "talhaoId": "lk3x9a2bq0",
  "zoneamentoId": "lp0c7m1z4r",
  "erros": [
    { "campo": "prescricoes[1].zonas", "codigo": "zona-faltando", "item": "adubo_base",
      "zonas": ["02_2"],
      "mensagem": "Adubo de base: zona(s) sem dose: 02_2. Toda zona do zoneamento precisa de dose (0 = não aplica)." }
  ]
}
```

Exemplo de 409:

```json
{
  "ok": false,
  "codigo": "trocado",
  "erro": "O zoneamento liberado deste talhão mudou. Recarregue as zonas do zoneamentoLiberadoId devolvido e programe de novo.",
  "talhaoId": "lk3x9a2bq0",
  "zoneamentoId": "lp0c7m1z4r",
  "zoneamentoLiberadoId": "lq2d8n0y7s"
}
```

### 2.6 curl

```bash
curl -sS -X POST https://invicta-platform.vercel.app/api/v1/programacao/validar \
  -H "Authorization: Bearer $INVICTA_AP_CHAVE" \
  -H "Content-Type: application/json" \
  --data @programacao.json
```

---

## 3. O que a AP faz com o envio

Cada item vira uma **Prescrição** no talhão (coleção `inv_prescricoes` do
`app_kv`): modo "dose manual por zona", com o desenho das zonas **copiado** do
zoneamento (a prescrição não muda se o zoneamento for editado depois), área de
cada zona como fatia da área do talhão, `ano` = `anoSafra`, nome
`"<Item> — <produto> (<anoSafra>[ safrinha][ · subdivisão])"` e o campo
`origemLavra` (cultivo, plano, agrônomo, datas). Na tela aparece o selo
**"Programado na Lavra (agrônomo, data)"** e o aviso de que reenviar sobrescreve.
Exportação SHP/Excel/PDF funciona como em qualquer prescrição — exceto na
versão marcada "Retirada da programação na Lavra", que não exporta.

A Lavra pode conferir o que está gravado lendo:

```sql
select item_id, dados->>'talhaoId' as talhao_id, dados->>'versao' as versao,
       dados->'origemLavra' as origem, atualizado_em
from public.app_kv
where colecao = 'inv_prescricoes'
  and dados->>'talhaoId' = :talhao_id
  and dados->'origemLavra'->>'cultivoId' = :cultivo_id
order by item_id;
```

## 4. Gravação pelo servidor × sync do navegador (nota para a AP)

A AP é um app local-first: cada navegador guarda as coleções no cache local e
sincroniza com o `app_kv` (`src/lib/supabaseData.ts`). Gravar no `app_kv` por
fora é seguro porque **o servidor só cria registros novos** — cada versão tem id
próprio e nenhum registro existente é reescrito:

- boot completo sem pendência local: a nuvem substitui o cache → o registro aparece;
- boot completo com pendência local: `mesclarPorId` une nuvem + local; o local só
  vence no **mesmo id**, e o servidor nunca usa um id que o navegador já tenha;
- boot incremental: o registro entra pelo delta (`atualizado_em` > marca d'água);
  se o relógio do navegador adiantou a marca, a contagem nuvem × local diverge e
  o boot cai no completo;
- push do navegador: o diff só apaga ids que estavam no espelho da sessão e saíram
  da lista local; registro do servidor não está no espelho → nunca é apagado. A
  poda geral (`podePodar`) só roda com espelho ausente numa coleção hidratada,
  o que o código atual não produz.
- com a aba já aberta: a aba Prescrições chama `atualizarPrescricoesDaNuvem`
  (só acrescenta ids que faltam, e não roda com push pendente).
