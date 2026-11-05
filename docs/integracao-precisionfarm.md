# Integração Invicta ↔ PrecisionFarm (ponte 0.2.0) — fases 1 e 2 + tela de lote

Para quem desenvolve ou opera a ponte com a **PrecisionFarm**. Este documento é o
lado da Invicta do contrato 0.2.0 (a referência deles está em
`docs/integracao-precisionfarm/ponte-0.2/`: `openapi.json`, `envelope.schema.json`,
exemplos e `ASSINATURA_EXEMPLO.mjs`). Código: `src/lib/precisionfarm/`
(`contrato.ts` = núcleo puro, `servidor.ts` = banco, `rota.ts` = handlers),
`src/app/api/integration/v1/` e `src/app/api/precisionfarm/`. SQL:
`docs/integracao-precisionfarm.sql`. Testes: `npm run teste:precisionfarm`.

**Fase 2 (receber as LINHAS da PF)** está na §6: código em
`src/lib/precisionfarm/` (`linhas.ts` = núcleo puro, `recebimento.ts` =
orquestração, `clientePF.ts` = HTTP para a PF, `repoLinhas.ts` = banco,
`acessoTalhao.ts` = quem vê o talhão), SQL em
`docs/integracao-precisionfarm-fase2.sql`, teste ponta a ponta com PF simulada
em `npm run teste:precisionfarm-e2e`.

## O fluxo em uma linha

O owner/admin **vincula** o talhão (UUIDs compartilhados + ID do talhão na PF) →
**confirma** o vínculo → **publica** o zoneamento padrão e/ou a colheita oficial
(cada publicação com conteúdo novo vira uma **revisão imutável**) → a PF lê com a
chave dela em `/integration/v1/*` e só enxerga **o que foi publicado** dos
**vínculos confirmados**.

Fase 1 = leitura pela PF (capabilities, catálogo, inventário, revisão). Fase 2 =
a Invicta **recebe** avisos de linhas (`POST /notifications`, com HMAC) e busca
as revisões na PF (§6). Ainda **não** existem o `/changes` e o `/receipts` DA
INVICTA (respondem **501** `not_implemented` em JSON — a nossa fila de saída é
da fase 3), recebimento de limites/zonas da PF nem GeoTIFF. `/capabilities` diz
isso em `features` e `not_implemented`. O **limite** da PF não é recebido por
aviso (continua **422**), mas pode ser **comparado e adotado sob demanda** na
tela do talhão (§7).

---

## 1. Rotas (lado PrecisionFarm)

Base: `https://invicta-platform.vercel.app/integration/v1`. É um **rewrite** do
Next (`next.config.ts`) para `/api/integration/v1/*` — o servidor responde no
mesmo endereço, sem redirecionamento (o contrato não aceita redirect).

| Rota | O que devolve |
|---|---|
| `GET /capabilities` | versão, ambiente, tipos, formatos, limites |
| `GET /catalog?cursor=&limit=` | talhões com vínculo **confirmado** alcançados pela chave |
| `GET /fields/{shared_field_id}/inventory?cursor=&limit=` | camadas publicadas do talhão, revisão vigente + `event` |
| `GET /resources/{id}/revisions/{n}` | envelope completo da revisão `n` (snapshot imutável) |
| `POST /notifications` | **202** — aviso de revisão de linhas (fase 2, §6) |
| `/changes`, `/receipts` | **501** `{ "error": { "code": "not_implemented", … } }` (fase 3) |
| qualquer outro caminho sob `/integration/v1` | 404 `not_found` em JSON |

Chamar **sem** barra final (`/catalog/` leva um 308 do Next).

Não há interruptor de desligamento da LEITURA: com chave válida, responde
(decisão Q2). O 503 "integração desabilitada" só sai de `POST /notifications`
enquanto as variáveis `PF_*` do recebimento não estiverem configuradas (§6).

### 1.1 Autenticação

`Authorization: Bearer <chave>`. A chave mora em `integracao_chaves` (a mesma
tabela da Lavra), `sistema = 'precisionfarm'`, só o SHA-256. Chave da Lavra não
abre a PF e vice-versa. Toda chave da PF tem uma **parceria**
(`integracao_chaves.parceria`, obrigatória para `sistema = 'precisionfarm'`;
nula = chave da Lavra) e só alcança vínculos **daquela parceria** — uma chave de
homologação da PF, com outra parceria, nunca lê os vínculos de produção. A tela
cria todos os vínculos na parceria **`producao`**. Com `empresa_id` preenchido,
a chave só alcança vínculos daquela empresa.

**Escopo efetivo = vínculos `confirmado` da parceria da chave**. Pendente,
suspenso, de outra parceria/empresa ou inexistente: a mesma resposta 404 (a
chave não serve de sonda). Falha de banco ao conferir a chave = 500, não 401.

Emitir: `node scripts/gerar-chave-precisionfarm.mjs [--nome "…"] [--parceria producao] [--empresa <id>]`
— grava a chave **só** em `~/Downloads/precisionfarm-chave-invicta.txt` (fora do
repo, permissão 600) e imprime o `INSERT` (com hash e parceria) para colar no SQL Editor.
Revogar: `update public.integracao_chaves set revogada_em = now() where id = '…'`.

### 1.2 Erros

Corpo: `{ "error": { "code": "...", "message": "..." } }`.

| status | `code` | quando |
|---|---|---|
| 401 | `unauthorized` | chave ausente, inválida ou revogada |
| 404 | `not_found` | talhão/recurso/revisão fora do vínculo ou inexistente |
| 422 | `invalid_request` | `cursor`/`limit` inválidos, id que não é UUID, `n` < 1 |
| 500 | `server_misconfigured` / `internal_error` | erro nosso (service role ausente, falha de banco) |
| 501 | `not_implemented` | `/changes`, `/receipts` (fase 3) |

(413 aparece só no lado Invicta, ao publicar — ver §3.)

### 1.3 Paginação

`items`, `next_cursor` (string) e `has_more`. O cursor é opaco (hoje é o
deslocamento em texto: `"0"`, `"100"`…); `limit` 1–200, padrão 100. Sem mais
itens, `next_cursor` aponta para o fim — repetir a chamada não traz nada novo.

### 1.4 Exemplos curl

```bash
BASE=https://invicta-platform.vercel.app/integration/v1
KEY=invpf_…   # a chave do arquivo em ~/Downloads

curl -s -H "Authorization: Bearer $KEY" $BASE/capabilities
curl -s -H "Authorization: Bearer $KEY" "$BASE/catalog?limit=50"
curl -s -H "Authorization: Bearer $KEY" "$BASE/fields/<shared_field_id>/inventory"
curl -s -H "Authorization: Bearer $KEY" "$BASE/resources/<resource_id>/revisions/1"
```

`/capabilities`:

```json
{
  "contract_version": "0.2.0",
  "source_system": "invicta",
  "environment": "production",
  "resource_types": ["management_zones", "harvest"],
  "formats": ["application/geo+json"],
  "limits": { "max_geojson_bytes": 10485760, "max_features": 100000, "max_vertices": 1000000, "max_page_size": 200, "default_page_size": 100 },
  "endpoints": ["/capabilities", "/catalog", "/fields/{shared_field_id}/inventory", "/resources/{id}/revisions/{n}", "/notifications"],
  "features": { "changes": false, "notifications": true, "receipts": false, "hmac": true, "assets": false },
  "notification_resource_types": ["guidance"],
  "not_implemented": ["changes", "receipts"]
}
```

