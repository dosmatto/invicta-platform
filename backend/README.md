# Backend de Interpolacao (Fertilidade)

Servico Python local que recebe os pontos de amostragem + valores + poligono do
talhao e devolve um raster (PNG) interpolado, recortado e colorido por gradiente.

- **Krigagem ordinaria** (PyKrige) com selecao automatica de variograma
  (`spherical` / `exponential` / `gaussian` por leave-one-out RMSE).
- **Metodo explicito** (krigagem ou IDW, sem troca automatica); variograma Auto ou fixo.
- **Recorte** pelo poligono (Shapely) e **gradiente** continuo (cores enviadas
  pelo front, derivadas da Base Agronomica).

## Rodar

Windows:

```
backend\start.bat
```

macOS / Linux:

```
bash backend/start.sh
```

(Na primeira vez cria o ambiente Python e instala as dependencias, ~2-4 min.
Windows: venv em `%LOCALAPPDATA%\invicta-fert-backend`; macOS/Linux: em
`~/.invicta-fert-backend`. Depois e so subir.)

Servico em `http://127.0.0.1:8800` — `GET /health`, `POST /interpolar`.

## Conexao com o front

O front usa `NEXT_PUBLIC_INTERP_URL` (padrao `http://127.0.0.1:8800`).
Local = backend em cada maquina; nuvem = um backend publico para todas.

## Deploy na nuvem (Render) — link publico sem backend local

Com `Dockerfile` + `render.yaml` (ja no repo), o app publicado e qualquer
maquina usam o mesmo backend, sem rodar nada local.

1. Crie conta em https://render.com (free) e conecte o GitHub.
2. **New > Blueprint** > selecione este repositorio. O Render le o `render.yaml`
   e cria o servico `invicta-fertilidade-backend` (Docker, plano free).
3. Apos o deploy, copie a URL (ex.: `https://invicta-fertilidade-backend.onrender.com`)
   e abra `…/health` (deve responder `{"ok":true,...}`).
4. Na **Vercel** (projeto do front) > Settings > Environment Variables, adicione
   `NEXT_PUBLIC_INTERP_URL = https://…onrender.com` e **Redeploy**.

Pronto: o link publico processa em qualquer maquina, sem `start.bat`.
Obs.: no plano free o servico hiberna apos inatividade (1o acesso ~30-60s).

## Contrato `POST /interpolar`

```json
{
  "pontos":   [{ "lng": -50.1, "lat": -24.3, "valor": 12.5 }],
  "poligono": { "type": "Polygon", "coordinates": [[ [lng,lat], ... ]] },
  "dominio":  [4.0, 25.0],
  "stops":    [[0.0, [204,0,0]], [1.0, [118,42,131]]],
  "pixel_m":  20.0,
  "metodo":   "krige",
  "modelo_fixo": null
}
```

Resposta:

```json
{
  "bounds": [w, s, e, n],
  "png": "data:image/png;base64,...",
  "stats": { "n": 30, "modelo": "spherical", "min": 5.1, "max": 28.4, "nx": 120, "ny": 95, "pixel_m": 20.0, "rmse": 6.2, "variograma": { "alcance_m": 93.2, "patamar": 34.3, "pepita": 16.1 } }
}
```
