# Backend de Interpolacao (Fertilidade)

Servico Python local que recebe os pontos de amostragem + valores + poligono do
talhao e devolve um raster (PNG) interpolado, recortado e colorido por gradiente.

- **Krigagem ordinaria** (PyKrige) com selecao automatica de variograma
  (`spherical` / `exponential` / `gaussian` por leave-one-out RMSE).
- **Fallback IDW** quando ha menos de 12 pontos ou a krigagem nao converge.
- **Recorte** pelo poligono (Shapely) e **gradiente** continuo (cores enviadas
  pelo front, derivadas da Base Agronomica).

## Rodar

```
backend\start.bat
```

(Na primeira vez ele cria o ambiente em `%LOCALAPPDATA%\invicta-fert-backend` e
instala as dependencias. Depois e so subir.)

Servico em `http://127.0.0.1:8000` — `GET /health`, `POST /interpolar`.

## Conexao com o front

O front usa `NEXT_PUBLIC_INTERP_URL` (padrao `http://127.0.0.1:8000`).
Para producao, suba o mesmo codigo em container e aponte essa variavel.

## Contrato `POST /interpolar`

```json
{
  "pontos":   [{ "lng": -50.1, "lat": -24.3, "valor": 12.5 }],
  "poligono": { "type": "Polygon", "coordinates": [[ [lng,lat], ... ]] },
  "dominio":  [4.0, 25.0],
  "stops":    [[0.0, [204,0,0]], [1.0, [118,42,131]]],
  "pixel_m":  20.0
}
```

Resposta:

```json
{
  "bounds": [w, s, e, n],
  "png": "data:image/png;base64,...",
  "stats": { "n": 30, "modelo": "spherical", "fallback": false, "min": 5.1, "max": 28.4, "nx": 120, "ny": 95 }
}
```
