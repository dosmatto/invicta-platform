"""MDE + Analise Topografica Agronomica — Fase 1 (Essencial).

Busca o Modelo Digital de Elevacao da area em fontes PUBLICAS sem chave:
  - cop30: Copernicus DEM GLO-30 (COG por tile de 1 grau, bucket AWS publico)
  - srtm : NASADEM/SRTM via AWS Terrain Tiles (skadi .hgt.gz)
FABDEM (licenca so nao-comercial) e ALOS (exige chave) ficam indisponiveis
nesta fase — o modo 'auto' segue a ordem da spec pulando as indisponiveis:
cop30 -> srtm.

Regras da spec honradas aqui:
  - BUFFER antes de derivar (nunca declividade no limite seco; secao 5.2);
  - recorte final no poligono (NaN fora);
  - previa com stats + histograma + avisos de qualidade (secao 19).

Grids devolvidos no MESMO contrato do interp.py (Float32 little-endian b64,
norte no topo, NaN fora) — o /grid-geotiff exporta sem codigo novo.
"""
from __future__ import annotations

import base64
import gzip
import io
import math
import os
import tempfile
import urllib.request
from typing import Any

import numpy as np
from PIL import Image
from shapely.geometry import shape

try:
    import rasterio
    from rasterio.merge import merge as rio_merge
    from rasterio.features import geometry_mask
    from rasterio.windows import from_bounds as win_from_bounds
    _HAS_RASTERIO = True
except Exception:  # pragma: no cover
    _HAS_RASTERIO = False

# /vsicurl SEM estas opções trava: o GDAL tenta LISTAR o bucket (26k+ prefixos)
# e buscar sidecars (.ovr/.aux) — cada um vira request. Confirmado em teste:
# open sem isso não retorna; com isso, ~2 s.
_GDAL_ENV = dict(
    GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
    CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
    CPL_VSIL_CURL_USE_HEAD="NO",
    GDAL_INGESTED_BYTES_AT_OPEN="32768",
    GDAL_HTTP_MAX_RETRY="3",
    GDAL_HTTP_RETRY_DELAY="1",
)

VERSION = "mde-1-essencial"

FONTES = {
    "cop30": "Copernicus DEM GLO-30 (30 m)",
    "srtm": "NASADEM/SRTM (30 m)",
}
_PASSO = 1.0 / 3600.0          # ~30 m
_MAX_TILES = 4                 # bbox de talhao/fazenda nunca deve passar disso
_TIMEOUT = 120


# ---------------------------------------------------------------- tiles
def _tiles_1grau(w: float, s: float, e: float, n: float) -> list[tuple[int, int]]:
    """Cantos SW inteiros dos tiles de 1 grau que cobrem o bbox."""
    tiles = []
    for lat0 in range(math.floor(s), math.floor(n) + 1):
        for lng0 in range(math.floor(w), math.floor(e) + 1):
            tiles.append((lat0, lng0))
    if len(tiles) > _MAX_TILES:
        raise ValueError(f"área muito grande ({len(tiles)} tiles de 1°) — selecione um talhão/fazenda menor")
    return tiles


def _cod_latlng(lat0: int, lng0: int) -> tuple[str, str]:
    la = f"{'N' if lat0 >= 0 else 'S'}{abs(lat0):02d}"
    lo = f"{'E' if lng0 >= 0 else 'W'}{abs(lng0):03d}"
    return la, lo


def _abrir_cop30(lat0: int, lng0: int):
    la, lo = _cod_latlng(lat0, lng0)
    name = f"Copernicus_DSM_COG_10_{la}_00_{lo}_00_DEM"
    url = f"/vsicurl/https://copernicus-dem-30m.s3.amazonaws.com/{name}/{name}.tif"
    return rasterio.open(url)


def _abrir_srtm(lat0: int, lng0: int):
    """Baixa o skadi .hgt.gz e abre via driver SRTMHGT (georef vem do NOME do arquivo)."""
    la, lo = _cod_latlng(lat0, lng0)
    nome = f"{la}{lo}.hgt"
    url = f"https://s3.amazonaws.com/elevation-tiles-prod/skadi/{la}/{nome}.gz"
    req = urllib.request.Request(url, headers={"User-Agent": "invicta-mde"})
    with urllib.request.urlopen(req, timeout=_TIMEOUT) as r:
        raw = gzip.decompress(r.read())
    caminho = os.path.join(tempfile.gettempdir(), nome)
    with open(caminho, "wb") as f:
        f.write(raw)
    return rasterio.open(caminho)