`/catalog` (item):

```json
{
  "shared_producer_id": "…", "shared_farm_id": "…", "shared_field_id": "…",
  "invicta_field_id": "<talhoes.id>", "precisionfarm_field_id": "<ID do lado PF>",
  "name": "IGEFI 03", "boundary_revision": 1, "status": "confirmed", "confirmed_at": "2026-10-27T12:00:00Z"
}
```

`/inventory` (item): `resource_id`, `resource_type`, `resource_revision`,
`boundary_revision`, `status: "published"`, `name`, (`season`, `season_period`
na colheita), `checksum` e `event` = envelope **sem** `payload` **mais**
`checksum` — o mesmo formato de `exemplo-inventario.json`, para a carga inicial
sem inventar `event_id`.

`/resources/{id}/revisions/{n}`: o envelope inteiro, exatamente o que entrou no
checksum. Cabeçalho `ETag: "<checksum>"`.

---

## 2. O que é publicado

### 2.1 Envelope e checksum

Envelope 0.2.0 (`envelope.schema.json`, `additionalProperties: false`):
`source_system = "invicta"`, `operation = "upsert"`, `resource_revision` a partir
de 1 e `base_revision = resource_revision − 1`, `occurred_at` em UTC com `Z`
(sem milissegundos), `boundary_revision` = `geoVersao` do talhão na nuvem (≥ 1;
ausente = 1). Todo envelope é validado contra uma cópia do schema antes de
gravar (o teste confere que a cópia é idêntica ao arquivo da PF).

Checksum: SHA-256 da serialização canônica (chaves ordenadas recursivamente,
arrays na ordem), sem `payload.asset.url`/`expires_at` — exatamente
`ASSINATURA_EXEMPLO.mjs`; o teste reproduz o `3a2572c7…601` do
`exemplo-linhas.json`.

**Publicação idêntica não cria revisão.** O checksum do contrato cobre também
`event_id` e `occurred_at`, que mudam a cada clique; por isso a comparação usa
uma *impressão de conteúdo* (envelope sem `event_id`, `occurred_at`,
`resource_revision`, `base_revision`). Igual à da última revisão → a tela diz
"nada mudou" e nada é gravado.

### 2.2 Zonas — `management_zones` (um recurso por talhão)

Fonte: o **zoneamento padrão vigente** do talhão na nuvem (mesma regra de
desempate da tela, `padraoVigente`). Novo zoneamento padrão = nova revisão do
**mesmo** recurso (Q12).

```json
"payload": {
  "name": "Zonas de manejo — IGEFI 03 (Zoneamento 1 — V2)",
  "status": "consolidated", "season": null,
  "semantic": "productivity_class", "value_unit": "class", "n_zones": 3,
  "geometry": { "type": "FeatureCollection", "features": [
    { "type": "Feature", "id": "<id do polígono>",
      "properties": { "zone_id": "01", "class_name": "Alta", "potential_rank": 1 },
      "geometry": { "type": "Polygon", "coordinates": [] } } ] }
}
```

- `zone_id` = `rotuloZona()` — a MESMA regra do mapa, do SHP/KML e da Lavra:
  `id` numérico puro (`"05"`) é o número da zona; `id` sufixado (`"01_2"`) ou
  textual usa o campo `zona`. O editor manual renumera/reclassifica pelo `id` e
  não atualiza `zona`, por isso `zona` sozinho mente em zoneamento editado.
  Vários polígonos podem dividir o mesmo `zone_id`.
- `potential_rank` = posição **fixa** da classe na escala: `Alta = 1`,
  `Média-alta = 2`, `Média = 3`, `Média-baixa = 4`, `Baixa = 5` (mesmo
  reconhecimento de `classeZona` do mapa); `"Nível N"` = N. A classe é o único
  campo que acompanha reclassificar/unificar e a reordenação da tela.
- Classe fora da escala: usa o `potencialRank` gravado (ordem densa 1..K) só se
  ele for **único por `zone_id`**.
- **Recusa (422)** quando um `zone_id` tem polígonos de classes diferentes, um
  polígono não tem número de zona, ou nada é confiável — com mensagem para
  corrigir no editor de zonas. Nunca sai rank adivinhado.
- `n_zones` = nº de `zone_id` distintos.
- Exemplo real (IGEFI 03, editado à mão, `zona` velho): ids `02, 03, 04, 05, 06`
  com classes Média-alta, Alta, Média-alta, Baixa, Média-baixa → `zone_id`
  `02…06`, `potential_rank` `2, 1, 2, 5, 4`, `n_zones = 5`.
- `feature.id` = id do polígono (repetido ganha `_2`, `_3`…).
- Polygon/MultiPolygon intactos (furos e multipartes preservados, sem
  arredondar). Geometria que não é área → publicação recusada.

### 2.3 Colheita — `harvest` (um recurso por talhão + safra + época)

Fonte: o mapa de produtividade **oficial** (estrela na aba Produtividade), lido
na nuvem (`inv_produtividade` + grade em `inv_mapas_fert`
`<talhaoId>__prod__<mapaId>`). Republicar o oficial da mesma safra/época = nova
revisão do mesmo recurso (Q13). Chave local: `harvest|<season>|<season_period>`.

```json
"payload": {
  "name": "Colheita oficial — IGEFI 03 26/27 soja",
  "status": "available", "season": "2026/2027", "season_period": "main",
  "quantity": "grain_yield", "value_unit": "kg/ha", "crop": "soybean",
  "geometry": { "type": "FeatureCollection", "features": [
    { "type": "Feature", "id": "cell-1234", "properties": { "value": 3512.4 },
      "geometry": { "type": "Polygon", "coordinates": [] } } ] }
}
```

- Uma célula `Polygon` por pixel da grade (bordas exatas dos `bounds`, norte no
  topo); `value` em kg/ha com uma casa decimal; pixel sem dado (NaN, infinito,
  negativo) é **omitido**.
- Safra `"AA/AA"` → `"20AA/20AA"` (também aceita `"AAAA/AAAA"`).
- Época → `season_period` (função única `periodoDoContrato`):
  `verao → main`, `safrinha → second`, `inverno → winter`. Época vazia →
  publicação recusada, pedindo para definir a época.
- `crop`: `soja → soybean`, `milho → corn`, `trigo → wheat`, `feijao → bean`;
  outra cultura vai como está.

---

## 3. Lado Invicta — vínculo e publicação

Tela: talhão → **Integração PrecisionFarm** (painel lateral do talhão e aba
Resumo da página do talhão). Só aparece para **owner/admin**.

Rotas (sessão do usuário):

| Rota | Corpo |
|---|---|
| `GET /api/precisionfarm/talhao/{id}` | — (vínculo + publicados) |
| `POST /api/precisionfarm/vinculo` | `{ talhaoId, acao: "criar" \| "salvar" \| "confirmar" \| "suspender", pfLocalId? }` |
| `POST /api/precisionfarm/publicar` | `{ talhaoId, tipo: "zonas", zoneamentoId?, geoVersao? }` ou `{ talhaoId, tipo: "colheita", mapaId, geoVersao? }` |

**Autenticação**: o navegador manda o `access_token` do Supabase em
`Authorization: Bearer`. O servidor valida o token no Supabase Auth
(`auth.getUser`), pega o e-mail e exige papel `owner`/`admin` em `inv_papeis` —
a mesma regra de `inv_eh_admin()` da RLS. Sem sessão → 401; outro papel → 403.

