# App iOS (INVICTA Coleta) — testar e publicar

## Situação em 10/09/2026

O projeto está **pronto para arquivar**. O que falta é conta, não código.

Verificado nesta máquina:

| Item | Estado |
|---|---|
| Compila em Release | ✅ `BUILD SUCCEEDED`, zero avisos |
| Bundle ID | ✅ `br.agr.invicta.coleta` nos três lugares |
| Versão | ✅ 3.0.0 · build 3.000.000 |
| Ícone 1024 sem alfa | ✅ corrigido (tinha transparência) |
| iPhone-only | ✅ `TARGETED_DEVICE_FAMILY = "1"` |
| Conformidade de exportação | ✅ declarada no `Info.plist` |
| Capturas 1290×2796 | ✅ `loja/screenshots-ios/` |
| Ficha da loja | ✅ `loja/ficha-app-store.md` |
| URL de suporte | ✅ `/suporte` criada — falta o deploy |
| D-U-N-S da empresa | ✅ **899714713** |
| Apple ID corporativo | ✅ `invicta@invicta.agr.br` (exigido: e-mail no domínio da empresa) |
| Área demo p/ o revisor | ✅ cadastrada e testada — `loja/demo-apple/LEIA-ME.md` |
| Razão social no rodapé do site | ✅ no ar em 10/09/2026 |
| **Apple Developer Program** | ⏳ **enviada 10/09/2026 · Enrollment ID `H67M73G9UH`** |

### A inscrição enviada — o que a Apple recebeu

| Campo | Valor |
|---|---|
| Enrollment ID | `H67M73G9UH` |
| Apple ID / Account Holder | `invicta@invicta.agr.br` (William Nolte) |
| Entity type | Company / Organization |
| Legal Entity Name | WR CONSULTORIA AGRICOLA SS |
| D-U-N-S | 899714713 |
| Endereço (veio da D&B, campo travado) | Av. DOS PIONEIROS 398, SALA 06 · CARAMBEI/PARANA · 84145-000 |
| Website | https://www.invicta.agr.br |
| Telefone | +55 42 99126-0122 |
| Poder de assinatura | "I am the owner/founder…" |

**O pagamento ainda NÃO foi feito.** A Apple verifica primeiro o poder de
assinatura e depois envia por e-mail as instruções para concluir — é aí que
entram os US$ 99. Espere também uma **ligação** para confirmar a existência da
empresa; o telefone informado é o público do site, que é o que eles cruzam.

> A "SALA 06" veio do registro da Dun & Bradstreet e não confere mais. Logradouro,
> número, cidade, estado e CEP batem, então não vale travar a inscrição por isso —
> a correção na D&B pode ser feita em paralelo, para as próximas verificações.

### Como sei que o programa não foi contratado

O único perfil de assinatura na máquina é um **Personal Team** (conta grátis):

```
Nome do time : William Nolte          ← time pessoal; uma conta de organização
Team ID      : UQT598R5J3                mostraria "WR CONSULTORIA AGRICOLA SS"
Validade     : 19/08/2026 → 26/08/2026 ← 7 dias, a marca da conta grátis
```

E o chaveiro só tem um certificado `Apple Development` — para enviar à loja é
preciso um `Apple Distribution`, que só existe com o programa pago.

**Nada disso se resolve por código.** O caminho está na seção
"Distribuir para os operadores" abaixo, e o item de maior prazo é o D-U-N-S.

---

## Bundle Identifier — resolvido

O identificador é **`br.agr.invicta.coleta`** em todos os lugares:
`capacitor.config.ts`, Android e Xcode.

> Histórico: até 31/07/2026 o oficial era `br.com.invictaap.coleta` e o Xcode
> usava `br.com.invictaap.coleta.wn` — o sufixo `.wn` existia porque a conta
> Apple grátis (Personal Team) recusa um identificador já registrado por outra
> conta. Ao migrar para `br.agr.invicta.coleta` (domínio novo, nunca usado),
> o conflito deixou de existir e a gambiarra do `.wn` saiu junto.

O `npm run ios:sync` **falha** se o Xcode e o Capacitor divergirem — a App
Store recusaria o envio, e o erro dela é obscuro.

