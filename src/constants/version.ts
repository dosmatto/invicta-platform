export const APP_VERSION = '0.67.1';

export const CHANGELOG: Record<string, string[]> = {
  '0.67.1': [
    'Correção (Zonas de Manejo): linhas verticais brancas que apareciam cortando as zonas. Eram costuras da vetorização (os "quadradinhos" de célula não fechavam na mesma borda e a zona se fragmentava). Agora cada zona sai como um polígono contínuo',
    'Na geração de zonas, as camadas começam DESMARCADAS — você escolhe quais entram (antes vinham todas marcadas)',
  ],
  '0.67.0': [
    'Zonas de Manejo (MEAP) — Fase M2 (similaridade): a geração de zonas agora é por CLUSTERIZAÇÃO dos mapas JÁ interpolados (não reinterpola). Na aba Zonas de Manejo você escolhe quais CAMADAS usar (argila, CTC, MO, P…), o algoritmo (Fuzzy c-means ou K-means) e o nº de zonas',
    'O nº ótimo de zonas é sugerido pelos índices FPI e NCE (método MZA/Fridgen): a plataforma roda o fuzzy c-means para 2 a 6 zonas e mostra um gráfico — o mínimo das curvas é o número recomendado',
    'As zonas saem coloridas no mapa (preview, não salva ainda). Próximo: área mínima de zona, ordenação manual/sugerida (produtividade, NDVI, MO, CTC) e salvar como versão do MEAP',
  ],
  '0.65.1': [
    'Zonas de Manejo (MEAP) virou um MÓDULO PRÓPRIO: nova aba "Zonas de Manejo" na página do talhão (entre Amostragem e Produtividade), com as zonas coloridas no mapa + a homogeneidade (CV) por zona. Saiu do Resumo (não é mais um card lá)',
  ],
  '0.65.0': [
    'Zonas de Manejo (MEAP) — Fase M1: a aba Resumo do talhão agora mostra um card real "Zonas de Manejo (MEAP)" com as suas zonas importadas, a área e o % de cada uma, e a HOMOGENEIDADE INTERNA (CV) de cada zona calculada dos resultados de laboratório (uma zona boa é homogênea = CV baixo)',
    'O CV é calculado na escala original dos atributos (argila, P, K…), por zona, usando os pontos de lab que caem dentro de cada zona. A "variável de validação" (headline) prioriza argila/textura, depois CTC/saturações, depois macronutrientes',
    'Sem resultados de laboratório casados à grade, o card aparece com as zonas e CV "—" (honesto). Convergência fica "—" até existir uma 2ª versão (versionamento real vem nas próximas fases). Documentação técnica completa em docs/13.00–13.99 (MEAP)',
  ],
  '0.64.1': [
    'Correção (Amostragem · Grid): o simulador não desenha mais pontos no mapa sozinho. Antes, ao abrir a aba, ele gerava uma grade com a densidade padrão (ex.: 26 pontos) mesmo sem você escolher um Padrão de Amostragem. Agora o grid só aparece depois que você seleciona um Padrão (o "comando de grid")',
  ],
  '0.64.0': [
    'Município automático na Fazenda: na aba Dados da fazenda, botão "Detectar município (pelos talhões)" preenche município/UF a partir do polígono dos talhões (via OpenStreetMap). Se os talhões pegarem mais de um município, lista todos',
  ],
  '0.63.0': [
    'Produtor + Assinatura (Fase U3.B): novo papel Produtor. Ao convidar um Produtor, você escolhe o Cliente dele + o Plano de assinatura',
    'Planos de assinatura editáveis (aba Usuários, só Owner): renomeie e marque quais seções do portal cada plano libera (Resumo, Fertilidade, Amostragem, Recomendações, Compactação, Relatórios, Arquivos). Sementes: Básico/Intermediário/Completo',
    'Portal do Produtor (/portal): o produtor logado cai no portal, vê só o cliente dele (fazendas → talhões), abre a página do talhão somente-leitura com as abas que o plano libera',
  ],
  '0.62.0': [
    'Convite de usuário (Fase U3): na aba Usuários (Biblioteca), o Owner digita o e-mail + papel e clica "Convidar" — o app CRIA a conta de login e gera uma senha provisória para você repassar (sem precisar do Console do Firebase)',
    'No 1º acesso, o usuário convidado é OBRIGADO a definir uma nova senha antes de usar o app',
    'Se a conta já existir, o papel é atribuído mesmo assim (sem nova senha)',
  ],
  '0.61.1': [
    'Correção: a Safra no topo ficava travada (24/25) mesmo trocando a safra ativa. Agora o topo mostra a safra ativa de verdade e atualiza ao trocá-la',
  ],
  '0.61.0': [
    'Biblioteca agora abre em TELA CHEIA (sem o mapa do lado) — mais espaço para trabalhar nas equações, recomendações, legendas, padrões etc. Fechar volta para o mapa',
    'Usuários saiu do menu lateral e virou uma aba DENTRO da Biblioteca (só Owner/Admin veem) — centraliza a configuração num lugar só',
  ],
  '0.60.1': [
    'Permissões por papel: matriz reorganizada para caber no painel (rótulos curtos nas colunas Admin/Agrôn./Oper. e nas capacidades; passe o mouse para ver o nome completo) — antes a coluna do Operador estourava a largura',
  ],
  '0.60.0': [
    'Permissões por papel (Fase U2): novos papéis Agrônomo e Operador de campo + matriz CONFIGURÁVEL pelo Owner (aba Usuários) — liga/desliga, por papel, o que cada um pode fazer (cadastro, excluir produtor, amostragem, importar laudo, fertilidade, recomendações, biblioteca, relatórios)',
    'Defaults: Agrônomo só Recomendações + relatórios; Operador só Amostragem. Owner/Admin têm tudo (não mudou nada para vocês)',
    'As travas foram aplicadas nas telas: Produtores (cadastro/excluir), Amostragem (salvar grade), Importar laudo, Fertilidade (processar), Recomendações, Biblioteca (Equações/Recomendações — ver, não editar) e Relatórios',
  ],
  '0.59.1': [
    'Aba Usuários agora é REAL: removidos os usuários de exemplo chumbados no código (Admin Invicta, Carlos Técnico, etc.); mostra os papéis de acesso reais por e-mail (william=Owner, jhon=Admin) e o Owner adiciona/edita/remove ali mesmo',
    'A gestão de papéis saiu de Config → Empresa (que ficou só com nome da empresa) e foi para a aba Usuários',
  ],
  '0.59.0': [
    'Usuários/Papéis (Fase U1 — fundação): o acesso agora é por E-MAIL, não mais "todo login vira admin". william@invicta.agr.br = Owner, jhon@invicta.agr.br = Admin',
    'Novo papel Owner (acima de Admin). E-mail sem papel atribuído fica BLOQUEADO (tela "acesso não liberado") até um Owner liberar',
    'Configurações → Empresa: gestão de papéis por e-mail (o Owner adiciona/edita/remove e-mails e papéis). A limpeza de base (invLimparBase) passou a ser Owner-only',
    'Agrônomo / Operador de campo / Produtor / Amostrador ficam para as próximas fases (U2/U3)',
  ],
  '0.58.0': [
    'Equações: novo campo "Grupo" (rótulo livre, ex.: Calcário, Gesso, KCl) com autocomplete dos grupos já criados. A lista de equações passa a ser AGRUPADA por esse rótulo, com cabeçalhos que recolhem (e contador). "Sem grupo" fica por último; a busca continua funcionando',
  ],
  '0.57.0': [
    'Equações: novo campo "Dose máxima" (teto). Quando a equação ultrapassa esse valor, a dose é limitada ao teto no mapa (a mínima já existia). 0 = sem máximo',
    'Produtores: admin pode EXCLUIR um produtor — apaga em cascata tudo dele (fazendas, talhões, análises, grades, mapas e cenários), exigindo digitar "APAGAR" antes',
    'Produtores: opção de EDITAR um cliente (corrigir nome/sigla/documento/contato/município) — ícone de lápis na lista',
    'Manutenção (admin, sem botão — via Console F12): para começar do zero mantendo a Biblioteca, rode  await invLimparBase("APAGAR TUDO")  — faz backup JSON automático e apaga só os dados operacionais (local + nuvem)',
  ],
  '0.56.0': [
    'Fertilidade por Zona (Z1): quando a importação de laboratório está ligada a uma grade de Zonas de Manejo, o mapa do nutriente fica CONSTANTE por zona (sem interpolação) — cada zona recebe o valor da sua amostra composta',
    'Na aba Fertilidade aparece a tabela de vínculo "zona ↔ nº da amostra" (sugerido pela ordem, editável); ao processar, o mapa de cada zona é gerado no front-end e salvo na nuvem igual aos mapas interpolados',
    'Como o mapa por zona usa o mesmo formato dos interpolados, TODO o módulo de Recomendações reusa sem mudança: aplicar recomendação/equação, cenários, comparador, PDFs e Shapefile de taxa variável funcionam por zona',
  ],
  '0.55.1': [
    'Dividir aplicação agora é escolhido na HORA de aplicar (aba Recomendações, ao selecionar a recomendação), não fixo na Biblioteca: marque "Dividir aplicação por limite máximo" + o limite e aplique',
  ],
  '0.55.0': [
    'Dividir aplicação (Recomendações): na recomendação dá para ativar "Dividir aplicação por limite máximo" (ex.: 4 t/ha por passada). Ao aplicar, a dose total é dividida em um GRUPO de mapas — aplicação 1, 2, 3… — cada um limitado ao máximo por passada',
    'Cada passada vira um mapa próprio (já marcado para uso), com seu PDF oficial e seu Shapefile na aba Arquivos. Ex.: necessidade de 9 t/ha com limite 4 → 3 mapas (4 + 4 + 1)',
    'O limite pode ser informado em t/ha ou kg/ha (convertido para a unidade da dose)',
  ],
  '0.54.4': [
    'Correção: pH não tem unidade de medida — "CaCl₂" é o método de extração, não a unidade. A legenda de pH passou a ter unidade vazia e CaCl₂ só como método (corrige o cabeçalho dos layouts/relatórios)',
  ],
  '0.54.3': [
    'Shapefile: corrigido o tamanho das células — agora reamostra numa grade FIXA de 20×20 m (antes saía com a resolução fina do grid, tipo 5×5)',
    'Shapefile: as células da borda transbordam um pouco o talhão (dose do vizinho mais próximo), então ao "clipar pela borda" o polígono fica 100% preenchido — acabou a faixa vazia na beira',
  ],
  '0.54.2': [
    'Shapefile: o ZIP já vem com a PASTA do monitor (ex.: Dados/Mapas, AgData/Prescriptions, Rx…) — é só descompactar na raiz do pen drive e colar. Opção alternativa "só os arquivos" sem pasta',
    'Nome curto do arquivo: talhão + produto (ex.: AFSSA_09_calc). Trimble separado em GFX750 (AgData) e CFX750 (AgGPS)',
  ],
  '0.54.1': [
    'Shapefile: agora é uma célula por pixel (20×20 m), sem mesclar, com a TAXA de cada célula. Duas opções: "sem clipar" (células inteiras, borda em escada) ou "clipar pela borda do talhão" (células da beira recortadas no polígono)',
  ],
  '0.54.0': [
    'Arquivos: gera o Shapefile de taxa variável (.shp/.shx/.dbf/.prj em .zip) de cada mapa marcado — zonas por classe de dose com a TAXA (média da classe). Botão SHP por mapa na aba Arquivos',
    'Seletor de monitor/máquina (Stara, Trimble, John Deere, Raven, Muller, AgLeader e demais) que mostra em qual pasta do pen drive copiar os arquivos',
  ],
  '0.53.1': [
    'Marcar "Para uso" agora é por MAPA (dose), não pelo cenário inteiro: no resultado da recomendação, clique na ★ de cada mapa que será utilizado (ex.: usar V80 e não V70). A marcação é salva',
    'A aba Arquivos passa a listar os MAPAS marcados e gera o PDF/JPG só deles',
  ],
  '0.53.0': [
    'Marcar cenário "Para uso" (estrela) em Recomendações → Cenários salvos: marque um ou mais cenários que serão realmente utilizados',
    'Aba Arquivos (nova): lista os cenários marcados e gera o mapa final de recomendação — PDF oficial e imagem JPG (satélite + dose) por produto',
    'Arquivos de taxa variável (Shapefile por marca de monitor) vêm na próxima etapa',
  ],
  '0.52.3': [
    'Legenda da dose: a primeira faixa agora começa sempre em 0 (ex.: "0 – 500" em vez de "500 – 500"). Quando há valor mínimo com zero transparente, essa faixa aparece como transparente (não recebe) — vale no plano de aplicação, no comparador e nas legendas em tela',
  ],
  '0.52.2': [
    'Estilo da equação: ao adicionar/remover classes, as cores são redistribuídas na rampa verde→vermelho (com tons intermediários) em vez de repetir o vermelho. Novo botão "Distribuir cores" reaplica a rampa quando quiser',
  ],
  '0.52.1': [
    'Recomendação Oficial (C2): Resumo Técnico reordenado (Área total → Dose média → mínima → máxima → Quantidade total) e Resumo Financeiro simplificado para só o Custo estimado do produto (por ha e total) — sem as linhas que confundiam',
    'Legenda de dose passa a vir com 10 faixas por padrão (verde → vermelho, de 1.000 em 1.000 kg/ha) nas equações novas',
  ],
  '0.52.0': [
    'Recomendação Oficial (PDF C2) + Book em lote: na aba Recomendações, seção "Book de recomendações" lista todas as recomendações (todas marcadas por padrão) — clique em "Gerar book PDF" e sai um único PDF com a página oficial de cada recomendação marcada (uma página por produto), pronto para apresentar ao produtor',
    'Página oficial (layout aprovado): cabeçalho + barra lateral (produtor/fazenda/cultura, resumo técnico, plano de aplicação com faixa·cor·área·%, resumo financeiro) e o mapa grande (satélite + dose) à direita',
    'Ao gerar o book, cada cenário é aplicado e salvo automaticamente (aparece em "Cenários salvos"); depois é só apagar os que não for usar',
  ],
  '0.51.1': [
    'Correção: o "Gerar PDF" do comparador não abria nada — a aba era aberta depois de carregar a logo (após um await), então o navegador bloqueava o popup. Agora a aba abre antes e, se mesmo assim for bloqueada, o PDF é baixado automaticamente',
  ],
  '0.51.0': [
    'PDF do Comparador de Cenários (layout oficial, A4 paisagem): no comparador, botão "Gerar PDF" cria o relatório com cabeçalho INVICTA, os mapas (satélite + dose) lado a lado — recomendado com ★ + moldura verde —, legenda única e os resumos Técnico e Financeiro; uma página por produto',
    'Equação agora tem Frete (R$/ha) e Aplicação (R$/ha): o custo por hectare passa a ser produto + frete + aplicação (financeiro completo no comparador e no PDF). Cenários gerados antes disso precisam ser regerados para o financeiro detalhado',
  ],
  '0.50.0': [
    'Comparador de Cenários (Fase R4 / C1): marque 2 ou 3 cenários salvos e clique "Comparar" → abre uma tela com eles lado a lado',
    'Escolha um produto no topo e os mapas dos cenários aparecem com a MESMA legenda/escala/classes; comparação financeira por cenário (custo total e por ha) com destaque do mais barato',
  ],
  '0.49.2': [
    'Cenário salvo automaticamente ao aplicar (nada se perde): o botão virou "Aplicar e salvar" e o cenário já fica gravado na nuvem; reprocessar a mesma recomendação+importação sobrescreve (não duplica)',
    'Nome do cenário pode ser definido antes de aplicar; em "Cenários salvos" dá para apagar manualmente o que não for usar',
  ],
  '0.49.1': [
    'Cenário: cada dose agora mostra o NOME DA EQUAÇÃO em destaque (antes aparecia só o produto — "Calcário"/"Calcário" ficava idêntico). O produto vai na linha de baixo, e a legenda também usa o nome da equação',
  ],
  '0.49.0': [
    'Recomendações (Fase R3.B): além de aplicar 1 equação, dá para aplicar uma RECOMENDAÇÃO inteira (todas as equações dela de uma vez) → vários mapas de dose, um por produto; clique em cada produto para ver seu mapa',
    'Resumo financeiro consolidado do cenário: custo total (soma dos produtos) e custo por hectare',
    'Salvar cenário na nuvem: o cenário (mapas de dose + financeiro) fica guardado e pode ser reaberto depois na lista "Cenários salvos" (base para o comparador de cenários da próxima fase)',
    'Quando alguma equação não pode ser aplicada (falta interpolar um atributo), as demais ainda funcionam e o motivo aparece na tela',
  ],
  '0.48.1': [
    'Dose mínima viável por equação: você define um valor X (na unidade de tratamento) e escolhe o que fazer abaixo dele — zerar (não aplicar) ou aplicar a própria dose mínima. Ex.: calcário só compensa a partir de uma dose',
    'O ajuste vale no teste ao vivo da equação e na aplicação ao mapa (Recomendações)',
  ],
  '0.48.0': [
    'Recomendações (Fase R3.A): a aba Recomendações da página do talhão agora APLICA uma equação aos mapas de fertilidade da safra e gera o MAPA DE DOSE direto no mapa (álgebra pixel a pixel, no navegador), com estatísticas (mín/média/máx), total estimado e custo',
    'A equação agora guarda a PROFUNDIDADE que ela lê (campo em Detalhes) — ao aplicar é automático, sem perguntar profundidade',
    'Mensagens claras quando falta interpolar algum atributo que a equação usa, ou quando os mapas têm pixels diferentes',
    'Salvar o cenário, aplicar a recomendação inteira (várias equações) e a comparação financeira entre cenários vêm na próxima etapa (R3.B / R4)',
  ],
  '0.47.0': [
    'Biblioteca → Recomendações (Fase R2): uma recomendação é um conjunto de equações (ex.: Corretivos, Fosfatagem, KCl). Editor numa página só com seletor de equações em chips (buscar, adicionar, remover), além de nome, culturas e descrição',
    'Mesma praticidade das Equações: lista única + busca, clonar e "Salvar como", e a recomendação nasce compartilhada (todos da empresa veem)',
    'Aplicar a recomendação a um talhão e gerar os mapas de dose + comparação financeira vem na próxima fase (R3 — Cenários)',
  ],
  '0.46.1': [
    'Equações mais prática: lista única (sem as abas Meus/Empresa/Sistema) com busca, e o editor virou uma página só (Detalhes → Equação → Estilo num rolar só, sem trocar de aba)',
    'Clonar equações: botão de clonar na lista + "Salvar como" no editor — abra uma equação, faça pequenas alterações e salve como nova sem mexer na original',
    'Equações novas e clonadas nascem compartilhadas: todos os usuários da empresa enxergam (antes uma equação "minha" ficava invisível para o outro)',
  ],
  '0.46.0': [
    'Biblioteca → Equações (Recomendações, Fase R1): cadastro de equações de recomendação com 3 abas — Detalhes (produto, custo/tonelada, unidades, tratamento, culturas, fases), Equação (constantes + fórmula) e Estilo (escala fixa de cores por classe de dose)',
    'Linguagem de equação nova, simples e funcional (estilo Excel pt-BR): atributos pelo nome (V, CTC, Ca, K…), decimal com vírgula, argumentos com ponto-e-vírgula, funções se/max/min/arredonda/raiz/abs e "não permitir dose negativa" por opção (sem código de clamp)',
    'Validação e teste ao vivo: a fórmula é conferida enquanto se digita e dá para testar o resultado com valores de amostra; equações sincronizam na nuvem e respeitam os escopos Meus/Empresa/Sistema',
    'Aplicar a equação a um talhão e gerar o mapa de dose vem na próxima fase (R3 — Cenários)',
  ],
  '0.45.3': [
    'Correção (Relatórios "mapas sem dados"): quando havia mais de uma versão do mesmo mapa salva (uma antiga vazia + uma nova com dados), o gerador podia pegar a vazia. Agora ele prefere a versão COM dados e a mais recente — igual à aba Fertilidade. Destrava a geração do relatório',
  ],
  '0.45.2': [
    'Diagnóstico na tela quando o relatório não gera páginas: mostra se o polígono veio e, por elemento, se o mapa tem grid/png — para identificar a causa sem abrir o console',
  ],
  '0.45.1': [
    'Histórico de relatórios sem custo (sem precisar do plano pago do Firebase Storage): cada relatório gerado fica registrado, e o "Abrir" regenera o PDF na hora a partir dos mapas salvos. Mostra data, tipo, mapas e safra; cada geração cria um registro novo',
  ],
  '0.45.0': [
    'Relatório completo (book) agora abre com uma CAPA: logo, título, satélite do talhão em destaque, produtor/fazenda/talhão/safra/cultura/área/município e o sumário dos mapas inclusos',
  ],
  '0.44.2': [
    'Correção (mapa interpolado não renderizava): mapas salvos sem grid (backend que não devolve grid) agora guardam o PNG do backend como fallback e renderizam, em vez de virar só metadados invisíveis. Mapas antigos sem grid/PNG precisam ser reprocessados',
  ],
  '0.44.1': [
    'Empresa única "Invicta" para todos: o filtro por empresa foi desligado (era o que fazia importações/mapas "sumirem" para quem caísse em outra empresa ativa). Todos passam a ver os mesmos dados',
  ],
  '0.44.0': [
    'Painel lateral do talhão virou "Ficha do Talhão" (informação, não central de trabalho): atualizar o limite do talhão, ver o que existe na safra (amostragem, laboratório, fertilidade, compactação) e os mapas definitivos',
    'Mapas definitivos: Zonas de manejo e Textura (Argila) visualizáveis no mapa; Altimetria e Produtividade marcados como "em breve"',
    'Todo o trabalho/edição (amostragem, importar grade, laboratório, fertilidade, compactação, relatórios) fica na página completa do talhão',
    'Página completa: Importação de Laboratório foi para a aba Fertilidade e Importar Grade para a aba Amostragem (antes só existiam no painel lateral)',
    'Correção: ao trocar de nutriente, o raster do mapa agora atualiza junto com os números (antes o raster podia ficar preso no nutriente anterior — "números não batem com o raster")',
    'Correção: a aba Relatórios não fica mais presa em "Carregando mapas salvos na nuvem…" (era um loop de recarga disparado pela geometria do mapa)',
  ],
  '0.43.5': [
    'Correção (Relatórios "Nenhuma página gerável"): o gerador agora usa como polígono a mesma geometria que o mapa está exibindo (fallback do uploadedGeo) quando não consegue extrair do talhão salvo — destrava a geração do relatório completo',
    'Números nos pontos do mapa (e do PDF): pH e K com 1 casa decimal; os demais sem casas decimais',
    'PDF: corrigido o espaçamento estranho em unidades com subscrito (ex.: "CaCl₂" agora sai como "CaCl2" em vez de letras espaçadas)',
    'Diagnóstico: quando o relatório não gera nenhuma página, o console mostra o motivo exato por elemento/profundidade',
  ],
  '0.43.4': [
    'Correção do raster de fertilidade que não aparecia mesmo com o mapa processado: a camada do raster agora é sempre (re)criada quando há overlay (resolve o caso da fonte ficar órfã sem camada após uma remoção que falhou)',
    'Diagnóstico: logs detalhados no console ([fertilidade]/[fert-overlay]/[mapa-fert]) para rastrear o carregamento e a exibição dos mapas salvos',
  ],
  '0.43.3': [
    'Correção (interpolação sumindo): a aba Fertilidade agora carrega os mapas salvos pelo prefixo largo (talhão+importação), independente de método/pixel/modelo — uma interpolação feita por outro usuário (ou com outra configuração) reaparece em vez de sumir. "Limpar" também passou a apagar todos os mapas daquele talhão/importação',
    'Relatório PDF: estatísticas agora ficam centralizadas logo abaixo de cada mapa (0-20 e 20-40), escala centralizada e renomeada para "Escala", títulos do cabeçalho mais proporcionais e mais espaço acima do rodapé',
  ],
  '0.43.2': [
    'Correção: interpolações não estavam sendo salvas em conexões mais lentas — o salvamento dependia do boot da nuvem terminar (timeout de 10s). Agora os mapas (fertilidade/compactação) salvam e recarregam sempre que houver usuário logado, independente do boot',
    'Boot da nuvem ficou mais rápido (coleções carregadas em paralelo) e o timeout subiu para 20s — corrige também o sync de cadastros/grades em conexões lentas',
  ],
  '0.43.1': [
    'Empresa: a empresa de testes (a que concentra os cadastros) foi renomeada para "Invicta" e definida como padrão no login',
    'No login, a Invicta vira a empresa ativa quando não há uma escolha válida (ou a ativa está vazia) — uma troca deliberada para outra empresa com dados é preservada',
  ],
  '0.43.0': [
    'Relatórios: novo botão "Gerar relatório completo" — junta todos os mapas do talhão/safra num PDF único',
    'Relatórios: cada PDF gerado agora é ARQUIVADO (Firebase Storage) — o menu mostra o histórico de tudo que foi gerado, com data, tipo, mapas e safra',
    'Relatórios: cada geração cria um registro novo (não sobrescreve); botões Abrir (PDF original) e Excluir em cada item do histórico',
  ],
  '0.42.2': [
    'Relatório PDF: o SATÉLITE de fundo agora aparece de verdade — a composição do mapa busca os tiles de satélite diretamente (não dependia mais da captura via WebGL, que caía em fundo branco). Ordem das camadas: satélite → raster → números das amostras → limite do talhão',
    'Logo do cliente: quando não há logo, nada é desenhado no cabeçalho (removido o placeholder "LOGO DO CLIENTE (opcional)")',
  ],
  '0.42.1': [
    'Página completa do talhão abre direto no mapa do talhão (o enquadramento agora é instantâneo, sem a animação que "navegava" desde o escritório) — bem mais rápido',
  ],
  '0.42.0': [
    'Gerador de Relatórios (aba Relatórios da Página do Talhão): monta um PDF ÚNICO de Fertilidade com vários elementos — selecione e reordene os mapas (↑/↓), ligue/desligue satélite e valores, e gere o documento. Cada elemento vira uma página no layout oficial V1',
    'Usa os mapas já salvos na nuvem do talhão+safra (processados na aba Fertilidade); o relatorioFertilidade foi refatorado para compor várias páginas num só PDF',
  ],
  '0.41.2': [
    'Correção da herança de empresa no login: o usuário logado vira membro das empresas existentes (depois do boot da nuvem). Resolve o caso em que os dados criados sob o usuário anônimo não apareciam para os usuários de e-mail — agora william/jhon acessam os dados da empresa existente',
  ],
  '0.41.1': [
    'Glyphs do mapa: servidor de fontes trocado para o openmaptiles (o demotiles não servia "Open Sans") — elimina de vez os erros 404 de glyphs no console e melhora a nitidez dos rótulos',
  ],
  '0.41.0': [
    'Login obrigatório por e-mail/senha (Firebase Auth): tela de login na entrada; o app inteiro fica atrás do login, substituindo o acesso anônimo. Ao logar, a NUVEM ATIVA — os mapas (e tudo) passam a salvar de verdade (conserta a persistência)',
    'Empresas/usuários agora sincronizam na nuvem (entre máquinas); ao logar pela 1ª vez, as empresas/dados criados antes (modo local) são adotados para o usuário logado — nada se perde',
    'Topo com e-mail do usuário + botão Sair',
    'Rótulos do mapa passam a usar Open Sans Regular (corrige os erros 404 de glyphs "Open Sans Bold" no console e ajuda a captura do relatório)',
  ],
  '0.40.4': [
    'Página completa do Talhão agora abre em NOVA ABA (carrega direto a página do talhão), em vez de navegar na mesma aba',
    'Selo de mapas na Fertilidade corrigido: com a nuvem inativa, mostra "N mapas nesta sessão — não salvos" (antes dizia "salvos na nuvem" indevidamente)',
  ],
  '0.40.3': [
    'Relatório de Fertilidade mais robusto: se a captura do mapa com satélite falhar (timeout/CORS/WebGL), o relatório agora compõe o mapa sem satélite (raster + limite + valores em fundo branco) em vez de dar erro — não trava mais',
    'Estatísticas do relatório com fallback para os números do backend (também do raster) quando o grid não decodifica — corrige o falso "Processe o(s) mapa(s)" mesmo com mapas prontos',
  ],
  '0.40.2': [
    'Relatório de Fertilidade: ajuste de calibração do cabeçalho — o título do elemento agora fica na zona central com auto-redução de fonte, sem sobrepor o nome da fazenda',
    'Diagnóstico de persistência: aviso visível na Fertilidade quando a nuvem está inativa (mapas não estão sendo salvos) + logs claros no console ([nuvem] ativa/inativa, mapa salvo, mapas carregados) para identificar por que as interpolações não persistem',
  ],
  '0.40.1': [
    'Relatório de Fertilidade: captura de mapa com timeout (não trava mais) e, se algo falhar, a aba mostra a mensagem de erro em vez de ficar em branco (também loga no console)',
  ],
  '0.40.0': [
    'Relatório PDF de Fertilidade — Layout Oficial V1 (A4 paisagem): botão "Gerar PDF" na Fertilidade gera o mapa final do elemento com as profundidades lado a lado sobre satélite, valores das amostras (só o número, halo branco), limite do talhão, legenda oficial abaixo, estatísticas do raster (Mín/Méd/Máx), escala gráfica e logos INVICTA + cliente (opcional)',
    'Estatísticas vêm do raster interpolado e a data exibida é a da interpolação (não a da geração do PDF), conforme a especificação',
  ],
  '0.39.0': [
    'Cadastros: agora dá para EDITAR o Cliente (aba Dados → Editar) e RENOMEAR o Talhão (lápis ao lado do nome no cabeçalho)',
    'Exclusão segura: apagar Cliente fica bloqueado enquanto houver fazendas; apagar Talhão fica bloqueado enquanto houver grades/importações/mapas — evita perder dados em massa por engano. A exclusão só acontece (com confirmação) quando não há dependências',
  ],
  '0.38.0': [
    'Amostragem: clicar no ícone 👁 de uma grade salva (Grid ou Zonas de Manejo) agora mostra os pontos dela no mapa, com a grade realçada; clicar de novo oculta. Editar ou mexer nos parâmetros volta para a simulação ao vivo',
  ],
  '0.37.0': [
    'Compactação: os mapas interpolados agora são salvos na nuvem (mesmo esquema da Fertilidade — autoload ao reabrir + grid comprimido em gzip), com selo de quantos mapas estão salvos; não precisa reprocessar a cada visita',
  ],
  '0.36.0': [
    'Página do Talhão — aba Compactação (penetrometria): importe pontos georreferenciados (SHP/KML/GeoJSON/CSV/XLSX), mapeie as colunas de resistência (cada uma vira uma profundidade) e gere o mapa interpolado por profundidade usando a legenda oficial de Compactação (MPa, invertida)',
    'Reaproveita o motor de interpolação (krigagem/IDW) e a coloração local; os pontos importados ficam salvos (sincronizados na nuvem)',
  ],
  '0.35.0': [
    'Página do Talhão — Cultura por safra: a barra de topo agora tem um seletor de cultura (soja, milho, trigo…) gravado por talhão+safra (talhões diferentes podem ter culturas diferentes na mesma safra); aparece também no Resumo',
    'A safra escolhida na Página do Talhão passa a filtrar também a Amostragem (grade e zonas), não só a Fertilidade',
  ],
  '0.34.0': [
    'Página Individual do Talhão (rota /talhao/[id], tela cheia, deep-linkável): central de trabalho organizada por SAFRA, com barra de contexto fixa (Cliente · Fazenda · Talhão · Área · Safra · Cultura) e navegação por abas',
    'Abas funcionais nesta etapa: Resumo, Fertilidade (reaproveita o módulo existente) e Amostragem; Produtividade, Recomendações, Compactação, NDVI, Arquivos e Relatórios entram como estrutura para preenchimento incremental',
    'O seletor de safra da página filtra os trabalhos (Fertilidade passou a aceitar a safra escolhida em vez da ativa global)',
    'Atalhos "Abrir página completa do talhão" na lista de talhões da fazenda e no painel lateral do talhão (o painel lateral atual segue funcionando em paralelo)',
  ],
  '0.33.0': [
    'Mapas de Fertilidade persistentes: ao abrir o talhão a última importação é selecionada sozinha e os mapas já interpolados reaparecem automaticamente (sem reprocessar) — com selo mostrando quantos mapas estão salvos na nuvem',
    'Talhões grandes não perdem mais o mapa: o grid interpolado é comprimido (gzip) antes de ir para a nuvem, cabendo no limite do Firestore mesmo na malha máxima',
    'Aviso de "desatualizado" quando existe uma importação de laboratório mais recente que a dos mapas em tela, com atalho para ir à mais recente e regenerar',
  ],
  '0.32.0': [
    'Mapa de Fertilidade: a linha de limite do talhão agora fica POR CIMA do raster, cobrindo o serrilhado do recorte nas bordas (o raster entra logo abaixo do contorno; pontos e rótulos seguem acima)',
    'Legenda de Matéria Orgânica corrigida: limites ×10 (agora em g/dm³ — 14/24/34/45) para casar com os valores do laboratório',
    'Legendas oficiais (Sistema) passam a propagar qualquer atualização do padrão no boot (limites, unidade, cores, domínio) — antes só cores/domínio',
  ],
  '0.31.1': [
    'Fix: painéis Configurações, Usuários e Empresa agora rolam quando o conteúdo passa da altura da tela (faltava o scroll próprio que os outros painéis já tinham)',
  ],
  '0.31.0': [
    'Legendas — conserto do motor: o mapa agora colore pela MESMA lógica da barra (posição visual da classe), então barra e mapa batem e as classes das pontas não saturam mais (fim do "roxo uniforme")',
    'Estilo Contínuo agora é uma escala natural suave (uma cor por classe no centro da sua faixa proporcional, sem "dentes" nas fronteiras); Segmentado mantém faixas com gradiente interno e fronteira nítida — trocar estilo só muda a barra/raster, não os limites/rótulos',
    'Cada legenda ganhou domínio mín/máx das pontas (NDVI 0–1, Textura/V%/m% 0–100; nutrientes sem teto usam meia-classe) — evita o colapso das classes abertas',
    'Biblioteca OFICIAL de Legendas no banco (escopo Sistema, read-only, visível a todas as empresas): Fertilidade ABC + Textura do Solo + Altimetria + NDVI + Compactação',
    'Produtividade com paleta própria (semáforo vermelho→verde) em 3 variantes: Absoluta (kg/ha por cultura — soja/milho/trigo/feijão), Percentil (% da área) e % da Média do talhão',
    'Legendas do Sistema aparecem com selo e botão Duplicar (para editar, duplique — a cópia vira sua); editor ganhou campos de domínio das pontas',
  ],
  '0.30.0': [
    'Reorganização Fase 5 — Safras, Grades e Preferências migradas para a Biblioteca',
    'Safras saíram do menu lateral (agora em Biblioteca › Safras); o editor é o mesmo de antes',
    'Biblioteca › Grades: editores de Padrões de Amostragem (densidade + profundidades) e Padrões de Elementos (quais análises rodar) — antes não tinham UI desde a limpeza da Fase 0',
    'Biblioteca › Preferências de Análise: modelo de etiqueta (Pimaco) — mesmo padrão editável também em Configurações',
    'Migração idempotente e ADITIVA (inv_safras/inv_padroes_*/inv_etiqueta_cfg → inv_bib_*); chaves antigas preservadas para não perder dados de quem usa a nuvem',
    'Padrões de Amostragem/Elementos, Safras e Etiqueta agora respeitam escopo por Empresa (multi-tenant) e sincronizam via Biblioteca',
  ],
  '0.29.0': [
    'Reorganização Fase 4 — Perfis Agronômicos',
    'Biblioteca → Perfis: cria perfis que combinam Laboratório + Padrão de Amostragem + Legendas por elemento (Fundação ABC end-to-end com um clique)',
    'Fertilidade ganhou dropdown "Perfil" no topo: escolher um perfil pré-preenche todas as legendas por elemento (continua podendo trocar individualmente)',
    'Botão "Salvar como Perfil" na Fertilidade — captura legendas atuais + padraoAmostragem da grade num novo item da Biblioteca',
    'Perfis são por referência (não cópia): editar a legenda original atualiza todos os perfis que apontam pra ela',
  ],
  '0.28.0': [
    'Reorganização Fase 3 — Laboratórios migrados para a Biblioteca',
    'Biblioteca → Laboratórios: lista os perfis salvos (criar/editar/excluir/ativar) e mostra os perfis embutidos (Fundação ABC, Interpartner) na aba "Sistema"',
    'Migração idempotente de inv_lab_perfis → inv_bib_laboratorios (preserva ids; aba Empresa segue isolada por empresa ativa)',
    'LabImportSection segue funcionando sem mudanças (wrappers compatíveis em store.ts)',
    'Nuvem (Firestore) agora espelha inv_bib_laboratorios em vez de inv_lab_perfis; biblioteca.save() passa a chamar cloudPushLista para sincronização automática',
  ],
  '0.27.0': [
    'Reorganização Fase 2 — Legendas migradas para a Biblioteca',
    'Categoria "Legendas" da Biblioteca agora abre o editor (substitui o item antigo do menu lateral)',
    'Classificação interna da Legenda expandida: fertilidade, micronutriente, textura, produtividade-colheita, NDVI, condutividade, altimetria-elevação, compactação, pragas, outro',
    'Editor mostra rótulos legíveis para a classificação interna',
  ],
  '0.26.0': [
    'Reorganização Fase 1.B — Biblioteca de Padrões (esqueleto)',
    'Item "Biblioteca" no menu lateral + painel com sidebar interna de 16 categorias (Preferências, Safras, Grades, Fertilidade, Foliares, Altimetria, Satélite, Compactação, Álgebra de Mapas, Pragas, Equações, Recomendações, Produtividade, Perfis, Laboratórios, Legendas)',
    'Camada genérica em src/lib/biblioteca.ts: ItemBiblioteca, escopo Meu/Empresa/Sistema, CRUD + duplicar + ativar/inativar + compartilhar + import/export JSON',
    'Categorias começam vazias ("em breve"); conteúdo migra nas próximas fases',
  ],
  '0.25.0': [
    'Reorganização Fase 1.A — Conceito de Empresa (multi-tenant)',
    'Auto-cria "Empresa Pessoal" no 1º boot (idempotente); todos os cadastros existentes recebem empresaId silenciosamente',
    'Topbar ganha seletor de empresa (trocar / nova / gerenciar)',
    'Novo painel "Empresa" (gerenciar membros por UID Firebase + papéis admin/editor/viewer)',
    'Todos os getX/saveX do store agora respeitam a empresa ativa; cada empresa tem sua visão isolada de cadastros',
  ],
  '0.24.0': [
    'Reorganização Fase 0 (limpeza): Sidebar antiga, painel Base Agronômica + página completa, painel Cadastros e pasta agronomica/ (NutrienteCard, LegendaBar) removidos',
    'Constante constants/agronomica.ts (LEGENDAS_PADRAO, CORES_CLASSES legacy) removida — motor de Legendas único em lib/legendas.ts',
    '15 rotas vestigiais em src/app/painel/* removidas (mantidas só configuracoes, produtores, safras, legendas)',
    'IconSidebar atualizado: Cadastros saiu (vai voltar dentro da Biblioteca de Padrões em fase futura)',
  ],
  '0.23.2': [
    'Debug temporário na Fertilidade: mostra domínio, stops, estatística do grid e cor calculada por valor amostrado — facilita diagnosticar discrepâncias entre cor e valor',
  ],
  '0.23.1': [
    'Fix: mapas voltam a aparecer após Processar (sessão mantém PNG do backend como fallback se a colorização local falhar)',
    'Re-render reativo quando o usuário edita classes/cores da legenda atual (legHash)',
    'Aviso no console em vez de mapa em branco quando não há grid nem PNG',
  ],
  '0.23.0': [
    'Arquitetura nova: raster (grid + bounds + stats) é persistido; PNG é gerado localmente em canvas a partir do grid. Trocar legenda/estilo recolore sem reprocessar',
    'Chave de cache da fertilidade não inclui mais a legenda (mapas persistidos servem qualquer legenda futura); leitura tolera chave antiga (legacy)',
    'Sistema de Estilos de Legenda: Segmentado (faixas separadas, fronteira nítida) e Contínuo (gradiente único). Trocar estilo NÃO altera classes/limites/unidade/método/fonte/invertida',
    'Pares de cores oficiais por classe (corInicio → corFim): Vermelho (#B00000→#FF0000), Amarelo (#D4A800→#FFD600), Verde (#7CFC00→#006400), Azul (#66CCFF→#003D99), Roxo (#C77DFF→#5A189A)',
    'Editor de legendas com dois color pickers por classe + seletor de estilo + prévia em tempo real',
    'Fertilidade reage ao editor: editar legenda atualiza o mapa instantaneamente (evento inv:legendas)',
  ],
  '0.22.1': [
    'Transição de cor dentro de cada classe (claro → escuro) com fronteira nítida entre classes — barra UI e raster',
    'Mapas já processados antes desta versão usam o esquema antigo (cores sólidas); reprocesse no Fertilidade para ver o degradê novo',
  ],
  '0.22.0': [
    'Editor visual de Legendas (novo item "Legendas" no menu lateral): listar por fonte, criar, editar, duplicar, excluir',
    'Editor de classes com cor (color picker), limites, largura visual, reordenação, validação de soma 100% e prévia ao vivo',
    'Import / Export JSON do repositório inteiro de legendas',
  ],
  '0.21.0': [
    'Motor de Legendas Agronômicas — legendas são objetos editáveis e reutilizáveis (fonte, método, categoria, classes, cores, larguras visuais)',
    'Repositório inicial Fundação ABC com 11 legendas (pH CaCl₂, Al, Ca, Mg, CTC pH 7,0, CTC efetiva, V%, m%, M.O., P Resina, K) + exemplo Zn DTPA',
    'Cores oficiais: Vermelho → Amarelo → Verde → Azul → Roxo (#D7191C, #FFD92F, #1A9641, #2C7BB6, #7B3294); larguras visuais 22,5/22,5/22,5/22,5/10',
    'Fertilidade: dropdown "Legenda" pra escolher qual aplicar (cache e mapas salvos por combinação legenda+nutriente+profundidade)',
    'Barra da legenda no mapa usa as larguras visuais por classe + rótulos das bordas',
  ],
  '0.20.3': [
    'Grid numérico bruto da interpolação salvo junto com o mapa (Float32 → base64) — base para mapa de aplicação e outras derivações sem reprocessar',
    'Diagnóstico do interpolador: mostra a URL alvo e a mensagem real do erro; aviso explícito quando o navegador bloqueia HTTPS→localhost (use Chrome no Mac)',
    'Resolvido o caso do Safari no Mac: bloqueia mixed content (use Chrome)',
  ],
  '0.20.2': [
    'Mapas de fertilidade salvos no banco (Firestore): processou um vez, sobrevive ao F5 e aparece em qualquer máquina',
    'Camada do raster fixa em 100% (slider de opacidade removido)',
    'Botão Limpar agora apaga os mapas salvos também',
  ],
  '0.20.1': [
    'Configurações → "Interpolação (motor local)": status ao vivo do interpolador, botão de download e instruções por sistema (macOS/Windows) — auto-detecta o seu',
    'Mensagem clara no Processar tudo quando o interpolador está desligado (em vez de listar todas as variáveis como falhas)',
  ],
  '0.20.0': [
    'Dados na nuvem (Firebase/Firestore): clientes, fazendas, talhões, safras, padrões, grades e laboratório sincronizados entre todas as máquinas',
    'Ao abrir o app ele baixa a base da nuvem; cada gravação espelha automaticamente (write-through); sem internet segue 100% local na sessão',
    'Opcional por configuração (NEXT_PUBLIC_FIREBASE_*): sem as chaves o app funciona local como antes',
  ],
  '0.19.3': [
    'Backend simples em cada máquina: duplo-clique em start.bat (Windows) ou start.command (Mac) — acha o Python sozinho e deixa pronto pra interpolar',
    'Mensagem clara no app quando o interpolador não está ligado naquela máquina',
  ],
  '0.19.2': [
    'Backend aceita Private Network Access — permite testar a interpolação pelo link publicado (HTTPS) usando o backend local (no Chrome)',
    'Backend pronto pra nuvem: Dockerfile + render.yaml (deploy no Render) → link público funciona em qualquer máquina, sem backend local',
  ],
  '0.19.1': [
    'Fertilidade mostra os detalhes da krigagem no mapa: modelo de variograma, alcance/patamar/pepita, RMSE da validação cruzada, pixel (m) e grade',
    'Configurações da interpolação (recolhível): pixel 5/10/20 m (padrão 20×20) e variograma (Auto ou fixo: esférico/exponencial/gaussiano)',
    'Backend roda local em cada máquina (porta 8800): start.bat (Windows, detecta py/python) e start.sh (macOS/Linux)',
  ],
  '0.19.0': [
    'Fertilidade: "Processar todos" os nutrientes de uma vez, com barra de progresso',
    'Troca instantânea entre nutrientes no mapa (cache por nutriente; ✓ marca os já prontos) sem reprocessar',
  ],
  '0.18.1': [
    'Backend de fertilidade movido para a porta 8800 (evita conflito com o Django em :8000)',
    'Front (npm run dev) na porta 3100, para não colidir com outros projetos Next em :3000',
  ],
  '0.18.0': [
    'Importar grade feita fora da plataforma (Shapefile .zip / KML / GeoJSON de pontos) — preserva o número de cada ponto para casar com o laboratório',
    'Número da amostra desacoplado do índice serpentina (PontoAmostragem.numero); join da fertilidade usa numero ?? ordem+1',
    'Perfil de laboratório "Fundação ABC (planilha)" para o XLSX limpo (1 coluna por elemento)',
    'Botão "Carregar talhão-teste IGEFI 07" (Configurações) — polígono + 39 pontos + análise ABC, ponta a ponta na interpolação',
    'Fertilidade: interpolador é escolha explícita (Krigagem | IDW) — sem troca automática para IDW',
  ],
  '0.17.0': [
    'Mapa de Fertilidade por interpolação — krigagem ordinária (variograma auto-ajustado: esférico/exponencial/gaussiano) com fallback IDW',
    'Recorte no polígono do talhão e raster colorido por gradiente contínuo ancorado nas classes da Base Agronômica; valor da amostra exibido em cada ponto',
    'Uma interpolação por profundidade; liga resultados de laboratório aos pontos da grade (nº = ordem+1); opacidade ajustável',
    'Backend Python local (FastAPI + PyKrige/Shapely/Pillow) em backend/ — rode backend\\start.bat',
  ],
  '0.16.17': [
    'Importação de laboratório avançada — perfis Fundação ABC e Interpartner prontos (validados em arquivos reais)',
    'Lê nº do ponto/talhão/profundidade de dentro do texto, filtra por talhão (arquivo multi-talhão) e separa por campanha',
    'CSV lido nativamente (Latin-1 + ;, sem coerção de data), XLS/XLSX via SheetJS; auto-detecção para labs novos',
  ],
  '0.16.16': [
    'Importação de resultados de laboratório (XLSX/CSV) ligados aos pontos da grade',
    'Auto-detecção das colunas + mapeamento manual por coluna; perfil salvo por laboratório (Fundação ABC, Interpartner, …) — adicionar lab = mapear uma vez',
    'Elementos alinhados à Base Agronômica (pH, P, K, Ca, Mg, Al, CTC, V%, m%, MO, S, B, Zn, Cu, Mn, textura); números PT/US',
  ],
  '0.16.15': [
    'Limpeza: removidos 12 painéis órfãos (código morto, não importados em lugar nenhum) — Amostragem, Fazendas, Talhões, Fertilidade, NDVI, Condutividade, Produtividade, QR Code, Relatórios, Mapas de Aplicação, Laboratórios, Zonas',
  ],
  '0.16.14': [
    'Limpeza: removidos do talhão os accordions duplicados "Zonas de Manejo" e "QR Code e Etiquetas" — as funções reais já estão em Amostragem (Grid/Zona, etiquetas Pimaco)',
  ],
  '0.16.13': [
    'Z3 Zonas — salvar grades de zonas (várias por safra, uma para processar) e exportar KML/Shapefile',
    'Exportação inclui os pontos numerados + os polígonos das zonas (nomeados por id/classe)',
    'Grades separadas por método (Grid × Zonas): cada método tem sua grade "a processar"',
  ],
  '0.16.12': [
    'Upload de Zonas de Manejo pela interface (KML / Shapefile .zip / GeoJSON) no talhão',
    'Auto-detecção do campo de classe (semáforo) e do id; área por zona calculada; prévia colorida no mapa',
    'Aviso quando o arquivo vem em coordenadas projetadas (exportar com .prj ou em WGS84)',
  ],
  '0.16.11': [
    'Etiquetas abrem em nova aba (PDF pronto para impressão, Ctrl+P) em vez de baixar o arquivo',
    'Se o navegador bloquear o pop-up, cai automaticamente para download do PDF',
  ],
  '0.16.10': [
    'Modelo de folha de etiqueta (Pimaco) agora é um padrão único em Configurações › Etiquetas (com ajuste fino em mm), salvo e reutilizado',
    'Removido o menu de modelo de dentro da Amostragem (Grid) e das Zonas — os botões Etiquetas usam o padrão das Configurações',
  ],
  '0.16.9': [
    'Etiquetas: presets de folha adesiva Pimaco (A4361, A4260, A4355, A4356, 6181) + Genérico A4',
    'Seletor de folha + ajuste fino de margem (calibração em mm) no Grid e nas Zonas',
    'Etiquetas agora também nas Zonas de Manejo (a partir do padrão de amostragem)',
    'Render adaptativo: número e profundidade escalam ao tamanho da etiqueta',
  ],
  '0.16.8': [
    'Grid: cada pedaço disjunto do limite recebe pontos (≥1, conforme a área) — antes pedaços separados ficavam sem ponto',
    'Partes encostadas (talhão dividido em vários polígonos) viram um campo só: divisas internas não contam como borda (sem vãos internos)',
    'Distância da borda medida só pelo contorno externo do campo',
  ],
  '0.16.7': [
    'Fix: modo Grade agora é malha alinhada de verdade (ponto no centro da célula; encaixa para dentro só nas bordas)',
    'Fix: distância da borda respeitada nas zonas (amostragem fina o bastante; antes colapsava em zonas médias/pequenas)',
    'Zona pequena sempre recebe ao menos 1 ponto no modo Grade',
  ],
  '0.16.6': [
    'Distribuição de pontos por cobertura — nº de pontos pela área (mínimo round(área/densidade)) e nenhuma região sem ponto',
    'Encaixa ponto em braços/lóbulos que a malha quadrada perdia (ex: zonas e talhões irregulares)',
    'Toggle Inteligente (cobertura + relaxação de Lloyd, conforma ao formato) | Grade (malha alinhada) no Grid e nas Zonas',
    'Escada de borda: reduz a distância da borda só onde for preciso para encaixar o ponto',
  ],
  '0.16.5': [
    'Z2b Zonas — densidade por zona: clique numa zona (mapa ou lista) e ajuste a densidade só dela',
    'Override por zona sobrepõe o padrão geral; "Usar padrão geral" remove o ajuste',
    'Zona selecionada destacada no mapa (contorno ciano) + contagem de pontos por zona na lista',
  ],
  '0.16.4': [
    'Zonas — seletor de Padrão de Amostragem (profundidades) para as etiquetas',
    'Resumo mostra nº de etiquetas (amostras × profundidades) nos modelos A e B',
  ],
  '0.16.3': [
    'Fix: densidade das zonas em ha/ponto (ex: 2 = 1 ponto a cada 2 ha), default 2 — igual ao grid',
  ],
  '0.16.2': [
    'Z2 Zonas — geração de pontos por zona (grid dentro de cada zona + aleatoriedade)',
    'Densidade em pontos/ha; zonas pequenas recebem ao menos 1 ponto',
    'Modelo A (amostra composta, 1/zona) e Modelo B (pontos individuais ao laboratório)',
  ],
  '0.16.1': [
    'Amostragem com seletor de método: Grid ou Zona de Manejo',
    'Z1 Zonas de Manejo — zonas exibidas no mapa coloridas por classe (semáforo) + legenda e lista',
  ],
  '0.16.0': [
    'Zonas de Manejo — campo zonasGeojson no talhão + caso de teste JRABA 01',
    'Cadastro de teste: Ricardo Arruda (JRA) › Fazenda Barrinha (JRABA) › Talhão JRABA 01 (67,8 ha, 8 zonas)',
    'Zonas do shapefile reprojetadas de UTM 22S para WGS84 (classes ALTA/MÉDIA/BAIXA)',
  ],
  '0.15.3': [
    'Etiqueta da amostra sem QR Code — prioriza o número da amostra (grande) + profundidade',
  ],
  '0.15.2': [
    'Fix: extração robusta dos polígonos dos talhões (FeatureCollection, Feature, Geometry ou GeometryCollection) — todos os talhões da fazenda aparecem no mapa',
  ],
  '0.15.1': [
    'Fix: ao abrir a fazenda, o mapa enquadra TODOS os talhões (antes parava num zoom afastado)',
    'fitBounds sem animação (evita voo interrompido) + resize do container antes de enquadrar',
  ],
  '0.15.0': [
    'Ao abrir uma Fazenda, todos os talhões com geometria aparecem no mapa (satélite)',
    'Clicar num talhão no mapa abre o talhão (como link), com zoom automático no conjunto',
  ],
  '0.14.0': [
    'Fase 4 — Etiquetas com QR Code por amostra (PDF)',
    'Uma etiqueta por amostra (ponto × profundidade); QR codifica "Talhão - Ponto - Profundidade"',
    'Etiqueta com QR + texto legível (talhão, ponto, profundidade, safra/época)',
    'Pontos passam a guardar quais profundidades possuem (para etiquetas corretas)',
    'Botão "Etiquetas" em cada grade salva (ao lado de KML/SHP)',
  ],
  '0.13.0': [
    'Exportação da grade pronta em KML ou Shapefile (.zip)',
    'Pontos numerados + polígono do talhão incluídos na exportação',
    'Shapefile separa pontos_amostragem e talhao (com .prj WGS84); botões por grade salva',
  ],
  '0.12.1': [
    'Changelog recolhível — última versão sempre visível, anteriores ocultas e expansíveis',
  ],
  '0.12.0': [
    'Amostragem Fase 3b — edição manual dos pontos no mapa',
    'Arrastar pontos (não saem do talhão nem da faixa de borda — encaixa na posição válida mais próxima)',
    'Adicionar pontos extras (clique no mapa) escolhendo as profundidades de cada um',
    'Remover pontos (clique no ponto)',
    'Mexer nos parâmetros descarta a edição manual e regera a grade',
    'Numeração re-sequenciada após editar; grade salva guarda os pontos editados',
  ],
  '0.11.1': [
    'Seed: Padrão de Amostragem fixo "Padrão Invicta 2 ha" (00-20 100% + 20-40 25%) para testes',
  ],
  '0.11.0': [
    'Amostragem Fase 3a — salvar e gerenciar grades',
    'Várias grades por safra/talhão; marcar qual será processada (uma por safra)',
    'Grades com nome auto (renomeável), badge CUSTOM, excluir',
    'Densidade aceita decimais (ex: 1,5 ha) no simulador e no cadastro',
  ],
  '0.10.1': [
    'Aleatoriedade agora é radial e limitada a metade do espaçamento (L/2) — pontos nunca se cruzam',
  ],
  '0.10.0': [
    'Amostragem Fase 2 — Simulador de Grid (geração real sobre o polígono do talhão)',
    'Puxa densidade e profundidades do Padrão de Amostragem, permitindo customizar (marca "CUSTOMIZADO")',
    'Controles ao vivo: densidade, distância da borda, rotação (auto pela maior dimensão + manual), aleatoriedade 0–100%',
    'Pontos coloridos por nº de profundidades (1=laranja, 2=azul, 3+=roxo), numeração em serpentina',
    'Seleção dos pontos das profundidades parciais: Regular ou Aleatório, com refazer sorteio',
    'Seletor de safra ativa + 1ª/2ª época (até junho / julho–dezembro)',
  ],
  '0.9.11': [
    'Seed: 2 Padrões de Elementos de teste — "Rotina + Textura + Micro" (todos menos S) e "Rotina + S"',
  ],
  '0.9.10': [
    'Textura (granulometria) adicionada como análise selecionável nos Padrões de Elementos',
  ],
  '0.9.9': [
    'Base Agronômica movida para dentro do painel "Cadastros"',
    'Ícone separado "Base Ag." removido da barra lateral (consolidação dos cadastros)',
  ],
  '0.9.8': [
    'Amostragem Fase 1 — novo painel "Cadastros" na barra lateral',
    'Cadastro de Padrões de Elementos (conjuntos nomeados de elementos: Rotina, Micros…)',
    'Cadastro de Padrões de Amostragem (densidade + múltiplas profundidades, cada uma com % de pontos e padrão de elementos)',
    'Base para o simulador de grid (Fase 2)',
  ],
  '0.9.7': [
    'Cadastro de safra a partir do próprio talhão (botão + no seletor de safra)',
    'Safra recém-criada fica selecionada como contexto ativo do talhão',
    'A safra selecionada é o contexto temporal das operações do talhão',
  ],
  '0.9.6': [
    'Coordenada exata do Escritório da Invicta definida (Carambeí/PR) — mapa abre nela',
  ],
  '0.9.5': [
    'Dados de teste pré-carregados (seed): Frederico Rodolfo Nolte (FRN) › Fazenda Figueira (FRNFI) › Talhão FRNFI 21',
    'Talhão FRNFI 21 já vem com a geometria real (shapefile, 52,9 ha) carregada',
    'Seed roda uma vez em qualquer navegador/plataforma — contorna falta de sincronização do localStorage',
    'Mapa abre por padrão no modo Satélite',
    'Mapa abre centralizado na localização do Escritório da Invicta (Carambeí/PR)',
  ],
  '0.9.4': [
    'FIX DEFINITIVO mapa branco em produção — container do mapa colapsava para altura 0',
    'Causa: CSS do MapLibre força position:relative, anulando o `inset-0` do container',
    'Solução: width/height 100% via style inline (vence o CSS do MapLibre por especificidade)',
    'Diagnosticado reproduzindo o build de produção localmente',
  ],
  '0.9.3': [
    'Fix mapa branco em produção — CSS MapLibre carregado via CDN jsDelivr no <head>',
    'MapView: map.resize() após load para garantir dimensões corretas',
  ],
  '0.9.2': [
    'Fix mapa branco no Vercel — CSS do MapLibre importado no layout raiz (server component)',
  ],
  '0.9.1': [
    'Seletor de safra no talhão usa apenas safras cadastradas manualmente',
    'Safra ativa é pré-selecionada automaticamente ao abrir o talhão',
    'Exibe aviso quando nenhuma safra foi cadastrada',
  ],
  '0.9.0': [
    'Upload georreferenciado real no talhão — KML, Shapefile (.zip) e GeoJSON',
    'Geometria persiste no localStorage (geojson + bbox + areaHa) e restaura ao reabrir',
    'Status do talhão atualizado para Ativo automaticamente após upload',
    'Campo Sigla opcional em Cliente e Fazenda',
    'Cadastro de Safras — criar, ativar/desativar e excluir via SlidePanel',
    'FazendaDetailPanel migrado de mocks para store real (getFazendas/getTalhoes)',
    'Fix mapa branco em produção — CSS MapLibre movido para globals.css + ssr:false',
    'Fix build Vercel — erros TypeScript em páginas com mocks never[] corrigidos',
    'Fix conteúdo de rotas filhas vazando abaixo do mapa',
  ],
  '0.8.0': [
    'Upload real de KML e GeoJSON — parser client-side com @tmcw/togeojson',
    'Suporte a UTF-8 e UTF-16 (Topper 4500, QGIS, Google Earth)',
    'Geometria carregada exibida no MapLibre — zoom automático para o bbox',
    'Mapa troca para satélite automaticamente ao carregar arquivo',
    'Drag & drop ou click para upload',
    'Exibe número de feições e área estimada',
  ],
  '0.7.0': [
    'Módulo 08 — Amostragem completo dentro do Talhão',
    'Fluxo em 4 etapas: Limite → Método → Parâmetros → Pontos gerados',
    'Verificação de limite geográfico do talhão (obrigatório)',
    '4 métodos: Grid Fixo, Grid Variável, Importar, Manual no mapa',
    'Seleção de profundidades por campanha',
    'Pontos de amostragem exibidos no mapa MapLibre (toggle)',
    'Lista de pontos com status de coleta',
    'activeModule no contexto — mapa reage ao módulo ativo',
  ],
  '0.6.0': [
    'Base Agronômica completa — gerador de legendas por nutriente',
    'Barra de cor com gradiente padrão (vermelho→laranja→amarelo→verde→azul→roxo)',
    'Editor de limites de classe por nutriente (clique para expandir)',
    'Al e m% com escala invertida (roxo→vermelho = tóxico)',
    '15 nutrientes pré-configurados (Embrapa Cerrado)',
    'Abas: Legendas e Classes / Profundidades / Metodologias',
    'Preview compacto no painel lateral + link para editor completo',
  ],
  '0.5.0': [
    'Navegação hierárquica: Produtor → Fazenda → Talhão',
    'ProdutorDetailPanel: dados + lista de fazendas com cadastro',
    'FazendaDetailPanel: dados + lista de talhões com cadastro',
    'Mapa troca automaticamente para satélite (Esri) ao entrar no talhão',
    'Toggle manual Rua / Satélite no mapa',
    'Talhão selecionado destacado em verde no mapa',
  ],
  '0.4.0': [
    'Fluxo talhão-cêntrico: todos os módulos técnicos dentro do talhão',
    'Sidebar simplificada: apenas Dashboard, Clientes, Fazendas, Talhões, Base Ag., Usuários, Config',
    'TalhaoDetailPanel com seletor de safra + 9 módulos em accordion',
    'Módulos vinculados ao talhão: Amostragem, Lab, QR Code, Fertilidade, NDVI, CE, Produtividade, Zonas, Aplicação, Relatórios',
  ],
  '0.3.0': [
    'Redesign completo para layout mapa-cêntrico (inspirado InCeres)',
    'Sidebar narrow com ícones (64px)',
    'Painéis deslizantes para todos os 18 módulos',
    'MapLibre GL integrado com talhões simulados',
    'TopBar de contexto: Produtor > Fazenda > Talhão > Safra > ha',
  ],
  '0.2.0': [
    'Layout completo de todos os módulos (tabelas)',
    'Módulos: Usuários, Fazendas, Safras, Base Agronômica, Amostragem, QR Code, Laboratórios, Fertilidade, NDVI, Relatórios',
  ],
  '0.1.0': [
    'Estrutura base Next.js + TypeScript + Tailwind + shadcn/ui',
    'Dashboard, Produtores, Talhões, Portal do Produtor',
    'Deploy inicial no Vercel',
    'Paleta de cores extraída das logos Invicta',
  ],
};
