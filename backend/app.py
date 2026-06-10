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

app = FastAPI(title="INVICTA - Interpolacao de Fertilidade", version="0.1.0")

# Local: front em localhost:3100 chama este servico em 127.0.0.1:8800.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


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


@app.get("/health")
def health():
    return {"ok": True, "pykrige": interp._HAS_PYKRIGE}


@app.post("/interpolar")
def interpolar(req: ReqInterp):
    pts = [{"lng": p.lng, "lat": p.lat, "valor": p.valor} for p in req.pontos]
    try:
        return interp.interpolar(pts, req.poligono, req.dominio, req.stops, req.pixel_m, req.metodo)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"falha na interpolacao: {e}")
