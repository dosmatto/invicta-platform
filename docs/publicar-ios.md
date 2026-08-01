# App iOS (INVICTA Coleta) — testar e publicar

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

O mesmo comando sincroniza a versão a partir de `APP_VERSION`:

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

### 1. D-U-N-S Number (decidido: conta da EMPRESA)
Conta de organização exige D-U-N-S — **é o item de maior prazo, comece por ele**.

Busque antes de solicitar: **developer.apple.com/enroll/duns-lookup/**
(muitas empresas já têm um, criado por banco ou fornecedor, sem saber).

Dados: **WR CONSULTORIA AGRICOLA SS** · CNPJ 10.508.846/0001-90 ·
Avenida dos Pioneiros, 398 — Carambeí/PR — 84145-000

Gratuito; no Brasil leva de dias a semanas.

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
No Xcode: **Product → Archive** → **Distribute App** → **App Store Connect** →
**Upload**.

### 6. TestFlight (equivalente ao teste interno do Android)
- No App Store Connect, aba **TestFlight**
- **Testadores internos** (até 100, mesma conta): liberação imediata
- **Testadores externos** (até 10.000): passa por uma revisão simplificada (~1 dia)
- Cada operador instala o app **TestFlight** e entra pelo convite

### 7. Informações obrigatórias
- **Política de privacidade:** `https://invicta-platform.vercel.app/privacidade`
- **Privacy Nutrition Labels** — declare, igual ao Android:
  | Dado | Vinculado ao usuário | Uso |
  |---|---|---|
  | Localização precisa | Sim | Funcionalidade do app |
  | Fotos | Sim | Funcionalidade do app |
  | E-mail / Nome | Sim | Funcionalidade / Identificação |
- **Conta de teste** para o revisor da Apple (crie um usuário Operador na
  Central de Acessos e informe login e senha).

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
