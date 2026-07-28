# Diagnóstico — regressão de desempenho da interpolação (2026-07-24)

## Método
Medição empírica (sem presumir): comparação do código vs git, medição do backend
de produção com payloads sintéticos representativos, e microbenchmark local com as
bibliotecas *latest* para isolar biblioteca vs CPU.

## Fatos apurados
1. **Backend byte-idêntico à v2.6.0** — `git diff e68a41c..HEAD -- backend/` = vazio.
   O algoritmo e as libs geográficas **não mudaram** no código.
2. **Backend acordado** — `/health` responde em 0,4–0,8 s (Standard não dorme). Não é
   cold start. Versão implantada: `interp-20-contorno-oficial`.
3. **Entrada normal** — `pontosDe()` devolve no máximo o nº de amostras do laudo
   (20–100 típico); sem inflar. `pixelM` default = 5 m (inalterado).
4. **Frontend descartado** — hidratação de cache da nuvem funciona (reabrir talhão
   não reprocessa); `MapView` estável desde a v2.6.0.

## Medições (backend de produção, talhão sintético ~1,1 km × 1,1 km, grade 230×224)
| caso                         | Render (prod) |
|------------------------------|---------------|
| N=30, krige AUTO             | **67,5 s**    |
| N=30, krige FIXO (esférico)  | 26,3 s        |
| N=30, IDW                    | 2,2 s         |

## Microbenchmark local (Mac, libs *latest*: numpy 2.5.1 / scipy 1.18.0 / pykrige 1.7.3)
| caso                                   | local (Mac) |
|----------------------------------------|-------------|
| 1 krigagem (30 pts) construct+points   | **3,6 ms**  |
| LOO 1 modelo (N=30)                    | 0,08 s      |
| auto (3 modelos LOO + grid 230×224)    | **0,48 s**  |
| 1 grid execute 230×224                 | 21,5 ms     |

## Causa raiz
O **mesmo código com as libs latest roda em 0,48 s no Mac e 67,5 s no Render** — ~140×
mais lento. Logo **não é regressão de biblioteca**. Cada operação de krigagem custa
~3,6 ms local vs ~750 ms no Render (~200×). O caminho vetorizado (IDW) é só ~10× mais
lento, mas o caminho de krigagem (loop Python + 91 krigagens pequenas na seleção
automática de modelo) é ~140–200× mais lento — assinatura clássica de **CPU
throttled/compartilhada** (burstable esgotado), não de plano Standard dedicado.

**Conclusão:** o instance `invicta-fertilidade-backend` **não está com a CPU do plano
Standard**. Um Standard real (1 vCPU) faz esse trabalho em ~1–3 s (exatamente os "~2 s"
medidos na v2.7.29). Os 67 s de hoje equivalem a ~0,007 vCPU efetiva (tier Free/throttled).
A regressão é o instance ter perdido a alocação Standard entre a v2.7.29 e agora
(plano revertido / billing / remanejamento do Render) — **infra, não código**.

## Fator amplificador no código (independente da CPU)
A seleção **automática** de modelo faz **3 modelos × N krigagens leave-one-out** (91
operações para 30 pontos) só para escolher o variograma. Isso multiplica por ~30–90× o
custo. Reduzir esse laço deixa a interpolação rápida mesmo em CPU modesta, sem alterar a
precisão do mapa (o mapa final usa todos os pontos no modelo escolhido).

## ATUALIZAÇÃO — causa raiz refinada (após instrumentar e reiniciar)
Ao publicar a v2.7.31, o container do backend REINICIOU. O mesmo `/interpolar` que
levava **67,5 s** passou a levar **1,65 s** — e a nova rota `GET /diag` (roda uma
krigagem FIXA DENTRO do container) reportou **auto-30pts = 1,23 s, veredito "CPU ok"**,
com 16 CPUs visíveis. Como as otimizações de código **não** reduzem o custo do modo
AUTO (continua 3 modelos × N krigagens), o salto 67 s → 1,6 s veio **do restart**.

**Conclusão definitiva:** a CPU FRESCA é rápida (o plano está ok). A lentidão era a
**DEGRADAÇÃO do processo de worker único e de vida longa**: GDAL/rasterio + o
processamento repetido de rasters incham/fragmentam a memória do worker ao longo do
uso → o container passa a fazer swap → o trabalho CPU-bound (krigagem) fica ~50× mais
lento. Reiniciar cura, mas volta — por isso "parecia" throttle de CPU.

