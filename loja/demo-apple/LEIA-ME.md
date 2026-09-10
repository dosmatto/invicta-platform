# Área de demonstração para a revisão da Apple

Um talhão fictício sobre o **Apple Park** (Cupertino, Califórnia) para que o
revisor da App Store consiga registrar uma coleta sem sair do prédio dele.

**Já está cadastrado e verificado na plataforma** (10/09/2026). O que segue é o
registro do que existe, por quê, e o que ainda depende de decisão sua.

| | |
|---|---|
| Centro | 37.33464, -122.00901 (anel do Apple Park) |
| Área | 45,55 ha |
| Pontos | 508, grade regular de 30 m |
| Pior caso até o ponto mais próximo | 21 m |

Regerar os arquivos: `node scripts/gerar-area-demo-apple.mjs`

## Por que ela existe

A coleta só é liberada dentro do raio do ponto
([`page.tsx:1022`](../../src/app/coleta/page.tsx)). É a trava que impede amostra
registrada no lugar errado — e é também o que impediria o revisor da Apple,
sentado a 10 mil km de Carambeí, de exercitar a função principal do app. A
recusa seria "we were unable to review the core functionality".

Desligar a trava para a revisão **não** resolve: a build revisada é a build
publicada, então os operadores ficariam sem a proteção, e a versão seguinte —
com a trava de volta — passaria por uma revisão nova e cairia no mesmo lugar.
Dar ao revisor um lugar onde ele **já está dentro do raio** resolve sem tocar em
uma linha de código.

## O raio precisa ir para 50 m — e isso é ajuste de usuário

Duas fontes de erro se somam contra o revisor:

1. **A grade.** No centro de uma célula de 30 m, o ponto mais próximo está a
   21 m (30/√2).
2. **O GPS dentro do prédio.** O iPhone cai para posicionamento por Wi-Fi e
   erra de 20 a 50 m. Esse erro entra somado ao de cima.

Com o raio padrão de 15 m a conta não fecha em ambiente interno. Com 50 m sim:
21 + ~25 = 46 m. O app já oferece de 5 a 50 m em **Configurações**, então isso é
instrução ao revisor, não mudança de código — e a nota da revisão já pede.

---

## O que está cadastrado

| Registro | Valor |
|---|---|
| Produtor | `ZZ DEMONSTRACAO APPLE` · PJ · `00.000.000/0000-00` |
| Fazenda | `DEMO CUPERTINO` (sigla DCUP) · agrônomo: William Nolte |
| Talhão | `DEMO 01` · 45,55 ha · `/talhao/mtvhnbrtiy7ua75jv7s` |
| Grade | `DEMO APPLE - 508 pts, grade 30 m` · 508 pontos · números 1–508 |
| Ano / ciclo | 2026 · 2ª época · **26/27** |

O prefixo `ZZ` joga o cadastro para o fim da lista de produtores (ela é ordenada
por nome), fora do meio dos clientes reais.

> **O estado ficou como "PR".** O seletor da plataforma só tem UFs brasileiras —
> não há opção para a Califórnia. O município ficou `Cupertino (CA, EUA)`, que é
> o que aparece nas telas. Nada depende do estado funcionalmente.

### Verificado de ponta a ponta — **logado como o revisor**

Feito com `revisao.lojas@invicta.agr.br`, não com o owner. A diferença importa:
owner tem `escopoClienteIds()` devolvendo `null` e enxerga tudo, então um teste
com ele provaria que os dados existem e nada sobre o escopo.

| Verificação | Resultado |
|---|---|
| A conta abre | ✅ login online OK (o app gravou o verificador offline dela) |
| Escopo | ✅ **2 produtores** na lista: WILLIAM NOLTE e ZZ DEMONSTRACAO APPLE — os outros 74 clientes reais não aparecem |
| Caminho do revisor | ✅ produtor → DEMO CUPERTINO → DEMO 01 → 2026 → grade |
| Tela de coleta | ✅ **0/508 coletados · 26/27**, os 508 pontos (P-001 a P-508) sobre o satélite do Apple Park |
| Ajuste de raio | ✅ Configurações → "Raio permitido para coletar" chega a **50 m** |

> **A senha da conta funciona** — era a dúvida, porque a Central de Acessos
> mostra "Último acesso: nunca". Mostra mesmo: o campo não tinha sido atualizado
> porque ninguém havia entrado até este teste.

> **A marca "para processar" não é necessária.** Eu tinha escrito aqui que ela
> era; não é. O app de campo chama `getGrades(talhaoId, safra)`
> ([`page.tsx:304`](../../src/app/coleta/page.tsx)) e não filtra por
> `paraProcessar` — a grade aparece por existir no talhão e no ciclo.

### Conta do revisor

Já existia: **`revisao.lojas@invicta.agr.br`** (categoria Prestador, papel
Operador), criada em 09/09/2026 — provavelmente para a revisão do Google.

O vínculo dela foi ampliado de 1 para **2 produtores**: `WILLIAM NOLTE` (que já
estava) e `ZZ DEMONSTRACAO APPLE`. O revisor da Apple entra e vê exatamente
esses dois — a fazenda brasileira, que mostra dados de aparência real, e a de
Cupertino, onde ele consegue coletar.

A senha já existe e foi validada num login real (veja a tabela acima). **Falta
só transcrevê-la no App Store Connect**, no campo "Login obrigatório" — eu não
manuseio senha.

---

## Quem mais enxerga esta fazenda

O multi-tenant da plataforma está **desligado** por decisão de projeto
(`loadFiltrado`, em `store.ts`, ignora `empresaId`). O único controle de
visibilidade é o vínculo por produtor, e `escopoClienteIds()` devolve `null` —
ou seja, "vê tudo" — em dois casos: papéis privilegiados, e usuários sem vínculo
nenhum.

Conferido na Central de Acessos (24 usuários) no dia do cadastro:

- **Equipe interna** (Owner, Administrador, Agrônomo, Somente leitura) — vê a
  fazenda. Esperado; alguém precisa manter a área.
- **`matheus@invicta.agr.br`** — Interno / **Operador** com escopo
  `todos prod · todas faz · todos tal`. É o único operador de verdade que
  passará a ver `ZZ DEMONSTRACAO APPLE` no seletor do app de campo. Se isso
  incomodar, preencha o vínculo dele com os produtores que ele atende.
- **Demais operadores** (`andradejosehenrique2`, `jnatan257`, `rafarosso013264`)
  — já têm escopo restrito a 1 produtor. Não veem nada de novo.

> Enquanto olhava isso: há **6 cadastros `teste-rls-*@invicta.agr.br`** parados
> em "Aguardando aprovação", sobras dos testes de RLS. Não atrapalham a Apple,
> mas poluem a fila de pendentes.

---

## Depois da aprovação

Não apague. A Apple revisa **toda** atualização, e a próxima versão vai precisar
da mesma área. Mantenha o cadastro e a conta do revisor ativos; o custo é uma
linha na lista de produtores.

Se um dia precisar remover: apague a grade, o talhão, a fazenda e o produtor
nessa ordem, pela própria interface — nunca direto no banco. A sincronização é
por coleção inteira, e um registro malformado se espalha para todos os
aparelhos.
