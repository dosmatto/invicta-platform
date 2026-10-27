# PrecisionFarm x Invicta - ponte de integração 0.2.0

22/10/2026 | Segunda rodada técnica | Implementação e validação controlada

## 1. O que está construído na PrecisionFarm

A ponte 0.2 implementa credenciais de serviço por parceria e ambiente, vínculo confirmado por talhão, catálogo, inventário, revisões imutáveis, publicação explícita, fila de avisos, reenvio, recibos e recuperação por cursor. O recebimento mantém as revisões da Invicta em um espelho separado dos projetos editáveis locais.

A preparação está publicada na PrecisionFarm, com o serviço saudável e a comunicação externa desabilitada. O painel administrativo está disponível; a API de parceiro retorna 503 até a habilitação acordada do piloto.

Os testes usam uma Invicta simulada. A validação entre os ambientes reais ainda depende da URL, das credenciais e da implementação correspondente na Invicta. Não há transferência automática de dados reais antes da configuração e habilitação do ambiente.

A comunicação externa pode permanecer desabilitada enquanto os cadastros e vínculos são preparados. Um novo acesso nasce sem talhões vinculados: a chave, isoladamente, não libera o catálogo de clientes.

Aceitamos os ajustes da resposta de 22/10: linhas sem safra obrigatória; verão/inverno como ciclo; safra de colheita AAAA/AAAA e época main/second; colheita em kg/ha; IDs locais opacos preservados; UUIDs compartilhados confirmados entre as equipes.

## 2. Como o usuário trabalha nas duas plataformas

PrecisionFarm: Ferramentas do talhão > Integração Invicta. O administrador escolhe a parceria e o talhão, confirma cliente/fazenda/área e registra os identificadores acordados. O pareamento nesta entrega é manual; não há confirmação automática por nome, centroide ou distância.

Publicação: primeiro Publicar limite atual; depois escolher o projeto finalizado, operação, ciclo e espaçamento nominal opcional e usar Publicar linhas finalizadas. Cada ação cria uma revisão apenas se o conteúdo mudou. O projeto local e os rascunhos não são enviados automaticamente ao serem editados.

Invicta, conforme proposta da parceira: um módulo Linhas espelha as camadas publicadas. Linhas válidas atualizam automaticamente, preservando histórico; uma alteração de limite exige comparação e aceite manual. Esta interface é de responsabilidade da Invicta e ainda requer implementação e teste deles.

PrecisionFarm recebe zonas consolidadas e colheita oficial. Consultar dados disponíveis lista o inventário remoto; Buscar revisão inicia a carga; Sincronizar agora executa a consulta e o recebimento. A tela mostra nome, origem, revisão e pendências. Visualizar abre a camada em modo de leitura, com cores e legenda; Recolher libera o espaço do mapa.

Zonas usam potential_rank (1 maior potencial, 5 menor). Colheita em GeoJSON usa properties.value em kg/ha; COG/GeoTIFF tem uma prévia de até 384 pixels por lado, sem transformar os valores em índice normalizado. O arquivo original é preservado com checksum. A faixa da legenda raster corresponde à prévia, não a uma estatística integral da área.

O limite recebido de outra origem permanece aguardando análise e não substitui o limite local. Para o piloto, a PrecisionFarm publica limites e linhas; a Invicta fornece zonas e colheita. Prescrições de aplicação ficam para a próxima etapa.

## 3. Credenciais e identidade

Cada ambiente tem uma parceria própria e uma chave Bearer emitida por cada plataforma. Na PrecisionFarm, a chave de entrada é exibida uma única vez e armazenada como hash. É possível revogar o acesso ou rotacionar a chave; a rotação invalida imediatamente a anterior e mantém os vínculos.

Há dois segredos HMAC independentes: PrecisionFarm > Invicta e Invicta > PrecisionFarm. Podem ser propostos na criação do acesso; se a Invicta emitir o segredo de sua direção, ele é configurado na PrecisionFarm. A chave remota e os segredos HMAC ficam cifrados em repouso com uma chave do servidor.

