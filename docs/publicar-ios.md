# App iOS (INVICTA Coleta) — testar e publicar

## ⚠️ Atenção ao Bundle Identifier

| Onde | Valor | Para quê |
|---|---|---|
| `capacitor.config.ts` e Android | `br.com.invictaap.coleta` | **oficial** |
| Xcode (hoje) | `br.com.invictaap.coleta.wn` | **só teste** com conta Apple grátis |

O sufixo `.wn` foi necessário porque a conta grátis (Personal Team) recusa um
identificador já usado por outra conta. **Na hora de publicar na App Store, o
identificador precisa voltar para `br.com.invictaap.coleta`**, para casar com o
Android e com a configuração do Capacitor.

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

### 1. Assinar o Apple Developer Program — US$ 99/ano
- **developer.apple.com/programs** → Enroll
- Pessoa jurídica exige **D-U-N-S Number** (gratuito, mas leva de dias a semanas
  para sair). Pessoa física é mais rápido, porém o app aparece no seu nome.
- A aprovação costuma levar de 1 a 3 dias.

### 2. Voltar o Bundle Identifier ao oficial
No Xcode → **Signing & Capabilities** → Bundle Identifier:
`br.com.invictaap.coleta`

### 3. Criar o app no App Store Connect
- **appstoreconnect.apple.com** → Meus Apps → **+**
- Plataforma iOS, nome **INVICTA Coleta**, idioma Português (Brasil)
- Bundle ID: o oficial · SKU: `invicta-coleta`

### 4. Enviar a build
No Xcode: **Product → Archive** → **Distribute App** → **App Store Connect** →
**Upload**.

### 5. TestFlight (equivalente ao teste interno do Android)
- No App Store Connect, aba **TestFlight**
- **Testadores internos** (até 100, mesma conta): liberação imediata
- **Testadores externos** (até 10.000): passa por uma revisão simplificada (~1 dia)
- Cada operador instala o app **TestFlight** e entra pelo convite

### 6. Informações obrigatórias
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
