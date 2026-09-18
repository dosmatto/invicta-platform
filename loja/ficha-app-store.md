# Ficha da App Store — INVICTA Coleta

Textos e respostas prontos para copiar no App Store Connect. Cada bloco diz onde
ele entra. Os limites de caracteres são os que a loja impõe.

## Estado no App Store Connect (18/09/2026)

```
Apple ID do app   6813176446
Bundle ID         br.agr.invicta.coleta
Time              ANQMNT4RTB (WR CONSULTORIA AGRICOLA SS)
Versão            3.2.0 · Preparar para envio (era 3.1.0; o app de campo subiu em c791467)
```

O "Adicionar para revisão" em 18/09 recusou **só** por falta de compilação —
todo o resto passou na validação da Apple.

| Já preenchido por lá | Falta |
|---|---|
| Texto promocional, descrição, palavras-chave | **Compilação** (Archive + upload pelo Xcode) |
| URL de suporte e de marketing | **Remarcar o vínculo da fazenda demo** (antes do envio) |
| Versão (3.1.0) e Copyright | Selecionar a build e **Adicionar para revisão** |
| **4 capturas de tela** (6,9 pol., sem alfa) | |
| Informações de revisão (login + senha da conta revisão) | |
| Privacidade do app (publicada) | |
| Subtítulo, categorias Negócios / Utilidades | |
| Classificação etária **4+** (tudo "não/nenhum") | |
| Direitos de conteúdo: **sim**, usa conteúdo de terceiros com direitos (imagens de satélite / NDVI) | |
| Preço **gratuito**, disponível **só no Brasil** | |

> **Por que só Brasil:** fora da UE não se aplica o Regulamento dos Serviços
> Digitais (DSA), que pediria dados de "comerciante" publicados. Ampliar países
> depois é um clique em Preços e disponibilidade.
>
> **Sem pendência de pagamento:** app gratuito não exige o contrato de apps
> pagos nem dados bancários/fiscais. A assinatura do programa está ativa até
> 15/09/2027.

> **Armadilha das capturas — canal alfa.** Os prints do iPhone saíram como PNG
> RGBA e a Apple os aceitou no upload, mas depois marcou os quatro com erro
> ("As imagens não podem incluir canais alfa ou transparências") e o envio
> travava com "ainda há carregamentos de capturas em andamento". Foram
> achatados para RGB (sharp `flatten().removeAlpha()`) e reenviados. Conferir
> com `sips -g hasAlpha arquivo.png` antes de subir.

O equivalente do Google está em `ficha-play-store.md` — os textos são parecidos
de propósito, mas **não são intercambiáveis**: a Apple tem campos que o Google
não tem (subtítulo, palavras-chave, texto promocional) e recusa capturas de tela
em qualquer tamanho fora da tabela dela.

---

## Informações do app

| Campo | Valor |
|---|---|
| **Nome** (30) | `INVICTA Coleta` |
| **Subtítulo** (30) | `Amostragem de solo com GPS` |
| **Bundle ID** (imutável) | `br.agr.invicta.coleta` |
| **SKU** | `invicta-coleta` |
| **Idioma principal** | Português (Brasil) |
| **Categoria principal** | Negócios |
| **Categoria secundária** | Utilitários |
| **Direitos autorais** | `2026 WR Consultoria Agrícola SS` |
| **Dispositivos** | iPhone apenas (`TARGETED_DEVICE_FAMILY = "1"`) |
| **iOS mínimo** | 15.0 |

### URLs

| Campo | Valor | Situação |
|---|---|---|
| Política de privacidade **(obrigatório)** | `https://invicta-platform.vercel.app/privacidade` | pronta |
| URL de suporte **(obrigatório)** | `https://invicta-platform.vercel.app/suporte` | pronta |
| URL de marketing (opcional) | `https://invicta-platform.vercel.app` | pronta |

> A página de suporte (`src/app/suporte/page.tsx`) foi criada em 10/09/2026 —
> a Apple exige uma *página* e recusa `mailto:`. Contato:
> `invicta@invicta.agr.br` · +55 (42) 99126-0122. Além dos canais, ela responde
> as três dúvidas que o operador tem em campo (não consigo entrar, o botão de
> coletar não habilita, trabalhar sem sinal) — o revisor da loja abre esta
> página para confirmar que o atendimento existe de verdade.
>
> **Só entra no ar depois do deploy** (push para `master` → Vercel). Confirme que
> `https://invicta-platform.vercel.app/suporte` abre antes de informar a URL no
> App Store Connect: link de suporte quebrado é recusa na hora.