**Vínculo** (sempre na parceria `producao`): `criar` gera os três UUIDs (Q6),
reaproveitando `shared_producer_id` do vínculo **mais antigo** do mesmo cliente
e `shared_farm_id` do mais antigo da mesma fazenda (Q5); sem vínculo anterior,
produtor e fazenda são **derivados** de forma determinística (UUID v5 de
parceria + id do cliente/fazenda) — dois talhões da mesma fazenda vinculados ao
mesmo tempo saem com o mesmo `shared_farm_id`. Nasce `pendente`; dois cliques
simultâneos no mesmo talhão → o segundo recebe 409. `confirmar` exige o ID do
talhão na PF; em vínculo já confirmado não muda nada e recusa (409) trocar o
ID. `suspender` tira o talhão do escopo da chave. O ID da PF só muda com o
vínculo fora de `confirmado`.

**Publicar** lê a camada **na nuvem** — o que a PF recebe é o que está
sincronizado, não o rascunho do navegador — e confere com a tela: zoneamento
padrão diferente ou `geoVersao` diferente = sincronização pendente → 409.
Vínculo suspenso → 409. Mapa não oficial → 409. Safra/época fora do formato →
422. Envelope acima de **4 MB** → **413** com a mensagem "reprocesse com pixel
maior" (limite de resposta das funções da Vercel; ~165 bytes por célula, ou
seja ~25 mil células).

---

## 4. Banco (docs/integracao-precisionfarm.sql)

| Tabela | O quê |
|---|---|
| `integracao_chaves` | + coluna `parceria`; todo check que cite `sistema` é derrubado (qualquer nome) e recriado: `sistema in ('lavra','precisionfarm')` e "PF exige parceria" |
| `pf_vinculos` | parceria (default `producao`) + talhão ↔ UUIDs compartilhados, ID da PF, status, quem/quando; `unique(parceria, talhao_id)` |
| `pf_recursos` | `resource_id` ↔ vínculo + chave local (`management_zones` / `harvest|season|period`); `unique(vinculo_id, chave_local)` |
| `pf_revisoes` | revisões imutáveis: `unique(resource_id, revision)`, `event_id` único, `checksum`, `conteudo_hash`, `evento` e `envelope` (jsonb). Trigger (com `search_path` fixo) recusa UPDATE/DELETE |

Inventário e tela leem **só a revisão vigente** de cada recurso (uma consulta
ordenada com `limit 1` por recurso), sem depender do `max_rows` do PostgREST.

RLS ligada e **nenhuma** política: só a service role (as rotas) lê e grava.
`app_kv` e `talhoes` são apenas **lidos** — o app é local-first e o servidor
nunca reescreve um registro do navegador.

---

## 5. Divergências do 0.2.0 a combinar com a PrecisionFarm

1. **`potential_rank` 1..N real.** O 0.2.0 fala em 1 a 5; zoneamento com mais
   de 5 zonas vai com o rank real e `n_zones = N` (Q8). Pedir à PF que aceite.
2. **`season_period = "winter"`.** O 0.2.0 só tem `main`/`second`; a colheita
   de inverno sai como `winter` (decisão do usuário). Pedir à PF que aceite.
3. **Limite de 4 MB por revisão** do lado Invicta (o contrato admite 10 MB): a
   revisão volta inteira numa resposta da Vercel. Acima disso, recusamos
   publicar até a fase 4 (GeoTIFF/asset).
4. `crop` não está no exemplo de colheita da PF; mandamos códigos em inglês.
5. Corpo de erro `{ error: { code, message } }` — o contrato só fixa os status.
6. (fase 2) **`properties.kind`** não está no contrato (só no exemplo). A
   Invicta desenha `headland` como bordadura e **qualquer outro valor, ou
   ausente, como linha guia** — a revisão é aceita e o histórico anota quantas
   feições vieram sem `kind`. Confirmar com a PF os valores que usam.
7. (fase 2) **Recibo só com o resultado final** (`applied` ou `rejected`); o
   `202` do aviso já confirma o recebimento, então `received` não é enviado.
8. (fase 2) Itens de `GET {PF}/changes` são lidos como o evento direto (formato
   do inventário) **ou** `item.event` — o contrato só diz "mesmo formato".
   Item fora do contrato (ou `event_id` reutilizado com outro conteúdo) é
   gravado em `pf_entrada_descartes` antes de o cursor andar.
9. (fase 2) **404 ao buscar uma revisão** é tratado como temporário (a
   publicação pode estar propagando) por 10 tentativas — até o backoff chegar a
   1 h, ~85 min somados — e só então vira recusa definitiva com recibo `rejected`.
10. (fase 2) Aviso **recusado** que volta com o mesmo `event_id` e o mesmo
   conteúdo (reaviso, `/changes` ou "Buscar linhas") é **reaberto** (202 com
   `"reopened": true`) e processado de novo, gerando um recibo novo.
11. (fase 2) `name` ausente: a camada usa `integration_name`; sem ele,
   "Linhas <operation_category> <cropping_cycle>".
12. (limite, §7) O 0.2.0 **não descreve o payload de `boundary`**. Lemos a
   geometria em `payload.geometry` (padrão das linhas) e, por defesa, em
   `payload.boundary`/`payload.geojson`/o próprio payload, como Polygon,
   MultiPolygon, Feature ou FeatureCollection. Confirmar com a PF o formato e
   se o inventário traz `event` (sem ele o checksum não é conferido).

---

## 6. Fase 2 — receber as LINHAS da PrecisionFarm

Linhas guia e bordaduras (`resource_type = "guidance"`) desenhadas e
publicadas na PrecisionFarm chegam sozinhas na aba **Linhas** do talhão.
Linhas são perenes (sem safra), com ciclo verão/inverno. **Somente leitura** na
Invicta: nenhuma edição de linha, e nada é gravado em `app_kv`/`talhoes`.

### 6.1 Fluxo

```
PF publica revisão ──► POST /integration/v1/notifications (Bearer + HMAC)
                         │  valida, confere vínculo, grava na FILA ──► 202
                         ▼
          after() (logo depois do 202)  +  cron a cada 5 min (pg_cron)
                         │
                         ▼
   GET {PF}/resources/{id}/revisions/{n}  (https, sem redirect, timeout 20 s)
   confere contrato 0.2.0 + checksum canônico + vínculo + geometria + limites
                         │
          ┌──────────────┴───────────────┐
          ▼                              ▼
   válida: snapshot imutável,     inválida (permanente): vigente mantida,
   vira VIGENTE se for maior      erro visível na tela, recibo rejected
   (menor = só histórico)         falha temporária: nova tentativa 10 s … 1 h
          │
          ▼
   POST {PF}/receipts {event_id, status, reason} (HMAC com PF_HMAC_SAIDA),
   com reenvio em caso de falha
```

- **Aviso** (`POST /notifications`): corpo = envelope **sem** `payload` + `checksum`
  (`exemplo-notificacao.json`), até **256 KB** (413). Ordem das conferências:
  tamanho (413) → `X-PF-Timestamp`/`X-PF-Signature` (401) → Bearer (401) → JSON
  e contrato (422) → `resource_type` ≠ `guidance` (422
  `unsupported_resource_type`) → vínculo **confirmado** no escopo da chave (404)
  e os três UUIDs batendo (409) → fila → **202**
  `{ "status": "accepted", "event_id": … }`. Mesmo `event_id` com o mesmo
  conteúdo → 202 com `"duplicate": true`, sem duplicar — salvo se ele tinha sido
  RECUSADO: aí é reaberto (`"reopened": true`); conteúdo diferente → 409 (sem
  criar camada). Sem as variáveis `PF_*` → **503** `not_configured`.
