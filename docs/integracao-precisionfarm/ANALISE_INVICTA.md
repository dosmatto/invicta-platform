# Integração PrecisionFarm × Invicta — análise do lado da Invicta

Rascunho interno, 21/10/2026. Base: `invicta-platform` (Plataforma de AP), commit 3d24f10, v2.209.0.
Separação usada: **[FATO]** lido no código · **[PROPOSTA]** · **[DÚVIDA]** para decidir.

## 0. Qual plataforma recebe a integração

Tudo o que a PrecisionFarm pede (limites, zonas de manejo, mapas de colheita, arquivos de aplicação, linhas de plantio)
é assunto da **Plataforma de AP** (`invicta-platform`, Supabase `hxmfjdwoltrnbovgbmoz`), não da Lavra.
A Lavra (Django) também tem Produtor/Fazenda/Talhão, mas não tem geometria de zonas nem mapas.

**Boa notícia:** a AP já tem uma integração externa no mesmo formato que eles propõem — a da Lavra
(`docs/integracao-lavra.md`, `src/app/api/v1/programacao/`). Boa parte da infraestrutura é reaproveitável.

## 1. Modelo real (resposta aos itens 1–2 do PROMPT)

| Entidade | Onde vive | ID | Observações |
|---|---|---|---|
| Empresa (tenant) | `src/lib/empresa.ts` | string base36 | todo registro tem `empresaId` |
| Cliente | `app_kv` coleção `inv_clientes` | string base36 (`Date.now().toString(36)+random`) | **não é UUID**, mas é estável |
| Fazenda | `app_kv` `inv_fazendas`, com `clienteId` | idem | **existe** cadastro de fazenda (a PF não tem) |
| Talhão | tabela `talhoes` (`id, empresa_id, fazenda_id, nome, area_ha, dados jsonb, atualizado_em`) | idem | `dados` = objeto inteiro |
| Zoneamento (MEAP) | `app_kv` `inv_meap_zoneamentos` | idem | vários por talhão; `padrao=true` é o oficial |
| Mapa de produtividade | metadados em `app_kv` `inv_produtividade`; grade em `inv_mapas_fert` (`<talhaoId>__prod__<id>`) | idem | grade raster comprimida em jsonb |
| Prescrição / aplicação | `app_kv` `inv_prescricoes` | idem | versionada (`versao` + `origemId`), `fc` congelado |

- **[FATO] PostgreSQL sim, PostGIS não.** Não há `ST_*` nem coluna `geom` em uso. Geometrias são GeoJSON em jsonb (ou string).
- **[FATO] SRID:** WGS84 lon/lat (EPSG:4326 implícito). Área geodésica no elipsoide WGS84. Já bate com o RFC 7946 que eles propõem.
- **[FATO] Limite:** `talhoes.dados->>'geojson'` é uma **string** com FeatureCollection dentro (atenção ao parse duplo). Furos preservados (`areaHa` líquida e `areaHaSemHoles`).
- **[FATO] Histórico de limite existe:** ao trocar o desenho, a versão anterior vai para `geoVersoes[]` (`versao, geojson, areaHa, arquivadoEm, safras`) e `geoVersao` avança. O ID do talhão **permanece**. Há também `fusoes` (união) e `origemExterna` (InCeres).
- **[FATO] App local-first:** o navegador guarda as coleções em localStorage e sincroniza com `app_kv`/`talhoes`. Gravação de fora pelo servidor é segura **só criando registros novos** (regra já documentada na integração Lavra §4).

## 2. Como cada recurso pedido se encaixa

| Recurso do contrato | Situação na AP | Lacuna |
|---|---|---|
| `management_zones` (Invicta → PF) | Existe (MEAP). FC com `{id, zona, classe, areaHa, potencialRank}` | **Não há estado "consolidado"** — há `padrao` e `zoneamentoLiberadoId` (liberado p/ Lavra). **Zonas não têm safra/vigência** (feature `zonas-vigencia-safra` pausada no worktree) e **não guardam o `geoVersao` do limite** usado. |
| `harvest` (Invicta → PF) | Existe. `MapaProdutividade` com `safra, epoca, cultura, versao, oficial`; valor **físico em kg/ha** | Guardado como **grade raster** em jsonb, não GeoJSON. Precisa de exportador (GeoTIFF/COG ou grade → polígonos). Também sem `geoVersao` de referência. Bom: não é grade normalizada, a unidade é real. |
| `application` (Invicta → PF) | Existe (`Prescricao`, exporta SHP/XLSX/PDF/GeoJSON/KML/CSV) | O arquivo exportado não é armazenado — teria de ser gerado na hora da consulta. |
| `boundary` (PF → Invicta) | Limite + `geoVersoes` já suportam nova revisão sem perder histórico | Falta tela de "nova revisão disponível / aceitar"; hoje troca de limite é manual. |
| `guidance` linhas de plantio (PF → Invicta) | **Não existe nada** (nem AB line, nem ISOXML) | Módulo novo **no talhão** (ver §2.1). |