---

## Palavras-chave (100 caracteres, separadas por vírgula, sem espaços)

```
agricultura,agronomia,lavoura,talhao,fazenda,offline,amostra,fertilidade,NDVI,compactacao,campo
```

> Campo que não existe na Play Store e que pesa muito na busca da App Store.
> Palavras já presentes no nome e no subtítulo (INVICTA, Coleta, amostragem,
> solo, GPS) foram deixadas de fora **de propósito**: a Apple já indexa aqueles
> campos, e repetir aqui gasta caracteres à toa.

## Texto promocional (máx. 170)

Aparece acima da descrição e **pode ser trocado sem enviar uma build nova** — é
o lugar certo para avisos de safra ou novidades.

```
Leve o plano de amostragem para o campo: navegação por GPS até cada ponto, fotos
ligadas à amostra e trabalho offline onde não há sinal de celular.
```

## Descrição (máx. 4000)

```
O INVICTA Coleta é o aplicativo de campo da Plataforma INVICTA. Ele leva o
plano de amostragem de solo para o celular do operador e guia a coleta ponto a
ponto, mesmo onde não há sinal de celular.

COMO FUNCIONA

Escolha o produtor, a fazenda, o talhão e o ciclo. O aplicativo abre o mapa da
área com todos os pontos de amostragem já definidos no escritório e mostra onde
você está em relação a eles.

NAVEGAÇÃO ATÉ O PONTO
A seta e a distância em metros conduzem você até cada ponto. A coleta só é
liberada dentro do raio permitido, o que evita amostra registrada no lugar
errado.

FUNCIONA SEM INTERNET
As imagens de satélite da área podem ser baixadas antes de sair. Em campo, tudo
é gravado no próprio aparelho: quando a conexão volta, as coletas, fotos e
medições sobem sozinhas para a plataforma.

FOTOS DO PONTO
Registre a amostra, a paisagem ou um problema encontrado. As fotos ficam
ligadas ao ponto e ao talhão, e são comprimidas antes de subir para economizar
dados.

ALÉM DA AMOSTRAGEM
- Medição de área e de distância direto no mapa
- Registro de manchas e de pontos de compactação
- Acompanhamento do que já foi coletado em cada grade

PARA QUEM É
Operadores de campo, agrônomos e equipes de amostragem que já usam a Plataforma
INVICTA. É necessário ter uma conta liberada pela sua empresa: o aplicativo não
funciona sem cadastro.

PERMISSÕES QUE USAMOS
- Localização precisa: para mostrar sua posição e liberar a coleta dentro do
  raio do ponto. Sem ela o aplicativo não cumpre sua função.
- Câmera e fotos: apenas quando você escolhe anexar uma imagem ao ponto.

Suas informações não são vendidas nem compartilhadas com terceiros. Detalhes em
https://invicta-platform.vercel.app/privacidade
```

## Novidades desta versão (máx. 4000)

```
Primeira versão publicada na App Store.

- Coleta de solo guiada por GPS, ponto a ponto
- Funciona sem internet e sincroniza quando o sinal volta
- Fotos da amostra ligadas ao ponto
- Medição de área, manchas e compactação
```

---

## Capturas de tela

✅ **Enviadas em 17/09/2026**, nesta ordem (`loja/screenshots-ios/`):

| # | Arquivo | Tela |
|---|---|---|
| 1 | `01-grade-de-coleta.png` | Grade com os pontos numerados, 22/22 coletados |
| 2 | `02-ndvi-mancha.png` | NDVI com a mancha colorida e distância até ela |
| 3 | `03-modulos-de-campo.png` | Os quatro módulos |
| 4 | `04-medicao-gps.png` | Medição por GPS sobre o satélite |

São prints **nativos de iPhone**, 1290 × 2796, sem recorte nem montagem.
Substituíram as versões anteriores, que vinham das capturas do Google (recortadas
para o limite de 2:1 de lá) e precisavam ter a altura completada artificialmente.
O `scripts/gerar-capturas-app-store.mjs` continua existindo para o caso de
alguém voltar a mandar capturas recortadas — mas o certo é printar no iPhone sem
recortar, que a tela já sai no tamanho exato.

### A armadilha do slot

