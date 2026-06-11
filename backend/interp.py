"""Interpolacao de fertilidade.

Krigagem ordinaria (PyKrige) com selecao automatica de modelo de variograma
(ou modelo fixo). Recorte pelo poligono do talhao e geracao de um PNG RGBA com
gradiente de cores continuo. Retorna tambem os parametros do variograma
(alcance/patamar/pepita), RMSE da validacao cruzada e o tamanho do pixel.

Coordenadas de entrada sao geograficas (lng/lat). Para a krigagem os pontos sao
projetados para um plano metrico local (equirretangular) para que o variograma
tenha distancias em metros.
"""
from __future__ import annotations

import base64
import io
import math
from typing import Any

import numpy as np
import shapely
from shapely.geometry import shape
from scipy.spatial import cKDTree
from PIL import Image

try:
    from pykrige.ok import OrdinaryKriging
    _HAS_PYKRIGE = True
except Exception:  # pragma: no cover
    _HAS_PYKRIGE = False

KRIGE_MODELS = ["spherical", "exponential", "gaussian"]
# Teto de resolucao da malha (por lado) para proteger memoria/CPU
MAX_CELLS = 500


# ---------------------------------------------------------------- projecao
def _to_local(x: np.ndarray, y: np.ndarray, lon0: float, lat0: float):
    mx = (x - lon0) * 111320.0 * math.cos(math.radians(lat0))
    my = (y - lat0) * 111320.0
    return mx, my


def _dedup(x: np.ndarray, y: np.ndarray, z: np.ndarray):
    """Pontos exatamente coincidentes quebram a krigagem; aqui sao mediados."""
    key = np.round(np.column_stack([x, y]), 7)
    uniq, inv = np.unique(key, axis=0, return_inverse=True)
    if len(uniq) == len(x):
        return x, y, z
    soma = np.zeros(len(uniq))
    cont = np.zeros(len(uniq))
    for i, g in enumerate(inv):
        soma[g] += z[i]
        cont[g] += 1
    return uniq[:, 0], uniq[:, 1], soma / cont


# ---------------------------------------------------------------- malha
def _grid_axes(minx, miny, maxx, maxy, pixel_m, lat0):
    dlat = pixel_m / 111320.0
    dlng = pixel_m / (111320.0 * max(math.cos(math.radians(lat0)), 1e-6))
    nx = min(max(int(math.ceil((maxx - minx) / dlng)) + 1, 2), MAX_CELLS)
    ny = min(max(int(math.ceil((maxy - miny) / dlat)) + 1, 2), MAX_CELLS)
    gx = np.linspace(minx, maxx, nx)
    gy = np.linspace(miny, maxy, ny)
    return gx, gy


# ---------------------------------------------------------------- krigagem
def _loo_rmse(xm, ym, z, model) -> float:
    """RMSE por leave-one-out para escolher o melhor modelo de variograma."""
    n = len(z)
    erros = []
    for i in range(n):
        m = np.ones(n, dtype=bool)
        m[i] = False
        try:
            ok = OrdinaryKriging(
                xm[m], ym[m], z[m], variogram_model=model,
                enable_plotting=False, verbose=False,
            )
            zp, _ = ok.execute("points", np.array([xm[i]]), np.array([ym[i]]))
            erros.append((float(zp[0]) - z[i]) ** 2)
        except Exception:
            return math.inf
    return math.sqrt(float(np.mean(erros))) if erros else math.inf


def _krige(xm, ym, z, gxm, gym, modelo_fixo=None):
    if modelo_fixo:
        melhor, melhor_rmse = modelo_fixo, _loo_rmse(xm, ym, z, modelo_fixo)
    else:
        melhor, melhor_rmse = None, math.inf
        for modelo in KRIGE_MODELS:
            r = _loo_rmse(xm, ym, z, modelo)
            if r < melhor_rmse:
                melhor_rmse, melhor = r, modelo
        if melhor is None:
            raise RuntimeError("nenhum modelo de variograma convergiu")
    ok = OrdinaryKriging(
        xm, ym, z, variogram_model=melhor,
        enable_plotting=False, verbose=False,
    )
    zhat, _ = ok.execute("grid", gxm, gym)  # (ny, nx) masked array
    # [psill, range, nugget] para spherical/exponential/gaussian
    params = [float(p) for p in ok.variogram_model_parameters]
    rmse = float(melhor_rmse) if math.isfinite(melhor_rmse) else None
    return np.ma.filled(np.asarray(zhat, dtype=float), np.nan), melhor, params, rmse


def _idw(xm, ym, z, gxm, gym, power=2.0, k=12):
    pts = np.column_stack([xm, ym])
    tree = cKDTree(pts)
    XX, YY = np.meshgrid(gxm, gym)
    q = np.column_stack([XX.ravel(), YY.ravel()])
    k = min(k, len(z))
    dist, idx = tree.query(q, k=k)
    if k == 1:
        dist = dist[:, None]
        idx = idx[:, None]
    dist = np.maximum(dist, 1e-9)
    w = 1.0 / (dist ** power)
    zq = np.sum(w * z[idx], axis=1) / np.sum(w, axis=1)
    exato = dist[:, 0] < 1e-6
    zq[exato] = z[idx[exato, 0]]
    return zq.reshape(YY.shape)


