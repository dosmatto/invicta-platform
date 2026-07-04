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

VERSION = "mde-2-analise"

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


# ════════════════════════════════════════════════════════════ F2 + F3
# Derivados topograficos (aspecto, curvaturas, TPI, TRI, fluxo) e analise
# agronomica (TWI, LS Factor, drenagem, classes topograficas). Tudo derivado
# do MESMO grid bufferizado da F1; recorte no poligono so no final.

import heapq

from scipy import ndimage as _ndi

# Sensibilidade da rede de drenagem (spec 7.7) -> area contribuinte minima (ha)
LIMIAR_DRENAGEM_HA = {"baixa": 2.0, "media": 0.75, "alta": 0.25}

# Classes topograficas (spec 8.1) — codigo, nome, cor (contrato com o front)
CLASSES_TOPO = [
    (1, "Topo", "#8D6E63"),
    (2, "Ombro", "#FFB74D"),
    (3, "Meia encosta", "#FFF176"),
    (4, "Baixada", "#81C784"),
    (5, "Depressao", "#4FC3F7"),
    (6, "Linha de fluxo", "#1565C0"),
    (7, "Risco de erosao", "#E53935"),
]

_VIZ = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def _fill_sinks(z: np.ndarray) -> np.ndarray:
    """Preenche depressoes (priority-flood + epsilon) p/ o fluxo nao morrer em
    pocos de ruido do MDE (spec 24.2). NaN = fora (saida livre)."""
    rows, cols = z.shape
    filled = z.copy()
    nanm = ~np.isfinite(z)
    fechado = nanm.copy()
    # sementes: borda do grid + vizinhos de NaN (saidas)
    semente = np.zeros_like(fechado)
    semente[0, :] = semente[-1, :] = True
    semente[:, 0] = semente[:, -1] = True
    semente |= _ndi.binary_dilation(nanm)
    semente &= ~nanm
    heap = []
    for r, c in zip(*np.nonzero(semente)):
        heap.append((float(filled[r, c]), int(r), int(c)))
        fechado[r, c] = True
    heapq.heapify(heap)
    EPS = 1e-3
    while heap:
        zc, r, c = heapq.heappop(heap)
        for dr, dc in _VIZ:
            nr, nc = r + dr, c + dc
            if nr < 0 or nc < 0 or nr >= rows or nc >= cols or fechado[nr, nc]:
                continue
            fechado[nr, nc] = True
            if filled[nr, nc] <= zc:
                filled[nr, nc] = zc + EPS
            heapq.heappush(heap, (float(filled[nr, nc]), nr, nc))
    return filled


def _d8_e_acumulo(filled: np.ndarray, px_x: float, px_y: float) -> np.ndarray:
    """Direcao D8 (maior declive) + acumulo de fluxo (nº de celulas que drenam
    para cada uma, incluindo ela mesma). NaN fora."""
    rows, cols = filled.shape
    z = np.where(np.isfinite(filled), filled, np.inf)
    melhor_decl = np.full(filled.shape, -np.inf)
    rec = np.full(filled.shape, -1, dtype=np.int64)  # indice linear do receptor
    diag = math.hypot(px_x, px_y)
    dist = {(-1, -1): diag, (-1, 0): px_y, (-1, 1): diag, (0, -1): px_x,
            (0, 1): px_x, (1, -1): diag, (1, 0): px_y, (1, 1): diag}
    idx = np.arange(rows * cols).reshape(rows, cols)
    for dr, dc in _VIZ:
        zn = np.full_like(z, np.inf)
        rs = slice(max(0, dr), rows + min(0, dr))
        cs = slice(max(0, dc), cols + min(0, dc))
        rs2 = slice(max(0, -dr), rows + min(0, -dr))
        cs2 = slice(max(0, -dc), cols + min(0, -dc))
        zn[rs2, cs2] = z[rs, cs]
        decl = (z - zn) / dist[(dr, dc)]
        ok = decl > melhor_decl
        melhor_decl = np.where(ok, decl, melhor_decl)
        alvo = np.full_like(idx, -1)
        alvo[rs2, cs2] = idx[rs, cs]
        rec = np.where(ok, alvo, rec)
    rec[melhor_decl <= 0] = -1          # pit/saida (apos fill so na borda)
    rec[~np.isfinite(filled)] = -1

    acc = np.where(np.isfinite(filled), 1.0, np.nan).ravel()
    ordem = np.argsort(-np.where(np.isfinite(filled), filled, -np.inf).ravel(), kind="stable")
    recf = rec.ravel()
    for i in ordem:
        r_ = recf[i]
        if r_ >= 0 and np.isfinite(acc[i]):
            acc[r_] += acc[i]
    return acc.reshape(rows, cols)