O App Store Connect abre o slot de **6,5 pol.** por padrão, que aceita
1242 × 2688 / 1284 × 2778 e **recusa 1290 × 2796**. O slot certo é o de
**6,9 pol.**, em *Visualizar todos os tamanhos no Gerenciador de mídia*. Depois
de preenchido, o de 6,5" passa a exibir "Usando Tela de 6,9 pol." — a Apple
deriva os menores sozinha, e não há conjunto de iPad porque o app é iPhone-only.

**Suba uma de cada vez.** Mandando as quatro juntas, a ordem chega embaralhada,
e reordenar depois só funciona arrastando. As três primeiras são as que aparecem
na busca.

## Ícone

`ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` — 1024×1024,
**sem canal alfa**. O iOS moderno usa um arquivo só e o Xcode deriva o resto.

> O ícone tinha transparência até agora. A App Store aceita o upload e manda a
> recusa por e-mail minutos depois ("Invalid large app icon"), obrigando a
> refazer o Archive. Corrigido, e o `npm run ios:sync` agora barra a regressão.

---

## Privacidade (Privacy Nutrition Labels)

Declare em App Store Connect → Privacidade do app. **Nada é usado para
rastreamento** — por isso o app não precisa pedir permissão de rastreamento
(ATT) nem declarar `NSUserTrackingUsageDescription`.

| Categoria | Dado | Finalidade | Vinculado ao usuário | Rastreamento |
|---|---|---|---|---|
| Localização | Localização precisa | Funcionalidade do app | Sim | Não |
| Conteúdo do usuário | Fotos ou vídeos | Funcionalidade do app | Sim | Não |
| Informações de contato | Nome | Funcionalidade do app | Sim | Não |
| Informações de contato | Endereço de e-mail | Funcionalidade do app | Sim | Não |
| Informações de contato | Número de telefone | Funcionalidade do app | Sim | Não |
| Identificadores | ID de usuário | Funcionalidade do app | Sim | Não |

### Exclusão de conta

A regra 5.1.1(v) exige exclusão **dentro do app** apenas para apps que permitem
**criar** conta. O INVICTA Coleta não permite: a tela de login só tem e-mail e
senha, e as contas são liberadas pela empresa do usuário. Ainda assim, deixe o
caminho de exclusão explícito nas notas da revisão (o revisor costuma perguntar).

### Conformidade de exportação (criptografia)

Já respondido no código: `ITSAppUsesNonExemptEncryption = false` no `Info.plist`.
O app só fala HTTPS, que é o caso isento. Sem isso, toda build fica travada em
"Missing Compliance" no TestFlight até alguém responder pelo site.

---

## Classificação etária

Ferramenta profissional, sem conteúdo sensível, sem interação entre usuários,
sem compras, sem acesso irrestrito à web. Resultado esperado: **4+**.

---

## Notas para a revisão — leia antes de enviar

### Conta de demonstração (obrigatória)

O app não abre sem conta. Já existe e está pronta:

```
Usuário: revisao.lojas@invicta.agr.br
Senha:   (definir na Central de Acessos e preencher aqui)
```

Categoria Prestador, papel Operador, vinculada a dois produtores: `WILLIAM
NOLTE` (dados de aparência real) e `ZZ DEMONSTRACAO APPLE` (a área de Cupertino
onde o revisor consegue coletar). Sem preencher "Login obrigatório" com ela, a
revisão é reprovada por "não conseguimos entrar".

**Testada de verdade** (10/09/2026): login feito com essa conta no `/coleta`, a
lista mostrou só os dois produtores vinculados, e o caminho até a grade de
Cupertino abriu com os 508 pontos. Detalhes em `loja/demo-apple/LEIA-ME.md`.

> ⚠️ **ANTES DE ENVIAR: remarque `ZZ DEMONSTRACAO APPLE` nos vínculos dessa
> conta.** Ele foi removido em 10/09/2026 para não alterar o que o revisor do
> **Google** enxerga durante a análise em andamento. Enquanto estiver removido,
> o revisor da Apple não vê a área de Cupertino — e sem ela ele não consegue
> registrar coleta nenhuma. Biblioteca → Acessos → Revisao Loja → Vínculos.

### O problema do raio de 15 metros

**Este é o risco real de reprovação, e ele não existe no Android** — o Google
aprovou sem exercitar a coleta.

O botão de registrar fica desativado fora do raio do ponto em **dois dos quatro
módulos**:

| Módulo | Trava | Onde |
|---|---|---|
| Amostragem de Solo | `disabled={!dentroRaio \|\| !gpsOk}` — raio configurável, 15 m por padrão | `src/app/coleta/page.tsx:1022` |
| Compactação | `disabled={!dentroRaio}` — 15 m fixo | `CompactacaoScreen.tsx:213` |
| Medição | livre, funciona em qualquer lugar | — |
| NDVI / Mancha | livre (o raio de 12 m ali é só o círculo no mapa) | — |

O revisor da Apple testa o app **na Califórnia**, a 10 mil km de Carambeí. Ele
consegue exercitar Medição e Mancha, mas a Amostragem de Solo — que é o nome do
app e o primeiro módulo da tela — fica inerte. O risco é a recusa "we were
unable to review the core functionality".

Faça as duas coisas:

1. **A fazenda de demonstração no Apple Park** — já gerada em
   `loja/demo-apple/` (talhão de 45,5 ha, 508 pontos em grade de 30 m, centrada
   em 37.33464, -122.00901). O passo a passo do cadastro e as brechas de
   visibilidade estão em `loja/demo-apple/LEIA-ME.md`. É um conjunto de dados de
   demonstração, prática normal e aceita.
2. **Um vídeo do app em campo**, anexado em "Informações para a revisão". A
   Apple aceita vídeo como prova de funcionalidade que depende de contexto
   físico.

E peça ao revisor, na nota, que **suba o raio para 50 m em Configurações**: ele
vai testar dentro de um prédio, onde o iPhone se posiciona por Wi-Fi e erra de
20 a 50 m. Somado aos 21 m do pior caso da grade, o raio padrão de 15 m não
fecha. O ajuste é um controle de usuário que o app já oferece (5 a 50 m).

### Texto sugerido para "Notas"

```
O INVICTA Coleta é a ferramenta de campo de uma plataforma de agricultura de
precisão usada por equipes de amostragem de solo no Brasil. As contas são
criadas pela empresa contratante; o app não oferece cadastro.

CONTA DE TESTE
Usuário: revisao.lojas@invicta.agr.br
Senha: (preencher)

COMO TESTAR A FUNÇÃO PRINCIPAL
A coleta só é liberada quando o operador está fisicamente dentro do raio do
ponto de amostragem — é o que impede uma amostra de ser registrada no lugar
errado. Para que vocês possam testar isso sem sair do escritório, a conta acima
tem uma fazenda de demonstração com 508 pontos cobrindo o Apple Park
(37.33464, -122.00901).

Passo a passo:
1. Entre com a conta acima.
2. Toque na engrenagem (Configurações) e ajuste "Raio permitido para coletar"
   para 50 m. Isso é necessário porque em ambiente interno o iPhone se posiciona
   por Wi-Fi, com erro de algumas dezenas de metros. Em campo aberto o padrão de
   15 m é suficiente.
3. Abra "Amostragem de Solo" e escolha o produtor ZZ DEMONSTRACAO APPLE →
   fazenda DEMO CUPERTINO → talhão DEMO 01.
4. O mapa mostra sua posição entre os pontos. Toque no ponto mais próximo: o
   botão "Iniciar coleta" fica verde e o registro é liberado.

Também anexamos um vídeo do app em uso em uma lavoura real.

PERMISSÕES
- Localização (em uso): posiciona o operador no mapa e libera a coleta dentro do
  raio do ponto. Sem ela o app não cumpre sua função.
- Câmera e fotos: só quando o usuário escolhe anexar uma imagem ao ponto.

EXCLUSÃO DE DADOS
O app não permite criar conta, então não há exclusão dentro dele. O usuário pede
a exclusão à empresa que o cadastrou ou pelo e-mail em
https://invicta-platform.vercel.app/privacidade
```

---

## Onde publicar

| Trilha | Para quem | Revisão | Serve para |
|---|---|---|---|
| **TestFlight interno** | até 100 pessoas da própria conta | nenhuma | equipe de casa, na hora |
| **TestFlight externo** | até 10.000 por convite/link | leve, ~1 dia | **operadores em campo** |
| **App Store** | qualquer pessoa | completa, dias | vitrine pública |

> Se o objetivo é só colocar o app na mão dos operadores, **TestFlight externo
> resolve** e evita a revisão completa — inclusive o problema do raio acima.
> A App Store pública só vale a pena se o app for virar produto vendido a
> terceiros. Vale decidir isso antes de preencher a ficha inteira.

Passo a passo do envio: `docs/publicar-ios.md`.
