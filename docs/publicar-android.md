# Publicar o app INVICTA Coleta no Google Play

App: `br.agr.invicta.coleta` · Nome: **INVICTA Coleta**

Guia para publicar em **Produção** (qualquer pessoa acha e baixa na loja).
Os textos e as respostas dos formulários da loja estão prontos em
[`loja/ficha-play-store.md`](../loja/ficha-play-store.md).

---

## Antes de tudo: o OneDrive e o Gradle

O repositório mora dentro do OneDrive, e **o Gradle não compila a partir de
lá**. O Android Gradle Plugin copia recursos com
`Files.copy(..., COPY_ATTRIBUTES)`; para qualquer arquivo cuja **origem** esteja
em `~/Library/CloudStorage/`, essa chamada volta com `Operation not permitted` —
o provedor de arquivos da nuvem não entrega os atributos estendidos que o Java
tenta copiar. O build morre em `:capacitor-android:packageDebugResources` com
uma mensagem que não explica nada.

Não há flag do Gradle que contorne, e mudar a pasta de saída não adianta: o
problema é o lado de **origem**.

**Como está resolvido hoje:** `npm run android:release` espelha o projeto
Android para `~/Library/Caches/invicta-android-build`, compila lá e traz o
`.aab` de volta (`scripts/empacotar-android.mjs`). Você não precisa fazer nada.

> **Atenção:** isso vale para o comando `npm run android:release`. Compilar pelo
> botão ▶️ do **Android Studio** com o projeto aberto na pasta do OneDrive
> continua falhando — é a mesma limitação. Use o comando.

Se um dia quiser simplificar de vez, mova o repositório para fora da nuvem
(`~/dev/invicta-platform`) e reinstale as dependências (`npm ci`): aí o Gradle
roda direto, o espelho fica desnecessário e somem também o `EPERM` do `.next` e
a lentidão do `npm install`. O código continua versionado no Git e publicado
pela Vercel — o backup de verdade é o repositório remoto.

---

## PASSO 1 — Criar a chave de assinatura (uma única vez na vida)

> ⚠️ **O arquivo e a senha são insubstituíveis.** Sem eles não existe forma de
> atualizar o app publicado — seria preciso publicar outro app, do zero, e pedir
> a todos que reinstalassem.

```bash
bash scripts/criar-chave-android.sh
```

O script pede a senha sem exibi-la na tela, gera `android/invicta-coleta.jks` e
escreve `android/keystore.properties` (os dois ficam fora do Git). No fim ele
mostra a impressão digital SHA-256 da chave — guarde junto com o backup.

**Faça o backup do `.jks` e da senha antes de seguir.** Gerenciador de senhas da
empresa + uma cópia do arquivo em outro lugar.

---

## PASSO 2 — Gerar o pacote da loja (.aab)

```bash
npm run android:release
```

O pacote sai em `loja/INVICTA-Coleta-<versão>.aab`.

O comando faz, em ordem: build estático do app → `cap sync` → conferências
(`scripts/preflight-android.mjs`) → Gradle → cópia do pacote para `loja/`.

As conferências param o processo, com instruções, se faltar a chave de
assinatura ou o SDK do Android — em vez de deixar sair um `.aab` sem assinatura
que só seria recusado lá na loja.

**Numeração automática.** Sai de **`APP_CAMPO_VERSION`** (`src/constants/version.ts`)
— não da `APP_VERSION`, que é a da plataforma web. `versionName` é a versão como
ela é (`3.0.0`) e `versionCode = maior × 1.000.000 + menor × 1.000 + correção`
(`3000000`). Se a loja recusar dizendo que o versionCode já existe, é porque a
versão não subiu desde o último envio — suba `APP_CAMPO_VERSION` e gere de novo.

> **Por que duas versões.** A plataforma sobe de versão várias vezes por semana;
> o app de campo quase não muda. Enquanto os dois compartilhavam a mesma
> `APP_VERSION`, cada entrega da plataforma empurrava para as lojas um app
> "novo" sem uma linha alterada — a 2.138.0 foi publicada sem nenhuma mudança no
> app desde a 2.136.0. **Só suba a `APP_CAMPO_VERSION` quando o app de campo
> mudar de verdade.**

---

## PASSO 3 — Preencher a ficha da loja

No Play Console, em **Crescer → Presença na loja → Principal presença na loja**.
Todos os textos estão em [`loja/ficha-play-store.md`](../loja/ficha-play-store.md):

- Descrição curta e descrição completa
- Ícone: `loja/icone-512.png`
- Imagem de destaque: `loja/destaque-1024x500.png`
- **Capturas de tela: mínimo 2 do celular** — obrigatórias para produção

Para regerar ícone e destaque: `node scripts/gerar-icones-app.mjs`.

---

## PASSO 4 — Conteúdo do app

Em **Política e programas → Conteúdo do app**. As respostas estão todas na
ficha; os pontos que reprovam revisão se saírem errados:

- **Acesso ao app** — o INVICTA Coleta não abre sem conta. Crie um usuário só
  para a revisão do Google e informe login e senha ali. Sem isso a revisão é
  reprovada com "não conseguimos entrar no app".
- **Segurança dos dados** — declare localização precisa, fotos, e-mail, nome e
  telefone conforme a tabela da ficha. Declarar de menos é motivo de suspensão.
- **Política de privacidade** — `https://invicta-platform.vercel.app/privacidade`

---

## PASSO 5 — Enviar para Produção

1. **Teste → Produção → Criar nova versão**
2. Upload do `.aab` de `loja/`
3. Notas da versão: o texto está na ficha
4. **Avançar → Salvar → Enviar para revisão**

A revisão de produção leva de alguns dias a duas semanas na primeira vez.

> **Conta pessoal criada depois de novembro de 2023?** O Google exige, antes da
> produção, um **teste fechado com no mínimo 12 testadores por 14 dias
> seguidos**. Contas do tipo Organização não passam por essa exigência. Se for o
> seu caso, comece pelo teste fechado: é o mesmo `.aab`, só muda a trilha.

---

## Atualizar o app depois

1. Suba `APP_CAMPO_VERSION` em `src/constants/version.ts` (regra do projeto: toda
   mudança sobe a versão e ganha entrada no changelog)
2. `npm run android:release`
3. Play Console → **Produção → Criar nova versão** → upload do novo `.aab`

---

## O que é seu para guardar

| Item | Onde | Se perder |
|---|---|---|
| `android/invicta-coleta.jks` | backup fora desta pasta | **não dá para atualizar o app** |
| senha do keystore | gerenciador de senhas | idem |
| conta do Play Console | e-mail da empresa | recuperável pelo Google |
