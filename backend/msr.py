"""MSR — Motor de Sensoriamento Remoto (NDVI por satélite).

Fase S1: busca a cena Sentinel-2 L2A mais recente com pouca nuvem sobre o
talhão (catálogo STAC público `earth-search`, sem credenciais), lê SÓ a janela
do talhão das bandas vermelho (B04) e NIR (B08) via COG, reprojeta para uma
grade geográfica (EPSG:4326) sobre o talhão, calcula o NDVI e recorta no
polígono. Devolve o MESMO envelope da interpolação de fertilidade (bounds +
grid Float32 base64 com o norte no topo + stats), para reusar todo o pipeline
de render/legenda do front. NÃO interpola nada — é leitura + álgebra de bandas.
"""
from __future__ import annotations

import base64
import math
from typing import Any

import numpy as np
from shapely.geometry import shape
import shapely

# Dependências do MSR carregadas com guarda: se faltarem, o backend de
# fertilidade continua de pé e o endpoint responde um erro claro.
try:
    import rasterio
    from rasterio.warp import reproject, Resampling
    from rasterio.transform import from_bounds
    from pystac_client import Client
    _HAS_MSR = True
except Exception:  # pragma: no cover
    _HAS_MSR = False

VERSION = "msr-1-ndvi-s1"

STAC_URL = "https://earth-search.aws.element84.com/v1"
COLECAO = "sentinel-2-l2a"
# Nomes comuns do earth-search v1; fallback p/ os ids de banda do Sentinel-2.
ASSET_RED = ["red", "B04"]
ASSET_NIR = ["nir", "B08"]
# Teto de células por lado (protege memória; NDVI nativo é 10 m).
MAX_CELLS = 800
# Config GDAL p/ ler COG remoto por range-request com eficiência.
_GDAL_ENV = dict(
    GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
    CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
    GDAL_HTTP_MULTIRANGE="YES",
    GDAL_HTTP_MERGE_CONSECUTIVE_RANGES="YES",
    VSI_CACHE="TRUE",
)


def _buscar_cena(bbox, data_ini: str, data_fim: str, nuvem_max: float):
    """Cena Sentinel-2 L2A mais RECENTE com nuvem < limite no período."""
    cat = Client.open(STAC_URL)
    search = cat.search(
        collections=[COLECAO],
        bbox=list(bbox),
        datetime=f"{data_ini}/{data_fim}",
        query={"eo:cloud_cover": {"lt": float(nuvem_max)}},
        max_items=30,
    )
    itens = list(search.items())
    if not itens:
        return None
    itens.sort(key=lambda it: it.datetime, reverse=True)
    return itens[0]


def _asset(item, nomes) -> tuple[str, float, float, Any]:
    """href + (scale, offset, nodata) do 1º asset que casar com os nomes."""
    for nome in nomes:
        a = item.assets.get(nome)
        if a is None:
            continue
        scale, offset, nodata = 1.0, 0.0, None
        bandas = (a.extra_fields or {}).get("raster:bands")
        if bandas:
            b0 = bandas[0]
            scale = float(b0.get("scale", 1.0))
            offset = float(b0.get("offset", 0.0))
            nodata = b0.get("nodata", None)
        return a.href, scale, offset, nodata
    raise ValueError(f"cena sem banda esperada ({nomes})")


def _grid_dims(minx, miny, maxx, maxy, pixel_m):
    lat0 = (miny + maxy) / 2.0
    dlat = pixel_m / 111320.0
    dlng = pixel_m / (111320.0 * max(math.cos(math.radians(lat0)), 1e-6))
    nx = min(max(int(math.ceil((maxx - minx) / dlng)), 2), MAX_CELLS)
    ny = min(max(int(math.ceil((maxy - miny) / dlat)), 2), MAX_CELLS)
    return nx, ny