- **Assinatura**: `HMAC-SHA256(PF_HMAC_ENTRADA como texto UTF-8, timestamp + "." +
  bytes exatos do corpo)` em hex minúsculo, comparação em tempo constante,
  tolerância de 300 s. O teste reproduz `ASSINATURA_EXEMPLO.mjs`.
- **Revisão**: validada contra `envelope.schema.json`, com origem
  `precisionfarm`, mesmos `event_id`/recurso/revisão/operação/UUIDs do aviso e
  **checksum canônico** igual (mesmo algoritmo da fase 1). Geometria:
  `FeatureCollection` de `LineString`/`MultiLineString` em WGS84
  [longitude, latitude] (altitude opcional), sem reparo automático; até 10 MB
  de GeoJSON, 100 mil feições e 1 milhão de vértices. `properties.kind =
  headland` = bordadura; outro ou ausente = linha guia (anotado no histórico).
  `name` ausente → `integration_name` → "Linhas <operação> <ciclo>".
  `archive` não traz linhas.
- **Ordem**: a maior revisão é a vigente; uma revisão menor que chega depois é
  guardada no histórico e **não regride** (a condição é atômica no banco).
  `archive` arquiva a camada (some da vista padrão; histórico e as últimas
  linhas continuam consultáveis); um `upsert` maior depois desarquiva.
- **Falhas**: permanente = contrato/checksum/geometria/vínculo inválidos ou
  409/410/413/422 da PF → recibo `rejected` com o motivo. Temporária = rede,
  timeout, 3xx (redirect recusado), 401/403, 429, 5xx, 503 → nova tentativa
  com backoff 10 s, 20 s, 40 s … até 1 h, sem limite de tentativas. 404 =
  temporário até a 10ª tentativa, depois recusa. Recusa de uma revisão MENOR
  que a vigente não põe a camada em "Erro" (fica no histórico de recusadas).
  Owner/admin têm **Tentar de novo** na camada com recusa: reabre os avisos
  recusados dela (`POST /api/precisionfarm/reprocessar-linhas`).
- **Data do arquivamento** = `occurred_at` do evento de `archive` (hora da PF).
- **Recibos**: `POST {PF_BASE_URL}/receipts`, corpo `{event_id, status, reason}`
  (`reason` só no `rejected`), `Authorization: Bearer PF_CHAVE` +
  `X-PF-Timestamp`/`X-PF-Signature` com `PF_HMAC_SAIDA`. Falha de rede/5xx/429 →
  reenvio com o mesmo backoff; outro 4xx → para de insistir e fica registrado.
- **Recuperação** (cron): `GET {PF}/changes?cursor=…&limit=100` desde o cursor
  salvo; só eventos `guidance` de vínculo confirmado entram na fila; o
  `next_cursor` é gravado **depois** de a página inteira estar na fila.
- **Carga inicial**: botão **Buscar linhas da PrecisionFarm** (owner/admin, vínculo
  confirmado) → `GET {PF}/fields/{shared_field_id}/inventory` e enfileira o
  `event` de cada camada de linhas — o `event_id` DELES, nada inventado. Camada
  sem `event` no inventário é contada e não entra.
- Na Vercel não há processo contínuo: o processamento roda logo depois do 202
  (`after()` do Next, dentro do `maxDuration` de 60 s da rota) e o cron pega o
  que sobrar (retentativas, recibos, recuperação).

### 6.2 Variáveis da Vercel (Settings → Environment Variables → Production)

| Variável | O que é | Quem fornece |
|---|---|---|
| `PF_BASE_URL` | base da API da PF, **obrigatoriamente** `https://…/integration/v1` (sem isso: "não configurada") | PrecisionFarm |
| `PF_CHAVE` | Bearer que a PF emitiu para a Invicta (buscar revisões, inventário, changes, recibos) | PrecisionFarm |
| `PF_HMAC_ENTRADA` | segredo HMAC PrecisionFarm → Invicta (confere os avisos) | acordado entre as equipes |
| `PF_HMAC_SAIDA` | segredo HMAC Invicta → PrecisionFarm (assina os recibos) | acordado entre as equipes |
| `PF_CRON_SEGREDO` | segredo próprio da rota do cron (o mesmo valor vai no Vault do Supabase) | gerado pela Invicta |

Como cadastrar: Vercel → projeto `invicta-platform` → Settings → Environment
Variables → Add, ambiente **Production** (e Preview, se for testar lá), marcar
como **Sensitive**, salvar e **fazer um novo deploy** (variável nova só vale
depois do redeploy). Gerar o `PF_CRON_SEGREDO` com, por exemplo,
`openssl rand -hex 32`. Nunca colar segredos no repositório, em issue ou em log.

A chave Bearer que a **PF** usa para chamar a Invicta continua sendo a da fase 1
(`integracao_chaves`, sistema `precisionfarm`), também nos avisos.

Sem alguma das quatro primeiras: nada quebra — `POST /notifications` responde
503 `not_configured`, o cron responde 503 e a aba Linhas mostra "Integração de
recebimento não configurada" (owner/admin veem quais nomes faltam).

### 6.3 Agendamento (Supabase pg_cron + pg_net)

`docs/integracao-precisionfarm-fase2.sql` cria as tabelas e o job
`pf-recebimento-linhas` (`*/5 * * * *`), que faz `POST
https://invicta-platform.vercel.app/api/precisionfarm/cron` com
`Authorization: Bearer <segredo>`. O segredo fica no **Vault** do Supabase
(`vault.create_secret(…, 'pf_cron_segredo')`, comando no próprio SQL) com o
MESMO valor de `PF_CRON_SEGREDO`. A rota roda: fila → recibos → `/changes` →
fila de novo, e devolve um resumo em JSON (sem segredos): **200** se rodou
(mesmo com a PF fora do ar — o resumo traz o erro dela), **500** se o banco/fila
falhou, 401 segredo errado, 503 sem configuração. Conferir as últimas
chamadas em `net._http_response` (consulta no fim do SQL).

### 6.4 Tela — aba Linhas do talhão

Trilho do talhão → **Linhas**. Visível a todos com acesso ao talhão (Q4); no
portal do produtor, a aba aparece quando o talhão tem ao menos uma camada com
linhas e não arquivada (Q7, `abasComDados`). Uma camada por `resource_id`:
nome / `integration_name`, ciclo (Verão/Inverno), operação
(`operation_category`), espaçamento (`spacing_m`), origem PrecisionFarm,
revisão vigente, última sincronização, situação (**Atualizado / Sincronizando /
Erro** + motivo) e o **limite de origem** (`boundary_revision` da PF — a
numeração deles, sem comparação automática com o limite da Invicta). No mapa,
linha guia (ciano) e bordadura (laranja) com estilos distintos; liga/desliga por
camada. **Histórico** (Q6): lista de revisões (nº, data, arquivamento) e
"Comparar no mapa" exibe uma revisão antiga (cinza tracejado) junto da vigente.
Arquivadas ficam ocultas; "Mostrar arquivadas" traz de volta.

Rotas (sessão do usuário):