## Versão — automática

O mesmo comando sincroniza a versão a partir de `APP_CAMPO_VERSION` (a do app de campo, não a da plataforma):

- `MARKETING_VERSION` = a versão (ex.: `2.12.3`) — é a que o usuário vê
- `CURRENT_PROJECT_VERSION` = `maior*10000 + menor*100 + correção` (ex.: `21203`)

O build usa **o mesmo número do `versionCode` do Android** de propósito: os dois
apps saem do mesmo código, e o número igual dos dois lados deixa óbvio qual
build corresponde a qual. Não edite esses campos no Xcode — rode
`npm run ios:sync` e eles se ajustam.

---

## Testar no seu iPhone (conta Apple grátis)

Já está configurado. O ciclo é:

```bash
cd ~/dev/invicta-platform && npx cap sync ios && npm run ios:open
```

No Xcode: escolha o iPhone no topo → **▶ Play**.

No iPhone, na primeira vez: **Ajustes → Geral → VPN e Gerenciamento de
Dispositivo** → seu Apple ID → **Confiar**.

> **O app expira em 7 dias** com conta grátis. Depois disso ele para de abrir e
> é preciso reinstalar pelo Xcode. Para uso de verdade pelos operadores, veja
> abaixo.

---

## Distribuir para os operadores (Apple Developer Program)

Diferente do Android, **não existe** caminho gratuito para instalar em vários
aparelhos. É preciso:

### 0. A conta Apple da inscrição — decidido em 10/09/2026

A inscrição é feita com **`invicta@invicta.agr.br`**, não com o `dosmatto@gmail.com`.

Não é preferência: a tela "To enroll, you will need" exige **"A Work Email — your
email address with your organization's domain name"**. Um Gmail seria recusado.
O Apple ID corporativo foi criado no dia, com o **nome legal da pessoa que
assina** (William Nolte) e não o nome da empresa — nome de empresa nos campos de
nome é causa clássica de atraso na aprovação.

> **Sobre o Personal Team.** Existe um time pessoal antigo sob o
> `dosmatto@gmail.com` (UQT598R5J3) que provavelmente registrou o App ID
> `br.agr.invicta.coleta` ao instalar o app pelo Xcode. A inscrição da
> organização cria um time **novo**, separado — então o identificador pode
> aparecer como "já em uso" na hora de criar o App ID, em qualquer cenário de
> Apple ID escolhido. Não dá para verificar antes: a lista de Identifiers é
> bloqueada para conta gratuita ("Access Unavailable"). Se acontecer, é chamado
> no suporte da Apple pedindo a liberação do identificador — caso de rotina,
> resolvido provando que o mesmo dono controla as duas contas.

### 1. D-U-N-S Number — ✅ RESOLVIDO (10/09/2026)

```
D-U-N-S       899714713
Razão social  WR CONSULTORIA AGRICOLA SS
CNPJ          10.508.846/0001-90
Endereço      Avenida dos Pioneiros, 398 — Carambeí/PR — 84145-000
```

Confirmado por e-mail da Apple Developer Relations. Era o item de maior prazo;
com ele em mãos, a inscrição pode ser feita hoje.

> A Apple avisa no mesmo e-mail: quem preencher precisa ter **poder legal para
> obrigar a empresa** aos contratos do Developer Program (sócio-administrador no
> contrato social). Se o cadastro for feito por quem não tem, a inscrição trava
> na verificação.

### 1.B O site da empresa — exigência que quase passou batido

A mesma tela exige **"A Website"**: o site da organização precisa estar público e
o **domínio precisa estar associado à organização**.

`invicta.agr.br` existe e é institucional. O problema é que o rodapé se
identifica só como *"© 2026 INVICTA CONSULTORIA EM AGRONEGÓCIO"* — nome fantasia
— e não cita a razão social nem o CNPJ. A Apple diz explicitamente que **não
aceita DBAs, nomes fantasia ou marcas**: o que ela vai verificar é
"WR CONSULTORIA AGRICOLA SS".

**Resolvido no mesmo dia.** O rodapé passou a trazer:

```
© 2026 INVICTA CONSULTORIA EM AGRONEGÓCIO. TODOS OS DIREITOS RESERVADOS.
WR CONSULTORIA AGRÍCOLA SS · CNPJ 10.508.846/0001-90
```

Com isso, os três pontos que a Apple cruza ficam consistentes: **razão social**
(bate com o D-U-N-S), **domínio** (o site declara a empresa) e **endereço**
(Avenida dos Pioneiros 398, Carambeí 84145000 — o mesmo do registro da D&B).

> Se o site for redesenhado um dia, essa linha do rodapé precisa sobreviver. Sem
> ela, a próxima verificação da Apple volta a não conseguir ligar
> `invicta.agr.br` a "WR CONSULTORIA AGRICOLA SS".

### 2. Assinar o Apple Developer Program — US$ 99/ano
- **developer.apple.com/programs** → Enroll → conta de organização
- Aprovação costuma levar de 1 a 3 dias **depois** do D-U-N-S sair
- A Apple liga para confirmar a existência da empresa: o telefone precisa
  bater com o cadastro público do CNPJ

### 3. Bundle Identifier
Nada a fazer — já é `br.agr.invicta.coleta` e o `ios:sync` protege contra
divergência.

### 4. Criar o app no App Store Connect
- **appstoreconnect.apple.com** → Meus Apps → **+**
- Plataforma iOS, nome **INVICTA Coleta**, idioma Português (Brasil)
- Bundle ID: `br.agr.invicta.coleta` · SKU: `invicta-coleta`

### 5. Enviar a build

Sempre nesta ordem — o `ios:sync` é o que sincroniza versão e barra os erros que
a Apple só reporta *depois* do upload:

```bash
npm run ios:sync && npm run ios:open
```

No Xcode:

1. No seletor de destino no topo, escolha **Any iOS Device (arm64)** — com um
   simulador escolhido o menu **Archive** fica cinza, e não é óbvio por quê.
2. **Product → Archive**
3. Na janela do Organizer: **Distribute App → App Store Connect → Upload**
4. Deixe marcadas as opções de assinatura automática e siga até o fim

A build aparece no App Store Connect em 5 a 15 minutos. Se algo estiver errado
(ícone, ID, versão repetida), a recusa chega por e-mail nesse intervalo —
por isso o `ios:sync` confere antes.

### 6. TestFlight (equivalente ao teste interno do Android)
- No App Store Connect, aba **TestFlight**
- **Testadores internos** (até 100, mesma conta): liberação imediata
- **Testadores externos** (até 10.000): passa por uma revisão simplificada (~1 dia)
- Cada operador instala o app **TestFlight** e entra pelo convite

### 7. Informações obrigatórias

Todos os textos, tabelas e respostas estão prontos em
**`loja/ficha-app-store.md`** — nome, subtítulo, palavras-chave, descrição,
Privacy Nutrition Labels, classificação etária e as notas para a revisão.

Dois pontos merecem atenção antes de enviar:

- **URL de suporte.** A Apple exige uma *página* (recusa `mailto:`) e o projeto
  ainda não tem uma. Falta definir o e-mail de contato — o mesmo que está em
  branco na ficha do Google.
- **O raio de 15 metros.** O botão de registrar coleta fica desativado fora do
  raio do ponto, e o revisor testa o app na Califórnia: ele não consegue
  exercitar a função principal e reprova. A saída é cadastrar, na conta de
  demonstração, uma fazenda com pontos em Apple Park (37.3349, -122.0090) e
  anexar um vídeo do app em campo. A ficha traz o texto pronto.

---

## Comparativo rápido

| | Android | iOS |
|---|---|---|
| Custo | US$ 25 (uma vez) | US$ 99 **por ano** |
| Testar no próprio aparelho | grátis, sem prazo | grátis, **expira em 7 dias** |
| Distribuir para a equipe | Teste interno | TestFlight (exige o programa pago) |
| Revisão | horas | ~1 dia (TestFlight externo) |

> Se o objetivo for só a equipe de campo, o Android sai muito mais barato. No
> iPhone, não há como fugir dos US$ 99/ano para uso contínuo.