### 2.1 Módulo "Linhas" no talhão (decisão do William, 21/10/2026)

- Fica **dentro do talhão, junto dos demais módulos** (Produtividade, MEAP, Prescrições…), como uma `LinhasSection` em `src/components/talhao/`.
- **Não é anual.** É um dado **perene** do talhão: não tem safra nem vigência por ano. O que importa é estar **igual à plataforma de origem** (PrecisionFarm).
- **Espelho atualizável:** quando a origem publica nova revisão, a nossa cópia é atualizada; a anterior vai para histórico (mesma ideia do `geoVersoes` do limite), nunca é apagada em silêncio.
- **Verão e inverno existem, mas não são ano.** São dois padrões de linha permanentes do talhão (ex.: plantio de verão e plantio de inverno), que valem de safra em safra até a origem mudar. Campo `ciclo` = `verao` | `inverno` | (vazio quando não se aplica, ex.: pulverização).
- Cada talhão pode ter **várias camadas de linhas**, identificadas por **ciclo** (verão/inverno), **categoria de operação** (plantio, pulverização, colheita, outras) e **largura nominal** (`spacing_m`) — nunca por ano. Linhas guia e bordaduras (`kind=guidance/headland`) na mesma camada.
- Na tela: origem ("PrecisionFarm"), revisão vigente, data da última sincronização e estado (atualizado / sincronizando / erro), mais acesso ao histórico de revisões.
- Somente leitura na AP: quem edita é a origem. Persistência: coleção `inv_linhas` no `app_kv` (um registro por camada, com `resourceId` compartilhado, `revisao`, `historico`).
- **Atualização automática (decidido 21/10/2026):** ao chegar o aviso da PF, a AP baixa a nova revisão, valida (vínculo, checksum, geometria) e **troca a camada vigente sem pedir aceite**; a versão anterior vai para o `historico` da camada. Se a validação falhar, mantém a vigente e mostra "erro na sincronização". O **limite** continua com aceite manual (afeta zonas e mapas).

## 3. O que já existe e se reaproveita

- **[FATO] Autenticação de serviço:** tabela `integracao_chaves` (só o SHA-256 da chave, `empresa_id` como escopo, `revogada_em`, `ultimo_uso_em`), `Authorization: Bearer`, rotas `/api/v1/...` na Vercel com service role. Exatamente o modelo que eles propõem.
  - Ajuste: o `check (sistema in ('lavra'))` precisa aceitar `'precisionfarm'`; escopo hoje é por **empresa**, a PF pede por **cliente/fazenda** → coluna nova (lista de `cliente_id`/`fazenda_id` autorizados).
- **[FATO] Padrão de resposta de erro** (401/404/409 com `codigo`/422 por campo) da `/api/v1/programacao` — serve de modelo para `/integration/v1`.
- **[FATO] Leitura direta:** o papel `fito_ro` tem SELECT em `talhoes`/`app_kv`. **Não** recomendo dar isso à PF (é a base inteira, sem recorte por cliente) — para eles, só API.

## 4. Lacunas reais (o que a Invicta precisa construir)

1. **Tabela de vínculos** `integracao_vinculos` (`integration_id, source_system, entity_type, source_id, shared_id uuid, shared_producer_id, shared_farm_id, status, verified_at`). IDs locais ficam intactos. **[PROPOSTA]**
2. **Revisão por recurso + tombstone.** Hoje só há `atualizado_em` e **DELETE físico** (talhão apagado some sem rastro). Proposta: tabela `integracao_eventos` (outbox) alimentada por **trigger no Postgres** em `talhoes` e `app_kv` (filtrando as coleções de interesse) — roda na mesma transação do upsert, portanto só "publica" após commit, e pega também gravações por SQL externo. O trigger de DELETE grava o tombstone. Um worker (cron da Vercel ou Edge Function) entrega o webhook e serve `/changes?cursor=`.
3. **Estado "publicado para parceiro"** nas zonas — análogo ao `liberadoProgramacao` já existente — em vez de inferir "consolidado" do `padrao`.
4. **Safra e `geoVersao` no zoneamento e na colheita** (para o "baseado em limite anterior"). A safra nas zonas é exatamente a feature pausada `zonas-vigencia-safra`; faz sentido concluí-la antes.
5. **Exportador de colheita** (grade kg/ha → GeoTIFF/COG com CRS, resolução, nodata, checksum; ou GeoJSON de células) servido por URL temporária.
6. **Receptor PF → Invicta:** `POST /integration/v1/notifications` (HMAC), staging, tela "nova revisão disponível" no talhão, aceite → nova `geoVersao` (limite) ou novo registro em `inv_linhas`.
7. **Pareamento cadastral:** sem PostGIS, o cálculo de IoU/cobertura/ponto interno roda em TS (turf já usado no app) ou no backend Python (shapely), em projeção UTM do talhão. Relatório + tela de confirmação manual.

