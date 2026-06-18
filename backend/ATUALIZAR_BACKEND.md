# Atualizar o backend de interpolação

O backend de fertilidade (krigagem/IDW) roda **na máquina de quem processa**, em
`http://127.0.0.1:8800`. **Só processe mapas de fertilidade em uma máquina com o
backend ATUALIZADO** — senão os mapas podem sair sem grid / sem a krigagem nova.
(Os mapas salvos são compartilhados e ficam visíveis para todos; o que muda com
o backend é a **qualidade** do que é gerado.)

## Como saber a versão que está rodando
Abra no navegador: **http://127.0.0.1:8800/health**

Deve aparecer algo como:
```json
{"ok":true,"pykrige":true,"v":"interp-5-krige-pinv"}
```
- Se **não tiver o campo `"v"`** (ou for uma versão antiga) → o backend está
  desatualizado: siga os passos abaixo.

## Atualizar (passo a passo)

1. **Pegue o código novo:**
   - Se a máquina tem o repositório (git): no terminal, dentro da pasta do
     projeto, rode `git pull`.
   - Se a máquina só tem a pasta `backend/` (sem git): substitua a pasta
     `backend/` pela versão nova (copie por cima).

2. **Rode o `start.bat`** (na pasta `backend/`).
   - Ele agora **encerra sozinho** qualquer backend antigo preso na porta 8800
     (no Windows, fechar a janela nem sempre mata o processo — era isso que fazia
     parecer que "nada mudava"). Depois sobe o código atual.

3. **Confirme** em **http://127.0.0.1:8800/health** que o `"v"` mudou para a
   versão nova.

4. **Reprocesse** os mapas que precisam (aba Fertilidade → "Processar tudo").

## Se foi adicionada uma dependência nova
Raro. Se o `requirements.txt` mudou e algo reclamar de módulo faltando, apague a
pasta do ambiente Python e rode o `start.bat` de novo (ele recria e reinstala):

```
%LOCALAPPDATA%\invicta-fert-backend\venv
```

## Resumo da regra (padronização)
- **Processar fertilidade:** só em máquina com `/health` mostrando a versão atual.
- **Visualizar:** qualquer usuário logado vê os mapas que já foram processados
  (eles ficam na nuvem compartilhada).
