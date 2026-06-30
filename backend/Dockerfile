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
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT}"]