def _ler_fonte(fonte: str, tiles: list[tuple[int, int]], bounds: tuple[float, float, float, float]):
    """Abre os tiles da fonte e devolve (mosaico float32 [rows,cols], transform).

    Caso comum (1 tile): leitura por JANELA boundless — poucos requests de range.
    Vários tiles (talhão na divisa): rio_merge."""
    abrir = _abrir_cop30 if fonte == "cop30" else _abrir_srtm
    dss = []
    try:
        with rasterio.Env(**_GDAL_ENV):
            for lat0, lng0 in tiles:
                dss.append(abrir(lat0, lng0))
            if len(dss) == 1:
                ds = dss[0]
                win = win_from_bounds(*bounds, transform=ds.transform)
                a = ds.read(1, window=win, boundless=True, fill_value=-32768.0).astype("float32")
                transform = ds.window_transform(win)
            else:
                arr, transform = rio_merge(dss, bounds=bounds, nodata=-32768.0)
                a = arr[0].astype("float32")
        a[a <= -30000] = np.nan
        return a, transform
    finally:
        for ds in dss:
            try:
                ds.close()
            except Exception:
                pass


# ---------------------------------------------------------------- derivados
def _derivados(elev: np.ndarray, transform, lat_c: float) -> tuple[np.ndarray, np.ndarray]:
    """Declividade (graus) + hillshade (0..255) do grid bufferizado.

    Linha 0 = norte. Passos convertidos para METROS na latitude central
    (equirretangular — suficiente na escala de talhao/fazenda, spec 24.2)."""
    px_x = abs(float(transform.a)) * 111320.0 * math.cos(math.radians(lat_c))
    px_y = abs(float(transform.e)) * 111320.0
    dz_dr, dz_dc = np.gradient(elev, px_y, px_x)   # por linha (y indice), por coluna (x)
    dz_dy = -dz_dr                                  # indice de linha cresce para o SUL
    dz_dx = dz_dc

    grad = np.hypot(dz_dx, dz_dy)
    decl_graus = np.degrees(np.arctan(grad)).astype("float32")

    # Hillshade classico (azimute 315, altitude 45)
    az, alt = math.radians(315.0), math.radians(45.0)
    slope_r = np.arctan(grad)
    aspect_r = np.arctan2(dz_dy, -dz_dx)
    hs = (math.sin(alt) * np.cos(slope_r)
          + math.cos(alt) * np.sin(slope_r) * np.cos(az - math.pi / 2.0 - aspect_r))
    hs = np.clip(hs, 0.0, 1.0)
    return decl_graus, (hs * 255.0).astype("float32")


def _png_hillshade(hs: np.ndarray, dentro: np.ndarray) -> str:
    """PNG cinza com alpha (transparente fora do poligono)."""
    g = np.nan_to_num(hs, nan=0.0).astype(np.uint8)
    a = np.where(dentro & np.isfinite(hs), 255, 0).astype(np.uint8)
    img = Image.fromarray(np.dstack([g, g, g, a]), "RGBA")
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def _b64(grid: np.ndarray) -> dict[str, Any]:
    g = grid.astype("<f4")
    return {"b64": base64.b64encode(g.tobytes()).decode(),
            "shape": [int(g.shape[0]), int(g.shape[1])]}


