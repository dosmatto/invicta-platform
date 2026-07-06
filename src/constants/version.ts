export const APP_VERSION = '1.46.0';

export const CHANGELOG: Record<string, string[]> = {
  '1.46.0': [
    'LISTAS DE FAZENDA E TALHÃO ENXUTAS: mesmo padrão minimalista da lista de clientes — fonte menor, avatar e espaçamentos compactos e sem a setinha ">". Na lista de talhões, o botão de abrir a página completa aparece só ao passar o mouse; o status (Ativo/Incompleto) e a área continuam visíveis. Na lista de fazendas do cliente, a área somada segue à mostra. Nomes de fazenda e talhão cabem melhor.',
  ],
  '1.45.0': [
    'LISTA DE CLIENTES MAIS ENXUTA: fonte do nome um pouco menor, avatar e espaçamentos mais compactos, e o nome agora ocupa a largura toda — os botões de editar/excluir aparecem só ao passar o mouse na linha. Assim cabe muito mais do nome do produtor sem cortar. Também saiu a setinha ">" (a linha inteira já abre o cliente).',
  ],
  '1.44.0': [
    'NOMES EM CAIXA ALTA: cliente, fazenda e talhão agora ficam SEMPRE em maiúsculas — nas listas, cabeçalhos, breadcrumbs e relatórios. Vale para novos cadastros e, uma vez, para tudo que já estava salvo (recálculo idempotente no primeiro carregamento).',
    'RENOMEAR MAIS FÁCIL: o CLIENTE também ganhou o lápis de renomear no cabeçalho do painel (fazenda e talhão já tinham) — dá para corrigir o nome na hora, sem abrir o formulário de edição.',
    'ÁREA DA FAZENDA NA LISTA: além da área total dentro da fazenda, a LISTA de fazendas do cliente agora mostra a área somada dos talhões de cada fazenda.',
    'MENU LATERAL: removida a "dica" flutuante (tooltip) que aparecia sobre a tela ao passar o mouse nos ícones — o rótulo já fica embaixo de cada ícone, então era redundante e atrapalhava.',
  ],
  '1.43.0': [
    'ÁREA IGUAL AO QGIS (geodésica): o cálculo de área dos talhões passou a usar a base GEODÉSICA do elipsoide WGS84 — a mesma do QGIS — no lugar da esfera usada antes, que superestimava ~0,2% no Sul do Brasil. Vale para novas importações, para a edição de geometria e, UMA vez, para TODAS as áreas já salvas (recalculadas a partir do próprio contorno, sem reimportar nada). Efeito: as áreas caem ~0,2% e passam a coincidir com o QGIS.',
    'Validação: a correção varia de ~0,21% (perto de 25°S) a ~0,28% (perto de 21°S) conforme a latitude de cada talhão, batendo com a comparação por fazenda que você levantou (média 0,22%). O recálculo é idempotente (parte da geometria), então rodar em vários aparelhos não acumula erro.',
  ],
  '1.42.0': [
    'FAZENDA — RENOMEAR + ÁREA TOTAL: no painel da fazenda agora dá para EDITAR o nome (lápis ao lado do nome) e o resumo mostra a ÁREA TOTAL (soma dos talhões) — no cabeçalho e na aba Dados. O nome do talhão já podia ser editado pelo lápis no painel do talhão.',
  ],
  '1.41.0': [
    'CORREÇÃO IMPORTANTE — "Sem espaço no navegador para gravar tudo": a importação de talhões (e o salvamento de outros dados) travava com esse erro quando o cache do navegador enchia. Causa: o localStorage tem teto de ~5–10 MB e só os polígonos de todas as fazendas passavam de 7 MB — somados à condutividade (~2 MB) estouravam o limite, e a partir daí NADA mais gravava, nem uma importação pequena. Agora as chaves pesadas (talhões, condutividade, produtividade, composições, MDE, zonas de manejo, compactação, grades) são COMPRIMIDAS antes de ir para o cache local, reduzindo cerca de 10× o espaço ocupado — os ~10 MB viram ~1–2 MB e a folga volta a ser enorme',
    'A compressão é transparente e SEM PERDA: a nuvem (Supabase) continua guardando os dados normalmente — muda apenas o espelho local do navegador. A leitura reconhece sozinha tanto os valores antigos (não comprimidos) quanto os novos, então nada precisa ser reimportado. Depois de atualizar, faça UM recarregamento forçado (Ctrl+Shift+R): o cache é reescrito já comprimido e o espaço é liberado automaticamente',
  ],
  '1.40.0': [
    'MDE PRÓPRIO (a partir dos seus pontos de elevação): além do MDE automático (satélite), agora a aba Altimetria tem o modo "MDE próprio (pontos)". Suba um arquivo de pontos com altitude — o export da CONDUTIVIDADE, da COLHEITA ou um levantamento RTK (SHP/KML/GeoJSON/CSV/XLSX) — escolha a coluna de elevação, e a plataforma interpola um Modelo Digital de Elevação SÓ do seu talhão, geralmente bem mais detalhado que os 30 m do satélite',
    'O MDE próprio segue exatamente o mesmo caminho do automático: prévia (hipsométrico/declividade/relevo sombreado + estatísticas) → aprovar como base oficial → derivados e análise agronômica (TPI, TWI, LS, classes de relevo) já vêm juntos → entra nas Zonas de Manejo, no cruzamento por classe e no relatório PDF, e exporta GeoTIFF. Validado com superfície de elevação de gabarito (recupera o relevo e a declividade corretos)',
  ],
  '1.39.0': [
    'MDE F4.c — RELATÓRIO PDF DO RELEVO: na análise topográfica, o botão "Relatório PDF do relevo" gera um documento A4 (2 páginas) com cabeçalho (produtor/fazenda/talhão/fonte/resolução), estatísticas (altitude mín/média/máx/amplitude e declividade média), tabelas de ÁREA POR CLASSE DE RELEVO e por classe de declividade, observações agronômicas automáticas (relevo predominante, % em risco de erosão, baixadas com acúmulo de água, linhas de fluxo) e os MAPAS de altitude, declividade, TPI, TWI e classes topográficas compostos sobre o satélite. Fecha o módulo MDE conforme a spec (§17)',
  ],
  '1.38.0': [
    'MDE F4.b — CRUZAMENTO POR CLASSE DE RELEVO: na análise topográfica, depois de gerar as classes (Topo/Ombro/Meia encosta/Baixada/Depressão/Linha de fluxo/Risco de erosão), escolha uma variável — produtividade, NDVI, fertilidade, condutividade — e veja a MÉDIA dela em cada classe de relevo + a DIFERENÇA em relação à média do talhão (ex.: quanto a baixada produz acima/abaixo da média). É a resposta direta a "por que essa área rende mais ou menos"',
    'O cruzamento é geoespacial e funciona mesmo com resoluções e recortes diferentes entre a variável e o relevo (alinhamento por coordenada real, só sobre pixels válidos). Motor validado (backend: grid de códigos das classes bate 100% com as áreas; cruzamento: 6/6). Próximo (F4.c): relatório PDF do MDE',
  ],
  '1.37.0': [
    'MDE F4 — RELEVO NAS ZONAS DE MANEJO: o relevo virou fonte oficial do zoneamento. Assim que você aprova a base altimétrica, ALTITUDE e DECLIVIDADE já ficam disponíveis como camadas na Zona de Manejo (grupo Relevo). E na análise topográfica, o botão "Salvar para Zonas de Manejo" envia também TPI, TWI, LS Factor, TRI, fluxo, aspecto e curvatura — para você escolhê-las (com peso próprio) junto de fertilidade, condutividade, NDVI e produtividade ao gerar as zonas (análise multicritério da spec)',
    'Cada camada topográfica entra reamostrada na malha de referência do talhão (co-registrada com as demais), pode ser removida do MEAP a qualquer momento e sincroniza entre aparelhos. Próximo passo do módulo (F4.b): cruzamento produtividade × classe de relevo (topo/encosta/baixada) e relatório PDF do MDE',
  ],
  '1.36.0': [
    'IA F4 — MOTOR DE REGRAS AGRONÔMICAS + QUALIDADE DOS DADOS: o card de IA do talhão agora mostra, ANTES e sem custo de IA, os "Sinais das regras" — checagens automáticas do próprio dado: K na CTC < 2% (limitação de potássio), V% < 50% (acidez), pH baixo + Al alto (toxidez), NDVI médio baixo (vigor), produtividade instável entre safras, e zona de alto potencial quando a fertilidade está boa e estável. Cada sinal é marcado como limitante, risco ou oportunidade',
    'SCORE DE QUALIDADE DOS DADOS (Alta/Média/Baixa): avalia a completude do talhão (fertilidade + produtividade + dados espaciais como NDVI, condutividade, relevo e zonas). Esses sinais e o score entram no contexto enviado à IA como evidências JÁ CLASSIFICADAS, então o diagnóstico fica mais fundamentado e o nível de confiança passa a acompanhar a qualidade real dos dados. Motor determinístico validado (16/16 testes)',
  ],
  '1.35.0': [
    'IA F3 — PERGUNTAR SOBRE ESTE TALHÃO (chat): no Resumo do talhão, um chat onde você pergunta em linguagem livre ("qual o principal limitante?", "onde investigar compactação?", "esse talhão tem estabilidade produtiva?") e a IA responde usando SÓ os dados do talhão — mantém o fio da conversa e mostra o custo de cada resposta. Perguntas sugeridas com um clique',
    'IA F3 — EXPLICAR RECOMENDAÇÃO: na aba Recomendações, depois de calcular as doses, o botão "Explicar com IA" gera uma explicação técnica + em linguagem para o produtor, justifica as maiores e as menores doses, aponta inconsistências e dá o nível de confiança — sem NUNCA alterar as doses (a IA explica, não refaz). Ambos reusam o mesmo pacote de dados seguro do diagnóstico',
  ],
  '1.34.0': [
    'IA F2 — HISTÓRICO E CUSTO DO DIAGNÓSTICO: cada vez que você gera/atualiza o diagnóstico do talhão, a análise anterior fica GUARDADA (não é mais sobrescrita). O card ganhou um "Histórico" que lista as análises daquele talhão/safra por data — clique para reabrir uma versão antiga e comparar como o diagnóstico evoluiu (e volte para a atual num toque)',
    'CONTROLE DE CUSTO: cada diagnóstico agora mostra o modelo usado, os tokens e o CUSTO ESTIMADO em dólar; o histórico soma o total gasto no talhão. A estimativa cobre gpt-4o, gpt-4o-mini e gpt-4.1 (atualizável no servidor) — assim dá para acompanhar o gasto de IA por área. Tudo continua salvo com o contexto para auditoria',
  ],
  '1.33.0': [
    'IA — DIAGNÓSTICO INTELIGENTE POR TALHÃO (Fase 1): novo card "Diagnóstico com IA" no Resumo do talhão. Um clique monta um RESUMO dos dados que o talhão já tem (fertilidade média do laudo, produtividade histórica oficial, NDVI e composições, condutividade elétrica, relevo/MDE, zonas de manejo, compactação) e a IA agronômica devolve um diagnóstico estruturado: potencial do talhão, principais limitantes, evidências, hipóteses, oportunidades de manejo, riscos, dados ausentes e um resumo em linguagem simples para o produtor',
    'Regras de segurança da spec: a IA usa SOMENTE os dados fornecidos pela plataforma (nada inventado), sempre informa o NÍVEL DE CONFIANÇA, a chave da OpenAI fica só no servidor (nunca no navegador), e cada diagnóstico é salvo COM o contexto enviado — auditável. Abrir a tela mostra o diagnóstico salvo; a IA só roda de novo no botão Atualizar (custo controlado)',
    'Para ATIVAR: crie a chave na OpenAI e adicione OPENAI_API_KEY no Environment do serviço no Render (instruções com o suporte). Sem a chave, o card explica exatamente o que falta. Próximas fases: histórico/créditos, explicador de recomendação, chat do talhão',
  ],
  '1.32.0': [
    'ÍNDICES VEGETATIVOS — COMPOSIÇÃO TEMPORAL (IV5): o módulo NDVI/Satélite foi organizado em 3 ABAS — Imagens & índices (o fluxo de sempre), Composição temporal (nova) e Camadas salvas (inventário). Na composição, escolha o índice base (NDVI ou qualquer outro mantido), marque 2+ DATAS APROVADAS e o MÉTODO — Mediana (padrão, robusta a ruído), Média, Máximo ou Mínimo — e gere uma camada composta mais estável do período, que reduz o efeito de nuvem/sombra/estresse de uma data isolada',
    'O alinhamento entre imagens é automático mesmo entre sensores (Sentinel-2 10 m × CBERS-4A 2 m): tudo é reamostrado para a grade mais fina usando a posição geográfica real de cada pixel; a composição só usa PIXELS VÁLIDOS (nuvem/sombra descartadas na origem). NADA é salvo automaticamente: o resultado abre em PRÉVIA no mapa com estatísticas e % de pixels válidos — só o botão "Aprovar e salvar" grava',
    'Camada aprovada com ≥2 imagens e ≥70% de pixels válidos fica APTA PARA ZONAS DE MANEJO e aparece no MEAP (Sensoriamento Remoto, ex.: "NDVI Mediana"); abaixo disso é salva como camada de CONSULTA com aviso. Cada composição registra índice, método, sensores, datas, resolução, % válidos, máscara, cultura/safra, autor e nomes (amigável + técnico)',
  ],
  '1.31.0': [
    'MDE FASES 2+3 — ANÁLISE TOPOGRÁFICA AGRONÔMICA: com a base oficial aprovada, um clique em "Gerar análise" calcula na nuvem TODOS os derivados do relevo: ASPECTO (direção da vertente), CURVATURAS (geral, perfil e plano — acúmulo × dispersão de água), TPI (posição topográfica), TRI (rugosidade), FLUXO ACUMULADO (com preenchimento de depressões + D8), CURVAS DE NÍVEL (intervalo automático) — sempre com buffer, sem erro de borda',
    'INDICADORES AGRONÔMICOS: TWI (umidade topográfica — do seco/escoamento ao acúmulo/encharcamento), LS FACTOR (fator topográfico da erosão), REDE DE DRENAGEM POTENCIAL com sensibilidade ajustável (baixa = só linhas principais ≥2 ha · média ≥0,75 ha · alta ≥0,25 ha) e CLASSES TOPOGRÁFICAS do talhão (Topo / Ombro / Meia encosta / Baixada / Depressão / Linha de fluxo / Risco de erosão) com ÁREA E % POR CLASSE',
    'Cada camada abre no mapa com legenda própria (divergentes centradas no zero; aspecto em rampa circular N→L→S→O) e sai em GeoTIFF (EPSG:4326) — pronto pro QGIS. Motor validado com relevos sintéticos de gabarito (vale em V concentra o fluxo no talvegue, morro convexo × tigela côncava nas duas curvaturas, poço interno preenchido) e com dados reais. Falta a F4: integração com Zonas de Manejo, cruzamentos e relatório',
  ],
  '1.30.0': [
    'NOVO MÓDULO — MDE / ANÁLISE TOPOGRÁFICA (Fase 1 de 4): a aba "Altimetria (MDE)" saiu do "em breve" e virou real. Um clique busca o Modelo Digital de Elevação do talhão em fontes públicas (Copernicus DEM GLO-30 → NASADEM/SRTM automático; FABDEM/ALOS aparecem como indisponíveis com o motivo — licença/chave) e processa TUDO na nuvem: altitude, declividade e relevo sombreado, sempre com BUFFER ao redor do talhão (nunca derivamos no limite seco — sem erro de borda)',
    'PRÉVIA para validação antes de salvar: mapa hipsométrico (verde→marrom, relativo à área), declividade em classes de relevo (plano → montanhoso), relevo sombreado, estatísticas (mín/média/máx/amplitude/declividade), histograma de altitude e AVISOS de qualidade (área sem dados, talhão pequeno para 30 m, relevo plano, amplitude suspeita)',
    'APROVAR transforma a base no MDE OFICIAL do talhão (variável fixa): metadados + rasters salvos na nuvem (carregam sem reprocessar), substituição pede confirmação e a base anterior fica no HISTÓRICO de versões (restaurar = 1 clique). Exportar GeoTIFF (EPSG:4326) da altitude e da declividade — abre no QGIS. Fases seguintes: derivados (TPI/TRI/curvatura/fluxo), análise agronômica (TWI/LS/drenagem/classes) e integrações',
  ],
  '1.29.0': [
    'APP DE CAMPO — novo módulo COMPACTAÇÃO (#36): o ciclo completo do penetrômetro. Na PLATAFORMA (aba Compactação → "Grade de compactação"), crie a grade de pontos do talhão (densidade em ha/ponto, distância da borda, profundidades — padrão 0-10/10-20/20-30/30-40 cm — e unidade MPa ou kgf/cm²), com "ver pontos no mapa"',
    'No CAMPO (novo card Compactação no app), o operador escolhe a grade, navega por GPS até cada ponto (distância + raio de 15 m com vibração ao chegar) e registra a leitura do penetrômetro POR PROFUNDIDADE + observação — tudo offline; pontos coloridos por status (pendente/coletado/pulado) e multi-aparelho (leituras de outros celulares aparecem)',
    'De volta à plataforma, "Buscar leituras do campo" mostra o progresso (X/N coletados) e "Virar levantamento" transforma as leituras num levantamento de penetrometria normal — que interpola por profundidade no fluxo que já existia. As leituras sincronizam no botão Sincronizar do app (contam nos pendentes)',
  ],
  '1.28.0': [
    'ZONAS DE MANEJO — LABORATÓRIO DE ZONAS (Condutividade C4.2): novo botão "Laboratório" no bloco de Zoneamentos salvos (aba Zonas de Manejo) abre uma bancada que COMPARA todos os cenários de zona do talhão numa tabela — variáveis + pesos, método, nº de zonas/polígonos, área média por zona, CV médio e homogeneidade — com o MELHOR cenário destacado (menor CV médio = zonas mais homogêneas por dentro, que costumam representar melhor a realidade)',
    'CONCORDÂNCIA ESPACIAL entre dois cenários: escolha Cenário A × Cenário B e veja o % de área onde os dois classificam o potencial no mesmo terço (alto/médio/baixo) — é a comparação "Zona só-Condutividade × Multivariável" da spec, com barras de área por classe de cada cenário lado a lado. Cada zoneamento agora guarda os pesos por camada usados, para a comparação ser justa. Fecha a fase C4',
  ],
  '1.27.0': [
    'CONDUTIVIDADE C4.1 — HISTÓRICO DE PROCESSAMENTO: cada interpolação de uma profundidade agora fica registrada como uma "rodada", guardando como o mapa foi feito — Automática ou Manual, modelo do variograma, RMSE, qualidade, % removido e a data. Um painel "Histórico de processamento" no card lista todas as rodadas (a mais recente marcada como "atual")',
    'REPROCESSAR NÃO SOBRESCREVE ÀS CEGAS: interpolar de novo uma profundidade que já tem mapa agora PEDE CONFIRMAÇÃO — a rodada anterior fica guardada no histórico (nunca se perde). Cada rodada do histórico tem "Usar", que repõe os parâmetros daquele processamento nos controles (limpeza + krigagem) para você reproduzi-lo e clicar em Interpolar',
  ],
  '1.26.0': [
    'CONDUTIVIDADE C2.b — EXPORTAR GeoTIFF: o mapa krigado agora tem o botão "GeoTIFF" (no card de qualidade) que baixa o raster georreferenciado (EPSG:4326, 1 banda, sem-dado = -9999) idêntico ao que está na tela — abre direto no QGIS/ArcGIS ou vai para o software da máquina. O arquivo sai nomeado por talhão + atributo + profundidade',
    'CONDUTIVIDADE — o "% removido" na limpeza agora conta no ÍNDICE DE QUALIDADE: acima de 30% dos pontos descartados o índice avisa "dado ruidoso", e acima de 40% ele rebaixa a nota em um nível (um mapa pode ficar liso, mas o levantamento bruto tinha muito ruído). Fecha a fase C2.b (variograma manual + GeoTIFF + % no índice)',
  ],
  '1.25.0': [
    'CONDUTIVIDADE C2.b — VARIOGRAMA MANUAL completo: na krigagem Modo 2 (Manual), além do modelo e do pixel, agora dá pra fixar Alcance, Patamar, Pepita, nº de Vizinhos e Anisotropia (razão + ângulo). Preencha o Alcance para o backend usar exatamente esses parâmetros, sem auto-ajuste — controle total do geoestatístico',
  ],
  '1.24.0': [
    'APP DE CAMPO — novo módulo NDVI / MANCHA: no Wi-Fi, escolha o talhão e BAIXE um índice (NDVI, SAVI…) já colorido para o aparelho; no campo, sem sinal, abra a mancha sobre o satélite e TOQUE nela para navegar por GPS até lá (distância + linha até o alvo). Tudo offline, reaproveitando a bússola/GPS da amostragem',
    'Os índices baixados ficam guardados no aparelho (com miniatura) e podem ser removidos; a lista da nuvem mostra o que já foi processado na plataforma para aquele talhão',
  ],
  '1.23.2': [
    'CORREÇÃO importante no editor de traçado: talhão com VÁRIOS PEDAÇOS (ex.: IGEFI 03, 2 áreas separadas) agora carrega TODOS os pedaços para edição — antes só abria o maior e, ao salvar, o outro sumia. Ao salvar, todos os pedaços continuam no mesmo talhão (nada é descartado nem vira talhão novo)',
  ],
  '1.23.1': [
    'TABELA DE PREÇOS ÚNICA nas Equações (Biblioteca › Equações): registre o preço de um produto uma vez (custo/tonelada, frete, aplicação) e reaproveite em qualquer equação — o editor tem “Salvar na tabela” e um seletor “Puxar produto salvo” que preenche os custos. Salvar o mesmo produto atualiza o preço (não duplica); a tabela sincroniza entre aparelhos',
  ],
  '1.23.0': [
    'CONDUTIVIDADE — os pontos BRUTOS e LIMPOS no mapa agora aparecem em 5 CLASSES por quintis (cada classe ~20% dos pontos), com uma mini-legenda de faixa + contagem. Fica muito mais fácil enxergar a distribuição e o efeito da limpeza do que na rampa contínua (que era dominada pelos extremos)',
    'PRODUTIVIDADE/COLHEITA — novo botão "Ver pontos brutos (5 classes)": pré-visualize as leituras da colhedora classificadas em quintis ANTES de processar, para bater o olho na dispersão e nos outliers',
  ],
  '1.22.0': [
    'CONVERSÃO DE UNIDADES entre laboratórios na importação de laudo: cada lab reporta em unidades diferentes (bases em cmolc/dm³ ou mmolc/dm³ ou mg/dm³; MO em g/dm³, g/kg ou %). Agora, na prévia da importação, você escolhe a unidade de cada variável NAQUELE laudo e a plataforma converte para o padrão dela (bases mmolc/dm³, P/micros mg/dm³, MO g/dm³) — os dados de labs diferentes ficam comparáveis',
    'Conversões corretas por elemento: cmolc↔mmolc (×10), mg/dm³→mmolc pelo peso equivalente (K ÷39,1 · Ca ÷20,0 · Mg ÷12,2), MO %↔g/dm³ (×10), argila g/kg↔% (÷10). As variáveis que serão convertidas aparecem destacadas; quem não informa unidade (ou já está no padrão) fica igual (nada muda nas importações antigas)',
  ],
  '1.21.0': [
    'ZONAS DE MANEJO — RECLASSIFICAR polígono: cada mancha da lista ganhou um seletor de zona; se o agrônomo achar que aquele pedaço é de outra classe, é só escolher a zona certa (muda a cor/classe na hora, sem mexer na geometria)',
    'ABSORVER FRAGMENTOS (regra 13.03 do MEAP): um botão funde as manchas menores que a área mínima na zona VIZINHA de classe mais próxima — o mapa fica operável para o maquinário. Mostra quantos fragmentos existem; fragmentos sem vizinho (ilhas soltas) são preservados. Tudo entra no Desfazer/Refazer',
  ],
  '1.20.0': [
    'IMPORTAÇÃO DE TALHÕES agora BLOQUEIA sobreposição: ao importar (individual ou em massa), o sistema confere se o polígono invade a área de outro talhão — do próprio lote ou já cadastrado. Se houver sobreposição real (talhões que só encostam na divisa NÃO contam), a importação fica travada até você resolver',
    'Para resolver, o botão "Corrigir" abre o editor de traçado naquela peça: arraste os nós, corte ou recorte para tirar a invasão — a área é reconferida na hora e, ficando limpo, o botão de importar/gravar libera. Na massa, cada linha em conflito mostra com quem sobrepõe e quantos hectares',
  ],
  '1.19.0': [
    'ZONAS DE MANEJO — EDITAR/CORTAR zona: cada polígono da lista ganhou o botão ✏ que abre o editor de geometria naquela zona. Lá dá pra CORTAR a zona em duas (a nova mancha herda a mesma classe), mover/inserir/remover vértices, recortar buraco ou simplificar — o mesmo editor das medições/limites, agora dentro do MEAP',
    'DESFAZER / REFAZER as edições de zonas (fusão, corte, ajuste de vértices): botões ↶ ↷ no cabeçalho dos polígonos, com histórico de até 30 passos. Uma nova geração de zonas zera o histórico',
  ],
  '1.18.4': [
    'GERAR ZONAS POR SIMILARIDADE bem mais rápido: o motor de agrupamento (FCM) passou a calcular distâncias por multiplicação de matriz em vez de montar um tensor gigante a cada passo, e a etapa "Analisar (FPI × NCE)" agora usa uma amostra representativa dos pixels (a escolha do nº de zonas não muda) — o "Analisar" caiu de ~11 s para ~3 s nos testes, e a geração final também acelerou. A sugestão de nº de zonas continua idêntica e determinística',
  ],
  '1.18.3': [
    'Ficha do talhão (painel) — "Mapas definitivos": entrou a CONDUTIVIDADE (CEa) como mapa real (mostra a profundidade oficial, com "Ver no mapa"), e saiu a Produtividade da lista — porque produtividade é POR SAFRA, não uma variável fixa do talhão (ela continua na página completa do talhão). Altimetria segue como "em breve"',
  ],
  '1.18.2': [
    'Convite de usuário: o link de confirmação de e-mail agora aponta sempre para a app publicada (origem atual), nunca mais para localhost — reforço contra o erro "não é possível acessar localhost" que aparecia quando o projeto está com confirmação de e-mail ligada e a Site URL mal configurada. Obs.: o ideal continua sendo manter a confirmação de e-mail DESLIGADA no Supabase (o convite já cria a senha provisória)',
  ],
  '1.18.1': [
    'EDITOR DE TRAÇADO mais claro: a barra virou duas partes — em cima o título + medidas e o botão SALVAR (verde, sempre visível, não some mais no meio das ferramentas); logo abaixo uma PALETA com TODAS as ferramentas à vista, separadas em Modo (Mover/Remover/Cortar/Buraco — a ativa fica destacada) e Ações (Reduzir/Simplificar/Suavizar/Desfazer)',
    'Nova ferramenta REDUZIR: tira os vértices redundantes SEM mudar o contorno (só remove pontos que estão praticamente em cima da reta entre os vizinhos, tolerância 0,3 m) — diferente do Simplificar, que é mais agressivo e pode mexer levemente no desenho. Ideal para enxugar contornos densos (caminhada de GPS, importados com muitos pontos)',
  ],
  '1.18.0': [
    'EDITOR DE TRAÇADO (tela cheia, sobre o satélite) nas MEDIÇÕES e no LIMITE DO TALHÃO: arraste vértices, toque no ponto azul entre dois vértices para INSERIR, modo remover, SIMPLIFICAR (tira vértices redundantes, tolerância 1,5 m) e SUAVIZAR cantos — com desfazer e área/perímetro ao vivo',
    'CORTAR EM DOIS: desenhe uma linha atravessando a área e ela vira 2 polígonos — na medição cria "nome (2)", no talhão cria um novo talhão na fazenda. RECORTAR BURACO/ILHA: desenhe o contorno de benfeitoria/mata/açude dentro da área e ele vira um furo (a área desconta na hora)',
    'O editor abre pelo botão "Editar traçado" no painel de Medições e na ficha do talhão (Limite do Talhão) — e também conserta talhão salvo como LINHAS (emenda e fecha o contorno automaticamente, caso IFEGI 03)',
    'APP DE CAMPO e PÁGINA DO TALHÃO agora mostram a VERSÃO no rodapé (confira se o aparelho está atualizado)',
    'CONFIGURAÇÕES arrumada: saiu o "motor de interpolação local" (era da época do backend na máquina; o status do servidor de processamento na NUVEM aparece no lugar), saíram as linhas decorativas sem função (Integrações, Dados da empresa, Backup) e o carregador de dados de teste — ficou Versão + Servidor, Etiquetas, Changelog e Sobre',
  ],
  '1.17.0': [
    'APP DE CAMPO — nova aba GRADES: além do passo a passo (Produtor→Fazenda→Talhão→Ciclo), agora dá pra escolher a SAFRA e ver TODAS as grades numa lista só, com busca por nome (grade ou talhão), filtros de status (Nova / Iniciada / Finalizada) e de sincronização (Sincronizadas / Pendentes) — igual ao fluxo que você pediu',
    'MAPAS OFFLINE mais fáceis: cada grade da lista tem um botão de BAIXAR o mapa de satélite do seu talhão pro celular, e um botão "Baixar todos" pega os mapas de todos os talhões da safra de uma vez (sem rebaixar imagens repetidas de talhões vizinhos) — prepare tudo no Wi-Fi antes de ir a campo',
    'A tela mostra a hora da "Última atualização" (última sincronização) no topo, para você saber se os dados estão frescos',
  ],
  '1.16.1': [
    'CORREÇÃO: sumiu de vez a mensagem antiga "Interpolador desligado nesta máquina… dê dois cliques em start.bat" — ela era da época do backend local e ainda aparecia quando o servidor da NUVEM estava dormindo (ele hiberna sem uso e leva ~1 min para acordar)',
    'Agora o app ACORDA o servidor sozinho: abrir a página do talhão já dispara a subida, e qualquer processamento (fertilidade, zonas de manejo, satélite, colheita, condutividade) que encontrar o servidor dormindo espera ele acordar e REPETE a chamada automaticamente — sem erro e sem clique extra',
    'Se mesmo assim o servidor não responder (~1,5 min), a mensagem nova explica a situação real ("Servidor de processamento indisponível… tente de novo em ~1 minuto") — a instrução do start.bat só aparece no modo de desenvolvimento local',
  ],
  '1.16.0': [
    'Condutividade C2 — ASSISTENTE de limpeza: um clique sugere os parâmetros pelo tamanho do talhão (Global 85% · Local 15%, ou 10% em talhões < 30 ha · Raio 100 m), sempre editáveis',
    'KRIGAGEM MANUAL (Modo 2): no painel de parâmetros dá pra trocar de Automática para Manual e escolher o MÉTODO (Krigagem/IDW), o MODELO do variograma (esférico/exponencial/gaussiano) e o PIXEL (10–30 m) da interpolação. Alcance/pepita/patamar manuais e export GeoTIFF ficam para a próxima fase',
  ],
  '1.15.0': [
    'Condutividade C3 — a EC OFICIAL do talhão virou fonte da ZONA DE MANEJO: as profundidades (e extras como Altimetria) aparecem como camadas no MEAP, com peso próprio — dá pra gerar zona SÓ com EC (marque só as camadas EC) ou multivariável (EC + fertilidade + índices)',
    'EC também entrou no COMPARADOR de camadas (grupo Condutividade): compare EC × produtividade, EC × NDVI, EC 0–20 × 20–40 — com correlação espacial e PDF',
  ],
  '1.14.0': [
    'IV4 — LINHA DO TEMPO dos índices salvos na aba NDVI/Satélite: gráfico da MÉDIA de cada índice ao longo das datas mantidas (uma série por índice+sensor, cores próprias). Tocar num ponto abre o mapa daquela data; clicar na série oculta/mostra — a evolução do vigor da lavoura na safra num relance',
    'Cenas REJEITADAS agora são salvas na NUVEM por talhão (antes ficavam só no navegador): a rejeição feita num computador vale em qualquer outro aparelho. Offline continua funcionando com o registro local e sincroniza na próxima abertura',
  ],
  '1.13.0': [
    'IV3 — Índices integrados aos outros módulos: na ZONA DE MANEJO cada índice mantido aparece com o nome certo (ex.: "SAVI S2", "NDRE CBERS") — antes tudo era rotulado NDVI e dois índices da mesma data colidiam',
    'COMPARADOR: os índices entram na lista de camadas com nome e sensor; comparar Sentinel-2 × CBERS-4A mostra o AVISO de calibração (resolução, data, bandas — apoio visual, não equivalência absoluta)',
    'GERADOR DE RELATÓRIOS: os índices mantidos viram capítulos do PDF (cada data = um painel, com sensor e estatísticas); índices que não são NDVI saem com escala contínua min–máx da cena',
  ],
  '1.12.0': [
    'IV2 — MOTOR DE ÍNDICES: na conferência da imagem você agora escolhe QUAIS índices processar — NDVI, SAVI, MSAVI, EVI, EVI2, GNDVI, NDWI, VARI, ExG e GLI (Sentinel-2 também NDRE e NDMI). O backend baixa SÓ as bandas necessárias e calcula só o que você marcou; nada é salvo automaticamente',
    'Sentinel-2 com MÁSCARA DE NUVEM/SOMBRA (banda SCL): pixels de nuvem, sombra e cirrus são descartados dos índices; o resultado mostra o % de pixels válidos. No CBERS-4A, NDRE/NDMI aparecem como indisponíveis com o motivo (sem Red Edge/SWIR)',
    'Cada índice processado tem seu próprio mapa, estatísticas e botão MANTER individual (vira camada oficial com metadados: fórmula, bandas, máscara, % válidos, usuário e data) — e entra como fonte na Zona de Manejo. Índices que não forem NDVI usam escala automática p2–p98',
  ],
  '1.11.1': [
    'CORREÇÃO: cards de imagem duplicados quando o talhão fica na EMENDA de duas cenas do satélite (a mesma passagem/data vinha como 2+ tiles vizinhos no catálogo) — agora fica 1 card por data e fonte, escolhendo a cena de menor nuvem',
  ],
  '1.11.0': [
    'NDVI/Satélite — IV1 do spec de Índices Vegetativos: a busca agora mostra CARDS com PRÉVIA RGB do talhão (miniatura leve por cena, Sentinel-2 e CBERS-4A) — nada é processado nem salvo automaticamente ao listar',
    'Ao tocar num card abre a CONFERÊNCIA: a prévia RGB fina aparece no mapa (com o contorno do talhão e zoom) para avaliar nuvem/sombra/cultura/solo exposto; só então você decide "Processar NDVI" ou "Rejeitar" a imagem (rejeição fica marcada no card)',
    'Nuvem máxima do Sentinel-2 agora padrão 5% — sem resultados, o app sugere ampliar para 10/15% com um clique; nova opção de fonte "Todos" (lista Sentinel-2 e CBERS-4A juntos, cada card identificado)',
    'Estados por card: rejeitada, vista, NDVI processado (✓) e mantida (★). Cenas já mantidas continuam abrindo direto como antes — nada muda no que estava salvo',
  ],
  '1.10.0': [
    'PERMISSÕES POR VÍNCULO (consultoria): em Usuários, cada Agrônomo/Operador ganhou o botão de clientes (🏢) — o Owner escolhe QUAIS clientes aquele usuário pode acessar. Sem nenhum marcado = vê todos (retrocompatível); ao marcar, ele passa a enxergar SÓ os clientes/fazendas/talhões vinculados, na plataforma E no app de campo',
    'O filtro vale para todo o sistema (lista de clientes, fazendas, talhões) e para o Repositório de Medições — um usuário limitado vê apenas as medições dos seus talhões (e as que ele mesmo registrou). Owner e Admin continuam vendo tudo',
  ],
  '1.9.1': [
    'Permissões: nova atribuição "Gerar mapas de NDVI / satélite" — liberada por padrão para Owner, Admin e AGRÔNOMO (ajustável na matriz de permissões). Quem não tem a permissão vê a aba NDVI apenas informativa',
    'Convite de usuário: quando o Supabase bloqueia por limite de e-mail, o aviso agora explica o que fazer (desligar "Confirm email" em Authentication → Providers → Email, ou criar a conta em Authentication → Users) em vez de só mostrar "email rate limit exceeded"',
  ],
  '1.9.0': [
    'NOVO no painel web — REPOSITÓRIO DE MEDIÇÕES (ícone "Medições" na barra lateral): lista tudo que o app de campo enviou pra nuvem (áreas e linhas), com categoria, área/distância, talhão vinculado, operador e data. Fecha o ciclo campo → escritório',
    'Por medição: ver no mapa, BAIXAR em SHP (.zip)/KML/GeoJSON, e — para polígonos — CRIAR um talhão novo (escolhendo cliente/fazenda) ou SUBSTITUIR o limite de um talhão existente, além de excluir',
  ],
  '1.8.1': [
    'Medição: a FREQUÊNCIA de gravação virou opção (1 / 2 / 3 / 4 / 5 segundos por ponto) no botão de ajustes — intervalos maiores geram menos pontos em áreas grandes e economizam bateria; dá pra mudar até no meio da caminhada. O cronômetro continua em segundos reais e o offset lateral ficou no mesmo painel de ajustes',
  ],
  '1.8.0': [
    'Medição GPS agora 100% no modelo do spec: captura por TEMPO — 1 ponto por segundo enquanto você anda — com deslocamento mínimo (0,7 m, "só grava em movimento") e FILTRO DE PRECISÃO (ignora leitura pior que ±25 m, avisando). Cada ponto guarda precisão, velocidade e hora',
    'Painel AO VIVO durante a caminhada: tipo, tempo decorrido, nº de pontos, distância, área parcial, status/precisão do GPS e velocidade. Durante o percurso o polígono fica como CONTORNO ABERTO e só fecha ao FINALIZAR (liga último→primeiro)',
    'Botão CANCELAR com confirmação ("os pontos serão descartados") e SALVAMENTO completo: nome, categoria (Área de coleta/Falha/Mancha/Carreador/Divisa/Estrada/Erosão/Talhão/Outro), talhão, ciclo e observação — tudo sobe pra plataforma na sincronização',
  ],
  '1.7.0': [
    'Medição estilo FieldRover: GRAVAR CAMINHADA — caminhe a divisa e o app marca os vértices sozinho (a cada ~3 m); PAUSAR no meio (desviar de obstáculo/descansar) e RETOMAR, que emenda a linha de onde parou; FINALIZAR liga os pontos automaticamente (fecha o polígono) e mostra a área',
    'Medição com OFFSET lateral em metros (1 casa decimal, esquerda/direita): desloca os vértices perpendicular à direção de caminhada — para quando você anda paralelo à cerca/divisa. Vale tanto na gravação quanto no vértice manual (botão +)',
  ],
  '1.6.1': [
    'CORREÇÃO: a limpeza de geometria da 1.6.0 estava agressiva demais e passou a REJEITAR polígonos válidos (aparecia "anel degenerado / nenhum polígono aproveitável"). Reescrita com mudança MÍNIMA: um polígono já fechado passa INTACTO; só corrige o que está de fato quebrado (linha aberta vira polígono; remove só vértices duplicados exatos e ESPÍCULAS reais de vai-e-volta, por ângulo — cantos normais são preservados) e NUNCA degenera (na dúvida, mantém o anel original). Importação individual e em massa voltam a funcionar',
  ],
  '1.6.0': [
    'Importação de limites agora LIMPA geometria defeituosa automaticamente (individual e em massa): polígono desenhado como LINHA ABERTA é fechado e recuperado, espículas (vai-e-volta) e vértices duplicados são removidos, auto-interseções são consertadas — sem comprometer o resto do polígono; o que foi corrigido aparece como aviso',
    'Importação em massa: botão com resposta de verdade — mostra "Importando…", conclui com "✓ X criados · Y atualizados" e QUALQUER erro aparece na tela (antes falhava em silêncio); a gravação virou UMA operação em lote (muito mais rápida com dezenas de polígonos)',
    'Medições do app de campo agora SOBEM PRA NUVEM na sincronização (não se perdem se o aparelho sumir) — a lista mostra "a enviar / na nuvem ✓"; o repositório na plataforma (baixar SHP, virar talhão, substituir limite) é a próxima etapa',
  ],
  '1.5.0': [
    'LOGIN OFFLINE no app de campo: depois do 1º login com internet, o aparelho guarda um verificador seguro da senha (hash PBKDF2 — a senha em si NUNCA é salva). Sem internet, o mesmo e-mail e senha entram no app normalmente (coletas/medições continuam funcionando; os dados ficam pendentes)',
    'No modo offline, o botão Sincronizar avisa com clareza: ao voltar a internet é preciso sair e entrar de novo (login de verdade) para enviar os dados — e o envio agora só marca como sincronizado o que o servidor CONFIRMOU (antes um erro silencioso podia marcar coleta como enviada sem ela ter subido)',
    'Trocar a senha também atualiza o acesso offline do aparelho',
  ],
  '1.4.0': [
    'App de campo (/coleta): nova TELA INICIAL com os módulos — Amostragem de Solo (o fluxo de coleta) e Medição; a casa preparada pra receber os próximos módulos de campo',
    'NOVO módulo MEDIÇÃO: polígono (ÁREA em ha + perímetro) e linha (DISTÂNCIA) — marque vértices tocando no mapa ou caminhando com o botão + (vértice na sua posição GPS); desfazer/limpar/enquadrar; medições podem ser SALVAS com nome no aparelho e reabertas depois (tudo offline)',
  ],
  '1.3.1': [
    'Coleta (celular): PINÇA e ARRASTAR do mapa corrigidos — o CSS do MapLibre agora vai embutido no app (antes vinha de CDN, que falhava no celular/offline) e o modo "seguir GPS" desliga sozinho quando você mexe no mapa (antes ele puxava a câmera de volta a cada segundo e travava o gesto)',
    'Coleta: novo botão VER A ÁREA (⛶) — enquadra o talhão/grade no mapa de onde você estiver (com fallback pelos pontos da grade quando o talhão não tem bbox); o botão de GPS (⌖) agora VAI até sua posição num toque e segue você até você arrastar o mapa',
  ],
  '1.3.0': [
    '📱 NOVO — App de COLETA DE SOLO em campo (/coleta): PWA instalável no celular/tablet (Android/iOS) que roda o dia inteiro SEM internet. Fluxo: produtor → fazenda → talhão → ciclo → área de coleta (as grades de amostragem da plataforma) → mapa com navegação GPS até cada ponto',
    'Navegação GPS: posição/precisão/velocidade contínuas, linha até o ponto, RAIO PERMITIDO configurável (5–50 m) — ao entrar no raio o aparelho VIBRA + apita e o botão "Iniciar coleta" habilita. Confirmação registra horário, operador, coordenada real, profundidades, umidade/compactação/problemas/observações e FOTOS (antes/durante/após)',
    'Offline de verdade: service worker (o app abre sem internet), botão "Baixar mapa offline" (tiles de satélite do talhão ficam no aparelho), coletas e fotos guardadas localmente (localStorage + IndexedDB) e SINCRONIZAÇÃO automática (ao voltar a conexão) e manual — coletas viram docs no Supabase (merge por data, vários aparelhos na mesma grade sem conflito) e fotos sobem pro Storage (bucket "coletas")',
    'Status por cor no mapa e na lista (pendente/coletado/pulado/cancelado + sincronizado), filtros, lista ordenada por proximidade, tela sempre ligada durante o trabalho, sat/ruas, instalar na tela inicial',
  ],
  '1.2.0': [
    'Cadastro de talhões EM MASSA na fazenda (#31): botão "Importar em massa (KML/SHP)" ao lado de "Novo Talhão". Aceita VÁRIOS arquivos de uma vez (.kml, .zip shapefile, .geojson) — 1 arquivo por talhão, ou 1 arquivo com vários talhões nomeados (feições com o mesmo nome são agrupadas num talhão só, glebas somadas e furos descontados)',
    'Antes de gravar, tela de revisão: nome editável, área calculada, pré-visualização de todos os polígonos no mapa e seleção do que entra. Se o nome bater com um talhão já existente, ATUALIZA o limite dele em vez de criar duplicado (badge "atualiza limite" × "novo")',
  ],
  '1.1.1': [
    'Zerada de erros: o Início agora mostra a VISÃO GERAL REAL (produtores, fazendas, talhões, área total, incompletos e a safra ativa) — antes eram números fixos em 0 (mock antigo). O bloco "Processamentos Recentes / SIMULADO" (fake) foi removido',
    'Corrigido o erro vermelho do mapa no Console (circle-radius com "zoom" dentro de "case" — inválido no MapLibre); os pontos de amostragem/EC seguem com o mesmo comportamento visual',
    'Logo: eliminados os avisos do next/image (proporção width/height) e o aviso de LCP — logo com prioridade de carregamento no topo e no login',
  ],
  '1.1.0': [
    'Biblioteca › Preferências de Análise ganhou a aba VARIÁVEIS DE ANÁLISE — o cadastro das variáveis dos laudos (Sigla · Nome · Unidade · Usar), no estilo do InCeres. As 16 variáveis atuais viram cadastro editável (semeadas na 1ª abertura) e dá para CRIAR novas (ex.: pH SMP), com sinônimos para o auto-mapeamento das planilhas. As do sistema podem ser desativadas (não excluídas, pois são chave de dados)',
    'Laboratórios: cada perfil agora registra a UNIDADE e o EXTRATOR/MÉTODO de cada variável DAQUELE laboratório (ex.: K em mmolc/dm³ · Mehlich num lab; cmolc/dm³ · Resina em outro) — editável no perfil (Biblioteca › Laboratórios) e exibido na importação do laudo',
    'O auto-mapeamento de planilhas e os editores (Padrão de Elementos, Perfis) passam a usar o catálogo de variáveis (incluindo as criadas por você)',
  ],
  '1.0.1': [
    'Seletor de legenda agora também no NDVI e na Produtividade — quando há mais de uma legenda do módulo, você escolhe qual aplicar (fixa, quartil, mín–máx…) e o mapa recolore na hora; a escolha fica lembrada. Mesmo seletor que já existia na Condutividade, agora reaproveitado (componente único)',
  ],
  '1.0.0': [
    '🎉 Versão 1.0 — a plataforma entrou em PRODUÇÃO com o banco definitivo. Dados, login, mapas e geometria (PostGIS) no Supabase/Postgres (São Paulo); processamento (krigagem/IDW/satélite) no Render; app na Vercel. A migração do Firebase para o Supabase está concluída — nada mais depende de rodar backend/banco na sua máquina.',
    'Marco de tudo que veio até aqui: Fertilidade, Amostragem, Zonas de Manejo (MEAP), Condutividade, NDVI/Satélite (Sentinel-2 + CBERS-4A), Produtividade, Recomendações/Cenários, Relatórios e a Biblioteca de Padrões — agora sobre uma base geoespacial de verdade.',
  ],
  '0.99.16': [
    'Correção importante (produção Supabase): o app "reabria tudo" ao clicar nas abas e a interpolação/NDVI não completava/salvava. Causa: o Supabase reemite eventos de login (refresh de token, foco na aba) e o app re-rodava o boot inteiro a cada um — desmontando a tela no meio das operações. Agora o boot só re-roda quando a identidade muda de verdade (login/logout)',
  ],
  '0.99.15': [
    'Migração de DADOS — fim: os dois últimos que ainda usavam o Firestore direto — Cenários de recomendação e o Arquivo de Relatórios — passam a ficar no Supabase/Postgres (com migração automática dos existentes na 1ª carga). Com isso, com o interruptor ligado, NENHUM dado do app grava mais no Firebase (só resta a ponte anônima temporária p/ as migrações únicas)',
  ],
  '0.99.14': [
    'D1.3 (ajuste): a migração dos mapas Firestore→Supabase agora usa uma MARCA de conclusão em vez de "está vazio?" — assim, se uma migração for interrompida no meio, a próxima carga retoma e completa (o upsert não duplica). Depois de concluída, não relê mais o Firestore',
  ],
  '0.99.13': [
    'Migração de DADOS — D1.3: os mapas/rasters (fertilidade, EC, NDVI, zonas) passam a ficar no Supabase/Postgres (na tabela app_kv, coleção à parte, carregados sob demanda por prefixo — fora do boot). Ao ligar os dados no Supabase, os mapas que já estão no Firestore migram sozinhos na 1ª carga. Só ativo com NEXT_PUBLIC_USE_SUPABASE_DATA=true; sem o interruptor, seguem no Firestore',
  ],
  '0.99.12': [
    'Migração de DADOS — D3 (auto-carga): ao ligar NEXT_PUBLIC_USE_SUPABASE_DATA pela 1ª vez, se o Postgres estiver vazio, o app semeia automaticamente as tabelas a partir dos dados locais (vindos do Firestore) ANTES de passar a ler do Postgres — a virada preserva tudo (clientes/fazendas/talhões/biblioteca) sem script nem chave de servidor. Idempotente: não re-semeia depois',
  ],
  '0.99.11': [
    'Migração de DADOS — Fase 3/D1.2: nova camada de persistência no Supabase/Postgres (lib/supabaseData.ts) — o cloud.ts virou um roteador que grava/lê no Postgres (tabelas app_kv + talhoes) em vez do Firestore quando o interruptor NEXT_PUBLIC_USE_SUPABASE_DATA=true está ligado. Mantém o modelo de cache local (front continua síncrono). Inerte sem o interruptor (produção segue no Firestore). Mapas (rasters) continuam no Firestore por ora (entram no Storage no D1.3)',
  ],
  '0.99.10': [
    'Migração Supabase — Fase 3 (A3.4, re-chave): o "dono" da Biblioteca pessoal passou a ser identificado pelo E-MAIL (estável), em vez do uid do provedor de login (que muda Firebase→Supabase). Uma migração automática e idempotente re-chaveia seus itens pessoais no 1º boot, para nada ficar órfão quando o login virar Supabase. Transparente: você não perde nada da sua Biblioteca',
  ],
  '0.99.9': [
    'Migração Supabase — Fase 3 (A3.3): o convite de novos usuários (painel Usuários) agora cria a conta no provedor ativo — Supabase (quando configurado) ou Firebase. No Supabase usa um cliente efêmero (signUp) que não desloga o admin. Requer no projeto Supabase "Confirm email" DESLIGADO para a senha provisória já valer. Sem chaves Supabase, segue idêntico ao Firebase',
  ],
  '0.99.8': [
    'Backend NA NUVEM: o interpolador (krigagem/IDW/satélite) agora roda online por padrão (Render), não mais na sua máquina. O app passa a processar mapas sem ninguém abrir backend local — some a fonte dos erros de "backend desatualizado/404". A URL ficou centralizada (lib/interpUrl.ts); para desenvolver o backend local ainda dá, definindo NEXT_PUBLIC_INTERP_URL=http://127.0.0.1:8800',
  ],
  '0.99.7': [
    'Infra (migração Supabase — Fase 3, etapa A3.2): o login agora é DUAL-PROVIDER e escolhido por ambiente — com as chaves NEXT_PUBLIC_SUPABASE_* presentes usa Supabase Auth; sem elas, segue no Firebase Auth (produção/Vercel inalterada). A identidade (e-mail/uid p/ papéis) passa a vir do Supabase quando ativo; os dados continuam no Firestore via uma sessão anônima-ponte (cloud.ts não muda). Nada visível ainda — só ativa quando as chaves forem configuradas no .env.local',
  ],
  '0.99.6': [
    'Infra (migração Supabase — Fase 3, etapa A3.1): adicionado o cliente Supabase (lib/supabase.ts) + SDK @supabase/supabase-js, sem efeito nenhum ainda — fica inerte enquanto não houver as chaves NEXT_PUBLIC_SUPABASE_*, igual ao Firebase. Prepara a troca do provedor de login (Firebase Auth → Supabase Auth) nas próximas etapas',
  ],
  '0.99.5': [
    'Talhão: as abas foram reordenadas na ORDEM DE TRABALHO — Resumo · Altimetria (MDE) · Condutividade · Zonas de Manejo · Amostragem · Fertilidade · Recomendações · Arquivos · NDVI/Satélite · Produtividade · Compactação · Relatórios',
    'Nova aba "Altimetria (MDE)" (em breve) — reservada para o relevo por Modelo Digital de Elevação. A Compactação foi mantida, agora no fim da barra (antes de Relatórios)',
  ],
  '0.99.4': [
    'Condutividade: as variáveis extras marcadas com ★ (ex.: Altitude) agora viram uma CAMADA própria na aba — aparecem ao lado das profundidades de CEa com o ícone de relevo e o nome do atributo (ex.: "Altitude · Altimetria"). Selecione e use o mesmo fluxo (Pontos brutos → Limpar → Interpolar), só que com a legenda do próprio atributo (Altimetria) em vez da de condutividade',
    'O seletor "Legenda do mapa" só aparece nas camadas de CEa; as extras usam automaticamente a legenda do seu atributo (a de Altimetria já é oficial)',
  ],
  '0.99.3': [
    'Condutividade: novo painel "Parâmetros da limpeza" (recolhível) — os valores do MapFilter vêm preenchidos com o padrão, mas dá para ajustar: corte do filtro bruto (% por cauda), faixa do MapFilter global (± % da mediana), raio e faixa do MapFilter local (m e ± % dos vizinhos), tolerância do eixo da passada e mínimo de vizinhos. Botão "Restaurar padrões"',
    'Mude um parâmetro → clique em Limpar de novo → compare em "Pontos limpos" quantos/quais pontos saíram',
  ],
  '0.99.2': [
    'Condutividade: os pontos brutos/limpos agora aparecem de vez no mapa — passaram a ser desenhados como uma IMAGEM (mesmo mecanismo do mapa de fertilidade, que sempre renderiza), em vez da camada de círculos que não estava aparecendo. Dá para ver os pontos do CSV e comparar bruto × limpo',
    'Condutividade: o contador agora mostra também o intervalo de valores dos pontos (ex.: "7.525 pontos · CEa 3–48 mS/m") — para confirmar que está usando a coluna de condutividade certa',
  ],
  '0.99.1': [
    'Condutividade: novo seletor "Legenda do mapa" — quando há mais de uma legenda de condutividade, você escolhe qual aplicar (ex.: a fixa ou a de quartil) e o mapa recolore na hora. A escolha fica lembrada',
    'Legendas: a "Categoria" (no editor) agora deixa claro que define ONDE a legenda aparece — a de Fertilidade aparece na Fertilidade, a de Condutividade na Condutividade, etc. O seletor de cada módulo lista as legendas da categoria/atributo correspondente',
  ],
  '0.99.0': [
    'Legendas: nova "Escala de cor" — além da escala fixa por valor, agora dá para usar escala RELATIVA aos dados do mapa: "Mín–máx" estica as cores entre o menor e o maior valor; "Quartil" distribui as cores por percentil (cada cor cobre uma fração igual da área). Ótimo para condutividade/produtividade, onde os valores variam de talhão para talhão',
    'No modo relativo a legenda ignora os limites das classes e usa só as CORES, adaptando automaticamente a cada mapa',
  ],
  '0.98.0': [
    'Legendas: as oficiais não são mais "presas no código". Antes, um seed rodava a cada boot, deixava elas como "Sistema" (read-only) e desfazia qualquer alteração sua. Agora o seed só roda uma vez (banco vazio); depois disso as legendas vivem no banco e são suas',
    'Legendas: novo botão "Destravar legendas oficiais" — converte as legendas Sistema em SUAS (editáveis e excluíveis), e elas não voltam mais ao padrão. Depois de destravar, dá para editar cores/limites e excluir (respeitando a trava de "em uso por perfil")',
  ],
  '0.97.0': [
    'Legendas: agora dá para criar legenda para QUALQUER atributo (não só os de laboratório) — o campo "ID do atributo" virou texto livre com sugestões (p, ctc, condutividade, altimetria, NDVI, produtividade…). Ex.: criar a legenda de Condutividade',
    'Condutividade: os pontos brutos/limpos ganharam halo branco e tamanho maior por zoom (mais visíveis sobre o satélite), e a tela agora mostra "N pontos plotados no mapa" para confirmar o que está sendo desenhado',
  ],
  '0.96.0': [
    'Legendas: as legendas do Sistema (oficiais) agora têm um botão "Editar" que cria uma cópia SUA e já abre o editor — antes só dava para duplicar e procurar a cópia. (As oficiais seguem read-only; você edita a cópia)',
    'Legendas: NOVAS Paletas de cor salvas — no editor, "Salvar paleta atual" guarda a barra de cores com um nome; depois é só clicar na paleta para reaplicar as cores em outra legenda (importação rápida). Paletas têm prévia das cores e podem ser excluídas',
    'Legendas: excluir uma legenda agora é bloqueado se ela estiver EM USO por algum Perfil — avisa em qual perfil está sendo usada (evita quebrar referências). Correção: a cópia de uma legenda agora nasce como "sua" (editável), não mais como Sistema',
  ],
  '0.95.0': [
    'Condutividade: painel "Resumo da limpeza" — depois de rodar o MapFilter, mostra a quebra por etapa (pontos brutos → filtro bruto → MapFilter global → MapFilter local → pontos limpos), quantos pontos saíram em cada uma, o total removido e uma barra de mantido × removido (verde/vermelho)',
  ],
  '0.94.2': [
    'Condutividade: os pontos brutos/limpos agora aparecem de verdade no mapa — antes ficavam pequenos demais (2,5 px) e sumiam no zoom do talhão. Agora o tamanho cresce com o zoom e ganham um contorno escuro fino, ficando visíveis sobre o satélite. Vale também para futuras nuvens densas (mapas de colheita)',
  ],
  '0.94.1': [
    'Correção: os pontos (Condutividade brutos/limpos), além dos rótulos de valor e dos pontos de amostragem, pararam de aparecer na 0.94.0 — uma expressão de raio inválida no mapa fazia a camada de pontos nem ser criada. Corrigido; os pontos voltam a ser plotados',
  ],
  '0.94.0': [
    'Condutividade: novo fluxo com LIMPEZA dos dados antes de interpolar — Pontos brutos → Limpar (MapFilter) → Interpolar. Agora dá para VER os pontos brutos no mapa (coloridos pela legenda, como um mapa), rodar a limpeza e ver os pontos LIMPOS, e só então krigar sobre os pontos filtrados',
    'A limpeza usa a mesma metodologia do MapFilter da colheita: filtro bruto (remove zeros/absurdos por percentil) + MapFilter global (mediana ± faixa) + MapFilter local anisotrópico (remove o ponto que destoa dos vizinhos ao longo da passada). Mostra quantos pontos saíram em cada etapa e o % removido',
    'O seletor "Ver no mapa" alterna entre Pontos brutos · Pontos limpos · Mapa krigado',
    'Próximo (anotado em C2): assistente que sugere os parâmetros pelo tamanho do talhão + usar as colunas de qualidade do levantamento (Qualidade Contato) + krigagem manual',
  ],
  '0.93.1': [
    'Correção (Condutividade): o mapa aparecia como uma mancha BRANCA cobrindo tudo — eram os milhares de rótulos de valor (um por ponto do levantamento, 7.000+) desenhados em cima do raster. Em dado denso como o EC, esses rótulos não são mais desenhados; agora aparece o mapa krigado colorido',
  ],
  '0.93.0': [
    'Condutividade: a interpolação voltou a ser por KRIGAGEM (era IDW). Como o EC vem muito denso (milhares de pontos), o sistema agrega os pontos numa grade fina (média por célula, ~600 células) e kriga as médias com variograma automático (esférico/exponencial/gaussiano) + validação cruzada — então o índice de qualidade passa a ter o RMSE de verdade',
    'A linha de status mostra o modelo de variograma e quantas células de quantos pontos foram usadas (ex.: "krigagem · 527 células de 7500 pts, grade 34 m")',
    'Próximo (anotado): avaliar a Krigagem Bayesiana Empírica (EBK) como evolução',
  ],
  '0.92.0': [
    'Zonas de Manejo: NOVO "Camada de fundo" na etapa Avaliar — depois de gerar as zonas, escolha uma camada (NDVI, fertilidade, condutividade…) para aparecer POR BAIXO das zonas e comparar visualmente. Antes, ao gerar, as camadas de fundo sumiam',
    'NOVO controle de "Opacidade das zonas": um slider deixa as zonas mais transparentes para enxergar a camada de fundo (e o satélite) por baixo',
    'A camada de fundo entra abaixo das zonas (satélite → camada → zonas semitransparentes)',
  ],
  '0.91.1': [
    'Zonas de Manejo: o bloco "Zonas adotadas" (topo) agora segue o mesmo conceito da avaliação — agrupa por classe e mostra "N zonas oficiais · M polígonos" (antes contava cada mancha como uma zona, ex.: "9 zonas" que na verdade eram 6 zonas em 9 polígonos)',
    'As zonas adotadas ganharam as cores em gradiente (verde→vermelho por potencial), os rótulos legíveis (Muito alto…Muito baixo) e, por zona, o nº de polígonos + área + % + menor/maior + CV',
  ],
  '0.91.0': [
    'Zonas de Manejo: o bloco "Zonas adotadas" (no topo) agora tem botão "Remover" — antes ele ficava fixo, sem como apagar. Remover desadota o talhão: tira o oficial, apaga o ambiente e limpa as zonas (a Amostragem por zona fica sem grade até você adotar outro). Os zoneamentos salvos NÃO são apagados',
  ],
  '0.90.1': [
    'Zonas de Manejo: rótulos das zonas mais claros — em vez de "Nível 1..N" (que só repetia o número da zona), agora cada zona mostra o potencial de forma legível (Muito alto → Alto → Médio → Baixo → Muito baixo) quando há mais de 5 classes',
    'A avaliação ganhou uma frase explicando a lógica: cada Zona é uma classe de potencial (do maior ao menor) e pode aparecer em vários polígonos; por isso "7 zonas · 12 polígonos"',
  ],
  '0.90.0': [
    'Correção (Zonas de Manejo): zonas com mais de 5 classes saíam todas CINZA (o semáforo só tinha nome/cor p/ Alta…Baixa). Agora as cores seguem uma rampa contínua verde→amarelo→vermelho por posição, então mesmo 6 a 12 zonas ficam coloridas (e no mapa cada polígono usa a cor da sua zona)',
    'Correção (prévia de camada): ao clicar numa camada para pré-visualizar (NDVI, fertilidade…), as zonas adotadas ficavam por cima e escondiam o raster. Agora a prévia oculta temporariamente as zonas para você enxergar a camada; ao ocultar a prévia, as zonas voltam',
    'No mapa, o rótulo de cada polígono passou a ser o número da ZONA oficial (polígonos da mesma zona mostram o mesmo número)',
  ],
  '0.89.0': [
    'Zonas de Manejo: conceito corrigido — ZONA OFICIAL = a classe agronômica. O número escolhido (ex.: 7) é o nº de zonas oficiais; uma mesma zona pode ter VÁRIOS polígonos (manchas separadas no talhão) sem virar "novas zonas". A avaliação agora mostra "7 zonas oficiais · 13 polígonos"',
    'Cada zona oficial mostra: nº de polígonos, área total e (quando tem mais de um) o menor e o maior polígono. A lista de baixo passou a se chamar "Polígonos", cada um com um selo "Zona 0X" indicando a que zona pertence',
    'A fusão manual junta polígonos sem alterar o número de zonas oficiais. Removido o termo confuso "níveis/potenciais" da tela (agora: Zona = classe, Polígono = parte espacial)',
  ],
  '0.88.0': [
    'Zonas de Manejo: limpeza automática de "resquícios" — buracos e fragmentos de polígono menores que a área mínima são removidos das zonas (preenche buracos pequenos e descarta ilhas/slivers). Vale ao gerar as zonas e também ao fundir manualmente, então a fusão não deixa mais sobras dentro do talhão',
    'Buracos e partes GRANDES (≥ área mínima) são preservados — uma zona realmente encravada em outra continua existindo',
  ],
  '0.87.0': [
    'Correção (Condutividade): o botão "Interpolar" não fazia nada com levantamentos grandes (milhares de pontos). A condutividade é dado denso (coletado em movimento), então passou a usar IDW — krigagem montava uma matriz enorme e travava. Agora interpola em poucos segundos mesmo com milhares de pontos',
    'Zonas de Manejo: quando o backend LOCAL está desatualizado (faltam as rotas novas de zonas), o erro agora é claro — "Backend local desatualizado: feche e reabra pelo atalho INVICTA Backend" — em vez do críptico "Not Found"',
  ],
  '0.86.0': [
    'Condutividade (import): a tela de colunas agora separa "Profundidade(s) de Condutividade" (escolha 1 ou mais — obrigatório) das "Outras variáveis a importar" (opcional). Antes o sistema marcava TODAS as colunas numéricas como profundidade (ex.: 7 profundidades sem querer)',
    'O sistema sugere sozinho quais colunas são CEa (pelo nome) — você ajusta à mão. Dá para importar JUNTO outras variáveis do mesmo arquivo, como a altitude',
    'Cada variável extra pode ser marcada com ★ "Variável Fixa" (ex.: altitude para virar Altimetria depois). Por ora elas ficam armazenadas no levantamento; usar a altitude como camada fixa/interpolada vem na sequência',
  ],
  '0.85.0': [
    'Zonas de Manejo (MEAP): FUSÃO MANUAL de zonas — na etapa Avaliar, marque 2 ou mais zonas na lista e clique em "Fundir" para juntá-las numa só. As divisas entre zonas vizinhas são dissolvidas (vira um polígono contínuo); a zona resultante herda o potencial da MAIOR e a área é recalculada',
    'Diferente da "área mínima" (fusão automática por tamanho): aqui é você quem escolhe quais zonas unir, na hora, antes de salvar o zoneamento',
  ],
  '0.84.0': [
    'NOVO módulo Condutividade Elétrica (CEa) — Fase C1: nova aba "Condutividade" na página do talhão. Importe os pontos do levantamento (SHP .zip · KML · GeoJSON · CSV · XLSX), escolha as colunas das duas profundidades (rasa/profunda) e gere o mapa interpolado por profundidade (krigagem automática)',
    'A condutividade é uma VARIÁVEL FIXA do talhão (estrutural, não por safra): fica salva com VERSÕES ao longo do tempo — uma é a oficial (★) — e dentro dela você marca qual PROFUNDIDADE é a camada oficial (base para as Zonas de Manejo)',
    'ÍNDICE DE QUALIDADE após interpolar: classifica o levantamento em Excelente/Boa/Regular/Baixa (pelo erro da validação cruzada) e informa se está apto para gerar Zonas de Manejo',
    'Legenda oficial de Condutividade (mS/m) adicionada à Biblioteca (Sistema, editável). Mapas salvos na nuvem (carregam sem reprocessar)',
    'Próximas fases (anotadas): C2 limpeza inteligente dos dados + assistente + krigagem manual + GeoTIFF; C3 vetorização no MEAP (zona só EC × multivariável) + comparação de zonas; C4 histórico avançado + Laboratório de Zonas',
  ],
  '0.83.0': [
    'Zonas de Manejo (MEAP) — fluxo reorganizado (rev. 13.00A) em 5 etapas claras: 1) Configurar (camadas + PESO de cada camada + método), 2) Analisar, 3) Decidir e gerar, 4/5) Avaliar. Agora a pergunta "quantas zonas?" vem ANTES de gerar, e os indicadores de qualidade (CV/homogeneidade) só aparecem DEPOIS, avaliando as zonas prontas',
    'NOVO botão "Analisar (FPI × NCE)": calcula a curva de organização das zonas para 2 a 12 zonas (antes só ia até 6) e mostra um gráfico estilo "cotovelo" + uma SUGESTÃO automática (nº de zonas + justificativa + nível de confiança). A sugestão não é obrigatória — você escolhe o número num seletor de 2 a 12 (a sugestão fica marcada com ★)',
    'NOVO peso por camada (0 = ignora · 1 = padrão · ↑ = manda mais na separação das zonas) — dá para fazer, por ex., o NDVI pesar o dobro da CTC',
    'Antes de gerar, um RESUMO do processamento (camadas + pesos, método, nº de zonas, área mínima) para você confirmar',
  ],
  '0.82.0': [
    'NOVA análise "O que explica a produtividade?" (tela cheia): correlaciona o mapa de produtividade com TODAS as outras camadas do talhão (NDVI, argila, CTC, MO, V%, fertilidade…) e RANQUEIA os fatores pela força da correlação (r), com barras +/−, um insight automático em texto e o gráfico de dispersão do fator escolhido',
    'Responde direto "por que essa área produziu o que produziu" — é a base das análises cruzadas que diferenciam a plataforma. Abre pelos botões do comparador na aba Produtividade',
  ],
  '0.81.0': [
    'NOVO Comparador universal de camadas (tela cheia): escolha Camada A × Camada B entre Produtividade, NDVI e Fertilidade do talhão e veja os dois mapas sobre o satélite, lado a lado, com legendas, estatísticas (média/mín/máx/CV/área), correlação espacial (scatter + coeficiente r) e distribuição de área por classe',
    'Abre pelo botão "Comparação completa" no comparador da aba Produtividade; exporta o PDF lado a lado',
    'Próximo (fatia 2): sobreposição com cortina (swipe), gráfico de rosca e compartilhar',
  ],
  '0.80.0': [
    'Produtividade: a limpeza agora é a OFICIAL da Invicta (porte do script QGIS para o backend) — filtro bruto, correção por colhedora (unificação) e MapFilter global + local anisotrópico (remove ruído/sobreposição ao longo da passada). A etapa "Processar mapa" roda tudo no backend e mostra um relatório por etapa (quantos pontos saíram em cada filtro)',
    'Filtro bruto é sugerido automaticamente pelos percentis dos dados; parâmetros avançados do MapFilter e da correção por colhedora ficam num painel recolhível',
    'A média real (calibração) agora é aplicada nos pontos, igual ao script oficial. Processar arquivos grandes pode levar ~30–60 s (limpeza espacial pesada)',
  ],
  '0.79.0': [
    'Produtividade: novo COMPARADOR Produtividade × NDVI — com o Mapa de Produtividade salvo e um NDVI mantido, a aba mostra os dois lado a lado, com a CORRELAÇÃO espacial (Pearson) entre eles',
    'Botão "Relatório lado a lado (PDF)": gera um PDF A4 paisagem com o mapa de produtividade e o de NDVI lado a lado (sobre o satélite), legendas, dados e a correlação',
  ],
  '0.78.0': [
    'Produtividade: o processamento agora é em ETAPAS claras — 1) Importar máquinas (Máquina 1, 2, …), 2) Unificação (normaliza as máquinas para uma média comum, corrigindo diferença de calibração entre monitores), 3) Limpeza, 4) Interpolação',
    'Na interpolação dá para informar a MÉDIA REAL (da balança/notas) e o mapa é CALIBRADO para a média bater com ela, mantendo o padrão espacial',
    'A unificação atual é uma normalização básica (substituível pelo script oficial da Invicta quando disponível)',
  ],
  '0.77.0': [
    'NOVO módulo Produtividade / Mapas de Colheita (Módulo 12, P1): a aba Produtividade do talhão agora IMPORTA dados de colheita (CSV ou Shapefile .zip), faz a limpeza (remove zeros de cabeceira + corta outliers por percentil) e gera o mapa de produtividade por interpolação IDW, com a legenda oficial da cultura',
    'Mostra estatísticas (produtividade média/mín/máx, área, produção total em t, CV, histograma) e converte a exibição entre kg/ha, sc/ha e t/ha (interno sempre kg/ha)',
    'Você salva o mapa como VERSÃO; uma é marcada como OFICIAL (Camada Oficial de Produtividade) por contexto (talhão+safra+época+cultura). Dá pra ver no mapa, tornar oficial e excluir cada versão',
    'P2 (próximo): unificação de máquinas, limpeza avançada (velocidade/cabeceiras via SHP), biblioteca de parâmetros, comparador (Produtividade × NDVI/Fertilidade) e a Camada alimentando MEAP/Rentabilidade',
  ],
  '0.76.0': [
    'Zona de Manejo: ao CLICAR numa camada (NDVI, fertilidade, textura…), aparece uma PRÉVIA do mapa daquela camada sobre o talhão — assim você vê o que está escolhendo antes de gerar as zonas. A camada em prévia fica destacada (borda amarela); "ocultar prévia" remove',
    'A prévia usa a legenda do atributo (NDVI pela legenda de NDVI; fertilidade pela do nutriente; demais por uma escala min–máx)',
  ],
  '0.75.1': [
    'Zona de Manejo: as camadas de NDVI agora mostram a ORIGEM da imagem — "NDVI S2 ‹data›" (Sentinel-2) ou "NDVI CBERS ‹data›" (CBERS-4A 2 m) — para não confundir as fontes',
  ],
  '0.75.0': [
    'NDVI / Satélite: as cenas buscadas agora ficam só na sessão — você escolhe quais MANTER (botão "Manter esta cena"). Só as mantidas são salvas na nuvem e recarregam ao reabrir; as demais sao descartadas. Dá pra Remover uma cena mantida',
    'As cenas de NDVI MANTIDAS viram FONTE na Zona de Manejo (MEAP): na aba Zonas, elas aparecem como camadas selecionáveis ("NDVI <data>") junto da fertilidade, e entram na clusterização (reamostradas para a malha de referência)',
    'Com isso dá pra gerar zonas a partir do NDVI (sozinho ou combinado com fertilidade) — inclusive em talhões sem laboratório, usando só NDVI',
  ],
  '0.74.0': [
    'NDVI / Satélite: nova FONTE CBERS-4A (satélite brasileiro do INPE) com resolução de 2 m — 5× mais nítida que o Sentinel-2 (10 m). Um seletor no topo troca entre Sentinel-2 (10 m, global) e CBERS-4A (2 m, Brasil)',
    'O NDVI do CBERS sai a 2 m: calculado das bandas (8 m) e realçado com a banda pancromática de 2 m (a base do infravermelho é 8 m; o detalhe espacial vem da PAN)',
    'A imagem em cor verdadeira do CBERS também sai a 2 m (pan-sharpening), ótima para enxergar o detalhe fino do talhão',
    'Obs.: o CBERS não informa % de nuvem (escolha a cena pela data/imagem) e cada cena leva ~20–30 s para processar (lê direto do INPE)',
  ],
  '0.73.0': [
    'NDVI / Satélite: agora a busca LISTA todas as cenas do Sentinel-2 no período (antes pegava só a mais recente). Você vê todas as datas com a % de nuvem e CLICA nas que quiser para calcular o NDVI de cada uma',
    'Legenda do NDVI virou CONTÍNUA (escala suave), em vez de faixas segmentadas',
    'Botão "Contraste realçado": estica as cores para o intervalo real da cena (p2–p98) — faz a variação dentro do talhão saltar aos olhos quando o NDVI está concentrado numa faixa estreita',
    'Botão "Imagem": mostra a imagem de satélite em cor verdadeira (Sentinel-2) recortada no talhão, para comparar com o NDVI',
    'Correção: o offset BOA do Sentinel-2 (baseline 04.00) podia estourar o NDVI acima de 1 em pixels escuros/nuvem — removido (NDVI agora fica sempre em -1..1)',
    'Atalho do backend criado na Área de Trabalho (INVICTA Backend)',
  ],
  '0.72.0': [
    'NOVO módulo NDVI / Satélite (motor MSR — Sensoriamento Remoto), Fase S1: na página do talhão, a aba "NDVI / Satélite" agora BUSCA a imagem de satélite mais recente (Sentinel-2) com pouca nuvem e calcula o NDVI (vigor da lavoura) recortado no talhão',
    'Você escolhe o período e o limite de nuvem; a plataforma pega a melhor cena, mostra o mapa de NDVI com a legenda oficial (0–1) e as estatísticas (NDVI médio/mín/máx, data da imagem, satélite, % de nuvem)',
    'As cenas ficam SALVAS por data (série inicial) — recarregam sem rebuscar; clique numa data para trocar o mapa',
    'Requer o backend local atualizado (novas dependências rasterio + pystac-client); imagem vem do catálogo público Sentinel-2, sem credenciais',
  ],
  '0.71.0': [
    'Zonas de Manejo (MEAP): a geração agora mostra a HOMOGENEIDADE (CV) de cada zona já no preview — calculada do laboratório que cai dentro de cada zona. Assim dá pra comparar zoneamentos pela qualidade (zona boa = CV baixo) antes de escolher o padrão',
    'O CV vai salvo junto do zoneamento (CV médio aparece na lista "Zoneamentos salvos")',
    'Em "Zoneamentos salvos", basta CLICAR na linha do zoneamento para vê-lo no mapa (a última clicada fica na tela) — não precisa mais do botão do olho',
  ],
  '0.70.0': [
    'Zonas de Manejo (MEAP): agora dá pra SALVAR o zoneamento gerado. Você pode salvar VÁRIOS por talhão e marcar UM como "Padrão" — o padrão é o oficial e vai automaticamente para a aba Amostragem gerar o grid por zona',
    'Lista "Zoneamentos salvos": tornar padrão, ver no mapa ou excluir cada um. O padrão também é adotado pelo card do MEAP (calcula o CV das zonas)',
  ],
  '0.69.1': [
    'Correção (mapa do talhão): o mapa travava na página completa do talhão — não dava zoom nem arrastava. Era um loop infinito de renderização (o setNav do contexto se recriava a cada render e disparava o efeito da página sem parar). Estabilizado; o mapa volta a responder normalmente',
  ],
  '0.69.0': [
    'Zonas de Manejo (MEAP): cada zona agora tem IDENTIDADE ÚNICA. Antes, a clusterização dava "classes" de similaridade que se repetiam pelo talhão (a mesma classe em manchas separadas). Agora cada mancha contígua é uma ZONA própria, numerada (Zona 01, 02, 03…), e o potencial (Alta/Médio/Baixo) é um atributo dela',
    'No preview, agora há duas listas: os POTENCIAIS (reordenáveis Alta→Baixa, recolorem as zonas) e as ZONAS únicas. Zonas de mesmo potencial têm a mesma cor (semáforo), distinguidas pelo número',
  ],
  '0.68.0': [
    'Zonas de Manejo (MEAP) — Fase M2 (Fatia 2): ÁREA MÍNIMA de zona — defina em ha e o sistema funde as manchas pequenas na zona vizinha (mapa operável). 0 = sem fusão',
    'Ordenação das zonas Alta→Baixa: a plataforma SUGERE pela ordem de potencial (produtividade/NDVI/MO/CTC quando presentes; senão pelo conjunto das camadas) e você pode REORDENAR manualmente com as setas ↑/↓ — a zona recolore e renomeia (Alta no topo) na hora',
  ],
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