| Rota | Quem | O quê |
|---|---|---|
| `GET /api/precisionfarm/linhas/{talhaoId}` | todos com acesso ao talhão | camadas, situação, histórico (sem geometria) |
| `GET /api/precisionfarm/linhas/{talhaoId}/revisao?resource=&n=` | idem | linhas de uma revisão (gzip acima de 1 MB) |
| `POST /api/precisionfarm/carga-linhas` | owner/admin | `{ talhaoId }` — carga inicial pelo inventário |
| `POST /api/precisionfarm/reprocessar-linhas` | owner/admin | `{ talhaoId, resourceId }` — "Tentar de novo" |
| `GET`/`POST /api/precisionfarm/cron` | pg_cron (`PF_CRON_SEGREDO`) | rotina periódica |

**Acesso ao talhão** (`acessoTalhao.ts → podeVerTalhao`, conferido no servidor):
a mesma conta do app (`getTalhoes`) — registro do e-mail em `inv_papeis`, status
que entra (`ativo` ou vazio), owner/admin/editor veem tudo; demais papéis pelo
escopo de cliente/fazenda/talhão (produtor: `clienteId` + `clientesVinculados`;
fazenda marcada entra sempre; `talhoesVinculados` restringe).

### 6.5 Banco (docs/integracao-precisionfarm-fase2.sql)

| Tabela | O quê |
|---|---|
| `pf_entrada_eventos` | fila de avisos (`event_id` único + `conteudo_hash`), status `pendente/aplicado/rejeitado`, tentativas, próxima tentativa, trava do processador, e o recibo (status, motivo, enviado em, tentativas) |
| `pf_linhas_camadas` | uma linha por `resource_id`: vínculo/talhão, revisão vigente, revisão desenhada, arquivada, metadados, último erro, última sincronização |
| `pf_linhas_revisoes` | snapshots **imutáveis** (envelope completo), `unique(resource_id, revision)`; trigger recusa UPDATE/DELETE |
| `pf_entrada_cursor` | cursor de `/changes` |
| `pf_entrada_descartes` | eventos descartados pela recuperação/carga, com o motivo (gravado antes de o cursor andar) |

A aba consulta de novo enquanto há aviso na fila, mas respeitando o próximo
horário de tentativa (6 s → 60 s sem novidade; teto de 5 min).

RLS ligada e nenhuma política, como na fase 1.

---

## 7. Limite da PrecisionFarm — comparar e adotar (sob demanda)

O usuário considera os limites da PF mais precisos e quer sempre poder
**comparar** e, se for o caso, **adotar** o limite da PF como novo limite do
talhão. Sem tabela nova e sem fila: o aviso de limite (`POST /notifications`
com `resource_type = "boundary"`) **continua recusado com 422** (não está em
`TIPOS_RECEBIDOS` nem em `notification_resource_types`), e o cursor do
`/changes` já passou do evento do IGEFI 03 — por isso a leitura é pelo
**inventário**, quando o usuário pede.

**Onde:** talhão → aba Resumo (ou painel lateral) → Integração PrecisionFarm →
bloco **Limite da PrecisionFarm**. Só owner/admin e só com vínculo
**CONFIRMADO**.

**Fluxo:**

1. **Comparar com o limite da PrecisionFarm** → `GET /api/precisionfarm/limite/{talhaoId}`
   (sessão + owner/admin, `limite.ts → buscarLimitePF`): `GET {PF}/fields/{shared_field_id}/inventory`
   (todas as páginas) → item `resource_type = "boundary"` (vários: vale o mais
   recente por `updated_at`/`occurred_at`; a tela avisa) → `GET {PF}/resources/{id}/revisions/{n}`.
   A revisão é conferida como na fase 2 quando o item traz `event`
   (`conferirRevisao`: contrato, UUIDs, tipo, revisão e **checksum**); sem
   `event`, schema + recurso + revisão + `checksum` do item (a tela marca
   "checksum não conferido" se nem isso vier). `n` = `event.resource_revision`
   → `resource_revision` → `revision`.
2. **Leitura do payload** (`limiteGeometria.ts`, pura) — o 0.2.0 não descreve o
   payload de `boundary`; aceitamos a geometria em `payload.geometry` (como nas
   linhas), `payload.boundary`, `payload.geojson` ou o próprio payload, como
   `Polygon`, `MultiPolygon`, `Feature`, `FeatureCollection` ou
   `GeometryCollection` de polígonos (texto JSON também). Várias partes viram
   **um** `MultiPolygon`, na ordem recebida; furos preservados; coordenadas
   **sem arredondar**. **Recusa sem reparo**: anel aberto ou com < 4 posições,
   sem área, fora de WGS84 (ou `crs` diferente), anel que não é simples
   (auto-interseção, espícula/aresta que volta sobre si, figura 8 encostando
   num ponto), furo fora do externo, cruzando a borda ou dentro de outro furo,
   partes sobrepostas (encostar é válido), linha/ponto, coleção vazia, `asset`
   sem GeoJSON, > 1 milhão de vértices. Vértice repetido em sequência é aceito.
   Se o inventário passar de 20 páginas sem o limite aparecer, a resposta é
   **502 "inventário incompleto"** — nunca "sem limite publicado".
3. **Comparação** (`compararLimite.ts`, pura, roda no navegador contra o
   limite LOCAL do talhão): área da PF e da Invicta na **métrica da plataforma**
   (geodésica, `areaGeo.ts`) e em **UTM plana** no fuso do talhão (22S no
   Paraná; Mercator Transversa WGS84), área **só PF**, **só Invicta**,
   **diferença simétrica** (m² nas duas métricas e % da área atual da
   Invicta), partes/furos/vértices de cada lado. Mapa pequeno (satélite) com os
   dois contornos (Invicta verde, PF ciano tracejado) e as sobras pintadas (só
   PF âmbar, só Invicta vermelho), tabela, revisão/`boundary_revision`/data da
   PF. Sobreposição do limite da PF com outros talhões da fazenda aparece como
   aviso (não bloqueia).
4. **Adotar limite da PrecisionFarm** — a MESMA regra do upload/editor
   (`trocaPoligono.ts`): com dados no ciclo ativo, mostra
   `mensagemBloqueioTroca` e não grava (a comparação continua visível; o
   bloqueio já aparece junto dela). Liberado: confirmação explícita e
   `updateTalhao(geojson, bbox, areaHa, areaHaSemHoles, limiteOrigem)` — o
   versionamento (`geoVersoes`/`geoVersao`) é o automático do store, e a nota
   do ciclo verificado (`notaCicloVerificado`) aparece como no painel do
   limite.
5. **Rastreabilidade** — `Talhao.limiteOrigem` = `{ fonte: 'precisionfarm',
   resourceId, revisao, boundaryRevision, dataPF, checksum, adotadoEm,
   adotadoPor, geoVersao }`. Qualquer outra troca de `geojson` apaga o registro
   (`comVersaoDeLimite`) e a versão arquivada em `geoVersoes` leva o dela. A
   seção mostra "Limite atual (vN) = PrecisionFarm rev. R" ou, depois de
   comparar, "Difere da PrecisionFarm rev. R: X m² (Y %)".

Respostas da rota: **200** `{ ok, limite: { geometria, partes, furos, vertices,
resourceId, revisao, boundaryRevision, data, nome, checksum, conferencia,
itensNoInventario } }` · **409** sem vínculo confirmado · **503** sem as
variáveis `PF_*` ou PF desligada (503 dela) · **404** sem limite publicado ou
arquivado · **422** revisão que não confere ou geometria inválida (motivo na
mensagem) · **502** inventário cortado sem o limite e outras falhas da PF
(rede, 401, 404…).