# ---------------------------------------------------------------- principal
def gerar_mde(poligono: dict, fonte: str = "auto", buffer_m: float = 300.0) -> dict[str, Any]:
    if not _HAS_RASTERIO:
        raise ValueError("rasterio indisponível no servidor — MDE requer rasterio")
    geom = shape(poligono)
    if geom.is_empty:
        raise ValueError("polígono vazio")
    w, s, e, n = geom.bounds
    lat_c = (s + n) / 2.0

    # buffer em graus (nunca derivar no limite seco — spec 5.2)
    bm = max(120.0, min(float(buffer_m or 300.0), 2000.0))
    dlat = bm / 111320.0
    dlng = bm / (111320.0 * max(0.2, math.cos(math.radians(lat_c))))
    bb = (w - dlng, s - dlat, e + dlng, n + dlat)

    tiles = _tiles_1grau(*bb)

    ordem = ["cop30", "srtm"] if fonte == "auto" else [fonte]
    avisos: list[str] = []
    elev = transform = usado = None
    erros: list[str] = []
    for f in ordem:
        if f not in FONTES:
            raise ValueError(f"fonte desconhecida: {f} (disponíveis: cop30, srtm; FABDEM/ALOS indisponíveis nesta fase)")
        try:
            elev, transform = _ler_fonte(f, tiles, bb)
            usado = f
            break
        except Exception as ex:  # noqa: BLE001 — tenta a próxima fonte (spec 19)
            erros.append(f"{FONTES[f]}: {ex}")
    if elev is None or usado is None:
        raise ValueError("falha ao obter o MDE — " + " | ".join(erros))
    if fonte == "auto" and usado != "cop30":
        avisos.append(f"Copernicus indisponível agora — usando {FONTES[usado]}. ({erros[0] if erros else ''})")

    # derivados no grid BUFFERIZADO
    decl, hs = _derivados(elev, transform, lat_c)

    # recorte final: janela do bbox SEM buffer + mascara do poligono
    inv = ~transform  # (lng,lat) -> (col,row)
    c0, r0 = inv * (w, n)
    c1, r1 = inv * (e, s)
    r0i, c0i = max(0, math.floor(r0)), max(0, math.floor(c0))
    r1i, c1i = min(elev.shape[0], math.ceil(r1)), min(elev.shape[1], math.ceil(c1))
    if r1i - r0i < 2 or c1i - c0i < 2:
        raise ValueError("área pequena demais para a resolução de 30 m")
    sub = (slice(r0i, r1i), slice(c0i, c1i))
    # bounds EXATOS do subgrid (bordas de pixel) — georref do overlay/GeoTIFF
    sw = transform * (c0i, r1i)
    ne = transform * (c1i, r0i)
    bounds = [float(sw[0]), float(sw[1]), float(ne[0]), float(ne[1])]

    elev_s, decl_s, hs_s = elev[sub], decl[sub], hs[sub]
    from rasterio.transform import from_bounds as _fb
    mask_t = _fb(bounds[0], bounds[1], bounds[2], bounds[3], elev_s.shape[1], elev_s.shape[0])
    dentro = geometry_mask([poligono], out_shape=elev_s.shape, transform=mask_t, invert=True)

    elev_c = np.where(dentro, elev_s, np.nan).astype("float32")
    decl_c = np.where(dentro, decl_s, np.nan).astype("float32")

    fin = elev_c[np.isfinite(elev_c)]
    n_dentro = int(dentro.sum())
    if fin.size == 0:
        raise ValueError("nenhum pixel de elevação dentro do polígono (verifique o limite)")
    alt_min, alt_max = float(np.min(fin)), float(np.max(fin))
    amplitude = alt_max - alt_min
    dfin = decl_c[np.isfinite(decl_c)]

    # avisos de qualidade (spec 19)
    pct_nan = 100.0 * (1.0 - fin.size / max(1, n_dentro))
    if pct_nan > 2.0:
        avisos.append(f"{pct_nan:.0f}% da área sem dados na fonte — interprete com cautela.")
    if n_dentro < 60:
        avisos.append("Talhão pequeno para 30 m de resolução — o MDE global dá visão geral, não detalhe.")
    if amplitude < 2.0:
        avisos.append("Variação altimétrica muito baixa — relevo praticamente plano.")
    if amplitude > 400.0:
        avisos.append("Amplitude muito alta para um talhão — confira o limite e compare com outra fonte.")

    # histograma (24 faixas)
    counts, _ = np.histogram(fin, bins=24, range=(alt_min, alt_max if amplitude > 0 else alt_min + 1.0))

    return {
        "fonte": usado,
        "rotulo": FONTES[usado],
        "resolucao_m": 30,
        "bounds": bounds,
        "shape": [int(elev_c.shape[0]), int(elev_c.shape[1])],
        "elevacao": _b64(elev_c),
        "declividade": _b64(decl_c),
        "hillshade_png": _png_hillshade(hs_s, dentro),
        "stats": {
            "alt_min": round(alt_min, 1), "alt_med": round(float(np.mean(fin)), 1),
            "alt_max": round(alt_max, 1), "amplitude": round(amplitude, 1),
            "decl_media": round(float(np.mean(dfin)), 1) if dfin.size else None,
            "decl_max": round(float(np.max(dfin)), 1) if dfin.size else None,
            "pct_sem_dados": round(pct_nan, 1),
            "n_px": n_dentro,
        },
        "histograma": {"ini": round(alt_min, 1), "fim": round(alt_max, 1), "counts": [int(c) for c in counts]},
        "avisos": avisos,
    }
