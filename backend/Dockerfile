# Backend de interpolacao (fertilidade/satelite) para a nuvem.
# Build context = ./backend (ver render.yaml).
# Imagem COMPLETA (nao -slim): traz as libs de sistema que o rasterio/GDAL
# precisam em runtime (no slim, import rasterio falha -> msr/cbers ausentes).
FROM python:3.12

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Render/Railway injetam a porta via $PORT; local cai em 8800.
ENV PORT=8800
EXPOSE 8800
# gunicorn + worker uvicorn com RECICLAGEM (--max-requests): o worker é
# reiniciado a cada ~100 requisições (±25 de jitter). Isto impede a DEGRADAÇÃO
# do processo de vida longa — GDAL/rasterio e o processamento repetido de
# rasters incham/fragmentam a memória do worker; sem reciclar, ao longo do dia o
# container passa a fazer swap e a krigagem (CPU-bound) fica ~50x mais lenta
# (medido: 1,6s -> 67s). Reciclar restaura o estado sem derrubar o serviço.
# WEB_CONCURRENCY controla o nº de workers (default 1 = conservador com a RAM;
# suba para 2 se o plano tiver folga de memória). --timeout 600: a krigagem
# grande pode demorar; não matar a requisição. --graceful-timeout 30 p/ a troca.
# Worker uvicorn via o pacote oficial `uvicorn-worker` (o `uvicorn.workers`
# embutido foi deprecado/removido nas versões novas — não depender dele).
# 2 workers: quando um usuário roda um lote pesado ("Processar tudo"), o outro
# worker atende os demais — sem serializar todo mundo no mesmo processo. Memória
# medida ~300 MB/worker sob carga (cabe nos 2 GB do Standard). Ajuste por env se
# precisar. Reciclagem por worker (--max-requests) continua evitando o inchaço.
ENV WEB_CONCURRENCY=2
CMD ["sh", "-c", "gunicorn app:app -k uvicorn_worker.UvicornWorker -w ${WEB_CONCURRENCY} --max-requests 100 --max-requests-jitter 25 --timeout 600 --graceful-timeout 30 --bind 0.0.0.0:${PORT}"]