Testes: `npm run teste:precisionfarm` (seção "Limite da PF"; com
`PF_LIMITE_REAL=<arquivo>` confere também um limite real — o do IGEFI 03 dá
66,4658 ha em UTM 22S, o mesmo número da PF).

---

## 8. Tela de lote — Biblioteca → PrecisionFarm

Confirmar e publicar talhão a talhão na seção do talhão é trabalhoso; a tela de
lote faz o mesmo para vários de uma vez. **Onde:** Biblioteca → **PrecisionFarm**
(abaixo de Acessos; só aparece para **owner/admin** — as rotas conferem de novo).

**Visão geral** — `GET /api/precisionfarm/lote` (sessão + owner/admin, só lê):
**todos** os vínculos da parceria `producao` (qualquer status, todos os
clientes), com o talhão na nuvem (`naNuvem: null` quando o talhão não existe lá —
a linha aparece como "não encontrado" e as ações a pulam), a revisão vigente de
cada recurso publicado e o número de camadas de linhas visíveis. A tabela mostra
talhão, fazenda, cliente (nomes do aparelho), ID PF, status, zonas (rev.),
colheitas (safra · época · rev.), linhas e a diferença de limite. Filtros por
cliente e fazenda; caixa por linha + "marcar todos" (os visíveis). A ação vale
para o que está marcado **e** visível.

**Ações em lote** — sem rota própria: a tela chama as rotas de UM talhão
(§3/§7), no máximo **3 talhões em andamento** (`lote.ts → executarEmLote`,
`CONCORRENCIA_LOTE`), com progresso; a falha de um não para os outros, e cada
linha fica com **ok**, **pulado** (motivo — recusa de regra: HTTP 404/409/413/422)
ou **erro** (rede, sessão, 5xx). Resumo final "N ok · N pulados · N erros".

| Ação | O que faz | Pula quando |
|---|---|---|
| Confirmar | `POST /vinculo acao=confirmar` (mesmas travas: exige ID PF; confirmado não troca ID) | já confirmado; sem ID PF |
| Suspender | `POST /vinculo acao=suspender` (pede confirmação do lote) | já suspenso |
| Publicar zoneamento | `POST /publicar tipo=zonas` com o zoneamento **padrão** e o `geoVersao` locais | vínculo não confirmado; talhão fora do aparelho; sem padrão; padrão/limite fora de sincronia (409 da rota) |
| Publicar colheita | `POST /publicar tipo=colheita` para **cada** mapa oficial do talhão (em sequência) | idem; sem colheita oficial; mapa sem época; safra fora do formato (422); grade fora da nuvem (409) |
| Comparar limites | `GET /limite/{id}` + `compararLimites` contra o limite **local** → coluna "Dif. limite" (m² e %) | vínculo não confirmado; talhão fora do aparelho |

