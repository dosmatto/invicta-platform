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
from shapely.geometry import shape, mapping
from scipy.spatial import cKDTree
from scipy.cluster.vq import kmeans2
from scipy import ndimage
from PIL import Image

try:
    from pykrige.ok import OrdinaryKriging
    _HAS_PYKRIGE = True
except Exception:  # pragma: no cover
    _HAS_PYKRIGE = False

KRIGE_MODELS = ["spherical", "exponential", "gaussian"]
# Teto de resolucao da malha (por lado) para proteger memoria/CPU. 400 (era 500):
# a 2 m em talhoes grandes a grade 500x500 estourava a memoria do plano do Render
# (512 MB) e derrubava o container; 400x400 (~160k celulas) cabe com folga. Em
# talhao muito grande o pixel fino vira automaticamente um pouco mais grosso (sem
# travar); talhoes normais nao chegam nesse teto.
MAX_CELLS = 400
# Fracao minima de patamar parcial (psill/sill) para o variograma ser considerado
# COM estrutura. Abaixo disso = pepita ~= patamar (ruido puro) -> krigagem prediz
# a media em todo lugar -> mapa uniforme. Nesse caso caimos para IDW.
ESTRUTURA_MIN = 0.10
# Se o raster krigado variar menos que esta fracao da amplitude dos dados, ele
# esta "plano demais" (nao honra os pontos) -> cai para IDW. Detecta o mapa
# uniforme DIRETO pela saida, independente dos parametros do variograma.
AMPLITUDE_MIN = 0.30
# Teto do efeito pepita na krigagem (fracao do patamar). Pepita alta = krigagem
# alisa demais e ignora os extremos (pontos baixos viram a media da vizinhanca).
# Capando a pepita, a krigagem passa mais perto dos pontos (honra as amostras) —
# mantendo o alcance/modelo que o auto-ajuste encontrou. Decisao do usuario:
# mapa de fertilidade deve bater com os pontos.
NUGGET_MAX = 0.10
# Versao do motor de interpolacao (conferir em GET /health para saber se o
# backend foi reiniciado com o codigo novo).
VERSION = "interp-20-contorno-oficial"


