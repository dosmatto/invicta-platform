# Pendências numeradas — registro

O usuário numera as pendências da plataforma ("18 - adicionar gaveta expansiva
para talhões com multipolígonos..."). Este arquivo é o registro: **número →
título → versão que entregou**. É o que permite, meses depois, sair do número
que ele citou e chegar no código, no changelog e no commit.

## Como registrar (padrão obrigatório)

Ao entregar a pendência **N**:

1. **Título curto** criado por você, que diga o QUE mudou na tela (não o
   sintoma). É o título que entra aqui e no comentário do changelog.
2. **`src/constants/changelog.ts`** — a entrada da versão nova recebe, na linha
   acima, o comentário `// [N] <título>`; e o **primeiro item da lista começa
   com `PENDÊNCIA N — `** (o usuário lê essa lista no painel Config., então o
   número precisa aparecer para ele, não só no código).
3. **Commit** — `vX.Y.Z — [N] <título>`.
4. **Uma linha nova na tabela abaixo**, mais recente por último.

Uma versão pode fechar mais de uma pendência (`[16][17]`), e uma pendência pode
levar mais de uma versão (repete o número na linha seguinte, com a correção).

## Registro

| Nº | Título | Versão | Onde na tela |
|---:|--------|--------|--------------|
| 18 | Áreas separadas do talhão, uma a uma | 2.81.0 | Produtores → fazenda → aba Talhões (gaveta no selo âmbar) |

> As pendências 1–17 foram entregues antes deste registro existir e não estão
> catalogadas; procure pelo assunto no `changelog.ts`. Da 18 em diante, tudo
> passa por aqui.