def _shifts9(z: np.ndarray) -> list[np.ndarray]:
    """z1..z9 (janela 3x3, borda replicada): [NW,N,NE,W,C,E,SW,S,SE]."""
    zp = np.pad(z, 1, mode="edge")
    return [zp[0:-2, 0:-2], zp[0:-2, 1:-1], zp[0:-2, 2:],
            zp[1:-1, 0:-2], zp[1:-1, 1:-1], zp[1:-1, 2:],
            zp[2:, 0:-2], zp[2:, 1:-1], zp[2:, 2:]]


def _curvaturas(z: np.ndarray, L: float):
    """Zevenbergen & Thorne: (perfil, plano, geral). Convencao devolvida:
    perfil > 0 = CONVEXA (acelera fluxo); plano > 0 = DIVERGENTE (dispersa)."""
    z1, z2, z3, z4, z5, z6, z7, z8, z9 = _shifts9(z)
    D = ((z4 + z6) / 2.0 - z5) / (L * L)
    E = ((z2 + z8) / 2.0 - z5) / (L * L)
    F = (-z1 + z3 + z7 - z9) / (4.0 * L * L)
    G = (-z4 + z6) / (2.0 * L)
    H = (z2 - z8) / (2.0 * L)
    den = G * G + H * H
    com = den > 1e-12
    # Sinais AJUSTADOS à convenção do módulo (validada por sintéticos: morro
    # convexo → perfil>0 e plano>0/divergente; tigela → negativos).
    perfil = np.where(com, -2.0 * (D * G * G + E * H * H + F * G * H) / np.where(com, den, 1.0), 0.0)
    plano = np.where(com, -2.0 * (D * H * H + E * G * G - F * G * H) / np.where(com, den, 1.0), 0.0)
    geral = -2.0 * (D + E)
    return perfil.astype("float32"), plano.astype("float32"), geral.astype("float32")


def _media_movel_nan(z: np.ndarray, k: int) -> np.ndarray:
    """Media em janela k x k ignorando NaN (uniform_filter em soma+contagem)."""
    v = np.nan_to_num(z, nan=0.0)
    m = np.isfinite(z).astype("float64")
    soma = _ndi.uniform_filter(v, size=k, mode="nearest")
    cont = _ndi.uniform_filter(m, size=k, mode="nearest")
    return np.where(cont > 1e-9, soma / np.maximum(cont, 1e-9), np.nan)


def _clip_simetrico(a: np.ndarray, p: float = 97.0) -> np.ndarray:
    """Clipa em +-percentil(|a|) e GARANTE range simetrico (0 fica no centro do
    stretch min-max do front)."""
    fin = a[np.isfinite(a)]
    if fin.size == 0:
        return a
    lim = float(np.percentile(np.abs(fin), p))
    if lim <= 0:
        lim = 1e-6
    out = np.clip(a, -lim, lim)
    # forca as pontas p/ o minmax do front ficar simetrico mesmo se um lado nao atingir
    flat = out.ravel()
    fi = np.where(np.isfinite(flat))[0]
    if fi.size >= 2:
        flat[fi[0]] = lim
        flat[fi[1]] = -lim
    return out


