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

**O número é DO USUÁRIO.** Pedido que chegar em texto livre, sem número, entra
como `S/N` — nunca inventando o próximo número da lista dele. Em 2026-08-27 a
separação de área foi publicada como "PENDÊNCIA 19" por um palpite meu, e a 19
verdadeira (fusão de talhões) chegou depois; foi preciso renumerar.

## Registro

| Nº | Título | Versão | Onde na tela |
|---:|--------|--------|--------------|
| 18 | Áreas separadas do talhão, uma a uma | 2.81.0 | Produtores → fazenda → aba Talhões (gaveta no selo âmbar) |
| S/N | Separar uma área do talhão (desmembrar / anexar / excluir) | 2.82.0 | Talhão → Limite do talhão → "Talhão em N áreas — separar uma delas" |
| 18 | Nome do talhão sempre inteiro na lista (correção) | 2.83.1 | Produtores → fazenda → aba Talhões |
| 19 | Fundir dois talhões, escolhendo o nome que fica | 2.89.0 | Talhão → "Fundir com outro talhão" (e ao renomear para um nome existente) |
| 20 | Motor de casamento da planilha fitotécnica | 2.83.0 | Sem tela (biblioteca `src/lib/importacao`); plano em `docs/IMPORTACAO-FITOTECNICA.md` |
| 20 | Cadastro de cultivares e propósitos | 2.84.0 | Biblioteca → Cultivares · Biblioteca → Propósitos |
| 20 | Cultivo: consórcio, talhão partido e safrinha | 2.85.0 | Talhão → seletor de Cultura (sem mudança visível; o registro por trás mudou) |
| 20 | Leitor da planilha e motor de conferência | 2.86.0 | Sem tela (`src/lib/importacao/planilha.ts` e `conferencia.ts`) |
| 20 | Importar planilha fitotécnica: a tela | 2.88.0 | Barra lateral → Importar planilha |

> As pendências 1–17 foram entregues antes deste registro existir e não estão
> catalogadas; procure pelo assunto no `changelog.ts`. Da 18 em diante, tudo
> passa por aqui.
