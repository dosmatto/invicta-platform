"""API de interpolacao de fertilidade (FastAPI).

Roda local: `python -m uvicorn app:app --host 127.0.0.1 --port 8800`
ou use o start.ps1 / start.bat desta pasta.
"""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import interp
import msr

app = FastAPI(title="INVICTA - Interpolacao de Fertilidade", version="0.1.0")

# Local: front em localhost:3100 chama este servico em 127.0.0.1:8800.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# Permite que o app publicado (HTTPS) acesse este backend LOCAL em 127.0.0.1
# (Private Network Access). Funciona no Chrome; em https->http localhost outros
# navegadores podem bloquear (use o app local ou um backend na nuvem nesse caso).
@app.middleware("http")
async def _allow_private_network(request, call_next):
    resp = await call_next(request)
    resp.headers["Access-Control-Allow-Private-Network"] = "true"
    return resp


class Ponto(BaseModel):
    lng: float
    lat: float
    valor: float


class ReqInterp(BaseModel):
    pontos: list[Ponto]
    poligono: dict[str, Any]          # GeoJSON Polygon/MultiPolygon
    dominio: list[float]              # [vmin, vmax]
    stops: list[Any]                  # [[t, [r,g,b]], ...]
    pixel_m: float = 20.0
    metodo: str = "krige"             # 'krige' (padrao) | 'idw' (explicito)
    modelo_fixo: str | None = None    # fixa o variograma (spherical/exponential/gaussian) ou None=auto


@app.get("/health")
def health():
    return {
        "ok": True,
        "pykrige": interp._HAS_PYKRIGE,
        "v": getattr(interp, "VERSION", "?"),
        "msr": msr._HAS_MSR,
        "msr_v": getattr(msr, "VERSION", "?"),
    }


@app.post("/interpolar")
def interpolar(req: ReqInterp):
    pts = [{"lng": p.lng, "lat": p.lat, "valor": p.valor} for p in req.pontos]
    try:
        return interp.interpolar(pts, req.poligono, req.dominio, req.stops, req.pixel_m, req.metodo, req.modelo_fixo)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"falha na interpolacao: {e}")


class Camada(BaseModel):
    nome: str
    b64: str                          # Float32 (norte no topo), rows*cols


class ReqZonarMulti(BaseModel):
    camadas: list[Camada]             # MAPAS JÁ INTERPOLADOS (co-registrados)
    bounds: list[float]               # [w, s, e, n] comum às camadas
    shape: list[int]                  # [rows, cols] comum às camadas
    poligono: dict[str, Any] | None = None
    n_classes: int = 0                # 0 = usar a sugestão (mín. de FPI/NCE)
    algoritmo: str = "fcm"            # 'fcm' (fuzzy c-means) | 'kmeans'
    c_min: int = 2                    # faixa p/ a curva FPI/NCE
    c_max: int = 6
    area_min_ha: float = 0.0          # 0 = sem fusão de manchas pequenas


class ReqNdvi(BaseModel):
    poligono: dict[str, Any]          # GeoJSON Polygon/MultiPolygon do talhão
    data_ini: str                     # 'YYYY-MM-DD'
    data_fim: str                     # 'YYYY-MM-DD'
    nuvem_max: float = 40.0           # % máx de cobertura de nuvem da cena
    pixel_m: float = 10.0             # resolução alvo (Sentinel-2 nativo = 10 m)


@app.post("/ndvi-sentinel")
def ndvi_sentinel(req: ReqNdvi):
    """NDVI da cena Sentinel-2 mais recente com pouca nuvem sobre o talhão
    (STAC público + COG). Devolve grid no mesmo formato da interpolação."""
    try:
        return msr.gerar_ndvi(req.poligono, req.data_ini, req.data_fim, req.nuvem_max, req.pixel_m)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"falha ao gerar NDVI: {e}")


@app.post("/zonear-multi")
def zonear_multi(req: ReqZonarMulti):
    """Zona de manejo por SIMILARIDADE: clusteriza (k-means/FCM) os mapas já
    interpolados das camadas escolhidas + índices FPI/NCE p/ o nº de zonas."""
    cams = [{"nome": c.nome, "b64": c.b64} for c in req.camadas]
    try:
        return interp.zonar_multi(cams, req.bounds, req.shape, req.n_classes, req.algoritmo, req.c_min, req.c_max, req.poligono, req.area_min_ha)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"falha ao zonear-multi: {e}")