# ---------------------------------------------------------------- recorte
def _clip(grid: np.ndarray, gx, gy, poly) -> np.ndarray:
    XX, YY = np.meshgrid(gx, gy)
    pts = shapely.points(XX.ravel(), YY.ravel())
    dentro = shapely.contains(poly, pts).reshape(XX.shape)
    return np.where(dentro, grid, np.nan)


# ---------------------------------------------------------------- cores
def _colorize(grid: np.ndarray, dominio, stops) -> np.ndarray:
    vmin, vmax = float(dominio[0]), float(dominio[1])
    rng = (vmax - vmin) or 1.0
    t = np.clip((grid - vmin) / rng, 0.0, 1.0)
    sp = np.array([s[0] for s in stops], dtype=float)
    sr = np.array([s[1][0] for s in stops], dtype=float)
    sg = np.array([s[1][1] for s in stops], dtype=float)
    sb = np.array([s[1][2] for s in stops], dtype=float)
    R = np.nan_to_num(np.interp(t, sp, sr))
    G = np.nan_to_num(np.interp(t, sp, sg))
    B = np.nan_to_num(np.interp(t, sp, sb))
    H, W = grid.shape
    rgba = np.zeros((H, W, 4), dtype=np.uint8)
    rgba[..., 0] = R.astype(np.uint8)
    rgba[..., 1] = G.astype(np.uint8)
    rgba[..., 2] = B.astype(np.uint8)
    rgba[..., 3] = np.where(np.isfinite(grid), 255, 0).astype(np.uint8)
    return rgba


def _png_data_url(rgba: np.ndarray) -> str:
    img = Image.fromarray(rgba, mode="RGBA")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


# ---------------------------------------------------------------- entrada
def interpolar(points: list[dict], polygon_geojson: dict, dominio, stops,
               pixel_m: float = 20.0, metodo: str = "krige",
               modelo_fixo: str | None = None) -> dict[str, Any]:
    poly = shape(polygon_geojson)
    x = np.array([p["lng"] for p in points], dtype=float)
    y = np.array([p["lat"] for p in points], dtype=float)
    z = np.array([p["valor"] for p in points], dtype=float)

    ok = np.isfinite(x) & np.isfinite(y) & np.isfinite(z)
    x, y, z = x[ok], y[ok], z[ok]
    x, y, z = _dedup(x, y, z)
    if len(z) < 3:
        raise ValueError("minimo de 3 pontos validos para interpolar")

    minx, miny, maxx, maxy = poly.bounds
    lon0, lat0 = (minx + maxx) / 2.0, (miny + maxy) / 2.0
    gx, gy = _grid_axes(minx, miny, maxx, maxy, pixel_m, lat0)

    xm, ym = _to_local(x, y, lon0, lat0)
    gxm, _gy0 = _to_local(gx, np.full_like(gx, lat0), lon0, lat0)
    _gx0, gym = _to_local(np.full_like(gy, lon0), gy, lon0, lat0)

    # Metodo escolhido pelo usuario (sem troca automatica). IDW so quando pedido.
    variograma = None
    rmse = None
    if metodo == "idw":
        grid, modelo = _idw(xm, ym, z, gxm, gym), "idw"
    else:
        if not _HAS_PYKRIGE:
            raise ValueError("Krigagem indisponivel no backend.")
        try:
            grid, modelo, params, rmse = _krige(xm, ym, z, gxm, gym, modelo_fixo)
            variograma = {
                "alcance_m": round(params[1], 1),            # range (metros)
                "patamar": round(params[0] + params[2], 4),  # sill = psill + nugget
                "pepita": round(params[2], 4),               # nugget
            }
        except Exception as e:
            raise ValueError(
                f"Krigagem nao convergiu com {len(z)} pontos (colineares/insuficientes?). [{e}]"
            )

    grid = _clip(grid, gx, gy, poly)
    rgba = _colorize(grid, dominio, stops)
    rgba = rgba[::-1, :, :]  # norte no topo da imagem

    finitos = grid[np.isfinite(grid)]
    pix_x = abs(float(gxm[1] - gxm[0])) if len(gxm) > 1 else float(pixel_m)
    pix_y = abs(float(gym[1] - gym[0])) if len(gym) > 1 else float(pixel_m)
    stats = {
        "n": int(len(z)),
        "modelo": modelo,
        "min": float(np.min(finitos)) if finitos.size else None,
        "max": float(np.max(finitos)) if finitos.size else None,
        "nx": int(len(gx)),
        "ny": int(len(gy)),
        "pixel_m": round((pix_x + pix_y) / 2.0, 1),
        "rmse": round(rmse, 3) if rmse is not None else None,
        "variograma": variograma,
    }
    # Grid bruto (Float32, norte no topo p/ casar com a imagem) p/ futuras
    # derivacoes (mapa de aplicacao, exportar GeoTIFF, etc.). NaN preservado.
    grid_oriented = grid[::-1, :].astype("float32")
    grid_b64 = base64.b64encode(grid_oriented.tobytes()).decode()
    grid_meta = {"b64": grid_b64, "shape": [int(grid_oriented.shape[0]), int(grid_oriented.shape[1])]}
    return {"bounds": [minx, miny, maxx, maxy], "png": _png_data_url(rgba), "stats": stats, "grid": grid_meta}
