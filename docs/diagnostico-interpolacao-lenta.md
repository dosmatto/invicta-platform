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

## Correções
1. **Infra (raiz):** confirmar/forçar o plano do serviço no Render (deve ter CPU real).
2. **Código (robustez + velocidade, precisão preservada):** reduzir o custo da seleção
   de modelo; remover `_clip` redundante; cache por hash(dados+params+versão);
   cancelamento no frontend; instrumentação por etapa; pin defensivo das libs.