A escolha do que se publica é **a mesma** do botão da seção do talhão
(`escolhaPublicacao.ts`: zoneamento padrão, colheitas oficiais, época,
`geoVersao`). Idempotente como lá: conteúdo igual não cria revisão ("sem
mudança, rev. N"). **Adotar limite** e trocar o ID PF continuam talhão a talhão.

**De onde a publicação lê os dados:** da **nuvem**, na rota — `zoneamentoPadrao`
(app_kv `inv_meap_zoneamentos`), `mapaProdutividade` + `gradeProdutividade`
(app_kv `inv_produtividade` e a grade em `inv_mapas_fert`). O navegador só manda
os ids e o `geoVersao` que conhece, como conferência de sincronização. Na
plataforma, `inv_meap_zoneamentos` e `inv_produtividade` (metadados) descem
inteiros no boot (só o app de campo os pula), então a escolha funciona também
para talhões que o usuário não abriu; a grade pesada da colheita nunca precisa
estar no navegador. Se a nuvem ainda não terminou de carregar, a tela avisa
(talhões podem sair pulados — nada é publicado errado: a rota confere).

### 8.1 Importar o manifesto de vínculos da PF

A PF manda um pacote (ex.: `PRECISIONFARM_INVICTA_COMPLEMENTO_20261028.zip`) com
o manifesto (`FIGUEIRA_VINCULOS_PROPOSTOS.json`: `fields[]` com
`local_field_id`, `name`, `shared_producer_id`, `shared_farm_id`,
`shared_field_id`, `boundary_file`, `boundary_sha256`) e os limites em GeoJSON.

**Entrada:** o **.zip inteiro**, como veio — o manifesto aponta os limites por
caminho dentro do zip e traz o SHA-256 de cada um; não é preciso descompactar.
Também vale o `.json` + os `.geojson` soltos (seleção múltipla), casados pelo
nome do arquivo. O manifesto é o `.json` com `fields` (vários → o de nome
`*VINCULOS*`). Geometria no próprio item (`geometry`/`boundary`/`geojson`)
também é aceita. Até 50 MB escolhidos e 500 talhões; DESCOMPRIMIDO, até 20 MB por arquivo e 200 MB no total — conferido pelo tamanho declarado no diretório do zip antes de abrir e de novo, byte a byte, durante a descompressão (zip forjado que mente o tamanho para no teto).

**Prévia** (`manifestoPF.ts`, pura; nada é gravado):

1. cada limite é lido com a mesma leitura **estrita** do limite da PF
   (`lerGeometriaLimite`: inválido é recusado com o motivo) e o SHA-256 do
   arquivo é conferido com o do manifesto;
2. para cada talhão da PF, o **nosso de maior sobreposição** entre todos os
   talhões do aparelho (pré-filtro pela caixa) e a **diferença simétrica**
   (`compararLimites`, % da área do nosso);
3. situação: **Par 1:1** (≤ 5 %, vem **marcado**) · **Diferença > 5 %** (pode
   marcar, não vem marcado) · **Ambíguo** (cobre dois ou mais dos nossos com
   sobreposição relevante — ≥ 25 % do nosso **e** ≥ 5 % do talhão da PF —, ou
   dois talhões da PF caem no mesmo nosso) · **Sem par** · **Já vinculado**
   (`shared_field_id` já está num vínculo — "mesmos IDs" quando é o mesmo
   talhão — ou o nosso talhão já tem vínculo com outros UUIDs) · **Conflito de
   IDs** (a fazenda/cliente do nosso talhão já tem outro `shared_farm_id`/
   `shared_producer_id` — a mesma regra de reuso do "Gerar identificadores") ·
   **Inválido**. Só Par e Diferença podem ser marcados.

**Criar** (clique + confirmação) → `POST /api/precisionfarm/manifesto`
`{ itens: [{ talhaoId, pfLocalId, sharedProducerId, sharedFarmId, sharedFieldId, nomePF }] }`
(sessão + owner/admin). O servidor **confere de novo** (`conferirCriacao`):
talhão na nuvem, talhão sem vínculo, `shared_field_id` livre, sem repetição no
pedido, mesma identidade de produtor/fazenda; e cria cada um **pendente** com os
UUIDs da PF e `pf_local_id = local_field_id`, EM LOTE (`inserirVinculos`: um insert por fatia de 50; fatia recusada pelo `unique` é refeita um a um). Item recusado não impede os
outros; corrida com outra aba cai no `unique` e vira recusa daquele item.
Resposta `{ ok, criados, resultados: [{ talhaoId, sharedFieldId, ok, motivo? }] }`.

Com o manifesto da Figueira de 28/10: 14 pares 1:1 (PEQHOL → nosso IGEFI 13),
IGEFI11 da PF ambíguo (cobre nossos IGEFI 10 e 11) e IGEFI03 já vinculado. Os 14
pendentes já foram criados no banco por script (28/10) com esses mesmos UUIDs —
reimportar o manifesto mostra todos como "Já vinculado (mesmos IDs)".

Testes: `npm run teste:precisionfarm` (seções "Lote"; com
`PF_MANIFESTO_REAL=<pasta do complemento descompactado>` confere os 16 limites
reais e a regra de ambíguo).

### 8.2 Manifesto v2 — ativação geral (04/11) e o retorno para a PF

Pacote `PARA_INVICTA_ATIVAR_SINCRONIZACAO_20261104.zip`: `VINCULOS.json`
(`clients[]`, `farm_groups[]`, `fields[]` — 13 clientes, 162 talhões, 15
confirmados da Figueira) + `LIMITES.geojson` (FeatureCollection, ~12 MB, uma
feição por talhão ligada por `properties.shared_field_id`). Decisões do usuário:
ledger `pf-manifesto-v2` (Q1–Q6; o contrato 0.3 — Q7 — fica para outra fase).

**Leitura** (mesma tela, mesmos tetos de tamanho — o LIMITES.geojson cabe nos 20
MB por arquivo): o formato é detectado pela presença de `clients`/`farm_groups`
(`lerManifestoPF → formato 'v2'`). O item do v2 não tem `boundary_file`: o
limite é a feição do `.geojson` com o mesmo `shared_field_id`
(`lerLimitesGeojson` indexa; `limiteDoCampo` lê com a mesma leitura estrita).
Sem feição, duas feições com o mesmo ID, `local_field_id` da feição diferente
do VINCULOS.json ou geometria inválida = item inválido, com o motivo.

**Casamento** contra TODOS os talhões do aparelho, como no v1, com duas
diferenças: o par > 5 % também vem **marcado** (Q3) e a prévia agrupa por
cliente da PF → cliente nosso (o cliente sai da geometria do talhão casado,
nunca do nome). Desempenho: pré-filtro pela caixa e, entre os vizinhos, o
recorte (turf) só roda se o **teto** da interseção (área da sobreposição das
caixas) ainda puder fazer o vizinho ser o melhor ou relevante
(`tetoIntersecaoM2`); a tela usa `casarManifestoAos` (fatias de 8 talhões,
com progresso). Pacote real: ~430 recortes, ~11 s em Node.

**Fazendas (Q2)** — `planejarIds`, sobre todos os pares criáveis (marcados ou
não; o plano não muda quando o usuário desmarca):

- grupo = `shared_farm_id` proposto pela PF; a fazenda nossa que já usa esse
  UUID é a principal; senão, a que recebe mais pares (empate: maior área);
- a principal fica com o UUID da PF; se ela já tem OUTRO `shared_farm_id`,
  os pares dela viram **conflito** e não são criados;
- as demais fazendas usam o `shared_farm_id` que já têm, ou um **UUID novo**;
- produtor: o `shared_producer_id` da PF; cliente nosso que já tem outro (ou
  recebeu outro antes no mesmo manifesto) = conflito.
- Na prévia, cada par mostra "UUID da PF" / "UUID novo" / "UUID da fazenda" e
  um quadro lista os grupos divididos. A mesma regra vale para o v1.

**Substituição (Q5)**: talhão com vínculo **pendente**, **sem `pf_local_id`** e
**sem publicação** (`pf_recursos` — as revisões são imutáveis e levam os UUIDs
no envelope) pode ter os IDs trocados pelos do manifesto ("substitui
pendente"). O vínculo substituído sai da base da regra de reuso. Confirmado,
suspenso, pendente com ID PF ou com publicação: "Já vinculado", nunca troca.

**Servidor** (`POST /api/precisionfarm/manifesto`, `conferirCriacao`): os
itens chegam com o `sharedFarmId` do plano e `substituir: true` quando for o
caso. Além das conferências do §8.1: um `shared_farm_id` serve a UMA fazenda
(novo uso em outra fazenda é recusado; a fazenda que já o usa — legado —
continua); a substituição só vale com o pedido explícito e o vínculo nas
condições acima (publicação lida na hora, de `pf_recursos`); se um item de
substituição cai por outro motivo, o vínculo antigo volta à base e o pedido é
conferido de novo. A troca é um UPDATE na própria linha
(`substituirVinculosPendentes`), condicional a `status = 'pendente' and
pf_local_id is null` — corrida com outra aba sai recusada por item.

**Exportar retorno** (`retornoPF.ts`, botão na mesma tela): `.zip` com

- `VINCULOS.json` — o da PF, com tudo preservado, mais: por talhão
  `remote_field_id` (nosso talhão), `remote_field_name`, `identity_status`
  (`confirmed` · `remote_matched_pending_confirmation` · `remote_link_suspended` ·
  `remote_match_not_found` · `remote_match_ambiguous` · `remote_match_rejected`;
  par não criado mantém o status da PF) e `boundary_difference_pct`; quando o
  `shared_farm_id` do vínculo não é o proposto, ele vai em `shared_farm_id` e o
  da PF em `proposed_shared_farm_id`. `clients[]`: `remote_producer_id`
  (cliente com mais vínculos do produtor) e `identity_status` pela cobertura
  (`confirmed`/`partially_confirmed`/pendente). `farm_groups[]`: o grupo fica
  com a fazenda principal (`remote_farm_id`, `remote_farm_name`) e cada fazenda
  a mais vira entrada nova com o UUID novo e `split_from_shared_farm_id`.
  Resumo em `invicta_return`.
- `SITUACAO_POR_TALHAO.csv` (`;`, UTF-8 com BOM) — por talhão da PF:
  **ativo** (confirmado, com publicação, ≤ 5 %), **limite divergente**
  (confirmado, > 5 %), **sem dados** (confirmado, nada publicado pela Invicta),
  **pendente de confirmação** (vínculo criado, ainda não confirmado — a PF não
  o vê; sexta situação, além das cinco pedidas), **sem correspondência** (sem
  par, ambíguo ou par não criado) e **erro** (conflito, inválido, talhão com
  outro vínculo, suspenso), com o motivo.

A fonte do retorno são os **vínculos que existem** (lista da tela de lote,
recarregada depois de criar/confirmar), não a prévia — exporte depois de
confirmar.

Com o pacote real (nossos simulados a partir dos limites da PF nas fazendas
reais do casamento de referência): 83 pares ≤ 5 % (inclui o 115, substituído),
38 > 5 %, 21 ambíguos, 5 sem par (4 do Leonardo Geus, que não existe aqui, e o
PV do Jacob), 15 já vinculados; 5 grupos divididos (Jacob, José Ricardo,
Christian, Ricardo Volter, Adriano) → 10 fazendas a mais no retorno.

Testes: `npm run teste:precisionfarm` (seções "Manifesto v2"); com
`PF_ATIVACAO_REAL=<pasta do pacote>` e `PF_CASAMENTO_REF=<casamento-162.json>`
roda o pacote real.

## 9. Extensão 0.3.0 — prescrição (Invicta → PF) e topografia (PF → Invicta)

Formato da PF: `docs/integracao-precisionfarm/ponte-0.3/FORMATO_0_3.md` e
`EXEMPLOS_0_3.json` (identidades fictícias). Decisões: ledger pf-contrato-03
(Q1–Q8). Banco: **`docs/integracao-precisionfarm-0.3.sql`** (o usuário aplica;
sem ele tudo do 0.2 segue igual e o 0.3 responde "aplique o SQL").

### 9.1 Negociação

`/capabilities` mantém `contract_version: "0.2.0"` (e `resource_types`,
`notification_resource_types` da visão 0.2, intactos) e acrescenta
`supported_contract_versions: ["0.2.0", "0.3.0"]` e
`extensions: { contract_version: "0.3.0", publishes: ["prescription"],
receives: ["topography"] }`. Só os tipos novos usam envelope `0.3.0`
(`versaoDoTipo`); zonas e colheita continuam `0.2.0`. O validador escolhe o
schema pela versão do próprio envelope (`SCHEMA_ENVELOPE_03` = o 0.2 com
`const 0.3.0` e o `enum` de tipos somado de `prescription`/`topography`) e
recusa **tipo 0.3 em envelope/aviso 0.2.0** com mensagem explícita
(`erroTipoSo03`) — as linhas 0.2.0 seguem entrando.

### 9.2 Prescrição publicada — `prescription` (um recurso por LINHAGEM)

Fonte: a aba Prescrições (tipo `Prescricao`), nunca os cenários de
Recomendações. **Estrela "Enviar à PrecisionFarm"** no cartão da versão mais
recente (só owner/admin). A estrela mora no servidor
(`pf_prescricoes_estrela`, por talhão + linhagem = id da V1): vale para a
versão mais recente da linhagem, sobrevive a versões novas (inclusive as da
Lavra) e não pode ser forjada pelo registro local.

Gatilhos (`publicacaoPrescricoes.sincronizarPrescricoes`, idempotente — mesma
impressão de conteúdo não cria revisão):
- **marcar** → publica (upsert); **desmarcar** → revisão `archive` (snapshot
  completo da última publicada; inventário `status: "archived"`); a
  prescrição continua na Invicta;
- **salvar versão nova** de uma marcada (na tela: depois do envio à nuvem;
  pela Lavra: `after()` da `/api/v1/programacao`) → nova revisão;
- **excluir** a linhagem ou a Lavra **retirar** o item → `archive`;
- **confirmar o vínculo** (talhão ou lote) → publica as pendentes;
- tela de lote → **"Publicar prescrições"** reenvia (pendentes publicam).

Sem vínculo confirmado a estrela fica salva e a situação diz "pendente:
<motivo>". O conteúdo é lido **na nuvem** (`app_kv inv_prescricoes`), como
zonas e colheita. Situações: publicada rev N · pendente: motivo · arquivada ·
não publicada; a última fica na tabela da estrela (coluna "Prescr." do lote).

Payload (`prescricaoPF.montarPayloadPrescricao`): `name`, `status:
"available"`, `is_favorite: true`, `product`, `input_type`,
`operation_category`, `quantity`, `rate_unit`, `geometry` (FeatureCollection
de Polygon/MultiPolygon, `properties.zone_id` texto + `properties.rate` ≥ 0).
A dose é a **do arquivo de máquina** (casamento polígono↔zona de
`casarZonas`, compensação de germinação de `doseArquivo`, arredondamento
`arredRel`). Dose 0 vai como 0; zona sem dose, dose negativa, polígono sem
zona ou geometria inválida → não publica, com o motivo. `season` quando o
Ano da prescrição (ou a safra da Lavra) está no formato do contrato;
`season_period: "second"` só para a safrinha da Lavra (sem época na
prescrição, nada é inventado).

Mapeamento (único lugar: `TIPO_PARA_CONTRATO` / `UNIDADE_PARA_CONTRATO`):

| Invicta | input_type | operation_category | quantity | unidades aceitas |
|---|---|---|---|---|
| sementes | seed | planting | seed_population | sementes/m → seeds/m, sementes/ha → seeds/ha |
| fertilizante | fertilizer | fertilizing | application_rate | kg/ha, t/ha |
| corretivo | lime | liming | application_rate | kg/ha, t/ha |
| organico | other | fertilizing | application_rate | kg/ha, t/ha, L/ha |
| personalizado | other | other | application_rate | kg/ha, t/ha, L/ha |

`sementes/m2` e qualquer unidade fora da tabela → recusa ("a Invicta não
converte unidades sozinha"). Recurso: `pf_recursos` com `chave_local =
'prescription|<linhagem>'`; revisões em `pf_revisoes` (envelope 0.3.0,
`event` + `checksum` no inventário, mesmo esquema de zonas/colheita).

Rotas (sessão): `GET /api/precisionfarm/prescricoes/{talhaoId}` (só calcula;
owner/admin) e `POST /api/precisionfarm/prescricoes` (`{talhaoId, linhagemId,
marcada}` grava a estrela — owner/admin; `{talhaoId}` só sincroniza — quem
tem acesso ao talhão, pois só publica o que já tem estrela).

### 9.3 Topografia recebida — `topography`

Mesmo pipeline das linhas (§6): aviso/`/changes`/inventário → fila →
revisão buscada na PF → conferência (schema 0.3, checksum, vínculo) →
snapshot imutável → vigente sem regressão → recibo applied/rejected. A
camada fica em `pf_linhas_camadas`/`pf_linhas_revisoes` com
`resource_type = 'topography'` e `meta` (intervalo, destaque, cotas mín/máx,
nº de mestras). Um `resource_id` de linhas nunca vira topografia (409).

Validação (`validarPayloadTopografia`, sem reparo): `status "available"`,
`value_unit "m"`, `interval_m > 0`, `index_interval_m` múltiplo dele,
`smoothed` booleano; cada feição LineString/MultiLineString WGS84 (Z
opcional) com `elevation_m` múltiplo de `interval_m`, `contour_interval_m =
interval_m`, `is_index` coerente (cota múltipla de `index_interval_m`) e
`color` `#rrggbb`. Tetos de 100 mil feições, 1 milhão de vértices e 10 MB.
Sem a migração 0.3: aviso de topografia → **503** (`not_ready`; a PF tenta
de novo) e nada é gravado como linha.

Tela: aba **Altimetria** → bloco "Curvas PrecisionFarm" (mostrar no mapa,
transparência, revisão/data, cotas, legenda das duas cores; clique na curva
mostra a cota; "Buscar curvas" para owner/admin = carga do inventário só de
topografia). Cor da PF, mestras mais grossas, rótulo `elevation_m`. Também
empilhável na aba **Camadas** (grupo "Curvas de nível (PrecisionFarm)",
origem Altimetria; sai no PDF). Só visualização: nunca altera limite nem MDE.

Rotas: as das linhas com `?tipo=topography` (`GET /api/precisionfarm/linhas/{talhaoId}`)
e `{tipo: "topography"}` no `POST /api/precisionfarm/carga-linhas`.

Testes: `npm run teste:precisionfarm` (seções "0.3 —": exemplos da PF com os
3 checksums, payloads seed seeds/m e fertilizer kg/ha iguais aos do exemplo,
dose zero, unidade inválida, 0.2 recusando tipo 0.3, topografia com duas
cores e as recusas) e `npm run teste:precisionfarm-e2e` (PF simulada servindo
topografia 0.3 + publicação de prescrições com repositório em memória:
estrela pendente → confirmação → rev 1 → repetição sem duplicar → versão
nova → archive → reativação → exclusão; migração ausente).
