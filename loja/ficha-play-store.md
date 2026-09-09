# Ficha da Play Store — INVICTA Coleta

Textos e respostas prontos para copiar no Google Play Console. Cada bloco diz
onde ele entra. Os limites de caracteres são os que a loja impõe.

- **Nome do app** (30): `INVICTA Coleta`
- **Package** (imutável): `br.agr.invicta.coleta`
- **Categoria**: Empresas *(alternativa: Ferramentas)*
- **Tags**: agricultura, produtividade, mapas
- **E-mail de contato**: *(preencher — vai público na ficha)*
- **Site**: `https://invicta-platform.vercel.app`
- **Política de privacidade**: `https://invicta-platform.vercel.app/privacidade`

---

## Descrição curta (máx. 80)

```
Amostragem de solo em campo: navegação por GPS, fotos e trabalho offline.
```

## Descrição completa (máx. 4000)

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

## Notas da versão (máx. 500)

```
Primeira versão publicada na loja.

- Coleta de solo guiada por GPS, ponto a ponto
- Funciona sem internet e sincroniza quando o sinal volta
- Fotos da amostra ligadas ao ponto
- Medição de área, manchas e compactação
```

---

## Ativos gráficos

| Item | Arquivo | Exigência da loja |
|---|---|---|
| Ícone | `loja/icone-512.png` | 512×512 PNG, sem transparência ✓ |
| Imagem de destaque | `loja/destaque-1024x500.png` | 1024×500 PNG ✓ |
| Capturas de celular | `loja/screenshots/` | mín. 2, entre 320px e 3840px, proporção até 2:1 |

Suba as capturas **nesta ordem** — a loja mostra as duas primeiras já na busca:

1. `01-mapa-com-os-pontos.jpg` — 1290×2481. O talhão sobre o satélite com os 26
   pontos numerados e a precisão do GPS. É a imagem que explica o app sozinha.
2. `02-modulos-de-campo.jpg` — 1283×1950. Os quatro módulos, mostrando o alcance
   do app além da amostragem.
3. `03-medicao-gps.jpg` — 1290×2535. A medição de área por GPS sobre a lavoura.

Os arquivos originais do celular estão em `screenshots/originais/`. Duas passavam
de 2:1 e teriam sido recusadas no upload; foram recortadas.

Para regerar ícone e destaque: `node scripts/gerar-icones-app.mjs`.

---

## Conteúdo do app (Política e programas → Conteúdo do app)

### Acesso ao app
**Todas as funcionalidades exigem acesso especial.** O app só abre com conta da
Plataforma INVICTA. Crie um usuário só para a revisão do Google (papel de
Operador, com uma fazenda de exemplo) e informe login e senha no formulário —
sem isso a revisão é reprovada por "não conseguimos entrar".

### Anúncios
**Não**, o app não exibe anúncios.

### Classificação de conteúdo
Ferramenta profissional, sem conteúdo sensível, sem interação entre usuários,
sem compras. Resultado esperado: **Livre**.

### Público-alvo
**18 anos ou mais.** Não é direcionado a crianças.

### Segurança dos dados

Dados coletados:

| Dado | Coletado | Compartilhado | Finalidade | Obrigatório |
|---|---|---|---|---|
| Localização precisa | Sim | Não | Funcionalidade do app | Sim |
| Fotos | Sim | Não | Funcionalidade do app | Não |
| E-mail | Sim | Não | Gerenciamento de conta | Sim |
| Nome | Sim | Não | Gerenciamento de conta | Sim |
| Telefone | Sim | Não | Gerenciamento de conta | Não |

Declarar também:
- Dados criptografados em trânsito: **Sim** (HTTPS/Supabase)
- O usuário pode pedir a exclusão dos dados: **Sim**
- URL de exclusão de conta: `https://invicta-platform.vercel.app/privacidade`

> A loja exige um caminho de exclusão de conta para todo app que permite criar
> conta. Hoje a página de privacidade instrui a pedir por e-mail, o que a
> política aceita — mas um formulário próprio reduz a chance de questionamento
> na revisão de produção.

---

## Publicação

Destino: **Produção** — o app fica visível na busca da Play Store para qualquer
pessoa. Toda a ficha acima é obrigatória, capturas de tela inclusive.

> Se a conta do Play Console for do tipo **Pessoal** e tiver sido criada depois
> de novembro de 2023, o Google exige antes um **teste fechado com 12
> testadores por 14 dias seguidos**. É o mesmo `.aab`, só muda a trilha — mas
> muda o calendário. Contas do tipo Organização não passam por isso.

Passo a passo: `docs/publicar-android.md`.