def _nlags(n: int) -> int:
    """Numero de lags do variograma proporcional aos pontos (entre 6 e 12)."""
    return max(6, min(12, n // 8))


def _espacamento_mediano(xm: np.ndarray, ym: np.ndarray) -> float:
    """Distancia mediana ao vizinho mais proximo (m). Serve de piso p/ o alcance:
    alcance menor que isso = sem correlacao na escala amostrada."""
    if len(xm) < 2:
        return 0.0
    tree = cKDTree(np.column_stack([xm, ym]))
    d, _ = tree.query(np.column_stack([xm, ym]), k=2)
    return float(np.median(d[:, 1]))


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
def _loo_rmse(xm, ym, z, model, cv_max: int = 120, seed: int = 0) -> float:
    """RMSE por leave-one-out para escolher o melhor modelo de variograma.
    Custo O(N^4) (N krigagens de N pontos) -> inviavel com muitos pontos (EC binado).
    Acima de cv_max, avalia numa AMOSTRA aleatoria (escolher o modelo nao precisa de
    todos os pontos); o mapa final usa todos. Mantem fertilidade (N pequeno) igual."""
    n = len(z)
    if n > cv_max:
        idx = np.random.default_rng(seed).choice(n, cv_max, replace=False)
        xm, ym, z = xm[idx], ym[idx], z[idx]
        n = cv_max
    erros = []
    for i in range(n):
        m = np.ones(n, dtype=bool)
        m[i] = False
        try:
            ok = OrdinaryKriging(
                xm[m], ym[m], z[m], variogram_model=model,
                nlags=_nlags(int(m.sum())), weight=True, pseudo_inv=True,
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
        nlags=_nlags(len(z)), weight=True, pseudo_inv=True,
        enable_plotting=False, verbose=False,
    )
    zhat, _ = ok.execute("grid", gxm, gym)  # (ny, nx) masked array
    # [psill, range, nugget] para spherical/exponential/gaussian
    params = [float(p) for p in ok.variogram_model_parameters]
    rmse = float(melhor_rmse) if math.isfinite(melhor_rmse) else None
    return np.ma.filled(np.asarray(zhat, dtype=float), np.nan), melhor, params, rmse


def _krige_fixo(xm, ym, z, gxm, gym, modelo, psill, rng, nugget):
    """Krigagem ordinaria com variograma FIXO (psill, alcance, pepita)."""
    ok = OrdinaryKriging(
        xm, ym, z, variogram_model=modelo,
        variogram_parameters=[float(psill), float(rng), float(nugget)], pseudo_inv=True,
        enable_plotting=False, verbose=False,
    )
    zhat, _ = ok.execute("grid", gxm, gym)
    return np.ma.filled(np.asarray(zhat, dtype=float), np.nan), [float(psill), float(rng), float(nugget)]


def _krige_manual(xm, ym, z, gxm, gym, modelo, psill, rng, nugget,
                  vizinhos=None, aniso_ratio=1.0, aniso_angle=0.0):
    """Krigagem com variograma 100% MANUAL (C2.b): patamar/alcance/pepita
    explicitos + nº de vizinhos (n_closest_points) + anisotropia (razao/angulo).
    O usuario manda os parametros; nao ha auto-ajuste nem anti-degeneracao."""
    kw = {}
    try:
        r = float(aniso_ratio or 1.0)
        if r and r != 1.0:
            kw["anisotropy_scaling"] = r
            kw["anisotropy_angle"] = float(aniso_angle or 0.0)
    except (TypeError, ValueError):
        pass
    ok = OrdinaryKriging(
        xm, ym, z, variogram_model=modelo,
        variogram_parameters=[float(psill), float(rng), float(nugget)],
        pseudo_inv=True, enable_plotting=False, verbose=False, **kw,
    )
    ex = {}
    try:
        nv = int(vizinhos) if vizinhos else 0
        if 0 < nv < len(z):
            ex["n_closest_points"] = nv
            ex["backend"] = "loop"   # n_closest_points exige o backend 'loop'
    except (TypeError, ValueError):
        pass
    zhat, _ = ok.execute("grid", gxm, gym, **ex)
    return np.ma.filled(np.asarray(zhat, dtype=float), np.nan), [float(psill), float(rng), float(nugget)]


def _krige_constrangido(xm, ym, z, gxm, gym, modelo, spacing):
    """Krigagem com variograma SENSATO fixo, para quando o auto-ajuste degenera
    (pepita ~= patamar / alcance < espacamento -> krige preve a media -> mapa
    uniforme). Em vez de cair para IDW (que o usuario nao quer em fertilidade),
    forca um variograma que honra os pontos e varia: patamar = variancia dos
    dados, alcance = ~3x o espacamento das amostras, pepita pequena (10%)."""
    var = float(np.var(z)) or 1.0
    return _krige_fixo(xm, ym, z, gxm, gym, modelo, var, max(3.0 * spacing, 1.0), 0.10 * var)


def _amplitude_no_poligono(grid: np.ndarray, gx, gy, poly) -> float:
    """Amplitude (max-min) do raster considerando apenas o interior do talhao."""
    gc = _clip(grid, gx, gy, poly)
    fin = gc[np.isfinite(gc)]
    return float(fin.max() - fin.min()) if fin.size else 0.0


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


# ---------------------------------------------------------------- grid bruto
def gerar_grid(points: list[dict], polygon_geojson: dict, pixel_m: float = 20.0,
               metodo: str = "krige", modelo_fixo: str | None = None,
               variograma_manual: dict | None = None) -> dict[str, Any]:
    """Interpola UM atributo e devolve o grid bruto recortado + eixos geograficos.
    Reusado por interpolar() (que colore) e por zonar() (que classifica e vetoriza).
    O grid devolvido NAO esta invertido (grid[j, i] <-> gx[i], gy[j], gy ascendente).
    """
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
            man = variograma_manual if isinstance(variograma_manual, dict) else None
            if man and man.get("alcance"):
                # VARIOGRAMA MANUAL (C2.b): o usuario manda patamar/alcance/pepita
                # + vizinhos + anisotropia. Sem auto-ajuste nem anti-degeneracao.
                modelo = str(modelo_fixo or man.get("modelo") or "spherical")
                patamar = float(man.get("patamar") or 0.0) or (float(np.var(z)) or 1.0)
                pepita = max(0.0, min(float(man.get("pepita") or 0.0), patamar * 0.99))
                alcance = float(man["alcance"])
                psill = max(patamar - pepita, 1e-9)
                grid, params = _krige_manual(
                    xm, ym, z, gxm, gym, modelo, psill, alcance, pepita,
                    man.get("vizinhos"), man.get("aniso_ratio", 1.0), man.get("aniso_angle", 0.0),
                )
                rmse = None
                variograma = {"alcance_m": round(alcance, 1), "patamar": round(patamar, 4), "pepita": round(pepita, 4), "manual": True}
            else:
                grid, modelo, params, rmse = _krige(xm, ym, z, gxm, gym, modelo_fixo)
                psill, alcance, pepita = params[0], params[1], params[2]
                patamar = psill + pepita
                variograma = {
                    "alcance_m": round(alcance, 1),  # range (metros)
                    "patamar": round(patamar, 4),    # sill = psill + nugget
                    "pepita": round(pepita, 4),      # nugget
                }
                # Guarda anti-degeneracao: variograma com pepita ~= patamar (sem
                # estrutura) ou alcance < espacamento das amostras => krigagem prediz
                # a MEDIA em todo lugar (mapa uniforme que ignora os pontos). Nesse
                # caso cai para IDW (interpolador exato, honra os pontos) e SINALIZA
                # via modelo="idw". So no modo automatico (respeita modelo forcado).
                espacamento = _espacamento_mediano(xm, ym)
                estrutura = (psill / patamar) if patamar > 0 else 0.0
                amp_dados = float(np.max(z) - np.min(z)) or 1.0
                amp_krige = _amplitude_no_poligono(grid, gx, gy, poly)
                degenerada = (estrutura < ESTRUTURA_MIN) or (alcance < espacamento) or (amp_krige < AMPLITUDE_MIN * amp_dados)
                if degenerada and not modelo_fixo:
                    # Auto-ajuste degenerou (krige -> media -> mapa uniforme). Refaz a
                    # KRIGAGEM com um variograma plausivel (honra os pontos e varia),
                    # em vez de cair para IDW (que o usuario nao quer em fertilidade).
                    grid2, params2 = _krige_constrangido(xm, ym, z, gxm, gym, modelo, espacamento)
                    amp2 = _amplitude_no_poligono(grid2, gx, gy, poly)
                    if amp2 >= AMPLITUDE_MIN * amp_dados:
                        grid, params, rmse = grid2, params2, None
                        variograma = {
                            "alcance_m": round(params2[1], 1),
                            "patamar": round(params2[0] + params2[2], 4),
                            "pepita": round(params2[2], 4),
                            "ajustado": True,  # variograma plausivel (auto-ajuste tinha degenerado)
                        }
                    else:
                        # Nem o variograma plausivel variou (dados praticamente constantes) -> IDW.
                        grid = _idw(xm, ym, z, gxm, gym)
                        modelo = "idw"
                        rmse = None
                        variograma = None
                elif (not modelo_fixo) and (pepita > NUGGET_MAX * patamar):
                    # Tem estrutura, mas a pepita alta faz a krigagem ALISAR demais
                    # (os extremos viram a media da vizinhanca -> o mapa nao bate com
                    # os pontos). Capa a pepita mantendo alcance/modelo -> a krigagem
                    # passa mais perto dos pontos (honra as amostras). Continua krigagem.
                    nugget_cap = NUGGET_MAX * patamar
                    grid, params2 = _krige_fixo(xm, ym, z, gxm, gym, modelo, patamar - nugget_cap, alcance, nugget_cap)
                    params, rmse = params2, None
                    variograma = {
                        "alcance_m": round(params2[1], 1),
                        "patamar": round(params2[0] + params2[2], 4),
                        "pepita": round(params2[2], 4),
                        "ajustado": True,
                    }
        except Exception as e:
            raise ValueError(
                f"Krigagem nao convergiu com {len(z)} pontos (colineares/insuficientes?). [{e}]"
            )

    grid = _clip(grid, gx, gy, poly)
    return {
        "grid": grid, "gx": gx, "gy": gy, "bounds": [minx, miny, maxx, maxy],
        "modelo": modelo, "rmse": rmse, "variograma": variograma,
        "lon0": lon0, "lat0": lat0, "n": int(len(z)),
    }


# ---------------------------------------------------------------- entrada
def interpolar(points: list[dict], polygon_geojson: dict, dominio, stops,
               pixel_m: float = 20.0, metodo: str = "krige",
               modelo_fixo: str | None = None,
               variograma_manual: dict | None = None) -> dict[str, Any]:
    g = gerar_grid(points, polygon_geojson, pixel_m, metodo, modelo_fixo, variograma_manual)
    grid, gx, gy = g["grid"], g["gx"], g["gy"]

    rgba = _colorize(grid, dominio, stops)
    rgba = rgba[::-1, :, :]  # norte no topo da imagem

    finitos = grid[np.isfinite(grid)]
    gxm, _ = _to_local(gx, np.full_like(gx, g["lat0"]), g["lon0"], g["lat0"])
    _, gym = _to_local(np.full_like(gy, g["lon0"]), gy, g["lon0"], g["lat0"])
    pix_x = abs(float(gxm[1] - gxm[0])) if len(gxm) > 1 else float(pixel_m)
    pix_y = abs(float(gym[1] - gym[0])) if len(gym) > 1 else float(pixel_m)
    stats = {
        "n": g["n"],
        "modelo": g["modelo"],
        "min": float(np.min(finitos)) if finitos.size else None,
        "max": float(np.max(finitos)) if finitos.size else None,
        "nx": int(len(gx)),
        "ny": int(len(gy)),
        "pixel_m": round((pix_x + pix_y) / 2.0, 1),
        "rmse": round(g["rmse"], 3) if g["rmse"] is not None else None,
        "variograma": g["variograma"],
    }
    # Grid bruto (Float32, norte no topo p/ casar com a imagem) p/ futuras
    # derivacoes (mapa de aplicacao, exportar GeoTIFF, etc.). NaN preservado.
    grid_oriented = grid[::-1, :].astype("float32")
    grid_b64 = base64.b64encode(grid_oriented.tobytes()).decode()
    grid_meta = {"b64": grid_b64, "shape": [int(grid_oriented.shape[0]), int(grid_oriented.shape[1])]}
    return {"bounds": g["bounds"], "png": _png_data_url(rgba), "stats": stats, "grid": grid_meta}


def grid_para_geotiff(grid_b64: str, shape: list[int], bounds: list[float]) -> bytes:
    """Embrulha um grid JA calculado (Float32, norte no topo, como o `grid` de
    `gerar_interp`) num GeoTIFF EPSG:4326 de 1 banda. Reaproveita o raster exibido
    (nao reinterpola) => o arquivo baixado e identico ao mapa na tela.

    NaN (fora do poligono) vira nodata=-9999 (os valores de CEa/atributos sao
    positivos e pequenos, nunca colidem). Compressao deflate. Bytes prontos p/ download."""
    import rasterio  # pesado (GDAL) — import tardio p/ nao onerar a subida do servico
    from rasterio.io import MemoryFile
    from rasterio.transform import from_bounds

    rows, cols = int(shape[0]), int(shape[1])
    arr = np.frombuffer(base64.b64decode(grid_b64), dtype="<f4").astype("float32")
    if arr.size != rows * cols:
        raise ValueError(f"grid nao corresponde ao shape: {arr.size} != {rows}x{cols}")
    arr = arr.reshape(rows, cols)  # linha 0 = norte (casa com o grid orientado)

    w, s, e, n = (float(x) for x in bounds)
    NODATA = -9999.0
    out = np.where(np.isfinite(arr), arr, NODATA).astype("float32")
    transform = from_bounds(w, s, e, n, cols, rows)  # row 0 no norte
    with MemoryFile() as mem:
        with mem.open(driver="GTiff", height=rows, width=cols, count=1,
                      dtype="float32", crs="EPSG:4326", transform=transform,
                      nodata=NODATA, compress="deflate") as ds:
            ds.write(out, 1)
        return mem.read()


# ---------------------------------------------------------------- zoneamento
# Rotulos no vocabulario do semaforo (lib/zonas.ts do front colore por eles).
# Classe "01" = maiores valores do atributo = "Alta".
ZONE_LABELS = {
    2: ["Alta", "Baixa"],
    3: ["Alta", "Média", "Baixa"],
    4: ["Alta", "Média-alta", "Média-baixa", "Baixa"],
    5: ["Alta", "Média-alta", "Média", "Média-baixa", "Baixa"],
}


def _rotulos(n: int) -> list[str]:
    return ZONE_LABELS.get(n, [f"Classe {i + 1}" for i in range(n)])


def _area_ha(geom, lon0: float, lat0: float) -> float:
    """Area em hectares: projeta a geometria (lng/lat) p/ metros locais e mede."""
    def _proj(coords):
        mx, my = _to_local(coords[:, 0], coords[:, 1], lon0, lat0)
        return np.column_stack([mx, my])
    return float(shapely.transform(geom, _proj).area) / 10000.0


# ---------------------------------------------------------------- zoneamento multi-camada
# Zona de manejo por SIMILARIDADE (clusterização) sobre MAPAS JÁ INTERPOLADOS
# (não interpola). Empilha as camadas escolhidas -> cada pixel é um vetor ->
# agrupa pixels parecidos (k-means OU fuzzy c-means). O nº ótimo de zonas é
# escolhido pelos índices FPI/NCE (Fridgen/MZA), calculados via FCM por nº de
# classes. FCM/FPI/NCE reimplementados em numpy (referência: SmartMapPlugin).

def _decode_grid_b64(b64: str, rows: int, cols: int) -> np.ndarray:
    """base64 Float32 (norte no topo) -> grid 2D canônico (gy ascendente)."""
    a = np.frombuffer(base64.b64decode(b64), dtype="<f4").astype(float)
    if a.size != rows * cols:
        raise ValueError(f"camada com {a.size} células != {rows}x{cols}")
    return a.reshape(rows, cols)[::-1]  # desfaz o flip de orientação do interpolador


def _normalizar_colunas(X: np.ndarray) -> np.ndarray:
    """z-score por coluna (camada) p/ as camadas entrarem com peso comparável."""
    mu = X.mean(axis=0)
    sd = X.std(axis=0)
    sd[sd == 0] = 1.0
    return (X - mu) / sd


def _fcm(X: np.ndarray, c: int, m: float = 2.0, max_iter: int = 150, tol: float = 1e-5, seed: int = 0):
    """Fuzzy c-means (numpy). Devolve a matriz de pertinência U (n, c).

    Distância euclidiana calculada por PRODUTO DE MATRIZ (BLAS) via a identidade
    ||x-μ||² = ||x||² + ||μ||² - 2·x·μ, em vez do tensor (n, c, L) que a versão
    anterior materializava a cada iteração (custo de tempo/memória que deixava o
    'gerar zonas' lento). Resultado idêntico."""
    rng = np.random.default_rng(seed)
    n = X.shape[0]
    U = rng.random((n, c))
    U /= U.sum(axis=1, keepdims=True)
    p = 2.0 / (m - 1.0)
    x2 = np.einsum("ij,ij->i", X, X)[:, None]        # (n,1) = ||x||²
    centers = np.zeros((c, X.shape[1]))
    for _ in range(max_iter):
        Um = U ** m
        centers = (Um.T @ X) / Um.sum(axis=0)[:, None]
        c2 = np.einsum("ij,ij->i", centers, centers)[None, :]   # (1,c) = ||μ||²
        d2 = x2 + c2 - 2.0 * (X @ centers.T)                    # (n,c) = dist²
        d = np.fmax(np.sqrt(np.fmax(d2, 0.0)), 1e-10)
        inv = d ** (-p)
        Unew = inv / inv.sum(axis=1, keepdims=True)
        if np.linalg.norm(Unew - U) < tol:
            U = Unew
            break
        U = Unew
    return U, centers


def _fpi_nce(U: np.ndarray):
    """Índices do MZA (Fridgen et al. 2004). Mínimos = nº ótimo de zonas.
    FPI = 1 - (c*F - 1)/(c - 1), F = coef. de partição = (1/n) ΣΣ u².
    NCE = H / ln(c), H = entropia de partição = -(1/n) ΣΣ u·ln(u)."""
    n, c = U.shape
    if c < 2:
        return 1.0, 1.0
    F = float(np.sum(U ** 2) / n)
    H = float(-np.sum(U * np.log(np.clip(U, 1e-12, 1.0))) / n)
    fpi = 1.0 - (c * F - 1.0) / (c - 1.0)
    nce = H / math.log(c)
    return fpi, nce


def _kmeans_labels(X: np.ndarray, c: int, seed: int = 0) -> np.ndarray:
    try:
        _, labels = kmeans2(X, c, minit="++", seed=seed, missing="warn")
    except Exception:
        _, labels = kmeans2(X, c, minit="points", seed=seed, missing="warn")
    return np.asarray(labels, dtype=int)


# Símbolos que servem de "potencial" para a SUGESTÃO de ordenação Alta->Baixa
# (produtividade/NDVI/MO/CTC). Os nomes das camadas chegam como "MO 0-20" etc.
RANK_SIMBOLOS = {"PRODUTIVIDADE", "PROD", "COLHEITA", "NDVI", "MO", "CTC"}


def _sieve_labels(cls: np.ndarray, finite: np.ndarray, min_cells: int) -> np.ndarray:
    """Area minima: funde as componentes conexas menores que `min_cells` a zona
    vizinha majoritaria (filtro 'sieve', estilo gdal_sieve). Itera ate estabilizar."""
    cls = cls.copy()
    st = ndimage.generate_binary_structure(2, 1)  # 4-conectividade
    for _ in range(60):
        mudou = False
        for k in [int(v) for v in np.unique(cls[finite]) if v >= 0]:
            comp, ncomp = ndimage.label(cls == k, structure=st)
            if ncomp == 0:
                continue
            tam = np.bincount(comp.ravel())
            for ci in range(1, ncomp + 1):
                if tam[ci] >= min_cells:
                    continue
                cells = comp == ci
                borda = ndimage.binary_dilation(cells, structure=st) & ~cells & finite
                viz = cls[borda]
                viz = viz[(viz >= 0) & (viz != k)]
                if viz.size:
                    cls[cells] = int(np.bincount(viz).argmax())
                    mudou = True
        if not mudou:
            break
    return cls


# Revisão 13.00A: o fluxo é Configurar → ANALISAR → Decidir → GERAR → Avaliar.
# analisar_multi() = ETAPA 1 (só FPI/NCE 2..12 + sugestão; não vetoriza).
# gerar_multi()    = ETAPA 2 (clusteriza o nº ESCOLHIDO + área mínima + vetoriza).
# Pesos por camada entram em _stack_xn (escala as colunas z-score).

def _stack_xn(camadas, rows, cols, pesos):
    if not camadas:
        raise ValueError("nenhuma camada selecionada")
    stack = np.stack([_decode_grid_b64(cam["b64"], rows, cols) for cam in camadas], axis=0)  # (L, rows, cols)
    finite = np.all(np.isfinite(stack), axis=0)  # pixels válidos em TODAS as camadas
    idx = np.argwhere(finite)  # (n_pix, 2) -> [j, i]
    X = stack[:, finite].T  # (n_pix, L)
    Xn = _normalizar_colunas(X)
    if pesos:  # peso 2 = a camada conta o dobro na distância
        wgt = np.array([float(p) for p in pesos], dtype=float)
        if wgt.size == Xn.shape[1] and np.all(np.isfinite(wgt)):
            Xn = Xn * np.clip(wgt, 0.0, None)
    return stack, finite, idx, Xn


def _sugestao_zonas(indices):
    """nº sugerido (mínimo de FPI+NCE normalizados) + confiança (gap p/ o 2º) + justificativa."""
    if not indices:
        return None, 0, ""
    fs = np.array([d["fpi"] for d in indices]); ns = np.array([d["nce"] for d in indices])
    def _norm(a):
        r = a.max() - a.min()
        return (a - a.min()) / r if r > 0 else a * 0.0
    score = _norm(fs) + _norm(ns)
    best = int(indices[int(np.argmin(score))]["c"])
    conf = 60
    if len(score) > 1:
        ss = np.sort(score)
        rng = (float(score.max()) - float(score.min())) or 1.0
        conf = max(5, min(99, int(round(100.0 * (ss[1] - ss[0]) / rng))))
    return best, conf, "menor desorganização (NCE) e maior organização estatística (FPI) das classes"


def analisar_multi(camadas: list[dict], bounds, dims, algoritmo: str = "fcm",
                   c_min: int = 2, c_max: int = 12, polygon_geojson: dict | None = None,
                   pesos: list | None = None, seed: int = 0) -> dict[str, Any]:
    """ETAPA 1 — Analisar: FPI/NCE para 2..c_max + sugestão. Não gera nem vetoriza zonas."""
    rows, cols = int(dims[0]), int(dims[1])
    _stack, _finite, idx, Xn = _stack_xn(camadas, rows, cols, pesos)
    n_pix = idx.shape[0]
    if n_pix < max(int(c_max), 3):
        raise ValueError("pixels insuficientes (camadas com pouca sobreposição válida)")
    # A escolha do nº de zonas (curva FPI/NCE) não precisa de TODOS os pixels nem da
    # convergência total do FCM — uma amostra representativa + menos iterações dão a
    # MESMA curva e rodam muito mais rápido. A GERAÇÃO final (gerar_multi) segue com
    # todos os pixels e convergência plena.
    CAP_ANALISAR = 4000
    Xa = Xn
    if n_pix > CAP_ANALISAR:
        samp = np.random.default_rng(seed).choice(n_pix, CAP_ANALISAR, replace=False)
        Xa = Xn[samp]
    indices = []
    ca = max(2, int(c_min)); cb = max(ca, int(c_max))
    for c in range(ca, cb + 1):
        if Xa.shape[0] <= c:
            break
        U, _ = _fcm(Xa, c, max_iter=60, seed=seed)
        fpi, nce = _fpi_nce(U)
        indices.append({"c": c, "fpi": round(fpi, 4), "nce": round(nce, 4)})
    sug, conf, just = _sugestao_zonas(indices)
    return {
        "indices": indices, "sugestao_c": sug, "confianca": conf, "justificativa": just,
        "stats": {"algoritmo": algoritmo, "n_pixels": int(n_pix), "n_camadas": len(camadas)},
    }


def gerar_multi(camadas: list[dict], bounds, dims, n_classes: int,
                algoritmo: str = "fcm", polygon_geojson: dict | None = None,
                area_min_ha: float = 0.0, pesos: list | None = None,
                seed: int = 0) -> dict[str, Any]:
    """ETAPA 2 — Gerar: clusteriza com o nº ESCOLHIDO + área mínima + vetoriza (identidade única)."""
    rows, cols = int(dims[0]), int(dims[1])
    w, s, e, n = [float(v) for v in bounds]
    lon0, lat0 = (w + e) / 2.0, (s + n) / 2.0

    _stack, finite, idx, Xn = _stack_xn(camadas, rows, cols, pesos)
    if idx.shape[0] < 3:
        raise ValueError("pixels insuficientes (camadas com pouca sobreposição válida)")

    c_sel = int(n_classes) if int(n_classes) >= 2 else 3
    c_sel = min(c_sel, idx.shape[0])

    if algoritmo == "kmeans":
        labels = _kmeans_labels(Xn, c_sel, seed=seed)
    else:
        U, _ = _fcm(Xn, c_sel, seed=seed)
        labels = np.argmax(U, axis=1)

    cls = np.full((rows, cols), -1, dtype=int)
    cls[idx[:, 0], idx[:, 1]] = labels

    # Área mínima de zona: funde manchas menores que o limiar à zona vizinha.
    if area_min_ha and area_min_ha > 0:
        dx_m = abs((e - w) / max(cols - 1, 1)) * 111320.0 * math.cos(math.radians(lat0))
        dy_m = abs((n - s) / max(rows - 1, 1)) * 111320.0
        cell_ha = (dx_m * dy_m) / 10000.0
        min_cells = int(math.ceil(area_min_ha / cell_ha)) if cell_ha > 0 else 0
        if min_cells > 1:
            cls = _sieve_labels(cls, finite, min_cells)

    # Ordenação Alta->Baixa (SUGESTÃO): por variáveis de potencial
    # (produtividade/NDVI/MO/CTC) entre as camadas escolhidas; senão, pelo
    # composto (média das camadas). O usuário pode reordenar manualmente no front.
    labels_final = cls[idx[:, 0], idx[:, 1]]
    rank_cols = [i for i, cam in enumerate(camadas) if str(cam.get("nome", "")).split(" ")[0].upper() in RANK_SIMBOLOS]
    pot = Xn[:, rank_cols].mean(axis=1) if rank_cols else Xn.mean(axis=1)
    presentes = [int(k) for k in np.unique(labels_final) if k >= 0]
    presentes.sort(key=lambda k: float(pot[labels_final == k].mean()) if np.any(labels_final == k) else -1e18, reverse=True)
    rotulos = _rotulos(len(presentes))
    ordem_por = ", ".join(str(camadas[i].get("nome", "")).split(" ")[0] for i in rank_cols) if rank_cols else "composto"

    poly = shape(polygon_geojson) if polygon_geojson else None
    dx = float((e - w) / (cols - 1)) if cols > 1 else (e - w)
    dy = float((n - s) / (rows - 1)) if rows > 1 else (n - s)
    # Arestas EXATAS das células (linspace) -> quadrados vizinhos compartilham a
    # mesma coordenada de aresta. Sem isso (centros ± mediana/2) a união do GEOS
    # deixava costuras/noding (linhas internas espúrias) que fragmentavam a zona.
    ex = np.linspace(w - dx / 2.0, e + dx / 2.0, cols + 1)
    ey = np.linspace(s - dy / 2.0, n + dy / 2.0, rows + 1)
    grid_snap = min(dx, dy) / 100.0

    por_rank = []  # (rank, geometria da classe na malha) — cobertura exata, sem sobreposição
    for r, k in enumerate(presentes):
        jj, ii = np.where(cls == k)
        if jj.size == 0:
            continue
        boxes = shapely.box(ex[ii], ey[jj], ex[ii + 1], ey[jj + 1])
        geom = shapely.union_all(boxes, grid_size=grid_snap)
        if not geom.is_empty:
            por_rank.append((r, geom))

    # LIMITE EXTERNO = POLÍGONO OFICIAL DO TALHÃO. O raster só decide as divisas
    # INTERNAS: as classes viram uma partição EXATA do talhão (faces do arranjo
    # células+talhão; faixas de borda/nodata vão para a vizinha de maior divisa)
    # e a cobertura é simplificada com simplify_boundary=False — as arestas
    # internas (escadinha das células) são suavizadas como UMA linha só por
    # divisa e o contorno do talhão fica EXATAMENTE o cadastrado (sem pixels).
    dx_m = abs(dx) * 111320.0 * math.cos(math.radians(lat0))
    dy_m = abs(dy) * 110540.0
    zonas_finais: list[tuple[int, Any]] = []   # (rank, geometria em graus)
    if poly is not None and por_rank:
        ranks_pr = [r for r, _ in por_rank]
        zl = [_dissolver(_so_poligonos(_tf_local(g, lon0, lat0))) for _, g in por_rank]
        poly_loc = shapely.make_valid(_tf_local(poly, lon0, lat0))
        zl, _st = _montar_particao(zl, ranks_pr, poly_loc)
        if hasattr(shapely, "coverage_simplify"):
            try:
                zl = list(shapely.coverage_simplify(zl, min(dx_m, dy_m) * 0.5, simplify_boundary=False))
            except Exception:
                pass
        zonas_finais = [(r, _tf_geo(shapely.make_valid(g), lon0, lat0)) for r, g in zip(ranks_pr, zl)]
    else:
        # sem polígono do talhão: mantém a malha (contorno = borda das células)
        geoms = [g for _, g in por_rank]
        if geoms and hasattr(shapely, "coverage_simplify"):
            try:
                geoms = list(shapely.coverage_simplify(geoms, dx * 0.5, simplify_boundary=False))
            except Exception:
                pass
        zonas_finais = [(r, g) for (r, _), g in zip(por_rank, geoms)]

    zonas = []  # (rank_do_potencial, areaHa, geometria contígua)
    for r, geom in zonas_finais:
        if geom is None or geom.is_empty:
            continue
        # IDENTIDADE ÚNICA: cada parte CONTÍGUA da classe vira uma zona própria
        # (o potencial Alta/Médio/Baixo fica como atributo, não como identidade).
        partes = list(geom.geoms) if geom.geom_type in ("MultiPolygon", "GeometryCollection") else [geom]
        for p in partes:
            if p.is_empty or p.geom_type not in ("Polygon", "MultiPolygon"):
                continue
            zonas.append((r, _area_ha(p, lon0, lat0), p))

    # Numeração única: por potencial (Alta primeiro) e, dentro, maior área primeiro.
    zonas.sort(key=lambda z: (z[0], -z[1]))
    features = []
    for num, (rank, area, p) in enumerate(zonas, start=1):
        rotulo = rotulos[rank] if rank < len(rotulos) else f"Classe {rank + 1}"
        features.append({
            "type": "Feature",
            "properties": {"id": f"{num:02d}", "potencialRank": int(rank), "classe": rotulo, "areaHa": round(area, 2)},
            "geometry": mapping(p),
        })

    return {
        "type": "FeatureCollection",
        "features": features,
        "stats": {
            "algoritmo": algoritmo,
            "n_classes": len(presentes),   # nº de POTENCIAIS (classes de similaridade)
            "n_zonas": len(features),       # nº de zonas únicas (manchas contíguas)
            "n_pixels": int(idx.shape[0]),
            "n_camadas": len(camadas),
            "area_min_ha": area_min_ha,
            "ordem_por": ordem_por,
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# SUAVIZAÇÃO TOPOLÓGICA dos limites das zonas (S1) — pós-processamento OPCIONAL
# sobre o FeatureCollection já gerado/salvo. NÃO mexe no raster nem nas classes:
# só na geometria final, a pedido do usuário.
#
# Estratégia: as zonas são tratadas como uma COBERTURA (partição do talhão).
# 1. valida (make_valid) e reconstrói a partição (polygonize das bordas +
#    atribuição de cada face à zona de maior interseção) — sobreposições e
#    vãos-sliver herdados são corrigidos por construção;
# 2. absorve fragmentos pequenos/estreitos no vizinho de maior borda (opcional);
# 3. extrai as ARESTAS do arranjo (cada divisa é UMA linha só, partilhada
#    pelas duas zonas) e suaviza cada aresta UMA única vez:
#    Douglas-Peucker (remove excesso de vértices) + Chaikin (arredonda cantos),
#    com os NÓS (junções de 3+ zonas / encontro com o contorno) fixos;
# 4. re-polygoniza e re-atribui — a divisa suavizada serve às duas zonas,
#    logo NÃO nascem sobreposições nem vazios;
# 5. recorta/preserva o contorno externo do talhão (padrão: intocado).
# Tolerâncias em METROS num plano local equirretangular (como o resto do módulo).

RUIDO_M2 = 250.0          # partes menores que isto são SEMPRE ruído de vetorização
# Tolerância da validação de cobertura: |união das zonas − talhão| tem de ficar
# abaixo disto (m²) — acima é erro de reconstrução e o resultado NÃO é devolvido.
COBERTURA_TOL_M2 = 5.0

# Níveis simples → (fator sobre o passo mediano da borda, iterações de Chaikin)
NIVEIS_SUAVIZACAO = {"leve": (0.8, 1), "moderado": (1.6, 2), "intenso": (2.4, 3)}


def _fatores_local(lat0: float):
    return 111320.0 * math.cos(math.radians(lat0)), 110540.0


def _tf_local(geom, lon0: float, lat0: float):
    kx, ky = _fatores_local(lat0)
    return shapely.transform(geom, lambda a: np.column_stack(((a[:, 0] - lon0) * kx, (a[:, 1] - lat0) * ky)))


def _tf_geo(geom, lon0: float, lat0: float):
    kx, ky = _fatores_local(lat0)
    return shapely.transform(geom, lambda a: np.column_stack((a[:, 0] / kx + lon0, a[:, 1] / ky + lat0)))


def _so_poligonos(geom) -> list:
    if geom is None or geom.is_empty:
        return []
    t = geom.geom_type
    if t == "Polygon":
        return [geom]
    if t == "MultiPolygon":
        return list(geom.geoms)
    if t == "GeometryCollection":
        out = []
        for g in geom.geoms:
            out.extend(_so_poligonos(g))
        return out
    return []


def _multi(polys: list):
    polys = [p for p in polys if p and not p.is_empty]
    if not polys:
        return shapely.Polygon()
    return polys[0] if len(polys) == 1 else shapely.MultiPolygon(polys)


def _dissolver(partes: list):
    """União poligonal LIMPA de partes possivelmente ADJACENTES (faces que
    compartilham aresta). Nunca devolve GeometryCollection — era isso que
    quebrava a extração de arestas (boundary=None) em talhões irregulares:
    MultiPolygon de faces vizinhas é INVÁLIDO e o make_valid vira collection."""
    partes = [p for p in partes if p is not None and not p.is_empty]
    if not partes:
        return shapely.Polygon()
    return _multi(_so_poligonos(shapely.make_valid(shapely.union_all(partes))))


def _borda(geom):
    """boundary defensivo: GeometryCollection/vazios devolvem linha vazia."""
    try:
        b = geom.boundary
        return b if b is not None else shapely.LineString()
    except Exception:
        return shapely.LineString()


def _n_vertices(geom) -> int:
    n = 0
    for p in _so_poligonos(geom):
        n += len(p.exterior.coords) + sum(len(r.coords) for r in p.interiors)
    return n


def _passo_mediano_bordas(geoms: list) -> float:
    """Comprimento mediano (m) dos segmentos das bordas — o 'passo' da vetorização."""
    ds = []
    for g in geoms:
        for p in _so_poligonos(g):
            for ring in [p.exterior, *p.interiors]:
                c = np.asarray(ring.coords)
                if len(c) > 1:
                    ds.append(np.hypot(np.diff(c[:, 0]), np.diff(c[:, 1])))
    if not ds:
        return 5.0
    todos = np.concatenate(ds)
    todos = todos[todos > 1e-9]
    return float(np.median(todos)) if todos.size else 5.0


def _chaikin(c: np.ndarray, iters: int, fechada: bool) -> np.ndarray:
    """Corte de cantos de Chaikin. Aberta: extremos FIXOS (preserva os nós)."""
    for _ in range(max(0, int(iters))):
        if len(c) < 3:
            break
        if fechada:
            P = c[:-1]
            q = np.empty((len(P) * 2, 2))
            q[0::2] = 0.75 * P + 0.25 * np.roll(P, -1, axis=0)
            q[1::2] = 0.25 * P + 0.75 * np.roll(P, -1, axis=0)
            c = np.vstack([q, q[:1]])
        else:
            q = np.empty(((len(c) - 1) * 2, 2))
            q[0::2] = 0.75 * c[:-1] + 0.25 * c[1:]
            q[1::2] = 0.25 * c[:-1] + 0.75 * c[1:]
            c = np.vstack([c[:1], q, c[-1:]])
    return c


def _suavizar_aresta(linha, tol: float, iters: int):
    """Simplifica (DP) + arredonda (Chaikin) UMA aresta, nós fixos. A tolerância
    EFETIVA é limitada pelo tamanho da aresta: uma divisa curta ou um anel
    pequeno (zona-ilha) nunca são engolidos pela tolerância global."""
    fechada = bool(linha.is_ring)
    minimo = 4 if fechada else 2
    eff = min(tol, linha.length / (8.0 if fechada else 4.0))
    if eff <= 0:
        return linha
    g = linha.simplify(eff, preserve_topology=False)
    c = np.asarray(g.coords)
    if len(c) < minimo:
        c = np.asarray(linha.coords)
    c = _chaikin(c, iters, fechada)
    out = shapely.LineString(c)
    poda = out.simplify(max(eff * 0.15, 0.05), preserve_topology=False)
    if len(poda.coords) >= minimo:
        out = poda
    if fechada and (len(out.coords) < 4 or shapely.Polygon(out).area < 1.0):
        return linha  # o anel degeneraria: mantém o original
    return out


def _arestas_do_arranjo(zonas_geoms: list):
    """União das bordas da partição → arestas fundidas (quebradas nos nós)."""
    linhas = [_borda(g) for g in zonas_geoms if g and not g.is_empty]
    if not linhas:
        return []
    fundidas = shapely.line_merge(shapely.union_all(linhas))
    return [ln for ln in _so_linhas(fundidas) if ln.length > 0]


def _so_linhas(geom) -> list:
    if geom is None or geom.is_empty:
        return []
    t = geom.geom_type
    if t == "LineString":
        return [geom]
    if t in ("MultiLineString", "GeometryCollection"):
        out = []
        for g in geom.geoms:
            out.extend(_so_linhas(g))
        return out
    return []


def _polygonizar(linhas: list) -> list:
    arranjo = shapely.union_all(linhas)          # noda interseções/cruzamentos
    partes = _so_linhas(arranjo)
    if not partes:
        return []
    faces = shapely.polygonize(partes)
    return _so_poligonos(faces)


def _atribuir_faces(faces: list, zonas_geoms: list, moldura) -> list[int]:
    """Dona de cada face: zona que contém o ponto representativo; senão a de
    maior interseção. -1 = sem dona (vão); -2 = fora da moldura (descarta)."""
    donos = []
    for f in faces:
        rp = f.representative_point()
        if moldura is not None and not moldura.intersects(rp):
            donos.append(-2)
            continue
        dono = -1
        for i, zg in enumerate(zonas_geoms):
            if zg is not None and not zg.is_empty and zg.contains(rp):
                dono = i
                break
        if dono < 0:
            melhor = 0.0
            for i, zg in enumerate(zonas_geoms):
                if zg is None or zg.is_empty:
                    continue
                a = f.intersection(zg).area
                if a > melhor:
                    melhor, dono = a, i
            if dono >= 0 and melhor < f.area * 1e-6:
                dono = -1
        donos.append(dono)
    return donos


def _vizinha_de(parte, zonas_geoms: list, eu: int, ranks: list) -> int:
    """Vizinha de MAIOR borda compartilhada; empate → classe mais próxima."""
    melhor_len, melhor_dr, dono = 0.0, 1e18, -1
    borda_p = _borda(parte)
    for j, zg in enumerate(zonas_geoms):
        if j == eu or zg is None or zg.is_empty:
            continue
        try:
            comum = borda_p.intersection(_borda(zg))
            L = float(comum.length)
        except Exception:
            continue
        if L <= 0:
            continue
        dr = abs(ranks[j] - ranks[eu]) if eu >= 0 else 0
        if L > melhor_len * (1 + 1e-9) or (abs(L - melhor_len) <= melhor_len * 1e-9 + 1e-9 and dr < melhor_dr):
            melhor_len, melhor_dr, dono = L, dr, j
    return dono


def _mais_proxima(parte, zonas_geoms: list) -> int:
    """Zona espacialmente mais próxima (fallback quando não há borda comum)."""
    melhor, dono = math.inf, -1
    for j, zg in enumerate(zonas_geoms):
        if zg is None or zg.is_empty:
            continue
        try:
            d = float(parte.distance(zg))
        except Exception:
            continue
        if d < melhor:
            melhor, dono = d, j
    return dono


def _atribuir_e_montar(faces: list, zonas_ref: list, ranks: list, moldura):
    """Atribui cada face a UMA zona (referência `zonas_ref`) e dissolve por zona.
    TODAS as faces dentro da moldura acabam com dona (vizinha de maior borda,
    iterativo; ilhadas → zona mais próxima) — a união das zonas vira EXATAMENTE
    a moldura: nenhum vazio, nenhuma zona fora. Devolve (novas, vaos_m2)."""
    donos = _atribuir_faces(faces, zonas_ref, moldura)
    por_zona: list[list] = [[] for _ in zonas_ref]
    pendentes = []
    for f, d in zip(faces, donos):
        if d >= 0:
            por_zona[d].append(f)
        elif d == -1:
            pendentes.append(f)

    vaos_m2 = 0.0
    atuais = [_dissolver(ps) for ps in por_zona]
    for _ in range(30):                      # vão encostado só em vão: iterativo
        if not pendentes:
            break
        restantes, progrediu = [], False
        for f in pendentes:
            d = _vizinha_de(f, atuais, -1, ranks)
            if d >= 0:
                por_zona[d].append(f)
                atuais[d] = _dissolver([atuais[d], f])
                vaos_m2 += f.area
                progrediu = True
            else:
                restantes.append(f)
        pendentes = restantes
        if not progrediu:
            break
    for f in pendentes:                      # sem borda comum: mais próxima
        d = _mais_proxima(f, atuais)
        if d >= 0:
            por_zona[d].append(f)
            vaos_m2 += f.area

    return [_dissolver(ps) for ps in por_zona], vaos_m2


def _montar_particao(zonas_geoms: list, ranks: list, moldura):
    """Reparte o plano nas faces do arranjo das bordas (zonas + moldura) e
    atribui cada face a UMA zona — corrige sobreposições e vãos herdados e
    garante que a união das zonas = moldura (o raster NUNCA define o contorno
    externo; faixas de borda/nodata vão para a vizinha de maior divisa)."""
    linhas = [_borda(g) for g in zonas_geoms if g and not g.is_empty]
    if moldura is not None:
        linhas.append(_borda(moldura))
    faces = _polygonizar(linhas)
    if not faces:
        raise ValueError("geometria de entrada inválida (não foi possível decompor as zonas em faces)")
    novas, vaos_m2 = _atribuir_e_montar(faces, zonas_geoms, ranks, moldura)
    return novas, {"vaosCorrigidosM2": vaos_m2}


def _absorver_fragmentos(zonas_geoms: list, ranks: list, frag_min_m2: float, largura_min_m: float):
    """Partes pequenas (< frag_min_m2) e trechos estreitos (< largura_min_m)
    trocam de dona (vizinha de maior borda; empate → classe mais próxima).
    Sempre absorve ruído de vetorização (< RUIDO_M2). Partição preservada."""
    piso = max(RUIDO_M2, float(frag_min_m2 or 0.0))
    n_inc, area_inc = 0, 0.0
    for _ in range(3):  # re-avalia: uma absorção pode criar nova adjacência
        mudou = False
        for i in range(len(zonas_geoms)):
            g = zonas_geoms[i]
            if g is None or g.is_empty:
                continue
            pedacos = []
            for p in _so_poligonos(g):
                if p.area < piso:
                    pedacos.append(p)
                    continue
                if largura_min_m and largura_min_m > 0:
                    abertura = p.buffer(-largura_min_m / 2.0, join_style=2).buffer(largura_min_m / 2.0, join_style=2)
                    estreitos = [q for q in _so_poligonos(p.difference(abertura)) if q.area > 1.0]
                    pedacos.extend(estreitos)
            for q in pedacos:
                d = _vizinha_de(q, zonas_geoms, i, ranks)
                if d < 0:
                    continue
                zonas_geoms[i] = _dissolver(_so_poligonos(zonas_geoms[i].difference(q)))
                zonas_geoms[d] = _dissolver([zonas_geoms[d], q])
                n_inc += 1
                area_inc += q.area
                mudou = True
        if not mudou:
            break
    return n_inc, area_inc

def suavizar_zonas(fc: dict, polygon_geojson: dict | None = None, nivel: str = "moderado",
                   tolerancia_m: float | None = None, iteracoes: int | None = None,
                   frag_min_ha: float = 0.0, largura_min_m: float = 0.0,
                   manter_limite_externo: bool = True) -> dict[str, Any]:
    """Suaviza SOMENTE as divisões internas entre as zonas. REGRAS FIXAS:
    o limite externo vem do polígono oficial do talhão (nunca do raster, nunca
    suavizado — `manter_limite_externo` é aceito por compatibilidade mas
    ignorado: é sempre True); a união das zonas = talhão (sem vazio, sem zona
    fora, faixas sem dado vão para a vizinha); divisa = mesma linha para as
    duas vizinhas. Valida a cobertura antes de devolver {fc, diff, resumo}."""
    del manter_limite_externo  # regra fixa: o contorno oficial NUNCA é alterado
    feats = [f for f in (fc.get("features") or [])
             if f.get("geometry") and f["geometry"].get("type") in ("Polygon", "MultiPolygon")]
    if len(feats) == 0:
        raise ValueError("geometria de entrada inválida: nenhuma zona poligonal no FeatureCollection")

    # 1) valida + projeta para o plano métrico local
    geos = [shapely.make_valid(shape(f["geometry"])) for f in feats]
    todas = shapely.union_all(geos)
    minx, miny, maxx, maxy = todas.bounds
    lon0, lat0 = (minx + maxx) / 2.0, (miny + maxy) / 2.0
    zonas_loc = [_dissolver(_so_poligonos(_tf_local(g, lon0, lat0))) for g in geos]
    ranks = [int((f.get("properties") or {}).get("potencialRank") or 0) for f in feats]
    ids = [str((f.get("properties") or {}).get("id") or str(i + 1)) for i, f in enumerate(feats)]

    poly_loc = None
    if polygon_geojson:
        try:
            poly_loc = shapely.make_valid(_tf_local(shape(polygon_geojson), lon0, lat0))
        except Exception as ex:
            raise ValueError(f"polígono do talhão inválido: {ex}")
        if poly_loc.is_empty:
            raise ValueError("polígono do talhão inválido (vazio)")

    # métricas de entrada (antes de qualquer correção)
    area_zonas_entrada = sum(sum(p.area for p in _so_poligonos(g)) for g in zonas_loc)
    vert_antes = [_n_vertices(g) for g in zonas_loc]
    sobre_antes = 0.0
    for i in range(len(zonas_loc)):
        for j in range(i + 1, len(zonas_loc)):
            inter = zonas_loc[i].intersection(zonas_loc[j])
            if not inter.is_empty:
                sobre_antes += sum(p.area for p in _so_poligonos(inter))

    passo = _passo_mediano_bordas(zonas_loc)
    fator, it_padrao = NIVEIS_SUAVIZACAO.get(nivel, NIVEIS_SUAVIZACAO["moderado"])
    if nivel == "personalizado" and tolerancia_m is not None:
        tol = float(tolerancia_m)
    else:
        tol = fator * passo
    tol = min(max(tol, 0.5), 50.0)
    iters = int(iteracoes) if (nivel == "personalizado" and iteracoes is not None) else it_padrao
    iters = min(max(iters, 0), 5)

    # 2) partição EXATA: união das zonas = talhão (corrige sobreposição/vão e
    #    contorno pixelado herdados; faixas sem dado → vizinha de maior divisa)
    zonas_loc, st_part = _montar_particao(zonas_loc, ranks, poly_loc)
    area_antes = [sum(p.area for p in _so_poligonos(g)) for g in zonas_loc]

    # 3) fragmentos / estreitos (opcional — ruído de vetorização sempre sai)
    n_frag, area_frag = _absorver_fragmentos(zonas_loc, ranks, frag_min_ha * 10000.0, largura_min_m)

    # 4) suaviza SÓ as arestas INTERNAS (cada divisa uma vez, nós fixos). O
    #    contorno externo (talhão oficial — ou, sem talhão, a borda da própria
    #    cobertura) fica intacto SEMPRE.
    eps_ext = max(passo * 0.02, 0.05)
    if poly_loc is not None:
        faixa_ext = _borda(poly_loc).buffer(eps_ext)
    else:
        faixa_ext = _borda(shapely.union_all([g for g in zonas_loc if not g.is_empty])).buffer(eps_ext)
    arestas = _arestas_do_arranjo(zonas_loc)
    if not arestas:
        raise ValueError("não foi possível extrair as linhas internas das zonas")
    novas_linhas = []
    for a in arestas:
        if a.within(faixa_ext):
            novas_linhas.append(a)          # limite externo: SEMPRE intocado
        else:
            novas_linhas.append(_suavizar_aresta(a, tol, iters))

    # 5) re-polygoniza e re-atribui (divisa única ⇒ sem sobreposição/vão)
    try:
        faces2 = _polygonizar(novas_linhas)
    except Exception as ex:
        raise ValueError(f"não foi possível reconstruir as linhas internas: {ex}")
    if not faces2:
        raise ValueError("não foi possível reconstruir as linhas internas "
                         "(tolerância incompatível com o tamanho das zonas)")
    suaves, _vaos2 = _atribuir_e_montar(faces2, zonas_loc, ranks, poly_loc)

    # 6) VALIDAÇÃO DA COBERTURA (obrigatória): união das zonas = talhão; sem
    #    sobreposição; sem geometria inválida. Falhou → NÃO devolve resultado.
    for g in suaves:
        if not g.is_valid:
            raise ValueError("erro na reconstrução topológica: geometria final inválida")
    sobre_depois = 0.0
    for i in range(len(suaves)):
        for j in range(i + 1, len(suaves)):
            inter = suaves[i].intersection(suaves[j])
            if not inter.is_empty:
                sobre_depois += sum(p.area for p in _so_poligonos(inter))
    if sobre_depois > COBERTURA_TOL_M2:
        raise ValueError(f"erro na reconstrução topológica: sobreposição residual de {sobre_depois:.1f} m²")
    uni_final = shapely.union_all([g for g in suaves if not g.is_empty])
    alvo = poly_loc if poly_loc is not None else shapely.union_all([g for g in zonas_loc if not g.is_empty])
    dif_cobertura = sum(p.area for p in _so_poligonos(alvo.symmetric_difference(uni_final)))
    if dif_cobertura > max(COBERTURA_TOL_M2, alvo.area * 1e-6):
        raise ValueError("erro na reconstrução topológica: a união das zonas não fecha com o "
                         f"limite do talhão (diferença de {dif_cobertura:.1f} m²)")

    # métricas por zona
    zonas_incorporadas, zonas_perdidas = [], []
    por_zona_resumo = []
    total_antes = total_depois = 0.0
    desloc_max = 0.0
    for i, (g0, g1) in enumerate(zip(zonas_loc, suaves)):
        a0, a1 = area_antes[i], sum(p.area for p in _so_poligonos(g1))
        total_antes += a0
        total_depois += a1
        if a1 <= 1.0 and a0 > 1.0:
            (zonas_incorporadas if (frag_min_ha > 0 or largura_min_m > 0) else zonas_perdidas).append(ids[i])
        desloc = 0.0
        if a0 > 1.0 and a1 > 1.0:
            try:
                desloc = float(shapely.hausdorff_distance(_borda(g0), _borda(g1)))
            except Exception:
                desloc = 0.0
        desloc_max = max(desloc_max, desloc)
        por_zona_resumo.append({
            "id": ids[i],
            "areaAntesHa": round(a0 / 10000.0, 4),
            "areaDepoisHa": round(a1 / 10000.0, 4),
            "diffHa": round((a1 - a0) / 10000.0, 4),
            "diffPct": round(((a1 - a0) / a0 * 100.0) if a0 > 0 else 0.0, 2),
            "vertAntes": vert_antes[i],
            "vertDepois": _n_vertices(g1),
            "deslocMaxM": round(desloc, 1),
        })

    # destaque das ÁREAS ALTERADAS (diferença simétrica, dissolvida)
    diffs = []
    for g0, g1 in zip(zonas_loc, suaves):
        try:
            d = g0.symmetric_difference(g1)
        except Exception:
            continue
        diffs.extend(p for p in _so_poligonos(d) if p.area > 1.0)
    diff_geo = []
    if diffs:
        dis = shapely.union_all(diffs).simplify(0.3, preserve_topology=True)
        diff_geo = [{"type": "Feature", "properties": {"areaM2": round(p.area, 1)},
                     "geometry": mapping(_tf_geo(p, lon0, lat0))}
                    for p in _so_poligonos(dis) if p.area > 1.0]

    # 7) monta o FC final (propriedades preservadas; areaHa recalculada)
    features = []
    for i, f in enumerate(feats):
        g1 = suaves[i]
        if g1.is_empty:
            continue
        geo = _tf_geo(g1, lon0, lat0)
        props = dict(f.get("properties") or {})
        props["areaHa"] = round(_area_ha(geo, lon0, lat0), 2)
        features.append({"type": "Feature", "properties": props, "geometry": mapping(geo)})

    # validação de área p/ a interface (§7): talhão × soma das zonas
    area_alvo = alvo.area
    dif_ha = (total_depois - area_alvo) / 10000.0
    maior_diff = max((abs(z["diffPct"]) for z in por_zona_resumo if z["areaAntesHa"] > 0), default=0.0)
    return {
        "fc": {"type": "FeatureCollection", "features": features},
        "diff": {"type": "FeatureCollection", "features": diff_geo},
        "resumo": {
            "nivel": nivel,
            "passoM": round(passo, 2),
            "toleranciaM": round(tol, 2),
            "iteracoes": iters,
            "manterLimiteExterno": True,   # regra fixa (compatibilidade)
            "fragMinHa": frag_min_ha,
            "larguraMinM": largura_min_m,
            "areaAntesHa": round(total_antes / 10000.0, 2),
            "areaDepoisHa": round(total_depois / 10000.0, 2),
            "diffTotalHa": round((total_depois - total_antes) / 10000.0, 3),
            "maiorDiffPct": round(maior_diff, 2),
            "deslocMaxM": round(desloc_max, 1),
            "vertAntes": int(sum(vert_antes)),
            "vertDepois": int(sum(_n_vertices(g) for g in suaves)),
            "sobreposicaoCorrigidaHa": round(sobre_antes / 10000.0, 4),
            "vaosCorrigidosHa": round(st_part["vaosCorrigidosM2"] / 10000.0, 4),
            "areaZonasEntradaHa": round(area_zonas_entrada / 10000.0, 2),
            "areaTalhaoHa": round(area_alvo / 10000.0, 2) if poly_loc is not None else None,
            "difTalhaoHa": round(dif_ha, 3),
            "difTalhaoPct": round((total_depois - area_alvo) / area_alvo * 100.0, 3) if area_alvo > 0 else 0.0,
            "fragmentosIncorporados": n_frag,
            "fragmentosAreaHa": round(area_frag / 10000.0, 4),
            "zonasIncorporadas": zonas_incorporadas,
            "zonasPerdidas": zonas_perdidas,
            "porZona": por_zona_resumo,
        },
    }
