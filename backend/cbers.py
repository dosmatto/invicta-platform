"""MSR — fonte CBERS-4A WPM (INPE / Brazil Data Cube).

Entrega NDVI e imagem em **2 m** reaproveitando a banda PAN (BAND0, 2 m) do
produto WPM L4-DN, cujas bandas espectrais (red/nir) são 8 m:
- **NDVI 2 m**: NDVI calculado de red/nir (8 m, reamostrado) + injeção da textura
  de alta frequência da PAN no NIR (a PAN do CBERS-4A cobre 0,45–0,90 µm, segue
  a vegetação) -> realce de detalhe a 2 m. Base espectral é 8 m; o detalhe vem da PAN.
- **Imagem 2 m (cor verdadeira)**: pan-sharpening Brovey de B3/B2/B1 com a PAN.

Devolve o MESMO envelope da fonte Sentinel (msr.py): bounds + grid Float32 b64
(norte no topo) + stats + cena. Sem credenciais; cena escolhida por DATA (o CBERS
não traz `eo:cloud_cover` nos metadados).
"""
from __future__ import annotations

import base64
import math
from typing import Any

import numpy as np
from shapely.geometry import shape
import shapely

try:
    import rasterio
    from rasterio.warp import reproject, Resampling
    from rasterio.transform import from_bounds
    from pystac_client import Client
    from scipy.ndimage import gaussian_filter
    _HAS = True
except Exception:  # pragma: no cover
    _HAS = False

import msr  # reusa _clip, _png_data_url, _GDAL_ENV

VERSION = "cbers-1"
STAC_URL = "https://data.inpe.br/bdc/stac/v1"
COLECAO = "CB4A-WPM-L4-DN-1"     # BAND0=PAN 2m, B1 azul, B2 verde, B3 red 8m, B4 nir 8m
ASSET_PAN = ["BAND0"]
ASSET_BLUE = ["BAND1"]
ASSET_GREEN = ["BAND2"]
ASSET_RED = ["BAND3"]
ASSET_NIR = ["BAND4"]
MAX_CELLS = 900                  # teto p/ proteger memória/Firestore (2 m -> ~1,8 km/lado)
GANHO_PAN = 0.6                  # intensidade da injeção de detalhe da PAN no NDVI

_ENV = {**msr._GDAL_ENV, "GDAL_HTTP_TIMEOUT": "40", "GDAL_HTTP_MAX_RETRY": "2", "GDAL_HTTP_RETRY_DELAY": "1"}


def _erro_dep():
    if not _HAS:
        raise ValueError("Dependências do CBERS ausentes no backend (rasterio / pystac-client / scipy).")


def _cli() -> "Client":
    return Client.open(STAC_URL)


def _itens(geom: dict, data_ini: str, data_fim: str, limite: int = 30):
    s = _cli().search(collections=[COLECAO], intersects=geom,
                      datetime=f"{data_ini}/{data_fim}", max_items=limite)
    its = list(s.items())
    its.sort(key=lambda it: it.datetime.isoformat() if it.datetime else "", reverse=True)
    return its


def _item_por_id(cena_id: str):
    s = _cli().search(collections=[COLECAO], ids=[cena_id], max_items=1)
    its = list(s.items())
    return its[0] if its else None


def _meta(item) -> dict[str, Any]:
    cc = item.properties.get("eo:cloud_cover")
    return {
        "id": item.id,
        "data": item.datetime.date().isoformat() if item.datetime else None,
        "nuvem": round(float(cc), 1) if cc is not None else None,
        "plataforma": "CBERS-4A/WPM",
    }


def _href(item, nomes) -> str:
    low = {k.lower(): k for k in item.assets}
    for n in nomes:
        if n.lower() in low:
            return item.assets[low[n.lower()]].href
    raise ValueError(f"cena sem banda esperada ({nomes})")


def _grid_dims(minx, miny, maxx, maxy, pixel_m):
    lat0 = (miny + maxy) / 2.0
    dlat = pixel_m / 111320.0
    dlng = pixel_m / (111320.0 * max(math.cos(math.radians(lat0)), 1e-6))
    nx = min(max(int(math.ceil((maxx - minx) / dlng)), 2), MAX_CELLS)
    ny = min(max(int(math.ceil((maxy - miny) / dlat)), 2), MAX_CELLS)
    return nx, ny


def _reproj(href: str, dst_transform, nx: int, ny: int) -> np.ndarray:
    """Reprojeta a banda (COG INPE via /vsicurl) p/ a grade 4326 (linha 0 = norte)."""
    dst = np.full((ny, nx), np.nan, dtype="float32")
    with rasterio.Env(**_ENV):
        with rasterio.open(f"/vsicurl/{href}") as src:
            nod = src.nodata if src.nodata is not None else 0
            reproject(
                source=rasterio.band(src, 1), destination=dst,
                src_transform=src.transform, src_crs=src.crs, src_nodata=nod,
                dst_transform=dst_transform, dst_crs="EPSG:4326", dst_nodata=np.nan,
                resampling=Resampling.bilinear,
            )
    return dst


def listar_cenas(polygon_geojson: dict, data_ini: str, data_fim: str,
                 nuvem_max: float = 100.0) -> dict[str, Any]:
    _erro_dep()
    its = _itens(polygon_geojson, data_ini, data_fim)
    return {"cenas": [_meta(it) for it in its]}


def _selecionar(polygon_geojson, data_ini, data_fim, cena_id):
    if cena_id:
        item = _item_por_id(cena_id)
        if item is None:
            raise ValueError(f"Cena CBERS {cena_id} não encontrada.")
        return item
    its = _itens(polygon_geojson, data_ini, data_fim)
    if not its:
        raise ValueError("Nenhuma cena CBERS-4A WPM no período/área.")
    return its[0]


