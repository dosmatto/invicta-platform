# Publicar o app INVICTA Coleta no Google Play

Guia do caminho escolhido: **Teste interno** (equipe e clientes conhecidos, até
100 pessoas, sem revisão demorada e sem ficha de loja completa).

App: `br.com.invictaap.coleta` · Nome: **INVICTA Coleta**

---

## PASSO 1 — Criar a chave de assinatura (uma única vez)

> ⚠️ **O arquivo e a senha desta etapa são insubstituíveis.** Se você perder,
> **não existe** forma de atualizar o app publicado — seria preciso publicar
> outro app, do zero, e pedir para todo mundo reinstalar. Guarde o arquivo
> `.jks` e a senha em pelo menos dois lugares (gerenciador de senhas + backup).

No Terminal:

```bash
cd ~/dev/invicta-platform/android && "/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/keytool" -genkeypair -v -keystore invicta-coleta.jks -alias invicta -keyalg RSA -keysize 2048 -validity 10000
```

Ele vai perguntar, em ordem:

| Pergunta | O que responder |
|---|---|
| *Enter keystore password* | **Crie uma senha forte** (anote!) |
| *Re-enter new password* | a mesma |
| *What is your first and last name?* | `INVICTA Consultoria em Agronegocio` |
| *organizational unit* | `TI` |
| *organization* | `INVICTA` |
| *City or Locality* | sua cidade |
| *State or Province* | `PR` |
| *country code* | `BR` |
| *Is CN=... correct?* | digite `sim` (ou `yes`) |

> Não use acento nessas respostas — o keytool não lida bem com eles.

### Guardar a senha para o build

Crie o arquivo `android/keystore.properties` (ele **não** vai para o Git):

```bash
cd ~/dev/invicta-platform/android && cat > keystore.properties <<'FIM'
storeFile=invicta-coleta.jks
storePassword=SUA_SENHA_AQUI
keyAlias=invicta
keyPassword=SUA_SENHA_AQUI
FIM
```

Troque `SUA_SENHA_AQUI` (nas duas linhas) pela senha que você criou.

---

## PASSO 2 — Gerar o arquivo do app (.aab)

```bash
cd ~/dev/invicta-platform && npm run android:release
```

O arquivo sai em:
`android/app/build/outputs/bundle/release/app-release.aab`

> `.aab` (Android App Bundle) é o formato que a loja exige hoje — o Google gera
> a partir dele o APK otimizado para cada aparelho.

---

## PASSO 3 — Criar a conta no Google Play Console

1. Acesse **play.google.com/console**
2. Entre com uma conta Google **da empresa** (não use uma pessoal que possa se perder)
3. Escolha o tipo **Organização** (ou Pessoal, se for CNPJ individual)
4. Pague a taxa de **US$ 25** — pagamento **único e vitalício**
5. A verificação da conta pode levar de algumas horas a 2 dias

---

## PASSO 4 — Criar o app no Console

**Criar app** → preencha:
- Nome: `INVICTA Coleta`
- Idioma padrão: Português (Brasil)
- Tipo: **App**
- Gratuito ou pago: **Gratuito**
- Aceite as declarações

---

## PASSO 5 — Preencher o que o Google exige

No menu lateral, em **Política e programas → Conteúdo do app**:

### 5.1 Política de privacidade
Cole a URL:
```
https://invicta-platform.vercel.app/privacidade
```

### 5.2 Acesso ao app
Marque: **"Todas as funcionalidades exigem acesso especial"** e informe um
**login e senha de teste** para o revisor do Google (crie um usuário só para
isso na Central de Acessos, com papel de Operador).

### 5.3 Anúncios
**Não**, o app não tem anúncios.

### 5.4 Classificação de conteúdo
Responda o questionário — é um app de ferramenta/produtividade, sem conteúdo
sensível. Sai como **Livre**.

### 5.5 Público-alvo
Faixa etária: **18+** (ferramenta profissional). Não é voltado a crianças.

### 5.6 Segurança dos dados (o mais importante)
Declare exatamente o que o app coleta:

| Dado | Coletado? | Compartilhado? | Finalidade | Obrigatório? |
|---|---|---|---|---|
| **Localização precisa** | Sim | Não | Funcionalidade do app | Sim |
| **Fotos** | Sim | Não | Funcionalidade do app | Não |
| **E-mail** | Sim | Não | Gerenciamento de conta | Sim |
| **Nome** | Sim | Não | Gerenciamento de conta | Sim |
| **Telefone** | Sim | Não | Gerenciamento de conta | Não |

Marque também:
- Dados **criptografados em trânsito**: **Sim**
- Usuário **pode pedir exclusão** dos dados: **Sim** (a política explica como)

---

## PASSO 6 — Enviar para o Teste interno

1. Menu lateral: **Teste → Teste interno**
2. **Criar nova versão**
3. Faça upload do `app-release.aab`
4. Em **Notas da versão**, escreva algo como:
   `Primeira versão: coleta de solo em campo com GPS, funciona offline.`
5. **Avançar** → **Salvar** → **Enviar para revisão**

### Adicionar quem vai usar
1. Ainda em **Teste interno**, aba **Testadores**
2. **Criar lista de e-mails** → adicione os e-mails **Google (Gmail)** dos operadores
3. Copie o **link de participação** e mande para eles

> Cada pessoa precisa abrir o link, aceitar participar do teste e então instalar
> pela Play Store normalmente. A revisão do teste interno costuma sair em
> **poucas horas** (bem mais rápido que a produção).

---

## Atualizar o app depois

Toda vez que quiser mandar uma versão nova:

1. Suba o número da versão em `android/app/build.gradle`:
   ```
   versionCode 2      // sempre +1, nunca repete
   versionName "1.1"  // o que aparece para o usuário
   ```
2. `npm run android:release`
3. No Console: **Teste interno → Criar nova versão** → upload do novo `.aab`

---

## Se um dia quiser abrir para o público

Basta ir em **Produção** e repetir o envio, mas aí o Google exige a ficha
completa: descrição curta e longa, **capturas de tela** (mínimo 2, do celular),
**ícone 512×512** e uma **imagem de destaque 1024×500**. A revisão também é mais
rigorosa e demora mais.

---

## Resumo do que é seu para guardar

| Item | Onde | Se perder |
|---|---|---|
| `android/invicta-coleta.jks` | seu Mac + backup | **não dá para atualizar o app** |
| senha do keystore | gerenciador de senhas | idem |
| conta do Play Console | e-mail da empresa | recuperável pelo Google |
