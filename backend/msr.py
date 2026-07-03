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
import io
import math
from typing import Any

import numpy as np
from shapely.geometry import shape
import shapely
from PIL import Image

# Dependências do MSR carregadas com guarda: se faltarem, o backend de
# fertilidade continua de pé e o endpoint responde um erro claro.
try:
    import rasterio
    from rasterio.warp import reproject, Resampling
    from rasterio.transform import from_bounds
    from pystac_client import Client
    _HAS_MSR = True
    _ERR_MSR = ""
except Exception as _e:  # pragma: no cover
    _HAS_MSR = False
    _ERR_MSR = repr(_e)  # mostrado em /health p/ diagnosticar dep faltando no container

VERSION = "msr-2-cenas-imagem"

STAC_URL = "https://earth-search.aws.element84.com/v1"
COLECAO = "sentinel-2-l2a"
# Nomes comuns do earth-search v1; fallback p/ os ids de banda do Sentinel-2.
ASSET_RED = ["red", "B04"]
ASSET_NIR = ["nir", "B08"]
# Imagem em cor verdadeira (True Color Image): 3 bandas RGB uint8 prontas.
ASSET_VISUAL = ["visual", "TCI"]
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


def _buscar_itens(bbox, data_ini: str, data_fim: str, nuvem_max: float, limite: int = 30):
    """Cenas Sentinel-2 L2A com nuvem < limite no período (mais recentes 1º)."""
    cat = Client.open(STAC_URL)
    search = cat.search(
        collections=[COLECAO],
        bbox=list(bbox),
        datetime=f"{data_ini}/{data_fim}",
        query={"eo:cloud_cover": {"lt": float(nuvem_max)}},
        max_items=limite,
    )
    itens = list(search.items())
    itens.sort(key=lambda it: it.datetime, reverse=True)
    return itens


def _item_por_id(item_id: str):
    """Recupera UMA cena pelo id (para recalcular NDVI/imagem da cena escolhida)."""
    cat = Client.open(STAC_URL)
    search = cat.search(collections=[COLECAO], ids=[item_id], max_items=1)
    itens = list(search.items())
    return itens[0] if itens else None


def _cena_meta(item) -> dict[str, Any]:
    cloud = item.properties.get("eo:cloud_cover")
    return {
        "id": item.id,
        "data": item.datetime.date().isoformat() if item.datetime else None,
        "nuvem": round(float(cloud), 1) if cloud is not None else None,
        "plataforma": item.properties.get("platform"),
    }