def _ler_reproj(href: str, scale: float, offset: float, nodata, dst_transform, nx: int, ny: int) -> np.ndarray:
    """Lê a banda (COG remoto) e reprojeta p/ a grade 4326 (linha 0 = norte).
    Devolve refletância (Float32, NaN onde nodata)."""
    dst = np.full((ny, nx), np.nan, dtype="float32")
    with rasterio.Env(**_GDAL_ENV):
        with rasterio.open(href) as src:
            src_nodata = nodata if nodata is not None else (src.nodata if src.nodata is not None else 0)
            reproject(
                source=rasterio.band(src, 1),
                destination=dst,
                src_transform=src.transform,
                src_crs=src.crs,
                src_nodata=src_nodata,
                dst_transform=dst_transform,
                dst_crs="EPSG:4326",
                dst_nodata=np.nan,
                resampling=Resampling.bilinear,
            )
    fin = np.isfinite(dst)
    dst[fin] = dst[fin] * scale + offset
    return dst


def _clip(grid: np.ndarray, gx: np.ndarray, gy: np.ndarray, poly) -> np.ndarray:
    """NaN fora do polígono (gy pode ser descendente — só coordenadas)."""
    XX, YY = np.meshgrid(gx, gy)
    pts = shapely.points(XX.ravel(), YY.ravel())
    dentro = shapely.contains(poly, pts).reshape(XX.shape)
    return np.where(dentro, grid, np.nan)


def gerar_ndvi(polygon_geojson: dict, data_ini: str, data_fim: str,
               nuvem_max: float = 40.0, pixel_m: float = 10.0) -> dict[str, Any]:
    if not _HAS_MSR:
        raise ValueError(
            "Dependências do MSR ausentes no backend (rasterio / pystac-client). "
            "Rode: pip install rasterio pystac-client"
        )
    poly = shape(polygon_geojson)
    minx, miny, maxx, maxy = poly.bounds

    item = _buscar_cena((minx, miny, maxx, maxy), data_ini, data_fim, nuvem_max)
    if item is None:
        raise ValueError(
            f"Nenhuma cena Sentinel-2 com nuvem < {nuvem_max:.0f}% entre {data_ini} e {data_fim}. "
            "Amplie o período ou o limite de nuvem."
        )

    red_href, red_sc, red_of, red_nd = _asset(item, ASSET_RED)
    nir_href, nir_sc, nir_of, nir_nd = _asset(item, ASSET_NIR)

    nx, ny = _grid_dims(minx, miny, maxx, maxy, pixel_m)
    dst_transform = from_bounds(minx, miny, maxx, maxy, nx, ny)  # linha 0 = norte (maxy)

    red = _ler_reproj(red_href, red_sc, red_of, red_nd, dst_transform, nx, ny)
    nir = _ler_reproj(nir_href, nir_sc, nir_of, nir_nd, dst_transform, nx, ny)

    den = nir + red
    with np.errstate(invalid="ignore", divide="ignore"):
        ndvi = (nir - red) / den
    ndvi = np.where(np.isfinite(ndvi), ndvi, np.nan)
    ndvi = np.clip(ndvi, -1.0, 1.0)

    # centros das células (linha 0 = norte -> gy descendente)
    gx = minx + (np.arange(nx) + 0.5) * (maxx - minx) / nx
    gy = maxy - (np.arange(ny) + 0.5) * (maxy - miny) / ny
    ndvi = _clip(ndvi, gx, gy, poly)

    fin = ndvi[np.isfinite(ndvi)]
    grid_b64 = base64.b64encode(ndvi.astype("float32").tobytes()).decode()

    pix_y = (maxy - miny) / ny * 111320.0
    pix_x = (maxx - minx) / nx * 111320.0 * math.cos(math.radians((miny + maxy) / 2.0))
    cloud = item.properties.get("eo:cloud_cover")
    return {
        "bounds": [minx, miny, maxx, maxy],
        "grid": {"b64": grid_b64, "shape": [int(ny), int(nx)]},
        "stats": {
            "n": int(fin.size),
            "min": float(np.min(fin)) if fin.size else None,
            "max": float(np.max(fin)) if fin.size else None,
            "media": float(np.mean(fin)) if fin.size else None,
            "nx": int(nx), "ny": int(ny),
            "pixel_m": round((pix_x + pix_y) / 2.0, 1),
            "indice": "NDVI",
        },
        "cena": {
            "id": item.id,
            "data": item.datetime.date().isoformat() if item.datetime else None,
            "nuvem": round(float(cloud), 1) if cloud is not None else None,
            "plataforma": item.properties.get("platform"),
        },
    }