## 5. Divergências com o contrato 0.1-draft

- `resource_revision` inteiro crescente: a AP não tem isso hoje — vem do item 2 acima. Para zonas/prescrições, cada versão é um **registro novo** (id novo); o `resource_id` compartilhado precisa apontar para a **linhagem** (`origemId`), e a revisão = posição na linhagem.
- `management_zones.status = consolidated` → mapear para "publicado para parceiro" (item 3).
- **Linhas não são por safra.** O contrato traz `season` e nomes `linhas_verao` / `linhas_inverno` nas linhas. Para a Invicta, linhas são perenes: pedir à PF que `season` seja **opcional/nulo** em `guidance`. A divisão verão/inverno é real, mas é **ciclo**, não ano: manter `cropping_cycle` (`summer`/`winter`, já presente no exemplo deles) e os nomes `linhas_verao`/`linhas_inverno`, sem `season`. Identidade da camada: `resource_id` (+ ciclo, categoria de operação e largura como metadados); a `resource_revision` indica atualização.
- `season` "2026/2027" (zonas/colheita): a AP usa `safra` + `epoca` (normal/safrinha); a Lavra usa `AnoSafra` + `tempo`. Precisa de tabela de conversão.
- `harvest.value_unit`: enviar sempre `kg/ha` (unidade interna), nunca a de exibição.
- `boundary_revision` = `talhao.geoVersao` (já existe).
- Arquivos de aplicação: o exemplo usa `application/zip` (SHP) — ok, gerado sob demanda.
- Identidade das zonas: `id` do polígono (`"01"`, `"02_2"`) é estável dentro de uma versão, mas **não** entre versões — documentar.

## 6. Piloto Condomínio Figueira

[DÚVIDA] Confirmar se a fazenda está cadastrada na AP com limite, zoneamento padrão e mapa de produtividade oficial (consulta via SQL Editor do Supabase da AP — o MCP não alcança o projeto). Roteiro deles (§8) é compatível; sugiro incluir no aceite: "talhão apagado na AP gera tombstone" e "zona reeditada gera nova revisão, não sobrescreve".

## 7. Arquivos do pacote que valem trazer para o repositório

| Arquivo | Destino sugerido | Por quê |
|---|---|---|
| `contrato-envelope.schema.json` | `docs/integracao-precisionfarm/` e base do validador da rota | contrato versionado |
| `exemplo-*.json` | `docs/integracao-precisionfarm/exemplos/` + fixtures de teste | casos de teste prontos |
| `ALINHAMENTO.md` | `docs/integracao-precisionfarm/ALINHAMENTO.md` | referência |
| este documento | `docs/integracao-precisionfarm.md` (no padrão do `integracao-lavra.md`) | resposta à PF |
| PDF, `LEIA_PRIMEIRO.txt`, `PROMPT_PARA_CLAUDE.md` | não precisa | duplicam o ALINHAMENTO / são instruções de envio |

## 8. Estimativa grosseira de esforço (lado Invicta)

| Fase | Conteúdo | Porte |
|---|---|---|
| A | vínculos + chave `precisionfarm` com escopo por cliente + `/capabilities`, `/catalog`, `/inventory` (só leitura) | pequeno |
| B | outbox por trigger + tombstone + `/changes` + webhook HMAC | médio |
| C | zonas: estado publicado + safra (concluir `zonas-vigencia-safra`) + `geoVersao` | médio |
| D | exportador de colheita (grade → GeoTIFF/GeoJSON) | médio |
| E | receptor PF: limite (nova `geoVersao` com aceite) e módulo **Linhas** no talhão (espelho perene, atualizado pela origem, com histórico) | médio/grande |
| F | pareamento cadastral (IoU) + tela de confirmação | pequeno/médio |

Nada disso altera produção até o piloto ser validado.