Requisições de serviço usam HTTPS e Authorization: Bearer <chave>. POST /notifications e /receipts exigem também X-PF-Timestamp, em segundos Unix, e X-PF-Signature, hexadecimal minúsculo. A assinatura é HMAC-SHA256(segredo, timestamp + "." + bytes UTF-8 exatos do corpo). O segredo é usado como texto UTF-8, sem decodificar o hexadecimal. Tolerância: 300 segundos; não formatar o JSON novamente após assinar.

O vínculo registra shared_producer_id, shared_farm_id e shared_field_id, além dos IDs locais de cada sistema, fazenda, responsável e data da confirmação. Reutilizar os UUIDs do mesmo cliente e fazenda nos demais talhões. Uma troca de proprietário suspende o vínculo. Renomear não altera a identidade.

URLs e credenciais reais devem ser trocadas pelo canal acordado entre as equipes. Para o piloto, cadastrar apenas um talhão do Condomínio Figueira. O escopo efetivo da chave é a lista de vínculos confirmados daquela parceria.

## 4. Contrato HTTP 0.2.0

Base da PrecisionFarm: https://precisionfarm.com.br/integration/v1. O ambiente é retornado por /capabilities; enquanto a comunicação estiver desabilitada, a API de serviço responde 503. A URL da Invicta deve terminar em /integration/v1. A implementação atual aceita conexão com IPv4 público, HTTPS válido e sem redirecionamentos.

GET /capabilities informa versão, ambiente, tipos, formatos e limites. GET /catalog lista apenas os talhões vinculados. GET /fields/{shared_field_id}/inventory lista limite e camadas publicadas, com revisões e metadados. GET /resources/{id}/revisions/{n} devolve o envelope completo de uma revisão.

GET /changes?cursor=0&limit=100 recupera os eventos. As respostas paginadas têm items, next_cursor (string) e has_more. O cursor é opaco ao consumidor: persistir o next_cursor apenas depois de gravar os eventos localmente. Limite de 200 itens por página.

POST /notifications recebe o aviso sem geometria, mas com checksum e todos os identificadores da revisão. Responde 202 após persistir na fila. Reenvio do mesmo event_id e conteúdo não duplica; reutilização do event_id com conteúdo diferente responde 409. POST /receipts registra o resultado do evento enviado.

A carga inicial usa o evento da revisão vigente em inventory.items[].event, no mesmo formato de /changes. Isso evita inventar um event_id na plataforma consumidora. A PrecisionFarm também fornece esse campo em seu inventário.

Envelope: contract_version, event_id, source_system, shared_producer_id, shared_farm_id, shared_field_id, resource_id, resource_type, resource_revision, base_revision, boundary_revision, occurred_at, operation e payload. resource_id identifica a camada estável; a largura não participa da chave. Revisões são snapshots completos, nunca deltas.

resource_revision começa em 1 e base_revision é resource_revision - 1. Uma revisão posterior pode ser recebida antes de outra; a tela usa sempre a maior revisão, sem regressão. Datas são ISO 8601 UTC com Z. operation é upsert ou archive. A revisão anterior e o recurso local de origem são preservados.

boundary_revision pertence ao sistema de origem do recurso. O número isolado não comprova equivalência com o contador do outro sistema. Na carga piloto, as equipes devem confirmar a correspondência entre os limites; a tela identifica o limite de origem e pede essa conferência.

Limites: GeoJSON até 10 MB por revisão, notificações até 256 KB, até 1 milhão de vértices e 100 mil feições por coleção. Coordenadas WGS84 [longitude, latitude], sem arredondamento. Furos e multipartes são preservados; geometria inválida é recusada sem reparo automático.

COG/GeoTIFF: banda única em EPSG:4326, produtividade física, nodata declarado no arquivo, até 64 MB e 16 milhões de células. O descritor asset contém format, crs, size_bytes, sha256 e url; expires_at é opcional. A URL pode ser temporária, mas deve permanecer na mesma origem HTTPS configurada. CDN externa e GeoJSON acima de 10 MB precisam de uma extensão negociada do contrato.

Checksum: SHA-256 da serialização canônica do envelope, com chaves ordenadas recursivamente e arrays na ordem original. Apenas payload.asset.url e payload.asset.expires_at ficam fora do checksum da revisão, pois podem ser renovados. O conteúdo do arquivo é verificado separadamente por asset.sha256 e size_bytes. O exemplo JavaScript incluído reproduz o cálculo.

