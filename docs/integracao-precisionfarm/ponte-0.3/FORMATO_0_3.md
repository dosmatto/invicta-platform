# Extensão compatível 0.3.0

## Negociação e rotas
Manter a API `/integration/v1`, autenticação Bearer e HMAC existentes. Capabilities PrecisionFarm conserva `contract_version: "0.2.0"` e anuncia `supported_contract_versions: ["0.2.0", "0.3.0"]`, além de `extensions` com `contract_version: "0.3.0"`, `publishes: ["topography"]`, `receives: ["prescription"]`. O parceiro pode anunciar 0.3 como versão principal ou na lista de versões suportadas. Sem compatibilidade 0.3 confirmada, os fluxos atuais 0.2 continuam e os novos tipos ficam bloqueados com mensagem explícita.

Preservar `/catalog`, `/fields/{shared_field_id}/inventory`, recursos/revisões, notificações e recibos do contrato existente. Cada item do inventário precisa incluir `event` com metadados do envelope e `checksum` SHA-256 da revisão, permitindo carga inicial e atualização periódica sem `/changes`. Cursores devem avançar quando `has_more` for verdadeiro. Até100itens solicitados por página. Revisão e event_id estáveis: repetição não cria cópia. Não reutilizar revisão/evento com conteúdo diferente.

O envelope conserva event_id, resource_id, shared_producer_id/shared_farm_id/shared_field_id, resource_revision, base_revision=revision-1, boundary_revision, occurred_at UTC, operation upsert/archive, source_system e payload. Os novos tipos usam `contract_version: "0.3.0"`. GeoJSON WGS84 `[longitude, latitude]`, sem projeção presumida. Tetos existentes:10MBporGeoJSON,100milfeatures,1milhãodevértices; dividir recursos maiores em revisões/recursos adequados antes de publicar. Não enviar amostras GNSS nem TIN nesse recurso.

## Prescrição — Invicta → PrecisionFarm
`resource_type: "prescription"`. Payload obrigatório:
- `name`: nome da camada; `status: "available"`; `is_favorite`: booleano; `product`: produto não vazio.
- `input_type`: seed, fertilizer, lime ou other.
- `operation_category`: planting, fertilizing, liming, spraying ou other.
- `quantity`: seed_population para seed; application_rate para os demais.
- `rate_unit`: seed aceita seeds/m ou seeds/ha; fertilizer/lime aceitam kg/ha ou t/ha; other aceita kg/ha, t/ha ou L/ha.
- `geometry`: FeatureCollection Polygon/MultiPolygon. Cada feature leva `properties.zone_id` como texto e `properties.rate` numérico finito ≥0, na unidade única do payload.

Priorizar prescrições favoritas/aprovadas. Dose zero é preservada como zero; ausência de dose/unidade é erro, sem adivinhação. Conversões sementes/m↔sementes/ha exigem espaçamento confirmado e não são feitas nesta importação. A camada recebida aparece no menu de mapas como consulta, com legenda por dose e transparência; não altera automaticamente mapas locais ou exportações de máquinas. Safra e época podem acompanhar como metadados; preservar a semântica existente ao adotá-los.

## Topografia — PrecisionFarm → Invicta
`resource_type: "topography"`. Payload: `name: "altimetria"`, `status: "available"`, `value_unit: "m"`, `interval_m: 4`, `index_interval_m: 8`, `smoothed: true`, `geometry`: FeatureCollection LineString/MultiLineString.

Cada feature: `properties.elevation_m` numérico, múltiplo de4; `contour_interval_m:4`; `is_index:true` quando a elevação for múltipla de8; `color:"#e5a33b"` nas principais de8m e `"#466e9b"` nas demais. As cotas de8m aparecem uma única vez dentro da coleção4m. Usar elevation_m também como rótulo. A elevação fica em atributo, não exige coordenada Z.

Somente a versão validada internamente é publicável. Nova amostra ou limite invalida a validação. O mapa é de visualização; não substitui automaticamente o limite da outra plataforma. O envio não afirma precisão RTK ou datum vertical certificado: são elevações do relevo validado na PrecisionFarm.

## Verificação conjunta
Testar: prescrição seed e fertilizer com unidades; dose zero; unidade inválida rejeitada; repetição sem duplicação; versão02recusando tipo03semquebrarlinhas; topografia com duas cores e atributos; nova revisão atualizando o menu. Exemplos usam identidades fictícias e não devem ser importados nos talhões de produção.