def gerar_ndvi(polygon_geojson: dict, data_ini: str, data_fim: str,
               nuvem_max: float = 100.0, pixel_m: float = 2.0,
               cena_id: str | None = None) -> dict[str, Any]:
    _erro_dep()
    poly = shape(polygon_geojson)
    minx, miny, maxx, maxy = poly.bounds
    item = _selecionar(polygon_geojson, data_ini, data_fim, cena_id)

    nx, ny = _grid_dims(minx, miny, maxx, maxy, pixel_m)
    dst = from_bounds(minx, miny, maxx, maxy, nx, ny)
    pan = _reproj(_href(item, ASSET_PAN), dst, nx, ny)
    red = _reproj(_href(item, ASSET_RED), dst, nx, ny)
    nir = _reproj(_href(item, ASSET_NIR), dst, nx, ny)

    valido = np.isfinite(pan) & np.isfinite(red) & np.isfinite(nir)
    # Injeta a alta frequência da PAN no NIR (escala pelos níveis médios) -> o
    # NDVI ganha o detalhe espacial de 2 m da PAN. Base espectral segue 8 m.
    p = np.where(np.isfinite(pan), pan, 0.0).astype("float32")
    plow = gaussian_filter(p, sigma=2.0)
    phigh = p - plow
    mn = float(np.nanmean(nir[valido])) if valido.any() else 1.0
    mp = float(np.nanmean(plow[valido])) if valido.any() else 1.0
    nir_s = nir + GANHO_PAN * (mn / max(mp, 1e-6)) * phigh
    den = nir_s + red
    ndvi = np.where(den != 0, (nir_s - red) / den, np.nan)
    ndvi = np.where(valido, ndvi, np.nan)
    ndvi = np.clip(ndvi, -1.0, 1.0).astype("float32")

    gx = minx + (np.arange(nx) + 0.5) * (maxx - minx) / nx
    gy = maxy - (np.arange(ny) + 0.5) * (maxy - miny) / ny
    ndvi = msr._clip(ndvi, gx, gy, poly)

    fin = ndvi[np.isfinite(ndvi)]
    b64 = base64.b64encode(ndvi.astype("float32").tobytes()).decode()
    pix = ((maxx - minx) / nx * 111320.0 * math.cos(math.radians((miny + maxy) / 2.0))
           + (maxy - miny) / ny * 111320.0) / 2.0
    return {
        "bounds": [minx, miny, maxx, maxy],
        "grid": {"b64": b64, "shape": [int(ny), int(nx)]},
        "stats": {
            "n": int(fin.size),
            "min": float(np.min(fin)) if fin.size else None,
            "max": float(np.max(fin)) if fin.size else None,
            "media": float(np.mean(fin)) if fin.size else None,
            "nx": int(nx), "ny": int(ny), "pixel_m": round(pix, 1), "indice": "NDVI",
        },
        "cena": _meta(item),
    }


def _brovey(pan, R, G, B) -> np.ndarray:
    """Pan-sharpening Brovey de RGB com a PAN + stretch 2–98% p/ 0–255 (uint8)."""
    synth = np.nanmean(np.stack([R, G, B]), axis=0)
    ratio = np.where(np.isfinite(synth) & (synth > 0), pan / synth, 1.0)
    out = np.zeros(R.shape + (3,), dtype=np.uint8)
    for i, b in enumerate([R, G, B]):
        sharp = b * ratio
        fin = sharp[np.isfinite(sharp)]
        if fin.size:
            lo, hi = np.percentile(fin, 2), np.percentile(fin, 98)
            if hi <= lo:
                hi = lo + 1.0
            esc = np.nan_to_num((sharp - lo) / (hi - lo) * 255.0, nan=0.0, posinf=255.0, neginf=0.0)
            out[..., i] = np.clip(esc, 0, 255).astype(np.uint8)
    return out


def gerar_imagem(polygon_geojson: dict, cena_id: str, pixel_m: float = 2.0) -> dict[str, Any]:
    _erro_dep()
    poly = shape(polygon_geojson)
    minx, miny, maxx, maxy = poly.bounds
    item = _item_por_id(cena_id)
    if item is None:
        raise ValueError(f"Cena CBERS {cena_id} não encontrada.")

    nx, ny = _grid_dims(minx, miny, maxx, maxy, pixel_m)
    dst = from_bounds(minx, miny, maxx, maxy, nx, ny)
    pan = _reproj(_href(item, ASSET_PAN), dst, nx, ny)
    R = _reproj(_href(item, ASSET_RED), dst, nx, ny)
    G = _reproj(_href(item, ASSET_GREEN), dst, nx, ny)
    B = _reproj(_href(item, ASSET_BLUE), dst, nx, ny)
    rgb = _brovey(pan, R, G, B)

    gx = minx + (np.arange(nx) + 0.5) * (maxx - minx) / nx
    gy = maxy - (np.arange(ny) + 0.5) * (maxy - miny) / ny
    XX, YY = np.meshgrid(gx, gy)
    dentro = shapely.contains(poly, shapely.points(XX.ravel(), YY.ravel())).reshape(XX.shape)
    valido = np.isfinite(pan) & np.isfinite(R) & dentro

    rgba = np.zeros((ny, nx, 4), dtype=np.uint8)
    rgba[..., :3] = rgb
    rgba[..., 3] = np.where(valido, 255, 0).astype(np.uint8)
    return {"bounds": [minx, miny, maxx, maxy], "png": msr._png_data_url(rgba), "cena": _meta(item)}
