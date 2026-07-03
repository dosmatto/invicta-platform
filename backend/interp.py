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
# Teto de resolucao da malha (por lado) para proteger memoria/CPU
MAX_CELLS = 500
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
VERSION = "interp-15-fcm-rapido"


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
               metodo: str = "krige", modelo_fixo: str | None = None) -> dict[str, Any]:
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
               modelo_fixo: str | None = None) -> dict[str, Any]:
    g = gerar_grid(points, polygon_geojson, pixel_m, metodo, modelo_fixo)
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

    zonas = []  # (rank_do_potencial, areaHa, geometria contígua)
    for r, k in enumerate(presentes):
        jj, ii = np.where(cls == k)
        if jj.size == 0:
            continue
        boxes = shapely.box(ex[ii], ey[jj], ex[ii + 1], ey[jj + 1])
        geom = shapely.union_all(boxes, grid_size=grid_snap)
        if poly is not None:
            geom = geom.intersection(poly)
        if geom.is_empty:
            continue
        geom = geom.simplify(dx * 0.5, preserve_topology=True)
        if geom.is_empty:
            continue
        # IDENTIDADE ÚNICA: cada parte CONTÍGUA da classe vira uma zona própria
        # (o potencial Alta/Médio/Baixo fica como atributo, não como identidade).
        partes = list(geom.geoms) if geom.geom_type == "MultiPolygon" else [geom]
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
