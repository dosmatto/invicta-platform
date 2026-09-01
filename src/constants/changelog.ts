// Histórico de versões do app. Toda nova versão: adicione a entrada AQUI e atualize APP_VERSION em version.ts.
export const CHANGELOG: Record<string, string[]> = {
  '2.110.0': [
    'COLUNA DOSE MÉDIA no resumo de recomendações da fazenda (Fazenda → Relatórios → Recomendação): cada linha passa a dizer a dose aplicada naquele talhão — "1,08 t/ha", "263 kg/ha", "3,49 sementes/m". A tabela mostrava só a quantidade total, que depende do tamanho do talhão; a dose é o número que se confere primeiro, porque não depende dele.',
    'AS CASAS DECIMAIS SEGUEM A MAGNITUDE: acima de 100 a casa decimal não informa nada ("263 kg/ha" é a dose); abaixo dela é o dado — sementes por metro é 3,49, e arredondar para 3 erraria a população em quase 15 por cento. A mesma regra passou a valer na página-resumo do talhão, que antes cortava as casas e mostrava "3" nesse caso.',
    'A coluna também entrou no EXCEL da fazenda, separada em DOSE MÉDIA (número) e UNIDADE (texto), para dar para somar e filtrar na planilha.',
    'CORRIGIDO ao conferir a folha: a área do talhão encostava no nome da recomendação — saía "44,405 - Calcário" no lugar de "44,4" e "05 - Calcário". A coluna de área é alinhada à direita e a seguinte à esquerda, então as duas terminavam e começavam na mesma borda; entrou um respiro entre elas.',
  ],
  '2.109.0': [
    'A CAIXA DE ESTATÍSTICAS DO RELATÓRIO NÃO BATIA COM OS PONTOS DO MAPA. No BOOK do WNOCG 03, o mapa de K 0-20 cm traz as amostras escritas, de 0,8 a 8,1 mmolc/dm³ — e a caixa dizia MÍNIMO 1,1 e MÁXIMO 7,8. O mesmo em todos os atributos: no Mg% há uma amostra de 6,3% desenhada no mapa e a caixa começava em 7,7%.',
    'A PROVA ESTAVA NA MESMA PÁGINA: no pH, a caixa do 20-40 cm (8 amostras) bate exatamente com os pontos — 5,0 e 6,3 —, enquanto a do 0-20 cm (45 amostras) não bate. Mesmo talhão, mesmo dia, mesmo arquivo. Não era erro de conta.',
    'A CAUSA: a caixa descrevia o RASTER, não as análises — e os dois nunca batem, porque a krigagem ALISA. O nó da grade não cai em cima do ponto amostrado e, com efeito pepita, a estimativa a 2,5 m do ponto já é puxada para a média da vizinhança. Onde há poucas amostras o ajuste não encontra pepita e o mapa passa exato pelos pontos (o 20-40); onde há muitas, encontra.',
    'AGORA A CAIXA FALA DAS ANÁLISES — exatamente os números impressos nos pontos, contados dos MESMOS rótulos que vão para o papel. Bate 100%, sempre, e não muda mais ao reprocessar com outro pixel, outro método ou outra versão do interpolador. Como o mapa é limitado à faixa das amostras, nenhum pixel pintado cai fora do mínimo/máximo informado.',
    'As casas decimais viraram UMA REGRA SÓ, usada pelo rótulo do ponto e pela caixa: antes a caixa imprimia "144,0" onde o mapa escreve "144" — mesmo número, grafia diferente, e a conferência travava na leitura. O MÉDIO mantém pelo menos uma casa (não é rótulo de nada, e arredondá-lo junto transformava 24,3 em "24").',
    'O MAPA TAMBÉM PASSOU A HONRAR MELHOR OS PONTOS. Duas correções no motor: o teto do efeito pepita do ajuste automático caiu de 10% para 2% do patamar, e a rotina de recuperação (a que entra quando o ajuste automático degenera) tinha uma pepita de 10% FIXA NO CÓDIGO, fora do alcance desse teto — era ela que respondia pela metade dos piores casos.',
    'MEDIDO EM 18 CAMPOS, comparando a política anterior com a nova: a amplitude que o mapa guarda das amostras subiu de 59–97% para 76–100%, e o erro no PRÓPRIO PONTO amostrado caiu de 3,7–19,4% para 1,0–17,7%. Nenhum dos 18 casos piorou. O modelo gaussiano continua sendo o pior caso — é propriedade da forma dele, não pepita. VALE PARA MAPA NOVO: os já salvos ficam como estão até serem reprocessados.',
    'A GUARDA VOLTOU A VALER COM O MODELO ESCOLHIDO NO SELETOR. Escolher esférico, exponencial ou gaussiano desligava o teto de pepita em silêncio, e o mapa voltava a alisar. Só a Krigagem fixa continua intocada — ali os números são seus.',
    'O PDF DA ABA E O BOOK NÃO PODEM MAIS DISCORDAR. O PDF da aba usava os rótulos CONGELADOS na hora da interpolação; o BOOK recalcula do laudo atual. Corrigir um valor no laudo sem reprocessar fazia os dois documentos saírem com números diferentes para o mesmo mapa. Agora os dois leem a mesma fonte, igual à tela.',
    'MAPA GERADO POR UM LAUDO QUE JÁ MUDOU (acontece ao desmembrar ou fundir talhão): a caixa volta a descrever o raster, porque as amostras de hoje não são as que geraram aquele mapa — prometer a faixa delas seria informar um mínimo/máximo que os pixels desenhados não cumprem. E, para mapas processados a partir desta versão, a faixa das amostras passa a viajar GRAVADA JUNTO com o mapa: mesmo depois de desmembrar, ele continua sendo limitado pela faixa certa, a que o gerou.',
    'MÉDIA INVENTADA, REMOVIDA. Quando o mapa salvo não tem grid (só a imagem), o relatório imprimia como MÉDIO o valor (mínimo + máximo) / 2 — que não é média de nada e, num mapa assimétrico como P ou K, superestima feio. Agora sai "—".',
    'GRID CORROMPIDO NÃO PASSA MAIS EM SILÊNCIO. Se a descompressão do mapa falhava (navegador antigo), os bytes comprimidos eram lidos como números: raster e estatística de lixo, sem nenhum erro na tela. Agora o app recusa o grid, e a mensagem diz o que houve de verdade — antes mandava "processar o mapa" que já estava processado.',
    'Se você usa o INTERPOLADOR DESTA MÁQUINA, atualize-o em Configurações: a melhora no mapa está nele (interp-29), e o programa da sua máquina não se atualiza sozinho.',
    '18 testes no app (npm run teste:estatistica), 21 na garantia de faixa (npm run teste:faixa-front) e 9 no servidor (npm run teste:honra) — este último comparando as duas políticas caso a caso, para provar que nenhuma piorou.',
  ],
  '2.108.0': [
    '26 — CORRIGIDO: A INCORPORAÇÃO DE DIVISAS FUNDIA AS ZONAS. No MCACA 22, um zoneamento de 13 zonas voltou como 2, com uma parede de avisos de divisas descartadas. A ferramenta estava inutilizável.',
    'A CAUSA: ela dissolvia as zonas pelo RÓTULO DA CLASSE, com o raciocínio "divisa entre duas zonas de mesma classe não é divisa agronômica". Está errado. Suas 13 zonas usam ~5 rótulos (Alta, Média, Baixa, Média-alta, Média-baixa), e várias vizinhas compartilham o mesmo — as divisas entre elas foram APAGADAS, sobraram cacos de 5 a 17 m que não alcançavam nada, e o talhão virou uma mancha só.',
    'AGORA A UNIDADE É A ZONA, nunca o rótulo. Duas zonas "Alta" lado a lado continuam sendo duas zonas — a linha entre elas é justamente o trabalho que a ferramenta existe para preservar. Zona partida em várias manchas (01 e 01_2) continua contando como uma só.',
    'CORRIGIDO TAMBÉM: O PAINEL MENTIA NOS NÚMEROS. Ele mostrava "esticadas: 0 · cortadas: 0" sempre, porque essas contas nunca eram feitas — o campo simplesmente não existia e a tela lia zero. Num teste com 13 zonas, o que aparecia como 0 eram na verdade 36 divisas esticadas, somando 1.353 m.',
    'OS AVISOS PARARAM DE AFOGAR O QUE IMPORTA. Em vez de dezenas de linhas quase idênticas ("divisa #7 descartada", "divisa #8 descartada"…), sai uma linha só com o total e a faixa de comprimentos — e, quando todas têm menos de 30 m, ela diz o que são: cacos de vetorização do arquivo antigo, não divisas de manejo.',
    'E o banco de provas passou a exercitar o código de produção. Ele tinha uma CÓPIA do algoritmo, e as duas divergiram na primeira correção: o backend foi corrigido e o banco continuou aprovando o código antigo. Um teste que testa outra coisa é pior que teste nenhum.',
  ],
  '2.107.0': [
    '26 — INCORPORAR DIVISAS INTERNAS AO POLÍGONO ATUAL. Quando o zoneamento é antigo e o contorno do talhão foi atualizado depois, partes das zonas ultrapassam o limite novo e outras não alcançam. A ferramenta descarta o limite externo antigo, aproveita as DIVISAS INTERNAS (o trabalho agronômico de verdade) e reparticiona o talhão atual. Onde ver: Zonas → Zoneamentos e versões → ícone da tesoura, em qualquer versão.',
    'AS DIVISAS QUE NÃO ALCANÇAM SÃO ESTICADAS SEGUINDO A TRAJETÓRIA DA LINHA — não pela distância mais curta. A diferença não é detalhe: num arco real de 600 m de raio, pela trajetória a divisa encosta na borda 190 metros adiante de onde a perpendicular encostaria. É a diferença entre uma zona que faz sentido e uma que corta o talhão no lugar errado.',
    'E uma divisa que vinha curvando CONTINUA CURVANDO até o limite. O prolongamento não olha só o último segmento (isso ficaria refém de um único vértice — divisa vinda de raster tem passo de um pixel, e um segmento de 30 cm pode apontar 90° fora): usa uma janela dos últimos metros e mantém a curvatura quando ela se justifica. Divisa serrilhada é prolongada em reta, e a tela avisa.',
    'AS QUE ULTRAPASSAM SÃO CORTADAS no contorno atual. O prolongamento para no primeiro obstáculo que encontra — o limite, outra divisa, ou o prolongamento de outra ponta. Em talhão com reserva ou em formato de L isso já resolve sozinho, sem regra especial.',
    'SEMPRE COM PRÉVIA. Antes de qualquer coisa a tela mostra o resultado no mapa, com o que o talhão ganhou e perdeu em amarelo, quantas divisas foram esticadas e cortadas, e a cobertura final. Só depois aparece o "Salvar como nova versão" — e o zoneamento original continua na lista, intacto.',
    'AVISOS QUE PEDEM SUA DECISÃO ficam separados do relato operacional: classe que desapareceu no talhão novo, face que caiu em área ganha sem zona antiga, empate na herança, divisa que não alcançou nada e foi descartada. Com qualquer um deles é preciso marcar que você leu antes de salvar.',
    'O resultado só sai se a soma das zonas FECHAR com o talhão (tolerância de 5 m²). Numa ferramenta cujo problema é justamente "as divisas antigas não fecham com o polígono novo", essa checagem é o produto — não uma formalidade.',
  ],
  '2.106.0': [
    'UMA ÁREA SÓ PARA O TALHÃO: a do POLÍGONO. O mesmo talhão aparecia com três números diferentes — 143,5 ha na trilha do topo, 142,38 ha no limite e 139,28 ha na prescrição — e não havia como saber qual valia. Agora a área do polígono é a régua de tudo, e o que é fatiado por zonas de manejo SOMA essa área de volta.',
    'DE ONDE VINHA CADA UM: 143,5 era uma CÓPIA feita quando você entrava no talhão, que não acompanhava a troca de limite (o seu está em v2) — a trilha e o título do painel passam a ler a área atual do cadastro. 142,38 é a área geodésica do limite, e continua sendo a verdade. 139,28 era a soma das áreas das 13 zonas, que nascem sobre uma malha (raster, suavização, área mínima) e fechavam 3,1 ha abaixo do limite.',
    'AS ZONAS VIRARAM FATIAS DO POLÍGONO: a proporção entre elas continua sendo a que o zoneamento decidiu, mas a régua passou a ser a área do talhão, com arredondamento compensado — a soma bate no centavo de hectare. Vale para o painel de Zonas de Manejo (áreas e percentuais), para a prescrição, para as zonas do relatório de produtividade (e, por tabela, para a rentabilidade por zona) e para a distribuição por área separada.',
    'CLICAR NO TALHÃO PELO MAPA também zerava a área da trilha: a feature do mapa não levava esse dado. Agora leva.',
    'PRESCRIÇÕES JÁ SALVAS NÃO MUDAM. Elas guardam as áreas com que foram calculadas, e foi com esses números que a quantidade foi comprada e mandada para o campo — reimprimir com outra área faria o PDF discordar do que está na lavoura. A regra nova vale para as próximas; para atualizar uma antiga, refaça a prescrição.',
    '8 testes novos (npm run teste:fatiar) travam o fechamento — inclusive a zona de área zero, que não pode ganhar hectare do nada.',
  ],
  '2.105.0': [
    'CORRIGIDO — O MAPA DE FUNDO SAÍA COM CORES QUE NÃO ERAM AS DA CAMADA. No comparativo das Zonas de Manejo, a condutividade aparecia em tons de laranja (e, na prévia do MEAP, em roxo/verde/amarelo), enquanto a aba Condutividade mostrava a legenda por quartil que você escolheu. Duas telas, duas paletas, a mesma camada — o comparativo perdia o sentido.',
    'AGORA O FUNDO USA A LEGENDA QUE VOCÊ DESIGNOU. O seletor "Legenda do mapa" de cada aba (Condutividade, Produtividade, NDVI) passou a valer também no comparativo e no fundo do editor de zonas. Escolheu a de quartil na Condutividade? É ela que pinta o fundo.',
    'O QUE ESTAVA ERRADO: o comparativo pegava a primeira legenda da lista, ignorando a sua escolha. E, na prévia do MEAP, a condutividade nem chegava a procurar legenda — ela entra no catálogo com um identificador próprio que não casava com nenhuma, então caía direto na rampa genérica.',
    'A BARRA DA LEGENDA APARECE NO EDITOR, com os valores das classes. Sem ela dava para ver a mancha, mas não para saber se aquele tom era 8 ou 13 mS/m — e o comparativo não fechava o raciocínio.',
    'Camada sem legenda cadastrada continua avisando, agora em amarelo: as cores são só do menor ao maior valor do talhão e não correspondem a escala nenhuma.',
  ],
  '2.104.0': [
    'VALOR FORA DA FAIXA: AGORA SÃO QUATRO PORTAS FECHADAS, NÃO UMA. A correção anterior cobria só os mapas gerados pela aba Fertilidade. Uma varredura completa mostrou que faltavam três caminhos, e que era por eles que o problema continuava aparecendo.',
    'PORTA 1 — TODO MAPA NOVO, DE QUALQUER SERVIDOR. O limite passou para dentro da própria chamada de interpolação, que é por onde passa tudo: Fertilidade, Condutividade, Compactação e Produtividade. Não importa mais quem calculou — nuvem atualizada ou interpolador da sua máquina desatualizado —, o mapa chega dentro da faixa das amostras.',
    'PORTAS 2, 3 e 4 — MAPAS JÁ SALVOS. A aba Fertilidade, o Gerador de Relatórios e o caminho da RECOMENDAÇÃO agora limitam também na LEITURA. Ou seja: mapas gravados antes desta correção passam a aparecer certos sem você precisar reprocessar. A da Recomendação é a mais importante — é ali que um teor negativo virava recomendação de adubo errada.',
    'AS ESTATÍSTICAS TAMBÉM FORAM CORRIGIDAS, não só o mapa. O mínimo e o máximo que o servidor antigo devolveu são usados como reserva no PDF; sem tratá-los, o relatório continuaria imprimindo "mínimo -16,1" mesmo com o mapa já certo.',
    'UMA SALVAGUARDA IMPORTANTE: quando o laudo foi ALTERADO depois do mapa ter sido gerado (acontece ao desmembrar ou fundir talhão), o app NÃO limita aquele mapa — a faixa de hoje não é a que o gerou, e cortar por ela seria inventar número. Nesse caso vale reprocessar.',
    'CONFIRMAÇÃO DO DIAGNÓSTICO: a cópia do interpolador instalada na máquina do usuário era a interp-24, que falha o teste de faixa; a versão da nuvem (interp-27) passa. Se você usa o interpolador desta máquina, ATUALIZE-O em Configurações — o app agora protege o resultado de qualquer forma, mas o programa antigo segue calculando errado por baixo.',
    '18 testes automáticos no app (npm run teste:faixa-front) e 7 no servidor (npm run teste:faixa).',
  ],
  '2.103.0': [
    'VALOR NEGATIVO NO MAPA: AGORA O APP GARANTE A FAIXA, NÃO SÓ O SERVIDOR. A correção anterior limitou o cálculo no servidor da nuvem — e ele está correto, conferimos rodando quatro configurações contra o servidor de produção. Mas o problema continuou aparecendo, e a causa é esta: quem usa o INTERPOLADOR DESTA MÁQUINA não está usando esse servidor. O programa da sua máquina NÃO se atualiza sozinho, então ele seguia calculando com o código antigo, sem limite.',
    'AGORA O PRÓPRIO APP LIMITA, ao receber o mapa e ANTES de guardar. Não importa quem calculou — nuvem nova, interpolador local desatualizado, qualquer um: o mapa que vai para a tela, para o PDF, para a nuvem e para a recomendação já sai dentro da faixa das amostras. Se algum pixel precisar ser corrigido, fica registrado no console do navegador, com um aviso de que o interpolador local pode estar velho.',
    'VALE TAMBÉM PARA O MAPA QUE ALIMENTA A DOSE (o de 20 m da Recomendação), que é o pior lugar para deixar passar: um teor negativo ali vira recomendação de adubo errada.',
    'SE VOCÊ USA O INTERPOLADOR DESTA MÁQUINA, ATUALIZE-O: baixe o pacote de novo em Configurações e substitua o que está instalado. O app agora protege o resultado de qualquer jeito, mas o programa antigo continua calculando errado por baixo — e ele é usado por outras contas também.',
    'MAPAS JÁ SALVOS antes desta versão continuam com o valor antigo gravado; reprocesse a variável para o limite valer neles.',
    '10 testes automáticos novos no lado do app (npm run teste:faixa-front), somados aos 7 do servidor, incluindo: valor de dentro da faixa fica idêntico, área sem dado continua sem dado, e faixa legitimamente negativa (quando a própria amostra é negativa) não é cortada.',
  ],
  '2.102.0': [
    '25 — COMPARATIVO VISUAL NO EDITOR MANUAL DE ZONAS: agora dá para ver NDVI, produtividade, condutividade ou fertilidade POR BAIXO das zonas, enquanto você reclassifica. Marque "Ver a camada no mapa" dentro de "Sugerir classificação".',
    'É A MESMA CAMADA DA SUGESTÃO, de propósito. O número que o editor já mostrava ("#04 · 3.140 · Média → Baixa") e a figura no mapa passam a falar da mesma camada — comparar a média de uma com o desenho de outra seria pior do que não comparar.',
    'O CONTORNO E O NÚMERO DA ZONA FICAM POR CIMA. Só o preenchimento obedece ao slider de opacidade, então no zero você vê a camada pura COM a divisa da zona desenhada em cima — dá para ler direto se a mancha respeita o limite da zona ou vaza para a vizinha. É essa leitura que classifica.',
    'BOTÃO "SEGURE PARA ESPIAR": enquanto segura, as zonas somem e volta só a camada. O olho compara muito melhor por diferença (piscando entre as duas imagens) do que julgando uma mistura translúcida.',
    'AS CORES SÃO AS DA LEGENDA OFICIAL da camada — a mesma que você já conhece da aba dela. Quando a camada não tem legenda cadastrada, a tela AVISA que as cores seguem só do menor ao maior valor do talhão e não correspondem a escala nenhuma; antes isso acontecia calado e o fundo mostrava cores que não queriam dizer nada.',
    'POR QUE NÃO TELA DIVIDIDA: avaliamos as quatro formas (tela dividida, cortina, fundo com opacidade e alternar). Tela dividida e cortina, por construção, NUNCA põem a divisa da zona em cima da camada de dentro daquela zona — e é exatamente essa sobreposição que decide a classificação. Ficaram de fora por isso, não por custo.',
  ],
  // [24] Contraste e download em GeoTIFF na composição temporal
  '2.101.0': [
    'PENDÊNCIA 24 — A COMPOSIÇÃO TEMPORAL GANHOU CONTRASTE E DOWNLOAD EM GEOTIFF. Duas coisas que a aba Imagens & índices já tinha e a composição, não: o botão que estica a escala de cor e o arquivo para levar o mapa embora.',
    'POR QUE O CONTRASTE FALTAVA JUSTAMENTE ALI. A mediana de 4 datas APERTA a distribuição — é essa a graça dela, tirar o pico de uma data isolada. Só que na escala fixa 0–1 do NDVI o resultado apertado sai todo dentro de uma única faixa de cor, e o talhão inteiro fica de um verde só: some exatamente a variação interna que a composição existe para revelar. Ligado o contraste, a rampa se estica entre o p2 e o p98 do próprio composto e o desenho do talhão reaparece.',
    'A ESCALA APARECE AGORA NA TELA — barra de cores com o valor mínimo, o do meio e o máximo do que está no mapa. Antes o composto era pintado sem dizer em que faixa, e não dava para saber se o verde era 0,45 ou 0,82. Vale tanto para a PRÉVIA quanto para a composição salva que estiver em visualização.',
    'A LINHA ABAIXO DA BARRA DIZ O QUE CADA MODO CUSTA: escala fixa é comparável entre datas e talhões; esticada mostra a variação DENTRO do talhão mas as cores não se comparam com outro mapa. É a diferença que faz alguém concluir errado ao colocar dois PDFs lado a lado.',
    'O CONTRASTE É O MESMO CÓDIGO do botão da aba Imagens & índices — a conta do p2–p98 saiu de dentro da tela de NDVI e virou função única (lib/quantis). Duas telas com dois cálculos de percentil acabariam divergindo, e aí o mesmo talhão sairia com faixas diferentes em cada aba.',
    'GEOTIFF DA COMPOSIÇÃO: botão TIF na prévia (antes mesmo de aprovar, para conferir no QGIS antes de salvar) e um ícone de download em CADA composição salva, nas duas abas em que a lista aparece. Arquivo em EPSG:4326, float32, nodata onde nenhuma cena tinha dado — o mesmo formato do TIFF dos índices individuais, e o nome sai do nome técnico da camada (comp_ndvi_mediana_2023-08-05_2026-08-01_4d.tif).',
    'DETALHE QUE EVITA ARQUIVO ERRADO: o TIFF sai com os VALORES do composto, não com as cores da tela — mudar o contraste muda o mapa exibido e não muda um pixel do arquivo baixado. Contraste é escala de exibição; o dado é o dado.',
    '6 testes novos travam a escala do contraste (npm run teste:quantis, 28 no total): outlier não manda mais na rampa, NaN de nuvem fica fora da conta, mapa constante não vira rampa de largura zero e as pontas são sempre valores que EXISTEM no mapa.',
    'Onde conferir: talhão → NDVI → Composição temporal (e aba Camadas salvas, para o download).',
  ],
  // [S/N] Gaveta dos cenários salvos (pedido avulso)
  '2.100.0': [
    'CENÁRIO SALVO ABRE UMA GAVETA COM OS PRODUTOS DENTRO. Clicar na linha em Recomendações → Cenários salvos abre e fecha um painel que lista produto por produto: dose média COM A FAIXA (mín–máx), toneladas, R$ total e R$/ha, com a ★ de "p/ uso" em cada um. Um cenário aberto por vez.',
    'O QUE ISSO POUPA: até agora, para saber o que havia dentro de "KCL · 29 produtos · R$ 838.796,89" só clicando em REABRIR — que baixa e descomprime todos os mapas da nuvem E SUBSTITUI o que está na tela, fazendo perder o trabalho em andamento. A gaveta custa zero: os nomes são re-hidratados da equação atual sem tocar em um único grid.',
    'A FAIXA, E NÃO SÓ A MÉDIA. Em taxa variável, "méd 300 kg/ha" tanto pode ser 300 chapado quanto 120–480 — e é justamente essa diferença que se quer saber ao escolher um cenário. A faixa só aparece quando existe variação.',
    'PRODUTO SEM PREÇO DEIXOU DE PASSAR POR R$ 0,00. Quem não tem custo/tonelada entra no total como zero, e o cenário incompleto parecia o mais barato — na tela em que se escolhe cenário por dinheiro. Agora sai em âmbar com asterisco, na gaveta e no total da linha, com a mesma nota que a lista de cima já usava.',
    'A GAVETA FALA A MESMA LÍNGUA DA LISTA DE CIMA: ★ âmbar para "p/ uso", "NN · equação" no título e o produto no subtítulo. Duas listas dos mesmos produtos com vocabulários diferentes obrigavam a traduzir de cabeça.',
    'REABRIR AGORA AVISA ANTES DE SUBSTITUIR os mapas da tela — e só quando há trabalho a perder. Enquanto ele era o único jeito de espiar um cenário, avisar seria atrapalhar; com a gaveta, quem clica ali quer mesmo trocar.',
    'DETALHES QUE EVITAM TELA QUEBRADA: cenário salvo na v0.49 não tinha custo por hectare na dose, e a formatação estourava em campo ausente — agora sai travessão. Unidade em branco não deixa mais a dose sem unidade (mil vezes de diferença entre kg/ha e t/ha), e dose em t/ha não é mais arredondada a zero.',
    'ACESSIBILIDADE: quem abre é um botão de verdade, com aria-expanded — a linha inteira continua abrindo no mouse, mas sem virar um único botão gigante que escondia Comparar, Reabrir e Excluir do leitor de tela.',
    'Onde conferir: talhão → Recomendações → Cenários salvos.',
  ],
  '2.99.0': [
    'CORRIGIDO — O MAPA INTERPOLADO NÃO PODE MAIS PASSAR DA FAIXA DAS AMOSTRAS. Um mapa de Fósforo saiu com MÍNIMO de -16,1 mg/dm³ sendo que todas as amostras eram positivas. Agora nenhum pixel fica abaixo do menor valor amostrado nem acima do maior.',
    'POR QUE ACONTECIA: não é defeito de programação, é uma propriedade da krigagem. Diferente de uma média comum, ela pode dar peso NEGATIVO a uma amostra (quando um ponto próximo "esconde" outro atrás dele), e aí o resultado escapa da faixa dos dados. Medimos aqui: em 12 mapas sorteados no modo automático, 4 saíram da faixa — o pior indo de -30,7 a 87,1 com amostras entre 4 e 70. Acontece justamente com o tipo de dado do fósforo: muitos valores baixos e alguns picos.',
    'O ESTRAGO IA MUITO ALÉM DO MAPA. O valor entrava CRU na equação de recomendação, e um teor negativo vira dose inflada: medimos +51% na quantidade total e +R$ 2.447 de custo por causa de UM pixel. E era invisível — a dose inflada recebia uma cor normal da legenda, então só as estatísticas denunciavam. Nada no caminho segurava: a trava de "não negativo" limita a DOSE, não o teor que entra na conta, e a dose máxima da equação é opcional.',
    'A CORREÇÃO É CIRÚRGICA. Comparamos os mapas pixel a pixel, com e sem o limite: os que já estavam dentro da faixa ficaram IDÊNTICOS, sem um pixel alterado. Só os que tinham escapado foram corrigidos. O ajuste do variograma e as verificações internas continuam vendo o cálculo cru — nenhuma decisão do algoritmo mudou, só o resultado final.',
    'Vale para Fertilidade, Condutividade e Compactação (todas usam o mesmo motor) e para os dois métodos. O IDW nunca teve o problema, por ser média ponderada de verdade. Reprocesse o mapa para o limite valer nos que já estão salvos. 7 testes automáticos travam a regra (npm run teste:faixa).',
  ],
  '2.98.0': [
    'OS NÚMEROS DAS ZONAS PARARAM DE SAIR EMPILHADOS NO MAPA. No PDF de prescrição, zonas estreitas e vizinhas escreviam a dose uma por cima da outra ("77.764" sobre "76.239" sobre "73.952") e não dava para saber qual número era de qual mancha — que é exatamente o que o mapa existe para dizer.',
    'A CAUSA ERAM DUAS. O rótulo ia na MÉDIA DOS VÉRTICES do contorno, que não é o centro de nada: em zona comprida ou em C, esse ponto cai fora da própria zona. E cada número era desenhado sem olhar para os outros, então dois vizinhos escreviam no mesmo lugar.',
    'AGORA A POSIÇÃO DE TODOS É DECIDIDA DE UMA VEZ. Cada zona ganha uma âncora no ponto mais FUNDO dela (o mais distante de qualquer borda), que sempre cai dentro — inclusive em zona com furo. Se a caixa do número couber ali e não bater em nenhum rótulo já colocado, ele fica dentro da mancha, como antes.',
    'QUANDO NÃO COUBER, O NÚMERO SAI PARA O LADO COM UM TRAÇO ligando ao ponto dentro da zona, com um pingo na ponta. Nenhum número é descartado: um valor solto no mapa confunde mais do que um valor apertado, e o traço resolve a dúvida de quem lê.',
    'As manchas MAIORES escolhem primeiro o lugar bom — elas quase sempre ficam sem traço, e sobra para as pequenas, que são as que de fato não cabem. O rótulo também nunca sai da borda da imagem.',
    'Vale para todo mapa de zonas do app: prescrição, zonas de manejo, distribuição por área separada e rentabilidade por zona. 11 testes novos (npm run teste:rotulos-mapa) travam a regra, inclusive a de nenhuma caixa cruzar com outra em cinco zonas grudadas.',
  ],
  '2.97.0': [
    'A DISTRIBUIÇÃO DO INSUMO POR ÁREA SEPARADA MUDOU DE LUGAR: saiu das opções do relatório e virou um BOTÃO NA ABA ARQUIVOS, ao lado do PDF oficial, do JPG e do SHP. É onde ela pertence — o número serve para carregar caminhão, não para ler relatório, e quem está despachando entra na aba Arquivos, não na de Relatórios.',
    'O botão só aparece nos talhões com MAIS DE UMA ÁREA SEPARADA; em talhão de mancha única não há o que distribuir e ele nem é desenhado. Gera um PDF próprio, com o mapa das manchas numeradas e a tabela de quanto de cada insumo vai em cada uma.',
    'CORRIGIDO NA MESMA PASSADA: a soma das áreas da tabela podia não fechar com a ÁREA do cabeçalho. A área de cada mancha é geodésica, calculada da geometria; a do cabeçalho é a do cadastro — e quando as duas divergem (limite reeditado, área digitada à mão) a conferência do usuário dava errado logo na primeira linha. Agora as partes são reescaladas para fechar com a área do cadastro, mantendo a proporção entre elas. A quantidade de insumo não muda: ela já fechava com o total da dose.',
    'As opções antigas nas telas de Relatórios (talhão e fazenda) foram removidas — a função é a mesma, só que no lugar certo.',
    '3 testes novos (npm run teste:porpoligono, 15 no total) travam o novo fechamento de área, inclusive a proporção entre as manchas ficando intacta.',
  ],
  '2.96.0': [
    'RENTABILIDADE POR ZONA DE MANEJO — páginas novas no relatório de produtividade, uma por cenário (sem arrendamento e com arrendamento), logo depois dos mapas de rentabilidade do talhão. Elas respondem a pergunta que o mapa pixel a pixel não responde de bate-pronto: QUANTO CADA ZONA RENDEU EM DINHEIRO.',
    'A MARGEM DE CADA ZONA VEM DA PRODUTIVIDADE MÉDIA DELA — "a zona alta rendeu 4.380 kg/ha, a baixa 2.640" —, multiplicada pelo preço e descontado o custo. O custo é o mesmo em todas as zonas (é um R$/ha só), então diferença de margem entre zonas é, por construção, diferença de PRODUTIVIDADE.',
    'A TABELA traz zona, classe, área, produtividade média, receita/ha, margem/ha e margem total, da zona mais rentável para a menos, com a margem negativa em vermelho e a linha de fechamento do talhão. O mapa ao lado pinta cada zona com a MESMA faixa de cor do mapa da página anterior — zona vermelha está, literalmente, na faixa vermelha da rentabilidade.',
    'O QUE A MÉDIA NÃO DIZ, a página diz com todas as letras: uma zona pode fechar positiva com manchas negativas dentro. Quanto cada zona rendeu é aqui; ONDE deu prejuízo continua sendo o mapa pixel a pixel. Zona sem nenhum pixel de colheita fica fora da conta e é nomeada no rodapé, em vez de entrar como zero.',
    'Com arrendamento, todas as margens caem exatamente o valor do arrendamento — dá para ler no par de páginas quanto ele pesa em cada zona.',
    '9 testes novos (npm run teste:rentabilidade, 57 no total): a margem saindo da média, a média do talhão ponderada PELA ÁREA (e não a média das zonas), os totais fechando e a zona sem dado ficando de fora.',
  ],
  '2.95.0': [
    'EXPORTAÇÃO E EXTRAÇÃO DE NUTRIENTES PASSARAM A SER EM ELEMENTO: onde se lia K₂O agora se lê K, e onde se lia P₂O₅ agora se lê P. Vale para o cadastro (Biblioteca → Exportação de Nutrientes, nas duas tabelas), para as caixas de seleção do relatório de produtividade e para o próprio relatório. É como a literatura de absorção e exportação publica os números.',
    'A CONVERSÃO USA AS MASSAS ATÔMICAS, não um decimal copiado de tabela: P₂O₅ = 141,9425 g/mol e K₂O = 94,1956 g/mol, de onde saem P = P₂O₅ × 0,436427 e K = K₂O × 0,830151 (a volta é × 2,291335 e × 1,204600). Os fatores ficam num módulo só, com a conta à vista, e os testes conferem os quatro números e a ida-e-volta.',
    'O QUE JÁ ESTAVA CADASTRADO FOI CONVERTIDO UMA VEZ, sozinho, na primeira abertura: 20 kg K₂O/t viram 16,60 kg K/t e 6 kg P₂O₅/t viram 2,62 kg P/t. A trava contra converter duas vezes é uma marca NO PRÓPRIO REGISTRO, não uma anotação no aparelho — anotação de aparelho é por navegador e o cadastro é de todos, que foi exatamente o defeito corrigido na 2.80.0.',
    'A GARANTIA DO FERTILIZANTE NÃO MUDOU: continua em P₂O₅ e K₂O, porque é o que a lei manda estampar no saco e o que está na nota fiscal — mudar isso obrigaria a redigitar o cadastro inteiro e a conferência contra a nota ficaria impossível. Como as duas bases agora convivem, o cruzamento converte antes de dividir.',
    'A DOSE DE ADUBO E O CUSTO CONTINUAM OS MESMOS — só muda a unidade em que o nutriente é reportado. Soja a 60 sc/ha com 20 kg K₂O/t: antes, 72 kg de K₂O/ha ÷ 60% = 120 kg/ha de KCl; agora, 59,77 kg de K/ha, e o mesmo KCl (60% K₂O = 49,81% K) dá os mesmos 120 kg/ha. Um teste trava essa igualdade, porque esquecer a conversão erraria a dose para menos (83% no K, 43,6% no P) com o número continuando plausível.',
    'Onde conferir: Biblioteca → Exportação de Nutrientes (os campos agora dizem P e K) e Talhão → Produtividade → relatório, nas páginas de exportação/extração. 9 testes novos (npm run teste:exportacao, 33 no total).',
  ],
  '2.94.0': [
    'O RELATÓRIO DE PRODUTIVIDADE FOI REORDENADO para seguir a leitura de quem o usa: primeiro o que a lavoura PRODUZIU, depois o que ela PAGOU. A ordem agora é — Produtividade (mapa absoluto), Produtividade por quantil, NDVI, Resumo analítico, análise por zona de manejo (quando as zonas não cabem no rodapé do resumo), Rentabilidade e, fechando tudo, Exportação e Extração de nutrientes.',
    'ANTES A RENTABILIDADE E A EXPORTAÇÃO VINHAM NO MEIO, logo depois dos dois mapas de produtividade, e empurravam o NDVI e o resumo analítico para o fim — quem lia o documento encontrava o custo antes de ter visto a análise da safra.',
    'DENTRO DA RENTABILIDADE, TERRA PRÓPRIA VEM ANTES DA ARRENDADA: o arrendamento é um custo a mais, e ver primeiro o resultado sem ele é o que permite medir quanto ele pesa. Nas páginas de nutrientes, exportação vem antes de extração.',
    '7 testes novos (npm run teste:rentabilidade, 48 no total) travam a ordem — inclusive a estabilidade, para dois cenários do mesmo grupo manterem a ordem em que foram montados na tela.',
  ],
  '2.93.0': [
    'O RELATÓRIO ABERTO NO NAVEGADOR JÁ CHEGA COM NOME DE ARQUIVO. Ao salvar um PDF, a caixa do navegador vinha preenchida com um código do tipo "736c4637-3320-4ecd-87a9-616fe58ad162" e o nome tinha de ser digitado à mão, toda vez, em todo relatório. A causa: o PDF é gerado no seu navegador e aberto por um endereço temporário (blob), e o navegador nomeia o arquivo pela última parte do endereço — que é justamente esse código.',
    'AGORA A ABA É UMA PÁGINA NOSSA: o nome do arquivo aparece no título da aba e numa barra em cima do relatório, com o botão SALVAR PDF ao lado. Clicando nele, a caixa de salvar abre JÁ PREENCHIDA (ou o arquivo baixa direto com o nome certo, se você não usa "perguntar onde salvar").',
    'VALE PARA TODOS OS RELATÓRIOS de uma vez — fertilidade, recomendação, combinado, condutividade, produtividade, satélite da fazenda e etiquetas.',
    'DE QUEBRA, UM DEFEITO ANTIGO SUMIU: o endereço temporário do PDF era descartado 60 segundos depois de aberto. Quem lesse o relatório com calma e só então clicasse em salvar recebia um arquivo quebrado, sem nenhum aviso. Agora o endereço vive enquanto a aba estiver aberta.',
    'O RESUMO GERAL DAS RECOMENDAÇÕES GANHOU NOME LEGÍVEL: "Resumo Campos Gerais 2026.pdf" (e "Resumo Campos Gerais 2024-2026.pdf" quando você escolhe vários anos), no lugar da sigla de arquivo de máquina. Ele é relatório de escritório — é salvo, anexado em e-mail e procurado pelo nome depois. Os arquivos que vão para o monitor da máquina continuam no padrão de campo (SA03_TX_MILHO), que é o que o operador espera ver.',
    '6 testes novos no npm run teste:resumo-geral cobrem o nome (fazenda, produtor, intervalo de anos, caractere que quebra nome de arquivo e a extensão entrando uma vez só).',
  ],
  '2.92.0': [
    'VOCÊ ESCOLHE QUAIS PRODUTOS ENTRAM NA TABELA "EQUIVALENTES EM FERTILIZANTE" DO RELATÓRIO. Um conferência antes: a tabela nunca teve produto inventado no código — ela sempre listou a sua Biblioteca → Insumos. O problema era outro: listava TODOS os fertilizantes com garantia do nutriente, do mais concentrado para o menos, e cortava nos seis primeiros com um "+ N produto(s) não listado(s)" no pé. Ninguém tinha escolhido aquelas linhas — daí a folha sair com dois "MAP" (são dois cadastros seus com o mesmo nome e 52%) e produtos que não são os da casa.',
    'A MARCA FICA NO CADASTRO: Biblioteca → Insumos → Fertilizantes minerais → "Usar no relatório de exportação". Marcou um ou mais, o relatório mostra só esses. Não marcou nenhum, continua listando todos como antes — a marcação é opt-in e não podia fazer a tabela de ninguém sumir da noite para o dia. Só aparece em fertilizante mineral, que é a única categoria que essa tabela consulta.',
    'ENTROU A EXTRAÇÃO, AO LADO DA EXPORTAÇÃO. São duas contas diferentes e agora as duas moram na mesma cultura da Biblioteca → Exportação de Nutrientes: EXPORTAÇÃO é o que sai do talhão dentro do grão (a conta de reposição, que já existia) e EXTRAÇÃO é o que a planta inteira absorveu, grão mais palhada. Cada uma tem seu conjunto de kg/t por nutriente, e o cadastro da cultura mostra "com extração" quando ela foi preenchida.',
    'NO RELATÓRIO SÃO DUAS SEÇÕES OPCIONAIS NOVAS — "Extração de K₂O" e "Extração de P₂O₅" —, com a mesma página do mapa de exportação: mapa, faixas, média, total e equivalentes. A cultura que não tiver o coeficiente de extração cadastrado nem oferece a opção, e diz onde cadastrá-lo.',
    'A RESSALVA DA PÁGINA DE EXTRAÇÃO É OUTRA, DE PROPÓSITO: repor a extração inteira em adubo aduba a palhada que ficou no talhão. A página avisa em vermelho que aquele equivalente NÃO deve ser reposto e serve para dimensionar a demanda da cultura. A página de exportação segue com a ressalva de sempre.',
    'Onde ver: Biblioteca → Insumos → Fertilizantes minerais (a marcação); Biblioteca → Exportação de Nutrientes (os dois blocos de coeficientes); e Talhão → aba Produtividade → Seções opcionais do relatório. 6 testes novos (npm run teste:exportacao, 24 no total) travam quem entra na tabela e o "ninguém marcado = todos".',
  ],
  '2.91.0': [
    'A BIBLIOTECA GANHOU O GRUPO RENTABILIDADE, E O MAPA DE RENTABILIDADE PASSOU A OBEDECÊ-LO. Até aqui as cores desse mapa eram fixas no código (vermelho→laranja para prejuízo, verde claro→verde escuro para lucro) e os limites de cada faixa saíam de um quantil calculado sobre os dados DAQUELE talhão — ou seja, não havia o que editar, e duas folhas da mesma fazenda usavam escalas diferentes sem avisar. Agora as faixas e as cores vêm de Biblioteca → Legendas → Rentabilidade.',
    'A LEGENDA OFICIAL É DIVERGENTE, ANCORADA NO ZERO: vermelho no prejuízo, azul no lucro, claro junto do zero (onde a margem quase não muda nada) e escuro nos extremos (onde o dinheiro pesa). Oito faixas, com as bordas em −2.000, −1.000, −500, 0, 500, 1.000 e 2.000 R$/ha. O zero é BORDA de faixa, nunca meio: uma faixa que atravessasse o zero pintaria lucro e prejuízo com a mesma cor, e "esta mancha deu prejuízo" é a única leitura que o mapa de dinheiro não pode errar.',
    'OS LIMITES SÃO SEUS. Edite as bordas na Biblioteca (ou duplique a oficial e faça a sua) e o próximo PDF sai nas faixas novas — inclusive a tabela lateral e o traço do "0 (equilíbrio)" na tira de cores, que continuam saindo do mesmo lugar que o mapa. Mexer no número de classes também vale: com duas classes o mapa vira simplesmente prejuízo × lucro.',
    'REDE DE SEGURANÇA: sem nenhuma legenda de rentabilidade cadastrada — ou com uma quebrada (faixa sem limite no meio, cortes fora de ordem) — o mapa cai no comportamento antigo, o quantil ancorado no zero, em vez de sair despintado.',
    'QUEM JÁ USA O APP RECEBE A LEGENDA NO PRÓXIMO BOOT. O seed oficial só age em Biblioteca vazia (de propósito: senão ele sobrescreveria a cada boot o que você editou), então legenda nova nunca chegava a quem já tinha as suas. Uma migração entrega esta a quem ainda não tem nenhuma de rentabilidade — e não a devolve se você a excluir.',
    'Onde ver: Biblioteca → Legendas → aba Rentabilidade; e Talhão → aba Produtividade → gerar o relatório com "Mapa de rentabilidade" marcado. 10 testes novos (npm run teste:rentabilidade, 41 no total) travam o zero na borda, o vermelho/azul de cada lado, o claro→escuro do centro para as pontas e a queda para o quantil quando a legenda não serve.',
  ],
  // [20] Importação de planilha REMOVIDA daqui — o lugar dela é a plataforma fitotécnica
  '2.90.0': [
    'REMOVIDA A IMPORTAÇÃO DE PLANILHA FITOTÉCNICA QUE ENTROU NAS VERSÕES 2.83 A 2.88. Ela foi construída na plataforma ERRADA: dados fitotécnicos (subcultura, variedade/híbrido, finalidade, grupo de produtores, o lançamento em massa) já existem, prontos e em uso, na plataforma fitotécnica — não aqui. Some o ícone "Importar planilha" da barra lateral e as categorias Cultivares e Propósitos da Biblioteca.',
    'NADA DE DADO SE PERDEU: nenhum lançamento tinha sido feito pela tela removida, e o cadastro de culturas dos talhões continua exatamente como estava.',
    'O trabalho de análise não foi perdido — ele vai junto para a plataforma certa: a calibração contra a planilha real de 592 linhas, o corte de 33 caracteres do sistema do cliente, as armadilhas de nomes de família (MARIO × MARIA, THIAGO × LUCIANO Aardoon) e a distinção entre consórcio, talhão partido e dúvida.',
    'Onde conferir: a barra lateral volta a ter Início, Clientes, Medições, Biblioteca e Configurações.',
  ],
  // [19] Fundir dois talhões (vínculo pelo nome)
  '2.89.0': [
    'PENDÊNCIA 19 — FUNDIR DOIS TALHÕES, ESCOLHENDO QUAL NOME PERMANECE. O caso: "05A" é, na verdade, parte do talhão "05". A ferramenta une os dois contornos, traz junto tudo que estava pendurado no talhão absorvido e o tira do cadastro — deixando registrado, no talhão que ficou, que ele existiu.',
    'ONDE ESTÁ: Talhão → "Fundir com outro talhão". Escolhe-se o outro talhão, qual NOME permanece e qual CADASTRO sobrevive (o padrão é o que tem mais dados pendurados, com um botão para trocar), e a tela mostra o que vai acontecer antes de aplicar.',
    'A DIVISA SOME QUANDO ELES SE ENCOSTAM. A união é geométrica de verdade: dois pedaços encostados viram UMA área, não um multipolígono com a divisa fantasma no meio. Separados, o talhão fica com duas áreas e a tela diz isso. E se os contornos se SOBREPUSEREM, a área final é a do contorno unido — a tela avisa quantos hectares estavam sendo contados duas vezes.',
    'O PROBLEMA REAL ERA A NUMERAÇÃO DAS AMOSTRAS, e é o que decidiu o desenho. As duas grades começaram no ponto 1: fundir sem mais nada deixaria dois "1" na mesma grade, e o laudo casa por número — o valor cairia no ponto errado. Renumeramos SÓ os pontos que chegam, e só onde colide (se a grade que chega já usa 41-52, nada muda), reescrevendo o laudo na mesma conta. Cada ponto mexido guarda o NÚMERO ANTERIOR.',
    'E EXISTE UM CASO EM QUE NÃO DÁ PARA RENUMERAR: quando as amostras estão NO LABORATÓRIO agora (remessa emitida, laudo ainda não voltou). O laboratório vai devolver os números antigos, então a fusão da amostragem fica bloqueada até o laudo entrar — os talhões se fundem, as grades convivem. Quando o laudo JÁ foi importado, renumerar é seguro (a tela avisa que o papel guardado deixa de bater com a tela).',
    'O LAUDO DO MESMO ANO ENTRA NA MESMA IMPORTAÇÃO. Duas importações do mesmo ano na mesma grade fariam a Fertilidade ler só uma — e o mapa do ciclo sairia com parte das amostras sem nada avisando.',
    'RENOMEAR PARA UM NOME QUE JÁ EXISTE OFERECE A FUSÃO, em vez de fazê-la calada: um dedo errado no teclado apagaria um talhão inteiro. E o nome duplicado deixa de ser gravado — a importação em massa casa talhão POR NOME, então dois "05" na mesma fazenda tornam ambíguo qual deles um KML atualiza.',
    'CULTURAS DIFERENTES NO MESMO CICLO IMPEDEM A FUSÃO, com o nome das duas na tela: o talhão fundido só tem uma, e escolher no lugar do agrônomo seria inventar dado.',
    'O HISTÓRICO FICA. A ficha do talhão passa a mostrar "Absorveu 05A (35,99 ha) em 27/08/2026", e o contorno que o absorvido tinha é guardado junto — o talhão some das listas, mas a origem daquela área continua demonstrável.',
    'Onde conferir: Produtores → fazenda → talhão → "Fundir com outro talhão". 8 testes novos (npm run teste:fundir) travam a união geométrica e a garantia central: nenhum número e nenhuma ordem repetidos na grade fundida, e o valor do laudo seguindo o ponto certo.',
  ],
  // [20] Importar planilha fitotécnica: a tela
  '2.88.0': [
    'PENDÊNCIA 20 — A TELA DE IMPORTAÇÃO DA PLANILHA ESTÁ NO AR. Novo ícone "Importar planilha" na barra lateral. Você solta o arquivo do cliente e o sistema lê, confere linha por linha contra o seu cadastro e mostra o que consegue resolver sozinho. Nada é gravado até você mandar.',
    'O PRÉ-VOO VEM ANTES DA TABELA, E É ELE QUE POUPA O TEMPO. Em vez de despejar 592 linhas, a primeira tela lista o que falta cadastrar ORDENADO PELO NÚMERO DE LINHAS QUE CADA ITEM DESTRAVA: cadastrar o produtor "Morro Chato" resolve 30 linhas de uma vez. Cada bloco (produtores, fazendas, talhões, cultivares, propósitos, culturas) diz quantos itens e quantas linhas estão presos nele.',
    'CADASTRAR CULTIVAR SEM SAIR DA TELA. Ao lado de cada cultivar que falta há um botão que abre o cadastro por cima, JÁ PREENCHIDO: o código da planilha entra como código comercial e, quando o próprio código traz o nome entre parênteses — "SS261SVIP3 (NK 301 VIP3)" —, o nome vem preenchido também. Salvou, a janela fecha, a lista encolhe na hora e as linhas daquele material saem de pendentes. Mesma coisa para propósito.',
    'A TABELA TEM QUATRO ABAS — Pendentes, Prontas, Fora e Tudo — e cada linha mostra, embaixo de cada campo, EXATAMENTE o que veio na planilha, para você conferir sem abrir o Excel ao lado. A coluna "O que falta" explica em português o que impede aquela linha de entrar, e uma linha pronta mostra por que casou.',
    'RESOLVER UMA LINHA RESOLVE AS IGUAIS: escolher o produtor de uma linha aplica a todas as linhas dele; e o talhão "DNHDV 09a" e o "DNHDV 09 A" contam como a mesma decisão. A tela avisa quantas outras linhas vão junto.',
    'TALHÃO COM DUAS LINHAS QUASE IDÊNTICAS vira pergunta com dois botões — "São partes" ou "Mesma área" — em vez de o sistema escolher por você. Qualquer linha pode ser tirada da importação sem sumir do relatório.',
    'AO IMPORTAR, SAI UM EXCEL DE CONTROLE com três abas: o que ENTROU (com o motivo do casamento), o que NÃO ENTROU (com o número da linha no arquivo e o motivo, para tratar manualmente) e as DIVERGÊNCIAS DE ÁREA — onde a área declarada pelo cliente difere mais de 2% da área do talhão no cadastro. A área do talhão continua sendo a geodésica do polígono; a da planilha entra como área declarada, ao lado.',
    'Onde conferir: barra lateral → Importar planilha. Verificado com a planilha real de 592 linhas.',
  ],
  '2.87.0': [
    'DISTRIBUIÇÃO DO INSUMO POR ÁREA SEPARADA — opção nova no relatório de recomendação, DESLIGADA por padrão. Talhão multipolígono são duas ou mais manchas separadas por estrada, mata ou benfeitoria: a recomendação é uma só, mas a CARRETA é despachada para uma mancha de cada vez. O relatório dizia apenas o total do talhão e o rateio ficava na conta de cabeça de quem está no pátio.',
    'MARCANDO A OPÇÃO, entra uma página com o MAPA das manchas numeradas (1, 2, 3…) e, embaixo, a tabela: tamanho de cada uma, a fatia do talhão e QUANTO DE CADA INSUMO vai em cada uma, mais o investimento. O número do mapa é o mesmo da tabela — é por ele que o relatório e o motorista se entendem.',
    'A QUANTIDADE DE CADA MANCHA SAI DA DOSE APLICADA NELA, não do rateio por hectare: duas áreas de 10 ha podem pedir tonelagens bem diferentes se uma for mais ácida que a outra. A conta é a integral do mapa de dose ponderada pela fração de cada célula que cai dentro da mancha — a mesma que já sustenta a dose média e o custo do PDF.',
    'AS PARTES FECHAM COM O TOTAL: o rateio é feito sobre a quantidade que o relatório já mostra. Discretizar o raster dá um número um pouco diferente da área de cadastro, e um relatório em que a soma das partes não bate com o total é um relatório que se confere na calculadora e não se usa mais.',
    'ONDE MARCAR: Talhão → Relatórios → seção Recomendação, e Fazenda → Relatórios (vale para todos os talhões do PDF). Fica fora do padrão de propósito — a maioria dos talhões é de área única e a página sairia com uma linha só; nesses casos, mesmo marcada, a página não é gerada.',
    '12 testes novos (npm run teste:porpoligono) travam as contas: a soma das partes fechando com o total, o rateio seguindo a dose e não o hectare, cada produto rateado por conta própria, mapa vazio caindo no rateio por área sem virar NaN e talhão de área única devolvendo uma parte só.',
  ],
  '2.86.1': [
    'O MAPA DE ZONAS DO RELATORIO PASSOU A MOSTRAR A CLASSIFICACAO ORIGINAL DA ZONA, nao a produtividade medida. Ate agora cada zona era pintada pela faixa de quantil da propria media — o que tornava a folha tautologica: a zona sempre concordava consigo mesma e o documento nao dizia nada sobre o zoneamento estar certo.',
    'A PERGUNTA QUE A PAGINA RESPONDE AGORA E OUTRA: dentro da classe que a zona JA TINHA, como a colheita se comportou? E comparando as duas coisas que se decide reclassificar.',
    'NA PRATICA: uma zona classificada como Alta que aparece verde no boxplot mas com a caixa na ponta ESQUERDA (menor produtividade) denuncia o desacordo na hora. Antes, pintada pela propria media, ela sairia verde e no lugar certo — parecendo coerente.',
    'A tabela ganhou a coluna CLASSE ao lado da media medida, e o boxplot traz a classe embaixo do nome de cada zona. O bloco virou "ZONAS DE MANEJO x COLHEITA".',
    'A legenda do grafico avisa que a cor e a classe original e nao a produtividade — sem isso o leitor interpretaria a cor como resultado.',
    'Talhao com zonas SEM classificacao reconhecida usa cores apenas para distinguir uma da outra, e o grafico diz isso: no cinza unico da classe desconhecida o mapa ficaria ilegivel.',
    'Removidas duas paginas de teste (smoke-temp e api/smoke-pdf) que entraram no repositorio por engano na v2.86.0.',
  ],
  // [20] Leitor da planilha e motor de conferência
  '2.86.0': [
    'PENDÊNCIA 20 — O SISTEMA JÁ LÊ A PLANILHA E DIZ, LINHA POR LINHA, O QUE ELE CONSEGUE RESOLVER SOZINHO (ainda sem tela; ela é a próxima). Rodado contra a planilha real de 592 linhas e o cadastro de produção.',
    'AS COLUNAS SÃO ACHADAS PELO NOME, NUNCA PELA POSIÇÃO. A planilha do cliente tem 39 colunas e a ordem não é contrato — no ano que vem o ERP pode mudar tudo de lugar. O sistema procura SAFRA, PRODUTOR, FAZENDA, TALHÃO, ÁREA, CULTURA, PROPÓSITO e CULTIVAR pelo cabeçalho, aceitando as variações que os clientes usam. E não confunde "DT. RET." com "DATA CRIAÇÃO", que é o que definiria a época do cultivo errada.',
    'NÚMERO E DATA EM PORTUGUÊS: "1.799,10" é 1.799,10 ha e não 1,799; "05/10/2026" é 5 de outubro. Área zerada, negativa ou ilegível NÃO vira zero — vira pendência, porque zero silencioso passa batido. Rodapé e linha em branco são descartados sem virar registro fantasma.',
    'O ANO DA PLANILHA CASA COM O DO CADASTRO: "2026/2027" encontra o ano "26/27" que você já tem, comparando o ano e não o texto.',
    'CADA LINHA SAI CLASSIFICADA EM QUATRO ESTADOS: pronta, confirmar, partir (subdivisão ou consórcio) e cadastrar. A pior etapa manda — linha com produtor certo e talhão inexistente é "cadastrar" — e cada linha carrega, em português, exatamente o que a impede de entrar.',
    'O PRÉ-VOO É O QUE MAIS POUPA TEMPO: antes de abrir 592 linhas, o sistema lista o que falta cadastrar ORDENADO PELO QUE MAIS DESTRAVA. Na planilha de referência, cadastrar o produtor Morro Chato resolve 30 linhas de uma vez; os 22 produtores ausentes travam 146 linhas juntos.',
    'MEDIDO, NÃO ESTIMADO: com os cultivares cadastrados (o trabalho da primeira planilha), 61% das linhas ficam prontas sozinhas. Feito o pré-voo, são 93% — 551 de 592 — sobrando 41 decisões suas. A conferência inteira leva 37 milissegundos, então a tela vai poder recalcular tudo a cada escolha sua.',
    'DUAS LINHAS NO MESMO TALHÃO CONTINUAM SENDO TRÊS COISAS DIFERENTES: consórcio (mesma área, culturas diferentes), partes (áreas e materiais diferentes) e dúvida (tudo igual menos a área) — e a dúvida vira pergunta, não chute.',
    'Onde conferir: nada na tela ainda. 32 testes novos (npm run teste:importacao-planilha).',
  ],
  // [20] Cultivo: consórcio, talhão partido e safrinha
  '2.85.0': [
    'PENDÊNCIA 20 — O REGISTRO DE CULTURA DO TALHÃO VIROU REGISTRO FITOTÉCNICO. Até aqui, um talhão tinha UMA cultura por ano e ponto final. Se você lançasse milho e depois braquiária no mesmo talhão, o segundo APAGAVA o primeiro, sem avisar. A planilha dos clientes tem três situações que não cabiam nisso — e todas as três estão na planilha de sementes que serviu de referência.',
    'CONSÓRCIO: milho e braquiária na MESMA área, mesmo talhão, mesmo ano (CKLBV 10 a, 36,49 ha nas duas linhas). Agora são dois registros, e a área NÃO é somada — somar daria 72,98 ha num talhão de 36,49.',
    'TALHÃO PARTIDO: "HABPU 02 a" com 20,76 ha e "HABPU 02 b" com 76,90, cada pedaço com o seu cultivar. Cada parte é um registro com o seu rótulo, e a soma (97,66) é o que se confere contra a área do talhão.',
    'SAFRINHA: soja no verão e milho depois, no mesmo talhão e no mesmo ano. Antes, o milho apagava a soja.',
    'CADA REGISTRO GUARDA MUITO MAIS: cultivar (ligado ao cadastro, com o nome copiado para o relatório não depender dele), propósito, área declarada pelo cliente, data de plantio e de qual importação ele veio. Esse último é o que vai permitir auditar e desfazer uma planilha inteira.',
    'A ÁREA DA PLANILHA NÃO SOBRESCREVE A DO TALHÃO. A área do talhão continua sendo a geodésica calculada do polígono, a mesma que casa com o QGIS. A área que o cliente declara fica no registro do cultivo, ao lado — e a diferença entre as duas é exatamente o que a conferência da importação vai mostrar.',
    'NADA MUDA NA SUA TELA. O seletor de Cultura do talhão funciona igual, e todo o histórico de culturas já lançado foi convertido automaticamente na primeira abertura, preservando as datas originais. Os 14 lugares do app que leem a cultura (fertilidade, produtividade, recomendação, relatórios, troca de polígono) continuam lendo pelo mesmo caminho.',
    'CORRIGIDO DE PASSAGEM: a versão do app tinha ficado em 2.83.1 enquanto o changelog já anunciava a 2.84.0 — duas sessões editaram o mesmo arquivo. Agora está 2.85.0.',
    'Onde conferir: talhão → seletor de Cultura no topo. 22 testes novos (npm run teste:cultivo).',
  ],
  // [20] Cadastro de cultivares e propósitos
  '2.84.0': [
    'PENDÊNCIA 20 — CADASTRO DE CULTIVARES E DE PROPÓSITOS (segunda parte da importação por planilha). Duas categorias novas na Biblioteca. Esta é a parte que resolve o item mais chato da planilha do cliente: o material vem como CÓDIGO, não como nome.',
    'CULTIVARES — O CÓDIGO COMERCIAL VIRA DICIONÁRIO. A planilha manda "55I57RSF IPRO"; o material chama Brasmax Zeus IPRO. Não existe conta que leve de um ao outro, e o sistema NÃO INVENTA — errar o nome de um material é pior do que não ter. Você diz uma vez, o código fica gravado no cultivar, e da próxima planilha em diante ele é reconhecido sozinho. Um cultivar aceita vários códigos ("55I57RSF IPRO" e "55I57RSF"), e o mesmo código não pode pertencer a dois cultivares — a tela bloqueia e diz em qual já está.',
    'O QUE VEM DE GRAÇA: quando o próprio código já traz o nome entre parênteses — "DP155100886 (P25300PWU)", "7602PRO4 (AS 1901 PRO4)" — o nome é extraído sozinho. E a marca é sugerida pelo prefixo quando ele não deixa dúvida (AG… Agroceres, DKB… Dekalb, AS… Agroeste, IPR… IAPAR, NS… Nidera). Códigos numéricos como "5995I2X" ou "581 E" NÃO recebem palpite de marca: são de vários obtentores e chutar ali só geraria cadastro errado.',
    'PROPÓSITOS — JÁ VÊM OS QUATRO PRONTOS: Produção de Grãos, Campo de Semente, Silagem de Planta Inteira e Cobertura, cada um com as grafias que os clientes usam ("Sil.Planta Inteira", "Campo de Semente-UBS"). CAMPO DE SEMENTE CONTA COMO GRÃO nos cálculos — é a marcação "equivale a grão", com selo verde na lista — e ao mesmo tempo continua registrado como Campo de Semente, para não perder a informação de que aquele talhão produziu semente.',
    'CULTURA DA PLANILHA: "SOJA TRANSGENICA" entra como Soja, "MILHO TRANSGENICO" como Milho, "BRACHIARIA" como Pastagem. O texto exato que veio da planilha é preservado no registro, não descartado — se um dia a plataforma tiver subcultura, a informação está lá. Cultura que não se reconhece vira pergunta, nunca chute.',
    'Onde conferir: Biblioteca → Cultivares e Biblioteca → Propósitos. 18 testes novos (npm run teste:importacao-catalogo).',
  ],
  // [18] Correção: o nome do talhão não é mais cortado na lista
  '2.83.1': [
    'PENDÊNCIA 18 (CORREÇÃO) — O NOME DO TALHÃO NÃO É MAIS CORTADO NA LISTA DA FAZENDA. A lista mostrava "IGEFI…" no lugar do nome, e num cadastro em que todos começam igual as reticências não identificam nada — a linha ficava ilegível justamente na coluna que importa.',
    'O QUE COMIA O ESPAÇO: a linha tem 320 px e as ações do lado direito estavam levando quase todas. A pior era o selo "Ativo" repetido nas 18 linhas: ~50 px por linha para dizer o que o quadradinho verde da esquerda já diz. Ele agora só aparece quando NÃO é ativo — que é quando há algo a resolver (o quadradinho âmbar continua marcando "Incompleto", agora com o motivo na dica do mouse).',
    'O "Abrir" perdeu o rótulo e ficou só com o ícone, os três botões encolheram de 13 para 12 px com metade do respiro lateral, e o selo de áreas separadas ficou mais estreito. No total, cerca de 90 px voltaram para o nome.',
    'E O NOME NUNCA MAIS É CORTADO, por mais longo que seja: em vez de reticências ele quebra em duas linhas. "IGEFI 12B RETIRO GRANDE" cabe numa linha só; "IGEFI 01 RETIRO DO CAMPO ALTO DA SERRA" usa duas e aparece inteiro. Só a linha comprida cresce — o resto da lista continua igual.',
    'Onde conferir: Produtores → fazenda → aba Talhões.',
  ],
  // [20] Motor de casamento da planilha fitotécnica
  '2.83.0': [
    'PENDÊNCIA 20 — MOTOR DE CASAMENTO DA PLANILHA FITOTÉCNICA (primeira parte, ainda SEM TELA). Esta versão não muda nada do que você vê: é o miolo que vai ligar cada linha da planilha do cliente ao produtor, à fazenda e ao talhão do cadastro. A tela de conferência vem nas próximas versões.',
    'POR QUE ISSO PRECISOU VIR ANTES: rodando a planilha real de 592 linhas contra o cadastro de produção, o casamento simples por nome acertava só 36,5% das linhas. Com as regras deste motor, são 62,5% resolvidas sozinhas — e 83% entre as linhas cujo produtor já está cadastrado. O resto tem motivo conhecido: 22 produtores da planilha ainda não existem no cadastro e sozinhos travam 146 linhas.',
    'A REGRA QUE MAIS RENDEU: o cadastro guarda "SANTA TEREZINHA" e a planilha manda "FAZENDA SANTA TEREZINHA-12208". Ignorar a palavra do tipo (Fazenda, Chácara, Sítio, Estância) e o código no fim do nome recuperou 217 linhas de uma vez. Nome composto também casa: "FAZENDA ROSEIRA / BOM SUCESSO" encontra "BOM SUCESSO".',
    'E A REGRA QUE MAIS EVITOU ESTRAGO: casar por parecença casava THIAGO Aardoon van den Boogaard com LUCIANO Aardoon van den Boogaard — duas pessoas, o mesmo talhão. Agora o primeiro nome e o último sobrenome têm de bater, JUNIOR e NETO contam como identidade (o cadastro tem "OSMAR NETO"), e quando os dois nomes têm uma palavra que o outro não tem — "GERRIT JAN LOS" contra "GERRIT PIETER LOS" — o sistema PERGUNTA em vez de escolher.',
    'NOME CORTADO PELO SISTEMA DO CLIENTE: nenhum nome da planilha passa de 33 caracteres, porque é onde o campo termina. "A.S. EMPREENDIMENTOS AGROPECUARIO" está no cadastro como "…AGROPECUARIOS", com S. O motor reconhece o corte e casa — são 17 lançamentos que iriam virar cadastro duplicado.',
    'TALHÃO: "DNHDV 09a", "DNHDV 09 A" e "DNHDV 09A" são o mesmo talhão; "MGEPE 1" e "MGEPE 01" também. Já "MCACA 07A", "MCACA 07AB" e "MCACA 07B" continuam sendo TRÊS talhões diferentes, como são no campo. Quando a planilha parte um talhão que o cadastro tem inteiro ("HABPU 02 a"), o sistema aponta de qual talhão é parte e espera sua confirmação — nunca parte sozinho.',
    'UMA LINHA PARA VÁRIOS TALHÕES ("GSLTA 01 E 02", "MGEPE 1-2", "ATSBO 3-7") nunca é gravada num talhão só. O sistema lista todos os talhões que a linha cobre e pede a correspondência. Vale mesmo quando a planilha vem com espaço no meio ("MGEPE 1 - 2") — antes, uma tecla de espaço fazia o segundo talhão sumir sem aviso.',
    'CONSÓRCIO NÃO É TALHÃO PARTIDO: quando duas linhas do mesmo talhão têm a MESMA área e culturas diferentes (milho + braquiária em CKLBV 10 a, 36,49 ha nas duas), somar dobraria a área. E há um terceiro caso, em 5 dos 11 talhões repetidos da planilha: tudo idêntico e só a área diferente — aí o sistema assume que NÃO sabe e pergunta, em vez de chutar.',
    'Onde conferir: nada na tela ainda. 86 testes novos (npm run teste:importacao) e o plano completo das 7 fases em docs/IMPORTACAO-FITOTECNICA.md.',
  ],
  // [S/N] Separar uma área do talhão (desmembrar / anexar / excluir) — pedido avulso, fora da lista numerada
  '2.82.0': [
    'SEPARAR UMA ÁREA DO TALHÃO, COM A AMOSTRAGEM JUNTO. Talhão multipolígono às vezes carrega uma área que não é dele: veio junto no shapefile, entrou no cadastro, e a grade foi gerada por cima. Até agora não havia como tirá-la — pior, o editor de traçado RECUSA mexer no limite quando o ciclo já tem grade ou laudo (e recusa com razão: ele substitui o polígono inteiro e invalida o que foi calculado em cima).',
    'ONDE ESTÁ: Talhão → Limite do talhão → "Talhão em N áreas — separar uma delas". Escolhe-se a área, o destino, e a tela mostra o que vai acontecer ANTES de aplicar. Três destinos: DESMEMBRAR em talhão novo, ANEXAR a um talhão já cadastrado (o vizinho a que a área pertence de verdade) ou EXCLUIR.',
    'A REGRA QUE MANDA EM TUDO: NÚMERO DE AMOSTRA NÃO SE RENUMERA. Ele está impresso na etiqueta do saco, foi na carta ao laboratório junto com a remessa e é a chave do casamento laudo↔ponto. A grade que muda de talhão leva os números ORIGINAIS — 4, 5, 18, 19 — esburacada de propósito. Renumerar faria o resultado da amostra 18 cair no ponto errado: um mapa plausível e FALSO, o pior erro que existe aqui.',
    'O QUE ACOMPANHA A ÁREA: os pontos da grade (número e ordem intactos), as COLETAS DE CAMPO daqueles pontos (a caminhada já feita não se refaz), o código de remessa, os RESULTADOS DE LAUDO daqueles números, as zonas de manejo que caem dentro e a cultura da safra. Ao ANEXAR num talhão que já tem grade do mesmo ano, tudo se funde numa grade e num laudo só — dois laudos do mesmo ano deixariam a Fertilidade lendo metade das amostras, sem nada avisando.',
    'QUANDO OS NÚMEROS COLIDEM, NÃO FUNDE — E DIZ POR QUÊ. Se a grade que chega tem um número que já existe na do destino, os pontos entram como uma GRADE SEPARADA em vez de virar duas amostras "18" na mesma grade. Não há desempate automático seguro: o número já está impresso na etiqueta dos dois sacos.',
    'EXCLUIR PEDE CONFIRMAÇÃO EXPLÍCITA, com a contagem do que se perde ("2 pontos e 2 resultados serão descartados") e uma caixa para marcar. A numeração dos pontos que ficam não muda nem aí.',
    'O LIMITE ANTERIOR FICA ARQUIVADO como versão do talhão — os ciclos que já usaram aquela geometria continuam apontando para ela. Por isso os mapas de fertilidade NÃO são apagados: em vez disso, a aba Fertilidade passa a avisar que o mapa é anterior à mudança e ainda pinta a área que saiu, pedindo o reprocessamento.',
    'AS ÁREAS FECHAM. A área que sai é a mesma fatia que a gaveta de áreas separadas (v2.81.0) mostra, e a que fica é a medição nova do que restou — as duas somam o que o talhão tinha, e a gaveta de cada talhão continua batendo com o cadastro dele. Um centavo de hectare fora do lugar aqui viraria discussão sobre a conta estar errada.',
    'Onde conferir: Produtores → fazenda → talhão → Limite do talhão. 8 testes novos (npm run teste:desmembrar) travam a preservação dos números e da ordem, a detecção de colisão e o fechamento das áreas.',
  ],
  // [18] Áreas separadas do talhão
  '2.81.0': [
    'PENDÊNCIA 18 — ÁREAS SEPARADAS DO TALHÃO, UMA A UMA. Talhão que é multipolígono (duas ou mais áreas soltas no mapa que são o mesmo talhão) mostrava só a SOMA na lista da fazenda — "IGEFI 02 · 113,34 ha" — e não havia onde ver quanto vale cada pedaço sem abrir o QGIS.',
    'AGORA A LINHA TEM UMA GAVETA. Quando o talhão tem mais de uma área, aparece ao lado do status um selo âmbar com o número de áreas; clicando nele a linha abre e lista cada uma, da MAIOR PARA A MENOR, com hectares, a fatia em % e uma barrinha proporcional. Clicar no selo não abre mais o talhão — só a gaveta.',
    'A ORDEM É POR TAMANHO, NÃO A DO ARQUIVO. A ordem em que as áreas estão dentro do shapefile é arbitrária: chamar de "Área 1" o pedaço de 4 ha só porque ele veio primeiro no arquivo faria a lista mudar de significado a cada reimportação.',
    'A SOMA DAS PARTES FECHA COM A ÁREA DO CADASTRO — de propósito. Arredondar cada parte por conta própria erra o centésimo em metade dos casos (medimos: 152 de 300 talhões de teste), e 100,13 + 13,22 ao lado de um total de 113,34 vira uma discussão sobre a conta estar errada quando ela está certa. As partes usam o MESMO fator geodésico do talhão inteiro e o arredondamento é compensado.',
    'A medida é a geodésica do elipsoide WGS84, a mesma que casa com o QGIS, com os furos descontados — é a mesma conta da área total que já estava na tela. Se o cadastro do talhão trouxer um número diferente (importação antiga, medida de outra época), a gaveta diz isso em vez de esconder.',
    'De quebra, o polígono de cada talhão passou a ser lido UMA VEZ por lista, e não a cada redesenho da tela como era antes.',
    'Onde conferir: Produtores → fazenda → aba Talhões. 6 testes novos (npm run teste:areas).',
  ],
  '2.80.0': [
    'A ORDEM DOS ELEMENTOS E AS PREFERÊNCIAS DE ANÁLISE PARARAM DE MUDAR SOZINHAS. As duas telas (Perfil → "Legendas por elemento" e Biblioteca → Preferências de Análise) leem o MESMO catálogo de variáveis, então nunca foram dois problemas — era um só, visto de dois lugares. A revisão achou QUATRO caminhos distintos que mexiam nesse catálogo sem ninguém pedir; todos foram fechados.',
    'O PIOR DELES: ABRIR O APP DE COLETA APAGAVA O CATÁLOGO NA NUVEM. O app de campo, para caber no celular, apaga do aparelho as coleções que ele não usa — e o catálogo de variáveis é uma delas. Só que as migrações do boot rodavam mesmo assim, viam o catálogo "vazio" e o semeavam do zero; e o primeiro envio, sem ter com o que comparar, ainda mandava a nuvem apagar tudo que não estivesse nesse seed novo. Resultado: bastava alguém abrir a coleta no celular para a plataforma inteira voltar ao catálogo de fábrica — ordem, siglas editadas, variáveis criadas e as que estavam desligadas. Agora o app de campo não envia mais coleção que ele não baixou, e a limpeza de órfãos na nuvem só vale para coleção que aquele boot realmente carregou.',
    'SEGUNDO: SEMEAR ANTES DE A NUVEM RESPONDER CRIAVA VARIÁVEIS GÊMEAS. Quando o boot passa de 12 segundos, o app entra com o que tem local e continua baixando por trás. Nesse intervalo o catálogo parecia vazio e era semeado de novo — e, diferente das legendas (que têm identificador fixo e seriam só sobrescritas), variável ganha identificador aleatório: em vez de sobrescrever, DUPLICA. Com duas cópias da mesma variável, a leitura escolhe uma delas pela ordem — e a escolhida muda de uma abertura para outra. É por isso que a lista aparecia embaralhada, item a item, e não em bloco. Agora vazio só autoriza semear depois que a nuvem respondeu, e as gêmeas que já existem são removidas no boot, ficando a versão editada por último.',
    'TERCEIRO: A ORDEM PADRÃO DE FÁBRICA ERA REAPLICADA. A migração que definiu a ordem padrão dos elementos deveria rodar uma única vez, mas a trava dela ficava no aparelho e o dado é de todos — cada navegador novo, celular novo ou cache limpo reaplicava a ordem de fábrica por cima das setinhas e propagava para todo mundo. Pior: a proteção que deveria adiá-la nunca funcionou (perguntava a uma função que devolve um catálogo de mentira quando não há nada gravado), então ela chegou a rodar contra o próprio seed. Agora exige catálogo de verdade e nuvem respondida.',
    'QUARTO: A PRÓPRIA DEFESA CONTRA A CORRIDA DO BOOT ESTAVA LEVANDO A CÓPIA VELHA. A Biblioteca gravava direto no navegador sem avisar o cache de leitura; o boot então relia a lista ANTERIOR à sua edição, regravava essa cópia velha e ainda a enviava para a nuvem. Corrigido — e a marca de "editei agora" passou a valer entre ABAS (plataforma e coleta abertas ao mesmo tempo era outro jeito de perder a edição) e o reenvio automático de um envio que falhou agora manda o estado ATUAL, não o que falhou.',
    'Onde conferir: Biblioteca → Perfis → editar (ordem dos elementos) e Biblioteca → Preferências de Análise. Se a sua lista estiver com alguma variável repetida, ela é limpa sozinha na próxima abertura. 21 testes novos (npm run teste:catalogo e npm run teste:janela).',
  ],
  '2.79.1': [
    'CORRIGIDO — O RESUMO ANALITICO SE SOBREPUNHA quando o talhao tinha zonas de manejo. O bloco da esquerda recebia 92 mm de altura mas o conteudo (estatistica + qualidade do dado + limpeza) pedia ~108: a limpeza transbordava por cima do titulo do boxplot, e a linha da media real saia cortada. Acontecia ja com 3 zonas.',
    'A estatistica passou a sair em TRES colunas (cinco linhas em vez de sete) e o relatorio de limpeza em linhas densas, com os assuntos juntos, em vez de seis linhas soltas. Tudo cabe, e a leitura ficou mais compacta em vez de mais pobre.',
    'CORRIGIDO — O BOXPLOT POR ZONA ESTOURAVA A PARTIR DE 8 ZONAS. A altura da linha tinha um piso de 4 mm que garantia legibilidade mas passava do quadro: com 15 zonas seriam 60 mm num vao de 31, invadindo o rodape. O piso saiu — estourar e pior que apertar.',
    'ACIMA DE 6 ZONAS A ANALISE GANHA PAGINA PROPRIA. Boxplot em largura total, painel de separacao entre zonas e mini-mapa maior, com a tabela COMPLETA (antes cortava em 6 linhas e resumia o resto em "+N zonas" — escondendo justamente a zona problematica). Cabem 15 zonas com 8 mm por linha, e ate cerca de 18.',
    'ATE 6 ZONAS NADA MUDA: o resumo analitico continua numa folha so, com o mesmo desenho de antes. A pagina extra so aparece quando ela e necessaria.',
    'De quebra, com a analise por zona em folha propria o bloco da estatistica recupera a altura cheia da pagina.',
  ],
  '2.79.0': [
    'O IMPORTADOR DEIXOU DE DEPENDER DA POSIÇÃO DA COLUNA. Os perfis de laboratório leem por posição fixa, e toda coluna fora da lista era jogada fora sem uma palavra — foi assim que o Ferro sumiu, e é assim que somem H+Al, Sódio, Soma de Bases e Silte. Agora, depois de aplicar o perfil, o app varre as colunas que sobraram e aproveita as que reconhece pelo NOME do cabeçalho.',
    'E AVISA, EM VEZ DE FAZER CALADO: aparece um aviso verde na prévia dizendo quantas e quais colunas entraram por fora do perfil, pedindo para você conferir a unidade delas. Acrescentar em silêncio só trocaria uma falha muda por outra.',
    'TRÊS TRAVAS PROTEGEM O QUE JÁ FUNCIONAVA, e nenhuma é enfeite: testamos a versão sem elas e ela TROCOU quatro valores num laudo com colunas repetidas. Coluna que o perfil já lê fica intocada; coluna de identificação (amostra, talhão, profundidade) nunca vira elemento; e elemento que o perfil já mapeia não é remapeado — se o arquivo tem duas colunas "S", vale a do perfil. Além disso, a rede só age quando o perfil já está batendo com o arquivo: pendurar uma coluna certa num perfil que lê todo o resto trocado seria pior que a coluna faltando.',
    'CORRIGIDO NO CAMINHO — "Nº AMOSTRA" ERA LIDO COMO MATÉRIA ORGÂNICA. O apelido "MOS" da matéria orgânica está escondido dentro da palavra "aMOStra". Em laudo com uma coluna de amostra o problema não aparecia (ela vira a coluna de identificação), mas com duas — por exemplo "ID Amostra" e "Nº Amostra" — o NÚMERO da amostra era importado como valor de M.O. Reproduzimos e travamos. As formas legítimas (MOS, MO, M.O., Matéria Orgânica) seguem funcionando.',
    '14 testes automáticos novos cobrem a rede e esse bug (npm run teste:lab, 33 no total), incluindo a garantia de que nenhum valor que já era importado muda de lugar.',
  ],
  '2.78.0': [
    'O FERRO AGORA VEM MESMO — ERAM TRÊS BLOQUEIOS, NÃO UM. A correção anterior (v2.77.0) resolveu só o primeiro, por isso reimportar não adiantou. Rodando o caminho de importação com o arquivo real, apareceram os outros dois.',
    'BLOQUEIO 2 — o perfil "Fundação ABC (planilha)" lê as colunas por POSIÇÃO e pulava justamente a do Ferro (a 17, entre Cobre e Manganês). Conferido contra o arquivo de exemplo desse layout que existe no próprio sistema. As colunas 12 e 20 continuam puladas de propósito: são CTCe e K%, que o app calcula em vez de ler.',
    'BLOQUEIO 3 — para quem já usava o app, o Ferro estava no catálogo de Variáveis de Análise como DESLIGADO, e com um detalhe cruel: o único sinônimo cadastrado era "Ferro" por extenso. Como a busca de colunas é feita pelos sinônimos, uma coluna escrita "Fe" não casava nem depois de ligar. Agora o app liga o Ferro sozinho, uma única vez, e acrescenta o sinônimo que faltava — sem mexer em nenhuma outra variável que você tenha desligado de propósito.',
    'CONFERIDO NOS DOIS LAYOUTS REAIS: no laudo em que o Ferro está na coluna 23 e no de exemplo do sistema, em que está na 17 — os dois passaram a reconhecê-lo.',
    'O QUE VOCÊ PRECISA FAZER: reimportar o laudo (a importação anterior foi gravada sem a coluna) e ter a legenda do Ferro cadastrada em Biblioteca → Legendas. Se ela já existe, é só reimportar.',
    '11 testes automáticos travam o Ferro na importação (npm run teste:lab), incluindo a garantia de que nenhum perfil leia a mesma coluna duas vezes e de que as colunas calculadas continuem fora.',
  ],
  '2.77.0': [
    'O FERRO (Fe) VOLTOU A SER LIDO DO LAUDO. A coluna Fe do arquivo do laboratório era lida e DESCARTADA em silêncio: o Ferro faltava na lista de elementos que a importação reconhece, então ele nunca chegava à aba Fertilidade para interpolar — enquanto B, Cu, Mn, Zn e S apareciam normalmente. Agora "Fe" e "Ferro" são reconhecidos, na unidade mg/dm³ como os demais micronutrientes.',
    'A ausência era invisível porque o RESTO do app já contava com o Fe: ele estava na ordem padrão dos elementos (entre Mn e Al) e no catálogo de Variáveis de Análise. Só o leitor do laudo não o conhecia, e nada acusava a diferença.',
    'PARA VER O FERRO NO SEU TALHÃO: reimporte o laudo (a importação antiga foi salva sem a coluna Fe, e nenhuma correção recupera dado que não foi guardado) e crie a legenda do Ferro em Biblioteca → Legendas — do mesmo jeito que você fez para B, Cu, Mn e Zn. Sem legenda, a variável não entra na lista de mapas.',
    'E O APP DEIXOU DE ESCONDER ESSE SEGUNDO CASO: quando uma variável vem no laudo mas não tem legenda cadastrada, ela sumia da lista sem nenhuma palavra — e quem procurava por ela concluía que "o laudo não trouxe". Agora a aba Fertilidade lista essas variáveis em amarelo, dizendo que basta criar a legenda.',
    '4 testes novos travam o reconhecimento do Fe na importação (npm run teste:lab), incluindo a garantia de que a relação "Fe/Mn" não seja confundida com o micronutriente.',
  ],
  '2.76.0': [
    'TALHÃO COM DUAS ÁREAS: O APP AGORA AVISA QUANDO UMA DELAS ESTÁ SEM AMOSTRA NO LAUDO. Caso real (WNOCG 06, condomínio Figueira): o talhão tem uma área grande e outra separada, e o mapa de fertilidade saía com a área separada de UMA COR SÓ. Investigando: o laudo trouxe 34 amostras e faltavam exatamente os números 4, 5, 17, 18, 19, 20, 21, 22, 38 e 39 — que são, um a um, os dez pontos daquela área.',
    'O APP ESTAVA CERTO; O QUE FALTAVA ERA O DADO. Confirmamos no interpolador que a área separada É coberta normalmente: reproduzindo o talhão com as amostras faltando, ela sai com variação ZERO; colocando 10 amostras nela, sai interpolada como a outra. Sem nenhum ponto por perto, a krigagem prediz a média das demais amostras — e o resultado é uma mancha chapada.',
    'O PROBLEMA ERA O SILÊNCIO. Essa mancha era pintada igual a um dado medido, ia para o PDF e para a Recomendação, e nada avisava — porque todos os diagnósticos olhavam QUANTAS amostras casaram (34 de 44, tudo "verde") e nenhum olhava ONDE elas estão. Agora a aba Fertilidade avisa em amarelo, dizendo quais números de ponto faltam, para você cobrar exatamente essas análises do laboratório.',
    'O aviso só aparece em talhão de mais de uma área, e some assim que a parte tiver ao menos uma amostra. Talhão de uma área só continua sendo tratado pelo aviso de "sem mapa", que já existia.',
    'Verificado também que o casamento amostra↔ponto estava correto neste caso (por número, não por ordem) — ou seja, nenhum valor foi para o ponto errado. 9 testes novos travam a regra (npm run teste:partes).',
  ],
  '2.75.2': [
    'ARRENDAMENTO EM SACAS POR ALQUEIRE, e o relatorio passa a sair com DOIS mapas de rentabilidade: sem arrendamento e com. A conversao para R$/ha e automatica — sacas/alq x kg da saca x R$/kg ÷ hectares do alqueire — e usa o proprio preco de venda, porque o contrato e em produto: 40 sc/alq valem mais quando a saca sobe.',
    'O ALQUEIRE E ESCOLHIDO NA TELA e gravado no mapa: paulista (2,42 ha), mineiro/goiano (4,84 ha) ou do Norte (2,7225 ha). Nao existe "o alqueire" — entre o paulista e o mineiro ha o DOBRO, e errar qual esta em uso dobraria o custo sem nenhum sinal. O padrao e o paulista, que e o do Parana e do Sul.',
    'POR QUE DOIS MAPAS E NAO UM: o arrendamento e custo uniforme, entao a mancha nao muda — mas o ZERO se desloca, e a area que deixa de pagar as contas e exatamente o que interessa comparar. Num exemplo de soja a 130/sc, 40 sc/alq levaram o ponto de equilibrio de 2.492 para 3.484 kg/ha e puseram 12,6% do talhao no vermelho.',
    'O resumo agora mostra a cadeia inteira: custo de producao, arrendamento, custo total, ponto de equilibrio e a area abaixo dele.',
    'CORRIGIDO — O MAPA DE RENTABILIDADE NAO LIBERAVA depois de informar preco e custo. A tela guardava uma COPIA do mapa de quando voce clicou no olho; salvar no lapis recarregava a lista mas a copia continuava velha, sem a economia. Agora a tela le da lista, e qualquer edicao chega na hora.',
    'REMOVIDOS OS VALORES QUE A PLATAFORMA TINHA INVENTADO. Na v2.75.1 os coeficientes de exportacao (soja, milho, trigo, feijao) e os fertilizantes de referencia (KCl, MAP, DAP, Gafsa, Arad, Super Simples e Triplo) vinham semeados com valores de literatura. Saem: os dois cadastros sao da casa e ela e quem os assina.',
    'Coeficiente de exportacao errado nao quebra nada — produz um mapa plausivel e FALSO, que e o pior tipo de erro; e garantia de fertilizante varia por fornecedor. Os dois se cadastram em Biblioteca > Exportacao de Nutrientes e Biblioteca > Insumos.',
    'Enquanto nao ha cadastro, a tela diz o que falta ("Sem coeficiente de K2O para soja — Biblioteca > Exportacao de Nutrientes") e a tabela de equivalentes do PDF explica em vez de sair vazia.',
  ],
  '2.75.1': [
    'O RELATORIO DE PRODUTIVIDADE GANHOU DUAS SECOES OPCIONAIS: RENTABILIDADE e EXPORTACAO DE NUTRIENTES. Ate agora ele respondia "quanto colheu e onde"; nao respondia "deu lucro?" nem "quanto de nutriente saiu do talhao junto com o grao?".',
    'MAPA DE RENTABILIDADE. Voce informa o preco de venda (por saca ou por tonelada) e o custo total por hectare no lapis do mapa salvo; a plataforma calcula a margem pixel a pixel. Sai com tabela por faixa (R$/ha, hectares, %, R$ totais) e resumo com receita media, margem media, margem total e retorno sobre o custo.',
    'PONTO DE EQUILIBRIO em destaque: a produtividade que paga exatamente o custo, em kg/ha e na unidade do mapa, mais os hectares abaixo dele. Aparece ao vivo ja na tela de edicao, antes de gerar o PDF.',
    'AS FAIXAS DE RENTABILIDADE SAO ANCORADAS NO ZERO, nao por quantil. Quantil puro pinta 20% da area de vermelho SEMPRE — inclusive num talhao inteiramente lucrativo, o que seria uma mentira cara. Aqui o zero e fronteira de faixa e sai marcado na legenda como "0 (equilibrio)": talhao todo no lucro sai todo verde.',
    'O relatorio DIZ que o custo e uniforme: a variacao do mapa vem so da produtividade. Sem essa linha o documento sugeriria que se mediu custo por pixel, o que nao aconteceu.',
    'MAPA DE EXPORTACAO DE K2O E P2O5. Quanto de cada nutriente saiu do talhao dentro do grao, pixel a pixel, a partir do coeficiente da cultura (kg de oxido por tonelada colhida). Uma pagina por nutriente, com paleta propria (azul-roxo) — a mancha e identica a do mapa por quantil e so a cor avisa que a grandeza mudou.',
    'EQUIVALENTES EM FERTILIZANTE na mesma pagina: quanto de KCl, MAP, DAP, Superfosfato Triplo, Gafsa, Arad ou Superfosfato Simples reporia aquela exportacao, em kg/ha e em toneladas totais — mais o custo, quando o insumo tem preco cadastrado. Sem preco sai travessao, nunca R$ 0,00.',
    'Um mapa por NUTRIENTE, nao por produto: os equivalentes sao multiplos escalares da exportacao (KCl = K2O ÷ 0,60, MAP = P2O5 ÷ 0,52...), entao seis paginas sairiam com a mesma mancha e dariam impressao de seis achados diferentes. Uma pagina e uma tabela dizem a mesma coisa sem enganar.',
    'A tabela avisa, em vermelho, que e REPOSICAO da exportacao e NAO recomendacao de adubacao: nao considera teor do solo, resposta da cultura nem eficiencia do produto.',
    'BIBLIOTECA → EXPORTACAO DE NUTRIENTES (categoria nova). Coeficientes por cultura em K2O, P2O5, N, S, Ca e Mg, com a umidade de referencia e a FONTE declarada. Soja, milho, trigo e feijao ja vem semeados como Sistema, com valores de literatura — EDITAVEIS, e a fonte de cada um esta escrita no proprio item para o agronomo conferir contra a referencia da casa.',
    'Campo em branco = nao declarado; zero = declarado como zero. Sao coisas diferentes e o relatorio trata cada uma do seu jeito.',
    'BIBLIOTECA → INSUMOS ganhou os fertilizantes de referencia como Sistema (KCl 60% K2O, MAP 11-52, DAP 18-45, Super Triplo 41%, Gafsa e Arad 29%, Super Simples 18%, Sulfato de Potassio 50%). SEM preco de proposito: preco e do cliente e muda toda semana; um preco "de fabrica" apareceria no relatorio com cara de numero apurado.',
    'AS SECOES SAO OPCIONAIS e cada uma so liga quando tem de onde sair — e quando nao tem, o proprio seletor DIZ o motivo: "informe preco e custo no lapis do mapa" ou "sem coeficiente cadastrado para milho". Desabilitar sem explicar e o que faz o usuario achar que quebrou.',
    '43 testes novos (npm run teste:rentabilidade e npm run teste:exportacao), travando as tres armadilhas que produzem mapa plausivel e FALSO: pixel fora do talhao virando prejuizo maximo, preco ausente lido como zero (a lavoura toda no vermelho) e divisao por garantia zero (dose absurda e crivel).',
  ],
  '2.75.0': [
    'A AMOSTRAGEM POR ZONAS DE MANEJO GANHOU A CARTA PARA O LABORATÓRIO — a mesma planilha que a amostragem em Grid já gerava, com as mesmas colunas: Remessa, Produtor, Município, Fazenda, Talhão, ID, Profundidade e Análises. Botão "Carta", ao lado de Etiquetas, em cada grade de zonas salva.',
    'A DIFERENÇA ESTÁ NO QUE CONTA COMO AMOSTRA. Na amostra composta, os pontos da caminhada viram UM saco por zona — então a planilha lista uma linha por SACO × profundidade, não por ponto. Listar ponto a ponto prometeria 50 amostras ao laboratório e chegariam 4. Em pontos individuais, é uma linha por ponto, com o rótulo do campo (1-1, 2-3).',
    'O ID DA PLANILHA É O MESMO TEXTO IMPRESSO NA ETIQUETA do saco. A carta e as etiquetas passaram a usar a mesma conta: se discordassem, o laudo voltaria amarrado ao identificador errado e o erro só apareceria no mapa, semanas depois.',
    'A profundidade parcial vale para as primeiras amostras, na ordem — igual à grade comum. Ex.: 20-40 em 50% de 4 zonas → só as zonas 01 e 02 vão à camada profunda, e é isso que sai na planilha e nas etiquetas.',
    'O código de remessa (INV-XXXX-XXXX) nasce ao gerar a carta e se repete em toda linha, como na grade: é por ele que o laboratório identifica de qual talhão é o laudo na API.',
  ],
  '2.74.0': [
    'RESUMO GERAL DAS RECOMENDAÇÕES MARCADAS — novo relatório que responde à pergunta da COMPRA e do ENVIO, não à da conferência: quanto de cada produto eu preciso, talhão a talhão, somando os anos que eu escolher, e quais recomendações vou ter de mandar para o campo. Sai em PDF e em Excel.',
    'ESCOLHA VÁRIOS ANOS DE UMA VEZ. Até aqui o relatório de recomendação da fazenda resolvia UM ano por vez, e quem queria o consolidado de duas safras somava na mão. Agora os anos com recomendação aparecem como botões e você marca quantos quiser; cada ano vira um bloco com o seu subtotal e, no fim, entra o TOTAL GERAL somando os anos escolhidos.',
    'TABELA EM MATRIZ: uma linha por talhão e UMA COLUNA POR PRODUTO, com a quantidade total na célula — o formato que se lê de bater o olho e que o Excel soma. Talhão que não recebeu determinado produto fica com a célula VAZIA, não com zero: zero diria que a conta deu zero, e não que não houve aplicação.',
    'FILTRO DE PRODUTOS: depois de carregar, aparecem os produtos encontrados e você marca só os que interessam. O filtro NÃO volta à nuvem — o resumo é remontado na hora sobre o que já veio —, e um talhão que só tinha produto desmarcado sai da tabela em vez de virar uma linha de zeros.',
    'RECOMENDAÇÕES A ENVIAR: fechando o relatório, a lista de conferência do despacho — cada recomendação com o ano, o produto, a quantidade total e OS TALHÕES em que ela é usada ("03 - Calcário taxa variável → IGEFI 01, 02, 05"). É por ela que se sabe quais arquivos mandar e para onde, sem abrir talhão por talhão.',
    'DOIS ESCOPOS, SEPARADOS: na FAZENDA (aba Relatórios, abaixo do relatório de recomendação que já existia) e no PRODUTOR (aba Relatórios, nova), este consolidando todas as fazendas com uma coluna Fazenda a mais.',
    'SEM MAPAS, DE PROPÓSITO — e é isso que o torna viável em vários anos: o resumo não descomprime nenhum mapa de dose (só lê nome, produto, quantidade e custo), e faz UMA consulta por talhão em vez de uma por talhão por ano. Quem quer os mapas continua no "Recomendação (PDF)".',
    'Com muitos produtos a matriz não caberia na folha: em vez de encolher a fonte até ninguém ler, a tabela do ano se repete em grupos de produtos, mantendo talhão, área e investimento. 20 testes novos (npm run teste:resumo-geral) travam as contas — inclusive a que mais engana: a ÁREA do talhão conta uma vez por ano e uma vez no total geral, nunca uma vez por recomendação.',
  ],
  '2.73.3': [
    'MAPA DE COLHEITA SALVO AGORA SE EDITA. Botao de lapis na linha do mapa, em "Mapas salvos": cultura, epoca de cultivo, data da colheita, data do plantio e unidade. Ate agora, um mapa salvo com a cultura errada so tinha um caminho — apagar e reprocessar tudo.',
    'TROCAR A CULTURA TROCA A LEGENDA, e com ela as cores do mapa e do relatorio: a legenda e escolhida na hora de desenhar, nao gravada no raster. Entao corrigir "Soja" para "Milho" ja acerta as faixas na tela e no PDF, sem reprocessar.',
    'MUDAR A DATA DA COLHEITA REARQUIVA O MAPA no ano/epoca certos do periodo — a tela mostra em qual antes de voce salvar, para nao haver surpresa.',
    'O QUE NAO SE EDITA, DE PROPOSITO: parametros de limpeza, pixel e media real. Mexer neles aqui deixaria as estatisticas gravadas (area, producao, CV) descrevendo um mapa que nao existe mais. Para esses, o caminho continua sendo reprocessar.',
    'DATA DE PLANTIO (opcional). Quando preenchida, o cabecalho do relatorio passa a trazer "Plantio 12/10/2025 · Colheita 19/08/2026 · 311 d" — plantio, colheita e ciclo em dias. Quando nao ha, o relatorio simplesmente nao fala de plantio nem de ciclo: melhor calar que estimar uma data que ninguem informou.',
    'Plantio e colheita saem na MESMA linha porque o bloco de informacoes da area comporta 4 linhas antes da regua do cabecalho; uma quinta invadiria a regua.',
    'O campo e manual por enquanto. O destino e busca-lo na plataforma de dados fitotecnicos — por isso ele ja existe no registro do mapa, pronto para ser preenchido de fora.',
  ],
  '2.73.2': [
    'A PRODUTIVIDADE PASSOU A DIZER ONDE A COLHEDORA NAO PASSOU. Ate agora o interpolador preenchia o poligono INTEIRO: um talhao colhido pela metade virava um mapa inteiro, bonito e plausivel, e a metade inventada nao se distinguia da medida. Foi o caso do JCACR 02 — uma mancha clara ocupando uma ponta do talhao, sem uma unica passada por baixo.',
    'CONFERENCIA ANTES DE PROCESSAR (etapa 4). Botao "Conferir no mapa": os pontos aparecem sobre o LIMITE DO TALHAO, com a area sem dado hachurada em vermelho, mais cobertura em %, hectares sem dado, maior vazio continuo e densidade em pontos por hectare. Tudo isso ANTES de gastar os 30–60 s do backend.',
    'A PREVIA ANTIGA ("Ver pontos brutos") continua, mas nao servia para isso: ela e enquadrada pelos BOUNDS DOS PONTOS, entao num talhao colhido pela metade a imagem sai cheia — o enquadramento encolhe junto com os dados e some justamente o vazio que interessa ver.',
    'AREA SEM DADO AGORA E RECORTADA por padrao: vira buraco no mapa e sai da area e da producao total. O recorte acontece no proprio raster, ANTES das estatisticas, entao area, producao, quantis e cores saem todos do mesmo grid — nao ha numero de um lado e mapa de outro. Da para voltar ao comportamento antigo na caixa "Extrapolar areas sem dado".',
    'O RAIO E AJUSTAVEL (padrao 15 m, ~1,5 plataforma de colhedora): celula a mais que isso de um ponto conta como sem dado. E escolha agronomica, nao valor derivado — por isso fica na tela e vai impresso no relatorio.',
    'NO RELATORIO, EM DOIS LUGARES. Pagina 1: faixa de aviso junto das estatisticas — "MAPA INCOMPLETO" ou "ATENCAO — COBERTURA PARCIAL", com o percentual, os hectares sem dado e se foram recortados ou extrapolados. Fica ali porque e ali que se le a media e a producao, e e delas que a falta de dado tira o sentido.',
    'Pagina 4: bloco QUALIDADE DO DADO, antes do relatorio de limpeza. A limpeza conta quantos pontos foram descartados, mas nao sabe dizer se sobrou dado onde o talhao esta — um mapa pode ter 15 mil pontos usados e ainda assim ignorar um quarto da area.',
    'A REGUA: 95% ou mais e cobertura boa; entre 85 e 95 aparece como atencao; abaixo de 85 o mapa e declarado incompleto, porque ele descreve a parte colhida e nao o talhao.',
    '17 testes novos (npm run teste:cobertura-colheita), incluindo a guarda de que a linha 0 da malha e o NORTE — errar isso espelha o mapa no eixo Y e o erro so apareceria muito adiante.',
  ],
  '2.73.1': [
    'CORRIGIDO — O RELATÓRIO NÃO DIZIA QUE A FÓRMULA TINHA SIDO EDITADA. Você editava a equação no talhão, aplicava e salvava o cenário; na tela aparecia "(fórmula editada)", mas o PDF saía com o nome da equação da Biblioteca, como se fosse a recomendação oficial padrão. Motivo: todo relatório reabre o cenário e re-busca nome, produto e faixas na equação atual (é o que faz a legenda acompanhar edições de estilo) — e nessa volta a marcação, que era só texto no nome, era apagada.',
    'AGORA A MARCAÇÃO É DADO DA DOSE, não texto: viaja dentro do cenário e sobrevive a reabrir, renomear a equação e gerar o PDF quantas vezes for. Vale para o PDF oficial, o book, o relatório combinado, o da fazenda e o comparador.',
    'E O PDF OFICIAL PASSOU A IMPRIMIR A FÓRMULA USADA, num bloco no fim da coluna da esquerda: "FÓRMULA USADA (EDITADA NESTE TALHÃO)" com a conta que gerou aquele mapa e a nota de que a equação da Biblioteca continua como estava. Quem recebe o documento consegue conferir a conta, e não só o resultado.',
    'Os cenários que você já salvou voltam a sair marcados no relatório. O bloco com a fórmula só aparece nos aplicados a partir desta versão — para tê-lo num cenário antigo, é só aplicar de novo.',
    '5 testes novos travam o caso (npm run teste:faixas, 26 no total): a marca sobrevive à re-hidratação, não duplica ao reabrir várias vezes, convive com a marcação de passada ("aplicação 2/3") e não aparece em dose que não foi editada.',
  ],
  '2.73.0': [
    'A ABA RECOMENDAÇÕES PASSOU A MOSTRAR A FÓRMULA DE VERDADE. No modo "Equação avulsa", ao escolher a equação aparece um quadro com a conta que vai rodar — escrita como está na Biblioteca —, mais a profundidade lida, a unidade da dose, as constantes e a lista de atributos que ela exige. Antes você escolhia pelo nome e aplicava no escuro.',
    'E DÁ PARA EDITAR ALI MESMO, SÓ PARA AQUELE TALHÃO. O botão "Editar" abre a fórmula num painel: mexer num número, trocar a profundidade, ou apagar tudo e reescrever do zero clicando nos atributos (V, CTC, K, P, Arg…) e nas funções (se, max, min, arredonda…). O teste ao lado já mostra a dose que sairia, com valores de exemplo. É o mesmo editor da Biblioteca, agora aberto de dentro do talhão.',
    'A BIBLIOTECA NÃO MUDA SOZINHA — essa é a regra. A fórmula editada vale só naquele talhão e fica marcada em amarelo ("alterada só para este talhão"), com um botão para voltar ao original a qualquer momento. Para que a mudança valha para todo mundo existem dois botões explícitos: "Salvar na equação" (grava na Biblioteca) e "Salvar como nova" (cria outra equação sem tocar na original).',
    'O CENÁRIO DA FÓRMULA EDITADA É OUTRO CENÁRIO. Ele é gravado separado do cenário da equação original — do mesmo jeito que interpolação e zona já eram separados — e o nome sai marcado com "(fórmula editada)", para que o PDF e os arquivos de máquina nunca escondam que a conta não é mais a da Biblioteca.',
    'AINDA: "Copiar fórmula de outra equação" traz a conta pronta de qualquer equação da Biblioteca para dentro da que você está editando, e o Aplicar fica travado enquanto a fórmula tiver erro (variável inexistente, parêntese aberto), com o motivo escrito no quadro. 9 testes novos (npm run teste:formula) travam a conta, a marcação de "editada" e a separação dos cenários.',
  ],
  '2.72.1': [
    'CORRIGIDO — O TIFF SAÍA EM CINZA QUANDO VOCÊ QUERIA A IMAGEM COLORIDA. O download seguia, sem avisar, o botão NDVI/Imagem lá de cima: quem estava vendo o NDVI e clicava em "Talhão" recebia o índice de 1 banda (que abre cinza no QGIS, porque é valor e não foto), mesmo querendo a imagem de satélite.',
    'AGORA AS DUAS ESCOLHAS SÃO SEPARADAS E ESTÃO NO PRÓPRIO LUGAR DO DOWNLOAD: primeiro "Imagem real (RGB) · 3 bandas, cor verdadeira", depois "NDVI (valores) · 1 banda — colorir no QGIS". Cada um com seus botões Talhão e Área da tela. Não depende mais de qual modo está aberto no mapa.',
    'A geração da imagem colorida foi conferida ponta a ponta numa cena real do Sentinel-2: saem as 3 bandas identificadas como vermelho, verde e azul, com valores distintos entre si — ou seja, colorida de verdade, e não três cópias da mesma banda.',
  ],
  '2.72.0': [
    'A ABA NDVI GANHOU DOWNLOAD EM GeoTIFF — EM DOIS RECORTES. Logo abaixo dos botões NDVI/Imagem aparece "Baixar GeoTIFF", com duas opções: TALHÃO (recortado exatamente na divisa, que é o dado da análise) e ÁREA DA TELA (o retângulo que você está enxergando, sem recorte nenhum), para quando a pergunta passa da cerca — vizinho, mata, carreador, uma mancha que continua do outro lado.',
    'VALE PARA OS ÍNDICES E PARA A IMAGEM REAL. Índice (NDVI, NDRE, SAVI…) sai como TIFF de 1 banda com o VALOR do índice — abre no QGIS pronto para receber a escala de cor que você quiser, e não uma figura já colorida. A imagem real sai como TIFF de 3 bandas em cor verdadeira, georreferenciado (antes ela só existia como PNG na tela, sem coordenada nenhuma).',
    'A ÁREA DA TELA BUSCA O SATÉLITE DE NOVO, então demora um pouco mais que o download do talhão: o dado guardado cobre só o retângulo do talhão, e o entorno precisa ser lido na hora. O recorte é o próprio retângulo da tela — mexa o mapa até enquadrar o que quer e clique.',
    'RESOLUÇÃO: sempre a da fonte (2 m no CBERS-4A, 10 m no Sentinel-2). Em janela muito ampla o servidor engrossa o pixel sozinho para a malha caber — se você precisa do detalhe fino num pedaço grande, aproxime o zoom e baixe em partes.',
    'Todos os arquivos saem em EPSG:4326 (WGS 84), com área sem dado marcada como nodata — o QGIS já entende e deixa transparente.',
  ],
  '2.71.1': [
    'NA TABELA DO PDF DE CONDUTIVIDADE, "ha" E "%" SAÍAM IGUAIS NAS CINCO LINHAS — e pareciam um valor travado. Não estavam travados: no quintil cada faixa fica com 20% dos pixels POR CONSTRUÇÃO, então área e percentual são obrigatoriamente os mesmos em todas. As duas colunas mais visíveis da tabela não informavam nada.',
    'A COLUNA "%" SAIU E ENTROU "MÉDIA": o valor médio de CEa daquela faixa, em mS/m. Esse sim varia de faixa para faixa e diz o que interessa — quanto o solo conduz em cada zona do mapa. A linha TOTAL passou a mostrar a média geral do talhão. Os hectares continuam, porque é o número que se usa para planejar.',
    'ENTROU TAMBÉM UMA NOTA sob a tabela explicando as duas coisas que o leitor estranharia: por que as áreas são iguais, e por que o total pode não bater com a área cadastrada do talhão (a tabela soma os PIXELS do mapa, que dependem da resolução).',
    'Onde ver: Talhão → aba Condutividade → PDF. 5 testes novos (npm run teste:cea, 16 no total) travam que a média varia entre as faixas, cresce da primeira à última e cai dentro do intervalo de cada uma.',
  ],
  '2.71.0': [
    'A CONDUTIVIDADE GANHOU RELATÓRIO EM PDF, no layout oficial da casa — o mesmo cabeçalho, marca e rodapé de Fertilidade, Zonas e Produtividade. O botão PDF fica ao lado do GeoTIFF, no cartão do mapa interpolado.',
    'O MAPA SAI POR QUINTIL: 5 faixas com 20% da área cada, e os cortes calculados DESTE levantamento. É a leitura que a CEa pede — ela não tem faixa agronômica universal como um nutriente tem ("40% de saturação é baixo"); o que informa é onde, DENTRO do talhão, o solo é mais e menos condutivo. A tira de cor sob o mapa anuncia os cortes reais em mS/m, não limites fixos de uma legenda.',
    'A TABELA À DIREITA fecha em 100%: faixa, intervalo, hectares e percentual, com o TOTAL somado das linhas. Ao lado, o quadro LEVANTAMENTO com versão, pontos medidos, pixel, modelo do variograma, faixa medida, erro (RMSE) e a nota de qualidade — inclusive o aviso de "apto p/ Zonas de Manejo".',
    'AS CORES SAEM DA LEGENDA em uso quando ela tem 5 classes, para o PDF falar a mesma língua da tela. Se a legenda tiver outro número de classes, entra uma paleta de 5 faixas própria.',
    'MAPA UNIFORME NÃO INVENTA FAIXA: se o talhão tiver valores muito repetidos, as faixas que colapsariam são unidas e o relatório declara quantas — melhor dizer "3 faixas" que exibir duas com o mesmo intervalo.',
    'Onde ver: Talhão → aba Condutividade → interpole → botão PDF. 11 testes novos (npm run teste:cea).',
  ],
  '2.70.0': [
    'DÁ PARA BAIXAR O CONTORNO DE UM TALHÃO DIRETO DA LISTA. Na fazenda, cada talhão ganhou um botão verde de download ao lado do "Abrir": clique e escolha KML ou Shapefile (.zip). Antes só existia a IMPORTAÇÃO em massa — para tirar um talhão de dentro do sistema não havia caminho nenhum.',
    'O ARQUIVO JÁ VAI IDENTIFICADO: além do contorno, leva talhão, área em hectares, fazenda, produtor e município. No QGIS isso aparece na tabela de atributos; no Google Earth, na descrição do polígono. O nome segue o padrão da casa — AFSS07_LIMITE.kml — sem ano nem época, porque contorno é cadastro e não muda de safra.',
    'O botão só aparece em talhão que TEM contorno salvo. Sem geometria não há o que exportar, e um arquivo vazio seria pior que botão nenhum.',
    'Detalhes que costumam estragar o arquivo e ficaram travados por teste: talhão com FURO (área excluída no meio) mantém o furo; talhão em duas manchas separadas sai como multipolígono; acento no nome do produtor não vira lixo na tabela (o .cpg declara a codificação); e "&" no nome do talhão não quebra o Google Earth.',
    'Onde ver: Clientes → produtor → fazenda → a lista de talhões. 14 testes novos (npm run teste:talhao).',
  ],
  '2.69.3': [
    'CORRIGIDO — O MAPA SAIA AMARELADO NA TELA (NDVI, fertilidade, dose, produtividade). Achado pelo usuario, comparando a aba NDVI com o PDF: o mesmo EVI saia verde-escuro no relatorio e oliva na tela. Nao era a escala de cores — era uma camada por cima.',
    'A CAUSA: o talhao e marcado no mapa por um preenchimento AMBAR (#f59e0b a 35%). O raster e inserido logo abaixo de `zona-fill` de proposito, para ficar SOB as zonas de manejo (regra da Recomendacao por zona). So que `zona-fill` e criada ANTES de `upload-fill` — entao esse mesmo posicionamento tambem jogava o raster para baixo do ambar, que passava a tingir o mapa inteiro.',
    'SO ACONTECIA EM TALHAO COM ZONAS DE MANEJO. Sem zonas, o raster entra em outro ponto da pilha e fica acima do ambar — por isso o problema passou despercebido tanto tempo.',
    'AGORA O AMBAR SOME enquanto houver qualquer raster na tela, e volta quando ele sai. Ele e um MARCADOR de "o talhao e aqui"; com uma camada de dado desenhada, esse trabalho ja esta feito pelo proprio raster, e o contorno continua marcando o limite. Corrigimos apagando o ambar, nao reordenando as camadas: o raster PRECISA continuar sob as zonas.',
    'Efeito pratico: as cores na tela passam a ser as mesmas do PDF — que sempre esteve certo, porque o relatorio compoe a imagem em canvas proprio e nao tem essa camada.',
  ],
  '2.69.2': [
    'CADASTRO APROVADO QUE CONTINUAVA VENDO "AGUARDANDO APROVAÇÃO" — CORRIGIDO. O caso relatado: produtor aprovado, ATIVO na Central de Acessos, seguia batendo em "Cadastro aguardando aprovação" no celular dele. Aprovar de novo não mudava nada e o botão "Tentar de novo" repetia a mesma resposta.',
    'A ASSIMETRIA QUE CAUSAVA ISSO: quem se cadastra grava "aguardando aprovação" no PRÓPRIO aparelho; quem aprova escreve no aparelho DELE. Na hora de decidir a entrada, o app lia só a cópia local — e nunca perguntava à nuvem. Quando essa cópia local vence a hidratação (o que acontece enquanto a lista de acessos estiver com envio pendente naquele aparelho, porque aí o boot mescla mantendo o local), o celular fica repetindo para sempre um estado que a nuvem já mudou.',
    'AGORA, ANTES DE BARRAR, O APP CONFIRMA NA NUVEM. Se a situação lá é "ativo", a linha da nuvem sobrescreve a local e a pessoa entra — sem ninguém precisar reaprovar. A consulta só acontece quando o local barraria: quem já está liberado entra sem ida de rede a mais. Bloqueio de verdade (bloqueado, rejeitado, ainda pendente na nuvem) continua bloqueando.',
    'A TELA DE BLOQUEIO PASSOU A DIZER DE ONDE VEIO A INFORMAÇÃO: "Situação confirmada na nuvem: ativo/aguardando_aprovacao/…" ou, sem internet, "a situação acima veio deste aparelho". Um print do usuário agora basta para saber se quem barrou foi o cadastro real ou uma cópia velha no celular dele — era exatamente o que faltava para achar este problema.',
    'A confirmação na nuvem já existia para quem não tinha papel nenhum, mas só gravava a linha quando NÃO havia nada local — e é justamente a linha velha que trava o recém-aprovado. Agora a linha da nuvem substitui a local, e só a dele: a lista local não é devolvida inteira, para não sobrescrever o cadastro de terceiros com dados velhos. 5 testes novos (npm run teste:iam, 28 no total).',
  ],
  '2.69.1': [
    'O INDICE DE VEGETACAO NO RELATORIO DE PRODUTIVIDADE AGORA E CLASSIFICADO POR QUINTIL, sempre. A pagina do NDVI/EVI/NDRE deixou de usar a rampa continua 0-1 e passou a ter 5 faixas de area igual, com os cortes calculados da propria cena, faixa de cor discreta e tabela FAIXA / INTERVALO / ha / % fechando em 100%.',
    'POR QUE: a rampa continua obrigava a escolher entre "escala verdadeira" e "escala esticada", e as duas enganam em situacao diferente — a verdadeira apaga a variacao de um talhao uniforme, a esticada pinta de vermelho o minimo do talhao mesmo quando ele e alto. O quintil e auto-escalante: cada faixa e 20% da area, ponto. E faz a pagina do indice falar a mesma lingua da pagina do mapa por quantil.',
    'AS CORES SAEM DA LEGENDA DO INDICE, nao da paleta de produtividade. Mesma estrutura nas duas paginas, paletas distintas — se fossem iguais, o leitor perderia a pista de que esta olhando duas grandezas diferentes.',
    'A AREA DE CADA FAIXA VEM DA MALHA DA CENA, nao da malha da produtividade: Sentinel-2 tem pixel de 10 m e CBERS-4A de 2 m, entao o lado do pixel e derivado dos bounds e do shape de cada imagem.',
    'CORRIGIDO — NAO DAVA PARA ESCOLHER EVI NEM NDRE em "Comparar com NDVI". A selecao era chaveada pela DATA, entao os tres indices da mesma cena tinham o mesmo valor: a lista aparecia com a data repetida tres vezes e a escolha caia sempre no primeiro. Agora e chaveada pela camada, e cada opcao mostra qual indice e.',
    'E OS ROTULOS PARARAM DE MENTIR: o comparador e o PDF lado a lado escreviam "NDVI" fixo mesmo quando a camada era EVI ou NDRE.',
    'BOXPLOT POR ZONA REDESENHADO (pagina 4 do relatorio). O veredito de separacao saiu do rodape e virou um painel a direita, com o eta quadrado em destaque, o percentual explicado e as zonas vizinhas que se confundem em linhas separadas. Com 5 zonas ou mais o texto colidia com os ticks e a legenda do grafico — agora a folga e garantida pela construcao, nao por ajuste fino.',
    'E O GRAFICO FICOU MAIS ESTREITO (de ~155 mm para ~91 mm): as caixas esticadas na largura inteira da pagina atrapalhavam a comparacao entre zonas.',
  ],
  '2.69.0': [
    'O MAPA DE PRODUTIVIDADE GANHOU A ESCALA POR QUANTIL (aba Produtividade, depois de processar). Um par de botões — Absoluta × Quantil (5 faixas) — troca a pintura do mapa na hora, sem reprocessar nada. Na escala absoluta as faixas são as fixas da cultura (soja 2.700/3.600/4.500/5.400 kg/ha); na de quantil, cada faixa cobre 20% da ÁREA do talhão e os cortes são calculados DESTE mapa.',
    'PARA QUE SERVE CADA UMA: a absoluta responde "esta lavoura é boa?" e permite comparar talhões e safras. A de quantil responde "onde, DENTRO dela, está o melhor e o pior?" — e é a que enxerga variação em talhão uniforme, onde a escala absoluta pinta tudo da mesma cor e parece não haver o que manejar.',
    'A LEGENDA MOSTRA OS VALORES REAIS DE CORTE, não faixas redondas: ≤ 4.334 / 4.334–4.481 / 4.481–4.594 / 4.594–4.798 / ≥ 4.798 kg/ha, com a área (ha) e o percentual de cada uma. Os números saem do próprio mapa, então a soma das cinco faixas fecha com a área total.',
    'QUANDO HÁ MUITO VALOR REPETIDO no mapa, dois cortes cairiam no mesmo número. Em vez de inventar uma faixa vazia com intervalo impossível ("4.500 – 4.500"), a faixa é unida e a tela avisa quantas foram — o mapa mostra o número de faixas que realmente existe.',
    'RELATÓRIO DE PRODUTIVIDADE EM PDF — botão novo na aba, e também um por mapa salvo na lista de versões. Sai no layout oficial da casa (o mesmo cabeçalho, rosa dos ventos, escala gráfica, marca e rodapé de Fertilidade e Zonas), com até 4 páginas.',
    'PÁGINA 1 — MAPA ABSOLUTO sobre o satélite, com a barra da legenda da cultura e a faixa de estatísticas: mínimo, médio, máximo, área e produção total.',
    'PÁGINA 2 — MAPA POR QUANTIL, com a tabela das faixas: intervalo real, área em hectares, percentual e produção em toneladas, fechando na linha TOTAL. O total é a SOMA das linhas, para a tabela nunca deixar de fechar por arredondamento.',
    'PÁGINA 3 — NDVI da cena escolhida. Um seletor acima do botão decide qual índice mantido entra (ou nenhum); sem índice mantido, a página simplesmente não sai — nada de página em branco.',
    'PÁGINA 4 — RESUMO ANALÍTICO, o que o QGIS não entregava: estatística completa do raster (mediana, desvio, CV, P5/P25/P75/P95, outliers) e o relatório da limpeza (brutos → filtro → MapFilter → usados → calibração); GRÁFICO DE DISPERSÃO NDVI × produtividade com a reta de tendência e o r de Pearson; BOXPLOT da produtividade POR ZONA DE MANEJO; e um MAPA MENOR com a média de cada zona.',
    'O BOXPLOT E O MAPA POR ZONA usam as zonas como o módulo Zonas as mostra (zoneamento padrão, ou o mais recente, ou o do talhão) — antes bastava não ter clicado em "Tornar padrão" para a plataforma achar que o talhão não tinha zonas. Zona com menos de 30 pixels aparece só como um traço da média, marcada "amostra pequena": um boxplot de 12 pixels engana mais do que informa.',
    'A COR DE CADA ZONA no mapa menor é a faixa de quantil em que a MÉDIA dela cai — a mesma escala da página 2. Assim uma zona na faixa "Alta" está, literalmente, na faixa Alta do talhão. Fecha com uma linha de veredito: quanto da variação as zonas explicam (η²) e quais vizinhas se confundem.',
    'A DISPERSÃO AVISA QUANDO NÃO PODE CONFIAR: menos de 30 pixels em comum vira "amostra insuficiente", e se o recorte do NDVI não coincidir com o do mapa de colheita o gráfico sai marcado como aproximado, com o percentual de sobreposição. Antes esse desencontro passava calado.',
    'O ARQUIVO SAI NO PADRÃO DA CASA (FRNF21_PROD_2026_EP01_SOJA), com ano e época vindos da DATA DA COLHEITA — não da análise de solo, que é de onde o resto do relatório tira o período.',
    'Por baixo: a correlação espacial e a reamostragem entre mapas, que estavam copiadas em três lugares, viraram um módulo só. O r de "Comparar com NDVI" e o ranking de "O que explica a produtividade?" continuam idênticos — há teste travando isso par a par. 43 testes novos (npm run teste:quantis e npm run teste:correlacao).',
  ],
  '2.68.1': [
    'PRODUTOR APROVADO QUE NÃO CONSEGUIA ENTRAR — CORRIGIDO. O caso relatado: produtor novo se cadastra, é aprovado, aparece ATIVO na Central de Acessos com "1 prod · 1 faz" no cartão, e ao entrar bate em "Acesso ainda não vinculado — peça ao escritório para vincular", com um botão Sair e mais nada. Para ele, "não tenho permissão".',
    'A CAUSA: o vínculo do produtor com o cliente mora em DOIS campos que não conversavam. O ANTIGO (um cliente só) é preenchido num único lugar — Acessos → abrir o usuário → aba Dados → "Produtor (cliente)" — e era o ÚNICO que o Portal do Produtor e o filtro de leitura enxergavam. O NOVO (clientes vinculados) é o que a aba Vínculos, o convite e a própria aprovação preenchem, e é o que o cartão conta em "1 prod". Ou seja: o administrador via o vínculo na tela e o produtor não tinha nenhum — e o escopo de leitura dele ficava VAZIO, sem produtor, sem fazenda, sem talhão.',
    'AGORA OS DOIS SÃO A MESMA PERGUNTA: quem foi vinculado por qualquer um dos caminhos entra normalmente, sem ninguém precisar refazer nada — quem já está nessa situação é liberado assim que abrir o app de novo. O campo antigo continua tendo preferência quando está preenchido (foi escolha explícita de um cliente só).',
    'E OS DOIS PASSARAM A ANDAR JUNTOS na gravação: escolher o produtor na aba Dados grava também o vínculo do IAM, e trocar o produtor na aba Vínculos atualiza o campo antigo. Enquanto viviam separados dava para trocar o produtor numa aba e não ter efeito nenhum, porque a outra continuava mandando.',
    'AVISO NOVO na ficha do usuário: produtor sem nenhum produtor vinculado passa a mostrar, em amarelo, "Este produtor não consegue entrar: falta escolher o produtor (cliente) abaixo" — o cartão dizia só "Ativo" e não havia como desconfiar.',
    'Bônus: produtor vinculado a MAIS DE UM cliente agora vê as fazendas de todos eles no portal (antes só as do primeiro). 5 testes novos (npm run teste:iam, 23 no total) travam a regra dos dois campos.',
  ],
  '2.68.0': [
    'A BIBLIOTECA DE LEGENDAS PASSOU A SER ORGANIZADA POR CATEGORIA (Biblioteca → Legendas). Entrou uma barra de separadores no topo — Fertilidade, Micronutriente, Textura do solo, Produtividade / Colheita, Índice de vegetação (NDVI), Condutividade, Altimetria / Elevação, Compactação — cada um com a contagem, e a lista abaixo agrupada pelos mesmos títulos. Clicar num separador mostra só aquela categoria; "Todas" volta a mostrar tudo. Só aparecem as categorias que realmente têm legenda.',
    'ANTES O AGRUPAMENTO ERA POR FONTE ("Fundação ABC · 24", "(sem fonte) · 3"), o que junta num bloco só coisas que não se comparam — pH, NDVI e altimetria lado a lado — e espalha o mesmo assunto por vários blocos. A fonte não se perdeu: virou uma etiqueta no cartão de cada legenda.',
    'DENTRO DE CADA CATEGORIA, ORDEM ALFABÉTICA PELO OBJETO da legenda: Al, B, Ca, CTC, K, Mg, MO, P, pH… A comparação ignora a notação química (carga, índice, ponto e por cento), senão "Ca²⁺" sairia DEPOIS de "Ca%" e "M.O." cairia entre "K%" e "m%" — quem procura Cálcio não acharia onde deveria. Efeito colateral proposital: o elemento e a saturação dele empatam e ficam VIZINHOS (Cálcio logo acima de Saturação por Cálcio).',
    'LEGENDA NOVA JÁ NASCE NA CATEGORIA CERTA: criando pelo atalho "criar legenda para B" (Biblioteca → Perfis), Boro, Zn, Cu, Mn e Fe entram como Micronutriente; argila, areia e silte como Textura do solo; NDVI, condutividade, altimetria e produtividade em cada uma delas. É palpite, não regra — a categoria continua editável na tela da legenda. Enxofre fica em Fertilidade de propósito: é macro secundário, não micronutriente.',
    'Onde conferir: Biblioteca → Legendas. 8 testes novos (npm run teste:legendas, 29 no total) travam a ordem alfabética com notação química, o agrupamento por categoria e a categoria sugerida de cada atributo.',
  ],
  '2.67.0': [
    'ELEMENTO SEM LEGENDA DEIXOU DE SER BECO SEM SAÍDA (Biblioteca → Perfis → editar → "Legendas por elemento"). O caso relatado: clicar na setinha do B (Boro) para escolher a legenda e não acontecer NADA. Não era a setinha quebrada — o campo estava DESABILITADO porque não existe nenhuma legenda cadastrada para Boro, e um campo desabilitado simplesmente não abre. O aviso "— sem legendas cadastradas" ficava escondido dentro do próprio campo fechado, e não havia caminho nenhum dali para criar a legenda que faltava.',
    'AGORA A LINHA VIRA UM BOTÃO: "+ criar legenda para B — nenhuma cadastrada". Clicando, o editor de legendas abre POR CIMA do perfil, já preenchido com o elemento certo — nome, atributo, símbolo, unidade e, principalmente, o ID DO ATRIBUTO (a chave que liga a legenda ao módulo, que antes era preciso adivinhar e digitar à mão na aba Legendas).',
    'E VOLTA SELECIONADA: ao salvar a legenda, você cai de novo no formulário do perfil com ela já escolhida naquela linha — só falta o Salvar do perfil. Por isso o editor abre por cima e não na aba Legendas: trocar de aba desmonta o formulário e levaria junto o nome, a ordem dos elementos e as legendas que você já tinha escolhido.',
    'OS LIMITES DAS CLASSES NASCEM EM ZERO nessa legenda nova, de propósito. O molde do editor traz os valores do Fósforo (6/15/40/80) e, numa legenda de Boro, eles pareceriam plausíveis — dava para salvar sem perceber e sair com um mapa classificado errado. Em zero fica evidente que falta preencher.',
    'Vale para todos os elementos que as 12 legendas oficiais da Fundação ABC não cobrem: S, B, Cu, Mn e a granulometria (AF, AG, Areia, Silte). Elas não vêm prontas porque os limites são decisão agronômica de cada casa — a plataforma não inventa faixa de nutriente.',
  ],
  '2.66.0': [
    'CORRIGIDO — A RECOMENDAÇÃO POR ZONA VOLTAVA SOZINHA PARA INTERPOLAÇÃO. Achado por agentes de teste. A escolha "Por zona de manejo" era esquecida toda vez que você trocava de aba: a aba Recomendações é DESMONTADA ao sair dela. Você escolhia por zona, aplicava, ia na aba Arquivos gerar o Shapefile, voltava — e o seletor estava em "Interpolação" de novo. Clicava em Aplicar e recebia o mapa interpolado, sem nenhuma mensagem. Agora a escolha fica guardada por talhão.',
    'E ELA APAGAVA O TRABALHO POR ZONA. O cenário salvo na nuvem usava o mesmo endereço para os dois modos, então aplicar em interpolação gravava por cima do cenário por zona. Pior: o botão "Gerar book PDF" SEMPRE recalculava por interpolação e regravava tudo — um clique nele desfazia a recomendação por zona de todas as recomendações marcadas. Agora cada modo tem seu próprio cenário e o book respeita o modo escolhido.',
    'O MAPA TAMBÉM ESCONDIA AS ZONAS. A camada do mapa de dose era empilhada ACIMA dos polígonos das zonas — quando os dois apareciam juntos, você via só o raster, com a escadinha de 20 m na divisa. Agora o raster entra POR BAIXO das zonas.',
    'REABRIR UM CENÁRIO agora acerta o seletor sozinho: se aquele cenário foi calculado por zona, a tela abre em "Por zona de manejo".',
    'E SE MESMO ASSIM O MAPA NÃO FOR POR ZONA, A TELA DIZ. Um aviso laranja explica que o resultado veio de interpolação (cenário reaberto ou aplicado em outro modo) ou que o zoneamento mudou depois do cálculo — e manda clicar em Aplicar para recalcular. Nunca mais um mapa interpolado se passando por mapa por zona.',
    'CORRIGIDO — SUPERDOSAGEM NA DIVISÃO EM PASSADAS. Com "Dividir aplicação por limite máximo" ligado no modo por zona, CADA passada saía com a dose INTEIRA no arquivo da máquina, não com a fração. Duas passadas = duas vezes a dose no campo; três = três vezes. Agora a taxa de cada zona se divide junto.',
    'CORRIGIDO — ZONA SEM LAUDO RECEBIA A TAXA DA VIZINHA. O preenchimento da faixa de borda não distinguia "franja da divisa" de "zona inteira sem análise": até metade de uma zona sem laudo era preenchida com a dose das zonas ao lado, e ela nem ficava vazia no mapa para denunciar. Agora o território de uma zona sem laudo fica intocado.',
  ],
  '2.65.0': [
    'AGORA VOCÊ ESCOLHE: a aba Recomendações ganhou o seletor "Modo do mapa — Interpolação × Por zona de manejo", o mesmo par que já existe na Fertilidade. Em talhão com zoneamento ele aparece logo abaixo da importação de laboratório.',
    'POR QUE ISSO FALTAVA: na versão anterior a recomendação só saía por zona se os MAPAS de fertilidade tivessem sido processados em zona. Quem tinha os mapas salvos por krigagem continuava recebendo a dose interpolada, e a tela não dizia o porquê — só a linha "Mapas usados: CTC 20 m · krige" no rodapé denunciava. Amarrar uma coisa na outra era o erro.',
    'A RECOMENDAÇÃO POR ZONA NÃO PRECISA DE MAPA NENHUM. Ela usa o laudo, o zoneamento e a equação: para cada zona, pega o resultado da análise daquela zona e roda a equação. É a mesma conta que você faria na mão, uma vez por zona. Não interpola, não tira média e não depende de como a Fertilidade foi processada.',
    'O mapa desenhado, a legenda, o PDF, a tonelagem e o custo são gerados A PARTIR dessas taxas — nunca o contrário. O número da zona nunca sai de um pixel; o pixel é que sai do número da zona.',
    'Trocar o modo limpa o resultado na tela, para nunca ficar um mapa de um modo com os números do outro.',
  ],
  '2.64.0': [
    'RECOMENDAÇÃO POR ZONA DE MANEJO: A TAXA DE CADA ZONA AGORA É A EQUAÇÃO APLICADA AO LAUDO DAQUELA ZONA. Sem interpolar, sem tirar média e sem grade de 20 m — a mesma conta que você faria na mão: pega o resultado da análise da zona, joga na equação, e o que sai é a taxa da zona. Uma execução por zona.',
    'Isso vale para os TRÊS lugares: o mapa na tela (cada zona pintada pelo seu contorno, com a taxa escrita dentro), o painel "Recomendação por zona" com a lista de taxas, e o SHAPEFILE de taxa variável, que passa a sair com UM POLÍGONO POR ZONA no lugar dos milhares de quadradinhos.',
    'O decimal sai exato. Antes, ler a taxa de volta do mapa fazia o número passar por float32 e andar na última casa; agora a conta não passa por mapa nenhum.',
    'ZONA PARTIDA EM VÁRIAS MANCHAS é UMA zona: as manchas dividem a mesma amostra composta e saem com a mesma taxa. Antes cada mancha podia disputar um número de amostra diferente e a zona sairia com duas taxas.',
    'ZONA SEM LAUDO BLOQUEIA O ARQUIVO, de propósito. Ela sairia como um buraco no mapa de aplicação e a máquina cruzaria aquele pedaço sem aplicar nada. A tela avisa quais zonas estão sem taxa e o botão do Shapefile recusa gerar até você resolver — é a mesma decisão que a aba Prescrições já tomava.',
    'O arquivo de máquina leva só a coluna da dose, como o da aba Prescrições. Coluna a mais, nome longo e texto com acento em DBF já travaram importação em monitor de verdade; o que identifica o mapa fica no PDF e no Excel, que são para gente ler. O arredondamento também mudou: uma dose de 0,8 t/ha continua 0,8 (antes virava 1 — 25% a mais no campo).',
    'O vínculo zona↔amostra é o MESMO da aba Fertilidade (o ponto de coleta que cai dentro da zona é a amostra dela), e o zoneamento usado é o mesmo que ela usa: padrão salvo, senão o mais recente, senão o do talhão. Divergir aí faria o mapa mostrar um valor e a dose sair calculada com o laudo de outra zona.',
    'Recomendação em cima de mapa interpolado continua exatamente como era, na grade — só o caminho por zona mudou.',
  ],
  '2.63.0': [
    'CORRIGIDO — COM A FERTILIDADE PROCESSADA EM ZONA, A RECOMENDAÇÃO SAÍA INTERPOLADA. O mapa de fertilidade mostrava as zonas chapadas, mas a dose saía em manchas suaves, como se os pontos tivessem sido interpolados. Quem trabalha com análise por zona de manejo estava recebendo uma recomendação que não era a da zona.',
    'O MOTIVO: a Recomendação lê uma gaveta separada, com os mapas na resolução da dose, e essa gaveta só era escrita pelo caminho da interpolação. O mapa que sobrou de um processamento anterior continuava lá e alimentava a conta. Agora o modo zona escreve nela também — e, entre dois mapas, vale o que você processou por último.',
    'A DIVISA NÃO BORRA. O mapa da dose é montado de novo a partir das zonas, em vez de tirar média do mapa fino: a média misturaria as duas zonas na célula que cai em cima da divisa e inventaria um valor que não é de zona nenhuma. Na faixa da borda, a célula copia o valor da zona mais próxima — nunca uma média entre duas.',
    'E TODOS OS ATRIBUTOS PASSARAM A DIVIDIR A MESMA MALHA, a do talhão. Antes cada nutriente seria desenhado sobre as zonas que tivessem valor no laudo: um laudo que trouxe potássio em 4 zonas e CTC em 3 gerava malhas diferentes e a equação quebrava — ou, pior, batia por acaso e a dose saía deslocada sem avisar.',
    'Quando a equação mistura mapa por zona com mapa interpolado, a mensagem agora diz exatamente isso e manda processar todos os atributos no mesmo modo (antes falava em "pixel diferente", que não resolvia nada).',
    'Para valer nos talhões que você já processou: abra a aba Fertilidade em "Processar em zona" e rode "Processar tudo" de novo.',
  ],
  '2.62.0': [
    'O LABORATÓRIO PASSA A MANDAR O LAUDO DIRETO PARA A PLATAFORMA, SEM NINGUÉM CARREGAR ARQUIVO. Terminou as análises, o sistema dele faz uma chamada e o laudo aparece na aba Fertilidade do talhão certo, com as unidades já convertidas. O caminho por arquivo continua igual e não muda em nada — a novidade é a porta a mais.',
    'CADA GRADE GANHOU UM CÓDIGO DE REMESSA (INV-XXXX-XXXX), criado na primeira vez que você gera as etiquetas ou a conferência. Ele sai impresso na etiqueta e em toda linha da planilha de conferência, e é o que o laboratório devolve para dizer de qual talhão é o laudo. Sem ele a plataforma teria de adivinhar pelo NOME do talhão — e talhão homônimo colocaria o laudo no lugar errado, calado, virando mapa e virando dose de adubo.',
    'O laboratório tem um endereço só para TESTAR: ele manda o laudo, recebe de volta o que a plataforma entendeu (amostras, variáveis, avisos) e nada é gravado. É onde o time de TI deles resolve formato, unidade e numeração antes da primeira remessa de verdade.',
    'Reenviar o mesmo laudo ATUALIZA em vez de duplicar — laudo repetido distorceria mapa e recomendação sem dar erro nenhum.',
    'Cada laboratório recebe uma chave própria, que pode ser revogada a qualquer momento e só enxerga as remessas da sua empresa.',
    'Onde ver: o código de remessa aparece nas etiquetas e na conferência (Talhão → Amostragem → grade salva). Para liberar um laboratório, fale com o administrador: é preciso aplicar docs/api-laudos.sql e emitir a chave.',
  ],
  '2.61.0': [
    'O ADMINISTRADOR PASSOU A GERAR CONVITE E APROVAR CADASTRO — antes tudo isso era só do dono da conta. Na Central de Acessos (Biblioteca → Acessos), quem tem papel Administrador agora vê os botões "Novo link", "Convite para uma pessoa", Copiar link, Renovar e Cancelar, e o bloco "Aprovar como" nos cadastros pendentes. Não era uma regra de segurança e sim uma incoerência: a matriz de permissões já dizia que o Admin pode criar, editar e APROVAR usuários — a tela é que estava inteira travada num "sou o dono?", e o administrador entrava só para olhar.',
    'A TELA AGORA OBEDECE À MATRIZ, ação por ação: usuarios.criar libera os convites; usuarios.aprovar libera aprovar/rejeitar quem está aguardando; usuarios.editar libera dados, papel, categoria, vínculos, permissões, bloquear e redefinir senha. Como é a matriz que manda, dá para soltar ou tirar cada uma dessas coisas de alguém específico pela aba Permissões do próprio usuário — inclusive de quem não é Admin.',
    'O QUE CONTINUA SÓ DO DONO: remover o acesso de alguém (usuarios.excluir), o nome da empresa e os planos do portal, a biblioteca de Perfis de permissão e a matriz padrão dos papéis (usuarios.administrar). É o desenho que o papel já anunciava — "Admin: tudo, menos trocar o Owner".',
    'TRAVA NOVA: o registro de quem é OWNER só pode ser editado ou removido pelo próprio dono. Sem isso, abrir a edição ao Admin abriria junto o caminho para rebaixar o dono — a lista de papéis atribuíveis não oferece "Owner" de volta, e a conta ficaria sem dono, sem caminho de volta pela tela.',
    'Onde conferir: Biblioteca → Acessos. Entrando como Administrador, a aba Convites tem os botões de gerar/copiar/renovar/cancelar e a aba Pendentes traz o "Aprovar como" com categoria, papel e o acesso definido no convite. 7 testes novos (npm run teste:iam, 18 no total) travam quem pode o quê, inclusive a trava do dono.',
  ],
  '2.60.0': [
    'AMOSTRAGEM — OS PONTOS DE 20-40 cm AGORA FORMAM UMA MALHA COERENTE. Antes eles saíam espalhados sem lógica no mapa: pares grudados de um lado e regiões grandes sem nenhum ponto. Agora o sistema monta uma MALHA PRÓPRIA, mais grossa (mesma rotação e mesma distância de borda da grade principal), e encaixa cada nó dela no furo de 0-20 cm mais próximo. O resultado tem o espaçamento regular de uma grade de verdade, mas todo ponto 20-40 continua caindo exatamente em cima de um ponto 0-20 — como tem que ser.',
    'A CAUSA DA BAGUNÇA: o modo "Regular", que era o padrão, espaçava os ÍNDICES dos pontos na ordem serpentina (a ordem de caminhamento) — e espaçar na ORDEM não é o mesmo que espaçar no MAPA. Ao virar a linha da serpentina, duas escolhas seguidas caíam coladas uma na outra. Por isso o modo novo, "Equilibrado", passou a ser o PADRÃO; o "Regular" continua disponível para quem quiser a malha fixa.',
    'BARRA "VARIAÇÃO" (0-100%) + BOTÃO "NOVA DISTRIBUIÇÃO": a variação gera outras malhas igualmente coerentes, para você escolher visualmente a que preferir — em 0% o resultado é fixo, e mesmo em 100% nunca vira sorteio. Os pontos 0-20 cm (a grade principal) NÃO mudaram.',
    'MEDIDO NO TALHÃO FRNFI 21 (78 furos, 20 deles em 20-40 cm): a irregularidade do espaçamento caiu de 35,6% para ~12%, e a menor distância entre dois pontos 20-40 subiu de 63 m para ~120 m. Uma bateria automática de 210 casos (talhões quadrado, em L, faixa estreita, com buraco, lobos separados e o talhão real, de 10% a 50% dos pontos) dá nota média 99,8/100 de qualidade de distribuição, sem nenhum caso reprovado.',
    'DESEMPENHO: a escolha dos pontos foi reescrita com índice espacial (grade de baldes) no lugar de comparar todos os pontos contra todos. Num talhão grande (2.200 pontos) a conta caiu de ~1,0 s para ~0,4 s, e num talhão com contorno muito detalhado (KML de GPS com 20 mil vértices) de ~2,4 s para ~0,4 s. A grade e a escolha dos pontos também passaram a ser recalculadas em separado, então mexer nos controles de profundidade não regera a grade inteira.',
  ],
  '2.59.0': [
    'A EDIÇÃO DE PONTOS DAS ZONAS DE MANEJO FICOU IGUAL À DO GRID COMUM: a caixa "Edição manual" agora tem os três modos — MOVER, ADD e REMOVER. Antes só dava para arrastar; agora dá para acrescentar e tirar pontos direto no mapa. Onde ver: Amostragem → Zona de Manejo → Editar pontos no mapa.',
    'ADD: clique dentro de uma zona e o ponto entra como o ÚLTIMO daquela zona (o app descobre sozinho em qual zona você clicou). Clique fora de qualquer zona não faz nada — todo ponto precisa pertencer a uma zona para receber número e saco. REMOVER: clique num ponto e ele sai.',
    'A NUMERAÇÃO POR ZONA SE REFAZ SOZINHA E SEM BURACO. Tirou o ponto 1-2? Os seguintes viram 1-2, 1-3… e as OUTRAS zonas não mudam (o 2-1 continua 2-1). Na amostra composta, o ponto novo já herda o saco da sua zona; nos pontos individuais, as amostras se renumeram 1..N. O contador de amostras e etiquetas no resumo acompanha na hora.',
    'MOVER continua sem mexer na numeração — só a posição muda, e o ponto segue preso dentro da própria zona, como antes. Trocar um parâmetro (densidade, padrão, borda) regenera o grid e descarta a edição não salva.',
    'GRADE ANTIGA (salva antes da numeração por zona) aceita só o Mover — Add e Remover ficam ocultos nela, porque sem o número da zona não dá para renumerar sem embaralhar os sacos. Basta gerar e salvar a grade de novo para liberar os três modos.',
  ],
  '2.58.1': [
    'A ABA DO NAVEGADOR GANHOU A MARCA DA INVICTA. Até agora o ícone era o do template do Next.js (aquele triângulo preto da Vercel) — nunca tinha sido trocado desde que o projeto nasceu. No lugar entrou a folha da INVICTA, com o degradê verde e as nervuras em rede, desenhada em vetor.',
    'É UM DESENHO PRÓPRIO, não a logo encolhida: a marca original tem detalhe demais para 16 pixels e viraria um borrão. Esta versão tem a folha preenchendo o quadro e só três nós, então continua legível na aba, no favorito e no histórico — testada nos dois temas, barra clara e escura.',
    'Entrou também o ícone de 180 px para quando alguém adiciona a plataforma à tela de início do iPhone ou iPad, com fundo azul da marca (o iOS não respeita transparência e deixaria fundo preto).',
    'O ícone do app de COLETA não mudou: ele tem o alvo de GPS de propósito, para se distinguir da plataforma na tela do celular.',
    'Se a aba ainda mostrar o ícone antigo, é cache do navegador — Ctrl+Shift+R (ou Cmd+Shift+R) resolve.',
  ],
  '2.58.0': [
    'O GRID DAS ZONAS DE MANEJO GANHOU A EDIÇÃO DE POSIÇÃO: dá para arrastar os pontos no mapa e salvar onde você largou, como já existia no grid comum. Botão "Editar posições" → arraste → "Salvar alterações" (grade aberta pelo olho) ou "Salvar grade de zonas" (simulação nova).',
    'CADA PONTO FICA PRESO NA SUA PRÓPRIA ZONA — não só dentro do talhão. Ao tentar arrastar para a zona vizinha, o ponto para na divisa; zona com várias manchas aceita o ponto em qualquer pedaço dela. Se a zona do ponto não existir mais (grade antiga), ele é preso ao menos no contorno do talhão, nunca solto.',
    'MOVER NÃO MEXE NA NUMERAÇÃO: o número da amostra, a zona e o rótulo (1-1, 2-3…) continuam iguais — só a posição muda. As coletas já feitas em campo não se perdem. Trocar um parâmetro (densidade, padrão, distância da borda) regenera o grid e descarta a edição não salva, como no grid comum.',
    'Onde ver: Amostragem → Zona de Manejo → Editar posições.',
  ],
  '2.57.0': [
    'CORRIGIDO — COM O INTERPOLADOR DA MÁQUINA LIGADO, SATÉLITE E ALTIMETRIA PARAVAM DE FUNCIONAR. Quem marcava "Usar interpolador desta máquina" e deixava a janela aberta não conseguia mais gerar NDVI nem MDE. O motivo: o atalho mandava TODAS as chamadas para o programa da sua máquina, inclusive as que ela não tem como atender.',
    'A REGRA AGORA É POR TIPO DE TRABALHO. Vai para a sua máquina só o cálculo puro, feito em cima dos dados que o app manda: interpolação dos mapas, limpeza da condutividade, limpeza da colheita e zoneamento — que é justamente o trabalho pesado que o interpolador local existe para tirar da nuvem.',
    'CONTINUAM SEMPRE NA NUVEM: satélite (NDVI e índices), altimetria (MDE) e a IA. As duas primeiras precisam baixar imagem e modelo de elevação de fora; a IA precisa de uma chave que só existe no servidor. Nenhuma delas jamais funcionaria na sua máquina — e agora nem tenta.',
    'A NUVEM TAMBÉM VOLTOU A SER "ACORDADA" NO MODO LOCAL. Antes, com o interpolador ligado, o app parava de tocar no servidor — então a primeira imagem de satélite pegava a nuvem dormindo e demorava ~1 minuto. Agora ela é acordada de qualquer jeito.',
    'Em Configurações, quando o interpolador local está no ar, uma linha explica o que passa por ele e o que segue na nuvem. 8 testes automáticos travam esse roteamento (npm run teste:rota).',
  ],
  '2.56.1': [
    'A ORDEM DOS ELEMENTOS NO PERFIL VOLTOU A GRUDAR (Biblioteca → Perfis → editar → setinhas ao lado de cada elemento). O caso relatado: reordenar, salvar, reabrir o perfil e encontrar a ordem de antes. Desta vez o culpado NÃO era a conta das setas (aquela já está travada por teste desde a 2.48.2) — a gravação acontecia certinha; quem desfazia era a HIDRATAÇÃO DA NUVEM terminando depois.',
    'O QUE ACONTECIA: ao abrir o app, o boot tira um retrato da nuvem (duas idas de rede, paginadas — segundos numa conta grande) e só então regrava o armazenamento local. Quem mexia NESSE intervalo — e a Biblioteca fica a dois cliques da abertura — tinha a edição sobrescrita por um retrato tirado antes dela existir. As duas defesas que havia não pegavam este caso: o boot COMPLETO respeitava a chave com envio PENDENTE, mas o envio da edição costuma confirmar antes de o boot terminar (aí a pendência já foi limpa e o retrato velho passa por cima); o boot INCREMENTAL — o caminho normal de quem já abriu o app antes — checava as pendências ANTES da rede e não checava mais nada na hora de gravar.',
    'E POR ISSO SE REPETIA: uma coleção só entra no "delta" do boot seguinte quando alguém a alterou — e quem a alterou foi você, na sessão anterior. Resultado: toda vez que a ordem era corrigida, o boot da próxima abertura tinha em mãos exatamente o delta capaz de devolver a ordem antiga. Corrigia, voltava, corrigia, voltava.',
    'A REGRA NOVA É UMA SÓ: se a chave foi gravada localmente DEPOIS que o boot começou, o local vence — o retrato da nuvem não a toca, a marca d\'água do boot incremental não avança (para o próximo boot reconciliar) e a chave é reenviada ao fim da hidratação. Vale para TODAS as coleções, não só o catálogo de elementos: qualquer edição feita nos primeiros segundos depois de abrir o app (produtor, fazenda, legenda, equação, grade) corria o mesmo risco de sumir sozinha.',
    'Onde conferir: Biblioteca → Perfis → editar um perfil → setinhas em "Legendas por elemento". Reordene, salve, feche e reabra — e, para o teste valer, reordene logo depois de abrir o app, que é quando a corrida acontecia. 7 testes novos (npm run teste:janela) travam a regra da janela do boot; os 13 da conta das setas (npm run teste:ordem) seguem passando.',
  ],
  '2.56.0': [
    'CAMADA COM POUCOS PONTOS NÃO REPROVA MAIS O MAPA — ELA CAI SOZINHA PARA IDW. A krigagem precisa de 4 amostras para ajustar o variograma, e é comum o laudo medir a 20-40 em só parte dos pontos. Na v2.53.0 o app passou a barrar esse caso e a explicar a saída; agora ele não barra mais — reconhece, interpola por IDW e avisa quais mapas saíram assim.',
    'A troca é POR MAPA (variável × profundidade), não na chave da tela: a 0-20, que costuma ter pontos de sobra, continua krigada. Trocar o seletor levaria as duas camadas junto, que é justamente o que não se quer em fertilidade.',
    'O mapa auxiliar de 20 m da Recomendação segue a mesma decisão. Sem isso, a camada curta aparecia desenhada na tela e a dose ficava sem mapa — a prescrição saía torta só naquela profundidade.',
    'Vale também para a Compactação, que tinha o mesmo problema na camada mais funda.',
    'Onde ver: Talhão → Fertilidade → Processar (o aviso amarelo aparece abaixo do botão, e o selo do mapa mostra "IDW · N pts").',
  ],
  '2.55.0': [
    'A ETIQUETA GANHOU O CABEÇALHO PRODUTOR — FAZENDA no topo, em NEGRITO, e a sigla do talhão também passou a NEGRITO. Quem recebe o saco no laboratório identifica de quem é sem abrir o sistema. Vale para as etiquetas das grades por Zona e das grades por Grid. Quando não há produtor ou fazenda cadastrados, a linha some sozinha (não sai " — " solto).',
    'Onde ver: Amostragem → gerar/abrir uma grade → Etiquetas (PDF).',
  ],
  '2.54.0': [
    'A GRADE DE ZONAS PASSOU A NUMERAR OS PONTOS POR ZONA — 1-1, 1-2, … 2-1, como no mapa que o campo já usa. Antes, ao salvar a grade, a numeração se perdia: o olho no mapa e o APP DE CAMPO mostravam uma contagem corrida de 1 a 50, e o operador não sabia em que zona estava. O número do ponto agora é gravado na grade e é o MESMO em todo lugar: simulação, mapa, app de campo, KML/SHP e etiquetas.',
    'AS ETIQUETAS VOLTARAM PARA A GRADE SALVA: cada grade de zonas tem o botão "Etiquetas", como a aba Grid sempre teve — salvar deixou de ser o fim da chance de reimprimir. Na amostra COMPOSTA sai uma etiqueta por zona (01, 02, 03, 04), que é o saco que chega ao laboratório; em pontos individuais, uma por ponto, com o mesmo número que o app mostra. O rodapé agora traz Ano e época, para não confundir a reimpressão com a do ano passado.',
    'O NÚMERO DA AMOSTRA E O NÚMERO DO PONTO SÃO COISAS DIFERENTES, de propósito: o laboratório continua recebendo um NÚMERO (na composta, o número da zona), e o "1-1" é só o que o operador lê. Misturar os dois quebraria a volta do laudo — o leitor de laudo descarta os não-dígitos, e "1-1" viraria 11.',
    'CORRIGIDO ANTES DE CHEGAR AO CAMPO (achado em revisão): zona partida em duas manchas ia virar uma "zona 12" inexistente, porque o segundo pedaço tem identidade interna "01_2". Agora as manchas da mesma zona contam como UMA zona — o sequencial corre por ela inteira e sai um saco só. E dois pontos nunca recebem o mesmo número, mesmo com zonas cadastradas como "1" e "01".',
    'Grade salva ANTES desta versão não tem a numeração por zona: o botão de etiquetas avisa em vez de imprimir 50 sacos para 4 compostas — gere e salve a grade de novo. As coletas já feitas em campo não se perdem (a chave delas não mudou), e a grade comum (Grid) continua exatamente como era, inclusive nos arquivos exportados. 15 testes novos: npm run teste:gradezonas.',
  ],
  '2.53.0': [
    'POUCAS AMOSTRAS NA CAMADA: AGORA O APP AVISA ANTES, E DIZ O QUE FAZER. Caso real (FCDBV 01, laudo Fundação ABC): o arquivo trazia 12 amostras em 0-20 e apenas 3 em 20-40 — os pontos 3, 7 e 11, ou seja, a camada profunda foi amostrada em 1 de cada 4 pontos. Com 3 amostras a KRIGAGEM não tem como ajustar um variograma, então as 15 variáveis de 20-40 falhavam, uma a uma, com um erro técnico vindo do servidor.',
    'Medimos o limite no próprio interpolador: com 3 pontos a krigagem falha SEMPRE; a partir de 4 ela funciona. O app passa a barrar esse caso antes de mandar para o servidor e explica na hora: "só 3 amostras nesta profundidade — a krigagem precisa de 4. Troque o interpolador para IDW em Configurações da interpolação, ou amostre mais pontos nesta camada". O IDW funciona com 3 pontos, então há saída se você quiser o mapa mesmo assim.',
    'NO MESMO LAUDO, A ARGILA 0-20 TAMBÉM FALHAVA por outro motivo: a coluna vinha em branco nas linhas de 0-20 (só as de 20-40 tinham valor). Esse caso já é explicado desde a versão anterior — "o laudo tem 12 linha(s) em 0-20, mas nenhuma com valor desta variável".',
    'Onde ver: Talhão → Fertilidade → Processar tudo. Os avisos aparecem agrupados por motivo, logo abaixo dos botões.',
  ],
  '2.52.0': [
    'AGORA O APP DIZ POR QUE UM MAPA NÃO SAIU. O aviso do "Processar tudo" era só uma lista de nomes ("Não processou: pH 20-40, P 20-40, K 20-40…") e por trás de todos eles havia uma única mensagem interna: "menos de 3 pontos". Com 15 variáveis reprovadas de uma vez numa profundidade, não dava para saber se o problema era o laudo, a grade ou a numeração das amostras — e cada um desses tem conserto diferente.',
    'A mensagem passou a separar o motivo e a agrupar as variáveis por ele. Os casos que ela distingue: o laudo não tem nenhuma linha naquela profundidade; tem linhas, mas nenhuma com valor daquela variável (coluna em branco no arquivo); tem menos de 3 amostras com valor (o mínimo para interpolar); o talhão não tem grade com pontos; há mais amostras do que pontos na grade; ou os números do laudo não batem com os da grade.',
    'Exemplo prático: um talhão em que todo o 20-40 falhava agora responde de cara se as linhas de 20-40 vieram sem valor no arquivo do laboratório — que é o caso mais comum quando só a camada superficial foi analisada.',
    'Onde ver: Talhão → Fertilidade → Processar tudo. O aviso aparece logo abaixo dos botões.',
  ],
  '2.51.0': [
    'A ETIQUETA PIMACO A4350 (55,8 × 99,0 mm — 10 por folha) VIROU O PADRÃO DAS AMOSTRAS. Ela entrou na lista de folhas e já vem selecionada: quem nunca mexeu na configuração e quem já tinha outra folha gravada passam para a A4350 automaticamente, uma vez só (o ajuste fino H/V volta a zero, porque calibração de outra folha não vale nesta). Quem preferir outro modelo troca em Configurações e a escolha fica valendo.',
    'O CONTEÚDO DA ETIQUETA CRESCEU JUNTO COM ELA. Antes só o número acompanhava o tamanho da folha — talhão, profundidade e ano ficavam presos num corpo fixo e, numa etiqueta grande, viravam letrinhas ao lado de um número gigante. Agora os quatro campos crescem na mesma proporção, com a mesma cara de sempre. As folhas menores (A4361, A4260, A4355, A4356, 6181) saem exatamente iguais ao que já saíam.',
    'NOME DE TALHÃO COMPRIDO NÃO QUEBRA MAIS EM DUAS LINHAS. Antes o nome longo pulava para uma segunda linha e invadia o espaço do número da amostra; agora ele diminui até caber em uma linha só.',
    'Onde ver: Configurações → Etiquetas (ou Biblioteca → Preferências de Análise → aba Etiquetas). As etiquetas saem em Talhão → Amostragem → Gerar etiquetas, e no simulador de zonas.',
  ],
  '2.50.6': [
    'O APP DE COLETA MOSTRA AS ZONAS DE MANEJO NO MAPA. Quando a grade foi montada por zonas, o mapa do campo passa a desenhar as zonas coloridas, com as divisas e o número de cada uma — nas mesmas cores da plataforma. É a divisa que diz de qual zona é cada ponto (na amostra composta, uma amostra por zona), e até agora quem estava no campo não enxergava isso no aparelho.',
    'A camada vem ligada, com uma legenda das classes logo acima da barra do ponto, e um botão novo na coluna do mapa liga e desliga. As zonas ficam por baixo dos pontos e da sua posição — não cobrem nada.',
    'Onde ver: app de Coleta → abrir uma grade feita por zonas → mapa.',
  ],
  '2.50.5': [
    'AS VERSÕES ANTERIORES DA PRESCRIÇÃO FICAM SEMPRE À VISTA. Saiu o botão "ver N versão(ões) anterior(es)" / "ocultar": abaixo da versão atual, as anteriores aparecem listadas direto (discretas, com a barra à esquerda), com os mesmos botões de abrir, SHP, Excel, PDF e excluir.',
    'Onde ver: Talhão → Prescrições → PRESCRIÇÕES SALVAS (e o mesmo cartão no rodapé da aba Nova).',
  ],
  '2.50.4': [
    'AS DIVISAS DO MAPA POR ZONA SAEM NO PDF DE FERTILIDADE — e no MESMO ESTILO do mapa de prescrição: divisa interna escura entre as zonas, limite do talhão branco por cima. O relatório monta a própria imagem do mapa (não é a tela capturada) e ignorava as linhas; agora desenha as divisas por cima do raster, nas duas profundidades. O mapa na tela acompanhou o mesmo padrão (divisa escura).',
    'Onde ver: Talhão → Fertilidade → mapa processado em zona → Gerar PDF (Fertilidade). Vale para mapas por zona já processados — nada precisa ser reprocessado.',
  ],
  '2.50.3': [
    'O VALOR DA ANÁLISE FICOU CENTRALIZADO NA ZONA. O ponto do rótulo era a média dos vértices do contorno — o lado da divisa com mais vértices puxava o número para si, e zonas vizinhas acabavam com os valores encostados um no outro; em zona recortada o rótulo podia até cair FORA dela, em cima da vizinha. Agora o ponto é o centroide por área da MAIOR parte da zona e, se a forma é côncava, ele desliza para dentro — cada valor no centro da sua zona, afastado dos vizinhos.',
    'Vale para o mapa por zona, os rótulos das zonas nos relatórios e mapas já processados (o ponto é calculado na hora de mostrar). 3 testes novos em npm run teste:zonas.',
  ],
  '2.50.2': [
    'O MAPA POR ZONA GANHOU AS DIVISAS: cada zona aparece contornada em branco por cima do preenchimento, como no mapa de referência de campo. Sem as linhas, zonas vizinhas com valores parecidos (mesma cor) viravam uma mancha só e não dava para ver onde uma termina e a outra começa. As divisas saem no mapa e, por consequência, na captura que vai para o PDF de fertilidade.',
    'Onde ver: Talhão → Fertilidade → Processar em zona → processar um mapa. Vale também para mapas por zona já processados — as divisas são desenhadas na hora de mostrar, nada precisa ser reprocessado.',
  ],
  '2.50.1': [
    'CORRIGIDO — O "MODO DO MAPA" NÃO APARECIA em talhão com zoneamento salvo mas nunca marcado como Padrão. A Fertilidade lia as zonas só do retrato guardado no talhão (que só existe depois de "Tornar padrão"); agora resolve como o módulo Zonas mostra no mapa: zoneamento Padrão > o mais recente > retrato. Onde ver: Talhão → Fertilidade — o seletor Interpolação × Processar em zona aparece logo acima das Configurações da interpolação.',
  ],
  '2.50.0': [
    'FERTILIDADE GANHOU O "MODO DO MAPA": Interpolação × Processar em zona. Quando o talhão tem zonas de manejo, um seletor aparece acima das configurações. Em INTERPOLAÇÃO tudo segue como sempre (krigagem/IDW, pixel, variograma). Em PROCESSAR EM ZONA o mapa NÃO é interpolado: cada zona é preenchida com o valor do seu ponto de amostragem, na escala de cores da legenda — mapa constante por zona, como a amostragem composta pede. As configurações de interpolação somem nesse modo, porque não valem nada nele.',
    'O VÍNCULO ZONA ↔ AMOSTRA PASSOU A SER PELA LOCALIZAÇÃO: o ponto de amostragem que cai DENTRO da zona é o que dá o valor dela. Antes o pareamento era só pela ordem (1ª zona ↔ menor número), que numa grade de pontos importada casava errado. A ordem ficou de reserva para zona sem ponto dentro, e a tabela continua editável por cima da sugestão.',
    'O padrão por importação é o esperado: amostragem feita POR ZONA abre em "Processar em zona"; grade de pontos abre em "Interpolação". "Processar tudo" e "Processar só o selecionado" funcionam igual nos dois modos, e o mapa por zona salva e alimenta a Recomendação como qualquer outro. Onde ver: Talhão → Fertilidade, num talhão com zonas de manejo.',
    'PRESCRIÇÃO NOVA JÁ NASCE NA CONFIGURAÇÃO DE CAMPO: cenário "Total fixo — consome o disponível", total POR HECTARE (kg/ha, sementes/ha) e Parâmetros da semente com 98% de germinação e 60.000 sementes/saco. Era tudo escolha manual a cada prescrição — e digitar uma dose por hectare no campo de total absoluto fazia a prescrição sair dezenas de vezes menor sem aviso. Prescrição já salva mantém como foi gravada.',
    'ZONAS DE MANEJO SEM ESCADINHA E SEM ZONA QUEBRADA (correção no servidor de processamento). O "Gerar zonas" entregava as divisas em degraus do tamanho do pixel (medido no campo: mediana de 5 m, o próprio pixel) e soltava cacos de vetorização como zonas numeradas de 25–215 m²; e o "Suavizar limites" podia devolver zona com autointerseção que passava pela validação — ela conferia a geometria em metros e entregava em graus. Agora a geração já sai com a divisa lisa (a divisa anda no máximo ~1 pixel, dentro da incerteza do raster), os cacos são absorvidos pela vizinha e a validação confere a geometria no sistema que sai. 9 testes novos: npm run teste:geometria.',
  ],
  '2.49.0': [
    'O RELATÓRIO DA PRESCRIÇÃO PASSOU A DIZER A DOSE EM MAIS DE UMA RÉGUA, sempre. População por hectare e sementes por metro linear saem juntas, seja qual for a unidade em que a prescrição foi feita — e num mapa feito em sementes por METRO QUADRADO, o m² continua sendo a régua do arquivo e as outras duas o acompanham. Era o mesmo número medido de um jeito só: quem lia o PDF em sementes/m não tinha como saber a população por hectare sem fazer a conta na calculadora.',
    'A TABELA "DOSES POR ZONA" GANHOU A COLUNA DA RÉGUA IRMÃ, zona a zona, e o quadro RESUMO fecha com a média final nas duas (ou três) réguas. O Excel saiu igual: as mesmas colunas na aba "Doses por zona" e as linhas de dose final média na aba "Resumo".',
    'O QUE APARECE NA RÉGUA IRMÃ É A DOSE FINAL — a ajustada pela germinação, a que a máquina realmente aplica —, não a população desejada. É a que o campo chama de "população final".',
    'CORRIGIDO DE QUEBRA: os extremos da rampa de cor do mapa mostravam a população DESEJADA enquanto os polígonos eram rotulados com a dose AJUSTADA. O mapa dizia "5" no polígono e a legenda "4,51 a 5,09" logo abaixo — dois números para a mesma cor. Agora a legenda descreve o que está desenhado, e no centro dela aparece a mesma faixa na régua irmã.',
    'A conversão é EXATA e acontece na hora de ver e exportar: nada do que está salvo muda, e refazer a prescrição só para trocar de régua deixou de ser necessário. Sem o espaçamento entre linhas cadastrado (Parâmetros da semente), o metro linear é omitido em vez de chutado — sem ele a conversão seria adivinhação. Adubo, calcário e orgânico não têm régua irmã e seguem como estavam.',
    'A tabela agora ajusta largura de coluna e corpo de fonte ao número de colunas que existe, então nada transborda para a coluna vizinha quando as três réguas aparecem juntas. Onde ver: Talhão → Prescrições → abrir uma prescrição → PDF/Excel. 12 testes novos em npm run teste:prescricao (95 no total).',
  ],
  '2.48.2': [
    'CORRIGIDO — AS SETINHAS DE ORDENAR PARARAM DE FUNCIONAR na v2.48.1. Junto com a correção do "pulo para o topo" entrou uma gravação em lote da nova ordem, e era ela que travava: nada se movia e nada dava erro. A gravação voltou a ser a de sempre, item por item; a correção do pulo continua de pé.',
    'Onde ver: Biblioteca → Perfis → Legendas por elemento. As setas voltam a andar um degrau por clique.',
  ],
  '2.48.1': [
    'CORRIGIDO — A SETINHA DE SUBIR JOGAVA O ELEMENTO PARA O TOPO em vez de andar um degrau. Com a lista em Textura · MO · pH, clicar em subir no pH devolvia pH · Textura · MO. Como a ordem que se formava não era a pedida, parecia que a Biblioteca não estava gravando.',
    'A CAUSA: a troca permutava os dois valores de "ordem" entre os vizinhos, e isso só funciona se toda variável tiver uma ordem diferente. Quando várias empatam — e empatavam —, quem decide a posição na tela passa a ser o desempate por sigla, e o valor recebido na permuta levava o elemento para qualquer lugar da lista.',
    'AGORA A LISTA INTEIRA É RENUMERADA a cada movimento, então não sobra empate para herdar e o item anda exatamente um degrau. Elementos desativados continuam onde estavam: a seta pula por cima deles em vez de trocar de lugar com eles.',
    'DE QUEBRA, EDIÇÃO DE VARIÁVEL DUPLICADA: se a mesma variável existisse duas vezes no catálogo (corrida de sincronização entre duas máquinas), a gravação acertava só uma e a leitura podia mostrar a outra — a edição "não pegava". Agora grava em todas as cópias.',
    'A ordem é gravada em UMA tacada só: antes, renumerar um catálogo bagunçado seria uma gravação e uma subida à nuvem por variável.',
    'Onde ver: Biblioteca → Perfis → Legendas por elemento. 13 testes novos (npm run teste:ordem) travam a regra, inclusive reproduzindo o pulo relatado.',
  ],
  '2.48.0': [
    'COMPACTAÇÃO AGORA INTERPOLA EM 5 × 5 m, FECHANDO O PADRÃO DO APP. Era a última aba que ainda gerava em 20 m — e sem nenhuma opção de escolha, o valor estava fixo no código. Fertilidade, Condutividade e Compactação agora saem todas em 5 m por padrão.',
    'E GANHOU O SELETOR DE PIXEL: um campo "Pixel" logo acima do botão Interpolar, com as mesmas opções da Condutividade (de 2 a 30 m), com 5 m marcado como padrão.',
    'Vale para os PRÓXIMOS processamentos: os mapas de compactação já salvos continuam como estão — reinterpole a profundidade para o mapa sair na resolução nova.',
  ],
  '2.47.0': [
    'CONDUTIVIDADE AGORA INTERPOLA EM 5 × 5 m, COMO O RESTO DO APP. O mapa de CEa estava saindo em blocos de 20 m — daí o aspecto quadriculado e o serrilhado grosso na divisa do talhão. O padrão passou para 5 m, o mesmo da Fertilidade.',
    'E O PIXEL ESCOLHIDO PASSOU A VALER DE VERDADE: o seletor só aparecia no modo "Manual" e, mesmo assim, o modo "Automática" ignorava a escolha e mandava 20 m fixo para o servidor. Agora o campo "Pixel (m)" fica visível nos dois modos e é respeitado nos dois. A lista vai de 2 a 30 m, com 5 m marcado como padrão.',
    'Vale para os PRÓXIMOS processamentos: os mapas de CEa já salvos continuam como estão — reprocesse a profundidade para o mapa sair na resolução nova. A qualidade do levantamento e a limpeza (MapFilter) não mudaram; isto é só a resolução da saída. Os pontos que entram na krigagem continuam sendo agrupados por média (limite de 600), então o mapa mais fino não deixa o processamento pesado.',
    'OBS.: a aba Compactação ainda gera em 20 m fixo, sem opção de escolha — me avise se quiser que ela siga o mesmo padrão.',
  ],
  '2.46.2': [
    'CORRIGIDO — O CADASTRO DE LABORATÓRIOS NÃO SUBIA PARA A NUVEM. A categoria nasceu na v2.44.0 fora da lista de coleções sincronizadas, e o espelhamento é silencioso para chave que não está lá: gravava no navegador e parava por ali. Na prática, o laboratório cadastrado (e o nome digitado no editor) não sobrevivia a abrir o sistema em outra máquina, e podia ser sobrescrito pela hidratação.',
    'Quem já cadastrou laboratórios neste navegador não perde nada: eles são marcados para subida ANTES da primeira hidratação — a mesma proteção que os Insumos receberam na v2.42, e pelo mesmo motivo (sem ela, o boot grava o vazio da nuvem por cima do que existe aqui).',
    'Onde conferir: cadastre ou renomeie um laboratório em Biblioteca → Laboratórios, recarregue a página e confirme que o nome ficou.',
  ],
  '2.46.1': [
    'CORRIGIDO — A TELA APAGAVA SOZINHA NO MEIO DA MEDIÇÃO E A CAMINHADA PARAVA. "Manter a tela ligada" existia em um lugar só: o mapa da Amostragem de Solo. Na Medição, na Mancha e na Compactação o celular apagava a tela pelo tempo do sistema, e com a tela apagada o GPS para de entregar posição e o cronômetro congela — a gravação simplesmente parava dentro do bolso.',
    'O PIOR ERA NÃO AVISAR: ao acordar o aparelho, o próximo ponto gravado ligava em LINHA RETA ao último ponto antes de apagar. O trecho caminhado no meio sumia e a área/perímetro saíam menores, sem nenhuma mensagem — parecia uma medição normal.',
    'AGORA A TELA FICA LIGADA NO APP DE CAMPO INTEIRO, do Início à Medição. Em troca, a tela não apaga mais sozinha enquanto o app estiver aberto na frente: em dia de campo longe do carregador, saia do app (ou tranque o aparelho) nos intervalos.',
    'ISSO NÃO É MEDIR COM A TELA DESLIGADA. Se você apertar o botão de desligar, o sistema desliga mesmo e a medição para — continuar gravando de tela apagada exige um serviço nativo em primeiro plano (aquela notificação fixa de "medindo…"), que é trabalho à parte.',
    'Onde ver: app de campo (Coleta) → qualquer módulo; a tela não escurece mais sozinha.',
  ],
  '2.46.0': [
    'O LABORATÓRIO GANHOU DOIS NOMES, e isso resolve o caso de um mesmo laboratório ter vários padrões de planilha. "Nome que SAI NA FONTE do relatório" é o que o produtor lê no PDF — repita "Fundação ABC" em todas as entradas dela. "Identificação (como VOCÊ reconhece)" é interna: "Fundação ABC (via InCeres)", "Fundação ABC (planilha)" — aparece nas listas e no seletor da Fertilidade, e NUNCA no relatório.',
    'ANTES ERA UM CAMPO SÓ e os dois usos brigavam: ou você deixava o nome bonito e perdia de vista de qual padrão o laudo veio, ou mantinha a distinção e ela ia impressa no PDF do produtor. Agora não precisa mais fundir as entradas repetidas para o relatório sair certo — funda só se quiser mesmo uma entrada só.',
    'FONTE em branco = usa a identificação, então quem já tem o cadastro preenchido não muda nada até querer mudar.',
    'O seletor da Fertilidade mostra os dois ("Fundação ABC (via InCeres) → FONTE: Fundação ABC"), e a lista da Biblioteca avisa o nome impresso quando ele difere da identificação.',
    'Onde ver: Biblioteca → Laboratórios → Editar.',
  ],
  '2.45.0': [
    'DÁ PARA EDITAR O LABORATÓRIO NA BIBLIOTECA. A categoria nasceu na v2.44.0 usando o painel genérico, que só sabia CRIAR: o item da lista tinha até uma setinha à direita, mas não abria nada. Agora tem Editar (nome, cidade, contato), Ativar/Inativar e Excluir, no mesmo padrão dos Perfis de planilha.',
    'E GANHOU O BOTÃO FUNDIR (escudo), que é o que resolve a bagunça da estreia: o cadastro foi semeado a partir dos laudos antigos, e eles guardavam o nome do PERFIL DE PLANILHA — a mesma Fundação ABC entrou três vezes ("via InCeres", "(planilha)" e limpa), mais o "InCeres / Interpartner (colunas id · prof)". Só renomear não resolveria: sobrariam três itens com o mesmo nome. Fundir manda os laudos de um para o outro e exclui o repetido, sem nenhum laudo perder o vínculo.',
    'RENOMEAR CORRIGE TODOS OS LAUDOS DAQUELE LABORATÓRIO DE UMA VEZ — o laudo aponta para o cadastro, não copia o nome. O nome guardado no laudo é atualizado junto, para um PDF gerado offline não sair com o nome antigo.',
    'EXCLUIR AVISA QUANTOS LAUDOS DEPENDEM do laboratório antes de confirmar, e a lista mostra essa contagem em cada item — para você saber o que pode apagar sem pensar duas vezes.',
    'Onde ver: Biblioteca → Laboratórios.',
  ],
  '2.44.0': [
    'A BIBLIOTECA GANHOU UM CADASTRO DE LABORATÓRIOS DE VERDADE. Você cadastra "Fundação ABC", "Interpartner" uma vez em Biblioteca → Laboratórios, e escolhe na Fertilidade qual fez o laudo. É esse nome que sai na coluna FONTE do relatório.',
    'POR QUE UMA CATEGORIA NOVA, E NÃO A QUE JÁ EXISTIA: a antiga "Laboratórios" guardava, na verdade, o DE-PARA das colunas da planilha — e um dos perfis embutidos se chama "InCeres / Interpartner (colunas id · prof)", que é nome de FORMATO, não de laboratório. Usar isso como fonte imprimiria essa string no relatório. Agora são duas coisas separadas: LABORATÓRIOS (quem assina a análise) e PERFIS DE PLANILHA (como ler o arquivo) — o mesmo laboratório pode trocar de formato, e o mesmo formato serve a dois laboratórios.',
    'DÁ PARA CORRIGIR UM LAUDO JÁ IMPORTADO sem reimportar a planilha: na aba Fertilidade, abaixo da importação, escolha o laboratório no seletor "Laboratório (sai como FONTE no relatório)". Era o caso do laudo que aparecia como "Novo laboratório".',
    'A ETIQUETA "NOVO LABORATÓRIO" NÃO É MAIS GRAVADA. Ela era o texto padrão da importação em modo automático quando ninguém digitava o nome, e ia impressa no PDF como se fosse o laboratório. Agora, sem nome, o laudo fica sem laboratório e a Fertilidade pede para escolher um do cadastro.',
    'O LAUDO APONTA PARA O CADASTRO, não copia o nome: renomear um laboratório na Biblioteca corrige todos os laudos dele de uma vez. E os laboratórios que já apareciam nos seus laudos entram no cadastro sozinhos na primeira abertura (a etiqueta genérica fica de fora).',
    'SEM LABORATÓRIO, A FONTE SAI "—". Antes ela caía na fonte da legenda, que vem escrita fixa no código — um laudo da Interpartner saía dizendo Fundação ABC. Melhor um traço honesto que um nome errado.',
    'Onde ver: Biblioteca → Laboratórios (cadastro) e Talhão → aba Fertilidade (seletor, logo abaixo da importação).',
  ],
  '2.43.1': [
    'CORRIGIDO — A FONTE DO RELATÓRIO DIZIA SEMPRE "FUNDAÇÃO ABC", FOSSE QUAL FOSSE O LABORATÓRIO. A coluna FONTE do quadro INTERPRETAÇÃO não lia o laudo: ela repetia um campo da LEGENDA, e nas legendas do conjunto ABC esse campo vem escrito fixo no código. Quem importou um laudo da Interpartner recebia um PDF dizendo Fundação ABC — e, desde que o "Laboratório" saiu do rodapé, essa coluna era o único lugar do relatório que citava o laboratório.',
    'AGORA A FONTE VEM DO LAUDO, E O LAUDO GANHA SEMPRE: sai o laboratório que você escolheu na importação (Biblioteca de perfis de laboratório) — Fundação ABC, Interpartner, o que estiver cadastrado. A fonte da legenda ficou como reserva, para mapa que não tenha laudo por trás.',
    'Vale para os dois caminhos: o PDF de um elemento (aba Fertilidade) e o book do Gerador de Relatórios.',
    'Onde conferir: Talhão → aba Fertilidade → importe/selecione o laudo → gere o PDF; a coluna FONTE, à direita da barra de interpretação, tem de bater com o laboratório da importação.',
  ],
  '2.43.0': [
    'TODO ARQUIVO EXPORTADO PASSOU A TER O MESMO PADRÃO DE NOME: talhão · tipo · ano · época. "SA03_FERT_2026_EP01_SATCA" é o mapa de Saturação por Cálcio do talhão 03 da Serra Azul, 2026, 1ª época. Antes eram 43 pontos do sistema montando nome cada um do seu jeito, com SETE regras de saneamento diferentes — a mesma pasta de downloads tinha "Fertilidade_JCASA 03_Cálcio.pdf", "zona_manejo_JCASA_03.pdf", "Satelite_JCASA03_2026-08-07.pdf" e "Relatorio_JCASA 03_25-26.pdf", e nenhum deles dizia a época.',
    'A ORDEM É PROPOSITAL: ordenar a pasta por nome agrupa tudo de um talhão e, dentro dele, junta os mapas do mesmo tipo — a fertilidade de 2025 fica uma linha acima da de 2026, dá para comparar sem procurar. O identificador é a sigla da fazenda colada ao número do talhão, o mesmo "SA03" que a prescrição já usava no monitor da máquina.',
    'A ÉPOCA SAI DA DATA DE REFERÊNCIA, não de palpite: laudo e grade já guardam ano e época derivados dela, então o mapa de fertilidade e a grade levam EP01/EP02 no nome. Zonas e satélite derivam da data do mapa/da imagem. Recomendação tem só o ano (safra não diz época). Relevo e condutividade não levam nenhum dos dois — são atributos persistentes do terreno.',
    'PEDAÇO QUE FALTA SIMPLESMENTE NÃO APARECE: nada de "undefined", "null" ou "—" no meio do nome. E acento, espaço, barra e % não sobrevivem — eram eles que faziam o download sair com nome truncado ou o monitor recusar o arquivo.',
    'NOMES QUE COLIDIAM DEIXARAM DE COLIDIR: o satélite da fazenda saía "Satelite_Fazenda_2026.pdf" — o MESMO nome para dois produtores diferentes no mesmo ano — e agora leva a sigla. O book de recomendações saía "book-recomendacoes-25-26.pdf", sem dizer de que talhão era.',
    'A PRESCRIÇÃO NÃO MUDOU DE NOME, de propósito: "SA03_TX_MILHO" já está nos monitores e o operador reconhece de relance; trocar isso agora é convite para levar o arquivo errado para a máquina. Ela passou a compartilhar as PEÇAS do novo padrão (sigla, número do talhão), para as duas convenções nunca discordarem sobre o que é a sigla de uma fazenda.',
    'Onde ver: qualquer botão de exportar/baixar do sistema. 20 testes novos (npm run teste:nomes) travam a ordem, o charset e a cascata do período; os 83 da prescrição seguem passando sem uma linha editada — é a prova de que o arquivo da máquina saiu byte a byte igual.',
  ],
  '2.42.0': [
    'O PREÇO DO PRODUTO PASSOU A TER UM LUGAR SÓ: a Biblioteca de Insumos. O grupo CALCÁRIO tinha dez equações, e cada uma carregava sua própria cópia de "R$ 115/t". No dia em que o calcário mudava de preço eram dez edições — das quais uma sempre ficava para trás, e ninguém descobria antes do orçamento sair errado. Agora a equação APONTA para o insumo: mudou o preço no cadastro, as dez mudam juntas.',
    'ONDE FICA: Biblioteca → Equações. No cabeçalho de cada grupo (CALCÁRIO, GESSO, …) apareceu um botão de vínculo. Ele mostra o que existe hoje, deixa escolher o insumo e vincula o grupo INTEIRO de uma vez — um clique para as dez. O selo no cabeçalho e ao lado de cada equação diz de onde o preço está vindo: verde com o nome do insumo, âmbar quando alguma equação foge do padrão ou aponta para um insumo que não existe mais.',
    'FRETE E APLICAÇÃO TAMBÉM MUDARAM DE CASA: agora são campos do insumo (Biblioteca → Insumos), pelo mesmo motivo do preço — estavam copiados dez vezes. E o insumo passou a ser da EMPRESA, não mais só de quem cadastrou: equação compartilhada apontando para insumo privado seria um preço que só uma pessoa enxerga.',
    'VAZIO HERDA, PREENCHIDO SOBRESCREVE. Na equação vinculada, os campos de custo ficam em branco mostrando o valor herdado em cinza ("herdado: 350,00"). Digitar um número ali é uma decisão — para o calcário de outra jazida naquele talhão — e a equação passa a exibir "sobrescreve o insumo", com um atalho para voltar. Zero digitado continua sendo zero de verdade, e não "não preenchi".',
    'SEUS INSUMOS AGORA ACOMPANHAM VOCÊ ENTRE COMPUTADORES. O cadastro de insumos era o único da Biblioteca que ficava preso a um navegador; a partir desta versão ele sincroniza como o resto. Na primeira abertura o app se protege sozinho para subir o que já estava na máquina em vez de baixar vazio por cima.',
    'NADA MUDOU NAS EQUAÇÕES ANTIGAS. Enquanto você não vincular, cada equação continua usando exatamente os custos que ela já tinha — o vínculo é um clique seu, nunca um palpite do sistema casando nomes parecidos no meio da safra. Os CENÁRIOS JÁ SALVOS também não mudam: eles guardam o resultado financeiro daquele processamento, que é registro histórico.',
    'A "Tabela de preços" saiu do editor de equações — a Biblioteca de Insumos faz o que ela fazia, e melhor. Os dados dela não foram apagados.',
  ],
  '2.41.1': [
    'MAPA DE DOSE SERRILHADO CRUZANDO A DIVISA — DUAS BRECHAS FECHADAS. Relembrando o combinado: a interpolação VISÍVEL (5 m, aba Fertilidade) nunca deveria mudar; a de 20 m é oculta, existe só para a conta da Recomendação, e desde a v2.40.0 ela transborda a divisa de propósito (para cobrir 100% do talhão) contando com o recorte na hora de exibir. O serrilhado aparecia quando esse recorte falhava em silêncio.',
    'BRECHA 1 — mapa de dose na TELA: o recorte pelo contorno era pulado sem aviso quando o talhão não tinha polígono no cadastro (ex.: limite carregado por upload). Agora o contorno é buscado do mesmo jeito que a aba Fertilidade busca (limite carregado no mapa primeiro, cadastro como reserva), e, se ainda assim faltar, fica um aviso claro no console em vez de silêncio.',
    'BRECHA 2 — RELATÓRIO sem passar pela aba: os arquivos de 20 m que a v2.37.0 deixou na gaveta errada eram limpos ao ABRIR a aba Fertilidade — mas quem ia direto em Relatórios ainda podia pegar um deles (estatística com mínimo/máximo encolhidos). O gerador de relatórios agora ignora esses restos por conta própria, sem depender da limpeza.',
    'A interpolação visível continua intocada: a opção de cobrir o polígono é enviada SOMENTE pela interpolação oculta de 20 m, e há teste automático provando que, sem ela, o resultado do servidor é idêntico ao de antes.',
    'Se você ainda vir um mapa serrilhado: abra a aba Fertilidade do talhão uma vez (limpa os restos antigos) e reprocesse a variável. O mapa de dose na aba Recomendações deve aparecer recortado exatamente na linha do talhão.',
  ],
  '2.41.0': [
    'O PREÇO DOS INSUMOS PASSOU A SER POR TONELADA — menos na semente, que continua por quilo. Adubo, calcário, gesso, esterco, composto e produto personalizado se cotam, se conferem em nota e se pedem por tonelada; "R$ 0,35/kg" para um calcário era um número que ninguém usa, e com o zero escondido na casa decimal um erro de 10× passava batido. Semente se compra em saco de quilos e ficou como estava.',
    'O CAMPO GANHOU PADRÃO CONTÁBIL: alinhado à direita e sempre com duas casas — "1.234,50", com ponto no milhar e vírgula nos centavos. Ele só se arruma quando você sai do campo; enquanto está digitando, o que você escreveu fica exatamente como escreveu (antes a vírgula era comida no meio da digitação, e "0," virava "0"). Vale ponto ou vírgula: "1.234,56", "1234,56" e "0.35" entram todos certos.',
    'SEU CADASTRO ANTIGO NÃO PRECISA SER REFEITO E NÃO SERÁ TOCADO. Quem estava gravado em R$/kg é lido como R$/kg e aparece convertido: o calcário a 0,35 abre como "350,00" no campo por tonelada. Cada preço agora carrega escrito a unidade em que foi gravado, então reabrir, editar e salvar não multiplica nada por engano — que é o risco real de converter tudo de uma vez e perder a marca de "já convertido" na troca de navegador.',
    'CORRIGIDO DE QUEBRA — O CUSTO QUE A PRESCRIÇÃO PUXAVA DO CADASTRO SAÍA 1000× ERRADO EM t/ha. Ao escolher o produto, o preço ia para o campo "Custo" sem olhar a unidade da dose: numa prescrição de calcário em t/ha, R$/kg entrava como se fosse R$/t. Agora a conversão acompanha a unidade da dose (kg quando é kg/ha, t quando é t/ha). Em dose contada em sementes ou litros o campo fica em branco em vez de trazer número errado — de peso não se tira preço por semente.',
    'Onde ver: Biblioteca → Insumos → qualquer aba (o rótulo do campo diz a unidade), e Talhão → aba Prescrições → ao escolher o produto, no campo Custo. 12 testes novos (npm run teste:insumos, 23 no total) travam a leitura do cadastro antigo, o formato do campo e a conversão do custo.',
  ],
  '2.40.0': [
    'O MAPA DE DOSE AGORA CHEGA NA DIVISA. Sobrava uma faixa de até 20 metros sem dose em toda a volta do talhão: a interpolação só aceitava a célula cujo CENTRO caísse dentro do contorno, e a célula da borda — com metade de área boa — era descartada inteira. Num talhão de formato irregular isso deixava mais de 1,5% da área de fora.',
    'COMO FICOU: junto com a interpolação normal, o raster de 20 m da Recomendação passa a ser calculado com um pixel de folga e a aceitar toda célula que ENCOSTA no talhão. Cada pixel de borda leva o valor que a krigagem calculou para aquele ponto — nada é inventado nem copiado do vizinho; o cálculo já passava por ali e o resultado é que era jogado fora. O recorte exato pelo contorno acontece no fim, na hora de desenhar e de exportar.',
    'A QUANTIDADE TOTAL NÃO MUDA POR CAUSA DISSO. Cada pixel entra na conta pela fração dele que está dentro do talhão — o mesmo recorte do mapa, só que em número. Medido no servidor real: a dose média ficou em 0,03% de diferença. Sem essa ponderação, a célula de borda (meia célula de área, e justo onde a interpolação extrapola) puxaria o resultado em cerca de 1,4%. Talhão com furo (represa, benfeitoria) tem o furo descontado.',
    'MAPA DA TELA TAMBÉM RECORTADO: o PDF já cortava os pixels no contorno, mas o mapa da tela apenas desenhava a imagem — com a malha maior, o excesso apareceria cruzando a divisa. Agora o recorte é aplicado na própria imagem, antes de ela ir para o mapa.',
    'OS MAPAS DE FERTILIDADE CONTINUAM EXATAMENTE COMO ESTAVAM: a cobertura total vale SÓ para o raster de 20 m da Recomendação. O mapa que você vê na aba Fertilidade e o do relatório não mandam essa opção e não mudaram — está travado por teste.',
    'Reprocesse a variável na aba Fertilidade para o mapa novo valer; os cenários já calculados seguem como estão até serem refeitos. 14 testes automáticos novos (npm run teste:cobrir e npm run teste:cobertura), incluindo a prova de que 100% do talhão fica coberto e de que sem a opção nada muda.',
  ],
  '2.39.0': [
    'O RESUMO DA PRESCRIÇÃO PASSOU A CONTAR EM SACO, NÃO SÓ EM SEMENTE E QUILO. Onde saía "Quantidade usada: 3.573.597 sementes = 1.047 kg" agora sai "= 1.047 kg = 59,6 sacos". Semente se compra em saco, e a conversão estava só na cabeça de quem lia o PDF. Vale para TODOS os totais do quadro: com ajuste de germinação, os três números (sem ajuste, com ajuste e a diferença a mais para comprar) levam quilo e saco — é a diferença em SACOS que vira pedido no depósito.',
    'CADA CONVERSÃO SÓ APARECE SE O PARÂMETRO QUE A SUSTENTA EXISTIR: o quilo depende do PMS, o saco depende de "Sementes/saco". Faltando um, sai só o outro; faltando os dois, sai a contagem de sementes como sempre saiu. E adubo, corretivo e orgânico não ganham nada disso — não germinam nem vêm em saco de semente.',
    'ENTROU A LINHA "SEMENTE:" NO QUADRO, com cultivar, PMS, germinação, espaçamento e sementes/saco — só os campos preenchidos. É ela que justifica os quilos e os sacos: sem os parâmetros à vista, "1.047 kg" e "59,6 sacos" eram dois números que ninguém tinha como conferir no papel, porque esses campos não apareciam em lugar nenhum do PDF.',
    'A BARRA DE CORES DA DOSE PASSOU A OCUPAR TODA A LARGURA DO MAPA, com o título centralizado sobre ela. Ocupava metade (84 mm de 168), encostada à esquerda: a rampa saía apertada, as cores próximas ficavam difíceis de separar e sobrava um vão branco embaixo da metade direita do mapa.',
    'Onde ver: Talhão → aba Prescrições → PDF de uma prescrição. Os parâmetros ficam em "Parâmetros da semente", no formulário da prescrição. 8 testes novos (npm run teste:prescricao, 83 no total) travam as conversões e o que some quando falta parâmetro.',
  ],
  '2.38.0': [
    'CORRIGIDO — OS MAPAS DE FERTILIDADE MUDARAM SOZINHOS NA v2.37.0, E VOLTARAM AO QUE ERAM. No relatório de Saturação por Cálcio de Das Violas, o 0-20 cm tinha saído de "mín 28,0 · méd 47,7 · máx 57,8" para "mín 28,7 · méd 47,7 · máx 56,6" — média igual e extremos encolhendo, a assinatura de um mapa mais grosso. O relatório, a aba Fertilidade e o mapa da tela passaram a mostrar, sem pedir, o raster de 20 m que a v2.37.0 criou para a Recomendação.',
    'POR QUE ACONTECEU: esse raster de 20 m estava sendo guardado na MESMA gaveta dos mapas de fertilidade, e todo mundo que abre essa gaveta usa a regra "vale o mais recente" — e ele é sempre o mais recente, porque sai depois, na fila de segundo plano. Foi a segunda vez em dois dias: antes disso ele já tinha engrossado as divisas das Zonas de Manejo.',
    'A CORREÇÃO NÃO É REMENDAR CADA TELA, É MUDAR ELE DE GAVETA. O raster de 20 m é conta, não mapa: não tem rótulo, não tem imagem, nunca é desenhado. Agora ele mora num lugar só dele, que as telas de fertilidade nem enxergam — nem hoje, nem quando alguém escrever uma tela nova. De quebra, a aba parou de baixar e descompactar esses arquivos à toa.',
    'SEUS MAPAS NÃO PRECISAM SER REPROCESSADOS: o mapa fino nunca foi apagado, estava só sendo passado para trás na hora de escolher. Ao abrir o talhão, o app ainda limpa sozinho os arquivos de 20 m que ficaram na gaveta errada. Um mapa de 20 m que VOCÊ escolheu no seletor de pixel não é confundido com eles (ele tem os valores dos pontos; o auxiliar não tem).',
    'CONTAGEM DE MAPAS DO PAINEL DO TALHÃO: passou a contar VARIÁVEIS interpoladas (elemento + profundidade) em vez de arquivos. Estava mostrando o dobro desde a v2.37.0, e já contava errado antes disso quando o mesmo elemento tinha sido interpolado com configurações diferentes.',
    'TRAVA CONTRA A PRÓXIMA: quem carrega os mapas para calcular agora é OBRIGADO a dizer para que é — dose (20 m) ou zona (o mais fino). Antes havia um padrão silencioso, e foi exatamente ele que fez o zoneamento herdar a régua de 20 m sem ninguém escrever nada. Agora errar não compila. 23 testes automáticos travam a regra (npm run teste:grids).',
    'Onde conferir: Talhão → aba Relatórios → gerar o PDF de Fertilidade e comparar as estatísticas com um relatório antigo; e Talhão → aba Fertilidade, onde o mapa volta ao detalhe da resolução que você escolheu.',
  ],
  '2.37.0': [
    'A EQUAÇÃO GANHOU K%, Ca% E Mg% COMO ATRIBUTOS (tokens satK, satCa e satMg). Até aqui, para usar saturação na fórmula você precisava escrever K/CTC*100 — que é a razão de DOIS mapas krigados em separado e NÃO é o mapa de K% que o cliente vê no relatório de fertilidade (esse é calculado ponto a ponto no laudo e depois interpolado). São duas superfícies diferentes, e a conta usava justamente a que ninguém vê. Agora dá para usar a mesma dos dois lados. Equações já escritas com K/CTC*100 continuam funcionando exatamente como antes.',
    'A RECOMENDAÇÃO PASSOU A USAR UM MAPA INTERPOLADO NATIVAMENTE EM 20 m. A dose sempre saiu em 20 m (é o que a máquina usa), mas ela era obtida tirando a MÉDIA de cada bloco de 4×4 pixels do mapa fino de 5 m. Agora, ao processar uma variável na Fertilidade, um segundo mapa de 20 m é gerado EM SEGUNDO PLANO (um de cada vez, depois do processamento que você está esperando) e é ele que entra na conta, direto.',
    'SINCERIDADE SOBRE O TAMANHO DESSE GANHO: medimos no servidor real, com os dois caminhos lado a lado — a diferença na DOSE é de cerca de 1%. A superfície da krigagem é lisa na escala de 20 m, então a média de 16 pixels quase não mudava os valores. NÃO espere as doses subirem por causa disto. O que a mudança conserta de fato é outra coisa: a reamostragem deixava o mapa deslocado em cerca de meio pixel (ela trocava o número de células mas mantinha as coordenadas do mapa fino) e deixava as estatísticas do grid desatualizadas.',
    'A TELA DA RECOMENDAÇÃO PASSOU A MOSTRAR DE ONDE VEIO CADA MAPA ("K% 20 m · krigefixa | CTC 20 m · krige"), em amarelo quando algum atributo veio reamostrado ou quando a conta está misturando interpoladores. Isso importa: os mapas eram escolhidos só por variável+profundidade, e o mais recente ganhava — dava para calcular com o K krigado e a CTC por IDW sem nenhum aviso. Com dois mapas por atributo, a escolha virou explícita (e travada por 12 testes: npm run teste:grids).',
    'SOBRE A DIFERENÇA PARA A INCERES (caso DNHDV 07 · Das Violas): a mesma receita de "KCl para 2% na CTC" deu 8,0 t aqui e 10,4 t lá. A causa NÃO é arredondamento nem a resolução — é o mapa de K%. Os dois quase coincidem (média 1,80 aqui contra 1,74 lá), mas a dose não depende do teor e sim do DÉFICIT (2 − K%): o déficit médio cai de 0,26 para 0,20, o que prevê uma razão de 1,30 contra os 1,29 observados. Perto do alvo, 1 ponto percentual no mapa de K% vale 500% de dose. Para aproximar, reprocesse com a Krigagem fixa (Alcance 400 · Patamar 300 · Pepita 10), que é a estrutura espacial que eles usam. (O "máximo 500" do relatório deles é teto da receita, não valor calculado.)',
    'TALHÃO ANTIGO NÃO QUEBRA: sem o mapa de 20 m salvo, a Recomendação calcula pelo caminho antigo (reamostragem) e diz isso na tela. Reprocesse a variável na Fertilidade quando puder.',
    'Onde ver: Talhão → aba Fertilidade (o mapa de 20 m sai sozinho ao processar; se falhar, aparece um aviso amarelo abaixo dos botões) e Talhão → aba Recomendações (linha "Mapas usados", logo abaixo da lista de equações).',
  ],
  '2.36.0': [
    'O MUNICÍPIO PASSOU A SAIR SEMPRE NO RELATÓRIO — e a causa não era o layout. O PDF imprimia direto o campo "Município" do cadastro da fazenda; quando ele estava vazio (o normal, porque preenchê-lo dependia de um botão manual em Fazenda que ninguém apertava), a capa saía " - PR" e o cabeçalho de cada mapa saía "— - PR". Agora o relatório resolve o município em CASCATA: usa o cadastro se estiver preenchido; senão pega do cache que o mapa do Início já resolveu (instantâneo); senão consulta a posição do talhão uma vez (OpenStreetMap, com prazo curto para nunca pendurar a geração).',
    'E O QUE FOR DESCOBERTO VOLTA GRAVADO no cadastro da fazenda e no cache — cada fazenda consulta uma vez só na vida, e o município passa a aparecer também nas telas, não apenas no PDF. Sem internet, o relatório sai igual, só que mostrando a UF sozinha em vez do "— - PR" que aparecia antes.',
    'O LABORATÓRIO SAIU DO CANTO INFERIOR ESQUERDO DE TODAS AS PÁGINAS DE MAPA. Era a mesma informação da coluna FONTE, ali no quadro INTERPRETAÇÃO logo acima — repetida duas vezes na mesma página. Ficou só a coluna FONTE; o pé da página agora tem apenas a marca da INVICTA, à direita.',
    'A TEXTURA NÃO MOSTRA MAIS FONTE. Ela é atributo PERSISTENTE do solo, não resultado de laudo que muda de laboratório para laboratório. No quadro INTERPRETAÇÃO dessa página sobraram UNIDADE e MÉTODO, distribuídos no mesmo espaço. Os demais mapas seguem com as três colunas.',
    'A LISTA DE MAPAS DA CAPA FICOU LIMPA: era "Textura (Argila) (Textura) · Acidez (pH) (pH) · CTC (pH 7) (CTC)…", com o nome e a sigla se repetindo. Agora sai só a sigla — "Textura · pH · m% · V% · CTCe…" —, que é exatamente o título grande de cada página.',
    'Onde ver: Talhão → aba Relatórios → Gerar, e Talhão → aba Fertilidade → PDF de um elemento.',
  ],
  '2.35.0': [
    'O CABEÇALHO DO RELATÓRIO FICOU LIMPO, COM AS TRÊS COISAS NOS TRÊS CANTOS. A fazenda e o produtor encostaram na MARGEM ESQUERDA (antes começavam 62 mm adentro, empurrados pela logo, e o traço vertical que os separava dela sumiu junto). O quadro "Informações da Área" segue no canto superior direito. E a sigla do elemento ("MO") com o nome por extenso embaixo ("Matéria Orgânica (g/dm³)") passaram a ficar CENTRALIZADOS na página, entre os dois blocos — antes estavam deslocados 17 mm para a direita, herança de quando a logo ocupava a esquerda.',
    'A LOGO DA INVICTA SAIU DO CABEÇALHO E FOI ASSINAR O PÉ DA PÁGINA, no canto inferior direito da área branca, logo acima da barra azul do rodapé e sem encostar nela. O topo do relatório passou a ser só informação do mapa.',
    'O LABORATÓRIO SAIU DO QUADRO DE INFORMAÇÕES e foi para o canto inferior ESQUERDO da área branca, na mesma faixa da logo: "Laboratório: Fundação ABC". O quadro do canto superior direito ficou com Área Total, Município e Datum.',
    'NADA MAIS MUDOU: mapas, estatísticas por profundidade, barra de interpretação, unidade, método, fonte, escala, cores e tipografia continuam exatamente como estavam.',
    'ZONAS DE MANEJO ACOMPANHOU O CABEÇALHO (é o mesmo desenho para os dois relatórios, para não voltarem a divergir). Lá a logo foi para o canto inferior ESQUERDO: o direito é do quadro RESUMO, que desce mais ou menos conforme o nº de zonas.',
    'Onde ver: Talhão → aba Relatórios → Gerar. 7 testes novos (npm run teste:cabecalho, 18 no total) travam o texto na margem, o título no centro da página e a logo acima da barra do rodapé.',
  ],
  '2.34.0': [
    'A FERTILIDADE GANHOU UM TERCEIRO INTERPOLADOR: "KRIGAGEM FIXA", COM O VARIOGRAMA TRAVADO EM ALCANCE 400 m, PATAMAR 300 E PEPITA 10. Até aqui só havia Krigagem (com variograma auto-ajustado) e IDW: o auto-ajuste refaz a estrutura espacial a cada mapa, a partir dos próprios pontos, então cada nutriente e cada profundidade saíam com uma "cara" diferente e o mesmo talhão mudava de aparência de uma rodada para outra. Com o variograma fixo, todos os mapas passam a ser desenhados com a mesma régua — comparáveis entre variáveis, entre profundidades e entre talhões.',
    'OS TRÊS NÚMEROS SÃO EDITÁVEIS. Eles já nascem preenchidos (400 / 300 / 10) e valem para qualquer variável — na krigagem só a FORMA do variograma entra na conta, a escala se cancela, então o mesmo trio serve para pH, Ca% ou P em mg/dm³. Mudou e não gostou? "Restaurar padrões (400 / 300 / 10)" volta tudo num clique.',
    'DUAS COISAS QUE SOMEM DE PROPÓSITO NESSE MODO: o RMSE (não há validação cruzada quando o variograma é imposto por você) e a proteção automática contra variograma degenerado — o servidor obedece aos seus números, ponto. Se a Pepita chegar perto do Patamar, o mapa sai liso; a tela avisa antes de processar.',
    'A KRIGAGEM AUTOMÁTICA CONTINUA IGUALZINHA, e os dois mapas convivem: processar no modo fixo NÃO apaga o mapa automático do mesmo nutriente na nuvem (cada um grava sob a sua própria chave). O que aparece na tela é sempre o mais recente.',
    'Onde ver: Talhão → aba Fertilidade → "Configurações da interpolação" (o cabeçalho com a engrenagem) → linha Interpolador → botão "Krigagem fixa". Os campos Alcance / Patamar / Pepita aparecem logo abaixo de Pixel e Variograma.',
  ],
  '2.33.0': [
    'O TÍTULO DO RELATÓRIO PASSOU A SER A SIGLA, E ELA VEM DAS PREFERÊNCIAS DE ANÁLISE. Onde saía "SATURAÇÃO POR CÁLCIO (Ca%)" numa linha só, agora saem duas: em cima, grande, a SIGLA da variável — "Ca%", exatamente como está escrita na Biblioteca → Preferências de Análise (sem virar maiúscula, senão "Ca%" viraria "CA%"); embaixo, no lugar onde antes ficava o laboratório, o NOME dela com a unidade entre parênteses — "Saturação por Cálcio (%)". Editar sigla, nome ou unidade da variável muda o PDF na hora; antes o título vinha da legenda e ninguém tinha como corrigi-lo por ali.',
    'O TAMANHO DA FONTE DO TÍTULO FICOU FIXO EM TODOS OS LAYOUTS (Fertilidade e Zonas de Manejo). Ele encolhia sozinho conforme o texto — cada elemento saía com um corpo diferente e o book não tinha duas páginas iguais. Agora é um número único, dimensionado pelo MAIOR título que existe ("ZONAS DE MANEJO"): todas as páginas saem com a mesma altura de letra.',
    'O QUADRO "INFORMAÇÕES DA ÁREA" FOI PARA O EXTREMO DIREITO E FICOU JUSTIFICADO LÁ — as linhas terminam alinhadas na margem, em vez de começarem numa coluna fixa no meio do vazio. Quando o produtor tem logo no cabeçalho, o quadro para exatamente na borda dela.',
    'NO QUADRO: o FUSO saiu (não serve para quem lê o mapa), o Datum passou de SIRGAS 2000 para WGS 84 (também na capa do book) e entrou o LABORATÓRIO — "Laboratório: Fundação ABC" —, que antes ficava solto embaixo do título. O sumário da capa também passou a usar o nome e a sigla do catálogo, iguais aos das páginas.',
    'Onde ver: Talhão → aba Relatórios → Gerar (cabeçalho de cada página de mapa) e o PDF de Zonas de Manejo. As siglas, nomes e unidades ficam em Biblioteca → Preferências de Análise → Variáveis de Análise. O topo dos dois relatórios passou a ser desenhado por UMA função só — "igual em todos os layouts" virou garantia, não coincidência —, com 11 testes novos (npm run teste:cabecalho) travando o corpo fixo do título, o quadro justificado (inclusive recuando da logo do cliente), a saída do fuso e a entrada do laboratório.',
  ],
  '2.32.0': [
    'A TELA DO TALHÃO GANHOU UM MENU LATERAL DE ÍCONES E O MAPA GANHOU A TELA DE VOLTA. Os 13 módulos (Resumo, Altimetria, Condutividade, Zonas, Amostragem, Fertilidade, Recomendações, Prescrições, Arquivos, NDVI, Produtividade, Compactação, Relatórios) saíram da grade de botões que quebrava em 3-4 linhas e foram para um TRILHO de 64 px na borda esquerda, com ícone e nome — o mesmo desenho do menu principal do app.',
    'CLICAR NUM MÓDULO ABRE A TELA DELE; CLICAR DE NOVO FECHA (ou use o X no canto do painel). Com o painel fechado o mapa ocupa tudo, menos os 64 px do trilho. Antes o painel tinha 440 px travados e não fechava: num notebook de 1024 px ele comia 43% da largura o tempo todo, mesmo quando você só queria olhar o mapa.',
    'A LARGURA DO PAINEL VIROU SUA. Arraste a borda direita dele para o tamanho que quiser; o app lembra na próxima vez que você abrir um talhão. O limite é calculado pela SUA janela — em tela pequena o teto desce sozinho para o mapa nunca virar uma tira, e girar o tablet reaperta o painel em vez de espremer o mapa.',
    'BOTÃO "RECOLHER" no pé do trilho deixa só os ícones (44 px), para quem já sabe de cor onde fica cada coisa. Também fica guardado.',
    'O MAPA AGORA ACOMPANHA O ESPAÇO QUE TEM. Ele só se redimensionava quando a JANELA mudava — abrir, fechar ou arrastar o painel deixaria a imagem esticada. Passou a observar o próprio container.',
    'O painel empurra o mapa em vez de flutuar por cima de propósito: quase todo módulo daqui desenha uma camada NO mapa (fertilidade, zonas, NDVI, relevo, condutividade…), e os dois precisam ser lidos lado a lado, sem um tapando o outro.',
  ],
  '2.31.0': [
    'O CONVITE GANHOU NOME INTERNO — só você vê. Ao gerar um convite para uma pessoa (Acessos → aba Convites → "Convite para uma pessoa"), o PRIMEIRO campo passou a ser o nome interno: "Jonas, da Santa Rita", "gerente do Ricardo" — o que ajudar VOCÊ a lembrar para quem mandou cada link. Ele vira o título do convite na lista e NUNCA é mostrado para quem abre o link. O campo de baixo continua sendo o nome DA PESSOA, aquele que já entra preenchido no cadastro dela. Antes existia só um campo para as duas coisas e, num link mandado sem e-mail, a lista dizia apenas "Link aberto (sem e-mail)": três convites abertos ficavam idênticos na tela.',
    'DÁ PARA DEFINIR NO PRÓPRIO CONVITE QUEM A PESSOA VAI PODER ACESSAR. No formulário entrou o bloco "Quem ele vai poder acessar", com a lista de produtores e, embaixo, as fazendas dos produtores marcados. Nada marcado = sem restrição, como sempre foi. Antes esse ajuste só existia DEPOIS: aprovar a pessoa e então abrir o painel dela → Vínculos — e nesse intervalo ela já estava ativa, enxergando tudo que o papel permitia.',
    'O QUE FOI MARCADO É APLICADO NA APROVAÇÃO, não antes — o link continua não liberando ninguém sozinho. Quem se cadastra cai em "aguardando aprovação" já com os vínculos anexados; o cartão de aprovação mostra por escrito "Acesso definido no convite: FULANO, BELTRANO"; e clicar em Aprovar grava esses vínculos junto com o papel. Dali em diante é ajustável como em qualquer usuário (painel do usuário → Vínculos).',
    'REDE DE SEGURANÇA: se a máquina de quem se cadastrou não tinha a lista de convites sincronizada, os vínculos não chegam pelo cadastro — a aprovação relê o convite de origem e usa o que está lá. E lista vazia significa "não mexa nos vínculos": aprovar NUNCA grava restrição vazia por cima de quem já tinha acesso limitado.',
    'ONDE CONFERIR: Acessos → aba Convites. Cada cartão da lista passou a mostrar o acesso definido ("Acesso: sem restrição" ou os nomes dos produtores/fazendas). O bloco também está no "link por tipo" — ali o que for marcado vale para TODAS as pessoas que usarem aquele link, e a tela avisa isso na hora. 5 testes novos (npm run teste:convite-regras, 12 no total) travam qual acesso a aprovação aplica.',
  ],
  '2.30.3': [
    'OS NÚMEROS SOBRE O MAPA DO RELATÓRIO CRESCERAM — tanto o nº do ponto na capa quanto o valor de cada nutriente. Eles saíam com corpo fixo (≈4,3 pt na página de dois mapas), tamanho de nota de rodapé: legível na tela, sofrível no papel. Agora o corpo se ADAPTA à grade e chega a ≈6,7 pt na mesma página — cerca de 1,6× maior, sem mudar mais nada no layout.',
    'POR QUE ADAPTATIVO E NÃO UM NÚMERO MAIOR FIXO: o que limita o tamanho é o espaço entre os pontos, e isso muda de talhão para talhão. O app mede a distância de cada ponto ao vizinho mais próximo, pega o 1º quartil dessas distâncias (a média esconderia a região mais apertada) e cresce a fonte só até caber ali com folga — no máximo 62% da folga em largura e 75% em altura, para nenhum rótulo encostar no de baixo nem no do lado.',
    'AMOSTRAGEM APERTADA NÃO PIORA: o tamanho tem um PISO, que é exatamente o de antes — grade densa continua saindo como saía, nunca menor. E tem um TETO, para o mapa não virar uma tabela de números numa amostragem muito folgada. Um par de pontos quase coincidente (duplicata do laudo) também não encolhe o mapa inteiro.',
    'O contorno escuro do número acompanha o corpo da fonte: em número graúdo, um traço fino ficaria ralo sobre o satélite e o branco sumiria no claro da imagem.',
    'Onde ver: Talhão → aba Relatórios → Gerar (vale para a capa e para os mapas de todos os elementos). 12 testes novos (npm run teste:rotulos) travam a regra, inclusive a de não sobrepor.',
  ],
  '2.30.2': [
    'O RELATÓRIO DE FERTILIDADE VOLTOU A TRAZER O NÚMERO DOS PONTOS NA CAPA E OS VALORES SOBRE OS MAPAS. Os dois sumiram juntos porque dependem da MESMA coisa: o elo entre o laudo importado e a grade de amostragem — o laudo só traz o número da amostra, quem tem as coordenadas é a grade. Quando esse elo não fecha, a capa fica sem a numeração e cada mapa de nutriente sai sem os valores em cima, mesmo com tudo certo na tela.',
    'A CAUSA ERA DUAS REGRAS PARA A MESMA PERGUNTA: a tela da Fertilidade já tinha dois desvios — laudo apontando para uma grade que ficou sem pontos (usa a grade com mais pontos do talhão/ano) e laudo renumerado pelo laboratório, em que os números não batem com os da grade (casa a i-ésima amostra com o i-ésimo ponto). O relatório exigia o casamento exato e desistia calado. Agora a regra é ÚNICA, num só lugar, usada pela tela e pelo PDF.',
    'REDE DE SEGURANÇA A MAIS NO PDF: se nem assim o elo fechar, os valores saem dos rótulos GRAVADOS junto com o mapa na hora da interpolação — exatamente o que a tela já fazia. Ou seja: o que você vê na tela é o que sai no relatório.',
    'Reabrir um relatório ANTIGO pelo histórico não desliga mais o satélite e os valores (registros gravados antes desses botões existirem vinham sem a informação e o relatório voltava "pelado").',
    'Onde conferir: Talhão → aba Relatórios → botões Satélite / Valores → Gerar. O nº dos pontos aparece no mapa da CAPA (1ª página) e os valores, sobre o mapa de cada elemento. 12 testes novos (npm run teste:elo) travam o elo laudo↔grade.',
  ],
  '2.30.1': [
    'O MAPA VOLTOU A OBEDECER A BIBLIOTECA DE LEGENDAS. O caso relatado: a legenda de Saturação por Potássio (K%) editada em Legendas (faixas 1/2/3/4/5) não mudava o mapa, que seguia nas faixas antigas (1,5/3/5/8). A causa: existiam DUAS legendas com o mesmo nome para o mesmo atributo — gêmeas criadas quando a migração de K%/Ca%/Mg% rodou numa segunda máquina antes de a nuvem baixar os dados (a trava era por navegador) — e o usuário editava uma enquanto o mapa usava a outra, sem ter como distinguir as duas em nenhum dropdown.',
    'TRÊS CORREÇÕES FECHAM O CICLO: (1) legendas gêmeas (mesmo atributo + mesmo nome, nenhuma marcada como padrão ★) são detectadas no boot e a EDITADA POR ÚLTIMO é promovida a padrão do atributo — a Biblioteca volta a mandar sem você fazer nada; (2) salvar uma legenda que tem gêmea também a promove na hora (mesma regra que já valia ao editar uma oficial); (3) perfis e preferências que apontavam para a gêmea antiga passam a resolver para a padrão de mesmo nome — o "PADRÃO INVICTA" não prende mais o mapa na cópia que você não edita.',
    'A FÁBRICA DE GÊMEAS FOI DESLIGADA: as migrações que criam legendas (CTCe, K%/Ca%/Mg%) agora esperam a nuvem hidratar antes de rodar — a mesma trava que o seed das oficiais já tinha. Máquina nova não recria mais legendas que já existem na conta.',
    'TODOS OS MAPAS PASSARAM A ESCOLHER A LEGENDA PELA MESMA REGRA (padrão ★ → oficiais → nome): Condutividade, Altimetria, Compactação, NDVI, Produtividade, o mapa de Argila e a Condutividade do painel do talhão, o Comparador e o RELATÓRIO DE DADOS escolhiam "a primeira do array" — que muda de uma sessão para outra com a ordem arbitrária do boot da nuvem. O relatório podia sair com uma legenda diferente da tela; agora é a mesma em todo lugar.',
    'Se alguma legenda sua ainda parecer ignorada: abra Biblioteca → Legendas e confira a estrela ★ do atributo — ela marca a legenda que TODOS os mapas usam. 9 testes novos (npm run teste:legendas) travam a regra das gêmeas e da promoção.',
  ],
  '2.30.0': [
    'CORTE POR LINHA NO EDITOR DE ZONAS (Zonas de Manejo → abrir um zoneamento salvo → Editor manual → botão "Dividir"): a divisão passou a acontecer NA PRÓPRIA TELA. Selecione a zona, clique em Dividir e toque no mapa marcando a linha que atravessa a mancha — dois toques fazem uma reta, mais toques acompanham o contorno. Antes, "Dividir" abria o editor de geometria em tela cheia, que é a ferramenta de quem vai mexer em vértice; para separar uma mancha de pedra ou um encharcado era caminho longo demais.',
    'A PARTE SEPARADA JÁ ABRE PEDINDO A CLASSE: quem recorta um pedaço faz isso porque ele é OUTRA COISA. Depois do corte, o recorte entra selecionado e o seletor de classes abre sozinho, com as 5 do semáforo (as que ainda não existem no mapa aparecem tracejadas). A MAIOR parte mantém o número e a classe da zona original; o recorte recebe "#3_2", "#3_3"… e você renumera clicando no número, como já dava.',
    'NÃO PRECISA MAIS COMEÇAR E TERMINAR FORA DA ZONA: se o traço parou dentro, ele é prolongado sozinho até atravessar. Quem desenhou passando dos dois lados corta exatamente onde traçou, sem esticão nenhum. Tocar duas vezes no mesmo ponto também deixou de derrubar o corte.',
    'O CORTE PASSOU A RODAR NO SERVIDOR (shapely), não no navegador — e o motivo é geométrico: cortar o anel do polígono no navegador não garante partição exata em zona CÔNCAVA (a linha entra e sai várias vezes), nem em zona com ILHA, nem em zona com FURO. Um vão de meio metro na divisa entre duas zonas não fica escondido: reaparece na suavização e no shapefile exportado. Agora as partes reconstituem a zona exatamente, com a MESMA linha servindo às duas.',
    'Zona com ilha não perde a ilha: se a linha cortou só o corpo principal, a ilha entra na parte mais próxima em vez de virar uma zona solta no mapa.',
    'A área mínima continua sendo AVISO e não bloqueio (quem viu o talhão decide se 1,2 ha vale uma zona), e o editor avançado continua a um clique: o link "Preciso mexer em vértice ou recortar uma ilha" abre a tela cheia de antes.',
    'Enquanto o traço está sendo desenhado, a seleção fica travada na zona em corte — clicar no mapa alimenta a linha, não troca de zona.',
    'QUEM USA O INTERPOLADOR DESTA MÁQUINA precisa baixar o pacote novo em Configurações: a rota do corte é nova e o backend antigo responde "o servidor ainda não tem esta função". Na nuvem já vai atualizado.',
    '14 testes (npm run teste:corte) travam a matemática do corte: soma das áreas preservada, partes sem sobreposição, zona côncava, zona com furo, zona com ilha, traço que parou dentro e as mensagens de erro de quando a linha não atravessa.',
  ],
  '2.29.0': [
    'A CLASSIFICAÇÃO SUGERIDA CHEGOU AO EDITOR MANUAL (botão "Sugerir classificação", ao lado de Unificar/Reclassificar/Dividir). Era o lugar certo: é ali que se corrige o mapa à mão, e o editor já tem desfazer, histórico e "salvar como nova versão". Antes ela só existia no Laboratório.',
    'A conta é a mesma da validação — média medida de cada zona na camada escolhida (produtividade, NDVI, condutividade ou fertilidade, você escolhe no seletor) e a separação estatística entre elas. Zonas que não se distinguem recebem a MESMA classe, e a lista mostra "atual → sugerida" zona a zona, com a média que justificou cada uma.',
    'IMPORTANTE: a sugestão lê a CÓPIA DE TRABALHO, não o zoneamento salvo. Se você acabou de unir duas zonas ou dividir uma, ela enxerga o mapa como está agora na tela — e não o que está gravado.',
    'Aceitar aplica no editor como qualquer outra edição: entra no histórico (dá para desfazer), conta como reclassificação no rodapé e só vira versão quando você clicar em "Salvar como nova versão".',
  ],
  '2.28.0': [
    'ICA SAIU DE DENTRO DO IQZM — os dois agora se leem lado a lado, em destaque: "IQZM 91 (Excelente)" e "ICA 48 (Baixa confiabilidade — apenas uma safra disponível)". Na versão anterior a confiança entrava na média do IQZM com peso 5%, o que era o pior dos dois mundos: uma nota alta apoiada em uma safra só caía para 87 e continuava parecendo excelente — o alerta sumia dentro do número que deveria qualificar. Qualidade do MAPA e confiança da BASE são perguntas diferentes.',
    'O ICA ganhou os dois fatores que faltavam: QUALIDADE DOS DADOS (ruído da camada — % de valores fora da cerca de Tukey) e CONSISTÊNCIA DOS MAPAS (quanto do talhão cada camada realmente cobre, medido na mesma malha; um NDVI com metade do talhão sob nuvem ou um mapa de colheita que parou no meio da lavoura derrubam a confiança e aparecem pelo nome).',
    'TETO POR NÚMERO DE SAFRAS: com uma safra o ICA não passa de 48 (Baixa), com duas de 68, com três de 84 — acima disso, sem teto. Antes, um mapa único e perfeito empurrava a confiança para 55 ("média") porque cobertura, resolução e ruído batiam no máximo. Uma safra é UMA observação de um sorteio (o ano climático), e nenhuma qualidade de mapa substitui repetição — o relatório diz isso com todas as letras: "os demais fatores dariam 55, mas o índice é limitado a 48 enquanto houver uma safra só".',
    'Alerta novo quando a nota é alta e a base é fraca: "o IQZM descreve o que estes dados MOSTRAM, não o que o talhão É — trate como hipótese e confirme antes de investir". E o "aprovado para prescrição" deixou de aparecer nesse caso: aprovar e alertar ao mesmo tempo confundia mais do que ajudava.',
    'CLASSIFICAÇÃO DE POTENCIAL SUGERIDA (novo, no Laboratório): a validação já mede a média de cada zona e já sabe quais zonas NÃO se distinguem estatisticamente — então ela propõe a classe de cada uma (Alta → Baixa), mostra "classe atual → sugerida" numa tabela e espera o seu aceite. Zonas indistinguíveis recebem a MESMA classe, porque dar nomes diferentes a elas criaria dose diferente no campo sem diferença real no dado; e o número de classes sai dos grupos distintos, não do número de zonas.',
    'O aceite grava uma VERSÃO NOVA ("… — Classificação validada"), com a reclassificação registrada no histórico. O zoneamento atual continua intacto, como em toda operação do módulo.',
    'Número inteiro no painel deixou de sair com casa decimal ("1 safra", não "1,0 safra").',
  ],
  '2.27.0': [
    'VALIDADOR DE ZONAS DE MANEJO (módulo novo, em Zonas de Manejo → Laboratório): mede a qualidade de cada cenário com 16 indicadores e ranqueia os cenários pelo IQZM. Até agora o "melhor cenário" era o de menor CV médio — e o CV sozinho não enxerga três coisas que decidem se o mapa presta: zonas que não se distinguem entre si, mapa picotado em respingos que a máquina não consegue aplicar, e padrão que não se repete de uma safra para a outra.',
    'OS 4 ÍNDICES: IVR (variabilidade relativa — CV + amplitude p95−p5 + IQR + outliers, para um ponto ruim de colhedora não reprovar uma zona boa); IPE (persistência — quanto do padrão se repete entre safras, comparando cada safra classificada nos próprios terços); ICA (confiança da base — safras, camadas, resolução, cobertura e nº de observações, apontando qual é o gargalo); e o IQZM, resumo executivo que compõe homogeneidade, separação, continuidade, fragmentação, persistência e confiança.',
    'O DASHBOARD MOSTRA OS 16 SEMPRE — IQZM, ICA, IVR, IPE, CV, média, mediana, mínimo, máximo, amplitude, desvio, fragmentação, homogeneidade, continuidade, separação e número de safras. O que não dá para calcular aparece como "sem dado" dizendo o que falta, em vez de sumir da tela ou virar zero. Cada número traz a justificativa ao lado, com os limiares usados, e há uma tabela zona a zona.',
    'SEM SAFRAS SUFICIENTES, O IPE FICA EM ABERTO: com uma safra só o app diz "não há o que comparar — fica em aberto até a próxima colheita", o IQZM sai marcado como PARCIAL (o peso do IPE é redistribuído, nunca zerado) e uma recomendação avisa para tratar o zoneamento como hipótese a confirmar.',
    'ZONAS DEMAIS AGORA APARECEM: o η² (quanto da variação as zonas explicam) sempre sobe quando se criam mais zonas, então sozinho ele premiaria picotar o talhão. A separação passou a descontar os pares VIZINHOS que não se distinguem (d de Cohen < 0,5) e a recomendação diz quais juntar — num teste com 6 zonas sobre 3 padrões reais, o cenário de 3 zonas vence.',
    'Toda recomendação declara em quais indicadores se baseia. 32 testes (npm run teste:validacao) travam as regras do módulo, incluindo os casos em que a estatística ingênua erra: outlier de colhedora, camada centrada em zero (CV explodindo), mapa fragmentado e zonas redundantes.',
  ],
  '2.26.0': [
    'EDITOR MANUAL — AS 5 CLASSES PADRÃO APARECEM SEMPRE NO RECLASSIFICAR: até agora só dava para escolher entre as classes que JÁ existiam no mapa. Num zoneamento que saiu com "Muito alto / Alto / Médio-alto" não havia como marcar uma zona como Média, Média-baixa ou Baixa — justamente o ajuste que se faz à mão quando o mapa erra a zona. Agora Alta, Média-alta, Média, Média-baixa e Baixa estão sempre na lista; as que ainda não existem no mapa aparecem com a borda tracejada, para você saber que está criando um degrau novo na escala.',
    'A ordem das classes que já estão no mapa NUNCA muda — é o rank que ordena a dose na prescrição, e embaralhar isso trocaria o produto de lugar no campo. A classe nova entra no lugar dela no semáforo (uma Média entra abaixo do Médio-alto, uma Alta entra acima de todas) e a escala é renumerada para continuar contígua. Como o rank guarda a distância entre as classes, uma zona que vira Baixa num mapa de zonas altas recebe dose bem diferente delas — que é o que se espera.',
    'CORRIGIDO — trocar de versão com o editor manual ABERTO mantinha as zonas da versão anterior na tela: o título mudava, a lista não. Quem salvasse ali gravaria as zonas erradas na versão nova. Agora o editor recarrega ao trocar de versão.',
    'Nova bateria de testes (npm run teste:escala) trava a regra da ordem: 7 casos, incluindo mapa com nomes fora do padrão ("Argila A/B") e mapa sem nenhuma classe conhecida.',
  ],
  '2.25.2': [
    'PDF DA PRESCRIÇÃO — CORES VERDE → AMARELO → VERMELHO: o mapa era uma rampa de verde-claro a verde-escuro e, quando as doses são próximas (344 e 354 kg/ha), a folha inteira saía do mesmo verde pálido — ninguém via onde entrava mais produto. Agora VERDE é a menor dose e VERMELHO a maior, com amarelo no meio, e o quadradinho de cada zona na tabela usa exatamente a mesma cor da mancha do mapa. A legenda ganhou "menor dose / maior dose" nas pontas.',
    'A FOLHA DEIXOU DE TERMINAR EM BRANCO: o mapa ocupava pouco mais da metade da altura e o quadro RESUMO parava no meio da página, com um palmo de papel vazio embaixo dos dois lados. O mapa cresceu (capturado na proporção do quadro, sem achatar o satélite), a tabela de doses mostra mais zonas quando há espaço, e o RESUMO desce até o rodapé — a fonte é a maior que couber (até 9,5) e a folga vira respiro ENTRE os itens, não entrelinha esticada.',
    'Com muitas zonas nada disso invade o rodapé: a tabela corta no que cabe (com a linha "… +N zona(s) — planilha completa no Excel") e o RESUMO usa a fonte menor. Verificado gerando o PDF de verdade com 5 e com 22 zonas.',
  ],
  '2.25.1': [
    'ÁREA SEMPRE COM DUAS CASAS DECIMAIS, INCLUSIVE O ZERO FINAL: a regra de casas por grandeza (2.25.0) fazia sentido para doses e totais, mas engolia a casa da área — um talhão de 159,38 ha aparecia como "159 ha" no relatório. Área é o número pelo qual se fecha contrato, se paga serviço e se confere talhão contra a matrícula: agora sai 159,38 ha, 159,40 ha, 159,00 ha — o zero final também informa, porque "159,4" parece truncado.',
    'A regra vale em todo lugar onde a área aparece: PDF, Excel e SHP das Prescrições, relatórios de NDVI (talhão e fazenda), Comparação Produtividade × NDVI, MDE (inclusive a área por classe de relevo e de declividade), a planilha de Conferência de Cadastro e as telas de Prescrições, Produtividade, Recomendação, Arquivos e Cruzamento com relevo.',
    'No Excel a área continua NÚMERO (some, filtre e cruze normalmente) — o zero final vem do formato da célula (0,00), não de virar texto.',
  ],
  '2.25.0': [
    'RELATÓRIOS — CASAS DECIMAIS PELA GRANDEZA DO NÚMERO: acima de 100 a casa decimal não informa nada e só polui ("391 kg/ha" é a dose; "391,1" finge uma precisão que a distribuidora não entrega). Abaixo de 100 ela É o dado — sementes por metro linear é 12,52, e arredondar para 13 erra a população em quase 4%. A regra vale na tabela de doses, no resumo, no Excel e no arquivo SHP: número grande sai inteiro, número pequeno com até duas casas (e sem zero à toa: 2,5 em vez de 2,50).',
    'CORRIGIDO — SINAIS QUE SUMIAM DO PDF: a linha do cálculo saía "Faltante: 180,0 0,0 = 180,0", sem o menos, porque o "−" e o "÷" que usávamos não existem na fonte do PDF e eram descartados na hora de desenhar. Pelo mesmo motivo, P₂O₅ e K₂O apareciam como "PO" e "KO". Agora o relatório usa sinais simples (- e /) e escreve P2O5 e K2O; na tela e no Excel os símbolos bonitos continuam.',
    'CORRIGIDO — "PRODUTO BASE: MAP · 0,0 kg/ha": quando a base vem de uma prescrição em taxa variável, não existe uma dose única para imprimir, e o relatório mostrava zero. Agora ele diz o que de fato aconteceu: "MAP aplicado em TAXA VARIÁVEL (Dose de fertilizante v3), 172 a 209 kg/ha · garantia 12% de N", quanto isso já forneceu, quanto faltou, e que a dose do complemento foi calculada ZONA A ZONA para fechar a meta.',
  ],
  '2.24.2': [
    'CORRIGIDO — OS PAPÉIS ESTAVAM INVERTIDOS NA COMPLEMENTAÇÃO: ao usar uma prescrição salva como base, o produto dela deveria ser o BASE e a escolha livre deveria ser o COMPLEMENTO — mas a tela fazia o contrário, prendendo o complemento no produto do topo e deixando o base num seletor solto, que podia até divergir da prescrição escolhida. Agora, escolhida a prescrição base, o produto dela aparece como Produto base em modo leitura (com a garantia do cadastro), e você escolhe a fórmula do complemento no campo "Fórmula do complemento" — que é a decisão de verdade. Escolher ali também define o Produto da prescrição, que passa a se chamar "o que ESTA prescrição aplica (o complemento)".',
    'Prescrição salva ANTES da Biblioteca de Insumos não tinha produto vinculado e vinha sem garantia; agora o app casa pelo nome do produto ("MAP" → insumo MAP) e traz a garantia do cadastro.',
    'Aviso novo quando o complemento fica com o MESMO produto do base — a conta existiria, mas não faz sentido agronômico complementar um adubo com ele mesmo.',
  ],
  '2.24.1': [
    'CORRIGIDO — CAMPO NUMÉRICO NÃO ACOMPANHAVA MUDANÇA FEITA PELO APP: em toda a tela de Prescrições, os campos de número guardavam o texto digitado e nunca o atualizavam quando o próprio app mudava o valor. A conta usava o número novo e a tela continuava mostrando o velho — acontecia ao restaurar a garantia do cadastro, ao trocar o nutriente de referência, ao clicar em "Usar como Total disponível" e ao escolher um insumo que traz PMS e germinação junto. Agora o campo acompanha, sem atrapalhar quem está digitando ("2," continua sendo "2," até você terminar).',
    'GARANTIAS SEMPRE DO CADASTRO, com a alteração manual como exceção visível: embaixo de cada campo de garantia o app diz de onde veio o número — "do cadastro de MAP" — e, se você digitar por cima, passa a mostrar "alterado à mão · cadastro: 45,0%" com o atalho "usar o do cadastro" para voltar. Trocar o nutriente de referência relê a garantia dos DOIS produtos (garantia é por nutriente: o MAP tem 12% de N e 52% de P₂O₅). O nutriente já vem em Nitrogênio (N).',
    'Produto sem o nutriente escolhido declarado na Biblioteca é avisado pelo nome ("Ureia não tem P₂O₅ declarado"), em vez de calcular com zero em silêncio.',
  ],
  '2.24.0': [
    'COMPLEMENTAÇÃO POR NUTRIENTE — O PRODUTO BASE PODE SER UMA PRESCRIÇÃO JÁ SALVA: em vez de digitar "dose aplicada" à mão, escolha a prescrição do talhão que já foi feita (ex.: "MAP na semeadura v1"). O app puxa dela o produto, a garantia do nutriente e — o que muda o resultado — a dose de CADA ZONA. Digitar uma dose única jogava fora a taxa variável que já tinha sido decidida no adubo de base: onde o MAP entrou com 250 kg/ha já foram 30 kg/ha de N, e onde entrou com 160 foram 19,2 — cada zona precisa de um complemento diferente.',
    'O resumo passa a mostrar a faixa: "Base MAP (MAP na semeadura v1): 160–250 kg/ha × 12% = 19,2–30,0 kg/ha de N · meta 200 − fornecido = 170,0–180,8 faltando · Ureia a 45%: 377,8–401,8 kg/ha (varia por zona)". Ao aplicar, cada zona recebe a sua dose — a taxa variável do produto base se propaga para o complemento, invertida (quem recebeu menos base recebe mais complemento).',
    'O produto complementar deixou de ser um segundo seletor: é o produto da própria prescrição, escolhido no topo da tela, e a garantia vem do cadastro sozinha (trocar o nutriente de referência relê a garantia dos dois produtos, que é por nutriente). Se o produto escolhido não tiver aquele nutriente declarado na Biblioteca, o app avisa em vez de calcular com zero.',
    'Zona sem dose no produto base (zoneamento diferente, por exemplo) é avisada e recebe a meta inteira do complementar, em vez de sumir do cálculo em silêncio.',
  ],
  '2.23.0': [
    'BIBLIOTECA DE INSUMOS (módulo novo, em Biblioteca → Insumos): cadastro central dos produtos, com sete categorias — Fertilizantes minerais, Corretivos, Gesso, Estercos, Compostos orgânicos, Sementes e Produtos personalizados. O que muda de verdade é a GARANTIA: até agora o produto da prescrição era texto livre ("Ureia", "ureia 45", "URÉIA" eram três produtos diferentes) e o teor de cada nutriente não existia em lugar nenhum — ficava na cabeça de quem prescrevia. Fertilizante, corretivo e gesso guardam N, P₂O₅, K₂O, S, Ca, Mg em % (e micros); esterco e composto guardam as garantias em kg/t mais umidade, matéria seca e densidade; semente guarda cultura, cultivar, PMS, germinação, vigor e embalagem. Todos aceitam preço médio, fornecedor e observações.',
    'PRESCRIÇÕES — O PRODUTO AGORA VEM DA BIBLIOTECA: o campo virou um seletor dos insumos da categoria compatível com o tipo da prescrição, e escolher o produto já traz junto o que o cadastro sabe (preço, garantias do orgânico, PMS e germinação da semente) — sem redigitar e sem divergir do cadastro. Prescrições antigas, salvas quando o campo era livre, continuam abrindo e exportando: o nome gravado aparece como "(cadastro antigo)".',
    'NOVO MODO DE CÁLCULO — COMPLEMENTAÇÃO POR NUTRIENTE (só para fertilizante mineral): escolha o nutriente de referência e a meta, informe o produto BASE que já vai ser aplicado com a dose dele, e o produto COMPLEMENTAR. O app desconta o que o base entrega e calcula a dose que fecha a meta, com a conta inteira à vista: "MAP 200 kg/ha × 12% = 24 kg/ha de N · meta 200 − 24 = 176 faltando · Ureia: 176 ÷ 45% = 391,1 kg/ha". A dose entra igual em todas as zonas e você ajusta zona a zona na tabela para taxa variável.',
    'Os dois erros que a conta crua cometeria viram AVISO em vez de dose errada: quando o produto base já passa da meta (o faltante daria negativo e a dose, "menos que nada") e quando o complementar não tem garantia declarada do nutriente (divisão por zero, que chegaria à máquina como dose absurda). Nos dois casos a dose fica em zero e o app diz por quê. 9 testes travam isso em npm run teste:insumos, incluindo o exemplo da especificação.',
    'O PDF e o Excel da prescrição trazem a complementação inteira — nutriente, meta, produto base com garantia e dose, quanto ele forneceu, o faltante, o produto complementar e a dose calculada —, porque é essa conta que justifica a dose para quem recebe o relatório.',
  ],
  '2.22.1': [
    'CORRIGIDO — RELATÓRIO DE ADUBO FALAVA EM "POPULAÇÃO" E "GERMINAÇÃO": germinação é assunto de semente, mas o marcador de "a dose que eu digito é população" ficava ligado de uma prescrição anterior e acompanhava a troca de tipo. O PDF de um MAP saía com as colunas População e População ajustada e com "ajuste de germinação (97%)" no resumo — números certos, texto sem sentido nenhum para adubo. Agora quem decide é a UNIDADE: fora de sementes/ha e sementes/m não há compensação, a coluna volta a se chamar Dose, o resumo fala em dose e quantidade usada, e trocar o tipo para fertilizante, corretivo ou orgânico já desliga o marcador.',
    'O texto do quadro RESUMO no PDF ganhou respiro: encostava na borda direita da moldura e a última linha ficava colada no traço de baixo. As linhas em destaque passaram a ser medidas em NEGRITO para a quebra — era por isso que justamente elas vazavam, já que o negrito ocupa mais espaço que a fonte usada na medição.',
  ],
  '2.22.0': [
    'PRESCRIÇÕES — SALVAR ALTERAÇÕES NÃO APAGA MAIS A VERSÃO ANTERIOR: até agora, "Salvar alterações" sobrescrevia o registro e apenas subia o contador — a v1 virava v2 no mesmo lugar e o que tinha sido mandado para a máquina antes deixava de existir, sobrando só uma linha de texto no histórico. Prescrição é documento operacional: agora CADA VERSÃO é um registro próprio, com as suas doses, o seu mapa congelado e os arquivos que ela gerou. Salvar cria a versão nova e a anterior continua salva, inteira.',
    'A lista mostra a versão mais recente aberta e as anteriores atrás de "ver versão(ões) anterior(es)" — recuadas e discretas, cada uma com os próprios botões de Abrir no editor, SHP, Excel e PDF. Assim dá para reexportar exatamente o arquivo de uma versão antiga sem refazer conta nenhuma. O contador passou a contar PRESCRIÇÕES, não versões: três versões da mesma prescrição contam como uma.',
  ],
  '2.21.0': [
    'MAPA DOS RELATÓRIOS SEM AS LINHAS BRANCAS: todo PDF com foto de satélite saía riscado por uma grade de linhas claras — Fertilidade, NDVI, Zonas, MDE, Comparação, Cenários e Prescrições. Não era desenho nenhum: o mosaico de satélite colocava cada quadradinho (tile) em coordenadas quebradas e, entre um e outro, sobrava uma fresta de menos de um pixel por onde aparecia o fundo branco da folha. Agora cada tile é encaixado em pixels inteiros e encosta no vizinho: a grade some de todos os relatórios de uma vez.',
    'PRESCRIÇÕES, TABELA DO PDF — DUAS COLUNAS DE VERDADE: "Pop. → dose" era uma coluna só, espremida num vão de 22 mm, e o título invadia o da coluna vizinha (a seta ainda saía como lixo, "!\u2019", porque não existe na fonte do PDF). Agora são POPULAÇÃO e POPULAÇÃO AJUSTADA, com cabeçalho em duas linhas e números alinhados pela direita.',
    'PRESCRIÇÕES, RESUMO DO PDF REESCRITO: era uma pilha de números sem dizer qual era qual — uns em população, outros em semente. Agora traz, nomeados: o total SEM ajuste (a população que você pediu), o total COM ajuste de germinação, e a diferença a mais para comprar. Havendo PMS cadastrado, os três saem também EM QUILOS, que é como se compra semente. A última linha avisa, em destaque, que o arquivo de aplicação JÁ SAI com o ajuste — a máquina recebe a taxa corrigida, não a população desejada.',
    'A planilha do Excel acompanha: as colunas passaram a se chamar População e População ajustada, e o resumo ganhou os dois totais, o peso em quilos e a mesma observação sobre o arquivo.',
  ],
  '2.20.2': [
    'PRESCRIÇÕES — "SALVAR" DEIXOU DE PARECER MORTO: o botão salvava, mas a confirmação (e o aviso de campo faltando) aparecia no TOPO da aba, a mais de 700 pixels do botão, que fica no fim de uma tela longa — quem clicava não via nada acontecer e concluía que o botão não funcionava. Agora o retorno sai logo abaixo do botão, onde o olho está.',
    'A PRESCRIÇÃO SALVA APARECE EMBAIXO, na própria aba Nova — "Prescrições salvas (N)", como já acontece nas Zonas de Manejo e no NDVI: nome, produto, versão, data, responsável, o resumo das doses e os botões de Abrir no editor · SHP · Excel · PDF · Excluir. Antes era preciso trocar para a aba "Salvas" para ter certeza de que o trabalho tinha sido gravado. A aba "Salvas" continua existindo e mostra os mesmos cartões.',
  ],
  '2.20.1': [
    'EXPORTAR DEIXOU DE SER UM PORTÃO FECHADO: gerar SHP, Excel ou PDF esbarrava em duas travas que não protegiam nada de verdade. A primeira era "Salve a prescrição antes de exportar" — agora, se ela ainda não foi salva, o app SALVA e exporta na sequência (o arquivo continua rastreável, com versão registrada; só sumiu a ida e volta até o outro botão). A segunda era o "estoque insuficiente": quando a conta não fechava com o disponível informado, os três botões travavam. Isso agora é uma PERGUNTA — o app mostra quanto passou e você decide se manda assim mesmo ("a prescrição usa 314,7 kg e o disponível é 50,0"). Continuam bloqueando de verdade só os casos em que o arquivo sairia quebrado: geometria inválida, zona sem dose e dose em sementes/m sem o espaçamento.',
  ],
  '2.20.0': [
    'PRESCRIÇÕES — COMPENSAÇÃO DA GERMINAÇÃO (novo, tipo População de sementes): marque "a dose que eu digito é a população desejada" nos Parâmetros da semente e informe a germinação. Você continua trabalhando em plantas/ha — 80.000 —, e o SHP, o Excel e o PDF saem com a TAXA DE SEMEADURA compensada: 80.000 com 90% de germinação viram 88.889 sementes/ha no arquivo. Sem isso, os 80.000 iam crus para a máquina e a lavoura nascia com ~72.000 plantas — um erro que só aparece depois de emergida. A tabela mostra as duas colunas (o que você pediu e o que vai no arquivo), o resumo traz o total de sementes que sai do depósito, e a população-alvo fica registrada no Excel, no PDF e no SHP (campo pop_alvo) para conferência lá na frente.',
    'DOSE COM CASAS DECIMAIS QUE SERVEM PARA O CAMPO: a distribuição fecha o total exato e devolvia dízimas — "84352,78766265 sementes/ha" na tela e no arquivo. Ninguém regula máquina em milésimo de semente, e o número comprido ainda esconde a ordem de grandeza, que é o que se confere. Agora número grande (a partir de 1.000) sai inteiro e o resto com no máximo 2 casas — o que 2,5 t/ha ou 0,75 L/ha precisam. Quando o passo da máquina importa, quem manda continua sendo o campo Incremento.',
    'DOIS MODOS DE CÁLCULO A MENOS: "Quantidade total disponível" e "Distribuição proporcional" saíram da tela — faziam, com outro nome, o que "Dose base + ajuste % por zona" já faz. O que só o de estoque acrescentava (informar o disponível em sacos, quilos, milhões ou "tenho para uma média de X mil/ha") virou o botão "Usar como Total disponível" dentro do próprio ajuste, com a margem de segurança já descontada. Prescrições salvas nos modos antigos continuam abrindo, recalculando e exportando.',
    'EXPORTAÇÃO DESTRAVADA QUANDO O TOTAL É UMA META: informar o disponível POR HECTARE é dizer uma meta agronômica (80.000/ha), e os limites de dose mín/máx quase sempre fazem sobrar ou faltar um pouco — isso bloqueava PDF, Excel e SHP com "estoque insuficiente". Agora nesse caso vira AVISO e o arquivo sai; quando o total é estoque físico (sacos comprados), continua bloqueando, porque dali não se tira o que não existe.',
    'CORRIGIDO — a germinação que aparecia como 90% era só o valor do campo: sem você encostar nele, nada era gravado e a compensação simplesmente não acontecia, embora o aviso na tela prometesse a taxa corrigida. Marcar a compensação passa a gravar a germinação junto.',
    'Os parâmetros da semente (PMS, germinação, espaçamento, sementes/saco, população mín/máx) passam a aparecer em QUALQUER modo de cálculo — antes só existiam nos dois modos que foram removidos, e faltavam justamente na dose manual.',
  ],
  '2.19.0': [
    'LAUDO EM COLUNAS (InCeres / Interpartner) AGORA É RECONHECIDO SOZINHO — a planilha com "id" e "prof" nas duas primeiras colunas não entrava: a tela abria sempre no perfil "Fundação ABC", que procura o número do ponto numa coluna que nesse arquivo é o V%, nenhuma linha casava e o resultado era "Nenhuma amostra" — que se lê como "o app não reconheceu a planilha". Entrou o perfil "InCeres / Interpartner (colunas id · prof)" e, principalmente, a tela passou a PRÉ-SELECIONAR o perfil que casa com o arquivo que você acabou de carregar, em vez de deixar o primeiro da lista marcado.',
    'P E MO VOLTARAM A ENTRAR: no auto-mapeamento, as colunas "P res" e "MOS" (os nomes que a InCeres usa para Fósforo Resina e Matéria Orgânica Seca) eram descartadas em silêncio. As outras nove colunas mapeavam normalmente, então a importação parecia ter dado certo — e o laudo entrava justamente sem os dois parâmetros que mais se olha. Um laudo de 79 pontos que entrava com 9 variáveis agora entra com 17.',
    'A UNIDADE PASSOU A SER LIDA DO PRÓPRIO LAUDO: esses arquivos trazem uma segunda linha de cabeçalho só com as unidades ("mmolc/dm³", "g/dm³", "Sem Unidade"). O app ignorava essa linha e ASSUMIA que o laudo já vinha no padrão da plataforma — acertava por sorte quando o laboratório usava o mesmo padrão de São Paulo. Agora a linha é reconhecida, cada unidade já aparece marcada no bloco "Unidade no laudo", a conversão sai certa quando o lab manda em cmolc/dm³ ou ppm, e a linha de unidades não é mais contada como amostra.',
    'AVISO NOVO — "ESTE PERFIL NÃO PARECE SER DESTE ARQUIVO": perfil de colunas fixas aplicado no laudo errado é pior do que perfil que não funciona. Escolhendo "Fundação ABC (planilha)" para um laudo InCeres, entravam as 119 amostras sem erro nenhum e com tudo deslocado — o pH do laudo gravado como P, o P gravado como pH, o K como Al, a Argila como m%. Agora a plataforma confere o que o perfil espera em cada coluna contra o cabeçalho que está lá e mostra uma tarja amarela dizendo quantas colunas não batem e um exemplo concreto do desencontro, antes de importar.',
    'GRANULOMETRIA COMPLETA E MAIS COLUNAS APROVEITADAS: Silte e Areia (total, grossa e fina) entraram no catálogo de Variáveis de Análise e já vêm LIGADAS — antes só a Argila era lida e o resto da granulometria do laudo era jogado fora. Outras colunas comuns (SB, H+Al, H/Al%, H%, C, K em mg, pH KCl/CaCl2/SMP e as relações Ca/Mg, Ca/K, Mg/K, Ca+Mg/K, S/P, K/Na, Fe/Mn, P/Zn) passaram a ser reconhecidas pelo nome curto que os laudos realmente usam: continuam DESLIGADAS, e agora basta ligar o "Usar" em Biblioteca → Preferências de Análise → Variáveis de Análise para elas entrarem sozinhas na próxima importação. "Ca/Mg" (a relação) e "Ca+Mg" (a soma) deixaram de ser confundidas uma com a outra.',
    'PRESCRIÇÕES — PUREZA E SOBREVIVÊNCIA SAÍRAM da tela de parâmetros da semente (aba Prescrições → Parâmetros da semente). A taxa de semeadura passa a ser compensada só pela GERMINAÇÃO. Prescrição salva antes disto que tivesse esses dois campos preenchidos passa a ignorá-los e recalcula — melhor do que manter um fator agindo na conta que ninguém mais consegue ver nem editar.',
  ],
  '2.18.0': [
    'PRESCRIÇÕES — AS ZONAS APARECEM NO MAPA, COM A DOSE ESCRITA EM CADA UMA: a aba montava a tabela e não publicava nada no mapa — o mapa ficava só com o limite do talhão e a prescrição era decidida no escuro, sem ver onde cada dose cai. Agora, ao escolher o zoneamento (mapa-base), as zonas entram no mapa com as cores delas e o rótulo de cada uma mostra o número que vai para a máquina: "Zona 01" e, embaixo, a dose com a unidade ("80.000 sementes/ha"). Antes de calcular, aparece só o nome da zona — depois de calcular, a dose de cada uma, inclusive o zero de quem não recebe aplicação.',
    'TOTAL DISPONÍVEL AGORA ACEITA O NÚMERO POR HECTARE (modos "Quantidade total disponível" e "Dose base + ajuste % por zona → Total fixo"): o campo pedia um estoque fechado, mas o número que costuma estar na mão é POR HECTARE — "80.000 sementes/ha". Digitado como total, 80.000 viravam ~1.500/ha num talhão de 52 ha: a prescrição saía cinquenta vezes menor sem nada avisar. Ao lado do campo há dois botões — total (sementes) e por hectare (sementes/ha); trocar de um para o outro mantém o número que você digitou e muda o significado, e o valor absoluto usado na conta aparece escrito embaixo ("= 8.392.000 sementes em 104,9 ha").',
    'O quadro "Usado" agora traz a MÉDIA POR HECTARE embaixo do total — é esse o número que se confere com o agrônomo ("fechou em 80.000/ha?"), e não o total absoluto do talhão.',
    'O mapa não se reenquadra mais a cada recálculo: o reenquadramento passou a seguir a geometria das zonas, e não o texto do rótulo — que agora muda toda vez que a dose muda.',
  ],
  '2.17.0': [
    'TELA DE VERSÕES DO ZONEAMENTO (aba Zonas de Manejo → bloco "Zoneamentos e versões", antes "Zoneamentos salvos"): a lista era plana e "Zoneamento 1", "Zoneamento 1 — Suavização leve" e "Zoneamento 1 — Suavização leve — Ajuste manual" apareciam soltas, lado a lado com zoneamentos de outra origem. A história sempre existiu no dado — toda suavização e todo ajuste manual já gravavam de qual versão vieram — mas não era mostrada, e ninguém sabia o que veio de quê. Agora cada zoneamento vira uma LINHA DO TEMPO: V1 → V2 → V3, com data, quem fez, de qual versão derivou e o que aquela versão mudou (nível da suavização, vértices antes/depois, quantas unificações e reclassificações, hectares que mudaram de lugar). Cada zoneamento tem a própria contagem — a V1 de um não vira V4 por causa do outro.',
    'COMPARAR DUAS VERSÕES: clique no selo V de duas versões da mesma linha do tempo e o botão "Comparar V1 × V3" abre o Laboratório de Zonas já nos dois cenários escolhidos — concordância espacial e área por classe lado a lado, sem ter que reencontrar as duas numa lista onde os nomes só diferem no sufixo.',
    'RESTAURAR UMA VERSÃO ANTERIOR: o botão ↺ COPIA a versão escolhida para o topo da linha do tempo em vez de apagar o que veio depois — nada é sobrescrito, e o histórico inteiro continua lá. Se aquele zoneamento era o oficial, a cópia já assume o Padrão (que é a versão usada pela Amostragem e pelas Prescrições).',
    'RENOMEAR VERSÃO (botão de etiqueta): dê o nome que o cliente usa — "Operacional plantio 26/27" — sem perder o registro de que ela é a V2 derivada da V1 por suavização.',
    'EXCLUIR AGORA AVISA ANTES: diz quantas versões dependem daquela e se ela é a Padrão (a Amostragem e as Prescrições ficam sem zoneamento oficial). E versão cuja origem foi excluída NÃO some da tela: ela vira o começo de uma linha do tempo própria, marcada com o aviso de qual versão foi apagada — o trabalho feito depois dela continua acessível. 12 testes automáticos travam a reconstrução da história (npm run teste:versoes).',
  ],
  '2.16.0': [
    'ZONEAMENTO NATIVO — A ZONA IMPORTADA PASSA A TER TUDO O QUE A ZONA GERADA TEM. Até aqui, o mapa que vinha pronto do cliente ficava como um arquivo colado no talhão: aparecia no mapa, e só. Suavizar, editar, versionar, exportar e prescrever operam sobre um ZONEAMENTO — com id, versão e histórico —, e o arquivo não era um. Não faltava ferramenta: faltava modelo. Agora a importação vira um Zoneamento Nativo, idêntico ao que a plataforma grava quando ELA gera as zonas, e todas as ferramentas passam a enxergá-lo sem saber da origem.',
    'IMPORTAR ZONEAMENTO PRONTO (aba Zonas de Manejo do talhão, bloco novo logo acima de "Gerar zonas por similaridade"): carrega SHP (.zip), KML ou GeoJSON e ABRE PARA CONFERÊNCIA antes de salvar — qual atributo é a classe, se o número 1 é a pior ou a melhor zona, e o nome de cada zona, editável à mão (útil quando o arquivo vem só com números, ou quando o cliente chama a zona de "Baixada úmida"). O mapa mostra a prévia colorida enquanto você decide; trocar o campo ou a direção reprocessa na hora, sem reabrir o arquivo. Arquivo em coordenadas projetadas (UTM, sem .prj) é barrado com a instrução de reprojetar, em vez de desenhar o talhão no lugar errado.',
    'TALHÃO QUE JÁ TINHA ZONAS COLADAS: o bloco "Zonas de Manejo (MEAP)" mostra o aviso e o botão "Transformar em Zoneamento Nativo" — converte o que já está lá, sem precisar do arquivo de novo, e mantém o zoneamento como o oficial da Amostragem.',
    'A conversão valida a geometria (descarta e AVISA o que não é polígono ou não tem área), padroniza os atributos, cria um id próprio por polígono (arquivo que numera o id pela classe fazia manchas sumirem ao editar) e salva como "V1 Importada" — versão preservada: suavizar ou editar depois cria uma versão nova ao lado dela. 14 testes automáticos travam o contrato (npm run teste:nativo), incluindo o caso que inverteria a prescrição: classe escrita em caixa alta e sem acento ("BAIXA") era ordenada como o MAIOR potencial.',
  ],
  '2.15.2': [
    'IMPORTAÇÃO DE ZONAS — A CLASSIFICAÇÃO ESCRITA PASSA NA FRENTE DO NÚMERO: um campo que diz "Alta / Média / Baixa" carrega a intenção de quem fez o mapa; um número é sempre interpretação nossa (e ainda depende de adivinhar se 1 é a melhor ou a pior zona). Antes as duas coisas somavam pontos, e num arquivo com poucos polígonos um campo numérico chamado "zona" vencia um campo textual chamado "descricao" — a classificação escrita era ignorada. Agora texto reconhecido fica numa faixa acima, que número nenhum alcança. Sem texto no arquivo, o numérico continua assumindo normalmente.',
    'PAINEL LATERAL DO TALHÃO — "Mapas definitivos" virou só visualização: a linha de Zonas de manejo oferece apenas "Ver no mapa". Carregar zoneamento passou para a aba Zonas de Manejo da página do talhão, que é onde o zoneamento é construído. Importar pelo painel lateral gravava o arquivo direto no talhão, sem passar pela conferência das classes — e era parte do motivo de as zonas importadas ficarem sem as ferramentas.',
  ],
  '2.15.1': [
    'CORRIGIDO — ZONA IMPORTADA VIRAVA UMA SÓ ("1 zona · N polígonos · Único"): a detecção do campo de classe só aceitava texto (alta/média/baixa). Arquivo com classe NUMÉRICA — 1..5, que é o que sai do QGIS e da maioria dos fornecedores — não era reconhecido: nenhum polígono recebia classe, todos caíam juntos e o mapa entrava na plataforma morto, sem nada para prescrever. Agora a classe numérica é reconhecida, ordenada e rotulada (Baixa → Alta).',
    'A escolha do campo ficou mais criteriosa: campos de identificação (id, fid, objectid, cod…) deixam de ser confundidos com classe, campos com valores demais (é identificador) ou com um valor só (não separa nada) são descartados, e campo preenchido pela metade perde para o campo completo. O valor original do arquivo fica guardado em cada polígono, para permitir remapear depois sem precisar reimportar.',
  ],
  '2.15.0': [
    'ZONAS POR QUANTIS (novo método, em Zonas de Manejo → Algoritmo): além de Fuzzy e K-means, agora dá para fatiar o mapa por QUANTIS — com 5 zonas é o quintil 20/40/60/80, o mesmo método do script de taxa variável que a equipe usa no QGIS. A diferença importa: o Fuzzy procura grupos naturais e a divisa cai onde os dados mudam (a área de cada zona varia); o quantil impõe a área — cada classe fica com ~1/nº do talhão, sempre. Quem trabalha com quintis conta com essa previsibilidade e com o fato de dois talhões ficarem comparáveis entre si.',
    'No modo Quantis a etapa "Analisar (FPI × NCE)" deixa de ser exigida — aquela curva mede separação de agrupamentos, e o quantil não agrupa: ele fatia. O bloco de escolha do número de zonas abre direto, já com 5 pré-selecionado. Área mínima de zona, ordenação Alta→Baixa e todo o restante do fluxo continuam iguais, inclusive gerar as zonas a partir de um NDVI salvo do talhão.',
  ],
  '2.14.0': [
    'PRESCRIÇÕES — NOVO MODO "DOSE BASE + AJUSTE % POR ZONA": é o jeito como a decisão costuma vir pronta do campo ("na zona fraca, 20% menos semente"). Você informa a dose base e digita o percentual de cada zona (negativo aplica menos, positivo aplica mais, −100% não aplica ali). Diferente do modo Proporcional, que DERIVA a dose de uma curva sobre o potencial: aqui quem manda é o número que o agrônomo digitou.',
    'DOIS CENÁRIOS COM A MESMA TABELA DE AJUSTES: "Livre" calcula dose = base × fator e o total sai como consequência — responde "quanto preciso comprar". "Total fixo" faz o contrário: você informa quanto TEM e o sistema recalcula a base para consumir exatamente aquilo, preservando as proporções entre as zonas. Limites de dose mín/máx e o incremento da máquina continuam valendo nos dois — e, quando eles impedem a conta de fechar exata no cenário de total fixo, o app AVISA em vez de deixar você descobrir na hora de carregar a máquina.',
  ],
  '2.13.0': [
    'CONFERÊNCIA DA GRADE EM EXCEL (novo): nas grades salvas do talhão (aba Amostragem → Grid), ao lado de KML · SHP · Etiquetas, entrou o botão "Conferência". Ele baixa uma planilha no mesmo formato que já circula com o laboratório — Produtor · Município · Fazenda · Talhão · ID · Profundidade · Análises — com UMA LINHA POR PONTO × PROFUNDIDADE. Serve para conferir, depois da amostragem, exatamente o que foi programado: o ponto que vai a 0-20 e 20-40 aparece em duas linhas, então o total de linhas bate com o número de sacos que sai do campo e com as etiquetas impressas (que usam a mesma expansão).',
    'A coluna Análises vem do padrão de elementos de CADA profundidade daquela grade (ex.: "Rotina + S" na superfície e "Rotina + Textura + Micro" na profunda) — e sai da configuração salva na grade, não do padrão atual, para a planilha refletir o que foi realmente programado mesmo que o padrão tenha sido editado depois. Profundidade sem padrão casado aparece como "—" em vez de sumir da lista, para o erro de cadastro ficar visível na conferência.',
  ],
  '2.12.3': [
    'SELETOR DE ANO AO LADO DA CULTURA (talhão): o seletor de Ano estava sozinho na ponta DIREITA do cabeçalho, longe do resto do contexto — quem abria o talhão não achava, e é ele que filtra tudo o que a página mostra. Agora fica na mesma linha de Cliente · Fazenda · Talhão · Área, logo ANTES da Cultura — que é a ordem certa, porque trocar o ano recarrega a cultura daquele ano. Nada mudou no funcionamento: só saiu de onde ninguém via para onde a informação é lida.',
  ],
  '2.12.2': [
    'IDENTIFICADOR DO APP NA LOJA: o app de Coleta passou a se chamar br.agr.invicta.coleta (antes br.com.invictaap.coleta, derivado de um domínio que não existe mais). Esse identificador é PERMANENTE depois da primeira publicação na Play Store, então foi corrigido agora, antes de publicar — a partir daqui ele acompanha o domínio real da empresa.',
    'ENDEREÇO DO SITE ATUALIZADO: o rodapé da tela de login e os rodapés dos PDFs (Fertilidade, Zonas, Campo e Prescrições) apontavam para invictaap.com.br, que saiu do ar. Agora mostram invicta.agr.br, o site novo.',
  ],
  '2.12.1': [
    'AGRÔNOMO RESPONSÁVEL POR FAZENDA (novo): ao cadastrar ou editar uma fazenda do produtor, agora dá para indicar o agrônomo responsável — escolhido entre os usuários da equipe (categoria "Interno" da Central de Acessos, ativos). Aparece no formulário de nova fazenda (no produtor) e na aba Dados da fazenda, e o nome do responsável fica visível no cartão de cada fazenda na lista do produtor. Se ainda não houver ninguém cadastrado como Interno, o campo orienta a cadastrar a equipe em Biblioteca → Acessos → Internos.',
  ],
  '2.12.0': [
    'PRESCRIÇÕES — NOVA UNIDADE "SEMENTES POR METRO LINEAR": além de sementes/ha, agora dá para trabalhar em sementes/m (como o operador regula a plantadeira). Basta informar o espaçamento entre linhas — o sistema converte para o total automaticamente (10.000 ÷ espaçamento = metros de linha por hectare; ex.: 0,5 m → cada semente/metro vale 20.000 sementes/ha). Totais, custo, resumo e exportações (SHP/Excel/PDF) já saem na conta certa; sem o espaçamento, o app avisa e não deixa exportar (arquivo de aplicação errado vira dose errada no campo).',
    'PRESCRIÇÕES — NOVO MODO "POR EQUAÇÃO SALVA": use uma equação já criada em Biblioteca → Equações (a MESMA da Recomendação) para calcular a dose de cada zona. Escolha a equação; o sistema detecta as variáveis que ela precisa (V, CTC, P…) e cria uma coluna por variável na tabela; você informa o número de cada zona (ou preenche rápido a partir do ranking de potencial, do número da zona ou da área) e clica em calcular. Mínimo, máximo e "não-negativo" definidos na própria equação são respeitados; zona sem valor é sinalizada sem derrubar as outras. A prescrição guarda a equação e os valores usados, para reproduzir e versionar.',
  ],
  '2.11.0': [
    'PRESCRIÇÕES AGRONÔMICAS (módulo novo): aba "Prescrições" no talhão (depois de Recomendações) — transforma as Zonas de Manejo em doses operacionais em TAXA VARIÁVEL e gera o arquivo de aplicação para a máquina. Seções: Nova · Salvas · Arquivos de Aplicação · Histórico · Planejado × Realizado (estrutura pronta, implementação futura). Tipos: sementes, fertilizante, corretivo, esterco/orgânico e produto personalizado. Cada prescrição tem versão, data, responsável e histórico de alterações — documento operacional rastreável, com as geometrias CONGELADAS na criação (mexer no zoneamento depois não muda o que já foi para a máquina).',
    'QUANTIDADE TOTAL DISPONÍVEL (o diferencial): informe quanto você TEM — 400 t de esterco, 12 t de calcário, 7.500 kg de adubo — e o sistema distribui entre as zonas respeitando prioridade agronômica (maior ou menor potencial primeiro), dose mínima, dose máxima, o incremento da máquina e a menor sobra possível. NUNCA ultrapassa o disponível: a garantia está travada por 16 testes automáticos (npm run teste:prescricao), incluindo estoque insuficiente (avisa a falta e ninguém passa do mínimo) e arredondamento pelo incremento sem estourar o total.',
    'POPULAÇÃO VARIÁVEL DE SEMENTES: fluxo próprio com cultivar, PMS, germinação, pureza, sobrevivência, espaçamento e população mín/máx — calcula sementes/ha, sementes por metro, kg/ha, população final e sacos. ESTOQUE DE SEMENTES em qualquer formato (total, kg, sacos, milhões ou "tenho para uma média de 285 mil/ha") + botão OTIMIZAR USO DAS SEMENTES: redistribui mantendo a média geral e consumindo praticamente todo o estoque, com margem de segurança configurável; falta ou sobra grande aparece ANTES de salvar.',
    'ESTERCO: análise química (N, P₂O₅, K₂O, Ca, Mg em kg/t) e a tabela mostra quanto de cada nutriente cada zona vai receber. DISTRIBUIÇÃO PROPORCIONAL: dose média + variação máxima (%) + relação direta ou inversa, mantendo a média exata ponderada por área. DOSE MANUAL: digite por zona e o resumo atualiza ao vivo.',
    'EDITOR + EXPORTAÇÃO: tabela de doses editável (cores pela dose), resumo ao vivo (área, usado, restante, mín/máx/média, custo) e exportação em SHAPEFILE (.zip, pronto para o monitor), EXCEL (doses + resumo) e PDF (mapa colorido pela dose + tabela + resumo, no padrão dos relatórios). VALIDAÇÃO antes de exportar: geometria inválida, zona sem dose, dose fora dos limites, estoque estourado e polígonos pequenos demais — erro bloqueia, aviso deixa seguir. Cada exportação fica registrada em "Arquivos de Aplicação".',
  ],
  '2.10.4': [
    'CORRIGIDO — "A CONFIRMAÇÃO DO E-MAIL DEU ERRO" (cadastro pelo convite): quando a pessoa clicava no link de confirmação do e-mail e voltava para a plataforma, NINGUÉM lia o resultado — quem confirmava com sucesso caía numa tela de login muda (parecia erro), e quem falhava não tinha mensagem nem saída. Agora a tela de login mostra o resultado: "E-mail confirmado!" no sucesso, e no erro explica o motivo mais comum — o link vale UMA vez só, e a prévia do WhatsApp/antivírus às vezes "visita" o link antes do clique, gastando-o.',
    'REENVIAR CONFIRMAÇÃO (novo): quando o link expira ou já foi usado, aparece o botão "Reenviar e-mail de confirmação" na própria tela de login — a pessoa digita o e-mail e recebe um link novo, sem precisar chamar o administrador. O botão também aparece quando o login falha por e-mail não confirmado.',
  ],
  '2.10.3': [
    'CONVITE PARA UMA PESSOA — E-MAIL AGORA É OPCIONAL: era o formulário que ainda te obrigava a digitar um e-mail para gerar o link (as versões anteriores só tinham soltado essa trava no bloco "Links por tipo"). Agora, se você deixar o e-mail em branco, é gerado um link ABERTO que vale para UM cadastro: você manda o link e a própria pessoa preenche nome, e-mail, telefone e cria a senha. Se preferir travar o convite num e-mail específico, é só preenchê-lo — aí só quem tem aquele endereço consegue usar.',
    'Correção no motor: dois links abertos (sem e-mail) não se cancelam mais entre si. Antes, como ambos tinham "e-mail vazio", gerar o segundo derrubava o primeiro.',
  ],
  '2.10.2': [
    'GERAR O LINK POR TIPO NÃO PEDE MAIS NADA OBRIGATÓRIO: o campo "nome do link" virou opcional. Você abre "Novo link", escolhe a categoria, o papel e o perfil de permissões (todos já vêm preenchidos) e clica em Gerar — pronto. Se deixar o nome em branco, o sistema batiza o link automaticamente com a categoria e o papel escolhidos (ex.: "Produtor · Somente leitura"). Nenhum e-mail é pedido aqui: quem informa nome, e-mail, telefone e senha é a própria pessoa, ao abrir o link. O campo de e-mail existe apenas no outro bloco, "Convite para uma pessoa".',
  ],
  '2.10.1': [
    'CORRIGIDO — "GERAR LINK" NÃO FAZIA NADA: se o campo obrigatório estivesse vazio, o botão era clicado e simplesmente não acontecia nada, sem nenhum aviso — parecia que a função estava quebrada. Agora o botão fica desabilitado enquanto falta o dado e a tela diz o que falta ("Dê um nome ao link", "Informe um e-mail válido").',
    'O LINK GERADO APARECE ONDE VOCÊ CLICOU: antes ele era mostrado lá embaixo, depois do formulário de convite individual — fácil de não ver, e dava a impressão de que nada tinha sido criado. Agora cada bloco mostra o seu próprio link, logo abaixo do botão.',
    'Reforçado na tela: o link POR TIPO não pede e-mail nenhum. Quem preenche nome, e-mail, telefone e senha é a própria pessoa, ao abrir o link.',
  ],
  '2.10.0': [
    'LINK DE CONVITE POR TIPO DE USUÁRIO (novo): em Acessos → Convites, além do convite para uma pessoa, agora dá para criar um LINK REUTILIZÁVEL por tipo — "Produtores", "Consultor externo", "Operador de campo". Um link só, que você manda no grupo do WhatsApp: cada pessoa abre, informa o próprio e-mail, cria a própria senha e entra como "Aguardando aprovação" JÁ com a categoria, o papel e o PERFIL DE PERMISSÕES daquele link. Antes era um convite por pessoa, um a um.',
    'O link NÃO libera ninguém sozinho: continua caindo na sua aprovação. A diferença é que a tela de aprovação já abre com o papel e o perfil que o link definiu — é só conferir e aprovar, sem redigitar (e sem errar) a configuração de cada um.',
    'Cada link mostra quantos cadastros já vieram por ele, tem validade própria (1 ano por padrão, renovável) e pode ser cancelado — cancelou, ninguém mais se cadastra por aquele link, mesmo quem já o recebeu. Link de acesso sem prazo nenhum é convite para vazar num grupo e continuar valendo anos depois.',
  ],
  '2.9.2': [
    'O INTERPOLADOR DESTA MÁQUINA DEIXOU DE SER OBRIGATÓRIO: com a opção ligada e o programa local desligado, o processamento simplesmente falhava — NDVI, satélite e mapas ficavam travados até alguém abrir a janela do Terminal. Agora, se o interpolador da máquina não responder, a mesma tarefa é enviada AUTOMATICAMENTE para a nuvem e o trabalho continua. A opção continua marcada (a preferência é sua) e volta a valer sozinha assim que o programa local estiver no ar de novo — ele é uma otimização para lotes pesados, não um requisito para usar o sistema.',
    'Quando isso acontece, a tela de NDVI/Satélite avisa que rodou na nuvem, para não parecer que "às vezes demora mais" sem motivo. Erro de cálculo do backend (500) NÃO é reenviado para a nuvem: repetir daria o mesmo erro e ainda esconderia o defeito de verdade.',
  ],
  '2.9.1': [
    'MENSAGEM DE ERRO QUE APONTA O LUGAR CERTO: com a opção "Usar interpolador desta máquina" ligada e o interpolador desligado, telas como NDVI/Satélite diziam apenas "Servidor de processamento indisponível no momento" — mandando você procurar defeito no servidor da nuvem, que estava perfeito. O problema era outro: o app estava configurado para processar NA SUA MÁQUINA e o programa local não estava no ar. Agora a mensagem diz exatamente isso, explica como ligar (inclusive pelo atalho na Área de Trabalho) e lembra que dá para voltar à nuvem desmarcando a opção em Configurações. Vale para todas as telas que processam, não só a Fertilidade (que já tinha o texto correto).',
  ],
  '2.9.0': [
    'REGISTROS DE CAMPO (novo): tudo o que o operador anota durante a coleta — a OBSERVAÇÃO livre, umidade, compactação, problemas e as FOTOS — era gravado no celular e sincronizado na nuvem desde a primeira coleta, mas NENHUMA tela da plataforma lia esses dados de volta. Ficavam invisíveis. Agora aparecem em Talhão → Amostragem → aba "Registros de campo": cada ponto com data/hora, quem coletou, distância do ponto planejado, precisão do GPS, profundidades, as condições anotadas, a observação e as fotos (clique para ampliar). É o que resolve o laudo fora da curva: "o ponto 14 deu fósforo altíssimo" → a anotação do operador diz "formigueiro / resto de adubo na superfície".',
    'CADERNO DE CAMPO EM PDF: botão na mesma aba gera um relatório com todos os pontos, as anotações e as fotos embutidas, no padrão visual dos demais relatórios — pode ir junto com o laudo para o produtor. Também exporta em Excel (uma linha por ponto, com coordenada real coletada) para filtrar e cruzar.',
    'A busca é feita na nuvem ao abrir a aba: a coleta acontece no celular do operador, então os registros nunca estão no computador de quem analisa. Fotos que ainda não subiram do aparelho aparecem indicadas como pendentes, em vez de simplesmente sumirem.',
  ],
  '2.8.11': [
    'O LÁPIS AGORA EDITA A LEGENDA — NÃO CRIA MAIS CÓPIA: em Biblioteca → Legendas, clicar no lápis de uma legenda oficial abre A PRÓPRIA legenda para edição. Ao salvar, ela deixa de ser oficial e passa a ser sua, mantendo o MESMO cadastro — então tudo o que já apontava para ela (mapas, perfis) continua funcionando, agora com o seu ajuste. Quem quiser preservar a oficial usa o botão Duplicar e edita a cópia, que é como deveria ter sido desde o começo. O editor avisa em cima o que vai acontecer ao salvar.',
    'A legenda oficial que você editar já fica marcada com a estrela. Sem isso ela poderia perder a vez para outra legenda oficial do mesmo elemento (produtividade, por exemplo, tem três) e o ajuste sumiria de novo.',
  ],
  '2.8.10': [
    'CORRIGIDO — EDITAR UMA LEGENDA OFICIAL NÃO SURTIA EFEITO: ao clicar no lápis de uma legenda do Sistema (que é oficial e não pode ser alterada), o app criava uma CÓPIA sua e abria o editor nela — sem dizer nada. Você mudava para contínuo e salvava, mas o mapa continuava usando a OFICIAL, que é segmentada. Parecia que o ajuste "voltava sozinho"; na verdade ele nunca chegou a valer. Agora a sua versão já nasce marcada com a estrela (padrão do atributo), então é ela que os mapas usam — e o editor abre explicando isso em cima.',
    'PROTEÇÃO CONTRA PERDA DAS LEGENDAS EDITADAS: as legendas oficiais têm código fixo, e o app as recriava sempre que achava o cadastro vazio. Só que "vazio" também acontece quando a nuvem ainda não terminou de carregar (conexão lenta, primeira abertura num navegador novo) — e aí a recriação SOBRESCREVIA na nuvem, em todas as máquinas, as legendas que você tinha editado, devolvendo-as ao padrão de fábrica. Agora o app só recria quando tem certeza de que o cadastro está realmente vazio; se a nuvem não confirmou, ele espera.',
  ],
  '2.8.9': [
    'AVISO CLARO QUANDO O NAVEGADOR É O CULPADO: ao usar o interpolador desta máquina pelo Safari, o status ficava em "sem resposta" mesmo com o interpolador ligado e funcionando perfeitamente — porque o Safari não deixa um site https falar com um programa da própria máquina, e nem chega a enviar o pedido. Era impossível descobrir isso pela tela: a mensagem mandava conferir o interpolador, que não tinha nada de errado. Agora, quando a página está no Safari, Configurações diz exatamente isso e manda abrir a mesma página no Chrome.',
  ],
  '2.8.8': [
    'CORRIGIDO — MAPAS VOLTANDO SOZINHOS DE "CONTÍNUO" PARA "SEGMENTADO": o estilo que você tinha definido não se perdia — o que acontecia é que o MAPA passava a usar OUTRA legenda do mesmo elemento. Quando existe mais de uma legenda para o mesmo elemento (a oficial e a sua, por exemplo), o mapa escolhia "a primeira da lista"; e a ordem dessa lista vinha da nuvem sem critério nenhum, mudando de uma abertura para outra. Resultado: de repente o mapa aparecia com o estilo (e as cores e faixas) da outra legenda. Agora a ordem é fixa e previsível, e não depende mais de como os dados chegam.',
    'LEGENDA PADRÃO DO ELEMENTO (novo): em Biblioteca → Legendas, cada legenda tem uma ESTRELA. Marque a estrela na que deve valer nos mapas daquele elemento — é ela que passa a ser usada quando ninguém escolhe uma explicitamente. Clique de novo para desmarcar. Quando o mesmo elemento tem mais de uma legenda, cada cartão agora mostra "✓ usada no mapa" ou "não usada no mapa", então dá para ver na hora qual está valendo.',
    'SINCRONIZAÇÃO MAIS SEGURA: a leitura dos dados na nuvem passou a ter ordem definida. Além de resolver o caso das legendas, isso elimina um risco silencioso em bases grandes — sem ordem, a leitura em páginas podia repetir ou PULAR registros entre uma página e outra.',
  ],
  '2.8.7': [
    'CORRIGIDO — O INTERPOLADOR DA SUA MÁQUINA NÃO CONECTAVA COM A PLATAFORMA: mesmo com o programa no ar (a janela do Terminal mostrando "no ar em 127.0.0.1:8800"), Configurações insistia em "sem resposta" e as interpolações não iam para a máquina. Causa: antes de deixar um site da internet falar com um programa da sua própria máquina, o navegador faz uma pergunta de autorização; uma biblioteca do interpolador foi atualizada e passou a RESPONDER "não" a essa pergunta — o navegador então cortava a conexão sem nem chegar no programa. Agora a resposta é a autorização correta. Continua valendo usar o Chrome (o Safari bloqueia esse tipo de ligação por conta própria).',
    'ATALHO NA ÁREA DE TRABALHO (Mac): novo comando "npm run interp:atalho" cria um app "Interpolador INVICTA" na Área de Trabalho — dois cliques e o Terminal já abre rodando o interpolador, sem digitar nada e sem o bloqueio do macOS que aparecia no arquivo baixado. Dá para arrastar para o Dock. Se você abrir por engano com ele já ligado, agora aparece um aviso claro em vez de um erro de porta ocupada.',
  ],
  '2.8.6': [
    'CORRIGIDO — MAPA PISCANDO NA TELA NDVI/MANCHA (app de campo, nas três plataformas): a imagem do índice ficava aparecendo e sumindo sem parar. Causa: o mapa recebia a imagem como um objeto novo a cada atualização de tela e, como o GPS atualiza a posição o tempo todo, ele entendia que a imagem havia mudado e a REFAZIA dezenas de vezes por minuto. Agora o mapa compara a imagem de fato (endereço + limites) e só a recria quando ela realmente muda — o fundo fica estável. Também reduzimos o retrabalho da tela a cada leitura do GPS.',
  ],
  '2.8.5': [
    'APP iOS (iPhone) NO MESMO PATAMAR DO ANDROID: o projeto do iPhone estava numa versão antiga e separada, sem as melhorias recentes. Foi refeito a partir da versão atual — então o app do iPhone já nasce com tudo o que foi corrigido nos últimos dias, inclusive a proteção que impede o ponto coletado de se perder quando o aparelho está sem espaço, e o cabeçalho respeitando a área do relógio/bateria. Ícone próprio e permissões de localização, câmera e fotos explicadas em português (é o texto que o iPhone mostra ao pedir cada permissão). Compilado e testado no simulador do iPhone.',
  ],
  '2.8.4': [
    'POLÍTICA DE PRIVACIDADE (nova página pública): em /privacidade, escrita conforme a LGPD e as exigências da Google Play — descreve exatamente o que o app coleta (localização durante o uso, fotos do ponto, nome/e-mail/telefone do cadastro), para quê, onde fica, com quem é compartilhado, por quanto tempo e como pedir exclusão. É o endereço exigido no cadastro do app na loja.',
    'APP ANDROID PRONTO PARA A LOJA: ícone próprio do app (a mira de navegação, em todos os tamanhos, com o recorte adaptativo do Android), assinatura de release configurada com as senhas fora do repositório, e o comando "npm run android:release" que gera o arquivo .aab para envio. Passo a passo completo da publicação em docs/publicar-android.md.',
  ],
  '2.8.3': [
    'APP DE CAMPO (Android) — CABEÇALHO NÃO FICA MAIS EMBAIXO DO RELÓGIO: no app nativo, o topo da tela se misturava com a barra do celular (relógio, sinal, bateria). Do Android 15 em diante o sistema obriga o app a desenhar sob as barras, e nem a configuração da barra de status nem a "saída de compatibilidade" resolvem. Agora o app lê a medida real da barra do próprio aparelho e reserva esse espaço — vale para qualquer modelo, inclusive com recorte de câmera. Os cabeçalhos das telas de Início, Seleção, NDVI/Mancha e Compactação passaram a respeitar essa área.',
  ],
  '2.8.2': [
    'COLETA EM CAMPO — PONTO NÃO SE PERDE MAIS: se o armazenamento do aparelho estivesse cheio (cenário comum offline, com a base + coletas + fotos acumuladas), a gravação da coleta falhava EM SILÊNCIO — o ponto não ficava marcado como coletado e o dado se perdia sem nenhum aviso. Agora: (1) toda coleta é espelhada numa cópia de segurança no próprio aparelho (IndexedDB, limite muito maior), então o registro sobrevive mesmo se o armazenamento principal recusar; (2) se isso acontecer, aparece um AVISO na hora pedindo para liberar espaço/sincronizar, em vez de fingir que deu certo; (3) ao abrir o app, o que estiver só na cópia de segurança é recuperado automaticamente e volta a aparecer na tela.',
  ],
  '2.8.1': [
    'PERMISSÕES MAIS CLARAS: a tabela de permissões agora diz na primeira linha o que significa — ✔ MARCADO = PODE FAZER, em branco = não pode. Também mostra quantos ajustes próprios a pessoa tem em relação ao papel dela, e cada módulo sem nenhuma permissão fica em cinza. O antigo contorno amarelo (que confundia por aparecer tanto em marcado quanto em desmarcado) virou um FUNDO amarelo na célula, com explicação ao passar o mouse: "ajuste próprio desta pessoa".',
    'PERFIS DE PERMISSÃO SALVOS (novo): em Acessos → aba PERFIS, monte um conjunto de permissões, dê um nome (ex.: "Agrônomo de campo", "Consultor externo") e reutilize em quantas pessoas quiser. Pode criar do zero a partir de qualquer papel e editar a matriz do perfil. Para aplicar: abra a pessoa → Permissões → "escolher um perfil salvo" → Aplicar. IMPORTANTE: depois de aplicado, você continua ajustando item a item naquela pessoa, sem afetar o perfil nem as outras pessoas.',
    'ATALHOS na tabela de permissões: botão por linha para marcar/desmarcar o módulo inteiro de uma vez, além de "salvar as permissões atuais como perfil", "copiar de outra pessoa" e "voltar ao papel".',
  ],
  '2.8.0': [
    'CENTRAL DE ACESSOS (novo módulo de usuários e permissões): a antiga tela "Usuários" virou uma central completa, em Biblioteca → Acessos. Abas: Pendentes · Internos · Produtores · Consultores · Gerentes · Prestadores · Todos · Convites · Papéis · Permissões · Empresas · Auditoria. Cada pessoa vira um cartão (nome, categoria, papel, vínculos, último acesso, status) e abre um painel lateral com Dados, Vínculos, Permissões e Histórico.',
    'CONVITE POR LINK — SEM SENHA PROVISÓRIA: em Acessos → Convites, gere um link único (com validade em dias) e mande por WhatsApp/e-mail. A pessoa abre o link, preenche nome, telefone, CRIA A PRÓPRIA SENHA e aceita LGPD/termos. O cadastro entra como "Aguardando aprovação" e você aprova (definindo categoria e papel), rejeita ou pede alteração. Convites podem ser renovados, cancelados e têm o status visível. Nenhuma senha é exibida a ninguém — o gerador antigo ("Inv" + 5 dígitos) foi substituído por token criptográfico de 32 bytes.',
    'CATEGORIA SEPARADA DO PAPEL: agora "quem a pessoa é" (Interno, Produtor, Gerente, Consultor, Revenda, Parceiro, Prestador, Pesquisador, Cliente) é independente do "que ela pode fazer" (Owner, Administrador, Agrônomo, Operador, Somente leitura, Personalizado). Antes a categoria era deduzida do papel, então não dava para ter um Gerente e um Consultor com o mesmo papel.',
    'PERMISSÕES GRANULARES: cada permissão passou a ser MÓDULO × AÇÃO (visualizar, criar, editar, excluir, exportar, importar, aprovar, administrar) nos 13 módulos do sistema. O papel define o padrão e cada pessoa pode ter exceções próprias (destacadas em amarelo). Dá para CLONAR as permissões de outro usuário. Quem já usava o sistema não perde nada: o comportamento dos papéis antigos foi preservado e está travado por teste automático.',
    'VÍNCULO POR FAZENDA (novo nível): além de produtor e talhão, agora dá para vincular a pessoa a FAZENDAS específicas — e essa restrição passa a valer de fato nas listagens. Bloqueio/desbloqueio de usuário também passou a valer: quem não está ATIVO não entra, mesmo com papel.',
    'AUDITORIA: toda ação de acesso passa a ser registrada (convite criado/cancelado/usado, cadastro solicitado, aprovação, troca de papel/categoria, permissão alterada, vínculo alterado, senha resetada, bloqueio, remoção e login). Veja tudo na aba Auditoria ou o histórico de uma pessoa no painel lateral dela.',
    'SEGURANÇA (ação necessária do administrador): as regras de proteção do banco (RLS) foram escritas em docs/seguranca-rls.sql e precisam ser aplicadas no painel do Supabase. Sem elas, a autorização é só de tela — o arquivo tranca a escrita das listas de acesso para owner/admin. Instruções no próprio arquivo.',
  ],
  '2.7.42': [
    'CORRIGIDO — USUÁRIO NOVO VIA "ACESSO AINDA NÃO LIBERADO" MESMO COM O PAPEL ATRIBUÍDO: quem entrava pela 1ª vez (navegador limpo) podia ser barrado por engano. O app confere o papel numa lista que só existe depois que o boot baixa os dados da nuvem; nesse 1º acesso o boot é o COMPLETO (~10s) e havia um tempo-limite de 12s — se a internet do usuário fosse mais lenta, entrava com a lista vazia e ele aparecia "sem papel". Agora, antes de bloquear, o app confirma o papel DIRETO na nuvem (consulta de um registro só). A tela de bloqueio também ganhou o botão "Tentar de novo", para quando o administrador acabou de liberar.',
  ],
  '2.7.41': [
    'GRADE DE AMOSTRAGEM — DISTÂNCIA DA BORDA PADRÃO 25 m (era 50 m): ao gerar a grade, o campo "Distância da borda (m)" já vem com 25 m. Continua editável a cada grade, e as grades já salvas não mudam. (Zonas de manejo e compactação seguem com os padrões próprios: 15 m e 10 m.)',
  ],
  '2.7.40': [
    'CORRIGIDO — MAPA DE RECOMENDAÇÃO MOSTRAVA COR QUE NÃO EXISTIA NA LEGENDA: nos mapas de dose (Calcário, Gesso…), apareciam manchas ROXAS que não constavam no "Plano de aplicação". Causa: quando a equação tem DOSE MÍNIMA (ex.: 1.000 kg/ha) com piso operacional, todo pixel abaixo dela vira exatamente a mínima — e o MAPA classificava esse valor na faixa anterior ("50 – 1.000", roxa), enquanto a TABELA já o contava na faixa certa ("1.000 – 2.000", azul). Mapa e tabela usavam listas de faixas diferentes. Agora os dois (e também o SHP de aplicação) usam a MESMA regra: as faixas abaixo da dose mínima não existem. O mapa passa a bater exatamente com a legenda. As DOSES não mudaram — era só a cor/faixa exibida. Quando a dose mínima é baixa (ex.: 150), a faixa roxa continua aparecendo normalmente, como antes.',
  ],
  '2.7.39': [
    'RELATÓRIOS DA FAZENDA — AGORA VOCÊ ESCOLHE O ANO: na tela da fazenda (aba Talhões), os botões de relatório usavam o "Ano ativo" global — se ele não fosse o desejado, o relatório saía vazio e não havia onde indicar o ano. Agora há um seletor "Ano" acima dos botões, e o sistema DETECTA sozinho quais anos têm dado (mostra, em cada ano, se há "recomendação" e/ou "satélite"). Recomendação (PDF) e Excel passam a usar o ano escolhido; se o ano não tiver recomendação, o botão fica desabilitado (em vez de gerar um PDF vazio).',
    'NOVO — RELATÓRIO DE SATÉLITE DA FAZENDA INTEIRA: novo botão "Relatório de satélite" na mesma tela. Você escolhe o ÍNDICE (todos, ou somente NDVI / NDRE / SAVI / o que houver) e marca QUAIS DATAS entram (uma, várias ou todas as imagens daquele ano), e sai um PDF único com todos os talhões — capa com a tabela de talhão × índices × datas, uma página por mapa (com satélite de fundo, contorno do talhão e barra de cores) e a lista dos talhões sem imagem no período. Usa o mesmo padrão visual do relatório de satélite do talhão. Onde fica: Clientes → Fazenda → aba Talhões → abaixo de "Importar em massa".',
  ],
  '2.7.38': [
    'BACKEND — BIBLIOTECAS PINADAS: as versões de numpy, scipy, pykrige, shapely, rasterio, fastapi, uvicorn, gunicorn etc. foram FIXADAS nas versões confirmadas funcionando (jul/2026). Antes estavam soltas, e um rebuild futuro podia puxar uma versão mais lenta sem aviso (a lentidão da interpolação já foi suspeita de atualização de biblioteca). Agora o servidor sempre sobe com o mesmo conjunto testado. Muda no deploy do backend (Render).',
  ],
  '2.7.37': [
    'INTERPOLADOR LOCAL — INSTRUÇÕES PARA O macOS NOVO (Sequoia): a Apple passou a bloquear o duplo-clique em arquivos baixados da internet (mensagem "não foi possível verificar se está livre de malware"). Atualizamos a dica em Configurações e o LEIA-ME do pacote para o método que sempre funciona: abrir o Terminal, digitar "bash " e arrastar o start.sh para dentro (Enter). Alternativa: clicar OK no aviso e ir em Ajustes do Sistema → Privacidade e Segurança → "Abrir Mesmo Assim".',
  ],
  '2.7.36': [
    'BAIXAR O INTERPOLADOR LOCAL (Configurações): em Configurações → "Processamento de mapas", novo botão "Baixar interpolador local (Mac)". Baixe o .zip, descompacte e dê 2 cliques em start.command para rodar a krigagem NA SUA MÁQUINA — assim o lote pesado ("Processar tudo") não disputa a CPU da nuvem com outros usuários (ex.: quando o John também está processando). Precisa de Python 3 instalado; o script instala o resto sozinho (~2-4 min na 1ª vez). Depois marque "Usar interpolador desta máquina". O pacote é gerado a cada publicação (sempre atualizado).',
  ],
  '2.7.35': [
    'INTERPOLADOR DESTA MÁQUINA (opção, não padrão): em Configurações → "Processamento de mapas", marque "Usar interpolador desta máquina" para rodar a krigagem no SEU computador. Vale para lotes pesados ("Processar tudo") e evita disputar a CPU da nuvem com outros usuários — quem faz o lote grande roda local e libera a nuvem para o resto. Requer ligar o backend local (2 cliques em backend/start.command no Mac ou backend\\start.bat no Windows); o painel mostra na hora se está no ar (melhor no Chrome). Desmarque para voltar à nuvem. O gerenciamento de usuários (admin) continua sempre na nuvem.',
    'BACKEND — 2 WORKERS: o servidor da nuvem passou a rodar com 2 workers, então o lote pesado de um usuário não trava a interpolação dos outros (deixam de esperar na fila do mesmo processo). Muda no deploy do backend (Render).',
    'START LOCAL REFORÇADO: o backend/start.sh agora atualiza as bibliotecas sozinho quando mudam, verifica se o ambiente está íntegro e mantém a janela aberta se der erro (para você ver a mensagem).',
  ],
  '2.7.34': [
    'ZONAS DE MANEJO — EXPORTAR (SHP / KML / PDF): na aba Zonas de Manejo do talhão, a seção "Zoneamentos salvos" ganhou o botão EXPORTAR. Escolha um mapa pronto e baixe: (1) SHAPEFILE — um .zip com DUAS camadas, zona_manejo_poligonos (1 registro por zona, com id_zona/nome_zona/produtor/fazenda/talhao/area_ha/classe/data) e zona_manejo_linhas_internas (as divisas entre zonas); .prj WGS84 e .cpg. (2) KML — pastas "Zonas" e "Linhas internas", cores da plataforma, áreas e classes, em WGS 84. (3) RELATÓRIO PDF — no padrão dos demais relatórios (cabeçalho, mapa com zonas/divisas/legenda, norte, escala, tabela de zonas com área e %, resumo). Os 3 formatos saem da MESMA fonte (áreas idênticas). As LINHAS INTERNAS são derivadas automaticamente das divisas compartilhadas entre zonas vizinhas (não eram armazenadas). Usa os dados vetoriais originais (não imagem). Onde fica: Talhão → aba "Zonas de Manejo" → "Zoneamentos salvos" → botão "Exportar".',
  ],
  '2.7.33': [
    'INTERPOLAÇÃO (diagnóstico): a rota /health do backend agora informa qual servidor está rodando (gunicorn reciclado ou uvicorn) e o nº de workers — para confirmar que o fix de degradação está no ar. Sem efeito visível no app.',
  ],
  '2.7.32': [
    'INTERPOLAÇÃO — FIX DEFINITIVO DA LENTIDÃO QUE VOLTAVA: a medição de dentro do servidor (nova rota /diag) provou que a CPU fresca é rápida (~1,2s p/ auto), mas o processo de vida longa DEGRADAVA ao longo do tempo (GDAL/rasterio + rasters repetidos incham a memória → swap → krigagem ~50× mais lenta: 1,6s → 67s). Restart resolvia, mas voltava. Agora o backend roda com gunicorn + worker uvicorn RECICLADO a cada ~100 requisições — a memória é restaurada sozinha, sem derrubar o serviço. É o fim do "de vez em quando fica lento de novo". (Muda no deploy do backend/Render.)',
  ],
  '2.7.31': [
    'INTERPOLAÇÃO — DIAGNÓSTICO DEFINITIVO E INSTRUMENTAÇÃO PERMANENTE: medimos o fluxo (não presumimos). O código do backend está idêntico à v2.6.0; a lentidão é a CPU do servidor de interpolação — o MESMO cálculo leva ~0,5s no PC de teste e ~67s no servidor (30 pontos), ~140× mais lento. Não é biblioteca (as libs mais novas são rápidas no teste) nem o front. Agora cada interpolação mede o tempo POR ETAPA (preparo/krigagem/recorte/cor/PNG), com job id, nº de células, RAM e cache, tudo no log e no "stats" da resposta. Nova rota GET /diag roda um teste de CPU FIXO dentro do próprio servidor e diz na hora se a CPU dele é o gargalo (referência ~0,5s).',
    'INTERPOLAÇÃO MAIS RÁPIDA SEM MUDAR O MAPA: (1) cache por conteúdo — reprocessar o MESMO mapa (mesmos dados/parâmetros) volta instantâneo; (2) recorte pelo talhão calculado 1 vez em vez de até 3; (3) no modelo de variograma FIXO, pulamos a validação cruzada redundante (só servia para um número diagnóstico) — o mapa é idêntico e fica bem mais rápido. A seleção AUTOMÁTICA de modelo continua igual (nada de perder precisão).',
    'INTERFACE NÃO TRAVA MAIS: a interpolação em voo é cancelada ao iniciar outra, trocar de importação/talhão ou sair da tela — sem esperar um cálculo já abandonado.',
  ],
  '2.7.30': [
    'FERTILIDADE DIZIA "SALVE UMA GRADE" MESMO COM A GRADE SALVA: a importação de laudo (Fertilidade) e a importação de grade externa usavam o "Ano ATIVO global", não o Ano escolhido no seletor do topo do talhão. Quando os dois divergiam (ex.: grade no Ano 2025, mas ativo global em outro ano), a grade "sumia" nessas telas. Agora ambas usam o mesmo Ano do topo, como as outras abas — a grade aparece.',
  ],
  '2.7.29': [
    'INTERPOLAÇÃO "DE 1 MINUTO" — CAUSA REAL ENCONTRADA E CORRIGIDA: o cálculo em si leva ~2s por mapa (medido no servidor); a lentidão era o BACKEND REINICIANDO a cada deploy. Como o interpolador é Blueprint do MESMO repositório com autoDeploy, cada publicação do app (o front) reiniciava o servidor — quem processava naquele instante caía em "servidor acordando" e esperava ~1 min. Adicionado buildFilter no render.yaml: o backend só reinicia quando muda código do backend, não a cada deploy do front. Dica: modelo de variograma FIXO (Configurações da interpolação) deixa cada mapa em ~0,9s (vs ~2s no auto).',
  ],
  '2.7.28': [
    'ANO/ÉPOCA — FASE 3 (PRODUTIVIDADE, CONDUTIVIDADE, COMPACTAÇÃO): esses fluxos passam a classificar por ANO (com Época derivada da data), igual à fertilidade. PRODUTIVIDADE: novo campo "Data de referência (colheita)" e o antigo "Época" foi renomeado para "Época de cultivo" (Verão/Safrinha/Inverno) para não confundir com a 1ª/2ª época do período. COMPACTAÇÃO: novo campo "Data de referência" na importação. CONDUTIVIDADE: passa a derivar o Ano da "data" do levantamento que já existia. Tudo cai no ano certo (filtro por Ano); registros antigos foram migrados pelo ano da safra.',
  ],
  '2.7.27': [
    'LIMPEZA DO CADASTRO POR BOTÃO (Início): no painel Início, quem tem permissão vê a seção "Limpeza do cadastro" com botões (2 cliques) para REMOVER TALHÕES DUPLICADOS (cópia exata: mesmo produtor+fazenda+nome+área) e REMOVER FAZENDAS ÓRFÃS (sem produtor). Os de mesmo nome com ÁREA diferente NÃO são apagados (ficam listados para revisão). Substitui o comando de console.',
  ],
  '2.7.26': [
    'INTERPOLAÇÃO MAIS RÁPIDA (BACKEND): o servidor de interpolação subiu de plano (starter → standard, mais CPU/RAM) — a krigagem é pesada em CPU e o "Processar tudo" roda vários mapas em fila. Muda no deploy do backend (Render).',
    'LIMPEZA DE TALHÕES DUPLICADOS (owner): rotina para remover cópias EXATAS de talhão (mesmo produtor+fazenda+nome+área). Roda no Console: "await invDedupTalhoes()" mostra o PREVIEW (o que seria removido) e "await invDedupTalhoes(true)" aplica. NUNCA apaga cópias com dados vinculados nem talhões de mesmo nome com ÁREA diferente (esses ficam listados para revisão manual).',
  ],
  '2.7.25': [
    'INTERPOLAÇÃO NÃO PARA MAIS AO ABRIR OUTRA ABA: o app usava o lock de sessão do Supabase entre abas (navigator.locks). Abrir uma 2ª aba fazia a 1ª travar ao salvar cada mapa (a nova aba segurava o lock no boot/refresh). Agora cada aba cuida da própria sessão e a interpolação continua normalmente.',
  ],
  '2.7.24': [
    'GRADE CAI NO ANO CERTO: a lista de grades de amostragem passa a filtrar por ANO (vindo da Data de referência da grade), não pela safra ativa na hora. Assim uma grade lançada com data de outro ano aparece ao selecionar aquele Ano no topo — antes ficava sempre no ano ativo (ex.: 2026). Grades antigas seguem no ano de sempre (compatível).',
  ],
  '2.7.23': [
    'AMOSTRAGEM — DATA DE REFERÊNCIA NAS GRADES: gerar grade (Amostragem), grade por Zonas e IMPORTAR grade (KML/SHP) agora têm o campo "DATA DE REFERÊNCIA" (default hoje, editável, retroativo). A ÉPOCA (1ª jan–jun / 2ª jul–dez) deixa de ser escolhida à mão e passa a sair da data; o ANO também. Grades antigas foram migradas mantendo a época que já tinham. Assim a amostragem fica classificada por Ano + Época igual à fertilidade.',
  ],
  '2.7.22': [
    'FERTILIDADE — LAUDO HISTÓRICO CAI NO ANO CERTO: a lista de importações de laudo passa a filtrar por ANO (o Ano vem da Data de referência), não pela safra exata. Assim um laudo lançado hoje com data de 2024 aparece ao selecionar o Ano 2024 (crie o Ano 2024 no seletor do topo para vê-lo). Laudos antigos seguem no mesmo Ano de sempre (compatível).',
  ],
  '2.7.21': [
    'ANO/ÉPOCA — FASE 2 (RELABEL DA PLATAFORMA): "Safra" agora aparece como "ANO" em toda a interface — seletor do topo do talhão, painéis, avisos, dropdowns, coleta (era "Ciclo"), portal e cabeçalhos dos relatórios (PDF/Excel). O valor é mostrado como o ANO (ex.: "26/27" vira "2026", primeiro número). Internamente a chave não muda (nada é apagado; dados antigos seguem acessíveis).',
  ],
  '2.7.20': [
    'ANO/ÉPOCA — FASE 1 (FERTILIDADE): começou a migração do conceito de "Safra" para "Ano + Época". Agora a importação de laudo (Talhão → Fertilidade → Importar laudo) tem um campo "DATA DE REFERÊNCIA" (a data real da amostragem), que já vem preenchido com HOJE (fuso America/Sao_Paulo) e pode ser alterado — inclusive retroativo (ex.: lançar hoje um laudo de 2024). Dela saem automaticamente o ANO (= ano da data) e a ÉPOCA (1ª = jan–jun, 2ª = jul–dez), calculados no servidor de dados (não dependem da tela). A lista de importações passa a mostrar "Ano · época". Datas de criação/atualização seguem guardadas para auditoria.',
    'ANO/ÉPOCA — MIGRAÇÃO E COMPATIBILIDADE: laudos antigos ganham a data de referência automaticamente (o Ano vem da safra antiga — "26/27" → 2026, primeiro número; a época vem do mês do registro). Nada é apagado: a "safra" continua guardada como chave interna e a sincronização não muda. As próximas fases levam Ano/Época para as demais telas (amostragem, produtividade, condutividade), filtros e relatórios.',
  ],
  '2.7.19': [
    'RECOMENDAÇÕES — Nº NA FRENTE DE CADA DOSE: na lista de recomendações (aba Recomendações, onde se marca a ★), cada dose agora mostra o Nº do cadastro da equação na frente (ex.: "05 · Calcário…") — o mesmo número que sai no relatório, para cruzar fácil.',
    'RELATÓRIO DO TALHÃO — VOLTOU A SER COMO ERA + OPÇÃO "SÓ AS MARCADAS ★": a seção Recomendação (aba Relatórios) voltou ao padrão antigo (todas as doses dos cenários selecionados). Ganhou um botão "Só as marcadas ★ (com resumo)" que, quando ligado, imprime apenas as doses com estrela e começa por uma página-resumo (fórmula + quantidade total). Combina com a Fertilidade normalmente (fertilidade + só as marcadas).',
    'RELATÓRIO DA FAZENDA — PÁGINA 1 ESTILO PLANILHA E SEM DUPLICAR: a 1ª página agora traz, à esquerda, a lista por talhão (talhão · área · Nº-fórmula · quantidade total · investimento) e, à direita, o VOLUME TOTAL por produto somando a fazenda. As páginas de cada talhão passam a trazer só os mapas (antes o resumo saía duplicado). Talhões sempre em ordem alfanumérica.',
    'RELATÓRIO DA FAZENDA — VERSÃO EXCEL: novo botão "Excel" (Fazenda → aba Talhões, ao lado do PDF) que baixa a mesma consolidação em .xlsx editável (por talhão + volume total por produto), com os números como número para você somar/editar.',
    'RELATÓRIO DE FERTILIDADE — Al DESMARCADO POR PADRÃO: o Alumínio (Al) passa a vir DESMARCADO por padrão na aba Relatórios (igual aos índices de vegetação); marque quando quiser incluí-lo.',
  ],
  '2.7.18': [
    'FERTILIDADE — LAUDO IMPORTADO QUE FICAVA "0 PONTOS / SEM LEGENDA": corrigido o elo amostra→ponto da grade. (1) Se a importação apontava para uma grade sem pontos (ou de outra safra), a Fertilidade agora usa automaticamente a grade do talhão/safra com MAIS pontos. (2) Quando os NÚMEROS do laudo não batem com os da grade (lab renumerou as amostras), passa a casar por ORDEM (i-ésima amostra → i-ésimo ponto), com aviso na tela. (3) Novo diagnóstico na aba Fertilidade mostrando quantas amostras casaram com a grade — some o "0 pontos" sem explicação.',
  ],
  '2.7.17': [
    'RELATÓRIO DE RECOMENDAÇÃO — RESUMO NO INÍCIO (TALHÃO): na aba Relatórios do talhão, a seção Recomendação agora começa por uma PÁGINA-RESUMO com a tabela das recomendações (Nº, fórmula/equação, produto, dose média, QUANTIDADE TOTAL em t e investimento) e só depois os mapas. Entram SOMENTE as doses marcadas com ★ (estrela) na aba Recomendações — marque as que serão utilizadas. Onde: Talhão → aba Relatórios → seção Recomendação.',
    'RELATÓRIO DE RECOMENDAÇÃO DA FAZENDA (NOVO): botão "Relatório de recomendação (fazenda)" na aba da fazenda (lista de Talhões). Gera 1 PDF com: 1ª página = resumo por talhão de tudo; depois, para CADA talhão em ordem alfanumérica, o resumo + os mapas das doses ★; e no fim o TOTAL GERAL por insumo (t e R$) somando toda a fazenda. Usa a safra ativa. Onde: Fazenda → aba Talhões → botão roxo "Relatório de recomendação (fazenda)".',
    'ORDEM ALFANUMÉRICA DE TALHÃO EM TODOS OS RELATÓRIOS: os talhões passam a sair sempre em ordem alfanumérica (ex.: 01, 02 … 10, 11) — no relatório da fazenda, no relatório de conferência (Excel) e na lista de talhões da fazenda.',
  ],
  '2.7.16': [
    'FERTILIDADE — IMPORTAÇÃO APARECE NA HORA: ao importar uma tabela de laudo, a nova importação passa a aparecer imediatamente na aba Fertilidade (no seletor de importações). Antes era preciso sair da aba e voltar para ela surgir. Excluir uma importação também atualiza a lista na hora.',
  ],
  '2.7.15': [
    'DOSE MÍNIMA "APLICA A MÍNIMA" AGORA VALE PARA O ZERO TAMBÉM: quando a equação usa "Abaixo disso: aplica a mínima", QUALQUER valor abaixo da dose mínima — inclusive zero — passa a receber a própria mínima (piso operacional no talhão inteiro). Antes o zero escapava e ficava sem dose. Reprocesse o cenário para o mapa refletir. (O modo "Abaixo disso: zera" segue como era.)',
    'RELATÓRIO — CAPA COM OS PONTOS DE AMOSTRAGEM: o 1º mapa do relatório de Fertilidade (capa, com o polígono do talhão) agora mostra os pontos de amostragem com o NÚMERO de cada ponto.',
    'RELATÓRIO — ÍNDICES DE VEGETAÇÃO DESMARCADOS E LOGO APÓS O 1º MAPA: os índices (NDVI/NDRE…) agora vêm DESMARCADOS por padrão na aba Relatórios (você marca quando quiser) e, quando incluídos, entram logo após o primeiro mapa (capa), antes dos elementos de fertilidade.',
  ],
  '2.7.14': [
    'RECOMENDAÇÃO — LEGENDA COM "0" SEPARADO E 1ª FAIXA NA DOSE MÍNIMA: no mapa/PDF de recomendação, o ZERO (o que de fato não recebe dose) vira uma faixa própria com quadrado TRANSPARENTE, e a 1ª faixa colorida SEMPRE começa na dose mínima da equação (Biblioteca de Equações). Ex.: legenda cadastrada 0–1.000 com mínimo 500 → aparece "0" (transparente) e "500 – 1.000"; legenda 0–100 com mínimo 50 → "50 – 100". Vale no mapa (pixels abaixo da mínima ficam transparentes) e no "Plano de aplicação". Doses parceladas mantêm só o zero transparente.',
  ],
  '2.7.13': [
    'ORDEM PADRÃO DOS ELEMENTOS DE FERTILIDADE: adotada a ordem MO, pH, m%, V%, CTC, P, K, K%, Ca, Mg, Ca%, Mg%, CTCe, S, B, Zn, Cu, Mn, Fe, Al, Textura como PADRÃO do catálogo — a mesma em todas as telas (Perfil e relatório). É aplicada uma vez; se você reordenar com as setas do Perfil depois disso, valem as suas mudanças (não são sobrescritas).',
  ],
  '2.7.12': [
    'RELATÓRIO — CASAS DECIMAIS DOS PONTOS IGUAL À TELA: os números das amostras no mapa DO RELATÓRIO passam a respeitar as casas decimais da variável (Preferências de Análise), como já acontecia no mapa da tela. K%/Ca%/Mg% agora saem com 1 casa também no PDF (antes vinham inteiros).',
  ],
  '2.7.11': [
    'PERFIL — REORDENAR ELEMENTOS (define a ordem do relatório): em Biblioteca → Perfis → editar, cada linha de "Legendas por elemento" ganhou setas ↑/↓ para reordenar os elementos. Essa ordem passa a ser o PADRÃO da ordem dos elementos no relatório de Fertilidade (antes era uma ordem fixa). A reordenação vale para o catálogo (Variáveis de Análise) como um todo.',
  ],
  '2.7.10': [
    'RELATÓRIO — PIXELS RECORTADOS NO LIMITE DO TALHÃO: o mapa que vai no PDF (recomendação e fertilidade) agora RECORTA os pixels de borda exatamente no contorno do talhão — os blocos de ~20 m não ultrapassam mais a divisa. O satélite ao redor continua visível; só a camada colorida é cortada. (A exportação vetorial para máquina segue seu próprio caminho.)',
    'K%/Ca%/Mg% — VALOR COM 1 CASA NO MAPA: os números dos pontos de amostra no mapa de fertilidade passam a respeitar as casas decimais da variável (Preferências de Análise). K%, Ca% e Mg% já saem com 1 casa decimal (antes apareciam inteiros).',
  ],
  '2.7.9': [
    'NDVI — "PROCESSAR OUTRO ÍNDICE" NÃO MARCA NADA AUTOMÁTICO: ao reabrir a conferência de uma imagem já processada, os índices agora vêm TODOS DESMARCADOS — você escolhe qual processar (antes vinha pré-marcado tudo o que faltava).',
  ],
  '2.7.8': [
    'NDVI/SATÉLITE — PROCESSAR OUTRO ÍNDICE DA MESMA IMAGEM: depois de processar um índice (ex.: NDVI), o painel do resultado ganhou o botão "Processar outro índice desta imagem". Ele reabre a conferência já com os índices AINDA NÃO feitos pré-marcados (NDRE, etc.) — antes, uma imagem já processada não reabria essa tela e não dava para gerar um índice novo sem refazer tudo.',
  ],
  '2.7.7': [
    'PIXEL SÓLIDO TAMBÉM NO PDF DA RECOMENDAÇÃO: os mapas dentro do PDF (recomendação/fertilidade) desenhavam o raster ampliado COM suavização, deixando os pixels borrados. Agora o raster é desenhado sem suavização (nearest) — blocos de cor sólidos no PDF, como no mapa da tela. (O satélite e os números dos pontos seguem suaves.)',
    'CASAS DECIMAIS POR VARIÁVEL: em Biblioteca → Preferências de Análise → editar a variável há um novo campo "Casas decimais (exibição)": Padrão (automático), 0, 1 ou 2. Tudo continua como estava por padrão; K%, Ca% e Mg% já vêm com 1 casa decimal. Por ora vale nas estatísticas do relatório de Fertilidade; vamos estender aos demais pontos aos poucos.',
  ],
  '2.7.6': [
    'RELATÓRIO DE RECOMENDAÇÃO — ORDEM GLOBAL PELO Nº DA EQUAÇÃO: as páginas de dose agora são ordenadas ENTRE TODAS as recomendações juntas (01 Calcário … 10 Gesso …), não só dentro de cada recomendação — some o caso de começar no "Gesso 10". Doses de aplicação parcelada usam o nº da equação-base.',
    'RELATÓRIO DE FERTILIDADE — CABEÇALHO SEM SOBREPOSIÇÃO E SEM UNIDADE DOBRADA: o título central (ex.: "SATURAÇÃO POR MAGNÉSIO (Mg%)") deixou de repetir o símbolo ("(MG%) (Mg%)") e de invadir o nome do produtor — o título ficou mais estreito/deslocado, reduz a fonte quando necessário, e o bloco fazenda/produtor é truncado com "…" se for muito longo.',
    'K%/Ca%/Mg% — NOME E FAIXAS NORMALIZADOS: as legendas de saturação tiveram o nome limpo (sem o "(K%)" duplicado) e as faixas agronômicas reaplicadas (K% 1,5/3/5/8 · Ca% 40/50/60/70 · Mg% 8/12/18/25), corrigindo de vez o mapa que saía de uma cor só. Editáveis em Legendas; o atributoId de cada uma é satk / satca / satmg.',
  ],
  '2.7.5': [
    'K%/Ca%/Mg% — LEGENDAS COM FAIXAS PRÓPRIAS (fim do mapa "todo de uma cor só"): as legendas das saturações eram clonadas da V% (faixas 30–80%), mas K% real é ~1–5%, Ca% ~40–70% e Mg% ~8–25% — tudo caía na 1ª classe e o mapa saía uniforme. Agora cada uma nasce com faixas agronômicas próprias (K%: 1,5/3/5/8 · Ca%: 40/50/60/70 · Mg%: 8/12/18/25) e as legendas antigas já criadas são corrigidas automaticamente. Continuam editáveis em Legendas.',
    'PIXEL SÓLIDO NO MAPA (cor "mais pura"): os mapas coloridos (recomendação, fertilidade, produtividade, zonas) passam a usar reamostragem "nearest" — cada pixel vira um bloco de cor sólido ao dar zoom, em vez de borrar/misturar as cores das classes nas bordas (era essa mistura que dava a impressão de cor "não pura"). A recomendação já era 100% opaca; isso deixa as bordas nítidas.',
    'ABRIR TALHÃO DIRETO NA FAZENDA: na lista de talhões da fazenda, o botão "Abrir" (página completa do talhão, nova aba) agora fica SEMPRE visível ao lado do status — antes só aparecia ao passar o mouse.',
  ],
  '2.7.4': [
    'RELIGAR TALHÕES ÓRFÃOS — MOSTRA O PRODUTOR DA FAZENDA: no religador de talhões órfãos (Configurações), a lista de fazendas passou a exibir o PRODUTOR de cada uma ("BOA VISTA — Fulano"), e as opções ficam ordenadas por produtor → fazenda. Antes, fazendas com nome igual (ex.: duas "BOA VISTA") eram indistinguíveis e não dava para saber a qual produtor pertenciam.',
  ],
  '2.7.3': [
    'LEGENDAS DE K%/Ca%/Mg% CRIADAS E VINCULÁVEIS NO PERFIL: as saturações calculadas ganham legendas automáticas (clonadas da estrutura da V%, mesma escala 0–100%) — com isso K%, Ca% e Mg% deixam de aparecer como "sem legendas cadastradas" nos Perfis e já podem ser vinculadas e interpoladas. IMPORTANTE: as FAIXAS vêm da V% e devem ser ajustadas em Legendas (o nome de cada uma avisa: "— ajustar faixas").',
    'LEGENDAS — LISTA DE ATRIBUTOS COMPLETA: ao criar/editar uma legenda, o campo "ID do atributo" agora sugere TODAS as variáveis do catálogo (K%, Ca%, Mg%, CTCe, H+Al, relações, solúveis…), com sigla e nome — antes só listava os elementos básicos e não dava para descobrir o id dos atributos novos.',
  ],
  '2.7.2': [
    'RELATÓRIO DE RECOMENDAÇÃO — PÁGINAS NA ORDEM DO Nº DA EQUAÇÃO: além de usar o número do cadastro no título (v2.5.9), as páginas do relatório agora saem em ORDEM CRESCENTE desse número (01, 02, … 10, 23…), independentemente da ordem em que as doses foram processadas. Números até 9 continuam com zero à frente (01–09). Vale no Book das Recomendações e no relatório combinado. Equação sem nº definido vai para o fim.',
    'EXCLUIR RELATÓRIO GERADO — CONFIRMAÇÃO VISÍVEL + ERRO NA TELA: o lixinho do histórico (aba Relatórios) sempre exigiu 2 cliques, mas o 1º só mudava a cor do ícone — parecia que não apagava. Agora o 1º clique mostra "Confirmar?" ao lado do ícone (por 3,5s) e o 2º exclui. E se a nuvem não excluir de verdade (sem conexão ou sem permissão), aparece uma mensagem de erro em vez de falhar em silêncio — a lista sempre recarrega mostrando o estado real.',
    'RECOMENDAÇÃO SEMPRE EM 20 m: os mapas de DOSE (recomendações, PDF e arquivos de máquina) voltam a sair na resolução de 20 m mesmo quando a fertilidade foi interpolada mais fina (2/2,5/3/5/10 m) — os mapas finos são reamostrados para 20 m na entrada da recomendação (média dos blocos). O detalhe fino continua valendo na aba Fertilidade; a dose final mantém o padrão de 20 m das máquinas.',
  ],
  '2.7.1': [
    'CONFERÊNCIA DO CADASTRO EM EXCEL: o Início ganhou o botão "Conferência do cadastro (Excel)" (logo abaixo dos números da Visão Geral). Ele baixa uma planilha com 4 abas: Talhões (produtor, fazenda, talhão, área, status, cultura da safra atual e coluna de ALERTA — nome repetido na fazenda, órfão, área zerada), Por Fazenda (nº de talhões + soma de área), Por Produtor (fazendas, talhões e soma de área) e Problemas (resumo da auditoria: ids repetidos, órfãos, cadastros duplicados). Todas as abas fecham com o TOTAL GERAL — feito para conferir duplicidades e áreas erradas.',
  ],
  '2.7.0': [
    'CATÁLOGO COMPLETO DE VARIÁVEIS DE SOLO (lista InCeres): as Variáveis de Análise ganharam ~45 novas variáveis cadastradas — K%, Ca%, Mg% (saturações calculadas), pH CaCl2/Água/KCl/SMP, P Resina/Mehlich/Bray/Olsen/Remanescente/Total, H, Na, SB, Ca+Mg, H+Al, H%, Fe, Mo, Si, C, N, Cl, relações (Ca/K, Ca/Mg, Ca+Mg/K, Mg/K, S/P, K/Na, Fe/Mn, P/Zn), solúveis (K, Al, Ca, Mg, Na), SO4, HCO3, CO3, NH4, NO3, RAS, Densidade do Solo e CE de laudo. Novas entram como CADASTRADAS mas DESLIGADAS — ligue o "Usar" em Biblioteca → Preferências de Análise → Variáveis de Análise (onde também dá para criar variável manualmente). K%, Ca%, Mg% e CTCe já entram LIGADAS e aparecem nos Perfis (Legendas por elemento).',
    'Notas: MOS ≡ Matéria Orgânica (MO) e Al% ≡ m% já existentes (não duplicadas); "K mg", "P Remanescente" e RAS não são mapeadas automaticamente de coluna de arquivo (mapeamento manual, por segurança); a CE de laudo usa sigla CE para não confundir com o CEa do módulo de Condutividade; H, Na e Ca+Mg ganharam conversão de unidade de carga (cmolc↔mmolc).',
  ],
  '2.6.0': [
    'INTERPOLAÇÃO — PIXEL 2,5 m e 3 m + FIM DA QUEDA NO 2 m: novas opções de pixel 2,5×2,5 m e 3×3 m (além de 2/5/10/20). E o servidor de processamento não cai mais no 2 m: a 2 m em talhões grandes a grade ficava grande demais e estourava a memória do servidor (aquele erro de "servidor indisponível"/CORS). O teto da grade foi ajustado para caber com folga — em talhão muito grande o pixel fino vira automaticamente um pouco mais grosso, em vez de travar. Recomendado: 3 m dá bom detalhe e roda tranquilo; 5 m segue como padrão.',
  ],
  '2.5.9': [
    'RELATÓRIO DE RECOMENDAÇÃO — NUMERAÇÃO PELO Nº DA EQUAÇÃO: cada página de mapa passa a usar o número DEFINIDO NA JANELA DE EQUAÇÕES (campo "nº" de cada equação — ex.: Calcário 01–06, Gesso 10–14), em vez de renumerar do 01 a cada bloco. Vale no "Book" das Recomendações e no relatório combinado. Equação sem número definido cai na sequência normal, só para não ficar sem rótulo.',
  ],
  '2.5.8': [
    'SERVIDOR DE PROCESSAMENTO — MENOS "INDISPONÍVEL" NO 1º USO: o servidor de interpolação (nuvem) hiberna quando fica sem uso e leva ~1 min para acordar; nesse intervalo o processamento falhava. Agora o app espera o servidor acordar por até 150s (era 90s), já dá o toque para acordá-lo assim que você entra na aba Fertilidade e mostra o aviso "Aquecendo o servidor de processamento…" enquanto ele sobe, em vez de dar erro. Se ainda assim demorar, é só tentar de novo em ~1 min.',
  ],
  '2.5.7': [
    'CTC EFETIVA APARECE NA INTERPOLAÇÃO (inclusive em laudos antigos): as colunas calculadas (CTCe/K%/Ca%/Mg%) passam a ser geradas também na LEITURA das importações já salvas — antes só valiam para laudos importados depois da atualização. Agora a CTCe aparece na lista de atributos para interpolar na Fertilidade mesmo em importações antigas, sem reimportar. Ela herda a legenda de CTC enquanto você não criar/ajustar a legenda própria de CTCe.',
    'CTC EFETIVA NO CATÁLOGO/PERFIS: a CTCe entrou na lista de Variáveis de Análise, então aparece em Biblioteca → Perfis (Legendas por elemento) e demais listas de variáveis. Ela nunca é lida de coluna de arquivo (é sempre calculada de Ca+Mg+K+Al).',
    'OBS.: se você ainda vê a tela sem a CTCe (ex.: nas Equações), faça um recarregamento forçado (Ctrl/Cmd+Shift+R) — era cache do navegador; a versão publicada já traz a CTCe.',
  ],
  '2.5.6': [
    'AUDITORIA DO CADASTRO (conferir os números do Início): novo comando de console invAuditoria() que recomputa Produtores/Fazendas/Talhões/Área e aponta inconsistências que poderiam inflar os totais — ids repetidos, fazendas órfãs (sem produtor), talhões órfãos (sem fazenda) e cadastros repetidos pelo mesmo nome. Só leitura, não altera nada. Também mostra a área separada em "todos" × "só ativos" (o KPI Talhões conta só ativos, a Área somava todos).',
  ],
  '2.5.5': [
    'CTC EFETIVA NA INTERPOLAÇÃO/EQUAÇÕES: agora existe uma legenda de CTC efetiva (sigla CTCe) criada automaticamente a partir da sua legenda de CTC (mesmas faixas/cores, editável em Legendas). Com ela, a CTCe passa a aparecer na lista de atributos para INTERPOLAR na aba Fertilidade — gere o mapa de CTCe e ele fica disponível para usar nas equações (token CTCe). Feito uma vez por navegador; se você apagar a legenda de CTCe, ela não é recriada.',
  ],
  '2.5.4': [
    'INTERPOLAÇÃO (FERTILIDADE) — PIXEL DE 2 m E PADRÃO 5 m: a krigagem/IDW ganhou a opção de pixel 2 × 2 m (mais detalhe) e o padrão passou de 20 m para 5 m. Opções agora: 2, 5 (padrão), 10 e 20 m. Mapas já interpolados continuam aparecendo normalmente; a resolução só vale para a PRÓXIMA interpolação. Obs.: a grade é limitada a 500×500 células, então em talhões muito grandes o 2 m/5 m é ajustado automaticamente para caber.',
  ],
  '2.5.3': [
    'EQUAÇÕES — "SALVAR COMO" AGORA PERGUNTA O NOME: ao usar "Salvar como" no editor de equações, o app pede o nome da nova equação (com uma sugestão preenchida) em vez de clonar direto com o nome atual ou "(cópia)". Cancelar não cria nada.',
  ],
  '2.5.2': [
    'EQUAÇÕES — CTC EFETIVA DISPONÍVEL: a CTC efetiva (calculada na importação do laudo, sigla CTCe = Ca+Mg+K+Al) entrou na tabela de atributos das equações de recomendação. Agora dá para usar CTCe nas fórmulas (ex.: saturações na CTC efetiva) como qualquer outro atributo — basta ter o mapa de CTCe interpolado na profundidade da equação (aba Fertilidade). A sigla nas colunas calculadas também passou a ser CTCe.',
  ],
  '2.5.1': [
    'EDITOR MANUAL DE ZONAS — ESTATÍSTICAS DO RASTER: ao selecionar UMA zona no editor manual, além de área/perímetro/% do talhão, aparecem os valores do raster dentro da zona por camada usada na geração — média, mínimo, máximo e desvio padrão (recalculados na hora quando você une ou divide zonas). Precisa dos mapas interpolados carregados (aba Fertilidade).',
    'EDITOR MANUAL DE ZONAS — PERMISSÕES: as operações do editor passaram a respeitar 4 permissões por papel (Configurações → Usuários → Permissões): "Zonas: unificar", "Zonas: reclassificar", "Zonas: dividir" e "Zonas: salvar". Por padrão, Owner/Admin/Agrônomo podem tudo; Operador/Prestador não editam zonas. Quem não tem a permissão não vê o botão correspondente (e o lápis de editar some se o papel não pode fazer nenhuma das três).',
  ],
  '2.5.0': [
    'ZONAS DE MANEJO — EDITOR MANUAL: cada zoneamento salvo ganhou o botão de LÁPIS que abre um editor manual sobre as zonas prontas. Dá para SELECIONAR zonas clicando direto no mapa (ou na lista), UNIFICAR 2+ zonas vizinhas numa só (dissolve a divisa interna e você escolhe a classe final — só vizinhas de fronteira compartilhada podem ser unidas), RECLASSIFICAR uma zona (troca só a classe/cor, a geometria e os dados de origem ficam intactos) e DIVIDIR uma zona por uma linha de corte (com área mínima respeitada). Tem Desfazer/Refazer, Restaurar as zonas originais e um campo de Motivo que fica no histórico. Cada edição é salva como uma NOVA versão ("… — Ajuste manual"), com o registro das operações, usuário e data — o zoneamento original NUNCA é sobrescrito e continua na lista. Estatísticas (área, % do talhão e perímetro) são recalculadas na hora.',
    'IMPORTAÇÃO DE LAUDO — COLUNAS CALCULADAS: ao importar a tabela do laboratório, a plataforma passa a gerar 4 colunas calculadas ao fim da tabela: t (CTC efetiva = Ca+Mg+K+Al), K%, Ca% e Mg% (saturação de cada base na CTC nominal/pH7). Aparecem na prévia (em azul, itálico, somente-leitura) e são gravadas junto — recalculam sozinhas se você corrigir um valor de Ca/Mg/K/Al/CTC na prévia. Ficam disponíveis para mapear como qualquer variável (é só criar uma legenda para elas).',
  ],
  '2.4.2': [
    'ZONAS DE MANEJO — SALVAR MAIS VISÍVEL: a etapa Avaliar ganhou um botão GRANDE "Salvar zoneamento" (verde, largura total) no fim do painel, depois da lista de polígonos — o botãozinho do cabeçalho continua como atalho. Nada mudou no que é salvo.',
  ],
  '2.4.1': [
    'ZONAS DE MANEJO — LIMITE EXTERNO OFICIAL (backend interp-20): o contorno externo das zonas agora é SEMPRE o polígono cadastrado do talhão — o raster deixou de definir o perímetro. Fim da borda pixelada em degraus: na geração, as classes viram uma partição EXATA do talhão (faixas de borda e áreas sem dado vão para a zona vizinha de maior divisa) e a união das zonas preenche 100% da área oficial. Só as divisas INTERNAS são simplificadas.',
    'SUAVIZAR LIMITES — SÓ DIVISAS INTERNAS (regra fixa): a opção "Manter limite externo" saiu — preservar o contorno oficial agora é obrigatório e automático. A ferramenta também completa zoneamentos antigos que não alcançavam a borda (as faixas incorporadas aparecem no resumo) e mostra a VALIDAÇÃO DE COBERTURA: área do talhão × soma das zonas × diferença (deve ser ~0; senão o backend recusa o resultado).',
    'CORREÇÃO DOS ERROS 422/500 AO SUAVIZAR (talhões irregulares): faces vizinhas da mesma zona eram agrupadas num MultiPolygon inválido — a limpeza virava GeometryCollection, a extração de divisas vinha vazia ("suavização degenerou a geometria") e o preenchimento de vãos quebrava (erro 500). Agora as faces são DISSOLVIDAS (união) e as mensagens de erro do backend dizem exatamente o que falhou (geometria inválida, tolerância incompatível, falha de reconstrução).',
  ],
  '2.4.0': [
    'SUAVIZAR LIMITES DAS ZONAS DE MANEJO: nova ferramenta opcional, DEPOIS que as zonas estão prontas — disponível na etapa Avaliar (zonas recém-geradas) e em cada zoneamento salvo (ícone de curva). Três níveis (Leve / Moderado / Intenso) + modo Personalizado (tolerância em metros, iterações, limites de área). A prévia aparece no mapa na hora, com botão "Ver original" e destaque em AMARELO das áreas que mudaram; o resumo mostra área antes/depois por zona, vértices removidos e o deslocamento máximo da linha — com alerta acima de 1%, confirmação acima de 3% e bloqueio acima de 5% de alteração (configuráveis).',
    'A suavização preserva a TOPOLOGIA: a divisa entre duas zonas continua sendo exatamente a MESMA linha (sem sobreposições nem vazios), o contorno do talhão fica INTACTO por padrão ("Manter limite externo") e buracos legítimos (áreas sem dado) não são preenchidos. Sobreposições/vãos herdados de zonas antigas são corrigidos de brinde e reportados no resumo.',
    'OPÇÕES EXTRAS: "Corrigir pequenos fragmentos" (manchas menores que a área mínima vão para a vizinha de maior divisa) e "Adequar para operação de máquinas" (remove gargalos/corredores mais estreitos que a largura do implemento). "Salvar como nova versão" cria um zoneamento novo ("… — Suavização leve/moderada/…") com os parâmetros, data e usuário registrados — o ORIGINAL nunca é sobrescrito e pode ser restaurado a qualquer momento.',
    'DIVISA ÚNICA NA GERAÇÃO (backend interp-18/19): a vetorização das zonas agora simplifica a cobertura INTEIRA de uma vez (coverage_simplify) — fim dos "dentinhos" de sobreposição/vão na divisa entre zonas vizinhas que apareciam no mapa. Zonas já salvas: basta gerar de novo (ou aplicar a suavização, que também corrige).',
  ],
  '2.3.0': [
    'SUBSTITUIR POLÍGONO — VERIFICAÇÃO SÓ DO CICLO ATUAL: trocar o limite de um talhão que já tem geometria agora verifica APENAS a safra ATIVA. Se o ciclo atual tiver qualquer dado do talhão (cultura, grades/coletas de amostragem, análises de fertilidade, compactação, mapas de produtividade, composições de sensoriamento, medições de campo ou recomendações/cenários), a troca é BLOQUEADA com a lista do que foi encontrado e o nome do ciclo verificado. Safras anteriores nunca bloqueiam. Vale no upload do talhão, no editor de limite, na importação em massa (linhas "atualiza limite") e no "Substituir limite" das Medições.',
    'VERSÕES DO POLÍGONO: ao substituir, o limite anterior fica ARQUIVADO no talhão (com as safras que o usaram) e a nova geometria vira a principal para o ciclo atual e os próximos. Nada do histórico é recalculado ou recortado com o limite novo; a ficha do talhão mostra "limite v2, v3…" quando houve substituição.',
    'Dados estruturais sem ciclo (condutividade, altimetria/MDE, zonas de manejo) não bloqueiam a troca — permanecem como estão, vinculados à geometria da época. Sem safra ativa definida, a substituição é livre e a nova geometria vale para o próximo ciclo criado. Sem internet a troca fica bloqueada por precaução (não dá para conferir as recomendações na nuvem).',
  ],
  '2.2.0': [
    'EXCLUIR FAZENDA: a página da fazenda (aba Dados) ganhou o botão "Excluir fazenda". Por segurança, é preciso digitar EXCLUIR para confirmar. A exclusão apaga a fazenda, os talhões e tudo ligado a eles (análises, grades, mapas, cenários, zonas de manejo) — no aparelho e na nuvem. Disponível para quem já pode excluir produtor.',
    'EXCLUSÃO DE PRODUTOR MAIS COMPLETA: as zonas de manejo e ambientes (MEAP) dos talhões agora também são apagados na cascata — antes ficavam órfãos na base.',
  ],
  '2.1.0': [
    'FIM DO "ARMAZENAMENTO LOCAL CHEIO": os caches pesados (talhões, condutividade, produtividade, MDE, zonas…) saíram do armazenamento pequeno do navegador (~5-10 MB, que vivia estourando) para o armazenamento GRANDE (IndexedDB, gigabytes). Na primeira abertura desta versão a migração é automática e LIBERA o espaço antigo na hora — nada a fazer, nada muda na nuvem.',
    'ABERTURA VOLTA A USAR O BOOT RÁPIDO: com o armazenamento cheio, o cache local não conseguia gravar e o app re-baixava a base INTEIRA a cada abertura. Com o espaço liberado, o cache volta a funcionar e a abertura usa de novo o boot rápido (só o que mudou desde a última vez).',
  ],
  '2.0.5': [
    'ABERTURA NÃO TRAVA MAIS 20s QUANDO A NUVEM CAI: o diagnóstico mostrou que os "15-20s para abrir" NÃO são do app (migrações 0ms, leitura dos talhões 0,4s) — é o boot esperando o servidor Supabase que está intermitentemente fora do ar (erro 522, ~19,5s). O teto de espera caiu de 20s para 12s: quando a nuvem está degradada, o app entra com os dados locais em ~12s em vez de 20s (e termina de sincronizar em 2º plano). Observação: a causa raiz é a instabilidade do backend Supabase — enquanto ela não for resolvida, o login pode ficar lento nas quedas.',
  ],
  '2.0.4': [
    'DIAGNÓSTICO DA ABERTURA: o console agora cronometra a fase pós-boot (seeds/migrações e o total até a tela liberar) e as leituras "frias" pesadas do cache local — para rastrear os segundos que a Início ainda leva para abrir mesmo com o boot rápido. Sem mudança visível; só instrumentação.',
  ],
  '2.0.3': [
    'COLETA — FIM DO TRAVAMENTO AO SALVAR AMOSTRAS COM FOTO: a cada coleta confirmada, o app RE-CARREGAVA todas as fotos do aparelho (os arquivos inteiros) na memória só para contar quantas faltavam sincronizar — então quanto mais fotos, mais lento e travado ficava a cada "OK". Agora a contagem usa um índice e NÃO carrega mais os arquivos; a sincronização também passa a buscar só as fotos pendentes. O app de campo para de degradar ao longo da coleta.',
  ],
  '2.0.2': [
    'RELATÓRIO COMBINADO — FERTILIDADE PRIMEIRO: no PDF único, a seção de Fertilidade (capa + mapas dos elementos) agora vem ANTES da seção de Recomendação. A ordem das seções na tela também acompanha.',
    'MAPAS DE RECOMENDAÇÃO NUMERADOS: cada página de recomendação passa a ter o número do mapa no título — ex.: “01 - Calcário”, “02 - …”, “10 - <nome da fórmula>” — na ordem das equações da recomendação (reinicia a cada recomendação). Vale tanto no relatório combinado quanto no “Book” da aba Recomendações.',
    'CAMPO — PRODUTORES FALTANDO CORRIGIDO: quando o armazenamento do celular estava cheio, as gravações da base falhavam no meio e a lista de produtores/fazendas ficava incompleta; o boot rápido (só o que mudou) não repunha o que faltava. Agora, na 1ª abertura após liberar espaço, o app força uma recarga COMPLETA da base — os produtores que sumiram voltam.',
  ],
  '2.0.1': [
    'APP DE CAMPO (COLETA) — FIM DO "ARMAZENAMENTO CHEIO": o app de campo baixava para o celular a BASE INTEIRA da plataforma (condutividade ~2 MB, produtividade, MDE, composições, zonas/MEAP, laudos, preços, equações…) — coleções que a Coleta nem usa — e o armazenamento do navegador estourava. Agora o campo baixa SÓ o que precisa (produtores, fazendas, talhões, grades, safras, legendas e acesso) e, ao abrir, APAGA do aparelho as coleções pesadas que versões anteriores tinham deixado — liberando o espaço na hora. Nada muda na nuvem: o campo só lê essas coleções (as coletas/medições/fotos continuam com sincronização própria).',
  ],
  '2.0.0': [
    'RELATÓRIO ÚNICO: FERTILIDADE + RECOMENDAÇÃO: a aba Relatórios agora monta um PDF só com DUAS seções — Fertilidade (os mapas de elementos, como antes) e Recomendação (as recomendações/cenários já gerados na aba Recomendações do talhão+safra). As duas vêm MARCADAS por padrão; basta desmarcar uma para gerar só a outra. A Fertilidade sai primeiro (capa + 1 página por elemento), seguida das páginas de dose da Recomendação, tudo em A4 paisagem. Cada elemento e cada recomendação é selecionável individualmente; a contagem de páginas aparece no botão. O histórico guarda as duas seções e regenera o PDF combinado ao reabrir.',
  ],
  '1.99.0': [
    'FIM DO AVISO FALSO "boot demorou >20s": o temporizador de segurança do login (que entra com dados locais se a nuvem travar) não era cancelado quando o boot terminava rápido — então ele disparava 20 s depois e escrevia esse aviso no console mesmo com a abertura tendo levado ~1 s. Agora o timer é cancelado assim que o boot conclui; o aviso só aparece se a nuvem realmente demorar mais de 20 s.',
  ],
  '1.98.0': [
    'ABA NDVI ABRE NA HORA: abrir a aba baixava TODOS os rasters de TODOS os índices mantidos do talhão (megabytes) e descomprimia tudo antes de mostrar qualquer coisa. Agora só os METADADOS (KBs) chegam de imediato — cards, linha do tempo e estatísticas aparecem na hora — e o mapa da cena selecionada baixa sob demanda ("Baixando o mapa desta cena…").',
    'CACHE LOCAL DE MAPAS (o fim do re-download): todo raster baixado da nuvem (NDVI, fertilidade, produtividade, MDE, condutividade, compactação, composições, zonas) fica guardado no aparelho (IndexedDB) com a versão da nuvem. Reabrir a mesma aba/talhão só consulta uma listagem leve e reaproveita o que já está no aparelho; a rede entra apenas para o que mudou. Vale para todos os módulos.',
    'CAMADAS SALVAS E PDF DO NDVI INSTANTÂNEOS: a aba "Camadas salvas" e a lista do "Gerar PDF" listam só metadados; os rasters são baixados (ou vêm do cache) apenas ao gerar o PDF, só dos mapas marcados.',
    'DIAGNÓSTICO DO BOOT: o console agora diz POR QUE uma abertura caiu no boot completo (1ª vez, pendências de sync, reconciliação periódica ou counts divergentes — com os números), para rastrear qualquer abertura lenta que sobrar.',
    'NOTA: a v1.97 (linha do tempo no PDF, versão contrastada, período padrão de 3 meses) não tinha chegado à produção por uma falha de deploy — sai junto com esta versão.',
  ],
  '1.97.0': [
    'PDF DO NDVI — LINHA DO TEMPO: quando o relatório tem mais de um mapa de índice, a última página traz o gráfico "Linha do tempo — média dos índices" (mesma leitura da aba NDVI): 1 série colorida por índice+satélite, pontos nas datas dos mapas selecionados (eixo proporcional ao tempo), valores sobre os pontos e legenda.',
    'PDF DO NDVI — VERSÃO CONTRASTADA: cada NDVI mantido agora aparece 2x na lista do PDF — normal (escala fixa 0–1) e "contraste realçado" (escala esticada p2–p98, igual ao botão Contraste do mapa) — escolha a que melhor mostra a variação do talhão em cada caso (dá até para incluir as duas).',
    'NDVI — PERÍODO PADRÃO DA BUSCA: as datas abrem sempre com "Até" = hoje e "De" = 3 meses atrás, em todas as fontes (trocar para CBERS-4A não puxa mais 12 meses).',
  ],
  '1.96.0': [
    'NDVI — PDF RÁPIDO PARA O PRODUTOR: na aba NDVI/Satélite do talhão, o novo bloco "📄 Gerar PDF para o produtor" lista os mapas disponíveis (índices MANTIDOS — NDVI/NDRE/etc., Sentinel-2 e CBERS — e imagens RGB carregadas na sessão); marque um ou mais e o PDF sai com 1 mapa por página: logos, produtor/fazenda/talhão/safra/área, mapa com contorno sobre fundo de satélite, barra da legenda com o domínio e rodapé com data. Ideal para enviar por WhatsApp/e-mail.',
  ],
  '1.95.0': [
    'ABERTURA ~10x MAIS RÁPIDA — BOOT INCREMENTAL: o app baixava a base INTEIRA da nuvem (~9 s de rede, medido) a cada abertura. Agora guarda uma marca d\'água e baixa SÓ O QUE MUDOU desde a última abertura (4 consultas pequenas, <1 s). Segurança: qualquer divergência de contagem (ex.: exclusões), pendência local ou 24 h sem boot completo → cai automaticamente no boot completo (que também ficou mais rápido: talhões e coleções baixam em paralelo).',
    'RELIGAR TALHÕES ÓRFÃOS — CRIAR FAZENDA NA HORA: grupo órfão cuja fazenda não existe mais (apagada e não recadastrada) agora tem o botão "➕ Criar": escolhe o produtor e a fazenda nasce ali mesmo (nome/sigla = prefixo do grupo), já selecionada para religar. O município fica em branco e é preenchido depois pela classificação por localização do mapa geral.',
  ],
  '1.94.0': [
    'INÍCIO ABRE LIMPO E RÁPIDO — MAPA GERAL VIROU BOTÃO: a visão geral dos talhões (centroides por município + classificação por localização) não roda mais automaticamente na abertura. O Início volta a abrir direto como antes, e o botão "📍 Mapa geral dos talhões" (canto do mapa) liga a visão geral quando você quiser — com o ✕ para fechar. Tudo dela (classificação, legenda, correção de municípios) só acontece sob demanda.',
  ],
  '1.93.0': [
    'ABERTURA DA PLATAFORMA MAIS RÁPIDA (2ª rodada da caça à lentidão): (1) talhões antigos sem bbox ganham o bbox GRAVADO de vez (migração única) — antes o polígono inteiro era re-analisado a cada abertura só para plotar o centroide; (2) o boot só regrava/recomprime no aparelho as coleções que MUDARAM na nuvem (a recompressão dos ~MB de talhões a cada abertura era pura perda); (3) o espelho de sincronização nasce pronto no boot — o primeiro save da sessão envia só o que mudou (antes re-enviava a coleção inteira e disparava a poda not-in, que agora não roda mais em operação normal); (4) cronômetro no console ([boot] …ms) para diagnosticar aberturas lentas: mostra quanto foi rede vs. gravação local.',
  ],
  '1.92.0': [
    'PLATAFORMA RÁPIDA DE NOVO (caça com 5 agentes): a lentidão desde a v1.81/82 era a tela Início recalculando o centroide dos 916 talhões — incluindo a leitura do polígono inteiro de talhões antigos sem bbox — A CADA ponto classificado pela geocodificação (~1,2 s, por minutos). Correções: (1) centroides calculados UMA vez por visita ao Início e memoizados por talhão (parse de polígono só quando a geometria muda); (2) recolorização em lotes de 5 pontos em vez de a cada consulta; (3) cache de municípios gravado em lote (era regravado inteiro a cada consulta) e com aviso se falhar por falta de espaço (falha silenciosa fazia a classificação re-rodar toda sessão); (4) correção de município das fazendas em 1 gravação única (eram até 165 regravações da lista).',
  ],
  '1.91.0': [
    'LOGIN E ABERTURA NÃO TRAVAM MAIS COM SERVIDOR LENTO: quando o servidor de autenticação está degradado (como hoje), o "Entrando…" ficava pendurado para sempre — agora estoura em 12 s e o app tenta o LOGIN OFFLINE deste aparelho (mesmo e-mail e senha de quem já entrou nele). E o "Verificando acesso…" tem teto de 20 s: se a nuvem demorar, o app ABRE com os dados do aparelho e completa a sincronização em 2º plano — seguro, porque sem carga íntegra não há poda (v1.86) e gravações locais ficam pendentes/mescladas até a nuvem confirmar (v1.87).',
  ],
  '1.90.0': [
    'MANUTENÇÃO — RELIGAR TALHÕES ÓRFÃOS (Configurações, só Owner): quando uma fazenda é apagada e recadastrada, ela ganha outro id interno e os talhões dela "somem" da navegação (continuam salvos, mas apontando para a fazenda antiga). A nova ferramenta procura esses órfãos, agrupa pela sigla do nome (ex.: IGEFI 15 → grupo IGEFI), sugere a fazenda certa, deixa ajustar manualmente e religa tudo numa única gravação — sincronizando na nuvem pelo caminho normal.',
  ],
  '1.89.0': [
    'RAMPAS DE CORES TAMBÉM NAS LEGENDAS: no editor de legendas (Biblioteca), o bloco "Rampas de cor" aplica Padrão/Spectral/RdYlGn/Turbo às classes com um clique — cada classe recebe o trecho da rampa que ocupa (gradiente contínuo na barra), com opção Inverter. Convive com as paletas salvas: aplica a rampa, ajusta o que quiser e salva como paleta.',
  ],
  '1.88.0': [
    'RAMPAS DE CORES NAS EQUAÇÕES (estilo QGIS): no Estilo do mapa, além do padrão verde→vermelho, agora dá para escolher SPECTRAL, RdYlGn e TURBO — cartões com a pré-visualização do gradiente; clicou, as classes recolorem na hora. Checkbox "Inverter" vira o sentido da rampa (como no QGIS). A rampa escolhida fica salva na equação e é usada pelo "Distribuir cores" e ao adicionar/remover classes.',
  ],
  '1.87.0': [
    'LANÇAMENTOS NÃO SE PERDEM MAIS QUANDO A CONEXÃO CAI: antes, se o usuário lançava dados sem internet (ou a conexão caía no meio) e recarregava a página, o app trazia os dados da nuvem POR CIMA do que estava no aparelho — apagando os lançamentos que não tinham subido. Agora cada gravação fica marcada como "pendente" até a nuvem CONFIRMAR; ao recarregar, o app MESCLA o pendente com a nuvem (nada some) e re-envia sozinho. O reenvio também ficou mais insistente: tenta ao voltar a internet, ao voltar para a aba e a cada 45 s.',
  ],
  '1.86.0': [
    'CORREÇÃO CRÍTICA DE SINCRONIZAÇÃO (perda de dados): o carregamento da nuvem lia no máximo 1.000 registros de uma vez (limite do Postgres/PostgREST). Em bases grandes (muitos talhões/plantios/laudos) isso trazia só parte dos dados para o aparelho, e a gravação seguinte "podava" da nuvem tudo que não tinha vindo — apagando fazendas/registros. Agora o carregamento é PAGINADO (traz tudo, sem teto), e a poda de órfãos só roda depois de um carregamento íntegro comprovado (nunca com dados parciais). Isso estanca a perda; dados já apagados precisam ser restaurados de um backup.',
  ],
  '1.85.0': [
    'PRESETS DE DIVISÃO DE CLASSES NA EQUAÇÃO: no Estilo do mapa, um seletor "Importar preset de classes" traz padrões prontos — Calcário/Gesso (faixas grandes 1.000…10.000), KCl/Potássio (25…250) e Fósforo/P (20…200) — resolvendo o caso em que doses baixas caíam todas numa classe só. Botão "Salvar preset" guarda a divisão atual como um preset reutilizável (sincroniza na nuvem); presets do usuário podem ser excluídos, os do sistema não.',
  ],
  '1.84.0': [
    'VISÃO GERAL SÓ NA TELA DE ABERTURA: os centroides por município e a legenda passaram a aparecer SOMENTE no mapa do Início. Antes vazavam para a página completa do talhão (que usa o mesmo mapa), aparecendo por cima do talhão aberto.',
  ],
  '1.83.0': [
    'RECOMENDAÇÃO — "DIVIDIR CLASSES AUTOMATICAMENTE" AGORA FUNCIONA: no estilo do mapa da equação, ligando a chave, as classes de cor passam a dividir o intervalo da própria equação (Dose mínima viável → Dose máxima) em faixas iguais, em vez de ficar presas em 1.000…10.000. Ex.: mínima 50 e máxima 500 com 10 classes vira 95, 140, 185 … 500 (piso 50 = a máquina não aplica menos que isso; abaixo vira 0). Mudou a mínima/máxima na equação, as classes se reajustam sozinhas; você controla só a quantidade de classes e as cores (os limites ficam calculados). Antes a chave não fazia nada.',
  ],
  '1.82.0': [
    'MAPA DO INÍCIO CLASSIFICA PELO MUNICÍPIO REAL (não pelo cadastro): a cor de cada talhão passa a vir da POSIÇÃO geográfica do ponto (geocodificação OSM, feita 1x e guardada em cache), acabando com a bagunça de antes — "Carambeí" vs "CARAMBEÍ" viravam cores diferentes, talhões sem município ficavam cinza e apareciam strings tipo "Arapoti / Pinhalão". Enquanto classifica, mostra "Classificando por localização… X/Y".',
    'CADASTRO SE CORRIGE PELA LOCALIZAÇÃO: ao classificar, o município de cada fazenda é atualizado automaticamente para o município REAL predominante dos seus talhões (ex.: fazenda cadastrada em Carambeí mas cujos talhões estão em Tibagi passa a constar Tibagi).',
  ],
  '1.81.0': [
    'TELA INÍCIO — MAPA DE VISÃO GERAL DOS TALHÕES: ao abrir o Início, o mapa mostra um ponto (centroide) por talhão cadastrado, COLORIDO POR MUNICÍPIO, com legenda ao lado. Começa em mapa de RUAS (visualiza melhor as divisas) e enquadrado no Paraná; um botão alterna "Paraná" ⇄ "Todos" (útil porque juntar Tocantins deixa tudo pequeno). Clicar num ponto abre o talhão. Talhão sem geometria não entra (não tem onde plotar).',
  ],
  '1.80.0': [
    'GRID — FIM DA PERDA SILENCIOSA DE EDIÇÕES: (1) se você editou pontos manualmente e mexer em qualquer parâmetro (densidade, borda, rotação, sorteio…), o app agora AVISA que o grid será regenerado e pede confirmação antes de descartar as edições — antes descartava em silêncio e o salvar gravava o grid regenerado; (2) a grade recém-salva fica selecionada ("em vista"): editar pontos em seguida parte DELA e o botão vira "Salvar alterações" (grava por cima) — antes criava uma Grade 2 e a original ficava com o grid inicial.',
  ],
  '1.79.0': [
    'BACKUP PRÓPRIO DOS DADOS: em Configurações (só o Owner), novo botão "Exportar backup (.json)" baixa TODOS os dados (produtores, fazendas, talhões, grades, laudos, medições, biblioteca, papéis…) num arquivo datado — guarde no Drive/OneDrive; recomendado exportar mensalmente. E a RESTAURAÇÃO (zona de risco, exige digitar RESTAURAR + confirmação) regrava o navegador e a nuvem a partir do arquivo. Senhas e chaves por-dispositivo ficam de fora por segurança; mapas de fertilidade processados são deriváveis e podem ser reprocessados.',
  ],
  '1.78.0': [
    'PDFs ATÉ 5-10x MENORES, SEM PERDA VISÍVEL: todos os relatórios (MDE, Comparação, Fertilidade, Recomendações) passaram a comprimir o arquivo e a embutir os MAPAS como JPEG de alta qualidade no tamanho certo de impressão (200 dpi) — antes cada mapa ia como PNG cheio. Textos e tabelas continuam vetoriais (nítidos em qualquer zoom); legendas em gradiente e logos com transparência seguem em PNG.',
    'NOME DA EQUAÇÃO NOS MAPAS DE RECOMENDAÇÃO DO PDF: no comparador de cenários e no mapa oficial, cada mapa agora traz o nome da equação usada (o método) como subtítulo — na tela isso já aparecia em cada card.',
  ],
  '1.77.0': [
    'APP DE CAMPO — COR PRÓPRIA PARA 2+ PROFUNDIDADES: no mapa da amostragem, ponto pendente que exige mais de uma profundidade (ex.: 00-20 E 20-40) aparece em VIOLETA — dá para enxergar de longe onde coletar mais de uma camada. Coletado continua verde (o status manda), selecionado continua azul. A legenda "● 2+ profundidades" aparece quando a grade tem pontos assim; o painel do ponto já mostra as profundidades.',
  ],
  '1.76.0': [
    'CORREÇÃO NO GRID DE AMOSTRAGEM: as edições manuais dos pontos (mover, adicionar, excluir) agora são salvas de verdade. Editar uma grade JÁ SALVA ganhou o botão "Salvar alterações" (grava por cima, sem criar cópia) — antes, o salvar guardava só o grid gerado no início e as edições se perdiam. Os números dos pontos são preservados (o vínculo com o laboratório não muda).',
  ],
  '1.75.0': [
    'PERMISSÃO POR TALHÃO: além do vínculo por cliente, agora dá para restringir um usuário a TALHÕES específicos — no painel de Usuários, o modal de acesso ganhou a seção "Talhões" com busca. Caso típico: prestador de amostragem vê SÓ os talhões do serviço contratado (plataforma e app de campo). Sem restrição marcada, nada muda.',
    'O botão de vínculos também aparece para o papel Prestador de serviço.',
  ],
  '1.74.0': [
    'LINK DO PRESTADOR NAS MEDIÇÕES SALVAS: o link público (abre só a área, sem login) agora pode ser gerado de qualquer medição guardada — botão de corrente na lista de medições salvas do APP DE CAMPO e botão "Link do prestador" no repositório de Medições do painel. Polígonos preservam os furos; linhas e pontos também viram link.',
  ],
  '1.73.0': [
    'GRADES DUPLICADAS CORRIGIDAS (caso JCASA 01): uma limpeza automática remove grades salvas em duplicidade (mesmo talhão, safra, época e pontos idênticos), mantendo a mais antiga — e preservando qualquer uma que já esteja ligada a laudo ou coleta de campo. Roda sozinha ao abrir o app e sincroniza para todos os aparelhos.',
    'TRAVA ANTI-DUPLICATA: salvar uma grade exatamente igual a uma existente (ex.: duplo clique no botão) agora reaproveita a existente em vez de criar outra cópia.',
  ],
  '1.72.0': [
    'MIGRAÇÃO CONCLUÍDA — FIREBASE REMOVIDO: o app agora é 100% Supabase (auth + dados). O SDK do Firebase saiu do projeto por completo (código e dependência) — bundle menor, menos peças móveis. Comportamento idêntico; o login offline (verificador local) continua funcionando.',
  ],
  '1.71.0': [
    'INDICADOR DE SINCRONIZAÇÃO: quando algum envio à nuvem falha (ex.: sem internet), aparece um aviso discreto "não sincronizado" (bolinha âmbar na barra lateral do painel e no rodapé do app de campo) com as coleções pendentes no tooltip — some sozinho quando o reenvio automático conclui. Armazenamento local cheio aparece em vermelho.',
  ],
  '1.70.0': [
    'LIMPEZA INTERNA: estilo de inputs unificado (antes copiado em 24 arquivos), funções de formatação e rótulos de legenda deduplicadas, e o histórico de versões saiu do pacote comum do app (só a tela de Configurações o carrega) — páginas um pouco mais leves.',
    'SEGURANÇA DO SITE: novos cabeçalhos de proteção (anti MIME-sniffing, anti clickjacking e política de referrer) em todas as páginas.',
  ],
  '1.69.0': [
    'RESETAR SENHA no painel de usuários: botão de chave em cada usuário gera uma senha provisória NOVA para conta que já existe (ex.: esqueceu a senha ou o convite se perdeu) — e reativa a troca obrigatória no 1º acesso. O reset também CONFIRMA o e-mail da conta, destravando quem ficou preso na confirmação pendente.',
    'CONVITE MAIS ROBUSTO: quando o servidor estiver configurado (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + INVICTA_ADMIN_EMAILS no Render), criar usuário passa a ser feito pelo backend com a conta já confirmada — SEM depender do toggle "Confirm email" do Supabase. Sem a configuração, o caminho antigo continua valendo. Ações de admin exigem login de um e-mail da lista de administradores (a chave pública não basta).',
  ],
  '1.68.0': [
    'NUMERAR EQUAÇÕES DIRETO NA LISTA: cada equação ganhou um campinho de Nº na frente do nome (tela Equações). Digite o número e saia do campo (ou Enter) — salva e a lista se reordena na hora. Menor número primeiro dentro do grupo; vazio = ordena por nome. É o jeito rápido de aplicar a numeração 01-19 / 20-29 / 30+ nas equações já existentes.',
  ],
  '1.67.0': [
    'IMPORTAÇÃO DE LABORATÓRIO — "N.D." E "<x" VIRAM ZERO: valores de laudo marcados como não detectado (N.D., N.D, ND, N/D) ou abaixo do limite de detecção (ex.: "<0,5") agora entram como 0 (o laboratório mediu e não achou). Célula VAZIA, texto qualquer e ">x" continuam SEM valor — não inventamos zero para o que não foi analisado. Vale também ao digitar na prévia editável.',
  ],
  '1.66.0': [
    'USUÁRIOS AGRUPADOS POR CATEGORIA no painel de acesso: Equipe interna → Produtores → Prestadores de serviço, com o convite organizado nos mesmos grupos. Para prestadores: campo "Validade (dias)" no convite, badge na lista ("expira em N dias" / "EXPIRADO", com a data no tooltip) e botão RENOVAR com os dias que você escolher.',
  ],
  '1.65.0': [
    'PAPEL "PRESTADOR DE SERVIÇO" com VALIDADE DE LOGIN EM DIAS: novo papel para prestadores de amostragem (permissão só de Amostragem), com validade definida pelo Owner ao convidar. Expirou → o login é bloqueado com a mensagem "Seu acesso expirou em {data} — fale com o administrador". Sem validade definida = nunca expira (nada muda para os usuários atuais).',
    'CONVITE SEM E-MAIL DE CONFIRMAÇÃO, com diagnóstico: se o projeto Supabase ainda estiver exigindo confirmação por e-mail (a causa do convite travar), o app agora DETECTA na hora e mostra o passo exato para desligar (Authentication → Sign In / Providers → Email → Confirm email OFF). Mesma instrução na mensagem de erro de login do convidado.',
    'TESTE AUTOMATIZADO DO FLUXO: novo script "npm run teste:convite" cria um usuário de teste real, loga com a senha provisória, troca a senha e confere que a antiga deixa de valer — diagnóstico de ponta a ponta.',
  ],
  '1.64.0': [
    'REFINAMENTOS DA REVISÃO FINAL na importação de laboratório: (1) planilhas de célula mesclada (talhão preenchido só na 1ª linha de cada ponto) voltam a fundir as linhas macro+micro do mesmo ponto — a linha sem talhão herda o da anterior, e ainda passa a entrar no filtro por talhão; (2) a prévia editável foi memoizada — filtro, ordenação e detecção de outliers não recomputam mais a cada tecla em campos não relacionados.',
  ],
  '1.63.0': [
    'APP MAIS LEVE NO NAVEGADOR: o SDK do Firebase (usado só como ponte legada durante a migração para o Supabase) deixou de entrar no pacote inicial do app — agora é baixado sob demanda, apenas quando/se for realmente usado. Nenhuma mudança de comportamento; com o Supabase ativo, o Firebase nem chega a ser baixado nos fluxos de dados.',
  ],
  '1.62.0': [
    'PROTEÇÃO ANTI-ABUSO DO BACKEND (opcional, ativada por variáveis de ambiente): o servidor de processamento passa a poder exigir uma chave (X-Api-Key) em todos os endpoints — inclusive os que consomem APIs pagas (IA, satélite) — e a restringir os domínios permitidos (CORS). SEM as variáveis configuradas no Render/Vercel, nada muda. /health continua aberto (é o que acorda o serviço).',
  ],
  '1.61.0': [
    'PLATAFORMA MAIS RÁPIDA (cache de leitura): as listas do armazenamento local (talhões, clientes, grades, importações…) agora são descomprimidas e interpretadas UMA vez e servidas de um cache em memória — antes, cada tela refazia esse trabalho pesado a cada leitura (40+ pontos do app). O cache é invalidado automaticamente em toda gravação e também quando OUTRA aba grava (evento storage), então /coleta e /painel abertos juntos continuam coerentes.',
  ],
  '1.60.0': [
    'APP DE CAMPO MAIS LEVE NA CAMINHADA: durante a medição por caminhada, o perímetro passou a ser somado de forma INCREMENTAL (só o novo trecho) e a área exibida ao vivo é recalculada a cada 10 pontos — antes, cada ponto do GPS reprocessava a caminhada inteira (ficava cada vez mais pesado e gastava mais bateria em áreas grandes). Os valores SALVOS não mudam: ao finalizar/salvar o cálculo completo roda como sempre.',
  ],
  '1.59.0': [
    'ARMAZENAMENTO CHEIO AGORA AVISA: se o cache local do navegador estourar a cota, o app mostra um alerta claro (1x por sessão) e dispara o evento inv:quota-erro — antes a gravação falhava em silêncio e os dados sumiam no recarregar. O espelho na nuvem continua sendo enviado mesmo com o cache cheio.',
    'CORREÇÃO no editor de Equações: valores com separador de milhar (ex.: R$ 1.234,56) eram lidos errado (viravam 1,234). Agora usa o mesmo leitor de números robusto da importação de laboratório.',
  ],
  '1.58.0': [
    'SINCRONIZAÇÃO COM O SUPABASE REESCRITA (segurança dos dados): cada gravação agora envia só o que MUDOU (diff por registro) em vez de reescrever a coleção inteira; os envios da mesma coleção entram numa FILA (nunca mais um envio antigo apaga registro recém-criado por um mais novo); e falha de envio deixa a coleção marcada como pendente com REENVIO automático ao voltar a internet + evento inv:sync para a interface sinalizar.',
  ],
  '1.57.0': [
    'CORREÇÃO CRÍTICA na importação de laboratório: em arquivos com VÁRIOS talhões (cada um numerando pontos 1..N), amostras de talhões diferentes com mesmo número/profundidade/campanha eram FUNDIDAS e uma delas sumia. A chave de identificação agora inclui o talhão — nada muda para arquivos de talhão único ou com protocolo do laboratório.',
    'Na prévia editável, correções e exclusões também passam a ser identificadas por talhão (não vazam mais entre talhões ao trocar o filtro).',
  ],
  '1.56.0': [
    'IMPORTAÇÃO DE LABORATÓRIO COM PRÉVIA EDITÁVEL E DETECÇÃO DE OUTLIERS: antes de importar (qualquer planilha/perfil), abre uma tabela com todas as amostras onde você confere, corrige valores célula a célula e pode excluir amostras. Nada é gravado até clicar em Importar.',
    'DESTAQUE DE POSSÍVEIS OUTLIERS por variável: VERMELHO = valor fora da faixa plausível (erro de unidade/digitação, ex.: pH 85); ÂMBAR = valor que destoa das demais amostras do lote (estatístico, regra do IQR/Tukey). O botão Importar mostra quantos ainda faltam revisar. Trava de segurança da entrada de dados.',
    'CHECAGEM DE PROFUNDIDADE (VIOLETA): para P, MO e V% — que devem cair da superfície para o fundo — a prévia compara as camadas do mesmo ponto e sinaliza quando o horizonte mais fundo (ex.: 20-40) tem valor MAIOR que a superfície (0-20), indício de troca de amostra ou erro de digitação.',
  ],
  '1.55.0': [
    'ORDEM CANÔNICA DAS EQUAÇÕES NA RECOMENDAÇÃO: ao montar e ao PROCESSAR uma recomendação, as equações saem sempre agrupadas na ordem Calcário → Gesso → Fosfatagem/P → KCL → outros — igual à numeração 01-19 / 20-29 / 30+ do app antigo, mas automático pelo campo GRUPO (não precisa mais numerar o nome). Vale também para recomendações já salvas (reordenam ao abrir/processar).',
    'AFINAR A ORDEM DENTRO DO GRUPO: a equação ganhou o campo "Ordem no grupo" (opcional). O grupo define o bloco; esse número posiciona a equação dentro do bloco (menor primeiro). Vazio = ordena por nome. A tela de Equações passou a exibir os grupos nessa mesma ordem canônica.',
  ],
  '1.54.0': [
    'FAZENDAS EM ORDEM ALFABÉTICA em todo o sistema (app de campo e plataforma): as listas de fazendas passam a vir sempre ordenadas por nome, igual já acontecia com os talhões.',
  ],
  '1.53.0': [
    'APP DE CAMPO — na medição, escolher um TALHÃO como referência agora segue o mesmo caminho do app: produtor › fazenda › talhão, um nível de cada vez (com voltar), em vez de mostrar tudo de uma vez.',
  ],
  '1.52.0': [
    'TALHÕES EM ORDEM ALFABÉTICA em todo o sistema (app de campo e plataforma): as listas de talhões passam a vir sempre ordenadas por nome.',
  ],
  '1.51.0': [
    'APP DE CAMPO — MEDIÇÃO POR PONTOS: além de Polígono (área) e Linha (distância), agora tem o modo "• Ponto(s)". Marque pontos tocando no mapa OU no seu GPS (botão +) — para registrar locais específicos (falha, obstáculo, ponto de amostra, referência, etc.). Salva como pontos, com filtro "Pontos" no repositório de Medições e nos downloads (SHP/KML/GeoJSON).',
  ],
  '1.50.0': [
    'APP DE CAMPO — na escolha da camada de referência (na medição), os talhões agora vêm ORGANIZADOS por produtor · fazenda, com um cabeçalho por fazenda, em vez de uma lista solta — bem mais fácil achar o talhão certo quando há muitos.',
  ],
  '1.49.0': [
    'LINK DO PRESTADOR DE SERVIÇO: no painel do talhão, o botão "Link do prestador (só o mapa)" gera um link para mandar por WhatsApp/mensagem. Quem recebe abre no celular e vê SÓ o polígono daquele talhão + o GPS dele para navegar até/dentro da área — sem login, sem menus, sem nenhum outro dado. Ideal para enviar a área a quem vai distribuir esterco, aplicar, roçar, etc.',
    'A geometria viaja DENTRO do próprio link (compactada) — nada é guardado em servidor e o prestador não acessa mais nada do sistema. A página é a rota pública /campo. (Áreas com contorno muito detalhado geram links longos; talhões normais ficam curtos.)',
  ],
  '1.48.0': [
    'APP DE CAMPO — CAMADA DE REFERÊNCIA NA MEDIÇÃO: durante a medição GPS, um novo botão (ícone de formas) deixa abrir no mapa, em LARANJA, um TALHÃO, uma MEDIÇÃO já salva ou um ARQUIVO (KML/SHP/GeoJSON, offline) só como guia — não entra na medição. Ex.: ver o limite do talhão enquanto mede por dentro, ou seguir um contorno recebido. Toque no botão para escolher/remover a referência.',
  ],
  '1.47.0': [
    'APP DE CAMPO — CABEÇALHO NO iPhone: a barra de status do iOS (relógio/bateria) não cobre mais os botões do topo. O estilo da barra passou a RESERVAR o espaço dela em vez de sobrepor o app. IMPORTANTE no iPhone: para valer, remova o ícone antigo da tela de início e adicione de novo (o iOS guarda essa configuração em cache).',
  ],
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