def listar_cenas(polygon_geojson: dict, data_ini: str, data_fim: str,
                 nuvem_max: float = 60.0) -> dict[str, Any]:
    """Lista as cenas disponíveis (sem ler COG) p/ o usuário escolher quais ver."""
    if not _HAS_MSR:
        raise ValueError("Dependências do MSR ausentes no backend (rasterio / pystac-client).")
    poly = shape(polygon_geojson)
    itens = _buscar_itens(poly.bounds, data_ini, data_fim, nuvem_max)
    return {"cenas": [_cena_meta(it) for it in itens]}


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
    Devolve refletância (Float32, NaN onde nodata).

    NOTA: aplicamos só a escala, NÃO o offset BOA (baseline 04.00). Como o NDVI
    é uma razão, a escala se cancela e o offset apenas introduz refletância
    NEGATIVA em pixels escuros (sombra/nuvem) -> NDVI estoura acima de 1. Sem o
    offset, o NDVI fica sempre em [-1, 1] e robusto cena a cena. (Refinar com
    máscara de nuvem SCL numa fase futura.)"""
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
    dst[fin] = dst[fin] * scale
    return dst


def _clip(grid: np.ndarray, gx: np.ndarray, gy: np.ndarray, poly) -> np.ndarray:
    """NaN fora do polígono (gy pode ser descendente — só coordenadas)."""
    XX, YY = np.meshgrid(gx, gy)
    pts = shapely.points(XX.ravel(), YY.ravel())
    dentro = shapely.contains(poly, pts).reshape(XX.shape)
    return np.where(dentro, grid, np.nan)


def gerar_ndvi(polygon_geojson: dict, data_ini: str, data_fim: str,
               nuvem_max: float = 40.0, pixel_m: float = 10.0,
               cena_id: str | None = None) -> dict[str, Any]:
    if not _HAS_MSR:
        raise ValueError(
            "Dependências do MSR ausentes no backend (rasterio / pystac-client). "
            "Rode: pip install rasterio pystac-client"
        )
    poly = shape(polygon_geojson)
    minx, miny, maxx, maxy = poly.bounds

    if cena_id:
        item = _item_por_id(cena_id)
        if item is None:
            raise ValueError(f"Cena {cena_id} não encontrada.")
    else:
        itens = _buscar_itens((minx, miny, maxx, maxy), data_ini, data_fim, nuvem_max)
        item = itens[0] if itens else None
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
        "cena": _cena_meta(item),
    }


# ---------------------------------------------------------------- índices sob demanda (IV2)
# Assets do earth-search v1 por banda interna padronizada.
ASSETS_BANDA = {
    "blue": ["blue", "B02"], "green": ["green", "B03"], "red": ["red", "B04"],
    "nir": ["nir", "B08"], "rededge": ["rededge", "B05"], "swir": ["swir16", "B11"],
}
ASSET_SCL = ["scl", "SCL"]
# Classes SCL mascaradas: 0 nodata, 1 saturado, 3 sombra de nuvem, 8/9 nuvem, 10 cirrus.
SCL_RUIM = (0, 1, 3, 8, 9, 10)


def _ler_scl(item, dst_transform, nx: int, ny: int) -> np.ndarray | None:
    """Máscara booleana (True = pixel BOM) da banda SCL; None se a cena não tem."""
    try:
        href, _s, _o, _n = _asset(item, ASSET_SCL)
    except ValueError:
        return None
    dst = np.full((ny, nx), np.nan, dtype="float32")
    with rasterio.Env(**_GDAL_ENV):
        with rasterio.open(href) as src:
            reproject(
                source=rasterio.band(src, 1), destination=dst,
                src_transform=src.transform, src_crs=src.crs, src_nodata=0,
                dst_transform=dst_transform, dst_crs="EPSG:4326", dst_nodata=np.nan,
                resampling=Resampling.nearest,
            )
    cls = np.nan_to_num(dst, nan=0.0).astype("int16")
    return ~np.isin(cls, SCL_RUIM)


def gerar_indices(polygon_geojson: dict, cena_id: str, indices: list[str],
                  pixel_m: float = 10.0) -> dict[str, Any]:
    """Calcula SÓ os índices pedidos da cena escolhida: baixa apenas as bandas
    necessárias, aplica a máscara SCL (nuvem/sombra) e recorta no talhão."""
    import indices as cat
    if not _HAS_MSR:
        raise ValueError("Dependências do MSR ausentes no backend (rasterio / pystac-client).")
    if not indices:
        raise ValueError("Nenhum índice selecionado.")
    poly = shape(polygon_geojson)
    minx, miny, maxx, maxy = poly.bounds
    item = _item_por_id(cena_id)
    if item is None:
        raise ValueError(f"Cena {cena_id} não encontrada.")

    nx, ny = _grid_dims(minx, miny, maxx, maxy, pixel_m)
    dst_transform = from_bounds(minx, miny, maxx, maxy, nx, ny)

    bandas: dict[str, np.ndarray] = {}
    for nome in cat.bandas_necessarias(indices):
        assets = ASSETS_BANDA.get(nome)
        if not assets:
            raise ValueError(f"Sentinel-2 sem banda {nome}.")
        href, sc, of, nd = _asset(item, assets)
        bandas[nome] = _ler_reproj(href, sc, of, nd, dst_transform, nx, ny)

    boa = _ler_scl(item, dst_transform, nx, ny)
    if boa is not None:
        for nome in bandas:
            bandas[nome] = np.where(boa, bandas[nome], np.nan)

    gx = minx + (np.arange(nx) + 0.5) * (maxx - minx) / nx
    gy = maxy - (np.arange(ny) + 0.5) * (maxy - miny) / ny
    XX, YY = np.meshgrid(gx, gy)
    dentro = shapely.contains(poly, shapely.points(XX.ravel(), YY.ravel())).reshape(XX.shape)
    n_dentro = int(dentro.sum())

    pix_y = (maxy - miny) / ny * 111320.0
    pix_x = (maxx - minx) / nx * 111320.0 * math.cos(math.radians((miny + maxy) / 2.0))
    pix = round((pix_x + pix_y) / 2.0, 1)

    resultados: dict[str, Any] = {}
    for ind in indices:
        g = cat.calcular(ind, bandas)
        g = np.where(dentro, g, np.nan).astype("float32")
        st = cat.stats_de(g, n_dentro)
        st.update({"nx": int(nx), "ny": int(ny), "pixel_m": pix, "indice": ind})
        resultados[ind] = {
            "grid": {"b64": base64.b64encode(g.tobytes()).decode(), "shape": [int(ny), int(nx)]},
            "stats": st,
            "formula": cat.CATALOGO[ind]["formula"],
            "bandas": cat.CATALOGO[ind]["bandas"],
        }

    return {
        "bounds": [minx, miny, maxx, maxy],
        "cena": _cena_meta(item),
        "mascara": bool(boa is not None),
        "resultados": resultados,
    }


# ---------------------------------------------------------------- imagem (cor verdadeira)
def _png_data_url(rgba: np.ndarray) -> str:
    img = Image.fromarray(rgba, mode="RGBA")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def _ler_reproj_rgb(href: str, dst_transform, nx: int, ny: int) -> np.ndarray:
    """Reprojeta as 3 bandas da imagem TCI (uint8) p/ a grade 4326. (3, ny, nx)."""
    out = np.full((3, ny, nx), np.nan, dtype="float32")
    with rasterio.Env(**_GDAL_ENV):
        with rasterio.open(href) as src:
            for b in range(3):
                reproject(
                    source=rasterio.band(src, b + 1),
                    destination=out[b],
                    src_transform=src.transform,
                    src_crs=src.crs,
                    src_nodata=0,
                    dst_transform=dst_transform,
                    dst_crs="EPSG:4326",
                    dst_nodata=np.nan,
                    resampling=Resampling.bilinear,
                )
    return out


def gerar_imagem(polygon_geojson: dict, cena_id: str, pixel_m: float = 10.0) -> dict[str, Any]:
    """Imagem de satélite em COR VERDADEIRA (TCI) da cena escolhida, recortada
    no talhão, no MESMO bounds/grade do NDVI (overlay alinhado). PNG RGBA."""
    if not _HAS_MSR:
        raise ValueError("Dependências do MSR ausentes no backend (rasterio / pystac-client).")
    poly = shape(polygon_geojson)
    minx, miny, maxx, maxy = poly.bounds
    item = _item_por_id(cena_id)
    if item is None:
        raise ValueError(f"Cena {cena_id} não encontrada.")

    href, _sc, _of, _nd = _asset(item, ASSET_VISUAL)
    nx, ny = _grid_dims(minx, miny, maxx, maxy, pixel_m)
    dst_transform = from_bounds(minx, miny, maxx, maxy, nx, ny)
    rgb = _ler_reproj_rgb(href, dst_transform, nx, ny)

    gx = minx + (np.arange(nx) + 0.5) * (maxx - minx) / nx
    gy = maxy - (np.arange(ny) + 0.5) * (maxy - miny) / ny
    XX, YY = np.meshgrid(gx, gy)
    dentro = shapely.contains(poly, shapely.points(XX.ravel(), YY.ravel())).reshape(XX.shape)
    valido = np.all(np.isfinite(rgb), axis=0) & dentro

    rgba = np.zeros((ny, nx, 4), dtype=np.uint8)
    for b in range(3):
        rgba[..., b] = np.clip(np.nan_to_num(rgb[b]), 0, 255).astype(np.uint8)
    rgba[..., 3] = np.where(valido, 255, 0).astype(np.uint8)

    return {"bounds": [minx, miny, maxx, maxy], "png": _png_data_url(rgba), "cena": _cena_meta(item)}
