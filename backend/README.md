# Backend de Interpolacao (Fertilidade)

Servico Python local que recebe os pontos de amostragem + valores + poligono do
talhao e devolve um raster (PNG) interpolado, recortado e colorido por gradiente.

- **Krigagem ordinaria** (PyKrige) com selecao automatica de variograma
  (`spherical` / `exponential` / `gaussian` por leave-one-out RMSE).
- **Metodo explicito** (krigagem ou IDW, sem troca automatica); variograma Auto ou fixo.
- **Recorte** pelo poligono (Shapely) e **gradiente** continuo (cores enviadas
  pelo front, derivadas da Base Agronomica).

## Rodar (em cada maquina, uma vez)

**Duplo-clique** (mais simples):
- Windows: `backend\start.bat`
- macOS: `backend/start.command`

Ou pelo terminal:
- Windows: `backend\start.bat`
- macOS / Linux: `bash backend/start.sh`

Ele **acha o Python sozinho**, cria o ambiente e instala as dependencias na
primeira vez (~2-4 min). Deixe a janela aberta enquanto usa o app — e so isso:
o app passa a interpolar nessa maquina. (venv em `%LOCALAPPDATA%\invicta-fert-backend`
no Windows; `~/.invicta-fert-backend` no macOS/Linux.)

Servico em `http://127.0.0.1:8800` — `GET /health`, `POST /interpolar`.

## Robo noturno do satelite (pendencia 40)

Varre os talhoes marcados como monitorados (`inv_msr_monitor`), busca cenas novas
do Sentinel-2, aplica as regras de aceite e grava as camadas em `inv_mapas_fert`
— no MESMO formato das feitas a mao, com `automatico: true`.

Roda dentro deste servico, numa thread; qual dos workers do gunicorn executa e
decidido por uma trava em linha do banco. Cada cena e gravada assim que fica
pronta, entao a reciclagem do worker (`--max-requests`) custa no maximo uma cena
— o worker seguinte retoma quando a trava expira (5 min).

**Nada arma sem `MSR_AGENDA=1`.** `GET /health` traz um bloco `agenda` dizendo se
armou e por que nao.

| Variavel | Padrao | Para que serve |
|---|---|---|
| `MSR_AGENDA` | *(vazio)* | `1` liga o robo. Sem ela, no-op. |
| `SUPABASE_URL` | — | Obrigatoria (ja usada pelo admin de usuarios). |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Obrigatoria. Passa por cima da RLS — **nunca** vai ao front. |
| `MSR_TZ` | `America/Sao_Paulo` | Fuso da janela de execucao. |
| `MSR_JANELA_INI` / `MSR_JANELA_FIM` | `02:00` / `05:30` | Janela local (aceita atravessar a meia-noite). |
| `MSR_INTERVALO_S` | `300` | De quanto em quanto tempo o laco confere se esta na janela. |
| `MSR_MAX_CENAS_NOITE` | `60` | Teto de cenas por execucao. |
| `MSR_MAX_CENAS_TALHAO` | `3` | Teto por talhao, por noite. |
| `MSR_JANELA_DIAS` | `30` | Quanto olhar para tras quando o talhao nao tem cena guardada. |
| `MSR_PAUSA_S` | `2` | Respiro entre cenas (o mesmo processo atende usuarios). |
| `MSR_AVALIAR_WORKERS` | `3` | Paralelismo da rota `/ndvi-avaliar` (nao do robo, que e serial). |

**Testar sem esperar a madrugada:** `POST /msr-agenda-rodar` dispara uma passada
na hora. Exige `X-Api-Key` SEMPRE — mesmo quando `INVICTA_API_KEY` nao esta
definida (ai a rota responde 503 e fica indisponivel). As demais rotas so gastam
CPU de quem chama; esta ESCREVE no banco de todos os clientes.

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