Comparativo:
| medição                        | degradado (pré-fix) | fresco (pós-fix) |
|--------------------------------|---------------------|------------------|
| /interpolar auto 30 pts        | 67,5 s              | ~1,6 s           |
| /diag auto 30 pts (no container)| —                  | 1,23 s ("CPU ok")|
| modelo fixo esférico           | 26,3 s              | ~1,4 s           |
| reprocesso idêntico            | recalculava         | cache hit (~0,4s)|

## Correções aplicadas
1. **DEFINITIVO (v2.7.32):** backend com **gunicorn + worker uvicorn reciclado**
   (`--max-requests 100 ±25`). O worker se reinicia sozinho a cada ~100 requisições e
   restaura a memória **sem derrubar o serviço** → impede a degradação recorrente.
   Confirmado no ar: `/health.server = gunicorn/26.0.0`.
2. **Instrumentação permanente (v2.7.31):** tempo por etapa + job id + nº de células +
   RSS + cache no `stats` e no log; `GET /diag` = auto-diagnóstico de CPU do container;
   `/health` reporta CPU, versões das libs, cache e servidor.
3. **Velocidade sem perder precisão (v2.7.31):** cache por hash(dados+params+versão);
   máscara de recorte calculada 1× (era até 3×); modo fixo pula o LOO redundante
   (mapa idêntico, validado por hash do grid). Seleção AUTOMÁTICA inalterada.
4. **UI responsiva (v2.7.31):** cancelamento (AbortController) da interpolação em voo.

## Pendências / recomendações
- Observar `/health.rss_mb` e os `timings` ao longo dos dias — se a degradação recorrer
  ANTES do reciclo, baixar `--max-requests` ou subir `WEB_CONCURRENCY` (mais workers).
- Modo AUTO faz 3 modelos × N krigagens LOO. Se quiser AUTO instantâneo mesmo sob
  carga: (a) `WEB_CONCURRENCY=2` (usa mais dos 16 CPUs), ou (b) tornar a seleção de
  modelo mais barata (muda o critério de seleção — precisa de aval por afetar QUAL
  modelo é escolhido, não a precisão do mapa dado o modelo).
- Pin defensivo das libs (numpy/scipy/pykrige/shapely) — hoje `latest` é rápido, mas
  pinar evita surpresa futura (o usuário citou "atualização de libs" como suspeita).

---

## Interpolador LOCAL aparecendo como "sem resposta" (v2.8.7)

**Sintoma:** o `start.sh` sobe normalmente (`no ar em http://127.0.0.1:8800`),
`curl http://127.0.0.1:8800/health` responde 200 — mas Configurações mostra
"sem resposta" e o lote não vai para a máquina.

**Causa:** *Private Network Access*. Quando uma página **https pública** chama um
endereço da rede local, o Chrome manda antes um preflight `OPTIONS` com
`Access-Control-Request-Private-Network: true`. Do **Starlette 1.x** em diante o
próprio `CORSMiddleware` valida esse cabeçalho e responde **400 "Disallowed CORS
private-network"** quando `allow_private_network` não está ligado. O middleware
`_allow_private_network` do `app.py` só acrescentava o cabeçalho na resposta —
não adiantava, porque o CORSMiddleware já encerrava o preflight com 400 antes.

Foi um efeito colateral do pin de libs (`fastapi==0.140.0` → starlette 1.3.1).

**Correção:** `allow_private_network=True` no `CORSMiddleware` (passado só se o
parâmetro existir na versão instalada, para não quebrar Starlette antigo).
`interp.VERSION` = `interp-24-pna-liberado` — dá para conferir qual versão está
rodando pelo status em Configurações ("Online · interp-24-…").

**Como reproduzir/validar sem navegador:**
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X OPTIONS \
  -H "Origin: https://invicta-platform.vercel.app" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Private-Network: true" \
  http://127.0.0.1:8800/health
```
`400` = quebrado · `200` = corrigido. (Sem o cabeçalho PNA o preflight dá 200 nos
dois casos — por isso o `curl` simples enganava.)

**Safari continua bloqueando** https → http://127.0.0.1 por conta própria; o modo
local exige **Chrome**.

**Atalho (macOS):** `npm run interp:atalho` cria `Interpolador INVICTA.app` na Área
de Trabalho apontando para o `backend/` do repositório — sem quarentena do
Gatekeeper (o problema do `start.command` baixado) e sempre na versão do repo.
