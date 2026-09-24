# Pendências numeradas — registro

O usuário numera as pendências da plataforma ("18 - adicionar gaveta expansiva
para talhões com multipolígonos..."). Este arquivo é o registro: **número →
título → versão que entregou**. É o que permite, meses depois, sair do número
que ele citou e chegar no código, no changelog e no commit.

## Como registrar (padrão obrigatório)

Ao entregar a pendência **N**:

1. **Título curto** criado por você, que diga o QUE mudou na tela (não o
   sintoma). É o título que entra aqui e no comentário do changelog.
2. **`src/constants/changelog.ts`** — a entrada da versão nova recebe, na linha
   acima, o comentário `// [N] <título>`; e o **primeiro item da lista começa
   com `PENDÊNCIA N — `** (o usuário lê essa lista no painel Config., então o
   número precisa aparecer para ele, não só no código).
3. **Commit** — `vX.Y.Z — [N] <título>`.
4. **Uma linha nova na tabela abaixo**, mais recente por último.

Uma versão pode fechar mais de uma pendência (`[16][17]`), e uma pendência pode
levar mais de uma versão (repete o número na linha seguinte, com a correção).

**O número é DO USUÁRIO.** Pedido que chegar em texto livre, sem número, entra
como `S/N` — nunca inventando o próximo número da lista dele. Em 2026-08-27 a
separação de área foi publicada como "PENDÊNCIA 19" por um palpite meu, e a 19
verdadeira (fusão de talhões) chegou depois; foi preciso renumerar.

## Registro

| Nº | Título | Versão | Onde na tela |
|---:|--------|--------|--------------|
| 18 | Áreas separadas do talhão, uma a uma | 2.81.0 | Produtores → fazenda → aba Talhões (gaveta no selo âmbar) |
| S/N | Separar uma área do talhão (desmembrar / anexar / excluir) | 2.82.0 | Talhão → Limite do talhão → "Talhão em N áreas — separar uma delas" |
| 18 | Nome do talhão sempre inteiro na lista (correção) | 2.83.1 | Produtores → fazenda → aba Talhões |
| 19 | Fundir dois talhões, escolhendo o nome que fica | 2.89.0 | Talhão → "Fundir com outro talhão" (e ao renomear para um nome existente) |
| 20 | Importação por planilha — feita na plataforma errada e revertida | 2.90.0 | Refeita na plataforma fitotécnica (Django) |
| S/N | Gaveta dos cenários salvos (produtos, dose, faixa e custo sem reabrir) | 2.100.0 | Talhão → Recomendações → Cenários salvos |
| 24 | Contraste e download em GeoTIFF na composição temporal | 2.101.0 | Talhão → NDVI → Composição temporal (e aba Camadas salvas) |
| 25 | Comparativo visual de camadas ao classificar zonas | 2.102.0 | Talhão → Zonas → Editor Manual → Sugerir classificação → "Ver a camada no mapa" |
| 26 | Incorporar divisas internas ao polígono atual do talhão | 2.107.0 | Talhão → Zonas → Zoneamentos e versões → ícone da tesoura |
| S/N | Convite individual libera o acesso na hora (sem aprovação); link de grupo mantém aprovação | 2.116.0 | Central de Acessos → Convites → "Convite para uma pessoa" + página pública /convite |
| S/N | "Gerar link" não trava mais em silêncio (erro aparece na tela) | 2.116.0 | Central de Acessos → Convites → "Gerar link" |
| S/N | Link de grupo também libera o acesso na hora (sem aprovação) | 2.117.0 | Central de Acessos → Convites → "Novo link" + página pública /convite |
| S/N | Painel do produtor: o que já está pronto em cada talhão | 2.120.0 | /portal (produtor) e /portal → "Ver como o produtor vê" (owner/admin) |
| S/N | Produtor com acesso a uma fazenda que não está no nome dele | 2.121.0 | /portal (produtor); Central de Acessos → usuário → Vínculos → fazendas |
| S/N | Talhão do produtor: só o que existe, e só para ver | 2.122.0 | /talhao/[id] como produtor; /portal em preview → clicar no talhão |
| S/N | Talhão do produtor: relevo, CE, zonas e colheita só para ver; satélite liberado | 2.123.0 | /talhao/[id] como produtor → abas Altimetria, Condutividade, Zonas, Produtividade, Compactação, NDVI |
| S/N | Talhão do produtor: fertilidade e amostragem sumiam sem plano; fertilidade e recomendações só ver + relatórios | 2.124.0 | /talhao/[id] como produtor sem plano → trilho; abas Fertilidade e Recomendações |
| S/N | Recomendações do produtor: clicar no cenário mostra os mapas | 2.125.0 | /talhao/[id] como produtor → aba Recomendações → clicar no cenário / produto |
| S/N | Produtor baixa direto: arquivos marcados, PDF da fertilidade e relatórios com "selecionar tudo" | 2.126.0 | /talhao/[id] como produtor → abas Arquivos, Fertilidade, Relatórios |
| S/N | Produtor: Arquivos, Relatórios e PDF da Fertilidade não abriam (permissão antiga) | 2.127.0 | /talhao/[id] como produtor → abas Arquivos, Relatórios, Fertilidade |
| 28 | Nome do relatório: talhão, ano e "recomendações completas" | 2.132.0 | Talhão → Relatórios → "Gerar relatório" (e Abrir do histórico) |
| S/N | Quem entra por link de convite não passa mais por aprovação | 2.135.0 | /convite?t=… (público) e Central de Acessos → Pendentes; exige rodar `docs/seguranca-rls.sql` |
| 36 | Mapas de fertilidade voltam a entrar nas Zonas de Manejo | 2.137.0 | Talhão → Zonas → Gerar zonas por similaridade → "Camadas a usar" |
| S/N | Clicar na recomendação abre o mapa dela na hora (fim do ícone de pasta) | 2.140.0 | Talhão → Recomendações → Cenários salvos (e a mesma tela como produtor) |
| S/N | O app parou de pedir login toda hora (sessão fora do armazenamento cheio) | 2.141.0 | Login da plataforma; selo de sincronização no alto da tela |
| S/N | Resultado do cenário abre abaixo dele; topo recolhível e estável | 2.142.0 | Talhão → Recomendações → "Nova recomendação" e Cenários salvos |
| 37 | Correção local entre colhedoras volta a processar mapas grandes | 2.143.0 | Talhão → Produtividade → Unificação → "+ correção local entre colhedoras (por raio)" |
| 38 | O valor de cada zona escrito no meio dela, longe das divisas | 2.144.0 | Talhão → Fertilidade (mapa por zona) e o PDF "Layout Oficial Fertilidade" |
| 39 | Gerar recomendação não fecha mais a janela de produção | 2.145.0 | Talhão → Recomendações → "Nova recomendação" + "Aplicar e salvar" |
| 40 | Gráfico das cenas do período e processamento em lote | 2.146.0 | Talhão → NDVI / Satélite → Imagens & índices → "Gráfico do período" |
| 40 | Busca automática de imagens de madrugada, com regras e exclusão em massa | 2.147.0 | Talhão → NDVI → "Busca automática de madrugada" e aba "Camadas salvas"; Produtores → fazenda → Talhões → "Monitoramento por satélite" |
| 38 | O relatório escreve o valor da zona no mesmo ponto que a tela (correção) | 2.148.0 | Talhão → Relatórios → "Gerar relatório" (mapas de fertilidade por zona) |
| S/N | Guardar e usar viraram coisas diferentes: a marca de fonte de análise (◎) | 2.149.0 | Talhão → NDVI → painel do índice e aba "Camadas salvas"; aviso na aba Zonas |
| 38 | O relatório por zona não tem mais como voltar aos pontos de coleta (correção) | 2.150.0 | Talhão → Relatórios → "Gerar relatório"; Talhão → Fertilidade → "Processar em zona" (vínculo agora gravado com o mapa) |
| S/N | Mapa preto: todo raster voltou a aparecer (correção) | 2.151.0 | Qualquer mapa do talhão — NDVI, Fertilidade, Altimetria, Condutividade, Compactação, Produtividade, Recomendação e o fundo das Zonas |
| 41 | Amostragem composta: células quadráticas com as subamostras distribuídas dentro | 2.152.0 | Talhão → Amostragem → Composta; app de campo; Fertilidade/Recomendação por célula |
| 42 | Mapa de colheita entra como camada nas Zonas de Manejo | 2.154.0 | Talhão → Zonas → Gerar zonas por similaridade → "Camadas a usar" (botões "Produtividade <cultura> <ano>") |
| 43 | Catálogo de variáveis protegido contra apps de campo desatualizados | 2.155.0 | Biblioteca → Preferências de Análise (casas decimais/ordem apagadas em 13/09 por um app de campo antigo); banco: rodar `docs/seguranca-rls.sql` DEPOIS de publicar a 2.155.0 |
| 44 | Volumes por zona (taxa, ha e t) em todo cenário com zoneamento | 2.156.0 | Talhão → Recomendações → cenário aberto → tabela "Volumes por zona" / "Recomendação por zona" (abaixo da lista de produtos) |
| 44 | A taxa e as toneladas de cada zona escritas no mapa (correção) | 2.158.0 | Talhão → Recomendações → cenário aberto → mapa (valor no meio de cada zona, com as divisas) |
| 46 | Prescrições com linha própria nas permissões de acesso | 2.161.0 | Configurações → Usuários e permissões → pessoa → matriz (linha "Prescrições (taxa variável)"); Talhão → Prescrições |
| 46 | Altimetria com linha própria nas permissões de acesso | 2.162.0 | Configurações → Usuários e permissões → pessoa → matriz (linha "Altimetria (MDE/relevo)"); Talhão → Altimetria |
| 46 | Condutividade com linha própria nas permissões de acesso | 2.163.0 | Configurações → Usuários e permissões → pessoa → matriz (linha "Condutividade elétrica (CE)"); Talhão → Condutividade |
| S/N | Matriz padrão dos papéis marcável (vale para todos do papel) | 2.164.0 | Central de Acessos → Permissões → "Padrão do papel" |
| 46 | Compactação e Produtividade obedecem todas as colunas da matriz | 2.165.0 | Central de Acessos → Permissões (linhas "Compactação" e "Produtividade/colheita"); Talhão → Compactação e Produtividade |
| S/N | Prescrição usa só o zoneamento padrão (estrela) | 2.166.0 | Talhão → Prescrições → Nova → "Zoneamento" |
| 46 | Satélite (NDVI) obedece a matriz; NDVI e Produtividade entram nos planos do portal | 2.167.0 | Central de Acessos → Permissões (linha "Satélite (NDVI/índices)") e → Empresas → Planos do portal; Talhão → NDVI / Satélite |
| 46 | Fertilidade e Zonas de Manejo obedecem todas as colunas da matriz | 2.169.0 | Central de Acessos → Permissões (linhas "Fertilidade (interpolação)" e "Zonas de manejo"); Talhão → Fertilidade e Zonas de Manejo |
| S/N | Produtividade importada em t/ha ou sc/ha é convertida para kg/ha | 2.173.0 | Talhão → Produtividade → 1 Importar máquinas (seletor de unidade ao lado de cada máquina) |
| 54 | Produtividade na Zona de Manejo com prévia em quantil | 2.174.0 | Talhão → Zonas de Manejo → 1 Configurar (clicar na camada de produtividade) e → Camada de fundo |
| S/N | Book e relatórios em PDF não caem mais por causa do logo (jsPDF sem pedido de rede síncrono) | 2.176.0 | Talhão → Recomendações → Gerar book PDF (portal do produtor) e todos os relatórios em PDF |
| S/N | Trilho do talhão no portal obedece a coluna "Ver" da matriz de permissões | 2.178.0 | Talhão (modo produtor / preview) → trilho de abas; Central de Acessos → Permissões → Produtor |
| S/N | Portal do produtor ganha o botão "Mapa da fazenda" (mapa em somente leitura) | 2.179.0 | Portal do produtor → "Mapa da fazenda"; /painel em modo produtor (topo, barra lateral, painéis de cliente/fazenda/talhão) |
| S/N | Catálogo de variáveis se cura sozinho depois de um app antigo apagá-lo | 2.175.0 | Biblioteca → Preferências de Análise (Fe ligado, 2 casas nos micros, ordem padrão) e Console: "[catálogo] seed de app de campo antigo detectado" |

> As pendências 1–17 foram entregues antes deste registro existir e não estão
> catalogadas; procure pelo assunto no `changelog.ts`. Da 18 em diante, tudo
> passa por aqui.