Respostas: 401 chave/assinatura inválida; 403 função administrativa não autorizada; 404 recurso fora do vínculo ou inexistente; 409 identidade/revisão conflitante; 413 corpo excedido; 422 contrato/geometria/unidade inválida; 503 integração ainda desabilitada.

## 5. Recebimento, filas e consistência

Publicação e evento são gravados na mesma transação SQLite da ponte. As revisões usam chave única por recurso/revisão. Repetir a publicação idêntica não cria aviso novo. A ponte tem banco próprio para não misturar transações com as edições do aplicativo.

O worker verifica ambiente e versão remotos, envia avisos pendentes e busca revisões. O ciclo normal é de 30 segundos; /changes é consultado a cada 10 ciclos ou pelo comando Sincronizar agora. Falhas transitórias usam reenvio exponencial, de 10 segundos até 1 hora. O cursor é persistido depois de enfileirar a página.

A revisão só entra no espelho após validar vínculo, contrato, checksum, geometria e unidades. Um erro permanente mantém a revisão anterior e gera recibo rejected. Falha temporária mantém a tarefa para nova tentativa. received/applied não significam que o limite local foi substituído: no piloto, applied confirma o armazenamento do espelho.

Revisões antigas são armazenadas, mas não substituem uma mais nova. Exclusão de um projeto publicado gera archive ao ser detectada pelo worker. Exclusão do talhão arquiva os recursos publicados e conserva tombstones consultáveis. Transferência para outro cliente suspende o acesso, sem transferir dados automaticamente.

Na Invicta, pedimos que o outbox e /changes sejam construídos junto da atualização automática de linhas. Uma linha baseada em limite ainda desconhecido deve aguardar a dependência ou ser identificada como baseada em limite anterior, sem substituir silenciosamente a referência.

As geometrias recebidas não são recortadas contra o limite vigente. A mudança do limite não reprocessa zonas ou colheita automaticamente. O vínculo por versão e a necessidade de reprocessamento devem permanecer visíveis nas duas plataformas.

## 6. Validação e próximos passos conjuntos

Validado em ambiente controlado: snapshots imutáveis; revisões concorrentes e outbox atômico; chaves com escopo; segredos cifrados; HMAC e expiração; repetição de evento; reenvio após falha; histórico de revisões recebidas; paginação; revogação/rotação; bloqueio após troca de cliente; archive por exclusão; GeoTIFF físico com nodata. A inicialização normal da plataforma também passou nos testes.

O que precisamos da Invicta: confirmar o contrato 0.2.0; fornecer /capabilities e URLs de teste; emitir Bearer e acordar os dois segredos HMAC; escolher um talhão da Figueira com zoneamento consolidado e colheita oficial; informar seus IDs locais e confirmar os UUIDs compartilhados.

Confirmar nomes de campos das zonas: properties.zone_id (texto estável dentro da revisão), properties.potential_rank (inteiro 1 a 5), class_name opcional; várias feições podem compartilhar zone_id. Para células de colheita: properties.value numérico não negativo, unidade kg/ha. Para a primeira carga, incluir event no inventário.

Testes conjuntos: consultar inventários dos dois lados; carregar limite/linhas e zonas/colheita; comparar mapa, unidade e furos; publicar uma nova linha; simular alteração de limite com aceite manual na Invicta; publicar nova zona; repetir aviso; interromper a rede e recuperar por cursor; arquivar um recurso; testar credencial revogada e recurso fora do vínculo.

Aceite do piloto: a mesma área aparece vinculada nos dois sistemas; nenhuma camada é sobrescrita por rascunho; revisões chegam sem duplicar; um limite não é aceito automaticamente; falhas preservam o dado vigente; as unidades e geometrias conferem. Após aceite técnico, ampliar por talhão, com os mesmos UUIDs de cliente e fazenda.

Ficam para alinhamento: estimativa e agenda da equipe Invicta; mapa real disponível; equivalência entre revisões de limite; necessidade de CDN e arquivos maiores; tratamento de mudanças incompatíveis em /integration/v2. Não há dependência de uma migração do banco da Invicta para PostGIS.