def _png_mascara(cor_hex: str, mask: np.ndarray) -> str:
    """PNG de uma mascara booleana numa cor solida (transparente fora)."""
    r, g, b = int(cor_hex[1:3], 16), int(cor_hex[3:5], 16), int(cor_hex[5:7], 16)
    h, w = mask.shape
    img = np.zeros((h, w, 4), dtype=np.uint8)
    img[mask] = [r, g, b, 255]
    buf = io.BytesIO()
    Image.fromarray(img, "RGBA").save(buf, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def _png_classes(cod: np.ndarray) -> str:
    """PNG colorido do grid de codigos das classes topograficas (0=transparente)."""
    h, w = cod.shape
    img = np.zeros((h, w, 4), dtype=np.uint8)
    for codigo, _nome, cor in CLASSES_TOPO:
        m = cod == codigo
        img[m] = [int(cor[1:3], 16), int(cor[3:5], 16), int(cor[5:7], 16), 255]
    buf = io.BytesIO()
    Image.fromarray(img, "RGBA").save(buf, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def _rng(a: np.ndarray) -> list[float]:
    fin = a[np.isfinite(a)]
    if fin.size == 0:
        return [0.0, 0.0]
    return [round(float(np.min(fin)), 3), round(float(np.max(fin)), 3)]


def gerar_analise(poligono: dict, fonte: str = "auto", buffer_m: float = 300.0,
                  sensibilidade: str = "media") -> dict[str, Any]:
    """F2+F3: derivados + analise agronomica numa chamada. Recalcula da FONTE
    (rapido) para ter o buffer; devolve grids Float32 (contrato do interp) +
    PNGs prontos (curvas de nivel, drenagem, classes) + areas por classe."""
    if not _HAS_RASTERIO:
        raise ValueError("rasterio indisponível no servidor — MDE requer rasterio")
    geom = shape(poligono)
    if geom.is_empty:
        raise ValueError("polígono vazio")
    w, s, e, n = geom.bounds
    lat_c = (s + n) / 2.0

    bm = max(120.0, min(float(buffer_m or 300.0), 2000.0))
    dlat = bm / 111320.0
    dlng = bm / (111320.0 * max(0.2, math.cos(math.radians(lat_c))))
    bb = (w - dlng, s - dlat, e + dlng, n + dlat)
    tiles = _tiles_1grau(*bb)

    ordem = ["cop30", "srtm"] if fonte == "auto" else [fonte]
    elev = transform = usado = None
    erros = []
    for f in ordem:
        if f not in FONTES:
            raise ValueError(f"fonte desconhecida: {f}")
        try:
            elev, transform = _ler_fonte(f, tiles, bb)
            usado = f
            break
        except Exception as ex:  # noqa: BLE001
            erros.append(f"{FONTES[f]}: {ex}")
    if elev is None or usado is None:
        raise ValueError("falha ao obter o MDE — " + " | ".join(erros))

    px_x = abs(float(transform.a)) * 111320.0 * math.cos(math.radians(lat_c))
    px_y = abs(float(transform.e)) * 111320.0
    L = (px_x + px_y) / 2.0
    cell_ha = (px_x * px_y) / 10000.0

    # ── derivados no grid BUFFERIZADO ──
    dz_dr, dz_dc = np.gradient(elev, px_y, px_x)
    dz_dy, dz_dx = -dz_dr, dz_dc
    grad = np.hypot(dz_dx, dz_dy)
    decl_g = np.degrees(np.arctan(grad)).astype("float32")

    # aspecto (graus a partir do NORTE, sentido horario; direcao do declive)
    aspecto = (np.degrees(np.arctan2(dz_dx, dz_dy)) + 180.0) % 360.0

    perfil, plano, geral = _curvaturas(np.nan_to_num(elev, nan=float(np.nanmean(elev))), L)

    # TPI (raio ~150 m) e TRI
    k_tpi = max(3, int(round(300.0 / L)) | 1)
    tpi = (elev - _media_movel_nan(elev, k_tpi)).astype("float32")
    zs = _shifts9(np.nan_to_num(elev, nan=float(np.nanmean(elev))))
    tri = (sum(np.abs(zs[i] - zs[4]) for i in (0, 1, 2, 3, 5, 6, 7, 8)) / 8.0).astype("float32")

    # fluxo (fill -> D8 -> acumulo) + TWI + LS
    filled = _fill_sinks(elev)
    acc = _d8_e_acumulo(filled, px_x, px_y)                 # nº de celulas
    a_espec = (acc * px_x * px_y) / L                        # area contribuinte especifica (m²/m)
    tanb = np.maximum(np.tan(np.radians(decl_g)), 0.001)
    twi = np.log(np.maximum(a_espec, L) / tanb).astype("float32")
    sinb = np.sin(np.radians(decl_g))
    ls = ((a_espec / 22.13) ** 0.4 * (sinb / 0.0896) ** 1.3).astype("float32")
    fluxo_log = np.log10(np.maximum(acc, 1.0)).astype("float32")

    # ── recorte final (mesma janela da F1) ──
    inv = ~transform
    c0, r0 = inv * (w, n)
    c1, r1 = inv * (e, s)
    r0i, c0i = max(0, math.floor(r0)), max(0, math.floor(c0))
    r1i, c1i = min(elev.shape[0], math.ceil(r1)), min(elev.shape[1], math.ceil(c1))
    sub = (slice(r0i, r1i), slice(c0i, c1i))
    sw = transform * (c0i, r1i)
    ne = transform * (c1i, r0i)
    bounds = [float(sw[0]), float(sw[1]), float(ne[0]), float(ne[1])]
    shape_sub = (r1i - r0i, c1i - c0i)
    from rasterio.transform import from_bounds as _fb
    mask_t = _fb(bounds[0], bounds[1], bounds[2], bounds[3], shape_sub[1], shape_sub[0])
    dentro = geometry_mask([poligono], out_shape=shape_sub, transform=mask_t, invert=True)

    def rec(a, simetrico=False):
        out = np.where(dentro, a[sub], np.nan).astype("float32")
        return _clip_simetrico(out) if simetrico else out

    aspecto_c = rec(aspecto)
    perfil_c = rec(perfil, simetrico=True)
    plano_c = rec(plano, simetrico=True)
    geral_c = rec(geral, simetrico=True)
    tpi_c = rec(tpi, simetrico=True)
    tri_c = rec(tri)
    fluxo_c = rec(fluxo_log)
    twi_c = rec(twi)
    ls_c = rec(ls)
    decl_c = rec(decl_g)
    acc_c = np.where(dentro, acc[sub], np.nan)

    # ── curvas de nivel (PNG; vetor entra na F4) ──
    elev_c = np.where(dentro, elev[sub], np.nan)
    fin = elev_c[np.isfinite(elev_c)]
    if fin.size == 0:
        raise ValueError("nenhum pixel dentro do polígono")
    ampl = float(np.max(fin) - np.min(fin))
    intervalo = next((iv for iv in (0.5, 1, 2, 5, 10, 20) if ampl / iv <= 15), 25)
    niv = np.floor(elev_c / intervalo)
    le = np.zeros_like(niv, dtype=bool)
    le[:, :-1] |= np.isfinite(niv[:, :-1]) & np.isfinite(niv[:, 1:]) & (niv[:, :-1] != niv[:, 1:])
    le[:-1, :] |= np.isfinite(niv[:-1, :]) & np.isfinite(niv[1:, :]) & (niv[:-1, :] != niv[1:, :])
    png_curvas = _png_mascara("#5D4037", le & dentro)

    # ── rede de drenagem potencial (limiar por sensibilidade; spec 7.7) ──
    lim_ha = LIMIAR_DRENAGEM_HA.get(sensibilidade, LIMIAR_DRENAGEM_HA["media"])
    dren = np.isfinite(acc_c) & ((acc_c * cell_ha) >= lim_ha)
    dren_d = _ndi.binary_dilation(dren) & dentro
    png_dren = _png_mascara("#1565C0", dren_d)

    # ── classes topograficas (spec 8) ──
    tfin = tpi_c[np.isfinite(tpi_c)]
    sd = float(np.std(tfin)) or 1e-6
    tstd = tpi_c / sd
    cod = np.zeros(shape_sub, dtype=np.int16)
    cod[np.isfinite(tstd)] = 3                                   # meia encosta (base)
    cod[(tstd > 0.5) & (tstd <= 1.0)] = 2                        # ombro
    cod[tstd > 1.0] = 1                                          # topo
    cod[(tstd < -0.5) & (tstd >= -1.0)] = 4                      # baixada
    cod[tstd < -1.0] = 5                                         # depressao
    cod[dren] = 6                                                # linha de fluxo
    lsfin = ls_c[np.isfinite(ls_c)]
    if lsfin.size:
        lim_ls = float(np.percentile(lsfin, 85))
        cod[np.isfinite(ls_c) & (ls_c >= lim_ls) & (decl_c >= 4.6)] = 7   # risco de erosao
    cod[~dentro] = 0
    png_classes = _png_classes(cod)

    n_area = int(dentro.sum())
    classes_meta = []
    for codigo, nome, cor in CLASSES_TOPO:
        npx = int((cod == codigo).sum())
        if npx == 0:
            continue
        classes_meta.append({"codigo": codigo, "nome": nome, "cor": cor,
                             "ha": round(npx * cell_ha, 2),
                             "pct": round(100.0 * npx / max(1, n_area), 1)})

    return {
        "fonte": usado, "rotulo": FONTES[usado], "bounds": bounds,
        "shape": [int(shape_sub[0]), int(shape_sub[1])],
        "grids": {
            "aspecto": _b64(aspecto_c), "curv_perfil": _b64(perfil_c),
            "curv_plano": _b64(plano_c), "curv_geral": _b64(geral_c),
            "tpi": _b64(tpi_c), "tri": _b64(tri_c), "fluxo_log": _b64(fluxo_c),
            "twi": _b64(twi_c), "ls": _b64(ls_c),
        },
        "pngs": {"curvas": png_curvas, "drenagem": png_dren, "classes": png_classes},
        "meta": {
            "intervalo_curvas_m": intervalo,
            "limiar_drenagem_ha": lim_ha,
            "cell_ha": round(cell_ha, 4),
            "k_tpi_px": k_tpi,
            "classes": classes_meta,
            "ranges": {
                "aspecto": _rng(aspecto_c), "curv_perfil": _rng(perfil_c),
                "curv_plano": _rng(plano_c), "curv_geral": _rng(geral_c),
                "tpi": _rng(tpi_c), "tri": _rng(tri_c), "fluxo_log": _rng(fluxo_c),
                "twi": _rng(twi_c), "ls": _rng(ls_c),
            },
        },
    }
